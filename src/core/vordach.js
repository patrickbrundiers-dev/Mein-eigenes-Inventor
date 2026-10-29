// Vordach und Carport (W6, offen aus E10): Stützen mit Fuß- und Kopfplatten, Pfetten längs, Sparren quer mit
// Gefälle, Kopfbänder, Dachhaut (Trapezblech, Stegplatten oder Glas) und Kastenrinne an der Traufe. Das Vordach hängt
// hinten an einer Wandpfette mit Ankerplatten. Reine Rechnung, keine Statik.
//
// Lage: Breite in x (0 … Breite), Tiefe in y (y = 0 vorne an der Traufe, tief; y = Tiefe hinten bzw. Wand), Gelände
// z = 0. Das Dach fällt nach vorne. »Höhe« ist die lichte Höhe unter der vorderen Pfette (Durchfahrtshöhe).

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { platePlan } from "./anschluss.js";
import { sectionGeometry } from "./sections.js";

/** Dachhaut: Dicke und Ersatzdichte (g/cm³) für das Gewicht je m² */
export const ROOFS = {
  trapez: { label: "Trapezblech (Stahl, ca. 8 kg/m²)", t: 1, density: 7.85 },
  steg: { label: "Stegplatten 16 mm (Polycarbonat, ca. 2,7 kg/m²)", t: 16, density: 0.17 },
  glas: { label: "VSG-Glas 2 × 6 mm (ca. 30 kg/m²)", t: 12, density: 2.5, glass: true },
};

