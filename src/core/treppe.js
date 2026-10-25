// Treppen-Generator geradläufig (MegaCAD-Abgleich M13): Steigung aus Geschosshöhe, Auftritt aus der Schrittmaßregel,
// Wangen (Flachstahl oder UPN) mit seitlich eingesetzten Stufen oder ein/zwei Holme mit aufgesattelten Stufen.
// Stufen als Platten (Gitterrost, Blech, Holz – Dicke einstellbar). Reine Rechnung; Bauplan siehe generator.js.
//
// Lage: Antritt bei x = 0 auf dem Boden (z = 0), Lauf steigt in +X, Laufbreite in +Y (lichte Breite zwischen den
// Wangen bzw. Stufenlänge). n Steigungen, n − 1 Stufen; die letzte Steigung führt auf die obere Decke bei
// x = (n − 1) · a. Wangen/Holme sind unten waagrecht (Boden) und oben senkrecht (Deckenstirn) geschnitten.
// Prüfung nach DIN 18065: 2s + a = 590 … 650 mm, Steigung ≤ 200 mm, Auftritt ≥ 230 mm (Hinweise, keine Statik).

import { sectionGeometry } from "./sections.js";

export const TREPPE = {
  label: "Treppe",
  schema: [
    { key: "height", label: "Geschosshöhe (Steigungshöhe gesamt)", type: "num", default: "2800", group: "Lauf" },
    { key: "steps", label: "Steigungen (0 = automatisch)", type: "num", unit: "Stk", default: "0", group: "Lauf" },
    { key: "going", label: "Auftritt a (0 = aus 2s + a = 630)", type: "num", default: "0", group: "Lauf" },
    { key: "nosing", label: "Unterschneidung", type: "num", default: "20", group: "Lauf" },
    { key: "width", label: "Laufbreite (lichte)", type: "num", default: "1000", group: "Lauf" },
    { key: "support", label: "Tragwerk", type: "select", options: [["flach", "Wangen Flachstahl"], ["upn", "Wangen UPN"], ["holm2", "Zwei Holme"], ["holm1", "Mittelholm"]], default: "flach", group: "Tragwerk" },
    { key: "wangeH", label: "Wangenhöhe", type: "num", default: "250", group: "Tragwerk", when: (p) => p.support === "flach" },
    { key: "wangeT", label: "Wangendicke", type: "num", default: "12", group: "Tragwerk", when: (p) => p.support === "flach" },
    { key: "upn", label: "UPN", type: "section", kinds: ["upn"], default: { kind: "upn", size: "200" }, group: "Tragwerk", when: (p) => p.support === "upn" },
    { key: "holm", label: "Holmprofil", type: "section", kinds: ["rechteck", "vierkant"], default: { kind: "rechteck", size: "160x80x5" }, group: "Tragwerk", when: (p) => p.support === "holm2" || p.support === "holm1" },
    { key: "holmInset", label: "Holm vom Stufenrand", type: "num", default: "150", group: "Tragwerk", when: (p) => p.support === "holm2" },
    { key: "tread", label: "Stufen", type: "select", options: [["gitterrost", "Gitterrost"], ["blech", "Blech"], ["holz", "Holz"]], default: "gitterrost", group: "Stufen" },
    { key: "treadT", label: "Stufendicke", type: "num", default: "30", group: "Stufen" },
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
    const xTop = (n - 1) * a; // Deckenstirn oben
    const members = [], plates = [], chains = [];
    const dir = [cosA, 0, sinA];
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
    let c; // z = tanA · x + c
    if (side) {
      const x1 = 0.5 * a - u / 2, z1 = s - tt / 2;
      c = z1 - tanA * x1;
      // passen die Stufen in die Wange?
      const corner = Math.max(...[[-u, s - tt], [-u, s], [a, s - tt], [a, s]].map(([x, z]) => Math.abs((z - (tanA * x + c)) * cosA)));
      if (corner > depth / 2 + 1e-6) throw new Error(`Wange zu niedrig für die Stufen: mindestens ${Math.ceil(2 * corner)} mm`);
    } else c = -tt - depth / 2 / cosA;
    const zAt = (x) => tanA * x + c;
    const ext = depth * 2;
    const x0 = (0 - c) / tanA - ext, x1 = xTop + ext; // über Boden bzw. Deckenstirn hinaus, dann schneiden
    const cuts = { start: [{ p: [0, 0, 0], n: [0, 0, -1] }], end: [{ p: [xTop, 0, 0], n: [1, 0, 0] }] };
    const ys = side ? [-thick / 2, B + thick / 2] : p.support === "holm2" ? [p.holmInset, B - p.holmInset] : [B / 2];
    if (p.support === "holm2" && !(B - 2 * p.holmInset > thick)) throw new Error("Holme zu weit innen");
    const names = side ? ["Wange links", "Wange rechts"] : ys.length > 1 ? ["Holm links", "Holm rechts"] : ["Mittelholm"];
    ys.forEach((y, i) => members.push({ section: sec, a: [x0, y, zAt(x0)], b: [x1, y, zAt(x1)], name: names[i], up: [-sinA, 0, cosA], rot: side && i === 1 && p.support === "upn" ? 180 : rot, cuts }));
    // Stufen
    const W = side ? B : B;
    for (let i = 1; i < n; i++) {
      const xa = (i - 1) * a - u, xb = i * a;
      plates.push({ center: [(xa + xb) / 2, B / 2, i * s - tt], xDir: [0, 1, 0], normal: [0, 0, 1], W, H: xb - xa, t: tt, name: `Stufe ${i}`, tread: p.tread });
    }
    const lauf = xTop;
    const info = `${n} Steigungen à ${fmt(s)} mm, Auftritt ${fmt(a)} mm, 2s + a = ${Math.round(step)} mm, Neigung ${fmt((alpha * 180) / Math.PI)}°, Lauflänge ${Math.round(lauf)} mm`;
    return { chains, members, plates, info, issues };
  },
};

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
