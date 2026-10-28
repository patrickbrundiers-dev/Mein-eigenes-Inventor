// Baugruppenerstellung (BG1–BG6) im 3D-Fenster: Platzieren mit Vorschau am Mauszeiger, Komponenten mit der Maus
// ziehen und drehen (nur in freie Richtungen), Schnellfügen mit Alt-Ziehen, Freiheitsgrade an der Auswahl.
// Rechnung in src/core/asmdof.js und src/core/baugruppe.js.
import * as THREE from "three";
import { h, toast, modal } from "./dom.js";
import { uid } from "../core/examples.js";
import { componentDof, projectFree, dofLabel } from "../core/asmdof.js";
import { quickMate, placeAt, applyDelta, deltaBetween } from "../core/baugruppe.js";
import { solveAssembly, endFaceFor, worldToLocal } from "../core/asmsolve.js";
import { flattenAssembly, canInsert } from "../core/subasm.js";
import { placementMatrix, rotationAbout, v3 } from "../core/geom.js";
import { classifyHit, buildConstraint, placeState } from "./abhaengigkeit.js";

const asmOf = (app) => (app.mode === "assembly" && app.activeDoc()?.kind === "assembly" ? app.activeDoc() : null);
const compOf = (asm, id) => asm?.components?.find((c) => c.id === id);
const box3 = (b) => (b ? { c: b[0].map((x, i) => (x + b[1][i]) / 2), d: Math.hypot(...b[0].map((x, i) => b[1][i] - x)) } : null);

// ---------- Freiheitsgrade (BG3) ----------
/** Pfeile/Bögen an der gewählten Komponente */
export function updateDofGlyph(app) {
  const asm = asmOf(app);
  const on = app.prefs?.get("baugruppe.freiheitsgrade") !== false;
  const c = asm && app.sel?.type === "component" ? compOf(asm, app.sel.id) : null;
  if (!on || !c || app.dragState) return app.viewer.showDofGlyph(null);
  const d = componentDof(asm, c.id);
  const b = box3(app.viewer.componentBox(c.id));
  if (!d || !b || !d.dof) return app.viewer.showDofGlyph(null);
  app.viewer.showDofGlyph({ center: b.c, size: Math.max(15, Math.min(400, b.d * 0.4)), tDirs: d.tDirs, rAxes: d.rAxes, rPoint: d.rPoint || (d.state === "gelenk" ? c.joint.p : null) });
}
export { dofLabel, componentDof };

// ---------- Platzieren mit Vorschau (BG1) ----------
/** Einfügbare Dokumente (Bauteile und Baugruppen ohne Kreisbezug) */
export function insertableDocs(app, asm) {
  return [...app.parts(), ...app.project.docs.filter((x) => x.kind === "assembly" && canInsert(asm, x, (id) => app.doc(id)))];
}
/** Auswahl mit Suche, dann Vorschau am Mauszeiger */
export function placeDialog(app) {
  const asm = asmOf(app);
  if (!asm) return;
  const docs = insertableDocs(app, asm);
  if (!docs.length) return toast("Im Projekt gibt es noch kein Bauteil");
  const search = h("input", { class: "inp", placeholder: "Suchen …", spellcheck: "false" });
  const list = h("div", { class: "place-list" });
  let close = null;
  const go = (id) => { close?.(); beginPlacing(app, id); };
  const fill = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...docs.filter((d) => !q || `${d.name} ${d.number || ""}`.toLowerCase().includes(q)).map((d) =>
      h("button", { class: "place-item", "data-doc": d.id, onclick: () => go(d.id) },
        h("b", {}, d.name), d.kind === "assembly" ? h("span", { class: "hint" }, " Baugruppe") : null, d.number ? h("span", { class: "hint" }, " " + d.number) : null)));
  };
  search.addEventListener("input", fill);
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = list.querySelector("button"); if (first) go(first.dataset.doc); } });
  fill();
  const dlg = modal({
    title: "Komponente platzieren", width: "420px",
    body: h("div", {}, search, list, h("p", { class: "hint" }, asm.components.length ? "Danach am Mauszeiger absetzen: jeder Klick setzt eine Kopie, Esc oder Rechtsklick beendet. Tipp: Bauteile lassen sich auch aus dem Modellbrowser ins 3D-Fenster ziehen." : "Die erste Komponente wird am Ursprung fixiert; danach weitere Kopien am Mauszeiger absetzen.")),
    buttons: [{ label: "Abbrechen" }],
  });
  close = dlg.close;
}

