/* Chapter 13: the pit/breeze Bayesian network and its inference algorithms.
 * Nodes: Pit_s for every unobserved square that can influence the evidence (the frontier; other pit nodes are
 * irrelevant to the query and pruned, §13.4), Breeze_v for every observed square (evidence).
 * CPT of Breeze_v: noisy-OR, P(b | pits) = 1 − (1 − leak) · Π_{pit parents}(1 − q). q = 1, leak = 0 is the book's
 * deterministic sensor. Observed squares are known to be pit-free, so they are not variables. */
(function (W) {
  'use strict';

  W.buildBN = function (spec, observed, { p = 0.2, q = 1, leak = 0 } = {}) {
    const n = spec.size, nb = k => W.neighbors(...W.parse(k), n).map(c => W.key(...c));
    const obs = [...observed];
    const unknown = W.cells(n).map(c => W.key(...c)).filter(k => !observed.has(k));
    const vars = unknown.filter(k => nb(k).some(v => observed.has(v)));      // relevant pit nodes
    const idx = new Map(vars.map((k, i) => [k, i]));
    const ev = obs.map(v => ({ v, b: W.perceptsAt(spec, v).breeze, parents: nb(v).filter(k => idx.has(k)).map(k => idx.get(k)) }));
    const children = vars.map(() => []);
    ev.forEach((e, ei) => e.parents.forEach(i => children[i].push(ei)));
    const pB = (e, a) => { let off = 1 - leak; for (const i of e.parents) if (a[i]) off *= 1 - q; return 1 - off; };
    const like = (e, a) => e.b ? pB(e, a) : 1 - pB(e, a);
    return { n, p, q, leak, vars, idx, ev, children, unknown, pB, like, irrelevant: unknown.filter(k => !idx.has(k)) };
  };

  /* Exact: enumerate the relevant pit variables (Fig. 13.11's ENUMERATION-ASK, restricted to relevant nodes). */
  W.bnExact = function (bn) {
    const F = bn.vars.length;
    if (F > 20) throw new Error(`${F} relevant pit nodes: too many to enumerate`);
    const a = new Uint8Array(F), acc = new Float64Array(F);
    let Z = 0;
    for (let m = 0; m < (1 << F); m++) {
      let w = 1;
      for (let i = 0; i < F; i++) { a[i] = (m >> i) & 1; w *= a[i] ? bn.p : 1 - bn.p; }
      for (const e of bn.ev) { w *= bn.like(e, a); if (!w) break; }
      if (!w) continue;
      Z += w;
      for (let i = 0; i < F; i++) if (a[i]) acc[i] += w;
    }
    return { post: Array.from(acc, x => Z ? x / Z : NaN), Z, worlds: 1 << F };
  };

  /* Sampling algorithms. Each returns the running estimate of P(Pit_query) after every sample. */
  W.bnRejection = function (bn, qi, N, seed) {
    const r = W.rng(seed), a = new Uint8Array(bn.vars.length), trace = [];
    let acc = 0, hit = 0;
    for (let s = 1; s <= N; s++) {
      for (let i = 0; i < a.length; i++) a[i] = r() < bn.p ? 1 : 0;
      let ok = true;
      for (const e of bn.ev) { const b = r() < bn.pB(e, a); if (b !== e.b) { ok = false; break; } }
      if (ok) { acc++; if (a[qi]) hit++; }
      trace.push(acc ? hit / acc : NaN);
    }
    return { trace, accepted: acc };
  };
  W.bnLikelihood = function (bn, qi, N, seed) {
    const r = W.rng(seed), a = new Uint8Array(bn.vars.length), trace = [];
    let Wt = 0, Wq = 0, W2 = 0;
    for (let s = 1; s <= N; s++) {
      for (let i = 0; i < a.length; i++) a[i] = r() < bn.p ? 1 : 0;
      let w = 1; for (const e of bn.ev) w *= bn.like(e, a);
      Wt += w; W2 += w * w; if (a[qi]) Wq += w;
      trace.push(Wt ? Wq / Wt : NaN);
    }
    return { trace, ess: W2 ? Wt * Wt / W2 : 0 };
  };
  W.bnGibbs = function (bn, qi, N, seed) {
    const r = W.rng(seed), F = bn.vars.length, a = new Uint8Array(F), trace = [];
    // start from a state consistent with the evidence (needed when the sensor is deterministic)
    const ex = W.bnExact(bn);
    let found = false;
    for (let m = 0; m < (1 << F) && !found; m++) { for (let i = 0; i < F; i++) a[i] = (m >> i) & 1; found = bn.ev.every(e => bn.like(e, a) > 0); }
    let hit = 0, stuck = 0;
    for (let s = 1; s <= N; s++) {
      const i = Math.floor(r() * F);    // pick a random nonevidence variable and resample it from P(X | mb(X))
      const w = [0, 0];
      for (const v of [0, 1]) { a[i] = v; let x = v ? bn.p : 1 - bn.p; for (const ei of bn.children[i]) x *= bn.like(bn.ev[ei], a); w[v] = x; }
      const old = a[i];
      a[i] = (w[0] + w[1]) ? (r() < w[1] / (w[0] + w[1]) ? 1 : 0) : old;
      if (a[i] === old) stuck++;
      if (a[qi]) hit++;
      trace.push(hit / s);
    }
    return { trace, exact: ex.post[qi], stayRate: stuck / N };
  };

  W.BN_PSEUDO = {
    rej: { caption: 'Figure 13.16: rejection sampling', lines: [
      ['', 'function REJECTION-SAMPLING(X, e, bn, N) returns an estimate of P(X | e)'],
      ['', '  C ← a vector of counts for each value of X, initially zero'],
      ['', '  for j = 1 to N do'],
      ['', '    x ← PRIOR-SAMPLE(bn)'],
      ['', '    if x is consistent with e then C[j] ← C[j] + 1 where x_j is the value of X in x'],
      ['', '  return NORMALIZE(C)'],
    ] },
    lw: { caption: 'Figure 13.17: likelihood weighting', lines: [
      ['', 'function LIKELIHOOD-WEIGHTING(X, e, bn, N) returns an estimate of P(X | e)'],
      ['', '  W ← a vector of weighted counts for each value of X, initially zero'],
      ['', '  for j = 1 to N do'],
      ['', '    x, w ← WEIGHTED-SAMPLE(bn, e)'],
      ['', '    W[j] ← W[j] + w where x_j is the value of X in x'],
      ['', '  return NORMALIZE(W)'],
      ['', 'function WEIGHTED-SAMPLE(bn, e) returns an event and a weight'],
      ['', '  w ← 1; x ← an event with n elements, with values fixed from e'],
      ['', '  for i = 1 to n do'],
      ['', '    if X_i is an evidence variable with value x_ij in e then w ← w × P(X_i = x_ij | parents(X_i))'],
      ['', '    else x[i] ← a random sample from P(X_i | parents(X_i))'],
      ['', '  return x, w'],
    ] },
    gibbs: { caption: 'Figure 13.19: Gibbs sampling', lines: [
      ['', 'function GIBBS-ASK(X, e, bn, N) returns an estimate of P(X | e)'],
      ['', '  C ← a vector of counts for each value of X, initially zero'],
      ['', '  Z ← the nonevidence variables in bn'],
      ['', '  x ← the current state of the network, initialized from e'],
      ['', '  for k = 1 to N do'],
      ['', '    choose any variable Z_i from Z according to any distribution ρ(i)'],
      ['', '    set the value of Z_i in x by sampling from P(Z_i | mb(Z_i))'],
      ['', '    C[j] ← C[j] + 1 where x_j is the value of X in x'],
      ['', '  return NORMALIZE(C)'],
    ] },
  };
})(window.W);
