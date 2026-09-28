/* Chapter 14: tracking a wandering wumpus with an HMM.
 * Hidden state X_t = wumpus square (any pit-free square). Transition: stay with probability `stay`, otherwise move
 * to a uniformly random pit-free neighbour. A flying sensor drone (it can't fall or be eaten) wanders the cave and at
 * every step reports Stench, which is true with probability `hit` if the wumpus is in or next to the drone's
 * square and `fa` (false alarm) otherwise. The drone's path is known, so the sensor model changes with t. */
(function (W) {
  'use strict';

  W.buildHMM = function (spec, { stay = 0.3, hit = 0.9, fa = 0.1 } = {}) {
    const n = spec.size, pits = new Set(spec.pits);
    const S = W.cells(n).map(c => W.key(...c)).filter(k => !pits.has(k));
    const idx = new Map(S.map((k, i) => [k, i]));
    const nb = k => W.neighbors(...W.parse(k), n).map(c => W.key(...c));
    const T = S.map(k => {
      const row = new Float64Array(S.length), moves = nb(k).filter(j => idx.has(j));
      if (!moves.length) { row[idx.get(k)] = 1; return row; }
      row[idx.get(k)] += stay;
      for (const j of moves) row[idx.get(j)] += (1 - stay) / moves.length;
      return row;
    });
    const near = (a, x) => a === x || nb(a).includes(x);
    const O = (a, e) => Float64Array.from(S, x => near(a, x) ? (e ? hit : 1 - hit) : (e ? fa : 1 - fa));
    return { S, idx, T, O, n, stay, hit, fa };
  };

  W.simulateHMM = function (hmm, steps, seed) {
    const r = W.rng(seed), pick = w => { let u = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; } return w.length - 1; };
    let x = Math.floor(r() * hmm.S.length), a = '1,1';
    const xs = [], as = [], es = [];
    for (let t = 1; t <= steps; t++) {
      x = pick(hmm.T[x]);
      const nbA = W.neighbors(...W.parse(a), hmm.n).map(c => W.key(...c)); a = nbA[Math.floor(r() * nbA.length)];
      const near = a === hmm.S[x] || W.neighbors(...W.parse(a), hmm.n).some(c => W.key(...c) === hmm.S[x]);
      const e = r() < (near ? hmm.hit : hmm.fa);
      xs.push(x); as.push(a); es.push(e);
    }
    return { xs, as, es };
  };

  const norm = v => { const s = v.reduce((a, b) => a + b, 0); return s ? v.map(x => x / s) : v; };
  const predict = (hmm, f) => { const out = new Float64Array(hmm.S.length); f.forEach((p, i) => { if (p) hmm.T[i].forEach((q, j) => { out[j] += p * q; }); }); return out; };

  // FORWARD (filtering), Equation 14.5: f_{1:t+1} = α O_{t+1} Tᵀ f_{1:t}
  W.hmmFilter = function (hmm, sim) {
    let f = new Float64Array(hmm.S.length).fill(1 / hmm.S.length);
    const out = [];
    sim.es.forEach((e, t) => { const O = hmm.O(sim.as[t], e); f = norm(Array.from(predict(hmm, f), (p, i) => p * O[i])); out.push(f); });
    return out;
  };
  // FORWARD-BACKWARD (smoothing), Figure 14.4
  W.hmmSmooth = function (hmm, sim, fwd) {
    const Tn = sim.es.length, out = new Array(Tn);
    let b = new Array(hmm.S.length).fill(1);
    for (let t = Tn - 1; t >= 0; t--) {
      out[t] = norm(fwd[t].map((p, i) => p * b[i]));
      const O = hmm.O(sim.as[t], sim.es[t]);
      b = hmm.S.map((_, i) => hmm.T[i].reduce((acc, q, j) => acc + q * O[j] * b[j], 0));
      b = norm(b);
    }
    return out;
  };
  // VITERBI: most likely sequence of wumpus positions (§14.2.3)
  W.hmmViterbi = function (hmm, sim) {
    const n = hmm.S.length, back = [];
    let m = Array.from(predict(hmm, new Float64Array(n).fill(1 / n)), (p, i) => Math.log(p * hmm.O(sim.as[0], sim.es[0])[i] || 1e-300));
    for (let t = 1; t < sim.es.length; t++) {
      const O = hmm.O(sim.as[t], sim.es[t]), bp = new Int32Array(n), m2 = new Array(n).fill(-Infinity);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { if (!hmm.T[i][j]) continue; const v = m[i] + Math.log(hmm.T[i][j]); if (v > m2[j]) { m2[j] = v; bp[j] = i; } }
      m = m2.map((v, j) => v + Math.log(O[j])); back.push(bp);
    }
    let best = m.indexOf(Math.max(...m));
    const path = [best];
    for (let t = back.length - 1; t >= 0; t--) { best = back[t][best]; path.unshift(best); }
    return path;
  };
  // PARTICLE-FILTERING, Figure 14.17
  W.hmmParticles = function (hmm, sim, N, seed) {
    const r = W.rng(seed + 99);
    let ps = Array.from({ length: N }, () => Math.floor(r() * hmm.S.length));
    const out = [];
    const step = i => { let u = r(); const row = hmm.T[i]; for (let j = 0; j < row.length; j++) { u -= row[j]; if (u <= 0) return j; } return i; };
    sim.es.forEach((e, t) => {
      ps = ps.map(step);
      const O = hmm.O(sim.as[t], e), w = ps.map(i => O[i]), tot = w.reduce((a, b) => a + b, 0);
      // weighted resampling (systematic)
      const next = [], stepSize = tot / N; let u = r() * stepSize, c = w[0], i = 0;
      for (let k = 0; k < N; k++) { while (u > c && i < N - 1) { i++; c += w[i]; } next.push(ps[i]); u += stepSize; }
      ps = next;
      const hist = new Array(hmm.S.length).fill(0); ps.forEach(q => hist[q]++);
      out.push(hist.map(x => x / N));
    });
    return out;
  };

  W.HMM_PSEUDO = { caption: 'Eq. 14.5, Fig. 14.4, §14.2.3, Fig. 14.17', lines: [
    ['f', 'filtering   f(t+1) = α O(t+1) Tᵀ f(t)'],
    ['', '            predict with T, then weight by the evidence'],
    ['s', 'smoothing   P(X_k | e_1:t) = α f(k) × b(k+1)'],
    ['', '            b(k) = T O(k) b(k+1),  b(t+1) = 1'],
    ['v', 'Viterbi     m(t+1) = O(t+1) max_x T(x → ·) m(t)'],
    ['', '            then follow the back-pointers'],
    ['p', 'particles   move each sample by T, weight by'],
    ['', '            P(e | x), resample N ∝ weight'],
  ] };
})(window.W);
