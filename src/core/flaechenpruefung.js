// Flächen prüfen (SolidCraft-Abgleich E4): Krümmung am Anzeigenetz, Farbskala, Zugänglichkeit aus einer Richtung,
// Einteilung der Kantenstetigkeit. Reine Rechnung auf Netzen (Float32Array), ohne three.js und Kern.

/** Prüfungen im Menü »Flächen prüfen«: [Kennung, Name, Hilfe] */
export const SURFACE_CHECKS = [
  ["zebra", "Zebrastreifen", "Spiegelnde Streifen: Knicke in den Streifen zeigen Knicke in der Fläche, Sprünge in der Streifenbreite Krümmungssprünge."],
  ["umgebung", "Umgebungskarte", "Hochglanz-Spiegelung eines Raums: Dellen und Wellen fallen sofort auf."],
  ["kruemmung", "Krümmungskarte", "Blau eben, Grün schwach, Gelb stark, Rot: Radius unter dem Mindestradius."],
  ["kamm", "Krümmungskamm", "Kämme an allen gekrümmten Kanten: Zahnlänge = Krümmung. Gleichmäßige Hülle heißt glatter Verlauf."],
  ["isokurven", "Isokurven", "Parameterlinien der gekrümmten Flächen (u und v)."],
  ["silhouette", "Silhouette", "Umrisskanten in der aktuellen Blickrichtung, Flächen weiß."],
  ["stetigkeit", "Kantenstetigkeit", "Grün tangential (G1), Rot Knick, Grau Randkante."],
  ["zugang", "Zugänglichkeit", "Grün erreichbar aus der Richtung, Rot verdeckt, Grau abgewandt (Werkzeug, Strahl, Brenner)."],
];

/**
 * Krümmung je Netzpunkt: größter Wert über die Nachbarn von Winkel(n_i, n_j) / |p_i − p_j| (1/mm, ≈ größte Hauptkrümmung). Netze aus dem Kern haben je
 * Fläche eigene Punkte, Kanten zwischen Flächen verfälschen den Wert daher nicht.
 */
export function vertexCurvature(positions, normals, indices) {
  const n = positions.length / 3, out = new Float32Array(n);
  const add = (a, b) => {
    const dx = positions[3 * a] - positions[3 * b], dy = positions[3 * a + 1] - positions[3 * b + 1], dz = positions[3 * a + 2] - positions[3 * b + 2];
    const d = Math.hypot(dx, dy, dz);
    if (!(d > 1e-9)) return;
    const c = normals[3 * a] * normals[3 * b] + normals[3 * a + 1] * normals[3 * b + 1] + normals[3 * a + 2] * normals[3 * b + 2];
    const k = Math.acos(Math.max(-1, Math.min(1, c))) / d;
    if (k > out[a]) out[a] = k;
    if (k > out[b]) out[b] = k;
  };
  for (let t = 0; t < indices.length; t += 3) { const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]]; add(a, b); add(b, c); add(c, a); }
  return out;
}

/** Kleinster Krümmungsradius (mm) aus den Punktkrümmungen; ebene Netze → Infinity */
export function minRadiusOf(curv, { eps = 1e-5 } = {}) {
  let k = 0;
  for (const x of curv) if (x > k) k = x;
  return k > eps ? 1 / k : Infinity;
}

/** Farbskala Blau (eben) → Grün → Gelb → Rot (Radius ≤ rMin); logarithmisch zwischen rMax und rMin */
export function curvatureColor(k, { rMin = 2, rMax = 500 } = {}) {
  if (!(k > 1 / rMax)) return [0.2, 0.35, 0.85];
  const t = Math.min(1, Math.log(k * rMax) / Math.log(rMax / rMin));
  const stops = [[0.2, 0.35, 0.85], [0.15, 0.7, 0.35], [0.95, 0.8, 0.15], [0.85, 0.15, 0.12]];
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, j) => v + (stops[i + 1][j] - v) * f);
}

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Zugänglichkeit aus Richtung dir (Werkzeug, Sprühstrahl, Schweißbrenner): ein Punkt ist erreichbar, wenn seine Normale
 * zur Richtung zeigt und der Strahl vom Punkt in Richtung dir kein Dreieck trifft. meshes = [{ positions, normals, indices }]
 * in gemeinsamen Koordinaten. Rückgabe je Netz Uint8Array (1 = erreichbar, 0 = verdeckt, 2 = abgewandt) und Flächenanteile.
 */
