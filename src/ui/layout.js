// Seitenpanels andocken (links/rechts, auch beide auf einer Seite untereinander), Breite am Rand ziehen,
// ein- und ausblenden. Die Anordnung steht in der Einstellung oberflaeche.layout (src/core/layout.js).
import { h } from "./dom.js";
import { layoutColumns, DEFAULT_LAYOUT, WIDTH_MIN, WIDTH_MAX } from "../core/layout.js";

export class Docking {
  constructor(app) {
    this.app = app;
    this.ws = document.getElementById("workspace");
    this.panels = { browser: document.getElementById("browser"), props: document.getElementById("props") };
    this.docks = { left: h("div", { class: "dock dock-left" }), right: h("div", { class: "dock dock-right" }) };
    const stage = document.getElementById("stage");
    this.ws.insertBefore(this.docks.left, stage);
    this.ws.append(this.docks.right);
    for (const side of ["left", "right"]) this.docks[side].append(this.splitter(side));
    this.modeHidden = [];
  }
  get layout() { return this.app.prefs.get("oberflaeche.layout") || DEFAULT_LAYOUT; }
  /** Griff am inneren Rand: Ziehen ändert die Breite, gespeichert beim Loslassen */
  splitter(side) {
    const grip = h("div", { class: "dock-grip", title: "Breite ziehen · Doppelklick: Standardbreite" });
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = this.docks[side].getBoundingClientRect().width;
      const key = side === "left" ? "wLeft" : "wRight";
      const move = (ev) => {
        const w = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, w0 + (side === "left" ? 1 : -1) * (ev.clientX - x0)));
        this.live = { ...this.layout, [key]: Math.round(w) };
        this.apply(this.live);
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("lostpointercapture", up);
        if (this.live) this.app.prefs.set("oberflaeche.layout", this.live);
        this.live = null;
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("lostpointercapture", up);
    });
    grip.addEventListener("dblclick", () => this.app.prefs.set("oberflaeche.layout", { ...this.layout, [side === "left" ? "wLeft" : "wRight"]: DEFAULT_LAYOUT[side === "left" ? "wLeft" : "wRight"] }));
    return grip;
  }
  /** Modus blendet Panels aus (Startseite: kein Browser) */
  setModeHidden(list) { this.modeHidden = list; this.apply(); }
  apply(layout = this.layout) {
    const L = layoutColumns(layout, this.modeHidden);
    this.ws.style.gridTemplateColumns = L.columns;
    for (const side of ["left", "right"]) {
      const dock = this.docks[side], grip = dock.querySelector(".dock-grip");
      // Reihenfolge: Browser über Eigenschaften; der Griff bleibt stehen (Umhängen würde das Ziehen abbrechen)
      const now = [...dock.children].filter((el) => el !== grip);
      if (now.length !== L[side].length || L[side].some((p, i) => now[i] !== this.panels[p])) for (const p of L[side]) dock.insertBefore(this.panels[p], grip);
      dock.classList.toggle("empty", !(side === "left" ? L.wLeft : L.wRight)); // Spalte 0 px, ohne Rahmen
    }
    for (const [p, el] of Object.entries(this.panels)) el.hidden = L.hidden.includes(p);
  }
}
