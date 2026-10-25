// Balkon-Generator (MegaCAD-Abgleich M16): Rahmen aus Profilen mit Querträgern, Belag, Stützen mit Fußplatten,
// Wandanschlussplatten und Geländer an den drei freien Seiten (Bauplan des Geländer-Generators, hierher gedreht).
// Reine Rechnung; Bauplan-Format siehe generator.js. Keine Statik – Profile und Anker sind nachzuweisen.
//
// Lage: Hauswand in der XZ-Ebene (y = 0), Balkon ragt in +Y, Breite entlang +X ab x = 0, Gelände z = 0,
// Oberkante Belag auf »Höhe«.

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { normSchema } from "./gelaendernorm.js";
import { catalogToDims, sectionGeometry } from "./sections.js";
import { splitList } from "./expr.js";
import { GELAENDER } from "./gelaender.js";
import { platePlan } from "./anschluss.js";

const sec = (v) => {
  const dims = Object.fromEntries(Object.entries(catalogToDims(v.kind, v.size)).map(([k, x]) => [k, Number(x)]));
  return { kind: v.kind, dims, geom: sectionGeometry(v.kind, dims), size: v.size };
};

export const BALKON = {
  label: "Balkon",
  schema: [
    { key: "width", label: "Breite (an der Wand)", type: "num", default: "3000", group: "Balkon" },
    { key: "depth", label: "Tiefe (Auskragung)", type: "num", default: "1500", group: "Balkon" },
    { key: "height", label: "Höhe OK Belag über Gelände", type: "num", default: "2800", group: "Balkon" },
    { key: "frame", label: "Rahmenprofil", type: "section", default: { kind: "rechteck", size: "140x80x5" }, group: "Tragwerk" },
    { key: "joist", label: "Querträger", type: "section", default: { kind: "rechteck", size: "80x40x3" }, group: "Tragwerk" },
    { key: "joistMax", label: "Querträgerabstand max.", type: "num", default: "600", group: "Tragwerk" },
    { key: "support", label: "Stützen", type: "select", options: [["2", "2 vorne"], ["auto", "vorne nach Abstand"], ["keine", "keine (Kragarm an der Wand)"]], default: "2", group: "Tragwerk" },
    { key: "supportMax", label: "Stützenabstand max.", type: "num", default: "2500", group: "Tragwerk", when: (p) => p.support === "auto" },
    { key: "column", label: "Stützenprofil", type: "section", default: { kind: "vierkant", size: "100x5" }, group: "Tragwerk", when: (p) => p.support !== "keine" },
    { key: "wallPlate", label: "Wandanschlussplatte (Dicke)", type: "num", default: "15", group: "Tragwerk" },
    { key: "deck", label: "Belag", type: "select", options: [["gitterrost", "Gitterrost"], ["holz", "Holz (Dielen)"], ["blech", "Blech (Riffelblech)"], ["keiner", "kein Belag"]], default: "gitterrost", group: "Belag" },
    { key: "deckT", label: "Belagdicke", type: "num", default: "30", group: "Belag", when: (p) => p.deck !== "keiner" },
    { key: "railing", label: "Geländer", type: "check", default: true, group: "Geländer" },
    ...normSchema(undefined, "Geländer", (p) => p.railing, { fall: false }),
    { key: "railH", label: "Geländerhöhe über Belag", type: "num", default: "1000", group: "Geländer", when: (p) => p.railing },
    { key: "fill", label: "Füllung", type: "select", options: [["staketen", "Staketen"], ["quer", "Querstäbe"], ["blech", "Blech"], ["glas", "Glas"], ["kreuz", "Kreuz mit Ring"], ["rahmen", "Rahmen mit Staketen"]], default: "staketen", tiles: "front", group: "Geländer", when: (p) => p.railing },
    { key: "railHolder", label: "Handlaufhalter (Stift, Bohrung im Handlauf)", type: "check", default: true, missing: false, group: "Geländer", when: (p) => p.railing },
    { key: "inset", label: "Geländer vom Rand", type: "num", default: "60", group: "Geländer", when: (p) => p.railing },
  ],

  plan(p) {
    const issues = [];
    const W = p.width, T = p.depth, Hb = p.height;
    if (!(W > 500 && T > 300)) throw fieldError("Breite und Tiefe prüfen", "width");
    const tt = p.deck === "keiner" ? 0 : p.deckT;
    if (p.deck !== "keiner" && !(tt > 0)) throw fieldError("Belagdicke muss > 0 sein", "deckT");
    // Rahmen und Querträger hochkant (größere Profilseite senkrecht); Rahmen offen nach außen, Winkel mit dem
    // Schenkel oben innen (Auflager für den Belag)
    const fr = p.frame, frRot = orientRot(fr, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, -1, 0], legs: [0, Math.SQRT1_2, -Math.SQRT1_2], stem: [0, 0, -1] });
    const { high: fh, wide: fw } = rotExtent(fr, frRot);
    const tw = p.wallPlate || 0;
    if (!(Hb > fh + tt + 200)) throw fieldError("Höhe zu klein für den Rahmen", "height");
    const members = [], plates = [], chains = [], drills = [];
    const zf = Hb - tt - fh / 2; // Achse Rahmen
    const y0 = tw; // Rahmen beginnt vor der Wandplatte
    const x0 = fw / 2, x1 = W - fw / 2, ya = y0 + fw / 2, yb = T - fw / 2;
    chains.push({ section: { kind: fr.kind, dims: fr.dims }, points: [[x0, ya, zf], [x1, ya, zf], [x1, yb, zf], [x0, yb, zf], [x0, ya, zf]], name: "Rahmen", up: [0, 0, 1], rot: frRot });
    // Querträger zwischen Wand- und Stirnträger, oben bündig mit dem Rahmen
    const jRot = orientRot(p.joist, [0, 1, 0], [0, 0, 1], { tall: [0, 0, 1], legs: [-Math.SQRT1_2, 0, -Math.SQRT1_2], stem: [0, 0, -1] }), jh = rotExtent(p.joist, jRot).high;
    const clearW = W - 2 * fw;
    const nJ = Math.max(0, Math.ceil(clearW / p.joistMax - 1e-9) - 1);
    const zj = Hb - tt - jh / 2;
    for (let k = 1; k <= nJ; k++) {
      const x = fw + (clearW * k) / (nJ + 1);
      members.push({ section: p.joist, a: [x, y0 + fw, zj], b: [x, T - fw, zj], name: `Querträger ${k}`, up: [0, 0, 1], rot: jRot });
    }
    // Belag
    if (tt > 0) plates.push({ center: [W / 2, (y0 + T) / 2, Hb - tt], xDir: [1, 0, 0], normal: [0, 0, 1], W, H: T - y0, t: tt, name: "Belag", tread: p.deck });
    // Wandanschlussplatten an den beiden Wandecken und je Querträger
    if (tw > 0) {
      const xs = [x0, ...Array.from({ length: nJ }, (_, k) => fw + (clearW * (k + 1)) / (nJ + 1)), x1];
      const ps = Math.max(fh + 80, 200);
      xs.forEach((x, i) => {
        const pl = platePlan({ width: fw, height: fh }, { thickness: tw, width: ps, height: ps, holes: 4, holeDia: 18, edge: 35 });
        plates.push({ center: [x, y0, zf], xDir: [1, 0, 0], normal: [0, -1, 0], W: pl.W, H: pl.H, t: tw, holes: pl.holes, d: pl.d, name: `Wandplatte ${i + 1}` });
      });
    }
    // Stützen vorne mit Fußplatte
    if (p.support !== "keine") {
      const col = p.column, cw = Math.max(col.geom.width, col.geom.height);
      const n = p.support === "auto" ? Math.max(2, Math.ceil(W / p.supportMax - 1e-9) + 1) : 2;
      const zTop = Hb - tt - fh, baseT = 15;
      if (!(zTop > baseT + 100)) throw fieldError("Zu niedrig für Stützen", "height");
      for (let k = 0; k < n; k++) {
        const x = cw / 2 + ((W - cw) * k) / (n - 1), y = T - cw / 2;
        members.push({ section: col, a: [x, y, baseT], b: [x, y, zTop], name: `Stütze ${k + 1}`, up: [1, 0, 0] });
        const pl = platePlan({ width: col.geom.width, height: col.geom.height }, { thickness: baseT, width: cw + 100, height: cw + 100, holes: 4, holeDia: 14, edge: 25 });
        plates.push({ center: [x, y, 0], xDir: [1, 0, 0], normal: [0, 0, 1], W: pl.W, H: pl.H, t: baseT, holes: pl.holes, d: pl.d, name: `Fußplatte ${k + 1}` });
      }
    } else {
      issues.push({ key: "support", level: "Hinweis", message: "Kragarm ohne Stützen: Wandanker und Profile statisch nachweisen" });
      if (T > 1500) issues.push({ key: "depth", level: "Warnung", message: `Auskragung ${T} mm ohne Stützen ist ungewöhnlich groß` });
    }
    // Geländer: links (Wand → vorne), vorne, rechts (vorne → Wand); Bauplan des Geländer-Generators gedreht
    let railInfo = "";
    if (p.railing) {
      const i = p.inset, yStart = y0 + 20;
      const side = T - i - yStart, front = W - 2 * i;
      if (!(side > 100 && front > 100)) throw fieldError("Geländer passt nicht – Abstand vom Rand prüfen", "inset");
      const gp = gelaenderParams({ runs: [side, front, side], angle: -90, height: p.railH, fill: p.fill, use: p.use, fall: Hb, holder: p.railHolder ? "stift" : "keine", overhang: p.railHolder ? 50 : 0,
        post: sec({ kind: "vierkant", size: "40x3" }), belt: sec({ kind: "flach", size: "40x8" }), bar: sec({ kind: "vierkantvoll", size: "12" }), beltMode: "zwischen" }); // Balkon-Geländer wie bisher
      // Parameter des Geländers heißen hier anders: Meldungen auf die Balkon-Felder umschlüsseln
      const KEY = { height: "railH", fill: "fill", gapMax: "fill", panelGap: "fill", ringD: "fill", use: "use" };
      let g;
      try { g = GELAENDER.plan(gp); } catch (e) { throw fieldError(e.message, KEY[e.key] || "railing"); }
      // Geländer-Lage: Ursprung, +X entlang des ersten Laufs → hier +Y ab (i, yStart, Hb)
      const o = [i, yStart, Hb];
      const P = (v) => [o[0] - v[1], o[1] + v[0], o[2] + v[2]], D = (v) => [-v[1], v[0], v[2]];
      for (const c of g.chains) chains.push({ ...c, points: c.points.map(P), up: c.up ? D(c.up) : [0, 0, 1], name: "Geländer " + c.name });
      for (const m of g.members) members.push({ ...m, a: P(m.a), b: P(m.b), up: m.up ? D(m.up) : undefined, name: "Geländer " + m.name, cuts: m.cuts && { start: m.cuts.start.map((c) => ({ p: P(c.p), n: D(c.n) })), end: m.cuts.end.map((c) => ({ p: P(c.p), n: D(c.n) })) } });
      for (const pl of g.plates) plates.push({ ...pl, center: P(pl.center), xDir: D(pl.xDir), normal: D(pl.normal), name: "Geländer " + pl.name });
      for (const d of g.drills || []) drills.push({ ...d, p: P(d.p), dir: D(d.dir), target: "Geländer " + d.target });
      issues.push(...g.issues.map(({ key, ...x }) => ({ ...x, key: KEY[key] || "railing" })));
      railInfo = `, Geländer: ${g.info}`;
    }
    const info = `Balkon ${Math.round(W)} × ${Math.round(T)} mm auf ${Math.round(Hb)} mm, ${nJ} Querträger` + (p.support !== "keine" ? `, ${members.filter((m) => /^Stütze/.test(m.name)).length} Stützen` : ", ohne Stützen") + railInfo;
    return { chains, members, plates, drills, info, issues };
  },

  parts: { support: /Stütze/, railing: /^Geländer/, inset: /^Geländer/, fill: /^Geländer .*(Stab|Staket|Querstab|Kreuz|Ring|Blech|Glas)/ },
  views: ["top", "front"],
  /** Maßlinien: Grundriss (Breite, Tiefe), Ansicht (Höhe, Geländerhöhe) */
  dims(p, plan, view) {
    const gap = Math.max(200, p.width * 0.06), r = Math.round;
    if (view === "top") return [{ key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) }, { key: "depth", a: [p.width, 0], b: [p.width, p.depth], off: -gap, text: r(p.depth) }];
    const out = [{ key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }];
    if (p.railing) out.push({ key: "railH", a: [p.width, p.height], b: [p.width, p.height + p.railH], off: -gap, text: r(p.railH) });
    return out;
  },
};

/** Geländer-Parameter: Standardwerte des Geländer-Generators (Profile aufgelöst) mit Änderungen */
function gelaenderParams(over) {
  const out = {};
  for (const s of GELAENDER.schema) {
    const v = s.default;
    out[s.key] = s.type === "num" ? Number(v) : s.type === "section" ? sec(v) : s.type === "list" ? splitList(v).map(Number) : v;
  }
  return { ...out, ...over };
}
