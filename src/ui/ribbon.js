// Menüband mit kontextabhängigen Registerkarten
import { defaultWelle, defaultZahnrad, defaultLager, defaultFeder } from "../core/assistent.js";
import { regionDialog, draftDialog } from "./analyse.js";
import { extractDialog as ifeatExtractDialog, insertDialog as ifeatInsertDialog } from "./ifeatures.js";
import { defaultStecksystem } from "../core/stecksystem.js";
import { h, icon, toast, closeMenu, contextMenu } from "./dom.js";
import { problemsDialog } from "./pruefung.js";
import { catalogToDims } from "../core/sections.js";
import { defaultKnickrahmen } from "../core/knickrahmen.js";
import { defaultProfilzug } from "../core/profilzug.js";
import { defaultBiegerohr } from "../core/biegerohr.js";
import { defaultRegelkoerper } from "../core/regelkoerper.js";
import { defaultNormteil } from "../core/normteile.js";
import { defaultSchraubverbindung } from "../core/schraubverbindung.js";
import { defaultKantteil } from "../core/blech.js";
import { defaultLasche, defaultUmschlag, defaultDurchzug, defaultEckeSchliessen, defaultStanzung, SHEET_FEATURES } from "../core/blechplus.js";
import { defaultKonturwalzen, defaultTrennfuge } from "../core/konturwalzen.js";
import { derivableSources } from "../core/ableiten.js";
import { t as t_ } from "../core/i18n.js";
import { recordable } from "../core/makros.js";
import { defaultPlatte, defaultRippe } from "../core/anschluss.js";
import { DISPLAY } from "../core/settings.js";
import { GENERATORS, defaultGenerator, resolveGenParams } from "../core/generator.js";
import { insertGestellDialog, startGestellTool, changeMemberDialog, lengthenDialog, gestellInfoDialog } from "./gestell.js";
import { evaluate } from "../core/expr.js";
import { commandDef, inScope } from "../core/commands.js";
import { DEFAULT_LAYOUT, movePanel, togglePanel } from "../core/layout.js";
import { applyRibbonLayout, setGroupHidden, moveGroup, resetRibbonLayout, PROTECTED } from "../core/ribbonlayout.js";

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
        app.addFeature({ type: "extrude", sketch: sk, distance: String(app.prefs.get("werkzeuge.std.extrusion") ?? 10), mode: "normal", op: hasBody ? "join" : "join" });
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
      profile: () => app.addFeature({ type: "profile", section: "vierkant", dims: catalogToDims("vierkant", "40x3"), length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0", miterAxis: "v", cutMode: "2D", swivel: "45" }),
      frame: () => {
        const sk = needSketch((s) => s.entities.some((e) => e.type === "line" && !e.construction));
        if (sk) app.addFeature({ type: "frame", sketch: sk, section: "vierkant", dims: catalogToDims("vierkant", "40x3"), corner: "gehrung", align: "mitte", rotation: "0", cutMode: "2D", swivel: "45" });
      },
      knickrahmen: () => app.addFeature(defaultKnickrahmen(catalogToDims("rechteck", "60x40x3"))),
      profilzug: () => app.addFeature(defaultProfilzug(catalogToDims("vierkant", "40x3"))),
      regelkoerper: () => app.addFeature(defaultRegelkoerper("zylinder")),
      normteil: () => app.addFeature(defaultNormteil("schraube4017")),
      welle: () => app.addFeature(defaultWelle()),
      zahnrad: () => app.addFeature(defaultZahnrad()),
      lager: () => app.addFeature(defaultLager()),
      feder: () => app.addFeature(defaultFeder()),
      schraubverbindung: () => {
        const sk = app.lastSketchId((s) => s.entities.some((e) => e.type === "point" && !e.construction));
        if (!sk) return toast("Zuerst eine Skizze mit Punkten auf der Oberfläche zeichnen (Werkzeug »Punkt«, ein Punkt je Schraube)");
        app.addFeature(defaultSchraubverbindung(sk));
      },
      kantteil: () => app.addFeature(defaultKantteil()),
      konturlasche: () => {
        const sk = app.lastSketchId();
        if (!sk) return toast("Zuerst eine Skizze mit offener Linie zeichnen (Blechkante von der Seite gesehen)");
        const { legs, angles, pos, ref, ...rest } = defaultKantteil();
        const n = app.activeDoc().features.filter((g) => g.type === "kantteil" && g.src === "skizze").length + 1;
        app.addFeature({ ...rest, src: "skizze", sketch: sk, side: "links", extent: "normal", length: "200", name: `Konturlasche ${n}` });
      },
      lasche: () => this.addSheetFeature(defaultLasche),
      constraint: () => app.beginPlace(),
      variants: () => app.props.variantDialog(),
      rules: () => app.props.rulesDialog(),
      macros: () => app.props.macroDialog(),
      ifeatExtract: () => ifeatExtractDialog(app),
      ifeatInsert: () => ifeatInsertDialog(app),
      skizze3d: () => app.addFeature({ type: "skizze3d", points: [{ x: "0", y: "0", z: "0" }, { x: "500", y: "0", z: "0" }, { x: "500", y: "300", z: "200" }], radius: "50", closed: false }),
      abgeleitet: () => {
        const part = app.activeDoc(), srcs = derivableSources(app.project, part);
        if (!srcs.length) return toast("Kein anderes Bauteil im Projekt, aus dem abgeleitet werden kann");
        app.addFeature({ type: "abgeleitet", source: srcs[0].id, mirror: undefined, scale: "1" });
      },
      umschlag: () => this.addSheetFeature(defaultUmschlag),
      durchzug: () => this.addSheetFeature(defaultDurchzug),
      eckeschliessen: () => this.addSheetFeature(defaultEckeSchliessen),
      stanzung: () => this.addSheetFeature(defaultStanzung),
      konturwalzen: () => {
        const sk = app.lastSketchId();
        if (!sk) return toast("Zuerst eine Skizze mit offener Linie neben der Drehachse zeichnen (Skizzen-X- oder Y-Achse)");
        const n = app.activeDoc().features.filter((g) => g.type === "konturwalzen").length + 1;
        app.addFeature({ ...defaultKonturwalzen(sk), name: `Konturwalze ${n}` });
      },
      trennfuge: () => {
        const part = app.activeDoc();
        const sel = app.sel?.type === "feature" ? app.feature(app.sel.id) : null;
        const baseId = sel?.type === "konturwalzen" ? sel.id : part.features.filter((g) => g.type === "konturwalzen").at(-1)?.id;
        if (!baseId) return toast("Zuerst eine Konturwalze anlegen (Blech → Konturwalzen)");
        if (part.features.some((g) => g.type === "trennfuge" && g.base === baseId)) return toast("Die Konturwalze hat schon eine Trennfuge");
        app.addFeature(defaultTrennfuge(baseId), { at: part.features.findIndex((g) => g.id === baseId) + 1 });
      },
      platte: () => {
        const t = this.lastOf(["profile", "frame", "profilzug"]);
        if (!t) return toast("Zuerst ein Profil, einen Rahmen oder Profilzug erstellen");
        app.addFeature(defaultPlatte(t));
      },
      // Gestell (Inventor Konstruktion → Gestell), siehe src/ui/gestell.js
      gestellInsert: () => insertGestellDialog(app),
      gestellChange: () => changeMemberDialog(app),
      gestellMiter: () => startGestellTool(app, "gehrung"),
      gestellCorner: () => startGestellTool(app, "ecke"),
      gestellTrim: () => startGestellTool(app, "stutzen"),
      gestellNotch: () => startGestellTool(app, "nuten"),
      gestellTabs: () => startGestellTool(app, "stecken"),
      gestellLength: () => lengthenDialog(app),
      gestellReuse: () => startGestellTool(app, "reuse"),
      gestellInfo: () => gestellInfoDialog(app),
      endkappe: () => {
        const t = this.lastOf(["profile", "frame", "profilzug", "generator"]);
        if (!t) return toast("Zuerst ein Profil, einen Rahmen oder Profilzug erstellen");
        app.addFeature({ type: "endkappe", target: t, end: "beide", mode: "aufgesetzt", thickness: "3", overhang: "0" });
      },
      kuerzen: () => {
        const t = this.lastOf(["profile", "frame", "profilzug", "generator"]);
        if (!t) return toast("Zuerst ein Profil, einen Rahmen oder Profilzug erstellen");
        app.addFeature({ type: "kuerzen", target: t, plane: "YZ", offset: "0", end: "auto" });
      },
      gelaender: () => this.addGenerator("gelaender"),
      tor: () => this.addGenerator("tor"),
      schiebetor: () => this.addGenerator("schiebetor"),
      zaun: () => this.addGenerator("zaun"),
      treppe: () => this.addGenerator("treppe"),
      spindel: () => this.addGenerator("spindel"),
      balkon: () => this.addGenerator("balkon"),
      rahmenecke: () => this.addGenerator("rahmenecke"),
      pfette: () => this.addGenerator("pfette"),
      windverband: () => this.addGenerator("windverband"),
      naht: () => app.addFeature({ type: "naht", kind: "kehl", a: "4", side: "pfeil", around: false, field: false, edges: selEdges(), ...(app.activeDoc()?.features?.some((f) => f.type === "schweissbaugruppe") ? { bead: true } : {}) }),
      rippe: () => {
        const p = this.lastOf(["platte"]);
        if (!p) return toast("Zuerst eine Stirn-/Fußplatte erstellen");
        app.addFeature(defaultRippe(p));
      },
      biegerohr: () => app.addFeature(defaultBiegerohr(catalogToDims("rohr", "48.3x2.6"))),
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
      sweep: () => {
        const sks = app.activeDoc().features.filter((f) => f.type === "sketch");
        if (sks.length < 2) return toast("Zuerst zwei Skizzen anlegen: Profil (geschlossen) und Pfad (Linien/Bögen)");
        app.addFeature({ type: "sweep", sketch: sks.at(-2).id, path: sks.at(-1).id, op: "join" });
      },
      loft: () => {
        const sks = app.activeDoc().features.filter((f) => f.type === "sketch");
        if (sks.length < 2) return toast("Zuerst mindestens zwei Skizzen mit geschlossener Kontur anlegen (z. B. auf versetzten Ebenen)");
        app.addFeature({ type: "loft", sketches: sks.slice(-2).map((s) => s.id), ruled: false, op: "join" });
      },
      spirale: () => {
        const sk = app.lastSketchId();
        if (!sk) return toast("Zuerst eine Skizze mit dem Profil (z. B. Kreis neben der Achse) anlegen");
        app.addFeature({ type: "spirale", sketch: sk, axis: "y", mode: "umdrehungen", pitch: "10", turns: "5", op: "join" });
      },
      patternPath: () => {
        const src = this.lastPatternSource();
        const sks = app.activeDoc().features.filter((f) => f.type === "sketch" && f.id !== app.activeDoc().features.find((g) => g.id === src)?.sketch);
        if (!src || !sks.length) return toast("Zuerst ein Feature (z. B. Bohrung) und eine Skizze mit dem Pfad anlegen");
        app.addFeature({ type: "pattern", kind: "path", feature: src, path: sks.at(-1).id, count: "5", spacingMode: "gleich", align: true });
      },
      stecksystem: () => {
        const bodies = (app.results.get(app.activeId)?.bodies || []).filter((b) => b.kind === "solid");
        const fids = [...new Set(bodies.map((b) => b.fid))];
        if (fids.length < 2) return toast("Stecksystem braucht zwei Körper: ein Teil (Zapfen), das auf einem anderen (Schlitze) steht – z. B. Extrusion mit »Neuer Körper«");
        app.addFeature(defaultStecksystem(fids.at(-1), fids.at(-2)));
      },
      kombinieren: () => {
        const fids = [...new Set((app.results.get(app.activeId)?.bodies || []).filter((b) => b.kind === "solid").map((b) => b.fid))];
        if (fids.length < 2) return toast("Kombinieren braucht mindestens zwei Körper (z. B. Extrusion mit »Neuer Körper«)");
        app.addFeature({ type: "kombinieren", target: fids[0], tools: fids.slice(1), op: "cut" });
      },
      trennen: () => app.addFeature({ type: "trennen", plane: "YZ", offset: "0", keep: "beide" }),
      verschieben: () => app.addFeature({ type: "verschieben", bodies: [], move: ["0", "0", "0"], axis: "Z", angle: "0" }),
      aufdicken: () => app.addFeature({ type: "aufdicken", faces: [], thickness: "5", side: "aussen", op: "new" }),
      flaeche: () => app.addFeature({ type: "flaeche", faces: [], distance: "5" }),
      entformung: () => app.addFeature({ type: "entformung", faces: [], angle: "3", plane: "XY", offset: "0" }),
      datumPlane: () => app.addFeature({ type: "arbeitsebene", mode: "versatz", base: "XY", distance: "50" }),
      datumAxis: () => app.addFeature({ type: "arbeitsachse", mode: "parallel", dir: "Z", point: { x: "0", y: "0", z: "0" } }),
      datumPoint: () => app.addFeature({ type: "arbeitspunkt", mode: "koordinaten", x: "0", y: "0", z: "0" }),
      importStep: () => app.files.importStepIntoPart(),
      params: () => app.props.paramsDialog(),
      // Skizze
      finishSketch: () => app.finishSketch(),
      // Baugruppe
      place: () => app.props.placeComponentDialog(),
      asmPattern: () => app.props.newAsmPattern(),
      steckAsm: () => app.props.newSteckverbindung(),
      normteilAsm: () => app.props.normteilDialog(),
      align: () => app.beginAlign("gegen"),
      alignFlush: () => app.beginAlign("buendig"),
      alignConc: () => app.beginAlign("konzentrisch"),
      alignInsert: () => app.beginAlign("einfuegen"),
      alignAngle: () => app.beginAlign("winkel"),
      alignTangent: () => app.beginAlign("tangential"),
      bom: () => app.props.bomDialog(),
      // Zeichnung
      newDrawing: () => app.newDrawing(),
    };
  }
  /** Blech-Feature am gewählten (sonst letzten) Kantteil, direkt hinter dessen Blech-Features eingefügt */
  addSheetFeature(make) {
    const app = this.app, part = app.activeDoc();
    const sel = app.sel?.type === "feature" ? app.feature(app.sel.id) : null;
    const baseId = sel?.type === "kantteil" ? sel.id : sel?.base && part.features.some((g) => g.id === sel.base && g.type === "kantteil") ? sel.base : part.features.filter((g) => g.type === "kantteil").at(-1)?.id;
    if (!baseId) return toast("Zuerst ein Kantteil anlegen (Blech → Kantteil oder Konturlasche)");
    let at = part.features.findIndex((g) => g.id === baseId) + 1;
    while (at < part.features.length && SHEET_FEATURES.includes(part.features[at].type)) at++;
    app.addFeature(make(baseId), { at });
  }
  lastPatternSource() {
    const part = this.app.activeDoc();
    const sel = this.app.sel?.type === "feature" ? this.app.feature(this.app.sel.id) : null;
    const ok = (f) => ["extrude", "revolve", "hole", "emboss", "profile", "frame", "profilzug", "biegerohr", "regelkoerper", "normteil", "kantteil", "sweep", "loft", "spirale", "import"].includes(f.type);
    if (sel && ok(sel)) return sel.id;
    const list = part.features.filter(ok);
    return list.length ? list[list.length - 1].id : null;
  }
  addGenerator(gen) {
    // Generatoren stehen in der Baugruppe: sie legen eine Unterbaugruppe mit Einzelteilen an und bauen sie hier ein;
    // das Schiebetor wird eine Unterbaugruppe aus Flügel und festen Teilen mit Schiebegelenk
    const into = this.app.activeDoc()?.kind === "assembly" ? this.app.activeDoc() : null;
    if (gen === "schiebetor") return this.app.props.slidingGateAssembly({ ...defaultGenerator(gen), name: `Schiebetor ${this.app.project.docs.filter((d) => d.kind === "assembly" && /^Schiebetor/.test(d.name)).length + 1}` }, (params) => GENERATORS[gen].plan(resolveGenParams(gen, params, (x) => evaluate(String(x), {}))), { into });
    return this.app.generatorAssembly(gen, { into });
  }
  /** gewähltes Feature eines der Typen, sonst das letzte im Bauteil */
  lastOf(types) {
    const part = this.app.activeDoc();
    const sel = this.app.sel?.type === "feature" ? this.app.feature(this.app.sel.id) : null;
    if (sel && types.includes(sel.type)) return sel.id;
    const list = part.features.filter((f) => types.includes(f.type) && !f.suppressed);
    return list.length ? list[list.length - 1].id : null;
  }
  run(id) {
    const a = this.actions[id];
    if (!a) return;
    const rec = this.app.commands?.recording;
    if (rec && recordable("part." + id)) { rec.push("part." + id); toast(`Aufgezeichnet: ${commandDef("part." + id).label} (${rec.length})`, { timeout: 1200 }); }
    return a();
  }

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
        { label: "Modus", small: true, buttons: DISPLAY.map((d) => B("dm_" + d.value, d.label, d.value === "draht" ? "grid" : d.value === "foto" ? "camera" : "eye", { on: app.viewer.displayMode === d.value, run: () => app.prefs.set("ansicht.darstellung", d.value) })) },
        { label: "Auswahl", small: true, buttons: [
          B("sf_alles", "Alles wählbar", "view", { on: app.selFilter === "alles", run: () => app.setSelFilter("alles") }),
          B("sf_flaechen", "Nur Flächen", "plane", { on: app.selFilter === "flaechen", run: () => app.setSelFilter("flaechen") }),
          B("sf_kanten", "Nur Kanten", "line", { on: app.selFilter === "kanten", run: () => app.setSelFilter("kanten") }),
          B("sel_all", "Alle wählen", "view", { disabled: app.mode !== "part", run: () => app.selectEverything() }),
          B("sel_inv", "Umkehren", "view", { disabled: app.mode !== "part", run: () => app.invertSelection() }),
        ] },
        { label: "Fenster", small: true, buttons: (() => {
          const L = app.prefs.get("oberflaeche.layout") || DEFAULT_LAYOUT, set = (v) => app.prefs.set("oberflaeche.layout", v);
          return [
            B("w_browser", "Modellbrowser", "eye", { on: !L.hide.includes("browser"), run: () => set(togglePanel(L, "browser")) }),
            B("w_props", "Eigenschaften", "eye", { on: !L.hide.includes("props"), run: () => set(togglePanel(L, "props")) }),
            B("w_reset", "Anordnung zurücksetzen", "view", { disabled: JSON.stringify(L) === JSON.stringify(DEFAULT_LAYOUT), run: () => app.prefs.reset(["oberflaeche.layout"]) }),
            B("w_bside", "Browser rechts", "view", { on: L.browser === "right", run: () => set(movePanel(L, "browser", L.browser === "right" ? "left" : "right")) }),
            B("w_pside", "Eigenschaften links", "view", { on: L.props === "left", run: () => set(movePanel(L, "props", L.props === "left" ? "right" : "left")) }),
          ];
        })() },
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
          { label: "Skizze", buttons: [B("sketch", "Skizze erstellen", "sketch"), B("skizze3d", "3D-Skizze", "path3d")] },
          { label: "Arbeitselemente", buttons: [B("datumPlane", "Arbeitsebene", "plane"), B("datumAxis", "Arbeitsachse", "axis"), B("datumPoint", "Arbeitspunkt", "point")] },
          { label: "Erstellen", buttons: [B("extrude", "Extrusion", "extrude"), B("cutExtrude", "Ausschnitt", "cut"), B("revolve", "Drehung", "revolve"), B("hole", "Bohrung", "hole"), B("emboss", "Prägen", "emboss"), B("regelkoerper", "Regelkörper", "regelkoerper"), B("sweep", "Sweeping", "sweep"), B("loft", "Erhebung", "loft"), B("spirale", "Spirale", "coil")] },
          { label: "Profile", buttons: [B("profile", "Rohr / Profil", "profile"), B("frame", "Rahmen aus Skizze", "frame"), B("profilzug", "Profilzug 3D", "profilzug"), B("biegerohr", "Rohr gebogen", "biegerohr"), B("knickrahmen", "Knickrahmen", "knick"), B("gestellInsert", "Gestell einfügen", "frame"), B("endkappe", "Endkappe", "endcap"), B("kuerzen", "Kürzen/Verlängern", "extend")] },
          { label: "Blech", buttons: [B("kantteil", "Kantteil", "kantteil"), B("konturlasche", "Konturlasche", "contourflange"), B("lasche", "Lasche", "flange"), B("umschlag", "Umschlag", "hem"), B("durchzug", "Durchzug", "collar"), B("eckeschliessen", "Ecke schließen", "cornerseam"), B("stanzung", "Stanzwerkzeug", "punch"), B("konturwalzen", "Konturwalzen", "contourroll"), B("trennfuge", "Trennfuge", "rip")] },
          { label: "Anschluss", buttons: [B("platte", "Stirn-/Fußplatte", "platte"), B("rippe", "Rippe", "rippe"), B("naht", "Schweißnaht", "naht"), B("normteil", "Normteil", "normteil"), B("schraubverbindung", "Schraubenverbindung", "bolt")] },
          { label: "Konstruktion", small: true, buttons: [B("welle", "Welle", "shaft"), B("zahnrad", "Stirnrad", "gear"), B("lager", "Lager", "bearing"), B("feder", "Druckfeder", "spring")] },
          { label: "Ändern", buttons: [B("fillet", "Rundung", "fillet"), B("chamfer", "Fase", "chamfer"), B("shell", "Wandung", "shell")] },
          { label: "Körper", buttons: [B("kombinieren", "Kombinieren", "combine"), B("stecksystem", "Stecksystem", "tabslot"), B("trennen", "Trennen", "split"), B("verschieben", "Verschieben", "move"), B("aufdicken", "Aufdicken", "thicken"), B("flaeche", "Fläche verschieben", "pushpull"), B("entformung", "Entformung", "draft")] },
          { label: "Muster", buttons: [B("patternLin", "Rechteckig", "pattern"), B("patternCirc", "Kreisförmig", "circpattern"), B("patternPath", "Entlang Pfad", "pathpattern"), B("mirror", "Spiegeln", "mirror")] },
          { label: "Prüfen", buttons: [B("measure", "Messen", "dimension", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() }), B("draftAnalysis", "Entformungsanalyse", "draftan", { on: !!app.viewer.draftOn, run: () => draftDialog(app) }), B("regionPropsPart", "Bereichseigenschaften", "area", { run: () => regionDialog(app) })] },
          { label: "Verwalten", buttons: [B("params", "Parameter", "params"), B("importStep", "STEP einfügen", "import"), B("abgeleitet", "Abgeleitetes Bauteil", "derive"), B("variants", "Variantentabelle", "table"), B("rules", "Regeln", "rules"), B("macros", "Makros", "macro"), B("ifeatExtract", "iFeature erstellen", "ifeature"), B("ifeatInsert", "iFeature einfügen", "ifeature"), B("rebuildNow", "Neu berechnen", "update", { on: !!app.stale, run: () => app.rebuildNow() }), B("problems", "Problemliste", "warn", { run: () => problemsDialog(app) })] },
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
            T("circle", "Kreis", "circle"), T("arc3", "Bogen", "arc"), T("arcc", "Bogen Mitte", "arcc"), T("spline", "Spline", "spline"), T("point", "Punkt", "point"),
          ] },
          { label: "Formen", small: true, buttons: [T("ellipse", "Ellipse", "ellipse"), T("slot", "Langloch", "slot"), T("polygon", "Polygon", "polygon")] },
          { label: "Ändern", buttons: [T("trim", "Stutzen", "trim"), T("extend", "Verlängern", "extend"), T("split", "Teilen", "split"), T("sfillet", "Rundung", "fillet"), T("offset", "Versatz", "offset"), T("mirror", "Spiegeln", "mirror"), B("sclean", "Säubern", "clean", { run: () => sk.cleanDialog() }), B("sdxf", "DXF importieren", "import", { run: () => sk.importDxfDialog() })] },
          { label: "Muster", small: true, buttons: [T("pattern", "Rechteckmuster", "pattern"), T("cpattern", "Kreismuster", "circpattern")] },
          { label: "Übernehmen", small: true, buttons: [T("project", "Kante projizieren", "project"), B("constr", "Konstruktion", "construct", { on: !!sk.construction, run: () => sk.toggleConstruction() })] },
          { label: "Bemaßung", buttons: [T("dimension", "Bemaßung", "dimension"), B("autodim", "Voll bemaßen", "dimension", { run: () => sk.autoDimensionDialog() })] },
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
          { label: "Prüfen", buttons: [B("regionProps", "Bereichseigenschaften", "area", { run: () => regionDialog(app) })] },
          { label: "Beenden", buttons: [B("finishSketch", "Skizze fertig", "finish", { finish: true })] },
        ] },
        view,
      ];
    }
    if (mode === "assembly") {
      return [
        { id: "baugruppe", label: "Zusammenfügen", groups: [
          { label: "Komponente", buttons: [B("place", "Platzieren", "place"), B("normteilAsm", "Normteil", "normteil"), B("newPartInAsm", "Neues Bauteil", "part", { run: () => app.props.newPartForAssembly() }), B("linkPart", "Aus Datei", "open", { run: () => app.files.linkPartFromFile() }), B("asmPattern", "Muster", "pattern"), B("steckAsm", "Stecksystem", "tabslot"), B("asmMirror", "Spiegeln", "mirror", { run: () => app.props.mirrorComponent() })] },
          { label: "Generatoren", buttons: [B("gelaender", "Geländer", "gelaender"), B("tor", "Tor", "tor"), B("schiebetor", "Schiebetor", "schiebetor"), B("zaun", "Zaun", "zaun"), B("treppe", "Treppe", "treppe"), B("spindel", "Spindeltreppe", "spindel"), B("balkon", "Balkon", "balkon")] },
          { label: "Stahlbau", buttons: [B("rahmenecke", "Rahmenecke", "rahmenecke"), B("pfette", "Pfette", "pfette"), B("windverband", "Windverband", "windverband")] },
          { label: "Gestell", small: true, buttons: (() => {
            const g = !!app.activeDoc()?.gestell, on = (t) => app.pick?.kind === "gestell" && app.pick.tool === t;
            return [
              B("gestellInsert", "Gestell einfügen", "frame"),
              B("gestellChange", "Ändern", "edit", { disabled: !g }),
              B("gestellMiter", "Gehrung", "frame", { disabled: !g, on: on("gehrung") }),
              B("gestellCorner", "Eckverbindung", "frame", { disabled: !g, on: on("ecke") }),
              B("gestellTrim", "Auf Gestell stutzen", "trim", { disabled: !g, on: on("stutzen") }),
              B("gestellNotch", "Nuten", "cut", { disabled: !g, on: on("nuten") }),
              B("gestellTabs", "Stecknasen", "platte", { disabled: !g, on: on("stecken") }),
              B("gestellLength", "Verlängern/Kürzen", "extend", { disabled: !g }),
              B("gestellReuse", "Wiederverwenden", "copy", { disabled: !g, on: on("reuse") }),
              B("gestellInfo", "Gestell-Info", "info", { disabled: !g }),
            ];
          })() },
          { label: "Positionieren", buttons: [B("constraint", "Abhängigkeit", "align", { on: app.pick?.kind === "align" && !!app.align?.type }), B("align", "Fläche an Fläche", "align", { on: app.pick?.kind === "align" && app.align?.mode === "gegen" }), B("alignFlush", "Bündig", "align", { on: app.pick?.kind === "align" && app.align?.mode === "buendig" }), B("alignConc", "Konzentrisch", "concentric", { on: app.pick?.kind === "align" && app.align?.mode === "konzentrisch" }), B("alignInsert", "Einfügen", "insert", { on: app.pick?.kind === "align" && app.align?.mode === "einfuegen" }), B("alignAngle", "Winkel", "angle", { on: app.pick?.kind === "align" && app.align?.mode === "winkel" }), B("alignTangent", "Tangential", "tangent", { on: app.pick?.kind === "align" && app.align?.mode === "tangential" })] },
          { label: "Listen", buttons: [B("weldment", "Schweißbaugruppe", "weldasm", { run: () => app.props.makeWeldment() }), B("bom", "Stückliste", "bom"), B("cutlist", "Zuschnittliste", "cut", { run: () => app.props.cutListDialog() })] },
          { label: "Prüfen", buttons: [B("measure", "Messen", "dimension", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() }), B("collide", "Kollision prüfen", "info", { run: () => app.props.collisionDialog() }), B("problems", "Problemliste", "warn", { run: () => problemsDialog(app) })] },
          { label: "Bewegung", buttons: [B("joint", "Drehgelenk", "hinge", { run: () => app.props.jointDialog() }), B("jointCyl", "Zylindergelenk", "hinge", { run: () => app.props.jointDialog(null, "zylinder") }), B("animate", "Bewegen", "motion", { run: () => app.props.animateJoints() }), B("contactSolver", "Kontaktlöser", "contact", { on: !!app.activeDoc()?.contactSolver, run: () => app.props.toggleContactSolver() }), B("contactSet", "Kontaktsatz", "contact", { run: () => app.props.toggleContactSet() }), B("motionVideo", "Video", "video", { run: () => app.props.recordMotion() }), B("explode", "Explosion", "explode", { on: app.viewer.explode > 0, run: () => app.props.explodeDialog() })] },
          { label: "Zeichnung", buttons: [B("newDrawing", "Zeichnung ableiten", "drawing"), B("partDrawings", "Einzelteilzeichnungen", "drawing", { run: () => app.partDrawings(app.activeId) })] },
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
            B("dv_aux", "Hilfsansicht", "view", { on: dr.tool === "aux", run: () => (dr.tool === "aux" ? dr.setTool(null) : dr.startAux()) }),
            B("dv_flat", "Abwicklung", "kantteil", { run: () => dr.addFlatView() }),
            B("dv_break", "Bruch", "cut", { run: () => dr.breakDialog() }),
            B("dv_bo", "Ausbruch", "cut", { on: dr.tool === "breakout", run: () => (dr.tool === "breakout" ? dr.setTool(null) : dr.startBreakout()) }),
          ] },
          { label: "Beschriften", buttons: [
            B("dd_dim", "Bemaßung", "dimension", { on: dr.tool === "dim", run: () => dr.setTool(dr.tool === "dim" ? null : "dim") }),
            B("dd_auto", "Hauptmaße", "dimension", { run: () => dr.autoDims() }),
            B("dd_text", "Text", "text", { on: dr.tool === "text", run: () => dr.setTool(dr.tool === "text" ? null : "text") }),
            B("dd_leader", "Hinweis", "text", { on: dr.tool === "leader", run: () => dr.setTool(dr.tool === "leader" ? null : "leader") }),
            B("dd_holes", "Bohrungstabelle", "bom", { run: () => dr.addHoleTable() }),
            B("dd_surf", "Oberfläche", "dimension", { on: dr.tool === "surface", run: () => dr.setTool(dr.tool === "surface" ? null : "surface") }),
            B("dd_gdt", "Form/Lage", "dimension", { on: dr.tool === "gdt", run: () => dr.setTool(dr.tool === "gdt" ? null : "gdt") }),
            B("dd_datum", "Bezug", "dimension", { on: dr.tool === "datum", run: () => dr.setTool(dr.tool === "datum" ? null : "datum") }),
            B("dd_weld", "Schweißnähte", "naht", { run: () => dr.autoWelds() }),
            B("dd_rev", "Änderung", "text", { run: () => dr.addRevisionDialog() }),
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
    if (mode === "start") {
      // Startseite: nur Extras (Anwendungsoptionen und Hilfe), wie bei gängigen Konstruktionsprogrammen
      return [
        { id: "extras", label: "Extras", groups: [
          { label: "Optionen", buttons: [
            B("x_options", "Anwendungs­optionen", "settings", { run: () => app.props.settingsDialog() }),
            B("x_ribbon", "Menüband anpassen", "grid", { run: () => app.props.settingsDialog({ category: "werkzeuge" }) }),
            B("x_material", "Materialien", "steel", { run: () => app.props.settingsDialog({ category: "material" }) }),
          ] },
          { label: "Hilfe", buttons: [
            B("x_search", "Befehl suchen", "search", { run: () => app.commands.exec("app.search") }),
            B("x_steps", "Erste Schritte", "play", { run: () => app.start.firstSteps() }),
            B("x_about", "Über PBCAD", "info", { run: () => app.props.aboutDialog() }),
            window.werkcad?.openLogFolder ? B("x_log", "Fehler­protokoll", "open", { run: () => window.werkcad.openLogFolder() }) : null,
          ].filter(Boolean) },
        ] },
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
      groups.push({ label: "3D", buttons: [B("x_step", "STEP", "export", () => f.exportStep()), B("x_steplist", "STEP + Zuschnittliste", "export", () => f.exportStepWithList()), B("x_iges", "IGES", "export", () => f.exportIges()), B("x_stl", "STL", "export", () => f.exportStl()), B("x_png", "Bild (PNG)", "camera", () => f.exportPng()), B("x_render", "Rendern", "camera", () => f.exportPng({ photo: true }))] });
      groups.push({ label: "Profile", buttons: [B("x_members", "Profile einzeln (STEP)", "profile", () => f.exportMembers()), B("x_cut", "Zuschnittliste (CSV)", "cut", () => f.exportCutList()), B("x_weld", "Nahtliste (CSV)", "naht", () => f.exportWeldList()), B("x_xlsx", "Listen (Excel)", "bom", () => f.exportListsXlsx())] });
      groups.push({ label: "2D", buttons: [B("x_plate", "Platte als DXF", "drawing", () => f.exportPlateDxf()), B("x_dxf", "Skizze als DXF", "sketch", () => f.exportSketchDxf())] });
      groups.push({ label: "Werkstatt", buttons: [B("x_mappe", "Fertigungsmappe", "pdf", () => f.exportMappe()), B("x_angebot", "Angebotsblatt", "pdf", () => f.exportAngebot())] });
    } else if (kind === "assembly") {
      groups.push({ label: "3D", buttons: [B("x_step", "STEP", "export", () => f.exportStep()), B("x_steplist", "STEP + Zuschnittliste", "export", () => f.exportStepWithList()), B("x_iges", "IGES", "export", () => f.exportIges()), B("x_stl", "STL", "export", () => f.exportStl()), B("x_png", "Bild (PNG)", "camera", () => f.exportPng()), B("x_render", "Rendern", "camera", () => f.exportPng({ photo: true }))] });
      groups.push({ label: "Profile", buttons: [B("x_members", "Profile einzeln (STEP)", "profile", () => f.exportMembers())] });
      groups.push({ label: "Listen", buttons: [B("x_bom", "Stückliste (CSV)", "bom", () => f.exportBom()), B("x_cut", "Zuschnittliste (CSV)", "cut", () => f.exportCutList()), B("x_weld", "Nahtliste (CSV)", "naht", () => f.exportWeldList()), B("x_xlsx", "Listen (Excel)", "bom", () => f.exportListsXlsx())] });
      groups.push({ label: "Werkstatt", buttons: [B("x_mappe", "Fertigungsmappe", "pdf", () => f.exportMappe()), B("x_angebot", "Angebotsblatt", "pdf", () => f.exportAngebot())] });
    } else if (kind === "drawing") {
      groups.push({ label: "Zeichnung", buttons: [B("x_pdf", "PDF", "pdf", () => app.drawing.exportPdf()), B("x_dxf", "DXF", "drawing", () => app.drawing.exportDxf()), B("x_svg", "SVG", "drawing", () => app.drawing.exportSvg())] });
    }
    return { id: "export", label: "Export", groups };
  }

  /** Schnellzugriff: angeheftete Befehle (Einstellung werkzeuge.schnellzugriff) */
  quickAccess() {
    const app = this.app;
    const ids = app.prefs.get("werkzeuge.schnellzugriff") || [];
    if (!ids.length) return null;
    return h("div", { class: "rb-qa", role: "toolbar", "aria-label": "Schnellzugriff" }, ...ids.map((id) => {
      const c = commandDef(id);
      if (!c) return null;
      const k = this.kbd(id);
      return h("button", { class: "rb-qa-btn", "data-cmd": id, title: c.label + (k ? ` (${k})` : ""), disabled: !inScope(c, app.mode), onclick: () => app.commands.exec(id) }, c.label.replace(/^Skizze: /, ""));
    }));
  }

  render() {
    const app = this.app;
    const mode = app.mode;
    const tabs = this.tabsFor(mode);
    if (!tabs.find((t) => t.id === this.tab)) this.tab = tabs[0]?.id;
    if (mode === "sketch") this.tab = this.tab === "ansicht" ? "ansicht" : "skizze";
    const tabBar = h("div", { class: "rb-tabs" },
      h("button", { class: "rb-file", onclick: (e) => this.fileMenu(e) }, "Datei"),
      ...tabs.map((t) => h("button", { class: "rb-tab" + (t.id === this.tab ? " active" : "") + (t.context ? " context" : ""), onclick: () => { this.tab = t.id; this.render(); } }, t_(t.label))),
      h("div", { class: "rb-spacer" }),
      h("button", { class: "rb-search", title: `Befehl suchen (${this.kbd("app.search") || "Strg+K"})`, onclick: () => app.commands.exec("app.search") }, icon("search"), h("span", {}, "Befehl suchen"), this.kbd("app.search") ? h("span", { class: "kbd" }, this.kbd("app.search")) : null),
      h("button", { class: "icon-btn", title: "Rückgängig (Strg+Z)", disabled: !app.undoStack.length, onclick: () => app.undo() }, icon("undo")),
      h("button", { class: "icon-btn", title: "Wiederholen (Strg+Y)", disabled: !app.redoStack.length, onclick: () => app.redo() }, icon("redo")),
      this.quickAccess(),
      this.docLabel = h("div", { class: "rb-doc" }));
    this.renderDocLabel();
    const tab = tabs.find((t) => t.id === this.tab);
    const panel = h("div", { class: "rb-panel" });
    if (tab) {
      const L = applyRibbonLayout(tab.id, tab.groups, this.app.prefs.get("werkzeuge.menueband") || {});
      for (const g of L.groups) {
        const btns = h("div", { class: "rb-buttons" });
        if (g.small) {
          // Kleine Knöpfe in Spalten zu je 3
          for (let i = 0; i < g.buttons.length; i += 3) {
            btns.append(h("div", { class: "rb-stack" }, ...g.buttons.slice(i, i + 3).map((b) =>
              h("button", { class: "rb-small" + (b.on ? " on" : ""), title: this.tip(b), onclick: b.run, disabled: b.disabled }, icon(b.icon), t_(b.label)))));
          }
        } else {
          for (const b of g.buttons) btns.append(h("button", { class: "rb-btn" + (b.on ? " on" : "") + (b.finish ? " rb-finish" : ""), onclick: b.run, disabled: b.disabled, title: this.tip(b) }, icon(b.icon), h("span", {}, t_(b.label))));
        }
        panel.append(h("div", { class: "rb-group", "data-group": g.label, oncontextmenu: (e) => { e.preventDefault(); this.groupMenu(e, tab, g.label); } }, btns, h("div", { class: "rb-group-label" }, t_(g.label))));
      }
      if (L.hidden.length) panel.append(h("button", { class: "rb-hidden", title: "Ausgeblendete Gruppen: " + L.hidden.join(", "), onclick: (e) => this.hiddenMenu(e, tab, L.hidden) }, "+" + L.hidden.length));
    } else if (mode === "start") {
      panel.append(h("div", { class: "hint", style: { alignSelf: "center", padding: "0 8px" } }, "Neues Projekt anlegen oder vorhandenes öffnen."));
    }
    this.el.replaceChildren(tabBar, panel);
  }
  /** Rechtsklick auf eine Gruppe: verschieben, ausblenden, anpassen */
  groupMenu(e, tab, label) {
    const labels = tab.groups.map((g) => g.label);
    const L = applyRibbonLayout(tab.id, tab.groups, this.layoutCfg());
    const i = L.groups.findIndex((g) => g.label === label);
    contextMenu(e.clientX, e.clientY, [
      { label: "Nach links", disabled: i <= 0, run: () => this.setLayout(moveGroup(this.layoutCfg(), tab.id, label, -1, labels, { overHidden: true })) },
      { label: "Nach rechts", disabled: i >= L.groups.length - 1, run: () => this.setLayout(moveGroup(this.layoutCfg(), tab.id, label, +1, labels, { overHidden: true })) },
      { label: `»${label}« ausblenden`, disabled: (PROTECTED[tab.id] || []).includes(label) || L.groups.length < 2, run: () => this.setLayout(setGroupHidden(this.layoutCfg(), tab.id, label, true, labels)) },
      "-",
      { label: "Karte »" + tab.label + "« zurücksetzen", disabled: !this.layoutCfg()[tab.id], run: () => this.setLayout({ ok: true, value: resetRibbonLayout(this.layoutCfg(), tab.id) }) },
      { label: "Menüband anpassen…", icon: "settings", run: () => this.app.props.settingsDialog({ category: "werkzeuge" }) },
    ]);
  }
  hiddenMenu(e, tab, hidden) {
    const labels = tab.groups.map((g) => g.label);
    const r = e.currentTarget.getBoundingClientRect();
    contextMenu(r.left, r.bottom, [
      ...hidden.map((label) => ({ label: `»${label}« einblenden`, icon: "eye", run: () => this.setLayout(setGroupHidden(this.layoutCfg(), tab.id, label, false, labels)) })),
      "-",
      { label: "Alle einblenden", run: () => { const c = this.layoutCfg(); this.setLayout({ ok: true, value: c[tab.id] ? { ...c, [tab.id]: { ...c[tab.id], hide: [] } } : c }); } },
    ]);
  }
  layoutCfg() { return this.app.prefs.get("werkzeuge.menueband") || {}; }
  setLayout(r) {
    if (!r.ok) return toast(r.error, { kind: "err" });
    const s = this.app.prefs.set("werkzeuge.menueband", r.value);
    if (!s.ok) toast(s.error, { kind: "err" });
  }
  /** Alle Registerkarten mit ihren Gruppen (für das Einstellungscenter), Reihenfolge wie im Standard */
  catalog() {
    const tabs = new Map();
    for (const mode of ["part", "sketch", "assembly", "drawing"]) {
      let list = [];
      try { list = this.tabsFor(mode); } catch { continue; }
      for (const t of list) {
        const e = tabs.get(t.id) || { id: t.id, label: t.label, labels: [] };
        for (const g of t.groups) if (!e.labels.includes(g.label)) e.labels.push(g.label);
        tabs.set(t.id, e);
      }
    }
    return [...tabs.values()];
  }
  kbd(id) { return this.app.commands?.label(id) || ""; }
  /** Tooltip mit Tastaturkürzel, falls der Knopf einem Befehl entspricht */
  tip(b) {
    const special = { rebuildNow: "model.rebuild", measure: "tools.measure", collide: "asm.collide", problems: "model.problems", finishSketch: "sketch.finish", constr: "sketch.construction", sclean: "sketch.clean", sdxf: "sketch.importDxf", gridsnap: "sketch.gridsnap", v_fitsel: "view.fitSel", v_persp: "view.perspective", clip_X: "view.clipX", clip_Y: "view.clipY", clip_Z: "view.clipZ" };
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
      window.werkcad ? item("open", "Schreibgeschützt öffnen…", () => f.open(null, { readOnly: true })) : null,
      item("save", "Speichern", () => f.save(false), this.kbd("file.save")),
      item("save", "Speichern unter…", () => f.save(true), this.kbd("file.saveAs")),
      item("export", "Projekt paketieren…", () => f.packageProject()),
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
