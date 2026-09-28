(function () {
  'use strict';
  W.topbar('Ch. 18 · Multiagent Decision Making');
  const $ = id => document.getElementById(id);
  let g;

  $('game').innerHTML = W.GAMES.map((x, i) => `<option value="${i}">${W.esc(x.name)}</option>`).join('');
  $('game').onchange = load;
  $('reset').onclick = load;
  function load() { g = JSON.parse(JSON.stringify(W.GAMES[+$('game').value])); $('story').textContent = g.story; render(); }

  function render() {
    const a = W.analyzeGame(g);
    const isNE = (i, j) => a.pure.some(([x, y]) => x === i && y === j);
    $('matrix').innerHTML = `<table class="payoff"><tr><th>${W.esc(g.rowP)} ↓ · ${W.esc(g.colP)} →</th>${g.cols.map(c => `<th>${W.esc(c)}</th>`).join('')}</tr>` +
      g.rows.map((r, i) => `<tr><th>${W.esc(r)}</th>${g.cols.map((_, j) => `<td class="${isNE(i, j) ? 'ne' : ''}">
        <span class="br">${a.brRow(j)[i] ? '●' : '&nbsp;'}</span><input type="text" data-i="${i}" data-j="${j}" data-k="0" value="${g.pay[i][j][0]}">,
        <input type="text" data-i="${i}" data-j="${j}" data-k="1" value="${g.pay[i][j][1]}"><span class="br">${a.brCol(i)[j] ? '●' : '&nbsp;'}</span></td>`).join('')}</tr>`).join('') + '</table>';
    $('matrix').querySelectorAll('input').forEach(inp => inp.onchange = () => { const v = +inp.value; if (isFinite(v)) { g.pay[+inp.dataset.i][+inp.dataset.j][+inp.dataset.k] = v; render(); } });
    const pct = v => (v * 100).toFixed(1) + '%';
    const mix = (names, p) => names.map((nm, i) => p[i] > 1e-9 ? `${W.esc(nm)} ${pct(p[i])}` : '').filter(Boolean).join(', ');
    $('analysis').innerHTML = `
      <dl class="kv">
        <dt>type</dt><dd>${a.zeroSum ? 'zero-sum: one player’s gain is the other’s loss' : 'general-sum'}</dd>
        <dt>dominant strategies</dt><dd>${W.esc(g.rowP)}: ${a.domRow >= 0 ? `<b>${W.esc(g.rows[a.domRow])}</b>` : 'none'} · ${W.esc(g.colP)}: ${a.domCol >= 0 ? `<b>${W.esc(g.cols[a.domCol])}</b>` : 'none'}</dd>
        <dt>pure Nash equilibria</dt><dd>${a.pure.length ? a.pure.map(([i, j]) => `(${W.esc(g.rows[i])}, ${W.esc(g.cols[j])}) → (${g.pay[i][j].join(', ')})`).join('<br>') : 'none'}</dd>
        <dt>mixed equilibria</dt><dd>${a.mixed.length ? a.mixed.map(e => `${W.esc(g.rowP)}: ${mix(g.rows, e.X)}<br>${W.esc(g.colP)}: ${mix(g.cols, e.Y)}<br><span class="muted">expected payoffs (${e.v.toFixed(2)}, ${e.u.toFixed(2)})</span>`).join('<hr>') : 'none'}</dd>
        <dt>Pareto optimal</dt><dd>${a.pareto.map(([i, j]) => `(${W.esc(g.rows[i])}, ${W.esc(g.cols[j])})`).join(', ')}</dd>
        <dt>maximin (${W.esc(g.rowP)}, pure)</dt><dd>${a.maximin}. The best the row player can guarantee without randomizing${a.zeroSum && a.mixed.length ? `. Randomizing raises it to ${a.mixed[0].v.toFixed(2)}, the value of the game.` : '.'}</dd>
      </dl>
      <p class="small muted">Mixed equilibria are found by <b>support enumeration</b>: guess which actions each player uses, make the <em>other</em> player indifferent among them, and check that nobody gains by switching to an unused action.</p>`;
    const fp = W.fictitiousPlay(g, 400);
    const colors = ['var(--accent)', 'var(--danger)', 'var(--frontier)'];
    const series = [];
    g.rows.forEach((r, i) => series.push({ values: fp.map((h, t) => [t + 1, h.row[i]]), color: colors[i], label: `${g.rowP}: ${r}` }));
    g.cols.forEach((c, j) => series.push({ values: fp.map((h, t) => [t + 1, h.col[j]]), color: colors[j], dash: true, label: `${g.colP}: ${c}` }));
    const refs = a.mixed.length ? [{ y: a.mixed[0].X[0], label: 'equilibrium mix', color: 'var(--gold)' }] : [];
    $('fp').innerHTML = W.chart(series, { w: 900, h: 220, yMin: 0, yMax: 1, xMin: 1, xLabel: 'round', refs });
  }
  load();
})();
