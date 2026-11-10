// Laufzettel je Teil (Z2): Arbeitsgänge einer Position aus dem Modell (Zuschnitt, Bohren, Biegen/Kanten, Schweißen,
// Oberfläche, Kontrolle), als Zettel mit QR-Code zum Abhaken und als Fertigungsstand am Dokument
// (doc.fertigungsstand = { [partId]: { [Arbeitsgang]: "JJJJ-MM-TT" } }). Reine Rechnung und Texterzeugung.

import { fmt as fmtNum } from "./expr.js";
import { qrSvg } from "./qr.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Arbeitsgänge in Fertigungsreihenfolge */
export const OPS = ["Sägen", "Rohrlaser", "Laser/Brennen", "Bohren", "Biegen", "Kanten", "Rollen", "Schweißen", "Feuerverzinken", "Beschichten", "Kontrolle"];

/**
 * Arbeitsgänge aus den Körpern eines Bauteils.
 * bodies: Körper des Ergebnisses (Normteile werden übersprungen); finish: Oberflächen-Art (roh, verzinkt, pulver, duplex, lack);
 * welds: Anzahl der Nähte am Teil.
 * Rückgabe [{ op, detail }] in der Reihenfolge von OPS; »Kontrolle« steht immer am Ende.
 */
export function partOps(bodies, { finish = "roh", welds = 0 } = {}) {
  const acc = new Map();
  const add = (op, line) => { const a = acc.get(op) || []; if (line) a.push(line); acc.set(op, a); };
  const members = new Map();
  let plates = 0, holes = 0, drills = 0, sheetBends = 0, rolls = 0, tubeBends = 0, knicks = 0, laserCut = false, minT = Infinity, maxT = 0;
  for (const b of bodies || []) {
    const m = b.meta || {};
    if (m.norm) continue;
    if (b.kind === "member") {
      const laser = !!(m.contours?.length || m.coped || m.endCuts || m.miterParts || m.knicks);
      laserCut ||= laser;
      const ends = [m.miterStart || 0, m.miterEnd || 0].map((x) => Math.round(x * 10) / 10);
      const key = [laser ? "Rohrlaser" : "Sägen", m.section || m.profileId || "Profil", Math.round((m.length || 0) * 10) / 10, ends.join("/")].join("|");
      const g = members.get(key) || { op: laser ? "Rohrlaser" : "Sägen", section: m.section || m.profileId || "Profil", length: m.length || 0, ends, n: 0 };
      g.n++;
      members.set(key, g);
      if (!laser) drills += m.drills || 0;
      if (m.bends?.length) tubeBends += m.bends.length;
      if (m.knicks) knicks++;
      if (m.rolled) rolls++;
      continue;
    }
    if (m.plate || m.sheet) {
      plates++;
      const t = m.plate?.t ?? m.sheet?.t;
      if (t > 0) { minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
      holes += m.plate?.holes || 0;
      if (m.sheet?.roll) rolls++;
      else sheetBends += m.sheet?.bends?.length || 0;
      continue;
    }
    drills += m.drills || 0;
  }
  for (const g of members.values()) add(g.op, `${g.n} × ${g.section}, L = ${fmtNum(g.length, 1)} mm${g.ends[0] || g.ends[1] ? `, Gehrung ${fmtNum(g.ends[0], 1)}° / ${fmtNum(g.ends[1], 1)}°` : ""}`);
  if (plates) add("Laser/Brennen", `${plates} Platte${plates === 1 ? "" : "n"}/Blech${minT < Infinity ? `, t = ${fmtNum(minT, 1)}${maxT > minT ? "–" + fmtNum(maxT, 1) : ""} mm` : ""}${holes ? `, ${holes} Bohrung${holes === 1 ? "" : "en"} mitgeschnitten` : ""}`);
  if (drills) add("Bohren", `${drills} Bohrung${drills === 1 ? "" : "en"} am Profil`);
  if (tubeBends) add("Biegen", `${tubeBends} Biegung${tubeBends === 1 ? "" : "en"} (Biegeliste)`);
  if (knicks) add("Biegen", `${knicks} Knickrahmen knicken`);
  if (sheetBends) add("Kanten", `${sheetBends} Kantung${sheetBends === 1 ? "" : "en"} (Biegefolge)`);
  if (rolls) add("Rollen", `${rolls} Teil${rolls === 1 ? "" : "e"} rollen/walzen (Rollbiegeliste)`);
  if (welds > 0) add("Schweißen", `${welds} ${welds === 1 ? "Naht" : "Nähte"} laut Zeichnung`);
  if (finish === "verzinkt" || finish === "duplex") add("Feuerverzinken", "Entlüftung/Ablauf prüfen");
  if (finish === "pulver" || finish === "duplex" || finish === "lack") add("Beschichten", finish === "lack" ? "lackieren" : "pulverbeschichten");
  add("Kontrolle", "Maße und Vollständigkeit prüfen");
  return OPS.filter((op) => acc.has(op)).map((op) => ({ op, detail: acc.get(op).join("; ") }));
}

/** Fortschritt einer Position: { done, total, pct, next } (next = erster offener Arbeitsgang) */
export function progressOf(ops, done = {}) {
  const total = ops.length, n = ops.filter((o) => done?.[o.op]).length;
  return { done: n, total, pct: total ? Math.round((100 * n) / total) : 0, next: ops.find((o) => !done?.[o.op])?.op || null };
}

/** Kurzer Text für Modellbaum und Listen: »3/5 · weiter: Schweißen« bzw. »fertig« */
export function progressText(p) {
  if (!p || !p.total || !p.done) return "";
  return p.done >= p.total ? "✓ fertig" : `${p.done}/${p.total} · weiter: ${p.next}`;
}

/** Text im QR-Code des Laufzettels (jedes Handy liest ihn ohne App) */
export function laufzettelQr({ order = "", project = "", pos, name, number = "", qty = 1 }) {
  return ["PBCAD Laufzettel", order && "Auftrag " + order, project, `Pos ${pos} · ${name}`, number && "Nr. " + number, `${qty} Stk`].filter(Boolean).join("\n");
}

/**
 * Laufzettel als Seiten für mappeHtml (A5 quer, eine Seite je Position).
 * items: [{ pos, name, number, qty, material, finish, mass, ops, done, image (data-URL oder SVG, optional) }]
 */
export function laufzettelPages(items, { order = "", project = "", date = new Date().toLocaleDateString("de-DE") } = {}) {
  return items.map((it) => {
    const rows = it.ops.map((o) => {
      const d = it.done?.[o.op];
      return `<tr><td>${d ? "☑" : "☐"}</td><td><b>${esc(o.op)}</b></td><td>${esc(o.detail)}</td><td>${d ? esc(new Date(d).toLocaleDateString("de-DE")) : ""}</td><td></td></tr>`;
    }).join("");
    const img = it.image ? (String(it.image).startsWith("<svg") ? it.image : `<img src="${esc(it.image)}" style="width:100%;height:100%;object-fit:contain">`) : "";
    const html = `<div class="lst" style="padding:7mm 8mm"><div style="display:flex;gap:4mm;align-items:flex-start">
<div style="flex:none">${qrSvg(laufzettelQr({ order, project, ...it }), 26)}</div>
<div style="flex:1;min-width:0"><div class="sub" style="margin:0">${esc(["Laufzettel", order && "Auftrag " + order, project, date].filter(Boolean).join(" · "))}</div>
<h1 style="margin:1mm 0">Pos ${esc(it.pos)} · ${esc(it.name)}</h1>
<div>${esc([it.number && "Nr. " + it.number, `${it.qty} Stk`, it.material, it.finish, Number.isFinite(it.mass) && it.mass > 0 ? fmtNum(it.mass, 1) + " kg/Stk" : ""].filter(Boolean).join(" · "))}</div></div>
${img ? `<div style="flex:none;width:52mm;height:34mm;border:0.2mm solid #888">${img}</div>` : ""}</div>
<table style="margin-top:3mm"><thead><tr><th style="width:7mm">✓</th><th style="width:28mm">Arbeitsgang</th><th>Angabe</th><th style="width:20mm">Datum</th><th style="width:22mm">Name</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return { html, width: 210, height: 148 };
  });
}
