(function () {
  'use strict';
  W.topbar('Ch. 5 · Constraint Satisfaction Problems');
  const $ = id => document.getElementById(id);
  const VALS = W.CSP_VALS;

  let spec, observed, csp, run = null;
  const opts = { varOrder: 'mrv', valOrder: 'static', inference: 'fc', all: false, seed: 1 };

  const grid = new W.GridView($('grid'), { onCellClick: c => toggleObs(W.key(...c)) });
  const pseudo = new W.Pseudo($('pseudo'));
  const tree = new W.GTree($('left'), { describe: n => n.var ? `X${n.var} = ${n.val}\nstatus: ${n.status}` : 'root (empty assignment)', dx: 22 });
  const player = new W.Player($('player'), { onStep: i => run && run.render(i) });
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; safeObs(); }, sizes: [4, 5, 6] });
  const tabs = new W.Tabs($('tabs'), [['ac3', 'Constraint propagation (AC-3)'], ['bt', 'Backtracking search'], ['mc', 'Min-conflicts']], () => rebuildRun(), 'ch05.tab');
  spec = wp.spec;
  $('reveal').onchange = $('edges').onchange = () => run && run.render(player.i);
  $('obsGoal').onclick = safeObs;
  $('obsStart').onclick = () => { observed = new Set(['1,1']); rebuildCSP(); };

  function safeObs() {
    const r = W.runEpisode(spec, 'goal');
    observed = new Set(r.agent.m.visited);
    rebuildCSP();
  }
  function toggleObs(k) {
    if (wp.click(W.parse(k))) return;
    if (k === '1,1') return;
    if (observed.has(k)) observed.delete(k);
    else { if (spec.pits.includes(k) || spec.wumpus === k) return; observed.add(k); }
    rebuildCSP();
  }

  function percept(k) {
    const [x, y] = W.parse(k), nb = W.neighbors(x, y, spec.size).map(c => W.key(...c));
    return { B: nb.some(c => spec.pits.includes(c)), S: !!spec.wumpus && (spec.wumpus === k || nb.includes(spec.wumpus)) };
  }

  function rebuildCSP() {
    csp = W.buildCSP(spec, observed);
    $('cspinfo').innerHTML = `${csp.vars.length} variables (frontier squares), ${csp.constraints.length} constraints, ${observed.size} observed squares. Search space: 3<sup>${csp.vars.length}</sup> = ${Math.pow(3, csp.vars.length).toLocaleString()} complete assignments.`;
    $('clist').innerHTML = csp.constraints.map(c => `<div class="s" data-c="${c.id}">C${c.id}: ${W.esc(c.text)}</div>`).join('') || '<span class="muted">no constraints</span>';
    allSolutions();
    rebuildRun();
  }

  /* ---------- drawing ---------- */
  function draw({ D, A, focusC, focusV }) {
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (observed.has(k)) {
        const p = percept(k);
        o.fill = 'var(--accent)'; o.alpha = 0.16;
        o.sub = [p.B && 'B', p.S && 'S'].filter(Boolean).join(' ') || '—';
      } else if (csp.vars.includes(k)) {
        const a = A && A[k];
        if (a) {
          o.label = `= ${a}`; o.labelSize = 14;
          o.fill = a === 'P' ? 'var(--pit)' : a === 'W' ? 'var(--wumpus)' : 'var(--safe)'; o.alpha = 0.35;
        } else {
          const d = D ? D[k] : VALS;
          o.label = VALS.map(v => d.includes(v) ? v : '·').join(' '); o.labelSize = 13;
          if (d.length === 1) { o.fill = d[0] === 'P' ? 'var(--pit)' : d[0] === 'W' ? 'var(--wumpus)' : 'var(--safe)'; o.alpha = 0.3; }
          if (d.length === 0) { o.fill = 'var(--danger)'; o.alpha = 0.5; o.label = '∅ (empty!)'; }
        }
        o.sub = 'X' + k;
        if (focusV === k) o.ring = 'var(--gold)';
      }
      cells[k] = o;
    }
    const paths = [];
    if ($('edges').checked) {
      for (const c of csp.constraints) {
        if (c.type === 'ONE') continue;
        const [ax, ay] = W.parse(c.at), off = c.type === 'B' ? -0.13 : 0.13;
        for (const v of c.scope) {
          const [bx, by] = W.parse(v);
          const focus = focusC === c.id;
          paths.push({ pts: [[ax + off, ay + off], [bx + off, by + off]], color: focus ? 'var(--gold)' : c.type === 'B' ? 'var(--breeze)' : 'var(--stench)', dash: !c.need, width: focus ? 4 : 1.8 });
        }
      }
    }
    grid.draw({ size: spec.size, spec, showHazards: $('reveal').checked, cells, paths });
    document.querySelectorAll('#clist .s').forEach(d => d.classList.toggle('new', +d.dataset.c === focusC));
    const f = document.querySelector('#clist .s.new'); if (f) W.scrollInto(f);
  }

  /* ---------- options ---------- */
  function optionsUI() {
    const t = tabs.cur;
    const sel = (id, label, options) => `<label>${label} <select data-o="${id}">${options.map(([v, l]) => `<option value="${v}" ${String(opts[id]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    if (t === 'bt') $('opts').innerHTML = sel('varOrder', 'variable order', [['static', 'static'], ['mrv', 'MRV + degree']]) + sel('valOrder', 'value order', [['static', '∅, P, W'], ['lcv', 'LCV']]) + sel('inference', 'inference', [['none', 'none'], ['fc', 'forward checking'], ['mac', 'MAC (GAC-3)']]) + sel('all', 'find', [['false', 'first solution'], ['true', 'all solutions']]);
    else if (t === 'mc') $('opts').innerHTML = `<button data-seed>🎲 new random start (seed ${opts.seed})</button>`;
    else $('opts').innerHTML = '<span class="muted">Runs GAC-3 from the full domains. Watch the queue of (variable, constraint) arcs.</span>';
    $('opts').querySelectorAll('select').forEach(s => s.onchange = () => { opts[s.dataset.o] = s.dataset.o === 'all' ? s.value === 'true' : s.value; rebuildRun(); });
    const b = $('opts').querySelector('[data-seed]'); if (b) b.onclick = () => { opts.seed++; rebuildRun(); };
  }

  function rebuildRun() {
    optionsUI();
    const t = tabs.cur;
    $('allpanel').style.display = '';
    if (t === 'ac3') {
      const ev = [], D = W.cspInitialDomains(csp);
      const ok = W.gac3(csp, D, e => ev.push(e));
      pseudo.set(W.CSP_PSEUDO.ac3.lines, W.CSP_PSEUDO.ac3.caption);
      $('lefttitle').textContent = 'Revisions';
      const decided = csp.vars.filter(v => D[v].length === 1);
      run = { render(i) {
        const e = ev[i];
        draw({ D: e.D, focusC: e.cid, focusV: e.X });
        pseudo.highlight([e.line]);
        const txt = { init: 'queue ← every (variable, constraint) pair', revise: `REVISE(X${e.X}, C${e.cid}): ${e.removed && e.removed.length ? 'no support for ' + e.removed.join(', ') : 'every value supported'}`, removed: `removed ${e.removed && e.removed.join(', ')} from D(X${e.X})`, wipeout: `D(X${e.X}) is empty ⇒ inconsistent`, enqueue: `re-queue the arcs of X${e.X}'s neighbours`, done: 'queue empty: the CSP is arc consistent' }[e.kind];
        $('msg').textContent = txt;
        $('sub').textContent = `queue: ${e.queue != null ? e.queue : 0} arcs`;
        const hist = ev.slice(0, i + 1).filter(x => x.kind === 'removed');
        $('left').innerHTML = `<div class="proof">${hist.map(x => `<div>X${x.X}: removed ${x.removed.join(', ')} <span class="muted">(C${x.cid})</span></div>`).join('') || '<span class="muted">nothing removed yet</span>'}</div>
          ${i === ev.length - 1 ? `<div class="callout ${ok ? 'good' : 'bad'}" style="margin-top:8px">${ok ? `Arc consistent. Propagation alone settled <b>${decided.length}</b> of ${csp.vars.length} variables: ${decided.map(v => `X${v} = ${D[v][0]}`).join(', ') || 'none'}.` : 'Inconsistent (a domain became empty).'}</div>` : ''}`;
      } };
      $('left').className = '';
      player.load(ev.length);
    } else if (t === 'bt') {
      const r = W.backtrack(csp, opts);
      pseudo.set(W.CSP_PSEUDO.bt.lines, W.CSP_PSEUDO.bt.caption + ` · ${opts.varOrder.toUpperCase()}, ${opts.valOrder.toUpperCase()}, inference: ${opts.inference}`);
      $('lefttitle').textContent = `Search tree (${r.nodes.length - 1} assignments tried${r.capped ? ', capped' : ''})`;
      $('left').className = 'treebox';
      tree.load(r.nodes);
      const colors = { conflict: 'var(--danger)', pruned: 'var(--maybe)', solution: 'var(--gold)', dead: 'var(--muted)', open: 'var(--accent)', root: 'var(--ink)' };
      run = { render(i) {
        const e = r.events[i];
        draw({ D: e.D, A: e.A, focusV: e.X });
        pseudo.highlight([e.line]);
        $('msg').textContent = e.msg;
        const sols = r.events.slice(0, i + 1).filter(x => x.kind === 'solution').length;
        $('sub').textContent = `${sols} solution(s) so far · nodes: ${r.nodes.filter(n => n.t <= i).length - 1}` + (i === r.events.length - 1 ? ` · done. ${r.solutions.length} solution(s)` : '');
        tree.update(i, n => {
          const settled = n.t < i || n.id === e.node;
          const st = n.status;
          return { shape: n.id === 0 ? 'square' : 'circle', r: n.id === e.node ? 8 : 6, label: n.var ? `${n.val}` : '',
            fill: n.id === e.node ? 'var(--gold)' : settled ? colors[st] || 'var(--accent)' : 'var(--panel)', stroke: colors[st] || 'var(--muted)' };
        }, e.node);
      } };
      player.load(r.events.length);
    } else {
      const r = W.minConflicts(csp, { seed: opts.seed, maxSteps: 400 });
      pseudo.set(W.CSP_PSEUDO.mc.lines, W.CSP_PSEUDO.mc.caption);
      $('lefttitle').textContent = 'Violated constraints over time';
      $('left').className = '';
      run = { render(i) {
        const e = r.events[i];
        draw({ A: e.A, focusV: e.X });
        pseudo.highlight([e.line]);
        $('msg').textContent = e.msg;
        $('sub').textContent = `${e.conf} constraint(s) violated`;
        $('left').innerHTML = W.sparkline(r.events.map(x => x.conf), { marker: i, label: 'violated constraints per step' }) +
          (i === r.events.length - 1 ? `<div class="callout ${r.solved ? 'good' : 'bad'}" style="margin-top:8px">${r.solved ? 'Found a consistent world. It is one possible explanation of the percepts, not necessarily the true one.' : 'Stuck: no solution within the step limit. Try another random start.'}</div>` : '');
      } };
      player.load(r.events.length);
    }
  }

  /* ---------- all solutions + Ch.12 preview ---------- */
  function allSolutions() {
    const r = W.backtrack(csp, { varOrder: 'mrv', valOrder: 'static', inference: 'mac', all: true, cap: 200000 });
    const sols = r.solutions, p = spec.pitProb != null ? spec.pitProb : 0.2;
    if (!csp.vars.length) { $('allout').innerHTML = '<p class="muted">No frontier squares: nothing to infer.</p>'; return; }
    if (!sols.length) { $('allout').innerHTML = '<div class="callout bad">No consistent assignment. This happens when the true world has the wumpus inside a pit, a case this CSP leaves out.</div>'; return; }
    const U = W.cells(spec.size).length - observed.size, F = csp.vars.length;
    let Z = 0;
    const wsum = new Map(csp.vars.map(v => [v, { P: 0, W: 0, n: { P: 0, W: 0 } }]));
    for (const s of sols) {
      const k = csp.vars.filter(v => s[v] === 'P').length, hasW = csp.vars.some(v => s[v] === 'W');
      const w = Math.pow(p, k) * Math.pow(1 - p, F - k) * (hasW ? 1 / U : (U - F) / U);
      Z += w;
      for (const v of csp.vars) { const e = wsum.get(v); if (s[v] === 'P') { e.P += w; e.n.P++; } if (s[v] === 'W') { e.W += w; e.n.W++; } }
    }
    const pct = x => (x * 100).toFixed(0) + '%';
    const rows = csp.vars.map(v => {
      const e = wsum.get(v), fp = e.n.P / sols.length, fw = e.n.W / sols.length;
      const cert = fp === 1 ? '<span class="pill bad">certainly pit</span>' : fw === 1 ? '<span class="pill bad">certainly wumpus</span>' : (fp === 0 && fw === 0) ? '<span class="pill good">certainly safe</span>' : '';
      return `<tr><td>X${v}</td><td>${cert}</td><td class="num">${pct(fp)}</td><td class="num">${pct(fw)}</td><td class="num"><b>${pct(e.P / Z)}</b></td><td class="num"><b>${pct(e.W / Z)}</b></td></tr>`;
    }).join('');
    $('allout').innerHTML = `<p class="small">${sols.length} solutions (worlds consistent with every percept) out of ${Math.pow(3, F).toLocaleString()} assignments.</p>
      <table class="data"><tr><th>variable</th><th></th><th class="num">P in % of solutions</th><th class="num">W in % of solutions</th><th class="num">P(pit), weighted</th><th class="num">P(wumpus), weighted</th></tr>${rows}</table>
      <p class="small muted" style="margin-top:6px">Weighted: each solution gets its prior probability, p<sup>#pits</sup>(1−p)<sup>#non-pits</sup> with p = ${p}, times the chance the wumpus is where that solution puts it. Normalizing gives the exact posterior of Chapter 12 (§12.7). Plain solution counting gets it wrong because it treats a world with three pits as likely as a world with one.</p>`;
  }

  safeObs();
})();
