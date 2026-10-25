// Zeichnung (P1-C): Positionsnummern und Detailansicht (ohne Geometrie-Kern)
import test from "node:test";
import assert from "node:assert/strict";
import { projectPoint, partCenter, balloonAnchors, placeBalloons } from "../src/core/balloons.js";
import { clipPolylineToCircle, clipProjection } from "../src/core/clip.js";
import { planAutoDims, viewAxes, visibleHidden, layoutAutoDims, ROW_FIRST, ROW_STEP, holeSpecs, holeText, dimLabel, profileSpec, wallThickness, circlesFromLines, chooseViews, viewHasInfo } from "../src/core/autodims.js";

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
  assert.ok(pos.every((m) => m.view === "oben"));
  // vier Lagemaße in X: Koordinatenbemaßung mit Nullpunkt an der linken Kante
  const xs = pos.filter((m) => m.kind === "h");
  assert.ok(xs.every((m) => m.ord));
  assert.deepEqual(xs.map((m) => m.p2[0]), [0, 8, 15, 25, 38]);
  // Y 10 / 25 / 40: gleiche Teilung, mittig -> „2× 15 (=30)“
  const ys = pos.filter((m) => m.kind === "v");
  assert.deepEqual(ys.map(dimLabel), ["2× 15 (=30)"]); // mittig: kein Randmaß
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

// Ansicht im Maßstab s, Mitte der bbox bei (x, y) auf dem Blatt (wie DrawingMode.viewXf)
function sheetView(bbox, x, y, s, arcs = []) {
  const cu = (bbox.x0 + bbox.x1) / 2, cv = (bbox.y0 + bbox.y1) / 2;
  const to = (u, w) => [x + (u - cu) * s, y - (w - cv) * s];
  const [x0, y0] = to(bbox.x0, bbox.y1), [x1, y1] = to(bbox.x1, bbox.y0);
  return { to, rect: [x0, y0, x1, y1], scale: s, circles: arcs };
}
const hits = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;
function dimRect(m, v) {
  const A = v.to(...m.p1), B = v.to(...m.p2);
  if (m.kind === "h") { const y = (m.off >= 0 ? Math.max(A[1], B[1]) : Math.min(A[1], B[1])) + m.off; return [Math.min(A[0], B[0]), y - 4.5, Math.max(A[0], B[0]), y + 1]; }
  const x = (m.off >= 0 ? Math.max(A[0], B[0]) : Math.min(A[0], B[0])) + m.off; return [x - 4.5, Math.min(A[1], B[1]), x + 4.5, Math.max(A[1], B[1])];
}

test("Maßplatzierung: kurze Maße innen, lange außen, feste Reihenabstände", () => {
  const holes = [[8, 40], [38, 40], [15, 25], [38, 25], [25, 10]];
  const arcs = holes.map(([cx, cy]) => ({ cx, cy, r: 3.4, full: true }));
  const bbox = { x0: 0, y0: 0, x1: 50, y1: 50 };
  const views = { oben: sheetView(bbox, 150, 150, 2, arcs) };
  const dims = planAutoDims([{ id: "oben", axes: ["X", "Y"], bbox, arcs }]);
  layoutAutoDims(dims, views, { frame: [20, 10, 410, 287] });
  const R = views.oben.rect;
  for (const kind of ["h", "v"]) {
    const lin = dims.filter((m) => m.kind === kind);
    const c = kind === "h" ? 1 : 0;
    const bySide = new Map();
    for (const m of lin.filter((x) => !x.ord)) {
      const r = dimRect(m, views.oben);
      const line = kind === "h" ? r[3] - 1 : (r[0] + r[2]) / 2;
      const dist = line > R[c + 2] ? line - R[c + 2] : R[c] - line;
      const side = line > R[c + 2] ? "max" : "min";
      if (!bySide.has(side)) bySide.set(side, []);
      bySide.get(side).push({ len: Math.abs(m.p2[1 - c] - m.p1[1 - c]), dist });
    }
    for (const list of bySide.values()) {
      list.sort((a, b) => a.dist - b.dist);
      list.forEach((it, i) => assert.ok(Math.abs(it.dist - (list[0].dist + ROW_STEP * i)) < 1e-6 && list[0].dist >= ROW_FIRST, `Reihe ${i}: ${it.dist}`));
      for (let i = 1; i < list.length; i++) assert.ok(list[i].len >= list[i - 1].len, "längeres Maß liegt außen");
    }
  }
});

