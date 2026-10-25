// Bauteil im Kontext der Baugruppe bearbeiten (FU21)
import { test } from "node:test";
import assert from "node:assert/strict";
import { contextScene, contextComponents, contextLabel } from "../src/core/kontext.js";
import { matApply } from "../src/core/geom.js";

const near = (a, b, tol = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < tol);

const docs = [
  { id: "a", kind: "assembly", name: "Tor", components: [
    { id: "c1", part: "p1", name: "Pfosten", pos: [0, 0, 0], rot: [0, 0, 0] },
    { id: "c2", part: "p2", name: "Riegel", pos: [100, 0, 500], rot: [0, 0, 90] },
    { id: "c3", part: "u", pos: [0, 200, 0], rot: [0, 0, 0] },
    { id: "c4", part: "p1", pos: [0, 0, 0], rot: [0, 0, 0], hidden: true },
  ] },
  { id: "u", kind: "assembly", name: "Beschlag", components: [
    { id: "x1", part: "p1", pos: [0, 0, 10], rot: [0, 0, 0] },
    { id: "x2", part: "p2", pos: [0, 0, 20], rot: [0, 0, 0] },
  ] },
  { id: "p1", kind: "part", name: "Rohr", features: [] },
  { id: "p2", kind: "part", name: "Flach", features: [] },
];
const docOf = (id) => docs.find((d) => d.id === id);

test("Nachbarn stehen relativ zum bearbeiteten Bauteil, Unterbaugruppe mit jedem Teil", () => {
  const asm = docOf("a");
  const s = contextScene(asm, "c2", docOf);
  assert.equal(s.part.id, "p2");
  assert.deepEqual(s.others.map((o) => [o.id, o.partId]), [["c1", "p1"], ["c3/0", "p1"], ["c3/1", "p2"]]);
  // Ursprung des Pfostens (Welt 0,0,0) im System des Riegels: Riegel steht bei (100,0,500), um Z 90° gedreht
  assert.ok(near(matApply(s.others[0].matrix, [0, 0, 0]), [0, 100, -500]), JSON.stringify(matApply(s.others[0].matrix, [0, 0, 0])));
  // Rückweg: Riegel-Matrix · relative Matrix = Weltlage
  assert.ok(near(matApply(s.matrix, matApply(s.others[2].matrix, [0, 0, 0])), [0, 200, 20]));
  assert.equal(contextScene(asm, "c3", docOf), null, "Unterbaugruppe selbst nicht");
  assert.equal(contextScene(asm, "fehlt", docOf), null);
});

test("Auswahl und Text", () => {
  const asm = docOf("a");
  assert.deepEqual(contextComponents(asm, docOf).map((c) => c.id), ["c1", "c2"]);
  assert.equal(contextLabel(asm, "c2", docOf), "Riegel in Tor");
});
