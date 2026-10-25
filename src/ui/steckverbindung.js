// Werkzeuge Stufe 46: Stecksystem zwischen zwei Komponenten einer Baugruppe. Die Verbindung steht in
// asm.steckverbindungen; »Aktualisieren« plant Zapfen und Schlitze im Kern (Lage der Komponenten in der Baugruppe)
// und schreibt sie als Features »steckzapfen« / »steckschlitz« in die beiden Bauteile.

import { h, toast } from "./dom.js";
import { evaluate } from "../core/expr.js";
import { uid } from "../core/examples.js";
import { TAB_MODES, defaultSteckverbindung, withoutSteck, steckProblem, applySteck, removeSteck } from "../core/stecksystem.js";

const partComps = (app, asm) => asm.components.filter((c) => !c.pat && app.doc(c.part)?.kind === "part");

/** Neue Steckverbindung: gewählte Komponente = Zapfenteil, Schlitzteil = nächste andere Komponente */
export function newSteckverbindung(app) {
  const asm = app.activeDoc();
  if (asm?.kind !== "assembly") return;
  const comps = partComps(app, asm);
  if (comps.length < 2) return toast("Für ein Stecksystem braucht die Baugruppe zwei Bauteile");
  const tab = comps.find((c) => app.sel?.type === "component" && c.id === app.sel.id) || comps[0];
  const slot = comps.find((c) => c.id !== tab.id && c.part !== tab.part) || comps.find((c) => c.id !== tab.id);
  const s = defaultSteckverbindung(uid("st"), tab.id, slot.id);
  s.name = `Stecksystem ${(asm.steckverbindungen || []).length + 1}`;
  app.edit("Stecksystem", () => { asm.steckverbindungen = [...(asm.steckverbindungen || []), s]; }, { rebuild: false });
  app.sel = { type: "steck", id: s.id };
  app.tree.render();
  app.props.render();
}

const num = (v, label) => {
  let x;
  try { x = evaluate(String(v ?? "").replace(",", "."), {}); } catch { x = NaN; }
  if (!Number.isFinite(x)) throw new Error(`${label}: Zahl erwartet`);
  return x;
};
/** Werte der Verbindung als Zahlen für den Kern */
export function steckParams(s) {
  const len = String(s.length ?? "").trim();
  return {
    mode: s.mode || "anzahl", count: num(s.count ?? "3", "Anzahl"), spacing: num(s.spacing ?? "150", "Höchstabstand"),
    width: num(s.width ?? "20", "Zapfenbreite"), edge: num(s.edge ?? "15", "Randabstand"), clearance: num(s.clearance ?? "0.2", "Spiel"),
    length: len ? num(len, "Zapfenlänge") : null, over: num(s.over ?? "0", "Überstand"),
  };
}

/** Zapfen und Schlitze planen und in die Bauteile schreiben; Rückgabe true bei Erfolg */
export async function updateSteckverbindung(app, asmId, steckId) {
  const asm0 = app.doc(asmId), s0 = asm0?.steckverbindungen?.find((x) => x.id === steckId);
  if (!s0) return false;
  const fail = (msg) => {
    app.edit("Stecksystem", () => { const s = app.doc(asmId).steckverbindungen.find((x) => x.id === steckId); s.error = msg; delete s.info; }, { rebuild: false });
    toast(`Stecksystem: ${msg}`, { kind: "err", timeout: 6000 });
    app.props.render();
    return false;
  };
  const problem = steckProblem(asm0, s0, (id) => app.doc(id));
  if (problem) return fail(problem);
  const A = asm0.components.find((c) => c.id === s0.tab), B = asm0.components.find((c) => c.id === s0.slot);
  let plan;
  try {
    plan = await app.kernel.call("tabSlot", {
      tab: { part: withoutSteck(app.doc(A.part), s0.id), pos: A.pos, rot: A.rot },
      slot: { part: withoutSteck(app.doc(B.part), s0.id), pos: B.pos, rot: B.rot },
      params: steckParams(s0),
    });
  } catch (e) { return fail(e?.message || String(e)); }
  const ok = app.edit("Stecksystem aktualisieren", () => {
    const asm = app.doc(asmId), s = asm.steckverbindungen.find((x) => x.id === steckId);
    applySteck(app.project.docs, asm, s, plan, () => uid("f"));
    s.info = plan.info;
    delete s.error;
  });
  if (ok !== false) toast(`Stecksystem: ${plan.info}`);
  app.tree.render();
  app.props.render();
  return ok !== false;
}

