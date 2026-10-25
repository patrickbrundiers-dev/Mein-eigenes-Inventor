// Oberfläche zu src/core/darstellungen.js und src/core/baugruppenparameter.js (Fusion-Abgleich FU4, FU8, FU9):
// Positionsdarstellungen, Explosion in Schritten, Parameter der Baugruppe an Bauteile weitergeben.
import { h, icon, modal, toast, fmtNum, promptDialog } from "./dom.js";
import { uid } from "../core/examples.js";
import { capturePosition, applyPosition, positionDiff, nextPositionName, explosionOffsets, autoExplosion, validStep, dirLabel } from "../core/darstellungen.js";
import { pushParams, partsLinkedTo, asmParamValues } from "../core/baugruppenparameter.js";
import { flattenAssembly } from "../core/subasm.js";

// ---------- FU4: Parameter der Baugruppe ----------

/** Ergebnisse der Bauteile verwerfen, die Werte aus der Baugruppe holen – sie rechnen beim Anzeigen neu */
export function invalidateLinked(app, asmId) {
  const parts = partsLinkedTo(app.project.docs, asmId);
  for (const p of parts) app.results.delete(p.id);
  return parts.length;
}

/** Bauteile der Baugruppe (auch aus Unterbaugruppen), jedes einmal */
const partsOf = (app, asm) => [...new Map(flattenAssembly(asm, (id) => app.doc(id), { includeHidden: true }).map((o) => [o.part.id, o.part])).values()];

/**
 * »An Bauteile weitergeben«: Parameter der Baugruppe wählen; gleichnamige Parameter der Bauteile werden
 * verknüpft, fehlende auf Wunsch angelegt. rows = Parameter im offenen Dialog (noch nicht übernommen).
 */
export function pushParamsDialog(app, asm, rows = asm.params || []) {
  const parts = partsOf(app, asm).filter((p) => !p.link); // verknüpfte Dateien (M24) sind schreibgeschützt
  if (!rows.length) return toast("Erst einen Parameter in der Baugruppe anlegen");
  if (!parts.length) return toast("Die Baugruppe enthält noch keine Bauteile");
  const { values } = asmParamValues({ params: rows });
  const checks = rows.map((r) => {
    const users = parts.filter((p) => (p.params || []).some((q) => q.name === r.name));
    const cb = h("input", { type: "checkbox", checked: users.length > 0 });
    return { r, cb, row: h("label", { class: "chk" }, cb, `${r.name} = ${fmtNum(values[r.name], 4)}`, h("span", { class: "hint" }, users.length ? `  in ${users.length} Bauteil${users.length === 1 ? "" : "en"}` : "  in keinem Bauteil")) };
  });
  const add = h("input", { type: "checkbox" });
  modal({ title: `Parameter an Bauteile weitergeben – ${asm.name}`, width: "520px",
    body: h("div", {},
      h("p", { class: "hint" }, "Gleichnamige Parameter in den Bauteilen holen ihren Wert dann aus der Baugruppe. Im Bauteil steht er als »= Baugruppe.Name«; dort lässt sich die Verknüpfung wieder lösen."),
      ...checks.map((c) => c.row),
      h("label", { class: "chk", style: { marginTop: "8px" } }, add, "In Bauteilen ohne den Parameter anlegen")),
    buttons: [{ label: "Abbrechen" }, { label: "Verknüpfen", primary: true, run: () => {
      const names = checks.filter((c) => c.cb.checked).map((c) => c.r.name);
      if (!names.length) { toast("Keinen Parameter gewählt"); return false; }
      let res = [];
      app.edit("Parameter weitergeben", () => {
        asm.params = JSON.parse(JSON.stringify(rows));
        res = pushParams(asm, parts, names, { add: add.checked });
      });
      invalidateLinked(app, asm.id);
      const n = new Set(res.map((x) => x.part.id)).size;
      toast(res.length ? `${res.length} Parameter in ${n} Bauteil${n === 1 ? "" : "en"} verknüpft` : "Nichts zu verknüpfen – kein Bauteil hat einen gleichnamigen Parameter", { kind: res.length ? "ok" : "" });
    } }] });
}

// ---------- FU8: Positionsdarstellungen ----------