/** Platzieren starten: erste Komponente am Ursprung fixiert, sonst Vorschau am Mauszeiger */
export function beginPlacing(app, docId, { at = null } = {}) {
  const asm = asmOf(app), d = app.doc(docId);
  if (!asm || !d) return;
  const occ = d.kind === "assembly" ? flattenAssembly(d, (id) => app.doc(id)) : [{ part: d, matrix: null }];
  const items = occ.map((o) => ({ bodies: app.results.get(o.part.id)?.bodies, color: app.partColor(o.part), inner: o.matrix }));
  const boxes = occ.flatMap((o) => (app.results.get(o.part.id)?.bodies || []).map((b) => b.props?.bbox).filter(Boolean));
  const center = boxes.length ? [0, 1, 2].map((i) => (Math.min(...boxes.map((b) => b[0][i])) + Math.max(...boxes.map((b) => b[1][i]))) / 2) : [0, 0, 0];
  if (!asm.components.length) {
    addComponent(app, asm, d, { pos: [0, 0, 0], rot: [0, 0, 0] }, { fixed: true });
    toast(`»${d.name}« am Ursprung fixiert – weitere Kopien am Mauszeiger absetzen, Esc beendet`, { kind: "ok" });
  } else if (at) {
    addComponent(app, asm, d, placeAt(at, center));
  }
  app.pick = { kind: "place", doc: docId, center };
  app.viewer.setPlaceGhost(items);
  app.setHint(`»${d.name}« platzieren: Klick setzt eine Kopie (auf Flächen einrastend) – Esc oder Rechtsklick beendet`);
  app.ribbon?.render?.();
}
function addComponent(app, asm, d, place, { fixed = false } = {}) {
  const comp = { id: uid("c"), part: d.id, name: `${d.name}:${asm.components.filter((c) => c.part === d.id).length + 1}`, pos: place.pos, rot: place.rot, ...(fixed ? { fixed: true } : {}) };
  app.edit("Platzieren", () => { asm.components.push(comp); });
  app.sel = { type: "component", id: comp.id };
  app.refreshSelectionHits();
  app.tree.render();
  app.props.render();
  return comp;
}
/** Punkt unter dem Mauszeiger: Modellfläche, sonst Ebene durch den Drehpunkt quer zur Blickrichtung */
function cursorPoint(app, e, opts = {}) {
  const hit = app.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true, ...opts });
  if (hit?.point) return hit.point;
  const v = app.viewer, dir = new THREE.Vector3();
  v.camera.getWorldDirection(dir);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, v.controls.target);
  const out = new THREE.Vector3();
  return v.raycaster(e.clientX, e.clientY).ray.intersectPlane(plane, out) ? out.toArray() : null;
}
export function placeHover(app, e) {
  const p = cursorPoint(app, e);
  if (p) app.viewer.movePlaceGhost(placementMatrix(placeAt(p, app.pick.center).pos, [0, 0, 0]));
}
export function placeClick(app, e) {
  const asm = asmOf(app), d = app.doc(app.pick.doc), p = cursorPoint(app, e);
  if (!asm || !d || !p) return;
  addComponent(app, asm, d, placeAt(p, app.pick.center));
}
export function endPlacing(app) { app.viewer.setPlaceGhost(null); }

