import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, resolveParams, identifiers, isValidName } from "../src/core/expr.js";
import { solveSketch, checkNewConstraint, measureConstraint } from "../src/core/solver.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("Ausdrücke", () => {
  near(evaluate("1+2*3"), 7);
  near(evaluate("(1+2)*3"), 9);
  near(evaluate("2^3^2"), 512);
  near(evaluate("-2^2"), -4);
  near(evaluate("1,5*2"), 3);
  near(evaluate("max(1, 5)"), 5);
  near(evaluate("max(1;5)"), 5);
  near(evaluate("min(1,5; 2)"), 1.5);
  near(evaluate("sin(30)"), 0.5);
  near(evaluate("45°"), 45);
  near(evaluate("12 mm"), 12);
  near(evaluate("2cm"), 20);
  near(evaluate("Länge/2", { Länge: 100 }), 50);
  near(evaluate("2B", { B: 4 }), 8);
  near(evaluate("1e3"), 1000);
  near(evaluate("wenn(L>100; 1; 2)", { L: 150 }), 1);
  near(evaluate("sqrt(3^2+4^2)"), 5);
  assert.throws(() => evaluate("1/0"));
  assert.throws(() => evaluate("x+1"));
  assert.throws(() => evaluate("1+"));
  assert.deepEqual(identifiers("a*b+sin(c)+pi").sort(), ["a", "b", "c"]);
  assert.ok(isValidName("Wandstärke_2"));
  assert.ok(!isValidName("2a"));
  assert.ok(!isValidName("sin"));
});

test("Parametertabelle mit Abhängigkeiten und Zyklen", () => {
  const r = resolveParams([
    { name: "B", expr: "H*2" },
    { name: "H", expr: "40" },
    { name: "t", expr: "B/20" },
    { name: "x", expr: "y+1" },
    { name: "y", expr: "x+1" },
  ]);
  near(r.values.B, 80);
  near(r.values.t, 4);
  assert.ok(r.errors.x && r.errors.y);
  assert.ok(!r.errors.B);
});

function rectSketch() {
  return {
    points: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 1 },
      { id: "c", x: 11, y: 6 },
      { id: "d", x: -1, y: 5 },
    ],
    entities: [
      { id: "l1", type: "line", p1: "a", p2: "b" },
      { id: "l2", type: "line", p1: "b", p2: "c" },
      { id: "l3", type: "line", p1: "c", p2: "d" },
      { id: "l4", type: "line", p1: "d", p2: "a" },
    ],
    constraints: [
      { id: "h1", type: "horizontal", e: "l1" },
      { id: "h2", type: "horizontal", e: "l3" },
      { id: "v1", type: "vertical", e: "l2" },
      { id: "v2", type: "vertical", e: "l4" },
    ],
  };
}

test("Rechteck mit Bemaßung wird gelöst", () => {
  const s = rectSketch();
  s.constraints.push({ id: "f", type: "fix", p: "a", x: 0, y: 0 });
  s.constraints.push({ id: "w", type: "length", e: "l1", value: "Breite" });
  s.constraints.push({ id: "h", type: "length", e: "l2", value: "Breite/2" });
  const r = solveSketch(s, { Breite: 80 });
  assert.ok(r.ok, JSON.stringify(r));
  const P = Object.fromEntries(s.points.map((p) => [p.id, p]));
  near(P.b.x, 80); near(P.b.y, 0); near(P.c.y, 40); near(P.d.x, 0);
  assert.equal(r.dof, 0);
});

test("Freiheitsgrade und Redundanz", () => {
  const s = rectSketch();
  let r = solveSketch(s);
  assert.ok(r.ok);
  assert.equal(r.dof, 4); // 8 Koordinaten - 4 Bedingungen
  assert.equal(checkNewConstraint(s, { id: "x", type: "parallel", e1: "l1", e2: "l3" }), "redundant");
  assert.equal(checkNewConstraint(s, { id: "y", type: "length", e: "l1", value: "20" }), "ok");
  s.constraints.push({ id: "L", type: "length", e: "l1", value: "20" });
  solveSketch(s);
  assert.equal(checkNewConstraint(s, { id: "z", type: "length", e: "l3", value: "30" }), "conflict");
});

