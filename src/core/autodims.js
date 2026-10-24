// Automatische Hauptmaße einer Zeichnung (ohne DOM/Geometrie-Kern)
// Regel nach DIN 406 / ISO 129-1: jedes Maß steht nur einmal in der Zeichnung.

const EPS = 1e-6;
const key = (v) => Math.round(v * 1000);

/** Welche Welt-Achse ("X"/"Y"/"Z") zeigt in der Ansicht nach rechts bzw. oben? null bei schräger Lage */
export function viewAxes(dir, up) {
  const n = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const d = n(dir), u = n(up);
  const right = n([d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]);
  const ax = (v) => { const i = v.findIndex((c) => Math.abs(c) > 1 - 1e-6); return i < 0 ? null : "XYZ"[i]; };
  return [ax(right), ax(u)];
}

/** Vollkreise einer Ansicht ohne Doppelte (gleiche Mitte und gleicher Radius) */
function uniqueCircles(arcs) {
  const out = [];
  for (const a of arcs || []) {
    if (!a.full) continue;
    if (out.some((b) => Math.abs(b.cx - a.cx) < 1e-3 && Math.abs(b.cy - a.cy) < 1e-3 && Math.abs(b.r - a.r) < 1e-3)) continue;
    out.push(a);
  }
  return out;
}

/**
 * Maße für die Ansichten planen.
 * views: [{id, axes: [rechts, oben], bbox, arcs}] in Reihenfolge der Bevorzugung (Vorderansicht zuerst)
 * used: bereits bemaßte Gesamtmaße ({axes: Set}) und Bohrungsdurchmesser ({radii: Set}), wird fortgeschrieben
 * Rückgabe: Maße ohne id
 */
export function planAutoDims(views, used = {}) {
  const axes = used.axes || new Set();
  const radii = used.radii || new Set();
  const out = [];
  for (const v of views) {
    const b = v.bbox;
    if (!b) continue;
    const [ax, ay] = v.axes || [null, null];
    // Gesamtmaße: jede Raumrichtung nur einmal (schräge Ansichten bekommen keine)
    if (ax && !axes.has(ax) && b.x1 - b.x0 > EPS) { axes.add(ax); out.push({ view: v.id, kind: "h", p1: [b.x0, b.y1], p2: [b.x1, b.y1], off: -8, axis: ax }); }
    if (ay && !axes.has(ay) && b.y1 - b.y0 > EPS) { axes.add(ay); out.push({ view: v.id, kind: "v", p1: [b.x1, b.y0], p2: [b.x1, b.y1], off: 8, axis: ay }); }
    // Bohrungen: je Durchmesser ein Maß mit Anzahl, Lage von der linken unteren Ecke aus (Bezugsmaße)
    const circles = uniqueCircles(v.arcs);
    const groups = new Map();
    for (const c of circles) {
      const k = key(c.r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const dimmedHere = [];
    for (const [k, list] of groups) {
      if (radii.has(k)) continue;
      radii.add(k);
      dimmedHere.push(...list);
      const c = list.reduce((m, x) => (x.cx + x.cy > m.cx + m.cy ? x : m)); // oben rechts: Hinweislinie zeigt aus der Ansicht heraus
      const dm = { view: v.id, kind: "dia", circle: { cx: c.cx, cy: c.cy, r: c.r }, angle: -Math.PI / 4 };
      if (list.length > 1) dm.count = list.length;
      out.push(dm);
    }
    // Außenkontur (Kreis berührt den Umriss) und dazu konzentrische Kreise brauchen keine Lagemaße
    const touches = (c) => c.cx - c.r <= b.x0 + 1e-3 || c.cx + c.r >= b.x1 - 1e-3 || c.cy - c.r <= b.y0 + 1e-3 || c.cy + c.r >= b.y1 - 1e-3;
    const outer = circles.filter(touches);
    const placed = dimmedHere.filter((c) => !outer.some((o) => Math.abs(o.cx - c.cx) < 1e-3 && Math.abs(o.cy - c.cy) < 1e-3));
    // je Koordinate ein Maß; Hilfslinie vom Kreis, der der Maßlinie am nächsten liegt
    const pick = (coord, nearer) => {
      const m = new Map();
      for (const c of placed) { const k = key(c[coord]); if (!m.has(k) || nearer(c, m.get(k))) m.set(k, c); }
      return [...m.values()].sort((a, c) => a[coord] - c[coord]);
    };
    pick("cx", (c, o) => c.cy < o.cy).filter((c) => c.cx - b.x0 > EPS)
      .forEach((c, i) => out.push({ view: v.id, kind: "h", p1: [b.x0, b.y0], p2: [c.cx, c.cy], off: 8 + 7 * i }));
    pick("cy", (c, o) => c.cx < o.cx).filter((c) => c.cy - b.y0 > EPS)
      .forEach((c, i) => out.push({ view: v.id, kind: "v", p1: [b.x0, b.y0], p2: [c.cx, c.cy], off: -8 - 7 * i }));
  }
  return out;
}

/** Verdeckte Linien, die kürzer als ein Strich mit Lücke sind, sähen wie sichtbare Kanten aus (z. B. Bohrungen durch dünne Wände) */
export const HIDDEN_MIN = 3.7;
export function visibleHidden(polylines, scale) {
  return (polylines || []).filter((pl) => {
    let L = 0;
    for (let i = 0; i + 1 < pl.length; i++) L += Math.hypot(pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]);
    return L * scale >= HIDDEN_MIN;
  });
}
