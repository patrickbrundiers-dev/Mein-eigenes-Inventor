// Skizzenwerkzeuge Etappe E1 des SolidCraft-Abgleichs (Patrick 04.11.2026 »alle Befehle einbauen«):
// Übergangskurve, Tangente an Kurvenpunkt, Kreis an zwei Linien, 3-Punkt-Bogenlangloch, Polygon über Kante,
// umschriebenes Polygon, Spline umkehren / Punkt einfügen / entfernen, Spline Grad 5, Versatz lösen,
// Zeichnungsrahmen, Polylinie vereinfachen (Netzquerschnitt). Ohne DOM, testbar.
import { splineNearest } from "./spline.js";

const newPt = (sk, uid, x, y) => { const id = uid("p"); sk.points.push({ id, x, y }); return id; };
const P = (sk, id) => sk.points.find((p) => p.id === id);
const E = (sk, id) => sk.entities.find((e) => e.id === id);
const norm = (x, y) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L]; };

/** Richtung der Kurve am Ende end ("p1" | "p2"), zeigt aus der Kurve heraus */
export function endTangent(sk, en, end) {
  const p = P(sk, en[end]);
  if (en.type === "line") {
    const q = P(sk, en[end === "p1" ? "p2" : "p1"]);
    return norm(p.x - q.x, p.y - q.y);
  }
  if (en.type === "arc") {
    const c = P(sk, en.c);
    // Bogen läuft gegen den Uhrzeigersinn p1 → p2: an p2 heraus = Tangente CCW, an p1 heraus = Tangente CW
    const rx = p.x - c.x, ry = p.y - c.y;
    return end === "p2" ? norm(-ry, rx) : norm(ry, -rx);
  }
  if (en.type === "spline") {
    const ids = en.pts;
    const a = end === "p2" ? P(sk, ids[ids.length - 2]) : P(sk, ids[1]);
    return norm(p.x - a.x, p.y - a.y);
  }
  throw new Error("Übergangskurve nur an Linie, Bogen oder Spline");
}

/** Nächstes Ende (p1/p2) einer Kurve zum Punkt (x, y) */
export function nearestEnd(sk, en, x, y) {
  const d = (k) => { const p = P(sk, en[k]); return Math.hypot(p.x - x, p.y - y); };
  return d("p1") <= d("p2") ? "p1" : "p2";
}

/**
 * Übergangskurve (SolidCraft »Blend curve«): kubischer Spline von Ende a zu Ende b, tangential an beide Kurven.
 * a, b = { e: Entity-ID, end: "p1" | "p2" }; bulge = Anteil des Abstands für die Tangentenlänge (Standard 1/3).
 */
export function buildBlendCurve(sk, a, b, { uid, bulge = 1 / 3, construction = false }) {
  const ea = E(sk, a.e), eb = E(sk, b.e);
  if (!ea || !eb) throw new Error("Zwei Kurvenenden wählen");
  if (ea.id === eb.id && a.end === b.end) throw new Error("Zwei verschiedene Enden wählen");
  const pa = P(sk, ea[a.end]), pb = P(sk, eb[b.end]);
  const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  if (!(d > 1e-6)) throw new Error("Die Enden liegen aufeinander");
  const ta = endTangent(sk, ea, a.end), tb = endTangent(sk, eb, b.end);
  const k = d * bulge;
  const c1 = newPt(sk, uid, pa.x + ta[0] * k, pa.y + ta[1] * k);
  const c2 = newPt(sk, uid, pb.x + tb[0] * k, pb.y + tb[1] * k);
  const id = uid("sp");
  sk.entities.push({ id, type: "spline", pts: [pa.id, c1, c2, pb.id], p1: pa.id, p2: pb.id, construction, blend: true });
  // tangential an beide Kurven (Löser: Richtung zum Nachbar-Kontrollpunkt)
  for (const [o, end] of [[ea, "start"], [eb, "end"]]) if (o.type !== "spline") sk.constraints.push({ id: uid("k"), type: "tangent", e1: id, e2: o.id, end });
  return id;
}

