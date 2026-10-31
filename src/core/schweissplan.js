// Schweißplan nach EN 1090 (W11): Nähte mit Schweißanweisung (WPS), Prozess, Prüfumfang je Ausführungsklasse und
// Zeilen für Schweißer/Prüfer – als Seite der Fertigungsmappe und als CSV. Reine Rechnung und Texterzeugung.
//
// Im Projekt: project.weldPlan = { exc, supervisor, defaultWps, wps: [{ id, process, material, filler, positions, note }] }.
// Die Naht (Feature »Schweißnaht«) trägt optional wps = id; alle anderen Nähte (Platten, Rippen, Endkappen) bekommen
// die Standard-WPS.

import { WELD_KINDS, WELD_SIDES, weldMass, prepText } from "./weld.js";
import { fmt as fmtNum } from "./expr.js";

export const EXC_LEVELS = ["EXC1", "EXC2", "EXC3", "EXC4"];

/** Schweißprozesse nach ISO 4063 (Auswahl Metallbau) */
export const PROCESSES = {
  135: "135 MAG (Massivdraht)",
  136: "136 MAG (Fülldraht)",
  138: "138 MAG (Metallpulverdraht)",
  141: "141 WIG",
  111: "111 Lichtbogenhand (E-Hand)",
  131: "131 MIG",
};

/**
 * Prüfumfang je Naht (Richtwerte nach EN 1090-2, Tabelle 24, vereinfacht): Sichtprüfung immer 100 %, dazu
 * zerstörungsfreie Prüfung (ZfP) in Prozent der Nähte. Stumpfnähte = HV, V, I.
 */
export function testScope(exc, kind, a = 0) {
  const butt = kind !== "kehl";
  const zfp = {
    EXC1: [0, 0],
    EXC2: [10, a > 12 ? 5 : 0],
    EXC3: [20, a > 12 ? 10 : 5],
    EXC4: [100, a > 12 ? 20 : 10],
  }[exc] || [0, 0];
  const p = butt ? zfp[0] : zfp[1];
  return p ? `VT 100 %, ${butt ? "UT/RT" : "MT/PT"} ${p} %` : "VT 100 %";
}

/** Plan mit gültigen Standardwerten */
export function weldPlanOf(project) {
  const wp = project?.weldPlan || {};
  const wps = Array.isArray(wp.wps) ? wp.wps.filter((x) => x?.id) : [];
  return { exc: EXC_LEVELS.includes(wp.exc) ? wp.exc : "EXC2", supervisor: wp.supervisor || "", wps, defaultWps: wps.some((x) => x.id === wp.defaultWps) ? wp.defaultWps : wps[0]?.id || "" };
}

/**
 * Zeilen des Schweißplans: gleiche WPS, Nahtart, Maß, Seite und Kennzeichen = eine Zeile.
 * welds wie collectWelds (mit wps?). Rückgabe [{ pos, wps, process, kind, a, side, around, field, count, length, mass, parts, test }]
 */
