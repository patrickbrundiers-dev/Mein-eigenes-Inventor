// Anordnung der Seitenpanels (Modellbrowser, Eigenschaften): Seite, Breite, ausgeblendet.
// Gespeichert in der Einstellung oberflaeche.layout; ungültige Werte fallen auf den Standard zurück.

export const PANELS = ["browser", "props"];
export const PANEL_LABELS = { browser: "Modellbrowser", props: "Eigenschaften" };
export const DEFAULT_LAYOUT = Object.freeze({ browser: "left", props: "right", wLeft: 260, wRight: 300, hide: [] });
export const WIDTH_MIN = 160, WIDTH_MAX = 700;

/** Prüfen → {ok, value} | {ok:false, error} */
export function validateLayout(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Anordnung erwartet" };
  const out = {};
  for (const p of PANELS) {
    const side = v[p] ?? DEFAULT_LAYOUT[p];
    if (side !== "left" && side !== "right") return { ok: false, error: `Seite für ${PANEL_LABELS[p]} muss links oder rechts sein` };
    out[p] = side;
  }
  for (const k of ["wLeft", "wRight"]) {
    const w = v[k] ?? DEFAULT_LAYOUT[k];
    if (typeof w !== "number" || !Number.isFinite(w) || w < WIDTH_MIN || w > WIDTH_MAX) return { ok: false, error: `Breite ${WIDTH_MIN}–${WIDTH_MAX} px erwartet` };
    out[k] = Math.round(w);
  }
  const hide = v.hide ?? [];
  if (!Array.isArray(hide) || hide.some((x) => !PANELS.includes(x))) return { ok: false, error: "Unbekanntes Panel" };
  out.hide = [...new Set(hide)];
  return { ok: true, value: out };
}

/**
 * Spalten für das Raster: welche Panels links/rechts (Reihenfolge Browser vor Eigenschaften)
 * und wie breit. extraHidden = Panels, die der Modus ausblendet (z. B. Startseite ohne Browser).
 */
export function layoutColumns(layout, extraHidden = []) {
  const hidden = new Set([...(layout.hide || []), ...extraHidden]);
  const side = (s) => PANELS.filter((p) => layout[p] === s);
  const visible = (s) => side(s).filter((p) => !hidden.has(p));
  const left = side("left"), right = side("right");
  const wl = visible("left").length ? layout.wLeft : 0, wr = visible("right").length ? layout.wRight : 0;
  return { left, right, hidden: [...hidden], wLeft: wl, wRight: wr, columns: `${wl}px minmax(0, 1fr) ${wr}px` };
}

/** Panel auf die andere Seite bzw. ein/aus – liefert neue Anordnung */
export function movePanel(layout, panel, side) { return { ...layout, [panel]: side }; }
export function togglePanel(layout, panel) {
  const hide = new Set(layout.hide || []);
  if (hide.has(panel)) hide.delete(panel); else hide.add(panel);
  return { ...layout, hide: [...hide] };
}
