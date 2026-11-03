// Arbeitsabläufe nach Inventor/SolidWorks (AW1–AW5), ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { whereUsed, whereUsedText } from "../src/core/verwendung.js";
import { designItems, copyDesign, independentCopy, nextCopyName, renamed, COPY, REUSE } from "../src/core/kopiekonstruieren.js";
import { docProperties, fillPlaceholders, unknownPlaceholders, setCustomProp, removeCustomProp, customProps, syncDrawingTitles } from "../src/core/eigenschaften.js";
import { flattenAssembly, partCounts, structureBom, modularBom } from "../src/core/subasm.js";
import { validateProject } from "../src/core/project.js";

const part = (id, extra = {}) => ({ id, kind: "part", name: id.toUpperCase(), number: "", features: [], ...extra });
const comp = (id, p, extra = {}) => ({ id, part: p, name: `${p}:1`, pos: [0, 0, 0], rot: [0, 0, 0], ...extra });

function sample() {
  const rohr = part("rohr", { number: "BT-001" });
  const platte = part("platte", { number: "BT-002" });
  const schraube = part("schraube", { features: [{ id: "n1", type: "normteil" }] });
  const motor = part("motor", { kaufteil: true });
  const abgel = part("abgel", { features: [{ id: "f1", type: "abgeleitet", source: "rohr" }] });
  const sub = { id: "sub", kind: "assembly", name: "Rahmen", number: "BG-10", components: [comp("s1", "rohr"), comp("s2", "rohr"), comp("s3", "platte")] };
  const top = { id: "top", kind: "assembly", name: "Anlage", number: "BG-1", components: [comp("t1", "sub"), comp("t2", "schraube"), comp("t3", "motor")], bomOrder: ["platte", "rohr"] };
  const drw = { id: "drw", kind: "drawing", name: "Zeichnung Rahmen", source: { kind: "assembly", id: "sub" }, title: { benennung: "Rahmen", nummer: "BG-10" }, views: [], dims: [], posOrder: ["rohr"], balloons: [{ id: "b1", part: "rohr" }] };
  const drwRohr = { id: "drwRohr", kind: "drawing", name: "Zeichnung Rohr", source: { kind: "part", id: "rohr" }, title: { benennung: "ROHR", nummer: "BT-001" }, views: [], dims: [] };
  return { format: "werkcad", version: 1, name: "Projekt 24", docs: [rohr, platte, schraube, motor, abgel, sub, top, drw, drwRohr] };
}
const docOf = (prj) => (id) => prj.docs.find((d) => d.id === id);

test("AW1 Wo verwendet: Baugruppen mit Anzahl, Zeichnungen, abgeleitete Teile, oberste Baugruppe", () => {
  const prj = sample();
  const w = whereUsed(prj, "rohr");
  assert.deepEqual(w.assemblies.map((a) => [a.doc.id, a.count]), [["sub", 2]]);
  assert.deepEqual(w.drawings.map((d) => d.id), ["drwRohr"]);
  assert.deepEqual(w.derived.map((d) => d.id), ["abgel"]);
  assert.deepEqual(w.top.map((d) => d.id), ["top"]);
  assert.equal(whereUsedText(w), "1 Baugruppe · 1 Zeichnung · 1 abgeleitetes Bauteil");
  assert.equal(whereUsedText(whereUsed(prj, "top")), "nirgends verwendet");
});

test("AW2 Kopie konstruieren: Vorschläge – Kaufteile und Normteile weiterverwenden, Zeichnungen der Teile dabei", () => {
  const prj = sample();
  const items = designItems(prj, "top");
  const act = Object.fromEntries(items.map((it) => [it.doc.id, it.action]));
  assert.equal(act.top, COPY);
  assert.equal(act.sub, COPY);
  assert.equal(act.rohr, COPY);
  assert.equal(act.schraube, REUSE);
  assert.equal(act.motor, REUSE);
  assert.ok(items.some((it) => it.drawing && it.doc.id === "drw"));
  assert.ok(items.some((it) => it.drawing && it.doc.id === "drwRohr"));
  assert.ok(!items.some((it) => it.doc.id === "abgel"), "abgeleitete Teile sind nicht eingebaut");
});

