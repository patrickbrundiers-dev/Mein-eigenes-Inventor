// Vorschläge nach 0.31 (P1–P12): reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { buildRect3, tangentCircles3, pickTangentCircle } from "../src/core/sketchshapes.js";
import { solveSketch } from "../src/core/solver.js";
import { newSketch, extractProfiles } from "../src/core/sketch.js";
import { defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";
import { validateDirekt, direktSummary, DIREKT_OPS } from "../src/core/direkt.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const usePoint = (sk, sn) => { if (sn.pointId) return sn.pointId; const id = uid("p"); sk.points.push({ id, x: sn.x, y: sn.y }); return id; };
const nearly = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const E = (x) => Number(x);
const plan = (gen, patch = {}) => GENERATORS[gen].plan(resolveGenParams(gen, { ...defaultGenerator(gen).params, ...patch }, E));

test("P9: Rechteck über 3 Punkte liegt schräg, bleibt rechtwinklig, 5 Freiheitsgrade", () => {
  const sk = newSketch("s", "S", { ref: "XY" });
  const r = buildRect3(sk, { x: 0, y: 0 }, { x: 30, y: 40 }, { x: -100, y: 200 }, { uid, usePoint });
  nearly(r.length, 50);
  // Breite = Abstand des dritten Punkts von der Kante: Normale (−0,8; 0,6) · (−100; 200) = 200
  nearly(r.width, 200);
  const s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 5);
  const reg = extractProfiles(sk).regions;
  assert.equal(reg.length, 1);
  nearly(Math.abs(reg[0].area), 50 * 200, 1e-6, "Fläche");
  assert.throws(() => buildRect3(newSketch("t", "T", { ref: "XY" }), { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { uid, usePoint }), /Breite/);
});

test("P9: Kreis tangential an 3 Linien – Inkreis des Dreiecks, Ankreis nahe der Klickstelle", () => {
  // Dreieck 3-4-5: Inkreis r = (3 + 4 − 5) / 2 = 1 bei (1, 1)
  const L = [{ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }, { a: { x: 4, y: 0 }, b: { x: 0, y: 3 } }];
  const c = tangentCircles3(L);
  assert.equal(c.length, 4);
  const inc = pickTangentCircle(c, { x: 1.3, y: 1 });
  nearly(inc.x, 1); nearly(inc.y, 1); nearly(inc.r, 1);
  assert.ok(inc.onSegments);
  // zwei Parallelen im Abstand 10 und eine Quer-Linie: r = 5
  const P = tangentCircles3([{ a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }, { a: { x: 0, y: 10 }, b: { x: 50, y: 10 } }, { a: { x: 20, y: -5 }, b: { x: 20, y: 15 } }]);
  assert.ok(P.length >= 2);
  P.forEach((k) => nearly(k.r, 5));
  assert.equal(tangentCircles3([{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { a: { x: 0, y: 1 }, b: { x: 1, y: 1 } }, { a: { x: 0, y: 2 }, b: { x: 1, y: 2 } }]).length, 0);
});

test("P10: Direktbearbeitung »Ersetzen« braucht eine Zielfläche", () => {
  assert.ok(DIREKT_OPS.some(([k]) => k === "ersetzen"));
  assert.throws(() => validateDirekt({ op: "ersetzen", faces: [{ p: [0, 0, 0] }] }), /Zielfläche/);
  assert.equal(validateDirekt({ op: "ersetzen", faces: [{ p: [0, 0, 0] }], target: { p: [0, 0, 5], n: [0, 0, 1] } }), "ersetzen");
  assert.match(direktSummary("ersetzen", 2, 0), /2 Fläche\(n\) durch die Zielfläche ersetzt/);
});

test("P11: Balkon warnt, wenn die Stütze breiter als der Rahmen ist (Standard ohne Warnung)", () => {
  const ok = plan("balkon");
  assert.ok(!ok.issues.some((i) => i.key === "column"), JSON.stringify(ok.issues));
  const wide = plan("balkon", { column: { kind: "vierkant", size: "120x5" } });
  const w = wide.issues.find((i) => i.key === "column");
  assert.ok(w && w.level === "Warnung" && /breiter als der Rahmen/.test(w.message));
});

import { rampPath, offsetPath, zAt } from "../src/core/rampe.js";
import { zargeProfile, polyArea } from "../src/core/zarge.js";
import { orderRows } from "../src/core/bestellliste.js";

test("P1: Rampe – Läufe höchstens 6 m mit Podest, DIN-18040-Warnungen, Teile", () => {
  const r = rampPath({ height: 600, slope: 6, runMax: 6000, landing: 1500, topLanding: 0 });
  assert.equal(r.runs, 2);
  nearly(r.runLength, 5000);
  assert.deepEqual(r.pts.map((q) => q.map(Math.round)), [[0, 0], [5000, 300], [6500, 300], [11500, 600]]);
  // Versatz senkrecht zu jedem Abschnitt, Ecke als Schnittpunkt
  const o = offsetPath([[0, 0], [100, 0], [200, 100]], 10);
  nearly(o[0][1], -10); nearly(zAt(o, 50), -10);
  nearly(o[1][0], 100 + 10 * Math.tan(Math.PI / 8), 1e-6, "Ecke");
  const p = plan("rampe");
  assert.ok(p.chains.some((c) => c.name === "Wange links") && p.chains.some((c) => c.name === "Handlauf rechts"));
  assert.ok(p.plates.some((x) => /^Gitterrost Podest/.test(x.name)) && p.plates.some((x) => /^Radabweiser links/.test(x.name)));
  assert.ok(p.members.some((m) => /^Pfosten links/.test(m.name)) && p.members.some((m) => /^Knieleiste/.test(m.name)));
  assert.ok(!p.issues.some((i) => i.level === "Warnung"), JSON.stringify(p.issues));
  const steep = plan("rampe", { slope: "8", landing: "1200" });
  assert.ok(steep.issues.some((i) => i.key === "slope" && i.level === "Warnung"));
  assert.ok(steep.issues.some((i) => i.key === "landing"));
  // Handlauf mit 300 mm waagerecht über Anfang und Ende
  const h = p.chains.find((c) => c.name === "Handlauf links").points;
  nearly(h[0][0], -300); nearly(h[0][2], h[1][2]); nearly(h.at(-1)[2], h.at(-2)[2]);
});

test("P2: Stahlzarge – Profil ohne Selbstüberschneidung, Gehrung, Bandseite, Zuschnittbreite", () => {
  const prof = zargeProfile({ S: 50, A: 15, R: 27, D: 60, t: 1.5 });
  // einfache Kontur: keine zwei nicht benachbarten Kanten schneiden sich
  const segs = prof.map((a, i) => [a, prof[(i + 1) % prof.length]]);
  const cross = ([a, b], [c, d]) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) if (!(i === 0 && j === segs.length - 1)) assert.ok(!cross(segs[i], segs[j]), `Kanten ${i}/${j}`);
  nearly(polyArea(prof) / 1.5, 50 + 15 + 27 + (15 - 1.5) + (60 - 27), 3, "Abwicklung ≈ Mittellinie: Spiegel, Falz, Anschlag, Laibung");
  const p = plan("zarge");
  assert.deepEqual(p.plates.filter((x) => /^Zarge/.test(x.name)).map((x) => x.cutPlanes.length), [1, 1, 2]);
  assert.ok(p.plates.filter((x) => /^Bandtasche/.test(x.name)).every((x) => x.center[0] < 100), "Bandtaschen links");
  const r = plan("zarge", { hinge: "rechts", form: "umfassung", wall: "175" });
  assert.ok(r.plates.filter((x) => /^Bandtasche/.test(x.name)).every((x) => x.center[0] > 800), "Bandtaschen rechts");
  assert.match(r.info, /Umfassungszarge/);
  assert.throws(() => plan("zarge", { t: "8" }), /Blechdicke/);
});

test("P3: Bestellliste – Gitterroste, Gitterroststufen und Klemmhalter", () => {
  const plate = (W, H, t) => ({ tread: "gitterrost", plate: { W, H, t } });
  const rows = orderRows([{ part: { id: "a" }, qty: 2, bodies: [{ name: "Gitterrost 1", meta: plate(1000, 800, 30) }, { name: "Stufe 3", meta: plate(800, 240, 30) }, { name: "Riffelblech", meta: { tread: "blech", plate: { W: 1, H: 1, t: 5 } } }] }], { suppliers: { gitterroste: "Rostwerk" } });
  const g = rows.filter((r) => r.group === "gitterroste");
  assert.deepEqual(g.map((r) => [r.name, r.qty]), [["Gitterrost 1000 × 800 × 30", 2], ["Gitterrost-Klemmhalter Satz M8", 8], ["Gitterroststufe 800 × 240 × 30", 2]]);
  assert.ok(g.every((r) => r.supplier === "Rostwerk"));
  nearly(g[0].area, 1.6, 1e-9);
});

import { NORM_FAMILIES, recipeVolume } from "../src/core/normlib.js";
import { klemmGeom } from "../src/core/klemmgelaender.js";

test("P4: Rohrklemmverbinder als Normteile und Klemmgeländer ohne Schweißnähte", () => {
  for (const k of ["klemm_t", "klemm_bogen", "klemm_ecke", "klemm_kreuz", "klemm_kreuz_ende", "klemm_kreuz_ecke", "klemm_fuss"]) {
    const f = NORM_FAMILIES[k];
    assert.ok(f && f.cat === "beschlaege" && f.sizeList.includes("Ø42,4"), k);
    assert.ok(recipeVolume(f.build(f.sizes["Ø42,4"])) > 0, k);
  }
  const p = plan("klemmgelaender");
  const kinds = (re) => p.norms.filter((n) => re.test(n.kind)).length;
  assert.equal(kinds(/^klemm_fuss$/), 5);
  assert.equal(kinds(/^klemm_t$/), 2);
  assert.equal(kinds(/^klemm_ecke$/), 1);
  assert.equal(kinds(/^klemm_bogen$/), 2);
  // Eckstück: x zum einen Lauf, z × x zum anderen (beide Läufe stecken in Muffen)
  const e = p.norms.find((n) => n.kind === "klemm_ecke"), zx = [-e.xDir[1], e.xDir[0], 0];
  const toRails = [[-1, 0, 0], [0, 1, 0]].map((v) => v.join());
  assert.ok(toRails.includes(e.xDir.map((x) => x + 0).join()) && toRails.includes(zx.map((x) => x + 0).join()), JSON.stringify(e.xDir));
  // Handlauf endet am Muffenanschlag (Bohrung/2 + 3 mm vor dem Knoten)
  const g = klemmGeom(42.4), h1 = p.members.find((m) => m.name === "Handlauf 1");
  assert.ok(Math.abs(h1.a[0] - g.stop) < 1e-9 && Math.abs(h1.b[0] - (3000 - g.stop)) < 1e-9);
  assert.match(p.info, /ohne Schweißnähte/);
  assert.throws(() => plan("klemmgelaender", { runs: "100" }), /Lauf mindestens/);
});

test("P5 Nahtvorbereitung ISO 9692-1: Flanken, Querschnitt, Text, Symbol mit Winkel", async () => {
  const W = await import("../src/core/weld.js");
  assert.deepEqual(W.prepBevels("v", 10, { angle: 60, root: 1 }).map((b) => b.depth), [9]);
  assert.equal(W.prepBevels("k", 20, { angle: 45, root: 2 }).length, 2);
  assert.throws(() => W.prepBevels("y", 6, { angle: 60, root: 6 }), /Steghöhe/);
  assert.deepEqual(W.prepBevels("i", 6, W.PREP_DEFAULTS.i), []);
  // Standard ohne Vorbereitung wie bisher (V 60°, Spalt 1)
  assert.ok(Math.abs(W.weldArea("v", 10) - (100 * Math.tan(Math.PI / 6) + 10)) < 1e-9);
  assert.ok(W.weldArea("y", 10, { angle: 60, root: 2, gap: 2 }) < W.weldArea("v", 10, { angle: 60, root: 0, gap: 2 }));
  assert.match(W.weldText({ kind: "k", a: 20, prep: { angle: 45, root: 2, gap: 2 } }), /K-Naht, β 45°, c 2, b 2 \(ISO 9692-1\)/);
  const s = W.weldSymbol({ kind: "k", a: 20, side: "pfeil", prep: { angle: 45, root: 2, gap: 2 } }, [0, 0], [10, -10]);
  assert.ok(!s.lines.some((l) => l.dashed), "K-Naht beidseitig ohne Strichlinie");
  assert.ok(s.texts.some((t) => t.text === "45°") && s.texts.some((t) => t.text === "c2 b2"));
  assert.equal(W.weldRows([{ kind: "v", a: 10, length: 1, prep: { angle: 60, root: 1, gap: 2 } }, { kind: "v", a: 10, length: 1 }]).length, 2);
});

// Körper mit Hülle (und Volumen/Schwerpunkt) für die Plan-Tests
const body = (name, lo, hi, meta = null, volume = null) => ({ name, meta, props: { bbox: [lo, hi], volume: volume ?? (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]), center: lo.map((v, k) => (v + hi[k]) / 2) } });
const anchor = (x, y) => body("Anker 1", [x - 10, y - 10, -300], [x + 10, y + 10, 60], { norm: { kind: "gewindestange", designation: "Gewindestange DIN 976 - M20 x 360 - 4.8" } });
const shift = (x, y) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1];

