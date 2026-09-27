/* Search-tree renderer. Layout is computed once for the whole run (per tree, since iterative
 * deepening builds a fresh tree each iteration); stepping only flips CSS classes, so it stays fast.
 * Node lifecycle fields (from ch03/search.js): gen, add, pop, exp (event indices). */
(function (W) {
  'use strict';
  const DX = 14, DY = 36, PAD = 14, MAX_DRAW = 5000;

  W.TreeView = class {
    constructor(el, { describe, onClick } = {}) {
      this.el = el; this.describe = describe || (n => String(n.id)); this.onClick = onClick;
      el.classList.add('treebox');
      el.addEventListener('mousemove', e => {
        const c = e.target.closest('[data-n]');
        W.tip(c ? this.describe(this.run.nodes[+c.dataset.n]) : null, e);
      });
      el.addEventListener('mouseleave', () => W.tip(null));
      el.addEventListener('click', e => { const c = e.target.closest('[data-n]'); if (c && this.onClick) this.onClick(this.run.nodes[+c.dataset.n]); });
    }

    load(run) {
      this.run = run; this.curTree = null; this.els = []; this.edges = [];
      const byTree = new Map();
      for (const n of run.nodes) { if (!byTree.has(n.tree)) byTree.set(n.tree, []); byTree.get(n.tree).push(n); }
      this.byTree = byTree;
      this.layouts = new Map();
      this.sol = new Set(W.solutionPath(run).map(n => n.id));
    }

    layout(tree) {
      if (this.layouts.has(tree)) return this.layouts.get(tree);
      const nodes = this.byTree.get(tree) || [];
      if (nodes.length > MAX_DRAW) { const L = { tooBig: nodes.length }; this.layouts.set(tree, L); return L; }
      const kids = new Map();
      let root = null;
      for (const n of nodes) {
        if (n.parent == null || this.run.nodes[n.parent].tree !== tree) { root = root || n; continue; }
        if (!kids.has(n.parent)) kids.set(n.parent, []);
        kids.get(n.parent).push(n);
      }
      const pos = new Map(); let leaf = 0, maxD = 0;
      const place = (n) => {        // iterative post-order to avoid deep recursion on DFS trees
        const stack = [[n, 0]];
        while (stack.length) {
          const top = stack[stack.length - 1], [m, i] = top, ch = kids.get(m.id) || [];
          if (i < ch.length) { top[1]++; stack.push([ch[i], 0]); continue; }
          stack.pop();
          maxD = Math.max(maxD, m.depth);
          const x = ch.length ? (pos.get(ch[0].id).x + pos.get(ch[ch.length - 1].id).x) / 2 : PAD + (leaf++) * DX;
          pos.set(m.id, { x, y: PAD + m.depth * DY - (nodes[0].depth * DY) });
        }
      };
      if (root) place(root);
      const w = PAD * 2 + Math.max(1, leaf) * DX, h = PAD * 2 + (maxD - (nodes[0] ? nodes[0].depth : 0)) * DY;
      const parts = [`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`];
      for (const n of nodes) {
        const p = pos.get(n.id); if (!p || n.parent == null) continue;
        const q = pos.get(n.parent); if (!q) continue;
        parts.push(`<line data-e="${n.id}" x1="${q.x}" y1="${q.y}" x2="${p.x}" y2="${p.y}" class="tedge" style="display:none"/>`);
      }
      for (const n of nodes) {
        const p = pos.get(n.id); if (!p) continue;
        parts.push(`<circle data-n="${n.id}" cx="${p.x}" cy="${p.y}" r="5" class="tnode" style="display:none"/>`);
      }
      parts.push('</svg>');
      const L = { html: parts.join(''), pos, nodes };
      this.layouts.set(tree, L);
      return L;
    }

    update(i) {
      const ev = this.run.events[i]; if (!ev) return;
      const tree = ev.tree;
      if (tree !== this.curTree) {
        this.curTree = tree;
        const L = this.layout(tree);
        if (L.tooBig) { this.el.innerHTML = `<p class="small muted" style="padding:12px">This tree has ${L.tooBig.toLocaleString()} nodes, too many to draw. The grid heat map and the counters still work.</p>`; this.circles = null; return; }
        this.el.innerHTML = L.html;
        this.circles = new Map(); this.lines = new Map();
        this.el.querySelectorAll('circle[data-n]').forEach(c => this.circles.set(+c.dataset.n, c));
        this.el.querySelectorAll('line[data-e]').forEach(l => this.lines.set(+l.dataset.e, l));
        this.state = new Map();
      }
      if (!this.circles) return;
      const final = ev.done === 'solution';
      for (const [id, c] of this.circles) {
        const n = this.run.nodes[id];
        let cls;
        if (n.gen > i) cls = 'hide';
        else if (final && this.sol.has(id)) cls = 'sol';
        else if (ev.node === id) cls = 'cur';
        else if (n.add != null && n.add <= i && n.pop > i) cls = 'front';
        else if (n.exp != null && n.exp <= i) cls = 'exp';
        else if (n.add == null) cls = 'skip';
        else cls = 'dead';     // popped but not expanded (cutoff / cycle)
        if (this.state.get(id) === cls) continue;
        this.state.set(id, cls);
        const l = this.lines.get(id);
        if (cls === 'hide') { c.style.display = 'none'; if (l) l.style.display = 'none'; continue; }
        c.style.display = ''; if (l) { l.style.display = ''; l.setAttribute('class', 'tedge' + (cls === 'sol' ? ' sol' : '')); }
        const st = {
          cur: 'fill:var(--gold);stroke:var(--ink)', front: 'fill:var(--panel);stroke:var(--frontier)', exp: 'fill:var(--accent);stroke:var(--accent)',
          skip: 'fill:none;stroke:var(--muted);stroke-dasharray:2 2', dead: 'fill:var(--muted);stroke:var(--muted)', sol: 'fill:var(--gold);stroke:#8a6400',
        }[cls];
        c.setAttribute('style', st);
        c.setAttribute('r', cls === 'cur' || cls === 'sol' ? 7 : 5);
      }
      const cur = ev.node != null && this.circles.get(ev.node);
      if (cur && !this.scrollLock) {
        const L = this.layouts.get(tree), p = L.pos.get(ev.node);
        if (p) {
          const b = this.el;
          if (p.x < b.scrollLeft + 20 || p.x > b.scrollLeft + b.clientWidth - 20) b.scrollLeft = p.x - b.clientWidth / 2;
          if (p.y < b.scrollTop + 20 || p.y > b.scrollTop + b.clientHeight - 20) b.scrollTop = p.y - b.clientHeight / 2;
        }
      }
    }
  };
})(window.W);
