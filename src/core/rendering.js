// Fotorealistische Darstellung (MegaCAD-Abgleich M22, ADR-0006): Oberflächen je Körper für physikalisch basiertes
// Rendern (PBR) im Viewer. Reine Zuordnung; das Licht, die Umgebung und der Bodenschatten stehen in src/ui/viewer.js.
//
// Grundlage ist der Werkstoff des Bauteils (Stahl, Edelstahl, Aluminium, Messing, Kunststoff); Körper mit eigener
// Bedeutung aus dem Generator (Glas, Holzbelag, Gitterrost, Riffelblech) und Normteile weichen davon ab.

import { finishSurface } from "./oberflaeche.js";

/** Oberfläche je Werkstoff-Schlüssel (sections.js MATERIALS); unbekannt → Baustahl */
const BY_MATERIAL = {
  S235: { metalness: 0.75, roughness: 0.42 },
  S355: { metalness: 0.75, roughness: 0.42 },
  "1.4301": { metalness: 0.95, roughness: 0.22 },
  "1.4571": { metalness: 0.95, roughness: 0.22 },
  AlMg3: { metalness: 0.9, roughness: 0.3 },
  AlMgSi: { metalness: 0.9, roughness: 0.3 },
  CuZn: { metalness: 1, roughness: 0.25 },
  PE: { metalness: 0, roughness: 0.6 },
  POM: { metalness: 0, roughness: 0.45 },
};
const STEEL = BY_MATERIAL.S235;

/**
 * PBR-Werte eines Körpers. material: Werkstoff-Schlüssel des Bauteils, meta: Körper-Metadaten aus dem Kern,
 * finish: Oberfläche des Bauteils (E7, verzinkt/pulver/RAL) – gilt nicht für Glas, Holz, Gitterrost, Riffelblech und Normteile.
 * Rückgabe { metalness, roughness, color?, opacity?, label } – color (Hex) nur, wenn die Körperfarbe ersetzt wird.
 */
export function photoSurface(material, meta, finish) {
  if (meta?.glass) return { metalness: 0, roughness: 0.05, color: "#cfe3ea", opacity: 0.35, label: "Glas" };
  if (meta?.tread === "holz") return { metalness: 0, roughness: 0.75, color: "#a0703f", label: "Holz" };
  if (meta?.tread === "gitterrost") return { metalness: 0.85, roughness: 0.5, color: "#a9b1b6", label: "Gitterrost verzinkt" };
  if (meta?.tread === "blech") return { metalness: 0.8, roughness: 0.48, label: "Riffelblech" };
  if (meta?.norm) return { metalness: 0.9, roughness: 0.35, color: "#b4bcc2", label: "Normteil verzinkt" };
  const fs = finishSurface(finish);
  if (fs) return fs;
  const m = BY_MATERIAL[material] || STEEL;
  return { ...m, label: material || "S235" };
}

/** Lage des Bodens und Ausdehnung von Schattenlicht/Bodenfläche aus der Inhaltsbox {min, max} (mm) */
export function photoStage(min, max) {
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
  const r = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  // Sonne von vorne links oben (Ansicht »Iso« schaut von vorne rechts), weit genug für das ganze Modell
  const dir = [-0.45, -0.6, 1];
  const n = Math.hypot(...dir);
  const sun = [cx + (dir[0] / n) * r * 3, cy + (dir[1] / n) * r * 3, cz + (dir[2] / n) * r * 3];
  return { center: [cx, cy, cz], radius: r, groundZ: min[2] - Math.max(0.5, r * 0.002), groundSize: r * 8, sun, shadowHalf: r * 1.3, shadowFar: r * 6 };
}
