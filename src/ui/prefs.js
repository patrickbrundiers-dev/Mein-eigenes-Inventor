// Benutzereinstellungen laden, speichern und Änderungen melden.
// Desktop: Datei im Benutzerordner (atomar mit .bak); Browser: localStorage.
import { loadSettings, serializeSettings, validateValue, settingDef, defaultSettings, SETTINGS } from "../core/settings.js";

const KEY = "werkcad.einstellungen";

export class Prefs {
  constructor(bridge = window.werkcad) {
    this.bridge = bridge;
    this.listeners = [];
    let text = null;
    try { text = bridge?.readPrefs ? bridge.readPrefs() : localStorage.getItem(KEY); } catch { /* gesperrt */ }
    const r = loadSettings(text);
    if (r.corrupt && !bridge?.readPrefs) { try { localStorage.setItem(KEY + ".defekt", String(text)); } catch { /* */ } }
    this.values = r.values;
    this.warnings = r.warnings;
    if (r.warnings.length) bridge?.log?.("warn", "einstellungen", r.warnings.join(" | "));
  }
  get(key) { return this.values[key]; }
  /** Wert prüfen und speichern. Rückgabe {ok, error}; ungültige Werte werden nicht übernommen. */
  set(key, value) {
    const r = validateValue(settingDef(key), value);
    if (!r.ok) return r;
    if (this.values[key] === r.value) return r;
    this.values = { ...this.values, [key]: r.value };
    this.save();
    this.emit([key]);
    return r;
  }
  reset(keys = SETTINGS.map((s) => s.key)) {
    const d = defaultSettings();
    const changed = keys.filter((k) => this.values[k] !== d[k]);
    if (!changed.length) return;
    this.values = { ...this.values, ...Object.fromEntries(changed.map((k) => [k, d[k]])) };
    this.save();
    this.emit(changed);
  }
  /** Import aus Text: ersetzt alle Werte; Warnungen zurück */
  importText(text) {
    const r = loadSettings(text);
    if (r.corrupt) return r;
    const changed = SETTINGS.map((s) => s.key).filter((k) => this.values[k] !== r.values[k]);
    this.values = r.values;
    this.save();
    this.emit(changed);
    return r;
  }
  exportText() { return serializeSettings(this.values); }
  save() {
    const text = serializeSettings(this.values);
    try {
      if (this.bridge?.writePrefs) this.bridge.writePrefs(text).catch((e) => console.warn("Einstellungen nicht gespeichert", e));
      else localStorage.setItem(KEY, text);
    } catch { /* gesperrt */ }
  }
  onChange(fn) { this.listeners.push(fn); }
  emit(keys) { for (const fn of this.listeners) fn(keys); }
}
