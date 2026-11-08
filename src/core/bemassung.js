// Zeichnung: weitere Bemaßung (Fusion-Abgleich FU11). Reine Rechnung ohne Oberfläche:
// Ketten- und Bezugsmaße aus einer Punktfolge, Maße in Reihen ausrichten, Positionsnummern im Uhrzeigersinn
// nummerieren und an den Seiten der Ansicht ausrichten, Bogenlänge.

/** Abstand zwischen zwei Maßreihen in mm (DIN 406: mindestens 7 mm, erste Reihe 10 mm von der Kontur) */
export const ROW_GAP = 7;
export const FIRST_ROW = 10;

/**
 * Maße aus einer Punktfolge (Ansichtskoordinaten) in einer Richtung (kind "h" oder "v").
 * mode "kette": jedes Maß vom vorigen zum nächsten Punkt, alle in einer Reihe.
 * mode "bezug": jedes Maß vom ersten Punkt aus, Reihen gestaffelt (kürzestes innen).
 * off = Abstand der ersten Reihe (Vorzeichen = Seite). Punkte mit gleicher Lage in Maßrichtung entfallen.
 */
export function chainDims(points, { kind = "h", mode = "kette", off = FIRST_ROW, gap = ROW_GAP } = {}) {
  const k = kind === "v" ? 1 : 0;
  const pts = [];
  for (const p of points) if (!pts.some((q) => Math.abs(q[k] - p[k]) < 1e-6)) pts.push(p);
  const out = [];
  const sg = Math.sign(off) || 1;
  if (mode === "bezug") {
    const base = pts[0];
    const rest = pts.slice(1).sort((a, b) => Math.abs(a[k] - base[k]) - Math.abs(b[k] - base[k]));
    rest.forEach((p, i) => out.push({ kind, p1: base, p2: p, off: off + sg * i * gap }));
  } else {
    for (let i = 1; i < pts.length; i++) out.push({ kind, p1: pts[i - 1], p2: pts[i], off });
  }
  return out;
}

/**
 * Maße einer Richtung in Reihen ausrichten. items: [{ id, side (+1/−1), edge (äußerste Konturlage der beiden
 * Maßpunkte auf dieser Seite, Blatt-mm), lo, hi (Ausdehnung längs der Maßlinie) }]. Rückgabe Map id → Lage der
 * Maßlinie (Blatt-mm, gleiche Achse wie edge). Reihe 1 liegt FIRST_ROW hinter der äußersten Kontur aller Maße
 * dieser Seite; überlappende Maße kommen in die nächste Reihe, kürzere nach innen.
 */
export function alignRows(items, { first = FIRST_ROW, gap = ROW_GAP } = {}) {
  const res = new Map();
  for (const side of [1, -1]) {
    const list = items.filter((x) => (x.side || 1) === side).sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo);
    if (!list.length) continue;
    const outer = side > 0 ? Math.max(...list.map((x) => x.edge)) : Math.min(...list.map((x) => x.edge));
    const rows = [];
    for (const it of list) {
      let r = rows.findIndex((row) => row.every((o) => it.hi <= o.lo + 1e-6 || it.lo >= o.hi - 1e-6));
      if (r < 0) { rows.push([]); r = rows.length - 1; }
      rows[r].push(it);
      res.set(it.id, outer + side * (first + r * gap));
    }
  }
  return res;
}

/** Positionsnummern im Uhrzeigersinn ab »12 Uhr« um den Mittelpunkt c (Blatt: y nach unten) → Schlüssel in neuer Reihenfolge */
export function clockwiseOrder(items, c) {
  const ang = (p) => { const a = Math.atan2(p[0] - c[0], -(p[1] - c[1])); return a < -1e-9 ? a + 2 * Math.PI : a; };
  return [...items].sort((a, b) => ang(a.at) - ang(b.at)).map((x) => x.key);
}

/**
 * Positionsnummern an den Seiten der Ansicht ausrichten: jede Nummer an die nächste Seite des Rechtecks box
 * (Abstand gap), auf der Seite gleichmäßig mit mindestens step Abstand, Reihenfolge längs der Seite bleibt.
 * items: [{ key, at:[x,y] }] → Map key → [x,y]
 */
