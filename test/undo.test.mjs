// Rückgängig-Stände (SY2): geteilte Texte für unveränderte Dokumente, Größenbudget, Wiederherstellen
import test from "node:test";
import assert from "node:assert/strict";
import { snapshot, restoreSnapshot, snapshotSize, trimStack } from "../src/core/undo.js";

const project = () => ({ format: "werkcad", version: 1, name: "P", docs: [{ id: "a", kind: "part", features: [{ id: "f", big: "x".repeat(10000) }] }, { id: "b", kind: "part", features: [] }], images: { i1: { data: "y".repeat(5000) } } });

test("Stand wiederherstellen ergibt dasselbe Projekt in derselben Schlüsselreihenfolge", () => {
  const p = project();
  const r = restoreSnapshot(snapshot(p));
  assert.deepEqual(r, p);
  assert.deepEqual(Object.keys(r), Object.keys(p));
  assert.notEqual(r.docs[0], p.docs[0], "neue Objekte");
});

test("unveränderte Dokumente und Bilder zählen über viele Stände nur einmal", () => {
  const p = project();
  const stack = [];
  for (let i = 0; i < 50; i++) {
    p.docs[1].features.push({ id: "g" + i });
    stack.push({ snap: snapshot(p, stack[stack.length - 1]?.snap) });
  }
  const size = snapshotSize(stack.map((e) => e.snap));
  assert.ok(size < 10000 + 5000 + 50 * 2000, `geteilt: ${size}`);
  assert.equal(stack[0].snap.docs[0], stack[49].snap.docs[0], "derselbe Text");
});

test("Budget verwirft die ältesten Stände, der jüngste bleibt", () => {
  const p = project();
  const stack = [];
  for (let i = 0; i < 10; i++) { p.docs[0].features[0].big = String(i).repeat(10000); stack.push({ snap: snapshot(p), i }); }
  trimStack(stack, { budget: 35000 });
  assert.ok(stack.length >= 1 && stack.length <= 3, String(stack.length));
  assert.equal(stack[stack.length - 1].i, 9);
  trimStack(stack, { budget: 1 });
  assert.equal(stack.length, 1);
});
