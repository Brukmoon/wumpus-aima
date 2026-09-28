(function () {
  'use strict';
  W.topbar('Ch. 16 · Making Simple Decisions');
  const $ = id => document.getElementById(id);
  const DEATH = -1000;

  let spec, observed = new Set(['1,1']);
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; op.safe(); } });
  spec = wp.spec;
  const op = new W.ObsPanel($('obspanel'), { getSpec: () => spec, onChange: o => { observed = o; render(); } });
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (wp.click(c)) return; op.toggle(W.key(...c)); } });
  ['V', 'att', 'R'].forEach(id => $(id).onchange = render);

  function U(x) {
    const att = $('att').value, R = Math.max(1, +$('R').value);
    if (att === 'averse') return R * (1 - Math.exp(-x / R));
    if (att === 'seeking') return R * (Math.exp(x / R) - 1);
    return x;
  }
  function Uinv(u) {
    const att = $('att').value, R = Math.max(1, +$('R').value);
    if (att === 'averse') return -R * Math.log(1 - u / R);
    if (att === 'seeking') return R * Math.log(1 + u / R);
    return u;
  }
  // Options: go home (sure 0), or step into a frontier square s (lottery: die with risk r_s, else V).
  function options(post) {
    const V = +$('V').value;
    const frontier = post.frontier.filter(k => !observed.has(k));
    const opts = [{ name: 'Go home and climb out', key: null, risk: 0, eu: U(0), ev: 0 }];
    for (const k of frontier) { const r = post.risk.get(k); opts.push({ name: `Step into [${k}]`, key: k, risk: r, eu: (1 - r) * U(V) + r * U(DEATH), ev: (1 - r) * V + r * DEATH }); }
    opts.sort((a, b) => b.eu - a.eu);
    return opts;
  }

  function render() {
    let post;
    try { post = W.posterior(spec, observed); } catch (e) { $('eu').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; return; }
    $('Rw').style.display = $('att').value === 'neutral' ? 'none' : '';
    const opts = options(post), best = opts[0];
    grid.draw({ size: spec.size, spec, showHazards: false, cells: W.probCells(spec, observed, post, { focus: best.key }) });
    const safeLeft = post.frontier.filter(k => post.risk.get(k) < 1e-9);
    $('eu').innerHTML = `<h3>Expected utility of each action</h3>${safeLeft.length ? `<div class="callout good small">${safeLeft.length} frontier square(s) are perfectly safe. The decision is easy there; the interesting case is when none is left (click squares to explore further).</div>` : ''}
      <table class="data"><tr><th>action</th><th class="num">risk</th><th class="num">expected points</th><th class="num">EU</th><th class="num">certainty equivalent</th></tr>
      ${opts.map((o, i) => `<tr class="${i === 0 ? 'best' : ''}"><td>${o.name}${i === 0 ? ' <b>← MEU</b>' : ''}</td><td class="num">${(o.risk * 100).toFixed(1)}%</td><td class="num">${o.ev.toFixed(0)}</td><td class="num">${o.eu.toFixed(1)}</td><td class="num">${isFinite(Uinv(o.eu)) ? Uinv(o.eu).toFixed(0) : '—'}</td></tr>`).join('')}</table>`;
    // utility curve
    const V = +$('V').value, xs = []; for (let x = DEATH; x <= Math.max(V, 100); x += (Math.max(V, 100) - DEATH) / 120) xs.push([x, U(x)]);
    $('ucurve').innerHTML = W.chart([{ values: xs, color: 'var(--accent)', label: 'U(x)' }, { values: [[DEATH, U(DEATH)], [0, U(0)], [V, U(V)]], color: 'var(--gold)', dots: true, scatter: true, label: 'outcomes: death, go home, survive' }], { w: 520, h: 200, xLabel: 'points x' });
    // VPI for a pit detector and a wumpus detector on each frontier square
    const baseEU = best.eu, p = spec.pitProb != null ? spec.pitProb : 0.2;
    const rows = [];
    for (const s of post.frontier) {
      for (const kind of ['pit', 'wumpus']) {
        const P = kind === 'pit' ? post.pit.get(s) : post.wumpus.get(s);
        if (P <= 0 || P >= 1) { rows.push({ s, kind, P, vpi: 0, note: 'already certain' }); continue; }
        let eu = 0;
        const choice = [];
        for (const v of [true, false]) {
          const cond = W.posterior(spec, observed, kind === 'pit' ? { fixedPit: new Map([[s, v]]) } : { fixedWumpus: new Map([[s, v]]) });
          const b = options(cond)[0];
          eu += (v ? P : 1 - P) * b.eu;
          choice.push(`if ${v ? 'yes' : 'no'}: ${b.name.replace('Step into ', '→ ').replace('Go home and climb out', 'go home')}`);
        }
        rows.push({ s, kind, P, vpi: eu - baseEU, note: choice.join('; ') });
      }
    }
    rows.sort((a, b) => b.vpi - a.vpi);
    $('vpi').innerHTML = `<p class="small">VPI(E) = Σ<sub>e</sub> P(e) · max<sub>a</sub> EU(a | e) − max<sub>a</sub> EU(a): how much the agent should pay (in utility) for a perfect detector reading on one square, <em>before</em> it acts.</p>
      <table class="data"><tr><th>detector</th><th class="num">P(yes)</th><th class="num">VPI</th><th>best action after the reading</th></tr>
      ${rows.slice(0, 14).map((r, i) => `<tr class="${i === 0 && r.vpi > 1e-9 ? 'best' : ''}"><td>${r.kind} at [${r.s}]</td><td class="num">${(r.P * 100).toFixed(0)}%</td><td class="num">${r.vpi.toFixed(1)}</td><td class="small">${W.esc(r.note)}</td></tr>`).join('')}</table>`;
  }

  op.safe();
})();
