// Kinematik in Baugruppen (MegaCAD-Abgleich M23, Schiebegelenk E8): Dreh- oder Schiebegelenk an einer Komponente,
// Bewegung im Bereich, Explosionsdarstellung. Reine Rechnung; Anzeige und Animation in src/ui (viewer.js, props.js).
//
// Gelenk an der Komponente: c.joint = { kind?, p, d, angle, min, max } – Achse durch Punkt p mit Richtung d in
// Baugruppen-Koordinaten, angle = aktueller Wert: beim Drehgelenk (kind fehlt oder "dreh") Winkel in °, beim
// Schiebegelenk (kind "schiebe") Weg in mm entlang d. c.pos/c.rot sind immer die Lage beim aktuellen Winkel,
// damit Stückliste, Zeichnung, Export und Kollision unverändert damit rechnen. Eine Komponente mit Gelenk
// wird von Abhängigkeiten nicht verschoben (wie fixiert); sie bewegt sich nur über den Gelenkwinkel.

import { placementMatrix, rotationAbout, matMul, decomposePlacement, v3 } from "./geom.js";

/** Neues Gelenk mit Achse (Punkt, Richtung); Winkel 0 = heutige Lage */
export function defaultJoint(p = [0, 0, 0], d = [0, 0, 1], { min = 0, max = 90, kind = "dreh", smin = 0, smax = 100 } = {}) {
  if (!(Math.hypot(...d) > 1e-9)) throw new Error("Achsrichtung angeben");
  const base = { ...(kind === "schiebe" || kind === "zylinder" ? { kind } : {}), p: p.map(Number), d: v3.norm(d), angle: 0, min, max };
  // Zylindergelenk (Werkzeuge Stufe 39): Drehung um die Achse und zusätzlich Weg s entlang der Achse
  return kind === "zylinder" ? { ...base, s: 0, smin, smax } : base;
}

export const isSlide = (j) => j?.kind === "schiebe";
export const isCylinder = (j) => j?.kind === "zylinder";
/** Einheit und Name des Gelenkwerts */
export const jointUnit = (j) => (isSlide(j) ? "mm" : "°");
export const jointLabel = (j) => (isSlide(j) ? "Schiebegelenk" : isCylinder(j) ? "Zylindergelenk" : "Drehgelenk");

const clampSlide = (j, s) => Math.min(Math.max(s, Math.min(j.smin, j.smax)), Math.max(j.smin, j.smax));
/** Zylindergelenk: Verschiebung (4×4) vom aktuellen Weg zum Weg s entlang der Achse */
export function slideDelta(j, s) {
  return placementMatrix(v3.mul(v3.norm(j.d), clampSlide(j, s) - (j.s || 0)), [0, 0, 0]);
}
/** Zylindergelenk: Weg setzen; Achspunkt wandert mit, damit die Drehung um die verschobene Achse geht */
export function setJointSlide(c, s, followers = []) {
  const j = c.joint;
  const t = clampSlide(j, Number(s) || 0);
  const D = slideDelta(j, t);
  for (const f of [c, ...followers]) Object.assign(f, decomposePlacement(matMul(D, placementMatrix(f.pos, f.rot))));
  j.p = v3.add(j.p, v3.mul(v3.norm(j.d), t - (j.s || 0)));
  j.s = t;
  return t;
}

export const clampAngle = (j, a) => Math.min(Math.max(a, Math.min(j.min, j.max)), Math.max(j.min, j.max));

/** Bewegung (4×4) vom aktuellen Gelenkwert zum Wert a: Drehung um die Achse bzw. Verschiebung entlang d */
export function jointDelta(j, a) {
  const t = clampAngle(j, a) - (j.angle || 0);
  if (isSlide(j)) return placementMatrix(v3.mul(v3.norm(j.d), t), [0, 0, 0]);
  return rotationAbout(j.p, j.d, t);
}

/** Lage {pos, rot} der Komponente beim Winkel a, ohne sie zu ändern */
export function jointPlacement(c, a) {
  return decomposePlacement(matMul(jointDelta(c.joint, a), placementMatrix(c.pos, c.rot)));
}

/**
 * Gelenkwinkel setzen (im Bereich min … max); verschiebt c.pos/c.rot entsprechend.
 * followers (Komponenten aus jointFollowers) bekommen dieselbe Drehung, damit sie so liegen bleiben wie in der Vorschau.
 */
export function setJointAngle(c, a, followers = []) {
  const j = c.joint;
  const t = clampAngle(j, Number(a) || 0);
  const D = jointDelta(j, t);
  for (const f of followers) Object.assign(f, decomposePlacement(matMul(D, placementMatrix(f.pos, f.rot))));
  Object.assign(c, jointPlacement(c, t));
  j.angle = t;
  return t;
}

/** n + 1 Winkel gleichmäßig von min bis max (Bewegungsbereich prüfen) */
export function sweepAngles(j, n = 6) {
  return Array.from({ length: n + 1 }, (_, k) => j.min + ((j.max - j.min) * k) / n);
}

/** Winkel einer Hin-und-zurück-Bewegung zum Zeitpunkt t ∈ [0, 1]: min → max → min, weich beschleunigt */
export function swingAngle(j, t) {
  const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, Math.max(0, t)));
  return j.min + (j.max - j.min) * s;
}

/**
 * Explosionsdarstellung: jede Komponente rückt von der Mitte aller Komponenten weg.
 * items = [{ id, center: [x, y, z] }], factor ≥ 0 (0 = zusammengebaut, 1 = Abstände zur Mitte verdoppelt).
 * Rückgabe Map id → Verschiebung [dx, dy, dz]. Liegen alle Mitten auf einem Punkt, wird entlang der Reihenfolge verteilt.
 */
export function explodeOffsets(items, factor) {
  const out = new Map();
  if (!items.length) return out;
  const lo = [0, 1, 2].map((k) => Math.min(...items.map((it) => it.center[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...items.map((it) => it.center[k])));
  const C = lo.map((x, k) => (x + hi[k]) / 2);
  const spread = Math.hypot(...hi.map((x, k) => x - lo[k]));
  items.forEach((it, i) => {
    let d = v3.sub(it.center, C);
    if (spread < 1e-6) d = [0, 0, (i - (items.length - 1) / 2) * 100]; // alle gleich: übereinander auffächern
    out.set(it.id, d.map((x) => x * factor));
  });
  return out;
}

/**
 * Komponenten, die über Abhängigkeiten an der Gelenk-Komponente hängen und mitgehen (frei, ohne eigenes Gelenk);
 * fixierte Komponenten und solche mit Gelenk unterbrechen die Kette.
 */
export function jointFollowers(asm, compId) {
  const comps = new Map(asm.components.map((c) => [c.id, c]));
  const held = (id) => { const c = comps.get(id); return !c || c.fixed || !!c.joint; };
  const out = new Set(), todo = [compId];
  while (todo.length) {
    const id = todo.pop();
    for (const k of asm.constraints || []) {
      if (k.suppressed) continue;
      const other = k.a.comp === id ? k.b.comp : k.b.comp === id ? k.a.comp : null;
      if (!other || other === compId || out.has(other) || held(other)) continue;
      out.add(other);
      todo.push(other);
    }
  }
  return [...out];
}
