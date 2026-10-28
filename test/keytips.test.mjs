import test from "node:test";
import assert from "node:assert/strict";
import { assignKeyTips, matchKeyTip } from "../src/core/keytips.js";

test("Tastenhinweise: Wortanfang bevorzugt, eindeutig und präfixfrei", () => {
  const tabs = assignKeyTips(["3D-Modell", "Metallbau", "Verwalten", "Konstruktion", "Export", "Ansicht"], ["D"]);
  assert.deepEqual(tabs, ["3", "M", "V", "K", "E", "A"]);
  const many = Array.from({ length: 60 }, (_, i) => "Knopf " + i);
  const codes = assignKeyTips(many);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(Boolean));
  for (const a of codes) for (const b of codes) if (a !== b) assert.ok(!b.startsWith(a), `${a} ist Anfang von ${b}`);
});

test("Tastenhinweise: Umlaute zählen als Grundbuchstabe", () => {
  assert.deepEqual(assignKeyTips(["Ändern", "Übernehmen"]), ["A", "U"]);
});

test("Tastenhinweise: Tippen trifft, wartet oder verfehlt", () => {
  const c = ["A", "B", "Q1", "Q2"];
  assert.deepEqual(matchKeyTip(c, "b"), { kind: "hit", index: 1 });
  assert.deepEqual(matchKeyTip(c, "Q"), { kind: "prefix" });
  assert.deepEqual(matchKeyTip(c, "q2"), { kind: "hit", index: 3 });
  assert.deepEqual(matchKeyTip(c, "Z"), { kind: "none" });
});
