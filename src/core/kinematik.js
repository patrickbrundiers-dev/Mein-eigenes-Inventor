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

/**
 * Kontaktsatz (Werkzeuge Stufe 51): freier Bereich eines Gelenks ab dem aktuellen Wert, bis sich Teile des
 * Kontaktsatzes durchdringen. collides(a) → Promise<boolean>. Je Richtung grob in steps Schritten, dann durch
 * Halbieren genauer. Rückgabe { min, max, hitMin, hitMax } (hit = an dieser Seite angestoßen).
 */
export async function contactRange(j, collides, { steps = 12, refine = 7 } = {}) {
  const a0 = clampAngle(j, j.angle || 0);
  const side = async (end) => {
    if (Math.abs(end - a0) < 1e-9) return { at: end, hit: false };
    let free = a0;
    for (let k = 1; k <= steps; k++) {
      const a = a0 + ((end - a0) * k) / steps;
      if (await collides(a)) {
        let lo = free, hi = a;
        for (let r = 0; r < refine; r++) { const m = (lo + hi) / 2; if (await collides(m)) hi = m; else lo = m; }
        return { at: lo, hit: true };
      }
      free = a;
    }
    return { at: end, hit: false };
  };
  const lo = await side(Math.min(j.min, j.max)), hi = await side(Math.max(j.min, j.max));
  return { min: lo.at, max: hi.at, hitMin: lo.hit, hitMax: hi.hit };
}

/** Video-Format der Bewegungsaufnahme: MP4, wenn der Rekorder es kann, sonst WebM */
export function videoFormat(isSupported) {
  for (const type of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) if (isSupported(type)) return { type, ext: type.startsWith("video/mp4") ? "mp4" : "webm" };
  return null;
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

// ---------- Bewegungs-Abhängigkeiten (Werkzeuge Stufe 44, wie Inventor »Bewegung«) ----------
// asm.motions = [{ id, kind, a, b, ratio, sense, suppressed? }] zwischen zwei Komponenten mit Gelenk:
//   drehung:        beide drehen (Dreh- oder Zylindergelenk), Δb = ratio · Δa (Zahnrad, Riemen; Übersetzung)
//   drehschiebung:  a dreht, b schiebt (Schiebegelenk), Δb = Δa / 360 · ratio (ratio = Weg je Umdrehung in mm; Zahnstange, Spindel)
// sense "gegen" kehrt die Richtung um. Bewegt man eine Komponente, folgen alle gekoppelten (Kette, ohne Rückwirkung).
export const MOTION_KINDS = Object.freeze([["drehung", "Drehung"], ["drehschiebung", "Drehung – Verschiebung"]]);
const turns = (j) => !!j && !isSlide(j);

/** Passt die Bewegung zu den Gelenken der beiden Komponenten? Rückgabe Fehlertext oder null */
export function motionProblem(asm, m) {
  const A = asm.components.find((c) => c.id === m.a), B = asm.components.find((c) => c.id === m.b);
  if (!A || !B) return "Komponente fehlt";
  if (A.id === B.id) return "Zwei verschiedene Komponenten wählen";
  if (!(Number(m.ratio) > 0 || Number(m.ratio) < 0)) return "Übersetzung bzw. Weg je Umdrehung angeben";
  if (m.kind === "drehschiebung") {
    if (!turns(A.joint)) return `»${A.name}« braucht ein Dreh- oder Zylindergelenk`;
    if (!isSlide(B.joint)) return `»${B.name}« braucht ein Schiebegelenk`;
  } else if (!turns(A.joint) || !turns(B.joint)) return "Beide Komponenten brauchen ein Dreh- oder Zylindergelenk";
  return null;
}

/**
 * Gelenkwert einer Komponente setzen und die Werte aller gekoppelten Gelenke ausrechnen (ohne etwas zu ändern).
 * Rückgabe { values: Map compId → Wert (im Bereich), clamped: [Namen, die an ihre Grenze stoßen] }
 */
export function coupledJointValues(asm, compId, value) {
  const comps = new Map(asm.components.map((c) => [c.id, c]));
  const start = comps.get(compId);
  const values = new Map([[compId, clampAngle(start.joint, value)]]);
  const clamped = [];
  const todo = [compId];
  while (todo.length) {
    const x = todo.shift();
    const X = comps.get(x), dx = values.get(x) - (X.joint.angle || 0);
    for (const m of asm.motions || []) {
      if (m.suppressed || motionProblem(asm, m)) continue;
      const fwd = m.a === x, other = fwd ? m.b : m.b === x ? m.a : null;
      if (!other || values.has(other)) continue;
      const Y = comps.get(other);
      const f = (m.kind === "drehschiebung" ? Number(m.ratio) / 360 : Number(m.ratio)) * (m.sense === "gegen" ? -1 : 1);
      const dy = fwd ? dx * f : dx / f;
      const want = (Y.joint.angle || 0) + dy, got = clampAngle(Y.joint, want);
      if (Math.abs(got - want) > 1e-9) clamped.push(Y.name || Y.id);
      values.set(other, got);
      todo.push(other);
    }
  }
  return { values, clamped };
}
