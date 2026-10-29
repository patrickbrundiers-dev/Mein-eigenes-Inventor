// Normteile (MegaCAD-Abgleich M20, erweitert zur Normteil-Bibliothek): die Familien mit Maßtabellen und Rezepten
// stehen in src/core/normlib.js; hier liegen die alten Schnittstellen (Prüfung, Normbezeichnung, Stückliste,
// Verschraubung), damit Stückliste und Tests ohne Geometrie-Kern laufen. Den Körper baut src/kernel/build.js.
import { NORM_FAMILIES, familyOf, familyDesignation, gradeInfo, lengthsFor } from "./normlib.js";

/** Nennmaße je Gewinde: P Steigung, s Schlüsselweite, k Kopfhöhe (ISO 4014/4017), m Mutterhöhe (ISO 4032),
 *  Scheibe ISO 7089: d1 innen, d2 außen, h Dicke */
export const NORM_THREADS = {
  M6: { d: 6, P: 1, s: 10, k: 4, m: 5.2, d1: 6.4, d2: 12, h: 1.6 },
  M8: { d: 8, P: 1.25, s: 13, k: 5.3, m: 6.8, d1: 8.4, d2: 16, h: 1.6 },
  M10: { d: 10, P: 1.5, s: 16, k: 6.4, m: 8.4, d1: 10.5, d2: 20, h: 2 },
  M12: { d: 12, P: 1.75, s: 18, k: 7.5, m: 10.8, d1: 13, d2: 24, h: 2.5 },
  M14: { d: 14, P: 2, s: 21, k: 8.8, m: 12.8, d1: 15, d2: 28, h: 2.5 },
  M16: { d: 16, P: 2, s: 24, k: 10, m: 14.8, d1: 17, d2: 30, h: 3 },
  M20: { d: 20, P: 2.5, s: 30, k: 12.5, m: 18, d1: 21, d2: 37, h: 3 },
  M24: { d: 24, P: 3, s: 36, k: 15, m: 21.5, d1: 25, d2: 44, h: 4 },
  M27: { d: 27, P: 3, s: 41, k: 17, m: 23.8, d1: 28, d2: 50, h: 4 },
  M30: { d: 30, P: 3.5, s: 46, k: 18.7, m: 25.6, d1: 31, d2: 56, h: 4 },
};
export const NORM_SIZES = Object.keys(NORM_THREADS);

/** Spannschloss DIN 1480 (offen, geschmiedet): l Körperlänge (innen zwischen den Gewindenaben), b Breite, e Nabenlänge */
export const turnbuckleDims = (size) => { const t = NORM_FAMILIES.spannschloss.sizes[size]; return t && { l: t.l, b: t.bw, e: t.e }; };

/** Vorzugslängen ISO 4014/4017 */
export const BOLT_LENGTHS = [8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300];

/** Alle Normteil-Arten der Bibliothek (src/core/normlib.js): { label, norm, noun, length, grades, cat, … } */
export const NORM_KINDS = NORM_FAMILIES;
/** Wählbare Größen je Art (Gewinde, Ø, Rohrgröße …) */
export const normSizes = (kind) => NORM_FAMILIES[kind]?.sizeList || NORM_SIZES;
/** Maße eines Beschlags (E11) */
export const beschlagDims = (kind, size) => (NORM_FAMILIES[kind]?.beschlag ? NORM_FAMILIES[kind].sizes[size] || null : null);
/** Dichte g/cm³: nichtrostend 7,9, sonst Stahl 7,85 (Aluminium, Kunststoff nach Werkstoffangabe) */
export const normDensity = (grade) => gradeInfo(grade).density;
export const gradeMaterial = (grade) => gradeInfo(grade).label;

export function defaultNormteil(kind = "schraube4017", custom) {
  const def = familyOf(kind, custom);
  if (!def) throw new Error("Unbekanntes Normteil: " + kind);
  const size = def.def?.size && def.sizes[def.def.size] ? def.def.size : def.sizeList[Math.floor(def.sizeList.length / 2)];
  const length = def.length ? String(def.def?.length ?? lengthsFor(def, size)[0] ?? 40) : "40";
  return { type: "normteil", kind, size, length, grade: def.grades[0], galv: !!def.galv, pos: ["0", "0", "0"], axis: "Z", ...(custom ? { custom } : {}) };
}