/** Tangente an einen Kreis/Bogen im Kurvenpunkt nächst (x, y): lange Hilfslinie, tangential und Punkt auf Kreis */
export function buildTangentAt(sk, en, x, y, { uid, length = 4000 }) {
  if (en.type !== "circle" && en.type !== "arc") throw new Error("Kreis oder Bogen wählen");
  const c = P(sk, en.c);
  const r = en.type === "circle" ? en.r : Math.hypot(P(sk, en.p1).x - c.x, P(sk, en.p1).y - c.y);
  const [ux, uy] = norm(x - c.x, y - c.y);
  const tx = -uy, ty = ux;
  const qx = c.x + ux * r, qy = c.y + uy * r;
  const at = newPt(sk, uid, qx, qy);
  const p1 = newPt(sk, uid, qx - tx * length / 2, qy - ty * length / 2), p2 = newPt(sk, uid, qx + tx * length / 2, qy + ty * length / 2);
  const line = uid("l");
  sk.entities.push({ id: line, type: "line", p1, p2, construction: true, helper: true });
  sk.constraints.push({ id: uid("k"), type: "midpoint", p: at, e: line }, { id: uid("k"), type: "pointOnCircle", p: at, e: en.id }, { id: uid("k"), type: "tangent", e1: en.id, e2: line });
  return { line, at };
}

/** Schnittpunkt zweier Geraden durch a1→a2 und b1→b2 (oder null bei parallel) */
const cross = (a1, a2, b1, b2) => {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y, d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / den;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
};

/**
 * Kreis mit Radius r tangential an zwei Linien (SolidCraft »2-Tangenten-Kreis«); der Klickpunkt wählt den Winkelraum.
 * Bei parallelen Linien: Radius = halber Abstand, Mitte zwischen den Linien beim Klick.
 */
export function buildCircleTangent2(sk, l1, l2, r, click, { uid, rExpr = null, construction = false }) {
  const A = E(sk, l1), B = E(sk, l2);
  if (A?.type !== "line" || B?.type !== "line" || A.id === B.id) throw new Error("Zwei Linien wählen");
  const a1 = P(sk, A.p1), a2 = P(sk, A.p2), b1 = P(sk, B.p1), b2 = P(sk, B.p2);
  const nA = norm(-(a2.y - a1.y), a2.x - a1.x), nB = norm(-(b2.y - b1.y), b2.x - b1.x);
  const side = (n, p) => Math.sign((click.x - p.x) * n[0] + (click.y - p.y) * n[1]) || 1;
  const sA = side(nA, a1), sB = side(nB, b1);
  const X = cross(a1, a2, b1, b2);
  let cx, cy, rad = r;
  if (!X) {
    const dist = Math.abs((b1.x - a1.x) * nA[0] + (b1.y - a1.y) * nA[1]);
    rad = dist / 2;
    const t = ((click.x - a1.x) * (a2.x - a1.x) + (click.y - a1.y) * (a2.y - a1.y)) / ((a2.x - a1.x) ** 2 + (a2.y - a1.y) ** 2);
    cx = a1.x + t * (a2.x - a1.x) + nA[0] * sA * rad; cy = a1.y + t * (a2.y - a1.y) + nA[1] * sA * rad;
  } else {
    if (!(r > 0)) throw new Error("Radius > 0");
    // Mitte: Schnitt der beiden um r zur Klickseite versetzten Linien
    const o = (p, n, s) => ({ x: p.x + n[0] * s * r, y: p.y + n[1] * s * r });
    const M = cross(o(a1, nA, sA), o(a2, nA, sA), o(b1, nB, sB), o(b2, nB, sB));
    cx = M.x; cy = M.y;
  }
  const c = newPt(sk, uid, cx, cy);
  const id = uid("c");
  sk.entities.push({ id, type: "circle", c, r: rad, construction });
  sk.constraints.push({ id: uid("k"), type: "tangent", e1: id, e2: A.id }, { id: uid("k"), type: "tangent", e1: id, e2: B.id });
  if (X) sk.constraints.push({ id: uid("m"), type: "radius", e: id, value: rExpr ?? String(r), labelAngle: Math.PI / 4 });
  return { circle: id, center: c };
}

