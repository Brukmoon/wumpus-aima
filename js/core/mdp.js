/* A fully observable, slippery Wumpus World as a Markov decision process (Chapters 17 and 22).
 * States: squares. Terminal states: the gold (+goal), pits and the wumpus (−death).
 * Actions N/E/S/W: the intended move happens with probability 1 − slip, otherwise the agent slides to one of the
 * two perpendicular directions (slip/2 each), as in the book's 4×3 world. Walls: stay put.
 * Reward R(s, a, s′) = living reward + (terminal reward of s′ if s′ is terminal). γ is the discount. */
(function (W) {
  'use strict';
  const A = ['N', 'E', 'S', 'W'];
  const PERP = { N: ['W', 'E'], S: ['E', 'W'], E: ['N', 'S'], W: ['S', 'N'] };
  W.MDP_ACTIONS = A;

  W.GridMDP = class {
    constructor(spec, { living = -0.04, gamma = 0.95, slip = 0.2, goal = 1, death = -1 } = {}) {
      this.spec = spec; this.n = spec.size; this.living = living; this.gamma = gamma; this.slip = slip;
      this.S = W.cells(this.n).map(c => W.key(...c));
      this.idx = new Map(this.S.map((k, i) => [k, i]));
      this.term = new Map();
      spec.pits.forEach(k => this.term.set(k, death));
      if (spec.wumpus) this.term.set(spec.wumpus, death);
      if (spec.gold && !this.term.has(spec.gold)) this.term.set(spec.gold, goal);
      // precompute transitions: P[s][a] = [[s', p], ...]
      this.P = this.S.map(s => A.map(a => {
        if (this.term.has(s)) return [];
        const out = new Map();
        const add = (d, p) => { if (p <= 0) return; const [x, y] = W.parse(s), nx = x + W.DV[d][0], ny = y + W.DV[d][1]; const t = W.inside(nx, ny, this.n) ? W.key(nx, ny) : s; out.set(t, (out.get(t) || 0) + p); };
        add(a, 1 - slip); add(PERP[a][0], slip / 2); add(PERP[a][1], slip / 2);
        return [...out].map(([t, p]) => [this.idx.get(t), p]);
      }));
    }
    R(s2) { const k = this.S[s2]; return this.living + (this.term.has(k) ? this.term.get(k) : 0); }
    isTerminal(i) { return this.term.has(this.S[i]); }
    q(U, s, ai) { let v = 0; for (const [t, p] of this.P[s][ai]) v += p * (this.R(t) + this.gamma * (this.isTerminal(t) ? 0 : U[t])); return v; }
    greedy(U) { return this.S.map((_, s) => { if (this.isTerminal(s)) return -1; let best = 0, bv = -Infinity; for (let a = 0; a < 4; a++) { const v = this.q(U, s, a); if (v > bv + 1e-12) { bv = v; best = a; } } return best; }); }

    /* Figure 17.6. Returns every iteration's utilities for the stepper. */
    valueIteration(eps = 1e-4, maxIter = 500) {
      let U = new Float64Array(this.S.length);
      const iters = [{ U: Array.from(U), delta: null }];
      for (let k = 0; k < maxIter; k++) {
        const U2 = new Float64Array(U.length);
        let delta = 0;
        for (let s = 0; s < U.length; s++) {
          if (this.isTerminal(s)) continue;
          let best = -Infinity; for (let a = 0; a < 4; a++) best = Math.max(best, this.q(U, s, a));
          U2[s] = best; delta = Math.max(delta, Math.abs(U2[s] - U[s]));
        }
        U = U2; iters.push({ U: Array.from(U), delta });
        if (delta <= eps * (1 - this.gamma) / (this.gamma || 1)) break;
      }
      return iters;
    }

    /* Exact policy evaluation: solve U = R_π + γ P_π U by Gaussian elimination. */
    evaluate(pi) {
      const n = this.S.length, M = Array.from({ length: n }, () => new Float64Array(n + 1));
      for (let s = 0; s < n; s++) {
        M[s][s] = 1;
        if (this.isTerminal(s)) continue;
        for (const [t, p] of this.P[s][pi[s]]) { M[s][n] += p * this.R(t); if (!this.isTerminal(t)) M[s][t] -= this.gamma * p; }
      }
      for (let c = 0; c < n; c++) {
        let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        [M[c], M[piv]] = [M[piv], M[c]];
        if (Math.abs(M[c][c]) < 1e-12) continue;
        for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
      }
      return M.map((row, i) => Math.abs(row[i]) > 1e-12 ? row[n] / row[i] : 0);
    }
    /* Figure 17.9. */
    policyIteration(maxIter = 100) {
      let pi = this.S.map((_, s) => this.isTerminal(s) ? -1 : 0);        // start: always North
      const iters = [];
      for (let k = 0; k < maxIter; k++) {
        const U = this.evaluate(pi.map(a => a < 0 ? 0 : a));
        let changed = 0;
        const pi2 = pi.slice();
        for (let s = 0; s < pi.length; s++) {
          if (this.isTerminal(s)) continue;
          let best = pi[s], bv = this.q(U, s, pi[s]);
          for (let a = 0; a < 4; a++) { const v = this.q(U, s, a); if (v > bv + 1e-9) { bv = v; best = a; } }
          if (best !== pi[s]) { pi2[s] = best; changed++; }
        }
        iters.push({ U, pi: pi.slice(), changed });
        pi = pi2;
        if (!changed) break;
      }
      return iters;
    }
    /* Sample an episode following policy pi from the start. */
    simulate(pi, seed, maxSteps = 100) {
      const r = W.rng(seed);
      let s = this.idx.get('1,1'), total = 0;
      const path = [s];
      for (let t = 0; t < maxSteps && !this.isTerminal(s); t++) {
        let u = r(), next = s;
        for (const [t2, p] of this.P[s][pi[s]]) { u -= p; if (u <= 0) { next = t2; break; } }
        total += Math.pow(this.gamma, t) * this.R(next);
        s = next; path.push(s);
      }
      return { path, total, end: this.isTerminal(s) ? (this.term.get(this.S[s]) > 0 ? 'gold' : 'death') : 'timeout' };
    }
    step(s, a, r) { let u = r(), next = s; for (const [t, p] of this.P[s][a]) { u -= p; if (u <= 0) { next = t; break; } } return next; }
  };

  W.MDP_PSEUDO = {
    vi: { caption: 'Figure 17.6: value iteration', lines: [
      ['', 'function VALUE-ITERATION(mdp, ε) returns a utility function'],
      ['', '  U, U′ ← vectors of utilities for states in S, initially zero'],
      ['v1', '  repeat'],
      ['v2', '    U ← U′; δ ← 0'],
      ['v3', '    for each state s in S do'],
      ['v4', '      U′[s] ← max_{a ∈ A(s)} Q-VALUE(mdp, s, a, U)'],
      ['v5', '      if |U′[s] − U[s]| > δ then δ ← |U′[s] − U[s]|'],
      ['v6', '  until δ ≤ ε(1 − γ)/γ'],
      ['', '  return U'],
      ['', ''],
      ['', 'Q-VALUE(mdp, s, a, U) = Σ_{s′} P(s′ | s, a) [R(s, a, s′) + γ U[s′]]'],
    ] },
    pi: { caption: 'Figure 17.9: policy iteration', lines: [
      ['', 'function POLICY-ITERATION(mdp) returns a policy'],
      ['', '  U ← zero vector; π ← an initial policy (here: always North)'],
      ['p1', '  repeat'],
      ['p2', '    U ← POLICY-EVALUATION(π, U, mdp)     // solved exactly: U = R_π + γ P_π U'],
      ['p3', '    unchanged? ← true'],
      ['p4', '    for each state s in S do'],
      ['p5', '      a* ← argmax_{a ∈ A(s)} Q-VALUE(mdp, s, a, U)'],
      ['p6', '      if Q-VALUE(mdp, s, a*, U) > Q-VALUE(mdp, s, π[s], U) then π[s] ← a*; unchanged? ← false'],
      ['p7', '  until unchanged?'],
      ['', '  return π'],
    ] },
  };
})(window.W);
