// Befehle ausführen, Tastaturkürzel verteilen, Befehlssuche (Strg+K) und Kürzel-Editor
import { regionDialog, draftDialog } from "./analyse.js";
import { extractDialog as ifeatExtractDialog, insertDialog as ifeatInsertDialog } from "./ifeatures.js";
import { h, toast } from "./dom.js";
import { t } from "../core/i18n.js";
import { recordable } from "../core/makros.js";
import { COMMANDS, commandDef, comboFromEvent, commandForCombo, effectiveKeymap, keymapConflicts, parseCombo, searchCommands } from "../core/commands.js";
import { problemsDialog } from "./pruefung.js";
import { saveVersion, versionsDialog } from "./versionen.js";
import { savePosition } from "./darstellungen.js";

/** id → Funktion. Ribbon-Aktionen werden wiederverwendet, damit Knopf und Kürzel dasselbe tun. */
export function commandRunners(app) {
  const r = (id) => () => app.ribbon.run(id);
  const tool = (t) => () => app.sketcher.setTool(t);
  const run = {
    "file.new": () => app.newProject(),
    "file.open": () => app.files.open(),
    "file.save": () => app.files.save(false),
    "file.saveAs": () => app.files.save(true),
    "file.versionSave": () => saveVersion(app),
    "file.versions": () => versionsDialog(app),
    "file.newPart": () => app.newPart(),
    "file.listsXlsx": () => app.files.exportListsXlsx(),
    "file.mappe": () => app.files.exportMappe(),
    "file.dstv": () => app.files.exportDstv(),
    "file.ifc": () => app.files.exportIfc(),
    "file.angebot": () => app.files.exportAngebot(),
    "file.png": () => app.files.exportPng(),
    "file.iges": () => app.files.exportIges(),
    "file.linkPart": () => app.files.linkPartFromFile(),
    "file.savePartFile": () => { const d = app.activeDoc(); if (d?.kind === "part") app.files.savePartAsFile(d); },
    "file.refreshLinks": () => app.files.refreshLinks(),
    "file.render": () => app.files.exportPng({ photo: true }),
    "file.newAssembly": () => app.newAssembly(),
    "file.importStep": () => app.files.importStepAsPart(),
    "app.settings": () => app.props.settingsDialog(),
    "app.search": () => commandPalette(app),
    "app.macros": () => app.props.macroDialog(),
    "app.macroRecord": () => app.commands.toggleRecording(),
    "edit.undo": () => app.undo(),
    "model.rebuild": () => app.rebuildNow(),
    "model.problems": () => problemsDialog(app),
    "model.buildLog": () => app.props.buildLogDialog(),
    "edit.redo": () => app.redo(),
    "view.fit": () => app.viewer.fit(),
    "view.fitSel": () => app.zoomToSelection(),
    "view.normal": () => app.viewNormalToFace(),
    "view.saveNamed": () => app.saveNamedView(),
    "view.named": () => app.namedViewsMenu(),
    "view.compColors": () => app.toggleCompColors(),
    "view.perspective": () => app.prefs.set("ansicht.projektion", app.viewer.perspective ? "orthogonal" : "perspektive"),
    "view.clipX": () => app.toggleClip("X"),
    "view.clipY": () => app.toggleClip("Y"),
    "view.clipZ": () => app.toggleClip("Z"),
    "part.sketch": () => app.beginSketchCreation(),
    "doc.newDrawing": r("newDrawing"),
    "doc.partDrawings": () => app.partDrawings(app.activeId),
    "sketch.construction": () => app.sketcher.toggleConstruction(),
    "sketch.gridsnap": () => { app.sketcher.gridSnap = !app.sketcher.gridSnap; app.sketcher.render(); app.ribbon.render(); },
    "sketch.finish": () => app.finishSketch(),
    "sketch.selectAll": () => app.sketcher.selectAll(),
    "view.showAll": () => app.showAllBodies(),
    "view.hideSel": () => { const h0 = selectedBodyHit(app); if (h0) app.hideHit(h0); else toast("Zuerst eine Fläche oder Kante des Körpers wählen"); },
    "view.isolateSel": () => { const h0 = selectedBodyHit(app); if (h0) app.isolateHit(h0); else toast("Zuerst eine Fläche oder Kante des Körpers wählen"); },
    "select.all": () => app.setSelFilter("alles"),
    "select.faces": () => app.setSelFilter("flaechen"),
    "select.edges": () => app.setSelFilter("kanten"),
    "select.everything": () => app.selectEverything(),
    "select.invert": () => app.invertSelection(),
    "sketch.autodim": () => app.sketcher.autoDimensionDialog(),
    "sketch.clean": () => app.sketcher.cleanDialog(),
    "sketch.importDxf": () => app.sketcher.importDxfDialog(),
    "tools.measure": () => (app.pick?.kind === "measure" ? app.cancelPick() : app.beginMeasure()),
    "asm.place": r("place"),
    "asm.replace": () => (app.sel?.type === "component" ? app.props.replaceComponentDialog(app.sel.id) : toast("Erst eine Komponente im Baum wählen")),
    "asm.normteil": r("normteilAsm"),
    "asm.constraint": r("constraint"),
    "asm.stecksystem": r("steckAsm"),
    "asm.align": r("align"),
    "asm.alignFlush": r("alignFlush"),
    "asm.alignConc": r("alignConc"),
    "asm.alignInsert": r("alignInsert"),
    "asm.alignAngle": r("alignAngle"),
    "asm.alignTangent": r("alignTangent"),
    "asm.pattern": r("asmPattern"),
    "asm.mirror": () => app.props.mirrorComponent(),
    "asm.bom": r("bom"),
    "asm.cutlist": () => app.props.cutListDialog(),
    "asm.collide": () => app.props.collisionDialog(),
    "asm.joint": () => app.props.jointDialog(),
    "asm.animate": () => app.props.animateJoints(),
    "part.ifeatExtract": () => ifeatExtractDialog(app),
    "part.ifeatInsert": () => ifeatInsertDialog(app),
    "sketch.regionProps": () => regionDialog(app),
    "sketch.dof": () => { const s = app.sketcher; s.showDof = !s.showDof; s.solve(); s.render(); app.ribbon.render(); },
    "part.draftAnalysis": () => draftDialog(app),
    "part.welle": () => app.ribbon.run("welle"),
    "part.zahnrad": () => app.ribbon.run("zahnrad"),
    "part.lager": () => app.ribbon.run("lager"),
    "part.feder": () => app.ribbon.run("feder"),
    "asm.weldment": () => app.props.makeWeldment(),
    "asm.contactSolver": () => app.props.toggleContactSolver(),
    "asm.contactSet": () => app.props.toggleContactSet(),
    "asm.motionVideo": () => app.props.recordMotion(),
    "asm.explode": () => app.props.explodeDialog(),
    "asm.positionSave": () => savePosition(app, app.activeDoc()),
    "asm.params": () => app.props.paramsDialog(),
    "asm.inContext": () => (app.sel?.type === "component" ? app.editInContext(app.activeId, app.sel.id) : toast("Erst eine Komponente wählen")),
  };
  for (const v of ["iso", "front", "back", "left", "right", "top", "bottom"]) run["view." + v] = () => app.viewer.setView(v);
  for (const m of ["kanten", "schattiert", "draht", "transparent", "foto"]) run["view.mode." + m] = () => app.prefs.set("ansicht.darstellung", m);
  for (const c of COMMANDS) {
    if (run[c.id]) continue;
    if (c.id.startsWith("part.")) run[c.id] = r(c.id.slice(5));
    else if (c.id.startsWith("sketch.")) run[c.id] = tool(c.id.slice(7));
  }
  return run;
}

