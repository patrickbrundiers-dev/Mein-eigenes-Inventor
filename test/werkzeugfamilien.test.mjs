import test from "node:test";
import assert from "node:assert/strict";
import { familyTool, familyOf } from "../src/core/werkzeugfamilien.js";

test("Werkzeugfamilien: letzte Variante, nochmal drücken schaltet weiter (SolidCraft L7)", () => {
  assert.equal(familyTool("rect"), "rect");
  assert.equal(familyTool("rect", { memo: { rect: "rectc" } }), "rectc");
  assert.equal(familyTool("rect", { memo: { rect: "rectc" }, current: "rectc", idle: true }), "rect3");
  assert.equal(familyTool("rect", { memo: { rect: "rectr" }, current: "rectr", idle: true }), "rect");
  assert.equal(familyTool("rect", { memo: { rect: "rectc" }, current: "rectc", idle: false }), "rectc");
  assert.equal(familyTool("rect", { memo: { rect: "rectc" }, current: "rectc", idle: true, cycle: false }), "rectc");
  assert.equal(familyTool("circle", { memo: { circle: "unsinn" } }), "circle");
  assert.equal(familyOf("linem"), "line");
  assert.equal(familyOf("trim"), null);
});
