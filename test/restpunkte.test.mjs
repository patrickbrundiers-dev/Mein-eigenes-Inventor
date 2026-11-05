// Restpunkte SolidCraft: mehrere Tasten je Befehl, Modelltasten aus Skizzen
import test from "node:test";
import assert from "node:assert/strict";
import { validateKeymap, effectiveKeymap, commandForCombo, combosOf, keymapConflicts } from "../src/core/commands.js";

test("L8: mehrere Tasten je Befehl, normalisiert, Konflikt mit jeder davon", () => {
  const r = validateKeymap({ "part.fillet": "strg+F7; F8" });
  assert.ok(r.ok, r.error);
  assert.equal(r.value["part.fillet"], "Strg+F7;F8");
  const map = effectiveKeymap(r.value);
  assert.equal(commandForCombo(map, "F8", "part")?.id, "part.fillet");
  assert.equal(commandForCombo(map, "Strg+F7", "part")?.id, "part.fillet");
  assert.deepEqual(combosOf(map["part.fillet"]), ["Strg+F7", "F8"]);
  const ext = effectiveKeymap({})["part.extrude"];
  const bad = validateKeymap({ "part.fillet": `F8;${ext}` });
  assert.equal(bad.ok, false);
  assert.ok(keymapConflicts(effectiveKeymap({ "part.fillet": `F8;${ext}` })).length > 0);
  assert.equal(validateKeymap({ "part.fillet": "F2;F3;F4;F5;F6" }).ok, false, "höchstens 4");
});

test("L8: Modelltasten aus Skizzen heraus nur mit Einstellung", () => {
  const map = effectiveKeymap({});
  const ext = map["part.extrude"];
  assert.ok(ext);
  const inSketch = commandForCombo(map, ext, "sketch");
  assert.ok(!inSketch || inSketch.scope !== "part");
  const withPref = commandForCombo(map, ext, "sketch", { modelFromSketch: true });
  assert.ok(withPref);
  // Skizzenbefehle haben weiter Vorrang
  if (inSketch) assert.equal(withPref.id, inSketch.id);
  else assert.equal(withPref.id, "part.extrude");
});

test("L10: Ziehen am Gelenk – Wert aus Mausweg, im Bereich", async () => {
  const K = await import("../src/core/kinematik.js");
  const j = K.defaultJoint([0, 0, 0], [0, 0, 1], { min: -30, max: 90 });
  let r = K.dragJointValue(j, [100, 0, 0], [0, 100, 0]);
  assert.ok(Math.abs(r.value - 90) < 1e-9 && !r.atLimit);
  r = K.dragJointValue(j, [100, 0, 0], [0, -100, 0]);
  assert.equal(r.value, -30); assert.ok(r.atLimit);
  const s = K.defaultJoint([0, 0, 0], [1, 0, 0], { kind: "schiebe", min: 0, max: 50 });
  assert.equal(K.dragJointValue(s, [0, 0, 0], [20, 7, 0]).value, 20);
  assert.equal(K.dragJointValue(s, [0, 0, 0], [80, 0, 0]).value, 50);
});

test("L10: Gelenkkette – Kind-Gelenk geht samt Achse mit, Vorfahren bleiben", async () => {
  const K = await import("../src/core/kinematik.js");
  const arm = { id: "a", name: "Arm", pos: [0, 0, 0], rot: [0, 0, 0], joint: K.defaultJoint([0, 0, 0], [0, 0, 1], { min: -180, max: 180 }) };
  const hand = { id: "b", name: "Hand", pos: [100, 0, 0], rot: [0, 0, 0], joint: { ...K.defaultJoint([100, 0, 0], [0, 0, 1], { min: -90, max: 90 }), parent: "a" } };
  const asm = { components: [arm, hand], constraints: [] };
  assert.deepEqual(K.jointFollowers(asm, "a"), ["b"]);
  assert.deepEqual(K.jointFollowers(asm, "b"), []);
  assert.equal(K.canChainTo(asm, "a", "b"), false);
  K.setJointAngle(arm, 90, [hand]);
  assert.ok(Math.abs(hand.pos[0]) < 1e-6 && Math.abs(hand.pos[1] - 100) < 1e-6);
  assert.ok(Math.abs(hand.joint.p[1] - 100) < 1e-6);
  // Hand dreht jetzt um die mitgewanderte Achse
  const before = [...hand.pos];
  K.setJointAngle(hand, 45, []);
  assert.ok(Math.hypot(hand.pos[0] - before[0], hand.pos[1] - before[1]) < 1e-6);
});

