// Listen als Excel-Arbeitsmappe (MegaCAD-Abgleich M18): Zuschnittliste, Summen je Profil, Nahtliste, Stückliste.
// Gleiche Spalten wie die CSV-Dateien, aber Zahlen als Zahlen (gerundet), damit Excel weiterrechnen kann.

import { cutListTotals, partsText, endsText } from "./cutlist.js";
import { WELD_KINDS, WELD_SIDES } from "./weld.js";

const r = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/**
 * Blätter für buildXlsx; leere Listen entfallen. bom: [{pos, name, number, qty, material, mass}].
 * Mit Unterbaugruppen (M19) zusätzlich structure: [{level, name, number, kind, qty, total}] und
 * modular: [{name, number, rows: [{pos, name, number, kind, qty}]}].
 */
export function listSheets({ cut = [], welds = [], bom = [], structure = [], modular = [] }) {
  const sheets = [];
  const art = (k) => (k === "assembly" ? "Baugruppe" : "Bauteil");
  if (bom.length) {
    sheets.push({ name: "Stückliste", rows: [["Pos", "Benennung", "Teilenummer", "Menge", "Werkstoff", "Masse kg/Stk", "Masse kg gesamt"],
      ...bom.map((b) => [b.pos, b.name, b.number || null, b.qty, b.material || null, r(b.mass, 3), r(b.mass * b.qty, 3)]),
      [], ["Summe", null, null, bom.reduce((a, b) => a + b.qty, 0), null, null, r(bom.reduce((a, b) => a + b.mass * b.qty, 0), 3)]] });
  }
  if (structure.length) {
    sheets.push({ name: "Strukturstückliste", rows: [["Ebene", "Benennung", "Teilenummer", "Art", "Menge je Baugruppe", "Menge gesamt"],
      ...structure.map((x) => [x.level, x.name, x.number || null, art(x.kind), x.qty, x.total])] });
  }
  if (modular.length) {
    const rows = [["Baugruppe", "Pos", "Benennung", "Teilenummer", "Art", "Menge"]];
    for (const m of modular) {
      if (rows.length > 1) rows.push([]);
      for (const x of m.rows) rows.push([[m.name, m.number].filter(Boolean).join(" · "), x.pos, x.name, x.number || null, art(x.kind), x.qty]);
    }
    sheets.push({ name: "Baukastenstückliste", rows });
  }
  if (cut.length) {
    sheets.push({ name: "Zuschnitt", rows: [["Pos", "Profil-ID", "Profil", "Zuschnittlänge mm", "Menge", "Gehrung Anfang °", "Gehrung Ende °", "Ausgeklinkt", "kg/m", "kg/Stk", "kg gesamt", "Werkstoff", "Bauteil", "Enden"],
      ...cut.map((x) => [x.pos, x.profileId, x.section, r(x.length, 1), x.qty, r(x.miters[0], 1), r(x.miters[1], 1), x.coped ? "ja" : "nein", r(x.kgm, 3), r(x.mass, 3), r(x.mass * x.qty, 3), x.material, x.parts, [endsText(x), partsText(x)].filter(Boolean).join("; ")])] });
    const t = cutListTotals(cut);
    sheets.push({ name: "Summen je Profil", rows: [["Profil", "Werkstoff", "Stück", "Länge gesamt m", "kg/m", "kg gesamt"],
      ...t.groups.map((g) => [g.profileId, g.material, g.qty, r(g.length / 1000, 3), r(g.kgm, 3), r(g.mass, 3)]),
      [], ["Summe", null, t.qty, r(t.length / 1000, 3), null, r(t.mass, 3)]] });
  }
  if (welds.length) {
    sheets.push({ name: "Nahtliste", rows: [["Pos", "Nahtart", "Maß", "Seite", "Umlaufend", "Montage", "Anzahl", "Länge gesamt mm", "Schweißgut kg", "Bauteil"],
      ...welds.map((w) => [w.pos, WELD_KINDS[w.kind].label, `${WELD_KINDS[w.kind].dim}${String(w.a).replace(".", ",")}`, WELD_SIDES[w.side], w.around ? "ja" : null, w.field ? "ja" : null, w.count, r(w.length, 1), r(w.mass, 3), w.parts || null])] });
  }
  return sheets;
}
