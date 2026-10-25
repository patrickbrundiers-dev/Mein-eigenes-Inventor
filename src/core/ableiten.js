// Werkzeuge Stufe 42: 3D-Skizze (Punktzug mit Eckradien), abgeleitetes Bauteil, Komponente spiegeln,
// Feature kopieren und im Baum verschieben. Reine Rechnung ohne Kernel und Oberfläche.

import { v3 } from "./geom.js";
import { featureRefs } from "./featurerefs.js";

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

/**
 * 3D-Skizze: Punktzug mit Eckradius r (0 = scharfe Ecken). Rückgabe der Stücke
 * [{t: "line", a, b} | {t: "arc", a, m, b}] und der Gesamtlänge. Geschlossen verbindet zum ersten Punkt.
 */
export function path3d(pts, { radius = 0, closed = false } = {}) {
  if (pts.length < 2) throw new Error("3D-Skizze braucht mindestens 2 Punkte");
  for (let i = 1; i < pts.length; i++) if (v3.dist(pts[i], pts[i - 1]) < 1e-6) throw new Error(`Punkt ${i + 1} liegt auf Punkt ${i}`);
  if (closed && pts.length < 3) throw new Error("Geschlossene 3D-Skizze braucht mindestens 3 Punkte");
  const P = closed ? [...pts] : pts;
  const n = P.length;
  // je Ecke: Tangentenpunkte und Bogenmitte
  const corner = new Map();
  if (radius > 0) {
    for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
      const p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      const u = v3.norm(v3.sub(a, p)), w = v3.norm(v3.sub(b, p));
      const cosA = Math.max(-1, Math.min(1, v3.dot(u, w)));
      const phi = Math.acos(cosA); // Innenwinkel an der Ecke
      if (phi > Math.PI - 1e-6) continue; // gerade durch
      if (phi < 1e-6) throw new Error(`Punkt ${i + 1}: Zug kehrt um`);
      const tl = radius / Math.tan(phi / 2);
      if (tl > v3.dist(a, p) / (closed || i > 1 ? 2 : 1) + 1e-9 || tl > v3.dist(b, p) / (closed || i < n - 2 ? 2 : 1) + 1e-9) throw new Error(`Radius ${fmt(radius)} zu groß für die Ecke bei Punkt ${i + 1}`);
      const t1 = v3.add(p, v3.mul(u, tl)), t2 = v3.add(p, v3.mul(w, tl));
      const bis = v3.norm(v3.add(u, w));
      const c = v3.add(p, v3.mul(bis, radius / Math.sin(phi / 2)));
      const m = v3.add(c, v3.mul(v3.norm(v3.sub(p, c)), radius));
      corner.set(i, { t1, t2, m, arc: radius * (Math.PI - phi) });
    }
  }
  const pieces = [];
  let len = 0;
  const segs = closed ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const i = k, j = (k + 1) % n;
    const a = corner.get(i)?.t2 || P[i], b = corner.get(j)?.t1 || P[j];
    if (v3.dist(a, b) > 1e-9) { pieces.push({ t: "line", a, b }); len += v3.dist(a, b); }
    const cj = corner.get(j);
    if (cj && (closed || j < n - 1)) { pieces.push({ t: "arc", a: cj.t1, m: cj.m, b: cj.t2 }); len += cj.arc; }
  }
  // geschlossen: Bogen an Punkt 1 gehört ans Ende, dann beginnt der Zug am Tangentenpunkt
  return { pieces, length: len, closed };
}

/**
 * Abgeleitete Bauteile für den Kern auflösen: jedes Feature »abgeleitet« bekommt die Quelle als `_src`
 * (selbst wieder aufgelöst). Ringbezüge und fehlende Quellen werden als `_srcError` gemeldet.
 */
export function inlineDerived(part, lookup, seen = []) {
  if (!part?.features?.some((f) => f.type === "abgeleitet")) return part;
  const chain = [...seen, part.id];
  return {
    ...part,
    features: part.features.map((f) => {
      if (f.type !== "abgeleitet") return f;
      const { _src, _srcError, ...g } = f;
      const src = f.source && lookup(f.source);
      if (!src || src.kind !== "part") return { ...g, _srcError: "Quellbauteil fehlt (gelöscht?)" };
      if (chain.includes(src.id)) return { ...g, _srcError: `Ringbezug: »${src.name}« leitet sich (über Umwege) von diesem Bauteil ab` };
      return { ...g, _src: inlineDerived(JSON.parse(JSON.stringify({ id: src.id, kind: "part", name: src.name, number: src.number, material: src.material, params: src.params || [], features: src.features })), lookup, chain) };
    }),
  };
}