/** Verbindung mit ihren Zapfen und Schlitzen löschen */
export function deleteSteckverbindung(app, asm, id) {
  app.edit("Stecksystem löschen", () => {
    asm.steckverbindungen = (asm.steckverbindungen || []).filter((x) => x.id !== id);
    removeSteck(app.project.docs, id);
    if (app.sel?.id === id) app.sel = null;
  });
}

/** Verbindungen, die eine Komponente betreffen, entfernen (beim Löschen der Komponente) */
export function dropSteckForComponent(app, asm, compId) {
  for (const s of (asm.steckverbindungen || []).filter((x) => x.tab === compId || x.slot === compId)) removeSteck(app.project.docs, s.id);
  asm.steckverbindungen = (asm.steckverbindungen || []).filter((x) => x.tab !== compId && x.slot !== compId);
}

/** Eigenschaften einer Steckverbindung */
export function steckProps(props, asm, s) {
  const app = props.app;
  const set = (label, fn) => app.edit(label, fn, { rebuild: false });
  const E = (label, key, opts) => props.expr(label, s[key] ?? "", (v) => set(label, () => { s[key] = v; }), opts);
  const comps = partComps(app, asm).map((c) => [c.id, c.name || c.id]);
  const done = app.project.docs.some((d) => d.features?.some((f) => f.steck === s.id));
  return [
    s.error ? h("div", { class: "msg err" }, s.error) : null,
    props.section("Stecksystem",
      props.text("Name", s.name || "", (v) => set("Name", () => { s.name = v; })),
      props.select("Zapfenteil (steht auf)", [["", "– wählen –"], ...comps], s.tab || "", (v) => set("Zapfenteil", () => { s.tab = v; })),
      props.select("Schlitzteil (Platte, Blech, Rohr)", [["", "– wählen –"], ...comps.filter(([id]) => id !== s.tab)], s.slot || "", (v) => set("Schlitzteil", () => { s.slot = v; })),
      props.seg("Verteilung", TAB_MODES, s.mode || "anzahl", (v) => set("Verteilung", () => { s.mode = v; })),
      (s.mode || "anzahl") === "anzahl" ? E("Anzahl Zapfen", "count", { unit: "", allowNeg: false, allowZero: false }) : E("Höchstabstand", "spacing", { allowNeg: false, allowZero: false }),
      E("Zapfenbreite", "width", { allowNeg: false, allowZero: false }),
      E("Randabstand", "edge", { allowNeg: false }),
      E("Spiel je Seite", "clearance", { allowNeg: false }),
      props.expr("Zapfenlänge (leer = Wanddicke)", s.length ?? "", (v) => set("Zapfenlänge", () => { s.length = v; }), { allowEmpty: true, allowNeg: false }),
      String(s.length ?? "").trim() ? null : E("Überstand", "over"),
      s.info ? h("p", {}, s.info) : null,
      h("p", { class: "hint" }, "Das Zapfenteil muss in der Baugruppe auf einer ebenen Fläche des Schlitzteils stehen. »Aktualisieren« schreibt Zapfen und Schlitze in die beiden Bauteile – nach Änderungen an Lage oder Werten erneut drücken. Ist ein Bauteil mehrfach verbaut, haben alle Exemplare die Zapfen bzw. Schlitze.")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary", onclick: () => updateSteckverbindung(app, asm.id, s.id) }, done ? "Aktualisieren" : "Zapfen und Schlitze erzeugen"),
      h("button", { class: "btn danger", onclick: () => deleteSteckverbindung(app, asm, s.id) }, "Löschen")),
  ];
}
