// Weitere Skizzenwerkzeuge aus dem SolidCraft-Abgleich (plan/solidcraft-abgleich.md, Teil Skizze):
// abgerundetes Rechteck, Linie aus Mitte, Kreis über 2 Punkte, Bogenlangloch, Hilfslinien (unendlich lang,
// waagrecht/senkrecht/Winkel/parallel/senkrecht zu/Tangente/Winkelhalbierende), Ecke (zwei Linien bis zum Schnitt),
// Gleichungskurve, Kegelschnitt, Kopieren/Einfügen zwischen Skizzen, SVG-Import. Ohne DOM, testbar.
import { evaluate } from "./expr.js";
import { splineNearest } from "./spline.js";
import { svgPathSegments } from "./svgpath.js";

const DEG = Math.PI / 180;
const newPt = (sk, uid, x, y) => { const id = uid("p"); sk.points.push({ id, x, y }); return id; };
const P = (sk, id) => sk.points.find((p) => p.id === id);

/**
 * Abgerundetes Rechteck (achsparallel) aus zwei Ecken a, b und Eckradius r.
 * Vier Linien (waagrecht/senkrecht), vier Bögen tangential, alle Radien gleich, ein Radiusmaß.
 */
export function buildRoundedRect(sk, a, b, r, { uid, rExpr = null, construction = false }) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const w = x1 - x0, hgt = y1 - y0;
  if (!(w > 1e-9 && hgt > 1e-9)) throw new Error("Rechteck braucht Breite und Höhe");
  if (!(r > 1e-9)) throw new Error("Eckradius muss größer 0 sein");
  if (r > Math.min(w, hgt) / 2 + 1e-9) throw new Error(`Eckradius höchstens ${Math.round((Math.min(w, hgt) / 2) * 100) / 100} mm (halbe kurze Seite)`);
  const q = (x, y) => newPt(sk, uid, x, y);
  // Linienenden gegen den Uhrzeigersinn: unten, rechts, oben, links
  const b1 = q(x0 + r, y0), b2 = q(x1 - r, y0), r1 = q(x1, y0 + r), r2 = q(x1, y1 - r);
  const t1 = q(x1 - r, y1), t2 = q(x0 + r, y1), l1 = q(x0, y1 - r), l2 = q(x0, y0 + r);
  const cBR = q(x1 - r, y0 + r), cTR = q(x1 - r, y1 - r), cTL = q(x0 + r, y1 - r), cBL = q(x0 + r, y0 + r);
  const L = (p1, p2) => { const id = uid("l"); sk.entities.push({ id, type: "line", p1, p2, construction }); return id; };
  const A = (c, p1, p2) => { const id = uid("b"); sk.entities.push({ id, type: "arc", c, p1, p2, construction }); return id; };
  const bot = L(b1, b2), right = L(r1, r2), top = L(t1, t2), left = L(l1, l2);
  const aBR = A(cBR, b2, r1), aTR = A(cTR, r2, t1), aTL = A(cTL, t2, l1), aBL = A(cBL, l2, b1);
  const k = () => uid("k");
  const cons = [
    { id: k(), type: "horizontal", e: bot }, { id: k(), type: "horizontal", e: top },
    { id: k(), type: "vertical", e: left }, { id: k(), type: "vertical", e: right },
  ];
  for (const [arc, line, p] of [[aBR, bot, b2], [aBR, right, r1], [aTR, right, r2], [aTR, top, t1], [aTL, top, t2], [aTL, left, l1], [aBL, left, l2], [aBL, bot, b1]])
    cons.push({ id: k(), type: "tangentAt", e1: arc, e2: line, p });
  for (const arc of [aTR, aTL, aBL]) cons.push({ id: k(), type: "equal", e1: aBR, e2: arc });
  cons.push({ id: uid("m"), type: "radius", e: aBR, value: String(rExpr ?? r), labelAngle: -Math.PI / 4 });
  sk.constraints.push(...cons);
  return { lines: [bot, right, top, left], arcs: [aBR, aTR, aTL, aBL] };
}

