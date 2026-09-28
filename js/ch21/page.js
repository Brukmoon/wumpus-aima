(function () {
  'use strict';
  W.topbar('Ch. 21 · Deep Learning');
  const $ = id => document.getElementById(id);

  let train = [], test = [], net = null, hist = [], running = 0, dataKey = '';
  let spec, observed = new Set(['1,1']);
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; op.safe(); } });
  spec = wp.spec;
  const op = new W.ObsPanel($('obspanel'), { getSpec: () => spec, onChange: o => { observed = o; live(); } });
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (!wp.click(c)) op.toggle(W.key(...c)); } });
  $('train').onclick = start;
  $('stop').onclick = () => { running++; $('status').textContent = 'stopped'; };

  function start() {
    const token = ++running;
    const nw = Math.max(50, +$('nw').value);
    if (dataKey !== String(nw)) {
      $('status').textContent = 'generating data…';
      setTimeout(() => { train = W.windowDataset({ count: nw, start: 1000 }); test = W.windowDataset({ count: 300, start: 50000 }); dataKey = String(nw); go(token); }, 20);
    } else go(token);
  }
  function go(token) {
    net = new W.MLP(100, +$('h').value, 1); hist = [];
    const epochs = Math.max(1, +$('ep').value), lr = +$('lr').value, r = W.rng(3);
    const exactTest = test.filter(e => e.post != null);
    const exLoss = exactTest.reduce((a, e) => { const p = Math.min(1 - 1e-9, Math.max(1e-9, e.post)); return a - (e.y ? Math.log(p) : Math.log(1 - p)); }, 0) / exactTest.length;
    let ep = 0;
    const step = () => {
      if (token !== running) return;
      const idx = train.map((_, i) => i).sort(() => r() - 0.5);
      for (let b = 0; b < idx.length; b += 32) net.trainBatch(idx.slice(b, b + 32).map(i => train[i]), lr);
      ep++;
      const tr = net.evaluate(train), te = net.evaluate(test);
      hist.push({ ep, tr: tr.loss, te: te.loss, acc: te.acc });
      $('status').textContent = `epoch ${ep} / ${epochs} · ${net.params().toLocaleString()} parameters · ${train.length} training examples`;
      $('loss').innerHTML = W.chart([{ values: hist.map(h => [h.ep, h.tr]), color: 'var(--accent)', label: 'training loss' }, { values: hist.map(h => [h.ep, h.te]), color: 'var(--danger)', label: 'test loss' }], { w: 520, h: 220, xMin: 1, xMax: epochs, yMin: 0.2, xLabel: 'epoch', refs: [{ y: exLoss, label: 'exact posterior (the best possible)', color: 'var(--gold)' }] });
      $('acc').innerHTML = `Test accuracy ${(te.acc * 100).toFixed(1)}% · test loss ${te.loss.toFixed(3)} vs exact posterior ${exLoss.toFixed(3)}`;
      if (ep % 3 === 0 || ep === epochs) { visuals(exactTest); live(); }
      if (ep < epochs) setTimeout(step, 0);
    };
    step();
  }

  function visuals(exactTest) {
    const pts = exactTest.slice(0, 600).map(e => [e.post, net.predict(e.v)]);
    $('scatter').innerHTML = W.chart([{ values: pts, color: 'var(--accent)', dots: true, scatter: true, label: 'test squares' }, { values: [[0, 0], [1, 1]], color: 'var(--muted)', dash: true, label: 'perfect agreement' }], { w: 520, h: 220, xMin: 0, xMax: 1, yMin: 0, yMax: 1, xLabel: 'exact P(pit) (Chapter 12) → network output ↑' });
    if (!net.W.length || net.sizes.length < 3) { $('rf').innerHTML = rfTile(net.W[0][0], 'the single output unit', net.W[0][0] ? 1 : 1); return; }
    $('rf').innerHTML = net.W[0].map((w, j) => rfTile(w, `unit ${j + 1}`, net.W[1][0][j])).join('');
  }
  function rfTile(w, name, outW) {
    const C = 14, n = 5, ch = 2, vals = []; for (let c = 0; c < 25; c++) vals.push(w[c * 4 + ch]);
    const m = Math.max(1e-6, ...vals.map(Math.abs));
    let s = `<div class="tile"><svg width="${n * C}" height="${n * C}">`;
    vals.forEach((v, c) => { const x = c % 5, y = Math.floor(c / 5), a = Math.abs(v) / m; s += `<rect x="${x * C}" y="${y * C}" width="${C - 1}" height="${C - 1}" style="fill:${v > 0 ? `rgba(208,69,58,${a})` : `rgba(47,123,192,${a})`};stroke:var(--line)"/>`; });
    s += `<rect x="${2 * C}" y="${2 * C}" width="${C - 1}" height="${C - 1}" style="fill:none;stroke:var(--gold);stroke-width:2"/>`;
    return s + `</svg><div class="small" style="text-align:center">${name} ${outW > 0 ? '+' : '−'}</div></div>`;
  }

  function live() {
    let post = null; try { post = W.posterior(spec, observed); } catch (e) { post = null; }
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (observed.has(k)) { const pc = W.perceptsAt(spec, k); o.fill = 'var(--accent)'; o.alpha = 0.16; o.sub = [pc.breeze && 'B', pc.stench && 'S'].filter(Boolean).join(' ') || '—'; }
      else if (net && W.neighbors(x, y, spec.size).some(c => observed.has(W.key(...c)))) {
        const p = net.predict(W.encodeWindow(spec, observed, k));
        o.fill = `rgba(208,69,58,${Math.min(0.75, 0.06 + 0.8 * p)})`; o.alpha = 1; o.label = (p * 100).toFixed(0) + '%'; o.labelColor = 'var(--ink)';
        o.sub = post && post.Z ? `exact ${(post.pit.get(k) * 100).toFixed(0)}%` : '';
      }
      cells[k] = o;
    }
    grid.draw({ size: spec.size, spec, showHazards: true, cells });
  }

  op.safe();
  start();
})();