test("AW2 Kopie konstruieren: Verweise zeigen auf Kopien, Wiederverwendetes bleibt, Projekt bleibt gültig", () => {
  const prj = sample();
  const r = copyDesign(prj, "top", { actions: { platte: REUSE }, naming: { prefix: "P25-", suffix: "" } });
  const ids = r.docs.map((d) => d.id);
  assert.equal(ids.length, 5, "top, sub, rohr und beide Zeichnungen");
  const nt = r.docs.find((d) => d.id === r.root), ns = r.docs.find((d) => d.id === r.map.get("sub")), nr = r.docs.find((d) => d.id === r.map.get("rohr"));
  assert.equal(nt.name, "P25-Anlage");
  assert.equal(nt.number, "P25-BG-1");
  assert.deepEqual(nt.components.map((c) => c.part), [r.map.get("sub"), "schraube", "motor"]);
  assert.deepEqual(nt.bomOrder, ["platte", r.map.get("rohr")]);
  assert.deepEqual(ns.components.map((c) => c.part), [nr.id, nr.id, "platte"]);
  const nd = r.docs.find((d) => d.kind === "drawing" && d.source.id === ns.id);
  assert.equal(nd.title.benennung, "P25-Rahmen");
  assert.equal(nd.title.nummer, "P25-BG-10");
  assert.deepEqual(nd.posOrder, [nr.id]);
  assert.equal(nd.balloons[0].part, nr.id);
  // Original unverändert
  assert.equal(prj.docs.find((d) => d.id === "sub").components[0].part, "rohr");
  prj.docs.push(...r.docs);
  assert.deepEqual(validateProject(prj).filter((i) => i.severity !== "info"), []);
});

test("AW2 Kopie konstruieren: Generator-Einzelteile folgen der Baugruppe, Freigabe und Verknüpfung entfallen", () => {
  const prj = sample();
  const gen = { id: "gen", kind: "assembly", name: "Geländer", components: [comp("g1", "gp")], generator: { gen: "gelaender", params: {} }, release: { state: "freigegeben" } };
  const gp = part("gp", { genAsm: "gen", features: [{ id: "x", type: "genteil" }] });
  const linked = part("lnk", { link: { path: "C:/x.wcad" } });
  prj.docs.push(gen, gp, linked);
  prj.docs.find((d) => d.id === "top").components.push(comp("t4", "gen"), comp("t5", "lnk"));
  const items = designItems(prj, "top");
  assert.ok(items.find((it) => it.doc.id === "gp").locked);
  assert.equal(items.find((it) => it.doc.id === "lnk").action, REUSE);
  const r1 = copyDesign(prj, "top", { actions: { gp: REUSE } }); // gesperrt: folgt dem Generator
  const ngp = r1.docs.find((d) => d.id === r1.map.get("gp"));
  assert.ok(ngp, "Einzelteil mitkopiert");
  assert.equal(ngp.genAsm, r1.map.get("gen"));
  assert.equal(r1.docs.find((d) => d.id === r1.map.get("gen")).release, undefined);
  const r2 = copyDesign(prj, "top", { actions: { gen: REUSE } });
  assert.ok(!r2.map.has("gp"), "Generator wiederverwendet → Einzelteil auch");
  assert.ok(!r2.map.has("lnk"));
});

test("AW2 Kopie konstruieren: Zeichnung wird nicht kopiert, wenn ihre Quelle wiederverwendet wird", () => {
  const prj = sample();
  const r = copyDesign(prj, "top", { actions: { rohr: REUSE, drwRohr: COPY } });
  assert.ok(!r.map.has("drwRohr"));
  assert.ok(!copyDesign(prj, "top", { actions: { drw: REUSE } }).map.has("drw"));
});

test("AW3 Unabhängig machen: nur die gewählte Komponente bekommt die Kopie", () => {
  const prj = sample();
  const sub = prj.docs.find((d) => d.id === "sub");
  const r = independentCopy(prj, sub, ["s2"]);
  assert.equal(r.error, null);
  assert.equal(r.doc.name, "ROHR-2");
  assert.equal(r.doc.number, "BT-001-2");
  assert.equal(sub.components[0].part, "rohr");
  assert.equal(sub.components[1].part, r.doc.id);
  assert.equal(sub.components[1].name, "rohr:1", "eigener Name bleibt, wenn er nicht dem Bauteil folgt");
  const gp = part("gp", { genAsm: "sub" });
  prj.docs.push(gp);
  sub.components.push(comp("s9", "gp"));
  assert.match(independentCopy(prj, sub, ["s9"]).error, /Generator/);
  assert.equal(nextCopyName({ docs: [{ name: "A-2" }] }, "A"), "A-3");
  assert.equal(renamed("Rahmen links", { find: "links", replace: "rechts", suffix: "-B" }), "Rahmen rechts-B");
});

