// Bestellliste für Kaufteile (O12, wie MegaCAD Bestelllisten): Normteile, Beschläge, Glas und als Kaufteil markierte
// Bauteile, je Lieferant gruppiert, als CSV oder druckfertige Seite (PDF). Reine Rechnung ohne DOM.
import { NORM_FAMILIES } from "./normlib.js";
import { fmt as fmtNum } from "./expr.js";

/** Warengruppen der Bestellliste: [Schlüssel, Bezeichnung] */
export const ORDER_GROUPS = [["normteile", "Normteile"], ["beschlaege", "Beschläge"], ["glas", "Glas"], ["kaufteile", "Kaufteile"]];
const GROUP_LABEL = Object.fromEntries(ORDER_GROUPS);
const r1 = (x) => Math.round(x * 10) / 10;
const mm = (x) => String(r1(x)).replace(".", ","); // ohne Tausenderpunkt (Abmessungen)

/** Warengruppe eines Körpers (Normteil nach Familie, Glasscheibe) oder null */
export function orderGroup(meta) {
  if (meta?.norm) return NORM_FAMILIES[meta.norm.kind]?.cat === "beschlaege" ? "beschlaege" : "normteile";
  if (meta?.glass) return "glas";
  return null;
}

/**
 * Zeilen der Bestellliste. sources: [{ part, bodies, qty }] (Bauteile mit gebauten Körpern und Stückzahl);
 * suppliers: { Warengruppe: Lieferant } (Projekt), ein Kaufteil kann seinen Lieferanten selbst tragen (part.lieferant).
 * Rückgabe sortiert nach Lieferant, Gruppe, Benennung: [{ supplier, group, groupLabel, name, norm, material, qty, unit, area? }]
 */
export function orderRows(sources, { suppliers = {} } = {}) {
  const map = new Map();
  const add = (key, row, qty) => {
    const r = map.get(key) || { ...row, qty: 0, area: row.area ? 0 : undefined };
    r.qty += qty;
    if (row.area) r.area = (r.area || 0) + row.area * qty;
    map.set(key, r);
  };
  const sup = (group, part) => String((group === "kaufteile" && part?.lieferant) || suppliers[group] || "").trim() || "ohne Lieferant";
  for (const s of sources || []) {
    const qty = s.qty ?? 1;
    if (s.part?.kaufteil) {
      const supplier = sup("kaufteile", s.part);
      add(`k|${supplier}|${s.part.id}`, { supplier, group: "kaufteile", name: s.part.name, norm: s.part.number || "", material: s.part.material || "", unit: "Stk" }, qty);
      // Normteile in einem Kaufteil gehören zum Kaufteil
      continue;
    }
    for (const b of s.bodies || []) {
      const g = orderGroup(b.meta);
      if (!g) continue;
      const supplier = sup(g, s.part);
      if (g === "glas") {
        const pl = b.meta.plate || {}, W = r1(Math.max(pl.W || 0, pl.H || 0)), H = r1(Math.min(pl.W || 0, pl.H || 0)), t = pl.t || 0;
        const name = `Glasscheibe ${mm(W)} × ${mm(H)} mm`;
        add(`g|${supplier}|${name}|${t}`, { supplier, group: g, name, norm: t ? `VSG ${fmtNum(t, 2)} mm` : "", material: "Glas", unit: "Stk", area: (W * H) / 1e6 }, qty);
        continue;
      }
      const n = b.meta.norm;
      add(`n|${supplier}|${n.designation}`, { supplier, group: g, name: n.designation, norm: n.norm || NORM_FAMILIES[n.kind]?.norm || "", material: n.material || n.grade || "", unit: "Stk" }, qty);
    }
  }
  const order = ORDER_GROUPS.map(([k]) => k);
  return [...map.values()].map((r) => ({ ...r, groupLabel: GROUP_LABEL[r.group] }))
    .sort((a, b) => (a.supplier === "ohne Lieferant") - (b.supplier === "ohne Lieferant") || a.supplier.localeCompare(b.supplier, "de") || order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name, "de", { numeric: true }));
}

/** CSV (Semikolon, UTF-8 mit BOM) für Excel: eine Zeile je Artikel */
export function orderCsv(rows, title = "") {
  const esc = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const out = [["Lieferant", "Gruppe", "Benennung", "Norm / Ausführung", "Werkstoff", "Menge", "Einheit", "Fläche m²", "Projekt"]];
  for (const r of rows) out.push([r.supplier, r.groupLabel, r.name, r.norm, r.material, r.qty, r.unit, r.area ? fmtNum(r.area, 2) : "", title]);
  return "﻿" + out.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}

/** Druckseiten (A4 hoch) für mappeHtml: je Lieferant eine Seite (lange Listen auf Folgeseiten) */
export function orderPages(rows, { title = "", number = "", date = "" } = {}) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const bySup = new Map();
  for (const r of rows) bySup.set(r.supplier, [...(bySup.get(r.supplier) || []), r]);
  const pages = [], PER = 40;
  for (const [supplier, list] of bySup) {
    for (let i = 0; i < list.length; i += PER) {
      const part = list.slice(i, i + PER), n = Math.ceil(list.length / PER), k = i / PER + 1;
      const body = part.map((r, j) => `<tr><td class="n">${i + j + 1}</td><td>${esc(r.groupLabel)}</td><td>${esc(r.name)}</td><td>${esc(r.norm)}</td><td>${esc(r.material)}</td><td class="n">${r.qty}</td><td>${esc(r.unit)}</td><td class="n">${r.area ? esc(fmtNum(r.area, 2)) : ""}</td></tr>`).join("");
      pages.push({ width: 210, height: 297, html: `<div class="lst"><h1>Bestellung ${esc(supplier)}${n > 1 ? ` (${k}/${n})` : ""}</h1><div class="sub">${esc([title, number, date].filter(Boolean).join(" · "))}</div>`
        + `<table><thead><tr><th>Pos</th><th>Gruppe</th><th>Benennung</th><th>Norm / Ausführung</th><th>Werkstoff</th><th>Menge</th><th>Einheit</th><th>m²</th></tr></thead><tbody>${body}</tbody></table></div>` });
    }
  }
  return pages;
}
