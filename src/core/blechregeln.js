// Werkzeuge Stufe 44: Blechregeln (wie Inventor »Blech-Standards«). Eine Regel bündelt Werkstoff, Blechdicke,
// Innenradius, Abwicklungsregel (K-Faktor, Biegetabelle, DIN 6935) und den Freischnitt für Laschen.
// Die Regeln stehen in den Benutzereinstellungen; am Kantteil wird eine Kopie der gewählten Regel gespeichert
// (f.sheetRule), damit die Projektdatei ohne die Einstellungen gleich rechnet. »Dicke aus Regel« (f.tFromRule)
// und »Werkstoff nach Regel« (f.matFromRule) sind ohne Angabe eingeschaltet.

import { RULES } from "./bendtable.js";

export const MAX_SHEET_RULES = 40;
export const RELIEFS = [["rechteck", "Rechteckig"], ["keiner", "Ohne"]];

/** Vorgaben für neue Installationen – übliche Werte, keine Werkstattmaße; jede Werkstatt passt sie an */
export const DEFAULT_SHEET_RULES = Object.freeze([
  { id: "st2", name: "Stahl 2 mm", material: "S235", t: 2, ri: 2, rule: "k", k: 0.33, relief: "rechteck", reliefW: 0, reliefD: 0 },
  { id: "st3", name: "Stahl 3 mm", material: "S235", t: 3, ri: 3, rule: "k", k: 0.33, relief: "rechteck", reliefW: 0, reliefD: 0 },
  { id: "va15", name: "Edelstahl 1,5 mm", material: "1.4301", t: 1.5, ri: 1.5, rule: "k", k: 0.35, relief: "rechteck", reliefW: 0, reliefD: 0 },
  { id: "alu2", name: "Alu 2 mm", material: "AlMg3", t: 2, ri: 3, rule: "k", k: 0.4, relief: "rechteck", reliefW: 0, reliefD: 0 },
]);

const num = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")));

/** Eine Regel prüfen; Rückgabe {ok, value|error} */
export function validateSheetRule(r) {
  if (!r || typeof r !== "object") return { ok: false, error: "Blechregel erwartet" };
  const name = String(r.name ?? "").trim();
  if (!name || name.length > 40) return { ok: false, error: "Blechregel braucht einen Namen (höchstens 40 Zeichen)" };
  const id = String(r.id ?? "");
  if (!/^[a-z0-9]{1,16}$/.test(id)) return { ok: false, error: `Blechregel »${name}«: ungültige Kennung` };
  const t = num(r.t), ri = num(r.ri), k = num(r.k ?? 0.33);
  if (!(t > 0 && t <= 50)) return { ok: false, error: `Blechregel »${name}«: Dicke 0 bis 50 mm` };
  if (!(ri >= 0 && ri <= 500)) return { ok: false, error: `Blechregel »${name}«: Innenradius 0 bis 500 mm` };
  if (!(k >= 0 && k <= 1)) return { ok: false, error: `Blechregel »${name}«: K-Faktor 0 bis 1` };
  const rule = RULES.some((x) => x.value === r.rule) ? r.rule : "k";
  const material = String(r.material ?? "").trim();
  if (!material || material.length > 20) return { ok: false, error: `Blechregel »${name}«: Werkstoff fehlt` };
  const relief = RELIEFS.some(([v]) => v === r.relief) ? r.relief : "rechteck";
  const reliefW = num(r.reliefW ?? 0), reliefD = num(r.reliefD ?? 0);
  if (!(reliefW >= 0 && reliefD >= 0)) return { ok: false, error: `Blechregel »${name}«: Freischnitt nicht negativ` };
  return { ok: true, value: { id, name, material, t, ri, rule, k, relief, reliefW, reliefD } };
}

/** Liste prüfen (Einstellung blech.regeln): Namen und Kennungen eindeutig */
export function validateSheetRules(v) {
  if (!Array.isArray(v)) return { ok: false, error: "Liste von Blechregeln erwartet" };
  if (v.length > MAX_SHEET_RULES) return { ok: false, error: `Höchstens ${MAX_SHEET_RULES} Blechregeln` };
  const out = [], names = new Set(), ids = new Set();
  for (const r of v) {
    const c = validateSheetRule(r);
    if (!c.ok) return c;
    if (names.has(c.value.name)) return { ok: false, error: `Blechregel »${c.value.name}« doppelt` };
    if (ids.has(c.value.id)) return { ok: false, error: `Kennung ${c.value.id} doppelt` };
    names.add(c.value.name); ids.add(c.value.id);
    out.push(c.value);
  }
  return { ok: true, value: out };
}

/**
 * Wirksame Blechwerte eines Kantteils. E wertet Ausdrücke aus (Parameter des Bauteils).
 * Mit Regel: Innenradius, Abwicklungsregel und K kommen aus der Regel; die Dicke nur mit »Dicke aus Regel«.
 */
export function effectiveSheet(f, E, partMaterial) {
  const R = f.sheetRule && typeof f.sheetRule === "object" ? f.sheetRule : null;
  if (!R) return { t: E(f.t ?? "2", "Blechdicke"), ri: E(f.ri ?? "0", "Innenradius"), k: E(f.k ?? "0.33", "K-Faktor"), rule: f.rule || "k", material: partMaterial, relief: null, ruleName: "" };
  return {
    t: f.tFromRule === false ? E(f.t ?? String(R.t), "Blechdicke") : R.t,
    ri: R.ri, k: R.k, rule: R.rule || "k",
    material: f.matFromRule === false ? partMaterial : R.material || partMaterial,
    relief: { relief: R.relief || "rechteck", reliefW: R.reliefW || 0, reliefD: R.reliefD || 0 },
    ruleName: R.name,
  };
}

/** Regel an ein Kantteil hängen (Kopie) – oder lösen (rule = null: Werte bleiben als eigene Werte stehen) */
export function applySheetRule(f, rule) {
  if (!rule) {
    if (f.sheetRule) { f.t = String(f.tFromRule === false ? f.t : f.sheetRule.t); f.ri = String(f.sheetRule.ri); f.k = String(f.sheetRule.k); f.rule = f.sheetRule.rule; }
    delete f.sheetRule; delete f.tFromRule; delete f.matFromRule;
    return f;
  }
  f.sheetRule = { ...rule };
  return f;
}

/** Kantteile eines Projekts, deren Regelkopie von der Bibliothek abweicht (gleiche Kennung) – zum Aktualisieren */
export function outdatedSheetRules(docs, rules) {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const out = [];
  for (const d of docs) for (const f of d.features || []) {
    if (!["kantteil", "konturwalzen", "blechkasten"].includes(f.type) || !f.sheetRule) continue;
    const lib = byId.get(f.sheetRule.id);
    if (lib && JSON.stringify(lib) !== JSON.stringify(f.sheetRule)) out.push({ doc: d.id, feature: f.id, rule: lib });
  }
  return out;
}
