// Anwendungssteuerung: Projektzustand, Rückgängig, Neuaufbau, Auswahl, Modi
import { Viewer } from "./viewer.js";
import { Sketcher } from "./sketcher.js";
import { KernelClient } from "./kernel.js";
import { Ribbon } from "./ribbon.js";
import { Tree } from "./tree.js";
import { Props } from "./props.js";
import { DrawingEditor } from "./drawing.js";
import { Files } from "./files.js";
import { StartScreen } from "./start.js";
import { h, toast, confirmDialog, contextMenu, fmtNum } from "./dom.js";
import { newProject, newPart, newAssembly, newDrawing, exampleProject, uid } from "../core/examples.js";
import { newSketch } from "../core/sketch.js";
import { planeFromFace, planeFrame, BASE_PLANES, placementMatrix, decomposePlacement, alignFaces, matApply, matApplyDir } from "../core/geom.js";
import { MATERIALS } from "../core/sections.js";
import { resolveParams, evaluate } from "../core/expr.js";

export class App {
  constructor() {
    this.project = newProject();
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
    this.quality = "normal";
    this.fittedFor = null;

    this.kernel = new KernelClient((busy, msg) => this.setBusy(busy, msg));
    this.viewer = new Viewer(document.getElementById("viewer"));
    this.sketcher = new Sketcher(this);
    this.files = new Files(this);
    this.ribbon = new Ribbon(this);
    this.tree = new Tree(this);
    this.props = new Props(this);
    this.drawing = new DrawingEditor(this);
    this.start = new StartScreen(this);
    this.statusEl = document.getElementById("status");
    this.hud = document.getElementById("hud");
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
    document.getElementById("workspace").classList.toggle("no-browser", start);
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
  newPart(name) {
    const n = this.parts().length + 1;
    return this.addDoc(newPart(name || `Bauteil ${n}`));
  }
  newAssembly() { return this.addDoc(newAssembly(`Baugruppe ${this.project.docs.filter((d) => d.kind === "assembly").length + 1}`)); }
  newDrawing(source) {
    const src = source || (this.activeDoc() && this.activeDoc().kind !== "drawing" ? { kind: this.activeDoc().kind, id: this.activeId } : null);
    const name = src ? "Zeichnung " + this.doc(src.id).name : "Zeichnung";
    const d = newDrawing(name, src);
    if (src) {
      const sd = this.doc(src.id);
      d.title.benennung = sd.name;
      d.title.nummer = sd.number || "";
      d.title.werkstoff = sd.kind === "part" ? MATERIALS[sd.material]?.label || "" : "";
      d.pendingAutoViews = true;
    }
    return this.addDoc(d);
  }
  async deleteDoc(id) {
    const d = this.doc(id);
    if (!d) return;
    const users = this.project.docs.filter((x) => (x.kind === "assembly" && x.components.some((c) => c.part === id)) || (x.kind === "drawing" && x.source?.id === id));
    const extra = users.length ? ` Es wird verwendet in: ${users.map((u) => u.name).join(", ")}.` : "";
    if (!(await confirmDialog("Dokument löschen", `»${d.name}« wirklich löschen?${extra}`, { ok: "Löschen", danger: true }))) return;
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
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.results.clear();
    this.activeId = null;
    const first = prj.docs.find((d) => d.kind === "assembly") || prj.docs[0];
    if (first) this.openDoc(first.id);
    else { this.setMode("start"); this.refreshAll(); }
    this.updateTitle();
  }
  async newProject() {
    if (!(await this.files.confirmDiscard())) return;
    this.setProject(newProject());
    this.newPart("Bauteil 1");
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
    this.updateTitle();
    this.files.autosave();
    this.tree.render();
    this.props.render();
    this.ribbon.render();
    if (rebuild) this.rebuild();
  }
  /** Bequeme Variante: Änderung mit Rückgängig-Punkt */
  edit(label, fn, opts) {
    this.checkpoint(label);
    fn();
    this.changed(opts);
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
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.doRebuild(), 90);
  }
  async buildPart(part) {
    const res = await this.kernel.build(part, this.quality);
    this.results.set(part.id, { ...res, hash: JSON.stringify(part).length });
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
        const ids = [...new Set(d.components.map((c) => c.part))];
        const results = await Promise.all(ids.map((id) => this.doc(id) ? this.buildPart(this.doc(id)) : null));
        if (this.activeId !== d.id) return;
        this.showAssembly(d);
        results.forEach((r) => r);
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
  partColor(part) { return part.color || MATERIALS[part.material]?.color || "#8d99a6"; }
  showPart(part, res) {
    if (this.mode === "sketch") {
      // im Skizzenmodus Modell halbtransparent hinter der Skizze
      this.viewer.showPart(res.bodies, { color: this.partColor(part), opacity: 0.35 });
    } else this.viewer.showPart(res.bodies, { color: this.partColor(part) });
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
    const comps = asm.components.map((c) => {
      const p = this.doc(c.part);
      const r = this.results.get(c.part);
      return { id: c.id, partKey: c.part, bodies: r?.bodies, color: p ? this.partColor(p) : "#999", pos: c.pos, rot: c.rot, opacity: c.hidden ? 0 : 1 };
    }).filter((c) => c.opacity > 0);
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
    if (!part || part.kind !== "part") return;
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
    if (!part?.features.some((f) => f.id === id)) return;
    this.pick = null;
    this.viewer.clearPlanes();
    this.sel = { type: "feature", id };
    this.setMode("sketch");
    this.sketcher.start(id);
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
    this.rebuild();
    if (!silent) {
      const part = this.activeDoc();
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
      h("span", {}, "  ·  "),
      h("span", {}, regions ? `${regions} geschlossene Kontur${regions > 1 ? "en" : ""}` : "keine geschlossene Kontur"),
      errs.length ? h("div", { style: { color: "var(--err)" } }, errs[0]) : null,
      r && !r.ok ? h("div", { style: { color: "var(--err)" } }, "Bemaßung widersprüchlich – zuletzt geänderte Maße prüfen") : null));
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
    if (!part || part.kind !== "part") return;
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
    const deps = part.features.filter((g) => g.sketch === id || g.feature === id);
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
    cv.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
      const b = down.b;
      down = null;
      if (moved) return;
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
    if (p?.kind === "faces" || p?.kind === "sketchPlane" || p?.kind === "align") return { edges: false, faces: true };
    if (this.mode === "assembly") return { edges: false, faces: true };
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
    if (this.mode === "assembly" && this.pick?.kind !== "align") this.viewer.highlight([{ kind: "group", key: hit.key }]);
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
      const same = (a) => a.kind === hit.kind && a.key === hit.key && a.body === hit.body && (a.edge ?? a.face) === (hit.edge ?? hit.face);
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
    items.push("-", { label: "Alles zeigen", icon: "fit", kbd: "F6", run: () => this.viewer.fit() }, { label: "Iso-Ansicht", run: () => this.viewer.setView("iso") });
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
    this.align = { mode, gap: this.align?.gap || "0" };
    this.pick = { kind: "align" };
    this.setHint("Fläche am Bauteil anklicken, das bewegt werden soll");
    this.props.render();
  }
  alignPick(hit) {
    if (!hit || hit.kind !== "face" || !hit.key.startsWith("comp:")) return;
    const cid = hit.key.slice(5);
    const nrm = hit.info?.type === "PLANE" ? hit.normal : hit.normal;
    if (!this.align.first) {
      this.align.first = { cid, point: hit.point, normal: nrm, hit };
      this.refreshSelectionHits();
      this.setHint("Zielfläche an einem anderen Bauteil anklicken");
      return;
    }
    if (cid === this.align.first.cid) return toast("Bitte eine Fläche an einem anderen Bauteil wählen");
    const asm = this.activeDoc();
    const comp = asm.components.find((c) => c.id === this.align.first.cid);
    if (comp.fixed) { toast("Dieses Bauteil ist fixiert"); this.cancelPick(); return; }
    const mB = placementMatrix(comp.pos, comp.rot);
    let gap = 0;
    try { gap = evaluate(this.align.gap || "0", {}); } catch { /* */ }
    const m = alignFaces(mB, this.align.first.point, this.align.first.normal, hit.point, nrm, this.align.mode, gap);
    const d = decomposePlacement(m);
    this.edit("Ausrichten", () => { comp.pos = d.pos; comp.rot = d.rot; });
    this.align = { mode: this.align.mode, gap: this.align.gap };
    this.pick = null;
    this.setHint("");
    this.sel = { type: "component", id: comp.id };
    this.props.render();
  }
  cancelPick() {
    if (this.pick?.feature) { this._editingFeature = null; this.rebuild(); }
    this.pick = null;
    this.align = this.align ? { mode: this.align.mode, gap: this.align.gap } : null;
    this.viewer.clearPlanes();
    this.setHint("");
    this.refreshSelectionHits();
    this.props.render();
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
    document.title = `${this.dirty ? "• " : ""}${name} – WerkCAD`;
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
    const d = this.activeDoc();
    const parts = [];
    if (this.busy) parts.push(h("span", { class: "busy" }, "Berechne…"));
    parts.push(h("span", { class: "grow" }, this.hint || defaultHint(this.mode)));
    if (d?.kind === "part") {
      const r = this.results.get(d.id);
      if (r) {
        const vol = r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0);
        const dens = MATERIALS[d.material]?.density || 7.85;
        parts.push(h("span", {}, "Masse ", h("span", { class: "num" }, fmtNum((vol * dens) / 1e6, 3) + " kg")));
        parts.push(h("span", {}, "Körper ", h("span", { class: "num" }, String(r.bodies.length))));
        const errs = Object.values(r.status).filter((s) => !s.ok).length;
        if (errs) parts.push(h("span", { style: { color: "var(--err)" } }, `${errs} Fehler`));
      }
    }
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
      mk("Alles", () => this.viewer.fit(), "Alles zeigen (F6)"));
    document.getElementById("stage").append(this.viewTools);
  }
  refreshRibbon() { this.ribbon.render(); }

  bindKeys() {
    document.addEventListener("keydown", (e) => {
      const tag = e.target.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); this.files.save(e.shiftKey); return; }
      if (ctrl && e.key.toLowerCase() === "o") { e.preventDefault(); this.files.open(); return; }
      if (ctrl && e.key.toLowerCase() === "n") { e.preventDefault(); this.newProject(); return; }
      if (typing) return;
      if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (ctrl && e.key.toLowerCase() === "y") { e.preventDefault(); this.redo(); return; }
      if (this.mode === "sketch" && this.sketcher.key(e)) { e.preventDefault(); return; }
      if (this.mode === "drawing" && this.drawing.key(e)) { e.preventDefault(); return; }
      if (e.key === "Escape") {
        if (this.pick) { this.cancelPick(); return; }
        if (this.sel) { this.sel = null; this.selHits = []; this.refreshSelectionHits(); this.tree.render(); this.props.render(); }
        return;
      }
      if (e.key === "F6") { e.preventDefault(); this.viewer.fit(); return; }
      if (e.key === "Delete") {
        if (this.sel?.type === "feature") this.deleteFeature(this.sel.id);
        else if (this.sel?.type === "component") this.props.deleteComponent(this.sel.id);
        return;
      }
      if (this.mode === "part" && !ctrl) {
        const k = e.key.toLowerCase();
        if (k === "s") this.beginSketchCreation();
        if (k === "e") this.ribbon.run("extrude");
        if (k === "h") this.ribbon.run("hole");
      }
    });
  }
}

export const FEATURE_NAMES = {
  sketch: "Skizze", extrude: "Extrusion", revolve: "Drehung", hole: "Bohrung", profile: "Profil", frame: "Rahmen",
  fillet: "Rundung", chamfer: "Fase", shell: "Wandung", pattern: "Muster", mirror: "Spiegelung", import: "Import",
};

function defaultHint(mode) {
  switch (mode) {
    case "part": return "Mittlere Taste: schwenken · Umschalt+Mitte oder rechte Taste: drehen · Rad: zoomen · Klick: Fläche/Kante wählen";
    case "assembly": return "Bauteil anklicken zum Auswählen · Rechtsklick: Bauteil platzieren";
    case "sketch": return "Werkzeug wählen · Esc beendet Werkzeug bzw. Skizze";
    case "drawing": return "Ansicht ziehen zum Verschieben · Mausrad: zoomen · mittlere Taste: schwenken";
    default: return "";
  }
}
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export { matApply, matApplyDir, BASE_PLANES };
