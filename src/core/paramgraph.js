// Parametergraph und Parameterverwendungen (SolidCraft-Abgleich E6): welcher Parameter hängt von welchem ab,
// wo im Modell wird er benutzt. Reine Rechnung; das Bild ist ein SVG-Text.
import { identifiers } from "./expr.js";

/** Abhängigkeiten: Name → [benutzte Parameter] */
export function paramDeps(params) {
  const names = new Set(params.map((p) => p.name));
  return new Map(params.map((p) => [p.name, p.link ? [] : identifiers(p.expr ?? "").filter((n) => names.has(n) && n !== p.name)]));
}

/** Wo wird der Parameter benutzt? Durchsucht alle Textfelder der Features (auch verschachtelt) → [{ id, feature, field }] */
export function paramUsages(features, name) {
  const out = [];
  const looks = (s) => typeof s === "string" && s.includes(name) && /[A-Za-z_À-ɏ]/.test(s) && identifiers(s).includes(name);
  const walk = (f, v, path) => {
    if (looks(v)) out.push({ id: f.id, feature: f.name || f.type, field: path });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(f, x, `${path}[${i + 1}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "id" && k !== "name") walk(f, x, path ? `${path}.${k}` : k);
  };
  for (const f of features || []) walk(f, f, "");
  return out;
}

/** Ebene je Parameter: 0 = hängt von nichts ab, sonst 1 + größte Ebene der benutzten (Kreise bleiben auf 0) */
export function paramLevels(params) {
  const deps = paramDeps(params), lvl = new Map(), busy = new Set();
  const of = (n) => {
    if (lvl.has(n)) return lvl.get(n);
    if (busy.has(n)) return 0;
    busy.add(n);
    const v = Math.max(-1, ...(deps.get(n) || []).map(of)) + 1;
    busy.delete(n);
    lvl.set(n, v);
    return v;
  };
  for (const p of params) of(p.name);
  return lvl;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Graph als SVG: Spalten nach Ebene, Pfeil von benutzt → benutzend; values: Name → Zahl (optional) */
export function paramGraphSvg(params, values = {}) {
  const deps = paramDeps(params), lvl = paramLevels(params);
  const cols = [];
  for (const p of params) (cols[lvl.get(p.name)] ||= []).push(p.name);
  const BW = 130, BH = 34, GX = 60, GY = 14;
  const pos = new Map();
  cols.forEach((c, i) => c.forEach((n, k) => pos.set(n, [16 + i * (BW + GX), 16 + k * (BH + GY)])));
  const W = 32 + Math.max(1, cols.length) * (BW + GX) - GX, H = 32 + Math.max(1, ...cols.map((c) => c?.length || 0)) * (BH + GY) - GY;
  const arrows = [];
  for (const [n, ds] of deps) for (const d of ds) {
    const [x1, y1] = pos.get(d), [x2, y2] = pos.get(n);
    const a = [x1 + BW, y1 + BH / 2], b = [x2, y2 + BH / 2], mx = (a[0] + b[0]) / 2;
    arrows.push(`<path d="M${a[0]},${a[1]} C${mx},${a[1]} ${mx},${b[1]} ${b[0] - 6},${b[1]}" fill="none" stroke="currentColor" stroke-opacity=".5" marker-end="url(#pg-arrow)"/>`);
  }
  const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace(".", ",") : "");
  const boxes = [...pos].map(([n, [x, y]]) => `<g class="pg-node"><rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="5" fill="var(--surface, #fff)" stroke="currentColor" stroke-opacity=".45"/>`
    + `<text x="${x + 8}" y="${y + 14}" font-weight="600">${esc(n)}</text><text x="${x + 8}" y="${y + 28}" fill-opacity=".7">${esc(fmt(values[n]))}</text></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" class="param-graph" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-size="11" fill="currentColor">`
    + `<defs><marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="currentColor" fill-opacity=".6"/></marker></defs>${arrows.join("")}${boxes}</svg>`;
}

/** Parameter um einen Platz verschieben (Parameter verschieben) → neue Liste */
export function moveParam(params, i, d) {
  const j = i + d;
  if (j < 0 || j >= params.length || i < 0 || i >= params.length) return params;
  const out = [...params];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
