/* Chapter 4: search in complex environments, four Wumpus variants.
 *   A. local search (hill climbing, simulated annealing, genetic algorithm) that DESIGNS worlds
 *   B. AND-OR search for a slippery (nondeterministic) cave
 *   C. belief states: localization with percepts, and sensorless (conformant) planning
 *   D. online search in an unknown cave: ONLINE-DFS-AGENT and LRTA*
 */
(function (W) {
  'use strict';
  const MOVES = ['N', 'E', 'S', 'W'];
  const step = (k, d) => { const [x, y] = W.parse(k); return [x + W.DV[d][0], y + W.DV[d][1]]; };
  W.OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

  /* ======================= A. Local search over worlds ======================= */
  // A world design: { pits: [k...], wumpus: k, gold: k } with all objects on distinct non-start squares.
  W.Designer = class {
    constructor(n, K, seed) {
      this.n = n; this.K = K; this.rng = W.rng(seed); this.cache = new Map();
      this.free = W.cells(n).map(c => W.key(...c)).filter(k => k !== '1,1');
    }
    objs(d) { return d.pits.concat([d.wumpus, d.gold]); }
    fromObjs(o) { return { pits: o.slice(0, this.K), wumpus: o[this.K], gold: o[this.K + 1] }; }
    random() {
      const pool = this.free.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return this.fromObjs(pool.slice(0, this.K + 2));
    }
    key(d) { return d.pits.slice().sort().join(';') + '|' + d.wumpus + '|' + d.gold; }
    spec(d) { return { size: this.n, pits: d.pits.slice(), wumpus: d.wumpus, gold: d.gold, seed: 'design' }; }
    // VALUE = cost of the optimal full-mission plan (Chapter 3). 0 if the gold can't be brought home.
    evaluate(d) {
      const k = this.key(d);
      if (this.cache.has(k)) return this.cache.get(k);
      const P = new W.MissionProblem(this.spec(d)), r = W.runSearch(P, 'ucs', { cap: 1e6 });
      const sol = W.solutionPath(r);
      const v = sol.length ? { value: sol[sol.length - 1].g, path: dedupe(sol.map(nd => [nd.state.x, nd.state.y])), actions: sol.slice(1).map(nd => nd.action) } : { value: 0, path: [], actions: [] };
      this.cache.set(k, v);
      return v;
    }
    neighbors(d) {
      const o = this.objs(d), used = new Set(o), out = [];
      for (let i = 0; i < o.length; i++) for (const f of this.free) if (!used.has(f)) { const p = o.slice(); p[i] = f; out.push(this.fromObjs(p)); }
      return out;
    }
    randomNeighbor(d) {
      const o = this.objs(d), used = new Set(o), i = Math.floor(this.rng() * o.length);
      const options = this.free.filter(f => !used.has(f));
      const p = o.slice(); p[i] = options[Math.floor(this.rng() * options.length)];
      return this.fromObjs(p);
    }
  };
  const dedupe = pts => pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);

  W.localSearch = function (algo, { n = 4, K = 3, seed = 1, restarts = 5, T0 = 8, cooling = 0.97, pop = 12, gens = 30, pm = 0.3 } = {}) {
    const D = new W.Designer(n, K, seed), ev = [];
    const snap = (d, extra) => Object.assign({ design: d, v: D.evaluate(d) }, extra);
    let best = null, bestV = -1;
    const track = d => { const v = D.evaluate(d).value; if (v > bestV) { bestV = v; best = d; } };
    if (algo === 'hc' || algo === 'rr') {
      const R = algo === 'rr' ? restarts : 1;
      for (let r = 0; r < R; r++) {
        let cur = D.random(); track(cur);
        ev.push(snap(cur, { line: 'h1', msg: `${R > 1 ? `restart ${r + 1}: ` : ''}random initial world, value ${D.evaluate(cur).value}`, best, bestV, restart: r }));
        for (;;) {
          const nbs = D.neighbors(cur);
          let nb = null, nv = -1;
          for (const x of nbs) { const v = D.evaluate(x).value; if (v > nv) { nv = v; nb = x; } }
          if (nv <= D.evaluate(cur).value) { ev.push(snap(cur, { line: 'h4', msg: `all ${nbs.length} neighbours are no better (best ${nv}): local maximum ${D.evaluate(cur).value}`, best, bestV, restart: r, stop: true })); break; }
          cur = nb; track(cur);
          ev.push(snap(cur, { line: 'h5', msg: `moved to the best of ${nbs.length} neighbours: value ${nv}`, best, bestV, restart: r }));
        }
      }
    } else if (algo === 'sa') {
      let cur = D.random(); track(cur);
      ev.push(snap(cur, { line: 's1', msg: `random initial world, value ${D.evaluate(cur).value}`, T: T0, best, bestV }));
      for (let t = 1; t < 600; t++) {
        const T = T0 * Math.pow(cooling, t);
        if (T < 0.05) { ev.push(snap(cur, { line: 's3', msg: 'temperature ≈ 0: stop', T, best, bestV })); break; }
        const nx = D.randomNeighbor(cur), dE = D.evaluate(nx).value - D.evaluate(cur).value;
        let acc = dE > 0, prob = 1;
        if (!acc) { prob = Math.exp(dE / T); acc = D.rng() < prob; }
        if (acc) { cur = nx; track(cur); }
        ev.push(snap(cur, { line: dE > 0 ? 's6' : 's7', msg: `T=${T.toFixed(2)} ΔE=${dE} ${dE > 0 ? '→ accept (better)' : acc ? `→ accepted a worse move (p=${prob.toFixed(2)})` : `→ rejected (p=${prob.toFixed(2)})`}`, T, best, bestV, dE, acc }));
      }
    } else if (algo === 'ga') {
      let P = Array.from({ length: pop }, () => D.random());
      P.forEach(track);
      const fit = d => D.evaluate(d).value + 1;
      const pick = () => { const tot = P.reduce((a, d) => a + fit(d), 0); let r = D.rng() * tot; for (const d of P) { r -= fit(d); if (r <= 0) return d; } return P[P.length - 1]; };
      ev.push(snap(best, { line: 'g1', msg: `generation 0: best ${bestV}, mean ${mean(P.map(d => D.evaluate(d).value))}`, pop: P.slice(), best, bestV, gen: 0 }));
      for (let g = 1; g <= gens; g++) {
        const P2 = [];
        for (let i = 0; i < pop; i++) {
          const a = D.objs(pick()), b = D.objs(pick()), c = Math.floor(D.rng() * a.length);
          let child = a.slice(0, c).concat(b.slice(c));
          // repair collisions: duplicates move to a random free square
          const seen = new Set();
          child = child.map(k => { if (!seen.has(k)) { seen.add(k); return k; } const f = D.free.filter(z => !seen.has(z) && !child.includes(z)); const z = f[Math.floor(D.rng() * f.length)]; seen.add(z); return z; });
          let d = D.fromObjs(child);
          if (D.rng() < pm) d = D.randomNeighbor(d);
          P2.push(d); track(d);
        }
        P = P2;
        const genBest = P.reduce((m, d) => D.evaluate(d).value > D.evaluate(m).value ? d : m, P[0]);
        ev.push(snap(genBest, { line: 'g8', msg: `generation ${g}: best in population ${D.evaluate(genBest).value}, mean ${mean(P.map(d => D.evaluate(d).value))}`, pop: P.slice(), best, bestV, gen: g }));
      }
    }
    return { ev, D, best, bestV };
  };
  const mean = xs => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);

  /* ======================= B. AND-OR search in a slippery cave ======================= */
  // Moving INTO an ice square may slide you one extra square in the same direction.
  W.iceFor = function (spec, seed, prob = 0.3) {
    const r = W.rng(seed * 31 + 7), ice = new Set();
    for (const [x, y] of W.cells(spec.size)) { const k = W.key(x, y); if (k !== '1,1' && !spec.pits.includes(k) && spec.wumpus !== k && r() < prob) ice.add(k); }
    return ice;
  };
  W.SlipperyProblem = class {
    constructor(spec, ice) { this.spec = spec; this.n = spec.size; this.ice = ice; this.deadly = new Set(spec.pits.concat(spec.wumpus ? [spec.wumpus] : [])); }
    isGoal(s) { return s === this.spec.gold; }
    actions(s) { return MOVES.filter(d => W.inside(...step(s, d), this.n)); }
    results(s, d) {
      const a = W.key(...step(s, d));
      const out = [a];
      if (this.ice.has(a)) { const b = step(a, d); if (W.inside(...b, this.n)) out.push(W.key(...b)); }
      return out;
    }
  };
  W.andOrSearch = function (P, { cap = 4000 } = {}) {
    const nodes = [], ev = [];
    const node = (o) => { const n = Object.assign({ id: nodes.length, t: ev.length, status: 'open' }, o); nodes.push(n); return n; };
    const log = (e) => { ev.push(e); if (ev.length > cap) throw new Error('cap'); };
    function orSearch(s, path, parent) {
      const nd = node({ parent, kind: 'or', state: s });
      log({ line: 'o1', node: nd.id, msg: `OR node: state [${s}]` });
      if (P.deadly.has(s)) { nd.status = 'fail'; log({ line: 'o1', node: nd.id, msg: `[${s}] is a pit or the wumpus: dead end` }); return null; }
      if (P.isGoal(s)) { nd.status = 'ok'; log({ line: 'o2', node: nd.id, msg: `[${s}] is the goal: empty plan` }); return { plan: [] }; }
      if (path.includes(s)) { nd.status = 'fail'; log({ line: 'o3', node: nd.id, msg: `[${s}] already on this path: cycle, fail` }); return null; }
      for (const a of P.actions(s)) {
        const res = P.results(s, a);
        const an = node({ parent: nd.id, kind: 'and', action: a, state: s });
        log({ line: 'o5', node: an.id, msg: `try ${a} from [${s}]: outcomes ${res.map(r => '[' + r + ']').join(' or ')}` });
        const plans = [];
        let ok = true;
        for (const r of res) {
          const p = orSearch(r, [s].concat(path), an.id);
          if (!p) { ok = false; break; }
          plans.push([r, p]);
        }
        if (ok) {
          an.status = 'ok'; nd.status = 'ok';
          log({ line: 'o6', node: an.id, msg: `${a} works for every outcome` });
          return { action: a, branches: plans };
        }
        an.status = 'fail';
        log({ line: 'a3', node: an.id, msg: `${a} fails for some outcome` });
      }
      nd.status = 'fail';
      log({ line: 'o7', node: nd.id, msg: `no action from [${s}] works: failure` });
      return null;
    }
    let plan = null, capped = false;
    try { plan = orSearch('1,1', [], null); } catch (e) { capped = true; }
    return { nodes, ev, plan, capped };
  };
  W.planText = function (p, indent = '') {
    if (!p) return 'failure';
    if (!p.action) return indent + '(goal)';
    if (p.branches.length === 1) return indent + p.action + '\n' + W.planText(p.branches[0][1], indent);
    return indent + p.action + '\n' + p.branches.map(([s, q], i) => indent + (i ? 'else if' : 'if') + ` at [${s}] then\n` + W.planText(q, indent + '    ')).join('\n');
  };
  W.planPolicy = function (p, out = new Map(), at = '1,1') {
    if (!p || !p.action) return out;
    if (!out.has(at)) out.set(at, p.action);
    for (const [s, q] of p.branches) W.planPolicy(q, out, s);
    return out;
  };

  /* ======================= C. Belief states ======================= */
  // The map is known; the agent's position is not. Moves are absolute (N/E/S/W); walls cause Bump.
  W.BeliefWorld = class {
    constructor(spec) { this.spec = spec; this.n = spec.size; this.deadly = new Set(spec.pits.concat(spec.wumpus ? [spec.wumpus] : [])); }
    safeCells() { return W.cells(this.n).map(c => W.key(...c)).filter(k => !this.deadly.has(k)); }
    result(s, d) { const b = step(s, d); return W.inside(...b, this.n) ? { s: W.key(...b), bump: false } : { s, bump: true }; }
    percept(s, bump) {
      const nb = W.neighbors(...W.parse(s), this.n).map(c => W.key(...c));
      return { breeze: nb.some(c => this.spec.pits.includes(c)), stench: !!this.spec.wumpus && (s === this.spec.wumpus || nb.includes(this.spec.wumpus)), glitter: s === this.spec.gold, bump };
    }
    ptext(p) { return ['breeze', 'stench', 'glitter', 'bump'].filter(k => p[k]).join(', ') || 'none'; }
    same(p, q) { return p.breeze === q.breeze && p.stench === q.stench && p.glitter === q.glitter && p.bump === q.bump; }
    // PREDICT(b, a): where each possible state goes. States that would die are reported separately.
    predict(b, d) {
      const alive = [], dying = [];
      for (const s of b) { const r = this.result(s, d); (this.deadly.has(r.s) ? dying : alive).push({ from: s, to: r.s, bump: r.bump }); }
      return { alive, dying };
    }
    update(pred, o) { return [...new Set(pred.filter(r => this.same(this.percept(r.to, r.bump), o)).map(r => r.to))]; }
    // Greedy choice: a move safe from EVERY believed position that minimizes the expected belief size.
    bestAction(b) {
      let best = null;
      for (const d of MOVES) {
        const { alive, dying } = this.predict(b, d);
        if (dying.length) continue;
        const groups = new Map();
        for (const r of alive) { const k = this.ptext(this.percept(r.to, r.bump)); if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(r.to); }
        let exp = 0; for (const g of groups.values()) exp += g.size * g.size / alive.length;
        if (!best || exp < best.exp - 1e-9) best = { d, exp };
      }
      return best;
    }
    // Sensorless planning: BFS in belief-state space for a plan that ends in a single known square.
    sensorless(start, maxNodes = 20000) {
      const key = b => b.slice().sort().join(';');
      const q = [{ b: start, plan: [] }], seen = new Set([key(start)]);
      let expanded = 0;
      while (q.length) {
        const cur = q.shift(); expanded++;
        if (cur.b.length === 1) return { plan: cur.plan, expanded, beliefs: seen.size };
        if (expanded > maxNodes) break;
        for (const d of MOVES) {
          const { alive, dying } = this.predict(cur.b, d);
          if (dying.length) continue;
          const nb = [...new Set(alive.map(r => r.to))];
          const k = key(nb);
          if (!seen.has(k)) { seen.add(k); q.push({ b: nb, plan: cur.plan.concat([d]) }); }
        }
      }
      return { plan: null, expanded, beliefs: seen.size };
    }
  };

  /* ======================= D. Online search ======================= */
  // The cave is unknown. Hazards act as walls here (the agent feels the draft/smell and refuses to enter),
  // so every action is safe and reversible, as online DFS assumes.
  W.OnlineCave = class {
    constructor(spec) { this.spec = spec; this.n = spec.size; this.blocked = new Set(spec.pits.concat(spec.wumpus ? [spec.wumpus] : [])); }
    move(s, d) { const b = step(s, d); if (!W.inside(...b, this.n)) return s; const k = W.key(...b); return this.blocked.has(k) ? s : k; }
    isGoal(s) { return s === this.spec.gold; }
    optimal() {
      const q = ['1,1'], dist = new Map([['1,1', 0]]);
      while (q.length) { const s = q.shift(); if (this.isGoal(s)) return dist.get(s); for (const d of MOVES) { const t = this.move(s, d); if (!dist.has(t)) { dist.set(t, dist.get(s) + 1); q.push(t); } } }
      return null;
    }
  };

  W.onlineDFS = function (cave, maxSteps = 400) {
    const result = new Map(), untried = new Map(), unback = new Map(), ev = [];
    let s = null, a = null, cur = '1,1', steps = 0, backtracking = false;
    const snap = (extra) => Object.assign({ at: cur, known: new Map(result), untried: new Map([...untried].map(([k, v]) => [k, v.slice()])), unback: new Map([...unback].map(([k, v]) => [k, v.slice()])), steps }, extra);
    for (;;) {
      if (cave.isGoal(cur)) { ev.push(snap({ line: 'd1', msg: `[${cur}] is the goal: stop`, done: 'goal' })); break; }
      if (!untried.has(cur)) untried.set(cur, MOVES.slice());
      if (s != null) {
        result.set(s + '|' + a, cur);
        if (cur !== s && !backtracking) {   // fix to Fig. 4.21: don't re-push after a backtrack, or two exhausted states ping-pong forever
         if (!unback.has(cur)) unback.set(cur, []); unback.get(cur).unshift(s); }
      }
      let line, msg;
      if (!untried.get(cur).length) {
        const ub = unback.get(cur) || [];
        if (!ub.length) { ev.push(snap({ line: 'd6', msg: 'nothing untried and nowhere to backtrack: stop (goal unreachable)', done: 'stuck' })); break; }
        const target = ub.shift();
        a = MOVES.find(b => result.get(cur + '|' + b) === target) || W.OPP[[...result].find(([k, v]) => k.startsWith(target + '|') && v === cur)[0].split('|')[1]];
        line = 'd7'; backtracking = true; msg = `all actions tried at [${cur}]: backtrack to [${target}] with ${a}`;
      } else { a = untried.get(cur).shift(); line = 'd8'; backtracking = false; msg = `try untried action ${a} at [${cur}]`; }
      ev.push(snap({ line, msg, action: a }));
      s = cur; cur = cave.move(cur, a); steps++;
      if (steps > maxSteps) { ev.push(snap({ line: '', msg: 'step limit', done: 'cap' })); break; }
    }
    return { ev, steps };
  };

  W.lrtaStar = function (cave, { trials = 5, maxSteps = 300, H: H0 } = {}) {
    const goal = W.parse(cave.spec.gold), h = s => W.manhattan(W.parse(s), goal);
    const H = H0 || new Map(), result = new Map(), ev = [], trialSteps = [];
    const cost = (s, b, H) => { const s2 = result.get(s + '|' + b); return s2 === undefined ? h(s) : 1 + H.get(s2); };
    for (let tr = 1; tr <= trials; tr++) {
      let s = null, a = null, cur = '1,1', n = 0;
      for (;;) {
        if (cave.isGoal(cur)) { ev.push({ line: 'l1', trial: tr, at: cur, H: new Map(H), known: new Map(result), steps: n, msg: `trial ${tr}: reached the gold in ${n} moves`, done: true }); break; }
        if (!H.has(cur)) H.set(cur, h(cur));
        if (s != null) {
          result.set(s + '|' + a, cur);
          const old = H.get(s);
          H.set(s, Math.min(...MOVES.map(b => cost(s, b, H))));
          if (H.get(s) !== old) ev.push({ line: 'l5', trial: tr, at: cur, H: new Map(H), known: new Map(result), steps: n, upd: s, msg: `update H[${s}]: ${old} → ${H.get(s)}` });
        }
        let best = null, bv = Infinity;
        for (const b of MOVES) { const c = cost(cur, b, H); if (c < bv) { bv = c; best = b; } }
        a = best;
        ev.push({ line: 'l6', trial: tr, at: cur, H: new Map(H), known: new Map(result), steps: n, action: a, msg: `at [${cur}]: argmin cost is ${a} (estimate ${bv})` });
        s = cur; cur = cave.move(cur, a); n++;
        if (n > maxSteps) { ev.push({ line: '', trial: tr, at: cur, H: new Map(H), known: new Map(result), steps: n, msg: 'step limit (gold unreachable?)', done: true }); break; }
      }
      trialSteps.push(n);
    }
    return { ev, trialSteps, H };
  };

  W.CH4_PSEUDO = {
    hc: { caption: 'Figure 4.2: the hill-climbing search algorithm (steepest ascent)', lines: [
      ['', 'function HILL-CLIMBING(problem) returns a state that is a local maximum'],
      ['h1', '  current ← problem.INITIAL'],
      ['h2', '  while true do'],
      ['h3', '    neighbor ← a highest-valued successor state of current'],
      ['h4', '    if VALUE(neighbor) ≤ VALUE(current) then return current'],
      ['h5', '    current ← neighbor'],
    ] },
    sa: { caption: 'Figure 4.5: simulated annealing (written here for maximizing VALUE)', lines: [
      ['', 'function SIMULATED-ANNEALING(problem, schedule) returns a solution state'],
      ['s1', '  current ← problem.INITIAL'],
      ['s2', '  for t = 1 to ∞ do'],
      ['', '    T ← schedule(t)'],
      ['s3', '    if T = 0 then return current'],
      ['s4', '    next ← a randomly selected successor of current'],
      ['s5', '    ΔE ← VALUE(next) − VALUE(current)'],
      ['s6', '    if ΔE > 0 then current ← next'],
      ['s7', '    else current ← next only with probability e^(ΔE/T)'],
    ] },
    ga: { caption: 'Figure 4.8: a genetic algorithm', lines: [
      ['', 'function GENETIC-ALGORITHM(population, fitness) returns an individual'],
      ['g1', '  repeat'],
      ['g2', '    weights ← WEIGHTED-BY(population, fitness)'],
      ['g3', '    population2 ← empty list'],
      ['g4', '    for i = 1 to SIZE(population) do'],
      ['g5', '      parent1, parent2 ← WEIGHTED-RANDOM-CHOICES(population, weights, 2)'],
      ['g6', '      child ← REPRODUCE(parent1, parent2)'],
      ['g7', '      if (small random probability) then child ← MUTATE(child)'],
      ['', '      add child to population2'],
      ['g8', '    population ← population2'],
      ['', '  until some individual is fit enough, or enough time has elapsed'],
      ['', '  return the best individual in population, according to fitness'],
    ] },
    andor: { caption: 'Figure 4.11: an algorithm for searching AND-OR graphs', lines: [
      ['', 'function AND-OR-SEARCH(problem) returns a conditional plan, or failure'],
      ['', '  return OR-SEARCH(problem, problem.INITIAL, [ ])'],
      ['', ''],
      ['', 'function OR-SEARCH(problem, state, path) returns a conditional plan, or failure'],
      ['o2', '  if problem.IS-GOAL(state) then return the empty plan'],
      ['o3', '  if IS-CYCLE(path) then return failure'],
      ['o4', '  for each action in problem.ACTIONS(state) do'],
      ['o5', '    plan ← AND-SEARCH(problem, RESULTS(state, action), [state] + path)'],
      ['o6', '    if plan ≠ failure then return [action] + plan'],
      ['o7', '  return failure'],
      ['', ''],
      ['', 'function AND-SEARCH(problem, states, path) returns a conditional plan, or failure'],
      ['a1', '  for each si in states do'],
      ['a2', '    plan_i ← OR-SEARCH(problem, si, path)'],
      ['a3', '    if plan_i = failure then return failure'],
      ['a4', '  return [if s1 then plan_1 else if s2 then plan_2 else … if s_n−1 then plan_n−1 else plan_n]'],
    ] },
    belief: { caption: '§4.4: belief-state prediction and update with percepts', lines: [
      ['p1', 'b̂ = PREDICT(b, a) = { s′ : s′ = RESULT(s, a) and s ∈ b }'],
      ['p2', 'POSSIBLE-PERCEPTS(b̂) = { o : o = PERCEPT(s) and s ∈ b̂ }'],
      ['p3', 'b_o = UPDATE(b̂, o) = { s : o = PERCEPT(s) and s ∈ b̂ }'],
      ['', ''],
      ['p4', 'Sensorless: no percepts, so b′ = PREDICT(b, a). Plan by searching belief-state space.'],
    ] },
    odfs: { caption: 'Figure 4.21: an online search agent that uses depth-first exploration', lines: [
      ['', 'function ONLINE-DFS-AGENT(problem, s′) returns an action'],
      ['', '  persistent: s, a, the previous state and action, initially null'],
      ['', '              result, untried, unbacktracked: tables, initially empty'],
      ['d1', '  if problem.IS-GOAL(s′) then return stop'],
      ['d2', '  if s′ is a new state (not in untried) then untried[s′] ← problem.ACTIONS(s′)'],
      ['d3', '  if s is not null then'],
      ['d4', '    result[s, a] ← s′'],
      ['d5', '    add s to the front of unbacktracked[s′]   (only after a forward move: see note)'],
      ['d6', '  if untried[s′] is empty then if unbacktracked[s′] is empty then return stop'],
      ['d7', '    else a ← an action b such that result[s′, b] = POP(unbacktracked[s′])'],
      ['d8', '  else a ← POP(untried[s′])'],
      ['', '  s ← s′'],
      ['', '  return a'],
    ] },
    lrta: { caption: 'Figure 4.24: LRTA*-AGENT', lines: [
      ['', 'function LRTA*-AGENT(problem, s′, h) returns an action'],
      ['', '  persistent: s, a, the previous state and action; result, H: tables'],
      ['l1', '  if IS-GOAL(s′) then return stop'],
      ['l2', '  if s′ is a new state (not in H) then H[s′] ← h(s′)'],
      ['l3', '  if s is not null then'],
      ['l4', '    result[s, a] ← s′'],
      ['l5', '    H[s] ← min over b in ACTIONS(s) of LRTA*-COST(problem, s, b, result[s, b], H)'],
      ['l6', '  a ← argmin over b in ACTIONS(s′) of LRTA*-COST(problem, s′, b, result[s′, b], H)'],
      ['', '  s ← s′; return a'],
      ['', ''],
      ['', 'function LRTA*-COST(problem, s, a, s′, H) returns a cost estimate'],
      ['', '  if s′ is undefined then return h(s)'],
      ['', '  else return problem.ACTION-COST(s, a, s′) + H[s′]'],
    ] },
  };
})(window.W);
