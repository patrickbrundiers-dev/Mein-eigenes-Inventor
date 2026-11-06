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
export function noteSuggestion(q, { circles = [], arcs = [], lines = [], specs = [], chamfers = [], pick = 1.5 } = {}) {
  const c = circles.filter((k) => Math.abs(Math.hypot(q[0] - k.cx, q[1] - k.cy) - k.r) < pick || Math.hypot(q[0] - k.cx, q[1] - k.cy) < Math.min(k.r, pick))
    .sort((x, y) => x.r - y.r)[0];
  if (c) {
    const n = circles.filter((k) => Math.abs(k.r - c.r) < 1e-3).length;
    return { kind: "bohrung", text: specText(specs, c.r, n) || (n > 1 ? n + "× " : "") + "Ø" + fmt(c.r * 2) };
  }
  // Langloch (O10): Halbkreis am Ende eines Langlochs, Radius = halbe Breite eines Langloch-Features
  const slots = specs.filter((s) => s.hole.slot > 0);
  const a = slots.length && arcs.filter((k) => !k.full && slots.some((s) => Math.abs(s.r - k.r) < 0.05) && Math.abs(Math.hypot(q[0] - k.cx, q[1] - k.cy) - k.r) < pick)[0];
  if (a) {
    const n = Math.max(1, Math.round(arcs.filter((k) => !k.full && Math.abs(k.r - a.r) < 1e-3).length / 2));
    const t = [...new Set(slots.filter((s) => Math.abs(s.r - a.r) < 0.05).map((s) => holeText(s.hole, n)))];
    return { kind: "bohrung", text: t.length === 1 ? t[0] : `${n > 1 ? n + "× " : ""}Langloch Breite ${fmt(a.r * 2)}` };
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

/**
 * Schraffur je Teil im Schnitt (DIN ISO 128-50): angrenzende Teile wechseln die Richtung, danach den Abstand.
 * i: laufende Nummer des geschnittenen Teils → {angle (Grad), gap (mm auf dem Blatt)}
 */
export const HATCH_STYLES = [{ angle: 45, gap: 2.5 }, { angle: 135, gap: 2.5 }, { angle: 45, gap: 4 }, { angle: 135, gap: 4 }, { angle: 60, gap: 3 }, { angle: 120, gap: 3 }];
export const hatchStyle = (i) => HATCH_STYLES[((i % HATCH_STYLES.length) + HATCH_STYLES.length) % HATCH_STYLES.length];

/**
 * Mittellinien an Zylinderachsen (Bohrungen, Rohre, Bolzen von der Seite gesehen, wie Inventor »Automatische Mittellinien«):
 * axes: Strecken [[a, b]] in Ansichtskoordinaten (mm am Modell); die Linie ragt ext mm auf dem Blatt über die Kontur hinaus.
 */
export function axisLines(axes, scale, ext = 2) {
  const out = [];
  for (const [a, b] of axes || []) {
    const ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy);
    if (!(L > 1e-9)) continue;
    const e = ext / (scale || 1), dx = (ux / L) * e, dy = (uy / L) * e;
    out.push([[a[0] - dx, a[1] - dy], [b[0] + dx, b[1] + dy]]);
  }
  return out;
}

/**
 * Feldeinteilung des Blattrahmens nach DIN EN ISO 5457: Felder 50 mm, von den Mittenmarken aus gezählt; Ziffern von links,
 * Großbuchstaben von oben (ohne I und O). frame = Zeichenfläche {x0, y0, x1, y1}; Rückgabe {cols, rows, band}, je Feld
 * {a, b, label} (Grenzen auf der Achse).
 */
export function sheetZones(W, H, frame = { x0: 20, y0: 10, x1: W - 10, y1: H - 10 }, size = 50) {
  const split = (lo, hi, mid) => {
    const cuts = [lo];
    const k = Math.ceil((mid - lo) / size - 1e-9);
    for (let i = k - 1; i >= 1; i--) cuts.push(mid - i * size);
    cuts.push(mid);
    const m = Math.ceil((hi - mid) / size - 1e-9);
    for (let i = 1; i < m; i++) cuts.push(mid + i * size);
    cuts.push(hi);
    // Randfelder unter 10 mm dem Nachbarfeld zuschlagen
    for (let i = 1; i + 1 < cuts.length;) {
      if (cuts[i] - cuts[i - 1] < 10 || (i === cuts.length - 2 && cuts[i + 1] - cuts[i] < 10)) { if (cuts[i] === mid) { i++; continue; } cuts.splice(i, 1); } else i++;
    }
    return cuts.slice(1).map((b, i) => ({ a: cuts[i], b }));
  };
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const cols = split(frame.x0, frame.x1, W / 2).map((z, i) => ({ ...z, label: String(i + 1) }));
  const rows = split(frame.y0, frame.y1, H / 2).map((z, i) => ({ ...z, label: letters[i] || String(i + 1) }));
  return { cols, rows, band: 5 };
}

/**
 * Projizierte Ansicht (Inventor »Projiziert«, Projektionsmethode 1 nach DIN ISO 5456-2): aus der Kamera der Elternansicht und der
 * Lage des Klicks relativ zur Elternansicht (Blatt: x nach rechts, y nach unten). Waagerecht/senkrecht daneben → Normalansicht,
 * schräg → isometrische Ansicht von dieser Ecke. Rückgabe {dir, up, align: "x"|"y"|"free"} (align: gemeinsame Achse mit der Elternansicht).
 */
export function projectedCamera(cam, dx, dy) {
  const d = norm(cam.dir), up = norm(cam.up), right = norm(cross(d, up));
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < 1e-9 && ay < 1e-9) return null;
  const diag = Math.min(ax, ay) > 0.4 * Math.max(ax, ay);
  if (!diag && ax >= ay) {
    // rechts daneben: Ansicht von links (Methode 1), links daneben: von rechts
    return { dir: dx > 0 ? right : right.map((x) => -x), up, align: "y" };
  }
  if (!diag) {
    // darunter: Draufsicht (von oben), darüber: Untersicht
    return dy > 0 ? { dir: up.map((x) => -x), up: d, align: "x" } : { dir: up, up: d.map((x) => -x), align: "x" };
  }
  const sx = Math.sign(dx), su = -Math.sign(dy);
  const dir = norm(d.map((x, i) => x - sx * right[i] - su * up[i]));
  const k = up[0] * dir[0] + up[1] * dir[1] + up[2] * dir[2];
  return { dir, up: norm(up.map((x, i) => x - k * dir[i])), align: "free" };
}

