(function () {
  'use strict';
  W.topbar('Ch. 17 · Making Complex Decisions');
  const $ = id => document.getElementById(id);
  const ARW = ['↑', '→', '↓', '←'];

  let spec, mdp, iters, simPath = null;
  const wp = new W.WorldPanel($('worldpanel'), { onChange: s => { spec = s; build(); } });
  spec = wp.spec;
  const grid = new W.GridView($('grid'));
  const pseudo = new W.Pseudo($('pseudo'));
  const player = new W.Player($('player'), { onStep: i => show(i) });
  const tabs = new W.Tabs($('tabs'), [['vi', 'Value iteration'], ['pi', 'Policy iteration']], () => build(), 'ch17.tab');
  $('living').oninput = () => { $('lv').textContent = (+$('living').value).toFixed(2); };
  ['living', 'gamma', 'slip'].forEach(id => $(id).onchange = build);
  $('lv').textContent = (+$('living').value).toFixed(2);
  $('sim').onclick = () => {
    const it = iters[player.i], pi = tabs.cur === 'vi' ? mdp.greedy(it.U) : it.pi;
    const r = mdp.simulate(pi, Math.floor(Math.random() * 1e6));
    simPath = r.path.map(s => W.parse(mdp.S[s]));
    $('simres').textContent = `${r.path.length - 1} moves, ended in ${r.end}, discounted return ${r.total.toFixed(3)}`;
    show(player.i);
  };

  function build() {
    mdp = new W.GridMDP(spec, { living: +$('living').value, gamma: Math.min(0.999, +$('gamma').value), slip: +$('slip').value });
    simPath = null; $('simres').textContent = '';
    if (tabs.cur === 'vi') {
      iters = mdp.valueIteration();
      pseudo.set(W.MDP_PSEUDO.vi.lines, W.MDP_PSEUDO.vi.caption);
      $('ctitle').textContent = 'Largest change δ per iteration (log scale view: it shrinks geometrically, by a factor of about γ)';
      $('chart').dataset.v = '1';
    } else {
      iters = mdp.policyIteration();
      pseudo.set(W.MDP_PSEUDO.pi.lines, W.MDP_PSEUDO.pi.caption);
      $('ctitle').textContent = 'Number of squares whose action changed, per iteration';
    }
    player.load(iters.length, iters.length - 1);
  }

  function show(i) {
    const it = iters[i], U = it.U, pi = tabs.cur === 'vi' ? mdp.greedy(U) : it.pi;
    const vals = U.filter((_, s) => !mdp.isTerminal(s)), lo = Math.min(...vals, 0), hi = Math.max(...vals, 0.001);
    const cells = {};
    mdp.S.forEach((k, s) => {
      if (mdp.isTerminal(s)) { const r = mdp.term.get(k); cells[k] = { label: r > 0 ? '+1' : '−1', labelColor: r > 0 ? 'var(--gold)' : 'var(--danger)', labelSize: 16 }; return; }
      const v = U[s], t = (v - lo) / ((hi - lo) || 1);
      cells[k] = { fill: v >= 0 ? `rgba(46,157,91,${0.1 + 0.5 * t})` : `rgba(208,69,58,${0.1 + 0.5 * (1 - t)})`, alpha: 1, label: ARW[pi[s]], labelSize: 22, labelColor: 'var(--ink)', sub: v.toFixed(3) };
    });
    const [ax, ay] = [1, 1];
    grid.draw({ size: spec.size, spec, showHazards: true, cells, agent: { x: ax, y: ay, dir: 'E' }, paths: simPath ? [{ pts: simPath, color: 'var(--frontier)', width: 3 }] : [] });
    if (tabs.cur === 'vi') {
      pseudo.highlight(i === 0 ? ['v2'] : i === iters.length - 1 ? ['v6'] : ['v4', 'v5']);
      $('info').innerHTML = `<dt>iteration</dt><dd>${i}</dd><dt>δ</dt><dd>${it.delta == null ? '—' : it.delta.toExponential(3)}</dd><dt>stop when δ ≤</dt><dd>${(1e-4 * (1 - mdp.gamma) / mdp.gamma).toExponential(2)}</dd><dt>U(start)</dt><dd>${U[mdp.idx.get('1,1')].toFixed(4)}</dd><dt>arrows</dt><dd>the greedy policy for the current U</dd>`;
      const ds = iters.slice(1).map((x, j) => [j + 1, Math.log10(Math.max(1e-12, x.delta))]);
      $('chart').innerHTML = W.chart([{ values: ds, color: 'var(--accent)', label: 'log₁₀ δ' }], { w: 900, h: 200, xMin: 1, marker: i, xLabel: 'iteration' });
    } else {
      pseudo.highlight(i === iters.length - 1 ? ['p7'] : ['p2', 'p5', 'p6']);
      $('info').innerHTML = `<dt>iteration</dt><dd>${i + 1} of ${iters.length}</dd><dt>squares changed</dt><dd>${it.changed}</dd><dt>U(start)</dt><dd>${U[mdp.idx.get('1,1')].toFixed(4)}</dd><dt>arrows</dt><dd>the policy π being evaluated in this iteration</dd>`;
      $('chart').innerHTML = W.chart([{ values: iters.map((x, j) => [j + 1, x.changed]), color: 'var(--accent)', label: 'changed actions', dots: true }], { w: 900, h: 200, yMin: 0, xMin: 1, marker: i + 1, xLabel: 'iteration' });
    }
  }

  build();
})();
