// Treppen-Generator geradläufig (MegaCAD-Abgleich M13): Steigung aus Geschosshöhe, Auftritt aus der Schrittmaßregel,
// Wangen (Flachstahl oder UPN) mit seitlich eingesetzten Stufen oder ein/zwei Holme mit aufgesattelten Stufen.
// Stufen als Platten (Gitterrost, Blech, Holz – Dicke einstellbar). Reine Rechnung; Bauplan siehe generator.js.
//
// Lage: Antritt bei x = 0 auf dem Boden (z = 0), Lauf steigt in +X, Laufbreite in +Y (lichte Breite zwischen den
// Wangen bzw. Stufenlänge). n Steigungen, n − 1 Stufen; die letzte Steigung führt auf die obere Decke bei
// x = (n − 1) · a. Wangen/Holme sind unten waagrecht (Boden) und oben senkrecht (Deckenstirn) geschnitten.
// Prüfung nach DIN 18065: 2s + a = 590 … 650 mm, Steigung ≤ 200 mm, Auftritt ≥ 230 mm (Hinweise, keine Statik).
// Geländer (wie MegaCAD): links, rechts oder beidseitig, ums Podest herum, Knieleisten oder Staketen, Auslauf oben;
// Höhe über Stufenvorderkante. Ältere Treppen ohne diese Angabe bleiben ohne Geländer (missing: "keine").

import { sectionGeometry } from "./sections.js";
import { railAlong } from "./treppengelaender.js";

const podest = (p) => p.form === "L" || p.form === "U";
const gel = (p) => p.gel !== "keine";