export function accessibility(meshes, dir, { cells = 64 } = {}) {
  const d = norm(dir), u = norm(Math.abs(d[0]) < 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0])), w = cross(d, u);
  // alle Dreiecke in die Ebene ⟂ dir projizieren und in ein Raster einsortieren
  const tris = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  meshes.forEach((m, mi) => {
    for (let t = 0; t < m.indices.length; t += 3) {
      const P = [0, 1, 2].map((k) => { const i = m.indices[t + k] * 3; return [m.positions[i], m.positions[i + 1], m.positions[i + 2]]; });
      const Q = P.map((p) => [dot(p, u), dot(p, w), dot(p, d)]);
      for (const q of Q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      tris.push({ P, Q, mi, t });
    }
  });
  const sx = (x1 - x0) / cells || 1, sy = (y1 - y0) / cells || 1;
  const cell = (x, y) => [Math.min(cells - 1, Math.max(0, Math.floor((x - x0) / sx))), Math.min(cells - 1, Math.max(0, Math.floor((y - y0) / sy)))];
  const grid = Array.from({ length: cells * cells }, () => []);
  tris.forEach((tr, k) => {
    const [ax, ay] = cell(Math.min(...tr.Q.map((q) => q[0])), Math.min(...tr.Q.map((q) => q[1])));
    const [bx, by] = cell(Math.max(...tr.Q.map((q) => q[0])), Math.max(...tr.Q.map((q) => q[1])));
    for (let i = ax; i <= bx; i++) for (let j = ay; j <= by; j++) grid[i * cells + j].push(k);
  });
  // Strahl p + s·d (s > eps) gegen Dreieck (Möller–Trumbore)
  const hit = (p, tr) => {
    const [a, b, c] = tr.P, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const pv = cross(d, e2), det = dot(e1, pv);
    if (Math.abs(det) < 1e-12) return false;
    const tv = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], uu = dot(tv, pv) / det;
    if (uu < 0 || uu > 1) return false;
    const qv = cross(tv, e1), vv = dot(d, qv) / det;
    if (vv < 0 || uu + vv > 1) return false;
    return dot(e2, qv) / det > 1e-3;
  };
  let area = { frei: 0, verdeckt: 0, abgewandt: 0 };
  const res = meshes.map((m) => {
    const n = m.positions.length / 3, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const nr = [m.normals[3 * i], m.normals[3 * i + 1], m.normals[3 * i + 2]];
      if (dot(nr, d) <= 1e-6) { out[i] = 2; continue; }
      const p = [m.positions[3 * i] + nr[0] * 1e-3, m.positions[3 * i + 1] + nr[1] * 1e-3, m.positions[3 * i + 2] + nr[2] * 1e-3];
      const [cx, cy] = cell(dot(p, u), dot(p, w));
      out[i] = grid[cx * cells + cy].some((k) => hit(p, tris[k])) ? 0 : 1;
    }
    return out;
  });
  // Flächenanteile über die Dreiecke (Mehrheit der Eckpunkte)
  for (const tr of tris) {
    const v = res[tr.mi], idx = meshes[tr.mi].indices, s = [v[idx[tr.t]], v[idx[tr.t + 1]], v[idx[tr.t + 2]]];
    const [a, b, c] = tr.P, A = Math.hypot(...cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])) / 2;
    const cls = [0, 1, 2].map((k) => s.filter((x) => x === k).length);
    const best = cls.indexOf(Math.max(...cls));
    area[["verdeckt", "frei", "abgewandt"][best]] += A;
  }
  return { vis: res, area };
}

/** Kantenstetigkeit aus dem Winkel der Flächennormalen an der Kante (°): Knick, tangential (G1) */
export function continuityClass(angleDeg, { tol = 1 } = {}) {
  if (!Number.isFinite(angleDeg)) return { cls: "rand", label: "Randkante", color: [0.55, 0.55, 0.6] };
  return angleDeg <= tol ? { cls: "g1", label: "tangential (G1)", color: [0.15, 0.7, 0.35] } : { cls: "knick", label: `Knick ${angleDeg.toFixed(1).replace(".", ",")}°`, color: [0.85, 0.15, 0.12] };
}

/**
 * Krümmungskamm einer Kurve (Punktfolge): je innerem Punkt ein Zahn in Richtung Krümmungsmitte, Länge = Krümmung · scale.
 * Krümmung aus dem Umkreis dreier Nachbarpunkte. Rückgabe { teeth: [[p, q]], envelope: [q…], kMax }
 */
export function curvatureComb(pts, { scale = null, closed = false } = {}) {
  const n = pts.length, sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(...a);
  const raw = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i - 1] ?? (closed ? pts[n - 2] : null), b = pts[i], c = pts[i + 1] ?? (closed ? pts[1] : null);
    if (!a || !c) continue;
    const ab = sub(b, a), cb = sub(b, c), ac = sub(c, a), cr = cross(ab, ac), A2 = len(cr);
    const la = len(ab), lb = len(cb), lc = len(ac);
    if (!(la > 1e-9 && lb > 1e-9 && lc > 1e-9)) continue;
    const k = (2 * A2) / (la * lb * lc);
    // Richtung zur Krümmungsmitte: Lot von b auf die Sehne a–c, bei gerader Kurve beliebig (k = 0)
    const m = [(a[0] + c[0]) / 2 - b[0], (a[1] + c[1]) / 2 - b[1], (a[2] + c[2]) / 2 - b[2]], lm = len(m);
    raw.push({ p: b, k, d: lm > 1e-12 ? m.map((x) => x / lm) : [0, 0, 0] });
  }
  const kMax = raw.reduce((x, r) => Math.max(x, r.k), 0);
  const total = pts.slice(1).reduce((s, p, i) => s + len(sub(p, pts[i])), 0);
  const sc = scale ?? (kMax > 0 ? (0.15 * total) / kMax : 0);
  // Zähne zeigen nach außen (vom Krümmungsmittelpunkt weg), wie üblich bei Krümmungskämmen
  const teeth = raw.map((r) => [r.p, [r.p[0] - r.d[0] * r.k * sc, r.p[1] - r.d[1] * r.k * sc, r.p[2] - r.d[2] * r.k * sc]]);
  return { teeth, envelope: teeth.map((t) => t[1]), kMax };
}
