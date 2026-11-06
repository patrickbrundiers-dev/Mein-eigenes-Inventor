// Zuschnittliste (P1-C): Gruppierung, Enden, CSV – ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { cutListRows, cutListCsv, endsText, CUT_RULES } from "../src/core/cutlist.js";

const member = (profileId, length, miterStart = 0, miterEnd = 0, extra = {}) => ({ kind: "member", meta: { section: profileId, profileId, area: 100, length, miterStart, miterEnd, ...extra }, props: { volume: 100 * length } });
const src = (name, bodies, qty = 1, material = "S235") => ({ part: { name, material }, result: { bodies }, qty });

test("Gleiches Profil, Länge, Enden, Werkstoff = eine Zeile mit Anzahl", () => {
  const rows = cutListRows([
    src("Rahmen", [member("QR 40x40x3", 500.04, 45, 45), member("QR 40x40x3", 499.96, 45, 45), member("QR 40x40x3", 300, 45, 45), { kind: "solid" }]),
    src("Rahmen 2", [member("QR 40x40x3", 500, 45, 45)], 3),
  ]);
  assert.equal(rows.length, 2);
  const r500 = rows.find((r) => r.length === 500);
  assert.equal(r500.qty, 5); // 2 + 3 (Baugruppe mit drei Exemplaren)
  assert.equal(r500.parts, "Rahmen, Rahmen 2");
  assert.deepEqual(rows.map((r) => r.pos), [1, 2]);
  assert.ok(rows[0].length > rows[1].length, "längste zuerst je Profil");
});

test("Enden unabhängig von der Richtung, andere Gehrung oder Werkstoff = eigene Zeile", () => {
  const rows = cutListRows([
    src("A", [member("RR 42,4x2", 800, 30, 0), member("RR 42,4x2", 800, 0, 30), member("RR 42,4x2", 800, 45, 0)]),
    src("B", [member("RR 42,4x2", 800, 30, 0)], 1, "1.4301"),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.miters[1] === 30 && r.material === "Stahl S235JR").qty, 2);
});

test("Enden als Text und Knickrahmen als ausgeklinkt", () => {
  assert.equal(endsText({ miters: [0, 0], coped: false }), "gerade");
  assert.equal(endsText({ miters: [0, 45], coped: false }), "0°/45°");
  assert.equal(endsText({ miters: [0, 0], coped: true }), "gerade, ausgeklinkt");
  const [kr] = cutListRows([src("Knick", [member("RE 60x40x3", 1454.27, 0, 0, { coped: true, knicks: 2 })])]);
  assert.equal(kr.length, 1454.3);
  assert.equal(kr.coped, true);
});

test("CSV: Kopf unverändert (Rohrlaser-Import), deutsches Zahlenformat, Masse aus Volumen", () => {
  const text = cutListCsv(cutListRows([src("R", [member("QR 40x40x3", 1234.5, 45, 45)], 2)]));
  const [head, line] = text.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(head, "Pos;Profil-ID;Profil;Zuschnittlänge mm;Menge;Gehrung Anfang °;Gehrung Ende °;Ausgeklinkt;kg/m;kg/Stk;kg gesamt;Werkstoff;Bauteil");
  const cells = line.split(";");
  assert.equal(cells[3], "1234,5");
  assert.equal(cells[4], "2");
  assert.equal(cells[9], "0,969"); // 100 mm² · 1234,5 mm · 7,85 g/cm³
  assert.ok(CUT_RULES.length >= 4);
});

test("Summen je Profil: Stück, Gesamtlänge, Gewicht (Megacad-Abgleich M1)", async () => {
  const { cutListTotals } = await import("../src/core/cutlist.js");
  const { kgPerMeter } = await import("../src/core/sections.js");
  const rows = cutListRows([src("R", [member("QR 40x40x3", 1000), member("QR 40x40x3", 500), member("RR 42,4x2", 600)], 2)]);
  const t = cutListTotals(rows);
  const qr = t.groups.find((g) => g.profileId === "QR 40x40x3");
  assert.equal(qr.qty, 4);
  assert.equal(qr.length, 3000);
  assert.ok(Math.abs(qr.mass - (100 * 3000 * 7.85) / 1e6) < 1e-9);
  assert.equal(t.qty, 6);
  assert.equal(t.length, 4200);
  assert.ok(Math.abs(qr.kgm - kgPerMeter(100, 7.85)) < 1e-12);
  assert.ok(Math.abs(kgPerMeter(444, 7.85) - 3.4854) < 1e-9); // QR 40x40x3: 4,44 cm² → 3,49 kg/m
});