/** Aktuelle Gelenkstellungen unter einem Namen speichern */
export async function savePosition(app, asm, name) {
  if (!(asm.components || []).some((c) => c.joint)) return toast("Keine Komponente hat ein Gelenk – erst ein Dreh- oder Schiebegelenk anlegen");
  const n = name ?? (await promptDialog("Positionsdarstellung speichern", "Name (z. B. »Tor offen 90°«)", nextPositionName(asm), { ok: "Speichern", validate: (v) => (!v ? "Bitte einen Namen eingeben" : null) }));
  if (!n) return null;
  const pos = { id: uid("pos"), name: n, values: capturePosition(asm) };
  app.edit("Positionsdarstellung", () => {
    const old = (asm.positions || []).find((p) => p.name === n);
    if (old) old.values = pos.values;
    else asm.positions = [...(asm.positions || []), pos];
  });
  return pos;
}

/** Darstellung anwenden (rückgängig machbar) */
export function showPosition(app, asm, id) {
  const pos = (asm.positions || []).find((p) => p.id === id);
  if (!pos) return 0;
  let n = 0;
  app.edit("Position " + pos.name, () => { n = applyPosition(asm, pos); });
  if (!n) toast(`»${pos.name}« ist schon eingestellt`);
  return n;
}

export function positionsSection(props, asm) {
  const app = props.app;
  const list = asm.positions || [];
  const joints = (asm.components || []).filter((c) => c.joint).length;
  if (!joints && !list.length) return null;
  return props.section("Positionsdarstellungen",
    list.length ? h("div", { class: "pos-list" }, ...list.map((p) => {
      const active = !positionDiff(asm, p).length;
      return h("div", { class: "pos-row" + (active ? " on" : "") },
        h("button", { class: "btn" + (active ? " on" : ""), title: "Einstellen", onclick: () => showPosition(app, asm, p.id) }, p.name),
        h("button", { class: "icon-btn", title: "Mit der aktuellen Stellung überschreiben", onclick: () => app.edit("Positionsdarstellung", () => { p.values = capturePosition(asm); }) }, icon("save")),
        h("button", { class: "icon-btn", title: "Umbenennen", onclick: async () => { const v = await promptDialog("Umbenennen", "Name", p.name); if (v) app.edit("Positionsdarstellung", () => { p.name = v; }, { rebuild: false }); } }, icon("edit")),
        h("button", { class: "icon-btn", title: "Löschen", onclick: () => app.edit("Positionsdarstellung löschen", () => { asm.positions = list.filter((x) => x !== p); }, { rebuild: false }) }, icon("trash")));
    })) : h("p", { class: "hint" }, "Gelenkstellungen benannt speichern, z. B. »Tor zu« und »Tor offen 90°«, und hier umschalten. In der Zeichnung lässt sich je Ansicht eine Darstellung wählen."),
    h("div", { class: "btn-row" }, h("button", { class: "btn", disabled: !joints, onclick: () => savePosition(app, asm) }, icon("plus"), " Aktuelle Stellung speichern")));
}

// ---------- FU9: Explosion in Schritten ----------

const DIRS = [["+z", [0, 0, 1]], ["-z", [0, 0, -1]], ["+x", [1, 0, 0]], ["-x", [-1, 0, 0]], ["+y", [0, 1, 0]], ["-y", [0, -1, 0]]];
const dirKey = (d) => DIRS.find(([, v]) => v.every((x, i) => Math.abs(x - d[i]) < 1e-9))?.[0] || "frei";

/** Explosion der Schritte anzeigen (upto Schritte, t = Anteil des letzten); 0 = zusammengebaut */
export function showSteps(app, asm, upto = Infinity, t = 1) {
  app.viewer.setStepOffsets(upto > 0 ? explosionOffsets(asm, upto, t) : null);
  app.explodeSteps = upto > 0 ? upto : 0;
}

