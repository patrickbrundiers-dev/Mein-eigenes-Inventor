// Konturen am Rohr wie im Rohr-Editor der Rohrlaser-Kalkulation (schneidweg.py, Schneidweg-Rechner):
// Bohrung, Langloch, Rechteck, Polygon, Schlitz und Ausklinkung über Lage ab Ende A, Seite (bzw. Winkel am Rundrohr), Versatz quer
// und Muster, ohne Skizze. Reine Rechnung (Lage, Prüfung, Schneidweg); die Körper baut src/kernel/build.js.
//
// Bezug wie im Rohr-Editor: x längs ab Ende A, Blick von Ende A: oben 0°, vorne 90° (rechts), unten 180°,
// hinten 270°; Versatz q quer zur Flächenmitte, + = im Uhrzeigersinn (von oben gesehen nach vorne).

export const TUBE_CUT_KINDS = {
  bohrung: { label: "Bohrung", fields: ["d"] },
  langloch: { label: "Langloch", fields: ["l", "b"] },
  rechteck: { label: "Rechteck", fields: ["l", "b", "r"] },
  polygon: { label: "Polygon", fields: ["punkte"] },
  schlitz: { label: "Schlitz am Ende", fields: ["l", "b"] },
  ausklinkung: { label: "Ausklinkung am Ende", fields: ["l", "b", "r"] },
};
export const TUBE_CUT_FIELDS = { d: "Durchmesser d", l: "Länge l (längs)", b: "Breite b (quer)", r: "Eckradius r", punkte: "Eckpunkte x,y; x,y; …" };
/** Konturen, die offen am Ende A oder B sitzen (ohne Lage und Muster) */
export const atEnd = (kind) => kind === "ausklinkung" || kind === "schlitz";
export const TUBE_CUT_SECTIONS = ["rohr", "vierkant", "rechteck"];
export const SIDES = [["oben", 0], ["vorne", 90], ["unten", 180], ["hinten", 270]];

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
const DEG = Math.PI / 180;
const WRAP_MAX = 80 * DEG; // Konturen höchstens 80° um eine Rundung
const SIDE_REST = 0.1; // 3D eben: so viel bleibt von der Seitenwand stehen
export const TILT_QUICK = [-45, -30, 0, 30, 45]; // Schnellwahl der Neigung wie im Rohr-Editor

/** Vorgabe für eine neue Kontur */
export function defaultTubeCut(kind = "bohrung", L = 1000) {
  const base = { kind, x: String(Math.round(L / 2)), side: "oben", angle: "0", q: "0", pattern: "1", through: false };
  if (kind === "bohrung") return { ...base, d: "10" };
  if (kind === "langloch") return { ...base, l: "30", b: "10" };
  if (kind === "ausklinkung") return { ...base, x: "0", end: "A", l: "30", b: "20", r: "3" };
  if (kind === "schlitz") return { ...base, x: "0", end: "A", l: "40", b: "6" };
  if (kind === "polygon") return { ...base, punkte: "0,0; 30,0; 30,10; 15,20; 0,10" };
  return { ...base, l: "40", b: "20", r: "2" };
}

/**
 * Muster wie im Rohr-Editor: "3x25" (auch "3 × 25") = 3 Stück im Abstand 25, "1" = einzeln.
 * Der Abstand darf eine Rechnung sein (ev = Auswerter für Ausdrücke).
 */
export function parsePattern(text, ev = Number) {
  const s = String(text ?? "1").trim() || "1";
  const m = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (m) {
    const count = Number(m[1]), spacing = ev(m[2]);
    if (!(count >= 1)) throw new Error("Anzahl im Muster muss ≥ 1 sein");
    if (count > 1 && !(spacing > 0)) throw new Error("Abstand im Muster muss > 0 sein");
    if (count > 200) throw new Error("Höchstens 200 Stück je Muster");
    return { count, spacing: count > 1 ? spacing : 0 };
  }
  if (!/^\d+$/.test(s)) throw new Error("Muster als Anzahl × Abstand, z. B. „3x25“");
  if (Number(s) !== 1) throw new Error("Mehrere Stück brauchen einen Abstand, z. B. „3x25“");
  return { count: 1, spacing: 0 };
}

/**
 * Eckpunkte wie im Rohr-Editor (punkte_roh): "0,0; 40,0; 40,20,0.4142" – x längs, y quer (+ = im Uhrzeigersinn),
 * optional dritte Zahl = Bogen zum nächsten Punkt als Bulge (tan(Öffnungswinkel/4), + = gegen den Uhrzeiger).
 * Ergebnis: [[x, y, bulge]] um die Mitte des Hüllrechtecks, dazu Breite l (längs) und Höhe b (quer).
 */
