// Fenstergitter (W12): geschweißter Rahmen mit senkrechten Stäben, wahlweise als Durchsteckgitter mit Querriegeln
// aus Flachstahl. Einbau in der Laibung (Bohrungen im Rahmen für Rahmendübel bzw. Anker) oder vor der Fassade mit
// angeschweißten Mauerlaschen. Reine Rechnung, Anker und Dübel werden nicht erzeugt.
//
// Lage: Fensteröffnung x = 0 … Breite, z = 0 … Höhe (Unterkante = Fensterbank), Fassade bei y = 0, y wächst in die Wand.

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";

export const FENSTERGITTER = {
  label: "Fenstergitter",
  schema: [
    { key: "width", label: "Lichte Breite der Fensteröffnung", type: "num", default: "1000", group: "Öffnung" },
    { key: "height", label: "Lichte Höhe der Fensteröffnung", type: "num", default: "1200", group: "Öffnung" },
    { key: "mount", label: "Einbau", type: "select", options: [["laibung", "in der Laibung (Anker seitlich durch den Rahmen)"], ["vorgesetzt", "vor der Fassade (Mauerlaschen)"]], default: "laibung", tiles: "front", group: "Öffnung" },
    { key: "gap", label: "Luft zur Laibung (je Seite)", type: "num", default: "10", group: "Öffnung", when: (p) => p.mount !== "vorgesetzt" },
    { key: "inset", label: "Abstand Rahmenvorderkante zur Fassade", type: "num", default: "40", group: "Öffnung", when: (p) => p.mount !== "vorgesetzt" },
    { key: "overlap", label: "Überdeckung der Öffnung (je Seite)", type: "num", default: "60", group: "Öffnung", when: (p) => p.mount === "vorgesetzt" },
    { key: "frame", label: "Rahmen", type: "section", kinds: ["vierkant", "rechteck", "flach", "winkel"], default: { kind: "vierkant", size: "30x3" }, group: "Rahmen" },
    { key: "anchorMax", label: "Ankerabstand höchstens", type: "num", default: "600", group: "Rahmen" },
    { key: "anchorD", label: "Bohrung bzw. Laschenloch Ø", type: "num", default: "10", group: "Rahmen" },
    { key: "fill", label: "Füllung", type: "select", options: [["senkrecht", "senkrechte Stäbe"], ["durchsteck", "Durchsteckgitter (Stäbe durch Querriegel)"]], default: "senkrecht", tiles: "front", group: "Füllung" },
    { key: "bar", label: "Stab", type: "section", kinds: ["rund", "vierkantvoll", "vierkant"], default: { kind: "rund", size: "16" }, group: "Füllung" },
    { key: "gapMax", label: "Öffnung zwischen den Stäben höchstens", type: "num", default: "120", group: "Füllung" },
    { key: "rails", label: "Querriegel (Anzahl)", type: "num", default: "2", group: "Füllung", when: (p) => p.fill === "durchsteck" },
    { key: "rail", label: "Querriegel", type: "section", kinds: ["flach"], default: { kind: "flach", size: "40x8" }, group: "Füllung", when: (p) => p.fill === "durchsteck" },
  ],

  plan(p) {
    const issues = [];
    const W = p.width, H = p.height, vor = p.mount === "vorgesetzt";
    if (!(W >= 200 && W <= 4000)) throw fieldError("Breite 200 … 4000 mm", "width");
    if (!(H >= 200 && H <= 4000)) throw fieldError("Höhe 200 … 4000 mm", "height");
    if (!vor && !(p.gap >= 0 && p.gap <= 50)) throw fieldError("Luft 0 … 50 mm", "gap");
    if (vor && !(p.overlap >= 20 && p.overlap <= 300)) throw fieldError("Überdeckung 20 … 300 mm", "overlap");
    if (!(p.gapMax >= 40)) throw fieldError("Öffnung mindestens 40 mm", "gapMax");
    if (!(p.anchorMax >= 150)) throw fieldError("Ankerabstand mindestens 150 mm", "anchorMax");
    const out = { chains: [], members: [], plates: [], norms: [], drills: [] };
    const { chains, members, plates, drills } = out;

    const fr = p.frame, fw = fr.geom.width, fd = fr.geom.height; // Rahmen: Breite in der Gitterebene, Tiefe = Profilhöhe
    const lt = 6, lw = 40; // Mauerlasche Flach 40 × 6
    // Rahmen außen
    const [xo0, xo1, zo0, zo1] = vor ? [-p.overlap, W + p.overlap, -p.overlap, H + p.overlap] : [p.gap, W - p.gap, p.gap, H - p.gap];
    if (!(xo1 - xo0 > 2 * fw + 40 && zo1 - zo0 > 2 * fw + 40)) throw fieldError("Öffnung zu klein für den Rahmen", vor ? "overlap" : "gap");
    const yc = vor ? -lt - fd / 2 : p.inset + fd / 2; // Mitte Rahmen in der Tiefe
    const P = (x, z) => [x, yc, z];
    const xl = xo0 + fw / 2, xr = xo1 - fw / 2, zb = zo0 + fw / 2, zt = zo1 - fw / 2;
    chains.push({ section: fr, points: [P(xl, zb), P(xr, zb), P(xr, zt), P(xl, zt), P(xl, zb)], name: "Rahmen", up: [0, -1, 0], closed: true });

    // Stäbe gleichmäßig zwischen den Senkrechten
    const b = p.bar, bw = b.geom.width, clear = xr - xl - fw;
    const nb = Math.max(0, Math.ceil((clear - p.gapMax) / (bw + p.gapMax) - 1e-9));
    const gp = (clear - nb * bw) / (nb + 1);
    const xs = Array.from({ length: nb }, (_, k) => xl + fw / 2 + gp * (k + 1) + bw * k + bw / 2);
    const z0 = zb + fw / 2, z1 = zt - fw / 2;
    xs.forEach((x, k) => members.push({ section: b, a: P(x, z0), b: P(x, z1), name: `Stab ${k + 1}`, up: [0, -1, 0] }));
    const gapV = (() => { // größte senkrechte Öffnung (Durchsteckgitter: zwischen den Riegeln)
      if (p.fill !== "durchsteck") return z1 - z0;
      const n = Math.max(0, Math.round(p.rails));
      return (z1 - z0 - n * p.rail.geom.height) / (n + 1);
    })();

    // Querriegel (Flachstahl liegend, Stäbe gehen durch Bohrungen)
    let nRails = 0;
    if (p.fill === "durchsteck") {
      const rl = p.rail, n = Math.max(0, Math.min(10, Math.round(p.rails)));
      const rRot = orientRot(rl, [1, 0, 0], [0, 0, 1], { tall: [0, 1, 0] });
      const { high: rt } = rotExtent(rl, rRot);
      for (let i = 1; i <= n; i++) {
        const z = z0 + ((z1 - z0) * i) / (n + 1), name = `Querriegel ${i}`;
        members.push({ section: rl, a: P(xl + fw / 2, z), b: P(xr - fw / 2, z), name, up: [0, 0, 1], rot: rRot });
        for (const x of xs) {
          const hole = b.kind === "rund" ? { d: bw + 1 } : { w: bw + 1, h: bw + 1, xDir: [1, 0, 0] };
          drills.push({ target: name, p: [x, yc, z - rt / 2 - 1], dir: [0, 0, 1], len: rt + 2, ...hole });
        }
        nRails++;
      }
    }

    // Befestigung je Seite
    const nA = Math.max(2, Math.ceil((zt - zb) / p.anchorMax - 1e-9) + 1);
    const zs = Array.from({ length: nA }, (_, i) => zb + 60 + ((zt - zb - 120) * i) / (nA - 1));
    if (vor) {
      // Mauerlaschen hinten am Rahmen, ragen seitlich 60 mm über den Rahmen hinaus und liegen flach auf der Fassade
      for (const [x, sx, nm] of [[xo0, -1, "links"], [xo1, 1, "rechts"]]) zs.forEach((z, i) => {
        const L = fw + 60, cx = x - sx * fw + (sx * L) / 2;
        plates.push({ center: [cx, 0, z], xDir: [1, 0, 0], normal: [0, -1, 0], W: L, H: lw, t: lt, holes: [[(sx * L) / 2 - sx * 25, 0]], d: p.anchorD, name: `Mauerlasche ${nm} ${i + 1}` });
      });
      issues.push({ key: "mount", level: "Hinweis", message: "Befestigung durch die Laschen mit Schwerlast- oder Sicherheitsankern (Einbruchschutz: Abreißschrauben) – nicht erzeugt" });
    } else {
      // Bohrungen quer durch die Senkrechten für Rahmendübel bzw. Laibungsanker
      for (const [x, sx] of [[xo0, 1], [xo1, -1]]) for (const z of zs) drills.push({ target: "Rahmen", p: [x - sx * 1, yc, z], dir: [sx, 0, 0], len: fw + 2, d: p.anchorD });
      issues.push({ key: "mount", level: "Hinweis", message: "Anker in der Laibung mit Randabstand zum Mauerwerk setzen, Rahmendübel nach Baustoff wählen – nicht erzeugt" });
    }
    if (gp > 120) issues.push({ key: "gapMax", level: "Warnung", message: `Öffnung ${Math.round(gp)} mm über 120 mm – für Einbruchschutz zu groß` });
    if (gapV > 400 && p.fill !== "durchsteck") issues.push({ key: "fill", level: "Hinweis", message: "Lange freie Stäbe: Durchsteckgitter mit Querriegeln ist stabiler gegen Aufbiegen" });
    const info = `Fenstergitter ${Math.round(xo1 - xo0)} × ${Math.round(zo1 - zo0)} mm (${vor ? "vor der Fassade" : "in der Laibung"}), ${nb} Stäbe, Öffnung ${Math.round(gp)} mm${nRails ? `, ${nRails} Querriegel` : ""}, ${2 * nA} ${vor ? "Mauerlaschen" : "Ankerbohrungen"}`;
    return { ...out, info, issues };
  },

  parts: { frame: /^Rahmen/, bar: /^Stab/, gapMax: /^Stab/, rail: /^Querriegel/, rails: /^Querriegel/, anchorMax: /^(Mauerlasche|Rahmen)/, anchorD: /^(Mauerlasche|Rahmen)/ },
  views: ["front"],
  dims(p) {
    const gap = Math.max(150, p.width * 0.08), r = Math.round;
    return [{ key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) }, { key: "height", a: [p.width, 0], b: [p.width, p.height], off: -gap, text: r(p.height) }];
  },
};
