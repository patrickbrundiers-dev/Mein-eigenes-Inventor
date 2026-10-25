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
 * Plan eines Kantteils. legs: [mm], angles: [°] (legs.length − 1), t, ri, k, ref ∈ aussen|innen|mitte.
 * Rückgabe { center: [{a, b, n}] gerade Stücke der Mittellinie, bends: [{c, rm, theta, sgn, from, to}],
 *   flat: Abwicklungslänge, flatParts: [gerade, Biegezone, gerade, …], bendLines: [x in der Abwicklung], issues }
 */
export function planKantteil({ legs, angles, t, ri, k, kOf = null, ref = "aussen" }) {
  if (!legs.length || legs.some((x) => !(x > 0))) throw new Error("Schenkellängen > 0 angeben");
  if (angles.length !== legs.length - 1) throw new Error(`${legs.length} Schenkel brauchen ${legs.length - 1} Biegewinkel`);
  if (!(t > 0)) throw new Error("Blechdicke muss > 0 sein");
  if (!(ri >= 0)) throw new Error("Innenradius muss ≥ 0 sein");
  if (!(k >= 0 && k <= 1)) throw new Error("K-Faktor muss zwischen 0 und 1 liegen");
  for (const a of angles) if (!(Math.abs(a) > 0.5 && Math.abs(a) <= 179)) throw new Error("Biegewinkel zwischen 0,5° und 179° (Betrag) angeben");
  const issues = [];
  if (ri < t - 1e-9) issues.push({ level: "Hinweis", message: `Innenradius ${fmt(ri)} kleiner als die Blechdicke – Rissgefahr, Werkzeug prüfen` });
  const rm = ri + t / 2;
  // Mittellinie: Längen zwischen den Scheitelpunkten der Mittellinie
  const delta = (th) => (ref === "aussen" ? 1 : ref === "innen" ? -1 : 0) * (t / 2) * Math.tan((Math.abs(th) * DEG) / 2);
  const Lc = legs.map((L, i) => L - (i > 0 ? delta(angles[i - 1]) : 0) - (i < legs.length - 1 ? delta(angles[i]) : 0));
  const T = angles.map((th) => rm * Math.tan((Math.abs(th) * DEG) / 2)); // Tangentenlänge je Biegung
  // Scheitelpunkte und Richtungen
  let dir = 0, p = [0, 0];
  const verts = [p];
  const dirs = [];
  for (let i = 0; i < legs.length; i++) {
    dirs.push(dir);
    p = [p[0] + Lc[i] * Math.cos(dir), p[1] + Lc[i] * Math.sin(dir)];
    verts.push(p);
    if (i < angles.length) dir += angles[i] * DEG;
  }
  const center = [], bends = [], flatParts = [], bendLines = [];
  let s = 0;
  for (let i = 0; i < legs.length; i++) {
    const d = [Math.cos(dirs[i]), Math.sin(dirs[i])], n = [-d[1], d[0]];
    const t0 = i > 0 ? T[i - 1] : 0, t1 = i < angles.length ? T[i] : 0;
    const straight = Lc[i] - t0 - t1;
    if (straight < -1e-6) throw new Error(`Schenkel ${i + 1} zu kurz für die Biegeradien (mindestens ${fmt(legs[i] - straight)} mm)`);
    const a = [verts[i][0] + d[0] * t0, verts[i][1] + d[1] * t0], b = [verts[i + 1][0] - d[0] * t1, verts[i + 1][1] - d[1] * t1];
    center.push({ a, b, n, d, len: Math.max(0, straight) });
    flatParts.push(Math.max(0, straight));
    s += Math.max(0, straight);
    if (i < angles.length) {
      const th = Math.abs(angles[i]) * DEG, sgn = Math.sign(angles[i]);
      const c = [b[0] + n[0] * sgn * rm, b[1] + n[1] * sgn * rm];
      const ba = bendAllowance(ri, kOf ? kOf(Math.abs(angles[i])) : k, t, th); // kOf: K je Biegung aus Biegetabelle oder DIN 6935
      bends.push({ c, rm, theta: th, sgn, angle: angles[i] });
      bendLines.push(s + ba / 2);
      flatParts.push(ba);
      s += ba;
    }
    if (straight > 0 && straight < 2 * t && i > 0 && i < legs.length - 1) issues.push({ level: "Hinweis", message: `Schenkel ${i + 1}: gerades Stück nur ${fmt(straight)} mm` });
  }
  const minLeg = Math.max(0, ...angles.map(() => ri + 3 * t));
  legs.forEach((L, i) => { if ((i === 0 || i === legs.length - 1) && L < minLeg) issues.push({ level: "Hinweis", message: `Schenkel ${i + 1} kürzer als ri + 3·t (${fmt(minLeg)} mm) – auf der Abkantpresse schwer zu biegen` }); });
  return { center, bends, flat: s, flatParts, bendLines, rm, issues };
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