test("L11: Stücklistentyp untrennbar/Kaufteil und Garnituren", async () => {
  const S = await import("../src/core/subasm.js");
  const p = (id) => ({ id, kind: "part", name: id });
  const docs = { a: p("a"), b: p("b"), s: p("s"), w: p("w"), n: p("n"),
    weld: { id: "weld", kind: "assembly", name: "Rahmen", bomStructure: "untrennbar", components: [{ id: "x1", part: "a", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "x2", part: "b", pos: [0, 0, 0], rot: [0, 0, 0] }] },
    buy: { id: "buy", kind: "assembly", name: "Motor", bomStructure: "kaufteil", components: [{ id: "y1", part: "a", pos: [0, 0, 0], rot: [0, 0, 0] }] } };
  const docOf = (id) => docs[id];
  const top = { id: "top", kind: "assembly", components: [
    { id: "c1", part: "weld", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "c2", part: "buy", pos: [0, 0, 0], rot: [0, 0, 0] },
    { id: "g1", part: "s", garnitur: "G", garniturLead: true, pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "g2", part: "w", garnitur: "G", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "g3", part: "w", garnitur: "G", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "g4", part: "n", garnitur: "G", pos: [0, 0, 0], rot: [0, 0, 0] },
    { id: "w9", part: "w", pos: [0, 0, 0], rot: [0, 0, 0] }] };
  const occ = S.flattenAssembly(top, docOf, { bom: true, units: true });
  assert.deepEqual(occ.filter((o) => o.unit).map((o) => o.part.id), ["weld", "buy"]);
  assert.equal(S.flattenAssembly(top, docOf, { bom: true }).filter((o) => o.part.id === "a").length, 2);
  const st = S.structureBom(top, docOf);
  assert.ok(st.some((r) => r.level === "1.1")); // untrennbar: Inhalt in der Struktur
  assert.ok(!st.some((r) => r.level.startsWith("2."))); // Kaufteil: nicht aufgelöst
  assert.equal(st.find((r) => r.doc.id === "buy").bom, "kaufteil");
  assert.equal(S.modularBom(top, docOf).length, 2);
  const g = S.garniturGroups(occ, (d) => ["s", "w", "n"].includes(d.id) ? d.id.toUpperCase() : null);
  assert.deepEqual([...g.get("S")], [["W", 2], ["N", 1]]);
});

test("L12: 3MF-Objekte je Komponente, Auswahl", async () => {
  const M = await import("../src/core/meshexport.js");
  const tri = (x, g) => ({ name: "K", group: g, groupName: g.toUpperCase(), pos: [x, 0, 0, x + 1, 0, 0, x, 1, 0], idx: null, color: [1, 0, 0] });
  const ms = [tri(0, "a"), tri(5, "a"), tri(10, "b")];
  assert.deepEqual(M.meshGroups(ms).map((g) => [g.key, g.bodies]), [["a", 2], ["b", 1]]);
  const per = M.groupMeshes(ms, "komponente");
  assert.equal(per.length, 2); assert.equal(per[0].name, "A"); assert.deepEqual(per[0].idx, [0, 1, 2, 3, 4, 5]);
  assert.equal(M.groupMeshes(ms, "koerper").length, 3);
  assert.equal(M.groupMeshes(ms, "eins", { title: "T" })[0].name, "T");
  assert.equal(M.groupMeshes(ms, "komponente", { only: new Set(["b"]) }).length, 1);
  const z = M.write3mf(per, { title: "x" });
  assert.ok(z.length > 100);
});