export function parsePolygon(text) {
  const raw = [];
  for (const part of String(text ?? "").split(";")) {
    const z = part.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
    if (!z.length) continue;
    if (z.length !== 2 && z.length !== 3) throw new Error(`Punkt „${part.trim()}“ als x,y eingeben`);
    const v = z.map(Number);
    if (v.some((x) => !Number.isFinite(x))) throw new Error(`Punkt „${part.trim()}“ ist keine Zahl`);
    raw.push([v[0], v[1], v[2] || 0]);
  }
  if (raw.length < 3) throw new Error("mindestens 3 Eckpunkte x,y");
  const all = polygonPoints(raw, 16), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]); // Hülle mit Bögen
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const pts = raw.map(([x, y, bu]) => [x - cx, y - cy, bu]);
  let area = 0;
  for (let i = 0; i < all.length; i++) { const a = all[i], b = all[(i + 1) % all.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (Math.abs(area) < 1e-6) throw new Error("Eckpunkte umschließen keine Fläche");
  return { pts, l: Math.max(...xs) - Math.min(...xs), b: Math.max(...ys) - Math.min(...ys) };
}
/** Bogenlänge eines Abschnitts mit Bulge (0 = Gerade) */
const bulgeLength = (a, b, bu) => {
  const c = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!bu) return c;
  const th = 4 * Math.atan(Math.abs(bu));
  return (c / (2 * Math.sin(th / 2))) * th;
};
/** Polygon als Punktliste (Bögen in Stücke zerlegt), für Prüfung und Bild */
export function polygonPoints(pts, n = 8) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push([a[0], a[1]]);
    if (!a[2]) continue;
    const bu = a[2], th = 4 * Math.atan(bu); // + = gegen den Uhrzeiger
    const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy);
    const k = (1 - bu * bu) / (4 * bu); // Abstand Sehnenmitte–Mittelpunkt / Sehne, links der Sehne
    const cx = (a[0] + b[0]) / 2 - dy * k, cy = (a[1] + b[1]) / 2 + dx * k;
    const R0 = (c * (1 + bu * bu)) / (4 * Math.abs(bu)), a0 = Math.atan2(a[1] - cy, a[0] - cx);
    for (let j = 1; j < n; j++) out.push([cx + R0 * Math.cos(a0 + (th * j) / n), cy + R0 * Math.sin(a0 + (th * j) / n)]);
  }
  return out;
}

/** Umfang einer Ellipse mit den Halbachsen a, b (Ramanujan, wie schneidweg.py) */
const ellipse = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

/** Schnittlänge einer Kontur (Formeln aus schneidweg.py; schräge Bohrung = Ellipse d/2 und d/(2 cos γ), dreid.py) */
export function cutLength(c) {
  switch (c.kind) {
    case "bohrung": return c.tilt ? ellipse(c.d / 2, c.d / (2 * Math.cos(c.tilt * DEG))) : Math.PI * c.d;
    case "langloch": return 2 * (c.l - c.b) + Math.PI * c.b;
    case "rechteck": return 2 * (c.l + c.b) - 8 * c.r + 2 * Math.PI * c.r;
    case "ausklinkung": return 2 * (c.l - c.r) + (c.b - 2 * c.r) + Math.PI * c.r; // offen zum Ende, Endschnitt nicht gekürzt
    case "schlitz": return 2 * c.l + c.b; // offen vom Rand
    case "polygon": return c.pts.reduce((s, a, i) => s + bulgeLength(a, c.pts[(i + 1) % c.pts.length], a[2]), 0);
  }
  return 0;
}
/** Hüllmaß für die Konturklasse (Bohrung d, sonst größeres Maß) */
export const cutEnvelope = (c) => (c.kind === "bohrung" ? c.d : Math.max(c.l, c.b));

/**
 * Konturen eines Profils planen.
 * cuts: Feature-Einträge (Texte), ev(text, label) wertet Ausdrücke aus.
 * prof: { kind, W (Maß längs u), H (Maß längs v), t (Wand), r (Außenradius), L (Länge) }
 * Ergebnis: { items: [{ index, kind, xs[], angle, q, d, l, b, r, through, end, halfN, faceHalf }], issues: [{ index, message }],
 *            cutLength, pierces }
 */
