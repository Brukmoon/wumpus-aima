/* Chapter 5: the agent's knowledge as a constraint satisfaction problem.
 *   variables  X_s for every frontier square s (unvisited, next to a visited square)
 *   domain     {∅, P, W}: empty, pit, wumpus (we ignore the rare case of the wumpus sitting in a pit)
 *   constraints  Breeze_v:  percept breeze at v ⇔ some frontier neighbour of v is P
 *                Stench_v:  percept stench at v ⇔ some frontier neighbour of v is W
 *                AtMostOne: at most one variable is W
 * Algorithms (AC-3/GAC, backtracking with MRV/LCV/FC/MAC, min-conflicts) record events for the stepper.
 */
(function (W) {
  'use strict';
  const VALS = ['∅', 'P', 'W'];
  W.CSP_VALS = VALS;

  W.buildCSP = function (spec, observed) {
    const n = spec.size, pits = new Set(spec.pits);
    const obs = [...observed];
    const vars = W.cells(n).map(c => W.key(...c)).filter(k => !observed.has(k) && W.neighbors(...W.parse(k), n).some(c => observed.has(W.key(...c))));
    const varSet = new Set(vars);
    const constraints = [];
    for (const v of obs) {
      const [x, y] = W.parse(v);
      const nb = W.neighbors(x, y, n).map(c => W.key(...c));
      const scope = nb.filter(k => varSet.has(k));
      const breeze = nb.some(k => pits.has(k));
      const stench = !!spec.wumpus && (spec.wumpus === v || nb.includes(spec.wumpus));
      if (!scope.length) continue;
      constraints.push({ id: constraints.length, type: 'B', at: v, scope, need: breeze, val: 'P',
        text: breeze ? `breeze at [${v}]: at least one of ${scope.map(s => 'X' + s).join(', ')} is P` : `no breeze at [${v}]: none of ${scope.map(s => 'X' + s).join(', ')} is P` });
      constraints.push({ id: constraints.length, type: 'S', at: v, scope, need: stench, val: 'W',
        text: stench ? `stench at [${v}]: at least one of ${scope.map(s => 'X' + s).join(', ')} is W` : `no stench at [${v}]: none of ${scope.map(s => 'X' + s).join(', ')} is W` });
    }
    if (vars.length > 1) constraints.push({ id: constraints.length, type: 'ONE', scope: vars.slice(), text: 'at most one of all variables is W (there is only one wumpus)' });
    const byVar = new Map(vars.map(v => [v, []]));
    for (const c of constraints) for (const v of c.scope) byVar.get(v).push(c.id);
    return { vars, constraints, byVar, observed: new Set(observed), n };
  };

  /* satisfied(c, full assignment over scope) */
  function sat(c, a) {
    if (c.type === 'ONE') return c.scope.filter(v => a[v] === 'W').length <= 1;
    const any = c.scope.some(v => a[v] === c.val);
    return any === c.need;
  }
  /* violated by a partial assignment (definitely cannot be satisfied whatever the rest take) */
  function violated(c, a) {
    if (c.type === 'ONE') return c.scope.filter(v => a[v] === 'W').length > 1;
    if (!c.need) return c.scope.some(v => a[v] === c.val);
    return c.scope.every(v => a[v] !== undefined) && !c.scope.some(v => a[v] === c.val);
  }
  W.cspViolated = violated;

  /* Does X=x have support in constraint c, given the current domains of the other variables? */
  function supported(c, X, x, D) {
    if (c.type === 'ONE') {
      const forcedW = c.scope.filter(v => v !== X && D[v].length === 1 && D[v][0] === 'W').length;
      return x === 'W' ? forcedW === 0 && c.scope.every(v => v === X || D[v].some(d => d !== 'W')) : forcedW <= 1;
    }
    const others = c.scope.filter(v => v !== X);
    if (!c.need) return x !== c.val && others.every(v => D[v].some(d => d !== c.val));
    if (x === c.val) return others.every(v => D[v].length > 0);
    return others.some(v => D[v].includes(c.val)) && others.every(v => D[v].length > 0);
  }

  /* ---------- GAC-3 (AC-3 generalized to n-ary constraints) ---------- */
  W.gac3 = function (csp, D, rec, initialQueue) {
    const queue = initialQueue ? initialQueue.slice() : [];
    if (!initialQueue) for (const c of csp.constraints) for (const v of c.scope) queue.push([v, c.id]);
    const inQ = new Set(queue.map(([v, c]) => v + '|' + c));
    rec && rec({ line: 'a1', kind: 'init', queue: queue.length, D: clone(D) });
    let revisions = 0;
    while (queue.length) {
      const [X, cid] = queue.shift(); inQ.delete(X + '|' + cid);
      const c = csp.constraints[cid];
      const removed = D[X].filter(x => !supported(c, X, x, D));
      rec && rec({ line: removed.length ? 'r4' : 'a3', kind: 'revise', X, cid, removed, queue: queue.length, D: clone(D) });
      if (!removed.length) continue;
      revisions++;
      D[X] = D[X].filter(x => !removed.includes(x));
      rec && rec({ line: 'a4', kind: 'removed', X, cid, removed, queue: queue.length, D: clone(D) });
      if (!D[X].length) { rec && rec({ line: 'a5', kind: 'wipeout', X, cid, D: clone(D) }); return false; }
      for (const cj of csp.byVar.get(X)) for (const Y of csp.constraints[cj].scope) {
        if (Y === X) continue;
        const k = Y + '|' + cj;
        if (!inQ.has(k)) { inQ.add(k); queue.push([Y, cj]); }
      }
      rec && rec({ line: 'a7', kind: 'enqueue', X, cid, queue: queue.length, D: clone(D) });
    }
    rec && rec({ line: 'a8', kind: 'done', D: clone(D) });
    return true;
  };
  const clone = D => { const o = {}; for (const k in D) o[k] = D[k].slice(); return o; };
  W.cspClone = clone;
  W.cspInitialDomains = csp => { const D = {}; for (const v of csp.vars) D[v] = VALS.slice(); return D; };

  /* ---------- Backtracking search (Figure 5.5) ----------
   * opts: { varOrder: 'static'|'mrv', valOrder: 'static'|'lcv', inference: 'none'|'fc'|'mac', all: bool, cap } */
  W.backtrack = function (csp, opts) {
    const events = [], nodes = [{ id: 0, parent: null, t: 0, var: null, val: null, status: 'root' }];
    const solutions = [], cap = opts.cap || 20000;
    let stop = false, checks = 0;
    const ev = e => { events.push(e); if (events.length > cap) { stop = true; } };
    const D0 = W.cspInitialDomains(csp);
    if (opts.inference === 'mac' && !W.gac3(csp, D0)) { ev({ line: 'b3', kind: 'fail', node: 0, A: {}, D: clone(D0), msg: 'initial arc consistency found a wipe-out' }); return { events, nodes, solutions }; }
    ev({ line: 'b1', kind: 'start', node: 0, A: {}, D: clone(D0), msg: opts.inference === 'mac' ? 'initial GAC-3 pass done' : 'start with an empty assignment' });

    const conflicts = (A, X, x) => {
      // LCV: number of values ruled out in neighbouring variables' domains
      let n = 0;
      for (const cid of csp.byVar.get(X)) {
        const c = csp.constraints[cid];
        for (const Y of c.scope) if (Y !== X && A[Y] === undefined) {
          for (const y of VALS) { const B = Object.assign({}, A, { [X]: x, [Y]: y }); if (violated(c, B)) n++; }
        }
      }
      return n;
    };
    function selectVar(A, D) {
      const un = csp.vars.filter(v => A[v] === undefined);
      if (opts.varOrder !== 'mrv') return un[0];
      let best = null;
      for (const v of un) {
        const deg = csp.byVar.get(v).length;
        if (!best || D[v].length < D[best].length || (D[v].length === D[best].length && deg > csp.byVar.get(best).length)) best = v;
      }
      return best;
    }
    function go(A, D, parent) {
      if (stop) return false;
      if (csp.vars.every(v => A[v] !== undefined)) {
        solutions.push(Object.assign({}, A));
        nodes[parent].status = 'solution';
        ev({ line: 'b2', kind: 'solution', node: parent, A: Object.assign({}, A), D: clone(D), msg: `solution #${solutions.length}` });
        return !opts.all;
      }
      const X = selectVar(A, D);
      let vals = D[X].slice();
      if (opts.valOrder === 'lcv') vals.sort((a, b) => conflicts(A, X, a) - conflicts(A, X, b));
      ev({ line: 'b3', kind: 'select', node: parent, X, A: Object.assign({}, A), D: clone(D), msg: `select ${'X' + X}${opts.varOrder === 'mrv' ? ` (MRV: ${D[X].length} values left)` : ''}; try ${vals.join(', ')}` });
      for (const x of vals) {
        if (stop) return false;
        const A2 = Object.assign({}, A, { [X]: x });
        const node = { id: nodes.length, parent, t: events.length, var: X, val: x, status: 'open' };
        nodes.push(node);
        checks++;
        const bad = csp.byVar.get(X).map(cid => csp.constraints[cid]).find(c => violated(c, A2));
        if (bad) {
          node.status = 'conflict';
          ev({ line: 'b5', kind: 'conflict', node: node.id, X, x, A: A2, D: clone(D), msg: `X${X} = ${x} violates: ${bad.text}` });
          continue;
        }
        const D2 = clone(D); D2[X] = [x];
        let ok = true, msg = '';
        if (opts.inference === 'fc') {
          for (const cid of csp.byVar.get(X)) for (const Y of csp.constraints[cid].scope) {
            if (A2[Y] !== undefined) continue;
            D2[Y] = D2[Y].filter(y => !violated(csp.constraints[cid], Object.assign({}, A2, { [Y]: y })));
            if (!D2[Y].length) ok = false;
          }
          msg = ok ? 'forward checking pruned neighbours' : 'forward checking wiped out a domain';
        } else if (opts.inference === 'mac') {
          const q = [];
          for (const cid of csp.byVar.get(X)) for (const Y of csp.constraints[cid].scope) if (Y !== X && A2[Y] === undefined) q.push([Y, cid]);
          ok = W.gac3(csp, D2, null, q);
          msg = ok ? 'MAC (GAC-3 on neighbours) pruned domains' : 'MAC found a wipe-out';
        }
        ev({ line: 'b6', kind: ok ? 'assign' : 'infer-fail', node: node.id, X, x, A: A2, D: clone(D2), msg: `X${X} = ${x}` + (opts.inference !== 'none' ? ' · ' + msg : '') });
        if (!ok) { node.status = 'pruned'; continue; }
        if (go(A2, D2, node.id)) return true;
        if (stop) return false;
        if (node.status === 'open') node.status = 'dead';
      }
      ev({ line: 'b9', kind: 'backtrack', node: parent, A: Object.assign({}, A), D: clone(D), msg: `no value of X${X} works: backtrack` });
      return false;
    }
    go({}, D0, 0);
    ev({ line: 'b10', kind: 'end', node: 0, A: {}, D: clone(D0), msg: stop ? 'stopped (step cap)' : opts.all ? `done: ${solutions.length} solutions` : solutions.length ? 'solution found' : 'failure: no solution' });
    return { events, nodes, solutions, capped: stop, checks };
  };

  /* ---------- MIN-CONFLICTS (Figure 5.8) ---------- */
  W.minConflicts = function (csp, { maxSteps = 500, seed = 1 } = {}) {
    const rng = W.rng(seed), events = [];
    const A = {};
    for (const v of csp.vars) A[v] = VALS[Math.floor(rng() * 3)];
    const nConf = (a) => csp.constraints.filter(c => !sat(c, a)).length;
    const conflictedVars = a => [...new Set(csp.constraints.filter(c => !sat(c, a)).flatMap(c => c.scope))];
    events.push({ line: 'm1', kind: 'init', A: Object.assign({}, A), conf: nConf(A), msg: 'random complete assignment' });
    for (let i = 1; i <= maxSteps; i++) {
      if (!nConf(A)) { events.push({ line: 'm3', kind: 'solution', A: Object.assign({}, A), conf: 0, msg: `solution after ${i - 1} steps` }); return { events, solved: true }; }
      const cv = conflictedVars(A), X = cv[Math.floor(rng() * cv.length)];
      let best = [], bestN = Infinity;
      for (const x of VALS) { const B = Object.assign({}, A, { [X]: x }); const k = nConf(B); if (k < bestN) { bestN = k; best = [x]; } else if (k === bestN) best.push(x); }
      const x = best[Math.floor(rng() * best.length)], old = A[X];
      A[X] = x;
      events.push({ line: 'm5', kind: 'step', X, from: old, to: x, A: Object.assign({}, A), conf: bestN, msg: `X${X}: ${old} → ${x} (${bestN} violated constraints)` });
    }
    events.push({ line: 'm6', kind: 'fail', A: Object.assign({}, A), conf: nConf(A), msg: 'gave up (max steps)' });
    return { events, solved: false };
  };

  W.CSP_PSEUDO = {
    ac3: { caption: 'Figure 5.3 AC-3, generalized to n-ary constraints (GAC, §5.2.2)', lines: [
      ['', 'function GAC-3(csp) returns false if an inconsistency is found and true otherwise'],
      ['a1', '  queue ← all pairs (Xi, C) with Xi in the scope of constraint C'],
      ['a2', '  while queue is not empty do'],
      ['a3', '    (Xi, C) ← POP(queue)'],
      ['a4', '    if REVISE(csp, Xi, C) then'],
      ['a5', '      if size of Di = 0 then return false'],
      ['a6', '      for each constraint C′ containing Xi, each Xk ≠ Xi in C′ do'],
      ['a7', '        add (Xk, C′) to queue'],
      ['a8', '  return true'],
      ['', ''],
      ['', 'function REVISE(csp, Xi, C) returns true iff we revise the domain of Xi'],
      ['r1', '  revised ← false'],
      ['r2', '  for each x in Di do'],
      ['r3', '    if no assignment to the other variables of C satisfies C with Xi = x then'],
      ['r4', '      delete x from Di; revised ← true'],
      ['r5', '  return revised'],
    ] },
    bt: { caption: 'Figure 5.5: a simple backtracking algorithm for constraint satisfaction problems', lines: [
      ['', 'function BACKTRACKING-SEARCH(csp) returns a solution or failure'],
      ['b1', '  return BACKTRACK(csp, { })'],
      ['', ''],
      ['', 'function BACKTRACK(csp, assignment) returns a solution or failure'],
      ['b2', '  if assignment is complete then return assignment'],
      ['b3', '  var ← SELECT-UNASSIGNED-VARIABLE(csp, assignment)'],
      ['b4', '  for each value in ORDER-DOMAIN-VALUES(csp, var, assignment) do'],
      ['b5', '    if value is consistent with assignment then'],
      ['b6', '      add {var = value} to assignment'],
      ['b7', '      inferences ← INFERENCE(csp, var, assignment)'],
      ['b8', '      if inferences ≠ failure then … result ← BACKTRACK(csp, assignment) …'],
      ['', '      remove {var = value} and inferences from assignment'],
      ['b9', '  return failure'],
      ['b10', ''],
    ] },
    mc: { caption: 'Figure 5.8: the MIN-CONFLICTS local search algorithm', lines: [
      ['', 'function MIN-CONFLICTS(csp, max_steps) returns a solution or failure'],
      ['m1', '  current ← an initial complete assignment for csp'],
      ['m2', '  for i = 1 to max_steps do'],
      ['m3', '    if current is a solution for csp then return current'],
      ['m4', '    var ← a randomly chosen conflicted variable from csp.VARIABLES'],
      ['m5', '    value ← the value v for var that minimizes CONFLICTS(csp, var, v, current)'],
      ['', '    set var = value in current'],
      ['m6', '  return failure'],
    ] },
  };
})(window.W);
