/* Wumpus World core: rules exactly as in AIMA 4e §7.2.
 * Coordinates are [x, y] with [1,1] in the bottom-left corner. Cells are
 * keyed as "x,y" strings so they can live in Sets and Maps.
 */
window.W = window.W || {};
(function (W) {
  'use strict';

  // Seeded PRNG (mulberry32) so every world and every randomized agent is reproducible.
  W.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Direction index order is counter-clockwise, so TurnLeft = +1, TurnRight = -1.
  W.DIRS = ['E', 'N', 'W', 'S'];
  W.DV = { E: [1, 0], N: [0, 1], W: [-1, 0], S: [0, -1] };
  W.ARROW = { E: '→', N: '↑', W: '←', S: '↓' };
  W.left = d => W.DIRS[(W.DIRS.indexOf(d) + 1) % 4];
  W.right = d => W.DIRS[(W.DIRS.indexOf(d) + 3) % 4];

  W.key = (x, y) => x + ',' + y;
  W.parse = k => k.split(',').map(Number);
  W.inside = (x, y, n) => x >= 1 && y >= 1 && x <= n && y <= n;
  W.neighbors = function (x, y, n) {
    const out = [];
    for (const d of W.DIRS) {
      const nx = x + W.DV[d][0], ny = y + W.DV[d][1];
      if (W.inside(nx, ny, n)) out.push([nx, ny]);
    }
    return out;
  };
  W.manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  W.cells = function (n) {
    const out = [];
    for (let y = 1; y <= n; y++) for (let x = 1; x <= n; x++) out.push([x, y]);
    return out;
  };

  /* A world spec is plain data: { size, pits: [keys], wumpus: key|null, gold: key|null, seed }.
   * Generation follows the book: each non-start square has a pit with probability p,
   * wumpus and gold are uniform over non-start squares. */
  W.generateWorld = function ({ size = 4, pitProb = 0.2, seed = 1 } = {}) {
    const r = W.rng(seed);
    const others = W.cells(size).filter(([x, y]) => !(x === 1 && y === 1)).map(([x, y]) => W.key(x, y));
    const pits = others.filter(() => r() < pitProb);
    const wumpus = others[Math.floor(r() * others.length)];
    const gold = others[Math.floor(r() * others.length)];
    return { size, pits, wumpus, gold, seed, pitProb };
  };

  // The book's Figure 7.2 world, handy as a fixed reference example.
  W.FIG_7_2 = { size: 4, pits: ['3,1', '3,3', '4,4'], wumpus: '1,3', gold: '2,3', seed: 'fig7.2', pitProb: 0.2 };

  /* ---------------- Environment ---------------- */
  W.ACTIONS = ['Forward', 'TurnLeft', 'TurnRight', 'Grab', 'Shoot', 'Climb'];

  W.Env = class {
    constructor(spec) {
      this.spec = spec;
      this.n = spec.size;
      this.pits = new Set(spec.pits);
      this.s = {
        x: 1, y: 1, dir: 'E', alive: true, hasGold: false, hasArrow: true,
        climbed: false, wumpusAlive: !!spec.wumpus, goldTaken: false,
        score: 0, t: 0, bump: false, scream: false, done: false, event: 'start',
      };
    }
    snapshot() { return Object.assign({}, this.s); }

    percept() {
      const s = this.s, k = W.key(s.x, s.y);
      const nb = W.neighbors(s.x, s.y, this.n).map(([a, b]) => W.key(a, b));
      return {
        stench: !!this.spec.wumpus && (k === this.spec.wumpus || nb.includes(this.spec.wumpus)),
        breeze: nb.some(c => this.pits.has(c)),
        glitter: !s.goldTaken && k === this.spec.gold,
        bump: s.bump,
        scream: s.scream,
      };
    }

    execute(action) {
      const s = this.s;
      if (s.done) return s.event;
      s.t++; s.score -= 1; s.bump = false; s.scream = false; s.event = action;
      switch (action) {
        case 'Forward': {
          const nx = s.x + W.DV[s.dir][0], ny = s.y + W.DV[s.dir][1];
          if (!W.inside(nx, ny, this.n)) { s.bump = true; s.event = 'bump'; break; }
          s.x = nx; s.y = ny;
          const k = W.key(nx, ny);
          if (this.pits.has(k)) { s.alive = false; s.done = true; s.score -= 1000; s.event = 'fell into a pit'; }
          else if (s.wumpusAlive && k === this.spec.wumpus) { s.alive = false; s.done = true; s.score -= 1000; s.event = 'eaten by the wumpus'; }
          break;
        }
        case 'TurnLeft': s.dir = W.left(s.dir); break;
        case 'TurnRight': s.dir = W.right(s.dir); break;
        case 'Grab':
          if (!s.goldTaken && W.key(s.x, s.y) === this.spec.gold) { s.goldTaken = true; s.hasGold = true; s.event = 'grabbed the gold'; }
          break;
        case 'Shoot': {
          if (!s.hasArrow) break;
          s.hasArrow = false; s.score -= 10; s.event = 'arrow missed';
          let x = s.x, y = s.y;
          while (W.inside(x, y, this.n)) {
            if (s.wumpusAlive && W.key(x, y) === this.spec.wumpus) { s.wumpusAlive = false; s.scream = true; s.event = 'killed the wumpus'; break; }
            x += W.DV[s.dir][0]; y += W.DV[s.dir][1];
          }
          break;
        }
        case 'Climb':
          if (s.x === 1 && s.y === 1) {
            s.climbed = true; s.done = true;
            if (s.hasGold) { s.score += 1000; s.event = 'climbed out with the gold'; }
            else s.event = 'climbed out empty-handed';
          }
          break;
      }
      return s.event;
    }
  };

  W.perceptText = function (p) {
    const on = ['stench', 'breeze', 'glitter', 'bump', 'scream'].filter(k => p[k]);
    return on.length ? on.map(k => k[0].toUpperCase() + k.slice(1)).join(', ') : 'None';
  };
  W.perceptTuple = p => '[' + ['stench', 'breeze', 'glitter', 'bump', 'scream'].map(k => p[k] ? k[0].toUpperCase() + k.slice(1) : 'None').join(', ') + ']';

  /* ---------------- Persistence of the current world across pages ---------------- */
  const STORE = 'wumpus.world.v1';
  W.loadSpec = function () {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { const s = JSON.parse(raw); if (s && s.size) return s; }
    } catch (e) { /* storage unavailable */ }
    return JSON.parse(JSON.stringify(W.FIG_7_2));
  };
  W.saveSpec = function (spec) {
    try { localStorage.setItem(STORE, JSON.stringify(spec)); } catch (e) { /* ignore */ }
  };

  W.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  W.$ = (sel, root) => (root || document).querySelector(sel);
})(window.W);
