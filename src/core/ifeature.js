// iFeature-Bibliothek (Werkzeuge Stufe 52): ausgewählte Features eines Bauteils (Skizzen und was darauf aufbaut)
// als wiederverwendbares Element speichern und in ein anderes Bauteil auf eine Ebene oder Fläche einsetzen.
// Benutzte Parameter kommen mit und sind beim Einsetzen änderbar. Reine Rechnung; Ablage und Dialoge in src/ui.
//
// iFeature: { format: "pbcad-ifeature", version: 1, name, description, anchor: {origin, xDir, normal},
//             params: [{name, expr, comment?}], features: [...] } – anchor = Ebene der ersten Skizze.

import { featureRefs, sketchRefs } from "./featurerefs.js";
import { planeFrame, v3 } from "./geom.js";
import { identifiers, tryEvaluate, resolveParams, isValidName } from "./expr.js";
import { copyFeatures } from "./ableiten.js";

export const IFEATURE_FORMAT = "pbcad-ifeature";
const DATUMS = ["arbeitsebene", "arbeitsachse", "arbeitspunkt"];
// Felder, die keine Ausdrücke sind (Namen, Kennungen, Auswahllisten)
const NOT_EXPR = new Set(["id", "name", "type", "op", "mode", "side", "direction", "extent", "ref", "fileName", "format", "data", "thread", "form", "kind", "comment", "text", "font", "label", "material", "note"]);

/** Zeichenketten eines Features, die Ausdrücke sein können, durchlaufen (fn(text) → neuer Text oder undefined) */
function mapStrings(x, fn, key = "") {
  if (typeof x === "string") return NOT_EXPR.has(key) ? x : fn(x) ?? x;
  if (Array.isArray(x)) return x.map((v) => mapStrings(v, fn, key));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, mapStrings(v, fn, k)]));
  return x;
}
const usedNames = (x) => { const out = new Set(); mapStrings(x, (s) => { for (const n of identifiers(s)) out.add(n); }); return out; };

/**
 * iFeature aus den Features ids des Bauteils part. Skizzen, auf die die Auswahl aufbaut, kommen automatisch mit;
 * jeder andere Bezug nach außen ist ein Fehler (das iFeature muss für sich stehen).
 */
export function extractIFeature(part, ids, { name, description = "" } = {}) {
  const feats = part.features || [], byId = new Map(feats.map((f) => [f.id, f]));
  const want = new Set(ids.filter((id) => byId.has(id)));
  if (!want.size) throw new Error("iFeature: erst Features auswählen");
  for (const id of [...want]) for (const s of sketchRefs(byId.get(id))) if (byId.has(s)) want.add(s);
  const order = feats.filter((f) => want.has(f.id));
  for (const f of order) {
    if (DATUMS.includes(f.type)) throw new Error(`iFeature: Arbeitselement »${f.name}« kann nicht mit – Skizzen auf eine Grundebene oder Fläche legen`);
    if (f.type === "sketch" && f.plane?.ref === "datum") throw new Error(`iFeature: Skizze »${f.name}« liegt auf einer Arbeitsebene – für das iFeature auf eine Grundebene oder Fläche legen`);
    if (f.type === "import") throw new Error(`iFeature: Import »${f.name}« kann nicht mit`);
    const out = featureRefs(f).filter((r) => byId.has(r) && !want.has(r));
    if (out.length) throw new Error(`iFeature: »${f.name}« braucht »${byId.get(out[0]).name}« – mit auswählen oder den Bezug ändern`);
  }
  const first = order.find((f) => f.type === "sketch");
  if (!first) throw new Error("iFeature: Die Auswahl braucht mindestens eine Skizze");
  // Benutzte Parameter samt den Parametern, auf die sie selbst verweisen
  const params = part.params || [], pByName = new Map(params.map((p) => [p.name, p]));
  const need = new Set([...usedNames(order)].filter((n) => pByName.has(n)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of [...need]) for (const m of identifiers(pByName.get(n).expr)) if (pByName.has(m) && !need.has(m)) { need.add(m); grew = true; }
  }
  const values = resolveParams(params).values;
  const a = planeFrame(first.plane, tryEvaluate(first.offset ?? 0, values, 0));
  const label = String(name || first.name || "iFeature").trim();
  if (!label || label.length > 60) throw new Error("iFeature: Name fehlt oder ist zu lang (höchstens 60 Zeichen)");
  return {
    format: IFEATURE_FORMAT, version: 1, name: label, description: String(description || ""),
    anchor: { origin: a.origin, xDir: a.xDir, normal: a.normal },
    params: params.filter((p) => need.has(p.name)).map((p) => ({ name: p.name, expr: String(p.expr), ...(p.comment ? { comment: p.comment } : {}) })),
    features: JSON.parse(JSON.stringify(order)),
  };
}

