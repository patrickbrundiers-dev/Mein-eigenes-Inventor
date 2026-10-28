// Geführter Rundgang: hebt nacheinander die Bereiche der Oberfläche hervor und erklärt sie in einer Sprechblase.
// Start über »Erste Schritte« oder das Angebot beim ersten Start. Läuft am Beispielprojekt, wenn nichts offen ist.

import { h, toast } from "./dom.js";

const SEEN = "pbcad.rundgang";

export const TOUR_STEPS = [
  { sel: "#ribbon .rb-panel", title: "Menüband", text: "Die Werkzeuge sind nach Aufgaben in Reitern sortiert, wie in Inventor. Fahren Sie über einen Knopf: eine Karte erklärt, was er tut, und nennt das Tastenkürzel." },
  { sel: "#ribbon .rb-search", title: "Befehl suchen", text: "Jeden Befehl über seinen Namen finden und ausführen, auch ohne zu wissen, in welchem Reiter er steht." },
  { sel: "#browser", title: "Modellbrowser", text: "Bauteile, Features, Baugruppen und Zeichnungen des Projekts. Klick wählt, Doppelklick bearbeitet, Rechtsklick zeigt weitere Befehle." },
  { sel: "#viewer", title: "3D-Fenster", text: "Rechtsklick öffnet das Markierungsmenü mit den häufigsten Befehlen im Kreis. Nach einem Klick auf eine Kante oder Fläche erscheint daneben eine kleine Werkzeugleiste (Rundung, Fase, Skizze …)." },
  { sel: "#props", title: "Eigenschaften", text: "Maße und Optionen des gewählten Elements. Werte dürfen Formeln und Parameter enthalten. Abschnitte klappen per Klick auf die Überschrift ein." },
  { sel: "#status", title: "Statusleiste", text: "Was das aktive Werkzeug als Nächstes erwartet, dazu Masse, Körperzahl sowie Fehler und Warnungen – ein Klick darauf öffnet die Problemliste." },
];

export async function startTour(app) {
  try { localStorage.setItem(SEEN, "1"); } catch { /* */ }
  if (app.mode === "start" || !app.activeDoc()) {
    app.dirty = false;
    await app.openExample();
  }
  let i = 0;
  const spot = h("div", { class: "tour-spot", "aria-hidden": "true" });
  const bubble = h("div", { class: "tour-bubble", role: "dialog", "aria-modal": "false", "aria-labelledby": "tour-title" });
  const shield = h("div", { class: "tour-shield", onclick: () => end() });
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); end(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); go(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); go(i - 1); }
  };
  const end = () => { shield.remove(); spot.remove(); bubble.remove(); document.removeEventListener("keydown", onKey, true); removeEventListener("resize", place); };
  const place = () => {
    const el = document.querySelector(TOUR_STEPS[i].sel);
    const r = el?.getBoundingClientRect() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, right: innerWidth / 2, bottom: innerHeight / 2 };
    const pad = 4;
    Object.assign(spot.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + 2 * pad + "px", height: r.height + 2 * pad + "px" });
    const b = bubble.getBoundingClientRect();
    // neben den Bereich: rechts, links, darunter oder darüber – was zuerst passt
    const cands = [
      [r.right + 14, r.top + 10], [r.left - b.width - 14, r.top + 10],
      [r.left + 16, r.bottom + 14], [r.left + 16, r.top - b.height - 14],
      [r.left + r.width / 2 - b.width / 2, r.top + r.height / 2 - b.height / 2],
    ];
    const fits = ([x, y]) => x >= 8 && y >= 8 && x + b.width <= innerWidth - 8 && y + b.height <= innerHeight - 8;
    const [x, y] = cands.find(fits) || cands.at(-1);
    bubble.style.left = Math.max(8, Math.min(x, innerWidth - b.width - 8)) + "px";
    bubble.style.top = Math.max(8, Math.min(y, innerHeight - b.height - 8)) + "px";
  };
  const go = (n) => {
    if (n < 0) return;
    if (n >= TOUR_STEPS.length) return end();
    i = n;
    const s = TOUR_STEPS[i], last = i === TOUR_STEPS.length - 1;
    bubble.replaceChildren(
      h("div", { class: "tour-count" }, `${i + 1} / ${TOUR_STEPS.length}`),
      h("h3", { id: "tour-title" }, s.title),
      h("p", {}, s.text),
      h("div", { class: "tour-dots", "aria-hidden": "true" }, ...TOUR_STEPS.map((_, k) => h("i", { class: k === i ? "on" : "" }))),
      h("footer", {},
        h("button", { class: "btn", onclick: end }, "Beenden"),
        h("span", { class: "grow" }),
        i ? h("button", { class: "btn", onclick: () => go(i - 1) }, "Zurück") : null,
        h("button", { class: "btn primary", onclick: () => go(i + 1) }, last ? "Fertig" : "Weiter")));
    place();
    bubble.querySelector(".btn.primary").focus();
  };
  document.body.append(shield, spot, bubble);
  document.addEventListener("keydown", onKey, true);
  addEventListener("resize", place);
  go(0);
}

/** Beim allerersten Start den Rundgang anbieten (nicht in automatischen Tests) */
export function offerTour(app) {
  let seen = true;
  try { seen = !!localStorage.getItem(SEEN); } catch { /* */ }
  if (seen || navigator.webdriver) return;
  try { localStorage.setItem(SEEN, "1"); } catch { /* */ }
  toast("Neu in PBCAD? Ein kurzer Rundgang zeigt die Oberfläche in einer Minute.", { timeout: 15000, action: { label: "Rundgang starten", run: () => startTour(app) } });
}
