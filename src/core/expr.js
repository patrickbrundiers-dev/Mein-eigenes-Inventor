// Ausdrucks-Auswertung für Parameter und Maße (mm, Grad).
// Beispiele: "Länge/2 + 5", "sqrt(B^2+H^2)", "2*pi*r", "45°", "12 mm", "1,5*t", "2 in", "3/4\""

const FUNCS = {
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
  atan2: (y, x) => (Math.atan2(y, x) * 180) / Math.PI,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n,
  floor: Math.floor,
  ceil: Math.ceil,
  wenn: (c, a, b) => (c ? a : b),
  if: (c, a, b) => (c ? a : b),
};
const CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E };
// Zoll exakt 25,4 mm (internationale Definition 1959)
const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, zoll: 25.4, '"': 25.4, deg: 1, grad: 1, "°": 1 };

const IDENT_START = /[A-Za-z_À-ɏ]/;
const IDENT_PART = /[A-Za-z0-9_À-ɏ]/;

export class ExprError extends Error {}

function tokenize(src) {
  const toks = [];
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      let num = s.slice(i, j);
      // deutsches Dezimalkomma: "1,5" (Komma direkt zwischen Ziffern). Argumente mit ";" oder ", " trennen.
      if (!num.includes(".") && s[j] === "," && /[0-9]/.test(s[j + 1] || "")) {
        let k = j + 1;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        num = num + "." + s.slice(j + 1, k);
        j = k;
      }
      // Exponent
      if (j < s.length && /[eE]/.test(s[j]) && /[-+]?[0-9]/.test(s.slice(j + 1, j + 3))) {
        let k = j + 1;
        if (/[-+]/.test(s[k])) k++;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        num += s.slice(j, k);
        j = k;
      }
      const v = Number(num);
      if (!Number.isFinite(v)) throw new ExprError(`Ungültige Zahl "${num}"`);
      toks.push({ t: "num", v });
      i = j;
      continue;
    }
    if (c === "°" || c === '"') { toks.push({ t: "unit", v: c }); i++; continue; }
    if (IDENT_START.test(c)) {
      let j = i;
      while (j < s.length && IDENT_PART.test(s[j])) j++;
      toks.push({ t: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (c === ";") { toks.push({ t: "op", v: "," }); i++; continue; }
    if ("+-*/^(),<>=!".includes(c)) {
      const two = s.slice(i, i + 2);
      if ([">=", "<=", "==", "!="].includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new ExprError(`Unerwartetes Zeichen "${c}"`);
  }
  return toks;
}

// Rekursiver Abstieg -> AST
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v) => {
    const t = toks[p];
    if (!t || t.v !== v) throw new ExprError(`"${v}" erwartet`);
    p++;
  };
  function cmp() {
    let a = add();
    while (peek() && peek().t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().v)) {
      const op = toks[p++].v;
      a = { k: "bin", op, a, b: add() };
    }
    return a;
  }
  function add() {
    let a = mul();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = toks[p++].v;
      a = { k: "bin", op, a, b: mul() };
    }
    return a;
  }
  function mul() {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t && t.t === "op" && (t.v === "*" || t.v === "/")) {
        p++;
        a = { k: "bin", op: t.v, a, b: unary() };
      } else if (t && (t.t === "unit" || (t.t === "id" && UNITS[t.v] !== undefined))) {
        // Einheit gilt für den ganzen Term davor: "3/4\"" = (3/4) Zoll, "100/2 cm" = 50 cm
        p++;
        a = { k: "bin", op: "*", a, b: { k: "num", v: UNITS[t.v] } };
      } else if (t && (t.t === "id" || (t.t === "op" && t.v === "("))) {
        // implizite Multiplikation: "2B", "2(a+b)"
        a = { k: "bin", op: "*", a, b: unary() };
      } else break;
    }
    return a;
  }
  function unary() {
    const t = peek();
    if (t && t.t === "op" && (t.v === "-" || t.v === "+")) {
      p++;
      const x = unary();
      return t.v === "-" ? { k: "neg", x } : x;
    }
    return pow();
  }
  function pow() {
    const base = atom();
    const t = peek();
    if (t && t.t === "op" && t.v === "^") {
      p++;
      return { k: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  function atom() {
    const t = toks[p++];
    if (!t) throw new ExprError("Ausdruck unvollständig");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "id") {
      if (peek() && peek().v === "(") {
        p++;
        const args = [];
        if (!(peek() && peek().v === ")")) {
          args.push(cmp());
          while (peek() && peek().v === ",") { p++; args.push(cmp()); }
        }
        eat(")");
        return { k: "call", f: t.v, args };
      }
      return { k: "id", v: t.v };
    }
    if (t.v === "(") {
      const x = cmp();
      eat(")");
      return x;
    }
    throw new ExprError(`Unerwartet "${t.v}"`);
  }
  if (!toks.length) throw new ExprError("Leerer Ausdruck");
  const ast = cmp();
  if (p < toks.length) throw new ExprError(`Unerwartet "${toks[p].v}"`);
  return ast;
}

const astCache = new Map();
function cachedParse(src) {
  let a = astCache.get(src);
  if (!a) {
    a = parse(src);
    if (astCache.size > 5000) astCache.clear();
    astCache.set(src, a);
  }
  return a;
}

function evalAst(n, lookup) {
  switch (n.k) {
    case "num": return n.v;
    case "neg": return -evalAst(n.x, lookup);
    case "id": {
      if (CONSTS[n.v] !== undefined) return CONSTS[n.v];
      const v = lookup(n.v);
      if (v === undefined) throw new ExprError(`Unbekannter Parameter "${n.v}"`);
      return v;
    }
    case "call": {
      const f = FUNCS[n.f];
      if (!f) throw new ExprError(`Unbekannte Funktion "${n.f}"`);
      return f(...n.args.map((a) => evalAst(a, lookup)));
    }
    case "bin": {
      const a = evalAst(n.a, lookup), b = evalAst(n.b, lookup);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": if (b === 0) throw new ExprError("Division durch 0"); return a / b;
        case "^": return a ** b;
        case "<": return a < b ? 1 : 0;
        case ">": return a > b ? 1 : 0;
        case "<=": return a <= b ? 1 : 0;
        case ">=": return a >= b ? 1 : 0;
        case "==": return a === b ? 1 : 0;
        case "!=": return a !== b ? 1 : 0;
      }
    }
  }
  throw new ExprError("Interner Fehler");
}

