// Stützenfuß mit Ankern (Stahlbau-Lücken ST3): Fußplatte mit Ankerlöchern, Steifen, Ankerstangen mit Unterlegplatte und
// Mutter, Justiermuttern in der Mörtelfuge, Schubknagge. Reine Rechnung (Bauplan wie generator.js), keine Statik.
//
// Lage: Oberkante Fundament z = 0, Mörtelfuge bis z = g, Fußplatte darauf, Stütze ab Oberkante Fußplatte in +Z.
// Stütze mit der Profilhöhe entlang X (Steg in der XZ-Ebene), Flansche quer in Y.

import { NORM_THREADS } from "./normteile.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const ANCHOR_OPTS = ["M16", "M20", "M24", "M27", "M30"].map((s) => [s, s]);
/** Ankerloch in der Fußplatte: d + 6 mm (Fundamentschrauben, Lagetoleranz) */
export const anchorHole = (size) => NORM_THREADS[size].d + 6;
/** Unterlegplatte je Anker: Kantenlänge, Dicke (nach Gewinde) */
export const anchorWasher = (size) => { const d = NORM_THREADS[size].d; return { a: Math.round(3 * d / 5) * 5, t: d <= 20 ? 8 : 10, hole: d + 2 }; };

/** Grundriss der Stütze: halbe Maße entlang X (Profilhöhe) und Y (Breite), rund oder eckig */
function footprint(c) {
  if (c.kind === "rohr") return { hx: c.dims.D / 2, hy: c.dims.D / 2, round: true };
  if (c.kind === "vierkant") return { hx: c.dims.B / 2, hy: c.dims.B / 2 };
  if (c.kind === "rechteck") return { hx: c.dims.H / 2, hy: c.dims.B / 2 };
  return { hx: c.dims.H / 2, hy: c.dims.B / 2 }; // I-Profile: H entlang X, B entlang Y
}

/** Ankerlagen (x, y) auf der Platte L × B mit Randabstand e */
export function anchorLayout(n, L, B, e) {
  const x = L / 2 - e, y = B / 2 - e;
  const pts = [[-x, -y], [x, -y], [x, y], [-x, y]];
  if (n >= 6) pts.push([0, -y], [0, y]);
  if (n >= 8) pts.push([-x, 0], [x, 0]);
  return pts;
}

