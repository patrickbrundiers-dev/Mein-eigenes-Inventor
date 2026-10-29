// Werkstatt-Etiketten mit QR-Code und Versandliste (W4). Reine Texterzeugung (HTML-Seiten für mappeHtml),
// das PDF entsteht wie bei der Fertigungsmappe in Electron (pdf:render), im Browser über Drucken.
import { fmt as fmtNum } from "./expr.js";
import { qrSvg } from "./qr.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const A4 = [210, 297];

/** Etikettenbögen: Etikettgröße, Raster auf A4 und Rand; »rolle« = eine Seite je Etikett (Etikettendrucker) */
export const LABEL_FORMATS = {
  "70x37": { label: "70 × 37 mm (A4, 3 × 8)", w: 70, h: 37, cols: 3, rows: 8, mx: 0, my: 0.5 },
  "105x48": { label: "105 × 48 mm (A4, 2 × 6)", w: 105, h: 48, cols: 2, rows: 6, mx: 0, my: 4.5 },
  "100x50": { label: "100 × 50 mm (Etikettendrucker, Rolle)", w: 100, h: 50, roll: true },
};

/**
 * Etiketten aus Stückliste (bomRows) oder Zuschnittliste (cutListRows).
 * source: "bom" | "cut"; perPiece = je Stück ein Etikett (sonst eines je Zeile mit Stückzahl).
 * Ergebnis: [{ title, lines: [Text], qr: Text }]
 */
export function labelItems({ source = "bom", rows = [], perPiece = false, order = "", project = "" } = {}) {
  const items = [];
  for (const r of rows) {
    const cut = source === "cut";
    const title = cut ? `Pos ${r.pos} · ${r.section}` : `Pos ${r.pos} · ${r.name}`;
    const lines = cut
      ? [`L = ${fmtNum(r.length, 1)} mm${gehrung(r)}`, r.material, r.parts && `für ${r.parts}`].filter(Boolean)
      : [r.number && `Nr. ${r.number}`, [r.material, r.finish].filter(Boolean).join(" · "), Number.isFinite(r.mass) && r.mass > 0 ? `${fmtNum(r.mass, 1)} kg/Stk` : ""].filter(Boolean);
    const n = perPiece ? Math.max(1, r.qty || 1) : 1;
    for (let k = 1; k <= n; k++) {
      const count = perPiece ? `${k} von ${r.qty}` : `${r.qty} Stk`;
      const qr = [order && `Auftrag ${order}`, project, title, ...lines, count].filter(Boolean).join("\n");
      items.push({ title, lines: [...lines, count], qr, head: [order && `Auftrag ${order}`, project].filter(Boolean).join(" · ") });
    }
  }
  return items;
}
const gehrung = (r) => (r.miters && (r.miters[0] || r.miters[1]) ? `, Gehrung ${fmtNum(r.miters[0], 1)}° / ${fmtNum(r.miters[1], 1)}°` : "");

/** Seiten für mappeHtml: A4-Bögen im Raster oder eine Seite je Etikett */
export function labelPages(items, format = "70x37") {
  const F = LABEL_FORMATS[format] || LABEL_FORMATS["70x37"];
  const qrMm = Math.min(F.h - 6, 28);
  const one = (it) => `<div class="etk" style="width:${F.w}mm;height:${F.h}mm;padding:2.5mm;box-sizing:border-box;display:flex;gap:2.5mm;overflow:hidden;font:7.5pt Bahnschrift,'DIN Alternate',Arial,sans-serif;color:#000">
<div style="flex:none">${qrSvg(it.qr, qrMm)}</div><div style="min-width:0;line-height:1.25">${it.head ? `<div style="font-size:6.5pt;color:#333">${esc(it.head)}</div>` : ""}<div style="font-weight:bold;font-size:${F.h > 40 ? 10 : 8.5}pt;margin:0.5mm 0">${esc(it.title)}</div>${it.lines.map((l) => `<div>${esc(l)}</div>`).join("")}</div></div>`;
  if (F.roll) return items.map((it) => ({ html: one(it), width: F.w, height: F.h }));
  const per = F.cols * F.rows, pages = [];
  const left = (A4[0] - F.cols * F.w) / 2, top = (A4[1] - F.rows * F.h) / 2;
  for (let i = 0; i < Math.max(1, items.length); i += per) {
    const cells = items.slice(i, i + per).map((it, k) => `<div style="position:absolute;left:${left + (k % F.cols) * F.w}mm;top:${top + Math.floor(k / F.cols) * F.h}mm">${one(it)}</div>`).join("");
    pages.push({ html: cells, width: A4[0], height: A4[1] });
  }
  return pages;
}