test("Maßplatzierung: Maße weichen Nachbaransicht und Schriftfeld aus", () => {
  // Vorderansicht 50 × 20 direkt über der Draufsicht 50 × 50 (Abstand 12 mm): Lagemaße unten an der Vorderansicht hätten keinen Platz
  const holes = [[10, 10], [40, 10]];
  const arcs = holes.map(([cx, cy]) => ({ cx, cy, r: 3, full: true }));
  const front = { x0: 0, y0: 0, x1: 50, y1: 20 }, top = { x0: 0, y0: 0, x1: 50, y1: 50 };
  const views = { vorne: sheetView(front, 100, 60, 2, arcs), oben: sheetView(top, 100, 142, 2) };
  const dims = planAutoDims([{ id: "vorne", axes: ["X", "Z"], bbox: front, arcs }, { id: "oben", axes: ["X", "Y"], bbox: top, arcs: [] }]);
  layoutAutoDims(dims, views, { frame: [20, 10, 410, 287], obstacles: [[220, 229, 410, 287]] });
  for (const m of dims.filter((x) => x.kind === "h" || x.kind === "v")) {
    const r = dimRect(m, views[m.view]);
    for (const [id, v] of Object.entries(views)) if (id !== m.view) assert.ok(!hits(r, v.rect), `Maß von ${m.view} liegt über ${id}`);
  }
  // Durchmesser-Text liegt außerhalb der Ansicht und kreuzt keine andere Bohrung
  const dia = dims.find((m) => m.kind === "dia");
  assert.ok(dia && Number.isFinite(dia.angle));
});

test("Maßplatzierung: Durchmesser-Hinweislinie läuft nicht durch Nachbarbohrung", () => {
  // Bohrung unten links, Nachbar genau oben rechts (in Richtung der Standard-Hinweislinie)
  const arcs = [{ cx: 10, cy: 10, r: 3, full: true }, { cx: 20, cy: 20, r: 3, full: true }];
  const bbox = { x0: 0, y0: 0, x1: 60, y1: 60 };
  const views = { v: sheetView(bbox, 200, 140, 2, arcs) };
  const dims = [{ view: "v", kind: "dia", circle: { cx: 10, cy: 10, r: 3 }, angle: -Math.PI / 4 }];
  layoutAutoDims(dims, views, { frame: [20, 10, 410, 287] });
  assert.notEqual(dims[0].angle, -Math.PI / 4);
});

test("Bohrungsangaben aus dem Feature: Gewinde, Tiefe, Senkung", () => {
  const ev = (x) => Number(String(x).replace("Dicke", "10"));
  const specs = holeSpecs([
    { type: "hole", thread: "M8", extent: "through" },
    { type: "hole", diameter: "11", extent: "through" },
    { type: "hole", diameter: "5", extent: "depth", depth: "12" },
    { type: "hole", diameter: "6.6", extent: "through", sink: "senkung", sinkDiameter: "12", sinkAngle: "90" },
    { type: "hole", diameter: "9", extent: "depth", depth: "Dicke", sink: "flach", sinkDiameter: "15", sinkDepth: "8.6" },
    { type: "hole", diameter: "7", suppressed: true },
    { type: "extrude" },
  ], ev);
  assert.deepEqual(specs.map((s) => holeText(s.hole, 2)), ["2× M8", "2× Ø11 durch", "2× Ø5, 12 tief", "2× Ø6,6 durch – Senkung Ø12 × 90°", "2× Ø9, 10 tief – Senkung Ø15, 8,6 tief"]);
  assert.equal(specs[0].r, 3.4, "Kernloch M8 = Ø6,8");
});

test("Hauptmaße: Kernlochkreise werden als Gewinde angegeben, Senkungskreis ohne eigenes Maß", () => {
  const holes = holeSpecs([{ type: "hole", thread: "M8" }, { type: "hole", diameter: "6.6", sink: "senkung", sinkDiameter: "12", sinkAngle: "90" }], Number);
  const arcs = [[10, 10], [40, 10], [10, 40], [40, 40], [25, 25]].map(([cx, cy]) => ({ cx, cy, r: 3.4, full: true }));
  arcs.push({ cx: 25, cy: 45, r: 3.3, full: true }, { cx: 25, cy: 45, r: 6, full: true });
  const dims = planAutoDims([{ id: "oben", axes: ["X", "Y"], bbox: { x0: 0, y0: 0, x1: 50, y1: 50 }, arcs, holes }]);
  const dia = dims.filter((m) => m.kind === "dia");
  assert.deepEqual(dia.map(dimLabel).sort(), ["5× M8", "Ø6,6 durch – Senkung Ø12 × 90°"]);
});

