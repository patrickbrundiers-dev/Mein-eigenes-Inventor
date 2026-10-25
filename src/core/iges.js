// IGES-Export (Werkzeuge Stufe 49): Flächen als getrimmte NURBS-Flächen nach IGES 5.3.
// Reine Rechnung ohne Geometrie-Kern: NURBS für Ebene, Zylinder, Kegel, Kugel, Torus und Kegelschnitt-Bögen
// aus Auswertefunktionen (exakt, rationale Bögen bis 90°), und der Text der IGES-Datei.
//
// Entitäten: 128 NURBS-Fläche, 126 NURBS-Kurve, 102 Verbundkurve, 142 Kurve auf Fläche, 144 getrimmte Fläche.
// Die Randkurven stehen im Modellraum (Vorzug 2), so lesen Inventor, SolidWorks und OpenCascade sie ein.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return l > 1e-15 ? mul(a, 1 / l) : [0, 0, 0]; };

/** Mittelpunkt des Kreises durch drei Punkte im Raum */
export function circumcenter(a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), n = cross(ab, ac), nn = dot(n, n);
  if (nn < 1e-24) throw new Error("IGES: drei Punkte liegen auf einer Geraden");
  return add(a, mul(add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab))), 1 / (2 * nn)));
}

/** Anzahl gleicher Abschnitte bis höchstens 90° */
export const arcSpans = (delta) => Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));

/** Knoten einer Kurve aus n rationalen Bögen (Grad 2), Parameter 0 … n */
const arcKnots = (n) => [0, 0, 0, ...Array.from({ length: n - 1 }, (_, i) => [i + 1, i + 1]).flat(), n, n, n];

/**
 * Parameter eines rationalen Bogens (Grad 2, Gewichte 1, cos(d/2), 1) zum Winkel phi im Abschnitt 0 … d:
 * τ = (tan(phi/2 − d/4) / tan(d/4) + 1) / 2.
 */
export const arcParam = (phi, d) => (Math.tan(phi / 2 - d / 4) / Math.tan(d / 4) + 1) / 2;

/** Winkel x → Knotenparameter einer Bogenfolge ab x0 mit n Abschnitten zu je d */
export function arcMap(x, x0, n, d) {
  const k = Math.min(n - 1, Math.max(0, Math.floor((x - x0) / d + 1e-12)));
  return x0 + k * d + arcParam(x - x0 - k * d, d) * d;
}

/** Gerade als NURBS-Kurve */
export const lineCurve = (a, b) => ({ deg: 1, knots: [0, 0, 1, 1], weights: [1, 1], poles: [a, b], t0: 0, t1: 1 });

/**
 * Kegelschnitt-Bogen (Kreis oder Ellipse, Parameter = Winkel) aus der Auswertefunktion P(t) von t0 bis t1:
 * Mitte = (P(t) + P(t + π)) / 2, Zwischenpol = Mitte + (P(tm) − Mitte) / cos(Δ/2), Gewicht cos(Δ/2).
 */
export function conicCurve(P, t0, t1) {
  const c = mul(add(P(t0), P(t0 + Math.PI)), 0.5);
  const n = arcSpans(t1 - t0), d = (t1 - t0) / n, w = Math.cos(d / 2);
  const poles = [P(t0)], weights = [1];
  for (let k = 0; k < n; k++) {
    const ta = t0 + k * d, tm = ta + d / 2;
    poles.push(add(c, mul(sub(P(tm), c), 1 / w)), P(ta + d));
    weights.push(w, 1);
  }
  return { deg: 2, knots: arcKnots(n), weights, poles, t0: 0, t1: n };
}

/** Ebene als bilineare Fläche über dem Parameterbereich (Ecken aus S) */
export function planeSurface(S, [u0, u1, v0, v1]) {
  return { degU: 1, degV: 1, knotsU: [u0, u0, u1, u1], knotsV: [v0, v0, v1, v1], poles: [[S(u0, v0), S(u0, v1)], [S(u1, v0), S(u1, v1)]], weights: [[1, 1], [1, 1]] };
}

/**
 * Drehfläche (Zylinder, Kegel: Meridian Gerade; Kugel, Torus: Meridian Kreisbogen) über [u0, u1] × [v0, v1],
 * u = Drehwinkel. Achse aus drei Punkten eines Breitenkreises, Meridianpole um die Achse gedreht (Piegl/Tiller).
 * poles[i][j]: i längs u, j längs v.
 */