/** Umkreis durch drei Punkte → {x, y, r} oder null (kollinear) */
export function circumcircle(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p) => p.x * p.x + p.y * p.y;
  const x = (s(a) * (b.y - c.y) + s(b) * (c.y - a.y) + s(c) * (a.y - b.y)) / d;
  const y = (s(a) * (c.x - b.x) + s(b) * (a.x - c.x) + s(c) * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/** 3-Punkt-Bogenlangloch: Bahn durch Start a, Punkt m, Ende b → {c, s, e} gegen den Uhrzeigersinn für buildArcSlot */
export function arcSlotFrom3(a, m, b) {
  const C = circumcircle(a, m, b);
  if (!C) throw new Error("Die drei Punkte liegen auf einer Geraden");
  const ang = (p) => Math.atan2(p.y - C.y, p.x - C.x);
  const ccw = (from, to) => { let d = to - from; while (d < 0) d += 2 * Math.PI; return d; };
  // liegt m auf dem CCW-Weg von a nach b? sonst andersherum
  const inside = ccw(ang(a), ang(m)) < ccw(ang(a), ang(b));
  const c = { x: C.x, y: C.y };
  return inside ? { c, s: a, e: b } : { c, s: b, e: a };
}

/** Polygon über eine Kante a→b mit n Ecken auf der Seite des Klickpunkts: Mitte und erste Ecke für buildPolygon */
export function polygonFromEdge(a, b, n, click) {
  if (!(n >= 3)) throw new Error("Mindestens 3 Ecken");
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(L > 1e-9)) throw new Error("Kante hat keine Länge");
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const [nx, ny] = norm(-(b.y - a.y), b.x - a.x);
  const s = Math.sign((click.x - mx) * nx + (click.y - my) * ny) || 1;
  const apo = L / 2 / Math.tan(Math.PI / n);
  return { c: { x: mx + nx * s * apo, y: my + ny * s * apo }, v: { x: a.x, y: a.y } };
}

/** Umschriebenes Polygon: Seitenmitte bei v (Abstand = Inkreisradius) → Ecke für buildPolygon */
export function circumscribedVertex(c, v, n) {
  const ri = Math.hypot(v.x - c.x, v.y - c.y), a = Math.atan2(v.y - c.y, v.x - c.x) + Math.PI / n;
  const R = ri / Math.cos(Math.PI / n);
  return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) };
}

/** Spline umkehren (Laufrichtung) */
export function reverseSpline(en) {
  if (en?.type !== "spline") throw new Error("Spline wählen");
  en.pts = [...en.pts].reverse();
  [en.p1, en.p2] = [en.p2, en.p1];
  return en;
}

