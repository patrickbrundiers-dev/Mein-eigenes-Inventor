// Lochblech / Perforieren (SolidCraft-Abgleich F1): Lochraster auf einer ebenen Fläche mit freiem Rand.
// Reine Rechnung in Flächenkoordinaten (2D, mm); der Kern projiziert die Fläche und schneidet die Löcher.
// Bezeichnungen nach DIN 24041: Rv = Rundloch versetzt 60°, Rg = Rundloch gerade, Qg = Quadratloch gerade, Lv = Langloch versetzt.

export const LOCH_MUSTER = Object.freeze([
  ["Rv", "Rundloch versetzt (60°)"],
  ["Rg", "Rundloch gerade"],
  ["Qg", "Quadratloch gerade"],
  ["Lv", "Langloch versetzt"],
]);
export const MAX_LOECHER = 4000;

const inPoly = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = (x, y, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
const polyDist = (x, y, poly) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, y, poly[i], poly[(i + 1) % poly.length]));
  return d;
};
const polyArea = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

/** Maße prüfen und Kennwerte: { muster, d, teilung, rand, laenge, ext (Umkreis eines Lochs), lochFlaeche } */
export function lochMasse({ muster = "Rv", d, teilung, rand = 0, laenge = 0 }) {
  if (!LOCH_MUSTER.some(([k]) => k === muster)) throw new Error("Unbekanntes Lochmuster");
  if (!(d > 0)) throw new Error("Lochgröße > 0");
  if (!(rand >= 0)) throw new Error("Rand ≥ 0");
  if (muster === "Lv" && !(laenge > d)) throw new Error("Langloch: Länge größer als Breite");
  if (!(teilung > d)) throw new Error(`Teilung größer als ${muster === "Qg" ? "Kantenlänge" : "Lochgröße"} (Steg bleibt stehen)`);
  const ext = muster === "Qg" ? (d * Math.SQRT2) / 2 : muster === "Lv" ? laenge / 2 : d / 2;
  const lochFlaeche = muster === "Qg" ? d * d : muster === "Lv" ? (laenge - d) * d + (Math.PI * d * d) / 4 : (Math.PI * d * d) / 4;
  return { muster, d, teilung, rand, laenge, ext, lochFlaeche };
}

/**
 * Lochmitten in der Fläche: outer = Außenkontur [[x,y]…], inner = Ausschnitte. Raster mittig zur Fläche,
 * nur ganze Löcher mit mindestens »rand« Abstand zu Außenkontur und Ausschnitten.
 * → { centers: [[x,y]…], frei (freier Querschnitt in %), flaeche }
 */
export function lochRaster({ outer, inner = [], ...masse }) {
  const m = lochMasse(masse);
  if (!outer || outer.length < 3) throw new Error("Fläche ohne Kontur");
  const xs = outer.map((p) => p[0]), ys = outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // Reihenabstand und Versatz je Muster
  const px = m.muster === "Lv" ? m.laenge - m.d + m.teilung : m.teilung;
  const py = m.muster === "Rv" ? (m.teilung * Math.sqrt(3)) / 2 : m.teilung;
  const shift = m.muster === "Rv" || m.muster === "Lv" ? px / 2 : 0;
  const nx = Math.ceil((x1 - x0) / px) + 2, ny = Math.ceil((y1 - y0) / py) + 2;
  if ((2 * nx + 1) * (2 * ny + 1) > 400 * MAX_LOECHER) throw new Error(`Zu viele Löcher – Teilung vergrößern (höchstens ${MAX_LOECHER})`);
  const need = m.ext + m.rand;
  const centers = [];
  for (let j = -ny; j <= ny; j++) {
    const off = Math.abs(j) % 2 === 1 ? shift : 0;
    for (let i = -nx; i <= nx; i++) {
      const x = cx + i * px + off, y = cy + j * py;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (!inPoly(x, y, outer) || polyDist(x, y, outer) < need - 1e-9) continue;
      if (inner.some((q) => inPoly(x, y, q) || polyDist(x, y, q) < need - 1e-9)) continue;
      centers.push([x, y]);
      if (centers.length > MAX_LOECHER) throw new Error(`Mehr als ${MAX_LOECHER} Löcher – Teilung oder Lochgröße vergrößern`);
    }
  }
  const flaeche = polyArea(outer) - inner.reduce((s, q) => s + polyArea(q), 0);
  return { centers, flaeche, frei: flaeche > 0 ? (100 * centers.length * m.lochFlaeche) / flaeche : 0, masse: m };
}

/** Kurzbezeichnung wie im Lochblech-Katalog: »Rv 5-8«, »Qg 10-14«, »Lv 5x20-8« */
export function lochName({ muster = "Rv", d, teilung, laenge }) {
  const f = (v) => String(Math.round(v * 100) / 100).replace(".", ",");
  return muster === "Lv" ? `Lv ${f(d)}x${f(laenge)}-${f(teilung)}` : `${muster} ${f(d)}-${f(teilung)}`;
}
