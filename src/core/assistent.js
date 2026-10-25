// Konstruktions-Assistent (Werkzeuge Stufe 55) wie in Inventor: Welle, Stirnrad (Evolventenverzahnung), Rillenkugellager
// DIN 625 und zylindrische Druckfeder – je Eingaben, Rechnung und Umriss. Reine Rechnung; Körper im Kern (build.js).

const fmt = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const inv = (a) => Math.tan(a) - a;

// ---------- Welle ----------
export const defaultWelle = () => ({ type: "welle", sections: "30x40; 40x80; 30x40", chamfer: "1", axis: "Z", pos: ["0", "0", "0"] });

/** Abschnitte »d x l; d x l …« → [{d, l}] (Komma als Dezimalzeichen erlaubt) */
export function parseSections(text) {
  const out = String(text || "").split(";").map((s) => s.trim()).filter(Boolean).map((s, i) => {
    const m = s.replace(/,/g, ".").match(/^([\d.]+)\s*[x×*]\s*([\d.]+)$/i);
    if (!m) throw new Error(`Welle: Abschnitt ${i + 1} »${s}« als Durchmesser x Länge angeben (z. B. 30x40)`);
    const d = Number(m[1]), l = Number(m[2]);
    if (!(d > 0 && l > 0)) throw new Error(`Welle: Abschnitt ${i + 1} braucht Durchmesser und Länge > 0`);
    return { d, l };
  });
  if (!out.length) throw new Error("Welle: mindestens einen Abschnitt angeben");
  return out;
}

/** Halbschnitt der Welle als Polygon [r, z] (geschlossen über die Achse), Fasen an beiden Enden */
export function shaftProfile(sections, chamfer = 0) {
  const c = Math.max(0, chamfer);
  const first = sections[0], last = sections.at(-1);
  if (c > 0 && (c >= first.d / 2 || c >= last.d / 2 || c > first.l || c > last.l)) throw new Error(`Welle: Fase ${fmt(c)} mm zu groß für die Endabschnitte`);
  const pts = [[0, 0], [first.d / 2 - c, 0]];
  if (c > 0) pts.push([first.d / 2, c]);
  let z = 0;
  sections.forEach((s, i) => {
    if (i > 0) pts.push([s.d / 2, z]);
    z += s.l;
    if (i < sections.length - 1 || c === 0) pts.push([s.d / 2, z]);
  });
  if (c > 0) pts.push([last.d / 2, z - c], [last.d / 2 - c, z]);
  pts.push([0, z]);
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
  const L = z, V = sections.reduce((v, s) => v + (Math.PI * s.d * s.d * s.l) / 4, 0);
  return { pts: clean, length: L, volume: V };
}

// ---------- Stirnrad ----------
export const defaultZahnrad = () => ({ type: "zahnrad", m: "2", z: "24", b: "20", alpha: "20", bore: "20", axis: "Z", pos: ["0", "0", "0"] });

/** Verzahnungsmaße (Normalprofil DIN 867: Kopfhöhe m, Fußhöhe 1,25 m) */
export function gearData(m, z, alpha = 20) {
  if (!(m > 0)) throw new Error("Zahnrad: Modul > 0 angeben");
  if (!(Number.isInteger(z) && z >= 6 && z <= 400)) throw new Error("Zahnrad: Zähnezahl ganzzahlig zwischen 6 und 400");
  if (!(alpha >= 14.5 && alpha <= 25)) throw new Error("Zahnrad: Eingriffswinkel zwischen 14,5 und 25°");
  const a = (alpha * Math.PI) / 180, d = m * z;
  const out = { m, z, alpha, d, da: d + 2 * m, df: d - 2.5 * m, db: d * Math.cos(a), p: Math.PI * m, s: (Math.PI * m) / 2 };
  out.undercut = z < Math.ceil(2 / Math.sin(a) ** 2); // Grenzzähnezahl (ohne Profilverschiebung)
  return out;
}

/** Achsabstand eines Radpaars */
export const centerDistance = (m, z1, z2) => (m * (z1 + z2)) / 2;

/** Umriss des Stirnrads (Evolventenflanken, Fußkreis), Punkte gegen den Uhrzeigersinn um (0, 0) */
export function gearOutline(g, { flankPts = 10 } = {}) {
  const rb = g.db / 2, ra = g.da / 2, rf = g.df / 2, a = (g.alpha * Math.PI) / 180;
  const psi = Math.PI / (2 * g.z) + inv(a); // halber Zahnwinkel auf dem Grundkreis
  const r0 = Math.max(rb, rf);
  const flank = [];
  for (let i = 0; i <= flankPts; i++) {
    const r = r0 + ((ra - r0) * i) / flankPts;
    const ar = Math.acos(Math.min(1, rb / r));
    flank.push([r, psi - inv(ar)]);
  }
  const pts = [];
  const step = (2 * Math.PI) / g.z;
  for (let k = 0; k < g.z; k++) {
    const c = k * step;
    const P = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
    // Lücke vor dem Zahn auf dem Fußkreis, dann rechte Flanke hoch, Kopf, linke Flanke runter
    const right = flank.map(([r, t]) => P(r, c - t)), left = flank.map(([r, t]) => P(r, c + t)).reverse();
    pts.push(P(rf, c - flank[0][1]));
    if (rf < r0 - 1e-9) pts.push(P(r0, c - flank[0][1]));
    pts.push(...right.slice(rf < r0 - 1e-9 ? 1 : 0), ...left);
    if (rf < r0 - 1e-9) pts.push(P(rf, c + flank[0][1]));
    // Fußkreis bis zum nächsten Zahn
    const t0 = c + flank[0][1], t1 = c + step - flank[0][1];
    for (let i = 1; i < 4; i++) pts.push(P(rf, t0 + ((t1 - t0) * i) / 4));
  }
  return pts.filter((p, i) => Math.hypot(p[0] - pts[(i + pts.length - 1) % pts.length][0], p[1] - pts[(i + pts.length - 1) % pts.length][1]) > 1e-9);
}

