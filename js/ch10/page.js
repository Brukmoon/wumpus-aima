(function () {
  'use strict';
  W.topbar('Ch. 10 · Knowledge Representation');
  const $ = id => document.getElementById(id);

  let spec, grid, player, run = null;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; setup(); } });
  spec = wp.spec;
  const tabs = new W.Tabs($('tabs'), [['onto', 'Categories & inheritance'], ['events', 'Events & time'], ['tms', 'Defaults & truth maintenance'], ['know', 'Knowledge vs truth']], () => setup(), 'ch10.tab');

  function layout(rightHtml, withPlayer) {
    $('content').innerHTML = `<div class="grid2"><div class="panel"><div id="grid"></div><div class="legend" id="legend"></div></div><div class="panel stack" id="right">${rightHtml}</div></div>` +
      (withPlayer ? '<div id="player" style="margin-top:16px"></div><div class="panel" style="margin-top:16px" id="below"></div>' : '<div class="panel" style="margin-top:16px" id="below"></div>');
    grid = new W.GridView($('grid'), { onCellClick: c => onCell && onCell(W.key(...c)) });
    if (withPlayer) { if (player) { player.pause(); player.disabledKeys = true; } player = new W.Player($('player'), { onStep: i => run && run.render(i) }); }
  }
  let onCell = null;
  function setup() { onCell = null; run = null; ({ onto: setupOnto, events: setupEvents, tms: setupTMS, know: setupKnow })[tabs.cur](); }

  /* ================= ontology ================= */
  let selCat = 'Hazard';
  function setupOnto() {
    $('intro').innerHTML = '<b>Categories</b> organize knowledge (§10.2): Pit ⊂ Hazard ⊂ PhysicalObject ⊂ Thing. A property stated once for a category is <b>inherited</b> by every subcategory and member. Click a category to see its members in this world and where each of its properties comes from.';
    const O = W.ontology(spec);
    layout('<h3>Taxonomy</h3><div id="tax" class="ptree" style="max-height:420px"></div><div id="catinfo"></div>');
    onCell = k => { if (wp.click(W.parse(k))) return; };
    const render = () => {
      const tree = (id, d) => { const c = O.byId.get(id); return `<div data-c="${id}" style="padding-left:${d * 16}px;cursor:pointer" class="${id === selCat ? 'cur' : ''}">${c.children.length ? '▾' : '·'} ${id} <span class="muted">(${O.allMembers(id).length})</span></div>` + c.children.map(ch => tree(ch, d + 1)).join(''); };
      $('tax').innerHTML = tree('Thing', 0);
      $('tax').onclick = e => { const d = e.target.closest('[data-c]'); if (d) { selCat = d.dataset.c; render(); } };
      const chain = O.chain(selCat), mem = O.allMembers(selCat);
      const props = chain.flatMap(c => c.props.map(p => ({ p, from: c.id })));
      $('catinfo').innerHTML = `<h3 style="margin-top:10px">${selCat}</h3>
        <p class="mono small">${chain.map(c => c.id).join(' ⊂ ')}</p>
        <table class="data"><tr><th>property</th><th>inherited from</th></tr>${props.map(x => `<tr><td>${W.esc(x.p)}</td><td>${x.from === selCat ? '<i>stated here</i>' : x.from}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">none</td></tr>'}</table>
        <p class="small" style="margin-top:8px"><b>Members in this world:</b> ${mem.map(m => W.esc(m.label)).join(', ') || '<span class="muted">none</span>'}</p>`;
      const cells = {};
      for (const m of mem) if (m.at) cells[m.at] = Object.assign(cells[m.at] || {}, { ring: 'var(--gold)', label: '∈ ' + selCat, labelColor: 'var(--gold)' });
      grid.draw({ size: spec.size, spec, showHazards: true, cells, agent: { x: 1, y: 1, dir: 'E' } });
      const fol = [];
      for (let c = O.byId.get(selCat); c && c.parent; c = O.byId.get(c.parent)) fol.push(`${c.id} ⊂ ${c.parent}`);
      O.byId.get(selCat).props.forEach(p => fol.push(`∀x x ∈ ${selCat} ⇒ ${p.replace(/\s*\(.*\)$/, '')}`));
      $('below').innerHTML = `<h3>As first-order sentences (reifying categories as objects)</h3><div class="mono small">${fol.map(W.esc).join('<br>') || '—'}</div>
        <p class="small muted" style="margin-top:8px">Membership: ${mem.slice(0, 6).map(m => W.esc(m.label) + ' ∈ ' + selCat).join(', ')}${mem.length > 6 ? ', …' : ''}. Subcategories inherit because x ∈ Pit ∧ Pit ⊂ Hazard ⇒ x ∈ Hazard.</p>`;
    };
    render();
  }

  /* ================= event calculus ================= */
  function setupEvents() {
    $('intro').innerHTML = '<b>Event calculus</b> (§10.3) reifies events and fluents. An event (an action) at time t <b>Initiates</b> some fluents and <b>Terminates</b> others. A fluent holds at t₂ if some earlier event initiated it and nothing has <b>Clipped</b> it since. The timeline below is a real episode of Chapter 7\'s hybrid agent in this world.';
    layout('<h3>At the selected time</h3><div id="holds"></div>', true);
    const ep = W.runHybrid(spec, 150).steps;
    const ec = W.eventCalculus(ep);
    const n = spec.size, A = 6, Fl = n * n + 4 + 5;
    $('below').innerHTML = `<h3>Timeline: fluents (rows) over time (columns)</h3><div id="tl" class="scroll"></div>
      <h3 style="margin-top:14px">Why this matters: the frame problem (§10.3)</h3>
      <table class="data" style="max-width:720px"><tr><th>approach</th><th class="num">axioms for this ${n}×${n} world</th></tr>
      <tr><td>naive frame axioms: one per (action, fluent) pair saying the fluent is <em>unchanged</em></td><td class="num">${A} × ${Fl} = ${A * Fl}</td></tr>
      <tr><td>successor-state axioms: one per fluent (Ch. 7, §7.7.1)</td><td class="num">${Fl}</td></tr>
      <tr><td>event calculus: Initiates/Terminates only for what an event <em>changes</em></td><td class="num">≈ ${2 * A + n * n} effect axioms</td></tr></table>
      <p class="mono small" style="margin-top:8px">T(f, t₂) ⇔ ∃e, t Happens(e, t) ∧ Initiates(e, f, t) ∧ (t &lt; t₂) ∧ ¬Clipped(f, t, t₂)<br>Clipped(f, t, t₂) ⇔ ∃e, t₁ Happens(e, t₁) ∧ Terminates(e, f, t₁) ∧ (t &lt; t₁) ∧ (t₁ &lt; t₂)</p>`;
    const drawTL = t => {
      const C = 22, H = 18, left = 170, w = left + ec.T * C + 10, h = (ec.fluents.length + 1) * H + 24;
      let s = `<svg width="${w}" height="${h}" font-family="Segoe UI, system-ui, sans-serif" font-size="11">`;
      ec.events.forEach((e, i) => { if (e) s += `<text x="${left + i * C + C / 2}" y="12" text-anchor="middle" style="fill:var(--muted)">${{ Forward: 'F', TurnLeft: 'L', TurnRight: 'R', Grab: 'G', Shoot: 'S', Climb: 'C' }[e.e]}</text>`; });
      ec.fluents.forEach((f, r) => {
        const y = 20 + r * H;
        s += `<text x="4" y="${y + 12}" style="fill:var(--ink)">${W.esc(f)}</text>`;
        let startRun = null;
        for (let i = 0; i <= ec.T; i++) {
          const on = i < ec.T && ec.holds[i].has(f);
          if (on && startRun == null) startRun = i;
          if (!on && startRun != null) { s += `<rect x="${left + startRun * C + 1}" y="${y + 2}" width="${(i - startRun) * C - 2}" height="${H - 5}" rx="3" style="fill:${f.startsWith('At') ? 'var(--accent)' : f.includes('Wumpus') ? 'var(--wumpus)' : f.startsWith('HaveGold') ? 'var(--gold)' : 'var(--frontier)'};opacity:.75"/>`; startRun = null; }
        }
      });
      s += `<line x1="${left + t * C + C / 2}" y1="14" x2="${left + t * C + C / 2}" y2="${h}" style="stroke:var(--gold);stroke-width:2"/>`;
      s += `<text x="${left - 4}" y="12" text-anchor="end" style="fill:var(--muted)">event →</text></svg>`;
      $('tl').innerHTML = s;
    };
    run = { render(t) {
      const st = ep[t].state;
      grid.draw({ size: spec.size, spec, showHazards: true, wumpusAlive: st.wumpusAlive, goldTaken: st.goldTaken, agent: st.climbed ? null : st });
      drawTL(t);
      const e = ec.events[t];
      $('holds').innerHTML = `<p class="small"><b>t = ${t}</b>${e ? ` · Happens(${e.e}, ${t})` : ' · (end of episode)'}</p>
        <div class="small"><b>HoldsAt(f, ${t}):</b></div><div class="mono small">${[...ec.holds[t]].map(W.esc).join('<br>')}</div>
        ${e ? `<div class="small" style="margin-top:8px"><b>Initiates(${e.e}, f, ${t}):</b> <span class="mono">${e.init.map(W.esc).join(', ') || '—'}</span></div>
        <div class="small"><b>Terminates(${e.e}, f, ${t}):</b> <span class="mono">${e.term.map(W.esc).join(', ') || '—'}</span></div>
        <p class="small muted">Everything else carries over unchanged. That's the frame problem, solved by <em>only</em> talking about what changes.</p>` : ''}`;
    } };
    player.load(ec.T);
  }

  /* ================= JTMS ================= */
  let tmsSel = null;
  function setupTMS() {
    $('intro').innerHTML = '<b>Default reasoning</b> (§10.6). This agent has a treasure map: it knows where the gold is but not where the hazards are. By <em>default</em> it assumes any square is safe unless there is a reason to suspect it. A <b>justification-based truth maintenance system</b> labels every belief IN or OUT. When a percept makes a square suspicious, AssumedSafe for that square goes OUT, and so does every route that depended on it. The agent only <em>steps</em> onto proved-safe squares: defaults are for planning.';
    layout('<h3>Belief revision at this step</h3><div id="changes"></div><h3 style="margin-top:10px">Why? <span class="hint">click a square</span></h3><div id="why" class="small"></div>', true);
    $('legend').innerHTML = '<span style="--c:var(--safe)">OK: proved Safe</span><span style="--c:var(--muted)">ok?: AssumedSafe (default)</span><span style="--c:var(--maybe)">P? / W?: suspected</span><span style="--c:var(--frontier)">current route</span>';
    const steps = W.tmsRun(spec);
    onCell = k => { if (wp.click(W.parse(k))) return; tmsSel = k; run.render(player.i); };
    run = { render(i) {
      const s = steps[i], L = s.labels, cells = {};
      for (const [x, y] of W.cells(spec.size)) {
        const k = W.key(x, y), o = {}, isIn = n => L.get(n) && L.get(n).in;
        if (s.visited.has(k)) { o.fill = 'var(--accent)'; o.alpha = 0.16; }
        else if (isIn(`Safe(${k})`)) { o.label = 'OK'; o.labelColor = 'var(--safe)'; o.fill = 'var(--safe)'; o.alpha = 0.16; }
        else if (isIn(`AssumedSafe(${k})`)) { o.label = 'ok?'; o.labelColor = 'var(--muted)'; }
        else { o.label = [isIn(`PitSuspected(${k})`) && 'P?', isIn(`WumpusSuspected(${k})`) && 'W?'].filter(Boolean).join(' '); o.labelColor = 'var(--maybe)'; o.fill = 'var(--maybe)'; o.alpha = 0.12; }
        if (s.changes.some(c => c.defeated && c.node.endsWith(`(${k})`))) o.ring = 'var(--danger)';
        if (k === tmsSel) o.ring = 'var(--gold)';
        cells[k] = o;
      }
      const [ax, ay] = W.parse(s.at);
      grid.draw({ size: spec.size, spec: $('rev') && !$('rev').checked ? { pits: [], wumpus: null, gold: spec.gold } : spec, showHazards: true, cells,
        paths: [{ pts: [s.at].concat(s.route).map(W.parse), color: 'var(--frontier)', width: 3 }], agent: { x: ax, y: ay, dir: 'E', hasGold: s.gotGold } });
      $('changes').innerHTML = `<p class="small">${W.esc(s.why)}${s.done ? ` <b>Done: ${W.esc(s.done)}.</b>` : ''}</p>` + (s.changes.length ? `<div class="proof">${s.changes.map(c => `<div>${c.confirmed ? '<b class="ok">✓ confirmed</b>' : c.defeated ? '<b class="bad">✗ default defeated</b>' : `<b class="${c.to ? 'ok' : 'bad'}">${c.to ? 'OUT → IN' : 'IN → OUT'}</b>`} ${W.esc(c.node)} <span class="muted">${W.esc(c.why)}</span></div>`).join('')}</div>` : '<p class="small muted">No labels changed at this step.</p>');
      const k = tmsSel || s.route[s.route.length - 1] || s.at;
      $('why').innerHTML = ['Safe', 'NoPit', 'NoWumpus', 'PitSuspected', 'WumpusSuspected', 'AssumedSafe'].map(p => { const v = L.get(`${p}(${k})`); return v ? `<div><span class="pill ${v.in ? 'good' : ''}">${v.in ? 'IN' : 'OUT'}</span> <span class="mono">${p}(${k})</span> <span class="muted">${W.esc(v.why)}</span></div>` : ''; }).join('');
    } };
    $('below').innerHTML = `<label class="small"><input type="checkbox" id="rev" checked> show the true hazards</label>
      <p class="small muted" style="margin-top:8px">Justifications used: NoPit(s) ⇐ Visited(s) | NoBreeze(v) for a neighbour v. NoWumpus(s) ⇐ Visited(s) | NoStench(v). Safe(s) ⇐ NoPit(s) ∧ NoWumpus(s). PitSuspected(s) ⇐ Breeze(v) with OUT: NoPit(s). AssumedSafe(s) ⇐ OUT: PitSuspected(s), WumpusSuspected(s). The last one is a <em>nonmonotonic</em> justification: it holds because something is <em>absent</em>.</p>`;
    $('rev').onchange = () => run.render(player.i);
    player.load(steps.length);
  }

  /* ================= knowledge vs truth ================= */
  function setupKnow() {
    $('intro').innerHTML = '<b>Knowledge about knowledge</b> (§10.4). The agent <em>knows</em> φ when φ is true in every world it considers possible, that is, every world consistent with its percepts. Pit([3,1]) can be <em>true</em> while the agent doesn\'t know it. The CSP from Chapter 5 enumerates the possible worlds exactly. Step through the hybrid agent\'s episode to watch its knowledge grow.';
    layout('<h3>Knows(Agent, φ) at this step</h3><div id="ktable"></div>', true);
    const ep = W.runHybrid(spec, 150).steps;
    run = { render(i) {
      const st = ep[i], obs = new Set(st.know.visited);
      const csp = W.buildCSP(spec, obs);
      const r = W.backtrack(csp, { varOrder: 'mrv', valOrder: 'static', inference: 'mac', all: true, cap: 100000 });
      const sols = r.solutions, cells = {}, rows = [];
      if (!sols.length && csp.vars.length) {
        grid.draw({ size: spec.size, spec, showHazards: true, agent: st.state.climbed ? null : st.state });
        $('ktable').innerHTML = '<div class="callout bad">No consistent world: this CSP assumes a live wumpus, but the agent has shot it (a dead wumpus still smells). Step back to before the shot.</div>';
        $('below').innerHTML = ''; return;
      }
      for (const [x, y] of W.cells(spec.size)) {
        const k = W.key(x, y), o = {};
        if (obs.has(k)) { o.fill = 'var(--accent)'; o.alpha = 0.16; o.label = 'K¬P K¬W'; o.labelColor = 'var(--muted)'; o.labelSize = 10; cells[k] = o; continue; }
        const isVar = csp.vars.includes(k);
        const pitTrue = spec.pits.includes(k), wTrue = spec.wumpus === k;
        let kp, kw;
        if (!isVar) { kp = '?'; kw = '?'; }
        else {
          const allP = sols.length && sols.every(s => s[k] === 'P'), noP = sols.every(s => s[k] !== 'P');
          const allW = sols.length && sols.every(s => s[k] === 'W'), noW = sols.every(s => s[k] !== 'W');
          kp = allP ? 'KP' : noP ? 'K¬P' : '?'; kw = allW ? 'KW' : noW ? 'K¬W' : '?';
        }
        o.label = `${kp} ${kw}`; o.labelSize = 11;
        o.labelColor = kp === 'KP' || kw === 'KW' ? 'var(--danger)' : kp === 'K¬P' && kw === 'K¬W' ? 'var(--safe)' : 'var(--muted)';
        if ((pitTrue && kp !== 'KP') || (wTrue && kw !== 'KW')) { o.ring = 'var(--gold)'; }
        cells[k] = o;
        if (isVar) rows.push(`<tr><td>[${k}]</td><td>${pitTrue ? 'pit' : wTrue ? 'wumpus' : 'empty'}</td><td>${kp}</td><td>${kw}</td></tr>`);
      }
      const s = st.state;
      grid.draw({ size: spec.size, spec, showHazards: true, cells, agent: s.climbed ? null : s, wumpusAlive: s.wumpusAlive, goldTaken: s.goldTaken });
      $('legend').innerHTML = '<span>KP = Knows(Pit) · K¬P = Knows(¬Pit) · ? = doesn\'t know whether</span><span style="--c:var(--gold)">ring: true, but not known</span>';
      $('ktable').innerHTML = `<p class="small">${sols.length} possible world(s) for the ${csp.vars.length} frontier square(s). Squares far from the agent are unconstrained, so the agent knows nothing about them.</p>
        <table class="data"><tr><th>square</th><th>truth</th><th>pit</th><th>wumpus</th></tr>${rows.join('')}</table>`;
      $('below').innerHTML = `<h3>Possible worlds (frontier only)</h3><div class="gallery">${sols.slice(0, 40).map(sol => { const C = 12, n = spec.size; let g = `<div class="tile"><svg width="${n * C}" height="${n * C}">`; for (const [x, y] of W.cells(n)) { const k = W.key(x, y); const f = obs.has(k) ? 'var(--panel-2)' : sol[k] === 'P' ? 'var(--pit)' : sol[k] === 'W' ? 'var(--wumpus)' : 'var(--cell)'; g += `<rect x="${(x - 1) * C}" y="${(n - y) * C}" width="${C - 1}" height="${C - 1}" style="fill:${f};stroke:var(--line)"/>`; } return g + '</svg></div>'; }).join('')}${sols.length > 40 ? `<span class="muted">… ${sols.length - 40} more</span>` : ''}</div>`;
    } };
    player.load(ep.length);
  }

  setup();
})();
