// Stahlbau-Anschlüsse als Generatoren (MegaCAD-Abgleich M15): Windverband mit Spannschloss, Pfette mit
// Pfettenschuhen und Pfettenstoß, biegesteife Rahmenecke mit Stirnplatte. Schrauben, Muttern, Scheiben und
// Spannschlösser kommen als Normteile in die Stückliste (Bauplan »norms«). Reine Rechnung, keine Statik.

import { orientRot, rotExtent } from "./orient.js";
import { NORM_THREADS, boltSet, turnbuckleDims } from "./normteile.js";
import { sectionGeometry } from "./sections.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const THREAD_OPTS = ["M12", "M16", "M20", "M24", "M27", "M30"].map((s) => [s, s]);
const BOLT_OPTS = ["M10", "M12", "M16", "M20", "M24", "M27", "M30"].map((s) => [s, s]);
const holeFor = (size) => NORM_THREADS[size].d + (NORM_THREADS[size].d <= 12 ? 1 : 2);

// ---------- Windverband ----------
// Lage: Feld in der XZ-Ebene, linke untere Ecke im Ursprung (Achsen der Stützen/Riegel), Breite +X, Höhe +Z.
export const WINDVERBAND = {
  label: "Windverband",
  schema: [
    { key: "width", label: "Feldbreite (Achsmaß)", type: "num", default: "5000", group: "Feld" },
    { key: "height", label: "Feldhöhe (Achsmaß)", type: "num", default: "4000", group: "Feld" },
    { key: "type", label: "Art", type: "select", options: [["x", "Kreuz (X)"], ["einfach", "eine Diagonale"]], default: "x", group: "Feld" },
    { key: "size", label: "Rundstahl / Gewinde", type: "select", options: THREAD_OPTS, default: "M16", group: "Verband" },
    { key: "turnbuckle", label: "Spannschloss", type: "check", default: true, group: "Verband" },
    { key: "gusset", label: "Knotenblech Größe", type: "num", default: "160", group: "Verband" },
    { key: "gussetT", label: "Knotenblech Dicke", type: "num", default: "10", group: "Verband" },
    { key: "inset", label: "Anschlusspunkt von der Ecke", type: "num", default: "60", group: "Verband" },
    { key: "grade", label: "Ausführung", type: "select", options: [["verzinkt", "verzinkt"], ["blank", "blank"]], default: "verzinkt", group: "Verband" },
  ],
  plan(p) {
    const issues = [];
    const W = p.width, H = p.height, t = NORM_THREADS[p.size];
    if (!(W > 500 && H > 500)) throw new Error("Feldbreite und -höhe prüfen");
    const g = p.gusset, gt = p.gussetT, e = p.inset;
    if (!(g > 2 * e && gt > 0)) throw new Error("Knotenblech zu klein für den Anschlusspunkt");
    const members = [], plates = [], chains = [], norms = [];
    const rod = { kind: "rund", dims: { D: t.d }, geom: sectionGeometry("rund", { D: t.d }) };
    const corners = [[0, 0], [W, 0], [W, H], [0, H]];
    const inward = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    corners.forEach(([x, z], i) => {
      const [sx, sz] = inward[i];
      plates.push({ center: [x + (sx * g) / 2, -gt / 2, z + (sz * g) / 2], xDir: [1, 0, 0], normal: [0, 1, 0], W: g, H: g, t: gt, name: `Knotenblech ${i + 1}` });
    });
    const ends = [[0, 2], ...(p.type === "x" ? [[1, 3]] : [])];
    // Anschluss je Stabende: Lasche (Flachstahl) außen am Knotenblech, mit ihm verschraubt (Bohrung in Lasche und
    // Knotenblech); der Rundstahl liegt auf der Lasche und ist mit ihr verschweißt (Flankennähte über weldL)
    const hole = holeFor(p.size), eL = Math.ceil(1.5 * hole), tl = Math.max(8, Math.ceil(t.d / 2)), bw = Math.max(2 * eL, t.d + 20), weldL = Math.max(60, 4 * t.d), Ll = 2 * eL + weldL;
    const holesIn = corners.map(() => []);
    let rodLen = 0, nTb = 0;
    ends.forEach(([i0, i1], k) => {
      // zweite Diagonale auf der anderen Seite des Knotenblechs (Rundstähle kreuzen sich nicht)
      const sy = p.type === "x" && k === 1 ? 1 : -1, y = sy * (gt / 2 + tl + t.d / 2);
      const A = [corners[i0][0] + inward[i0][0] * e, 0, corners[i0][1] + inward[i0][1] * e];
      const B = [corners[i1][0] + inward[i1][0] * e, 0, corners[i1][1] + inward[i1][1] * e];
      const L0 = Math.hypot(B[0] - A[0], B[2] - A[2]), d = [(B[0] - A[0]) / L0, 0, (B[2] - A[2]) / L0];
      const name = `Diagonale ${k + 1}`;
      [[i0, A, d], [i1, B, d.map((x) => -x)]].forEach(([ci, Q, din], j) => {
        plates.push({ center: [Q[0] + din[0] * (Ll / 2 - eL), sy * gt / 2, Q[2] + din[2] * (Ll / 2 - eL)], xDir: din, normal: [0, sy, 0], W: Ll, H: bw, t: tl, holes: [[-(Ll / 2 - eL), 0]], d: hole, name: `${name} Lasche ${j ? "oben" : "unten"}` });
        norms.push({ bolt: true, size: p.size, clamp: gt + tl, pos: [Q[0], sy * (gt / 2 + tl), Q[2]], dir: [0, -sy, 0], grade: "8.8", galv: p.grade === "verzinkt" });
        holesIn[ci].push(Q);
      });
      // Stab von Lasche zu Lasche (endet 2 · Randabstand hinter der Schraube)
      const a = [A[0] + d[0] * 2 * eL, y, A[2] + d[2] * 2 * eL], b = [B[0] - d[0] * 2 * eL, y, B[2] - d[2] * 2 * eL];
      const L = L0 - 4 * eL;
      const at = (s) => [a[0] + d[0] * s, a[1], a[2] + d[2] * s];
      if (p.turnbuckle) {
        const tb = turnbuckleDims(p.size);
        const sc = L * 0.25; // Spannschloss im unteren Viertel (nicht in der Kreuzung)
        const gap = tb.l; // Stäbe enden in den Naben, Schlosskörper dazwischen
        members.push({ section: rod, a, b: at(sc - gap / 2), name: name + " unten", up: [0, 1, 0] });
        members.push({ section: rod, a: at(sc + gap / 2), b, name: name + " oben", up: [0, 1, 0] });
        norms.push({ kind: "spannschloss", size: p.size, grade: p.grade, pos: at(sc), dir: d, name: `Spannschloss ${k + 1}` });
        rodLen = Math.max(rodLen, sc - gap / 2, L - sc - gap / 2);
        nTb++;
      } else {
        members.push({ section: rod, a, b, name, up: [0, 1, 0] });
        rodLen = Math.max(rodLen, L);
      }
    });
    // Bohrungen in den Knotenblechen (Plattenebene: x = Welt-x, y = −Welt-z)
    plates.forEach((pl, i) => {
      if (i >= corners.length || !holesIn[i].length) return;
      pl.holes = holesIn[i].map((Q) => [Q[0] - pl.center[0], -(Q[2] - pl.center[2])]);
      pl.d = hole;
    });
    const alpha = (Math.atan2(H - 2 * e, W - 2 * e) * 180) / Math.PI;
    if (alpha < 30 || alpha > 60) issues.push({ level: "Hinweis", message: `Neigung der Diagonale ${fmt(alpha)}° – günstig sind 30 … 60°` });
    const info = `${ends.length} Diagonale(n) Rundstahl Ø ${t.d}, Neigung ${fmt(alpha)}°` + (nTb ? `, ${nTb} × Spannschloss DIN 1480 ${p.size}, längster Stab ${Math.round(rodLen)} mm` : `, Länge ${Math.round(rodLen)} mm`) + `, Anschluss je Ende: Lasche ${Math.round(Ll)} × ${Math.round(bw)} × ${tl} angeschweißt, ${p.size} ins Knotenblech (Bohrung Ø ${hole})`;
    return { chains, members, plates, norms, info, issues };
  },
};

