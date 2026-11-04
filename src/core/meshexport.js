// OBJ- und 3MF-Export (SolidCraft-Abgleich F6): Dreiecksnetze in mm, Z oben.
// meshes = [{ name, pos: [x,y,z, …] (Weltkoordinaten), idx: [a,b,c, …] | null, color: [r,g,b] 0..1 }]
import { zipFiles } from "./xlsx.js";

const num = (v) => { const r = Math.round(v * 1e5) / 1e5; return Object.is(r, -0) ? "0" : String(r); };
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tris = (m) => m.idx || Array.from({ length: m.pos.length / 3 }, (_, i) => i);
const hex = (c) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();

/** Gleiche Punkte zusammenfassen (Netze aus three.js haben pro Fläche eigene Punkte) */
export function weldMesh(m, tol = 1e-6) {
  const key = (i) => [0, 1, 2].map((k) => Math.round(m.pos[i * 3 + k] / tol)).join(",");
  const map = new Map(), pos = [], remap = [];
  for (let i = 0; i < m.pos.length / 3; i++) {
    const k = key(i);
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); }
    remap.push(j);
  }
  const idx = [];
  const src = tris(m);
  for (let t = 0; t < src.length; t += 3) {
    const a = remap[src[t]], b = remap[src[t + 1]], c = remap[src[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c); // entartete Dreiecke weglassen
  }
  return { ...m, pos, idx };
}

/** OBJ (eine Datei, Farben als Punktfarben »v x y z r g b« – lesen Blender, MeshLab, PrusaSlicer, Windows 3D-Viewer) */
export function writeObj(meshes, { app = "PBCAD" } = {}) {
  const out = [`# ${app} OBJ-Export, Einheit mm, Z oben`];
  let base = 1;
  for (const m0 of meshes) {
    const m = weldMesh(m0);
    if (!m.idx.length) continue;
    const c = (m.color || [0.7, 0.7, 0.7]).map((v) => num(Math.round(v * 1000) / 1000)).join(" ");
    out.push("", `o ${String(m.name || "Körper").replace(/\s+/g, "_")}`);
    for (let i = 0; i < m.pos.length; i += 3) out.push(`v ${num(m.pos[i])} ${num(m.pos[i + 1])} ${num(m.pos[i + 2])} ${c}`);
    for (let t = 0; t < m.idx.length; t += 3) out.push(`f ${m.idx[t] + base} ${m.idx[t + 1] + base} ${m.idx[t + 2] + base}`);
    base += m.pos.length / 3;
  }
  if (base === 1) throw new Error("Nichts zu exportieren");
  return out.join("\n") + "\n";
}

/** 3MF (3D-Druck, Einheit mm, Farben als Basismaterial) → Uint8Array (ZIP) */
export function write3mf(meshes, { title = "PBCAD", app = "PBCAD" } = {}) {
  const cols = [...new Set(meshes.map((m) => hex(m.color || [0.7, 0.7, 0.7])))];
  const objs = [], items = [];
  meshes.forEach((m0, i) => {
    const m = weldMesh(m0);
    if (!m.idx.length) return;
    const id = i + 2, pi = cols.indexOf(hex(m.color || [0.7, 0.7, 0.7]));
    const v = [], t = [];
    for (let k = 0; k < m.pos.length; k += 3) v.push(`<vertex x="${num(m.pos[k])}" y="${num(m.pos[k + 1])}" z="${num(m.pos[k + 2])}"/>`);
    for (let k = 0; k < m.idx.length; k += 3) t.push(`<triangle v1="${m.idx[k]}" v2="${m.idx[k + 1]}" v3="${m.idx[k + 2]}"/>`);
    objs.push(`<object id="${id}" type="model" name="${xml(m.name || "Körper")}" pid="1" pindex="${pi}"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object>`);
    items.push(`<item objectid="${id}"/>`);
  });
  if (!objs.length) throw new Error("Nichts zu exportieren");
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${xml(title)}</metadata><metadata name="Application">${xml(app)}</metadata>
<resources><basematerials id="1">${cols.map((c, i) => `<base name="Farbe ${i + 1}" displaycolor="${c}"/>`).join("")}</basematerials>
${objs.join("\n")}</resources>
<build>${items.join("")}</build>
</model>
`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>
`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>
`;
  return zipFiles([["[Content_Types].xml", types], ["_rels/.rels", rels], ["3D/3dmodel.model", model]]);
}
