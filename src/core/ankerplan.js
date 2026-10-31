// Ankerplan (P6): alle Stützenfüße einer Baugruppe mit Achsbezug, Ankerlagen, Koordinaten und Höhen – als Plan
// (Grundriss mit Achsraster) und Tabelle für die Fundamentbauer, dazu CSV. Reine Rechnung ohne DOM.
//
// Eingang: Vorkommen [{ name, matrix (Welt), bodies: [{ name, meta, props: { bbox } }] }] wie flattenAssembly mit den
// gebauten Körpern. Fußplatten sind Platten namens »Fußplatte …«, Anker die Normteile der Gruppe »Dübel & Anker«
// und Gewindestangen namens »Anker …« (Stützenfuß-Generator).

import { matApply } from "./geom.js";
import { NORM_FAMILIES } from "./normlib.js";
import { gridGeometry } from "./achsraster.js";

const r1 = (x) => Math.round(x * 10) / 10;
const mm = (x) => String(Math.round(x)).replace("-", "−");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ist der Körper ein Anker (Fundamentanker, Dübel, Ankerstange)? */
export function isAnchor(b) {
  const n = b?.meta?.norm;
  if (!n) return false;
  return NORM_FAMILIES[n.kind]?.cat === "anker" || (n.kind === "gewindestange" && /^Anker/i.test(b.name || ""));
}
const isFootPlate = (b) => /^Fußplatte/i.test(b?.name || "") && !b?.meta?.norm;

/** Hülle eines Körpers in Weltkoordinaten aus seiner Hülle im Bauteil */
export function worldBox(bbox, M) {
  const [lo, hi] = bbox;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const p = M ? matApply(M, [x, y, z]) : [x, y, z];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  return { min, max };
}

/**
 * Achsbezug eines Punkts: nächste Achse je Richtung, mit Abstand, z. B. „B/3“ oder „B+120 / 3−35“.
 * Liefert { label, axX: {label, d}, axY: {label, d} } oder null ohne Raster.
 */
export function axisRef(p, grids) {
  let bx = null, by = null;
  for (const g of grids || []) {
    if (g.hidden) continue;
    let geo;
    try { geo = gridGeometry(g); } catch { continue; }
    for (const a of geo.axes) {
      if (a.along === "y") { const d = p[0] - a.pos; if (!bx || Math.abs(d) < Math.abs(bx.d)) bx = { label: a.label, d }; }
      else { const d = p[1] - a.pos; if (!by || Math.abs(d) < Math.abs(by.d)) by = { label: a.label, d }; }
    }
  }
  if (!bx && !by) return null;
  const part = (a) => (a ? a.label + (Math.abs(a.d) < 0.5 ? "" : (a.d > 0 ? "+" : "") + mm(a.d)) : "–");
  return { label: `${part(by)}/${part(bx)}`, axX: bx, axY: by };
}

/**
 * Stützenfüße mit Ankern. Rückgabe { feet: [{ pos, name, axis, center, plate: {L, B, t} | null, uk, anchors: [{ n, x, y,
 * dx, dy, top, bottom, embed, designation }], pattern }], loose: Anzahl Anker ohne Fußplatte }
 */
export function collectFootings(occ, { grids = [] } = {}) {
  const plates = [], anchors = [];
  for (const o of occ || []) for (const b of o.bodies || []) {
    const bb = b.props?.bbox;
    if (!bb) continue;
    const w = worldBox(bb, o.matrix);
    if (isFootPlate(b)) plates.push({ owner: o.name, box: w });
    else if (isAnchor(b)) anchors.push({ owner: o.name, box: w, designation: b.meta.norm.designation || b.name });
  }
  const used = new Set();
  const feet = [];
  for (const pl of plates) {
    const { min, max } = pl.box;
    const inside = anchors.filter((a, i) => {
      if (used.has(i)) return false;
      const cx = (a.box.min[0] + a.box.max[0]) / 2, cy = (a.box.min[1] + a.box.max[1]) / 2;
      const ok = cx >= min[0] - 1 && cx <= max[0] + 1 && cy >= min[1] - 1 && cy <= max[1] + 1 && a.box.min[2] < max[2];
      if (ok) used.add(i);
      return ok;
    });
    if (!inside.length) continue;
    feet.push(makeFoot(pl.owner, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], { L: max[0] - min[0], B: max[1] - min[1], t: max[2] - min[2] }, min[2], inside, grids));
  }
  // Anker ohne Fußplatte: je Vorkommen eine Gruppe
  const rest = anchors.filter((_, i) => !used.has(i));
  const byOwner = new Map();
  for (const a of rest) byOwner.set(a.owner, [...(byOwner.get(a.owner) || []), a]);
  for (const [owner, list] of byOwner) {
    const xs = list.map((a) => (a.box.min[0] + a.box.max[0]) / 2), ys = list.map((a) => (a.box.min[1] + a.box.max[1]) / 2);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    feet.push(makeFoot(owner, c, null, Math.max(...list.map((a) => a.box.max[2])), list, grids));
  }
  // Reihenfolge: nach Achse y, dann x (Lesereihenfolge im Grundriss von unten links)
  feet.sort((a, b) => a.center[1] - b.center[1] || a.center[0] - b.center[0]);
  feet.forEach((f, i) => { f.pos = i + 1; });
  return { feet, loose: rest.length };
}

