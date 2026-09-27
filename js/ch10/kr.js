/* Chapter 10: knowledge representation in the Wumpus World.
 *   ontology (categories, inheritance, exceptions) · event calculus over an episode · a justification-based
 *   truth maintenance system (JTMS) for default reasoning.
 */
(function (W) {
  'use strict';

  /* ================= Ontology (§10.2) ================= */
  W.ontology = function (spec) {
    const n = spec.size, sq = W.cells(n).map(c => W.key(...c));
    const deg = k => W.neighbors(...W.parse(k), n).length;
    const cats = [
      { id: 'Thing', parent: null, props: [] },
      { id: 'Square', parent: 'Thing', props: ['has a position [x, y]', 'can contain objects'], members: sq.map(k => ({ label: `[${k}]`, at: k })) },
      { id: 'CornerSquare', parent: 'Square', props: ['has exactly 2 neighbours'], members: sq.filter(k => deg(k) === 2).map(k => ({ label: `[${k}]`, at: k })) },
      { id: 'EdgeSquare', parent: 'Square', props: ['has exactly 3 neighbours'], members: sq.filter(k => deg(k) === 3).map(k => ({ label: `[${k}]`, at: k })) },
      { id: 'InnerSquare', parent: 'Square', props: ['has 4 neighbours'], members: sq.filter(k => deg(k) === 4).map(k => ({ label: `[${k}]`, at: k })) },
      { id: 'PhysicalObject', parent: 'Thing', props: ['is At exactly one square at a time'] },
      { id: 'Agent', parent: 'PhysicalObject', props: ['perceives and acts', 'can die'], members: [{ label: 'Agent', at: '1,1' }] },
      { id: 'Treasure', parent: 'PhysicalObject', props: ['can be grabbed', 'worth 1000 points out of the cave'] },
      { id: 'Gold', parent: 'Treasure', props: ['Glitter in its own square'], members: spec.gold ? [{ label: 'Gold', at: spec.gold }] : [] },
      { id: 'Hazard', parent: 'PhysicalObject', props: ['Deadly (default): entering its square kills the agent', 'can be sensed from adjacent squares'] },
      { id: 'Pit', parent: 'Hazard', props: ['Stationary', 'causes a Breeze in adjacent squares'], members: spec.pits.map(k => ({ label: `Pit@[${k}]`, at: k })) },
      { id: 'Wumpus', parent: 'Hazard', props: ['causes a Stench in its own and adjacent squares', 'can be killed by the arrow', 'EXCEPTION: a dead wumpus is not Deadly'], members: spec.wumpus ? [{ label: 'Wumpus', at: spec.wumpus }] : [] },
      { id: 'Percept', parent: 'Thing', props: ['is received by the agent at one time step'] },
      { id: 'Breeze', parent: 'Percept', props: ['caused by an adjacent Pit'] },
      { id: 'Stench', parent: 'Percept', props: ['caused by the Wumpus here or adjacent'] },
      { id: 'Glitter', parent: 'Percept', props: ['caused by Gold here'] },
      { id: 'Bump', parent: 'Percept', props: ['caused by walking into a wall'] },
      { id: 'Scream', parent: 'Percept', props: ['caused by the wumpus dying'] },
      { id: 'Action', parent: 'Thing', props: ['is an event performed by the agent', 'costs 1 point'] },
      { id: 'Forward', parent: 'Action', props: ['Initiates At(Agent, next square)', 'Terminates At(Agent, current square)'] },
      { id: 'Turn', parent: 'Action', props: ['changes Facing'] },
      { id: 'Shoot', parent: 'Action', props: ['Terminates HaveArrow', 'may Terminate WumpusAlive', 'costs 10 extra points'] },
      { id: 'Grab', parent: 'Action', props: ['Initiates HaveGold'] },
      { id: 'Climb', parent: 'Action', props: ['ends the episode (only at [1,1])'] },
    ];
    const byId = new Map(cats.map(c => [c.id, c]));
    for (const c of cats) c.children = cats.filter(d => d.parent === c.id).map(d => d.id);
    // members of a category include members of its subcategories
    const allMembers = id => { const c = byId.get(id); return (c.members || []).concat(...c.children.map(allMembers)).filter((m, i, a) => a.findIndex(z => z.label === m.label) === i); };
    const chain = id => { const out = []; for (let c = byId.get(id); c; c = byId.get(c.parent)) out.push(c); return out; };
    return { cats, byId, allMembers, chain };
  };

  /* ================= Event calculus over an episode (§10.3) ================= */
  W.fluentsOf = function (st) {
    const f = [];
    if (st.alive && !st.climbed) f.push(`At(Agent, [${st.x},${st.y}])`, `Facing(Agent, ${st.dir})`);
    if (st.alive) f.push('Alive(Agent)');
    if (st.hasArrow) f.push('HaveArrow(Agent)');
    if (st.hasGold) f.push('HaveGold(Agent)');
    if (st.wumpusAlive) f.push('Alive(Wumpus)');
    if (st.climbed) f.push('Out(Agent)');
    return f;
  };
  W.eventCalculus = function (steps) {
    const T = steps.length, holds = steps.map(s => new Set(W.fluentsOf(s.state)));
    const all = [...new Set(holds.flatMap(h => [...h]))];
    const order = f => ['At', 'Facing', 'Alive(Agent', 'HaveArrow', 'HaveGold', 'Alive(Wumpus', 'Out'].findIndex(p => f.startsWith(p));
    all.sort((a, b) => order(a) - order(b) || a.localeCompare(b, undefined, { numeric: true }));
    const events = steps.map((s, t) => {
      if (!s.action || t + 1 >= T) return null;
      const init = [...holds[t + 1]].filter(f => !holds[t].has(f)), term = [...holds[t]].filter(f => !holds[t + 1].has(f));
      return { t, e: s.action, init, term };
    });
    return { T, holds, fluents: all, events };
  };

  /* ================= Default reasoning with a JTMS (§10.6) ================= */
  // The agent owns a treasure map (it knows where the gold is) but not where the hazards are.
  // It plans through squares that are proved Safe OR only *assumed* safe by default, and replans
  // whenever the TMS retracts an assumption its route depended on.
  W.tmsRun = function (spec, maxSteps = 80) {
    const n = spec.size, pits = new Set(spec.pits), all = W.cells(n).map(c => W.key(...c));
    const nb = k => W.neighbors(...W.parse(k), n).map(c => W.key(...c));
    const percept = k => ({ breeze: nb(k).some(c => pits.has(c)), stench: !!spec.wumpus && (spec.wumpus === k || nb(k).includes(spec.wumpus)) });
    const visited = new Set(), seen = new Map();
    let at = '1,1', route = [], prevLabels = null, gotGold = false;
    const steps = [];

    function label() {
      const L = new Map();   // node → { in: bool, why: string }
      const set = (node, inn, why) => L.set(node, { in: inn, why });
      for (const v of visited) {
        const p = seen.get(v);
        set(`Visited(${v})`, true, 'premise (the agent was there)');
        set(`${p.breeze ? 'Breeze' : 'NoBreeze'}(${v})`, true, 'premise (percept)');
        set(`${p.stench ? 'Stench' : 'NoStench'}(${v})`, true, 'premise (percept)');
      }
      const isIn = k => L.has(k) && L.get(k).in;
      for (const s of all) {
        let why = null;
        if (isIn(`Visited(${s})`)) why = `Visited(${s})`; else { const v = nb(s).find(v => isIn(`NoBreeze(${v})`)); if (v) why = `NoBreeze(${v})`; }
        set(`NoPit(${s})`, !!why, why ? `IN because ${why}` : 'no justification valid');
        why = null;
        if (isIn(`Visited(${s})`)) why = `Visited(${s})`; else { const v = nb(s).find(v => isIn(`NoStench(${v})`)); if (v) why = `NoStench(${v})`; }
        set(`NoWumpus(${s})`, !!why, why ? `IN because ${why}` : 'no justification valid');
        set(`Safe(${s})`, isIn(`NoPit(${s})`) && isIn(`NoWumpus(${s})`), isIn(`NoPit(${s})`) && isIn(`NoWumpus(${s})`) ? `IN because NoPit(${s}) and NoWumpus(${s})` : `needs NoPit(${s}) and NoWumpus(${s}) both IN`);
      }
      for (const s of all) {
        const b = nb(s).find(v => isIn(`Breeze(${v})`));
        set(`PitSuspected(${s})`, !!b && !isIn(`NoPit(${s})`), b ? (isIn(`NoPit(${s})`) ? `OUT: NoPit(${s}) is IN` : `IN because Breeze(${b}) and NoPit(${s}) is OUT`) : 'no adjacent breeze');
        const st = [s].concat(nb(s)).find(v => isIn(`Stench(${v})`));
        set(`WumpusSuspected(${s})`, !!st && !isIn(`NoWumpus(${s})`), st ? (isIn(`NoWumpus(${s})`) ? `OUT: NoWumpus(${s}) is IN` : `IN because Stench(${st}) and NoWumpus(${s}) is OUT`) : 'no stench nearby');
      }
      for (const s of all) {
        const blockers = [`PitSuspected(${s})`, `WumpusSuspected(${s})`].filter(isIn);
        const inn = !isIn(`Safe(${s})`) && !blockers.length;
        set(`AssumedSafe(${s})`, inn, isIn(`Safe(${s})`) ? 'not needed: Safe is proved' : blockers.length ? `OUT because ${blockers.join(' and ')} is IN` : 'IN by default: nothing suggests danger (out-list PitSuspected, WumpusSuspected is empty)');
      }
      return L;
    }
    const passable = (L, k) => L.get(`Safe(${k})`).in || L.get(`AssumedSafe(${k})`).in;
    function bfs(L, from, goalFn, onlySafe) {
      const q = [from], prev = new Map([[from, null]]);
      while (q.length) {
        const s = q.shift();
        if (goalFn(s) && s !== from) { const path = []; for (let x = s; x; x = prev.get(x)) path.unshift(x); return path; }
        for (const t of nb(s)) if (!prev.has(t) && (onlySafe ? (L.get(`Safe(${t})`).in) : passable(L, t))) { prev.set(t, s); q.push(t); }
      }
      return null;
    }

    for (let step = 0; step < maxSteps; step++) {
      if (!visited.has(at)) { visited.add(at); seen.set(at, percept(at)); }
      if (at === spec.gold) gotGold = true;
      const L = label();
      const changes = [];
      if (prevLabels) for (const [k, v] of L) {
        const o = prevLabels.get(k);
        if (!o || o.in === v.in || /^(Visited|Breeze|NoBreeze|Stench|NoStench)/.test(k)) continue;
        const sq = k.slice(k.indexOf('(') + 1, -1);
        if (k.startsWith('AssumedSafe') && !v.in && L.get(`Safe(${sq})`).in) changes.push({ node: k, to: false, why: 'assumption confirmed: Safe is now proved', confirmed: true });
        else changes.push({ node: k, to: v.in, why: v.why, defeated: k.startsWith('AssumedSafe') && !v.in });
      }
      let why = '', broken = null;
      // is the current route still justified?
      if (route.length) {
        const bad = route.find(k => !passable(L, k));
        if (bad) { broken = bad; why = `Route retracted: it relied on AssumedSafe(${bad}), which is now OUT (${L.get(`AssumedSafe(${bad})`).why}).`; route = []; }
      }
      const goalSq = gotGold ? '1,1' : spec.gold;
      if (!route.length) {
        const p = goalSq && bfs(L, at, s => s === goalSq, false);
        if (p) { route = p.slice(1); why = (why ? why + ' ' : '') + `New plan to ${gotGold ? 'go home' : 'reach the gold'} through proved-safe and assumed-safe squares: ${route.map(k => '[' + k + ']').join(' → ')}.`; }
        else {
          const e = bfs(L, at, s => !visited.has(s) && L.get(`Safe(${s})`).in, true);
          if (e) { route = e.slice(1); why = (why ? why + ' ' : '') + 'No route to the goal even with defaults: explore the nearest proved-safe square instead.'; }
        }
      }
      const done = (gotGold && at === '1,1') || (!route.length);
      const next = route[0];
      // never step on a square that is only assumed: it must be proved Safe first (defaults are for planning)
      const canStep = next && L.get(`Safe(${next})`).in;
      steps.push({ at, labels: L, route: route.slice(), changes, why: why || (route.length ? 'Route still justified, continue.' : ''), broken, gotGold, visited: new Set(visited),
        done: done ? (gotGold && at === '1,1' ? 'home with the gold' : 'no justified route or safe square left') : null, waiting: next && !canStep });
      if (done) break;
      if (!canStep) {
        // the next square is only assumed safe: first go learn more by exploring a proved-safe square
        const e = bfs(L, at, s => !visited.has(s) && L.get(`Safe(${s})`).in, true);
        if (!e) { steps[steps.length - 1].done = 'next square only assumed safe and nothing left to verify it'; break; }
        route = e.slice(1).concat(route.slice(0));
        at = route.shift();
      } else at = route.shift();
      prevLabels = L;
    }
    return steps;
  };
})(window.W);