/** iFeature aus einer Datei bzw. der Ablage prüfen; Rückgabe { ok, value | error } */
export function validateIFeature(v) {
  if (!v || typeof v !== "object" || v.format !== IFEATURE_FORMAT) return { ok: false, error: "Keine PBCAD-iFeature-Datei" };
  if (!(v.version >= 1)) return { ok: false, error: "iFeature: Version fehlt" };
  if (v.version > 1) return { ok: false, error: "iFeature aus einer neueren PBCAD-Version" };
  if (!Array.isArray(v.features) || !v.features.some((f) => f?.type === "sketch")) return { ok: false, error: "iFeature: keine Skizze enthalten" };
  const a = v.anchor;
  if (![a?.origin, a?.xDir, a?.normal].every((x) => Array.isArray(x) && x.length === 3 && x.every(Number.isFinite))) return { ok: false, error: "iFeature: Lage fehlt" };
  if (!Array.isArray(v.params) || v.params.some((p) => !isValidName(p?.name))) return { ok: false, error: "iFeature: Parameter ungültig" };
  return { ok: true, value: v };
}

/**
 * Ziel-Ebene des Einsetzens: Grundebene oder Fläche (plane wie bei Skizzen), Abstand entlang der Normalen, Drehung
 * um die Normale (°), umgekehrt = auf die andere Seite (Normale und y gespiegelt, damit die Lage rechtshändig bleibt).
 */
export function targetFrame(plane, { offset = 0, rotate = 0, flip = false } = {}) {
  const f = planeFrame(plane, offset);
  const r = (rotate * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  let x = v3.add(v3.mul(f.xDir, c), v3.mul(f.yDir, s)), n = f.normal;
  if (flip) n = v3.mul(n, -1);
  return { origin: f.origin, xDir: x, yDir: v3.cross(n, x), normal: n };
}

/**
 * iFeature einsetzen: neue Features (neue IDs, Skizzen auf die Ziel-Ebene umgelegt, Kanten-/Flächenbezüge mitbewegt)
 * und die anzulegenden Parameter. values: {Name: Ausdruck} für geänderte Parameterwerte. Gibt es einen Parameter
 * schon im Ziel-Bauteil, bekommt der neue einen freien Namen (Name_2 …) und die Ausdrücke werden umbenannt.
 */
export function placeIFeature(ifeat, target, { values = {}, params = [], names = [], newId }) {
  const A = planeFrame({ ref: "custom", ...ifeat.anchor }), T = target;
  const toT = (p) => { const d = v3.sub(p, A.origin); return v3.add(T.origin, v3.add(v3.mul(T.xDir, v3.dot(d, A.xDir)), v3.add(v3.mul(T.yDir, v3.dot(d, A.yDir)), v3.mul(T.normal, v3.dot(d, A.normal))))); };
  const dirT = (d) => v3.add(v3.mul(T.xDir, v3.dot(d, A.xDir)), v3.add(v3.mul(T.yDir, v3.dot(d, A.yDir)), v3.mul(T.normal, v3.dot(d, A.normal))));
  const r9 = (v) => v.map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e9) / 1e9));
  // Parameter: freie Namen im Ziel
  const taken = new Set(params.map((p) => p.name)), rename = new Map();
  for (const p of ifeat.params) {
    let n = p.name;
    for (let k = 2; taken.has(n); k++) n = `${p.name}_${k}`;
    taken.add(n);
    if (n !== p.name) rename.set(p.name, n);
  }
  const re = (s) => {
    if (!rename.size || !identifiers(s).some((n) => rename.has(n))) return undefined;
    return s.replace(/[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*/g, (w) => rename.get(w) ?? w);
  };
  const newParams = ifeat.params.map((p) => ({ ...p, name: rename.get(p.name) ?? p.name, expr: re(String(values[p.name] ?? p.expr)) ?? String(values[p.name] ?? p.expr) }));
  const copies = copyFeatures(ifeat.features, ifeat.features.map((f) => f.id), { newId, sameDoc: true });
  const used = new Set(names);
  const features = copies.map((f, i) => {
    const g = mapStrings(f, re), base = ifeat.features[i].name || f.type;
    let n = base;
    for (let k = 2; used.has(n); k++) n = `${base} ${k}`;
    used.add(n); g.name = n;
    if (g.type === "sketch") {
      const B = planeFrame(g.plane, 0);
      g.plane = { ref: "face", origin: r9(toT(B.origin)), xDir: r9(dirT(B.xDir)), normal: r9(dirT(B.normal)) };
    }
    for (const k of ["edges", "faces"]) if (Array.isArray(g[k])) g[k] = g[k].map((e) => (Array.isArray(e?.p) ? { ...e, p: r9(toT(e.p)), ...(Array.isArray(e.d) ? { d: r9(dirT(e.d)) } : {}), ...(Array.isArray(e.n) ? { n: r9(dirT(e.n)) } : {}) } : e));
    return g;
  });
  return { features, params: newParams, renamed: Object.fromEntries(rename) };
}

/** Kurzbeschreibung für die Bibliotheksliste */
export function ifeatureSummary(v) {
  const n = v.features.length, sk = v.features.filter((f) => f.type === "sketch").length;
  return `${n} Feature${n === 1 ? "" : "s"} (${sk} Skizze${sk === 1 ? "" : "n"})${v.params.length ? ", Parameter: " + v.params.map((p) => p.name).join(", ") : ""}`;
}
