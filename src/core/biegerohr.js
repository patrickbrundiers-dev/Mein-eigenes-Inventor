// Rohr über Polygonzug mit Biegeradius (MegaCAD-Abgleich M4, „RohrConnect“): Mittellinie aus Geraden und Bögen,
// Biegeliste im üblichen Format Länge / Drehung / Winkel (L-R-A) und Abwicklungslänge für den Rohrlaser.
// Reine Rechnung; den Körper baut src/kernel/build.js (Kreis entlang der Mittellinie gezogen).
//
// Abwicklungslänge = Summe der Geraden + Summe der Bögen auf der Mittellinie (R · θ). Beim Rohrbiegen liegt die
// neutrale Faser praktisch auf der Mittellinie; wer mit Zugabe rechnet, trägt sie in der Biegemaschine ein.

import { v3 } from "./geom.js";
import { cornerAngle } from "./profilzug.js";

export const BIEGEROHR_SECTIONS = ["rohr", "rund"];

/** Vorgabe für ein neues Feature: Bügel mit zwei Biegungen in verschiedenen Ebenen */
export function defaultBiegerohr(dims) {
  return {
    type: "biegerohr", section: "rohr", dims, radius: "100",
    points: [
      { x: "0", y: "0", z: "0" },
      { x: "600", y: "0", z: "0", rel: true },
      { x: "0", y: "400", z: "0", rel: true },
      { x: "0", y: "0", z: "300", rel: true },
    ],
  };
}

/**
 * Biegeplan für die Punkte pts (Weltkoordinaten) mit Biegeradius R (Mittellinie) und Rohr-Ø D.
 * Rückgabe: { pieces: [{t: "line", a, b} | {t: "arc", a, m, b}], bends: [{straight, angle, rotation, point}],
 * last (Gerade nach der letzten Biegung), length (Abwicklung), issues: [{level, message}] }.
 * Wirft, wenn ein Segment zu kurz für die Bögen ist oder der Zug umkehrt.
 */
export function planBends(pts, R, D) {
  if (pts.length < 2) throw new Error("Rohr braucht mindestens 2 Punkte");
  if (!(R > 0)) throw new Error("Biegeradius muss > 0 sein");
  const issues = [];
  if (D > 0 && R < D) issues.push({ level: "Warnung", message: `Biegeradius ${fmt(R)} mm kleiner als Rohr-Ø ${fmt(D)} mm – Rohr knickt ein, Biegewerkzeug prüfen` });
  const n = pts.length;
  // je Innenpunkt: Winkel, Tangentenlänge, Tangentenpunkte, Bogenmitte
  const corners = [];
  for (let i = 1; i < n - 1; i++) {
    const ang = cornerAngle(pts[i - 1], pts[i], pts[i + 1]);
    if (ang > 179) throw new Error(`Rohr kehrt an Punkt ${i + 1} um – Punkt verschieben`);
    if (ang < 1e-6) { corners.push(null); continue; }
    const d1 = v3.norm(v3.sub(pts[i], pts[i - 1])), d2 = v3.norm(v3.sub(pts[i + 1], pts[i]));
    const th = (ang * Math.PI) / 180, T = R * Math.tan(th / 2);
    const t1 = v3.sub(pts[i], v3.mul(d1, T)), t2 = v3.add(pts[i], v3.mul(d2, T));
    const c = v3.add(pts[i], v3.mul(v3.norm(v3.sub(d2, d1)), R / Math.cos(th / 2)));
    const m = v3.add(c, v3.mul(v3.norm(v3.sub(pts[i], c)), R));
    corners.push({ i, ang, th, T, t1, t2, m, d1, d2, normal: v3.norm(v3.cross(d1, d2)) });
  }
  // Geraden zwischen den Tangentenpunkten prüfen
  const startOf = (k) => (k === 0 ? pts[0] : corners[k - 1] ? corners[k - 1].t2 : pts[k]);
  const endOf = (k) => (k === n - 2 ? pts[n - 1] : corners[k] ? corners[k].t1 : pts[k + 1]);
  const straights = [];
  for (let k = 0; k < n - 1; k++) {
    const segLen = v3.dist(pts[k], pts[k + 1]);
    const need = (corners[k - 1]?.T || 0) + (corners[k]?.T || 0);
    if (need > segLen + 1e-6) throw new Error(`Segment ${k + 1} (${fmt(segLen)} mm) zu kurz für den Biegeradius: mindestens ${fmt(need)} mm`);
    straights.push(segLen - need);
  }
  const pieces = [];
  for (let k = 0; k < n - 1; k++) {
    if (straights[k] > 1e-6) pieces.push({ t: "line", a: startOf(k), b: endOf(k) });
    const c = corners[k];
    if (c) pieces.push({ t: "arc", a: c.t1, m: c.m, b: c.t2 });
  }
  // Biegeliste: Gerade vor der Biegung, Biegewinkel, Drehung der Biegeebene gegenüber der vorigen
  const bends = [];
  let acc = 0, prev = null;
  for (let k = 0; k < n - 1; k++) {
    acc += straights[k];
    const c = corners[k];
    if (!c) continue;
    let rot = 0;
    if (prev) {
      const ax = c.d1; // Achse der Geraden zwischen beiden Biegungen
      rot = (Math.atan2(v3.dot(v3.cross(prev.normal, c.normal), ax), v3.dot(prev.normal, c.normal)) * 180) / Math.PI;
    }
    bends.push({ straight: acc, angle: c.ang, rotation: round1(rot), point: c.i + 1, arc: R * c.th });
    prev = c;
    acc = 0;
    if (D > 0 && bends.length > 1 && bends[bends.length - 1].straight < D - 1e-6)
      issues.push({ level: "Hinweis", message: `Gerade vor Biegung ${bends.length} nur ${fmt(bends[bends.length - 1].straight)} mm – Spannlänge der Biegemaschine prüfen` });
  }
  const length = straights.reduce((a, s) => a + s, 0) + bends.reduce((a, b) => a + b.arc, 0);
  return { pieces, bends, last: acc, length, issues };
}

/** Biegeliste als CSV (Semikolon, deutsches Zahlenformat) */
export function bendListCsv(plan, title = "") {
  const f = (x) => fmt(x).replace(/\./g, ",");
  const rows = [["Nr", "Gerade vor mm", "Drehung °", "Biegewinkel °", "Bogenlänge mm"], ...plan.bends.map((b, i) => [i + 1, f(b.straight), f(b.rotation), f(b.angle), f(b.arc)]), ["Ende", f(plan.last), "", "", ""], [], ["Abwicklungslänge mm", f(plan.length)]];
  if (title) rows.unshift([title]);
  return "﻿" + rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

const round1 = (x) => Math.round(x * 10) / 10 || 0;
const fmt = (x) => String(Math.round(x * 10) / 10);
