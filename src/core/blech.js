// Blech, erste Ausbaustufe (MegaCAD-Abgleich M17, ADR-0005): Kantteil aus einem Querschnitt mit geraden Kanten,
// über die Länge extrudiert, mit Abwicklung über die Biegezugabe und DXF für den Laser.
//
// Querschnitt: Schenkel (Längen) und Biegewinkel dazwischen (positiv = nach links/oben, negativ = nach rechts/unten),
// Blechdicke t, Innenradius ri, K-Faktor K (Lage der neutralen Faser ab Innenseite in Vielfachen von t).
// Maßbezug der Schenkel: außen (Schnittpunkte der Außenflächen), innen oder Mitte Blech.
// Lage: Querschnitt in der XZ-Ebene, erster Schenkel ab dem Ursprung in +X (Mittellinie), Länge in +Y.

const DEG = Math.PI / 180;

/** Biegezugabe = Länge der neutralen Faser in der Biegezone (wie beim Knickrahmen) */
export const bendAllowance = (ri, k, t, thetaRad) => (ri + k * t) * thetaRad;

export function defaultKantteil() {
  return { type: "kantteil", legs: "40; 100; 40", angles: "90; 90", ref: "aussen", t: "2", ri: "2", k: "0.33", length: "1000", pos: ["0", "0", "0"], view: "gefaltet" };
}

export { splitList } from "./expr.js";

/**
 * Rücksprung einer Biegung: um so viel ist das gerade Stück eines Schenkels kürzer als sein Maß (Maßbezug ref).
 * Bis 179° über den Schnittpunkt der Flächen (Tangens), 180° (Umschlag) bis zur Außenkante der Falz.
 */
export function bendCut(angle, ri, t, ref = "aussen") {
  const th = Math.abs(angle), sgn = Math.sign(angle);
  const side = ref === "links" ? (sgn > 0 ? "innen" : "aussen") : ref === "rechts" ? (sgn < 0 ? "innen" : "aussen") : ref;
  const R = side === "innen" ? ri : side === "mitte" ? ri + t / 2 : ri + t;
  return th > 179.5 ? R : R * Math.tan((th * DEG) / 2);
}

/**
 * Plan eines Kantteils. legs: [mm], angles: [°] (legs.length − 1), t, ri, k, ref ∈ aussen|innen|mitte|links|rechts
 * (links/rechts: Maße an der linken bzw. rechten Blechfläche, wie bei der Konturlasche aus einer Skizze).
 * ris/refs: Innenradius und Maßbezug je Biegung (Umschlag, Lasche mit eigenem Radius). Winkel bis 179° oder genau 180° (Umschlag).
 * anchor {leg, at, dir}: Anfang des geraden Stücks von Schenkel leg liegt bei at + Rücksprung in Richtung dir (rad);
 * ohne anchor beginnt Schenkel 1 im Ursprung in +X.
 * Rückgabe { center: [{a, b, n, d, len}] gerade Stücke der Mittellinie, bends: [{c, rm, theta, sgn, angle, ri}],
 *   flat: Abwicklungslänge, flatParts: [gerade, Biegezone, gerade, …], bendLines: [x in der Abwicklung],
 *   legX: [[x0, x1]] gerade Stücke in der Abwicklung, cuts: [[vorn, hinten]] Rücksprünge je Schenkel, issues }
 */
