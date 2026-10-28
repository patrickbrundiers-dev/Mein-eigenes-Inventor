// Tor-Generator (MegaCAD-Abgleich M12): Einzel- oder Doppeltor mit Rahmen, Stabfüllung, Querriegel und Torpfosten,
// Oberkante gerade, Rundbogen (Halbkreis) oder Stichbogen (Stich frei) über die ganze Torbreite, auch nach unten.
// Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage: Tor in der XZ-Ebene, Unterkante Boden bei z = 0, Öffnung von x = 0 bis Torbreite (Lichtmaß zwischen den
// Pfosten). Flügel = Öffnung abzüglich Spalt an den Pfosten (und in der Mitte). Bögen werden aus geraden,
// gegehrten Stücken angenähert (Anzahl einstellbar); die Zuschnittliste zeigt diese Stücke.

import { fieldError } from "./generror.js";
import { sectionGeometry } from "./sections.js";
import { capPlate } from "./handlaufhalter.js";
const rund = (D) => ({ kind: "rund", dims: { D }, geom: sectionGeometry("rund", { D }) });
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
        // oben an der Unterseite des Oberriegels (beim Bogen das gerade Stück über dem Stab), Schnitt parallel dazu
        // Bogen: alle geraden Stücke über der Stabbreite schneiden (an einem Knick liegt der Stab unter zweien)
        const tp = pts.slice(2), lim = [x - bw / 2, x + bw / 2];
        const segs = tp.slice(0, -1).map((qa, j) => [qa, tp[j + 1]]).filter(([qa, qb]) => Math.min(qa[0], qb[0]) <= lim[1] && Math.max(qa[0], qb[0]) >= lim[0]);
        if (!segs.length) segs.push([tp[0], tp[tp.length - 1]]);
        const planes = segs.map(([qa, qb]) => {
          const dx = qb[0] - qa[0], dz = qb[2] - qa[2], L = Math.hypot(dx, dz) || 1;
          const nUp = dx > 0 ? [-dz / L, 0, dx / L] : [dz / L, 0, -dx / L], zAx = Math.abs(dx) > 1e-9 ? qa[2] + (dz * (x - qa[0])) / dx : qa[2];
          return { nUp, zt: zAx - fw / 2 / Math.abs(nUp[2]), top: zAx - fw / 2 / Math.abs(nUp[2]) + (bw / 2) * Math.abs(nUp[0] / nUp[2]) };
        });
        const zt = Math.min(...planes.map((q) => q.zt)), slopeCut = planes.length > 1 || Math.abs(planes[0].nUp[0]) > 1e-9;
        const parts = p.mid ? [[z0 + fw, zm - fw / 2], [zm + fw / 2, zt]] : [[z0 + fw, zt]];
        parts.forEach(([lo, hi], j) => {
          if (!(hi - lo > 1)) return;
          const last = j === parts.length - 1 && slopeCut, b = last ? P(x, Math.max(...planes.map((q) => q.top)) + 1) : P(x, hi);
          members.push({ section: p.bar, a: P(x, lo), b, name: `Flügel${name} Stab ${k + 1}${parts.length > 1 ? (j ? "o" : "u") : ""}`, up: [1, 0, 0], ...(last ? { cuts: { start: [], end: planes.map((q) => ({ p: P(x, q.zt), n: q.nUp })) } } : {}) });
        });
      }
      nBars += nb;
    }
    if (p.posts) {
      const pw = p.post.geom.width;
      const zt = Math.max(top(0), top(W)) + p.postTop;
      members.push({ section: p.post, a: P(-pw / 2, -p.embed), b: P(-pw / 2, zt), name: "Torpfosten links", up });
      members.push({ section: p.post, a: P(W + pw / 2, -p.embed), b: P(W + pw / 2, zt), name: "Torpfosten rechts", up });
      for (const [x, nm] of [[-pw / 2, "links"], [W + pw / 2, "rechts"]]) { const c = capPlate(p.post, P(x, zt), up, `Pfostenkappe ${nm}`); if (c) plates.push(c); }
    }
    // Torbänder (Einschweißbänder) im Spalt an der Bandseite: Ø = Spalt, je Flügel zwei, unten am Pfosten, oben am Flügel
    // angeschweißt; Anschlagleiste hinten (Doppeltor: Mitte am linken Flügel, Einzeltor: am rechten Pfosten)
    const bandD = Math.min(30, Math.max(8, g)), bandL = 60;
    if (g >= 8) {
      const sides = n === 1 ? [[g / 2, 0, " links"]] : [[g / 2, 0, " links"], [W - g / 2, W, " rechts"]];
      for (const [x, xe, nm] of sides) {
        for (const [z, pos] of [[z0 + 100, "unten"], [top(xe) - 100 - 2 * bandL, "oben"]]) {
          members.push({ section: rund(bandD), a: P(x, z), b: P(x, z + bandL), name: `Torband${nm} ${pos} Pfostenteil`, up: [1, 0, 0] });
          members.push({ section: rund(bandD), a: P(x, z + bandL), b: P(x, z + 2 * bandL), name: `Torband${nm} ${pos} Flügelteil`, up: [1, 0, 0] });
        }
      }
    } else issues.push({ key: "gap", level: "Hinweis", message: `Spalt ${Math.round(g)} mm zu klein für Einschweißbänder (mindestens 8 mm) – Bänder werden nicht erzeugt` });
    const stopT = 6, stopW = 40, yb = fh / 2;
    const stop = (x0, x1, zLo, zHi, name) => plates.push({ center: [(x0 + x1) / 2, yb, (zLo + zHi) / 2], xDir: [1, 0, 0], normal: [0, 1, 0], W: x1 - x0, H: zHi - zLo, t: stopT, name });
    if (n === 2) { const xm = W / 2; stop(xm - g / 2 - stopW / 2, xm + g / 2 + stopW / 2, z0 + 2 * fw, top(xm) - 2 * fw, "Flügel links Anschlagleiste"); }
    else if (p.posts) stop(W - g - stopW / 2, W, z0 + 2 * fw, top(W) - 2 * fw, "Anschlagleiste");
    if (gapSeen > 120 + 1e-6) issues.push({ key: "gapMax", level: "Warnung", message: `Öffnung ${Math.round(gapSeen)} mm größer als 120 mm` });
    const info = `${n === 1 ? "Einzeltor" : "Doppeltor"}, Flügel ${Math.round(leafW)} mm breit, ${nBars} Stäbe` + (p.form !== "gerade" ? `, Scheitel ${Math.round(peak)} mm` : "") + (g >= 8 ? `, ${2 * n} Torbänder Ø ${Math.round(bandD)} × ${2 * bandL}` : "");
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
