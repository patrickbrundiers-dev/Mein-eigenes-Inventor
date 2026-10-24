import { validateKeymap } from "./commands.js";

// Benutzereinstellungen: Schema, Standardwerte, Prüfung, Migration, Suche.
// Reines Modul ohne DOM – die Oberfläche (src/ui/prefs.js) speichert und wendet an.
//
// Effektiver Wert (Masterplan 14): Werkzeugstandard < Benutzervorgabe < Dokumentvorgabe < explizite Eingabe.
// Heute gibt es nur die Benutzerebene; Dokument- und Maschinenwerte bleiben bewusst getrennt
// (Dokument → .wcad, Maschinenprofile → eigenes Format, Geheimnisse → einstellungen.json im Hauptprozess).

export const SETTINGS_FORMAT = "werkcad-einstellungen";
export const SETTINGS_VERSION = 1;

/**
 * Kategorien nach Masterplan 13. status: aktiv = alle gezeigten Optionen wirken;
 * teilweise = einige Optionen wirken, Rest geplant; geplant = nur Beschreibung, keine Optionen.
 */
export const CATEGORIES = [
  { id: "allgemein", label: "Allgemein", status: "teilweise", planned: ["Sprache und Zahlenformat (nur Deutsch)", "Standardordner", "Standard-Einheit (intern immer mm/Grad)"] },
  { id: "ansicht", label: "3D-Ansicht", status: "teilweise", planned: ["gefüllte Schnittflächen", "Beleuchtung", "gespeicherte Ansichten"], note: "Schnittebene: Menüband Ansicht → Schnitt (gilt nur für die Sitzung)." },
  { id: "skizze", label: "Skizzen", status: "teilweise", planned: ["Farben für Bestimmtheitszustand", "automatische Bemaßung", "Standardebene"] },
  { id: "werkzeuge", label: "Werkzeuge und Tastatur", status: "teilweise", planned: ["Werkzeugleisten anpassen", "Standardwerte je Werkzeug", "letzte Werkzeugparameter wiederverwenden"], note: "Befehlssuche: Strg+K. Fest belegt bleiben Esc (abbrechen), Entf (löschen) sowie Ziffern, Komma und Tab für die Maßeingabe." },
  { id: "darstellung", label: "Darstellung", status: "teilweise", planned: ["Farbschema hell/dunkel", "Tooltip-Verzögerung"] },
  { id: "dokument", label: "Dokument und Modell", status: "geplant", planned: ["Standardvorlagen", "Namensregeln", "Standardmaterial", "Modelltoleranz"], note: "Dokumentwerte werden später in der Projektdatei gespeichert, nicht hier." },
  { id: "material", label: "Materialien", status: "teilweise", planned: ["eigene Werkstoffe", "Import/Export der Bibliothek"], note: "Die eingebaute Werkstoffliste (Dichte für Masse und Zuschnittliste) ist fest; siehe unten." },
  { id: "kernel", label: "CAD-Kernel und Leistung", status: "geplant", planned: ["automatische Neuberechnung aus", "Berechnungsprotokoll/Debug-Modus"], note: "Kernel-Toleranzen werden nicht freigegeben, solange sie nicht abgesichert sind." },
  { id: "dateien", label: "Dateien und Datensicherheit", status: "teilweise", planned: ["Anzahl Sicherungen", "Projekt paketieren", "schreibgeschützter Modus"], note: "Speichern ist immer atomar mit einer Sicherung (.bak) der vorherigen Fassung." },
  { id: "blech", label: "Blechparameter", status: "geplant", planned: ["Biegetabellen", "K-Faktor je Material"], note: "Keine allgemeine Blechfunktion (ADR-0002); Biegewerte des Knickrahmens stehen im Feature." },
  { id: "fertigung", label: "Rohrlaser und Fertigung", status: "teilweise", planned: ["mehrere Maschinenprofile (getrennt von den CAD-Einstellungen gespeichert)", "Prüfung Bohrung zu klein, Steg zu schmal, Kontur zu nah am Ende"], note: "Fertigungsprüfung der Zuschnittliste (Bauteil und Zuschnittliste). Startwerte aus den Beispielmaschinen der Rohrlaser-Kalkulation – bitte an die eigene Maschine anpassen. 0 = Regel aus." },
  { id: "updates", label: "Updates", status: "aktiv" },
  { id: "datenschutz", label: "Datenschutz und Diagnose", status: "teilweise", note: "PBCAD sendet keine Diagnosedaten. Das Fehlerprotokoll bleibt lokal und enthält keine Projektdaten." },
];

