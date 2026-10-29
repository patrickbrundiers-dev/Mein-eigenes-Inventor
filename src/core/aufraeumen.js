// Zeichnung aufräumen (N7, W19): Winkelmaße an schrägen Kanten (Profil an Blech, Kopfband an Stütze), doppelte Maße
// finden und Verwaistes entfernen. Ohne DOM; die Zeichnung (src/ui/drawing.js) wendet das Ergebnis an.

const DEG = Math.PI / 180;
const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

/** Winkel eines Winkelmaßes in Grad (0 … 180) */
export function angleValue(m) {
  const a = [m.p1[0] - m.c[0], m.p1[1] - m.c[1]], b = [m.p2[0] - m.c[0], m.p2[1] - m.c[1]];
  const c = (a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
export const angleLabel = (m) => (m.count > 1 ? m.count + "× " : "") + fmt(angleValue(m)) + "°";

/**
 * Winkelmaße einer Ansicht: Ecken, an denen sich zwei sichtbare Kanten schräg treffen (nicht 90°/180°). Je Winkelwert
 * nur ein Maß in der ganzen Zeichnung (used.angles); gemessen wird der kleinere Winkel zwischen den Kanten, an der
 * Ecke mit den längsten Schenkeln. lines: Linienzüge der Ansicht [[x, y], …].
 */
export function angleDims(view, used = {}, { minLeg = null } = {}) {
  const done = used.angles || (used.angles = new Set());
  const b = view.bbox, size = b ? Math.max(b.x1 - b.x0, b.y1 - b.y0) : 0;
  const leg0 = minLeg ?? 0.04 * size;
  // Kantenstücke sammeln, gleiche Endpunkte zusammenfassen
  const segs = [];
  for (const pl of view.lines || []) for (let i = 0; i + 1 < pl.length; i++) {
    const p = pl[i], q = pl[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L > leg0) segs.push({ p, q, L, d: [(q[0] - p[0]) / L, (q[1] - p[1]) / L] });
  }
  const tol = 1e-3 * Math.max(1, size);
  const same = (a, c) => Math.abs(a[0] - c[0]) < tol && Math.abs(a[1] - c[1]) < tol;
  const best = new Map(); // Winkel (0,5°) → Kandidat
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i], t = segs[j];
    // gemeinsamer Endpunkt; Schenkel zeigen von der Ecke weg
    let c = null, u = null, w = null;
    for (const [e, o, de] of [[s.p, s.q, s.d], [s.q, s.p, [-s.d[0], -s.d[1]]]]) for (const [f, g, df] of [[t.p, t.q, t.d], [t.q, t.p, [-t.d[0], -t.d[1]]]]) {
      if (!c && same(e, f)) { c = e; u = { end: o, d: de }; w = { end: g, d: df }; }
    }
    // T-Stoß: Endpunkt der einen Kante liegt innen auf der anderen (Kopfband an Stütze) → spitzer Winkel zur anderen
    if (!c) for (const [x, y] of [[s, t], [t, s]]) for (const [e, o, de] of [[x.p, x.q, x.d], [x.q, x.p, [-x.d[0], -x.d[1]]]]) {
      if (c) break;
      const r = (e[0] - y.p[0]) * y.d[0] + (e[1] - y.p[1]) * y.d[1], dist = Math.abs((e[0] - y.p[0]) * y.d[1] - (e[1] - y.p[1]) * y.d[0]);
      if (dist > tol || r < tol || r > y.L - tol) continue;
      const dot = de[0] * y.d[0] + de[1] * y.d[1], dy = dot >= 0 ? y.d : [-y.d[0], -y.d[1]];
      c = e; u = { end: o, d: de }; w = { end: null, d: dy };
    }
    if (!c) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, u.d[0] * w.d[0] + u.d[1] * w.d[1]))) / DEG;
    if (ang < 5 || ang > 175 || Math.abs(ang - 90) < 0.5) continue;
    // nur, wenn mindestens eine Kante schräg liegt (sonst ist es eine gewöhnliche Fase/Ecke im Raster)
    const axial = (d) => Math.abs(d[0]) > 1 - 1e-6 || Math.abs(d[1]) > 1 - 1e-6;
    if (axial(u.d) && axial(w.d)) continue;
    const a = Math.min(ang, 180 - ang), k = Math.round(a * 2);
    if (done.has(k)) continue;
    if (k === 90 && (used.chamfers || []).length) continue; // 45°-Kanten der Fasen stehen im Fasenhinweis
    const legs = Math.min(s.L, t.L);
    if (!best.has(k) || legs > best.get(k).legs) best.set(k, { c, u, w, legs, ang });
  }
  const out = [];
  for (const [k, x] of best) {
    done.add(k);
    // Schenkelpunkte in 60 % der kürzeren Kante; Spitzwinkel direkt, stumpfe Ecke: den Nebenwinkel an der Verlängerung
    const r = 0.6 * x.legs;
    const P1 = [x.c[0] + x.u.d[0] * r, x.c[1] + x.u.d[1] * r];
    const P2 = x.ang <= 90 ? [x.c[0] + x.w.d[0] * r, x.c[1] + x.w.d[1] * r] : [x.c[0] - x.w.d[0] * r, x.c[1] - x.w.d[1] * r];
    out.push({ view: view.id, kind: "ang", c: x.c, p1: P1, p2: P2, off: 12 });
  }
  return out;
}

