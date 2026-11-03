// Arbeitsabläufe nach Inventor/SolidWorks (AW1–AW5): Wo verwendet, Zeichnung öffnen, Kopie konstruieren,
// Unabhängig machen, eigene Eigenschaften, Stücklistenstruktur. Rechnung in src/core (verwendung, kopiekonstruieren,
// eigenschaften, subasm); hier nur Abschnitte im Eigenschaftenfeld und Dialoge.
import { h, toast, modal } from "./dom.js";
import { whereUsed, whereUsedText } from "../core/verwendung.js";
import { designItems, copyDesign, independentCopy, renamed, COPY, REUSE } from "../core/kopiekonstruieren.js";
import { customProps, setCustomProp, removeCustomProp, syncDrawingTitles } from "../core/eigenschaften.js";
import { COMPONENT_BOM, ASSEMBLY_BOM } from "../core/subasm.js";

const KIND = { part: "Bauteil", assembly: "Baugruppe", drawing: "Zeichnung" };

// ---------- AW1 Wo verwendet ----------
const docLink = (app, d, extra = "") => h("a", { href: "#", class: "doclink", "data-doc": d.id, onclick: (e) => { e.preventDefault(); app.openDoc(d.id); } }, (d.number ? d.number + " – " : "") + d.name + extra);

/** Zeichnungen eines Dokuments öffnen: eine direkt, mehrere zur Auswahl (SolidWorks »Zeichnung öffnen«) */
export function openDrawingOf(app, id) {
  const ds = whereUsed(app.project, id).drawings;
  if (!ds.length) return toast("Zu diesem Dokument gibt es noch keine Zeichnung – »Zeichnung ableiten« legt eine an");
  if (ds.length === 1) return app.openDoc(ds[0].id);
  return whereUsedDialog(app, id);
}

/** Liste »Verwendet in« für Eigenschaftenfeld und Dialog */
function usedList(app, w) {
  const li = (d, extra) => h("li", {}, docLink(app, d, extra));
  return h("div", { class: "where-used" },
    w.assemblies.length ? h("div", {}, h("b", {}, "Baugruppen"), h("ul", {}, ...w.assemblies.map((a) => li(a.doc, a.count > 1 ? ` (${a.count}×)` : "")))) : null,
    w.top.length && w.top.some((t) => !w.assemblies.some((a) => a.doc.id === t.id)) ? h("div", {}, h("b", {}, "Oberste Baugruppen"), h("ul", {}, ...w.top.map((d) => li(d)))) : null,
    w.drawings.length ? h("div", {}, h("b", {}, "Zeichnungen"), h("ul", {}, ...w.drawings.map((d) => li(d)))) : null,
    w.derived.length ? h("div", {}, h("b", {}, "Abgeleitete Bauteile"), h("ul", {}, ...w.derived.map((d) => li(d)))) : null);
}

/** Abschnitt »Verwendet in« (Bauteil und Baugruppe) */
export function whereUsedSection(props, doc) {
  const app = props.app;
  const w = whereUsed(app.project, doc.id);
  const empty = !w.assemblies.length && !w.drawings.length && !w.derived.length;
  return props.section("Verwendet in",
    empty ? h("p", { class: "hint" }, "Noch in keiner Baugruppe und keiner Zeichnung.") : usedList(app, w),
    h("div", { class: "btn-row" },
      h("button", { class: "btn", onclick: () => (w.drawings.length ? openDrawingOf(app, doc.id) : app.newDrawing({ kind: doc.kind, id: doc.id })) }, w.drawings.length ? "Zeichnung öffnen" : "Zeichnung ableiten"),
      doc.kind === "assembly" ? h("button", { class: "btn", onclick: () => copyDesignDialog(app, doc.id) }, "Kopie konstruieren…") : null));
}

export function whereUsedDialog(app, id) {
  const d = app.doc(id);
  if (!d) return;
  const w = whereUsed(app.project, id);
  modal({ title: `Wo verwendet: ${d.name}`, width: "460px",
    body: h("div", {}, h("p", { class: "hint" }, `${KIND[d.kind]} · ${whereUsedText(w)}. Ein Klick öffnet das Dokument.`), usedList(app, w)),
    buttons: [{ label: "Schließen", primary: true }] });
}

