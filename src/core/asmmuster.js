// Komponentenmuster in Baugruppen (wie Inventor »Komponente anordnen«): rechteckig (eine oder zwei Richtungen) oder
// kreisförmig um eine Achse. Die Kopien sind echte Komponenten (Stückliste, Zeichnung, Export zählen sie) und werden
// bei jeder Berechnung aus Quelle und Muster neu gelegt; sie tragen pat (Muster-ID), src (Quelle) und k (Nummer).
import { placementMatrix, decomposePlacement, matMul, rotationAbout, translation, v3 } from "./geom.js";

const DIRS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], "-X": [-1, 0, 0], "-Y": [0, -1, 0], "-Z": [0, 0, -1] };

/** Neues Muster für Komponenten (IDs) */
export function defaultAsmPattern(id, comps, kind = "linear") {
  return kind === "circular"
    ? { id, kind, comps, axis: "Z", center: ["0", "0", "0"], count: "4", angle: "360" }
    : { id, kind: "linear", comps, dir: "X", count: "3", spacing: "100" };
}

/** Bewegungen (4×4) aller Exemplare ohne das Original: [{k, M}] */
export function patternMatrices(p, ev = Number) {
  const out = [];
  const n = Math.round(ev(p.count ?? "2"));
  if (!(n >= 2)) throw new Error("Anzahl mindestens 2");
  if (p.kind === "circular") {
    const d = DIRS[p.axis || "Z"];
    if (!d) throw new Error("Achse X, Y oder Z");
    const c = (p.center || ["0", "0", "0"]).map((x) => ev(x));
    const total = ev(p.angle ?? "360");
    const step = Math.abs(total - 360) < 1e-9 ? 360 / n : total / (n - 1);
    for (let k = 1; k < n; k++) out.push({ k, M: rotationAbout(c, d, step * k) });
  } else {
    const d1 = DIRS[p.dir || "X"], s1 = ev(p.spacing ?? "100");
    if (!d1) throw new Error("Richtung X, Y oder Z");
    const n2 = p.dir2 ? Math.round(ev(p.count2 ?? "1")) : 1, s2 = p.dir2 ? ev(p.spacing2 ?? "100") : 0, d2 = p.dir2 ? DIRS[p.dir2] : [0, 0, 0];
    if (p.dir2 && !d2) throw new Error("Richtung 2 X, Y oder Z");
    for (let j = 0; j < n2; j++) for (let i = 0; i < n; i++) {
      if (!i && !j) continue;
      out.push({ k: j * n + i, M: translation(v3.add(v3.mul(d1, s1 * i), v3.mul(d2, s2 * j))) });
    }
  }
  if (out.length > 500) throw new Error("Zu viele Exemplare (max. 500)");
  return out;
}

/**
 * Kopien aller Muster einer Baugruppe neu legen (fehlende anlegen, überzählige entfernen).
 * Ändert asm.components; Rückgabe { changed, errors: {musterId: Text} }.
 */
export function applyPatterns(asm, ev = Number) {
  const errors = {};
  let changed = false;
  const pats = asm.patterns || [];
  const keepIds = new Set();
  const byId = new Map(asm.components.map((c) => [c.id, c]));
  for (const p of pats) {
    if (p.suppressed) continue;
    let mats;
    try { mats = patternMatrices(p, ev); } catch (e) { errors[p.id] = e.message; continue; }
    for (const sid of p.comps || []) {
      const src = byId.get(sid);
      if (!src || src.pat) { errors[p.id] = "Quellkomponente fehlt"; continue; }
      const MS = placementMatrix(src.pos, src.rot);
      for (const { k, M } of mats) {
        const id = `${p.id}_${sid}_${k}`;
        keepIds.add(id);
        const { pos, rot } = decomposePlacement(matMul(M, MS));
        let c = byId.get(id);
        if (!c) {
          c = { id, part: src.part, name: `${src.name}·${k + 1}`, pos, rot, pat: p.id, src: sid, k };
          asm.components.push(c);
          byId.set(id, c);
          changed = true;
        } else if (c.part !== src.part || c.pos.some((x, i) => Math.abs(x - pos[i]) > 1e-9) || c.rot.some((x, i) => Math.abs(x - rot[i]) > 1e-9) || !!c.hidden !== !!src.hidden) {
          Object.assign(c, { part: src.part, pos, rot });
          changed = true;
        }
        if (!!c.hidden !== !!src.hidden) c.hidden = src.hidden || undefined;
      }
    }
  }
  const before = asm.components.length;
  asm.components = asm.components.filter((c) => !c.pat || keepIds.has(c.id));
  if (asm.components.length !== before) changed = true;
  return { changed, errors };
}
