/* Chapter 7: the propositional Wumpus KB and the hybrid agent (Figure 7.20).
 *
 * Simplification vs. the book: the world is static, so pit/wumpus/breeze/stench symbols need no time index.
 * The agent tracks its own pose, so L^t, FacingEast^t... are not in the KB. The one fluent that matters
 * for safety, WumpusAlive, is a single symbol Alive whose fact is replaced when a Scream is heard.
 */
(function (W) {
  'use strict';
  const L = W.PL;
  const P = (x, y) => L.sym(`P${x},${y}`), Wu = (x, y) => L.sym(`W${x},${y}`);
  const B = (x, y) => L.sym(`B${x},${y}`), S = (x, y) => L.sym(`S${x},${y}`);
  const ALIVE = L.sym('Alive');
  W.KBsym = { P, W: Wu, B, S, ALIVE };

  W.WumpusKB = class {
    constructor(n) {
      this.n = n; this.sent = []; this.told = new Set(); this._clauses = null; this.version = 0;
      this.tell('init', L.not(P(1, 1)), 'no pit at the start square', 'pit', 0);
      this.tell('init', L.not(Wu(1, 1)), 'no wumpus at the start square', 'wumpus', 0);
      const cells = W.cells(n);
      this.tell('wumpus', L.or(...cells.map(([x, y]) => Wu(x, y))), 'there is at least one wumpus', 'wumpus', 0);
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++)
        this.tell('wumpus≤1', L.or(L.not(Wu(...cells[i])), L.not(Wu(...cells[j]))), 'at most one wumpus', 'wumpus', 0);
      this.tell('alive', ALIVE, 'the wumpus is alive (fluent)', 'wumpus', 0);
    }
    tell(group, s, note, kind, step) {
      const c = L.toCNF(s);
      this.sent.push({ id: this.sent.length, group, s, note, kind, step, retracted: null, clauses: c });
      this._clauses = null; this.version++;
    }
    tellPercept(x, y, p, step, wumpusKnownAlive) {
      const k = W.key(x, y);
      if (this.told.has(k)) return;
      this.told.add(k);
      const nb = W.neighbors(x, y, this.n);
      this.tell('physics', L.iff(B(x, y), L.or(...nb.map(c => P(...c)))), `breeze at [${k}] iff a neighbouring pit`, 'pit', step);
      // AIMA 4e: a stench is perceived in the wumpus's own square and in the directly adjacent ones.
      this.tell('physics', L.iff(S(x, y), L.or(Wu(x, y), ...nb.map(c => Wu(...c)))), `stench at [${k}] iff the wumpus is here or adjacent`, 'wumpus', step);
      this.tell('percept', p.breeze ? B(x, y) : L.not(B(x, y)), `perceived at [${k}]`, 'pit', step);
      this.tell('percept', p.stench ? S(x, y) : L.not(S(x, y)), `perceived at [${k}]`, 'wumpus', step);
      this.tell('visited', L.not(P(x, y)), `alive at [${k}] ⇒ no pit there`, 'pit', step);
      if (wumpusKnownAlive) this.tell('visited', L.not(Wu(x, y)), `alive at [${k}] while the wumpus lives ⇒ no wumpus there`, 'wumpus', step);
    }
    tellScream(step) {
      const a = this.sent.find(s => s.group === 'alive' && s.retracted == null);
      if (a) a.retracted = step;
      this.tell('alive', L.not(ALIVE), 'Scream heard: the wumpus is dead', 'wumpus', step);
    }
    tellMiss(cells, step) {
      for (const [x, y] of cells) this.tell('shot', L.not(Wu(x, y)), 'arrow missed: no wumpus in its path', 'wumpus', step);
    }
    active(step = Infinity) { return this.sent.filter(s => s.step <= step && (s.retracted == null || s.retracted > step)); }
    clauses(step, kind) {
      if (step == null && kind == null && this._clauses) return this._clauses;
      const out = [];
      for (const s of this.active(step == null ? Infinity : step)) if (!kind || s.kind === kind || kind === 'all') out.push(...s.clauses);
      if (step == null && kind == null) this._clauses = out;
      return out;
    }
  };

  /* ASK with counter-model caching: a model of KB in which α is false proves KB ⊭ α with no SAT call. */
  W.Asker = class {
    constructor(kb) { this.kb = kb; this.models = []; this.version = -1; this.calls = 0; this.cached = 0; this.asks = 0; }
    entails(alpha) {
      this.asks++;
      if (this.version !== this.kb.version) {
        const cls = this.kb.clauses();
        this.models = this.models.filter(m => cls.every(c => c.some(l => l[0] === '¬' ? m.get(l.slice(1)) === false : m.get(l) === true)));
        this.version = this.kb.version;
      }
      for (const m of this.models) if (L.evaluate(alpha, m) === false) { this.cached++; return false; }
      this.calls++;
      const m = L.dpllFast(this.kb.clauses().concat(L.toCNF(L.not(alpha))));
      if (m) { this.models.push(m); if (this.models.length > 40) this.models.shift(); return false; }
      return true;
    }
  };

  W.HYBRID_PSEUDO = { caption: 'Figure 7.20: a hybrid agent program for the wumpus world (atemporal simplification)', lines: [
    ['', 'function HYBRID-WUMPUS-AGENT(percept) returns an action'],
    ['h1', '  TELL(KB, MAKE-PERCEPT-SENTENCE(percept, t))'],
    ['h2', '  TELL the KB the "physics" sentences for the current square'],
    ['h3', '  safe ← {[x, y] : ASK(KB, OK_x,y) = true}'],
    ['h4', '  if ASK(KB, Glitter) = true then'],
    ['h5', '    plan ← [Grab] + PLAN-ROUTE(current, {[1,1]}, safe) + [Climb]'],
    ['h6', '  if plan is empty then'],
    ['h7', '    unvisited ← {[x, y] : ASK(KB, L_x,y at some t′ ≤ t) = false}'],
    ['h8', '    plan ← PLAN-ROUTE(current, unvisited ∩ safe, safe)'],
    ['h9', '  if plan is empty and ASK(KB, HaveArrow) = true then'],
    ['h10', '    possible_wumpus ← {[x, y] : ASK(KB, ¬W_x,y) = false}'],
    ['h11', '    plan ← PLAN-SHOT(current, possible_wumpus, safe)'],
    ['h12', '  if plan is empty then   // no choice but to take a risk'],
    ['h13', '    not_unsafe ← {[x, y] : ASK(KB, ¬OK_x,y) = false}'],
    ['h14', '    plan ← PLAN-ROUTE(current, unvisited ∩ not_unsafe, safe)'],
    ['h15', '  if plan is empty then'],
    ['h16', '    plan ← PLAN-ROUTE(current, {[1,1]}, safe) + [Climb]'],
    ['h17', '  action ← POP(plan)'],
    ['h18', '  TELL(KB, MAKE-ACTION-SENTENCE(action, t)); t ← t + 1'],
    ['h19', '  return action'],
  ] };

  W.HybridAgent = class {
    constructor(n) {
      this.n = n; this.kb = new W.WumpusKB(n); this.ask = new W.Asker(this.kb);
      this.x = 1; this.y = 1; this.dir = 'E'; this.hasArrow = true; this.hasGold = false; this.alive = true;
      this.visited = new Set(); this.plan = []; this.planCells = []; this.t = 0; this.last = null; this.planWhy = '';
      this.k = { noPit: new Set(), noW: new Set(), pit: new Set(), wumpus: new Set() };
      this.kbVersionSeen = -1;
    }
    get n2() { return W.cells(this.n).map(([x, y]) => W.key(x, y)); }
    nbKeys(k) { const [x, y] = W.parse(k); return W.neighbors(x, y, this.n).map(c => W.key(...c)); }

    /* Recompute what the agent knows about every unvisited square. Only needed when the KB changed. */
    think() {
      if (this.kbVersionSeen === this.kb.version) return;
      this.kbVersionSeen = this.kb.version;
      const K = this.k, A = this.ask;
      for (const c of this.n2) {
        if (this.visited.has(c)) { K.noPit.add(c); continue; }
        const [x, y] = W.parse(c);
        const near = this.nbKeys(c).some(v => this.visited.has(v));
        if (!K.noW.has(c) && !K.wumpus.has(c)) {
          if (A.entails(L.not(W.KBsym.W(x, y)))) K.noW.add(c);
          else if (A.entails(W.KBsym.W(x, y))) K.wumpus.add(c);
        }
        if (near && !K.noPit.has(c) && !K.pit.has(c)) {
          if (A.entails(L.not(W.KBsym.P(x, y)))) K.noPit.add(c);
          else if (A.entails(W.KBsym.P(x, y))) K.pit.add(c);
        }
      }
      for (const v of this.visited) if (this.alive) K.noW.add(v);
    }
    safe(c) { return this.k.noPit.has(c) && (this.k.noW.has(c) || !this.alive); }
    unsafe(c) { return this.k.pit.has(c) || (this.alive && this.k.wumpus.has(c)); }

    route(goals, allowedExtra) {
      const allowed = k => this.visited.has(k) || this.safe(k) || (allowedExtra && allowedExtra.has(k));
      return W.planRoute({ x: this.x, y: this.y, dir: this.dir, n: this.n }, allowed, goals);
    }
    setPlan(r, tail, why) {
      if (!r) return false;
      this.plan = r.actions.concat(tail || []); this.planCells = r.cells; this.planWhy = why;
      return this.plan.length > 0;
    }

    step(p) {
      const t = this.t, lines = [];
      // update own pose from the previous action
      if (this.last === 'Forward' && !p.bump) { this.x += W.DV[this.dir][0]; this.y += W.DV[this.dir][1]; }
      if (this.last === 'TurnLeft') this.dir = W.left(this.dir);
      if (this.last === 'TurnRight') this.dir = W.right(this.dir);
      const here = W.key(this.x, this.y);
      const before = this.kb.sent.length;
      if (this.last === 'Shoot') {
        this.hasArrow = false;
        if (p.scream) { this.alive = false; this.kb.tellScream(t); }
        else {
          const line = []; let x = this.x, y = this.y;
          while (W.inside(x, y, this.n)) { line.push([x, y]); x += W.DV[this.dir][0]; y += W.DV[this.dir][1]; }
          this.kb.tellMiss(line, t);
        }
      }
      this.visited.add(here);
      this.kb.tellPercept(this.x, this.y, p, t, this.alive);
      lines.push('h1', 'h2');
      const a0 = this.ask.asks, c0 = this.ask.calls, t0 = performance.now();
      this.think();
      lines.push('h3');

      let branch = null;
      if (p.glitter) {
        this.hasGold = true;
        const r = this.route((x, y) => x === 1 && y === 1);
        this.plan = ['Grab'].concat(r.actions, ['Climb']); this.planCells = r.cells; this.planWhy = 'grab the gold and go home';
        branch = 'h5';
      }
      if (!this.plan.length) {
        const targets = new Set(this.n2.filter(c => !this.visited.has(c) && this.safe(c)));
        if (targets.size && this.setPlan(this.route((x, y) => targets.has(W.key(x, y))), [], 'explore the nearest safe unvisited square')) branch = 'h8';
      }
      if (!this.plan.length && this.hasArrow && this.alive) {
        const possible = this.n2.filter(c => !this.k.noW.has(c));
        const pw = possible.map(W.parse);
        const facing = (x, y, d) => pw.some(([wx, wy]) => (d === 'E' && wy === y && wx > x) || (d === 'W' && wy === y && wx < x) || (d === 'N' && wx === x && wy > y) || (d === 'S' && wx === x && wy < y));
        if (possible.length && this.setPlan(this.route(facing), ['Shoot'], 'shoot toward a possible wumpus square')) branch = 'h11';
      }
      if (!this.plan.length) {
        const risky = new Set(this.n2.filter(c => !this.visited.has(c) && !this.unsafe(c) && this.nbKeys(c).some(v => this.visited.has(v))));
        if (risky.size && this.setPlan(this.route((x, y) => risky.has(W.key(x, y)), risky), [], 'no safe option: step into a square that is not provably unsafe')) branch = 'h14';
      }
      if (!this.plan.length) {
        const r = this.route((x, y) => x === 1 && y === 1);
        this.plan = r.actions.concat(['Climb']); this.planCells = r.cells; this.planWhy = 'nothing left to try: go home and climb out';
        branch = 'h16';
      }
      if (branch) lines.push(branch); else lines.push('h6');
      const action = this.plan.shift();
      lines.push('h17');
      this.last = action; this.t++;
      return {
        action, lines, branch,
        why: branch ? 'New plan: ' + this.planWhy + '.' : 'Continuing plan: ' + this.planWhy + '.',
        newSentences: this.kb.sent.slice(before).map(s => s.id),
        asks: this.ask.asks - a0, calls: this.ask.calls - c0, ms: performance.now() - t0,
      };
    }
    snapshot() {
      const K = this.k;
      return { noPit: [...K.noPit], noW: [...K.noW], pit: [...K.pit], wumpus: [...K.wumpus], visited: [...this.visited],
        alive: this.alive, plan: this.plan.slice(), planCells: this.planCells.slice(), kbSize: this.kb.sent.length, t: this.t };
    }
  };

  W.runHybrid = function (spec, maxSteps = 300) {
    const env = new W.Env(spec), agent = new W.HybridAgent(spec.size), steps = [];
    while (!env.s.done && steps.length < maxSteps) {
      const state = env.snapshot(), percept = env.percept();
      const d = agent.step(percept);
      steps.push(Object.assign({ state, percept, know: agent.snapshot(), t: agent.t - 1 }, d));
      env.execute(d.action);
    }
    steps.push({ state: env.snapshot(), percept: env.percept(), know: agent.snapshot(), action: null, lines: [], why: 'Episode over: ' + env.s.event + '.', newSentences: [], asks: 0, calls: 0, ms: 0, t: agent.t });
    return { agent, steps, kb: agent.kb };
  };

  /* Horn (definite-clause) version of the safety knowledge, for forward/backward chaining.
   * Uses positive symbols for negative facts: NB = no breeze, NS = no stench, NP = no pit, NW = no wumpus. */
  W.hornKB = function (n, visited, seen, visitedAlive = visited) {
    const rules = [], k = (a, x, y) => `${a}${x},${y}`;
    const add = (premises, conclusion, label) => rules.push({ premises, conclusion, label });
    for (const v of visited) {
      const [x, y] = W.parse(v), p = seen.get(v);
      add([], k('V', x, y), 'visited');
      if (visitedAlive.has(v)) add([], k('VA', x, y), 'visited while the wumpus was alive');
      add([], k(p.breeze ? 'B' : 'NB', x, y), 'percept');
      add([], k(p.stench ? 'S' : 'NS', x, y), 'percept');
    }
    for (const [x, y] of W.cells(n)) {
      const nb = W.neighbors(x, y, n);
      add([k('V', x, y)], k('NP', x, y), 'visited ⇒ no pit');
      add([k('VA', x, y)], k('NW', x, y), 'survived here while the wumpus lived ⇒ no wumpus');
      for (const [a, b] of nb) {
        add([k('NB', x, y)], k('NP', a, b), 'no breeze ⇒ neighbour has no pit');
        const others = nb.filter(([c, d]) => c !== a || d !== b);
        add([k('B', x, y)].concat(others.map(([c, d]) => k('NP', c, d))), k('P', a, b), 'breeze, and every other neighbour pit-free ⇒ pit here');
      }
      // stench comes from the wumpus's own square or a neighbour
      const smell = [[x, y]].concat(nb);
      for (const [a, b] of smell) {
        add([k('NS', x, y)], k('NW', a, b), a === x && b === y ? 'no stench ⇒ no wumpus here' : 'no stench ⇒ neighbour has no wumpus');
        const others = smell.filter(([c, d]) => c !== a || d !== b);
        add([k('S', x, y)].concat(others.map(([c, d]) => k('NW', c, d))), k('W', a, b), 'stench, and every other candidate square wumpus-free ⇒ wumpus here');
      }
      add([k('NP', x, y), k('NW', x, y)], k('OK', x, y), 'no pit ∧ no wumpus ⇒ OK');
      for (const [a, b] of W.cells(n)) if (a !== x || b !== y) add([k('W', x, y)], k('NW', a, b), 'only one wumpus');
    }
    return rules;
  };
})(window.W);
