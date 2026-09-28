(function () {
  'use strict';
  W.topbar('Ch. 15 · Probabilistic Programming');
  const $ = id => document.getElementById(id);

  let spec, observed = new Set(['1,1']), sel = null, last = null;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; op.safe(); } });
  spec = wp.spec;
  const op = new W.ObsPanel($('obspanel'), { getSpec: () => spec, onChange: o => { observed = o; sel = null; run(); } });
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (wp.click(c)) return; const k = W.key(...c); if (observed.has(k)) op.toggle(k); else if (sel === k) op.toggle(k); else { sel = k; render(); } } });
  $('model').onchange = () => { ui(); run(); };
  ['lambda', 'nr', 'nm', 'seed'].forEach(id => $(id).onchange = run);
  $('run').onclick = run;
  function ui() { $('lw').style.display = $('model').value === 'B' ? '' : 'none'; $('prog').textContent = W.PPL_PROGRAMS[$('model').value]; }

  function run() {
    ui();
    const p = spec.pitProb != null ? spec.pitProb : 0.2;
    const model = new W.PPLModel(spec, observed, { model: $('model').value, p, lambda: +$('lambda').value });
    let exact = null;
    try { exact = W.posterior(spec, observed, { maxModels: 100000 }); } catch (e) { exact = null; }
    if (!exact || !exact.Z) { $('stats').innerHTML = '<div class="callout bad">The observations are inconsistent with the model (for example, the wumpus sits in a pit).</div>'; return; }
    const init = { pits: new Set(exact.models[0] ? exact.models[0].pits : []), wumpus: exact.wCands[0] };
    const seed = +$('seed').value;
    const rj = W.pplRejection(model, Math.max(100, +$('nr').value), seed);
    const mh = W.pplMH(model, Math.max(100, +$('nm').value), seed, init);
    // exact distribution of the number of pits (program A): frontier count ⊛ Binomial(rest, p)
    let exactHist = null;
    if (model.model === 'A') {
      const F = new Array(model.m + 1).fill(0);
      exact.models.forEach(mm => { F[mm.pits.length] += mm.prob; });
      const rest = exact.unknown.filter(k => !exact.frontier.includes(k)).length;
      const binom = []; for (let j = 0; j <= rest; j++) binom.push(Math.exp(model.lf[rest] - model.lf[j] - model.lf[rest - j] + j * Math.log(p) + (rest - j) * Math.log(1 - p)));
      exactHist = new Array(model.m + 1).fill(0);
      F.forEach((a, i) => binom.forEach((b, j) => { if (i + j <= model.m) exactHist[i + j] += a * b; }));
    }
    last = { model, exact, rj, mh, exactHist };
    if (!sel || observed.has(sel)) sel = exact.frontier.slice().sort((a, b) => Math.abs(exact.pit.get(a) - 0.5) - Math.abs(exact.pit.get(b) - 0.5))[0] || model.sq.find(k => !observed.has(k));
    render();
  }

  function render() {
    if (!last) return;
    const { model, exact, rj, mh, exactHist } = last;
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (observed.has(k)) { const pc = W.perceptsAt(spec, k); o.fill = 'var(--accent)'; o.alpha = 0.16; o.sub = [pc.breeze && 'B', pc.stench && 'S'].filter(Boolean).join(' ') || '—'; }
      else if (k !== '1,1') {
        const v = mh.pit.get(k);
        o.fill = `rgba(208,69,58,${Math.min(0.75, 0.06 + 0.8 * v)})`; o.alpha = 1; o.label = (v * 100).toFixed(0) + '%'; o.labelColor = 'var(--ink)';
        if (model.model === 'A') o.sub = `exact ${(exact.pit.get(k) * 100).toFixed(0)}%`;
      }
      if (k === sel) o.ring = 'var(--gold)';
      cells[k] = o;
    }
    grid.draw({ size: spec.size, spec, showHazards: false, cells });
    const bars = (h, color, label, dx) => ({ values: h.map((v, i) => [i + dx, v]).filter(q => q[0] <= Math.min(model.m, 12) + 0.5), color, label, bars: true });
    const series = [bars(rj.hist, 'var(--muted)', `rejection (${rj.kept.length} accepted)`, -0.25), bars(mh.hist, 'var(--accent)', 'MCMC', 0.05)];
    if (exactHist) series.push({ values: exactHist.map((v, i) => [i, v]).filter(q => q[0] <= 12), color: 'var(--gold)', label: 'exact (program A)', dots: true, width: 1.2 });
    if (model.model === 'B') { const pr = []; for (let k = 0; k <= 12; k++) pr.push([k, Math.exp(-model.lambda + k * Math.log(model.lambda) - model.lf[k])]); series.push({ values: pr, color: 'var(--frontier)', label: 'prior Poisson(λ)', dash: true }); }
    $('hist').innerHTML = W.chart(series, { w: 520, h: 220, yMin: 0, xMin: -0.6, xMax: Math.min(model.m, 12) + 0.6, xLabel: 'number of pits' });
    // running estimate for the selected square
    const run = [], stride = Math.max(1, Math.floor(mh.samples.length / 400));
    let c = 0;
    mh.samples.forEach((t, i) => { if (t.pits.has(sel)) c++; if (i % stride === 0) run.push([i + 1, c / (i + 1)]); });
    const refs = model.model === 'A' ? [{ y: exact.pit.get(sel), label: 'exact ' + exact.pit.get(sel).toFixed(3), color: 'var(--gold)' }] : [];
    $('trace').innerHTML = W.chart([{ values: run, color: 'var(--accent)', label: `P(pit in [${sel}]), MCMC running average` }], { w: 520, h: 200, yMin: 0, yMax: 1, xLabel: 'MCMC step', refs });
    let maxErr = 0; if (model.model === 'A') model.sq.forEach(k => { if (!observed.has(k)) maxErr = Math.max(maxErr, Math.abs(mh.pit.get(k) - exact.pit.get(k))); });
    $('stats').innerHTML = `Rejection sampling: ${rj.kept.length} of ${rj.tried.toLocaleString()} program runs matched every observation (${(100 * rj.kept.length / rj.tried).toFixed(2)}%).<br>
      MCMC: ${(100 * mh.accepted / mh.samples.length).toFixed(1)}% of proposals accepted, first ${mh.burn} steps discarded as burn-in.${model.model === 'A' ? `<br>Largest |MCMC − exact| over all squares: <b>${maxErr.toFixed(3)}</b>` : ''}`;
    const picks = mh.samples.filter((_, i) => i > mh.burn && i % Math.max(1, Math.floor(mh.samples.length / 24)) === 0).slice(0, 24);
    $('gallery').innerHTML = picks.map(t => { const C = 12, n = spec.size; let g = `<div class="tile"><svg width="${n * C}" height="${n * C}">`; for (const [x, y] of W.cells(n)) { const k = W.key(x, y); const f = t.pits.has(k) ? 'var(--pit)' : t.wumpus === k ? 'var(--wumpus)' : observed.has(k) ? 'var(--panel-2)' : 'var(--cell)'; g += `<rect x="${(x - 1) * C}" y="${(n - y) * C}" width="${C - 1}" height="${C - 1}" style="fill:${f};stroke:var(--line)"/>`; } return g + `</svg><div class="small" style="text-align:center">${t.pits.size} pits</div></div>`; }).join('');
  }

  ui(); op.safe();
})();
