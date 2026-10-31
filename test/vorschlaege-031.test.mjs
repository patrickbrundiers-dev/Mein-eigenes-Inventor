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
