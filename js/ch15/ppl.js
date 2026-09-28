/* Chapter 15: the world generator as a probabilistic program, conditioned on observations.
 * A trace = { pits: Set of squares, wumpus: square }. (Gold doesn't affect breezes or stenches, so it is left out.)
 * Model A (the book's): each non-start square has a pit with probability p.
 * Model B (open universe): numPits ~ Poisson(λ), placed on distinct uniformly chosen non-start squares. */
(function (W) {
  'use strict';

  W.PPL_PROGRAMS = {
    A: `function WumpusWorld(n, p):
  for each square s ≠ [1,1]:
    Pit[s] ~ Bernoulli(p)
  WumpusAt ~ UniformChoice(squares ≠ [1,1])
  for each square s:
    Breeze[s] = ∃ r adjacent to s with Pit[r]
    Stench[s] = WumpusAt = s ∨ WumpusAt adjacent to s

observe Breeze[v], Stench[v] and "no pit, no wumpus" at every observed v
query   Pit[s] for every s,  number of pits`,
    B: `function WumpusWorld(n, λ):
  numPits ~ Poisson(λ)                        // open universe: how many pits is unknown
  PitSquares ~ UniformSubset(squares ≠ [1,1], size numPits)
  WumpusAt ~ UniformChoice(squares ≠ [1,1])
  for each square s:
    Breeze[s] = ∃ r adjacent to s with r ∈ PitSquares
    Stench[s] = WumpusAt = s ∨ WumpusAt adjacent to s

observe Breeze[v], Stench[v] and "no pit, no wumpus" at every observed v
query   Pit[s] for every s,  numPits`,
  };

  W.PPLModel = class {
    constructor(spec, observed, { model = 'A', p = 0.2, lambda = 3 } = {}) {
      this.n = spec.size; this.model = model; this.p = p; this.lambda = lambda;
      this.sq = W.cells(this.n).map(c => W.key(...c)).filter(k => k !== '1,1');
      this.nb = new Map(W.cells(this.n).map(c => W.key(...c)).map(k => [k, W.neighbors(...W.parse(k), this.n).map(c => W.key(...c))]));
      this.obs = [...observed].map(v => Object.assign({ v }, W.perceptsAt(spec, v)));
      this.m = this.sq.length;
      this.lf = [0]; for (let i = 1; i <= this.m + 1; i++) this.lf.push(this.lf[i - 1] + Math.log(i));
    }
    sample(r) {                 // run the generative program forward
      let pits;
      if (this.model === 'A') pits = new Set(this.sq.filter(() => r() < this.p));
      else {
        let k = 0, L = Math.exp(-this.lambda), prod = r();       // Knuth's Poisson sampler
        while (prod > L) { k++; prod *= r(); }
        k = Math.min(k, this.m);
        const pool = this.sq.slice();
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        pits = new Set(pool.slice(0, k));
      }
      return { pits, wumpus: this.sq[Math.floor(r() * this.m)] };
    }
    consistent(t) {
      for (const o of this.obs) {
        if (t.pits.has(o.v) || t.wumpus === o.v) return false;
        const nb = this.nb.get(o.v);
        if (nb.some(k => t.pits.has(k)) !== o.breeze) return false;
        if ((t.wumpus === o.v || nb.includes(t.wumpus)) !== o.stench) return false;
      }
      return true;
    }
    logPrior(t) {
      const k = t.pits.size;
      if (this.model === 'A') return k * Math.log(this.p) + (this.m - k) * Math.log(1 - this.p);
      // Poisson(k; λ) · 1 / C(m, k)
      return -this.lambda + k * Math.log(this.lambda) - this.lf[k] - (this.lf[this.m] - this.lf[k] - this.lf[this.m - k]);
    }
  };

  const summarize = (model, traces) => {
    const pit = new Map(model.sq.map(k => [k, 0])), hist = new Array(model.m + 1).fill(0);
    for (const t of traces) { t.pits.forEach(k => pit.set(k, pit.get(k) + 1)); hist[t.pits.size]++; }
    const N = traces.length || 1;
    pit.forEach((v, k) => pit.set(k, v / N));
    return { pit, hist: hist.map(h => h / N) };
  };

  W.pplRejection = function (model, N, seed) {
    const r = W.rng(seed), kept = [];
    for (let i = 0; i < N; i++) { const t = model.sample(r); if (model.consistent(t)) kept.push(t); }
    return Object.assign(summarize(model, kept), { kept, tried: N });
  };

  /* Metropolis–Hastings over traces. Proposals: move one pit, add a pit, remove a pit, or move the wumpus.
   * The evidence is deterministic, so the likelihood is 1 (consistent) or 0; the acceptance ratio is the
   * prior ratio times the Hastings correction for the asymmetric add/remove proposals. */
  W.pplMH = function (model, N, seed, init) {
    const r = W.rng(seed + 7);
    let cur = { pits: new Set(init.pits), wumpus: init.wumpus }, lp = model.logPrior(cur);
    const samples = [], m = model.m;
    let accepted = 0;
    for (let i = 0; i < N; i++) {
      // each move type has a fixed probability 1/4; if it can't apply, the proposal is a no-op (keeps detailed balance)
      const u = r(), prop = { pits: new Set(cur.pits), wumpus: cur.wumpus };
      const type = u < 0.25 ? 'wumpus' : u < 0.5 ? 'move' : u < 0.75 ? 'add' : 'remove';
      let logQ = 0;             // log q(cur | prop) − log q(prop | cur)
      const k = cur.pits.size;
      if (type === 'wumpus') prop.wumpus = model.sq[Math.floor(r() * m)];
      else if (type === 'move' && k > 0 && k < m) {
        const from = [...cur.pits][Math.floor(r() * k)], empty = model.sq.filter(s => !cur.pits.has(s));
        prop.pits.delete(from); prop.pits.add(empty[Math.floor(r() * empty.length)]);
      } else if (type === 'add' && k < m) {
        const empty = model.sq.filter(s => !cur.pits.has(s));
        prop.pits.add(empty[Math.floor(r() * empty.length)]);
        logQ = Math.log(1 / (k + 1)) - Math.log(1 / (m - k));
      } else if (type === 'remove' && k > 0) {
        prop.pits.delete([...cur.pits][Math.floor(r() * k)]);
        logQ = Math.log(1 / (m - k + 1)) - Math.log(1 / k);
      } else { samples.push(cur); continue; }
      if (model.consistent(prop)) {
        const lp2 = model.logPrior(prop);
        if (Math.log(r()) < lp2 - lp + logQ) { cur = prop; lp = lp2; accepted++; }
      }
      samples.push(cur);
    }
    const burn = Math.floor(N / 5);
    return Object.assign(summarize(model, samples.slice(burn)), { samples, accepted, burn });
  };
})(window.W);