export function identifiers(src) {
  const out = new Set();
  const walk = (n) => {
    if (n.k === "id" && CONSTS[n.v] === undefined) out.add(n.v);
    if (n.k === "neg") walk(n.x);
    if (n.k === "bin") { walk(n.a); walk(n.b); }
    if (n.k === "call") n.args.forEach(walk);
  };
  try { walk(cachedParse(String(src))); } catch { /* ignore */ }
  return [...out];
}

/** Wertet einen Ausdruck aus. scope: Map/Objekt Name -> Zahl */
export function evaluate(src, scope = {}) {
  if (typeof src === "number") return src;
  if (src === undefined || src === null || String(src).trim() === "") throw new ExprError("Leerer Ausdruck");
  const ast = cachedParse(String(src).trim());
  const lookup = scope instanceof Map ? (k) => scope.get(k) : (k) => scope[k];
  const v = evalAst(ast, lookup);
  if (!Number.isFinite(v)) throw new ExprError("Ergebnis ist keine endliche Zahl");
  return v;
}

/** Wie evaluate, aber mit Ersatzwert statt Exception */
export function tryEvaluate(src, scope, fallback = NaN) {
  try { return evaluate(src, scope); } catch { return fallback; }
}

export function isValidName(name) {
  return /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*$/.test(name) && !FUNCS[name] && CONSTS[name] === undefined && UNITS[name] === undefined;
}

/**
 * Löst die Parametertabelle eines Bauteils auf (Reihenfolge egal, Zyklen werden erkannt).
 * params: [{name, expr}] -> {values: {name: number}, errors: {name: msg}}
 */
export function resolveParams(params, base = {}) {
  const byName = new Map(params.map((p) => [p.name, p]));
  const values = { ...base };
  const errors = {};
  const state = new Map(); // name -> 'busy' | 'done'
  function get(name) {
    if (values[name] !== undefined && !byName.has(name)) return values[name];
    if (!byName.has(name)) return undefined;
    const st = state.get(name);
    if (st === "done") return values[name];
    if (st === "busy") throw new ExprError(`Zirkelbezug bei "${name}"`);
    state.set(name, "busy");
    try {
      values[name] = evaluate(byName.get(name).expr, proxyScope);
    } catch (e) {
      errors[name] = e.message;
      values[name] = NaN;
    }
    state.set(name, "done");
    return values[name];
  }
  const proxyScope = new Proxy({}, { get: (_, k) => (typeof k === "string" ? get(k) : undefined) });
  for (const p of params) get(p.name);
  // Fehler in abhängigen Parametern weiterreichen
  for (const p of params) if (Number.isNaN(values[p.name]) && !errors[p.name]) errors[p.name] = "Abhängiger Parameter fehlerhaft";
  return { values, errors };
}

/** Formatiert Zahlen deutsch mit sinnvoller Stellenzahl */
/** Liste aus einem Eingabefeld: mit ; getrennt (Ausdrücke dürfen Leerzeichen enthalten), ohne ; durch Leerzeichen */
export const splitList = (x) => { const s = String(x ?? ""); return (s.includes(";") ? s.split(";") : s.split(/\s+/)).map((v) => v.trim()).filter(Boolean); };

export function fmt(v, digits = 2) {
  if (!Number.isFinite(v)) return "–";
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return r.toLocaleString("de-DE", { maximumFractionDigits: digits });
}
