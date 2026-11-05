// Kinematik in Baugruppen (MegaCAD-Abgleich M23, Schiebegelenk E8): Dreh- oder Schiebegelenk an einer Komponente,
// Bewegung im Bereich, Explosionsdarstellung. Reine Rechnung; Anzeige und Animation in src/ui (viewer.js, props.js).
//
// Gelenk an der Komponente: c.joint = { kind?, p, d, angle, min, max } – Achse durch Punkt p mit Richtung d in
// Baugruppen-Koordinaten, angle = aktueller Wert: beim Drehgelenk (kind fehlt oder "dreh") Winkel in °, beim
// Schiebegelenk (kind "schiebe") Weg in mm entlang d. c.pos/c.rot sind immer die Lage beim aktuellen Winkel,
// damit Stückliste, Zeichnung, Export und Kollision unverändert damit rechnen. Eine Komponente mit Gelenk
// wird von Abhängigkeiten nicht verschoben (wie fixiert); sie bewegt sich nur über den Gelenkwinkel.

import { evaluate as exprEvaluate } from "./expr.js";
import { placementMatrix, rotationAbout, matMul, decomposePlacement, matApply, matApplyDir, v3 } from "./geom.js";

/** Mitgehende Komponente um D bewegen; hat sie ein eigenes Gelenk (Kette), wandert dessen Achse mit */
export function moveFollower(f, D) {
  Object.assign(f, decomposePlacement(matMul(D, placementMatrix(f.pos, f.rot))));
  if (f.joint) { f.joint.p = matApply(D, f.joint.p); f.joint.d = v3.norm(matApplyDir(D, f.joint.d)); }
}

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
  Object.assign(c, decomposePlacement(matMul(D, placementMatrix(c.pos, c.rot))));
  for (const f of followers) moveFollower(f, D);
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
  for (const f of followers) moveFollower(f, D);
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
  // Kette (SolidCraft-Abgleich L10): Gelenk mit joint.parent hängt an dieser Komponente und geht samt Achse mit;
  // die eigenen Vorfahren bleiben stehen.
  const ancestors = new Set();
  for (let p = comps.get(compId)?.joint?.parent; p && !ancestors.has(p); p = comps.get(p)?.joint?.parent) ancestors.add(p);
  const out = new Set(), todo = [compId];
  const held = (id, from) => { const c = comps.get(id); return !c || c.fixed || ancestors.has(id) || (!!c.joint && c.joint.parent !== from); };
  const add = (id) => { out.add(id); todo.push(id); };
  while (todo.length) {
    const id = todo.pop();
    for (const k of asm.constraints || []) {
      if (k.suppressed) continue;
      const other = k.a.comp === id ? k.b.comp : k.b.comp === id ? k.a.comp : null;
      if (!other || other === compId || out.has(other) || held(other, id)) continue;
      add(other);
    }
    for (const c of asm.components) if (c.joint?.parent === id && c.id !== compId && !out.has(c.id) && !c.fixed && !ancestors.has(c.id)) add(c.id);
  }
  return [...out];
}

/** Kann parentId Elternteil des Gelenks an compId sein (kein Kreis)? */
export function canChainTo(asm, compId, parentId) {
  if (!parentId || parentId === compId) return !parentId;
  const comps = new Map(asm.components.map((c) => [c.id, c]));
  const seen = new Set();
  for (let p = parentId; p; p = comps.get(p)?.joint?.parent) { if (p === compId || seen.has(p)) return false; seen.add(p); }
  return comps.has(parentId);
}

/**
 * Ziehen am Gelenk (L10): Gelenkwert aus der Mausbewegung. p0 = Griffpunkt, p = Punkt unter der Maus (beide in der
 * Ebene senkrecht zur Achse durch p0 bzw. in der Blickebene), a0 = Wert beim Greifen. Schiebegelenk: Weg = Projektion
 * auf die Richtung; sonst Drehwinkel um die Achse. Rückgabe { value, raw, atLimit } (value im Bereich).
 */
export function dragJointValue(j, p0, p, a0 = j.angle || 0, { slide = isSlide(j) } = {}) {
  const d = v3.norm(j.d);
  let raw;
  if (slide) raw = a0 + v3.dot(v3.sub(p, p0), d);
  else {
    const flat = (q) => { const r = v3.sub(q, j.p); return v3.sub(r, v3.mul(d, v3.dot(r, d))); };
    const r0 = flat(p0), r1 = flat(p);
    if (v3.len(r0) < 1e-9 || v3.len(r1) < 1e-9) raw = a0;
    else raw = a0 + (Math.atan2(v3.dot(v3.cross(r0, r1), d), v3.dot(r0, r1)) * 180) / Math.PI;
  }
  if (slide && isCylinder(j)) { const v = clampSlide(j, raw); return { value: v, raw, atLimit: Math.abs(v - raw) > 1e-9 }; }
  const value = clampAngle(j, raw);
  return { value, raw, atLimit: Math.abs(value - raw) > 1e-9 };
}

