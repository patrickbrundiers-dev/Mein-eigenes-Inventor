// »Nebeneinander« (Q5, wie Inventor »Nebeneinander anordnen«): links das 3D-Modell, rechts seine Zeichnung, live.
// Nach jeder Neuberechnung des Modells zeichnet das Blatt neu (Projektion im Hintergrund, ohne die Zeichnung zu öffnen).
// Doppelklick oder »Öffnen« wechselt in die Zeichnung zum Bearbeiten. Breite per Trennleiste, gemerkt je Rechner.
import { drawsDoc } from "../core/blaetter.js";
import { h, icon } from "./dom.js";

const WIDTH_KEY = "pbcad.nebeneinander.breite";
const readWidth = () => { try { const v = Number(localStorage.getItem(WIDTH_KEY)); return v >= 0.2 && v <= 0.8 ? v : 0.45; } catch { return 0.45; } };
const writeWidth = (v) => { try { localStorage.setItem(WIDTH_KEY, String(v)); } catch { /* gesperrt */ } };

/** Zeichnungen, deren Quelle das Dokument ist (Blattquelle oder eine Ansicht) */
export function drawingsOf(project, docId) {
  return (project?.docs || []).filter((d) => d.kind === "drawing" && (drawsDoc(d, docId) || (d.views || []).some((v) => v.source?.id === docId)));
}

export class SideBySide {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.choice = new Map(); // Quelle -> gewählte Zeichnung
    this.key = "";
    this.stage = document.getElementById("stage");
    this.sheet = h("div", { class: "ss-sheet", ondblclick: () => this.openDrawing() });
    this.head = h("div", { class: "ss-head" });
    this.state = h("div", { class: "ss-state", hidden: true });
    this.grip = h("div", { class: "ss-grip", role: "separator", "aria-orientation": "vertical", title: "Breite ziehen", onpointerdown: (e) => this.drag(e) });
    this.el = h("aside", { id: "side-sheet", hidden: true, "aria-label": "Zeichnung nebeneinander" }, this.grip, this.head, h("div", { class: "ss-body" }, this.sheet, this.state));
    this.stage.append(this.el);
    this.setWidth(readWidth());
  }
  toggle(on = !this.on) {
    this.on = on;
    this.key = "";
    this.update();
    this.app.ribbon.render();
    // 3D-Fenster ist jetzt schmaler bzw. wieder breit: Modell neu einpassen
    requestAnimationFrame(() => { this.app.viewer.resize?.(); this.app.viewer.fit?.(); });
  }
  get source() {
    const app = this.app, d = app.activeDoc?.();
    return (app.mode === "part" || app.mode === "assembly") && d && d.kind !== "drawing" ? d : null;
  }
  setWidth(f) {
    this.width = f;
    this.stage.style.setProperty("--split-w", (f * 100).toFixed(1) + "%");
  }
  drag(e) {
    e.preventDefault();
    const r = this.stage.getBoundingClientRect();
    const move = (m) => this.setWidth(Math.min(0.8, Math.max(0.2, (r.right - m.clientX) / r.width)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.classList.remove("is-scrubbing"); writeWidth(this.width); };
    document.body.classList.add("is-scrubbing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  /** Bei jeder Statusänderung: ein-/ausblenden, bei geändertem Modell das Blatt neu rechnen */
  update() {
    const src = this.on ? this.source : null;
    const show = !!src;
    this.el.hidden = !show;
    this.stage.classList.toggle("split", show);
    if (!show) return;
    const list = drawingsOf(this.app.project, src.id);
    let dw = list.find((d) => d.id === this.choice.get(src.id)) || list[0] || null;
    const key = `${src.id}|${dw?.id || "-"}|${list.length}|${this.app.buildRev || 0}|${JSON.stringify(src).length}`;
    if (key === this.key) return;
    this.key = key;
    this.renderHead(src, list, dw);
    if (!dw) {
      this.sheet.replaceChildren(h("div", { class: "ss-empty" }, icon("drawing"),
        h("p", {}, `Zu »${src.name}« gibt es noch keine Zeichnung.`),
        h("button", { class: "btn primary", onclick: () => this.derive(src) }, "Zeichnung ableiten")));
      this.state.hidden = true;
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.draw(dw), 300);
  }
  renderHead(src, list, dw) {
    const pick = list.length > 1
      ? h("select", { class: "inp ss-pick", "aria-label": "Zeichnung wählen", onchange: (e) => { this.choice.set(src.id, e.target.value); this.key = ""; this.update(); } },
        ...list.map((d) => h("option", { value: d.id, selected: d.id === dw?.id }, d.name)))
      : h("b", { class: "ss-name" }, dw ? dw.name : "Zeichnung");
    // replaceChildren schreibt null als Text, darum leere Einträge vorher entfernen
    this.head.replaceChildren(...[icon("drawing"), pick, h("span", { class: "grow" }),
      dw ? h("button", { class: "btn ss-open", title: "Zeichnung zum Bearbeiten öffnen (auch Doppelklick aufs Blatt)", onclick: () => this.openDrawing() }, "Öffnen") : null,
      h("button", { class: "icon-btn", title: "Nebeneinander beenden", "aria-label": "Nebeneinander beenden", onclick: () => this.toggle(false) }, icon("cancel"))].filter(Boolean));
  }
  async draw(dw) {
    const app = this.app;
    if (app.busy || app.drawing.offscreen) { this.timer = setTimeout(() => this.draw(dw), 400); return; }
    const key = this.key;
    this.state.textContent = "Ansichten werden berechnet…";
    this.state.hidden = false;
    try {
      const r = await app.drawing.sheetSvg(dw);
      if (key !== this.key || !r) return; // inzwischen geändert: der nächste Lauf zeichnet
      r.svg.removeAttribute("width");
      r.svg.removeAttribute("height");
      r.svg.classList.add("ss-svg");
      this.sheet.replaceChildren(r.svg);
      this.state.hidden = true;
    } catch (e) {
      this.state.textContent = "Blatt nicht berechenbar: " + e.message;
    }
  }
  derive(src) {
    const d = this.app.newDrawing({ kind: src.kind, id: src.id }, { open: false });
    this.choice.set(src.id, d.id);
    this.key = "";
    this.update();
  }
  openDrawing() {
    const src = this.source;
    if (!src) return;
    const list = drawingsOf(this.app.project, src.id);
    const dw = list.find((d) => d.id === this.choice.get(src.id)) || list[0];
    if (dw) this.app.openDoc(dw.id);
  }
}