export function planKantteil({ legs, angles, t, ri, k, kOf = null, ref = "aussen", ris = null, refs = null, anchor = null }) {
  if (!legs.length || legs.some((x) => !(x > 0))) throw new Error("Schenkellängen > 0 angeben");
  if (angles.length !== legs.length - 1) throw new Error(`${legs.length} Schenkel brauchen ${legs.length - 1} Biegewinkel`);
  if (!(t > 0)) throw new Error("Blechdicke muss > 0 sein");
  if (!(ri >= 0)) throw new Error("Innenradius muss ≥ 0 sein");
  if (!(k >= 0 && k <= 1)) throw new Error("K-Faktor muss zwischen 0 und 1 liegen");
  for (const a of angles) if (!((Math.abs(a) > 0.5 && Math.abs(a) <= 179) || Math.abs(Math.abs(a) - 180) < 1e-9)) throw new Error("Biegewinkel zwischen 0,5° und 179° (Betrag) angeben, 180° nur als Umschlag");
  const riOf = (i) => (ris && ris[i] != null ? ris[i] : ri);
  const refOf = (i) => (refs && refs[i] ? refs[i] : ref);
  const issues = [];
  if (ri < t - 1e-9) issues.push({ level: "Hinweis", message: `Innenradius ${fmt(ri)} kleiner als die Blechdicke – Rissgefahr, Werkzeug prüfen` });
  const cut = angles.map((a, i) => bendCut(a, riOf(i), t, refOf(i)));
  const center = [], bends = [], flatParts = [], bendLines = [], legX = [], cuts = [];
  let p = [0, 0], dir = 0, s = 0;
  for (let i = 0; i < legs.length; i++) {
    const c0 = i > 0 ? cut[i - 1] : 0, c1 = i < angles.length ? cut[i] : 0;
    const straight = legs[i] - c0 - c1;
    if (straight < -1e-6) throw new Error(`Schenkel ${i + 1} zu kurz für die Biegeradien (mindestens ${fmt(legs[i] - straight)} mm)`);
    const len = Math.max(0, straight);
    const d = [Math.cos(dir), Math.sin(dir)], n = [-d[1], d[0]];
    const a = p, b = [a[0] + d[0] * len, a[1] + d[1] * len];
    center.push({ a, b, n, d, len });
    cuts.push([c0, c1]);
    flatParts.push(len);
    legX.push([s, s + len]);
    s += len;
    if (i < angles.length) {
      const th = Math.abs(angles[i]) * DEG, sgn = Math.sign(angles[i]), rib = riOf(i), rm = rib + t / 2;
      const c = [b[0] + n[0] * sgn * rm, b[1] + n[1] * sgn * rm];
      const ba = bendAllowance(rib, kOf ? kOf(Math.abs(angles[i])) : k, t, th); // kOf: K je Biegung aus Biegetabelle oder DIN 6935
      bends.push({ c, rm, theta: th, sgn, angle: angles[i], ri: rib });
      bendLines.push(s + ba / 2);
      flatParts.push(ba);
      s += ba;
      const rot = sgn * th, v = [b[0] - c[0], b[1] - c[1]];
      p = [c[0] + v[0] * Math.cos(rot) - v[1] * Math.sin(rot), c[1] + v[0] * Math.sin(rot) + v[1] * Math.cos(rot)];
      dir += angles[i] * DEG;
    }
    if (straight > 0 && straight < 2 * t && i > 0 && i < legs.length - 1) issues.push({ level: "Hinweis", message: `Schenkel ${i + 1}: gerades Stück nur ${fmt(straight)} mm` });
  }
  const minLeg = ri + 3 * t;
  legs.forEach((L, i) => { if (angles.length && (i === 0 || i === legs.length - 1) && L < minLeg) issues.push({ level: "Hinweis", message: `Schenkel ${i + 1} kürzer als ri + 3·t (${fmt(minLeg)} mm) – auf der Abkantpresse schwer zu biegen` }); });
  const plan = { center, bends, flat: s, flatParts, bendLines, legX, cuts, rm: ri + t / 2, issues };
  if (anchor) {
    const g = center[anchor.leg];
    const at = anchor.at || [0, 0], dr = anchor.dir || 0, cs = cuts[anchor.leg][0];
    const rho = dr - Math.atan2(g.d[1], g.d[0]), co = Math.cos(rho), si = Math.sin(rho);
    const R2 = (v) => [v[0] * co - v[1] * si, v[0] * si + v[1] * co];
    const ra = R2(g.a), off = [at[0] + Math.cos(dr) * cs - ra[0], at[1] + Math.sin(dr) * cs - ra[1]];
    const P = (q) => { const r = R2(q); return [r[0] + off[0], r[1] + off[1]]; };
    plan.center = center.map((x) => ({ ...x, a: P(x.a), b: P(x.b), n: R2(x.n), d: R2(x.d) }));
    plan.bends = bends.map((x) => ({ ...x, c: P(x.c) }));
  }
  return plan;
}

/**
 * Umriss des Querschnitts als Folge von Abschnitten { t: "line", to } / { t: "arc", mid, to } ab start (geschlossen).
 * Links = Seite in Richtung der linken Normalen; Biegung nach links → links ist innen.
 */
