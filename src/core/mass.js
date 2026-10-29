// Masse aus Körpervolumen: Körper mit eigener Dichte (meta.density, z. B. Glas, Gitterrost, Holz aus den
// Generatoren) zählen mit dieser, alle anderen mit dem Werkstoff des Bauteils.

/** Gesamtmasse in kg; partDensity in g/cm³, Volumen in mm³ */
export function bodiesMass(bodies, partDensity) {
  return (bodies || []).reduce((s, b) => s + (b.props?.volume || 0) * (b.meta?.density ?? partDensity), 0) / 1e6;
}
/** Masse von Hand (W5, z. B. Kaufteil nach Datenblatt) in kg oder null */
export function massOverride(part) {
  const v = Number(String(part?.massOverride ?? "").replace(",", "."));
  return String(part?.massOverride ?? "").trim() && Number.isFinite(v) && v >= 0 ? v : null;
}
/** Masse eines Bauteils: von Hand, sonst aus Volumen und Dichte */
export const partMass = (part, bodies, partDensity) => massOverride(part) ?? bodiesMass(bodies, partDensity);

/**
 * Stücklistenzeilen in fester Reihenfolge (W5): order = [Bauteil-ID …] der Baugruppe; nicht genannte Zeilen folgen
 * in ihrer bisherigen Reihenfolge, Normteile immer am Ende.
 */
export function orderBomRows(rows, order = []) {
  const idx = new Map(order.map((id, i) => [id, i]));
  const key = (r, i) => (r.norm ? [2, i] : r.part && idx.has(r.part.id) ? [0, idx.get(r.part.id)] : [1, i]);
  return rows.map((r, i) => ({ r, k: key(r, i) })).sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1]).map((x) => x.r);
}

/** Hat ein Körper eine eigene Dichte? (für den Hinweis in den Masse-Eigenschaften) */
export const hasOwnDensity = (bodies) => (bodies || []).some((b) => b.meta?.density != null);

/** Ersatzdichten (g/cm³) für Füllungen und Stufen; Gitterrost: ca. 30 kg/m² bei 30 mm Höhe */
export const FILL_DENSITY = { glas: 2.5, gitterrost: 1.0, holz: 0.7 };
