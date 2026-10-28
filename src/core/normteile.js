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
  // Beschläge (E11): Größe nach Rohr bzw. Banddurchmesser statt Gewinde, Maße typischer Handelsware (Nennmaße, keine Norm)
  anschweissband: { label: "Anschweißband (Torband)", norm: "", noun: "Anschweißband", length: false, grades: ["S235", "A2"], beschlag: true, sizes: {
    "Ø16 x 80": { D: 16, L: 80 }, "Ø20 x 100": { D: 20, L: 100 }, "Ø25 x 120": { D: 25, L: 120 }, "Ø30 x 140": { D: 30, L: 140 } }, def: "Ø20 x 100" },
  kugelkappe: { label: "Kugelkappe für Rundrohr", norm: "", noun: "Kugelkappe für Rohr", length: false, grades: ["S235", "A2"], beschlag: true, sizes: {
    "Ø33,7": { D: 33.7 }, "Ø42,4": { D: 42.4 }, "Ø48,3": { D: 48.3 }, "Ø60,3": { D: 60.3 }, "Ø76,1": { D: 76.1 } }, def: "Ø42,4" },
  rohrkappe: { label: "Flache Kappe für Rundrohr", norm: "", noun: "Rohrkappe flach", length: false, grades: ["S235", "A2", "Kunststoff"], beschlag: true, sizes: {
    "Ø33,7": { D: 33.7 }, "Ø42,4": { D: 42.4 }, "Ø48,3": { D: 48.3 }, "Ø60,3": { D: 60.3 }, "Ø76,1": { D: 76.1 } }, def: "Ø42,4" },
  vierkantkappe: { label: "Kappe für Vierkantrohr", norm: "", noun: "Vierkantkappe", length: false, grades: ["S235", "A2", "Kunststoff"], beschlag: true, sizes: {
    "30 x 30": { a: 30 }, "40 x 40": { a: 40 }, "50 x 50": { a: 50 }, "60 x 60": { a: 60 }, "80 x 80": { a: 80 }, "100 x 100": { a: 100 } }, def: "40 x 40" },
  bodenanschlag: { label: "Bodenanschlag für Tore", norm: "", noun: "Bodenanschlag", length: false, grades: ["S235", "A2"], beschlag: true, sizes: {
    "klein (40 hoch)": { w: 60, d: 50, h: 40, t: 5 }, "groß (60 hoch)": { w: 80, d: 60, h: 60, t: 6 } }, def: "klein (40 hoch)" },
};
/** Wählbare Größen je Art: Gewinde für Schrauben usw., eigene Liste für Beschläge */
export const normSizes = (kind) => (NORM_KINDS[kind]?.sizes ? Object.keys(NORM_KINDS[kind].sizes) : NORM_SIZES);
export const beschlagDims = (kind, size) => NORM_KINDS[kind]?.sizes?.[size] || null;
const STAINLESS = /^A[24]/;
/** Dichte g/cm³: nichtrostend 7,9, sonst Stahl 7,85 */
export const normDensity = (grade) => (grade === "Kunststoff" ? 0.95 : STAINLESS.test(grade || "") ? 7.9 : 7.85);
export const gradeMaterial = (grade) => (grade === "Kunststoff" ? "Kunststoff (PE)" : STAINLESS.test(grade || "") ? `nichtrostend ${grade}` : `Stahl ${grade}`);

export function defaultNormteil(kind = "schraube4017") {
  const def = NORM_KINDS[kind];
  return { type: "normteil", kind, size: def.def || "M12", length: kind === "gewindestange" ? "1000" : "40", grade: def.grades[0], galv: false, pos: ["0", "0", "0"], axis: "Z" };
}

/** Gewindelänge b für ISO 4014 nach Nennlänge */
export const threadLength4014 = (d, L) => 2 * d + (L <= 125 ? 6 : L <= 200 ? 12 : 25);

/** Prüfen; gibt Warnungen zurück, wirft bei unbrauchbaren Werten */
export function checkNorm(kind, size, L) {
  const def = NORM_KINDS[kind];
  if (!def) throw new Error("Unbekanntes Normteil: " + kind);
  if (def.sizes) {
    if (!def.sizes[size]) throw new Error(`Unbekannte Größe für ${def.label}: ${size}`);
    return [];
  }
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
  if (def.beschlag) return [`${def.noun} ${size}`, grade].filter(Boolean).join(" - ") + (galv && !STAINLESS.test(grade || "") && grade !== "Kunststoff" ? " - tZn" : "");
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