test("Hauptmaße: mehrdeutige Bohrungs-Features fallen auf das reine Ø zurück", () => {
  const holes = holeSpecs([{ type: "hole", diameter: "8", extent: "through" }, { type: "hole", diameter: "8", extent: "depth", depth: "5" }], Number);
  const dims = planAutoDims([{ id: "v", axes: ["X", "Y"], bbox: { x0: 0, y0: 0, x1: 50, y1: 50 }, arcs: [{ cx: 20, cy: 20, r: 4, full: true }], holes }]);
  assert.equal(dimLabel(dims.find((m) => m.kind === "dia")), "Ø8");
});

test("Bohrungsbilder: symmetrisch, Lochkreis, Koordinatenmaße", () => {
  const bb = { x0: 0, y0: 0, x1: 300, y1: 200 };
  // Grundplatte: vier Bohrungen symmetrisch -> Abstände 250 und 150 statt Lagemaße vom Rand
  const plate = [[25, 25], [275, 25], [25, 175], [275, 175]].map(([cx, cy]) => ({ cx, cy, r: 5.5, full: true }));
  const d1 = planAutoDims([{ id: "v", axes: [null, null], bbox: bb, arcs: plate }]);
  assert.deepEqual(d1.filter((m) => m.kind !== "dia").map(dimLabel), ["250", "150"]);
  // Flansch Ø100 mit 6 Bohrungen auf Lochkreis Ø70
  const fl = [{ cx: 0, cy: 0, r: 50, full: true }, { cx: 0, cy: 0, r: 20, full: true }];
  for (let i = 0; i < 6; i++) fl.push({ cx: 35 * Math.cos((i * Math.PI) / 3), cy: 35 * Math.sin((i * Math.PI) / 3), r: 4.5, full: true });
  const d2 = planAutoDims([{ id: "v", axes: [null, null], bbox: { x0: -50, y0: -50, x1: 50, y1: 50 }, arcs: fl }]);
  assert.deepEqual(d2.map(dimLabel).sort(), ["6× Ø9", "LK Ø70, 6× 60°", "Ø100", "Ø40"]);
  // vier Bohrungen im Quadrat bleiben ein Raster
  const sq = [[10, 10], [40, 10], [10, 40], [40, 40]].map(([cx, cy]) => ({ cx, cy, r: 3, full: true }));
  const d3 = planAutoDims([{ id: "v", axes: [null, null], bbox: { x0: 0, y0: 0, x1: 50, y1: 50 }, arcs: sq }]);
  assert.ok(!d3.some((m) => m.pcd));
  assert.deepEqual(d3.filter((m) => m.kind !== "dia").map(dimLabel), ["30", "30"]);
});

test("Koordinatenmaße teilen sich eine Reihe, weitere Maße liegen dahinter", () => {
  const arcs = [5, 12, 20, 33, 41].map((x) => ({ cx: x, cy: 10, r: 1, full: true }));
  const bbox = { x0: 0, y0: 0, x1: 60, y1: 30 };
  const views = { v: sheetView(bbox, 150, 100, 2, arcs) };
  const dims = planAutoDims([{ id: "v", axes: ["X", "Y"], bbox, arcs }]);
  layoutAutoDims(dims, views, { frame: [20, 10, 410, 287] });
  const ord = dims.filter((m) => m.ord);
  assert.equal(ord.length, 6);
  const lines = ord.map((m) => dimRect(m, views.v)[3]);
  assert.ok(lines.every((y) => Math.abs(y - lines[0]) < 1e-6), "eine gemeinsame Reihe");
});