/** Linie aus Mitte: m ist der Mittelpunkt, e ein Ende; das andere Ende liegt gespiegelt. Mittelpunkt-Bedingung hält sie symmetrisch. */
export function buildMidLine(sk, m, e, { uid, usePoint, construction = false }) {
  if (!(Math.hypot(e.x - m.x, e.y - m.y) > 1e-9)) throw new Error("Ende und Mitte fallen zusammen");
  const cons = [];
  const mid = usePoint(sk, m, cons);
  const p2 = usePoint(sk, e, cons);
  const mp = P(sk, mid);
  const p1 = newPt(sk, uid, 2 * mp.x - e.x, 2 * mp.y - e.y);
  const id = uid("l");
  sk.entities.push({ id, type: "line", p1, p2, construction });
  cons.push({ id: uid("k"), type: "midpoint", p: mid, e: id });
  sk.constraints.push(...cons);
  return { line: id, mid };
}

/** Kreis über zwei Punkte (Durchmesser a–b): Konstruktionslinie als Durchmesser, Mitte auf ihrer Mitte, beide Punkte auf dem Kreis */
export function buildCircle2(sk, a, b, { uid, usePoint, construction = false }) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(d > 1e-9)) throw new Error("Zwei verschiedene Punkte klicken");
  const cons = [];
  const pa = usePoint(sk, a, cons), pb = usePoint(sk, b, cons);
  const c = newPt(sk, uid, (a.x + b.x) / 2, (a.y + b.y) / 2);
  const dia = uid("l"), circ = uid("k");
  sk.entities.push({ id: dia, type: "line", p1: pa, p2: pb, construction: true }, { id: circ, type: "circle", c, r: d / 2, construction });
  cons.push({ id: uid("k"), type: "midpoint", p: c, e: dia }, { id: uid("k"), type: "pointOnCircle", p: pa, e: circ }, { id: uid("k"), type: "pointOnCircle", p: pb, e: circ });
  sk.constraints.push(...cons);
  return { circle: circ, center: c };
}

/**
 * Bogenlangloch: Mitte c der Bahn, Startpunkt s (Bahnradius, Anfangswinkel), Endpunkt e (Endwinkel, gegen den Uhrzeigersinn), Breite w.
 * Außen- und Innenbogen um dieselbe Mitte, zwei halbrunde Enden tangential, Bahn als Konstruktionsbogen.
 */
export function buildArcSlot(sk, c, s, e, w, { uid, usePoint, construction = false, wExpr = null }) {
  const R = Math.hypot(s.x - c.x, s.y - c.y);
  if (!(R > 1e-9)) throw new Error("Startpunkt liegt auf der Mitte");
  if (!(w > 1e-9)) throw new Error("Breite muss größer 0 sein");
  if (!(w / 2 < R - 1e-9)) throw new Error("Breite muss kleiner als der doppelte Bahnradius sein");
  const a0 = Math.atan2(s.y - c.y, s.x - c.x), a1 = Math.atan2(e.y - c.y, e.x - c.x);
  let sw = a1 - a0; while (sw <= 1e-6) sw += 2 * Math.PI;
  if (sw > 2 * Math.PI - 1e-3) throw new Error("Start und Ende fallen zusammen");
  const h = w / 2, cons = [];
  const cid = usePoint(sk, c, cons);
  const C = P(sk, cid);
  const at = (rad, ang) => newPt(sk, uid, C.x + rad * Math.cos(ang), C.y + rad * Math.sin(ang));
  const m0 = at(R, a0), m1 = at(R, a0 + sw);
  const o0 = at(R + h, a0), o1 = at(R + h, a0 + sw), i0 = at(R - h, a0), i1 = at(R - h, a0 + sw);
  const A = (cc, p1, p2, cons2 = construction) => { const id = uid("b"); sk.entities.push({ id, type: "arc", c: cc, p1, p2, construction: cons2 }); return id; };
  const path = A(cid, m0, m1, true), outer = A(cid, o0, o1), inner = A(cid, i0, i1);
  const cap0 = A(m0, i0, o0), cap1 = A(m1, o1, i1);
  const k = () => uid("k");
  cons.push(
    { id: k(), type: "tangent", e1: cap0, e2: outer, internal: true }, { id: k(), type: "tangent", e1: cap1, e2: outer, internal: true },
    { id: k(), type: "tangent", e1: cap0, e2: inner }, { id: k(), type: "tangent", e1: cap1, e2: inner },
    { id: k(), type: "equal", e1: cap0, e2: cap1 },
    { id: uid("m"), type: "diameter", e: cap0, value: String(wExpr ?? w), labelAngle: a0 - Math.PI / 2 },
  );
  sk.constraints.push(...cons);
  return { path, outer, inner, caps: [cap0, cap1] };
}

