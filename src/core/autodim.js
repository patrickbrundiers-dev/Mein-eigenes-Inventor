// „Skizze vollständig bemaßen“: setzt Maße, bis keine Freiheitsgrade mehr bleiben.
// Reihenfolge wie ein Konstrukteur: Durchmesser/Radien, Längen, Winkel, Lage zum Bezugspunkt.
// Jedes Maß wird nur genommen, wenn es einen Freiheitsgrad wegnimmt (keine Überbestimmung).

import { checkNewConstraint, measureConstraint, solveSketch } from "./solver.js";

const round = (v) => String(Math.round(v * 100) / 100);
const DIMS = new Set(["radius", "diameter", "length", "angle", "semiAxis", "axisAngle", "lineAngle", "distance"]);
const ANGLES = new Set(["angle", "axisAngle", "lineAngle"]);

/**
 * sketch wird nicht verändert. opts: {ref: Punkt-ID des Bezugs, kinds: {radius, length, angle, position}, uid}
 * → {constraints: [neue Maße], dofBefore, dofAfter}
 */
export function autoDimension(sketch, scope = {}, opts = {}) {
  const kinds = { radius: true, length: true, angle: true, position: true, ...opts.kinds };
  const uid = opts.uid || ((p) => p + Math.random().toString(36).slice(2, 10));
  const work = JSON.parse(JSON.stringify(sketch));
  const P = new Map(work.points.map((p) => [p.id, p]));
  const has = (pred) => work.constraints.some(pred);
  const start = solveSketch(work, scope);
  let dof = start.dof;
  const added = [];
  // Ausdehnung für die Lage der Maßlinien
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of work.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const size = Math.max(10, x1 - x0, y1 - y0), gap = size * 0.08;
  let nh = 0, nv = 0;

  const tryAdd = (c) => {
    if (!(dof > 0)) return false;
    c.id = uid("m");
    try { c.value = round(measureConstraint(work, c)); } catch { return false; }
    if (!Number.isFinite(Number(c.value)) || (!ANGLES.has(c.type) && Number(c.value) <= 0)) return false;
    let res;
    try { res = checkNewConstraint(work, c, scope); } catch { return false; }
    if (res !== "ok") return false;
    work.constraints.push(c);
    added.push(c);
    dof--;
    return true;
  };

  const ents = work.entities.filter((e) => !e.origin);
  if (kinds.radius) {
    for (const e of ents) {
      if (e.type === "circle" && !has((c) => c.e === e.id && DIMS.has(c.type))) tryAdd({ type: "diameter", e: e.id, labelAngle: Math.PI / 4 });
      if (e.type === "arc" && !has((c) => c.e === e.id && DIMS.has(c.type))) tryAdd({ type: "radius", e: e.id, labelAngle: Math.PI / 4 });
      if (e.type === "ellipse") for (const axis of ["a", "b"]) if (!has((c) => c.e === e.id && c.type === "semiAxis" && (c.axis || "a") === axis)) tryAdd({ type: "semiAxis", e: e.id, axis });
    }
  }
  if (kinds.length) {
    // Maßlinie auf die Außenseite: Normale links von p1→p2, weg vom Schwerpunkt aller Punkte
    const cx = work.points.reduce((t, p) => t + p.x, 0) / work.points.length, cy = work.points.reduce((t, p) => t + p.y, 0) / work.points.length;
    for (const e of ents) {
      if (e.type !== "line" || has((c) => c.e === e.id && c.type === "length")) continue;
      const a = P.get(e.p1), b = P.get(e.p2), nx = -(b.y - a.y), ny = b.x - a.x;
      const out = nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) >= 0 ? 1 : -1;
      tryAdd({ type: "length", e: e.id, labelOffset: out * gap * 0.6 });
    }
  }
  if (kinds.angle) {
    const lines = ents.filter((e) => e.type === "line");
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      if (![a.p1, a.p2].some((p) => p === b.p1 || p === b.p2)) continue; // nur Linien mit gemeinsamer Ecke
      const u = [P.get(a.p2).x - P.get(a.p1).x, P.get(a.p2).y - P.get(a.p1).y], v = [P.get(b.p2).x - P.get(b.p1).x, P.get(b.p2).y - P.get(b.p1).y];
      const cr = Math.abs(u[0] * v[1] - u[1] * v[0]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
      if (cr < 1e-3) continue;
      tryAdd({ type: "angle", e1: a.id, e2: b.id, labelOffset: gap * 1.5 });
    }
    for (const e of ents) if (e.type === "ellipse" && !has((c) => c.e === e.id && c.type === "axisAngle")) tryAdd({ type: "axisAngle", e: e.id });
    // einzelne schräge Linien ohne Nachbarlinie: Winkel zur x-Achse
    for (const a of lines) {
      if (lines.some((b) => b !== a && [a.p1, a.p2].some((p) => p === b.p1 || p === b.p2)) || has((c) => c.e === a.id && c.type === "lineAngle")) continue;
      tryAdd({ type: "lineAngle", e: a.id, labelOffset: gap * 1.5 });
    }
  }
  if (kinds.position) {
    const ref = P.get(opts.ref) || P.get("O") || work.points[0];
    if (ref) {
      const used = new Set();
      for (const e of ents) { for (const k of ["c", "p1", "p2", "p", "a"]) if (e[k]) used.add(e[k]); for (const id of e.pts || []) used.add(id); }
      const pts = [...used].map((id) => P.get(id)).filter((p) => p && p.id !== ref.id).sort((p, q) => Math.hypot(p.x - ref.x, p.y - ref.y) - Math.hypot(q.x - ref.x, q.y - ref.y));
      for (const p of pts) {
        if (Math.abs(p.x - ref.x) > 1e-9) { nh++; tryAdd({ type: "distance", p: ref.id, q: p.id, dir: "h", labelOffset: y0 - gap * (nh + 0.5) - Math.min(ref.y, p.y) }) || nh--; }
        if (Math.abs(p.y - ref.y) > 1e-9) { nv++; tryAdd({ type: "distance", p: ref.id, q: p.id, dir: "v", labelOffset: x0 - gap * (nv + 0.5) - Math.min(ref.x, p.x) }) || nv--; }
        // liegt der Punkt genau auf einer Achse des Bezugs, fixiert das andere Maß die Lage nicht ganz – dann bleibt er frei
      }
    }
  }
  return { constraints: added, dofBefore: start.dof, dofAfter: dof };
}
