/* SVG renderer for a Wumpus grid. Stateless: call draw(opts) whenever anything changes.
 *
 * opts = {
 *   size,                      grid size n
 *   spec,                      world spec (needed for showHazards / showPercepts)
 *   showHazards, showPercepts, draw true pits / wumpus / gold, and breeze/stench markers
 *   wumpusAlive, goldTaken,
 *   agent: {x, y, dir, alive, hasGold},
 *   cells: { "x,y": { fill, alpha, label, labelColor, ring, sub } },  per-cell overlays
 *   path: [[x,y], ...], pathColor, pathDash
 *   paths: [{ pts, color, dash, width }]  additional paths
 * }
 */
(function (W) {
  'use strict';
  const M = 20; // margin for axis labels

  W.GridView = class {
    constructor(el, { cell = null, onCellClick = null, onCellHover = null } = {}) {
      this.el = el; this.fixedCell = cell; this.cell = cell || 80; this.onCellClick = onCellClick; this.onCellHover = onCellHover;
      el.classList.add('gridview');
      el.addEventListener('click', e => {
        const c = e.target.closest('[data-cell]');
        if (c && this.onCellClick) this.onCellClick(W.parse(c.dataset.cell), e);
      });
      el.addEventListener('mousemove', e => {
        const c = e.target.closest('[data-cell]');
        if (this.onCellHover) this.onCellHover(c ? W.parse(c.dataset.cell) : null, e);
      });
      el.addEventListener('mouseleave', e => { if (this.onCellHover) this.onCellHover(null, e); });
    }

    px(x, y, n) { return [M + (x - 1) * this.cell, (n - y) * this.cell]; }
    center(x, y, n) { const [a, b] = this.px(x, y, n); return [a + this.cell / 2, b + this.cell / 2]; }

    draw(o) {
      if (!this.fixedCell) this.cell = Math.max(44, Math.min(96, Math.floor(420 / o.size)));
      const n = o.size, C = this.cell, W_ = M + n * C, H = n * C + M;
      const spec = o.spec || { pits: [], wumpus: null, gold: null };
      const pits = new Set(spec.pits);
      const out = [];
      out.push(`<svg viewBox="0 0 ${W_ + 2} ${H + 2}" width="${W_ + 2}" height="${H + 2}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">`);

      for (let y = 1; y <= n; y++) {
        for (let x = 1; x <= n; x++) {
          const k = W.key(x, y), [px, py] = this.px(x, y, n);
          const ov = (o.cells && o.cells[k]) || {};
          out.push(`<g data-cell="${k}" style="cursor:${this.onCellClick ? 'pointer' : 'default'}">`);
          out.push(`<rect x="${px + 1}" y="${py + 1}" width="${C}" height="${C}" style="fill:var(--cell);stroke:var(--cell-line)"/>`);
          if (ov.fill) out.push(`<rect x="${px + 1}" y="${py + 1}" width="${C}" height="${C}" style="fill:${ov.fill};opacity:${ov.alpha == null ? 0.35 : ov.alpha}"/>`);
          if (ov.ring) out.push(`<rect x="${px + 4}" y="${py + 4}" width="${C - 6}" height="${C - 6}" rx="4" style="fill:none;stroke:${ov.ring};stroke-width:2.5"/>`);
          out.push(`<text x="${px + 4}" y="${py + 12}" font-size="9" style="fill:var(--muted)">${x},${y}</text>`);

          if (o.showPercepts) {
            const nb = W.neighbors(x, y, n).map(([a, b]) => W.key(a, b));
            const br = nb.some(c => pits.has(c));
            const st = spec.wumpus && (k === spec.wumpus || nb.includes(spec.wumpus));
            if (br) out.push(`<text x="${px + C - 4}" y="${py + 12}" font-size="10" text-anchor="end" style="fill:var(--breeze)">breeze</text>`);
            if (st) out.push(`<text x="${px + C - 4}" y="${py + C - 3}" font-size="10" text-anchor="end" style="fill:var(--stench)">stench</text>`);
          }
          if (o.showHazards) {
            const [cx, cy] = [px + C / 2 + 1, py + C / 2 + 1];
            if (pits.has(k)) out.push(`<ellipse cx="${cx}" cy="${cy + 2}" rx="${C * 0.3}" ry="${C * 0.22}" style="fill:var(--pit);opacity:.9"/><text x="${cx}" y="${cy + 6}" font-size="11" text-anchor="middle" style="fill:#fff">PIT</text>`);
            if (spec.wumpus === k) out.push(this.wumpusSvg(cx, cy, C, o.wumpusAlive !== false));
            if (spec.gold === k && !o.goldTaken) out.push(`<path d="M${cx + C * .22} ${cy + C * .16} l${C * .08} -${C * .1} l${C * .08} ${C * .1} l-${C * .08} ${C * .1} z" style="fill:var(--gold);stroke:#8a6400;stroke-width:1"/>`);
          }
          if (ov.label != null) {
            out.push(`<text x="${px + C / 2 + 1}" y="${py + C - (ov.sub ? 16 : 6)}" font-size="${ov.labelSize || 11}" font-weight="600" text-anchor="middle" style="fill:${ov.labelColor || 'var(--ink)'}">${W.esc(ov.label)}</text>`);
          }
          if (ov.sub != null) out.push(`<text x="${px + C / 2 + 1}" y="${py + C - 5}" font-size="9" text-anchor="middle" style="fill:var(--muted)">${W.esc(ov.sub)}</text>`);
          out.push('</g>');
        }
      }
      // axes
      for (let i = 1; i <= n; i++) {
        const [px] = this.px(i, 1, n), [, py] = this.px(1, i, n);
        out.push(`<text x="${px + C / 2}" y="${n * C + 15}" font-size="11" text-anchor="middle" style="fill:var(--muted)">${i}</text>`);
        out.push(`<text x="8" y="${py + C / 2 + 4}" font-size="11" text-anchor="middle" style="fill:var(--muted)">${i}</text>`);
      }

      const paths = (o.paths || []).slice();
      if (o.path && o.path.length > 1) paths.push({ pts: o.path, color: o.pathColor, dash: o.pathDash, width: o.pathWidth });
      for (const p of paths) {
        if (!p.pts || p.pts.length < 2) continue;
        const d = p.pts.map(([x, y], i) => { const [cx, cy] = this.center(x, y, n); return (i ? 'L' : 'M') + (cx + 1) + ' ' + (cy + 1); }).join(' ');
        out.push(`<path d="${d}" style="fill:none;stroke:${p.color || 'var(--accent)'};stroke-width:${p.width || 3};stroke-linecap:round;stroke-linejoin:round;opacity:.85" ${p.dash ? 'stroke-dasharray="6 5"' : ''}/>`);
      }

      if (o.agent) out.push(this.agentSvg(o.agent, n));
      out.push('</svg>');
      this.el.innerHTML = (o.caption ? `<div class="cap">${o.caption}</div>` : '') + out.join('');
    }

    wumpusSvg(cx, cy, C, alive) {
      const r = C * 0.2, col = alive ? 'var(--wumpus)' : 'var(--muted)';
      return `<g style="opacity:${alive ? 1 : .6}"><circle cx="${cx - C * .12}" cy="${cy - C * .02}" r="${r}" style="fill:${col}"/>` +
        `<circle cx="${cx - C * .18}" cy="${cy - C * .06}" r="${r * .22}" fill="#fff"/><circle cx="${cx - C * .06}" cy="${cy - C * .06}" r="${r * .22}" fill="#fff"/>` +
        `<text x="${cx - C * .12}" y="${cy + r + 11}" font-size="9" text-anchor="middle" style="fill:${col}">${alive ? 'WUMPUS' : 'dead'}</text></g>`;
    }

    agentSvg(a, n) {
      const [cx, cy] = this.center(a.x, a.y, n), s = this.cell * 0.2;
      const rot = { E: 0, N: -90, W: 180, S: 90 }[a.dir || 'E'];
      const fill = a.alive === false ? 'var(--danger)' : 'var(--accent)';
      let g = `<g transform="translate(${cx + 1} ${cy + 1}) rotate(${rot})"><path d="M${s} 0 L${-s * .8} ${s * .75} L${-s * .4} 0 L${-s * .8} ${-s * .75} Z" style="fill:${fill};stroke:var(--panel);stroke-width:1.5"/></g>`;
      if (a.hasGold) g += `<circle cx="${cx + s + 3}" cy="${cy - s}" r="4" style="fill:var(--gold);stroke:#8a6400"/>`;
      if (a.alive === false) g += `<text x="${cx + 1}" y="${cy + s + 14}" font-size="10" text-anchor="middle" font-weight="700" style="fill:var(--danger)">DEAD</text>`;
      return g;
    }
  };

  /* Cycles a cell through empty → pit → wumpus → gold → empty. Used by the world editor. */
  W.editCell = function (spec, k) {
    if (k === '1,1') return spec;
    const s = JSON.parse(JSON.stringify(spec));
    s.seed = 'custom';
    if (s.pits.includes(k)) { s.pits = s.pits.filter(p => p !== k); s.wumpus = k; if (s.gold === k) s.gold = null; }
    else if (s.wumpus === k) { s.wumpus = null; s.gold = k; }
    else if (s.gold === k) { s.gold = null; }
    else { s.pits.push(k); }
    return s;
  };
})(window.W);
