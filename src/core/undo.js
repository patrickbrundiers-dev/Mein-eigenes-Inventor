// Rückgängig-Stände (SY2): Projekt je Dokument (und je Skizzenbild) als eigener JSON-Text. Unveränderte Teile
// übernehmen den Text des vorigen Stands, liegen also nur einmal im Speicher – 100 Stände eines großen Projekts
// kosten so etwa das Projekt plus die Änderungen statt 100 ganze Kopien.

/** Stand des Projekts; prev = vorheriger Stand (für geteilte Texte) */
export function snapshot(project, prev = null) {
  const { docs = [], images = null, ...head } = project;
  const pool = new Map();
  if (prev) for (const s of [...prev.docs, ...Object.values(prev.images || {})]) pool.set(s, s);
  const share = (s) => pool.get(s) ?? s;
  return {
    order: Object.keys(project),
    head: JSON.stringify(head),
    docs: docs.map((d) => share(JSON.stringify(d))),
    images: images ? Object.fromEntries(Object.entries(images).map(([k, v]) => [k, share(JSON.stringify(v))])) : null,
  };
}

/** Projekt aus einem Stand (neue Objekte) */
export function restoreSnapshot(snap) {
  const head = JSON.parse(snap.head);
  const parts = { ...head, docs: snap.docs.map((s) => JSON.parse(s)) };
  if (snap.images) parts.images = Object.fromEntries(Object.entries(snap.images).map(([k, v]) => [k, JSON.parse(v)]));
  // Schlüssel in der ursprünglichen Reihenfolge (die Datei soll beim Speichern gleich aussehen)
  const prj = {};
  for (const k of snap.order || Object.keys(parts)) if (k in parts) prj[k] = parts[k];
  for (const k of Object.keys(parts)) if (!(k in prj)) prj[k] = parts[k];
  return prj;
}

/** Ungefährer Speicher mehrerer Stände in Zeichen; geteilte Texte zählen einmal */
export function snapshotSize(snaps) {
  const seen = new Set();
  let n = 0;
  for (const s of snaps) {
    n += s.head.length;
    for (const t of [...s.docs, ...Object.values(s.images || {})]) if (!seen.has(t)) { seen.add(t); n += t.length; }
  }
  return n;
}

/** Ältere Stände verwerfen, bis höchstens `max` Stände und `budget` Zeichen übrig sind (der jüngste bleibt immer) */
export function trimStack(stack, { max = 100, budget = 200e6 } = {}) {
  while (stack.length > max) stack.shift();
  while (stack.length > 1 && snapshotSize(stack.map((e) => e.snap)) > budget) stack.shift();
  return stack;
}
