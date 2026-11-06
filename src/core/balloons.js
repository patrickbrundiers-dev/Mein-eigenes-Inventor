// Positionsnummern für Baugruppen-Zeichnungen: Ankerpunkt je Bauteil, Projektion in eine Ansicht,
// Platzierung der Kreise rund um die Ansicht ohne Überlappung. Rein rechnerisch, ohne Oberfläche.
import { v3, placementMatrix, matApply } from "./geom.js";

/** Bildebene einer Ansicht wie im Kernel (ProjectionCamera): x = rechts, y = oben */
export function viewBasis(dir, up) {
  const d = v3.norm(dir);
  const right = v3.norm(v3.cross(d, v3.norm(up)));
  return { right, up: v3.cross(right, d) };
}
export function projectPoint(p, dir, up) {
  const b = viewBasis(dir, up);
  return [v3.dot(p, b.right), v3.dot(p, b.up)];
}

/** Mittelpunkt der Hüllbox aller Körper eines Bauteils (Bauteil-Koordinaten) oder null */
export function partCenter(result) {
  const bbs = (result?.bodies || []).map((b) => b.props?.bbox).filter(Boolean);
  if (!bbs.length) return null;
  const lo = [0, 1, 2].map((k) => Math.min(...bbs.map((bb) => bb[0][k])));
  const hi = [0, 1, 2].map((k) => Math.max(...bbs.map((bb) => bb[1][k])));
  return lo.map((x, k) => (x + hi[k]) / 2);
}

/**
 * Ein Anker je Stücklisten-Position: erste sichtbare Komponente des Bauteils, Mitte ihrer Hüllbox in Weltkoordinaten.
 * resultOf(partId) → Bauteil-Ergebnis mit bodies[].props.bbox
 */
export function balloonAnchors(asm, resultOf) {
  const out = [];
  const seen = new Set();
  for (const c of asm.components || []) {
    if (c.hidden) continue;
    const ctr = partCenter(resultOf(c.part));
    if (!ctr) continue;
    const p3 = matApply(placementMatrix(c.pos, c.rot), ctr);
    // weitere Exemplare als Ausweich-Anker (Bruchansicht: das erste kann im herausgebrochenen Bereich liegen)
    if (seen.has(c.part)) { out.find((a) => a.part === c.part)?.alts.push(p3); continue; }
    seen.add(c.part);
    out.push({ part: c.part, p3, alts: [p3] });
  }
  return out;
}

/**
 * Kreise rund um die Ansicht verteilen. anchors: [{key, at:[x,y]}] in Blatt-mm; box: {x0,y0,x1,y1} der Ansicht.
 * Jeder Kreis liegt radial außerhalb der Ansicht in Richtung seines Ankers; zu enge Kreise werden auf
 * Mindestabstand auseinandergeschoben. Rückgabe: Map key → [x,y].
 */
export function placeBalloons(anchors, box, { r = 4, gap = 10 } = {}) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const R = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) / 2 + gap + r;
  const minAng = (2 * r + 2) / R;
  const items = anchors.map((a) => ({ key: a.key, ang: Math.atan2(a.at[1] - cy, a.at[0] - cx) || 0 })).sort((a, b) => a.ang - b.ang);
  // auseinanderschieben (mehrere Durchläufe, im Kreis)
  for (let it = 0; it < 50 && items.length > 1; it++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const a = items[i], b = items[(i + 1) % items.length];
      let d = b.ang - a.ang;
      if (i === items.length - 1) d += 2 * Math.PI;
      if (d < minAng - 1e-9) { const push = (minAng - d) / 2; a.ang -= push; b.ang += push; moved = true; }
    }
    if (!moved) break;
  }
  return new Map(items.map((a) => [a.key, [cx + R * Math.cos(a.ang), cy + R * Math.sin(a.ang)]]));
}

