// Lamellendach / Pergola (N4, W15): vier Stützen (an der Wand: zwei) mit Fußplatten, umlaufender Rahmen aus
// Rechteckrohr (zugleich Rinne), drehbare Lamellen quer zwischen vorderem und hinterem Rahmen mit Achsbolzen und
// Endkappen, Entwässerung durch eine Stütze (Ablauf im Rahmen, Auslass unten an der Stütze). Reine Rechnung, keine
// Statik; Antrieb (Motor, Koppelstange) wird nicht erzeugt.
//
// Lage: Breite in x (0 … Breite), Tiefe in y (y = 0 vorne, y = Tiefe hinten bzw. Wand), Gelände z = 0. Die Lamellen
// spannen in y, liegen nebeneinander in x und drehen um ihre Längsachse (0° = geschlossen/waagrecht, 90° = offen).
// »Höhe« ist die lichte Höhe unter dem Rahmen.

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { platePlan } from "./anschluss.js";
import { sectionGeometry } from "./sections.js";

const DEG = Math.PI / 180;
const ALU = 2.7;

export const PERGOLA = {
  label: "Lamellendach / Pergola",
  schema: [
    { key: "form", label: "Form", type: "select", options: [["frei", "freistehend (4 Stützen)"], ["wand", "an der Wand (2 Stützen)"]], default: "frei", tiles: "side", group: "Dach" },
    { key: "width", label: "Breite (Lamellen nebeneinander)", type: "num", default: "4000", group: "Dach" },
    { key: "depth", label: "Tiefe (Spannweite der Lamellen)", type: "num", default: "3500", group: "Dach" },
    { key: "height", label: "Lichte Höhe unter dem Rahmen", type: "num", default: "2500", group: "Dach" },
    { key: "material", label: "Werkstoff", type: "select", options: [["alu", "Aluminium (pulverbeschichtet)"], ["stahl", "Stahl verzinkt"]], default: "alu", group: "Dach" },
    { key: "frame", label: "Rahmen (zugleich Rinne)", type: "section", kinds: ["rechteck", "vierkant"], default: { kind: "rechteck", size: "200x120x6.3" }, group: "Tragwerk" },
    { key: "post", label: "Stützen", type: "section", kinds: ["vierkant", "rechteck"], default: { kind: "vierkant", size: "120x5" }, group: "Tragwerk" },
    { key: "baseT", label: "Fußplatte Dicke", type: "num", default: "15", group: "Tragwerk" },
    { key: "wallT", label: "Wandplatte Dicke", type: "num", default: "12", group: "Tragwerk", when: (p) => p.form === "wand" },
    { key: "lamW", label: "Lamellenbreite", type: "num", default: "200", group: "Lamellen" },
    { key: "lamT", label: "Lamellendicke", type: "num", default: "40", group: "Lamellen" },
    { key: "angle", label: "Stellung (0° zu, 90° offen)", type: "num", unit: "°", default: "45", group: "Lamellen" },
    { key: "axleD", label: "Achsbolzen Ø", type: "num", default: "12", group: "Lamellen" },
    { key: "drain", label: "Ablauf durch Stütze", type: "check", default: true, group: "Lamellen" },
  ],

  plan(p) {
    const issues = [];
    const W = p.width, D = p.depth, H = p.height, wand = p.form === "wand";
    if (!(W >= 1500 && W <= 8000)) throw fieldError("Breite 1500 … 8000 mm", "width");
    if (!(D >= 1500 && D <= 6000)) throw fieldError("Tiefe 1500 … 6000 mm", "depth");
    if (!(H >= 1800)) throw fieldError("Lichte Höhe mindestens 1800 mm", "height");
    if (!(p.angle >= 0 && p.angle <= 90)) throw fieldError("Stellung 0 … 90°", "angle");
    const dens = p.material === "alu" ? { density: ALU } : {};
    const members = [], plates = [], drills = [], chains = [], norms = [];
    // Rahmen hochkant, rundum auf Gehrung
    const fr = p.frame, fRot = orientRot(fr, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1] });
    const { high: fh, wide: fw } = rotExtent(fr, fRot);
    const post = p.post, cw = Math.max(post.geom.width, post.geom.height);
    if (cw > fw + 1e-6) issues.push({ key: "post", level: "Hinweis", message: `Stütze ${Math.round(cw)} mm breiter als der Rahmen (${Math.round(fw)} mm) – steht innen über` });
    const tw = wand ? p.wallT : 0;
    const zc = H + fh / 2;
    const C = [[0, 0], [W, 0], [W, D - tw], [0, D - tw]];
    const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]];
    const sideName = ["Rahmen vorne", "Rahmen rechts", wand ? "Rahmen Wand" : "Rahmen hinten", "Rahmen links"];
    for (let i = 0; i < 4; i++) {
      const P = C[i], Q = C[(i + 1) % 4], d = [Math.sign(Q[0] - P[0]), Math.sign(Q[1] - P[1])], n = inward[i];
      const off = (q) => [q[0] + (n[0] * fw) / 2, q[1] + (n[1] * fw) / 2, zc];
      // Gehrungsebene durch die Außenecke, entlang der Diagonale zur Innenecke; Normale vom Stab weg
      const mit = (corner, inPrev, sgn) => {
        const diag = [inPrev[0] + n[0], inPrev[1] + n[1]];
        let m = [diag[1], -diag[0]];
        if ((m[0] * d[0] + m[1] * d[1]) * sgn < 0) m = [-m[0], -m[1]];
        const l = Math.hypot(m[0], m[1]);
        return { p: [corner[0], corner[1], zc], n: [m[0] / l, m[1] / l, 0] };
      };
      members.push({ section: fr, a: [d[0] ? P[0] : off(P)[0], d[1] ? P[1] : off(P)[1], zc],
        b: [d[0] ? Q[0] : off(Q)[0], d[1] ? Q[1] : off(Q)[1], zc], name: sideName[i], up: [0, 0, 1], rot: fRot, ...dens,
        cuts: { start: [mit(P, inward[(i + 3) % 4], -1)], end: [mit(Q, inward[(i + 1) % 4], 1)] } });
    }
    // Stützen unter den Rahmenecken (an der Wand nur vorne), Fußplatten
    const pc = fw / 2, corners = wand ? [[pc, pc], [W - pc, pc]] : [[pc, pc], [W - pc, pc], [W - pc, D - pc], [pc, D - pc]];
    corners.forEach(([x, y], k) => {
      members.push({ section: post, a: [x, y, p.baseT], b: [x, y, H], name: `Stütze ${k + 1}`, up: [1, 0, 0], ...dens });
      const bp = platePlan({ width: post.geom.width, height: post.geom.height }, { thickness: p.baseT, width: cw + 120, height: cw + 120, holes: 4, holeDia: 14, edge: 25 });
      plates.push({ center: [x, y, 0], xDir: [1, 0, 0], normal: [0, 0, 1], W: bp.W, H: bp.H, t: p.baseT, holes: bp.holes, d: bp.d, name: `Fußplatte ${k + 1}`, ...dens });
    });
    // Wandplatten (an der Wand): unter dem Wandrahmen alle ≤ 1500 mm
    if (wand) {
      const m = Math.max(2, Math.ceil(W / 1500) + 1), Wp = 160, Hp = fh + 80;
      for (let k = 0; k < m; k++) {
        const x = 100 + ((W - 200) * k) / (m - 1);
        plates.push({ center: [x, D, zc], xDir: [1, 0, 0], normal: [0, -1, 0], W: Wp, H: Hp, t: tw, holes: [[-Wp / 2 + 30, -Hp / 2 + 25], [Wp / 2 - 30, -Hp / 2 + 25], [-Wp / 2 + 30, Hp / 2 - 25], [Wp / 2 - 30, Hp / 2 - 25]], d: 14, name: `Wandplatte ${k + 1}` });
      }
      issues.push({ key: "form", level: "Hinweis", message: "Dübel bzw. Anker der Wandplatten nach Wandbaustoff und Last wählen – werden nicht erzeugt" });
    }
    // Lamellen: Achse in y auf Rahmenmitte, gleichmäßig verteilt (Luft 10 mm, damit sie in jeder Stellung frei drehen)
    const lw = p.lamW, lt = p.lamT, ad = p.axleD, cap = 5, gap = 5;
    if (!(lw >= 100 && lw <= 300 && lt >= 20 && lt < lw)) throw fieldError("Lamelle: Breite 100 … 300 mm, Dicke 20 mm bis Breite", "lamW");
    if (!(Math.hypot(lw, lt) < fh * 2 + 1e-6)) issues.push({ key: "lamW", level: "Hinweis", message: "Lamelle offen höher als der Rahmen – steht oben und unten über" });
    const lam = { kind: "rechteck", dims: { B: lt, H: lw, t: 2, r: 0 }, geom: sectionGeometry("rechteck", { B: lt, H: lw, t: 2, r: 0 }) };
    const th = p.angle * DEG, wdir = [Math.cos(th), 0, Math.sin(th)];
    const lRot = orientRot(lam, [0, 1, 0], [0, 0, 1], { tall: wdir });
    const x0 = fw + 10, x1 = W - fw - 10, pitch = lw + 10, n = Math.max(1, Math.floor((x1 - x0 - lw) / pitch) + 1);
    const step = n > 1 ? (x1 - x0 - lw) / (n - 1) : 0;
    const y0 = fw + cap + gap, y1 = D - tw - fw - cap - gap, L = y1 - y0;
    if (L > 4500) issues.push({ key: "depth", level: "Warnung", message: `Lamellen ${Math.round(L)} mm lang – Aluminiumlamellen spannen meist höchstens 4,5 m (Durchbiegung)` });
    const rund = { kind: "rund", dims: { D: ad }, geom: sectionGeometry("rund", { D: ad }) };
    for (let k = 0; k < n; k++) {
      const x = n > 1 ? x0 + lw / 2 + k * step : (x0 + x1) / 2, name = `Lamelle ${k + 1}`;
      members.push({ section: lam, a: [x, y0, zc], b: [x, y1, zc], name, up: [0, 0, 1], rot: lRot, ...dens });
      // Endkappen (Kunststoff) zwischen Lamelle und Rahmen, Achsbolzen durch Rahmenwand und Kappe in die Lamelle
      for (const [yi, yo, sg, end] of [[fw, y0, 1, "vorne"], [D - tw - fw, y1, -1, "hinten"]]) {
        plates.push({ center: [x, yi + sg * gap, zc], xDir: wdir, normal: [0, sg, 0], W: lw, H: lt, t: cap, holes: [[0, 0, ad]], d: ad, name: `${name} Endkappe ${end}`, density: 1.2 });
        members.push({ section: rund, a: [x, yi - sg * 25, zc], b: [x, yo + sg * 40, zc], name: `${name} Achsbolzen ${end}`, up: [1, 0, 0] });
        drills.push({ target: sg > 0 ? sideName[0] : sideName[2], p: [x, yi + sg * 2, zc], dir: [0, -sg, 0], len: 30, d: ad + 0.5 });
      }
    }
    // Entwässerung: Ablauf im vorderen Rahmen über Stütze 1, Auslass unten an der Stütze (zur Innenseite)
    if (p.drain) {
      const [x, y] = corners[0];
      drills.push({ target: sideName[0], p: [x + 40, y, H + 15], dir: [0, 0, -1], len: 30, d: 40 });
      drills.push({ target: "Stütze 1", p: [x, y + cw / 2 + 1, p.baseT + 120], dir: [0, -1, 0], len: 12, w: 60, h: 100, xDir: [1, 0, 0] });
    }
    issues.push({ key: "post", level: "Hinweis", message: "Stützen eingespannt bzw. Rahmen biegesteif, Wind- und Schneelast statisch nachweisen" });
    const open = Math.round((n * lw * L) / 1e6 * 10) / 10;
    const info = `Lamellendach ${Math.round(W)} × ${Math.round(D)} mm${wand ? " an der Wand" : ""}, ${corners.length} Stützen, ${n} Lamellen ${Math.round(lw)} × ${Math.round(lt)} mm (Länge ${Math.round(L)} mm) auf ${String(Math.round(p.angle))}°, Achsbolzen Ø ${ad}, ` +
      `Lamellenfläche ${String(open).replace(".", ",")} m², ${p.material === "alu" ? "Aluminium" : "Stahl verzinkt"}` + (p.drain ? ", Ablauf durch Stütze 1" : "") + " – Antrieb (Motor, Koppelstange) nicht dargestellt";
    return { chains, members, plates, drills, norms, info, issues };
  },

  parts: { frame: /^Rahmen/, post: /^(Stütze|Fußplatte)/, lamW: /^Lamelle/, lamT: /^Lamelle/, angle: /^Lamelle/, axleD: /Achsbolzen/, wallT: /^Wandplatte/ },
  views: ["side", "top"],
  dims(p, plan, view) {
    const gap = Math.max(200, p.depth * 0.06), r = Math.round;
    if (view === "top") return [{ key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) }, { key: "depth", a: [p.width, 0], b: [p.width, p.depth], off: -gap, text: r(p.depth) }];
    return [{ key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }, { key: "depth", a: [0, 0], b: [p.depth, 0], off: -gap, text: r(p.depth) }];
  },
};
