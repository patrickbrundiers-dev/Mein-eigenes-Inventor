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

// ---------- Platzierung (Blatt-Koordinaten in mm, y nach unten) ----------
export const ROW_FIRST = 8; // Abstand der ersten Maßlinie zur Körperkante
export const ROW_STEP = 7; // Abstand der weiteren Maßreihen
const TEXT_H = 4.5; // Schrifthöhe 3,5 mit Abstand zur Maßlinie
export const LEAD = 8; // Länge der Hinweislinie über den Kreis hinaus
export const textWidth = (txt) => String(txt).length * 2.1;

const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const overlap = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);

/** Text eines Maßes (wie in der Zeichnung) für die Breitenabschätzung */
export function dimLabel(m) {
  const val = m.kind === "dia" ? m.circle.r * 2 : m.kind === "rad" ? m.circle.r : m.kind === "h" ? Math.abs(m.p2[0] - m.p1[0]) : Math.abs(m.p2[1] - m.p1[1]);
  return (m.count > 1 ? m.count + "× " : "") + (m.kind === "dia" ? "Ø" : m.kind === "rad" ? "R" : "") + String(Math.round(val * 10) / 10).replace(".", ",") + (m.suffix || "");
}

/**
 * Automatische Maße kollisionsfrei auf dem Blatt anordnen (DIN 406-11: kurze Maße innen, lange außen,
 * Maße außerhalb der Ansicht, nichts über anderen Ansichten, dem Schriftfeld oder dem Rahmen).
 * dims: Maße mit view, kind, p1/p2 bzw. circle (Ansichtskoordinaten); werden verändert (off, angle, lead)
 * views: { [id]: { to(u, w) -> [x, y], rect: [x0, y0, x1, y1], scale, circles? } } – alle Ansichten des Blatts
 * obstacles: weitere belegte Rechtecke (Schriftfeld, Stückliste, feste Maße); frame: nutzbare Fläche
 */
export function layoutAutoDims(dims, views, { obstacles = [], frame = null } = {}) {
  const placed = [...obstacles];
  const outside = (r) => (frame ? area(r) - overlap(r, frame) : 0);
  const blockersFor = (id) => Object.entries(views).filter(([k]) => k !== id).map(([, v]) => v.rect).concat(placed);
  const cost = (r, id) => blockersFor(id).reduce((s, b) => s + overlap(r, b), 0) + 2 * outside(r);
  const order = [...new Set(dims.map((m) => m.view))].filter((id) => views[id]);
  for (const id of order) {
    const v = views[id], R = v.rect;
    // Längenmaße: je Richtung Seiten wählen, dann von innen nach außen nach Länge staffeln
    for (const kind of ["h", "v"]) {
      const c = kind === "h" ? 1 : 0; // Koordinate quer zur Maßlinie
      const items = dims.filter((m) => m.view === id && m.kind === kind).map((m) => {
        const A = v.to(...m.p1), B = v.to(...m.p2);
        const line = (m.off >= 0 ? Math.max(A[c], B[c]) : Math.min(A[c], B[c])) + m.off;
        return { m, A, B, len: Math.abs(B[1 - c] - A[1 - c]), side: line > (R[c] + R[c + 2]) / 2 ? "max" : "min" };
      });
      if (!items.length) continue;
      const band = (list, side) => {
        const lo = Math.min(...list.map((it) => Math.min(it.A[1 - c], it.B[1 - c])));
        const hi = Math.max(...list.map((it) => Math.max(it.A[1 - c], it.B[1 - c])));
        const depth = ROW_FIRST + ROW_STEP * (list.length - 1) + TEXT_H;
        const q = side === "max" ? [R[c + 2], R[c + 2] + depth] : [R[c] - depth, R[c]];
        return kind === "h" ? [lo, q[0], hi, q[1]] : [q[0], lo, q[1], hi];
      };
      const sides = { min: items.filter((it) => it.side === "min"), max: items.filter((it) => it.side === "max") };
      // größere Gruppe zuerst, sie darf ihre Seite behalten oder auf die freie Gegenseite wechseln
      for (const s of ["min", "max"].sort((a, b) => sides[b].length - sides[a].length)) {
        const grp = sides[s];
        if (!grp.length) continue;
        const o = s === "min" ? "max" : "min";
        const here = cost(band(grp, s), id), there = cost(band([...sides[o], ...grp], o), id);
        if (there + 1 < here) { sides[o].push(...grp); sides[s] = []; } // kleine Eckberührungen zählen nicht
      }
      for (const s of ["min", "max"]) {
        const grp = sides[s].sort((a, b) => a.len - b.len);
        grp.forEach((it, i) => {
          const dist = ROW_FIRST + ROW_STEP * i;
          it.m.off = s === "max" ? R[c + 2] + dist - Math.max(it.A[c], it.B[c]) : R[c] - dist - Math.min(it.A[c], it.B[c]);
        });
        if (grp.length) placed.push(band(grp, s));
      }
    }
    // Durchmesser/Radien: Hinweislinie mit Text in freien Raum, nicht durch andere Bohrungen
    const circles = (v.circles || []).map((k) => ({ c: v.to(k.cx, k.cy), r: k.r * v.scale }));
    for (const m of dims.filter((x) => x.view === id && (x.kind === "dia" || x.kind === "rad"))) {
      const c = v.to(m.circle.cx, m.circle.cy), r = m.circle.r * v.scale;
      const shelf = Math.max(10, textWidth(dimLabel(m)) + 2);
      let best = null;
      for (const ang of [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4]) {
        const ux = Math.cos(ang), uy = Math.sin(ang);
        for (let lead = LEAD; lead <= 60; lead += 4) {
          const p = [c[0] + ux * (r + lead), c[1] + uy * (r + lead)];
          const box = ux >= 0 ? [p[0], p[1] - TEXT_H - 0.5, p[0] + shelf, p[1] + 0.5] : [p[0] - shelf, p[1] - TEXT_H - 0.5, p[0], p[1] + 0.5];
          // Hinweislinie schneidet andere Kreise der Ansicht?
          let cross = 0;
          for (const k of circles) {
            if (Math.hypot(k.c[0] - c[0], k.c[1] - c[1]) < 1e-3) continue;
            const t = Math.max(0, Math.min(1, ((k.c[0] - c[0]) * ux + (k.c[1] - c[1]) * uy) / (r + lead)));
            if (Math.hypot(c[0] + ux * (r + lead) * t - k.c[0], c[1] + uy * (r + lead) * t - k.c[1]) < k.r + 0.5) cross++;
          }
          const score = 3 * overlap(box, R) + 3 * cost(box, id) + 50 * cross + 0.3 * (lead - LEAD) + (ang === -Math.PI / 4 ? 0 : 0.1);
          if (!best || score < best.score) best = { score, ang, lead, box };
        }
      }
      m.angle = best.ang;
      if (best.lead !== LEAD) m.lead = best.lead; else delete m.lead;
      placed.push(best.box);
    }
  }
  return dims;
}
