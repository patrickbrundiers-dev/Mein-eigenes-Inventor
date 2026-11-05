// SolidCraft-Konfigurationstabelle: Unterdrückung und Werkstoff je Variante
import test from "node:test";
import assert from "node:assert/strict";
import { checkVariants, variantPart, SUPPRESS_PREFIX, MATERIAL_COLUMN } from "../src/core/varianten.js";

test("Variante unterdrückt ein Feature und setzt den Werkstoff", () => {
  const part = { id: "w", kind: "part", name: "W", material: "S235", params: [{ name: "L", expr: "100" }], features: [{ id: "f1", type: "extrude" }, { id: "f2", type: "hole" }],
    variants: { columns: ["L", SUPPRESS_PREFIX + "f2", MATERIAL_COLUMN], rows: [{ id: "r1", name: "A", values: { L: "200", [SUPPRESS_PREFIX + "f2"]: "ja", [MATERIAL_COLUMN]: "1.4301" } }, { id: "r2", name: "B", values: { L: "", [SUPPRESS_PREFIX + "f2"]: "nein" } }] } };
  assert.deepEqual(checkVariants(part), []);
  const a = variantPart(part, part.variants.rows[0], "a");
  assert.equal(a.features[1].suppressed, true); assert.equal(a.material, "1.4301"); assert.equal(a.params[0].expr, "200");
  const b = variantPart(part, part.variants.rows[1], "b");
  assert.equal(b.features[1].suppressed, undefined); assert.equal(b.material, "S235");
  part.variants.rows[0].values[SUPPRESS_PREFIX + "f2"] = "vielleicht";
  assert.ok(checkVariants(part).some((e) => /ja.*nein/.test(e)));
  part.variants.columns.push(SUPPRESS_PREFIX + "fehlt");
  assert.ok(checkVariants(part).some((e) => /Feature fehlt/.test(e)));
});
