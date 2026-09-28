/* Chapter 18: normal-form games (payoff matrices) and their solution concepts. */
(function (W) {
  'use strict';

  W.GAMES = [
    { id: 'shoot', name: 'Shoot or dodge (zero-sum)', rows: ['shoot left', 'shoot right'], cols: ['dodge left', 'dodge right'], rowP: 'hunter', colP: 'wumpus',
      pay: [[[1, -1], [-1, 1]], [[-1, 1], [1, -1]]],
      story: 'The hunter has one arrow and the wumpus is somewhere ahead, in the left or the right tunnel. They choose at the same moment. A hit is +1 for the hunter and −1 for the wumpus, and a miss the other way round. This is matching pennies: no pure equilibrium, so both must randomize.' },
    { id: 'shoot2', name: 'Shoot or dodge, with a pit on the right', rows: ['shoot left', 'shoot right'], cols: ['dodge left', 'dodge right'], rowP: 'hunter', colP: 'wumpus',
      pay: [[[1, -1], [-1, 1]], [[-1, 1], [3, -3]]],
      story: 'Same duel, but the right tunnel ends near a pit: a wumpus hit there also falls, so the hunter gains 3. Does the wumpus now avoid the right tunnel? (The mixed equilibrium says: less than you might think.)' },
    { id: 'pd', name: 'Share the map? (prisoner’s dilemma)', rows: ['share', 'hoard'], cols: ['share', 'hoard'], rowP: 'hunter A', colP: 'hunter B',
      pay: [[[3, 3], [0, 5]], [[5, 0], [1, 1]]],
      story: 'Two hunters explore the same cave, and each can share its map of safe squares or keep it. Sharing helps the other hunter reach the gold first. Hoarding is a dominant strategy for both, yet both sharing would be better for both: the equilibrium is not Pareto optimal.' },
    { id: 'chicken', name: 'The narrow shortcut (chicken)', rows: ['rush', 'wait'], cols: ['rush', 'wait'], rowP: 'hunter A', colP: 'hunter B',
      pay: [[[-10, -10], [5, 0]], [[0, 5], [2, 2]]],
      story: 'A narrow ledge between two pits leads to the gold. If both rush, they collide and wake the wumpus. If one rushes it gets the gold first, and waiting together is slow but safe. Two pure equilibria (one rushes, one waits) and a mixed one.' },
    { id: 'stag', name: 'Hunt the wumpus together (stag hunt)', rows: ['hunt wumpus', 'grab small gold'], cols: ['hunt wumpus', 'grab small gold'], rowP: 'hunter A', colP: 'hunter B',
      pay: [[[4, 4], [0, 2]], [[2, 0], [2, 2]]],
      story: 'Killing the wumpus needs both arrows, and then the big treasure behind it is theirs. Grabbing the small gold near the entrance is safe and needs nobody. Both (hunt, hunt) and (grab, grab) are equilibria: a coordination problem about trust.' },
    { id: 'rps', name: 'Arrow, trap, ambush (3 × 3, zero-sum)', rows: ['shoot', 'set trap', 'sneak'], cols: ['charge', 'lurk', 'flee'], rowP: 'hunter', colP: 'wumpus',
      pay: [[[1, -1], [-1, 1], [0, 0]], [[0, 0], [1, -1], [-1, 1]], [[-1, 1], [0, 0], [1, -1]]],
      story: 'A rock–paper–scissors-like duel: each hunter tactic beats one wumpus behaviour, loses to another, and ties with the third. The only equilibrium mixes all three.' },
  ];

  const solve = (A, b) => {           // Gaussian elimination, returns null if singular
    const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  };
  const subsets = n => { const out = []; for (let m = 1; m < (1 << n); m++) out.push([...Array(n).keys()].filter(i => m >> i & 1)); return out; };

  W.analyzeGame = function (g) {
    const m = g.rows.length, n = g.cols.length, P = (i, j, k) => g.pay[i][j][k];
    // pure Nash equilibria: each is a best response to the other
    const brRow = j => { const best = Math.max(...g.rows.map((_, i) => P(i, j, 0))); return g.rows.map((_, i) => Math.abs(P(i, j, 0) - best) < 1e-9); };
    const brCol = i => { const best = Math.max(...g.cols.map((_, j) => P(i, j, 1))); return g.cols.map((_, j) => Math.abs(P(i, j, 1) - best) < 1e-9); };
    const pure = [];
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (brRow(j)[i] && brCol(i)[j]) pure.push([i, j]);
    // mixed equilibria by support enumeration (supports of equal size)
    const mixed = [];
    for (const S of subsets(m)) for (const T of subsets(n)) {
      if (S.length !== T.length || S.length < 2) continue;
      const k = S.length;
      // column mix y over T makes the row player indifferent over S: Σ_j y_j A[i][j] = v for i in S, Σ y = 1
      const Ay = S.map(i => T.map(j => P(i, j, 0)).concat([-1])).concat([T.map(() => 1).concat([0])]);
      const sy = solve(Ay, S.map(() => 0).concat([1]));
      const Bx = T.map(j => S.map(i => P(i, j, 1)).concat([-1])).concat([S.map(() => 1).concat([0])]);
      const sx = solve(Bx, T.map(() => 0).concat([1]));
      if (!sy || !sx) continue;
      const y = sy.slice(0, k), v = sy[k], x = sx.slice(0, k), u = sx[k];
      if (y.some(p => p < -1e-9) || x.some(p => p < -1e-9)) continue;
      const X = new Array(m).fill(0), Y = new Array(n).fill(0);
      S.forEach((i, t) => X[i] = x[t]); T.forEach((j, t) => Y[j] = y[t]);
      // no profitable deviation outside the support
      const rowVal = i => Y.reduce((a, q, j) => a + q * P(i, j, 0), 0), colVal = j => X.reduce((a, p, i) => a + p * P(i, j, 1), 0);
      if (g.rows.some((_, i) => rowVal(i) > v + 1e-9) || g.cols.some((_, j) => colVal(j) > u + 1e-9)) continue;
      if (X.filter(p => p > 1e-9).length < 2 && Y.filter(p => p > 1e-9).length < 2) continue;
      mixed.push({ X, Y, v, u });
    }
    // strictly dominant strategies
    const domRow = g.rows.findIndex((_, i) => g.rows.every((_, i2) => i2 === i || g.cols.every((_, j) => P(i, j, 0) > P(i2, j, 0))));
    const domCol = g.cols.findIndex((_, j) => g.cols.every((_, j2) => j2 === j || g.rows.every((_, i) => P(i, j, 1) > P(i, j2, 1))));
    // Pareto optimal outcomes
    const cells = []; for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) cells.push([i, j]);
    const pareto = cells.filter(([i, j]) => !cells.some(([a, b]) => P(a, b, 0) >= P(i, j, 0) && P(a, b, 1) >= P(i, j, 1) && (P(a, b, 0) > P(i, j, 0) || P(a, b, 1) > P(i, j, 1))));
    const zeroSum = cells.every(([i, j]) => Math.abs(P(i, j, 0) + P(i, j, 1)) < 1e-9);
    const maximin = Math.max(...g.rows.map((_, i) => Math.min(...g.cols.map((_, j) => P(i, j, 0)))));
    return { pure, mixed, domRow, domCol, pareto, zeroSum, maximin, brRow, brCol };
  };

  /* Fictitious play: each player best-responds to the empirical frequency of the other's past actions. */
  W.fictitiousPlay = function (g, T = 300) {
    const m = g.rows.length, n = g.cols.length;
    const cr = new Array(m).fill(0), cc = new Array(n).fill(0), hist = [];
    cr[0] = 1; cc[0] = 1;
    for (let t = 1; t <= T; t++) {
      const i = g.rows.map((_, a) => g.cols.reduce((s, _, j) => s + cc[j] * g.pay[a][j][0], 0)).reduce((b, v, a, arr) => v > arr[b] + 1e-12 ? a : b, 0);
      const j = g.cols.map((_, b) => g.rows.reduce((s, _, a) => s + cr[a] * g.pay[a][b][1], 0)).reduce((b, v, a, arr) => v > arr[b] + 1e-12 ? a : b, 0);
      cr[i]++; cc[j]++;
      const tr = cr.reduce((a, b) => a + b, 0), tc = cc.reduce((a, b) => a + b, 0);
      hist.push({ row: cr.map(x => x / tr), col: cc.map(x => x / tc) });
    }
    return hist;
  };
})(window.W);
