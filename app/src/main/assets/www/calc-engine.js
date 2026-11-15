"use strict";
/* ============================================================
   fx-991ES PLUS 2nd edition clone — calc-engine.js (BACK-END)
   Pure calculation core: no DOM. Browser / file:// / Node.
   tokenizer -> AST parser -> exact rational (BigInt) arithmetic,
   DEG/RAD/GRA trig with exact special values, factorial,
   nPr/nCr, powers, roots, logs, hyperbolics, DMS, %,
   Pol/Rec coordinate conversion, numerical S integral & d/dx.
   ============================================================ */
const CalcEngine = (function () {

  function err(m) { const e = new Error(m); e.calc = true; return e; }

  /* ---------- exact rationals + floats ---------- */
  function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { const t = a % b; a = b; b = t; } return a; }
  function Q(n, d) {
    if (d === 0n) throw err('Math ERROR');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d); return { t: 'q', n: n / g, d: d / g };
  }
  const QI = (v) => Q(BigInt(Math.round(v)), 1n);
  const F = (v) => ({ t: 'f', v });
  const isQ = (x) => x.t === 'q';
  const isF = (x) => x.t === 'f';
  const toF = (x) => isQ(x) ? Number(x.n) / Number(x.d) : x.v;

  function add(a, b) { return isQ(a) && isQ(b) ? Q(a.n * b.d + b.n * a.d, a.d * b.d) : F(toF(a) + toF(b)); }
  const neg = (x) => isQ(x) ? Q(-x.n, x.d) : F(-x.v);
  function sub(a, b) { return add(a, neg(b)); }
  function mul(a, b) { return isQ(a) && isQ(b) ? Q(a.n * b.n, a.d * b.d) : F(toF(a) * toF(b)); }
  function div(a, b) {
    if (isQ(b) ? b.n === 0n : b.v === 0) throw err('Math ERROR');
    return isQ(a) && isQ(b) ? Q(a.n * b.d, a.d * b.n) : F(toF(a) / toF(b));
  }
  function isqrt(n) { if (n < 2n) return n; let x = n; for (;;) { const y = (x + n / x) / 2n; if (y >= x) return x; x = y; } }
  function sqrt(a) {
    if (isQ(a)) {
      if (a.n < 0n) throw err('Math ERROR');
      const rn = isqrt(a.n), rd = isqrt(a.d);
      if (rn * rn === a.n && rd * rd === a.d) return Q(rn, rd);
    }
    const v = toF(a); if (v < 0) throw err('Math ERROR'); return F(Math.sqrt(v));
  }
  function fact(a) {
    if (!isQ(a) || a.d !== 1n) throw err('Argument ERROR');
    if (a.n < 0n || a.n > 5000n) throw err('Math ERROR');
    let r = 1n; for (let i = 2n; i <= a.n; i++) r *= i; return Q(r, 1n);
  }
  function pow(a, b) {
    if (isQ(b) && b.d === 1n) {
      const e = b.n;
      if (isQ(a)) {
        if (e >= 0n) return Q(a.n ** e, a.d ** e);
        if (a.n === 0n) throw err('Math ERROR');
        return Q(a.d ** (-e), a.n ** (-e));
      }
      const r = Math.pow(a.v, Number(e));
      if (Number.isNaN(r)) throw err('Math ERROR');
      return F(r);
    }
    const r = Math.pow(toF(a), toF(b));
    if (Number.isNaN(r) || !isFinite(r)) throw err('Math ERROR');
    return F(r);
  }
  function combArgs(a, b) {
    if (!isQ(a) || !isQ(b) || a.d !== 1n || b.d !== 1n) throw err('Argument ERROR');
    const n = a.n, k = b.n;
    if (k < 0n || n < 0n || k > n || n > 5000n) throw err('Argument ERROR');
    return { n, k };
  }
  function nPr(a, b) { const c = combArgs(a, b); let p = 1n; for (let i = 0n; i < c.k; i++) p *= c.n - i; return Q(p, 1n); }
  function nCr(a, b) { const c = combArgs(a, b); let p = 1n; for (let i = 1n; i <= c.k; i++) p = p * (c.n - c.k + i) / i; return Q(p, 1n); }

  /* ---------- angles ---------- */
  const DEG = Math.PI / 180, GRA = Math.PI / 200;
  const toRad = (x, m) => { const v = toF(x); return m === 'D' ? v * DEG : m === 'G' ? v * GRA : v; };
  const fromRad = (v, m) => m === 'D' ? v / DEG : m === 'G' ? v / GRA : v;

  /* exact trig for whole degrees (DEG mode) */
  function exactTrig(id, x) {
    if (x.d !== 1n) return null;
    let k = Number(x.n % 360n); if (k < 0) k += 360;
    const S = { 0: '0', 30: '1/2', 90: '1', 150: '1/2', 180: '0', 210: '-1/2', 270: '-1', 330: '-1/2' };
    const C = { 0: '1', 60: '1/2', 90: '0', 120: '-1/2', 180: '-1', 240: '-1/2', 270: '0', 300: '1/2', 360: '1' };
    const T = { 0: '0', 45: '1', 135: '-1', 180: '0', 225: '1', 315: '-1' };
    if (id === 'tan' && (k === 90 || k === 270)) throw err('Math ERROR');
    const s = id === 'sin' ? S[k] : id === 'cos' ? C[k] : T[k];
    if (s === undefined) return null;
    const p = s.split('/'); return Q(BigInt(p[0]), BigInt(p[1] || '1'));
  }
  function exactInvTrig(id, x) {
    const key = x.n + '/' + x.d;
    const AS = { '0/1': '0', '1/2': '30', '1/1': '90', '-1/2': '-30', '-1/1': '-90' };
    const AC = { '1/1': '0', '1/2': '60', '0/1': '90', '-1/2': '120', '-1/1': '180' };
    const AT = { '1/1': '45', '-1/1': '-45' };
    const s = id === 'asin' ? AS[key] : id === 'acos' ? AC[key] : AT[key];
    return s === undefined ? null : Q(BigInt(s), 1n);
  }

  /* ---------- tokenizer ---------- */
  const IDENTS = ['Ran#', 'asinh', 'acosh', 'atanh', 'sinh', 'cosh', 'tanh',
    'asin', 'acos', 'atan', 'logb', 'sqrt', 'cbrt', 'xrt', 'ddx', 'nPr', 'nCr',
    'Pol', 'Rec', 'Ans', 'intg', 'int', 'log', 'ln', 'abs', 'sin', 'cos', 'tan', '√', '∫'];
  const FUNCS1 = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
    'asinh', 'acosh', 'atanh', 'log', 'ln', 'sqrt', 'cbrt', 'abs', 'int', 'intg', '√']);
  const FUNCS2 = new Set(['logb', 'xrt', 'Pol', 'Rec', 'ddx']);
  const FUNCS3 = new Set(['∫']);
  const CONSTS = new Set(['π', 'e']);

  function tokenize(str) {
    const toks = []; let i = 0; const n = str.length;
    while (i < n) {
      const c = str[i];
      if (c === ' ') { i++; continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(str.slice(i)))) {
        toks.push({ k: 'num', v: m[0], s: i, e: i + m[0].length }); i += m[0].length; continue;
      }
      const rest = str.slice(i);
      let hit = null;
      for (const id of IDENTS) if (rest.startsWith(id)) { hit = id; break; }
      if (hit) { toks.push({ k: 'id', v: hit, s: i, e: i + hit.length }); i += hit.length; continue; }
      if (c === 'π') { toks.push({ k: 'id', v: 'π', s: i, e: i + 1 }); i++; continue; }
      if (c === 'E') {
        const prev = toks[toks.length - 1];
        if (prev && ((prev.k === 'num') || (prev.k === 'op' && prev.v === ')'))) {
          toks.push({ k: 'op', v: 'E', s: i, e: i + 1 }); i++; continue;
        }
        if (i + 1 < n && /[0-9\-(]/.test(str[i + 1])) { toks.push({ k: 'op', v: 'E', s: i, e: i + 1 }); i++; continue; }
        toks.push({ k: 'id', v: 'E', s: i, e: i + 1 }); i++; continue;
      }
      if (/[A-DF-Za-df-z]/.test(c)) { toks.push({ k: 'id', v: c, s: i, e: i + 1 }); i++; continue; }
      if (c === '−') { toks.push({ k: 'op', v: '−', s: i, e: i + 1 }); i++; continue; }
      if ('+-×÷/^!%°,()'.includes(c)) { toks.push({ k: 'op', v: c, s: i, e: i + 1 }); i++; continue; }
      if (c === "'" || c === '"') { toks.push({ k: 'op', v: c, s: i, e: i + 1 }); i++; continue; }
      throw err('Syntax ERROR');
    }
    return toks;
  }

  /* ---------- parser: string -> AST ---------- */
  function parse(str) {
    const toks = tokenize(str); let i = 0;
    const peek = () => toks[i];
    const eat = () => toks[i++];
    const isFS = (t) => t && (t.k === 'num' || t.k === 'id' || (t.k === 'op' && t.v === '('));

    function parseExpr() {
      let l = parseTerm();
      for (;;) {
        const t = peek();
        if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) { eat(); l = { n: 'bin', op: t.v, l, r: parseTerm() }; }
        else break;
      }
      return l;
    }
    function parseTerm() {
      let l = parseUnary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.k === 'op' && (t.v === '×' || t.v === '÷' || t.v === '/')) { eat(); l = { n: 'bin', op: t.v, l, r: parseUnary() }; continue; }
        if (t.k === 'id' && (t.v === 'nPr' || t.v === 'nCr')) { eat(); l = { n: 'bin', op: t.v, l, r: parseUnary() }; continue; }
        if (t.k === 'op' && t.v === '−') { l = { n: 'bin', op: 'imp', l, r: parseUnary() }; continue; }
        if (isFS(t)) { l = { n: 'bin', op: 'imp', l, r: parseUnary() }; continue; }
        break;
      }
      return l;
    }
    function parseUnary() {
      const t = peek();
      if (t && t.k === 'op' && (t.v === '-' || t.v === '−')) { eat(); return { n: 'neg', x: parseUnary() }; }
      return parsePow();
    }
    function parsePow() {
      const b = parsePostfix();
      const t = peek();
      if (t && t.k === 'op' && t.v === '^') { eat(); return { n: 'pow', b, e: parseUnary() }; }
      return b;
    }
    function parsePostfix() {
      let x = parseAtom();
      for (;;) {
        const t = peek();
        if (!t || t.k !== 'op') break;
        if (t.v === '!' || t.v === '%') { eat(); x = { n: 'post', op: t.v, x }; continue; }
        if (t.v === '°') {
          eat();
          let mm = null, ss = null;
          const t2 = peek();
          if (t2 && t2.k === 'num') {
            mm = eat().v;
            const t3 = peek();
            if (t3 && t3.k === 'op' && t3.v === "'") {
              eat();
              const t4 = peek();
              if (t4 && t4.k === 'num') {
                ss = eat().v;
                const t5 = peek();
                if (t5 && t5.k === 'op' && t5.v === '"') eat();
              }
            }
          }
          x = { n: 'dms', d: x, m: mm, s: ss }; continue;
        }
        break;
      }
      return x;
    }
    function parseArgs() {
      const args = [parseExpr()];
      for (;;) {
        const t = peek();
        if (t && t.k === 'op' && t.v === ',') { eat(); args.push(parseExpr()); }
        else break;
      }
      return args;
    }
    function parseAtom() {
      const t = peek();
      if (!t) return { n: 'empty' };
      if (t.k === 'num') {
        eat();
        let node = { n: 'num', v: t.v };
        const t2 = peek();
        if (t2 && t2.k === 'op' && t2.v === 'E') { eat(); node = { n: 'e10', m: node, e: parseUnary() }; }
        return node;
      }
      if (t.k === 'op' && t.v === '(') {
        eat(); const inner = parseExpr();
        if (peek() && peek().v === ')') eat();
        return { n: 'grp', x: inner };
      }
      if (t.k === 'id') {
        eat();
        if (CONSTS.has(t.v)) return { n: 'const', id: t.v };
        if (FUNCS1.has(t.v) || FUNCS2.has(t.v) || FUNCS3.has(t.v)) {
          if (peek() && peek().v === '(') eat();
          const args = parseArgs();
          if (peek() && peek().v === ')') eat();
          return { n: 'call', id: t.v, args };
        }
        return { n: 'var', id: t.v };
      }
      throw err('Syntax ERROR');
    }
    if (!toks.length) throw err('Syntax ERROR');
    const ast = parseExpr();
    if (i < toks.length) throw err('Syntax ERROR');
    return ast;
  }

  /* ---------- evaluation ---------- */
  function numToVal(s) {
    if (s.includes('.')) { const p = s.split('.'); return Q(BigInt((p[0] || '0') + p[1]), 10n ** BigInt(p[1].length)); }
    return Q(BigInt(s), 1n);
  }
  function simpson(f, a, b) {
    const N = 4096; if (a === b) return 0;
    const h = (b - a) / N; let s = f(a) + f(b);
    for (let i = 1; i < N; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return s * h / 3;
  }
  function callFn(node, env) {
    const id = node.id, A = node.args;
    const ev = (j) => evalNode(A[j], env);
    if (id === '∫') {
      if (A.length !== 3) throw err('Argument ERROR');
      const a = toF(ev(1)), b = toF(ev(2));
      const g = (x) => toF(evalNode(A[0], { angle: env.angle, vars: Object.assign({}, env.vars, { X: F(x) }) }));
      let r; try { r = simpson(g, a, b); } catch (e) { throw err('Math ERROR'); }
      if (Number.isNaN(r) || !isFinite(r)) throw err('Math ERROR');
      return F(r);
    }
    if (id === 'ddx') {
      if (A.length !== 2) throw err('Argument ERROR');
      const x0 = toF(ev(1)), h = 1e-6;
      const g = (x) => toF(evalNode(A[0], { angle: env.angle, vars: Object.assign({}, env.vars, { X: F(x) }) }));
      return F((g(x0 + h) - g(x0 - h)) / (2 * h));
    }
    if (id === 'logb') { if (A.length !== 2) throw err('Argument ERROR'); return F(Math.log(toF(ev(0))) / Math.log(toF(ev(1)))); }
    if (id === 'xrt') { if (A.length !== 2) throw err('Argument ERROR'); return pow(ev(1), div(Q(1n, 1n), ev(0))); }
    if (id === 'Pol') {
      if (A.length !== 2) throw err('Argument ERROR');
      const x = ev(0), y = ev(1);
      const r = sqrt(add(mul(x, x), mul(y, y)));
      const th = F(fromRad(Math.atan2(toF(y), toF(x)), env.angle));
      return { t: 'call', v: r, extra: { label: 'θ', v: th } };
    }
    if (id === 'Rec') {
      if (A.length !== 2) throw err('Argument ERROR');
      const r = toF(ev(0)), th = toRad(ev(1), env.angle);
      return { t: 'call', v: F(r * Math.cos(th)), extra: { label: 'y', v: F(r * Math.sin(th)) } };
    }
    if (A.length !== 1) throw err('Argument ERROR');
    const x = ev(0);
    switch (id) {
      case 'sin': case 'cos': case 'tan': {
        if (env.angle === 'D' && isQ(x)) { const q = exactTrig(id, x); if (q) return q; }
        const r = Math[id](toRad(x, env.angle));
        if (Math.abs(r) < 1e-15) return Q(0n, 1n);
        return F(r);
      }
      case 'asin': case 'acos': case 'atan': {
        if (env.angle === 'D' && isQ(x)) { const q = exactInvTrig(id, x); if (q) return q; }
        return F(fromRad(Math[id === 'asin' ? 'asin' : id === 'acos' ? 'acos' : 'atan'](toF(x)), env.angle));
      }
      case 'sinh': return F(Math.sinh(toF(x)));
      case 'cosh': return F(Math.cosh(toF(x)));
      case 'tanh': return F(Math.tanh(toF(x)));
      case 'asinh': return F(Math.asinh(toF(x)));
      case 'acosh': { const v = Math.acosh(toF(x)); if (Number.isNaN(v)) throw err('Math ERROR'); return F(v); }
      case 'atanh': { const v = Math.atanh(toF(x)); if (Number.isNaN(v)) throw err('Math ERROR'); return F(v); }
      case 'log': { const v = Math.log10(toF(x)); if (Number.isNaN(v)) throw err('Math ERROR'); return F(v); }
      case 'ln': { const v = Math.log(toF(x)); if (Number.isNaN(v)) throw err('Math ERROR'); return F(v); }
      case 'sqrt': case '√': return sqrt(x);
      case 'cbrt': return F(Math.cbrt(toF(x)));
      case 'abs': return isQ(x) ? Q(x.n < 0n ? -x.n : x.n, x.d) : F(Math.abs(x.v));
      case 'int': { const v = toF(x); return F(v < 0 ? Math.ceil(v) : Math.floor(v)); }
      case 'intg': return F(Math.floor(toF(x)));
    }
    throw err('Syntax ERROR');
  }

  function evalNode(node, env) {
    switch (node.n) {
      case 'num': return numToVal(node.v);
      case 'const': return node.id === 'π' ? F(Math.PI) : F(Math.E);
      case 'var': { const nm = node.id.toUpperCase(); const v = env.vars[nm]; return v === undefined ? Q(0n, 1n) : v; }
      case 'grp': return evalNode(node.x, env);
      case 'neg': return neg(evalNode(node.x, env));
      case 'bin': {
        const l = evalNode(node.l, env), r = evalNode(node.r, env);
        switch (node.op) {
          case '+': return add(l, r);
          case '-': return sub(l, r);
          case '×': case 'imp': return mul(l, r);
          case '÷': case '/': return div(l, r);
          case 'nPr': return nPr(l, r);
          case 'nCr': return nCr(l, r);
        }
        throw err('Syntax ERROR');
      }
      case 'pow': return pow(evalNode(node.b, env), evalNode(node.e, env));
      case 'post': { const x = evalNode(node.x, env); return node.op === '!' ? fact(x) : div(x, Q(100n, 1n)); }
      case 'dms': {
        const d = toF(evalNode(node.d, env));
        const v = d + (node.m ? parseFloat(node.m) / 60 : 0) + (node.s ? parseFloat(node.s) / 3600 : 0);
        const rad = v * DEG;
        return F(env.angle === 'D' ? v : env.angle === 'R' ? rad : rad / DEG * GRA);
      }
      case 'e10': return mul(evalNode(node.m, env), pow(Q(10n, 1n), evalNode(node.e, env)));
      case 'call': return callFn(node, env);
      case 'empty': throw err('Syntax ERROR');
    }
    throw err('Syntax ERROR');
  }

  function evaluate(str, env) {
    const ast = parse(str);
    const r = evalNode(ast, env || { vars: {} });
    const v = (r && r.t === 'call') ? r.v : r;
    if (isQ(v) && v.d === 0n) throw err('Math ERROR');
    if (isF(v) && !isFinite(v.v)) throw err('Math ERROR');
    return { value: v, extra: r.extra || null };
  }

  /* decimal -> exact fraction via continued fractions (S<=>D) */
  function floatToRat(v) {
    if (!isFinite(v)) throw err('Math ERROR');
    if (Number.isInteger(v)) return QI(v);
    const tol = 1e-12;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1, x = v;
    for (let i = 0; i < 64; i++) {
      const a = Math.floor(x);
      const h = a * h1 + h2, k = a * k1 + k2;
      if (k > 1e10) break;
      if (Math.abs(v - h / k) < tol) return Q(BigInt(h), BigInt(k));
      h2 = h1; h1 = h; k2 = k1; k1 = k;
      x = 1 / (x - a);
      if (!isFinite(x)) break;
    }
    const sc = 1e12;
    return Q(BigInt(Math.round(v * sc)), BigInt(sc));
  }
  const r10 = (x) => isQ(x) ? x : F(parseFloat(x.v.toPrecision(10)));

  return { tokenize, parse, evaluate, Q, F, QI, isQ, toF, floatToRat, r10,
    FUNCS1, FUNCS2, FUNCS3, CONSTS, err };
})();
