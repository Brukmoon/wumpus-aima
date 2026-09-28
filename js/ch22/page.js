(function () {
  'use strict';
  W.topbar('Ch. 22 · Reinforcement Learning');
  const $ = id => document.getElementById(id);
  const ARW = ['↑', '→', '↓', '←'];

  let spec, R = null;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; run(); } });
  spec = wp.spec;
  const grid = new W.GridView($('grid'));
  const pseudo = new W.Pseudo($('pseudo'));
  const player = new W.Player($('player'), { onStep: i => show(i) });
  $('run').onclick = run;
  $('exp').onchange = () => { ui(); };
  $('alg').onchange = () => { ui(); };
  function ui() {
    const eps = $('exp').value === 'eps';
    $('epsw').style.display = eps ? '' : 'none'; $('new').style.display = eps ? 'none' : '';
    const q = $('alg').value === 'q';
    pseudo.set([
      ['', q ? 'function Q-LEARNING-AGENT(percept) returns an action' : 'function SARSA-AGENT(percept) returns an action'],
      ['', '  inputs: percept, indicating the current state s′ and reward signal r'],
      ['', '  persistent: Q, table of action values; N_sa, table of state–action counts; s, a, r: previous'],
      ['', '  if TERMINAL?(s′) then Q[s′, None] ← r′'],
      ['', '  if s is not null then'],
      ['', '    increment N_sa[s, a]'],
      ['u', q ? '    Q[s, a] ← Q[s, a] + α(N_sa[s, a]) (r + γ max_{a′} Q[s′, a′] − Q[s, a])'
              : '    Q[s, a] ← Q[s, a] + α(N_sa[s, a]) (r + γ Q[s′, a′] − Q[s, a])     // a′: the action actually chosen next'],
      ['x', $('exp').value === 'eps' ? '  s, a ← s′, ε-greedy: random action with prob. ε, else argmax_{a′} Q[s′, a′]'
                                    : '  s, a ← s′, argmax_{a′} f(Q[s′, a′], N_sa[s′, a′])     f(u, n) = R⁺ if n < N_e else u'],
      ['', '  return a'],
    ], q ? 'Figure 22.8: an exploratory Q-learning agent (plus the SARSA variant, §22.3.3)' : 'SARSA (§22.3.3), with the same structure as Figure 22.8');
    pseudo.highlight(['u', 'x']);
  }

  function run() {
    ui();
    const mdp = new W.GridMDP(spec, { living: +$('living').value, gamma: Math.min(0.999, +$('gamma').value), slip: +$('slip').value });
    const vi = mdp.valueIteration(1e-8, 5000), Ustar = vi[vi.length - 1].U, piStar = mdp.greedy(Ustar);
    const start = mdp.idx.get('1,1'), nS = mdp.S.length, E = Math.max(100, +$('eps_n').value), rng = W.rng(+$('seed').value);
    const Q = Array.from({ length: nS }, () => new Float64Array(4)), N = Array.from({ length: nS }, () => new Float64Array(4));
    const visits = new Float64Array(nS);
    const alg = $('alg').value, useEps = $('exp').value === 'eps', eps = +$('eps').value, Ne = Math.max(1, +$('ne').value), Rplus = 1;   // R⁺: an optimistic estimate, the largest reward available
    const alphaOf = n => $('alpha').value === 'decay' ? 60 / (59 + n) : +$('alpha').value;
    const choose = s => {
      if (useEps) { if (rng() < eps) return Math.floor(rng() * 4); }
      let best = 0, bv = -Infinity;
      for (let a = 0; a < 4; a++) { const v = useEps ? Q[s][a] : (N[s][a] < Ne ? Rplus : Q[s][a]); if (v > bv + 1e-12 || (Math.abs(v - bv) <= 1e-12 && rng() < 0.5)) { bv = v; best = a; } }
      return best;
    };
    const snaps = [], returns = [], every = Math.max(1, Math.floor(E / 60));
    const snap = ep => {
      const pi = mdp.S.map((_, s) => mdp.isTerminal(s) ? -1 : Q[s].indexOf(Math.max(...Q[s])));
      const U = mdp.evaluate(pi.map(a => a < 0 ? 0 : a));
      snaps.push({ ep, Q: Q.map(q => Array.from(q)), visits: Array.from(visits), pi, vPi: U[start] });
    };
    snap(0);
    for (let ep = 1; ep <= E; ep++) {
      let s = start, a = choose(s), G = 0, disc = 1;
      for (let t = 0; t < 200; t++) {
        visits[s]++;
        const s2 = mdp.step(s, a, rng), r = mdp.R(s2);
        G += disc * r; disc *= mdp.gamma;
        N[s][a]++;
        const term = mdp.isTerminal(s2);
        const a2 = term ? 0 : choose(s2);
        const target = r + (term ? 0 : mdp.gamma * (alg === 'q' ? Math.max(...Q[s2]) : Q[s2][a2]));
        Q[s][a] += alphaOf(N[s][a]) * (target - Q[s][a]);
        if (term) { visits[s2]++; break; }
        s = s2; a = a2;
      }
      returns.push(G);
      if (ep % every === 0 || ep === E) snap(ep);
    }
    R = { mdp, Ustar, piStar, snaps, returns, start };
    $('status').textContent = `${E} episodes · optimal U*([1,1]) = ${Ustar[start].toFixed(3)}`;
    const ma = []; let acc = 0; returns.forEach((g, i) => { acc += g; if (i >= 100) acc -= returns[i - 100]; if (i % Math.max(1, Math.floor(E / 300)) === 0) ma.push([i + 1, acc / Math.min(i + 1, 100)]); });
    R.c2 = ma;
    player.load(snaps.length, snaps.length - 1);
  }

  function show(i) {
    const { mdp, Ustar, piStar, snaps, start } = R, sn = snaps[i];
    const cells = {};
    const maxQ = sn.Q.map(q => Math.max(...q)), vals = maxQ.filter((_, s) => !mdp.isTerminal(s)), lo = Math.min(...vals, 0), hi = Math.max(...vals, 0.001);
    let wrong = 0, rms = 0, cnt = 0, unseen = 0;
    mdp.S.forEach((k, s) => {
      if (mdp.isTerminal(s)) { const r = mdp.term.get(k); cells[k] = { label: r > 0 ? '+1' : '−1', labelColor: r > 0 ? 'var(--gold)' : 'var(--danger)', labelSize: 16 }; return; }
      const v = maxQ[s], t = (v - lo) / ((hi - lo) || 1), a = sn.pi[s];
      const seen = sn.visits[s] > 0, optimal = !seen || Math.abs(mdp.q(Ustar, s, a) - mdp.q(Ustar, s, piStar[s])) < 1e-6;
      if (!seen) unseen++; else if (!optimal) wrong++;
      rms += (v - Ustar[s]) ** 2; cnt++;
      cells[k] = { fill: v >= 0 ? `rgba(46,157,91,${0.1 + 0.5 * t})` : `rgba(208,69,58,${0.1 + 0.5 * (1 - t)})`, alpha: 1, label: sn.visits[s] ? ARW[a] : '·', labelSize: 22, labelColor: 'var(--ink)', sub: `${v.toFixed(2)} · n=${sn.visits[s]}`, ring: optimal ? null : 'var(--gold)' };
    });
    grid.draw({ size: spec.size, spec, showHazards: true, cells, agent: { x: 1, y: 1, dir: 'E' } });
    $('info').innerHTML = `<dt>episodes so far</dt><dd>${sn.ep}</dd><dt>greedy policy value</dt><dd>U<sup>π</sup>([1,1]) = ${sn.vPi.toFixed(3)} (optimal ${Ustar[start].toFixed(3)})</dd>
      <dt>non-optimal actions</dt><dd>${wrong} of ${cnt - unseen} visited squares (gold rings)${unseen ? `, ${unseen} never visited` : ''}</dd><dt>RMS(max Q − U*)</dt><dd>${Math.sqrt(rms / cnt).toFixed(3)}</dd>`;
    $('c1').innerHTML = W.chart([{ values: snaps.map(x => [x.ep, x.vPi]), color: 'var(--accent)', label: 'U^π([1,1]) of the greedy policy' }], { w: 520, h: 210, xMin: 0, marker: sn.ep, xLabel: 'episodes', refs: [{ y: Ustar[start], label: 'optimal U*', color: 'var(--gold)' }] });
    $('c2').innerHTML = W.chart([{ values: R.c2, color: 'var(--frontier)', label: 'discounted return, moving average' }], { w: 520, h: 210, xMin: 1, marker: sn.ep, xLabel: 'episodes', refs: [{ y: Ustar[start], label: 'optimal expected return', color: 'var(--gold)' }] });
  }

  run();
})();
