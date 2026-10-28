// Eigene Teilebibliothek (ST12): Bauteil ablegen, Einträge suchen, in die Baugruppe einfügen. Rechnung in
// src/core/teilebibliothek.js; Ablage über die Electron-Brücke (Benutzerordner) oder localStorage im Browser.

import { h, toast, modal, confirmDialog } from "./dom.js";
import { uid } from "../core/examples.js";
import { libraryEntry, insertEntry, filterEntries, entryCategories, validEntry } from "../core/teilebibliothek.js";

const KEY = "pbcad.teilebibliothek";
const bridge = () => (typeof window !== "undefined" && window.werkcad?.libraryList ? window.werkcad : null);
const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLocal = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };

/** alle Einträge (gültige) */
export async function listLibrary() {
  const b = bridge();
  return (b ? await b.libraryList() : readLocal()).filter(validEntry);
}
export async function writeLibrary(entry) {
  const b = bridge();
  if (b) return b.libraryWrite(entry);
  const list = readLocal().filter((e) => e.id !== entry.id);
  if (!writeLocal([...list, entry])) throw new Error("Browser-Speicher voll – Eintrag nicht gespeichert");
  return true;
}
export async function deleteLibrary(id) {
  const b = bridge();
  if (b) return b.libraryDelete(id);
  return writeLocal(readLocal().filter((e) => e.id !== id));
}

/** Bauteil (aktives Bauteil oder gewählte Komponente der Baugruppe) in die Bibliothek ablegen */
export async function saveToLibrary(app, part = null) {
  const d = app.activeDoc();
  if (!part) {
    if (d?.kind === "part") part = d;
    else if (d?.kind === "assembly" && app.sel?.type === "component") part = app.doc(d.components.find((c) => c.id === app.sel.id)?.part);
  }
  if (part?.kind !== "part") return toast("Erst ein Bauteil öffnen oder in der Baugruppe eine Komponente wählen");
  const list = await listLibrary();
  const old = part.library && list.find((e) => e.id === part.library.id);
  const name = h("input", { class: "inp", value: old?.name || part.name });
  const cats = h("datalist", { id: "lib-cats" }, ...entryCategories(list).map((c) => h("option", { value: c })));
  const cat = h("input", { class: "inp", list: "lib-cats", value: old?.category || "", placeholder: "z. B. Anschlüsse, Beschläge, Normteile" });
  const desc = h("textarea", { class: "inp", rows: 3 }, old?.description || "");
  const replace = h("input", { type: "checkbox", checked: !!old });
  const row = (l, el) => h("label", { class: "row" }, h("span", {}, l), el);
  modal({ title: "In Bibliothek ablegen", width: "520px",
    body: h("div", {}, h("p", { class: "hint" }, "Das Bauteil wird mit Werkstoff und Vorschaubild in deiner Teilebibliothek gespeichert und steht in allen Projekten zur Verfügung (Baugruppe → Aus Bibliothek)."),
      row("Name", name), row("Kategorie", cat), cats, row("Beschreibung", desc), old ? h("label", { class: "row" }, replace, h("span", {}, `Eintrag »${old.name}« ersetzen`)) : null),
    buttons: [{ label: "Abbrechen" }, { label: "Ablegen", primary: true, run: async () => {
      let thumb = null;
      if (app.activeDoc() === part) try { thumb = app.viewer.thumbnail({ width: 240, height: 180 }); } catch { /* ohne Bild */ }
      else thumb = old?.thumb || null;
      const id = old && replace.checked ? old.id : uid("lib");
      app.embedMaterials?.();
      const e = libraryEntry(app.project, part, { id, name: name.value, category: cat.value, description: desc.value, thumb });
      try { await writeLibrary(e); } catch (err) { return toast("Nicht gespeichert: " + err.message, { kind: "err" }); }
      app.edit("In Bibliothek", () => { part.library = { id: e.id, time: e.time, name: e.name }; }, { rebuild: false });
      toast(`»${e.name}« in der Teilebibliothek${e.category ? " unter " + e.category : ""}`, { kind: "ok" });
    } }] });
}

