import test from "node:test";
import assert from "node:assert/strict";
import { miniBarItems } from "../src/core/minileiste.js";

const ids = (hits) => miniBarItems(hits).map((x) => x.id);

test("Mini-Leiste: Kanten bieten Rundung, Fase, Naht", () => {
  assert.deepEqual(ids([{ kind: "edge" }, { kind: "edge" }]), ["fillet", "chamfer", "naht", "measure", "fitSel"]);
});

test("Mini-Leiste: eine ebene Fläche bietet Skizze und Normalansicht", () => {
  assert.deepEqual(ids([{ kind: "face", info: { type: "PLANE" } }]), ["faceSketch", "normal", "shell", "measure", "fitSel"]);
  assert.deepEqual(ids([{ kind: "face", info: { type: "CYLINDER" } }]), ["shell", "measure", "fitSel"]);
  assert.deepEqual(ids([{ kind: "face", info: { type: "PLANE" } }, { kind: "face", info: { type: "PLANE" } }]), ["shell", "measure", "fitSel"]);
});

test("Mini-Leiste: gemischte Auswahl nur Messen und Zeigen, leere gar nichts", () => {
  assert.deepEqual(ids([{ kind: "edge" }, { kind: "face" }]), ["measure", "fitSel"]);
  assert.deepEqual(ids([]), []);
  assert.deepEqual(ids(null), []);
});
