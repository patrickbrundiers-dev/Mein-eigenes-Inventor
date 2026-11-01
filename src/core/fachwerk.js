// Fachwerkträger (Stahlbau-Lücken ST7): Parallel-, Pult- oder Satteldachträger aus Hohlprofilen, Füllung N (Pfosten +
// Diagonalen), V (Strebenfachwerk mit Pfosten) oder W (Strebenfachwerk ohne Pfosten). Füllstäbe sind an den Gurtflächen
// geschnitten und an den Knoten mit Spalt versetzt (Spaltknoten), damit sich keine Stäbe überschneiden.
// Reine Rechnung (Bauplan wie generator.js), keine Statik.
//
// Lage: Träger in der XZ-Ebene, Untergurtachse z = 0 von x = 0 bis Spannweite (Auflagerachsen), Systemhöhen Achse–Achse.

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Systemhöhe (Achse Obergurt über Achse Untergurt) an der Stelle x */
export function trussHeight(shape, L, h0, h1, x) {
  if (shape === "pult") return h0 + ((h1 - h0) * x) / L;
  if (shape === "sattel") return h0 + ((h1 - h0) * (1 - Math.abs(2 * x - L) / L));
  return h0;
}
/** Neigung des Obergurts (rad) links bzw. rechts von x */
function slopeAt(shape, L, h0, h1, x, side) {
  if (shape === "pult") return Math.atan2(h1 - h0, L);
  if (shape === "sattel") { const s = Math.atan2(h1 - h0, L / 2); return x < L / 2 - 1e-6 || (Math.abs(x - L / 2) < 1e-6 && side < 0) ? s : -s; }
  return 0;
}

/** Füllstäbe als Knotenpaare: { kind: "pfosten"|"diagonale", i (unten), j (oben) } auf den Knoten x_k */
export function trussWeb(fill, n) {
  const web = [];
  const posts = fill === "W" ? [0, n] : Array.from({ length: n + 1 }, (_, k) => k);
  for (const k of posts) web.push({ kind: "pfosten", i: k, j: k });
  for (let k = 0; k < n; k++) {
    if (fill === "N") {
      // fallende Diagonalen zur Mitte hin (Zugdiagonalen unter Last)
      if (k + 0.5 < n / 2) web.push({ kind: "diagonale", i: k + 1, j: k });
      else web.push({ kind: "diagonale", i: k, j: k + 1 });
    } else web.push(k % 2 === 0 ? { kind: "diagonale", i: k, j: k + 1 } : { kind: "diagonale", i: k + 1, j: k });
  }
  return web;
}

