(function () {
  'use strict';
  W.topbar('Ch. 8 · First-Order Logic');
  const $ = id => document.getElementById(id), F = W.FOL;
  const NUMVARS = /^[xyabij]\d*$/;

  let spec, agentAt = '1,1', M, steps = [];
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (wp.click(c)) return; agentAt = W.key(...c); build(); evaluate(); } });
  const player = new W.Player($('player'), { onStep: i => showStep(i) });
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; build(); evaluate(); grounding(); } });
  spec = wp.spec;

  const PRESETS = [
    ['∀s Breezy(s) ⇔ ∃r Adjacent(r, s) ∧ Pit(r)', 'axiom: breezes come from adjacent pits (§8.4)'],
    ['∀s Smelly(s) ⇔ At(Wumpus, s) ∨ ∃r Adjacent(r, s) ∧ At(Wumpus, r)', 'axiom: the stench (4e: also in the wumpus square)'],
    ['∀s,r Adjacent(s, r) ⇒ Adjacent(r, s)', 'adjacency is symmetric'],
    ['∀x,y,a,b Adjacent([x,y], [a,b]) ⇔ (x = a ∧ (y = b − 1 ∨ y = b + 1)) ∨ (y = b ∧ (x = a − 1 ∨ x = a + 1))', 'the book\'s definition of Adjacent'],
    ['∃s Pit(s) ∧ Adjacent(s, [1,1])', 'is there a pit next to the start?'],
    ['∀s Pit(s) ⇒ ∃r Adjacent(r, s) ∧ Breezy(r)', 'every pit makes some neighbour breezy'],
    ['∃s At(Wumpus, s) ∧ ∀r At(Wumpus, r) ⇒ r = s', 'there is exactly one wumpus'],
    ['Adjacent(Home(Wumpus), Home(Agent))', 'is the agent next to the wumpus? (function terms)'],
    ['∃s Breezy(s) ∧ Smelly(s)', 'a square that is both breezy and smelly'],
    ['∀s Safe(s) ⇔ ¬Pit(s) ∧ ¬At(Wumpus, s)', 'definition of Safe'],
    ['∀s Pit(s) ∧ Adjacent(s, [1,1])', 'common mistake: ∀ with ∧'],
    ['∃s Pit(s) ⇒ Adjacent(s, [4,4])', 'common mistake: ∃ with ⇒'],
  ];
  $('preset').innerHTML = PRESETS.map(([s, d], i) => `<option value="${i}">${W.esc(d)}</option>`).join('');
  $('preset').onchange = () => { $('sent').value = PRESETS[+$('preset').value][0]; evaluate(); };
  $('sent').value = PRESETS[0][0];
  $('eval').onclick = evaluate;
  $('sent').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); evaluate(); } });

  function build() {
    const n = spec.size, pits = new Set(spec.pits);
    const squares = W.cells(n).map(c => W.key(...c)), nums = Array.from({ length: n }, (_, i) => i + 1);
    const isSq = s => typeof s === 'string' && /^\d+,\d+$/.test(s);
    const adj = (a, b) => isSq(a) && isSq(b) && W.manhattan(W.parse(a), W.parse(b)) === 1;
    const home = { Agent: agentAt, Wumpus: spec.wumpus, Gold: spec.gold };
    M = {
      n, squares, nums, domain: squares,
      consts: {},
      preds: {
        Pit: s => pits.has(s),
        Breezy: s => isSq(s) && squares.some(r => adj(r, s) && pits.has(r)),
        Smelly: s => isSq(s) && !!spec.wumpus && (s === spec.wumpus || adj(s, spec.wumpus)),
        Glitters: s => s === spec.gold,
        Adjacent: adj,
        At: (o, s) => home[o] === s,
        Safe: s => isSq(s) && !pits.has(s) && s !== spec.wumpus,
        Square: isSq,
      },
      funcs: { Home: o => home[o] || 'none' },
    };
    const ext1 = p => squares.filter(s => M.preds[p](s)).map(s => `[${s}]`).join(', ') || '∅';
    const adjPairs = squares.flatMap(a => squares.filter(b => adj(a, b)).map(b => `⟨[${a}],[${b}]⟩`));
    $('interp').innerHTML = `
      <div><b>Domain</b>: the ${squares.length} squares [1,1]…[${n},${n}], the objects Agent, Wumpus, Gold, and the numbers 1…${n}</div>
      <div style="margin-top:6px"><b>Pit</b> = { ${ext1('Pit')} }</div>
      <div><b>Breezy</b> = { ${ext1('Breezy')} }</div>
      <div><b>Smelly</b> = { ${ext1('Smelly')} }</div>
      <div><b>Glitters</b> = { ${ext1('Glitters')} }</div>
      <div><b>Safe</b> = { ${ext1('Safe')} }</div>
      <div><b>At</b> = { ⟨Agent,[${agentAt}]⟩, ⟨Wumpus,[${spec.wumpus}]⟩, ⟨Gold,[${spec.gold}]⟩ }</div>
      <div><b>Home</b>: Agent ↦ [${agentAt}], Wumpus ↦ [${spec.wumpus}], Gold ↦ [${spec.gold}]</div>
      <details><summary><b>Adjacent</b>: ${adjPairs.length} ordered pairs</summary><div style="white-space:normal">${adjPairs.join(' ')}</div></details>`;
  }

  // quantified variables take values from their sort
  function domainFor(v) { return NUMVARS.test(v) ? M.nums : M.squares; }
  function evalSorted(s, env = {}) {
    const Ms = Object.create(M);
    const ev = (x, e) => {
      if (x.op === 'all') return domainFor(x.v).every(d => ev(x.body, Object.assign({}, e, { [x.v]: d })));
      if (x.op === 'ex') return domainFor(x.v).some(d => ev(x.body, Object.assign({}, e, { [x.v]: d })));
      if (x.op === 'not') return !ev(x.a, e);
      if (x.op === 'and') return x.args.every(a => ev(a, e));
      if (x.op === 'or') return x.args.some(a => ev(a, e));
      if (x.op === 'imp') return !ev(x.a, e) || ev(x.b, e);
      if (x.op === 'iff') return ev(x.a, e) === ev(x.b, e);
      return F.evaluate(x, Ms, e);
    };
    return ev(s, env);
  }

  function drawGrid(highlight) {
    const cells = {};
    for (const [k, label] of highlight || []) cells[k] = Object.assign(cells[k] || {}, { ring: 'var(--gold)', label: (cells[k] && cells[k].label ? cells[k].label + ' ' : '') + label, labelColor: 'var(--gold)', labelSize: 14 });
    const [ax, ay] = W.parse(agentAt);
    grid.draw({ size: spec.size, spec, showHazards: true, showPercepts: true, cells, agent: { x: ax, y: ay, dir: 'E' } });
  }

  function evaluate() {
    let s;
    try { s = F.parse($('sent').value); }
    catch (e) { $('result').innerHTML = `<div class="callout bad">Parse error: ${W.esc(e.message)}</div>`; steps = []; player.load(0); drawGrid(); return; }
    try {
      const free = [...F.freeVars(s)];
      if (free.length) throw new Error(`free variable(s) ${free.join(', ')}: quantify them`);
      const val = evalSorted(s);
      // step through the top-level quantifier block
      let q = null, vars = [], body = s;
      if (s.op === 'all' || s.op === 'ex') { q = s.op; while (body.op === q) { vars.push(body.v); body = body.body; } }
      steps = [];
      if (q) {
        const combos = [[]];
        for (const v of vars) { const next = []; for (const c of combos) for (const d of domainFor(v)) next.push(c.concat([d])); combos.length = 0; combos.push(...next); if (combos.length > 5000) break; }
        for (const c of combos.slice(0, 5000)) { const env = Object.fromEntries(vars.map((v, i) => [v, c[i]])); steps.push({ env, v: evalSorted(body, env) }); }
      }
      const shown = F.show(s);
      let expl = '';
      if (q === 'all') { const bad = steps.filter(x => !x.v); expl = bad.length ? `${bad.length} of ${steps.length} bindings make the body false (counterexamples). One is enough to make ∀ false.` : `The body is true for all ${steps.length} bindings.`; }
      if (q === 'ex') { const good = steps.filter(x => x.v); expl = good.length ? `${good.length} of ${steps.length} bindings make the body true (witnesses). One is enough for ∃.` : `No binding among ${steps.length} makes the body true.`; }
      $('result').innerHTML = `<div class="callout ${val ? 'good' : 'bad'}"><span class="mono">${W.esc(shown)}</span> is <b>${val ? 'TRUE' : 'FALSE'}</b> in this model. ${expl}</div>`;
      if (steps.length) {
        const first = steps.findIndex(x => q === 'all' ? !x.v : x.v);
        player.load(steps.length, first >= 0 ? first : 0);
      } else { player.load(0); $('msg').textContent = 'No top-level quantifier: the sentence is evaluated directly.'; $('bindings').innerHTML = ''; drawGrid(); }
      renderBindings(q, vars, body);
    } catch (e) { $('result').innerHTML = `<div class="callout bad">${W.esc(e.message)}</div>`; steps = []; player.load(0); drawGrid(); }
  }
  let ctx = null;
  function renderBindings(q, vars, body) { ctx = { q, vars, body }; if (steps.length) showStep(player.i); }
  function showStep(i) {
    if (!ctx || !steps[i]) return;
    const st = steps[i], hl = [];
    for (const v of ctx.vars) if (!NUMVARS.test(v)) hl.push([st.env[v], v]);
    drawGrid(hl);
    const b = ctx.vars.map(v => `${v} = ${NUMVARS.test(v) ? st.env[v] : '[' + st.env[v] + ']'}`).join(', ');
    $('msg').innerHTML = `Binding ${i + 1} of ${steps.length}: ${W.esc(b)} → body is <span class="${st.v ? 'pill good' : 'pill bad'}">${st.v}</span>`;
    const inst = F.show(F.subst(Object.fromEntries(ctx.vars.map(v => [v, NUMVARS.test(v) ? F.C(st.env[v]) : F.sqKey(st.env[v])])), ctx.body));
    const good = steps.filter(x => x.v).length;
    $('bindings').innerHTML = `<div class="mono">${W.esc(inst)}</div><div class="strip" style="margin-top:8px">${steps.map((x, j) => `<span data-j="${j}" class="${x.v ? 'good' : 'bad'} ${j === i ? 'cur' : ''}" title="${W.esc(ctx.vars.map(v => st && v + '=' + x.env[v]).join(' '))}"></span>`).join('')}</div><div class="muted" style="margin-top:4px">green = body true (${good}), red = body false (${steps.length - good}). Click a square to jump.</div>`;
    $('bindings').querySelector('.strip').onclick = e => { const d = e.target.closest('[data-j]'); if (d) player.go(+d.dataset.j); };
  }

  /* ---------- grounding ---------- */
  const GAXIOMS = [
    ['∀s Breezy(s) ⇔ ∃r Adjacent(r, s) ∧ Pit(r)', 'Breezy', 'Pit', false],
    ['∀s Smelly(s) ⇔ At(Wumpus, s) ∨ ∃r Adjacent(r, s) ∧ At(Wumpus, r)', 'Smelly', 'W', true],
  ];
  $('gaxiom').innerHTML = GAXIOMS.map(([s], i) => `<option value="${i}">${W.esc(s)}</option>`).join('');
  $('gaxiom').onchange = grounding;
  function grounding() {
    const [s, lhs, rhs, self] = GAXIOMS[+$('gaxiom').value], n = spec.size, squares = W.cells(n).map(c => W.key(...c));
    const rows = squares.map(k => {
      const [x, y] = W.parse(k);
      const nb = W.neighbors(x, y, n).map(c => W.key(...c));
      const raw = squares.map(r => `(Adjacent([${r}],[${k}]) ∧ ${rhs === 'W' ? `At(Wumpus,[${r}])` : `Pit([${r}])`})`);
      const simp = (self ? [k] : []).concat(nb).map(r => (rhs === 'W' ? 'W' : 'P') + r).join(' ∨ ');
      return { k, raw: raw.length, simp: `${lhs === 'Breezy' ? 'B' : 'S'}${k} ⇔ ${simp}` };
    });
    $('ground').innerHTML = `<table class="data"><tr><th>FOL</th><td class="mono">${W.esc(s)}</td></tr>
      <tr><th>ground instances</th><td>${squares.length} (one per square s), each with a disjunction over all ${squares.length} values of r before simplification: ${squares.length * squares.length} conjuncts</td></tr>
      <tr><th>after evaluating Adjacent</th><td class="mono">${rows.slice(0, 6).map(r => W.esc(r.simp)).join('<br>')}<br>… ${rows.length - 6} more</td></tr></table>`;
  }

  build(); evaluate(); grounding();
})();
