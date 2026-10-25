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

test("Biegerohr: Geraden, Bögen, Biegeliste L-R-A und Abwicklungslänge (MegaCAD-Abgleich M4)", async () => {
  const { planBends, bendListCsv } = await import("../src/core/biegerohr.js");
  // Bügel: 600 in X, 400 in Y, 300 in Z, R = 100 → zwei 90°-Biegungen in verschiedenen Ebenen
  const pts = [[0, 0, 0], [600, 0, 0], [600, 400, 0], [600, 400, 300]];
  const p = planBends(pts, 100, 48.3);
  assert.equal(p.bends.length, 2);
  assert.deepEqual(p.bends.map((b) => Math.round(b.angle)), [90, 90]);
  assert.ok(Math.abs(p.bends[0].straight - 500) < 1e-9);
  assert.ok(Math.abs(p.bends[1].straight - 200) < 1e-9);
  assert.ok(Math.abs(p.last - 200) < 1e-9);
  assert.equal(Math.abs(p.bends[1].rotation), 90, "Biegeebene um 90° gedreht");
  assert.ok(Math.abs(p.length - (900 + 2 * 100 * Math.PI / 2)) < 1e-9);
  assert.equal(p.pieces.filter((x) => x.t === "arc").length, 2);
  assert.equal(p.issues.length, 0);
  // in einer Ebene: Drehung 0 oder 180
  const flat = planBends([[0, 0, 0], [500, 0, 0], [500, 500, 0], [1000, 500, 0]], 50, 20);
  assert.equal(Math.abs(flat.bends[1].rotation), 180);
  assert.match(bendListCsv(p, "Bügel"), /Abwicklungslänge mm;1214,2/);
});

test("Biegerohr: zu kurzes Segment, Umkehr, kleiner Radius, kurze Spannlänge", async () => {
  const { planBends } = await import("../src/core/biegerohr.js");
  assert.throws(() => planBends([[0, 0, 0], [80, 0, 0], [80, 500, 0]], 100, 30), /Segment 1 .* zu kurz/);
  assert.throws(() => planBends([[0, 0, 0], [500, 0, 0], [200, 0, 0]], 50, 30), /kehrt an Punkt 2 um/);
  assert.match(planBends([[0, 0, 0], [500, 0, 0], [500, 500, 0]], 20, 30).issues[0].message, /kleiner als Rohr-Ø/);
  const short = planBends([[0, 0, 0], [500, 0, 0], [500, 210, 0], [0, 210, 0]], 100, 30);
  assert.match(short.issues.map((x) => x.message).join(), /Spannlänge/);
  assert.equal(planBends([[0, 0, 0], [500, 0, 0], [900, 0, 0]], 50, 30).bends.length, 0, "gerade weiter = keine Biegung");
});