/** Kontrollpunkt am Abschnitt nächst (x, y) einfügen (zwischen den beiden nächsten Kontrollpunkten) */
export function insertSplinePoint(sk, en, x, y, { uid }) {
  if (en?.type !== "spline") throw new Error("Spline wählen");
  const ctrl = en.pts.map((id) => { const p = P(sk, id); return [p.x, p.y]; });
  const near = splineNearest(ctrl, x, y);
  // Polygonzug der Kontrollpunkte: Abschnitt mit kleinstem Abstand zum Kurvenpunkt
  let best = 0, bd = Infinity;
  for (let i = 0; i + 1 < ctrl.length; i++) {
    const [ax, ay] = ctrl[i], [bx, by] = ctrl[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-24;
    const t = Math.max(0, Math.min(1, ((near.x - ax) * dx + (near.y - ay) * dy) / L2));
    const d = Math.hypot(near.x - ax - t * dx, near.y - ay - t * dy);
    if (d < bd) { bd = d; best = i; }
  }
  const id = newPt(sk, uid, near.x, near.y);
  en.pts.splice(best + 1, 0, id);
  return id;
}

/** Inneren Kontrollpunkt entfernen (Enden bleiben, mindestens 2 Punkte) */
export function removeSplinePoint(sk, en, pid) {
  if (en?.type !== "spline") throw new Error("Spline wählen");
  const i = en.pts.indexOf(pid);
  if (i <= 0 || i >= en.pts.length - 1) throw new Error("Nur innere Kontrollpunkte lassen sich entfernen");
  if (en.pts.length <= 3) throw new Error("Ein Spline braucht mindestens 2 Punkte");
  en.pts.splice(i, 1);
  const used = sk.entities.some((e) => e !== en && [e.p1, e.p2, e.c, e.p, ...(e.pts || [])].includes(pid)) || en.pts.includes(pid);
  if (!used) {
    sk.points = sk.points.filter((p) => p.id !== pid);
    sk.constraints = sk.constraints.filter((c) => ![c.p, c.q, c.p1, c.p2].includes(pid));
  }
  return en;
}

/** Versatzverknüpfung lösen: Versatz-Bedingungen der gewählten Elemente entfernen → Anzahl */
export function breakOffset(sk, ids) {
  const set = new Set(ids);
  const before = sk.constraints.length;
  sk.constraints = sk.constraints.filter((c) => !(c.type === "offset" && (set.has(c.e1) || set.has(c.e2))));
  return before - sk.constraints.length;
}

/** Zeichnungsrahmen: Rechteck aus Konstruktionslinien B × H um den Ursprung, fixiert (SolidCraft »Zeichnungsgröße«) */
export function buildDrawingBounds(sk, w, hgt, { uid }) {
  if (!(w > 0 && hgt > 0)) throw new Error("Breite und Höhe > 0");
  sk.entities = sk.entities.filter((e) => !e.bounds);
  const ids = [[-w / 2, -hgt / 2], [w / 2, -hgt / 2], [w / 2, hgt / 2], [-w / 2, hgt / 2]].map(([x, y]) => newPt(sk, uid, x, y));
  const lines = [];
  for (let i = 0; i < 4; i++) { const id = uid("l"); lines.push(id); sk.entities.push({ id, type: "line", p1: ids[i], p2: ids[(i + 1) % 4], construction: true, bounds: true }); }
  for (const [i, p] of ids.entries()) { const q = P(sk, p); sk.constraints.push({ id: uid("k"), type: "fix", p, x: q.x, y: q.y }); }
  return lines;
}

/**
 * Polylinie vereinfachen (Douglas-Peucker), für Netzquerschnitte und Schnittkurven: tol in mm.
 * pts = [[x,y]…], geschlossen = erster Punkt wird am Ende wiederholt.
 */
export function simplifyPolyline(pts, tol = 0.05) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = L > 1e-12 ? Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / L : Math.hypot(pts[k][0] - ax, pts[k][1] - ay);
      if (d > bd) { bd = d; best = k; }
    }
    if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Polylinien als Linien in die Skizze (geschlossene Schleifen bleiben zu) → Liste neuer Linien-IDs */
export function addPolylines(sk, loops, { uid, construction = false, closed = true }) {
  const out = [];
  for (const loop of loops) {
    let pts = loop;
    const isClosed = closed && pts.length > 2 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6;
    if (isClosed) pts = pts.slice(0, -1);
    const ids = pts.map(([x, y]) => newPt(sk, uid, x, y));
    const n = closed && pts.length > 2 ? ids.length : ids.length - 1;
    for (let i = 0; i < n; i++) { const id = uid("l"); out.push(id); sk.entities.push({ id, type: "line", p1: ids[i], p2: ids[(i + 1) % ids.length], construction }); }
  }
  return out;
}

