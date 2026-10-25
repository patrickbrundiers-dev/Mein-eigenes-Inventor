// Automatische Skizzenbedingungen beim Zeichnen (über horizontal/vertikal hinaus). Ohne DOM.
// Liefert Vorschläge samt eingerastetem Endpunkt; ob sie gesetzt werden, entscheidet der Aufrufer
// (Einstellungen, Strg gedrückt, Redundanzprüfung).
import { arcGeometry } from "./sketch.js";

const DEG = Math.PI / 180;
const norm = (a) => { a %= Math.PI; return a < 0 ? a + Math.PI : a; }; // Richtung ohne Vorzeichen, [0, π)
const angDiff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return Math.min(d, Math.PI - d); };

/**
 * Neue Linie von a nach b (lokal): parallel/senkrecht zu bestehender Linie, tangential am Bogenende,
 * gleich lang wie die Vorgängerlinie. a.pointId = Startpunkt (falls an bestehendem Punkt).
 * opts: {tolDeg, tolLen (lokale Einheit), kinds: {parallel, tangent, equal}}
 * -> {b, glyph, cons: [{type, ...}]} oder null
 */
export function inferLine(sk, a, b, { tolDeg = 2.5, tolLen = 0, kinds = {} } = {}) {
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len < 1e-9 || b.pointId) return null;
  const ang = Math.atan2(dy, dx);
  const tol = tolDeg * DEG;
  const at = (phi, L = len) => ({ ...b, x: a.x + L * Math.cos(phi), y: a.y + L * Math.sin(phi), on: null, mid: null });
  const lines = sk.entities.filter((e) => e.type === "line" && !e.construction && !e.origin);
  const lineAng = (e) => { const p = P.get(e.p1), q = P.get(e.p2); return Math.atan2(q.y - p.y, q.x - p.x); };
  // Richtung so wählen, dass sie der Zeichenrichtung am nächsten liegt
  const snapDir = (phi) => (Math.cos(phi - ang) >= 0 ? phi : phi + Math.PI);
  let best = null;
  if (kinds.tangent !== false && a.pointId) {
    for (const e of sk.entities.filter((x) => x.type === "arc" && !x.construction && (x.p1 === a.pointId || x.p2 === a.pointId))) {
      const c = P.get(e.c), p = P.get(a.pointId);
      const tdir = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI / 2;
      const d = angDiff(tdir, ang);
      if (d < tol && (!best || d < best.d)) best = { d, phi: snapDir(tdir), glyph: "T", cons: [{ type: "tangentAt", e1: e.id, p: a.pointId }] };
    }
  }
  if (!best && kinds.parallel !== false) {
    // zuerst die Linie am Startpunkt (Vorgänger), dann alle anderen
    const prev = a.pointId ? lines.filter((e) => e.p1 === a.pointId || e.p2 === a.pointId) : [];
    const order = [...prev, ...lines.filter((e) => !prev.includes(e))];
    for (const e of order) {
      const la = lineAng(e);
      if (angDiff(la, 0) < 1e-6 || angDiff(la, Math.PI / 2) < 1e-6) continue; // achsparallel: H/V reicht
      for (const [type, phi, glyph] of [["parallel", la, "∥"], ["perpendicular", la + Math.PI / 2, "⊥"]]) {
        const d = angDiff(phi, ang);
        if (d < tol && (!best || d < best.d - 1e-9)) best = { d, phi: snapDir(phi), glyph, cons: [{ type, e2: e.id }] };
      }
      if (best && prev.includes(e)) break;
    }
  }
  let L = len;
  const cons = best ? [...best.cons] : [];
  let glyph = best?.glyph || "";
  if (kinds.equal !== false && tolLen > 0 && a.pointId) {
    const prev = lines.find((e) => e.p1 === a.pointId || e.p2 === a.pointId);
    if (prev) {
      const pl = Math.hypot(P.get(prev.p2).x - P.get(prev.p1).x, P.get(prev.p2).y - P.get(prev.p1).y);
      if (Math.abs(pl - len) < tolLen) { L = pl; cons.push({ type: "equal", e2: prev.id }); glyph += "="; }
    }
  }
  if (!cons.length) return null;
  return { b: at(best ? best.phi : ang, L), glyph, cons };
}

/** Neuer Kreis um c mit Radius r: gleicher Radius wie ein bestehender Kreis/Bogen (innerhalb tolR) */
export function inferCircle(sk, c, r, { tolR = 0, kinds = {} } = {}) {
  if (kinds.equal === false || !(tolR > 0)) return null;
  const P = new Map(sk.points.map((p) => [p.id, p]));
  let best = null;
  for (const e of sk.entities) {
    if (e.construction || (e.type !== "circle" && e.type !== "arc")) continue;
    const re = e.type === "circle" ? e.r : arcGeometry(P.get(e.c), P.get(e.p1), P.get(e.p2)).r;
    const d = Math.abs(re - r);
    if (d < tolR && (!best || d < best.d)) best = { d, r: re, e: e.id };
  }
  return best ? { r: best.r, glyph: "=", cons: [{ type: "equal", e2: best.e }] } : null;
}
