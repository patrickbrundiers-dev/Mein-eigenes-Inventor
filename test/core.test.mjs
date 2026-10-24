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