/** Eintrag als Komponente in die aktive Baugruppe holen; mit Platzier-Ablauf am Mauszeiger, wenn vorhanden */
export function insertFromLibrary(app, entry) {
  const asm = app.activeDoc();
  if (asm?.kind !== "assembly") return toast("Erst eine Baugruppe öffnen");
  let doc;
  app.edit("Aus Bibliothek", () => {
    doc = insertEntry(app.project, entry, uid("p")).doc;
    if (!app.beginPlacing) {
      const n = asm.components.filter((c) => c.part === doc.id).length;
      asm.components.push({ id: uid("c"), part: doc.id, name: `${doc.name}:${n + 1}`, pos: [0, 0, 0], rot: [0, 0, 0], fixed: asm.components.length === 0 });
    }
  });
  app.syncMaterials?.();
  if (app.beginPlacing) app.beginPlacing(doc.id);
  else toast(`»${doc.name}« eingefügt – mit Abhängigkeiten oder Verschieben ausrichten`, { kind: "ok" });
}

/** Bibliothek durchsuchen: Liste mit Vorschaubild, Suche, Kategorie; Einfügen (Baugruppe) und Löschen */
export async function libraryDialog(app) {
  let list = await listLibrary();
  const inAsm = app.activeDoc()?.kind === "assembly";
  const q = h("input", { class: "inp", placeholder: "Suchen …", type: "search" });
  const cat = h("select", { class: "inp" });
  const grid = h("div", { class: "lib-grid", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "8px", maxHeight: "60vh", overflow: "auto", marginTop: "8px" } });
  let dlg = null;
  const fillCats = () => cat.replaceChildren(h("option", { value: "" }, "Alle Kategorien"), ...entryCategories(list).map((c) => h("option", { value: c }, c)));
  const card = (e) => h("div", { class: "lib-card", style: { border: "1px solid var(--line, #ccd)", borderRadius: "6px", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }, title: e.description || e.name },
    e.thumb ? h("img", { src: e.thumb, alt: "", style: { width: "100%", height: "110px", objectFit: "contain", background: "#f4f6f8" } }) : h("div", { style: { height: "110px", background: "#f4f6f8" } }),
    h("b", {}, e.name), h("span", { class: "hint" }, [e.category, e.number, e.material].filter(Boolean).join(" · ") || "–"),
    h("div", { class: "btn-row" },
      inAsm ? h("button", { class: "btn primary", onclick: () => { dlg?.close(); insertFromLibrary(app, e); } }, "Einfügen") : null,
      h("button", { class: "btn danger", onclick: async () => { if (!(await confirmDialog("Aus der Bibliothek löschen", `»${e.name}« wird aus der Teilebibliothek entfernt (in allen Projekten).`, { ok: "Löschen", danger: true }))) return; await deleteLibrary(e.id); list = list.filter((x) => x.id !== e.id); fillCats(); render(); } }, "Löschen")));
  const render = () => {
    const shown = filterEntries(list, q.value, cat.value);
    grid.replaceChildren(...(shown.length ? shown.map(card) : [h("p", { class: "hint" }, list.length ? "Nichts gefunden." : "Die Bibliothek ist leer. Ein Bauteil legst du mit »In Bibliothek ablegen« ab (Verwalten bzw. Baugruppe → Verwalten).")]));
  };
  q.oninput = render; cat.onchange = render;
  fillCats(); render();
  const b = bridge();
  dlg = modal({ title: "Teilebibliothek", width: "820px", body: h("div", {}, h("div", { class: "btn-row" }, q, cat), grid),
    buttons: [...(b?.libraryOpenFolder ? [{ label: "Ordner öffnen", run: () => { b.libraryOpenFolder(); return false; } }] : []), { label: "Schließen" }] });
}
