// Zeichnung (P1-C): Positionsnummern und Detailansicht (ohne Geometrie-Kern)
import test from "node:test";
import assert from "node:assert/strict";
import { projectPoint, partCenter, balloonAnchors, placeBalloons } from "../src/core/balloons.js";
import { clipPolylineToCircle, clipProjection } from "../src/core/clip.js";
import { planAutoDims, viewAxes, visibleHidden } from "../src/core/autodims.js";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("Projektion wie Kernel-Kamera (Werte aus replicad-Messung)", () => {
  const p = [100, 20, 30];
  // gemessen mit K.projectView an einem kleinen Würfel bei p
  const cases = [[[0, -1, 0], [0, 0, 1], [-100, 30]], [[0, 0, 1], [0, 1, 0], [-100, 20]], [[1, -1, 1], [0, 0, 1], [-84.85, -8.16]]];
  for (const [dir, up, exp] of cases) {
    const [x, y] = projectPoint(p, dir, up);
    near(x, exp[0], 0.01); near(y, exp[1], 0.01);
  }
});

test("Anker: erste sichtbare Komponente je Bauteil, Platzierung angewendet", () => {
  const res = { a: { bodies: [{ props: { bbox: [[0, 0, 0], [100, 20, 10]] } }, { props: { bbox: [[0, 0, 10], [100, 20, 30]] } }] }, b: { bodies: [{ props: { bbox: [[-5, -5, 0], [5, 5, 50]] } }] } };
  assert.deepEqual(partCenter(res.a), [50, 10, 15]);
  assert.equal(partCenter({ bodies: [] }), null);
  const asm = { components: [
    { part: "a", pos: [0, 0, 0], rot: [0, 0, 0], hidden: true },
    { part: "a", pos: [1000, 0, 0], rot: [0, 0, 90] },
    { part: "a", pos: [0, 0, 0], rot: [0, 0, 0] },
    { part: "b", pos: [0, 0, 100], rot: [0, 0, 0] },
    { part: "fehlt", pos: [0, 0, 0], rot: [0, 0, 0] },
  ] };
  const an = balloonAnchors(asm, (id) => res[id]);
  assert.equal(an.length, 2);
  assert.equal(an[0].part, "a");
  // (50,10,15) um Z 90° → (-10,50,15), dann +1000 in X
  [990, 50, 15].forEach((v, k) => near(an[0].p3[k], v, 1e-9));
  assert.deepEqual(an[1].p3, [0, 0, 125]);
});

test("Kreise außerhalb der Ansicht und ohne Überlappung", () => {
  const box = { x0: 100, y0: 100, x1: 200, y1: 160 };
  // fünf Anker fast an derselben Stelle → müssen auseinander
  const anchors = [0, 1, 2, 3, 4].map((i) => ({ key: "p" + i, at: [190 + i * 0.1, 150] }));
  const pos = placeBalloons(anchors, box, { r: 4 });
  const pts = [...pos.values()];
  for (const [x, y] of pts) assert.ok(x < box.x0 - 4 || x > box.x1 + 4 || y < box.y0 - 4 || y > box.y1 + 4, `Kreis in der Ansicht: ${x},${y}`);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= 8.5, "Kreise überlappen");
  // Anker rechts unten → Kreis rechts unten von der Mitte
  const one = placeBalloons([{ key: "x", at: [200, 160] }], box).get("x");
  assert.ok(one[0] > 150 && one[1] > 130);
});

// ---------- Detailansicht ----------

test("Detail: Linien am Kreis abschneiden", () => {
  const c = [0, 0], r = 10;
  // durchgehende Gerade → ein Stück von -10 bis 10
  const [a] = clipPolylineToCircle([[-20, 0], [20, 0]], c, r);
  assert.deepEqual(a.map((p) => p.map((x) => Math.round(x * 1e9) / 1e9)), [[-10, 0], [10, 0]]);
  // ganz innen bleibt unverändert
  assert.deepEqual(clipPolylineToCircle([[-1, -1], [1, 1], [2, 0]], c, r), [[[-1, -1], [1, 1], [2, 0]]]);
  // außen → nichts; Tangente → nichts
  assert.deepEqual(clipPolylineToCircle([[20, 20], [30, 20]], c, r), []);
  assert.deepEqual(clipPolylineToCircle([[-20, 10], [20, 10]], c, r), []);
  // raus und wieder rein → zwei Stücke
  const parts = clipPolylineToCircle([[0, 0], [0, 20], [5, 20], [5, 0]], c, r);
  assert.equal(parts.length, 2);
});

