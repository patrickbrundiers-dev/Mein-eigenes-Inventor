// Generator-Grundgerüst (MegaCAD-Abgleich M10): Geländer, Tor, Treppe … als Feature in einem Bauteil.
// Ein Generator beschreibt seine Parameter (Schema) und rechnet daraus einen Bauplan; den Körper baut
// src/kernel/build.js (Stäbe wie beim Profil/Rahmen, also mit Zuschnittliste, Gewicht und STEP).
//
// Schema-Einträge: { key, label, type, default, unit?, options?, kinds?, when?(p), group? }
//   type "num"     Ausdruck (Parameter erlaubt), Ergebnis Zahl
//   type "select"  options [[wert, text]]
//   type "check"   Ja/Nein
//   type "section" Profil aus dem Katalog { kind, size }, kinds = erlaubte Profilarten
//   type "list"    Zahlenliste, z. B. Längen "3000; 1500"
// Bauplan: { chains: [{ section, points, name, up? }],   – zusammenhängende Stäbe mit Gehrung an den Ecken
//            members: [{ section, a, b, name, up?, rot? }], – einzelne Stäbe, Enden gerade
//            plates: [{ center, xDir, normal, W, H, t, holes?, d?, r?, name }], – Platten (Mitte der Unterseite)
//            info, issues: [{ level, message }] }

import { catalogToDims, sectionGeometry, CATALOG } from "./sections.js";
import { GELAENDER } from "./gelaender.js";
import { TOR } from "./tor.js";
import { TREPPE } from "./treppe.js";

export const GENERATORS = { gelaender: GELAENDER, tor: TOR, treppe: TREPPE };

/** Neues Feature mit den Standardwerten des Generators */
export function defaultGenerator(gen) {
  const g = GENERATORS[gen];
  if (!g) throw new Error("Unbekannter Generator " + gen);
  return { type: "generator", gen, params: Object.fromEntries(g.schema.map((s) => [s.key, structuredCloneSafe(s.default)])) };
}

/** Parameter auflösen: Ausdrücke rechnen, Profile in Maße (Zahlen) wandeln. E(expr, label) → Zahl */
export function resolveGenParams(gen, params, E) {
  const g = GENERATORS[gen];
  if (!g) throw new Error("Unbekannter Generator " + gen);
  const out = {};
  for (const s of g.schema) {
    const v = params?.[s.key] ?? s.default;
    if (s.type === "num") out[s.key] = E(String(v), s.label);
    else if (s.type === "list") out[s.key] = String(v).split(/[;\s]+/).filter(Boolean).map((x, i) => E(x, `${s.label} ${i + 1}`));
    else if (s.type === "section") out[s.key] = sectionOf(v, s.label);
    else if (s.type === "check") out[s.key] = !!v;
    else out[s.key] = v;
  }
  return out;
}

/** Profil { kind, size } → { kind, dims (Zahlen), geom, size } */
export function sectionOf(v, label = "Profil") {
  if (!v?.kind || !CATALOG[v.kind]) throw new Error(`${label}: Profilart fehlt`);
  const dims = Object.fromEntries(Object.entries(catalogToDims(v.kind, v.size)).map(([k, x]) => [k, Number(x)]));
  const geom = sectionGeometry(v.kind, dims);
  return { kind: v.kind, dims, geom, size: v.size };
}

/** Vorlagen (Parametersätze) prüfen und zusammenführen: nur bekannte Schlüssel übernehmen */
export function applyTemplate(gen, params, tpl) {
  const g = GENERATORS[gen];
  const keys = new Set(g.schema.map((s) => s.key));
  return { ...params, ...Object.fromEntries(Object.entries(tpl || {}).filter(([k]) => keys.has(k))) };
}

const structuredCloneSafe = (x) => (x && typeof x === "object" ? JSON.parse(JSON.stringify(x)) : x);