export const TREPPE = {
  label: "Treppe",
  schema: [
    { key: "form", label: "Form", type: "select", options: [["gerade", "geradläufig"], ["L", "L-Form (viertelgewendelt mit Podest)"], ["U", "U-Form (halbgewendelt mit Podest)"]], default: "gerade", tiles: "top", group: "Lauf" },
    { key: "height", label: "Geschosshöhe (Steigungshöhe gesamt)", type: "num", default: "2800", group: "Lauf" },
    { key: "steps", label: "Steigungen (0 = automatisch)", type: "num", unit: "Stk", default: "0", group: "Lauf" },
    { key: "going", label: "Auftritt a (0 = aus 2s + a = 630)", type: "num", default: "0", group: "Lauf" },
    { key: "nosing", label: "Unterschneidung", type: "num", default: "20", group: "Lauf" },
    { key: "width", label: "Laufbreite (lichte)", type: "num", default: "1000", group: "Lauf" },
    { key: "support", label: "Tragwerk", type: "select", options: [["flach", "Wangen Flachstahl"], ["upn", "Wangen UPN"], ["holm2", "Zwei Holme"], ["holm1", "Mittelholm"]], default: "flach", tiles: "side", group: "Tragwerk" },
    { key: "wangeH", label: "Wangenhöhe", type: "num", default: "250", group: "Tragwerk", when: (p) => p.support === "flach" },
    { key: "wangeT", label: "Wangendicke", type: "num", default: "12", group: "Tragwerk", when: (p) => p.support === "flach" },
    { key: "upn", label: "UPN", type: "section", kinds: ["upn"], default: { kind: "upn", size: "200" }, group: "Tragwerk", when: (p) => p.support === "upn" },
    { key: "holm", label: "Holmprofil", type: "section", kinds: ["rechteck", "vierkant"], default: { kind: "rechteck", size: "160x80x5" }, group: "Tragwerk", when: (p) => p.support === "holm2" || p.support === "holm1" },
    { key: "holmInset", label: "Holm vom Stufenrand", type: "num", default: "150", group: "Tragwerk", when: (p) => p.support === "holm2" },
    { key: "turn", label: "Richtung am Podest", type: "select", options: [["links", "nach links"], ["rechts", "nach rechts"]], default: "links", group: "Podest", when: podest },
    { key: "n1", label: "Steigungen bis Podest (0 = Hälfte)", type: "num", unit: "Stk", default: "0", group: "Podest", when: podest },
    { key: "podestD", label: "Podesttiefe (0 = Laufbreite)", type: "num", default: "0", group: "Podest", when: (p) => p.form === "U" },
    { key: "gap", label: "Abstand der Läufe (Treppenauge)", type: "num", default: "100", group: "Podest", when: (p) => p.form === "U" },
    { key: "podestRahmen", label: "Podestrahmen", type: "section", kinds: ["rechteck", "vierkant", "u"], default: { kind: "rechteck", size: "100x50x4" }, group: "Podest", when: podest },
    { key: "stuetzen", label: "Podeststützen", type: "select", options: [["aussen", "2 außen"], ["alle", "4 (alle Ecken)"], ["keine", "keine (an der Wand)"]], default: "aussen", group: "Podest", when: podest },
    { key: "stuetze", label: "Stützenprofil", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "80x4" }, group: "Podest", when: (p) => podest(p) && p.stuetzen !== "keine" },
    { key: "tread", label: "Stufen", type: "select", options: [["gitterrost", "Gitterrost"], ["blech", "Blech"], ["holz", "Holz"]], default: "gitterrost", group: "Stufen" },
    { key: "treadT", label: "Stufendicke", type: "num", default: "30", group: "Stufen" },
    { key: "gel", label: "Geländer (beim Hinaufgehen)", type: "select", options: [["beide", "beidseitig"], ["links", "links"], ["rechts", "rechts"], ["keine", "kein Geländer"]], default: "beide", missing: "keine", tiles: "top", group: "Geländer" },
    { key: "gelPodest", label: "Geländer ums Podest", type: "check", default: true, group: "Geländer", when: (p) => gel(p) && podest(p) },
    { key: "gelH", label: "Höhe über Stufenvorderkante", type: "num", default: "1000", group: "Geländer", when: gel },
    { key: "gelFill", label: "Füllung", type: "select", options: [["quer", "Knieleisten"], ["staketen", "Staketen"], ["keine", "nur Handlauf"]], default: "quer", tiles: "front", group: "Geländer", when: gel },
    { key: "gelBars", label: "Anzahl Knieleisten", type: "num", unit: "Stk", default: "2", group: "Geländer", when: (p) => gel(p) && p.gelFill === "quer" },
    { key: "gelGap", label: "Öffnung max.", type: "num", default: "110", group: "Geländer", when: (p) => gel(p) && p.gelFill === "staketen" },
    { key: "gelBar", label: "Knieleiste / Stab", type: "section", kinds: ["rohr", "vierkant", "vierkantvoll", "rund", "flach"], default: { kind: "rohr", size: "26.9x2.3" }, group: "Geländer", when: (p) => gel(p) && p.gelFill !== "keine" },
    { key: "gelBelt", label: "Untergurt", type: "section", kinds: ["flach", "vierkant", "rechteck"], default: { kind: "flach", size: "40x8" }, group: "Geländer", when: (p) => gel(p) && p.gelFill === "staketen" },
    { key: "gelPost", label: "Pfosten", type: "section", kinds: ["vierkant", "rechteck", "rohr", "flach"], default: { kind: "vierkant", size: "40x3" }, group: "Geländer", when: gel },
    { key: "gelPostMax", label: "Pfostenabstand max.", type: "num", default: "1200", group: "Geländer", when: gel },
    { key: "gelDown", label: "Pfosten unter Stufenkante (Befestigung)", type: "num", default: "150", group: "Geländer", when: gel },
    { key: "gelRail", label: "Handlauf", type: "section", kinds: ["rohr", "vierkant", "rechteck", "flach", "rund"], default: { kind: "rohr", size: "42.4x2.6" }, group: "Geländer", when: gel },
    { key: "gelAuslauf", label: "Auslauf oben (waagrecht)", type: "num", default: "300", group: "Geländer", when: gel },
  ],

  plan(p) {
    const issues = [];
    const H = p.height;
    if (!(H > 300)) throw new Error("Geschosshöhe zu klein");
    const n = p.steps > 0 ? Math.round(p.steps) : Math.max(2, Math.round(H / 175));
    if (n < 2) throw new Error("Mindestens 2 Steigungen");
    const s = H / n;
    const a = p.going > 0 ? p.going : 630 - 2 * s;
    if (!(a > 50)) throw new Error("Auftritt zu klein – weniger Steigungen wählen");
    const u = p.nosing || 0, tt = p.treadT, B = p.width;
    if (!(tt > 0 && B > 200)) throw new Error("Stufendicke und Laufbreite prüfen");
    const step = 2 * s + a;
    if (step < 590 - 1e-6 || step > 650 + 1e-6) issues.push({ level: "Warnung", message: `Schrittmaß 2s + a = ${Math.round(step)} mm außerhalb 590 … 650 mm` });
    if (s > 200 + 1e-6) issues.push({ level: "Warnung", message: `Steigung ${fmt(s)} mm über 200 mm` });
    if (a < 230 - 1e-6) issues.push({ level: "Warnung", message: `Auftritt ${fmt(a)} mm unter 230 mm` });
    if (a < 260 - 1e-6 && u < 30 - 1e-6) issues.push({ level: "Hinweis", message: "Auftritt unter 260 mm: Unterschneidung ≥ 30 mm vorsehen" });
    const tanA = s / a, alpha = Math.atan(tanA), cosA = Math.cos(alpha), sinA = Math.sin(alpha);
    const members = [], plates = [], chains = [];
    // Tragwerk: Querschnitt, Ausdehnung senkrecht zur Achse in der Laufebene (depth), Dicke quer (thick), Drehung
    let sec, depth, thick, rot = 0;
    if (p.support === "flach") {
      const dims = { B: p.wangeH, t: p.wangeT };
      sec = { kind: "flach", dims, geom: sectionGeometry("flach", dims) };
      depth = p.wangeH; thick = p.wangeT; rot = 90;
    } else if (p.support === "upn") {
      sec = p.upn; depth = sec.geom.height; thick = sec.geom.width;
    } else {
      sec = p.holm; depth = Math.max(sec.geom.width, sec.geom.height); thick = Math.min(sec.geom.width, sec.geom.height);
      rot = sec.geom.width > sec.geom.height ? 90 : 0;
    }
    const side = p.support === "flach" || p.support === "upn";
    // Achse: seitlich = durch die Stufenmitten; aufgesattelt = Oberkante an den hinteren Stufenunterkanten
    let c; // z = tanA · x + c (Lauf mit Antritt bei x = 0, z = 0)
    if (side) {
      const x1 = 0.5 * a - u / 2, z1 = s - tt / 2;
      c = z1 - tanA * x1;
      // passen die Stufen in die Wange?
      const corner = Math.max(...[[-u, s - tt], [-u, s], [a, s - tt], [a, s]].map(([x, z]) => Math.abs((z - (tanA * x + c)) * cosA)));
      if (corner > depth / 2 + 1e-6) throw new Error(`Wange zu niedrig für die Stufen: mindestens ${Math.ceil(2 * corner)} mm`);
    } else c = -tt - depth / 2 / cosA;
    if (p.support === "holm2" && !(B - 2 * p.holmInset > thick)) throw new Error("Holme zu weit innen");
    const ys = side ? [-thick / 2, B + thick / 2] : p.support === "holm2" ? [p.holmInset, B - p.holmInset] : [B / 2];
    const sideNames = side ? ["Wange links", "Wange rechts"] : ys.length > 1 ? ["Holm links", "Holm rechts"] : ["Mittelholm"];

    // Ein Lauf mit nR Steigungen in eigener Lage (Antritt x = 0, Höhe z0); T dreht um Z und verschiebt.
    // Unten: auf dem Boden waagrecht geschnitten, vom Podest aus senkrecht an der Podestkante; oben senkrecht.
    const flights = [];
    const flight = (nR, z0, T, label, fromFloor, stepNo0) => {
      flights.push({ nR, z0, T, fromFloor });
      const xTop = (nR - 1) * a;
      const zAt = (x) => z0 + tanA * x + c;
      const ext = depth * 2;
      const x0 = fromFloor ? (0 - c) / tanA - ext : -ext, x1 = xTop + ext;
      const cuts = { start: [fromFloor ? { p: T.p([0, 0, z0]), n: [0, 0, -1] } : { p: T.p([0, 0, z0]), n: T.d([-1, 0, 0]) }], end: [{ p: T.p([xTop, 0, z0]), n: T.d([1, 0, 0]) }] };
      ys.forEach((y, i) => members.push({ section: sec, a: T.p([x0, y, zAt(x0)]), b: T.p([x1, y, zAt(x1)]), name: sideNames[i] + label, up: T.d([-sinA, 0, cosA]), rot: side && i === 1 && p.support === "upn" ? 180 : rot, cuts }));
      for (let i = 1; i < nR; i++) {
        const xa = (i - 1) * a - u, xb = i * a;
        plates.push({ center: T.p([(xa + xb) / 2, B / 2, z0 + i * s - tt]), xDir: T.d([0, 1, 0]), normal: [0, 0, 1], W: B, H: xb - xa, t: tt, name: `Stufe ${stepNo0 + i}`, tread: p.tread });
      }
      return xTop;
    };
    const rotZ = (deg, o) => {
      const r = (deg * Math.PI) / 180, cs = Math.round(Math.cos(r) * 1e12) / 1e12, sn = Math.round(Math.sin(r) * 1e12) / 1e12;
      const d = (v) => [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2]];
      return { d, p: (v) => { const q = d(v); return [q[0] + o[0], q[1] + o[1], q[2] + o[2]]; } };
    };
    let info, x1 = 0, D = B, zP = 0;
    const geo = { s, a, u, n, H, B };
    if (!podest(p)) {
      const xTop = flight(n, 0, rotZ(0, [0, 0, 0]), "", true, 0);
      info = `${n} Steigungen à ${fmt(s)} mm, Auftritt ${fmt(a)} mm, 2s + a = ${Math.round(step)} mm, Neigung ${fmt((alpha * 180) / Math.PI)}°, Lauflänge ${Math.round(xTop)} mm`;
    } else {
      const n1 = p.n1 > 0 ? Math.round(p.n1) : Math.floor(n / 2), n2 = n - n1;
      if (n1 < 2 || n2 < 2) throw new Error("Jeder Lauf braucht mindestens 2 Steigungen – Steigungen bis Podest prüfen");
      zP = n1 * s;
      const left = p.turn !== "rechts";
      x1 = flight(n1, 0, rotZ(0, [0, 0, 0]), " Lauf 1", true, 0);
      const g = p.gap || 0;
      D = p.form === "U" ? (p.podestD > 0 ? p.podestD : B) : B;
      if (p.form === "U" && D < B - 1e-6) issues.push({ level: "Warnung", message: `Podesttiefe ${fmt(D)} mm kleiner als die Laufbreite` });
      // Podestfläche [x1, x1 + D] × [yLo, yHi] und Lage des zweiten Laufs
      let yLo = 0, yHi = B, T2;
      if (p.form === "L") T2 = left ? rotZ(90, [x1 + B, B, 0]) : rotZ(-90, [x1, 0, 0]);
      else if (left) { yHi = 2 * B + g; T2 = rotZ(180, [x1, 2 * B + g, 0]); }
      else { yLo = -(B + g); T2 = rotZ(180, [x1, -g, 0]); }
      const x2 = flight(n2, zP, T2, " Lauf 2", false, n1);
      // Podestbelag, Rahmen darunter (bündig mit dem Belagrand), Stützen
      const PW = D, PH = yHi - yLo, cx = x1 + D / 2, cy = (yLo + yHi) / 2;
      geo.yLo = yLo; geo.yHi = yHi; geo.n1 = n1; geo.x2 = x2;
      plates.push({ center: [cx, cy, zP - tt], xDir: [1, 0, 0], normal: [0, 0, 1], W: PW, H: PH, t: tt, name: "Podest", tread: p.tread });
      const fr = p.podestRahmen, frRot = fr.geom.width > fr.geom.height ? 90 : 0; // hochkant
      const fw = Math.min(fr.geom.width, fr.geom.height), fh = Math.max(fr.geom.width, fr.geom.height), zf = zP - tt - fh / 2;
      const rx0 = x1 + fw / 2, rx1 = x1 + D - fw / 2, ry0 = yLo + fw / 2, ry1 = yHi - fw / 2;
      chains.push({ section: { kind: fr.kind, dims: fr.dims }, points: [[rx0, ry0, zf], [rx1, ry0, zf], [rx1, ry1, zf], [rx0, ry1, zf], [rx0, ry0, zf]], name: "Podestrahmen", up: [0, 0, 1], rot: frRot });
      if (p.stuetzen !== "keine") {
        const st = p.stuetze, sw = Math.max(st.geom.width, st.geom.height) / 2;
        const zTop = zP - tt - fh;
        if (!(zTop > 100)) throw new Error("Podest zu niedrig für Stützen");
        const corners = [[x1 + D - sw, yLo + sw], [x1 + D - sw, yHi - sw]];
        if (p.stuetzen === "alle") corners.push([x1 + sw, yLo + sw], [x1 + sw, yHi - sw]);
        corners.forEach(([x, y], i) => members.push({ section: st, a: [x, y, 0], b: [x, y, zTop], name: `Podeststütze ${i + 1}`, up: [1, 0, 0] }));
      }
      info = `${n} Steigungen à ${fmt(s)} mm (${n1} + ${n2}), Auftritt ${fmt(a)} mm, 2s + a = ${Math.round(step)} mm, Neigung ${fmt((alpha * 180) / Math.PI)}°, Podest auf ${Math.round(zP)} mm (${fmt(PW)} × ${fmt(PH)} mm), Läufe ${Math.round(x1)} / ${Math.round(x2)} mm`;
    }
    if (gel(p)) {
      const r = railing(p, { flights, s, a, u, B, x1, D, zP, tanA, off: (side ? thick : 0) + p.gelPost.geom.width / 2, rotZ });
      chains.push(...r.chains);
      members.push(...r.members);
      issues.push(...r.issues);
      info += `, Geländer: ${r.info}`;
    }
    Object.assign(geo, { x1: podest(p) ? x1 : (n - 1) * a, D, zP });
    return { chains, members, plates, info, issues, geo };
  },

  views: ["top", "front"],
  /** Maßlinien der Skizze im Eigenschaftenfeld (siehe genskizze.js); Lage wie der Bauplan */
  dims(p, plan, view) {
    const g = plan.geo;
    if (!g) return [];
    const { s, a, u, H, B, x1, D, zP } = g, r = Math.round;
    const gap = Math.max(250, B * 0.25), out = [];
    if (view === "top") {
      out.push({ key: "width", a: [0, 0], b: [0, B], off: gap, text: r(B) });
      out.push({ key: "going", a: [-u, B], b: [a - u, B], off: gap, text: r(a) });
      out.push({ key: podest(p) ? "n1" : "steps", a: [0, 0], b: [x1, 0], off: -gap, text: r(x1) });
      if (podest(p)) {
        out.push({ key: p.form === "U" ? "podestD" : null, a: [x1, g.yLo], b: [x1 + D, g.yLo], off: -gap, text: r(D) });
        if (p.form === "U") {
          const yb = g.yLo < 0 ? -(p.gap || 0) : B, yt = g.yLo < 0 ? 0 : B + (p.gap || 0);
          out.push({ key: "gap", a: [x1 - a, yb], b: [x1 - a, yt], off: gap / 2, text: r(p.gap || 0) });
        }
      }
    } else if (view === "front") {
      const xe = x1 + (podest(p) ? D : 0);
      out.push({ key: "height", a: [xe, 0], b: [xe, H], off: -gap, text: r(H) });
      out.push({ key: "steps", a: [-u, 0], b: [-u, s], off: -gap * 0.6, text: `s ${String(r(s * 10) / 10).replace(".", ",")}` });
      if (gel(p)) out.push({ key: "gelH", a: [-u, s], b: [-u, s + p.gelH], off: gap, text: r(p.gelH) });
      if (podest(p)) out.push({ key: "n1", a: [x1 + D, 0], b: [x1 + D, zP], off: gap, text: r(zP) });
    }
    return out;
  },
};

