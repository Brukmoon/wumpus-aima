(function () {
  'use strict';
  W.topbar('Ch. 13 · Probabilistic Reasoning');
  const $ = id => document.getElementById(id);

  let spec, observed = new Set(['1,1']), query = null;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; op.safe(); } });
  spec = wp.spec;
  const op = new W.ObsPanel($('obspanel'), { getSpec: () => spec, onChange: o => { observed = o; run(); } });
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (wp.click(c)) return; const k = W.key(...c); if (observed.has(k)) op.toggle(k); else if (query === k) op.toggle(k); else { query = k; run(); } } });
  const pseudo = new W.Pseudo($('pseudo'));
  new W.Tabs($('ptabs'), [['rej', 'Rejection sampling'], ['lw', 'Likelihood weighting'], ['gibbs', 'Gibbs sampling']], k => pseudo.set(W.BN_PSEUDO[k].lines, W.BN_PSEUDO[k].caption), 'ch13.ps').set('rej');
  ['q', 'leak', 'N', 'seed'].forEach(id => $(id).onchange = run);
  $('run').onclick = run;

  function run() {
    const p = spec.pitProb != null ? spec.pitProb : 0.2;
    const bn = W.buildBN(spec, observed, { p, q: +$('q').value, leak: +$('leak').value });
    if (!bn.vars.length) { $('summary').innerHTML = '<p class="muted">No frontier squares: nothing to infer.</p>'; draw(bn, null); $('chart').innerHTML = ''; $('table').innerHTML = ''; return; }
    let ex;
    try { ex = W.bnExact(bn); } catch (e) { $('summary').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; return; }
    // default query: the most uncertain relevant square (closest to 50%), which makes the sampling most interesting
    if (!query || !bn.idx.has(query)) query = bn.vars.slice().sort((a, b) => Math.abs(ex.post[bn.idx.get(a)] - 0.5) - Math.abs(ex.post[bn.idx.get(b)] - 0.5))[0];
    const qi = bn.idx.get(query), N = Math.max(100, +$('N').value), seed = +$('seed').value;
    draw(bn, ex);
    if (!ex.Z) { $('summary').innerHTML = '<div class="callout bad">The evidence has probability 0 under this model (for example, a breeze with no possible pit). Make the sensor noisy.</div>'; return; }
    const rj = W.bnRejection(bn, qi, N, seed), lw = W.bnLikelihood(bn, qi, N, seed), gb = W.bnGibbs(bn, qi, N, seed);
    const exact = ex.post[qi];
    const blanket = mb(bn, qi);
    $('summary').innerHTML = `<h3>Query: P(Pit[${query}] | breezes)</h3>
      <dl class="kv"><dt>exact (enumeration)</dt><dd><b>${exact.toFixed(4)}</b>, summing over 2<sup>${bn.vars.length}</sup> = ${ex.worlds.toLocaleString()} assignments of the relevant pit nodes</dd>
      <dt>evidence</dt><dd>${bn.ev.length} Breeze nodes (${bn.ev.filter(e => e.b).length} true)</dd>
      <dt>pruned</dt><dd>${bn.irrelevant.length} pit node(s) with no path to the evidence: they sum to 1 and can be dropped</dd>
      <dt>Markov blanket</dt><dd>${blanket.children.length} children (Breeze nodes) and ${blanket.coparents.length} co-parents (other Pit nodes)</dd></dl>`;
    const thin = t => t.map((v, i) => [i + 1, v]).filter((_, i) => i < 50 || i % Math.ceil(N / 400) === 0 || i === N - 1);
    $('chart').innerHTML = W.chart([
      { values: thin(rj.trace), color: 'var(--danger)', label: 'rejection sampling' },
      { values: thin(lw.trace), color: 'var(--accent)', label: 'likelihood weighting' },
      { values: thin(gb.trace), color: 'var(--frontier)', label: 'Gibbs sampling' },
    ], { w: 900, h: 240, yMin: 0, yMax: 1, xLabel: 'samples', refs: [{ y: exact, label: 'exact ' + exact.toFixed(3), color: 'var(--gold)' }] });
    const last = t => t[t.length - 1];
    const row = (name, est, extra) => `<tr><td>${name}</td><td class="num">${isNaN(est) ? '—' : est.toFixed(4)}</td><td class="num">${isNaN(est) ? '—' : Math.abs(est - exact).toFixed(4)}</td><td>${extra}</td></tr>`;
    $('table').innerHTML = `<table class="data"><tr><th>method</th><th class="num">estimate</th><th class="num">|error|</th><th>notes</th></tr>
      ${row('rejection sampling', last(rj.trace), `accepted ${rj.accepted} of ${N} samples (${(100 * rj.accepted / N).toFixed(2)}%)`)}
      ${row('likelihood weighting', last(lw.trace), `effective sample size ≈ ${lw.ess.toFixed(0)} of ${N}`)}
      ${row('Gibbs sampling', last(gb.trace), `the resampled variable kept its value ${(100 * gb.stayRate).toFixed(0)}% of the time`)}</table>`;
  }
  function mb(bn, qi) {
    const children = bn.children[qi];
    const coparents = [...new Set(children.flatMap(ei => bn.ev[ei].parents))].filter(i => i !== qi);
    return { children, coparents };
  }
  function draw(bn, ex) {
    const cells = {}, paths = [];
    const qi = query && bn.idx.get(query), blanket = qi != null ? mb(bn, qi) : { children: [], coparents: [] };
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (observed.has(k)) {
        const e = bn.ev.find(z => z.v === k), inMB = e && blanket.children.includes(bn.ev.indexOf(e));
        o.fill = 'var(--accent)'; o.alpha = 0.18; o.label = e ? `B=${e.b ? 'T' : 'F'}` : ''; o.labelColor = 'var(--accent)';
        if (inMB) o.ring = 'var(--gold)';
      } else if (bn.idx.has(k)) {
        const i = bn.idx.get(k);
        o.label = ex && ex.Z ? `${(ex.post[i] * 100).toFixed(0)}%` : 'Pit?'; o.labelColor = 'var(--frontier)'; o.labelSize = 14;
        o.sub = 'Pit node'; o.fill = 'var(--frontier)'; o.alpha = 0.12;
        if (k === query || blanket.coparents.includes(i)) o.ring = 'var(--gold)';
      } else { o.sub = 'pruned'; o.fill = 'var(--line)'; o.alpha = 0.25; }
      cells[k] = o;
    }
    for (const e of bn.ev) for (const i of e.parents) {
      const [ax, ay] = W.parse(bn.vars[i]), [bx, by] = W.parse(e.v);
      const inMB = qi != null && (i === qi || blanket.children.includes(bn.ev.indexOf(e)));
      paths.push({ pts: [[ax, ay], [ax + (bx - ax) * 0.62, ay + (by - ay) * 0.62]], color: inMB ? 'var(--gold)' : 'var(--frontier)', width: inMB ? 3 : 1.5 });
    }
    grid.draw({ size: spec.size, spec, showHazards: false, cells, paths });
  }

  op.safe();
})();
