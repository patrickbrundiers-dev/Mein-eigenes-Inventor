// Parameter der Baugruppe an Bauteile weitergeben (FU4)
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedPart, partsLinkedTo, pushParams, unlinkParam, linkSources, hasLinks } from "../src/core/baugruppenparameter.js";
import { resolveParams } from "../src/core/expr.js";

const asm = () => ({ id: "g", kind: "assembly", name: "Regal", params: [{ name: "Breite", expr: "800" }, { name: "Tiefe", expr: "Breite / 2" }], components: [] });
const part = (id, params) => ({ id, kind: "part", name: "Teil " + id, params, features: [] });

test("Verknüpfter Parameter rechnet mit dem Wert der Baugruppe, eigener Ausdruck bleibt Rückfall", () => {
  const g = asm();
  const p = part("a", [{ name: "L", expr: "500", link: { asm: "g", name: "Tiefe" } }, { name: "L2", expr: "L - 10" }]);
  const docOf = (id) => (id === "g" ? g : null);
  const r = linkedPart(p, docOf);
  assert.deepEqual(r.errors, []);
  assert.notEqual(r.part, p);
  assert.equal(resolveParams(r.part.params).values.L2, 390);
  assert.equal(p.params[0].expr, "500", "Original unverändert");
  g.params[0].expr = "1000";
  assert.equal(resolveParams(linkedPart(p, docOf).part.params).values.L, 500);
  // fehlende Baugruppe / fehlender Parameter: Rückfallwert und Meldung
  const r2 = linkedPart(p, () => null);
  assert.equal(r2.part.params[0].expr, "500");
  assert.match(r2.errors[0], /Baugruppe fehlt/);
  const r3 = linkedPart(part("b", [{ name: "X", expr: "1", link: { asm: "g", name: "Höhe" } }]), docOf);
  assert.match(r3.errors[0], /keinen Parameter Höhe/);
  const plain = part("c", [{ name: "X", expr: "1" }]);
  assert.equal(linkedPart(plain, docOf).part, plain);
});

test("An Bauteile weitergeben: gleichnamige verknüpfen, fehlende auf Wunsch anlegen", () => {
  const g = asm();
  const a = part("a", [{ name: "Breite", expr: "500" }]);
  const b = part("b", []);
  let res = pushParams(g, [a, b], ["Breite", "Tiefe"]);
  assert.deepEqual(res.map((x) => [x.part.id, x.name, x.added]), [["a", "Breite", false]]);
  assert.deepEqual(a.params[0].link, { asm: "g", name: "Breite" });
  assert.equal(a.params[0].expr, "800");
  assert.equal(pushParams(g, [a], ["Breite"]).length, 0, "schon verknüpft");
  res = pushParams(g, [a, b], ["Tiefe"], { add: true });
  assert.deepEqual(res.map((x) => [x.part.id, x.added]), [["a", true], ["b", true]]);
  assert.equal(b.params[0].expr, "400");
  assert.deepEqual(partsLinkedTo([g, a, b, part("c", [])], "g").map((p) => p.id), ["a", "b"]);
  assert.deepEqual(linkSources(a), ["g"]);
  assert.equal(hasLinks(part("c", [])), false);
});

test("Verknüpfung lösen: letzter Wert bleibt als eigener Ausdruck", () => {
  const g = asm();
  const p = { name: "L", expr: "1", link: { asm: "g", name: "Tiefe" } };
  unlinkParam(p, (id) => (id === "g" ? g : null));
  assert.deepEqual(p, { name: "L", expr: "400" });
});
