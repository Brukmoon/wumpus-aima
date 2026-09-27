/* Chapter 2 agent programs. Each agent exposes:
 *   rules: [{id, text}]           the condition–action rules / goals it uses (shown in the UI)
 *   step(percept) → {action, rule, why}
 *   view() → {cells, paths, notes, table}   what the agent currently believes (for the "agent's view" grid)
 */
(function (W) {
  'use strict';

  /* ---------- Shared world model used by the model-based agents ----------
   * Knows its own pose (from its actions + Bump), which squares it visited, what it perceived there,
   * and the two simplest inferences: no breeze here ⇒ neighbours have no pit, no stench ⇒ no wumpus. */
  class Model {
    constructor(n) {
      this.n = n; this.x = 1; this.y = 1; this.dir = 'E';
      this.hasGold = false; this.hasArrow = true; this.wumpusDead = false;
      this.visited = new Set(); this.seen = new Map(); this.lastAction = null;
    }
    update(p) {
      if (this.lastAction === 'Forward' && !p.bump) { this.x += W.DV[this.dir][0]; this.y += W.DV[this.dir][1]; }
      if (this.lastAction === 'TurnLeft') this.dir = W.left(this.dir);
      if (this.lastAction === 'TurnRight') this.dir = W.right(this.dir);
      if (this.lastAction === 'Shoot') this.hasArrow = false;
      if (p.scream) this.wumpusDead = true;
      const k = this.k;
      this.visited.add(k); this.seen.set(k, p);
    }
    get k() { return W.key(this.x, this.y); }
    nb(k) { const [x, y] = W.parse(k); return W.neighbors(x, y, this.n).map(([a, b]) => W.key(a, b)); }
    noPit(k) { return this.visited.has(k) || this.nb(k).some(v => this.visited.has(v) && !this.seen.get(v).breeze); }
    noWumpus(k) { return this.wumpusDead || this.visited.has(k) || this.nb(k).some(v => this.visited.has(v) && !this.seen.get(v).stench); }
    safe(k) { return this.noPit(k) && this.noWumpus(k); }
    allCells() { return W.cells(this.n).map(([x, y]) => W.key(x, y)); }
    safeUnvisited() { return this.allCells().filter(k => !this.visited.has(k) && this.safe(k)); }
    frontier() { return this.allCells().filter(k => !this.visited.has(k) && this.nb(k).some(v => this.visited.has(v))); }
    // Squares where the wumpus could be: not ruled out, and adjacent to every stench square seen.
    wumpusCandidates() {
      if (this.wumpusDead) return [];
      let c = this.allCells().filter(k => !this.noWumpus(k));
      for (const [v, p] of this.seen) if (p.stench) { const nb = new Set(this.nb(v)); c = c.filter(k => nb.has(k)); }
      return c;
    }
    anyStench() { for (const p of this.seen.values()) if (p.stench) return true; return false; }

    /* Standard overlay for the agent's view. */
    cells(extra) {
      const out = {};
      for (const k of this.allCells()) {
        const o = {};
        if (this.visited.has(k)) {
          o.fill = 'var(--accent)'; o.alpha = 0.16;
          const p = this.seen.get(k);
          o.sub = ['breeze', 'stench', 'glitter'].filter(f => p[f]).map(f => f[0].toUpperCase()).join(' ') || '—';
        } else if (this.safe(k)) { o.label = 'OK'; o.labelColor = 'var(--safe)'; o.ring = 'var(--safe)'; }
        else {
          const tags = [];
          if (!this.noPit(k) && this.nb(k).some(v => this.visited.has(v) && this.seen.get(v).breeze)) tags.push('P?');
          if (!this.noWumpus(k) && this.anyStench() && this.wumpusCandidates().includes(k)) tags.push('W?');
          if (tags.length) { o.label = tags.join(' '); o.labelColor = 'var(--maybe)'; }
        }
        out[k] = o;
      }
      if (extra) for (const k in extra) Object.assign(out[k] = out[k] || {}, extra[k]);
      return out;
    }
  }
  W.Model = Model;

  // Action that turns toward / steps into an adjacent square.
  function toward(m, target) {
    const [tx, ty] = W.parse(target);
    const d = W.DIRS.find(d => m.x + W.DV[d][0] === tx && m.y + W.DV[d][1] === ty);
    if (m.dir === d) return 'Forward';
    return W.left(m.dir) === d ? 'TurnLeft' : 'TurnRight';
  }

  /* Breadth-first route planner over (x, y, dir) using only `allowed` squares.
   * goal(x, y, dir) decides success. Returns {actions, cells} or null. (Chapter 3 will explain this properly.) */
  function plan(m, allowed, goal) {
    const start = { x: m.x, y: m.y, d: m.dir, parent: null, a: null };
    const id = s => s.x + ',' + s.y + ',' + s.d;
    const q = [start], seen = new Set([id(start)]);
    while (q.length) {
      const s = q.shift();
      if (goal(s.x, s.y, s.d)) {
        const actions = [], cells = [];
        for (let t = s; t; t = t.parent) { if (t.a) actions.unshift(t.a); cells.unshift([t.x, t.y]); }
        return { actions, cells: cells.filter((c, i) => !i || c[0] !== cells[i - 1][0] || c[1] !== cells[i - 1][1]) };
      }
      const nx = s.x + W.DV[s.d][0], ny = s.y + W.DV[s.d][1];
      const next = [['TurnLeft', s.x, s.y, W.left(s.d)], ['TurnRight', s.x, s.y, W.right(s.d)]];
      if (W.inside(nx, ny, m.n) && allowed(W.key(nx, ny))) next.unshift(['Forward', nx, ny, s.d]);
      for (const [a, x, y, d] of next) {
        const c = { x, y, d, parent: s, a };
        if (!seen.has(id(c))) { seen.add(id(c)); q.push(c); }
      }
    }
    return null;
  }
  W.planRoute = plan;

  /* ================= 1. Simple reflex agent ================= */
  W.SimpleReflexAgent = class {
    constructor(n, rng, randomized) {
      this.randomized = randomized; this.rng = rng;
      this.name = randomized ? 'Randomized reflex agent' : 'Simple reflex agent';
      this.rules = randomized ? [
        { id: 'r1', text: 'Glitter → Grab' },
        { id: 'r2', text: 'Breeze ∨ Stench → random(Climb, TurnLeft, TurnRight, Forward)' },
        { id: 'r3', text: 'Bump → random(TurnLeft, TurnRight)' },
        { id: 'r4', text: 'otherwise → random(Forward ×2, TurnLeft, TurnRight)' },
      ] : [
        { id: 'r1', text: 'Glitter → Grab' },
        { id: 'r2', text: 'Breeze ∨ Stench → Climb' },
        { id: 'r3', text: 'Bump → TurnLeft' },
        { id: 'r4', text: 'otherwise → Forward' },
      ];
      this.last = null;
    }
    pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
    step(p) {
      this.last = p;
      if (p.glitter) return { action: 'Grab', rule: 'r1', why: 'Sees glitter.' };
      if (p.breeze || p.stench) return this.randomized
        ? { action: this.pick(['Climb', 'TurnLeft', 'TurnRight', 'Forward']), rule: 'r2', why: 'Danger nearby. Randomness lets it escape the loop the deterministic version gets stuck in.' }
        : { action: 'Climb', rule: 'r2', why: 'Danger nearby. Climb only works at [1,1]; anywhere else it does nothing, and with no memory the agent repeats it forever.' };
      if (p.bump) return { action: this.randomized ? this.pick(['TurnLeft', 'TurnRight']) : 'TurnLeft', rule: 'r3', why: 'Hit a wall.' };
      return { action: this.randomized ? this.pick(['Forward', 'Forward', 'TurnLeft', 'TurnRight']) : 'Forward', rule: 'r4', why: 'Nothing perceived.' };
    }
    view() {
      return { cells: {}, notes: 'No internal state. The agent sees only the current percept ' + (this.last ? W.perceptTuple(this.last) : '') + '. It doesn’t know where it is, whether it holds the gold, or where it has been.' };
    }
  };

  /* ================= 2. Model-based reflex agent ================= */
  W.ModelReflexAgent = class {
    constructor(n) {
      this.name = 'Model-based reflex agent';
      this.m = new Model(n); this.trail = [];
      this.rules = [
        { id: 'm1', text: 'Glitter → Grab' },
        { id: 'm2', text: 'HaveGold ∧ At[1,1] → Climb' },
        { id: 'm3', text: 'HaveGold → retrace trail one step toward [1,1]' },
        { id: 'm4', text: 'adjacent square known OK and unvisited → go there' },
        { id: 'm5', text: 'At[1,1] (nothing OK left) → Climb' },
        { id: 'm6', text: 'otherwise → backtrack one step along trail' },
      ];
    }
    step(p) {
      const m = this.m; m.update(p);
      const k = m.k, t = this.trail;
      if (t.length >= 2 && t[t.length - 2] === k) t.pop(); else if (t[t.length - 1] !== k) t.push(k);
      const r = (action, rule, why) => { m.lastAction = action; if (action === 'Grab' && p.glitter) m.hasGold = true; return { action, rule, why }; };
      if (p.glitter) return r('Grab', 'm1', 'Glitter here.');
      if (m.hasGold && k === '1,1') return r('Climb', 'm2', 'Home with the gold.');
      if (m.hasGold) return r(toward(m, t[t.length - 2]), 'm3', 'Heading back along the remembered trail.');
      const ok = m.nb(k).filter(v => !m.visited.has(v) && m.safe(v));
      if (ok.length) {
        const ahead = W.key(m.x + W.DV[m.dir][0], m.y + W.DV[m.dir][1]);
        return r(toward(m, ok.includes(ahead) ? ahead : ok[0]), 'm4', 'Neighbour ' + (ok.includes(ahead) ? ahead : ok[0]) + ' is known OK.');
      }
      if (k === '1,1') return r('Climb', 'm5', 'Nothing safe left to explore from here.');
      return r(toward(m, t[t.length - 2]), 'm6', 'Dead end, backtracking.');
    }
    view() {
      return { cells: this.m.cells(), paths: [{ pts: this.trail.map(W.parse), color: 'var(--muted)', dash: true, width: 2 }],
        notes: 'Model: own position and heading, visited squares with their percepts, and one-step inference (no breeze ⇒ neighbours have no pit, no stench ⇒ neighbours have no wumpus). Dashed line: the remembered trail.' };
    }
  };

  /* ================= 3. Goal-based agent ================= */
  W.GoalAgent = class {
    constructor(n) {
      this.name = 'Goal-based agent';
      this.m = new Model(n); this.plan = []; this.planCells = []; this.planRule = null; this.planWhy = '';
      this.rules = [
        { id: 'g1', text: 'Glitter → Grab' },
        { id: 'g2', text: 'goal HaveGold ⇒ plan: shortest safe route to [1,1], then Climb' },
        { id: 'g3', text: 'goal Explore ⇒ plan: shortest route to the nearest OK unvisited square' },
        { id: 'g4', text: 'nothing OK left ⇒ plan: route home, then Climb' },
        { id: 'g0', text: 'plan in progress → execute next action' },
      ];
    }
    allowed(k) { return this.m.visited.has(k) || this.m.safe(k); }
    makePlan(goalFn, then, rule, why) {
      const r = W.planRoute(this.m, k => this.allowed(k), goalFn);
      if (!r) return false;
      this.plan = r.actions.concat(then || []); this.planCells = r.cells; this.planRule = rule; this.planWhy = why;
      return true;
    }
    decide(p) {
      const m = this.m;
      if (p.glitter) { this.plan = []; return { action: 'Grab', rule: 'g1', why: 'Glitter here.' }; }
      if (this.plan.length) return { action: this.plan.shift(), rule: 'g0', why: 'Following plan (' + this.planWhy + '). ' + this.plan.length + ' more actions.' };
      if (m.hasGold) { this.makePlan((x, y) => x === 1 && y === 1, ['Climb'], 'g2', 'bring the gold home'); }
      else {
        const targets = new Set(m.safeUnvisited());
        if (!targets.size || !this.makePlan((x, y) => targets.has(W.key(x, y)), [], 'g3', 'explore nearest OK square'))
          this.makePlan((x, y) => x === 1 && y === 1, ['Climb'], 'g4', 'give up and go home');
      }
      return { action: this.plan.shift(), rule: this.planRule, why: 'New plan: ' + this.planWhy + ' (' + (this.plan.length + 1) + ' actions).' };
    }
    step(p) {
      this.m.update(p);
      const d = this.decide(p);
      this.m.lastAction = d.action;
      if (d.action === 'Grab' && p.glitter) this.m.hasGold = true;
      return d;
    }
    view() {
      return { cells: this.m.cells(), paths: this.plan.length ? [{ pts: this.planCells, color: 'var(--frontier)', width: 3 }] : [],
        notes: 'Same model as the reflex agent, but it chooses actions by planning a whole route toward a goal. Purple: the current plan (' + (this.plan.join(', ') || 'none') + ').' };
    }
  };

  /* ================= 4. Utility-based agent ================= */
  W.UtilityAgent = class extends W.GoalAgent {
    constructor(n, rng, opts = {}) {
      super(n);
      this.name = 'Utility-based agent';
      this.V = opts.V != null ? opts.V : 500; this.prior = opts.prior != null ? opts.prior : 0.2;
      this.table = null;
      this.rules = [
        { id: 'g1', text: 'Glitter → Grab' },
        { id: 'g2', text: 'HaveGold ⇒ route home, Climb' },
        { id: 'g3', text: 'OK unvisited square exists ⇒ go there (risk 0)' },
        { id: 'u1', text: 'otherwise ⇒ choose the option with max EU = (1−risk)·V − risk·1000 − cost' },
        { id: 'g0', text: 'plan in progress → execute next action' },
      ];
    }
    risk(k) {
      const m = this.m;
      let pp = 0;
      if (!m.noPit(k)) {
        pp = this.prior;
        for (const b of m.nb(k)) if (m.visited.has(b) && m.seen.get(b).breeze) {
          const u = m.nb(b).filter(v => !m.noPit(v)).length;
          pp = Math.max(pp, 1 / u);
        }
      }
      const cands = m.wumpusCandidates();
      const pw = cands.includes(k) ? 1 / cands.length : 0;
      return { pp, pw, r: 1 - (1 - pp) * (1 - pw) };
    }
    decide(p) {
      const m = this.m;
      if (p.glitter || this.plan.length || m.hasGold || m.safeUnvisited().length) {
        const d = super.decide(p);
        if (d.rule === 'g4') return this.gamble(p);   // parent gave up: we evaluate risky options instead
        if (d.rule !== 'g0') this.table = null;
        return d;
      }
      return this.gamble(p);
    }
    gamble() {
      const m = this.m, opts = [];
      const home = W.planRoute(m, k => this.allowed(k), (x, y) => x === 1 && y === 1);
      opts.push({ name: 'Go home & Climb', eu: -(home.actions.length + 1), risk: 0, plan: home.actions.concat(['Climb']), cells: home.cells });
      for (const k of m.frontier()) {
        if (m.safe(k)) continue;
        const { pp, pw, r } = this.risk(k);
        const route = W.planRoute(m, v => this.allowed(v) || v === k, (x, y) => W.key(x, y) === k);
        if (!route) continue;
        const cost = route.actions.length;
        opts.push({ name: 'Step into ' + k, eu: (1 - r) * this.V - r * 1000 - cost, risk: r, detail: `P(pit)≈${pp.toFixed(2)} P(W)≈${pw.toFixed(2)}`, plan: route.actions, cells: route.cells });
      }
      const cands = m.wumpusCandidates();
      if (m.hasArrow && cands.length === 1) {
        const [wx, wy] = W.parse(cands[0]);
        const facing = (x, y, d) => (x === wx && Math.sign(wy - y) === W.DV[d][1] && W.DV[d][0] === 0) || (y === wy && Math.sign(wx - x) === W.DV[d][0] && W.DV[d][1] === 0);
        const route = W.planRoute(m, k => this.allowed(k), facing);
        if (route) {
          const unlocks = m.noPit(cands[0]);
          opts.push({ name: 'Shoot wumpus at ' + cands[0], eu: (unlocks ? this.V : 0) - route.actions.length - 11, risk: 0, detail: unlocks ? 'square becomes OK' : 'square may still hold a pit', plan: route.actions.concat(['Shoot']), cells: route.cells });
        }
      }
      opts.sort((a, b) => b.eu - a.eu);
      const best = opts[0];
      this.table = opts;
      this.plan = best.plan.slice(); this.planCells = best.cells; this.planRule = 'u1'; this.planWhy = best.name;
      return { action: this.plan.shift(), rule: 'u1', why: `Best option: ${best.name} (EU ${best.eu.toFixed(0)}).` };
    }
    view() {
      const extra = {};
      for (const k of this.m.frontier()) if (!this.m.safe(k)) {
        const { r } = this.risk(k);
        extra[k] = { label: Math.round(r * 100) + '%', labelColor: r > 0.3 ? 'var(--danger)' : 'var(--maybe)', fill: 'var(--danger)', alpha: Math.min(0.5, r * 0.6) };
      }
      return { cells: this.m.cells(extra), paths: this.plan.length ? [{ pts: this.planCells, color: 'var(--frontier)', width: 3 }] : [], table: this.table,
        notes: `When no square is known OK, the agent weighs its options. Percentages are rough risk estimates (P(pit) from each breeze shared among candidate squares; P(wumpus) uniform over squares consistent with all stenches). V = ${this.V} is the assumed value of continuing to explore. Chapter 12 computes these probabilities exactly.` };
    }
  };

  W.AGENTS = {
    reflex: { label: 'Simple reflex', make: (n, rng) => new W.SimpleReflexAgent(n, rng, false) },
    rreflex: { label: 'Randomized reflex', make: (n, rng) => new W.SimpleReflexAgent(n, rng, true) },
    model: { label: 'Model-based reflex', make: n => new W.ModelReflexAgent(n) },
    goal: { label: 'Goal-based', make: n => new W.GoalAgent(n) },
    utility: { label: 'Utility-based', make: (n, rng, o) => new W.UtilityAgent(n, rng, o) },
  };

  /* Run an agent to completion (or maxSteps) and record every step for the player. */
  W.runEpisode = function (spec, agentKey, { maxSteps = 200, opts } = {}) {
    const env = new W.Env(spec);
    const rng = W.rng((typeof spec.seed === 'number' ? spec.seed : 99) * 7919 + 13);
    const agent = W.AGENTS[agentKey].make(spec.size, rng, opts);
    const steps = [], seenSit = new Map();
    const memoryless = agent instanceof W.SimpleReflexAgent && !agent.randomized;
    while (!env.s.done && steps.length < maxSteps) {
      const state = env.snapshot(), percept = env.percept();
      // A deterministic memoryless agent in the same situation twice will repeat itself forever.
      if (memoryless) {
        const sit = `${state.x},${state.y},${state.dir},${W.perceptText(percept)},${state.goldTaken}`;
        if (seenSit.has(sit)) {
          steps.push({ state, percept, action: null, rule: null, view: agent.view(), loop: true,
            why: `Infinite loop detected: same square, heading and percept as at step ${seenSit.get(sit)}. The agent has no memory, so it will choose the same actions again forever (§2.4.2). ${percept.breeze || percept.stench ? 'Here the rule “Breeze ∨ Stench → Climb” keeps firing: Climb only works at [1,1], and the agent cannot know it is somewhere else.' : 'It keeps walking the same circuit between walls.'} Try the randomized reflex agent, which escapes the loop but may walk into a pit.` });
          return { agent, steps };
        }
        seenSit.set(sit, steps.length);
      }
      const d = agent.step(percept);
      steps.push({ state, percept, action: d.action, rule: d.rule, why: d.why, view: agent.view() });
      env.execute(d.action);
    }
    let why = env.s.done ? 'Episode over: ' + env.s.event + '.' : `Stopped after ${maxSteps} actions (probably stuck in a loop).`;
    if (!env.s.alive && agent instanceof W.SimpleReflexAgent)
      why += ' Expected for this agent: every square next to a pit is breezy, and with no memory it cannot tell which neighbour is dangerous. Each random Forward from a breezy or smelly square is a gamble, and over a long episode one of them eventually loses.';
    steps.push({ state: env.snapshot(), percept: env.percept(), action: null, rule: null, view: agent.view(), why });
    return { agent, steps };
  };
})(window.W);
