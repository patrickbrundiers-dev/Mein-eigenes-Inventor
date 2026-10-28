// DSTV-NC (Stahlbau-Lücken ST1): Kopf, Text, Gleichteile, Flächen – ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { dstvProfile, dstvProfileName, dstvText, parseDstv, groupPieces, dstvFileName, dstvCuts, faceOf, faceY, steelGrade, withSignature, piecesOf } from "../src/core/dstv.js";
import { catalogToDims } from "../src/core/sections.js";

const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));

test("DSTV: Profilcode und Kopfmaße je Querschnitt", () => {
  const ipe = dstvProfile("ipe", num(catalogToDims("ipe", "200")));
  assert.deepEqual([ipe.code, ipe.H, ipe.B, ipe.tf, ipe.tw, ipe.r], ["I", 200, 100, 8.5, 5.6, 12]);
  assert.equal(dstvProfileName("hea", num(catalogToDims("hea", "200")), "HEA 200"), "HEA200");
  assert.equal(dstvProfile("rechteck", { B: 60, H: 40, t: 3 }).code, "M");
  assert.equal(dstvProfile("rechteck", { B: 60, H: 40, t: 3 }).r, 6, "Außenradius 2t wie im Querschnitt");
  assert.equal(dstvProfileName("rechteck", { B: 60, H: 40, t: 3 }), "RRO60x40x3");
  assert.equal(dstvProfile("rohr", { D: 48.3, t: 2.6 }).code, "RO");
  assert.equal(dstvProfileName("rohr", { D: 48.3, t: 2.6 }), "RO48.3x2.6");
  assert.equal(dstvProfile("rund", { D: 20 }).code, "RU");
  assert.equal(dstvProfile("winkel", { B: 60, H: 40, t: 5 }).code, "L");
  assert.equal(dstvProfile("upn", num(catalogToDims("upn", "100"))).code, "U");
  assert.equal(dstvProfile("flach", { B: 60, t: 8 }).code, "B");
});

test("DSTV: Fläche und y je Lage der Bohrung (v/h ab Unterkante, o ab Vorderkante, u ab Hinterkante)", () => {
  assert.equal(faceOf(1, 0, 0, 10), "v", "Steg in der Mitte → v");
  assert.equal(faceOf(1, 0, -28, 0), "v");
  assert.equal(faceOf(1, 0, 28, 0), "h");
  assert.equal(faceOf(0, 1, 0, 18), "o");
  assert.equal(faceOf(0, 1, 0, -18), "u");
  assert.equal(faceOf(0, 1, 5, 0, true), "v", "Flachstahl: alles auf v");
  assert.equal(faceY("v", 0, 30, 100, 200), 130);
  assert.equal(faceY("o", -20, 95, 100, 200), 30);
  assert.equal(faceY("u", -20, -95, 100, 200), 70);
});

test("DSTV: Text – Kopf mit 24 Zeilen, Blöcke BO/AK/SI, Langloch und geschlossene Kontur, Leser liest es zurück", () => {
  const p = withSignature({ order: "A-1", drawing: "Z-7", pos: "12", material: "S355J2", qty: 3, profile: "IPE200", code: "I", length: 2500, H: 200, B: 100, tf: 8.5, tw: 5.6, r: 12, kgm: 22.36, paint: 0.768,
    cuts: { webA: 15, webB: 0, flA: 0, flB: 0 }, holes: [{ face: "o", x: 50, y: 25, d: 22 }, { face: "v", x: 100, y: 100, d: 18, slot: { l: 30, angle: 0 } }], si: { face: "v", x: 50, y: 100, h: 10 }, texts: ["Träger"] });
  const t = dstvText(p);
  assert.match(t, /^ST\r\n\*\* PBCAD\r\n/);
  assert.ok(t.endsWith("EN\r\n"));
  const r = parseDstv(t);
  assert.equal(r.head.length, 24);
  assert.deepEqual(r.head.slice(0, 8), ["A-1", "Z-7", "1", "12", "S355J2", "3", "IPE200", "I"]);
  assert.equal(Number(r.head[8]), 2500); assert.equal(Number(r.head[16]), 15);
  assert.equal(r.head[20], "Träger"); assert.equal(r.head[21], "-");
  const bo = r.blocks.BO[0];
  assert.equal(bo.length, 2);
  assert.equal(bo[0][0], "v", "v vor o sortiert");
  assert.deepEqual(bo[0].slice(1, 4), [100, 100, 18]);
  assert.ok(t.includes("l"), "Langloch-Kennung");
  assert.equal(bo[0][5], 30, "Langloch-Länge nach der Kennung l");
  assert.equal(String(r.blocks.SI[0][0].at(-1)), "12");
  const pl = dstvText({ order: "", drawing: "D", pos: "2", material: "S235JR", qty: 1, profile: "BL10", code: "B", length: 200, H: 100, B: 10, tf: 10, tw: 10, ak: [[0, 0, 0], [200, 0, 0], [200, 100, 0], [0, 100, 0]] });
  const ak = parseDstv(pl).blocks.AK[0];
  assert.equal(ak.length, 5, "erster Punkt am Ende wiederholt");
  assert.deepEqual(ak[0], ak[4]);
  assert.equal(parseDstv(pl).head[0], "-", "leere Felder als »-«");
});

