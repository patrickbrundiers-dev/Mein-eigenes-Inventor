// Kollisionsliste (SolidCraft-Abgleich, Option »n nächste«): Treffer der Kollisionsprüfung je Komponente begrenzen.

/** Schwere eines Treffers: Überschneidung zuerst (größte vorne), dann Abstand (kleinster vorne) */
const severity = (r) => (r.volume > 0 ? [0, -r.volume] : r.unsure ? [1, 0] : [2, r.gap ?? Infinity]);

/**
 * res = [{ a, b, volume, gap?, unsure? }] → je Komponente höchstens n Treffer; ein Paar bleibt, wenn es für eine der
 * beiden Komponenten zu den n nächsten gehört. Reihenfolge: schwerste zuerst.
 */
export function nearestCollisions(res, n) {
  if (!(n > 0)) return res;
  const sorted = [...res].sort((x, y) => { const p = severity(x), q = severity(y); return p[0] - q[0] || p[1] - q[1]; });
  const count = new Map(), keep = new Set();
  for (const r of sorted) for (const k of [r.a, r.b]) { const c = count.get(k) || 0; if (c < n) { count.set(k, c + 1); keep.add(r); } }
  return sorted.filter((r) => keep.has(r));
}
