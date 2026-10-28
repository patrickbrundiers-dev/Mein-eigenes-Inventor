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

import { fieldError } from "./generror.js";
import { sectionGeometry } from "./sections.js";
import { NORM_THREADS } from "./normteile.js";
import { railAlong } from "./treppengelaender.js";
import { normSchema, railingIssues } from "./gelaendernorm.js";
import { orientRot, rotExtent } from "./orient.js";
import { holderSchema } from "./handlaufhalter.js";
import { mountSchema, mountConfig, topMount, sideMount, sideOffset, findSideFace, planeFace, findMemberFace, findPlateFace, faceCoords, applyTargetHoles, overrideFor, mountCollisions, mountInfo } from "./pfostenbefestigung.js";

const podest = (p) => p.form === "L" || p.form === "U";
const gel = (p) => p.gel !== "keine";
const gk = (k) => "gel" + k[0].toUpperCase() + k.slice(1);
const gelMount = (p) => (gel(p) && (p.gelMount === "oben" || p.gelMount === "seitlich") ? p.gelMount : null);
const gelThrough = (p) => gel(p) && p.gelFill !== "keine" && p.gelBeltMode !== "zwischen";

export const TREPPE = {
  label: "Treppe",
  schema: [
    { key: "form", label: "Form", type: "select", options: [["gerade", "geradläufig"], ["L", "L-Form (viertelgewendelt mit Podest)"], ["U", "U-Form (halbgewendelt mit Podest)"]], default: "gerade", tiles: "top", group: "Lauf" },
    { key: "height", label: "Geschosshöhe (Steigungshöhe gesamt)", type: "num", default: "2800", group: "Lauf" },
    { key: "steps", label: "Steigungen (0 = automatisch)", type: "num", unit: "Stk", default: "0", group: "Lauf" },
    { key: "going", label: "Auftritt a (0 = aus 2s + a = 630)", type: "num", default: "0", group: "Lauf" },
    { key: "nosing", label: "Unterschneidung", type: "num", default: "20", group: "Lauf" },
    { key: "width", label: "Laufbreite (lichte)", type: "num", default: "1000", group: "Lauf" },
    { key: "support", label: "Tragwerk", type: "select", options: [["flach", "Wangen Flachstahl"], ["upn", "Wangen aus Profil (UPN, U …)"], ["holm2", "Zwei Holme"], ["holm1", "Mittelholm"]], default: "flach", tiles: "side", group: "Tragwerk" },
    { key: "wangeH", label: "Wangenhöhe", type: "num", default: "250", group: "Tragwerk", when: (p) => p.support === "flach" },
    { key: "wangeT", label: "Wangendicke", type: "num", default: "12", group: "Tragwerk", when: (p) => p.support === "flach" },
    { key: "upn", label: "Wangenprofil", type: "section", default: { kind: "upn", size: "200" }, group: "Tragwerk", when: (p) => p.support === "upn" },
    { key: "holm", label: "Holmprofil", type: "section", default: { kind: "rechteck", size: "160x80x5" }, group: "Tragwerk", when: (p) => p.support === "holm2" || p.support === "holm1" },
    { key: "holmInset", label: "Holm vom Stufenrand", type: "num", default: "150", group: "Tragwerk", when: (p) => p.support === "holm2" },
    { key: "turn", label: "Richtung am Podest", type: "select", options: [["links", "nach links"], ["rechts", "nach rechts"]], default: "links", group: "Podest", when: podest },
    { key: "n1", label: "Steigungen bis Podest (0 = Hälfte)", type: "num", unit: "Stk", default: "0", group: "Podest", when: podest },
    { key: "podestD", label: "Podesttiefe (0 = Laufbreite)", type: "num", default: "0", group: "Podest", when: (p) => p.form === "U" },
    { key: "gap", label: "Abstand der Läufe (Treppenauge)", type: "num", default: "100", group: "Podest", when: (p) => p.form === "U" },
    { key: "podestRahmen", label: "Podestrahmen", type: "section", default: { kind: "rechteck", size: "100x50x4" }, group: "Podest", when: podest },
    { key: "stuetzen", label: "Podeststützen", type: "select", options: [["aussen", "2 außen"], ["alle", "4 (alle Ecken)"], ["keine", "keine (an der Wand)"]], default: "aussen", group: "Podest", when: podest },
    { key: "anschluss", label: "Anschlüsse", type: "select", options: [["platten", "Fußwinkel bzw. Bodenplatten, Kopfplatten an der Decke, Stufenkonsolen auf Holmen"], ["keine", "ohne (bisher)"]], default: "platten", missing: "keine", group: "Tragwerk" },
    { key: "stuetze", label: "Stützenprofil", type: "section", default: { kind: "vierkant", size: "80x4" }, group: "Podest", when: (p) => podest(p) && p.stuetzen !== "keine" },
    { key: "tread", label: "Stufen", type: "select", options: [["gitterrost", "Gitterrost"], ["blech", "Blech"], ["holz", "Holz"]], default: "gitterrost", group: "Stufen" },
    { key: "treadT", label: "Stufendicke", type: "num", default: "30", group: "Stufen" },
    { key: "stepFix", label: "Stufenbefestigung", type: "select", options: [["din", "verschraubt nach DIN 24531 (Seitenbleche, M12)"], ["keine", "ohne (Stufe zwischen den Wangen)"]], default: "din", missing: "keine", group: "Stufen", when: (p) => p.support === "flach" || p.support === "upn" },
    { key: "gel", label: "Geländer (beim Hinaufgehen)", type: "select", options: [["beide", "beidseitig"], ["links", "links"], ["rechts", "rechts"], ["keine", "kein Geländer"]], default: "beide", missing: "keine", tiles: "top", group: "Geländer" },
    { key: "gelPodest", label: "Geländer ums Podest", type: "check", default: true, group: "Geländer", when: (p) => gel(p) && podest(p) },
    ...normSchema((k) => "gel" + k[0].toUpperCase() + k.slice(1), "Geländer", gel, { def: "arbeit", fall: false }),
    { key: "gelH", label: "Höhe über Stufenvorderkante", type: "num", default: "1000", group: "Geländer", when: gel },
    { key: "gelFill", label: "Füllung", type: "select", options: [["quer", "Knieleisten"], ["staketen", "Staketen"], ["keine", "nur Handlauf"]], default: "quer", tiles: "front", group: "Geländer", when: gel },
    { key: "gelBars", label: "Anzahl Knieleisten", type: "num", unit: "Stk", default: "2", group: "Geländer", when: (p) => gel(p) && p.gelFill === "quer" },
    { key: "gelGap", label: "Öffnung max.", type: "num", default: "110", group: "Geländer", when: (p) => gel(p) && p.gelFill === "staketen" },
    { key: "gelBeltMode", label: "Knieleisten / Untergurt", type: "select", options: [["durch", "durch die Pfosten gesteckt (Stäbe durch den Gurt)"], ["zwischen", "zwischen den Pfosten"]], default: "durch", missing: "zwischen", group: "Geländer", when: (p) => gel(p) && p.gelFill !== "keine" },
    { key: "gelBeltMax", label: "Am Stück bis (sonst Stoß im Pfosten)", type: "num", default: "5800", group: "Geländer", when: (p) => gelThrough(p) },
    { key: "gelAllow", label: "Aufmaß der Bohrungen (auf Ø bzw. Maß)", type: "num", default: "1", group: "Geländer", when: (p) => gelThrough(p) },
    { key: "gelBar", label: "Knieleiste / Stab", type: "section", default: { kind: "rohr", size: "26.9x2.3" }, group: "Geländer", when: (p) => gel(p) && (p.gelFill === "quer" || (p.gelFill === "staketen" && !gelThrough(p))) },
    { key: "gelStab", label: "Stab (durch den Untergurt)", type: "section", default: { kind: "rund", size: "12" }, group: "Geländer", when: (p) => gelThrough(p) && p.gelFill === "staketen" },
    { key: "gelBelt", label: "Untergurt", type: "section", default: { kind: "rohr", size: "26.9x2.3" }, group: "Geländer", when: (p) => gel(p) && p.gelFill === "staketen" },
    { key: "gelPost", label: "Pfosten", type: "section", default: { kind: "vierkant", size: "40x3" }, group: "Geländer", when: gel },
    { key: "gelPostMax", label: "Pfostenabstand max.", type: "num", default: "1200", group: "Geländer", when: gel },
    { key: "gelMount", label: "Pfostenbefestigung", type: "select", options: [["seitlich", "seitlich mit Befestigungsblech an Wange bzw. Podestrahmen"], ["oben", "oben mit Fußplatte (Wange, Podestrahmen bzw. Stufe)"], ["aus", "neben der Wange, ohne Befestigung (bisher)"]], default: "seitlich", missing: "aus", group: "Pfostenbefestigung", when: gel },
    // seitlich: schmale Lasche 60 × 160 zwischen den Stufenbohrungen, zwei Schrauben untereinander unter dem Pfostenfuß
    ...mountSchema(gk, "Pfostenbefestigung", gelMount, { oW: "70", oL: "160", oT: "10", holes: "2l", sW: "60", sH: "160", sT: "10", sHoles: "frei", free: "0; -58; 0; 12", sDown: "-107", d: "13.5", e: "25" }),
    { key: "gelRhythm", label: "Pfosten an den Stufen ausrichten (gleicher Rhythmus, Bleche neben den Stufenbohrungen)", type: "check", default: true, missing: false, group: "Pfostenbefestigung", when: (p) => !!gelMount(p) && (p.support === "flach" || p.support === "upn") },
    { key: "gelDown", label: "Pfosten unter Stufenkante (Befestigung)", type: "num", default: "150", group: "Geländer", when: (p) => gel(p) && !gelMount(p) },
    { key: "gelRail", label: "Handlauf", type: "section", default: { kind: "rohr", size: "42.4x2.6" }, group: "Geländer", when: gel },
    ...holderSchema((k) => "gel" + k[0].toUpperCase() + k.slice(1), "Geländer", gel),
    { key: "gelAuslauf", label: "Auslauf oben (waagrecht)", type: "num", default: "300", group: "Geländer", when: gel },
  ],

  plan(p) {
    const issues = [];
    const H = p.height;
    if (!(H > 300)) throw fieldError("Geschosshöhe zu klein", "height");
    const n = p.steps > 0 ? Math.round(p.steps) : Math.max(2, Math.round(H / 175));
    if (n < 2) throw fieldError("Mindestens 2 Steigungen", "steps");
    const s = H / n;
    const a = p.going > 0 ? p.going : 630 - 2 * s;
    if (!(a > 50)) throw fieldError("Auftritt zu klein – weniger Steigungen wählen", "going");
    const u = p.nosing || 0, tt = p.treadT, B = p.width;
    if (!(tt > 0 && B > 200)) throw fieldError("Stufendicke und Laufbreite prüfen", "width");
    const step = 2 * s + a;
    if (step < 590 - 1e-6 || step > 650 + 1e-6) issues.push({ key: "going", level: "Warnung", message: `Schrittmaß 2s + a = ${Math.round(step)} mm außerhalb 590 … 650 mm` });
    if (s > 200 + 1e-6) issues.push({ key: "steps", level: "Warnung", message: `Steigung ${fmt(s)} mm über 200 mm` });
    if (a < 230 - 1e-6) issues.push({ key: "going", level: "Warnung", message: `Auftritt ${fmt(a)} mm unter 230 mm` });
    if (a < 260 - 1e-6 && u < 30 - 1e-6) issues.push({ key: "nosing", level: "Hinweis", message: "Auftritt unter 260 mm: Unterschneidung ≥ 30 mm vorsehen" });
    const tanA = s / a, alpha = Math.atan(tanA), cosA = Math.cos(alpha), sinA = Math.sin(alpha);
    const AN = p.anschluss === "platten";
    const FT = AN ? 15 : 0, KT = AN && !(p.support === "flach" || p.support === "upn") ? 8 : 0; // Fuß-/Kopfplatten an Boden und Decke, Konsolbleche unter aufgesattelten Stufen
    const isTop = (nR, z0) => Math.abs(z0 + nR * s - H) < 1e-6;
    const members = [], plates = [], chains = [], drills = [], norms = [];
    // Tragwerk: Querschnitt, Ausdehnung senkrecht zur Achse in der Laufebene (depth), Dicke quer (thick), Drehung je
    // Seite: hohe Seite senkrecht zum Lauf; offene Seite (U, UPN) nach außen, Steg an den Stufen; Winkel mit dem
    // Schenkel innen unter den Stufen; Mittelholm nur hochkant
    const side = p.support === "flach" || p.support === "upn";
    const sec = p.support === "flach" ? { kind: "flach", dims: { B: p.wangeH, t: p.wangeT }, geom: sectionGeometry("flach", { B: p.wangeH, t: p.wangeT }) } : side ? p.upn : p.holm;
    const axis = [cosA, 0, sinA], upL = [-sinA, 0, cosA];
    const rotFor = (out) => orientRot(sec, axis, upL, { tall: upL, open: out, legs: [-out[0] + upL[0], -out[1] + upL[1], -out[2] + upL[2]], stem: [sinA, 0, -cosA] });
    const sideOut = [[0, -1, 0], [0, 1, 0]]; // erste Wange/Holm bei kleinem y (rechts beim Hinaufgehen), zweite bei großem y
    const rots = p.support === "holm1" ? [orientRot(sec, axis, upL, { tall: upL, stem: [sinA, 0, -cosA] })] : sideOut.map(rotFor);
    const { high: depth, wide: thick } = rotExtent(sec, rots[0]);
    const wt = side ? thick : 0; // Wangen stehen außen neben der lichten Laufbreite
    // Achse: seitlich = durch die Stufenmitten; aufgesattelt = Oberkante an den hinteren Stufenunterkanten
    let c; // z = tanA · x + c (Lauf mit Antritt bei x = 0, z = 0)
    if (side) {
      const x1 = 0.5 * a - u / 2, z1 = s - tt / 2;
      c = z1 - tanA * x1;
      // passen die Stufen in die Wange?
      const corner = Math.max(...[[-u, s - tt], [-u, s], [a, s - tt], [a, s]].map(([x, z]) => Math.abs((z - (tanA * x + c)) * cosA)));
      if (corner > depth / 2 + 1e-6) throw fieldError(`Wange zu niedrig für die Stufen: mindestens ${Math.ceil(2 * corner)} mm`, p.support === "flach" ? "wangeH" : "upn");
    } else c = -tt - KT - depth / 2 / cosA; // aufgesattelt: Konsolblech (KT) zwischen Holm und Stufe
    if (p.support === "holm2" && !(B - 2 * p.holmInset > thick)) throw fieldError("Holme zu weit innen", "holmInset");
    const ys = side ? [-thick / 2, B + thick / 2] : p.support === "holm2" ? [p.holmInset, B - p.holmInset] : [B / 2];
    const sideNames = side ? ["Wange rechts", "Wange links"] : ys.length > 1 ? ["Holm rechts", "Holm links"] : ["Mittelholm"];

    // Stufenbefestigung wie Gitterrost-/Blechstufen nach DIN 24531: Seitenbleche 5 mm, Höhe Stufendicke + 30 mm,
    // vorne Bohrung, hinten Langloch Ø 14 (M12); Lochabstand nach Auftrittstiefe (240 → 120, 270 → 150, 305 → 180 mm)
    const A = a + u, fix = { on: side && p.stepFix === "din", t: 0 };
    if (fix.on) Object.assign(fix, { t: 5, h: tt + 30, d: 14, slot: 30, dz: 5, e: A <= 250 ? 120 : A <= 285 ? 150 : A <= 320 ? 180 : Math.round((A - 125) / 10) * 10 });
    if (fix.on && A - fix.e < 60) throw fieldError(`Auftritt ${Math.round(A)} mm zu klein für die Stufenbefestigung`, "going");
    // Ein Lauf mit nR Steigungen in eigener Lage (Antritt x = 0, Höhe z0); T dreht um Z und verschiebt.
    // Unten: auf dem Boden waagrecht geschnitten, vom Podest aus senkrecht an der Podestkante; oben senkrecht.
    const flights = [];
    const flight = (nR, z0, T, label, fromFloor, stepNo0) => {
      flights.push({ nR, z0, T, fromFloor });
      const xTop = (nR - 1) * a;
      const zAt = (x) => z0 + tanA * x + c;
      const ext = depth * 2;
      const x0 = fromFloor ? (0 - c) / tanA - ext : -ext, x1 = xTop + ext;
      // Anschluss an Boden und Decke: Holm auf einer Bodenplatte, Wange mit Fußwinkel innen (außen sitzen die
      // Befestigungsbleche der Geländerpfosten), Kopfplatte vor der Deckenstirn; Dübel/Anker M12 in Ø 14
      const toTop = isTop(nR, z0), zF = fromFloor && !side ? FT : 0, xE = toTop ? xTop - FT : xTop;
      const cuts = { start: [fromFloor ? { p: T.p([0, 0, z0 + zF]), n: [0, 0, -1] } : { p: T.p([0, 0, z0]), n: T.d([-1, 0, 0]) }], end: [{ p: T.p([xE, 0, z0]), n: T.d([1, 0, 0]) }] };
      ys.forEach((y, i) => members.push({ section: sec, a: T.p([x0, y, zAt(x0)]), b: T.p([x1, y, zAt(x1)]), name: sideNames[i] + label, up: T.d(upL), rot: rots[i], cuts }));
      // Kopfplatte bei Wangen nach außen (innen stößt die oberste Stufe an die Deckenstirn)
      const pw = thick + (side ? 80 : 100), yIn = (i) => (side ? (i === 0 ? -1 : 1) * 40 : 0), hole = (w, h) => [[-w / 2 + 25, -h / 2 + 25], [w / 2 - 25, -h / 2 + 25], [w / 2 - 25, h / 2 - 25], [-w / 2 + 25, h / 2 - 25]];
      if (AN && fromFloor && !side) {
        // Fußlänge: Schnitt des Holms mit z = zF, Platte 30 mm länger je Seite
        const xa = (zF - c - depth / 2 / cosA) / tanA, xb = (zF - c + depth / 2 / cosA) / tanA, L = xb - xa + 60;
        ys.forEach((y, i) => plates.push({ center: T.p([(xa + xb) / 2, y, z0]), xDir: T.d([1, 0, 0]), normal: [0, 0, 1], W: L, H: pw, t: FT, holes: hole(L, pw), d: 14, name: `${sideNames[i]}${label} Bodenplatte` }));
      } else if (AN && fromFloor) {
        // Fußwinkel 100 lang aus 10-mm-Blech, innen an die Wange geschweißt (außen liegt das Blech des ersten
        // Geländerpfostens): Bodenschenkel 100 mit 2 × Ø 14 für Dübel/Anker M12
        const xb = (0 - c + depth / 2 / cosA) / tanA, xm = xb - 50, ft = 10; // hinten bündig mit der Wangenunterkante
        ys.forEach((y, i) => {
          const sg = i === 0 ? 1 : -1, yf = y + sg * thick / 2, nm = `${sideNames[i]}${label} Fußwinkel`;
          plates.push({ center: T.p([xm, yf + sg * 50, z0]), xDir: T.d([1, 0, 0]), normal: [0, 0, 1], W: 100, H: 100, t: ft, holes: [[-25, sg * 15], [25, sg * 15]], d: 14, name: nm });
          plates.push({ center: T.p([xm, yf, z0 + ft + 40]), xDir: T.d([1, 0, 0]), normal: T.d([0, sg, 0]), W: 100, H: 80, t: ft, name: nm + " Steg" });
        });
      }
      if (AN && toTop) {
        // Kopfplatte senkrecht vor der Deckenstirn (x = xTop), Höhe = senkrechte Profilhöhe + 2 · 30
        // Holm: Oberkante bündig mit dem Holm (darüber liegt die oberste Stufe), Wange: 30 mm über und unter dem Profil
        const Hk = depth / cosA + (side ? 60 : 30), zc = zAt(xE) - (side ? 0 : 15);
        // Wange: Dübel nur im Überstand außen neben dem Profil (hinter dem Profil kommt man nicht an die Mutter)
        const kHoles = (i) => (side ? [[Math.sign(yIn(i)) * (pw / 2 - 40), -Hk / 2 + 25], [Math.sign(yIn(i)) * (pw / 2 - 40), Hk / 2 - 25]] : hole(pw, Hk));
        ys.forEach((y, i) => plates.push({ center: T.p([xE, y + yIn(i), zc]), xDir: T.d([0, 1, 0]), normal: T.d([1, 0, 0]), W: pw, H: Hk, t: FT, holes: kHoles(i), d: 14, name: `${sideNames[i]}${label} Kopfplatte` }));
      }
      for (let i = 1; i < nR; i++) {
        const xa = (i - 1) * a - u, xb = i * a, k = stepNo0 + i;
        plates.push({ center: T.p([(xa + xb) / 2, B / 2, z0 + i * s - tt]), xDir: T.d([0, 1, 0]), normal: [0, 0, 1], W: B - 2 * fix.t, H: xb - xa, t: tt, name: `Stufe ${k}`, tread: p.tread });
        if (!fix.on) continue;
        // Seitenbleche der Stufe mit Bohrung und Langloch, Wangen mit zwei Bohrungen Ø 14 (M12)
        const cx = (xa + xb) / 2, zTop = z0 + i * s, zc = zTop - fix.h / 2, zh = zc - fix.dz;
        [[0, [0, 1, 0], 1, "rechts"], [B, [0, -1, 0], -1, "links"]].forEach(([y, nrm, sy, nm]) => plates.push({ center: T.p([cx, y, zc]), xDir: T.d([1, 0, 0]), normal: T.d(nrm), W: xb - xa, H: fix.h, t: fix.t,
          holes: [[-fix.e / 2, sy * fix.dz]], slots: [[fix.e / 2, sy * fix.dz, fix.slot]], d: fix.d, name: `Stufe ${k} Seitenblech ${nm}` }));
        ys.forEach((y, j) => {
          const out = j === 0 ? -1 : 1;
          for (const x of [cx - fix.e / 2, cx + fix.e / 2]) {
            drills.push({ target: sideNames[j] + label, p: T.p([x, y - out * (thick / 2 + 1), zh]), dir: T.d([0, out, 0]), d: fix.d, len: thick + 2 });
          }
        });
      }
      // aufgesattelte Stufen: je Holm ein Konsolblech (KT) unter der Stufe mit Stegblech bis auf den Holm, 2 × M12
      if (AN && !side) for (let i = 1; i < nR; i++) {
        const xa = (i - 1) * a - u, xb = i * a, k = stepNo0 + i, zTop = z0 + i * s, zK = zTop - tt - KT;
        const kx0 = Math.max(xa, xb - 220), kx1 = xb, kw = thick + 60;
        const step = plates.find((x) => x.name === `Stufe ${k}`);
        ys.forEach((y, j) => {
          const nm = `${sideNames[j]}${label} Konsole ${k}`, holes = [[-kw / 2 + 15, 0], [kw / 2 - 15, 0]];
          plates.push({ center: T.p([(kx0 + kx1) / 2, y, zK]), xDir: T.d([0, 1, 0]), normal: [0, 0, 1], W: kw, H: kx1 - kx0, t: KT, holes, d: 14, name: nm });
          // Stegblech (Dreieck) in der Holmachse zwischen Holmoberkante und Konsolblech
          // Stegblech erst über der Bodenplatte (am Antritt liegt der Holm dort fast am Boden)
          const zH = (x) => z0 + tanA * x + c + depth / 2 / cosA, xs0 = fromFloor ? Math.min(kx1, Math.max(kx0, (FT + 1 - c - depth / 2 / cosA) / tanA + 30)) : kx0;
          if (zK - zH(xs0) > 1) plates.push({ center: T.p([0, y - 5, 0]), xDir: T.d([1, 0, 0]), normal: T.d([0, 1, 0]), W: kx1 - kx0, H: zK - zH(xs0), t: 10,
            poly: [[xs0, -zK], [kx1, -zK], [xs0, -zH(xs0)]], name: `${nm} Steg` }); // Plattenebene: x = Lauf, y = −z
          for (const [hx] of holes) {
            const yh = y + hx;
            norms.push({ bolt: true, size: "M12", clamp: KT + tt, pos: T.p([(kx0 + kx1) / 2, yh, zK]), dir: [0, 0, 1], galv: true });
            if (step) (step.holes = step.holes || []).push([yh - B / 2, -((kx0 + kx1) / 2 - (xa + xb) / 2), 14]);
          }
        });
        if (step) step.d = 14;
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
      if (n1 < 2 || n2 < 2) throw fieldError("Jeder Lauf braucht mindestens 2 Steigungen – Steigungen bis Podest prüfen", "n1");
      zP = n1 * s;
      const left = p.turn !== "rechts";
      x1 = flight(n1, 0, rotZ(0, [0, 0, 0]), " Lauf 1", true, 0);
      const g = p.gap || 0;
      const D0 = p.form === "U" ? (p.podestD > 0 ? p.podestD : B) : B;
      if (p.form === "U" && D0 < B - 1e-6) issues.push({ key: "podestD", level: "Warnung", message: `Podesttiefe ${fmt(D0)} mm kleiner als die Laufbreite` });
      // Podestfläche [x1, x1 + D] × [yLo, yHi] und Lage des zweiten Laufs
      D = D0;
      let yLo = 0, yHi = B, T2;
      if (p.form === "L") T2 = left ? rotZ(90, [x1 + B, B, 0]) : rotZ(-90, [x1, 0, 0]);
      else if (left) { yHi = 2 * B + g; T2 = rotZ(180, [x1, 2 * B + g, 0]); }
      else { yLo = -(B + g); T2 = rotZ(180, [x1, -g, 0]); }
      if (p.form === "U" && side && g < 2 * wt + 1) issues.push({ key: "gap", level: "Warnung", message: `Treppenauge ${Math.round(g)} mm: die inneren Wangen beider Läufe überschneiden sich (mindestens ${Math.ceil(2 * wt + 1)} mm)` });
      const x2 = flight(n2, zP, T2, " Lauf 2", false, n1);
      if (p.form === "L" && side) {
        // innere Ecke: die Wange von Lauf 1 läuft in die von Lauf 2 – dort ausgeklinkt (stumpf angeschweißt)
        const nm = left ? "Wange links" : "Wange rechts", w1 = members.find((m) => m.name === nm + " Lauf 1"), w2 = members.find((m) => m.name === nm + " Lauf 2");
        if (w1 && w2) w1.copes = [...(w1.copes || []), { section: w2.section, a: w2.a, b: w2.b, up: w2.up, rot: w2.rot, cuts: w2.cuts }];
      }
      // Podestbelag, Rahmen darunter (bündig mit dem Belagrand), Stützen
      const PW = D, PH = yHi - yLo, cx = x1 + D / 2, cy = (yLo + yHi) / 2;
      geo.yLo = yLo; geo.yHi = yHi; geo.n1 = n1; geo.x2 = x2;
      plates.push({ center: [cx, cy, zP - tt], xDir: [1, 0, 0], normal: [0, 0, 1], W: PW, H: PH, t: tt, name: "Podest", tread: p.tread });
      // Podestrahmen hochkant; offene Seite nach außen, Winkel mit dem Schenkel oben innen (Auflager für den Belag)
      const fr = p.podestRahmen, frRot = orientRot(fr, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, -1, 0], legs: [0, Math.SQRT1_2, -Math.SQRT1_2], stem: [0, 0, -1] });
      const { high: fh, wide: fw } = rotExtent(fr, frRot), zf = zP - tt - fh / 2;
      const rx0 = x1 + fw / 2, rx1 = x1 + D - fw / 2, ry0 = yLo + fw / 2, ry1 = yHi - fw / 2;
      chains.push({ section: { kind: fr.kind, dims: fr.dims }, points: [[rx0, ry0, zf], [rx1, ry0, zf], [rx1, ry1, zf], [rx0, ry1, zf], [rx0, ry0, zf]], name: "Podestrahmen", up: [0, 0, 1], rot: frRot });
      if (p.stuetzen !== "keine") {
        const st = p.stuetze, sw = Math.max(st.geom.width, st.geom.height) / 2;
        const zTop = zP - tt - fh;
        if (!(zTop > 100)) throw fieldError("Podest zu niedrig für Stützen", "height");
        const corners = [[x1 + D - sw, yLo + sw], [x1 + D - sw, yHi - sw]];
        if (p.stuetzen === "alle") corners.push([x1 + sw, yLo + sw], [x1 + sw, yHi - sw]);
        // Stützen auf Fußplatten (4 × Ø 14 für Dübel/Anker M12), oben unter den Podestrahmen geschweißt
        const bs = 2 * sw + 100, ft = AN ? FT : 0;
        corners.forEach(([x, y], i) => {
          members.push({ section: st, a: [x, y, FT], b: [x, y, zTop], name: `Podeststütze ${i + 1}`, up: [1, 0, 0] });
          if (AN) plates.push({ center: [x, y, 0], xDir: [1, 0, 0], normal: [0, 0, 1], W: bs, H: bs, t: FT, holes: [[-bs / 2 + 25, -bs / 2 + 25], [bs / 2 - 25, -bs / 2 + 25], [bs / 2 - 25, bs / 2 - 25], [-bs / 2 + 25, bs / 2 - 25]], d: 14, name: `Podeststütze ${i + 1} Bodenplatte` });
        });
      }
      info = `${n} Steigungen à ${fmt(s)} mm (${n1} + ${n2}), Auftritt ${fmt(a)} mm, 2s + a = ${Math.round(step)} mm, Neigung ${fmt((alpha * 180) / Math.PI)}°, Podest auf ${Math.round(zP)} mm (${fmt(PW)} × ${fmt(PH)} mm), Läufe ${Math.round(x1)} / ${Math.round(x2)} mm`;
    }
    if (fix.on) info += `, Stufen verschraubt nach DIN 24531 (Seitenbleche, Bohrung + Langloch Ø ${fix.d}, Lochabstand ${fix.e} mm)`;
    if (gel(p)) {
      // Wange aus U/UPN ist außen offen: seitlich gibt es keine Anschlussfläche, die Pfosten kommen oben auf die Wange
      if (side && (sec.kind === "upn" || sec.kind === "u") && gelMount(p) === "seitlich") {
        p = { ...p, gelMount: "oben" };
        issues.push({ key: "gelMount", level: "Hinweis", message: "Wange aus U-Profil ist außen offen – Pfosten oben auf der Wange mit Fußplatte befestigt" });
      }
      // Pfostenachse: neben der Wange (bisher), oben mittig auf der Wange bzw. bei Holmen auf der Stufe
      const mk = gelMount(p);
      const off = !mk ? (side ? thick : 0) + p.gelPost.geom.width / 2 : mk === "seitlich" ? (side ? thick : 0) + sideOffset(mountConfig(p, gk, "seitlich"), p.gelPost) : side ? thick / 2 : -(Math.max(p.gelPost.geom.width, p.gelOW) / 2 + 10);
      const r = railing(p, { flights, s, a, u, B, x1, D, zP, tanA, off, rotZ, supports: { members, chains, plates, drills } });
      chains.push(...r.chains);
      members.push(...r.members);
      plates.push(...r.plates);
      drills.push(...r.drills);
      issues.push(...r.issues);
      info += `, Geländer: ${r.info}`;
    }
    Object.assign(geo, { x1: podest(p) ? x1 : (n - 1) * a, D, zP });
    if (AN && !side) info += `, Stufen auf Konsolblechen verschraubt (M12)`;
    if (AN) info += side ? `, Fußwinkel am Boden, Kopfplatten ${FT} mm an der Decke` : `, Boden-/Kopfplatten ${FT} mm mit 4 × Ø 14 an Boden und Decke`;
    return { chains, members, plates, drills, norms, info, issues, geo };
  },

  parts: { support: /Wange|Holm/, stuetze: /Stütze/, podestRahmen: /Podest/, podestD: /Podest/, gel: /^Geländer/, gelPodest: /^Geländer/ },
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
function railing(p, { flights, s, a, u, B, x1, D, zP, tanA, off, rotZ, supports }) {
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
    if (B - u - a < -off + post) throw fieldError("Podest zu klein für das Geländer – Laufbreite prüfen", "width");
    outer = [[start(f1, yo), end(f1, yo), [x1 + B + off, -off, zP], start(f2, yo), end(f2, yo), ...aus(f2, yo)]];
    inner = [[start(f1, yi), at(f1, yi, Math.min((f1.nR - 1) * a - u, x1 - off - post))], [at(f2, yi, Math.max(-u, off + post)), end(f2, yi), ...aus(f2, yi)]];
  } else {
    const g = p.gap || 0, X = x1 + u + a;
    if (X > x1 + D + off - post) throw fieldError("Podest zu schmal für das Geländer – Podesttiefe prüfen", "podestD");
    outer = [[start(f1, yo), end(f1, yo), [x1 + D + off, -off, zP], [x1 + D + off, 2 * B + g + off, zP], start(f2, yo), end(f2, yo), ...aus(f2, yo)]];
    // innen über das Treppenauge: zu schmal für zwei Geländer → eins in der Mitte
    const wi = g >= 2 * off + post ? off : g / 2;
    if (wi < off) issues.push({ key: "gap", level: "Hinweis", message: `Treppenauge ${Math.round(g)} mm: inneres Geländer mittig im Auge` });
    const y1 = B + wi, y2 = B + wi; // lokal; Lauf 2 liegt gedreht, global y = B + g − wi
    inner = [[start(f1, y1), end(f1, y1), [X, B + wi, zP], start(f2, y2), end(f2, y2), ...aus(f2, y2)]];
  }
  const mirror = (path) => (left ? path : path.map((q) => [q[0], B - q[1], q[2]]));
  // links/rechts beim Hinaufgehen: in der Lage »nach links« ist rechts außen
  const wantRight = p.gel === "beide" || p.gel === "rechts", wantLeft = p.gel === "beide" || p.gel === "links";
  const sides = [];
  if (left ? wantRight : wantLeft) sides.push([left ? "rechts" : "links", outer]);
  if (left ? wantLeft : wantRight) sides.push([left ? "links" : "rechts", inner]);
  const o = { H: p.gelH, post: p.gelPost, postMax: p.gelPostMax, postDown: p.gelDown, rail: p.gelRail, fill: p.gelFill, bar: p.gelBar, bars: p.gelBars, gap: p.gelGap, belt: p.gelBelt, bottomZ: 100, holder: p.gelHolder !== "keine", holderGap: p.gelHolderGap, holderD: p.gelHolderD,
    through: gelThrough(p), allow: p.gelAllow || 0, beltMax: p.gelBeltMax, stab: p.gelStab, keys: { bar: "gelBar", belt: "gelBelt", stab: "gelStab", beltMax: "gelBeltMax" } };
  // Pfosten im Stufenrhythmus: Zwischenpfosten der Läufe genau mittig zwischen zwei Stufen (Lücke zwischen den
  // Bohrgruppen der Stufenbefestigung), alle im gleichen Abstand von n Stufen; Endfelder höchstens so lang wie erlaubt
  const rhythm = p.gelRhythm && (p.support === "flach" || p.support === "upn");
  if (rhythm) {
    // Stufenmitten mit Laufrichtung (nur Stufen des Laufs unter diesem Abschnitt zählen)
    const centres = [f1, f2].filter(Boolean).flatMap((f) => {
      const [p0, p1] = mirror([f.T.p([0, 0, 0]), f.T.p([1, 0, 0])]), d = [p1[0] - p0[0], p1[1] - p0[1]];
      return Array.from({ length: f.nR - 1 }, (_, i) => ({ P: mirror([f.T.p([i * a + a / 2 - u / 2, B / 2, 0])])[0], d }));
    });
    o.stations = (sg) => {
      if (Math.abs(sg.slope) < 0.05) return null;
      const perp = (P) => Math.abs((P[0] - sg.A[0]) * sg.d[1] - (P[1] - sg.A[1]) * sg.d[0]);
      const gaps = centres.filter(({ P, d }) => d[0] * sg.d[0] + d[1] * sg.d[1] > 0.9 && perp(P) < B / 2 + 500).map(({ P }) => (P[0] - sg.A[0]) * sg.d[0] + (P[1] - sg.A[1]) * sg.d[1] + a / 2)
        .filter((t) => t > a / 2 && t < sg.L - a / 2).sort((x, y) => x - y);
      const maxF = o.postMax / Math.hypot(1, sg.slope);
      if (!gaps.length) return sg.L > maxF ? null : [];
      for (let m = Math.floor(maxF / a + 1e-9); m >= 1; m--) {
        let best = null;
        for (let j0 = 0; j0 < Math.min(m, gaps.length); j0++) {
          const pick = gaps.filter((_, j) => j >= j0 && (j - j0) % m === 0), first = pick[0], lastG = pick[pick.length - 1];
          if (first > maxF + 1e-6 || sg.L - lastG > maxF + 1e-6) continue;
          const score = pick.length * 1e6 + Math.abs(first - (sg.L - lastG));
          if (!best || score < best.score) best = { pick, score };
        }
        if (best) return best.pick;
      }
      return sg.L > maxF ? null : [];
    };
  }
  // Pfostenbefestigung oben: Anschlussbauteil unter dem Pfosten = Wange, Holm bzw. Podestrahmen (nächste Achse) oder Stufe
  const mounted = [];
  if (gelMount(p)) {
    const kind = gelMount(p), cfg = mountConfig(p, gk, kind), cfgTop = mountConfig(p, gk, "oben"), cfgSide = mountConfig(p, gk, "seitlich");
    const segs = supports.chains.filter((c) => /^Podestrahmen/.test(c.name)).flatMap((c) => c.points.slice(1).map((b, k) => ({ name: c.name, a: c.points[k], b, section: c.section.geom ? c.section : { ...c.section, geom: p.podestRahmen.geom }, up: c.up, rot: c.rot })));
    const beams = supports.members.filter((m) => /^Wange|^Holm|^Mittelholm/.test(m.name));
    const onBeam = p.support === "flach" || p.support === "upn";
    // Blech an der Wange: Höhe so wählen, dass es keine Stufenbohrung verdeckt, die Muttern innen frei von Seitenblechen,
    // Stufen und Fußwinkel sind und es ganz auf der Wange liegt (nächste passende Lage zur eingestellten Blechmitte)
    const keep = 15; // Platz um Schraubenkopf, Mutter und Scheibe M12
    const blocked = (r, face) => {
      const pl = r.plate, n = norm3(pl.normal), x = norm3(pl.xDir), y = cross3(n, x);
      const loc = (P) => { const q = sub3(P, pl.center); return [dot3(q, x), dot3(q, y), dot3(q, n)]; };
      // ganz auf der Wange (Ober-/Unterkante, Endschnitte, Boden)
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const P = add3(add3(pl.center, mul3(x, (cx * pl.W) / 2)), mul3(y, (cy * pl.H) / 2)), c = faceCoords(face, P)[1];
        if (face.cPhys && (c < face.cPhys[0] - 0.5 || c > face.cPhys[1] + 0.5)) return "steht über";
        if ((face.ends || []).some((e) => dot3(sub3(P, e.p), norm3(e.n)) > 0.5)) return "steht über";
      }
      const steps = (supports.drills || []).filter((d) => d.target === face.target);
      for (const d of steps) {
        const [hx, hy] = loc(d.p), gx = Math.max(0, Math.abs(hx) - pl.W / 2), gy = Math.max(0, Math.abs(hy) - pl.H / 2);
        if (Math.hypot(gx, gy) < d.d / 2 + keep - 7) return "verdeckt Stufenbohrung";
      }
      const wall = face.wall || 20, obst = supports.plates.filter((q) => q.name !== pl.name);
      for (const H of r.holes) {
        if (steps.some((d) => Math.hypot(...loc(d.p).slice(0, 2).map((v, k) => v - loc(H)[k])) < 2 * keep + 2)) return "zu nah an Stufenbohrung";
        for (let k = 0; k <= 14; k++) {
          const P = add3(H, mul3(n, pl.t + 30 - ((wall + 60 + pl.t) * k) / 14));
          for (const q of obst) {
            const qn = norm3(q.normal), qx = norm3(q.xDir), qy = cross3(qn, qx), v = sub3(P, q.center);
            const g = [Math.max(0, Math.abs(dot3(v, qx)) - q.W / 2), Math.max(0, Math.abs(dot3(v, qy)) - q.H / 2), Math.max(0, -dot3(v, qn), dot3(v, qn) - q.t)];
            if (Math.hypot(...g) < keep - 3) return `Schraube trifft ${q.name}`;
          }
        }
      }
      return null;
    };
    // Podestrahmen (niedrig, ohne Stufenbohrungen): passt die Lasche nicht, das breite Blech 160 × 160 (dort 2 Bohrungen
    // in einer Reihe neben dem Pfosten)
    const wide = { ...cfgSide, sW: 160, sH: 160, holes: "4", sDown: 0, e: 25 };
    const placeSide = (ctx, face) => {
      const at = (dz, cfg = cfgSide) => sideMount({ ...cfg, sZ: cfg.sZ + dz }, { ...ctx, post: o.post, face, plateName: `${ctx.name} Befestigungsblech` });
      const r0 = at(0);
      if (r0.ok && !blocked(r0, face)) return r0;
      for (let dz = 5; dz <= 250; dz += 5) for (const z of [dz, -dz]) {
        let r;
        try { r = at(z); } catch { continue; }
        if (r.ok && !blocked(r, face)) return r;
      }
      if (!/^Wange/.test(face.target || "")) return at(0, wide);
      r0.issues.push({ key: gk("sH"), level: "Warnung", message: `${ctx.name}: Befestigungsblech ${blocked(r0, face)} – keine freie Lage an der Wange, Blech kleiner wählen` });
      return r0;
    };
    // Befestigung eines Pfostens; record = false: nur rechnen (Probe für die Endpfosten), nichts eintragen
    const mountAt = ({ name, top, base, along }, record = true) => {
      const fail = (message) => { if (record) issues.push({ key: "gelMount", level: "Fehler", message: `${name}: ${message} – Pfosten ohne Befestigung` }); return null; };
      // oben: Wange, Holm bzw. Podestrahmen unter dem Pfosten, sonst Stufe/Podest, am Antritt bzw. Auslauf Boden/Decke
      const onTop = () => {
        let f = onBeam ? findMemberFace([...beams, ...segs], base, [0, 0, 1], 400) : null;
        if (f?.cPhys) { const c = faceCoords(f, base)[1]; if (c < f.cPhys[0] - 1 || c > f.cPhys[1] + 1) f = null; } // Pfosten nicht über dem Profil (z. B. mitten auf dem Podest)
        if (!f) f = findPlateFace(supports.plates.filter((x) => /^Stufe \d+$|^Podest$/.test(x.name)), top);
        if (!f && Math.abs(base[2]) < 1) f = planeFace([0, 0, 0], [0, 0, 1], along, "Boden");
        if (!f && Math.abs(base[2] - p.height) < 1) f = planeFace([0, 0, p.height], [0, 0, 1], along, "obere Decke");
        return f ? { face: f, r: topMount(cfgTop, { name, post: o.post, top, along, face: f, plateName: `${name} Fußplatte` }) } : null;
      };
      // einzelne Pfosten abweichend (Feld »Einzelne Pfosten abweichend«): aus = wie ohne Befestigung
      const ov = overrideFor(cfg.per, name), kindP = ov || kind;
      if (ov === "aus") return null;
      let face = null, r = null;
      // Pfosten über der Podestfläche (z. B. am Treppenauge): oben auf dem Podest, seitlich gibt es dort kein Bauteil
      const podestPl = supports.plates.find((x) => x.name === "Podest");
      const overPodest = podestPl && Math.abs(base[2] - (podestPl.center[2] + podestPl.t)) < 1 && Math.abs(base[0] - podestPl.center[0]) < podestPl.W / 2 - o.post.geom.width && Math.abs(base[1] - podestPl.center[1]) < podestPl.H / 2 - o.post.geom.width;
      if (kindP === "seitlich" && overPodest) {
        const t = onTop();
        if (!t) return fail("kein Podest unter dem Pfosten");
        ({ face, r } = t);
        r.fallback = "oben";
      } else if (kindP === "seitlich") {
        let why = null;
        try { face = findSideFace(onBeam ? [...beams, ...segs] : segs, base, along, 600, 100 + cfg.gap); } catch (e) { why = e.message; }
        if (face) r = rhythm && onBeam ? placeSide({ name, top, base, along }, face) : sideMount(cfgSide, { name, post: o.post, top, base, along, face, plateName: `${name} Befestigungsblech` });
        else {
          // kein Bauteil daneben (Antritt, Auslauf, Pfosten über dem Podest): oben mit Fußplatte, wenn die passt
          const t = onTop(), floor = Math.abs(base[2]) < 1 || Math.abs(base[2] - p.height) < 1;
          if (!t || !(t.r.ok || floor)) return fail(why ? `${why} oder »oben mit Fußplatte« nehmen` : `kein Bauteil neben dem Pfosten (Wange oder Podestrahmen)${onBeam ? "" : " – Holmtreppe: Befestigung oben auf der Stufe wählen"}`);
          ({ face, r } = t);
          r.fallback = "oben"; // in der Info gezählt
        }
      } else {
        const t = onTop();
        // nichts darunter bzw. Platte passt nicht (Podest neben der Wangenflucht): seitlich am Bauteil daneben, wenn das passt
        if (!t || !t.r.ok) {
          try {
            const f = findSideFace(onBeam ? [...beams, ...segs] : segs, base, along, 600);
            const rs = f ? sideMount(cfgSide, { name, post: o.post, top, base, along, face: f, plateName: `${name} Befestigungsblech` }) : null;
            if (rs?.ok) { face = f; r = rs; r.fallback = "seitlich"; }
          } catch { /* keine passende Seitenfläche: bleibt bei oben */ }
        }
        if (!r && !t) return fail("kein Anschlussbauteil unter oder neben dem Pfosten (Wange, Podestrahmen oder Stufe)");
        if (!r) ({ face, r } = t);
      }
      if (!record) return r;
      applyTargetHoles(supports.plates, face, r.targetHoles);
      issues.push(...r.issues);
      mounted.push(r);
      return r;
    };
    o.mount = (ctx) => mountAt(ctx);
    // Endpfosten so weit zurück, dass Blech bzw. Fußplatte mittig zum Pfosten ganz auf dem Bauteil liegt
    // Endpfosten vor einer Kopfplatte: so weit zurück, dass die Dübel der Platte zugänglich bleiben (50 mm frei)
    o.mountFit = (ctx) => {
      let dt = fit(ctx);
      if (!rhythm || !ctx.inward) return dt;
      // halbe Länge entlang des Laufs: Pfosten bzw. Fußplatte
      const r0 = mountAt({ ...ctx, top: add3(ctx.top, mul3(ctx.along, dt)), base: add3(ctx.base, mul3(ctx.along, dt)) }, false);
      let half = o.post.geom.width / 2;
      if (r0?.plate && r0.plate.mount !== "seitlich") {
        const pl = r0.plate, x = norm3(pl.xDir), y = cross3(norm3(pl.normal), x);
        half = Math.max(half, Math.abs(dot3(x, ctx.along)) * pl.W / 2 + Math.abs(dot3(y, ctx.along)) * pl.H / 2);
      }
      for (const q of supports.plates.filter((x) => /Kopfplatte$/.test(x.name))) {
        const n = norm3(q.normal), P = add3(ctx.base, mul3(ctx.along, dt)), v = sub3(P, q.center), lat = Math.abs(dot3(v, norm3(q.xDir)));
        const dist = Math.abs(dot3(v, n)) - q.t / 2 - half;
        if (lat < q.W / 2 + half && Math.abs(dot3(v, cross3(n, norm3(q.xDir)))) < q.H / 2 + o.H && dist < 50) dt += ctx.inward * (50 - dist);
      }
      // dort keine freie Lage für das Blech: weiter in den Lauf hinein
      const sh = (P, t) => [P[0] + ctx.along[0] * t, P[1] + ctx.along[1] * t, P[2] + ctx.slope * t];
      const free = (t) => !mountAt({ ...ctx, top: sh(ctx.top, t), base: sh(ctx.base, t) }, false)?.issues?.some((q) => /keine freie Lage/.test(q.message));
      for (let k = 0; k < a / 5 && !free(dt); k++) dt += 5 * ctx.inward;
      return dt;
    };
    const fit = (ctx) => {
      const r = mountAt(ctx, false);
      // Blech findet an der Wange keine freie Lage (Endpfosten an der ersten Stufe): Pfosten in den Lauf hinein rücken
      if (rhythm && ctx.inward && r?.issues?.some((q) => /keine freie Lage/.test(q.message))) {
        for (let dt = 5; dt <= a / 2; dt += 5) {
          const sh = (P) => [P[0] + ctx.along[0] * dt * ctx.inward, P[1] + ctx.along[1] * dt * ctx.inward, P[2] + ctx.slope * dt * ctx.inward];
          const r2 = mountAt({ ...ctx, top: sh(ctx.top), base: sh(ctx.base) }, false);
          if (r2 && !r2.issues.some((q) => /keine freie Lage/.test(q.message))) return dt * ctx.inward;
        }
      }
      if (r?.pull) return dot3(r.pull, ctx.along); // Pfosten vor der Stirnseite: auf Anlage am Blech rücken
      // Fußplatte: so weit, dass sie mittig zum Pfosten ganz auf dem Bauteil liegt (Pfosten an der Stufenkante)
      const d = (r?.shifted || 0) + (r?.need || 0);
      return d ? dot3(mul3(r.frame.x, d), ctx.along) : 0;
    };
  }
  if (!(o.H > 300)) throw fieldError("Geländerhöhe zu klein", "gelH");
  if (!(o.postMax > post)) throw fieldError("Pfostenabstand zu klein", "gelPostMax");
  const chains = [], members = [], plates = [], drills = [];
  let posts = 0, bars = 0, gapMax = 0, pieces = 0;
  for (const [name, paths] of sides) {
    paths.forEach((path, i) => {
      const r = railAlong(mirror(path), o, `Geländer ${name}${paths.length > 1 ? " " + (i + 1) : ""}`);
      chains.push(...r.chains);
      members.push(...r.members);
      plates.push(...r.plates);
      drills.push(...r.drills);
      posts += r.posts; bars += r.bars; gapMax = Math.max(gapMax, r.gapMax); pieces += r.pieces || 0;
    });
  }
  issues.push(...mountCollisions(mounted, { members: [...supports.members, ...members], plates: [...supports.plates, ...plates] }, "gelMount"));
  // Geländernorm nach Nutzung; Absturzhöhe höchstens die Geschosshöhe
  issues.push(...railingIssues({ use: p.gelUse, fall: p.height, height: o.H, fill: p.gelFill, gap: gapMax, bottom: 0, open: o.H - p.gelRail.geom.height, rail: p.gelRail },
    { height: "gelH", fill: "gelFill", gap: p.gelFill === "quer" ? "gelBars" : "gelGap", rail: "gelRail", use: "gelUse" }));
  const what = p.gelFill === "quer" ? `${bars} Knieleisten` : p.gelFill === "staketen" ? `${bars} Stäbe` : "nur Handlauf";
  return { chains, members, plates, drills, issues, info: `${sides.map((x) => x[0]).join(" und ")}, ${posts} Pfosten, ${what}` + (o.holder ? `, Handlaufhalter mit Bohrung Ø ${fmt(o.holderD + 0.1)}` : "") + (o.through && pieces ? `, ${p.gelFill === "quer" ? "Knieleisten" : "Untergurt"} durch die Pfosten (${pieces} Stück, Aufmaß ${fmt(o.allow)} mm)` : "") + (mounted.length ? `; Befestigung: ${mountInfo(mounted, gelMount(p) === "seitlich" ? "Befestigungsbleche" : "Fußplatten")}` : "") };
}

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => mul3(a, 1 / (Math.hypot(...a) || 1));