export const STUETZENFUSS = {
  label: "Stützenfuß",
  schema: [
    { key: "column", label: "Stütze", type: "section", kinds: ["hea", "heb", "ipe", "rechteck", "vierkant", "rohr"], default: { kind: "heb", size: "200" }, group: "Stütze" },
    { key: "colLen", label: "Stützenlänge im Modell", type: "num", default: "1000", group: "Stütze" },
    { key: "plateT", label: "Fußplatte Dicke", type: "num", default: "25", group: "Fußplatte" },
    { key: "overX", label: "Überstand in X (Profilhöhe)", type: "num", default: "80", group: "Fußplatte" },
    { key: "overY", label: "Überstand in Y (Breite)", type: "num", default: "60", group: "Fußplatte" },
    { key: "anchors", label: "Anzahl Anker", type: "select", options: [["4", "4"], ["6", "6"], ["8", "8"]], default: "4", group: "Anker" },
    { key: "anchor", label: "Ankergewinde", type: "select", options: ANCHOR_OPTS, default: "M20", group: "Anker" },
    { key: "edge", label: "Randabstand Ankerloch", type: "num", default: "45", group: "Anker" },
    { key: "embed", label: "Verankerungslänge unter OK Fundament", type: "num", default: "300", group: "Anker" },
    { key: "grade", label: "Festigkeit", type: "select", options: [["4.8", "4.8"], ["8.8", "8.8"], ["A4-70", "A4-70"]], default: "4.8", group: "Anker" },
    { key: "grout", label: "Mörtelfuge", type: "num", default: "30", group: "Fundament" },
    { key: "level", label: "Justiermuttern unter der Platte", type: "check", default: true, group: "Fundament" },
    { key: "stiff", label: "Steifen", type: "check", default: true, group: "Steifen" },
    { key: "stiffT", label: "Steifendicke", type: "num", default: "12", group: "Steifen", when: (p) => p.stiff },
    { key: "stiffH", label: "Steifenhöhe", type: "num", default: "150", group: "Steifen", when: (p) => p.stiff },
    { key: "key", label: "Schubknagge", type: "check", default: false, group: "Schubknagge" },
    { key: "keyProfile", label: "Knaggenprofil", type: "section", kinds: ["ipe", "hea", "heb", "flach"], default: { kind: "ipe", size: "100" }, group: "Schubknagge", when: (p) => p.key },
    { key: "keyLen", label: "Knaggenlänge (in die Aussparung)", type: "num", default: "100", group: "Schubknagge", when: (p) => p.key },
  ],
  plan(p) {
    const issues = [];
    const c = p.column, fp = footprint(c);
    const t = p.plateT, g = p.grout, e = p.edge;
    if (!(t > 0 && g >= 0 && p.colLen > 0)) throw new Error("Plattendicke, Mörtelfuge und Stützenlänge prüfen");
    if (!(p.overX >= 0 && p.overY >= 0)) throw new Error("Überstände ≥ 0");
    const L = 2 * (fp.hx + p.overX), B = 2 * (fp.hy + p.overY);
    const th = NORM_THREADS[p.anchor], d0 = anchorHole(p.anchor), wa = anchorWasher(p.anchor);
    if (!(e >= d0 / 2 + 5)) throw new Error(`Randabstand mindestens ${fmt(d0 / 2 + 5)} mm`);
    if (e < 1.2 * d0) issues.push({ key: "edge", level: "Hinweis", message: `Randabstand ${fmt(e)} mm < 1,2 · d0 = ${fmt(1.2 * d0)} mm (EN 1993-1-8)` });
    const n = Number(p.anchors);
    const pts = anchorLayout(n, L, B, e);
    const members = [], plates = [], chains = [], norms = [];
    const zp = g, zt = g + t;
    // Anker frei von Stütze und Schweißnaht (10 mm)
    const clear = d0 / 2 + 10;
    for (const [x, y] of pts) {
      const hit = fp.round ? Math.hypot(x, y) < fp.hx + clear : Math.abs(x) < fp.hx + clear && Math.abs(y) < fp.hy + clear;
      if (hit) { issues.push({ key: n === 4 ? "overX" : "anchors", level: "Warnung", message: `Ankerloch bei x ${fmt(x)}, y ${fmt(y)} liegt unter der Stütze – Überstand vergrößern` }); break; }
    }
    if (wa.a / 2 > e + 1e-6) issues.push({ key: "edge", level: "Hinweis", message: `Unterlegplatte ${wa.a} mm steht über den Plattenrand – Randabstand ≥ ${fmt(wa.a / 2)} mm` });
    plates.push({ center: [0, 0, zp], xDir: [1, 0, 0], normal: [0, 0, 1], W: L, H: B, t, holes: pts.map(([x, y]) => [x, y]), d: d0, name: "Fußplatte" });
    // Stütze
    members.push({ section: c, a: [0, 0, zt], b: [0, 0, zt + p.colLen], name: "Stütze", up: [1, 0, 0], rot: 0 });
    // Steifen: an den Außenseiten der Stütze bis zum Plattenrand, Ecke am Profil 15 mm freigeschnitten, Oberkante schräg
    let nStiff = 0;
    if (p.stiff) {
      const ts = p.stiffT, hs = p.stiffH, sn = 15;
      if (!(ts > 0 && hs > sn + 10)) throw new Error("Steifendicke und -höhe prüfen");
      const sides = [
        { x0: fp.hx, len: p.overX, xDir: [1, 0, 0], normal: [0, -1, 0], c: (x0) => [x0, ts / 2, zt] },
        { x0: fp.hx, len: p.overX, xDir: [-1, 0, 0], normal: [0, 1, 0], c: (x0) => [-x0, -ts / 2, zt] },
      ];
      // Hohlprofile und Rohre: auch auf den Breitseiten (bei I-Profilen stört dort der Flansch nicht, aber die Anker)
      if (c.kind === "rechteck" || c.kind === "vierkant" || c.kind === "rohr") sides.push(
        { x0: fp.hy, len: p.overY, xDir: [0, 1, 0], normal: [1, 0, 0], c: (x0) => [-ts / 2, x0, zt] },
        { x0: fp.hy, len: p.overY, xDir: [0, -1, 0], normal: [-1, 0, 0], c: (x0) => [ts / 2, -x0, zt] },
      );
      for (const s of sides) {
        const len = s.len - 5;
        if (len < 2 * sn) { issues.push({ key: "stiff", level: "Hinweis", message: "Überstand zu klein für Steifen" }); break; }
        const poly = [[sn, 0], [len, 0], [len, Math.min(25, hs)], [0, hs], [0, sn]];
        plates.push({ center: s.c(s.x0), xDir: s.xDir, normal: s.normal, poly, W: len, H: hs, t: ts, name: `Steife ${++nStiff}` });
      }
      // Anker dicht an der Steife?
      if (pts.some(([x, y]) => Math.abs(y) < ts / 2 + wa.a / 2 + 2 && Math.abs(x) > fp.hx)) issues.push({ key: "anchors", level: "Warnung", message: "Unterlegplatte stößt an eine Steife – Anzahl Anker oder Lage ändern" });
    }
    // Anker: Gewindestange von unten bis über die Mutter, Unterlegplatte und Mutter oben, Justiermutter + Scheibe unten
    const rodLen = Math.ceil((p.embed + zt + wa.t + th.m + 2 * th.P) / 10) * 10;
    const nutGrade = p.grade === "A4-70" ? "A4-70" : p.grade === "8.8" ? "8" : "5";
    pts.forEach(([x, y], i) => {
      norms.push({ kind: "gewindestange", size: p.anchor, length: rodLen, grade: p.grade, pos: [x, y, -p.embed], dir: [0, 0, 1], name: `Anker ${i + 1}` });
      plates.push({ center: [x, y, zt], xDir: [1, 0, 0], normal: [0, 0, 1], W: wa.a, H: wa.a, t: wa.t, holes: [[0, 0]], d: wa.hole, name: `Unterlegplatte ${i + 1}` });
      norms.push({ kind: "mutter", size: p.anchor, grade: nutGrade, pos: [x, y, zt + wa.t], dir: [0, 0, 1] });
      if (p.level && g >= th.m + th.h) {
        norms.push({ kind: "scheibe", size: p.anchor, grade: p.grade === "A4-70" ? "A4" : "200 HV", pos: [x, y, zp - th.h], dir: [0, 0, 1] });
        norms.push({ kind: "mutter", size: p.anchor, grade: nutGrade, pos: [x, y, zp - th.h - th.m], dir: [0, 0, 1] });
      }
    });
    if (p.level && g < th.m + th.h) issues.push({ key: "grout", level: "Hinweis", message: `Mörtelfuge ${fmt(g)} mm zu niedrig für Justiermuttern (mind. ${fmt(th.m + th.h)} mm)` });
    if (g < 20 || g > 50) issues.push({ key: "grout", level: "Hinweis", message: "Mörtelfuge üblich 20 … 50 mm" });
    // Schubknagge unter der Platte
    if (p.key) {
      const k = p.keyProfile;
      if (!(p.keyLen > 0)) throw new Error("Knaggenlänge > 0");
      members.push({ section: k, a: [0, 0, zp], b: [0, 0, zp - p.keyLen], name: "Schubknagge", up: [1, 0, 0], rot: 0 });
      if (p.keyLen <= g) issues.push({ key: "keyLen", level: "Warnung", message: "Schubknagge reicht nicht bis ins Fundament (länger als die Mörtelfuge)" });
    }
    const info = `Fußplatte ${Math.round(L)} × ${Math.round(B)} × ${fmt(t)} mm, ${n} Anker ${p.anchor} × ${rodLen} - ${p.grade} (Loch Ø ${fmt(d0)}), Unterlegplatten ${wa.a} × ${wa.a} × ${wa.t}`
      + (nStiff ? `, ${nStiff} Steifen ${fmt(p.stiffT)} mm` : "") + (p.key ? `, Schubknagge ${p.keyProfile.kind.toUpperCase()} ${p.keyProfile.size}` : "") + `; Mörtelfuge ${fmt(g)} mm – statisch nicht nachgewiesen`;
    return { chains, members, plates, norms, info, issues };
  },
};
