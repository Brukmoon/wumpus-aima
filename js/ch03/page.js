(function () {
  'use strict';
  W.topbar('Ch. 3 · Solving Problems by Searching');
  const $ = id => document.getElementById(id);

  let spec, problem, run, optimal = null, pinned = null;
  const fmt = x => x == null ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(2);

  const grid = new W.GridView($('grid'), {
    onCellClick: c => wp.click(c),
    onCellHover: (c, e) => {
      if (!c || !run) return W.tip(null);
      const i = player.i, k = W.key(c[0], c[1]);
      const inCell = run.nodes.filter(n => n.gen <= i && W.key(...problem.cell(n.state)) === k);
      const exp = inCell.filter(n => n.exp != null && n.exp <= i).length;
      W.tip(`[${k}]  nodes generated here: ${inCell.length}, expanded: ${exp}` + (inCell.length ? '\n' + [...new Set(inCell.map(n => problem.show(n.state)))].slice(0, 8).join('\n') : ''), e);
    },
  });
  const pseudo = new W.Pseudo($('pseudo'));
  const tree = new W.TreeView($('tree'), {
    describe: n => `#${n.id}  ${problem.show(n.state)}\naction: ${n.action || '(root)'}\ndepth ${n.depth}  g=${fmt(n.g)}  h=${fmt(n.h)}  f=${fmt(n.g + n.h)}`,
    onClick: n => { pinned = pinned === n.id ? null : n.id; render(player.i); },
  });
  const player = new W.Player($('player'), { onStep: i => render(i) });
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; rebuild(); } });
  spec = wp.spec;

  $('problem').innerHTML = Object.entries(W.PROBLEMS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  $('problem').value = 'mission';
  $('algo').innerHTML = Object.entries(W.ALGOS).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join('');
  $('algo').value = 'astar';
  function fillHeur() {
    const H = W.HEURISTICS[$('problem').value], prev = $('heur').value;
    $('heur').innerHTML = Object.entries(H).map(([k, h]) => `<option value="${k}">${h.label}</option>`).join('');
    $('heur').value = H[prev] ? prev : Object.keys(H)[1];
  }
  fillHeur();
  $('problem').addEventListener('change', () => { fillHeur(); rebuild(); });
  $('algo').addEventListener('change', rerun);
  $('heur').addEventListener('change', rerun);
  $('limit').addEventListener('change', rerun);

  const hfn = () => W.HEURISTICS[$('problem').value][$('heur').value].fn;

  function rebuild() {
    problem = W.PROBLEMS[$('problem').value].make(spec);
    const u = W.runSearch(problem, 'ucs', { cap: 400000 });
    optimal = u.result != null ? u.nodes[u.result].g : null;
    $('probinfo').innerHTML = `${problem.name}: up to ${problem.stateCount()} states. ` +
      (optimal != null ? `Optimal solution cost C* = <b>${optimal}</b> (found by UCS).` : '<span class="warn">No solution exists in this world (gold unreachable).</span>');
    $('hout').innerHTML = ''; $('cmpout').innerHTML = '';
    rerun();
  }

  function rerun() {
    const a = W.ALGOS[$('algo').value];
    $('hwrap').style.opacity = a.usesH ? 1 : 0.4;
    $('lwrap').style.display = a.usesLimit ? '' : 'none';
    pinned = null;
    run = W.runSearch(problem, $('algo').value, { h: hfn(), limit: +$('limit').value });
    const P = W.PSEUDO[a.pseudo];
    pseudo.set(P.lines, P.caption + (a.f ? `, called with f(n) = ${a.f}` : ''));
    tree.load(run);
    $('forder').textContent = a.pseudo === 'best' ? `priority queue on f = ${a.f}; next to pop on top` : a.pseudo === 'bfs' ? 'FIFO queue; next to pop on top' : 'LIFO stack; top of stack first';
    player.load(run.events.length);
  }

  function priority(n) {
    const a = $('algo').value;
    return a === 'ucs' ? n.g : a === 'greedy' ? n.h : a === 'astar' ? n.g + n.h : a === 'wastar' ? n.g + 2 * n.h : 0;
  }

  function render(i) {
    const ev = run.events[i];
    const pseudoKind = W.ALGOS[$('algo').value].pseudo;
    const lines = [ev.line];
    if (ev.child != null) lines.push('x5');
    pseudo.highlight(lines);

    // grid overlays
    const heat = {}, front = new Set();
    let maxHeat = 1;
    for (const n of run.nodes) {
      if (n.gen > i) continue;
      const k = W.key(...problem.cell(n.state));
      if (n.exp != null && n.exp <= i) { heat[k] = (heat[k] || 0) + 1; maxHeat = Math.max(maxHeat, heat[k]); }
      if (n.tree === ev.tree && n.add != null && n.add <= i && n.pop > i) front.add(k);
    }
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (heat[k]) { o.fill = `rgba(var(--heat),${0.15 + 0.6 * heat[k] / maxHeat})`; o.alpha = 1; o.label = String(heat[k]); o.labelColor = 'var(--ink)'; }
      if (front.has(k)) o.ring = 'var(--frontier)';
      cells[k] = o;
    }
    const focusId = pinned != null ? pinned : ev.node;
    const focus = focusId != null ? run.nodes[focusId] : null;
    const pathTo = id => { const out = []; for (let j = id; j != null; j = run.nodes[j].parent) out.unshift(run.nodes[j]); return out; };
    const paths = [];
    let agent = null;
    if (ev.done === 'solution') {
      const sol = W.solutionPath(run);
      paths.push({ pts: dedupe(sol.map(n => problem.cell(n.state))), color: 'var(--gold)', width: 5 });
    } else if (focus) {
      paths.push({ pts: dedupe(pathTo(focus.id).map(n => problem.cell(n.state))), color: 'var(--muted)', dash: true, width: 2.5 });
    }
    if (focus) {
      const s = focus.state;
      if (s.d) agent = { x: s.x, y: s.y, dir: s.d, hasGold: !!s.g };
      else cells[W.key(s.x, s.y)].ring = 'var(--gold)';
    }
    const ws = focus && focus.state.w === 0;
    grid.draw({ size: spec.size, spec, showHazards: true, showPercepts: false, wumpusAlive: !ws, goldTaken: !!(focus && focus.state.g), cells, paths, agent });

    tree.update(i);

    // message + status
    $('msg').textContent = (pinned != null ? `[pinned node #${pinned}: ${problem.show(focus.state)}]  ` : '') + ev.msg;
    const doneTxt = { solution: '<span class="pill good">solution</span>', failure: '<span class="pill bad">failure</span>', cutoff: '<span class="pill bad">cutoff</span>', cap: '<span class="pill bad">gave up: step cap</span>' };
    $('status').innerHTML = ev.done ? doneTxt[ev.done] || ev.done : `step ${i + 1} of ${run.events.length}`;

    // counters
    const cur = ev.node != null ? run.nodes[ev.node] : null;
    const rows = [
      ['nodes expanded', ev.expanded], ['nodes generated', ev.generated], ['|reached|', pseudoKind === 'ids' ? 'n/a (tree-like)' : ev.reached],
      ['|frontier|', ev.frontier], ['current node', cur ? `${problem.show(cur.state)} · depth ${cur.depth} · g=${fmt(cur.g)} h=${fmt(cur.h)} f=${fmt(cur.g + cur.h)}` : '—'],
    ];
    if (ev.limit != null) rows.push(['depth limit ℓ', ev.limit === Infinity ? '∞' : ev.limit]);
    if (i === run.events.length - 1) {
      const sol = W.solutionPath(run);
      rows.push(['max |frontier|', run.stats.maxFrontier]);
      if (sol.length) {
        const c = sol[sol.length - 1].g, d = sol.length - 1, b = W.effectiveBranching(run.stats.expanded, d);
        rows.push(['solution cost', `${c} ${optimal != null ? (c === optimal ? '<span class="pill good">optimal</span>' : `<span class="pill bad">C* = ${optimal}</span>`) : ''}`]);
        rows.push(['solution', `<span class="mono small">${sol.slice(1).map(n => n.action).join(' ')}</span>`]);
        rows.push(['b*', b ? b.toFixed(2) : '—']);
      }
      rows.push(['time', run.ms.toFixed(1) + ' ms']);
    }
    $('stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    // frontier list
    const fr = run.nodes.filter(n => n.tree === ev.tree && n.add != null && n.add <= i && n.pop > i);
    if (pseudoKind === 'best') fr.sort((a, b) => priority(a) - priority(b) || a.id - b.id);
    else if (pseudoKind === 'bfs') fr.sort((a, b) => a.id - b.id);
    else fr.sort((a, b) => b.add - a.add || a.id - b.id);
    $('flist').innerHTML = fr.length ? fr.slice(0, 14).map((n, j) => `<div class="${j === 0 ? 'next' : ''}">${pseudoKind === 'best' ? 'f=' + fmt(priority(n)).padEnd(5) : 'd=' + String(n.depth).padEnd(3)} ${W.esc(problem.show(n.state))}  <span class="muted">via ${n.action || 'root'}</span></div>`).join('') + (fr.length > 14 ? `<div class="muted">… ${fr.length - 14} more</div>` : '') : '<div class="muted">empty</div>';
  }

  function dedupe(pts) { return pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]); }

  /* ---------- compare ---------- */
  $('compare').addEventListener('click', () => {
    const rows = Object.entries(W.ALGOS).map(([k, a]) => {
      const r = W.runSearch(problem, k, { h: hfn(), limit: +$('limit').value, cap: 200000 });
      const sol = W.solutionPath(r);
      const c = sol.length ? sol[sol.length - 1].g : null, d = sol.length ? sol.length - 1 : null;
      return { name: a.label + (a.usesH ? ` <span class="muted small">(${W.esc(W.HEURISTICS[$('problem').value][$('heur').value].label)})</span>` : '') + (a.usesLimit ? ` <span class="muted small">(ℓ=${$('limit').value})</span>` : ''),
        status: r.status, c, d, exp: r.stats.expanded, gen: r.stats.generated, mf: r.stats.maxFrontier, b: d ? W.effectiveBranching(r.stats.expanded, d) : null, ms: r.ms };
    });
    $('cmpout').innerHTML = `<table class="data"><tr><th>Algorithm</th><th>result</th><th class="num">cost</th><th class="num">d</th><th class="num">expanded</th><th class="num">generated</th><th class="num">max frontier</th><th class="num">b*</th><th class="num">ms</th></tr>` +
      rows.map(r => `<tr class="${r.c != null && r.c === optimal ? 'best' : ''}"><td>${r.name}</td><td>${r.status}</td><td class="num">${r.c == null ? '—' : r.c}${r.c != null && optimal != null && r.c > optimal ? ' ✗' : ''}</td><td class="num">${r.d == null ? '—' : r.d}</td><td class="num">${r.exp.toLocaleString()}</td><td class="num">${r.gen.toLocaleString()}</td><td class="num">${r.mf.toLocaleString()}</td><td class="num">${r.b ? r.b.toFixed(2) : '—'}</td><td class="num">${r.ms.toFixed(1)}</td></tr>`).join('') +
      `</table><p class="small muted" style="margin-top:6px">Green rows found an optimal solution (cost C* = ${optimal == null ? '—' : optimal}). ✗ marks a suboptimal one.</p>`;
  });

  /* ---------- heuristic lab ---------- */
  $('hcheck').addEventListener('click', () => {
    const H = W.HEURISTICS[$('problem').value];
    let info = null;
    const rows = Object.entries(H).map(([k, h]) => {
      const r = W.checkHeuristic(problem, h.fn); info = r;
      const astar = W.runSearch(problem, 'astar', { h: h.fn, cap: 400000 });
      const ex = r.admViol[0];
      return `<tr><td>${W.esc(h.label)}</td>
        <td>${r.admViol.length ? `<span class="pill bad">no: ${r.admViol.length} states</span><div class="small muted mono">e.g. ${W.esc(problem.show(ex.s))}: h=${fmt(ex.h)} &gt; h*=${ex.hs}</div>` : '<span class="pill good">yes</span>'}</td>
        <td>${r.conViol ? `<span class="pill bad">no: ${r.conViol} edges</span><div class="small muted mono">e.g. ${W.esc(problem.show(r.conExample.a))} → ${W.esc(problem.show(r.conExample.b))}: ${fmt(r.conExample.ha)} &gt; ${r.conExample.c} + ${fmt(r.conExample.hb)}</div>` : '<span class="pill good">yes</span>'}</td>
        <td class="num">${r.avgRatio == null ? '—' : r.avgRatio.toFixed(2)}</td>
        <td class="num">${astar.stats.expanded}</td>
        <td class="num">${astar.result != null ? astar.nodes[astar.result].g : '—'}</td></tr>`;
    });
    $('hout').innerHTML = `<p class="small">${info.states} reachable states, ${info.edges} edges. ${info.solvable ? `Optimal cost from start: ${info.optimal}.` : 'Goal unreachable from start.'}</p>
      <table class="data"><tr><th>Heuristic</th><th>admissible?</th><th>consistent?</th><th class="num">avg h/h* (closer to 1 = better informed)</th><th class="num">A* expanded</th><th class="num">A* cost</th></tr>${rows.join('')}</table>`;
  });

  rebuild();
})();
