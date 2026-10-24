// Befehle ausführen, Tastaturkürzel verteilen, Befehlssuche (Strg+K) und Kürzel-Editor
import { h, toast } from "./dom.js";
import { COMMANDS, commandDef, comboFromEvent, commandForCombo, effectiveKeymap, keymapConflicts, parseCombo, searchCommands } from "../core/commands.js";

/** id → Funktion. Ribbon-Aktionen werden wiederverwendet, damit Knopf und Kürzel dasselbe tun. */
export function commandRunners(app) {
  const r = (id) => () => app.ribbon.run(id);
  const tool = (t) => () => app.sketcher.setTool(t);
  const run = {
    "file.new": () => app.newProject(),
    "file.open": () => app.files.open(),
    "file.save": () => app.files.save(false),
    "file.saveAs": () => app.files.save(true),
    "file.newPart": () => app.newPart(),
    "file.newAssembly": () => app.newAssembly(),
    "file.importStep": () => app.files.importStepAsPart(),
    "app.settings": () => app.props.settingsDialog(),
    "app.search": () => commandPalette(app),
    "edit.undo": () => app.undo(),
    "edit.redo": () => app.redo(),
    "view.fit": () => app.viewer.fit(),
    "view.fitSel": () => app.zoomToSelection(),
    "view.normal": () => app.viewNormalToFace(),
    "view.saveNamed": () => app.saveNamedView(),
    "view.named": () => app.namedViewsMenu(),
    "view.perspective": () => app.prefs.set("ansicht.projektion", app.viewer.perspective ? "orthogonal" : "perspektive"),
    "view.clipX": () => app.toggleClip("X"),
    "view.clipY": () => app.toggleClip("Y"),
    "view.clipZ": () => app.toggleClip("Z"),
    "part.sketch": () => app.beginSketchCreation(),
    "doc.newDrawing": r("newDrawing"),
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
    "tools.measure": () => (app.pick?.kind === "measure" ? app.cancelPick() : app.beginMeasure()),
    "asm.place": r("place"),
    "asm.align": r("align"),
    "asm.alignFlush": r("alignFlush"),
    "asm.alignConc": r("alignConc"),
    "asm.bom": r("bom"),
    "asm.cutlist": () => app.props.cutListDialog(),
    "asm.collide": () => app.props.collisionDialog(),
  };
  for (const v of ["iso", "front", "back", "left", "right", "top", "bottom"]) run["view." + v] = () => app.viewer.setView(v);
  for (const m of ["kanten", "schattiert", "draht", "transparent"]) run["view.mode." + m] = () => app.prefs.set("ansicht.darstellung", m);
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
    const fn = this.run[id];
    if (!fn) return false;
    e?.preventDefault?.();
    try { fn(); } catch (err) { toast(`${commandDef(id)?.label || id}: ${err.message}`, { kind: "err" }); }
    return true;
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
  const render = () => {
    items = searchCommands(input.value, app.mode).filter((c) => c.id !== "app.search").slice(0, 40);
    idx = Math.min(idx, Math.max(0, items.length - 1));
    list.replaceChildren(...(items.length ? items.map((c, i) => h("button", { class: "cmd-item" + (i === idx ? " on" : ""), role: "option", "aria-selected": i === idx ? "true" : "false", onmousemove: () => { if (idx !== i) { idx = i; render(); } }, onclick: () => exec(c) },
      h("span", { class: "cmd-label" }, c.label), h("span", { class: "cmd-group" }, c.group), keys.label(c.id) ? h("span", { class: "kbd" }, keys.label(c.id)) : null))
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