test("DSTV: Gleichteile zusammenfassen, Stäbe vor Platten, Dateiname, Gehrungen und Werkstoff", () => {
  const base = { order: "", drawing: "D", material: "S235JR", code: "M", profile: "QRO40x3", H: 40, B: 40, tf: 3, tw: 3, r: 6, kgm: 3.4, cuts: {} };
  const list = groupPieces([
    { ...base, name: "a", length: 500, qty: 2, holes: [{ face: "o", x: 100, y: 20, d: 10 }] },
    { ...base, name: "b", length: 500, qty: 1, holes: [{ face: "o", x: 100, y: 20, d: 10 }] },
    { ...base, name: "c", length: 500, qty: 1, holes: [{ face: "o", x: 110, y: 20, d: 10 }] },
    { ...base, name: "pl", code: "B", profile: "BL10", length: 100, qty: 4, ak: [[0, 0, 0], [100, 0, 0], [100, 50, 0]] },
    { ...base, name: "d", length: 900, qty: 1, holes: [] },
  ]);
  assert.deepEqual(list.map((p) => [p.pos, p.length, p.qty]), [["1", 900, 1], ["2", 500, 3], ["3", 500, 1], ["4", 100, 4]]);
  assert.deepEqual(list[1].sources, ["a", "b"]);
  assert.equal(dstvFileName(list[1]), "P002_QRO40x3.nc1");
  assert.deepEqual(dstvCuts({ miterStart: 45, miterEnd: 30 }), { webA: 45, webB: 30, flA: 0, flB: 0 });
  assert.deepEqual(dstvCuts({ miterParts: { A: { b: 10, h: 20 }, B: { b: 0, h: 0 } } }), { webA: 20, webB: 0, flA: 10, flB: 0 });
  assert.equal(steelGrade({ key: "S235", label: "Stahl S235JR" }), "S235JR");
  assert.equal(steelGrade({ key: "1.4301", label: "Edelstahl 1.4301" }), "1.4301");
  assert.equal(steelGrade({ key: "X", label: "Holz" }), "X");
});

test("DSTV: Stücke aus Kernel-Daten – übersprungene Körper mit Grund, Ausklinkung als Hinweis", () => {
  const data = [
    { index: 0, name: "Stab 1", kind: "member", sec: { kind: "vierkant", dims: { B: 40, t: 3 } }, section: "Quadratrohr 40x40x3", area: 420, length: 800, perimeter: 160, miterStart: 45, miterEnd: 0, holes: [], skipped: 1, coped: true },
    { index: 1, name: "Bogen", kind: "skip", reason: "gebogen – Abwicklung über die Biegeliste" },
  ];
  const r = piecesOf({ part: { name: "Rahmen" }, qty: 1, data }, { key: "S235", label: "Stahl S235JR", density: 7.85 });
  assert.equal(r.pieces.length, 1);
  assert.equal(r.pieces[0].cuts.webA, 45);
  assert.ok(Math.abs(r.pieces[0].kgm - 3.297) < 0.001);
  assert.equal(r.skipped.length, 3);
  assert.ok(r.skipped.some((s) => /gebogen/.test(s.reason)) && r.skipped.some((s) => /Ausklinkung/.test(s.reason)) && r.skipped.some((s) => /schräg/.test(s.reason)));
});