test("Profilteil: Profilangabe statt Querschnittsmaßen, nur die Länge wird bemaßt", () => {
  const feats = [{ type: "profile", section: "rechteck", dims: { B: "50", H: "20", t: "2", r: "4" }, length: "L", axis: "Y" }, { type: "hole", thread: "M8" }];
  const prof = profileSpec(feats, (x) => (x === "L" ? 50 : Number(x)));
  assert.deepEqual(prof, { text: "Rechteckrohr 50x20x2 – L = 50", axis: "Y", cross: ["X", "Z"] });
  assert.equal(profileSpec([...feats, { type: "extrude" }], Number), null, "weiterer Körper: kein reines Profilteil");
  const rr = [{ cx: 0, cy: 0, r: 24.15, full: true }, { cx: 0, cy: 0, r: 21.55, full: true }];
  const views = [
    { id: "stirn", axes: ["X", "Z"], bbox: { x0: -24.15, y0: -24.15, x1: 24.15, y1: 24.15 }, arcs: rr },
    { id: "laenge", axes: ["Y", "Z"], bbox: { x0: 0, y0: -24.15, x1: 400, y1: 24.15 }, arcs: [] },
  ];
  const dims = planAutoDims(views, { profile: { text: "Rohr 48,3x2,6 – L = 400", axis: "Y", cross: ["X", "Z"] } });
  assert.deepEqual(dims.map((m) => [m.view, m.axis || m.kind]), [["laenge", "Y"]]);
});

test("Wandstärke eines Hohlprofils aus den Kanten, nicht bei gerundeten Außenkanten", () => {
  const b = { x0: 0, y0: 0, x1: 50, y1: 20 };
  const inner = [[[2, 2], [48, 2]], [[48, 2], [48, 18]], [[48, 18], [2, 18]], [[2, 18], [2, 2]]];
  const outer = [[[0, 0], [50, 0], [50, 20], [0, 20], [0, 0]]];
  assert.equal(wallThickness(b, [...outer, ...inner]), 2);
  assert.equal(wallThickness(b, [...outer, [[3, 2], [3, 18]], ...inner]), 2, "nächste Innenkante zählt");
  assert.equal(wallThickness(b, [...outer, ...inner], [{ cx: 2, cy: 2, r: 2, full: false }]), null, "Rundung R2 an der Ecke");
  assert.equal(wallThickness(b, outer), null);
  const dims = planAutoDims([{ id: "v", axes: ["X", "Z"], bbox: b, arcs: [], lines: [...outer, ...inner] }]);
  assert.deepEqual(dims.filter((m) => m.wall).map(dimLabel), ["2"]);
});

test("Profilangabe als Hinweis frei neben der Ansicht", () => {
  const bbox = { x0: 0, y0: 0, x1: 50, y1: 20 };
  const views = { v: sheetView(bbox, 100, 60, 2), u: sheetView(bbox, 100, 125, 2) };
  const notes = [{ view: "v", text: "Rechteckrohr 50x20x2 – L = 50" }];
  layoutAutoDims([], views, { frame: [20, 10, 410, 287], notes });
  const n = notes[0];
  const box = [n.x, n.y - 4.5, n.x + n.text.length * 2.1, n.y + 1];
  for (const v of Object.values(views)) assert.ok(!hits(box, v.rect));
});

test("Bohrung auf der Mittellinie bekommt kein Lagemaß quer zur Achse", () => {
  const dims = planAutoDims([{ id: "v", axes: [null, null], bbox: { x0: -13.9, y0: -24, x1: 400, y1: 24 }, arcs: [{ cx: 200, cy: 0, r: 6.5, full: true }] }]);
  assert.deepEqual(dims.filter((m) => m.kind !== "dia").map((m) => m.kind), ["h"]);
});

test("Kreis aus vielen kurzen Kantenstücken erkennen (Bohrung im Rundrohr)", () => {
  const pieces = [];
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * 2 * Math.PI, a1 = ((i + 1.1) / 40) * 2 * Math.PI; // Stücke überlappen leicht, Endpunkte passen nicht genau
    pieces.push([0, 0.5, 1].map((t) => [200 + 6.5 * Math.cos(a0 + t * (a1 - a0)), 6.5 * Math.sin(a0 + t * (a1 - a0))]));
  }
  pieces.push([[0, -24], [400, -24]], [[0, 24], [400, 24]]);
  assert.deepEqual(circlesFromLines(pieces, 200), [{ cx: 200, cy: 0, r: 6.5, full: true }]);
  assert.deepEqual(circlesFromLines(pieces.slice(0, 20), 200), [], "Halbkreis ist keine Bohrung");
});

