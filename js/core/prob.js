/* Probabilistic reasoning about the Wumpus World (Chapters 12–16, 21).
 * Exact posterior P(pit), P(wumpus) given observations, computed as in §12.7: only the *frontier* squares
 * (unobserved squares next to an observed one) matter for pits; every other unknown square keeps its prior p.
 */
(function (W) {
  'use strict';

  W.perceptsAt = function (spec, k) {
    const nb = W.neighbors(...W.parse(k), spec.size).map(c => W.key(...c));
    return { breeze: nb.some(c => spec.pits.includes(c)), stench: !!spec.wumpus && (spec.wumpus === k || nb.includes(spec.wumpus)) };
  };
  W.obsFromSpec = (spec, observed) => new Map([...observed].map(k => [k, W.perceptsAt(spec, k)]));

  /* obs: Map square → {breeze, stench}; all observed squares are known pit-free and (wumpus alive) wumpus-free.
   * Returns { pit: Map, wumpus: Map, risk: Map, frontier, models (≤ maxModels), Z, nModels, pruned } */
  W.posteriorObs = function (n, obs, { p = 0.2, maxModels = 256, maxFrontier = 22, wumpusDead = false, fixedPit = null, fixedWumpus = null } = {}) {
    const all = W.cells(n).map(c => W.key(...c)), nb = k => W.neighbors(...W.parse(k), n).map(c => W.key(...c));
    const unknown = all.filter(k => !obs.has(k));
    const frontier = unknown.filter(k => nb(k).some(v => obs.has(v)));
    if (frontier.length > maxFrontier) throw new Error(`frontier of ${frontier.length} squares is too large to enumerate`);
    const idx = new Map(frontier.map((k, i) => [k, i]));
    const cons = [...obs].map(([v, o]) => ({ v, need: o.breeze, vars: nb(v).filter(k => idx.has(k)).map(k => idx.get(k)) })).filter(c => c.vars.length || c.need);
    const byVar = frontier.map(() => []);
    cons.forEach((c, ci) => c.vars.forEach(i => byVar[i].push(ci)));
    const F = frontier.length, a = new Int8Array(F).fill(-1), acc = new Float64Array(F), models = [];
    let Z = 0, nModels = 0, visited = 0;
    const ok = i => byVar[i].every(ci => {
      const c = cons[ci];
      if (!c.need) return !c.vars.some(j => a[j] === 1);
      return c.vars.some(j => a[j] !== 0);        // still possible to have a pit
    });
    (function rec(i, w, k) {
      visited++;
      if (i === F) {
        if (cons.some(c => c.need && !c.vars.some(j => a[j] === 1))) return;
        Z += w; nModels++;
        for (let j = 0; j < F; j++) if (a[j] === 1) acc[j] += w;
        if (models.length < maxModels) models.push({ pits: frontier.filter((_, j) => a[j] === 1), w });
        return;
      }
      const fv = fixedPit && fixedPit.has(frontier[i]) ? [fixedPit.get(frontier[i]) ? 1 : 0] : [1, 0];
      for (const v of fv) {
        a[i] = v;
        if (ok(i)) rec(i + 1, w * (v ? p : 1 - p), k + v);
        a[i] = -1;
      }
    })(0, 1, 0);
    if (cons.some(c => c.need && !c.vars.length)) Z = 0;   // contradictory evidence (e.g. the wumpus sits in a pit)
    const pit = new Map(), wumpus = new Map(), risk = new Map();
    for (const k of all) pit.set(k, obs.has(k) ? 0 : idx.has(k) ? (Z ? acc[idx.get(k)] / Z : NaN) : (fixedPit && fixedPit.has(k) ? +fixedPit.get(k) : p));
    // wumpus: exactly one, uniform over non-start squares; consistent with every stench observation
    let cands = wumpusDead ? [] : all.filter(k => k !== '1,1' && !obs.has(k) && [...obs].every(([v, o]) => o.stench === (v === k || nb(v).includes(k))));
    if (fixedWumpus) cands = cands.filter(k => fixedWumpus.has(k) ? fixedWumpus.get(k) : ![...fixedWumpus.values()].some(Boolean));
    for (const k of all) wumpus.set(k, cands.includes(k) ? 1 / cands.length : 0);
    for (const k of all) risk.set(k, 1 - (1 - pit.get(k)) * (1 - wumpus.get(k)));
    models.forEach(m => { m.prob = Z ? m.w / Z : 0; });
    return { pit, wumpus, risk, frontier, unknown, models, Z, nModels, nodes: visited, wCands: cands };
  };
  W.posterior = (spec, observed, opts) => W.posteriorObs(spec.size, W.obsFromSpec(spec, observed), Object.assign({ p: spec.pitProb != null ? spec.pitProb : 0.2 }, opts));

  /* ---------- a panel for choosing which squares have been observed ---------- */
  W.ObsPanel = class {
    constructor(el, { getSpec, onChange }) {
      this.el = el; this.getSpec = getSpec; this.onChange = onChange; this.observed = new Set(['1,1']);
      el.innerHTML = `<div class="row"><b>Observed squares</b><button data-o="goal">Safe exploration (goal-based agent)</button><button data-o="start">Only [1,1]</button><span class="small muted">or click squares on the grid to add or remove observations (you can't observe a pit or the wumpus)</span></div>`;
      el.addEventListener('click', e => { const o = e.target.dataset.o; if (o === 'goal') this.safe(); if (o === 'start') { this.observed = new Set(['1,1']); this.onChange(this.observed); } });
    }
    safe() { this.observed = new Set(W.runEpisode(this.getSpec(), 'goal').agent.m.visited); this.onChange(this.observed); }
    toggle(k) {
      const s = this.getSpec();
      if (k === '1,1') return;
      if (this.observed.has(k)) this.observed.delete(k);
      else { if (s.pits.includes(k) || s.wumpus === k) return; this.observed.add(k); }
      this.onChange(this.observed);
    }
  };

  /* Standard overlay: observed squares, and P(pit) / P(wumpus) for the rest. */
  W.probCells = function (spec, observed, post, { focus, mode = 'risk' } = {}) {
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (observed.has(k)) {
        const pc = W.perceptsAt(spec, k);
        o.fill = 'var(--accent)'; o.alpha = 0.16; o.sub = [pc.breeze && 'B', pc.stench && 'S'].filter(Boolean).join(' ') || '—';
      } else {
        const pp = post.pit.get(k), pw = post.wumpus.get(k), r = post.risk.get(k);
        const v = mode === 'pit' ? pp : mode === 'wumpus' ? pw : r;
        o.fill = `rgba(208,69,58,${Math.min(0.75, 0.08 + 0.8 * (v || 0))})`; o.alpha = 1;
        o.label = isNaN(v) ? '—' : (v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0) + '%';
        o.labelColor = 'var(--ink)'; o.labelSize = 13;
        o.sub = `P ${fmtP(pp)} · W ${fmtP(pw)}`;
      }
      if (k === focus) o.ring = 'var(--gold)';
      cells[k] = o;
    }
    return cells;
  };
  const fmtP = v => isNaN(v) ? '—' : v === 0 ? '0' : v === 1 ? '1' : v.toFixed(2);
  W.fmtP = fmtP;

  /* ---------- the probabilistic agent (Chapter 12) ----------
   * Like the goal-based agent, but when nothing is provably safe it steps into the frontier square with the
   * lowest exact risk, as long as that risk is below the threshold τ; otherwise it goes home. */
  W.ProbAgent = class {
    constructor(n, { tau = 0.3, p = 0.2 } = {}) {
      this.n = n; this.tau = tau; this.p = p; this.m = new W.Model(n);
      this.plan = []; this.planCells = []; this.post = null; this.postKey = ''; this.why = ''; this.choice = null;
    }
    posterior() {
      const key = [...this.m.visited].sort().join(';') + this.m.wumpusDead;
      if (key !== this.postKey) { this.post = W.posteriorObs(this.n, new Map([...this.m.seen].map(([k, v]) => [k, { breeze: v.breeze, stench: v.stench }])), { p: this.p, wumpusDead: this.m.wumpusDead }); this.postKey = key; }
      return this.post;
    }
    route(goal, extra) { return W.planRoute(this.m, k => this.m.visited.has(k) || (this.post.risk.get(k) < 1e-9) || (extra && extra === k), goal); }
    decide(pc) {
      const m = this.m;
      if (pc.glitter) { this.plan = []; return { action: 'Grab', why: 'Glitter: grab the gold.' }; }
      if (this.plan.length) return { action: this.plan.shift(), why: this.why };
      const post = this.posterior();
      const home = () => { const r = this.route((x, y) => x === 1 && y === 1); this.plan = r.actions.concat(['Climb']); this.planCells = r.cells; };
      if (m.hasGold) { home(); this.why = 'Bring the gold home.'; return { action: this.plan.shift(), why: this.why }; }
      const unvisited = W.cells(this.n).map(c => W.key(...c)).filter(k => !m.visited.has(k));
      const safe = new Set(unvisited.filter(k => post.risk.get(k) < 1e-9));
      if (safe.size) { const r = this.route((x, y) => safe.has(W.key(x, y))); if (r) { this.plan = r.actions; this.planCells = r.cells; this.why = 'Explore the nearest square with zero risk.'; this.choice = null; return { action: this.plan.shift(), why: this.why }; } }
      // the wumpus is located for certain: shoot it from a safe square in line with it
      const wAt = unvisited.find(k => post.wumpus.get(k) > 1 - 1e-9);
      if (wAt && m.hasArrow && !m.wumpusDead) {
        const [wx, wy] = W.parse(wAt);
        const facing = (x, y, d) => (d === 'E' && y === wy && wx > x) || (d === 'W' && y === wy && wx < x) || (d === 'N' && x === wx && wy > y) || (d === 'S' && x === wx && wy < y);
        const r = this.route(facing);
        if (r) { this.plan = r.actions.concat(['Shoot']); this.planCells = r.cells; this.choice = wAt; this.why = `The wumpus must be in [${wAt}] (P = 1): shoot it.`; return { action: this.plan.shift(), why: this.why }; }
      }
      const frontier = unvisited.filter(k => m.nb(k).some(v => m.visited.has(v))).sort((a, b) => post.risk.get(a) - post.risk.get(b));
      const best = frontier[0];
      if (best && post.risk.get(best) <= this.tau) {
        const r = this.route((x, y) => W.key(x, y) === best, best);
        if (r) { this.plan = r.actions; this.planCells = r.cells; this.choice = best; this.why = `No safe square: take the least risky one, [${best}] (risk ${(post.risk.get(best) * 100).toFixed(1)}% ≤ τ).`; return { action: this.plan.shift(), why: this.why }; }
      }
      home(); this.why = best ? `Least risky square [${best}] has risk ${(post.risk.get(best) * 100).toFixed(1)}% > τ = ${(this.tau * 100).toFixed(0)}%: go home.` : 'Nothing left to explore: go home.';
      return { action: this.plan.shift(), why: this.why };
    }
    step(pc) {
      this.m.update(pc);
      const d = this.decide(pc);
      this.m.lastAction = d.action;
      if (d.action === 'Grab' && pc.glitter) this.m.hasGold = true;
      return d;
    }
  };
  W.runProbEpisode = function (spec, opts = {}, maxSteps = 300) {
    const env = new W.Env(spec), ag = new W.ProbAgent(spec.size, Object.assign({ p: spec.pitProb != null ? spec.pitProb : 0.2 }, opts)), steps = [];
    while (!env.s.done && steps.length < maxSteps) {
      const state = env.snapshot(), pc = env.percept(), d = ag.step(pc);
      steps.push({ state, percept: pc, action: d.action, why: d.why, visited: new Set(ag.m.visited), post: ag.post, plan: ag.plan.slice(), planCells: ag.planCells.slice(), choice: ag.choice });
      env.execute(d.action);
    }
    steps.push({ state: env.snapshot(), percept: env.percept(), action: null, why: 'Episode over: ' + env.s.event + '.', visited: new Set(ag.m.visited), post: ag.post, plan: [], planCells: [] });
    return steps;
  };

  /* ---------- small numeric helpers ---------- */
  W.lgamma = function (x) {   // Lanczos approximation
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - W.lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  W.betaPdf = (x, a, b) => x <= 0 || x >= 1 ? 0 : Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + W.lgamma(a + b) - W.lgamma(a) - W.lgamma(b));
})(window.W);