test("Kreis, Bogen, Tangente, Winkel", () => {
  const s = {
    points: [
      { id: "c", x: 0, y: 0 },
      { id: "p", x: 3, y: 9 },
      { id: "q", x: 20, y: 11 },
      { id: "ac", x: 30, y: 0 },
      { id: "a1", x: 35, y: 0 },
      { id: "a2", x: 30, y: 6 },
    ],
    entities: [
      { id: "k", type: "circle", c: "c", r: 5 },
      { id: "l", type: "line", p1: "p", p2: "q" },
      { id: "b", type: "arc", c: "ac", p1: "a1", p2: "a2" },
    ],
    constraints: [
      { id: "f", type: "fix", p: "c", x: 0, y: 0 },
      { id: "d", type: "diameter", e: "k", value: "16" },
      { id: "t", type: "tangent", e1: "l", e2: "k" },
      { id: "hz", type: "horizontal", e: "l" },
      { id: "r", type: "radius", e: "b", value: "7" },
    ],
  };
  const r = solveSketch(s);
  assert.ok(r.ok, JSON.stringify(r));
  const P = Object.fromEntries(s.points.map((p) => [p.id, p]));
  near(s.entities[0].r, 8);
  near(Math.abs(P.p.y), 8);
  near(Math.hypot(P.a1.x - P.ac.x, P.a1.y - P.ac.y), 7);
  near(Math.hypot(P.a2.x - P.ac.x, P.a2.y - P.ac.y), 7);

  const s2 = rectSketch();
  s2.constraints = [{ id: "f", type: "fix", p: "a", x: 0, y: 0 }, { id: "h", type: "horizontal", e: "l1" }, { id: "w", type: "angle", e1: "l1", e2: "l4", value: "60" }];
  const r2 = solveSketch(s2);
  assert.ok(r2.ok);
  near(measureConstraint(s2, s2.constraints[2]), 60, 1e-4);
});

test("Minimale Bewegung bei Maßänderung", () => {
  const s = rectSketch();
  s.constraints.push({ id: "f", type: "fix", p: "a", x: 0, y: 0 });
  s.constraints.push({ id: "w", type: "length", e: "l1", value: "10" });
  solveSketch(s);
  const before = s.points.find((p) => p.id === "d").y;
  s.constraints.find((c) => c.id === "w").value = "50";
  solveSketch(s);
  const P = Object.fromEntries(s.points.map((p) => [p.id, p]));
  near(P.b.x, 50);
  near(P.d.y, before, 1e-3); // Höhe bleibt
});

import { exampleProject, rectSketchFeature } from "../src/core/examples.js";
import { extractProfiles, holeCenters } from "../src/core/sketch.js";
import { parseSvgPath } from "../src/core/svgpath.js";
import { DxfWriter, sketchToDxf } from "../src/core/dxf.js";
import { sectionGeometry, catalogToDims } from "../src/core/sections.js";
import { placementMatrix, decomposePlacement, matApply, alignFaces, planeFromFace, planeFrame, toWorld } from "../src/core/geom.js";
import { resolveParams as rp } from "../src/core/expr.js";

test("Beispielskizzen lösbar, Profile erkannt", () => {
  const prj = exampleProject();
  for (const d of prj.docs.filter((x) => x.kind === "part")) {
    const { values } = rp(d.params);
    for (const f of d.features.filter((x) => x.type === "sketch")) {
      const s = JSON.parse(JSON.stringify(f));
      const r = solveSketch(s, values);
      assert.ok(r.ok, d.name + " / " + f.name + " " + JSON.stringify(r));
    }
  }
  const s = rectSketchFeature("r", "XY", 0, 0, 0, "100", "50");
  s.points.push({ id: "cc", x: 50, y: 25 });
  s.entities.push({ id: "k", type: "circle", c: "cc", r: 10 });
  const pr = extractProfiles(s);
  assert.equal(pr.regions.length, 1);
  assert.equal(pr.regions[0].holes.length, 1);
  near(pr.regions[0].area, 5000 - Math.PI * 100, 1);
  // offene Kontur
  s.entities.splice(1, 1);
  const pr2 = extractProfiles(s);
  assert.ok(pr2.errors.length > 0);
  const plateHoles = exampleProject().docs[0].features[2];
  assert.equal(holeCenters(plateHoles).length, 4);
});

