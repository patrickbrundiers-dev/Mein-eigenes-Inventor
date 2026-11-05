import test from "node:test";
import assert from "node:assert/strict";
import { presetFrom, applyPreset, validateHolePresets, holeDiagramSvg } from "../src/core/bohrvorlagen.js";
import { loadSettings } from "../src/core/settings.js";

test("Bohrungsvorlagen: speichern, anwenden, prüfen (SolidCraft)", () => {
  const f = { id: "h", type: "hole", sketch: "s1", thread: "M8", extent: "depth", depth: "15", tip: "flach", sink: "senkung", sinkDiameter: "16", sinkAngle: "90" };
  const p = presetFrom(f, " M8 tief ");
  assert.equal(p.name, "M8 tief");
  assert.equal(p.values.sketch, undefined);
  const g = { id: "g", type: "hole", sketch: "s9", diameter: "5", extent: "through" };
  applyPreset(g, p);
  assert.deepEqual([g.sketch, g.thread, g.depth, g.tip, g.diameter, g.extent], ["s9", "M8", "15", "flach", undefined, "depth"]);
  assert.ok(validateHolePresets([p]).ok);
  assert.equal(validateHolePresets([p, p]).ok, false);
  assert.equal(validateHolePresets([{ name: "x", values: { sketch: "s1" } }]).ok, false);
  const svg = holeDiagramSvg({ d: 5, depth: 10, tip: 118 });
  assert.ok(svg.includes("118°") && svg.includes("Ø5") && svg.includes(">10<"));
  assert.ok(!holeDiagramSvg({ d: 5, depth: null }).includes("°"));
});

test("Bohrungsvorlagen überleben Laden der Einstellungen", () => {
  const r = loadSettings({ "werkzeuge.bohrvorlagen": [{ name: "M6 durch", values: { thread: "M6", extent: "through" } }] });
  const v = r.values || r;
  assert.equal(v["werkzeuge.bohrvorlagen"][0].name, "M6 durch");
});
