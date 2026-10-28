// Tastenhinweise im Menüband: Alt drücken und loslassen zeigt Buchstaben an Datei und den Reitern; ein Buchstabe
// wechselt den Reiter und zeigt die Kürzel seiner Knöpfe; das Kürzel eines Knopfs führt ihn aus. Esc geht eine
// Ebene zurück, jeder Mausklick beendet. Vergabe der Kürzel: src/core/keytips.js.

import { h } from "./dom.js";
import { assignKeyTips, matchKeyTip } from "../core/keytips.js";

export class KeyTips {
  constructor(ribbon) {
    this.ribbon = ribbon;
    this.level = null; // null | "tabs" | "buttons"
    this.layer = null;
    this.typed = "";
    this.targets = [];
    let altAlone = false;
    // am Fenster im Erfassen, damit die Tastaturkürzel der App die Buchstaben nicht vorher bekommen
    window.addEventListener("keydown", (e) => {
      if (this.level) return this.onKey(e);
      altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    }, true);
    window.addEventListener("keyup", (e) => {
      if (e.key !== "Alt" || !altAlone) return;
      altAlone = false;
      if (this.level) return this.close();
      if (document.querySelector(".backdrop, .tour-bubble") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
      e.preventDefault();
      this.showTabs();
    }, true);
    document.addEventListener("mousedown", () => { altAlone = false; if (this.level) this.close(); }, true);
    window.addEventListener("blur", () => { altAlone = false; this.close(); });
    window.addEventListener("resize", () => this.close());
  }
  close() {
    this.layer?.remove();
    this.layer = null;
    this.level = null;
    this.typed = "";
    this.targets = [];
  }
  draw(targets) {
    this.layer?.remove();
    this.targets = targets;
    this.typed = "";
    this.layer = h("div", { class: "keytips", "aria-hidden": "true" },
      ...targets.map((t) => {
        const r = t.el.getBoundingClientRect();
        // große Knöpfe: rechts oben am Symbol, damit die Beschriftung lesbar bleibt
        const big = t.el.classList.contains("rb-btn");
        return h("span", { class: "keytip", "data-code": t.code, style: { left: r.left + (big ? r.width / 2 + 15 : 12) + "px", top: (big ? r.top + 10 : r.top + r.height / 2) + "px" } }, t.code);
      }));
    document.body.append(this.layer);
  }
  showTabs() {
    const root = this.ribbon.el;
    const file = root.querySelector(".rb-file");
    const tabs = [...root.querySelectorAll(".rb-tab")];
    const codes = assignKeyTips(tabs.map((t) => t.textContent), ["D"]);
    this.level = "tabs";
    this.draw([{ el: file, code: "D", run: () => file.click() }, ...tabs.map((el, i) => ({ el, code: codes[i], run: () => { el.click(); this.showButtons(); } }))]);
  }
  showButtons() {
    const btns = [...this.ribbon.el.querySelectorAll(".rb-panel .rb-btn, .rb-panel .rb-small")].filter((b) => !b.disabled && b.offsetParent);
    const codes = assignKeyTips(btns.map((b) => b.dataset.tip || b.getAttribute("aria-label") || b.textContent));
    this.level = "buttons";
    this.draw(btns.map((el, i) => ({ el, code: codes[i], run: () => el.click() })).filter((t) => t.code));
  }
  onKey(e) {
    if (e.key === "Alt") { e.preventDefault(); return this.close(); }
    if (["Shift", "Control", "Meta"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return this.level === "buttons" ? this.showTabs() : this.close();
    if (e.key === "Backspace") { this.typed = this.typed.slice(0, -1); return this.mark(); }
    if (e.key.length !== 1) return this.close();
    this.typed += e.key.toUpperCase().replace(/[ÄÖÜ]/, (c) => ({ Ä: "A", Ö: "O", Ü: "U" })[c]);
    const m = matchKeyTip(this.targets.map((t) => t.code), this.typed);
    if (m.kind === "hit") {
      const t = this.targets[m.index];
      if (this.level === "buttons" || t.code === "D") this.close();
      t.run();
    } else if (m.kind === "prefix") this.mark();
    else this.typed = "";
  }
  /** Bei Zweierkürzeln die nicht mehr passenden ausblenden */
  mark() {
    for (const s of this.layer?.querySelectorAll(".keytip") || []) s.classList.toggle("off", !!this.typed && !s.dataset.code.startsWith(this.typed));
  }
}
