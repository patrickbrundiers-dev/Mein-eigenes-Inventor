import { test } from "node:test";
import assert from "node:assert/strict";
import { treeEntries, endPosition, featureDetail } from "../src/core/baum.js";

const part = () => ({
  params: [{ name: "Dicke", expr: "10" }],
  features: [
    { id: "s1", type: "sketch" },
    { id: "e1", type: "extrude", sketch: "s1", distance: "Dicke" },
    { id: "s2", type: "sketch" },
    { id: "h1", type: "hole", sketch: "s2", diameter: "11", extent: "through" },
    { id: "s3", type: "sketch" },
  ],
});

test("genutzte Skizzen stehen unter ihrem Feature", () => {
  const e = treeEntries(part());
  assert.deepEqual(e.map((x) => x.f.id), ["e1", "h1", "s3"]);
  assert.deepEqual(e[0].children.map((c) => c.f.id), ["s1"]);
  assert.deepEqual(e[1].children.map((c) => c.f.id), ["s2"]);
});

test("flache Liste, wenn ausgeschaltet", () => {
  assert.deepEqual(treeEntries(part(), { nest: false }).map((x) => x.f.id), ["s1", "e1", "s2", "h1", "s3"]);
});

test("geteilte Skizze nur unter dem ersten Feature", () => {
  const p = part();
  p.features.push({ id: "e2", type: "extrude", sketch: "s1", distance: "5" });
  const e = treeEntries(p);
  assert.deepEqual(e.find((x) => x.f.id === "e2").children, []);
  assert.deepEqual(e[0].children.map((c) => c.f.id), ["s1"]);
});

test("Skizze vor dem Bauteilende bleibt oben, wenn ihr Feature dahinter liegt", () => {
  const e = treeEntries(part(), { endAt: 3 }); // s1, e1, s2 gerechnet
  assert.deepEqual(e.map((x) => x.f.id), ["e1", "s2", "h1", "s3"]);
  assert.equal(endPosition(e, 3), 2);
  assert.equal(endPosition(treeEntries(part()), 5), 3);
  assert.equal(endPosition(treeEntries(part(), { endAt: 0 }), 0), 0);
});

test("erweiterte Namen rechnen Parameter aus", () => {
  const p = part();
  assert.equal(featureDetail(p.features[1], p), "10 mm");
  assert.equal(featureDetail(p.features[3], p), "Ø 11 durch");
  assert.equal(featureDetail({ type: "fillet", radius: "2.5" }, p), "R 2,5");
  assert.equal(featureDetail({ type: "extrude", mode: "through" }, p), "durch alles");
  assert.equal(featureDetail({ type: "extrude", distance: "kaputt+" }, p), "");
  assert.equal(featureDetail({ type: "sketch" }, p), "");
});

test("Suche: Wörter, Groß-/Kleinschreibung, Unterpunkte", async () => {
  const { matchesQuery, filterEntries } = await import("../src/core/baum.js");
  assert.ok(matchesQuery(["Bohrungen M10", "Bohrung"], "m10"));
  assert.ok(matchesQuery(["Skizze Kontur"], "kontur skizze"));
  assert.ok(!matchesQuery(["Skizze Kontur"], "rohr"));
  assert.ok(matchesQuery(["x"], "  "));
  const p = part();
  p.features[0].name = "Kontur";
  const e = filterEntries(treeEntries(p), (f) => matchesQuery([f.name, f.id], "kontur"));
  assert.deepEqual(e.map((x) => [x.f.id, x.children.map((c) => c.f.id), !!x.open]), [["e1", ["s1"], true]]);
  const all = filterEntries(treeEntries(p), (f) => f.id === "e1");
  assert.deepEqual(all[0].children.map((c) => c.f.id), ["s1"]);
});

test("Ordner: aufeinanderfolgende Features zusammen, Nachbarordner", async () => {
  const { groupFolders, neighbourFolders } = await import("../src/core/baum.js");
  const p = part();
  p.features[1].folder = "Grundkörper";
  p.features[3].folder = "Grundkörper";
  const e = treeEntries(p);
  const g = groupFolders(e);
  assert.equal(g.length, 2);
  assert.equal(g[0].folder, "Grundkörper");
  assert.deepEqual(g[0].entries.map((x) => x.f.id), ["e1", "h1"]);
  assert.equal(g[1].f.id, "s3");
  assert.deepEqual(neighbourFolders(e, "s3"), ["Grundkörper"]);
  assert.deepEqual(neighbourFolders(e, "h1"), []);
  assert.deepEqual(neighbourFolders(e, "s2"), []); // Skizze unter h1: h1 ist schon im Ordner
});