export function alignBalloons(items, box, { gap = 12, step = 10 } = {}) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const w = Math.max(box.x1 - box.x0, 1), hh = Math.max(box.y1 - box.y0, 1);
  const sides = { links: [], rechts: [], oben: [], unten: [] };
  for (const it of items) {
    const dx = (it.at[0] - cx) / w, dy = (it.at[1] - cy) / hh;
    const s = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "links" : "rechts") : dy < 0 ? "oben" : "unten";
    sides[s].push(it);
  }
  const out = new Map();
  const spread = (list, k, lo, hi, fixed, fk) => {
    list.sort((a, b) => a.at[k] - b.at[k]);
    let prev = -Infinity;
    const pos = list.map((it) => { const v = Math.max(it.at[k], prev + step); prev = v; return v; });
    // über das Ende hinaus: nach vorn schieben
    const over = pos.length ? pos[pos.length - 1] - hi : 0;
    if (over > 0) for (let i = 0; i < pos.length; i++) pos[i] -= over;
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + step);
    list.forEach((it, i) => { const p = [0, 0]; p[k] = Math.max(lo, pos[i]); p[fk] = fixed; out.set(it.key, p); });
  };
  spread(sides.links, 1, box.y0, box.y1, box.x0 - gap, 0);
  spread(sides.rechts, 1, box.y0, box.y1, box.x1 + gap, 0);
  spread(sides.oben, 0, box.x0, box.x1, box.y0 - gap, 1);
  spread(sides.unten, 0, box.x0, box.x1, box.y1 + gap, 1);
  return out;
}

/** Bogenlänge r · Öffnungswinkel (Bogenmaß) */
export const arcLength = (r, sweep) => Math.abs(r * sweep);

/** Liegt q auf dem Umfang des Bogens a (bei Teilbögen nur zwischen a0 und a1)? */
const onArc = (q, a, tol) => {
  if (Math.abs(Math.hypot(q[0] - a.cx, q[1] - a.cy) - a.r) > tol) return false;
  if (a.full || !Number.isFinite(a.a0) || !Number.isFinite(a.a1)) return true;
  const t = Math.atan2(q[1] - a.cy, q[0] - a.cx), two = 2 * Math.PI;
  const sw = ((a.a1 - a.a0) % two + two) % two, rel = ((t - a.a0) % two + two) % two;
  return rel <= sw + tol / a.r || rel >= two - tol / a.r;
};
const isArcEnd = (q, a, tol) => !a.full && [a.a0, a.a1].some((t) => Number.isFinite(t) && Math.hypot(a.cx + a.r * Math.cos(t) - q[0], a.cy + a.r * Math.sin(t) - q[1]) <= tol);

/**
 * Fangpunkte für die Bemaßung: Enden und Ecken der Linienzüge, aber nicht die Stützpunkte, mit denen Kreise und Bögen
 * abgetastet sind. Kleine Kreise haben nur wenige Stützpunkte mit großem Knick; als „Ecke“ gefangen lenkten sie jeden
 * Klick auf den Kreis in ein Punkt-zu-Punkt-Maß, das Durchmessermaß kam nie zustande. Bogenenden bleiben Fangpunkte.
 * Rückgabe: Punkte [x, y] in Ansichtskoordinaten.
 */
