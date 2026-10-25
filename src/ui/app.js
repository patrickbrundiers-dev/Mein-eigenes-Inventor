// Anwendungssteuerung: Projektzustand, Rückgängig, Neuaufbau, Auswahl, Modi
import { Viewer } from "./viewer.js";
import { invertSelection } from "../core/boxselect.js";
import { Sketcher } from "./sketcher.js";
import { KernelClient } from "./kernel.js";
import { Ribbon } from "./ribbon.js";
import { Tree } from "./tree.js";
import { Props, bomRows } from "./props.js";
import { DrawingEditor } from "./drawing.js";
import { Files } from "./files.js";
import { StartScreen } from "./start.js";
import { Prefs } from "./prefs.js";
import { CommandKeys } from "./commands.js";
import { constraintLabel } from "../core/sketchshapes.js";
import { entityFree } from "../core/solver.js";
import { h, toast, confirmDialog, promptDialog, contextMenu, fmtNum } from "./dom.js";
import { newProject, newPart, newAssembly, newDrawing, exampleProject, uid } from "../core/examples.js";
import { classText } from "../core/tolerance.js";
import { newSketch } from "../core/sketch.js";
import { planeFromFace, planeFrame, BASE_PLANES, placementMatrix, decomposePlacement, matMul, alignFaces, matApply, matApplyDir } from "../core/geom.js";
import { flattenAssembly } from "../core/subasm.js";
import { bodiesMass } from "../core/mass.js";
import { materialOf, setUserMaterials, adoptProjectMaterials, projectMaterialCopies } from "../core/materials.js";
import { resolveParams, evaluate } from "../core/expr.js";
import { faceRef, axisRef, solveAssembly } from "../core/asmsolve.js";
import { partContent, baseName } from "../core/links.js";
import { finishColor } from "../core/oberflaeche.js";
import { Docking } from "./layout.js";
import { nextName } from "../core/naming.js";
import { BuildLog, buildEntry } from "../core/buildlog.js";

const linkedMessage = (part) => `»${part.name}« ist mit ${baseName(part.link.path)} verknüpft – dort ändern oder hier die Verknüpfung lösen`;
const hitKey = (x) => `${x.kind}:${x.key}:${x.body}:${x.edge ?? x.face}:${x.end ?? ""}`;
const freeCount = (sk, free) => sk.entities.filter((e) => !e.origin && !e.construction && entityFree(e, free)).length;

export class App {
  constructor() {
    this.project = newProject();
    this.buildLog = new BuildLog();
    this.stale = false;
    this.filePath = null;
    this.dirty = false;
    this.activeId = null;
    this.mode = "start";
    this.sel = null;
    this.selHits = [];
    this.results = new Map();
    this.undoStack = [];
    this.redoStack = [];
    this.pick = null;
    this.visibleSketches = new Set();
    this.selFilter = "alles";
    this.prefs = new Prefs();
    this.quality = this.prefs.get("ansicht.qualitaet");
    this.fittedFor = null;

    this.statusEl = document.getElementById("status");
    this.hud = document.getElementById("hud");
    this.kernel = new KernelClient((busy, msg) => this.setBusy(busy, msg));
    this.docking = new Docking(this);
    this.viewer = new Viewer(document.getElementById("viewer"));
    this.sketcher = new Sketcher(this);
    this.files = new Files(this);
    this.ribbon = new Ribbon(this);
    this.tree = new Tree(this);
    this.props = new Props(this);
    this.drawing = new DrawingEditor(this);
    this.start = new StartScreen(this);
    this.commands = new CommandKeys(this);
    this.applyPrefs();
    this.prefs.onChange((keys) => this.applyPrefs(keys));
    if (this.prefs.warnings.length) setTimeout(() => toast("Einstellungen: " + this.prefs.warnings[0] + (this.prefs.warnings.length > 1 ? ` (+${this.prefs.warnings.length - 1} weitere)` : ""), { kind: "err", timeout: 8000 }), 300);
    this.buildViewTools();
    this.bindViewerEvents();
    this.bindKeys();
    this.setMode("start");
    this.refreshAll();
    window.addEventListener("beforeunload", (e) => { if (this.dirty && !window.werkcad) { e.preventDefault(); e.returnValue = ""; } });
  }

  // ---------- Dokumente ----------
  doc(id) { return this.project.docs.find((d) => d.id === id); }
  activeDoc() { return this.doc(this.activeId); }
  parts() { return this.project.docs.filter((d) => d.kind === "part"); }

