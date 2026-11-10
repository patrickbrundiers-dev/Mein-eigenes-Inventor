// Menüband mit kontextabhängigen Registerkarten
import { plasticDefaults } from "../core/kunststoff.js";
import { OP_NAMES } from "../core/extrusionop.js";
import { SURFACE_CHECKS, surfaceCheckDialog, compareBodiesDialog } from "./flaechenpruefung.js";
import { defaultWelle, defaultZahnrad, defaultLager, defaultFeder } from "../core/assistent.js";
import { FF_ARTEN } from "../core/freiflaeche.js";
import { regionDialog, draftDialog } from "./analyse.js";
import { extractDialog as ifeatExtractDialog, insertDialog as ifeatInsertDialog } from "./ifeatures.js";
import { defaultStecksystem } from "../core/stecksystem.js";
import { h, icon, toast, closeMenu, contextMenu } from "./dom.js";
import { workspaceMenu } from "./arbeitsbereiche.js";
import { problemsDialog } from "./pruefung.js";
import { newGrid } from "./achsraster.js";
import { saveToLibrary, libraryDialog } from "./teilebibliothek.js";
import { catalogToDims } from "../core/sections.js";
import { defaultKnickrahmen } from "../core/knickrahmen.js";
import { defaultProfilzug } from "../core/profilzug.js";
import { defaultBiegerohr } from "../core/biegerohr.js";
import { defaultRegelkoerper } from "../core/regelkoerper.js";
import { defaultNormteil } from "../core/normteile.js";
import { normLibraryDialog } from "./normlib.js";
import { defaultSchraubverbindung } from "../core/schraubverbindung.js";
import { defaultKantteil } from "../core/blech.js";
import { defaultBlechkasten } from "../core/blechkasten.js";
import { defaultLasche, defaultUmschlag, defaultDurchzug, defaultEckeSchliessen, defaultStanzung, defaultKroepfung, defaultFalten, SHEET_FEATURES } from "../core/blechplus.js";
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
import { undoHistory } from "../core/zuletzt.js";
import { rememberCommand } from "./commands.js";
import { DEFAULT_LAYOUT, movePanel, togglePanel } from "../core/layout.js";
import { applyRibbonLayout, setGroupHidden, moveGroup, resetRibbonLayout, PROTECTED } from "../core/ribbonlayout.js";
import { formSubDialog, jointPick } from "./baugruppe.js";
import { befehlHilfe } from "../core/befehlshilfe.js";
import { SKETCH_TOOLS } from "./sketcher.js";
import { bindTooltips } from "./tooltip.js";
import { KeyTips } from "./keytips.js";
import { startDatumPick } from "./arbeitselemente.js";
import { startDirekt } from "./direkt.js";
import * as plaene from "./plaene.js";