/** Länge, mit der eine Hilfslinie »unendlich« wirkt: deutlich größer als die Skizze, mindestens 2 m */
export function helperLength(sk) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of sk.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const span = Number.isFinite(x0) ? Math.max(x1 - x0, y1 - y0) : 0;
  return Math.max(2000, 4 * span);
}

/**
 * Hilfslinie (Konstruktion) durch den Punkt at mit Richtung dir (Einheitsvektor), symmetrisch lang.
 * kind: "h" | "v" | "angle" | "parallel" | "perp" | "free"; ref = Linie für parallel/senkrecht; angle in Grad (Ausdruck erlaubt).
 * Der Durchgangspunkt ist Mittelpunkt der Linie (bleibt beim Ziehen darauf).
 */
export function buildHelperLine(sk, at, dir, { uid, usePoint, kind = "free", ref = null, angleExpr = null, length = null }) {
  const L = length ?? helperLength(sk);
  const n = Math.hypot(dir[0], dir[1]);
  if (!(n > 1e-12)) throw new Error("Keine Richtung");
  const u = [dir[0] / n, dir[1] / n];
  const cons = [];
  const mid = usePoint(sk, at, cons);
  const M = P(sk, mid);
  const p1 = newPt(sk, uid, M.x - (u[0] * L) / 2, M.y - (u[1] * L) / 2), p2 = newPt(sk, uid, M.x + (u[0] * L) / 2, M.y + (u[1] * L) / 2);
  const id = uid("l");
  sk.entities.push({ id, type: "line", p1, p2, construction: true, helper: true });
  const k = () => uid("k");
  cons.push({ id: k(), type: "midpoint", p: mid, e: id });
  if (kind === "h") cons.push({ id: k(), type: "horizontal", e: id });
  else if (kind === "v") cons.push({ id: k(), type: "vertical", e: id });
  else if (kind === "parallel" && ref) cons.push({ id: k(), type: "parallel", e1: id, e2: ref });
  else if (kind === "perp" && ref) cons.push({ id: k(), type: "perpendicular", e1: id, e2: ref });
  else if (kind === "angle") cons.push({ id: uid("m"), type: "lineAngle", e: id, value: String(angleExpr ?? (Math.atan2(u[1], u[0]) / DEG)) });
  sk.constraints.push(...cons);
  return { line: id, mid };
}

/** Tangenten von einem Punkt q an den Kreis (c, r): Berührpunkte [{x,y}] (0 oder 2) */
export function tangentPoints(q, c, r) {
  const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy);
  if (!(d > r + 1e-9)) return [];
  const base = Math.atan2(dy, dx), off = Math.acos(r / d);
  return [base + off, base - off].map((a) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }));
}

/** Gemeinsame Tangenten zweier Kreise: [{a:{x,y}, b:{x,y}}] Berührpunkte auf Kreis 1 und 2 (außen und innen) */
export function commonTangents(c1, r1, c2, r2) {
  const out = [];
  const dx = c2.x - c1.x, dy = c2.y - c1.y, d = Math.hypot(dx, dy);
  if (!(d > 1e-9)) return out;
  for (const s1 of [1, -1]) { // s1 = 1 außen, −1 innen
    const rr = (r1 - s1 * r2) / d;
    if (Math.abs(rr) > 1) continue;
    const hh = Math.sqrt(Math.max(0, 1 - rr * rr));
    for (const s2 of [1, -1]) {
      const nx = (dx / d) * rr - s2 * hh * (dy / d), ny = (dy / d) * rr + s2 * hh * (dx / d);
      out.push({ a: { x: c1.x + r1 * nx, y: c1.y + r1 * ny }, b: { x: c2.x + s1 * r2 * nx, y: c2.y + s1 * r2 * ny } });
    }
  }
  return out;
}

/** Schnittpunkt zweier Geraden (je zwei Punkte); null bei parallel */
export function lineIntersection(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y, d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y)) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** Winkelhalbierende zweier Linien: Schnittpunkt und die beiden Richtungen [u, v] (Einheitsvektoren) */
export function bisectors(l1a, l1b, l2a, l2b) {
  const x = lineIntersection(l1a, l1b, l2a, l2b);
  if (!x) return null;
  const n = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); return [dx / L, dy / L]; };
  const u = n(l1a, l1b), v = n(l2a, l2b);
  const s = [u[0] + v[0], u[1] + v[1]], t = [u[0] - v[0], u[1] - v[1]];
  const norm = (w) => { const L = Math.hypot(w[0], w[1]); return [w[0] / L, w[1] / L]; };
  return { at: x, dirs: [norm(s), norm(t)] };
}

