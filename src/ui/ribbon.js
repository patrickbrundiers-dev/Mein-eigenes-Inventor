// Menüband mit kontextabhängigen Registerkarten
import { h, icon, toast, closeMenu } from "./dom.js";
import { catalogToDims } from "../core/sections.js";
import { defaultKnickrahmen } from "../core/knickrahmen.js";
import { DISPLAY } from "../core/settings.js";

export class Ribbon {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("ribbon");
    this.tab = null;
    this.actions = this.defineActions();
  }

  defineActions() {
    const app = this.app;
    const needSketch = (pred) => {
      const id = app.lastSketchId(pred);
      if (!id) toast("Zuerst eine Skizze erstellen (Taste S)");
      return id;
    };
    const selEdges = () => app.selHits.filter((x) => x.kind === "edge" && x.info?.mid).map((x) => ({ p: x.info.mid, type: x.info.type }));
    const selFaces = () => app.selHits.filter((x) => x.kind === "face").map((x) => ({ p: x.point }));
    return {
      sketch: () => app.beginSketchCreation(),
      extrude: () => {
        const sk = needSketch();
        if (!sk) return;
        const r = app.results.get(app.activeId);
        const hasBody = r?.bodies?.length > 0;
        app.addFeature({ type: "extrude", sketch: sk, distance: "10", mode: "normal", op: hasBody ? "join" : "join" });
      },
      cutExtrude: () => {
        const sk = needSketch();
        if (sk) app.addFeature({ type: "extrude", name: undefined, sketch: sk, distance: "10", mode: "through", op: "cut" });
      },
      revolve: () => { const sk = needSketch(); if (sk) app.addFeature({ type: "revolve", sketch: sk, axis: "y", angle: "360", op: "join" }); },
      hole: () => {
        const sk = needSketch((s) => s.entities.some((e) => (e.type === "point" && !e.construction) || e.type === "circle"));
        if (sk) app.addFeature({ type: "hole", sketch: sk, diameter: "8", extent: "through", depth: "10", direction: "reverse", sink: "none" });
      },
      emboss: () => {
        const sk = needSketch((s) => s.entities.some((e) => !e.construction && e.type !== "point"));
        if (sk) app.addFeature({ type: "emboss", sketch: sk, mode: "gravieren", depth: "0.5", direction: "auto", wrap: true });
      },
      profile: () => app.addFeature({ type: "profile", section: "vierkant", dims: catalogToDims("vierkant", "40x3"), length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0", miterAxis: "v", endCuts: { A: "2D", B: "2D" }, swivel: "45" }),
      frame: () => {
        const sk = needSketch((s) => s.entities.some((e) => e.type === "line" && !e.construction));
        if (sk) app.addFeature({ type: "frame", sketch: sk, section: "vierkant", dims: catalogToDims("vierkant", "40x3"), corner: "gehrung", align: "mitte", rotation: "0" });
      },
      knickrahmen: () => app.addFeature(defaultKnickrahmen(catalogToDims("rechteck", "60x40x3"))),
      fillet: () => { const e = selEdges(); app.addFeature({ type: "fillet", mode: e.length ? "edges" : "edges", radius: "2", edges: e }); },
      chamfer: () => { const e = selEdges(); app.addFeature({ type: "chamfer", mode: "edges", radius: "1", edges: e }); },
      shell: () => app.addFeature({ type: "shell", thickness: "2", faces: selFaces() }),
      patternLin: () => {
        const src = this.lastPatternSource();
        if (!src) return toast("Zuerst ein Feature (z. B. Bohrung) erstellen");
        app.addFeature({ type: "pattern", kind: "linear", feature: src, dir: "X", count: "3", spacing: "20" });
      },
      patternCirc: () => {
        const src = this.lastPatternSource();
        if (!src) return toast("Zuerst ein Feature (z. B. Bohrung) erstellen");
        app.addFeature({ type: "pattern", kind: "circular", feature: src, axis: "Z", center: ["0", "0", "0"], count: "6", angle: "360" });
      },
      mirror: () => app.addFeature({ type: "mirror", plane: "YZ", offset: "0" }),
      importStep: () => app.files.importStepIntoPart(),
      params: () => app.props.paramsDialog(),
      // Skizze
      finishSketch: () => app.finishSketch(),
      // Baugruppe
      place: () => app.props.placeComponentDialog(),
      align: () => app.beginAlign("gegen"),
      alignFlush: () => app.beginAlign("buendig"),
      alignConc: () => app.beginAlign("konzentrisch"),
      bom: () => app.props.bomDialog(),
      // Zeichnung
      newDrawing: () => app.newDrawing(),
    };
  }
  lastPatternSource() {
    const part = this.app.activeDoc();
    const sel = this.app.sel?.type === "feature" ? this.app.feature(this.app.sel.id) : null;
    const ok = (f) => ["extrude", "revolve", "hole", "emboss", "profile", "frame", "import"].includes(f.type);
    if (sel && ok(sel)) return sel.id;
    const list = part.features.filter(ok);
    return list.length ? list[list.length - 1].id : null;
  }
  run(id) { const a = this.actions[id]; if (a) a(); }

  tabsFor(mode) {
    const app = this.app;
    const sk = app.sketcher;
    const B = (id, label, ic, extra = {}) => ({ id, label, icon: ic, run: extra.run || (() => this.run(id)), ...extra });
    const T = (tool, label, ic, extra = {}) => ({ id: "t_" + tool, label, icon: ic, on: sk.tool === tool, run: () => sk.setTool(tool), ...extra });
    const view = {
      id: "ansicht", label: "Ansicht", groups: [
        { label: "Ausrichtung", small: true, buttons: [
          B("v_iso", "Iso", "view", { run: () => app.viewer.setView("iso") }),
          B("v_front", "Vorne", "view", { run: () => app.viewer.setView("front") }),
          B("v_back", "Hinten", "view", { run: () => app.viewer.setView("back") }),
          B("v_left", "Links", "view", { run: () => app.viewer.setView("left") }),
          B("v_right", "Rechts", "view", { run: () => app.viewer.setView("right") }),
          B("v_top", "Oben", "view", { run: () => app.viewer.setView("top") }),
          B("v_bottom", "Unten", "view", { run: () => app.viewer.setView("bottom") }),
          B("v_normal", "Normal zur Fläche", "plane", { run: () => app.viewNormalToFace() }),
        ] },
        { label: "Zoom", buttons: [
          B("v_fit", "Alles zeigen", "fit", { run: () => app.viewer.fit() }),
          B("v_fitsel", "Auswahl zeigen", "fit", { run: () => app.zoomToSelection() }),
        ] },
        { label: "Benannt", buttons: [
          B("v_save", "Ansicht speichern", "view", { disabled: !app.namedViewsDoc?.(), run: () => app.saveNamedView() }),
          B("v_named", "Ansichten", "view", { disabled: !app.namedViewsDoc?.(), run: (e) => app.namedViewsMenu(e) }),
        ] },
        { label: "Projektion", buttons: [
          B("v_ortho", "Orthogonal", "view", { on: !app.viewer.perspective, run: () => app.prefs.set("ansicht.projektion", "orthogonal") }),
          B("v_persp", "Perspektive", "view", { on: app.viewer.perspective, run: () => app.prefs.set("ansicht.projektion", "perspektive") }),
        ] },
        { label: "Modus", small: true, buttons: DISPLAY.map((d) => B("dm_" + d.value, d.label, d.value === "draht" ? "grid" : "eye", { on: app.viewer.displayMode === d.value, run: () => app.prefs.set("ansicht.darstellung", d.value) })) },
        { label: "Auswahl", small: true, buttons: [
          B("sf_alles", "Alles wählbar", "view", { on: app.selFilter === "alles", run: () => app.setSelFilter("alles") }),
          B("sf_flaechen", "Nur Flächen", "plane", { on: app.selFilter === "flaechen", run: () => app.setSelFilter("flaechen") }),
          B("sf_kanten", "Nur Kanten", "line", { on: app.selFilter === "kanten", run: () => app.setSelFilter("kanten") }),
        ] },
        { label: "Sichtbarkeit", buttons: [B("v_showall", "Alle einblenden", "eye", { disabled: !app.viewer.hidden.size, run: () => app.showAllBodies() })] },
        { label: "Schnitt", buttons: ["X", "Y", "Z"].map((a) => B("clip_" + a, "Schnitt " + a, "cut", { on: app.viewer.clip?.axis === a, run: () => app.toggleClip(a) })) },
        { label: "Qualität", buttons: [
          B("q_grob", "Schnell", "grid", { on: app.quality === "grob", run: () => app.prefs.set("ansicht.qualitaet", "grob") }),
          B("q_normal", "Normal", "grid", { on: app.quality === "normal", run: () => app.prefs.set("ansicht.qualitaet", "normal") }),
          B("q_fein", "Fein", "grid", { on: app.quality === "fein", run: () => app.prefs.set("ansicht.qualitaet", "fein") }),
        ] },
      ],
    };
    if (mode === "part") {
      return [
        { id: "modell", label: "3D-Modell", groups: [
          { label: "Skizze", buttons: [B("sketch", "Skizze erstellen", "sketch")] },
          { label: "Erstellen", buttons: [B("extrude", "Extrusion", "extrude"), B("cutExtrude", "Ausschnitt", "cut"), B("revolve", "Drehung", "revolve"), B("hole", "Bohrung", "hole"), B("emboss", "Prägen", "emboss")] },
          { label: "Profile", buttons: [B("profile", "Rohr / Profil", "profile"), B("frame", "Rahmen aus Skizze", "frame"), B("knickrahmen", "Knickrahmen", "knick")] },
          { label: "Ändern", buttons: [B("fillet", "Rundung", "fillet"), B("chamfer", "Fase", "chamfer"), B("shell", "Wandung", "shell")] },
          { label: "Muster", buttons: [B("patternLin", "Rechteckig", "pattern"), B("patternCirc", "Kreisförmig", "circpattern"), B("mirror", "Spiegeln", "mirror")] },
          { label: "Prüfen", buttons: [B("measure", "Messen", "dimension", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() })] },
          { label: "Verwalten", buttons: [B("params", "Parameter", "params"), B("importStep", "STEP einfügen", "import")] },
          { label: "Zeichnung", buttons: [B("newDrawing", "Zeichnung ableiten", "drawing")] },
        ] },
        this.exportTab("part"),
        view,
      ];
    }
    if (mode === "sketch") {
      return [
        { id: "skizze", label: "Skizze", context: true, groups: [
          { label: "Erstellen", buttons: [
            T("line", "Linie", "line"), T("rect", "Rechteck", "rect"), T("rectc", "Rechteck Mitte", "rectc"),
            T("circle", "Kreis", "circle"), T("arc3", "Bogen", "arc"), T("arcc", "Bogen Mitte", "arcc"), T("slot", "Langloch", "slot"), T("polygon", "Polygon", "polygon"), T("point", "Punkt", "point"),
          ] },
          { label: "Ändern", buttons: [T("trim", "Stutzen", "trim"), T("extend", "Verlängern", "extend"), T("split", "Teilen", "split"), T("sfillet", "Rundung", "fillet"), T("offset", "Versatz", "offset"), T("mirror", "Spiegeln", "mirror")] },
          { label: "Übernehmen", buttons: [T("project", "Kante projizieren", "project"), B("constr", "Konstruktion", "construct", { on: !!sk.construction, run: () => sk.toggleConstruction() })] },
          { label: "Bemaßung", buttons: [T("dimension", "Bemaßung", "dimension")] },
          { label: "Abhängigkeiten", small: true, buttons: [
            T("horizontal", "Horizontal", "horizontal"), T("vertical", "Vertikal", "vertical"), T("coincident", "Koinzident", "coincident"),
            T("parallel", "Parallel", "parallel"), T("perpendicular", "Senkrecht", "perpendicular"), T("equal", "Gleich", "equal"),
            T("tangent", "Tangential", "tangent"), T("fix", "Fixieren", "fix"), T("midpoint", "Mittelpunkt", "midpoint"),
            T("concentric", "Konzentrisch", "concentric"), T("collinear", "Kollinear", "collinear"), T("symmetric", "Symmetrisch", "symmetric"),
          ] },
          { label: "Anzeige", buttons: [
            B("glyphs", "Symbole", "eye", { on: sk.showGlyphs, run: () => { sk.showGlyphs = !sk.showGlyphs; sk.render(); this.render(); } }),
            B("gridsnap", "Rasterfang", "grid", { on: sk.gridSnap, run: () => { sk.gridSnap = !sk.gridSnap; sk.render(); this.render(); } }),
            B("params", "Parameter", "params"),
          ] },
          { label: "Beenden", buttons: [B("finishSketch", "Skizze fertig", "finish", { finish: true })] },
        ] },
        view,
      ];
    }
    if (mode === "assembly") {
      return [
        { id: "baugruppe", label: "Zusammenfügen", groups: [
          { label: "Komponente", buttons: [B("place", "Platzieren", "place"), B("newPartInAsm", "Neues Bauteil", "part", { run: () => app.props.newPartForAssembly() })] },
          { label: "Positionieren", buttons: [B("align", "Fläche an Fläche", "align", { on: app.pick?.kind === "align" && app.align?.mode === "gegen" }), B("alignFlush", "Bündig", "align", { on: app.pick?.kind === "align" && app.align?.mode === "buendig" }), B("alignConc", "Konzentrisch", "concentric", { on: app.pick?.kind === "align" && app.align?.mode === "konzentrisch" })] },
          { label: "Listen", buttons: [B("bom", "Stückliste", "bom"), B("cutlist", "Zuschnittliste", "cut", { run: () => app.props.cutListDialog() })] },
          { label: "Prüfen", buttons: [B("measure", "Messen", "dimension", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() }), B("collide", "Kollision prüfen", "info", { run: () => app.props.collisionDialog() })] },
          { label: "Zeichnung", buttons: [B("newDrawing", "Zeichnung ableiten", "drawing")] },
        ] },
        this.exportTab("assembly"),
        view,
      ];
    }
    if (mode === "drawing") {
      const dr = app.drawing;
      return [
        { id: "zeichnung", label: "Ansichten", groups: [
          { label: "Ansicht", buttons: [
            B("dv_base", "Grundansichten", "view", { run: () => dr.autoViews() }),
            B("dv_add", "Ansicht hinzufügen", "plus", { run: () => dr.addViewDialog() }),
            B("dv_sec", "Schnitt", "cut", { run: () => dr.addSectionDialog() }),
            B("dv_hsec", "Schnitt Hohlprofil", "cut", { run: () => dr.hollowSection() }),
            B("dv_det", "Detail", "detail", { on: dr.tool === "detail", run: () => (dr.tool === "detail" ? dr.setTool(null) : dr.startDetail()) }),
          ] },
          { label: "Beschriften", buttons: [
            B("dd_dim", "Bemaßung", "dimension", { on: dr.tool === "dim", run: () => dr.setTool(dr.tool === "dim" ? null : "dim") }),
            B("dd_auto", "Hauptmaße", "dimension", { run: () => dr.autoDims() }),
            B("dd_text", "Text", "text", { on: dr.tool === "text", run: () => dr.setTool(dr.tool === "text" ? null : "text") }),
          ] },
          { label: "Baugruppe", buttons: [
            B("dd_pos", "Pos.-Nummern", "circle", { run: () => dr.autoBalloons() }),
            B("dd_bom", "Stückliste", "bom", { on: !!dr.doc?.bomTable?.show, run: () => dr.toggleBomTable() }),
          ] },
          { label: "Blatt", buttons: [B("dd_fit", "Blatt einpassen", "fit", { run: () => dr.fitSheet() })] },
        ] },
        this.exportTab("drawing"),
      ];
    }
    return [];
  }
  exportTab(kind) {
    const app = this.app;
    const f = app.files;
    const B = (id, label, ic, run) => ({ id, label, icon: ic, run });
    const groups = [];
    if (kind === "part") {
      groups.push({ label: "3D", buttons: [B("x_step", "STEP", "export", () => f.exportStep()), B("x_steplist", "STEP + Zuschnittliste", "export", () => f.exportStepWithList()), B("x_stl", "STL", "export", () => f.exportStl())] });
      groups.push({ label: "Profile", buttons: [B("x_members", "Profile einzeln (STEP)", "profile", () => f.exportMembers()), B("x_cut", "Zuschnittliste (CSV)", "cut", () => f.exportCutList())] });
      groups.push({ label: "2D", buttons: [B("x_plate", "Platte als DXF", "drawing", () => f.exportPlateDxf()), B("x_dxf", "Skizze als DXF", "sketch", () => f.exportSketchDxf())] });
    } else if (kind === "assembly") {
      groups.push({ label: "3D", buttons: [B("x_step", "STEP", "export", () => f.exportStep()), B("x_steplist", "STEP + Zuschnittliste", "export", () => f.exportStepWithList()), B("x_stl", "STL", "export", () => f.exportStl())] });
      groups.push({ label: "Profile", buttons: [B("x_members", "Profile einzeln (STEP)", "profile", () => f.exportMembers())] });
      groups.push({ label: "Listen", buttons: [B("x_bom", "Stückliste (CSV)", "bom", () => f.exportBom()), B("x_cut", "Zuschnittliste (CSV)", "cut", () => f.exportCutList())] });
    } else if (kind === "drawing") {
      groups.push({ label: "Zeichnung", buttons: [B("x_pdf", "PDF", "pdf", () => app.drawing.exportPdf()), B("x_dxf", "DXF", "drawing", () => app.drawing.exportDxf()), B("x_svg", "SVG", "drawing", () => app.drawing.exportSvg())] });
    }
    return { id: "export", label: "Export", groups };
  }

  render() {
    const app = this.app;
    const mode = app.mode;
    const tabs = this.tabsFor(mode);
    if (!tabs.find((t) => t.id === this.tab)) this.tab = tabs[0]?.id;
    if (mode === "sketch") this.tab = this.tab === "ansicht" ? "ansicht" : "skizze";
    const tabBar = h("div", { class: "rb-tabs" },
      h("button", { class: "rb-file", onclick: (e) => this.fileMenu(e) }, "Datei"),
      ...tabs.map((t) => h("button", { class: "rb-tab" + (t.id === this.tab ? " active" : "") + (t.context ? " context" : ""), onclick: () => { this.tab = t.id; this.render(); } }, t.label)),
      h("div", { class: "rb-spacer" }),
      h("button", { class: "rb-search", title: `Befehl suchen (${this.kbd("app.search") || "Strg+K"})`, onclick: () => app.commands.exec("app.search") }, icon("search"), h("span", {}, "Befehl suchen"), this.kbd("app.search") ? h("span", { class: "kbd" }, this.kbd("app.search")) : null),
      h("button", { class: "icon-btn", title: "Rückgängig (Strg+Z)", disabled: !app.undoStack.length, onclick: () => app.undo() }, icon("undo")),
      h("button", { class: "icon-btn", title: "Wiederholen (Strg+Y)", disabled: !app.redoStack.length, onclick: () => app.redo() }, icon("redo")),
      this.docLabel = h("div", { class: "rb-doc" }));
    this.renderDocLabel();
    const tab = tabs.find((t) => t.id === this.tab);
    const panel = h("div", { class: "rb-panel" });
    if (tab) {
      for (const g of tab.groups) {
        const btns = h("div", { class: "rb-buttons" });
        if (g.small) {
          // Kleine Knöpfe in Spalten zu je 3
          for (let i = 0; i < g.buttons.length; i += 3) {
            btns.append(h("div", { class: "rb-stack" }, ...g.buttons.slice(i, i + 3).map((b) =>
              h("button", { class: "rb-small" + (b.on ? " on" : ""), title: this.tip(b), onclick: b.run, disabled: b.disabled }, icon(b.icon), b.label))));
          }
        } else {
          for (const b of g.buttons) btns.append(h("button", { class: "rb-btn" + (b.on ? " on" : "") + (b.finish ? " rb-finish" : ""), onclick: b.run, disabled: b.disabled, title: this.tip(b) }, icon(b.icon), h("span", {}, b.label)));
        }
        panel.append(h("div", { class: "rb-group" }, btns, h("div", { class: "rb-group-label" }, g.label)));
      }
    } else if (mode === "start") {
      panel.append(h("div", { class: "hint", style: { alignSelf: "center", padding: "0 8px" } }, "Neues Projekt anlegen oder vorhandenes öffnen."));
    }
    this.el.replaceChildren(tabBar, panel);
  }
  kbd(id) { return this.app.commands?.label(id) || ""; }
  /** Tooltip mit Tastaturkürzel, falls der Knopf einem Befehl entspricht */
  tip(b) {
    const special = { measure: "tools.measure", collide: "asm.collide", finishSketch: "sketch.finish", constr: "sketch.construction", gridsnap: "sketch.gridsnap", v_fitsel: "view.fitSel", v_persp: "view.perspective", clip_X: "view.clipX", clip_Y: "view.clipY", clip_Z: "view.clipZ" };
    const id = special[b.id] || (b.id.startsWith("t_") ? "sketch." + b.id.slice(2) : b.id.startsWith("v_") ? "view." + b.id.slice(2) : b.id.startsWith("dm_") ? "view.mode." + b.id.slice(3) : "part." + b.id);
    const k = this.kbd(id);
    return k ? `${b.label} (${k})` : b.label;
  }
  renderDocLabel() {
    if (!this.docLabel) return;
    const d = this.app.activeDoc();
    const kind = { part: "Bauteil", assembly: "Baugruppe", drawing: "Zeichnung" }[d?.kind] || "";
    this.docLabel.replaceChildren(this.app.project.name, d ? h("span", {}, "  /  ", kind, " ", h("b", {}, d.name)) : "", this.app.dirty ? " •" : "");
  }

  fileMenu(e) {
    closeMenu();
    const app = this.app;
    const f = app.files;
    const close = () => { m.remove(); document.removeEventListener("mousedown", out, true); };
    const out = (ev) => { if (!m.contains(ev.target) && ev.target !== e.target) close(); };
    const item = (ic, label, run, kbd, disabled) => h("button", { disabled, onclick: () => { close(); run(); } }, icon(ic), h("span", {}, label), kbd ? h("span", { class: "kbd" }, kbd) : null);
    const m = h("div", { class: "file-menu", role: "menu" },
      item("new", "Neues Projekt", () => app.newProject(), this.kbd("file.new")),
      item("open", "Projekt öffnen…", () => f.open(), this.kbd("file.open")),
      item("save", "Speichern", () => f.save(false), this.kbd("file.save")),
      item("save", "Speichern unter…", () => f.save(true), this.kbd("file.saveAs")),
      h("hr"),
      item("part", "Neues Bauteil", () => app.newPart()),
      item("assembly", "Neue Baugruppe", () => app.newAssembly()),
      item("drawing", "Neue Zeichnung", () => app.newDrawing(), null, !app.project.docs.some((d) => d.kind !== "drawing")),
      h("hr"),
      item("import", "STEP als Bauteil importieren…", () => f.importStepAsPart()),
      item("steel", "Beispielprojekt öffnen", () => app.openExample()),
      h("hr"),
      item("search", "Befehl suchen…", () => app.commands.exec("app.search"), this.kbd("app.search")),
      item("settings", "Einstellungen…", () => app.props.settingsDialog(), this.kbd("app.settings")),
      item("info", "Über PBCAD", () => app.props.aboutDialog()));
    document.body.append(m);
    setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  }
}
