// Achsraster in der Baugruppe (Stahlbau-Lücken ST9): Achsen 1, 2, 3 … quer zu X und A, B, C … quer zu Y mit Abständen,
// Schnittpunkte als Fangpunkte für Stützen, Linien mit Achskreisen im 3D-Fenster und in den Zeichnungsansichten.
// Reine Rechnung; gespeichert in asm.grids = [{ id, name, x, y, lx, ly, x0, y0, z, h, over, hidden }].
//   x, y   Abstände der Achsen als Liste, z. B. "6000; 6000" oder "3*6000; 4500" (erste Achse auf x0 bzw. y0)
//   lx, ly erste Beschriftung (Zahl → 1, 2, 3 …; Buchstabe → A, B, C … Z, AA …)
//   z, h   Höhe der Rasterebene und Höhe der Achslinien in Ansichten; over = Überstand der Linien über das Raster

import { splitList, evaluate } from "./expr.js";

export const GRID_DEFAULT = Object.freeze({ name: "Achsraster", x: "6000; 6000", y: "5000", lx: "1", ly: "A", x0: 0, y0: 0, z: 0, h: 4000, over: 1500 });

/** Abstandsliste lesen: Zahlen, Wiederholung »n*a« */
export function parseSpacing(s, label = "Abstände") {
  const out = [];
  for (const tok of splitList(String(s ?? "").replace(/,/g, "."))) {
    const m = tok.match(/^(\d+)\s*[*x×]\s*(.+)$/);
    const n = m ? Number(m[1]) : 1, v = Number(m ? m[2] : tok);
    if (!(n >= 1 && n <= 200 && Number.isFinite(v) && v > 0)) throw new Error(`${label}: »${tok}« ist kein Abstand > 0`);
    for (let i = 0; i < n; i++) out.push(v);
  }
  if (out.length > 200) throw new Error(`${label}: höchstens 200 Felder`);
  return out;
}

/** Beschriftungen ab start: Zahlen zählen hoch, Buchstaben wie Tabellenspalten (Z → AA) */
export function axisLabels(start, n) {
  const s = String(start ?? "").trim() || "1";
  if (/^\d+$/.test(s)) return Array.from({ length: n }, (_, i) => String(Number(s) + i));
  const up = s.toUpperCase();
  if (!/^[A-Z]+$/.test(up)) return Array.from({ length: n }, (_, i) => `${s}${i + 1}`);
  let k = [...up].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
  const name = (x) => { let t = ""; while (x > 0) { const r = (x - 1) % 26; t = String.fromCharCode(65 + r) + t; x = Math.floor((x - 1) / 26); } return t; };
  return Array.from({ length: n }, () => name(k++));
}

/**
 * Achsen, Linien und Schnittpunkte. Achsen quer zu X (Linien entlang Y) tragen lx-Beschriftungen, Achsen quer zu Y
 * (Linien entlang X) die ly-Beschriftungen. Ergebnis: { axes: [{ label, along, pos, a, b }], points: [{ label, p }], box }
 */
export function gridGeometry(g) {
  const v = { ...GRID_DEFAULT, ...g };
  const num = (x, d = 0) => { try { const r = evaluate(String(x ?? "").replace(",", ".") || String(d), {}); return Number.isFinite(r) ? r : d; } catch { return d; } };
  const x0 = num(v.x0), y0 = num(v.y0), z = num(v.z), over = Math.max(0, num(v.over, 1500));
  const cum = (list, o) => list.reduce((a, d) => [...a, a[a.length - 1] + d], [o]);
  const xs = cum(parseSpacing(v.x, "Abstände in X"), x0), ys = cum(parseSpacing(v.y, "Abstände in Y"), y0);
  const lx = axisLabels(v.lx, xs.length), ly = axisLabels(v.ly, ys.length);
  const [xa, xb, ya, yb] = [xs[0], xs.at(-1), ys[0], ys.at(-1)];
  const axes = [
    ...xs.map((x, i) => ({ label: lx[i], along: "y", pos: x, a: [x, ya - over, z], b: [x, yb + over, z] })),
    ...ys.map((y, i) => ({ label: ly[i], along: "x", pos: y, a: [xa - over, y, z], b: [xb + over, y, z] })),
  ];
  const points = [];
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < xs.length; i++) points.push({ label: `${ly[j]}/${lx[i]}`, p: [xs[i], ys[j], z] });
  return { axes, points, box: { x0: xa - over, x1: xb + over, y0: ya - over, y1: yb + over, z0: z, z1: z + Math.max(0, num(v.h, 4000)) } };
}

/** alle Fangpunkte der sichtbaren Raster einer Baugruppe: [{ label: "Achsraster: A/1", p }] */
export function gridPoints(asm) {
  const out = [];
  for (const g of asm?.grids || []) {
    if (g.hidden) continue;
    try { for (const q of gridGeometry(g).points) out.push({ label: `${g.name || "Achsraster"}: ${q.label}`, grid: g.id, p: q.p }); } catch { /* fehlerhaftes Raster: keine Punkte */ }
  }
  return out;
}

/**
 * Achsen in einer Zeichnungsansicht: jede Achse ist eine senkrechte Ebene (Linie im Grundriss × Höhe z … z + h).
 * project(p3) → [x, y] in Ansichtskoordinaten. Zeigt die Ebene als Strecke (Grundriss oder Ansicht quer zur Achse),
 * wird sie gezeichnet; schräg gesehene Achsen (Isometrie) fallen weg. Ergebnis: [{ label, a, b }] mit dem Achskreis an b.
 */
export function gridInView(g, project, tol = 1e-3) {
  const { axes, box } = gridGeometry(g);
  const out = [];
  for (const ax of axes) {
    const c = [ax.a, ax.b, [ax.b[0], ax.b[1], box.z1], [ax.a[0], ax.a[1], box.z1]].map(project);
    const area = Math.abs((c[1][0] - c[0][0]) * (c[3][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[3][0] - c[0][0]));
    const l1 = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), l2 = Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]);
    if (l1 > tol && l2 > tol && area / (l1 * l2) > 1e-6) continue; // als Fläche gesehen (schräg)
    if (l1 >= l2 && l1 > tol) out.push({ label: ax.label, a: c[0], b: c[1] });
    else if (l2 > tol) out.push({ label: ax.label, a: c[0], b: c[3] });
  }
  return out;
}
