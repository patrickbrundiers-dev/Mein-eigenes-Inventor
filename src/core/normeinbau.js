// Normteile an einer Bohrung einbauen (Baugruppe und Bauteil): Einbauachse aus der gepickten Zylinderfläche und ihrer
// Stirnfläche, Klemmlänge bis zur Gegenseite, Lage jedes Teils (Schraube, Scheiben, Mutter) und die Bezüge für die
// Abhängigkeit »Einfügen«. Reine Rechnung ohne Oberfläche und Geometrie-Kern.
import { v3, decomposePlacement, placementMatrix, matApply, matApplyDir } from "./geom.js";
import { NORM_FAMILIES, familyOf, sizeDims, sizeForHole, garniturAt, lengthsFor } from "./normlib.js";

/**
 * Bohrung im System eines Bauteils: info = Zylinderfläche { axisP, axisD, radius }, end = Stirnfläche { normal, point }
 * (Normale zeigt aus dem Material), faces = ebene Flächen des Bauteils. Rückgabe { P, a, n, dia, depth }:
 * P Achspunkt in der Stirnfläche, a Einbaurichtung (ins Material), depth Abstand bis zur nächsten Gegenfläche (oder null).
 */
export function holeFrame(info, end, faces = []) {
  const d = v3.norm(info.axisD), n = v3.norm(end.normal);
  const P = v3.add(info.axisP, v3.mul(d, v3.dot(v3.sub(end.point, info.axisP), d)));
  const a = v3.mul(n, -1);
  let depth = null;
  for (const f of faces) {
    if (f.type !== "PLANE" || !f.normal || !f.point) continue;
    if (v3.dot(v3.norm(f.normal), a) < 1 - 1e-6) continue; // Gegenseite: Normale zeigt in Einbaurichtung
    const t = v3.dot(v3.sub(f.point, P), a);
    if (t > 1e-6 && (depth === null || t < depth)) depth = t;
  }
  return { P, a, n, dia: 2 * info.radius, depth: depth === null ? null : Math.round(depth * 1e6) / 1e6 };
}