/**
 * Ecke: zwei Linien bis zu ihrem Schnittpunkt verlängern oder kürzen und dort verbinden (SolidCraft Umschalt-Klick auf zwei Kurven).
 * Das jeweils näher am Schnittpunkt liegende Ende wandert; danach eine Koinzident-Bedingung.
 */
export function joinCorner(sk, l1, l2, { uid }) {
  const e1 = sk.entities.find((e) => e.id === l1), e2 = sk.entities.find((e) => e.id === l2);
  if (e1?.type !== "line" || e2?.type !== "line" || l1 === l2) throw new Error("Zwei verschiedene Linien anklicken");
  const A1 = P(sk, e1.p1), A2 = P(sk, e1.p2), B1 = P(sk, e2.p1), B2 = P(sk, e2.p2);
  const x = lineIntersection(A1, A2, B1, B2);
  if (!x) throw new Error("Die Linien sind parallel – kein Schnittpunkt");
  const near = (e, a, b) => (Math.hypot(a.x - x.x, a.y - x.y) <= Math.hypot(b.x - x.x, b.y - x.y) ? e.p1 : e.p2);
  const pa = near(e1, A1, A2), pb = near(e2, B1, B2);
  if (pa === pb) return { ok: true, point: pa };
  // beide Enden in den Schnittpunkt, dann zu einem Punkt zusammenführen
  for (const id of [pa, pb]) { const p = P(sk, id); p.x = x.x; p.y = x.y; }
  const shared = sk.entities.some((e) => e !== e2 && [e.p1, e.p2, e.c, e.p].includes(pb)) || sk.constraints.some((c) => Object.values(c).includes(pb));
  if (shared) sk.constraints.push({ id: uid("k"), type: "coincident", p: pa, q: pb });
  else { if (e2.p1 === pb) e2.p1 = pa; else e2.p2 = pa; sk.points = sk.points.filter((p) => p.id !== pb); }
  return { ok: true, point: pa };
}

/** Punkte einer Gleichungskurve: mode "param" (x(t), y(t), t von..bis) oder "fx" (y = f(x), x von..bis). vars = Parameter der Skizze */
export function equationPoints({ mode = "param", x = "t", y = "0", f = "x", from = "0", to = "1", n = 40 }, vars = {}) {
  const ev = (e, v) => evaluate(e, { ...vars, ...v });
  const a = ev(String(from), {}), b = ev(String(to), {});
  const N = Math.max(3, Math.min(400, Math.round(Number(n) || 40)));
  if (!(b > a)) throw new Error("»bis« muss größer als »von« sein");
  const out = [];
  for (let i = 0; i < N; i++) {
    const s = a + ((b - a) * i) / (N - 1);
    let q;
    try { q = mode === "fx" ? [s, ev(f, { x: s })] : [ev(x, { t: s }), ev(y, { t: s })]; } catch (e) { if (/endliche|NaN|Infinity/i.test(e.message)) q = [NaN]; else throw e; }
    if (!q.every(Number.isFinite)) throw new Error(`Ausdruck nicht berechenbar bei ${mode === "fx" ? "x" : "t"} = ${Math.round(s * 1000) / 1000}`);
    out.push(q);
  }
  return out;
}

/**
 * Kontrollpunkte, deren Spline (src/core/spline.js) durch die Punkte pts läuft: Start mit den Punkten selbst,
 * dann den Abstand zur Kurve wenige Male nachführen. Enden bleiben genau.
 */
export function fitSplineCtrl(pts, iterations = 6) {
  const ctrl = pts.map((p) => [p[0], p[1]]);
  if (pts.length < 3) return ctrl;
  for (let it = 0; it < iterations; it++) {
    let worst = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const q = splineNearest(ctrl, pts[i][0], pts[i][1]);
      if (!q) continue;
      const dx = pts[i][0] - q.x, dy = pts[i][1] - q.y;
      worst = Math.max(worst, Math.hypot(dx, dy));
      ctrl[i][0] += dx; ctrl[i][1] += dy;
    }
    if (worst < 1e-4) break;
  }
  return ctrl;
}

