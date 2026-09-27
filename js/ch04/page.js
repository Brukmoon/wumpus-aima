(function () {
  'use strict';
  W.topbar('Ch. 4 · Search in Complex Environments');
  const $ = id => document.getElementById(id);
  const ARW = { N: '↑', E: '→', S: '↓', W: '←' };

  let spec, run = null, iceSeed = 1, ice = null, lsSeed = 1;
  const grid = new W.GridView($('grid'), { onCellClick: c => onCell(W.key(...c)) });
  const pseudo = new W.Pseudo($('pseudo'));
  const player = new W.Player($('player'), { onStep: i => run && run.render(i) });
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; ice = null; setup(); } });
  spec = wp.spec;
  const tree = new W.GTree(document.createElement('div'), { describe: n => n.kind === 'or' ? `OR node: state [${n.state}]\n${n.status}` : `AND node: action ${n.action} from [${n.state}]\n${n.status}`, dx: 20 });
  const tabs = new W.Tabs($('tabs'), [['ls', 'A · Local search'], ['andor', 'B · Slippery floor (AND-OR)'], ['belief', 'C · Where am I? (belief states)'], ['online', 'D · Unknown cave (online search)']], () => setup(), 'ch04.tab');

  function onCell(k) {
    if (wp.click(W.parse(k))) return;
    if (tabs.cur === 'andor') { if (ice.has(k)) ice.delete(k); else if (k !== '1,1' && !spec.pits.includes(k) && spec.wumpus !== k) ice.add(k); setup(); }
    if (tabs.cur === 'belief' && bel && !spec.pits.includes(k) && spec.wumpus !== k) { bel.start = k; resetBelief(); }
  }
  function setup() {
    $('gridopts').innerHTML = ''; $('legend').innerHTML = ''; $('side').innerHTML = ''; $('bottom').innerHTML = ''; $('opts').innerHTML = '';
    $('bottom').className = ''; $('bottom').onmousemove = null; $('bottom').onmouseleave = null;
    ({ ls: setupLS, andor: setupAndOr, belief: setupBelief, online: setupOnline })[tabs.cur]();
  }

  /* ============ A. local search ============ */
  const lsOpt = { algo: 'hc', K: 3 };
  function setupLS() {
    $('intro').innerHTML = '<b>Local search designs a world.</b> The state is a complete placement of K pits, the wumpus and the gold. VALUE is the cost of the optimal full-mission plan (found by Chapter 3\'s uniform-cost search), so higher means a harder world, and 0 means unsolvable. A move relocates one object.';
    $('gridtitle').textContent = 'Current world and its optimal plan';
    $('opts').innerHTML = `<label>algorithm <select id="lsA"><option value="hc">hill climbing (steepest ascent)</option><option value="rr">random-restart hill climbing</option><option value="sa">simulated annealing</option><option value="ga">genetic algorithm</option></select></label>
      <label>pits K <input id="lsK" type="number" min="0" max="8" value="${lsOpt.K}"></label>
      <button id="lsSeed">🎲 new random start (seed ${lsSeed})</button>`;
    $('lsA').value = lsOpt.algo;
    $('lsA').onchange = e => { lsOpt.algo = e.target.value; setup(); };
    $('lsK').onchange = e => { lsOpt.K = Math.max(0, Math.min(8, +e.target.value)); setup(); };
    $('lsSeed').onclick = () => { lsSeed++; setup(); };
    const n = Math.min(spec.size, 5);
    const r = W.localSearch(lsOpt.algo, { n, K: lsOpt.K, seed: lsSeed });
    const P = W.CH4_PSEUDO[lsOpt.algo === 'rr' ? 'hc' : lsOpt.algo];
    pseudo.set(P.lines, P.caption + (lsOpt.algo === 'rr' ? ' · repeated from random starts' : ''));
    $('bottomtitle').textContent = lsOpt.algo === 'ga' ? 'Population' : 'VALUE over time';
    $('legend').innerHTML = '<span style="--c:var(--gold)">optimal plan route</span>';
    if (spec.size > 5) $('side').innerHTML = '<div class="callout small">Using a 5×5 grid to keep evaluation fast.</div>';
    run = { render(i) {
      const e = r.ev[i], s = r.D.spec(e.design);
      grid.draw({ size: n, spec: s, showHazards: true, agent: { x: 1, y: 1, dir: 'E' }, paths: [{ pts: e.v.path, color: 'var(--gold)', width: 4 }] });
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      $('sub').innerHTML = `VALUE of this world: <b>${e.v.value}</b>${e.v.value ? '' : ' (unsolvable)'} · best so far: <b>${e.bestV}</b>`;
      $('side').innerHTML = `<button id="useBest">Use the best world found (value ${e.bestV}) in every chapter</button>`;
      $('useBest').onclick = () => { const b = r.D.spec(e.best); b.seed = 'designed'; b.pitProb = spec.pitProb; wp.set(b); };
      if (lsOpt.algo === 'ga') {
        $('bottom').innerHTML = `<div class="gallery">${e.pop.map(d => mini(r.D.spec(d), r.D.evaluate(d).value)).join('')}</div>`;
      } else {
        $('bottom').innerHTML = W.sparkline(r.ev.map(x => x.v.value), { marker: i, label: 'VALUE (optimal plan cost) per step' }) +
          (lsOpt.algo === 'sa' ? W.sparkline(r.ev.map(x => x.T || 0), { marker: i, color: 'var(--danger)', label: 'temperature T', h: 60 }) : '');
      }
    } };
    player.load(r.ev.length);
  }
  function mini(s, v) {
    const C = 12, n = s.size;
    let out = `<div class="tile"><svg width="${n * C}" height="${n * C}">`;
    for (const [x, y] of W.cells(n)) {
      const k = W.key(x, y);
      const f = s.pits.includes(k) ? 'var(--pit)' : s.wumpus === k ? 'var(--wumpus)' : s.gold === k ? 'var(--gold)' : 'var(--cell)';
      out += `<rect x="${(x - 1) * C}" y="${(n - y) * C}" width="${C - 1}" height="${C - 1}" style="fill:${f};stroke:var(--line)"/>`;
    }
    return out + `</svg><div class="small" style="text-align:center">${v}</div></div>`;
  }

  /* ============ B. AND-OR ============ */
  function setupAndOr() {
    if (!ice) ice = W.iceFor(spec, iceSeed);
    $('intro').innerHTML = '<b>A slippery cave.</b> Stepping <em>onto</em> an ice square may slide you one more square in the same direction. The result of an action is now a <em>set</em> of states. AND-OR search looks for a <b>conditional plan</b> that reaches the gold whatever happens: OR nodes choose an action, AND nodes must handle every outcome.';
    $('gridtitle').textContent = 'Cave with ice (click squares to toggle ice)';
    $('opts').innerHTML = `<button id="iceNew">🎲 random ice (seed ${iceSeed})</button><button id="iceClear">no ice</button>`;
    $('iceNew').onclick = () => { iceSeed++; ice = W.iceFor(spec, iceSeed); setup(); };
    $('iceClear').onclick = () => { ice = new Set(); setup(); };
    $('legend').innerHTML = '<span style="--c:var(--breeze)">ice</span><span style="--c:var(--gold)">state being searched</span><span>arrows: the final plan\'s action in each square</span>';
    const P = new W.SlipperyProblem(spec, ice);
    const r = W.andOrSearch(P);
    pseudo.set(W.CH4_PSEUDO.andor.lines, W.CH4_PSEUDO.andor.caption);
    const lastEv = new Map(); r.ev.forEach((e, i) => lastEv.set(e.node, i));
    const pol = W.planPolicy(r.plan);
    tree.el = $('bottom'); tree.el.classList.add('treebox');
    tree.el.onmousemove = e => { const c = e.target.closest('[data-n]'); W.tip(c ? tree.describe(r.nodes[+c.dataset.n]) : null, e); };
    tree.el.onmouseleave = () => W.tip(null);
    tree.load(r.nodes);
    $('bottomtitle').textContent = `AND-OR search tree (${r.nodes.length} nodes): circles = OR (states), diamonds = AND (actions)`;
    $('side').innerHTML = `<h3>Conditional plan</h3><pre class="proof" style="white-space:pre">${W.esc(W.planText(r.plan))}</pre>`;
    run = { render(i) {
      const e = r.ev[i], cur = r.nodes[e.node], done = i === r.ev.length - 1;
      const cells = {};
      for (const k of ice) cells[k] = { fill: 'var(--breeze)', alpha: 0.28, sub: 'ice' };
      if (done) for (const [k, a] of pol) Object.assign(cells[k] = cells[k] || {}, { label: ARW[a], labelSize: 22, labelColor: 'var(--gold)' });
      if (cur) Object.assign(cells[cur.state] = cells[cur.state] || {}, { ring: 'var(--gold)' });
      grid.draw({ size: spec.size, spec, showHazards: true, cells });
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      $('sub').textContent = done ? (r.plan ? 'A conditional plan exists: it reaches the gold for every possible slide.' : r.capped ? 'Stopped (too many steps).' : 'No conditional plan guarantees success.') : '';
      const col = { ok: 'var(--safe)', fail: 'var(--danger)', open: 'var(--panel)' };
      tree.update(i, n => {
        const st = lastEv.get(n.id) <= i ? n.status : 'open';
        return { shape: n.kind === 'or' ? 'circle' : 'diamond', r: n.id === e.node ? 8 : 6, fill: n.id === e.node ? 'var(--gold)' : col[st], stroke: st === 'open' ? 'var(--muted)' : col[st], label: n.kind === 'or' ? n.state : n.action };
      }, e.node);
    } };
    player.load(r.ev.length);
  }

  /* ============ C. belief states ============ */
  let bel = null;
  function setupBelief() {
    $('intro').innerHTML = '<b>Where am I?</b> The agent knows the map (pits and wumpus), but not where it stands. Its <b>belief state</b> is the set of squares it could be in. Each move predicts where each of those squares leads, and each percept (breeze, stench, glitter, bump) filters out the ones that don\'t match. Moves are absolute here (N/E/S/W). A move is only safe if it is safe from <em>every</em> believed square.';
    $('gridtitle').textContent = 'Belief state (click a square to put the agent there)';
    $('opts').innerHTML = `<label>mode <select id="bm"><option value="loc">with percepts: localization</option><option value="sl">sensorless: conformant plan</option></select></label>`;
    $('bm').value = bel ? bel.mode : 'loc';
    $('bm').onchange = e => { bel.mode = e.target.value; resetBelief(); };
    $('gridopts').innerHTML = '<label><input type="checkbox" id="bt" checked> show true position</label>';
    $('bt').onchange = () => run.render(player.i);
    $('legend').innerHTML = '<span style="--c:var(--accent)">in the belief state</span><span style="--c:var(--danger)">would die with the chosen move</span>';
    pseudo.set(W.CH4_PSEUDO.belief.lines, W.CH4_PSEUDO.belief.caption);
    const BW = new W.BeliefWorld(spec);
    if (!bel || !BW.safeCells().includes(bel.start)) {
      const safe = BW.safeCells(), r = W.rng((typeof spec.seed === 'number' ? spec.seed : 3) + 11);
      bel = { mode: bel ? bel.mode : 'loc', start: safe[Math.floor(r() * safe.length)] };
    }
    bel.BW = BW;
    resetBelief();
  }
  function resetBelief() {
    const BW = bel.BW;
    $('bottomtitle').textContent = 'History';
    if (bel.mode === 'loc') {
      const o = BW.percept(bel.start, false);
      const b0 = BW.safeCells().filter(s => BW.same(BW.percept(s, false), o));
      bel.hist = [{ b: b0, at: bel.start, msg: `initial percept at the (unknown) start: ${BW.ptext(o)}. ${BW.safeCells().length} safe squares, ${b0.length} match`, line: 'p3' }];
      $('side').innerHTML = `<div class="row">${['N', 'E', 'S', 'W'].map(d => `<button data-mv="${d}">${ARW[d]} ${d}</button>`).join('')}<button id="auto" class="primary">greedy auto-move</button><button id="breset">↺ reset</button></div><p class="small muted" id="risk"></p>`;
      $('side').querySelectorAll('[data-mv]').forEach(b => b.onclick = () => moveBelief(b.dataset.mv));
      $('auto').onclick = () => {
        const cur = bel.hist[bel.hist.length - 1], a = BW.bestAction(cur.b);
        if (a) moveBelief(a.d);
        else $('risk').innerHTML = '<span class="warn">No move is safe from every believed square. A cautious agent is stuck here; you can still gamble with a manual move.</span>';
      };
      $('breset').onclick = resetBelief;
    } else {
      const b0 = BW.safeCells(), res = BW.sensorless(b0);
      bel.hist = [{ b: b0, at: bel.start, msg: `no percepts at all: the agent could be on any of ${b0.length} safe squares`, line: 'p4' }];
      if (res.plan) {
        let b = b0, at = bel.start;
        for (const d of res.plan) { b = [...new Set(BW.predict(b, d).alive.map(r => r.to))]; at = BW.result(at, d).s; bel.hist.push({ b, at, action: d, msg: `${d}: belief shrinks to ${b.length} square(s)`, line: 'p4' }); }
      }
      $('side').innerHTML = res.plan ? `<div class="callout good">Conformant plan found by BFS over belief states (${res.beliefs} belief states generated): <b class="mono">${res.plan.join(' ')}</b>. After it the agent knows exactly where it is, without sensing anything.</div>`
        : `<div class="callout bad">No sensorless plan localizes the agent (${res.beliefs} belief states explored). Every candidate move risks a pit from some believed square, or the belief can't shrink to one square.</div>`;
    }
    beliefRun();
  }
  function moveBelief(d) {
    const BW = bel.BW, cur = bel.hist[bel.hist.length - 1];
    if (cur.dead) return;
    const { alive, dying } = BW.predict(cur.b, d);
    const r = BW.result(cur.at, d);
    if (BW.deadly.has(r.s)) { bel.hist.push({ b: [], at: r.s, action: d, dead: true, dying: dying.map(x => x.from), msg: `${d}: the true position led into a hazard. Dead. (${dying.length} of ${cur.b.length} believed squares were fatal)`, line: 'p1' }); beliefRun(); return; }
    const o = BW.percept(r.s, r.bump);
    const b = BW.update(alive, o);
    bel.hist.push({ b, at: r.s, action: d, pred: alive.length, dying: dying.map(x => x.from), msg: `${d}: predicted ${new Set(alive.map(x => x.to)).size} squares${dying.length ? ` (and ${dying.length} would have died!)` : ''}, percept ${BW.ptext(o)} ⇒ ${b.length} square(s) remain`, line: 'p3' });
    beliefRun();
  }
  function beliefRun() {
    const BW = bel.BW;
    run = { render(i) {
      const h = bel.hist[i], cells = {};
      for (const s of h.b) cells[s] = { fill: 'var(--accent)', alpha: 0.35, label: h.b.length === 1 ? 'here!' : '?' };
      for (const s of h.dying || []) cells[s] = Object.assign(cells[s] || {}, { ring: 'var(--danger)' });
      grid.draw({ size: spec.size, spec, showHazards: true, cells, agent: $('bt') && $('bt').checked ? { x: W.parse(h.at)[0], y: W.parse(h.at)[1], dir: h.action ? { N: 'N', E: 'E', S: 'S', W: 'W' }[h.action] : 'E', alive: !h.dead } : null });
      pseudo.highlight([h.line]);
      $('msg').textContent = h.msg;
      $('sub').textContent = `belief state size |b| = ${h.b.length}`;
      if (bel.mode === 'loc') {
        const cur = bel.hist[bel.hist.length - 1];
        $('risk') && ($('risk').textContent = cur.dead ? 'Game over. Reset to try again.' : ['N', 'E', 'S', 'W'].map(d => { const p = BW.predict(cur.b, d); return `${d}: ${p.dying.length ? p.dying.length + '/' + cur.b.length + ' fatal' : 'safe'}`; }).join(' · '));
      }
      $('bottom').innerHTML = W.sparkline(bel.hist.map(x => x.b.length), { marker: i, label: '|belief state| after each step' }) +
        `<div class="log" style="margin-top:8px">${bel.hist.map((x, j) => `<div class="${j === i ? 'cur' : ''}">${j}. ${W.esc(x.msg)}</div>`).join('')}</div>`;
    } };
    player.load(bel.hist.length, bel.hist.length - 1);
  }

  /* ============ D. online search ============ */
  const onOpt = { algo: 'lrta', trials: 4 };
  function setupOnline() {
    $('intro').innerHTML = '<b>An unknown cave.</b> The agent has no map. It learns RESULT(s, a) only by trying a. Pits and the wumpus act as walls here (the agent refuses to step in), so every action is safe and reversible, as online DFS requires. (Our online DFS has one standard fix: a state reached by backtracking is not pushed onto unbacktracked again. As printed, Fig. 4.21 can bounce between two exhausted states forever.) LRTA* knows where the gold is (h = Manhattan distance) and learns better estimates H as it goes.';
    $('gridtitle').textContent = 'What the agent has discovered';
    $('opts').innerHTML = `<label>agent <select id="oa"><option value="lrta">LRTA*</option><option value="odfs">online depth-first search</option></select></label><label id="trw">trials <input id="otr" type="number" min="1" max="20" value="${onOpt.trials}"></label>`;
    $('oa').value = onOpt.algo;
    $('oa').onchange = e => { onOpt.algo = e.target.value; setup(); };
    $('otr').onchange = e => { onOpt.trials = Math.max(1, +e.target.value); setup(); };
    $('trw').style.display = onOpt.algo === 'lrta' ? '' : 'none';
    $('gridopts').innerHTML = '<label><input type="checkbox" id="orev" checked> show the true cave</label>';
    $('orev').onchange = () => run.render(player.i);
    $('legend').innerHTML = '<span style="--c:var(--accent)">visited</span><span style="--c:var(--muted)">trail (current trial)</span>' + (onOpt.algo === 'lrta' ? '<span>numbers: learned H(s)</span>' : '<span>numbers: untried actions left</span>');
    const cave = new W.OnlineCave(spec), opt = cave.optimal();
    if (!spec.gold) { $('msg').textContent = 'This world has no gold.'; return; }
    const r = onOpt.algo === 'lrta' ? W.lrtaStar(cave, { trials: onOpt.trials }) : W.onlineDFS(cave);
    const P = W.CH4_PSEUDO[onOpt.algo];
    pseudo.set(P.lines, P.caption);
    $('bottomtitle').textContent = 'Moves compared to the optimal path';
    run = { render(i) {
      const e = r.ev[i];
      const visited = new Set(['1,1']);
      for (const k of e.known.keys()) visited.add(k.split('|')[0]);
      for (const v of e.known.values()) visited.add(v);
      const cells = {};
      for (const [x, y] of W.cells(spec.size)) {
        const k = W.key(x, y), o = {};
        if (visited.has(k)) { o.fill = 'var(--accent)'; o.alpha = 0.2; }
        else if (!$('orev').checked) { o.fill = 'var(--ink)'; o.alpha = 0.55; }
        if (onOpt.algo === 'lrta' && e.H.has(k)) { o.label = String(e.H.get(k)); o.labelSize = 14; o.labelColor = e.upd === k ? 'var(--danger)' : 'var(--ink)'; }
        if (onOpt.algo === 'odfs' && e.untried.has(k)) { o.label = e.untried.get(k).length ? e.untried.get(k).length + ' untried' : '✓'; o.labelColor = 'var(--muted)'; }
        if (e.upd === k) o.ring = 'var(--danger)';
        cells[k] = o;
      }
      // trail for this trial
      const trail = [];
      for (let j = 0; j <= i; j++) { const x = r.ev[j]; if (onOpt.algo === 'lrta' && x.trial !== e.trial) continue; const p = W.parse(x.at); const l = trail[trail.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) trail.push(p); }
      const [ax, ay] = W.parse(e.at);
      grid.draw({ size: spec.size, spec: $('orev').checked ? spec : { pits: [], wumpus: null, gold: spec.gold }, showHazards: true, cells, paths: [{ pts: trail, color: 'var(--muted)', width: 3, dash: true }], agent: { x: ax, y: ay, dir: e.action ? { N: 'N', E: 'E', S: 'S', W: 'W' }[e.action] : 'E' } });
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      $('sub').textContent = `${onOpt.algo === 'lrta' ? `trial ${e.trial} · ` : ''}moves this trial: ${e.steps} · optimal path length: ${opt == null ? 'unreachable' : opt}`;
      const rows = onOpt.algo === 'lrta' ? r.trialSteps.map((n, j) => [`trial ${j + 1}`, n]) : [['online DFS', r.steps]];
      $('bottom').innerHTML = `<table class="data"><tr><th>run</th><th class="num">moves</th><th class="num">optimal</th><th class="num">competitive ratio</th></tr>${rows.map(([l, n]) => `<tr><td>${l}</td><td class="num">${n}</td><td class="num">${opt == null ? '—' : opt}</td><td class="num">${opt ? (n / opt).toFixed(2) : '—'}</td></tr>`).join('')}</table>`;
    } };
    player.load(r.ev.length);
  }

  setup();
})();
