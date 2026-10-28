// Handlaufhalter für Geländer (Geländer, Treppe, Balkon): Pfosten endet unter dem Handlauf, auf hohlen Pfosten eine
// geschweißte Endkappe, darauf ein Rundstahl-Stift bis in die Handlaufachse; im Handlauf an dieser Stelle eine
// Bohrung Stift-Ø + 0,1 mm (z. B. 12,1 mm) durch die untere Wand. Reine Rechnung; Bauplan-Format siehe generator.js.

import { sectionGeometry } from "./sections.js";

const HOLLOW = new Set(["rohr", "vierkant", "rechteck"]);
export const CAP_T = 4;
/** Wand, durch die ein Stab in den Gurt gesteckt wird: Hohlprofil = Wandstärke, sonst bis zur Mitte (Sackloch) */
export const entryWall = (sec, high) => (HOLLOW.has(sec.kind) && Number(sec.dims?.t) > 0 ? Number(sec.dims.t) : high / 2);

/**
 * Abstand Gurtachse → Ende eines Stabs, der durch eine Gurtwand gesteckt ist und innen an der Gegenwand endet, ohne
 * sie zu berühren: Rundrohr mit Krümmung (Stabbreite w quer zur Gurtachse), Rechteckrohr bis zur Innenseite,
 * Vollprofil bis zur Mitte (Sackloch)
 */
export function innerReach(sec, high, w) {
  const t = Number(sec.dims?.t) || 0;
  if (!(HOLLOW.has(sec.kind) && t > 0)) return 0;
  const ri = high / 2 - t;
  return sec.kind === "rohr" ? Math.sqrt(Math.max(0, ri * ri - (w / 2) ** 2)) - 0.05 : ri;
}

/** Tiefe einer Bohrung Breite w durch die Gurtwand bis ins Innere (Rohr: am Bohrungsrand ist die Wand tiefer) */
export function entryDepth(sec, high, w) {
  const t = Number(sec.dims?.t) || 0;
  if (sec.kind !== "rohr" || !(t > 0)) return entryWall(sec, high);
  const ri = high / 2 - t;
  return high / 2 - Math.sqrt(Math.max(0, ri * ri - (w / 2) ** 2));
}

/** Schema-Einträge (Schlüssel mit Vorsilbe, z. B. »gel«) – ältere Features ohne Angabe bleiben ohne Halter */
export function holderSchema(key = (k) => k, group, when = () => true) {
  const on = (p) => when(p) && p[key("holder")] !== "keine";
  return [
    { key: key("holder"), label: "Handlaufhalter", type: "select", options: [["stift", "Stift mit Endkappe, Bohrung im Handlauf"], ["keine", "ohne – Pfosten bis an den Handlauf"]], default: "stift", missing: "keine", group, when },
    { key: key("holderGap"), label: "Handlauf über Pfostenende", type: "num", default: "60", group, when: on },
    { key: key("holderD"), label: "Stift Ø (Bohrung + 0,1 mm)", type: "num", default: "12", group, when: on },
  ];
}

/** Abdeckkappe (4 mm, geschweißt) auf dem oberen Ende eines hohlen Pfostens, sonst null; top = Pfostenende (Mitte) */
export function capPlate(post, top, xDir, name) {
  if (!HOLLOW.has(post.kind)) return null;
  const g = post.geom;
  if (post.kind === "rohr") {
    const r = g.width / 2, poly = Array.from({ length: 24 }, (_, k) => [r * Math.cos((k * Math.PI) / 12), r * Math.sin((k * Math.PI) / 12)]);
    return { center: top, xDir, normal: [0, 0, 1], W: 2 * r, H: 2 * r, t: CAP_T, poly, name };
  }
  return { center: top, xDir, normal: [0, 0, 1], W: g.height, H: g.width, t: CAP_T, name };
}

/** Abstand Pfostenende (ohne Endkappe) bis Unterkante Handlauf; 0 ohne Halter */
export function holderDrop(on, post, gap) {
  return on ? gap + (HOLLOW.has(post.kind) ? CAP_T : 0) : 0;
}

/**
 * Teile eines Halters: q = Pfostenende (Mitte, ohne Kappe), along = Laufrichtung [dx, dy], axisZ = Höhe der
 * Handlaufachse über q, railH = Handlaufhöhe, slope = Neigung des Handlaufs (tan), target = Name des Handlaufs.
 */
export function holderParts({ q, along, axisZ, post, railH, d, slope = 0, name, target }) {
  const members = [], plates = [], drills = [];
  let z = q[2];
  if (HOLLOW.has(post.kind)) {
    const g = post.geom, xDir = [along[0], along[1], 0];
    if (post.kind === "rohr") {
      const r = g.width / 2, poly = Array.from({ length: 24 }, (_, k) => [r * Math.cos((k * Math.PI) / 12), r * Math.sin((k * Math.PI) / 12)]);
      plates.push({ center: [q[0], q[1], z], xDir, normal: [0, 0, 1], W: 2 * r, H: 2 * r, t: CAP_T, poly, name: `${name} Endkappe` });
    } else plates.push({ center: [q[0], q[1], z], xDir, normal: [0, 0, 1], W: g.height, H: g.width, t: CAP_T, name: `${name} Endkappe` });
    z += CAP_T;
  }
  const dims = { D: d };
  members.push({ section: { kind: "rund", dims, geom: sectionGeometry("rund", dims) }, a: [q[0], q[1], z], b: [q[0], q[1], axisZ], name: `${name} Handlaufhalter`, up: [along[0], along[1], 0] });
  const hole = Math.round((d + 0.1) * 100) / 100;
  // schräger Handlauf: die Bohrung reicht um r · Neigung weiter, sonst bleibt am unteren Bohrungsrand Wand stehen
  drills.push({ target, p: [q[0], q[1], axisZ], dir: [0, 0, -1], d: hole, len: (railH / 2) * Math.hypot(1, slope) + (hole / 2) * Math.abs(slope) + 1 });
  return { members, plates, drills };
}
