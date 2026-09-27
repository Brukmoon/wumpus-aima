/* Chapter 6: "Wumpus hunt", a two-player zero-sum game on a known map.
 *   MAX = the agent. It moves N/E/S/W (never into a pit) or shoots its single arrow in a direction.
 *         Entering the gold square grabs the gold. Reaching [1,1] with the gold climbs out and wins.
 *   MIN = the wumpus. It moves N/E/S/W or stays, never into a pit. Moving onto the agent eats it.
 * Utilities: win = 1000 − moves − 10·(arrow used), loss = −1000, draw (move limit) = 0.
 */
(function (W) {
  'use strict';
  const MOVES = ['N', 'E', 'S', 'W'];

  W.HuntGame = class {
    constructor(spec, { maxMoves = 40 } = {}) {
      this.spec = spec; this.n = spec.size; this.pits = new Set(spec.pits); this.maxMoves = maxMoves;
      this.gold = spec.gold;
    }
    initial() { return { a: '1,1', w: this.spec.wumpus || null, g: this.gold === '1,1', arrow: true, turn: 'MAX', t: 0, out: null }; }
    toMove(s) { return s.turn; }
    step(k, d) { const [x, y] = W.parse(k), nx = x + W.DV[d][0], ny = y + W.DV[d][1]; return W.inside(nx, ny, this.n) ? W.key(nx, ny) : null; }
    actions(s) {
      if (this.isTerminal(s)) return [];
      if (s.turn === 'MAX') {
        const out = MOVES.filter(d => { const k = this.step(s.a, d); return k && !this.pits.has(k); });
        if (s.arrow && s.w) for (const d of MOVES) if (this.step(s.a, d)) out.push('Shoot' + d);
        return out;
      }
      if (!s.w) return ['Stay'];   // a dead wumpus can only pass
      const out = MOVES.filter(d => { const k = this.step(s.w, d); return k && !this.pits.has(k); });
      out.push('Stay');
      return out;
    }
    result(s, m) {
      const r = Object.assign({}, s, { t: s.t + 1, turn: s.turn === 'MAX' ? 'MIN' : 'MAX' });
      if (s.turn === 'MAX') {
        if (m.startsWith('Shoot')) {
          r.arrow = false;
          const d = m.slice(5); let k = this.step(s.a, d);
          while (k) { if (k === s.w) { r.w = null; break; } k = this.step(k, d); }
        } else {
          r.a = this.step(s.a, m);
          if (r.a === s.w) r.out = 'eaten';
          else {
            if (r.a === this.gold) r.g = true;
            if (r.g && r.a === '1,1') r.out = 'win';
          }
        }
      } else if (m !== 'Stay') {
        r.w = this.step(s.w, m);
        if (r.w === s.a) r.out = 'eaten';
      }
      if (!r.out && r.t >= this.maxMoves) r.out = 'draw';
      return r;
    }
    isTerminal(s) { return !!s.out; }
    utility(s) { return s.out === 'win' ? 1000 - s.t - (s.arrow ? 0 : 10) : s.out === 'eaten' ? -1000 : 0; }
    /* Heuristic evaluation for cut-off search (§6.3). */
    eval(s) {
      if (this.isTerminal(s)) return this.utility(s);
      const A = W.parse(s.a), home = [1, 1];
      let v = 0;
      if (!this.gold) return 0;
      v += s.g ? 400 - 30 * W.manhattan(A, home) : 200 - 30 * W.manhattan(A, W.parse(this.gold));
      if (s.w) { const d = W.manhattan(A, W.parse(s.w)); v -= d <= 1 ? 300 : d === 2 ? 80 : 0; }
      else v += 150;
      v += s.arrow ? 20 : 0;
      return v - s.t;
    }
    key(s) { return `${s.a}|${s.w}|${+s.g}|${+s.arrow}|${s.turn}|${s.t}`; }
    show(s) { return `agent [${s.a}]${s.g ? ' +gold' : ''}${s.arrow ? '' : ' (no arrow)'} · wumpus ${s.w ? '[' + s.w + ']' : 'dead'} · ${s.turn} to move · t=${s.t}${s.out ? ' · ' + s.out : ''}`; }
  };

  // Move ordering for alpha-beta: try the moves that look best for the mover first (by EVAL of the result).
  function ordered(game, s, acts) {
    const sign = s.turn === 'MAX' ? -1 : 1;
    return acts.map(a => [a, game.eval(game.result(s, a))]).sort((x, y) => sign * (x[1] - y[1])).map(x => x[0]);
  }

  /* Recorded depth-limited minimax / alpha-beta / expectiminimax.
   * Returns { nodes, ev, value, move, stats } where nodes form the explored game tree. */
  W.gameSearch = function (game, root, { algo = 'minimax', depth = 4, order = false, cap = 60000 } = {}) {
    const nodes = [], ev = [];
    let evals = 0, stop = false;
    const mk = (s, parent, move, kind) => { const n = { id: nodes.length, parent, move, kind, t: ev.length, state: s, value: null, alpha: null, beta: null, pruned: false }; nodes.push(n); return n; };
    const log = e => { ev.push(e); if (ev.length > cap) stop = true; };
    const chance = algo === 'expecti';

    function value(s, d, alpha, beta, parent, move) {
      const kind = game.isTerminal(s) || d === 0 ? 'leaf' : s.turn === 'MAX' ? 'max' : (chance ? 'chance' : 'min');
      const n = mk(s, parent, move, kind);
      n.alpha = alpha; n.beta = beta;
      if (stop) { n.value = game.eval(s); return n; }
      if (kind === 'leaf') {
        evals++; n.value = game.isTerminal(s) ? game.utility(s) : game.eval(s);
        log({ line: game.isTerminal(s) ? 'x2' : 'x2c', node: n.id, msg: `${game.isTerminal(s) ? 'terminal: UTILITY' : 'cutoff: EVAL'} = ${n.value}` });
        return n;
      }
      log({ line: kind === 'max' ? 'x1' : kind === 'min' ? 'n1' : 'e1', node: n.id, msg: `${kind.toUpperCase()} node, depth left ${d}${algo === 'alphabeta' ? `, α=${fmt(alpha)} β=${fmt(beta)}` : ''}` });
      let acts = game.actions(s);
      if (order && algo === 'alphabeta') acts = ordered(game, s, acts);
      if (kind === 'chance') {
        let sum = 0;
        for (const a of acts) { const c = value(game.result(s, a), d - 1, -Infinity, Infinity, n.id, a); sum += c.value / acts.length; }
        n.value = Math.round(sum * 10) / 10;
        log({ line: 'e3', node: n.id, msg: `CHANCE node: average of ${acts.length} equally likely wumpus moves = ${n.value}` });
        return n;
      }
      let v = kind === 'max' ? -Infinity : Infinity, best = null;
      for (let i = 0; i < acts.length; i++) {
        const a = acts[i];
        const c = value(game.result(s, a), d - 1, alpha, beta, n.id, a);
        if (kind === 'max' ? c.value > v : c.value < v) {
          v = c.value; best = a;
          if (algo === 'alphabeta') { if (kind === 'max') alpha = Math.max(alpha, v); else beta = Math.min(beta, v); }
          log({ line: kind === 'max' ? 'x5' : 'n5', node: n.id, msg: `${kind.toUpperCase()} takes ${a}: v = ${v}${algo === 'alphabeta' ? ` (α=${fmt(alpha)} β=${fmt(beta)})` : ''}` });
        }
        if (algo === 'alphabeta' && (kind === 'max' ? v >= beta : v <= alpha)) {
          for (const r of acts.slice(i + 1)) { const p = mk(game.result(s, r), n.id, r, 'pruned'); p.pruned = true; }
          log({ line: kind === 'max' ? 'x7' : 'n7', node: n.id, msg: `prune ${acts.length - i - 1} remaining move(s): v=${v} ${kind === 'max' ? '≥ β' : '≤ α'}=${fmt(kind === 'max' ? beta : alpha)}` });
          break;
        }
      }
      n.value = v; n.best = best;
      log({ line: kind === 'max' ? 'x8' : 'n8', node: n.id, msg: `${kind.toUpperCase()} returns ${v} (move ${best})` });
      return n;
    }
    const root_ = value(root, depth, -Infinity, Infinity, null, null);
    const rootKids = nodes.filter(n => n.parent === 0 && !n.pruned);
    let move = root_.best;
    if (chance && root_.kind === 'min') move = null;
    return { nodes, ev, value: root_.value, move, stats: { nodes: nodes.filter(n => !n.pruned).length, evals, pruned: nodes.filter(n => n.pruned).length, capped: stop }, rootKids };
  };
  const fmt = x => x === Infinity ? '+∞' : x === -Infinity ? '−∞' : String(x);

  /* Monte Carlo tree search (Figure 6.11) with UCT selection and random playouts.
   * Records each iteration's selected path and playout result so the UI can replay growth. */
  W.mcts = function (game, root, { iterations = 300, C = 1.4, seed = 1, playoutDepth = 30 } = {}) {
    const rng = W.rng(seed);
    const nodes = [{ id: 0, parent: null, move: null, state: root, kids: [], untried: game.actions(root).slice(), N: 0, U: 0, t: 0, hist: [] }];
    const iters = [];
    const ucb = (n, p) => {
      if (!n.N) return Infinity;
      const mean = n.U / n.N / 1000, sign = p.state.turn === 'MAX' ? 1 : -1;
      return sign * mean + C * Math.sqrt(Math.log(p.N) / n.N);
    };
    for (let it = 0; it < iterations; it++) {
      // SELECT
      let n = nodes[0]; const path = [0];
      while (!n.untried.length && n.kids.length) {
        let best = null, bv = -Infinity;
        for (const k of n.kids) { const v = ucb(nodes[k], n); if (v > bv) { bv = v; best = k; } }
        n = nodes[best]; path.push(n.id);
      }
      // EXPAND
      if (n.untried.length && !game.isTerminal(n.state)) {
        const a = n.untried.splice(Math.floor(rng() * n.untried.length), 1)[0];
        const s = game.result(n.state, a);
        const c = { id: nodes.length, parent: n.id, move: a, state: s, kids: [], untried: game.actions(s).slice(), N: 0, U: 0, t: it, hist: [] };
        nodes.push(c); n.kids.push(c.id); n = c; path.push(c.id);
      }
      // SIMULATE
      let s = n.state, d = 0;
      while (!game.isTerminal(s) && d < playoutDepth) { const acts = game.actions(s); s = game.result(s, acts[Math.floor(rng() * acts.length)]); d++; }
      const u = game.isTerminal(s) ? game.utility(s) : game.eval(s);
      // BACK-PROPAGATE
      for (const id of path) { nodes[id].N++; nodes[id].U += u; nodes[id].hist.push(it); }
      iters.push({ path, expanded: n.id, u, playoutLen: d });
    }
    const kids = nodes[0].kids.map(k => nodes[k]);
    const best = kids.reduce((m, k) => (!m || k.N > m.N ? k : m), null);
    return { nodes, iters, move: best && best.move, C };
  };

  W.GAME_PSEUDO = {
    minimax: { caption: 'Figure 6.3 minimax, with a depth cutoff and EVAL (§6.3)', lines: [
      ['', 'function MINIMAX-SEARCH(game, state) returns an action'],
      ['', '  value, move ← MAX-VALUE(game, state)'],
      ['', '  return move'],
      ['', 'function MAX-VALUE(game, state) returns a (utility, move) pair'],
      ['x2', '  if game.IS-TERMINAL(state) then return game.UTILITY(state, player), null'],
      ['x2c', '  if IS-CUTOFF(state, depth) then return EVAL(state, player), null'],
      ['x1', '  v ← −∞'],
      ['x3', '  for each a in game.ACTIONS(state) do'],
      ['x4', '    v2, a2 ← MIN-VALUE(game, game.RESULT(state, a))'],
      ['x5', '    if v2 > v then v, move ← v2, a'],
      ['x8', '  return v, move'],
      ['', 'function MIN-VALUE(game, state) returns a (utility, move) pair'],
      ['', '  (terminal / cutoff tests as above)'],
      ['n1', '  v ← +∞'],
      ['n3', '  for each a in game.ACTIONS(state) do'],
      ['n4', '    v2, a2 ← MAX-VALUE(game, game.RESULT(state, a))'],
      ['n5', '    if v2 < v then v, move ← v2, a'],
      ['n8', '  return v, move'],
    ] },
    alphabeta: { caption: 'Figure 6.7: alpha–beta search, with a depth cutoff and EVAL', lines: [
      ['', 'function ALPHA-BETA-SEARCH(game, state) returns an action'],
      ['', '  value, move ← MAX-VALUE(game, state, −∞, +∞)'],
      ['', '  return move'],
      ['', 'function MAX-VALUE(game, state, α, β) returns a (utility, move) pair'],
      ['x2', '  if game.IS-TERMINAL(state) then return game.UTILITY(state, player), null'],
      ['x2c', '  if IS-CUTOFF(state, depth) then return EVAL(state, player), null'],
      ['x1', '  v ← −∞'],
      ['x3', '  for each a in game.ACTIONS(state) do'],
      ['x4', '    v2, a2 ← MIN-VALUE(game, game.RESULT(state, a), α, β)'],
      ['x5', '    if v2 > v then v, move ← v2, a; α ← MAX(α, v)'],
      ['x7', '    if v ≥ β then return v, move'],
      ['x8', '  return v, move'],
      ['', 'function MIN-VALUE(game, state, α, β) returns a (utility, move) pair'],
      ['', '  (terminal / cutoff tests as above)'],
      ['n1', '  v ← +∞'],
      ['n3', '  for each a in game.ACTIONS(state) do'],
      ['n4', '    v2, a2 ← MAX-VALUE(game, game.RESULT(state, a), α, β)'],
      ['n5', '    if v2 < v then v, move ← v2, a; β ← MIN(β, v)'],
      ['n7', '    if v ≤ α then return v, move'],
      ['n8', '  return v, move'],
    ] },
    expecti: { caption: '§6.5: EXPECTIMINIMAX, where the wumpus moves at random (chance nodes)', lines: [
      ['', 'EXPECTIMINIMAX(s) ='],
      ['x2', '  UTILITY(s, MAX)                              if IS-TERMINAL(s)'],
      ['x2c', '  EVAL(s)                                      if IS-CUTOFF(s, d)'],
      ['x1', '  max_a EXPECTIMINIMAX(RESULT(s, a))           if TO-MOVE(s) = MAX'],
      ['x5', '      (MAX keeps the best child)'],
      ['x8', '      (MAX returns)'],
      ['e1', '  Σ_r P(r) · EXPECTIMINIMAX(RESULT(s, r))      if TO-MOVE(s) = CHANCE'],
      ['e3', '      (every wumpus move has P(r) = 1 / number of moves)'],
    ] },
    mcts: { caption: 'Figure 6.11: Monte Carlo tree search, with UCT selection', lines: [
      ['', 'function MONTE-CARLO-TREE-SEARCH(state) returns an action'],
      ['', '  tree ← NODE(state)'],
      ['', '  while IS-TIME-REMAINING() do'],
      ['m1', '    leaf ← SELECT(tree)          // follow max UCB1 from the root'],
      ['m2', '    child ← EXPAND(leaf)'],
      ['m3', '    result ← SIMULATE(child)     // random playout'],
      ['m4', '    BACK-PROPAGATE(result, child)'],
      ['m5', '  return the move in ACTIONS(state) whose node has highest number of playouts'],
      ['', ''],
      ['', 'UCB1(n) = U(n)/N(n) + C · √( log N(PARENT(n)) / N(n) )'],
    ] },
  };
})(window.W);