export const VORDACH = {
  label: "Vordach / Carport",
  schema: [
    { key: "form", label: "Form", type: "select", options: [["carport", "Carport (freistehend)"], ["vordach", "Vordach (an der Wand)"]], default: "carport", tiles: "side", group: "Dach" },
    { key: "width", label: "Breite (entlang Traufe)", type: "num", default: "6000", group: "Dach" },
    { key: "depth", label: "Tiefe (bis Wand bzw. Rückseite)", type: "num", default: "5000", group: "Dach" },
    { key: "height", label: "Lichte Höhe unter der vorderen Pfette", type: "num", default: "2200", group: "Dach" },
    { key: "slope", label: "Gefälle nach vorne (%)", type: "num", default: "3", group: "Dach" },
    { key: "overhang", label: "Dachüberstand (vorne, seitlich, hinten)", type: "num", default: "200", group: "Dach" },
    { key: "roof", label: "Dachhaut", type: "select", options: [...Object.entries(ROOFS).map(([k, r]) => [k, r.label]), ["keine", "keine"]], default: "trapez", group: "Dach" },
    { key: "gutter", label: "Kastenrinne an der Traufe", type: "check", default: true, group: "Dach" },
    { key: "beam", label: "Pfetten (längs)", type: "section", kinds: ["ipe", "hea", "rechteck", "upn"], default: { kind: "ipe", size: "200" }, group: "Tragwerk" },
    { key: "rafter", label: "Sparren (quer)", type: "section", kinds: ["rechteck", "vierkant", "ipe", "u"], default: { kind: "rechteck", size: "120x60x5" }, group: "Tragwerk" },
    { key: "rafterMax", label: "Sparrenabstand höchstens", type: "num", default: "1000", group: "Tragwerk" },
    { key: "column", label: "Stützen", type: "section", kinds: ["vierkant", "rechteck", "hea", "heb", "rohr"], default: { kind: "vierkant", size: "120x5" }, group: "Stützen" },
    { key: "colMax", label: "Stützenabstand höchstens", type: "num", default: "4500", group: "Stützen" },
    { key: "baseT", label: "Fußplatte Dicke", type: "num", default: "15", group: "Stützen" },
    { key: "capT", label: "Kopfplatte Dicke", type: "num", default: "12", group: "Stützen" },
    { key: "knee", label: "Kopfbänder (45°, längs)", type: "check", default: true, group: "Stützen" },
    { key: "kneeL", label: "Kopfband Länge", type: "num", default: "600", group: "Stützen", when: (p) => p.knee },
    { key: "kneeSec", label: "Kopfband Profil", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "60x3" }, group: "Stützen", when: (p) => p.knee },
    { key: "wallT", label: "Ankerplatte Dicke", type: "num", default: "15", group: "Wand", when: (p) => p.form === "vordach" },
  ],

  plan(p) {
    const issues = [];
    const W = p.width, T = p.depth, H = p.height, ov = p.overhang, s = p.slope / 100, vordach = p.form === "vordach";
    if (!(W >= 1500)) throw fieldError("Breite mindestens 1500 mm", "width");
    if (!(T >= 1000)) throw fieldError("Tiefe mindestens 1000 mm", "depth");
    if (!(H >= 1800)) throw fieldError("Lichte Höhe mindestens 1800 mm", "height");
    if (!(s >= 0 && s <= 0.3)) throw fieldError("Gefälle 0 … 30 %", "slope");
    if (!(ov >= 0 && ov <= 1000)) throw fieldError("Dachüberstand 0 … 1000 mm", "overhang");
    if (p.roof === "trapez" && s < 0.02) issues.push({ key: "slope", level: "Warnung", message: "Trapezblech ab 2 % Gefälle (besser 3 %), sonst steht Wasser" });
    if (p.roof !== "trapez" && p.roof !== "keine" && s < 0.05) issues.push({ key: "slope", level: "Hinweis", message: "Stegplatten und Glas: mindestens 5 % Gefälle empfohlen (Selbstreinigung)" });
    const out = { chains: [], members: [], plates: [], norms: [], drills: [] };
    const { members, plates } = out;
    const a = Math.atan(s), ca = Math.cos(a);

    // Pfetten längs, hochkant; UPN mit der offenen Seite nach innen
    const bm = p.beam, bRot = orientRot(bm, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, 1, 0] });
    const { high: bh, wide: bw } = rotExtent(bm, bRot);
    const col = p.column, cw = Math.max(col.geom.width, col.geom.height);
    const tw = vordach ? p.wallT : 0;
    const yF = cw / 2, yR = vordach ? T - tw - bw / 2 : T - cw / 2;
    if (!(yR - yF > 500)) throw fieldError("Tiefe zu klein für zwei Pfetten", "depth");
    const zF = H + bh / 2, zR = zF + (yR - yF) * s; // Mitte der Pfetten
    const x0 = -ov, x1 = W + ov;
    members.push({ section: bm, a: [x0, yF, zF], b: [x1, yF, zF], name: "Pfette vorne", up: [0, 0, 1], rot: bRot });
    members.push({ section: bm, a: [x0, yR, zR], b: [x1, yR, zR], name: vordach ? "Wandpfette" : "Pfette hinten", up: [0, 0, 1], rot: bRot });

    // Stützen unter den Pfetten (Vordach: nur vorne), mit Kopf- und Fußplatte
    const nX = Math.max(2, Math.ceil((W - cw) / p.colMax - 1e-9) + 1);
    const xs = Array.from({ length: nX }, (_, i) => cw / 2 + ((W - cw) * i) / (nX - 1));
    const rows = vordach ? [[yF, zF]] : [[yF, zF], [yR, zR]];
    let n = 0;
    for (const [y, zb] of rows) for (const x of xs) {
      n++;
      const zCap = zb - bh / 2 - p.capT;
      members.push({ section: col, a: [x, y, p.baseT], b: [x, y, zCap], name: `Stütze ${n}`, up: [1, 0, 0] });
      const bp = platePlan({ width: col.geom.width, height: col.geom.height }, { thickness: p.baseT, width: cw + 120, height: cw + 120, holes: 4, holeDia: 18, edge: 30 });
      plates.push({ center: [x, y, 0], xDir: [1, 0, 0], normal: [0, 0, 1], W: bp.W, H: bp.H, t: p.baseT, holes: bp.holes, d: bp.d, name: `Fußplatte ${n}` });
      plates.push({ center: [x, y, zCap], xDir: [1, 0, 0], normal: [0, 0, 1], W: cw + 20, H: Math.max(cw, bw) + 20, t: p.capT, name: `Kopfplatte ${n}` });
      // Kopfbänder unter 45° zwischen Stütze und Pfette, an Stützenfläche und Pfettenunterkante geschnitten
      if (p.knee) {
        const L = p.kneeL / Math.SQRT2, zu = zb - bh / 2;
        for (const sx of [-1, 1]) {
          if ((sx < 0 && x === xs[0]) || (sx > 0 && x === xs[xs.length - 1])) continue; // außen an der Endstütze nicht
          const xa = x + (sx * cw) / 2;
          members.push({ section: p.kneeSec, a: [xa, y, zu - L], b: [xa + sx * L, y, zu], name: `Kopfband ${n}${sx < 0 ? "a" : "b"}`, up: [0, 1, 0],
            cuts: { start: [{ p: [xa, y, zu - L], n: [-sx, 0, 0] }], end: [{ p: [xa + sx * L, y, zu], n: [0, 0, 1] }] } });
        }
      }
    }
    if (p.knee && p.kneeL / Math.SQRT2 > Math.min(H - 300, ((W - cw) / (nX - 1) - cw) / 2)) throw fieldError("Kopfband zu lang für Stützenabstand bzw. Höhe", "kneeL");

    // Wandpfette an Ankerplatten (Vordach): je Stützenachse eine Platte an der Wand
    if (vordach) {
      xs.forEach((x, k) => plates.push({ center: [x, T, zR], xDir: [1, 0, 0], normal: [0, -1, 0], W: Math.max(200, bw + 100), H: bh + 100, t: tw, holes: [[-Math.max(200, bw + 100) / 2 + 30, -bh / 2 - 20], [Math.max(200, bw + 100) / 2 - 30, -bh / 2 - 20], [-Math.max(200, bw + 100) / 2 + 30, bh / 2 + 20], [Math.max(200, bw + 100) / 2 - 30, bh / 2 + 20]], d: 14, name: `Ankerplatte ${k + 1}` }));
      issues.push({ key: "form", level: "Hinweis", message: "Anker bzw. Dübel der Ankerplatten nach Wandbaustoff und Last wählen – werden nicht erzeugt" });
    }

    // Sparren quer auf den Pfetten, mit Gefälle; Unterkante auf der Pfettenoberkante
    const rf = p.rafter, ry = [0, 1, s], rRot = orientRot(rf, ry, [0, 0, 1], { tall: [0, 0, 1], open: [0, 0, -1] });
    const { high: rh, wide: rw } = rotExtent(rf, rRot);
    // Unterkante liegt auf der vorderen Flanschkante jeder Pfette auf (sonst taucht sie in den ebenen Flansch ein)
    const zBot = (y) => zF + bh / 2 + (y - yF + bw / 2) * s;
    const zMid = (y) => zBot(y) + rh / 2 / ca;
    const y0 = -ov, y1 = vordach ? T - tw : T + ov;
    const nR = Math.max(2, Math.ceil((x1 - x0 - rw) / p.rafterMax - 1e-9) + 1);
    for (let k = 0; k < nR; k++) {
      const x = x0 + rw / 2 + ((x1 - x0 - rw) * k) / (nR - 1);
      // Enden senkrecht geschnitten (Rinne vorne, Wand hinten)
      members.push({ section: rf, a: [x, y0, zMid(y0)], b: [x, y1, zMid(y1)], name: `Sparren ${k + 1}`, up: [0, -s, 1], rot: rRot,
        cuts: s > 0 ? { start: [{ p: [x, y0, zMid(y0)], n: [0, -1, 0] }], end: [{ p: [x, y1, zMid(y1)], n: [0, 1, 0] }] } : undefined });
    }

    // Dachhaut auf den Sparren
    const R = ROOFS[p.roof];
    if (R) {
      const zTop = (y) => zBot(y) + rh / ca, ym = (y0 + y1) / 2;
      plates.push({ center: [(x0 + x1) / 2, ym, zTop(ym)], xDir: [1, 0, 0], normal: [0, -Math.sin(a), ca], W: x1 - x0, H: (y1 - y0) / ca, t: R.t, name: "Dachhaut", density: R.density, glass: !!R.glass });
    }
    // Kastenrinne vorne, an den Sparrenköpfen, Oberkante knapp unter der Dachhaut
    if (p.gutter) {
      const dims = { B: 100, H: 50, t: 3 };
      const g = { kind: "u", dims, geom: sectionGeometry("u", dims), size: "100x50x3" };
      const gRot = orientRot(g, [1, 0, 0], [0, 0, 1], { open: [0, 0, 1] });
      const { high: gh, wide: gw } = rotExtent(g, gRot);
      const zt = zBot(y0) + rh / ca - 1;
      members.push({ section: g, a: [x0, y0 - gw / 2, zt - gh / 2], b: [x1, y0 - gw / 2, zt - gh / 2], name: "Kastenrinne", up: [0, 0, 1], rot: gRot });
      issues.push({ key: "gutter", level: "Hinweis", message: "Fallrohr und Rinnenstutzen nach Dachfläche bemessen – werden nicht erzeugt" });
    }
    issues.push({ key: "column", level: "Hinweis", message: "Queraussteifung (eingespannte Stützen oder Verband), Schnee- und Windlast statisch nachweisen" });
    const area = ((x1 - x0) * (y1 - y0)) / ca / 1e6;
    const info = `${vordach ? "Vordach" : "Carport"} ${Math.round(W)} × ${Math.round(T)} mm, Gefälle ${String(p.slope).replace(".", ",")} %, ${n} Stützen, ${nR} Sparren, Dachfläche ${area.toFixed(1).replace(".", ",")} m² – statisch nicht nachgewiesen`;
    return { ...out, info, issues };
  },

  parts: { beam: /^(Pfette|Wandpfette)/, rafter: /^Sparren/, rafterMax: /^Sparren/, column: /^(Stütze|Fußplatte|Kopfplatte)/, knee: /^Kopfband/, kneeL: /^Kopfband/, kneeSec: /^Kopfband/, roof: /^Dachhaut/, gutter: /^Kastenrinne/, wallT: /^Ankerplatte/ },
  views: ["side", "top"],
  dims(p, plan, view) {
    const gap = Math.max(200, p.depth * 0.06), r = Math.round;
    if (view === "top") return [{ key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) }, { key: "depth", a: [p.width, 0], b: [p.width, p.depth], off: -gap, text: r(p.depth) }];
    return [{ key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }, { key: "depth", a: [0, 0], b: [p.depth, 0], off: -gap, text: r(p.depth) }];
  },
};
