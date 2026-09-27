/* Propositional logic: sentences, parser, printer, CNF, and the book's inference algorithms
 * (TT-ENTAILS, PL-RESOLUTION, PL-FC-ENTAILS, DPLL, WALKSAT). Algorithms accept an optional
 * recorder `rec(event)` so chapter pages can step through them.
 *
 * Sentence AST: {op:'sym', name} | {op:'not', a} | {op:'and'|'or', args:[...]} | {op:'imp'|'iff', a, b} | {op:'true'|'false'}
 * Literal strings: "P1,3" or "¬P1,3". Clauses: sorted arrays of literal strings.
 */
(function (W) {
  'use strict';
  const L = W.PL = {};

  L.sym = name => ({ op: 'sym', name });
  L.not = a => ({ op: 'not', a });
  L.and = (...args) => args.length === 1 ? args[0] : ({ op: 'and', args });
  L.or = (...args) => args.length === 1 ? args[0] : ({ op: 'or', args });
  L.imp = (a, b) => ({ op: 'imp', a, b });
  L.iff = (a, b) => ({ op: 'iff', a, b });
  L.TRUE = { op: 'true' }; L.FALSE = { op: 'false' };

  /* ---------- printing ---------- */
  const PREC = { iff: 1, imp: 2, or: 3, and: 4, not: 5, sym: 6, true: 6, false: 6 };
  L.show = function show(s, outer = 0) {
    let r;
    switch (s.op) {
      case 'sym': return s.name;
      case 'true': return 'True';
      case 'false': return 'False';
      case 'not': r = '¬' + show(s.a, PREC.not); break;
      case 'and': r = s.args.map(a => show(a, PREC.and + 0.5)).join(' ∧ '); break;
      case 'or': r = s.args.map(a => show(a, PREC.or + 0.5)).join(' ∨ '); break;
      case 'imp': r = show(s.a, PREC.imp + 0.5) + ' ⇒ ' + show(s.b, PREC.imp); break;
      case 'iff': r = show(s.a, PREC.iff + 0.5) + ' ⇔ ' + show(s.b, PREC.iff + 0.5); break;
    }
    return PREC[s.op] < outer ? '(' + r + ')' : r;
  };
  L.showClause = c => c.length ? c.join(' ∨ ') : '□ (empty clause)';

  /* ---------- parsing ---------- */
  L.parse = function (text) {
    const toks = [];
    const re = /\s*(<=>|<->|⇔|=>|->|⇒|¬|~|!|∧|&|∨|\||\(|\)|True\b|False\b|[A-Za-z][A-Za-z]*(?:\d+(?:,\d+)*)?)/y;
    let m, pos = 0;
    while (pos < text.length) {
      re.lastIndex = pos; m = re.exec(text);
      if (!m) { if (/^\s*$/.test(text.slice(pos))) break; throw new Error('Cannot parse near: ' + text.slice(pos, pos + 12)); }
      toks.push(m[1]); pos = re.lastIndex;
    }
    let i = 0;
    const peek = () => toks[i], eat = t => { if (toks[i] !== t) throw new Error(`Expected ${t} but found ${toks[i] || 'end'}`); i++; };
    const isOp = (t, ...ops) => ops.includes(t);
    function iff() { let a = imp(); while (isOp(peek(), '⇔', '<=>', '<->')) { i++; a = L.iff(a, imp()); } return a; }
    function imp() { const a = or(); if (isOp(peek(), '⇒', '=>', '->')) { i++; return L.imp(a, imp()); } return a; }
    function or() { const xs = [and()]; while (isOp(peek(), '∨', '|')) { i++; xs.push(and()); } return L.or(...xs); }
    function and() { const xs = [un()]; while (isOp(peek(), '∧', '&')) { i++; xs.push(un()); } return L.and(...xs); }
    function un() {
      const t = peek();
      if (isOp(t, '¬', '~', '!')) { i++; return L.not(un()); }
      if (t === '(') { i++; const s = iff(); eat(')'); return s; }
      if (t === 'True') { i++; return L.TRUE; }
      if (t === 'False') { i++; return L.FALSE; }
      if (t && /^[A-Za-z]/.test(t)) { i++; return L.sym(t); }
      throw new Error('Unexpected ' + (t || 'end of input'));
    }
    const s = iff();
    if (i < toks.length) throw new Error('Unexpected ' + toks[i]);
    return s;
  };

  /* ---------- evaluation ---------- */
  L.symbols = function (s, out = new Set()) {
    if (s.op === 'sym') out.add(s.name);
    else if (s.a) { L.symbols(s.a, out); if (s.b) L.symbols(s.b, out); }
    else if (s.args) s.args.forEach(a => L.symbols(a, out));
    return out;
  };
  // model: Map or object name → boolean. Returns true/false, or undefined if a symbol is unassigned.
  L.evaluate = function ev(s, m) {
    const get = n => m instanceof Map ? m.get(n) : m[n];
    switch (s.op) {
      case 'sym': return get(s.name);
      case 'true': return true;
      case 'false': return false;
      case 'not': { const v = ev(s.a, m); return v === undefined ? undefined : !v; }
      case 'and': { let u = false; for (const a of s.args) { const v = ev(a, m); if (v === false) return false; if (v === undefined) u = true; } return u ? undefined : true; }
      case 'or': { let u = false; for (const a of s.args) { const v = ev(a, m); if (v === true) return true; if (v === undefined) u = true; } return u ? undefined : false; }
      case 'imp': return ev(L.or(L.not(s.a), s.b), m);
      case 'iff': { const a = ev(s.a, m), b = ev(s.b, m); return a === undefined || b === undefined ? undefined : a === b; }
    }
  };

  /* ---------- CNF (§7.5.2) ---------- */
  function elim(s) {        // remove ⇔ and ⇒
    switch (s.op) {
      case 'iff': { const a = elim(s.a), b = elim(s.b); return L.and(L.or(L.not(a), b), L.or(L.not(b), a)); }
      case 'imp': return L.or(L.not(elim(s.a)), elim(s.b));
      case 'not': return L.not(elim(s.a));
      case 'and': case 'or': return { op: s.op, args: s.args.map(elim) };
      default: return s;
    }
  }
  function nnf(s) {         // push ¬ inwards
    if (s.op === 'not') {
      const a = s.a;
      if (a.op === 'not') return nnf(a.a);
      if (a.op === 'and') return L.or(...a.args.map(x => nnf(L.not(x))));
      if (a.op === 'or') return L.and(...a.args.map(x => nnf(L.not(x))));
      if (a.op === 'true') return L.FALSE;
      if (a.op === 'false') return L.TRUE;
      return s;
    }
    if (s.op === 'and' || s.op === 'or') return { op: s.op, args: s.args.map(nnf) };
    return s;
  }
  function clausesOf(s) {    // distribute ∨ over ∧; returns array of literal arrays
    switch (s.op) {
      case 'sym': return [[s.name]];
      case 'not': return [['¬' + s.a.name]];
      case 'true': return [];
      case 'false': return [[]];
      case 'and': return [].concat(...s.args.map(clausesOf));
      case 'or': {
        let acc = [[]];
        for (const a of s.args) {
          const cs = clausesOf(a), next = [];
          for (const x of acc) for (const y of cs) next.push(x.concat(y));
          acc = next;
        }
        return acc;
      }
    }
  }
  L.neg = lit => lit[0] === '¬' ? lit.slice(1) : '¬' + lit;
  L.normClause = function (c) {
    const s = [...new Set(c)].sort();
    for (const l of s) if (l[0] !== '¬' && s.includes('¬' + l)) return null;   // tautology
    return s;
  };
  L.toCNF = function (s) {
    const out = [], seen = new Set();
    for (const c of clausesOf(nnf(elim(s)))) {
      const n = L.normClause(c);
      if (!n) continue;
      const k = n.join('|');
      if (!seen.has(k)) { seen.add(k); out.push(n); }
    }
    return out;
  };
  L.cnfSteps = function (s) {
    const e = elim(s), n = nnf(e);
    return { elim: e, nnf: n, clauses: L.toCNF(s) };
  };

  /* ---------- integer clause sets for the solvers ---------- */
  L.encode = function (clauses, order) {
    const idx = new Map(), names = [null];
    const id = n => { if (!idx.has(n)) { idx.set(n, names.length); names.push(n); } return idx.get(n); };
    (order || []).forEach(id);
    const ints = clauses.map(c => c.map(l => l[0] === '¬' ? -id(l.slice(1)) : id(l)));
    return { ints, names, idx };
  };

  /* ---------- DPLL (Figure 7.17) ----------
   * Returns a model (Map name→bool) or null. With rec, logs events:
   *   {line, kind: 'pure'|'unit'|'branch'|'false'|'true', sym, val, depth, assign: Int8Array copy} */
  L.dpll = function (clauses, { rec, order, maxEvents = 20000 } = {}) {
    const { ints, names } = L.encode(clauses, order);
    const n = names.length - 1, model = new Int8Array(n + 1);
    const stats = { calls: 0, pure: 0, unit: 0, branches: 0 };
    let events = 0;
    const log = rec ? (line, kind, sym, val, depth, extra) => {
      if (++events > maxEvents) throw new Error('event cap');
      rec(Object.assign({ line, kind, sym: sym ? names[sym] : null, val, depth, assign: model.slice() }, extra));
    } : null;
    const litVal = l => { const v = model[l > 0 ? l : -l]; return v === 0 ? 0 : (l > 0 ? v : -v); };

    function go(depth) {
      stats.calls++;
      let allTrue = true, unit = 0, falseClause = -1;
      const pos = new Uint8Array(n + 1), negs = new Uint8Array(n + 1);
      for (let ci = 0; ci < ints.length; ci++) {
        const c = ints[ci];
        let sat = false, unassigned = 0, last = 0;
        for (const l of c) { const v = litVal(l); if (v === 1) { sat = true; break; } if (v === 0) { unassigned++; last = l; } }
        if (sat) continue;
        allTrue = false;
        if (unassigned === 0) { falseClause = ci; break; }
        if (unassigned === 1 && !unit) unit = last;
        for (const l of c) if (litVal(l) === 0) { if (l > 0) pos[l] = 1; else negs[-l] = 1; }
      }
      if (falseClause < 0 && allTrue) { log && log('p1', 'true', 0, null, depth); return true; }
      if (falseClause >= 0) { log && log('p2', 'false', 0, null, depth, { clause: ints[falseClause].map(l => (l < 0 ? '¬' : '') + names[Math.abs(l)]) }); return false; }
      // pure symbol
      for (let v = 1; v <= n; v++) {
        if (model[v] || (pos[v] && negs[v]) || (!pos[v] && !negs[v])) continue;
        const val = pos[v] ? 1 : -1;
        stats.pure++; model[v] = val; log && log('p3', 'pure', v, val > 0, depth);
        if (go(depth + 1)) return true;
        model[v] = 0; return false;
      }
      if (unit) {
        const v = Math.abs(unit), val = unit > 0 ? 1 : -1;
        stats.unit++; model[v] = val; log && log('p5', 'unit', v, val > 0, depth);
        if (go(depth + 1)) return true;
        model[v] = 0; return false;
      }
      let v = 1; while (v <= n && model[v]) v++;
      stats.branches++;
      model[v] = 1; log && log('p7', 'branch', v, true, depth);
      if (go(depth + 1)) return true;
      model[v] = -1; log && log('p8', 'branch', v, false, depth);
      if (go(depth + 1)) return true;
      model[v] = 0; return false;
    }
    const sat = go(0);
    const out = sat ? new Map(names.slice(1).map((nm, i) => [nm, model[i + 1] >= 0])) : null;
    if (out) out.stats = stats;
    L.lastStats = stats;
    return out;
  };

  /* A faster DPLL for internal use (the hybrid agent's ASKs, SATPlan): two watched literals for unit
   * propagation, chronological backtracking, branch "false" first in the given symbol order.
   * Same answers as L.dpll (sound and complete); no pure-symbol rule, no recording. */
  L.dpllFast = function (clauses, { order } = {}) {
    const { ints, names } = L.encode(clauses, order);
    const n = names.length - 1, val = new Int8Array(n + 1), watches = new Map(), trail = [];
    const stats = { decisions: 0, conflicts: 0, unit: 0 };
    L.lastFastStats = stats;
    const lv = l => { const v = val[l > 0 ? l : -l]; return l > 0 ? v : -v; };
    const watch = (l, ci) => { let a = watches.get(l); if (!a) { a = []; watches.set(l, a); } a.push(ci); };
    const cls = ints.map(c => [...new Set(c)]);
    const assign = l => { val[l > 0 ? l : -l] = l > 0 ? 1 : -1; trail.push(l); };
    const units = [];
    for (let ci = 0; ci < cls.length; ci++) { const c = cls[ci]; if (!c.length) return null; if (c.length === 1) units.push(c[0]); else { watch(c[0], ci); watch(c[1], ci); } }
    let qhead = 0;
    const propagate = () => {
      while (qhead < trail.length) {
        const fl = -trail[qhead++], ws = watches.get(fl);
        if (!ws) continue;
        for (let i = 0; i < ws.length;) {
          const ci = ws[i], c = cls[ci];
          if (c[0] === fl) { c[0] = c[1]; c[1] = fl; }
          if (lv(c[0]) === 1) { i++; continue; }
          let moved = false;
          for (let k = 2; k < c.length; k++) if (lv(c[k]) !== -1) { c[1] = c[k]; c[k] = fl; watch(c[1], ci); ws[i] = ws[ws.length - 1]; ws.pop(); moved = true; break; }
          if (moved) continue;
          if (lv(c[0]) === -1) return false;
          if (lv(c[0]) === 0) { assign(c[0]); stats.unit++; }
          i++;
        }
      }
      return true;
    };
    for (const u of units) { const v = lv(u); if (v === -1) return null; if (v === 0) assign(u); }
    if (!propagate()) return null;
    const decisions = [];
    for (;;) {
      // symbols are numbered in the requested order, so the first unassigned one is the next branch
      let v = 1; while (v <= n && val[v]) v++;
      if (v > n) return new Map(names.slice(1).map((nm, i) => [nm, val[i + 1] > 0]));
      stats.decisions++;
      decisions.push({ v, len: trail.length, flipped: false });
      assign(-v); qhead = trail.length - 1;
      while (!propagate()) {
        stats.conflicts++;
        let d = null;
        while (decisions.length) {
          d = decisions.pop();
          while (trail.length > d.len) val[Math.abs(trail.pop())] = 0;
          if (!d.flipped) { d.flipped = true; decisions.push(d); assign(d.v); qhead = trail.length - 1; break; }
          d = null;
        }
        if (!d) return null;
      }
    }
  };

  /* KB ⊨ α  iff  KB ∧ ¬α is unsatisfiable. */
  L.entails = function (kbClauses, alpha) {
    return !L.dpllFast(kbClauses.concat(L.toCNF(L.not(alpha))));
  };

  /* ---------- WALKSAT (Figure 7.18) ---------- */
  L.walksat = function (clauses, { p = 0.5, maxFlips = 10000, seed = 1, rec, order } = {}) {
    const { ints, names } = L.encode(clauses, order);
    const n = names.length - 1, rng = W.rng(seed);
    const model = new Int8Array(n + 1);
    for (let v = 1; v <= n; v++) model[v] = rng() < 0.5 ? 1 : -1;
    const sat = c => c.some(l => (l > 0 ? model[l] : -model[-l]) === 1);
    const unsatList = () => { const u = []; for (let i = 0; i < ints.length; i++) if (!sat(ints[i])) u.push(i); return u; };
    rec && rec({ line: 'w1', kind: 'init', unsat: unsatList().length, assign: model.slice() });
    for (let i = 1; i <= maxFlips; i++) {
      const u = unsatList();
      if (!u.length) { rec && rec({ line: 'w3', kind: 'done', unsat: 0, flips: i - 1, assign: model.slice() }); return { model: new Map(names.slice(1).map((nm, j) => [nm, model[j + 1] > 0])), flips: i - 1 }; }
      const ci = u[Math.floor(rng() * u.length)], c = ints[ci];
      let v, kind;
      if (rng() <= p) { v = Math.abs(c[Math.floor(rng() * c.length)]); kind = 'random'; }
      else {
        let best = -1;
        for (const l of c) {
          const s = Math.abs(l); model[s] = -model[s];
          let cnt = 0; for (const cc of ints) if (sat(cc)) cnt++;
          model[s] = -model[s];
          if (cnt > best) { best = cnt; v = s; }
        }
        kind = 'greedy';
      }
      model[v] = -model[v];
      rec && rec({ line: kind === 'random' ? 'w6' : 'w7', kind, sym: names[v], val: model[v] > 0, clause: c.map(l => (l < 0 ? '¬' : '') + names[Math.abs(l)]), unsat: unsatList().length, assign: model.slice() });
    }
    rec && rec({ line: 'w8', kind: 'fail', unsat: unsatList().length, assign: model.slice() });
    return null;
  };

  /* ---------- PL-RESOLUTION (Figure 7.13) ----------
   * Only pairs that contain a complementary literal can produce a resolvent, so we index by literal.
   * New pairs are formed only with at least one clause from the previous round (same result, no repeats). */
  /* With sos (set of support, §9.5.6): every resolution must involve a clause descended from ¬α.
   * Pass `support` = the clauses of ¬α; they must also be included in `clauses`. */
  L.resolution = function (clauses, { cap = 4000, support = null } = {}) {
    const all = [], index = new Map(), keys = new Map();
    const supKeys = support ? new Set(support.map(c => c.join('|'))) : null;
    const add = (c, parents, round, lit, sos) => {
      const k = c.join('|');
      if (keys.has(k)) return null;
      const node = { id: all.length, c, parents, round, lit, sos };
      all.push(node); keys.set(k, node.id);
      for (const l of c) { if (!index.has(l)) index.set(l, []); index.get(l).push(node.id); }
      return node;
    };
    clauses.forEach(c => add(c, null, 0, null, !supKeys || supKeys.has(c.join('|'))));
    const rounds = [{ round: 0, pairs: 0, added: all.length }];
    let frontier = all.filter(n => n.sos).map(n => n.id), round = 0;
    while (true) {
      round++;
      const end = all.length, inFront = new Set(frontier); let pairs = 0, added = 0, empty = null;
      const next = [];
      outer:
      for (const i of frontier) {
        const ci = all[i];
        for (const l of ci.c) {
          for (const j of index.get(L.neg(l)) || []) {
            if (j >= end || (inFront.has(j) && j < i)) continue;   // each pair once per round
            const cj = all[j]; pairs++;
            const r = L.normClause(ci.c.filter(x => x !== l).concat(cj.c.filter(x => x !== L.neg(l))));
            if (!r) continue;
            const node = add(r, [ci.id, j], round, l.replace('¬', ''), true);
            if (node) { added++; next.push(node.id); if (!r.length) { empty = node; break outer; } }
            if (all.length > cap) break outer;
          }
        }
      }
      rounds.push({ round, pairs, added });
      if (empty) return { entailed: true, all, rounds, empty: empty.id, proof: proofOf(all, empty.id) };
      if (all.length > cap) return { entailed: null, all, rounds, capped: true };
      if (!added) return { entailed: false, all, rounds };
      frontier = next;
    }
  };
  /* Given-clause loop with set of support + unit preference (§9.5.6): repeatedly pick the SHORTEST
   * unprocessed support clause, resolve it against everything processed so far, queue the resolvents. */
  L.resolutionGiven = function (clauses, support, { cap = 5000 } = {}) {
    const all = [], keys = new Map(), processedIdx = new Map();
    const supKeys = new Set(support.map(c => c.join('|')));
    const heap = [];     // [len, id]
    const pushQ = id => {      // keep the queue sorted by (length, id) with a binary-search insert
      const item = [all[id].c.length, id];
      let lo = 0, hi = heap.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (heap[m][0] < item[0] || (heap[m][0] === item[0] && heap[m][1] < id)) lo = m + 1; else hi = m; }
      heap.splice(lo, 0, item);
    };
    const add = (c, parents, lit) => {
      const k = c.join('|');
      if (keys.has(k)) return null;
      const node = { id: all.length, c, parents, lit, round: 0 };
      all.push(node); keys.set(k, node.id);
      return node;
    };
    const markProcessed = id => { for (const l of all[id].c) { if (!processedIdx.has(l)) processedIdx.set(l, []); processedIdx.get(l).push(id); } };
    for (const c of clauses) { const n = add(c, null, null); if (!n) continue; if (supKeys.has(c.join('|'))) pushQ(n.id); else markProcessed(n.id); }
    let pairs = 0, given = 0;
    const rounds = [{ round: 0, pairs: 0, added: all.length }];
    while (heap.length) {
      const [, gi] = heap.shift(); given++;
      const g = all[gi]; g.round = given;
      let added = 0;
      for (const l of g.c) {
        for (const j of (processedIdx.get(L.neg(l)) || []).slice()) {
          pairs++;
          const r = L.normClause(g.c.filter(x => x !== l).concat(all[j].c.filter(x => x !== L.neg(l))));
          if (!r) continue;
          const node = add(r, [gi, j], l.replace('¬', ''));
          if (!node) continue;
          added++;
          if (!r.length) { rounds.push({ round: given, pairs, added, given: L.showClause(g.c) }); return { entailed: true, all, rounds, empty: node.id, proof: proofOf(all, node.id), pairs, given }; }
          pushQ(node.id);
          if (all.length > cap) return { entailed: null, all, rounds, capped: true, pairs, given };
        }
      }
      markProcessed(gi);
      rounds.push({ round: given, pairs, added, given: L.showClause(g.c) });
    }
    return { entailed: false, all, rounds, pairs, given };
  };

  function proofOf(all, id) {
    const seen = new Set(), order = [];
    (function visit(i) { if (seen.has(i)) return; seen.add(i); const n = all[i]; if (n.parents) n.parents.forEach(visit); order.push(i); })(id);
    return order;
  }

  /* ---------- PL-FC-ENTAILS (Figure 7.15) on definite clauses ----------
   * rules: [{premises:[sym...], conclusion: sym, label}]  (facts have no premises) */
  L.forwardChain = function (rules, q, { rec } = {}) {
    const count = rules.map(r => r.premises.length);
    const inferred = new Map(), byPremise = new Map();
    rules.forEach((r, i) => r.premises.forEach(p => { if (!byPremise.has(p)) byPremise.set(p, []); byPremise.get(p).push(i); }));
    const queue = rules.filter(r => !r.premises.length).map(r => ({ s: r.conclusion, rule: rules.indexOf(r) }));
    rec && rec({ line: 'c3', kind: 'init', queue: queue.map(x => x.s) });
    const why = new Map();
    while (queue.length) {
      const { s: p, rule } = queue.shift();
      rec && rec({ line: 'c5', kind: 'pop', sym: p, rule, queue: queue.map(x => x.s) });
      if (p === q) { if (!why.has(p)) why.set(p, rule); rec && rec({ line: 'c6', kind: 'found', sym: p, queue: queue.map(x => x.s) }); return { entailed: true, inferred, why }; }
      if (!inferred.get(p)) {
        inferred.set(p, true); why.set(p, rule);
        rec && rec({ line: 'c8', kind: 'infer', sym: p, rule, queue: queue.map(x => x.s) });
        for (const ci of byPremise.get(p) || []) {
          count[ci]--;
          if (count[ci] === 0) { queue.push({ s: rules[ci].conclusion, rule: ci }); rec && rec({ line: 'c11', kind: 'fire', sym: rules[ci].conclusion, rule: ci, queue: queue.map(x => x.s) }); }
        }
      } else rec && rec({ line: 'c7', kind: 'skip', sym: p, queue: queue.map(x => x.s) });
    }
    rec && rec({ line: 'c12', kind: 'fail', queue: [] });
    return { entailed: q == null ? null : false, inferred, why };
  };

  /* Backward chaining for definite clauses (AND-OR search, §7.5.4). Produces a proof tree. */
  L.backwardChain = function (rules, q, { rec, maxNodes = 4000 } = {}) {
    const byHead = new Map();
    rules.forEach((r, i) => { if (!byHead.has(r.conclusion)) byHead.set(r.conclusion, []); byHead.get(r.conclusion).push(i); });
    const nodes = [], memo = new Map();
    function prove(g, parent, path, depth) {
      const node = { id: nodes.length, goal: g, parent, rule: null, ok: false, depth, kids: [], note: '' };
      nodes.push(node);
      if (nodes.length > maxNodes) throw new Error('node cap');
      rec && rec({ kind: 'goal', node: node.id });
      // Only successes are cached: a failure may just be a loop cut on this particular path.
      if (memo.has(g)) { node.ok = true; node.note = 'already proved'; rec && rec({ kind: 'ok', node: node.id }); return true; }
      if (path.has(g)) { node.note = 'loop: goal already on the path'; rec && rec({ kind: 'fail', node: node.id }); return false; }
      path.add(g);
      for (const ri of byHead.get(g) || []) {
        const r = rules[ri];
        node.rule = ri; rec && rec({ kind: 'try', node: node.id, rule: ri });
        const start = node.kids.length;
        let all = true;
        for (const p of r.premises) {
          const child = nodes.length; node.kids.push(child);
          if (!prove(p, node.id, path, depth + 1)) { all = false; break; }
        }
        if (all) { node.ok = true; path.delete(g); memo.set(g, true); rec && rec({ kind: 'ok', node: node.id, rule: ri }); return true; }
        node.kids.length = start;   // discard failed attempt's children from the displayed proof
        node.failed = (node.failed || 0) + 1;
      }
      path.delete(g); node.rule = null;
      node.note = byHead.has(g) ? 'every rule failed' : 'no rule concludes this';
      rec && rec({ kind: 'fail', node: node.id });
      return false;
    }
    const ok = prove(q, null, new Set(), 0);
    return { ok, nodes };
  };

  /* ---------- TT-ENTAILS (Figure 7.10) with an explicit symbol list ----------
   * kb(model) and alpha(model) are predicates over a Map; returns every enumerated model. */
  L.ttEntails = function (symbols, kb, alpha) {
    const models = [];
    let entailed = true;
    const m = new Map();
    (function check(i) {
      if (i === symbols.length) {
        const k = kb(m), a = k ? alpha(m) : null;
        models.push({ assign: new Map(m), kb: k, alpha: a });
        if (k && !a) entailed = false;
        return;
      }
      m.set(symbols[i], true); check(i + 1);
      m.set(symbols[i], false); check(i + 1);
      m.delete(symbols[i]);
    })(0);
    return { entailed, models };
  };

  L.PSEUDO = {
    tt: { caption: 'Figure 7.10: truth-table enumeration for deciding entailment', lines: [
      ['', 'function TT-ENTAILS?(KB, α) returns true or false'],
      ['t1', '  symbols ← a list of the proposition symbols in KB and α'],
      ['t2', '  return TT-CHECK-ALL(KB, α, symbols, { })'],
      ['', ''],
      ['', 'function TT-CHECK-ALL(KB, α, symbols, model) returns true or false'],
      ['t3', '  if EMPTY?(symbols) then'],
      ['t4', '    if PL-TRUE?(KB, model) then return PL-TRUE?(α, model)'],
      ['t5', '    else return true   // when KB is false, always return true'],
      ['t6', '  else'],
      ['t7', '    P ← FIRST(symbols); rest ← REST(symbols)'],
      ['t8', '    return (TT-CHECK-ALL(KB, α, rest, model ∪ {P = true})'],
      ['t9', '            and TT-CHECK-ALL(KB, α, rest, model ∪ {P = false}))'],
    ] },
    res: { caption: 'Figure 7.13: a simple resolution algorithm for propositional logic', lines: [
      ['', 'function PL-RESOLUTION(KB, α) returns true or false'],
      ['r1', '  clauses ← the set of clauses in the CNF representation of KB ∧ ¬α'],
      ['r2', '  new ← { }'],
      ['r3', '  while true do'],
      ['r4', '    for each pair of clauses Ci, Cj in clauses do'],
      ['r5', '      resolvents ← PL-RESOLVE(Ci, Cj)'],
      ['r6', '      if resolvents contains the empty clause then return true'],
      ['r7', '      new ← new ∪ resolvents'],
      ['r8', '    if new ⊆ clauses then return false'],
      ['r9', '    clauses ← clauses ∪ new'],
    ] },
    fc: { caption: 'Figure 7.15: forward chaining for propositional logic', lines: [
      ['', 'function PL-FC-ENTAILS?(KB, q) returns true or false'],
      ['c1', '  count ← a table, where count[c] is initially the number of symbols in c.PREMISE'],
      ['c2', '  inferred ← a table, where inferred[s] is initially false for all symbols'],
      ['c3', '  queue ← a queue of symbols, initially symbols known to be true in KB'],
      ['c4', '  while queue is not empty do'],
      ['c5', '    p ← POP(queue)'],
      ['c6', '    if p = q then return true'],
      ['c7', '    if inferred[p] = false then'],
      ['c8', '      inferred[p] ← true'],
      ['c9', '      for each clause c in KB where p is in c.PREMISE do'],
      ['c10', '        decrement count[c]'],
      ['c11', '        if count[c] = 0 then add c.CONCLUSION to queue'],
      ['c12', '  return false'],
    ] },
    dpll: { caption: 'Figure 7.17: the DPLL algorithm for checking satisfiability', lines: [
      ['', 'function DPLL-SATISFIABLE?(s) returns true or false'],
      ['p0', '  clauses ← the set of clauses in the CNF representation of s'],
      ['', '  symbols ← a list of the proposition symbols in s'],
      ['', '  return DPLL(clauses, symbols, { })'],
      ['', ''],
      ['', 'function DPLL(clauses, symbols, model) returns true or false'],
      ['p1', '  if every clause in clauses is true in model then return true'],
      ['p2', '  if some clause in clauses is false in model then return false'],
      ['p3', '  P, value ← FIND-PURE-SYMBOL(symbols, clauses, model)'],
      ['p4', '  if P is non-null then return DPLL(clauses, symbols – P, model ∪ {P=value})'],
      ['p5', '  P, value ← FIND-UNIT-CLAUSE(clauses, model)'],
      ['p6', '  if P is non-null then return DPLL(clauses, symbols – P, model ∪ {P=value})'],
      ['', '  P ← FIRST(symbols); rest ← REST(symbols)'],
      ['p7', '  return DPLL(clauses, rest, model ∪ {P=true}) or'],
      ['p8', '         DPLL(clauses, rest, model ∪ {P=false})'],
    ] },
    walksat: { caption: 'Figure 7.18: the WALKSAT algorithm', lines: [
      ['', 'function WALKSAT(clauses, p, max_flips) returns a satisfying model or failure'],
      ['w1', '  model ← a random assignment of true/false to the symbols in clauses'],
      ['w2', '  for each i = 1 to max_flips do'],
      ['w3', '    if model satisfies clauses then return model'],
      ['w4', '    clause ← a randomly selected clause from clauses that is false in model'],
      ['w5', '    if RANDOM(0, 1) ≤ p then'],
      ['w6', '      flip the value in model of a randomly selected symbol from clause'],
      ['w7', '    else flip whichever symbol in clause maximizes the number of satisfied clauses'],
      ['w8', '  return failure'],
    ] },
  };
})(window.W);
