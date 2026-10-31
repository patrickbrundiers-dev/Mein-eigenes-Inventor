// Stahlzarge / Türzarge (P2): Eck- oder Umfassungszarge aus Kantblech, Spiegel, Falz, Anschlag und Laibungsschenkel,
// zwei Pfosten und Sturz auf Gehrung, Bandtaschen auf der Bandseite, Schließblechkasten auf der Schlossseite,
// Maueranker in der Laibung. Zuschnittbreite der Abwicklung je Zargenteil in der Info. Reine Rechnung.
//
// Lage: Rohbauöffnung x = 0 … Breite, z = 0 … Höhe (z = 0 = Oberkante Fertigfußboden), Wandvorderseite y = 0,
// Wand in +y. Profilkoordinaten: u = von der Laibung in die Wand (aus der Öffnung heraus), v = Tiefe in die Wand.

import { fieldError } from "./generror.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

/**
 * Querschnitt der Zarge als geschlossener Umriss [[u, v], …] (Blechdicke t, scharfe Kanten).
 * S Spiegel, A Falzbreite (Spiegel ragt so weit in die Öffnung), R Falztiefe, D Laibungsschenkel bzw. Wanddicke.
 */
export function zargeProfile({ form = "eck", S, A, R, D, t }) {
  if (!(t > 0 && A > 2 * t && R > 2 * t && S > t)) throw new Error("Zargenprofil: Blechdicke zu groß für Falz und Spiegel");
  if (!(D > R + t)) throw new Error("Laibungsschenkel bzw. Wanddicke größer als die Falztiefe");
  // außen herum: Spiegel vorne, Falzschenkel, Anschlag, Laibungsschenkel (Öffnungsseite), Ende, Wandseite zurück, Falzkammer
  const front = [[S, -t], [-A, -t], [-A, R], [-t, R]];
  const back = form === "umfassung" ? [[-t, D + t], [S, D + t], [S, D], [0, D]] : [[-t, D], [0, D]];
  return [...front, ...back, [0, R - t], [-A + t, R - t], [-A + t, 0], [S, 0]];
}

/** Fläche eines Umrisses (Shoelace), positiv */
export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  return Math.abs(a) / 2;
}

/** Umriss gegen den Uhrzeigersinn (gespiegelte Profile drehen sonst die Flächenrichtung um) */
const ccw = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  return a < 0 ? pts.slice().reverse() : pts;
};