export function kantteilOutline(plan, t) {
  const h = t / 2;
  const off = (q, n, s) => [q[0] + n[0] * s, q[1] + n[1] * s];
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const arcMid = (c, q, a) => { const v = rot([q[0] - c[0], q[1] - c[1]], a); return [c[0] + v[0], c[1] + v[1]]; };
  const C = plan.center;
  const start = off(C[0].a, C[0].n, h);
  const segs = [];
  // linke Seite vorwärts
  C.forEach((g, i) => {
    segs.push({ t: "line", to: off(g.b, g.n, h) });
    const bd = plan.bends[i];
    if (bd) segs.push({ t: "arc", mid: arcMid(bd.c, off(g.b, g.n, h), (bd.sgn * bd.theta) / 2), to: off(C[i + 1].a, C[i + 1].n, h) });
  });
  // Stirnseite am Ende, rechte Seite rückwärts
  const last = C[C.length - 1];
  segs.push({ t: "line", to: off(last.b, last.n, -h) });
  for (let i = C.length - 1; i >= 0; i--) {
    const g = C[i];
    segs.push({ t: "line", to: off(g.a, g.n, -h) });
    const bd = plan.bends[i - 1];
    if (bd) { const pg = C[i - 1]; segs.push({ t: "arc", mid: arcMid(bd.c, off(pg.b, pg.n, -h), (bd.sgn * bd.theta) / 2), to: off(pg.b, pg.n, -h) }); }
  }
  segs.push({ t: "line", to: start });
  return { start, segs };
}

/** Abwicklung als DXF-Inhalt: Kontur (Lf × L), Biegelinien gestrichelt mit Winkel und Richtung */
export function kantteilFlatDxf(DxfWriter, plan, L, { name = "", t = 0 } = {}) {
  const w = new DxfWriter().layer("KONTUR", 7).layer("BIEGUNG", 1, "DASHED").layer("TEXT", 3);
  const Lf = plan.flat;
  w.line(0, 0, Lf, 0, "KONTUR").line(Lf, 0, Lf, L, "KONTUR").line(Lf, L, 0, L, "KONTUR").line(0, L, 0, 0, "KONTUR");
  plan.bendLines.forEach((x, i) => {
    const b = plan.bends[i];
    w.line(x, 0, x, L, "BIEGUNG");
    w.text(x + 2, Math.min(20, L / 4), 5, `${fmt(Math.abs(b.angle))}° ${b.sgn > 0 ? "auf" : "ab"} R${fmt(b.rm - t / 2)}`, "TEXT", { rot: 90 });
  });
  if (name) w.text(5, L - 10, 5, name, "TEXT");
  return w.toString();
}

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

/**
 * Abwicklungsansicht für die Zeichnung: Kontur Lf × L (Ansichtskoordinaten, u längs der Abwicklung) und je Biegung
 * Lage, Winkel, Richtung, Innenradius und wirksamer K-Faktor (Biegenotiz und Biegetabelle wie Inventor).
 */
export function kantteilFlatView(plan, L, { t, k, kOf = null }) {
  const Lf = plan.flat;
  const bends = plan.bends.map((b, i) => ({ nr: i + 1, x: plan.bendLines[i], angle: Math.abs(b.angle), up: b.sgn > 0, ri: b.rm - t / 2, k: kOf ? kOf(Math.abs(b.angle)) : k }));
  return { visible: [[[0, 0], [Lf, 0], [Lf, L], [0, L], [0, 0]]], hidden: [], arcs: [], bbox: { x0: 0, y0: 0, x1: Lf, y1: L }, bends, flat: Lf, length: L };
}

/** Biegenotiz an der Biegelinie, z. B. „1: 90° auf R2“ */
export const bendNote = (b) => `${b.nr}: ${fmt(b.angle)}° ${b.up ? "auf" : "ab"} R${fmt(b.ri)}`;

/** Zellen der Biegetabelle (Kopf + Zeilen): Nr., Winkel, Richtung, Innenradius, K, Lage ab linkem Rand */
export function bendTableCells(bends) {
  const at = (b) => (b.y0 != null && Math.abs(b.y1 - b.y0) < 1e-9 && Math.abs(b.x1 - b.x0) > 1e-9 ? "y " + fmt(b.y0) : fmt(b.x ?? b.x0));
  return [["Nr.", "Winkel", "Richtung", "Ri", "K", "Lage"], ...bends.map((b) => [String(b.nr), fmt(b.angle) + "°", b.up ? "auf" : "ab", fmt(b.ri), String(Math.round(b.k * 1000) / 1000).replace(".", ","), at(b)])];
}
