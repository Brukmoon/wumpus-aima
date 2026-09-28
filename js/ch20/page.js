(function () {
  'use strict';
  W.topbar('Ch. 20 · Learning Probabilistic Models');
  const $ = id => document.getElementById(id);
  let player = null;
  const tabs = new W.Tabs($('tabs'), [['bayes', 'Bayesian learning of p'], ['nb', 'Naive Bayes classifier'], ['em', 'EM: learning from breezes only']], () => setup(), 'ch20.tab');
  function setup() { if (player) { player.pause(); player.disabledKeys = true; player = null; } ({ bayes: setupBayes, nb: setupNB, em: setupEM })[tabs.cur](); }

  /* ================= Bayesian parameter learning (§20.2) ================= */
  function setupBayes() {
    $('intro').innerHTML = 'Treat the unknown pit probability θ as a random variable. Start with a <b>Beta(a, b)</b> prior. After seeing k pits among m squares, the posterior is Beta(a + k, b + m − k): the Beta family is <b>conjugate</b> to this likelihood. Each step below reveals one more fully observed 4×4 cave (15 squares that could hold a pit).';
    $('content').innerHTML = `<div class="panel"><div class="row"><label>true θ (hidden from the learner) <input id="tp" type="number" min="0.02" max="0.9" step="0.02" value="0.2"></label><label>prior a <input id="pa" type="number" min="0.1" step="0.5" value="1"></label><label>prior b <input id="pb" type="number" min="0.1" step="0.5" value="1"></label><label>worlds <input id="nw" type="number" min="5" max="500" value="100"></label><label>seed <input id="sd" type="number" value="1"></label></div></div>
      <div class="grid2" style="margin-top:16px"><div class="panel"><h3>Posterior density P(θ | data)</h3><div id="dens"></div></div><div class="panel"><h3>Estimates as data arrives</h3><div id="est"></div><dl class="kv" id="binfo"></dl></div></div>
      <div id="player" style="margin-top:16px"></div>`;
    ['tp', 'pa', 'pb', 'nw', 'sd'].forEach(id => $(id).onchange = run);
    player = new W.Player($('player'), { onStep: i => show(i) });
    let data;
    function run() {
      const th = +$('tp').value, N = Math.max(5, +$('nw').value), r = W.rng(+$('sd').value), m = 15;
      data = [{ k: 0, m: 0 }];
      for (let i = 1; i <= N; i++) { let k = 0; for (let j = 0; j < m; j++) if (r() < th) k++; data.push({ k: data[i - 1].k + k, m: data[i - 1].m + m, kw: k }); }
      player.load(data.length, 0);
    }
    function show(i) {
      const a = +$('pa').value, b = +$('pb').value, th = +$('tp').value, d = data[i];
      const A = a + d.k, B = b + d.m - d.k, xs = [];
      for (let x = 0.0025; x < 1; x += 0.005) xs.push([x, W.betaPdf(x, A, B)]);
      const prior = []; for (let x = 0.0025; x < 1; x += 0.005) prior.push([x, W.betaPdf(x, a, b)]);
      $('dens').innerHTML = W.chart([{ values: prior, color: 'var(--muted)', dash: true, label: `prior Beta(${a}, ${b})` }, { values: xs, color: 'var(--accent)', label: `posterior Beta(${A.toFixed(0)}, ${B.toFixed(0)})` }], { w: 520, h: 220, xMin: 0, xMax: 1, yMin: 0, xLabel: 'θ', marker: null, refs: [] }) + `<p class="small muted">gold line in the right chart: the true θ = ${th}</p>`;
      const ml = data.slice(1, i + 1).map((x, j) => [j + 1, x.k / x.m]), mean = data.slice(1, i + 1).map((x, j) => [j + 1, (a + x.k) / (a + b + x.m)]);
      $('est').innerHTML = W.chart([{ values: ml, color: 'var(--danger)', label: 'maximum likelihood k/m' }, { values: mean, color: 'var(--accent)', label: 'posterior mean (a+k)/(a+b+m)' }], { w: 520, h: 200, yMin: 0, yMax: Math.max(0.5, th * 2), xMin: 1, xMax: data.length - 1, xLabel: 'worlds observed', refs: [{ y: th, label: 'true θ', color: 'var(--gold)' }] });
      const sd = Math.sqrt(A * B / ((A + B) ** 2 * (A + B + 1)));
      $('binfo').innerHTML = `<dt>worlds seen</dt><dd>${i}${i ? ` (the last one had ${d.kw} pits)` : ''}</dd><dt>pits / squares</dt><dd>${d.k} / ${d.m}</dd><dt>ML estimate</dt><dd>${d.m ? (d.k / d.m).toFixed(3) : 'undefined (no data)'}</dd><dt>posterior mean</dt><dd>${(A / (A + B)).toFixed(3)} ± ${sd.toFixed(3)}</dd>`;
    }
    run();
  }

  /* ================= naive Bayes ================= */
  function setupNB() {
    $('intro').innerHTML = 'Naive Bayes (§20.2.3) predicts “pit?” from the same five features as Chapter 19 by assuming the features are <b>conditionally independent given the class</b>: P(pit | f₁…f₅) ∝ P(pit) Π P(fᵢ | pit). Its parameters are just counts, with add-one (Laplace) smoothing. How well do its <em>probabilities</em> match reality?';
    $('content').innerHTML = `<div class="panel"><div class="row"><label>training worlds <input id="ntr" type="number" value="400" step="100"></label><button id="go" class="primary">Train</button><span id="st" class="small muted"></span></div></div>
      <div class="grid2" style="margin-top:16px"><div class="panel"><h3>Learned conditional probabilities</h3><div id="cpt" class="scroll"></div></div>
      <div class="panel stack"><h3>Test performance</h3><div id="perf"></div></div></div>
      <div class="panel" style="margin-top:16px"><h3>Calibration: when a model says “x% chance of a pit”, how often is there one?</h3><div id="cal"></div></div>`;
    $('go').onclick = () => { $('st').textContent = 'generating…'; setTimeout(run, 20); };
    function run() {
      const train = W.makeDataset({ count: Math.max(20, +$('ntr').value), start: 1000 }), test = W.makeDataset({ count: 400, start: 50000 });
      $('st').textContent = `${train.length} training / ${test.length} test examples`;
      const nb = W.trainNaiveBayes(train), lr = W.trainLogistic(train), tree = W.learnTree(train, W.FEATURES, train, { maxDepth: 5, minSplit: 2 });
      $('cpt').innerHTML = `<p class="small">P(pit) = ${nb.prior.toFixed(3)}</p><table class="data"><tr><th>feature = value</th><th class="num">P(value | pit)</th><th class="num">P(value | no pit)</th></tr>${W.FEATURES.map(f => f.values.map(v => `<tr><td>${f.name} = ${v}</td><td class="num">${nb.cond[f.name][v].pos.toFixed(3)}</td><td class="num">${nb.cond[f.name][v].neg.toFixed(3)}</td></tr>`).join('')).join('')}</table>`;
      const bayes = test.filter(e => e.post != null);
      const models = [
        ['naive Bayes', e => W.nbProb(nb, e.x), 'var(--accent)'],
        ['logistic regression', e => W.logProb(lr, e.x), 'var(--frontier)'],
        ['decision tree (leaf frequencies)', e => { let t = tree; while (!t.leaf) t = t.kids[e.x[t.attr.name]]; return t.n ? t.pos / t.n : 0.5; }, 'var(--danger)'],
        ['exact posterior (Chapter 12)', e => e.post, 'var(--gold)'],
      ];
      $('perf').innerHTML = `<table class="data"><tr><th>model</th><th class="num">accuracy</th><th class="num">log loss</th></tr>${models.map(([n, f]) => `<tr><td>${n}</td><td class="num">${(100 * W.accuracy(bayes, e => f(e) > 0.5)).toFixed(1)}%</td><td class="num">${W.logLoss(bayes, f).toFixed(3)}</td></tr>`).join('')}</table><p class="small muted">Log loss rewards good <em>probabilities</em>, not just the right side of 0.5. Lower is better.</p>`;
      const bins = 10, series = models.map(([n, f, c]) => {
        const s = new Array(bins).fill(0), cnt = new Array(bins).fill(0), pr = new Array(bins).fill(0);
        bayes.forEach(e => { const p = f(e), b = Math.min(bins - 1, Math.floor(p * bins)); cnt[b]++; pr[b] += p; if (e.y) s[b]++; });
        return { values: cnt.map((c_, b) => c_ >= 5 ? [pr[b] / c_, s[b] / c_] : null).filter(Boolean), color: c, label: n, dots: true };
      });
      series.push({ values: [[0, 0], [1, 1]], color: 'var(--muted)', dash: true, label: 'perfect calibration' });
      $('cal').innerHTML = W.chart(series, { w: 900, h: 260, xMin: 0, xMax: 1, yMin: 0, yMax: 1, xLabel: 'predicted probability of a pit' });
    }
    run();
  }

  /* ================= EM with hidden pits ================= */
  function setupEM() {
    $('intro').innerHTML = 'Now the learner <b>never sees a pit</b>. For many 3×3 caves it gets only a “breeze map”: which squares are breezy, as if flown over by a sensor drone. The pits are <b>hidden variables</b>. EM (§20.3) alternates two steps. The <b>E-step</b> computes, for each cave, the expected number of pits given the breezes and the current θ. The <b>M-step</b> sets θ to the expected pit fraction. Repeat until it converges.';
    $('content').innerHTML = `<div class="panel"><div class="row"><label>true θ <input id="tp" type="number" min="0.05" max="0.8" step="0.05" value="0.25"></label><label>caves <input id="nw" type="number" min="10" value="300" step="50"></label><label>initial θ₀ <input id="t0" type="number" min="0.01" max="0.95" step="0.05" value="0.6"></label><label>seed <input id="sd" type="number" value="1"></label></div></div>
      <div class="grid2" style="margin-top:16px"><div class="panel"><h3>θ per EM iteration</h3><div id="th"></div><dl class="kv" id="einfo"></dl></div><div class="panel"><h3>Log likelihood of the breeze data</h3><div id="ll"></div></div></div>
      <div id="player" style="margin-top:16px"></div>
      <div class="panel" style="margin-top:16px"><h3>A few of the caves the learner sees <span class="hint">B = breezy (pits shown faintly for you, never for the learner)</span></h3><div id="caves" class="gallery"></div></div>`;
    ['tp', 'nw', 't0', 'sd'].forEach(id => $(id).onchange = run);
    player = new W.Player($('player'), { onStep: i => show(i) });
    const n = 3, sq = W.cells(n).map(c => W.key(...c)), cand = sq.filter(k => k !== '1,1'), M = cand.length;
    const nb = new Map(sq.map(k => [k, W.neighbors(...W.parse(k), n).map(c => W.key(...c))]));
    const breezeMap = pits => sq.map(k => nb.get(k).some(c => pits.has(c)) ? 1 : 0).join('');
    // for every breeze map: how many pit configurations with k pits produce it (precomputed once)
    const table = new Map();
    for (let m = 0; m < (1 << M); m++) {
      const pits = new Set(cand.filter((_, i) => m >> i & 1)), key = breezeMap(pits);
      if (!table.has(key)) table.set(key, new Array(M + 1).fill(0));
      table.get(key)[pits.size]++;
    }
    let caves, iters;
    const lik = (c, t) => c.reduce((a, cnt, k) => a + cnt * Math.pow(t, k) * Math.pow(1 - t, M - k), 0);
    function run() {
      const th = +$('tp').value, N = Math.max(10, +$('nw').value), r = W.rng(+$('sd').value);
      caves = [];
      for (let i = 0; i < N; i++) { const pits = new Set(cand.filter(() => r() < th)); caves.push({ pits, map: breezeMap(pits) }); }
      let t = +$('t0').value;
      iters = [];
      for (let it = 0; it < 60; it++) {
        let LL = 0, Ek = 0;
        for (const c of caves) { const cnt = table.get(c.map), L = lik(cnt, t); LL += Math.log(L); Ek += cnt.reduce((a, x, k) => a + k * x * Math.pow(t, k) * Math.pow(1 - t, M - k), 0) / L; }
        iters.push({ t, LL, Ek });
        const t2 = Ek / (M * caves.length);
        if (Math.abs(t2 - t) < 1e-7) { iters.push({ t: t2, LL: caves.reduce((a, c) => a + Math.log(lik(table.get(c.map), t2)), 0), Ek }); break; }
        t = t2;
      }
      const trueFrac = caves.reduce((a, c) => a + c.pits.size, 0) / (M * caves.length);
      iters.trueFrac = trueFrac;
      $('caves').innerHTML = caves.slice(0, 18).map(c => { const C = 20; let g = `<div class="tile"><svg width="${n * C}" height="${n * C}">`; sq.forEach((k, i) => { const [x, y] = W.parse(k), br = c.map[i] === '1'; g += `<rect x="${(x - 1) * C}" y="${(n - y) * C}" width="${C - 1}" height="${C - 1}" style="fill:${br ? 'var(--breeze)' : 'var(--cell)'};opacity:${br ? 0.6 : 1};stroke:var(--line)"/>`; if (c.pits.has(k)) g += `<circle cx="${(x - 1) * C + C / 2}" cy="${(n - y) * C + C / 2}" r="4" style="fill:var(--pit);opacity:.35"/>`; if (br) g += `<text x="${(x - 1) * C + C / 2}" y="${(n - y) * C + 14}" font-size="10" text-anchor="middle" style="fill:var(--ink)">B</text>`; }); return g + '</svg></div>'; }).join('');
      player.load(iters.length, 0);
    }
    function show(i) {
      const th = +$('tp').value;
      $('th').innerHTML = W.chart([{ values: iters.map((x, j) => [j, x.t]), color: 'var(--accent)', label: 'θ estimate', dots: true }], { w: 520, h: 200, yMin: 0, yMax: 1, xMin: 0, marker: i, xLabel: 'EM iteration', refs: [{ y: th, label: 'true θ', color: 'var(--gold)' }, { y: iters.trueFrac, label: 'actual pit fraction in the data', color: 'var(--muted)' }] });
      $('ll').innerHTML = W.chart([{ values: iters.map((x, j) => [j, x.LL]), color: 'var(--frontier)', label: 'log P(breeze maps | θ)', dots: true }], { w: 520, h: 200, xMin: 0, marker: i, xLabel: 'EM iteration' });
      const x = iters[i];
      $('einfo').innerHTML = `<dt>iteration</dt><dd>${i}</dd><dt>θ</dt><dd>${x.t.toFixed(4)}</dd><dt>E-step</dt><dd>expected pits over all caves: ${x.Ek.toFixed(1)}</dd><dt>M-step</dt><dd>θ ← ${x.Ek.toFixed(1)} / (${M} × ${caves.length}) = ${(x.Ek / (M * caves.length)).toFixed(4)}</dd><dt>log likelihood</dt><dd>${x.LL.toFixed(2)}</dd>`;
    }
    run();
  }

  setup();
})();
