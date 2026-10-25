// Regelkörper (MegaCAD-Abgleich M5): Quader, Zylinder, Kugel, Kegel/Kegelstumpf, Torus, Pyramide in einem Schritt.
// Lage: Basispunkt (Mitte der Grundfläche, bei Kugel/Torus die Mitte) und Achsrichtung. Maße und exakte Volumen
// stehen hier, damit Prüfungen und Tests ohne Geometrie-Kern laufen; den Körper baut src/kernel/build.js.

export const REGEL_KINDS = {
  quader: { label: "Quader", fields: ["L", "B", "H"] },
  zylinder: { label: "Zylinder", fields: ["D", "H"] },
  kugel: { label: "Kugel", fields: ["D"] },
  kegel: { label: "Kegel / Kegelstumpf", fields: ["D", "d", "H"] },
  torus: { label: "Torus (Ring)", fields: ["D", "d"] },
  pyramide: { label: "Pyramide", fields: ["L", "B", "H"] },
};

export const REGEL_LABELS = {
  L: "Länge L (x)", B: "Breite B (y)", H: "Höhe H",
  D: "Durchmesser D", d: "Durchmesser oben d",
};
const LABELS_BY_KIND = { torus: { D: "Mittendurchmesser D", d: "Ringdurchmesser d" } };
export const regelLabel = (kind, k) => LABELS_BY_KIND[kind]?.[k] || REGEL_LABELS[k];

export const REGEL_DEFAULTS = {
  quader: { L: "100", B: "60", H: "40" },
  zylinder: { D: "50", H: "100" },
  kugel: { D: "60" },
  kegel: { D: "60", d: "0", H: "80" },
  torus: { D: "100", d: "20" },
  pyramide: { L: "60", B: "60", H: "60" },
};

export function defaultRegelkoerper(kind = "zylinder") {
  return { type: "regelkoerper", kind, dims: { ...REGEL_DEFAULTS[kind] }, pos: ["0", "0", "0"], axis: "Z", op: "join" };
}

/** Maße prüfen (Zahlen); wirft mit verständlicher Meldung */
export function checkRegel(kind, d) {
  const def = REGEL_KINDS[kind];
  if (!def) throw new Error("Unbekannter Regelkörper: " + kind);
  for (const k of def.fields) {
    const v = d[k];
    const zeroOk = kind === "kegel" && k === "d";
    if (!Number.isFinite(v) || v < 0 || (!zeroOk && v === 0)) throw new Error(`${regelLabel(kind, k)} muss ${zeroOk ? "≥ 0" : "> 0"} sein`);
  }
  if (kind === "torus" && d.d >= d.D) throw new Error("Ringdurchmesser d muss kleiner als der Mittendurchmesser D sein");
  if (kind === "kegel" && Math.abs(d.d - d.D) < 1e-9) throw new Error("Kegel mit D = d ist ein Zylinder – Zylinder wählen");
}

/** Exaktes Volumen in mm³ */
export function regelVolume(kind, d) {
  const PI = Math.PI;
  switch (kind) {
    case "quader": return d.L * d.B * d.H;
    case "zylinder": return (PI / 4) * d.D * d.D * d.H;
    case "kugel": return (PI / 6) * d.D ** 3;
    case "kegel": { const R = d.D / 2, r = d.d / 2; return (PI * d.H * (R * R + R * r + r * r)) / 3; }
    case "torus": return (PI * PI * d.D * d.d * d.d) / 4;
    case "pyramide": return (d.L * d.B * d.H) / 3;
  }
  return 0;
}