export function revolutionSurface(S, [u0, u1, v0, v1], meridian = "line") {
  const vm = (v0 + v1) / 2;
  const pa = S(u0, vm), pb = S(u0 + 1, vm), pc = S(u0 + 2, vm);
  const c = circumcenter(pa, pb, pc), ax = norm(cross(sub(pa, c), sub(pb, c)));
  const proj = (q) => add(c, mul(ax, dot(sub(q, c), ax)));
  const rot = (q, th) => {
    const p = proj(q), r = sub(q, p);
    return add(p, add(mul(r, Math.cos(th)), mul(cross(ax, r), Math.sin(th))));
  };
  // Meridian bei u0
  let Q, wv, knotsV, degV, mapV = (v) => v;
  if (meridian === "arc") {
    const cv = circumcenter(S(u0, v0), S(u0, v0 + 1), S(u0, v0 + 2));
    const m = arcSpans(v1 - v0), d = (v1 - v0) / m, w = Math.cos(d / 2);
    Q = [S(u0, v0)]; wv = [1];
    for (let k = 0; k < m; k++) { const va = v0 + k * d; Q.push(add(cv, mul(sub(S(u0, va + d / 2), cv), 1 / w)), S(u0, va + d)); wv.push(w, 1); }
    knotsV = arcKnots(m).map((x) => v0 + x * d); degV = 2;
    mapV = (v) => arcMap(v, v0, m, d);
  } else {
    Q = [S(u0, v0), S(u0, v1)]; wv = [1, 1]; knotsV = [v0, v0, v1, v1]; degV = 1;
  }
  const n = arcSpans(u1 - u0), d = (u1 - u0) / n, w = Math.cos(d / 2);
  const wu = [1];
  for (let k = 0; k < n; k++) wu.push(w, 1);
  const poles = wu.map((_, i) => Q.map((q) => {
    const k = Math.floor(i / 2), th = k * d;
    if (i % 2 === 0) return rot(q, th);
    const p = proj(q);
    return add(p, mul(sub(rot(q, th + d / 2), p), 1 / w));
  }));
  const weights = wu.map((a) => wv.map((b) => a * b));
  // Parameter der Fläche zu (Winkel, v) des Kerns: getrennt je Richtung, Isolinien bleiben Isolinien
  const map = (u, v) => [arcMap(u, u0, n, d), mapV(v)];
  return { degU: 2, degV, knotsU: arcKnots(n).map((x) => u0 + x * d), knotsV, poles, weights, map };
}

/** Kurve umdrehen (für die Verkettung der Randkurven) */
export function reverseCurve(cv) {
  const { knots, t0, t1 } = cv, a = knots[0], b = knots.at(-1);
  const out = { ...cv, poles: [...cv.poles].reverse(), weights: [...cv.weights].reverse(), knots: knots.map((k) => a + b - k).reverse(), t0: a + b - t1, t1: a + b - t0 };
  if (cv.pc) out.pc = reverseCurve(cv.pc);
  return out;
}

/** Anfangs- und Endpunkt einer NURBS-Kurve (an t0/t1 nur bei geklemmten Knoten genau = erster/letzter Pol) */
export function curveEnds(cv) {
  return [evalCurve(cv, cv.t0), evalCurve(cv, cv.t1)];
}

