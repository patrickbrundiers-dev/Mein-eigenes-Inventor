// Vereinfachen für den Export (W10): Modell für Architekt, Kunde oder BIM leichter machen – kleine Körper weglassen,
// Normteile (Schrauben, Muttern, Scheiben) und Schweißnähte weglassen, Körper durch Hüllquader ersetzen.
// Reine Entscheidung je Körper; die Geometrie tauscht der Kern (worker.js) aus.
//
// Einstellung am Dokument: d.simplify = { on, minSize, norm, welds, envelope: "nein"|"klein"|"alle", envSize }.

export const ENVELOPES = [["nein", "nein"], ["klein", "nur Körper unter Hüllgröße"], ["alle", "alle Körper"]];

/** Gültige Einstellung (aus = null) */
export function simplifyOf(d) {
  const s = d?.simplify;
  if (!s?.on) return null;
  const n = (x, def) => (Number.isFinite(+x) && +x >= 0 && x !== "" && x != null ? +x : def);
  return { minSize: n(s.minSize, 0), norm: s.norm !== false, welds: s.welds !== false, envelope: ["klein", "alle"].includes(s.envelope) ? s.envelope : "nein", envSize: n(s.envSize, 100) };
}

/** Größte Kantenlänge des Hüllquaders [[min], [max]] */
export const boxSize = (bb) => Math.max(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]);

/**
 * Was mit einem Körper passiert: "keep" | "drop" | "box". body = { kind, meta }, bb = Hüllquader in mm.
 */
export function simplifyAction(body, bb, opt) {
  if (!opt) return "keep";
  const m = body?.meta || {};
  if (opt.norm && m.norm) return "drop";
  if (opt.welds && (m.weld || body?.kind === "weld")) return "drop";
  const size = bb ? boxSize(bb) : Infinity;
  if (opt.minSize > 0 && size < opt.minSize) return "drop";
  if (opt.envelope === "alle" || (opt.envelope === "klein" && size < opt.envSize)) return "box";
  return "keep";
}

/** Zusammenfassung für die Meldung nach dem Export */
export function simplifyText(count) {
  const parts = [count.drop && `${count.drop} Körper weggelassen`, count.box && `${count.box} als Hüllquader`].filter(Boolean);
  return parts.length ? "Vereinfacht: " + parts.join(", ") : "";
}
