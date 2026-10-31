// Montageplan (P7): Übersicht einer Baugruppe für die Baustelle – Grundriss und Ansicht mit Positionsnummern je
// Bauteil, Gewicht je Teil (Kranplanung), Verbindungsliste mit den Schrauben je Knoten. Reine Rechnung ohne DOM.
//
// Eingang: rows wie bomRows (pos, name, number, qty, mass, part) und Vorkommen [{ part, name, matrix, bodies }].
// Knoten: Schraubengarnituren (Schrauben, Muttern, Scheiben), die höchstens join mm auseinander liegen.

import { matApply } from "./geom.js";
import { NORM_FAMILIES } from "./normlib.js";
import { worldBox } from "./ankerplan.js";

const r1 = (x) => Math.round(x * 10) / 10;
const mm = (x) => String(Math.round(x)).replace("-", "−");
const kg = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1).replace(".", ",") : "–");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BOLT_CATS = new Set(["schrauben", "muttern", "scheiben"]);

/** Ist der Körper Teil einer Schraubengarnitur? */
export const isBoltPart = (b) => !!b?.meta?.norm && BOLT_CATS.has(NORM_FAMILIES[b.meta.norm.kind]?.cat);
const isScrew = (b) => NORM_FAMILIES[b.meta.norm.kind]?.cat === "schrauben";

/**
 * Montageplan-Daten. Rückgabe { items: [{ pos, name, box, mass, center }], nodes: [{ id, center, positions, parts:
 * [{ designation, qty }], screws }], total, heaviest }
 */
export function montagePlan(rows, occ, { join = 250 } = {}) {
  const posOf = new Map(rows.filter((r) => r.part).map((r) => [r.part.id, r]));
  const items = [], bolts = [];
  for (const o of occ || []) {
    const row = posOf.get(o.part?.id);
    const own = [];
    for (const b of o.bodies || []) {
      if (!b.props?.bbox) continue;
      if (isBoltPart(b)) {
        const w = worldBox(b.props.bbox, o.matrix);
        bolts.push({ p: w.min.map((v, k) => (v + w.max[k]) / 2), box: w, designation: b.meta.norm.designation || b.name, screw: isScrew(b) });
      } else if (!b.meta?.norm) own.push(b);
    }
    if (!row || !own.length) continue;
    const boxes = own.map((b) => worldBox(b.props.bbox, o.matrix));
    const box = { min: [0, 1, 2].map((k) => Math.min(...boxes.map((x) => x.min[k]))), max: [0, 1, 2].map((k) => Math.max(...boxes.map((x) => x.max[k]))) };
    // Schwerpunkt aus den Körperschwerpunkten (nach Volumen gewichtet)
    let V = 0, c = [0, 0, 0];
    for (const b of own) {
      const v = b.props.volume, cc = b.props.center;
      if (!(v > 0) || !cc) continue;
      const w = o.matrix ? matApply(o.matrix, cc) : cc;
      V += v; c = c.map((x, k) => x + w[k] * v);
    }
    const center = V > 0 ? c.map((x) => r1(x / V)) : box.min.map((v, k) => r1((v + box.max[k]) / 2));
    items.push({ pos: row.pos, name: o.name || row.name, part: row.name, box, mass: row.mass, center });
  }
  // Knoten: einfache Verkettung über den Abstand der Garniturteile
  const parent = bolts.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < bolts.length; i++) for (let j = i + 1; j < bolts.length; j++) {
    const d = Math.hypot(...bolts[i].p.map((v, k) => v - bolts[j].p[k]));
    if (d <= join) parent[find(i)] = find(j);
  }
  const groups = new Map();
  bolts.forEach((b, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), b]); });
  const nodes = [...groups.values()].map((list) => {
    const center = [0, 1, 2].map((k) => r1(list.reduce((a, b) => a + b.p[k], 0) / list.length));
    const counts = new Map();
    for (const b of list) counts.set(b.designation, (counts.get(b.designation) || 0) + 1);
    const parts = [...counts].map(([designation, qty]) => ({ designation, qty })).sort((a, b) => b.qty - a.qty || a.designation.localeCompare(b.designation));
    // verbundene Positionen: Bauteile, deren Hülle (5 mm größer) ein Garniturteil berührt
    const touch = (it, b) => [0, 1, 2].every((k) => b.box.min[k] <= it.box.max[k] + 5 && b.box.max[k] >= it.box.min[k] - 5);
    const positions = [...new Set(items.filter((it) => list.some((b) => touch(it, b))).map((it) => it.pos))].sort((a, b) => a - b);
    return { center, parts, positions, screws: list.filter((b) => b.screw).length };
  }).filter((n) => n.screws > 0)
    .sort((a, b) => a.center[2] - b.center[2] || a.center[1] - b.center[1] || a.center[0] - b.center[0]);
  nodes.forEach((n, i) => { n.id = "K" + (i + 1); });
  const total = items.reduce((a, it) => a + (Number.isFinite(it.mass) ? it.mass : 0), 0);
  const heaviest = items.reduce((a, it) => (!a || it.mass > a.mass ? it : a), null);
  return { items, nodes, total, heaviest };
}

