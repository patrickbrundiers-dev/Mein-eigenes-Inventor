// Verlaufsleiste (SolidCraft »History«, plan/solidcraft-abgleich.md D4): unten im Bauteil eine Zeile mit allen
// Features als Symbol in Aufbaureihenfolge. Klick wählt das Feature (Doppelklick auf Skizze bearbeitet sie),
// die Marke zeigt das Bauteilende und lässt sich ziehen; ⏮ ◀ ▶ ⏭ setzen sie schrittweise.
import { h, icon } from "./dom.js";
import { FICON } from "./tree.js";
import { FEATURE_NAMES } from "./app.js";
import { activeCount } from "../core/bauteilende.js";

/** Bauteilende-ID für »n Features gerechnet« (0 = vor alle, n = alle) */
export function endIdFor(part, n) {
  const fs = part?.features || [];
  if (n >= fs.length) return null;
  if (n <= 0) return "";
  return fs[n - 1].id;
}

export class Verlauf {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("verlauf");
  }
  render() {
    const app = this.app, el = this.el;
    if (!el) return;
    const part = app.mode === "part" ? app.activeDoc() : null;
    const show = !!part && part.kind === "part" && app.prefs.get("oberflaeche.verlauf") !== false;
    el.hidden = !show;
    if (!show) return el.replaceChildren();
    const fs = part.features || [];
    const n = activeCount(part), r = app.results.get(part.id);
    const ro = app.linkedReadOnly?.(part);
    const go = (k) => { if (!ro) app.setPartEnd(endIdFor(part, Math.max(0, Math.min(fs.length, k)))); };
    const ctl = (ic, title, k, dis) => h("button", { class: "vl-ctl", title, "aria-label": title, disabled: ro || dis, onclick: () => go(k) }, h("span", { "aria-hidden": "true" }, ic));
    const items = [];
    fs.forEach((f, i) => {
      if (i === n) items.push(this.marker());
      const st = r?.status?.[f.id];
      const sel = app.sel?.type === "feature" && app.sel.id === f.id;
      const name = f.name || FEATURE_NAMES[f.type] || f.type;
      const cls = ["vl-item"];
      if (sel) cls.push("sel");
      if (i >= n || f.suppressed) cls.push("off");
      if (st && !st.ok) cls.push("err");
      else if (st?.warning) cls.push("warn");
      items.push(h("button", { class: cls.join(" "), "data-feature": f.id, "data-i": String(i), title: `${i + 1}. ${name}` + (i >= n ? " – hinter dem Bauteilende" : st?.error ? " – Fehler: " + st.error : ""),
        onclick: () => app.selectFeature(f.id), ondblclick: () => (f.type === "sketch" ? app.editSketch(f.id) : app.selectFeature(f.id)) },
        icon((f.type === "generator" && f.gen) || FICON[f.type] || "part")));
    });
    if (n >= fs.length) items.push(this.marker());
    const track = h("div", { class: "vl-track", role: "list" }, ...items);
    el.replaceChildren(
      h("span", { class: "vl-title" }, "Verlauf"),
      h("div", { class: "vl-ctls" }, ctl("⏮", "Zum Anfang (vor alle Features)", 0, n === 0), ctl("◀", "Ein Feature zurück", n - 1, n === 0), ctl("▶", "Ein Feature vor", n + 1, n >= fs.length), ctl("⏭", "Ans Ende", fs.length, n >= fs.length)),
      track,
      h("span", { class: "vl-info" }, fs.length ? `${n < fs.length ? `${n} von ${fs.length}` : fs.length} Features · Marke ziehen zum Zurückrollen` : "Noch keine Features"));
    const selEl = track.querySelector(".vl-item.sel");
    selEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Schild über dem gewählten Feature (SolidCraft »Fillet 1 · editing«)
    if (selEl) {
      const f = fs[Number(selEl.dataset.i)];
      const editing = app.pick?.feature === f.id || app._editingFeature === f.id;
      const tag = h("div", { class: "vl-editing", role: "status" }, `${f.name || FEATURE_NAMES[f.type] || f.type} · ${editing ? "bearbeiten" : "gewählt"}`);
      el.append(tag);
      const er = el.getBoundingClientRect(), sr = selEl.getBoundingClientRect();
      tag.style.left = Math.max(4, sr.left - er.left + sr.width / 2 - tag.offsetWidth / 2) + "px";
    }
    this.track = track;
    this.part = part;
  }
  /** Marke: ziehen bis zur Lücke zwischen zwei Symbolen, loslassen setzt das Bauteilende */
  marker() {
    const m = h("div", { class: "vl-marker", title: "Bauteilende – ziehen", role: "separator", "aria-label": "Bauteilende", tabindex: "0",
      onkeydown: (e) => { const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (d) { e.preventDefault(); const n = activeCount(this.part); this.app.setPartEnd(endIdFor(this.part, Math.max(0, n + d))); } } });
    m.addEventListener("pointerdown", (e) => {
      if (this.app.linkedReadOnly?.(this.part)) return;
      e.preventDefault();
      m.setPointerCapture(e.pointerId);
      m.classList.add("drag");
      const gapAt = (x) => {
        const its = [...this.track.querySelectorAll(".vl-item")];
        let k = 0;
        for (const it of its) { const b = it.getBoundingClientRect(); if (x > b.left + b.width / 2) k = Number(it.dataset.i) + 1; }
        return k;
      };
      const move = (ev) => { m.style.transform = `translateX(${ev.clientX - e.clientX}px)`; };
      const up = (ev) => {
        m.removeEventListener("pointermove", move);
        m.removeEventListener("pointerup", up);
        m.classList.remove("drag");
        m.style.transform = "";
        const k = gapAt(ev.clientX);
        if (k !== activeCount(this.part)) this.app.setPartEnd(endIdFor(this.part, k));
      };
      m.addEventListener("pointermove", move);
      m.addEventListener("pointerup", up);
    });
    return m;
  }
}
