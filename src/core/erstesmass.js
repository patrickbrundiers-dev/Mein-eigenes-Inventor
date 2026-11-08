// SolidCraft »Das erste Maß skaliert die Zeichnung«: Bekommt eine Skizze ihr erstes Längenmaß, wird die damit
// verbundene Geometrie im selben Verhältnis vergrößert bzw. verkleinert. So bleibt eine grob gezeichnete Form
// in ihren Proportionen, statt dass nur die bemaßte Kante springt. Getrennte Formen behalten ihre Größe.

import { DIMENSION_TYPES } from "./solver.js";

const ANGLES = new Set(["angle", "lineAngle", "axisAngle"]);
export const isLengthDim = (c) => DIMENSION_TYPES.has(c.type) && !ANGLES.has(c.type);

const entityPoints = (e) => [e.p1, e.p2, e.c, e.p, e.a, ...(e.pts || [])].filter(Boolean);

/** Hat die Skizze schon ein steuerndes Längenmaß? Dann skaliert nichts mehr. */
export function hasSizing(sk) {
  return sk.constraints.some((c) => isLengthDim(c) && !c.driven && !c.disabled);
}

/**
 * Punkte (ids) der zusammenhängenden Geometrie um die Elemente/Punkte des Maßes c.
 * Zusammenhang über gemeinsame Punkte der Elemente und über Bedingungen, die zwei Dinge verbinden.
 * Der Skizzenursprung verbindet nichts (sonst hinge alles am Ursprung zusammen).
 */
export function connectedPoints(sk, c) {
  const ents = new Map(sk.entities.map((e) => [e.id, e]));
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const ptsOf = (k) => {
    if (k.startsWith("p:")) return [k.slice(2)];
    const e = ents.get(k.slice(2));
    return e ? entityPoints(e) : [];
  };
  for (const p of sk.points) add(p.id);
  for (const e of sk.entities) {
    if (e.origin) continue;
    const ps = entityPoints(e);
    for (const p of ps.slice(1)) union(ps[0], p);
  }
  const refs = (k) => [k.p && "p:" + k.p, k.q && "p:" + k.q, k.e && "e:" + k.e, k.e1 && "e:" + k.e1, k.e2 && "e:" + k.e2].filter(Boolean);
  for (const k of sk.constraints) {
    const ps = refs(k).flatMap(ptsOf).filter((p) => p !== "O");
    for (const p of ps.slice(1)) union(ps[0], p);
  }
  const seed = refs(c).flatMap(ptsOf).filter((p) => p !== "O");
  if (!seed.length) return { points: new Set(), touchesOrigin: false };
  const root = find(seed[0]);
  const points = new Set(sk.points.filter((p) => p.id !== "O" && find(p.id) === root).map((p) => p.id));
  // am Ursprung angebunden? (Koinzidenz, Punkt auf Linie … mit dem Ursprungspunkt)
  const touchesOrigin = sk.constraints.some((k) => k.type !== "fix" && refs(k).flatMap(ptsOf).includes("O") && refs(k).flatMap(ptsOf).some((p) => points.has(p)))
    || sk.entities.some((e) => !e.origin && entityPoints(e).includes("O") && entityPoints(e).some((p) => points.has(p)));
  return { points, touchesOrigin };
}

/**
 * Skaliert die mit c verbundene Geometrie von measured auf target. Gibt den Faktor zurück oder null,
 * wenn nicht skaliert wird (schon bemaßt, projizierte/fixierte Geometrie, Faktor unsinnig).
 */
export function scaleForFirstDimension(sk, c, measured, target) {
  if (!isLengthDim(c) || hasSizing(sk)) return null;
  if (!(measured > 1e-9) || !(target > 0)) return null;
  const f = target / measured;
  if (!Number.isFinite(f) || Math.abs(f - 1) < 1e-9 || f > 1e4 || f < 1e-4) return null;
  const { points, touchesOrigin } = connectedPoints(sk, c);
  if (!points.size) return null;
  const inComp = (e) => entityPoints(e).some((p) => points.has(p));
  const comp = sk.entities.filter((e) => !e.origin && inComp(e));
  if (comp.some((e) => e.projected || e.type === "image")) return null;
  if (sk.constraints.some((k) => k.type === "fix" && k.p !== "O" && points.has(k.p))) return null;
  // Drehpunkt: der Ursprung, wenn die Form daran hängt, sonst der erste Punkt des Maßes
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const first = [c.p, c.q].find((id) => id && points.has(id))
    || entityPoints(sk.entities.find((e) => e.id === (c.e || c.e1 || c.e2)) || {}).find((id) => points.has(id));
  const anchor = touchesOrigin ? { x: 0, y: 0 } : P.get(first) || { x: 0, y: 0 };
  for (const id of points) { const p = P.get(id); p.x = anchor.x + (p.x - anchor.x) * f; p.y = anchor.y + (p.y - anchor.y) * f; }
  for (const e of comp) {
    if ((e.type === "circle" || e.type === "ellipse") && Number.isFinite(e.r)) e.r *= f;
    if (e.type === "text" && Number.isFinite(Number(e.height))) e.height = Number(e.height) * f;
  }
  return f;
}
