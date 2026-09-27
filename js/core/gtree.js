/* Generic stepped tree renderer (backtracking trees, game trees, AND-OR trees).
 *   load(nodes)   nodes: [{id, parent (id|null), t (step at which it appears), ...}]
 *   update(i, style)   style(node, i) → { shape: 'circle'|'up'|'down'|'square'|'diamond', fill, stroke, dash, r, label, edge, edgeLabel, hide }
 * Layout is computed once; update() only changes attributes that differ from the last call. */
(function (W) {
  'use strict';
  const PAD = 16, MAX_DRAW = 6000;

  W.GTree = class {
    constructor(el, { describe, onClick, dx = 18, dy = 46, labels = true } = {}) {
      this.el = el; this.describe = describe; this.onClick = onClick; this.DX = dx; this.DY = dy; this.labels = labels;
      el.classList.add('treebox');
      el.addEventListener('mousemove', e => {
        const c = e.target.closest('[data-n]');
        W.tip(c && this.describe ? this.describe(this.nodes[+c.dataset.n]) : null, e);
      });
      el.addEventListener('mouseleave', () => W.tip(null));
      el.addEventListener('click', e => { const c = e.target.closest('[data-n]'); if (c && this.onClick) this.onClick(this.nodes[+c.dataset.n]); });
    }

    load(nodes) {
      this.nodes = nodes; this.cache = new Map();
      if (nodes.length > MAX_DRAW) { this.el.innerHTML = `<p class="small muted" style="padding:12px">${nodes.length.toLocaleString()} nodes: too many to draw.</p>`; this.g = null; return; }
      const kids = new Map(); let root = null;
      for (const n of nodes) { if (n.parent == null) { root = root || n; continue; } if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
      const pos = new Map(); let leaf = 0, maxD = 0;
      if (root) {
        const stack = [[root, 0, 0]];
        while (stack.length) {
          const top = stack[stack.length - 1], [m, i, d] = top, ch = kids.get(m.id) || [];
          if (i < ch.length) { top[1]++; stack.push([ch[i], 0, d + 1]); continue; }
          stack.pop(); maxD = Math.max(maxD, d);
          const x = ch.length ? (pos.get(ch[0].id).x + pos.get(ch[ch.length - 1].id).x) / 2 : PAD + (leaf++) * this.DX;
          pos.set(m.id, { x, y: PAD + d * this.DY });
        }
      }
      this.pos = pos;
      const w = PAD * 2 + Math.max(1, leaf) * this.DX, h = PAD * 2 + maxD * this.DY + 14;
      const parts = [`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">`];
      for (const n of nodes) {
        const p = pos.get(n.id), q = n.parent != null && pos.get(n.parent);
        if (p && q) parts.push(`<g data-e="${n.id}" style="display:none"><line x1="${q.x}" y1="${q.y}" x2="${p.x}" y2="${p.y}" class="tedge"/><text x="${(p.x + q.x) / 2 + 3}" y="${(p.y + q.y) / 2}" font-size="9" style="fill:var(--muted)"></text></g>`);
      }
      for (const n of nodes) {
        const p = pos.get(n.id); if (!p) continue;
        parts.push(`<g data-n="${n.id}" transform="translate(${p.x} ${p.y})" style="display:none;cursor:pointer"><path/><text y="18" font-size="9.5" text-anchor="middle" style="fill:var(--ink)"></text></g>`);
      }
      parts.push('</svg>');
      this.el.innerHTML = parts.join('');
      this.g = new Map(); this.e = new Map();
      this.el.querySelectorAll('g[data-n]').forEach(g => this.g.set(+g.dataset.n, g));
      this.el.querySelectorAll('g[data-e]').forEach(g => this.e.set(+g.dataset.e, g));
    }

    shapePath(shape, r) {
      switch (shape) {
        case 'up': return `M0 ${-r} L${r} ${r * 0.8} L${-r} ${r * 0.8} Z`;
        case 'down': return `M0 ${r} L${r} ${-r * 0.8} L${-r} ${-r * 0.8} Z`;
        case 'square': return `M${-r} ${-r} H${r} V${r} H${-r} Z`;
        case 'diamond': return `M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`;
        default: return `M${-r} 0 A${r} ${r} 0 1 0 ${r} 0 A${r} ${r} 0 1 0 ${-r} 0`;
      }
    }

    update(i, style, focusId) {
      if (!this.g) return;
      for (const n of this.nodes) {
        const g = this.g.get(n.id); if (!g) continue;
        const e = this.e.get(n.id);
        const s = n.t > i ? { hide: true } : style(n, i);
        const key = JSON.stringify(s);
        if (this.cache.get(n.id) === key) continue;
        this.cache.set(n.id, key);
        if (s.hide) { g.style.display = 'none'; if (e) e.style.display = 'none'; continue; }
        g.style.display = '';
        const r = s.r || 6;
        const path = g.firstChild;
        path.setAttribute('d', this.shapePath(s.shape, r));
        path.setAttribute('style', `fill:${s.fill || 'var(--panel)'};stroke:${s.stroke || 'var(--muted)'};stroke-width:${s.sw || 1.5}${s.dash ? ';stroke-dasharray:3 2' : ''}`);
        g.lastChild.textContent = this.labels && s.label != null ? s.label : '';
        if (e) {
          e.style.display = '';
          const line = e.firstChild;
          line.setAttribute('style', s.edge === 'sol' ? 'stroke:var(--gold);stroke-width:3' : s.edge === 'pruned' ? 'stroke:var(--danger);stroke-dasharray:3 3;opacity:.6' : s.edge === 'faint' ? 'stroke:var(--cell-line);opacity:.4' : 'stroke:var(--cell-line)');
          e.lastChild.textContent = s.edgeLabel || '';
        }
      }
      if (focusId != null && this.pos.has(focusId)) {
        const p = this.pos.get(focusId), b = this.el;
        if (p.x < b.scrollLeft + 30 || p.x > b.scrollLeft + b.clientWidth - 30) b.scrollLeft = p.x - b.clientWidth / 2;
        if (p.y < b.scrollTop + 30 || p.y > b.scrollTop + b.clientHeight - 30) b.scrollTop = p.y - b.clientHeight / 2;
      }
    }
  };
})(window.W);
