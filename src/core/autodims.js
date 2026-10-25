// Automatische Hauptmaße einer Zeichnung (ohne DOM/Geometrie-Kern)
// Regel nach DIN 406 / ISO 129-1: jedes Maß steht nur einmal in der Zeichnung.
import { THREADS, sectionName } from "./sections.js";

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

const fmt = (v) => String(Math.round(v * 100) / 100).replace(".", ",");

/**
 * Bohrungsangaben aus den Bohrungs-Features (Gewinde, Tiefe, Senkung), damit die Zeichnung „M8“ statt „Ø6,8“ zeigt.
 * ev(ausdruck) wertet Parameter des Bauteils aus. Rückgabe: [{ r, hole: {thread?, d, depth?, sink?} }]
 */
export function holeSpecs(features, ev) {
  const out = [];
  for (const f of features || []) {
    if (f.type !== "hole" || f.suppressed) continue;
    try {
      const d = f.thread && THREADS[f.thread] ? THREADS[f.thread] : ev(f.diameter);
      if (!(d > 0)) continue;
      const hole = { d };
      if (f.thread && THREADS[f.thread]) hole.thread = f.thread;
      if (f.extent === "depth") hole.depth = ev(f.depth);
      if (f.sink === "senkung") hole.sink = { kind: "kegel", d: ev(f.sinkDiameter), angle: ev(f.sinkAngle || "90") };
      else if (f.sink === "flach") hole.sink = { kind: "flach", d: ev(f.sinkDiameter), depth: ev(f.sinkDepth) };
      out.push({ r: d / 2, hole });
    } catch { /* Ausdruck nicht auswertbar: Bohrung bekommt nur ihr Ø */ }
  }
  return out;
}

/** Text einer Bohrungsangabe, z. B. „5× M8“, „2× Ø11 durch“, „Ø6,6 – Senkung Ø12 × 90°“ */
export function holeText(hole, count = 1) {
  let t = (count > 1 ? count + "× " : "") + (hole.thread || "Ø" + fmt(hole.d));
  if (hole.depth > 0) t += ", " + fmt(hole.depth) + " tief";
  else if (!hole.thread) t += " durch";
  if (hole.sink?.kind === "kegel") t += " – Senkung Ø" + fmt(hole.sink.d) + " × " + fmt(hole.sink.angle) + "°";
  else if (hole.sink?.kind === "flach") t += " – Senkung Ø" + fmt(hole.sink.d) + ", " + fmt(hole.sink.depth) + " tief";
  return t;
}

/**
 * Profil-Feature des Bauteils (genau eines, achsparallel, keine weiteren Körper) -> Angabe „Rechteckrohr 50x20x2 – L = 50“
 * ev(ausdruck) wertet Parameter aus; cutLength: Zuschnittlänge aus dem gebauten Stab (meta.length). Rückgabe: { text, axis, cross: [Achse, Achse] } oder null
 */
export function profileSpec(features, ev, cutLength = null) {
  const act = (features || []).filter((f) => !f.suppressed);
  const prof = act.filter((f) => f.type === "profile");
  if (prof.length !== 1 || act.some((f) => ["extrude", "revolve", "frame", "profilzug", "biegerohr", "knickrahmen", "platte", "rippe", "import"].includes(f.type) && (f.op || "join") !== "cut")) return null;
  const f = prof[0];
  const axis = String(f.axis || "X").replace("-", "");
  if (!"XYZ".includes(axis) || axis.length !== 1) return null;
  try {
    const dims = {};
    for (const [k, x] of Object.entries(f.dims || {})) dims[k] = ev(x);
    const L = ev(f.length);
    // Länge = Zuschnittlänge wie in der Zuschnittliste (bei Gehrungen die Außenlänge), sonst die Länge des Features
    const len = cutLength > 0 ? cutLength : L;
    return { text: sectionName(f.section, dims) + " – L = " + fmt(Math.round(len * 10) / 10), axis, cross: [..."XYZ"].filter((a) => a !== axis) };
  } catch { return null; }
}