// ---------- Pfette mit Pfettenschuhen ----------
// Lage: Pfette entlang +X auf den Bindern (Oberkante Binder z = 0), Binderachsen bei x = 0 und den Feldlängen.
// Pfettenschuh = Winkel (gekantetes Blech) je Auflager auf der −Y-Seite, verschraubt mit Binder und Pfette.
export const PFETTE = {
  label: "Pfette",
  schema: [
    { key: "spans", label: "Feldlängen (Binderabstände)", type: "list", default: "5000; 5000", group: "Pfette" },
    { key: "profile", label: "Pfettenprofil", type: "section", default: { kind: "rechteck", size: "120x60x5" }, group: "Pfette" },
    { key: "overhang", label: "Überstand an den Enden", type: "num", default: "100", group: "Pfette" },
    { key: "maxLen", label: "Stoß über Binder ab Länge", type: "num", default: "6000", group: "Pfette" },
    { key: "shoeT", label: "Pfettenschuh Blechdicke", type: "num", default: "8", group: "Pfettenschuh" },
    { key: "shoeL", label: "Pfettenschuh Breite (entlang Pfette)", type: "num", default: "100", group: "Pfettenschuh" },
    { key: "shoeLeg", label: "Schenkel auf dem Binder", type: "num", default: "80", group: "Pfettenschuh" },
    { key: "bolt", label: "Schrauben", type: "select", options: BOLT_OPTS, default: "M12", group: "Pfettenschuh" },
  ],
  plan(p) {
    const issues = [];
    const spans = p.spans;
    if (!spans.length || spans.some((x) => !(x > 0))) throw new Error("Feldlängen > 0 angeben");
    const pr = p.profile, hollow = pr.kind === "rechteck" || pr.kind === "vierkant" || pr.kind === "rohr";
    // Pfette hochkant: Höhe H senkrecht; U/UPN mit dem Steg am Pfettenschuh (−Y), offen nach +Y
    const rot = orientRot(pr, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, 1, 0], legs: [0, 1, -1], stem: [0, 0, -1] });
    const { high: hh, wide: hb } = rotExtent(pr, rot);
    const web = hollow ? hb : pr.dims.s ?? pr.dims.t ?? hb;
    const ts = p.shoeT, ls = p.shoeL, leg = p.shoeLeg;
    const xs = [0];
    for (const s of spans) xs.push(xs[xs.length - 1] + s);
    const total = xs[xs.length - 1];
    // Stöße: über dem Binder, an dem die Länge seit dem letzten Stoß maxLen überschreiten würde
    const joints = [];
    let from = -p.overhang;
    for (let i = 1; i < xs.length - 1; i++) if (xs[i + 1] - from > p.maxLen + 1e-6) { joints.push(i); from = xs[i]; }
    const gap = 10;
    const members = [], plates = [], chains = [], norms = [], drills = [];
    const cuts = [-p.overhang, ...joints.map((i) => xs[i]), total + p.overhang];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k] + (k > 0 ? gap / 2 : 0), b = cuts[k + 1] - (k + 2 < cuts.length ? gap / 2 : 0);
      members.push({ section: pr, a: [a, 0, hh / 2], b: [b, 0, hh / 2], name: cuts.length > 2 ? `Pfette ${k + 1}` : "Pfette", up: [0, 0, 1], rot });
      if (b - a > 12000) issues.push({ level: "Warnung", message: `Pfette ${k + 1} länger als 12 m (Lieferlänge)` });
    }
    // Pfettenschuhe: L-Querschnitt in der YZ-Ebene (y nach außen negativ), entlang X extrudiert
    const shoeH = Math.min(hh - 10, Math.max(60, hh * 0.7));
    const hole = holeFor(p.bolt);
    const shoe = (xc, n) => {
      const y0 = -hb / 2;
      const poly = [[y0, 0], [y0, shoeH], [y0 - ts, shoeH], [y0 - ts, ts], [y0 - leg, ts], [y0 - leg, 0]];
      const name = `Pfettenschuh ${n}`, zb = shoeH / 2 + 5, yb = y0 - leg / 2 - ts / 2;
      plates.push({ center: [xc - ls / 2, 0, 0], xDir: [0, 1, 0], normal: [1, 0, 0], poly, W: leg, H: shoeH, t: ls, name });
      // Schraube waagrecht durch Schenkel und Pfette, senkrecht durch Schenkel und Binderflansch (Binder nicht modelliert);
      // Bohrungen in beiden Schenkeln und in der Pfette (Hohlprofil: durch beide Wände, U: durch den Steg)
      norms.push({ bolt: true, size: p.bolt, clamp: ts + web, pos: [xc, y0 - ts, zb], dir: [0, 1, 0] });
      norms.push({ bolt: true, size: p.bolt, clamp: ts + 12, pos: [xc, yb, ts], dir: [0, 0, -1] });
      drills.push({ target: name, p: [xc, y0 - ts - 1, zb], dir: [0, 1, 0], len: ts + 2, d: hole });
      drills.push({ target: name, p: [xc, yb, ts + 1], dir: [0, 0, -1], len: ts + 2, d: hole });
      const piece = members.find((m) => xc >= m.a[0] - 1e-6 && xc <= m.b[0] + 1e-6);
      if (piece) drills.push({ target: piece.name, p: [xc, y0 - 1, zb], dir: [0, 1, 0], len: web + 2, d: hole });
    };
    let n = 0;
    xs.forEach((x, i) => {
      if (joints.includes(i)) { shoe(x - gap / 2 - ls / 2, ++n); shoe(x + gap / 2 + ls / 2, ++n); }
      else shoe(i === 0 ? x + ls / 2 - Math.min(ls / 2, p.overhang) : i === xs.length - 1 ? x - ls / 2 + Math.min(ls / 2, p.overhang) : x, ++n);
    });
    if (shoeH < 40) issues.push({ level: "Warnung", message: "Pfettenschuh sehr niedrig – Pfette zu flach" });
    if (leg < 2 * hole) issues.push({ level: "Hinweis", message: "Schenkel auf dem Binder kurz für die Schraube" });
    const bs = boltSet(p.bolt, ts + web);
    const info = `Pfette ${Math.round(total + 2 * p.overhang)} mm über ${spans.length} Feld(er)` + (joints.length ? `, ${joints.length} Stoß/Stöße über Binder` : "") + `, ${n} Pfettenschuhe, Schrauben ${p.bolt} x ${bs.length} (Pfette, Bohrung Ø ${hole}) – Binderflansch 12 mm angenommen`;
    return { chains, members, plates, norms, drills, info, issues };
  },
};

