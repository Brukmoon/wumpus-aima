(function () {
  'use strict';
  W.topbar('Ch. 19 · Learning from Examples');
  const $ = id => document.getElementById(id);

  document.querySelector('.panel p.small').innerHTML = 'Features: ' + W.FEATURES.map(f => `<b>${f.name}</b> (${W.esc(f.label)}: ${f.values.join(' / ')})`).join(' · ') + '. Label: is there a pit in the square?';
  const pseudo = new W.Pseudo($('pseudo'));
  pseudo.set([
    ['', 'function LEARN-DECISION-TREE(examples, attributes, parent_examples) returns a tree'],
    ['', '  if examples is empty then return PLURALITY-VALUE(parent_examples)'],
    ['', '  else if all examples have the same classification then return the classification'],
    ['', '  else if attributes is empty then return PLURALITY-VALUE(examples)'],
    ['', '  else'],
    ['', '    A ← argmax_{a ∈ attributes} IMPORTANCE(a, examples)'],
    ['', '    tree ← a new decision tree with root test A'],
    ['', '    for each value v of A do'],
    ['', '      exs ← {e : e ∈ examples and e.A = v}'],
    ['', '      subtree ← LEARN-DECISION-TREE(exs, attributes − A, examples)'],
    ['', '      add a branch to tree with label (A = v) and subtree subtree'],
    ['', '    return tree'],
    ['', ''],
    ['', 'IMPORTANCE = Gain(A) = B(p/(p+n)) − Remainder(A),  B(q) = −(q log₂ q + (1−q) log₂(1−q))'],
  ], 'Figure 19.5: the decision-tree learning algorithm (+ a depth / size limit, §19.3.4)');

  let train = [], test = [], tree = null, spec, observed = new Set(['1,1']);
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; op.safe(); } });
  spec = wp.spec;
  const op = new W.ObsPanel($('obspanel'), { getSpec: () => spec, onChange: o => { observed = o; live(); } });
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (!wp.click(c)) op.toggle(W.key(...c)); } });
  $('learn').onclick = () => { $('status').textContent = 'generating…'; setTimeout(learn, 20); };
  ['depth', 'minsplit'].forEach(id => $(id).onchange = () => train.length && fit());

  function learn() {
    const ntr = Math.max(20, +$('ntr').value), nte = Math.max(20, +$('nte').value);
    train = W.makeDataset({ count: ntr, start: 1000 });
    test = W.makeDataset({ count: nte, start: 50000 });
    $('status').textContent = `${train.length} training and ${test.length} test examples`;
    fit(); curves();
  }
  const opts = () => ({ maxDepth: Math.max(0, +$('depth').value), minSplit: Math.max(1, +$('minsplit').value) });

  function fit() {
    tree = W.learnTree(train, W.FEATURES, train, opts());
    const render = (t, label, d) => {
      const pad = `padding-left:${d * 18}px`;
      if (t.leaf) return `<div style="${pad}">${label} → <b class="${t.y ? 'bad' : 'ok'}">${t.y ? 'PIT' : 'no pit'}</b> <span class="muted">(${t.pos}/${t.n}${t.n ? '' : ', ' + t.why})</span></div>`;
      return `<div style="${pad}">${label}${label ? ' → ' : ''}<b>${t.attr.name}?</b> <span class="muted">gain ${t.gain.toFixed(3)} · ${t.pos}/${t.n}</span></div>` +
        t.attr.values.map(v => render(t.kids[v], `${t.attr.name} = ${v}`, d + 1)).join('');
    };
    $('tree').innerHTML = render(tree, '', 0);
    const dtAcc = e => W.treePredict(tree, e.x);
    const lr = W.trainLogistic(train);
    const [p] = [train.filter(e => e.y).length];
    const majority = p > train.length / 2;
    const bayes = test.filter(e => e.post != null);
    const rows = [
      ['decision tree', W.accuracy(train, dtAcc), W.accuracy(test, dtAcc), `${W.treeSize(tree)} nodes`],
      ['logistic regression', W.accuracy(train, e => W.logProb(lr, e.x) > 0.5), W.accuracy(test, e => W.logProb(lr, e.x) > 0.5), `${W.oneHot(train[0].x).length} weights`],
      [`always “${majority ? 'pit' : 'no pit'}” (majority)`, W.accuracy(train, () => majority), W.accuracy(test, () => majority), 'baseline'],
      ['Bayes-optimal (exact posterior > 0.5)', NaN, W.accuracy(bayes, e => e.post > 0.5), 'uses the whole observation, not just 5 features'],
    ];
    $('acc').innerHTML = `<h3>Accuracy</h3><table class="data"><tr><th>classifier</th><th class="num">train</th><th class="num">test</th><th></th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td class="num">${isNaN(r[1]) ? '—' : (r[1] * 100).toFixed(1) + '%'}</td><td class="num">${(r[2] * 100).toFixed(1)}%</td><td class="small muted">${r[3]}</td></tr>`).join('')}</table>`;
    live();
  }

  function curves() {
    const sizes = [10, 20, 40, 80, 160, 320, 640, 1280, 2560].filter(s => s <= train.length).concat([train.length]);
    const r = W.rng(5), shuffled = train.slice().sort(() => r() - 0.5);
    const dt = [], lr = [];
    for (const s of sizes) {
      const sub = shuffled.slice(0, s), t = W.learnTree(sub, W.FEATURES, sub, opts()), w = W.trainLogistic(sub, { epochs: 150 });
      dt.push([s, W.accuracy(test, e => W.treePredict(t, e.x))]); lr.push([s, W.accuracy(test, e => W.logProb(w, e.x) > 0.5)]);
    }
    const bayes = test.filter(e => e.post != null), ba = W.accuracy(bayes, e => e.post > 0.5);
    $('lc').innerHTML = W.chart([{ values: dt, color: 'var(--accent)', label: 'decision tree (test)', dots: true }, { values: lr, color: 'var(--frontier)', label: 'logistic regression (test)', dots: true }], { w: 520, h: 220, yMin: 0.5, yMax: 1, xLabel: 'training examples', refs: [{ y: ba, label: 'Bayes-optimal', color: 'var(--gold)' }] });
    const small = shuffled.slice(0, Math.min(60, shuffled.length)), trA = [], teA = [], trS = [], teS = [];
    for (let d = 0; d <= 5; d++) {
      const t = W.learnTree(train, W.FEATURES, train, { maxDepth: d }), ts = W.learnTree(small, W.FEATURES, small, { maxDepth: d });
      trA.push([d, W.accuracy(train, e => W.treePredict(t, e.x))]); teA.push([d, W.accuracy(test, e => W.treePredict(t, e.x))]);
      trS.push([d, W.accuracy(small, e => W.treePredict(ts, e.x))]); teS.push([d, W.accuracy(test, e => W.treePredict(ts, e.x))]);
    }
    $('ov').innerHTML = W.chart([
      { values: trA, color: 'var(--accent)', label: 'all data: train', dots: true }, { values: teA, color: 'var(--accent)', dash: true, label: 'all data: test', dots: true },
      { values: trS, color: 'var(--danger)', label: '60 examples: train', dots: true }, { values: teS, color: 'var(--danger)', dash: true, label: '60 examples: test', dots: true },
    ], { w: 520, h: 220, yMin: 0.5, yMax: 1, xLabel: 'max depth' });
  }

  function live() {
    if (!tree) { grid.draw({ size: spec.size, spec, showHazards: false }); return; }
    let post = null; try { post = W.posterior(spec, observed); } catch (e) { post = null; }
    const cells = {}, rows = [];
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (observed.has(k)) { const pc = W.perceptsAt(spec, k); o.fill = 'var(--accent)'; o.alpha = 0.16; o.sub = [pc.breeze && 'B', pc.stench && 'S'].filter(Boolean).join(' ') || '—'; }
      else if (W.neighbors(x, y, spec.size).some(c => observed.has(W.key(...c)))) {
        const f = W.featuresOf(spec, observed, k), pred = W.treePredict(tree, f), truth = spec.pits.includes(k);
        o.label = (pred ? 'PIT' : 'ok') + (pred === truth ? ' ✓' : ' ✗'); o.labelColor = pred === truth ? 'var(--safe)' : 'var(--danger)';
        o.sub = post && post.Z ? `exact P ${W.fmtP(post.pit.get(k))}` : ''; if (pred) { o.fill = 'var(--pit)'; o.alpha = 0.25; }
        rows.push(`<tr><td>[${k}]</td><td class="small">${W.FEATURES.map(ff => `${ff.name}=${f[ff.name]}`).join(', ')}</td><td>${pred ? 'pit' : 'no pit'}</td><td>${truth ? 'pit' : 'no pit'}</td><td class="num">${post && post.Z ? W.fmtP(post.pit.get(k)) : '—'}</td></tr>`);
      }
      cells[k] = o;
    }
    grid.draw({ size: spec.size, spec, showHazards: true, cells });
    $('sq').innerHTML = `<table class="data"><tr><th>square</th><th>features</th><th>tree says</th><th>truth</th><th class="num">exact P(pit)</th></tr>${rows.join('')}</table>`;
  }

  op.safe();
  $('status').textContent = 'generating…'; setTimeout(learn, 50);
})();