  openDoc(id) {
    if (this.mode === "sketch") this.finishSketch(true);
    const d = this.doc(id);
    if (!d) return;
    this.activeId = id;
    this.sel = null;
    this.selHits = [];
    this.pick = null;
    this.viewer.clearPlanes();
    this.viewer.setHidden([]);
    this.setMode(d.kind);
    this.fittedFor = null;
    this.refreshAll();
    this.rebuild();
  }
  setMode(mode) {
    this.mode = mode;
    const draw = mode === "drawing";
    const start = mode === "start";
    document.getElementById("viewer").hidden = draw || start;
    document.getElementById("drawing-stage").hidden = !draw;
    document.getElementById("start").hidden = !start;
    document.getElementById("overlay").style.display = mode === "sketch" ? "" : "none";
    this.viewTools.hidden = draw || start;
    this.docking.setModeHidden(start ? ["browser"] : []);
    if (start) this.start.render();
    if (draw) this.drawing.open(this.activeDoc());
    else this.drawing.close();
    this.viewer.hideCube = false;
  }
  addDoc(doc, { open = true } = {}) {
    this.checkpoint("Neues Dokument");
    this.project.docs.push(doc);
    this.changed({ rebuild: false });
    if (open) this.openDoc(doc.id);
    return doc;
  }
  /** Name nach der Namensregel aus den Einstellungen (Dokument und Modell) */
  docName(kind, extra = {}) {
    const key = { part: "dokument.name.bauteil", assembly: "dokument.name.baugruppe", drawing: "dokument.name.zeichnung" }[kind];
    const same = this.project.docs.filter((d) => d.kind === kind);
    return nextName(this.prefs.get(key), this.project.docs.map((d) => d.name), { projekt: this.project.name, ...extra }, same.length + 1);
  }
  newPart(name) { return this.addDoc(this.withPartDefaults(newPart(name || this.docName("part")))); }
  /** Werkstoff und Sachnummer neuer Bauteile aus den Einstellungen (auch für importierte Bauteile) */
  withPartDefaults(p) {
    const mat = this.prefs.get("dokument.werkstoff");
    p.material = materialOf(mat).source === "fallback" ? "S235" : mat;
    const num = this.prefs.get("dokument.nummer");
    if (num) p.number = nextName(num, this.parts().map((d) => d.number).filter(Boolean), { projekt: this.project.name }, this.parts().length + 1);
    return p;
  }
  /** Allgemeintoleranz und Nachkommastellen neuer Zeichnungen aus den Einstellungen */
  withDrawingDefaults(d) {
    d.title.toleranz = classText(this.prefs.get("dokument.toleranzklasse"));
    d.nachkomma = this.prefs.get("dokument.nachkomma");
    return d;
  }
  newAssembly() { return this.addDoc(newAssembly(this.docName("assembly"))); }
  newDrawing(source) {
    const src = source || (this.activeDoc() && this.activeDoc().kind !== "drawing" ? { kind: this.activeDoc().kind, id: this.activeId } : null);
    const name = this.docName("drawing", { quelle: src ? this.doc(src.id).name : "" });
    const d = this.withDrawingDefaults(newDrawing(name, src));
    if (src) {
      const sd = this.doc(src.id);
      d.title.benennung = sd.name;
      d.title.nummer = sd.number || "";
      // Werkstoff bleibt leer: das Schriftfeld zeigt dann den aktuellen Werkstoff des Modells
      d.pendingAutoViews = true;
    }
    return this.addDoc(d);
  }
  /** Bauteile einer Baugruppe (ohne doppelte, auch ausgeblendete), fertig berechnet */
  async builtParts(asm) {
    const parts = asm.kind === "part" ? [asm] : [...new Map(flattenAssembly(asm, (id) => this.doc(id), { includeHidden: true }).map((o) => [o.part.id, o.part])).values()];
    for (const p of parts) if (!this.results.has(p.id)) await this.buildPart(p);
    return parts;
  }
  /**
   * Einzelteilzeichnungen (E5): je Position der Baugruppe eine Zeichnung mit Grundansichten, Hauptmaßen und Schriftfeld.
   * Bauteile mit vorhandener Zeichnung und reine Normteile bleiben aus; für ein Bauteil entsteht höchstens seine eine. Gibt die neuen Zeichnungen zurück.
   */
  async partDrawings(asmId, { quiet = false } = {}) {
    const asm = this.doc(asmId);
    if (asm?.kind !== "assembly" && asm?.kind !== "part") return [];
    await this.builtParts(asm);
    const has = (id) => this.project.docs.some((x) => x.kind === "drawing" && x.source?.kind === "part" && x.source.id === id);
    const todo = (asm.kind === "part" ? [{ part: asm }] : bomRows(this, asm)).filter((r) => r.part && !has(r.part.id));
    if (!todo.length) { if (!quiet) toast("Alle Positionen haben schon eine Zeichnung"); return []; }
    this.checkpoint("Einzelteilzeichnungen");
    const made = todo.map((r) => {
      const d = this.withDrawingDefaults(newDrawing("Zeichnung " + r.part.name, { kind: "part", id: r.part.id }));
      d.title.benennung = r.part.name;
      d.title.nummer = r.part.number || "";
      d.pendingAutoViews = true;
      d.pendingAutoDims = true;
      return d;
    });
    this.project.docs.push(...made);
    const t = quiet ? null : toast(`Einzelteilzeichnungen: 0 / ${made.length} …`, { timeout: 0 });
    try {
      for (const [i, d] of made.entries()) {
        await this.drawing.sheetExport(d);
        if (t) t.firstChild.textContent = `Einzelteilzeichnungen: ${i + 1} / ${made.length} …`;
      }
    } finally { t?.remove(); }
    this.changed({ rebuild: false });
    if (!quiet) toast(`${made.length} Einzelteilzeichnung${made.length === 1 ? "" : "en"} erzeugt`, { kind: "ok" });
    return made;
  }
  async deleteDoc(id) {
    const d = this.doc(id);
    if (!d) return;
    const users = this.project.docs.filter((x) => (x.kind === "assembly" && x.components.some((c) => c.part === id)) || (x.kind === "drawing" && x.source?.id === id));
    const extra = users.length ? ` Es wird verwendet in: ${users.map((u) => u.name).join(", ")}.` : "";
    if ((this.prefs.get("allgemein.loeschenBestaetigen") || users.length) && !(await confirmDialog("Dokument löschen", `»${d.name}« wirklich löschen?${extra}`, { ok: "Löschen", danger: true }))) return;
    this.checkpoint("Löschen");
    this.project.docs = this.project.docs.filter((x) => x.id !== id);
    for (const a of this.project.docs) if (a.kind === "assembly") a.components = a.components.filter((c) => c.part !== id);
    if (this.activeId === id) { this.activeId = null; this.setMode(this.project.docs.length ? "start" : "start"); }
    this.changed();
  }
  duplicateDoc(id) {
    const d = this.doc(id);
    const copy = JSON.parse(JSON.stringify(d));
    copy.id = uid(d.kind[0]);
    copy.name = d.name + " (Kopie)";
    this.addDoc(copy);
  }
  setProject(prj, filePath = null) {
    if (this.mode === "sketch") this.finishSketch(true);
    this.project = prj;
    this.filePath = filePath;
    this.readOnly = false;
    const matIssues = adoptProjectMaterials(prj);
    this.syncMaterials();
    for (const i of matIssues) toast(i.message, { timeout: 8000 });
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.results.clear();
    this.activeId = null;
    const first = prj.docs.find((d) => d.kind === "assembly") || prj.docs[0];
    if (first) this.openDoc(first.id);
    else { this.setMode("start"); this.refreshAll(); }
    this.updateTitle();
    if (filePath && prj.docs.some((d) => d.link)) this.files.refreshLinks({ interactive: false }).catch((e) => toast("Verknüpfungen: " + e.message, { kind: "err" }));
  }
  async newProject() {
    if (!(await this.files.confirmDiscard())) return;
    this.setProject(newProject());
    this.startContent(this.prefs.get("dokument.neuesProjekt"));
  }
  /** Inhalt eines neuen Projekts: Bauteil, Baugruppe mit Bauteil oder nichts */
  startContent(kind = "bauteil") {
    if (kind === "leer") { this.setMode("start"); this.refreshAll(); return; }
    if (kind === "baugruppe") {
      const a = this.newAssembly();
      const p = this.newPart();
      a.components.push({ id: uid("c"), part: p.id, name: p.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true });
      this.changed({ rebuild: false });
      return;
    }
    this.newPart();
  }
  async openExample() {
    if (!(await this.files.confirmDiscard())) return;
    this.setProject(exampleProject());
  }

  // ---------- Änderungen / Rückgängig ----------
  checkpoint(label) {
    this.undoStack.push({ label, json: JSON.stringify(this.project), activeId: this.activeId, sketchId: this.mode === "sketch" ? this.sketcher.sketchId : null });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }
  changed({ rebuild = true } = {}) {
    this.dirty = true;
    if (rebuild && this.sel?.type === "geometry") { this.sel = null; this.selHits = []; }
    // Einstellung »Automatisch neu berechnen« aus: Änderungen sammeln, F5 rechnet (Zeichnungen immer sofort)
    const now = rebuild && (this.prefs.get("kernel.automatisch") || this.mode === "drawing");
    if (rebuild && !now) this.stale = true;
    this.updateTitle();
    this.files.autosave();
    this.tree.render();
    this.props.render();
    this.ribbon.render();
    if (now) this.rebuild();
    else if (rebuild) this.updateStatus();
  }
  /** F5: aufgeschobene Änderungen jetzt rechnen */
  rebuildNow() { this.rebuild(); this.ribbon.render(); this.updateStatus(); }
  /**
   * Bequeme Variante: Änderung mit Rückgängig-Punkt. Atomar: wirft fn, wird der Stand
   * vor der Änderung wiederhergestellt (kein halb geändertes Modell). Rückgabe: true bei Erfolg.
   */
  edit(label, fn, opts) {
    const redo = this.redoStack;
    this.checkpoint(label);
    // Verknüpfte Bauteile (M24) sind schreibgeschützt – geändert wird in ihrer Datei
    const linked = opts?.link ? null : this.project.docs.filter((d) => d.kind === "part" && d.link).map((d) => [d, partContent(d)]);
    try {
      fn();
      const hit = linked?.find(([d, before]) => this.project.docs.includes(d) && partContent(d) !== before);
      if (hit) throw new Error(linkedMessage(hit[0]));
    } catch (e) {
      const st = this.undoStack.pop();
      this.redoStack = redo;
      this.project = JSON.parse(st.json);
      this.activeId = this.doc(st.activeId) ? st.activeId : this.activeId;
      if (this.sel?.type === "feature" && !this.activeDoc()?.features?.some((f) => f.id === this.sel.id)) this.sel = null;
      window.werkcad?.log?.("error", "aenderung", `${label}: ${e?.stack || e}`);
      toast(`${label} nicht möglich: ${e?.message || e} – Stand davor wiederhergestellt`, { kind: "err", timeout: 6000 });
      this.tree.render();
      this.props.render();
      this.ribbon.render();
      if (this.mode === "sketch") { this.sketcher.solve(); this.sketcher.render(); }
      this.rebuild();
      return false;
    }
    this.changed(opts);
    return true;
  }
  /** Verknüpftes Bauteil (M24)? Dann Hinweis und true – Skizzen/Features dort nur in der Quelldatei */
  linkedReadOnly(part) {
    if (part?.kind !== "part" || !part.link) return false;
    toast(linkedMessage(part), { kind: "err", timeout: 6000 });
    return true;
  }
  undo() { this.restore(this.undoStack, this.redoStack); }
  redo() { this.restore(this.redoStack, this.undoStack); }
  restore(from, to) {
    const st = from.pop();
    if (!st) return;
    to.push({ label: st.label, json: JSON.stringify(this.project), activeId: this.activeId, sketchId: this.mode === "sketch" ? this.sketcher.sketchId : null });
    this.project = JSON.parse(st.json);
    if (!this.doc(this.activeId)) this.activeId = st.activeId;
    if (this.mode === "sketch") {
      if (!this.activeDoc()?.features.some((f) => f.id === this.sketcher.sketchId)) this.finishSketch(true);
      else { this.sketcher.solve(); this.sketcher.render(); }
    }
    if (this.sel?.type === "feature" && !this.activeDoc()?.features?.some((f) => f.id === this.sel.id)) this.sel = null;
    toast((from === this.undoStack ? "Wiederhergestellt: " : "Rückgängig: ") + st.label, { timeout: 1600 });
    this.changed();
  }

