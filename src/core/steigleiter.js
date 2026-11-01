// Steigleiter nach DIN EN ISO 14122-4 (Stahlbau-Lücken ST6): Holme, Sprossen, Wandhalter, Rückenschutz mit Bügeln und
// Längsstäben, Holme als Haltegriffe über die Austrittsebene verlängert. Reine Rechnung (Bauplan wie generator.js).
//
// Lage: Wand in der XZ-Ebene (y = 0), Leiter davor in +Y, Zugangsebene z = 0, Austrittsebene z = Steighöhe.
// Grenzwerte (ISO 14122-4:2016): lichte Weite zwischen den Holmen 400 … 600 mm, Sprossenabstand 225 … 300 mm gleichmäßig,
// Abstand Sprosse – Wand ≥ 200 mm, Rückenschutz ab 3 m Fallhöhe, Beginn 2,2 … 3 m, Bügelabstand ≤ 1500 mm,
// Längsstäbe ≥ 5, Abstand ≤ 300 mm, Rückenschutz 650 … 800 mm tief (ab Sprosse), Haltegriffe 1100 mm über Austritt,
// ein Leiterzug höchstens 10 m (sonst Zwischenpodeste).

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Sprossen: Anzahl n und gleichmäßiger Abstand a, oberste Sprosse auf der Austrittsebene */
export function rungLayout(H, target = 280) {
  const n = Math.max(1, Math.round(H / target));
  return { n, a: H / n };
}

/** Mittellinie eines Rückenschutzbügels in der Ebene (x quer, y von der Wand weg): Anschluss am Holm, Schenkel, Halbkreis */
export function hoopLine(xh, yR, W, depth, n = 36, lap = 0) {
  const R = W / 2, yc = yR + depth - R; // Mitte des Halbkreises
  // lap > 0: gerades Stück am Holm entlang (± lap um die Holmmitte), damit der Bügel flächig anliegt und angeschweißt
  // bzw. verschraubt werden kann – vorher berührte das schräg abgehende Ende den Holm nur an einer Kante
  const y0 = lap > 0 ? yR + lap : yR, start = lap > 0 ? [[-xh, yR - lap], [-xh, y0]] : [[-xh, yR]], end = lap > 0 ? [[xh, y0], [xh, yR - lap]] : [[xh, yR]];
  const pts = [...start, [-R, y0 + Math.min(100, yc - y0)], [-R, yc]];
  for (let i = 1; i < n; i++) { const t = Math.PI - (i * Math.PI) / n; pts.push([R * Math.cos(t), yc + R * Math.sin(t)]); }
  pts.push([R, yc], [R, y0 + Math.min(100, yc - y0)], ...end);
  return pts;
}
/** Offene Linie mit Dicke t als geschlossener Umriss (Gehrung an den Knicken) */
export function thickPolyline(pts, t) {
  const n = pts.length, left = [], right = [];
  const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    let m;
    if (i === 0) m = nrm(pts[0], pts[1]);
    else if (i === n - 1) m = nrm(pts[n - 2], pts[n - 1]);
    else {
      const a = nrm(pts[i - 1], pts[i]), b = nrm(pts[i], pts[i + 1]);
      const s = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(...s) || 1, c = (a[0] * s[0] + a[1] * s[1]) / l;
      m = [s[0] / l / Math.max(c, 0.3), s[1] / l / Math.max(c, 0.3)];
    }
    left.push([pts[i][0] + (m[0] * t) / 2, pts[i][1] + (m[1] * t) / 2]);
    right.push([pts[i][0] - (m[0] * t) / 2, pts[i][1] - (m[1] * t) / 2]);
  }
  return [...left, ...right.reverse()];
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

