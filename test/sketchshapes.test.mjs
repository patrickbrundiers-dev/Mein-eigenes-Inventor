// Langloch, Polygon, Spiegeln: Form, Freiheitsgrade, Kontur, Folgen von Maßänderungen
import test from "node:test";
import assert from "node:assert/strict";
import { buildSlot, buildPolygon, mirrorEntities, constraintLabel } from "../src/core/sketchshapes.js";
import { solveSketch } from "../src/core/solver.js";
import { newSketch, extractProfiles } from "../src/core/sketch.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const usePoint = (sk, sn) => { if (sn.pointId) return sn.pointId; const id = uid("p"); sk.points.push({ id, x: sn.x, y: sn.y }); return id; };
const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const sketch = () => newSketch("s", "S", { ref: "XY" });
const P = (sk, id) => sk.points.find((p) => p.id === id);
const area = (sk) => extractProfiles(sk).regions.reduce((s, r) => s + Math.abs(r.area ?? 0), 0);

test("Langloch: 5 Freiheitsgrade, geschlossene Kontur, Fläche, Radius über Maß", () => {
  const sk = sketch();
  const r = buildSlot(sk, { x: 0, y: 0 }, { x: 40, y: 0 }, 5, { uid, usePoint });
  let s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 5);
  const prof = extractProfiles(sk);
  assert.equal(prof.regions.length, 1, JSON.stringify(prof.errors));
  // Maße setzen: Mittenabstand 60, Radius 8 → Form bleibt tangential
  sk.constraints.push({ id: "f", type: "fix", p: r.centers[0], x: 0, y: 0 }, { id: "h", type: "horizontal", e: r.axis }, { id: "d", type: "length", e: r.axis, value: "60" }, { id: "rr", type: "radius", e: r.arcs[0], value: "8" });
  s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  assert.equal(s.dof, 0);
  const top = sk.entities.find((e) => e.id === r.lines[0]);
  near(Math.abs(P(sk, top.p1).y), 8, 1e-6, "Abstand Gerade zur Achse");
  near(P(sk, top.p2).x - P(sk, top.p1).x, 60, 1e-6, "Gerade = Mittenabstand");
});

test("Langloch: ungültige Eingaben werden abgelehnt", () => {
  assert.throws(() => buildSlot(sketch(), { x: 0, y: 0 }, { x: 0, y: 0 }, 5, { uid, usePoint }), /zwei verschiedene/);
  assert.throws(() => buildSlot(sketch(), { x: 0, y: 0 }, { x: 10, y: 0 }, 0, { uid, usePoint }), /Radius/);
});

test("Polygon: regelmäßig, 4 Freiheitsgrade, folgt Seitenlänge", () => {
  const sk = sketch();
  const r = buildPolygon(sk, { x: 0, y: 0 }, { x: 10, y: 0 }, 6, { uid, usePoint });
  let s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 4);
  assert.equal(extractProfiles(sk).regions.length, 1);
  sk.constraints.push({ id: "f", type: "fix", p: r.center, x: 0, y: 0 }, { id: "h", type: "horizontal", e: r.lines[0] }, { id: "L", type: "length", e: r.lines[0], value: "20" });
  s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 0);
  for (const id of r.lines) {
    const e = sk.entities.find((x) => x.id === id);
    near(Math.hypot(P(sk, e.p2).x - P(sk, e.p1).x, P(sk, e.p2).y - P(sk, e.p1).y), 20, 1e-6, "Seite");
  }
  near(Math.hypot(P(sk, r.points[0]).x, P(sk, r.points[0]).y), 20, 1e-6, "Sechseck: Umkreisradius = Seite");
  assert.throws(() => buildPolygon(sketch(), { x: 0, y: 0 }, { x: 1, y: 0 }, 2, { uid, usePoint }), /3 bis 64/);
});

test("Spiegeln: Kopie symmetrisch, Punkte auf der Achse geteilt, folgt Original", () => {
  const sk = sketch();
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 50 }, { id: "c", x: 20, y: 10 }, { id: "m", x: 30, y: 30 });
  sk.entities.push({ id: "ax", type: "line", p1: "a", p2: "b", construction: true }, { id: "l1", type: "line", p1: "a", p2: "c" }, { id: "k1", type: "circle", c: "m", r: 4 });
  sk.constraints.push({ id: "fa", type: "fix", p: "a", x: 0, y: 0 }, { id: "v", type: "vertical", e: "ax" });
  const r = mirrorEntities(sk, ["l1", "k1", "ax"], "ax", { uid });
  assert.equal(r.entities.length, 2, "Spiegellinie selbst nicht kopiert");
  const l2 = sk.entities.find((e) => e.id === r.entities[0]);
  assert.equal(l2.p1, "a", "Punkt auf der Achse wird mitbenutzt");
  near(P(sk, l2.p2).x, -20); near(P(sk, l2.p2).y, 10);
  assert.ok(solveSketch(sk).ok);
  // Original verschieben → Kopie folgt
  sk.constraints.push({ id: "fc", type: "fix", p: "c", x: 25, y: 5 }, { id: "rk", type: "radius", e: "k1", value: "6" });
  assert.ok(solveSketch(sk).ok);
  near(P(sk, l2.p2).x, -25, 1e-6); near(P(sk, l2.p2).y, 5, 1e-6);
  const k2 = sk.entities.find((e) => e.id === r.entities[1]);
  near(k2.r, 6, 1e-6, "Radius der Kopie");
  near(P(sk, k2.c).x, -30, 1e-6);
  assert.throws(() => mirrorEntities(sk, ["l1"], "k1", { uid }), /Linie/);
});

test("Bogen spiegeln behält gültige Kontur (Umlaufsinn getauscht)", () => {
  const sk = sketch();
  const s1 = buildSlot(sk, { x: 10, y: 0 }, { x: 30, y: 0 }, 4, { uid, usePoint });
  sk.points.push({ id: "a", x: 0, y: -10 }, { id: "b", x: 0, y: 10 });
  sk.entities.push({ id: "ax", type: "line", p1: "a", p2: "b", construction: true });
  mirrorEntities(sk, [...s1.arcs, ...s1.lines], "ax", { uid });
  assert.ok(solveSketch(sk).ok);
  assert.equal(extractProfiles(sk).regions.length, 2, JSON.stringify(extractProfiles(sk).errors));
});

test("Klartext für Bedingungen", () => {
  assert.equal(constraintLabel({ type: "distance", value: "120" }), "Abstand 120");
  assert.equal(constraintLabel({ type: "angle", value: "45" }), "Winkel 45°");
  assert.equal(constraintLabel({ type: "parallel" }), "Parallel");
});