/** Achse eines Längenmaßes in Weltrichtung (h: rechts, v: oben der Ansicht) oder null */
const axisOf = (m, views) => { const v = views[m.view]; return v?.axes ? v.axes[m.kind === "h" ? 0 : 1] : null; };
const k3 = (x) => Math.round(x * 100);

/**
 * Doppelte Maße (DIN 406: jedes Maß nur einmal): Rückgabe der ids, die entfallen können. Behalten wird jeweils das
 * erste (Reihenfolge der Liste). Gleich sind
 *  – Längenmaße in derselben Weltrichtung mit gleichem Wert und gleicher Lage entlang dieser Richtung (Koordinaten
 *    der Ansichten sind Projektionen, gleiche Kante → gleicher Betrag) bzw. gleiche Punkte in derselben Ansicht,
 *  – Durchmesser/Radien gleicher Größe mit gleicher Angabe (Bohrung, Anzahl),
 *  – Winkelmaße mit gleichem Winkel.
 * views: { [id]: { axes: ["X" | "Y" | "Z" | null, …] } }
 */
export function duplicateDims(dims, views = {}) {
  const seen = new Set(), drop = [];
  for (const m of dims) {
    let key = null;
    if ((m.kind === "h" || m.kind === "v") && m.p1 && m.p2 && !m.ord && !m.wall) {
      const c = m.kind === "h" ? 0 : 1, lo = Math.min(m.p1[c], m.p2[c]), hi = Math.max(m.p1[c], m.p2[c]);
      const ax = axisOf(m, views);
      // Lage über Beträge (gespiegelte Ansicht: Vorzeichen dreht sich)
      const where = [Math.abs(lo), Math.abs(hi)].sort((x, y) => x - y).map(k3).join(",");
      key = ax ? `L|${ax}|${k3(hi - lo)}|${where}${m.pitch ? "|p" + m.pitch.n : ""}` : `L|${m.view}|${m.kind}|${k3(hi - lo)}|${k3(lo)}|${k3(m.p1[1 - c])}`;
    } else if ((m.kind === "dia" || m.kind === "rad") && m.circle) {
      key = `${m.kind}|${k3(m.circle.r)}|${m.hole ? JSON.stringify(m.hole) : ""}|${m.pcd ? "pcd" + m.pcd.n : ""}`;
    } else if (m.kind === "ang" && m.c) key = `A|${Math.round(Math.min(angleValue(m), 180 - angleValue(m)) * 2)}`;
    if (!key) continue;
    if (seen.has(key)) drop.push(m.id); else seen.add(key);
  }
  return drop;
}

/**
 * Aufräumen: doppelte Maße, Maße/Hinweise/Positionsnummern ohne Ansicht. Rückgabe { dims, leaders, balloons, removed }
 * (neue Listen); viewIds: vorhandene Ansichten.
 */
export function cleanupDrawing(d, views, viewIds) {
  const ok = (x) => viewIds.has(x.view);
  const orphan = (d.dims || []).filter((m) => !ok(m)).length + (d.leaders || []).filter((x) => !ok(x)).length + (d.balloons || []).filter((x) => !ok(x)).length;
  const dims0 = (d.dims || []).filter(ok);
  // Hand gesetzte Maße zuerst behalten, automatische fallen bei Gleichheit weg
  const ordered = [...dims0.filter((m) => !m.auto), ...dims0.filter((m) => m.auto)];
  const drop = new Set(duplicateDims(ordered, views));
  return {
    dims: dims0.filter((m) => !drop.has(m.id)),
    leaders: (d.leaders || []).filter(ok),
    balloons: (d.balloons || []).filter(ok),
    removed: { duplicates: drop.size, orphans: orphan },
  };
}

/**
 * Winkelmaß von Hand aus zwei Kanten (Segmente {a, b}) und den Klickpunkten q1, q2: Scheitel im Schnittpunkt der
 * Geraden, Schenkelpunkte auf der Seite des jeweiligen Klicks. null bei parallelen Kanten.
 */
export function angleFromSegments(s1, q1, s2, q2) {
  const d1 = [s1.b[0] - s1.a[0], s1.b[1] - s1.a[1]], d2 = [s2.b[0] - s2.a[0], s2.b[1] - s2.a[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9 * Math.hypot(...d1) * Math.hypot(...d2)) return null;
  const w = [s2.a[0] - s1.a[0], s2.a[1] - s1.a[1]], t = (w[0] * d2[1] - w[1] * d2[0]) / den;
  const c = [s1.a[0] + d1[0] * t, s1.a[1] + d1[1] * t];
  const leg = (d, q) => { const L = Math.hypot(...d), u = [d[0] / L, d[1] / L], s = (q[0] - c[0]) * u[0] + (q[1] - c[1]) * u[1]; const k = Math.abs(s) > 1e-9 ? s : L / 2; return [c[0] + u[0] * k, c[1] + u[1] * k]; };
  return { c, p1: leg(d1, q1), p2: leg(d2, q2) };
}