  // ---------- Neuaufbau ----------
  rebuild() {
    this.stale = false;
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.doRebuild(), 90);
  }
  async buildPart(part) {
    const t0 = performance.now();
    const res = await this.kernel.build(part, this.quality);
    this.results.set(part.id, { ...res, hash: JSON.stringify(part).length });
    if (this.prefs.get("kernel.protokoll")) this.buildLog.add(buildEntry(part, res, performance.now() - t0));
    return res;
  }
  async doRebuild() {
    const d = this.activeDoc();
    if (!d) return;
    try {
      if (d.kind === "part") {
        const res = await this.buildPart(d);
        if (this.activeId !== d.id) return;
        // Beim Wählen von Kanten/Flächen das Modell vor diesem Feature zeigen
        const editId = this.pick && (this.pick.kind === "edges" || this.pick.kind === "faces") ? this.pick.feature : null;
        const idx = editId ? d.features.findIndex((f) => f.id === editId) : -1;
        if (idx >= 0) {
          const before = { ...d, id: d.id + "@vor", features: d.features.slice(0, idx) };
          const r2 = await this.kernel.build(before, this.quality);
          if (this.activeId !== d.id) return;
          this.showPart(d, r2);
        } else this.showPart(d, res);
      } else if (d.kind === "assembly") {
        const ids = [...new Set(flattenAssembly(d, (id) => this.doc(id), { includeHidden: true }).map((o) => o.part.id))];
        const results = await Promise.all(ids.map((id) => this.doc(id) ? this.buildPart(this.doc(id)) : null));
        if (this.activeId !== d.id) return;
        void results;
        this.solveAssemblyConstraints(d);
        this.showAssembly(d);
      } else if (d.kind === "drawing") {
        await this.drawing.update();
      }
      this.tree.render();
      this.props.render();
      this.updateStatus();
    } catch (e) {
      toast("Fehler beim Berechnen: " + e.message, { kind: "err" });
    }
  }
  partColor(part) { return part.color || finishColor(part) || materialOf(part.material).color; }
  showPart(part, res) {
    if (this.mode === "sketch") {
      // im Skizzenmodus Modell halbtransparent hinter der Skizze
      this.viewer.showPart(res.bodies, { color: this.partColor(part), opacity: 0.35, material: part.material, finish: part.finish });
    } else this.viewer.showPart(res.bodies, { color: this.partColor(part), material: part.material, finish: part.finish });
    this.showSketches3D();
    if (this.fittedFor !== part.id) {
      this.fittedFor = part.id;
      if (res.bodies.length || part.features.some((f) => f.type === "sketch")) {
        if (this.mode !== "sketch") this.viewer.setView("iso", { animate: false });
        this.viewer.fit();
      }
    }
    this.refreshSelectionHits();
  }
  showAssembly(asm) {
    const docOf = (id) => this.doc(id);
    const comps = asm.components.flatMap((c) => {
      if (c.hidden) return [];
      const p = docOf(c.part);
      if (p?.kind === "assembly") {
        // Unterbaugruppe: jedes Bauteil mit Gesamt-Platzierung, Auswahl wirkt auf die ganze Komponente
        return flattenAssembly({ id: asm.id, components: [c] }, docOf).map((o) => ({ id: c.id, partKey: o.part.id, bodies: this.results.get(o.part.id)?.bodies, color: this.partColor(o.part), material: o.part.material, finish: o.part.finish, matrix: o.matrix, inner: o.inner, leaf: o.part.id, opacity: 1 }));
      }
      return [{ id: c.id, partKey: c.part, bodies: this.results.get(c.part)?.bodies, color: p ? this.partColor(p) : "#999", material: p?.material, finish: p?.finish, pos: c.pos, rot: c.rot, opacity: 1 }];
    });
    this.viewer.showAssembly(comps);
    this.viewer.showSketches([]);
    if (this.fittedFor !== asm.id && comps.length) {
      this.fittedFor = asm.id;
      this.viewer.setView("iso", { animate: false });
      this.viewer.fit();
    }
    this.refreshSelectionHits();
  }
  showSketches3D() {
    const part = this.activeDoc();
    if (!part || part.kind !== "part") return this.viewer.showSketches([]);
    const res = this.results.get(part.id);
    const scope = resolveParams(part.params).values;
    const list = [];
    for (const f of part.features) {
      if (f.type !== "sketch") continue;
      if (this.mode === "sketch" && f.id === this.sketcher.sketchId) continue;
      const selected = this.sel?.type === "feature" && this.sel.id === f.id;
      const consumed = part.features.some((g) => g.sketch === f.id);
      if (!(selected || this.visibleSketches.has(f.id) || (!consumed && this.mode !== "sketch"))) continue;
      let off = 0;
      try { off = evaluate(f.offset || "0", scope); } catch { /* */ }
      list.push({ sketch: f, frame: res?.sketches?.[f.id]?.frame || planeFrame(f.plane, off), active: selected });
    }
    this.viewer.showSketches(list);
  }

  // ---------- Skizzen ----------
  /** Skizzenerstellung: Ebene wählen lassen */
  beginSketchCreation() {
    const part = this.activeDoc();
    if (!part || part.kind !== "part" || this.linkedReadOnly(part)) return;
    // Einstellung Standardebene: im leeren Bauteil gleich auf der Ebene beginnen
    const std = this.prefs.get("skizze.standardebene");
    if (std !== "waehlen" && !(this.results.get(part.id)?.bodies?.length)) return this.createSketch({ ref: std });
    this.pick = { kind: "sketchPlane" };
    const bb = this.viewer.contentBox();
    const size = bb.isEmpty() ? 200 : Math.max(100, bb.getSize(new (bb.min.constructor)()).length() * 0.7);
    this.viewer.showPlanes([
      { frame: planeFrame({ ref: "XY" }, 0), size, color: 0x2457b8, label: "XY" },
      { frame: planeFrame({ ref: "XZ" }, 0), size, color: 0x2e9d4a, label: "XZ" },
      { frame: planeFrame({ ref: "YZ" }, 0), size, color: 0xd23b2a, label: "YZ" },
    ]);
    this.setHint("Ebene (XY, XZ, YZ) oder ebene Fläche des Modells anklicken – Esc bricht ab");
    this.props.render();
  }
  createSketch(plane, offset = "0") {
    const part = this.activeDoc();
    if (this.linkedReadOnly(part)) return null;
    const n = part.features.filter((f) => f.type === "sketch").length + 1;
    const sk = newSketch(uid("s"), `Skizze ${n}`, plane);
    sk.offset = offset;
    this.checkpoint("Skizze erstellen");
    // vor dem Ende-Marker bzw. hinter dem gewählten Feature einfügen
    part.features.push(sk);
    this.pick = null;
    this.viewer.clearPlanes();
    this.changed({ rebuild: false });
    this.editSketch(sk.id);
  }
  editSketch(id) {
    const part = this.activeDoc();
    if (!part?.features.some((f) => f.id === id) || this.linkedReadOnly(part)) return;
    this.pick = null;
    this.viewer.clearPlanes();
    this.sel = { type: "feature", id };
    this.setMode("sketch");
    this.sketcher.start(id);
    this.sketchBefore = JSON.stringify(part.features.find((f) => f.id === id));
    const res = this.results.get(part.id);
    if (res) this.showPart(part, res);
    this.refreshAll();
  }
  finishSketch(silent = false) {
    if (this.mode !== "sketch") return;
    const id = this.sketcher.sketchId;
    this.sketcher.stop();
    this.setMode("part");
    this.sel = { type: "feature", id };
    this.setHint("");
    this.hud.replaceChildren();
    this.refreshAll();
    const part = this.activeDoc();
    if (this.prefs.get("kernel.automatisch")) this.rebuild();
    else {
      // Neuberechnen aus: letztes Ergebnis wieder voll zeigen; geänderte Skizze wartet auf F5
      if (JSON.stringify(part?.features.find((f) => f.id === id)) !== this.sketchBefore) this.stale = true;
      const res = part && this.results.get(part.id);
      if (res) this.showPart(part, res);
      this.ribbon.render();
      this.updateStatus();
    }
    if (!silent) {
      const sk = part.features.find((f) => f.id === id);
      const used = part.features.some((f) => f.sketch === id);
      if (sk && !used && (sk.entities.length > 1)) toast("Skizze fertig. Jetzt z. B. Extrusion, Drehung, Bohrung oder Rahmen wählen.", { timeout: 3500 });
    }
  }
  updateSketchStatus(r, prof) {
    if (this.mode !== "sketch") return;
    const dof = r?.dof;
    const regions = prof?.regions?.length || 0;
    const errs = prof?.errors || [];
    this.hud.replaceChildren(h("div", { class: "hud-card" },
      dof === 0 ? h("b", { style: { color: "var(--ok)" } }, "Vollständig bestimmt") : h("span", {}, "Freiheitsgrade: ", h("b", {}, Number.isFinite(dof) ? dof : "–")),
      dof > 0 && r?.ok && r.free ? h("span", { class: "hud-free" }, `  ·  ${freeCount(this.sketcher.sk, r.free)} Element(e) noch frei`) : null,
      h("span", {}, "  ·  "),
      h("span", {}, regions ? `${regions} geschlossene Kontur${regions > 1 ? "en" : ""}` : "keine geschlossene Kontur"),
      errs.length ? h("div", { style: { color: "var(--err)" } }, errs[0]) : null,
      r && !r.ok ? h("div", { style: { color: "var(--err)" } }, conflictText(this.sketcher.sk, r)) : null));
  }
  selectSketchItems(list) {
    this.sketchSel = list;
    this.props.render();
  }

  // ---------- Features ----------
  lastSketchId(predicate) {
    const part = this.activeDoc();
    const sks = part.features.filter((f) => f.type === "sketch" && (!predicate || predicate(f)));
    const unused = sks.filter((s) => !part.features.some((f) => f.sketch === s.id));
    const selected = this.sel?.type === "feature" && sks.find((s) => s.id === this.sel.id);
    return (selected || unused[unused.length - 1] || sks[sks.length - 1])?.id || null;
  }
  addFeature(f, { select = true } = {}) {
    const part = this.activeDoc();
    if (!part || part.kind !== "part" || this.linkedReadOnly(part)) return;
    f.id = f.id || uid("f");
    const n = part.features.filter((x) => x.type === f.type).length + 1;
    f.name = f.name || `${FEATURE_NAMES[f.type] || f.type} ${n}`;
    this.checkpoint(f.name + " hinzufügen");
    part.features.push(f);
    if (select) this.selectFeature(f.id);
    this.changed();
    return f;
  }
  selectFeature(id) {
    this.sel = id ? { type: "feature", id } : null;
    const part = this.activeDoc();
    const f = part?.features?.find((x) => x.id === id);
    this.pick = null;
    if (f && (f.type === "fillet" || f.type === "chamfer") && (f.mode || "edges") === "edges") this.pick = { kind: "edges", feature: f.id };
    if (f && f.type === "naht") this.pick = { kind: "edges", feature: f.id };
    if (f && f.type === "shell") this.pick = { kind: "faces", feature: f.id };
    const wasEditing = this._editingFeature;
    this._editingFeature = this.pick?.feature || null;
    if (wasEditing !== this._editingFeature) this.rebuild();
    this.showSketches3D();
    this.refreshSelectionHits();
    this.tree.render();
    this.props.render();
    this.ribbon.render();
  }
  feature(id) { return this.activeDoc()?.features?.find((f) => f.id === id); }
  deleteFeature(id) {
    const part = this.activeDoc();
    const f = this.feature(id);
    if (!f) return;
    // abhängige Features, auch über mehrere Stufen (Profil → Platte → Rippe)
    const gone = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const g of part.features) if (!gone.has(g.id) && [g.sketch, g.feature, g.target, g.plate].some((x) => x && gone.has(x))) { gone.add(g.id); grew = true; }
    }
    const deps = part.features.filter((g) => g.id !== id && gone.has(g.id));
    this.edit(`${f.name} löschen`, () => {
      part.features = part.features.filter((g) => g.id !== id && !deps.includes(g));
      if (this.sel?.id === id) this.sel = null;
    });
    if (deps.length) toast(`Abhängige Features ebenfalls gelöscht: ${deps.map((d) => d.name).join(", ")}`);
  }
  moveFeature(id, delta) {
    const part = this.activeDoc();
    const i = part.features.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= part.features.length) return;
    this.edit("Reihenfolge", () => {
      const [f] = part.features.splice(i, 1);
      part.features.splice(j, 0, f);
    });
  }

  // ---------- Auswahl im 3D-Fenster ----------
  bindViewerEvents() {
    const cv = this.viewer.renderer.domElement;
    let down = null;
    cv.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, b: e.button, t: performance.now() }; cv.focus(); });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    // Fensterauswahl im Bauteil: linke Maustaste ziehen (nach rechts ganz innen, nach links berührend)
    const boxEl = h("div", { class: "view-box", hidden: true });
    document.getElementById("stage").append(boxEl);
    const boxRect = (e) => { const r = cv.getBoundingClientRect(); return { x0: down.x - r.left, y0: down.y - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top, ox: r.left - boxEl.parentElement.getBoundingClientRect().left, oy: r.top - boxEl.parentElement.getBoundingClientRect().top }; };
    const boxAllowed = () => this.mode === "part" && !this.pick && down?.b === 0;
    cv.addEventListener("pointermove", (e) => {
      if (!down || !boxAllowed() || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 4) return;
      const b = boxRect(e);
      Object.assign(boxEl.style, { left: b.ox + Math.min(b.x0, b.x1) + "px", top: b.oy + Math.min(b.y0, b.y1) + "px", width: Math.abs(b.x1 - b.x0) + "px", height: Math.abs(b.y1 - b.y0) + "px" });
      boxEl.classList.toggle("cross", b.x1 < b.x0);
      boxEl.hidden = false;
    });
    cv.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
      if (moved && !boxEl.hidden) {
        const b = boxRect(e);
        boxEl.hidden = true;
        down = null;
        return this.boxSelect(b, b.x1 < b.x0, e.ctrlKey || e.shiftKey);
      }
      boxEl.hidden = true;
      const b = down.b;
      down = null;
      if (moved) return;
      if (b === 2 && this.mode === "sketch") { this.sketcher.state = null; this.sketcher.render(); return; }
      if (b === 2) return this.viewerContextMenu(e);
      if (b !== 0 || this.mode === "sketch") return;
      if (this.viewer.handleCubeClick(e.clientX, e.clientY)) return;
      this.viewerClick(e);
    });
    let raf = 0;
    cv.addEventListener("pointermove", (e) => {
      if (this.mode === "sketch" || down) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.viewerHover(e));
    });
    cv.addEventListener("pointerleave", () => this.viewer.clearHover());
  }
  pickOptions() {
    const p = this.pick;
    if (p?.kind === "edges") return { edges: true, faces: false };
    if (p?.kind === "measure") return { edges: true, faces: true, vertices: true };
    if (p?.kind === "faces" || p?.kind === "sketchPlane" || p?.kind === "align") return { edges: false, faces: true };
    if (this.mode === "assembly") return { edges: false, faces: true };
    if (this.selFilter === "flaechen") return { edges: false, faces: true };
    if (this.selFilter === "kanten") return { edges: true, faces: false };
    return { edges: true, faces: true };
  }
  viewerHover(e) {
    if (this.pick?.kind === "sketchPlane") {
      const pl = this.viewer.pickPlane(e.clientX, e.clientY);
      const hit = this.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true });
      if (hit && hit.info?.type === "PLANE") return this.viewer.highlight([hit]);
      this.viewer.clearHover();
      this.setHint(pl ? `${pl}-Ebene` : "Ebene (XY, XZ, YZ) oder ebene Fläche des Modells anklicken – Esc bricht ab");
      return;
    }
    const hit = this.viewer.pick(e.clientX, e.clientY, this.pickOptions());
    if (!hit) return this.viewer.clearHover();
    if (this.mode === "assembly" && this.pick?.kind !== "align" && this.pick?.kind !== "measure") this.viewer.highlight([{ kind: "group", key: hit.key }]);
    else this.viewer.highlight([hit]);
  }
  viewerClick(e) {
    const p = this.pick;
    if (p?.kind === "sketchPlane") {
      const hit = this.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true });
      if (hit && hit.info?.type === "PLANE") {
        const n = hit.info.normal || hit.normal;
        return this.createSketch(planeFromFace(hit.info.point || hit.point, n));
      }
      const pl = this.viewer.pickPlane(e.clientX, e.clientY);
      if (pl) return this.createSketch({ ref: pl });
      return;
    }
    const hit = this.viewer.pick(e.clientX, e.clientY, this.pickOptions());
    if (p?.kind === "measure") return this.measurePick(hit);
    if (p?.kind === "edges") return this.toggleFeatureEdge(p.feature, hit);
    if (p?.kind === "faces") return this.toggleFeatureFace(p.feature, hit);
    if (p?.kind === "align") return this.alignPick(hit);
    if (this.mode === "assembly") {
      const cid = hit?.key?.startsWith("comp:") ? hit.key.slice(5) : null;
      this.sel = cid ? { type: "component", id: cid } : null;
      this.refreshSelectionHits();
      this.tree.render();
      this.props.render();
      return;
    }
    // Bauteil: Kanten/Flächen sammeln (Strg/Umschalt = mehrfach)
    if (!hit) { this.selHits = []; this.sel = null; }
    else {
      const same = (a) => a.kind === hit.kind && a.key === hit.key && a.body === hit.body && (a.edge ?? a.face) === (hit.edge ?? hit.face) && a.end === hit.end;
      if (e.ctrlKey || e.shiftKey) {
        const i = this.selHits.findIndex(same);
        if (i >= 0) this.selHits.splice(i, 1); else this.selHits.push(hit);
      } else this.selHits = [hit];
      this.sel = { type: "geometry" };
    }
    this.viewer.setSelectionHits(this.selHits);
    this.tree.render();
    this.props.render();
    this.ribbon.render();
  }
  /** Wählbares im Bauteil nach Auswahlfilter (Flächen/Kanten) */
  selectableOpts() {
    if (this.selFilter === "flaechen") return { edges: false, faces: true };
    if (this.selFilter === "kanten") return { edges: true, faces: false };
    return { edges: true, faces: true };
  }
  setSelection(hits) {
    this.selHits = hits;
    this.sel = hits.length ? { type: "geometry" } : null;
    this.viewer.setSelectionHits(this.selHits);
    this.tree.render();
    this.props.render();
    this.ribbon.render();
    this.updateStatus();
  }
  boxSelect(rect, crossing, add) {
    if (this.mode !== "part") return;
    const hits = this.viewer.boxHits(this.selectableOpts(), rect, crossing);
    if (!add) return this.setSelection(hits);
    const k = hitKey;
    const have = new Set(this.selHits.map(k));
    this.setSelection([...this.selHits, ...hits.filter((x) => !have.has(k(x)))]);
  }
  selectEverything() {
    if (this.mode !== "part") return;
    this.setSelection(this.viewer.boxHits(this.selectableOpts()));
  }
  invertSelection() {
    if (this.mode !== "part") return;
    this.setSelection(invertSelection(this.viewer.boxHits(this.selectableOpts()), this.selHits, hitKey));
  }
  viewerContextMenu(e) {
    const items = [];
    if (this.mode === "part") {
      items.push({ label: "Neue Skizze", icon: "sketch", run: () => this.beginSketchCreation() });
      const faceHit = this.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true });
      if (faceHit?.info?.type === "PLANE") items.push({ label: "Skizze auf dieser Fläche", icon: "plane", run: () => this.createSketch(planeFromFace(faceHit.info.point, faceHit.info.normal)) });
    }
    if (this.mode === "assembly") {
      items.push({ label: "Bauteil platzieren", icon: "place", run: () => this.props.placeComponentDialog() });
    }
    const bodyHit = (this.mode === "part" || this.mode === "assembly") ? this.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true }) : null;
    const what = this.mode === "assembly" ? "Komponente" : "Körper";
    if (bodyHit) items.push("-", { label: `${what} ausblenden`, icon: "eyeoff", run: () => this.hideHit(bodyHit) }, { label: `${what} isolieren`, icon: "eye", run: () => this.isolateHit(bodyHit) });
    if (this.viewer.hidden.size) items.push({ label: "Alle einblenden", icon: "eye", run: () => this.showAllBodies() });
    items.push("-", { label: "Alles zeigen", icon: "fit", kbd: "F6", run: () => this.viewer.fit() },
      this.viewer.selectedHits?.length ? { label: "Auswahl zeigen", icon: "fit", run: () => this.zoomToSelection() } : null,
      this.viewer.selectedHits?.some((x) => x.kind === "face" && x.info?.type === "PLANE") ? { label: "Normal zur Fläche", icon: "plane", run: () => this.viewNormalToFace() } : null,
      { label: "Iso-Ansicht", run: () => this.viewer.setView("iso") });
    if (this.undoStack.length) items.push("-", { label: "Rückgängig: " + this.undoStack[this.undoStack.length - 1].label, icon: "undo", kbd: "Strg+Z", run: () => this.undo() });
    contextMenu(e.clientX, e.clientY, items);
  }
  toggleFeatureEdge(fid, hit) {
    if (!hit || hit.kind !== "edge" || !hit.info?.mid) return;
    const f = this.feature(fid);
    const ref = { p: hit.info.mid.map(r6), type: hit.info.type };
    this.edit("Kante wählen", () => {
      f.edges = f.edges || [];
      const i = f.edges.findIndex((x) => dist3(x.p, ref.p) < 1e-3);
      if (i >= 0) f.edges.splice(i, 1); else f.edges.push(ref);
    });
  }
  toggleFeatureFace(fid, hit) {
    if (!hit || hit.kind !== "face") return;
    const f = this.feature(fid);
    const ref = { p: hit.point.map(r6) };
    this.edit("Fläche wählen", () => {
      f.faces = f.faces || [];
      const same = this.viewer.findFacesByPoint(f.faces.map((x) => x.p)).find((x) => x.face === hit.face && x.body === hit.body);
      if (same) f.faces = f.faces.filter((x) => !this.viewer.findFacesByPoint([x.p]).some((y) => y.face === hit.face && y.body === hit.body));
      else f.faces.push(ref);
    });
  }
  refreshSelectionHits() {
    const part = this.activeDoc();
    let hits = [];
    if (this.mode === "assembly" && this.sel?.type === "component") hits = [{ kind: "group", key: "comp:" + this.sel.id }];
    else if (this.mode === "assembly" && this.sel?.type === "constraint") {
      const c = (part?.constraints || []).find((x) => x.id === this.sel.id);
      if (c) hits = [{ kind: "group", key: "comp:" + c.a.comp }, { kind: "group", key: "comp:" + c.b.comp }];
    }
    else if (this.sel?.type === "feature") {
      const f = this.feature(this.sel.id);
      if (f?.edges?.length) hits = this.viewer.findEdgesByMid(f.edges.map((x) => x.p));
      if (f?.faces?.length) hits = this.viewer.findFacesByPoint(f.faces.map((x) => x.p));
    } else if (this.sel?.type === "geometry") hits = this.selHits;
    else if (this.sel?.type === "body") hits = [];
    if (this.align?.first) hits = hits.concat([this.align.first.hit]);
    this.viewer.setSelectionHits(part ? hits : []);
  }

  // ---------- Baugruppe: Ausrichten ----------
  beginAlign(mode = "gegen") {
    this.align = { mode, gap: this.align?.gap || "0", persist: this.align?.persist };
    this.pick = { kind: "align" };
    this.setHint("Fläche am Bauteil anklicken, das bewegt werden soll");
    this.props.render();
  }
  alignPick(hit) {
    if (!hit || hit.kind !== "face" || !hit.key.startsWith("comp:")) return;
    const conc = this.align.mode === "konzentrisch";
    if (conc && (hit.info?.type !== "CYLINDER" || !hit.info.axisD)) return toast("Bitte eine zylindrische Fläche wählen (Bohrung, Rohr, Bolzen)");
    if (!conc && (hit.info?.type !== "PLANE" || !hit.info.normal)) return toast("Bitte eine ebene Fläche wählen");
    const cid = hit.key.slice(5);
    hit = { ...hit, info: innerInfo(hit) };
    if (!this.align.first) {
      this.align.first = { cid, info: hit.info, hit };
      this.refreshSelectionHits();
      this.setHint("Zielfläche an einem anderen Bauteil anklicken");
      return;
    }
    if (cid === this.align.first.cid) return toast("Bitte eine Fläche an einem anderen Bauteil wählen");
    const asm = this.activeDoc();
    const B = asm.components.find((c) => c.id === this.align.first.cid);
    const A = asm.components.find((c) => c.id === cid);
    if (B.fixed && A.fixed) { toast("Beide Bauteile sind fixiert"); this.cancelPick(); return; }
    const kind = conc ? "konzentrisch" : this.align.mode === "buendig" ? "buendig" : "gegen";
    const ref = conc ? axisRef : faceRef;
    const con = {
      id: uid("ab"), type: kind, gap: conc ? "0" : this.align.gap || "0",
      a: ref(A.id, hit.info), b: ref(B.id, this.align.first.info),
      name: `${CONSTRAINT_NAMES[kind]}: ${B.name || "?"} → ${A.name || "?"}`,
    };
    const persist = this.align.persist !== false;
    this.edit(persist ? "Abhängigkeit" : "Ausrichten", () => {
      asm.constraints = asm.constraints || [];
      asm.constraints.push(con);
      solveAssembly(asm, (pid) => this.assemblyFaces(pid), (g) => safeNum(g));
      if (!persist) asm.constraints = asm.constraints.filter((c) => c.id !== con.id);
    });
    this.align = { mode: this.align.mode, gap: this.align.gap, persist: this.align.persist };
    this.pick = null;
    this.setHint("");
    this.sel = persist ? { type: "constraint", id: con.id } : { type: "component", id: B.id };
    this.refreshSelectionHits();
    this.tree.render();
    this.props.render();
  }
  /** Ebene Flächen eines Bauteils (Bauteil-Koordinaten) aus dem letzten Rechenergebnis */
  planarFaces(partId) {
    const r = this.results.get(partId);
    if (!r) return [];
    return r.bodies.flatMap((b) => (b.mesh?.faces || []).filter((f) => f.type === "PLANE" && f.normal && f.point));
  }
  /** Ebene und zylindrische Flächen (mit Achse) für Abhängigkeiten */
  assemblyFaces(partId) {
    const d = this.doc(partId);
    if (d?.kind === "assembly") return flattenAssembly(d, (id) => this.doc(id)).flatMap((o) => this.assemblyFaces(o.part.id).map((f) => transformFace(f, o.matrix)));
    const r = this.results.get(partId);
    if (!r) return [];
    return r.bodies.flatMap((b) => (b.mesh?.faces || []).filter((f) => (f.type === "PLANE" && f.normal && f.point) || (f.type === "CYLINDER" && f.axisD)));
  }
  solveAssemblyConstraints(asm) {
    if (!asm.constraints?.length) { this.asmErrors = {}; return; }
    const res = solveAssembly(asm, (pid) => this.assemblyFaces(pid), (g) => safeNum(g));
    this.asmErrors = res.errors;
    if (res.changed) { this.dirty = true; this.updateTitle(); }
  }
  // ---------- Messen ----------
  beginMeasure() {
    if (this.mode !== "part" && this.mode !== "assembly") return;
    this.pick = { kind: "measure" };
    this.measure = { hits: [] };
    this.viewer.setSelectionHits([]);
    this.setHint("Messen: Fläche, Kante oder Ecke anklicken, dann optional ein zweites Element – Esc beendet");
    this.props.render();
    this.ribbon.render();
  }
  async measurePick(hit) {
    const m = this.measure;
    if (!hit || hit.info?.idx === undefined) { m.hits = []; m.result = null; m.error = hit ? "Dieses Element lässt sich nicht messen" : null; }
    else {
      const same = (a) => a.kind === hit.kind && a.key === hit.key && a.body === hit.body && (a.edge ?? a.face) === (hit.edge ?? hit.face) && a.end === hit.end;
      if (m.hits.length >= 2 || m.hits.some(same)) m.hits = [];
      m.hits.push(hit);
    }
    this.viewer.setSelectionHits(m.hits);
    if (!m.hits.length) { this.props.render(); return; }
    const items = m.hits.map((x) => this.measureItem(x)).filter(Boolean);
    m.busy = true; m.error = null;
    this.props.render();
    const ticket = (m.ticket = (m.ticket || 0) + 1);
    try {
      const r = await this.kernel.call("measure", { items });
      if (this.measure !== m || m.ticket !== ticket) return;
      m.result = r;
    } catch (e) {
      if (this.measure !== m || m.ticket !== ticket) return;
      m.result = null;
      m.error = "Messen fehlgeschlagen: " + e.message;
    }
    m.busy = false;
    this.props.render();
  }
  /** Pick-Treffer → Messauftrag für den Kern (Bauteil oder platzierte Komponente) */
  measureItem(hit) {
    const d = this.activeDoc();
    const base = { body: hit.body, kind: hit.kind, idx: hit.info.idx, end: hit.end };
    if (d.kind === "part") return { ...base, part: d };
    const c = d.components.find((x) => "comp:" + x.id === hit.key);
    const inner = hit.group?.userData?.inner;
    if (c && hit.group?.userData?.leaf) {
      // Bauteil in einer Unterbaugruppe: Gesamt-Platzierung zerlegen
      const pl = decomposePlacement(matMul(placementMatrix(c.pos, c.rot), inner || IDENT4));
      return { ...base, part: this.doc(hit.group.userData.leaf), pos: pl.pos, rot: pl.rot };
    }
    const p = c && this.doc(c.part);
    return p ? { ...base, part: p, pos: c.pos, rot: c.rot } : null;
  }

  cancelPick() {
    if (this.pick?.kind === "measure") { this.measure = null; this.ribbon.render(); }
    if (this.pick?.feature) { this._editingFeature = null; this.rebuild(); }
    this.pick = null;
    this.align = this.align ? { mode: this.align.mode, gap: this.align.gap } : null;
    this.viewer.clearPlanes();
    this.setHint("");
    this.refreshSelectionHits();
    this.props.render();
  }

  // ---------- Einstellungen ----------
  /** Benutzereinstellungen anwenden. Ändert nie das Modell, nur Anzeige und Bedienung. */
  applyPrefs(keys) {
    const p = this.prefs;
    if (!keys || keys.includes("darstellung.schema")) this.applyTheme();
    if (!keys || keys.includes("oberflaeche.layout")) this.docking.apply();
    if (!keys || keys.includes("material.eigene")) { this.syncMaterials(); if (keys && this.activeDoc()) this.rebuild(); } // Farbe/Dichte neu
    this.viewer.applyPrefs(p.values);
    this.sketcher.applyPrefs(p.values);
    if (!keys || keys.includes("darstellung.skalierung")) window.werkcad?.setZoom?.(p.get("darstellung.skalierung") / 100);
    if (keys?.includes("ansicht.qualitaet") && this.quality !== p.get("ansicht.qualitaet")) { this.quality = p.get("ansicht.qualitaet"); this.ribbon.render(); this.rebuild(); }
    if (!keys || keys.includes("werkzeuge.kuerzel")) this.commands.update();
    if (keys) { this.refreshSelectionHits(); this.props.render(); this.updateStatus(); this.ribbon.render(); }
  }

  /** Eigene Werkstoffe an Rechnung und Kernel geben (Farbe im STEP) */
  syncMaterials() {
    const user = this.prefs.get("material.eigene") || [];
    setUserMaterials(user);
    this.kernel?.call("materials", { user, project: this.project?.materials || [] }).catch(() => {});
  }
  /** Eigene Werkstoffe, die das Projekt benutzt, als Kopie in die Datei */
  embedMaterials() {
    const copies = projectMaterialCopies(this.project);
    if (copies.length) this.project.materials = copies; else delete this.project.materials;
  }
  /** Farbschema setzen (hell/dunkel/wie System); „System“ folgt Windows auch während der Sitzung */
  applyTheme() {
    const mode = this.prefs.get("darstellung.schema");
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq && !this.themeListener) { this.themeListener = () => { if (this.prefs.get("darstellung.schema") === "system") { this.applyTheme(); this.viewer.applyPrefs(this.prefs.values); } }; mq.addEventListener?.("change", this.themeListener); }
    const dark = mode === "dunkel" || (mode === "system" && !!mq?.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  // ---------- Oberfläche ----------
  refreshAll() {
    this.ribbon.render();
    this.tree.render();
    this.props.render();
    this.updateTitle();
    this.updateStatus();
  }
  updateTitle() {
    const name = this.filePath ? this.filePath.split(/[\\/]/).pop() : this.project.name;
    document.title = `${this.dirty ? "• " : ""}${name}${this.readOnly ? " [schreibgeschützt]" : ""} – PBCAD`;
    window.werkcad?.setTitle?.(document.title);
    this.ribbon.renderDocLabel?.();
  }
  setHint(text) {
    this.hint = text;
    this.updateStatus();
  }
  setBusy(n, msg) {
    this.busy = n;
    if (msg) toast(msg, { kind: "err" });
    this.updateStatus();
  }
  updateStatus() {
    if (!this.statusEl || !this.ribbon) return;
    const d = this.activeDoc();
    const parts = [];
    if (this.busy) parts.push(h("span", { class: "busy" }, "Berechne…"));
    if (this.stale) parts.push(h("button", { class: "status-btn stale", title: "Automatisches Neuberechnen ist aus (Einstellungen → CAD-Kernel)", onclick: () => this.rebuildNow() }, `Nicht aktuell – neu berechnen (${this.commands?.label("model.rebuild") || "F5"})`));
    parts.push(h("span", { class: "grow" }, this.hint || defaultHint(this.mode, this.prefs.get("ansicht.maus"))));
    if (d?.kind === "part") {
      const r = this.results.get(d.id);
      if (r) {
        parts.push(h("span", {}, "Masse ", h("span", { class: "num" }, fmtNum(bodiesMass(r.bodies, materialOf(d.material).density), 3) + " kg")));
        parts.push(h("span", {}, "Körper ", h("span", { class: "num" }, String(r.bodies.length))));
        const errs = Object.values(r.status).filter((s) => !s.ok).length;
        if (errs) parts.push(h("span", { style: { color: "var(--err)" } }, `${errs} Fehler`));
      }
    }
    if (this.viewer?.hidden.size && (this.mode === "part" || this.mode === "assembly")) parts.push(h("button", { class: "status-btn", title: "Alle einblenden", onclick: () => this.showAllBodies() }, `${this.viewer.hidden.size} ausgeblendet`));
    if (this.mode === "part" && this.selHits?.length > 1) parts.push(h("span", {}, `${this.selHits.length} gewählt`));
    if (this.selFilter !== "alles" && this.mode === "part") parts.push(h("span", {}, "Filter: " + (this.selFilter === "flaechen" ? "nur Flächen" : "nur Kanten")));
    parts.push(h("span", {}, "mm · Grad"));
    this.statusEl.replaceChildren(...parts);
  }
  buildViewTools() {
    const mk = (label, run, title) => h("button", { onclick: run, title }, label);
    this.viewTools = h("div", { class: "view-tools" },
      mk("Iso", () => this.viewer.setView("iso"), "Isometrische Ansicht"),
      mk("Vorne", () => this.viewer.setView("front")),
      mk("Oben", () => this.viewer.setView("top")),
      mk("Rechts", () => this.viewer.setView("right")),
      mk("Alles", () => this.viewer.fit(), "Alles zeigen (F6)"),
      mk("Auswahl", () => this.zoomToSelection(), "Auswahl zeigen"),
      this.clipBar = h("span", { class: "clip-bar", hidden: true }));
    document.getElementById("stage").append(this.viewTools);
  }
  // ---------- Ansicht ----------
  /** Schlüssel für Ausblenden: in Baugruppen die ganze Komponente, im Bauteil der Körper */
  hideKey(hit) { return this.mode === "assembly" ? hit.key + "#*" : hit.key + "#" + hit.body; }
  hideHit(hit) {
    if (!hit) return;
    this.viewer.setHidden([...this.viewer.hidden, this.hideKey(hit)]);
    this.selHits = this.selHits.filter((x) => !this.viewer.isHidden(x.key, x.body));
    this.refreshSelectionHits();
    this.updateStatus();
  }
  isolateHit(hit) {
    if (!hit) return;
    const keep = this.hideKey(hit);
    const all = new Set(this.viewer.pickables.map((p) => (this.mode === "assembly" ? p.key + "#*" : p.key + "#" + p.body)));
    all.delete(keep);
    this.viewer.setHidden(all);
    this.updateStatus();
  }
  showAllBodies() { this.viewer.setHidden([]); this.updateStatus(); }
  setSelFilter(f) {
    this.selFilter = f;
    if (f === "flaechen") this.selHits = this.selHits.filter((x) => x.kind === "face");
    if (f === "kanten") this.selHits = this.selHits.filter((x) => x.kind === "edge");
    this.refreshSelectionHits();
    this.ribbon.render();
    this.props.render();
  }
  /** Blick senkrecht auf die gewählte ebene Fläche */
  viewNormalToFace() {
    const hit = (this.viewer.selectedHits || []).find((x) => x.kind === "face" && x.info?.type === "PLANE" && x.normal);
    if (!hit) return toast("Zuerst eine ebene Fläche anklicken");
    this.viewer.lookAlongNormal(hit.info.normal || hit.normal, hit.point);
  }
  // ---------- Benannte Ansichten (im Bauteil bzw. in der Baugruppe gespeichert) ----------
  namedViewsDoc() {
    const d = this.activeDoc();
    return d && (d.kind === "part" || d.kind === "assembly") && !this.viewer.sketchFrame ? d : null;
  }
  async saveNamedView() {
    const d = this.namedViewsDoc();
    if (!d) return toast("Benannte Ansichten gibt es im Bauteil und in der Baugruppe (nicht beim Skizzieren)");
    const st = this.viewer.viewState();
    const list = d.namedViews || [];
    const name = await promptDialog("Ansicht speichern", "Name", `Ansicht ${list.length + 1}`, { ok: "Speichern", validate: (v) => (v ? null : "Bitte einen Namen eingeben") });
    if (!name) return;
    this.edit("Ansicht speichern", () => {
      const arr = d.namedViews || (d.namedViews = []);
      const i = arr.findIndex((v) => v.name === name);
      if (i >= 0) arr[i] = { name, ...st }; else arr.push({ name, ...st });
    }, { rebuild: false });
    this.ribbon.render();
    toast(`Ansicht »${name}« gespeichert`);
  }
  showNamedView(name) {
    const v = this.namedViewsDoc()?.namedViews?.find((x) => x.name === name);
    if (v) this.viewer.applyViewState(v);
    return !!v;
  }
  deleteNamedView(name) {
    const d = this.namedViewsDoc();
    if (!d?.namedViews) return;
    this.edit("Ansicht löschen", () => { d.namedViews = d.namedViews.filter((v) => v.name !== name); if (!d.namedViews.length) delete d.namedViews; }, { rebuild: false });
    this.ribbon.render();
  }
  namedViewsMenu(e) {
    const d = this.namedViewsDoc();
    const list = d?.namedViews || [];
    const r = e?.currentTarget?.getBoundingClientRect?.() || { left: innerWidth / 2, bottom: 120 };
    contextMenu(r.left, r.bottom + 2, [
      ...list.map((v) => ({ label: v.name, icon: "view", run: () => this.showNamedView(v.name) })),
      list.length ? "-" : null,
      { label: "Aktuelle Ansicht speichern…", icon: "plus", disabled: !d, run: () => this.saveNamedView() },
      ...list.map((v) => ({ label: `»${v.name}« löschen`, icon: "trash", run: () => this.deleteNamedView(v.name) })),
    ]);
  }
  zoomToSelection() {
    const hits = this.viewer.selectedHits || [];
    if (!hits.length) return toast("Nichts ausgewählt – »Alles zeigen« mit F6");
    this.viewer.fitHits(hits);
  }
  /** Schnittebene senkrecht zur Achse; zweiter Klick auf dieselbe Achse schaltet ab */
  toggleClip(axis) {
    const v = this.viewer;
    if (v.clip?.axis === axis) { v.setClip(null); this.renderClipBar(); this.ribbon.render(); return; }
    const bb = v.contentBox();
    const k = { X: "x", Y: "y", Z: "z" }[axis];
    const mid = bb.isEmpty() ? 0 : (bb.min[k] + bb.max[k]) / 2;
    v.setClip({ axis, offset: Math.round(mid * 100) / 100, flip: false, min: bb.isEmpty() ? -100 : bb.min[k], max: bb.isEmpty() ? 100 : bb.max[k] });
    this.renderClipBar();
    this.ribbon.render();
  }
  renderClipBar() {
    const c = this.viewer.clip;
    this.clipBar.hidden = !c;
    if (!c) return this.clipBar.replaceChildren();
    const num = h("input", { class: "inp num", value: String(c.offset).replace(".", ","), title: "Lage der Schnittebene in mm", style: { width: "70px" } });
    const range = h("input", { type: "range", min: String(c.min), max: String(c.max), step: String(Math.max(0.01, (c.max - c.min) / 500)), value: String(c.offset), title: "Schnittebene verschieben" });
    const set = (o) => { this.viewer.setClip({ ...this.viewer.clip, offset: o }); num.value = String(Math.round(o * 100) / 100).replace(".", ","); range.value = String(o); };
    range.addEventListener("input", () => set(Number(range.value)));
    num.addEventListener("change", () => {
      const o = Number(num.value.replace(",", "."));
      if (!Number.isFinite(o)) { num.classList.add("bad"); return; }
      num.classList.remove("bad");
      set(o);
    });
    this.clipBar.replaceChildren(h("b", {}, `Schnitt ${c.axis}`), range, num, h("span", {}, "mm"),
      h("button", { title: "Andere Seite zeigen", onclick: () => { this.viewer.setClip({ ...this.viewer.clip, flip: !this.viewer.clip.flip }); } }, "Seite"),
      h("button", { title: "Schnitt aus", onclick: () => this.toggleClip(c.axis) }, "×"));
  }
  refreshRibbon() { this.ribbon.render(); }

  bindKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      const tag = e.target.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;
      // Strg-Kürzel für Datei/Einstellungen/Suche auch aus Eingabefeldern; alles andere nicht
      if (typing) { this.commands.handle(e, { typing: true }); return; }
      if (this.mode === "sketch" && this.sketcher.key(e)) { e.preventDefault(); return; }
      if (this.mode === "drawing" && this.drawing.key(e)) { e.preventDefault(); return; }
      if (e.key === "Escape") {
        if (this.pick) { this.cancelPick(); return; }
        if (this.sel) { this.sel = null; this.selHits = []; this.refreshSelectionHits(); this.tree.render(); this.props.render(); }
        return;
      }
      if (e.key === "Delete") {
        if (this.sel?.type === "feature") this.deleteFeature(this.sel.id);
        else if (this.sel?.type === "component") this.props.deleteComponent(this.sel.id);
        else if (this.sel?.type === "constraint") this.props.deleteConstraint(this.sel.id);
        return;
      }
      this.commands.handle(e, { typing: false });
    });
  }
}

