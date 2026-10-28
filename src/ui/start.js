// Startbildschirm nach dem Vorbild gängiger Konstruktionsprogramme: links Programm, Öffnen, Neu (mit Vorlagen)
// und Hilfe-Verweise, rechts die zuletzt verwendeten Projekte als Kacheln mit Vorschaubild oder als Liste.
import { h, icon, contextMenu, modal, toast } from "./dom.js";
import { RECENT_SORTS, sortRecent, filterRecent, recentDate, recentSize } from "../core/recent.js";

const RELEASES_URL = "https://github.com/patrickbrundiers-dev/Mein-eigenes-Inventor/releases";
const SEEN_KEY = "pbcad.neuigkeitenGesehen";

export class StartScreen {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("start");
    this.recent = [];
    this.filter = "";
  }
  get bridge() { return window.werkcad || null; }

  async render() {
    const app = this.app;
    const rec = await app.files.recovery();
    this.recent = [];
    this.loadError = null;
    try { this.recent = ((await this.bridge?.recentFiles?.()) || []).filter((e) => e && typeof e === "object"); } catch (e) { this.loadError = e.message; }
    const version = this.bridge?.version || "";
    const seen = readSeen();
    const news = !!version && seen !== version;

    const newBtn = h("button", { class: "st-btn st-primary", onclick: () => app.newProject() }, icon("new"), h("span", {}, "Neu"));
    const dropBtn = h("button", { class: "st-btn st-drop", title: "Neu aus Vorlage", "aria-label": "Neu aus Vorlage", onclick: (e) => this.templateMenu(e) }, icon("down"));
    const link = (ic, label, run, extra) => h("button", { class: "st-link", onclick: run }, icon(ic), h("span", {}, label), extra || null);

    const side = h("aside", { class: "st-side" },
      h("div", { class: "st-brand" },
        h("h1", {}, "PB", h("span", {}, "CAD")),
        h("small", {}, version ? "Version " + version : "Browser-Version")),
      h("p", { class: "st-claim" }, "Bauteile, Rohr- und Profilkonstruktionen, Baugruppen und Zeichnungen"),
      h("div", { class: "st-actions" },
        h("button", { class: "st-btn", onclick: () => app.files.open() }, icon("open"), h("span", {}, "Öffnen…"), kbd(app, "file.open")),
        h("div", { class: "st-split" }, newBtn, dropBtn)),
      rec && rec.project?.docs?.length ? h("div", { class: "st-restore" },
        h("small", {}, "Nicht gespeicherte Sitzung"),
        h("button", { class: "st-link", title: rec.path || "", onclick: () => app.setProject(rec.project, rec.path) }, icon("undo"),
          h("span", {}, `${rec.project.name} wiederherstellen`)),
        h("div", { class: "st-meta" }, recentDate(rec.time))) : null,
      h("nav", { class: "st-links", "aria-label": "Hilfe und Verweise" },
        link("star", "Neuigkeiten", () => { writeSeen(version); window.open(RELEASES_URL, "_blank"); this.render(); }, news ? h("i", { class: "st-dot", title: "Neue Version installiert" }) : null),
        link("play", "Erste Schritte", () => firstSteps(app)),
        link("search", "Befehl suchen", () => app.commands.exec("app.search"), kbd(app, "app.search")),
        link("steel", "Beispielprojekt", () => app.openExample()),
        link("settings", "Anwendungsoptionen", () => app.props.settingsDialog()),
        link("info", "Über PBCAD", () => app.props.aboutDialog())),
      h("div", { class: "st-foot" }, "Projektionsmethode 1 · Maße in mm"));

    this.listEl = h("div", { class: "st-recent" });
    const setPref = (k, v) => { const r = app.prefs.set(k, v); if (!r.ok) toast(r.error, { kind: "err" }); this.renderRecent(); this.renderHead(); };
    this.head = h("div", { class: "st-head" });
    this.renderHead = () => {
      const v = app.prefs.get("allgemein.startAnsicht");
      // replaceChildren schreibt null als Text, darum leere Einträge vorher entfernen
      this.head.replaceChildren(...[
        h("h2", {}, "Zuletzt verwendet"),
        h("div", { class: "st-views", role: "group", "aria-label": "Ansicht" },
          h("button", { class: "icon-btn" + (v === "liste" ? " on" : ""), title: "Liste", "aria-pressed": String(v === "liste"), onclick: () => setPref("allgemein.startAnsicht", "liste") }, icon("list")),
          h("button", { class: "icon-btn" + (v !== "liste" ? " on" : ""), title: "Kacheln", "aria-pressed": String(v !== "liste"), onclick: () => setPref("allgemein.startAnsicht", "kacheln") }, icon("tiles"))),
        h("div", { class: "rb-spacer" }),
        this.recent.length > 4 ? h("input", { class: "inp st-filter", type: "search", placeholder: "Suchen…", value: this.filter, "aria-label": "Zuletzt verwendete durchsuchen",
          oninput: (e) => { this.filter = e.target.value; this.renderRecent(); } }) : null,
        h("label", { class: "st-sort" }, "Sortieren nach",
          h("select", { class: "inp", onchange: (e) => setPref("allgemein.startSortierung", e.target.value) },
            ...RECENT_SORTS.map((o) => h("option", { value: o.value, selected: o.value === app.prefs.get("allgemein.startSortierung") }, o.label))))].filter(Boolean));
    };
    this.renderHead();
    this.renderRecent();
    this.el.replaceChildren(h("div", { class: "st" }, side, h("main", { class: "st-main" }, this.head, this.listEl)));
  }

  renderRecent() {
    const app = this.app;
    const list = filterRecent(sortRecent(this.recent, app.prefs.get("allgemein.startSortierung")), this.filter);
    if (!this.recent.length) {
      this.listEl.replaceChildren(h("div", { class: "st-empty" }, icon("open"),
        h("p", {}, this.bridge ? (this.loadError ? "Liste nicht lesbar: " + this.loadError : "Noch keine Projekte geöffnet.") : "Die zuletzt verwendeten Dateien zeigt die Desktop-Version."),
        h("p", { class: "hint" }, "Mit »Öffnen…« eine .wcad-Datei wählen, mit »Neu« ein Projekt anlegen oder das Beispielprojekt ansehen.")));
      return;
    }
    if (!list.length) { this.listEl.replaceChildren(h("p", { class: "hint st-none" }, `Nichts gefunden für »${this.filter}«.`)); return; }
    const open = (e) => app.files.open(e.path);
    const menu = (ev, e) => { ev.preventDefault(); this.entryMenu(ev, e); };
    if (app.prefs.get("allgemein.startAnsicht") === "liste") {
      this.listEl.replaceChildren(h("table", { class: "st-list" },
        h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Ordner"), h("th", {}, "Geändert"), h("th", { class: "num" }, "Größe"))),
        h("tbody", {}, ...list.map((e) => h("tr", { tabindex: "0", title: e.path, ondblclick: () => open(e), onkeydown: (k) => { if (k.key === "Enter") open(e); }, oncontextmenu: (ev) => menu(ev, e) },
          h("td", {}, h("button", { class: "st-name", onclick: () => open(e) }, e.preview ? h("img", { src: e.preview, alt: "" }) : icon("part"), h("span", {}, e.name))),
          h("td", { class: "st-folder" }, e.folder),
          h("td", {}, recentDate(e.mtime)),
          h("td", { class: "num" }, recentSize(e.size)))))));
      return;
    }
    this.listEl.replaceChildren(h("div", { class: "st-tiles" }, ...list.map((e) =>
      h("button", { class: "st-tile", title: e.path, onclick: () => open(e), oncontextmenu: (ev) => menu(ev, e) },
        h("div", { class: "st-thumb" }, e.preview ? h("img", { src: e.preview, alt: "" }) : h("div", { class: "st-nothumb" }, icon("part"), h("span", {}, "keine Vorschau"))),
        h("b", {}, e.name),
        h("small", {}, recentDate(e.mtime))))));
  }

  firstSteps() { firstSteps(this.app); }

  entryMenu(ev, e) {
    const app = this.app, b = this.bridge;
    contextMenu(ev.clientX, ev.clientY, [
      { label: "Öffnen", icon: "open", run: () => app.files.open(e.path) },
      { label: "Schreibgeschützt öffnen", icon: "eye", run: () => app.files.open(e.path, { readOnly: true }) },
      b?.revealRecent ? { label: "Im Ordner anzeigen", icon: "open", run: () => b.revealRecent(e.path) } : null,
      "-",
      b?.removeRecent ? { label: "Aus der Liste entfernen", icon: "trash", run: async () => { await b.removeRecent(e.path); this.render(); } } : null,
    ]);
  }

  templateMenu(ev) {
    const app = this.app;
    const r = ev.currentTarget.getBoundingClientRect();
    const fresh = async (fill) => { if (!(await app.files.confirmDiscard())) return; app.setProject(freshProject()); fill(); };
    contextMenu(r.left, r.bottom + 2, [
      { label: "Bauteil", icon: "part", run: () => fresh(() => app.newPart()) },
      { label: "Rahmen (Profile entlang einer Skizze)", icon: "frame", run: () => fresh(() => { app.newPart("Rahmen"); app.beginSketchCreation(); }) },
      { label: "Baugruppe mit einem Bauteil", icon: "assembly", run: () => fresh(() => app.startContent("baugruppe")) },
      { label: "Leeres Projekt", icon: "new", run: () => fresh(() => app.startContent("leer")) },
      "-",
      { label: "Beispielprojekt (Schweißrahmen mit Zeichnung)", icon: "steel", run: () => app.openExample() },
    ]);
  }
}

