// Wo verwendet (Arbeitsabläufe AW1, wie Inventor »Wo verwendet« / SolidWorks »Verwendungsnachweis«):
// In welchen Baugruppen steckt ein Bauteil oder eine Baugruppe, welche Zeichnungen zeigen es, welche Bauteile leiten davon ab.
// Reine Rechnung über die Dokumentliste des Projekts, ohne Oberfläche.

/**
 * Verwendung eines Dokuments. Rückgabe
 * { assemblies: [{ doc, count }] (direkt eingebaut, count = Anzahl Komponenten),
 *   drawings: [doc] (Zeichnungen mit diesem Dokument als Quelle),
 *   derived: [doc] (Bauteile mit einem abgeleiteten Feature aus diesem Dokument),
 *   top: [doc] (oberste Baugruppen, in denen es irgendwo steckt) }
 */
export function whereUsed(project, id) {
  const docs = project?.docs || [];
  const assemblies = [];
  for (const d of docs) {
    if (d.kind !== "assembly" || d.id === id) continue;
    const count = (d.components || []).filter((c) => c.part === id).length;
    if (count) assemblies.push({ doc: d, count });
  }
  const drawings = docs.filter((d) => d.kind === "drawing" && d.source?.id === id);
  const derived = docs.filter((d) => d.kind === "part" && d.id !== id && (d.features || []).some((f) => f.type === "abgeleitet" && f.source === id));
  // nach oben weiterlaufen bis zu Baugruppen, die selbst nirgends eingebaut sind
  const parents = (x) => docs.filter((d) => d.kind === "assembly" && d.id !== x && (d.components || []).some((c) => c.part === x)).map((d) => d.id);
  const top = new Set(), seen = new Set([id]);
  const up = (x, depth) => {
    for (const p of parents(x)) {
      if (seen.has(p) || depth > 10) continue;
      seen.add(p);
      const pp = parents(p);
      if (!pp.length) top.add(p);
      else up(p, depth + 1);
    }
  };
  up(id, 0);
  const byId = new Map(docs.map((d) => [d.id, d]));
  return { assemblies, drawings, derived, top: [...top].map((x) => byId.get(x)).filter(Boolean) };
}

/** Kurztext für den Modellbrowser oder einen Hinweis: »2 Baugruppen · 1 Zeichnung« oder »nirgends verwendet« */
export function whereUsedText(w) {
  const parts = [];
  if (w.assemblies.length) parts.push(`${w.assemblies.length} Baugruppe${w.assemblies.length === 1 ? "" : "n"}`);
  if (w.drawings.length) parts.push(`${w.drawings.length} Zeichnung${w.drawings.length === 1 ? "" : "en"}`);
  if (w.derived.length) parts.push(`${w.derived.length} abgeleitete${w.derived.length === 1 ? "s Bauteil" : " Bauteile"}`);
  return parts.length ? parts.join(" · ") : "nirgends verwendet";
}
