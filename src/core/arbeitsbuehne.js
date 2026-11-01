// Arbeitsbühne / Podest (Stahlbau-Lücken ST8): Stützen mit Fuß- und Kopfplatten, Randträger als Rahmen mit Gehrung,
// Querträger, Gitterrost-Felder, Bordblech, Geländer rundum mit Durchgang und Aufgang (Treppe oder Steigleiter).
// Geländer, Treppe und Leiter kommen aus ihren Generatoren und werden hierher gedreht. Reine Rechnung, keine Statik.
//
// Lage: Bühne über x = 0 … Breite, y = 0 … Tiefe, Gelände z = 0, Oberkante Belag auf »Höhe«. Der Zugang liegt an der
// Vorderkante (y = 0); Treppe und Leiter stehen davor (y < 0).

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { catalogToDims, sectionGeometry } from "./sections.js";
import { splitList } from "./expr.js";
import { platePlan } from "./anschluss.js";
import { GELAENDER } from "./gelaender.js";
import { TREPPE } from "./treppe.js";
import { STEIGLEITER } from "./steigleiter.js";
import { mountSchema } from "./pfostenbefestigung.js";

const sec = (v) => {
  const dims = Object.fromEntries(Object.entries(catalogToDims(v.kind, v.size)).map(([k, x]) => [k, Number(x)]));
  return { kind: v.kind, dims, geom: sectionGeometry(v.kind, dims), size: v.size };
};
/** Standardwerte eines Generators (Profile aufgelöst) mit Änderungen */
function defaults(gen, over) {
  const out = {};
  for (const s of gen.schema) {
    const v = s.default;
    out[s.key] = s.type === "num" ? Number(v) : s.type === "section" ? sec(v) : s.type === "list" ? splitList(v).map(Number) : s.type === "check" ? !!v : v;
  }
  return { ...out, ...over };
}
/** Bauplan eines Untergenerators mit P (Punkt) und D (Richtung) in die Bühne setzen, Namen mit Vorsilbe */
function place(g, P, D, prefix, into, keep = () => false) {
  const cut = (c) => c && { start: c.start.map((x) => ({ p: P(x.p), n: D(x.n) })), end: c.end.map((x) => ({ p: P(x.p), n: D(x.n) })) };
  for (const c of g.chains || []) into.chains.push({ ...c, points: c.points.map(P), up: D(c.up || [0, 0, 1]), name: prefix + c.name, ...(c.target ? { target: prefix + c.target } : {}) });
  const path = (pa) => ({ ...pa, c: P(pa.c), axis: D(pa.axis || [0, 0, 1]), x0: D(pa.x0 || [1, 0, 0]) });
  for (const m of g.members || []) into.members.push({ ...m, a: P(m.a), b: P(m.b), up: m.up ? D(m.up) : undefined, name: prefix + m.name, ...(m.target ? { target: prefix + m.target } : {}), cuts: cut(m.cuts),
    ...(m.copes ? { copes: m.copes.map((c) => (c.path ? { ...c, path: path(c.path) } : { ...c, a: P(c.a), b: P(c.b), up: c.up ? D(c.up) : undefined, cuts: cut(c.cuts) })) } : {}) });
  for (const t of g.tubes || []) into.tubes.push({ ...t, path: path(t.path), name: prefix + t.name, ...(t.target ? { target: prefix + t.target } : {}), ...(t.copes ? { copes: t.copes.map((c) => ({ ...c, path: path(c.path) })) } : {}) });
  for (const pl of g.plates || []) into.plates.push({ ...pl, center: P(pl.center), xDir: D(pl.xDir), normal: D(pl.normal), name: prefix + pl.name });
  for (const n of g.norms || []) into.norms.push({ ...n, pos: P(n.pos), dir: D(n.dir) });
  for (const d of g.drills || []) into.drills.push({ ...d, p: P(d.p), dir: D(d.dir), ...(d.xDir ? { xDir: D(d.xDir) } : {}), target: keep(d.target) ? d.target : prefix + d.target });
}
const railMount = (p) => (p.railing && p.railMount === "oben" ? "oben" : null);
const rk = (k) => "rail" + k[0].toUpperCase() + k.slice(1);