// ---------- Rillenkugellager DIN 625 ----------
// Reihe → [d, D, B] in mm
export const BEARINGS = {
  "6000": [10, 26, 8], "6001": [12, 28, 8], "6002": [15, 32, 9], "6003": [17, 35, 10], "6004": [20, 42, 12], "6005": [25, 47, 12], "6006": [30, 55, 13], "6007": [35, 62, 14], "6008": [40, 68, 15], "6009": [45, 75, 16], "6010": [50, 80, 16],
  "6200": [10, 30, 9], "6201": [12, 32, 10], "6202": [15, 35, 11], "6203": [17, 40, 12], "6204": [20, 47, 14], "6205": [25, 52, 15], "6206": [30, 62, 16], "6207": [35, 72, 17], "6208": [40, 80, 18], "6209": [45, 85, 19], "6210": [50, 90, 20],
  "6300": [10, 35, 11], "6301": [12, 37, 12], "6302": [15, 42, 13], "6303": [17, 47, 14], "6304": [20, 52, 15], "6305": [25, 62, 17], "6306": [30, 72, 19], "6307": [35, 80, 21], "6308": [40, 90, 23], "6309": [45, 100, 25], "6310": [50, 110, 27],
};
export const defaultLager = () => ({ type: "lager", series: "6204", seal: "", axis: "Z", pos: ["0", "0", "0"] });
export const BEARING_SEALS = [["", "offen"], ["2Z", "2Z (Deckscheiben)"], ["2RS", "2RS (Dichtscheiben)"]];

/** Lager zur Wellen-Ø: kleinste Reihe 60/62/63 mit Bohrung d */
export function bearingsForShaft(d) { return Object.entries(BEARINGS).filter(([, v]) => Math.abs(v[0] - d) < 1e-9).map(([k]) => k); }

/** Vereinfachte Lagergeometrie: Ringe und Kugeln */
export function bearingGeometry(series) {
  const t = BEARINGS[series];
  if (!t) throw new Error(`Lager ${series} nicht in DIN 625 (Reihen 60, 62, 63; d 10–50) hinterlegt`);
  const [d, D, B] = t, dm = (d + D) / 2, dw = Math.min(0.3 * (D - d), 0.8 * B);
  const n = Math.max(6, Math.floor((Math.PI * dm) / (1.25 * dw)));
  return { d, D, B, dm, dw, n, outerIn: dm + 0.6 * dw, innerOut: dm - 0.6 * dw };
}
export const bearingDesignation = (series, seal) => `Rillenkugellager DIN 625 - ${series}${seal ? "-" + seal : ""}`;

// ---------- Druckfeder (DIN EN 13906-1) ----------
export const defaultFeder = () => ({ type: "feder", d: "2", D: "16", n: "6", L0: "40", axis: "Z", pos: ["0", "0", "0"] });
const G = 81500; // Gleitmodul Federstahl N/mm²

/** Federrate, Blocklänge, Federweg, Kraft und Schubspannung (mit Bergsträsser-Faktor) bei Blocklänge */
export function springData(d, D, n, L0) {
  if (!(d > 0 && D > d && n >= 1 && L0 > 0)) throw new Error("Feder: Draht-Ø d > 0, mittlerer Ø D > d, federnde Windungen n ≥ 1, Länge L0 > 0");
  const w = D / d;
  if (w < 4 || w > 20) throw new Error(`Feder: Wickelverhältnis D/d = ${fmt(w, 1)} – zwischen 4 und 20 wählen`);
  const nt = n + 2, Lc = nt * d; // Gesamtwindungen, Enden angelegt und geschliffen
  if (L0 <= Lc) throw new Error(`Feder: L0 ${fmt(L0)} mm ist nicht größer als die Blocklänge ${fmt(Lc)} mm`);
  const c = (G * d ** 4) / (8 * D ** 3 * n), sc = L0 - Lc, Fc = c * sc, k = (w + 0.5) / (w - 0.75);
  return { d, D, n, nt, L0, w, rate: c, Lc, sc, Fc, tauKc: (k * 8 * Fc * D) / (Math.PI * d ** 3), De: D + d, Di: D - d, pitch: (L0 - d) / nt }; // vereinfachte Form: nt Windungen gleicher Steigung
}
export const springDesignation = (s) => `Druckfeder ${fmt(s.d, 2)} x ${fmt(s.De, 1)} x ${fmt(s.L0, 1)}`;
