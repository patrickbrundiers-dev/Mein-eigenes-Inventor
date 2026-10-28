// Generator-Grundgerüst (MegaCAD-Abgleich M10): Geländer, Tor, Treppe … als Feature in einem Bauteil.
// Ein Generator beschreibt seine Parameter (Schema) und rechnet daraus einen Bauplan; den Körper baut
// src/kernel/build.js (Stäbe wie beim Profil/Rahmen, also mit Zuschnittliste, Gewicht und STEP).
//
// Schema-Einträge: { key, label, type, default, missing?, unit?, options?, kinds?, when?(p), group? }
//   missing: Wert für ältere Features ohne diesen Parameter (sonst default), damit sie sich nicht verändern
//   type "num"     Ausdruck (Parameter erlaubt), Ergebnis Zahl
//   type "select"  options [[wert, text]]
//   type "check"   Ja/Nein
//   type "section" Profil aus dem Katalog { kind, size }, kinds = erlaubte Profilarten
//   type "list"    Zahlenliste, z. B. Längen "3000; 1500"
// Bauplan: { chains: [{ section, points, name, up?, rot? }], – zusammenhängende Stäbe mit Gehrung an den Ecken
//            members: [{ section, a, b, name, up?, rot? }], – einzelne Stäbe, Enden gerade
//            plates: [{ center, xDir, normal, W, H, t, holes? ([x, y] oder [x, y, Ø]), rects? ([x, y, w, h] Rechteckausschnitte), slots? ([x, y, Länge] entlang xDir), d?, r?, poly?, name }], – Platten (Mitte der Unterseite;
//              poly = Umriss [[x, y]…] in der Plattenebene statt Rechteck W × H)
//            norms?: [{ kind, size, length?, grade?, pos, dir, name? } | { bolt: true, size, clamp, pos, dir, grade? }],
//              – Normteile bzw. Verschraubungen (Schraube, Scheiben, Mutter; Klemmpaket ab pos in Richtung dir)
//            drills?: [{ target, p, dir, d | w, h, xDir, len }], – Bohrung Ø d bzw. Durchbruch w × h (w entlang xDir)
//              ab p in Richtung dir (Länge len) im Stab bzw. Zug
//              namens target, nur im Stück, durch dessen Achse p geht (z. B. Handlaufhalter im Handlauf)
//            info, issues: [{ level, message }] }

import { catalogToDims, sectionGeometry, CATALOG } from "./sections.js";
import { splitList } from "./expr.js";
import { GELAENDER } from "./gelaender.js";
import { TOR } from "./tor.js";
import { SCHIEBETOR } from "./schiebetor.js";
import { ZAUN } from "./zaun.js";
import { TREPPE } from "./treppe.js";
import { SPINDEL } from "./spindel.js";
import { BALKON } from "./balkon.js";
import { WINDVERBAND, PFETTE, RAHMENECKE } from "./stahlbau.js";
import { STUETZENFUSS } from "./stuetzenfuss.js";
import { TRAEGERSTOSS } from "./traegerstoss.js";
import { TRAEGERANSCHLUSS } from "./traegeranschluss.js";
import { STEIGLEITER } from "./steigleiter.js";
import { FACHWERK } from "./fachwerk.js";

export const GENERATORS = { gelaender: GELAENDER, tor: TOR, schiebetor: SCHIEBETOR, zaun: ZAUN, treppe: TREPPE, spindel: SPINDEL, balkon: BALKON, windverband: WINDVERBAND, pfette: PFETTE, rahmenecke: RAHMENECKE, stuetzenfuss: STUETZENFUSS, traegerstoss: TRAEGERSTOSS, traegeranschluss: TRAEGERANSCHLUSS, steigleiter: STEIGLEITER, fachwerk: FACHWERK };

/** Neues Feature mit den Standardwerten des Generators */
export function defaultGenerator(gen) {
  const g = GENERATORS[gen];
  if (!g) throw new Error("Unbekannter Generator " + gen);
  return { type: "generator", gen, params: Object.fromEntries(g.schema.map((s) => [s.key, structuredCloneSafe(s.default)])) };
}

/** Rohwerte aller Parameter (fehlende: missing bzw. default), z. B. für die when-Bedingungen im Eigenschaftenfeld */
export function genValues(gen, params) {
  const g = GENERATORS[gen];
  return Object.fromEntries(g.schema.map((s) => [s.key, params?.[s.key] ?? (s.missing !== undefined ? s.missing : s.default)]));
}

/** Parameter auflösen: Ausdrücke rechnen, Profile in Maße (Zahlen) wandeln. E(expr, label) → Zahl */
export function resolveGenParams(gen, params, E) {
  const g = GENERATORS[gen];
  if (!g) throw new Error("Unbekannter Generator " + gen);
  const out = {};
  const vals = genValues(gen, params);
  for (const s of g.schema) {
    const v = vals[s.key];
    if (s.type === "num") out[s.key] = E(String(v), s.label);
    else if (s.type === "list") out[s.key] = splitList(v).map((x, i) => E(x, `${s.label} ${i + 1}`));
    else if (s.type === "section") out[s.key] = sectionOf(v, s.label);
    else if (s.type === "check") out[s.key] = !!v;
    else out[s.key] = v;
  }
  return out;
}

/** Profil { kind, size, group? } → { kind, dims (Zahlen), geom, size }; group = Werkstoffgruppe der Profilbibliothek (Kantenradius) */
export function sectionOf(v, label = "Profil") {
  if (!v?.kind || !CATALOG[v.kind]) throw new Error(`${label}: Profilart fehlt`);
  const dims = Object.fromEntries(Object.entries(catalogToDims(v.kind, v.size, v.group)).map(([k, x]) => [k, Number(x)]));
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