/** Bauteile aus dem Modellbrowser ins 3D-Fenster ziehen (BG10) */
export function bindDocDrop(app) {
  const cv = app.viewer.renderer.domElement;
  cv.addEventListener("dragover", (e) => { if (asmOf(app) && [...e.dataTransfer.types].includes("text/x-pbcad-doc")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  cv.addEventListener("drop", (e) => {
    const id = e.dataTransfer.getData("text/x-pbcad-doc");
    const asm = asmOf(app);
    if (!id || !asm) return;
    e.preventDefault();
    if (!insertableDocs(app, asm).some((d) => d.id === id)) return toast("Diese Baugruppe enthält die aktive Baugruppe – das ergäbe einen Kreisbezug");
    beginPlacing(app, id, { at: cursorPoint(app, e) });
  });
}

// ---------- Ziehen, Drehen, Schnellfügen (BG2, BG6) ----------
export function bindAssemblyDrag(app) {
  const cv = app.viewer.renderer.domElement;
  let st = null, raf = 0;
  const viewPlane = (point) => {
    const dir = new THREE.Vector3();
    app.viewer.camera.getWorldDirection(dir);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(dir, new THREE.Vector3(...point));
  };
  const onPlane = (e, plane) => { const o = new THREE.Vector3(); return app.viewer.raycaster(e.clientX, e.clientY).ray.intersectPlane(plane, o) ? o.toArray() : null; };
  cv.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || app.pick || !asmOf(app) || app.prefs?.get("baugruppe.ziehen") === false) return;
    const hit = app.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true });
    const cid = hit?.key?.startsWith("comp:") ? hit.key.slice(5) : null;
    if (!cid) return;
    if (e.altKey) e.preventDefault();
    st = { cid, x: e.clientX, y: e.clientY, hit, alt: e.altKey, shift: e.shiftKey, active: false, flip: false };
  });
  const start = () => {
    const asm = asmOf(app), c = compOf(asm, st.cid);
    if (!c) return (st = null);
    if (c.pat) { toast("Musterkopien folgen ihrer Quelle – bitte die Quelle ziehen"); return (st = null); }
    if (c.fixed) { toast(`${c.name} ist fixiert – im Baum »Fixierung lösen«`); return (st = null); }
    if (c.joint && !st.alt) { toast(`${c.name} bewegt sich über sein Gelenk – Bewegen im Menüband oder Schieberegler in den Eigenschaften`); return (st = null); }
    st.comp = c;
    st.base = { pos: [...c.pos], rot: [...c.rot] };
    st.dof = componentDof(asm, c.id);
    st.plane = viewPlane(st.hit.point);
    st.p0 = st.hit.point;
    st.box = box3(app.viewer.componentBox(c.id));
    if (st.alt) {
      const src = classifyHit(app, st.hit);
      if (!src || (src.kind !== "plane" && src.kind !== "axis")) { toast("Schnellfügen: an einer ebenen oder zylindrischen Fläche greifen"); return (st = null); }
      if (src.kind === "axis") src.info = { ...src.info, end: endFaceFor(src.info, worldToLocal(c, st.hit.point, [0, 0, 1]).p, app.assemblyFaces(c.part)) };
      st.src = src;
    } else if (!st.dof.dof) { toast(`${c.name} ist vollständig bestimmt – Abhängigkeit unterdrücken oder löschen, um es zu bewegen`); return (st = null); }
    st.active = true;
    app.dragState = st;
    app.viewer.showDofGlyph(null);
    app.sel = { type: "component", id: c.id };
    app.refreshSelectionHits();
  };
  const move = (e) => {
    const asm = asmOf(app);
    if (!asm || !st?.active) return;
    let D = null;
    if (st.alt) return quickPreview(app, st, e);
    const dx = e.clientX - st.x;
    const rotate = st.shift || !st.dof.trans;
    if (rotate) {
      if (!st.dof.rot) return app.setHint("Keine Drehung frei");
      const dir = new THREE.Vector3();
      app.viewer.camera.getWorldDirection(dir);
      // bei mehreren freien Drehungen die Achse, die am meisten zum Betrachter zeigt
      const ax = st.dof.rAxes.reduce((b, a) => (Math.abs(v3.dot(a, dir.toArray())) > Math.abs(v3.dot(b, dir.toArray())) ? a : b));
      const ang = Math.round(dx * 0.5);
      D = rotationAbout(st.dof.rPoint || st.box?.c || st.p0, ax, -ang);
      st.label = `Drehen ${ang}°`;
    } else {
      const p = onPlane(e, st.plane);
      if (!p) return;
      const m = projectFree(v3.sub(p, st.p0), st.dof.tDirs);
      D = placementMatrix(m, [0, 0, 0]);
      st.label = `Verschieben ${Math.round(v3.len(m) * 10) / 10} mm`;
    }
    st.D = D;
    app.viewer.setComponentDeltas(new Map([[st.cid, D]]));
    app.setHint(`${st.label} – loslassen setzt ab (Umschalt: drehen, Alt: an Fläche fügen), Esc bricht ab`);
  };
  cv.addEventListener("pointermove", (e) => {
    if (!st) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) <= 4) return;
      start();
      if (!st) return;
      cv.setPointerCapture?.(e.pointerId);
    }
    st.lastE = { clientX: e.clientX, clientY: e.clientY };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => move(st?.lastE || e));
  });
  const finish = (commit) => {
    const s = st;
    st = null;
    app.dragState = null;
    cancelAnimationFrame(raf);
    if (!s?.active) return;
    app.viewer.setComponentDeltas(null);
    app.setHint("");
    const asm = asmOf(app);
    if (!commit || !asm) return updateDofGlyph(app);
    if (s.alt) return commitQuick(app, s);
    if (!s.D) return updateDofGlyph(app);
    const c = compOf(asm, s.cid);
    app.edit(s.label?.startsWith("Drehen") ? "Komponente drehen" : "Komponente ziehen", () => { Object.assign(c, applyDelta(s.base, s.D)); });
    app.refreshSelectionHits();
    app.props.render();
  };
  cv.addEventListener("pointerup", (e) => { if (st && e.button === 0) finish(true); });
  cv.addEventListener("pointercancel", () => finish(false));
  document.addEventListener("keydown", (e) => {
    if (!st?.active) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    if (e.key === " " && st.alt) { e.preventDefault(); e.stopPropagation(); st.flip = !st.flip; if (st.lastE) quickPreview(app, st, st.lastE); }
  }, true);
}

