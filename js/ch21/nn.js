/* Chapter 21: a small multilayer perceptron trained with backpropagation and Adam.
 * Input: the 5×5 window around a frontier square, four channels per cell
 * (inside the grid, observed, breeze perceived there, stench perceived there) = 100 numbers. Output: P(pit). */
(function (W) {
  'use strict';
  const R = 2, CH = ['inside', 'observed', 'breeze', 'stench'];
  W.NN_CHANNELS = CH; W.NN_R = R;

  W.encodeWindow = function (spec, observed, k) {
    const [cx, cy] = W.parse(k), v = [];
    for (let dy = R; dy >= -R; dy--) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy, inside = W.inside(x, y, spec.size), key = W.key(x, y), ob = inside && observed.has(key);
      const pc = ob ? W.perceptsAt(spec, key) : null;
      v.push(inside ? 1 : 0, ob ? 1 : 0, ob && pc.breeze ? 1 : 0, ob && pc.stench ? 1 : 0);
    }
    return v;
  };
  W.windowDataset = function ({ count = 600, start = 1000, size = 4, p = 0.2 } = {}) {
    const out = [];
    for (let seed = start; seed < start + count; seed++) {
      const spec = W.generateWorld({ size, seed, pitProb: p }), observed = W.runEpisode(spec, 'goal').agent.m.visited;
      let post = null; try { post = W.posterior(spec, observed); } catch (e) { post = null; }
      for (const [x, y] of W.cells(size)) {
        const k = W.key(x, y);
        if (observed.has(k) || !W.neighbors(x, y, size).some(c => observed.has(W.key(...c)))) continue;
        out.push({ v: W.encodeWindow(spec, observed, k), y: spec.pits.includes(k) ? 1 : 0, post: post && post.Z ? post.pit.get(k) : null });
      }
    }
    return out;
  };

  W.MLP = class {
    constructor(nin, hidden, seed = 1) {
      const r = W.rng(seed), g = () => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return u - 3; };   // ≈ N(0, 1)
      this.sizes = [nin].concat(hidden ? [hidden] : [], [1]);
      this.W = []; this.b = [];
      for (let l = 0; l < this.sizes.length - 1; l++) {
        const a = this.sizes[l], c = this.sizes[l + 1], s = Math.sqrt(2 / (a + c));
        this.W.push(Array.from({ length: c }, () => Float64Array.from({ length: a }, () => g() * s)));
        this.b.push(new Float64Array(c));
      }
      this.m = this.W.map(w => w.map(row => new Float64Array(row.length))); this.v = this.W.map(w => w.map(row => new Float64Array(row.length)));
      this.mb = this.b.map(b => new Float64Array(b.length)); this.vb = this.b.map(b => new Float64Array(b.length)); this.t = 0;
    }
    forward(x) {
      const acts = [x];
      for (let l = 0; l < this.W.length; l++) {
        const last = l === this.W.length - 1, a = acts[l], out = new Float64Array(this.W[l].length);
        for (let j = 0; j < out.length; j++) { let z = this.b[l][j]; const w = this.W[l][j]; for (let i = 0; i < a.length; i++) z += w[i] * a[i]; out[j] = last ? 1 / (1 + Math.exp(-z)) : Math.tanh(z); }
        acts.push(out);
      }
      return acts;
    }
    predict(x) { const a = this.forward(x); return a[a.length - 1][0]; }
    /* one Adam step on a mini-batch, cross-entropy loss (so the output delta is simply p − y) */
    trainBatch(batch, lr = 0.01, l2 = 1e-4) {
      const gW = this.W.map(w => w.map(row => new Float64Array(row.length))), gb = this.b.map(b => new Float64Array(b.length));
      let loss = 0;
      for (const ex of batch) {
        const acts = this.forward(ex.v), p = acts[acts.length - 1][0];
        loss -= ex.y ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9));
        let delta = [p - ex.y];
        for (let l = this.W.length - 1; l >= 0; l--) {
          const a = acts[l], nd = l ? new Float64Array(a.length) : null;
          for (let j = 0; j < delta.length; j++) {
            gb[l][j] += delta[j];
            const w = this.W[l][j], g = gW[l][j];
            for (let i = 0; i < a.length; i++) { g[i] += delta[j] * a[i]; if (nd) nd[i] += delta[j] * w[i]; }
          }
          if (nd) delta = Array.from(nd, (d, i) => d * (1 - a[i] * a[i]));     // tanh'
        }
      }
      this.t++;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8, n = batch.length, c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
      for (let l = 0; l < this.W.length; l++) {
        for (let j = 0; j < this.W[l].length; j++) {
          const w = this.W[l][j], m = this.m[l][j], v = this.v[l][j], g = gW[l][j];
          for (let i = 0; i < w.length; i++) { const gi = g[i] / n + l2 * w[i]; m[i] = b1 * m[i] + (1 - b1) * gi; v[i] = b2 * v[i] + (1 - b2) * gi * gi; w[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + eps); }
          const gi = gb[l][j] / n; this.mb[l][j] = b1 * this.mb[l][j] + (1 - b1) * gi; this.vb[l][j] = b2 * this.vb[l][j] + (1 - b2) * gi * gi;
          this.b[l][j] -= lr * (this.mb[l][j] / c1) / (Math.sqrt(this.vb[l][j] / c2) + eps);
        }
      }
      return loss / n;
    }
    evaluate(data) {
      let loss = 0, correct = 0;
      for (const ex of data) { const p = this.predict(ex.v); loss -= ex.y ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9)); if ((p > 0.5) === !!ex.y) correct++; }
      return { loss: loss / data.length, acc: correct / data.length };
    }
    params() { return this.W.reduce((a, w) => a + w.length * w[0].length, 0) + this.b.reduce((a, b) => a + b.length, 0); }
  };
})(window.W);
