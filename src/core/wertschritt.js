// Werte per Mausrad oder Ziehen ändern (Q7): reine Rechnung für Maßfelder. Nur einfache Zahlen werden verändert,
// Ausdrücke wie »L/2« oder »B+20« bleiben unangetastet.

const PLAIN = /^\s*-?\d+(?:[.,]\d+)?\s*$/;

/** true, wenn das Feld eine einfache Zahl enthält (nur dann ist Rad/Ziehen aktiv) */
export function isPlainNumber(text) { return PLAIN.test(String(text ?? "")); }

/** Schrittweite: normal 1, mit Umschalt 0,1 (fein), mit Strg 10 (grob) */
export function stepSize({ fine = false, coarse = false } = {}) { return fine ? 0.1 : coarse ? 10 : 1; }

/**
 * Wert um n Schritte ändern. Ergebnis als Text im Stil der Eingabe (Komma bleibt Komma), auf die Schrittweite gerundet,
 * begrenzt durch allowNeg/allowZero. null, wenn das Feld keine einfache Zahl ist.
 */
export function stepValue(text, n, { fine = false, coarse = false, allowNeg = true, allowZero = true } = {}) {
  if (!isPlainNumber(text)) return null;
  const s = String(text).trim();
  const comma = s.includes(",");
  const v = Number(s.replace(",", "."));
  const step = stepSize({ fine, coarse });
  const dec = Math.max(decimals(s), fine ? 1 : 0);
  let next = v + n * step;
  // auf Schrittraster ziehen, damit 12,37 + 0,1 sauber 12,5 bzw. 12,4 ergibt (wie Inventor)
  next = Math.round(next / step) * step;
  if (!allowNeg && next < 0) next = 0;
  if (!allowZero && next === 0) next = n < 0 ? step : -step;
  if (!allowNeg && !allowZero && next <= 0) next = step;
  let out = next.toFixed(dec);
  if (/^-0(?:\.0+)?$/.test(out)) out = out.slice(1);
  if (dec > 0) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return comma ? out.replace(".", ",") : out;
}

/** Ziehen: Pixel nach rechts/oben → Schritte (alle 6 px ein Schritt) */
export function dragSteps(dx, dy, px = 6) { return Math.trunc((dx - dy) / px) || 0; }

function decimals(s) { const m = s.match(/[.,](\d+)/); return m ? m[1].length : 0; }
