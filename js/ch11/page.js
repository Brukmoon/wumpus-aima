(function () {
  'use strict';
  W.topbar('Ch. 11 · Automated Planning');
  const $ = id => document.getElementById(id);

  let spec, D, player = null, run = null, satToken = 0;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; build(); }, sizes: [4, 5, 6] });
  spec = wp.spec;
  const tabs = new W.Tabs($('tabs'), [['fwd', 'Forward search'], ['bwd', 'Backward search'], ['graph', 'Planning graph & comparison'], ['sat', 'SATPlan'], ['htn', 'Hierarchical view']], () => setup(), 'ch11.tab');

  function build() {
    D = new W.PlanDomain(spec);
    $('pddl').textContent = D.pddl();
    $('pcount').textContent = `${D.actions.length} ground actions (${D.actions.filter(a => a.kind === 'move').length} Move, ${D.actions.filter(a => a.kind === 'shoot').length} Shoot, Grab, Climb)`;
    setup();
  }
  function layout(right, withTree) {
    $('content').innerHTML = `<div class="grid2"><div class="panel"><div id="grid"></div></div><div class="panel stack" id="right">${right}</div></div>
      <div id="player" style="margin-top:16px"></div>
      <div class="panel" style="margin-top:16px"><p id="msg" style="margin:0;font-weight:600"></p><div id="info" class="small" style="margin-top:6px"></div></div>
      ${withTree ? '<div class="panel" style="margin-top:16px"><h3>Search tree <span class="hint">hover a node for its state</span></h3><div id="tree"></div></div>' : ''}
      <div class="panel" style="margin-top:16px" id="below"></div>`;
    if (player) { player.pause(); player.disabledKeys = true; }
    player = new W.Player($('player'), { onStep: i => run && run.render(i) });
  }
  const grid = () => new W.GridView($('grid'));
  function setup() { satToken++; run = null; ({ fwd: () => setupSearch('fwd'), bwd: () => setupSearch('bwd'), graph: setupGraph, sat: setupSat, htn: setupHtn })[tabs.cur](); }

  /* ---------- forward / backward search (Chapter 3's engine) ---------- */
  const opt = { fwd: { h: 'hmax', algo: 'astar' }, bwd: { h: 'unsat', algo: 'astar' } };
  function setupSearch(dir) {
    const fwd = dir === 'fwd';
    $('intro').innerHTML = fwd
      ? '<b>Progression</b> (§11.2.1): start from the initial state and apply applicable actions. The state is a set of fluents. The heuristics come for free from the action schemas: <b>h_max</b> and <b>h_FF</b> are computed from a relaxed planning graph that ignores delete lists.'
      : '<b>Regression</b> (§11.2.2): start from the goal and go backward through <b>relevant</b> actions, those that achieve a subgoal without undoing another. A “state” is a set of literals that must hold. Search stops when the initial state satisfies them.';
    layout(`<div class="row small"><label>algorithm <select id="alg"><option value="astar">A*</option><option value="greedy">greedy best-first</option><option value="ucs">uniform-cost</option><option value="bfs">breadth-first</option></select></label>
      <label>heuristic <select id="heu">${Object.entries(fwd ? W.PLAN_H : W.REG_H).map(([k, h]) => `<option value="${k}">${h.label}</option>`).join('')}</select></label></div>
      <div id="pseudo"></div><dl class="kv" id="stats"></dl>`, true);
    $('alg').value = opt[dir].algo; $('heu').value = opt[dir].h;
    $('alg').onchange = e => { opt[dir].algo = e.target.value; setup(); };
    $('heu').onchange = e => { opt[dir].h = e.target.value; setup(); };
    const P = fwd ? new W.ProgressionProblem(D) : new W.RegressionProblem(D);
    const H = (fwd ? W.PLAN_H : W.REG_H)[opt[dir].h].fn;
    const r = W.runSearch(P, opt[dir].algo, { h: H, cap: 40000 });
    const pseudo = new W.Pseudo($('pseudo'));
    const PS = W.PSEUDO[W.ALGOS[opt[dir].algo].pseudo];
    pseudo.set(PS.lines, PS.caption);
    const tree = new W.TreeView($('tree'), { describe: n => `${n.action || '(root)'}\n${P.show(n.state)}\ng=${n.g} h=${n.h}` });
    tree.load(r);
    const G = grid();
    const sol = W.solutionPath(r);
    const planActs = sol.slice(1).map(n => n.action);
    const ordered = fwd ? planActs : planActs.slice().reverse();
    $('below').innerHTML = sol.length ? `<h3>Plan (${ordered.length} actions, cost ${sol[sol.length - 1].g})</h3><div class="mono small">${ordered.map((a, i) => `${i + 1}. ${W.esc(a)}`).join('<br>')}</div>${fwd ? '' : '<p class="small muted">Regression finds the plan backward: read the search path from the goal, then reverse it.</p>'}`
      : `<div class="callout bad">No plan found (${r.status}).</div>`;
    const planCells = [];
    { let at = '1,1'; planCells.push(W.parse(at)); for (const a of ordered) { const m = /^Move\(\[(\d+,\d+)\],\[(\d+,\d+)\]\)$/.exec(a); if (m) { at = m[2]; planCells.push(W.parse(at)); } } }
    run = { render(i) {
      const ev = r.events[i], cur = ev.node != null ? r.nodes[ev.node] : null;
      pseudo.highlight([ev.line]);
      tree.update(i);
      $('msg').textContent = ev.msg;
      const done = i === r.events.length - 1;
      const cells = {};
      if (cur) {
        if (fwd) { const [x, y] = P.cell(cur.state); cells[W.key(x, y)] = { ring: 'var(--gold)' }; }
        else for (const l of cur.state.lits) { const m = /^At\((\d+,\d+)\)$/.exec(l); if (m) cells[m[1]] = { ring: 'var(--gold)', label: 'goal: At', labelColor: 'var(--gold)' }; }
      }
      G.draw({ size: spec.size, spec, showHazards: true, cells, paths: done && sol.length ? [{ pts: planCells, color: 'var(--gold)', width: 4 }] : [] });
      $('info').innerHTML = cur ? `<b>${fwd ? 'state' : 'subgoals'}:</b> <span class="mono">${W.esc(P.show(cur.state))}</span><br><b>g</b> = ${cur.g}, <b>h</b> = ${cur.h}` : '';
      $('stats').innerHTML = [['expanded', ev.expanded], ['generated', ev.generated], ['frontier', ev.frontier], ['result', r.status + (sol.length ? `, cost ${sol[sol.length - 1].g}` : '')], ['time', r.ms.toFixed(0) + ' ms']].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    } };
    player.load(r.events.length);
  }

  /* ---------- planning graph + comparison ---------- */
  function setupGraph() {
    $('intro').innerHTML = 'A <b>planning graph</b> (§11.3) alternates fact levels and action levels. Here it is the <em>relaxed</em> graph, with delete lists and negative preconditions ignored and no mutex links. The level where a fact first appears is a lower bound on the steps needed to achieve it. That gives <b>h_max</b>, and extracting a relaxed plan gives <b>h_FF</b>.';
    layout('<h3>Levels</h3><div id="levels" class="kb" style="max-height:420px"></div>', false);
    $('player').style.display = 'none';
    const R = W.relaxedGraph(D, new Set(D.init));
    const G = grid(), cells = {};
    for (const s of D.squares) { const l = R.level.get(`At(${s})`); cells[s] = { label: l == null ? '∞' : 'At: ' + l, labelColor: 'var(--frontier)' }; }
    if (spec.gold) Object.assign(cells[spec.gold] = cells[spec.gold] || {}, { sub: 'HaveGold: ' + (R.level.get('HaveGold') ?? '∞') });
    Object.assign(cells['1,1'], { sub: 'Out: ' + (R.level.get('Out') ?? '∞') });
    G.draw({ size: spec.size, spec, showHazards: true, cells });
    $('levels').innerHTML = R.layers.map((L, i) => `<div><b>S${i}</b>: ${L.facts.map(W.esc).join(', ') || '—'}</div>${L.acts.length ? `<div class="muted">A${i}: ${L.acts.length} action(s): ${L.acts.slice(0, 8).map(W.esc).join(', ')}${L.acts.length > 8 ? ' …' : ''}</div>` : ''}`).join('');
    $('msg').textContent = `Out first appears at level ${R.level.get('Out') ?? '∞'}: that is h_max for the initial state.`;
    $('info').innerHTML = 'Note: in the relaxed graph At([1,1]) is never deleted, so Climb becomes possible right after Grab. The return trip is ignored. That is exactly how delete relaxation underestimates.';
    // comparison
    const rows = [];
    const trial = (label, P, algo, h) => { const r = W.runSearch(P, algo, { h, cap: 60000 }); const sol = W.solutionPath(r); rows.push(`<tr><td>${label}</td><td class="num">${r.stats.expanded.toLocaleString()}</td><td class="num">${r.stats.generated.toLocaleString()}</td><td class="num">${sol.length ? sol[sol.length - 1].g : '—'}</td><td class="num">${sol.length ? sol.length - 1 : '—'}</td><td class="num">${r.ms.toFixed(0)}</td></tr>`); };
    const PF = new W.ProgressionProblem(D), PB = new W.RegressionProblem(D);
    trial('forward, uniform-cost (h = 0)', PF, 'ucs', W.PLAN_H.zero.fn);
    trial('forward A*, ignore-preconditions', PF, 'astar', W.PLAN_H.goalcount.fn);
    trial('forward A*, h_max', PF, 'astar', W.PLAN_H.hmax.fn);
    trial('forward A*, h_FF', PF, 'astar', W.PLAN_H.hff.fn);
    trial('forward greedy, h_FF', PF, 'greedy', W.PLAN_H.hff.fn);
    trial('backward, uniform-cost', PB, 'ucs', W.REG_H.zero.fn);
    trial('backward A*, unsatisfied subgoals', PB, 'astar', W.REG_H.unsat.fn);
    $('below').innerHTML = `<h3>All planners on this problem</h3><table class="data"><tr><th>planner</th><th class="num">expanded</th><th class="num">generated</th><th class="num">cost</th><th class="num">actions</th><th class="num">ms</th></tr>${rows.join('')}</table>`;
  }

  /* ---------- SATPlan ---------- */
  function setupSat() {
    $('intro').innerHTML = '<b>SATPlan</b>: planning as satisfiability (§7.7.4 and §11.2). For horizon T = 1, 2, … encode “a plan of length T exists” as propositional clauses: initial state, preconditions, successor-state axioms, action exclusion, and goal Out<sup>T</sup>. Then run Chapter 7\'s DPLL. The first satisfiable T gives a shortest plan. (Shooting is left out to keep the encoding small, so the wumpus square counts as blocked.)';
    layout(`<h3>Horizon by horizon</h3><div id="sattable"></div><div class="row"><button id="satgo" class="primary">Run SATPlan</button><label class="small">max T <input id="satmax" type="number" value="${Math.min(18, 4 * spec.size)}" min="1" max="30"></label></div>`, false);
    $('player').style.display = 'none';
    const G = grid();
    G.draw({ size: spec.size, spec, showHazards: true });
    $('satgo').onclick = () => {
      const token = ++satToken, maxT = +$('satmax').value, rows = [];
      const R = W.relaxedGraph(D, new Set(D.init)), lb = Math.max(1, R.level.get('Out') || 1);
      let T = 1;
      const stepT = () => {
        if (token !== satToken) return;
        if (T < lb) { rows.push(`<tr class="muted"><td>${lb > 2 ? `1–${lb - 1}` : T}</td><td colspan="4">skipped: below the planning-graph lower bound ${lb}</td></tr>`); T = lb; }
        const r = W.satplan(D, T);
        rows.push(`<tr class="${r.sat ? 'best' : ''}"><td>${T}</td><td class="num">${r.symbols.toLocaleString()}</td><td class="num">${r.clauses.toLocaleString()}</td><td>${r.sat ? 'SAT' : 'unsat'}</td><td class="num">${r.ms.toFixed(0)}</td></tr>`);
        $('sattable').innerHTML = `<table class="data"><tr><th>T</th><th class="num">symbols</th><th class="num">clauses</th><th>result</th><th class="num">ms</th></tr>${rows.join('')}</table>`;
        if (r.sat) {
          const pts = [W.parse('1,1')];
          r.plan.forEach(p => { const m = /^Move\(\[(\d+,\d+)\],\[(\d+,\d+)\]\)$/.exec(p.a); if (m) pts.push(W.parse(m[2])); });
          G.draw({ size: spec.size, spec, showHazards: true, paths: [{ pts, color: 'var(--gold)', width: 4 }] });
          $('msg').textContent = `Satisfiable at T = ${T}: decoded plan below.`;
          $('below').innerHTML = `<div class="mono small">${r.plan.map(p => `t=${p.t}: ${W.esc(p.a)}`).join('<br>')}</div><p class="small muted">DPLL (watched-literal version): ${r.stats.unit} unit propagations, ${r.stats.decisions} decisions, ${r.stats.conflicts} conflicts.</p>`;
          return;
        }
        $('msg').textContent = `T = ${T} unsatisfiable, trying T = ${T + 1}…`;
        if (++T <= maxT) setTimeout(stepT, 10); else $('msg').textContent = 'No plan up to the maximum horizon.';
      };
      stepT();
    };
  }

  /* ---------- hierarchical view ---------- */
  function setupHtn() {
    $('intro').innerHTML = '<b>Hierarchical planning</b> (§11.4) works with <b>high-level actions</b> (HLAs) such as Navigate(s) and FetchGold, each with <em>refinements</em> into lower-level steps. Below, the optimal primitive plan (A* with h_max) is shown decomposed into the HLA hierarchy it implements.';
    layout('<h3>HLA refinement library</h3><pre class="proof" style="white-space:pre">DoMission     → [FetchGold, ReturnHome, Climb]\nFetchGold     → [Navigate(gold), Grab]\n              | [Navigate(firing position), KillWumpus, Navigate(gold), Grab]\nKillWumpus    → [Shoot(s, w)]\nReturnHome    → [Navigate([1,1])]\nNavigate(s)   → [ ]                       if At(s)\n              | [Move(a, b), Navigate(s)]   for a safe neighbour b</pre>', false);
    $('player').style.display = 'none';
    const P = new W.ProgressionProblem(D), r = W.runSearch(P, 'astar', { h: W.PLAN_H.hmax.fn, cap: 60000 });
    const acts = W.solutionPath(r).slice(1).map(n => n.action);
    const G = grid(), pts = [[1, 1]];
    acts.forEach(a => { const m = /^Move\(\[(\d+,\d+)\],\[(\d+,\d+)\]\)$/.exec(a); if (m) pts.push(W.parse(m[2])); });
    G.draw({ size: spec.size, spec, showHazards: true, paths: [{ pts, color: 'var(--gold)', width: 4 }] });
    if (!acts.length) { $('below').innerHTML = '<div class="callout bad">No plan exists in this world.</div>'; return; }
    const tree = W.hierarchy(acts);
    const html = (n, d) => `<div style="padding-left:${d * 18}px">${n.kids ? '▾ <b>' + W.esc(n.label) + '</b>' : '· <span class="mono">' + W.esc(n.label) + '</span>'}</div>` + (n.kids || []).map(k => html(k, d + 1)).join('');
    $('msg').textContent = `Plan: ${acts.length} primitive actions, grouped into ${countHLA(tree)} high-level actions.`;
    $('below').innerHTML = `<h3>Decomposition</h3><div class="ptree">${html(tree, 0)}</div>`;
  }
  const countHLA = n => n.kids ? 1 + n.kids.reduce((a, k) => a + countHLA(k), 0) : 0;

  build();
})();