/** Wandstärke eines Hohlprofils aus den sichtbaren Kanten: innere Kanten ringsum im gleichen Abstand zum Umriss */
export function wallThickness(b, lines, arcs = []) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (!(w > EPS && h > EPS) || !lines?.length) return null;
  const off = { l: Infinity, r: Infinity, b: Infinity, t: Infinity };
  for (const pl of lines) for (let i = 0; i + 1 < pl.length; i++) {
    const [p, q] = [pl[i], pl[i + 1]];
    if (Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(q[1] - p[1]) > 0.5 * h) {
      const dl = p[0] - b.x0, dr = b.x1 - p[0];
      if (dl > 1e-3 && dl < w / 4) off.l = Math.min(off.l, dl);
      if (dr > 1e-3 && dr < w / 4) off.r = Math.min(off.r, dr);
    }
    if (Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(q[0] - p[0]) > 0.5 * w) {
      const db = p[1] - b.y0, dt = b.y1 - p[1];
      if (db > 1e-3 && db < h / 4) off.b = Math.min(off.b, db);
      if (dt > 1e-3 && dt < h / 4) off.t = Math.min(off.t, dt);
    }
  }
  const t = off.l;
  if (!Number.isFinite(t) || ![off.r, off.b, off.t].every((x) => Math.abs(x - t) < 1e-2)) return null;
  // Tangentenkanten einer gerundeten Außenkante sehen genauso aus: Rundung mit Radius t am Umriss -> keine Wand
  const touches = (c) => c.cx - c.r <= b.x0 + 1e-3 || c.cx + c.r >= b.x1 - 1e-3 || c.cy - c.r <= b.y0 + 1e-3 || c.cy + c.r >= b.y1 - 1e-3;
  if ((arcs || []).some((a) => Math.abs(a.r - t) < 1e-2 && touches(a))) return null;
  return Math.round(t * 1000) / 1000;
}

/** Gleich große Bohrungen gleichmäßig auf einem Kreis (mind. 3)? -> Teilkreis {cx, cy, r} */
export function boltCircle(list) {
  if (list.length < 3) return null;
  const cx = list.reduce((s, c) => s + c.cx, 0) / list.length, cy = list.reduce((s, c) => s + c.cy, 0) / list.length;
  const r = Math.hypot(list[0].cx - cx, list[0].cy - cy);
  if (r < 1e-3 || list.some((c) => Math.abs(Math.hypot(c.cx - cx, c.cy - cy) - r) > 1e-2)) return null;
  const ang = list.map((c) => Math.atan2(c.cy - cy, c.cx - cx)).sort((a, b) => a - b);
  const step = (2 * Math.PI) / list.length;
  if (ang.some((a, i) => Math.abs(((i + 1 < ang.length ? ang[i + 1] : ang[0] + 2 * Math.PI) - a) - step) > 1e-3)) return null;
  // vier Bohrungen im Quadrat sind meist ein Raster, kein Lochkreis
  if (list.length === 4 && ang.some((a) => Math.abs(Math.cos(2 * a)) < 1e-3)) return null;
  return { cx, cy, r };
}

/**
 * Kanten, die zusammen als Kreis erscheinen (z. B. Bohrung in einem Rundrohr: Raumkurve, kommt in vielen kurzen Stücken).
 * Stücke mit sich berührenden Hüllrechtecken werden gruppiert; eine Gruppe ist ein Kreis, wenn alle Punkte auf einem
 * Kreis um die Mitte liegen und ihn fast ganz umrunden. maxSize: größere Stücke (Umriss) bleiben außen vor.
 */
