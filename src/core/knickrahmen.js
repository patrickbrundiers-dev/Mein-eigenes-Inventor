// Knickrahmen: ein Rechteckrohr, an jedem Knick V-förmig ausgeklinkt (drei Wände) und um die
// stehen gebliebene Außenwand gefaltet. Rein rechnerisch (ohne Geometrie-Kern) – testbar in Node.
//
// Konventionen (siehe docs/knickrahmen/stufe1-plan.md):
// - Segmentlänge = Abstand der Knotenpunkte auf der Mittellinie (Systemlinie)
// - Knickwinkel θ = Richtungsänderung; 0° = gerade, + = nach links (gegen Uhrzeigersinn um die
//   Ebenennormale), − = nach rechts. Innenwinkel = 180° − |θ|
// - Außenwand liegt auf der konvexen Seite des Knicks und wird mit Innenradius ri gebogen
// - Abwicklung: gerade Abschnitte bis zu den Tangentenpunkten der Biegung + Biegezone der Länge
//   (ri + k·t)·θ (neutrale Faser, K-Faktor k) je Knick

import { sectionGeometry } from "./sections.js";
import { planeFrame, toWorld, v3 } from "./geom.js";

export const KNICK_LIMITS = { maxSegments: 3, minAngle: 0.5, maxAngle: 160 };
export const KNICK_SECTIONS = ["rechteck", "vierkant"];

const DEG = Math.PI / 180;
const fmt = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");

/** Vorgabe-Feature für »Knickrahmen erstellen« */
export function defaultKnickrahmen(dims) {
  return {
    type: "knickrahmen", version: 1,
    section: "rechteck", dims,
    plane: "XY", offset: "0", start: ["0", "0"], direction: "0",
    orientation: "hochkant",
    bendRadius: "3", kFactor: "0.33",
    segments: [{ length: "800" }, { length: "600" }],
    bends: [{ angle: "30", min: "", max: "" }],
    view: "gefaltet",
  };
}

/**
 * Knickrahmen aus Zahlenwerten planen.
 * input: {section, dims{B,H,t,r}, plane, offset, start[u,v], direction°, orientation, bendRadius, kFactor, segments[L], bends[{angle, min, max}]}
 * min/max: Zahl oder null. Rückgabe {issues[{code, ref, message}], …Geometriedaten wenn ohne Fehler}
 */
