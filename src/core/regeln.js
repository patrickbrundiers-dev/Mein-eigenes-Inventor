// Werkzeuge Stufe 43: Regeln am Bauteil (wie Inventor iLogic, ohne Programmierung).
// Regeln laufen in der Reihenfolge der Liste vor dem Aufbau:
//   setzen:       wenn Bedingung, dann Parameter = Ausdruck (ohne Bedingung immer)
//   unterdruecken: wenn Bedingung, Feature unterdrücken (sonst wie im Baum)
//   pruefen:      wenn Bedingung, Meldung als Hinweis oder Fehler (z. B. »Länge über Stangenlänge«)
// Bedingungen und Werte sind Ausdrücke mit den Parametern, Vergleiche mit < > <= >= == !=, Verknüpfung über wenn().

import { evaluate, resolveParams } from "./expr.js";

export const RULE_KINDS = [["setzen", "Parameter setzen"], ["unterdruecken", "Feature unterdrücken"], ["pruefen", "Prüfen und melden"]];

export const defaultRule = (kind, id) => ({ id, kind, name: "", when: "", param: "", value: "", feature: "", message: "", level: "Hinweis" });

const truthy = (expr, values) => {
  if (!String(expr ?? "").trim()) return true;
  return !!evaluate(String(expr), values);
};

/**
 * Regeln anwenden. Rückgabe { part: Bauteil mit wirksamen Parametern und Unterdrückungen, messages: [{rule, level, text}] }.
 * Fehler in einer Regel werden Meldungen (Stufe »Fehler«), das Bauteil wird ohne diese Regel gebaut.
 */
export function applyRules(part) {
  const rules = (part.rules || []).filter((r) => !r.off);
  if (!rules.length) return { part, messages: [] };
  const messages = [];
  let params = (part.params || []).map((p) => ({ ...p }));
  const label = (r, i) => r.name || `Regel ${i + 1}`;
  rules.forEach((r, i) => {
    if (r.kind !== "setzen") return;
    const p = params.find((x) => x.name === r.param);
    if (!p) { messages.push({ rule: r.id, level: "Fehler", text: `${label(r, i)}: Parameter »${r.param || "?"}« fehlt` }); return; }
    if (!String(r.value ?? "").trim()) { messages.push({ rule: r.id, level: "Fehler", text: `${label(r, i)}: Wert fehlt` }); return; }
    const when = String(r.when ?? "").trim();
    const next = when ? `wenn(${when}; ${r.value}; ${p.expr})` : String(r.value);
    const trial = params.map((x) => (x === p ? { ...x, expr: next } : x));
    const res = resolveParams(trial);
    if (res.errors?.[p.name]) { messages.push({ rule: r.id, level: "Fehler", text: `${label(r, i)}: ${res.errors[p.name]}` }); return; }
    params = trial;
  });
  const { values } = resolveParams(params);
  let features = part.features || [];
  const off = new Set();
  rules.forEach((r, i) => {
    if (r.kind === "setzen") return;
    let hit;
    try { hit = truthy(r.when, values); } catch (e) { messages.push({ rule: r.id, level: "Fehler", text: `${label(r, i)}: Bedingung – ${e.message}` }); return; }
    if (r.kind === "unterdruecken") {
      if (!features.some((f) => f.id === r.feature)) { messages.push({ rule: r.id, level: "Fehler", text: `${label(r, i)}: Feature fehlt` }); return; }
      if (hit) off.add(r.feature);
    } else if (hit) messages.push({ rule: r.id, level: r.level === "Fehler" ? "Fehler" : "Hinweis", text: r.message || label(r, i) });
  });
  if (off.size) features = features.map((f) => (off.has(f.id) ? { ...f, suppressed: true, ruleOff: true } : f));
  return { part: { ...part, params, features }, messages, suppressed: [...off] };
}