// ---------- AW4 Eigenschaften ----------
/** Abschnitt »Eigenschaften«: Konstrukteur, Projekt und eigene Felder; im Schriftfeld als {Name} nutzbar */
export function propertiesSection(props, doc) {
  const app = props.app;
  const own = customProps(doc);
  const row = (p) => {
    const inp = h("input", { class: "inp", value: p.value, "aria-label": p.name });
    inp.addEventListener("change", () => app.edit("Eigenschaft", () => { setCustomProp(doc, p.name, inp.value); }, { rebuild: false }));
    return h("div", { class: "field prop-row" }, h("label", {}, p.name), h("div", { style: { display: "flex", gap: "4px" } }, inp,
      h("button", { class: "icon-btn", title: `»${p.name}« entfernen`, onclick: () => app.edit("Eigenschaft entfernen", () => { removeCustomProp(doc, p.name); }, { rebuild: false }) }, "✕")));
  };
  const nameIn = h("input", { class: "inp", placeholder: "Neue Eigenschaft, z. B. Kunde", "aria-label": "Name der neuen Eigenschaft" });
  const add = () => {
    const n = nameIn.value.trim();
    if (!n) return;
    if (own.some((p) => p.name.toLowerCase() === n.toLowerCase())) return toast(`»${n}« gibt es schon`);
    app.edit("Eigenschaft hinzufügen", () => { setCustomProp(doc, n, ""); }, { rebuild: false });
  };
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  return props.section("Eigenschaften",
    props.text("Konstrukteur", doc.designer || "", (v) => app.edit("Konstrukteur", () => { doc.designer = v.trim() || undefined; }, { rebuild: false })),
    props.text("Projekt", doc.projekt || "", (v) => app.edit("Projekt", () => { doc.projekt = v.trim() || undefined; }, { rebuild: false }), { placeholder: app.project?.name ? `leer = ${app.project.name}` : "" }),
    ...own.map(row),
    h("div", { class: "field" }, h("label", {}, "Hinzufügen"), h("div", { style: { display: "flex", gap: "4px" } }, nameIn, h("button", { class: "btn", onclick: add }, "+"))),
    h("p", { class: "hint" }, "Im Schriftfeld der Zeichnung als Platzhalter nutzbar, z. B. {Projekt}, {Konstrukteur} oder {Kunde}."));
}

/** Name oder Nummer ändern und die Schriftfelder der Zeichnungen mitziehen */
export function renameDoc(app, doc, field, value) {
  const label = field === "name" ? "Name" : "Nummer";
  app.edit(label, () => {
    const old = { [field]: doc[field] };
    doc[field] = value;
    syncDrawingTitles(app.project, doc, old);
  }, { rebuild: false });
}

// ---------- AW5 Stücklistenstruktur ----------
export function componentBomField(props, c) {
  return props.select("Stückliste", COMPONENT_BOM.map((x) => [x.value, x.label]), c.bom || "normal",
    (v) => props.app.edit("Stücklistenstruktur", () => { if (v === "normal") delete c.bom; else c.bom = v; }, { rebuild: false }));
}
export function assemblyBomField(props, asm) {
  return props.select("Stücklistenstruktur", ASSEMBLY_BOM.map((x) => [x.value, x.label]), asm.bomStructure || "normal",
    (v) => props.app.edit("Stücklistenstruktur", () => { if (v === "normal") delete asm.bomStructure; else asm.bomStructure = v; }, { rebuild: false }));
}

// ---------- AW3 Unabhängig machen ----------
export function makeIndependent(app, compId) {
  const asm = app.activeDoc();
  if (asm?.kind !== "assembly") return;
  let r;
  app.edit("Unabhängig machen", () => {
    r = independentCopy(app.project, asm, [compId]);
    if (r.doc) app.project.docs.push(r.doc);
  });
  if (r?.error) return toast("Nicht möglich: " + r.error, { kind: "err" });
  toast(`Eigene Kopie »${r.doc.name}« angelegt – Änderungen daran wirken nur noch auf diese Komponente`, { kind: "ok", action: { label: "Bearbeiten", run: () => app.openDoc(r.doc.id) } });
  app.tree.render();
  app.props.render();
}

