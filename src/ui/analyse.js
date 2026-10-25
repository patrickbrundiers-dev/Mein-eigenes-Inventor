// Bereichseigenschaften der Skizze und Entformungsanalyse am Bauteil (Werkzeuge Stufe 54): Dialoge.

import { h, toast, modal, fmtNum } from "./dom.js";
import { regionProperties } from "../core/bereich.js";
import { PULL_DIRS, DRAFT_CLASSES, draftAngle, draftClass, draftStats } from "../core/entformanalyse.js";

/** Bereichseigenschaften der offenen Skizze (oder der gewählten Skizze im Bauteil) */
export function regionDialog(app, sketch = app.sketcher?.sk || null) {
  if (!sketch && app.sel?.type === "feature") sketch = app.activeDoc()?.features?.find((f) => f.id === app.sel.id && f.type === "sketch") || null;
  if (!sketch) return toast("Bereichseigenschaften: erst eine Skizze öffnen oder wählen");
  let res;
  try { res = regionProperties(sketch); } catch (e) { return toast(e.message, { kind: "err" }); }
  const n = (v, d = 2) => fmtNum(v, d);
  const rows = (r) => [
    ["Fläche", n(r.area) + " mm²"], ["Umfang", n(r.perimeter) + " mm"],
    ["Schwerpunkt X / Y", `${n(r.centroid[0], 3)} / ${n(r.centroid[1], 3)} mm`],
    ["Ix (um Schwerpunkt, ∥ X)", n(r.Ix, 1) + " mm⁴"], ["Iy (um Schwerpunkt, ∥ Y)", n(r.Iy, 1) + " mm⁴"], ["Ixy", n(r.Ixy, 1) + " mm⁴"],
    ["Hauptmomente I1 / I2", `${n(r.I1, 1)} / ${n(r.I2, 1)} mm⁴`], ["Winkel der Achse von I1 zu X", n(r.angle, 2) + "°"],
    ["Trägheitsradien ix / iy", `${n(r.ix, 3)} / ${n(r.iy, 3)} mm`],
    ["Widerstandsmomente Wx / Wy", `${n(r.Wx, 1)} / ${n(r.Wy, 1)} mm³`],
  ];
  const table = (r) => h("table", { class: "kv-table" }, h("tbody", {}, rows(r).map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", { class: "num" }, v)))));
  const body = h("div", { class: "region-props" },
    res.regions.length > 1 ? [h("h4", { style: { margin: "0 0 4px" } }, `Alle ${res.regions.length} Bereiche zusammen`), table(res.total)] : null,
    res.regions.map((r, i) => [h("h4", { style: { margin: "10px 0 4px" } }, `Bereich ${i + 1}` + (r.holes ? ` (${r.holes} Loch${r.holes === 1 ? "" : "löcher"})` : "")), table(r)]),
    h("p", { class: "hint" }, "Flächenmomente 2. Grades auf den Schwerpunkt bezogen, Achsen parallel zur Skizze. W = I / größter Randabstand."));
  modal({ title: `Bereichseigenschaften – ${sketch.name || "Skizze"}`, width: "520px", body, buttons: [{ label: "Schließen", primary: true }] });
  return res;
}

/** Entformungsanalyse ein- bzw. umschalten; Rückgabe der Flächenanteile */
export function applyDraftAnalysis(app, { dir = "Z+", min = 1 } = {}) {
  const part = app.activeDoc(), r = app.results.get(app.activeId);
  if (part?.kind !== "part" || !r?.bodies?.length) throw new Error("Entformungsanalyse: erst ein Bauteil mit Körper öffnen");
  const d = PULL_DIRS[dir];
  if (!d) throw new Error("Unbekannte Zugrichtung");
  draftClass(0, min); // prüft den Winkel
  app.viewer.setDraftColors((nrm) => DRAFT_CLASSES[draftClass(draftAngle(nrm, d), min)].color);
  app.draftAnalysis = { dir, min };
  return draftStats(r.bodies.filter((b) => b.mesh).map((b) => b.mesh), d, min);
}

export function draftDialog(app) {
  if (app.viewer.draftOn) { app.viewer.setDraftColors(null); app.draftAnalysis = null; app.ribbon?.render?.(); return toast("Entformungsanalyse aus"); }
  const last = app.draftAnalysis || { dir: "Z+", min: 1 };
  const dir = h("select", { class: "inp" }, Object.keys(PULL_DIRS).map((k) => h("option", { value: k, selected: k === last.dir }, k)));
  const min = h("input", { class: "inp", value: String(last.min).replace(".", ",") });
  const legend = h("div", {}, Object.values(DRAFT_CLASSES).map((c) => h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, h("span", { style: { width: "14px", height: "14px", background: `rgb(${c.color.map((x) => Math.round(x * 255)).join(",")})`, display: "inline-block" } }), c.label)));
  modal({ title: "Entformungsanalyse", width: "420px",
    body: h("div", {}, h("div", { class: "field" }, h("label", {}, "Zugrichtung (Werkzeug öffnet nach)"), dir), h("div", { class: "field" }, h("label", {}, "Mindest-Schräge (°)"), min), legend,
      h("p", { class: "hint" }, "Färbt das Bauteil nach der Neigung zur Zugrichtung. Gelb heißt: Wand mit weniger Schräge als verlangt (Formschräge nötig, etwa mit »Entformung«). Nochmal klicken schaltet ab.")),
    buttons: [{ label: "Abbrechen" }, { label: "Anzeigen", primary: true, run: () => {
      try {
        const s = applyDraftAnalysis(app, { dir: dir.value, min: Number(String(min.value).replace(",", ".")) });
        const pct = (k) => fmtNum((100 * s.area[k]) / (s.total || 1), 1) + " %";
        toast(`Entformung ${dir.value}: ${pct("positiv")} Zugseite, ${pct("negativ")} Gegenseite, ${pct("gering")} zu wenig Schräge`, { timeout: 7000 });
        app.ribbon?.render?.();
      } catch (e) { toast(e.message, { kind: "err" }); return false; }
    } }] });
}
