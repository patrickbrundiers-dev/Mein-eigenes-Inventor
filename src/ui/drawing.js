// Zeichnungsableitung: Blatt, Ansichten (Projektionsmethode 1 / DIN ISO 5456-2), Bemaßung, Schriftfeld, Export
import { templateOf, extraFields, LINE_GROUPS, DIM_TEXT_SIZES, MAX_EXTRA, validateTemplate } from "../core/zeichnungsvorlage.js";
import { chainDims, alignRows, clockwiseOrder, alignBalloons, arcLength } from "../core/bemassung.js";
import { h, svgEl, toast, modal, promptDialog, fmtNum, downloadBlob } from "./dom.js";
import { classOf, toleranceText, validateTolerance, TOL_KINDS } from "../core/tolerance.js";
import { partMass } from "../core/mass.js";
import { DxfWriter } from "../core/dxf.js";
import { materialOf, materialList } from "../core/materials.js";
import { finishLabel } from "../core/oberflaeche.js";
import { uid } from "../core/examples.js";
import { scaleLabel } from "./tree.js";
import { v3, matApply, matApplyDir, placementMatrix, decomposePlacement } from "../core/geom.js";
import { flattenAssembly } from "../core/subasm.js";
import { assemblyForView, viewStateKey } from "../core/darstellungen.js";
import { hatchLines } from "../core/hatch.js";
import { balloonAnchors, placeBalloons, projectPoint } from "../core/balloons.js";
import { gridViewSvg } from "./achsraster.js";
import { weldSymbol } from "../core/weld.js";
import { clipProjection } from "../core/clip.js";
import { planAutoDims, viewAxes, visibleHidden, layoutAutoDims, LEAD, textWidth, dimLabel, holeSpecs, profileSpec, chooseViews, wallThickness, circlesFromLines } from "../core/autodims.js";
import { angleValue, cleanupDrawing, angleFromSegments } from "../core/aufraeumen.js";
import { bomRows } from "./props.js";
import { evaluate, resolveParams } from "../core/expr.js";
import { bendNote, bendTableCells } from "../core/blech.js";
import { sheetFlatView } from "../core/blechplus.js";
import { bendRule } from "../core/bendtable.js";
import { SURFACE_KINDS, GDT_KINDS, surfaceSymbol, validateSurface, gdtFrame, validateGdt, datumSymbol, validateDatumLetter } from "../core/symbole.js";
import { breakMap, clipBreaks, clipLoopsBreaks, zigzag, composeBreakout, depthRange } from "../core/bruch.js";
import { HATCH_STYLES, holeTable, holeCircles, holeTableCells, nearestSegment, auxiliaryCamera, noteSuggestion, nextRevision, validateRevision, currentRevision, hatchStyle, axisLines, sheetZones, projectedCamera, camType, layoutBaseViews, parseScale } from "../core/zeichnung.js";

export const SHEETS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
export const CAMS = {
  front: { dir: [0, 1, 0], up: [0, 0, 1], label: "Vorderansicht" },
  top: { dir: [0, 0, -1], up: [0, 1, 0], label: "Draufsicht" },
  left: { dir: [1, 0, 0], up: [0, 0, 1], label: "Seitenansicht von links" },
  right: { dir: [-1, 0, 0], up: [0, 0, 1], label: "Seitenansicht von rechts" },
  back: { dir: [0, -1, 0], up: [0, 0, 1], label: "Rückansicht" },
  bottom: { dir: [0, 0, 1], up: [0, -1, 0], label: "Untersicht" },
  iso: { dir: [-1, 1, -1], up: [0, 0, 1], label: "Isometrie" },
};
const SCALES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]; // ISO 5455
const LW = { vis: 0.5, hid: 0.25, thin: 0.18, frame: 0.7 };

export class DrawingEditor {
  constructor(app) {
    this.app = app;
    this.stage = document.getElementById("drawing-stage");
    this.proj = new Map(); // viewId -> Projektion
    this.sel = null;
    this.tool = null;
    this.zoom = 1;
    this.pan = [20, 20];
    this.bindEvents();
  }
  get doc() { return this.offscreen || (this.app.activeDoc()?.kind === "drawing" ? this.app.activeDoc() : null); }
  /**
   * Blatt einer beliebigen Zeichnung als SVG- und DXF-Text, ohne sie zu öffnen (Fertigungsmappe). Fehlende Grundansichten und
   * Hauptmaße (pendingAutoViews/pendingAutoDims) werden dabei erzeugt.
   */
  async sheetExport(d) {
    const keep = this.proj;
    this.offscreen = d;
    this.proj = new Map();
    try {
      await this.update();
      const [width, height] = this.sheetSize(d);
      return { svg: this.exportSvgString(), dxf: this.dxfString(), width, height, name: this.fileBase() };
    } finally {
      this.offscreen = null;
      this.proj = keep;
    }
  }
  sheetSize(d = this.doc) {
    const [a, b] = SHEETS[d.sheet.format] || SHEETS.A3;
    return d.sheet.orientation === "hoch" ? [b, a] : [a, b];
  }
  open(d) {
    this.proj.clear();
    this.sel = null;
    this.tool = null;
    this.render();
    setTimeout(() => this.fitSheet(), 0);
  }
  close() { this.stage.replaceChildren(); this.svg = null; }

  // ---------- Quelle / Projektion ----------
  /** Darstellung einer Ansicht (FU8/FU9): eigene oder die der Elternansicht */
  viewState(d, v) {
    for (let x = v, k = 0; x && k < 20; x = x.parent && d.views.find((y) => y.id === x.parent), k++) if (x.state) return x.state;
    return null;
  }
  /** Auswahl Positionsdarstellung und Explosion für Ansichten von Baugruppen (FU8/FU9) */
  stateProps(P, d, v) {
    const app = this.app;
    const src = d.source && app.doc(d.source.id);
    if (src?.kind !== "assembly" || v.parent) return [];
    const st = v.state || {};
    const set = (label, fn) => app.edit(label, () => {
      const next = { ...(v.state || {}) };
      fn(next);
      if (!next.position) delete next.position;
      if (!next.explode) delete next.explode;
      if (Object.keys(next).length) v.state = next; else delete v.state;
      // abhängige Ansichten (projiziert, Schnitt) folgen der Elternansicht
      for (const c of d.views) if (c.parent === v.id) delete c.state;
    });
    const positions = src.positions || [];
    const steps = src.explosion?.steps || [];
    return [
      positions.length ? P.select("Position", [["", "Konstruktion (aktuell)"], ...positions.map((p) => [p.id, p.name])], st.position || "", (id) => set("Positionsdarstellung", (n) => { n.position = id; })) : null,
      steps.length ? P.check("Explodiert", !!st.explode, (on) => set("Explosion", (n) => { n.explode = on; })) : null,
      !positions.length && !steps.length ? h("p", { class: "hint" }, "Positionsdarstellungen und Explosionsschritte der Baugruppe lassen sich hier je Ansicht wählen.") : null,
    ].filter(Boolean);
  }
  sourceItems(d = this.doc, v = null) {
    const app = this.app;
    const src0 = d?.source && app.doc(d.source.id);
    if (!src0) return null;
    if (src0.kind === "part") return [{ part: src0, pos: [0, 0, 0], rot: [0, 0, 0] }];
    const st = v && this.viewState(d, v);
    const src = st ? assemblyForView(src0, { state: st }) : src0;
    if (src.kind === "assembly") return flattenAssembly(src, (id) => app.doc(id)).map((o) => ({ part: o.part, ...decomposePlacement(o.matrix), name: o.path.join(" / ") }));
    return null;
  }
  async update() {
    const d = this.doc;
    if (!d) return;
    const items = this.sourceItems(d);
    if (!items || !items.length) { this.render(); return; }
    if (d.pendingAutoViews) {
      delete d.pendingAutoViews;
      await this.autoViews({ silentUndo: true });
      if (d.pendingAutoDims) { delete d.pendingAutoDims; this.autoDims({ silent: true }); }
      return;
    }
    this.deriveFlats(d);
    const projected = d.views.filter((v) => v.type !== "detail" && v.type !== "flat");
    // Ansichten mit gleicher Darstellung (Position/Explosion, FU8/FU9) in einem Auftrag
    const groups = new Map();
    for (const v of projected) {
      const k = viewStateKey({ state: this.viewState(d, v) });
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(v);
    }
    const viewsOf = (list) => list.flatMap((v) => {
      const c = this.viewCam(d, v), hidden = v.hidden !== false && v.type !== "iso";
      // Ausbruch: je Bereich eine zweite Projektion mit Schnittebene in der gewählten Tiefe
      const bos = (v.breakouts || []).map((b, i) => ({ key: `${v.id}#bo${i}`, dir: c.dir, up: c.up, hidden, cut: { n: v3.mul(v3.norm(c.dir), -1), c: b.plane } }));
      return [{ key: v.id, dir: c.dir, up: c.up, cut: c.cut, hidden }, ...bos];
    });
    if (!projected.length) { this.render(); return; }
    this.loading = true;
    this.render();
    try {
      const res = {};
      for (const list of groups.values()) Object.assign(res, await this.app.kernel.call("project", { items: this.sourceItems(d, list[0]) || items, views: viewsOf(list) }));
      if (this.doc !== d) return;
      for (const [k, v] of Object.entries(res)) if (!k.includes("#")) this.proj.set(k, v);
      for (const v of d.views) if (v.breakouts?.length && res[v.id]) this.proj.set(v.id, composeBreakout(res[v.id], v.breakouts.map((b, i) => ({ c: b.c, r: b.r, proj: res[`${v.id}#bo${i}`] }))));
      this.deriveFlats(d);
      this.deriveDetails(d);
    } catch (e) {
      toast("Ansichten konnten nicht berechnet werden: " + e.message, { kind: "err" });
    }
    this.loading = false;
    this.render();
  }
  async autoViews({ silentUndo = false } = {}) {
    const d = this.doc;
    const items = this.sourceItems(d);
    if (!items?.length) return this.chooseSource();
    const types = ["front", "top", "left", "iso"];
    const views = types.map((t) => ({ key: "auto_" + t, dir: CAMS[t].dir, up: CAMS[t].up, hidden: t !== "iso" }));
    let res;
    try { res = await this.app.kernel.call("project", { items, views }); } catch (e) { return toast("Ansichten konnten nicht berechnet werden: " + e.message, { kind: "err" }); }
    const bb = (t) => res["auto_" + t]?.bbox || { x0: 0, y0: 0, x1: 100, y1: 100 };
    const W = (b) => b.x1 - b.x0, H = (b) => b.y1 - b.y0;
    const [sw, sh] = this.sheetSize(d);
    // nur die nötigen Ansichten: was eine Ansicht nicht zusätzlich zeigt, entfällt (z. B. Seitenansicht einer Platte)
    const src = d.source && this.app.doc(d.source.id);
    const profile = src?.kind === "part" ? profileSpec(src.features, (x) => evaluate(String(x), resolveParams(src.params || []).values)) : null;
    const camAxes = Object.fromEntries(["front", "top", "left"].map((t) => [t, viewAxes(CAMS[t].dir, CAMS[t].up)]));
    const keep = new Set(chooseViews({ front: res.auto_front, top: res.auto_top, left: res.auto_left }, camAxes, profile));
    const none = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const fw = bb("front"), tp = keep.has("top") ? bb("top") : none, lf = keep.has("left") ? bb("left") : none, iso = bb("iso");
    const gap = 22;
    const box = (b) => ({ w: W(b), h: H(b) });
    // Schriftfeld, bei Baugruppen mit Platz für die Stückliste darüber
    let tbH = 46 + (this.template().extra.length ? 9 : 0);
    if (src?.kind === "assembly") { try { tbH += 6 * (this.bomRowsOf(d).length + 1); } catch { /* ohne Stückliste */ } }
    const lay = layoutBaseViews({ front: box(fw), top: keep.has("top") ? box(tp) : null, left: keep.has("left") ? box(lf) : null, iso: box(iso) }, { W: sw, H: sh }, SCALES, { tb: { w: 180, h: tbH }, gap });
    const scale = lay?.scale || SCALES[SCALES.length - 1];
    const fx = lay ? lay.front.x : 20 + 10 + gap + (W(fw) * scale) / 2;
    const fy = lay ? lay.front.y : 10 + 10 + gap + (H(fw) * scale) / 2;
    const fid = uid("v");
    const nv = [
      { id: fid, type: "front", x: fx, y: fy, scale, hidden: true },
      { id: uid("v"), type: "top", x: fx, y: fy + (H(fw) * scale) / 2 + gap + (H(tp) * scale) / 2, scale, hidden: true, parent: fid },
      { id: uid("v"), type: "left", x: fx + (W(fw) * scale) / 2 + gap + (W(lf) * scale) / 2, y: fy, scale, hidden: true, parent: fid },
    ].filter((v) => keep.has(v.type));
    const isoScale = lay?.isoScale || scale * 0.6;
    const ic = lay?.iso || { x: sw - 10 - 15 - (W(iso) * isoScale) / 2, y: 10 + 10 + 15 + (H(iso) * isoScale) / 2 };
    nv.push({ id: uid("v"), type: "iso", x: ic.x, y: ic.y, scale: isoScale, hidden: false });
    for (const v of nv) {
      const r = res["auto_" + v.type];
      if (r) this.proj.set(v.id, r);
    }
    const apply = () => { d.views = nv; d.dims = []; d.title.massstab = scaleLabel(scale); };
    if (silentUndo) { apply(); this.app.changed({ rebuild: false }); }
    else this.app.edit("Grundansichten", apply, { rebuild: false });
    this.render();
  }
  async chooseSource() {
    const app = this.app;
    const opts = app.project.docs.filter((x) => x.kind === "part" || x.kind === "assembly");
    if (!opts.length) return toast("Kein Bauteil oder keine Baugruppe vorhanden");
    let chosen = opts[0].id;
    modal({
      title: "Was soll gezeichnet werden?",
      body: h("div", {}, ...opts.map((o) => h("label", { class: "chk" }, h("input", { type: "radio", name: "src", checked: o.id === chosen, onchange: () => { chosen = o.id; } }), `${o.name} (${o.kind === "part" ? "Bauteil" : "Baugruppe"})`))),
      buttons: [{ label: "Abbrechen" }, { label: "Übernehmen", primary: true, run: () => {
        const d = this.doc;
        const src = app.doc(chosen);
        app.edit("Quelle", () => {
          d.source = { kind: src.kind, id: src.id };
          d.title.benennung = d.title.benennung || src.name;
          d.title.nummer = d.title.nummer || src.number || "";
          d.pendingAutoViews = true;
        });
      } }],
    });
  }
  addViewDialog() {
    const d = this.doc;
    if (!this.sourceItems(d)?.length) return this.chooseSource();
    let type = "front";
    let scale = d.views[0]?.scale || 1;
    const sel = h("select", { class: "inp" }, ...Object.entries(CAMS).map(([k, c]) => h("option", { value: k }, c.label)));
    sel.addEventListener("change", () => { type = sel.value; });
    const sc = h("select", { class: "inp" }, ...SCALES.map((s) => h("option", { value: s, selected: Math.abs(s - scale) < 1e-9 ? true : undefined }, scaleLabel(s))));
    sc.addEventListener("change", () => { scale = Number(sc.value); });
    const own = h("input", { class: "inp", placeholder: "z. B. 1:25" });
    modal({
      title: "Ansicht hinzufügen",
      body: h("div", {}, h("div", { class: "field" }, h("label", {}, "Ansicht"), sel), h("div", { class: "field" }, h("label", {}, "Maßstab"), sc), h("div", { class: "field" }, h("label", {}, "oder eigener"), own), h("p", { class: "hint" }, "Die Ansicht wird in die Blattmitte gesetzt und kann danach verschoben werden.")),
      buttons: [{ label: "Abbrechen" }, { label: "Hinzufügen", primary: true, run: () => {
        if (own.value.trim()) {
          const k = parseScale(own.value);
          if (!k) { toast("Eigener Maßstab: bitte als 1:25 oder 3:1 eingeben", { kind: "err" }); return false; }
          scale = k;
        }
        const [sw, sh] = this.sheetSize(d);
        const v = { id: uid("v"), type, x: sw / 2, y: sh / 2 - 20, scale, hidden: type !== "iso" };
        this.app.edit("Ansicht hinzufügen", () => d.views.push(v), { rebuild: true });
        this.sel = { type: "view", id: v.id };
      } }],
    });
  }
  deleteView(id) {
    const d = this.doc;
    this.app.edit("Ansicht löschen", () => {
      const gone = new Set([id, ...d.views.filter((v) => ["section", "detail", "aux"].includes(v.type) && v.parent === id).map((v) => v.id)]);
      d.views = d.views.filter((v) => !gone.has(v.id));
      for (const v of d.views) if (gone.has(v.parent)) delete v.parent;
      d.dims = d.dims.filter((m) => !gone.has(m.view));
      if (d.holeTables) d.holeTables = d.holeTables.filter((t) => !gone.has(t.view));
      if (d.leaders) d.leaders = d.leaders.filter((t) => !gone.has(t.view));
      if (d.symbols) d.symbols = d.symbols.filter((t) => !gone.has(t.view));
    }, { rebuild: false });
    this.sel = null;
    this.render();
  }