export const STEIGLEITER = {
  label: "Steigleiter",
  schema: [
    { key: "height", label: "Steighöhe (Zugang bis Austritt)", type: "num", default: "5000", group: "Leiter" },
    { key: "width", label: "Lichte Weite zwischen den Holmen", type: "num", default: "500", group: "Leiter" },
    { key: "wall", label: "Abstand Sprosse – Wand", type: "num", default: "200", group: "Leiter" },
    { key: "pitch", label: "Sprossenabstand (Richtwert)", type: "num", default: "280", group: "Leiter" },
    { key: "stringer", label: "Holm", type: "section", kinds: ["flach", "rechteck", "vierkant"], default: { kind: "flach", size: "60x10" }, group: "Leiter" },
    { key: "rung", label: "Sprosse", type: "section", kinds: ["rund", "vierkantvoll", "rohr"], default: { kind: "rund", size: "25" }, group: "Leiter" },
    { key: "grip", label: "Haltegriffe über Austritt", type: "num", default: "1100", group: "Austritt" },
    { key: "bracket", label: "Wandhalter", type: "section", kinds: ["flach", "winkel"], default: { kind: "flach", size: "60x10" }, group: "Befestigung" },
    { key: "bracketPitch", label: "Wandhalter Abstand höchstens", type: "num", default: "2000", group: "Befestigung" },
    { key: "cage", label: "Rückenschutz", type: "select", options: [["auto", "ab 3 m Steighöhe"], ["ja", "immer"], ["nein", "ohne"]], default: "auto", group: "Rückenschutz" },
    { key: "cageStart", label: "Beginn über Zugang", type: "num", default: "2500", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "cageWidth", label: "Bügel Breite (innen)", type: "num", default: "700", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "cageDepth", label: "Tiefe ab Sprosse", type: "num", default: "700", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "hoopPitch", label: "Bügelabstand höchstens", type: "num", default: "1200", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "hoopB", label: "Bügel Flachstahl Breite", type: "num", default: "50", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "hoopT", label: "Bügel Flachstahl Dicke", type: "num", default: "8", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "bars", label: "Längsstäbe", type: "num", default: "5", group: "Rückenschutz", when: (p) => p.cage !== "nein" },
    { key: "bar", label: "Längsstab", type: "section", kinds: ["flach"], default: { kind: "flach", size: "40x8" }, group: "Rückenschutz", when: (p) => p.cage !== "nein" },
  ],
  plan(p) {
    const issues = [];
    const H = p.height, w = p.width, yR = p.wall;
    if (!(H >= 500)) throw new Error("Steighöhe mindestens 500 mm");
    if (w < 400 || w > 600) issues.push({ key: "width", level: "Warnung", message: `Lichte Weite ${fmt(w)} mm – ISO 14122-4: 400 … 600 mm` });
    if (yR < 200) issues.push({ key: "wall", level: "Warnung", message: `Abstand zur Wand ${fmt(yR)} mm < 200 mm (Fußraum)` });
    if (H > 10000) issues.push({ key: "height", level: "Warnung", message: "Leiterzug über 10 m – Zwischenpodeste nötig (ISO 14122-4)" });
    const { n, a } = rungLayout(H, p.pitch);
    if (a < 225 || a > 300) issues.push({ key: "pitch", level: "Warnung", message: `Sprossenabstand ${fmt(a)} mm – zulässig 225 … 300 mm` });
    const st = p.stringer, sg = st.geom, ru = p.rung;
    const tS = sg.height, bS = sg.width; // Holm: Dicke quer zur Leiter (X), Breite in Y
    const members = [], plates = [], chains = [], norms = [], drills = [];
    const xs = w / 2 + tS / 2; // Holmachse
    const top = H + p.grip;
    // Holme: Breite in Y um die Sprossenachse, Dicke in X (Flachstahl hochkant)
    for (const [sx, label] of [[-1, "links"], [1, "rechts"]]) members.push({ section: st, a: [sx * xs, yR, 0], b: [sx * xs, yR, top], name: `Holm ${label}`, up: [1, 0, 0] });
    // Sprossen durch die Holme gesteckt (Bohrung + 1 mm), oberste auf der Austrittsebene
    const rd = Math.max(ru.geom.width, ru.geom.height);
    if (rd < 20 || rd > 35) issues.push({ key: "rung", level: "Hinweis", message: `Sprosse ${fmt(rd)} mm – üblich 20 … 35 mm` });
    for (let i = 1; i <= n; i++) {
      const z = i * a;
      members.push({ section: ru, a: [-xs - tS / 2, yR, z], b: [xs + tS / 2, yR, z], name: `Sprosse ${i}`, up: [0, 0, 1] });
      for (const sx of [-1, 1]) drills.push({ target: `Holm ${sx < 0 ? "links" : "rechts"}`, p: [sx * (xs + tS / 2 + 1), yR, z], dir: [-sx, 0, 0], d: rd + 1, len: tS + 2 });
    }
    // Wandhalter: an beiden Holmen, gleichmäßig verteilt (unten 300 mm, oben unter dem Austritt), Flachstahl von der Wand zum Holm
    const br = p.bracket, bt = br.geom.height;
    const span = Math.max(0, H - 300);
    const nb = Math.max(2, Math.ceil(span / p.bracketPitch) + 1);
    const yBack = yR - bS / 2; // Holm-Rückseite (Wandseite)
    for (let k = 0; k < nb; k++) {
      const z = 300 + (k * span) / (nb - 1);
      for (const [sx, label] of [[-1, "links"], [1, "rechts"]]) {
        const x = sx * (xs + tS / 2 + bt / 2), wpT = 10, bh = br.geom.width;
        // Wandplatte mit 2 Dübellöchern Ø 14 über und unter dem Halter (vorher endete der Flachstahl ohne Befestigung an der Wand)
        plates.push({ center: [x, 0, z], xDir: [1, 0, 0], normal: [0, 1, 0], W: 100, H: bh + 100, t: wpT, holes: [[0, -(bh / 2 + 25)], [0, bh / 2 + 25]], d: 14, name: `Wandhalter ${label} ${k + 1} Wandplatte` });
        members.push({ section: br, a: [x, wpT, z], b: [x, yR + bS / 2, z], name: `Wandhalter ${label} ${k + 1}`, up: [1, 0, 0] });
      }
    }
    if (yBack < 60) issues.push({ key: "wall", level: "Hinweis", message: "Wandhalter sehr kurz" });
    // Rückenschutz
    const cage = p.cage === "ja" || (p.cage === "auto" && H > 3000);
    let info2 = "";
    if (H > 3000 && !cage) issues.push({ key: "cage", level: "Warnung", message: "Steighöhe über 3 m ohne Rückenschutz – nur mit Steigschutzeinrichtung zulässig" });
    if (cage) {
      const z0 = p.cageStart, zTop = top - 100;
      if (z0 < 2200 || z0 > 3000) issues.push({ key: "cageStart", level: "Warnung", message: `Rückenschutz beginnt bei ${fmt(z0)} mm – zulässig 2200 … 3000 mm` });
      if (p.cageDepth < 650 || p.cageDepth > 800) issues.push({ key: "cageDepth", level: "Warnung", message: `Tiefe ${fmt(p.cageDepth)} mm – zulässig 650 … 800 mm` });
      if (!(zTop > z0 + 500)) throw new Error("Rückenschutz: Beginn liegt zu hoch für die Leiter");
      const W = p.cageWidth + p.hoopT; // Mittellinie
      const line = hoopLine(xs + tS / 2 + p.hoopT / 2, yR, W, p.cageDepth + p.hoopT / 2, 36, bS / 2 - 5);
      const poly = thickPolyline(line, p.hoopT);
      const nh = Math.max(2, Math.ceil((zTop - z0) / p.hoopPitch) + 1);
      for (let k = 0; k < nh; k++) {
        const z = z0 + (k * (zTop - z0)) / (nh - 1);
        plates.push({ center: [0, 0, z - p.hoopB / 2], xDir: [1, 0, 0], normal: [0, 0, 1], poly, W, H: p.cageDepth, t: p.hoopB, name: `Rückenschutzbügel ${k + 1}` });
      }
      // Längsstäbe innen an den Bügeln, gleichmäßig über Halbkreis und Schenkel
      const nbars = Math.max(1, Math.round(p.bars));
      const R = W / 2, yc = yR + p.cageDepth + p.hoopT / 2 - R, bar = p.bar, tb = bar.geom.height;
      // innen an den Bügel: Sehnenabstand des Bügel-Polygons und Wölbung über die Stabbreite abziehen (Spalt < 1 mm)
      const Ri = R - p.hoopT / 2, hb = bar.geom.width / 2;
      const ri = Ri * Math.cos(Math.PI / 72) - (Ri - Math.sqrt(Math.max(0, Ri * Ri - hb * hb))) - tb / 2 - 0.2;
      for (let k = 0; k < nbars; k++) {
        const phi = Math.PI - ((k + 0.5) * Math.PI) / nbars; // gleich verteilt auf dem Halbkreis
        const pt = [ri * Math.cos(phi), yc + ri * Math.sin(phi)];
        members.push({ section: bar, a: [pt[0], pt[1], z0 - p.hoopB / 2], b: [pt[0], pt[1], zTop + p.hoopB / 2], name: `Längsstab ${k + 1}`, up: [Math.cos(phi), Math.sin(phi), 0] });
      }
      const gapBars = (Math.PI * ri) / nbars;
      if (nbars < 5) issues.push({ key: "bars", level: "Warnung", message: "Mindestens 5 Längsstäbe (ISO 14122-4)" });
      if (gapBars > 300) issues.push({ key: "bars", level: "Warnung", message: `Abstand der Längsstäbe ${fmt(gapBars)} mm > 300 mm` });
      if ((zTop - z0) / (nh - 1) > 1500) issues.push({ key: "hoopPitch", level: "Warnung", message: "Bügelabstand über 1500 mm" });
      info2 = `, Rückenschutz ab ${fmt(z0)} mm: ${nh} Bügel ${fmt(p.hoopB)} × ${fmt(p.hoopT)} (abgewickelt ${Math.round(polyLen(line))} mm), ${nbars} Längsstäbe`;
    }
    const info = `${n} Sprossen à ${fmt(a)} mm, Holme ${Math.round(top)} mm (Haltegriffe ${fmt(p.grip)} mm über Austritt), ${nb * 2} Wandhalter` + info2 + " – ISO 14122-4 geometrisch geprüft";
    return { chains, members, plates, norms, drills, info, issues };
  },
};
