(function () {
  'use strict';
  W.topbar('Ch. 2 · Intelligent Agents');
  const $ = id => document.getElementById(id);

  let spec, run = null, mode = 'model', manual = null;

  const trueView = new W.GridView($('truegrid'), { onCellClick: c => wp.click(c) });
  const agentView = new W.GridView($('agentgrid'));
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; start(); } });
  spec = wp.spec;

  const player = new W.Player($('player'), { onStep: i => show(run.steps[i], i) });

  // agent picker
  const modes = [['manual', '🎮 You play']].concat(Object.entries(W.AGENTS).map(([k, a]) => [k, a.label]));
  $('agentbar').innerHTML = '<span class="small muted">Agent:</span>' + modes.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('');
  $('agentbar').addEventListener('click', e => { if (e.target.dataset.k) { mode = e.target.dataset.k; start(); } });
  $('optV').addEventListener('change', start);
  $('reveal').addEventListener('change', () => redraw());
  $('fields').addEventListener('change', () => redraw());

  function start() {
    $('agentbar').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === mode));
    $('uopts').style.display = mode === 'utility' ? '' : 'none';
    const isManual = mode === 'manual';
    $('player').style.display = isManual ? 'none' : '';
    $('manualbar').style.display = isManual ? '' : 'none';
    player.disabledKeys = isManual;
    if (isManual) {
      $('reveal').checked = false;
      manual = { env: new W.Env(spec), model: new W.Model(spec.size), log: [], lastWhy: 'Your move. You see only what the agent perceives.' };
      manual.model.update(manual.env.percept());
      $('rules').innerHTML = '<li>You are the agent program. Keep track of what you know (the grid on the right remembers percepts for you, but draws no conclusions beyond “OK”).</li>';
      showManual();
    } else {
      $('reveal').checked = true;
      run = W.runEpisode(spec, mode, { maxSteps: 200, opts: { V: +$('optV').value } });
      $('rules').innerHTML = run.agent.rules.map(r => `<li data-r="${r.id}"><code>${W.esc(r.text)}</code></li>`).join('');
      $('log').innerHTML = run.steps.map((s, i) => `<div data-i="${i}">${String(s.state.t).padStart(3)}  [${s.state.x},${s.state.y}] ${s.state.dir}  ${W.esc(W.perceptText(s.percept)).padEnd(0)} → <b>${s.action || '—'}</b></div>`).join('');
      $('log').onclick = e => { const d = e.target.closest('[data-i]'); if (d) player.go(+d.dataset.i); };
      player.load(run.steps.length);
    }
  }

  let last = null;
  function redraw() { if (mode === 'manual') showManual(); else if (last) show(last.step, last.i); }

  function drawTrue(state) {
    trueView.draw({ size: spec.size, spec, showHazards: $('reveal').checked, showPercepts: $('fields').checked,
      wumpusAlive: state.wumpusAlive, goldTaken: state.goldTaken, agent: state.climbed ? null : state });
  }
  function lamps(p) {
    const cols = { stench: 'var(--stench)', breeze: 'var(--breeze)', glitter: 'var(--gold)', bump: 'var(--muted)', scream: 'var(--wumpus)' };
    $('lamps').innerHTML = Object.keys(cols).map(k => `<span class="lamp ${p[k] ? 'lit' : ''}" style="--c:${cols[k]}">${k}</span>`).join('');
    $('ptuple').textContent = W.perceptTuple(p);
  }
  function scoreText(st) {
    const status = st.done ? (st.alive ? (st.hasGold ? ' <span class="pill good">escaped with gold</span>' : ' <span class="pill">climbed out</span>') : ' <span class="pill bad">dead</span>') : '';
    return `${st.score} <span class="muted small">(t = ${st.t})</span>${status}`;
  }

  function show(step, i) {
    last = { step, i };
    drawTrue(step.state);
    const v = step.view;
    agentView.draw({ size: spec.size, cells: v.cells, paths: v.paths, agent: step.state.climbed ? null : { x: step.state.x, y: step.state.y, dir: step.state.dir, alive: step.state.alive, hasGold: step.state.hasGold } });
    $('notes').textContent = v.notes || '';
    lamps(step.percept);
    $('action').innerHTML = step.action ? `<b>${step.action}</b>` : '—';
    $('why').textContent = step.why || '';
    $('score').innerHTML = scoreText(step.state) + (step.loop ? ' <span class="pill bad">stuck in an infinite loop</span>' : '');
    $('rules').querySelectorAll('li').forEach(li => li.classList.toggle('fired', li.dataset.r === step.rule));
    const log = $('log');
    log.querySelectorAll('.cur').forEach(d => d.classList.remove('cur'));
    const cur = log.querySelector(`[data-i="${i}"]`);
    if (cur) { cur.classList.add('cur'); const t = cur.offsetTop - log.offsetTop; if (t < log.scrollTop || t > log.scrollTop + log.clientHeight - 20) log.scrollTop = t - 60; }
    $('eutable').innerHTML = v.table ? euTable(v.table) : '';
  }

  function euTable(rows) {
    return `<table class="data"><tr><th>Option</th><th class="num">risk</th><th class="num">EU</th><th></th></tr>` +
      rows.map((r, i) => `<tr class="${i === 0 ? 'best' : ''}"><td>${W.esc(r.name)}</td><td class="num">${(r.risk * 100).toFixed(0)}%</td><td class="num">${r.eu.toFixed(0)}</td><td class="small muted">${W.esc(r.detail || '')}</td></tr>`).join('') + '</table>';
  }

  /* ---------- manual play ---------- */
  function showManual() {
    const { env, model } = manual, st = env.s;
    drawTrue(st);
    agentView.draw({ size: spec.size, cells: model.cells(), agent: st.climbed ? null : st });
    $('notes').textContent = 'Your memory: squares you visited and what you perceived there. Everything else you must deduce.';
    lamps(env.percept());
    $('action').innerHTML = manual.log.length ? `<b>${manual.log[manual.log.length - 1].a}</b>` : '—';
    $('why').textContent = manual.lastWhy;
    $('score').innerHTML = scoreText(st);
    $('log').innerHTML = manual.log.map(l => `<div>${String(l.t).padStart(3)}  ${W.esc(l.p)} → <b>${l.a}</b> ${l.e !== l.a ? '· ' + W.esc(l.e) : ''}</div>`).join('');
    $('log').scrollTop = 1e9;
    $('eutable').innerHTML = '';
    if (st.done) $('reveal').checked = true, drawTrue(st);
  }
  function act(a) {
    if (a === 'reset') return start();
    const { env, model } = manual;
    if (env.s.done) return;
    const p = W.perceptText(env.percept());
    const ev = env.execute(a);
    model.lastAction = a;
    if (a === 'Grab' && env.s.hasGold) model.hasGold = true;
    if (!env.s.done) model.update(env.percept());
    manual.log.push({ t: env.s.t, p, a, e: ev });
    manual.lastWhy = env.s.done ? 'Game over: ' + ev + '.' : (ev !== a ? ev : '');
    showManual();
  }
  $('manualbar').addEventListener('click', e => { if (e.target.dataset.m) act(e.target.dataset.m); });
  document.addEventListener('keydown', e => {
    if (mode !== 'manual' || /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    const m = { ArrowUp: 'Forward', ArrowLeft: 'TurnLeft', ArrowRight: 'TurnRight', g: 'Grab', s: 'Shoot', c: 'Climb' }[e.key];
    if (m) { act(m); e.preventDefault(); }
  });

  /* ---------- benchmark ---------- */
  $('bench').addEventListener('click', () => {
    const N = Math.max(10, +$('nworlds').value || 500);
    $('benchout').innerHTML = '<span class="muted">running…</span>';
    setTimeout(() => {
      const rows = Object.entries(W.AGENTS).map(([k, a]) => {
        let score = 0, gold = 0, dead = 0, stuck = 0, steps = 0;
        for (let seed = 1; seed <= N; seed++) {
          const s = W.generateWorld({ size: spec.size, pitProb: spec.pitProb != null ? spec.pitProb : 0.2, seed });
          const r = W.runEpisode(s, k, { maxSteps: 200, opts: { V: +$('optV').value } });
          const f = r.steps[r.steps.length - 1].state;
          score += f.score; steps += f.t;
          if (!f.alive) dead++; else if (f.climbed && f.hasGold) gold++; else if (!f.done) stuck++;
        }
        return { label: a.label, score: score / N, gold: gold / N, dead: dead / N, stuck: stuck / N, steps: steps / N };
      });
      const best = Math.max(...rows.map(r => r.score));
      const pct = x => (x * 100).toFixed(1) + '%';
      $('benchout').innerHTML = `<table class="data"><tr><th>Agent</th><th class="num">avg score</th><th class="num">gold out</th><th class="num">died</th><th class="num">stuck (200 steps)</th><th class="num">avg actions</th></tr>` +
        rows.map(r => `<tr class="${r.score === best ? 'best' : ''}"><td>${r.label}</td><td class="num">${r.score.toFixed(1)}</td><td class="num">${pct(r.gold)}</td><td class="num">${pct(r.dead)}</td><td class="num">${pct(r.stuck)}</td><td class="num">${r.steps.toFixed(1)}</td></tr>`).join('') +
        `</table><p class="small muted" style="margin-top:6px">Note: in some worlds the gold is unreachable without risk (or sits in a pit), so no agent can score 100%.</p>`;
    }, 20);
  });

  start();
})();
