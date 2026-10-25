// Werkzeuge Stufe 43: Varianten aus Tabelle (wie Inventor iPart / SolidWorks-Konfigurationen).
// Das Werksbauteil trägt eine Tabelle: Spalten = Parameter, Zeilen = Varianten mit Name, Sachnummer und Werten.
// Jede Zeile wird ein eigenes Bauteil (Variante) – Stückliste, Zeichnung und Baugruppe arbeiten damit wie mit jedem Teil.
// Varianten sind schreibgeschützt; geändert wird im Werksbauteil, beim Aktualisieren werden sie neu erzeugt.

import { resolveParams } from "./expr.js";

export const emptyVariants = () => ({ columns: [], rows: [] });

/** Tabelle prüfen: Spalten sind Parameter des Bauteils, Namen eindeutig, Werte rechenbar (mit den übrigen Parametern) */
export function checkVariants(part) {
  const v = part.variants;
  const errors = [];
  if (!v) return errors;
  const names = new Set((part.params || []).map((p) => p.name));
  for (const c of v.columns) if (!names.has(c)) errors.push(`Spalte »${c}« ist kein Parameter des Bauteils`);
  if (new Set(v.columns).size !== v.columns.length) errors.push("Spalte doppelt");
  const seen = new Set();
  v.rows.forEach((r, i) => {
    const label = r.name || `Zeile ${i + 1}`;
    if (!r.name?.trim()) errors.push(`Zeile ${i + 1}: Name fehlt`);
    else if (seen.has(r.name.trim())) errors.push(`Variante »${r.name}« doppelt`);
    seen.add(r.name?.trim());
    const res = resolveParams(variantParams(part, r));
    for (const c of v.columns) if (res.errors?.[c]) errors.push(`${label}, ${c}: ${res.errors[c]}`);
  });
  return errors;
}

/** Parameter einer Variante: Ausdrücke aus der Zeile ersetzen die des Werksbauteils */
export function variantParams(part, row) {
  return (part.params || []).map((p) => (row.values && row.values[p.name] !== undefined && String(row.values[p.name]).trim() !== "" ? { ...p, expr: String(row.values[p.name]) } : { ...p }));
}

/** Bauteil einer Variante (neue oder bestehende ID) */
export function variantPart(factory, row, id) {
  const copy = JSON.parse(JSON.stringify(factory));
  delete copy.variants;
  delete copy.link;
  return {
    ...copy,
    id,
    name: row.name,
    number: row.number || (factory.number ? `${factory.number}-${row.name}` : ""),
    params: variantParams(factory, row),
    variant: { of: factory.id, row: row.id },
  };
}

/**
 * Varianten eines Werksbauteils erzeugen oder aktualisieren. docs: alle Dokumente des Projekts.
 * Rückgabe { docs (neue Liste), created, updated, orphans } – Varianten ohne Zeile bleiben stehen (Hinweis), damit Baugruppen nicht brechen.
 */
export function syncVariants(docs, factory, newId) {
  const out = [...docs];
  let created = 0, updated = 0;
  const members = docs.filter((d) => d.kind === "part" && d.variant?.of === factory.id);
  for (const row of factory.variants?.rows || []) {
    const old = members.find((d) => d.variant.row === row.id);
    const next = variantPart(factory, row, old?.id || newId());
    if (old) {
      const i = out.indexOf(old);
      if (JSON.stringify(old) !== JSON.stringify(next)) { out[i] = next; updated++; }
    } else { out.push(next); created++; }
  }
  const rowIds = new Set((factory.variants?.rows || []).map((r) => r.id));
  const orphans = members.filter((d) => !rowIds.has(d.variant.row)).map((d) => d.name);
  return { docs: out, created, updated, orphans };
}

/** Inhalt einer Variante zum Vergleich (Schutz vor Bearbeitung) */
export const variantContent = (d) => JSON.stringify({ f: d.features, p: d.params, m: d.material, n: d.name, nr: d.number });