export const DISPLAY = [
  { value: "kanten", label: "Schattiert mit Kanten" },
  { value: "schattiert", label: "Schattiert" },
  { value: "draht", label: "Drahtmodell" },
  { value: "transparent", label: "Transparent" },
];
const QUAL = [{ value: "grob", label: "Schnell" }, { value: "normal", label: "Normal" }, { value: "fein", label: "Fein" }];

/** Alle einstellbaren Werte. Jede Option hier wirkt tatsächlich (sonst steht sie unter planned). */
export const SETTINGS = [
  { key: "allgemein.autosaveSekunden", cat: "allgemein", label: "Automatische Sicherung nach", unit: "s", type: "number", default: 1.5, min: 0.5, max: 120, help: "Wartezeit nach der letzten Änderung, bevor die Wiederherstellungsdatei geschrieben wird. Abschalten ist nicht vorgesehen." },
  { key: "allgemein.loeschenBestaetigen", cat: "allgemein", label: "Löschen von Dokumenten bestätigen", type: "bool", default: true },
  { key: "allgemein.dezimalstellen", cat: "allgemein", label: "Dezimalstellen für Messwerte", type: "int", default: 3, min: 0, max: 6, help: "Anzeige beim Messen (Abstand, Winkel). Gerechnet wird immer mit voller Genauigkeit." },

  { key: "ansicht.qualitaet", cat: "ansicht", label: "Darstellungsqualität beim Start", type: "enum", default: "normal", options: QUAL, help: "Feinheit der Dreiecksvernetzung. Wirkt nur auf die Anzeige, nicht auf Export oder Masse." },
  { key: "ansicht.projektion", cat: "ansicht", label: "Projektion", type: "enum", default: "orthogonal", options: [{ value: "orthogonal", label: "Orthogonal" }, { value: "perspektive", label: "Perspektive" }], help: "Skizzieren ist immer orthogonal." },
  { key: "ansicht.darstellung", cat: "ansicht", label: "Darstellungsmodus", type: "enum", default: "kanten", options: DISPLAY },
  { key: "ansicht.maus", cat: "ansicht", label: "Maustasten", type: "enum", default: "rechts-drehen", options: [
    { value: "rechts-drehen", label: "Rechte Taste drehen, mittlere schwenken" },
    { value: "mitte-drehen", label: "Mittlere Taste drehen, rechte schwenken" },
  ] },
  { key: "ansicht.zoomZumCursor", cat: "ansicht", label: "Zum Mauszeiger zoomen", type: "bool", default: true },
  { key: "ansicht.zoomGeschwindigkeit", cat: "ansicht", label: "Zoomgeschwindigkeit", type: "number", default: 1.2, min: 0.2, max: 5 },
  { key: "ansicht.drehGeschwindigkeit", cat: "ansicht", label: "Drehgeschwindigkeit", type: "number", default: 0.9, min: 0.1, max: 5 },
  { key: "ansicht.raster", cat: "ansicht", label: "Bodenraster anzeigen", type: "bool", default: true },
  { key: "ansicht.viewcube", cat: "ansicht", label: "ViewCube anzeigen", type: "bool", default: true },
  { key: "ansicht.kantenfarbe", cat: "ansicht", label: "Kantenfarbe", type: "color", default: "#1c2733" },
  { key: "ansicht.auswahlfarbe", cat: "ansicht", label: "Auswahlfarbe", type: "color", default: "#d9600c" },
  { key: "ansicht.hoverfarbe", cat: "ansicht", label: "Hervorhebung unter dem Mauszeiger", type: "color", default: "#ef7d1a" },

  { key: "skizze.rasterfang", cat: "skizze", label: "Rasterfang beim Öffnen einer Skizze", type: "bool", default: false },
  { key: "skizze.rasterweite", cat: "skizze", label: "Rasterweite", unit: "mm", type: "number", default: 0, min: 0, max: 1000, help: "0 = automatisch passend zum Zoom." },
  { key: "skizze.fangradius", cat: "skizze", label: "Fangradius", unit: "px", type: "int", default: 7, min: 3, max: 30, help: "Abstand, ab dem Punkte und Mittelpunkte gefangen werden." },
  { key: "skizze.symbole", cat: "skizze", label: "Symbole der Abhängigkeiten anzeigen", type: "bool", default: true },

  { key: "werkzeuge.kuerzel", cat: "werkzeuge", label: "Tastaturkürzel", type: "keymap", default: {}, custom: true, help: "Abweichungen von der Standardbelegung; Konflikte werden abgelehnt." },

  { key: "fertigung.stange", cat: "fertigung", label: "Max. Stangenlänge", unit: "mm", type: "number", default: 6500, min: 0, max: 20000, help: "Nutzbar ist die Stange minus Endbeschnitt und Greiferrest. 0 = nicht prüfen." },
  { key: "fertigung.endbeschnitt", cat: "fertigung", label: "Endbeschnitt", unit: "mm", type: "number", default: 10, min: 0, max: 2000, help: "Anschnitt am Stangenanfang." },
  { key: "fertigung.greiferrest", cat: "fertigung", label: "Greiferrest", unit: "mm", type: "number", default: 142, min: 0, max: 2000, help: "Nicht nutzbares Ende im Greifer." },
  { key: "fertigung.kuerzestesTeil", cat: "fertigung", label: "Kürzestes Teil", unit: "mm", type: "number", default: 0, min: 0, max: 20000, help: "Kürzere Teile kann die Maschine nicht entladen. 0 = keine Grenze." },
  { key: "fertigung.huellkreis", cat: "fertigung", label: "Max. Hüllkreis-Ø", unit: "mm", type: "number", default: 255, min: 0, max: 2000, help: "Größter Querschnitt, den das Spannfutter fasst. 0 = nicht prüfen." },
  { key: "fertigung.metergewicht", cat: "fertigung", label: "Max. Metergewicht", unit: "kg/m", type: "number", default: 36, min: 0, max: 1000, help: "0 = nicht prüfen." },
  { key: "fertigung.knickSchenkel", cat: "fertigung", label: "Knickrahmen: Schenkel mindestens", unit: "× Rohrmaß", type: "number", default: 2, min: 0, max: 20, help: "Schenkel kürzer als Faktor × Rohrmaß in der Rahmenebene gibt eine Warnung. 0 = nicht prüfen." },
  { key: "fertigung.knickWand", cat: "fertigung", label: "Knickrahmen: Wand höchstens", unit: "mm", type: "number", default: 4, min: 0, max: 30, help: "Dickere Wände lassen sich schwer von Hand knicken (Hinweis). 0 = nicht prüfen." },

  { key: "darstellung.animation", cat: "darstellung", label: "Ansichtswechsel animieren", type: "bool", default: true, help: "Aus = reduzierte Bewegung." },
  { key: "darstellung.skalierung", cat: "darstellung", label: "Oberflächengröße", unit: "%", type: "enum", default: 100, options: [80, 90, 100, 110, 125, 150].map((v) => ({ value: v, label: v + " %" })), help: "Nur in der Desktop-Version; im Browser die Zoomfunktion des Browsers verwenden." },
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
export const settingDef = (key) => BY_KEY.get(key);

export function defaultSettings() {
  return Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));
}

