// Stabilität: welche Kernfehler einen Neustart auslösen, Treppenauge der U-Treppe ohne Kollision
import test from "node:test";
import assert from "node:assert/strict";
import { isFatal } from "../src/kernel/fatal.js";
import { GENERATORS, resolveGenParams, defaultGenerator } from "../src/core/generator.js";

test("schwere Kernfehler: WebAssembly-Absturz, Speicher voll, Stapelüberlauf", () => {
  assert.ok(isFatal(new WebAssembly.RuntimeError("memory access out of bounds")));
  assert.ok(isFatal(new WebAssembly.RuntimeError("unreachable")));
  assert.ok(isFatal(new RangeError("Maximum call stack size exceeded")));
  assert.ok(isFatal(new RangeError("Array buffer allocation failed")));
  assert.ok(isFatal(new Error("Aborted(OOM)")));
});

test("gewöhnliche Fehler starten den Kern nicht neu (Zwischenspeicher bleibt)", () => {
  assert.ok(!isFatal(new Error("Rundung nicht möglich – Radius zu groß?")));
  assert.ok(!isFatal(new RangeError("Ungültiger Wert")));
  assert.ok(!isFatal(null));
  assert.ok(!isFatal(42));
});

const plan = (over) => {
  const f = defaultGenerator("treppe");
  Object.assign(f.params, over);
  return GENERATORS.treppe.plan(resolveGenParams("treppe", f.params, (x) => Number(String(x).replace(",", "."))));
};

test("U-Treppe: Befestigungsblech am Treppenauge sitzt an der Wange, nicht quer davor (keine Kollision)", () => {
  for (const turn of ["links", "rechts"]) {
    const p = plan({ form: "U", gap: "200", turn });
    const hits = p.issues.filter((i) => /kollidiert/.test(i.message));
    assert.deepEqual(hits.map((i) => i.message), [], `Wendung ${turn}`);
  }
  const p = plan({ form: "U", gap: "200" });
  const blech = p.plates.find((x) => x.name === "Geländer links Pfosten 4 Befestigungsblech");
  assert.ok(blech, "Blech vorhanden");
  assert.ok(Math.abs(blech.normal[1]) > 0.99, "Blech liegt an der Wange (Normale quer zum Lauf)");
});
