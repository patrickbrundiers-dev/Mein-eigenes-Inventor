// Kurzhilfe (F1): zum Knopf unter der Maus bzw. zum gewählten Feature die Beschreibung, sonst eine Übersicht
// der Bedienung (Maus, Markierungsmenü, Tastenhinweise, Rundgang).

import { h, modal } from "./dom.js";
import { BEFEHLSHILFE } from "../core/befehlshilfe.js";
import { startTour } from "./tour.js";

let mouse = { x: -1, y: -1 };
addEventListener("pointermove", (e) => { mouse = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });

export function showHelp(app) {
  const under = mouse.x >= 0 ? document.elementFromPoint(mouse.x, mouse.y)?.closest?.("[data-tip]") : null;
  if (under) return commandHelp(app, under.dataset.tip, under.dataset.desc, under.dataset.kbd, under.querySelector("svg"));
  const f = app.mode === "part" && app.sel?.type === "feature" ? app.feature(app.sel.id) : null;
  const fd = f && (BEFEHLSHILFE[f.type] || BEFEHLSHILFE[f.gen]);
  if (fd) return commandHelp(app, f.name, fd);
  overview(app);
}

function commandHelp(app, title, desc, kbd, svg) {
  modal({ title: "Hilfe: " + title, width: 460, body: h("div", { class: "help-cmd" },
    svg ? h("div", { class: "tip-ic help-ic" }, svg.cloneNode(true)) : null,
    h("div", {},
      h("p", {}, desc || "Zu diesem Befehl gibt es noch keine Kurzbeschreibung."),
      kbd ? h("p", { class: "hint" }, "Tastenkürzel: ", h("span", { class: "kbd" }, kbd)) : null,
      h("p", { class: "hint" }, "Alle Befehle findet die Befehlssuche (", app.ribbon.kbd("app.search") || "Strg+K", ")."))),
  buttons: [{ label: "Übersicht", run: () => { setTimeout(() => overview(app), 0); } }, { label: "Schließen", primary: true }] });
}

function overview(app) {
  const k = (id, fb) => h("span", { class: "kbd" }, app.ribbon.kbd(id) || fb);
  const row = (key, text) => h("tr", {}, h("th", {}, key), h("td", {}, text));
  modal({ title: "Kurzhilfe", width: 600, body: h("div", { class: "help-over" },
    h("p", {}, "F1 über einem Knopf des Menübands erklärt diesen Knopf; mit einem gewählten Feature erklärt F1 das Feature."),
    h("h3", {}, "Maus im 3D-Fenster"),
    h("table", { class: "help-table" },
      row("Linke Taste", "Kante oder Fläche wählen (Strg/Umschalt: mehrere); ziehen = Fensterauswahl"),
      row("Rechtsklick", "Markierungsmenü: häufige Befehle im Kreis, seltene als Liste darunter"),
      row("Rechte Taste ziehen", "Drehen (oder wie in den Anwendungsoptionen eingestellt)"),
      row("Mittlere Taste", "Schwenken; Rad: zoomen")),
    h("h3", {}, "Tastatur"),
    h("table", { class: "help-table" },
      row(k("app.search", "Strg+K"), "Befehl suchen und ausführen"),
      row(h("span", { class: "kbd" }, "Alt"), "Tastenhinweise: Buchstabe wählt den Reiter, dann den Knopf"),
      row(k("view.fit", "F6"), "Alles zeigen"),
      row(k("model.rebuild", "F5"), "Neu berechnen"),
      row(h("span", { class: "kbd" }, "Esc"), "Werkzeug oder Auswahl abbrechen")),
    h("p", { class: "hint" }, "Kürzel lassen sich in den Anwendungsoptionen unter »Werkzeuge und Tastatur« ändern.")),
  buttons: [{ label: "Rundgang starten", run: () => { setTimeout(() => startTour(app), 0); } }, { label: "Schließen", primary: true }] });
}