export const ARBEITSBUEHNE = {
  label: "Arbeitsbühne",
  schema: [
    { key: "width", label: "Breite (entlang Zugangsseite)", type: "num", default: "4000", group: "Bühne" },
    { key: "depth", label: "Tiefe", type: "num", default: "2500", group: "Bühne" },
    { key: "height", label: "Höhe OK Belag über Gelände", type: "num", default: "3000", group: "Bühne" },
    { key: "frame", label: "Randträger", type: "section", kinds: ["upn", "u", "rechteck", "ipe", "hea"], default: { kind: "upn", size: "180" }, group: "Tragwerk" },
    { key: "joist", label: "Querträger", type: "section", kinds: ["upn", "u", "rechteck", "ipe", "flach"], default: { kind: "upn", size: "140" }, group: "Tragwerk" },
    { key: "fieldMax", label: "Gitterrost-Feld breit höchstens", type: "num", default: "1000", group: "Tragwerk" },
    { key: "column", label: "Stützen", type: "section", kinds: ["vierkant", "rechteck", "hea", "heb", "rohr"], default: { kind: "vierkant", size: "120x6.3" }, group: "Stützen" },
    { key: "colMax", label: "Stützenabstand höchstens", type: "num", default: "4000", group: "Stützen" },
    { key: "baseT", label: "Fußplatte Dicke", type: "num", default: "15", group: "Stützen" },
    { key: "capT", label: "Kopfplatte Dicke", type: "num", default: "15", group: "Stützen" },
    { key: "deck", label: "Belag", type: "select", options: [["gitterrost", "Gitterrost"], ["blech", "Riffelblech"]], default: "gitterrost", group: "Belag" },
    { key: "deckT", label: "Belagdicke", type: "num", default: "30", group: "Belag" },
    { key: "toe", label: "Bordblech (Fußleiste) außen am Randträger", type: "check", default: true, group: "Belag" },
    { key: "toeH", label: "Bordblech über Belag", type: "num", default: "100", group: "Belag", when: (p) => p.toe },
    { key: "access", label: "Aufgang", type: "select", options: [["treppe", "Treppe"], ["leiter", "Steigleiter"], ["offen", "nur Durchgang im Geländer"], ["keiner", "keiner (Geländer rundum)"]], default: "treppe", tiles: "top", group: "Aufgang" },
    { key: "accessPos", label: "Mitte Aufgang ab linker Ecke (0 = mittig)", type: "num", default: "0", group: "Aufgang", when: (p) => p.access !== "keiner" },
    { key: "stairW", label: "Treppe Laufbreite", type: "num", default: "800", group: "Aufgang", when: (p) => p.access === "treppe" },
    { key: "stairRail", label: "Treppengeländer", type: "select", options: [["beide", "beidseitig"], ["links", "links"], ["rechts", "rechts"], ["keine", "keines"]], default: "beide", group: "Aufgang", when: (p) => p.access === "treppe" },
    { key: "openW", label: "Durchgang lichte Breite", type: "num", default: "800", group: "Aufgang", when: (p) => p.access === "offen" },
    { key: "railing", label: "Geländer", type: "check", default: true, group: "Geländer" },
    { key: "railH", label: "Höhe OK Handlauf über Belag", type: "num", default: "1100", group: "Geländer", when: (p) => p.railing },
    { key: "railFill", label: "Füllung", type: "select", options: [["knie", "Knieleiste (Industrie)"], ["staketen", "Staketen"]], default: "knie", group: "Geländer", when: (p) => p.railing },
    { key: "inset", label: "Geländer vom Rand", type: "num", default: "40", group: "Geländer", when: (p) => p.railing },
    { key: "railMount", label: "Pfostenbefestigung", type: "select", options: [["oben", "oben mit Fußplatte, Bohrbild auch in den Randträger"], ["fussplatte", "einfache Fußplatte auf dem Belag"]], default: "oben", group: "Pfostenbefestigung", when: (p) => p.railing },
    ...mountSchema(rk, "Pfostenbefestigung", railMount, { oW: "70", oL: "160", holes: "2l", d: "13.5", e: "25" })
  ],

  plan(p) {
    const issues = [];
    const W = p.width, T = p.depth, Hp = p.height, tt = p.deckT;
    if (!(W >= 1000 && T >= 800)) throw fieldError("Breite mindestens 1000, Tiefe mindestens 800 mm", "width");
    if (!(tt > 0)) throw fieldError("Belagdicke muss > 0 sein", "deckT");
    const out = { chains: [], members: [], plates: [], norms: [], drills: [], tubes: [] };
    const { chains, members, plates, norms, drills } = out;
    // Randträger: Rahmen mit Gehrung, hochkant, offene Seite nach außen (Querträger am Steg); Oberkante unter dem Belag
    const fr = p.frame, frRot = orientRot(fr, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, -1, 0] });
    const { high: fh, wide: fw } = rotExtent(fr, frRot);
    const zf = Hp - tt - fh / 2;
    const col = p.column, cw = Math.max(col.geom.width, col.geom.height);
    if (!(zf - fh / 2 - p.capT > p.baseT + 300)) throw fieldError("Bühne zu niedrig für Stützen und Randträger", "height");
    const x0 = fw / 2, x1 = W - fw / 2, y0 = fw / 2, y1 = T - fw / 2;
    chains.push({ section: fr, points: [[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], [x0, y0, zf]], name: "Randträger", up: [0, 0, 1], rot: frRot });
    // Querträger an den Feldgrenzen des Belags, oben bündig
    const jo = p.joist, jRot = orientRot(jo, [0, 1, 0], [0, 0, 1], { tall: [0, 0, 1], open: [1, 0, 0] }), jh = rotExtent(jo, jRot).high;
    if (jh > fh + 1e-6) throw fieldError("Querträger höher als der Randträger", "joist");
    const nF = Math.max(1, Math.ceil(W / p.fieldMax - 1e-9));
    const xs = Array.from({ length: nF + 1 }, (_, k) => (W * k) / nF); // Feldgrenzen
    for (let k = 1; k < nF; k++) members.push({ section: jo, a: [xs[k], fw, Hp - tt - jh / 2], b: [xs[k], T - fw, Hp - tt - jh / 2], name: `Querträger ${k}`, up: [0, 0, 1], rot: jRot });
    if (T - 2 * fw > 4000) issues.push({ key: "depth", level: "Hinweis", message: `Querträger spannen ${Math.round(T - 2 * fw)} mm – Zwischenträger oder größeres Profil prüfen` });
    // Belag je Feld über die ganze Tiefe
    for (let k = 0; k < nF; k++) plates.push({ center: [(xs[k] + xs[k + 1]) / 2, T / 2, Hp - tt], xDir: [1, 0, 0], normal: [0, 0, 1], W: xs[k + 1] - xs[k], H: T, t: tt, name: `${p.deck === "blech" ? "Riffelblech" : "Gitterrost"} ${k + 1}`, tread: p.deck });
    // Stützen unter dem Rahmen, außen bündig, mit Kopf- und Fußplatte
    const nX = Math.max(2, Math.ceil((W - cw) / p.colMax - 1e-9) + 1), nY = Math.max(2, Math.ceil((T - cw) / p.colMax - 1e-9) + 1);
    const pos = [];
    for (let i = 0; i < nX; i++) { const x = cw / 2 + ((W - cw) * i) / (nX - 1); pos.push([x, cw / 2], [x, T - cw / 2]); }
    for (let j = 1; j < nY - 1; j++) { const y = cw / 2 + ((T - cw) * j) / (nY - 1); pos.push([cw / 2, y], [W - cw / 2, y]); }
    const zCap = zf - fh / 2 - p.capT;
    pos.forEach(([x, y], k) => {
      members.push({ section: col, a: [x, y, p.baseT], b: [x, y, zCap], name: `Stütze ${k + 1}`, up: [1, 0, 0] });
      const bp = platePlan({ width: col.geom.width, height: col.geom.height }, { thickness: p.baseT, width: cw + 120, height: cw + 120, holes: 4, holeDia: 18, edge: 30 });
      plates.push({ center: [x, y, 0], xDir: [1, 0, 0], normal: [0, 0, 1], W: bp.W, H: bp.H, t: p.baseT, holes: bp.holes, d: bp.d, name: `Fußplatte ${k + 1}` });
      plates.push({ center: [x, y, zCap], xDir: [1, 0, 0], normal: [0, 0, 1], W: cw + 20, H: cw + 20, t: p.capT, name: `Kopfplatte ${k + 1}` });
    });
    issues.push({ key: "column", level: "Hinweis", message: "Aussteifung (Verband oder eingespannte Stützen) und Anker statisch nachweisen" });

    // Aufgang an der Vorderkante: Öffnung im Geländer und im Bordblech [xa, xb]
    let xa = null, xb = null, accessInfo = "";
    const xc = p.accessPos > 0 ? p.accessPos : W / 2;
    if (p.access === "treppe") {
      const B = p.stairW;
      const sp = defaults(TREPPE, { form: "gerade", height: Hp, width: B, gel: p.stairRail, gelUse: "industrie", gelH: 1100 });
      let g;
      try { g = TREPPE.plan(sp); } catch (e) { throw fieldError("Treppe: " + e.message, e.key === "width" ? "stairW" : "access"); }
      // Treppen-Lage: Lauf in +X bis xTop, Breite in +Y → hier Lauf in +Y bis zur Vorderkante, Breite in −X um xc
      const xTop = Math.max(...g.plates.filter((x) => /^Stufe \d+$/.test(x.name)).map((x) => x.center[0] + x.H / 2));
      const P = (v) => [xc + B / 2 - v[1], v[0] - xTop, v[2]], D = (v) => [-v[1], v[0], v[2]];
      const n0 = members.length;
      place(g, P, D, "Treppe ", out);
      const half = Math.max(...members.slice(n0).flatMap((m) => [m.a, m.b]).map((q) => Math.abs(q[0] - xc))) + 150; // Platz für Handlaufüberstand und Endpfosten des Bühnengeländers
      xa = xc - half; xb = xc + half;
      issues.push(...g.issues.filter((x) => !/Fußleiste/.test(x.message)).map(({ key, ...x }) => ({ ...x, key: key === "width" ? "stairW" : key === "gel" ? "stairRail" : "access" })));
      accessInfo = `, Treppe: ${g.info}`;
    } else if (p.access === "leiter") {
      const lp = defaults(STEIGLEITER, { height: Hp });
      let g;
      try { g = STEIGLEITER.plan(lp); } catch (e) { throw fieldError("Steigleiter: " + e.message, "access"); }
      // Wandhalter nur am Randträger (darunter steht die Leiter frei), Leiter-Lage um 180° gedreht
      const halter = g.members.filter((m) => /^Wandhalter/.test(m.name));
      g.members = g.members.filter((m) => !/^Wandhalter/.test(m.name));
      g.plates = g.plates.filter((x) => !/^Wandhalter/.test(x.name));
      const zb = Hp - tt - fh / 2;
      // U-Randträger ist nach außen offen: Halter reicht bis an den Steg (vorher endete er frei in der Öffnung)
      const into = /^u/.test(fr.kind) && fr.dims?.s > 0 ? fw - fr.dims.s : 0;
      for (const side of ["links", "rechts"]) {
        const m = halter.find((x) => x.name.startsWith(`Wandhalter ${side}`));
        if (m) g.members.push({ ...m, a: [m.a[0], -into, zb], b: [m.b[0], m.b[1], zb], name: `Halter ${side} am Randträger` });
      }
      const P = (v) => [xc - v[0], -v[1], v[2]], D = (v) => [-v[0], -v[1], v[2]];
      const n0 = members.length;
      place(g, P, D, "Leiter ", out);
      const half = Math.max(...members.slice(n0).filter((m) => /Holm|Halter/.test(m.name)).flatMap((m) => [m.a, m.b]).map((q) => Math.abs(q[0] - xc))) + 60;
      xa = xc - half; xb = xc + half;
      issues.push(...g.issues.map(({ key, ...x }) => ({ ...x, key: "access" })));
      issues.push({ key: "access", level: "Hinweis", message: "Durchstieg mit selbstschließender Schranke sichern und Leiterfuß am Boden befestigen (ISO 14122-4) – wird nicht erzeugt" });
      accessInfo = `, Steigleiter: ${g.info.replace(/\d+ Wandhalter/, "2 Halter am Randträger")}`;
    } else if (p.access === "offen") {
      xa = xc - p.openW / 2; xb = xc + p.openW / 2;
    }
    if (xa !== null && (xa < 0 || xb > W)) throw fieldError(`Aufgang (${Math.round(xb - xa)} mm breit) passt nicht an die Vorderkante – Lage oder Breite prüfen`, "accessPos");

    // Bordblech außen am Randträger, im Aufgang ausgespart; vorne/hinten über die Ecken, seitlich dazwischen
    if (p.toe) {
      const t = 5, zb = Hp - tt - fh / 2, H = Hp + p.toeH - zb, zc = zb + H / 2;
      const along = (name, x0, x1, y) => x1 - x0 > 50 && plates.push({ center: [(x0 + x1) / 2, y, zc], xDir: [1, 0, 0], normal: [0, y < T / 2 ? -1 : 1, 0], W: x1 - x0, H, t, name });
      if (xa === null) along("Bordblech vorne", -t, W + t, 0);
      else { along("Bordblech vorne links", -t, xa, 0); along("Bordblech vorne rechts", xb, W + t, 0); }
      along("Bordblech hinten", -t, W + t, T);
      for (const [x, nx, s] of [[0, -1, "links"], [W, 1, "rechts"]]) plates.push({ center: [x, T / 2, zc], xDir: [0, 1, 0], normal: [nx, 0, 0], W: T, H, t, name: `Bordblech ${s}` });
    }

    // Geländer: im Uhrzeigersinn ab der linken Kante des Aufgangs um die Bühne bis zur rechten Kante (außen links)
    let railInfo = "";
    if (p.railing) {
      // einfache Fußplatte (120 mm): Pfosten so weit vom Rand, dass die Platte ganz auf dem Belag liegt (vorher stand sie
      // über den Rand und lief ins Bordblech)
      const i = railMount(p) ? p.inset : Math.max(p.inset, 65);
      let pts = xa === null
        ? [[W / 2, i], [i, i], [i, T - i], [W - i, T - i], [W - i, i], [W / 2 + 1, i]]
        : [[xa, i], [i, i], [i, T - i], [W - i, T - i], [W - i, i], [xb, i]];
      if (xa === null) issues.push({ key: "access", level: "Hinweis", message: "Ohne Aufgang: Geländer vorne in der Mitte gestoßen" });
      // zu kurze Anfangs-/Endläufe (Aufgang an der Ecke) weglassen
      if (Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 150) pts = pts.slice(1);
      if (Math.hypot(pts.at(-1)[0] - pts.at(-2)[0], pts.at(-1)[1] - pts.at(-2)[1]) < 150) pts = pts.slice(0, -1);
      const runs = pts.slice(1).map((q, k) => Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]));
      const knie = p.railFill === "knie";
      // mit Bordblech am Randträger keine zweite Fußleiste am Geländer (vorher doppelt, auf den Fußplattenschrauben)
      const gp = defaults(GELAENDER, { runs, angle: -90, height: p.railH, use: "industrie", fall: Hp, ...(p.toe ? { toe: "nein" } : {}), post: sec({ kind: "vierkant", size: "40x3" }), postMax: 1500,
        ...(knie ? { fill: "keine", top: true, topGap: Math.round(p.railH / 2), bottom: false } : { fill: "staketen", bar: sec({ kind: "vierkantvoll", size: "12" }), bottomZ: p.toe ? p.toeH + 20 : 100 }) });
      const o = pts[0], dx = [(pts[1][0] - o[0]) / runs[0], (pts[1][1] - o[1]) / runs[0]], dy = [-dx[1], dx[0]];
      const P = (v) => [o[0] + v[0] * dx[0] + v[1] * dy[0], o[1] + v[0] * dx[1] + v[1] * dy[1], Hp + v[2]];
      const D = (v) => [v[0] * dx[0] + v[1] * dy[0], v[0] * dx[1] + v[1] * dy[1], v[2]];
      const Q = (w) => { const r = [w[0] - o[0], w[1] - o[1]]; return [r[0] * dx[0] + r[1] * dx[1], r[0] * dy[0] + r[1] * dy[1], w[2] - Hp]; };
      const Dq = (w) => [w[0] * dx[0] + w[1] * dx[1], w[0] * dy[0] + w[1] * dy[1], w[2]];
      const KEY = { height: "railH", fill: "railFill", gapMax: "railFill", use: "railH", runs: "inset" };
      const decks = plates.filter((x) => x.tread);
      const local = decks.map((x) => ({ ...x, center: Q(x.center), xDir: Dq(x.xDir), normal: Dq(x.normal) }));
      if (railMount(p)) {
        const plain = mountSchema().map((f) => f.key);
        mountSchema(rk).forEach((f, j) => { if (p[f.key] !== undefined) { gp[plain[j]] = p[f.key]; KEY[plain[j]] = f.key; } });
        const segs = chains[0].points.slice(1).map((b, k) => ({ name: "Randträger", a: Q(chains[0].points[k]), b: Q(b), section: fr, up: [0, 0, 1], rot: frRot }));
        const joists = members.filter((m) => /^Querträger/.test(m.name)).map((m) => ({ ...m, a: Q(m.a), b: Q(m.b), up: [0, 0, 1] }));
        Object.assign(gp, { base: "oben", supports: { members: [...segs, ...joists], plates: local } });
      } else Object.assign(gp, { base: "fussplatte" });
      KEY.mount = "railMount"; KEY.mTarget = "railMount"; KEY.mProfile = "railMount";
      let g;
      try { g = GELAENDER.plan(gp); } catch (e) { throw fieldError("Geländer: " + e.message, KEY[e.key] || "railing"); }
      local.forEach((l, k) => { if (l.holes) decks[k].holes = l.holes; });
      place(g, P, D, "Geländer ", out, (t) => t === "Randträger" || /^Querträger \d+$/.test(t));
      if (!railMount(p)) {
        // einfache Fußplatten: Bohrungen auch im Belag darunter (vorher verschraubt ins Leere)
        const n3 = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
        for (const fp of out.plates.filter((x) => /^Geländer Fußplatte \d+$/.test(x.name))) {
          const fx = n3(fp.xDir), fn = n3(fp.normal), fy = [fn[1] * fx[2] - fn[2] * fx[1], fn[2] * fx[0] - fn[0] * fx[2], fn[0] * fx[1] - fn[1] * fx[0]];
          for (const [hx, hy, hd] of fp.holes || []) {
            const q = fp.center.map((v, k) => v + fx[k] * hx + fy[k] * hy);
            const deck = decks.find((dk) => { const dx2 = n3(dk.xDir), dn = n3(dk.normal), dy2 = [dn[1] * dx2[2] - dn[2] * dx2[1], dn[2] * dx2[0] - dn[0] * dx2[2], dn[0] * dx2[1] - dn[1] * dx2[0]], r = q.map((v, k) => v - dk.center[k]);
              const u = r[0] * dx2[0] + r[1] * dx2[1] + r[2] * dx2[2], w = r[0] * dy2[0] + r[1] * dy2[1] + r[2] * dy2[2];
              if (Math.abs(u) < dk.W / 2 - 10 && Math.abs(w) < dk.H / 2 - 10) { (dk.holes = dk.holes || []).push([u, w, hd || fp.d]); return true; }
              return false; });
            if (!deck) issues.push({ key: "railMount", level: "Hinweis", message: `${fp.name}: Bohrung liegt nicht auf dem Belag` });
            // über dem Randträger: Bohrung auch durch dessen Obergurt (Mutter unten in der offenen Seite)
            else if (q[0] < fw || q[0] > W - fw || q[1] < fw || q[1] > T - fw) drills.push({ target: "Randträger", p: [q[0], q[1], Hp - tt + 0.5], dir: [0, 0, -1], d: hd || fp.d, len: (Number(fr.dims?.t) || 12) + 3 });
          }
        }
      }
      issues.push(...g.issues.filter((x) => !(p.toe && /Fußleiste/.test(x.message))).map(({ key, ...x }) => ({ ...x, key: KEY[key] || "railing" })));
      railInfo = `, Geländer: ${g.info}`;
    }
    const info = `Arbeitsbühne ${Math.round(W)} × ${Math.round(T)} mm auf ${Math.round(Hp)} mm, ${pos.length} Stützen ${col.kind.toUpperCase()} ${col.size}, ${nF} Belagfelder, ${nF - 1} Querträger` + accessInfo + railInfo + " – statisch nicht nachgewiesen";
    return { ...out, info, issues };
  },

  parts: { access: /^(Treppe|Leiter) /, stairW: /^Treppe /, stairRail: /^Treppe .*Geländer/, railing: /^Geländer/, railFill: /^Geländer/, column: /^(Stütze|Fußplatte|Kopfplatte)/, toe: /^Bordblech/ },
  views: ["top", "front"],
  dims(p, plan, view) {
    const gap = Math.max(200, p.width * 0.06), r = Math.round;
    if (view === "top") return [{ key: "width", a: [0, 0], b: [p.width, 0], off: -gap, text: r(p.width) }, { key: "depth", a: [p.width, 0], b: [p.width, p.depth], off: -gap, text: r(p.depth) }];
    const out = [{ key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }];
    if (p.railing) out.push({ key: "railH", a: [p.width, p.height], b: [p.width, p.height + p.railH], off: -gap, text: r(p.railH) });
    return out;
  },
};
