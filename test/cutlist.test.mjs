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
