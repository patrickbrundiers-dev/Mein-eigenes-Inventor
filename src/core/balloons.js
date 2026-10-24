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
    if (c.hidden || seen.has(c.part)) continue;
    const ctr = partCenter(resultOf(c.part));
    if (!ctr) continue;
    seen.add(c.part);
    out.push({ part: c.part, p3: matApply(placementMatrix(c.pos, c.rot), ctr) });
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
