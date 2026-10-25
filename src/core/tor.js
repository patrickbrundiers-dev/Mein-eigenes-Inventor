// Tor-Generator (MegaCAD-Abgleich M12): Einzel- oder Doppeltor mit Rahmen, Stabfüllung, Querriegel und Torpfosten,
// Oberkante gerade, Rundbogen (Halbkreis) oder Stichbogen (Stich frei) über die ganze Torbreite, auch nach unten.
// Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage: Tor in der XZ-Ebene, Unterkante Boden bei z = 0, Öffnung von x = 0 bis Torbreite (Lichtmaß zwischen den
// Pfosten). Flügel = Öffnung abzüglich Spalt an den Pfosten (und in der Mitte). Bögen werden aus geraden,
// gegehrten Stücken angenähert (Anzahl einstellbar); die Zuschnittliste zeigt diese Stücke.

import { fieldError } from "./generror.js";
export const TOR = {
  label: "Tor",
  schema: [
    { key: "leaves", label: "Art", type: "select", options: [["1", "Einzeltor"], ["2", "Doppeltor"]], default: "2", group: "Tor" },
    { key: "width", label: "Torbreite (lichte Öffnung)", type: "num", default: "3000", group: "Tor" },
    { key: "height", label: "Höhe Flügel (am Rand)", type: "num", default: "1200", group: "Tor" },
    { key: "clearance", label: "Bodenfreiheit", type: "num", default: "50", group: "Tor" },
    { key: "gap", label: "Spalt Pfosten/Mitte", type: "num", default: "15", group: "Tor" },
    { key: "form", label: "Oberkante", type: "select", options: [["gerade", "gerade"], ["rund", "Rundbogen (Halbkreis)"], ["stich", "Stichbogen nach oben"], ["unten", "Bogen nach unten"]], default: "stich", group: "Tor" },
    { key: "rise", label: "Stich (Bogenhöhe)", type: "num", default: "250", group: "Tor", when: (p) => p.form === "stich" || p.form === "unten" },
    { key: "segs", label: "Bogen in Stücken", type: "num", unit: "Stk", default: "8", group: "Tor", when: (p) => p.form !== "gerade" },
    { key: "frame", label: "Rahmen", type: "section", default: { kind: "vierkant", size: "40x3" }, group: "Rahmen und Füllung" },
    { key: "bar", label: "Stäbe", type: "section", default: { kind: "vierkantvoll", size: "16" }, group: "Rahmen und Füllung" },
    { key: "gapMax", label: "Öffnung max.", type: "num", default: "110", group: "Rahmen und Füllung" },
    { key: "mid", label: "Querriegel", type: "check", default: true, group: "Rahmen und Füllung" },
    { key: "midZ", label: "Querriegel über Unterkante", type: "num", default: "300", group: "Rahmen und Füllung", when: (p) => p.mid },
    { key: "posts", label: "Torpfosten", type: "check", default: true, group: "Pfosten" },
    { key: "post", label: "Pfostenprofil", type: "section", default: { kind: "vierkant", size: "100x4" }, group: "Pfosten", when: (p) => p.posts },
    { key: "postTop", label: "Pfosten über Flügel", type: "num", default: "100", group: "Pfosten", when: (p) => p.posts },
    { key: "embed", label: "Einbetonieren (unter Boden)", type: "num", default: "600", group: "Pfosten", when: (p) => p.posts },
  ],

  plan(p) {
    const issues = [];
    const n = Number(p.leaves) === 1 ? 1 : 2;
    const W = p.width, H = p.height, g = p.gap, z0 = p.clearance;
    const fr = p.frame.geom, fw = fr.width, fh = fr.height; // Rahmen: Breite quer (Torebene), Tiefe = Höhe
    if (!(W > 4 * fw + 3 * g)) throw fieldError("Torbreite zu klein", "width");
    if (!(H > 4 * fw)) throw fieldError("Höhe zu klein", "height");
    const leafW = (W - g * (n + 1)) / n;
    // Oberkante als Funktion von x über die ganze Öffnung (Rand = Höhe)
    let top = () => z0 + H, peak = z0 + H;
    if (p.form === "rund" || p.form === "stich" || p.form === "unten") {
      const span = W, rise = p.form === "rund" ? W / 2 : p.rise;
      if (!(rise > 0)) throw fieldError("Stich muss > 0 sein", "rise");
      if (rise > span / 2 + 1e-6) throw fieldError("Stich höchstens halbe Torbreite (Halbkreis)", "rise");
      const R = (rise * rise + (span / 2) ** 2) / (2 * rise), sg = p.form === "unten" ? -1 : 1;
      const cx = span / 2, cz = z0 + H + sg * rise - sg * R;
      top = (x) => cz + sg * Math.sqrt(Math.max(0, R * R - (x - cx) ** 2));
      peak = z0 + H + sg * rise;
      if (p.form === "unten" && rise > H - 3 * fw - (p.mid ? p.midZ : 0)) throw fieldError("Bogen nach unten zu tief für die Flügelhöhe", "rise");
    }
    const members = [], chains = [], plates = [];
    const up = [0, -1, 0]; // Profilhöhe zeigt quer zur Torebene
    const P = (x, z) => [x, 0, z];
    let nBars = 0, gapSeen = 0;
    for (let i = 0; i < n; i++) {
      const xa = g + i * (leafW + g), xb = xa + leafW;
      const xl = xa + fw / 2, xr = xb - fw / 2; // Achsen der Senkrechten
      const zb = z0 + fw / 2; // Achse Unterriegel
      const tl = top(xa) - fw / 2, tr = top(xb) - fw / 2; // Achse Oberriegel an den Rändern (vereinfacht)
      const name = n === 1 ? "" : i === 0 ? " links" : " rechts";
      // Rahmen als geschlossener Zug mit Gehrung: unten, rechts, oben (gerade oder Bogenstücke), links
      const pts = [P(xl, zb), P(xr, zb), P(xr, tr)];
      if (p.form === "gerade") pts.push(P(xl, tl));
      else {
        const k = Math.max(2, Math.round(p.segs / n));
        for (let j = 1; j <= k; j++) { const x = xr - ((xr - xl) * j) / k; pts.push(P(x, top(x) - fw / 2)); }
      }
      chains.push({ section: p.frame, points: [...pts, pts[0]], name: `Flügel${name} Rahmen`, up, closed: true });
      // Querriegel
      const zm = z0 + p.midZ;
      if (p.mid) members.push({ section: p.frame, a: P(xl + fw / 2, zm), b: P(xr - fw / 2, zm), name: `Flügel${name} Querriegel`, up });
      // Stäbe gleichmäßig zwischen den Senkrechten
      const bw = p.bar.geom.height, clear = xr - xl - fw;
      const nb = Math.max(0, Math.ceil((clear - p.gapMax) / (bw + p.gapMax) - 1e-9));
      const gp = (clear - nb * bw) / (nb + 1);
      gapSeen = Math.max(gapSeen, gp);
      for (let k = 0; k < nb; k++) {
        const x = xl + fw / 2 + gp * (k + 1) + bw * k + bw / 2;
        const zt = top(x) - fw;
        const parts = p.mid ? [[z0 + fw, zm - fw / 2], [zm + fw / 2, zt]] : [[z0 + fw, zt]];
        parts.forEach(([lo, hi], j) => { if (hi - lo > 1) members.push({ section: p.bar, a: P(x, lo), b: P(x, hi), name: `Flügel${name} Stab ${k + 1}${parts.length > 1 ? (j ? "o" : "u") : ""}`, up: [1, 0, 0] }); });
      }
      nBars += nb;
    }
    if (p.posts) {
      const pw = p.post.geom.width;
      const zt = Math.max(top(0), top(W)) + p.postTop;
      members.push({ section: p.post, a: P(-pw / 2, -p.embed), b: P(-pw / 2, zt), name: "Torpfosten links", up });
      members.push({ section: p.post, a: P(W + pw / 2, -p.embed), b: P(W + pw / 2, zt), name: "Torpfosten rechts", up });
    }
    if (gapSeen > 120 + 1e-6) issues.push({ key: "gapMax", level: "Warnung", message: `Öffnung ${Math.round(gapSeen)} mm größer als 120 mm` });
    const info = `${n === 1 ? "Einzeltor" : "Doppeltor"}, Flügel ${Math.round(leafW)} mm breit, ${nBars} Stäbe` + (p.form !== "gerade" ? `, Scheitel ${Math.round(peak)} mm` : "");
    return { chains, members, plates, info, issues };
  },

  views: ["front"],
  /** Maßlinien der Skizze (Ansicht von vorne: x, z) */
  dims(p, plan, view) {
    const gap = Math.max(200, p.width * 0.06), r = Math.round;
    const out = [
      { key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) },
      { key: "height", a: [p.width, p.clearance], b: [p.width, p.clearance + p.height], off: -gap, text: r(p.height) },
      { key: "clearance", a: [0, 0], b: [0, p.clearance], off: gap, text: r(p.clearance) },
    ];
    if (p.form === "stich" || p.form === "unten") out.push({ key: "rise", a: [p.width / 2, p.clearance + p.height], b: [p.width / 2, p.clearance + p.height + (p.form === "unten" ? -p.rise : p.rise)], off: gap / 2, text: r(p.rise) });
    if (p.mid) out.push({ key: "midZ", a: [p.width * 0.25, p.clearance], b: [p.width * 0.25, p.clearance + p.midZ], off: gap / 2, text: r(p.midZ) });
    return out;
  },
};