// ---------- AW2 Kopie konstruieren ----------
export async function copyDesignDialog(app, rootId) {
  const root = app.doc(rootId);
  if (root?.kind !== "assembly") return toast("Kopie konstruieren geht von einer Baugruppe aus");
  const items = designItems(app.project, rootId);
  const choice = new Map(items.map((it) => [it.doc.id, it.action]));
  const prefix = h("input", { class: "inp", value: "", placeholder: "z. B. P24-" });
  const suffix = h("input", { class: "inp", value: " (Kopie)", placeholder: "z. B. -B" });
  const find = h("input", { class: "inp", placeholder: "Text suchen" });
  const repl = h("input", { class: "inp", placeholder: "ersetzen durch" });
  const numbers = h("input", { type: "checkbox", checked: true });
  const naming = () => ({ prefix: prefix.value, suffix: suffix.value, find: find.value, replace: repl.value });
  const body = h("tbody");
  const draw = () => {
    body.replaceChildren(...items.map((it) => {
      const d = it.doc;
      const isRoot = d.id === rootId;
      const srcCopied = !it.drawing || choice.get(d.source.id) === COPY;
      const genCopied = it.locked && d.genAsm ? choice.get(d.genAsm) === COPY : null;
      const act = isRoot ? COPY : it.drawing && !srcCopied ? REUSE : genCopied !== null ? (genCopied ? COPY : REUSE) : choice.get(d.id);
      const sel = h("select", { class: "inp", disabled: isRoot || !!it.locked || (it.drawing && !srcCopied) },
        h("option", { value: COPY, selected: act === COPY }, it.drawing ? "kopieren" : "kopieren"),
        h("option", { value: REUSE, selected: act === REUSE }, it.drawing ? "nicht kopieren" : "wiederverwenden"));
      sel.title = it.locked || (it.drawing && !srcCopied ? "Quelle wird nicht kopiert" : "");
      sel.addEventListener("change", () => { choice.set(d.id, sel.value); draw(); });
      const newName = act === COPY ? renamed(d.name, naming()) : "–";
      return h("tr", { class: act === COPY ? "" : "muted" },
        h("td", { style: { paddingLeft: 4 + it.depth * 14 + "px" } }, (it.drawing ? "Zeichnung: " : d.kind === "assembly" ? "Baugruppe: " : "") + d.name),
        h("td", {}, sel), h("td", {}, newName));
    }));
  };
  for (const inp of [prefix, suffix, find, repl]) inp.addEventListener("input", draw);
  draw();
  const go = await new Promise((res) => modal({ title: `Kopie konstruieren: ${root.name}`, width: "720px",
    body: h("div", {},
      h("p", { class: "hint" }, "Legt die Baugruppe mit den gewählten Teilen und Zeichnungen als neue Dokumente an (wie Inventor »Kopie konstruieren« / SolidWorks »Pack and Go«). Wiederverwendete Teile bleiben gemeinsam; Kaufteile, Normteile und verknüpfte Dateien sind vorab auf »wiederverwenden« gestellt."),
      h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" } },
        h("div", { class: "field" }, h("label", {}, "Präfix"), prefix), h("div", { class: "field" }, h("label", {}, "Suffix"), suffix),
        h("div", { class: "field" }, h("label", {}, "Suchen"), find), h("div", { class: "field" }, h("label", {}, "Ersetzen"), repl)),
      h("label", { class: "chk" }, numbers, "Nummern ebenso umbenennen (sonst leer)"),
      h("div", { style: { maxHeight: "46vh", overflow: "auto", marginTop: "6px" } },
        h("table", { class: "grid copy-design" }, h("thead", {}, h("tr", {}, h("th", {}, "Dokument"), h("th", {}, "Aktion"), h("th", {}, "Neuer Name"))), body))),
    onClose: (v) => res(v),
    buttons: [{ label: "Abbrechen", value: null }, { label: "Kopieren", primary: true, run: () => true }] }));
  if (!go) return null;
  let r;
  app.edit("Kopie konstruieren", () => {
    r = copyDesign(app.project, rootId, { actions: Object.fromEntries(choice), naming: naming(), numbers: numbers.checked });
    app.project.docs.push(...r.docs);
  }, { rebuild: false });
  if (!r?.root) return null;
  const n = r.docs.length;
  toast(`${n} Dokument${n === 1 ? "" : "e"} kopiert – neue Baugruppe »${app.doc(r.root)?.name}« geöffnet`, { kind: "ok", timeout: 6000 });
  app.openDoc(r.root);
  return r;
}