export function circlesFromLines(lines, maxSize = Infinity) {
  const box = (pl) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pl) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
  const items = (lines || []).filter((pl) => pl.length >= 2).map((pl) => ({ pl, b: box(pl) })).filter((it) => Math.max(it.b[2] - it.b[0], it.b[3] - it.b[1]) < maxSize);
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const g = 0.3;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i].b, B = items[j].b;
    if (A[0] - g <= B[2] && B[0] - g <= A[2] && A[1] - g <= B[3] && B[1] - g <= A[3]) parent[find(i)] = find(j);
  }
  const groups = new Map();
  items.forEach((it, i) => { const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(...it.pl); });
  const out = [];
  for (const pts of groups.values()) {
    if (pts.length < 12) continue;
    const [x0, y0, x1, y1] = box(pts);
    const w = x1 - x0, h = y1 - y0, r = (w + h) / 4, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (r < 0.1 || Math.abs(w - h) > 0.02 * Math.max(w, h)) continue;
    if (!pts.every(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r) < Math.max(0.02 * r, 0.05))) continue;
    const bins = new Set(pts.map(([x, y]) => Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 36) % 36));
    if (bins.size < 33) continue;
    out.push({ cx: Math.round(cx * 100) / 100, cy: Math.round(cy * 100) / 100, r: Math.round(r * 100) / 100, full: true });
  }
  return out;
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
 * views: [{id, axes: [rechts, oben], bbox, arcs, holes?}] in Reihenfolge der Bevorzugung (Vorderansicht zuerst); holes aus holeSpecs
 * used: bereits bemaßte Gesamtmaße ({axes: Set}) und Bohrungsdurchmesser ({radii: Set}), wird fortgeschrieben
 * Rückgabe: Maße ohne id
 */