/**
 * Fase Abstand + Winkel (SolidCraft »Distance-angle chamfer«): Abstand d1 auf der ersten Linie, Winkel alpha (Grad)
 * zwischen erster Linie und Fasenlinie; phi = Eckwinkel (Bogenmaß). Sinussatz → Abstand auf der zweiten Linie.
 */
export function chamferSecondDistance(d1, alphaDeg, phi) {
  const a = (alphaDeg * Math.PI) / 180;
  if (!(a > 0) || a + phi >= Math.PI - 1e-9) throw new Error("Winkel passt nicht zur Ecke");
  return (d1 * Math.sin(a)) / Math.sin(a + phi);
}

/**
 * Auto-Bedingungen (SolidCraft »Finish with auto constraints«): fast waagrechte/senkrechte Linien bekommen
 * horizontal/vertikal, sofern sie noch keine Richtungsbedingung haben. tolDeg = Winkeltoleranz → Anzahl neuer Bedingungen.
 */
export function autoConstraints(sk, { uid, tolDeg = 1 } = {}) {
  const has = new Set(sk.constraints.filter((c) => ["horizontal", "vertical", "parallel", "perpendicular", "angle", "collinear"].includes(c.type)).flatMap((c) => [c.e, c.e1, c.e2]).filter(Boolean));
  const tol = Math.sin((tolDeg * Math.PI) / 180);
  let n = 0;
  for (const e of sk.entities) {
    if (e.type !== "line" || e.bounds || has.has(e.id)) continue;
    const a = P(sk, e.p1), b = P(sk, e.p2);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(L > 1e-9)) continue;
    const type = Math.abs(b.y - a.y) / L < tol ? "horizontal" : Math.abs(b.x - a.x) / L < tol ? "vertical" : null;
    if (!type) continue;
    sk.constraints.push({ id: uid("k"), type, e: e.id });
    n++;
  }
  return n;
}

/**
 * Netzquerschnitt (SolidCraft »Mesh section«): Dreiecksnetz (Weltkoordinaten pos[], idx[] oder null) mit der
 * Skizzenebene frame {origin, xDir, yDir, normal} schneiden → Polylinien [[x,y]…] in Skizzenkoordinaten.
 * Geschlossene Schnitte wiederholen den ersten Punkt am Ende.
 */
export function meshPlaneSection(pos, idx, frame, { tol = 1e-4 } = {}) {
  const { origin: o, xDir: X, yDir: Y, normal: N } = frame;
  const nTri = idx ? idx.length / 3 : pos.length / 9;
  const vi = (t, k) => (idx ? idx[3 * t + k] : 3 * t + k);
  const P3 = (i) => [pos[3 * i] - o[0], pos[3 * i + 1] - o[1], pos[3 * i + 2] - o[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const key = (q) => `${Math.round(q[0] / tol)},${Math.round(q[1] / tol)}`;
  const segs = [];
  for (let t = 0; t < nTri; t++) {
    const p = [P3(vi(t, 0)), P3(vi(t, 1)), P3(vi(t, 2))];
    // leicht verschobene Abstände: Ecken genau auf der Ebene zählen zur positiven Seite (keine doppelten Punkte)
    const d = p.map((q) => { const v = dot(q, N); return Math.abs(v) < 1e-9 ? 1e-9 : v; });
    const cut = [];
    for (let k = 0; k < 3; k++) {
      const a = k, b = (k + 1) % 3;
      if ((d[a] > 0) === (d[b] > 0)) continue;
      const s = d[a] / (d[a] - d[b]);
      const q = [0, 1, 2].map((m) => p[a][m] + s * (p[b][m] - p[a][m]));
      cut.push([dot(q, X), dot(q, Y)]);
    }
    if (cut.length === 2 && key(cut[0]) !== key(cut[1])) segs.push(cut);
  }
  // Abschnitte über gemeinsame Endpunkte zu Polylinien verketten
  const adj = new Map();
  segs.forEach((s, i) => { for (const q of s) { const k = key(q); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); } });
  const used = new Uint8Array(segs.length), out = [];
  const other = (i, k) => (key(segs[i][0]) === k ? segs[i][1] : segs[i][0]);
  const walk = (line) => {
    for (;;) {
      const k = key(line.at(-1));
      const next = (adj.get(k) || []).find((j) => !used[j]);
      if (next == null) return;
      used[next] = 1;
      line.push(other(next, k));
    }
  };
  // offene Enden zuerst (Grad 1), dann die geschlossenen Schleifen
  const order = [...segs.keys()].sort((a, b) => Math.min(...segs[a].map((q) => adj.get(key(q)).length)) - Math.min(...segs[b].map((q) => adj.get(key(q)).length)));
  for (const i of order) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    walk(line);
    line.reverse();
    walk(line);
    out.push(line);
  }
  return out;
}