function selectedBodyHit(app) {
  if (app.mode === "assembly" && app.sel?.type === "component") return { key: "comp:" + app.sel.id, body: 0 };
  return (app.viewer.selectedHits || []).find((x) => x.kind === "face" || x.kind === "edge") || null;
}

export class CommandKeys {
  constructor(app) {
    this.app = app;
    this.run = commandRunners(app);
    this.update();
  }
  update() { this.map = effectiveKeymap(this.app.prefs.get("werkzeuge.kuerzel")); }
  label(id) { return this.map[id] || ""; }
  /** Tastendruck verteilen; true = verarbeitet */
  handle(e, { typing }) {
    const combo = comboFromEvent(e);
    if (!combo) return false;
    let cmd = commandForCombo(this.map, combo, this.app.mode);
    if (!cmd && combo === "Strg+Umschalt+Z") cmd = commandDef("edit.redo"); // gewohnte Zweitbelegung
    if (!cmd) return false;
    if (typing && !cmd.typing) return false;
    return this.exec(cmd.id, e);
  }
  exec(id, e) {
    if (id.startsWith("macro.")) { e?.preventDefault?.(); this.runMacro(id.slice(6)); return true; }
    const fn = this.run[id];
    if (!fn) return false;
    e?.preventDefault?.();
    if (this.recording && recordable(id) && !id.startsWith("part.")) { this.recording.push(id); toast(`Aufgezeichnet: ${commandDef(id)?.label || id} (${this.recording.length})`, { timeout: 1200 }); }
    try { return fn() ?? true; } catch (err) { toast(`${commandDef(id)?.label || id}: ${err.message}`, { kind: "err" }); }
    return true;
  }
  /** Makro: Schritte nacheinander, auf asynchrone Befehle (Export, Neuberechnen) wird gewartet; Abbruch beim ersten Fehler */
  async runMacro(mid) {
    const m = (this.app.prefs.get("werkzeuge.makros") || []).find((x) => x.id === mid);
    if (!m) return toast("Makro nicht gefunden", { kind: "err" });
    const rec = this.recording;
    this.recording = null;
    try {
      for (const [i, id] of m.steps.entries()) {
        const fn = this.run[id];
        if (!fn) throw new Error(`Schritt ${i + 1}: Befehl »${id}« gibt es nicht`);
        await fn();
        await this.app.idle?.();
      }
      toast(`Makro »${m.name}« ausgeführt (${m.steps.length} Schritte)`, { kind: "ok" });
    } catch (err) {
      toast(`Makro »${m.name}« abgebrochen: ${err.message}`, { kind: "err", timeout: 6000 });
    } finally { this.recording = rec; }
  }
  /** Aufzeichnung starten oder beenden; beim Beenden als Makro speichern */
  toggleRecording() {
    if (!this.recording) { this.recording = []; this.app.updateStatus?.(); return toast("Makro-Aufzeichnung läuft – Befehle über Menüband, Kürzel oder Befehlssuche ausführen, dann erneut »Makro aufzeichnen«"); }
    const steps = this.recording;
    this.recording = null;
    this.app.updateStatus?.();
    if (!steps.length) return toast("Aufzeichnung beendet – keine Befehle aufgezeichnet");
    const list = this.app.prefs.get("werkzeuge.makros") || [];
    let n = list.length + 1;
    while (list.some((x) => x.name === `Makro ${n}`)) n++;
    const r = this.app.prefs.set("werkzeuge.makros", [...list, { id: Math.random().toString(36).slice(2, 10), name: `Makro ${n}`, steps }]);
    if (!r.ok) return toast(r.error, { kind: "err" });
    toast(`»Makro ${n}« mit ${steps.length} Schritt(en) gespeichert – umbenennen unter »Makros verwalten«`, { kind: "ok", timeout: 5000 });
  }
}