test("SVG-Pfade, DXF, Querschnitte", () => {
  const r = parseSvgPath("M -5 0 A 5 5 0 0 1 5 0 A 5 5 0 0 1 -5 0 Z");
  assert.equal(r.arcs.length, 1);
  assert.ok(r.arcs[0].full);
  near(r.arcs[0].r, 5);
  const r2 = parseSvgPath("M 0 0 L 40 0 L 40 -10 Z");
  assert.deepEqual(r2.polylines[0][2], [40, 10]);
  const dxf = new DxfWriter().layer("A", 1).line(0, 0, 10, 0, "A").circle(0, 0, 5, "A").text(0, 0, 3.5, "Ø10 Maß").toString();
  assert.ok(dxf.includes("AC1009") && dxf.includes("%%c10 Mass") && dxf.trim().endsWith("EOF"));
  assert.ok(sketchToDxf(rectSketchFeature("r", "XY", 0, 0, 0, "10", "10")).includes("LINE"));
  const g = sectionGeometry("vierkant", { B: 40, t: 3, r: 6 });
  near(g.area, 40 * 40 - (4 - Math.PI) * 36 - (34 * 34 - (4 - Math.PI) * 9), 1e-6);
  const g2 = sectionGeometry("rohr", { D: 48.3, t: 2.6 });
  near(g2.area, (Math.PI / 4) * (48.3 ** 2 - 43.1 ** 2), 1e-6);
  assert.deepEqual(catalogToDims("rechteck", "60x40x3"), { B: "60", H: "40", t: "3", r: "6" });
});

test("Platzierung, Zerlegung, Flächen ausrichten", () => {
  const m = placementMatrix([10, 20, 30], [30, -40, 75]);
  const d = decomposePlacement(m);
  near(d.rot[0], 30, 1e-6); near(d.rot[1], -40, 1e-6); near(d.rot[2], 75, 1e-6);
  const p = matApply(placementMatrix([0, 0, 0], [0, 0, 90]), [1, 0, 0]);
  near(p[0], 0); near(p[1], 1);
  // Teil B mit Fläche (Normale +X bei x=5) gegen Fläche A (Normale +Z bei z=100) legen
  const mB = placementMatrix([0, 0, 0], [0, 0, 0]);
  const res = alignFaces(mB, [5, 0, 0], [1, 0, 0], [0, 0, 100], [0, 0, 1], "gegen");
  const q = matApply(res, [5, 0, 0]);
  near(q[2], 100, 1e-9);
  const nB = matApply(res, [6, 0, 0]);
  near(nB[2] - q[2], -1, 1e-9); // Normale zeigt nun nach -Z
  const pl = planeFromFace([3, 4, 10], [0, 0, 1]);
  const fr = planeFrame(pl, 0);
  const w = toWorld(fr, 1, 2);
  near(w[0], 1); near(w[1], 2); near(w[2], 10);
  const fx = planeFrame({ ref: "XZ" }, 0);
  const w2 = toWorld(fx, 3, 7);
  assert.deepEqual(w2.map((x) => Math.round(x)), [3, 0, 7]);
});

import { trimEntity, filletCorner, intersections } from "../src/core/sketchedit.js";
import { profileId } from "../src/core/sections.js";
import { svgPathSegments } from "../src/core/svgpath.js";
import { segmentsToDxf } from "../src/core/dxf.js";

let _n = 0;
const tid = (p) => p + "_" + _n++;

