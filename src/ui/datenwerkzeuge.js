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

/** Leistungsprofil (SolidCraft-Abgleich E6): Rechenzeit je Feature des letzten Neuaufbaus, langsamste zuerst */
export function performanceDialog(app) {
  const part = app.activeDoc(), res = part && app.results.get(part.id);
  if (part?.kind !== "part" || !res?.status) return toast("Erst ein Bauteil öffnen");
  const rows = part.features.map((f) => ({ f, ms: res.status[f.id]?.ms })).filter((r) => Number.isFinite(r.ms)).sort((a, b) => b.ms - a.ms);
  const total = rows.reduce((s, r) => s + r.ms, 0) || 1;
  const body = rows.length ? h("div", {}, h("p", { class: "hint" }, `Summe ${fmtNum(total / 1000, 2)} s über ${rows.length} Features (nur neu berechnete; F5 rechnet alles neu).`),
    h("table", { class: "grid perf-table" }, h("thead", {}, h("tr", {}, h("th", {}, "Feature"), h("th", {}, "ms"), h("th", {}, "Anteil"))),
      h("tbody", {}, ...rows.slice(0, 40).map((r) => h("tr", {}, h("td", {}, r.f.name || r.f.type), h("td", { class: "num" }, String(r.ms)),
        h("td", {}, h("div", { style: { background: "var(--dye)", height: "8px", width: `${Math.max(1, Math.round((100 * r.ms) / total))}%`, borderRadius: "2px" } })))))))
    : h("p", {}, "Noch keine Zeiten – Bauteil einmal neu berechnen (F5).");
  modal({ title: `Leistungsprofil – ${part.name}`, width: "560px", body, buttons: [{ label: "Neu berechnen", run: () => { app.commands.exec("model.rebuild"); return true; } }, { label: "Schließen", primary: true }] });
  return rows.length;
}

/** Absturzberichte (E6): Fehler dieser Sitzung; Kopieren für eine Fehlermeldung, Löschen, Protokollordner */
export function crashReportsDialog(app) {
  const list = app.errorReports || [];
  const text = () => list.map((r) => `${r.time}  ${r.msg}\n${r.stack}`).join("\n\n");
  const body = h("div", {}, list.length
    ? h("div", { class: "crash-list", style: { maxHeight: "50vh", overflow: "auto" } }, ...list.slice().reverse().map((r) => h("details", {}, h("summary", {}, `${r.time.slice(11, 19)} – ${r.msg}`), h("pre", { style: { whiteSpace: "pre-wrap", fontSize: "11px" } }, r.stack))))
    : h("p", {}, "In dieser Sitzung ist kein Fehler aufgetreten."),
    h("p", { class: "hint" }, "Nur Meldung und Programmstelle, keine Projektdaten. Ältere Fehler stehen im Fehlerprotokoll."));
  modal({ title: "Absturzberichte", width: "640px", body, buttons: [
    ...(window.werkcad?.openLogFolder ? [{ label: "Protokollordner", run: () => { window.werkcad.openLogFolder(); return false; } }] : []),
    { label: "Kopieren", run: () => { navigator.clipboard?.writeText(text()).then(() => toast("Berichte kopiert", { kind: "ok" }), () => toast("Kopieren nicht möglich", { kind: "err" })); return false; } },
    { label: "Löschen", run: () => { list.splice(0); toast("Berichte gelöscht"); } },
    { label: "Schließen", primary: true }] });
  return list.length;
}

/** Einstellungen → Werkstoffe: Kunststoffregeln (Wanddicke, Formschräge, Radius) für Kunststoffteile (E5) */
export function plasticRulesEditor(app) {
  const prefs = app.prefs, box = h("div", { class: "mat-editor plastic-rules" });
  const lib = () => (prefs.get("material.kunststoffregeln") || []).map((r) => ({ ...r }));
  const save = (v) => { const r = prefs.set("material.kunststoffregeln", v); if (!r.ok) toast(r.error, { kind: "err", timeout: 6000 }); render(); };
  const render = () => {
    const list = lib();
    const cell = (r, i, k, num = true) => h("input", { class: "inp" + (num ? " num" : ""), value: num ? String(r[k]).replace(".", ",") : r[k], onchange: (e) => { const n = lib(); n[i] = { ...n[i], [k]: e.target.value.trim() }; save(n); } });
    box.replaceChildren(h("h3", {}, "Kunststoffregeln"),
      h("p", { class: "hint" }, "Kunststoffteile (3D-Modell → Kunststoff) übernehmen die Werte der gewählten Regel: Lippe/Nut liegen in der Wandmitte, Rippen und Domwände werden gegen die Wanddicke geprüft."),
      h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Name", "Wand mm", "Formschräge °", "Radius mm", ""].map((x) => h("th", {}, x)))),
        h("tbody", {}, ...list.map((r, i) => h("tr", {}, h("td", {}, cell(r, i, "name", false)), h("td", {}, cell(r, i, "wall")), h("td", {}, cell(r, i, "draft")), h("td", {}, cell(r, i, "radius")),
          h("td", {}, h("button", { class: "btn", onclick: () => save(lib().filter((_, k) => k !== i)) }, "Löschen")))))),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => { let n = list.length + 1; while (list.some((r) => r.name === "Regel " + n)) n++; save([...list, { name: "Regel " + n, wall: 2, draft: 1, radius: 1 }]); } }, "Neue Regel")));
  };
  render();
  return box;
}
