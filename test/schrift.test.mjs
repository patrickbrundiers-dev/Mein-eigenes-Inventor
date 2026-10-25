// Text in der Skizze (Fusion-Abgleich FU1): Umrisse, Platzhalter, Konturen, DXF
import { test } from "node:test";
import assert from "node:assert/strict";
import { textLoops, textBox, resolveText, partTextVars, textPolylines, LINE_FACTOR } from "../src/core/schrift.js";
import { extractProfiles, sketchBounds } from "../src/core/sketch.js";
import { sketchToDxf } from "../src/core/dxf.js";
import { entitiesInBox } from "../src/core/sketchshapes.js";

const ent = (text, extra = {}) => ({ id: "t", type: "text", p: "a", text, h: 10, angle: 0, style: "normal", align: "links", ...extra });
const sketch = (e, at = { x: 0, y: 0 }) => ({ points: [{ id: "a", ...at }], entities: [e], constraints: [] });
const box = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

test("Schrifthöhe = Versalhöhe: »H« ist genau h hoch und steht auf der Grundlinie", () => {
  const pl = textPolylines(ent("H", { h: 10 }), { x: 5, y: 7 }).flat();
  const [, y0, , y1] = box(pl);
  assert.ok(Math.abs(y0 - 7) < 1e-9 && Math.abs(y1 - 17) < 1e-9, `${y0} … ${y1}`);
});

test("Konturen: »o« hat Außen- und Innenkontur → ein Bereich mit Loch; Umlaute aus zusammengesetzten Zeichen", () => {
  const prof = extractProfiles(sketch(ent("o")));
  assert.equal(prof.regions.length, 1);
  assert.equal(prof.regions[0].holes.length, 1);
  assert.equal(prof.errors.length, 0);
  // »Ä«: A mit Loch und zwei Punkten
  const ae = extractProfiles(sketch(ent("Ä")));
  assert.equal(ae.regions.length, 3);
  assert.equal(ae.regions.reduce((n, r) => n + r.holes.length, 0), 1);
  // jede Kontur geschlossen: letzter Punkt = Start
  for (const l of textLoops(ent("Ä8%"), { x: 0, y: 0 })) assert.deepEqual(l.segs.at(-1).to, l.start);
});

test("Ausrichtung und Winkel: Mitte halbiert, rechts endet am Punkt, 90° stellt den Text auf", () => {
  const w = (al) => box(textPolylines(ent("PB-01", { align: al }), { x: 0, y: 0 }).flat());
  const L = w("links"), M = w("mitte"), R = w("rechts");
  const width = L[2] - L[0];
  // Verschiebung gegenüber links: rechts um die ganze Vorschubbreite, Mitte um die halbe
  const shiftR = R[0] - L[0], shiftM = M[0] - L[0];
  assert.ok(shiftR < -width && Math.abs(shiftM - shiftR / 2) < 1e-9, `${shiftM} / ${shiftR}`);
  assert.ok(R[2] <= 0 && R[2] > -2, "rechts endet am Punkt (Vorschub minus Seitenabstand)");
  const up = box(textPolylines(ent("PB-01", { angle: 90 }), { x: 0, y: 0 }).flat());
  assert.ok(up[3] - up[1] > width - 1 && up[2] - up[0] < 12, "senkrecht");
});

test("Mehrere Zeilen, fett breiter, Zeichenabstand verlängert", () => {
  const two = box(textPolylines(ent("A\nA"), { x: 0, y: 0 }).flat());
  assert.ok(Math.abs(two[1] - -LINE_FACTOR * 10) < 0.01, "zweite Zeile unten");
  const n = box(textPolylines(ent("MMM"), { x: 0, y: 0 }).flat()), b = box(textPolylines(ent("MMM", { style: "fett" }), { x: 0, y: 0 }).flat());
  assert.ok(b[2] > n[2] + 1, "fett breiter");
  const s = box(textPolylines(ent("MMM", { spacing: 2 }), { x: 0, y: 0 }).flat());
  assert.ok(Math.abs(s[2] - n[2] - 4) < 1e-6, "2 Abstände à 2 mm");
});

test("Platzhalter: Teilenummer, Name, Werkstoff, Datum; unbekannte und leere bleiben stehen", () => {
  const v = partTextVars({ number: "PB-7", name: "Schild", material: "1.4301" }, new Date(2026, 9, 5));
  assert.equal(resolveText("{teilenummer} / {NAME} / {werkstoff} / {datum}", v), "PB-7 / Schild / 1.4301 / 05.10.2026");
  assert.equal(resolveText("{foo} {teilenummer}", { teilenummer: "" }), "{foo} {teilenummer}");
  // Kontur folgt dem eingesetzten Text
  const a = textLoops(ent("{teilenummer}"), { x: 0, y: 0 }, { teilenummer: "1" }).length;
  const b = textLoops(ent("{teilenummer}"), { x: 0, y: 0 }, { teilenummer: "1111" }).length;
  assert.equal(b, 4 * a);
});

test("Unbekannte Zeichen als »?«, Leerzeichen ohne Kontur, Höhe 0 ohne Kontur", () => {
  assert.equal(textLoops(ent("✓"), { x: 0, y: 0 }).length, textLoops(ent("?"), { x: 0, y: 0 }).length);
  assert.equal(textLoops(ent("   "), { x: 0, y: 0 }).length, 0);
  assert.equal(textLoops(ent("A", { h: 0 }), { x: 0, y: 0 }).length, 0);
});

test("Skizzengrenzen, Fensterauswahl und DXF kennen den Text", () => {
  const sk = sketch(ent("ABC"), { x: 100, y: 50 });
  const bb = sketchBounds(sk);
  assert.ok(bb.x1 > 120 && bb.y1 >= 60 - 1e-9, JSON.stringify(bb));
  const tb = textBox(sk.entities[0], sk.points[0]);
  const scr = (x, y) => [x, -y];
  const all = { x0: 90, y0: -70, x1: 200, y1: -40 };
  assert.deepEqual(entitiesInBox(sk, scr, all, false), ["t"]);
  assert.deepEqual(entitiesInBox(sk, scr, { x0: 90, y0: -70, x1: 105, y1: -40 }, false), [], "nicht ganz innen");
  assert.ok(tb.length === 4);
  const dxf = sketchToDxf(sk);
  assert.equal((dxf.match(/POLYLINE/g) || []).length, textLoops(sk.entities[0], sk.points[0]).length);
});