/** Befehlssuche: Tippen filtert, Pfeile wählen, Eingabe führt aus */
export function commandPalette(app) {
  if (document.querySelector(".cmd-palette")) return;
  const keys = app.commands;
  const input = h("input", { class: "inp", type: "search", placeholder: "Befehl suchen …", "aria-label": "Befehl suchen", spellcheck: "false" });
  const list = h("div", { class: "cmd-list", role: "listbox" });
  let items = [], idx = 0;
  const close = () => { bd.remove(); document.removeEventListener("keydown", onKey, true); };
  const exec = (c) => { close(); keys.exec(c.id); };
  const pinned = () => app.prefs.get("werkzeuge.schnellzugriff") || [];
  const togglePin = (id) => {
    const cur = pinned();
    const r = app.prefs.set("werkzeuge.schnellzugriff", cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    if (!r.ok) toast(r.error, { kind: "err" });
    render();
  };
  const render = () => {
    items = searchCommands(input.value, app.mode).filter((c) => c.id !== "app.search").slice(0, 40);
    idx = Math.min(idx, Math.max(0, items.length - 1));
    list.replaceChildren(...(items.length ? items.map((c, i) => h("button", { class: "cmd-item" + (i === idx ? " on" : ""), role: "option", "aria-selected": i === idx ? "true" : "false", onmousemove: () => { if (idx !== i) { idx = i; render(); } }, onclick: () => exec(c) },
      h("span", { class: "cmd-label" }, t(c.label)), h("span", { class: "cmd-group" }, t(c.group)), keys.label(c.id) ? h("span", { class: "kbd" }, keys.label(c.id)) : h("span"),
      h("span", { class: "cmd-pin" + (pinned().includes(c.id) ? " on" : ""), role: "button", title: pinned().includes(c.id) ? "Vom Schnellzugriff lösen" : "An den Schnellzugriff heften", onclick: (e) => { e.stopPropagation(); togglePin(c.id); } }, "📌")))
      : [h("div", { class: "hint", style: { padding: "8px" } }, "Kein passender Befehl in diesem Arbeitsbereich")]));
    list.children[idx]?.scrollIntoView?.({ block: "nearest" });
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); idx = Math.min(items.length - 1, idx + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); idx = Math.max(0, idx - 1); render(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (items[idx]) exec(items[idx]); }
  };
  input.addEventListener("input", () => { idx = 0; render(); });
  const bd = h("div", { class: "backdrop cmd-backdrop", onmousedown: (e) => { if (e.target === bd) close(); } },
    h("div", { class: "cmd-palette", role: "dialog", "aria-label": "Befehlssuche" }, input, list));
  document.addEventListener("keydown", onKey, true);
  document.getElementById("modal-root").append(bd);
  render();
  setTimeout(() => input.focus(), 10);
}

