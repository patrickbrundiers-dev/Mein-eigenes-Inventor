// Gebogenes Rohr strecken (W2): Mittellinie, Bezug φ und CSV, ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { centerline, centerlineLength, locateHole, stretchCsv } from "../src/core/strecken.js";

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);

test("Mittellinie aus Geraden und Bogen: Länge und verdrehungsfreier Bezug", () => {
  const s2 = Math.SQRT1_2;
  const pts = centerline({ pieces: [
    { t: "line", a: [0, 0, 0], b: [400, 0, 0] },
    { t: "arc", a: [400, 0, 0], m: [400 + 100 * s2, 100 - 100 * s2, 0], b: [500, 100, 0] },
    { t: "line", a: [500, 100, 0], b: [500, 500, 0] },
  ] }, 1);
  near(centerlineLength(pts), 800 + 50 * Math.PI, 0.05, "Länge");
  assert.deepEqual(pts[0].r.map((x) => Math.round(x * 1e6) / 1e6), [0, 1, 0]); // Innenseite der Biegung
  const last = pts[pts.length - 1];
  near(last.r[0], -1, 1e-3, "Bezug dreht im Bogen mit");
});

test("Wendel: Bezug zeigt zur Achse, Bohrung von außen liegt bei 180°", () => {
  const path = { c: [0, 0, 0], r: 1000, a0: 0, sweep: 90, rise: 500 };
  const pts = centerline({ path }, 5);
  near(pts[0].r[0], -1, 1e-4);
  const h = locateHole(pts, { p: [1018, 0, 0], d: [-1, 0, 0], r: 4 }, 21.3);
  near(h.s, 0, 1, "s"); near(h.phi, 180, 0.5, "φ"); assert.equal(h.through, false);
  assert.equal(locateHole(pts, { p: [0, 0, 5000], d: [1, 0, 0], r: 4 }, 21.3), null, "weit weg");
});

test("CSV mit Länge und Bohrbild", () => {
  const csv = stretchCsv("Handlauf", 1234.56, [{ s: 100, phi: 90, d: 8.5, through: false }]);
  assert.match(csv, /Gestreckte Länge mm;1234,6/);
  assert.match(csv, /1;100;90;8,5;eine Wand/);
});