/** Spline-Element aus Kontrollpunkten in die Skizze; eigene Punkte, Rückgabe id */
export function addSplineFromCtrl(sk, ctrl, { uid, construction = false, meta = null }) {
  const ids = ctrl.map(([x, y]) => newPt(sk, uid, x, y));
  const id = uid("sp");
  sk.entities.push({ id, type: "spline", pts: ids, p1: ids[0], p2: ids[ids.length - 1], construction, ...(meta || {}) });
  return id;
}

/**
 * Kegelschnitt (Conic) aus Start a, Ende b, Scheitelpunkt (Schnitt der Endtangenten) s und Völligkeit rho (0 < rho < 1):
 * rationale quadratische Bézierkurve, Gewicht w = rho / (1 − rho). rho 0,5 = Parabel, < 0,5 Ellipse, > 0,5 Hyperbel.
 */
export function conicPoints(a, b, s, rho, n = 24) {
  if (!(rho > 0 && rho < 1)) throw new Error("Völligkeit (rho) muss zwischen 0 und 1 liegen");
  const w = rho / (1 - rho), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, A = (1 - t) * (1 - t), B = 2 * t * (1 - t) * w, C = t * t, D = A + B + C;
    out.push([(A * a.x + B * s.x + C * b.x) / D, (A * a.y + B * s.y + C * b.y) / D]);
  }
  return out;
}

// ---------- Kopieren und Einfügen zwischen Skizzen ----------
const REF_KEYS = ["p", "q", "e", "e1", "e2", "p1", "p2", "c", "a", "line", "center"];

/** Gewählte Elemente samt Punkten und inneren Bedingungen als unabhängige Kopie (JSON-fähig) */
export function copyEntities(sk, ids) {
  const set = new Set(ids);
  const ents = sk.entities.filter((e) => set.has(e.id) && !e.origin);
  if (!ents.length) return null;
  const ptIds = new Set();
  for (const e of ents) for (const k of ["p1", "p2", "c", "a", "p"]) if (e[k]) ptIds.add(e[k]);
  for (const e of ents) for (const id of e.pts || []) ptIds.add(id);
  const known = new Set([...ptIds, ...set]);
  const cons = sk.constraints.filter((c) => {
    const refs = REF_KEYS.map((k) => c[k]).filter((v) => typeof v === "string");
    return refs.length && refs.every((r) => known.has(r)) && c.type !== "fix" && c.type !== "pattern" && c.type !== "offset";
  });
  return { points: sk.points.filter((p) => ptIds.has(p.id)).map((p) => ({ ...p })), entities: ents.map((e) => JSON.parse(JSON.stringify(e))), constraints: cons.map((c) => JSON.parse(JSON.stringify(c))) };
}

/** Kopie einfügen, um (dx, dy) verschoben; neue IDs. Rückgabe: IDs der neuen Elemente */
export function pasteEntities(sk, clip, { uid, dx = 0, dy = 0 }) {
  if (!clip?.entities?.length) throw new Error("Zwischenablage ist leer");
  const map = new Map();
  for (const p of clip.points) { const id = uid("p"); map.set(p.id, id); sk.points.push({ id, x: p.x + dx, y: p.y + dy }); }
  const newIds = [];
  for (const e of clip.entities) {
    const id = uid(e.type === "line" ? "l" : e.type === "arc" ? "b" : e.type === "spline" ? "sp" : "k");
    map.set(e.id, id);
    const n = { ...JSON.parse(JSON.stringify(e)), id };
    delete n.link; delete n.projected; delete n.ref;
    for (const k of ["p1", "p2", "c", "a", "p"]) if (n[k]) n[k] = map.get(n[k]);
    if (n.pts) n.pts = n.pts.map((q) => map.get(q));
    sk.entities.push(n);
    newIds.push(id);
  }
  for (const c of clip.constraints) {
    const n = { ...c, id: uid(c.type === "length" || c.type === "radius" || c.type === "diameter" || c.type === "distance" || c.type === "angle" ? "m" : "k") };
    for (const k of REF_KEYS) if (typeof n[k] === "string" && map.has(n[k])) n[k] = map.get(n[k]);
    sk.constraints.push(n);
  }
  return newIds;
}

/** Mitte der Punkte einer Zwischenablage (für Einfügen an der Mausposition) */
export function clipCenter(clip) {
  const xs = clip.points.map((p) => p.x), ys = clip.points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

// ---------- SVG-Import ----------
const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag); return m ? (m[2] ?? m[3]) : null; };
const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