/** Schnellzugriff im Einstellungscenter: Reihenfolge ändern, entfernen */
export function quickAccessEditor(app) {
  const prefs = app.prefs;
  const box = h("div", { class: "qa-editor" });
  const set = (next) => { const r = prefs.set("werkzeuge.schnellzugriff", next); if (!r.ok) toast(r.error, { kind: "err" }); render(); };
  const render = () => {
    const ids = prefs.get("werkzeuge.schnellzugriff") || [];
    box.replaceChildren(h("h3", {}, "Schnellzugriff"),
      ids.length ? h("ol", { class: "qa-list" }, ...ids.map((id, i) => h("li", {}, h("span", { class: "grow" }, commandDef(id)?.label || id),
        h("button", { class: "icon-btn", title: "Nach oben", disabled: i === 0, onclick: () => { const n = [...ids]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n); } }, "↑"),
        h("button", { class: "icon-btn", title: "Nach unten", disabled: i === ids.length - 1, onclick: () => { const n = [...ids]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n); } }, "↓"),
        h("button", { class: "icon-btn", title: "Entfernen", onclick: () => set(ids.filter((x) => x !== id)) }, "✕"))))
        : h("p", { class: "hint" }, "Noch leer. In der Befehlssuche (Strg+K) einen Befehl über die Stecknadel anheften."));
  };
  render();
  return box;
}

/** Editor für Tastaturkürzel im Einstellungscenter */
export function keymapEditor(app) {
  const prefs = app.prefs;
  const filter = h("input", { class: "inp", type: "search", placeholder: "Befehl filtern …", "aria-label": "Befehle filtern" });
  const msg = h("div", { class: "set-err", role: "alert" });
  const table = h("div", { class: "km-table" });
  const user = () => ({ ...(prefs.get("werkzeuge.kuerzel") || {}) });
  const apply = (next) => {
    const r = prefs.set("werkzeuge.kuerzel", next);
    msg.textContent = r.ok ? "" : r.error;
    render();
    return r.ok;
  };
  const capture = (c, btn) => {
    btn.textContent = "Taste drücken … (Esc bricht ab)";
    btn.classList.add("on");
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { done(); render(); return; }
      const combo = comboFromEvent(e);
      if (!combo) return;
      done();
      const p = parseCombo(combo);
      if (!p.ok) { msg.textContent = p.error; render(); return; }
      const map = effectiveKeymap({ ...user(), [c.id]: p.combo });
      const conf = keymapConflicts(map).find((x) => x.ids.includes(c.id));
      if (conf) {
        const other = commandDef(conf.ids.find((i) => i !== c.id));
        msg.textContent = `»${p.combo}« ist schon »${other.label}« zugeordnet. Erst dort entfernen oder ändern.`;
        render();
        return;
      }
      apply({ ...user(), [c.id]: p.combo });
    };
    // vor dem Dialog abfangen (Esc/Eingabe sollen ihn nicht schließen)
    const done = () => window.removeEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onKey, true);
  };
  const render = () => {
    const map = effectiveKeymap(prefs.get("werkzeuge.kuerzel"));
    const u = prefs.get("werkzeuge.kuerzel") || {};
    const list = searchCommands(filter.value);
    let group = null;
    const rows = [];
    for (const c of list) {
      if (!filter.value && c.group !== group) { group = c.group; rows.push(h("div", { class: "km-group" }, group)); }
      const changed = Object.prototype.hasOwnProperty.call(u, c.id);
      const btn = h("button", { class: "btn km-key", title: "Klicken und neue Taste drücken" }, map[c.id] || "–");
      btn.addEventListener("click", () => capture(c, btn));
      rows.push(h("div", { class: "km-row", "data-cmd": c.id },
        h("span", {}, c.label),
        btn,
        map[c.id] ? h("button", { class: "set-default", title: "Taste entfernen", onclick: () => apply({ ...user(), [c.id]: "" }) }, "entfernen") : h("span"),
        changed ? h("button", { class: "set-default", title: `Standard: ${c.key || "keine Taste"}`, onclick: () => { const n = user(); delete n[c.id]; apply(n); } }, "Standard") : h("span")));
    }
    table.replaceChildren(...rows);
  };
  filter.addEventListener("input", render);
  render();
  return h("div", { class: "km" }, h("h4", {}, "Tastaturkürzel"), filter, msg, table,
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => apply({}) }, "Alle Kürzel auf Standard")));
}
