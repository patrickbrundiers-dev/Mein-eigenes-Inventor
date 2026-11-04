// STL lesen (SolidCraft-Abgleich E5 »Netz konvertieren«): binär und ASCII → gemeinsame Punkte und Dreiecke.
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
  const key = (p) => p.map((x) => Math.round(x * 1e6)).join(",");
  const index = new Map(), vertices = [], triangles = [];
  const id = (p) => { const k = key(p); if (!index.has(k)) { index.set(k, vertices.length); vertices.push(p); } return index.get(k); };
  for (const t of raw) {
    const [a, b, c] = t.map(id);
    if (a !== b && b !== c && a !== c) triangles.push([a, b, c]);
  }
  return { vertices, triangles };
}