test("Profil-IDs wie Rohrlaser-Kalkulation", () => {
  assert.equal(profileId("rohr", { D: 42.4, t: 2 }), "RR 42,4x2");
  assert.equal(profileId("vierkant", { B: 40, t: 3 }), "QR 40x40x3");
  assert.equal(profileId("rechteck", { B: 40, H: 60, t: 3 }), "RE 60x40x3");
  assert.equal(profileId("rohr", { D: 48.3, t: 2.6 }), "RR 48,3x2,6");
  assert.equal(profileId("flach", { B: 40, t: 8 }), "FL 40x8");
  assert.equal(profileId("rund", { D: 20 }), "RD 20");
});

test("Schnittpunkte Linie/Kreis/Bogen", () => {
  const L = (ax, ay, bx, by) => ({ kind: "line", ax, ay, bx, by });
  const K = (cx, cy, r) => ({ kind: "circle", cx, cy, r, a1: 0, sweep: Math.PI * 2 });
  assert.equal(intersections(L(0, 0, 10, 0), L(5, -5, 5, 5)).length, 1);
  assert.equal(intersections(L(0, 0, 10, 0), L(5, 1, 5, 5)).length, 0);
  assert.equal(intersections(L(-10, 0, 10, 0), K(0, 0, 5)).length, 2);
  assert.equal(intersections(K(0, 0, 5), K(8, 0, 5)).length, 2);
  const arc = { kind: "arc", cx: 0, cy: 0, r: 5, a1: 0, sweep: Math.PI }; // obere Hälfte
  assert.equal(intersections(L(-10, 1, 10, 1), arc).length, 2);
  assert.equal(intersections(L(-10, -1, 10, -1), arc).length, 0);
});

function crossSketch() {
  // waagrechte Linie von (0,0) bis (100,0), senkrechte von (50,-30) bis (50,30)
  return {
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 50, y: -30 }, { id: "d", x: 50, y: 30 }],
    entities: [{ id: "h", type: "line", p1: "a", p2: "b" }, { id: "v", type: "line", p1: "c", p2: "d" }],
    constraints: [{ id: "k1", type: "horizontal", e: "h" }, { id: "k2", type: "vertical", e: "v" }, { id: "m1", type: "length", e: "h", value: "100" }],
  };
}

test("Stutzen: Linienende, Mitte, ganze Linie, Kreis", () => {
  let s = crossSketch();
  let r = trimEntity(s, "h", { x: 80, y: 0 }, tid);
  assert.ok(r.ok);
  const P = (sk) => new Map(sk.points.map((p) => [p.id, p]));
  const h = s.entities.find((e) => e.id === "h");
  near(P(s).get(h.p2).x, 50); near(P(s).get(h.p1).x, 0);
  assert.ok(!s.constraints.some((k) => k.type === "length"), "Längenmaß entfernt");
  assert.ok(s.constraints.some((k) => k.type === "pointOnLine" && k.e === "v"));
  assert.ok(solveSketch(s).ok);

  // Mitte herausschneiden: dritte Linie bei x=70
  s = crossSketch();
  s.points.push({ id: "e", x: 70, y: -30 }, { id: "f", x: 70, y: 30 });
  s.entities.push({ id: "v2", type: "line", p1: "e", p2: "f" });
  r = trimEntity(s, "h", { x: 60, y: 0 }, tid);
  assert.ok(r.ok);
  const hs = s.entities.filter((e) => e.type === "line" && e.id !== "v" && e.id !== "v2");
  assert.equal(hs.length, 2);
  assert.ok(s.constraints.some((k) => k.type === "collinear"));
  assert.ok(solveSketch(s).ok);

  // Linie ohne Schnitt verschwindet
  s = crossSketch();
  s.points.push({ id: "g", x: 0, y: 50 }, { id: "i", x: 20, y: 50 });
  s.entities.push({ id: "frei", type: "line", p1: "g", p2: "i" });
  r = trimEntity(s, "frei", { x: 10, y: 50 }, tid);
  assert.ok(r.deleted);
  assert.ok(!s.points.some((p) => p.id === "g"));

  // Kreis an waagrechter Linie stutzen -> Halbkreis (Bogen)
  s = crossSketch();
  s.points.push({ id: "m", x: 20, y: 0 });
  s.entities.push({ id: "k", type: "circle", c: "m", r: 10 });
  r = trimEntity(s, "k", { x: 20, y: -10 }, tid);
  assert.ok(r.ok, r.message);
  const k = s.entities.find((e) => e.id === "k");
  assert.equal(k.type, "arc");
  const Pm = P(s);
  const g1 = Pm.get(k.p1), g2 = Pm.get(k.p2);
  // verbleibender Bogen muss oben liegen (Klick war unten)
  const mid = (g1.y + g2.y) / 2;
  near(mid, 0, 1e-6);
  assert.ok(solveSketch(s).ok);
});