test("Detail: Projektion zuschneiden, nur ganz innen liegende Kreise bleiben", () => {
  const p = { visible: [[[-50, 0], [50, 0]]], hidden: [[[0, -50], [0, 50]]], arcs: [{ cx: 2, cy: 2, r: 3, full: true }, { cx: 9, cy: 0, r: 3, full: true }], hiddenArcs: [] };
  const d = clipProjection(p, [0, 0], 10);
  assert.equal(d.visible.length, 1);
  assert.equal(d.hidden.length, 1);
  assert.equal(d.arcs.length, 1);
  assert.deepEqual(d.bbox, { x0: -10, y0: -10, x1: 10, y1: 10 });
});

test("Ansichtsachsen der Normalansichten", () => {
  assert.deepEqual(viewAxes([0, 1, 0], [0, 0, 1]), ["X", "Z"]); // vorne
  assert.deepEqual(viewAxes([0, 0, -1], [0, 1, 0]), ["X", "Y"]); // oben
  assert.deepEqual(viewAxes([1, 0, 0], [0, 0, 1]), ["Y", "Z"]); // links
  assert.deepEqual(viewAxes([-1, 1, -1], [0, 0, 1]), [null, "Z"]); // schräg: nur senkrecht eindeutig
});

test("Hauptmaße: jedes Maß nur einmal, Bohrungen mit Anzahl und Lagemaßen", () => {
  // Rechteckrohr 50 × 50 × 20 mit fünf Bohrungen Ø6,8 oben (wie im Fehlerbild)
  const holes = [[8, 40], [38, 40], [15, 25], [38, 25], [25, 10]];
  const arc = ([cx, cy]) => ({ cx, cy, r: 3.4, full: true });
  const views = [
    { id: "vorne", axes: ["X", "Z"], bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }, arcs: [] },
    { id: "oben", axes: ["X", "Y"], bbox: { x0: 0, y0: 0, x1: 50, y1: 50 }, arcs: [...holes.map(arc), ...holes.map(arc)] }, // doppelt: Ober- und Unterkante
    { id: "links", axes: ["Y", "Z"], bbox: { x0: -50, y0: 0, x1: 0, y1: 20 }, arcs: [] },
  ];
  const dims = planAutoDims(views);
  const total = dims.filter((m) => m.axis);
  assert.deepEqual(total.map((m) => [m.view, m.axis]), [["vorne", "X"], ["vorne", "Z"], ["oben", "Y"]]);
  assert.equal(dims.filter((m) => m.view === "links").length, 0, "Seitenansicht wiederholt nichts");
  const dia = dims.filter((m) => m.kind === "dia");
  assert.equal(dia.length, 1);
  assert.equal(dia[0].count, 5);
  const pos = dims.filter((m) => !m.axis && m.kind !== "dia");
  const xs = pos.filter((m) => m.kind === "h").map((m) => m.p2[0]);
  const ys = pos.filter((m) => m.kind === "v").map((m) => m.p2[1]);
  assert.deepEqual(xs, [8, 15, 25, 38]);
  assert.deepEqual(ys, [10, 25, 40]);
  assert.ok(pos.every((m) => m.view === "oben"));
  // gestaffelt, damit sich die Maßlinien nicht überdecken
  assert.equal(new Set(pos.filter((m) => m.kind === "h").map((m) => m.off)).size, 4);
  // zweiter Aufruf mit den belegten Maßen ergänzt nichts Doppeltes
  const used = { axes: new Set(["X", "Y", "Z"]), radii: new Set([3400]) };
  assert.equal(planAutoDims([views[2]], used).length, 0);
});

test("Hauptmaße: Rundrohr von vorne ohne Lagemaße", () => {
  const dims = planAutoDims([{ id: "v", axes: ["Y", "Z"], bbox: { x0: -20, y0: -20, x1: 20, y1: 20 }, arcs: [{ cx: 0, cy: 0, r: 20, full: true }, { cx: 0, cy: 0, r: 17, full: true }] }]);
  assert.equal(dims.filter((m) => m.kind === "dia").length, 2);
  assert.equal(dims.filter((m) => !m.axis && m.kind !== "dia").length, 0);
});

test("Kurze verdeckte Linien entfallen (Bohrung durch dünne Wand)", () => {
  const pl = [[[0, 18.5], [0, 20]], [[0, 0], [0, 20]]];
  assert.equal(visibleHidden(pl, 2).length, 1); // 1,5 mm × 2 = 3 mm < ein Strich mit Lücke
  assert.equal(visibleHidden(pl, 5).length, 2);
});