  /** Kamera einer Ansicht; Schnittansichten leiten sich von ihrer Elternansicht ab */
  viewCam(d, v, depth = 0) {
    if (v.type === "detail") { const parent = d.views.find((x) => x.id === v.parent); return parent && depth < 4 ? this.viewCam(d, parent, depth + 1) : { dir: [0, 1, 0], up: [0, 0, 1] }; }
    if (v.type !== "section") return { dir: CAMS[v.type]?.dir || v.dir, up: CAMS[v.type]?.up || v.up };
    const parent = d.views.find((x) => x.id === v.parent);
    if (!parent || depth > 3) return { dir: [0, 1, 0], up: [0, 0, 1] };
    const pc = this.viewCam(d, parent, depth + 1);
    const right = v3.norm(v3.cross(pc.dir, pc.up));
    const n = v.axis === "v" ? right : v3.norm(pc.up);
    return { dir: v3.mul(n, -1), up: v.axis === "v" ? pc.up : pc.dir, cut: { n, c: Number(v.pos) || 0 } };
  }
  sectionChildren(d, v) { return d.views.filter((x) => x.type === "section" && x.parent === v.id); }
  // ---------- Projizierte Ansicht (Inventor »Projiziert«) ----------
  startProjected() {
    const d = this.doc;
    const parent = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    this.setTool("proj");
    this.pendingProj = { parent: parent && this.projectable(parent) ? parent.id : null };
    this.app.setHint(this.pendingProj.parent ? "Projiziert: Lage der neuen Ansicht klicken (rechts/links, oben/unten oder schräg für Isometrie); Esc beendet" : "Projiziert: zuerst die Ausgangsansicht anklicken");
  }
  projectable(v) { return !["detail", "flat"].includes(v.type) && !!this.proj.get(v.id); }
  /** Lage und Kamera der projizierten Ansicht für einen Klick (sx, sy) */
  projPlan(sx, sy) {
    const d = this.doc;
    const parent = d.views.find((x) => x.id === this.pendingProj?.parent);
    if (!parent) return null;
    const pc = this.viewCam(d, parent);
    const cam = projectedCamera({ dir: pc.dir, up: pc.up }, sx - parent.x, sy - parent.y);
    if (!cam) return null;
    const x = cam.align === "x" ? parent.x : sx, y = cam.align === "y" ? parent.y : sy;
    return { parent, cam, x, y };
  }
  projClick(sx, sy) {
    const d = this.doc;
    if (!this.pendingProj?.parent) {
      const rects = this.sheetRects(d);
      const v = d.views.find((x) => { const r = rects[x.id]?.rect; return r && this.projectable(x) && sx >= r[0] - 3 && sx <= r[2] + 3 && sy >= r[1] - 3 && sy <= r[3] + 3; });
      if (!v) return toast("Ausgangsansicht anklicken");
      this.pendingProj = { parent: v.id };
      this.sel = { type: "view", id: v.id };
      this.app.setHint("Projiziert: Lage der neuen Ansicht klicken (rechts/links, oben/unten oder schräg für Isometrie); Esc beendet");
      return this.render();
    }
    const pl = this.projPlan(sx, sy);
    if (!pl) return;
    const { parent, cam, x, y } = pl;
    const type = camType(CAMS, cam);
    const v = { id: uid("v"), type: type || "proj", x: r3(x), y: r3(y), scale: parent.scale, hidden: cam.align !== "free", parent: parent.id, align: cam.align };
    if (!type) { v.dir = cam.dir.map(r6); v.up = cam.up.map(r6); }
    this.app.edit("Projizierte Ansicht", () => d.views.push(v), { rebuild: true });
    this.projGhost = null;
  }
  // ---------- Detailansicht ----------
  /** Detail-Projektionen aus der Elternansicht zuschneiden (kein eigener Kernel-Aufruf) */
  deriveDetails(d = this.doc) {
    for (const v of d?.views || []) {
      if (v.type !== "detail") continue;
      const p = this.proj.get(v.parent);
      if (p) this.proj.set(v.id, clipProjection(p, v.center, v.r));
      else this.proj.delete(v.id);
    }
  }
  startDetail() {
    const d = this.doc;
    const parent = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    if (!parent || parent.type === "detail" || !this.proj.get(parent.id)) return toast("Zuerst eine Ansicht anklicken, dann »Detail«");
    this.setTool("detail");
    this.pendingDetail = { parent: parent.id };
    this.app.setHint("Detail: Mittelpunkt des Ausschnitts klicken, dann den Rand");
  }
  detailClick(sx, sy) {
    const d = this.doc;
    const pd = this.pendingDetail;
    const parent = d.views.find((x) => x.id === pd?.parent);
    if (!parent) return this.setTool(null);
    const xf = this.viewXf(parent);
    const q = xf.from(sx, sy);
    if (!pd.center) { pd.center = q; this.app.setHint("Detail: Rand des Ausschnitts klicken"); return; }
    const r = Math.hypot(q[0] - pd.center[0], q[1] - pd.center[1]);
    if (r * parent.scale < 2) return toast("Ausschnitt zu klein");
    const scale = [...SCALES].reverse().find((s) => s >= parent.scale * 2 - 1e-9) || SCALES[0];
    const used = new Set(d.views.filter((x) => x.letter).map((x) => x.letter));
    let letter = "Z";
    for (let i = 25; i >= 0; i--) { const l = String.fromCharCode(65 + i); if (!used.has(l)) { letter = l; break; } }
    const [px, py] = xf.to(pd.center[0], pd.center[1]);
    const [x, y] = this.freeSpot(d, r * scale + 8, px, py);
    const v = { id: uid("v"), type: "detail", parent: parent.id, center: pd.center.map((x) => Math.round(x * 1000) / 1000), r: Math.round(r * 1000) / 1000, scale, letter,
      hidden: parent.hidden, x, y, dir: this.viewCam(d, parent).dir, up: this.viewCam(d, parent).up }; // dir/up: ältere Versionen zeigen das Detail als ganze Ansicht
    this.setTool(null);
    this.app.edit("Detailansicht", () => d.views.push(v), { rebuild: false });
    this.deriveDetails(d);
    this.sel = { type: "view", id: v.id };
    this.render();
  }
  /** Freie Stelle auf dem Blatt für einen Kreis mit Radius `half` (Ansichten, Schriftfeld meiden), nahe (nx, ny) */
  freeSpot(d, half, nx, ny) {
    const [W, H] = this.sheetSize(d);
    const rects = d.views.filter((v) => this.proj.get(v.id)?.bbox).map((v) => {
      const xf = this.viewXf(v), bb = xf.bb;
      const [x0, y0] = xf.to(bb.x0, bb.y1), [x1, y1] = xf.to(bb.x1, bb.y0);
      return [x0 - 10, y0 - 10, x1 + 10, y1 + 10]; // Platz für Maße
    });
    rects.push([W - 190, H - 70, W, H]); // Schriftfeld
    const free = (x, y) => rects.every(([a, b, c, e]) => x + half < a || x - half > c || y + half < b || y - half > e);
    let best = null;
    for (let x = 25 + half; x <= W - 15 - half; x += 5) for (let y = 15 + half; y <= H - 15 - half; y += 5) {
      if (!free(x, y)) continue;
      const dd = Math.hypot(x - nx, y - ny);
      if (!best || dd < best[2]) best = [x, y, dd];
    }
    return best ? [best[0], best[1]] : [Math.min(W - 15 - half, nx + 2 * half), Math.min(H - 70 - half, ny)];
  }
  /** Kreis + Buchstabe in der Elternansicht */
  detailMark(v, s, xf) {
    const g = svgEl("g", { fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const [cx, cy] = xf.to(s.center[0], s.center[1]);
    const rr = s.r * v.scale;
    g.append(svgEl("circle", { cx: r3(cx), cy: r3(cy), r: r3(rr) }));
    const t = svgEl("text", { x: r3(cx + rr * 0.75 + 1), y: r3(cy - rr * 0.75 - 1), "font-size": 5, fill: "#111a24", stroke: "none" });
    t.textContent = s.letter;
    g.append(t);
    return g;
  }

  // ---------- Abwicklung (Kantteil) ----------
  /** Kantteile der Quelle mit gebautem Blech (Länge aus dem Kernel) */
  kantteileOf(d = this.doc) {
    const src = d?.source && this.app.doc(d.source.id);
    if (src?.kind !== "part") return [];
    const bodies = this.app.results.get(src.id)?.bodies || [];
    return src.features.filter((f) => ["kantteil", "konturwalzen", "blechkasten"].includes(f.type) && !f.suppressed && bodies.some((b) => b.fid === f.id && b.meta?.sheet?.flatModel));
  }
  flatOf(d, v) {
    const src = d.source && this.app.doc(d.source.id);
    const sh = src && this.app.results.get(src.id)?.bodies?.find((b) => b.fid === v.feature)?.meta?.sheet;
    return sh?.flatModel ? sheetFlatView(sh.flatModel) : null;
  }
  deriveFlats(d = this.doc) {
    for (const v of d?.views || []) {
      if (v.type !== "flat") continue;
      const p = this.flatOf(d, v);
      if (p) this.proj.set(v.id, p); else this.proj.delete(v.id);
    }
  }
  addFlatView() {
    const d = this.doc;
    const ks = this.kantteileOf(d);
    if (!ks.length) return toast("Die Quelle hat kein fehlerfreies Kantteil – Abwicklung gibt es für Kantteile");
    const f = ks.find((x) => !d.views.some((v) => v.type === "flat" && v.feature === x.id)) || ks[0];
    const scale = d.views.find((v) => v.type === "front")?.scale || 1;
    const v = { id: uid("v"), type: "flat", feature: f.id, dir: [0, 0, -1], up: [0, 1, 0], scale, hidden: false, label: "Abwicklung" + (ks.length > 1 ? " " + (f.name || "") : ""), bendTable: true, x: 0, y: 0 };
    const p = this.flatOf(d, v);
    if (!p) return toast("Abwicklung konnte nicht berechnet werden", { kind: "err" });
    this.proj.set(v.id, p);
    const half = (Math.max(p.flat, p.length) * scale) / 2 + 12;
    const [sw, sh] = this.sheetSize(d);
    [v.x, v.y] = this.freeSpot(d, half, sw / 2, sh / 2);
    this.app.edit("Abwicklung", () => d.views.push(v), { rebuild: false });
    this.sel = { type: "view", id: v.id };
    this.render();
    toast(`Abwicklung ${fmtNum(p.flat, 1)} × ${fmtNum(p.length, 1)} mm mit ${p.bends.length} Biegung(en)`);
  }
  /** Biegelinien (Strich-Zweipunktlinie), Biegenotizen und Biegetabelle einer Abwicklungsansicht */
  flatExtras(v) {
    const p = this.proj.get(v.id);
    if (!p?.bends) return null;
    const xf = this.viewXf(v);
    const g = svgEl("g", { fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const txt = (x, y, s, size = 2.5, rot = 0, anchor = "start") => { const e = svgEl("text", { x: r3(x), y: r3(y), "font-size": size, "text-anchor": anchor, fill: "#111a24", stroke: "none", transform: rot ? `rotate(${rot} ${r3(x)} ${r3(y)})` : undefined }); e.textContent = s; g.append(e); };
    const e = 2 / v.scale;
    for (const b of p.bends) {
      const vert = b.x1 == null || Math.abs(b.x1 - b.x0) < 1e-9;
      const [ax, ay] = vert ? xf.to(b.x, (b.y1 ?? p.length) + e) : xf.to(b.x0 - e, b.y0);
      const [bx, by] = vert ? xf.to(b.x, (b.y0 ?? 0) - e) : xf.to(b.x1 + e, b.y1);
      g.append(svgEl("line", { x1: r3(ax), y1: r3(ay), x2: r3(bx), y2: r3(by), "stroke-dasharray": "8 1.2 1 1.2 1 1.2" }));
      if (vert) txt(bx - 1, by - 2, bendNote(b), 2.5, -90); else txt(ax - 2, ay + 1, bendNote(b), 2.5, 0, "end");
    }
    if (v.bendTable !== false && p.bends.length) {
      const cells = bendTableCells(p.bends), cols = [10, 16, 16, 12, 12, 18], rh = 5, Wt = cols.reduce((a, b) => a + b, 0);
      const [x0] = xf.to(xf.bb.x0, 0), [, yb] = xf.to(0, xf.bb.y0);
      const y0 = yb + 14;
      g.append(svgEl("rect", { x: r3(x0), y: r3(y0), width: Wt, height: rh * cells.length, "stroke-width": LW.vis }));
      for (let i = 1; i < cells.length; i++) g.append(svgEl("line", { x1: r3(x0), y1: r3(y0 + rh * i), x2: r3(x0 + Wt), y2: r3(y0 + rh * i), "stroke-width": i === 1 ? LW.vis : LW.thin }));
      let cx = x0;
      for (const w of cols.slice(0, -1)) { cx += w; g.append(svgEl("line", { x1: r3(cx), y1: r3(y0), x2: r3(cx), y2: r3(y0 + rh * cells.length) })); }
      cells.forEach((row, k) => { let x = x0; row.forEach((s, i) => { txt(x + 1, y0 + rh * k + 3.6, s, k ? 2.5 : 2.2); x += cols[i]; }); });
      txt(x0, y0 - 1.5, `Abwicklung ${fmtNum(p.flat, 1)} × ${fmtNum(p.length, 1)}`, 2.5);
    }
    return g;
  }

  // ---------- Symbole: Oberfläche, Form- und Lagetoleranz, Bezug ----------
  /** Klickpunkt in einer Ansicht → {view, p} (Fangpunkt oder nächster Punkt auf einer Kante) */
  pickInView(sx, sy) {
    const d = this.doc;
    const rects = this.sheetRects(d);
    const v = d.views.find((x) => { const r = rects[x.id]?.rect; return x.type !== "iso" && r && sx >= r[0] - 3 && sx <= r[2] + 3 && sy >= r[1] - 3 && sy <= r[3] + 3; });
    if (!v) return null;
    const xf = this.viewXf(v), q = xf.from(sx, sy);
    const s = this.snapAt(sx, sy);
    if (s?.view === v.id) return { view: v, p: s.p };
    const seg = nearestSegment(this.proj.get(v.id).visible, q, 3 / (v.scale * this.zoom));
    if (!seg) return { view: v, p: q };
    const dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1], t = Math.max(0, Math.min(1, ((q[0] - seg.a[0]) * dx + (q[1] - seg.a[1]) * dy) / (dx * dx + dy * dy)));
    return { view: v, p: [seg.a[0] + t * dx, seg.a[1] + t * dy] };
  }
  symbolClick(sx, sy) {
    const hit = this.pickInView(sx, sy);
    if (!hit) return toast("In eine Ansicht klicken (Kante oder Fläche)");
    const kind = this.tool;
    const [px, py] = this.viewXf(hit.view).to(...hit.p);
    const at = kind === "surface" ? [px, py] : kind === "datum" ? [px, py - 12] : [px + 8, py - 16];
    this.symbolDialog({ id: uid("y"), kind, view: hit.view.id, p: hit.p.map(r3), at: at.map(r3) }, true);
  }
  symbolDialog(sym, isNew) {
    const d = this.doc;
    const f = { ...sym };
    const fields = [];
    const inp = (k, label, ph) => h("div", { class: "field" }, h("label", {}, label), h("input", { class: "inp", value: f[k] ?? "", placeholder: ph || "", oninput: (e) => { f[k] = e.target.value; } }));
    const sel = (k, label, opts) => h("div", { class: "field" }, h("label", {}, label), h("select", { class: "inp", onchange: (e) => { f[k] = e.target.value; } }, ...opts.map((o) => h("option", { value: o.value, selected: f[k] === o.value }, o.label))));
    let title;
    if (f.kind === "surface") {
      title = "Oberflächenangabe";
      f.surf = f.surf || "spanend";
      if (f.text === undefined) f.text = "Ra 3,2";
      fields.push(sel("surf", "Verfahren", SURFACE_KINDS), inp("text", "Kenngröße", "Ra 3,2"), h("p", { class: "hint" }, "DIN EN ISO 21920-1: Zeichen auf der Kante oder an einer Hinweislinie (ziehen)."));
    } else if (f.kind === "gdt") {
      title = "Form- und Lagetoleranz";
      f.sym = f.sym || "ebenheit";
      f.tolTxt = f.tol != null ? fmtNum(f.tol, 3) : "0,1";
      f.datTxt = (f.datums || []).join(" ");
      fields.push(sel("sym", "Toleranzart", GDT_KINDS.map((k) => ({ value: k.value, label: `${k.group}: ${k.label}` }))), inp("tolTxt", "Toleranz (mm)", "0,05"),
        h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!f.dia, onchange: (e) => { f.dia = e.target.checked; } }), "Toleranzzone zylindrisch (Ø)"),
        inp("datTxt", "Bezüge", "A B"), h("p", { class: "hint" }, "DIN EN ISO 1101. Bezüge mit Leerzeichen trennen, gemeinsamer Bezug als A-B. Formtoleranzen haben keinen Bezug."));
    } else {
      title = "Bezug";
      if (!f.letter) { const used = new Set((d.symbols || []).filter((x) => x.kind === "datum").map((x) => x.letter)); f.letter = "ABCDEFGHJKLMNPRSTUVWXYZ".split("").find((l) => !used.has(l)) || "Z"; }
      fields.push(inp("letter", "Bezugsbuchstabe"), h("p", { class: "hint" }, "ISO 5459: Dreieck auf der Bezugsfläche, Kästchen mit Buchstabe (ziehen)."));
    }
    const buttons = [{ label: "Abbrechen" }, { label: isNew ? "Setzen" : "OK", primary: true, run: () => {
      let val;
      if (f.kind === "surface") { const r = validateSurface({ kind: f.surf, text: f.text }); if (!r.ok) { toast(r.error, { kind: "err" }); return false; } val = { surf: r.value.kind, text: r.value.text }; }
      else if (f.kind === "gdt") { const r = validateGdt({ sym: f.sym, tol: f.tolTxt, dia: f.dia, datums: f.datTxt }); if (!r.ok) { toast(r.error, { kind: "err" }); return false; } val = r.value; }
      else { const r = validateDatumLetter(f.letter); if (!r.ok) { toast(r.error, { kind: "err" }); return false; } val = { letter: r.value }; }
      this.app.edit(title, () => {
        if (isNew) d.symbols = (d.symbols || []).concat({ id: sym.id, kind: sym.kind, view: sym.view, p: sym.p, at: sym.at, ...val });
        else Object.assign(d.symbols.find((x) => x.id === sym.id), val);
      }, { rebuild: false });
      this.sel = { type: "symbol", id: sym.id };
      this.render();
    } }];
    if (!isNew) buttons.unshift({ label: "Löschen", danger: true, run: () => { this.app.edit("Symbol löschen", () => { d.symbols = d.symbols.filter((x) => x.id !== sym.id); }, { rebuild: false }); this.sel = null; this.render(); } });
    modal({ title, body: h("div", {}, ...fields), buttons });
  }
  renderSymbol(d, y, interactive) {
    const v = d.views.find((x) => x.id === y.view);
    if (!v || !this.proj.get(v.id)) return null;
    const P = this.viewXf(v).to(...y.p);
    let geo;
    if (y.kind === "surface") {
      geo = surfaceSymbol(y.surf, y.at[0], y.at[1], y.text, textWidth);
      if (Math.hypot(y.at[0] - P[0], y.at[1] - P[1]) > 1) {
        geo.lines.push([y.at[0], y.at[1], P[0], P[1]]);
        const e = [P[0] - y.at[0], P[1] - y.at[1]], l = Math.hypot(...e), u = [e[0] / l, e[1] / l];
        geo.polys.push({ pts: [P, [P[0] - u[0] * 3 - u[1] * 0.9, P[1] - u[1] * 3 + u[0] * 0.9], [P[0] - u[0] * 3 + u[1] * 0.9, P[1] - u[1] * 3 - u[0] * 0.9]], closed: true, fill: true });
      }
    } else if (y.kind === "gdt") geo = gdtFrame(y, y.at[0], y.at[1], P, textWidth);
    else geo = datumSymbol(y.letter, P, y.at);
    const g = svgEl("g", { "data-symbol": y.id, class: interactive ? "dw-dimgrp" + (this.sel?.id === y.id ? " sel" : "") : undefined, fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    for (const [x1, y1, x2, y2] of geo.lines) g.append(svgEl("line", { x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2) }));
    for (const [cx, cy, r] of geo.circles) g.append(svgEl("circle", { cx: r3(cx), cy: r3(cy), r: r3(r) }));
    for (const q of geo.polys) g.append(svgEl(q.closed ? "polygon" : "polyline", { points: q.pts.map((t) => t.map(r3).join(",")).join(" "), fill: q.fill ? "#111a24" : "none" }));
    for (const t of geo.texts) { const e = svgEl("text", { x: r3(t.x), y: r3(t.y), "font-size": 3.5, "text-anchor": t.anchor, fill: "#111a24", stroke: "none" }); e.textContent = t.text; g.append(e); }
    if (interactive && geo.width) g.append(svgEl("rect", { x: r3(y.at[0]), y: r3(y.at[1]), width: r3(geo.width), height: geo.height, fill: "transparent", stroke: "none" }));
    return g;
  }

  // ---------- Bruchansicht und Ausbruch ----------
  breakDialog() {
    const d = this.doc;
    const v = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    if (!v || ["iso", "detail"].includes(v.type) || !this.proj.get(v.id)) return toast("Zuerst eine Ansicht (nicht Isometrie oder Detail) anklicken, dann »Bruch«");
    const bb = this.proj.get(v.id).bbox;
    let axis = v.breaks?.length ? v.breakAxis || "u" : bb.x1 - bb.x0 >= bb.y1 - bb.y0 ? "u" : "v";
    const range = () => (axis === "u" ? [bb.x0, bb.x1] : [bb.y0, bb.y1]);
    const fill = () => { const [lo, hi] = range(); a.value = fmtNum(lo + (hi - lo) * 0.25, 1); b.value = fmtNum(lo + (hi - lo) * 0.75, 1); };
    const a = h("input", { class: "inp" }), b = h("input", { class: "inp" });
    const seg = h("div", { class: "seg" });
    const drawSeg = () => seg.replaceChildren(...[["u", "Waagerecht"], ["v", "Senkrecht"]].map(([k, l]) => h("button", { class: k === axis ? "on" : "", disabled: v.breaks?.length ? true : undefined, onclick: () => { axis = k; fill(); drawSeg(); } }, l)));
    fill(); drawSeg();
    modal({
      title: "Bruch (verkürzte Darstellung)",
      body: h("div", {}, h("div", { class: "field" }, h("label", {}, "Richtung des Teils"), seg), h("div", { class: "field" }, h("label", {}, "Von (Modell-mm)"), a), h("div", { class: "field" }, h("label", {}, "Bis (Modell-mm)"), b),
        h("p", { class: "hint" }, `Der Bereich dazwischen entfällt in der Darstellung, Maße zeigen die wahre Länge (ISO 128-30). Ansicht: ${fmtNum(range()[0], 1)} … ${fmtNum(range()[1], 1)}.`)),
      buttons: [{ label: "Abbrechen" }, { label: "Brechen", primary: true, run: () => {
        const num = (x) => Number(String(x.value).replace(",", "."));
        const nb = { a: num(a), b: num(b) };
        const list = [...(v.breaks || []), nb];
        try { breakMap(list, axis, 8 / v.scale); } catch (e) { toast(e.message, { kind: "err" }); return false; }
        if (!(Math.abs(nb.b - nb.a) >= 1)) { toast("Bereich mindestens 1 mm", { kind: "err" }); return false; }
        this.app.edit("Bruch", () => { v.breaks = list; v.breakAxis = axis; }, { rebuild: false });
        this.render();
        this.app.props.render();
      } }],
    });
  }
  startBreakout() {
    const d = this.doc;
    const v = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    if (!v || ["iso", "detail", "flat"].includes(v.type) || !this.proj.get(v.id)) return toast("Zuerst eine Ansicht (nicht Isometrie, Detail oder Abwicklung) anklicken, dann »Ausbruch«");
    this.setTool("breakout");
    this.pendingBo = { view: v.id };
  }
  /** Tiefenbereich des Modells längs der Blickrichtung einer Ansicht (n = zum Betrachter) */
  depthOf(d, v) {
    const n = v3.mul(v3.norm(this.viewCam(d, v).dir), -1);
    const boxes = [];
    for (const it of this.sourceItems(d) || []) {
      const M = placementMatrix(it.pos, it.rot);
      for (const b of this.app.results.get(it.part.id)?.bodies || []) {
        const bb = b.props?.bbox;
        if (!bb) continue;
        const pts = [];
        for (const x of [bb[0][0], bb[1][0]]) for (const y of [bb[0][1], bb[1][1]]) for (const z of [bb[0][2], bb[1][2]]) pts.push(matApply(M, [x, y, z]));
        boxes.push([pts.reduce((m, p) => p.map((c, i) => Math.min(c, m[i])), [Infinity, Infinity, Infinity]), pts.reduce((m, p) => p.map((c, i) => Math.max(c, m[i])), [-Infinity, -Infinity, -Infinity])]);
      }
    }
    return depthRange(boxes, n);
  }
  async breakoutClick(sx, sy) {
    const d = this.doc, pb = this.pendingBo;
    const v = d.views.find((x) => x.id === pb?.view);
    if (!v) return this.setTool(null);
    const q = this.viewXf(v).from(sx, sy);
    if (!pb.c) { pb.c = q; this.app.setHint("Ausbruch: Rand des Bereichs klicken"); return; }
    const r = Math.hypot(q[0] - pb.c[0], q[1] - pb.c[1]);
    if (r * v.scale < 2) return toast("Bereich zu klein");
    const range = this.depthOf(d, v);
    this.setTool(null);
    if (!range) return toast("Modell ist noch nicht berechnet – bitte kurz warten");
    const total = range.max - range.min;
    const txt = await promptDialog("Ausbruch", `Tiefe ab Vorderkante (mm, Modell ${fmtNum(total, 1)} tief)`, fmtNum(total / 2, 1), { validate: (x) => { const t = Number(String(x).replace(",", ".")); return t > 0 && t < total ? null : `Tiefe zwischen 0 und ${fmtNum(total, 1)} mm`; } });
    if (txt == null) return;
    const depth = Number(String(txt).replace(",", "."));
    const bo = { c: pb.c.map(r3), r: r3(r), depth, plane: r3(range.max - depth) };
    this.app.edit("Ausbruch", () => { v.breakouts = (v.breakouts || []).concat(bo); });
    this.sel = { type: "view", id: v.id };
  }
  /** Bruchlinien (Zickzack) und Ränder der Ausbrüche einer Ansicht */
  breakExtras(v) {
    const p = this.proj.get(v.id);
    if (!p || (!v.breaks?.length && !v.breakouts?.length)) return null;
    const xf = this.viewXf(v);
    const g = svgEl("g", { fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    if (xf.bm) {
      const ax = xf.bm.axis, [b0, b1] = ax === "u" ? [p.bbox.y0, p.bbox.y1] : [p.bbox.x0, p.bbox.x1];
      for (const pair of xf.bm.cuts) for (const x of pair) {
        const pts = zigzag(x, b0, b1, ax, { amp: 1.5 / v.scale, over: 2 / v.scale }).map((q) => xf.toB(...q));
        g.append(svgEl("polyline", { points: pts.map((q) => q.map(r3).join(",")).join(" ") }));
      }
    }
    for (const b of v.breakouts || []) {
      const [cx, cy] = xf.to(...b.c);
      g.append(svgEl("circle", { cx: r3(cx), cy: r3(cy), r: r3(b.r * v.scale) }));
    }
    return g;
  }
  breakProps(P, v) {
    if (["iso", "detail"].includes(v.type)) return [];
    const app = this.app, out = [];
    const br = v.breaks || [], bos = v.breakouts || [];
    if (br.length) out.push(h("dl", { class: "kv" }, ...br.flatMap((b, i) => [h("dt", {}, "Bruch " + (i + 1)), h("dd", {}, `${fmtNum(b.a, 1)} … ${fmtNum(b.b, 1)} `, h("button", { class: "btn", title: "Bruch entfernen", onclick: () => { app.edit("Bruch", () => { v.breaks = br.filter((_, k) => k !== i); if (!v.breaks.length) { delete v.breaks; delete v.breakAxis; } }, { rebuild: false }); this.render(); app.props.render(); } }, "×"))])));
    if (bos.length) out.push(h("dl", { class: "kv" }, ...bos.flatMap((b, i) => [h("dt", {}, "Ausbruch " + (i + 1)), h("dd", {}, `Ø${fmtNum(b.r * 2, 1)}, ${fmtNum(b.depth, 1)} tief `, h("button", { class: "btn", title: "Ausbruch entfernen", onclick: () => { app.edit("Ausbruch", () => { v.breakouts = bos.filter((_, k) => k !== i); if (!v.breakouts.length) delete v.breakouts; }); } }, "×"))])));
    out.push(h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.breakDialog() }, "Bruch"), v.type !== "flat" ? h("button", { class: "btn", onclick: () => this.startBreakout() }, "Ausbruch") : null));
    return out;
  }

