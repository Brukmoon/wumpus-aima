/* Machine learning on Wumpus data (Chapters 19–21).
 * An example = one frontier square (unobserved, next to an observed square) after safe exploration of a random
 * world. Features describe what the agent has perceived around it; the label is whether it really holds a pit. */
(function (W) {
  'use strict';

  W.FEATURES = [
    { name: 'breezyNbrs', label: 'observed neighbours with a breeze', values: ['0', '1', '2+'] },
    { name: 'calmNbrs', label: 'observed neighbours without a breeze', values: ['0', '1', '2+'] },
    { name: 'minCand', label: 'fewest pit candidates of any breezy neighbour', values: ['none', '1', '2', '3+'] },
    { name: 'stenchNbrs', label: 'observed neighbours with a stench', values: ['0', '1+'] },
    { name: 'position', label: 'where the square is', values: ['corner', 'edge', 'inner'] },
  ];

  /* features of square k given the observed set (and the true world, for percepts) */
  W.featuresOf = function (spec, observed, k) {
    const n = spec.size, nb = s => W.neighbors(...W.parse(s), n).map(c => W.key(...c));
    const pc = new Map([...observed].map(v => [v, W.perceptsAt(spec, v)]));
    const on = nb(k).filter(v => observed.has(v));
    const breezy = on.filter(v => pc.get(v).breeze), calm = on.filter(v => !pc.get(v).breeze);
    const ruledOut = s => observed.has(s) || nb(s).some(v => observed.has(v) && !pc.get(v).breeze);
    let minCand = Infinity;
    for (const b of breezy) minCand = Math.min(minCand, nb(b).filter(s => !ruledOut(s)).length);
    const deg = nb(k).length;
    return {
      breezyNbrs: breezy.length >= 2 ? '2+' : String(breezy.length),
      calmNbrs: calm.length >= 2 ? '2+' : String(calm.length),
      minCand: minCand === Infinity ? 'none' : minCand >= 3 ? '3+' : String(minCand),
      stenchNbrs: on.some(v => pc.get(v).stench) ? '1+' : '0',
      position: deg === 2 ? 'corner' : deg === 3 ? 'edge' : 'inner',
    };
  };

  /* examples from `count` random worlds (seeds from `start`); each has x (features), y (pit?), post (exact P(pit)) */
  W.makeDataset = function ({ count = 400, start = 1000, size = 4, p = 0.2, withPost = true } = {}) {
    const out = [];
    for (let seed = start; seed < start + count; seed++) {
      const spec = W.generateWorld({ size, seed, pitProb: p });
      const observed = W.runEpisode(spec, 'goal').agent.m.visited;
      let post = null;
      if (withPost) { try { post = W.posterior(spec, observed); } catch (e) { post = null; } }
      const n = spec.size;
      for (const [x, y] of W.cells(n)) {
        const k = W.key(x, y);
        if (observed.has(k) || !W.neighbors(x, y, n).some(c => observed.has(W.key(...c)))) continue;
        out.push({ x: W.featuresOf(spec, observed, k), y: spec.pits.includes(k), post: post && post.Z ? post.pit.get(k) : null, seed, k });
      }
    }
    return out;
  };

  /* ---------------- decision trees (Figure 19.5, information gain) ---------------- */
  const H = (pos, neg) => { const t = pos + neg; if (!t || !pos || !neg) return 0; const a = pos / t, b = neg / t; return -a * Math.log2(a) - b * Math.log2(b); };
  const counts = ex => { let p = 0; for (const e of ex) if (e.y) p++; return [p, ex.length - p]; };
  W.infoGain = function (ex, f) {
    const [p, n] = counts(ex);
    let rem = 0;
    for (const v of f.values) { const sub = ex.filter(e => e.x[f.name] === v); const [sp, sn] = counts(sub); rem += (sub.length / ex.length) * H(sp, sn); }
    return H(p, n) - rem;
  };
  W.learnTree = function (ex, attrs, parent, { maxDepth = Infinity, minSplit = 1 } = {}, depth = 0) {
    const plural = xs => { const [p, n] = counts(xs); return p > n; };
    if (!ex.length) return { leaf: true, y: plural(parent), n: 0, pos: 0, why: 'no examples: parent plurality' };
    const [p, n] = counts(ex);
    if (!p || !n) return { leaf: true, y: p > 0, n: ex.length, pos: p, why: 'all examples agree' };
    if (!attrs.length || depth >= maxDepth || ex.length < minSplit) return { leaf: true, y: p > n, n: ex.length, pos: p, why: !attrs.length ? 'no attributes left' : 'depth or size limit' };
    let best = null, bg = -1;
    for (const f of attrs) { const g = W.infoGain(ex, f); if (g > bg + 1e-12) { bg = g; best = f; } }
    const node = { attr: best, gain: Math.max(0, bg), n: ex.length, pos: p, kids: {} };
    for (const v of best.values) node.kids[v] = W.learnTree(ex.filter(e => e.x[best.name] === v), attrs.filter(a => a !== best), ex, { maxDepth, minSplit }, depth + 1);
    return node;
  };
  W.treePredict = (t, x) => { while (!t.leaf) t = t.kids[x[t.attr.name]]; return t.y; };
  W.treeSize = t => t.leaf ? 1 : 1 + Object.values(t.kids).reduce((a, k) => a + W.treeSize(k), 0);

  /* ---------------- naive Bayes (Chapter 20) ---------------- */
  W.trainNaiveBayes = function (ex, alpha = 1) {
    const [p, n] = counts(ex), model = { prior: (p + alpha) / (ex.length + 2 * alpha), cond: {} };
    for (const f of W.FEATURES) {
      model.cond[f.name] = {};
      for (const v of f.values) {
        const cp = ex.filter(e => e.y && e.x[f.name] === v).length, cn = ex.filter(e => !e.y && e.x[f.name] === v).length;
        model.cond[f.name][v] = { pos: (cp + alpha) / (p + alpha * f.values.length), neg: (cn + alpha) / (n + alpha * f.values.length) };
      }
    }
    return model;
  };
  W.nbProb = function (m, x) {
    let lp = Math.log(m.prior), ln = Math.log(1 - m.prior);
    for (const f of W.FEATURES) { const c = m.cond[f.name][x[f.name]]; lp += Math.log(c.pos); ln += Math.log(c.neg); }
    return 1 / (1 + Math.exp(ln - lp));
  };

  /* ---------------- logistic regression on one-hot features (§19.6) ---------------- */
  W.oneHot = x => { const v = [1]; for (const f of W.FEATURES) for (const val of f.values) v.push(x[f.name] === val ? 1 : 0); return v; };
  W.trainLogistic = function (ex, { epochs = 200, lr = 0.5, l2 = 1e-3 } = {}) {
    const X = ex.map(e => W.oneHot(e.x)), Y = ex.map(e => e.y ? 1 : 0), d = X[0].length, w = new Float64Array(d);
    for (let ep = 0; ep < epochs; ep++) {
      const g = new Float64Array(d);
      X.forEach((x, i) => { const z = x.reduce((a, xi, j) => a + xi * w[j], 0), pr = 1 / (1 + Math.exp(-z)); for (let j = 0; j < d; j++) g[j] += (pr - Y[i]) * x[j]; });
      for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / X.length + l2 * w[j]);
    }
    return w;
  };
  W.logProb = (w, x) => { const v = W.oneHot(x); return 1 / (1 + Math.exp(-v.reduce((a, xi, j) => a + xi * w[j], 0))); };

  W.accuracy = (ex, pred) => ex.length ? ex.filter(e => pred(e) === e.y).length / ex.length : NaN;
  W.logLoss = (ex, prob) => ex.reduce((a, e) => { const p = Math.min(1 - 1e-9, Math.max(1e-9, prob(e))); return a - (e.y ? Math.log(p) : Math.log(1 - p)); }, 0) / ex.length;
})(window.W);