test("AW4 Eigenschaften: feste und eigene Felder, Platzhalter im Schriftfeld", () => {
  const d = part("p", { name: "Konsole", number: "K-7", description: "Wandkonsole", designer: "PB" });
  assert.ok(setCustomProp(d, "Kunde", "Müller"));
  setCustomProp(d, "kunde", "Meier"); // gleicher Name, andere Schreibweise → überschreibt
  assert.deepEqual(customProps(d), [{ name: "Kunde", value: "Meier" }]);
  const props = docProperties(d, { materialLabel: "S235JR", status: "In Arbeit", projectName: "Halle 3" });
  assert.equal(fillPlaceholders("{Name} · {nummer} · {Kunde} · {Projekt} · {Werkstoff} · {Konstrukteur}", props), "Konsole · K-7 · Meier · Halle 3 · S235JR · PB");
  assert.equal(fillPlaceholders("{Tippfehler}", props), "{Tippfehler}");
  assert.deepEqual(unknownPlaceholders("{Kunde} {Gibtsnicht}", props), ["Gibtsnicht"]);
  d.projekt = "Eigenes Projekt";
  assert.equal(fillPlaceholders("{Projekt}", docProperties(d, { projectName: "Halle 3" })), "Eigenes Projekt");
  assert.ok(removeCustomProp(d, "KUNDE"));
  assert.equal(d.props, undefined);
});

test("AW4 Umbenennen zieht Schriftfelder nach, eigene Einträge bleiben", () => {
  const prj = sample();
  const rohr = prj.docs.find((d) => d.id === "rohr");
  const own = { id: "d2", kind: "drawing", source: { kind: "part", id: "rohr" }, title: { benennung: "Eigener Titel", nummer: "Z-9" }, views: [], dims: [] };
  prj.docs.push(own);
  const old = { name: rohr.name, number: rohr.number };
  rohr.name = "Rohr 40x40";
  rohr.number = "BT-101";
  assert.equal(syncDrawingTitles(prj, rohr, old), 1);
  const t = prj.docs.find((d) => d.id === "drwRohr").title;
  assert.deepEqual([t.benennung, t.nummer], ["Rohr 40x40", "BT-101"]);
  assert.deepEqual([own.title.benennung, own.title.nummer], ["Eigener Titel", "Z-9"]);
});

test("AW5 Stücklistenstruktur: Referenz-Komponenten zählen nicht, Phantom-Baugruppen lösen sich auf", () => {
  const prj = sample();
  const top = prj.docs.find((d) => d.id === "top");
  top.components.find((c) => c.id === "t3").bom = "referenz";
  const of = docOf(prj);
  assert.equal(flattenAssembly(top, of).length, 5, "Geometrie: alle Teile");
  assert.equal(flattenAssembly(top, of, { bom: true }).length, 4, "Stückliste: ohne Referenz");
  assert.equal(partCounts(top, of).get("motor"), undefined);
  assert.equal(partCounts(top, of).get("rohr"), 2);
  assert.deepEqual(structureBom(top, of).map((r) => [r.level, r.doc.id, r.qty]), [["1", "sub", 1], ["1.1", "rohr", 2], ["1.2", "platte", 1], ["2", "schraube", 1]]);
  prj.docs.find((d) => d.id === "sub").bomStructure = "phantom";
  top.components.push(comp("t6", "sub"));
  assert.deepEqual(structureBom(top, of).map((r) => [r.level, r.doc.id, r.qty, r.total]), [["1", "rohr", 4, 4], ["2", "platte", 2, 2], ["3", "schraube", 1, 1]]);
  assert.deepEqual(modularBom(top, of).map((m) => m.asm.id), ["top"], "Phantom erscheint nicht als eigene Baukastenliste");
  assert.equal(partCounts(top, of).get("rohr"), 4, "Mengen bleiben richtig");
});