function firstSteps(app) {
  const step = (n, title, text) => h("li", {}, h("b", {}, title), h("span", {}, text));
  modal({ title: "Erste Schritte", width: 560, body: h("div", {},
    h("ol", { class: "st-steps" },
      step(1, "Neues Bauteil", "»Neu« legt ein Projekt mit einem Bauteil an. Über den Pfeil daneben gibt es Rahmen, Baugruppe und das Beispielprojekt."),
      step(2, "Skizze zeichnen", "Ebene wählen, Linie, Rechteck oder Kreis zeichnen. Maße direkt eintippen, Tab wechselt zum nächsten Wert."),
      step(3, "Körper erzeugen", "Extrusion, Drehung oder Profil entlang der Skizze. Bohrungen, Fasen und Rundungen kommen danach."),
      step(4, "Baugruppe", "Bauteile platzieren und mit Fläche an Fläche, Bündig oder Konzentrisch ausrichten. Geländer, Tore und Treppen erzeugen die Generatoren."),
      step(5, "Zeichnung und Fertigung", "»Zeichnung ableiten« erstellt Ansichten mit Maßen; Zuschnittliste, DXF und STEP stehen unter Export.")),
    h("p", { class: "hint" }, "Jeden Befehl findet die Befehlssuche (", app.ribbon.kbd("app.search") || "Strg+K", ").")),
  buttons: [{ label: "Beispielprojekt öffnen", run: () => app.openExample() }, { label: "Schließen", primary: true }] });
}

function kbd(app, id) { const k = app.ribbon.kbd(id); return k ? h("span", { class: "kbd" }, k) : null; }
function readSeen() { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } }
function writeSeen(v) { try { if (v) localStorage.setItem(SEEN_KEY, v); } catch { /* */ } }
function freshProject() {
  return { format: "werkcad", version: 1, name: "Neues Projekt", docs: [], created: new Date().toISOString() };
}
