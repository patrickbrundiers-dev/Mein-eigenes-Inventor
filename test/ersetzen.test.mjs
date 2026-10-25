// Komponente ersetzen (FU7)
import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceComponents, sameOccurrences } from "../src/core/subasm.js";

const docs = () => {
  const a = { id: "a", kind: "part", name: "Pfosten 60" };
  const b = { id: "b", kind: "part", name: "Pfosten 80" };
  const asm = { id: "g", kind: "assembly", name: "Tor", components: [
    { id: "c1", part: "a", name: "Pfosten 60:1", pos: [0, 0, 0], rot: [0, 0, 90], fixed: true },
    { id: "c2", part: "a", name: "Pfosten 60:2", pos: [1000, 0, 0], rot: [0, 0, 0], joint: { type: "dreh" } },
    { id: "c3", part: "a", name: "Links", pos: [2000, 0, 0], rot: [0, 0, 0] },
  ], constraints: [{ id: "k1", type: "gegen", a: { comp: "c1", n: [1, 0, 0], d: 30 }, b: { comp: "c2", n: [-1, 0, 0], d: 30 } }] };
  const outer = { id: "o", kind: "assembly", name: "Anlage", components: [{ id: "x", part: "g" }] };
  const all = [a, b, asm, outer];
  return { a, b, asm, outer, docOf: (id) => all.find((d) => d.id === id) };
};

test("eine Komponente ersetzen: Lage, Fixierung, Gelenk und Abhängigkeiten bleiben, Name folgt", () => {
  const { asm, b, docOf } = docs();
  const r = replaceComponents(asm, ["c1"], b, docOf);
  assert.deepEqual(r, { replaced: 1, constraints: 1, error: null });
  const c1 = asm.components[0];
  assert.deepEqual([c1.part, c1.name, c1.pos, c1.rot, c1.fixed], ["b", "Pfosten 80:1", [0, 0, 0], [0, 0, 90], true]);
  assert.equal(asm.components[1].part, "a");
  assert.equal(asm.constraints[0].a.comp, "c1");
});

test("alle Vorkommen ersetzen; eigener Name bleibt", () => {
  const { asm, b, docOf } = docs();
  const ids = sameOccurrences(asm, "c2");
  assert.deepEqual(ids, ["c1", "c2", "c3"]);
  const r = replaceComponents(asm, ids, b, docOf);
  assert.equal(r.replaced, 3);
  assert.deepEqual(asm.components.map((c) => [c.part, c.name]), [["b", "Pfosten 80:1"], ["b", "Pfosten 80:2"], ["b", "Links"]]);
  assert.deepEqual(asm.components[1].joint, { type: "dreh" });
});

test("kein Kreisbezug: Baugruppe nicht durch sich selbst oder eine übergeordnete ersetzen", () => {
  const { asm, outer, docOf } = docs();
  assert.match(replaceComponents(asm, ["c1"], asm, docOf).error, /selbst/);
  assert.match(replaceComponents(asm, ["c1"], outer, docOf).error, /Kreisbezug/);
  assert.equal(asm.components[0].part, "a");
});
