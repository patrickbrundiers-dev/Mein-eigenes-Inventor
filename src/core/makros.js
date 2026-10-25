// Werkzeuge Stufe 43: Makros – benannte Befehlsfolgen (aufgezeichnet oder zusammengestellt), ausführbar über
// die Befehlssuche, den Schnellzugriff oder ein Tastaturkürzel. Gespeichert in den Benutzereinstellungen.

import { commandDef } from "./commands.js";

export const MAX_MACROS = 30, MAX_STEPS = 50;

/** Makroliste prüfen: [{id, name, steps: [Befehls-ID]}] */
export function validateMacros(v) {
  if (!Array.isArray(v)) return { ok: false, error: "Liste von Makros erwartet" };
  if (v.length > MAX_MACROS) return { ok: false, error: `Höchstens ${MAX_MACROS} Makros` };
  const out = [], names = new Set();
  for (const m of v) {
    if (!m || typeof m !== "object") return { ok: false, error: "Makro erwartet" };
    const name = String(m.name ?? "").trim();
    if (!name || name.length > 60) return { ok: false, error: "Makro braucht einen Namen (höchstens 60 Zeichen)" };
    if (names.has(name)) return { ok: false, error: `Makro »${name}« doppelt` };
    names.add(name);
    if (!/^[a-z0-9]{1,16}$/.test(String(m.id ?? ""))) return { ok: false, error: `Makro »${name}«: ungültige Kennung` };
    if (!Array.isArray(m.steps) || !m.steps.length) return { ok: false, error: `Makro »${name}« hat keine Schritte` };
    if (m.steps.length > MAX_STEPS) return { ok: false, error: `Makro »${name}«: höchstens ${MAX_STEPS} Schritte` };
    const bad = m.steps.filter((s) => typeof s !== "string" || !commandDef(s) || s.startsWith("macro."));
    if (bad.length) return { ok: false, error: `Makro »${name}«: unbekannter Befehl ${bad.join(", ")}` };
    out.push({ id: m.id, name, steps: [...m.steps] });
  }
  return { ok: true, value: out };
}

/** Aufzeichnung: Befehle, die nichts am Modell tun (Suche, Einstellungen, Rückgängig), bleiben draußen */
export const NOT_RECORDED = new Set(["app.search", "app.settings", "app.macroRecord", "app.macros", "edit.undo", "edit.redo"]);
export function recordable(id) {
  return !!commandDef(id) && !NOT_RECORDED.has(id) && !id.startsWith("macro.");
}

/** Befehlsdefinitionen der Makros für die Befehlssuche */
export function macroCommands(macros = []) {
  return macros.map((m) => ({ id: "macro." + m.id, label: `Makro: ${m.name}`, group: "Makros", scope: "global", keywords: "makro " + m.name.toLowerCase(), steps: m.steps }));
}