/**
 * Positionsnummern auf mehrere Ansichten verteilen (B1). views: [{ id, box: {x0,y0,x1,y1}, at: Map key → [x,y], cap }]
 * (cap = wie viele Kreise um die Ansicht passen). Jedes Bauteil kommt in die Ansicht, in der sein Anker am weitesten von
 * den anderen Ankern entfernt liegt (dort ist die Hinweislinie eindeutig), Ansichten mit wenig Platz werden gemieden.
 * prefer: Id der Ansicht, die bei Gleichstand gewinnt (Isometrie). Rückgabe Map key → view id.
 */
export function assignBalloonViews(views, keys, { prefer = null, cap = 30 } = {}) {
  const load = new Map(views.map((v) => [v.id, 0]));
  const sep = (v, k) => {
    const p = v.at.get(k);
    if (!p) return -1;
    let m = cap;
    for (const [k2, q] of v.at) if (k2 !== k) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1]));
    return m;
  };
  // schwer zuzuordnende zuerst (kleinster bester Abstand)
  const best = (k) => Math.max(...views.map((v) => sep(v, k)));
  const order = [...keys].sort((a, b) => best(a) - best(b));
  const out = new Map();
  for (const k of order) {
    let bv = null, bs = -Infinity;
    for (const v of views) {
      const s0 = sep(v, k);
      if (s0 < 0) continue;
      const full = load.get(v.id) / Math.max(1, v.cap);
      const s = s0 * (full >= 1 ? 0.1 : 1 - 0.5 * full) * (v.id === prefer ? 1.15 : 1);
      if (s > bs) { bs = s; bv = v; }
    }
    if (!bv) continue;
    out.set(k, bv.id);
    load.set(bv.id, load.get(bv.id) + 1);
  }
  return out;
}

/**
 * Kreise an den freien Seiten einer Normalansicht (B1): jeder Kreis an die nächste erlaubte Seite (sides ⊂ "tblr",
 * t = oben, b = unten, l = links, r = rechts), Abstand gap; auf einer Seite gleichmäßig auseinandergeschoben.
 */
export function placeBalloonsEdges(anchors, box, { r = 4, gap = 8, sides = "tblr" } = {}) {
  const off = gap + r, min = 2 * r + 2;
  const bySide = { t: [], b: [], l: [], r: [] };
  for (const a of anchors) {
    const [x, y] = a.at;
    const d = { t: y - box.y0, b: box.y1 - y, l: x - box.x0, r: box.x1 - x };
    const s = [...sides].sort((p, q) => d[p] - d[q])[0];
    bySide[s].push({ key: a.key, u: s === "t" || s === "b" ? x : y });
  }
  const out = new Map();
  for (const s of "tblr") {
    const list = bySide[s].sort((a, b) => a.u - b.u);
    if (!list.length) continue;
    const lo = (s === "t" || s === "b" ? box.x0 : box.y0) - off, hi = (s === "t" || s === "b" ? box.x1 : box.y1) + off;
    // auseinanderschieben, dann in den Bereich der Seite holen
    for (let it = 0; it < 50; it++) {
      let moved = false;
      for (let i = 0; i + 1 < list.length; i++) {
        const dd = list[i + 1].u - list[i].u;
        if (dd < min - 1e-9) { const p = (min - dd) / 2; list[i].u -= p; list[i + 1].u += p; moved = true; }
      }
      if (list[0].u < lo) { const p = lo - list[0].u; for (const q of list) q.u += p; moved = true; }
      if (list[list.length - 1].u > hi && list[0].u > lo) { const p = Math.min(list[list.length - 1].u - hi, list[0].u - lo); for (const q of list) q.u -= p; moved = true; }
      if (!moved) break;
    }
    for (const q of list) {
      const pt = s === "t" ? [q.u, box.y0 - off] : s === "b" ? [q.u, box.y1 + off] : s === "l" ? [box.x0 - off, q.u] : [box.x1 + off, q.u];
      out.set(q.key, pt);
    }
  }
  return out;
}
