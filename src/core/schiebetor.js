// Schiebetor-Generator (E8): freitragendes Schiebetor mit Gegengewicht (Schwanz), Laufprofil auf zwei Rollenböcken,
// Führungspfosten und Fangpfosten. Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage (geschlossen): Tor in der XZ-Ebene, Boden bei z = 0, lichte Öffnung von x = 0 (Führungspfosten) bis Breite
// (Fangpfosten). Der Flügel reicht hinten um das Gegengewicht über x = 0 hinaus (bis x = −Gegengewicht) und öffnet
// nach −x; die Rollenböcke stehen unter dem Gegengewicht, so dass der Flügel offen wie geschlossen auf ihnen liegt.
// »Teil« trennt Flügel und feste Teile, damit daraus zwei Bauteile einer Baugruppe mit Schiebegelenk werden.

const isLeaf = (name) => name.startsWith("Flügel");

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { sectionGeometry } from "./sections.js";
import { capPlate } from "./handlaufhalter.js";
export const SCHIEBETOR = {
  label: "Schiebetor",
  schema: [
    { key: "width", label: "Durchfahrt (lichte Öffnung)", type: "num", default: "4000", group: "Tor" },
    { key: "height", label: "Höhe Flügel (mit Laufprofil)", type: "num", default: "1400", group: "Tor" },
    { key: "clearance", label: "Bodenfreiheit", type: "num", default: "60", group: "Tor" },
    { key: "tail", label: "Gegengewicht (0 = 40 % der Öffnung)", type: "num", default: "0", group: "Tor" },
    { key: "tailForm", label: "Gegengewicht", type: "select", options: [["gerade", "rechteckig"], ["schraeg", "abgeschrägt"]], default: "schraeg", tiles: "front", group: "Tor" },
    { key: "teil", label: "Teil", type: "select", options: [["alles", "alles"], ["fluegel", "nur Flügel (bewegt)"], ["fest", "nur feste Teile"]], default: "alles", group: "Tor" },
    { key: "frame", label: "Rahmen", type: "section", default: { kind: "vierkant", size: "60x3" }, group: "Rahmen und Füllung" },
    { key: "beam", label: "Laufprofil", type: "section", default: { kind: "rechteck", size: "120x80x5" }, group: "Rahmen und Füllung" },
    { key: "fill", label: "Füllung", type: "select", options: [["staketen", "Staketen"], ["quer", "Querstäbe"], ["keine", "keine"]], default: "staketen", tiles: "front", group: "Rahmen und Füllung" },
    { key: "bar", label: "Stäbe", type: "section", default: { kind: "vierkant", size: "20x2" }, group: "Rahmen und Füllung", when: (p) => p.fill !== "keine" },
    { key: "gapMax", label: "Öffnung max.", type: "num", default: "110", group: "Rahmen und Füllung", when: (p) => p.fill !== "keine" },
    { key: "rollerL", label: "Rollenbock Länge", type: "num", default: "250", group: "Rollen und Pfosten" },
    { key: "rollerDepth", label: "Rollenbock im Fundament", type: "num", default: "100", group: "Rollen und Pfosten" },
    { key: "posts", label: "Führungs- und Fangpfosten", type: "check", default: true, group: "Rollen und Pfosten" },
    { key: "post", label: "Pfostenprofil", type: "section", default: { kind: "vierkant", size: "100x4" }, group: "Rollen und Pfosten", when: (p) => p.posts },
    { key: "postTop", label: "Pfosten über Flügel", type: "num", default: "50", group: "Rollen und Pfosten", when: (p) => p.posts },
    { key: "embed", label: "Einbetonieren (unter Boden)", type: "num", default: "600", group: "Rollen und Pfosten", when: (p) => p.posts },
  ],

  plan(p) {
    const issues = [];
    const W = p.width, H = p.height, z0 = p.clearance;
    const T = p.tail > 0 ? p.tail : Math.round(W * 0.4);
    const beamRot = orientRot(p.beam, [1, 0, 0], [0, -1, 0], { open: [0, 0, -1], legs: [0, 1, -1], stem: [0, 0, 1] });
    const fw = p.frame.geom.width, bh = rotExtent(p.beam, beamRot).wide;
    if (!(W > 1000)) throw fieldError("Durchfahrt mindestens 1000 mm", "width");
    const rb0 = Math.max(fw, p.posts ? p.post.geom.width + 20 : 0);
    if (!(T >= 2 * p.rollerL + fw + rb0)) throw fieldError(`Gegengewicht zu kurz für zwei Rollenböcke (mindestens ${Math.ceil(2 * p.rollerL + fw + rb0)} mm)`, "tail");
    if (!(H > bh + 4 * fw)) throw fieldError("Höhe zu klein", "height");
    if (T < W * 0.35) issues.push({ key: "tail", level: "Warnung", message: `Gegengewicht ${Math.round(T)} mm kürzer als 35 % der Öffnung – Flügel kippt leicht` });
    const members = [], chains = [], plates = [];
    const up = [0, -1, 0]; // Profilbreite in der Torebene, Profilhöhe quer dazu
    const P = (x, z) => [x, 0, z];
    const xs = -T;
    // Laufprofil unter dem ganzen Flügel, darauf der Rahmen
    // Laufprofil: U/UPN wie das C-Laufprofil offen nach unten zu den Rollen
    members.push({ section: p.beam, a: P(xs, z0 + bh / 2), b: P(W, z0 + bh / 2), name: "Flügel Laufprofil", up, rot: beamRot });
    const zb = z0 + bh + fw / 2, zt = z0 + H - fw / 2;
    const zEnd = p.tailForm === "schraeg" ? zb + Math.max(2 * fw, (zt - zb) * 0.25) : zt;
    const topAt = (x) => (x >= 0 ? zt : zEnd + ((zt - zEnd) * (x - (xs + fw / 2))) / (-(xs + fw / 2)));
    chains.push({ section: p.frame, points: [P(xs + fw / 2, zb), P(W - fw / 2, zb), P(W - fw / 2, zt), P(0, zt), P(xs + fw / 2, zEnd), P(xs + fw / 2, zb)], name: "Flügel Rahmen", up, closed: true });
    // Senkrechte an der Durchfahrt; im Gegengewicht Strebe (abgeschrägt) bzw. Diagonale (rechteckig)
    // Unterseiten der Riegel als Schnittebenen: waagrechter Oberriegel und schräger Riegel über dem Gegengewicht
    const xT = xs + fw / 2, sl = (zt - zEnd) / -xT, kS = Math.hypot(1, sl), nS = [-sl / kS, 0, 1 / kS];
    const underTop = { p: P(0, zt - fw / 2), n: [0, 0, 1] }, underSlope = { p: P(0, zt - (fw / 2) * kS), n: nS };
    const onTop = (x) => (x >= 0 || p.tailForm !== "schraeg" ? [underTop] : [underSlope]);
    const lowCut = { p: P(0, zb + fw / 2), n: [0, 0, -1] };
    // Senkrechte an der Durchfahrt: oben an beiden Riegelunterseiten (Ecke des Rahmens über ihr)
    members.push({ section: p.frame, a: P(0, zb + fw / 2), b: P(0, zt), name: "Flügel Pfosten", up, cuts: { start: [], end: p.tailForm === "schraeg" ? [underTop, underSlope] : [underTop] } });
    if (p.tailForm === "schraeg") members.push({ section: p.frame, a: P(xs / 2, zb + fw / 2), b: P(xs / 2, topAt(xs / 2) + fw), name: "Flügel Strebe", up, cuts: { start: [], end: onTop(xs / 2) } });
    else {
      // Diagonale vom Fuß der hinteren Senkrechten zum Kopf der Senkrechten an der Durchfahrt, an Riegeln und Senkrechten angepasst
      const a = [xs + fw * 1.5, 0, zb + fw / 2], b = [-fw, 0, zt - fw / 2], u = [b[0] - a[0], 0, b[2] - a[2]], lu = Math.hypot(...u);
      const ex = (q, k) => q.map((v, i) => v + (u[i] / lu) * k * 2 * fw);
      members.push({ section: p.frame, a: ex(a, -1), b: ex(b, 1), name: "Flügel Diagonale", up, cuts: { start: [lowCut, { p: P(xs + fw, 0), n: [-1, 0, 0] }], end: [underTop, { p: P(-fw / 2, 0), n: [1, 0, 0] }] } });
    }
    // Füllung in der Durchfahrt
    let nBars = 0, gapSeen = 0;
    const xl = fw / 2, xr = W - fw, lo = zb + fw / 2, hi = zt - fw / 2;
    if (p.fill === "staketen") {
      const bw = p.bar.geom.height, clear = xr - xl;
      nBars = Math.max(0, Math.ceil((clear - p.gapMax) / (bw + p.gapMax) - 1e-9));
      gapSeen = (clear - nBars * bw) / (nBars + 1);
      for (let k = 0; k < nBars; k++) {
        const x = xl + gapSeen * (k + 1) + bw * k + bw / 2;
        members.push({ section: p.bar, a: P(x, lo), b: P(x, hi), name: `Flügel Stab ${k + 1}`, up: [1, 0, 0] });
      }
    } else if (p.fill === "quer") {
      const bw = p.bar.geom.height, clear = hi - lo;
      nBars = Math.max(0, Math.ceil((clear - p.gapMax) / (bw + p.gapMax) - 1e-9));
      gapSeen = (clear - nBars * bw) / (nBars + 1);
      for (let k = 0; k < nBars; k++) {
        const z = lo + gapSeen * (k + 1) + bw * k + bw / 2;
        members.push({ section: p.bar, a: P(xl, z), b: P(xr, z), name: `Flügel Querstab ${k + 1}`, up: [0, 0, 1] });
      }
    }
    // Rollenböcke unter dem Gegengewicht (Oberkante = Unterkante Laufprofil)
    // Rollenbock 1 hinter dem Führungspfosten (sonst steht er im Pfosten)
    const depth = p.beam.geom.height + 80, m = Math.max(fw, p.posts ? p.post.geom.width + 20 : 0) + p.rollerL / 2;
    [-m, xs + m].forEach((x, i) => plates.push({ center: [x, 0, -p.rollerDepth], xDir: [1, 0, 0], normal: [0, 0, 1], W: p.rollerL, H: depth, t: z0 + p.rollerDepth, name: `Rollenbock ${i + 1}` }));
    if (p.posts) {
      const pw = p.post.geom.width, pd = p.post.geom.height;
      const side = Math.max(p.frame.geom.height, p.beam.geom.height) / 2 + 20 + pd / 2;
      const ztop = z0 + H + p.postTop;
      // Fangpfosten mit Spalt vor dem geschlossenen Flügel, Fangtasche (zwei Bleche beidseits des Flügels, 5 mm Luft)
      const gF = 20, xF = W + gF + pw / 2, fd = p.frame.geom.height, tT = 8, tl = gF + 60;
      members.push({ section: p.post, a: [-pw / 2, -side, -p.embed], b: [-pw / 2, -side, ztop], name: "Führungspfosten", up });
      members.push({ section: p.post, a: P(xF, -p.embed), b: P(xF, ztop), name: "Fangpfosten", up });
      for (const sg of [-1, 1]) plates.push({ center: [W + gF - tl / 2, sg * (fd / 2 + 5), z0 + H / 2], xDir: [1, 0, 0], normal: [0, sg, 0], W: tl, H: Math.min(400, H - bh), t: tT, name: `Fangtasche ${sg < 0 ? "vorne" : "hinten"}` });
      // Führungsrollen oben am Führungspfosten: Kopfplatte über den Flügel, je eine Rolle beidseits des Oberriegels
      const face = side - pd / 2, r = Math.max(8, Math.min(15, (face - fd / 2) / 2 - 1)), yHi = fd / 2 + 2 * r + 15;
      plates.push({ center: [-pw / 2, (-side - pd / 2 + yHi) / 2, ztop], xDir: [1, 0, 0], normal: [0, 0, 1], W: pw, H: yHi + side + pd / 2, t: 10, name: "Führungsrollenbock" });
      const roll = { kind: "rund", dims: { D: 2 * r }, geom: sectionGeometry("rund", { D: 2 * r }) };
      for (const sg of [-1, 1]) members.push({ section: roll, a: [-pw / 2, sg * (fd / 2 + r), z0 + H - fw], b: [-pw / 2, sg * (fd / 2 + r), ztop], name: `Führungsrolle ${sg < 0 ? "vorne" : "hinten"}`, up: [1, 0, 0] });
      const cap = capPlate(p.post, P(xF, ztop), up, "Pfostenkappe Fangpfosten");
      if (cap) plates.push(cap);
    }
    if (gapSeen > 120 + 1e-6) issues.push({ key: "gapMax", level: "Warnung", message: `Öffnung ${Math.round(gapSeen)} mm größer als 120 mm` });
    const pick = (list) => (p.teil === "fluegel" ? list.filter((x) => isLeaf(x.name)) : p.teil === "fest" ? list.filter((x) => !isLeaf(x.name)) : list);
    const info = `Flügel ${Math.round(W + T)} mm lang (Öffnung ${Math.round(W)} + Gegengewicht ${Math.round(T)}), ${nBars} Stäbe, Platz hinten offen ${Math.round(W + T)} mm`;
    return { chains: pick(chains), members: pick(members), plates: pick(plates), info, issues, geo: { T } };
  },

  parts: { tail: /Diagonale|Strebe|Laufprofil/, tailForm: /Diagonale|Strebe|Rahmen/, posts: /pfosten/, post: /pfosten/, postTop: /pfosten/, embed: /pfosten/, width: /Stab|Laufprofil/ },
  views: ["front", "top"],
  /** Maßlinien der Skizze (Ansicht: x, z; Grundriss: x, y) */
  dims(p, plan, view) {
    const W = p.width, T = plan.geo?.T ?? (p.tail > 0 ? p.tail : Math.round(W * 0.4));
    const gap = Math.max(200, (W + T) * 0.05), r = Math.round;
    const y0 = view === "top" ? -300 : 0;
    const out = [
      { key: "width", a: [0, y0], b: [W, y0], off: -gap, text: r(W) },
      { key: "tail", a: [-T, y0], b: [0, y0], off: -gap, text: r(T) },
    ];
    if (view !== "top") {
      out.push({ key: "height", a: [W, p.clearance], b: [W, p.clearance + p.height], off: -gap, text: r(p.height) });
      out.push({ key: "clearance", a: [-T, 0], b: [-T, p.clearance], off: gap, text: r(p.clearance) });
    }
    return out;
  },
};
