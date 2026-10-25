// Rahmen-Werkzeuge (Inventor Gestell-Generator): Endkappe, Kürzen/Verlängern an einer Ebene, Gleichteile.
// Reine Rechnung an der Stabachse (meta.axis: origin, z, u, v, lo, hi); die Geometrie baut der Kernel.
import { v3 } from "./geom.js";

export const CAP_MODES = Object.freeze([["aufgesetzt", "Aufgesetzt (Platte auf dem Ende)"], ["eingesetzt", "Eingesetzt (Stopfen im Rohr)"]]);

/** Endkappe prüfen → { t, ov, ends: ["A"|"B"] } */
export function capPlan({ thickness, overhang = 0, end = "beide", mode = "aufgesetzt" }, hollow) {
  if (!(thickness > 0)) throw new Error("Dicke muss > 0 sein");
  if (mode === "eingesetzt" && !hollow) throw new Error("Eingesetzte Kappe nur bei Hohlprofilen (Rohr, Rechteckrohr)");
  if (mode === "eingesetzt" && overhang > 0) throw new Error("Eingesetzt: Spiel als Wert ≥ 0 angeben, kein Überstand");
  return { t: thickness, ov: overhang, ends: end === "beide" ? ["A", "B"] : [end === "B" ? "B" : "A"] };
}

/**
 * Stabende an Ebene (Punkt p, Normale n) kürzen oder verlängern. ax: Stabachse; end "A", "B" oder "auto" (näheres Ende).
 * Rückgabe { end, at (Lage des Schnittpunkts auf der Achse ab origin), delta (+ = länger), sign (Richtung nach außen) }
 */
export function trimPlan(ax, p, n, end = "auto") {
  const z = v3.norm(ax.z), nn = v3.norm(n);
  const den = v3.dot(nn, z);
  if (Math.abs(den) < 0.05) throw new Error("Ebene liegt (fast) parallel zum Stab");
  const at = v3.dot(nn, v3.sub(p, ax.origin)) / den;
  let e = end;
  if (e === "auto") e = Math.abs(at - ax.lo) <= Math.abs(at - ax.hi) ? "A" : "B";
  const delta = e === "B" ? at - ax.hi : ax.lo - at;
  if (e === "B" ? at <= ax.lo + 1 : at >= ax.hi - 1) throw new Error("Ebene liegt hinter dem anderen Stabende");
  return { end: e, at, delta, sign: e === "B" ? 1 : -1 };
}

/**
 * Gleichteile: Stäbe mit gleichem Profil, gleicher Länge (0,1 mm), gleichen Enden und Ausklinkungen, gleichem Werkstoff.
 * bodies: Körper eines Bauteils (kind "member" mit meta). Rückgabe [{ key, profileId, length, names: [], count }], Gruppen ab 2 Stück zuerst.
 */
export function equalParts(bodies, material = "") {
  const map = new Map();
  for (const b of bodies || []) {
    if (b.kind !== "member" || !b.meta) continue;
    const m = b.meta;
    const L = Math.round((m.length || 0) * 10) / 10;
    const ends = [m.miterStart || 0, m.miterEnd || 0].map((x) => Math.round(x * 10) / 10).sort((a, c) => a - c).join("/");
    const key = [m.profileId || m.section, L, ends, m.coped ? "A" : "", m.cutSig || "", m.drills || "", material].join("|");
    const g = map.get(key) || { key, profileId: m.profileId || m.section, length: L, names: [], count: 0 };
    g.names.push(b.name);
    g.count++;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.profileId.localeCompare(b.profileId) || b.length - a.length);
}
