// Menüband mit kontextabhängigen Registerkarten
import { h, icon, toast, closeMenu } from "./dom.js";
import { catalogToDims } from "../core/sections.js";
import { defaultKnickrahmen } from "../core/knickrahmen.js";

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
      profile: () => app.addFeature({ type: "profile", section: "vierkant", dims: catalogToDims("vierkant", "40x3"), length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0", miterAxis: "v" }),
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
    const ok = (f) => ["extrude", "revolve", "hole", "profile", "frame", "import"].includes(f.type);
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
        { label: "Ausrichtung", buttons: [
          B("v_iso", "Iso", "view", { run: () => app.viewer.setView("iso") }),
          B("v_front", "Vorne", "view", { run: () => app.viewer.setView("front") }),
          B("v_top", "Oben", "view", { run: () => app.viewer.setView("top") }),
          B("v_right", "Rechts", "view", { run: () => app.viewer.setView("right") }),
          B("v_fit", "Alles zeigen", "fit", { run: () => app.viewer.fit() }),
        ] },
        { label: "Darstellung", buttons: [
          B("q_grob", "Schnell", "grid", { on: app.quality === "grob", run: () => { app.quality = "grob"; app.rebuild(); this.render(); } }),
          B("q_normal", "Normal", "grid", { on: app.quality === "normal", run: () => { app.quality = "normal"; app.rebuild(); this.render(); } }),
          B("q_fein", "Fein", "grid", { on: app.quality === "fein", run: () => { app.quality = "fein"; app.rebuild(); this.render(); } }),
        ] },
      ],
    };
    if (mode === "part") {
      return [
        { id: "modell", label: "3D-Modell", groups: [
          { label: "Skizze", buttons: [B("sketch", "Skizze erstellen", "sketch")] },
          { label: "Erstellen", buttons: [B("extrude", "Extrusion", "extrude"), B("cutExtrude", "Ausschnitt", "cut"), B("revolve", "Drehung", "revolve"), B("hole", "Bohrung", "hole")] },
          { label: "Profile", buttons: [B("profile", "Rohr / Profil", "profile"), B("frame", "Rahmen aus Skizze", "frame"), B("knickrahmen", "Knickrahmen", "knick")] },
          { label: "Ändern", buttons: [B("fillet", "Rundung", "fillet"), B("chamfer", "Fase", "chamfer"), B("shell", "Wandung", "shell")] },
          { label: "Muster", buttons: [B("patternLin", "Rechteckig", "pattern"), B("patternCirc", "Kreisförmig", "circpattern"), B("mirror", "Spiegeln", "mirror")] },
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
            T("circle", "Kreis", "circle"), T("arc3", "Bogen", "arc"), T("arcc", "Bogen Mitte", "arcc"), T("point", "Punkt", "point"),
          ] },
          { label: "Ändern", buttons: [T("trim", "Stutzen", "trim"), T("sfillet", "Rundung", "fillet")] },
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
          { label: "Prüfen", buttons: [B("collide", "Kollision prüfen", "info", { run: () => app.props.collisionDialog() })] },
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
              h("button", { class: "rb-small" + (b.on ? " on" : ""), title: b.label, onclick: b.run, disabled: b.disabled }, icon(b.icon), b.label))));
          }
        } else {
          for (const b of g.buttons) btns.append(h("button", { class: "rb-btn" + (b.on ? " on" : "") + (b.finish ? " rb-finish" : ""), onclick: b.run, disabled: b.disabled, title: b.label }, icon(b.icon), h("span", {}, b.label)));
        }
        panel.append(h("div", { class: "rb-group" }, btns, h("div", { class: "rb-group-label" }, g.label)));
      }
    } else if (mode === "start") {
      panel.append(h("div", { class: "hint", style: { alignSelf: "center", padding: "0 8px" } }, "Neues Projekt anlegen oder vorhandenes öffnen."));
    }
    this.el.replaceChildren(tabBar, panel);
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
      item("new", "Neues Projekt", () => app.newProject(), "Strg+N"),
      item("open", "Projekt öffnen…", () => f.open(), "Strg+O"),
      item("save", "Speichern", () => f.save(false), "Strg+S"),
      item("save", "Speichern unter…", () => f.save(true), "Strg+Umschalt+S"),
      h("hr"),
      item("part", "Neues Bauteil", () => app.newPart()),
      item("assembly", "Neue Baugruppe", () => app.newAssembly()),
      item("drawing", "Neue Zeichnung", () => app.newDrawing(), null, !app.project.docs.some((d) => d.kind !== "drawing")),
      h("hr"),
      item("import", "STEP als Bauteil importieren…", () => f.importStepAsPart()),
      item("steel", "Beispielprojekt öffnen", () => app.openExample()),
      h("hr"),
      item("settings", "Einstellungen und Updates…", () => app.props.settingsDialog()),
      item("info", "Über WerkCAD", () => app.props.aboutDialog()));
    document.body.append(m);
    setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  }
}
