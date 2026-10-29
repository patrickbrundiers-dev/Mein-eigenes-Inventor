// Dokument-Reiter am unteren Fensterrand (wie Inventor): jedes geöffnete Bauteil, jede Baugruppe und Zeichnung
// als Reiter mit Symbol, Name und Schließen-Kreuz. Links Startseite und Liste aller Dokumente des Projekts.
// »Offen« heißt: in dieser Sitzung angezeigt; die Dokumente bleiben Teil des Projekts, Schließen löscht nichts.

import { h, icon, contextMenu } from "./dom.js";

const KIND_LABEL = { part: "Bauteil", assembly: "Baugruppe", drawing: "Zeichnung" };

export class DocTabs {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("doctabs");
  }
  render() {
    const app = this.app;
    if (!this.el) return;
    const open = app.openIds.map((id) => app.doc(id)).filter(Boolean);
    const home = app.mode === "start";
    const tabs = h("div", { class: "dt-tabs", role: "tablist", "aria-label": "Offene Dokumente" },
      ...open.map((d) => {
        const active = !home && d.id === app.activeId;
        return h("div", { class: "dt-tab" + (active ? " active" : ""), role: "tab", "aria-selected": String(active), tabindex: active ? "0" : "-1", title: `${KIND_LABEL[d.kind] || ""} ${d.name}${d.number ? " · " + d.number : ""}`, "data-doc": d.id,
          onclick: () => { if (!active) app.openDoc(d.id); },
          onauxclick: (e) => { if (e.button === 1) { e.preventDefault(); app.closeDoc(d.id); } },
          onkeydown: (e) => this.key(e, open, d),
          oncontextmenu: (e) => { e.preventDefault(); this.menu(e, d); } },
          icon(d.kind), h("span", { class: "dt-name" }, d.name),
          h("button", { class: "dt-x", title: "Schließen", "aria-label": `${d.name} schließen`, tabindex: "-1", onclick: (e) => { e.stopPropagation(); app.closeDoc(d.id); } }, icon("cancel")));
      }));
    this.el.replaceChildren(
      h("button", { class: "dt-btn" + (home ? " on" : ""), title: "Startseite", "aria-label": "Startseite", onclick: () => app.goHome() }, icon("tiles")),
      h("button", { class: "dt-btn", title: "Alle Dokumente des Projekts", "aria-label": "Alle Dokumente", onclick: (e) => this.listMenu(e) }, icon("list")),
      tabs);
    tabs.querySelector(".dt-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  key(e, open, d) {
    const i = open.indexOf(d);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
    if (e.key === "Delete") { e.preventDefault(); return this.app.closeDoc(d.id); }
    if (n === undefined || !open.length) return;
    e.preventDefault();
    const next = open[(n + open.length) % open.length];
    this.app.openDoc(next.id);
    this.el.querySelector(`.dt-tab[data-doc="${next.id}"]`)?.focus();
  }
  menu(e, d) {
    const app = this.app;
    contextMenu(e.clientX, e.clientY, [
      { label: "Schließen", icon: "cancel", run: () => app.closeDoc(d.id) },
      { label: "Andere schließen", run: () => app.closeOtherDocs(d.id), disabled: app.openIds.length < 2 },
      { label: "Alle schließen", run: () => app.closeOtherDocs(null) },
    ]);
  }
  listMenu(e) {
    const app = this.app;
    const r = e.currentTarget.getBoundingClientRect();
    const items = [];
    for (const kind of ["assembly", "part", "drawing"]) {
      const docs = app.project.docs.filter((d) => d.kind === kind);
      if (!docs.length) continue;
      if (items.length) items.push("-");
      for (const d of docs) items.push({ label: d.name + (app.openIds.includes(d.id) ? "  •" : ""), icon: kind, run: () => app.openDoc(d.id) });
    }
    if (!items.length) items.push({ label: "Keine Dokumente im Projekt", disabled: true, run: () => {} });
    const m = contextMenu(r.left, r.top, items);
    // über der Leiste aufklappen
    m.style.top = Math.max(4, r.top - m.getBoundingClientRect().height - 4) + "px";
  }
}