export function planAutoDims(views, used = {}) {
  const axes = used.axes || new Set();
  const radii = used.radii || new Set();
  const prof = used.profile || null;
  // Profilteil: der Querschnitt steht in der Profilangabe, nur die Länge wird bemaßt
  if (prof) for (const a of prof.cross) axes.add(a);
  const out = [];
  for (const v of views) {
    const b = v.bbox;
    if (!b) continue;
    const [ax, ay] = v.axes || [null, null];
    const endView = prof && ax && ay && prof.cross.includes(ax) && prof.cross.includes(ay);
    // Gesamtmaße: jede Raumrichtung nur einmal (schräge Ansichten bekommen keine)
    if (ax && !axes.has(ax) && b.x1 - b.x0 > EPS) { axes.add(ax); out.push({ view: v.id, kind: "h", p1: [b.x0, b.y1], p2: [b.x1, b.y1], off: -8, axis: ax }); }
    if (ay && !axes.has(ay) && b.y1 - b.y0 > EPS) { axes.add(ay); out.push({ view: v.id, kind: "v", p1: [b.x1, b.y0], p2: [b.x1, b.y1], off: 8, axis: ay }); }
    // Bohrungen: je Durchmesser ein Maß mit Anzahl, Lage von der linken unteren Ecke aus (Bezugsmaße)
    let circles = uniqueCircles([...(v.arcs || []), ...circlesFromLines(v.lines, 0.5 * Math.max(b.x1 - b.x0, b.y1 - b.y0))]);
    if (endView) {
      // Stirnansicht eines Rund-/Rohrprofils: Außen- und Innenkreis gehören zur Profilangabe
      const rim = circles.filter((c) => c.cx - c.r <= b.x0 + 1e-3 || c.cx + c.r >= b.x1 - 1e-3 || c.cy - c.r <= b.y0 + 1e-3 || c.cy + c.r >= b.y1 - 1e-3);
      circles = circles.filter((c) => !rim.some((o) => Math.abs(o.cx - c.cx) < 1e-3 && Math.abs(o.cy - c.cy) < 1e-3));
    }
    // Hohlprofil ohne Profil-Feature: Wandstärke einmal in der Ansicht, in der sie ringsum gleich ist
    if (!prof && !used.wall) {
      const t = wallThickness(b, v.lines, v.arcs);
      if (t) { used.wall = true; out.push({ view: v.id, kind: "h", p1: [b.x0, b.y1], p2: [b.x0 + t, b.y1], off: -8, wall: true }); }
    }
    const groups = new Map();
    for (const c of circles) {
      const k = key(c.r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    // Bohrungs-Feature je Radius (nur wenn eindeutig); Senkungskreise gehören zur Bohrung und bekommen kein eigenes Maß
    const specFor = (r) => {
      const m = (v.holes || []).filter((h) => Math.abs(h.r - r) < 0.02);
      return m.length && m.every((h) => holeText(h.hole) === holeText(m[0].hole)) ? m[0].hole : null;
    };
    const sinkOf = (c) => circles.some((b) => b !== c && Math.abs(b.cx - c.cx) < 1e-3 && Math.abs(b.cy - c.cy) < 1e-3 && specFor(b.r)?.sink && Math.abs(specFor(b.r).sink.d / 2 - c.r) < 1e-3);
    const dimmedHere = [], centers = [];
    for (const [k, list0] of groups) {
      const list = list0.filter((c) => !sinkOf(c));
      if (!list.length || radii.has(k)) continue;
      radii.add(k);
      const lk = boltCircle(list);
      if (lk) {
        // Lochkreis: Ø des Teilkreises mit Teilung, Lage nur für seine Mitte
        out.push({ view: v.id, kind: "dia", circle: { cx: lk.cx, cy: lk.cy, r: lk.r }, angle: -3 * Math.PI / 4, pcd: { n: list.length } });
        centers.push({ cx: lk.cx, cy: lk.cy, r: 0 });
      } else dimmedHere.push(...list);
      const c = list.reduce((m, x) => (x.cx + x.cy > m.cx + m.cy ? x : m)); // oben rechts: Hinweislinie zeigt aus der Ansicht heraus
      const dm = { view: v.id, kind: "dia", circle: { cx: c.cx, cy: c.cy, r: c.r }, angle: -Math.PI / 4 };
      if (list.length > 1) dm.count = list.length;
      const hole = specFor(c.r);
      if (hole) dm.hole = hole;
      out.push(dm);
    }
    // Außenkontur (Kreis berührt den Umriss) und dazu konzentrische Kreise brauchen keine Lagemaße
    const touches = (c) => c.cx - c.r <= b.x0 + 1e-3 || c.cx + c.r >= b.x1 - 1e-3 || c.cy - c.r <= b.y0 + 1e-3 || c.cy + c.r >= b.y1 - 1e-3;
    const outer = circles.filter(touches);
    const inOuter = (c) => outer.some((o) => Math.abs(o.cx - c.cx) < 1e-3 && Math.abs(o.cy - c.cy) < 1e-3);
    const placed = dimmedHere.filter((c) => !inOuter(c));
    for (let i = centers.length - 1; i >= 0; i--) if (inOuter(centers[i])) centers.splice(i, 1);
    // je Koordinate ein Maß; Hilfslinie vom Kreis, der der Maßlinie am nächsten liegt
    const pick = (coord, nearer) => {
      const m = new Map();
      for (const c of placed.concat(centers)) { const k = key(c[coord]); if (!m.has(k) || nearer(c, m.get(k))) m.set(k, c); }
      return [...m.values()].sort((a, c) => a[coord] - c[coord]);
    };
    const axisDims = (coord, kind, list, lo, hi, sgn) => {
      const pt = (c) => [c.cx, c.cy];
      const at = (x) => (kind === "h" ? [x, b.y0] : [b.x0, x]);
      const vals = list.map((c) => c[coord]);
      const n = vals.length;
      if (!n) return;
      const mid = (lo + hi) / 2;
      const sym = vals.every((x, i) => Math.abs(x - mid - (mid - vals[n - 1 - i])) < 1e-3);
      const step = n >= 3 ? (vals[n - 1] - vals[0]) / (n - 1) : 0;
      const even = n >= 3 && vals.every((x, i) => Math.abs(x - vals[0] - i * step) < 1e-3);
      if (n === 1 && Math.abs(vals[0] - mid) < 1e-3) return; // auf der Mittellinie: Lage ist durch die Symmetrie bestimmt
      if (even) {
        // Lochreihe mit gleicher Teilung (DIN 406-11): „n× Teilung (=Gesamt)“, bei Mittellage ohne Randmaß
        if (!sym && vals[0] - lo > EPS) out.push({ view: v.id, kind, p1: at(lo), p2: pt(list[0]), off: sgn * 8 });
        out.push({ view: v.id, kind, p1: pt(list[0]), p2: pt(list[n - 1]), off: sgn * 15, pitch: { n: n - 1, p: step } });
      } else if (sym && n >= 2) {
        // symmetrisch zur Mitte: Abstände der Paare statt Lagemaße vom Rand
        for (let i = 0; i < Math.floor(n / 2); i++) out.push({ view: v.id, kind, p1: pt(list[i]), p2: pt(list[n - 1 - i]), off: sgn * (8 + 7 * i) });
      } else {
        const rest = list.filter((c) => c[coord] - lo > EPS);
        const ord = rest.length >= 4; // viele Lagemaße: Koordinatenbemaßung mit Nullpunkt statt gestaffelter Maßlinien
        if (ord) out.push({ view: v.id, kind, p1: at(lo), p2: at(lo), off: sgn * 8, ord: true });
        rest.forEach((c, i) => out.push({ view: v.id, kind, p1: at(lo), p2: pt(c), off: sgn * (8 + (ord ? 0 : 7 * i)), ...(ord ? { ord: true } : {}) }));
      }
    };
    axisDims("cx", "h", pick("cx", (c, o) => c.cy < o.cy), b.x0, b.x1, 1);
    axisDims("cy", "v", pick("cy", (c, o) => c.cx < o.cx), b.y0, b.y1, -1);
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
  if (m.kind === "dia" && m.hole) return holeText(m.hole, m.count) + (m.suffix || "");
  if (m.kind === "dia" && m.pcd) return "LK Ø" + fmt(m.circle.r * 2) + ", " + m.pcd.n + "× " + fmt(360 / m.pcd.n) + "°" + (m.suffix || "");
  if (m.pitch) return m.pitch.n + "× " + fmt(m.pitch.p) + " (=" + fmt(m.pitch.n * m.pitch.p) + ")" + (m.suffix || "");
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
export function layoutAutoDims(dims, views, { obstacles = [], frame = null, notes = [] } = {}) {
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
      // Koordinatenmaße teilen sich eine Reihe; ihr senkrechter Text braucht Platz wie zwei Reihen
      const ordW = Math.max(0, ...items.filter((it) => it.m.ord).map((it) => textWidth(dimLabel(it.m))));
      const ordRows = ordW ? Math.ceil((ordW + (kind === "h" ? 2 : 2 - TEXT_H)) / ROW_STEP) + 1 : 0;
      const rowsOf = (list) => (list.some((it) => it.m.ord) ? ordRows : 0) + list.filter((it) => !it.m.ord).length;
      const band = (list, side) => {
        const lo = Math.min(...list.map((it) => Math.min(it.A[1 - c], it.B[1 - c])));
        const hi = Math.max(...list.map((it) => Math.max(it.A[1 - c], it.B[1 - c])));
        const depth = ROW_FIRST + ROW_STEP * (rowsOf(list) - 1) + TEXT_H;
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
        const grp = sides[s].sort((a, b) => (b.m.ord ? 1 : 0) - (a.m.ord ? 1 : 0) || a.len - b.len);
        const first = grp.some((it) => it.m.ord) ? ordRows : 0;
        let k = 0;
        grp.forEach((it) => {
          const dist = it.m.ord ? ROW_FIRST : ROW_FIRST + ROW_STEP * (first + k++);
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
  // Hinweise (z. B. Profilangabe) unter, sonst über der Ansicht an die erste freie Stelle
  for (const n of notes) {
    const v = views[n.view];
    if (!v) continue;
    const w = textWidth(n.text), R = v.rect;
    let spot = null;
    for (let k = 0; k < 40 && !spot; k++) {
      for (const y of [R[3] + 7 + 3 * k, R[1] - 3 - 3 * k]) {
        const box = [R[0], y - TEXT_H, R[0] + w, y + 1];
        if (cost(box, n.view) + overlap(box, R) < 1e-6) { spot = box; break; }
      }
    }
    if (!spot) spot = [R[0], R[3] + 7 - TEXT_H, R[0] + w, R[3] + 8];
    n.x = spot[0];
    n.y = spot[1] + TEXT_H;
    placed.push(spot);
  }
  return dims;
}

// ---------- Ansichtswahl ----------
/**
 * Zeigt eine Ansicht etwas, das die anderen nicht zeigen? Nein, wenn sie nur aus achsparallelen Kanten über die
 * ganze Breite oder Höhe besteht (Rechteck, Streifen, Tangentenkanten) und keine Kreise hat – oder, bei einem
 * Profilteil, nur den Querschnitt zeigt, der schon in der Profilangabe steht.
 */
export function viewHasInfo(p, { endView = false } = {}) {
  const b = p?.bbox;
  if (!b) return false;
  const w = b.x1 - b.x0, h = b.y1 - b.y0, tol = 1e-3;
  const circles = uniqueCircles([...(p.arcs || []), ...circlesFromLines(p.visible, 0.5 * Math.max(w, h))]);
  const rim = (c) => c.cx - c.r <= b.x0 + tol || c.cx + c.r >= b.x1 - tol || c.cy - c.r <= b.y0 + tol || c.cy + c.r >= b.y1 - tol;
  const rims = circles.filter(rim);
  const inner = circles.filter((c) => !rims.some((o) => Math.abs(o.cx - c.cx) < tol && Math.abs(o.cy - c.cy) < tol));
  if (endView) return inner.length > 0;
  if (circles.length) return true;
  if ((p.arcs || []).length) return true; // Rundungen, Bögen
  for (const pl of p.visible || []) for (let i = 0; i + 1 < pl.length; i++) {
    const [a, c] = [pl[i], pl[i + 1]];
    const vert = Math.abs(a[0] - c[0]) < tol, hor = Math.abs(a[1] - c[1]) < tol;
    if (vert && Math.abs(Math.abs(c[1] - a[1]) - h) < tol) continue;
    if (hor && Math.abs(Math.abs(c[0] - a[0]) - w) < tol) continue;
    if (Math.hypot(c[0] - a[0], c[1] - a[1]) < tol) continue;
    // Stücke einer langen geraden Kante (Polylinie mit Zwischenpunkten) liegen auf dem Umriss
    if (vert && (Math.abs(a[0] - b.x0) < tol || Math.abs(a[0] - b.x1) < tol)) continue;
    if (hor && (Math.abs(a[1] - b.y0) < tol || Math.abs(a[1] - b.y1) < tol)) continue;
    return true;
  }
  return false;
}

/**
 * Nötige Grundansichten nach DIN ISO 128-30: so wenige wie möglich, so viele wie nötig.
 * proj: { front, top, left } Projektionen; axes: { front: [r, o], … }; profile: Ergebnis von profileSpec
 * Rückgabe: Liste der Ansichtstypen, Vorderansicht immer dabei
 */
export function chooseViews(proj, axes, profile = null) {
  const isEnd = (t) => !!profile && (axes[t] || []).every((a) => a && profile.cross.includes(a));
  const info = (t) => viewHasInfo(proj[t], { endView: isEnd(t) });
  const out = ["front"];
  const covered = new Set(axes.front || []);
  if (profile) for (const a of profile.cross) covered.add(a);
  for (const t of ["top", "left"]) if (proj[t]?.bbox && info(t)) { out.push(t); for (const a of axes[t] || []) covered.add(a); }
  // jede Raumrichtung muss in einer Ansicht bemaßt werden können
  for (const t of ["top", "left"]) {
    if (out.includes(t) || !proj[t]?.bbox) continue;
    if ((axes[t] || []).some((a) => a && !covered.has(a))) { out.push(t); for (const a of axes[t]) covered.add(a); }
  }
  return out;
}
