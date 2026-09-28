/* Shared UI widgets: step player, pseudocode panel, world configuration panel, tooltip. */
(function (W) {
  'use strict';

  /* ---------- Player: scrub through a precomputed trace of `length` steps ---------- */
  W.Player = class {
    constructor(el, { onStep, keys = true }) {
      this.el = el; this.onStep = onStep; this.disabledKeys = !keys; this.length = 0; this.i = 0; this.timer = null; this.speed = 8;
      el.classList.add('player');
      el.innerHTML = `
        <button data-a="first" title="First step (Home)">⏮</button>
        <button data-a="prev" title="Step back (←)">◀</button>
        <button data-a="play" class="primary" title="Play / pause (Space)">▶</button>
        <button data-a="next" title="Step forward (→)">▶|</button>
        <button data-a="last" title="Last step (End)">⏭</button>
        <input class="scrub" type="range" min="0" max="0" value="0">
        <span class="pos">0 / 0</span>
        <label class="small muted">speed <select data-a="speed">
          <option value="1">1/s</option><option value="3">3/s</option><option value="8" selected>8/s</option>
          <option value="25">25/s</option><option value="80">80/s</option><option value="400">400/s</option></select></label>`;
      el.addEventListener('click', e => {
        const a = e.target.dataset.a;
        if (a === 'first') this.go(0); else if (a === 'last') this.go(this.length - 1);
        else if (a === 'prev') this.go(this.i - 1); else if (a === 'next') this.go(this.i + 1);
        else if (a === 'play') this.toggle();
      });
      this.scrub = el.querySelector('.scrub');
      this.scrub.addEventListener('input', () => { this.pause(); this.go(+this.scrub.value); });
      el.querySelector('[data-a=speed]').addEventListener('change', e => { this.speed = +e.target.value; if (this.timer) { this.pause(); this.play(); } });
      document.addEventListener('keydown', e => {
        if (this.disabledKeys || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight') { this.pause(); this.go(this.i + 1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { this.pause(); this.go(this.i - 1); e.preventDefault(); }
        else if (e.key === ' ') { this.toggle(); e.preventDefault(); }
        else if (e.key === 'Home') this.go(0);
        else if (e.key === 'End') this.go(this.length - 1);
      });
    }
    load(length, start = 0) {
      this.pause(); this.length = length; this.scrub.max = Math.max(0, length - 1); this.go(start, true);
    }
    go(i, force) {
      i = Math.max(0, Math.min(this.length - 1, i));
      if (i === this.i && !force) return;
      this.i = i; this.scrub.value = i;
      this.el.querySelector('.pos').textContent = `${i + 1} / ${this.length}`;
      if (this.length) this.onStep(i);
    }
    toggle() { this.timer ? this.pause() : this.play(); }
    play() {
      if (this.i >= this.length - 1) this.go(0);
      const btn = this.el.querySelector('[data-a=play]'); btn.textContent = '⏸';
      const per = Math.max(1, Math.round(this.speed / 60));           // steps per tick at high speeds
      const ms = Math.max(1000 / 60, 1000 / this.speed);
      this.timer = setInterval(() => {
        if (this.i >= this.length - 1) return this.pause();
        this.go(Math.min(this.length - 1, this.i + per));
      }, ms);
    }
    pause() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      const btn = this.el.querySelector('[data-a=play]'); if (btn) btn.textContent = '▶';
    }
  };

  /* ---------- Pseudocode panel ----------
   * lines: array of [id, text]. id may be '' for non-highlightable lines. */
  W.Pseudo = class {
    constructor(el) { this.el = el; el.classList.add('pseudo'); }
    set(lines, caption) {
      this.el.innerHTML = (caption ? `<div class="fig">${W.esc(caption)}</div>` : '') +
        lines.map(([id, t]) => `<div data-l="${id}" class="${/^function /.test(t) ? 'kw' : ''}">${W.esc(t)}</div>`).join('');
    }
    highlight(ids) {
      const set = new Set([].concat(ids || []));
      let first = null;
      this.el.querySelectorAll('div[data-l]').forEach(d => {
        const on = d.dataset.l && set.has(d.dataset.l);
        d.classList.toggle('active', on);
        if (on && !first) first = d;
      });
      if (first) {
        const top = first.offsetTop - this.el.offsetTop, h = this.el.clientHeight;
        if (top < this.el.scrollTop || top > this.el.scrollTop + h - 20) this.el.scrollTop = top - h / 3;
      }
    }
  };

  /* ---------- World configuration panel (shared across chapters) ---------- */
  W.WorldPanel = class {
    constructor(el, { onChange, sizes = [4, 5, 6, 7, 8] }) {
      this.el = el; this.onChange = onChange; this.editing = false;
      this.spec = W.loadSpec();
      el.innerHTML = `
        <div class="row">
          <label>size <select data-f="size">${sizes.map(s => `<option value="${s}">${s}×${s}</option>`).join('')}</select></label>
          <label>pit prob <input data-f="p" type="number" min="0" max="0.6" step="0.05"></label>
          <label>seed <input data-f="seed" type="number" min="1" step="1"></label>
          <button data-a="gen">Generate</button>
          <button data-a="rand">🎲 Random</button>
          <button data-a="fig">Book Fig. 7.2</button>
          <button data-a="edit" title="Click cells on the true-world grid: empty → pit → wumpus → gold">✎ Edit world</button>
        </div>`;
      this.$ = f => el.querySelector(`[data-f=${f}]`);
      this.fill();
      el.addEventListener('click', e => {
        const a = e.target.dataset.a;
        if (a === 'gen') this.generate(+this.$('seed').value || 1);
        else if (a === 'rand') this.generate(1 + Math.floor(Math.random() * 99999));
        else if (a === 'fig') this.set(JSON.parse(JSON.stringify(W.FIG_7_2)));
        else if (a === 'edit') { this.editing = !this.editing; e.target.classList.toggle('on', this.editing); }
      });
      this.$('size').addEventListener('change', () => this.generate(+this.$('seed').value || 1));
    }
    fill() {
      if (![...this.$('size').options].some(o => +o.value === this.spec.size)) this.spec = W.generateWorld({ size: 4, seed: 7 });
      this.$('size').value = this.spec.size;
      this.$('p').value = this.spec.pitProb != null ? this.spec.pitProb : 0.2;
      this.$('seed').value = typeof this.spec.seed === 'number' ? this.spec.seed : '';
    }
    generate(seed) {
      this.set(W.generateWorld({ size: +this.$('size').value, pitProb: +this.$('p').value, seed }));
    }
    set(spec) { this.spec = spec; W.saveSpec(spec); this.fill(); this.onChange(spec); }
    /* Call from a grid click handler; returns true if the click was consumed by editing. */
    click([x, y]) {
      if (!this.editing) return false;
      this.set(W.editCell(this.spec, W.key(x, y)));
      return true;
    }
  };

  /* ---------- Tabs: <div class="tabs"> buttons; remembers the choice per page ---------- */
  W.Tabs = class {
    constructor(el, items, onChange, storeKey) {
      this.el = el; this.onChange = onChange; this.key = storeKey;
      el.classList.add('tabs');
      el.innerHTML = items.map(([k, label]) => `<button data-t="${k}">${label}</button>`).join('');
      el.addEventListener('click', e => { if (e.target.dataset.t) this.set(e.target.dataset.t); });
      let start = items[0][0];
      try { const s = storeKey && localStorage.getItem(storeKey); if (s && items.some(i => i[0] === s)) start = s; } catch (e) { /* ignore */ }
      this.cur = start;
      el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === start));
    }
    set(k) {
      this.cur = k;
      this.el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === k));
      try { if (this.key) localStorage.setItem(this.key, k); } catch (e) { /* ignore */ }
      this.onChange(k);
    }
  };

  /* Small SVG line chart (e.g. unsatisfied clauses over time). marker = index to highlight. */
  W.sparkline = function (values, { w = 460, h = 90, marker = null, color = 'var(--accent)', label = '' } = {}) {
    if (!values.length) return '';
    const max = Math.max(1, ...values), n = values.length;
    const X = i => 30 + (w - 36) * (n === 1 ? 0 : i / (n - 1)), Y = v => 8 + (h - 24) * (1 - v / max);
    const d = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;display:block" xmlns="http://www.w3.org/2000/svg">`;
    s += `<line x1="30" y1="${h - 16}" x2="${w - 6}" y2="${h - 16}" style="stroke:var(--line)"/><text x="26" y="${Y(max) + 4}" font-size="10" text-anchor="end" style="fill:var(--muted)">${max}</text><text x="26" y="${h - 12}" font-size="10" text-anchor="end" style="fill:var(--muted)">0</text>`;
    s += `<path d="${d}" style="fill:none;stroke:${color};stroke-width:1.8"/>`;
    if (marker != null && marker < n) s += `<circle cx="${X(marker)}" cy="${Y(values[marker])}" r="4" style="fill:var(--gold);stroke:var(--ink)"/>`;
    s += `<text x="${w - 6}" y="${h - 2}" font-size="10" text-anchor="end" style="fill:var(--muted)">${label}</text></svg>`;
    return s;
  };

  /* Multi-series line chart.
   * series: [{ values: [..] or [[x, y], ..], color, label, dash, width }]
   * opts: { w, h, yMin, yMax, xLabel, yLabel, marker (x index), refs: [{ y, label, color }], xMax } */
  W.chart = function (series, o = {}) {
    const w = o.w || 560, h = o.h || 200, L = 44, R = 10, T = 10, B = 30;
    const pts = series.map(s => s.values.map((v, i) => Array.isArray(v) ? v : [i, v]));
    const all = pts.flat().filter(p => isFinite(p[1]));
    const xMin = o.xMin != null ? o.xMin : Math.min(0, ...all.map(p => p[0])), xMax = o.xMax != null ? o.xMax : Math.max(1, ...all.map(p => p[0]));
    let yMin = o.yMin != null ? o.yMin : Math.min(...all.map(p => p[1]), ...(o.refs || []).map(r => r.y));
    let yMax = o.yMax != null ? o.yMax : Math.max(...all.map(p => p[1]), ...(o.refs || []).map(r => r.y));
    if (!isFinite(yMin) || !isFinite(yMax)) { yMin = 0; yMax = 1; }
    if (yMax === yMin) { yMax += 1; yMin -= 1; }
    const X = x => L + (w - L - R) * (x - xMin) / ((xMax - xMin) || 1), Y = y => T + (h - T - B) * (1 - (y - yMin) / (yMax - yMin));
    const fmt = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.abs(v) < 10 && v % 1 ? v.toFixed(2) : String(Math.round(v * 10) / 10);
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;display:block" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">`;
    for (let k = 0; k <= 4; k++) {
      const yv = yMin + (yMax - yMin) * k / 4, yy = Y(yv);
      s += `<line x1="${L}" y1="${yy}" x2="${w - R}" y2="${yy}" style="stroke:var(--line);stroke-width:${k ? 0.5 : 1}"/><text x="${L - 4}" y="${yy + 3}" font-size="10" text-anchor="end" style="fill:var(--muted)">${fmt(yv)}</text>`;
    }
    s += `<text x="${L}" y="${h - 4}" font-size="10" style="fill:var(--muted)">${fmt(xMin)}</text><text x="${w - R}" y="${h - 4}" font-size="10" text-anchor="end" style="fill:var(--muted)">${fmt(xMax)}</text>`;
    if (o.xLabel) s += `<text x="${(L + w - R) / 2}" y="${h - 4}" font-size="10" text-anchor="middle" style="fill:var(--muted)">${o.xLabel}</text>`;
    for (const r of o.refs || []) s += `<line x1="${L}" y1="${Y(r.y)}" x2="${w - R}" y2="${Y(r.y)}" style="stroke:${r.color || 'var(--muted)'};stroke-dasharray:5 4;stroke-width:1.5"/><text x="${w - R - 2}" y="${Y(r.y) - 3}" font-size="10" text-anchor="end" style="fill:${r.color || 'var(--muted)'}">${r.label || ''}</text>`;
    pts.forEach((p, i) => {
      const se = series[i], good = p.filter(q => isFinite(q[1]));
      if (!good.length) return;
      if (se.bars) { const bw = Math.max(2, (w - L - R) / (good.length * 1.3)); good.forEach(q => { s += `<rect x="${X(q[0]) - bw / 2}" y="${Y(Math.max(0, q[1]))}" width="${bw}" height="${Math.abs(Y(q[1]) - Y(0))}" style="fill:${se.color};opacity:.8"/>`; }); return; }
      const d = good.map((q, j) => (j ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1)).join(' ');
      if (!se.scatter) s += `<path d="${d}" style="fill:none;stroke:${se.color || 'var(--accent)'};stroke-width:${se.width || 1.8}${se.dash ? ';stroke-dasharray:5 4' : ''}"/>`;
      if (se.dots) good.forEach(q => { s += `<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="2.5" style="fill:${se.color}"/>`; });
    });
    if (o.marker != null) s += `<line x1="${X(o.marker)}" y1="${T}" x2="${X(o.marker)}" y2="${h - B}" style="stroke:var(--gold);stroke-width:1.5"/>`;
    s += '</svg>';
    const legend = series.filter(se => se.label).map(se => `<span style="--c:${se.color || 'var(--accent)'}">${se.label}</span>`).join('');
    return s + (legend ? `<div class="legend">${legend}</div>` : '');
  };

  /* Scroll el into view inside its nearest scrollable ancestor only (never scrolls the page). */
  W.scrollInto = function (el) {
    let box = el.parentElement;
    while (box && box !== document.body && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box || box === document.body) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - el.offsetHeight) box.scrollTop = top - box.clientHeight / 3;
  };

  /* ---------- Tooltip ---------- */
  let tipEl = null;
  W.tip = function (text, e) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; document.body.appendChild(tipEl); }
    if (!text) { tipEl.style.display = 'none'; return; }
    tipEl.textContent = text; tipEl.style.display = 'block';
    const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 14);
    tipEl.style.left = x + 'px'; tipEl.style.top = (e.clientY + 14) + 'px';
  };

  /* ---------- Topbar ---------- */
  W.topbar = function (crumb) {
    const bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = `<a class="home" href="index.html">🏹 Wumpus × AIMA</a><span class="crumb">/ ${W.esc(crumb)}</span><span class="spacer"></span>
      <button data-a="theme" title="Toggle light / dark">◐</button>`;
    bar.querySelector('[data-a=theme]').onclick = () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('wumpus.theme', root.dataset.theme); } catch (e) { /* ignore */ }
    };
    document.body.prepend(bar);
    const foot = document.createElement('footer');
    foot.className = 'sitefoot';
    foot.innerHTML = `Unofficial learning companion to <em>Artificial Intelligence: A Modern Approach</em>, 4th ed., by Stuart Russell and Peter Norvig (Pearson, 2020).
      Not affiliated with or endorsed by the authors or the publisher. Pseudocode panels follow the book's figures (also published by the authors at
      <a href="https://github.com/aimacode/aima-pseudocode">aimacode/aima-pseudocode</a>) and remain the authors' work. Section and figure numbers refer to the 4th edition.
      Please read the book: this site is meant to be used alongside it, not instead of it.`;
    document.body.append(foot);
  };
  try { const t = localStorage.getItem('wumpus.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
})(window.W);
