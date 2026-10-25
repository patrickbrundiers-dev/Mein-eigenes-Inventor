// Beleuchtung der normalen 3D-Darstellung (Einstellung ansicht.beleuchtung). Fotodarstellung hat eigenes Licht.

export const LIGHTING = Object.freeze({
  standard: { head: 1.9, ambient: 0.95, hemi: 0.55 },
  kontrast: { head: 2.5, ambient: 0.45, hemi: 0.4 },
  weich: { head: 1.2, ambient: 1.3, hemi: 0.75 },
});
export const PHOTO_LIGHT = Object.freeze({ head: 0.6, ambient: 0.15, hemi: 0.25 });

/** Intensitäten für Kopflicht, Umgebung und Himmel; Unbekanntes → Standard */
export const lighting = (preset, photo = false) => (photo ? PHOTO_LIGHT : LIGHTING[preset] || LIGHTING.standard);