/** NURBS-Kurve auswerten (de Boor über homogene Koordinaten) */
export function evalCurve({ deg, knots, weights, poles }, t) {
  const n = poles.length - 1;
  let k = deg;
  while (k < n && t >= knots[k + 1]) k++;
  const d = [];
  for (let j = 0; j <= deg; j++) { const i = k - deg + j, w = weights[i]; d.push([poles[i][0] * w, poles[i][1] * w, poles[i][2] * w, w]); }
  for (let r = 1; r <= deg; r++) {
    for (let j = deg; j >= r; j--) {
      const i = k - deg + j, den = knots[i + deg - r + 1] - knots[i];
      const a = den > 0 ? (t - knots[i]) / den : 0;
      d[j] = d[j].map((x, q) => (1 - a) * d[j - 1][q] + a * x);
    }
  }
  const p = d[deg];
  return [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
}

/** NURBS-Fläche auswerten (für Prüfungen) */
export function evalSurface(s, u, v) {
  const col = s.poles.map((row, i) => {
    const c = evalCurve({ deg: s.degV, knots: s.knotsV, weights: s.weights[i], poles: row.map((p, j) => mul(p, 1)) }, v);
    const w = evalW(s.degV, s.knotsV, s.weights[i], v);
    return { c, w };
  });
  return evalCurve({ deg: s.degU, knots: s.knotsU, weights: col.map((x) => x.w), poles: col.map((x) => x.c) }, u);
}
function evalW(deg, knots, weights, t) {
  return evalCurve({ deg, knots, weights: weights.map(() => 1), poles: weights.map((w) => [w, 0, 0]) }, t)[0];
}

/**
 * Randkurven einer Schleife zu einer geschlossenen Kette ordnen (Ende an Anfang). Die Kurven kommen schon in
 * Kantenrichtung; gewählt wird die erste passende, notfalls umgedreht.
 */
export function chainLoop(curves, tol = 1e-3) {
  if (!curves.length) return [];
  const rest = curves.map((c) => ({ c, e: curveEnds(c) }));
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = [rest.shift()];
  while (rest.length) {
    const end = out.at(-1).e[1], back = out.at(-1).e[0];
    // nicht gleich auf einer Nahtkante zurücklaufen, solange noch etwas anderes passt
    const pick = (q) => {
      const ok = rest.map((x, i) => [x, i]).filter(([x]) => d(x.e[q], end) < tol);
      const fwd = ok.find(([x]) => d(x.e[1 - q], back) >= tol || d(end, back) < tol);
      return (fwd || ok[0])?.[1] ?? -1;
    };
    let k = pick(0), flip = false;
    if (k < 0) { k = pick(1); flip = k >= 0; }
    if (k < 0) {
      // Lücke (ungenaue Kante): nächstliegender Anfang
      let bd = Infinity;
      rest.forEach((x, i) => { for (const [q, fl] of [[0, false], [1, true]]) { const v = d(x.e[q], end); if (v < bd) { bd = v; k = i; flip = fl; } } });
    }
    const [x] = rest.splice(k, 1);
    out.push(flip ? { c: reverseCurve(x.c), e: [x.e[1], x.e[0]] } : x);
  }
  return out.map((x) => x.c);
}

// ---------- IGES-Text ----------

/** Reelle Zahl für IGES (immer mit Dezimalpunkt) */
export function igesReal(x) {
  if (!Number.isFinite(x)) throw new Error("IGES: ungültige Zahl");
  if (Math.abs(x) < 1e-14) return "0.";
  let s = String(+x.toPrecision(15));
  if (/e/i.test(s)) { const [m, e] = s.split(/e/i); return (m.includes(".") ? m : m + ".") + "E" + e.replace("+", ""); }
  return s.includes(".") ? s : s + ".";
}
const hol = (s) => `${s.length}H${s}`;

/** Parameter in Zeilen zu je width Zeichen packen, ohne Zahlen zu trennen */
function packParams(tokens, width) {
  const lines = [];
  let cur = "";
  tokens.forEach((t, i) => {
    const piece = t + (i === tokens.length - 1 ? ";" : ",");
    if (cur.length + piece.length > width && cur) { lines.push(cur); cur = ""; }
    if (piece.length > width) { for (let k = 0; k < piece.length; k += width) lines.push(piece.slice(k, k + width)); return; }
    cur += piece;
  });
  if (cur) lines.push(cur);
  return lines;
}

/** Feld rechtsbündig (8 Zeichen im Verzeichnisteil) */
const f8 = (x) => String(x).padStart(8);
const seqCol = (letter, n) => letter + String(n).padStart(7);

/**
 * IGES-Datei aus Flächen [{ surface, loops: [[kurve, …] (außen), [kurve, …] (innen), …] }] und optional
 * losen Kurven. Einheit mm. Rückgabe: Text mit Start-, Global-, Verzeichnis-, Parameter- und Endteil.
 */
export function writeIges(faces, { fileName = "export.igs", system = "PBCAD", version = "", author = "", org = "", date = new Date(), note = "", pref = 1 } = {}) {
  const ents = [];
  const put = (type, params, { form = 0, status = "00000000", label = "" } = {}) => { ents.push({ type, params, form, status, label }); return 2 * ents.length - 1; };
  const R = igesReal;
  const dep = "00010000";
  const pspace = "00010500";
  const curveDE = (cv, flat = false) => {
    const K = cv.poles.length - 1, poly = cv.weights.every((w) => Math.abs(w - 1) < 1e-12) ? 1 : 0;
    return put(126, [K, cv.deg, flat ? 1 : 0, 0, poly, 0, ...cv.knots.map(R), ...cv.weights.map(R), ...cv.poles.flatMap((p) => [R(p[0]), R(p[1]), R(flat ? 0 : p[2])]), R(cv.t0), R(cv.t1), R(0), R(0), R(flat ? 1 : 0)], { status: flat ? pspace : dep });
  };
  let maxCoord = 0;
  for (const fc of faces) {
    const s = fc.surface;
    const K1 = s.poles.length - 1, K2 = s.poles[0].length - 1;
    const W = [], P = [];
    for (let j = 0; j <= K2; j++) for (let i = 0; i <= K1; i++) { W.push(s.weights[i][j]); P.push(s.poles[i][j]); }
    for (const p of P) maxCoord = Math.max(maxCoord, ...p.map(Math.abs));
    const poly = W.every((w) => Math.abs(w - 1) < 1e-12) ? 1 : 0;
    const sDE = put(128, [K1, K2, s.degU, s.degV, 0, 0, poly, 0, 0, ...s.knotsU.map(R), ...s.knotsV.map(R), ...W.map(R), ...P.flatMap((p) => p.map(R)), R(s.knotsU[s.degU]), R(s.knotsU[K1 + 1]), R(s.knotsV[s.degV]), R(s.knotsV[K2 + 1])], { status: dep });
    const loops = fc.loops.filter((l) => l.length).map((loop) => {
      // Kurve im Parameterraum der Fläche, wenn jede Kante eine hat (sonst projiziert der Leser die Raumkurve)
      const flat = loop.every((c) => c.pc) ? put(102, [loop.length, ...loop.map((c) => curveDE(c.pc, true))], { status: pspace }) : 0;
      const cs = loop.map((c) => curveDE(c));
      const comp = put(102, [cs.length, ...cs], { status: dep });
      return put(142, [0, sDE, flat, comp, flat ? pref : 2], { status: dep });
    });
    put(144, [sDE, loops.length ? 1 : 0, Math.max(0, loops.length - 1), loops[0] ?? 0, ...loops.slice(1)]);
  }
  // Text
  const pad = (s) => s.padEnd(72);
  const start = [`${system} IGES-Export${note ? " – " + note : ""}`].map((s, i) => pad(s.slice(0, 72)) + seqCol("S", i + 1));
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}.${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  const gTokens = [hol(","), hol(";"), hol(system), hol(fileName), hol(system), hol(version || system), "32", "38", "6", "308", "15", hol(system), R(1), "2", hol("MM"), "1", R(1), hol(stamp), R(0.000001), R(Math.max(1, maxCoord)), hol(author || "-"), hol(org || "-"), "11", "0", hol(stamp)];
  const global = packParams(gTokens, 72).map((s, i) => pad(s) + seqCol("G", i + 1));
  const dir = [], par = [];
  ents.forEach((e, k) => {
    const de = 2 * k + 1;
    const lines = packParams([String(e.type), ...e.params.map(String)], 64);
    const first = par.length + 1;
    for (const l of lines) par.push(l.padEnd(64) + " " + String(de).padStart(7) + seqCol("P", par.length + 1));
    dir.push(f8(e.type) + f8(first) + f8(0) + f8(0) + f8(0) + f8(0) + f8(0) + f8(0) + e.status.padStart(8, "0") + seqCol("D", de));
    dir.push(f8(e.type) + f8(0) + f8(0) + f8(lines.length) + f8(e.form) + f8("") + f8("") + e.label.slice(0, 8).padStart(8) + f8(0) + seqCol("D", de + 1));
  });
  const term = pad(seqCol("S", start.length) + seqCol("G", global.length) + seqCol("D", dir.length) + seqCol("P", par.length)) + seqCol("T", 1);
  return [...start, ...global, ...dir, ...par, term].join("\r\n") + "\r\n";
}

/** IGES-Text grob lesen (für Tests): Entitäten mit Typ und Parametern aus dem Parameterteil */
export function readIgesEntities(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const bad = lines.find((l) => l.length !== 80);
  if (bad) throw new Error("IGES: Zeile nicht 80 Zeichen: " + JSON.stringify(bad));
  const P = new Map();
  for (const l of lines.filter((x) => x[72] === "P")) {
    const de = Number(l.slice(65, 72));
    P.set(de, (P.get(de) || "") + l.slice(0, 64).trimEnd());
  }
  const D = lines.filter((x) => x[72] === "D");
  const out = [];
  for (let i = 0; i < D.length; i += 2) {
    const de = i + 1, type = Number(D[i].slice(0, 8));
    const raw = (P.get(de) || "").replace(/;$/, "");
    out.push({ de, type, status: D[i].slice(64, 72), params: raw.split(",").slice(1) });
  }
  return { entities: out, sections: Object.fromEntries(["S", "G", "D", "P", "T"].map((c) => [c, lines.filter((x) => x[72] === c).length])) };
}