/**
 * Versandliste (A4 hoch): ein Packstück je Position mit Menge, Gewicht je Stück und gesamt, Hüllmaß und Feld zum
 * Abhaken. rows: [{ pos, name, number, qty, mass, dims: [L, B, H] }]
 */
export function shippingPage({ title = "", number = "", order = "", customer = "", rows = [] } = {}) {
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.mass) ? r.mass * r.qty : 0), 0);
  const heaviest = rows.reduce((m, r) => (Number.isFinite(r.mass) && r.mass > m.mass ? r : m), { mass: 0 });
  const longest = rows.reduce((m, r) => Math.max(m, r.dims ? Math.max(...r.dims) : 0), 0);
  const dim = (d) => (d ? d.map((x) => fmtNum(x, 0)).join(" × ") : "");
  const body = rows.map((r) => `<tr><td class="n">${esc(r.pos)}</td><td>${esc(r.name)}</td><td>${esc(r.number || "")}</td><td class="n">${esc(r.qty)}</td><td class="n">${fmtNum(r.mass, 1)}</td><td class="n">${fmtNum(r.mass * r.qty, 1)}</td><td class="n">${esc(dim(r.dims))}</td><td>☐</td></tr>`).join("");
  const html = `<div class="lst"><h1>Versandliste</h1><div class="sub">${esc([title, number, order && "Auftrag " + order, customer && "Kunde: " + customer, new Date().toLocaleDateString("de-DE")].filter(Boolean).join(" · "))}</div>
<table><thead><tr><th>Pos</th><th>Benennung</th><th>Teilenummer</th><th>Menge</th><th>kg/Stk</th><th>kg gesamt</th><th>Hüllmaß L × B × H mm</th><th>geladen</th></tr></thead><tbody>${body}</tbody>
<tfoot><tr><td></td><td>Summe</td><td></td><td class="n">${rows.reduce((a, r) => a + r.qty, 0)}</td><td></td><td class="n">${fmtNum(total, 1)}</td><td></td><td></td></tr></tfoot></table>
<h2>Für die Verladung</h2><table><tbody><tr><td>Gesamtgewicht</td><td class="n">${fmtNum(total, 1)} kg</td></tr><tr><td>Schwerstes Teil</td><td>${heaviest.name ? `${esc(heaviest.name)} (${fmtNum(heaviest.mass, 1)} kg)` : "–"}</td></tr><tr><td>Längstes Teil</td><td class="n">${fmtNum(longest, 0)} mm</td></tr></tbody></table>
<p style="margin-top:12mm">Verladen: ______________________ &nbsp; Datum: __________ &nbsp; Unterschrift Fahrer: ______________________</p></div>`;
  return { html, width: A4[0], height: A4[1] };
}

/** Hüllmaß aus Bounding-Boxen [[min], [max]] mehrerer Körper, absteigend sortiert */
export function boxDims(boxes) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b[0][k]); hi[k] = Math.max(hi[k], b[1][k]); }
  if (!(hi[0] > lo[0])) return null;
  return hi.map((x, k) => x - lo[k]).sort((a, b) => b - a);
}