test("Ansichtswahl: Platte ohne Seitenansicht, Profil ohne Stirnansicht, Winkel mit allen nötigen", () => {
  const rect = (w, h) => ({ bbox: { x0: 0, y0: 0, x1: w, y1: h }, visible: [[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]], arcs: [] });
  const axes = { front: ["X", "Z"], top: ["X", "Y"], left: ["Y", "Z"] };
  // Platte 300 × 200 × 10 mit Bohrungen: Draufsicht zeigt die Bohrungen, Seitenansicht nur ein Rechteck
  const top = rect(300, 200); top.arcs = [{ cx: 25, cy: 25, r: 5.5, full: true }];
  assert.deepEqual(chooseViews({ front: rect(300, 10), top, left: rect(200, 10) }, axes), ["front", "top"]);
  // Klotz ohne Merkmale: Breite/Höhe vorne, Tiefe braucht eine zweite Ansicht
  assert.deepEqual(chooseViews({ front: rect(50, 20), top: rect(50, 30), left: rect(30, 20) }, axes), ["front", "top"]);
  // Rohrprofil entlang X: Stirnansicht zeigt nur den Querschnitt aus der Profilangabe
  const end = { bbox: { x0: -24, y0: -24, x1: 24, y1: 24 }, visible: [], arcs: [{ cx: 0, cy: 0, r: 24, full: true }, { cx: 0, cy: 0, r: 21.4, full: true }] };
  const prof = { axis: "X", cross: ["Y", "Z"] };
  assert.deepEqual(chooseViews({ front: rect(400, 48), top: rect(400, 48), left: end }, axes, prof), ["front"]);
  // Stufe in der Seitenansicht (L-Kontur) ist eigene Information
  const L = { bbox: { x0: 0, y0: 0, x1: 30, y1: 20 }, visible: [[[0, 0], [30, 0], [30, 5], [5, 5], [5, 20], [0, 20], [0, 0]]], arcs: [] };
  assert.ok(viewHasInfo(L));
  assert.deepEqual(chooseViews({ front: rect(50, 20), top: rect(50, 30), left: L }, axes), ["front", "left"]);
});

test("Profilangabe nennt die Zuschnittlänge (Gehrung: Außenlänge wie in der Zuschnittliste)", () => {
  const feats = [{ type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "1000", axis: "X", miterStart: "45", miterEnd: "45" }];
  assert.equal(profileSpec(feats, Number, 1018.83).text, "Quadratrohr 40x40x3 – L = 1018,8");
  assert.equal(profileSpec(feats, Number).text, "Quadratrohr 40x40x3 – L = 1000", "ohne gebautes Teil: Länge des Features");
});

// ---------- Fertigungsmappe (E3) ----------
import { mappeHtml, listPages, mappeName } from "../src/core/mappe.js";
import { zipFiles } from "../src/core/xlsx.js";

test("Fertigungsmappe: jede Seite behält ihr Blattformat, Listen auf A4 mit Folgeseiten", () => {
  const html = mappeHtml([
    { svg: '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>', width: 420, height: 297 },
    { svg: "<svg/>", width: 297, height: 210 },
    { svg: "<svg/>", width: 420, height: 297 },
  ], { title: "Mappe <A>" });
  assert.match(html, /@page f0\{size:420mm 297mm;margin:0\}@page f1\{size:297mm 210mm;margin:0\}/);
  assert.equal((html.match(/class="pg"/g) || []).length, 3);
  assert.equal((html.match(/page:f0/g) || []).length, 2);
  assert.ok(!html.includes("<?xml"), "XML-Kopf der SVGs entfällt");
  assert.match(html, /<title>Mappe &lt;A&gt;<\/title>/);

  const bom = Array.from({ length: 50 }, (_, i) => ({ pos: i + 1, name: `Teil <${i}>`, number: "", qty: 2, material: "S235", finish: "", mass: 1.5 }));
  const cut = [{ pos: 1, section: "QR 40x3", length: 1000, qty: 4, miters: [45, 45], material: "S235", mass: 3.2, parts: "Rahmen" }];
  const pages = listPages({ title: "Tor", number: "T-1", bom, cut });
  assert.equal(pages.length, 3, "50 Zeilen Stückliste = 2 Seiten, Zuschnitt 1 Seite");
  assert.ok(pages.every((p) => p.width === 210 && p.height === 297));
  assert.match(pages[0].html, /Stückliste \(1\/2\)/);
  assert.ok(!pages[0].html.includes("<tfoot>") && pages[1].html.includes("<tfoot>"), "Summe nur auf der letzten Seite");
  assert.match(pages[1].html, />150</, "Summe 50 × 2 × 1,5 kg");
  assert.match(pages[0].html, /Teil &lt;0&gt;/);
  assert.match(pages[2].html, /45° \/ 45°/);
  assert.deepEqual(listPages({ bom: [], cut: [] }), []);
  assert.equal(mappeName('Tor 3/4: "A"'), "Tor_3_4_A_");
});

