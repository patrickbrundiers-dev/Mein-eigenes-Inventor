// Geländer nach deutschen Regeln (Hinweise, keine Berechnung der Standsicherheit). Grundlage je Nutzung:
//  wohn      – Landesbauordnungen nach MBO § 38, DIN 18065 (Treppen): Höhe ≥ 900 mm, bei Absturzhöhe > 12 m
//              ≥ 1100 mm; Öffnungen ≤ 120 mm (auch zu Boden/Stufe); keine waagrechten Füllstäbe (Leitereffekt),
//              wo Kinder zu erwarten sind.
//  arbeit    – Arbeitsstätten, ASR A2.1: Höhe ≥ 1000 mm, bei Absturzhöhe > 12 m ≥ 1100 mm; senkrechte Stäbe
//              ≤ 180 mm lichter Abstand, Knieleisten ≤ 500 mm lichter Abstand.
//  industrie – Maschinen/Anlagen, nur Betriebspersonal, DIN EN ISO 14122-3: Höhe ≥ 1100 mm, Knieleisten ≤ 500 mm
//              lichter Abstand, Fußleiste ≥ 100 mm.
// Landesrecht und Sonderbauten können strenger sein – die Meldungen nennen die Grundlage.

export const USES = [
  ["wohn", "Wohngebäude / Kinder zu erwarten (LBO, DIN 18065)"],
  ["arbeit", "Arbeitsstätte (ASR A2.1)"],
  ["industrie", "Industrie, nur Betriebspersonal (DIN EN ISO 14122-3)"],
];
const BASIS = { wohn: "LBO/DIN 18065", arbeit: "ASR A2.1", industrie: "DIN EN ISO 14122-3" };

/** Schema: Nutzung (und auf Wunsch Absturzhöhe) – ältere Features ohne Angabe prüfen nach »def« */
export function normSchema(key = (k) => k, group, when = () => true, { def = "wohn", fall = true } = {}) {
  const out = [{ key: key("use"), label: "Nutzung (Geländernorm)", type: "select", options: USES, default: def, missing: def, group, when }];
  if (fall) out.push({ key: key("fall"), label: "Absturzhöhe", type: "num", default: "3000", group, when });
  return out;
}

/** Grenzwerte zur Nutzung und Absturzhöhe (mm) */
export function normRules(use = "wohn", fall = 0) {
  const high = fall > 12000 + 1e-6;
  if (use === "industrie") return { use, minH: 1100, gapV: 180, gapH: 500, climb: false, toe: 100 };
  if (use === "arbeit") return { use, minH: high ? 1100 : 1000, gapV: 180, gapH: 500, climb: false, toe: 0 };
  return { use: "wohn", minH: high ? 1100 : 900, gapV: 120, gapH: 120, climb: true, toe: 0 };
}

/**
 * Meldungen zu einem Geländer. c: { use, fall, height, fill ("staketen" | "quer" | "keine" | "blech" | …),
 * gap (größte lichte Öffnung der Füllung), bottom (Abstand Boden/Stufe bis Unterkante Geländer, optional),
 * open (lichte Höhe ohne Füllung, für »keine«), rail (Handlauf-Profil, optional) }, keys: Feldschlüssel
 * { height, fill, gap, bottom, rail, use }.
 */
export function railingIssues(c, keys = {}) {
  const r = normRules(c.use, c.fall), b = BASIS[r.use], out = [];
  const k = (x) => keys[x] || keys.use || x;
  const mm = (x) => `${Math.round(x)} mm`;
  if (c.height < r.minH - 1e-6) out.push({ key: k("height"), level: "Warnung", message: `Höhe ${mm(c.height)} unter ${mm(r.minH)} (${b}${r.use !== "industrie" && c.fall > 12000 ? ", Absturzhöhe über 12 m" : ""})` });
  const horiz = c.fill === "quer";
  const limit = horiz ? r.gapH : r.gapV;
  if (c.fill === "keine") {
    if (c.open > (r.use === "wohn" ? 120 : 500) + 1e-6) out.push({ key: k("fill"), level: "Warnung", message: r.use === "wohn" ? `Ohne Füllung: Öffnung ${mm(c.open)} über 120 mm (${b})` : `Ohne Füllung: Knieleiste nötig, lichte Höhe ${mm(c.open)} über 500 mm (${b})` });
  } else if (c.gap > limit + 1e-6) {
    out.push({ key: k("gap"), level: "Warnung", message: `${horiz ? "Abstand der Querstäbe" : "Öffnung"} ${mm(c.gap)} über ${mm(limit)} (${b})` });
  }
  if (r.climb && horiz) out.push({ key: k("fill"), level: "Warnung", message: `Waagrechte Füllstäbe sind leicht zu beklettern – wo Kinder zu erwarten sind, senkrechte Stäbe oder geschlossene Füllung (${b})` });
  if (r.use === "wohn" && c.bottom > 120 + 1e-6) out.push({ key: k("bottom"), level: "Warnung", message: `Abstand Boden bis Unterkante Geländer ${mm(c.bottom)} über 120 mm (${b})` });
  if (r.toe) out.push({ key: k("use"), level: "Hinweis", message: `Fußleiste ≥ ${r.toe} mm vorsehen (${b}) – wird nicht erzeugt` });
  const rail = c.rail;
  if (rail && (rail.kind === "rohr" || rail.kind === "rund") && (rail.geom.width < 30 - 1e-6 || rail.geom.width > 45 + 1e-6)) out.push({ key: k("rail"), level: "Hinweis", message: `Handlauf Ø ${String(Math.round(rail.geom.width * 10) / 10).replace(".", ",")} mm – gut umgreifbar sind 30 … 45 mm` });
  return out;
}