test("P6 Ankerplan: Stützenfüße mit Achsbezug, Ankerlagen, Höhen, Seiten und CSV", async () => {
  const A = await import("../src/core/ankerplan.js");
  // Stützenfuß-Bauteil: Fußplatte 300 × 300 × 20 auf z 0 … 20, vier Anker bei ±105
  const fuss = [body("Fußplatte", [-150, -150, 0], [150, 150, 20]), ...[[-105, -105], [105, -105], [105, 105], [-105, 105]].map(([x, y]) => anchor(x, y))];
  const occ = [{ name: "Stütze A1", matrix: shift(0, 0), bodies: fuss }, { name: "Stütze A2", matrix: shift(6000, 0), bodies: fuss }, { name: "Stütze B1", matrix: shift(0, 5000), bodies: fuss }];
  const grids = [{ id: "g", x: "6000", y: "5000", lx: "1", ly: "A", x0: 0, y0: 0 }];
  const plan = A.collectFootings(occ, { grids });
  assert.equal(plan.feet.length, 3);
  assert.equal(plan.loose, 0);
  const [f1, f2, f3] = plan.feet;
  assert.equal(f1.axis, "A/1"); assert.equal(f2.axis, "A/2"); assert.equal(f3.axis, "B/1");
  assert.equal(f1.anchors.length, 4);
  assert.deepEqual([f1.plate.L, f1.plate.B, f1.plate.t], [300, 300, 20]);
  assert.equal(f1.uk, 0);
  assert.equal(f1.anchors[0].embed, 300);
  assert.equal(f1.pattern, "±105 × ±105");
  assert.equal(f2.anchors[0].x, 6000 - 105);
  // außerhalb der Achse: Abstand in der Beschriftung
  assert.equal(A.axisRef([6120, -35], grids).label, "A−35/2+120");
  const pages = A.anchorPages(plan, { title: "Halle", grids });
  assert.ok(pages[0].svg.includes("Ankerplan") && pages[0].svg.includes("Maßstab 1:"));
  assert.match(pages[1].html, /Ankerliste/);
  const csv = A.anchorCsv(plan, "Halle");
  assert.equal(csv.trim().split("\r\n").length, 2 + 12);
  // Anker ohne Fußplatte (Dübel) bilden eine eigene Gruppe
  const p2 = A.collectFootings([{ name: "Konsole", matrix: null, bodies: [body("Bolzenanker", [0, 0, -100], [12, 12, 10], { norm: { kind: "bolzenanker", designation: "Bolzenanker M12" } })] }]);
  assert.equal(p2.feet.length, 1); assert.equal(p2.feet[0].plate, null);
});