test("Gehrung in zwei Ebenen: Anteile Breite/Höhe, Kennzeichen und Kopf unverändert (MegaCAD-Abgleich M3)", async () => {
  const { twoPlaneParts, partsText } = await import("../src/core/cutlist.js");
  assert.equal(twoPlaneParts({ A: { b: 45, h: 0 }, B: { b: 0, h: 0 } }), null, "eine Ebene");
  assert.deepEqual(twoPlaneParts({ A: { b: -41.8, h: 24.1 }, B: { b: 0, h: 0 } }), [{ b: 0, h: 0 }, { b: 41.8, h: 24.1 }]);
  const mp = { A: { b: 0, h: 0 }, B: { b: 41.8, h: -24.1 } };
  const rows = cutListRows([src("Zug", [member("QR 40x40x3", 1024.8, 0, 45, { miterParts: mp }), member("QR 40x40x3", 1024.8, 45, 0, { miterParts: { A: mp.B, B: mp.A } }), member("QR 40x40x3", 1024.8, 0, 45)])]);
  assert.equal(rows.length, 2, "gleiche räumliche Teile zusammen, ebene Gehrung extra");
  const r2 = rows.find((r) => r.miterParts);
  assert.equal(r2.qty, 2);
  assert.match(endsText(r2), /2 Ebenen/);
  assert.equal(partsText(r2), "Ende B: 41,8° Breite / 24,1° Höhe");
  assert.equal(cutListCsv(rows).replace(/^\ufeff/, "").split("\r\n")[0].split(";").length, 13, "CSV-Kopf bleibt gleich");
});

test("Biegerohr in der Zuschnittliste: Abwicklungslänge, Kennzeichen gebogen", () => {
  const bends = [{ straight: 500, rotation: 0, angle: 90 }, { straight: 200, rotation: 90, angle: 90 }];
  const rows = cutListRows([src("Bügel", [member("RR 48,3x2,6", 1214.16, 0, 0, { bends, bendRadius: 100 }), member("RR 48,3x2,6", 1214.16, 0, 0, { bends, bendRadius: 100 }), member("RR 48,3x2,6", 1214.16)])]);
  assert.equal(rows.length, 2);
  const b = rows.find((r) => r.bent);
  assert.equal(b.qty, 2);
  assert.equal(endsText(b), "gerade, gebogen 2× R 100");
});

test("Excel-Export: gültiges ZIP mit Blättern, Zahlen als Zahlen (MegaCAD-Abgleich M18)", async () => {
  const { buildXlsx, crc32, colName } = await import("../src/core/xlsx.js");
  const { listSheets } = await import("../src/core/lists.js");
  assert.equal(colName(0), "A"); assert.equal(colName(25), "Z"); assert.equal(colName(26), "AA"); assert.equal(colName(701), "ZZ");
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const cut = cutListRows([src("Rahmen", [member("QR 40x40x3", 1000, 45, 45), member("QR 40x40x3", 1000, 45, 45)])]);
  const sheets = listSheets({ cut, welds: [{ pos: 1, kind: "kehl", a: 4, side: "pfeil", around: true, field: false, count: 2, length: 320, mass: 0.04, parts: "Rahmen" }], bom: [] });
  assert.deepEqual(sheets.map((s) => s.name), ["Zuschnitt", "Summen je Profil", "Nahtliste"]);
  assert.equal(sheets[0].rows[1][3], 1000, "Länge als Zahl");
  const nested = listSheets({ structure: [{ level: "1", name: "Feld", kind: "assembly", qty: 2, total: 2 }, { level: "1.1", name: "Pfosten", kind: "part", qty: 3, total: 6 }],
    modular: [{ name: "Anlage", rows: [{ pos: 1, name: "Feld", kind: "assembly", qty: 2 }] }, { name: "Feld", rows: [{ pos: 1, name: "Pfosten", kind: "part", qty: 3 }] }] });
  assert.deepEqual(nested.map((s) => s.name), ["Strukturstückliste", "Baukastenstückliste"]);
  assert.deepEqual(nested[0].rows[2], ["1.1", "Pfosten", null, "Bauteil", 3, 6]);
  assert.equal(nested[1].rows.length, 4, "Kopf, Anlage, Leerzeile, Feld");
  const bytes = buildXlsx(sheets);
  // ZIP lesen: lokale Kopfzeilen, CRC je Eintrag prüfen
  const dv = new DataView(bytes.buffer), names = [];
  for (let p = 0; dv.getUint32(p, true) === 0x04034b50;) {
    const size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nlen));
    const data = bytes.subarray(p + 30 + nlen, p + 30 + nlen + size);
    assert.equal(crc32(data), dv.getUint32(p + 14, true), "CRC " + name);
    names.push(name);
    if (name === "xl/worksheets/sheet1.xml") assert.match(new TextDecoder().decode(data), /<c r="D2"><v>1000<\/v><\/c>/);
    p += 30 + nlen + size;
  }
  assert.ok(names.includes("[Content_Types].xml") && names.includes("xl/worksheets/sheet3.xml"));
  assert.equal(dv.getUint32(bytes.length - 22, true), 0x06054b50, "Endsatz");
});

