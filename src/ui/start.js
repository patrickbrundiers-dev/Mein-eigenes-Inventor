// Startbildschirm im Stil eines Zeichnungs-Schriftfelds
import { h, icon } from "./dom.js";

export class StartScreen {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("start");
  }
  async render() {
    const app = this.app;
    const rec = await app.files.recovery();
    let recent = [];
    try { recent = (await window.werkcad?.recentFiles?.()) || []; } catch { /* */ }
    const action = (ic, title, text, run) => h("button", { class: "tb-cell tb-action", onclick: run }, icon(ic), h("div", {}, h("small", {}, text), h("b", {}, title)));
    const version = window.werkcad?.version ? "Version " + window.werkcad.version : "Browser-Version";
    const cells = [
      h("div", { class: "tb-cell tb-brand" },
        h("div", {}, h("small", {}, "Benennung"), h("h1", {}, "Werk", h("span", {}, "CAD"))),
        h("p", {}, "Bauteile skizzieren und bemaßen, Rohre und Rahmen mit Gehrung erzeugen, Baugruppen zusammenstellen und Zeichnungen ableiten.")),
      action("part", "Neues Bauteil", "Skizze, Extrusion, Bohrung", async () => { if (await app.files.confirmDiscard()) { app.setProject(freshProject()); app.newPart(); } }),
      action("frame", "Neuer Rahmen", "Profile entlang einer Skizze", async () => { if (await app.files.confirmDiscard()) { app.setProject(freshProject()); const p = app.newPart("Rahmen"); app.beginSketchCreation(); return p; } }),
      action("open", "Projekt öffnen", "PBCAD-Datei (.wcad)", () => app.files.open()),
      action("steel", "Beispiel ansehen", "Schweißrahmen mit Zeichnung", () => app.openExample()),
    ];
    if (rec && rec.project?.docs?.length) {
      cells.push(h("div", { class: "tb-cell tb-recent" }, h("small", {}, "Wiederherstellen"),
        h("ul", {}, h("li", {}, h("button", { onclick: () => app.setProject(rec.project, rec.path) },
          `Letzte Sitzung: ${rec.project.name} (${new Date(rec.time).toLocaleString("de-DE")})`)))));
    }
    if (recent.length) {
      cells.push(h("div", { class: "tb-cell tb-recent" }, h("small", {}, "Zuletzt geöffnet"),
        h("ul", {}, ...recent.slice(0, 8).map((p) => h("li", {}, h("button", { title: p, onclick: () => app.files.open(p) }, p.split(/[\\/]/).pop()))))));
    }
    cells.push(h("div", { class: "tb-foot" }, h("span", {}, version), h("span", {}, "Projektionsmethode 1 · Maße in mm")));
    this.el.replaceChildren(h("div", { class: "titleblock" }, ...cells));
  }
}
function freshProject() {
  return { format: "werkcad", version: 1, name: "Neues Projekt", docs: [], created: new Date().toISOString() };
}