export function weldPlanRows(welds, plan) {
  const map = new Map();
  for (const w of welds) {
    const id = plan.wps.some((x) => x.id === w.wps) ? w.wps : plan.defaultWps;
    const key = [id, w.kind, Math.round(w.a * 10), w.side || "pfeil", !!w.around, !!w.field, w.prep ? prepText(w.kind, w.prep) : ""].join("|");
    const q = w.qty || 1;
    if (!map.has(key)) map.set(key, { wps: id, kind: w.kind, a: w.a, side: w.side || "pfeil", around: !!w.around, field: !!w.field, ...(w.prep ? { prep: w.prep } : {}), count: 0, length: 0, mass: 0, parts: new Set() });
    const r = map.get(key);
    r.count += q;
    r.length += (w.length || 0) * q;
    r.mass += weldMass(w, w.density ?? 7.85) * q;
    if (w.part) r.parts.add(w.part);
  }
  const order = Object.keys(WELD_KINDS);
  return [...map.values()]
    .sort((a, b) => String(a.wps).localeCompare(String(b.wps)) || order.indexOf(a.kind) - order.indexOf(b.kind) || a.a - b.a)
    .map((r, i) => {
      const w = plan.wps.find((x) => x.id === r.wps);
      return { ...r, pos: i + 1, process: w ? PROCESSES[w.process] || w.process || "" : "", parts: [...r.parts].join(", "), test: testScope(plan.exc, r.kind, r.a) };
    });
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nahtText = (r) => `${WELD_KINDS[r.kind].dim}${fmtNum(r.a, 1)} ${WELD_KINDS[r.kind].label}${r.side !== "pfeil" ? " " + WELD_SIDES[r.side] : ""}${r.around ? ", umlaufend" : ""}${r.field ? ", Montage" : ""}${r.prep ? ", " + prepText(r.kind, r.prep) : ""}`;

/** Schweißplan als Seite (A4 quer) für mappeHtml */
export function weldPlanPage({ title = "", number = "", order = "", plan, rows }) {
  const wpsRows = plan.wps.map((w) => `<tr><td>${esc(w.id)}</td><td>${esc(PROCESSES[w.process] || w.process || "")}</td><td>${esc(w.material || "")}</td><td>${esc(w.filler || "")}</td><td>${esc(w.positions || "")}</td><td>${esc(w.note || "")}</td></tr>`).join("");
  const body = rows.map((r) => `<tr><td class="n">${r.pos}</td><td>${esc(nahtText(r))}</td><td>${esc(r.wps || "–")}</td><td>${esc(r.process)}</td><td class="n">${r.count}</td><td class="n">${fmtNum(r.length, 0)}</td><td class="n">${fmtNum(r.mass, 2)}</td><td>${esc(r.parts)}</td><td>${esc(r.test)}</td><td></td><td></td></tr>`).join("");
  const html = `<div class="lst"><h1>Schweißplan</h1><div class="sub">${esc([title, number, order && "Auftrag " + order, "Ausführungsklasse " + plan.exc, plan.supervisor && "Schweißaufsicht: " + plan.supervisor].filter(Boolean).join(" · "))}</div>
${plan.wps.length ? `<h2>Schweißanweisungen (WPS)</h2><table><thead><tr><th>WPS</th><th>Prozess</th><th>Grundwerkstoff</th><th>Zusatzwerkstoff</th><th>Positionen</th><th>Bemerkung</th></tr></thead><tbody>${wpsRows}</tbody></table>` : `<p><b>Keine WPS hinterlegt</b> – vor der Fertigung zuordnen.</p>`}
<h2>Nähte</h2><table><thead><tr><th>Pos</th><th>Naht</th><th>WPS</th><th>Prozess</th><th>Anzahl</th><th>Länge mm</th><th>Schweißgut kg</th><th>Bauteil</th><th>Prüfung</th><th>Schweißer</th><th>Geprüft</th></tr></thead><tbody>${body}</tbody>
<tfoot><tr><td></td><td>Summe</td><td></td><td></td><td class="n">${rows.reduce((a, r) => a + r.count, 0)}</td><td class="n">${fmtNum(rows.reduce((a, r) => a + r.length, 0), 0)}</td><td class="n">${fmtNum(rows.reduce((a, r) => a + r.mass, 0), 2)}</td><td></td><td></td><td></td><td></td></tr></tfoot></table>
<p class="sub" style="margin-top:3mm">Prüfumfang: Richtwerte nach EN 1090-2, Tabelle 24 (vereinfacht) – mit der Schweißaufsicht abstimmen. VT = Sichtprüfung, MT/PT = Magnetpulver/Eindringprüfung, UT/RT = Ultraschall/Durchstrahlung.</p></div>`;
  return { html, width: 297, height: 210 };
}

/** Schweißplan als CSV (Semikolon, deutsches Zahlenformat) */
export function weldPlanCsv(rows, plan, title = "") {
  const f = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
  const all = [["Schweißplan", title, plan.exc, plan.supervisor], [], ["Pos", "Naht", "WPS", "Prozess", "Anzahl", "Länge mm", "Schweißgut kg", "Bauteil", "Prüfung"],
    ...rows.map((r) => [r.pos, nahtText(r), r.wps, r.process, r.count, f(r.length, 0), f(r.mass, 3), r.parts, r.test])];
  return "﻿" + all.map((r) => r.join(";")).join("\r\n") + "\r\n";
}