/** Name einer Standardansicht zu Kamera {dir, up} (Schlüssel aus cams) oder null */
export function camType(cams, cam, tol = 1e-6) {
  const ortho = (d, u) => { const k = d[0] * u[0] + d[1] * u[1] + d[2] * u[2]; return norm(u.map((x, i) => x - k * d[i])); };
  const d = norm(cam.dir), u = ortho(d, cam.up);
  for (const [k, c] of Object.entries(cams)) {
    const cd = norm(c.dir), cu = ortho(cd, c.up);
    if (cd.every((x, i) => Math.abs(x - d[i]) < tol) && cu.every((x, i) => Math.abs(x - u[i]) < tol)) return k;
  }
  return null;
}

/**
 * Anordnung der Grundansichten (Vorder-, Drauf-, Seitenansicht und Isometrie) auf dem Blatt: größter Normmaßstab, bei dem der
 * Ansichtsblock in die Zeichenfläche passt; die Isometrie kommt in die freie Ecke rechts oben über dem Schriftfeld oder unter
 * den Block, mit eigenem (kleinerem) Normmaßstab. Größen in mm am Modell; sheet {W, H}; tb {w, h} Schriftfeld.
 * Rückgabe {scale, isoScale, iso: {x, y} Mitte, front: {x, y}} oder null.
 */
