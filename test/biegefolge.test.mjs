// Biegefolge Abkantpresse (W7), ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { dieWidth, minFlange, polyline, bendSequence, bendSheetPage } from "../src/core/biegefolge.js";

test("Matrize nach Blechdicke und Mindestschenkel", () => {
  assert.equal(dieWidth(1), 6);
  assert.equal(dieWidth(2), 12);
  assert.equal(dieWidth(5), 40);
  assert.equal(minFlange(16), 12);
});

test("Polylinie: U-Profil schließt rechtwinklig", () => {
  const p = polyline([40, 100, 40], [90, 90]);
  assert.equal(p.length, 4);
  const last = p.at(-1);
  assert.ok(Math.abs(last[0]) < 1e-9 && Math.abs(last[1] - 100) < 1e-9, JSON.stringify(last));
});

test("Flaches U geht, tiefes U stößt an der Oberwange an", () => {
  const u = bendSequence([40, 100, 40], [90, 90], 2);
  assert.ok(u.ok, JSON.stringify(u));
  assert.equal(u.steps.length, 2);
  const deep = bendSequence([120, 60, 120], [90, 90], 2);
  assert.equal(deep.ok, false);
  assert.ok(deep.steps.some((s) => s.hits.includes("Oberwange")), JSON.stringify(deep.steps));
});

test("Umschlag kommt zuletzt, Kurzschenkel wird gemeldet", () => {
  const r = bendSequence([10, 80, 30, 8], [90, 90, 180], 1);
  assert.equal(r.steps.at(-1).hem, true);
  assert.equal(r.steps.at(-1).bend, 3);
  assert.ok(r.issues.some((x) => x.includes("Umschlag")));
  const s = bendSequence([5, 80], [90], 2);
  assert.ok(s.issues.some((x) => x.includes("Schenkel 1")));
});

test("Biegeblatt als A4-Seite", () => {
  const res = bendSequence([40, 100, 40], [90, 90], 2);
  const page = bendSheetPage({ title: "Kantteil 1", legs: [40, 100, 40], angles: [90, 90], t: 2, tool: {}, result: res });
  assert.equal(page.width, 210);
  assert.ok(page.html.includes("Schritt 2") && page.html.includes("<svg"));
});