/** Lage (pos, rot) eines Teils, dessen +z auf dir zeigt, Ursprung in o (Weltsystem) */
export function placeAlong(o, dir) {
  const z = v3.norm(dir);
  const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const x = v3.norm(v3.cross(ref, z)), y = v3.cross(z, x);
  const m = [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
  return decomposePlacement(m);
}

/** Bohrung (im Bauteil-System der Komponente) ins Weltsystem */
export function holeToWorld(comp, hf) {
  const M = placementMatrix(comp.pos, comp.rot);
  return { ...hf, P: matApply(M, hf.P), a: v3.norm(matApplyDir(M, hf.a)), n: v3.norm(matApplyDir(M, hf.n)) };
}

/**
 * Teile für den Einbau an einer Bohrung. sel = { kind, size, length, grade, galv, custom?, garnitur, auto, clamp? }.
 * auto: Größe aus dem Bohrungs-Ø; garnitur: Schraube mit Scheiben und Mutter (bei Gewindebohrung nur Kopfscheibe).
 * Rückgabe { size, threaded, clamp, parts: [{ kind, size, length?, grade, galv, at, flip }], warn[] }
 */
export function holeParts(sel, hf) {
  const fam = familyOf(sel.kind, sel.custom);
  if (!fam) throw new Error("Unbekanntes Normteil: " + sel.kind);
  const warn = [];
  let size = sel.size, threaded = false;
  const fit = sizeForHole(fam, hf.dia);
  if (sel.auto) {
    if (!fit) throw new Error(`Für Ø ${fmt(hf.dia)} mm gibt es keine passende Größe in ${fam.norm}`);
    size = fit.size; threaded = fit.threaded;
  } else if (fit?.size === size) threaded = fit.threaded;
  else if (fam.hole === "clearance" && sizeDims(fam, size)?.d > hf.dia + 1e-6) warn.push(`${size} passt nicht durch Ø ${fmt(hf.dia)} mm`);
  const clamp = Number(sel.clamp) > 0 ? Number(sel.clamp) : hf.depth;
  const galv = !!sel.galv;
  if (sel.garnitur && fam.garnitur && !threaded) {
    if (!(clamp > 0)) throw new Error("Klemmlänge unbekannt – bitte eingeben");
    const g = garniturAt(fam, size, clamp, sel.grade);
    return { size, threaded, clamp, length: g.length, parts: g.parts.map((p) => ({ ...p, galv, custom: p.kind === fam.id ? sel.custom : undefined })), warn };
  }
  // einzelnes Teil, bei Gewindebohrung mit Scheibe unter dem Kopf und Länge für 1,5 · d Einschraubtiefe
  let length = sel.length;
  const parts = [];
  if (fam.length && (sel.auto || threaded)) {
    const t = sizeDims(fam, size);
    const head = sel.garnitur && threaded && fam.garnitur?.washerHead ? sizeDims(NORM_FAMILIES[fam.garnitur.washerHead], size)?.h || 0 : 0;
    const need = threaded ? head + 1.5 * t.d : fam.seat === "in" && fam.hole === "clearance" && clamp > 0 ? clamp : null;
    const list = lengthsFor(fam, size);
    if (need != null && list.length) length = list.find((l) => l >= need - 1e-9) ?? list.at(-1);
    else if (!lengthsFor(fam, size).includes(Number(length))) length = list[Math.floor(list.length / 2)] ?? length;
    if (threaded && head) {
      parts.push({ kind: fam.garnitur.washerHead, size, grade: "200 HV", galv, at: 0, flip: true });
      parts.push({ kind: fam.id, size, length, grade: sel.grade, galv, at: -head, flip: false, custom: sel.custom });
      return { size, threaded, clamp, length, parts, warn };
    }
  }
  const flip = fam.seat === "out";
  parts.push({ kind: fam.id, size, length, grade: sel.grade, galv, at: 0, flip, custom: sel.custom });
  return { size, threaded, clamp, length, parts, warn };
}

/** Lage eines Teils aus holeParts an der Bohrung (Weltsystem) */
export function partPlacement(hw, part) {
  const dir = part.flip ? hw.n : hw.a;
  return placeAlong(v3.add(hw.P, v3.mul(hw.a, part.at)), dir);
}

/**
 * Bezug »Einfügen« am Normteil (Teil-System): Achse z und die Auflagefläche. Kopfschrauben liegen mit der
 * Kopfunterseite (z = 0, Normale +z) auf, Senkköpfe bündig mit der Oberseite (Normale −z), Muttern und Scheiben mit
 * der Unterseite (Normale −z); top = Oberseite einer Scheibe (z = h, Normale +z) als Gegenfläche für das nächste Teil.
 */
export function normInsertInfo(fam, size, { top = false } = {}) {
  const t = sizeDims(fam, size) || {};
  const r = (t.core ?? t.d ?? t.d1 ?? 1) / 2;
  const axis = { axisP: [0, 0, 0], axisD: [0, 0, 1], radius: fam.template === "scheibe" ? (t.d1 ?? t.d) / 2 : fam.template === "mutter" ? t.d / 2 : r };
  if (top) return { axis, plane: { normal: [0, 0, 1], point: [0, 0, fam.template === "mutter" ? t.m : t.h] } };
  if (fam.seat === "flush") return { axis, plane: { normal: [0, 0, -1], point: [0, 0, 0] }, solution: "ausgerichtet" };
  if (fam.seat === "in") return { axis, plane: { normal: [0, 0, 1], point: [0, 0, 0] }, solution: "entgegengesetzt" };
  return { axis, plane: { normal: [0, 0, -1], point: [0, 0, 0] }, solution: "entgegengesetzt" };
}
/** Hat das Teil eine Zylinderachse für »Einfügen«? (Kegelstift, Spannschloss nicht) */
export const insertable = (fam) => !["iso2339", "spannschloss"].includes(fam.id) && fam.seat !== "center";

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
