// Gelenkige Trägeranschlüsse (Stahlbau-Lücken ST4): Fahnenblech, Doppelwinkel oder kurze Stirnplatte; Nebenträger an
// Hauptträger (oben bündig, mit Ausklinkung) oder an einen Stützenflansch. Reine Rechnung, keine Statik.
//
// Lage: Anschlussfläche des Auflagers bei x = face (Hauptträgersteg bzw. Stützenflansch außen), Nebenträger entlang +X,
// Oberkante Nebenträger z = 0, Steg in der XZ-Ebene. Hauptträger entlang Y (Oberkante z = 0), Stütze entlang Z.

import { NORM_THREADS } from "./normteile.js";
import { holeFor, boltSpacing } from "./traegerstoss.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const BOLT_OPTS = ["M12", "M16", "M20", "M24"].map((s) => [s, s]);
const sec = (s) => ({ H: s.dims.H, B: s.dims.B, tf: s.dims.t, s: s.dims.s ?? s.dims.t, r: s.dims.r || 0 });

export const TRAEGERANSCHLUSS = {
  label: "Trägeranschluss",
  schema: [
    { key: "support", label: "Auflager", type: "select", options: [["traeger", "Hauptträger (oben bündig)"], ["stuetze", "Stützenflansch"]], default: "traeger", group: "Auflager" },
    { key: "main", label: "Hauptträger", type: "section", kinds: ["ipe", "hea", "heb"], default: { kind: "ipe", size: "300" }, group: "Auflager", when: (p) => p.support !== "stuetze" },
    { key: "column", label: "Stütze", type: "section", kinds: ["hea", "heb", "ipe"], default: { kind: "heb", size: "200" }, group: "Auflager", when: (p) => p.support === "stuetze" },
    { key: "beam", label: "Nebenträger", type: "section", kinds: ["ipe", "hea", "heb"], default: { kind: "ipe", size: "200" }, group: "Nebenträger" },
    { key: "beamLen", label: "Länge Nebenträger (im Modell)", type: "num", default: "800", group: "Nebenträger" },
    { key: "type", label: "Anschluss", type: "select", options: [["fahnenblech", "Fahnenblech"], ["winkel", "Doppelwinkel"], ["stirnplatte", "Kurze Stirnplatte"]], default: "fahnenblech", group: "Anschluss" },
    { key: "bolt", label: "Schrauben", type: "select", options: BOLT_OPTS, default: "M16", group: "Anschluss" },
    { key: "grade", label: "Festigkeit", type: "select", options: [["8.8", "8.8"], ["10.9", "10.9"], ["4.6", "4.6"]], default: "8.8", group: "Anschluss" },
    { key: "rows", label: "Schrauben übereinander", type: "num", default: "2", group: "Anschluss" },
    { key: "gap", label: "Spalt zum Auflager", type: "num", default: "10", group: "Anschluss" },
    { key: "plateT", label: "Blechdicke (Fahnenblech/Stirnplatte)", type: "num", default: "10", group: "Anschluss", when: (p) => p.type !== "winkel" },
    { key: "angle", label: "Winkel", type: "section", kinds: ["winkel"], default: { kind: "winkel", size: "70x70x7" }, group: "Anschluss", when: (p) => p.type === "winkel" },
  ],
  plan(p) {
    const issues = [];
    const sb = sec(p.beam);
    const onBeam = p.support !== "stuetze";
    const sup = sec(onBeam ? p.main : p.column);
    const face = onBeam ? sup.s / 2 : sup.H / 2; // Anschlussfläche
    const tSup = onBeam ? sup.s : sup.tf; // Dicke des Auflagers an der Schraube
    const d0 = holeFor(p.bolt), sp = boltSpacing(d0), th = NORM_THREADS[p.bolt];
    // an der Stütze sitzen Mutter und Scheibe innen am Flansch: Abstand zum Stützensteg samt Ausrundung freihalten
    const clearWeb = onBeam ? 0 : sup.s / 2 + sup.r + th.d2 / 2 + 2;
    const n = Math.round(p.rows);
    if (!(n >= 1 && n <= 8)) throw new Error("Schrauben übereinander: 1 … 8");
    if (!(p.gap >= 0 && p.beamLen > 300)) throw new Error("Spalt ≥ 0, Nebenträger > 300 mm");
    const members = [], plates = [], chains = [], norms = [], drills = [];
    // Höhenbereich für Bleche und Schrauben: unter einer Ausklinkung, über dem Unterflansch, im Auflager zwischen den Flanschen
    const cope = onBeam ? sup.tf + sup.r + 5 : 0;
    let top = -Math.max(sb.tf + sb.r, cope) - 5, bot = -sb.H + sb.tf + sb.r + 5;
    if (onBeam) bot = Math.max(bot, -sup.H + sup.tf + sup.r + 5);
    const hp = top - bot;
    if (!(hp >= d0 + 2 * sp.e2)) throw new Error("Steg zu niedrig für den Anschluss – größeren Nebenträger oder kleinere Schrauben");
    const zc = (top + bot) / 2;
    const zs = n === 1 ? [zc] : Array.from({ length: n }, (_, i) => top - sp.e2 - (i * (hp - 2 * sp.e2)) / (n - 1));
    const pitch = n > 1 ? (hp - 2 * sp.e2) / (n - 1) : Infinity;
    if (pitch < 2.2 * d0) throw new Error(`${n} Schrauben passen nicht übereinander (Abstand ${fmt(pitch)} < 2,2 · d0) – weniger Schrauben`);
    // Auflager
    if (onBeam) members.push({ section: p.main, a: [0, -400, -sup.H / 2], b: [0, 400, -sup.H / 2], name: "Hauptträger", up: [0, 0, 1] });
    else members.push({ section: p.column, a: [0, 0, -sb.H - 300], b: [0, 0, 300], name: "Stütze", up: [1, 0, 0] });
    const supName = onBeam ? "Hauptträger" : "Stütze";
    // Nebenträger: Anfang je nach Anschluss
    const t = p.type, tp = p.plateT;
    const x0 = face + (t === "stirnplatte" ? tp : p.gap);
    const beam = { section: p.beam, a: [x0, 0, -sb.H / 2], b: [x0 + p.beamLen, 0, -sb.H / 2], name: "Nebenträger", up: [0, 0, 1] };
    if (onBeam) {
      // Ausklinkung oben (und unten, wenn der Nebenträger tiefer reicht als der Hauptträger-Unterflansch innen)
      const box = (zMid, depth) => ({ section: { kind: "flach", dims: { B: sup.B + 20, t: 2 * depth } }, a: [0, -sb.B, zMid], b: [0, sb.B, zMid], up: [0, 0, 1] });
      beam.copes = [box(0, cope)];
      if (sb.H > sup.H - sup.tf - sup.r - 5) {
        const lo = -Math.max(sb.H, sup.H) - 5, hi = -sup.H + sup.tf + sup.r + 5;
        beam.copes.push(box((lo + hi) / 2, (hi - lo) / 2));
      }
      if (sup.B / 2 + 10 - x0 > 0) issues.push({ key: "beam", level: "Hinweis", message: `Nebenträger oben ausgeklinkt: ${Math.round(sup.B / 2 + 10 - x0)} × ${Math.round(cope)} mm` });
    }
    members.push(beam);
    let info = "";
    const webBolt = (x, z, clamp, y0) => {
      norms.push({ bolt: true, size: p.bolt, clamp, pos: [x, y0, z], dir: [0, 1, 0], grade: p.grade });
      drills.push({ target: "Nebenträger", p: [x, -sb.s / 2 - 2, z], dir: [0, 1, 0], d: d0, len: sb.s + 4 });
    };
    const supBolt = (y, z, clamp, x0b) => {
      norms.push({ bolt: true, size: p.bolt, clamp, pos: [x0b, y, z], dir: [-1, 0, 0], grade: p.grade });
      drills.push({ target: supName, p: [face + 2, y, z], dir: [-1, 0, 0], d: d0, len: tSup + 4 });
    };
    if (t === "fahnenblech") {
      // Blech an der +Y-Seite des Nebenträgerstegs, an das Auflager geschweißt
      const xb = x0 + sp.e1; // Schraubenreihe ab Trägerende
      const Lp = xb + sp.e1 - face;
      plates.push({ center: [face + Lp / 2, sb.s / 2, zc], xDir: [1, 0, 0], normal: [0, 1, 0], W: Lp, H: hp, t: tp, holes: zs.map((z) => [xb - (face + Lp / 2), -(z - zc)]), d: d0, name: "Fahnenblech" });
      for (const z of zs) webBolt(xb, z, tp + sb.s, -sb.s / 2);
      if (onBeam && Lp < sup.B / 2 - face + 10) issues.push({ key: "gap", level: "Hinweis", message: "Fahnenblech endet unter dem Hauptträgerflansch – Montage von unten prüfen" });
      info = `Fahnenblech ${Math.round(Lp)} × ${Math.round(hp)} × ${fmt(tp)} mm, ${n} × ${p.bolt} - ${p.grade}`;
    } else if (t === "winkel") {
      const a = p.angle, H = a.dims.H, B = a.dims.B, ta = a.dims.t;
      if (H < sp.e1 + p.gap + sp.e1) issues.push({ key: "angle", level: "Warnung", message: "Winkelschenkel am Nebenträger zu kurz für Spalt und Randabstand" });
      if (B < ta + th.s / 2 + sp.e2) issues.push({ key: "angle", level: "Warnung", message: "Winkelschenkel am Auflager zu kurz für die Schraube" });
      // Winkel entlang Z: Schenkel H am Steg (+X ab face), Schenkel B am Auflager (±Y); Achse so, dass die Ecke an (face, ±s/2) liegt
      for (const sgn of [1, -1]) {
        const P = [face + H / 2, sgn * (sb.s / 2 + B / 2)];
        const zA = sgn > 0 ? top : bot, zB = sgn > 0 ? bot : top; // Richtung −Z für die +Y-Seite (Schenkel zeigt nach außen)
        members.push({ section: a, a: [P[0], P[1], zA], b: [P[0], P[1], zB], name: `Winkel ${sgn > 0 ? "hinten" : "vorne"}`, up: [1, 0, 0] });
      }
      const xb = Math.max(face + H - sp.e2, x0 + sp.e1); // Schrauben im Stegschenkel
      for (const z of zs) {
        norms.push({ bolt: true, size: p.bolt, clamp: 2 * ta + sb.s, pos: [xb, -sb.s / 2 - ta, z], dir: [0, 1, 0], grade: p.grade });
        drills.push({ target: "Nebenträger", p: [xb, -sb.s / 2 - 2, z], dir: [0, 1, 0], d: d0, len: sb.s + 4 });
        for (const sgn of [1, -1]) drills.push({ target: `Winkel ${sgn > 0 ? "hinten" : "vorne"}`, p: [xb, sgn * (sb.s / 2 - 1), z], dir: [0, sgn, 0], d: d0, len: ta + 2 });
      }
      const yb = Math.max(sb.s / 2 + Math.max(ta + th.d2 / 2 + 2, B - sp.e2), clearWeb); // Schrauben im Auflagerschenkel
      for (const sgn of [1, -1]) for (const z of zs) {
        supBolt(sgn * yb, z, ta + tSup, face + ta);
        drills.push({ target: `Winkel ${sgn > 0 ? "hinten" : "vorne"}`, p: [face - 1, sgn * yb, z], dir: [1, 0, 0], d: d0, len: ta + 2 });
      }
      if (onBeam && yb + th.d2 / 2 > sup.B / 2) issues.push({ key: "angle", level: "Hinweis", message: "Schrauben am Hauptträgersteg stehen über den Flansch hinaus – Einbau prüfen" });
      info = `Doppelwinkel L ${a.size} × ${Math.round(hp)}, ${3 * n} × ${p.bolt} - ${p.grade} (Steg ${n}, Auflager ${2 * n})`;
    } else {
      // kurze Stirnplatte am Trägerende, mit dem Auflager verschraubt (2 Reihen quer)
      const w = Math.max(sb.s + 2 * (th.d2 / 2 + 5), Math.min(sb.B - 2 * sp.e2, 140), 2 * clearWeb);
      const W = Math.max(sb.B, w + 2 * sp.e2);
      if (W > sb.B + 1e-6) issues.push({ key: "bolt", level: "Hinweis", message: `Stirnplatte ${Math.round(W)} mm breiter als der Trägerflansch (${Math.round(sb.B)} mm) – Platz für ${p.bolt}` });
      plates.push({ center: [face, 0, zc], xDir: [0, 1, 0], normal: [1, 0, 0], W, H: hp, t: tp, holes: zs.flatMap((z) => [[-w / 2, z - zc], [w / 2, z - zc]]), d: d0, name: "Stirnplatte" });
      for (const z of zs) for (const y of [-w / 2, w / 2]) supBolt(y, z, tp + tSup, face + tp);
      if (onBeam && w / 2 + th.d2 / 2 > sup.B / 2 - 1) issues.push({ key: "bolt", level: "Hinweis", message: "Schraubenköpfe liegen unter dem Hauptträgerflansch – Platz prüfen" });
      info = `Stirnplatte ${Math.round(W)} × ${Math.round(hp)} × ${fmt(tp)} mm, ${2 * n} × ${p.bolt} - ${p.grade}, Querabstand ${Math.round(w)} mm`;
    }
    info += `, Loch Ø ${fmt(d0)} – gelenkig, statisch nicht nachgewiesen`;
    return { chains, members, plates, norms, drills, info, issues };
  },
};
