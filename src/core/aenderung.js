// Zeichnungsvergleich und Änderungsindex (Z4): Stand einer Zeichnung merken (Maßtexte, Maßstäbe der Ansichten,
// Kennung der Modelle), mit dem jetzigen Stand vergleichen, Änderungstext vorschlagen und geänderte Maße mit einer
// Änderungswolke und dem Index markieren (DIN EN ISO 7200 / übliche Werkstattpraxis). Reine Rechnung.

/** Kurze, stabile Kennung eines Objekts (FNV-1a über JSON) – erkennt geänderte Modelle */
export function hashOf(obj) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/** Modell-Inhalt ohne Felder, die nur Anzeige oder Verwaltung sind (zählen nicht als Änderung) */
export function modelSignature(doc) {
  if (!doc) return "";
  const { id, name, thumb, thumbnail, versions, fertigungsstand, laufzettel, etiketten, angebot, kalkulation, mappe, ...rest } = doc;
  return hashOf(rest);
}

/**
 * Stand merken. dims: [{ id, text }], views: [{ id, scale }], models: [{ id, name, sig }]
 * Rückgabe { date, rev, dims: {id: text}, views: {id: scale}, models: {id: {name, sig}} }
 */
export function drawingSnapshot({ dims = [], views = [], models = [], rev = "", date = new Date().toISOString().slice(0, 10) } = {}) {
  return {
    date, rev,
    dims: Object.fromEntries(dims.map((m) => [m.id, m.text])),
    views: Object.fromEntries(views.map((v) => [v.id, v.scale])),
    models: Object.fromEntries(models.map((m) => [m.id, { name: m.name, sig: m.sig }])),
  };
}

/**
 * Jetzigen Stand mit dem gemerkten vergleichen.
 * Rückgabe { changed: [{id, from, to}], added: [{id, text}], removed: [{id, text}], views: [{id, from, to}],
 *   models: [Name], marks: [id] (Maße, die eine Wolke bekommen), empty, text }
 */
export function compareSnapshot(base, cur) {
  const out = { changed: [], added: [], removed: [], views: [], models: [], marks: [], empty: true, text: "" };
  if (!base || !cur) return out;
  for (const [id, to] of Object.entries(cur.dims)) {
    if (!(id in base.dims)) out.added.push({ id, text: to });
    else if (base.dims[id] !== to) out.changed.push({ id, from: base.dims[id], to });
  }
  for (const [id, text] of Object.entries(base.dims)) if (!(id in cur.dims)) out.removed.push({ id, text });
  for (const [id, to] of Object.entries(cur.views)) if (id in base.views && base.views[id] !== to) out.views.push({ id, from: base.views[id], to });
  for (const [id, m] of Object.entries(cur.models)) if (base.models[id] && base.models[id].sig !== m.sig) out.models.push(m.name);
  out.marks = [...out.changed.map((x) => x.id), ...out.added.map((x) => x.id)];
  out.empty = !out.changed.length && !out.added.length && !out.removed.length && !out.views.length && !out.models.length;
  out.text = changeText(out);
  return out;
}

/** Änderungstext für die Tabelle, höchstens 120 Zeichen: »Maß 1.200 → 1.250; 2 Maße neu; Modell Pfosten geändert« */
export function changeText(c) {
  const parts = [];
  if (c.changed.length === 1) parts.push(`Maß ${c.changed[0].from} → ${c.changed[0].to}`);
  else if (c.changed.length > 1) parts.push(`${c.changed.length} Maße geändert (${c.changed.slice(0, 2).map((x) => `${x.from} → ${x.to}`).join(", ")}${c.changed.length > 2 ? " …" : ""})`);
  if (c.added.length) parts.push(c.added.length === 1 ? `Maß ${c.added[0].text} neu` : `${c.added.length} Maße neu`);
  if (c.removed.length) parts.push(c.removed.length === 1 ? `Maß ${c.removed[0].text} entfallen` : `${c.removed.length} Maße entfallen`);
  if (c.views.length) parts.push(`Maßstab ${c.views.map((v) => `${v.from} → ${v.to}`).join(", ")}`);
  if (c.models.length) parts.push(`Modell ${c.models.slice(0, 2).join(", ")}${c.models.length > 2 ? " …" : ""} geändert`);
  let t = parts.join("; ");
  if (t.length > 120) t = t.slice(0, 118) + " …";
  return t;
}

/** Wolke als Punktfolge (für <polygon>, das auch DXF und PDF ohne Bögen verstehen): je Bogen 6 Stützpunkte */
export function cloudPoints(x0, y0, x1, y1, step = 4, seg = 6) {
  const pts = [];
  const edge = (ax, ay, bx, by) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step));
    for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
  };
  edge(x0, y0, x1, y0); edge(x1, y0, x1, y1); edge(x1, y1, x0, y1); edge(x0, y1, x0, y0);
  const f = (v) => Math.round(v * 100) / 100, out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    const a0 = Math.atan2(a[1] - cy, a[0] - cx);
    // im Uhrzeigersinn auf dem Blatt (y nach unten) = nach außen bei Umlauf oben links → rechts
    for (let k = 0; k < seg; k++) { const t = a0 + (Math.PI * k) / seg; out.push([f(cx + r * Math.cos(t)), f(cy + r * Math.sin(t))]); }
  }
  return out;
}
