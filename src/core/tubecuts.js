// Konturen am Rohr wie im Rohr-Editor der Rohrlaser-Kalkulation (schneidweg.py, Schneidweg-Rechner):
// Bohrung, Langloch, Rechteck und Ausklinkung über Lage ab Ende A, Seite (bzw. Winkel am Rundrohr), Versatz quer
// und Muster, ohne Skizze. Reine Rechnung (Lage, Prüfung, Schneidweg); die Körper baut src/kernel/build.js.
//
// Bezug wie im Rohr-Editor: x längs ab Ende A, Blick von Ende A: oben 0°, vorne 90° (rechts), unten 180°,
// hinten 270°; Versatz q quer zur Flächenmitte, + = im Uhrzeigersinn (von oben gesehen nach vorne).

export const TUBE_CUT_KINDS = {
  bohrung: { label: "Bohrung", fields: ["d"] },
  langloch: { label: "Langloch", fields: ["l", "b"] },
  rechteck: { label: "Rechteck", fields: ["l", "b", "r"] },
  ausklinkung: { label: "Ausklinkung am Ende", fields: ["l", "b", "r"] },
};
export const TUBE_CUT_FIELDS = { d: "Durchmesser d", l: "Länge l (längs)", b: "Breite b (quer)", r: "Eckradius r" };
export const TUBE_CUT_SECTIONS = ["rohr", "vierkant", "rechteck"];
export const SIDES = [["oben", 0], ["vorne", 90], ["unten", 180], ["hinten", 270]];

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
const DEG = Math.PI / 180;
export const TILT_QUICK = [-45, -30, 0, 30, 45]; // Schnellwahl der Neigung wie im Rohr-Editor

/** Vorgabe für eine neue Kontur */
export function defaultTubeCut(kind = "bohrung", L = 1000) {
  const base = { kind, x: String(Math.round(L / 2)), side: "oben", angle: "0", q: "0", pattern: "1", through: false };
  if (kind === "bohrung") return { ...base, d: "10" };
  if (kind === "langloch") return { ...base, l: "30", b: "10" };
  if (kind === "ausklinkung") return { ...base, x: "0", end: "A", l: "30", b: "20", r: "3" };
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

/** Umfang einer Ellipse mit den Halbachsen a, b (Ramanujan, wie schneidweg.py) */
const ellipse = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

/** Schnittlänge einer Kontur (Formeln aus schneidweg.py; schräge Bohrung = Ellipse d/2 und d/(2 cos γ), dreid.py) */
export function cutLength(c) {
  switch (c.kind) {
    case "bohrung": return c.tilt ? ellipse(c.d / 2, c.d / (2 * Math.cos(c.tilt * DEG))) : Math.PI * c.d;
    case "langloch": return 2 * (c.l - c.b) + Math.PI * c.b;
    case "rechteck": return 2 * (c.l + c.b) - 8 * c.r + 2 * Math.PI * c.r;
    case "ausklinkung": return 2 * (c.l - c.r) + (c.b - 2 * c.r) + Math.PI * c.r; // offen zum Ende, Endschnitt nicht gekürzt
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
      for (const k of TUBE_CUT_KINDS[kind].fields) it[k] = num(k, TUBE_CUT_FIELDS[k]);
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
      // halbe Breite der Fläche quer (Rechteck: ebener Teil ohne Eckradien; Rundrohr: halber Umfang als Grenze)
      it.faceHalf = round ? prof.W / 2 : (side ? prof.H : prof.W) / 2 - (prof.r || 0);
      if (!(it.l > 0) || !(it.b > 0)) return err(kind === "bohrung" ? "Durchmesser muss > 0 sein" : "Länge und Breite müssen > 0 sein");
      if (kind === "langloch" && !(it.l > it.b)) return err("Länge muss größer als die Breite sein");
      if ((kind === "rechteck" || kind === "ausklinkung") && !(it.r >= 0 && it.r <= Math.min(it.l, it.b) / 2 + 1e-9))
        return err(`Eckradius 0 bis ${fmt(Math.min(it.l, it.b) / 2)} mm`);
      if (Math.abs(it.q) + it.b / 2 > it.faceHalf + 1e-6)
        return err(round ? `breiter als das Rohr (höchstens ${fmt(prof.W)} mm)` : `ragt über die ebene Fläche (|Versatz| + b/2 höchstens ${fmt(it.faceHalf)} mm)`);
      if (kind === "ausklinkung") {
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
      if (it.clampedFrom) issues.push({ index, warning: true, message: `${name}: Bohrung 3D braucht ${fmt(it.clampedFrom)}° Kopfschwenk, Winkelkorrektur auf ±${fmt(Math.min(prof.swivel ?? 45, 89))}° – nicht maßhaltig` });
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
  const m = it.kind === "bohrung" ? `Ø${fmt(it.d)}` : `${fmt(it.l)}×${fmt(it.b)}`;
  const side = SIDES.find(([, a]) => a === it.angle)?.[0] || `${fmt(it.angle)}°`;
  const where = it.kind === "ausklinkung" ? `Ende ${it.end}` : it.xs.length > 1 ? `${it.xs.length}× ab ${fmt(it.xs[0])}` : `bei ${fmt(it.xs[0])}`;
  return `${TUBE_CUT_KINDS[it.kind].label} ${m}${it.tilt ? ` 3D ${fmt(it.tilt)}°` : ""} ${side}${it.through ? " durchgehend" : ""}, ${where}`;
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
    const faces = [[U.s(it.angle) + it.q]];
    if (it.through) faces.push([U.s((it.angle + 180) % 360) - it.q]);
    for (const [s] of faces)
      for (const x of it.xs) {
        const xc = it.kind === "ausklinkung" ? (x === 0 ? (it.l - 1) / 2 : x - (it.l - 1) / 2) : x; // offen über das Ende
        const l = it.kind === "ausklinkung" ? it.l + 1 : it.l;
        parts.push({ it, x0: xc - l / 2, x1: xc + l / 2, pts: outlinePts(xc, s, l, it.b, it.r) });
      }
  }
  if (g.rand > 0) {
    const lim = g.rand * t;
    const near = parts.filter((p) => p.it.kind !== "ausklinkung").map((p) => ({ p, rest: Math.min(p.x0, prof.L - p.x1) })).filter((x) => x.rest < lim - 1e-9);
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
