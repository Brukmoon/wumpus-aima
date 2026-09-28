(function () {
  'use strict';
  W.topbar('Ch. 12 · Quantifying Uncertainty');
  const $ = id => document.getElementById(id);

  let spec, player = null, focus = null, mode = 'risk', tau = 0.3;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; setup(); } });
  spec = wp.spec;
  const tabs = new W.Tabs($('tabs'), [['exact', 'Exact inference (§12.7)'], ['agent', 'A probabilistic agent']], () => setup(), 'ch12.tab');
  let obs = null;

  function setup() { if (player) { player.pause(); player.disabledKeys = true; player = null; } (tabs.cur === 'exact' ? setupExact : setupAgent)(); }

  /* ================= exact inference ================= */
  function setupExact() {
    $('intro').innerHTML = 'P(pit at q | evidence) = α Σ<sub>frontier</sub> P(breezes | pits) · P(pits). Only the <b>frontier</b> (unknown squares next to observed ones) needs enumerating: breezes depend only on neighbouring pits, so every other unknown square sums out. The wumpus has a uniform prior over the non-start squares, and each stench or its absence rules squares in or out. Click an unobserved square once to see its calculation, and click it again to mark it observed.';
    $('content').innerHTML = `<div class="panel" id="obspanel"></div>
      <div class="grid2" style="margin-top:16px">
        <div class="panel"><div class="row small" style="margin-bottom:6px"><label>show <select id="mode"><option value="risk">risk = P(pit or wumpus)</option><option value="pit">P(pit)</option><option value="wumpus">P(wumpus)</option></select></label><label><input type="checkbox" id="rev"> reveal true world</label></div><div id="grid"></div>
          <div class="legend"><span style="--c:var(--danger)">darker = more likely deadly</span><span>small text: P(pit) · P(wumpus)</span></div></div>
        <div class="panel stack"><div id="calc"></div></div>
      </div>
      <div class="panel" style="margin-top:16px" id="models"></div>`;
    $('mode').value = mode;
    $('mode').onchange = e => { mode = e.target.value; render(); };
    $('rev').onchange = render;
    const op = new W.ObsPanel($('obspanel'), { getSpec: () => spec, onChange: o => { obs = o; render(); } });
    const grid = new W.GridView($('grid'), { onCellClick: c => { if (wp.click(c)) return; const k = W.key(...c); if (obs.has(k) || (focus === k)) op.toggle(k); else { focus = k; render(); } } });
    function render() {
      let post;
      try { post = W.posterior(spec, obs); } catch (e) { $('calc').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; return; }
      if (!focus || obs.has(focus)) focus = post.frontier[0] || null;
      grid.draw({ size: spec.size, spec, showHazards: $('rev').checked, cells: W.probCells(spec, obs, post, { focus, mode }) });
      const p = spec.pitProb != null ? spec.pitProb : 0.2, U = post.unknown.length, F = post.frontier.length;
      let html = `<h3>Why these numbers</h3><dl class="kv"><dt>unknown squares</dt><dd>${U}. Full-joint enumeration would sum over 2<sup>${U}</sup> = ${Math.pow(2, U).toLocaleString()} pit configurations.</dd>
        <dt>frontier</dt><dd>${F} square(s): ${post.frontier.map(k => `[${k}]`).join(' ') || '—'}. Enumeration with pruning visited ${post.nodes} partial assignments and found <b>${post.nModels}</b> consistent configurations.</dd>
        <dt>wumpus</dt><dd>${post.wCands.length} square(s) consistent with every stench observation, each with probability ${post.wCands.length ? (1 / post.wCands.length).toFixed(3) : '—'}</dd></dl>`;
      if (focus) {
        const inF = post.frontier.includes(focus), withQ = post.models.filter(m => m.pits.includes(focus)), sum = (ms) => ms.reduce((a, m) => a + m.w, 0);
        html += `<h3 style="margin-top:12px">Square [${focus}]</h3>`;
        if (!inF) html += `<p class="small">[${focus}] is not next to any observed square, so no evidence touches it. P(pit) is just the prior p = ${p}.</p>`;
        else html += `<p class="small mono">P(pit) = Σ weights of configurations with a pit at [${focus}] / Σ all weights<br>= ${sum(withQ).toPrecision(4)} / ${post.Z.toPrecision(4)} = <b>${W.fmtP(post.pit.get(focus))}</b></p>
          <p class="small muted">Each configuration's weight is p<sup>#pits</sup>(1 − p)<sup>#empty</sup> over the frontier, with p = ${p}. Configurations that contradict a breeze (or the absence of one) get weight 0 and are skipped.</p>`;
        html += `<p class="small">P(wumpus at [${focus}]) = <b>${W.fmtP(post.wumpus.get(focus))}</b>. Risk of entering = 1 − (1 − ${W.fmtP(post.pit.get(focus))})(1 − ${W.fmtP(post.wumpus.get(focus))}) = <b>${(post.risk.get(focus) * 100).toFixed(1)}%</b></p>`;
        if (spec.pits.includes(focus) || spec.wumpus === focus) html += `<p class="small muted">(Truth: ${spec.pits.includes(focus) ? 'a pit' : 'the wumpus'} is really there.)</p>`;
      }
      $('calc').innerHTML = html;
      const tile = m => { const C = 12, n = spec.size; let g = `<div class="tile ${m.pits.includes(focus) ? 'bad' : 'good'}" title="weight ${m.w.toPrecision(3)} · probability ${(m.prob * 100).toFixed(1)}%"><svg width="${n * C}" height="${n * C}">`; for (const [x, y] of W.cells(n)) { const k = W.key(x, y); const f = obs.has(k) ? 'var(--panel-2)' : m.pits.includes(k) ? 'var(--pit)' : post.frontier.includes(k) ? 'var(--cell)' : 'var(--line)'; g += `<rect x="${(x - 1) * C}" y="${(n - y) * C}" width="${C - 1}" height="${C - 1}" style="fill:${f};stroke:var(--line)"/>`; } return g + `</svg><div class="small" style="text-align:center">${(m.prob * 100).toFixed(1)}%</div></div>`; };
      $('models').innerHTML = `<h3>The ${post.nModels} frontier configurations consistent with the evidence <span class="hint">(like Fig. 12.6) · red border: pit at [${focus || '—'}] · number: posterior probability</span></h3><div class="gallery">${post.models.slice(0, 80).map(tile).join('')}</div>${post.nModels > 80 ? `<p class="small muted">… ${post.nModels - 80} more</p>` : ''}`;
    }
    op.safe();
  }

  /* ================= probabilistic agent ================= */
  function setupAgent() {
    $('intro').innerHTML = 'The probabilistic agent explores zero-risk squares first, just as the logical agent does. When none is left, it steps into the frontier square with the <b>lowest exact risk</b>, provided that risk is at most τ, and otherwise goes home. Once the position of the wumpus has probability 1, it shoots it. Compare it with Chapter 7\'s hybrid agent, which gambles on <em>any</em> square not provably unsafe, and with Chapter 2\'s rough heuristic.';
    $('content').innerHTML = `<div class="panel"><div class="row"><label>risk threshold τ <input id="tau" type="range" min="0" max="0.6" step="0.01" value="${tau}"></label><b id="tauv"></b><span class="small muted">never step into a square riskier than this</span></div></div>
      <div class="grid2" style="margin-top:16px"><div class="panel"><div class="row small" style="margin-bottom:6px"><label><input type="checkbox" id="rev" checked> reveal true world</label></div><div id="grid"></div></div>
      <div class="panel stack"><dl class="kv" id="info"></dl><div id="why" class="callout"></div></div></div>
      <div id="player" style="margin-top:16px"></div>
      <div class="panel" style="margin-top:16px"><h3>Benchmark <span class="hint">same random worlds for every agent</span></h3>
        <div class="row"><label>worlds <input id="nw" type="number" value="200" min="20" step="50"></label><label>size <select id="bs"><option>4</option><option>5</option></select></label><button id="bench" class="primary">Run</button><span class="small muted" id="bprog"></span></div><div id="bout" style="margin-top:8px"></div></div>`;
    $('tauv').textContent = tau.toFixed(2);
    $('tau').oninput = e => { tau = +e.target.value; $('tauv').textContent = tau.toFixed(2); };
    $('tau').onchange = () => load();
    $('rev').onchange = () => player && player.go(player.i, true);
    const grid = new W.GridView($('grid'));
    player = new W.Player($('player'), { onStep: i => show(i) });
    let steps;
    function load() { steps = W.runProbEpisode(spec, { tau }); player.load(steps.length); }
    function show(i) {
      const s = steps[i], st = s.state, post = s.post;
      const cells = post ? W.probCells(spec, s.visited, post, { focus: s.choice }) : {};
      grid.draw({ size: spec.size, spec, showHazards: $('rev').checked, wumpusAlive: st.wumpusAlive, goldTaken: st.goldTaken, cells, agent: st.climbed ? null : st, paths: s.plan.length ? [{ pts: s.planCells, color: 'var(--frontier)', width: 3 }] : [] });
      const res = st.done ? (st.alive ? (st.hasGold ? '<span class="pill good">escaped with gold</span>' : '<span class="pill">climbed out</span>') : '<span class="pill bad">dead</span>') : '';
      $('info').innerHTML = `<dt>action</dt><dd><b>${s.action || '—'}</b></dd><dt>percept</dt><dd class="mono small">${W.perceptTuple(s.percept)}</dd><dt>score</dt><dd>${st.score} ${res}</dd>`;
      $('why').textContent = s.why;
    }
    $('bench').onclick = () => bench(+$('nw').value, +$('bs').value);
    load();
  }

  function bench(N, size) {
    const agents = [
      ['Probabilistic, τ = ' + tau.toFixed(2), s => W.runProbEpisode(s, { tau }).pop().state],
      ['Hybrid logical agent (Ch. 7)', s => W.runHybrid(s).steps.pop().state],
      ['Utility heuristic (Ch. 2)', s => W.runEpisode(s, 'utility').steps.pop().state],
      ['Goal-based, never risks (Ch. 2)', s => W.runEpisode(s, 'goal').steps.pop().state],
    ];
    const tot = agents.map(() => ({ score: 0, gold: 0, dead: 0 }));
    let seed = 1;
    const chunk = () => {
      const t0 = performance.now();
      while (seed <= N && performance.now() - t0 < 120) {
        const s = W.generateWorld({ size, seed, pitProb: spec.pitProb != null ? spec.pitProb : 0.2 });
        agents.forEach(([, run], i) => { const f = run(s); tot[i].score += f.score; if (!f.alive) tot[i].dead++; else if (f.hasGold && f.climbed) tot[i].gold++; });
        seed++;
      }
      $('bprog').textContent = `${seed - 1} / ${N}`;
      if (seed <= N) return setTimeout(chunk, 0);
      const best = Math.max(...tot.map(t => t.score));
      $('bout').innerHTML = `<table class="data"><tr><th>agent</th><th class="num">avg score</th><th class="num">gold out</th><th class="num">died</th></tr>${agents.map(([l], i) => `<tr class="${tot[i].score === best ? 'best' : ''}"><td>${l}</td><td class="num">${(tot[i].score / N).toFixed(1)}</td><td class="num">${(100 * tot[i].gold / N).toFixed(1)}%</td><td class="num">${(100 * tot[i].dead / N).toFixed(1)}%</td></tr>`).join('')}</table>`;
    };
    chunk();
  }

  setup();
})();