export function planTubeCuts(cuts, prof, ev) {
  const items = [], issues = [];
  const round = prof.kind === "rohr";
  if (!TUBE_CUT_SECTIONS.includes(prof.kind)) {
    if ((cuts || []).length) issues.push({ index: -1, message: "Konturen am Rohr nur für Rund-, Quadrat- und Rechteckrohr" });
    return { items, issues, cutLength: 0, pierces: 0 };
  }
  (cuts || []).forEach((c, index) => {
    const kind = TUBE_CUT_KINDS[c.kind] ? c.kind : null;
    const name = `Kontur ${index + 1}`;
    const err = (m) => issues.push({ index, message: `${name}: ${m}` });
    if (!kind) return err("unbekannte Art");
    try {
      const num = (k, label) => ev(c[k] ?? "0", `${name} ${label}`);
      const it = { index, kind, through: !!c.through, end: c.end === "B" ? "B" : "A" };
      if (kind === "polygon") Object.assign(it, parsePolygon(c.punkte), { r: 0 });
      else for (const k of TUBE_CUT_KINDS[kind].fields) it[k] = num(k, TUBE_CUT_FIELDS[k]);
      if (kind === "schlitz") it.r = 0;
      if (kind === "bohrung") {
        it.l = it.b = it.d; it.r = it.d / 2;
        // Bohrung in 3D (dreid.py): Neigung längs (+ = Richtung Ende B) und quer (+ = im Uhrzeigersinn) gegen die
        // Wandnormale; Gesamtwinkel tan²γ = tan²l + tan²q, über der Winkelkorrektur auf die Grenze gesetzt
        if (c.d3) {
          let tl = Math.tan(num("tiltL", "Neigung längs") * DEG), tq = Math.tan(num("tiltQ", "Neigung quer") * DEG);
          const lim = Math.min(prof.swivel ?? 45, 89), tg = Math.hypot(tl, tq);
          if (tg > Math.tan(lim * DEG) + 1e-12) {
            it.clampedFrom = Math.atan(tg) / DEG;
            const k = Math.tan(lim * DEG) / tg; tl *= k; tq *= k;
          }
          it.tanL = tl; it.tanQ = tq; it.tilt = Math.atan(Math.hypot(tl, tq)) / DEG;
          it.l = it.d / Math.cos(Math.atan(Math.abs(tl))); // Länge der Ellipse längs (für Lage und Muster)
        }
      }
      if (kind === "langloch") it.r = it.b / 2;
      it.q = num("q", "Versatz");
      it.wall = prof.t;
      // Seite: Rechteckrohre nur die vier Flächen, Rundrohr beliebiger Winkel
      if (round) it.angle = ((num("angle", "Winkel") % 360) + 360) % 360;
      else {
        const s = SIDES.find(([n]) => n === c.side);
        if (!s) return err("Seite oben, vorne, unten oder hinten wählen");
        it.angle = s[1];
      }
      const side = !round && (it.angle === 90 || it.angle === 270); // vorne/hinten: Fläche über die Höhe
      it.halfN = round ? prof.W / 2 : (side ? prof.W : prof.H) / 2;
      // halbe Breite der Fläche quer (Rechteck: ebener Teil ohne Eckradien; Rundrohr: Radius)
      it.faceHalf = round ? prof.W / 2 : (side ? prof.H : prof.W) / 2 - (prof.r || 0);
      if (!(it.l > 0) || !(it.b > 0)) return err(kind === "bohrung" ? "Durchmesser muss > 0 sein" : "Länge und Breite müssen > 0 sein");
      if (kind === "langloch" && !(it.l > it.b)) return err("Länge muss größer als die Breite sein");
      if ((kind === "rechteck" || kind === "ausklinkung") && !(it.r >= 0 && it.r <= Math.min(it.l, it.b) / 2 + 1e-9))
        return err(`Eckradius 0 bis ${fmt(Math.min(it.l, it.b) / 2)} mm`);
      // Über die Eckrundung bzw. weit um das Rundrohr (Patrick, 25.10.2026): 2D senkrecht zur Mantelfläche, Maße auf
      // der Abwicklung; 3D am Rundrohr parallele Wände (Maße in der Draufsicht), höchstens bis zur Winkelkorrektur.
      // Rechteckrohr in 3D eben bis 0,1 mm vor die Seitenwand, sonst auf der Eckrundung senkrecht zur Mantelfläche.
      // Grenze 80° um die Rundung.
      it.mode = prof.mode === "2D" ? "2D" : "3D";
      const ext = Math.abs(it.q) + it.b / 2, rr = prof.r || 0, lim = Math.min(prof.swivel ?? 45, 89), R0 = prof.W / 2;
      if (round && c.d3 && kind === "bohrung") {
        if (ext > R0 + 1e-6) return err(`breiter als das Rohr (höchstens ${fmt(prof.W)} mm)`);
      } else if (round && it.mode === "2D") {
        if (ext > R0 * WRAP_MAX + 1e-6) return err(`zu breit für das Rohr (|Versatz| + b/2 auf der Abwicklung höchstens ${fmt(R0 * WRAP_MAX)} mm)`);
        it.wrap = true;
      } else if (round) {
        if (ext > R0 * Math.sin(WRAP_MAX) + 1e-6) return err(`zu breit für das Rohr (|Versatz| + b/2 höchstens ${fmt(R0 * Math.sin(WRAP_MAX))} mm)`);
        it.need = Math.asin(Math.min(1, ext / R0)) / DEG; // Kopfschwenk am Rand der Kontur für parallele Wände
        if (it.need > lim + 1e-9) { it.wrap = true; it.clampedFrom = it.need; }
      } else if (ext > it.faceHalf + 1e-6) {
        if ((c.d3 && kind === "bohrung") || !(rr > 0)) return err(`ragt über die ebene Fläche (|Versatz| + b/2 höchstens ${fmt(it.faceHalf)} mm)`);
        // 3D: eben mit parallelen Wänden (Maße in der Draufsicht) über die Rundung, bis 0,1 mm vor die Innenseite der
        // Seitenwand (Patrick, 25.10.2026); braucht die Rundung dort mehr als die Winkelkorrektur, wie 2D
        const planar = (side ? prof.H : prof.W) / 2 - prof.t - SIDE_REST;
        if (it.mode === "3D" && ext <= planar + 1e-6) {
          it.need = Math.asin(Math.min(1, (ext - it.faceHalf) / rr)) / DEG;
          if (it.need > lim + 1e-9) it.clampedFrom = it.need;
        }
        if (it.mode === "2D" || ext > planar + 1e-6 || it.clampedFrom) {
          if (rr < prof.t + 0.6 - 1e-9) return err(`über die Eckrundung nur ab Eckradius Wand + 0,6 mm (ebene Fläche: |Versatz| + b/2 höchstens ${fmt(it.faceHalf)} mm${it.mode === "3D" ? `, in 3D eben bis ${fmt(planar)} mm` : ""})`);
          if (ext > it.faceHalf + rr * WRAP_MAX + 1e-6) return err(`ragt zu weit über die Eckrundung (|Versatz| + b/2 auf der Abwicklung höchstens ${fmt(it.faceHalf + rr * WRAP_MAX)} mm)`);
          it.wrap = true;
          if (it.mode === "3D" && !it.clampedFrom) it.overPlanar = planar;
        }
      }
      if (atEnd(kind)) {
        if (it.l >= prof.L - 1e-6) return err("länger als das Teil");
        it.xs = [it.end === "A" ? 0 : prof.L];
      } else {
        const { count, spacing } = parsePattern(c.pattern, (s) => ev(s, `${name} Abstand`));
        const x0 = num("x", "Lage");
        it.xs = Array.from({ length: count }, (_, i) => x0 + i * spacing);
        const lo = it.xs[0] - it.l / 2, hi = it.xs[it.xs.length - 1] + it.l / 2;
        if (lo < -1e-6 || hi > prof.L + 1e-6) return err(`liegt nicht ganz auf dem Teil (${fmt(lo)} bis ${fmt(hi)} mm, Teil 0 bis ${fmt(prof.L)} mm)`);
        if (count > 1 && spacing < it.l - 1e-6) return err("Konturen im Muster überlappen (Abstand kleiner als die Länge)");
      }
      if (it.overPlanar) issues.push({ index, warning: true, message: `${name}: in 3D eben nur bis 0,1 mm vor die Seitenwand (|Versatz| + b/2 höchstens ${fmt(it.overPlanar)} mm) – auf der Eckrundung senkrecht zur Mantelfläche geschnitten, Maße dort auf der Abwicklung` });
      else if (it.clampedFrom && it.wrap) issues.push({ index, warning: true, message: `${name}: braucht in 3D ${fmt(it.clampedFrom)}° Kopfschwenk, Winkelkorrektur auf ±${fmt(lim)}° – am Rand nicht parallel` });
      else if (it.clampedFrom) issues.push({ index, warning: true, message: `${name}: Bohrung 3D braucht ${fmt(it.clampedFrom)}° Kopfschwenk, Winkelkorrektur auf ±${fmt(Math.min(prof.swivel ?? 45, 89))}° – nicht maßhaltig` });
      items.push(it);
    } catch (e) {
      err(e.message.replace(`${name} `, ""));
    }
  });
  let len = 0, pierces = 0;
  for (const it of items) {
    const k = it.xs.length * (it.through ? 2 : 1);
    len += k * cutLength(it);
    pierces += k;
  }
  return { items, issues, cutLength: len, pierces };
}