export function planKnickrahmen(input) {
  const issues = [];
  const err = (code, ref, message) => issues.push({ code, ref, message });
  const segs = input.segments || [];
  const bends = input.bends || [];

  if (!KNICK_SECTIONS.includes(input.section)) err("SECTION_KIND", "section", "Knickrahmen: nur Rechteck- oder Quadratrohr möglich");
  let g = null;
  try { g = sectionGeometry(input.section, input.dims); } catch (e) { err("SECTION", "section", e.message); }
  if (segs.length < 1 || segs.length > KNICK_LIMITS.maxSegments) err("SEG_COUNT", "segments", `Knickrahmen: 1 bis ${KNICK_LIMITS.maxSegments} Segmente`);
  if (bends.length !== Math.max(0, segs.length - 1)) err("SEG_COUNT", "bends", "Anzahl der Knicke muss Segmente − 1 sein");
  segs.forEach((L, i) => { if (!(L > 0)) err("SEG_LENGTH", `segment:${i}`, `Segment ${i + 1}: Länge muss > 0 sein`); });
  bends.forEach((b, j) => {
    const a = Math.abs(b.angle);
    if (!Number.isFinite(b.angle) || a < KNICK_LIMITS.minAngle || a > KNICK_LIMITS.maxAngle)
      err("ANGLE_RANGE", `bend:${j}`, `Knick ${j + 1}: Winkel ${fmt(b.angle)}° außerhalb ${fmt(KNICK_LIMITS.minAngle)}–${KNICK_LIMITS.maxAngle}° (Betrag)`);
    const lo = b.min ?? null, hi = b.max ?? null;
    if (lo !== null && hi !== null && lo > hi) err("ANGLE_LIMIT", `bend:${j}`, `Knick ${j + 1}: Minimum ${fmt(lo)}° größer als Maximum ${fmt(hi)}°`);
    else if (lo !== null && b.angle < lo) err("ANGLE_LIMIT", `bend:${j}`, `Knick ${j + 1}: ${fmt(b.angle)}° unter Minimum ${fmt(lo)}°`);
    else if (hi !== null && b.angle > hi) err("ANGLE_LIMIT", `bend:${j}`, `Knick ${j + 1}: ${fmt(b.angle)}° über Maximum ${fmt(hi)}°`);
  });
  const ri = input.bendRadius, k = input.kFactor;
  if (bends.length && !(ri >= 0)) err("BEND_RADIUS", "bendRadius", "Innenradius der Biegung muss ≥ 0 sein");
  if (bends.length && !(k >= 0 && k <= 1)) err("K_FACTOR", "kFactor", "K-Faktor muss zwischen 0 und 1 liegen");
  if (issues.length) return { issues };

  const W = input.orientation === "flach" ? g.height : g.width; // Breite in der Knickebene
  const Hp = input.orientation === "flach" ? g.width : g.height; // Höhe senkrecht zur Ebene
  const t = input.dims.t;
  const tanHalf = bends.map((b) => Math.tan((Math.abs(b.angle) * DEG) / 2));

  const uA = W / 2 - t; // Innenseite der Außenwand, gemessen von der Mittellinie
  const d = uA - (ri || 0); // Abstand Biegemittelpunkt ↔ Mittellinie (zur Außenwand hin positiv)
  // Segment zu kurz: gerade Wandreste bis zur Ausklinkung müssen an Innen- und Außenseite > 0 bleiben
  segs.forEach((L, i) => {
    const tt = (i > 0 ? tanHalf[i - 1] : 0) + (i < bends.length ? tanHalf[i] : 0);
    const need = tt * Math.max(W / 2, -d);
    if (need > 0 && L - need <= 1e-6) err("SEG_SHORT", `segment:${i}`, `Segment ${i + 1} zu kurz für die Ausklinkung (mehr als ${fmt(need)} mm nötig)`);
  });
  if (issues.length) return { issues };

  // Mittellinie in der Ebene
  const frame = planeFrame({ ref: input.plane || "XY" }, input.offset || 0);
  const pts2 = [[input.start?.[0] || 0, input.start?.[1] || 0]];
  const dirs2 = [];
  let phi = (input.direction || 0) * DEG;
  segs.forEach((L, i) => {
    if (i > 0) phi += bends[i - 1].angle * DEG;
    const dd = [Math.cos(phi), Math.sin(phi)];
    dirs2.push(dd);
    const p = pts2[i];
    pts2.push([p[0] + dd[0] * L, p[1] + dd[1] * L]);
  });
  const nodes = pts2.map((p) => toWorld(frame, p[0], p[1]));
  const dirs = dirs2.map((dd) => v3.norm(v3.add(v3.mul(frame.xDir, dd[0]), v3.mul(frame.yDir, dd[1]))));

  // Abwicklung entlang der geraden Rohrachse: Tangentenpunkt → Biegezone (neutrale Faser) → Tangentenpunkt
  const knicks = [];
  let x = 0;
  segs.forEach((L, i) => {
    if (i === 0) x += L + d * (tanHalf[0] ?? 0);
    if (i < bends.length) {
      const b = bends[i];
      const theta = Math.abs(b.angle) * DEG;
      const zone = (ri + k * t) * theta; // Biegezugabe (Länge der neutralen Faser in der Biegezone)
      // σ: Seite der Außenwand in Profil-u-Richtung (u zeigt nach links); Linksknick → Außenwand rechts
      knicks.push({ index: i, angle: b.angle, sigma: b.angle > 0 ? -1 : 1, x1: x, x2: x + zone, zone, tanHalf: tanHalf[i] });
      x += zone + segs[i + 1] + d * tanHalf[i] + (i + 1 < bends.length ? d * tanHalf[i + 1] : 0);
    }
  });
  const flatLength = x;

  return { issues, frame, nodes, dirs, W, H: Hp, t, uA, d, ri: ri || 0, k: k ?? 0, knicks, flatLength, area: g.area, geom: g };
}

/** Feature-Ausdrücke auswerten (E = (ausdruck, bezeichnung) => Zahl) */
export function knickInput(f, E) {
  const dims = {};
  for (const [k, v] of Object.entries(f.dims || {})) dims[k] = E(v, k);
  const opt = (v, label) => (v === undefined || v === null || String(v).trim() === "" ? null : E(v, label));
  return {
    section: f.section, dims, plane: f.plane || "XY", offset: E(f.offset || "0", "Ebenen-Abstand"),
    start: (f.start || ["0", "0"]).map((v, k) => E(v, "Startpunkt " + "UV"[k])),
    direction: E(f.direction || "0", "Startrichtung"), orientation: f.orientation || "hochkant",
    bendRadius: E(f.bendRadius ?? "0", "Innenradius Biegung"), kFactor: E(f.kFactor ?? "0.5", "K-Faktor"),
    segments: (f.segments || []).map((s, i) => E(s.length, `Segment ${i + 1} Länge`)),
    bends: (f.bends || []).map((b, j) => ({
      angle: E(b.angle, `Knick ${j + 1} Winkel`),
      min: opt(b.min, `Knick ${j + 1} Minimum`), max: opt(b.max, `Knick ${j + 1} Maximum`),
    })),
  };
}
