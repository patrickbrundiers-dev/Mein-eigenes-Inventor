// Skizze zu den Generator-Einstellungen (Bebilderung wie MegaCAD/HiCAD, aber aus dem echten Bauplan gerechnet):
// Grundriss bzw. Ansicht aller Stäbe und Platten, dazu Maßlinien, die je einem Parameter gehören. Fokus auf einem
// Eingabefeld hebt sein Maß hervor. Reine Rechnung; das Eigenschaftenfeld zeichnet daraus SVG.
//
// Ansichten: top = Grundriss (x, y), front = Ansicht von vorne (x, z), side = Ansicht von der Seite (y, z).

const PROJ = { top: (q) => [q[0], q[1]], front: (q) => [q[0], q[2]], side: (q) => [q[1], q[2]] };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Art eines Teils für Farbe/Strich: Geländer, Stufe/Belag, Glas, Platte, Stab */
function kindOf(name, extra) {
  if (/Geländer|Handlauf|Pfosten|Knieleiste|Stab |Untergurt|Obergurt|Querstab|Diagonale|Ring/.test(name || "")) return "rail";
  if (extra?.glass) return "glass";
  if (extra?.tread || /Stufe|Podest$|Belag/.test(name || "")) return "tread";
  return extra?.plate ? "plate" : "member";
}

/** Umriss einer Platte (Unterseite) als 3D-Punkte */
function plateOutline(pl) {
  const y = cross(pl.normal, pl.xDir);
  if (pl.poly?.length) return pl.poly.map(([u, v]) => add(add(pl.center, pl.xDir, u), y, v));
  const W = pl.W / 2, H = pl.H / 2;
  return [[-W, -H], [W, -H], [W, H], [-W, H]].map(([u, v]) => add(add(pl.center, pl.xDir, u), y, v));
}

/**
 * Zeichnung einer Ansicht: { lines: [{ pts, kind, w }], fills: [{ pts, kind }], box: [x0, y0, x1, y1] }.
 * w = Strichbreite in mm (Profilbreite, mindestens dünn), Punkte in der Ansichtsebene.
 */
export function sketchView(plan, view = "top") {
  const P = PROJ[view] || PROJ.top;
  const lines = [], fills = [];
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (q) => { box[0] = Math.min(box[0], q[0]); box[1] = Math.min(box[1], q[1]); box[2] = Math.max(box[2], q[0]); box[3] = Math.max(box[3], q[1]); };
  const width = (sec) => Math.max(sec?.geom?.width || 0, sec?.geom?.height || 0) || 10;
  for (const pl of plan.plates || []) {
    const pts = plateOutline(pl).map(P);
    pts.forEach(grow);
    fills.push({ pts, kind: kindOf(pl.name, { ...pl, plate: true }) });
  }
  for (const m of plan.members || []) {
    const pts = [P(m.a), P(m.b)];
    pts.forEach(grow);
    lines.push({ pts, kind: kindOf(m.name), w: width(m.section) });
  }
  for (const c of plan.chains || []) {
    const pts = c.points.map(P);
    pts.forEach(grow);
    lines.push({ pts, kind: kindOf(c.name), w: width(c.section) });
  }
  if (!Number.isFinite(box[0])) box.splice(0, 4, 0, 0, 100, 100);
  return { lines, fills, box };
}

/**
 * Maßlinien einer Ansicht: [{ key, a, b, off, text }] – a/b Punkte in der Ansicht, off = Abstand der Maßlinie (mm,
 * Vorzeichen = Seite), key = Parameter des Eingabefelds. Generatoren liefern sie über dims(p, plan, view);
 * ohne eigene Maße: Gesamtlänge und -breite bzw. -höhe.
 */
export function sketchDims(gen, p, plan, view, sk = sketchView(plan, view)) {
  const own = gen?.dims ? gen.dims(p, plan, view) : null;
  if (own) return own;
  const [x0, y0, x1, y1] = sk.box;
  const gap = Math.max(x1 - x0, y1 - y0) * 0.06;
  return [
    { key: null, a: [x0, y0], b: [x1, y0], off: -gap, text: Math.round(x1 - x0) },
    { key: null, a: [x0, y0], b: [x0, y1], off: gap, text: Math.round(y1 - y0) },
  ].filter((d) => d.text >= 1);
}

/** Ansichten, die ein Generator zeigt (erste = Standard) */
export const sketchViews = (gen) => gen?.views || ["top", "front"];
export const VIEW_LABEL = { top: "Grundriss", front: "Ansicht", side: "Seite" };

// Körper zu einem Parameter (Hervorhebung im 3D-Fenster beim Fokus auf dem Feld): Generator-eigene Zuordnung
// gen.parts[key], sonst nach üblichen Parameternamen
const FILL = /Stab|Staket|Querstab|Knieleiste|Kreuz|Ring/;
const DEFAULT_PARTS = [
  [/^(gel)?[pP]ost(Max|Top|Down)?$|^embed$|^gelDown$/, /Pfosten/],
  [/^(gel)?[rR]ail$|^overhang$|^gelAuslauf$|^railH$|^gelH$/, /Handlauf/],
  [/^(gel)?[bB]ars?$|^gapMax$|^gelGap$|^(gel)?[fF]ill$|^ringD?$/, FILL],
  [/^(gel)?[bB]elt$|^topGap$|^bottomZ$/, /gurt/i],
  [/^base(Size|T)?$/, /Fußplatte/],
  [/^beam$/, /Laufprofil/],
  [/^roller/, /Rollenbock/],
  [/^frame$/, /Rahmen|Riegel/],
  [/^joist(Max)?$/, /Querträger/],
  [/^column$|^stuetzen?$|^supportMax$/, /Stütze/],
  [/^tread(T)?$|^going$|^nosing$/, /Stufe/],
  [/^wange[HT]$|^upn$/, /Wange/],
  [/^holm(Inset)?$/, /Holm/],
  [/^spindle$/, /Spindel/],
  [/^panel(T|Gap)$/, /Blech|Glas/],
  [/^deck(T)?$/, /Belag/],
  [/^wallPlate$/, /Wand/],
];
/** RegExp der Körpernamen zum Parameter key oder null */
export function fieldParts(gen, key) {
  if (gen?.parts && key in gen.parts) return gen.parts[key];
  return DEFAULT_PARTS.find(([k]) => k.test(key))?.[1] || null;
}