/** Einen Wert prüfen. Ungültig → {ok:false, error}; nie stillschweigend ersetzen. */
export function validateValue(def, v) {
  if (!def) return { ok: false, error: "Unbekannte Einstellung" };
  switch (def.type) {
    case "bool":
      return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: "Ja/Nein erwartet" };
    case "int":
    case "number": {
      const n = typeof v === "string" ? Number(v.trim().replace(",", ".")) : v;
      if (typeof n !== "number" || !Number.isFinite(n) || (typeof v === "string" && v.trim() === "")) return { ok: false, error: "Zahl erwartet" };
      if (def.type === "int" && !Number.isInteger(n)) return { ok: false, error: "Ganze Zahl erwartet" };
      if (def.min !== undefined && n < def.min) return { ok: false, error: `Mindestens ${def.min}${def.unit ? " " + def.unit : ""}` };
      if (def.max !== undefined && n > def.max) return { ok: false, error: `Höchstens ${def.max}${def.unit ? " " + def.unit : ""}` };
      return { ok: true, value: n };
    }
    case "enum": {
      const opt = def.options.find((o) => o.value === v || String(o.value) === String(v));
      return opt ? { ok: true, value: opt.value } : { ok: false, error: "Wert nicht erlaubt" };
    }
    case "keymap":
      return validateKeymap(v);
    case "color":
      return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, error: "Farbe als #rrggbb erwartet" };
    default:
      return { ok: false, error: "Unbekannter Typ" };
  }
}

/** Migrationen: Index = Ausgangsversion. Jede Funktion bekommt die Werte und gibt neue zurück. */
const MIGRATIONS = {
  // 0: Werte ohne Hülle (frühe Entwicklerstände) – nur einpacken
  0: (values) => values,
};

