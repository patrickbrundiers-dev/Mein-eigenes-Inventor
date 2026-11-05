// Farbsehschwäche (SolidCraft-Abgleich Runde 2, G8): Farben mit Bedeutung (gut/schlecht/Warnung) je Modus.
// Protan/Deutan: Blau statt Grün, Orange statt Rot (Okabe-Ito); Tritan: Rot und Türkis statt Grün/Blau-Gelb.
const P = {
  aus: { gut: [0.15, 0.7, 0.35], schlecht: [0.85, 0.15, 0.12], warn: [0.95, 0.8, 0.15] },
  protan: { gut: [0.0, 0.45, 0.70], schlecht: [0.90, 0.62, 0.0], warn: [0.94, 0.89, 0.26] },
  deutan: { gut: [0.0, 0.45, 0.70], schlecht: [0.84, 0.37, 0.0], warn: [0.94, 0.89, 0.26] },
  tritan: { gut: [0.0, 0.62, 0.45], schlecht: [0.85, 0.15, 0.12], warn: [0.80, 0.47, 0.65] },
};
let mode = "aus";
export const setColorVision = (m) => { mode = P[m] ? m : "aus"; };
export const colorVision = () => mode;
/** Bedeutungsfarbe als [r, g, b] 0…1 */
export const meaning = (k, m = mode) => (P[m] || P.aus)[k];
