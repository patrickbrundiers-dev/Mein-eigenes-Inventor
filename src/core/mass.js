// Masse aus Körpervolumen: Körper mit eigener Dichte (meta.density, z. B. Glas, Gitterrost, Holz aus den
// Generatoren) zählen mit dieser, alle anderen mit dem Werkstoff des Bauteils.

/** Gesamtmasse in kg; partDensity in g/cm³, Volumen in mm³ */
export function bodiesMass(bodies, partDensity) {
  return (bodies || []).reduce((s, b) => s + (b.props?.volume || 0) * (b.meta?.density ?? partDensity), 0) / 1e6;
}
/** Hat ein Körper eine eigene Dichte? (für den Hinweis in den Masse-Eigenschaften) */
export const hasOwnDensity = (bodies) => (bodies || []).some((b) => b.meta?.density != null);

/** Ersatzdichten (g/cm³) für Füllungen und Stufen; Gitterrost: ca. 30 kg/m² bei 30 mm Höhe */
export const FILL_DENSITY = { glas: 2.5, gitterrost: 1.0, holz: 0.7 };
