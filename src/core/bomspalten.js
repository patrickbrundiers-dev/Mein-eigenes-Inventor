// Stückliste mit frei wählbaren Spalten (Z8, Arbeitsabläufe AW8): feste Spalten und eigene Eigenschaften der Bauteile
// (doc.props, z. B. »Kunde«, »Lieferant«) in gewählter Reihenfolge. Die Auswahl liegt an der Baugruppe (asm.bomCols)
// und gilt für Stücklisten-Fenster, CSV und Fertigungsmappe. Reine Rechnung.

import { customProps } from "./eigenschaften.js";
import { fmt as fmtNum } from "./expr.js";

/** Feste Spalten: key → { label, num (rechtsbündig), get(row) } */
export const BOM_COLUMNS = {
  pos: { label: "Pos", num: true, get: (r) => r.pos },
  name: { label: "Benennung", get: (r) => r.name },
  number: { label: "Teilenummer", get: (r) => r.number || "" },
  qty: { label: "Menge", num: true, get: (r) => r.qty },
  material: { label: "Werkstoff", get: (r) => r.material || "" },
  finish: { label: "Oberfläche", get: (r) => r.finish || "" },
  mass: { label: "kg/Stk", num: true, get: (r) => (Number.isFinite(r.mass) ? fmtNum(r.mass, 2) : "") },
  massTotal: { label: "kg gesamt", num: true, get: (r) => (Number.isFinite(r.mass) ? fmtNum(r.mass * r.qty, 2) : "") },
  description: { label: "Beschreibung", get: (r) => r.part?.description || "" },
  designer: { label: "Konstrukteur", get: (r) => r.part?.designer || "" },
};
export const DEFAULT_BOM_COLS = ["pos", "name", "number", "qty", "material", "finish", "mass", "massTotal"];
const PROP = "prop:";

/** Alle wählbaren Spalten: feste plus die eigenen Eigenschaften, die in den Bauteilen vorkommen → [{ key, label }] */
export function availableBomColumns(rows) {
  const own = [], seen = new Set();
  for (const r of rows || []) for (const p of customProps(r.part)) {
    const k = p.name.toLowerCase();
    if (!seen.has(k)) { seen.add(k); own.push({ key: PROP + p.name, label: p.name }); }
  }
  return [...Object.entries(BOM_COLUMNS).map(([key, c]) => ({ key, label: c.label })), ...own.sort((a, b) => a.label.localeCompare(b.label, "de"))];
}

/** Gewählte Spalten bereinigen: nur bekannte feste oder Eigenschaften, ohne doppelte, mindestens Pos und Benennung */
export function bomColumns(sel) {
  const list = Array.isArray(sel) && sel.length ? sel : DEFAULT_BOM_COLS;
  const out = [];
  for (const k of list) if (typeof k === "string" && (BOM_COLUMNS[k] || (k.startsWith(PROP) && k.length > PROP.length && k.length <= 64)) && !out.includes(k)) out.push(k);
  return out.length ? out : [...DEFAULT_BOM_COLS];
}

/** Überschrift einer Spalte */
export const bomColumnLabel = (k) => BOM_COLUMNS[k]?.label || k.slice(PROP.length);
export const bomColumnNumeric = (k) => !!BOM_COLUMNS[k]?.num;

/** Wert einer Zelle (Text bzw. Zahl), Eigenschaften ohne Groß/Kleinschreibung */
export function bomCell(row, k) {
  if (BOM_COLUMNS[k]) return BOM_COLUMNS[k].get(row);
  const name = k.slice(PROP.length).toLowerCase();
  return customProps(row.part).find((p) => p.name.toLowerCase() === name)?.value ?? "";
}

/** Tabelle für Fenster, CSV und Mappe: { head: [Text], num: [bool], rows: [[Zelle]] } */
export function bomGrid(rows, sel) {
  const cols = bomColumns(sel);
  return { cols, head: cols.map(bomColumnLabel), num: cols.map(bomColumnNumeric), rows: (rows || []).map((r) => cols.map((k) => bomCell(r, k))) };
}

/** Spalte in der Auswahl verschieben (d = −1 nach vorn, +1 nach hinten) */
export function moveBomColumn(sel, k, d) {
  const cols = bomColumns(sel), i = cols.indexOf(k), j = i + d;
  if (i < 0 || j < 0 || j >= cols.length) return cols;
  [cols[i], cols[j]] = [cols[j], cols[i]];
  return cols;
}
