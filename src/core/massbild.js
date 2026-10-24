// Maßbilder je Konturart wie im Rohr-Editor (massbild.py der Rohrlaser-Kalkulation): kleine Zeichnung, welcher
// Buchstabe welches Maß ist. Wandstreifen des Rohrs, Längsrichtung waagerecht (Ende A links). Liefert SVG-Text ohne
// DOM, damit testbar; Farben kommen aus dem Stylesheet (.massbild).
import { TUBE_CUT_KINDS } from "./tubecuts.js";

const W = 150, H = 86, cy = 46;

const label = (x, y, t, anchor = "middle") => `<text x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
const arrowH = (x1, x2, y) => `<path class="mb-dim" d="M${x1} ${y}H${x2}M${x1 + 4} ${y - 2.5}L${x1} ${y}L${x1 + 4} ${y + 2.5}M${x2 - 4} ${y - 2.5}L${x2} ${y}L${x2 - 4} ${y + 2.5}"/>`;
const arrowV = (y1, y2, x) => `<path class="mb-dim" d="M${x} ${y1}V${y2}M${x - 2.5} ${y1 + 4}L${x} ${y1}L${x + 2.5} ${y1 + 4}M${x - 2.5} ${y2 - 4}L${x} ${y2}L${x + 2.5} ${y2 - 4}"/>`;
const ext = (d) => `<path class="mb-ext" d="${d}"/>`;
const dimTop = (x1, x2, y0, y, t) => ext(`M${x1} ${y0}V${y - 3}M${x2} ${y0}V${y - 3}`) + arrowH(x1, x2, y) + label((x1 + x2) / 2, y - 3, t);
const dimRight = (y1, y2, x0, x, t) => ext(`M${x0} ${y1}H${x + 3}M${x0} ${y2}H${x + 3}`) + arrowV(y1, y2, x) + label(x + 5, (y1 + y2) / 2 + 4, t, "start");
const leader = (x, y, x2, y2, t) => `<path class="mb-ext" d="M${x} ${y}L${x2} ${y2}"/><circle class="mb-dot" cx="${x}" cy="${y}" r="1.6"/>` + label(x2 + 3, y2 + 4, t, "start");
const wall = (x0 = 4) => `<rect class="mb-wall" x="${x0}" y="16" width="${W - 4 - x0}" height="${H - 24}"/>`;

const DRAW = {
  bohrung: () => wall() + `<circle class="mb-contour" cx="62" cy="${cy}" r="16"/>` + dimTop(46, 78, cy, 12, "d"),
  langloch: () => wall() + `<rect class="mb-contour" x="34" y="${cy - 11}" width="56" height="22" rx="11"/>` +
    dimTop(34, 90, cy - 11, 12, "l") + dimRight(cy - 11, cy + 11, 90, 104, "b"),
  rechteck: () => wall() + `<rect class="mb-contour" x="34" y="${cy - 13}" width="56" height="26" rx="5"/>` +
    dimTop(34, 90, cy - 13, 12, "l") + dimRight(cy - 13, cy + 13, 90, 104, "b") + leader(88, cy + 11, 100, cy + 30, "r"),
  // offen zum Ende A (links): der Wandstreifen beginnt an der Kante
  ausklinkung: () => `<rect class="mb-wall" x="20" y="16" width="${W - 24}" height="${H - 24}"/><path class="mb-cut-open" d="M20 ${cy - 13}H70a5 5 0 0 1 5 5V${cy + 8}a5 5 0 0 1 -5 5H20Z"/>` +
    `<path class="mb-contour" d="M20 ${cy - 13}H70a5 5 0 0 1 5 5V${cy + 8}a5 5 0 0 1 -5 5H20"/>` +
    dimTop(20, 75, cy - 13, 12, "l") + dimRight(cy - 13, cy + 13, 75, 90, "b") + leader(73.5, cy + 11.5, 86, cy + 30, "r") +
    `<text class="mb-note" x="10" y="${cy + 4}" text-anchor="middle">A</text>`,
};

/** SVG-Text des Maßbilds einer Konturart (leer, wenn unbekannt) */
export function contourSketch(kind) {
  const draw = DRAW[kind];
  if (!draw) return "";
  const title = `Maße ${TUBE_CUT_KINDS[kind].label}: ` + TUBE_CUT_KINDS[kind].fields.join(", ");
  return `<svg class="massbild" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}"><title>${title}</title>${draw()}</svg>`;
}

/** Maßbuchstaben im Bild (für den Test: genau die Felder der Konturart) */
export function sketchLetters(svg) {
  return [...svg.matchAll(/<text(?![^>]*mb-note)[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]).sort();
}