/**
 * SVG-Text → Elemente wie aus dem DXF-Leser ({kind: line|arc|circle, layer}). Pfade, Linien, Rechtecke, Kreise, Polylinien.
 * Einheit: hat das svg-Element eine Breite in mm/cm/in und eine viewBox, wird darauf umgerechnet; sonst 1 Einheit = 1 px = 25,4/96 mm.
 * Transformationen (transform=) werden nicht ausgewertet – sie stehen in warnings.
 */
export function svgToPrims(text) {
  const svgTag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!svgTag) throw new Error("Keine SVG-Datei (svg-Element fehlt)");
  let scale = 25.4 / 96, unit = "px";
  const wAttr = attr(svgTag, "width"), vb = attr(svgTag, "viewBox");
  const um = wAttr && /^\s*([\d.]+)\s*(mm|cm|in|pt)\s*$/i.exec(wAttr);
  if (um && vb) {
    const vw = vb.trim().split(/[\s,]+/).map(Number)[2];
    const f = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }[um[2].toLowerCase()];
    if (vw > 0) { scale = (Number(um[1]) * f) / vw; unit = um[2].toLowerCase(); }
  } else if (um) { scale = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }[um[2].toLowerCase()]; unit = um[2].toLowerCase(); }
  const prims = [], warnings = new Set(), skipped = {};
  const S = (q) => [q[0] * scale, q[1] * scale];
  const line = (a, b) => prims.push({ kind: "line", a: S(a), b: S(b), layer: "SVG" });
  const poly = (pts, closed) => { for (let i = 0; i + 1 < pts.length; i++) line(pts[i], pts[i + 1]); if (closed && pts.length > 2) line(pts[pts.length - 1], pts[0]); };
  const re = /<(path|line|rect|circle|ellipse|polyline|polygon|text|image|use)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[0], kind = m[1].toLowerCase();
    if (attr(tag, "transform")) warnings.add("Transformationen (transform) werden nicht ausgewertet – Lage prüfen");
    if (kind === "path") {
      const d = attr(tag, "d");
      if (!d) continue;
      for (const s of svgPathSegments(d, { flipY: true })) {
        if (s.t === "line") line(s.a, s.b);
        else if (s.t === "arc") {
          const r = s.r * scale, c = S([s.cx, s.cy]);
          prims.push({ kind: Math.abs(s.a1 - s.a0) >= 359.999 ? "circle" : "arc", c, r, a0: s.a0 * DEG, a1: s.a1 * DEG, layer: "SVG" });
        } else if (s.t === "poly") poly(s.pts, false);
      }
    } else if (kind === "line") line([num(attr(tag, "x1")), -num(attr(tag, "y1"))], [num(attr(tag, "x2")), -num(attr(tag, "y2"))]);
    else if (kind === "rect") {
      const x = num(attr(tag, "x")), y = num(attr(tag, "y")), w = num(attr(tag, "width")), hh = num(attr(tag, "height"));
      if (attr(tag, "rx")) warnings.add("Abgerundete Rechtecke werden eckig übernommen");
      poly([[x, -y], [x + w, -y], [x + w, -y - hh], [x, -y - hh]], true);
    } else if (kind === "circle") prims.push({ kind: "circle", c: S([num(attr(tag, "cx")), -num(attr(tag, "cy"))]), r: num(attr(tag, "r")) * scale, layer: "SVG" });
    else if (kind === "ellipse") {
      const rx = num(attr(tag, "rx")), ry = num(attr(tag, "ry"));
      prims.push({ kind: "ellipse", c: S([num(attr(tag, "cx")), -num(attr(tag, "cy"))]), major: rx >= ry ? [rx * scale, 0] : [0, ry * scale], ratio: Math.min(rx, ry) / Math.max(rx, ry), layer: "SVG" });
    } else if (kind === "polyline" || kind === "polygon") {
      const v = (attr(tag, "points") || "").trim().split(/[\s,]+/).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], -v[i + 1]]);
      poly(pts, kind === "polygon");
    } else skipped[kind] = (skipped[kind] || 0) + 1;
  }
  return { prims, layers: prims.length ? [{ name: "SVG", count: prims.length }] : [], unit, scale, skipped, warnings: [...warnings] };
}