  // ---------- Hilfsansicht ----------
  startAux() {
    const d = this.doc;
    const parent = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    if (!parent || parent.type === "iso" || parent.type === "detail" || !this.proj.get(parent.id)) return toast("Zuerst eine Ansicht (nicht Isometrie oder Detail) anklicken, dann »Hilfsansicht«");
    this.setTool("aux");
    this.pendingAux = { parent: parent.id };
    this.app.setHint("Hilfsansicht: schräge Kante anklicken – die Ansicht schaut senkrecht auf diese Fläche");
  }
  auxClick(sx, sy) {
    const d = this.doc;
    const parent = d.views.find((x) => x.id === this.pendingAux?.parent);
    const p = parent && this.proj.get(parent.id);
    if (!p) return this.setTool(null);
    const xf = this.viewXf(parent);
    const seg = nearestSegment(p.visible, xf.from(sx, sy), 2.5 / (parent.scale * this.zoom));
    if (!seg) return toast("Keine Kante getroffen – näher an die schräge Kante klicken");
    const cam = auxiliaryCamera(this.viewCam(d, parent), seg.a, seg.b, [xf.cu, xf.cv]);
    if (!cam) return toast("Die Kante ist waagerecht oder senkrecht – diese Fläche zeigt schon eine Normalansicht");
    const used = new Set(d.views.filter((x) => x.letter).map((x) => x.letter));
    let letter = "X";
    for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) { letter = l; break; } }
    const mid = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
    const n = cam.normal2d;
    const size = Math.max(xf.bb.x1 - xf.bb.x0, xf.bb.y1 - xf.bb.y0) * parent.scale;
    const [mx, my] = xf.to(...mid);
    const [x, y] = this.freeSpot(d, size / 2 + 8, mx + n[0] * (size / 2 + 30), my - n[1] * (size / 2 + 30));
    const v = { id: uid("v"), type: "aux", parent: parent.id, dir: cam.dir.map(r6), up: cam.up.map(r6), mark: { p: mid.map(r3), n: n.map(r6) }, letter, scale: parent.scale, hidden: false, x, y };
    this.setTool(null);
    this.app.edit("Hilfsansicht", () => d.views.push(v));
    this.sel = { type: "view", id: v.id };
  }
  /** Pfeil mit Buchstabe senkrecht auf die Kante in der Elternansicht (Blickrichtung der Hilfsansicht) */
  auxMark(v, s, xf) {
    const g = svgEl("g", { fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const [px, py] = xf.to(...s.mark.p);
    const n = [s.mark.n[0], -s.mark.n[1]]; // Blattkoordinaten (y nach unten)
    const tip = [px + n[0] * 2, py + n[1] * 2], tail = [px + n[0] * 14, py + n[1] * 14];
    g.append(svgEl("line", { x1: r3(tail[0]), y1: r3(tail[1]), x2: r3(tip[0] + n[0] * 3), y2: r3(tip[1] + n[1] * 3) }));
    const w = [-n[1] * 1, n[0] * 1];
    g.append(svgEl("polygon", { points: [tip, [tip[0] + n[0] * 3 + w[0], tip[1] + n[1] * 3 + w[1]], [tip[0] + n[0] * 3 - w[0], tip[1] + n[1] * 3 - w[1]]].map((q) => q.map(r3).join(",")).join(" "), fill: "#111a24", stroke: "none" }));
    const t = svgEl("text", { x: r3(tail[0] + n[0] * 3), y: r3(tail[1] + n[1] * 3 + 1.8), "text-anchor": "middle", "font-size": 5, fill: "#111a24", stroke: "none" });
    t.textContent = s.letter;
    g.append(t);
    return g;
  }

  // ---------- Bohrungstabelle ----------
  /** Bohrungen der gewählten Ansicht (sonst der Ansicht mit den meisten Bohrungen) als Tabelle mit Kennungen */
  addHoleTable() {
    const d = this.doc;
    const full = (v) => (this.proj.get(v.id)?.arcs || []).filter((a) => a.full).length;
    const sel = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    const v = sel && sel.type !== "iso" && full(sel) ? sel : d.views.filter((x) => x.type !== "iso" && x.type !== "detail").sort((a, b) => full(b) - full(a))[0];
    if (!v || !full(v)) return toast("Keine Bohrungen in den Ansichten gefunden");
    const t = this.holeTableOf(d, { view: v.id });
    const [W] = this.sheetSize(d);
    const h0 = 5 * (t.rows.length + 1);
    const ht = { id: uid("t"), view: v.id, at: [25, Math.max(15, 10 + 5)] };
    // links oben ins Blatt, sonst an die nächste freie Stelle
    const [x, y] = this.freeSpot(d, h0 / 2 + 1, 25 + 55, 15 + h0 / 2);
    ht.at = [Math.max(22, Math.min(W - 115, x - 52)), Math.max(12, y - h0 / 2)];
    this.app.edit("Bohrungstabelle", () => { d.holeTables = (d.holeTables || []).filter((x) => x.view !== v.id).concat(ht); }, { rebuild: false });
    this.sel = { type: "holetable", id: ht.id };
    this.render();
    toast(`${t.rows.length} Bohrung(en) in der Tabelle – ziehen zum Verschieben, Entf löscht`);
  }
  holeTableOf(d, ht) {
    const v = d.views.find((x) => x.id === ht.view);
    const p = v && this.proj.get(v.id);
    if (!p?.bbox) return { rows: [], groups: [] };
    const items = this.sourceItems(d) || [];
    const specs = items.flatMap((it) => { const scope = resolveParams(it.part.params || []).values; return holeSpecs(it.part.features, (x) => evaluate(String(x), scope)); });
    return holeTable(holeCircles((p.arcs || []).filter((a) => a.full), this.holeCenters(d, v)), specs, [p.bbox.x0, p.bbox.y0]);
  }
  /** Bohrungsachsen der Quelle in Blickrichtung der Ansicht als Ansichtspunkte; null, wenn der Kern keine Angaben liefert */
  holeCenters(d, v) {
    const cam = this.viewCam(d, v), dir = v3.norm(cam.dir);
    let any = false;
    const out = [];
    for (const it of this.sourceItems(d) || []) {
      const M = placementMatrix(it.pos, it.rot);
      for (const b of this.app.results.get(it.part.id)?.bodies || []) {
        if (!b.props?.holes) continue;
        any = true;
        for (const hl of b.props.holes) {
          const dw = v3.norm(matApplyDir(M, hl.d));
          if (Math.abs(v3.dot(dw, dir)) > 0.999) out.push({ c: projectPoint(matApply(M, hl.p), cam.dir, cam.up), r: hl.r });
        }
      }
    }
    return any ? out : null;
  }
  renderHoleTable(d, ht, interactive) {
    const v = d.views.find((x) => x.id === ht.view);
    if (!v || !this.proj.get(v.id)) return null;
    const t = this.holeTableOf(d, ht);
    if (!t.rows.length) return null;
    const xf = this.viewXf(v);
    const g = svgEl("g", { "data-holetable": ht.id, class: interactive ? "dw-dimgrp" + (this.sel?.id === ht.id ? " sel" : "") : undefined, fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const txt = (x, y, s, size = 2.5, anchor = "start") => { const e = svgEl("text", { x: r3(x), y: r3(y), "font-size": size, "text-anchor": anchor, fill: "#111a24", stroke: "none" }); e.textContent = s; g.append(e); };
    // Kennung an jeder Bohrung und Nullpunkt der Tabelle
    for (const r of t.rows) {
      const [cx, cy] = xf.to(r.cx, r.cy);
      const rr = (t.groups.find((x) => x.tag === r.group)?.r || 0) * v.scale;
      txt(cx + rr * 0.7 + 0.8, cy - rr * 0.7 - 0.8, r.tag, 2.5);
    }
    const [ox, oy] = xf.to(xf.bb.x0, xf.bb.y0);
    g.append(svgEl("circle", { cx: r3(ox), cy: r3(oy), r: 1.2 }));
    g.append(svgEl("line", { x1: r3(ox), y1: r3(oy), x2: r3(ox + 6), y2: r3(oy) }), svgEl("line", { x1: r3(ox), y1: r3(oy), x2: r3(ox), y2: r3(oy - 6) }));
    txt(ox - 1.5, oy + 3.5, "0", 2.5, "end");
    // Tabelle
    const cells = holeTableCells(t, d.nachkomma ?? 1);
    const cols = [14, 20, 20, 50], rh = 5, [x0, y0] = ht.at, Wt = cols.reduce((a, b) => a + b, 0);
    g.append(svgEl("rect", { x: r3(x0), y: r3(y0), width: Wt, height: rh * cells.length, "stroke-width": LW.vis, fill: "#fff" }));
    for (let i = 1; i < cells.length; i++) g.append(svgEl("line", { x1: r3(x0), y1: r3(y0 + rh * i), x2: r3(x0 + Wt), y2: r3(y0 + rh * i), "stroke-width": i === 1 ? LW.vis : LW.thin }));
    let cx = x0;
    for (const w of cols.slice(0, -1)) { cx += w; g.append(svgEl("line", { x1: r3(cx), y1: r3(y0), x2: r3(cx), y2: r3(y0 + rh * cells.length) })); }
    cells.forEach((row, k) => {
      let x = x0;
      row.forEach((s, i) => { const max = Math.floor(cols[i] / 1.4); txt(x + 1.2, y0 + rh * k + 3.6, s.length > max ? s.slice(0, max - 1) + "…" : s, k ? 2.5 : 2.2); x += cols[i]; });
    });
    if (interactive) g.append(svgEl("rect", { x: r3(x0), y: r3(y0), width: Wt, height: rh * cells.length, fill: "transparent", stroke: "none" }));
    return g;
  }

  // ---------- Hinweis mit Hinweislinie (Bohrungs-/Gewinde-, Fasen- oder freier Hinweis) ----------
  async leaderClick(sx, sy) {
    const d = this.doc;
    const v = d.views.find((x) => { if (x.type === "iso" || !this.proj.get(x.id)) return false; const r = this.sheetRects(d)[x.id]?.rect; return r && sx >= r[0] - 3 && sx <= r[2] + 3 && sy >= r[1] - 3 && sy <= r[3] + 3; });
    if (!v) return toast("Hinweis: in eine Ansicht klicken");
    const p = this.proj.get(v.id), xf = this.viewXf(v);
    const s = this.snapAt(sx, sy);
    const q = s?.view === v.id ? s.p : xf.from(sx, sy);
    const items = this.sourceItems(d) || [];
    const specs = items.flatMap((it) => { const scope = resolveParams(it.part.params || []).values; return holeSpecs(it.part.features, (x) => evaluate(String(x), scope)); });
    const chamfers = [...new Set(items.flatMap((it) => {
      const scope = resolveParams(it.part.params || []).values;
      return it.part.features.filter((f) => f.type === "chamfer" && !f.suppressed).map((f) => { try { return evaluate(String(f.radius), scope); } catch { return null; } }).filter((x) => x > 0);
    }))];
    const sug = noteSuggestion(xf.from(sx, sy), { circles: holeCircles((p.arcs || []).filter((a) => a.full), this.holeCenters(d, v)), arcs: p.arcs || [], lines: p.visible, specs, chamfers, pick: 1.8 / (v.scale * this.zoom) });
    const text = await promptDialog(sug.kind === "bohrung" ? "Bohrungshinweis" : sug.kind === "fase" ? "Fasenhinweis" : "Hinweis", "Text", sug.text);
    if (!text) return;
    const [ax, ay] = xf.to(...q);
    const L = { id: uid("l"), view: v.id, p: q.map(r3), at: [r3(ax + 12), r3(ay - 10)], text };
    this.app.edit("Hinweis", () => { d.leaders = (d.leaders || []).concat(L); }, { rebuild: false });
    this.sel = { type: "leader", id: L.id };
    this.render();
  }
  renderLeader(d, L, interactive) {
    const v = d.views.find((x) => x.id === L.view);
    if (!v || !this.proj.get(v.id)) return null;
    const [ax, ay] = this.viewXf(v).to(...L.p);
    const [bx, by] = L.at, w = textWidth(L.text) + 2, right = bx >= ax;
    const g = svgEl("g", { "data-leader": L.id, class: interactive ? "dw-dimgrp" + (this.sel?.id === L.id ? " sel" : "") : undefined, fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    g.append(svgEl("line", { x1: r3(ax), y1: r3(ay), x2: r3(bx), y2: r3(by) }));
    g.append(svgEl("line", { x1: r3(bx), y1: r3(by), x2: r3(bx + (right ? w : -w)), y2: r3(by) }));
    g.append(svgEl("circle", { cx: r3(ax), cy: r3(ay), r: 0.6, fill: "#111a24" }));
    const t = svgEl("text", { x: r3(bx + (right ? w / 2 : -w / 2)), y: r3(by - 1), "text-anchor": "middle", "font-size": 3.5, fill: "#111a24", stroke: "none" });
    t.textContent = L.text;
    g.append(t);
    return g;
  }
  async editLeader(id) {
    const d = this.doc;
    const L = d.leaders.find((x) => x.id === id);
    const text = await promptDialog("Hinweis ändern", "Text", L.text);
    if (text === null) return;
    this.app.edit("Hinweis", () => { if (text) { L.text = text; if (L.auto) L.touched = true; } else d.leaders = d.leaders.filter((x) => x !== L); }, { rebuild: false });
    this.render();
  }

  // ---------- Änderungstabelle (DIN EN ISO 7200) ----------
  addRevisionDialog() {
    const d = this.doc;
    const f = { rev: nextRevision(d.revisions || [], d.title?.revision), datum: new Date().toLocaleDateString("de-DE"), text: "", name: d.title?.ersteller || "" };
    const inp = (k, ph) => h("input", { class: "inp", value: f[k], placeholder: ph || "", oninput: (e) => { f[k] = e.target.value; } });
    modal({
      title: "Änderung eintragen",
      body: h("div", {}, h("div", { class: "field" }, h("label", {}, "Index"), inp("rev")), h("div", { class: "field" }, h("label", {}, "Änderung"), inp("text", "z. B. Bohrung Ø11 → Ø13")),
        h("div", { class: "field" }, h("label", {}, "Datum"), inp("datum")), h("div", { class: "field" }, h("label", {}, "Name"), inp("name")),
        h("p", { class: "hint" }, "Die Tabelle steht oben rechts im Blatt, das Schriftfeld zeigt den neuesten Index.")),
      buttons: [{ label: "Abbrechen" }, { label: "Eintragen", primary: true, run: () => {
        const r = validateRevision(f);
        if (!r.ok) { toast(r.error, { kind: "err" }); return false; }
        if ((d.revisions || []).some((x) => x.rev === r.value.rev)) { toast("Index " + r.value.rev + " gibt es schon", { kind: "err" }); return false; }
        this.app.edit("Änderung", () => { d.revisions = (d.revisions || []).concat(r.value); }, { rebuild: false });
        this.render();
        this.app.props.render();
      } }],
    });
  }
  revisionTableSvg(d, W) {
    const rows = d.revisions || [];
    const cols = [["Index", 12], ["Änderung", 108], ["Datum", 30], ["Name", 30]];
    const rh = 5, x0 = W - 10 - 180, y0 = 10;
    const g = svgEl("g", { "data-revisions": "1", fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    g.append(svgEl("rect", { x: x0, y: y0, width: 180, height: rh * (rows.length + 1), "stroke-width": LW.frame, fill: "#fff" }));
    for (let i = 1; i <= rows.length; i++) g.append(svgEl("line", { x1: x0, y1: y0 + rh * i, x2: x0 + 180, y2: y0 + rh * i, "stroke-width": i === 1 ? LW.vis : LW.thin }));
    let x = x0;
    for (const [, w] of cols.slice(0, -1)) { x += w; g.append(svgEl("line", { x1: x, y1: y0, x2: x, y2: y0 + rh * (rows.length + 1) })); }
    const cell = (ci, k, s, size = 2.5) => {
      const cx = x0 + cols.slice(0, ci).reduce((a, c) => a + c[1], 0), max = Math.floor(cols[ci][1] / (size * 0.55));
      const e = svgEl("text", { x: r3(cx + 1.2), y: r3(y0 + rh * k + 3.6), "font-size": size, fill: "#111a24", stroke: "none" });
      e.textContent = String(s ?? "").length > max ? String(s).slice(0, max - 1) + "…" : String(s ?? "");
      g.append(e);
    };
    cols.forEach(([t], i) => cell(i, 0, t, 2.2));
    rows.forEach((r, k) => [r.rev, r.text, r.datum, r.name].forEach((s, i) => cell(i, k + 1, s)));
    return g;
  }
  /** Zusätze auf dem Blatt, die SVG und DXF gleich ausgeben (nur line/rect/circle/polygon/text) */
  extraGroups(d, interactive) {
    const [W] = this.sheetSize(d);
    const out = [];
    for (const v of d.views) {
      if (v.type !== "aux" || !v.mark) continue;
      const parent = d.views.find((x) => x.id === v.parent);
      if (parent && this.proj.get(parent.id)) out.push(this.auxMark(parent, v, this.viewXf(parent)));
    }
    for (const v of d.views) if (v.type === "flat") { const g = this.flatExtras(v); if (g) out.push(g); }
    for (const v of d.views) { const g = this.breakExtras(v); if (g) out.push(g); }
    for (const t of d.holeTables || []) { const g = this.renderHoleTable(d, t, interactive); if (g) out.push(g); }
    for (const y of d.symbols || []) { const g = this.renderSymbol(d, y, interactive); if (g) out.push(g); }
    for (const L of d.leaders || []) { const g = this.renderLeader(d, L, interactive); if (g) out.push(g); }
    if (d.revisions?.length) out.push(this.revisionTableSvg(d, W));
    return out;
  }

  async addSectionDialog() {
    const d = this.doc;
    const parent = this.sel?.type === "view" ? d.views.find((x) => x.id === this.sel.id) : null;
    if (!parent || parent.type === "iso") return toast("Zuerst eine Ansicht (nicht Isometrie) anklicken, dann »Schnitt«");
    const p = this.proj.get(parent.id);
    const bb = p?.bbox || { x0: -50, y0: -50, x1: 50, y1: 50 };
    const used = new Set(d.views.filter((x) => x.type === "section").map((x) => x.letter));
    let letter = "A";
    for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) { letter = l; break; } }
    let axis = "h";
    const seg = h("div", { class: "seg" });
    const pos = h("input", { class: "inp", value: String(Math.round(((bb.y0 + bb.y1) / 2) * 100) / 100).replace(".", ",") });
    const drawSeg = () => {
      seg.replaceChildren(...[["h", "Waagerecht"], ["v", "Senkrecht"]].map(([k, l]) => h("button", { class: k === axis ? "on" : "", onclick: () => {
        axis = k;
        pos.value = String(Math.round((k === "h" ? (bb.y0 + bb.y1) / 2 : (bb.x0 + bb.x1) / 2) * 100) / 100).replace(".", ",");
        drawSeg();
      } }, l)));
    };
    drawSeg();
    modal({
      title: `Schnitt ${letter}–${letter}`,
      body: h("div", {},
        h("div", { class: "field" }, h("label", {}, "Schnittlinie"), seg),
        h("div", { class: "field" }, h("label", {}, "Lage (Modell-mm)"), pos),
        h("p", { class: "hint" }, `Bereich der Ansicht: ${fmtNum(bb.x0, 1)} … ${fmtNum(bb.x1, 1)} (waagerecht), ${fmtNum(bb.y0, 1)} … ${fmtNum(bb.y1, 1)} (senkrecht). Die Schnittansicht kann danach verschoben werden.`)),
      buttons: [{ label: "Abbrechen" }, { label: "Erzeugen", primary: true, run: () => {
        const c = Number(String(pos.value).replace(",", "."));
        if (!Number.isFinite(c)) { toast("Lage ist keine Zahl", { kind: "err" }); return false; }
        const w = (bb.x1 - bb.x0) * parent.scale, hh = (bb.y1 - bb.y0) * parent.scale;
        const v = { id: uid("v"), type: "section", parent: parent.id, axis, pos: c, letter, scale: parent.scale, hidden: false,
          x: axis === "h" ? parent.x : parent.x + w + 20, y: axis === "h" ? parent.y + hh + 22 : parent.y };
        this.app.edit("Schnittansicht", () => d.views.push(v));
        this.sel = { type: "view", id: v.id };
      } }],
    });
  }

  /**
   * Hohlprofil im Schnitt statt mit verdeckten Kanten (DIN ISO 128-40): Schnitt A–A quer zur Profilachse durch die
   * Vorderansicht, möglichst durch eine Bohrung; ersetzt die Seiten- bzw. Draufsicht, die nur den Querschnitt zeigt.
   */
  async hollowSection() {
    const d = this.doc;
    const front = d?.views.find((v) => v.type === "front");
    const fp = front && this.proj.get(front.id);
    if (!fp?.bbox) return toast("Zuerst Grundansichten erzeugen");
    const src = d.source && this.app.doc(d.source.id);
    if (src?.kind !== "part") return toast("Schnitt durch Hohlprofil gibt es für Einzelteile");
    const scope = resolveParams(src.params || []).values;
    const prof = profileSpec(src.features, (x) => evaluate(String(x), scope));
    const pf = src.features.find((f) => f.type === "profile" && !f.suppressed);
    let along = prof && ["rohr", "vierkant", "rechteck"].includes(pf?.section) ? prof.axis : null;
    let res = null;
    if (!along) {
      // ohne Profil-Feature: Wandstärke in der Seiten- oder Draufsicht suchen
      const items = this.sourceItems(d);
      const views = ["left", "top"].map((t) => ({ key: "hs_" + t, dir: CAMS[t].dir, up: CAMS[t].up, hidden: true }));
      try { res = await this.app.kernel.call("project", { items, views }); } catch (e) { return toast("Ansichten konnten nicht berechnet werden: " + e.message, { kind: "err" }); }
      if (wallThickness(res.hs_left?.bbox, res.hs_left?.visible, res.hs_left?.arcs)) along = "X";
      else if (wallThickness(res.hs_top?.bbox, res.hs_top?.visible, res.hs_top?.arcs)) along = "Z";
    }
    if (!along) return toast("Kein Hohlprofil gefunden (gleiche Wandstärke ringsum)");
    if (along === "Y") return toast("Der Hohlraum ist in der Vorderansicht schon zu sehen");
    const axis = along === "X" ? "v" : "h";
    const bb = fp.bbox;
    const mid = axis === "v" ? (bb.x0 + bb.x1) / 2 : (bb.y0 + bb.y1) / 2;
    // durch die Bohrung, die der Mitte am nächsten liegt (Bohrungen erscheinen in Draufsicht bzw. Seitenansicht als Kreis)
    const other = d.views.find((v) => v.type === (axis === "v" ? "top" : "left"));
    const op = (other && this.proj.get(other.id)) || res?.[axis === "v" ? "hs_top" : "hs_left"];
    const circles = (op?.arcs || []).filter((a) => a.full).concat(op ? circlesFromLines(op.visible, 0.5 * Math.max(op.bbox.x1 - op.bbox.x0, op.bbox.y1 - op.bbox.y0)) : []);
    const coord = axis === "v" ? "cx" : "cy";
    const near = circles.sort((a, b) => Math.abs(a[coord] - mid) - Math.abs(b[coord] - mid))[0];
    const pos = Math.round((near ? near[coord] : mid) * 100) / 100;
    const used = new Set(d.views.filter((x) => x.type === "section").map((x) => x.letter));
    let letter = "A";
    for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) { letter = l; break; } }
    const w = (bb.x1 - bb.x0) * front.scale, hh = (bb.y1 - bb.y0) * front.scale;
    const endType = axis === "v" ? "left" : "top"; // zeigt nur den Querschnitt, den jetzt der Schnitt zeigt
    const end = d.views.find((v) => v.type === endType && v.parent === front.id);
    // an die Stelle der ersetzten Ansicht, sonst an die nächste freie Stelle neben der Vorderansicht
    const half = (axis === "v" ? hh : w) / 2 + 10;
    const want = axis === "v" ? [front.x + w / 2 + 22 + half, front.y] : [front.x, front.y + hh / 2 + 22 + half];
    const [x, y] = end ? [end.x, end.y] : this.freeSpot(d, half, ...want);
    const v = { id: uid("v"), type: "section", parent: front.id, axis, pos, letter, scale: front.scale, hidden: false, x, y };
    this.app.edit("Schnitt Hohlprofil", () => {
      if (end) { d.views = d.views.filter((x) => x !== end); d.dims = d.dims.filter((m) => m.view !== end.id); }
      d.views.push(v);
    });
    this.sel = { type: "view", id: v.id };
  }

  // ---------- Koordinaten ----------
  viewXf(v) {
    const p = this.proj.get(v.id);
    const bb = p?.bbox || { x0: -10, y0: -10, x1: 10, y1: 10 };
    const bm = this.breakMapOf(v);
    if (bm) {
      // Bruchansicht: Modellkoordinaten → verkürzte Darstellung, Maße behalten die wahre Länge
      const [a0, b0] = bm.map(bb.x0, bb.y0), [a1, b1] = bm.map(bb.x1, bb.y1);
      const cu = (a0 + a1) / 2, cv = (b0 + b1) / 2;
      const toB = (u, w) => [v.x + (u - cu) * v.scale, v.y - (w - cv) * v.scale];
      return { to: (u, w) => toB(...bm.map(u, w)), from: (x, y) => bm.unmap((x - v.x) / v.scale + cu, -(y - v.y) / v.scale + cv), toB, bm, bb, cu, cv };
    }
    const cu = (bb.x0 + bb.x1) / 2, cv = (bb.y0 + bb.y1) / 2;
    return { to: (u, w) => [v.x + (u - cu) * v.scale, v.y - (w - cv) * v.scale], from: (x, y) => [(x - v.x) / v.scale + cu, -(y - v.y) / v.scale + cv], bb, cu, cv };
  }
  breakMapOf(v) {
    if (!v.breaks?.length) return null;
    try { return breakMap(v.breaks, v.breakAxis || "u", 8 / v.scale); } catch { return null; }
  }
  /** Projektion einer Ansicht, wie sie gezeichnet wird (Bruchbereiche entfernt) */
  viewGeom(v) {
    const p = this.proj.get(v.id);
    const bm = p && this.breakMapOf(v);
    if (!bm) return p;
    // Bögen, die in einen Bruchbereich reichen, entfallen – ihr beschnittener Linienzug bleibt
    const keep = (a) => { const x = bm.axis === "v" ? a.cy : a.cx; return !bm.overlaps(x - a.r, x + a.r); };
    return { ...p, visible: clipBreaks(p.visible, bm), hidden: clipBreaks(p.hidden, bm), arcs: (p.arcs || []).filter(keep), hiddenArcs: (p.hiddenArcs || []).filter(keep), sectionLoops: clipLoopsBreaks(p.sectionLoops, bm), sectionGroups: p.sectionGroups?.map((l) => clipLoopsBreaks(l, bm)), axes: clipBreaks(p.axes, bm) };
  }
  clientToSheet(cx, cy) {
    const r = this.stage.getBoundingClientRect();
    return [(cx - r.left - this.pan[0]) / (this.zoom * this.pxPerMm), (cy - r.top - this.pan[1]) / (this.zoom * this.pxPerMm)];
  }

  // ---------- Darstellung ----------
  render() {
    const d = this.doc;
    if (!d || this.offscreen) return;
    const [W, H] = this.sheetSize(d);
    this.pxPerMm = 3.78;
    const svg = this.renderSheet(d, { interactive: true });
    svg.classList.add("sheet");
    svg.setAttribute("width", W * this.pxPerMm);
    svg.setAttribute("height", H * this.pxPerMm);
    svg.style.transform = `translate(${this.pan[0]}px, ${this.pan[1]}px) scale(${this.zoom})`;
    this.svg = svg;
    this.stage.replaceChildren(svg);
    if (!d.views.length) {
      const msg = h("div", { class: "hud-card", style: { position: "absolute", left: "50%", top: "40%", transform: "translate(-50%,-50%)", textAlign: "center" } },
        d.source ? "Noch keine Ansichten. " : "Noch keine Quelle gewählt. ",
        h("button", { class: "btn primary", onclick: () => (d.source ? this.autoViews() : this.chooseSource()) }, d.source ? "Grundansichten erzeugen" : "Bauteil oder Baugruppe wählen"));
      this.stage.append(msg);
    }
  }
  /** Erzeugt das Blatt als SVG (mm). interactive: Auswahl-/Trefferflächen */
  /** Zeichnungsvorlage des Projekts (FU12) */
  template() { return templateOf(this.app.project.drawingTemplate); }
  renderSheet(d, { interactive = false } = {}) {
    const tpl = this.template();
    Object.assign(LW, LINE_GROUPS[tpl.lineGroup]);
    this.dimText = tpl.dimText;
    const [W, H] = this.sheetSize(d);
    const svg = svgEl("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${W} ${H}`, width: W + "mm", height: H + "mm", "font-family": "Bahnschrift, 'DIN Alternate', Arial, sans-serif" });
    const defs = svgEl("defs");
    // Schraffuren je Teil (DIN ISO 128-50); SVG dreht im Uhrzeigersinn, die Winkel zählen gegen den Uhrzeigersinn
    for (let i = 0; i < HATCH_STYLES.length; i++) {
      const { angle, gap } = HATCH_STYLES[i];
      const pat = svgEl("pattern", { id: i ? `werkcad-schraffur-${i}` : "werkcad-schraffur", patternUnits: "userSpaceOnUse", width: gap, height: gap, patternTransform: `rotate(${90 - angle})` });
      pat.append(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: gap, stroke: "#111a24", "stroke-width": 0.18 }));
      defs.append(pat);
    }
    svg.append(defs);
    svg.append(svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));
    const frame = svgEl("g", { fill: "none", stroke: "#111a24" });
    frame.append(svgEl("rect", { x: 20, y: 10, width: W - 30, height: H - 20, "stroke-width": LW.frame }));
    // Zentrier-/Faltmarken
    for (const [x1, y1, x2, y2] of [[W / 2, 0, W / 2, 10], [W / 2, H - 10, W / 2, H], [0, H / 2, 20, H / 2], [W - 10, H / 2, W, H / 2]]) frame.append(svgEl("line", { x1, y1, x2, y2, "stroke-width": LW.frame }));
    svg.append(frame);
    svg.append(this.zonesSvg(W, H));
    svg.append(this.titleBlock(d, W, H));
    for (const v of d.views) svg.append(this.renderView(d, v, interactive));
    const cm = this.renderCenterMarks(d);
    if (cm) svg.append(cm);
    for (const m of d.dims || []) { const g = this.renderDim(d, m, interactive); if (g) svg.append(g); }
    if (interactive && this.pendingChain) {
      const v = d.views.find((x) => x.id === this.pendingChain.view);
      if (v) for (const p of this.pendingChain.pts) { const [x, y] = this.viewXf(v).to(...p); svg.append(svgEl("circle", { cx: x, cy: y, r: 1, fill: "#ef7d1a" })); }
    }
    if (interactive && this.pendingDim?.ready) {
      const g = this.renderDim(d, this.pendingDim.m, false);
      if (g) { g.setAttribute("opacity", "0.55"); svg.append(g); }
    }
    const rows = this.bomRowsOf(d);
    const posOf = this.posOfRows(rows);
    for (const b of d.balloons || []) { const g = this.renderBalloon(d, b, posOf, interactive); if (g) svg.append(g); }
    if (d.bomTable?.show && rows.length) svg.append(this.bomTableSvg(rows, W, H));
    for (const m of d.welds || []) { const g = this.renderWeld(d, m, interactive); if (g) svg.append(g); }
    for (const g of this.extraGroups(d, interactive)) svg.append(g);
    for (const n of d.notes || []) {
      const t = svgEl("text", { x: n.x, y: n.y, "font-size": n.size || 3.5, fill: "#111a24", class: interactive ? "dw-dimgrp" + (this.sel?.id === n.id ? " sel" : "") : undefined, "data-note": n.id });
      t.textContent = n.text;
      svg.append(t);
    }
    if (interactive && this.tool === "proj" && this.projGhost) {
      const q = this.projGhost;
      svg.append(svgEl("rect", { x: r3(q.x - q.w / 2), y: r3(q.y - q.h / 2), width: r3(q.w), height: r3(q.h), fill: "none", stroke: "#ef7d1a", "stroke-width": 0.35, "stroke-dasharray": "2 1.5" }));
    }
    if (interactive && this.snapMark) svg.append(svgEl("circle", { cx: this.snapMark[0], cy: this.snapMark[1], r: 1.2, class: "dw-snap" }));
    if (interactive && this.pendingDim?.p1s) {
      const [x, y] = this.pendingDim.p1s;
      svg.append(svgEl("circle", { cx: x, cy: y, r: 1, fill: "#ef7d1a" }));
    }
    return svg;
  }
  renderView(d, v, interactive) {
    const g = svgEl("g", { "data-view": v.id, class: interactive ? "dw-view" + (this.sel?.type === "view" && this.sel.id === v.id ? " sel" : "") : undefined });
    const p = this.viewGeom(v);
    const xf = this.viewXf(v);
    if (!p) {
      if (interactive) { const t = svgEl("text", { x: v.x, y: v.y, "text-anchor": "middle", class: "dw-loading" }); t.textContent = this.loading ? "Ansicht wird berechnet…" : "–"; g.append(t); }
      return g;
    }
    const pathOf = (pl) => "M" + pl.map((q) => xf.to(q[0], q[1]).map(r3).join(" ")).join("L");
    // Schnittflächen: je geschnittenes Teil eine eigene Schraffur (ältere Projektionen ohne Gruppen: eine)
    const secGroups = p.sectionGroups?.length ? p.sectionGroups : p.sectionLoops?.length ? [p.sectionLoops] : [];
    secGroups.forEach((loops, i) => {
      const k = HATCH_STYLES.indexOf(hatchStyle(i));
      g.append(svgEl("path", { d: loops.map((l) => pathOf(l) + "Z").join(""), fill: `url(#${k ? `werkcad-schraffur-${k}` : "werkcad-schraffur"})`, "fill-rule": "evenodd", stroke: "none" }));
    });
    const hid = v.hidden !== false ? visibleHidden(p.hidden, v.scale) : [];
    if (hid.length) g.append(svgEl("path", { d: hid.map(pathOf).join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.hid, "stroke-dasharray": "2.5 1.2" }));
    g.append(svgEl("path", { d: p.visible.map(pathOf).join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.vis, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    // Achsraster der Baugruppe (Grundriss und Ansichten quer zu den Achsen)
    const srcDoc = d.source && this.app.doc(d.source.id);
    if (srcDoc?.kind === "assembly" && srcDoc.grids?.length && v.type !== "iso") {
      const cam = this.viewCam(d, v);
      const gg = gridViewSvg(svgEl, srcDoc, (p3) => xf.to(...projectPoint(p3, cam.dir, cam.up)), LW.thin);
      if (gg) g.append(gg);
    }
    // Mittellinien für Kreise
    if (v.centerlines !== false && v.type !== "iso") {
      const done = [];
      const cl = [];
      for (const a of [...(p.arcs || []), ...(p.hiddenArcs || [])]) {
        if (a.sweep < Math.PI * 0.9) continue;
        if (done.some((b) => Math.hypot(b.cx - a.cx, b.cy - a.cy) < 1e-3)) continue;
        done.push(a);
        const [cx, cy] = xf.to(a.cx, a.cy);
        const r = a.r * v.scale + 2;
        cl.push(`M${r3(cx - r)} ${r3(cy)}H${r3(cx + r)}M${r3(cx)} ${r3(cy - r)}V${r3(cy + r)}`);
      }
      if (cl.length) g.append(svgEl("path", { d: cl.join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.thin, "stroke-dasharray": "6 1 1 1" }));
    }
    // Achsen von Bohrungen, Rohren und Bolzen in der Seitenansicht (automatische Mittellinien)
    if (this.axesOn(d, v)) {
      const ax = axisLines(p.axes, v.scale, v.type === "detail" ? 0 : 2);
      if (ax.length) g.append(svgEl("path", { d: ax.map(pathOf).join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.thin, "stroke-dasharray": "6 1 1 1" }));
    }
    // Gewinde in Draufsicht (DIN ISO 6410): Kernloch breit, Nenndurchmesser als dünner Dreiviertelkreis, offen oben rechts
    if (v.type !== "iso") {
      const th = this.threadArcs(d, p);
      if (th.length) g.append(svgEl("path", { d: th.map((a) => { const [cx, cy] = xf.to(a.cx, a.cy), R = a.r * v.scale; return `M${r3(cx + R)} ${r3(cy)}A${r3(R)} ${r3(R)} 0 1 1 ${r3(cx)} ${r3(cy - R)}`; }).join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.thin }));
    }
    const bb = xf.bb;
    const [x0, y0] = xf.to(bb.x0, bb.y1), [x1, y1] = xf.to(bb.x1, bb.y0);
    if (v.type === "detail") g.append(svgEl("circle", { cx: r3(v.x), cy: r3(v.y), r: r3(v.r * v.scale), fill: "none", stroke: "#111a24", "stroke-width": LW.thin }));
    const note = this.scaleNote(d, v);
    const lbl = v.type === "section" ? `${v.letter}–${v.letter}${note ? " " + note : ""}` : v.type === "aux" ? v.letter + (v.parent && d.views.find((x) => x.id === v.parent)?.scale !== v.scale ? ` (${scaleLabel(v.scale).replace(/^M\s*/, "")})` : "") : v.type === "detail" ? `${v.letter} (${scaleLabel(v.scale).replace(/^M\s*/, "")})` : [v.label, note].filter(Boolean).join(" ");
    const big = v.type === "section" || v.type === "aux";
    if (lbl) { const t = svgEl("text", { x: (x0 + x1) / 2, y: big ? y0 - 4 : y1 + 6, "text-anchor": "middle", "font-size": big ? 5 : 3.5, fill: "#111a24" }); t.textContent = lbl; g.append(t); }
    // Schnittverläufe der abgeleiteten Schnittansichten
    for (const s of this.sectionChildren(d, v)) g.append(this.sectionLine(v, s, xf));
    for (const s of d.views.filter((x) => x.type === "detail" && x.parent === v.id)) g.append(this.detailMark(v, s, xf));
    if (interactive) {
      g.append(svgEl("rect", { x: x0 - 3, y: y0 - 3, width: x1 - x0 + 6, height: y1 - y0 + 6, class: "dw-view-box", fill: "none" }));
      g.append(svgEl("rect", { x: x0 - 3, y: y0 - 3, width: x1 - x0 + 6, height: y1 - y0 + 6, class: "dw-view-hit", "data-view": v.id }));
    }
    return g;
  }
  /** Feldeinteilung (DIN EN ISO 5457) im 5-mm-Rand außerhalb der Zeichenfläche: Teilstriche, Ziffern oben/unten, Buchstaben links/rechts */
  zonesSvg(W, H) {
    const z = sheetZones(W, H);
    const g = svgEl("g", { "data-zones": "1", fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const L = 20, T = 10, R = W - 10, B = H - 10, k = z.band;
    g.append(svgEl("rect", { x: L - k, y: T - k, width: R - L + 2 * k, height: B - T + 2 * k }));
    const line = (x1, y1, x2, y2) => g.append(svgEl("line", { x1: r3(x1), y1: r3(y1), x2: r3(x2), y2: r3(y2) }));
    const text = (x, y, s) => { const t = svgEl("text", { x: r3(x), y: r3(y + 1.2), "text-anchor": "middle", "font-size": 3.5, fill: "#111a24", stroke: "none" }); t.textContent = s; g.append(t); };
    z.cols.forEach((c, i) => {
      if (i) { line(c.a, T - k, c.a, T); line(c.a, B, c.a, B + k); }
      text((c.a + c.b) / 2, T - k / 2, c.label); text((c.a + c.b) / 2, B + k / 2, c.label);
    });
    z.rows.forEach((r, i) => {
      if (i) { line(L - k, r.a, L, r.a); line(R, r.a, R + k, r.a); }
      text(L - k / 2, (r.a + r.b) / 2, r.label); text(R + k / 2, (r.a + r.b) / 2, r.label);
    });
    return g;
  }
  /** Mittellinien an Zylinderachsen: Standard bei Bauteilen an, bei Baugruppen aus (zu viele Stäbe), je Ansicht umschaltbar */
  axesOn(d, v) {
    if (v.type === "iso" || v.type === "flat" || v.centerlines === false) return false;
    if (v.axes != null) return !!v.axes;
    const root = this.rootView(d, v);
    if (root && root !== v && root.axes != null) return !!root.axes;
    return d.source?.kind !== "assembly";
  }
  rootView(d, v) {
    let x = v;
    for (let k = 0; x?.parent && k < 20; k++) x = d.views.find((y) => y.id === x.parent) || null;
    return x;
  }
  /** Maßstab an der Ansicht, wenn er vom Hauptmaßstab (Schriftfeld) abweicht (DIN ISO 5455) */
  scaleNote(d, v) {
    const main = d.views.find((x) => x.type !== "iso" && !x.parent);
    return main && main !== v && Math.abs(main.scale - v.scale) > 1e-9 ? `(${scaleLabel(v.scale)})` : "";
  }
  /** Schnittlinie in der Elternansicht: dünn strichpunktiert, dicke Enden, Pfeile in Blickrichtung, Buchstaben */
  sectionLine(v, s, xf) {
    const g = svgEl("g", { fill: "none", stroke: "#111a24" });
    const bb = xf.bb, ext = 6 / v.scale;
    const c = Number(s.pos) || 0;
    const [A, B] = s.axis === "v" ? [xf.to(c, bb.y1 + ext), xf.to(c, bb.y0 - ext)] : [xf.to(bb.x0 - ext, c), xf.to(bb.x1 + ext, c)];
    g.append(svgEl("line", { x1: r3(A[0]), y1: r3(A[1]), x2: r3(B[0]), y2: r3(B[1]), "stroke-width": LW.thin, "stroke-dasharray": "6 1 1 1" }));
    const ux = B[0] - A[0], uy = B[1] - A[1], L = Math.hypot(ux, uy) || 1;
    const e = [ux / L, uy / L];
    // Blickrichtung auf dem Blatt: waagerechter Schnitt schaut nach unten, senkrechter nach links
    const look = s.axis === "v" ? [-1, 0] : [0, 1];
    for (const [P, sgn] of [[A, 1], [B, -1]]) {
      const Q = [P[0] + e[0] * 5 * sgn, P[1] + e[1] * 5 * sgn];
      g.append(svgEl("line", { x1: r3(P[0]), y1: r3(P[1]), x2: r3(Q[0]), y2: r3(Q[1]), "stroke-width": 0.7 }));
      const M = [P[0] + e[0] * 2.5 * sgn, P[1] + e[1] * 2.5 * sgn];
      const T = [M[0] + look[0] * 6, M[1] + look[1] * 6];
      g.append(svgEl("line", { x1: r3(M[0]), y1: r3(M[1]), x2: r3(T[0]), y2: r3(T[1]), "stroke-width": LW.thin }));
      g.append(svgEl("path", { d: `M${r3(T[0])} ${r3(T[1])}l${r3(-look[0] * 3 + look[1] * 0.9)} ${r3(-look[1] * 3 - look[0] * 0.9)}l${r3(-look[1] * 1.8)} ${r3(look[0] * 1.8)}Z`, fill: "#111a24", stroke: "none" }));
      const t = svgEl("text", { x: r3(T[0] + look[0] * 2.5 + (s.axis === "v" ? 0 : -3 * sgn)), y: r3(T[1] + look[1] * 4.5 + (s.axis === "v" ? 1.5 : 0)), "text-anchor": "middle", "font-size": 5, fill: "#111a24", stroke: "none" });
      t.textContent = s.letter;
      g.append(t);
    }
    return g;
  }
  dimValue(m) {
    if (m.kind === "ang") return angleValue(m);
    if (m.kind === "arc") return arcLength(m.circle.r, m.sweep);
    if (m.kind === "dia") return m.circle.r * 2;
    if (m.kind === "rad") return m.circle.r;
    const [a, b] = [m.p1, m.p2];
    if (m.kind === "h") return Math.abs(b[0] - a[0]);
    if (m.kind === "v") return Math.abs(b[1] - a[1]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  renderDim(d, m, interactive) {
    const v = d.views.find((x) => x.id === m.view);
    if (!v) return null;
    const xf = this.viewXf(v);
    const g = svgEl("g", { "data-dim": m.id, class: interactive ? "dw-dimgrp" + (this.sel?.type === "dim" && this.sel.id === m.id ? " sel" : "") : undefined, fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const val = this.dimValue(m);
    const tol = m.kind === "ang" ? "" : toleranceText(m.tol, val, classOf(d.title?.toleranz), m.kind === "rad" ? "rad" : "lin");
    // Bohrungs- und Teilungsangaben bleiben, wie sie sind (Nennmaße der Bohrung); die Toleranz kommt dahinter
    const txt = m.kind === "ang" ? dimLabel(m) : (m.kind === "dia" && (m.hole || m.pcd)) || m.pitch ? dimLabel(m) + tol
      : (m.count > 1 ? m.count + "× " : "") + (m.kind === "dia" ? "Ø" : m.kind === "rad" ? "R" : m.kind === "arc" ? "⌒" : "") + fmtNum(val, m.decimals ?? d.nachkomma ?? 1) + tol + (m.suffix || "");
    const arrowHead = (x, y, ux, uy) => {
      const L = 3, w = 0.9;
      return svgEl("path", { d: `M${r3(x)} ${r3(y)}L${r3(x - ux * L + uy * w)} ${r3(y - uy * L - ux * w)}L${r3(x - ux * L - uy * w)} ${r3(y - uy * L + ux * w)}Z`, fill: "#111a24", stroke: "none" });
    };
    const text = (x, y, rot) => {
      const t = svgEl("text", { x: r3(x), y: r3(y), "text-anchor": "middle", "font-size": this.dimText || 3.5, fill: "#111a24", stroke: "none", transform: rot ? `rotate(${r3(rot)} ${r3(x)} ${r3(y)})` : undefined, class: interactive ? "dw-dimtext" : undefined });
      t.textContent = txt;
      return t;
    };
    if (m.kind === "ang") {
      // Winkelmaß (DIN 406): Maßbogen um den Scheitel, Hilfslinien als Verlängerung der Schenkel, Zahl außen am Bogen
      const C = xf.to(...m.c), P1 = xf.to(...m.p1), P2 = xf.to(...m.p2), R = Math.max(4, m.off ?? 12);
      const a1 = Math.atan2(P1[1] - C[1], P1[0] - C[0]);
      let sw = Math.atan2(P2[1] - C[1], P2[0] - C[0]) - a1;
      while (sw > Math.PI) sw -= 2 * Math.PI;
      while (sw < -Math.PI) sw += 2 * Math.PI;
      const at = (a, r) => [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
      const steps = Math.max(8, Math.ceil(Math.abs(sw) * 24));
      const pts = Array.from({ length: steps + 1 }, (_, i) => at(a1 + (sw * i) / steps, R));
      let dd = "M" + pts.map((q) => `${r3(q[0])} ${r3(q[1])}`).join("L");
      // Hilfslinie, wo der Schenkel kürzer als der Bogenradius ist
      for (const [P, a] of [[P1, a1], [P2, a1 + sw]]) { const L = Math.hypot(P[0] - C[0], P[1] - C[1]); if (L < R) { const E = at(a, L + 1), F = at(a, R + 2); dd += `M${r3(E[0])} ${r3(E[1])}L${r3(F[0])} ${r3(F[1])}`; } }
      g.append(svgEl("path", { d: dd }));
      const sg = sw >= 0 ? 1 : -1, tg = (a, s2) => [-Math.sin(a) * s2, Math.cos(a) * s2];
      const E0 = pts[0], E1 = pts[pts.length - 1], t0 = tg(a1, sg), t1 = tg(a1 + sw, sg);
      g.append(arrowHead(E0[0], E0[1], -t0[0], -t0[1]), arrowHead(E1[0], E1[1], t1[0], t1[1]));
      const Mid = at(a1 + sw / 2, R + 3);
      g.append(text(Mid[0], Mid[1] + 1.2, 0));
      return g;
    }
    if (m.kind === "arc") {
      // Bogenlänge (DIN 406): Maßbogen konzentrisch, Hilfslinien radial, Bogenzeichen vor der Zahl
      const R = m.circle.r * v.scale + (m.off ?? 8);
      const at = (a, rr) => { const q = xf.to(m.circle.cx + Math.cos(a) * (rr / v.scale), m.circle.cy + Math.sin(a) * (rr / v.scale)); return q; };
      const a0 = m.a0, a1 = m.a0 + m.sweep;
      const E0 = at(a0, m.circle.r * v.scale + 1), E1 = at(a1, m.circle.r * v.scale + 1), D0 = at(a0, R + 2), D1 = at(a1, R + 2);
      const M0 = at(a0, R), M1 = at(a1, R);
      const [cx, cy] = xf.to(m.circle.cx, m.circle.cy);
      const cross = (M0[0] - cx) * (M1[1] - cy) - (M0[1] - cy) * (M1[0] - cx);
      // Maßbogen als Linienzug (auch für den DXF-Export, der nur Linien liest)
      const steps = Math.max(8, Math.ceil(m.sweep * 24));
      const arcPts = Array.from({ length: steps + 1 }, (_, i) => at(a0 + (m.sweep * i) / steps, R));
      g.append(svgEl("path", { d: `M${r3(E0[0])} ${r3(E0[1])}L${r3(D0[0])} ${r3(D0[1])}M${r3(E1[0])} ${r3(E1[1])}L${r3(D1[0])} ${r3(D1[1])}M` + arcPts.map((q) => `${r3(q[0])} ${r3(q[1])}`).join("L") }));
      // Pfeile tangential an den Enden
      const tang = (P, sgn) => { const rx = P[0] - cx, ry = P[1] - cy, L = Math.hypot(rx, ry) || 1; return [(-ry / L) * sgn, (rx / L) * sgn]; };
      const sgn = cross > 0 ? 1 : -1;
      const t0 = tang(M0, sgn), t1 = tang(M1, sgn);
      g.append(arrowHead(M0[0], M0[1], -t0[0], -t0[1]), arrowHead(M1[0], M1[1], t1[0], t1[1]));
      const Mid = at(a0 + m.sweep / 2, R + 2.5);
      let rot = (Math.atan2(Mid[1] - cy, Mid[0] - cx) * 180) / Math.PI + 90;
      if (rot > 90) rot -= 180;
      if (rot <= -90) rot += 180;
      g.append(text(Mid[0], Mid[1], rot));
      return g;
    }
    if (m.kind === "dia" || m.kind === "rad") {
      const [cx, cy] = xf.to(m.circle.cx, m.circle.cy);
      const r = m.circle.r * v.scale;
      const ang = m.angle ?? -Math.PI / 4;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const pOn = [cx + ux * r, cy + uy * r];
      if (m.pcd) g.append(svgEl("circle", { cx: r3(cx), cy: r3(cy), r: r3(r), "stroke-dasharray": "6 1.5 0.5 1.5", "stroke-width": LW.thin }));
      const lead = m.lead ?? LEAD;
      const pOut = [cx + ux * (r + lead), cy + uy * (r + lead)];
      const start = m.kind === "dia" ? [cx - ux * r, cy - uy * r] : [cx, cy];
      const shelf = Math.max(10, txt.length * 2.1 + 2); // Bezugslinie so lang wie der Text (z. B. „5× Ø6,8“)
      g.append(svgEl("path", { d: `M${r3(start[0])} ${r3(start[1])}L${r3(pOut[0])} ${r3(pOut[1])}h${r3(ux >= 0 ? shelf : -shelf)}` }));
      g.append(arrowHead(pOn[0], pOn[1], ux, uy));
      if (m.kind === "dia") g.append(arrowHead(start[0], start[1], -ux, -uy));
      g.append(text(pOut[0] + (ux >= 0 ? shelf / 2 : -shelf / 2), pOut[1] - 1, 0));
      return g;
    }
    const A = xf.to(...m.p1), B = xf.to(...m.p2);
    let A1, B1;
    const off = m.off ?? 10;
    if (m.kind === "h") { const y = (off >= 0 ? Math.max(A[1], B[1]) : Math.min(A[1], B[1])) + off; A1 = [A[0], y]; B1 = [B[0], y]; }
    else if (m.kind === "v") { const x = (off >= 0 ? Math.max(A[0], B[0]) : Math.min(A[0], B[0])) + off; A1 = [x, A[1]]; B1 = [x, B[1]]; }
    else { const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1; const n = [-dy / L, dx / L]; A1 = [A[0] + n[0] * off, A[1] + n[1] * off]; B1 = [B[0] + n[0] * off, B[1] + n[1] * off]; }
    if (m.ord) {
      // Koordinatenmaß: nur Hilfslinie bis zur Maßreihe, Wert am Ende (Nullpunkt „0“)
      const sg = Math.sign(off) || 1, tw = textWidth(txt) * ((this.dimText || 3.5) / 3.5);
      const P = m.kind === "h" ? [B[0], B1[1]] : [B1[0], B[1]];
      const d0 = Math.hypot(P[0] - B[0], P[1] - B[1]);
      if (d0 > 0.5) { const ex = (P[0] - B[0]) / d0, ey = (P[1] - B[1]) / d0; g.append(svgEl("path", { d: `M${r3(B[0] + ex)} ${r3(B[1] + ey)}L${r3(P[0])} ${r3(P[1])}` })); }
      if (m.kind === "h") g.append(text(P[0] + 1.2, P[1] + sg * (tw / 2 + 1), -90));
      else g.append(text(P[0] + sg * (tw / 2 + 1), P[1] + 1.2, 0));
      return g;
    }
    const ext = (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
      if (L < 0.5) return "";
      return `M${r3(p[0] + (dx / L) * 1)} ${r3(p[1] + (dy / L) * 1)}L${r3(q[0] + (dx / L) * 2)} ${r3(q[1] + (dy / L) * 2)}`;
    };
    const dx = B1[0] - A1[0], dy = B1[1] - A1[1], L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    // enge Maße (DIN 406-11): Pfeile von außen, Text neben die Maßlinie
    const tight = L < 7, tw = textWidth(txt) * ((this.dimText || 3.5) / 3.5), outside = L < tw + 7;
    const tail = tight ? 4 : 0, far = outside ? tw + 3 : 0;
    const P0 = [A1[0] - ux * tail, A1[1] - uy * tail], P1 = [B1[0] + ux * Math.max(tail, far), B1[1] + uy * Math.max(tail, far)];
    g.append(svgEl("path", { d: ext(A, A1) + ext(B, B1) + `M${r3(P0[0])} ${r3(P0[1])}L${r3(P1[0])} ${r3(P1[1])}` }));
    if (tight) g.append(arrowHead(A1[0], A1[1], ux, uy), arrowHead(B1[0], B1[1], -ux, -uy));
    else g.append(arrowHead(A1[0], A1[1], -ux, -uy), arrowHead(B1[0], B1[1], ux, uy));
    let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (rot > 90) rot -= 180;
    if (rot <= -90) rot += 180;
    const mx = outside ? B1[0] + ux * (Math.max(tail, 1) + tw / 2 + 1) : (A1[0] + B1[0]) / 2, my = outside ? B1[1] + uy * (Math.max(tail, 1) + tw / 2 + 1) : (A1[1] + B1[1]) / 2;
    const nrm = [Math.sin((rot * Math.PI) / 180), -Math.cos((rot * Math.PI) / 180)];
    g.append(text(mx + nrm[0] * 1.2, my + nrm[1] * 1.2, rot));
    return g;
  }
  // ---------- Positionsnummern und Stückliste (nur Baugruppen) ----------
  bomRowsOf(d = this.doc) {
    const src = d?.source && this.app.doc(d.source.id);
    if (src?.kind !== "assembly") return [];
    const rows = bomRows(this.app, src);
    if (!d.posOrder?.length) return rows;
    // eigene Reihenfolge der Zeichnung (neu nummeriert); unbekannte Zeilen und Normteile dahinter
    const rank = (r) => { const i = r.part ? d.posOrder.indexOf(r.part.id) : -1; return i < 0 ? Infinity : i; };
    return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }, i) => ({ ...r, pos: i + 1 }));
  }
  /**
   * Bauteil-ID → Positionsnummer. Normteil-Zeilen (Schrauben, Muttern …) haben kein eigenes Bauteil in der Zeile:
   * Bauteile, die nur aus einem Normteil bestehen, bekommen die Nummer der Zeile mit ihrer Normbezeichnung.
   */
  posOfRows(rows) {
    const map = new Map(rows.filter((r) => r.part).map((r) => [r.part.id, r.pos]));
    const norm = new Map(rows.filter((r) => r.norm).map((r) => [r.name, r.pos]));
    if (norm.size) for (const p of this.app.parts()) {
      const bodies = this.app.results.get(p.id)?.bodies || [];
      if (!map.has(p.id) && bodies.length && bodies.every((b) => b.meta?.norm) && norm.has(bodies[0].meta.norm.designation)) map.set(p.id, norm.get(bodies[0].meta.norm.designation));
    }
    return map;
  }
  /** Ein Kreis je Stücklisten-Position in der gewählten Ansicht (sonst Isometrie), rund um die Ansicht verteilt */
  autoBalloons() {
    const d = this.doc;
    const src = d?.source && this.app.doc(d.source.id);
    if (src?.kind !== "assembly") return toast("Positionsnummern gibt es nur in Zeichnungen von Baugruppen");
    const v = (this.sel?.type === "view" && d.views.find((x) => x.id === this.sel.id)) || d.views.find((x) => x.type === "iso") || d.views[0];
    if (!v || !this.proj.get(v.id)) return toast("Zuerst Ansichten erzeugen");
    // Positionsnummern je Bauteil der Mengenstückliste, auch aus Unterbaugruppen
    const st = this.viewState(d, v);
    const flat = { components: flattenAssembly(st ? assemblyForView(src, { state: st }) : src, (id) => this.app.doc(id)).map((o) => ({ part: o.part.id, ...decomposePlacement(o.matrix) })) };
    const anchors = balloonAnchors(flat, (pid) => this.app.results.get(pid));
    if (!anchors.length) return toast("Die Bauteile sind noch nicht berechnet – bitte kurz warten");
    const cam = this.viewCam(d, v);
    const xf = this.viewXf(v);
    const at = anchors.map((a) => ({ key: a.part, at: xf.to(...projectPoint(a.p3, cam.dir, cam.up)) }));
    const [x0, y0] = xf.to(xf.bb.x0, xf.bb.y1), [x1, y1] = xf.to(xf.bb.x1, xf.bb.y0);
    const pos = placeBalloons(at, { x0, y0, x1, y1 });
    const [W, H] = this.sheetSize(d);
    for (const [k, [x, y]] of pos) pos.set(k, [Math.min(W - 15, Math.max(25, x)), Math.min(H - 15, Math.max(15, y))]); // im Zeichnungsrahmen halten
    this.app.edit("Positionsnummern", () => {
      d.balloons = anchors.map((a) => ({ id: uid("b"), view: v.id, part: a.part, p3: a.p3, at: pos.get(a.part) }));
      d.bomTable = { show: true };
    }, { rebuild: false });
    this.render();
  }
  /** Schweißnaht-Symbole (ISO 2553) für alle Nähte der Quelle in der gewählten Ansicht (sonst Vorderansicht) */
  autoWelds() {
    const d = this.doc;
    const src = d?.source && this.app.doc(d.source.id);
    if (!src) return toast("Zuerst Ansichten erzeugen");
    const v = (this.sel?.type === "view" && d.views.find((x) => x.id === this.sel.id)) || d.views.find((x) => x.type === "front") || d.views[0];
    if (!v || !this.proj.get(v.id)) return toast("Zuerst Ansichten erzeugen");
    // Nähte je Bauteil; in Baugruppen an der ersten Komponente des Bauteils
    const anchors = [];
    const add = (pid, M) => (this.app.results.get(pid)?.welds || []).forEach((w, i) => anchors.push({ key: `${pid}:${w.fid}:${i}`, p3: M ? matApply(M, w.p3) : w.p3, w }));
    if (src.kind === "part") add(src.id, null);
    else { const seen = new Set(); for (const o of flattenAssembly(src, (id) => this.app.doc(id))) if (!seen.has(o.part.id)) { seen.add(o.part.id); add(o.part.id, o.matrix); } }
    if (!anchors.length) return toast("Keine Schweißnähte im Modell – Naht an Kanten setzen oder an Platte/Rippe ein a-Maß eintragen");
    const cam = this.viewCam(d, v);
    const xf = this.viewXf(v);
    const at = anchors.map((a) => ({ key: a.key, at: xf.to(...projectPoint(a.p3, cam.dir, cam.up)) }));
    const [x0, y0] = xf.to(xf.bb.x0, xf.bb.y1), [x1, y1] = xf.to(xf.bb.x1, xf.bb.y0);
    const pos = placeBalloons(at, { x0, y0, x1, y1 }, { r: 8, gap: 6 });
    const [W, H] = this.sheetSize(d);
    for (const [k, [x, y]] of pos) pos.set(k, [Math.min(W - 40, Math.max(45, x)), Math.min(H - 60, Math.max(20, y))]);
    this.app.edit("Schweißnähte", () => {
      d.welds = anchors.map((a) => ({ id: uid("w"), view: v.id, p3: a.p3, at: pos.get(a.key), w: { kind: a.w.kind, a: a.w.a, side: a.w.side, around: a.w.around, field: a.w.field } }));
    }, { rebuild: false });
    this.render();
    toast(`${anchors.length} Nahtsymbol(e) gesetzt – ziehen zum Verschieben, Entf löscht`);
  }
  renderWeld(d, m, interactive) {
    const v = d.views.find((x) => x.id === m.view);
    if (!v || !this.proj.get(v.id)) return null;
    const cam = this.viewCam(d, v);
    const a = this.viewXf(v).to(...projectPoint(m.p3, cam.dir, cam.up));
    const s = weldSymbol(m.w, a, m.at);
    const g = svgEl("g", { "data-weld": m.id, class: interactive ? "dw-dimgrp" + (this.sel?.id === m.id ? " sel" : "") : undefined, fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    for (const l of s.lines) g.append(svgEl("line", { x1: r3(l.x1), y1: r3(l.y1), x2: r3(l.x2), y2: r3(l.y2), "stroke-dasharray": l.dashed ? "2 1" : undefined }));
    g.append(svgEl("polygon", { points: s.arrow.pts.map((p) => p.map(r3).join(",")).join(" "), fill: "#111a24" }));
    for (const p of s.polys) g.append(svgEl(p.closed ? "polygon" : "polyline", { points: p.pts.map((q) => q.map(r3).join(",")).join(" "), fill: p.fill ? "#111a24" : "none" }));
    for (const c of s.circles) g.append(svgEl("circle", { cx: r3(c.cx), cy: r3(c.cy), r: c.r }));
    for (const t of s.texts) { const el = svgEl("text", { x: r3(t.x), y: r3(t.y), "text-anchor": t.anchor, "font-size": 3, fill: "#111a24", stroke: "none" }); el.textContent = t.text; g.append(el); }
    return g;
  }
  toggleBomTable() {
    const d = this.doc;
    if (!this.bomRowsOf(d).length) return toast("Stückliste gibt es nur in Zeichnungen von Baugruppen");
    this.app.edit("Stückliste", () => { d.bomTable = { show: !d.bomTable?.show }; }, { rebuild: false });
    this.render();
  }
  renderBalloon(d, b, posOf, interactive) {
    const v = d.views.find((x) => x.id === b.view);
    const n = posOf.get(b.part);
    if (!v || !this.proj.get(v.id) || n === undefined) return null;
    const cam = this.viewCam(d, v);
    const [ax, ay] = this.viewXf(v).to(...projectPoint(b.p3, cam.dir, cam.up));
    const [bx, by] = b.at, r = 4;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const g = svgEl("g", { "data-balloon": b.id, class: interactive ? "dw-dimgrp" + (this.sel?.id === b.id ? " sel" : "") : undefined, fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    if (len > r) g.append(svgEl("line", { x1: r3(ax), y1: r3(ay), x2: r3(bx - ((bx - ax) * r) / len), y2: r3(by - ((by - ay) * r) / len) }));
    g.append(svgEl("circle", { cx: r3(ax), cy: r3(ay), r: 0.6, fill: "#111a24" }));
    g.append(svgEl("circle", { cx: r3(bx), cy: r3(by), r, fill: "#fff", "stroke-width": LW.hid }));
    const t = svgEl("text", { x: r3(bx), y: r3(by + 1.75), "text-anchor": "middle", "font-size": 5, fill: "#111a24", stroke: "none" });
    t.textContent = String(n);
    g.append(t);
    return g;
  }
  /** Stückliste über dem Schriftfeld (DIN-Art: Kopf unten, Pos. 1 direkt darüber) */
  bomTableSvg(rows, W, H) {
    const cols = [["Pos", 12], ["Benennung", 64], ["Sachnummer", 34], ["Menge", 14], ["Werkstoff", 36], ["Masse kg", 20]];
    // über dem Schriftfeld; mit Zusatzfeldern der Vorlage (FU12) eine Zeile höher
    const rh = 6, x0 = W - 10 - 180, yb = H - 10 - 46 - (this.template().extra.length ? 9 : 0);
    const g = svgEl("g", { "data-bom": "1", fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    const top = yb - rh * (rows.length + 1);
    g.append(svgEl("rect", { x: x0, y: r3(top), width: 180, height: r3(rh * (rows.length + 1)), "stroke-width": LW.frame }));
    for (let i = 1; i <= rows.length; i++) g.append(svgEl("line", { x1: x0, y1: r3(yb - rh * i), x2: x0 + 180, y2: r3(yb - rh * i), "stroke-width": i === 1 ? LW.vis : LW.thin }));
    let x = x0;
    for (const [, w] of cols.slice(0, -1)) { x += w; g.append(svgEl("line", { x1: x, y1: r3(top), x2: x, y2: yb })); }
    const cell = (ci, y, s, size = 2.5) => {
      const cx = x0 + cols.slice(0, ci).reduce((a, c) => a + c[1], 0);
      const max = Math.floor(cols[ci][1] / (size * 0.55));
      const e = svgEl("text", { x: r3(cx + 1.2), y: r3(y - 1.8), "font-size": size, fill: "#111a24", stroke: "none" });
      e.textContent = String(s ?? "").length > max ? String(s).slice(0, max - 1) + "…" : String(s ?? "");
      g.append(e);
    };
    cols.forEach(([t], i) => cell(i, yb, t, 2.2));
    rows.forEach((r, k) => {
      const y = yb - rh * (k + 1);
      [r.pos, r.name, r.number, r.qty, [r.material, finishLabel({ finish: r.part?.finish }, { short: true })].filter(Boolean).join(" · "), Number.isFinite(r.mass) ? fmtNum(r.mass, 2) : ""].forEach((s, i) => cell(i, y, s));
    });
    return g;
  }
  titleBlock(d, W, H) {
    const t = d.title || {};
    const x0 = W - 10 - 180, y0 = H - 10 - 46;
    const g = svgEl("g", { fill: "none", stroke: "#111a24", "stroke-width": LW.thin });
    g.append(svgEl("rect", { x: x0, y: y0, width: 180, height: 46, "stroke-width": LW.frame }));
    const line = (x1, y1, x2, y2, w = LW.thin) => g.append(svgEl("line", { x1, y1, x2, y2, "stroke-width": w }));
    line(x0, y0 + 10, x0 + 180, y0 + 10);
    line(x0, y0 + 20, x0 + 180, y0 + 20);
    line(x0, y0 + 36, x0 + 180, y0 + 36);
    line(x0 + 50, y0, x0 + 50, y0 + 10);
    line(x0 + 120, y0, x0 + 120, y0 + 10);
    line(x0 + 60, y0 + 10, x0 + 60, y0 + 20);
    line(x0 + 90, y0 + 10, x0 + 90, y0 + 20);
    line(x0 + 130, y0 + 10, x0 + 130, y0 + 20);
    line(x0 + 120, y0 + 20, x0 + 120, y0 + 46);
    line(x0 + 150, y0 + 36, x0 + 150, y0 + 46);
    line(x0 + 120, y0 + 28, x0 + 180, y0 + 28);
    const label = (x, y, s) => { const e = svgEl("text", { x: x + 1.2, y: y + 2.6, "font-size": 1.8, fill: "#4a5866", stroke: "none" }); e.textContent = s; g.append(e); };
    const value = (x, y, s, size = 3.5) => { const e = svgEl("text", { x: x + 1.5, y, "font-size": size, fill: "#111a24", stroke: "none" }); e.textContent = s || ""; g.append(e); };
    const src = d.source && this.app.doc(d.source.id);
    // Werkstoff und Masse folgen dem Modell, solange im Schriftfeld nichts eingetragen ist
    // (ältere Zeichnungen haben die Werkstoff-Bezeichnung beim Anlegen kopiert: die gilt ebenfalls als automatisch)
    const autoLabels = new Set(materialList().map((m) => m.label));
    let mass = "", material = "";
    if (src?.kind === "part") {
      const r = this.app.results.get(src.id);
      if (r) mass = fmtNum(partMass(src, r.bodies, materialOf(src.material).density), 2) + " kg";
      material = src.material ? materialOf(src.material).label : "";
    } else if (src?.kind === "assembly") {
      const rows = this.bomRowsOf(d);
      if (rows.length) mass = fmtNum(rows.reduce((s, r) => s + r.mass * r.qty, 0), 2) + " kg";
      const mats = [...new Set(rows.map((r) => r.material).filter(Boolean))];
      material = mats.length === 1 ? mats[0] : mats.length ? "siehe Stückliste" : "";
    }
    const halbzeug = t.halbzeug || this.profileOf(d)?.text || "";
    const tpl = this.template();
    // Firmenlogo (FU12) links im Feld »Firma«, Firmenname rechts daneben
    if (tpl.logo) g.append(svgEl("image", { href: tpl.logo, x: x0 + 1, y: y0 + 2.6, width: 16, height: 7, preserveAspectRatio: "xMinYMid meet" }));
    label(x0, y0, "Firma"); value(x0 + (tpl.logo ? 16 : 0), y0 + 8.4, (t.firma || "").split("\n")[0], 3);
    // Zusatzfelder der Vorlage als Zeile über dem Schriftfeld
    const extra = extraFields(tpl, t);
    if (extra.length) {
      const wx = 180 / extra.length;
      g.append(svgEl("rect", { x: x0, y: y0 - 9, width: 180, height: 9, "stroke-width": LW.frame }));
      extra.forEach((f, i) => {
        if (i) line(x0 + i * wx, y0 - 9, x0 + i * wx, y0);
        label(x0 + i * wx, y0 - 9, f.label); value(x0 + i * wx, y0 - 1.6, f.value, 3);
      });
    }
    label(x0 + 50, y0, "Halbzeug"); value(x0 + 50, y0 + 8.4, halbzeug, halbzeug.length > 38 ? 2.5 : 3);
    label(x0 + 120, y0, "Werkstoff"); value(x0 + 120, y0 + 8.4, t.werkstoff && !autoLabels.has(t.werkstoff) ? t.werkstoff : material || t.werkstoff, 3);
    label(x0, y0 + 10, "Allgemeintoleranz"); value(x0, y0 + 18.4, t.toleranz || "ISO 2768-m", 3);
    label(x0 + 60, y0 + 10, "Maßstab"); value(x0 + 60, y0 + 18.4, t.massstab);
    label(x0 + 90, y0 + 10, "Masse"); value(x0 + 90, y0 + 18.4, t.masse || mass, 3);
    label(x0 + 130, y0 + 10, "Format"); value(x0 + 130, y0 + 18.4, `${d.sheet.format} ${d.sheet.orientation === "hoch" ? "hoch" : "quer"}`, 3);
    label(x0, y0 + 20, "Benennung"); value(x0, y0 + 32, t.benennung, 5.5);
    label(x0 + 120, y0 + 20, "Datum"); value(x0 + 120, y0 + 26.8, t.datum, 2.8);
    label(x0 + 120, y0 + 28, "Gezeichnet"); value(x0 + 120, y0 + 34.8, t.ersteller, 2.8);
    label(x0, y0 + 36, "Zeichnungsnummer"); value(x0, y0 + 44.3, t.nummer, 4.2);
    label(x0 + 120, y0 + 36, "Rev."); value(x0 + 120, y0 + 44.3, currentRevision(d), 3.5);
    label(x0 + 150, y0 + 36, "Blatt"); value(x0 + 150, y0 + 44.3, t.blatt || "1/1", 3.5);
    // Projektionssymbol Methode 1
    const sx = x0 + 70, sy = y0 + 15;
    const sym = svgEl("g", { "stroke-width": 0.25 });
    sym.append(svgEl("path", { d: `M${sx + 6} ${sy - 3}L${sx + 12} ${sy - 1.8}V${sy + 1.8}L${sx + 6} ${sy + 3}Z` }));
    sym.append(svgEl("circle", { cx: sx + 2, cy: sy, r: 1.8 }), svgEl("circle", { cx: sx + 2, cy: sy, r: 0.9 }));
    g.append(sym);
    return g;
  }

  // ---------- Fangpunkte ----------
  snapAt(sx, sy) {
    const d = this.doc;
    let best = null, bd = 2.2 / this.zoom;
    for (const v of d.views) {
      if (v.type === "iso") continue;
      const p = this.viewGeom(v);
      if (!p) continue;
      const xf = this.viewXf(v);
      for (const pl of p.visible.concat(v.hidden === false ? [] : p.hidden || [])) {
        for (const i of [0, pl.length - 1]) {
          const [x, y] = xf.to(pl[i][0], pl[i][1]);
          const dd = Math.hypot(x - sx, y - sy);
          if (dd < bd) { bd = dd; best = { view: v.id, p: pl[i], s: [x, y] }; }
        }
        // Ecken innerhalb von Linienzügen (Richtungswechsel)
        for (let i = 1; i < pl.length - 1; i++) {
          const a = pl[i - 1], b = pl[i], c = pl[i + 1];
          const cr = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
          if (cr < 1e-6) continue;
          const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
          if (cr / (seg * seg) < 0.02) continue; // Kurven-Stützpunkt, keine Ecke
          const [x, y] = xf.to(b[0], b[1]);
          const dd = Math.hypot(x - sx, y - sy);
          if (dd < bd) { bd = dd; best = { view: v.id, p: b, s: [x, y] }; }
        }
      }
      for (const a of [...(p.arcs || []), ...(p.hiddenArcs || [])]) {
        const [x, y] = xf.to(a.cx, a.cy);
        const dd = Math.hypot(x - sx, y - sy);
        if (dd < bd) { bd = dd; best = { view: v.id, p: [a.cx, a.cy], s: [x, y], center: a }; }
      }
    }
    return best;
  }
  circleAt(sx, sy) {
    const d = this.doc;
    for (const v of d.views) {
      if (v.type === "iso") continue;
      const p = this.viewGeom(v);
      if (!p) continue;
      const xf = this.viewXf(v);
      for (const a of p.arcs || []) {
        const [x, y] = xf.to(a.cx, a.cy);
        if (Math.abs(Math.hypot(x - sx, y - sy) - a.r * v.scale) < 1.5 / this.zoom) return { view: v.id, circle: { cx: a.cx, cy: a.cy, r: a.r }, full: a.full };
      }
    }
    return null;
  }

  // ---------- Werkzeuge ----------
  setTool(t) {
    this.tool = t;
    this.pendingDim = null;
    this.pendingAngle = null;
    this.pendingChain = null;
    if (t !== "aux") this.pendingAux = null;
    if (t !== "breakout") this.pendingBo = null;
    if (t !== "proj") { this.pendingProj = null; this.projGhost = null; }
    this.app.setHint(t === "dim" ? "Bemaßung: zwei Fangpunkte (Ecken, Kreismitten) oder einen Kreis anklicken, dann Lage klicken" : t === "text" ? "Text: Position auf dem Blatt anklicken" : t === "leader" ? "Hinweis: Stelle in einer Ansicht anklicken (Bohrung, Fase oder Kante) – der Text wird vorgeschlagen" : t === "aux" ? "Hilfsansicht: schräge Kante anklicken" : t === "breakout" ? "Ausbruch: Mitte des Bereichs klicken, dann den Rand" : t === "surface" ? "Oberfläche: Kante in einer Ansicht anklicken" : t === "gdt" ? "Form- und Lagetoleranz: Element in einer Ansicht anklicken" : t === "datum" ? "Bezug: Bezugsfläche (Kante) in einer Ansicht anklicken" : t === "chain" ? "Kettenmaß: Punkte der Reihe nach anklicken, nach dem zweiten Punkt die Lage der Maßreihe; Esc beendet" : t === "base" ? "Bezugsmaß: Bezugspunkt, dann weitere Punkte anklicken, nach dem zweiten Punkt die Lage; Esc beendet" : t === "arclen" ? "Bogenlänge: Bogen in einer Ansicht anklicken" : t === "angle" ? "Winkelmaß: zwei Kanten derselben Ansicht anklicken" : t === "center" ? "Mittelpunkt: Kreis oder Bogen anklicken (nochmal klicken entfernt)" : "");
    this.app.ribbon.render();
    this.render();
  }
  bindEvents() {
    const st = this.stage;
    let drag = null;
    st.addEventListener("wheel", (e) => {
      if (!this.doc) return;
      e.preventDefault();
      const r = st.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.max(0.1, Math.min(20, this.zoom * f));
      this.pan = [mx - ((mx - this.pan[0]) * nz) / this.zoom, my - ((my - this.pan[1]) * nz) / this.zoom];
      this.zoom = nz;
      if (this.svg) this.svg.style.transform = `translate(${this.pan[0]}px, ${this.pan[1]}px) scale(${this.zoom})`;
    }, { passive: false });
    st.addEventListener("pointerdown", (e) => {
      if (!this.doc) return;
      if (e.target.closest("button")) return;
      const [sx, sy] = this.clientToSheet(e.clientX, e.clientY);
      if (e.button === 1 || e.button === 2) { drag = { kind: "pan", x: e.clientX, y: e.clientY, pan: [...this.pan] }; st.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      if (e.button !== 0) return;
      if (this.tool === "dim") return this.dimClick(sx, sy);
      if (this.tool === "chain" || this.tool === "base") return this.chainClick(sx, sy);
      if (this.tool === "arclen") return this.arcLenClick(sx, sy);
      if (this.tool === "angle") return this.angleClick(sx, sy);
      if (this.tool === "center") return this.centerClick(sx, sy);
      if (this.tool === "text") return this.textClick(sx, sy);
      if (this.tool === "detail") return this.detailClick(sx, sy);
      if (this.tool === "proj") return this.projClick(sx, sy);
      if (this.tool === "aux") return this.auxClick(sx, sy);
      if (this.tool === "breakout") return this.breakoutClick(sx, sy);
      if (this.tool === "leader") return this.leaderClick(sx, sy);
      if (["surface", "gdt", "datum"].includes(this.tool)) return this.symbolClick(sx, sy);
      const dimEl = e.target.closest("[data-dim]");
      const noteEl = e.target.closest("[data-note]");
      const balloonEl = e.target.closest("[data-balloon]");
      const weldEl = e.target.closest("[data-weld]");
      const tableEl = e.target.closest("[data-holetable]");
      const leaderEl = e.target.closest("[data-leader]");
      const symEl = e.target.closest("[data-symbol]");
      const viewEl = e.target.closest("[data-view]");
      if (symEl) { this.select({ type: "symbol", id: symEl.getAttribute("data-symbol") }); drag = { kind: "symbol", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (tableEl) { this.select({ type: "holetable", id: tableEl.getAttribute("data-holetable") }); drag = { kind: "holetable", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (leaderEl) { this.select({ type: "leader", id: leaderEl.getAttribute("data-leader") }); drag = { kind: "leader", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (weldEl) { this.select({ type: "weld", id: weldEl.getAttribute("data-weld") }); drag = { kind: "weld", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (balloonEl) { this.select({ type: "balloon", id: balloonEl.getAttribute("data-balloon") }); drag = { kind: "balloon", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (dimEl) { this.select({ type: "dim", id: dimEl.getAttribute("data-dim") }); drag = { kind: "dim", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (noteEl) { this.select({ type: "note", id: noteEl.getAttribute("data-note") }); drag = { kind: "note", id: this.sel.id, start: [sx, sy], moved: false }; }
      else if (viewEl) {
        const id = viewEl.getAttribute("data-view");
        this.select({ type: "view", id });
        const v = this.doc.views.find((x) => x.id === id);
        drag = { kind: "view", id, start: [sx, sy], orig: this.doc.views.map((x) => ({ id: x.id, x: x.x, y: x.y })), moved: false, v };
      } else this.select(null);
      st.setPointerCapture(e.pointerId);
    });
    st.addEventListener("pointermove", (e) => {
      if (!this.doc) return;
      if (drag?.kind === "pan") {
        this.pan = [drag.pan[0] + e.clientX - drag.x, drag.pan[1] + e.clientY - drag.y];
        if (this.svg) this.svg.style.transform = `translate(${this.pan[0]}px, ${this.pan[1]}px) scale(${this.zoom})`;
        return;
      }
      const [sx, sy] = this.clientToSheet(e.clientX, e.clientY);
      if (drag) {
        const dx = sx - drag.start[0], dy = sy - drag.start[1];
        if (!drag.moved && Math.hypot(dx, dy) * this.zoom * this.pxPerMm < 3) return;
        if (!drag.moved) { drag.moved = true; this.app.checkpoint("Verschieben"); }
        const d = this.doc;
        if (drag.kind === "view") {
          const O = new Map(drag.orig.map((o) => [o.id, o]));
          const v = drag.v;
          let mdx = dx, mdy = dy;
          if (v.align === "x") mdx = 0;
          else if (v.align === "y") mdy = 0;
          else if (v.parent && v.align !== "free" && v.type !== "detail" && v.type !== "aux") { const t = v.type; if (t === "top" || t === "bottom" || (t === "section" && v.axis !== "v")) mdx = 0; else mdy = 0; }
          v.x = O.get(v.id).x + mdx;
          v.y = O.get(v.id).y + mdy;
          for (const c of d.views) if (c.parent === v.id && c.type !== "detail" && c.align !== "free") {
            const o = O.get(c.id);
            c.x = o.x + mdx;
            c.y = o.y + mdy;
          }
        } else if (drag.kind === "dim") {
          const m = d.dims.find((x) => x.id === drag.id);
          const v = d.views.find((x) => x.id === m.view);
          const xf = this.viewXf(v);
          if (m.kind === "dia" || m.kind === "rad") { const [cx, cy] = xf.to(m.circle.cx, m.circle.cy); m.angle = Math.atan2(sy - cy, sx - cx); }
          else m.off = this.offsetFor(m, xf, sx, sy);
          if (m.auto) m.touched = true;
        } else if (drag.kind === "balloon") {
          const b = d.balloons.find((x) => x.id === drag.id);
          if (!drag.o) drag.o = [...b.at];
          b.at = [drag.o[0] + dx, drag.o[1] + dy];
        } else if (drag.kind === "holetable" || drag.kind === "leader" || drag.kind === "symbol") {
          const o = (drag.kind === "holetable" ? d.holeTables : drag.kind === "leader" ? d.leaders : d.symbols).find((x) => x.id === drag.id);
          if (!drag.o) drag.o = [...o.at];
          o.at = [r3(drag.o[0] + dx), r3(drag.o[1] + dy)];
          if (o.auto) o.touched = true;
        } else if (drag.kind === "weld") {
          const w = d.welds.find((x) => x.id === drag.id);
          if (!drag.o) drag.o = [...w.at];
          w.at = [drag.o[0] + dx, drag.o[1] + dy];
        } else if (drag.kind === "note") {
          const n = d.notes.find((x) => x.id === drag.id);
          if (!drag.o) drag.o = [n.x, n.y];
          n.x = drag.o[0] + dx; n.y = drag.o[1] + dy;
          if (n.auto) n.touched = true;
        }
        this.render();
        return;
      }
      if (this.tool === "proj") {
        const pl = this.projPlan(sx, sy), r = pl && this.sheetRects(this.doc)[pl.parent.id]?.rect;
        this.projGhost = r ? { x: pl.x, y: pl.y, w: pl.cam.align === "y" ? (r[2] - r[0]) * 0.6 : r[2] - r[0], h: pl.cam.align === "x" ? (r[3] - r[1]) * 0.6 : r[3] - r[1] } : null;
        this.render();
      }
      if (this.tool === "chain" || this.tool === "base") {
        const s = this.snapAt(sx, sy);
        this.snapMark = s ? s.s : null;
        this.render();
      }
      if (this.tool === "dim") {
        const s = this.snapAt(sx, sy);
        this.snapMark = s ? s.s : null;
        if (this.pendingDim?.ready) {
          this.previewDim(sx, sy);
        }
        this.render();
      }
    });
    st.addEventListener("pointerup", () => {
      if (drag?.moved) this.app.changed({ rebuild: false });
      drag = null;
    });
    st.addEventListener("contextmenu", (e) => e.preventDefault());
    st.addEventListener("dblclick", (e) => {
      const dimEl = e.target.closest("[data-dim]");
      if (dimEl) this.editDimText(dimEl.getAttribute("data-dim"));
      const noteEl = e.target.closest("[data-note]");
      if (noteEl) this.editNote(noteEl.getAttribute("data-note"));
      const leaderEl = e.target.closest("[data-leader]");
      if (leaderEl) this.editLeader(leaderEl.getAttribute("data-leader"));
      const symEl = e.target.closest("[data-symbol]");
      if (symEl) { const y = this.doc.symbols.find((x) => x.id === symEl.getAttribute("data-symbol")); if (y) this.symbolDialog(y, false); }
    });
  }
  /** Ketten- und Bezugsmaß (FU11): Punkte sammeln, nach dem zweiten die Lage der Reihe, dann laufend ergänzen */
  chainClick(sx, sy) {
    const d = this.doc;
    const pc = this.pendingChain;
    const mode = this.tool === "base" ? "bezug" : "kette";
    if (pc?.placing) {
      const v = d.views.find((x) => x.id === pc.view);
      pc.off = this.offsetFor({ kind: pc.kind, p1: pc.pts[0], p2: pc.pts[1] }, this.viewXf(v), sx, sy) || 10;
      pc.placing = false;
      this.updateChain(mode);
      return;
    }
    const s = this.snapAt(sx, sy);
    if (!s) return;
    if (!pc) { this.pendingChain = { view: s.view, pts: [s.p], ids: [] }; this.render(); return; }
    if (s.view !== pc.view) { toast("Alle Punkte müssen in derselben Ansicht liegen"); return; }
    pc.pts.push(s.p);
    if (pc.pts.length === 2) {
      const [a, b] = pc.pts;
      pc.kind = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? "h" : "v";
      pc.placing = true;
      this.app.setHint("Lage der Maßreihe klicken");
      this.render();
      return;
    }
    this.updateChain(mode);
  }
  /** Maße der laufenden Kette neu erzeugen (ersetzt die bisher erzeugten) */
  updateChain(mode) {
    const d = this.doc, pc = this.pendingChain;
    const list = chainDims(pc.pts, { kind: pc.kind, mode, off: pc.off }).map((m) => ({ id: uid("m"), view: pc.view, ...m, fixedKind: true }));
    this.app.edit(mode === "bezug" ? "Bezugsmaß" : "Kettenmaß", () => {
      d.dims = (d.dims || []).filter((m) => !pc.ids.includes(m.id)).concat(list);
    }, { rebuild: false });
    pc.ids = list.map((m) => m.id);
    this.app.setHint((mode === "bezug" ? "Bezugsmaß" : "Kettenmaß") + ": weitere Punkte anklicken, Esc beendet");
    this.render();
  }
  /** Bogen unter dem Mauszeiger (auch Teilbögen) mit Winkeln in Ansichtskoordinaten */
  arcAt(sx, sy) {
    const d = this.doc;
    for (const v of d.views) {
      if (v.type === "iso") continue;
      const p = this.viewGeom(v);
      if (!p) continue;
      const xf = this.viewXf(v);
      for (const a of p.arcs || []) {
        const [x, y] = xf.to(a.cx, a.cy);
        if (Math.abs(Math.hypot(x - sx, y - sy) - a.r * v.scale) < 1.5 / this.zoom) return { view: v, arc: a };
      }
    }
    return null;
  }
  /** Winkelmaß von Hand: erste Kante merken, mit der zweiten das Maß setzen */
  angleClick(sx, sy) {
    const d = this.doc;
    const rects = this.sheetRects(d);
    const v = d.views.find((x) => { const r = rects[x.id]?.rect; return x.type !== "iso" && r && sx >= r[0] - 3 && sx <= r[2] + 3 && sy >= r[1] - 3 && sy <= r[3] + 3; });
    if (!v) return toast("Kante in einer Ansicht anklicken");
    const q = this.viewXf(v).from(sx, sy), seg = nearestSegment(this.proj.get(v.id).visible, q, 3 / (v.scale * this.zoom));
    if (!seg) return toast("Keine Kante getroffen");
    const first = this.pendingAngle;
    if (!first || first.view !== v.id) { this.pendingAngle = { view: v.id, seg, q }; return toast("Zweite Kante anklicken", { timeout: 1200 }); }
    this.pendingAngle = null;
    const g = angleFromSegments(first.seg, first.q, seg, q);
    if (!g) return toast("Die Kanten sind parallel – kein Winkel");
    const m = { id: uid("m"), view: v.id, kind: "ang", ...g, off: 12 };
    this.app.edit("Winkelmaß", () => { (d.dims = d.dims || []).push(m); }, { rebuild: false });
    this.render();
  }
  arcLenClick(sx, sy) {
    const hit = this.arcAt(sx, sy);
    if (!hit) return;
    const { view, arc } = hit;
    if (arc.full) return toast("Vollkreis: Durchmesser bemaßen");
    const a0 = Number.isFinite(arc.a0) ? arc.a0 : 0, a1 = Number.isFinite(arc.a1) ? arc.a1 : a0 + (arc.sweep || 0);
    const d = this.doc;
    const m = { id: uid("m"), view: view.id, kind: "arc", circle: { cx: arc.cx, cy: arc.cy, r: arc.r }, a0: Math.min(a0, a1), sweep: Math.abs(a1 - a0), off: 8 };
    this.app.edit("Bogenlänge", () => { (d.dims = d.dims || []).push(m); }, { rebuild: false });
    this.render();
  }
  /** Mittelpunktmarkierung von Hand (auch für Bögen), zweiter Klick entfernt sie */
  centerClick(sx, sy) {
    const hit = this.arcAt(sx, sy);
    if (!hit) return;
    const d = this.doc, { view, arc } = hit;
    const same = (c) => c.view === view.id && Math.hypot(c.cx - arc.cx, c.cy - arc.cy) < 1e-6;
    this.app.edit("Mittelpunkt", () => {
      if ((d.centerMarks || []).some(same)) { d.centerMarks = d.centerMarks.filter((c) => !same(c)); if (!d.centerMarks.length) delete d.centerMarks; }
      else (d.centerMarks = d.centerMarks || []).push({ id: uid("cm"), view: view.id, cx: arc.cx, cy: arc.cy, r: arc.r });
    }, { rebuild: false });
    this.render();
  }
  renderCenterMarks(d) {
    const parts = [];
    for (const c of d.centerMarks || []) {
      const v = d.views.find((x) => x.id === c.view);
      if (!v || !this.proj.get(v.id)) continue;
      const [x, y] = this.viewXf(v).to(c.cx, c.cy);
      const r = c.r * v.scale + 2;
      parts.push(`M${r3(x - r)} ${r3(y)}H${r3(x + r)}M${r3(x)} ${r3(y - r)}V${r3(y + r)}`);
    }
    return parts.length ? svgEl("path", { d: parts.join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.thin, "stroke-dasharray": "6 1 1 1" }) : null;
  }
  /** Waagrechte und senkrechte Maße je Ansicht in Reihen ausrichten (DIN 406: 10 mm, dann 7 mm) */
  alignDims({ quiet = false } = {}) {
    const d = this.doc;
    const changes = new Map();
    for (const v of d.views) {
      const xf = this.viewXf(v);
      for (const kind of ["h", "v"]) {
        const k = kind === "h" ? 1 : 0, along = 1 - k;
        const items = (d.dims || []).filter((m) => m.view === v.id && m.kind === kind && !m.ord && m.p1 && m.p2).map((m) => {
          const A = xf.to(...m.p1), B = xf.to(...m.p2), side = (m.off ?? 10) >= 0 ? 1 : -1;
          return { id: m.id, side, edge: side > 0 ? Math.max(A[k], B[k]) : Math.min(A[k], B[k]), lo: Math.min(A[along], B[along]), hi: Math.max(A[along], B[along]) };
        });
        const pos = alignRows(items);
        for (const it of items) changes.set(it.id, pos.get(it.id) - it.edge);
      }
    }
    if (!changes.size) return quiet ? undefined : toast("Keine waagrechten oder senkrechten Maße zum Ausrichten");
    this.app.edit("Maße ausrichten", () => { for (const m of d.dims) if (changes.has(m.id)) m.off = Math.round(changes.get(m.id) * 100) / 100; }, { rebuild: false });
    this.render();
    if (!quiet) toast(`${changes.size} Maße in Reihen ausgerichtet`, { kind: "ok" });
  }
  /** Zeichnung aufräumen (N7): doppelte Maße und Verwaistes entfernen, Maße und Positionsnummern in Reihen */
  cleanup() {
    const d = this.doc;
    if (!d) return;
    const views = Object.fromEntries(d.views.map((v) => { const c = this.viewCam(d, v); return [v.id, { axes: v.type === "flat" ? ["F1", "F2"] : c ? viewAxes(c.dir, c.up) : [null, null] }]; }));
    const r = cleanupDrawing(d, views, new Set(d.views.map((v) => v.id)));
    if (r.removed.duplicates + r.removed.orphans) {
      this.app.edit("Zeichnung aufräumen", () => { d.dims = r.dims; d.leaders = r.leaders; d.balloons = r.balloons; }, { rebuild: false });
    }
    if (d.dims.some((m) => m.kind === "h" || m.kind === "v")) this.alignDims({ quiet: true });
    if (d.balloons?.length) this.alignBalloonRows();
    this.render();
    const parts = [r.removed.duplicates ? `${r.removed.duplicates} doppelte Maße entfernt` : "", r.removed.orphans ? `${r.removed.orphans} Einträge ohne Ansicht entfernt` : ""].filter(Boolean);
    toast((parts.length ? parts.join(", ") + "; " : "Keine doppelten Maße; ") + "Maße und Positionsnummern ausgerichtet", { kind: "ok" });
  }
  /** Positionsnummern im Uhrzeigersinn neu nummerieren (Reihenfolge gilt für Stückliste dieser Zeichnung) */
  renumberBalloons() {
    const d = this.doc;
    if (!d.balloons?.length) return toast("Erst Positionsnummern setzen");
    const v = d.views.find((x) => x.id === d.balloons[0].view);
    const xf = v && this.viewXf(v);
    const c = xf ? xf.to((xf.bb.x0 + xf.bb.x1) / 2, (xf.bb.y0 + xf.bb.y1) / 2) : [0, 0];
    const order = clockwiseOrder(d.balloons.map((b) => ({ key: b.part, at: b.at })), c);
    this.app.edit("Positionen neu nummerieren", () => { d.posOrder = order; }, { rebuild: false });
    this.render();
    toast("Positionen im Uhrzeigersinn neu nummeriert – die Stückliste der Zeichnung folgt", { kind: "ok" });
  }
  /** Positionsnummern an den Seiten der Ansicht in Reihen ausrichten */
  alignBalloonRows() {
    const d = this.doc;
    if (!d.balloons?.length) return toast("Erst Positionsnummern setzen");
    const [W, H] = this.sheetSize(d);
    const moved = new Map();
    for (const v of d.views) {
      const list = d.balloons.filter((b) => b.view === v.id);
      if (!list.length) continue;
      const xf = this.viewXf(v);
      const [x0, y0] = xf.to(xf.bb.x0, xf.bb.y1), [x1, y1] = xf.to(xf.bb.x1, xf.bb.y0);
      const pos = alignBalloons(list.map((b) => ({ key: b.id, at: b.at })), { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) });
      for (const [k, [x, y]] of pos) moved.set(k, [Math.min(W - 15, Math.max(25, x)), Math.min(H - 15, Math.max(15, y))]);
    }
    this.app.edit("Positionsnummern ausrichten", () => { for (const b of d.balloons) if (moved.has(b.id)) b.at = moved.get(b.id); }, { rebuild: false });
    this.render();
  }
  offsetFor(m, xf, sx, sy) {
    if (m.kind === "ang") { const C = xf.to(...m.c); return Math.max(4, Math.hypot(sx - C[0], sy - C[1])); }
    const A = xf.to(...m.p1), B = xf.to(...m.p2);
    if (m.kind === "h") { const top = Math.max(A[1], B[1]), bot = Math.min(A[1], B[1]); return sy >= top ? sy - top : sy <= bot ? sy - bot : sy - top; }
    if (m.kind === "v") { const r = Math.max(A[0], B[0]), l = Math.min(A[0], B[0]); return sx >= r ? sx - r : sx <= l ? sx - l : sx - r; }
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    return ((sx - A[0]) * -dy + (sy - A[1]) * dx) / L;
  }
  dimClick(sx, sy) {
    const d = this.doc;
    const pd = this.pendingDim;
    if (pd?.ready) {
      const m = pd.m;
      const v = d.views.find((x) => x.id === m.view);
      const xf = this.viewXf(v);
      if (m.kind === "dia" || m.kind === "rad") { const [cx, cy] = xf.to(m.circle.cx, m.circle.cy); m.angle = Math.atan2(sy - cy, sx - cx); }
      else {
        const A = xf.to(...m.p1), B = xf.to(...m.p2);
        if (!m.fixedKind) {
          const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]);
          const outX = sx < x0 || sx > x1, outY = sy < y0 || sy > y1;
          m.kind = Math.abs(A[1] - B[1]) < 1e-6 ? "h" : Math.abs(A[0] - B[0]) < 1e-6 ? "v" : outY && !outX ? "h" : outX && !outY ? "v" : "a";
        }
        m.off = this.offsetFor(m, xf, sx, sy);
      }
      this.app.edit("Bemaßung", () => { d.dims.push(m); }, { rebuild: false });
      this.pendingDim = null;
      this.render();
      return;
    }
    const s = this.snapAt(sx, sy);
    if (!s) {
      const c = this.circleAt(sx, sy);
      if (c) { this.pendingDim = { ready: true, m: { id: uid("m"), view: c.view, kind: c.full ? "dia" : "rad", circle: c.circle, angle: -Math.PI / 4 } }; this.render(); }
      return;
    }
    if (!pd) { this.pendingDim = { first: s, p1s: s.s }; this.render(); return; }
    if (s.view !== pd.first.view) { toast("Beide Punkte müssen in derselben Ansicht liegen"); this.pendingDim = null; this.render(); return; }
    if (Math.hypot(s.p[0] - pd.first.p[0], s.p[1] - pd.first.p[1]) < 1e-6) return;
    this.pendingDim = { ready: true, m: { id: uid("m"), view: s.view, kind: "a", p1: pd.first.p, p2: s.p, off: 8 } };
    this.render();
  }
  previewDim(sx, sy) {
    const d = this.doc;
    const m = this.pendingDim.m;
    const v = d.views.find((x) => x.id === m.view);
    const xf = this.viewXf(v);
    if (m.kind === "dia" || m.kind === "rad") { const [cx, cy] = xf.to(m.circle.cx, m.circle.cy); m.angle = Math.atan2(sy - cy, sx - cx); }
    else {
      const A = xf.to(...m.p1), B = xf.to(...m.p2);
      const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]);
      const outX = sx < x0 || sx > x1, outY = sy < y0 || sy > y1;
      m.kind = Math.abs(A[1] - B[1]) < 1e-6 ? "h" : Math.abs(A[0] - B[0]) < 1e-6 ? "v" : outY && !outX ? "h" : outX && !outY ? "v" : "a";
      m.off = this.offsetFor(m, xf, sx, sy);
    }
  }
  async textClick(sx, sy) {
    const text = await promptDialog("Text", "Hinweistext", "");
    if (!text) return;
    const d = this.doc;
    this.app.edit("Text", () => { d.notes = d.notes || []; d.notes.push({ id: uid("n"), x: sx, y: sy, text, size: 3.5 }); }, { rebuild: false });
    this.render();
  }
  async editNote(id) {
    const d = this.doc;
    const n = d.notes.find((x) => x.id === id);
    const text = await promptDialog("Text ändern", "Hinweistext", n.text);
    if (text === null) return;
    this.app.edit("Text", () => { n.text = text; if (n.auto) n.touched = true; }, { rebuild: false });
    this.render();
  }
  async editDimText(id) {
    const d = this.doc;
    const m = d.dims.find((x) => x.id === id);
    const cls = classOf(d.title?.toleranz);
    const showTol = () => { const a = document.getElementById("dm-tol")?.value; for (const el of document.querySelectorAll(".dm-tol-f")) el.style.display = el.dataset.art === a ? "" : "none"; };
    setTimeout(showTol, 0);
    modal({
      title: "Maß bearbeiten",
      body: h("div", {},
        h("div", { class: "field" }, h("label", {}, "Wert"), h("div", {}, fmtNum(this.dimValue(m), 3) + " mm")),
        h("div", { class: "field" }, h("label", {}, "Nachkommastellen"), h("input", { class: "inp", id: "dm-dec", type: "number", min: 0, max: 3, value: m.decimals ?? d.nachkomma ?? 1 })),
        h("div", { class: "field" }, h("label", {}, "Toleranz"), h("select", { class: "inp", id: "dm-tol", onchange: showTol }, ...TOL_KINDS.map((k) => h("option", { value: k.value, selected: (m.tol?.art || "") === k.value }, k.label)))),
        h("div", { class: "field dm-tol-f", "data-art": "sym" }, h("label", {}, "±"), h("input", { class: "inp", id: "dm-sym", value: m.tol?.art === "sym" ? fmtNum(m.tol.v, 3) : "" })),
        h("div", { class: "field dm-tol-f", "data-art": "abm" }, h("label", {}, "Oberes Abmaß"), h("input", { class: "inp", id: "dm-o", value: m.tol?.art === "abm" ? fmtNum(m.tol.o, 3) : "" })),
        h("div", { class: "field dm-tol-f", "data-art": "abm" }, h("label", {}, "Unteres Abmaß"), h("input", { class: "inp", id: "dm-u", value: m.tol?.art === "abm" ? fmtNum(m.tol.u, 3) : "" })),
        h("div", { class: "field dm-tol-f", "data-art": "pass" }, h("label", {}, "Passung"), h("input", { class: "inp", id: "dm-pass", value: m.tol?.art === "pass" ? m.tol.pass : "", placeholder: "H7" })),
        h("p", { class: "hint dm-tol-f", "data-art": "allg" }, cls ? `ISO 2768-${cls}: ${toleranceText({ art: "allg" }, this.dimValue(m), cls, m.kind === "rad" ? "rad" : "lin") || "für dieses Maß keine Angabe in der Norm"}` : "Im Schriftfeld steht keine Klasse nach ISO 2768 – es wird nichts angezeigt."),
        h("div", { class: "field" }, h("label", {}, "Zusatz (frei)"), h("input", { class: "inp", id: "dm-suf", value: m.suffix || "" }))),
      buttons: [{ label: "Löschen", danger: true, run: () => { this.app.edit("Maß löschen", () => { d.dims = d.dims.filter((x) => x.id !== id); }, { rebuild: false }); this.render(); } },
        { label: "Abbrechen" },
        { label: "OK", primary: true, run: () => {
          const dec = Number(document.getElementById("dm-dec").value);
          const suf = document.getElementById("dm-suf").value;
          const val = (id) => document.getElementById(id).value;
          const r = validateTolerance({ art: val("dm-tol"), v: val("dm-sym"), o: val("dm-o"), u: val("dm-u"), pass: val("dm-pass") });
          if (!r.ok) { toast(r.error, { kind: "err" }); return false; }
          this.app.edit("Maß", () => { m.decimals = Math.max(0, Math.min(3, dec)); m.suffix = suf; if (r.value) m.tol = r.value; else delete m.tol; if (m.auto) m.touched = true; }, { rebuild: false });
          this.render();
        } }],
    });
  }
  autoDims({ silent = false } = {}) {
    const d = this.doc;
    // Vorderansicht zuerst, damit Breite und Höhe dort stehen; jede Raumrichtung und jeder Bohrungs-Ø nur einmal
    const order = (v) => (v.type === "front" ? 0 : v.type === "section" ? 2 : 1);
    const cands = d.views.filter((v) => v.type !== "iso" && v.type !== "detail" && this.proj.get(v.id)?.bbox).sort((a, b) => order(a) - order(b));
    // erneuter Aufruf ersetzt die eigenen, nicht angefassten Maße; verschobene oder bearbeitete bleiben
    const ids = new Set(cands.map((v) => v.id));
    const keep = d.dims.filter((m) => !(m.auto && !m.touched && ids.has(m.view)));
    const used = { axes: new Set(), radii: new Set() };
    for (const m of keep) {
      if (!m.auto) continue;
      if (m.axis) used.axes.add(m.axis);
      if (m.wall) used.wall = true;
      if (m.kind === "dia" && !m.pcd) used.radii.add(Math.round(m.circle.r * 1000));
      if (m.kind === "rad") (used.rads ||= new Set()).add(Math.round(m.circle.r * 1000));
    }
    const keepLeaders = (d.leaders || []).filter((L) => !(L.auto && !L.touched && ids.has(L.view)));
    for (const L of keepLeaders) if (L.auto && L.fase) (used.chamfersDone ||= new Set()).add(Math.round(L.fase * 1000));
    const items = this.sourceItems(d) || [];
    const ev = (part) => { const scope = resolveParams(part.params || []).values; return (x) => evaluate(String(x), scope); };
    const holes = items.flatMap((it) => holeSpecs(it.part.features, ev(it.part)));
    // Fasenmaße aus den Fasen-Features (Hinweis „2 × 45°“)
    used.chamfers = [...new Set(items.flatMap((it) => { const e = ev(it.part); return it.part.features.filter((f) => f.type === "chamfer" && !f.suppressed).map((f) => { try { return e(f.radius); } catch { return null; } }).filter((x) => x > 0); }))];
    // Einzelteil aus einem Profil: Querschnitt als Profilangabe statt Einzelmaßen
    const src = d.source && this.app.doc(d.source.id);
    used.profile = this.profileOf(d);
    // Wandstärke nur bei einem einzelnen Hohlkörper, nicht bei Rahmen/Schweißbaugruppen aus mehreren Profilen
    const profiled = src?.kind !== "part" || src.features.some((f) => !f.suppressed && ["frame", "profilzug", "biegerohr", "knickrahmen", "profile"].includes(f.type));
    if (profiled) used.wall = true;
    // Eckradien von Profilen gehören zur Profilangabe und werden nicht als Rundung bemaßt
    if (profiled) used.noRadii = true;
    const views = cands.filter((v) => !keep.some((m) => m.view === v.id && m.auto)).map((v) => {
      const c = this.viewCam(d, v), p = this.proj.get(v.id);
      return { id: v.id, axes: v.type === "flat" ? ["F1", "F2"] : viewAxes(c.dir, c.up), bbox: p.bbox, arcs: p.arcs, lines: p.visible, holes };
    });
    const planned = planAutoDims(views, used);
    const add = planned.filter((m) => m.kind !== "fase").map((m) => ({ id: uid("m"), ...m, auto: true }));
    const fasen = planned.filter((m) => m.kind === "fase");
    const keepNotes = (d.notes || []).filter((n) => !(n.auto && !n.touched));
    const notes = []; // Profilangabe steht im Schriftfeld (Halbzeug)
    if (!add.length && !notes.length && !fasen.length && keep.length === d.dims.length && keepLeaders.length === (d.leaders || []).length) return silent ? undefined : toast("Keine weiteren Hauptmaße gefunden");
    layoutAutoDims([...add, ...fasen], this.sheetRects(d), { ...this.sheetObstacles(d, keep), notes });
    const apply = () => {
      d.dims = [...keep, ...add];
      d.leaders = [...keepLeaders, ...fasen.map((m) => ({ id: uid("l"), view: m.view, p: m.p.map(r3), at: m.at, text: m.text, fase: m.fase, auto: true }))];
      d.notes = [...keepNotes, ...notes.map((n) => ({ id: uid("n"), x: n.x, y: n.y, text: n.text, size: 3.5, auto: true }))];
    };
    if (silent) { apply(); this.app.changed({ rebuild: false }); }
    else this.app.edit("Hauptmaße", apply, { rebuild: false });
    this.render();
  }
  /** Gewindebohrungen der Ansicht: Kreise mit Kernloch-Ø eines Gewinde-Features -> Kreise mit Nenndurchmesser */
  threadArcs(d, p) {
    const full = (p.arcs || []).filter((a) => a.full);
    if (!full.length) return [];
    const specs = (this.sourceItems(d) || []).flatMap((it) => { const scope = resolveParams(it.part.params || []).values; return holeSpecs(it.part.features, (x) => evaluate(String(x), scope)); }).filter((s) => s.hole.thread);
    const out = [];
    for (const a of full) {
      const s = specs.find((x) => Math.abs(x.r - a.r) < 0.02);
      const nom = s && parseFloat(s.hole.thread.slice(1));
      if (nom > a.r * 2 && !out.some((o) => Math.abs(o.cx - a.cx) < 1e-3 && Math.abs(o.cy - a.cy) < 1e-3)) out.push({ cx: a.cx, cy: a.cy, r: nom / 2 });
    }
    return out;
  }
  /** Profilangabe des Quellteils (Halbzeug), Länge wie in der Zuschnittliste */
  profileOf(d) {
    const src = d?.source && this.app.doc(d.source.id);
    if (src?.kind !== "part") return null;
    const scope = resolveParams(src.params || []).values;
    const member = this.app.results.get(src.id)?.bodies?.find((b) => b.kind === "member" && b.meta?.length);
    return profileSpec(src.features, (x) => evaluate(String(x), scope), member?.meta.length);
  }
  /** Ansichten als Rechtecke auf dem Blatt (für die Platzierung der Maße) */
  sheetRects(d) {
    const out = {};
    for (const v of d.views) {
      const p = this.proj.get(v.id);
      if (!p?.bbox) continue;
      const xf = this.viewXf(v), bb = xf.bb;
      let [x0, y0] = xf.to(bb.x0, bb.y1), [x1, y1] = xf.to(bb.x1, bb.y0);
      if (v.type === "detail") { const r = v.r * v.scale; [x0, y0, x1, y1] = [v.x - r, v.y - r, v.x + r, v.y + r]; }
      out[v.id] = { to: xf.to, rect: [x0, y0, x1, y1], scale: v.scale, circles: (p.arcs || []).filter((a) => a.full) };
    }
    return out;
  }
  /** Belegte Flächen: Schriftfeld, Stückliste, vorhandene Maße; dazu die nutzbare Fläche im Rahmen */
  sheetObstacles(d, dims) {
    const [W, H] = this.sheetSize(d);
    const obstacles = [[W - 192, H - 58, W - 10, H - 10]]; // Schriftfeld mit 2 mm Luft
    const rows = d.bomTable?.show ? this.bomRowsOf(d).length : 0;
    if (rows) obstacles.push([W - 192, H - 58 - 6 * (rows + 1), W - 10, H - 58]);
    const views = this.sheetRects(d);
    for (const m of dims) {
      const v = views[m.view];
      if (!v) continue;
      if (m.kind === "dia" || m.kind === "rad") {
        const [cx, cy] = v.to(m.circle.cx, m.circle.cy), ang = m.angle ?? -Math.PI / 4, R = m.circle.r * v.scale + (m.lead ?? LEAD);
        const px = cx + Math.cos(ang) * R, py = cy + Math.sin(ang) * R, w = Math.max(10, textWidth(dimLabel(m)) + 2);
        obstacles.push(Math.cos(ang) >= 0 ? [px, py - 5, px + w, py + 0.5] : [px - w, py - 5, px, py + 0.5]);
        continue;
      }
      const A = v.to(...m.p1), B = v.to(...m.p2), off = m.off ?? 10;
      if (m.kind === "h") { const y = (off >= 0 ? Math.max(A[1], B[1]) : Math.min(A[1], B[1])) + off; obstacles.push([Math.min(A[0], B[0]), y - 4.5, Math.max(A[0], B[0]), y + 1]); }
      else if (m.kind === "v") { const x = (off >= 0 ? Math.max(A[0], B[0]) : Math.min(A[0], B[0])) + off; obstacles.push([x - 4.5, Math.min(A[1], B[1]), x + 4.5, Math.max(A[1], B[1])]); }
    }
    return { obstacles, frame: [20, 10, W - 10, H - 10] };
  }
  select(sel) {
    this.sel = sel;
    this.render();
    this.app.props.render();
    this.app.tree.render();
  }
  key(e) {
    if (e.key === "Escape") { if (this.tool || this.pendingDim || this.pendingChain) { this.setTool(null); return true; } if (this.sel) { this.select(null); return true; } return false; }
    if (e.key === "Delete" && this.sel) {
      const d = this.doc;
      if (this.sel.type === "view") this.deleteView(this.sel.id);
      else if (this.sel.type === "dim") { this.app.edit("Maß löschen", () => { d.dims = d.dims.filter((m) => m.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "holetable") { this.app.edit("Bohrungstabelle löschen", () => { d.holeTables = d.holeTables.filter((x) => x.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "symbol") { this.app.edit("Symbol löschen", () => { d.symbols = d.symbols.filter((x) => x.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "leader") { this.app.edit("Hinweis löschen", () => { d.leaders = d.leaders.filter((x) => x.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "weld") { this.app.edit("Nahtsymbol löschen", () => { d.welds = d.welds.filter((w) => w.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "balloon") { this.app.edit("Positionsnummer löschen", () => { d.balloons = d.balloons.filter((b) => b.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "note") { this.app.edit("Text löschen", () => { d.notes = d.notes.filter((m) => m.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      return true;
    }
    return false;
  }
  /** Eigene Zeichnungsvorlage (FU12): gilt als Vorgabe für neue Zeichnungen und für dieses Projekt */
  templateDialog() {
    const app = this.app;
    const cur = templateOf(app.project.drawingTemplate || app.prefs.get("zeichnung.vorlage"));
    const v = { ...cur, extra: cur.extra.map((f) => ({ ...f })) };
    const inp = (val, ph) => h("input", { class: "inp", value: val || "", placeholder: ph || "" });
    const firma = h("textarea", { class: "inp", rows: 2, placeholder: "Firma (erste Zeile steht im Schriftfeld)" });
    firma.value = v.firma;
    const erst = inp(v.ersteller, "Kürzel oder Name");
    const lg = h("select", { class: "inp" }, ...Object.keys(LINE_GROUPS).map((k) => h("option", { value: k, selected: k === v.lineGroup }, `Liniengruppe ${k.replace(".", ",")}${k === "0.5" ? " (Standard)" : ""}`)));
    const dt = h("select", { class: "inp" }, ...DIM_TEXT_SIZES.map((x) => h("option", { value: x, selected: x === v.dimText }, String(x).replace(".", ",") + " mm")));
    const logoBox = h("div", { class: "btn-row" });
    const drawLogo = () => logoBox.replaceChildren(
      v.logo ? h("img", { src: v.logo, style: { height: "28px", border: "1px solid var(--steel-2)" } }) : h("span", { class: "hint" }, "kein Logo"),
      h("button", { class: "btn", onclick: async () => { const im = await app.files.pickImage(); if (im) { v.logo = await shrinkLogo(im.src); drawLogo(); } } }, "Logo wählen…"),
      v.logo ? h("button", { class: "btn", onclick: () => { v.logo = null; drawLogo(); } }, "Entfernen") : null);
    drawLogo();
    const rows = Array.from({ length: MAX_EXTRA }, (_, i) => [inp(v.extra[i]?.label, "Bezeichnung, z. B. Auftrag"), inp(v.extra[i]?.value, "Vorgabewert")]);
    const f = (label, el) => h("div", { class: "field wide" }, h("label", {}, label), el);
    modal({ title: "Zeichnungsvorlage", width: "560px",
      body: h("div", { class: "template-dialog" },
        h("p", { class: "hint" }, "Gilt für neue Zeichnungen und wird mit dem Projekt gespeichert. Logo und Zusatzfelder erscheinen im Schriftfeld."),
        f("Firma", firma), f("Gezeichnet", erst), f("Logo", logoBox), f("Linienbreiten", lg), f("Maßzahlhöhe", dt),
        h("h4", {}, "Zusatzfelder im Schriftfeld"), ...rows.map(([a, b]) => h("div", { class: "btn-row" }, a, b))),
      buttons: [{ label: "Abbrechen" }, { label: "Speichern", primary: true, run: () => {
        const val = { firma: firma.value, ersteller: erst.value.trim(), logo: v.logo, lineGroup: lg.value, dimText: Number(dt.value),
          extra: rows.map(([a, b]) => ({ label: a.value.trim(), value: b.value })).filter((x) => x.label) };
        const r = validateTemplate(val);
        if (!r.ok) { toast(r.error, { kind: "err" }); return false; }
        app.prefs.set("zeichnung.vorlage", r.value);
        app.edit("Zeichnungsvorlage", () => {
          app.project.drawingTemplate = r.value;
          // Firma und Ersteller in Zeichnungen ohne eigenen Eintrag übernehmen
          for (const x of app.project.docs) if (x.kind === "drawing") { x.title.firma = x.title.firma || r.value.firma; x.title.ersteller = x.title.ersteller || r.value.ersteller; }
        }, { rebuild: false });
        this.render();
        app.props.render();
        toast("Zeichnungsvorlage gespeichert", { kind: "ok" });
      } }] });
  }
  fitSheet() {
    const d = this.doc;
    if (!d) return;
    const [W, H] = this.sheetSize(d);
    const r = this.stage.getBoundingClientRect();
    const ppm = this.pxPerMm || 3.78;
    this.zoom = Math.min((r.width - 40) / (W * ppm), (r.height - 40) / (H * ppm));
    this.pan = [(r.width - W * ppm * this.zoom) / 2, (r.height - H * ppm * this.zoom) / 2];
    this.render();
  }

  // ---------- Eigenschaften ----------
  /**
   * Maßstab einer Ansicht: Normmaßstäbe (ISO 5455) oder »Eigener …« zum Eintippen (1:25, 1:2,5, 3:1).
   * children: abhängige Ansichten (projiziert, Schnitt) wachsen mit; beim Hauptmaßstab folgt das Schriftfeld.
   */
  scaleField(P, d, v, { children = false } = {}) {
    const app = this.app;
    const set = (k) => app.edit("Maßstab", () => {
      const f = k / v.scale, old = v.scale;
      v.scale = k;
      if (children) for (const c of d.views) if (c.parent === v.id) c.scale = c.scale * f;
      const main = d.views.find((x) => x.type !== "iso" && !x.parent);
      if (main === v && (!d.title.massstab || d.title.massstab === scaleLabel(old))) d.title.massstab = scaleLabel(k);
    }, { rebuild: false });
    const known = SCALES.some((s) => Math.abs(s - v.scale) < 1e-9);
    const opts = [...SCALES.map((s) => [String(s), scaleLabel(s)]), ...(known ? [] : [[String(v.scale), scaleLabel(v.scale)]]), ["eigen", "Eigener …"]];
    return P.select("Maßstab", opts, String(known ? SCALES.find((s) => Math.abs(s - v.scale) < 1e-9) : v.scale), async (s) => {
      if (s !== "eigen") return set(Number(s));
      const txt = await promptDialog("Eigener Maßstab", "Maßstab (z. B. 1:25, 1:2,5 oder 3:1)", scaleLabel(v.scale), { validate: (x) => (parseScale(x) ? null : "Bitte als 1:25 oder 3:1 eingeben (1:10000 bis 100:1)") });
      if (txt) set(parseScale(txt));
      else app.props.render();
    });
  }
  renderProps(P) {
    const app = this.app;
    const d = this.doc;
    if (!d) return [];
    const out = [];
    if (this.sel?.type === "view") {
      const v = d.views.find((x) => x.id === this.sel.id);
      if (v && v.type === "section") {
        out.push(P.section(`Schnitt ${v.letter}–${v.letter}`,
          P.seg("Schnittlinie", [["h", "Waagerecht"], ["v", "Senkrecht"]], v.axis || "h", (a) => app.edit("Schnitt", () => { v.axis = a; })),
          P.expr("Lage", String(v.pos), (x) => app.edit("Schnitt", () => { v.pos = Number(String(x).replace(",", ".")) || 0; })),
          P.text("Buchstabe", v.letter, (t) => app.edit("Schnitt", () => { v.letter = (t || "A").slice(0, 2).toUpperCase(); }, { rebuild: false })),
          this.scaleField(P, d, v),
          P.check("Achsen an Zylindern", this.axesOn(d, v), (on) => app.edit("Achsen", () => { v.axes = on; }, { rebuild: false })),
          h("p", { class: "hint" }, "Jedes geschnittene Teil bekommt eine eigene Schraffur; Normteile (Schrauben, Muttern, Scheiben, Stifte) werden nach DIN nicht geschnitten."),
          h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Schnitt löschen"))));
        return out;
      }
      if (v && v.type === "flat") {
        const ks = this.kantteileOf(d);
        out.push(P.section("Abwicklung",
          ks.length > 1 ? P.select("Kantteil", ks.map((f) => [f.id, f.name || f.id]), v.feature, (fid) => { app.edit("Abwicklung", () => { v.feature = fid; }, { rebuild: false }); this.deriveFlats(d); this.render(); }) : null,
          this.scaleField(P, d, v),
          P.check("Biegetabelle", v.bendTable !== false, (on) => app.edit("Biegetabelle", () => { v.bendTable = on; }, { rebuild: false })),
          P.text("Beschriftung", v.label || "", (t) => app.edit("Beschriftung", () => { v.label = t; }, { rebuild: false })),
          h("p", { class: "hint" }, "Kontur und Biegelinien mit Biegenotiz (Winkel, Richtung, Innenradius) aus dem Kantteil und seiner Biegeregel; Ausschnitte und Bohrungen erscheinen nicht."),
          h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Abwicklung löschen"))));
        return out;
      }
      if (v && v.type === "aux") {
        out.push(P.section(`Hilfsansicht ${v.letter}`,
          P.text("Buchstabe", v.letter, (t) => app.edit("Hilfsansicht", () => { v.letter = (t || "X").slice(0, 2).toUpperCase(); }, { rebuild: false })),
          this.scaleField(P, d, v),
          P.check("Verdeckte Kanten", v.hidden !== false, (on) => app.edit("Verdeckte Kanten", () => { v.hidden = on; })),
          h("p", { class: "hint" }, "Blickrichtung senkrecht auf die gewählte Kante der Elternansicht (Pfeil mit Buchstabe)."),
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.startDetail() }, "Detail erzeugen"), h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Hilfsansicht löschen"))));
        return out;
      }
      if (v && v.type === "detail") {
        out.push(P.section(`Detail ${v.letter}`,
          P.text("Buchstabe", v.letter, (t) => app.edit("Detail", () => { v.letter = (t || "Z").slice(0, 2).toUpperCase(); }, { rebuild: false })),
          this.scaleField(P, d, v),
          P.expr("Radius (mm)", String(v.r), (x) => { const r = Number(String(x).replace(",", ".")); if (r > 0) { app.edit("Detail", () => { v.r = r; }, { rebuild: false }); this.deriveDetails(d); this.render(); } }),
          h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Detail löschen"))));
        return out;
      }
      if (v) {
        out.push(P.section(CAMS[v.type]?.label || (v.type === "proj" ? "Projizierte Ansicht" : "Ansicht"),
          P.select("Ansicht", [...Object.entries(CAMS).map(([k, c]) => [k, c.label]), ...(v.type === "proj" ? [["proj", "Projiziert"]] : [])], v.type, (t) => app.edit("Ansicht", () => { v.type = t; delete v.parent; delete v.align; delete v.dir; delete v.up; })),
          this.scaleField(P, d, v, { children: true }),
          P.check("Verdeckte Kanten", v.hidden !== false, (on) => app.edit("Verdeckte Kanten", () => { v.hidden = on; })),
          P.check("Mittellinien", v.centerlines !== false, (on) => app.edit("Mittellinien", () => { v.centerlines = on; }, { rebuild: false })),
          v.type !== "iso" ? P.check("Achsen an Zylindern", this.axesOn(d, v), (on) => app.edit("Achsen", () => { v.axes = on; v.centerlines = v.centerlines === false && on ? true : v.centerlines; }, { rebuild: false })) : null,
          P.text("Beschriftung", v.label || "", (t) => app.edit("Beschriftung", () => { v.label = t; }, { rebuild: false })),
          ...this.stateProps(P, d, v),
          ...this.breakProps(P, v),
          h("div", { class: "btn-row" }, v.type !== "iso" ? h("button", { class: "btn", onclick: () => this.addSectionDialog() }, "Schnitt erzeugen") : null, v.type !== "iso" ? h("button", { class: "btn", onclick: () => this.startAux() }, "Hilfsansicht") : null, h("button", { class: "btn", onclick: () => this.startDetail() }, "Detail erzeugen"), h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Ansicht löschen"))));
        return out;
      }
    }
    const src = d.source && app.doc(d.source.id);
    out.push(P.section("Blatt",
      P.seg("Format", Object.keys(SHEETS).map((k) => [k, k]), d.sheet.format, (f) => app.edit("Format", () => { d.sheet.format = f; }, { rebuild: false })),
      P.seg("Lage", [["quer", "Quer"], ["hoch", "Hoch"]], d.sheet.orientation, (o) => app.edit("Lage", () => { d.sheet.orientation = o; }, { rebuild: false })),
      h("dl", { class: "kv" }, h("dt", {}, "Quelle"), h("dd", {}, src ? src.name : "–")),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.chooseSource() }, "Quelle wählen"), h("button", { class: "btn", onclick: () => this.autoViews() }, "Grundansichten neu"))));
    const t = d.title;
    const T = (label, key, area) => P.text(label, t[key], (v) => app.edit(label, () => { t[key] = v; }, { rebuild: false }), { area });
    out.push(P.section("Schriftfeld", T("Benennung", "benennung"), T("Zeichnungsnr.", "nummer"), T("Halbzeug", "halbzeug"), T("Werkstoff", "werkstoff"), T("Masse", "masse"), h("p", { class: "hint" }, "Halbzeug, Werkstoff und Masse leer lassen: sie kommen dann automatisch aus dem Modell."), T("Maßstab", "massstab"), T("Allgemeintol.", "toleranz"), T("Firma", "firma"), T("Gezeichnet", "ersteller"), T("Datum", "datum"), T("Revision", "revision"), T("Blatt", "blatt"),
      ...extraFields(this.template(), t).map((f) => P.text(f.label, f.value, (v) => app.edit(f.label, () => { t.extra = { ...(t.extra || {}), [f.label]: v }; }, { rebuild: false }))),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.templateDialog() }, "Zeichnungsvorlage…"))));
    const revs = d.revisions || [];
    out.push(P.section("Änderungen",
      revs.length ? h("dl", { class: "kv" }, ...revs.flatMap((r, i) => [h("dt", {}, r.rev), h("dd", {}, `${r.text} (${r.datum || "–"}) `, h("button", { class: "btn", title: "Zeile löschen", onclick: () => { app.edit("Änderung löschen", () => { d.revisions = revs.filter((_, k) => k !== i); }, { rebuild: false }); this.render(); app.props.render(); } }, "×"))]))
        : h("p", { class: "hint" }, "Noch keine Änderung eingetragen – das Schriftfeld zeigt den Index aus »Revision«."),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.addRevisionDialog() }, "Änderung eintragen"))));
    out.push(P.section("Beschriften", h("p", { class: "hint" }, "Maße ziehen zum Verschieben, Doppelklick zum Bearbeiten, Entf zum Löschen."),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.setTool("dim") }, "Bemaßung"), h("button", { class: "btn", onclick: () => this.autoDims() }, "Hauptmaße"))));
    return out;
  }

  // ---------- Export ----------
  exportSvgString() {
    const d = this.doc;
    const svg = this.renderSheet(d, { interactive: false });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  }
  fileBase() {
    const d = this.doc;
    return (d.title.nummer || d.title.benennung || d.name || "Zeichnung").replace(/[\\/:*?"<>|]+/g, "_");
  }
  async exportSvg() {
    await this.app.files.saveText(this.exportSvgString(), this.fileBase() + ".svg", "image/svg+xml", [{ name: "SVG", extensions: ["svg"] }]);
  }
  async exportPdf() {
    const d = this.doc;
    const [W, H] = this.sheetSize(d);
    const svg = this.exportSvgString();
    if (window.werkcad?.printPdf) {
      const r = await window.werkcad.printPdf({ svg, width: W, height: H, name: this.fileBase() + ".pdf" });
      if (r?.saved) toast("PDF gespeichert: " + r.path, { kind: "ok" });
      return;
    }
    const w = window.open("", "_blank");
    if (!w) return toast("Druckfenster wurde blockiert", { kind: "err" });
    w.document.write(`<!doctype html><html><head><title>${this.fileBase()}</title><style>@page{size:${W}mm ${H}mm;margin:0}html,body{margin:0}svg{display:block;width:${W}mm;height:${H}mm}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, "")}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }
  async exportDxf() {
    await this.app.files.saveText(this.dxfString(), this.fileBase() + ".dxf", "application/dxf", [{ name: "DXF", extensions: ["dxf"] }]);
  }
  dxfString() {
    const d = this.doc;
    const [, H] = this.sheetSize(d);
    const w = new DxfWriter().layer("KONTUR", 7).layer("VERDECKT", 8, "DASHED").layer("MITTELLINIE", 1, "CENTER").layer("MASSE", 3).layer("RAHMEN", 7).layer("TEXT", 7).layer("SCHRAFFUR", 8);
    const Y = (y) => H - y;
    // Ansichten
    for (const v of d.views) {
      const p = this.viewGeom(v);
      if (!p) continue;
      const xf = this.viewXf(v);
      const circles = (p.arcs || []).filter((a) => a.full);
      const isCirclePoly = (pl) => circles.some((c) => pl.every((q) => Math.abs(Math.hypot(q[0] - c.cx, q[1] - c.cy) - c.r) < 1e-3));
      for (const c of circles) { const [x, y] = xf.to(c.cx, c.cy); w.circle(x, Y(y), c.r * v.scale, "KONTUR"); }
      for (const pl of p.visible) { if (circles.length && isCirclePoly(pl)) continue; w.polyline(pl.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }), "KONTUR"); }
      if (v.hidden !== false) for (const pl of visibleHidden(p.hidden, v.scale)) w.polyline(pl.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }), "VERDECKT");
      (p.sectionGroups?.length ? p.sectionGroups : p.sectionLoops?.length ? [p.sectionLoops] : []).forEach((group, i) => {
        const loops = group.map((l) => l.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }));
        const st = hatchStyle(i);
        for (const [x1, y1, x2, y2] of hatchLines(loops, st.gap, st.angle)) w.line(x1, y1, x2, y2, "SCHRAFFUR");
      });
      if (this.axesOn(d, v)) for (const pl of axisLines(p.axes, v.scale, v.type === "detail" ? 0 : 2)) w.polyline(pl.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }), "MITTELLINIE");
      for (const s of this.sectionChildren(d, v)) {
        const g = this.sectionLine(v, s, xf);
        for (const el of g.querySelectorAll("line")) {
          const sw = +el.getAttribute("stroke-width");
          const layer = el.getAttribute("stroke-dasharray") ? "MITTELLINIE" : sw >= 0.5 ? "KONTUR" : "MASSE";
          w.line(+el.getAttribute("x1"), Y(+el.getAttribute("y1")), +el.getAttribute("x2"), Y(+el.getAttribute("y2")), layer);
        }
        for (const el of g.querySelectorAll("path")) {
          // Pfeilspitze: M x y l dx dy l dx dy Z
          const n = (el.getAttribute("d") || "").match(/-?[\d.]+/g)?.map(Number) || [];
          if (n.length >= 6) { const p0 = [n[0], n[1]], p1 = [p0[0] + n[2], p0[1] + n[3]], p2 = [p1[0] + n[4], p1[1] + n[5]]; w.polyline([p0, p1, p2].map((q) => [q[0], Y(q[1])]), "MASSE", true); }
        }
        for (const el of g.querySelectorAll("text")) w.text(+el.getAttribute("x"), Y(+el.getAttribute("y")), 5, el.textContent, "TEXT", { align: "center" });
      }
      for (const s of d.views.filter((x) => x.type === "detail" && x.parent === v.id)) {
        const [cx, cy] = xf.to(s.center[0], s.center[1]);
        const rr = s.r * v.scale;
        w.circle(cx, Y(cy), rr, "MASSE");
        w.text(cx + rr * 0.75 + 1, Y(cy - rr * 0.75 - 1), 5, s.letter, "TEXT");
      }
      if (v.type === "detail") {
        const rr = v.r * v.scale;
        w.circle(v.x, Y(v.y), rr, "MASSE");
        w.text(v.x, Y(v.y + rr + 6), 3.5, `${v.letter} (${scaleLabel(v.scale)})`, "TEXT", { align: "center" });
      }
      if (v.type === "aux") {
        const bb = xf.bb;
        const [x0, y0] = xf.to(bb.x0, bb.y1), [x1] = xf.to(bb.x1, bb.y0);
        w.text((x0 + x1) / 2, Y(y0 - 4), 5, v.letter, "TEXT", { align: "center" });
      }
      if (v.type === "section") {
        const bb = xf.bb;
        const [x0, y0] = xf.to(bb.x0, bb.y1), [x1] = xf.to(bb.x1, bb.y0);
        w.text((x0 + x1) / 2, Y(y0 - 4), 5, `${v.letter}-${v.letter}${this.scaleNote(d, v) ? " " + this.scaleNote(d, v) : ""}`, "TEXT", { align: "center" });
      }
      if (!["section", "aux", "detail", "flat"].includes(v.type)) {
        const t = [v.label, this.scaleNote(d, v)].filter(Boolean).join(" ");
        if (t) { const bb = xf.bb; const [x0] = xf.to(bb.x0, bb.y1), [x1, y1] = xf.to(bb.x1, bb.y0); w.text((x0 + x1) / 2, Y(y1 + 6), 3.5, t, "TEXT", { align: "center" }); }
      }
      if (v.centerlines !== false && v.type !== "iso") for (const c of circles) {
        const [x, y] = xf.to(c.cx, c.cy);
        const r = c.r * v.scale + 2;
        w.line(x - r, Y(y), x + r, Y(y), "MITTELLINIE").line(x, Y(y - r), x, Y(y + r), "MITTELLINIE");
      }
    }
    for (const c of d.centerMarks || []) {
      const v = d.views.find((x) => x.id === c.view);
      if (!v || !this.proj.get(v.id)) continue;
      const [x, y] = this.viewXf(v).to(c.cx, c.cy);
      const r = c.r * v.scale + 2;
      w.line(x - r, Y(y), x + r, Y(y), "MITTELLINIE").line(x, Y(y - r), x, Y(y + r), "MITTELLINIE");
    }
    // Maße als Linien + Text (aus SVG-Geometrie)
    for (const m of d.dims) {
      const g = this.renderDim(d, m, false);
      if (!g) continue;
      for (const el of g.children) {
        if (el.tagName === "path" && el.getAttribute("fill") !== "#111a24") {
          for (const seg of (el.getAttribute("d") || "").split("M").filter(Boolean)) {
            const pts = seg.split(/L|h/).map((s) => s.trim().split(/\s+/).map(Number));
            let prev = null;
            for (const q of pts) {
              if (q.length === 1 && prev) { const n = [prev[0] + q[0], prev[1]]; w.line(prev[0], Y(prev[1]), n[0], Y(n[1]), "MASSE"); prev = n; continue; }
              if (prev && q.length >= 2) w.line(prev[0], Y(prev[1]), q[0], Y(q[1]), "MASSE");
              if (q.length >= 2) prev = q;
            }
          }
        } else if (el.tagName === "path") {
          const nums = (el.getAttribute("d") || "").match(/-?[\d.]+/g)?.map(Number) || [];
          if (nums.length >= 6) w.polyline([[nums[0], Y(nums[1])], [nums[2], Y(nums[3])], [nums[4], Y(nums[5])]], "MASSE", true);
        } else if (el.tagName === "text") {
          const x = Number(el.getAttribute("x")), y = Number(el.getAttribute("y"));
          const tr = el.getAttribute("transform");
          const rot = tr ? -Number(tr.match(/rotate\(([-\d.]+)/)?.[1] || 0) : 0;
          w.text(x, Y(y), 3.5, el.textContent, "MASSE", { align: el.getAttribute("text-anchor") === "middle" ? "center" : "left", rot });
        }
      }
    }
    // Rahmen + Schriftfeld
    const [Wd] = this.sheetSize(d);
    w.polyline([[20, Y(10)], [Wd - 10, Y(10)], [Wd - 10, Y(H - 10)], [20, Y(H - 10)]], "RAHMEN", true);
    const zg = this.zonesSvg(Wd, H);
    for (const el of zg.querySelectorAll("line")) w.line(+el.getAttribute("x1"), Y(+el.getAttribute("y1")), +el.getAttribute("x2"), Y(+el.getAttribute("y2")), "RAHMEN");
    for (const el of zg.querySelectorAll("rect")) { const x = +el.getAttribute("x"), y = +el.getAttribute("y"), ww = +el.getAttribute("width"), hh = +el.getAttribute("height"); w.polyline([[x, Y(y)], [x + ww, Y(y)], [x + ww, Y(y + hh)], [x, Y(y + hh)]], "RAHMEN", true); }
    for (const el of zg.querySelectorAll("text")) w.text(+el.getAttribute("x"), Y(+el.getAttribute("y")), 3.5, el.textContent, "TEXT", { align: "center" });
    const tb = this.titleBlock(d, Wd, H);
    for (const el of tb.querySelectorAll("line")) w.line(+el.getAttribute("x1"), Y(+el.getAttribute("y1")), +el.getAttribute("x2"), Y(+el.getAttribute("y2")), "RAHMEN");
    for (const el of tb.querySelectorAll("rect")) { const x = +el.getAttribute("x"), y = +el.getAttribute("y"), ww = +el.getAttribute("width"), hh = +el.getAttribute("height"); w.polyline([[x, Y(y)], [x + ww, Y(y)], [x + ww, Y(y + hh)], [x, Y(y + hh)]], "RAHMEN", true); }
    for (const el of tb.querySelectorAll("text")) if (el.textContent) w.text(+el.getAttribute("x"), Y(+el.getAttribute("y")), +el.getAttribute("font-size"), el.textContent, "TEXT");
    for (const n of d.notes || []) w.text(n.x, Y(n.y), n.size || 3.5, n.text, "TEXT");
    // Positionsnummern und Stückliste
    const rows = this.bomRowsOf(d);
    const posOf = this.posOfRows(rows);
    const groups = (d.balloons || []).map((b) => this.renderBalloon(d, b, posOf, false)).filter(Boolean);
    groups.push(...(d.welds || []).map((m) => this.renderWeld(d, m, false)).filter(Boolean));
    if (d.bomTable?.show && rows.length) groups.push(this.bomTableSvg(rows, Wd, H));
    groups.push(...this.extraGroups(d, false));
    for (const g of groups) {
      for (const el of g.querySelectorAll("line")) w.line(+el.getAttribute("x1"), Y(+el.getAttribute("y1")), +el.getAttribute("x2"), Y(+el.getAttribute("y2")), "MASSE");
      for (const el of g.querySelectorAll("circle")) w.circle(+el.getAttribute("cx"), Y(+el.getAttribute("cy")), +el.getAttribute("r"), "MASSE");
      for (const el of g.querySelectorAll("rect")) { const x = +el.getAttribute("x"), y = +el.getAttribute("y"), ww = +el.getAttribute("width"), hh = +el.getAttribute("height"); w.polyline([[x, Y(y)], [x + ww, Y(y)], [x + ww, Y(y + hh)], [x, Y(y + hh)]], "RAHMEN", true); }
      for (const el of g.querySelectorAll("polygon, polyline")) w.polyline(el.getAttribute("points").trim().split(/\s+/).map((q) => { const [x, y] = q.split(",").map(Number); return [x, Y(y)]; }), "MASSE", el.tagName === "polygon");
      for (const el of g.querySelectorAll("text")) if (el.textContent) w.text(+el.getAttribute("x"), Y(+el.getAttribute("y")), +el.getAttribute("font-size"), el.textContent, "TEXT", { align: { middle: "center", end: "right" }[el.getAttribute("text-anchor")] || "left" });
    }
    return w.toString();
  }
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** Logo auf höchstens 600 Pixel Breite verkleinern (PNG), damit Vorlage und Projektdatei klein bleiben */
async function shrinkLogo(src) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight);
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/png");
}