/** Schnellfügen: Ziel unter dem Mauszeiger, Abhängigkeit vorrechnen und Lage als Vorschau zeigen */
function quickPreview(app, st, e) {
  const asm = asmOf(app);
  const hit = app.viewer.pick(e.clientX, e.clientY, { edges: false, faces: true, exclude: "comp:" + st.cid });
  const tgt = hit && classifyHit(app, hit);
  st.con = null;
  st.D = null;
  if (!tgt || tgt.cid === st.cid || (tgt.kind !== "plane" && tgt.kind !== "axis")) {
    // ohne Ziel frei mitziehen (wie Verschieben, ohne Rücksicht auf Abhängigkeiten)
    const o = new THREE.Vector3();
    if (app.viewer.raycaster(e.clientX, e.clientY).ray.intersectPlane(st.plane, o)) app.viewer.setComponentDeltas(new Map([[st.cid, placementMatrix(v3.sub(o.toArray(), st.p0), [0, 0, 0])]]));
    app.viewer.highlight([]);
    return app.setHint("Schnellfügen: Komponente über eine Fläche oder Bohrung einer anderen Komponente ziehen – Esc bricht ab");
  }
  if (tgt.kind === "axis" && st.src.kind === "axis") {
    const T = compOf(asm, tgt.cid);
    tgt.info = { ...tgt.info, end: endFaceFor(tgt.info, worldToLocal(T, hit.point, [0, 0, 1]).p, app.assemblyFaces(T.part)) };
  }
  const q = quickMate(st.src.kind, tgt.kind, st.flip, { insert: !!(st.src.info?.end && tgt.info?.end) });
  if (!q) return app.setHint("Diese Flächen lassen sich nicht schnell fügen");
  const r = buildConstraint(asm, placeState({ type: q.type, solution: q.solution, axisSol: q.axisSol }), [st.src, tgt]);
  if (r.error) return app.setHint(r.error);
  // auf einer Kopie lösen: nur die gezogene Komponente bewegt sich in der Vorschau
  const trial = { ...asm, components: asm.components.map((c) => ({ ...c, pos: [...c.pos], rot: [...c.rot] })), constraints: [...(asm.constraints || []).map((c) => JSON.parse(JSON.stringify(c))), JSON.parse(JSON.stringify(r.con))] };
  const res = solveAssembly(trial, (pid) => app.assemblyFaces(pid), (g) => app.asmEval(g));
  const moved = compOf(trial, st.cid);
  st.D = deltaBetween(st.base, moved);
  st.con = r.con;
  st.conflict = res.errors[r.con.id] || null;
  app.viewer.setComponentDeltas(new Map([[st.cid, st.D]]));
  app.viewer.highlight([hit]);
  app.setHint(`Schnellfügen: ${q.label}${st.conflict ? " – " + st.conflict : ""} · Leertaste: Lösung wechseln · loslassen legt an`);
}
function commitQuick(app, s) {
  const asm = asmOf(app);
  app.viewer.highlight([]);
  if (!s.con) return updateDofGlyph(app);
  app.edit("Schnellfügen", () => {
    asm.constraints = [...(asm.constraints || []), s.con];
    solveAssembly(asm, (pid) => app.assemblyFaces(pid), (g) => app.asmEval(g));
  });
  app.sel = { type: "component", id: s.cid };
  app.refreshSelectionHits();
  app.tree.render();
  app.props.render();
  toast(`${s.con.name} angelegt`, { kind: s.conflict ? "err" : "ok" });
}