/** Schritte nacheinander abspielen (je Schritt ms Millisekunden), am Ende explodiert stehen lassen */
export function playSteps(app, asm, { ms = 900 } = {}) {
  const steps = (asm.explosion?.steps || []).filter(validStep);
  if (!steps.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      const x = (now - t0) / ms;
      const k = Math.min(steps.length, Math.floor(x) + 1);
      const t = Math.min(1, x - (k - 1));
      const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
      showSteps(app, asm, k, s);
      if (x < steps.length) requestAnimationFrame(tick);
      else { showSteps(app, asm); resolve(true); }
    };
    requestAnimationFrame(tick);
  });
}

/** Mitten und Größen der Komponenten (zusammengebaut) für die automatische Explosion */
function compItems(app, asm) {
  return (asm.components || []).filter((c) => !c.hidden).map((c) => {
    const b = app.viewer.componentBox(c.id);
    if (!b) return null;
    return { id: c.id, name: c.name, center: [0, 1, 2].map((k) => (b[0][k] + b[1][k]) / 2), size: Math.hypot(...[0, 1, 2].map((k) => b[1][k] - b[0][k])) };
  }).filter(Boolean);
}

/** Dialog »Explosion«: Schritte bearbeiten, automatisch erzeugen, abspielen; Regler von der Mitte bleibt als einfache Variante */
export function explosionDialog(app) {
  const asm = app.activeDoc();
  if (asm?.kind !== "assembly") return;
  const v = app.viewer;
  const steps = JSON.parse(JSON.stringify(asm.explosion?.steps || []));
  const name = (id) => asm.components.find((c) => c.id === id)?.name || "?";
  const list = h("div", { class: "explode-steps" });
  const preview = () => { v.setExplode(0); v.setStepOffsets(explosionOffsets({ explosion: { steps } })); };
  const draw = () => {
    list.replaceChildren(...(steps.length ? steps.map((s, i) => {
      const dir = h("select", { class: "inp", style: { width: "70px" } }, ...DIRS.map(([k]) => h("option", { value: k, selected: dirKey(s.dir) === k }, dirLabel(DIRS.find((d) => d[0] === k)[1]))), dirKey(s.dir) === "frei" ? h("option", { value: "frei", selected: true }, dirLabel(s.dir)) : null);
      dir.addEventListener("change", () => { const d = DIRS.find(([k]) => k === dir.value); if (d) s.dir = [...d[1]]; preview(); });
      const dist = h("input", { class: "inp", type: "number", step: "10", value: s.dist, style: { width: "80px" } });
      dist.addEventListener("change", () => { s.dist = Number(dist.value) || 0; preview(); });
      const up = h("button", { class: "icon-btn", title: "Früher", disabled: !i, onclick: () => { steps.splice(i - 1, 0, steps.splice(i, 1)[0]); draw(); } }, icon("up"));
      const del = h("button", { class: "icon-btn", title: "Schritt löschen", onclick: () => { steps.splice(i, 1); draw(); } }, icon("trash"));
      return h("div", { class: "explode-step" }, h("b", {}, `${i + 1}.`), h("span", { class: "grow", title: s.comps.map(name).join(", ") }, s.comps.map(name).join(", ")), dir, dist, h("span", { class: "hint" }, "mm"), up, del);
    }) : [h("p", { class: "hint" }, "Noch keine Schritte. »Automatisch« verteilt alle Teile nach oben, unten und zur Seite; »Schritt hinzufügen« verschiebt gewählte Komponenten.")]));
    preview();
  };
  const addStep = () => {
    const sel = app.sel?.type === "component" ? app.sel.id : null;
    const boxes = asm.components.filter((c) => !c.hidden && !c.pat).map((c) => ({ c, cb: h("input", { type: "checkbox", checked: c.id === sel }) }));
    const dir = h("select", { class: "inp" }, ...DIRS.map(([k, d]) => h("option", { value: k }, dirLabel(d))));
    const dist = h("input", { class: "inp", type: "number", step: "10", value: "200" });
    modal({ title: "Explosionsschritt", width: "440px",
      body: h("div", {}, h("div", { class: "explode-pick" }, ...boxes.map((b) => h("label", { class: "chk" }, b.cb, b.c.name))),
        h("div", { class: "field" }, h("label", {}, "Richtung"), dir), h("div", { class: "field" }, h("label", {}, "Abstand (mm)"), dist)),
      buttons: [{ label: "Abbrechen" }, { label: "Hinzufügen", primary: true, run: () => {
        const comps = boxes.filter((b) => b.cb.checked).map((b) => b.c.id);
        if (!comps.length) { toast("Mindestens eine Komponente wählen"); return false; }
        steps.push({ id: uid("ex"), comps, dir: [...DIRS.find(([k]) => k === dir.value)[1]], dist: Number(dist.value) || 0 });
        draw();
      } }] });
  };
  const auto = () => {
    v.setStepOffsets(null);
    const made = autoExplosion(asm, compItems(app, asm), { gap: 60 });
    if (!made.length) return toast("Nichts zu verschieben – alle Komponenten sind fixiert");
    steps.splice(0, steps.length, ...made.map((s) => ({ ...s, id: uid("ex") })));
    draw();
  };
  draw();
  modal({ title: "Explosion in Schritten", width: "640px",
    body: h("div", {},
      h("p", { class: "hint" }, "Jeder Schritt verschiebt Komponenten in eine Richtung; die Schritte addieren sich. Nur Darstellung – Lage, Stückliste und Export bleiben. In der Zeichnung kann jede Ansicht explodiert gezeigt werden (mit Positionsnummern)."),
      list,
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: addStep }, icon("plus"), " Schritt hinzufügen"),
        h("button", { class: "btn", onclick: auto }, "Automatisch"),
        h("button", { class: "btn", onclick: () => playSteps(app, { explosion: { steps } }) }, "Abspielen"),
        h("button", { class: "btn", onclick: () => { steps.length = 0; draw(); } }, "Alle löschen"),
        h("button", { class: "btn", title: "Ohne Schritte: alle Komponenten gleichmäßig von der Mitte weg", onclick: () => { v.setStepOffsets(null); app.props.explodeCenterDialog(); } }, "Von der Mitte…"))),
    buttons: [
      { label: "Zusammenbauen", run: () => { v.setStepOffsets(null); v.setExplode(0); app.explodeSteps = 0; app.ribbon.render(); } },
      { label: "Übernehmen", primary: true, run: () => {
        app.edit("Explosion", () => { if (steps.length) asm.explosion = { steps }; else delete asm.explosion; }, { rebuild: false });
        showSteps(app, asm, steps.length ? Infinity : 0);
        app.ribbon.render();
      } }],
    onClose: (val) => { if (val === undefined) { showSteps(app, asm, app.explodeSteps ? Infinity : 0); app.ribbon.render(); } } });
}

