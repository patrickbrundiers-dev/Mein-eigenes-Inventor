// Darstellungen einer Baugruppe (Fusion-Abgleich FU8, FU9): benannte Positionsdarstellungen der Gelenke
// (z. B. »Tor offen 90°«) und Explosion in Schritten. Reine Rechnung; Anzeige in src/ui (viewer, props, drawing).
//
// asm.positions = [{ id, name, values: { compId: { angle, s? } } }] – Gelenkwerte je Komponente mit Gelenk
// asm.explosion = { steps: [{ id, name?, comps: [compId], dir: [x, y, z], dist }] } – Verschiebung je Schritt,
//                 Schritte addieren sich; Komponente einer Unterbaugruppe geht als Ganzes.

import { setJointAngle, setJointSlide, jointFollowers, isCylinder, clampAngle } from "./kinematik.js";
import { v3 } from "./geom.js";

const copy = (x) => JSON.parse(JSON.stringify(x));

/** Gelenkwerte aller Komponenten mit Gelenk (aktuelle Lage) */
export function capturePosition(asm) {
  const values = {};
  for (const c of asm.components || []) {
    if (!c.joint) continue;
    values[c.id] = { angle: Number(c.joint.angle) || 0, ...(isCylinder(c.joint) ? { s: Number(c.joint.s) || 0 } : {}) };
  }
  return values;
}

/** Komponenten mit Gelenk, deren Wert in der Darstellung abweicht */
export function positionDiff(asm, pos) {
  const out = [];
  for (const c of asm.components || []) {
    const v = pos?.values?.[c.id];
    if (!c.joint || !v) continue;
    const da = Math.abs(clampAngle(c.joint, Number(v.angle) || 0) - (Number(c.joint.angle) || 0));
    const ds = isCylinder(c.joint) ? Math.abs((Number(v.s) || 0) - (Number(c.joint.s) || 0)) : 0;
    if (da > 1e-9 || ds > 1e-9) out.push(c.id);
  }
  return out;
}

/**
 * Darstellung anwenden: Gelenke auf die gespeicherten Werte stellen (mit den daran hängenden Teilen).
 * Verändert asm; Komponenten ohne gespeicherten Wert bleiben. Gibt die Zahl der bewegten Gelenke zurück.
 */
export function applyPosition(asm, pos) {
  const byId = new Map((asm.components || []).map((c) => [c.id, c]));
  let n = 0;
  for (const id of positionDiff(asm, pos)) {
    const c = byId.get(id), v = pos.values[id];
    const followers = jointFollowers(asm, id).map((x) => byId.get(x)).filter(Boolean);
    if (isCylinder(c.joint) && Math.abs((Number(v.s) || 0) - (Number(c.joint.s) || 0)) > 1e-9) setJointSlide(c, Number(v.s) || 0, followers);
    setJointAngle(c, Number(v.angle) || 0, followers);
    n++;
  }
  return n;
}

/** Kopie der Baugruppe in der Darstellung posId (fehlt sie: unverändert) – für Zeichnung und Kollision */
export function positionedAssembly(asm, posId) {
  const pos = posId && (asm.positions || []).find((p) => p.id === posId);
  if (!pos) return asm;
  const out = copy(asm);
  applyPosition(out, pos);
  return out;
}

