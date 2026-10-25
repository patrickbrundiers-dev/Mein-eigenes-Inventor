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