export const CONSTRAINT_NAMES = { gegen: "Fläche an Fläche", buendig: "Bündig", konzentrisch: "Konzentrisch" };
export const FEATURE_NAMES = {
  sketch: "Skizze", extrude: "Extrusion", revolve: "Drehung", hole: "Bohrung", profile: "Profil", frame: "Rahmen", knickrahmen: "Knickrahmen", profilzug: "Profilzug 3D", biegerohr: "Rohr gebogen", regelkoerper: "Regelkörper", normteil: "Normteil", kantteil: "Kantteil", platte: "Anschlussplatte", rippe: "Rippe", naht: "Schweißnaht", generator: "Generator", emboss: "Prägen",
  fillet: "Rundung", chamfer: "Fase", shell: "Wandung", pattern: "Muster", mirror: "Spiegelung", import: "Import",
};

/** Welche Bedingungen nicht erfüllbar sind, in Klartext (rot markiert in der Skizze) */
function conflictText(sk, r) {
  const names = (r.failed || []).map((id) => sk?.constraints.find((c) => c.id === id)).filter(Boolean).map(constraintLabel);
  if (!names.length) return "Skizze nicht lösbar – zuletzt geänderte Maße prüfen";
  const uniq = [...new Set(names)];
  return `Widerspruch – nicht erfüllbar: ${uniq.slice(0, 4).join(", ")}${uniq.length > 4 ? ` (+${uniq.length - 4})` : ""}. Rot markierte Bedingung löschen oder Maß ändern.`;
}
function defaultHint(mode, mouse) {
  switch (mode) {
    case "part": return mouse === "mitte-drehen"
      ? "Mittlere Taste: drehen · rechte Taste: schwenken · Rad: zoomen · Klick: Fläche/Kante wählen"
      : "Mittlere Taste: schwenken · Umschalt+Mitte oder rechte Taste: drehen · Rad: zoomen · Klick: Fläche/Kante wählen";
    case "assembly": return "Bauteil anklicken zum Auswählen · Rechtsklick: Bauteil platzieren";
    case "sketch": return "Werkzeug wählen · Esc beendet Werkzeug bzw. Skizze";
    case "drawing": return "Ansicht ziehen zum Verschieben · Mausrad: zoomen · mittlere Taste: schwenken";
    default: return "";
  }
}
const r6 = (x) => Math.round(x * 1e6) / 1e6;
function safeNum(g) { try { return evaluate(String(g ?? "0"), {}); } catch { return 0; } }
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export { matApply, matApplyDir, BASE_PLANES };

const IDENT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Flächen-Info (Ebene oder Zylinder) mit einer Platzierungsmatrix umrechnen */
function transformFace(f, m) {
  const o = { ...f };
  if (f.point) o.point = matApply(m, f.point);
  if (f.normal) o.normal = matApplyDir(m, f.normal);
  if (f.axisP) o.axisP = matApply(m, f.axisP);
  if (f.axisD) o.axisD = matApplyDir(m, f.axisD);
  return o;
}
/** Info eines Treffers im System der (obersten) Komponente – bei Bauteilen in Unterbaugruppen umgerechnet */
function innerInfo(hit) {
  const m = hit.group?.userData?.inner;
  return m && hit.info ? transformFace(hit.info, m) : hit.info;
}
