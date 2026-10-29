// Etiketten mit QR-Code und Versandliste (W4), ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { qrMatrix, qrSvg } from "../src/core/qr.js";
import { labelItems, labelPages, shippingPage, boxDims } from "../src/core/etiketten.js";
import { createHash } from "node:crypto";

const sig = (m) => createHash("sha1").update(m.modules.map((r) => r.map((c) => (c ? 1 : 0)).join("")).join("\n")).digest("hex").slice(0, 12);

test("QR-Code: Version nach Länge, Funktionsmuster, stabile Ausgabe", () => {
  const a = qrMatrix("PBCAD");
  assert.equal(a.version, 1);
  assert.equal(a.size, 21);
  // Positionsmuster oben links: dunkler Rand, helle Trennlinie
  assert.ok(a.modules[0][0] && a.modules[0][6] && a.modules[6][6] && !a.modules[7][7] && a.modules[3][3]);
  // Taktlinie
  assert.deepEqual(a.modules[6].slice(8, 13), [true, false, true, false, true]);
  assert.equal(qrMatrix("x".repeat(300)).version, 13);
  assert.throws(() => qrMatrix("x".repeat(2000)), /zu lang/);
  // mit jsQR gegengelesen (29.10.2026); die Signatur schützt vor unbemerkten Änderungen
  assert.equal(sig(qrMatrix("Auftrag 2026-114 | Pos 3 | QRo 40x3 | L 1234,5 | 4 Stk | tZn")), "7d344b2434a0");
  assert.match(qrSvg("A", 20), /^<svg[^>]+width="20mm"/);
});

test("Etiketten aus Stückliste und Zuschnitt, je Stück oder je Zeile", () => {
  const bom = [{ pos: 1, name: "Pfosten", number: "T-01", material: "S235", finish: "tZn", qty: 3, mass: 4.25 }];
  const per = labelItems({ source: "bom", rows: bom, perPiece: true, order: "2026-114", project: "Tor" });
  assert.equal(per.length, 3);
  assert.equal(per[1].lines.at(-1), "2 von 3");
  assert.match(per[0].qr, /^Auftrag 2026-114\nTor\nPos 1 · Pfosten\nNr\. T-01/);
  const cut = labelItems({ source: "cut", rows: [{ pos: 2, section: "QRo 40×3", length: 1234.5, miters: [0, 45], material: "S235", parts: "Rahmen", qty: 4 }] });
  assert.equal(cut.length, 1);
  assert.match(cut[0].lines[0], /L = 1\.234,5 mm, Gehrung 0° \/ 45°/);
  assert.equal(cut[0].lines.at(-1), "4 Stk");
  const pages = labelPages([...per, ...per, ...per, ...per, ...per, ...per, ...per, ...per, ...per], "70x37");
  assert.equal(pages.length, 2); // 27 Etiketten, 24 je Bogen
  assert.equal(pages[0].width, 210);
  assert.equal(labelPages(per, "100x50").length, 3);
});

test("Versandliste mit Summe, schwerstem und längstem Teil", () => {
  const p = shippingPage({ title: "Tor", order: "2026-114", rows: [
    { pos: 1, name: "Torflügel", qty: 2, mass: 80, dims: [2500, 1800, 60] },
    { pos: 2, name: "Pfosten", qty: 2, mass: 30.5, dims: [2200, 120, 120] }] });
  assert.match(p.html, /<td class="n">221<\/td>/);
  assert.match(p.html, /Torflügel \(80 kg\)/);
  assert.match(p.html, /2\.?500 mm/);
  assert.deepEqual(boxDims([[[0, 0, 0], [100, 20, 50]], [[50, -10, 0], [300, 20, 10]]]), [300, 50, 30]);
});
