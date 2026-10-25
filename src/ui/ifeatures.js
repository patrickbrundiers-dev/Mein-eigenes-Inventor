// iFeature-Bibliothek (Werkzeuge Stufe 52): Ablage je Rechner (wie die Generator-Vorlagen), Dialoge zum Erstellen
// aus dem aktiven Bauteil und zum Einsetzen auf eine Grundebene oder die gewählte Fläche; Austausch als .pbif-Datei.

import { h, toast, modal, confirmDialog } from "./dom.js";
import { extractIFeature, validateIFeature, placeIFeature, targetFrame, ifeatureSummary } from "../core/ifeature.js";
import { BASE_PLANES, planeFromFace } from "../core/geom.js";
import { uid } from "../core/examples.js";
import { safeName } from "./files.js";

const KEY = "pbcad.ifeatures";

function readAll() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => validateIFeature(x).ok) : []; } catch { return []; }
}
function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
export const listIFeatures = () => readAll().sort((a, b) => a.name.localeCompare(b.name, "de"));
export function saveIFeature(v) {
  const list = readAll().filter((x) => x.name !== v.name);
  list.push(v);
  return writeAll(list);
}
export function deleteIFeature(name) { writeAll(readAll().filter((x) => x.name !== name)); }

/** Dialog »iFeature erstellen«: Features des aktiven Bauteils ankreuzen (vorbelegt mit der Auswahl), Namen geben */
export function extractDialog(app) {
  const part = app.activeDoc();
  if (part?.kind !== "part" || !part.features?.length) return toast("iFeature erstellen: erst ein Bauteil mit Features öffnen");
  const pre = app.sel?.type === "feature" ? app.sel.id : null;
  const checked = new Set(pre ? [pre] : []);
  const name = h("input", { class: "inp", value: pre ? part.features.find((f) => f.id === pre)?.name || "" : "", placeholder: "z. B. Langloch 20x10" });
  const desc = h("input", { class: "inp", placeholder: "wofür, Hinweise zum Einsetzen" });
  const info = h("p", { class: "muted", style: { margin: "6px 0 0" } });
  const check = () => {
    try { const v = extractIFeature(part, [...checked], { name: name.value || "iFeature" }); info.textContent = ifeatureSummary(v); info.classList.remove("err"); return v; } catch (e) { info.textContent = e.message; info.classList.add("err"); return null; }
  };
  const rows = part.features.map((f) => {
    const cb = h("input", { type: "checkbox", checked: checked.has(f.id) });
    cb.addEventListener("change", () => { if (cb.checked) checked.add(f.id); else checked.delete(f.id); check(); });
    return h("label", { class: "check", style: { display: "block" } }, cb, " ", f.name || f.type);
  });
  const body = h("div", {},
    h("p", { style: { margin: "0 0 8px", maxWidth: "60ch" } }, "Features wählen, die zusammen das iFeature bilden. Skizzen, auf denen sie aufbauen, kommen automatisch mit, ebenso die benutzten Parameter (beim Einsetzen änderbar)."),
    h("div", { style: { maxHeight: "240px", overflow: "auto", border: "1px solid var(--line)", padding: "6px", marginBottom: "8px" } }, rows),
    h("div", { class: "field" }, h("label", {}, "Name"), name), h("div", { class: "field" }, h("label", {}, "Beschreibung"), desc), info);
  name.addEventListener("input", check);
  check();
  modal({ title: "iFeature erstellen", width: "560px", body, buttons: [{ label: "Abbrechen" }, { label: "In Bibliothek speichern", primary: true, run: () => {
    let v;
    try { v = extractIFeature(part, [...checked], { name: name.value, description: desc.value }); } catch (e) { toast(e.message, { kind: "err" }); return false; }
    if (!saveIFeature(v)) { toast("iFeature konnte nicht gespeichert werden", { kind: "err" }); return false; }
    toast(`iFeature »${v.name}« in der Bibliothek – »iFeature einfügen« setzt es in ein Bauteil`, { kind: "ok" });
    return v;
  } }] });
}

/** iFeature in das aktive Bauteil einsetzen (ohne Dialog; für den Dialog und die Tests) */
export function insertIFeature(app, v, { plane = { ref: "XY" }, offset = 0, rotate = 0, flip = false, values = {} } = {}) {
  const part = app.activeDoc();
  if (part?.kind !== "part" || app.linkedReadOnly?.(part)) throw new Error("iFeature einfügen: erst ein (nicht verknüpftes) Bauteil öffnen");
  const r = placeIFeature(v, targetFrame(plane, { offset, rotate, flip }), { values, params: part.params || [], names: part.features.map((f) => f.name), newId: () => uid("f") });
  app.edit(`iFeature »${v.name}«`, () => {
    if (r.params.length) part.params = [...(part.params || []), ...r.params];
    part.features.push(...r.features);
  });
  app.selectFeature(r.features.at(-1).id);
  return r;
}

