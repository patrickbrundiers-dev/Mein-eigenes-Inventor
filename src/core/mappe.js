// Fertigungsmappe (Erweiterung E3): alle Zeichnungen und Listen einer Position als ein druckfertiges Dokument.
// Reine Texterzeugung; das PDF entsteht in Electron aus demselben HTML (pdf:render), im Browser über Drucken.
import { fmt as fmtNum } from "./expr.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const A4 = [210, 297];

/**
 * Ein HTML-Dokument mit einer Seite je Eintrag; jede Seite behält ihr eigenes Format (benannte @page-Regeln).
 * pages: [{ svg | html, width, height }] in mm.
 */
export function mappeHtml(pages, { title = "Fertigungsmappe" } = {}) {
  const sizes = [...new Set(pages.map((p) => `${p.width}x${p.height}`))];
  const pageName = (p) => "f" + sizes.indexOf(`${p.width}x${p.height}`);
  const rules = sizes.map((s, i) => { const [w, h] = s.split("x"); return `@page f${i}{size:${w}mm ${h}mm;margin:0}`; }).join("");
  const body = pages.map((p) => {
    const inner = p.svg ? p.svg.replace(/^<\?xml[^>]*>\s*/, "") : p.html;
    return `<section class="pg" style="page:${pageName(p)};width:${p.width}mm;height:${p.height}mm">${inner}</section>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${rules}
html,body{margin:0;padding:0}
.pg{box-sizing:border-box;overflow:hidden;break-after:page;position:relative}
.pg:last-child{break-after:auto}
.pg>svg{display:block;width:100%;height:100%}
.lst{padding:12mm 12mm 10mm 15mm;font:9pt Bahnschrift,'DIN Alternate',Arial,sans-serif;color:#111a24}
.lst h1{font-size:14pt;margin:0 0 1mm}
.lst h2{font-size:11pt;margin:6mm 0 2mm}
.lst .sub{color:#555;margin-bottom:4mm}
.lst table{border-collapse:collapse;width:100%}
.lst th,.lst td{border:0.2mm solid #888;padding:1mm 1.5mm;text-align:left;vertical-align:top}
.lst th{background:#e8ecf0}
.lst td.n{text-align:right;white-space:nowrap}
.lst tfoot td{font-weight:bold}
@media screen{body{background:#888}.pg{background:#fff;margin:8mm auto;box-shadow:0 1mm 4mm #0005}}
</style></head><body>
${body}
</body></html>`;
}

const table = (head, rows, foot) =>
  `<table><thead><tr>${head.map(([t]) => `<th>${esc(t)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((v, i) => `<td${head[i][1] ? ' class="n"' : ""}>${esc(v)}</td>`).join("")}</tr>`)
    .join("")}</tbody>${foot ? `<tfoot><tr>${foot.map((v, i) => `<td${head[i][1] ? ' class="n"' : ""}>${esc(v)}</td>`).join("")}</tr></tfoot>` : ""}</table>`;

/** Zeilen je Seite (A4 hoch, 9 pt); lange Listen gehen auf Folgeseiten weiter */
const ROWS_PER_PAGE = 42;

/**
 * Listenseiten (A4 hoch): Stückliste, Zuschnittliste und Biegelisten. bom/cut wie bomRows bzw. cutListRows,
 * bends = [{ name, bends: [{ straight, rotation, angle, arc }], last, length }] je Biegerohr.
 * Gibt Seiten für mappeHtml zurück; leere Listen entfallen.
 */
export function listPages({ title = "", number = "", bom = [], cut = [], bends = [] } = {}) {
  const head = (name, part, of) => `<h1>${esc(name)}${of > 1 ? ` (${part}/${of})` : ""}</h1><div class="sub">${esc([title, number].filter(Boolean).join(" · "))}</div>`;
  const pages = [];
  const chunked = (rows, name, render) => {
    const n = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    for (let i = 0; i < n; i++) pages.push({ html: `<div class="lst">${head(name, i + 1, n)}${render(rows.slice(i * ROWS_PER_PAGE, (i + 1) * ROWS_PER_PAGE), i === n - 1)}</div>`, width: A4[0], height: A4[1] });
  };
  if (bom.length) {
    const total = bom.reduce((a, r) => a + (Number.isFinite(r.mass) ? r.mass * r.qty : 0), 0);
    chunked(bom, "Stückliste", (rows, last) => table(
      [["Pos", 1], ["Benennung"], ["Teilenummer"], ["Menge", 1], ["Werkstoff"], ["Oberfläche"], ["kg/Stk", 1], ["kg gesamt", 1]],
      rows.map((r) => [r.pos, r.name, r.number || "", r.qty, r.material || "", r.finish || "", fmtNum(r.mass, 2), fmtNum(r.mass * r.qty, 2)]),
      last ? ["", "Summe", "", bom.reduce((a, r) => a + r.qty, 0), "", "", "", fmtNum(total, 2)] : null));
  }
  if (cut.length) {
    const total = cut.reduce((a, r) => a + r.mass * r.qty, 0);
    const miter = (r) => (r.miters[0] || r.miters[1] ? `${fmtNum(r.miters[0], 1)}° / ${fmtNum(r.miters[1], 1)}°` : "");
    chunked(cut, "Zuschnittliste", (rows, last) => table(
      [["Pos", 1], ["Profil"], ["Länge mm", 1], ["Menge", 1], ["Gehrung"], ["Werkstoff"], ["kg gesamt", 1], ["Bauteil"]],
      rows.map((r) => [r.pos, r.section, fmtNum(r.length, 1), r.qty, miter(r), r.material, fmtNum(r.mass * r.qty, 2), r.parts]),
      last ? ["", "Summe", "", cut.reduce((a, r) => a + r.qty, 0), "", "", fmtNum(total, 2), ""] : null));
  }
  if (bends.length) {
    // Biegeliste je Rohr: Gerade vor der Biegung, Drehung, Biegewinkel (L-R-A); mehrere Rohre auf einer Seite
    const blocks = bends.map((b) => `<h2>${esc(b.name)} – Abwicklung ${fmtNum(b.length, 1)} mm</h2>${table(
      [["Nr", 1], ["Gerade vor mm", 1], ["Drehung °", 1], ["Biegewinkel °", 1], ["Bogen mm", 1]],
      [...b.bends.map((x, i) => [i + 1, fmtNum(x.straight, 1), fmtNum(x.rotation, 1), fmtNum(x.angle, 1), fmtNum(x.arc, 1)]), ["Ende", fmtNum(b.last, 1), "", "", ""]])}`);
    const per = [];
    let cur = [], rows = 0;
    for (const [i, blk] of blocks.entries()) {
      const n = bends[i].bends.length + 4;
      if (cur.length && rows + n > ROWS_PER_PAGE) { per.push(cur); cur = []; rows = 0; }
      cur.push(blk); rows += n;
    }
    per.push(cur);
    per.forEach((c, i) => pages.push({ html: `<div class="lst">${head("Biegeliste", i + 1, per.length)}${c.join("")}</div>`, width: A4[0], height: A4[1] }));
  }
  return pages;
}

/** Dateiname ohne verbotene Zeichen, Leerzeichen als _ */
export const mappeName = (s) => String(s || "Mappe").replace(/[\\/:*?"<>|\s]+/g, "_");
