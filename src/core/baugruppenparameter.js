// Parameter der Baugruppe an Bauteile weitergeben (Fusion-Abgleich FU4, Top-down): ein Bauteil-Parameter kann
// mit einem Parameter einer Baugruppe verknüpft sein, param.link = { asm: Baugruppen-ID, name }. Beim Rechnen
// steht dann der Wert der Baugruppe im Ausdruck; ändert sich das Maß in der Baugruppe, ändern sich alle Teile.

import { resolveParams } from "./expr.js";

/** Werte der Baugruppen-Parameter ({ values, errors }) */
export function asmParamValues(asm) {
  return resolveParams(asm?.params || []);
}

/** Hat das Bauteil verknüpfte Parameter? */
export const hasLinks = (part) => (part?.params || []).some((p) => p.link);

/** Baugruppen, aus denen das Bauteil Werte holt */
export function linkSources(part) {
  return [...new Set((part?.params || []).filter((p) => p.link?.asm).map((p) => p.link.asm))];
}

/**
 * Bauteil zum Rechnen: verknüpfte Parameter bekommen den Wert der Baugruppe als Ausdruck. Fehlt die Baugruppe
 * oder der Parameter, bleibt der eigene Ausdruck (Rückfallwert) und es gibt einen Eintrag in errors.
 * Gibt { part, errors } zurück; ohne Verknüpfung dasselbe Objekt.
 */
export function linkedPart(part, docOf) {
  if (!hasLinks(part)) return { part, errors: [] };
  const errors = [];
  const cache = new Map();
  const params = part.params.map((p) => {
    if (!p.link) return p;
    const asm = docOf(p.link.asm);
    if (asm?.kind !== "assembly") { errors.push(`${p.name}: Baugruppe fehlt`); return p; }
    if (!cache.has(asm.id)) cache.set(asm.id, asmParamValues(asm));
    const { values, errors: e } = cache.get(asm.id);
    if (e[p.link.name]) { errors.push(`${p.name}: ${asm.name}.${p.link.name}: ${e[p.link.name]}`); return p; }
    const v = values[p.link.name];
    if (!Number.isFinite(v)) { errors.push(`${p.name}: ${asm.name} hat keinen Parameter ${p.link.name}`); return p; }
    return { ...p, expr: String(v) };
  });
  return { part: { ...part, params }, errors };
}

/** Bauteile im Projekt, die Werte aus der Baugruppe asmId holen */
export function partsLinkedTo(docs, asmId) {
  return docs.filter((d) => d.kind === "part" && (d.params || []).some((p) => p.link?.asm === asmId));
}

/**
 * Gleichnamige Parameter der Bauteile mit der Baugruppe verknüpfen (»An Bauteile weitergeben«).
 * parts = Bauteile der Baugruppe, names = Parameter der Baugruppe. Fehlt der Parameter im Bauteil und ist
 * add gesetzt, wird er angelegt. Verändert die Bauteile; Rückgabe [{ part, name, added }].
 */
export function pushParams(asm, parts, names, { add = false } = {}) {
  const { values } = asmParamValues(asm);
  const out = [];
  for (const part of parts) {
    part.params = part.params || [];
    for (const name of names) {
      if (!Number.isFinite(values[name])) continue;
      let p = part.params.find((x) => x.name === name);
      if (!p && !add) continue;
      const added = !p;
      if (!p) { p = { name, expr: String(values[name]), comment: "" }; part.params.push(p); }
      if (p.link?.asm === asm.id && p.link.name === name && !added) continue;
      p.link = { asm: asm.id, name };
      p.expr = String(values[name]); // Rückfallwert, falls die Baugruppe einmal fehlt
      out.push({ part, name, added });
    }
  }
  return out;
}

/** Verknüpfung lösen: der zuletzt gültige Wert bleibt als eigener Ausdruck */
export function unlinkParam(p, docOf) {
  if (!p?.link) return p;
  const asm = docOf(p.link.asm);
  const v = asm ? asmParamValues(asm).values[p.link.name] : undefined;
  if (Number.isFinite(v)) p.expr = String(v);
  delete p.link;
  return p;
}
