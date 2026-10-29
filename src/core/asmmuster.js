// Komponentenmuster in Baugruppen (wie Inventor »Komponente anordnen«): rechteckig (eine oder zwei Richtungen) oder
// kreisförmig um eine Achse. Die Kopien sind echte Komponenten (Stückliste, Zeichnung, Export zählen sie) und werden
// bei jeder Berechnung aus Quelle und Muster neu gelegt; sie tragen pat (Muster-ID), src (Quelle) und k (Nummer).
import { placementMatrix, decomposePlacement, matMul, matApply, rotationAbout, translation, v3 } from "./geom.js";

const DIRS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], "-X": [-1, 0, 0], "-Y": [0, -1, 0], "-Z": [0, 0, -1] };

/** Neues Muster für Komponenten (IDs) */
export function defaultAsmPattern(id, comps, kind = "linear", hole = null) {
  if (kind === "lochbild") return { id, kind, comps, hole };
  return kind === "circular"
    ? { id, kind, comps, axis: "Z", center: ["0", "0", "0"], count: "4", angle: "360" }
    : { id, kind: "linear", comps, dir: "X", count: "3", spacing: "100" };
}

/**
 * Lochbild (BG9, wie Inventor »Muster der Komponente nach Feature-Muster«): alle Bohrungsachsen des Zielbauteils mit
 * gleichem Radius und paralleler Richtung wie die Bezugsbohrung hole {comp, p, d, r} (Bauteil-System, Fußpunkt).
 * Gleiche Achsen (geteilte Zylinderflächen) zählen einmal; Reihenfolge nach Lage, die Bezugsbohrung zuerst.
 */
export function holeAxes(hole, faces, tol = 0.01) {
  const d0 = v3.norm(hole.d), out = [];
  const foot = (p) => v3.sub(p, v3.mul(d0, v3.dot(p, d0)));
  for (const f of faces || []) {
    if (f.type !== "CYLINDER" || !f.axisD || !f.axisP) continue;
    if (Math.abs(Math.abs(v3.dot(v3.norm(f.axisD), d0)) - 1) > 1e-6 || Math.abs((f.radius || 0) - hole.r) > tol) continue;
    const q = foot(f.axisP);
    if (!out.some((x) => v3.dist(x, q) < 1e-6)) out.push(q);
  }
  const ref = foot(hole.p);
  out.sort((a, b) => v3.dist(a, ref) - v3.dist(b, ref) || a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return out;
}

/** Bewegungen (4×4) aller Exemplare ohne das Original: [{k, M}]. ctx = { comps: Map, facesOf } für das Lochbild */
export function patternMatrices(p, ev = Number, ctx = null) {
  const out = [];
  if (p.kind === "lochbild") {
    const T = ctx?.comps?.get(p.hole?.comp);
    if (!p.hole || !T) throw new Error("Zielkomponente mit den Bohrungen fehlt");
    const axes = holeAxes(p.hole, ctx.facesOf?.(T.part));
    if (axes.length < 2) throw new Error("Im Zielbauteil gibt es keine weiteren gleich großen Bohrungen");
    const MT = placementMatrix(T.pos, T.rot), p0 = matApply(MT, axes[0]);
    axes.slice(1).forEach((q, i) => out.push({ k: i + 1, M: translation(v3.sub(matApply(MT, q), p0)) }));
    if (out.length > 500) throw new Error("Zu viele Exemplare (max. 500)");
    return out;
  }
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
export function applyPatterns(asm, ev = Number, facesOf = null) {
  const errors = {};
  let changed = false;
  const pats = asm.patterns || [];
  const keepIds = new Set();
  const byId = new Map(asm.components.map((c) => [c.id, c]));
  for (const p of pats) {
    if (p.suppressed) continue;
    let mats;
    try { mats = patternMatrices(p, ev, { comps: byId, facesOf }); } catch (e) { errors[p.id] = e.message; continue; }
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

/**
 * Bezugsbohrung für ein Lochbild-Muster aus den Abhängigkeiten der Quelle: Einfügen oder Konzentrisch an der Achse
 * einer anderen Komponente. Rückgabe { comp, p, d, r } (Achsbezug der Bohrung) oder null.
 */
export function holeFromConstraints(asm, srcId) {
  for (const k of asm.constraints || []) {
    if (k.suppressed || (k.type !== "einfuegen" && k.type !== "konzentrisch")) continue;
    const other = k.a?.comp === srcId ? k.b : k.b?.comp === srcId ? k.a : null;
    if (other?.axis && !other.edge && other.comp !== srcId) return { comp: other.comp, p: other.p, d: other.d, r: other.r };
  }
  return null;
}
