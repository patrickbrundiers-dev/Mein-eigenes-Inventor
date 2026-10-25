// Bauteil im Kontext der Baugruppe bearbeiten (Fusion-Abgleich FU21): das Bauteil wird in seinem eigenen
// Koordinatensystem bearbeitet, die übrigen Teile der Baugruppe stehen halbdurchsichtig daneben – an der Stelle,
// an der sie relativ zum Bauteil eingebaut sind. Ihre Kanten lassen sich in Skizzen projizieren.
// Reine Rechnung; Anzeige in src/ui (viewer.setGhosts, app.editInContext).

import { flattenAssembly } from "./subasm.js";
import { matInvertRigid, matMul } from "./geom.js";

/** Komponenten der obersten Ebene, die sich im Kontext bearbeiten lassen (Bauteile, nicht ausgeblendet) */
export function contextComponents(asm, docOf) {
  return (asm?.components || []).filter((c) => !c.hidden && docOf(c.part)?.kind === "part");
}

/**
 * Kontext für Komponente compId der Baugruppe asm:
 * { part, matrix, others: [{ id, partId, matrix }] } – matrix der Nachbarn relativ zum bearbeiteten Bauteil
 * (Spalten-Matrix wie placementMatrix). null, wenn compId kein Bauteil auf oberster Ebene ist.
 * Unterbaugruppen erscheinen mit jedem ihrer Bauteile; id ist dann compId/Index.
 */
export function contextScene(asm, compId, docOf) {
  const comp = (asm?.components || []).find((c) => c.id === compId);
  const part = comp && docOf(comp.part);
  if (!part || part.kind !== "part") return null;
  const all = flattenAssembly(asm, docOf);
  const self = all.find((o) => o.top.id === compId);
  if (!self) return null;
  const inv = matInvertRigid(self.matrix);
  const count = new Map();
  const others = [];
  for (const o of all) {
    if (o === self) continue;
    const n = count.get(o.top.id) || 0;
    count.set(o.top.id, n + 1);
    others.push({ id: o.inner ? `${o.top.id}/${n}` : o.top.id, partId: o.part.id, matrix: matMul(inv, o.matrix), name: o.path.join(" / ") });
  }
  return { part, matrix: self.matrix, others };
}

/** Kurzer Text für die Anzeige: »Rahmen in Tor« */
export function contextLabel(asm, compId, docOf) {
  const comp = (asm?.components || []).find((c) => c.id === compId);
  const part = comp && docOf(comp.part);
  return part ? `${comp.name || part.name} in ${asm.name}` : "";
}
