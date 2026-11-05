// STL und OBJ lesen (SolidCraft-Abgleich E5 »Netz konvertieren«): STL binär und ASCII, OBJ als Text → gemeinsame Punkte und Dreiecke.
// Gleiche Punkte (auf 1e-6 mm gerundet) werden zusammengelegt, entartete Dreiecke fallen weg.

const isBinary = (u8) => {
  if (u8.length < 84) return false;
  const n = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(80, true);
  return 84 + n * 50 === u8.length;
};

/** u8: Uint8Array der Datei → { vertices: [[x,y,z]], triangles: [[a,b,c]] } */
export function parseStl(u8) {
  const raw = [];
  if (isBinary(u8)) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = dv.getUint32(80, true);
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12, tri = [];
      for (let k = 0; k < 3; k++) tri.push([dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)]);
      raw.push(tri);
    }
  } else {
    const text = new TextDecoder().decode(u8);
    const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
    let m, cur = [];
    while ((m = re.exec(text))) { cur.push([Number(m[1]), Number(m[2]), Number(m[3])]); if (cur.length === 3) { raw.push(cur); cur = []; } }
  }
  return indexTriangles(raw);
}

/**
 * OBJ (Wavefront, Text) → { vertices, triangles, objects }. Flächen mit mehr als drei Ecken werden als Fächer zerlegt,
 * Indizes »v«, »v/vt«, »v//vn«, »v/vt/vn« und negative (relative) Indizes gehen. Linien, Punkte, Texturen fallen weg.
 * objects = Anzahl »o«/»g«-Gruppen mit Flächen (nur zur Info).
 */
export function parseObj(text) {
  const pts = [], raw = [];
  let objects = 0, groupHas = false;
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t[0] === "#") continue;
    const parts = t.split(/\s+/), kw = parts[0];
    if (kw === "v") pts.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    else if (kw === "o" || kw === "g") groupHas = false;
    else if (kw === "f") {
      const idx = parts.slice(1).map((x) => { const i = parseInt(x.split("/")[0], 10); return i < 0 ? pts.length + i : i - 1; });
      if (idx.some((i) => !(i >= 0 && i < pts.length))) throw new Error("OBJ: Fläche verweist auf einen Punkt, den es nicht gibt");
      for (let k = 1; k + 1 < idx.length; k++) raw.push([pts[idx[0]], pts[idx[k]], pts[idx[k + 1]]]);
      if (!groupHas) { objects++; groupHas = true; }
    }
  }
  if (!raw.length) throw new Error("OBJ enthält keine Flächen");
  if (pts.some((p) => p.some((x) => !Number.isFinite(x)))) throw new Error("OBJ: ungültige Punktkoordinaten");
  return { ...indexTriangles(raw), objects };
}

/** Netz einer Importdatei: format "stl" (base64 → Bytes vorher) oder "obj" (Text) */
export function parseMeshFile(format, data) {
  return format === "obj" ? parseObj(data) : parseStl(data);
}

function indexTriangles(raw) {
  const key = (p) => p.map((x) => Math.round(x * 1e6)).join(",");
  const index = new Map(), vertices = [], triangles = [];
  const id = (p) => { const k = key(p); if (!index.has(k)) { index.set(k, vertices.length); vertices.push(p); } return index.get(k); };
  for (const t of raw) {
    const [a, b, c] = t.map(id);
    if (a !== b && b !== c && a !== c) triangles.push([a, b, c]);
  }
  return { vertices, triangles };
}