function makeFoot(owner, c, plate, uk, list, grids) {
  const anchors = list.map((a) => {
    const x = (a.box.min[0] + a.box.max[0]) / 2, y = (a.box.min[1] + a.box.max[1]) / 2;
    return { x: r1(x), y: r1(y), dx: r1(x - c[0]), dy: r1(y - c[1]), top: r1(a.box.max[2]), bottom: r1(a.box.min[2]), embed: r1(uk - a.box.min[2]), designation: a.designation };
  }).sort((a, b) => a.dy - b.dy || a.dx - b.dx);
  anchors.forEach((a, i) => { a.n = i + 1; });
  const ax = axisRef(c, grids);
  const uniq = (v) => [...new Set(v.map((x) => Math.round(Math.abs(x))))].sort((a, b) => a - b);
  const px = uniq(anchors.map((a) => a.dx)), py = uniq(anchors.map((a) => a.dy));
  const pattern = `${px.map((x) => (x ? "±" + x : "0")).join("/")} × ${py.map((y) => (y ? "±" + y : "0")).join("/")}`;
  const des = [...new Set(anchors.map((a) => a.designation))];
  return { name: owner, axis: ax?.label || "", center: [r1(c[0]), r1(c[1])], plate: plate ? { L: r1(plate.L), B: r1(plate.B), t: r1(plate.t) } : null, uk: r1(uk), anchors, pattern, anchorText: `${anchors.length} × ${des.join(", ")}` };
}