test("Skizzenrundung an Rechteckecke", () => {
  const s = rectSketch();
  s.constraints.push({ id: "f", type: "fix", p: "a", x: 0, y: 0 }, { id: "L1", type: "length", e: "l1", value: "40" }, { id: "L2", type: "length", e: "l2", value: "20" });
  solveSketch(s);
  const r = filletCorner(s, "c", 5, tid);
  assert.ok(r.ok, r.message);
  const res = solveSketch(s);
  assert.ok(res.ok, JSON.stringify(res));
  const P = new Map(s.points.map((p) => [p.id, p]));
  const arc = s.entities.find((e) => e.id === r.arcId);
  const C = P.get(arc.c);
  near(C.x, 35, 1e-5); near(C.y, 15, 1e-5);
  near(Math.hypot(P.get(arc.p1).x - C.x, P.get(arc.p1).y - C.y), 5, 1e-6);
  const prof = extractProfiles(s);
  assert.equal(prof.regions.length, 1, JSON.stringify(prof.errors));
  near(prof.regions[0].area, 800 - (25 - (Math.PI * 25) / 4), 0.5);
  assert.equal(filletCorner(s, "a", 30, tid).ok, false); // zu groß
});

test("Exakte DXF-Kontur aus SVG", () => {
  const segs = [
    ...svgPathSegments("M 0 0 L 100 0 L 100 -50 L 0 -50 Z"),
    ...svgPathSegments("M 10 -10 A 5 5 0 0 1 20 -10 A 5 5 0 0 1 10 -10 Z"),
    ...svgPathSegments("M 10 -10 A 5 5 0 0 1 20 -10 A 5 5 0 0 1 10 -10 Z"),
  ];
  const r = segmentsToDxf(segs);
  assert.equal(r.circles, 1);
  assert.equal(r.lines, 4);
  near(r.width, 100); near(r.height, 50);
  assert.ok(r.dxf.includes("CIRCLE"));
});

import { faceRef, solveAssembly, worldToLocal } from "../src/core/asmsolve.js";

test("Baugruppen-Abhängigkeiten: gegeneinander, bündig, nach Bauteiländerung", () => {
  // Platte 100x50x10 (z 0..10), Klotz 20x20x30 (z 0..30)
  let plateT = 10;
  const facesPlate = () => [
    { type: "PLANE", normal: [0, 0, 1], point: [50, 25, plateT] }, { type: "PLANE", normal: [0, 0, -1], point: [50, 25, 0] },
    { type: "PLANE", normal: [1, 0, 0], point: [100, 25, 5] }, { type: "PLANE", normal: [-1, 0, 0], point: [0, 25, 5] },
  ];
  const facesBlock = () => [
    { type: "PLANE", normal: [0, 0, -1], point: [10, 10, 0] }, { type: "PLANE", normal: [0, 0, 1], point: [10, 10, 30] },
    { type: "PLANE", normal: [1, 0, 0], point: [20, 10, 15] }, { type: "PLANE", normal: [-1, 0, 0], point: [0, 10, 15] },
  ];
  const asm = {
    components: [
      { id: "p", part: "plate", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true },
      { id: "b", part: "block", pos: [37, 5, 80], rot: [0, 30, 0] },
    ],
    constraints: [],
  };
  const facesOf = (pid) => (pid === "plate" ? facesPlate() : facesBlock());
  // Unterseite Klotz gegen Oberseite Platte
  asm.constraints.push({ id: "c1", type: "gegen", a: faceRef("p", facesPlate()[0]), b: faceRef("b", facesBlock()[0]), gap: "0" });
  let r = solveAssembly(asm, facesOf);
  assert.ok(r.changed && !Object.keys(r.errors).length, JSON.stringify(r));
  const b = asm.components[1];
  near(b.pos[2], 10, 1e-6);
  near(b.rot[0], 0, 1e-6); near(b.rot[1], 0, 1e-6);
  // Linke Seite Klotz bündig mit linker Seite Platte
  asm.constraints.push({ id: "c2", type: "buendig", a: faceRef("p", facesPlate()[3]), b: faceRef("b", facesBlock()[3]), gap: "0" });
  r = solveAssembly(asm, facesOf);
  near(b.pos[0], 0, 1e-6);
  near(b.pos[2], 10, 1e-6);
  // Platte wird dicker -> Klotz wandert mit
  plateT = 15;
  r = solveAssembly(asm, facesOf);
  near(b.pos[2], 15, 1e-6);
  near(b.pos[0], 0, 1e-6);
  // Weltpunkt in Bauteil-Koordinaten
  const l = worldToLocal({ pos: [100, 0, 0], rot: [0, 0, 90] }, [100, 5, 0], [0, 1, 0]);
  near(l.p[0], 5, 1e-9); near(l.n[0], 1, 1e-9);
});