export function explosionSection(props, asm) {
  const app = props.app;
  const steps = (asm.explosion?.steps || []).filter(validStep);
  if (!steps.length) return null;
  const on = !!app.explodeSteps;
  return props.section("Explosion",
    h("p", { class: "hint" }, `${steps.length} Schritt${steps.length === 1 ? "" : "e"}: ` + steps.map((s) => `${dirLabel(s.dir)} ${fmtNum(s.dist, 0)} mm`).join(" · ")),
    h("div", { class: "btn-row" },
      h("button", { class: "btn" + (on ? " on" : ""), onclick: () => { showSteps(app, asm, on ? 0 : Infinity); props.render(); app.ribbon.render(); } }, on ? "Zusammenbauen" : "Explodiert zeigen"),
      h("button", { class: "btn", onclick: () => playSteps(app, asm) }, "Abspielen"),
      h("button", { class: "btn", onclick: () => explosionDialog(app) }, "Bearbeiten…")));
}

/** Abschnitt »Parameter« für Baugruppen ohne Generator (FU4) */
export function asmParamsSection(props, asm) {
  if (asm.generator) return null;
  const app = props.app;
  const n = (asm.params || []).length;
  const linked = partsLinkedTo(app.project.docs, asm.id).length;
  return props.section("Parameter",
    h("p", { class: "hint" }, n ? `${n} Parameter${linked ? `, ${linked} Bauteil${linked === 1 ? "" : "e"} verknüpft` : ""}` : "Maße der Baugruppe, die Bauteile übernehmen (Top-down): z. B. Breite einmal hier, alle Teile folgen."),
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => props.paramsDialog() }, "Parameter…"), n ? h("button", { class: "btn", onclick: () => pushParamsDialog(app, asm) }, "An Bauteile weitergeben…") : null));
}
