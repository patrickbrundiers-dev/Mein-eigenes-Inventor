// Dynamische Maßeingabe beim Zeichnen (wie Inventor): Werte direkt tippen, Tab wechselt das Feld, Enter bestätigt
import { evaluate } from "./expr.js";

/** Neuer Eingabezustand mit den genannten Feldern (z. B. ["w", "h"] fürs Rechteck) */
export function createDynInput(keys) {
  return { fields: keys.map((key) => ({ key, text: "", error: null })), active: 0, fresh: true };
}

/**
 * Tastendruck verarbeiten. Ergebnis: "commit" (Enter), "handled" (Eingabe geändert) oder false (nicht zuständig).
 * Das erste Zeichen nach einem Feldwechsel ersetzt den alten Text (wie ein markiertes Eingabefeld).
 */
export function dynKey(st, key, { shift = false } = {}) {
  const f = st.fields[st.active];
  if (key === "Enter") return "commit";
  if (key === "Tab") {
    const n = st.fields.length;
    st.active = (st.active + (shift ? n - 1 : 1)) % n;
    st.fresh = true;
    return "handled";
  }
  if (key === "Backspace") {
    f.text = st.fresh ? "" : f.text.slice(0, -1);
    st.fresh = false;
    f.error = null;
    return "handled";
  }
  if (key.length === 1 && key !== " ") {
    f.text = st.fresh ? key : f.text + key;
    st.fresh = false;
    f.error = null;
    return "handled";
  }
  return false;
}

/** Hat der Benutzer überhaupt etwas eingetippt? */
export const dynTyped = (st) => !!st && st.fields.some((f) => f.text.trim() !== "");

/**
 * Werte der Felder: getippte Ausdrücke auswerten, sonst Mauswert (live) nehmen.
 * Liefert { values, exprs, ok }; exprs[key] ist nur bei getippten Feldern gesetzt. Fehler landen in field.error.
 */
export function dynValues(st, live, scope = {}) {
  const values = {}, exprs = {};
  let ok = true;
  for (const f of st.fields) {
    const t = f.text.trim();
    if (!t) { values[f.key] = live[f.key]; continue; }
    try {
      const v = evaluate(t, scope);
      if (!(v > 0)) throw new Error("Wert muss > 0 sein");
      values[f.key] = v;
      exprs[f.key] = t;
      f.error = null;
    } catch (err) {
      f.error = err.message;
      values[f.key] = live[f.key];
      ok = false;
    }
  }
  return { values, exprs, ok };
}

const sgn = (d) => (d < 0 ? -1 : 1);

/** Gezogene Breite/Höhe eines Rechtecks aus Startpunkt und Maus (bei »aus Mitte« volle Breite) */
export function rectLive(a, cur, center = false) {
  const k = center ? 2 : 1;
  return { w: Math.abs(cur.x - a.x) * k, h: Math.abs(cur.y - a.y) * k };
}

/** Gegenecke (bzw. Ecke bei »aus Mitte«) für Breite w und Höhe h; die Richtung kommt von der Maus */
export function rectCorner(a, cur, w, h, center = false) {
  const k = center ? 0.5 : 1;
  return { x: a.x + sgn(cur.x - a.x) * w * k, y: a.y + sgn(cur.y - a.y) * h * k };
}

/**
 * Rechteck in die Skizze schreiben: vier Linien mit H/V-Bedingungen, bei »aus Mitte« mit Diagonale und Mittelpunkt.
 * usePoint(sk, sn, cons) liefert die Punkt-ID (Fangen), uid(prefix) neue IDs.
 * dims = { w?, h? } als Ausdruck: Breite wird an der oberen, Höhe an der rechten Kante bemaßt (Bildschirmsicht über screen).
 */
export function buildRect(sk, a, b, { center = false, construction = false, uid, usePoint, dims = {}, screen = { xRight: true, yUp: true }, gap = 10 } = {}) {
  const cons = [];
  let corners;
  if (center) {
    const dx = b.x - a.x, dy = b.y - a.y;
    corners = [[a.x - dx, a.y - dy], [a.x + dx, a.y - dy], [a.x + dx, a.y + dy], [a.x - dx, a.y + dy]];
  } else corners = [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]];
  const ids = corners.map((c, i) => {
    if (!center && i === 0) return usePoint(sk, a, cons);
    if (!center && i === 2) return usePoint(sk, b, cons);
    const id = uid("p");
    sk.points.push({ id, x: c[0], y: c[1] });
    return id;
  });
  const lines = [0, 1, 2, 3].map((i) => {
    const id = uid("l");
    sk.entities.push({ id, type: "line", p1: ids[i], p2: ids[(i + 1) % 4], construction });
    return id;
  });
  cons.push({ id: uid("k"), type: "horizontal", e: lines[0] }, { id: uid("k"), type: "horizontal", e: lines[2] }, { id: uid("k"), type: "vertical", e: lines[1] }, { id: uid("k"), type: "vertical", e: lines[3] });
  if (center) {
    const cid = usePoint(sk, a, cons);
    const diag = uid("l");
    sk.entities.push({ id: diag, type: "line", p1: ids[0], p2: ids[2], construction: true });
    cons.push({ id: uid("k"), type: "midpoint", p: cid, e: diag });
  }
  // Kanten 0 und 2 liegen bei y = corners[0][1] bzw. corners[2][1], Kanten 1 und 3 bei x = corners[1][0] bzw. corners[0][0]
  if (dims.w != null) {
    const upper = (corners[2][1] > corners[0][1]) === screen.yUp ? 2 : 0;
    const P = [ids[upper], ids[(upper + 1) % 4]];
    cons.push({ id: uid("m"), type: "distance", p: P[0], q: P[1], dir: "h", value: String(dims.w), labelOffset: screen.yUp ? gap : -gap });
  }
  if (dims.h != null) {
    const right = (corners[1][0] > corners[0][0]) === screen.xRight ? 1 : 3;
    const P = [ids[right], ids[(right + 1) % 4]];
    cons.push({ id: uid("m"), type: "distance", p: P[0], q: P[1], dir: "v", value: String(dims.h), labelOffset: screen.xRight ? gap : -gap });
  }
  sk.constraints.push(...cons);
  return { points: ids, lines };
}
