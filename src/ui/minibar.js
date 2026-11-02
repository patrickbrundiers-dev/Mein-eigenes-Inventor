// Mini-Werkzeugleiste an der Auswahl im Bauteil: die naheliegenden Befehle für die gewählten Kanten bzw. Flächen
// erscheinen neben dem Mauszeiger, halb durchsichtig, bis die Maus darüber fährt. Abschaltbar (ansicht.miniLeiste).
// In der Skizze zeigt sie die Bedingungen, die zur Auswahl passen (ein Klick statt Werkzeug + zwei Auswahlen).

import { h, icon } from "./dom.js";
import { planeFromFace } from "../core/geom.js";
import { miniBarItems } from "../core/minileiste.js";
import { startDirekt } from "./direkt.js";

export class MiniBar {
  constructor(app) {
    this.app = app;
    this.el = null;
    const stage = document.getElementById("stage");
    // jeder Klick daneben, Drehen oder Zoomen blendet sie aus (die Lage stimmt dann nicht mehr)
    document.addEventListener("pointerdown", (e) => { if (this.el && !this.el.contains(e.target)) this.hide(); }, true);
    stage.addEventListener("wheel", () => this.hide(), { passive: true });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.hide(); });
  }
  hide() { this.el?.remove(); this.el = null; }
  show(x, y) {
    this.hide();
    const app = this.app;
    if (app.prefs.get("ansicht.miniLeiste") === false || app.mode !== "part" || app.pick) return;
    const items = miniBarItems(app.selHits);
    if (!items.length) return;
    const run = {
      fillet: () => app.ribbon.run("fillet"),
      chamfer: () => app.ribbon.run("chamfer"),
      naht: () => app.ribbon.run("naht"),
      shell: () => app.ribbon.run("shell"),
      direkt: () => startDirekt(app),
      direktLoeschen: () => startDirekt(app, "loeschen"),
      faceSketch: () => { const f = app.selHits[0]; app.createSketch(planeFromFace(f.info.point || f.point, f.info.normal || f.normal)); },
      normal: () => app.viewNormalToFace(),
      measure: () => app.beginMeasure(),
      fitSel: () => app.zoomToSelection(),
    };
    this.place(items, x, y, (it) => run[it.id](), "Befehle zur Auswahl");
  }
  /** Skizze: passende Bedingungen zur Auswahl – ein Klick setzt sie (Horizontal, Parallel, Tangential …) */
  showSketch(x, y) {
    this.hide();
    const app = this.app, sk = app.sketcher;
    if (app.prefs.get("ansicht.miniLeiste") === false || app.mode !== "sketch" || !sk?.sel?.size) return;
    const opts = sk.selectionOptions();
    if (!opts.length) return;
    this.place(opts.map((o) => ({ id: o.type, label: o.label + (o.list.length > 1 ? ` (${o.list.length}×)` : ""), icon: o.type })), x, y,
      (it) => { const o = opts.find((q) => q.type === it.id); sk.addConstraints(o.list, o.label); }, "Bedingungen zur Auswahl", "mini-bar sketch-bar");
  }
  place(items, x, y, onRun, aria, cls = "mini-bar") {
    this.el = h("div", { class: cls, role: "toolbar", "aria-label": aria },
      ...items.map((it) => h("button", { class: "mini-btn", title: it.label, "aria-label": it.label, "data-id": it.id, onclick: () => { this.hide(); onRun(it); } }, icon(it.icon))));
    document.body.append(this.el);
    const r = this.el.getBoundingClientRect();
    this.el.style.left = Math.max(4, Math.min(x + 16, innerWidth - r.width - 4)) + "px";
    this.el.style.top = Math.max(4, Math.min(y - r.height - 14, innerHeight - r.height - 4)) + "px";
  }
}
