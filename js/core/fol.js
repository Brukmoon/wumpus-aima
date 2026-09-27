/* First-order logic for Chapters 8–10: terms, formulas, parser, printer, evaluation in a model,
 * unification (Figure 9.1), CNF with Skolemization (§9.5.1), forward chaining (Figure 9.3),
 * backward chaining (Figure 9.6) and resolution with unification (§9.5).
 *
 * Terms:    {v:'x'} variable (lowercase) · {c:'Agent'} / {c:'2'} constant · {f:'F', args:[...]} function.
 *           A square [x,y] is the function term Sq(x, y) and prints as [x,y].
 * Formulas: {op:'atom', p, args} · {op:'eq', a, b} · {op:'not', a} · {op:'and'|'or', args} · {op:'imp'|'iff', a, b}
 *           · {op:'all'|'ex', v, body} · {op:'true'|'false'}
 */
(function (W) {
  'use strict';
  const F = W.FOL = {};

  /* ---------- constructors & printing ---------- */
  F.V = v => ({ v }); F.C = c => ({ c: String(c) }); F.Fn = (f, ...args) => ({ f, args });
  F.Sq = (x, y) => ({ f: 'Sq', args: [typeof x === 'object' ? x : F.C(x), typeof y === 'object' ? y : F.C(y)] });
  F.sqKey = k => { const [x, y] = W.parse(k); return F.Sq(x, y); };
  F.Atom = (p, ...args) => ({ op: 'atom', p, args });
  F.not = a => ({ op: 'not', a }); F.and = (...a) => a.length === 1 ? a[0] : { op: 'and', args: a }; F.or = (...a) => a.length === 1 ? a[0] : { op: 'or', args: a };
  F.imp = (a, b) => ({ op: 'imp', a, b }); F.iff = (a, b) => ({ op: 'iff', a, b });

  F.showT = function st(t) {
    if (t.v) return t.v;
    if (t.c != null) return t.c;
    if (t.f === 'Sq') return `[${st(t.args[0])},${st(t.args[1])}]`;
    if ((t.f === '+' || t.f === '−') && t.args.length === 2) return `${st(t.args[0])} ${t.f} ${st(t.args[1])}`;
    return `${t.f}(${t.args.map(st).join(', ')})`;
  };
  const PREC = { iff: 1, imp: 2, or: 3, and: 4, not: 5, all: 0.5, ex: 0.5, atom: 6, eq: 6, true: 6, false: 6 };
  F.show = function sh(s, outer = 0) {
    let r;
    switch (s.op) {
      case 'atom': return s.args.length ? `${s.p}(${s.args.map(F.showT).join(', ')})` : s.p;
      case 'eq': return `${F.showT(s.a)} = ${F.showT(s.b)}`;
      case 'true': return 'True';
      case 'false': return 'False';
      case 'not': return s.a.op === 'eq' ? `${F.showT(s.a.a)} ≠ ${F.showT(s.a.b)}` : '¬' + sh(s.a, PREC.not);
      case 'and': r = s.args.map(a => sh(a, PREC.and + 0.5)).join(' ∧ '); break;
      case 'or': r = s.args.map(a => sh(a, PREC.or + 0.5)).join(' ∨ '); break;
      case 'imp': r = sh(s.a, PREC.imp + 0.5) + ' ⇒ ' + sh(s.b, PREC.imp); break;
      case 'iff': r = sh(s.a, PREC.iff + 0.5) + ' ⇔ ' + sh(s.b, PREC.iff + 0.5); break;
      case 'all': case 'ex': {
        // merge consecutive quantifiers of the same kind: ∀x,y
        const vs = [s.v]; let b = s.body;
        while (b.op === s.op) { vs.push(b.v); b = b.body; }
        r = (s.op === 'all' ? '∀' : '∃') + vs.join(',') + ' ' + sh(b, 0.6); break;
      }
    }
    return PREC[s.op] < outer ? '(' + r + ')' : r;
  };
  F.showLit = l => (l.neg ? '¬' : '') + F.show(l.atom);
  F.showClause = c => c.length ? c.map(F.showLit).join(' ∨ ') : '□ (empty clause)';
  F.showSubst = th => { const e = Object.entries(th); return e.length ? '{' + e.map(([k, v]) => `${k}/${F.showT(v)}`).join(', ') + '}' : '{ }'; };

  /* ---------- parser ----------
   * lowercase identifier = variable; Capitalized identifier or number = constant; Name(...) = predicate/function;
   * [a,b] = square; ∀x,y / ∃x (also "forall x", "exists x"); ¬ ∧ ∨ ⇒ ⇔ = ≠ + − */
  F.parse = function (text) {
    const re = /\s*(∀|∃|forall\b|exists\b|<=>|<->|⇔|=>|->|⇒|≠|!=|¬|~|∧|&|∨|\||\(|\)|\[|\]|,|=|\+|−|-|[A-Za-z_][A-Za-z0-9_]*|\d+)/y;
    const toks = []; let pos = 0;
    while (pos < text.length) {
      re.lastIndex = pos; const m = re.exec(text);
      if (!m) { if (/^\s*$/.test(text.slice(pos))) break; throw new Error('Cannot parse near: ' + text.slice(pos, pos + 12)); }
      toks.push(m[1]); pos = re.lastIndex;
    }
    let i = 0;
    const peek = () => toks[i], eat = t => { if (toks[i] !== t) throw new Error(`Expected "${t}" but found "${toks[i] || 'end'}"`); i++; };
    const isVar = t => /^[a-z]/.test(t);
    function formula() { return iff(); }
    function iff() { let a = imp(); while (['⇔', '<=>', '<->'].includes(peek())) { i++; a = F.iff(a, imp()); } return a; }
    function imp() { const a = or(); if (['⇒', '=>', '->'].includes(peek())) { i++; return F.imp(a, imp()); } return a; }
    function or() { const xs = [and()]; while (['∨', '|'].includes(peek())) { i++; xs.push(and()); } return F.or(...xs); }
    function and() { const xs = [un()]; while (['∧', '&'].includes(peek())) { i++; xs.push(un()); } return F.and(...xs); }
    function un() {
      const t = peek();
      if (['¬', '~'].includes(t)) { i++; return F.not(un()); }
      if (['∀', '∃', 'forall', 'exists'].includes(t)) {
        i++; const q = (t === '∀' || t === 'forall') ? 'all' : 'ex';
        const vs = [toks[i++]]; while (peek() === ',') { i++; vs.push(toks[i++]); }
        if (vs.some(v => !v || !isVar(v))) throw new Error('Quantified variables must be lowercase names');
        let body = formula();   // AIMA convention: the quantifier scope extends as far right as possible
        for (let k = vs.length - 1; k >= 0; k--) body = { op: q, v: vs[k], body };
        return body;
      }
      if (t === '(') { i++; const f = formula(); eat(')'); return f; }
      if (t === 'True') { i++; return { op: 'true' }; }
      if (t === 'False') { i++; return { op: 'false' }; }
      // atom or equality
      if (t && /^[A-Z]/.test(t) && toks[i + 1] === '(') {
        // could be a predicate, or a function term on the left of "="; decide after parsing
        const save = i;
        const name = toks[i++]; eat('(');
        const args = []; if (peek() !== ')') { args.push(term()); while (peek() === ',') { i++; args.push(term()); } }
        eat(')');
        if (['=', '≠', '!='].includes(peek())) { i = save; return equality(); }
        return F.Atom(name, ...args);
      }
      if (t && /^[A-Z]/.test(t) && !['=', '≠', '!='].includes(toks[i + 1])) { i++; return F.Atom(t); }
      return equality();
    }
    function equality() {
      const a = term(), op = peek();
      if (!['=', '≠', '!='].includes(op)) throw new Error(`Expected a formula near "${op || 'end'}"`);
      i++; const b = term();
      const e = { op: 'eq', a, b };
      return op === '=' ? e : F.not(e);
    }
    function term() {
      let a = primary();
      while (['+', '−', '-'].includes(peek())) { const o = toks[i++] === '+' ? '+' : '−'; a = { f: o, args: [a, primary()] }; }
      return a;
    }
    function primary() {
      const t = toks[i];
      if (t === '[') { i++; const a = term(); eat(','); const b = term(); eat(']'); return { f: 'Sq', args: [a, b] }; }
      if (t && /^\d+$/.test(t)) { i++; return F.C(t); }
      if (t && isVar(t)) { i++; return F.V(t); }
      if (t && /^[A-Z]/.test(t)) {
        i++;
        if (peek() === '(') { eat('('); const args = [term()]; while (peek() === ',') { i++; args.push(term()); } eat(')'); return { f: t, args }; }
        return F.C(t);
      }
      throw new Error('Expected a term near "' + (t || 'end') + '"');
    }
    const f = formula();
    if (i < toks.length) throw new Error('Unexpected "' + toks[i] + '"');
    return f;
  };
  F.parseTerm = function (text) { const s = F.parse(`Q(${text})`); return s.args[0]; };

  /* ---------- evaluation in a model (Chapter 8 interpretation explorer) ----------
   * model: { domain: [values], preds: {Name: (…values) → bool}, funcs: {Name: (…values) → value}, consts: {Name: value} }
   * Values: numbers, square strings "x,y", or named objects. */
  F.evalTerm = function et(t, M, env) {
    if (t.v) { if (!(t.v in env)) throw new Error(`Free variable ${t.v}`); return env[t.v]; }
    if (t.c != null) { if (/^\d+$/.test(t.c)) return +t.c; if (t.c in M.consts) return M.consts[t.c]; return t.c; }
    const args = t.args.map(a => et(a, M, env));
    if (t.f === 'Sq') return (Number.isInteger(args[0]) && Number.isInteger(args[1]) && W.inside(args[0], args[1], M.n)) ? W.key(args[0], args[1]) : 'none';
    if (t.f === '+') return typeof args[0] === 'number' && typeof args[1] === 'number' ? args[0] + args[1] : 'none';
    if (t.f === '−') return typeof args[0] === 'number' && typeof args[1] === 'number' ? args[0] - args[1] : 'none';
    if (!(t.f in M.funcs)) throw new Error(`Unknown function ${t.f}`);
    return M.funcs[t.f](...args);
  };
  F.evaluate = function ev(s, M, env = {}, stats) {
    if (stats) stats.n++;
    switch (s.op) {
      case 'true': return true; case 'false': return false;
      case 'atom': { if (!(s.p in M.preds)) throw new Error(`Unknown predicate ${s.p}`); return !!M.preds[s.p](...s.args.map(a => F.evalTerm(a, M, env))); }
      case 'eq': return F.evalTerm(s.a, M, env) === F.evalTerm(s.b, M, env);
      case 'not': return !ev(s.a, M, env, stats);
      case 'and': return s.args.every(a => ev(a, M, env, stats));
      case 'or': return s.args.some(a => ev(a, M, env, stats));
      case 'imp': return !ev(s.a, M, env, stats) || ev(s.b, M, env, stats);
      case 'iff': return ev(s.a, M, env, stats) === ev(s.b, M, env, stats);
      case 'all': return M.domain.every(d => ev(s.body, M, Object.assign({}, env, { [s.v]: d }), stats));
      case 'ex': return M.domain.some(d => ev(s.body, M, Object.assign({}, env, { [s.v]: d }), stats));
    }
  };
  F.freeVars = function fv(s, bound = new Set(), out = new Set()) {
    const tv = t => { if (t.v) { if (!bound.has(t.v)) out.add(t.v); } else if (t.args) t.args.forEach(tv); };
    switch (s.op) {
      case 'atom': s.args.forEach(tv); break;
      case 'eq': tv(s.a); tv(s.b); break;
      case 'not': fv(s.a, bound, out); break;
      case 'and': case 'or': s.args.forEach(a => fv(a, bound, out)); break;
      case 'imp': case 'iff': fv(s.a, bound, out); fv(s.b, bound, out); break;
      case 'all': case 'ex': { const b = new Set(bound); b.add(s.v); fv(s.body, b, out); break; }
    }
    return out;
  };

  /* ---------- substitution & unification ---------- */
  F.substT = function st(th, t) {
    if (t.v) return th[t.v] && !(th[t.v].v === t.v) ? st(th, th[t.v]) : t;
    if (t.args) return { f: t.f, args: t.args.map(a => st(th, a)) };
    return t;
  };
  F.subst = function ss(th, s) {
    switch (s.op) {
      case 'atom': return { op: 'atom', p: s.p, args: s.args.map(a => F.substT(th, a)) };
      case 'eq': return { op: 'eq', a: F.substT(th, s.a), b: F.substT(th, s.b) };
      case 'not': return F.not(ss(th, s.a));
      case 'and': case 'or': return { op: s.op, args: s.args.map(a => ss(th, a)) };
      case 'imp': case 'iff': return { op: s.op, a: ss(th, s.a), b: ss(th, s.b) };
      case 'all': case 'ex': { const t2 = Object.assign({}, th); delete t2[s.v]; return { op: s.op, v: s.v, body: ss(t2, s.body) }; }
      default: return s;
    }
  };
  const teq = (a, b) => F.showT(a) === F.showT(b);
  const occurs = (v, t, th) => { if (t.v) return t.v === v || (th[t.v] ? occurs(v, th[t.v], th) : false); return !!t.args && t.args.some(a => occurs(v, a, th)); };

  /* UNIFY (Figure 9.1) over terms/atoms. With rec, logs each call for the stepper. Returns θ or null. */
  F.unify = function (x, y, th = {}, rec, depth = 0) {
    const log = (line, msg) => rec && rec({ line, msg, theta: Object.assign({}, th || {}), depth });
    if (th === null) return null;
    const sx = F.showAny(x), sy = F.showAny(y);
    if (sx === sy) { log('u2', `${sx} and ${sy} are identical`); return th; }
    if (x.v) return unifyVar(x, y, th, rec, depth);
    if (y.v) return unifyVar(y, x, th, rec, depth);
    const cx = x.op === 'atom' ? { name: x.p, args: x.args } : x.f ? { name: x.f, args: x.args } : null;
    const cy = y.op === 'atom' ? { name: y.p, args: y.args } : y.f ? { name: y.f, args: y.args } : null;
    if (cx && cy) {
      if (cx.name !== cy.name || cx.args.length !== cy.args.length) { log('u9', `${cx.name} and ${cy.name} can't be unified (different symbol or arity): failure`); return null; }
      log('u5', `compound: unify the arguments of ${sx} and ${sy} one by one`);
      for (let k = 0; k < cx.args.length && th; k++) th = F.unify(cx.args[k], cy.args[k], th, rec, depth + 1);
      return th;
    }
    log('u9', `${sx} and ${sy} are different constants: failure`);
    return null;
  };
  function unifyVar(v, x, th, rec, depth) {
    const log = (line, msg) => rec && rec({ line, msg, theta: Object.assign({}, th), depth });
    if (th[v.v]) { log('v1', `${v.v} is already bound to ${F.showT(th[v.v])}: unify that with ${F.showAny(x)}`); return F.unify(th[v.v], x, th, rec, depth + 1); }
    if (x.v && th[x.v]) { log('v2', `${x.v} is already bound to ${F.showT(th[x.v])}: unify ${v.v} with that`); return F.unify(v, th[x.v], th, rec, depth + 1); }
    if (occurs(v.v, x, th)) { log('v3', `occur check: ${v.v} occurs inside ${F.showAny(x)}: failure`); return null; }
    const th2 = Object.assign({}, th, { [v.v]: x });
    rec && rec({ line: 'v4', msg: `bind ${v.v}/${F.showAny(x)}`, theta: th2, depth });
    return th2;
  }
  F.showAny = x => x.op ? F.show(x) : F.showT(x);
  F.resolveSubst = th => { const o = {}; for (const k in th) o[k] = F.substT(th, th[k]); return o; };

  /* ---------- standardizing apart ---------- */
  let fresh = 0;
  F.renameT = (t, map) => t.v ? (map[t.v] = map[t.v] || { v: t.v + '_' + (++fresh) }) : t.args ? { f: t.f, args: t.args.map(a => F.renameT(a, map)) } : t;
  F.renameAtom = (a, map) => ({ op: 'atom', p: a.p, args: a.args.map(t => F.renameT(t, map)) });

  /* ---------- definite clauses: forward chaining (Figure 9.3) ----------
   * rule: { premises: [atom], conclusion: atom, label } ; facts: [atom] (ground) */
  F.forwardChain = function (rules, facts, { query, maxRounds = 30 } = {}) {
    const known = new Map(); const add = a => known.set(F.show(a), a);
    facts.forEach(add);
    const byPred = () => { const m = new Map(); for (const a of known.values()) { if (!m.has(a.p)) m.set(a.p, []); m.get(a.p).push(a); } return m; };
    const ev = [{ line: 'f1', kind: 'start', msg: `KB starts with ${known.size} ground facts and ${rules.length} rules`, known: new Set(known.keys()), round: 0 }];
    for (let round = 1; round <= maxRounds; round++) {
      const idx = byPred(), fresh = [];
      ev.push({ line: 'f2', kind: 'round', msg: `round ${round}: try every rule against the current facts`, known: new Set(known.keys()), round });
      for (const [ri, rule] of rules.entries()) {
        // find every θ that makes all premises match known facts (a join)
        const thetas = [];
        (function match(k, th) {
          if (k === rule.premises.length) { thetas.push(th); return; }
          for (const f of idx.get(rule.premises[k].p) || []) { const t2 = F.unify(rule.premises[k], f, th); if (t2) match(k + 1, t2); }
        })(0, {});
        for (const th of thetas) {
          const q = F.subst(th, rule.conclusion), key = F.show(q);
          if (known.has(key) || fresh.some(x => x.key === key)) continue;
          fresh.push({ key, q });
          ev.push({ line: 'f6', kind: 'infer', rule: ri, theta: th, fact: key, msg: `${rule.label}: θ = ${F.showSubst(F.resolveSubst(th))} ⇒ ${key}`, known: new Set([...known.keys(), ...fresh.map(x => x.key)]), round });
          if (query) { const phi = F.unify(q, query, {}); if (phi) { ev.push({ line: 'f8', kind: 'answer', fact: key, theta: phi, msg: `${key} unifies with the query: return ${F.showSubst(phi)}`, known: new Set([...known.keys(), ...fresh.map(x => x.key)]), round }); return { ev, known, answer: phi }; } }
        }
      }
      if (!fresh.length) { ev.push({ line: 'f9', kind: 'fixpoint', msg: `round ${round} produced nothing new: fixed point${query ? ', query not entailed' : ''}`, known: new Set(known.keys()), round }); break; }
      fresh.forEach(x => add(x.q));
    }
    return { ev, known, answer: null };
  };

  /* ---------- definite clauses: backward chaining (Figure 9.6), as generators ---------- */
  F.backwardChain = function (rules, facts, query, { maxAnswers = 200, maxEvents = 20000 } = {}) {
    const clauses = facts.map(f => ({ premises: [], conclusion: f, label: 'fact' })).concat(rules);
    const ev = [], answers = [];
    let nid = 0, proofs = 0;
    const log = e => { ev.push(e); if (ev.length > maxEvents) throw new Error('event cap'); };
    function* bcOr(goal, th, depth, parent) {
      const g = F.subst(th, goal), id = ++nid;
      log({ line: 'o1', kind: 'goal', id, parent, depth, goal: F.show(g), msg: `goal ${F.show(g)}`, theta: th });
      let any = false;
      for (const [ci, c] of clauses.entries()) {
        if (c.conclusion.p !== g.p) continue;
        const map = {}, rhs = F.renameAtom(c.conclusion, map), lhs = c.premises.map(p => F.renameAtom(p, map));
        const t2 = F.unify(rhs, g, th);
        if (!t2) continue;
        if (c.premises.length) log({ line: 'o3', kind: 'rule', id, depth, goal: F.show(g), rule: ci, msg: `try rule “${c.label}”: ${lhs.map(F.show).join(' ∧ ')} ⇒ ${F.show(rhs)}`, theta: t2 });
        for (const t3 of bcAnd(lhs, t2, depth + 1, id)) {
          any = true;
          if (c.premises.length || !F.freeVars(g).size) log({ line: 'o4', kind: 'yield', id, depth, goal: F.show(F.subst(t3, goal)), msg: `proved ${F.show(F.subst(t3, goal))}${c.premises.length ? '' : ' (fact)'}`, theta: t3 });
          yield t3;
        }
      }
      if (!any) log({ line: 'o5', kind: 'fail', id, depth, goal: F.show(g), msg: `no way to prove ${F.show(g)}`, theta: th });
    }
    function* bcAnd(goals, th, depth, parent) {
      if (!goals.length) { yield th; return; }
      const [first, ...rest] = goals;
      for (const t1 of bcOr(first, th, depth, parent)) for (const t2 of bcAnd(rest, t1, depth, parent)) yield t2;
    }
    try {
      for (const th of bcOr(query, {}, 0, 0)) {
        const ans = F.subst(th, query), key = F.show(ans);
        proofs++;
        if (answers.some(a => a.atom === key)) { log({ line: 'q1', kind: 'dup', id: 0, depth: 0, goal: key, msg: `another proof of ${key} (already an answer)`, theta: th }); continue; }
        answers.push({ theta: th, atom: key });
        log({ line: 'q1', kind: 'answer', id: 0, depth: 0, goal: key, msg: `answer #${answers.length}: ${key}`, theta: th });
        if (answers.length >= maxAnswers) break;
      }
    } catch (e) { ev.push({ line: '', kind: 'cap', depth: 0, msg: 'stopped: too many steps' }); }
    return { ev, answers, proofs };
  };

  /* ---------- CNF with Skolemization (§9.5.1) ---------- */
  F.cnfSteps = function (s) {
    const steps = [];
    const elim = x => {
      switch (x.op) {
        case 'iff': { const a = elim(x.a), b = elim(x.b); return F.and(F.or(F.not(a), b), F.or(F.not(b), a)); }
        case 'imp': return F.or(F.not(elim(x.a)), elim(x.b));
        case 'not': return F.not(elim(x.a));
        case 'and': case 'or': return { op: x.op, args: x.args.map(elim) };
        case 'all': case 'ex': return { op: x.op, v: x.v, body: elim(x.body) };
        default: return x;
      }
    };
    const nnf = x => {
      if (x.op === 'not') {
        const a = x.a;
        if (a.op === 'not') return nnf(a.a);
        if (a.op === 'and') return F.or(...a.args.map(y => nnf(F.not(y))));
        if (a.op === 'or') return F.and(...a.args.map(y => nnf(F.not(y))));
        if (a.op === 'all') return { op: 'ex', v: a.v, body: nnf(F.not(a.body)) };
        if (a.op === 'ex') return { op: 'all', v: a.v, body: nnf(F.not(a.body)) };
        return x;
      }
      if (x.op === 'and' || x.op === 'or') return { op: x.op, args: x.args.map(nnf) };
      if (x.op === 'all' || x.op === 'ex') return { op: x.op, v: x.v, body: nnf(x.body) };
      return x;
    };
    let counter = 0;
    const standardize = (x, map = {}) => {
      switch (x.op) {
        case 'all': case 'ex': { const nv = x.v + (++counter > 1 ? counter - 1 : ''); const m2 = Object.assign({}, map, { [x.v]: { v: nv } }); return { op: x.op, v: nv, body: standardize(x.body, m2) }; }
        case 'and': case 'or': return { op: x.op, args: x.args.map(y => standardize(y, map)) };
        case 'not': return F.not(standardize(x.a, map));
        default: return renameOnly(map, x);
      }
    };
    // plain one-step variable renaming (no chaining through the map)
    const rt = (map, t) => t.v ? (map[t.v] || t) : t.args ? { f: t.f, args: t.args.map(a => rt(map, a)) } : t;
    const renameOnly = (map, x) => x.op === 'atom' ? { op: 'atom', p: x.p, args: x.args.map(a => rt(map, a)) } : x.op === 'eq' ? { op: 'eq', a: rt(map, x.a), b: rt(map, x.b) } : x;
    let sk = 0;
    const skolem = (x, univ = []) => {
      switch (x.op) {
        case 'all': return { op: 'all', v: x.v, body: skolem(x.body, univ.concat([x.v])) };
        case 'ex': { const name = 'F' + (++sk); const t = univ.length ? { f: name, args: univ.map(F.V) } : F.C('C' + sk); return skolem(F.subst({ [x.v]: t }, x.body), univ); }
        case 'and': case 'or': return { op: x.op, args: x.args.map(y => skolem(y, univ)) };
        case 'not': return F.not(skolem(x.a, univ));
        default: return x;
      }
    };
    const dropAll = x => x.op === 'all' ? dropAll(x.body) : (x.op === 'and' || x.op === 'or') ? { op: x.op, args: x.args.map(dropAll) } : x.op === 'not' ? F.not(dropAll(x.a)) : x;
    const clausesOf = x => {
      switch (x.op) {
        case 'and': return [].concat(...x.args.map(clausesOf));
        case 'or': { let acc = [[]]; for (const a of x.args) { const cs = clausesOf(a), nx = []; for (const p of acc) for (const q of cs) nx.push(p.concat(q)); acc = nx; } return acc; }
        case 'not': return [[{ neg: true, atom: x.a }]];
        case 'true': return [];
        default: return [[{ neg: false, atom: x }]];
      }
    };
    const e = elim(s); steps.push(['1. eliminate ⇔ and ⇒', F.show(e)]);
    const n = nnf(e); steps.push(['2. move ¬ inwards (¬∀x p ≡ ∃x ¬p)', F.show(n)]);
    const st = standardize(n); steps.push(['3. standardize variables', F.show(st)]);
    const sk_ = skolem(st); steps.push(['4. Skolemize (∃ inside ∀ becomes a Skolem function)', F.show(sk_)]);
    const d = dropAll(sk_); steps.push(['5. drop universal quantifiers', F.show(d)]);
    const cl = clausesOf(d).map(c => { const seen = new Map(); c.forEach(l => seen.set(F.showLit(l), l)); return [...seen.values()]; })
      .filter(c => !c.some(l => c.some(m => m.neg !== l.neg && F.show(m.atom) === F.show(l.atom))));
    steps.push(['6. distribute ∨ over ∧', cl.map(c => '(' + F.showClause(c) + ')').join(' ∧ ')]);
    return { steps, clauses: cl };
  };

  /* ---------- resolution with unification: given-clause loop, set of support, unit preference ---------- */
  F.resolution = function (kbClauses, support, { cap = 1500, maxDepth = 3 } = {}) {
    const all = [], keys = new Set(), queue = [], index = new Map();
    const key = c => c.map(F.showLit).sort().join(' | ');
    const rename = c => { const map = {}; return c.map(l => ({ neg: l.neg, atom: F.renameAtom(l.atom, map) })); };
    const depth = t => t.args ? 1 + Math.max(0, ...t.args.filter(a => a.f !== 'Sq').map(depth)) : 0;
    const tooDeep = c => c.some(l => l.atom.args.some(t => t.f && t.f !== 'Sq' && depth(t) > maxDepth));
    const add = (c, parents, theta, sos) => {
      const k = key(c); if (keys.has(k)) return null;
      keys.add(k); const n = { id: all.length, c, parents, theta, sos }; all.push(n); return n;
    };
    const indexIt = id => { for (const l of all[id].c) { const k = (l.neg ? '-' : '+') + l.atom.p; if (!index.has(k)) index.set(k, []); index.get(k).push(id); } };
    kbClauses.forEach(c => { const n = add(c, null, null, false); if (n) indexIt(n.id); });
    support.forEach(c => { const n = add(c, null, null, true); if (n) queue.push(n.id); });
    let pairs = 0, dropped = 0;
    while (queue.length) {
      queue.sort((a, b) => all[a].c.length - all[b].c.length || a - b);
      const gi = queue.shift(), g = all[gi];
      indexIt(gi);
      const partners = new Set();
      for (const l of g.c) for (const id of index.get((l.neg ? '+' : '-') + l.atom.p) || []) partners.add(id);
      for (const oi of partners) {
        const A = rename(g.c), B = rename(all[oi].c);
        for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
          if (A[i].neg === B[j].neg || A[i].atom.p !== B[j].atom.p) continue;
          pairs++;
          const th = F.unify(A[i].atom, B[j].atom, {});
          if (!th) continue;
          let r = A.filter((_, k) => k !== i).concat(B.filter((_, k) => k !== j)).map(l => ({ neg: l.neg, atom: F.subst(th, l.atom) }));
          // merge identical literals (simple factoring), drop tautologies and over-deep Skolem terms
          const m = new Map(); r.forEach(l => m.set(F.showLit(l), l)); r = [...m.values()];
          if (r.some(l => r.some(k => k.neg !== l.neg && F.show(k.atom) === F.show(l.atom)))) continue;
          if (tooDeep(r)) { dropped++; continue; }
          const n = add(r, [gi, oi], F.resolveSubst(th), true);
          if (!n) continue;
          if (!r.length) return { proved: true, all, empty: n.id, proof: proofOf(all, n.id), pairs };
          queue.push(n.id);
          if (all.length > cap) return { proved: null, all, pairs, capped: true };
        }
      }
    }
    return { proved: false, all, pairs, dropped };
  };
  function proofOf(all, id) {
    const seen = new Set(), order = [];
    (function visit(i) { if (seen.has(i)) return; seen.add(i); const n = all[i]; if (n.parents) n.parents.forEach(visit); order.push(i); })(id);
    return order;
  }

  F.PSEUDO = {
    unify: { caption: 'Figure 9.1: the unification algorithm', lines: [
      ['', 'function UNIFY(x, y, θ = empty) returns a substitution to make x and y identical, or failure'],
      ['u1', '  if θ = failure then return failure'],
      ['u2', '  else if x = y then return θ'],
      ['u3', '  else if VARIABLE?(x) then return UNIFY-VAR(x, y, θ)'],
      ['u4', '  else if VARIABLE?(y) then return UNIFY-VAR(y, x, θ)'],
      ['u5', '  else if COMPOUND?(x) and COMPOUND?(y) then'],
      ['u6', '    return UNIFY(ARGS(x), ARGS(y), UNIFY(OP(x), OP(y), θ))'],
      ['u7', '  else if LIST?(x) and LIST?(y) then'],
      ['u8', '    return UNIFY(REST(x), REST(y), UNIFY(FIRST(x), FIRST(y), θ))'],
      ['u9', '  else return failure'],
      ['', ''],
      ['', 'function UNIFY-VAR(var, x, θ) returns a substitution'],
      ['v1', '  if {var/val} ∈ θ for some val then return UNIFY(val, x, θ)'],
      ['v2', '  else if {x/val} ∈ θ for some val then return UNIFY(var, val, θ)'],
      ['v3', '  else if OCCUR-CHECK?(var, x) then return failure'],
      ['v4', '  else return add {var/x} to θ'],
    ] },
    fc: { caption: 'Figure 9.3: a conceptually straightforward, but inefficient, forward-chaining algorithm', lines: [
      ['', 'function FOL-FC-ASK(KB, α) returns a substitution or false'],
      ['f1', '  while true do'],
      ['f2', '    new ← { }'],
      ['f3', '    for each rule in KB do'],
      ['f4', '      (p1 ∧ … ∧ pn ⇒ q) ← STANDARDIZE-VARIABLES(rule)'],
      ['f5', '      for each θ such that SUBST(θ, p1 ∧ … ∧ pn) = SUBST(θ, p′1 ∧ … ∧ p′n) for some p′1, …, p′n in KB'],
      ['f6', '        q′ ← SUBST(θ, q); if q′ does not unify with some sentence already in KB or new then'],
      ['f7', '          add q′ to new'],
      ['f8', '          φ ← UNIFY(q′, α); if φ is not failure then return φ'],
      ['f9', '    if new = { } then return false'],
      ['', '    add new to KB'],
    ] },
    bc: { caption: 'Figure 9.6: a simple backward-chaining algorithm for first-order knowledge bases', lines: [
      ['q1', 'function FOL-BC-ASK(KB, query) returns a generator of substitutions'],
      ['', '  return FOL-BC-OR(KB, query, { })'],
      ['', ''],
      ['o1', 'function FOL-BC-OR(KB, goal, θ) returns a substitution'],
      ['o2', '  for each rule in FETCH-RULES-FOR-GOAL(KB, goal) do'],
      ['o3', '    (lhs ⇒ rhs) ← STANDARDIZE-VARIABLES(rule)'],
      ['o4', '    for each θ′ in FOL-BC-AND(KB, lhs, UNIFY(rhs, goal, θ)) do yield θ′'],
      ['o5', '  (nothing yielded: the goal fails)'],
      ['', ''],
      ['', 'function FOL-BC-AND(KB, goals, θ) returns a substitution'],
      ['', '  if θ = failure then return'],
      ['', '  else if LENGTH(goals) = 0 then yield θ'],
      ['', '  else'],
      ['', '    first, rest ← FIRST(goals), REST(goals)'],
      ['', '    for each θ′ in FOL-BC-OR(KB, SUBST(θ, first), θ) do'],
      ['', '      for each θ″ in FOL-BC-AND(KB, rest, θ′) do yield θ″'],
    ] },
  };
})(window.W);