export function layoutBaseViews({ front, top, left, iso }, sheet, scales, { tb = { w: 180, h: 46 }, gap = 22, frame = { x0: 20, y0: 10, x1: sheet.W - 10, y1: sheet.H - 10 }, isoMin = 5, isoScales = scales } = {}) {
  const fw = front, tp = top || { w: 0, h: 0 }, lf = left || { w: 0, h: 0 };
  const m = 10; // Abstand Rahmen
  const X0 = frame.x0 + m, Y0 = frame.y0 + m, X1 = frame.x1 - m, Y1 = frame.y1 - m;
  for (const s of scales) {
    const bw = (fw.w + lf.w) * s + gap * (left ? 1 : 0), bh = (fw.h + tp.h) * s + gap * (top ? 1 : 0);
    const bx0 = X0 + gap, by0 = Y0 + gap, bx1 = bx0 + bw, by1 = by0 + bh;
    // Was rechts über das Schriftfeld (mit Stückliste) ragt, muss über dessen Oberkante enden. Spalte Vorder-/Draufsicht und
    // Seitenansicht getrennt prüfen: oft liegt nur die niedrige Seitenansicht über dem Schriftfeld.
    const tbX = frame.x1 - tb.w - m, tbTop = frame.y1 - tb.h - m;
    const fits = (x1, y1) => y1 + gap <= (x1 > tbX ? tbTop : Y1);
    const colX1 = bx0 + Math.max(fw.w, tp.w) * s;
    if (bx1 + gap > X1 || !fits(colX1, by1) || (left && !fits(bx1, by0 + lf.h * s))) continue;
    // freie Bereiche für die Isometrie: rechts neben dem Block (über dem Schriftfeld), darunter (links vom Schriftfeld) oder neben der Draufsicht
    const regions = [
      { x0: bx1 + gap, y0: Y0, x1: X1, y1: frame.y1 - tb.h - m },
      { x0: X0, y0: by1 + gap, x1: frame.x1 - tb.w - m, y1: Y1 },
      // Ecke rechts neben der Draufsicht, unter der Seitenansicht
      { x0: bx0 + fw.w * s + gap, y0: by0 + Math.max(fw.h, lf.h) * s + gap, x1: X1, y1: frame.y1 - tb.h - m },
    ].filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
    let best = null;
    if (iso) {
      for (const k of isoScales) {
        if (k > s + 1e-12) continue;
        const r = regions.find((q) => iso.w * k <= q.x1 - q.x0 && iso.h * k <= q.y1 - q.y0);
        if (r) { best = { k, r }; break; }
      }
      // Isometrie nicht kleiner als ein Fünftel des Hauptmaßstabs (isoMin), sonst lieber alles kleiner zeichnen
      if (!best || best.k < s / isoMin - 1e-12) continue;
    }
    return {
      scale: s,
      front: { x: bx0 + (fw.w * s) / 2, y: by0 + (fw.h * s) / 2 },
      isoScale: best ? best.k : null,
      iso: best ? { x: (best.r.x0 + best.r.x1) / 2, y: (best.r.y0 + best.r.y1) / 2 } : null,
    };
  }
  return null;
}

/**
 * Blattgröße für eine neue Zeichnung: das kleinste Querformat ab A3, auf dem die Stückliste über dem Schriftfeld höchstens
 * gut die Hälfte der Zeichenfläche hoch wird und die Grundansichten mit einem Normmaßstab passen. sheets {A3: [W, H], …}.
 */
export function autoSheetFormat(boxes, tbH, sheets, scales, { order = ["A3", "A2", "A1"], gap = 22 } = {}) {
  for (const f of order) {
    const [W, H] = sheets[f];
    if (tbH > 0.55 * (H - 20)) continue;
    if (layoutBaseViews(boxes, { W, H }, scales, { tb: { w: 180, h: tbH }, gap })) return f;
  }
  return order[order.length - 1];
}

/**
 * Eigener Maßstab (Inventor »Maßstab« frei eintippen): "1:25", "1 : 2,5", "3:1" oder ein Faktor ("0,04").
 * Rückgabe Faktor (Blatt-mm je Modell-mm) oder null bei ungültiger Eingabe; erlaubt 1:10000 bis 100:1.
 */