test("Stangenplan: Best Fit Decreasing, Fuge, Reste, zu lange Teile (E1)", async () => {
  const { planBars, barText } = await import("../src/core/stangen.js");
  const { listSheets } = await import("../src/core/lists.js");
  const { validateValue, settingDef } = await import("../src/core/settings.js");
  const rows = [
    { pos: 1, profileId: "QR 40x40x3", material: "S235", length: 2500, qty: 3, kgm: 3.41 },
    { pos: 2, profileId: "QR 40x40x3", material: "S235", length: 1000, qty: 3, kgm: 3.41 },
    { pos: 3, profileId: "QR 40x40x3", material: "S235", length: 7000, qty: 1, kgm: 3.41 },
    { pos: 4, profileId: "FL 40x5", material: "S235", length: 1500, qty: 2, kgm: 1.57 },
  ];
  const p = planBars(rows, { stock: 6000, trim: 10, rest: 140, kerf: 3 });
  const qr = p.groups.find((g) => g.profileId === "QR 40x40x3");
  assert.equal(qr.usable, 5850);
  // 2500 + 3 + 2500 = 5003, Rest 847 → kein 1000er; dritte 2500 + 3×1000 (+3×3) = 5509 → 3 Stück 1000 passen
  assert.equal(qr.bars.length, 2);
  assert.equal(qr.bars[0].pieces.length, 2);
  assert.equal(qr.bars[1].pieces.length, 4);
  assert.equal(qr.bars[0].rest, 847);
  assert.equal(qr.bars[1].rest, 5850 - 2500 - 3000 - 9);
  assert.deepEqual(qr.tooLong, [{ pos: 3, length: 7000, qty: 1 }]);
  assert.equal(qr.partLength, 10500);
  assert.ok(Math.abs(qr.wastePct - (100 * 1500) / 12000) < 1e-9);
  assert.ok(Math.abs(qr.wasteKg - 1.5 * 3.41) < 1e-9);
  assert.equal(barText(qr.bars[1]), "2500 (Pos 1) + 3 × 1000 (Pos 2)");
  const fl = planBars(rows, { stock: 6000, stockBy: { "FL 40x5": 3000 } }).groups.find((g) => g.profileId === "FL 40x5");
  assert.equal(fl.stock, 3000);
  assert.equal(fl.bars.length, 1, "2 × 1500 genau auf 3000 ohne Fuge und Reste");
  assert.equal(fl.bars[0].rest, 0);
  const sh = listSheets({ cut: [], bars: p }).find((s) => s.name === "Stangenplan");
  assert.ok(sh.rows.some((r) => /passt nicht: 1 × 7000 \(Pos 3\)/.test(r[4] || "")));
  assert.equal(sh.rows.at(-1)[3], 3, "Summe Stangen");
  const def = settingDef("fertigung.stangenJeProfil");
  assert.ok(validateValue(def, { "QR 40x40x3": 12000 }).ok);
  assert.ok(!validateValue(def, { "QR 40x40x3": 50 }).ok);
});