test("P7 Montageplan: Positionen, Gewicht, Schraubknoten mit verbundenen Teilen", async () => {
  const M = await import("../src/core/montageplan.js");
  const st = { id: "st", name: "Stütze" }, tr = { id: "tr", name: "Träger" };
  const rows = [{ part: st, pos: 1, name: "Stütze", qty: 2, mass: 120 }, { part: tr, pos: 2, name: "Träger", qty: 1, mass: 300 }];
  const bolt = (x, z) => body("Schraube", [x - 8, -8, z - 30], [x + 8, 8, z + 30], { norm: { kind: "hv14399", designation: "HV-Schraube M16 x 60" } });
  const nut = (x, z) => body("Mutter", [x - 12, -12, z + 30], [x + 12, 12, z + 45], { norm: { kind: "hvmutter", designation: "HV-Mutter M16" } });
  const occ = [
    { part: st, name: "Stütze:1", matrix: null, bodies: [body("Stütze", [-100, -100, 0], [100, 100, 3000])] },
    { part: st, name: "Stütze:2", matrix: shift(6000, 0), bodies: [body("Stütze", [-100, -100, 0], [100, 100, 3000])] },
    { part: tr, name: "Träger:1", matrix: null, bodies: [body("Träger", [-100, -100, 3000], [6100, 100, 3300]),
      ...[[-50, 3010], [50, 3010]].flatMap(([x, z]) => [bolt(x, z), nut(x, z)]), ...[[5950, 3010], [6050, 3010]].flatMap(([x, z]) => [bolt(x, z), nut(x, z)])] },
  ];
  const plan = M.montagePlan(rows, occ);
  assert.equal(plan.items.length, 3);
  assert.equal(plan.total, 540);
  assert.equal(plan.heaviest.pos, 2);
  assert.equal(plan.nodes.length, 2, "zwei Knoten (links und rechts)");
  assert.deepEqual(plan.nodes[0].positions, [1, 2]);
  assert.equal(plan.nodes[0].screws, 2);
  assert.deepEqual(plan.nodes[0].parts.map((p) => p.qty), [2, 2]);
  const pages = M.montagePages(plan, { title: "Halle" });
  assert.equal(pages.length, 3);
  assert.ok(pages[0].svg.includes("Grundriss") && pages[0].svg.includes("Vorderansicht"));
  assert.match(M.montageCsv(plan), /K1;.*;1, 2;2;/);
});

