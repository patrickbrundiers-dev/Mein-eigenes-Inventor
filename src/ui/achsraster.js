// Achsraster der Baugruppe (Stahlbau-Lücken ST9): anlegen, bearbeiten, im 3D-Fenster und in Zeichnungen zeigen,
// Komponenten auf einen Achsschnittpunkt setzen. Rechnung in src/core/achsraster.js.

import { h, toast } from "./dom.js";
import { uid } from "../core/examples.js";
import { GRID_DEFAULT, gridGeometry, gridPoints, gridInView } from "../core/achsraster.js";

/** Neues Achsraster mit Standardwerten, gleich gewählt */
export function newGrid(app) {
  const asm = app.activeDoc();
  if (asm?.kind !== "assembly") return toast("Achsraster gibt es in Baugruppen");
  const g = { id: uid("ar"), ...GRID_DEFAULT, name: `Achsraster ${(asm.grids || []).length + 1}`, x0: "0", y0: "0", z: "0", h: "4000", over: "1500" };
  app.edit("Achsraster", () => { asm.grids = [...(asm.grids || []), g]; }, { rebuild: false });
  app.sel = { type: "grid", id: g.id };
  app.tree.render();
  app.props.render();
  app.showSketches3D();
}

export function deleteGrid(app, asm, id) {
  app.edit("Achsraster löschen", () => { asm.grids = (asm.grids || []).filter((x) => x.id !== id); }, { rebuild: false });
  if (app.sel?.id === id) app.sel = null;
  app.tree.render();
  app.props.render();
  app.showSketches3D();
}

/** Liste für viewer.showGrids */
export function gridDisplay(app, asm) {
  const out = [];
  for (const g of asm?.grids || []) {
    if (g.hidden) continue;
    try { out.push({ axes: gridGeometry(g).axes, active: app.sel?.type === "grid" && app.sel.id === g.id }); } catch { /* Fehler steht im Eigenschaftenfeld */ }
  }
  return out;
}

/** Eigenschaftenfeld eines Rasters */
export function gridProps(props, asm, g) {
  const app = props.app;
  const set = (label, fn) => { app.edit(label, fn, { rebuild: false }); app.showSketches3D(); };
  const T = (label, key, hint) => props.text(label, String(g[key] ?? ""), (v) => set(label, () => { g[key] = v; }), hint ? { placeholder: hint } : undefined);
  const E = (label, key, opts) => props.expr(label, String(g[key] ?? ""), (v) => set(label, () => { g[key] = v; }), opts);
  let geo = null, err = "";
  try { geo = gridGeometry(g); } catch (e) { err = e.message; }
  const nx = geo ? geo.axes.filter((a) => a.along === "y").length : 0, ny = geo ? geo.axes.length - nx : 0;
  return [
    err ? h("div", { class: "msg err" }, err) : null,
    props.section("Achsraster",
      T("Name", "name"),
      T("Abstände in X (Achsen 1, 2, 3 …)", "x", "6000; 6000 oder 3*6000"),
      T("Erste Achse in X heißt", "lx"),
      T("Abstände in Y (Achsen A, B, C …)", "y", "5000; 5000"),
      T("Erste Achse in Y heißt", "ly"),
      E("Ursprung X", "x0"), E("Ursprung Y", "y0"), E("Höhe der Rasterebene", "z"),
      E("Achslinien in Ansichten bis Höhe", "h", { allowNeg: false }),
      E("Überstand der Achslinien", "over", { allowNeg: false }),
      props.check("Ausblenden", !!g.hidden, (v) => set("Achsraster", () => { g.hidden = v; })),
      geo ? h("p", {}, `${nx} × ${ny} Achsen, ${geo.points.length} Schnittpunkte. Komponenten setzt »Auf Achsschnittpunkt« in ihren Eigenschaften dorthin; Zeichnungsansichten zeigen die Achsen mit Achskreisen.`) : null),
    h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => deleteGrid(app, asm, g.id) }, "Löschen")),
  ].filter(Boolean);
}

/** Auswahl »Auf Achsschnittpunkt« für eine Komponente (x, y vom Punkt, z bleibt) oder null ohne Raster */
export function gridSnapRow(props, asm, c) {
  const pts = gridPoints(asm);
  if (!pts.length) return null;
  const at = pts.find((q) => Math.abs(q.p[0] - (c.pos?.[0] ?? 0)) < 1e-6 && Math.abs(q.p[1] - (c.pos?.[1] ?? 0)) < 1e-6);
  return props.select("Auf Achsschnittpunkt", [["", "– wählen –"], ...pts.map((q, i) => [String(i), q.label])], at ? String(pts.indexOf(at)) : "", (v) => {
    const q = pts[Number(v)];
    if (!q) return;
    props.app.edit("Auf Achsschnittpunkt", () => { c.pos = [q.p[0], q.p[1], c.pos?.[2] ?? 0]; });
  });
}

/** Achsen eines Rasters in einer Zeichnungsansicht: Linien strichpunktiert, Achskreis am Ende. toXY(p3) → Blattkoordinaten */
export function gridViewSvg(svgEl, asm, toXY, lw = 0.25) {
  const g = svgEl("g", { fill: "none", stroke: "#111a24", "stroke-width": lw });
  let any = false;
  for (const gr of asm?.grids || []) {
    if (gr.hidden) continue;
    let list;
    try { list = gridInView(gr, toXY); } catch { continue; }
    for (const ax of list) {
      const [x1, y1] = ax.a, [x2, y2] = ax.b, L = Math.hypot(x2 - x1, y2 - y1);
      if (L < 2) continue;
      any = true;
      const r = 4, ux = (x2 - x1) / L, uy = (y2 - y1) / L, cx = x2 + ux * r, cy = y2 + uy * r;
      g.append(svgEl("line", { x1, y1, x2, y2, "stroke-dasharray": "8 1.5 1 1.5" }));
      g.append(svgEl("circle", { cx, cy, r, fill: "#fff" }));
      const t = svgEl("text", { x: cx, y: cy + 1.2, "text-anchor": "middle", "font-size": ax.label.length > 2 ? 2.6 : 3.5, fill: "#111a24", stroke: "none" });
      t.textContent = ax.label;
      g.append(t);
    }
  }
  return any ? g : null;
}