test("ZIP: Einträge aus Text und Bytes, gültige Signaturen", () => {
  const z = zipFiles([["a.txt", "Hallo"], ["Ordner/b.bin", new Uint8Array([1, 2, 3])]]);
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(z.length - 22 + 10, true), 2);
  assert.ok(new TextDecoder().decode(z).includes("Ordner/b.bin"));
});

// ---------- Angebotsblatt (E4) ----------
import { angebotPage, priceLines, parsePrice, money } from "../src/core/angebot.js";

test("Angebotsblatt: Preis von Hand, MwSt., Fakten aus dem Modell", () => {
  assert.equal(parsePrice("1.234,50 €"), 1234.5);
  assert.equal(parsePrice("1234.5"), 1234.5);
  assert.equal(parsePrice("1.000"), 1000);
  assert.ok(Number.isNaN(parsePrice("")) && Number.isNaN(parsePrice("viel")));
  assert.equal(money(2938.11), "2.938,11 €");
  const p = priceLines({ qty: 2, price: "1.234,50", vat: 19 });
  assert.equal(p.net, 2469);
  assert.equal(money(p.gross), "2.938,11 €");
  assert.equal(priceLines({ price: "" }), null);
  const pg = angebotPage({ firma: "Metallbau <M>\nHauptstr. 1", kunde: "Frau Muster", nummer: "A-17", betreff: "Angebot: Tor", qty: 2, price: "1.234,50", vat: 19,
    dims: [3000, 40, 1800], materials: ["S235JR"], finishes: ["tZn + pulver RAL 7016"], mass: 84.4, positions: 5, image: "data:image/png;base64,AAAA" });
  assert.equal(pg.width, 210);
  assert.match(pg.html, /Metallbau &lt;M&gt;<br>Hauptstr\. 1/);
  assert.match(pg.html, /3\.000 × 40 × 1\.800 mm/);
  assert.match(pg.html, /84 kg/);
  assert.match(pg.html, /Angebot Nr\. A-17/);
  assert.match(pg.html, /Gesamtbetrag<\/td><td class="n">2\.938,11 €/);
  assert.match(pg.html, /<img src="data:image\/png;base64,AAAA"/);
  const leer = angebotPage({ qty: 3, price: "" });
  assert.match(leer.html, /3 × Einzelpreis netto<\/td><td class="n"><\/td>/, "ohne Preis bleibt das Feld zum Eintragen");
  assert.match(leer.html, /Oberfläche<\/td><td>roh/);
});

test("Fertigungsmappe: Biegeliste je Rohr", () => {
  const pages = listPages({ bends: [{ name: "Handlauf – Rohr", bends: [{ straight: 300, rotation: 0, angle: 90, arc: 157.1 }, { straight: 500, rotation: 180, angle: 45, arc: 78.5 }], last: 200, length: 1235.6 }] });
  assert.equal(pages.length, 1);
  assert.match(pages[0].html, /<h1>Biegeliste<\/h1>/);
  assert.match(pages[0].html, /Handlauf – Rohr – Abwicklung 1\.235,6 mm/);
  assert.match(pages[0].html, /<td class="n">Ende<\/td><td class="n">200<\/td>/);
});

