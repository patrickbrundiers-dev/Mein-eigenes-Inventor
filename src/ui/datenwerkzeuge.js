// Datei und Daten (SolidCraft-Abgleich E5): Kanten und Flächen auflisten, installierte Slicer verwalten.
import { h, toast, modal, fmtNum } from "./dom.js";

const TYPE = { PLANE: "Ebene", CYLINDER: "Zylinder", CONE: "Kegel", SPHERE: "Kugel", TORUS: "Torus", BSPLINE_SURFACE: "Freiform (B-Spline)", BEZIER_SURFACE: "Freiform (Bézier)", REVOLUTION_SURFACE: "Drehfläche", EXTRUSION_SURFACE: "Auszugsfläche", OFFSET_SURFACE: "Versatzfläche",
  LINE: "Gerade", CIRCLE: "Kreis/Bogen", ELLIPSE: "Ellipse", BSPLINE_CURVE: "Spline", BEZIER_CURVE: "Bézier", HYPERBOLA: "Hyperbel", PARABOLA: "Parabel", OFFSET_CURVE: "Versatzkurve", OTHER_CURVE: "andere" };
const t = (x) => TYPE[x] || x || "–";
const p3 = (p) => (p ? p.map((v) => fmtNum(v, 1)).join(" / ") : "–");

/** Kanten und Flächen des Bauteils als Tabellen (mit CSV) */
export async function topologyDialog(app) {
  const part = app.activeDoc();
  if (part?.kind !== "part" || !app.results.get(part.id)?.bodies?.length) return toast("Erst ein Bauteil mit Körper öffnen");
  let res;
  try { res = await app.kernel.call("surfaceAnalysis", { part, what: "liste" }); } catch (e) { return toast("Auflisten fehlgeschlagen: " + e.message, { kind: "err" }); }
  const rowsF = [], rowsE = [];
  for (const b of res) {
    for (const f of b.faces || []) rowsF.push([b.name || `Körper ${b.body + 1}`, f.idx + 1, t(f.type), f.area, f.r, f.normal ? p3(f.normal) : "", p3(f.center)]);
    for (const e of b.edges || []) rowsE.push([b.name || `Körper ${b.body + 1}`, e.idx + 1, t(e.type), e.length, e.r, p3(e.mid)]);
  }
  const num = (v, d = 2) => (Number.isFinite(v) ? fmtNum(v, d) : "");
  const tableF = h("table", { class: "grid topo-faces" }, h("thead", {}, h("tr", {}, ...["Körper", "Nr.", "Art", "Fläche mm²", "Radius", "Normale", "Mitte"].map((x) => h("th", {}, x)))),
    h("tbody", {}, ...rowsF.map((r) => h("tr", {}, h("td", {}, r[0]), h("td", { class: "num" }, r[1]), h("td", {}, r[2]), h("td", { class: "num" }, num(r[3])), h("td", { class: "num" }, num(r[4])), h("td", {}, r[5]), h("td", {}, r[6])))));
  const tableE = h("table", { class: "grid topo-edges" }, h("thead", {}, h("tr", {}, ...["Körper", "Nr.", "Art", "Länge mm", "Radius", "Mitte"].map((x) => h("th", {}, x)))),
    h("tbody", {}, ...rowsE.map((r) => h("tr", {}, h("td", {}, r[0]), h("td", { class: "num" }, r[1]), h("td", {}, r[2]), h("td", { class: "num" }, num(r[3])), h("td", { class: "num" }, num(r[4])), h("td", {}, r[5])))));
  const count = (rows) => Object.entries(rows.reduce((m, r) => ({ ...m, [r[2]]: (m[r[2]] || 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(", ");
  let tab = "f";
  const box = h("div", { class: "topo-box", style: { maxHeight: "50vh", overflow: "auto" } }, tableF);
  const seg = h("div", { class: "seg" });
  const draw = () => { seg.replaceChildren(h("button", { class: tab === "f" ? "on" : "", onclick: () => { tab = "f"; box.replaceChildren(tableF); draw(); } }, `Flächen (${rowsF.length})`), h("button", { class: tab === "e" ? "on" : "", onclick: () => { tab = "e"; box.replaceChildren(tableE); draw(); } }, `Kanten (${rowsE.length})`)); };
  draw();
  const csv = () => {
    const esc = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = tab === "f" ? ["Körper", "Nr", "Art", "Fläche mm2", "Radius", "Normale", "Mitte"] : ["Körper", "Nr", "Art", "Länge mm", "Radius", "Mitte"];
    const rows = (tab === "f" ? rowsF : rowsE).map((r) => r.map((v) => (typeof v === "number" ? num(v, 4) : v)));
    app.files.saveText([head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n"), `${part.name}_${tab === "f" ? "Flaechen" : "Kanten"}.csv`, "text/csv", [{ name: "CSV", extensions: ["csv"] }]);
  };
  modal({ title: `Kanten und Flächen – ${part.name}`, width: "820px", body: h("div", {}, h("p", { class: "hint" }, `Flächen: ${count(rowsF) || "–"}. Kanten: ${count(rowsE) || "–"}.`), seg, box),
    buttons: [{ label: "Als CSV speichern", run: () => { csv(); return false; } }, { label: "Schließen", primary: true }] });
  return { faces: rowsF.length, edges: rowsE.length };
}

/** Einstellungen → Dateien: installierte Slicer (Name und Programm), erster = Standard */
export function slicerEditor(app) {
  const prefs = app.prefs, box = h("div", { class: "set-slicer" });
  const render = () => {
    const list = prefs.get("dateien.slicer") || [];
    const set = (v) => { const r = prefs.set("dateien.slicer", v); if (!r.ok) toast(r.error, { kind: "err" }); render(); };
    const name = h("input", { class: "inp", placeholder: "Name, z. B. PrusaSlicer" });
    const exe = h("input", { class: "inp", placeholder: "Programmpfad (.exe)", spellcheck: "false" });
    box.replaceChildren(h("h4", {}, "Installierte Slicer"),
      h("p", { class: "hint" }, "»An Slicer senden« (Export → 3D) öffnet das Teil als 3MF im ersten Slicer der Liste. Ohne Eintrag öffnet Windows die 3MF-Datei mit dem dafür eingestellten Programm."),
      list.length ? h("table", { class: "grid" }, h("tbody", {}, ...list.map((s, i) => h("tr", {}, h("td", {}, s.name + (i === 0 ? " (Standard)" : "")), h("td", { style: { wordBreak: "break-all" } }, s.exe),
        h("td", {}, i ? h("button", { class: "btn", onclick: () => set([s, ...list.filter((x) => x !== s)]) }, "Als Standard") : null, h("button", { class: "btn danger", onclick: () => set(list.filter((x) => x !== s)) }, "Entfernen")))))) : null,
      h("div", { class: "btn-row" }, name, exe,
        window.werkcad?.pickSlicer ? h("button", { class: "btn", onclick: async () => { const p = await window.werkcad.pickSlicer(); if (p) { exe.value = p; if (!name.value) name.value = p.split(/[\\/]/).pop().replace(/\.exe$/i, ""); } } }, "Wählen…") : null,
        h("button", { class: "btn", onclick: () => set([...list, { name: name.value, exe: exe.value }]) }, "Hinzufügen")));
  };
  render();
  return box;
}