/** Kurztext für Baum und Liste: "Bohrung Ø10 oben, 3× ab 100" */
export function tubeCutLabel(it) {
  const m = it.kind === "bohrung" ? `Ø${fmt(it.d)}` : it.kind === "polygon" ? `${it.pts.length} Ecken` : `${fmt(it.l)}×${fmt(it.b)}`;
  const side = SIDES.find(([, a]) => a === it.angle)?.[0] || `${fmt(it.angle)}°`;
  const where = atEnd(it.kind) ? `Ende ${it.end}` : it.xs.length > 1 ? `${it.xs.length}× ab ${fmt(it.xs[0])}` : `bei ${fmt(it.xs[0])}`;
  return `${TUBE_CUT_KINDS[it.kind].label} ${m}${it.tilt ? ` 3D ${fmt(it.tilt)}°` : ""} ${side}${it.through ? " durchgehend" : ""}, ${where}`;
}

/**
 * Umriss einer Kontur als dichter Linienzug um x (x längs, y quer inkl. Versatz), für Abbildungen, die Bögen nicht
 * erhalten (3D am Rundrohr über der Winkelkorrektur). ext = Überstand offener Konturen über das Ende.
 */
export function contourPolyline(it, x = 0, { ext = 0, step = 0.5 } = {}) {
  let pts;
  if (it.kind === "polygon") pts = polygonPoints(it.pts, 24).map(([px, py]) => [x + px, py]);
  else if (atEnd(it.kind)) pts = outlinePts(x + (it.end === "A" ? (it.l - ext) / 2 : (ext - it.l) / 2), 0, it.l + ext, it.b, it.r || 0, 16);
  else pts = outlinePts(x, 0, it.l, it.b, it.r || 0, 16);
  pts = pts.map(([px, py]) => [px, it.q + py]).filter((p, i, all) => { const q = all[(i + all.length - 1) % all.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7; });
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

// ---------- Prüfregeln Bohrung, Steg, Rand (dfm.py der Rohrlaser-Kalkulation) ----------
// Jede Kontur als Linienzug auf der Abwicklung des Rohrs: x längs, s am Umfang im Uhrzeigersinn ab der Mitte oben
// (Außenmaß; Rechteckrohr mit Eckbögen). Durchgehende Konturen zählen auf der Gegenseite mit.

/** Umfang und Lage der Flächenmitte (s) je Winkel */
export function unrollFrame({ kind, W, H, r = 0 }) {
  if (kind === "rohr") { const R = W / 2; return { P: 2 * Math.PI * R, s: (a) => a * DEG * R }; }
  const a = W - 2 * r, b = H - 2 * r, k = (Math.PI * r) / 2;
  const at = { 0: 0, 90: a / 2 + k + b / 2, 180: a + 2 * k + b, 270: (3 * (a + b)) / 2 + 3 * k };
  return { P: 2 * (a + b) + 4 * k, s: (ang) => at[ang] ?? 0 };
}

/** Umriss einer Kontur (l längs × b quer, Eckradius r) um (x, s) als Punktliste */
function outlinePts(x, s, l, b, r, n = 6) {
  r = Math.max(0, Math.min(r, l / 2, b / 2));
  const pts = [], cx = l / 2 - r, cs = b / 2 - r;
  for (const [sx, ss, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]])
    for (let i = 0; i <= n; i++) { const a = (a0 + (90 * i) / n) * DEG; pts.push([x + sx * cx + r * Math.cos(a), s + ss * cs + r * Math.sin(a)]); }
  return pts;
}

const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const inside = ([px, py], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Kleinster Abstand zweier geschlossener Linienzüge; 0, wenn sie sich berühren oder einer im anderen liegt */
export function polyDistance(a, b) {
  if (inside(a[0], b) || inside(b[0], a)) return 0;
  let d = Infinity;
  for (const [p, q] of [[a, b], [b, a]])
    for (const pt of p) for (let i = 0; i < q.length; i++) d = Math.min(d, segDist(pt, q[i ? i - 1 : q.length - 1], q[i]));
  return d; // bei gleich dichten Punkten genügt Punkt–Strecke; Kreuzungen ohne Punkt im anderen gibt es bei Rundungen nicht
}

/**
 * Konturen eines Profils prüfen. items = planTubeCuts(...).items, prof wie dort, limits mit den Faktoren
 * bohrungKlein, steg, rand (× Wand; 0 = aus). Ergebnis: [{ rule, text, contours: [Konturnummern ab 1] }]
 */
export function checkContours(items, prof, limits) {
  const out = [], t = prof?.t;
  if (!items?.length || !(t > 0)) return out;
  const g = { bohrungKlein: limits.bohrungKlein || 0, steg: limits.steg || 0, rand: limits.rand || 0 };
  const nr = (it) => it.index + 1;
  if (g.bohrungKlein > 0) {
    const small = items.filter((it) => it.kind === "bohrung" && it.d < g.bohrungKlein * t - 1e-9);
    if (small.length) {
      const n = small.reduce((k, it) => k + it.xs.length * (it.through ? 2 : 1), 0);
      out.push({ rule: "Bohrung zu klein", contours: small.map(nr), text: `${n} Bohrung(en) ab Ø ${fmt(Math.min(...small.map((it) => it.d)))} mm unter ${fmt(g.bohrungKlein)} × Wand (${fmt(g.bohrungKlein * t)} mm), Kontur ${small.map(nr).join(", ")}` });
    }
  }
  if (!(g.steg > 0) && !(g.rand > 0)) return out;
  const U = unrollFrame(prof);
  const parts = [];
  for (const it of items) {
    const faces = [[U.s(it.angle) + it.q, 1]];
    if (it.through) faces.push([U.s((it.angle + 180) % 360) - it.q, -1]); // Gegenseite: quer gespiegelt
    const poly = it.kind === "polygon" ? polygonPoints(it.pts) : null;
    for (const [s, sg] of faces)
      for (const x of it.xs) {
        const end = atEnd(it.kind);
        const xc = end ? (x === 0 ? (it.l - 1) / 2 : x - (it.l - 1) / 2) : x; // offen über das Ende
        const l = end ? it.l + 1 : it.l;
        const pts = poly ? poly.map(([px, py]) => [xc + px, s + sg * py]) : outlinePts(xc, s, l, it.b, it.r);
        parts.push({ it, x0: xc - l / 2, x1: xc + l / 2, pts });
      }
  }
  if (g.rand > 0) {
    const lim = g.rand * t;
    const near = parts.filter((p) => !atEnd(p.it.kind)).map((p) => ({ p, rest: Math.min(p.x0, prof.L - p.x1) })).filter((x) => x.rest < lim - 1e-9);
    if (near.length) {
      const m = near.reduce((a, b) => (b.rest < a.rest ? b : a));
      out.push({ rule: "Kontur zu nah am Ende", contours: [...new Set(near.map((x) => nr(x.p.it)))], text: `${near.length} Kontur(en) näher als ${fmt(g.rand)} × Wand (${fmt(lim)} mm) am Ende, kleinster Abstand ${fmt(Math.max(m.rest, 0))} mm (Kontur ${nr(m.p.it)})` });
    }
  }
  if (g.steg > 0) {
    const lim = g.steg * t, pairs = [];
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        if (a.x0 - b.x1 >= lim || b.x0 - a.x1 >= lim) continue;
        // am Umfang periodisch: auch um eine Umdrehung verschoben vergleichen
        const d = Math.min(...[-U.P, 0, U.P].map((sh) => polyDistance(a.pts, b.pts.map(([x, s]) => [x, s + sh]))));
        if (d < lim - 1e-9) pairs.push([a, b, d]);
      }
    if (pairs.length) {
      const [a, b, d] = pairs.reduce((x, y) => (y[2] < x[2] ? y : x));
      const between = nr(a.it) === nr(b.it) ? `im Muster von Kontur ${nr(a.it)}` : `zwischen Kontur ${nr(a.it)} und ${nr(b.it)}`;
      out.push({ rule: "Steg zu schmal", contours: [...new Set(pairs.flatMap(([p, q]) => [nr(p.it), nr(q.it)]))], text: `${pairs.length} Steg(e) unter ${fmt(g.steg)} × Wand (${fmt(lim)} mm), schmalster ${fmt(d)} mm ${between}` });
    }
  }
  return out;
}