/**
 * Gedrehtes Profil (SolidCraft »Spun profile«): alle Netzpunkte (Welt) um eine Achse in der Skizzenebene gedreht
 * in die Ebene gelegt → Hüllkontur r(s) als halbes Drehprofil, geschlossen über die Achse (für Drehung nutzbar).
 * axis {a:[x,y], b:[x,y]} in Skizzenkoordinaten; bins = Auflösung längs der Achse.
 */
export function spunProfile(pos, frame, axis, { bins = 200 } = {}) {
  const { origin: o, xDir: X, yDir: Y, normal: N } = frame;
  const A = [o[0] + X[0] * axis.a[0] + Y[0] * axis.a[1], o[1] + X[1] * axis.a[0] + Y[1] * axis.a[1], o[2] + X[2] * axis.a[0] + Y[2] * axis.a[1]];
  const d2 = [axis.b[0] - axis.a[0], axis.b[1] - axis.a[1]], L2 = Math.hypot(...d2);
  if (!(L2 > 1e-9)) throw new Error("Achse hat keine Länge");
  const u2 = [d2[0] / L2, d2[1] / L2];
  const U = [0, 1, 2].map((k) => X[k] * u2[0] + Y[k] * u2[1]);
  let sMin = Infinity, sMax = -Infinity;
  const S = [], Rr = [];
  for (let i = 0; i < pos.length; i += 3) {
    const v = [pos[i] - A[0], pos[i + 1] - A[1], pos[i + 2] - A[2]];
    const s = v[0] * U[0] + v[1] * U[1] + v[2] * U[2];
    const r = Math.hypot(v[0] - s * U[0], v[1] - s * U[1], v[2] - s * U[2]);
    S.push(s); Rr.push(r);
    if (s < sMin) sMin = s; if (s > sMax) sMax = s;
  }
  if (!S.length || !(sMax - sMin > 1e-9)) throw new Error("Keine Körper zum Drehen");
  const n = bins, rmax = new Float64Array(n + 1).fill(-1);
  for (let i = 0; i < S.length; i++) { const k = Math.round(((S[i] - sMin) / (sMax - sMin)) * n); if (Rr[i] > rmax[k]) rmax[k] = Rr[i]; }
  // Lücken (keine Netzpunkte im Fach) aus den Nachbarn füllen
  for (let k = 0; k <= n; k++) if (rmax[k] < 0) { let l = k - 1, r = k + 1; while (l >= 0 && rmax[l] < 0) l--; while (r <= n && rmax[r] < 0) r++; rmax[k] = Math.max(l >= 0 ? rmax[l] : 0, r <= n ? rmax[r] : 0); }
  // Seite: Normale der Achse in der Ebene, zur Seite des Ursprungsabstands positiv
  const nrm = [-u2[1], u2[0]];
  const P = (s, r) => [axis.a[0] + u2[0] * s + nrm[0] * r, axis.a[1] + u2[1] * s + nrm[1] * r];
  const out = [P(sMin, 0)];
  for (let k = 0; k <= n; k++) out.push(P(sMin + ((sMax - sMin) * k) / n, rmax[k]));
  out.push(P(sMax, 0), P(sMin, 0));
  return out;
}
