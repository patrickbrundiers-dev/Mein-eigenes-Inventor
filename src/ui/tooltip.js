// Tooltips mit Beschreibung (wie Inventor/Office): Karte mit Symbol, Name, Tastenkürzel und Kurzbeschreibung.
// Ein gemeinsamer Zuhörer auf dem Wurzelelement, darum überlebt er jedes Neuzeichnen des Menübands.
// Knöpfe tragen data-tip (Name), optional data-kbd und data-desc.

import { h } from "./dom.js";

const DELAY = 450;   // erste Karte nach kurzer Pause
const WARM = 400;    // danach wechselt sie beim Weiterfahren sofort

export function bindTooltips(root, sel = "[data-tip]") {
  let card = null, timer = 0, lastHide = 0, cur = null;
  const hide = () => {
    clearTimeout(timer);
    if (card) { card.remove(); card = null; lastHide = performance.now(); }
    cur = null;
  };
  const show = (el) => {
    hide();
    if (!el.isConnected) return;
    cur = el;
    const desc = el.dataset.desc, kbd = el.dataset.kbd;
    const ic = el.querySelector("svg")?.cloneNode(true);
    card = h("div", { class: "tip-card", role: "tooltip", id: "tip-card" },
      h("div", { class: "tip-head" }, ic ? h("span", { class: "tip-ic" }, ic) : null, h("b", {}, el.dataset.tip), kbd ? h("span", { class: "kbd" }, kbd) : null),
      desc ? h("p", {}, desc) : null,
      el.disabled ? h("p", { class: "tip-off" }, "Zurzeit nicht verfügbar") : null);
    document.body.append(card);
    // unter den Knopf, am Fensterrand umklappen
    const r = el.getBoundingClientRect(), c = card.getBoundingClientRect();
    const left = Math.max(6, Math.min(r.left, innerWidth - c.width - 6));
    const below = r.bottom + 6 + c.height < innerHeight;
    card.style.left = left + "px";
    card.style.top = (below ? r.bottom + 6 : r.top - c.height - 6) + "px";
  };
  const schedule = (el) => {
    if (el === cur) return;
    clearTimeout(timer);
    const warm = card || performance.now() - lastHide < WARM;
    if (warm) show(el);
    else timer = setTimeout(() => show(el), DELAY);
  };
  root.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.(sel);
    if (el && root.contains(el)) schedule(el);
  });
  root.addEventListener("mouseout", (e) => {
    const el = e.target.closest?.(sel);
    if (el && !el.contains(e.relatedTarget)) { clearTimeout(timer); if (card) hide(); }
  });
  // Tastatur: Karte am fokussierten Knopf
  root.addEventListener("focusin", (e) => {
    const el = e.target.closest?.(sel);
    if (el && el.matches(":focus-visible")) schedule(el);
  });
  root.addEventListener("focusout", hide);
  root.addEventListener("mousedown", hide, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, true);
  window.addEventListener("blur", hide);
  return { hide, get current() { return cur; } };
}
