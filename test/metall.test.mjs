// MegaCAD-Abgleich (docs/roadmap/megacad-metall-abgleich.md): reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/core/expr.js";
import { resolvePathPoints, pathSegments, pathLength, upFor, cornerAngle, defaultProfilzug, nextPointDefault, UP_AXES } from "../src/core/profilzug.js";

const E = (x) => evaluate(String(x), {});

test("Profilzug: absolute und relative Punkte, offen und geschlossen", () => {
  const pts = resolvePathPoints([{ x: "0", y: "0", z: "0" }, { x: "1000", y: "0", z: "0", rel: true }, { x: "0", y: "600", z: "300", rel: true }, { x: "0", y: "600", z: "300" }], E);
  assert.deepEqual(pts, [[0, 0, 0], [1000, 0, 0], [1000, 600, 300], [0, 600, 300]]);
  assert.equal(pathSegments(pts, false).length, 3);
  const closed = pathSegments(pts, true);
  assert.equal(closed.length, 4);
  assert.deepEqual(closed[3].b, [0, 0, 0]);
  const diag = Math.hypot(600, 300);
  assert.ok(Math.abs(pathLength(pts, false) - (2000 + diag)) < 1e-9);
  assert.ok(Math.abs(pathLength(pts, true) - (2000 + 2 * diag)) < 1e-9);
});

test("Profilzug: Fehler bei zu wenigen oder doppelten Punkten", () => {
  assert.throws(() => resolvePathPoints([{ x: "0", y: "0", z: "0" }], E), /mindestens 2/);
  assert.throws(() => resolvePathPoints([{ x: "0", y: "0", z: "0" }, { x: "0", y: "0", z: "0", rel: true }], E), /liegt auf Punkt 1/);
  assert.throws(() => pathSegments([[0, 0, 0], [1, 0, 0]], true), /mindestens 3/);
  assert.throws(() => pathSegments([[0, 0, 0], [1, 0, 0], [0, 0, 0]], true), /»Geschlossen« genügt/);
});

test("Profilzug: Richtung oben mit Ersatzachse, Eckwinkel, Vorgabe", () => {
  assert.deepEqual(upFor([1, 0, 0]), UP_AXES.Z);
  assert.deepEqual(upFor([0, 0, 5]), UP_AXES.Y);
  assert.deepEqual(upFor([0, 1, 0], UP_AXES.Y), UP_AXES.Z);
  assert.ok(Math.abs(cornerAngle([0, 0, 0], [1, 0, 0], [1, 1, 0]) - 90) < 1e-9);
  const d = defaultProfilzug({ B: "40", t: "3" });
  assert.equal(d.type, "profilzug");
  assert.equal(resolvePathPoints(d.points, E).length, 4);
});

test("Profilzug: Umkehr am Punkt wird gemeldet, neuer Punkt quer zum letzten Segment", () => {
  assert.throws(() => pathSegments([[0, 0, 0], [1000, 0, 0], [500, 0, 0]], false), /kehrt an Punkt 2 um/);
  assert.deepEqual(nextPointDefault([[0, 0, 0], [1000, 0, 0]]), { x: "0", y: "500", z: "0", rel: true });
  assert.deepEqual(nextPointDefault([[0, 0, 0], [0, 800, 0]]), { x: "500", y: "0", z: "0", rel: true });
  assert.equal(nextPointDefault([]).y, "500");
});
