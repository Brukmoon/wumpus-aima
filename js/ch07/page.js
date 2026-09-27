(function () {
  'use strict';
  W.topbar('Ch. 7 · Logical Agents');
  const $ = id => document.getElementById(id), L = W.PL;

  let spec, run, stepIdx = 0, qcell = '2,2', lab = null, labTimer = null;

  const trueV = new W.GridView($('truegrid'), { onCellClick: c => wp.click(c) });
  const kV = new W.GridView($('kgrid'), { onCellClick: c => { qcell = W.key(...c); render(stepIdx); computeLab(); } });
  const labV = new W.GridView($('labgrid'));
  const hp = new W.Pseudo($('hpseudo')); hp.set(W.HYBRID_PSEUDO.lines, W.HYBRID_PSEUDO.caption);
  const lp = new W.Pseudo($('labpseudo'));
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; start(); }, sizes: [4, 5, 6] });
  spec = wp.spec;
  const player = new W.Player($('player'), { onStep: i => { stepIdx = i; render(i); clearTimeout(labTimer); labTimer = setTimeout(computeLab, player.timer ? 400 : 60); } });
  const labPlayer = new W.Player($('labplayer'), { onStep: j => lab && lab.render(j), keys: false });
  $('reveal').addEventListener('change', () => render(stepIdx));

  /* ================= A. the hybrid agent ================= */
  function start() {
    run = W.runHybrid(spec);
    qcell = firstFrontier(run.steps[Math.min(run.steps.length - 1, 3)]) || '2,1';
    player.load(run.steps.length);
    computeLab();
  }

  function perceptsUpTo(i) {
    const m = new Map();
    for (let j = 0; j <= i; j++) { const s = run.steps[j]; if (s.state.alive) m.set(W.key(s.state.x, s.state.y), s.percept); }
    return m;
  }
  function visitedAliveUpTo(i) {
    const s = new Set();
    for (let j = 0; j <= i; j++) { const st = run.steps[j].state; if (st.alive && st.wumpusAlive) s.add(W.key(st.x, st.y)); }
    return s;
  }
  function firstFrontier(step) {
    const vis = new Set(step.know.visited);
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y);
      if (!vis.has(k) && W.neighbors(x, y, spec.size).some(c => vis.has(W.key(...c)))) return k;
    }
    return null;
  }

  function knowCells(step, i) {
    const K = step.know, vis = new Set(K.visited), seen = perceptsUpTo(i);
    const noP = new Set(K.noPit), noW = new Set(K.noW), pit = new Set(K.pit), wum = new Set(K.wumpus);
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), o = {};
      if (vis.has(k)) {
        o.fill = 'var(--accent)'; o.alpha = 0.16;
        const p = seen.get(k);
        o.sub = p ? (['breeze', 'stench', 'glitter'].filter(f => p[f]).map(f => f[0].toUpperCase()).join(' ') || '—') : '';
      } else {
        const safe = noP.has(k) && (noW.has(k) || !K.alive);
        if (safe) { o.label = 'OK'; o.labelColor = 'var(--safe)'; o.fill = 'var(--safe)'; o.alpha = 0.18; }
        else {
          const a = pit.has(k) ? 'P!' : noP.has(k) ? '¬P' : 'P?';
          const b = !K.alive ? '' : wum.has(k) ? 'W!' : noW.has(k) ? '¬W' : 'W?';
          o.label = [a, b].filter(Boolean).join(' ');
          o.labelColor = pit.has(k) || wum.has(k) ? 'var(--danger)' : 'var(--muted)';
          if (pit.has(k) || wum.has(k)) { o.fill = 'var(--danger)'; o.alpha = 0.22; }
        }
      }
      if (k === qcell) o.ring = 'var(--gold)';
      cells[k] = o;
    }
    return cells;
  }

  function render(i) {
    const st = run.steps[i];
    const s = st.state;
    trueV.draw({ size: spec.size, spec, showHazards: $('reveal').checked, wumpusAlive: s.wumpusAlive, goldTaken: s.goldTaken, agent: s.climbed ? null : s });
    kV.draw({ size: spec.size, cells: knowCells(st, i), agent: s.climbed ? null : s,
      paths: st.know.plan.length ? [{ pts: st.know.planCells, color: 'var(--frontier)', width: 3 }] : [] });
    hp.highlight(st.lines);
    const status = s.done ? (s.alive ? (s.hasGold ? '<span class="pill good">escaped with gold</span>' : '<span class="pill">climbed out</span>') : '<span class="pill bad">dead</span>') : '';
    $('stepinfo').innerHTML = [
      ['percept', `<span class="mono">${W.perceptTuple(st.percept)}</span>`],
      ['action', st.action ? `<b>${st.action}</b>` : '—'],
      ['why', W.esc(st.why)],
      ['plan', st.know.plan.length ? `<span class="mono small">${st.know.plan.join(' ')}</span>` : '—'],
      ['ASKs this step', st.asks ? `${st.asks} (${st.calls} DPLL calls, ${st.asks - st.calls} answered by a cached counter-model) · ${st.ms.toFixed(1)} ms` : 'none (KB unchanged, answers reused)'],
      ['score', `${s.score} ${status}`],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    renderKB(st);
  }

  const GROUPS = { init: 'Initial facts', percept: 'Percept sentences', physics: 'Physics of visited squares', visited: 'Visited squares are free of hazards', wumpus: 'There is a wumpus', 'wumpus≤1': 'At most one wumpus', alive: 'Wumpus alive? (fluent)', shot: 'Arrow missed' };
  function renderKB(st) {
    const t = st.t, fresh = new Set(st.newSentences);
    const all = run.kb.sent.filter(s => s.step <= t);
    const active = all.filter(s => s.retracted == null || s.retracted > t);
    const nClauses = active.reduce((a, s) => a + s.clauses.length, 0);
    $('kbcount').textContent = `${active.length} sentences · ${nClauses} clauses`;
    const byGroup = new Map();
    for (const s of all) { if (!byGroup.has(s.group)) byGroup.set(s.group, []); byGroup.get(s.group).push(s); }
    $('kb').innerHTML = [...byGroup].map(([g, ss]) => {
      const open = ss.some(s => fresh.has(s.id)) || (g !== 'wumpus≤1' && ss.length <= 12);
      return `<details ${open ? 'open' : ''}><summary>${GROUPS[g] || g} (${ss.length})</summary>` +
        ss.map(s => `<div class="s ${fresh.has(s.id) ? 'new' : ''} ${s.retracted != null && s.retracted <= t ? 'gone' : ''}">${W.esc(L.show(s.s))}<span class="note">${W.esc(s.note)}</span></div>`).join('') + '</details>';
    }).join('');
  }

  /* ================= B. inference lab ================= */
  const tabs = new W.Tabs($('labtabs'), [['tt', 'Model checking'], ['res', 'Resolution'], ['fc', 'Forward chaining'], ['bc', 'Backward chaining'], ['dpll', 'DPLL'], ['walk', 'WalkSAT'], ['cnf', 'CNF conversion']], () => computeLab(), 'ch07.tab');
  $('qtype').addEventListener('change', () => { $('qcustom').style.display = $('qtype').value === 'custom' ? '' : 'none'; computeLab(); });
  $('qcustom').addEventListener('change', computeLab);

  function alpha() {
    const [x, y] = W.parse(qcell), P = W.KBsym.P(x, y), Wu = W.KBsym.W(x, y);
    switch ($('qtype').value) {
      case 'notP': return L.not(P);
      case 'P': return P;
      case 'notW': return L.not(Wu);
      case 'W': return Wu;
      case 'OK': return L.and(L.not(P), L.not(Wu));
      case 'custom': return L.parse($('qcustom').value || 'P2,2');
    }
  }
  function kindOf(a) {
    const syms = [...L.symbols(a)];
    if (syms.every(s => /^[PB]/.test(s))) return 'pit';
    if (syms.every(s => /^[WS]|^Alive/.test(s))) return 'wumpus';
    return 'all';
  }
  const cellOf = sym => { const m = /^[A-Z]+(\d+),(\d+)$/.exec(sym); return m ? W.key(+m[1], +m[2]) : null; };

  // Grid overlay for a (partial) assignment of P/W symbols.
  function assignCells(get, highlight) {
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), p = get(`P${k}`), w = get(`W${k}`), o = {};
      o.label = p === true ? 'P' : p === false ? '¬P' : '?';
      o.sub = w === true ? 'W' : w === false ? '¬W' : '?';
      o.labelColor = p === true ? 'var(--ink)' : 'var(--muted)';
      if (p === true) { o.fill = 'var(--pit)'; o.alpha = 0.35; }
      if (w === true) { o.fill = 'var(--wumpus)'; o.alpha = 0.35; }
      if (highlight && highlight.has(k)) o.ring = 'var(--gold)';
      cells[k] = o;
    }
    return cells;
  }
  const verdict = (ok, text) => `<div class="callout ${ok === true ? 'good' : ok === false ? 'bad' : ''}">${text}</div>`;

  function computeLab() {
    if (!run) return;
    const st = run.steps[stepIdx];
    let a;
    try { a = alpha(); } catch (e) { $('labresult').innerHTML = verdict(false, 'Parse error: ' + W.esc(e.message)); return; }
    $('qcell').textContent = `[${qcell}]`;
    $('qshow').textContent = 'α = ' + L.show(a);
    const ctx = { st, t: st.t, a, kind: kindOf(a), visited: new Set(st.know.visited), seen: perceptsUpTo(stepIdx), visitedAlive: visitedAliveUpTo(stepIdx) };
    const builders = { tt: labTT, res: labRes, fc: labFC, bc: labBC, dpll: labDPLL, walk: labWalk, cnf: labCNF };
    $('labextra').innerHTML = ''; $('labside').innerHTML = ''; $('labresult').innerHTML = '';
    try { lab = builders[tabs.cur](ctx); }
    catch (e) { lab = null; $('labresult').innerHTML = verdict(false, W.esc(e.message)); console.error(e); return; }
    $('labintro').innerHTML = lab.intro;
    if (lab.pseudo) lp.set(lab.pseudo.lines, lab.pseudo.caption); else $('labpseudo').innerHTML = lab.pseudoHtml || '';
    $('labplayer').style.display = lab.steps > 1 ? '' : 'none';
    labPlayer.load(Math.max(1, lab.steps), lab.startAtEnd ? Math.max(0, lab.steps - 1) : 0);
    $('labresult').innerHTML = lab.result || '';
  }

  /* ---------- model checking ---------- */
  function labTT(ctx) {
    const clauses = run.kb.clauses(ctx.t, ctx.kind === 'all' ? null : ctx.kind);
    const fixed = new Map();
    for (const c of clauses) if (c.length === 1) { const l = c[0]; fixed.set(l.replace('¬', ''), l[0] !== '¬'); }
    const frontier = W.cells(spec.size).map(c => W.key(...c)).filter(k => !ctx.visited.has(k) && W.neighbors(...W.parse(k), spec.size).some(c => ctx.visited.has(W.key(...c))));
    const pref = ctx.kind === 'pit' ? ['P'] : ctx.kind === 'wumpus' ? ['W'] : ['P', 'W'];
    let symbols = [];
    for (const k of frontier) for (const p of pref) symbols.push(p + k);
    for (const s of L.symbols(ctx.a)) if (!symbols.includes(s) && !fixed.has(s)) symbols.push(s);
    symbols = symbols.filter(s => !fixed.has(s));
    if (symbols.length > 12) throw new Error(`Model checking would enumerate 2^${symbols.length} models. Pick a pit-only or wumpus-only query, or an earlier step.`);
    const enumSet = new Set(symbols);
    const allSyms = new Set(); clauses.forEach(c => c.forEach(l => allSyms.add(l.replace('¬', ''))));
    const free = [...allSyms].filter(s => !enumSet.has(s) && !fixed.has(s));
    // KB(m): every clause true, where "free" symbols (squares far from the agent) may take any value.
    const kb = m => {
      const val = s => m.has(s) ? m.get(s) : fixed.get(s);
      const residual = [];
      for (const c of clauses) {
        let sat = false; const rest = [];
        for (const l of c) { const s = l.replace('¬', ''), v = val(s); if (v === undefined) rest.push(l); else if (v === (l[0] !== '¬')) { sat = true; break; } }
        if (sat) continue;
        if (!rest.length) return false;
        residual.push(rest);
      }
      return !residual.length || !!L.dpll(residual);
    };
    const al = m => L.evaluate(ctx.a, new Map([...fixed, ...m]));
    const r = L.ttEntails(symbols, kb, al);
    const models = r.models;
    const nKB = models.filter(m => m.kb).length, nBad = models.filter(m => m.kb && !m.alpha).length;
    const tile = (m, i) => {
      const C = 12, n = spec.size;
      let s = `<svg width="${n * C}" height="${n * C}">`;
      for (const [x, y] of W.cells(n)) {
        const k = W.key(x, y), px = (x - 1) * C, py = (n - y) * C;
        let fill = ctx.visited.has(k) ? 'var(--panel-2)' : 'var(--cell)';
        if (m.assign.get('P' + k)) fill = 'var(--pit)';
        if (m.assign.get('W' + k)) fill = 'var(--wumpus)';
        s += `<rect x="${px}" y="${py}" width="${C - 1}" height="${C - 1}" style="fill:${fill};stroke:var(--line)"/>`;
      }
      return `<div class="tile ${m.alpha ? 'good' : 'bad'}" data-i="${i}" title="model ${i + 1}">${s}</svg></div>`;
    };
    const kbIdx = models.map((m, i) => m.kb ? i : -1).filter(i => i >= 0);
    $('labextra').innerHTML = `<div class="small muted">All ${models.length} models (green: KB true and α true · red: KB true, α false · grey: KB false):</div><div class="strip" id="strip">${models.map((m, i) => `<span data-i="${i}" class="${m.kb ? (m.alpha ? 'good' : 'bad') : ''}"></span>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">The ${nKB} models of KB (like Fig. 7.5), black = pit, red = wumpus:</div><div class="gallery" id="gal">${kbIdx.slice(0, 64).map(i => tile(models[i], i)).join('')}</div>`;
    $('labextra').onclick = e => { const d = e.target.closest('[data-i]'); if (d) labPlayer.go(+d.dataset.i); };
    return {
      intro: `<b>TT-ENTAILS</b> enumerates every assignment to the unknown symbols near the agent (${symbols.join(', ') || 'none'}). Everything the KB fixes by a unit fact is filled in, and squares far away may take any value. KB ⊨ α exactly when α is true in <em>every</em> model of the KB.`,
      pseudo: L.PSEUDO.tt, steps: models.length,
      result: verdict(r.entailed, `${models.length} models enumerated, ${nKB} satisfy the KB, ${nBad} of those make α false ⇒ <b>${r.entailed ? 'KB ⊨ α' : 'KB ⊭ α'}</b>.`),
      render(j) {
        const m = models[j];
        labV.draw({ size: spec.size, cells: assignCells(s => m.assign.has(s) ? m.assign.get(s) : fixed.get(s), new Set([qcell])) });
        lp.highlight(m.kb ? ['t4'] : ['t5']);
        $('labside').innerHTML = `<div class="callout ${m.kb ? (m.alpha ? 'good' : 'bad') : ''}">Model ${j + 1} of ${models.length}: KB is <b>${m.kb}</b>${m.kb ? `, α is <b>${m.alpha}</b>` : ' (this model is irrelevant)'}.</div>`;
        document.querySelectorAll('#strip span.cur, #gal .tile.cur').forEach(e => e.classList.remove('cur'));
        document.querySelectorAll(`#strip span[data-i="${j}"], #gal .tile[data-i="${j}"]`).forEach(e => e.classList.add('cur'));
      },
    };
  }

  /* ---------- resolution ---------- */
  function labRes(ctx) {
    const kbc = run.kb.clauses(ctx.t, ctx.kind === 'all' ? null : ctx.kind);
    const neg = L.toCNF(L.not(ctx.a));
    const strat = labOpts.res;
    const r = strat === 'naive' ? L.resolution(kbc.concat(neg), { cap: 5000 })
      : strat === 'sos' ? L.resolution(kbc.concat(neg), { cap: 5000, support: neg })
      : L.resolutionGiven(kbc.concat(neg), neg, { cap: 5000 });
    $('labextra').innerHTML = `<label class="small">strategy <select id="rstrat">
      <option value="unit" ${strat === 'unit' ? 'selected' : ''}>set of support + unit preference (given-clause loop)</option>
      <option value="sos" ${strat === 'sos' ? 'selected' : ''}>set of support, level by level</option>
      <option value="naive" ${strat === 'naive' ? 'selected' : ''}>naive: all pairs, level by level (Fig. 7.13)</option></select></label>
      <p class="small muted">Set of support: every resolution uses a clause derived from ¬α. Unit preference: always work next on the shortest such clause. Switch to naive to watch the clause count explode.</p>`;
    $('rstrat').onchange = e => { labOpts.res = e.target.value; computeLab(); };
    const negKeys = new Set(neg.map(c => c.join('|')));
    const rounds = strat === 'unit'
      ? `<p class="small muted">${r.given} given clauses processed · ${r.pairs.toLocaleString()} pairs tried · ${(r.all.length - kbc.length - neg.length).toLocaleString()} new clauses.</p>`
      : `<table class="data"><tr><th>round</th><th class="num">pairs resolved</th><th class="num">new clauses</th></tr>${r.rounds.map(x => `<tr><td>${x.round || 'input'}</td><td class="num">${x.pairs || ''}</td><td class="num">${x.added}</td></tr>`).join('')}</table>`;
    if (!r.entailed) {
      $('labside').innerHTML = rounds;
      return { intro: resIntro(ctx, kbc, neg), pseudo: L.PSEUDO.res, steps: 1,
        result: verdict(r.capped ? null : false, r.capped ? `Gave up after generating ${r.all.length} clauses (cap). Resolution is complete, but it can be very slow.` : `No new clauses can be generated and the empty clause never appeared ⇒ <b>KB ⊭ α</b>.`),
        render() { labV.draw({ size: spec.size, cells: assignCells(() => undefined, new Set([qcell])) }); lp.highlight(['r8']); } };
    }
    const proof = r.proof, nodes = r.all;
    const lines = proof.map((i, j) => {
      const n = nodes[i];
      const src = n.parents ? `resolve ${n.parents.map(p => `(${proof.indexOf(p) + 1})`).join(' & ')} on ${n.lit}` : (negKeys.has(n.c.join('|')) ? 'from ¬α' : 'from KB');
      return `<div data-j="${j}" class="${n.parents ? '' : 'in'}">(${j + 1}) ${W.esc(L.showClause(n.c))}   <span class="muted">${src}</span></div>`;
    });
    $('labside').innerHTML = `<div class="proof" id="proof">${lines.join('')}</div><div style="margin-top:8px">${rounds}</div>`;
    return {
      intro: resIntro(ctx, kbc, neg), pseudo: L.PSEUDO.res, steps: proof.length, startAtEnd: true,
      result: verdict(true, `The empty clause was derived after generating ${r.all.length - kbc.length - neg.length} resolvents. The proof below needs only ${proof.length} clauses ⇒ <b>KB ⊨ α</b>.`),
      render(j) {
        const n = nodes[proof[j]];
        const hl = new Set(n.c.map(l => cellOf(l.replace('¬', ''))).filter(Boolean));
        const lits = new Map(n.c.map(l => [l.replace('¬', ''), l[0] !== '¬']));
        labV.draw({ size: spec.size, cells: assignCells(s => lits.get(s), hl) });
        lp.highlight(n.parents ? (n.c.length ? ['r5'] : ['r6']) : ['r1']);
        document.querySelectorAll('#proof .cur').forEach(e => e.classList.remove('cur'));
        const d = document.querySelector(`#proof [data-j="${j}"]`); if (d) { d.classList.add('cur'); W.scrollInto(d); }
        $('labintro').innerHTML = resIntro(ctx, kbc, neg) + `<div style="margin-top:6px">Step ${j + 1}: <b class="mono">${W.esc(L.showClause(n.c))}</b>. The grid shows this clause's literals (a clause is a disjunction: at least one must hold).</div>`;
      },
    };
  }
  function resIntro(ctx, kbc, neg) {
    return `<b>PL-RESOLUTION</b> proves KB ⊨ α by contradiction: add ¬α (${neg.map(L.showClause).join(' ; ')}) and resolve until the empty clause □ appears. Uses the ${ctx.kind === 'all' ? 'whole' : ctx.kind} part of the KB: ${kbc.length} clauses.`;
  }

  /* ---------- forward chaining ---------- */
  function hornQuery(ctx) {
    const map = { notP: 'NP', P: 'P', notW: 'NW', W: 'W', OK: 'OK' };
    const t = $('qtype').value;
    if (!map[t]) throw new Error('Forward/backward chaining need a single positive symbol. Choose one of the preset queries (not a custom sentence).');
    return map[t] + qcell;
  }
  function hornIntro(rules) {
    return `Chaining needs <b>definite clauses</b>, so the KB is rewritten with positive symbols for negative facts: NB = no breeze, NP = no pit, NW = no wumpus. For example, NB2,1 ⇒ NP3,1 and NP2,2 ∧ NW2,2 ⇒ OK2,2. ${rules.length} rules and facts. This Horn KB can't reason by cases, so it is weaker than the full CNF KB.`;
  }
  function inferredCells(set, highlight) {
    const by = new Map();
    for (const s of set) { const m = /^([A-Z]+)(\d+,\d+)$/.exec(s); if (!m) continue; if (!by.has(m[2])) by.set(m[2], new Set()); by.get(m[2]).add(m[1]); }
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), f = by.get(k) || new Set(), o = {};
      if (f.has('V')) { o.fill = 'var(--accent)'; o.alpha = 0.16; }
      if (f.has('OK')) { o.label = 'OK'; o.labelColor = 'var(--safe)'; o.fill = 'var(--safe)'; o.alpha = 0.2; }
      else if (f.has('P') || f.has('W')) { o.label = [f.has('P') && 'P!', f.has('W') && 'W!'].filter(Boolean).join(' '); o.labelColor = 'var(--danger)'; o.fill = 'var(--danger)'; o.alpha = 0.2; }
      else if (f.has('NP') || f.has('NW')) { o.label = [f.has('NP') && 'NP', f.has('NW') && 'NW'].filter(Boolean).join(' '); o.labelColor = 'var(--muted)'; }
      o.sub = [...f].filter(z => ['B', 'NB', 'S', 'NS'].includes(z)).join(' ');
      if (highlight && highlight.has(k)) o.ring = 'var(--gold)';
      cells[k] = o;
    }
    return cells;
  }
  function labFC(ctx) {
    const q = hornQuery(ctx);
    const rules = W.hornKB(spec.size, ctx.visited, ctx.seen, ctx.visitedAlive);
    const ev = [];
    const r = L.forwardChain(rules, q, { rec: e => ev.push(e) });
    const ruleText = i => { const x = rules[i]; return x.premises.length ? `${x.premises.join(' ∧ ')} ⇒ ${x.conclusion}` : `${x.conclusion} (fact)`; };
    return {
      intro: hornIntro(rules) + ` Query q = <b>${q}</b>.`, pseudo: L.PSEUDO.fc, steps: ev.length,
      result: verdict(r.entailed, r.entailed ? `q = ${q} was reached ⇒ <b>KB ⊨ ${q}</b>.` : `The queue emptied without reaching ${q} ⇒ <b>not derivable</b> from these Horn clauses.`),
      render(j) {
        const inf = new Set();
        for (let i = 0; i <= j; i++) if (ev[i].kind === 'infer') inf.add(ev[i].sym);
        const e = ev[j], hl = new Set([cellOf(e.sym || '')].filter(Boolean));
        labV.draw({ size: spec.size, cells: inferredCells(inf, hl) });
        lp.highlight([e.line]);
        $('labside').innerHTML = `<dl class="kv"><dt>event</dt><dd>${{ init: 'queue ← all facts', pop: 'pop ' + e.sym, infer: 'inferred ' + e.sym, fire: 'rule fired, conclusion ' + e.sym + ' queued', skip: e.sym + ' already inferred', found: 'reached the query ' + e.sym, fail: 'queue empty' }[e.kind]}</dd>
          ${e.rule != null ? `<dt>rule</dt><dd class="mono small">${W.esc(ruleText(e.rule))}<div class="muted">${W.esc(rules[e.rule].label)}</div></dd>` : ''}
          <dt>inferred</dt><dd>${inf.size} symbols</dd>
          <dt>queue</dt><dd class="mono small">${W.esc(e.queue.slice(0, 16).join(' ')) || '∅'}${e.queue.length > 16 ? ' …' + (e.queue.length - 16) + ' more' : ''}</dd></dl>`;
      },
    };
  }

  /* ---------- backward chaining ---------- */
  function labBC(ctx) {
    const q = hornQuery(ctx);
    const rules = W.hornKB(spec.size, ctx.visited, ctx.seen, ctx.visitedAlive);
    const ev = [];
    const r = L.backwardChain(rules, q, { rec: e => ev.push(e) });
    const nodes = r.nodes;
    return {
      intro: hornIntro(rules) + ` Backward chaining starts from q = <b>${q}</b>. For each goal it looks for a rule that concludes it (OR) and then proves all of that rule's premises (AND).`,
      pseudoHtml: `<div class="callout small">AND-OR proof search (§7.5.4). Each line is a goal. ✓ proved · ✗ failed · … in progress. A goal already on the current path is not tried again, which prevents infinite loops. Goals already proved are not re-proved.</div>`,
      steps: ev.length,
      result: verdict(r.ok, r.ok ? `Proved ${q} ⇒ <b>KB ⊨ ${q}</b>. ${nodes.length} goals explored.` : `Could not prove ${q} ⇒ <b>not derivable</b> from these Horn clauses (${nodes.length} goals explored).`),
      render(j) {
        const status = new Map(), ruleOf = new Map();
        let cur = null;
        for (let i = 0; i <= j; i++) {
          const e = ev[i]; cur = e.node;
          if (e.kind === 'goal') status.set(e.node, 'open');
          if (e.kind === 'try') ruleOf.set(e.node, e.rule);
          if (e.kind === 'ok') { status.set(e.node, 'ok'); if (e.rule != null) ruleOf.set(e.node, e.rule); }
          if (e.kind === 'fail') status.set(e.node, 'fail');
        }
        const html = nodes.filter(n => status.has(n.id)).map(n => {
          const s = status.get(n.id), ri = ruleOf.get(n.id);
          const icon = s === 'ok' ? '<span class="ok">✓</span>' : s === 'fail' ? '<span class="bad">✗</span>' : '…';
          const how = ri != null ? `<span class="muted"> ⇐ ${rules[ri].premises.length ? W.esc(rules[ri].premises.join(' ∧ ')) : 'fact'}</span>` : (s === 'fail' ? `<span class="muted"> ${W.esc(n.note)}</span>` : '');
          return `<div class="${n.id === cur ? 'cur' : ''} ${s === 'fail' ? 'dim' : ''}" style="padding-left:${n.depth * 16}px">${icon} ${n.goal}${how}</div>`;
        }).join('');
        $('labside').innerHTML = `<div class="ptree" id="ptree">${html}</div>`;
        const c = document.querySelector('#ptree .cur'); if (c) W.scrollInto(c);
        const proved = new Set(nodes.filter(n => status.get(n.id) === 'ok').map(n => n.goal));
        labV.draw({ size: spec.size, cells: inferredCells(proved, new Set([cellOf(nodes[cur].goal)].filter(Boolean))) });
      },
    };
  }

  /* ---------- DPLL ---------- */
  function labDPLL(ctx) {
    const kbc = run.kb.clauses(ctx.t);
    const neg = L.toCNF(L.not(ctx.a));
    const order = [...L.symbols(ctx.a)];
    const ev = [];
    let m, capped = false;
    try { m = L.dpll(kbc.concat(neg), { rec: e => ev.push(e), order, maxEvents: 20000 }); }
    catch (e) { capped = true; }
    const { names } = L.encode(kbc.concat(neg), order);
    const st = L.lastStats;
    const txt = e => ({ pure: `pure symbol ${e.sym} = ${e.val}`, unit: `unit clause ⇒ ${e.sym} = ${e.val}`, branch: `branch: try ${e.sym} = ${e.val}`, false: `✗ clause false: ${e.clause ? e.clause.join(' ∨ ') : ''} ⇒ backtrack`, true: `✓ every clause true: model found` }[e.kind]);
    return {
      intro: `<b>DPLL</b> asks whether KB ∧ ¬α is satisfiable (${kbc.length + neg.length} clauses, ${names.length - 1} symbols). If it is <b>unsatisfiable</b>, no world is consistent with the KB and ¬α, so KB ⊨ α. If it finds a model, that model is a counterexample world.`,
      pseudo: L.PSEUDO.dpll, steps: ev.length,
      result: capped ? verdict(null, 'Stopped: too many steps to record.') : verdict(!m, m
        ? `Satisfiable: found a world where the KB holds and α is false ⇒ <b>KB ⊭ α</b>. (${st.unit} unit propagations, ${st.pure} pure symbols, ${st.branches} branches)`
        : `Unsatisfiable ⇒ <b>KB ⊨ α</b>. (${st.unit} unit propagations, ${st.pure} pure symbols, ${st.branches} branch points)`),
      render(j) {
        const e = ev[j];
        labV.draw({ size: spec.size, cells: assignCells(s => { const i = names.indexOf(s); if (i < 1) return undefined; const v = e.assign[i]; return v === 0 ? undefined : v > 0; }, new Set([cellOf(e.sym || '')].filter(Boolean))) });
        lp.highlight([e.line]);
        const lo = Math.max(0, j - 10), hi = Math.min(ev.length, j + 6);
        $('labside').innerHTML = `<div class="proof">${ev.slice(lo, hi).map((x, i) => `<div class="${lo + i === j ? 'cur' : ''}" style="padding-left:${Math.min(x.depth, 40) * 6}px">${lo + i + 1}. ${W.esc(txt(x))}</div>`).join('')}</div>
          <p class="small muted">Indentation = recursion depth. The grid shows the partial model: ? = unassigned.</p>`;
      },
    };
  }

  /* ---------- WalkSAT ---------- */
  let walkSeed = 1;
  const labOpts = { res: 'unit', wp: 0.5, wmax: 2000, cnfsel: null };
  function labWalk(ctx) {
    const kbc = run.kb.clauses(ctx.t);
    const ev = [];
    const p = labOpts.wp, maxFlips = labOpts.wmax;
    const res = L.walksat(kbc, { p, maxFlips, seed: walkSeed, rec: e => ev.push(e) });
    const { names } = L.encode(kbc);
    const unsat = ev.map(e => e.unsat);
    $('labextra').innerHTML = `<div class="row small"><label>p <input id="wp" type="number" step="0.1" min="0" max="1" value="${p}"></label><label>max flips <input id="wmax" type="number" step="500" value="${maxFlips}"></label><button id="wseed">🎲 another random start (seed ${walkSeed})</button></div><div id="spark" style="margin-top:8px"></div>`;
    $('wseed').onclick = () => { walkSeed++; computeLab(); };
    $('wp').onchange = e => { labOpts.wp = +e.target.value; computeLab(); }; $('wmax').onchange = e => { labOpts.wmax = +e.target.value; computeLab(); };
    return {
      intro: `<b>WALKSAT</b> looks for <em>a model of the KB</em>: one complete world consistent with everything the agent has perceived. It starts from a random assignment and flips symbols in unsatisfied clauses. It can't prove entailment, only find worlds. Compare several seeds: whatever is the same in every model is what the KB entails.`,
      pseudo: L.PSEUDO.walksat, steps: ev.length, startAtEnd: true,
      result: verdict(res ? true : null, res ? `Found a model after ${res.flips} flips.` : `No model found within ${maxFlips} flips (WalkSAT can't tell whether one exists).`),
      render(j) {
        const e = ev[j];
        labV.draw({ size: spec.size, cells: assignCells(s => { const i = names.indexOf(s); return i < 1 ? undefined : e.assign[i] > 0; }, new Set([cellOf(e.sym || '')].filter(Boolean))) });
        lp.highlight([e.line]);
        $('spark').innerHTML = W.sparkline(unsat, { marker: j, label: 'unsatisfied clauses per flip' });
        $('labside').innerHTML = `<dl class="kv"><dt>flip</dt><dd>${j}</dd><dt>move</dt><dd>${e.kind === 'random' ? 'random walk' : e.kind === 'greedy' ? 'greedy (max satisfied)' : e.kind}${e.sym ? ` · flipped <b>${e.sym}</b> → ${e.val}` : ''}</dd>${e.clause ? `<dt>clause</dt><dd class="mono small">${W.esc(e.clause.join(' ∨ '))}</dd>` : ''}<dt>unsatisfied</dt><dd>${e.unsat} of ${kbc.length}</dd></dl>`;
      },
    };
  }

  /* ---------- CNF ---------- */
  function labCNF(ctx) {
    const act = run.kb.active(ctx.t).filter(s => s.group !== 'wumpus≤1');
    const opts = [['α', ctx.a], ['¬α', L.not(ctx.a)]].concat(act.map(s => [s.note, s.s]));
    const sel = labOpts.cnfsel != null ? labOpts.cnfsel : Math.max(0, act.findIndex(s => s.group === 'physics') + 2);
    const [, s] = opts[Math.min(sel, opts.length - 1)];
    const steps = L.cnfSteps(s);
    $('labextra').innerHTML = `<label class="small">sentence <select id="cnfsel">${opts.map(([n, x], i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${W.esc(L.show(x))} (${W.esc(n)})</option>`).join('')}</select></label>`;
    $('cnfsel').onchange = e => { labOpts.cnfsel = +e.target.value; computeLab(); };
    const row = (t, v) => `<tr><th>${t}</th><td class="mono">${W.esc(v)}</td></tr>`;
    $('labside').innerHTML = `<table class="data">${row('sentence', L.show(s))}${row('1. eliminate ⇔, ⇒', L.show(steps.elim))}${row('2. move ¬ inwards', L.show(steps.nnf))}${row('3. distribute ∨ over ∧', steps.clauses.map(c => '(' + c.join(' ∨ ') + ')').join(' ∧ ') || 'True')}</table>`;
    const hl = new Set([...L.symbols(s)].map(cellOf).filter(Boolean));
    return { intro: 'Every inference procedure here except forward/backward chaining works on <b>conjunctive normal form</b> (§7.5.2). Pick any sentence of the KB and watch the three rewriting steps.',
      pseudoHtml: '', steps: 1, render() { labV.draw({ size: spec.size, cells: assignCells(() => undefined, hl) }); } };
  }

  /* ================= C. scaling ================= */
  // Location successor-state axiom (7.3) for square [x,y] at time t, converted to CNF.
  function locationAxiomClauses(x, y, n) {
    const Lt = (a, b) => L.sym(`L${a},${b}^t`), F = L.sym('Forward^t');
    const parts = [L.and(Lt(x, y), L.or(L.not(F), L.sym('Bump^t+1')))];
    const from = [[x - 1, y, 'FacingEast'], [x + 1, y, 'FacingWest'], [x, y - 1, 'FacingNorth'], [x, y + 1, 'FacingSouth']];
    for (const [a, b, f] of from) if (W.inside(a, b, n)) parts.push(L.and(Lt(a, b), L.sym(f + '^t'), F));
    return L.toCNF(L.iff(L.sym(`L${x},${y}^t+1`), L.or(...parts))).length;
  }
  function scaling() {
    const rows = [4, 5, 6, 8, 10].map(n => {
      let clauses = 0, axiom = 0;
      for (const [x, y] of W.cells(n)) {
        const nb = W.neighbors(x, y, n);
        clauses += 2 * (nb.length + 1);          // B ⇔ ∨P and S ⇔ ∨W: (deg + 1) clauses each
        axiom += locationAxiomClauses(x, y, n);
      }
      const pairs = n * n * (n * n - 1) / 2;
      clauses += 1 + pairs;
      return `<tr><td>${n}×${n}</td><td class="num">${4 * n * n + 1}</td><td class="num">${clauses.toLocaleString()}</td><td class="num">${axiom.toLocaleString()}</td><td class="num">${(clauses + 100 * axiom).toLocaleString()}</td></tr>`;
    });
    $('scaling').innerHTML = `<table class="data"><tr><th>grid</th><th class="num">symbols (P, W, B, S, Alive)</th><th class="num">CNF clauses: physics + one wumpus</th><th class="num">clauses of the location axiom (7.3), one time step</th><th class="num">total for 100 time steps</th></tr>${rows.join('')}</table>`;
  }

  scaling();
  start();
})();