test("P8 Anschlagpunkte: Größe nach DIN 580, Lage zum Schwerpunkt, Prüfung, Ringschraube in der Bibliothek", async () => {
  const S = await import("../src/core/anschlagpunkte.js");
  const N = await import("../src/core/normlib.js");
  // 600 kg an 2 Ösen bei 45°: je Öse 300 kg → M20 (830/2 = 415 kg); senkrecht: M16 (700 kg)
  assert.equal(S.eyeSize(600, 2, "45").size, "M20");
  assert.equal(S.eyeSize(600, 2, "0").size, "M12");
  assert.equal(S.eyeSize(600, 4, "45").size, "M16", "3 tragende Stränge à 250 kg");
  assert.equal(S.eyeSize(1e6, 2), null);
  const box = { min: [0, 0, 0], max: [4000, 400, 300] }, cog = [2000, 200, 150];
  const e2 = S.proposeEyes(box, cog, 2);
  assert.deepEqual(e2, [[800, 200, 300], [3200, 200, 300]]);
  assert.equal(S.proposeEyes(box, cog, 4).length, 4);
  let c = S.liftCheck(e2, cog, 600, { size: "M20" });
  assert.deepEqual(c.loads, [300, 300]);
  assert.ok(!c.issues.some((x) => x.level === "Fehler"));
  // Schwerpunkt außerhalb, zu kleine Öse, schief
  c = S.liftCheck([[0, 200, 300], [1000, 200, 300]], cog, 600, { size: "M8" });
  assert.ok(c.issues.some((x) => /außerhalb/.test(x.message)));
  assert.ok(c.issues.some((x) => /Tragfähigkeit/.test(x.message)));
  c = S.liftCheck([[800, 0, 300], [3200, 0, 300]], [2000, 200, 150], 600, { size: "M20" });
  assert.ok(c.tilt > 5 && c.issues.some((x) => /schief/.test(x.message)));
  c = S.liftCheck([[0, 0, 300], [100, 0, 300], [200, 0, 300]], cog, 600, { size: "M20" });
  assert.ok(c.issues.some((x) => /einer Linie/.test(x.message)));
  assert.equal(S.tapHole("M16").core, 14);
  const fam = N.NORM_FAMILIES.din580;
  assert.equal(fam.cat, "schrauben");
  assert.equal(N.familyDesignation(fam, { size: "M16", grade: "C15E" }), "Ringschraube DIN 580 - M16 - C15E");
});
