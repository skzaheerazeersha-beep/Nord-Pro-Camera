"use strict";
/* ============================================================
   fx-991ES PLUS 2nd edition clone — app.js (FRONT-END)
   Natural Display renderer + Casio-style UI + keyboard support.
   Talks to the CalcEngine back-end only via CalcEngine.* APIs.
   ============================================================ */
(function () {
  const E = CalcEngine;
  const $ = (id) => document.getElementById(id);

  /* ---------------- state ---------------- */
  const S = {
    str: '', cur: 0,
    shift: false, alpha: false, sto: false, rcl: false,
    off: false, err: null,
    ans: E.Q(0n, 1n), preAns: E.Q(0n, 1n),
    vars: {}, angle: 'D', fmt: { t: 'Norm', n: 1 },
    overwrite: false, justEq: false,
    hist: [], hIdx: -1,
    resVal: null, resExtra: null, resOn: false,
    sdFrac: false, mixed: false, eng: 0, dmsView: false, drgView: false,
    menu: null, fixWait: null,
  };
  const ALPHA = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', exp: 'X', ans: 'Y', mplus: 'M' };
  const FRESH = /^([0-9.(π√∫]|Ans|R)/;

  /* ================= Natural Display renderer ================= */
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function frac(a, b) {
    return '<span class="frac"><span class="fn">' + a + '</span><span class="fd">' + b + '</span></span>';
  }
  function rad(inner, idx) {
    return (idx ? '<sup>' + idx + '</sup>' : '') +
      '<span class="sqrt"><span class="rad">&#8730;</span><span class="vinc">' + inner + '</span></span>';
  }
  const FNAMES = {
    asin: 'sin<sup>-1</sup>', acos: 'cos<sup>-1</sup>', atan: 'tan<sup>-1</sup>',
    asinh: 'sinh<sup>-1</sup>', acosh: 'cosh<sup>-1</sup>', atanh: 'tanh<sup>-1</sup>',
    log: 'log', ln: 'ln', abs: 'Abs', int: 'Int', intg: 'Intg',
    sin: 'sin', cos: 'cos', tan: 'tan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
    Pol: 'Pol', Rec: 'Rec', ddx: 'd/dx',
  };
  const BOX = '<span class="box"></span>';

  function renderMath(str, cur, overwrite) {
    let toks = [];
    try { toks = E.tokenize(str); } catch (e) { toks = []; }
    let i = 0, emitted = false;
    const cursorCls = ' class="cur' + (overwrite ? ' ovr' : '') + '"';
    function curAt(p) {
      if (cur >= 0 && !emitted && p >= cur) { emitted = true; return '<span' + cursorCls + '></span>'; }
      return '';
    }
    function numHtml(tok) {
      if (cur >= tok.s && cur <= tok.e && cur >= 0) {
        emitted = true;
        return esc(tok.v.slice(0, cur - tok.s)) + '<span' + cursorCls + '></span>' + esc(tok.v.slice(cur - tok.s));
      }
      return esc(tok.v);
    }
    const peek = () => toks[i];
    const eat = () => toks[i++];
    const isFS = (t) => t && (t.k === 'num' || t.k === 'id' || (t.k === 'op' && t.v === '('));

    function parseExpr() {
      let h = parseTerm();
      for (;;) {
        const t = peek();
        if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) { eat(); h += curAt(t.s) + esc(t.v) + parseTerm(); }
        else break;
      }
      return h;
    }
    function parseTerm() {
      const items = [{ pre: '', f: parseUnary() }];
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.k === 'op' && (t.v === '×' || t.v === '÷' || t.v === '/')) {
          eat();
          if (t.v === '/') {
            const rhs = parseUnary();
            const last = items[items.length - 1];
            last.f = frac(last.f === '' ? BOX : last.f, rhs === '' ? BOX : rhs);
          } else {
            items.push({ pre: curAt(t.s) + esc(t.v), f: parseUnary() });
          }
          continue;
        }
        if (t.k === 'id' && (t.v === 'nPr' || t.v === 'nCr')) { eat(); items.push({ pre: curAt(t.s) + t.v, f: parseUnary() }); continue; }
        if (t.k === 'op' && t.v === '−') { items.push({ pre: '', f: parseUnary() }); continue; }
        if (isFS(t)) { items.push({ pre: '', f: parseUnary() }); continue; }
        break;
      }
      let h = items[0].f;
      for (let k = 1; k < items.length; k++) h += items[k].pre + items[k].f;
      return h;
    }
    function parseUnary() {
      const t = peek();
      if (t && t.k === 'op' && (t.v === '-' || t.v === '−')) { eat(); return curAt(t.s) + '&#8722;' + parseUnary(); }
      return parsePow();
    }
    function parsePow() {
      let b = parsePostfix();
      const t = peek();
      if (t && t.k === 'op' && t.v === '^') {
        eat();
        b += curAt(t.s) + '<sup>' + parseUnary() + '</sup>';
      }
      return b;
    }
    function parsePostfix() {
      let x = parseAtom();
      for (;;) {
        const t = peek();
        if (!t || t.k !== 'op') break;
        if (t.v === '!' || t.v === '%') { eat(); x += curAt(t.s) + esc(t.v); continue; }
        if (t.v === '°') {
          eat();
          x += curAt(t.s) + '&#176;';
          const t2 = peek();
          if (t2 && t2.k === 'num') {
            x += numHtml(eat());
            const t3 = peek();
            if (t3 && t3.k === 'op' && t3.v === "'") {
              eat(); x += curAt(t3.s) + '&#8242;';
              const t4 = peek();
              if (t4 && t4.k === 'num') {
                x += numHtml(eat());
                const t5 = peek();
                if (t5 && t5.k === 'op' && t5.v === '"') { eat(); x += curAt(t5.s) + '&#8243;'; }
              }
            }
          }
          continue;
        }
        break;
      }
      return x;
    }
    function parseArgsHtml() {
      const parts = [parseExpr()];
      for (;;) {
        const t = peek();
        if (t && t.k === 'op' && t.v === ',') { eat(); parts.push(curAt(t.s) + ',' + parseExpr()); }
        else break;
      }
      return parts;
    }
    function parseAtom() {
      const t = peek();
      if (!t) return '';
      if (t.k === 'num') {
        eat();
        let h = numHtml(t);
        const t2 = peek();
        if (t2 && t2.k === 'op' && t2.v === 'E') {
          eat();
          h += curAt(t2.s) + '<span class="e10">&#215;10</span><sup>' + parseUnary() + '</sup>';
        }
        return h;
      }
      if (t.k === 'op' && t.v === '(') {
        eat();
        let h = curAt(t.s) + '(';
        h += curAt(t.e) + parseExpr();
        const t2 = peek();
        if (t2 && t2.v === ')') { h += curAt(t2.s) + ')'; eat(); }
        else h += BOX;
        return h;
      }
      if (t.k === 'id') {
        eat();
        const name = t.v;
        if (E.CONSTS.has(name) || (!E.FUNCS1.has(name) && !E.FUNCS2.has(name) && !E.FUNCS3.has(name))) {
          return curAt(t.s) + esc(name);
        }
        const hasP = peek() && peek().v === '(';
        let h = curAt(t.s) + (FNAMES[name] || esc(name));
        if (hasP) { const tp = eat(); h += curAt(tp.s) + '('; }
        const parts = parseArgsHtml();
        const joined = parts.join(',') || BOX;
        if (name === 'sqrt' || name === '√') h = curAt(t.s) + rad(joined);
        else if (name === 'cbrt') h = curAt(t.s) + rad(joined, '3');
        else if (name === 'xrt') h = curAt(t.s) + rad(parts[1] || BOX, parts[0] || BOX);
        else if (name === 'logb') h = curAt(t.s) + 'log<sub>' + (parts[1] || BOX) + '</sub>(' + (parts[0] || BOX) + ')';
        else if (name === '∫') h = curAt(t.s) + '&#8747;(' + joined + ')';
        else if (name === 'ddx') h = curAt(t.s) + 'd/dx(' + joined + ')';
        else h += joined;
        const t2 = peek();
        if (t2 && t2.v === ')') { h += curAt(t2.s) + ')'; eat(); }
        else if (hasP) h += BOX;
        return h;
      }
      return '';
    }

    if (!str) return '<span' + cursorCls + '></span>';
    let html = parseExpr();
    if (!emitted) html += curAt(str.length + 1);
    return html;
  }

  /* ================= number formatting ================= */
  function strip0(s) {
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  function expForm(v, sig, eng) {
    let e = Math.floor(Math.log10(Math.abs(v)));
    let m = v / Math.pow(10, e);
    if (eng) { const k = Math.floor(e / 3) * 3; m = v / Math.pow(10, k); e = k; }
    m = parseFloat(m.toPrecision(eng ? 10 : sig));
    if (!eng && Math.abs(m) >= 10) { m /= 10; e += 1; }
    return strip0(String(m)) + '<span class="e10">&#215;10</span><sup>' + e + '</sup>';
  }
  function fmtFloat(v) {
    if (Object.is(v, -0) || v === 0) return '0';
    const a = Math.abs(v);
    if (S.fmt.t === 'Fix') {
      try { return strip0(v.toFixed(S.fmt.n)); } catch (e) { return String(v); }
    }
    if (S.fmt.t === 'Sci') return expForm(v, S.fmt.n, S.eng !== 0);
    const cut = S.fmt.n === 2 ? 1e-9 : 1e-2;
    if (a >= 1e10 || a < cut) return expForm(v, 10, S.eng !== 0);
    return strip0(String(parseFloat(v.toPrecision(10))));
  }
  function fmtFrac(q) {
    let n = q.n, d = q.d;
    const neg = n < 0n; if (neg) n = -n;
    let whole = null, rn = n;
    if (S.mixed && n > d) { whole = n / d; rn = n % d; }
    const sign = neg ? '&#8722;' : '';
    if (rn === 0n) return sign + (whole !== null ? whole.toString() : '0');
    if (d === 1n) return sign + rn.toString();
    return sign + (whole !== null ? whole.toString() : '') +
      '<span class="frac"><span class="fn">' + rn + '</span><span class="fd">' + d + '</span></span>';
  }
  function fmtDMS(v) {
    const neg = v < 0; v = Math.abs(v);
    let d = Math.floor(v); let rem = (v - d) * 60;
    let m = Math.floor(rem); let ss = (rem - m) * 60;
    ss = Math.round(ss * 1e10) / 1e10;
    if (ss >= 60) { ss = 0; m++; } if (m >= 60) { m = 0; d++; }
    return (neg ? '&#8722;' : '') + d + '&#176;' + m + '&#8242;' + strip0(String(parseFloat(ss.toPrecision(10)))) + '&#8243;';
  }
  function fmtVal(v) {
    if (E.isQ(v)) return S.sdFrac ? fmtFloat(E.toF(v)) : fmtFrac(v);
    if (S.dmsView) return fmtDMS(v.v);
    return fmtFloat(v.v);
  }
  function resultHtml() {
    if (!S.resOn || !S.resVal) return '';
    const v = S.resVal;
    if (S.drgView && !E.isQ(v)) {
      const base = S.angle === 'D' ? E.toF(v) * Math.PI / 180 : S.angle === 'G' ? E.toF(v) * Math.PI / 200 : E.toF(v);
      return '<span class="small">Deg ' + fmtFloat(base / (Math.PI / 180)) +
        '<br>Rad ' + fmtFloat(base) +
        '<br>Gra ' + fmtFloat(base / (Math.PI / 200)) + '</span>';
    }
    if (S.resExtra) {
      return '<span class="small">' + fmtVal(v) + '<br>' + esc(S.resExtra.label) + ' = ' + fmtVal(S.resExtra.v) + '</span>';
    }
    return fmtVal(v);
  }

  /* ================= screen ================= */
  function ind(el, on, txt) {
    const e2 = $(el); if (!e2) return;
    if (txt !== undefined) e2.textContent = txt;
    e2.style.visibility = on ? 'visible' : 'hidden';
  }
  function Mset() {
    const m = S.vars.M;
    if (m === undefined) return false;
    return E.isQ(m) ? m.n !== 0n : m.v !== 0;
  }
  function render() {
    $('lcd').classList.toggle('off', S.off);
    $('expr').innerHTML = renderMath(S.str, S.cur, S.overwrite);
    const r = $('result');
    if (S.err) r.innerHTML = '<span style="font-size:20px">' + esc(S.err) + '</span>';
    else r.innerHTML = resultHtml();
    ind('i-s', S.shift, 'S'); ind('i-a', S.alpha, 'A');
    ind('i-m', Mset(), 'M');
    ind('i-sto', S.sto, 'STO'); ind('i-rcl', S.rcl, 'RCL');
    ind('i-ang', true, S.angle === 'D' ? 'D' : S.angle === 'R' ? 'R' : 'G');
    ind('i-fmt', S.fmt.t !== 'Norm', S.fmt.t);
    ind('i-hist', S.hist.length > 0, '▲▼');
    $('i-math').textContent = 'Math' + (S.overwrite ? ' INS' : '');
  }
  let noteTimer = null;
  function note(msg) {
    const el = $('note'); if (!el) return;
    el.textContent = msg || '';
    if (noteTimer) clearTimeout(noteTimer);
    if (msg) noteTimer = setTimeout(() => { el.textContent = ''; }, 2600);
  }

  /* ================= input ops ================= */
  function clearResult() { S.resOn = false; S.resVal = null; S.resExtra = null; }
  function ins(s) {
    if (S.err || S.menu) return;
    if (S.justEq) {
      if (FRESH.test(s)) { S.str = ''; S.cur = 0; }
      else { S.str = 'Ans'; S.cur = 3; }
      S.justEq = false; clearResult();
    }
    if (S.resOn) clearResult();
    if (S.str.length > 190) { note('Buffer full'); return; }
    if (S.overwrite && s.length === 1 && S.cur < S.str.length) {
      S.str = S.str.slice(0, S.cur) + s + S.str.slice(S.cur + 1); S.cur++;
    } else {
      S.str = S.str.slice(0, S.cur) + s + S.str.slice(S.cur); S.cur += s.length;
    }
    render();
  }
  function del() {
    if (S.err) return;
    if (S.menu) return;
    if (S.justEq) { S.str = ''; S.cur = 0; S.justEq = false; clearResult(); render(); return; }
    if (S.resOn) clearResult();
    const s = S.str, c = S.cur;
    if (S.overwrite && c < s.length) {
      let toks = [];
      try { toks = E.tokenize(s); } catch (e) { toks = []; }
      const at = toks.find(t => t.s === c);
      if (at && at.k === 'id') S.str = s.slice(0, at.s) + s.slice(at.e);
      else S.str = s.slice(0, c) + s.slice(c + 1);
      render(); return;
    }
    if (c === 0) { render(); return; }
    let toks = [];
    try { toks = E.tokenize(s); } catch (e) { toks = []; }
    const prev = toks.filter(t => t.e <= c).pop();
    if (prev && prev.k === 'id' && prev.e === c) {
      S.str = s.slice(0, prev.s) + s.slice(c); S.cur = prev.s;
    } else if (prev && prev.v === '(' && prev.e === c) {
      const before = toks.filter(t => t.e <= prev.s).pop();
      const st2 = (before && before.k === 'id') ? before.s : prev.s;
      S.str = s.slice(0, st2) + s.slice(c); S.cur = st2;
    } else {
      S.str = s.slice(0, c - 1) + s.slice(c); S.cur = c - 1;
    }
    render();
  }
  function moveCur(d) {
    if (S.err) return;
    S.cur = Math.max(0, Math.min(S.str.length, S.cur + d));
    render();
  }

  /* ================= history / equals ================= */
  function pushHist(str, val, extra) {
    S.hist.push({ str, val, extra: extra || null });
    if (S.hist.length > 100) S.hist.shift();
    S.hIdx = S.hist.length;
  }
  function histNav(d) {
    if (!S.hist.length) return;
    if (S.hIdx === -1) S.hIdx = S.hist.length;
    S.hIdx += d;
    if (S.hIdx >= S.hist.length) {
      S.hIdx = S.hist.length; S.str = ''; S.cur = 0;
      S.resOn = false; S.justEq = false; render(); return;
    }
    if (S.hIdx < 0) S.hIdx = 0;
    const h = S.hist[S.hIdx];
    S.str = h.str; S.cur = S.str.length; S.justEq = false;
    S.resVal = h.val; S.resExtra = h.extra; S.resOn = true; S.err = null;
    S.sdFrac = false; S.dmsView = false; S.drgView = false; S.eng = 0;
    render();
  }
  function equals() {
    if (S.err || S.menu) return;
    if (!S.str.trim()) return;
    try {
      const r = E.evaluate(S.str, { vars: S.vars, angle: S.angle });
      S.preAns = S.ans; S.ans = r.value;
      if (r.extra) S.preAns = r.extra.v;
      S.resVal = r.value; S.resExtra = r.extra; S.resOn = true;
      S.sdFrac = E.isQ(r.value) && r.value.d !== 1n && S.str.includes('/');
      S.mixed = false; S.eng = 0; S.dmsView = false; S.drgView = false;
      pushHist(S.str, r.value, r.extra);
      S.justEq = true; S.err = null;
      note('');
    } catch (e2) {
      S.err = (e2 && e2.message) || 'Math ERROR';
      S.justEq = false; clearResult();
    }
    render();
  }
  function allClear() {
    S.str = ''; S.cur = 0; S.err = null; S.justEq = false;
    S.shift = S.alpha = S.sto = S.rcl = false;
    S.menu = null; S.fixWait = null; closeMenu();
    clearResult(); S.hIdx = S.hist.length;
    render();
  }
  function setOff(off) { S.off = off; if (!off) { S.str = ''; S.cur = 0; S.err = null; } render(); }

  /* ================= menus ================= */
  function openMenu(title, items) {
    S.menu = { title, items };
    const el = $('menu');
    el.innerHTML = '<h4>' + esc(title) + '</h4>' + items.map((it, k) =>
      '<div class="mi" data-mi="' + k + '"><b>' + (k + 1) + '</b><span>' + it.label + '</span></div>').join('') +
      '<div class="mx">press a number or click · AC closes</div>';
    el.classList.remove('hidden');
    el.querySelectorAll('.mi').forEach(mi => mi.addEventListener('click', () => pickMenu(+mi.dataset.mi)));
    render();
  }
  function closeMenu() { S.menu = null; $('menu').classList.add('hidden'); }
  function pickMenu(k) {
    if (!S.menu) return;
    const it = S.menu.items[k];
    if (!it) return;
    const fn = it.fn;
    closeMenu();
    fn();
    render();
  }
  function menuKey(k) {
    if (!S.menu) return false;
    if (k === 'ac' || k === 'on') { closeMenu(); render(); return true; }
    const d = '0123456789'.indexOf(k);
    if (d >= 0 && d < S.menu.items.length) pickMenu(d);
    return true;
  }

  /* ================= setup / STO / result toggles ================= */
  function setupMenu() {
    openMenu('SETUP', [
      { label: 'Deg  (degrees)', fn: () => { S.angle = 'D'; note('Deg'); } },
      { label: 'Rad  (radians)', fn: () => { S.angle = 'R'; note('Rad'); } },
      { label: 'Gra  (gradians)', fn: () => { S.angle = 'G'; note('Gra'); } },
      { label: 'Fix  (then press 0-9)', fn: () => { S.fixWait = 'Fix'; note('Fix 0-9 ?'); } },
      { label: 'Sci  (then press 0-9)', fn: () => { S.fixWait = 'Sci'; note('Sci 0-9 ?'); } },
      { label: 'Norm 1', fn: () => { S.fmt = { t: 'Norm', n: 1 }; note('Norm 1'); } },
      { label: 'Norm 2', fn: () => { S.fmt = { t: 'Norm', n: 2 }; note('Norm 2'); } },
    ]);
  }
  function fixKey(k) {
    const d = '0123456789'.indexOf(k);
    if (d >= 0) { S.fmt = { t: S.fixWait, n: d }; note(S.fixWait + ' ' + d); }
    S.fixWait = null; render(); return true;
  }
  function storeVar(name) {
    S.vars[name] = S.ans;
    note('Ans → ' + name);
  }
  function toggleSD() {
    if (!S.resOn) { note('No result'); return; }
    if (!E.isQ(S.resVal) && !S.sdFrac) {
      try { S.resVal = E.floatToRat(E.toF(S.resVal)); } catch (e) { note('Math ERROR'); return; }
    }
    S.sdFrac = !S.sdFrac; S.dmsView = false; render();
  }
  function toggleMixed() {
    if (!S.resOn) { note('No result'); return; }
    S.mixed = !S.mixed; render();
  }
  function engShift(dir) {
    if (!S.resOn) { note('No result'); return; }
    S.eng = (S.eng || 0) + dir;
    S.sdFrac = false; S.dmsView = false; render();
  }
  function rndAns() {
    if (!S.resOn) { note('No result'); return; }
    S.resVal = E.r10(S.resVal); S.ans = S.resVal; render();
  }
  function toggleDMS() {
    if (!S.resOn) { note('No result'); return; }
    S.dmsView = !S.dmsView; if (S.dmsView) S.sdFrac = false; render();
  }
  function toggleDRG() {
    if (!S.resOn) { note('No result'); return; }
    S.drgView = !S.drgView; render();
  }

  /* ================= key actions ================= */
  function action(k, sh) {
    const D = (c) => ins(c);
    switch (k) {
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9': D(k); return;
      case 'dot': D('.'); return;
      case 'add': D('+'); return;
      case 'sub': D('-'); return;
      case 'mul': D('×'); return;
      case 'div': D('÷'); return;
      case 'eq': if (sh) toggleDRG(); else equals(); return;
      case 'ans': D(sh ? 'e' : 'Ans'); return;
      case 'exp': D(sh ? 'π' : 'E'); return;
      case 'neg': D(sh ? 'abs(' : '−'); return;
      case 'dms': if (sh) toggleDMS(); else D('°'); return;
      case 'sqrt': D(sh ? 'cbrt(' : '√('); return;
      case 'sq': D(sh ? '^(3)' : '^(2)'); return;
      case 'pow': D(sh ? 'x√(' : '^('); return;
      case 'log': D(sh ? '10^(' : 'log('); return;
      case 'ln': D(sh ? 'e^(' : 'ln('); return;
      case 'logb': D('logb('); return;
      case 'frac':
        if (S.justEq) { S.str = ''; S.cur = 0; S.justEq = false; clearResult(); }
        if (S.str[S.cur - 1] === '/') return;
        D('/'); return;
      case 'sin': D(sh ? 'asin(' : 'sin('); return;
      case 'cos': D(sh ? 'acos(' : 'cos('); return;
      case 'tan': D(sh ? 'atan(' : 'tan('); return;
      case 'hyp':
        openMenu('hyp', [
          { label: 'sinh', fn: () => D('sinh(') },
          { label: 'cosh', fn: () => D('cosh(') },
          { label: 'tanh', fn: () => D('tanh(') },
          { label: 'sinh⁻¹', fn: () => D('asinh(') },
          { label: 'cosh⁻¹', fn: () => D('acosh(') },
          { label: 'tanh⁻¹', fn: () => D('atanh(') },
        ]); return;
      case 'open': D(sh ? '%' : '('); return;
      case 'close': D(')'); return;
      case 'rcl': if (sh) { S.sto = true; note('STO ▸ variable?'); } else { S.rcl = true; note('RCL ▸ variable?'); } return;
      case 'eng': engShift(sh ? -1 : 1); return;
      case 'sd': sh ? toggleMixed() : toggleSD(); return;
      case 'mplus': {
        const cur = S.vars.M === undefined ? E.Q(0n, 1n) : S.vars.M;
        S.vars.M = (E.isQ(cur) && E.isQ(S.ans))
          ? (sh ? E.Q(cur.n * S.ans.d - S.ans.n * cur.d, cur.d * S.ans.d)
                : E.Q(cur.n * S.ans.d + S.ans.n * cur.d, cur.d * S.ans.d))
          : E.F(E.toF(cur) + (sh ? -1 : 1) * E.toF(S.ans));
        note('M = ' + (E.isQ(S.vars.M) ? E.toF(S.vars.M) : S.vars.M.v)); return;
      }
      case 'calc': equals(); return;
      case 'integ': D(sh ? 'ddx(' : '∫('); return;
      case 'fact': D(sh ? 'x√(' : '!'); return;
      case 'pol': D('Pol('); return;
      case 'rec': D('Rec('); return;
      case 'del': if (sh) { S.overwrite = !S.overwrite; note(S.overwrite ? 'Overwrite' : 'Insert'); render(); } else del(); return;
      case 'ac': sh ? setOff(true) : allClear(); return;
      case 'on': S.off ? setOff(false) : allClear(); return;
      case 'mode': setupMenu(); return;
      case 'const':
        openMenu('CONST', [
          { label: 'c  (speed of light) = 299792458', fn: () => D('299792458') },
          { label: 'g  = 9.80665', fn: () => D('9.80665') },
          { label: 'G  = 6.674e-11', fn: () => D('6.674E-11') },
          { label: 'NA = 6.02214076e23', fn: () => D('6.02214076E23') },
          { label: 'R  = 8.314462618', fn: () => D('8.314462618') },
          { label: 'k  = 1.380649e-23', fn: () => D('1.380649E-23') },
          { label: 'qe = 1.602176634e-19', fn: () => D('1.602176634E-19') },
          { label: 'h  = 6.62607015e-34', fn: () => D('6.62607015E-34') },
        ]); return;
      case 'clr':
        openMenu('CLR', [
          { label: 'Setup  (reset settings)', fn: () => { S.angle = 'D'; S.fmt = { t: 'Norm', n: 1 }; note('Setup initialized'); } },
          { label: 'Memory (clear vars / Ans / M)', fn: () => { S.vars = {}; S.ans = E.Q(0n, 1n); S.preAns = E.Q(0n, 1n); note('Memory cleared'); } },
          { label: 'All', fn: () => { S.vars = {}; S.ans = E.Q(0n, 1n); S.hist = []; S.hIdx = 0; note('All cleared'); } },
        ]); return;
      case 'up': histNav(-1); return;
      case 'down': histNav(1); return;
      case 'left':
        if (S.justEq && S.hist.length) {
          S.str = S.hist[S.hist.length - 1].str; S.cur = S.str.length;
          S.justEq = false; clearResult();
        }
        moveCur(-1); return;
      case 'right': moveCur(1); return;
    }
    if (sh) {
      if (k === '0') { rndAns(); return; }
      if (k === 'dot') { D('Ran#'); return; }
      if (k === '7') { action('const', false); return; }
      if (k === '9') { action('clr', false); return; }
      if (k === '6') { D('nPr'); return; }
      if (k === 'mul') { D('nCr'); return; }
      note('Not available in this clone');
    }
  }

  function press(k) {
    if (S.off) { setOff(false); return; }
    if (k === '__shift') { S.shift = !S.shift; if (S.shift) S.alpha = false; render(); return; }
    if (k === '__alpha') { S.alpha = !S.alpha; if (S.alpha) S.shift = false; render(); return; }
    if (S.menu && menuKey(k)) return;
    if (S.fixWait && fixKey(k)) return;
    if (S.err && k !== 'ac' && k !== 'on') return;
    const sh = S.shift; S.shift = false;
    const al = S.alpha; S.alpha = false;
    if (al && ALPHA[k]) { ins(ALPHA[k]); render(); return; }
    if (S.sto) { S.sto = false; if (ALPHA[k]) storeVar(ALPHA[k]); render(); return; }
    if (S.rcl) { S.rcl = false; if (ALPHA[k]) ins(ALPHA[k]); render(); return; }
    action(k, sh);
    render();
  }

  /* ================= wiring ================= */
  function wire() {
    document.querySelectorAll('#fx991 [data-k]').forEach(el => {
      el.addEventListener('click', () => press(el.dataset.k));
    });
    document.addEventListener('keydown', (ev) => {
      if (S.off) { setOff(false); ev.preventDefault(); return; }
      const key = ev.key;
      if (key >= '0' && key <= '9') { press(key); ev.preventDefault(); return; }
      const map = {
        '.': 'dot', '+': 'add', '-': 'sub', '*': 'mul', '/': 'frac',
        '^': 'pow', '(': 'open', ')': 'close', Enter: 'eq', '=': 'eq',
        Backspace: 'del', Escape: 'ac', ArrowUp: 'up', ArrowDown: 'down',
        ArrowLeft: 'left', ArrowRight: 'right',
      };
      if (key === '%') { action('open', true); render(); ev.preventDefault(); return; }
      if (map[key]) {
        if (map[key] === 'ac' && ev.shiftKey) setOff(true);
        else press(map[key]);
        ev.preventDefault(); return;
      }
      if (key.length === 1 && !ev.ctrlKey && !ev.metaKey) {
        if (/[A-Za-zπ]/.test(key)) { ins(key === 'p' ? 'π' : key === 'P' ? 'Pol(' : key); ev.preventDefault(); }
        else if (key === '!') { ins('!'); ev.preventDefault(); }
        else if (key === "'") { ins("'"); ev.preventDefault(); }
        else if (key === '"') { ins('"'); ev.preventDefault(); }
        else if (key === ',') { ins(','); ev.preventDefault(); }
        else if (key === ' ') ev.preventDefault();
      }
    });
    let idle = null;
    const resetIdle = () => { if (idle) clearTimeout(idle); idle = setTimeout(() => { if (!S.off) setOff(true); }, 600000); };
    ['click', 'keydown'].forEach(ev => document.addEventListener(ev, resetIdle));
    resetIdle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { wire(); render(); });
  else { wire(); render(); }
})();
