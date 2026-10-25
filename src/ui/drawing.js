// Zeichnungsableitung: Blatt, Ansichten (Projektionsmethode 1 / DIN ISO 5456-2), Bemaßung, Schriftfeld, Export
import { h, svgEl, toast, modal, promptDialog, fmtNum, downloadBlob } from "./dom.js";
import { DxfWriter } from "../core/dxf.js";
import { materialOf, materialList } from "../core/materials.js";
import { uid } from "../core/examples.js";
import { scaleLabel } from "./tree.js";
import { v3, placementMatrix, matApply } from "../core/geom.js";
import { hatchLines } from "../core/hatch.js";
import { balloonAnchors, placeBalloons, projectPoint } from "../core/balloons.js";
import { weldSymbol } from "../core/weld.js";
import { clipProjection } from "../core/clip.js";
import { planAutoDims, viewAxes, visibleHidden, layoutAutoDims, LEAD, textWidth, dimLabel, holeSpecs, profileSpec, chooseViews, wallThickness, circlesFromLines } from "../core/autodims.js";
import { bomRows } from "./props.js";
import { evaluate, resolveParams } from "../core/expr.js";

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
  get doc() { return this.app.activeDoc()?.kind === "drawing" ? this.app.activeDoc() : null; }
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
  sourceItems(d = this.doc) {
    const app = this.app;
    const src = d?.source && app.doc(d.source.id);
    if (!src) return null;
    if (src.kind === "part") return [{ part: src, pos: [0, 0, 0], rot: [0, 0, 0] }];
    if (src.kind === "assembly") return src.components.filter((c) => !c.hidden && app.doc(c.part)).map((c) => ({ part: app.doc(c.part), pos: c.pos, rot: c.rot, name: c.name }));
    return null;
  }
  async update() {
    const d = this.doc;
    if (!d) return;
    const items = this.sourceItems(d);
    if (!items || !items.length) { this.render(); return; }
    if (d.pendingAutoViews) { delete d.pendingAutoViews; await this.autoViews({ silentUndo: true }); return; }
    const views = d.views.filter((v) => v.type !== "detail").map((v) => { const c = this.viewCam(d, v); return { key: v.id, dir: c.dir, up: c.up, cut: c.cut, hidden: v.hidden !== false && v.type !== "iso" }; });
    if (!views.length) { this.render(); return; }
    this.loading = true;
    this.render();
    try {
      const res = await this.app.kernel.call("project", { items, views });
      if (this.doc !== d) return;
      for (const [k, v] of Object.entries(res)) this.proj.set(k, v);
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
    const availW = sw - 30 - 20, availH = sh - 20 - 50;
    // nur die nötigen Ansichten: was eine Ansicht nicht zusätzlich zeigt, entfällt (z. B. Seitenansicht einer Platte)
    const src = d.source && this.app.doc(d.source.id);
    const profile = src?.kind === "part" ? profileSpec(src.features, (x) => evaluate(String(x), resolveParams(src.params || []).values)) : null;
    const camAxes = Object.fromEntries(["front", "top", "left"].map((t) => [t, viewAxes(CAMS[t].dir, CAMS[t].up)]));
    const keep = new Set(chooseViews({ front: res.auto_front, top: res.auto_top, left: res.auto_left }, camAxes, profile));
    const none = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const fw = bb("front"), tp = keep.has("top") ? bb("top") : none, lf = keep.has("left") ? bb("left") : none, iso = bb("iso");
    const gap = 22;
    let scale = SCALES[SCALES.length - 1];
    for (const s of SCALES) {
      const needW = (W(fw) + W(lf)) * s + gap * (keep.has("left") ? 3 : 2) + W(iso) * s * 0.6;
      const needH = (H(fw) + H(tp)) * s + gap * (keep.has("top") ? 3 : 2);
      if (needW <= availW && needH <= availH) { scale = s; break; }
    }
    const x0 = 20 + 10, y0 = 10 + 10;
    const fx = x0 + gap + (W(fw) * scale) / 2;
    const fy = y0 + gap + (H(fw) * scale) / 2;
    const fid = uid("v");
    const nv = [
      { id: fid, type: "front", x: fx, y: fy, scale, hidden: true },
      { id: uid("v"), type: "top", x: fx, y: fy + (H(fw) * scale) / 2 + gap + (H(tp) * scale) / 2, scale, hidden: true, parent: fid },
      { id: uid("v"), type: "left", x: fx + (W(fw) * scale) / 2 + gap + (W(lf) * scale) / 2, y: fy, scale, hidden: true, parent: fid },
    ].filter((v) => keep.has(v.type));
    const isoScale = scale * 0.6;
    nv.push({ id: uid("v"), type: "iso", x: sw - 10 - 15 - (W(iso) * isoScale) / 2, y: y0 + 15 + (H(iso) * isoScale) / 2, scale: isoScale, hidden: false });
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
    modal({
      title: "Ansicht hinzufügen",
      body: h("div", {}, h("div", { class: "field" }, h("label", {}, "Ansicht"), sel), h("div", { class: "field" }, h("label", {}, "Maßstab"), sc), h("p", { class: "hint" }, "Die Ansicht wird in die Blattmitte gesetzt und kann danach verschoben werden.")),
      buttons: [{ label: "Abbrechen" }, { label: "Hinzufügen", primary: true, run: () => {
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
      const gone = new Set([id, ...d.views.filter((v) => (v.type === "section" || v.type === "detail") && v.parent === id).map((v) => v.id)]);
      d.views = d.views.filter((v) => !gone.has(v.id));
      for (const v of d.views) if (gone.has(v.parent)) delete v.parent;
      d.dims = d.dims.filter((m) => m.view !== id);
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
    const cu = (bb.x0 + bb.x1) / 2, cv = (bb.y0 + bb.y1) / 2;
    return { to: (u, w) => [v.x + (u - cu) * v.scale, v.y - (w - cv) * v.scale], from: (x, y) => [(x - v.x) / v.scale + cu, -(y - v.y) / v.scale + cv], bb, cu, cv };
  }
  clientToSheet(cx, cy) {
    const r = this.stage.getBoundingClientRect();
    return [(cx - r.left - this.pan[0]) / (this.zoom * this.pxPerMm), (cy - r.top - this.pan[1]) / (this.zoom * this.pxPerMm)];
  }

  // ---------- Darstellung ----------
  render() {
    const d = this.doc;
    if (!d) return;
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
  renderSheet(d, { interactive = false } = {}) {
    const [W, H] = this.sheetSize(d);
    const svg = svgEl("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${W} ${H}`, width: W + "mm", height: H + "mm", "font-family": "Bahnschrift, 'DIN Alternate', Arial, sans-serif" });
    const defs = svgEl("defs");
    const pat = svgEl("pattern", { id: "werkcad-schraffur", patternUnits: "userSpaceOnUse", width: 2.5, height: 2.5, patternTransform: "rotate(45)" });
    pat.append(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 2.5, stroke: "#111a24", "stroke-width": 0.18 }));
    defs.append(pat);
    svg.append(defs);
    svg.append(svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));
    const frame = svgEl("g", { fill: "none", stroke: "#111a24" });
    frame.append(svgEl("rect", { x: 20, y: 10, width: W - 30, height: H - 20, "stroke-width": LW.frame }));
    // Zentrier-/Faltmarken
    for (const [x1, y1, x2, y2] of [[W / 2, 0, W / 2, 10], [W / 2, H - 10, W / 2, H], [0, H / 2, 20, H / 2], [W - 10, H / 2, W, H / 2]]) frame.append(svgEl("line", { x1, y1, x2, y2, "stroke-width": LW.frame }));
    svg.append(frame);
    svg.append(this.titleBlock(d, W, H));
    for (const v of d.views) svg.append(this.renderView(d, v, interactive));
    for (const m of d.dims || []) { const g = this.renderDim(d, m, interactive); if (g) svg.append(g); }
    if (interactive && this.pendingDim?.ready) {
      const g = this.renderDim(d, this.pendingDim.m, false);
      if (g) { g.setAttribute("opacity", "0.55"); svg.append(g); }
    }
    const rows = this.bomRowsOf(d);
    const posOf = new Map(rows.map((r) => [r.part.id, r.pos]));
    for (const b of d.balloons || []) { const g = this.renderBalloon(d, b, posOf, interactive); if (g) svg.append(g); }
    if (d.bomTable?.show && rows.length) svg.append(this.bomTableSvg(rows, W, H));
    for (const m of d.welds || []) { const g = this.renderWeld(d, m, interactive); if (g) svg.append(g); }
    for (const n of d.notes || []) {
      const t = svgEl("text", { x: n.x, y: n.y, "font-size": n.size || 3.5, fill: "#111a24", class: interactive ? "dw-dimgrp" + (this.sel?.id === n.id ? " sel" : "") : undefined, "data-note": n.id });
      t.textContent = n.text;
      svg.append(t);
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
    const p = this.proj.get(v.id);
    const xf = this.viewXf(v);
    if (!p) {
      if (interactive) { const t = svgEl("text", { x: v.x, y: v.y, "text-anchor": "middle", class: "dw-loading" }); t.textContent = this.loading ? "Ansicht wird berechnet…" : "–"; g.append(t); }
      return g;
    }
    const pathOf = (pl) => "M" + pl.map((q) => xf.to(q[0], q[1]).map(r3).join(" ")).join("L");
    if (p.sectionLoops?.length) g.append(svgEl("path", { d: p.sectionLoops.map((l) => pathOf(l) + "Z").join(""), fill: "url(#werkcad-schraffur)", "fill-rule": "evenodd", stroke: "none" }));
    const hid = v.hidden !== false ? visibleHidden(p.hidden, v.scale) : [];
    if (hid.length) g.append(svgEl("path", { d: hid.map(pathOf).join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.hid, "stroke-dasharray": "2.5 1.2" }));
    g.append(svgEl("path", { d: p.visible.map(pathOf).join(""), fill: "none", stroke: "#111a24", "stroke-width": LW.vis, "stroke-linecap": "round", "stroke-linejoin": "round" }));
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
    const bb = xf.bb;
    const [x0, y0] = xf.to(bb.x0, bb.y1), [x1, y1] = xf.to(bb.x1, bb.y0);
    if (v.type === "detail") g.append(svgEl("circle", { cx: r3(v.x), cy: r3(v.y), r: r3(v.r * v.scale), fill: "none", stroke: "#111a24", "stroke-width": LW.thin }));
    const lbl = v.type === "section" ? `${v.letter}–${v.letter}` : v.type === "detail" ? `${v.letter} (${scaleLabel(v.scale).replace(/^M\s*/, "")})` : v.label;
    if (lbl) { const t = svgEl("text", { x: (x0 + x1) / 2, y: v.type === "section" ? y0 - 4 : y1 + 6, "text-anchor": "middle", "font-size": v.type === "section" ? 5 : 3.5, fill: "#111a24" }); t.textContent = lbl; g.append(t); }
    // Schnittverläufe der abgeleiteten Schnittansichten
    for (const s of this.sectionChildren(d, v)) g.append(this.sectionLine(v, s, xf));
    for (const s of d.views.filter((x) => x.type === "detail" && x.parent === v.id)) g.append(this.detailMark(v, s, xf));
    if (interactive) {
      g.append(svgEl("rect", { x: x0 - 3, y: y0 - 3, width: x1 - x0 + 6, height: y1 - y0 + 6, class: "dw-view-box", fill: "none" }));
      g.append(svgEl("rect", { x: x0 - 3, y: y0 - 3, width: x1 - x0 + 6, height: y1 - y0 + 6, class: "dw-view-hit", "data-view": v.id }));
    }
    return g;
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
    const txt = (m.kind === "dia" && (m.hole || m.pcd)) || m.pitch ? dimLabel(m)
      : (m.count > 1 ? m.count + "× " : "") + (m.kind === "dia" ? "Ø" : m.kind === "rad" ? "R" : "") + fmtNum(val, m.decimals ?? 1) + (m.suffix || "");
    const arrowHead = (x, y, ux, uy) => {
      const L = 3, w = 0.9;
      return svgEl("path", { d: `M${r3(x)} ${r3(y)}L${r3(x - ux * L + uy * w)} ${r3(y - uy * L - ux * w)}L${r3(x - ux * L - uy * w)} ${r3(y - uy * L + ux * w)}Z`, fill: "#111a24", stroke: "none" });
    };
    const text = (x, y, rot) => {
      const t = svgEl("text", { x: r3(x), y: r3(y), "text-anchor": "middle", "font-size": 3.5, fill: "#111a24", stroke: "none", transform: rot ? `rotate(${r3(rot)} ${r3(x)} ${r3(y)})` : undefined, class: interactive ? "dw-dimtext" : undefined });
      t.textContent = txt;
      return t;
    };
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
      const sg = Math.sign(off) || 1, tw = textWidth(txt);
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
    const tight = L < 7, tw = textWidth(txt), outside = L < tw + 7;
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
    return src?.kind === "assembly" ? bomRows(this.app, src) : [];
  }
  /** Ein Kreis je Stücklisten-Position in der gewählten Ansicht (sonst Isometrie), rund um die Ansicht verteilt */
  autoBalloons() {
    const d = this.doc;
    const src = d?.source && this.app.doc(d.source.id);
    if (src?.kind !== "assembly") return toast("Positionsnummern gibt es nur in Zeichnungen von Baugruppen");
    const v = (this.sel?.type === "view" && d.views.find((x) => x.id === this.sel.id)) || d.views.find((x) => x.type === "iso") || d.views[0];
    if (!v || !this.proj.get(v.id)) return toast("Zuerst Ansichten erzeugen");
    const anchors = balloonAnchors(src, (pid) => this.app.results.get(pid));
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
    else { const seen = new Set(); for (const c of src.components || []) if (!c.hidden && !seen.has(c.part)) { seen.add(c.part); add(c.part, placementMatrix(c.pos, c.rot)); } }
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
    const rh = 6, x0 = W - 10 - 180, yb = H - 10 - 46;
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
      [r.pos, r.name, r.number, r.qty, r.material, Number.isFinite(r.mass) ? fmtNum(r.mass, 2) : ""].forEach((s, i) => cell(i, y, s));
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
      if (r) mass = fmtNum((r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0) * materialOf(src.material).density) / 1e6, 2) + " kg";
      material = src.material ? materialOf(src.material).label : "";
    } else if (src?.kind === "assembly") {
      const rows = this.bomRowsOf(d);
      if (rows.length) mass = fmtNum(rows.reduce((s, r) => s + r.mass * r.qty, 0), 2) + " kg";
      const mats = [...new Set(rows.map((r) => r.material).filter(Boolean))];
      material = mats.length === 1 ? mats[0] : mats.length ? "siehe Stückliste" : "";
    }
    const halbzeug = t.halbzeug || this.profileOf(d)?.text || "";
    label(x0, y0, "Firma"); value(x0, y0 + 8.4, t.firma, 3);
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
    label(x0 + 120, y0 + 36, "Rev."); value(x0 + 120, y0 + 44.3, t.revision, 3.5);
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
      const p = this.proj.get(v.id);
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
      const p = this.proj.get(v.id);
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
    this.app.setHint(t === "dim" ? "Bemaßung: zwei Fangpunkte (Ecken, Kreismitten) oder einen Kreis anklicken, dann Lage klicken" : t === "text" ? "Text: Position auf dem Blatt anklicken" : "");
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
      if (this.tool === "text") return this.textClick(sx, sy);
      if (this.tool === "detail") return this.detailClick(sx, sy);
      const dimEl = e.target.closest("[data-dim]");
      const noteEl = e.target.closest("[data-note]");
      const balloonEl = e.target.closest("[data-balloon]");
      const weldEl = e.target.closest("[data-weld]");
      const viewEl = e.target.closest("[data-view]");
      if (weldEl) { this.select({ type: "weld", id: weldEl.getAttribute("data-weld") }); drag = { kind: "weld", id: this.sel.id, start: [sx, sy], moved: false }; }
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
          if (v.parent && v.type !== "detail") { const t = v.type; if (t === "top" || t === "bottom" || (t === "section" && v.axis !== "v")) mdx = 0; else mdy = 0; }
          v.x = O.get(v.id).x + mdx;
          v.y = O.get(v.id).y + mdy;
          for (const c of d.views) if (c.parent === v.id && c.type !== "detail") {
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
    });
  }
  offsetFor(m, xf, sx, sy) {
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
    modal({
      title: "Maß bearbeiten",
      body: h("div", {},
        h("div", { class: "field" }, h("label", {}, "Wert"), h("div", {}, fmtNum(this.dimValue(m), 3) + " mm")),
        h("div", { class: "field" }, h("label", {}, "Nachkommastellen"), h("input", { class: "inp", id: "dm-dec", type: "number", min: 0, max: 3, value: m.decimals ?? 1 })),
        h("div", { class: "field" }, h("label", {}, "Zusatz (z. B. ±0,1)"), h("input", { class: "inp", id: "dm-suf", value: m.suffix || "" }))),
      buttons: [{ label: "Löschen", danger: true, run: () => { this.app.edit("Maß löschen", () => { d.dims = d.dims.filter((x) => x.id !== id); }, { rebuild: false }); this.render(); } },
        { label: "Abbrechen" },
        { label: "OK", primary: true, run: () => {
          const dec = Number(document.getElementById("dm-dec").value);
          const suf = document.getElementById("dm-suf").value;
          this.app.edit("Maß", () => { m.decimals = Math.max(0, Math.min(3, dec)); m.suffix = suf; if (m.auto) m.touched = true; }, { rebuild: false });
          this.render();
        } }],
    });
  }
  autoDims() {
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
    }
    const items = this.sourceItems(d) || [];
    const ev = (part) => { const scope = resolveParams(part.params || []).values; return (x) => evaluate(String(x), scope); };
    const holes = items.flatMap((it) => holeSpecs(it.part.features, ev(it.part)));
    // Einzelteil aus einem Profil: Querschnitt als Profilangabe statt Einzelmaßen
    const src = d.source && this.app.doc(d.source.id);
    used.profile = this.profileOf(d);
    // Wandstärke nur bei einem einzelnen Hohlkörper, nicht bei Rahmen/Schweißbaugruppen aus mehreren Profilen
    if (src?.kind !== "part" || src.features.some((f) => !f.suppressed && ["frame", "profilzug", "biegerohr", "knickrahmen", "profile"].includes(f.type))) used.wall = true;
    const views = cands.filter((v) => !keep.some((m) => m.view === v.id && m.auto)).map((v) => {
      const c = this.viewCam(d, v), p = this.proj.get(v.id);
      return { id: v.id, axes: viewAxes(c.dir, c.up), bbox: p.bbox, arcs: p.arcs, lines: p.visible, holes };
    });
    const add = planAutoDims(views, used).map((m) => ({ id: uid("m"), ...m, auto: true }));
    const keepNotes = (d.notes || []).filter((n) => !(n.auto && !n.touched));
    const notes = []; // Profilangabe steht im Schriftfeld (Halbzeug)
    if (!add.length && !notes.length && keep.length === d.dims.length) return toast("Keine weiteren Hauptmaße gefunden");
    layoutAutoDims(add, this.sheetRects(d), { ...this.sheetObstacles(d, keep), notes });
    this.app.edit("Hauptmaße", () => {
      d.dims = [...keep, ...add];
      d.notes = [...keepNotes, ...notes.map((n) => ({ id: uid("n"), x: n.x, y: n.y, text: n.text, size: 3.5, auto: true }))];
    }, { rebuild: false });
    this.render();
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
    if (e.key === "Escape") { if (this.tool || this.pendingDim) { this.setTool(null); return true; } if (this.sel) { this.select(null); return true; } return false; }
    if (e.key === "Delete" && this.sel) {
      const d = this.doc;
      if (this.sel.type === "view") this.deleteView(this.sel.id);
      else if (this.sel.type === "dim") { this.app.edit("Maß löschen", () => { d.dims = d.dims.filter((m) => m.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "weld") { this.app.edit("Nahtsymbol löschen", () => { d.welds = d.welds.filter((w) => w.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "balloon") { this.app.edit("Positionsnummer löschen", () => { d.balloons = d.balloons.filter((b) => b.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      else if (this.sel.type === "note") { this.app.edit("Text löschen", () => { d.notes = d.notes.filter((m) => m.id !== this.sel.id); }, { rebuild: false }); this.sel = null; this.render(); }
      return true;
    }
    return false;
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
          P.select("Maßstab", SCALES.map((s) => [String(s), scaleLabel(s)]), String(v.scale), (s) => app.edit("Maßstab", () => { v.scale = Number(s); }, { rebuild: false })),
          h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Schnitt löschen"))));
        return out;
      }
      if (v && v.type === "detail") {
        out.push(P.section(`Detail ${v.letter}`,
          P.text("Buchstabe", v.letter, (t) => app.edit("Detail", () => { v.letter = (t || "Z").slice(0, 2).toUpperCase(); }, { rebuild: false })),
          P.select("Maßstab", SCALES.map((s) => [String(s), scaleLabel(s)]), String(v.scale), (s) => app.edit("Maßstab", () => { v.scale = Number(s); }, { rebuild: false })),
          P.expr("Radius (mm)", String(v.r), (x) => { const r = Number(String(x).replace(",", ".")); if (r > 0) { app.edit("Detail", () => { v.r = r; }, { rebuild: false }); this.deriveDetails(d); this.render(); } }),
          h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Detail löschen"))));
        return out;
      }
      if (v) {
        out.push(P.section(CAMS[v.type]?.label || "Ansicht",
          P.select("Ansicht", Object.entries(CAMS).map(([k, c]) => [k, c.label]), v.type, (t) => app.edit("Ansicht", () => { v.type = t; delete v.parent; })),
          P.select("Maßstab", SCALES.map((s) => [String(s), scaleLabel(s)]), String(v.scale), (s) => app.edit("Maßstab", () => { const k = Number(s) / v.scale; v.scale = Number(s); for (const c of d.views) if (c.parent === v.id) c.scale = c.scale * k; }, { rebuild: false })),
          P.check("Verdeckte Kanten", v.hidden !== false, (on) => app.edit("Verdeckte Kanten", () => { v.hidden = on; })),
          P.check("Mittellinien", v.centerlines !== false, (on) => app.edit("Mittellinien", () => { v.centerlines = on; }, { rebuild: false })),
          P.text("Beschriftung", v.label || "", (t) => app.edit("Beschriftung", () => { v.label = t; }, { rebuild: false })),
          h("div", { class: "btn-row" }, v.type !== "iso" ? h("button", { class: "btn", onclick: () => this.addSectionDialog() }, "Schnitt erzeugen") : null, h("button", { class: "btn", onclick: () => this.startDetail() }, "Detail erzeugen"), h("button", { class: "btn danger", onclick: () => this.deleteView(v.id) }, "Ansicht löschen"))));
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
    out.push(P.section("Schriftfeld", T("Benennung", "benennung"), T("Zeichnungsnr.", "nummer"), T("Halbzeug", "halbzeug"), T("Werkstoff", "werkstoff"), T("Masse", "masse"), h("p", { class: "hint" }, "Halbzeug, Werkstoff und Masse leer lassen: sie kommen dann automatisch aus dem Modell."), T("Maßstab", "massstab"), T("Allgemeintol.", "toleranz"), T("Firma", "firma"), T("Gezeichnet", "ersteller"), T("Datum", "datum"), T("Revision", "revision"), T("Blatt", "blatt")));
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
    const d = this.doc;
    const [, H] = this.sheetSize(d);
    const w = new DxfWriter().layer("KONTUR", 7).layer("VERDECKT", 8, "DASHED").layer("MITTELLINIE", 1, "CENTER").layer("MASSE", 3).layer("RAHMEN", 7).layer("TEXT", 7).layer("SCHRAFFUR", 8);
    const Y = (y) => H - y;
    // Ansichten
    for (const v of d.views) {
      const p = this.proj.get(v.id);
      if (!p) continue;
      const xf = this.viewXf(v);
      const circles = (p.arcs || []).filter((a) => a.full);
      const isCirclePoly = (pl) => circles.some((c) => pl.every((q) => Math.abs(Math.hypot(q[0] - c.cx, q[1] - c.cy) - c.r) < 1e-3));
      for (const c of circles) { const [x, y] = xf.to(c.cx, c.cy); w.circle(x, Y(y), c.r * v.scale, "KONTUR"); }
      for (const pl of p.visible) { if (circles.length && isCirclePoly(pl)) continue; w.polyline(pl.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }), "KONTUR"); }
      if (v.hidden !== false) for (const pl of visibleHidden(p.hidden, v.scale)) w.polyline(pl.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }), "VERDECKT");
      if (p.sectionLoops?.length) {
        const loops = p.sectionLoops.map((l) => l.map((q) => { const [x, y] = xf.to(q[0], q[1]); return [x, Y(y)]; }));
        for (const [x1, y1, x2, y2] of hatchLines(loops, 2.5, 45)) w.line(x1, y1, x2, y2, "SCHRAFFUR");
      }
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
      if (v.type === "section") {
        const bb = xf.bb;
        const [x0, y0] = xf.to(bb.x0, bb.y1), [x1] = xf.to(bb.x1, bb.y0);
        w.text((x0 + x1) / 2, Y(y0 - 4), 5, `${v.letter}-${v.letter}`, "TEXT", { align: "center" });
      }
      if (v.centerlines !== false && v.type !== "iso") for (const c of circles) {
        const [x, y] = xf.to(c.cx, c.cy);
        const r = c.r * v.scale + 2;
        w.line(x - r, Y(y), x + r, Y(y), "MITTELLINIE").line(x, Y(y - r), x, Y(y + r), "MITTELLINIE");
      }
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
    const tb = this.titleBlock(d, Wd, H);
    for (const el of tb.querySelectorAll("line")) w.line(+el.getAttribute("x1"), Y(+el.getAttribute("y1")), +el.getAttribute("x2"), Y(+el.getAttribute("y2")), "RAHMEN");
    for (const el of tb.querySelectorAll("rect")) { const x = +el.getAttribute("x"), y = +el.getAttribute("y"), ww = +el.getAttribute("width"), hh = +el.getAttribute("height"); w.polyline([[x, Y(y)], [x + ww, Y(y)], [x + ww, Y(y + hh)], [x, Y(y + hh)]], "RAHMEN", true); }
    for (const el of tb.querySelectorAll("text")) if (el.textContent) w.text(+el.getAttribute("x"), Y(+el.getAttribute("y")), +el.getAttribute("font-size"), el.textContent, "TEXT");
    for (const n of d.notes || []) w.text(n.x, Y(n.y), n.size || 3.5, n.text, "TEXT");
    // Positionsnummern und Stückliste
    const rows = this.bomRowsOf(d);
    const posOf = new Map(rows.map((r) => [r.part.id, r.pos]));
    const groups = (d.balloons || []).map((b) => this.renderBalloon(d, b, posOf, false)).filter(Boolean);
    groups.push(...(d.welds || []).map((m) => this.renderWeld(d, m, false)).filter(Boolean));
    if (d.bomTable?.show && rows.length) groups.push(this.bomTableSvg(rows, Wd, H));
    for (const g of groups) {
      for (const el of g.querySelectorAll("line")) w.line(+el.getAttribute("x1"), Y(+el.getAttribute("y1")), +el.getAttribute("x2"), Y(+el.getAttribute("y2")), "MASSE");
      for (const el of g.querySelectorAll("circle")) w.circle(+el.getAttribute("cx"), Y(+el.getAttribute("cy")), +el.getAttribute("r"), "MASSE");
      for (const el of g.querySelectorAll("rect")) { const x = +el.getAttribute("x"), y = +el.getAttribute("y"), ww = +el.getAttribute("width"), hh = +el.getAttribute("height"); w.polyline([[x, Y(y)], [x + ww, Y(y)], [x + ww, Y(y + hh)], [x, Y(y + hh)]], "RAHMEN", true); }
      for (const el of g.querySelectorAll("polygon, polyline")) w.polyline(el.getAttribute("points").trim().split(/\s+/).map((q) => { const [x, y] = q.split(",").map(Number); return [x, Y(y)]; }), "MASSE", el.tagName === "polygon");
      for (const el of g.querySelectorAll("text")) if (el.textContent) w.text(+el.getAttribute("x"), Y(+el.getAttribute("y")), +el.getAttribute("font-size"), el.textContent, "TEXT", { align: { middle: "center", end: "right" }[el.getAttribute("text-anchor")] || "left" });
    }
    await this.app.files.saveText(w.toString(), this.fileBase() + ".dxf", "application/dxf", [{ name: "DXF", extensions: ["dxf"] }]);
  }
}
const r3 = (x) => Math.round(x * 1000) / 1000;
