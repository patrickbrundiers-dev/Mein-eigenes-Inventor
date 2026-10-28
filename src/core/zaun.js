// Zaun-Generator (E9): Zaunfelder in Reihe zwischen Pfosten, am Hang dem Gefälle folgend (Felder schräg) oder gestuft
// (Felder waagrecht, je Feld höher bzw. tiefer); Füllung aus Staketen, Querstäben oder Blech wie beim Geländer.
// Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage: Zaunlinie entlang +X ab Ursprung, Gelände bei z = 0 am Anfang und z = Höhenunterschied am Ende (linear).
// Felder: Ober- und Unterriegel zwischen den Pfosten, Unterkante Feld = Bodenabstand über dem Gelände (gestuft: über
// dem höheren Feldende). Schräge Riegel und Querstäbe sind an den Pfosten senkrecht geschnitten.

const BAR_FILLS = ["staketen", "quer"];

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { platePlan } from "./anschluss.js";
import { capPlate } from "./handlaufhalter.js";
export const ZAUN = {
  label: "Zaun",
  schema: [
    { key: "length", label: "Zaunlänge", type: "num", default: "10000", group: "Zaun" },
    { key: "height", label: "Feldhöhe", type: "num", default: "1200", group: "Zaun" },
    { key: "groundGap", label: "Bodenabstand", type: "num", default: "80", group: "Zaun" },
    { key: "terrain", label: "Gelände", type: "select", options: [["eben", "eben"], ["gefaelle", "Gefälle (Felder schräg)"], ["stufen", "gestuft (Felder waagrecht)"]], default: "eben", tiles: "front", group: "Zaun" },
    { key: "rise", label: "Höhenunterschied (+ steigt)", type: "num", default: "600", group: "Zaun", when: (p) => p.terrain !== "eben" },
    { key: "post", label: "Pfostenprofil", type: "section", default: { kind: "vierkant", size: "60x3" }, group: "Pfosten" },
    { key: "fieldMax", label: "Pfostenabstand max.", type: "num", default: "2500", group: "Pfosten" },
    { key: "postTop", label: "Pfosten über Feld", type: "num", default: "50", group: "Pfosten" },
    { key: "base", label: "Befestigung", type: "select", options: [["beton", "einbetoniert"], ["fussplatte", "Fußplatte"]], default: "beton", group: "Pfosten" },
    { key: "embed", label: "Einbetonieren (unter Gelände)", type: "num", default: "600", group: "Pfosten", when: (p) => p.base === "beton" },
    { key: "baseSize", label: "Fußplatte Größe", type: "num", default: "150", group: "Pfosten", when: (p) => p.base === "fussplatte" },
    { key: "baseT", label: "Fußplatte Dicke", type: "num", default: "10", group: "Pfosten", when: (p) => p.base === "fussplatte" },
    { key: "frame", label: "Riegel", type: "section", default: { kind: "vierkant", size: "40x3" }, group: "Feld und Füllung" },
    { key: "fill", label: "Füllung", type: "select", options: [["staketen", "Staketen"], ["quer", "Querstäbe"], ["blech", "Blech"], ["keine", "keine"]], default: "staketen", tiles: "front", group: "Feld und Füllung" },
    { key: "bar", label: "Stab", type: "section", default: { kind: "vierkant", size: "20x2" }, group: "Feld und Füllung", when: (p) => BAR_FILLS.includes(p.fill) },
    { key: "gapMax", label: "Öffnung max.", type: "num", default: "100", group: "Feld und Füllung", when: (p) => BAR_FILLS.includes(p.fill) },
    { key: "panelT", label: "Blechdicke", type: "num", default: "2", group: "Feld und Füllung", when: (p) => p.fill === "blech" },
  ],

  plan(p) {
    const issues = [];
    const L = p.length, H = p.height, gap = p.groundGap;
    if (!(L > 500)) throw fieldError("Zaunlänge mindestens 500 mm", "length");
    const pw = p.post.geom.width, fh = rotExtent(p.frame, orientRot(p.frame, [1, 0, 0], [0, -1, 0], { open: [0, 0, 1], legs: [0, 1, 1], stem: [0, 0, -1] })).wide;
    if (!(H > 2 * fh + 50)) throw fieldError("Feldhöhe zu klein", "height");
    if (!(p.fieldMax > pw + 100)) throw fieldError("Pfostenabstand zu klein", "fieldMax");
    const rise = p.terrain === "eben" ? 0 : p.rise;
    const ground = (x) => (rise * x) / L;
    const n = Math.max(1, Math.ceil(L / p.fieldMax - 1e-9));
    const xs = Array.from({ length: n + 1 }, (_, k) => (L * k) / n);
    const members = [], plates = [];
    const up = [0, -1, 0]; // Profilbreite in der Zaunebene
    const P = (x, z) => [x, 0, z];
    // Unterkante Feld je Feld als Funktion von x
    const fieldBottom = (k) => {
      if (p.terrain === "stufen") { const z = Math.max(ground(xs[k]), ground(xs[k + 1])) + gap; return () => z; }
      return (x) => ground(x) + gap;
    };
    let bars = 0, gapSeen = 0, airMax = gap;
    const tops = new Array(n + 1).fill(-Infinity);
    for (let k = 0; k < n; k++) {
      const zb = fieldBottom(k), x0 = xs[k] + pw / 2, x1 = xs[k + 1] - pw / 2;
      tops[k] = Math.max(tops[k], zb(xs[k]) + H);
      tops[k + 1] = Math.max(tops[k + 1], zb(xs[k + 1]) + H);
      airMax = Math.max(airMax, zb(xs[k]) - ground(xs[k]), zb(xs[k + 1]) - ground(xs[k + 1]));
      const f = k + 1;
      const cut = (a, b) => ({ start: [{ p: a, n: [-1, 0, 0] }], end: [{ p: b, n: [1, 0, 0] }] });
      // Riegel: U/UPN offen zu den Stäben (Unterriegel nach oben, Oberriegel nach unten)
      const rail = (h, name, section = p.frame, open) => {
        const a = P(x0, zb(x0) + h), b = P(x1, zb(x1) + h);
        const rot = open ? orientRot(section, [b[0] - a[0], 0, b[2] - a[2]], up, { open, legs: [0, 1, open[2]], stem: [0, 0, -open[2]] }) : 0;
        members.push({ section, a, b, name, up, rot, ...(rise && p.terrain === "gefaelle" ? { cuts: cut(a, b) } : {}) });
      };
      rail(fh / 2, `Feld ${f} Unterriegel`, p.frame, [0, 0, 1]);
      rail(H - fh / 2, `Feld ${f} Oberriegel`, p.frame, [0, 0, -1]);
      // Ober-/Unterkante der Füllung an den Riegeln; schräge Riegel (Gefälle) sind senkrecht gemessen um fh/2 · √(1 + s²) dick
      const sl = p.terrain === "gefaelle" ? rise / L : 0, kk = Math.hypot(1, sl);
      const lo = (x) => zb(x) + fh / 2 + (fh / 2) * kk, hi = (x) => zb(x) + H - fh / 2 - (fh / 2) * kk;
      const nLo = [sl / kk, 0, -1 / kk], nHi = [-sl / kk, 0, 1 / kk];
      if (p.fill === "staketen") {
        const bw = p.bar.geom.height, clear = x1 - x0;
        const m = Math.max(0, Math.ceil((clear - p.gapMax) / (bw + p.gapMax) - 1e-9));
        const g = (clear - m * bw) / (m + 1);
        gapSeen = Math.max(gapSeen, g);
        for (let j = 0; j < m; j++) {
          const x = x0 + g * (j + 1) + bw * j + bw / 2;
          const e = sl ? (bw / 2) * Math.abs(sl) + 1 : 0; // Stab parallel zu den Riegeln geschnitten
          members.push({ section: p.bar, a: P(x, lo(x) - e), b: P(x, hi(x) + e), name: `Feld ${f} Stab ${j + 1}`, up: [1, 0, 0], ...(sl ? { cuts: { start: [{ p: P(x, lo(x)), n: nLo }], end: [{ p: P(x, hi(x)), n: nHi }] } } : {}) });
        }
        bars += m;
      } else if (p.fill === "quer") {
        const bw = p.bar.geom.height, clear = H - 2 * fh;
        const m = Math.max(0, Math.ceil((clear - p.gapMax) / (bw + p.gapMax) - 1e-9));
        const g = (clear - m * bw) / (m + 1);
        gapSeen = Math.max(gapSeen, g);
        for (let j = 0; j < m; j++) rail(fh + g * (j + 1) + bw * j + bw / 2, `Feld ${f} Querstab ${j + 1}`, p.bar);
        bars += m;
      } else if (p.fill === "blech") {
        const t = p.panelT;
        plates.push({ center: [0, t / 2, 0], xDir: [1, 0, 0], normal: [0, -1, 0], W: x1 - x0, H: Math.max(hi(x0), hi(x1)) - Math.min(lo(x0), lo(x1)), t, poly: [[x0, lo(x0)], [x1, lo(x1)], [x1, hi(x1)], [x0, hi(x0)]], name: `Feld ${f} Blech` });
      }
    }
    // Pfosten: von unter dem Gelände (bzw. Fußplatte) bis über das höchste anschließende Feld
    xs.forEach((x, i) => {
      const g = ground(x), top = tops[i] + p.postTop;
      if (p.base === "fussplatte") {
        // Fußplatte mit 4 Bohrungen Ø 14 für Dübel bzw. Anker (M12), Randabstand wie beim Geländer
        const pl = platePlan({ width: p.post.geom.width, height: p.post.geom.height }, { thickness: p.baseT, width: p.baseSize, height: p.baseSize, holes: 4, holeDia: 14, edge: Math.min(25, p.baseSize / 4) });
        plates.push({ center: [x, 0, g], xDir: [1, 0, 0], normal: [0, 0, 1], W: pl.W, H: pl.H, t: pl.t, holes: pl.holes, d: pl.d, name: `Fußplatte ${i + 1}` });
        issues.push(...pl.issues.map((x) => ({ ...x, key: "baseSize" })).filter((x, k, a) => i === 0 && a.findIndex((y) => y.message === x.message) === k));
        members.push({ section: p.post, a: P(x, g + p.baseT), b: P(x, top), name: `Pfosten ${i + 1}`, up });
      } else members.push({ section: p.post, a: P(x, g - p.embed), b: P(x, top), name: `Pfosten ${i + 1}`, up });
      const cap = capPlate(p.post, P(x, top), up, `Pfostenkappe ${i + 1}`); // hohle Pfosten oben zu (kein Wasser im Rohr)
      if (cap) plates.push(cap);
    });
    if (p.terrain === "stufen" && airMax - gap > 150 + 1e-6) issues.push({ key: "rise", level: "Warnung", message: `Bodenluft unter den Stufen bis ${Math.round(airMax)} mm – mehr Felder oder Gefälle wählen` });
    const fl = Math.round(L / n - pw);
    const info = `${n} Felder à ${fl} mm lichte Weite, ${n + 1} Pfosten` + (bars ? `, ${bars} Stäbe` : "") + (rise ? `, ${p.terrain === "stufen" ? "gestuft" : "Gefälle"} ${Math.round(rise)} mm` : "");
    return { chains: [], members, plates, info, issues, geo: { n, rise } };
  },

  parts: { fieldMax: /^Pfosten \d+$/, postTop: /^Pfosten/, length: /^Pfosten \d+$/, height: /riegel|Stab/ },
  views: ["front", "top"],
  /** Maßlinien der Skizze (Ansicht: x, z; Grundriss: x, y) */
  dims(p, plan, view) {
    const L = p.length, rise = plan.geo?.rise || 0, n = plan.geo?.n || 1, r = Math.round;
    const gap = Math.max(200, L * 0.04);
    const yLow = view === "top" ? -100 : Math.min(0, rise) - (p.base === "beton" ? p.embed : 0);
    const out = [
      { key: "length", a: [0, yLow], b: [L, yLow], off: -gap, text: r(L) },
      { key: "fieldMax", a: [0, yLow], b: [L / n, yLow], off: -gap / 2, text: r(L / n) },
    ];
    if (view === "top") return out;
    const z0 = (p.terrain === "stufen" ? Math.max(0, rise / n) : 0) + p.groundGap;
    out.push({ key: "height", a: [0, z0], b: [0, z0 + p.height], off: gap, text: r(p.height) });
    if (rise) out.push({ key: "rise", a: [L, 0], b: [L, rise], off: -gap, text: r(rise) });
    return out;
  },
};
