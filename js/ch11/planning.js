/* Chapter 11: classical planning in the Wumpus World.
 * A grounded PDDL-style domain, progression and regression search problems (compatible with W.runSearch
 * from Chapter 3), relaxed-planning-graph heuristics, a SATPlan encoding (solved with Chapter 7's DPLL),
 * and a hierarchical (HTN-style) view of a plan.
 */
(function (W) {
  'use strict';

  /* ---------- the grounded domain ---------- */
  W.PlanDomain = class {
    constructor(spec) {
      const n = spec.size, pits = new Set(spec.pits);
      this.spec = spec; this.n = n;
      const sq = W.cells(n).map(c => W.key(...c)).filter(k => !pits.has(k));
      this.squares = sq;
      const A = [];
      for (const a of sq) for (const [x, y] of W.neighbors(...W.parse(a), n)) {
        const b = W.key(x, y); if (pits.has(b)) continue;
        A.push({ name: `Move([${a}],[${b}])`, pre: [`At(${a})`], neg: spec.wumpus ? [`WumpusAt(${b})`] : [], add: [`At(${b})`], del: [`At(${a})`], cost: 1, kind: 'move', from: a, to: b });
      }
      if (spec.gold && !pits.has(spec.gold)) A.push({ name: `Grab([${spec.gold}])`, pre: [`At(${spec.gold})`, `GoldAt(${spec.gold})`], neg: [], add: ['HaveGold'], del: [`GoldAt(${spec.gold})`], cost: 1, kind: 'grab' });
      if (spec.wumpus) for (const [x, y] of W.neighbors(...W.parse(spec.wumpus), n)) {
        const a = W.key(x, y); if (pits.has(a)) continue;
        A.push({ name: `Shoot([${a}],[${spec.wumpus}])`, pre: [`At(${a})`, 'HaveArrow', `WumpusAt(${spec.wumpus})`], neg: [], add: [], del: [`WumpusAt(${spec.wumpus})`, 'HaveArrow'], cost: 11, kind: 'shoot' });
      }
      A.push({ name: 'Climb', pre: ['At(1,1)', 'HaveGold'], neg: [], add: ['Out'], del: [], cost: 1, kind: 'climb' });
      this.actions = A;
      this.byName = new Map(A.map(a => [a.name, a]));
      this.init = ['At(1,1)', 'HaveArrow'].concat(spec.gold ? [`GoldAt(${spec.gold})`] : []).concat(spec.wumpus ? [`WumpusAt(${spec.wumpus})`] : []).sort();
      this.goal = ['Out'];
    }
    applicable(s, a) { return a.pre.every(p => s.has(p)) && a.neg.every(p => !s.has(p)); }
    apply(s, a) { const t = new Set(s); a.del.forEach(f => t.delete(f)); a.add.forEach(f => t.add(f)); return t; }
    pddl() {
      const s = this.spec;
      return `Init(At([1,1]) ∧ HaveArrow${s.gold ? ` ∧ GoldAt([${s.gold}])` : ''}${s.wumpus ? ` ∧ WumpusAt([${s.wumpus}])` : ''}
     ∧ Adjacent(…) ∧ ${s.pits.length ? s.pits.map(p => `Pit([${p}])`).join(' ∧ ') : 'no pits'})
Goal(Out)

Action(Move(from, to),
  PRECOND: At(from) ∧ Adjacent(from, to) ∧ ¬Pit(to) ∧ ¬WumpusAt(to)
  EFFECT:  ¬At(from) ∧ At(to))
Action(Grab(s),
  PRECOND: At(s) ∧ GoldAt(s)
  EFFECT:  HaveGold ∧ ¬GoldAt(s))
Action(Shoot(s, w),
  PRECOND: At(s) ∧ Adjacent(s, w) ∧ WumpusAt(w) ∧ HaveArrow
  EFFECT:  ¬WumpusAt(w) ∧ ¬HaveArrow)
Action(Climb,
  PRECOND: At([1,1]) ∧ HaveGold
  EFFECT:  Out)`;
    }
  };

  /* ---------- relaxed planning graph (ignore delete lists and negative preconditions) ---------- */
  W.relaxedGraph = function (D, state) {
    const level = new Map([...state].map(f => [f, 0]));
    const actLevel = new Map(), layers = [{ facts: [...state], acts: [] }];
    for (let L = 0; L < 200; L++) {
      const newActs = D.actions.filter(a => !actLevel.has(a.name) && a.pre.every(p => level.has(p) && level.get(p) <= L));
      if (!newActs.length) break;
      newActs.forEach(a => actLevel.set(a.name, L));
      const newFacts = [];
      for (const a of newActs) for (const f of a.add) if (!level.has(f)) { level.set(f, L + 1); newFacts.push(f); }
      layers[L].acts = newActs.map(a => a.name);
      layers.push({ facts: newFacts, acts: [] });
      if (!newFacts.length) break;
    }
    return { level, actLevel, layers };
  };
  W.PLAN_H = {
    zero: { label: 'h = 0 (uniform-cost)', fn: () => 0 },
    goalcount: { label: 'ignore preconditions: number of unsatisfied goals (HaveGold, Out)', fn: (p, s) => ['HaveGold', 'Out'].filter(g => !s.set.has(g)).length },
    hmax: { label: 'h_max: level of the goal in the relaxed planning graph', fn: (p, s) => { const r = W.relaxedGraph(p.D, s.set); return r.level.has('Out') ? r.level.get('Out') : 1e6; } },
    hff: { label: 'h_FF: length of a relaxed plan extracted from the graph (not admissible)', fn: (p, s) => {
      const r = W.relaxedGraph(p.D, s.set);
      if (!r.level.has('Out')) return 1e6;
      const need = new Set(['Out']), chosen = new Set();
      const stack = ['Out'];
      while (stack.length) {
        const f = stack.pop(), lf = r.level.get(f);
        if (lf === 0) continue;
        const a = p.D.actions.find(x => x.add.includes(f) && r.actLevel.get(x.name) === lf - 1);
        if (!a || chosen.has(a.name)) continue;
        chosen.add(a.name);
        a.pre.forEach(q => { if (!need.has(q)) { need.add(q); stack.push(q); } });
      }
      return chosen.size;
    } },
  };

  /* ---------- progression (forward state-space) problem, compatible with W.runSearch ---------- */
  W.ProgressionProblem = class {
    constructor(D) { this.D = D; this.name = 'Forward (progression) planning'; this.initial = this.mk(new Set(D.init)); }
    mk(set) { return { set, k: [...set].sort().join(' ') }; }
    key(s) { return s.k; }
    isGoal(s) { return this.D.goal.every(g => s.set.has(g)); }
    actions(s) { return this.D.actions.filter(a => this.D.applicable(s.set, a)).map(a => a.name); }
    result(s, a) { return this.mk(this.D.apply(s.set, this.D.byName.get(a))); }
    cost(s, a) { return this.D.byName.get(a).cost; }
    cell(s) { const at = [...s.set].find(f => f.startsWith('At(')); return at ? W.parse(at.slice(3, -1)) : [1, 1]; }
    show(s) { return [...s.set].sort().join(' ∧ '); }
    short(s) { return [...s.set].filter(f => f.startsWith('At(') || f === 'HaveGold' || f === 'Out').join(' '); }
    stateCount() { return '≤ ' + (this.D.squares.length * 2 * 2 * 2 * 2); }
  };

  /* ---------- regression (backward, relevant-states) problem ---------- */
  W.RegressionProblem = class {
    constructor(D) { this.D = D; this.name = 'Backward (regression) planning'; this.initSet = new Set(D.init); this.initial = this.mk(D.goal.slice()); }
    mk(lits) { const s = [...new Set(lits)].sort(); return { lits: s, k: s.join(' ∧ ') }; }
    key(g) { return g.k; }
    pos(g) { return g.lits.filter(l => l[0] !== '¬'); }
    negs(g) { return g.lits.filter(l => l[0] === '¬').map(l => l.slice(1)); }
    isGoal(g) { return this.pos(g).every(f => this.initSet.has(f)) && this.negs(g).every(f => !this.initSet.has(f)); }
    actions(g) {
      const P = this.pos(g), N = this.negs(g), out = [];
      for (const a of this.D.actions) {
        const relevant = a.add.some(f => P.includes(f)) || a.del.some(f => N.includes(f));
        if (!relevant) continue;
        if (a.add.some(f => N.includes(f)) || a.del.some(f => P.includes(f) && !a.add.includes(f))) continue;   // would undo part of g
        const r = this.regress(g, a);
        if (r) out.push(a.name);
      }
      return out;
    }
    regress(g, a) {
      const P = this.pos(g).filter(f => !a.add.includes(f)), N = this.negs(g).filter(f => !a.del.includes(f));
      const P2 = [...new Set(P.concat(a.pre))], N2 = [...new Set(N.concat(a.neg))];
      if (P2.some(f => N2.includes(f))) return null;               // inconsistent
      if (P2.filter(f => f.startsWith('At(')).length > 1) return null;   // the agent is in one place at a time
      return P2.concat(N2.map(f => '¬' + f));
    }
    result(g, a) { return this.mk(this.regress(g, this.D.byName.get(a))); }
    cost(g, a) { return this.D.byName.get(a).cost; }
    cell(g) { const at = g.lits.find(f => f.startsWith('At(')); return at ? W.parse(at.slice(3, -1)) : [1, 1]; }
    show(g) { return g.k || 'True'; }
    short(g) { return g.k.length > 40 ? g.k.slice(0, 40) + '…' : g.k; }
    stateCount() { return 'many (sets of literals)'; }
  };
  W.REG_H = {
    zero: { label: 'h = 0', fn: () => 0 },
    unsat: { label: 'number of subgoals not true in the initial state', fn: (p, g) => g.lits.filter(l => l[0] === '¬' ? p.initSet.has(l.slice(1)) : !p.initSet.has(l)).length },
  };

  /* ---------- SATPlan (§7.7.4, used for planning in §11.2): route + grab + return + climb ----------
   * Moves into the wumpus square are simply removed (no shooting) to keep the encoding small. */
  W.satplanEncode = function (D, T) {
    const L = W.PL, sq = D.squares.filter(k => k !== D.spec.wumpus);
    const moves = D.actions.filter(a => a.kind === 'move' && sq.includes(a.from) && sq.includes(a.to));
    const grab = sq.includes(D.spec.gold) ? D.actions.find(a => a.kind === 'grab') : null;   // gold in a blocked square: unreachable without shooting
    const cl = [], sym = (s, t) => `${s}^${t}`;
    const add = s => cl.push(...L.toCNF(s));
    // initial state
    for (const s of sq) add(s === '1,1' ? L.sym(sym(`At${s}`, 0)) : L.not(L.sym(sym(`At${s}`, 0))));
    add(L.not(L.sym(sym('HaveGold', 0)))); add(L.not(L.sym(sym('Out', 0))));
    for (let t = 0; t < T; t++) {
      // preconditions
      for (const m of moves) add(L.imp(L.sym(sym(m.name, t)), L.sym(sym(`At${m.from}`, t))));
      if (grab) add(L.imp(L.sym(sym('Grab', t)), L.sym(sym(`At${D.spec.gold}`, t))));
      add(L.imp(L.sym(sym('Climb', t)), L.and(L.sym(sym('At1,1', t)), L.sym(sym('HaveGold', t)))));
      // successor-state axioms
      for (const s of sq) {
        const into = moves.filter(m => m.to === s).map(m => L.sym(sym(m.name, t)));
        const outOf = moves.filter(m => m.from === s).map(m => L.sym(sym(m.name, t)));
        add(L.iff(L.sym(sym(`At${s}`, t + 1)), L.or(...into.concat([L.and(L.sym(sym(`At${s}`, t)), ...outOf.map(o => L.not(o)))]))));
      }
      add(L.iff(L.sym(sym('HaveGold', t + 1)), grab ? L.or(L.sym(sym('Grab', t)), L.sym(sym('HaveGold', t))) : L.sym(sym('HaveGold', t))));
      add(L.iff(L.sym(sym('Out', t + 1)), L.or(L.sym(sym('Climb', t)), L.sym(sym('Out', t)))));
      // exclusion: the agent is in at most one square (this already rules out two moves at once),
      // and Grab / Climb can't happen together with a move out of that square
      for (let i = 0; i < sq.length; i++) for (let j = i + 1; j < sq.length; j++) cl.push([`¬At${sq[i]}^${t + 1}`, `¬At${sq[j]}^${t + 1}`].sort());
      if (grab) for (const m of moves.filter(m => m.from === D.spec.gold)) cl.push(['¬' + sym('Grab', t), '¬' + sym(m.name, t)].sort());
      for (const m of moves.filter(m => m.from === '1,1')) cl.push(['¬' + sym('Climb', t), '¬' + sym(m.name, t)].sort());
      if (grab) cl.push(['¬' + sym('Grab', t), '¬' + sym('Climb', t)].sort());
    }
    add(L.sym(sym('Out', T)));
    return { clauses: cl, moves };
  };
  W.satplan = function (D, T) {
    const t0 = performance.now(), enc = W.satplanEncode(D, T);
    // branch on earlier time steps first, so unit propagation can push reachability forward
    const syms = [...new Set(enc.clauses.flat().map(l => l.replace('¬', '')))];
    const tOf = k => +k.slice(k.lastIndexOf('^') + 1);
    syms.sort((a, b) => tOf(a) - tOf(b) || (/^(Move|Grab|Climb)/.test(b) - /^(Move|Grab|Climb)/.test(a)));
    const m = W.PL.dpllFast(enc.clauses, { order: syms });
    const plan = [];
    if (m) for (let t = 0; t < T; t++) for (const [k, v] of m) if (v && k.endsWith('^' + t) && !/^(At|HaveGold|Out)/.test(k)) plan.push({ t, a: k.slice(0, k.lastIndexOf('^')) });
    const nsym = new Set(enc.clauses.flat().map(l => l.replace('¬', ''))).size;
    return { T, sat: !!m, clauses: enc.clauses.length, symbols: nsym, plan, ms: performance.now() - t0, stats: W.PL.lastFastStats };
  };

  /* ---------- hierarchical view (§11.4): decompose a primitive plan into high-level actions ---------- */
  W.hierarchy = function (actions) {
    const grabI = actions.findIndex(a => a.startsWith('Grab'));
    const seg = (arr, label) => ({ label, kids: arr.map(a => ({ label: a })) });
    const nav = (arr, target) => ({ label: `Navigate(${target})`, kids: arr.filter(a => a.startsWith('Move')).map(a => ({ label: a })) });
    const before = grabI < 0 ? actions : actions.slice(0, grabI), after = grabI < 0 ? [] : actions.slice(grabI + 1);
    const shoot = before.find(a => a.startsWith('Shoot'));
    const fetch = { label: 'FetchGold', kids: [] };
    if (shoot) {
      const si = before.indexOf(shoot);
      fetch.kids.push(nav(before.slice(0, si), 'firing position'), { label: 'KillWumpus', kids: [{ label: shoot }] }, nav(before.slice(si + 1), 'gold'));
    } else fetch.kids.push(nav(before, 'gold'));
    if (grabI >= 0) fetch.kids.push({ label: actions[grabI] });
    const ret = { label: 'ReturnHome', kids: [nav(after.filter(a => a !== 'Climb'), '[1,1]')] };
    return { label: 'DoMission', kids: [fetch, ret, { label: 'Climb' }] };
  };
})(window.W);
