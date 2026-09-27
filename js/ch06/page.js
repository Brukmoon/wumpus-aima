(function () {
  'use strict';
  W.topbar('Ch. 6 · Adversarial Search and Games');
  const $ = id => document.getElementById(id);
  const MV = { N: '↑', S: '↓', E: '→', W: '←', Stay: '·' };
  const mvShort = m => m == null ? '' : m.startsWith('Shoot') ? '➶' + MV[m.slice(5)] : MV[m] || m;

  let spec, game, states, log, analysis = null;
  const grid = new W.GridView($('grid'));
  const pseudo = new W.Pseudo($('pseudo'));
  const tree = new W.GTree($('tree'), { describe: n => describe(n), dx: 16, dy: 50 });
  const player = new W.Player($('player'), { onStep: i => analysis && analysis.render(i) });
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; restart(); }, sizes: [4, 5] });
  spec = wp.spec;

  ['algo', 'depth', 'order', 'iters', 'who', 'wai'].forEach(id => $(id).addEventListener('change', () => { ui(); if (id !== 'who' && id !== 'wai') analyze(); }));
  $('next').onclick = () => nextMove();
  $('auto').onclick = () => { let k = 0; const tick = () => { if (k++ < 60 && nextMove()) setTimeout(tick, 30); }; tick(); };
  $('restart').onclick = restart;
  $('human').addEventListener('click', e => { const m = e.target.dataset.m; if (m) humanMove(m); });
  $('cmp').onclick = compare;

  function ui() {
    const a = $('algo').value;
    $('dw').style.display = a === 'mcts' ? 'none' : '';
    $('iw').style.display = a === 'mcts' ? '' : 'none';
    $('ow').style.display = a === 'alphabeta' ? '' : 'none';
    const s = cur();
    $('human').style.display = $('who').value === 'human' && s && s.turn === 'MAX' && !s.out ? '' : 'none';
    if (s && $('who').value === 'human') $('human').querySelectorAll('[data-m]').forEach(b => b.disabled = !game.actions(s).includes(b.dataset.m));
  }
  const cur = () => states && states[states.length - 1];

  function restart() {
    if (!spec.wumpus || !spec.gold) { $('gstate').textContent = 'This world needs both a wumpus and gold. Generate another one.'; return; }
    game = new W.HuntGame(spec);
    states = [game.initial()]; log = [];
    draw(); ui(); analyze();
  }
  function draw() {
    const s = cur();
    const lastW = [...states].reverse().find(x => x.w);
    const view = Object.assign({}, spec, { wumpus: s.w || (lastW ? lastW.w : spec.wumpus) });
    const trail = states.map(x => W.parse(x.a)).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    const wtrail = states.filter(x => x.w).map(x => W.parse(x.w)).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    const [x, y] = W.parse(s.a);
    grid.draw({ size: spec.size, spec: view, showHazards: true, wumpusAlive: !!s.w, goldTaken: s.g,
      agent: { x, y, dir: 'E', alive: s.out !== 'eaten', hasGold: s.g },
      paths: [{ pts: trail, color: 'var(--accent)', width: 2.5, dash: true }, { pts: wtrail, color: 'var(--wumpus)', width: 2, dash: true }] });
    const res = { win: '<span class="pill good">agent wins</span>', eaten: '<span class="pill bad">wumpus wins</span>', draw: '<span class="pill">draw</span>' }[s.out] || '';
    $('gstate').innerHTML = `${W.esc(game.show(s))} ${res}${s.out ? ` · utility ${game.utility(s)}` : ''}`;
    $('hist').innerHTML = log.map(l => `<div>${W.esc(l)}</div>`).join('') || '<span class="muted">no moves yet</span>';
    $('hist').scrollTop = 1e9;
  }

  function decide(s) {
    const a = $('algo').value;
    if (s.turn === 'MIN' && ($('wai').value === 'random' || a === 'expecti')) {
      const acts = game.actions(s); return { move: acts[Math.floor(Math.random() * acts.length)], how: 'random' };
    }
    if (a === 'mcts') { const r = W.mcts(game, s, { iterations: +$('iters').value, seed: states.length }); return { move: r.move, how: 'MCTS' }; }
    const r = W.gameSearch(game, s, { algo: a, depth: +$('depth').value, order: $('order').checked });
    return { move: r.move, how: a, value: r.value };
  }
  function play(m, who) {
    const s = cur();
    states.push(game.result(s, m));
    log.push(`${s.t + 1}. ${s.turn === 'MAX' ? 'agent' : 'wumpus'} ${m}${who ? ' (' + who + ')' : ''}`);
    draw(); ui(); analyze();
  }
  function nextMove() {
    const s = cur();
    if (!s || s.out) return false;
    if (s.turn === 'MAX' && $('who').value === 'human') return false;
    const d = decide(s);
    if (!d.move) return false;
    play(d.move, d.how + (d.value != null ? `, value ${d.value}` : ''));
    return true;
  }
  function humanMove(m) { const s = cur(); if (s.turn !== 'MAX' || s.out) return; play(m, 'you'); setTimeout(nextMove, 150); }

  /* ---------- analysis of the current position ---------- */
  function describe(n) {
    if (analysis && analysis.kind === 'mcts') return `${n.move ? 'after ' + n.move : 'root'}\n${game.show(n.state)}\nN = ${n.N}  mean U = ${n.N ? (n.U / n.N).toFixed(0) : '—'}`;
    return `${n.move ? 'after ' + n.move : 'root'}  [${n.kind}]\n${game.show(n.state)}\nvalue ${n.value}${n.alpha != null && n.kind !== 'leaf' ? `\nα=${n.alpha} β=${n.beta}` : ''}${n.pruned ? '\n(pruned: never examined)' : ''}`;
  }
  function analyze() {
    const s = cur();
    if (!s) return;
    const a = $('algo').value;
    if (s.out) { $('msg').textContent = 'Game over.'; $('side').innerHTML = ''; tree.load([]); player.load(0); return; }
    if (a === 'mcts') return analyzeMCTS(s);
    const r = W.gameSearch(game, s, { algo: a, depth: +$('depth').value, order: $('order').checked });
    const P = W.GAME_PSEUDO[a];
    pseudo.set(P.lines, P.caption);
    const lastEv = new Map(); r.ev.forEach((e, i) => lastEv.set(e.node, i));
    // chosen line: follow best moves from the root
    const line = new Set([0]); let n = r.nodes[0];
    while (n && n.best) { const c = r.nodes.find(k => k.parent === n.id && k.move === n.best && !k.pruned); if (!c) break; line.add(c.id); n = c; }
    tree.load(r.nodes);
    $('treetitle').textContent = `Game tree from the current position: ${r.stats.nodes} nodes examined, ${r.stats.evals} evaluated at the frontier${r.stats.pruned ? `, ${r.stats.pruned} pruned` : ''}${r.stats.capped ? ' (capped)' : ''}`;
    $('stats').innerHTML = [['to move', s.turn], ['algorithm', a + (a === 'alphabeta' && $('order').checked ? ' + move ordering' : '')], ['depth', $('depth').value + ' plies'], ['minimax value', r.value], ['chosen move', r.move || (s.turn === 'MIN' && a === 'expecti' ? 'random (chance node)' : '—')]].map(([k, v]) => `<dt>${k}</dt><dd>${W.esc(String(v))}</dd>`).join('');
    const kids = r.nodes.filter(k => k.parent === 0);
    $('side').innerHTML = `<table class="data"><tr><th>move</th><th class="num">backed-up value</th></tr>${kids.map(k => `<tr class="${k.move === r.move ? 'best' : ''}"><td>${k.move}</td><td class="num">${k.pruned ? '<span class="muted">pruned</span>' : k.value}</td></tr>`).join('')}</table>`;
    const color = { max: 'var(--accent)', min: 'var(--wumpus)', chance: 'var(--breeze)', leaf: 'var(--muted)', pruned: 'var(--danger)' };
    const shape = { max: 'up', min: 'down', chance: 'circle', leaf: 'square', pruned: 'square' };
    analysis = { kind: 'tree', render(i) {
      const e = r.ev[i];
      if (!e) return;
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      const final = i === r.ev.length - 1;
      tree.update(i, k => {
        if (k.pruned) { const pv = lastEv.get(k.parent); return (pv != null && pv <= i) ? { shape: 'square', r: 4, fill: 'none', stroke: 'var(--danger)', dash: true, edge: 'pruned', label: '✂' } : { hide: true }; }
        const known = lastEv.get(k.id) != null && lastEv.get(k.id) <= i;
        return { shape: shape[k.kind], r: k.id === e.node ? 8 : 6, fill: k.id === e.node ? 'var(--gold)' : known ? color[k.kind] : 'var(--panel)', stroke: color[k.kind],
          label: known && k.value != null && r.nodes.length < 700 ? String(Math.round(k.value)) : '', edge: final && line.has(k.id) && k.id !== 0 ? 'sol' : null, edgeLabel: mvShort(k.move) };
      }, e.node);
    } };
    player.load(r.ev.length, r.ev.length - 1);
  }

  function analyzeMCTS(s) {
    const r = W.mcts(game, s, { iterations: +$('iters').value, seed: states.length });
    pseudo.set(W.GAME_PSEUDO.mcts.lines, W.GAME_PSEUDO.mcts.caption);
    tree.load(r.nodes);
    $('treetitle').textContent = `MCTS tree after ${r.iters.length} playouts: ${r.nodes.length} nodes (size = visits)`;
    const count = (n, i) => { let lo = 0, hi = n.hist.length; while (lo < hi) { const m = (lo + hi) >> 1; if (n.hist[m] <= i) lo = m + 1; else hi = m; } return lo; };
    const sumU = (n, i) => { let u = 0; for (const it of n.hist) { if (it > i) break; u += r.iters[it].u; } return u; };
    analysis = { kind: 'mcts', render(i) {
      const it = r.iters[i], onPath = new Set(it.path);
      pseudo.highlight(['m1', 'm2', 'm3', 'm4']);
      $('msg').textContent = `playout ${i + 1}: selected ${it.path.length - 1} level(s) deep, expanded a new node, random playout of ${it.playoutLen} moves → result ${it.u}`;
      const root = r.nodes[0], N0 = count(root, i);
      const rows = root.kids.map(k => r.nodes[k]).map(k => { const N = count(k, i), U = sumU(k, i); const sign = s.turn === 'MAX' ? 1 : -1; return { m: k.move, N, mean: N ? U / N : null, ucb: N ? sign * U / N / 1000 + r.C * Math.sqrt(Math.log(Math.max(1, N0)) / N) : Infinity }; }).sort((a, b) => b.N - a.N);
      $('side').innerHTML = `<table class="data"><tr><th>move</th><th class="num">N (playouts)</th><th class="num">mean utility</th><th class="num">UCB1</th></tr>${rows.map((x, j) => `<tr class="${j === 0 ? 'best' : ''}"><td>${x.m}</td><td class="num">${x.N}</td><td class="num">${x.mean == null ? '—' : x.mean.toFixed(0)}</td><td class="num">${x.ucb === Infinity ? '∞' : x.ucb.toFixed(3)}</td></tr>`).join('')}</table>`;
      $('stats').innerHTML = [['to move', s.turn], ['playouts so far', i + 1], ['most visited move', rows[0] ? rows[0].m : '—'], ['C (exploration)', r.C]].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
      tree.update(i, n => {
        const N = count(n, i);
        if (!N && n.id) return { hide: true };
        const turn = n.state.turn;
        return { shape: n.id === 0 ? 'square' : turn === 'MAX' ? 'up' : 'down', r: Math.min(12, 3 + Math.sqrt(N)), fill: onPath.has(n.id) ? 'var(--gold)' : turn === 'MAX' ? 'var(--accent)' : 'var(--wumpus)', stroke: 'var(--muted)', label: r.nodes.length < 400 ? String(N) : '', edge: onPath.has(n.id) ? 'sol' : null, edgeLabel: mvShort(n.move) };
      }, it.expanded);
    } };
    player.load(r.iters.length, r.iters.length - 1);
  }

  function compare() {
    const s = cur(); if (!s || s.out) return;
    const rows = [];
    for (let d = 1; d <= 6; d++) {
      const mm = W.gameSearch(game, s, { algo: 'minimax', depth: d, cap: 400000 });
      const ab = W.gameSearch(game, s, { algo: 'alphabeta', depth: d, cap: 400000 });
      const ao = W.gameSearch(game, s, { algo: 'alphabeta', depth: d, order: true, cap: 400000 });
      rows.push(`<tr><td>${d}</td><td class="num">${mm.stats.nodes.toLocaleString()}${mm.stats.capped ? '+' : ''}</td><td class="num">${ab.stats.nodes.toLocaleString()}</td><td class="num">${ao.stats.nodes.toLocaleString()}</td><td class="num">${(100 * ao.stats.nodes / mm.stats.nodes).toFixed(1)}%</td><td>${mm.move} / ${ab.move} / ${ao.move}</td><td class="num">${mm.value} / ${ab.value} / ${ao.value}</td></tr>`);
      if (mm.stats.capped) break;
    }
    $('cmpout').innerHTML = `<table class="data"><tr><th>depth</th><th class="num">minimax nodes</th><th class="num">alpha–beta</th><th class="num">alpha–beta + ordering</th><th class="num">ordered / minimax</th><th>moves chosen</th><th class="num">values</th></tr>${rows.join('')}</table><p class="small muted" style="margin-top:6px">All three always agree on the value. Alpha–beta never changes the result, only the work.</p>`;
  }

  ui(); restart();
})();
