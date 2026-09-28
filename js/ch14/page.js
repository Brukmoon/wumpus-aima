(function () {
  'use strict';
  W.topbar('Ch. 14 · Probabilistic Reasoning over Time');
  const $ = id => document.getElementById(id);

  let spec, R = null;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; simulate(); } });
  spec = wp.spec;
  const grid = new W.GridView($('grid'));
  const pseudo = new W.Pseudo($('pseudo')); pseudo.set(W.HMM_PSEUDO.lines, W.HMM_PSEUDO.caption);
  const player = new W.Player($('player'), { onStep: t => show(t) });
  ['stay', 'hit', 'fa', 'steps', 'np', 'seed'].forEach(id => $(id).onchange = simulate);
  $('go').onclick = simulate;
  ['view', 'truth', 'vit'].forEach(id => $(id).onchange = () => show(player.i));

  function simulate() {
    const hmm = W.buildHMM(spec, { stay: +$('stay').value, hit: +$('hit').value, fa: +$('fa').value });
    const sim = W.simulateHMM(hmm, Math.max(5, +$('steps').value), +$('seed').value);
    const filt = W.hmmFilter(hmm, sim), smooth = W.hmmSmooth(hmm, sim, filt), vit = W.hmmViterbi(hmm, sim), part = W.hmmParticles(hmm, sim, Math.max(10, +$('np').value), +$('seed').value);
    R = { hmm, sim, filt, smooth, vit, part };
    const pt = arr => sim.xs.map((x, t) => [t + 1, arr[t][x]]);
    const argmaxOK = arr => sim.xs.filter((x, t) => { const a = arr[t], m = Math.max(...a); return a[x] === m; }).length;
    $('acc').innerHTML = `Most probable square = true square: filtering ${argmaxOK(filt)}/${sim.xs.length}, smoothing ${argmaxOK(smooth)}/${sim.xs.length}, particles ${argmaxOK(part)}/${sim.xs.length}. The Viterbi path matches the true path at ${vit.filter((v, t) => v === sim.xs[t]).length}/${sim.xs.length} steps.`;
    R.chart = marker => W.chart([
      { values: pt(filt), color: 'var(--danger)', label: 'filtering' },
      { values: pt(smooth), color: 'var(--accent)', label: 'smoothing' },
      { values: pt(part), color: 'var(--frontier)', label: 'particle filter', dash: true },
    ], { w: 900, h: 220, yMin: 0, yMax: 1, xMin: 1, xLabel: 'time step', marker, refs: [{ y: 1 / hmm.S.length, label: 'uniform guess', color: 'var(--muted)' }] });
    player.load(sim.es.length);
  }

  function show(t) {
    if (!R) return;
    const { hmm, sim } = R, view = $('view').value;
    const dist = view === 'smooth' ? R.smooth[t] : view === 'part' ? R.part[t] : R.filt[t];
    const max = Math.max(...dist), cells = {};
    hmm.S.forEach((k, i) => { const p = dist[i]; cells[k] = { fill: `rgba(208,69,58,${Math.min(0.85, 0.05 + 0.8 * p / (max || 1))})`, alpha: 1, label: p >= 0.005 ? (p * 100).toFixed(0) + '%' : '', labelColor: 'var(--ink)' }; });
    const truth = hmm.S[sim.xs[t]];
    const view_ = { size: spec.size, pits: spec.pits, wumpus: $('truth').checked ? truth : null, gold: null };
    const [ax, ay] = W.parse(sim.as[t]);
    const paths = [];
    if ($('vit').checked) paths.push({ pts: R.vit.slice(0, t + 1).map(i => W.parse(hmm.S[i])), color: 'var(--frontier)', width: 3 });
    if ($('truth').checked) paths.push({ pts: sim.xs.slice(Math.max(0, t - 6), t + 1).map(i => W.parse(hmm.S[i])), color: 'var(--wumpus)', width: 2, dash: true });
    grid.draw({ size: spec.size, spec: view_, showHazards: true, cells, paths, agent: { x: ax, y: ay, dir: 'E' } });
    pseudo.highlight([{ filter: 'f', smooth: 's', part: 'p' }[view]].concat($('vit').checked ? ['v'] : []));
    const ent = -dist.reduce((a, p) => a + (p > 0 ? p * Math.log2(p) : 0), 0);
    $('info').innerHTML = `<dt>time</dt><dd>t = ${t + 1}</dd><dt>drone at</dt><dd>[${sim.as[t]}]</dd><dt>evidence</dt><dd>${sim.es[t] ? '<b style="color:var(--stench)">Stench</b>' : 'no stench'}</dd>
      <dt>true wumpus</dt><dd>[${truth}] (belief there: ${(dist[sim.xs[t]] * 100).toFixed(1)}%)</dd><dt>uncertainty</dt><dd>${ent.toFixed(2)} bits (uniform = ${Math.log2(hmm.S.length).toFixed(2)})</dd>
      <dt>Viterbi says</dt><dd>[${hmm.S[R.vit[t]]}]</dd>`;
    $('chart').innerHTML = R.chart(t + 1);
  }

  simulate();
})();