/** Gewindelänge b für ISO 4014 nach Nennlänge */
export const threadLength4014 = (d, L) => 2 * d + (L <= 125 ? 6 : L <= 200 ? 12 : 25);

/** Prüfen; gibt Warnungen zurück, wirft bei unbrauchbaren Werten */
export function checkNorm(kind, size, L, custom) {
  const def = familyOf(kind, custom);
  if (!def) throw new Error("Unbekanntes Normteil: " + kind);
  const t = def.sizes[size];
  if (!t) throw new Error(def.beschlag ? `Unbekannte Größe für ${def.label}: ${size}` : `Unbekannte Gewindegröße: ${size} gibt es für ${def.norm} nicht`);
  const warnings = [];
  if (def.length) {
    if (!(L > 0)) throw new Error("Länge muss > 0 sein");
    const list = lengthsFor(def, size);
    if (def.freeLength) { if (L > 3000) warnings.push("Gewindestangen gibt es meist bis 3000 mm"); }
    else if (list.length) {
      if (L < list[0] - 1e-9 || L > list.at(-1) + 1e-9) warnings.push(`Länge außerhalb ${list[0]}–${list.at(-1)} mm für ${size}`);
      else if (!list.some((l) => Math.abs(l - L) < 1e-9)) warnings.push(`${L} mm ist keine Vorzugslänge`);
    }
    if (kind === "schraube4014" && L < threadLength4014(t.d, L) + 2 * t.P) warnings.push(`Für ${size} x ${L} gibt es keinen Schaft – ISO 4017 wählen`);
  }
  return warnings;
}

/** Normbezeichnung wie auf der Stückliste, z. B. »Sechskantschraube ISO 4017 - M12 x 40 - 8.8« */
export function normDesignation({ kind, size, length, grade, galv, custom }) {
  const def = familyOf(kind, custom);
  if (!def) return "?";
  return familyDesignation(def, { size, length, grade, galv });
}

/** Normteile aus Bauteil-Ergebnissen zählen. sources: [{ bodies, qty }] → [{ key, name, material, qty, mass }] (mass kg/Stk) */
export function collectNorm(sources) {
  const map = new Map();
  for (const s of sources) {
    for (const b of s.bodies || []) {
      const n = b.meta?.norm;
      if (!n) continue;
      const row = map.get(n.designation) || { key: n.designation, name: n.designation, material: n.material || gradeMaterial(n.grade), norm: n.norm || NORM_FAMILIES[n.kind]?.norm || "", qty: 0, mass: ((b.props?.volume || 0) * (b.meta.density ?? 7.85)) / 1e6 };
      row.qty += s.qty ?? 1;
      map.set(n.designation, row);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
}

/** Schraubengröße zu einer Durchgangsbohrung (mittlere Reihe ISO 273: d + 1 bis d + 3) */
export function boltSizeForHole(holeDia) {
  let best = null;
  for (const k of NORM_SIZES) if (NORM_THREADS[k].d <= holeDia - 0.9) best = k;
  return best;
}

/**
 * Verschraubung durch eine Klemmlänge (Schraube ISO 4017, je eine Scheibe ISO 7089 unter Kopf und Mutter, Mutter ISO 4032).
 * Achse z: Klemmpaket von z = 0 bis z = clamp. Rückgabe { length, parts: [{ kind, size, length?, z0 }] } – jedes Teil
 * beginnt bei z0 und geht in +z. Länge = Vorzugslänge ≥ Klemmlänge + 2 Scheiben + Mutter + 2 Gewindegänge Überstand.
 */
export function boltSet(size, clamp) {
  const t = NORM_THREADS[size];
  if (!t) throw new Error("Unbekannte Gewindegröße: " + size);
  if (!(clamp > 0)) throw new Error("Klemmlänge muss > 0 sein");
  const need = clamp + 2 * t.h + t.m + 2 * t.P;
  const length = BOLT_LENGTHS.find((l) => l >= need - 1e-9) ?? Math.ceil(need / 10) * 10;
  return {
    length,
    parts: [
      { kind: "schraube4017", size, length, z0: -t.h },
      { kind: "scheibe", size, z0: -t.h },
      { kind: "scheibe", size, z0: clamp },
      { kind: "mutter", size, z0: clamp + t.h },
    ],
  };
}
