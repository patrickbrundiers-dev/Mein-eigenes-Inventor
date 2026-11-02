import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSteps } from "../src/core/naechster.js";
import { stepValue, isPlainNumber, dragSteps } from "../src/core/wertschritt.js";

const ids = (s) => s?.items.map((i) => i.id);
const rect = { id: "s1", type: "sketch", name: "Skizze1", points: [], entities: [
  { id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "b", p2: "c" },
  { id: "l3", type: "line", p1: "c", p2: "d" }, { id: "l4", type: "line", p1: "d", p2: "a" }] };

test("Nächster Schritt: leeres Bauteil bietet Skizze, Profil, Kantteil, Normteil", () => {
  const s = nextSteps({ mode: "part", doc: { kind: "part", features: [] } });
  assert.deepEqual(ids(s), ["sketch", "profile", "kantteil", "normteil"]);
});

test("Nächster Schritt: geschlossene, unbenutzte Skizze → Extrudieren zuerst", () => {
  const s = nextSteps({ mode: "part", doc: { kind: "part", features: [rect] } });
  assert.equal(ids(s)[0], "extrude");
  assert.ok(ids(s).includes("frame"));
  assert.match(s.key, /^skizze:s1$/);
  // benutzt → kein Hinweis mehr
  assert.equal(nextSteps({ mode: "part", doc: { kind: "part", features: [rect, { id: "e", type: "extrude", sketch: "s1" }] } }), null);
});

test("Nächster Schritt: offener Linienzug → nur Rahmen; leere Skizze → nichts", () => {
  const open = { ...rect, entities: rect.entities.slice(0, 3) };
  assert.deepEqual(ids(nextSteps({ mode: "part", doc: { kind: "part", features: [open] } })), ["frame"]);
  assert.equal(nextSteps({ mode: "part", doc: { kind: "part", features: [{ ...rect, entities: [] }] } }), null);
});

test("Nächster Schritt: leere Baugruppe und leeres Blatt, sonst nichts", () => {
  assert.equal(ids(nextSteps({ mode: "assembly", doc: { kind: "assembly", components: [] } }))[0], "place");
  assert.equal(nextSteps({ mode: "assembly", doc: { kind: "assembly", components: [{}] } }), null);
  assert.equal(ids(nextSteps({ mode: "drawing", doc: { kind: "drawing", views: [] } }))[0], "dv_base");
  assert.equal(nextSteps({ mode: "sketch", doc: { kind: "part", features: [] } }), null);
  assert.equal(nextSteps({ mode: "start", doc: null }), null);
});

test("Wert per Rad: Schritte 1 / 0,1 / 10, Komma bleibt, Ausdrücke unangetastet", () => {
  assert.equal(stepValue("100", 1), "101");
  assert.equal(stepValue("100", -3, { coarse: true }), "70");
  assert.equal(stepValue("12,37", 1, { fine: true }), "12,5");
  assert.equal(stepValue("12.4", -1, { fine: true }), "12.3");
  assert.equal(stepValue("0.5", -1), "0");
  assert.equal(stepValue("L/2", 1), null);
  assert.equal(isPlainNumber(" -4,5 "), true);
  assert.equal(isPlainNumber("B+20"), false);
});

test("Wert per Rad: Grenzen für nicht negativ und nicht null", () => {
  assert.equal(stepValue("0", -1, { allowNeg: false }), "0");
  assert.equal(stepValue("1", -1, { allowNeg: false, allowZero: false }), "1");
  assert.equal(stepValue("3", -1, { allowZero: false, allowNeg: false }), "2");
  assert.equal(stepValue("0.1", -1, { fine: true, allowZero: false, allowNeg: false }), "0.1");
});

test("Ziehen: 6 px je Schritt, rechts/oben positiv", () => {
  assert.equal(dragSteps(13, 0), 2);
  assert.equal(dragSteps(0, 12), -2);
  assert.equal(dragSteps(-5, 0), 0);
});