// ---------- Biegesteife Rahmenecke ----------
// Lage: Stütze in der Z-Achse (Steg in der XZ-Ebene, Flansche quer), Riegel ab der rechten Stützenflanschfläche in +X,
// Dachneigung α. Stirnplatte am Riegelende, mit dem Stützenflansch verschraubt; Steifen in der Stütze auf Höhe der
// Riegelflansche. Stützenfuß bei z = 0, Systemhöhe = Oberkante Riegel an der Stützenaußenkante (x = h/2 + tp).
export const RAHMENECKE = {
  label: "Rahmenecke",
  schema: [
    { key: "column", label: "Stütze", type: "section", kinds: ["hea", "heb", "ipe"], default: { kind: "hea", size: "200" }, group: "Profile" },
    { key: "rafter", label: "Riegel", type: "section", kinds: ["ipe", "hea", "heb"], default: { kind: "ipe", size: "240" }, group: "Profile" },
    { key: "height", label: "Höhe OK Riegel an der Stütze", type: "num", default: "4000", group: "Geometrie" },
    { key: "pitch", label: "Dachneigung", type: "num", unit: "°", default: "10", group: "Geometrie" },
    { key: "rafterLen", label: "Riegellänge (Stück im Modell)", type: "num", default: "1500", group: "Geometrie" },
    { key: "plateT", label: "Stirnplatte Dicke", type: "num", default: "20", group: "Stirnplatte" },
    { key: "extend", label: "Stirnplatte überstehend oben", type: "num", default: "80", group: "Stirnplatte" },
    { key: "bolt", label: "Schrauben", type: "select", options: BOLT_OPTS, default: "M20", group: "Stirnplatte" },
    { key: "grade", label: "Festigkeit", type: "select", options: [["10.9", "10.9 (HV)"], ["8.8", "8.8"]], default: "10.9", group: "Stirnplatte" },
    { key: "stiff", label: "Steifen in der Stütze", type: "check", default: true, group: "Stütze" },
    { key: "stiffT", label: "Steifendicke", type: "num", default: "12", group: "Stütze", when: (p) => p.stiff },
    { key: "capT", label: "Kopfplatte Stütze", type: "num", default: "15", group: "Stütze" },
  ],
  plan(p) {
    const issues = [];
    const c = p.column, r = p.rafter;
    const hc = c.dims.H, bc = c.dims.B, tfc = c.dims.t, twc = c.dims.s;
    const hr = r.dims.H, br = r.dims.B, tfr = r.dims.t;
    const a = (p.pitch * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), ta = Math.tan(a);
    if (!(p.pitch >= 0 && p.pitch < 45)) throw new Error("Dachneigung 0 … 45°");
    const tp = p.plateT, H = p.height, Lr = p.rafterLen;
    if (!(tp > 0 && Lr > hr)) throw new Error("Stirnplattendicke und Riegellänge prüfen");
    const xf = hc / 2; // Stützenflansch außen
    const xp = xf + tp; // Riegelende (Stirnplattenaußenseite)
    const hv = hr / ca; // senkrechte Riegelhöhe
    const zTop = H, zBot = H - hv; // Riegel-Ober-/Unterkante an x = xp
    const ext = p.extend, ovB = 30;
    const plateTop = zTop + ext, plateBot = zBot - ovB;
    if (!(zBot > 500)) throw new Error("Höhe zu klein für den Riegel");
    const members = [], plates = [], chains = [], norms = [];
    // Stütze bis Oberkante Stirnplatte, Kopfplatte darauf
    const colTop = plateTop;
    members.push({ section: c, a: [0, 0, 0], b: [0, 0, colTop], name: "Stütze", up: [1, 0, 0], rot: 0 });
    plates.push({ center: [0, 0, colTop], xDir: [1, 0, 0], normal: [0, 0, 1], W: hc, H: bc, t: p.capT, name: "Kopfplatte" });
    // Riegel: Achse in der Mitte, Ende senkrecht an der Stirnplatte
    const zAx = zTop - hv / 2;
    const d = [ca, 0, sa];
    const r0 = [xp, 0, zAx], r1 = [xp + Lr * ca, 0, zAx + Lr * sa];
    members.push({ section: r, a: [xp - hr, 0, zAx - hr * ta], b: r1, name: "Riegel", up: [-sa, 0, ca], cuts: { start: [{ p: r0, n: [-1, 0, 0] }], end: [] } });
    // Stirnplatte (YZ-Ebene), Breite = max(Riegel-, Stützenflansch)
    const pw = Math.max(br, bc);
    plates.push({ center: [xf, 0, (plateTop + plateBot) / 2], xDir: [0, 1, 0], normal: [1, 0, 0], W: pw, H: plateTop - plateBot, t: tp, name: "Stirnplatte" });
    // Schrauben: 2 Reihen quer (Abstand w), Zeilen: im Überstand oben, unter dem Oberflansch, über dem Unterflansch
    const t = NORM_THREADS[p.bolt], hole = holeFor(p.bolt);
    const w = Math.min(pw - 2 * Math.max(1.2 * hole, 30), Math.max(twc + 2 * 2.5 * t.d, 90));
    const e1 = 1.5 * hole;
    const rows = [zTop + ext / 2, zTop - tfr / ca - e1 - 5, zBot + tfr / ca + e1 + 5];
    if (ext < 2 * e1) issues.push({ level: "Hinweis", message: `Überstand oben ${fmt(ext)} mm knapp für ${p.bolt} (Randabstand 1,2 · d0)` });
    if (rows[1] - rows[2] < 2.2 * hole) issues.push({ level: "Warnung", message: "Riegel zu niedrig für zwei Schraubenreihen innen" });
    const clamp = tp + tfc, drills = [], zc = (plateTop + plateBot) / 2;
    const stirn = plates.find((x) => x.name === "Stirnplatte");
    stirn.holes = []; stirn.d = hole;
    for (const z of rows) for (const y of [-w / 2, w / 2]) {
      norms.push({ bolt: true, size: p.bolt, clamp, pos: [xp, y, z], dir: [-1, 0, 0], grade: p.grade });
      stirn.holes.push([y, z - zc]); // Plattenebene: x = Welt-y, y = Welt-z
      drills.push({ target: "Stütze", p: [xf + 1, y, z], dir: [-1, 0, 0], len: tfc + 2, d: hole }); // Bohrung im Stützenflansch
    }
    // Steifen zwischen den Stützenflanschen auf Höhe der Riegelflansche (beidseits des Stegs)
    if (p.stiff) {
      const sw = (bc - twc) / 2 - 2, sl = hc - 2 * tfc, c0 = c.dims;
      for (const [z, label] of [[zTop - tfr / ca / 2, "oben"], [zBot + tfr / ca / 2, "unten"]])
        // Ecken am Steg mit Freischnitt (Ausrundung r der Stütze bleibt frei); Plattenebene: x = Welt-x, y = Welt-y
        for (const sgn of [-1, 1]) {
          const y0 = -sgn * sw / 2, y1 = sgn * sw / 2, c = (c0.r || 0) + 5, x = sl / 2;
          const poly = [[-x, y0 + sgn * c], [-x + c, y0], [x - c, y0], [x, y0 + sgn * c], [x, y1], [-x, y1]];
          plates.push({ center: [0, sgn * (twc / 2 + sw / 2), z - p.stiffT / 2], xDir: [1, 0, 0], normal: [0, 0, 1], W: sl, H: sw, t: p.stiffT, poly, name: `Steife ${label} ${sgn < 0 ? "links" : "rechts"}` });
        }
    }
    const bs = boltSet(p.bolt, clamp);
    const info = `Stirnplatte ${Math.round(pw)} × ${Math.round(plateTop - plateBot)} × ${fmt(tp)} mm, ${rows.length * 2} × ${p.bolt} x ${bs.length} - ${p.grade}, Bohrung Ø ${hole} in Stirnplatte und Stützenflansch, Klemmlänge ${fmt(clamp)} mm, Neigung ${fmt(p.pitch)}°`;
    return { chains, members, plates, norms, drills, info, issues };
  },
};