/**
 * Gespeicherten Text oder Objekt einlesen. Liefert immer ein vollständiges, gültiges Ergebnis:
 * { values, warnings[], migratedFrom, corrupt }. Ungültige oder unbekannte Einträge werden
 * verworfen und als Warnung gemeldet – nicht stillschweigend.
 */
export function loadSettings(input) {
  const warnings = [];
  const values = defaultSettings();
  if (input === null || input === undefined || input === "") return { values, warnings, migratedFrom: null, corrupt: false };
  let raw = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch {
      return { values, warnings: ["Einstellungsdatei ist beschädigt – Standardwerte werden verwendet, die alte Datei wird als Sicherung aufbewahrt."], migratedFrom: null, corrupt: true };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { values, warnings: ["Einstellungsdatei hat ein unbekanntes Format – Standardwerte werden verwendet."], migratedFrom: null, corrupt: true };
  }
  let version, stored;
  if (raw.format === SETTINGS_FORMAT) {
    version = Number(raw.version);
    stored = raw.values && typeof raw.values === "object" ? raw.values : {};
  } else if (raw.format === undefined && raw.values === undefined) {
    version = 0;
    stored = raw;
  } else {
    return { values, warnings: ["Keine PBCAD-Einstellungsdatei – Standardwerte werden verwendet."], migratedFrom: null, corrupt: true };
  }
  if (!Number.isInteger(version) || version < 0) {
    return { values, warnings: ["Unbekannte Version der Einstellungsdatei – Standardwerte werden verwendet."], migratedFrom: null, corrupt: true };
  }
  if (version > SETTINGS_VERSION) {
    warnings.push(`Einstellungen stammen aus einer neueren PBCAD-Version (${version}); bekannte Werte werden übernommen.`);
  }
  let migratedFrom = null;
  for (let v = version; v < SETTINGS_VERSION; v++) {
    if (!MIGRATIONS[v]) break;
    stored = MIGRATIONS[v]({ ...stored });
    migratedFrom = version;
  }
  for (const [k, v] of Object.entries(stored)) {
    const def = BY_KEY.get(k);
    if (!def) { if (version <= SETTINGS_VERSION) warnings.push(`Unbekannte Einstellung »${k}« ignoriert`); continue; }
    const r = validateValue(def, v);
    if (r.ok) values[k] = r.value;
    else warnings.push(`»${def.label}«: ${r.error} – Standardwert ${fmtDefault(def)} verwendet`);
  }
  return { values, warnings, migratedFrom, corrupt: false };
}

/** Zum Speichern/Exportieren: nur Abweichungen vom Standard, mit Format und Version */
export function serializeSettings(values) {
  const out = {};
  for (const s of SETTINGS) {
    const v = values[s.key];
    if (v === undefined) continue;
    if (typeof v === "object" ? JSON.stringify(v) !== JSON.stringify(s.default) : v !== s.default) out[s.key] = v;
  }
  return JSON.stringify({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION, values: out }, null, 2);
}

/** Effektiver Wert nach Masterplan 14; undefined-Ebenen werden übersprungen */
export function effectiveValue(key, { user, doc, explicit } = {}) {
  const def = BY_KEY.get(key);
  for (const layer of [explicit, doc, user]) {
    if (layer && layer[key] !== undefined && validateValue(def, layer[key]).ok) return validateValue(def, layer[key]).value;
  }
  return def?.default;
}

/** Suche über Bezeichnung, Hilfe, Kategorie und geplante Punkte */
export function searchSettings(query) {
  const q = norm(query);
  if (!q) return { settings: SETTINGS, categories: CATEGORIES };
  const words = q.split(/\s+/);
  const hit = (text) => { const t = norm(text); return words.every((w) => t.includes(w)); };
  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "";
  const settings = SETTINGS.filter((s) => hit([s.label, s.help, s.unit, s.key, catLabel(s.cat), ...(s.options || []).map((o) => o.label)].filter(Boolean).join(" ")));
  const categories = CATEGORIES.filter((c) => settings.some((s) => s.cat === c.id) || hit([c.label, c.note, ...(c.planned || [])].filter(Boolean).join(" ")));
  return { settings, categories };
}

function fmtDefault(def) {
  if (def.type === "bool") return def.default ? "»ja«" : "»nein«";
  if (def.type === "enum") return "»" + (def.options.find((o) => o.value === def.default)?.label ?? def.default) + "«";
  return String(def.default) + (def.unit ? " " + def.unit : "");
}
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").trim();
