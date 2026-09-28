(function () {
  'use strict';
  W.topbar('Start here');
  const $ = id => document.getElementById(id);
  const LAMP = { stench: 'var(--stench)', breeze: 'var(--breeze)', glitter: 'var(--gold)', bump: 'var(--muted)', scream: 'var(--wumpus)' };
  const lamps = p => Object.keys(LAMP).map(k => `<span class="lamp ${p[k] ? 'lit' : ''}" style="--c:${LAMP[k]}">${k}</span>`).join('');

  let spec, sel = '1,1';
  const grid = new W.GridView($('grid'), { onCellClick: c => { if (wp.click(c)) return; sel = W.key(...c); inspect(); } });
  const playGrid = new W.GridView($('playgrid'));
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; inspect(); resetPlay(); } });
  spec = wp.spec;
  $('fields').onchange = inspect;

  /* ---------- percept inspector ---------- */
  function inspect() {
    const [x, y] = W.parse(sel), n = spec.size;
    const nb = W.neighbors(x, y, n).map(c => W.key(...c));
    const pitsNear = nb.filter(k => spec.pits.includes(k));
    const wHere = spec.wumpus === sel, wNear = spec.wumpus && nb.includes(spec.wumpus);
    const p = { stench: wHere || wNear, breeze: pitsNear.length > 0, glitter: spec.gold === sel, bump: false, scream: false };
    grid.draw({ size: n, spec, showHazards: true, showPercepts: $('fields').checked, cells: { [sel]: { ring: 'var(--gold)' } }, agent: { x: 1, y: 1, dir: 'E' } });
    $('sqname').textContent = `[${sel}]`;
    $('lamps').innerHTML = lamps(p);
    const why = [];
    if (spec.pits.includes(sel)) why.push('This room <b>is a pit</b>: an agent entering it dies before perceiving anything.');
    if (wHere) why.push('The <b>wumpus</b> is in this room: Stench here too, and entering it is fatal while it lives.');
    if (p.breeze) why.push(`Breeze, because of the pit${pitsNear.length > 1 ? 's' : ''} in ${pitsNear.map(k => `[${k}]`).join(' and ')}.`);
    if (wNear) why.push(`Stench, because the wumpus is next door in [${spec.wumpus}].`);
    if (p.glitter) why.push('Glitter: the gold is here.');
    if (!why.length) why.push('Nothing at all. A quiet room tells the agent that <b>every neighbour</b> is free of pits and of the wumpus. That single inference drives most of the safe exploration in Chapters 2 and 7.');
    why.push(`<span class="muted">Percept tuple: ${W.perceptTuple(p)}. Bump and Scream depend on the last action, not on the room.</span>`);
    $('pexplain').innerHTML = why.join('<br>');
  }

  /* ---------- sandbox ---------- */
  let env, model, log;
  function resetPlay() {
    env = new W.Env(spec); model = new W.Model(spec.size); log = [];
    model.update(env.percept());
    drawPlay('Find the gold, grab it, return to [1,1] and climb out.');
  }
  function drawPlay(msg) {
    const st = env.s, cells = model.cells();
    playGrid.draw({ size: spec.size, spec, showHazards: $('reveal').checked || st.done, wumpusAlive: st.wumpusAlive, goldTaken: st.goldTaken, cells, agent: st.climbed ? null : st });
    $('plamps').innerHTML = lamps(env.percept());
    const res = st.done ? (st.alive ? (st.hasGold ? ' <span class="pill good">escaped with the gold</span>' : ' <span class="pill">climbed out</span>') : ' <span class="pill bad">dead</span>') : '';
    $('pstatus').innerHTML = `${W.esc(msg)} Score: <b>${st.score}</b> (t = ${st.t})${res}`;
    $('plog').innerHTML = log.map(l => `<div>${W.esc(l)}</div>`).join('') || '<span class="muted">no actions yet</span>';
    $('plog').scrollTop = 1e9;
  }
  function act(a) {
    if (a === 'reset') return resetPlay();
    if (env.s.done) return;
    const before = W.perceptText(env.percept()), ev = env.execute(a);
    model.lastAction = a;
    if (!env.s.done) model.update(env.percept());
    log.push(`${env.s.t}. ${before} → ${a}${ev !== a ? ' · ' + ev : ''}`);
    drawPlay(env.s.done ? `Game over: ${ev}.` : ev !== a ? ev + '.' : '');
  }
  document.querySelector('.panel .row [data-m]').parentElement.addEventListener('click', e => { if (e.target.dataset.m) act(e.target.dataset.m); });
  $('reveal').onchange = () => drawPlay('');
  document.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const m = { ArrowUp: 'Forward', ArrowLeft: 'TurnLeft', ArrowRight: 'TurnRight', g: 'Grab', s: 'Shoot', c: 'Climb' }[e.key];
    if (m) { act(m); e.preventDefault(); }
  });

  /* ---------- environment dimensions ---------- */
  const DIMS = [
    { name: 'Observable', a: 'Fully observable', b: 'Partially observable', ans: 'b',
      def: 'Fully observable: the sensors give the complete relevant state at every moment. Partially observable: some of the state is hidden or noisy, so the agent must remember and infer.',
      why: 'The agent senses only its own room: a breeze says a pit is <em>somewhere</em> next door, not where. It never sees pits, the wumpus or the gold directly, and doesn\'t even sense its own position.',
      see: ['Chapter 3 pretends the cave is fully observable, and planning becomes plain search.', 'ch03.html'] },
    { name: 'Agents', a: 'Single agent', b: 'Multiagent', ans: 'a',
      def: 'Multiagent when other entities are best described as agents maximizing their own performance measures. That can be competitive (games) or cooperative.',
      why: 'The wumpus is treated as part of the environment: it doesn\'t move or pursue goals.',
      see: ['Chapter 6 wakes the wumpus up: a competitive two-player game.', 'ch06.html'] },
    { name: 'Deterministic', a: 'Deterministic', b: 'Nondeterministic', ans: 'a',
      def: 'Deterministic: the next state is completely determined by the current state and the action. Otherwise nondeterministic, or stochastic when the outcomes come with probabilities.',
      why: 'Forward always moves exactly one room, and Shoot always flies straight. The <em>initial layout</em> is random, but the dynamics are not. The agent\'s uncertainty comes from partial observability, not from its actions.',
      see: ['Chapter 4 adds ice, so an action can have several outcomes: AND-OR search.', 'ch04.html'] },
    { name: 'Episodic', a: 'Episodic', b: 'Sequential', ans: 'b',
      def: 'Episodic: experience splits into independent episodes, and each decision doesn\'t affect later ones (like classifying parts on a conveyor). Sequential: current decisions affect all future ones.',
      why: 'Where the agent goes determines what it can learn and what it risks later. Shooting the arrow now means it is gone forever.',
      see: ['Every lab on this site is sequential; that\'s why search and planning are needed at all.', 'ch03.html'] },
    { name: 'Static', a: 'Static', b: 'Dynamic', ans: 'a',
      def: 'Static: the world doesn\'t change while the agent is deliberating. Dynamic: it does, so not deciding is itself a decision. Semidynamic: the world is static but the score depends on time.',
      why: 'Nothing moves while the agent thinks, and the score depends on the number of actions, not on thinking time.',
      see: ['Even the moving wumpus of Chapter 6 waits for its turn, so that game is still static (like chess without a clock).', 'ch06.html'] },
    { name: 'Discrete', a: 'Discrete', b: 'Continuous', ans: 'a',
      def: 'Applies to the state, to time, and to percepts and actions. Discrete: finitely many distinct values. Continuous: real-valued positions, speeds, times.',
      why: 'Rooms on a grid, four headings, six actions, a 5-bit percept, and time in whole steps.',
      see: ['A robot in a real cave would be continuous. Chapter 26 (robotics) is where that lives.', 'index.html'] },
    { name: 'Known', a: 'Known', b: 'Unknown', ans: 'a',
      def: 'About the agent\'s knowledge of the “laws of physics”: does it know the outcomes (or outcome probabilities) of its actions? That is <em>not</em> the same as observability.',
      why: 'The agent knows what Forward, Grab and Shoot do and how percepts arise. It just doesn\'t know the layout. The Wumpus World is known <em>and</em> partially observable.',
      see: ['Chapter 4\'s online search drops the map entirely: the agent must learn RESULT(s, a) by trying.', 'ch04.html'] },
  ];
  $('dims').innerHTML = DIMS.map((d, i) => `<div class="panel dim" data-i="${i}">
      <h3>${d.name}</h3><div class="pair">${d.a} ↔ ${d.b}</div>
      <p class="small">${d.def}</p>
      <div class="small"><b>The Wumpus World is…</b></div>
      <div class="quiz"><button data-v="a">${d.a}</button><button data-v="b">${d.b}</button></div>
      <div class="answer small"><p>${d.why}</p><p class="muted">↪ <a href="${d.see[1]}">${d.see[0]}</a></p></div>
    </div>`).join('');
  $('dims').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    const card = b.closest('.dim'), d = DIMS[+card.dataset.i];
    card.querySelectorAll('button').forEach(x => x.classList.remove('right', 'wrong'));
    b.classList.add(b.dataset.v === d.ans ? 'right' : 'wrong');
    card.querySelector(`button[data-v="${d.ans}"]`).classList.add('right');
    card.classList.add('answered');
  });

  /* ---------- variants table ---------- */
  const COLS = ['Observable', 'Agents', 'Deterministic?', 'Episodic?', 'Static?', 'Discrete?', 'Known?'];
  const CLASSIC = ['Partially', 'Single', 'Deterministic', 'Sequential', 'Static', 'Discrete', 'Known'];
  const VARIANTS = [
    ['Classic Wumpus World (Ch. 2, 5, 7–10)', 'index.html', CLASSIC],
    ['Full-knowledge planning (Ch. 3, 11)', 'ch03.html', ['Fully', 'Single', 'Deterministic', 'Sequential', 'Static', 'Discrete', 'Known']],
    ['Slippery ice, AND-OR search (Ch. 4B)', 'ch04.html', ['Fully', 'Single', 'Nondeterministic', 'Sequential', 'Static', 'Discrete', 'Known']],
    ['Where am I? belief states (Ch. 4C)', 'ch04.html', ['Partially (own position too)', 'Single', 'Deterministic', 'Sequential', 'Static', 'Discrete', 'Known']],
    ['Unknown cave, online search (Ch. 4D)', 'ch04.html', ['Fully (current room)', 'Single', 'Deterministic', 'Sequential', 'Static', 'Discrete', 'Unknown']],
    ['Wumpus hunt game (Ch. 6)', 'ch06.html', ['Fully', 'Multi (competitive)', 'Deterministic', 'Sequential', 'Static', 'Discrete', 'Known']],
    ['Wumpus MDP / POMDP (Ch. 17, later)', 'index.html', ['Fully / Partially', 'Single', 'Stochastic', 'Sequential', 'Static', 'Discrete', 'Known']],
    ['Reinforcement learning (Ch. 22, later)', 'index.html', ['Fully / Partially', 'Single', 'Stochastic', 'Sequential', 'Static', 'Discrete', 'Unknown']],
  ];
  $('variants').innerHTML = `<tr><th>Variant</th>${COLS.map(c => `<th>${c}</th>`).join('')}</tr>` +
    VARIANTS.map(([name, href, vals]) => `<tr><td><a href="${href}">${W.esc(name)}</a></td>${vals.map((v, i) => `<td class="${v !== CLASSIC[i] ? 'changed' : ''}">${W.esc(v)}</td>`).join('')}</tr>`).join('');

  inspect(); resetPlay();
})();