// ---------- Bewegungs-Abhängigkeiten (Werkzeuge Stufe 44, wie Inventor »Bewegung«) ----------
// asm.motions = [{ id, kind, a, b, ratio, sense, suppressed? }] zwischen zwei Komponenten mit Gelenk:
//   drehung:        beide drehen (Dreh- oder Zylindergelenk), Δb = ratio · Δa (Zahnrad, Riemen; Übersetzung)
//   drehschiebung:  a dreht, b schiebt (Schiebegelenk), Δb = Δa / 360 · ratio (ratio = Weg je Umdrehung in mm; Zahnstange, Spindel)
// sense "gegen" kehrt die Richtung um. Bewegt man eine Komponente, folgen alle gekoppelten (Kette, ohne Rückwirkung).
export const MOTION_KINDS = Object.freeze([["drehung", "Drehung"], ["drehschiebung", "Drehung – Verschiebung"], ["zahnrad", "Zahnrad"], ["zahnstange", "Zahnstange"], ["schraube", "Schraube"], ["nocken", "Nocken"], ["linear", "Verknüpfung"]]);
// SolidCraft-Abgleich E3: Zahnrad (z1/z2, gegensinnig), Zahnstange und Ritzel (π·m·z je Umdrehung), Schraube (Steigung),
// Nocken (Hub s = h(w) als Formel des Antriebswinkels w in °) und Bewegungsverknüpfung (beliebige Gelenke, Δb = k · Δa).
const num = (x) => Number(String(x ?? "").replace(",", "."));
/** Vorgabewerte je Bewegungsart (für neue Bewegungen und beim Umschalten der Art) */
export const MOTION_DEFAULTS = Object.freeze({
  drehung: { ratio: "1", sense: "gleich" }, drehschiebung: { ratio: "5", sense: "gleich" },
  zahnrad: { z1: "20", z2: "40", sense: "gegen" }, zahnstange: { modul: "2", z: "20", sense: "gleich" },
  schraube: { steigung: "1.5", sense: "gleich" }, nocken: { kurve: "10*(1-cos(w))/2", offset: "0" }, linear: { ratio: "1", sense: "gleich" },
});
/** Grundart und Faktor einer Bewegung: drehung (Δb = f·Δa), drehschiebung (Δs = f·Δa), linear, nocken (f = null) */
export function motionLaw(m) {
  switch (m.kind) {
    case "zahnrad": return { base: "drehung", f: num(m.z1) / num(m.z2) };
    case "zahnstange": return { base: "drehschiebung", f: (Math.PI * num(m.modul) * num(m.z)) / 360 };
    case "schraube": return { base: "drehschiebung", f: num(m.steigung) / 360 };
    case "drehschiebung": return { base: "drehschiebung", f: num(m.ratio) / 360 };
    case "linear": return { base: "linear", f: num(m.ratio) };
    case "nocken": return { base: "nocken", f: null };
    default: return { base: "drehung", f: num(m.ratio) };
  }
}
/** Nockenhub s(w) aus der Formel (w = Antriebswinkel in °); evaluate wird übergeben, damit der Kern ohne Ausdrücke auskommt */
export function camLift(m, w, evaluate = exprEvaluate) {
  const s = evaluate(String(m.kurve || "0"), { w });
  if (!Number.isFinite(s)) throw new Error("Nockenkurve ergibt keine Zahl");
  return s + (num(m.offset) || 0);
}
const turns = (j) => !!j && !isSlide(j);

/** Passt die Bewegung zu den Gelenken der beiden Komponenten? Rückgabe Fehlertext oder null */
export function motionProblem(asm, m) {
  const A = asm.components.find((c) => c.id === m.a), B = asm.components.find((c) => c.id === m.b);
  if (!A || !B) return "Komponente fehlt";
  if (A.id === B.id) return "Zwei verschiedene Komponenten wählen";
  const law = motionLaw(m);
  if (law.base === "nocken") {
    if (!turns(A.joint)) return `»${A.name}« braucht ein Dreh- oder Zylindergelenk`;
    if (!isSlide(B.joint)) return `»${B.name}« braucht ein Schiebegelenk`;
    if (!String(m.kurve || "").trim()) return "Nockenkurve s(w) angeben";
    return null;
  }
  if (!Number.isFinite(law.f) || law.f === 0) return m.kind === "zahnrad" ? "Zähnezahlen angeben" : m.kind === "zahnstange" ? "Modul und Zähnezahl angeben" : m.kind === "schraube" ? "Steigung angeben" : "Übersetzung bzw. Weg je Umdrehung angeben";
  if (law.base === "linear") { if (!A.joint || !B.joint) return "Beide Komponenten brauchen ein Gelenk"; return null; }
  if (law.base === "drehschiebung") {
    if (!turns(A.joint)) return `»${A.name}« braucht ein Dreh- oder Zylindergelenk`;
    if (!isSlide(B.joint)) return `»${B.name}« braucht ein Schiebegelenk`;
  } else if (!turns(A.joint) || !turns(B.joint)) return "Beide Komponenten brauchen ein Dreh- oder Zylindergelenk";
  return null;
}

/**
 * Gelenkwert einer Komponente setzen und die Werte aller gekoppelten Gelenke ausrechnen (ohne etwas zu ändern).
 * Rückgabe { values: Map compId → Wert (im Bereich), clamped: [Namen, die an ihre Grenze stoßen] }
 */
export function coupledJointValues(asm, compId, value, evaluate = exprEvaluate) {
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
      const law = motionLaw(m);
      let want;
      if (law.base === "nocken") {
        // Nocken treibt nur vorwärts (Hub folgt dem Winkel), rückwärts lässt er sich nicht umkehren
        if (!fwd || !evaluate) continue;
        try { want = camLift(m, values.get(x), evaluate); } catch { continue; }
      } else {
        const f = law.f * (m.sense === "gegen" ? -1 : 1);
        want = (Y.joint.angle || 0) + (fwd ? dx * f : dx / f);
      }
      const got = clampAngle(Y.joint, want);
      if (Math.abs(got - want) > 1e-9) clamped.push(Y.name || Y.id);
      values.set(other, got);
      todo.push(other);
    }
  }
  return { values, clamped };
}