export function parseScale(text) {
  const t = String(text ?? "").trim().replace(/^M\s*/i, "").replace(/,/g, ".");
  let k;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (m) k = Number(m[1]) / Number(m[2]);
  else if (/^\d+(?:\.\d+)?$/.test(t)) k = Number(t);
  else return null;
  return Number.isFinite(k) && k >= 1e-4 - 1e-12 && k <= 100 ? k : null;
}

/**
 * Ganze gerade Kante um ein getroffenes Stück (Bemaßung per Klick auf die Kante): im selben Linienzug über
 * gleichgerichtete Nachbarstücke verlängert. Rückgabe { a, b }.
 */
export function edgeRun(polylines, seg) {
  // alle Stücke auf derselben Geraden, die sich lückenlos an das getroffene anschließen (auch aus anderen Linienzügen:
  // die verdeckte Kantenrechnung teilt Kanten an Tangentenkanten von Rundungen)
  const dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1], L = Math.hypot(dx, dy) || 1, u = [dx / L, dy / L];
  const tol = 1e-4 * Math.max(1, L);
  const t = (p) => (p[0] - seg.a[0]) * u[0] + (p[1] - seg.a[1]) * u[1];
  const off = (p) => Math.abs((p[0] - seg.a[0]) * u[1] - (p[1] - seg.a[1]) * u[0]);
  const spans = [];
  for (const pl of polylines || []) for (let k = 1; k < pl.length; k++) {
    const p = pl[k - 1], q = pl[k];
    if (off(p) < tol && off(q) < tol) spans.push([Math.min(t(p), t(q)), Math.max(t(p), t(q))]);
  }
  let lo = 0, hi = L;
  for (let grown = true; grown;) {
    grown = false;
    for (const [a, b] of spans) if (a <= hi + tol && b >= lo - tol && (a < lo - tol || b > hi + tol)) { lo = Math.min(lo, a); hi = Math.max(hi, b); grown = true; }
  }
  return { a: [seg.a[0] + u[0] * lo, seg.a[1] + u[1] * lo], b: [seg.a[0] + u[0] * hi, seg.a[1] + u[1] * hi] };
}

/**
 * Abstand zweier paralleler Kanten als Maß { kind, p1, p2 } (waagerechte Kanten → senkrechtes Maß und umgekehrt,
 * schräge → ausgerichtet); null, wenn die Kanten nicht parallel sind oder aufeinander liegen.
 */
export function parallelEdgeDim(e1, e2) {
  const unit = (e) => { const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], L = Math.hypot(dx, dy) || 1; return { d: [dx / L, dy / L], L }; };
  const u1 = unit(e1), u2 = unit(e2);
  if (Math.abs(u1.d[0] * u2.d[1] - u1.d[1] * u2.d[0]) > 0.01) return null;
  const t = (p) => (p[0] - e1.a[0]) * u1.d[0] + (p[1] - e1.a[1]) * u1.d[1];
  const lo = Math.max(0, Math.min(t(e2.a), t(e2.b))), hi = Math.min(u1.L, Math.max(t(e2.a), t(e2.b)));
  // Mitte des gemeinsamen Bereichs, ohne Überdeckung das Ende von e1, das e2 am nächsten liegt
  const tm = hi >= lo ? (lo + hi) / 2 : Math.abs(lo - u1.L) < Math.abs(hi) ? u1.L : 0;
  const p1 = [e1.a[0] + u1.d[0] * tm, e1.a[1] + u1.d[1] * tm];
  const s = (p1[0] - e2.a[0]) * u2.d[0] + (p1[1] - e2.a[1]) * u2.d[1];
  const p2 = [e2.a[0] + u2.d[0] * s, e2.a[1] + u2.d[1] * s];
  if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 1e-6) return null;
  const kind = Math.abs(u1.d[1]) < 1e-6 ? "v" : Math.abs(u1.d[0]) < 1e-6 ? "h" : "a";
  return { kind, p1, p2 };
}