export function snapPoints(polylines, arcs = [], { tol = 1e-3 } = {}) {
  const out = [];
  const tolOf = (a) => Math.max(tol, a.r * 1e-4);
  // Raster über die Bögen, damit große Ansichten (viele Kreise × viele Stützpunkte) schnell bleiben
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of arcs) { x0 = Math.min(x0, a.cx - a.r); y0 = Math.min(y0, a.cy - a.r); x1 = Math.max(x1, a.cx + a.r); y1 = Math.max(y1, a.cy + a.r); }
  const cell = Math.max((x1 - x0 + y1 - y0) / 128, 1e-6), grid = new Map(), big = [];
  const ci = (x) => Math.floor((x - x0) / cell), cj = (y) => Math.floor((y - y0) / cell);
  for (const a of arcs) {
    const i0 = ci(a.cx - a.r - 0.01), i1 = ci(a.cx + a.r + 0.01), j0 = cj(a.cy - a.r - 0.01), j1 = cj(a.cy + a.r + 0.01);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 256) { big.push(a); continue; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i + "," + j; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(a); }
  }
  const near = (q) => (grid.get(ci(q[0]) + "," + cj(q[1])) || []).concat(big);
  const curve = (q) => near(q).some((a) => onArc(q, a, tolOf(a)) && !isArcEnd(q, a, tolOf(a)));
  for (const pl of polylines || []) {
    if (pl.length < 2) continue;
    for (const q of [pl[0], pl[pl.length - 1]]) if (!curve(q)) out.push(q);
    for (let i = 1; i < pl.length - 1; i++) {
      const a = pl[i - 1], b = pl[i], c = pl[i + 1];
      // Übergang Gerade–Bogen (Tangentenpunkt) ist ein Fangpunkt, auch ohne Knick
      if (near(b).some((r) => isArcEnd(b, r, tolOf(r)))) { out.push(b); continue; }
      const cr = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
      if (cr < 1e-6) continue;
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (cr / (seg * seg) < 0.02) continue; // Kurven-Stützpunkt, keine Ecke
      if (curve(b)) continue;
      out.push(b);
    }
  }
  return out;
}

/** Nächster Kreis/Bogen, dessen Umfang höchstens pick vom Punkt q entfernt ist: { arc, dist } oder null */
export function nearestArc(arcs, q, pick) {
  let best = null;
  for (const a of arcs || []) {
    const dist = Math.abs(Math.hypot(q[0] - a.cx, q[1] - a.cy) - a.r);
    if (dist <= pick && (!best || dist < best.dist) && onArc(q, a, pick)) best = { arc: a, dist };
  }
  return best;
}

/**
 * Längenmaß quer über einen Zylinder (Rohr, Welle oder Bohrung von der Seite): das Maß steht senkrecht zu einer Achse,
 * beide Maßpunkte liegen gleich weit beiderseits von ihr und der Abstand ist der Durchmesser eines Zylinders auf dieser
 * Achse → DIN 406: Ø vor die Maßzahl. axes: [[a, b]] wie axisLines, radii: je Achse die Radien ihrer Zylinder.
 */
export function acrossAxis(m, axes, radii, tol = 0.01) {
  if (!m?.p1 || !m?.p2 || !(m.kind === "h" || m.kind === "v" || m.kind === "a")) return false;
  const [p, q] = [m.p1, m.p2];
  const u = m.kind === "h" ? [1, 0] : m.kind === "v" ? [0, 1] : (() => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; })();
  const span = Math.abs((q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1]);
  if (span < 1e-6) return false;
  return (axes || []).some(([a, b], i) => {
    if (!(radii?.[i] || []).some((r) => Math.abs(2 * r - span) <= tol)) return false;
    const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty);
    if (!(L > 1e-9)) return false;
    const t = [tx / L, ty / L];
    if (Math.abs(t[0] * u[0] + t[1] * u[1]) > 1e-3) return false; // Achse muss quer zum Maß liegen
    const s = (r) => (r[0] - a[0]) * u[0] + (r[1] - a[1]) * u[1];
    if (Math.abs(s(p) + s(q)) > tol) return false;
    // Maßpunkte im Bereich der Achse (mit Spiel für Fasen und Rundungen an den Enden)
    const along = (r) => (r[0] - a[0]) * t[0] + (r[1] - a[1]) * t[1];
    return [p, q].every((r) => along(r) >= -span && along(r) <= L + span);
  });
}

/** Zeichen vor der Maßzahl (DIN 406-11): Durchmesser, Quadrat, Radius, Kugel, Gewinde */
export const DIM_PREFIXES = ["", "Ø", "□", "R", "SØ", "SR", "M"];
