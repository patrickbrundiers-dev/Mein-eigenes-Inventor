// Ziehgriffe an Features (wie Inventor): Pfeil an der Extrusion rein/raus ziehen, Bohrungstiefe, Profillänge.
// Ohne DOM: Lage der Griffe aus Rahmen/Mittelpunkt und neue Feature-Werte aus dem gezogenen Wert – damit im Test prüfbar.

const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], "-X": [-1, 0, 0], "-Y": [0, -1, 0], "-Z": [0, 0, -1] };
const add = (a, b, s = 1) => a.map((x, i) => x + b[i] * s);
const neg = (a) => a.map((x) => -x);
const r3 = (x) => Math.round(x * 1000) / 1000;
/** Nur reine Zahlen lassen sich ziehen (Ausdrücke/Parameter bleiben im Eigenschaftenfeld) */
export const isPlainNumber = (v) => /^\s*-?\d+([.,]\d+)?\s*$/.test(String(v ?? ""));
const num = (v) => Number(String(v).replace(",", "."));

/**
 * Griffe eines Features. ctx = { frame (Skizzen-Rahmen origin/normal), center (Profilmitte, Welt), ev(expr) }.
 * Rückgabe [{ which, p, d, field, value }] – p = Pfeilfuß, d = Zugrichtung (zeigt nach außen), value = heutiger Wert.
 */
export function featureHandles(f, ctx) {
  const out = [];
  const ev = ctx.ev || num;
  try {
    if (f.type === "extrude" && ctx.frame && ctx.center && f.mode !== "through" && f.mode !== "bis" && f.source !== "flaeche" && !f.from) {
      if (!isPlainNumber(f.distance) || !isPlainNumber(f.startOffset || "0")) return [];
      const N = ctx.frame.normal, c = add(ctx.center, N, num(f.startOffset || "0")), d = num(f.distance);
      const mode = f.mode || "normal";
      if (mode === "normal") out.push({ which: "a", p: add(c, N, d), d: N, field: "distance", value: d });
      else if (mode === "reverse") out.push({ which: "a", p: add(c, N, -d), d: neg(N), field: "distance", value: d });
      else if (mode === "symmetric") out.push({ which: "a", p: add(c, N, d / 2), d: N, field: "distance", value: d });
      else if (mode === "twoSided") {
        out.push({ which: "a", p: add(c, N, d), d: N, field: "distance", value: d });
        if (isPlainNumber(f.distance2 || "0")) out.push({ which: "b", p: add(c, N, -num(f.distance2 || "0")), d: neg(N), field: "distance2", value: num(f.distance2 || "0") });
      }
    } else if (f.type === "hole" && f.extent === "depth" && ctx.frame && ctx.center && f.direction !== "both" && isPlainNumber(f.depth)) {
      const s = f.direction === "normal" ? 1 : -1, D = ctx.frame.normal.map((x) => x * s), d = num(f.depth);
      out.push({ which: "a", p: add(ctx.center, D, d), d: D, field: "depth", value: d });
    } else if (f.type === "profile" && f.axis !== "custom" && isPlainNumber(f.length)) {
      const D = AXES[f.axis || "X"], o = (f.start || ["0", "0", "0"]).map((x) => ev(x)), L = num(f.length);
      if (o.every(Number.isFinite)) out.push({ which: "a", p: add(o, D, L), d: D, field: "length", value: L });
    }
  } catch { return []; }
  return out;
}

/**
 * Neuer Zustand nach dem Ziehen um delta (mm längs des Pfeils, Startwert v0). Zieht man die Extrusion über null hinaus,
 * kippt sie auf die andere Seite (Normal ↔ Umgekehrt) – »rein oder raus«. step = Raster (1 oder 0,1 mm).
 * Rückgabe Teilobjekt der zu setzenden Felder.
 */
export function dragResult(f, which, v0, delta, step = 1) {
  const snap = (x) => Math.round(x / step) * step;
  const pos = (x) => String(r3(Math.max(step, Math.abs(x))));
  if (f.type === "extrude") {
    const mode = f.mode || "normal";
    if (mode === "normal" || mode === "reverse") {
      const v = snap(v0 + delta);
      if (v < 0) return { mode: mode === "normal" ? "reverse" : "normal", distance: pos(v) };
      return { mode, distance: pos(v) };
    }
    if (mode === "symmetric") return { distance: pos(snap(v0 + 2 * delta)) };
    if (mode === "twoSided") {
      const other = num(which === "a" ? f.distance2 || "0" : f.distance);
      const v = snap(v0 + delta);
      if (which === "a") return { distance: pos(v) };
      // Abstand 2 darf negativ sein, solange die Extrusion eine Länge behält
      return { distance2: String(r3(Math.max(v, -other + step))) };
    }
  }
  if (f.type === "hole") return { depth: pos(snap(v0 + delta)) };
  if (f.type === "profile") return { length: pos(snap(v0 + delta)) };
  return {};
}

/** Mittelpunkt der gezeichneten (nicht Konstruktions-)Geometrie einer Skizze in Skizzenkoordinaten, für Bohrungen nur die Punkte */
export function sketchCenter(sk, pointsOnly = false) {
  if (!sk) return null;
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const ids = new Set();
  for (const e of sk.entities) {
    if (e.construction || e.origin) continue;
    if (pointsOnly && e.type !== "point") continue;
    for (const k of ["p1", "p2", "c", "p"]) if (e[k]) ids.add(e[k]);
    if (e.type === "circle" && e.c) ids.add(e.c);
  }
  const pts = [...ids].map((id) => P.get(id)).filter(Boolean);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  // Mitte des Umrisses (Rechteck um alle Punkte) – liegt bei Profilen im Material, nicht im Schwerpunkt der Eckpunkte
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
