// Bewegungsuntersuchung (SolidCraft-Abgleich E3): Stellungen eines Antriebsgelenks mit allen gekoppelten Gelenken,
// Bewegungsbahn eines Punktes, Diagramm der Gelenkwerte und »Punkt anfahren« (Gelenkwert suchen, bei dem ein Punkt
// der bewegten Komponente einem Zielpunkt am nächsten kommt). Reine Rechnung ohne Oberfläche und Kern.
import { coupledJointValues, jointDelta, jointFollowers, sweepAngles, clampAngle, jointUnit } from "./kinematik.js";
import { matApply, v3 } from "./geom.js";

/** Lagedeltas aller bewegten Komponenten, wenn das Gelenk von compId auf a steht (gekoppelte Gelenke gehen mit) */
export function motionDeltas(asm, compId, a) {
  const comps = new Map(asm.components.map((c) => [c.id, c]));
  const { values, clamped } = coupledJointValues(asm, compId, a);
  const deltas = new Map();
  for (const [id, v] of values) {
    const d = jointDelta(comps.get(id).joint, v);
    for (const m of [id, ...jointFollowers(asm, id)]) deltas.set(m, d);
  }
  return { values, clamped, deltas };
}

/** Stellungen über den ganzen Bereich des Antriebs (n Schritte → n+1 Stellungen) */
export function studyFrames(asm, compId, n = 24) {
  const drive = asm.components.find((c) => c.id === compId);
  if (!drive?.joint) throw new Error("Die Komponente hat kein Gelenk");
  return sweepAngles(drive.joint, Math.max(1, Math.round(n))).map((a) => ({ a, ...motionDeltas(asm, compId, a) }));
}

/** Bahn eines Punktes (Weltkoordinaten in heutiger Lage), der an Komponente ownerId hängt */
export function tracePath(frames, ownerId, point) {
  return frames.map((f) => (f.deltas.has(ownerId) ? matApply(f.deltas.get(ownerId), point) : [...point]));
}

export const pathLength = (pts) => pts.slice(1).reduce((s, p, i) => s + v3.len(v3.sub(p, pts[i])), 0);

/**
 * Punkt anfahren: Gelenkwert des Antriebs, bei dem der Punkt (an ownerId) dem Ziel am nächsten kommt.
 * Grob in steps Schritten, dann Goldener Schnitt im besten Intervall. Rückgabe { value, dist, point }
 */
export function seekJointValue(asm, compId, ownerId, point, target, { steps = 72 } = {}) {
  const j = asm.components.find((c) => c.id === compId)?.joint;
  if (!j) throw new Error("Die Komponente hat kein Gelenk");
  const at = (a) => { const d = motionDeltas(asm, compId, a).deltas.get(ownerId); return d ? matApply(d, point) : [...point]; };
  const dist = (a) => v3.len(v3.sub(at(a), target));
  const lo0 = Math.min(j.min, j.max), hi0 = Math.max(j.min, j.max), h = (hi0 - lo0) / steps;
  let best = lo0, bd = Infinity;
  for (let k = 0; k <= steps; k++) { const a = lo0 + h * k, d = dist(a); if (d < bd) { bd = d; best = a; } }
  let lo = Math.max(lo0, best - h), hi = Math.min(hi0, best + h);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = dist(x1), f2 = dist(x2);
  for (let i = 0; i < 60 && hi - lo > 1e-6; i++) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = dist(x1); }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = dist(x2); }
  }
  const value = clampAngle(j, (lo + hi) / 2);
  return { value, dist: dist(value), point: at(value) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const COLORS = ["#1f6feb", "#d1242f", "#1a7f37", "#9a6700", "#8250df", "#bf3989"];

/**
 * Diagramm der Bewegungsuntersuchung als SVG: x = Wert des Antriebs, je gekoppeltem Gelenk eine Linie (eigene Achse
 * wird nicht skaliert – alle Werte auf eine gemeinsame y-Achse). series: [{ name, unit, values: [Zahl je Stellung] }]
 */
export function motionChartSvg(xs, series, { width = 520, height = 260, xLabel = "Antrieb" } = {}) {
  const L = 52, R = 12, T = 12, B = 34, W = width - L - R, H = height - T - B;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  let y0 = Math.min(0, ...all), y1 = Math.max(0, ...all);
  if (!(y1 > y0)) { y1 = y0 + 1; }
  const x0 = Math.min(...xs), x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
  const X = (x) => L + ((x - x0) / (x1 - x0)) * W, Y = (y) => T + H - ((y - y0) / (y1 - y0)) * H;
  const ticks = (a, b) => Array.from({ length: 5 }, (_, i) => a + ((b - a) * i) / 4);
  const n = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)).replace(".", ",");
  const grid = ticks(y0, y1).map((t) => `<line x1="${L}" x2="${L + W}" y1="${Y(t)}" y2="${Y(t)}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${n(t)}</text>`).join("")
    + ticks(x0, x1).map((t) => `<text x="${X(t)}" y="${T + H + 16}" text-anchor="middle">${n(t)}</text>`).join("");
  const lines = series.map((s, i) => `<polyline fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="2" points="${s.values.map((v, k) => `${X(xs[k]).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}"/>`).join("");
  const legend = series.map((s, i) => `<tspan fill="${COLORS[i % COLORS.length]}">■ </tspan><tspan>${esc(s.name)} (${esc(s.unit)})  </tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="motion-chart" viewBox="0 0 ${width} ${height + 18}" width="${width}" height="${height + 18}" font-size="11" fill="currentColor">`
    + `<rect x="${L}" y="${T}" width="${W}" height="${H}" fill="none" stroke="currentColor" stroke-opacity=".3"/>${grid}${lines}`
    + `<text x="${L + W / 2}" y="${T + H + 30}" text-anchor="middle">${esc(xLabel)}</text><text x="${L}" y="${height + 14}">${legend}</text></svg>`;
}

/** Reihen für das Diagramm aus den Stellungen: je Gelenk, das sich bewegt, eine Reihe */
export function chartSeries(asm, frames) {
  const ids = [...new Set(frames.flatMap((f) => [...f.values.keys()]))];
  return ids.map((id) => {
    const c = asm.components.find((x) => x.id === id);
    return { id, name: c?.name || id, unit: jointUnit(c?.joint), values: frames.map((f) => f.values.get(id) ?? c?.joint?.angle ?? 0) };
  });
}
