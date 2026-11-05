// Persönliche Bohrungsvorlagen (SolidCraft »Persönliche Vorlagen« im Bohrungsdialog): Form, Gewinde, Ø, Ende, Senkung und
// Bohrgrund einer Bohrung unter einem Namen in den Benutzereinstellungen; Lage (Skizze) gehört nicht dazu.
export const HOLE_PRESET_KEYS = ["form", "thread", "diameter", "extent", "depth", "direction", "sink", "sinkDiameter", "sinkAngle", "sinkDepth", "tip", "tipAngle", "slotLength", "slotAngle"];
export const MAX_HOLE_PRESETS = 40;

/** Werte einer Bohrung als Vorlage (nur gesetzte Felder, als Text) */
export function presetFrom(f, name) {
  const values = {};
  for (const k of HOLE_PRESET_KEYS) if (f[k] !== undefined && f[k] !== null && f[k] !== "") values[k] = String(f[k]);
  return { name: String(name).trim(), values };
}
/** Vorlage auf eine Bohrung legen: Vorlagenfelder ersetzen, fehlende löschen, Skizze/Name bleiben */
export function applyPreset(f, p) {
  for (const k of HOLE_PRESET_KEYS) {
    if (p.values[k] === undefined) delete f[k];
    else f[k] = k === "tip" && p.values[k] === "false" ? false : p.values[k];
  }
  return f;
}
export function validateHolePresets(v) {
  if (!Array.isArray(v) || v.length > MAX_HOLE_PRESETS) return { ok: false, error: `Liste von höchstens ${MAX_HOLE_PRESETS} Vorlagen erwartet` };
  const out = [], names = new Set();
  for (const p of v) {
    const name = String(p?.name ?? "").trim();
    if (!name || name.length > 40) return { ok: false, error: "Vorlage braucht einen Namen (höchstens 40 Zeichen)" };
    if (names.has(name)) return { ok: false, error: `Vorlage »${name}« doppelt` };
    names.add(name);
    const values = {};
    for (const [k, x] of Object.entries(p.values || {})) {
      if (!HOLE_PRESET_KEYS.includes(k)) return { ok: false, error: `Vorlage »${name}«: unbekanntes Feld ${k}` };
      if (typeof x !== "string" || x.length > 100) return { ok: false, error: `Vorlage »${name}«: ungültiger Wert für ${k}` };
      values[k] = x;
    }
    out.push({ name, values });
  }
  return { ok: true, value: out };
}

/** Bohrbild als SVG (Halbschnitt mit Maßen wie im SolidCraft-Dialog). v: {d, depth|null, tip (Winkel|0), sink: {kind, d, angle|depth}} */
export function holeDiagramSvg({ d = 8, depth = null, tip = 118, sink = null, thread = null } = {}) {
  const W = 120, H = 130, x0 = 30, top = 18, bodyW = 60;
  const through = depth == null;
  const r = 12, hBore = 78;
  const cx = x0 + bodyW / 2;
  const tipH = !through && tip > 0 ? r / Math.tan(((tip / 2) * Math.PI) / 180) : 0;
  const sinkR = sink ? 22 : r, sinkH = sink?.kind === "flach" ? 14 : sink ? (sinkR - r) / Math.tan((((sink.angle || 90) / 2) * Math.PI) / 180) : 0;
  const yEnd = top + (through ? 100 : hBore);
  // Bohrungskontur
  const pts = [[cx - sinkR, top]];
  if (sink?.kind === "flach") pts.push([cx - sinkR, top + sinkH], [cx - r, top + sinkH]);
  else if (sink) pts.push([cx - r, top + sinkH]);
  pts.push([cx - r, yEnd]);
  if (tipH) pts.push([cx, yEnd + Math.min(tipH, 18)]);
  else pts.push([cx, yEnd]);
  const right = pts.slice().reverse().map(([x, y]) => [2 * cx - x, y]);
  const poly = [...pts, ...right].map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const fmt = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
  const lines = [
    `<rect x="${x0}" y="${top}" width="${bodyW}" height="${through ? 100 : hBore + 26}" class="hd-body"/>`,
    `<polygon points="${poly}" class="hd-hole"/>`,
    thread ? `<line x1="${cx - r - 3}" y1="${top + sinkH}" x2="${cx - r - 3}" y2="${yEnd}" class="hd-thread"/><line x1="${cx + r + 3}" y1="${top + sinkH}" x2="${cx + r + 3}" y2="${yEnd}" class="hd-thread"/>` : "",
    `<line x1="${cx}" y1="${top - 8}" x2="${cx}" y2="${yEnd + 24}" class="hd-axis"/>`,
    // Ø
    `<line x1="${cx - r}" y1="${top + 50}" x2="${cx + r}" y2="${top + 50}" class="hd-dim"/><text x="${cx}" y="${top + 46}" class="hd-t">Ø${fmt(d)}${thread ? " " + thread : ""}</text>`,
    // Tiefe
    through ? `<text x="${x0 + bodyW + 6}" y="${top + 54}" class="hd-t hd-l">durch</text>`
      : `<line x1="${x0 + bodyW + 8}" y1="${top}" x2="${x0 + bodyW + 8}" y2="${yEnd}" class="hd-dim"/><text x="${x0 + bodyW + 12}" y="${(top + yEnd) / 2 + 4}" class="hd-t hd-l">${fmt(depth)}</text>`,
    tipH ? `<text x="${cx}" y="${yEnd + 34}" class="hd-t">${fmt(tip)}°</text>` : "",
    sink ? `<text x="${cx}" y="${top - 10}" class="hd-t">${sink.kind === "flach" ? "⌴" : "⌵"} Ø${fmt(sink.d)}</text>` : "",
  ];
  return `<svg class="hole-diagram" viewBox="0 0 ${W + 40} ${H + 20}" width="${W + 40}" height="${H + 20}" role="img" aria-label="Bohrbild">${lines.join("")}</svg>`;
}
