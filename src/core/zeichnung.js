// Zeichnungswerkzeuge ohne Oberfläche: Bohrungstabelle, Hilfsansicht, Hinweise mit Hinweislinie, Änderungsindex
import { holeText } from "./autodims.js";

const fmt = (v, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ",").replace(/^-/, "−");
const letterOf = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

/**
 * Bohrungstabelle einer Ansicht (wie Inventor »Bohrungstabelle«): je Ø ein Kennbuchstabe, je Bohrung eine Zeile mit Lage.
 * circles: volle Kreise der Projektion {cx, cy, r}; specs: holeSpecs() der Quelle ({r, hole}); origin: [u, v] Nullpunkt.
 * Gewindebohrungen erscheinen in der Ansicht mit dem Kernloch-Ø: die Angabe kommt aus dem Bohrungs-Feature.
 * Rückgabe { groups: [{tag, desc, r, count}], rows: [{tag, cx, cy, x, y, desc}] }, Zeilen je Gruppe nach x, dann y.
 */
export function holeTable(circles, specs = [], origin = [0, 0], { tol = 1e-3 } = {}) {
  const uniq = [];
  for (const c of circles || []) {
    if (!(c.r > 0)) continue;
    if (uniq.some((u) => Math.hypot(u.cx - c.cx, u.cy - c.cy) < tol && Math.abs(u.r - c.r) < tol)) continue;
    // konzentrische Kreise (Senkung, Kernloch und Gewinde-Außen-Ø): der kleinste zählt
    const same = uniq.findIndex((u) => Math.hypot(u.cx - c.cx, u.cy - c.cy) < tol);
    if (same >= 0) { if (c.r < uniq[same].r) uniq[same] = c; continue; }
    uniq.push(c);
  }
  const radii = [...new Set(uniq.map((c) => Math.round(c.r / tol) * tol))].sort((a, b) => a - b);
  const groups = [], rows = [];
  radii.forEach((r, gi) => {
    const tag = letterOf(gi);
    const list = uniq.filter((c) => Math.abs(c.r - r) < tol * 1.5).sort((a, b) => a.cx - b.cx || b.cy - a.cy);
    const desc = specText(specs, r) || "Ø" + fmt(r * 2);
    groups.push({ tag, desc, r, count: list.length });
    list.forEach((c, i) => rows.push({ tag: tag + (i + 1), group: tag, cx: c.cx, cy: c.cy, x: c.cx - origin[0], y: c.cy - origin[1], desc }));
  });
  return { groups, rows };
}

/** Angabe aus den Bohrungs-Features für Radius r, nur wenn alle passenden Features gleich lauten (sonst null → nur Ø) */
function specText(specs, r, n) {
  const texts = [...new Set(specs.filter((s) => Math.abs(s.r - r) < 0.05).map((s) => holeText(s.hole, n)))];
  return texts.length === 1 ? texts[0] : null;
}

/**
 * Nur Kreise, die im Modell Bohrungen sind (Zylinderfläche innen, Achse in Blickrichtung): holes = Mittelpunkte in
 * Ansichtskoordinaten [{c: [u, v]}]. Ohne Angaben (holes == null) bleiben alle Kreise.
 */
export function holeCircles(circles, holes, tol = 0.05) {
  if (!holes) return circles || [];
  return (circles || []).filter((c) => holes.some((h) => Math.hypot(h.c[0] - c.cx, h.c[1] - c.cy) < tol));
}

/** Zellen der Bohrungstabelle als Text (Kopfzeile + Zeilen) */
export function holeTableCells(table, decimals = 1) {
  return [["Pos.", "X", "Y", "Bohrung"], ...table.rows.map((r) => [r.tag, fmt(r.x, decimals), fmt(r.y, decimals), r.desc])];
}

/** Nächstes Kantenstück einer Projektion an Punkt q (Ansichtskoordinaten) → {a, b, dist} | null */
export function nearestSegment(polylines, q, maxDist = Infinity) {
  let best = null;
  for (const pl of polylines || []) {
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      if (L2 < 1e-12) continue;
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
      const d = Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
      if (d < maxDist && (!best || d < best.dist)) best = { a, b, dist: d };
    }
  }
  return best;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

