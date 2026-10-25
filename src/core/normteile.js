// Normteile (MegaCAD-Abgleich M20): Sechskantschrauben ISO 4014/4017, Muttern ISO 4032, Scheiben ISO 7089,
// Gewindestangen DIN 976-1, Spannschlösser DIN 1480 (geschmiedet, offen). Maße aus den Normtabellen
// (Nennmaße), Gewinde nur als Kerndurchmesser-Bereich dargestellt. Hier stehen Tabellen, Prüfung und
// Normbezeichnung, damit Stückliste und Tests ohne Geometrie-Kern laufen; den Körper baut src/kernel/build.js.

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
const TURNBUCKLE = { M6: [70, 14, 9], M8: [80, 17, 11], M10: [100, 20, 13], M12: [125, 24, 15], M14: [140, 28, 17], M16: [170, 32, 19], M20: [200, 40, 23], M24: [255, 48, 28], M27: [255, 54, 31], M30: [300, 60, 34] };
export const turnbuckleDims = (size) => { const t = TURNBUCKLE[size]; return t && { l: t[0], b: t[1], e: t[2] }; };

/** Vorzugslängen ISO 4014/4017 */
export const BOLT_LENGTHS = [8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300];

export const NORM_KINDS = {
  schraube4017: { label: "Sechskantschraube, Gewinde bis Kopf", norm: "ISO 4017", noun: "Sechskantschraube", length: true, grades: ["8.8", "10.9", "A2-70", "A4-70"] },
  schraube4014: { label: "Sechskantschraube mit Schaft", norm: "ISO 4014", noun: "Sechskantschraube", length: true, grades: ["8.8", "10.9", "A2-70", "A4-70"] },
  mutter: { label: "Sechskantmutter", norm: "ISO 4032", noun: "Sechskantmutter", length: false, grades: ["8", "10", "A2-70", "A4-70"] },
  scheibe: { label: "Scheibe", norm: "ISO 7089", noun: "Scheibe", length: false, grades: ["200 HV", "300 HV", "A2", "A4"] },
  gewindestange: { label: "Gewindestange", norm: "DIN 976-1", noun: "Gewindestange", length: true, grades: ["4.8", "8.8", "A2-70", "A4-70"] },
  spannschloss: { label: "Spannschloss (offen)", norm: "DIN 1480", noun: "Spannschloss", length: false, grades: ["verzinkt", "blank"] },
};
const STAINLESS = /^A[24]/;
/** Dichte g/cm³: nichtrostend 7,9, sonst Stahl 7,85 */
export const normDensity = (grade) => (STAINLESS.test(grade || "") ? 7.9 : 7.85);
export const gradeMaterial = (grade) => (STAINLESS.test(grade || "") ? `nichtrostend ${grade}` : `Stahl ${grade}`);

export function defaultNormteil(kind = "schraube4017") {
  const def = NORM_KINDS[kind];
  return { type: "normteil", kind, size: "M12", length: kind === "gewindestange" ? "1000" : "40", grade: def.grades[0], galv: false, pos: ["0", "0", "0"], axis: "Z" };
}

/** Gewindelänge b für ISO 4014 nach Nennlänge */
export const threadLength4014 = (d, L) => 2 * d + (L <= 125 ? 6 : L <= 200 ? 12 : 25);

/** Prüfen; gibt Warnungen zurück, wirft bei unbrauchbaren Werten */
export function checkNorm(kind, size, L) {
  const def = NORM_KINDS[kind];
  if (!def) throw new Error("Unbekanntes Normteil: " + kind);
  const t = NORM_THREADS[size];
  if (!t) throw new Error("Unbekannte Gewindegröße: " + size);
  const warnings = [];
  if (def.length) {
    if (!(L > 0)) throw new Error("Länge muss > 0 sein");
    if (kind === "gewindestange") { if (L > 3000) warnings.push("Gewindestangen gibt es meist bis 3000 mm"); }
    else {
      if (L < 8 || L > 300) warnings.push("Länge außerhalb 8–300 mm");
      else if (!BOLT_LENGTHS.includes(L)) warnings.push(`${L} mm ist keine Vorzugslänge`);
      if (kind === "schraube4014" && L < threadLength4014(t.d, L) + 2 * t.P) warnings.push(`Für ${size} x ${L} gibt es keinen Schaft – ISO 4017 wählen`);
    }
  }
  return warnings;
}

/** Normbezeichnung wie auf der Stückliste, z. B. »Sechskantschraube ISO 4017 - M12 x 40 - 8.8« */
export function normDesignation({ kind, size, length, grade, galv }) {
  const def = NORM_KINDS[kind];
  if (!def) return "?";
  const sz = kind === "scheibe" ? String(NORM_THREADS[size]?.d ?? size) : size;
  const parts = [`${def.noun} ${def.norm}`, def.length ? `${sz} x ${length}` : sz];
  if (grade) parts.push(grade);
  return parts.join(" - ") + (galv && !STAINLESS.test(grade || "") && kind !== "spannschloss" ? " - tZn" : "");
}

/** Normteile aus Bauteil-Ergebnissen zählen. sources: [{ bodies, qty }] → [{ key, name, material, qty, mass }] (mass kg/Stk) */
export function collectNorm(sources) {
  const map = new Map();
  for (const s of sources) {
    for (const b of s.bodies || []) {
      const n = b.meta?.norm;
      if (!n) continue;
      const row = map.get(n.designation) || { key: n.designation, name: n.designation, material: gradeMaterial(n.grade), qty: 0, mass: ((b.props?.volume || 0) * (b.meta.density ?? 7.85)) / 1e6 };
      row.qty += s.qty ?? 1;
      map.set(n.designation, row);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
}