import { hatchLines } from "../src/core/hatch.js";

test("Schraffur mit Loch", () => {
  const outer = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const hole = [[5, 5], [15, 5], [15, 15], [5, 15]];
  const lines = hatchLines([outer, hole], 2, 0);
  assert.ok(lines.length > 10);
  // keine Linie darf durch das Loch gehen
  for (const [x1, y1, x2, y2] of lines) {
    const my = (y1 + y2) / 2, mx = (x1 + x2) / 2;
    assert.ok(!(mx > 5 && mx < 15 && my > 5 && my < 15), "Linie im Loch");
  }
  const l45 = hatchLines([outer], 2.5, 45);
  assert.ok(l45.length > 5);
});

test("Knickrahmen: Mittellinie, Abwicklung mit K-Faktor, Prüfregeln", async () => {
  const { planKnickrahmen, KNICK_LIMITS } = await import("../src/core/knickrahmen.js");
  const dims = { B: 60, H: 40, t: 3, r: 6 };
  const base = (over = {}) => ({ section: "rechteck", dims, plane: "XY", offset: 0, start: [0, 0], direction: 0, orientation: "hochkant", bendRadius: 0, kFactor: 0, segments: [800, 600], bends: [{ angle: 90, min: null, max: null }], ...over });
  const codes = (p) => p.issues.map((i) => i.code);
  const rad = (deg) => (deg * Math.PI) / 180;

  // scharfe Kante (ri = 0, k = 0): Ende bei (800, 600); Abwicklung = ΣL + 2·(W/2 − t)·tan45° = 1400 + 54
  let p = planKnickrahmen(base());
  assert.deepEqual(codes(p), []);
  near(p.nodes[2][0], 800); near(p.nodes[2][1], 600); near(p.nodes[2][2], 0);
  near(p.flatLength, 1454);
  assert.equal(p.knicks[0].sigma, -1); // Linksknick → Außenwand rechts (−u)
  near(p.knicks[0].x1, 800 + 27); near(p.knicks[0].zone, 0);

  // Innenradius 3, K-Faktor 0,33: gerade Teile bis zu den Tangentenpunkten (d = 27 − 3 = 24),
  // Biegezone = (ri + k·t)·θ
  p = planKnickrahmen(base({ bendRadius: 3, kFactor: 0.33 }));
  const zone = (3 + 0.33 * 3) * rad(90);
  near(p.knicks[0].zone, zone, 1e-12);
  near(p.knicks[0].x1, 800 + 24, 1e-9);
  near(p.knicks[0].x2 - p.knicks[0].x1, zone, 1e-12);
  near(p.flatLength, 1400 + 2 * 24 + zone, 1e-9);
  // 30°
  const T = Math.tan(rad(15));
  p = planKnickrahmen(base({ bends: [{ angle: 30, min: null, max: null }], bendRadius: 3, kFactor: 0.5 }));
  near(p.flatLength, 1400 + 2 * 24 * T + 4.5 * rad(30), 1e-9);
  // Radius größer als halbe Breite: Mittelpunkt liegt jenseits der Mittellinie (d < 0)
  p = planKnickrahmen(base({ bends: [{ angle: 60 }], bendRadius: 40, kFactor: 0.5, segments: [500, 500] }));
  near(p.d, -13);
  near(p.flatLength, 1000 - 2 * 13 * Math.tan(rad(30)) + 41.5 * rad(60), 1e-9);

  // drei Segmente, gegensinnig; Ebene XZ und Profillage flach (W = H = 40)
  p = planKnickrahmen(base({ segments: [500, 400, 300], bends: [{ angle: 45 }, { angle: -60 }], plane: "XZ", orientation: "flach", bendRadius: 2, kFactor: 0.4 }));
  assert.deepEqual(codes(p), []);
  near(p.W, 40); near(p.d, 15);
  const t45 = Math.tan(rad(22.5)), t60 = Math.tan(rad(30));
  const z1 = (2 + 1.2) * rad(45), z2 = (2 + 1.2) * rad(60);
  near(p.flatLength, 1200 + 2 * 15 * (t45 + t60) + z1 + z2, 1e-9);
  near(p.knicks[1].x1 - p.knicks[0].x2, 400 + 15 * (t45 + t60), 1e-9);
  assert.deepEqual(p.knicks.map((k) => k.sigma), [-1, 1]);
  for (const n of p.nodes) near(n[1], 0); // XZ-Ebene: y = 0

  // ein Segment = gerades Rohr, Radius/K-Faktor spielen keine Rolle
  p = planKnickrahmen(base({ segments: [1000], bends: [], bendRadius: undefined, kFactor: undefined }));
  assert.deepEqual(codes(p), []);
  near(p.flatLength, 1000);

  // Prüfregeln
  assert.deepEqual(codes(planKnickrahmen(base({ segments: [800, 0] }))), ["SEG_LENGTH"]);
  assert.deepEqual(codes(planKnickrahmen(base({ segments: [1, 2, 3, 4], bends: [1, 2, 3].map(() => ({ angle: 30 })) }))), ["SEG_COUNT"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bends: [] }))), ["SEG_COUNT"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bends: [{ angle: KNICK_LIMITS.maxAngle + 1 }] }))), ["ANGLE_RANGE"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bends: [{ angle: 0 }] }))), ["ANGLE_RANGE"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bends: [{ angle: 50, max: 45 }] }))), ["ANGLE_LIMIT"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bends: [{ angle: 20, min: 30 }] }))), ["ANGLE_LIMIT"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bends: [{ angle: 30, min: 40, max: 35 }] }))), ["ANGLE_LIMIT"]);
  assert.deepEqual(codes(planKnickrahmen(base({ bendRadius: -1 }))), ["BEND_RADIUS"]);
  assert.deepEqual(codes(planKnickrahmen(base({ kFactor: 1.2 }))), ["K_FACTOR"]);
  assert.deepEqual(codes(planKnickrahmen(base({ dims: { B: 60, H: 40, t: 20, r: 6 } }))), ["SECTION"]);
  assert.deepEqual(codes(planKnickrahmen(base({ section: "rohr", dims: { D: 40, t: 2 } }))), ["SECTION_KIND"]);
  // Segment kürzer als W/2·tan(θ/2): 90° → mindestens 30 mm; großer Radius verlangt mehr (|d|·tan)
  assert.deepEqual(codes(planKnickrahmen(base({ segments: [30, 600] }))), ["SEG_SHORT"]);
  assert.deepEqual(codes(planKnickrahmen(base({ segments: [30.5, 600] }))), []);
  assert.deepEqual(codes(planKnickrahmen(base({ segments: [40, 600], bendRadius: 70 }))), ["SEG_SHORT"]);
  const msg = planKnickrahmen(base({ segments: [800, -5] })).issues[0].message;
  assert.match(msg, /Segment 2/);
});
