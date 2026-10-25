// Komponentenfarben (Fusion-Abgleich FU16): jedes Bauteil der Baugruppe in einer eigenen, gut unterscheidbaren Farbe.
// Gleiche Bauteile (mehrfach eingesetzt) bekommen dieselbe Farbe – so sieht man Gleichteile auf einen Blick.

/** Farbe Nr. i: Farbton im goldenen Winkel versetzt, Helligkeit in drei Stufen, damit Nachbarn sich deutlich abheben */
export function distinctColor(i) {
  const hue = (i * 137.508) % 360;
  const light = [52, 40, 64][i % 3], sat = 62;
  return hslHex(hue, sat, light);
}

function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Zuordnung Schlüssel (Bauteil-ID) → Farbe in der Reihenfolge des ersten Auftretens */
export function colorMap(keys) {
  const m = new Map();
  for (const k of keys) if (!m.has(k)) m.set(k, distinctColor(m.size));
  return m;
}