test("Bohrungstabelle: Kennbuchstaben je Ø, Lage ab Nullpunkt, Gewinde aus dem Feature", async () => {
  const { holeTable, holeTableCells } = await import("../src/core/zeichnung.js");
  const circles = [{ cx: 20, cy: 20, r: 5.5 }, { cx: 280, cy: 20, r: 5.5 }, { cx: 280, cy: 20, r: 5.5 }, { cx: 150, cy: 100, r: 3.4 }, { cx: 150, cy: 100, r: 4 }];
  const specs = [{ r: 3.4, hole: { d: 6.8, thread: "M8", depth: 15 } }];
  const t = holeTable(circles, specs, [0, 0]);
  assert.deepEqual(t.groups.map((g) => [g.tag, g.count]), [["A", 1], ["B", 2]], "Doppelte und Gewinde-Außenkreis zählen nicht");
  assert.equal(t.groups[0].desc, "M8, 15 tief");
  assert.equal(t.groups[1].desc, "Ø11");
  assert.deepEqual(t.rows.map((r) => r.tag), ["A1", "B1", "B2"]);
  const cells = holeTableCells(holeTable(circles, [], [10, 10]));
  assert.deepEqual(cells[0], ["Pos.", "X", "Y", "Bohrung"]);
  assert.deepEqual(cells[2], ["B1", "10", "10", "Ø11"]);
  // gleiche Ø, aber verschiedene Angaben (Durchgang und Sackloch): nur der Ø, keine falsche Tiefe
  const amb = holeTable(circles, [{ r: 5.5, hole: { d: 11 } }, { r: 5.5, hole: { d: 11, depth: 8 } }], [0, 0]);
  assert.equal(amb.groups[1].desc, "Ø11");
  // nur Kreise mit Bohrungsachse aus dem Modell (Wellenende/Zapfen fällt weg); ohne Angaben alle
  const { holeCircles } = await import("../src/core/zeichnung.js");
  assert.deepEqual(holeCircles(circles, [{ c: [20, 20] }]).map((c) => c.cx), [20]);
  assert.equal(holeCircles(circles, []).length, 0);
  assert.equal(holeCircles(circles, null).length, circles.length);
});

test("Hilfsansicht: Blick senkrecht auf die schräge Kante, von außen", async () => {
  const { auxiliaryCamera, nearestSegment } = await import("../src/core/zeichnung.js");
  const cam = { dir: [0, 1, 0], up: [0, 0, 1] }; // Vorderansicht: u = X, v = Z
  const c = auxiliaryCamera(cam, [0, 100], [100, 0], [0, 0]);
  const s = Math.SQRT1_2;
  [-s, 0, -s].forEach((x, i) => near(c.dir[i], x, 1e-9));
  near(c.dir[0] * c.up[0] + c.dir[1] * c.up[1] + c.dir[2] * c.up[2], 0, 1e-9);
  assert.ok(c.up[2] > 0, "Kante zeigt nach oben");
  assert.equal(auxiliaryCamera(cam, [0, 0], [100, 0], [50, 50]), null, "waagerechte Kante");
  const seg = nearestSegment([[[0, 0], [10, 0], [10, 10]]], [9, 5], 2);
  assert.deepEqual([seg.a, seg.b], [[10, 0], [10, 10]]);
  assert.equal(nearestSegment([[[0, 0], [10, 0]]], [5, 5], 2), null);
});

test("Hinweise: Bohrung, Fase oder frei; Änderungsindex", async () => {
  const { noteSuggestion, nextRevision, validateRevision, currentRevision } = await import("../src/core/zeichnung.js");
  const circles = [{ cx: 0, cy: 0, r: 5.5 }, { cx: 50, cy: 0, r: 5.5 }];
  assert.equal(noteSuggestion([5.4, 0], { circles }).text, "2× Ø11");
  assert.equal(noteSuggestion([0, 0], { circles, specs: [{ r: 5.5, hole: { d: 11 } }] }).text, "2× Ø11 durch");
  const lines = [[[100, 0], [102, 2]]];
  assert.deepEqual(noteSuggestion([101, 1], { lines, chamfers: [2] }), { kind: "fase", text: "2 × 45°" });
  assert.equal(noteSuggestion([101, 1], { lines, chamfers: [3] }).kind, "frei");
  assert.equal(nextRevision([{ rev: "A" }, { rev: "B" }]), "C");
  assert.equal(nextRevision([]), "A");
  assert.equal(nextRevision([], "A"), "B", "erste Änderung nach dem Schriftfeld-Index");
  assert.equal(nextRevision([{ rev: "B" }], "A"), "C", "nach B folgt C, nicht das freie A");
  assert.equal(nextRevision([{ rev: "A" }, { rev: "c" }]), "D");
  assert.equal(noteSuggestion([0, 0], { circles, specs: [{ r: 5.5, hole: { d: 11 } }, { r: 5.5, hole: { d: 11, depth: 8 } }] }).text, "2× Ø11", "mehrdeutig: nur Ø");
  assert.deepEqual(validateRevision({ rev: " b ", text: " Bohrung geändert ", datum: "25.10.2026" }).value, { rev: "B", datum: "25.10.2026", text: "Bohrung geändert", name: "" });
  assert.equal(validateRevision({ rev: "B", text: "" }).ok, false);
  assert.equal(validateRevision({ rev: "B-1", text: "x" }).ok, false);
  assert.equal(currentRevision({ title: { revision: "A" } }), "A");
  assert.equal(currentRevision({ title: { revision: "A" }, revisions: [{ rev: "B" }, { rev: "C" }] }), "C");
});

