// Angebotsblatt (Erweiterung E4): Kopf, Kunde, Bild, Hauptmaße, Werkstoff/Oberfläche, Gewicht und ein von Hand
// eingetragener Preis. Solange die Kalkulation (E2) zurückgestellt ist, rechnet PBCAD keine Preise selbst.
// Reine Texterzeugung; die Seite geht wie die Fertigungsmappe durch mappeHtml (PDF in Electron, Drucken im Browser).
import { fmt as fmtNum } from "./expr.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s) => esc(s).replace(/\r?\n/g, "<br>");
/** Zahl aus der Eingabe (Komma oder Punkt, Tausenderpunkte erlaubt) oder NaN */
export const parsePrice = (s) => {
  const t = String(s ?? "").trim().replace(/\s|€/g, "");
  if (!t) return NaN;
  // »1.234,50« und »1.000« deutsch (Punkt = Tausender), »1234.5« mit Dezimalpunkt
  const n = Number(/,/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};
/** Geldbetrag deutsch mit Tausenderpunkt und immer zwei Nachkommastellen: 2.938,11 € */
export const money = (v) => {
  const [i, d] = (Math.round(v * 100) / 100).toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d + " €";
};

/**
 * Preis-Zeilen aus Menge, Einzelpreis netto und MwSt-Satz; leerer Preis = nur Feld zum Eintragen.
 * Rückgabe { qty, unit, net, vat, gross } oder null.
 */
export function priceLines({ qty = 1, price = "", vat = 19 } = {}) {
  const unit = parsePrice(price);
  if (!Number.isFinite(unit)) return null;
  const q = Math.max(1, Math.round(Number(qty) || 1));
  const net = unit * q, v = Number.isFinite(Number(vat)) ? Number(vat) : 0;
  return { qty: q, unit, net, vat: (net * v) / 100, vatRate: v, gross: net * (1 + v / 100) };
}

/**
 * Seite für mappeHtml (A4 hoch). info: { firma, kunde, nummer, datum, betreff, text, hinweis, qty, price, vat,
 * image (data-URL), dims [L, B, H] mm, materials [], finishes [], mass kg, positions }
 */
export function angebotPage(info) {
  const i = info || {};
  const p = priceLines(i);
  const dims = (i.dims || []).filter(Number.isFinite);
  const facts = [
    dims.length === 3 ? ["Hauptmaße (L × B × H)", `${dims.map((d) => fmtNum(d, 0)).join(" × ")} mm`] : null,
    i.materials?.length ? ["Werkstoff", i.materials.join(", ")] : null,
    ["Oberfläche", i.finishes?.length ? i.finishes.join(", ") : "roh"],
    Number.isFinite(i.mass) && i.mass > 0 ? ["Gewicht ca.", `${fmtNum(i.mass, i.mass < 10 ? 1 : 0)} kg`] : null,
    i.positions > 1 ? ["Positionen", String(i.positions)] : null,
  ].filter(Boolean);
  const row = (a, b, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td>${esc(a)}</td><td class="n">${esc(b)}</td></tr>`;
  const priceTable = p
    ? `<table class="pr">${row(`${p.qty} × Einzelpreis netto`, money(p.unit))}${row("Summe netto", money(p.net))}${row(`zzgl. ${fmtNum(p.vatRate, 1)} % MwSt.`, money(p.vat))}${row("Gesamtbetrag", money(p.gross), "tot")}</table>`
    : `<table class="pr">${row(`${Math.max(1, Math.round(Number(i.qty) || 1))} × Einzelpreis netto`, "")}${row("Summe netto", "")}${row(`zzgl. ${fmtNum(Number(i.vat ?? 19), 1)} % MwSt.`, "")}${row("Gesamtbetrag", "", "tot")}</table>`;
  const html = `<div class="ang">
<style>
.ang{padding:15mm 15mm 12mm 20mm;font:10pt Bahnschrift,'DIN Alternate',Arial,sans-serif;color:#111a24;height:100%;box-sizing:border-box;display:flex;flex-direction:column}
.ang .kopf{display:flex;justify-content:space-between;gap:10mm;border-bottom:0.4mm solid #111a24;padding-bottom:3mm}
.ang .firma{font-weight:bold;white-space:normal}
.ang .meta{text-align:right;white-space:nowrap}
.ang .kunde{margin:8mm 0 6mm;min-height:18mm}
.ang h1{font-size:15pt;margin:0 0 4mm}
.ang .bild{text-align:center;margin:0 0 5mm}
.ang .bild img{max-width:100%;max-height:85mm;object-fit:contain}
.ang table{border-collapse:collapse;width:100%}
.ang td{padding:1.2mm 1.5mm;border-bottom:0.2mm solid #bbb;vertical-align:top}
.ang td.n{text-align:right;white-space:nowrap}
.ang .fakten td:first-child{width:45mm;color:#555}
.ang .text{margin:5mm 0}
.ang .pr{margin-top:6mm;width:95mm;margin-left:auto}
.ang .pr td.n{min-width:30mm}
.ang .pr .tot td{font-weight:bold;border-top:0.4mm solid #111a24;border-bottom:none}
.ang .fuss{margin-top:auto;padding-top:4mm;font-size:8.5pt;color:#555;border-top:0.2mm solid #bbb}
</style>
<div class="kopf"><div class="firma">${lines(i.firma || "")}</div><div class="meta">${i.nummer ? `Angebot Nr. ${esc(i.nummer)}<br>` : "Angebot<br>"}${esc(i.datum || "")}</div></div>
<div class="kunde">${lines(i.kunde || "")}</div>
<h1>${esc(i.betreff || "Angebot")}</h1>
${i.image ? `<div class="bild"><img src="${esc(i.image)}" alt=""></div>` : ""}
<table class="fakten">${facts.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table>
${i.text ? `<div class="text">${lines(i.text)}</div>` : ""}
${priceTable}
${i.hinweis ? `<div class="fuss">${lines(i.hinweis)}</div>` : ""}
</div>`;
  return { html, width: 210, height: 297 };
}