/** Ankerplan als CSV: eine Zeile je Anker (Semikolon, deutsches Zahlenformat) */
export function anchorCsv(plan, title = "") {
  const f = (x) => String(r1(x)).replace(".", ",");
  const head = ["Pos", "Achse", "Stützenfuß", "Anker", "X", "Y", "dx", "dy", "UK Fußplatte", "OK Anker", "Einbindetiefe", "Bezeichnung"];
  const rows = plan.feet.flatMap((ft) => ft.anchors.map((a) => [ft.pos, ft.axis, ft.name, a.n, f(a.x), f(a.y), f(a.dx), f(a.dy), f(ft.uk), f(a.top), f(a.embed), a.designation]));
  const all = [head, ...rows];
  if (title) all.unshift([`Ankerplan ${title}`]);
  return "﻿" + all.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

/**
 * Seiten für mappeHtml: Grundriss (A3 quer, SVG) mit Achsraster, Fußplatten, Ankern und Positionsnummern, dann die
 * Tabelle (A4 hoch). grids wie asm.grids.
 */
export function anchorPages(plan, { title = "", number = "", date = "", grids = [] } = {}) {
  const W = 420, H = 297, m = 18, head = 16;
  const pts = plan.feet.flatMap((f) => [f.center, ...f.anchors.map((a) => [a.x, a.y])]);
  const geos = [];
  for (const g of grids || []) { if (g.hidden) continue; try { geos.push(gridGeometry(g)); } catch { /* fehlerhaftes Raster */ } }
  for (const g of geos) for (const a of g.axes) pts.push([a.a[0], a.a[1]], [a.b[0], a.b[1]]);
  for (const f of plan.feet) if (f.plate) pts.push([f.center[0] - f.plate.L / 2, f.center[1] - f.plate.B / 2], [f.center[0] + f.plate.L / 2, f.center[1] + f.plate.B / 2]);
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const aw = W - 2 * m, ah = H - 2 * m - head;
  const raw = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0));
  const scales = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const den = scales.find((s) => 1 / s <= raw) || 1000, s = 1 / den;
  const ox = m + (aw - (x1 - x0) * s) / 2, oy = m + head + (ah - (y1 - y0) * s) / 2;
  const X = (x) => r1(ox + (x - x0) * s), Y = (y) => r1(oy + (y1 - y) * s);
  const el = [];
  for (const g of geos) for (const a of g.axes) {
    el.push(`<line x1="${X(a.a[0])}" y1="${Y(a.a[1])}" x2="${X(a.b[0])}" y2="${Y(a.b[1])}" stroke="#555" stroke-width="0.18" stroke-dasharray="6 1.2 1 1.2"/>`);
    const [cx, cy] = [X(a.b[0]), Y(a.b[1])];
    el.push(`<circle cx="${cx}" cy="${cy}" r="3.2" fill="#fff" stroke="#222" stroke-width="0.25"/><text x="${cx}" y="${cy + 1.2}" font-size="3.4" text-anchor="middle">${esc(a.label)}</text>`);
  }
  const rMin = 0.6;
  for (const f of plan.feet) {
    if (f.plate) el.push(`<rect x="${X(f.center[0] - f.plate.L / 2)}" y="${Y(f.center[1] + f.plate.B / 2)}" width="${r1(f.plate.L * s)}" height="${r1(f.plate.B * s)}" fill="#eef2f6" stroke="#222" stroke-width="0.35"/>`);
    for (const a of f.anchors) {
      const [cx, cy] = [X(a.x), Y(a.y)], r = Math.max(rMin, 10 * s);
      el.push(`<circle cx="${cx}" cy="${cy}" r="${r1(r)}" fill="none" stroke="#c0392b" stroke-width="0.3"/><line x1="${cx - r - 0.8}" y1="${cy}" x2="${cx + r + 0.8}" y2="${cy}" stroke="#c0392b" stroke-width="0.15"/><line x1="${cx}" y1="${cy - r - 0.8}" x2="${cx}" y2="${cy + r + 0.8}" stroke="#c0392b" stroke-width="0.15"/>`);
    }
    const lx = X(f.center[0]) + Math.max(3, ((f.plate?.L || 100) * s) / 2 + 2), ly = Y(f.center[1]) - Math.max(3, ((f.plate?.B || 100) * s) / 2 + 1);
    el.push(`<text x="${lx}" y="${ly}" font-size="3" font-weight="bold">${f.pos}</text>`);
  }
  const sub = [title, number, date].filter(Boolean).join(" · ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" font-family="Arial, sans-serif">`
    + `<rect x="5" y="5" width="${W - 10}" height="${H - 10}" fill="none" stroke="#000" stroke-width="0.5"/>`
    + `<text x="${m}" y="${m + 2}" font-size="6" font-weight="bold">Ankerplan</text><text x="${m}" y="${m + 8}" font-size="3.4">${esc(sub)}</text>`
    + `<text x="${W - m}" y="${m + 2}" font-size="3.4" text-anchor="end">Maßstab 1:${den} · ${plan.feet.length} Stützenfüße · ${plan.feet.reduce((a, f) => a + f.anchors.length, 0)} Anker</text>`
    + `<text x="${W - m}" y="${m + 8}" font-size="3" text-anchor="end">Koordinaten in mm im System der Baugruppe, Höhen absolut (z)</text>`
    + el.join("") + "</svg>";
  const pages = [{ width: W, height: H, svg }];
  const PER = 34;
  const rows = plan.feet.flatMap((f) => f.anchors.map((a, i) => ({ f, a, first: i === 0 })));
  for (let i = 0; i < Math.max(1, rows.length); i += PER) {
    const part = rows.slice(i, i + PER);
    const body = part.map(({ f, a, first }) => `<tr${first ? ' class="sep"' : ""}><td class="n">${first ? f.pos : ""}</td><td>${first ? esc(f.axis) : ""}</td><td>${first ? esc(f.plate ? `${mm(f.plate.L)} × ${mm(f.plate.B)} × ${String(f.plate.t).replace(".", ",")}` : "ohne Fußplatte") : ""}</td><td class="n">${first ? mm(f.uk) : ""}</td><td class="n">${a.n}</td><td class="n">${mm(a.x)}</td><td class="n">${mm(a.y)}</td><td class="n">${mm(a.dx)}</td><td class="n">${mm(a.dy)}</td><td class="n">${mm(a.top)}</td><td class="n">${mm(a.embed)}</td><td>${esc(a.designation)}</td></tr>`).join("");
    pages.push({ width: 210, height: 297, html: `<div class="lst"><h1>Ankerplan – Ankerliste${rows.length > PER ? ` (${i / PER + 1}/${Math.ceil(rows.length / PER)})` : ""}</h1><div class="sub">${esc(sub)}</div>`
      + `<table><thead><tr><th>Pos</th><th>Achse</th><th>Fußplatte</th><th>UK Platte</th><th>Anker</th><th>X</th><th>Y</th><th>dx</th><th>dy</th><th>OK Anker</th><th>Einbindung</th><th>Bezeichnung</th></tr></thead><tbody>${body}</tbody></table>`
      + `<p class="sub">dx/dy: Abstand zur Mitte der Fußplatte. Einbindung: von UK Fußplatte bis Ankerende. Lochbilder: ${esc([...new Set(plan.feet.map((f) => f.pattern))].join("; "))}</p></div>` });
  }
  return pages;
}
