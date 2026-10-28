// Trägerstoß mit Laschen (Stahlbau-Lücken ST5): Flansch- und Steglaschen, verschraubt, Schraubbild je Seite.
// Reine Rechnung (Bauplan wie generator.js), keine Statik – Schraubenzahl und Laschendicken sind nachzuweisen.
//
// Lage: Träger entlang X, Stoß bei x = 0 (Spalt gap), Steg in der XZ-Ebene, Oberkante Träger z = H/2.

import { NORM_THREADS } from "./normteile.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const BOLT_OPTS = ["M12", "M16", "M20", "M24", "M27", "M30"].map((s) => [s, s]);
export const holeFor = (size) => NORM_THREADS[size].d + (NORM_THREADS[size].d <= 12 ? 1 : 2);
const r5 = (x) => Math.ceil(x / 5) * 5;
/** Rand- und Lochabstände in Kraftrichtung (gerundete Vorzugswerte über den Mindestwerten 1,2 d0 und 2,2 d0) */
export const boltSpacing = (d0) => ({ e1: r5(1.5 * d0), p1: r5(3 * d0), e2: r5(1.5 * d0) });

export const TRAEGERSTOSS = {
  label: "Trägerstoß",
  schema: [
    { key: "beam", label: "Träger", type: "section", kinds: ["ipe", "hea", "heb", "upn"], default: { kind: "heb", size: "300" }, group: "Träger" },
    { key: "beamLen", label: "Trägerlänge je Seite (im Modell)", type: "num", default: "800", group: "Träger" },
    { key: "gap", label: "Spalt im Stoß", type: "num", default: "10", group: "Träger" },
    { key: "bolt", label: "Schrauben", type: "select", options: BOLT_OPTS, default: "M20", group: "Schrauben" },
    { key: "grade", label: "Festigkeit", type: "select", options: [["10.9", "10.9 (HV)"], ["8.8", "8.8"]], default: "10.9", group: "Schrauben" },
    { key: "flRows", label: "Flansch: Schraubenreihen je Seite", type: "num", default: "2", group: "Flanschlaschen" },
    { key: "flT", label: "Flanschlasche außen Dicke", type: "num", default: "15", group: "Flanschlaschen" },
    { key: "inner", label: "Innenlaschen am Flansch", type: "check", default: false, group: "Flanschlaschen" },
    { key: "inT", label: "Innenlasche Dicke", type: "num", default: "12", group: "Flanschlaschen", when: (p) => p.inner },
    { key: "webRows", label: "Steg: Schrauben übereinander", type: "num", default: "2", group: "Steglaschen" },
    { key: "webCols", label: "Steg: Reihen je Seite", type: "num", default: "1", group: "Steglaschen" },
    { key: "webT", label: "Steglasche Dicke", type: "num", default: "10", group: "Steglaschen" },
  ],
  plan(p) {
    const issues = [];
    const b = p.beam, H = b.dims.H, B = b.dims.B, tf = b.dims.t, s = b.dims.s ?? b.dims.t, r = b.dims.r || 0;
    const isU = b.kind === "upn";
    const gap = p.gap, Lb = p.beamLen;
    if (!(gap >= 0 && Lb > 200)) throw new Error("Spalt ≥ 0 und Trägerlänge > 200 mm");
    const nf = Math.round(p.flRows), nwr = Math.round(p.webRows), nwc = Math.round(p.webCols);
    if (!(nf >= 1 && nf <= 6 && nwr >= 1 && nwr <= 8 && nwc >= 1 && nwc <= 4)) throw new Error("Schraubenzahlen: Flansch 1 … 6, Steg 1 … 8 übereinander, 1 … 4 Reihen");
    const d0 = holeFor(p.bolt), sp = boltSpacing(d0), th = NORM_THREADS[p.bolt];
    const members = [], plates = [], chains = [], norms = [], drills = [];
    const up = [0, 0, 1];
    members.push({ section: b, a: [-gap / 2 - Lb, 0, 0], b: [-gap / 2, 0, 0], name: "Träger links", up });
    members.push({ section: b, a: [gap / 2, 0, 0], b: [gap / 2 + Lb, 0, 0], name: "Träger rechts", up });
    const sideX = (k) => gap / 2 + sp.e1 + k * sp.p1; // Abstand der Schraubenreihe k vom Stoß
    // Flanschlaschen: außen volle Breite, innen zwei schmale neben dem Steg
    const Lf = 2 * (sideX(nf - 1) + sp.e1);
    const yWeb = isU ? -B / 2 + s / 2 : 0; // Stegmitte (UPN: Steg auf der −Y-Seite)
    const webIn = isU ? -B / 2 + s : s / 2; // Stegfläche zur freien Flanschseite
    const flangeFree = isU ? B - s - r : (B - s) / 2 - r; // freie Flanschbreite neben Steg und Ausrundung
    const w = isU ? 0 : B - 2 * sp.e2; // Querabstand der Flanschschrauben (I: zwei Reihen beidseits des Stegs)
    const flY = isU ? [webIn + r + flangeFree / 2] : [-w / 2, w / 2];
    if (!isU && w / 2 - s / 2 - r < th.s / 2 + 2) issues.push({ key: "bolt", level: "Warnung", message: `Flanschschrauben ${p.bolt} zu nah am Steg (Flansch zu schmal)` });
    if (isU && flangeFree < 2 * sp.e2) issues.push({ key: "bolt", level: "Warnung", message: `Flansch zu schmal für ${p.bolt}` });
    const inW = Math.max(0, flangeFree - 2);
    if (p.inner && inW < 2 * sp.e2 - 5) issues.push({ key: "inner", level: "Hinweis", message: "Innenlaschen sehr schmal – lieber ohne" });
    const clampF = p.flT + tf + (p.inner ? p.inT : 0);
    for (const [zs, sgn, label] of [[H / 2, 1, "oben"], [-H / 2, -1, "unten"]]) {
      const holes = [];
      for (const sx of [-1, 1]) for (let k = 0; k < nf; k++) for (const y of flY) holes.push([sx * sideX(k), y]);
      plates.push({ center: [0, 0, sgn > 0 ? zs : zs - p.flT], xDir: [1, 0, 0], normal: [0, 0, 1], W: Lf, H: B, t: p.flT, holes, d: d0, name: `Flanschlasche ${label}` });
      if (p.inner) {
        const zi = sgn > 0 ? zs - tf - p.inT : zs + tf;
        const sides = isU ? [webIn + r + 1 + inW / 2] : [-(s / 2 + r + 1 + inW / 2), s / 2 + r + 1 + inW / 2];
        for (const yc of sides) {
          const hs = holes.filter(([, y]) => Math.abs(y - yc) < inW / 2).map(([x, y]) => [x, y - yc]);
          plates.push({ center: [0, yc, zi], xDir: [1, 0, 0], normal: [0, 0, 1], W: Lf, H: inW, t: p.inT, holes: hs, d: d0, name: `Innenlasche ${label} ${yc < 0 ? "links" : "rechts"}` });
        }
      }
      for (const [x, y] of holes) {
        const z0 = sgn > 0 ? zs + p.flT : zs - p.flT;
        norms.push({ bolt: true, size: p.bolt, clamp: clampF, pos: [x, y, z0], dir: [0, 0, -sgn], grade: p.grade });
        drills.push({ target: x < 0 ? "Träger links" : "Träger rechts", p: [x, y, zs + sgn * 2], dir: [0, 0, -sgn], d: d0, len: tf + (p.inner ? 0 : 0) + 4 });
      }
    }
    // Steglaschen beidseits (UPN: nur außen am Steg und innen)
    const hw = H - 2 * tf - 2 * r - 10;
    if (!(hw > d0 + 2 * sp.e2)) throw new Error("Steg zu niedrig für Steglaschen");
    const Lw = 2 * (sideX(nwc - 1) + sp.e1);
    const zs = nwr === 1 ? [0] : Array.from({ length: nwr }, (_, i) => -((hw - 2 * sp.e2) / 2) + (i * (hw - 2 * sp.e2)) / (nwr - 1));
    const p2 = nwr > 1 ? (hw - 2 * sp.e2) / (nwr - 1) : Infinity;
    if (p2 < 2.4 * d0) issues.push({ key: "webRows", level: "Warnung", message: `Schrauben im Steg zu eng (${fmt(p2)} mm < 2,4 · d0)` });
    const wholes = [];
    for (const sx of [-1, 1]) for (let k = 0; k < nwc; k++) for (const z of zs) wholes.push([sx * sideX(k), z]);
    // Platte in der XZ-Ebene: xDir X, Normale ±Y, Lochkoordinaten (x, z)
    plates.push({ center: [0, yWeb - s / 2, 0], xDir: [1, 0, 0], normal: [0, -1, 0], W: Lw, H: hw, t: p.webT, holes: wholes.map(([x, z]) => [x, z]), d: d0, name: "Steglasche vorne" });
    plates.push({ center: [0, yWeb + s / 2, 0], xDir: [1, 0, 0], normal: [0, 1, 0], W: Lw, H: hw, t: p.webT, holes: wholes.map(([x, z]) => [x, -z]), d: d0, name: "Steglasche hinten" });
    const clampW = 2 * p.webT + s;
    for (const [x, z] of wholes) {
      norms.push({ bolt: true, size: p.bolt, clamp: clampW, pos: [x, yWeb - s / 2 - p.webT, z], dir: [0, 1, 0], grade: p.grade });
      drills.push({ target: x < 0 ? "Träger links" : "Träger rechts", p: [x, yWeb - s / 2 - 2, z], dir: [0, 1, 0], d: d0, len: s + 4 });
    }
    // Mutter am Flansch innen frei von Ausrundung/Steg?
    if (!isU && w / 2 - s / 2 - r < NORM_THREADS[p.bolt].d2 / 2) issues.push({ key: "bolt", level: "Hinweis", message: "Scheibe innen am Flansch liegt in der Ausrundung" });
    const nF = 2 * 2 * nf * flY.length, nW = 2 * nwc * nwr;
    const info = `Flanschlaschen ${Math.round(Lf)} × ${Math.round(B)} × ${fmt(p.flT)}${p.inner ? ` + Innenlaschen ${fmt(p.inT)}` : ""}, Steglaschen 2 × ${Math.round(Lw)} × ${Math.round(hw)} × ${fmt(p.webT)} mm; ${nF + nW} Schrauben ${p.bolt} - ${p.grade} (Flansch ${nF}, Steg ${nW}), Loch Ø ${fmt(d0)}, e1 ${sp.e1}, p1 ${sp.p1} – statisch nicht nachgewiesen`;
    return { chains, members, plates, norms, drills, info, issues };
  },
};
