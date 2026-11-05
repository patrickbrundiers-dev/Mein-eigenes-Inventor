// Restpunkte SolidCraft: mehrere Tasten je Befehl, Modelltasten aus Skizzen
import test from "node:test";
import assert from "node:assert/strict";
import { validateKeymap, effectiveKeymap, commandForCombo, combosOf, keymapConflicts } from "../src/core/commands.js";

test("L8: mehrere Tasten je Befehl, normalisiert, Konflikt mit jeder davon", () => {
  const r = validateKeymap({ "part.fillet": "strg+F7; F8" });
  assert.ok(r.ok, r.error);
  assert.equal(r.value["part.fillet"], "Strg+F7;F8");
  const map = effectiveKeymap(r.value);
  assert.equal(commandForCombo(map, "F8", "part")?.id, "part.fillet");
  assert.equal(commandForCombo(map, "Strg+F7", "part")?.id, "part.fillet");
  assert.deepEqual(combosOf(map["part.fillet"]), ["Strg+F7", "F8"]);
  const ext = effectiveKeymap({})["part.extrude"];
  const bad = validateKeymap({ "part.fillet": `F8;${ext}` });
  assert.equal(bad.ok, false);
  assert.ok(keymapConflicts(effectiveKeymap({ "part.fillet": `F8;${ext}` })).length > 0);
  assert.equal(validateKeymap({ "part.fillet": "F2;F3;F4;F5;F6" }).ok, false, "höchstens 4");
});

test("L8: Modelltasten aus Skizzen heraus nur mit Einstellung", () => {
  const map = effectiveKeymap({});
  const ext = map["part.extrude"];
  assert.ok(ext);
  const inSketch = commandForCombo(map, ext, "sketch");
  assert.ok(!inSketch || inSketch.scope !== "part");
  const withPref = commandForCombo(map, ext, "sketch", { modelFromSketch: true });
  assert.ok(withPref);
  // Skizzenbefehle haben weiter Vorrang
  if (inSketch) assert.equal(withPref.id, inSketch.id);
  else assert.equal(withPref.id, "part.extrude");
});
