// Hüllkörper (SolidCraft-Abgleich F7): Quader um die gewählten Körper mit Zugabe je Seite.
// Für Bauraum, Rohmaß und Transportmaß. Reine Rechnung ohne Kernel.

/** bounds = [[[x0,y0,z0],[x1,y1,z1]], …]; zugabe = Zahl oder [x,y,z] je Seite → { lo, hi, size } */
export function huellQuader(bounds, zugabe = 0) {
  const list = (bounds || []).filter((b) => b && b[0] && b[1]);
  if (!list.length) throw new Error("Keine Körper für den Hüllkörper");
  const z = Array.isArray(zugabe) ? zugabe.map(Number) : [0, 0, 0].map(() => Number(zugabe));
  if (z.some((v) => !Number.isFinite(v))) throw new Error("Zugabe ist keine Zahl");
  const lo = [0, 1, 2].map((i) => Math.min(...list.map((b) => b[0][i])) - z[i]);
  const hi = [0, 1, 2].map((i) => Math.max(...list.map((b) => b[1][i])) + z[i]);
  const size = [0, 1, 2].map((i) => hi[i] - lo[i]);
  if (size.some((s) => !(s > 1e-9))) throw new Error("Hüllkörper ist flach – Zugabe vergrößern");
  return { lo, hi, size };
}

/** Text »L × B × H mm«, gerundet auf 0,1 mm, größtes Maß zuerst (wie Rohmaß in der Stückliste) */
export function huellText(size) {
  const f = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  return [...size].sort((a, b) => b - a).map(f).join(" × ") + " mm";
}
