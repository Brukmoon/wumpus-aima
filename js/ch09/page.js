(function () {
  'use strict';
  W.topbar('Ch. 9 · Inference in First-Order Logic');
  const $ = id => document.getElementById(id), F = W.FOL;

  let spec, observed, run = null, resSquare = null;
  const grid = new W.GridView($('grid'), { onCellClick: c => onCell(W.key(...c)) });
  const pseudo = new W.Pseudo($('pseudo'));
  const player = new W.Player($('player'), { onStep: i => run && run.render(i) });
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; safeObs(); } });
  const tabs = new W.Tabs($('tabs'), [['unify', 'Unification'], ['fc', 'Forward chaining'], ['bc', 'Backward chaining'], ['res', 'CNF & resolution']], () => setup(), 'ch09.tab');
  spec = wp.spec;
  $('obsGoal').onclick = safeObs;
  $('obsStart').onclick = () => { observed = new Set(['1,1']); setup(); };

  function safeObs() { observed = new Set(W.runEpisode(spec, 'goal').agent.m.visited); setup(); }
  function onCell(k) {
    if (wp.click(W.parse(k))) return;
    if (tabs.cur === 'res' && !observed.has(k)) { resSquare = k; setup(); return; }
    if (k === '1,1') return;
    if (observed.has(k)) observed.delete(k); else if (!spec.pits.includes(k) && spec.wumpus !== k) observed.add(k);
    setup();
  }

  /* ---------- the first-order KB ---------- */
  const RULES = [
    ['NoBreeze(s) ∧ Adjacent(s, r) ⇒ NoPit(r)', 'no breeze ⇒ neighbours pit-free'],
    ['NoStench(s) ∧ Adjacent(s, r) ⇒ NoWumpus(r)', 'no stench ⇒ neighbours wumpus-free'],
    ['Visited(s) ⇒ NoPit(s)', 'survived there'],
    ['Visited(s) ⇒ NoWumpus(s)', 'survived there'],
    ['NoPit(r) ∧ NoWumpus(r) ⇒ Safe(r)', 'definition of Safe'],
  ].map(([t, label]) => { const s = F.parse(t); const pre = s.a.op === 'and' ? s.a.args : [s.a]; return { premises: pre, conclusion: s.b, label, text: t }; });
  function facts() {
    const n = spec.size, out = [];
    for (const [x, y] of W.cells(n)) for (const [a, b] of W.neighbors(x, y, n)) out.push(F.Atom('Adjacent', F.Sq(x, y), F.Sq(a, b)));
    for (const k of observed) {
      const [x, y] = W.parse(k), nb = W.neighbors(x, y, n).map(c => W.key(...c)), sq = F.Sq(x, y);
      out.push(F.Atom('Visited', sq));
      out.push(F.Atom(nb.some(c => spec.pits.includes(c)) ? 'Breeze' : 'NoBreeze', sq));
      out.push(F.Atom(spec.wumpus && (spec.wumpus === k || nb.includes(spec.wumpus)) ? 'Stench' : 'NoStench', sq));
    }
    return out;
  }
  function kbText(fs) {
    const other = fs.filter(f => f.p !== 'Adjacent');
    $('kbtext').innerHTML = RULES.map((r, i) => `<div class="s">R${i + 1}: ${W.esc(r.text)} <span class="note">${W.esc(r.label)}</span></div>`).join('') +
      `<div class="s" style="margin-top:6px">${other.map(F.show).join(', ')}</div><div class="s">+ ${fs.length - other.length} Adjacent(…) facts</div>`;
  }
  const sqOf = t => t && t.f === 'Sq' && t.args[0].c && t.args[1].c ? `${t.args[0].c},${t.args[1].c}` : null;
  function factCells(keys, highlight) {
    const by = new Map();
    for (const k of keys) { const a = F.parse(k); if (!a.args || !a.args.length) continue; const s = sqOf(a.args[a.args.length - 1]); if (!s || a.p === 'Adjacent') continue; if (!by.has(s)) by.set(s, new Set()); by.get(s).add(a.p); }
    const cells = {};
    for (const [x, y] of W.cells(spec.size)) {
      const k = W.key(x, y), f = by.get(k) || new Set(), o = {};
      if (observed.has(k)) { o.fill = 'var(--accent)'; o.alpha = 0.16; o.sub = [f.has('Breeze') && 'B', f.has('Stench') && 'S'].filter(Boolean).join(' ') || '—'; }
      if (f.has('Safe')) { o.label = 'Safe'; o.labelColor = 'var(--safe)'; if (!observed.has(k)) { o.fill = 'var(--safe)'; o.alpha = 0.18; } }
      else if (f.has('NoPit') || f.has('NoWumpus')) { o.label = [f.has('NoPit') && '¬P', f.has('NoWumpus') && '¬W'].filter(Boolean).join(' '); o.labelColor = 'var(--muted)'; }
      if (highlight && highlight.has(k)) o.ring = 'var(--gold)';
      cells[k] = o;
    }
    return cells;
  }
  const draw = (cells, extra) => grid.draw(Object.assign({ size: spec.size, spec, showHazards: true, cells }, extra));

  function setup() {
    const fs = facts(); kbText(fs);
    $('inputs').innerHTML = ''; $('side').innerHTML = ''; $('result').innerHTML = ''; $('msg').textContent = '';
    ({ unify: setupUnify, fc: setupFC, bc: setupBC, res: setupRes })[tabs.cur](fs);
  }

  /* ---------- unification ---------- */
  const UPRE = [
    ['Adjacent(x, [2,1])', 'Adjacent([1,1], y)'],
    ['Adjacent([x,1], [2,y])', 'Adjacent([1,z], [z2,3])'],
    ['At(Agent, s)', 'At(a, Home(a))'],
    ['Knows(John, x)', 'Knows(y, Mother(y))'],
    ['Knows(John, x)', 'Knows(x, Elizabeth)'],
    ['Knows(John, x)', 'Knows(x2, Elizabeth)'],
    ['P(x, F(x))', 'P(F(y), y)'],
    ['Safe([x,y])', 'Safe([2,x])'],
  ];
  let uState = { a: UPRE[0][0], b: UPRE[0][1] };
  function setupUnify() {
    $('intro').innerHTML = '<b>UNIFY(p, q)</b> finds the most general unifier θ with SUBST(θ, p) = SUBST(θ, q). Every lifted inference rule depends on it. Pick an example or type your own atoms.';
    $('inputs').innerHTML = `<label class="small">examples <select id="upre">${UPRE.map(([a, b], i) => `<option value="${i}">${W.esc(a)}  ≟  ${W.esc(b)}</option>`).join('')}</select></label>
      <div class="row" style="margin-top:6px"><input id="ua" type="text" style="flex:1" value="${W.esc(uState.a)}"><span>≟</span><input id="ub" type="text" style="flex:1" value="${W.esc(uState.b)}"><button id="ugo" class="primary">Unify</button></div>`;
    $('upre').onchange = e => { const [a, b] = UPRE[+e.target.value]; uState = { a, b }; setup(); };
    $('ugo').onclick = () => { uState = { a: $('ua').value, b: $('ub').value }; setup(); };
    pseudo.set(F.PSEUDO.unify.lines, F.PSEUDO.unify.caption);
    let A, B;
    try { A = F.parse(uState.a); B = F.parse(uState.b); } catch (e) { $('result').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; player.load(0); return; }
    const ev = [];
    const th = F.unify(A, B, {}, e => ev.push(e));
    ev.push({ line: th ? 'u2' : 'u9', msg: th ? `result θ = ${F.showSubst(F.resolveSubst(th))}` : 'result: failure', theta: th || {}, depth: 0, final: true });
    const hl = new Set();
    if (th) { const s = F.subst(th, A); s.args && s.args.forEach(t => { const k = sqOf(F.substT(th, t)); if (k) hl.add(k); }); }
    $('result').innerHTML = th ? `<div class="callout good">MGU θ = <b class="mono">${W.esc(F.showSubst(F.resolveSubst(th)))}</b><br>SUBST(θ, p) = <span class="mono">${W.esc(F.show(F.subst(F.resolveSubst(th), A)))}</span><br>SUBST(θ, q) = <span class="mono">${W.esc(F.show(F.subst(F.resolveSubst(th), B)))}</span></div>` : '<div class="callout bad">No unifier exists.</div>';
    run = { render(i) {
      const e = ev[i];
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      $('side').innerHTML = `<div class="proof">${ev.slice(0, i + 1).map((x, j) => `<div class="${j === i ? 'cur' : ''}" style="padding-left:${x.depth * 14}px">${W.esc(x.msg)}</div>`).join('')}</div><p class="small">θ so far: <span class="mono">${W.esc(F.showSubst(e.theta))}</span></p>`;
      draw(factCells([], hl));
    } };
    player.load(ev.length);
  }

  /* ---------- forward chaining ---------- */
  let fcQuery = '';
  function setupFC(fs) {
    $('intro').innerHTML = '<b>FOL-FC-ASK</b> repeatedly matches every rule\'s premises against the known facts (finding every θ), adds the new conclusions, and stops at a fixed point. Leave the query empty to derive everything, or give one (e.g. Safe([2,2]) or Safe(x)) to stop as soon as it is derived.';
    $('inputs').innerHTML = `<div class="row"><label class="small">query α <input id="fq" type="text" value="${W.esc(fcQuery)}" placeholder="(empty: run to fixed point)"></label><button id="fgo">Run</button></div>`;
    $('fgo').onclick = () => { fcQuery = $('fq').value.trim(); setup(); };
    pseudo.set(F.PSEUDO.fc.lines, F.PSEUDO.fc.caption);
    let q = null;
    try { q = fcQuery ? F.parse(fcQuery) : null; } catch (e) { $('result').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; return; }
    const r = F.forwardChain(RULES, fs, { query: q });
    const derived = [...r.known.keys()].length - fs.length;
    $('result').innerHTML = q ? (r.answer ? `<div class="callout good">Query answered: θ = <b class="mono">${W.esc(F.showSubst(r.answer))}</b></div>` : '<div class="callout bad">Fixed point reached without deriving the query.</div>') : `<div class="callout">Fixed point: ${derived} new facts derived in ${r.ev[r.ev.length - 1].round} rounds.</div>`;
    run = { render(i) {
      const e = r.ev[i];
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      const fa = e.fact ? F.parse(e.fact) : null, hl = new Set();
      if (fa) fa.args.forEach(t => { const k = sqOf(t); if (k) hl.add(k); });
      draw(factCells(e.known, hl));
      const infs = r.ev.slice(0, i + 1).filter(x => x.kind === 'infer');
      $('side').innerHTML = `<div class="proof">${infs.slice(-40).map(x => `<div class="${x === e ? 'cur' : ''}">[round ${x.round}] ${W.esc(x.fact)} <span class="muted">R${x.rule + 1} ${W.esc(F.showSubst(F.resolveSubst(x.theta)))}</span></div>`).join('') || '<span class="muted">nothing derived yet</span>'}</div>`;
      const c = $('side').querySelector('.cur'); if (c) W.scrollInto(c);
    } };
    player.load(r.ev.length);
  }

  /* ---------- backward chaining ---------- */
  let bcQuery = 'Safe(x)';
  function setupBC(fs) {
    $('intro').innerHTML = '<b>FOL-BC-ASK</b> works backward from the query. For each rule whose conclusion unifies with the goal, it proves the premises left to right, carrying θ along. It is a generator: with a variable in the query (Safe(x)) it yields <em>every</em> answer. This is how Prolog works.';
    $('inputs').innerHTML = `<div class="row"><label class="small">query <input id="bq" type="text" value="${W.esc(bcQuery)}"></label><button id="bgo">Run</button></div>`;
    $('bgo').onclick = () => { bcQuery = $('bq').value.trim() || 'Safe(x)'; setup(); };
    pseudo.set(F.PSEUDO.bc.lines, F.PSEUDO.bc.caption);
    let q;
    try { q = F.parse(bcQuery); } catch (e) { $('result').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; return; }
    const r = F.backwardChain(RULES, fs, q);
    const ansSq = new Set(r.answers.map(a => { const x = F.parse(a.atom); return sqOf(x.args[x.args.length - 1]); }).filter(Boolean));
    $('result').innerHTML = `<div class="callout ${r.answers.length ? 'good' : 'bad'}">${r.answers.length ? `${r.answers.length} answer(s): ${r.answers.map(a => `<span class="mono">${W.esc(a.atom)}</span>`).join(', ')}` : 'No answers: the query is not entailed by these definite clauses.'}</div>`;
    const icon = { goal: '?', rule: '⇐', yield: '<span class="ok">✓</span>', fail: '<span class="bad">✗</span>', answer: '★', cap: '…' };
    run = { render(i) {
      const e = r.ev[i];
      pseudo.highlight([e.line]);
      $('msg').textContent = e.msg;
      const lo = Math.max(0, i - 30);
      $('side').innerHTML = `<div class="ptree">${r.ev.slice(lo, i + 1).map((x, j) => `<div class="${lo + j === i ? 'cur' : ''}" style="padding-left:${Math.min(x.depth, 12) * 14}px">${icon[x.kind] || ''} ${W.esc(x.msg)}</div>`).join('')}</div>`;
      const c = $('side').querySelector('.cur'); if (c) W.scrollInto(c);
      const shown = new Set(r.ev.slice(0, i + 1).filter(x => x.kind === 'answer').map(x => { const a = F.parse(x.goal); return sqOf(a.args[a.args.length - 1]); }).filter(Boolean));
      const cur = e.goal ? (() => { try { const a = F.parse(e.goal); return sqOf(a.args[a.args.length - 1]); } catch (err) { return null; } })() : null;
      const cells = factCells([]);
      for (const k of shown) Object.assign(cells[k], { label: '★ answer', labelColor: 'var(--safe)', fill: 'var(--safe)', alpha: 0.2 });
      if (cur) cells[cur].ring = 'var(--gold)';
      draw(cells);
    } };
    player.load(r.ev.length);
  }

  /* ---------- CNF & resolution ---------- */
  const AXIOMS = ['∀s Breezy(s) ⇔ ∃r Adjacent(r, s) ∧ Pit(r)', '∀s Smelly(s) ⇔ At(Wumpus, s) ∨ ∃r Adjacent(r, s) ∧ At(Wumpus, r)', '∀x (∀y Animal(y) ⇒ Loves(x, y)) ⇒ ∃y Loves(y, x)'];
  let cnfSel = 0;
  function setupRes(fs) {
    $('intro').innerHTML = 'Resolution needs <b>CNF</b>. In first-order logic that takes six steps, including <b>Skolemization</b>: an ∃ inside a ∀ becomes a function of the universal variables. Then the KB (the CNF of the breeze axiom plus ground facts) proves ¬Pit(s) by refutation. The negated goal Pit(s) is the set of support. Click an unobserved square to choose s.';
    $('inputs').innerHTML = `<label class="small">sentence for the CNF steps <select id="cs">${AXIOMS.map((a, i) => `<option value="${i}" ${i === cnfSel ? 'selected' : ''}>${W.esc(a)}</option>`).join('')}</select></label><div id="cnfsteps" style="margin-top:8px"></div>`;
    $('cs').onchange = e => { cnfSel = +e.target.value; setup(); };
    const st = F.cnfSteps(F.parse(AXIOMS[cnfSel]));
    $('cnfsteps').innerHTML = `<table class="data">${st.steps.map(([t, v]) => `<tr><th style="white-space:nowrap">${W.esc(t)}</th><td class="mono small">${W.esc(v)}</td></tr>`).join('')}</table>`;
    $('pseudo').innerHTML = '';
    // resolution KB: CNF of the breeze axiom + Breezy/¬Breezy facts + Adjacent facts
    const kb = F.cnfSteps(F.parse(AXIOMS[0])).clauses;
    for (const f of fs) {
      if (f.p === 'Adjacent') kb.push([{ neg: false, atom: f }]);
      if (f.p === 'Breeze') kb.push([{ neg: false, atom: F.Atom('Breezy', f.args[0]) }]);
      if (f.p === 'NoBreeze') kb.push([{ neg: true, atom: F.Atom('Breezy', f.args[0]) }]);
    }
    const cand = W.cells(spec.size).map(c => W.key(...c)).filter(k => !observed.has(k));
    if (!resSquare || observed.has(resSquare)) {
      // default to a square where ¬Pit is actually provable (forward chaining derived NoPit), so the first view shows a proof
      const fc = F.forwardChain(RULES, fs);
      resSquare = cand.find(k => fc.known.has(`NoPit([${k}])`)) || cand.find(k => W.neighbors(...W.parse(k), spec.size).some(c => observed.has(W.key(...c)))) || cand[0];
    }
    if (!resSquare) { $('result').innerHTML = '<div class="callout">Every square is observed.</div>'; player.load(0); return; }
    const goal = F.Atom('Pit', F.sqKey(resSquare));
    const r = F.resolution(kb, [[{ neg: false, atom: goal }]], { cap: 800 });
    if (!r.proved) {
      $('result').innerHTML = `<div class="callout bad">Could not derive □: ¬Pit([${resSquare}]) is ${r.capped ? 'not proved within the clause limit' : 'not entailed'} (${r.all.length} clauses generated). Choose a square next to a breeze-free observed square.</div>`;
      $('side').innerHTML = ''; draw(factCells([], new Set([resSquare]))); player.load(0); return;
    }
    const proof = r.proof;
    $('result').innerHTML = `<div class="callout good">Refutation found: KB ∧ Pit([${resSquare}]) ⊢ □, so KB ⊨ ¬Pit([${resSquare}]). ${r.all.length - kb.length - 1} resolvents generated, ${proof.length} used.</div>`;
    run = { render(i) {
      const n = r.all[proof[i]];
      $('msg').textContent = n.parents ? `resolve (${proof.indexOf(n.parents[0]) + 1}) with (${proof.indexOf(n.parents[1]) + 1}), θ = ${F.showSubst(n.theta)}` : (n.sos ? 'negated goal (set of support)' : 'from the KB');
      $('side').innerHTML = `<div class="proof">${proof.map((id, j) => { const m = r.all[id]; return `<div class="${j === i ? 'cur' : ''} ${m.parents ? '' : 'in'}">(${j + 1}) ${W.esc(F.showClause(m.c))} <span class="muted">${m.parents ? `← (${proof.indexOf(m.parents[0]) + 1}),(${proof.indexOf(m.parents[1]) + 1}) ${W.esc(F.showSubst(m.theta))}` : m.sos ? '¬goal' : 'KB'}</span></div>`; }).join('')}</div>`;
      const hl = new Set([resSquare]);
      n.c.forEach(l => l.atom.args.forEach(t => { const k = sqOf(t); if (k) hl.add(k); }));
      draw(factCells([], hl));
    } };
    player.load(proof.length, proof.length - 1);
  }

  safeObs();
})();
