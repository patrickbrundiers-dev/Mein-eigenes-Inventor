// 3D-Maus (SpaceMouse/SpaceNavigator) über WebHID: Berichte lesen und in Ansichtsbewegung umrechnen (SolidCraft: Einstellungen → 3D-Maus).
// Reine Rechenfunktionen – das Gerät selbst bindet src/ui/maus3d.js an.

/** WebHID-Filter: 3Dconnexion (0x256f) und ältere Logitech-3D-Mäuse (0x046d, Multi-Axis-Controller) */
export const SPACE_FILTERS = [{ vendorId: 0x256f }, { vendorId: 0x046d, usagePage: 1, usage: 8 }];

export const NULL_STATE = Object.freeze({ t: [0, 0, 0], r: [0, 0, 0], buttons: 0 });

/**
 * Eingabebericht auswerten. Bericht 1: Verschiebung X/Y/Z (je int16, little endian), bei neuen Geräten
 * gleich danach Drehung; Bericht 2: Drehung; Bericht 3: Tasten als Bitmaske.
 */
export function parseReport(reportId, bytes, prev = NULL_STATE) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes);
  const i16 = (o) => { const v = b[o] | (b[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; };
  const out = { t: [...prev.t], r: [...prev.r], buttons: prev.buttons };
  if (reportId === 1 && b.length >= 6) {
    out.t = [i16(0), i16(2), i16(4)];
    if (b.length >= 12) out.r = [i16(6), i16(8), i16(10)];
  } else if (reportId === 2 && b.length >= 6) out.r = [i16(0), i16(2), i16(4)];
  else if (reportId === 3) { let m = 0; for (let i = 0; i < Math.min(4, b.length); i++) m |= b[i] << (8 * i); out.buttons = m >>> 0; }
  return out;
}

/**
 * Gerätezustand → Bewegung je Sekunde.
 * opts: {sens (Faktor, 1 = normal), dead (Totzone 0..1), mode ("alles" | "drehen" | "schwenken"), dominant (nur stärkste Achse),
 *        invert: {pan, zoom, rot}, cal: {t:[..], r:[..]} Nullpunkt aus der Kalibrierung, sketch (nur Schwenken/Zoomen)}
 * Rückgabe {pan:[x, y] (Bruchteil der halben Ansichtshöhe je Sekunde), zoom (Faktor-Exponent je Sekunde), turn:[gier, nick] in °/s, roll °/s}
 */
export function motion(state, opts = {}) {
  const sens = opts.sens ?? 1, dead = opts.dead ?? 0.08, FULL = 350;
  const cal = opts.cal || { t: [0, 0, 0], r: [0, 0, 0] };
  const norm = (v, c) => { const x = (v - c) / FULL; const a = Math.abs(x); return a < dead ? 0 : Math.sign(x) * Math.min(1, (a - dead) / (1 - dead)); };
  let t = state.t.map((v, i) => norm(v, cal.t[i] || 0)), r = state.r.map((v, i) => norm(v, cal.r[i] || 0));
  const mode = opts.sketch ? "schwenken" : opts.mode || "alles";
  if (mode === "drehen") t = [0, 0, 0];
  if (mode === "schwenken") r = [0, 0, 0];
  if (opts.dominant) {
    const all = [...t, ...r], k = all.reduce((bi, v, i) => (Math.abs(v) > Math.abs(all[bi]) ? i : bi), 0);
    t = t.map((v, i) => (i === k ? v : 0)); r = r.map((v, i) => (i + 3 === k ? v : 0));
  }
  const inv = opts.invert || {};
  const sp = inv.pan ? -1 : 1, sz = inv.zoom ? -1 : 1, sr = inv.rot ? -1 : 1;
  const curve = (v) => v * Math.abs(v); // feinfühlig um die Mitte
  return {
    pan: [curve(t[0]) * 1.6 * sens * sp, -curve(t[2]) * 1.6 * sens * sp],
    zoom: -curve(t[1]) * 2.2 * sens * sz,
    turn: [curve(r[2]) * 160 * sens * sr, curve(r[0]) * 160 * sens * sr],
    roll: curve(r[1]) * 120 * sens * sr,
  };
}

/** Bewegt sich etwas? */
export function isMoving(m) { return !!(m.pan[0] || m.pan[1] || m.zoom || m.turn[0] || m.turn[1] || m.roll); }