export const FACHWERK = {
  label: "Fachwerkträger",
  schema: [
    { key: "shape", label: "Form", type: "select", options: [["parallel", "Parallelträger"], ["pult", "Pultdachträger"], ["sattel", "Satteldachträger"]], default: "parallel", group: "Geometrie" },
    { key: "span", label: "Spannweite (Auflagerachsen)", type: "num", default: "12000", group: "Geometrie" },
    { key: "h0", label: "Systemhöhe am Auflager", type: "num", default: "1200", group: "Geometrie" },
    { key: "h1", label: "Systemhöhe hoch (First/Pultende)", type: "num", default: "1800", group: "Geometrie", when: (p) => p.shape !== "parallel" },
    { key: "panels", label: "Felder", type: "num", default: "8", group: "Geometrie" },
    { key: "fill", label: "Füllung", type: "select", options: [["N", "N (Pfosten + Diagonalen)"], ["V", "V (Streben + Pfosten)"], ["W", "W (Streben ohne Pfosten)"]], default: "N", group: "Geometrie" },
    { key: "top", label: "Obergurt", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "120x5" }, group: "Profile" },
    { key: "bottom", label: "Untergurt", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "120x5" }, group: "Profile" },
    { key: "diag", label: "Diagonalen", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "70x4" }, group: "Profile" },
    { key: "post", label: "Pfosten", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "60x4" }, group: "Profile" },
    { key: "gap", label: "Spalt zwischen Füllstäben am Knoten", type: "num", default: "20", group: "Knoten" },
    { key: "plates", label: "Auflagerplatten", type: "check", default: true, group: "Knoten" },
  ],
  plan(p) {
    const issues = [];
    const L = p.span, h0 = p.h0, h1 = p.shape === "parallel" ? p.h0 : p.h1, n = Math.round(p.panels);
    if (!(L >= 2000 && h0 >= 300 && h1 >= 300)) throw new Error("Spannweite ≥ 2000, Höhen ≥ 300 mm");
    if (!(n >= 2 && n <= 40)) throw new Error("Felder 2 … 40");
    if ((p.shape === "sattel" || p.fill !== "N") && n % 2) throw new Error("Satteldachträger und Strebenfachwerk brauchen eine gerade Felderzahl");
    // in der Trägerebene liegt jeweils die Profilhöhe (v), quer dazu die Breite (u)
    const hb = p.bottom.geom.height, ht = p.top.geom.height, bd = p.diag.geom.height, hpz = p.post.geom.height;
    for (const [s, label] of [[p.diag, "Diagonalen"], [p.post, "Pfosten"]]) {
      if (s.geom.width > Math.min(p.top.geom.width, p.bottom.geom.width) + 1e-6)
        issues.push({ key: label === "Pfosten" ? "post" : "diag", level: "Warnung", message: `${label} breiter als die Gurte – Hohlprofilknoten nicht ausführbar` });
    }
    const xs = Array.from({ length: n + 1 }, (_, k) => (k * L) / n);
    const H = (x) => trussHeight(p.shape, L, h0, h1, x);
    const members = [], plates = [], chains = [], norms = [], drills = [];
    // Gurte: Untergurt gerade über die Endpfosten, Obergurt als Kette (Gehrung am First)
    const ov = hpz / 2;
    members.push({ section: p.bottom, a: [-ov, 0, 0], b: [L + ov, 0, 0], name: "Untergurt", up: [0, 0, 1] });
    const sl = (x) => slopeAt(p.shape, L, h0, h1, x, 1);
    const tpts = [[-ov, 0, H(0) - ov * Math.tan(sl(0))]];
    if (p.shape === "sattel") tpts.push([L / 2, 0, H(L / 2)]);
    tpts.push([L + ov, 0, H(L) + ov * Math.tan(slopeAt(p.shape, L, h0, h1, L, -1))]);
    chains.push({ section: p.top, points: tpts, name: "Obergurt", up: [0, 0, 1] });
    // Gurtflächen (innen): unten z = hb/2; oben Ebene unter der Obergurtachse, Normale zeigt in den Gurt
    const botFace = (x) => [x, 0, hb / 2];
    const topPlane = (x, side) => {
      const a = slopeAt(p.shape, L, h0, h1, x, side), nrm = [-Math.sin(a), 0, Math.cos(a)];
      const c = [x, 0, H(x)];
      return { p: [c[0] - (nrm[0] * ht) / 2, 0, c[2] - (nrm[2] * ht) / 2], n: nrm, a };
    };
    /** Schnittpunkt der Geraden durch P in Richtung d mit der Ebene {p, n} */
    const hit = (P, d, pl) => { const t = ((pl.p[0] - P[0]) * pl.n[0] + (pl.p[2] - P[2]) * pl.n[2]) / (d[0] * pl.n[0] + d[2] * pl.n[2]); return [P[0] + d[0] * t, 0, P[2] + d[2] * t]; };
    const web = trussWeb(p.fill, n);
    const postAt = new Set(web.filter((w) => w.kind === "pfosten").map((w) => w.i));
    let nd = 0, np = 0, minAng = 90, maxAng = 0;
    for (const w of web) {
      if (w.kind === "pfosten") {
        const x = xs[w.i];
        const side = x < L / 2 ? 1 : -1;
        const top = topPlane(x, side);
        const ends = [top];
        if (p.shape === "sattel" && Math.abs(x - L / 2) < 1e-6) ends.push(topPlane(x, -side)); // Firstpfosten unter beiden Gurtseiten
        const zTop = Math.max(...ends.map((pl) => hit(botFace(x), [0, 0, 1], pl)[2]));
        members.push({ section: p.post, a: botFace(x), b: [x, 0, zTop], name: `Pfosten ${++np}`, up: [1, 0, 0], plain: true, cuts: { start: [{ p: botFace(x), n: [0, 0, -1] }], end: ends.map((pl) => ({ p: pl.p, n: pl.n })) } });
        continue;
      }
      // Diagonale: Systemlinie Knoten unten → Knoten oben; Anschlusspunkte auf den Gurtflächen vom Knoten weg versetzt (Spalt)
      const xb = xs[w.i], xt = xs[w.j], dir = Math.sign(xt - xb);
      let pb = [xb, 0, hb / 2], pt;
      let top = topPlane(xt, -dir);
      pt = hit([xt, 0, H(xt)], [0, 0, -1], top);
      for (let it = 0; it < 4; it++) {
        const d = [pt[0] - pb[0], 0, pt[2] - pb[2]], l = Math.hypot(d[0], d[2]);
        const sinB = Math.abs(d[2]) / l; // Winkel zum Untergurt
        const offB = (postAt.has(w.i) ? hpz / 2 + p.gap : p.gap / 2) + bd / (2 * sinB);
        const tn = [-Math.sin(top.a), Math.cos(top.a)];
        const sinT = Math.abs(d[0] * tn[0] + d[2] * tn[1]) / l; // Winkel zum Obergurt
        const offT = (postAt.has(w.j) ? hpz / 2 + p.gap : p.gap / 2) + bd / (2 * sinT);
        pb = [xb + dir * offB, 0, hb / 2];
        const tx = [Math.cos(top.a), Math.sin(top.a)];
        const base = hit([xt, 0, H(xt)], [0, 0, -1], top);
        pt = [base[0] - dir * tx[0] * offT, 0, base[2] - dir * tx[1] * offT];
      }
      const d = [pt[0] - pb[0], 0, pt[2] - pb[2]], l = Math.hypot(d[0], d[2]), u = [d[0] / l, 0, d[2] / l];
      const ang = (Math.asin(Math.abs(u[2])) * 180) / Math.PI;
      minAng = Math.min(minAng, ang); maxAng = Math.max(maxAng, ang);
      // Achse endet auf den Gurtflächen, die Schnitte gehen durch die Endpunkte (wie Gehrungen im Rahmen)
      members.push({ section: p.diag, a: pb, b: pt, name: `Diagonale ${++nd}`, up: [0, 0, 1], plain: true,
        cuts: { start: [{ p: pb, n: [0, 0, -1] }], end: [{ p: top.p, n: top.n }] } });
      if (Math.abs(pb[0] - xb) > (xs[1] - xs[0]) / 2) issues.push({ key: "panels", level: "Warnung", message: `Diagonale ${nd}: Knotenversatz größer als das halbe Feld – weniger Felder oder kleinere Profile` });
    }
    if (minAng < 30 || maxAng > 60) issues.push({ key: "panels", level: "Hinweis", message: `Diagonalenneigung ${fmt(minAng)} … ${fmt(maxAng)}° – günstig 30 … 60°` });
    // Auflagerplatten unter dem Untergurt an den Enden
    if (p.plates) {
      // Bohrungen neben dem Gurt (frei zugänglich für Anker/Schrauben), Rand- und Gurtabstand je 35 mm
      const bw = p.bottom.geom.width, w = bw + 140, lp = Math.max(hpz + 60, 150), hy = bw / 2 + 35;
      for (const [x, label] of [[0, "links"], [L, "rechts"]]) plates.push({ center: [x, 0, -hb / 2 - 15], xDir: [1, 0, 0], normal: [0, 0, 1], W: lp, H: w, t: 15, holes: [[-lp / 2 + 30, -hy], [lp / 2 - 30, -hy], [-lp / 2 + 30, hy], [lp / 2 - 30, hy]], d: 18, name: `Auflagerplatte ${label}` });
    }
    const info = `${p.shape === "parallel" ? "Parallelträger" : p.shape === "pult" ? "Pultdachträger" : "Satteldachträger"} ${Math.round(L)} mm, ${n} Felder à ${fmt(L / n)}, Füllung ${p.fill}: ${nd} Diagonalen, ${np} Pfosten, Neigung ${fmt(minAng)} … ${fmt(maxAng)}° – statisch nicht nachgewiesen`;
    return { chains, members, plates, norms, drills, info, issues };
  },
};