/**
 * Geländerzüge der Treppe. Gerechnet wird in der Lage »Podest nach links« (rechts = außen); bei »nach rechts« wird an
 * y = B / 2 gespiegelt, dann ist links außen. Läufe: Lauflinie auf Höhe Stufenvorderkante; vom Podest aus beginnt sie
 * eine Auftrittsbreite vor der ersten Stufenkante auf Podesthöhe (Schnitt mit der Podestebene), vom Boden aus an der
 * ersten Stufenkante.
 */
function railing(p, { flights, s, a, u, B, x1, D, zP, tanA, off, rotZ }) {
  const issues = [];
  const left = p.turn !== "rechts", form = podest(p) ? p.form : "gerade";
  const f1 = flights[0];
  // zweiter Lauf in der Lage »nach links«
  const f2 = form === "gerade" ? null : { ...flights[1], T: form === "L" ? rotZ(90, [x1 + B, B, 0]) : rotZ(180, [x1, 2 * B + (p.gap || 0), 0]) };
  const start = (f, y, nosing = f.fromFloor) => f.T.p(nosing ? [-u, y, f.z0 + s] : [-u - a, y, f.z0]);
  const at = (f, y, x) => f.T.p([x, y, f.z0 + s + (x + u) * tanA]);
  const end = (f, y) => f.T.p([(f.nR - 1) * a - u, y, f.z0 + f.nR * s]);
  const aus = (f, y) => (p.gelAuslauf > 0 ? [f.T.p([(f.nR - 1) * a + p.gelAuslauf, y, f.z0 + f.nR * s])] : []);
  const yo = -off, yi = B + off, post = p.gelPost.geom.width;
  let outer, inner;
  if (form === "gerade") {
    outer = [[start(f1, yo), end(f1, yo), ...aus(f1, yo)]];
    inner = [[start(f1, yi), end(f1, yi), ...aus(f1, yi)]];
  } else if (!p.gelPodest) {
    const sep = (y) => [[start(f1, y), end(f1, y)], [start(f2, y, true), end(f2, y), ...aus(f2, y)]];
    outer = sep(yo);
    inner = sep(yi);
    if (form === "L") {
      // innen: Lauf 1 endet vor dem Geländer von Lauf 2, Lauf 2 beginnt hinter dem von Lauf 1
      inner[0][1] = at(f1, yi, Math.min((f1.nR - 1) * a - u, x1 - off - post));
      inner[1][0] = at(f2, yi, Math.max(-u, off + post));
    }
  } else if (form === "L") {
    if (B - u - a < -off + post) throw new Error("Podest zu klein für das Geländer – Laufbreite prüfen");
    outer = [[start(f1, yo), end(f1, yo), [x1 + B + off, -off, zP], start(f2, yo), end(f2, yo), ...aus(f2, yo)]];
    inner = [[start(f1, yi), at(f1, yi, Math.min((f1.nR - 1) * a - u, x1 - off - post))], [at(f2, yi, Math.max(-u, off + post)), end(f2, yi), ...aus(f2, yi)]];
  } else {
    const g = p.gap || 0, X = x1 + u + a;
    if (X > x1 + D + off - post) throw new Error("Podest zu schmal für das Geländer – Podesttiefe prüfen");
    outer = [[start(f1, yo), end(f1, yo), [x1 + D + off, -off, zP], [x1 + D + off, 2 * B + g + off, zP], start(f2, yo), end(f2, yo), ...aus(f2, yo)]];
    // innen über das Treppenauge: zu schmal für zwei Geländer → eins in der Mitte
    const wi = g >= 2 * off + post ? off : g / 2;
    if (wi < off) issues.push({ level: "Hinweis", message: `Treppenauge ${Math.round(g)} mm: inneres Geländer mittig im Auge` });
    const y1 = B + wi, y2 = B + wi; // lokal; Lauf 2 liegt gedreht, global y = B + g − wi
    inner = [[start(f1, y1), end(f1, y1), [X, B + wi, zP], start(f2, y2), end(f2, y2), ...aus(f2, y2)]];
  }
  const mirror = (path) => (left ? path : path.map((q) => [q[0], B - q[1], q[2]]));
  // links/rechts beim Hinaufgehen: in der Lage »nach links« ist rechts außen
  const wantRight = p.gel === "beide" || p.gel === "rechts", wantLeft = p.gel === "beide" || p.gel === "links";
  const sides = [];
  if (left ? wantRight : wantLeft) sides.push([left ? "rechts" : "links", outer]);
  if (left ? wantLeft : wantRight) sides.push([left ? "links" : "rechts", inner]);
  const o = { H: p.gelH, post: p.gelPost, postMax: p.gelPostMax, postDown: p.gelDown, rail: p.gelRail, fill: p.gelFill, bar: p.gelBar, bars: p.gelBars, gap: p.gelGap, belt: p.gelBelt, bottomZ: 100 };
  if (!(o.H > 300)) throw new Error("Geländerhöhe zu klein");
  if (!(o.postMax > post)) throw new Error("Pfostenabstand zu klein");
  if (o.H < 900 - 1e-6) issues.push({ level: "Warnung", message: `Geländerhöhe ${Math.round(o.H)} mm unter 900 mm – Landesbauordnung bzw. DIN 18065 prüfen` });
  const chains = [], members = [];
  let posts = 0, bars = 0, gapMax = 0;
  for (const [name, paths] of sides) {
    paths.forEach((path, i) => {
      const r = railAlong(mirror(path), o, `Geländer ${name}${paths.length > 1 ? " " + (i + 1) : ""}`);
      chains.push(...r.chains);
      members.push(...r.members);
      posts += r.posts; bars += r.bars; gapMax = Math.max(gapMax, r.gapMax);
    });
  }
  if (gapMax > 120 + 1e-6) issues.push({ level: p.gelFill === "quer" ? "Hinweis" : "Warnung", message: p.gelFill === "quer" ? `Knieleisten: Öffnung ${Math.round(gapMax)} mm – nur für Arbeitsstätten/Industrie (EN ISO 14122-3), nicht für Wohngebäude` : `Öffnung ${Math.round(gapMax)} mm größer als 120 mm` });
  const what = p.gelFill === "quer" ? `${bars} Knieleisten` : p.gelFill === "staketen" ? `${bars} Stäbe` : "nur Handlauf";
  return { chains, members, issues, info: `${sides.map((x) => x[0]).join(" und ")}, ${posts} Pfosten, ${what}` };
}

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