/** Dialog »iFeature einfügen«: Bibliothek, Ziel-Ebene, Lage, Parameterwerte; Import/Export/Löschen */
export function insertDialog(app) {
  const part = app.activeDoc();
  if (part?.kind !== "part") return toast("iFeature einfügen: erst ein Bauteil öffnen");
  const face = (app.selHits || []).find((x) => x.kind === "face" && x.info?.type === "PLANE");
  const facePlane = face ? planeFromFace(face.info.point, face.info.normal) : null;
  let list = listIFeatures(), cur = list[0] || null, values = {};
  const pick = h("select", { class: "inp" });
  const where = h("select", { class: "inp" }, ...(facePlane ? [h("option", { value: "face" }, "gewählte Fläche")] : []), ...Object.entries(BASE_PLANES).map(([k, p]) => h("option", { value: k }, p.label)));
  const off = h("input", { class: "inp", value: "0" }), rot = h("input", { class: "inp", value: "0" }), flip = h("input", { type: "checkbox" });
  const params = h("div"), info = h("p", { class: "muted", style: { margin: "4px 0 8px" } });
  const draw = () => {
    pick.replaceChildren(...list.map((v) => h("option", { value: v.name, selected: v === cur }, v.name)));
    info.textContent = cur ? [cur.description, ifeatureSummary(cur)].filter(Boolean).join(" – ") : "Bibliothek leer – erst »iFeature erstellen« oder eine .pbif-Datei importieren";
    values = {};
    params.replaceChildren(...(cur?.params || []).map((p) => {
      const inp = h("input", { class: "inp", value: p.expr, style: { fontFamily: "var(--din)" } });
      inp.addEventListener("change", () => { values[p.name] = inp.value.trim(); });
      return h("div", { class: "field" }, h("label", {}, p.name + (p.comment ? ` (${p.comment})` : "")), inp);
    }));
  };
  pick.addEventListener("change", () => { cur = list.find((v) => v.name === pick.value) || null; draw(); });
  const reload = (name) => { list = listIFeatures(); cur = list.find((v) => v.name === name) || list[0] || null; draw(); };
  const body = h("div", {},
    h("div", { class: "field" }, h("label", {}, "iFeature"), pick), info,
    h("div", { class: "field" }, h("label", {}, "Ebene"), where),
    h("div", { class: "field" }, h("label", {}, "Abstand (mm)"), off),
    h("div", { class: "field" }, h("label", {}, "Drehung um die Normale (°)"), rot),
    h("label", { class: "check" }, flip, " auf die andere Seite (umkehren)"),
    h("h4", { style: { margin: "10px 0 4px" } }, "Parameter"), params,
    h("div", { class: "btn-row", style: { marginTop: "10px" } },
      h("button", { class: "btn", onclick: async () => { const v = await importFile(app); if (v) reload(v.name); } }, "Importieren …"),
      h("button", { class: "btn", onclick: () => cur && app.files.saveText(JSON.stringify(cur, null, 1), safeName(cur.name) + ".pbif", "application/json", [{ name: "PBCAD-iFeature", extensions: ["pbif"] }]) }, "Exportieren …"),
      h("button", { class: "btn", onclick: async () => { if (cur && await confirmDialog("iFeature löschen", `»${cur.name}« aus der Bibliothek löschen?`, { ok: "Löschen", danger: true })) { deleteIFeature(cur.name); reload(); } } }, "Löschen")));
  draw();
  modal({ title: "iFeature einfügen", width: "520px", body, buttons: [{ label: "Abbrechen" }, { label: "Einfügen", primary: true, run: () => {
    if (!cur) return false;
    const num = (inp, label) => { const x = Number(String(inp.value).replace(",", ".")); if (!Number.isFinite(x)) throw new Error(`${label}: Zahl angeben`); return x; };
    try {
      const r = insertIFeature(app, cur, { plane: where.value === "face" ? facePlane : { ref: where.value }, offset: num(off, "Abstand"), rotate: num(rot, "Drehung"), flip: flip.checked, values });
      const ren = Object.entries(r.renamed);
      toast(`iFeature »${cur.name}« eingefügt (${r.features.length} Features)` + (ren.length ? ` – Parameter umbenannt: ${ren.map(([a, b]) => `${a} → ${b}`).join(", ")}` : ""), { kind: "ok", timeout: 6000 });
    } catch (e) { toast(e.message, { kind: "err" }); return false; }
  } }] });
}

async function importFile(app) {
  let text = null;
  if (app.files.bridge) { const f = await app.files.bridge.openFile({ filters: [{ name: "PBCAD-iFeature", extensions: ["pbif", "json"] }] }); text = f?.data ?? null; }
  else {
    text = await new Promise((res) => {
      const inp = h("input", { type: "file", accept: ".pbif,.json", style: { display: "none" } });
      inp.addEventListener("change", async () => { res(inp.files[0] ? await inp.files[0].text() : null); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  }
  if (text == null) return null;
  let v;
  try { v = JSON.parse(text); } catch { toast("Datei ist kein iFeature (kein JSON)", { kind: "err" }); return null; }
  const ok = validateIFeature(v);
  if (!ok.ok) { toast(ok.error, { kind: "err" }); return null; }
  saveIFeature(ok.value);
  toast(`iFeature »${v.name}« in die Bibliothek übernommen`, { kind: "ok" });
  return v;
}
