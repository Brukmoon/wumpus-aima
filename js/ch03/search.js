/* Chapter 3: problem formulations of a fully observable Wumpus world, and the book's search
 * algorithms written as recorders. Every run returns
 *   { nodes: [...], events: [...], result }
 * where each node remembers when it was added to / popped from the frontier, so the UI can
 * reconstruct the frontier, the explored set and the search tree at any step.
 */
(function (W) {
  'use strict';

  /* ================= Problems ================= */

  /* Route problem: state = square. Actions move N/E/S/W. Goal = the gold square.
   * The simplest formulation: no orientation, no gold-carrying, no return trip. */
  W.RouteProblem = class {
    constructor(spec) {
      this.spec = spec; this.n = spec.size; this.pits = new Set(spec.pits);
      this.name = 'Route to the gold';
      this.initial = { x: 1, y: 1 };
      this.gold = spec.gold ? W.parse(spec.gold) : null;
    }
    key(s) { return s.x + ',' + s.y; }
    isGoal(s) { return !!this.gold && s.x === this.gold[0] && s.y === this.gold[1]; }
    blocked(x, y) { const k = W.key(x, y); return this.pits.has(k) || k === this.spec.wumpus; }
    actions(s) {
      const out = [];
      for (const d of ['N', 'E', 'S', 'W']) {
        const x = s.x + W.DV[d][0], y = s.y + W.DV[d][1];
        if (W.inside(x, y, this.n) && !this.blocked(x, y)) out.push(d);
      }
      return out;
    }
    result(s, a) { return { x: s.x + W.DV[a][0], y: s.y + W.DV[a][1] }; }
    cost() { return 1; }
    cell(s) { return [s.x, s.y]; }
    show(s) { return `[${s.x},${s.y}]`; }
    short(s) { return `${s.x},${s.y}`; }
    stateCount() { return this.n * this.n; }
    allStates() { return W.cells(this.n).map(([x, y]) => ({ x, y })); }
  };

  /* Mission problem: state = (x, y, facing, hasGold, hasArrow, wumpusAlive, climbed).
   * Actions are the real Wumpus actuators. Goal = climbed out with the gold.
   * Moves into a pit or a live wumpus are simply not offered (they end the episode). */
  W.MissionProblem = class {
    constructor(spec) {
      this.spec = spec; this.n = spec.size; this.pits = new Set(spec.pits);
      this.name = 'Full mission';
      this.gold = spec.gold ? W.parse(spec.gold) : null;
      this.wumpus = spec.wumpus ? W.parse(spec.wumpus) : null;
      this.initial = { x: 1, y: 1, d: 'E', g: 0, a: 1, w: this.wumpus ? 1 : 0, c: 0 };
    }
    key(s) { return `${s.x},${s.y},${s.d},${s.g}${s.a}${s.w}${s.c}`; }
    isGoal(s) { return s.c === 1; }
    actions(s) {
      if (s.c) return [];
      const out = [];
      const x = s.x + W.DV[s.d][0], y = s.y + W.DV[s.d][1];
      if (W.inside(x, y, this.n)) {
        const k = W.key(x, y);
        if (!this.pits.has(k) && !(s.w && k === this.spec.wumpus)) out.push('Forward');
      }
      out.push('TurnLeft', 'TurnRight');
      if (!s.g && this.gold && s.x === this.gold[0] && s.y === this.gold[1]) out.push('Grab');
      if (s.a) out.push('Shoot');
      if (s.g && s.x === 1 && s.y === 1) out.push('Climb');
      return out;
    }
    result(s, a) {
      const t = Object.assign({}, s);
      if (a === 'Forward') { t.x += W.DV[s.d][0]; t.y += W.DV[s.d][1]; }
      else if (a === 'TurnLeft') t.d = W.left(s.d);
      else if (a === 'TurnRight') t.d = W.right(s.d);
      else if (a === 'Grab') t.g = 1;
      else if (a === 'Climb') t.c = 1;
      else if (a === 'Shoot') {
        t.a = 0;
        if (s.w && this.wumpus) {
          const [wx, wy] = this.wumpus, [dx, dy] = W.DV[s.d];
          const inLine = dx ? (wy === s.y && Math.sign(wx - s.x) === dx) : (wx === s.x && Math.sign(wy - s.y) === dy);
          if (inLine) t.w = 0;
        }
      }
      return t;
    }
    cost(s, a) { return a === 'Shoot' ? 11 : 1; }
    cell(s) { return [s.x, s.y]; }
    show(s) { return `[${s.x},${s.y}] ${W.ARROW[s.d]}${s.g ? ' gold' : ''}${s.a ? '' : ' no-arrow'}${this.wumpus ? (s.w ? '' : ' W-dead') : ''}${s.c ? ' OUT' : ''}`; }
    short(s) { return `${s.x},${s.y}${W.ARROW[s.d]}${s.g ? '$' : ''}`; }
    stateCount() { return this.n * this.n * 4 * 2 * 2 * (this.wumpus ? 2 : 1) + 1; }
  };

  W.PROBLEMS = {
    route: { label: 'Route to gold: state = (x, y)', make: s => new W.RouteProblem(s) },
    mission: { label: 'Full mission: state = (x, y, facing, gold, arrow, wumpus)', make: s => new W.MissionProblem(s) },
  };

  /* ================= Heuristics ================= */
  function minTurns(dir, dx, dy) {
    const need = [];
    if (dx > 0) need.push('E'); if (dx < 0) need.push('W');
    if (dy > 0) need.push('N'); if (dy < 0) need.push('S');
    if (!need.length) return 0;
    if (need.includes(dir)) return need.length - 1;
    if (need.length === 2) return 2;
    return W.DIRS[(W.DIRS.indexOf(dir) + 2) % 4] === need[0] ? 2 : 1;
  }
  W.HEURISTICS = {
    route: {
      zero: { label: 'h = 0', fn: () => 0 },
      manhattan: { label: 'Manhattan distance to gold', fn: (p, s) => p.gold ? W.manhattan([s.x, s.y], p.gold) : 0 },
      euclid: { label: 'Straight-line distance to gold', fn: (p, s) => p.gold ? Math.hypot(s.x - p.gold[0], s.y - p.gold[1]) : 0 },
      triple: { label: '3 × Manhattan (inadmissible)', fn: (p, s) => p.gold ? 3 * W.manhattan([s.x, s.y], p.gold) : 0 },
    },
    mission: {
      zero: { label: 'h = 0', fn: () => 0 },
      tour: { label: 'Manhattan tour: →gold, grab, →home, climb', fn: (p, s) => {
        if (s.c) return 0;
        if (!p.gold) return 0;
        if (s.g) return W.manhattan([s.x, s.y], [1, 1]) + 1;
        return W.manhattan([s.x, s.y], p.gold) + 1 + W.manhattan(p.gold, [1, 1]) + 1;
      } },
      tourTurns: { label: 'Manhattan tour + minimum turns on current leg', fn: (p, s) => {
        if (s.c || !p.gold) return 0;
        const t = s.g ? [1, 1] : p.gold;
        return W.HEURISTICS.mission.tour.fn(p, s) + minTurns(s.d, t[0] - s.x, t[1] - s.y);
      } },
      triple: { label: '3 × Manhattan tour (inadmissible)', fn: (p, s) => 3 * W.HEURISTICS.mission.tour.fn(p, s) },
    },
  };

  /* ================= Recorder ================= */
  class Rec {
    constructor(problem, h, cap) {
      this.p = problem; this.h = h || (() => 0); this.cap = cap;
      this.nodes = []; this.events = []; this.tree = 0;
      this.expanded = 0; this.generated = 0; this.reachedSize = 0; this.frontierSize = 0; this.maxFrontier = 0;
    }
    node(state, parent, action) {
      const g = parent ? parent.g + this.p.cost(parent.state, action, state) : 0;
      const n = { id: this.nodes.length, state, parent: parent ? parent.id : null, action, g, h: this.h(this.p, state),
        depth: parent ? parent.depth + 1 : 0, tree: this.tree, gen: this.events.length, add: null, pop: Infinity, exp: null };
      n.f = n.g + n.h;
      this.nodes.push(n); this.generated++;
      return n;
    }
    add(n) { n.add = this.events.length; this.frontierSize++; this.maxFrontier = Math.max(this.maxFrontier, this.frontierSize); }
    pop(n) { n.pop = this.events.length; this.frontierSize--; }
    ev(line, node, msg, extra) {
      this.events.push(Object.assign({ line, node: node ? node.id : null, msg, tree: this.tree,
        expanded: this.expanded, generated: this.generated, reached: this.reachedSize, frontier: this.frontierSize }, extra));
      if (this.events.length > this.cap) throw new CapHit();
    }
    *expand(n) {
      n.exp = this.events.length; this.expanded++;
      for (const a of this.p.actions(n.state)) yield this.node(this.p.result(n.state, a), n, a);
    }
    finish(result, status) {
      return { nodes: this.nodes, events: this.events, result: result ? result.id : null, status,
        stats: { expanded: this.expanded, generated: this.generated, maxFrontier: this.maxFrontier } };
    }
  }
  class CapHit extends Error {}

  // Binary heap ordered by (priority, insertion order) so ties are FIFO.
  class Heap {
    constructor() { this.a = []; this.c = 0; }
    get size() { return this.a.length; }
    push(item, pr) { this.a.push([pr, this.c++, item]); let i = this.a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.less(i, p)) { [this.a[i], this.a[p]] = [this.a[p], this.a[i]]; i = p; } else break; } }
    pop() {
      const top = this.a[0], last = this.a.pop();
      if (this.a.length) { this.a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.a.length && this.less(l, m)) m = l; if (r < this.a.length && this.less(r, m)) m = r; if (m === i) break; [this.a[i], this.a[m]] = [this.a[m], this.a[i]]; i = m; } }
      return top[2];
    }
    less(i, j) { return this.a[i][0] < this.a[j][0] || (this.a[i][0] === this.a[j][0] && this.a[i][1] < this.a[j][1]); }
  }

  /* ================= Pseudocode (AIMA 4e figures) ================= */
  const EXPAND = [
    ['', ''],
    ['', 'function EXPAND(problem, node) yields nodes'],
    ['x1', '  s ← node.STATE'],
    ['x2', '  for each action in problem.ACTIONS(s) do'],
    ['x3', '    s′ ← problem.RESULT(s, action)'],
    ['x4', '    cost ← node.PATH-COST + problem.ACTION-COST(s, action, s′)'],
    ['x5', '    yield NODE(STATE=s′, PARENT=node, ACTION=action, PATH-COST=cost)'],
  ];
  W.PSEUDO = {
    best: { caption: 'Figure 3.7: best-first search', lines: [
      ['', 'function BEST-FIRST-SEARCH(problem, f) returns a solution node or failure'],
      ['b1', '  node ← NODE(STATE=problem.INITIAL)'],
      ['b2', '  frontier ← a priority queue ordered by f, with node as an element'],
      ['b3', '  reached ← a lookup table, with one entry with key problem.INITIAL and value node'],
      ['b4', '  while not IS-EMPTY(frontier) do'],
      ['b5', '    node ← POP(frontier)'],
      ['b6', '    if problem.IS-GOAL(node.STATE) then return node'],
      ['b7', '    for each child in EXPAND(problem, node) do'],
      ['b8', '      s ← child.STATE'],
      ['b9', '      if s is not in reached or child.PATH-COST < reached[s].PATH-COST then'],
      ['b10', '        reached[s] ← child'],
      ['b11', '        add child to frontier'],
      ['b12', '  return failure'],
    ].concat(EXPAND) },
    bfs: { caption: 'Figure 3.9: breadth-first search', lines: [
      ['', 'function BREADTH-FIRST-SEARCH(problem) returns a solution node or failure'],
      ['f1', '  node ← NODE(problem.INITIAL)'],
      ['f2', '  if problem.IS-GOAL(node.STATE) then return node'],
      ['f3', '  frontier ← a FIFO queue, with node as an element'],
      ['f4', '  reached ← {problem.INITIAL}'],
      ['f5', '  while not IS-EMPTY(frontier) do'],
      ['f6', '    node ← POP(frontier)'],
      ['f7', '    for each child in EXPAND(problem, node) do'],
      ['f8', '      s ← child.STATE'],
      ['f9', '      if problem.IS-GOAL(s) then return child'],
      ['f10', '      if s is not in reached then'],
      ['f11', '        add s to reached'],
      ['f12', '        add child to frontier'],
      ['f13', '  return failure'],
    ].concat(EXPAND) },
    ids: { caption: 'Figure 3.12: iterative deepening and depth-limited tree-like search', lines: [
      ['', 'function ITERATIVE-DEEPENING-SEARCH(problem) returns a solution node or failure'],
      ['i1', '  for depth = 0 to ∞ do'],
      ['i2', '    result ← DEPTH-LIMITED-SEARCH(problem, depth)'],
      ['i3', '    if result ≠ cutoff then return result'],
      ['', ''],
      ['', 'function DEPTH-LIMITED-SEARCH(problem, ℓ) returns a node or failure or cutoff'],
      ['d1', '  frontier ← a LIFO queue (stack) with NODE(problem.INITIAL) as an element'],
      ['d2', '  result ← failure'],
      ['d3', '  while not IS-EMPTY(frontier) do'],
      ['d4', '    node ← POP(frontier)'],
      ['d5', '    if problem.IS-GOAL(node.STATE) then return node'],
      ['d6', '    if DEPTH(node) > ℓ then'],
      ['d7', '      result ← cutoff'],
      ['d8', '    else if not IS-CYCLE(node) do'],
      ['d9', '      for each child in EXPAND(problem, node) do'],
      ['d10', '        add child to frontier'],
      ['d11', '  return result'],
    ].concat(EXPAND) },
    dfsg: { caption: 'Depth-first graph search (DFS with a reached set; see §3.4.3)', lines: [
      ['', 'function DEPTH-FIRST-GRAPH-SEARCH(problem) returns a solution node or failure'],
      ['g1', '  frontier ← a LIFO queue (stack) with NODE(problem.INITIAL) as an element'],
      ['g2', '  reached ← {problem.INITIAL}'],
      ['g3', '  while not IS-EMPTY(frontier) do'],
      ['g4', '    node ← POP(frontier)'],
      ['g5', '    if problem.IS-GOAL(node.STATE) then return node'],
      ['g6', '    for each child in EXPAND(problem, node) do'],
      ['g7', '      if child.STATE is not in reached then'],
      ['g8', '        add child.STATE to reached'],
      ['g9', '        add child to frontier'],
      ['g10', '  return failure'],
    ].concat(EXPAND) },
  };

  /* ================= Algorithms ================= */

  function bestFirst(rec, fName, f) {
    const p = rec.p;
    let node = rec.node(p.initial, null, null);
    rec.ev('b1', node, 'Create root node.');
    const frontier = new Heap(); frontier.push(node, f(node)); rec.add(node);
    rec.ev('b2', node, `Frontier ordered by ${fName}.`);
    const reached = new Map([[p.key(node.state), node]]); rec.reachedSize = 1;
    rec.ev('b3', node, 'reached = {initial}.');
    while (frontier.size) {
      node = frontier.pop(); rec.pop(node);
      rec.ev('b5', node, `Pop ${p.short(node.state)} (g=${fmt(node.g)}, h=${fmt(node.h)}, ${fName}=${fmt(f(node))}).`);
      if (p.isGoal(node.state)) { rec.ev('b6', node, 'Goal test succeeds: return the node.', { done: 'solution' }); return rec.finish(node, 'solution'); }
      for (const child of rec.expand(node)) {
        const k = p.key(child.state), old = reached.get(k);
        if (!old || child.g < old.g) {
          if (!old) rec.reachedSize++;
          reached.set(k, child); frontier.push(child, f(child)); rec.add(child);
          rec.ev('b11', child, `${child.action} → ${p.short(child.state)}: ${old ? 'cheaper path found' : 'new state'}, add to frontier.`, { child: child.id, parentNode: node.id });
        } else {
          rec.ev('b9', child, `${child.action} → ${p.short(child.state)}: already reached with g=${fmt(old.g)}, skip.`, { child: child.id, skipped: true });
        }
      }
    }
    rec.ev('b12', null, 'Frontier empty: failure.', { done: 'failure' });
    return rec.finish(null, 'failure');
  }

  function bfs(rec) {
    const p = rec.p;
    let node = rec.node(p.initial, null, null);
    rec.ev('f1', node, 'Create root node.');
    if (p.isGoal(node.state)) { rec.ev('f2', node, 'Initial state is a goal.', { done: 'solution' }); return rec.finish(node, 'solution'); }
    const frontier = [node]; let head = 0; rec.add(node);
    rec.ev('f3', node, 'FIFO frontier.');
    const reached = new Set([p.key(node.state)]); rec.reachedSize = 1;
    rec.ev('f4', node, 'reached = {initial}.');
    while (head < frontier.length) {
      node = frontier[head++]; rec.pop(node);
      rec.ev('f6', node, `Pop ${p.short(node.state)} (depth ${node.depth}).`);
      for (const child of rec.expand(node)) {
        const k = p.key(child.state);
        if (p.isGoal(child.state)) { rec.ev('f9', child, `${child.action} → ${p.short(child.state)} is a goal: early goal test returns it.`, { child: child.id, done: 'solution' }); return rec.finish(child, 'solution'); }
        if (!reached.has(k)) {
          reached.add(k); rec.reachedSize++; frontier.push(child); rec.add(child);
          rec.ev('f12', child, `${child.action} → ${p.short(child.state)}: new, add to frontier.`, { child: child.id });
        } else rec.ev('f10', child, `${child.action} → ${p.short(child.state)}: already reached, skip.`, { child: child.id, skipped: true });
      }
    }
    rec.ev('f13', null, 'Frontier empty: failure.', { done: 'failure' });
    return rec.finish(null, 'failure');
  }

  function isCycle(rec, node) {
    const k = rec.p.key(node.state);
    for (let a = node.parent; a != null; a = rec.nodes[a].parent) if (rec.p.key(rec.nodes[a].state) === k) return true;
    return false;
  }

  function dls(rec, limit) {
    const p = rec.p;
    const root = rec.node(p.initial, null, null);
    const stack = [root]; rec.add(root);
    rec.ev('d1', root, `DEPTH-LIMITED-SEARCH with ℓ = ${limit === Infinity ? '∞' : limit}.`, { limit });
    let result = 'failure';
    rec.ev('d2', null, 'result ← failure.');
    while (stack.length) {
      const node = stack.pop(); rec.pop(node);
      rec.ev('d4', node, `Pop ${p.short(node.state)} (depth ${node.depth}).`);
      if (p.isGoal(node.state)) { rec.ev('d5', node, 'Goal test succeeds.', { done: 'solution' }); return node; }
      if (node.depth > limit) { result = 'cutoff'; rec.ev('d7', node, `Depth ${node.depth} > ℓ: cutoff.`, { cut: true }); }
      else if (!isCycle(rec, node)) {
        const kids = [...rec.expand(node)];
        for (let i = kids.length - 1; i >= 0; i--) { stack.push(kids[i]); rec.add(kids[i]); }
        rec.ev('d10', node, `Expand: push ${kids.length} children (${kids.map(k => k.action).join(', ')}).`);
      } else rec.ev('d8', node, `${p.short(node.state)} already on this path: cycle, skip.`, { skipped: true });
    }
    rec.ev('d11', null, `Stack empty: return ${result}.`);
    return result;
  }

  function dfsGraph(rec) {
    const p = rec.p;
    const root = rec.node(p.initial, null, null);
    const stack = [root]; rec.add(root);
    rec.ev('g1', root, 'LIFO frontier.');
    const reached = new Set([p.key(root.state)]); rec.reachedSize = 1;
    rec.ev('g2', root, 'reached = {initial}.');
    while (stack.length) {
      const node = stack.pop(); rec.pop(node);
      rec.ev('g4', node, `Pop ${p.short(node.state)} (depth ${node.depth}).`);
      if (p.isGoal(node.state)) { rec.ev('g5', node, 'Goal test succeeds.', { done: 'solution' }); return rec.finish(node, 'solution'); }
      const kids = [...rec.expand(node)].filter(k => {
        if (reached.has(p.key(k.state))) return false;
        reached.add(p.key(k.state)); rec.reachedSize++; return true;
      });
      for (let i = kids.length - 1; i >= 0; i--) { stack.push(kids[i]); rec.add(kids[i]); }
      rec.ev('g9', node, `Expand: push ${kids.length} new children.`);
    }
    rec.ev('g10', null, 'Frontier empty: failure.', { done: 'failure' });
    return rec.finish(null, 'failure');
  }

  const fmt = x => Number.isInteger(x) ? String(x) : x.toFixed(2);

  W.ALGOS = {
    bfs: { label: 'Breadth-first', pseudo: 'bfs', optimalIf: 'unit costs', run: rec => bfs(rec) },
    ucs: { label: 'Uniform-cost (Dijkstra)', pseudo: 'best', f: 'g', run: rec => bestFirst(rec, 'g', n => n.g) },
    dfs: { label: 'Depth-first (tree-like, cycle check)', pseudo: 'ids', run: rec => { const r = dls(rec, Infinity); return rec.finish(typeof r === 'object' ? r : null, typeof r === 'object' ? 'solution' : r); } },
    dfsg: { label: 'Depth-first (graph, reached set)', pseudo: 'dfsg', run: rec => dfsGraph(rec) },
    dls: { label: 'Depth-limited', pseudo: 'ids', usesLimit: true, run: (rec, o) => { const r = dls(rec, o.limit); const ok = typeof r === 'object'; rec.ev('', ok ? r : null, ok ? 'Solution found.' : 'Result: ' + r, { done: ok ? 'solution' : r }); return rec.finish(ok ? r : null, ok ? 'solution' : r); } },
    ids: { label: 'Iterative deepening', pseudo: 'ids', run: rec => {
      for (let depth = 0; ; depth++) {
        rec.tree = depth;
        rec.ev('i2', null, `Iteration with depth limit ${depth}: start a fresh tree.`, { limit: depth });
        const r = dls(rec, depth);
        if (r !== 'cutoff') {
          const ok = typeof r === 'object';
          rec.ev('i3', ok ? r : null, ok ? `Found at depth ${r.depth}.` : 'Result is failure (no cutoff happened).', { done: ok ? 'solution' : 'failure' });
          return rec.finish(ok ? r : null, ok ? 'solution' : 'failure');
        }
        rec.ev('i3', null, 'Result was cutoff: deepen.');
      }
    } },
    greedy: { label: 'Greedy best-first', pseudo: 'best', f: 'h', usesH: true, run: rec => bestFirst(rec, 'h', n => n.h) },
    astar: { label: 'A*', pseudo: 'best', f: 'g+h', usesH: true, run: rec => bestFirst(rec, 'f', n => n.g + n.h) },
    wastar: { label: 'Weighted A* (W = 2)', pseudo: 'best', f: 'g+2h', usesH: true, run: rec => bestFirst(rec, 'g+2h', n => n.g + 2 * n.h) },
  };

  W.runSearch = function (problem, algoKey, { h, limit = 5, cap = 60000 } = {}) {
    const rec = new Rec(problem, h, cap);
    const t0 = performance.now();
    let out;
    try { out = W.ALGOS[algoKey].run(rec, { limit }); }
    catch (e) {
      if (!(e instanceof CapHit)) throw e;
      rec.events.push({ line: '', node: null, msg: `Stopped: step cap of ${cap} reached.`, tree: rec.tree, expanded: rec.expanded, generated: rec.generated, reached: rec.reachedSize, frontier: rec.frontierSize, done: 'cap' });
      out = rec.finish(null, 'gave up (step cap)');
    }
    out.ms = performance.now() - t0;
    out.problem = problem;
    return out;
  };

  W.solutionPath = function (run) {
    if (run.result == null) return [];
    const path = [];
    for (let i = run.result; i != null; i = run.nodes[i].parent) path.unshift(run.nodes[i]);
    return path;
  };

  // Effective branching factor b*: N + 1 = 1 + b* + b*^2 + ... + b*^d  (§3.6.1), solved by bisection.
  W.effectiveBranching = function (N, d) {
    if (d <= 0) return null;
    const total = b => { let s = 0, t = 1; for (let i = 0; i <= d; i++) { s += t; t *= b; } return s; };
    let lo = 1, hi = Math.max(2, N);
    if (total(1) >= N + 1) return 1;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (total(m) < N + 1) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };

  /* ---------- Heuristic lab: true cost-to-go h*(s) for every reachable state ----------
   * Explore all reachable states, then run Dijkstra backward from the goal states over reversed edges. */
  W.checkHeuristic = function (problem, h) {
    const states = new Map(), edges = [];
    const q = [problem.initial]; states.set(problem.key(problem.initial), problem.initial);
    while (q.length) {
      const s = q.pop();
      for (const a of problem.actions(s)) {
        const t = problem.result(s, a), kt = problem.key(t);
        edges.push([problem.key(s), kt, problem.cost(s, a, t)]);
        if (!states.has(kt)) { states.set(kt, t); q.push(t); }
      }
    }
    const rev = new Map();
    for (const [a, b, c] of edges) { if (!rev.has(b)) rev.set(b, []); rev.get(b).push([a, c]); }
    const hstar = new Map(), heap = new Heap();
    for (const [k, s] of states) if (problem.isGoal(s)) { hstar.set(k, 0); heap.push(k, 0); }
    while (heap.size) {
      const k = heap.pop(), d = hstar.get(k);
      for (const [a, c] of rev.get(k) || []) if (!hstar.has(a) || d + c < hstar.get(a)) { hstar.set(a, d + c); heap.push(a, d + c); }
    }
    let admViol = [], conViol = 0, conExample = null, ratioSum = 0, ratioN = 0;
    for (const [k, s] of states) {
      const hv = h(problem, s), hs = hstar.get(k);
      if (hs == null) continue;
      if (hv > hs + 1e-9) admViol.push({ s, h: hv, hs });
      if (hs > 0) { ratioSum += hv / hs; ratioN++; }
    }
    for (const [a, b, c] of edges) {
      const ha = h(problem, states.get(a)), hb = h(problem, states.get(b));
      if (ha > c + hb + 1e-9) { conViol++; if (!conExample) conExample = { a: states.get(a), b: states.get(b), c, ha, hb }; }
    }
    return { states: states.size, edges: edges.length, solvable: hstar.has(problem.key(problem.initial)),
      optimal: hstar.get(problem.key(problem.initial)), admViol, conViol, conExample, avgRatio: ratioN ? ratioSum / ratioN : null };
  };
})(window.W);
