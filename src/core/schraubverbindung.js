// Schraubenverbindung wie im Konstruktions-Assistenten (Werkzeuge Stufe 50): Klemmlänge aus den Körpern entlang
// der Schraubenachse, Schraubenlänge als Vorzugslänge, Scheiben und Mutter wählbar, Durchgangs- oder Gewindebohrung.
// Reine Rechnung; die Körper und Bohrungen baut src/kernel/build.js.

import { NORM_THREADS, BOLT_LENGTHS } from "./normteile.js";
import { CLEARANCE, THREADS } from "./sections.js";

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

export const BOLT_JOINTS = [["durchsteck", "Durchsteckverbindung (Mutter)"], ["gewinde", "Gewinde im letzten Teil"]];

export function defaultSchraubverbindung(sketch = "") {
  return { type: "schraubverbindung", sketch, direction: "umgekehrt", joint: "durchsteck", bolt: "schraube4017", size: "M12", grade: "8.8", galv: false, washerHead: true, washerNut: true, hole: true };
}

/**
 * Klemmpaket aus Abschnitten [t0, t1] entlang der Achse (Körper, auch mit Luft dazwischen): Anfang am ersten,
 * Ende am letzten Teil. Für »gewinde« endet das Klemmpaket am Anfang des letzten Teils (dort sitzt das Gewinde).
 */
export function clampStack(spans, joint = "durchsteck") {
  const s = spans.filter(([a, b]) => b - a > 1e-6).sort((p, q) => p[0] - q[0]);
  // berührende Abschnitte zusammenfassen (verschweißte oder aufeinanderliegende Teile desselben Körpers)
  const merged = [];
  for (const [a, b] of s) {
    const last = merged.at(-1);
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  if (!merged.length) throw new Error("Schraubenverbindung: Auf der Achse liegt kein Körper – Punkt und Richtung prüfen");
  const start = merged[0][0], end = merged.at(-1)[1];
  if (joint === "gewinde") {
    if (s.length < 2) throw new Error("Schraubenverbindung mit Gewinde braucht mindestens zwei Teile auf der Achse (das letzte hat das Gewinde)");
    const last = s.at(-1);
    return { start, clamp: last[0] - start, grip: last[1] - last[0], end, parts: s.length };
  }
  return { start, clamp: end - start, end, parts: s.length };
}

/**
 * Teile einer Verschraubung entlang z (Klemmpaket z = 0 … clamp). opts: kind (ISO 4017/4014), washerHead, washerNut,
 * joint »durchsteck« (Mutter, Länge ≥ Klemmlänge + Scheiben + Mutter + 2 Gänge) oder »gewinde« (Einschraubtiefe
 * mindestens 1 · d und höchstens die Dicke des letzten Teils, grip). Rückgabe { length, parts, need, engage? }.
 */
export function boltStack(size, clamp, { kind = "schraube4017", washerHead = true, washerNut = true, joint = "durchsteck", grip = 0 } = {}) {
  const t = NORM_THREADS[size];
  if (!t) throw new Error("Unbekannte Gewindegröße: " + size);
  if (!(clamp > 0)) throw new Error("Klemmlänge muss > 0 sein");
  const wh = washerHead ? t.h : 0;
  const parts = [];
  if (washerHead) parts.push({ kind: "scheibe", size, z0: -t.h });
  if (joint === "gewinde") {
    const min = clamp + wh + t.d, max = clamp + wh + grip - t.P;
    const fits = BOLT_LENGTHS.filter((l) => l >= min - 1e-9 && l <= max + 1e-9);
    if (!fits.length) throw new Error(`Schraubenverbindung: keine Vorzugslänge zwischen ${fmt(min)} und ${fmt(max)} mm – das Gewindeteil (${fmt(grip)} mm) ist für ${size} zu dünn`);
    const length = fits[0];
    parts.unshift({ kind, size, length, z0: -wh });
    return { length, parts, need: min, engage: length - clamp - wh };
  }
  const wn = washerNut ? t.h : 0;
  const need = clamp + wh + wn + t.m + 2 * t.P;
  const length = BOLT_LENGTHS.find((l) => l >= need - 1e-9) ?? Math.ceil(need / 10) * 10;
  parts.unshift({ kind, size, length, z0: -wh });
  if (washerNut) parts.push({ kind: "scheibe", size, z0: clamp });
  parts.push({ kind: "mutter", size, z0: clamp + wn });
  return { length, parts, need };
}

/** Bohrungen entlang z: Durchgang Ø ISO 273 mittel über das Klemmpaket, bei »gewinde« Kernloch im letzten Teil */
export function boltHoles(size, stack, set, joint = "durchsteck") {
  const dc = CLEARANCE[size], dk = THREADS[size];
  if (!dc || !dk) throw new Error(`Keine Bohrungsmaße für ${size}`);
  if (joint === "gewinde") return [{ d: dc, z0: -1, z1: stack.clamp }, { d: dk, z0: stack.clamp - 0.01, z1: stack.clamp + set.engage + 2 * NORM_THREADS[size].P }];
  return [{ d: dc, z0: -1, z1: stack.clamp + 1 }];
}
