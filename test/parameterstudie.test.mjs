import test from "node:test";
import assert from "node:assert/strict";
import { sweepValues, sweepPart, sweepRow } from "../src/core/parameterstudie.js";

test("Parameterstudie: Werte, Kopie, Bewertung", () => {
  assert.deepEqual(sweepValues({ from: "10", to: "30", steps: 4 }), [10, 15, 20, 25, 30]);
  assert.deepEqual(sweepValues({ list: "5; 7,5 12" }), [5, 7.5, 12]);
  assert.throws(() => sweepValues({ list: "a" }));
  const part = { id: "p", params: [{ name: "L", expr: "100" }], features: [{ id: "e", name: "Extrusion" }], endAfter: "e" };
  const c = sweepPart(part, "L", 40, 2);
  assert.equal(c.params[0].expr, "40"); assert.equal(c.id, "p@studie2"); assert.equal(part.params[0].expr, "100"); assert.equal(c.endAfter, undefined);
  const base = { status: { e: { ok: true } }, bodies: [{ props: { volume: 10 } }] };
  assert.equal(sweepRow({ status: { e: { ok: true } }, bodies: [{ props: { volume: 5 } }] }, base, part.features).verdict, "ok");
  const bad = sweepRow({ status: { e: { ok: false, error: "Abstand muss > 0 sein" } }, bodies: [] }, base, part.features);
  assert.equal(bad.verdict, "fehler"); assert.match(bad.fails[0], /Extrusion: Abstand/);
  assert.equal(sweepRow({ status: { e: { ok: true } }, bodies: [] }, base).verdict, "koerper");
});