/**
 * Hilfsansicht (ISO 128-30, »Ansicht in Pfeilrichtung«) senkrecht auf eine Fläche, die in der Elternansicht als Kante erscheint.
 * cam: Kamera der Elternansicht {dir, up}; a, b: Endpunkte der Kante (Ansichtskoordinaten); center: Mitte der Ansicht.
 * Die Blickrichtung zeigt von außen auf die Fläche (von der Ansichtsmitte weg gesehen). Rückgabe {dir, up, normal2d} oder null (Kante achsparallel).
 */
export function auxiliaryCamera(cam, a, b, center) {
  const e = norm([b[0] - a[0], b[1] - a[1]]);
  // achsparallele Kanten zeigen Flächen, die eine Normalansicht schon in wahrer Größe zeigt
  if (Math.abs(e[0]) > 1 - 1e-6 || Math.abs(e[1]) > 1 - 1e-6) return null;
  let n = [-e[1], e[0]];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if ((mid[0] - center[0]) * n[0] + (mid[1] - center[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const dir = norm(cam.dir), up = norm(cam.up), right = norm(cross(dir, up));
  const N = norm(right.map((x, i) => x * n[0] + up[i] * n[1]));
  // Kante bleibt auf dem Blatt in ihrer Richtung: neue »oben«-Richtung = Kantenrichtung, nach oben weisend
  let E = right.map((x, i) => x * e[0] + up[i] * e[1]);
  if (e[1] < 0) E = E.map((x) => -x);
  return { dir: N.map((x) => -x), up: norm(E), normal2d: n };
}

/**
 * Textvorschlag für einen Hinweis an der geklickten Stelle (Gewinde-, Bohrungs- oder Fasennotiz wie Inventor »Bohrungs-/Gewindehinweis«, »Fasenhinweis«).
 * q: Klickpunkt (Ansichtskoordinaten); circles: Kreise der Ansicht; lines: sichtbare Kanten; specs: holeSpecs; chamfers: Fasenabstände in mm.
 */
export function noteSuggestion(q, { circles = [], lines = [], specs = [], chamfers = [], pick = 1.5 } = {}) {
  const c = circles.filter((k) => Math.abs(Math.hypot(q[0] - k.cx, q[1] - k.cy) - k.r) < pick || Math.hypot(q[0] - k.cx, q[1] - k.cy) < Math.min(k.r, pick))
    .sort((x, y) => x.r - y.r)[0];
  if (c) {
    const n = circles.filter((k) => Math.abs(k.r - c.r) < 1e-3).length;
    return { kind: "bohrung", text: specText(specs, c.r, n) || (n > 1 ? n + "× " : "") + "Ø" + fmt(c.r * 2) };
  }
  const s = nearestSegment(lines, q, pick);
  if (s && chamfers.length) {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy);
    const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    const ch = chamfers.find((x) => Math.abs(L - x * Math.SQRT2) < 0.05 * x + 0.01);
    if (Math.abs(ang - 45) < 0.5 && ch) return { kind: "fase", text: fmt(ch) + " × 45°" };
  }
  return { kind: "frei", text: "" };
}

/** Nächster Änderungsindex nach DIN EN ISO 7200 (A, B, … Z, AA …); current: Index im Schriftfeld, solange die Tabelle leer ist */
export function nextRevision(list = [], current = "") {
  const used = list.map((r) => String(r.rev || "").trim().toUpperCase());
  if (!list.length && current) used.push(String(current).trim().toUpperCase()); // erste Änderung folgt auf den Index im Schriftfeld
  // auf den höchsten vergebenen Buchstaben folgen (nie rückwärts, auch wenn vorne einer fehlt)
  let top = -1;
  for (let i = 0; i < 702; i++) if (used.includes(letterOf(i))) top = i;
  return top + 1 < 702 ? letterOf(top + 1) : "?";
}

/** Änderungszeile prüfen → {ok, value} | {ok:false, error} */
export function validateRevision(r) {
  const rev = String(r?.rev ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/.test(rev)) return { ok: false, error: "Index als Buchstabe oder Zahl (z. B. B)" };
  const text = String(r?.text ?? "").trim();
  if (!text) return { ok: false, error: "Änderung beschreiben" };
  return { ok: true, value: { rev, datum: String(r?.datum ?? "").trim(), text: text.slice(0, 120), name: String(r?.name ?? "").trim().slice(0, 30) } };
}

/** Aktueller Index für das Schriftfeld: letzte Zeile der Änderungstabelle, sonst der eingetragene */
export const currentRevision = (d) => (d?.revisions?.length ? d.revisions[d.revisions.length - 1].rev : d?.title?.revision || "");
