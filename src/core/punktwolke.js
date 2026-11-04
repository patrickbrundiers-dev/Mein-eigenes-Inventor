// Punktwolken (SolidCraft-Abgleich E5): Scan-Punkte als Bezug im Bauteil. Lesen von XYZ/TXT/CSV/PTS und PLY (ASCII),
// speichern als Base64 von Float32, ausdünnen und verschieben. Keine Körper – nur Anzeige und Fangen beim Messen.

export const CLOUD_MAX = 500000;

/** Text einer Punktdatei → Float32Array [x,y,z, …]; Zeilen mit weniger als drei Zahlen werden übersprungen */
export function parsePointCloud(text, { max = CLOUD_MAX } = {}) {
  let body = String(text);
  if (/^ply\b/.test(body)) {
    const end = body.indexOf("end_header");
    if (end < 0) throw new Error("PLY ohne Kopf");
    if (/format\s+binary/.test(body.slice(0, end))) throw new Error("Nur PLY im Textformat (ASCII)");
    const n = Number(/element\s+vertex\s+(\d+)/.exec(body.slice(0, end))?.[1] || 0);
    body = body.slice(end + 10).split(/\r?\n/).filter((l) => l.trim()).slice(0, n || undefined).join("\n");
  }
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    if (out.length / 3 >= max) break;
    const t = line.trim();
    if (!t || /^[#/;a-zA-Z]/.test(t)) continue;
    const v = t.split(/[\s,;]+/).slice(0, 3).map(Number);
    // PTS: erste Zeile ist die Anzahl
    if (v.length < 3 || v.some((x) => !Number.isFinite(x))) continue;
    out.push(v[0], v[1], v[2]);
  }
  if (!out.length) throw new Error("Keine Punkte gefunden (je Zeile x y z erwartet)");
  return Float32Array.from(out);
}

export function encodeCloud(f32) {
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeCloud(b64) {
  const s = atob(b64 || ""), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new Float32Array(u8.buffer, 0, Math.floor(u8.length / 4));
}

/** Jeder k-te Punkt */
export function decimateCloud(f32, k) {
  const n = f32.length / 3, step = Math.max(1, Math.round(k)), out = new Float32Array(Math.ceil(n / step) * 3);
  for (let i = 0, j = 0; i < n; i += step, j++) out.set(f32.subarray(3 * i, 3 * i + 3), 3 * j);
  return out;
}

/** Punkte für die Anzeige: Verschiebung und Maßstab des Features angewendet */
export function cloudPoints(f) {
  const p = decodeCloud(f.data), d = (f.offset || [0, 0, 0]).map(Number), s = Number(f.scale) || 1;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { out[i] = p[i] * s + d[0]; out[i + 1] = p[i + 1] * s + d[1]; out[i + 2] = p[i + 2] * s + d[2]; }
  return out;
}

export function cloudBounds(p) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
  return [lo, hi];
}