/** Bauteile, aus denen part abgeleitet werden darf (keine Ringe) */
export function derivableSources(project, part) {
  const docs = project.docs || [];
  const byId = (id) => docs.find((d) => d.id === id);
  const dependsOn = (d, target, depth = 0) => depth < 20 && (d.features || []).some((f) => f.type === "abgeleitet" && (f.source === target || (byId(f.source) && dependsOn(byId(f.source), target, depth + 1))));
  return docs.filter((d) => d.kind === "part" && d.id !== part.id && !dependsOn(d, part.id));
}

/** Drehmatrix aus Eulerwinkeln in Grad wie beim Platzieren: erst um X, dann Y, dann Z (R = Rz · Ry · Rx) */
export function eulerMatrix([rx = 0, ry = 0, rz = 0]) {
  const d = Math.PI / 180, [a, b, c] = [rx * d, ry * d, rz * d];
  const X = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Y = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
  const Z = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mul(Z, mul(Y, X));
}
const mulT = (M, v) => [0, 1, 2].map((j) => M[0][j] * v[0] + M[1][j] * v[1] + M[2][j] * v[2]); // Mᵀ · v

export const MIRROR_PLANES = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] };

/**
 * Komponente an einer Ebene der Baugruppe spiegeln (Normale n, Abstand c vom Ursprung).
 * Die Drehung bleibt, die Lage wird gespiegelt; das Bauteil selbst wird an der Ebene mit der
 * Normalen Rᵀ · n durch seinen Ursprung gespiegelt (abgeleitetes Bauteil). Rückgabe { pos, rot, normal }.
 */
export function mirrorPlacement(pos = [0, 0, 0], rot = [0, 0, 0], n, c = 0) {
  const nn = v3.norm(n);
  const dist = v3.dot(pos, nn) - c;
  const p2 = v3.sub(pos, v3.mul(nn, 2 * dist));
  const local = mulT(eulerMatrix(rot), nn).map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12));
  return { pos: p2.map((x) => Math.round(x * 1e9) / 1e9), rot: [...rot], normal: local };
}

/**
 * Features kopieren (innerhalb eines Bauteils oder in ein anderes): benutzte Skizzen und Arbeitselemente
 * kommen mit, wenn sie nicht ohnehin kopiert werden; alle Bezüge zeigen auf die Kopien.
 * existing: Features des Ziels (für Namen und vorhandene Bezüge beim Kopieren ins selbe Bauteil).
 */
export function copyFeatures(features, ids, { newId, sameDoc = true, names = [] } = {}) {
  const byId = new Map(features.map((f) => [f.id, f]));
  const want = new Set(ids);
  // beim Kopieren in ein anderes Bauteil müssen alle Bezüge mit
  if (!sameDoc) {
    for (let grew = true; grew; ) {
      grew = false;
      for (const id of [...want]) for (const r of featureRefs(byId.get(id) || {})) if (byId.has(r) && !want.has(r)) { want.add(r); grew = true; }
    }
  }
  const order = features.filter((f) => want.has(f.id));
  const map = new Map(order.map((f) => [f.id, newId()]));
  const taken = new Set(names);
  const rename = (n) => { let k = 2, s = `${n} (Kopie)`; while (taken.has(s)) s = `${n} (Kopie ${k++})`; taken.add(s); return s; };
  const remap = (x) => {
    if (typeof x === "string") return map.get(x) ?? (x.startsWith("datum:") && map.has(x.slice(6)) ? "datum:" + map.get(x.slice(6)) : x);
    if (Array.isArray(x)) return x.map(remap);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "id" ? v : remap(v)]));
    return x;
  };
  return order.map((f) => {
    const g = remap(JSON.parse(JSON.stringify(f)));
    g.id = map.get(f.id);
    g.name = rename(f.name || f.type);
    // Skizzen-Elemente behalten ihre eigenen IDs, Punkte/Linien gehören nur zur Skizze
    return g;
  });
}

/**
 * Feature von Index from an Index to verschieben (Ziehen im Baum): darf nicht vor ein Feature, auf das es verweist,
 * und nicht hinter ein Feature, das auf es verweist. Rückgabe Fehlermeldung oder null.
 */
export function moveProblem(features, from, to) {
  const f = features[from];
  if (!f || to < 0 || to >= features.length || to === from) return null;
  const refs = new Set(featureRefs(f));
  if (to < from) {
    const hit = features.slice(to, from).find((g) => refs.has(g.id));
    if (hit) return `»${f.name}« braucht »${hit.name}« – kann nicht davor stehen`;
  } else {
    const hit = features.slice(from + 1, to + 1).find((g) => featureRefs(g).includes(f.id));
    if (hit) return `»${hit.name}« braucht »${f.name}« – »${f.name}« kann nicht dahinter stehen`;
  }
  return null;
}