test("Abwicklungsansicht: Kontur, Biegelinien, Biegenotiz und Biegetabelle", async () => {
  const { planKantteil, kantteilFlatView, bendNote, bendTableCells } = await import("../src/core/blech.js");
  const plan = planKantteil({ legs: [40, 100, 40], angles: [90, -90], t: 2, ri: 2, k: 0.33 });
  const v = kantteilFlatView(plan, 500, { t: 2, k: 0.33, kOf: (a) => (a > 45 ? 0.4 : 0.3) });
  near(v.bbox.x1, plan.flat, 1e-9);
  assert.equal(v.bbox.y1, 500);
  assert.equal(v.visible[0].length, 5);
  assert.deepEqual(v.bends.map((b) => [b.nr, b.up, b.ri, b.k]), [[1, true, 2, 0.4], [2, false, 2, 0.4]]);
  assert.equal(bendNote(v.bends[1]), "2: 90° ab R2");
  const cells = bendTableCells(v.bends);
  assert.deepEqual(cells[0], ["Nr.", "Winkel", "Richtung", "Ri", "K", "Lage"]);
  assert.deepEqual(cells[1].slice(0, 5), ["1", "90°", "auf", "2", "0,4"]);
});

test("Symbole: Oberfläche, Form- und Lagetoleranz, Bezug", async () => {
  const S = await import("../src/core/symbole.js");
  assert.equal(S.validateSurface({ kind: "spanend", text: " Ra 3,2 " }).value.text, "Ra 3,2");
  assert.equal(S.validateSurface({ kind: "x" }).ok, false);
  const s0 = S.surfaceSymbol("beliebig", 10, 50, "");
  const s1 = S.surfaceSymbol("spanend", 10, 50, "Ra 3,2");
  const s2 = S.surfaceSymbol("ohne", 10, 50, "Rz 25");
  assert.equal(s0.lines.length, 2);
  assert.equal(s1.lines.length, 4, "Schenkel, Bezugslinie, Querstrich");
  assert.equal(s2.circles.length, 1);
  assert.deepEqual(s1.lines[0].slice(2), [10, 50], "Wurzel im Punkt");
  assert.equal(S.validateGdt({ sym: "ebenheit", tol: "0,05" }).ok, true);
  assert.match(S.validateGdt({ sym: "ebenheit", tol: "0,05", datums: "A" }).error, /keinen Bezug/);
  assert.match(S.validateGdt({ sym: "parallelitaet", tol: "0,1" }).error, /braucht einen Bezug/);
  assert.deepEqual(S.validateGdt({ sym: "position", tol: "0,2", dia: true, datums: "a b-c" }).value, { sym: "position", tol: 0.2, dia: true, datums: ["A", "B-C"] });
  assert.equal(S.validateGdt({ sym: "position", tol: "0" }).ok, false);
  assert.equal(S.validateGdt({ sym: "position", tol: 0.1, datums: "A B C D" }).ok, false);
  for (const k of S.GDT_KINDS) { const g = S.gdtGlyph(k.value, 0, 0); assert.ok(g.lines.length + g.circles.length + g.polys.length > 0, k.value); }
  const f = S.gdtFrame({ sym: "position", tol: 0.2, dia: true, datums: ["A", "B"] }, 20, 20, [10, 60]);
  assert.equal(f.texts.map((t) => t.text).join(), "Ø0,2,A,B");
  assert.equal(f.height, 7);
  assert.ok(f.width >= 28);
  assert.equal(f.polys.at(-1).pts[0].join(), "10,60", "Pfeil am Element");
  assert.equal(S.validateDatumLetter("b").value, "B");
  assert.equal(S.validateDatumLetter("O").ok, false);
  const d = S.datumSymbol("A", [50, 50], [50, 38]);
  assert.equal(d.polys[0].pts[2].join(), "50,50");
  assert.equal(d.texts[0].text, "A");
});