export class Ribbon {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("ribbon");
    this.tab = null;
    this.actions = this.defineActions();
    this.tips = bindTooltips(this.el);
    this.keytips = new KeyTips(this);
    this.last = null; // zuletzt benutzter Knopf (»Wiederholen« im Rechtsklick-Menü)
    // Menüband an die Fensterbreite anpassen: Gruppen von rechts zu einem Knopf einklappen
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.fitGroups()).observe(this.el);
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
        const op = hasBody && app.prefs.get("werkzeuge.extrusionAutomatisch") !== false ? app.autoExtrudeOp(sk) : "join";
        app.addFeature({ type: "extrude", sketch: sk, distance: String(app.prefs.get("werkzeuge.std.extrusion") ?? 10), mode: "normal", op });
        if (op !== "join") toast(`Vorgang automatisch: ${OP_NAMES[op]}${op === "cut" ? " (Skizze liegt am Körper, Richtung ins Material)" : " (Skizze berührt keinen Körper)"} – rechts umstellbar`, { timeout: 4500 });
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
      langloch: () => {
        const sk = needSketch((s) => s.entities.some((e) => (e.type === "point" && !e.construction) || e.type === "circle"));
        if (sk) app.addFeature({ type: "hole", form: "langloch", name: "Langloch", sketch: sk, diameter: "11", slotLength: "30", slotAngle: "0", extent: "through", depth: "10", direction: "reverse", sink: "none" });
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
      normteil: () => normLibraryDialog(app, { mode: "part", onApply: (v) => app.addFeature({ ...defaultNormteil(v.kind, v.custom), ...v }) }),
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
      blechkasten: () => app.addFeature(defaultBlechkasten()),
      inBlech: () => this.convertToSheet(),
      konturlasche: () => {
        const sk = app.lastSketchId();
        if (!sk) return toast("Zuerst eine Skizze mit offener Linie zeichnen (Blechkante von der Seite gesehen)");
        const { legs, angles, pos, ref, ...rest } = defaultKantteil();
        const n = app.activeDoc().features.filter((g) => g.type === "kantteil" && g.src === "skizze").length + 1;
        app.addFeature({ ...rest, src: "skizze", sketch: sk, side: "links", extent: "normal", length: "200", name: `Konturlasche ${n}` });
      },
      lasche: () => this.addSheetFeature(defaultLasche),
      constraint: () => app.beginPlace({ repeat: true }),
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
      kroepfung: () => this.addSheetFeature(defaultKroepfung),
      falten: () => this.addSheetFeature(defaultFalten),
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
      strecken: () => {
        const t = this.lastOf(["biegerohr", "generator"]);
        if (!t) return toast("Zuerst ein gebogenes Rohr oder einen Generator mit Bogen (z. B. Wendeltreppe) erstellen");
        app.addFeature({ type: "strecken", target: t });
      },
      zinkloch: () => {
        if (!this.lastOf(["profile", "frame", "profilzug", "generator"])) return toast("Zuerst ein Profil, einen Rahmen oder Profilzug erstellen");
        app.addFeature({ type: "zinkloch", target: "", ends: "beide", dir: "v", d: "", edge: "10" });
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
      voute: () => this.addGenerator("voute"),
      pfette: () => this.addGenerator("pfette"),
      windverband: () => this.addGenerator("windverband"),
      fachwerk: () => this.addGenerator("fachwerk"),
      arbeitsbuehne: () => this.addGenerator("arbeitsbuehne"),
      vordach: () => this.addGenerator("vordach"),
      pergola: () => this.addGenerator("pergola"),
      fenstergitter: () => this.addGenerator("fenstergitter"),
      rampe: () => this.addGenerator("rampe"),
      zarge: () => this.addGenerator("zarge"),
      klemmgelaender: () => this.addGenerator("klemmgelaender"),
      steigleiter: () => this.addGenerator("steigleiter"),
      stuetzenfuss: () => this.addGenerator("stuetzenfuss"),
      traegerstoss: () => this.addGenerator("traegerstoss"),
      traegeranschluss: () => this.addGenerator("traegeranschluss"),
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
      ...Object.fromEntries(FF_ARTEN.map((a) => ["ff_" + a.art, () => app.addFeature({ type: "freiflaeche", art: a.art, ...JSON.parse(JSON.stringify(a.def)) })])),
      flaechenkurve: () => app.addFeature({ type: "flaechenkurve", faces: [], art: "iso", richtung: "u", wert: "0.5" }),
      auflage: () => app.addFeature({ type: "auflage", faces: [] }),
      kunststoff: () => {
        const rule = (app.prefs.get("material.kunststoffregeln") || [])[0];
        const sk = this.lastOf(["sketch"]);
        app.addFeature({ type: "kunststoff", art: "ansatz", sketch: sk || "", ruleData: rule ? { ...rule } : undefined, ...plasticDefaults("ansatz", rule) });
      },
      lochblech: () => app.addFeature({ type: "lochblech", faces: [], muster: "Rv", d: "5", teilung: "8", rand: "10" }),
      huelle: () => app.addFeature({ type: "huelle", bodies: [], zugabe: "0" }),
      verschieben: () => app.addFeature({ type: "verschieben", bodies: [], move: ["0", "0", "0"], axis: "Z", angle: "0" }),
      aufdicken: () => app.addFeature({ type: "aufdicken", faces: [], thickness: "5", side: "aussen", op: "new" }),
      flaeche: () => app.addFeature({ type: "flaeche", faces: [], distance: "5" }),
      direkt: () => startDirekt(app),
      entformung: () => app.addFeature({ type: "entformung", faces: [], angle: "3", plane: "XY", offset: "0" }),
      datumPlane: () => startDatumPick(app, "arbeitsebene"),
      datumAxis: () => startDatumPick(app, "arbeitsachse"),
      datumPoint: () => startDatumPick(app, "arbeitspunkt"),
      importStep: () => app.files.importStepIntoPart(),
      punktwolke: () => app.files.importPointCloud(),
      params: () => app.props.paramsDialog(),
      // Skizze
      finishSketch: () => app.finishSketch(),
      // Baugruppe
      place: () => app.props.placeComponentDialog(),
      asmPattern: () => app.props.newAsmPattern(),
      steckAsm: () => app.props.newSteckverbindung(),
      achsraster: () => newGrid(app),
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
  /** »In Blech umwandeln« (FU19): gewählter (sonst letzter) Volumenkörper wird ein Blechkasten mit seinen Außenmaßen */
  convertToSheet() {
    const app = this.app, part = app.activeDoc();
    const bodies = (app.results.get(part.id)?.bodies || []).filter((b) => b.kind === "solid" && !b.meta?.sheet && b.fid);
    const sel = app.sel?.type === "feature" ? app.sel.id : null;
    const from = bodies.some((b) => b.fid === sel) ? sel : bodies.at(-1)?.fid;
    if (!from) return toast("Zuerst einen quaderförmigen Körper modellieren (z. B. Rechteck extrudieren)");
    const { L, B, H, pos, ...rest } = defaultBlechkasten();
    app.addFeature({ ...rest, from, name: `Blech aus ${app.feature(from)?.name || "Körper"}` });
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
    // Aufklappknopf (P12, wie Inventor-Dropdown): seltene Befehle einer Gruppe hinter »Weitere«
    const FFB = (id, label) => B(id, label, "surface"); // Flächenmodellierung: Einträge aus FF_ARTEN
    const M = (id, label, ic, items) => ({ id, label: label + " ▾", icon: ic, menu: items, run: (e) => { const r = e.currentTarget.getBoundingClientRect(); contextMenu(r.left, r.bottom, items.map((b) => ({ label: b.label, icon: b.icon, run: b.run }))); } });
    const T = (tool, label, ic, extra = {}) => ({ id: "t_" + tool, label, icon: ic, on: sk.tool === tool, run: () => sk.setTool(tool), ...extra });
    // Werkstattmodus (Q9): nur ein Reiter mit großen Knöpfen zum Ansehen, Messen und für Listen
    if (app.workshop && (mode === "part" || mode === "assembly" || mode === "drawing")) {
      const end = { label: "Ende", buttons: [B("ws_end", "Werkstattmodus beenden", "cancel", { run: () => app.setWorkshop(false) })] };
      if (mode === "drawing") return [{ id: "werkstatt", label: "Werkstatt", groups: [
        { label: "Blatt", buttons: [B("ws_fitSheet", "Ganzes Blatt", "fit", { run: () => app.drawing.fitSheet() }), B("ws_model", "Zum Modell", "part", { disabled: !app.drawing.doc?.source, run: () => app.openDoc(app.drawing.doc.source.id) })] }, end] }];
      return [{ id: "werkstatt", label: "Werkstatt", groups: [
        { label: "Ansicht", buttons: [
          B("v_iso", "Iso", "viewIso", { run: () => app.viewer.setView("iso") }),
          B("v_front", "Vorne", "viewFront", { run: () => app.viewer.setView("front") }),
          B("v_top", "Oben", "viewTop", { run: () => app.viewer.setView("top") }),
          B("v_right", "Rechts", "viewRight", { run: () => app.viewer.setView("right") }),
          B("v_fit", "Alles zeigen", "fit", { run: () => app.viewer.fit() })] },
        { label: "Prüfen", buttons: [B("measure", "Messen", "measure", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() }),
          ...["X", "Y", "Z"].map((a) => B("clip_" + a, "Schnitt " + a, "cut", { on: app.viewer.clip?.axis === a, run: () => app.toggleClip(a) }))] },
        { label: "Listen", buttons: [B("cutlist", "Zuschnittliste", "cutlist", { run: () => app.props.cutListDialog() }),
          ...(mode === "assembly" ? [B("bom", "Stückliste", "bom", { run: () => app.props.bomDialog() })] : []),
          B("ws_fstand", "Fertigungsstand", "bom", { run: () => app.files.fertigungsstandDialog() })] },
        { label: "Zeichnung", buttons: [B("w_side", "Zeichnung daneben", "drawing", { on: !!app.side?.on, run: () => app.side.toggle() })] },
        end] }];
    }
    const view = {
      id: "ansicht", label: "Ansicht", groups: [
        { label: "Ausrichtung", small: true, buttons: [
          B("v_iso", "Iso", "viewIso", { run: () => app.viewer.setView("iso") }),
          B("v_front", "Vorne", "viewFront", { run: () => app.viewer.setView("front") }),
          B("v_back", "Hinten", "viewBack", { run: () => app.viewer.setView("back") }),
          B("v_left", "Links", "viewLeft", { run: () => app.viewer.setView("left") }),
          B("v_right", "Rechts", "viewRight", { run: () => app.viewer.setView("right") }),
          B("v_top", "Oben", "viewTop", { run: () => app.viewer.setView("top") }),
          B("v_bottom", "Unten", "viewBottom", { run: () => app.viewer.setView("bottom") }),
          B("v_normal", "Normal zur Fläche", "plane", { run: () => app.viewNormalToFace() }),
        ] },
        { label: "Zoom", buttons: [
          B("v_fit", "Alles zeigen", "fit", { run: () => app.viewer.fit() }),
          B("v_fitsel", "Auswahl zeigen", "fit", { run: () => app.zoomToSelection() }),
        ] },
        { label: "Benannt", buttons: [
          B("v_save", "Ansicht speichern", "viewSave", { disabled: !app.namedViewsDoc?.(), run: () => app.saveNamedView() }),
          B("v_named", "Ansichten", "list", { disabled: !app.namedViewsDoc?.(), run: (e) => app.namedViewsMenu(e) }),
        ] },
        { label: "Projektion", buttons: [
          B("v_ortho", "Orthogonal", "ortho", { on: !app.viewer.perspective, run: () => app.prefs.set("ansicht.projektion", "orthogonal") }),
          B("v_persp", "Perspektive", "persp", { on: app.viewer.perspective, run: () => app.prefs.set("ansicht.projektion", "perspektive") }),
        ] },
        { label: "Modus", small: true, buttons: [...DISPLAY.map((d) => B("dm_" + d.value, d.label, d.value === "draht" ? "grid" : d.value === "foto" ? "camera" : "eye", { on: app.viewer.displayMode === d.value, run: () => app.prefs.set("ansicht.darstellung", d.value) })),
          B("compColors", "Bauteilfarben", "steel", { on: !!app.compColors, disabled: app.mode !== "assembly", run: () => app.toggleCompColors() })] },
        { label: "Auswahl", small: true, buttons: [
          B("sf_alles", "Alles wählbar", "selAll", { on: app.selFilter === "alles", run: () => app.setSelFilter("alles") }),
          B("sf_flaechen", "Nur Flächen", "plane", { on: app.selFilter === "flaechen", run: () => app.setSelFilter("flaechen") }),
          B("sf_kanten", "Nur Kanten", "line", { on: app.selFilter === "kanten", run: () => app.setSelFilter("kanten") }),
          B("sel_all", "Alle wählen", "selAll", { disabled: app.mode !== "part", run: () => app.selectEverything() }),
          B("sel_inv", "Umkehren", "selInvert", { disabled: app.mode !== "part", run: () => app.invertSelection() }),
        ] },
        { label: "Fenster", small: true, buttons: (() => {
          const L = app.prefs.get("oberflaeche.layout") || DEFAULT_LAYOUT, set = (v) => app.prefs.set("oberflaeche.layout", v);
          return [
            B("w_browser", "Modellbrowser", "eye", { on: !L.hide.includes("browser"), run: () => set(togglePanel(L, "browser")) }),
            B("w_props", "Eigenschaften", "eye", { on: !L.hide.includes("props"), run: () => set(togglePanel(L, "props")) }),
            B("w_reset", "Anordnung zurücksetzen", "layout", { disabled: JSON.stringify(L) === JSON.stringify(DEFAULT_LAYOUT), run: () => app.prefs.reset(["oberflaeche.layout"]) }),
            B("w_bside", "Browser rechts", "layout", { on: L.browser === "right", run: () => set(movePanel(L, "browser", L.browser === "right" ? "left" : "right")) }),
            B("w_pside", "Eigenschaften links", "layout", { on: L.props === "left", run: () => set(movePanel(L, "props", L.props === "left" ? "right" : "left")) }),
            B("w_side", "Zeichnung daneben", "drawing", { on: !!app.side?.on, disabled: app.mode !== "part" && app.mode !== "assembly", run: () => app.side.toggle() }),
            B("w_werkstatt", "Werkstattmodus", "eye", { on: !!app.workshop, run: () => app.setWorkshop() }),
            B("w_space", "Arbeitsbereich ▾", "layout", { run: (e) => workspaceMenu(app, e) }),
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
    // Aufbau wie Inventor: je Gruppe die wichtigsten Befehle groß (big = Anzahl), die übrigen klein in Spalten zu je 3;
    // Metallbau (Profile, Blech, Anschluss, Generatoren, Stahlbau) als eigene Karte wie Inventors Konstruktion-Karte
    if (mode === "part") {
      return [
        { id: "modell", label: "3D-Modell", groups: [
          { label: "Skizze", buttons: [B("sketch", "Skizze erstellen", "sketch"), B("skizze3d", "3D-Skizze", "path3d")], big: 1 },
          { label: "Erstellen", big: 2, buttons: [B("extrude", "Extrusion", "extrude"), B("revolve", "Drehung", "revolve"), B("sweep", "Sweeping", "sweep"), B("loft", "Erhebung", "loft"), B("spirale", "Spirale", "coil"), B("cutExtrude", "Ausschnitt", "cut"), B("emboss", "Prägen", "emboss"), B("regelkoerper", "Regelkörper", "regelkoerper")] },
          { label: "Ändern", big: 2, buttons: [B("hole", "Bohrung", "hole"), B("fillet", "Rundung", "fillet"), B("chamfer", "Fase", "chamfer"), B("shell", "Wandung", "shell"), B("langloch", "Langloch", "slot")] },
          { label: "Körper", small: true, buttons: [B("kombinieren", "Kombinieren", "combine", { iconOnly: true }), B("stecksystem", "Stecksystem", "tabslot", { iconOnly: true }), B("trennen", "Trennen", "split", { iconOnly: true }), B("verschieben", "Verschieben", "move", { iconOnly: true }), B("huelle", "Hüllkörper", "hull", { iconOnly: true }), B("aufdicken", "Aufdicken", "thicken", { iconOnly: true }), B("kunststoff", "Kunststoffteil", "plastic", { iconOnly: true }), B("flaeche", "Fläche verschieben", "pushpull", { iconOnly: true }), B("entformung", "Entformung", "draft", { iconOnly: true }), B("direkt", "Direkt", "direct", { iconOnly: true }), { ...M("ffMenu", "Flächen", "surface", [...FF_ARTEN.map((a) => FFB("ff_" + a.art, a.label)), B("flaechenkurve", "Kurve auf Fläche", "path3d"), B("auflage", "Auflagefläche (3D-Druck)", "facepick")]), iconOnly: true }] },
          { label: "Muster", small: true, buttons: [B("patternLin", "Rechteckig", "pattern"), B("patternCirc", "Kreisförmig", "circpattern"), B("patternPath", "Entlang Pfad", "pathpattern"), B("mirror", "Spiegeln", "mirror")] },
          { label: "Arbeitselemente", small: true, buttons: [B("datumPlane", "Arbeitsebene", "plane"), B("datumAxis", "Arbeitsachse", "axis"), B("datumPoint", "Arbeitspunkt", "point")] },
          { label: "Prüfen", big: 1, buttons: [B("measure", "Messen", "measure", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() }), B("problems", "Problemliste", "warn", { iconOnly: true, run: () => problemsDialog(app) }), B("draftAnalysis", "Entformungsanalyse", "draftan", { iconOnly: true, on: !!app.viewer.draftOn, run: () => draftDialog(app) }), B("regionPropsPart", "Bereichseigenschaften", "area", { iconOnly: true, run: () => regionDialog(app) }), { ...M("scMenu", "Flächen prüfen", "eye", [...SURFACE_CHECKS.map(([k, l]) => B(`sc_${k}`, l, "eye", { on: app.surfaceCheck?.mode === k, run: () => surfaceCheckDialog(app, k) })), B("compareBodies", "Körper vergleichen", "combine", { run: () => compareBodiesDialog(app) })]), iconOnly: true, on: !!app.surfaceCheck }] },
          { label: "Zeichnung", buttons: [B("newDrawing", "Zeichnung ableiten", "drawing")] },
        ] },
        { id: "metallbau", label: "Metallbau", groups: [
          { label: "Profile", big: 5, buttons: [B("profile", "Rohr / Profil", "profile"), B("frame", "Rahmen aus Skizze", "frame"), B("profilzug", "Profilzug 3D", "profilzug"), B("biegerohr", "Rohr gebogen", "biegerohr"), B("knickrahmen", "Knickrahmen", "knick"), B("gestellInsert", "Gestell einfügen", "frame"), B("endkappe", "Endkappe", "endcap"), B("kuerzen", "Kürzen/Verlängern", "extend"), B("zinkloch", "Verzinkungsbohrungen", "ventholes"), B("strecken", "Rohr strecken", "stretch")] },
          { label: "Blech", big: 1, buttons: [B("kantteil", "Kantteil", "kantteil"), B("konturlasche", "Konturlasche", "contourflange"), B("blechkasten", "Blechkasten", "kantteil"), B("inBlech", "In Blech umwandeln", "kantteil"), B("lasche", "Lasche", "flange"), B("umschlag", "Umschlag", "hem"), B("durchzug", "Durchzug", "collar"), B("eckeschliessen", "Ecke schließen", "cornerseam"), B("stanzung", "Stanzwerkzeug", "punch"), B("lochblech", "Lochblech", "perforate"), B("kroepfung", "Kröpfung", "jog"), B("konturwalzen", "Konturwalzen", "contourroll"), B("trennfuge", "Trennfuge", "rip"), B("falten", "Falten", "fold", { iconOnly: true })] },
          { label: "Anschluss", buttons: [B("naht", "Schweißnaht", "naht"), B("platte", "Stirn-/Fußplatte", "platte"), B("rippe", "Rippe", "rippe"), B("normteil", "Normteil", "normteil")] },
        ] },
        { id: "verwalten", label: "Verwalten", groups: [
          { label: "Parameter", buttons: [B("params", "Parameter", "params"), B("variants", "Variantentabelle", "table")] },
          { label: "Bibliothek", buttons: [B("libSave", "In Bibliothek ablegen", "save", { run: () => saveToLibrary(app) }), B("libBrowse", "Teilebibliothek", "open", { run: () => libraryDialog(app) })] },
          { label: "Einfügen", buttons: [B("importStep", "Importieren", "import"), B("abgeleitet", "Abgeleitetes Bauteil", "derive"), B("punktwolke", "Punktwolke einfügen", "point", { iconOnly: true })] },
          { label: "Automatisierung", buttons: [B("rules", "Regeln", "rules"), B("macros", "Makros", "macro")] },
          { label: "iFeature", buttons: [B("ifeatExtract", "iFeature erstellen", "ifeature"), B("ifeatInsert", "iFeature einfügen", "ifeature")] },
          { label: "Aktualisieren", buttons: [B("rebuildNow", "Neu berechnen", "update", { on: !!app.stale, run: () => app.rebuildNow() }), B("problems", "Problemliste", "warn", { run: () => problemsDialog(app) })] },
        ] },
        { id: "konstruktion", label: "Konstruktion", groups: [
          { label: "Verbinden", buttons: [B("schraubverbindung", "Schraubenverbindung", "bolt")] },
          { label: "Antrieb", buttons: [B("welle", "Welle", "shaft"), B("zahnrad", "Stirnrad", "gear"), B("lager", "Lager", "bearing")] },
          { label: "Feder", buttons: [B("feder", "Druckfeder", "spring")] },
        ] },
        this.exportTab("part"),
        view,
      ];
    }
    if (mode === "sketch") {
      const C = (tool, label, ic) => T(tool, label, ic, { iconOnly: true });
      return [
        { id: "skizze", label: "Skizze", context: true, groups: [
          { label: "Erstellen", big: 3, buttons: [
            T("line", "Linie", "line"), T("circle", "Kreis", "circle"), T("rect", "Rechteck", "rect"), T("arc3", "Bogen", "arc"),
            T("rectc", "Rechteck Mitte", "rectc"), T("arcc", "Bogen Mitte", "arcc"), T("spline", "Spline", "spline"),
            T("ellipse", "Ellipse", "ellipse"), T("slot", "Langloch", "slot"), T("polygon", "Polygon", "polygon"),
            T("sfillet", "Rundung", "fillet"), T("point", "Punkt", "point"),
            C("schamfer", "Fase", "chamfer"), C("circle3", "Kreis durch 3 Punkte", "circle3"), C("rect3", "Rechteck über 3 Punkte", "rect3"), C("circlet3", "Kreis tangential an 3 Linien", "circlet3"), C("arct", "Tangentialer Bogen", "arct"),
            // SolidCraft-Abgleich: weitere Formen und Hilfslinien als Aufklappmenüs (Skizzen-Band bleibt so breit wie vorher)
            { ...M("skMore", "Weitere Formen", "rect", [T("rectr", "Abgerundetes Rechteck", "rect"), T("linem", "Linie aus Mitte", "line"), T("circle2", "Kreis über 2 Punkte", "circle"), T("slota", "Bogenlangloch", "slot"), T("slota3", "Bogenlangloch über 3 Punkte", "slot"), T("circlet2", "Kreis an zwei Linien", "circle"), T("polyedge", "Polygon über Kante", "polygon"), T("polyc", "Polygon umschrieben", "polygon"), T("blend", "Übergangskurve", "spline"), T("splinefit", "Spline durch Punkte", "spline"), T("spline5", "Spline Grad 5", "spline"), T("spins", "Splinepunkt einfügen", "spline"), T("sprem", "Splinepunkt entfernen", "spline"), B("skSplRev", "Spline umkehren", "spline", { run: () => sk.reverseSelectedSplines() }), B("skBounds", "Zeichnungsrahmen …", "rect", { run: () => sk.drawingBoundsDialog() }), T("conic", "Kegelschnitt", "spline"), B("skEquation", "Gleichungskurve …", "spline", { run: () => sk.equationDialog() }), B("skSvg", "SVG importieren …", "import", { run: () => sk.importSvgDialog() }), B("skTrace", "Bild nachzeichnen …", "import", { run: () => sk.traceImage() })]), iconOnly: true },
            { ...M("skHelp", "Hilfslinien", "construct", [T("clh", "Hilfslinie waagrecht", "horizontal"), T("clv", "Hilfslinie senkrecht", "vertical"), T("cla", "Hilfslinie unter Winkel", "angle"), T("clpar", "Hilfslinie parallel", "parallel"), T("clperp", "Hilfslinie senkrecht zu Linie", "perpendicular"), T("clbis", "Winkelhalbierende", "angle"), T("cltan", "Tangente durch Punkt", "tangent"), T("tanat", "Tangente an Kurvenpunkt", "tangent"), T("ctan2", "Gemeinsame Tangente", "tangent")]), iconOnly: true },
          ] },
          // Symbolspalte: spart Breite, damit die Skizze neben der Arbeitsbereich-Kachel in 1600 px passt
          { label: "Übernehmen", small: true, buttons: [C("project", "Kante projizieren", "project"), B("sdxf", "DXF importieren", "import", { iconOnly: true, run: () => sk.importDxfDialog() }), C("image", "Bild", "import"), B("skSection", "Schnittkurve", "cut", { iconOnly: true, run: () => sk.sectionCurve() }), B("skMeshSection", "Netzquerschnitt", "cut", { iconOnly: true, run: () => sk.meshSection() }), B("skSpun", "Gedrehtes Profil (um gewählte Linie)", "revolve", { iconOnly: true, run: () => sk.spunProfileCmd() })] },
          { label: "Ändern", small: true, buttons: [
            T("smove", "Verschieben", "move"), T("scopy", "Kopieren", "copy"), T("srotate", "Drehen", "rotate"),
            T("trim", "Stutzen", "trim"), T("extend", "Verlängern", "extend"), T("split", "Teilen", "split"),
            C("sscale", "Skalieren", "scale"), C("offset", "Versatz", "offset"), B("sclean", "Säubern", "clean", { iconOnly: true, run: () => sk.cleanDialog() }), B("skOffBreak", "Versatz lösen", "offset", { iconOnly: true, run: () => sk.breakSelectedOffset() }),
            // Muster als Symbolspalte im selben Abschnitt (spart eine Gruppe, damit die Skizze in 1600 px passt)
            C("pattern", "Rechteckmuster", "pattern"), C("cpattern", "Kreismuster", "circpattern"), C("mirror", "Spiegeln", "mirror"),
            C("scorner", "Ecke (zwei Linien verbinden)", "extend"),
          ] },
          { label: "Bemaßung", big: 1, buttons: [T("dimension", "Bemaßung", "dimension"), B("autodim", "Voll bemaßen", "dimension", { run: () => sk.autoDimensionDialog() }), B("params", "Parameter", "params"), T("text", "Text", "text")] },
          { label: "Abhängigkeiten", small: true, buttons: [
            C("coincident", "Koinzident", "coincident"), C("collinear", "Kollinear", "collinear"), C("concentric", "Konzentrisch", "concentric"),
            C("fix", "Fixieren", "fix"), C("parallel", "Parallel", "parallel"), C("perpendicular", "Senkrecht", "perpendicular"),
            C("horizontal", "Horizontal", "horizontal"), C("vertical", "Vertikal", "vertical"), C("tangent", "Tangential", "tangent"),
            C("midpoint", "Mittelpunkt", "midpoint"), C("symmetric", "Symmetrisch", "symmetric"), C("equal", "Gleich", "equal"),
          ] },
          { label: "Format", small: true, buttons: [
            B("constr", "Konstruktion", "construct", { iconOnly: true, on: !!sk.construction, run: () => sk.toggleConstruction() }),
            B("glyphs", "Symbole", "eye", { iconOnly: true, on: sk.showGlyphs, run: () => { sk.showGlyphs = !sk.showGlyphs; sk.render(); this.render(); } }),
            B("gridsnap", "Rasterfang", "grid", { iconOnly: true, on: sk.gridSnap, run: () => { sk.gridSnap = !sk.gridSnap; sk.render(); this.render(); } }),
            // Prüfen in derselben Gruppe (eine Gruppe weniger, damit die Skizze auch mit breiterer Schrift in 1600 px passt)
            B("regionProps", "Bereichseigenschaften", "area", { iconOnly: true, run: () => regionDialog(app) }), B("sdof", "Freiheitsgrade anzeigen", "dof", { iconOnly: true, on: !!sk.showDof, run: () => app.commands.exec("sketch.dof") }),
          ] },
          { label: "Beenden", buttons: [B("finishSketch", "Skizze fertig", "finish", { finish: true })] },
        ] },
        view,
      ];
    }
    if (mode === "assembly") {
      const asm = app.activeDoc();
      return [
        { id: "baugruppe", label: "Zusammenfügen", groups: [
          { label: "Komponente", big: 2, buttons: [B("place", "Platzieren", "place"), B("newPartInAsm", "Neues Bauteil", "part", { run: () => app.props.newPartForAssembly() }), B("normteilAsm", "Normteil", "normteil"), B("linkPart", "Aus Datei", "open", { run: () => app.files.linkPartFromFile() }), B("asmPattern", "Muster", "pattern"), B("steckAsm", "Stecksystem", "tabslot"), B("asmMirror", "Spiegeln", "mirror", { run: () => app.props.mirrorComponent() }), B("replaceComp", "Ersetzen", "update", { run: () => app.commands.exec("asm.replace") }), B("copyDesign", "Kopie konstruieren", "copy", { iconOnly: true, run: () => app.commands.exec("asm.copyDesign") }), B("formSub", "Unterbaugruppe bilden", "assembly", { iconOnly: true, run: () => formSubDialog(app) })] },
          { label: "Position", small: true, buttons: [B("cmove", "Verschieben", "move", { run: () => app.props.moveComponentDialog("move") }), B("crotate", "Drehen", "rotate", { run: () => app.props.moveComponentDialog("rotate") }), B("ccopy", "Kopieren", "copy", { run: () => app.props.copySelectedComponent() })] },
          { label: "Beziehungen", big: 2, buttons: [B("constraint", "Abhängigkeit", "align", { on: app.pick?.kind === "align" && !!app.align?.type }), B("joint", "Drehgelenk", "hinge", { run: () => app.props.jointDialog() }), B("align", "Fläche an Fläche", "align", { iconOnly: true, on: app.pick?.kind === "align" && app.align?.mode === "gegen" }), B("alignFlush", "Bündig", "flush", { iconOnly: true, on: app.pick?.kind === "align" && app.align?.mode === "buendig" }), B("alignConc", "Konzentrisch", "concentric", { iconOnly: true, on: app.pick?.kind === "align" && app.align?.mode === "konzentrisch" }), B("alignInsert", "Einfügen", "insert", { iconOnly: true, on: app.pick?.kind === "align" && app.align?.mode === "einfuegen" }), B("alignAngle", "Winkel", "angle", { iconOnly: true, on: app.pick?.kind === "align" && app.align?.mode === "winkel" }), B("alignTangent", "Tangential", "tangent", { iconOnly: true, on: app.pick?.kind === "align" && app.align?.mode === "tangential" }), B("jointCyl", "Zylindergelenk", "cylJoint", { iconOnly: true, run: () => app.props.jointDialog(null, "zylinder") }), B("jointPick", "Gelenk an Achse wählen", "hinge", { iconOnly: true, on: app.pick?.kind === "custom", run: () => jointPick(app) })] },
          { label: "Verwalten", big: 1, buttons: [B("bom", "Stückliste", "bom"), B("weldment", "Schweißbaugruppe", "weldasm", { run: () => app.props.makeWeldment() }), B("cutlist", "Zuschnittliste", "cutlist", { run: () => app.props.cutListDialog() }), B("asmParams", "Parameter", "params", { run: () => app.props.paramsDialog() }), B("showComps", "Alle einblenden", "eye", { disabled: !asm?.components?.some((c) => c.hidden), run: () => app.props.showAllComponents() }), B("libInsert", "Aus Bibliothek", "open", { run: () => libraryDialog(app) }), B("libSaveAsm", "In Bibliothek ablegen", "save", { run: () => saveToLibrary(app) })] },
          { label: "Bewegung", small: true, buttons: [B("animate", "Bewegen", "motion", { run: () => app.props.animateJoints() }), B("explode", "Explosion", "explode", { on: app.viewer.explode > 0 || !!app.explodeSteps, run: () => app.props.explodeDialog() }), B("positions", "Positionen", "save", { run: () => app.commands.exec("asm.positionSave") }), B("contactSolver", "Kontaktlöser", "contact", { on: !!app.activeDoc()?.contactSolver, run: () => app.props.toggleContactSolver() }), B("contactSet", "Kontaktsatz", "contact", { run: () => app.props.toggleContactSet() }), B("motionVideo", "Video", "video", { run: () => app.props.recordMotion() })] },
          { label: "Zeichnung", small: true, buttons: [B("newDrawing", "Zeichnung ableiten", "drawing"), B("partDrawings", "Einzelteile", "drawing", { run: () => app.partDrawings(app.activeId) }), B("drawingSet", "Zeichnungssatz", "drawing", { run: () => app.drawingSet(app.activeId) })] },
        ] },
        { id: "pruefen", label: "Prüfen", groups: [
          { label: "Prüfen", buttons: [B("measure", "Messen", "measure", { on: app.pick?.kind === "measure", run: () => app.beginMeasure() }), B("collide", "Kollision prüfen", "info", { run: () => app.props.collisionDialog() }), B("problems", "Problemliste", "warn", { run: () => problemsDialog(app) })] },
        ] },
        { id: "metallbau", label: "Metallbau", groups: [
          { label: "Generatoren", big: 4, buttons: [B("gelaender", "Geländer", "gelaender"), B("treppe", "Treppe", "treppe"), B("balkon", "Balkon", "balkon"), B("tor", "Tor", "tor"), B("spindel", "Spindeltreppe", "spindel"), B("schiebetor", "Schiebetor", "schiebetor"), B("zaun", "Zaun", "zaun"), B("vordach", "Vordach / Carport", "vordach"), B("fenstergitter", "Fenstergitter", "fenstergitter"),
            M("genMore", "Weitere", "plus", [B("klemmgelaender", "Klemmgeländer", "klemmgelaender"), B("rampe", "Rampe / Laufsteg", "rampe"), B("zarge", "Stahlzarge", "zarge"), B("pergola", "Pergola", "pergola")])] },
          { label: "Stahlbau", small: true, buttons: [B("achsraster", "Achsraster", "achsraster"), B("rahmenecke", "Rahmenecke", "rahmenecke"), B("stuetzenfuss", "Stützenfuß", "stuetzenfuss"), B("pfette", "Pfette", "pfette"), B("windverband", "Windverband", "windverband"), B("arbeitsbuehne", "Arbeitsbühne", "arbeitsbuehne"),
            M("stahlMore", "Weitere", "plus", [B("voute", "Voutenträger", "voute"), B("traegerstoss", "Trägerstoß", "traegerstoss"), B("traegeranschluss", "Trägeranschluss", "traegeranschluss"), B("steigleiter", "Steigleiter", "steigleiter"), B("fachwerk", "Fachwerkträger", "fachwerk")])] },
          { label: "Gestell", big: 1, buttons: (() => {
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
            B("dv_base", "Grundansichten", "baseViews", { run: () => dr.autoViews() }),
            B("dv_add", "Ansicht hinzufügen", "plus", { run: () => dr.addViewDialog() }),
            B("dv_proj", "Projiziert", "projView", { on: dr.tool === "proj", run: () => (dr.tool === "proj" ? dr.setTool(null) : dr.startProjected()) }),
            B("dv_sec", "Schnitt", "cut", { run: () => dr.addSectionDialog() }),
            B("dv_hsec", "Schnitt Hohlprofil", "cut", { run: () => dr.hollowSection() }),
            B("dv_det", "Detail", "detail", { on: dr.tool === "detail", run: () => (dr.tool === "detail" ? dr.setTool(null) : dr.startDetail()) }),
            B("dv_aux", "Hilfsansicht", "auxView", { on: dr.tool === "aux", run: () => (dr.tool === "aux" ? dr.setTool(null) : dr.startAux()) }),
            B("dv_flat", "Abwicklung", "kantteil", { run: () => dr.addFlatView() }),
            B("dv_break", "Bruch", "cut", { run: () => dr.breakDialog() }),
            B("dv_bo", "Ausbruch", "cut", { on: dr.tool === "breakout", run: () => (dr.tool === "breakout" ? dr.setTool(null) : dr.startBreakout()) }),
          ] },
          { label: "Beschriften", buttons: [
            B("dd_dim", "Bemaßung", "dimension", { on: dr.tool === "dim", run: () => dr.setTool(dr.tool === "dim" ? null : "dim") }),
            B("dd_chain", "Kettenmaß", "dimension", { on: dr.tool === "chain", run: () => dr.setTool(dr.tool === "chain" ? null : "chain") }),
            B("dd_base", "Bezugsmaß", "dimension", { on: dr.tool === "base", run: () => dr.setTool(dr.tool === "base" ? null : "base") }),
            B("dd_arclen", "Bogenlänge", "arc", { on: dr.tool === "arclen", run: () => dr.setTool(dr.tool === "arclen" ? null : "arclen") }),
            B("dd_center", "Mittelpunkt", "circle", { on: dr.tool === "center", run: () => dr.setTool(dr.tool === "center" ? null : "center") }),
            B("dd_angle", "Winkel", "dimension", { on: dr.tool === "angle", run: () => dr.setTool(dr.tool === "angle" ? null : "angle") }),
            B("dd_align", "Maße ausrichten", "align", { run: () => dr.alignDims() }),
            B("dd_clean", "Aufräumen", "align", { run: () => dr.cleanup() }),
            B("dd_auto", "Hauptmaße", "dimension", { run: () => dr.autoDims() }),
            B("dd_text", "Text", "text", { on: dr.tool === "text", run: () => dr.setTool(dr.tool === "text" ? null : "text") }),
            B("dd_leader", "Hinweis", "text", { on: dr.tool === "leader", run: () => dr.setTool(dr.tool === "leader" ? null : "leader") }),
            B("dd_holes", "Bohrungstabelle", "bom", { run: () => dr.addHoleTable() }),
            B("dd_surf", "Oberfläche", "dimension", { on: dr.tool === "surface", run: () => dr.setTool(dr.tool === "surface" ? null : "surface") }),
            B("dd_gdt", "Form/Lage", "dimension", { on: dr.tool === "gdt", run: () => dr.setTool(dr.tool === "gdt" ? null : "gdt") }),
            B("dd_datum", "Bezug", "dimension", { on: dr.tool === "datum", run: () => dr.setTool(dr.tool === "datum" ? null : "datum") }),
            B("dd_weld", "Schweißnähte", "naht", { run: () => dr.autoWelds() }),
            B("dd_rev", "Änderung", "text", { run: () => dr.addRevisionDialog() }),
            B("dd_compare", "Vergleichen", "text", { run: () => dr.compareDialog() }),
          ] },
          { label: "Baugruppe", buttons: [
            B("dd_pos", "Pos.-Nummern", "circle", { run: () => dr.autoBalloons() }),
            B("dd_posnum", "Neu nummerieren", "circle", { disabled: !dr.doc?.balloons?.length, run: () => dr.renumberBalloons() }),
            B("dd_posalign", "Pos. ausrichten", "align", { disabled: !dr.doc?.balloons?.length, run: () => dr.alignBalloonRows() }),
            B("dd_bom", "Stückliste", "bom", { on: !!dr.doc?.bomTable?.show, run: () => dr.toggleBomTable() }),
          ] },
          { label: "Blatt", buttons: [B("dd_fit", "Blatt einpassen", "fit", { run: () => dr.fitSheet() }), B("dd_sheet", "Neues Blatt", "plus", { run: () => dr.newSheet() }), B("dd_tpl", "Vorlage", "settings", { run: () => dr.templateDialog() })] },
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
    const f = app.files, P = plaene;
    const B = (id, label, ic, run) => ({ id, label, icon: ic, run });
    const groups = [];
    if (kind === "part") {
      groups.push({ label: "3D", buttons: [B("x_step", "STEP", "export", () => f.exportStep()), B("x_steplist", "STEP + Zuschnittliste", "export", () => f.exportStepWithList()), B("x_iges", "IGES", "export", () => f.exportIges()), B("x_ifc", "IFC (BIM)", "export", () => f.exportIfc()), B("x_stl", "STL", "export", () => f.exportStl()), B("x_glb", "GLB", "export", () => f.exportGlb()), B("x_obj", "OBJ", "export", () => f.exportObj()), B("x_3mf", "3MF (3D-Druck)", "export", () => f.export3mf()), B("x_slicer", "An Slicer senden", "export", () => f.sendToSlicer()), B("x_vereinfachen", "Vereinfachen", "simplify", () => f.simplifyDialog()), B("x_png", "Bild (PNG)", "camera", () => f.exportPng()), B("x_render", "Rendern", "camera", () => f.exportPng({ photo: true }))] });
      groups.push({ label: "Profile", buttons: [B("x_members", "Profile einzeln (STEP)", "profile", () => f.exportMembers()), B("x_cut", "Zuschnittliste (CSV)", "cutlist", () => f.exportCutList()), B("x_weld", "Nahtliste (CSV)", "naht", () => f.exportWeldList()), B("x_xlsx", "Listen (Excel)", "bom", () => f.exportListsXlsx())] });
      groups.push({ label: "2D", buttons: [B("x_plate", "Platte als DXF", "drawing", () => f.exportPlateDxf()), B("x_dxf", "Skizze als DXF", "sketch", () => f.exportSketchDxf())] });
      groups.push({ label: "Montage", buttons: [B("x_anker", "Ankerplan", "anchorplan", () => P.exportAnkerplan(app)), B("x_anschlag", "Anschlagpunkte", "hook", () => P.anschlagDialog(app)), B("x_statik", "Statik Geländer", "measure", () => f.statikDialog())] });
      groups.push({ label: "Werkstatt", buttons: [B("x_mappe", "Fertigungsmappe", "pdf", () => f.exportMappe()), B("x_angebot", "Angebotsblatt", "pdf", () => f.exportAngebot()), B("x_kalk", "Kalkulation", "bom", () => app.props.calcDialog()), B("x_etiketten", "Etiketten (QR)", "qr", () => f.exportEtiketten()), B("x_versand", "Versandliste", "bom", () => f.exportVersand()), B("x_laufzettel", "Laufzettel", "qr", () => f.exportLaufzettel()), B("x_fstand", "Fertigungsstand", "bom", () => f.fertigungsstandDialog()), B("x_restlager", "Restlager", "cutlist", () => app.props.restlagerDialog()), B("x_bestell", "Bestellliste", "bom", () => f.exportBestellliste()), B("x_schweissplan", "Schweißplan", "naht", () => f.weldPlanDialog()), B("x_dstv", "DSTV-NC (Stahlbau)", "profile", () => f.exportDstv()), B("x_einzelteile", "Einzelteile", "bom", () => f.piecesDialog())] });
    } else if (kind === "assembly") {
      groups.push({ label: "3D", buttons: [B("x_step", "STEP", "export", () => f.exportStep()), B("x_steplist", "STEP + Zuschnittliste", "export", () => f.exportStepWithList()), B("x_iges", "IGES", "export", () => f.exportIges()), B("x_ifc", "IFC (BIM)", "export", () => f.exportIfc()), B("x_stl", "STL", "export", () => f.exportStl()), B("x_glb", "GLB", "export", () => f.exportGlb()), B("x_obj", "OBJ", "export", () => f.exportObj()), B("x_3mf", "3MF (3D-Druck)", "export", () => f.export3mf()), B("x_slicer", "An Slicer senden", "export", () => f.sendToSlicer()), B("x_urdf", "URDF (ROS)", "export", () => f.exportUrdf()), B("x_vereinfachen", "Vereinfachen", "simplify", () => f.simplifyDialog()), B("x_png", "Bild (PNG)", "camera", () => f.exportPng()), B("x_render", "Rendern", "camera", () => f.exportPng({ photo: true }))] });
      groups.push({ label: "Profile", buttons: [B("x_members", "Profile einzeln (STEP)", "profile", () => f.exportMembers())] });
      groups.push({ label: "Montage", buttons: [B("x_anker", "Ankerplan", "anchorplan", () => P.exportAnkerplan(app)), B("x_montage", "Montageplan", "pdf", () => P.exportMontageplan(app)), B("x_ladeliste", "Ladeliste", "bom", () => f.exportLadeliste()), B("x_einbau", "Einbauorte (Handy)", "qr", () => f.exportEinbauorte()), B("x_anschlag", "Anschlagpunkte", "hook", () => P.anschlagDialog(app)), B("x_statik", "Statik Geländer", "measure", () => f.statikDialog())] });
      groups.push({ label: "Listen", buttons: [B("x_bom", "Stückliste (CSV)", "bom", () => f.exportBom()), B("x_cut", "Zuschnittliste (CSV)", "cutlist", () => f.exportCutList()), B("x_weld", "Nahtliste (CSV)", "naht", () => f.exportWeldList()), B("x_xlsx", "Listen (Excel)", "bom", () => f.exportListsXlsx())] });
      groups.push({ label: "Werkstatt", buttons: [B("x_mappe", "Fertigungsmappe", "pdf", () => f.exportMappe()), B("x_angebot", "Angebotsblatt", "pdf", () => f.exportAngebot()), B("x_kalk", "Kalkulation", "bom", () => app.props.calcDialog()), B("x_etiketten", "Etiketten (QR)", "qr", () => f.exportEtiketten()), B("x_versand", "Versandliste", "bom", () => f.exportVersand()), B("x_laufzettel", "Laufzettel", "qr", () => f.exportLaufzettel()), B("x_fstand", "Fertigungsstand", "bom", () => f.fertigungsstandDialog()), B("x_restlager", "Restlager", "cutlist", () => app.props.restlagerDialog()), B("x_bestell", "Bestellliste", "bom", () => f.exportBestellliste()), B("x_schweissplan", "Schweißplan", "naht", () => f.weldPlanDialog()), B("x_dstv", "DSTV-NC (Stahlbau)", "profile", () => f.exportDstv()), B("x_einzelteile", "Einzelteile", "bom", () => f.piecesDialog())] });
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

  /** Kopfleiste (SolidCraft-Aufbau): Speichern, Rückgängig/Wiederholen, Schnellzugriff links; Projekt, Einstellungen, Hilfe rechts */
  renderAppBar() {
    const app = this.app;
    const cmds = document.getElementById("ab-cmds"), right = document.getElementById("ab-right");
    if (!cmds || !right) return;
    const ab = (ic, title, run, opts = {}) => h("button", { class: "ab-btn" + (opts.cls ? " " + opts.cls : ""), title, "aria-label": opts.label || title, disabled: !!opts.disabled, onclick: run }, typeof ic === "string" ? icon(ic) : ic);
    cmds.replaceChildren(
      ab("save", `Speichern (${this.kbd("file.save") || "Strg+S"})`, () => app.commands.exec("file.save"), { disabled: app.mode === "start" && !app.project?.docs?.length }),
      ab("undo", "Rückgängig (Strg+Z)", () => app.undo(), { disabled: !app.undoStack.length }),
      ab(h("span", {}, "▾"), "Rückgängig-Verlauf", (e) => this.undoMenu(e), { cls: "rb-undo-list", disabled: !app.undoStack.length }),
      ...[ab("redo", "Wiederholen (Strg+Y)", () => app.redo(), { disabled: !app.redoStack.length }), this.quickAccess()].filter(Boolean));
    right.replaceChildren(
      this.docLabel = h("div", { class: "rb-doc" }),
      ab("settings", `Einstellungen (${this.kbd("app.settings") || "Strg+,"})`, () => app.commands.exec("app.settings")),
      ...[ab("help", "Kurzhilfe (F1)", () => app.commands.exec("app.help")),
        window.werkcad?.version ? h("span", { class: "ab-ver" }, "v" + window.werkcad.version) : null].filter(Boolean));
    this.renderDocLabel();
  }

  render() {
    const app = this.app;
    const mode = app.mode;
    const tabs = this.tabsFor(mode);
    if (!tabs.find((t) => t.id === this.tab)) this.tab = tabs[0]?.id;
    if (mode === "sketch") this.tab = this.tab === "ansicht" ? "ansicht" : "skizze";
    const tabBar = h("div", { class: "rb-tabs" },
      h("button", { class: "rb-file", onclick: (e) => this.fileMenu(e) }, "Datei"),
      h("div", { class: "rb-tablist", role: "tablist", "aria-label": "Menüband", onkeydown: (e) => this.tabKey(e, tabs) },
        ...tabs.map((t) => h("button", { class: "rb-tab" + (t.id === this.tab ? " active" : "") + (t.context ? " context" : ""), role: "tab", "aria-selected": String(t.id === this.tab), tabindex: t.id === this.tab ? "0" : "-1", "data-tab": t.id, onclick: () => { this.tab = t.id; this.render(); } }, t_(t.label)))),
      h("div", { class: "rb-spacer" }),
      h("button", { class: "rb-search", title: `Befehl suchen (${this.kbd("app.search") || "Strg+K"})`, onclick: () => app.commands.exec("app.search") }, icon("search"), h("span", {}, "Befehl suchen"), this.kbd("app.search") ? h("span", { class: "kbd" }, this.kbd("app.search")) : null));
    this.renderAppBar();
    this.renderDocLabel();
    const tab = tabs.find((t) => t.id === this.tab);
    const panel = h("div", { class: "rb-panel", role: "tabpanel", "aria-label": t_(tabs.find((t) => t.id === this.tab)?.label || "") });
    if (tab) {
      const L = applyRibbonLayout(tab.id, tab.groups, this.app.prefs.get("werkzeuge.menueband") || {});
      for (const g of L.groups) {
        const btns = h("div", { class: "rb-buttons" });
        // groß: alle (Standard), keine (small) oder die ersten g.big; der Rest klein in Spalten zu je 3
        const nBig = g.small ? 0 : g.big ?? g.buttons.length;
        const iconsOnly = !!this.app.prefs?.get("oberflaeche.nurSymbole");
        for (const b of g.buttons.slice(0, nBig)) btns.append(h("button", { class: "rb-btn" + (b.on ? " on" : "") + (b.finish ? " rb-finish" : ""), onclick: (e) => this.press(b, e), disabled: b.disabled, ...this.tipAttrs(b) }, icon(b.icon), h("span", {}, ...breakable(t_(b.label)))));
        const rest = g.buttons.slice(nBig);
        for (let i = 0, n = iconsOnly ? 2 : 3; i < rest.length; i += n) {
          btns.append(h("div", { class: "rb-stack" }, ...rest.slice(i, i + n).map((b) =>
            h("button", { class: "rb-small" + (b.on ? " on" : "") + (b.iconOnly || iconsOnly ? " icon-only" : ""), ...this.tipAttrs(b), "aria-label": t_(b.label), onclick: (e) => this.press(b, e), disabled: b.disabled }, icon(b.icon), b.iconOnly || iconsOnly ? null : t_(b.label)))));
        }
        // Gruppenname öffnet die Gruppenliste (SolidCraft): alle Befehle mit Kürzel, Nadel heftet an den Schnellzugriff
        panel.append(h("div", { class: "rb-group", "data-group": g.label, oncontextmenu: (e) => { e.preventDefault(); this.groupMenu(e, tab, g.label); } }, btns,
          h("button", { class: "rb-group-label", "aria-haspopup": "true", title: "Alle Befehle der Gruppe", onclick: (e) => this.groupList(e, g) }, t_(g.label))));
      }
      if (L.hidden.length) panel.append(h("button", { class: "rb-hidden", title: "Ausgeblendete Gruppen: " + L.hidden.join(", "), onclick: (e) => this.hiddenMenu(e, tab, L.hidden) }, "+" + L.hidden.length));
    } else if (mode === "start") {
      panel.append(h("div", { class: "hint", style: { alignSelf: "center", padding: "0 8px" } }, "Neues Projekt anlegen oder vorhandenes öffnen."));
    }
    this.tips.hide();
    this.app.minibar?.hide();
    this.el.replaceChildren(this.workspaceTile(mode), h("div", { class: "rb-main" }, tabBar, panel));
    this.fitGroups();
  }
  /** Kachel links vom Menüband (SolidCraft »Design · Workspace«): Arbeitsumgebung und Menü der Arbeitsbereiche */
  workspaceTile(mode) {
    const M = { part: ["part", "Bauteil"], assembly: ["assembly", "Baugruppe"], sketch: ["sketch", "Skizze"], drawing: ["drawing", "Zeichnung"], start: ["home", "Start"] };
    const [ic, label] = M[mode] || ["part", "PBCAD"];
    return h("button", { class: "rb-ws", title: "Arbeitsbereich wechseln oder speichern", "aria-haspopup": "true", onclick: (e) => workspaceMenu(this.app, e) },
      icon(ic), h("span", { class: "rb-ws-name" }, label), h("span", { class: "rb-ws-sub" }, "Arbeitsbereich ⌄"));
  }
  /** Gruppenliste unter dem Gruppennamen: alle Befehle (auch aus Untermenüs) mit Symbol, Kürzel und Nadel */
  groupList(e, g) {
    e.stopPropagation();
    this.closeGroupList();
    const app = this.app;
    const btn = e.currentTarget;
    const items = [];
    for (const b of g.buttons) {
      if (b.menu?.length) { items.push({ head: b.label.replace(/\s*▾$/, "") }); for (const x of b.menu) items.push({ b: x }); }
      else items.push({ b });
    }
    const pinned = () => app.prefs.get("werkzeuge.schnellzugriff") || [];
    const row = ({ b, head }) => {
      if (head) return h("div", { class: "rb-gl-head" }, head);
      const id = this.tipId(b), cmd = commandDef(id), k = this.kbd(id), on = pinned().includes(id);
      return h("div", { class: "rb-gl-row" + (b.disabled ? " off" : ""), role: "menuitem", tabindex: "-1", "data-id": b.id,
        onclick: () => { if (b.disabled) return; this.closeGroupList(); this.press(b, { currentTarget: btn, clientX: 0, clientY: 0 }); } },
        icon(b.icon || "part"), h("span", { class: "rb-gl-label" }, t_(b.label).replace(/\u00ad/g, "")),
        k ? h("span", { class: "rb-gl-kbd" }, k) : null,
        cmd ? h("button", { class: "rb-gl-pin" + (on ? " on" : ""), title: on ? "Vom Schnellzugriff lösen" : "An den Schnellzugriff in der Kopfleiste heften", "aria-pressed": String(on),
          onclick: (ev) => { ev.stopPropagation(); const cur = pinned(); const r = app.prefs.set("werkzeuge.schnellzugriff", on ? cur.filter((x) => x !== id) : [...cur, id]); if (!r.ok) toast(r.error, { kind: "err" }); this.closeGroupList(); this.renderAppBar(); } }, icon("pin")) : h("span", { class: "rb-gl-pin none" }));
    };
    const box = h("div", { class: "rb-glist", role: "menu", "aria-label": g.label }, h("div", { class: "rb-gl-title" }, t_(g.label)), ...items.map(row),
      h("div", { class: "rb-gl-foot" }, "Angeheftete Befehle stehen im Schnellzugriff oben. Nadel klicken heftet an oder löst."));
    document.body.append(box);
    const r = btn.getBoundingClientRect();
    box.style.top = r.bottom + 4 + "px";
    box.style.left = Math.max(8, Math.min(r.left + r.width / 2 - box.offsetWidth / 2, innerWidth - box.offsetWidth - 8)) + "px";
    btn.classList.add("open");
    const away = (ev) => { if (!box.contains(ev.target) && !btn.contains(ev.target)) this.closeGroupList(); };
    const key = (ev) => {
      if (ev.key === "Escape") { ev.stopPropagation(); this.closeGroupList(); btn.focus(); return; }
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        const rows = [...box.querySelectorAll(".rb-gl-row")], i = rows.indexOf(document.activeElement);
        rows[(i + (ev.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
      }
      if (ev.key === "Enter" && document.activeElement?.classList.contains("rb-gl-row")) { ev.preventDefault(); document.activeElement.click(); }
    };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key, true);
    this.glist = { box, btn, off: () => { document.removeEventListener("mousedown", away, true); document.removeEventListener("keydown", key, true); } };
    box.querySelector(".rb-gl-row")?.focus();
  }
  closeGroupList() {
    const g = this.glist;
    if (!g) return;
    this.glist = null;
    g.off(); g.btn.classList.remove("open"); g.box.remove();
  }
  /** Knopf gedrückt: merken (Wiederholen, Befehlssuche »Zuletzt«), dann ausführen */
  /** Knopf des aktuellen Modus nach id (auch in »Weitere«-Menüs), z. B. für die Kachel »Nächster Schritt« */
  findButton(id) {
    for (const t of this.tabsFor(this.app.mode) || []) for (const g of t.groups || []) for (const b of g.buttons || []) {
      if (b.id === id) return b;
      const sub = (b.menu || []).find((x) => x.id === id);
      if (sub) return sub;
    }
    return null;
  }
  press(b, e) {
    // Aufklappknöpfe (▾) brauchen den Knopf als Anker – nicht für »Nochmal« merken
    if (!/^(v_|dm_|clip_)/.test(b.id) && !b.finish && !b.items && !b.menu && !/▾$/.test(b.label)) {
      this.last = { b, mode: this.app.mode };
      const id = this.tipId(b);
      if (commandDef(id)) rememberCommand(id);
    }
    return b.run?.(e);
  }
  /** Passt das Menüband nicht in die Breite, klappen Gruppen von rechts zu je einem Knopf ein (wie Inventor) */
  fitGroups() {
    const panel = this.el.querySelector(".rb-panel");
    if (!panel || !panel.clientWidth) return;
    this.closeFlyout();
    const groups = [...panel.querySelectorAll(":scope > .rb-group")];
    for (const g of groups) if (g.classList.contains("zu")) { g.classList.remove("zu"); g.querySelector(".rb-collapse")?.remove(); }
    // erst die Arbeitsbereich-Kachel schmal machen (nur Symbol), dann Gruppen einklappen
    const ws = this.el.querySelector(".rb-ws");
    ws?.classList.remove("schmal", "weg");
    if (ws && panel.scrollWidth > panel.clientWidth + 1) ws.classList.add("schmal");
    if (ws && panel.scrollWidth > panel.clientWidth + 1) ws.classList.add("weg"); // Arbeitsbereich bleibt über Ansicht erreichbar
    // »Skizze fertig« und Gruppen mit nur einem Knopf bleiben stehen (Einklappen spart dort nichts)
    const keep = (g) => g.querySelector(".rb-finish") || g.querySelectorAll("button").length <= 1;
    for (let i = groups.length - 1; i >= 0 && panel.scrollWidth > panel.clientWidth + 1; i--) if (!keep(groups[i])) this.collapseGroup(groups[i]);
  }
  collapseGroup(g) {
    const btns = g.querySelector(".rb-buttons");
    const first = btns?.querySelector("svg");
    const label = g.dataset.group;
    g.classList.add("zu");
    g.prepend(h("button", { class: "rb-btn rb-collapse", "data-tip": label, "data-desc": "Gruppe eingeklappt, weil das Fenster schmal ist. Klick zeigt ihre Befehle.", "aria-haspopup": "true", "aria-expanded": "false", onclick: (e) => this.openFlyout(g, e.currentTarget) },
      first ? first.cloneNode(true) : icon("plus"), h("span", {}, t_(label), " ▾")));
  }
  openFlyout(g, btn) {
    if (this.flyout?.group === g) return this.closeFlyout();
    this.closeFlyout();
    const btns = g.querySelector(".rb-buttons");
    const r = btn.getBoundingClientRect(), root = this.el.getBoundingClientRect();
    const box = h("div", { class: "rb-flyout", role: "group", "aria-label": g.dataset.group, onclick: (e) => { if (e.target.closest("button")) setTimeout(() => this.closeFlyout(), 0); } }, btns);
    box.style.top = r.bottom - root.top + 2 + "px";
    this.el.append(box);
    box.style.left = Math.max(4, Math.min(r.left - root.left, root.width - box.offsetWidth - 4)) + "px";
    btn.setAttribute("aria-expanded", "true");
    const away = (e) => { if (!box.contains(e.target) && e.target !== btn && !btn.contains(e.target)) this.closeFlyout(); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); this.closeFlyout(); btn.focus(); } };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", esc, true);
    this.flyout = { group: g, box, btns, btn, off: () => { document.removeEventListener("mousedown", away, true); document.removeEventListener("keydown", esc, true); } };
  }
  closeFlyout() {
    const f = this.flyout;
    if (!f) return;
    this.flyout = null;
    f.off();
    f.btn.setAttribute("aria-expanded", "false");
    f.group.insertBefore(f.btns, f.group.querySelector(".rb-group-label"));
    f.box.remove();
  }
  /** Rückgängig-Verlauf: Klick auf einen Eintrag nimmt bis einschließlich diesen Schritt zurück */
  undoMenu(e) {
    const app = this.app;
    const r = e.currentTarget.getBoundingClientRect();
    contextMenu(r.left, r.bottom, undoHistory(app.undoStack).map((x) => ({ label: x.steps === 1 ? x.label : `${x.label}  (${x.steps} Schritte)`, icon: "undo", run: () => { for (let i = 0; i < x.steps; i++) app.undo(); } })));
  }
  /** Pfeiltasten wechseln den Reiter (Tablisten-Muster), Pos1/Ende springen an den Rand */
  tabKey(e, tabs) {
    const i = tabs.findIndex((t) => t.id === this.tab);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (n === undefined || !tabs.length) return;
    e.preventDefault();
    this.tab = tabs[(n + tabs.length) % tabs.length].id;
    this.render();
    this.el.querySelector(`.rb-tab[data-tab="${this.tab}"]`)?.focus();
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
    const k = this.kbd(this.tipId(b));
    return k ? `${b.label} (${k})` : b.label;
  }
  tipId(b) {
    const special = { w_side: "view.side", w_werkstatt: "view.werkstatt", ws_end: "view.werkstatt", x_glb: "file.glb", x_obj: "file.obj", x_3mf: "file.3mf", x_render: "file.render", rebuildNow: "model.rebuild", measure: "tools.measure", collide: "asm.collide", problems: "model.problems", replaceComp: "asm.replace", positions: "asm.positionSave", asmParams: "asm.params", compColors: "view.compColors", finishSketch: "sketch.finish", constr: "sketch.construction", sclean: "sketch.clean", sdxf: "sketch.importDxf", gridsnap: "sketch.gridsnap", sdof: "sketch.dof", v_fitsel: "view.fitSel", v_persp: "view.perspective", clip_X: "view.clipX", clip_Y: "view.clipY", clip_Z: "view.clipZ" };
    return special[b.id] || (b.id.startsWith("t_") ? "sketch." + b.id.slice(2) : b.id.startsWith("v_") ? "view." + b.id.slice(2) : b.id.startsWith("dm_") ? "view.mode." + b.id.slice(3) : "part." + b.id);
  }
  /** Daten für die Tooltip-Karte (src/ui/tooltip.js); die Beschreibung auch für Bildschirmleser */
  tipAttrs(b) {
    const k = this.kbd(this.tipId(b));
    const desc = befehlHilfe(b.id, SKETCH_TOOLS);
    return { "data-tip": t_(b.label).replace(/\u00ad/g, ""), "data-kbd": k || null, "data-desc": desc || null, "aria-description": desc || null };
  }
  renderDocLabel() {
    if (!this.docLabel) return;
    const d = this.app.activeDoc();
    const kind = { part: "Bauteil", assembly: "Baugruppe", drawing: "Zeichnung" }[d?.kind] || "";
    // Name des Dokuments steht im Dokument-Reiter; hier Projekt und ungespeichert-Punkt
    this.docLabel.title = d ? `${this.app.project.name} / ${kind} ${d.name}` : this.app.project.name;
    this.docLabel.replaceChildren(this.app.project.name, this.app.dirty ? h("span", { class: "ab-dirty", title: "Ungespeicherte Änderungen" }, " •") : "");
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
      item("save", "Version speichern…", () => app.commands.exec("file.versionSave")),
      item("open", "Versionen…", () => app.commands.exec("file.versions")),
      item("export", "Projekt paketieren…", () => f.packageProject()),
      h("hr"),
      item("part", "Neues Bauteil", () => app.newPart()),
      item("assembly", "Neue Baugruppe", () => app.newAssembly()),
      item("drawing", "Neue Zeichnung", () => app.newDrawing(), null, !app.project.docs.some((d) => d.kind !== "drawing")),
      h("hr"),
      item("import", "STEP, STL oder OBJ als Bauteil importieren…", () => f.importStepAsPart()),
      item("steel", "Beispielprojekt öffnen", () => app.openExample()),
      h("hr"),
      item("search", "Befehl suchen…", () => app.commands.exec("app.search"), this.kbd("app.search")),
      item("settings", "Einstellungen…", () => app.props.settingsDialog(), this.kbd("app.settings")),
      item("info", "Über PBCAD", () => app.props.aboutDialog()));
    document.body.append(m);
    setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  }
}

/** Beschriftung großer Knöpfe darf nach »/« umbrechen (»Kürzen/Verlängern«); <wbr> ändert den Namen des Knopfs nicht */
function breakable(label) {
  const parts = String(label).split(/(?<=\/)/);
  return parts.flatMap((p, i) => (i ? [h("wbr"), p] : [p]));
}