/** Neuer Name »Position n« ohne Doppelte */
export function nextPositionName(asm, base = "Position") {
  const names = new Set((asm.positions || []).map((p) => p.name));
  let n = (asm.positions || []).length + 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// ---------- Explosion in Schritten ----------

/** Gültiger Schritt? Richtung ≠ 0, Abstand endlich, mindestens eine Komponente */
export function validStep(s) {
  return !!s && Array.isArray(s.comps) && s.comps.length > 0 && Array.isArray(s.dir) && Math.hypot(...s.dir.map(Number)) > 1e-9 && Number.isFinite(Number(s.dist));
}

/**
 * Verschiebung je Komponente nach den ersten upto Schritten (Standard: alle), Map compId → [dx, dy, dz].
 * t ∈ [0, 1] gibt den Anteil des letzten Schritts (für die Wiedergabe).
 */
export function explosionOffsets(asm, upto = Infinity, t = 1) {
  const steps = (asm.explosion?.steps || []).filter(validStep);
  const n = Math.min(steps.length, upto);
  const out = new Map();
  steps.slice(0, n).forEach((s, i) => {
    const f = i === n - 1 ? Math.min(1, Math.max(0, t)) : 1;
    const d = v3.mul(v3.norm(s.dir.map(Number)), Number(s.dist) * f);
    for (const id of s.comps) out.set(id, v3.add(out.get(id) || [0, 0, 0], d));
  });
  return out;
}

/** Kopie der Baugruppe mit explodierten Lagen (Zeichnung, Positionsnummern) */
export function explodedAssembly(asm, upto = Infinity) {
  const offs = explosionOffsets(asm, upto);
  if (!offs.size) return asm;
  const out = copy(asm);
  for (const c of out.components || []) { const o = offs.get(c.id); if (o) c.pos = v3.add((c.pos || [0, 0, 0]).map(Number), o); }
  return out;
}

const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const AXIS_NAMES = ["X", "Y", "Z"];

/**
 * Explosion automatisch (»Ebenen automatisch«): je Komponente die Hauptrichtung von der Mitte weg (größter
 * Anteil auf X, Y oder Z; Bezug ist die Mitte der fixierten Teile), Abstand wächst mit der Lage in der Reihe. Komponenten mit gleicher Richtung bilden
 * einen Schritt; Reihenfolge Z+, Z−, X, Y (erst nach oben/unten, dann zur Seite). Fixierte Komponenten
 * (meist das Grundteil) bleiben stehen.
 * items = [{ id, center, size }] (size = Raumdiagonale, für den Abstand), gap = Grundabstand in mm.
 */
export function autoExplosion(asm, items, { gap = 50 } = {}) {
  const fixed = new Set((asm.components || []).filter((c) => c.fixed).map((c) => c.id));
  const moving = items.filter((it) => !fixed.has(it.id));
  if (!moving.length) return [];
  // Bezug: Mitte der fixierten Teile (das Grundteil bleibt, alles fliegt von ihm weg), sonst Mitte aller Teile
  const ref = items.filter((it) => fixed.has(it.id));
  let C;
  if (ref.length) C = [0, 1, 2].map((k) => ref.reduce((s, it) => s + it.center[k], 0) / ref.length);
  else {
    const lo = [0, 1, 2].map((k) => Math.min(...items.map((it) => it.center[k])));
    const hi = [0, 1, 2].map((k) => Math.max(...items.map((it) => it.center[k])));
    C = lo.map((x, k) => (x + hi[k]) / 2);
  }
  const groups = new Map();
  moving.forEach((it, i) => {
    const d = v3.sub(it.center, C);
    let k = [0, 1, 2].reduce((b, j) => (Math.abs(d[j]) > Math.abs(d[b]) ? j : b), 2);
    let sign = d[k] >= 0 ? 1 : -1;
    if (Math.hypot(...d) < 1e-6) { k = 2; sign = i % 2 ? -1 : 1; } // in der Mitte: nach oben bzw. unten
    const key = `${sign > 0 ? "+" : "-"}${AXIS_NAMES[k]}`;
    if (!groups.has(key)) groups.set(key, { k, sign, list: [] });
    groups.get(key).list.push({ ...it, along: Math.abs(d[k]) });
  });
  const order = ["+Z", "-Z", "+X", "-X", "+Y", "-Y"];
  const steps = [];
  for (const key of order) {
    const g = groups.get(key);
    if (!g) continue;
    // weiter außen liegende Teile zuerst und weiter weg: je Ring ein Schritt
    const sorted = g.list.sort((a, b) => b.along - a.along);
    sorted.forEach((it, ring) => {
      const dist = Math.round(gap + (it.size || 0) * 0.6 + ring * gap);
      steps.push({ id: `auto${steps.length + 1}`, name: `${key} ${it.name || it.id}`, comps: [it.id], dir: AXES[g.k].map((x) => x * g.sign + 0), dist });
    });
  }
  return steps;
}

/** Richtung als Text (»+Z«, »−X«, sonst gerundeter Vektor) */
export function dirLabel(d) {
  const n = v3.norm(d.map(Number));
  for (let k = 0; k < 3; k++) if (Math.abs(Math.abs(n[k]) - 1) < 1e-9) return (n[k] > 0 ? "+" : "−") + AXIS_NAMES[k];
  return n.map((x) => Math.round(x * 100) / 100).join(" / ");
}

/** Darstellung einer Zeichnungsansicht: view.state = { position?, explode? } → Schlüssel für die Projektion */
export function viewStateKey(v) {
  const s = v?.state || {};
  return `${s.position || ""}|${s.explode ? 1 : 0}`;
}

/** Baugruppe für eine Zeichnungsansicht: erst Position, dann Explosion */
export function assemblyForView(asm, v) {
  const s = v?.state || {};
  let a = positionedAssembly(asm, s.position);
  if (s.explode) a = explodedAssembly(a);
  return a;
}
