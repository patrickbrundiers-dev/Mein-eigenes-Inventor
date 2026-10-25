// Schweißbaugruppe (Werkzeuge Stufe 53): Baugruppe als ein geschweißtes Bauteil. Das erste Feature holt alle
// Komponenten als Körper (an ihrer Lage), danach folgen die drei Phasen wie in Inventor: Vorbereitung (Features vor
// der ersten Naht, z. B. Fugen anfasen), Schweißnähte (Nähte, auf Wunsch als Körper) und Nachbearbeitung (alles nach
// der ersten Naht, wirkt auf Teile und Nähte, z. B. Bohrungen durch die fertige Gruppe). Reine Rechnung.

import { v3 } from "./geom.js";

export const defaultSchweissbaugruppe = (source) => ({ type: "schweissbaugruppe", source });

export const WELD_PHASES = { vorbereitung: "Vorbereitung", naht: "Schweißnähte", nachbearbeitung: "Nachbearbeitung" };

/** Phase jedes Features einer Schweißbaugruppe (Map id → Phase); leer, wenn das Bauteil keine ist */
export function weldPhases(features) {
  const out = new Map();
  const s = features.findIndex((f) => f.type === "schweissbaugruppe");
  if (s < 0) return out;
  let seen = false;
  features.forEach((f, i) => {
    if (i <= s || f.suppressed) return;
    if (f.type === "naht") { seen = true; out.set(f.id, "naht"); } else out.set(f.id, seen ? "nachbearbeitung" : "vorbereitung");
  });
  return out;
}

/** Anzahl Features je Phase, für die Anzeige */
export function phaseCounts(features) {
  const c = { vorbereitung: 0, naht: 0, nachbearbeitung: 0 };
  for (const p of weldPhases(features).values()) c[p]++;
  return c;
}

/**
 * Querschnitt einer Kehlnaht als Körper: n1, n2 = Außennormalen der beiden Flächen (verschiedener Teile), die sich
 * an der Kante treffen; a = Nahtdicke (Kehlnahtdicke, Höhe des gleichschenkligen Dreiecks). Rückgabe der
 * Schenkelrichtungen (tA auf Fläche 1, tB auf Fläche 2), der Schenkellänge z und der Querschnittsfläche.
 */
export function beadSection(n1, n2, a) {
  if (!(a > 0)) throw new Error("Nahtdicke muss > 0 sein");
  n1 = v3.norm(n1); n2 = v3.norm(n2);
  const c = v3.dot(n1, n2);
  if (Math.abs(c) > 0.95) throw new Error("Flächen an der Kante bilden keine Kehle (parallel)");
  const tA = v3.norm(v3.sub(n2, v3.mul(n1, c))), tB = v3.norm(v3.sub(n1, v3.mul(n2, c)));
  const theta = Math.acos(Math.max(-1, Math.min(1, v3.dot(tA, tB))));
  const z = a / Math.cos(theta / 2);
  return { tA, tB, z, theta: (theta * 180) / Math.PI, area: 0.5 * z * z * Math.sin(theta) };
}

/** Bestes Flächenpaar an einer Kante: verschiedene Körper, möglichst rechtwinklig. faces: [{body, n}] */
export function filletPair(faces) {
  let best = null, bd = Infinity;
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    if (faces[i].body === faces[j].body) continue;
    const d = Math.abs(v3.dot(v3.norm(faces[i].n), v3.norm(faces[j].n)));
    if (d > 0.95) continue;
    if (d < bd) { bd = d; best = [faces[i], faces[j]]; }
  }
  return best;
}