export const ZARGE = {
  label: "Stahlzarge",
  schema: [
    { key: "form", label: "Zargenform", type: "select", options: [["eck", "Eckzarge (Spiegel vorne, Laibungsschenkel)"], ["umfassung", "Umfassungszarge (um die ganze Wand)"]], default: "eck", tiles: "top", group: "Öffnung" },
    { key: "width", label: "Rohbauöffnung Breite", type: "num", default: "885", group: "Öffnung" },
    { key: "height", label: "Rohbauöffnung Höhe (ab OFF)", type: "num", default: "2010", group: "Öffnung" },
    { key: "wall", label: "Wanddicke", type: "num", default: "115", group: "Öffnung", when: (p) => p.form === "umfassung" },
    { key: "floor", label: "Bodeneinstand unter OFF", type: "num", default: "30", group: "Öffnung" },
    { key: "hinge", label: "Bandseite (von vorne gesehen)", type: "select", options: [["links", "links (DIN links)"], ["rechts", "rechts (DIN rechts)"]], default: "links", group: "Öffnung" },
    { key: "t", label: "Blechdicke", type: "num", default: "1.5", group: "Profil" },
    { key: "spiegel", label: "Spiegelbreite", type: "num", default: "50", group: "Profil" },
    { key: "falzB", label: "Falzbreite (Anschlag in der Öffnung)", type: "num", default: "15", group: "Profil" },
    { key: "falzT", label: "Falztiefe", type: "num", default: "27", group: "Profil" },
    { key: "leg", label: "Laibungsschenkel", type: "num", default: "60", group: "Profil", when: (p) => p.form !== "umfassung" },
    { key: "bands", label: "Bandtaschen", type: "num", default: "2", group: "Beschlag" },
    { key: "anchors", label: "Maueranker je Pfosten", type: "num", default: "3", group: "Befestigung" },
  ],

  plan(p) {
    const issues = [];
    const W = p.width, H = p.height, t = p.t, S = p.spiegel, A = p.falzB, R = p.falzT, e = p.floor;
    if (!(W >= 400 && W <= 3000)) throw fieldError("Breite 400 … 3000 mm", "width");
    if (!(H >= 1000 && H <= 4000)) throw fieldError("Höhe 1000 … 4000 mm", "height");
    if (!(t >= 0.75 && t <= 4)) throw fieldError("Blechdicke 0,75 … 4 mm", "t");
    if (!(e >= 0 && e <= 100)) throw fieldError("Bodeneinstand 0 … 100 mm", "floor");
    const umf = p.form === "umfassung", D = umf ? p.wall : p.leg;
    if (umf && !(D >= 60 && D <= 400)) throw fieldError("Wanddicke 60 … 400 mm", "wall");
    let prof;
    try { prof = zargeProfile({ form: p.form, S, A, R, D, t }); } catch (err) { throw fieldError(err.message, /Laibung|Wanddicke/.test(err.message) ? (umf ? "wall" : "leg") : "t"); }
    const area = polyArea(prof), dev = area / t;
    const out = { chains: [], members: [], plates: [], norms: [], drills: [], tubes: [] };
    const { plates } = out;
    const s2 = Math.SQRT1_2;
    // Zargenteil: Umriss in der Ebene (uDir, vDir = +y), ausgezogen längs dir ab p0 um L, Gehrungen als Schnittebenen
    const piece = (name, p0, dir, uDir, L, cutPlanes) => {
      const ylocal = [dir[1] * uDir[2] - dir[2] * uDir[1], dir[2] * uDir[0] - dir[0] * uDir[2], dir[0] * uDir[1] - dir[1] * uDir[0]];
      const sg = ylocal[1] >= 0 ? 1 : -1; // lokales y zeigt auf ±y (Wandtiefe)
      plates.push({ center: p0, xDir: uDir, normal: dir, poly: ccw(prof.map(([u, v]) => [u, sg * v])), W: S + A, H: D + 2 * t, t: L, name, cutPlanes,
        meta: { kantprofil: `${umf ? "Umfassungszarge" : "Eckzarge"} ${fmt(S)}/${fmt(A)}/${fmt(R)} × ${fmt(t)}`, abwicklung: Math.round(dev) } });
    };
    // Pfosten von −Einstand bis über den Sturz-Spiegel, Sturz über die ganze Breite samt Spiegeln; Gehrung unter 45°
    piece("Zarge Pfosten links", [0, 0, -e], [0, 0, 1], [-1, 0, 0], H + S + e, [{ p: [0, 0, H], n: [s2, 0, s2] }]);
    piece("Zarge Pfosten rechts", [W, 0, -e], [0, 0, 1], [1, 0, 0], H + S + e, [{ p: [W, 0, H], n: [-s2, 0, s2] }]);
    piece("Zarge Sturz", [-S, 0, H], [1, 0, 0], [0, 0, 1], W + 2 * S, [{ p: [0, 0, H], n: [-s2, 0, -s2] }, { p: [W, 0, H], n: [s2, 0, -s2] }]);

    // Bandtaschen und Schließblechkasten in der Falzkammer (hinter dem Falzschenkel, an dessen Innenseite)
    const hingeLeft = p.hinge !== "rechts";
    const cham = (x0, sx) => ({ x: x0 + sx * (A - t), dx: -sx }); // Innenseite Falzschenkel und Richtung in die Kammer
    const sideX = (left) => (left ? cham(0, 1) : cham(W, -1));
    const nb = Math.max(0, Math.min(4, Math.round(p.bands)));
    const bandZ = nb === 0 ? [] : nb === 1 ? [H - 300] : Array.from({ length: nb }, (_, k) => 250 + ((H - 300 - 250) * k) / (nb - 1));
    const pocketT = 2, chamberW = A - 2 * t;
    if (chamberW < pocketT + 1) issues.push({ key: "falzB", level: "Hinweis", message: "Falzkammer zu schmal für Bandtaschen – Falzbreite vergrößern" });
    else {
      const hs = sideX(hingeLeft);
      bandZ.forEach((z, k) => plates.push({ center: [hs.x, (R - t) / 2, z], xDir: [0, 0, 1], normal: [hs.dx, 0, 0], W: 120, H: R - t - 2, t: pocketT, name: `Bandtasche ${k + 1}` }));
      const ls = sideX(!hingeLeft), zl = 1050;
      plates.push({ center: [ls.x, (R - t) / 2, zl], xDir: [0, 0, 1], normal: [ls.dx, 0, 0], W: 200, H: R - t - 2, t: pocketT, name: "Schließblechkasten" });
    }

    // Maueranker: Flachstahl 30 × 3 außen am Laibungsschenkel (u = 0), in die Wand
    const na = Math.max(0, Math.min(6, Math.round(p.anchors)));
    if (na > 0) {
      const zs = Array.from({ length: na }, (_, k) => (na === 1 ? H / 2 : 250 + ((H - 500) * k) / (na - 1)));
      const vy = umf ? D / 2 : (R + D) / 2;
      for (const [x0, sx, side] of [[0, -1, "links"], [W, 1, "rechts"]]) zs.forEach((z, k) => plates.push({ center: [x0 + (sx * 80) / 2, vy, z - 1.5], xDir: [sx, 0, 0], normal: [0, 0, 1], W: 80, H: 30, t: 3, name: `Maueranker ${side} ${k + 1}` }));
    }
    issues.push({ key: "hinge", level: "Hinweis", message: "Bänder und Schließblech gehören zum Türblatt-Beschlag und werden nicht erzeugt; Zarge mit Spreize einbauen" });
    const clearW = W - 2 * A, clearH = H - A;
    const info = `${umf ? "Umfassungszarge" : "Eckzarge"} ${fmt(S)}/${fmt(A)}/${fmt(R)} × ${fmt(t)} für Rohbauöffnung ${Math.round(W)} × ${Math.round(H)} mm, `
      + `lichter Durchgang ${Math.round(clearW)} × ${Math.round(clearH)} mm, Zuschnittbreite der Abwicklung ${Math.round(dev)} mm, Bandseite ${hingeLeft ? "links" : "rechts"}, ${nb} Bandtaschen, ${na * 2} Maueranker`;
    return { ...out, info, issues };
  },

  parts: { form: /^Zarge/, width: /^Zarge/, height: /^Zarge/, t: /^Zarge/, spiegel: /^Zarge/, falzB: /^Zarge/, falzT: /^Zarge/, leg: /^Zarge/, wall: /^Zarge/, bands: /^Bandtasche/, anchors: /^Maueranker/, hinge: /^(Bandtasche|Schließblech)/ },
  views: ["front", "top"],
  dims(p, plan, view) {
    const gap = 120, r = Math.round;
    if (view === "top") return [{ key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) }];
    return [{ key: "width", a: [0, p.height], b: [p.width, p.height], off: gap, text: r(p.width) }, { key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }];
  },
};