/** Verbindungsliste als CSV */
export function montageCsv(plan, title = "") {
  const lines = [["Knoten", "X", "Y", "Z", "verbindet Pos", "Anzahl", "Garniturteil"]];
  for (const n of plan.nodes) n.parts.forEach((p, i) => lines.push([i ? "" : n.id, i ? "" : mm(n.center[0]), i ? "" : mm(n.center[1]), i ? "" : mm(n.center[2]), i ? "" : n.positions.join(", "), p.qty, p.designation]));
  lines.push([], ["Pos", "Benennung", "Gewicht kg", "Schwerpunkt X", "Y", "Z"]);
  for (const it of plan.items) lines.push([it.pos, it.name, kg(it.mass), mm(it.center[0]), mm(it.center[1]), mm(it.center[2])]);
  if (title) lines.unshift([`Montageplan ${title}`]);
  return "﻿" + lines.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

/** Seiten für mappeHtml: Grundriss und Vorderansicht (A3 quer) mit Positionen und Knoten, dann die Listen (A4) */
export function montagePages(plan, { title = "", number = "", date = "" } = {}) {
  const W = 420, H = 297, m = 18, head = 16, gap = 14;
  const all = plan.items.flatMap((it) => [it.box.min, it.box.max]);
  if (!all.length) all.push([0, 0, 0], [1, 1, 1]);
  const lo = [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k])));
  // Grundriss links (x, y), Vorderansicht rechts (x, z), gleicher Maßstab
  const aw = (W - 2 * m - gap) / 2, ah = H - 2 * m - head - 10;
  const sx = hi[0] - lo[0] || 1, sy = hi[1] - lo[1] || 1, sz = hi[2] - lo[2] || 1;
  const raw = Math.min(aw / sx, ah / sy, ah / sz);
  const scales = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const den = scales.find((s) => 1 / s <= raw) || 1000, s = 1 / den;
  const el = [];
  const view = (ox, label, u, v) => {
    const top = m + head + 8, X = (x) => r1(ox + (aw - (hi[u] - lo[u]) * s) / 2 + (x - lo[u]) * s), Y = (y) => r1(top + (ah - (hi[v] - lo[v]) * s) / 2 + (hi[v] - y) * s);
    el.push(`<text x="${ox}" y="${top - 3}" font-size="3.6" font-weight="bold">${label}</text>`);
    for (const it of [...plan.items].sort((a, b) => a.box.min[v === 2 ? 1 : 2] - b.box.min[v === 2 ? 1 : 2])) {
      el.push(`<rect x="${X(it.box.min[u])}" y="${Y(it.box.max[v])}" width="${Math.max(0.3, r1((it.box.max[u] - it.box.min[u]) * s))}" height="${Math.max(0.3, r1((it.box.max[v] - it.box.min[v]) * s))}" fill="#eef2f6" fill-opacity="0.6" stroke="#333" stroke-width="0.25"/>`);
    }
    for (const it of plan.items) {
      const cx = X(it.center[u]), cy = Y(it.center[v]);
      el.push(`<circle cx="${cx}" cy="${cy}" r="2.6" fill="#fff" stroke="#1f5fa8" stroke-width="0.3"/><text x="${cx}" y="${cy + 1}" font-size="2.8" text-anchor="middle" fill="#1f5fa8">${it.pos}</text>`);
    }
    for (const n of plan.nodes) {
      const cx = X(n.center[u]), cy = Y(n.center[v]);
      el.push(`<rect x="${cx - 1.2}" y="${cy - 1.2}" width="2.4" height="2.4" fill="#c0392b"/><text x="${cx + 2}" y="${cy - 1.6}" font-size="2.6" fill="#c0392b">${n.id}</text>`);
    }
  };
  view(m, "Grundriss", 0, 1);
  view(m + aw + gap, "Vorderansicht", 0, 2);
  const sub = [title, number, date].filter(Boolean).join(" · ");
  const hv = plan.heaviest;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Arial, sans-serif">`
    + `<rect x="5" y="5" width="${W - 10}" height="${H - 10}" fill="none" stroke="#000" stroke-width="0.5"/>`
    + `<text x="${m}" y="${m + 2}" font-size="6" font-weight="bold">Montageplan</text><text x="${m}" y="${m + 8}" font-size="3.4">${esc(sub)}</text>`
    + `<text x="${W - m}" y="${m + 2}" font-size="3.4" text-anchor="end">Maßstab 1:${den} · ${plan.items.length} Teile · ${kg(plan.total)} kg gesamt · ${plan.nodes.length} Schraubknoten</text>`
    + (hv ? `<text x="${W - m}" y="${m + 8}" font-size="3" text-anchor="end">Schwerstes Teil: Pos ${hv.pos} ${esc(hv.name)} – ${kg(hv.mass)} kg</text>` : "")
    + `<text x="${m}" y="${H - 9}" font-size="2.8">Blaue Kreise: Positionsnummer im Schwerpunkt · rote Quadrate: Schraubknoten (Verbindungsliste)</text>`
    + el.join("") + "</svg>";
  const pages = [{ width: W, height: H, svg }];
  const PER = 36;
  const itemRows = plan.items.map((it) => `<tr><td class="n">${it.pos}</td><td>${esc(it.name)}</td><td class="n">${kg(it.mass)}</td><td class="n">${mm(it.center[0])}</td><td class="n">${mm(it.center[1])}</td><td class="n">${mm(it.center[2])}</td><td class="n">${mm(it.box.max[0] - it.box.min[0])} × ${mm(it.box.max[1] - it.box.min[1])} × ${mm(it.box.max[2] - it.box.min[2])}</td><td></td></tr>`);
  for (let i = 0; i < Math.max(1, itemRows.length); i += PER) {
    pages.push({ width: 210, height: 297, html: `<div class="lst"><h1>Montageplan – Teile${itemRows.length > PER ? ` (${i / PER + 1}/${Math.ceil(itemRows.length / PER)})` : ""}</h1><div class="sub">${esc(sub)}</div>`
      + `<table><thead><tr><th>Pos</th><th>Benennung</th><th>kg</th><th>SP X</th><th>SP Y</th><th>SP Z</th><th>Abmessung</th><th>montiert</th></tr></thead><tbody>${itemRows.slice(i, i + PER).join("")}</tbody></table>`
      + (i + PER >= itemRows.length ? `<p class="sub">Gesamt ${kg(plan.total)} kg${hv ? ` · schwerstes Teil Pos ${hv.pos} (${kg(hv.mass)} kg)` : ""}. SP = Schwerpunkt in mm im System der Baugruppe.</p>` : "") + "</div>" });
  }
  const nodeRows = plan.nodes.flatMap((n) => n.parts.map((p, i) => `<tr${i ? "" : ' class="sep"'}><td>${i ? "" : n.id}</td><td class="n">${i ? "" : `${mm(n.center[0])} / ${mm(n.center[1])} / ${mm(n.center[2])}`}</td><td>${i ? "" : esc(n.positions.join(", "))}</td><td class="n">${p.qty}</td><td>${esc(p.designation)}</td><td></td></tr>`));
  for (let i = 0; i < nodeRows.length; i += PER) {
    pages.push({ width: 210, height: 297, html: `<div class="lst"><h1>Montageplan – Verbindungsliste${nodeRows.length > PER ? ` (${i / PER + 1}/${Math.ceil(nodeRows.length / PER)})` : ""}</h1><div class="sub">${esc(sub)}</div>`
      + `<table><thead><tr><th>Knoten</th><th>Lage X / Y / Z</th><th>verbindet Pos</th><th>Stk</th><th>Garniturteil</th><th>angezogen</th></tr></thead><tbody>${nodeRows.slice(i, i + PER).join("")}</tbody></table></div>` });
  }
  return pages;
}
