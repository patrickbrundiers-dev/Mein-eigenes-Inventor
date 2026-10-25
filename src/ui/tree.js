// Modellbrowser: Projekt-Dokumente und Feature-Liste des aktiven Bauteils
import { h, icon, contextMenu, promptDialog } from "./dom.js";
import { FEATURE_NAMES } from "./app.js";

const FICON = { sketch: "sketch", extrude: "extrude", revolve: "revolve", hole: "hole", profile: "profile", frame: "frame", knickrahmen: "knick", profilzug: "profilzug", biegerohr: "biegerohr", regelkoerper: "regelkoerper", normteil: "normteil", kantteil: "kantteil", platte: "platte", rippe: "rippe", naht: "naht", generator: "gelaender", genteil: "profile", emboss: "emboss", fillet: "fillet", chamfer: "chamfer", shell: "shell", pattern: "pattern", mirror: "mirror", import: "import" };

export class Tree {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("browser");
    this.collapsed = new Set();
  }
  render() {
    const app = this.app;
    const prj = app.project;
    const head = h("div", { class: "pane-head" }, h("span", { class: "grow", title: prj.name }, prj.name),
      h("button", { class: "icon-btn", title: "Neues Bauteil", onclick: () => app.newPart() }, icon("plus")));
    head.addEventListener("dblclick", () => this.renameProject());
    const root = h("ul", { class: "tree" });
    const groups = [["part", "Bauteile", "part"], ["assembly", "Baugruppen", "assembly"], ["drawing", "Zeichnungen", "drawing"]];
    for (const [kind, label, ic] of groups) {
      const docs = prj.docs.filter((d) => d.kind === kind);
      if (!docs.length) continue;
      const key = "g:" + kind;
      const open = !this.collapsed.has(key);
      const li = h("li");
      li.append(this.node({ label, ic: null, twist: open ? "▾" : "▸", onTwist: () => this.toggle(key), cls: "group" }));
      if (open) {
        const ul = h("ul");
        for (const d of docs) {
          const active = d.id === app.activeId;
          const r = d.kind === "part" ? app.results.get(d.id) : null;
          const err = r && Object.values(r.status).some((s) => !s.ok);
          const dli = h("li");
          dli.append(this.node({
            label: d.name + (d.link ? " ↗" : ""), ic, cls: (active ? "active-doc sel" : "") + (err ? " err" : ""), meta: d.number || "",
            title: d.link ? `${d.name} – verknüpft mit ${d.link.path}` : undefined,
            onClick: () => app.openDoc(d.id),
            onDbl: () => this.rename(d),
            onMenu: (e) => this.docMenu(e, d),
          }));
          if (active && d.kind === "part") dli.append(this.featureList(d));
          if (active && d.kind === "assembly") dli.append(this.componentList(d));
          if (active && d.kind === "drawing") dli.append(this.viewList(d));
          ul.append(dli);
        }
        li.append(ul);
      }
      root.append(li);
    }
    if (!prj.docs.length) root.append(h("li", { class: "hint", style: { padding: "8px 12px" } }, "Noch keine Dokumente. Über »Datei« ein Bauteil anlegen."));
    this.el.replaceChildren(head, root);
  }
  node({ label, ic, cls = "", twist = "", onTwist, onClick, onDbl, onMenu, meta, title }) {
    const n = h("div", { class: "node " + cls, title: title || label, tabindex: onClick ? 0 : undefined },
      h("span", { class: "twist", onclick: (e) => { e.stopPropagation(); onTwist && onTwist(); } }, twist),
      ic ? icon(ic, "ico") : null,
      h("span", { class: "label" }, label),
      meta ? h("span", { class: "meta" }, meta) : null);
    if (onClick) n.addEventListener("click", onClick);
    if (onDbl) n.addEventListener("dblclick", (e) => { e.stopPropagation(); onDbl(); });
    if (onMenu) n.addEventListener("contextmenu", (e) => { e.preventDefault(); onMenu(e); });
    n.addEventListener("keydown", (e) => { if (e.key === "Enter" && onClick) onClick(); });
    return n;
  }
  toggle(key) { if (this.collapsed.has(key)) this.collapsed.delete(key); else this.collapsed.add(key); this.render(); }

  featureList(part) {
    const app = this.app;
    const r = app.results.get(part.id);
    const ul = h("ul");
    // Ursprung
    const ok = "origin:" + part.id;
    const oOpen = !this.collapsed.has(ok) && false;
    const oli = h("li");
    oli.append(this.node({ label: "Ursprung", ic: "origin", twist: this.collapsed.has(ok + ":open") ? "▾" : "▸", onTwist: () => this.toggle(ok + ":open"), cls: "group" }));
    if (this.collapsed.has(ok + ":open") || oOpen) {
      const ou = h("ul");
      for (const [pl, label] of [["XY", "XY-Ebene"], ["XZ", "XZ-Ebene"], ["YZ", "YZ-Ebene"]]) {
        ou.append(h("li", {}, this.node({ label, ic: "plane", onClick: () => {}, onDbl: () => app.createSketch({ ref: pl }), title: label + " – Doppelklick: neue Skizze",
          onMenu: (e) => contextMenu(e.clientX, e.clientY, [{ label: "Neue Skizze auf " + label, icon: "sketch", run: () => app.createSketch({ ref: pl }) }]) })));
      }
      oli.append(ou);
    }
    ul.append(oli);
    // Parameter
    if (part.params.length) ul.append(h("li", {}, this.node({ label: `Parameter (${part.params.length})`, ic: "params", onClick: () => app.props.paramsDialog() })));
    for (const f of part.features) {
      const st = r?.status?.[f.id];
      const cls = [];
      if (app.sel?.type === "feature" && app.sel.id === f.id) cls.push("sel");
      if (st && !st.ok) cls.push("err");
      else if (st?.warning) cls.push("warn");
      if (f.suppressed) cls.push("suppressed");
      const consumedBy = part.features.filter((g) => g.sketch === f.id);
      const meta = f.type === "sketch" && st?.dof > 0 ? `${st.dof} FG` : "";
      ul.append(h("li", {}, this.node({
        label: f.name || FEATURE_NAMES[f.type], ic: (f.type === "generator" && f.gen) || FICON[f.type], cls: cls.join(" "), meta,
        title: st?.error ? "Fehler: " + st.error : st?.warning ? "Hinweis: " + st.warning : f.name,
        onClick: () => app.selectFeature(f.id),
        onDbl: () => (f.type === "sketch" ? app.editSketch(f.id) : app.selectFeature(f.id)),
        onMenu: (e) => this.featureMenu(e, part, f, consumedBy),
      })));
    }
    if (!part.features.length) ul.append(h("li", { class: "hint", style: { padding: "4px 10px" } }, "Mit »Skizze erstellen« oder »Rohr / Profil« beginnen."));
    return ul;
  }
  /** Inhalt einer Unterbaugruppe, nur zur Ansicht (bearbeitet wird sie in ihrem eigenen Dokument) */
  subComponentList(asm, depth) {
    const app = this.app;
    const ul = h("ul");
    for (const c of asm.components || []) {
      const p = app.doc(c.part);
      const sub = p?.kind === "assembly" && depth < 8;
      const li = h("li");
      ul.append(li);
      li.append(this.node({
        label: c.name || p?.name || "?", ic: p?.kind === "assembly" ? "assembly" : "part", cls: (c.hidden ? "suppressed" : "") + (!p ? " err" : ""),
        onDbl: () => p && app.openDoc(p.id),
      }));
      if (sub) li.append(this.subComponentList(p, depth + 1));
    }
    return ul;
  }
  componentList(asm) {
    const app = this.app;
    const ul = h("ul");
    for (const c of asm.components) {
      const p = app.doc(c.part);
      const sel = app.sel?.type === "component" && app.sel.id === c.id;
      const sub = p?.kind === "assembly";
      const li = h("li");
      ul.append(li);
      li.append(this.node({
        label: c.name || p?.name || "?", ic: sub ? "assembly" : "part", cls: (sel ? "sel" : "") + (c.hidden ? " suppressed" : "") + (!p ? " err" : ""), meta: [sub ? "Unterbaugruppe" : "", c.fixed ? "fixiert" : ""].filter(Boolean).join(" · "),
        onClick: () => { app.sel = { type: "component", id: c.id }; app.refreshSelectionHits(); this.render(); app.props.render(); },
        onDbl: () => p && app.openDoc(p.id),
        onMenu: (e) => contextMenu(e.clientX, e.clientY, [
          { label: "Bauteil bearbeiten", icon: "edit", run: () => p && app.openDoc(p.id) },
          { label: c.hidden ? "Einblenden" : "Ausblenden", icon: c.hidden ? "eye" : "eyeoff", run: () => app.edit("Sichtbarkeit", () => { c.hidden = !c.hidden; }) },
          { label: c.fixed ? "Fixierung lösen" : "Fixieren", icon: "fix", run: () => app.edit("Fixieren", () => { c.fixed = !c.fixed; }) },
          { label: "Duplizieren", icon: "copy", run: () => app.props.duplicateComponent(c.id) },
          "-",
          { label: "Entfernen", icon: "trash", run: () => app.props.deleteComponent(c.id) },
        ]),
      }));
      if (sub) li.append(this.subComponentList(p, 1));
    }
    if (!asm.components.length) ul.append(h("li", { class: "hint", style: { padding: "4px 10px" } }, "Mit »Platzieren« Bauteile einfügen."));
    const cons = asm.constraints || [];
    if (cons.length) {
      const key = "cons:" + asm.id;
      const open = !this.collapsed.has(key);
      const li = h("li");
      li.append(this.node({ label: `Abhängigkeiten (${cons.length})`, ic: "align", twist: open ? "▾" : "▸", onTwist: () => this.toggle(key), cls: "group" }));
      if (open) {
        const cu = h("ul");
        for (const c of cons) {
          const err = app.asmErrors?.[c.id];
          const sel = app.sel?.type === "constraint" && app.sel.id === c.id;
          cu.append(h("li", {}, this.node({
            label: c.name || (c.type === "buendig" ? "Bündig" : c.type === "konzentrisch" ? "Konzentrisch" : "Fläche an Fläche"), ic: c.type === "konzentrisch" ? "concentric" : "align",
            cls: (sel ? "sel" : "") + (err ? " err" : "") + (c.suppressed ? " suppressed" : ""), title: err ? "Fehler: " + err : c.name,
            meta: c.gap && c.gap !== "0" ? c.gap + " mm" : "",
            onClick: () => { app.sel = { type: "constraint", id: c.id }; app.refreshSelectionHits(); this.render(); app.props.render(); },
            onMenu: (e) => contextMenu(e.clientX, e.clientY, [
              { label: c.suppressed ? "Aktivieren" : "Unterdrücken", icon: "eyeoff", run: () => app.edit("Abhängigkeit", () => { c.suppressed = !c.suppressed; }) },
              { label: "Löschen", icon: "trash", run: () => app.props.deleteConstraint(c.id) },
            ]),
          })));
        }
        li.append(cu);
      }
      ul.append(li);
    }
    return ul;
  }
  viewList(drw) {
    const app = this.app;
    const ul = h("ul");
    const names = { front: "Vorderansicht", top: "Draufsicht", left: "Seitenansicht links", right: "Seitenansicht rechts", back: "Rückansicht", bottom: "Untersicht", iso: "Isometrie" };
    for (const v of drw.views) {
      const sel = app.drawing.sel?.type === "view" && app.drawing.sel.id === v.id;
      ul.append(h("li", {}, this.node({ label: v.type === "section" ? `Schnitt ${v.letter}–${v.letter}` : v.type === "detail" ? `Detail ${v.letter}` : v.label || names[v.type] || v.type, ic: "view", cls: sel ? "sel" : "", meta: `M ${scaleLabel(v.scale)}`,
        onClick: () => app.drawing.select({ type: "view", id: v.id }),
        onMenu: (e) => contextMenu(e.clientX, e.clientY, [{ label: "Ansicht löschen", icon: "trash", run: () => app.drawing.deleteView(v.id) }]) })));
    }
    return ul;
  }
  featureMenu(e, part, f, consumedBy) {
    const app = this.app;
    const items = [];
    if (f.type === "sketch") {
      items.push({ label: "Skizze bearbeiten", icon: "edit", run: () => app.editSketch(f.id) });
      items.push({ label: app.visibleSketches.has(f.id) ? "Skizze ausblenden" : "Skizze immer zeigen", icon: "eye", run: () => { if (app.visibleSketches.has(f.id)) app.visibleSketches.delete(f.id); else app.visibleSketches.add(f.id); app.showSketches3D(); } });
      items.push({ label: "Als DXF exportieren", icon: "export", run: () => app.files.exportSketchDxf(f.id) });
      if (!consumedBy.length) {
        items.push("-", { label: "Extrusion", icon: "extrude", run: () => { app.sel = { type: "feature", id: f.id }; app.ribbon.run("extrude"); } });
        items.push({ label: "Rahmen", icon: "frame", run: () => { app.sel = { type: "feature", id: f.id }; app.ribbon.run("frame"); } });
      }
    }
    items.push("-",
      { label: "Umbenennen", icon: "edit", run: () => this.rename(f, true) },
      { label: f.suppressed ? "Unterdrückung aufheben" : "Unterdrücken", icon: f.suppressed ? "eye" : "eyeoff", run: () => app.edit("Unterdrücken", () => { f.suppressed = !f.suppressed; }) },
      { label: "Nach oben", icon: "up", run: () => app.moveFeature(f.id, -1) },
      { label: "Nach unten", icon: "down", run: () => app.moveFeature(f.id, 1) },
      "-",
      { label: "Löschen", icon: "trash", kbd: "Entf", run: () => app.deleteFeature(f.id) });
    contextMenu(e.clientX, e.clientY, items);
  }
  docMenu(e, d) {
    const app = this.app;
    contextMenu(e.clientX, e.clientY, [
      { label: "Öffnen", icon: "open", run: () => app.openDoc(d.id) },
      { label: "Umbenennen", icon: "edit", run: () => this.rename(d) },
      { label: "Duplizieren", icon: "copy", run: () => app.duplicateDoc(d.id) },
      d.kind !== "drawing" ? { label: "Zeichnung ableiten", icon: "drawing", run: () => app.newDrawing({ kind: d.kind, id: d.id }) } : null,
      d.kind === "assembly" ? { label: "Einzelteilzeichnungen", icon: "drawing", run: () => app.partDrawings(d.id) } : null,
      d.kind !== "drawing" ? { label: "Fertigungsmappe", icon: "pdf", run: () => app.files.exportMappe(d) } : null,
      // Bauteile als eigene Dateien (M24, V3)
      ...(d.kind !== "part" ? [] : d.link
        ? ["-", { label: "Aus Datei aktualisieren", icon: "update", run: () => app.files.refreshLinks() },
          app.files.bridge ? { label: "Quelldatei öffnen", icon: "open", run: () => app.files.open(d.link.path) } : null,
          { label: "Verknüpfung lösen", icon: "cut", run: () => app.edit("Verknüpfung lösen", () => { delete d.link; }, { link: true, rebuild: false }) }]
        : [{ label: "Als eigene Datei speichern", icon: "save", run: () => app.files.savePartAsFile(d) }]),
      "-",
      { label: "Löschen", icon: "trash", run: () => app.deleteDoc(d.id) },
    ]);
  }
  async rename(obj, isFeature = false) {
    const name = await promptDialog("Umbenennen", "Neuer Name", obj.name || "", { validate: (v) => (v ? null : "Name darf nicht leer sein") });
    if (!name) return;
    this.app.edit("Umbenennen", () => { obj.name = name; if (!isFeature && obj.kind === "drawing" && obj.title && !obj.title.benennung) obj.title.benennung = name; }, { rebuild: false });
  }
  async renameProject() {
    const name = await promptDialog("Projekt umbenennen", "Projektname", this.app.project.name);
    if (name) this.app.edit("Projekt umbenennen", () => { this.app.project.name = name; }, { rebuild: false });
  }
}

export function scaleLabel(s) {
  if (!s) return "1:1";
  if (s >= 1) return `${round(s)}:1`;
  return `1:${round(1 / s)}`;
}
const round = (x) => Math.round(x * 100) / 100;
