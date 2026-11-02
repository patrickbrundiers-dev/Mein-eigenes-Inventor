// Kachel »Nächster Schritt« (Q6) unten mittig im 3D-Fenster bzw. auf dem leeren Blatt. Folgt jeder Statusänderung,
// lässt sich je Dokument und Lage wegklicken und in den Anwendungsoptionen ganz abschalten.
import { h, icon } from "./dom.js";
import { nextSteps } from "../core/naechster.js";
import { t } from "../core/i18n.js";

export class NextStep {
  constructor(app) {
    this.app = app;
    this.dismissed = new Set();
    this.el = h("div", { class: "next-step", hidden: true, role: "region", "aria-label": "Nächster Schritt" });
    document.getElementById("stage").append(this.el);
    this.shown = "";
  }
  update() {
    const app = this.app;
    const d = app.activeDoc?.();
    const s = app.prefs.get("ansicht.naechsterSchritt") === false || app.pick || app.readOnly || app.versionView ? null : nextSteps({ mode: app.mode, doc: d });
    const key = s ? `${d.id}|${app.mode}|${s.key}` : "";
    if (!s || this.dismissed.has(key)) { this.el.hidden = true; this.shown = ""; return; }
    if (key === this.shown && !this.el.hidden) return;
    this.shown = key;
    const btns = s.items.map((it) => {
      const b = app.ribbon.findButton(it.id);
      if (!b) return null;
      return h("button", { class: "ns-btn", "data-id": it.id, onclick: (e) => { this.el.hidden = true; app.ribbon.press(b, e); } }, icon(b.icon || it.icon), h("span", {}, t(it.label)));
    }).filter(Boolean);
    if (!btns.length) { this.el.hidden = true; return; }
    this.el.replaceChildren(
      h("div", { class: "ns-head" }, h("b", {}, s.title), h("span", {}, s.text),
        h("button", { class: "icon-btn ns-x", title: "Ausblenden", "aria-label": "Hinweis ausblenden", onclick: () => { this.dismissed.add(key); this.el.hidden = true; } }, icon("cancel"))),
      h("div", { class: "ns-btns" }, ...btns));
    this.el.classList.toggle("on-sheet", app.mode === "drawing");
    this.el.hidden = false;
  }
}
