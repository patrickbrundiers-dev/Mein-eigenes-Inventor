// Zuletzt benutzte Befehle (Befehlssuche, »Wiederholen« im Rechtsklick-Menü) und der Rückgängig-Verlauf als Liste.
// Reine Rechnung; gespeichert wird in der Oberfläche (localStorage).

/** id vorn einreihen, Doppelte entfernen, auf max kürzen */
export function pushRecent(list, id, max = 8) {
  if (!id) return list || [];
  return [id, ...(list || []).filter((x) => x !== id)].slice(0, max);
}

/** Leere Suche: zuletzt benutzte Befehle zuerst (in ihrer Reihenfolge), danach der Rest unverändert */
export function orderWithRecent(cmds, recent) {
  const by = new Map(cmds.map((c) => [c.id, c]));
  const first = (recent || []).map((id) => by.get(id)).filter(Boolean);
  const seen = new Set(first);
  return { recent: first, rest: cmds.filter((c) => !seen.has(c)) };
}

/** Rückgängig-Verlauf: neueste Schritte zuerst, je Eintrag wie viele Schritte zurück */
export function undoHistory(stack, max = 15) {
  const out = [];
  for (let i = stack.length - 1, n = 1; i >= 0 && out.length < max; i--, n++) out.push({ label: stack[i].label || "Änderung", steps: n });
  return out;
}
