// Baugruppenerstellung (BG1–BG6) im 3D-Fenster: Platzieren mit Vorschau am Mauszeiger, Komponenten mit der Maus
// ziehen und drehen (nur in freie Richtungen), Schnellfügen mit Alt-Ziehen, Freiheitsgrade an der Auswahl.
// Rechnung in src/core/asmdof.js und src/core/baugruppe.js.
import * as THREE from "three";
import { h, toast, modal } from "./dom.js";
import { uid } from "../core/examples.js";
import { componentDof, projectFree, dofLabel } from "../core/asmdof.js";
import { quickMate, placeAt, applyDelta, deltaBetween, moveIntoSub, dissolveSub, planeFromFace, inferFuegepunkte, addFuegepunkte, autoMate } from "../core/baugruppe.js";
import { MIRROR_PLANES } from "../core/ableiten.js";
import { defaultAsmPattern } from "../core/asmmuster.js";
import { newPart } from "../core/examples.js";
import { newAssembly } from "../core/examples.js";
import { solveAssembly, endFaceFor, worldToLocal } from "../core/asmsolve.js";
import { flattenAssembly, canInsert } from "../core/subasm.js";
import { placementMatrix, rotationAbout, matApply, matApplyDir, v3 } from "../core/geom.js";
import { classifyHit, buildConstraint, placeState } from "./abhaengigkeit.js";
import { listLibrary, insertFromLibrary } from "./teilebibliothek.js";
import { filterEntries } from "../core/teilebibliothek.js";

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
  const search = h("input", { class: "inp", placeholder: "Suchen …", spellcheck: "false" });
  const list = h("div", { class: "place-list" });
  let close = null, lib = [];
  const go = (id) => { close?.(); beginPlacing(app, id); };
  // BG10: Projekt und eigene Teilebibliothek in einer Liste
  const fill = () => {
    const q = search.value.trim().toLowerCase();
    const libHits = filterEntries(lib, q);
    list.replaceChildren(...docs.filter((d) => !q || `${d.name} ${d.number || ""}`.toLowerCase().includes(q)).map((d) =>
      h("button", { class: "place-item", "data-doc": d.id, onclick: () => go(d.id) },
        h("b", {}, d.name), d.kind === "assembly" ? h("span", { class: "hint" }, " Baugruppe") : null, d.number ? h("span", { class: "hint" }, " " + d.number) : null)),
      ...(libHits.length ? [h("div", { class: "hint place-head" }, "Aus der Teilebibliothek")] : []),
      ...libHits.map((e) => h("button", { class: "place-item", "data-lib": e.id, onclick: () => { close?.(); insertFromLibrary(app, e); } },
        h("b", {}, e.name), e.category ? h("span", { class: "hint" }, " " + e.category) : null)));
  };
  listLibrary().then((l) => { lib = l; fill(); }).catch(() => {});
  search.addEventListener("input", fill);
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") list.querySelector("button")?.click(); });
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
    addComponent(app, asm, d, placeAt(at, center), { near: at });
  }
  app.pick = { kind: "place", doc: docId, center, ghostOk: items.some((it) => it.bodies?.length) };
  app.viewer.setPlaceGhost(items);
  app.setHint(`»${d.name}« platzieren: Klick setzt eine Kopie (auf Flächen einrastend) – Esc oder Rechtsklick beendet`);
  app.ribbon?.render?.();
}
function addComponent(app, asm, d, place, { fixed = false, near = null } = {}) {
  const comp = { id: uid("c"), part: d.id, name: `${d.name}:${asm.components.filter((c) => c.part === d.id).length + 1}`, pos: place.pos, rot: place.rot, ...(fixed ? { fixed: true } : {}) };
  let mated = [];
  app.edit("Platzieren", () => {
    asm.components.push(comp);
    // BG8: passende Fügepunkte fügen die neue Komponente gleich an (nächstliegendes Gegenstück)
    if (!fixed && app.prefs?.get("baugruppe.fuegepunkte") !== false) {
      mated = autoMate(asm, comp.id, (id) => app.doc(id), near, () => uid("ab"));
      if (mated.length) {
        asm.constraints = [...(asm.constraints || []), ...mated];
        solveAssembly(asm, (pid) => app.assemblyFaces(pid), (g) => app.asmEval(g));
      }
    }
  });
  if (mated.length) toast(`Über Fügepunkt gefügt: ${mated.map((k) => k.fp).join(", ")}`, { kind: "ok" });
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
  // neu angelegte Bauteile (Normteil, Bibliothek) sind beim Start oft noch nicht gerechnet: Vorschau nachholen
  if (!app.pick.ghostOk) refreshGhost(app);
  const p = cursorPoint(app, e);
  if (p) app.viewer.movePlaceGhost(placementMatrix(placeAt(p, app.pick.center).pos, [0, 0, 0]));
}
function refreshGhost(app) {
  const d = app.doc(app.pick.doc);
  if (!d) return;
  const occ = d.kind === "assembly" ? flattenAssembly(d, (id) => app.doc(id)) : [{ part: d, matrix: null }];
  const items = occ.map((o) => ({ bodies: app.results.get(o.part.id)?.bodies, color: app.partColor(o.part), inner: o.matrix }));
  if (!items.some((it) => it.bodies?.length)) return;
  const boxes = occ.flatMap((o) => (app.results.get(o.part.id)?.bodies || []).map((b) => b.props?.bbox).filter(Boolean));
  if (boxes.length) app.pick.center = [0, 1, 2].map((i) => (Math.min(...boxes.map((b) => b[0][i])) + Math.max(...boxes.map((b) => b[1][i]))) / 2);
  app.pick.ghostOk = true;
  app.viewer.setPlaceGhost(items);
}
export function placeClick(app, e) {
  const asm = asmOf(app), d = app.doc(app.pick.doc), p = cursorPoint(app, e);
  if (!asm || !d || !p) return;
  addComponent(app, asm, d, placeAt(p, app.pick.center), { near: p });
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

// ---------- Unterbaugruppe bilden / auflösen (BG7) ----------
const clone = (x) => JSON.parse(JSON.stringify(x));
/** Wie oft steckt das Dokument docId als Komponente im Projekt? */
const usesOf = (app, docId) => app.project.docs.filter((d) => d.kind === "assembly").reduce((n, d) => n + (d.components || []).filter((c) => c.part === docId && !c.pat).length, 0);
function report(r, what) {
  const extra = [r.constraints ? `${r.constraints} Abhängigkeit(en) mitgenommen` : "", r.relinked ? `${r.relinked} nach außen umgehängt` : "", r.dropped ? `${r.dropped} entfernt (Starr/Koordinatensystem bitte neu setzen)` : ""].filter(Boolean).join(", ");
  toast(`${what}${extra ? " – " + extra : ""}`, { kind: r.dropped ? "" : "ok", timeout: 6000 });
}
/** Auswahl der Komponenten und Name, dann neue Unterbaugruppe an derselben Stelle */
export function formSubDialog(app, preselect = null) {
  const asm = asmOf(app);
  if (!asm) return;
  const cand = asm.components.filter((c) => !c.pat);
  if (cand.length < 1) return toast("Die Baugruppe hat noch keine Komponenten");
  const pre = new Set([preselect || (app.sel?.type === "component" ? app.sel.id : null)].filter(Boolean));
  const name = h("input", { class: "inp", value: app.docName ? app.docName("assembly") : "Unterbaugruppe" });
  const boxes = cand.map((c) => [c, h("input", { type: "checkbox", checked: pre.has(c.id) ? true : undefined })]);
  const err = h("div", { class: "hint" });
  modal({
    title: "Unterbaugruppe bilden", width: "440px",
    body: h("div", {}, h("div", { class: "field wide" }, h("label", {}, "Name"), name),
      h("div", { class: "checks place-list" }, ...boxes.map(([c, b]) => h("label", { class: "check" }, b, " ", c.name))),
      h("p", { class: "hint" }, "Die gewählten Komponenten wandern in eine neue Baugruppe an derselben Stelle. Abhängigkeiten untereinander gehen mit, Abhängigkeiten nach außen hängen danach an der Unterbaugruppe."), err),
    buttons: [{ label: "Abbrechen" }, { label: "Bilden", primary: true, run: () => {
      const ids = boxes.filter(([, b]) => b.checked).map(([c]) => c.id);
      if (!ids.length) { err.textContent = "Mindestens eine Komponente wählen"; return false; }
      const sub = newAssembly(name.value.trim() || "Unterbaugruppe");
      const sc = { id: uid("c"), part: sub.id, name: `${sub.name}:1`, pos: [0, 0, 0], rot: [0, 0, 0] };
      const test = moveIntoSub(clone({ ...asm, components: [...asm.components, sc] }), ids, clone(sub), sc);
      if (test.error) { err.textContent = test.error; return false; }
      let r;
      app.edit("Unterbaugruppe bilden", () => {
        app.project.docs.push(sub);
        const fixed = asm.components.some((c) => ids.includes(c.id) && c.fixed);
        if (fixed) sc.fixed = true;
        asm.components.splice(asm.components.findIndex((c) => ids.includes(c.id)), 0, sc);
        r = moveIntoSub(asm, ids, sub, sc);
      });
      app.sel = { type: "component", id: sc.id };
      app.refreshSelectionHits(); app.tree.render(); app.props.render();
      report(r, `Unterbaugruppe »${sub.name}« mit ${r.moved} Komponente(n) gebildet`);
      return true;
    } }],
  });
}
/** Unterbaugruppe auflösen: Komponenten eine Ebene höher */
export function dissolveSubComp(app, compId) {
  const asm = asmOf(app), c = compOf(asm, compId), sub = c && app.doc(c.part);
  if (sub?.kind !== "assembly") return toast("Nur Unterbaugruppen lassen sich auflösen");
  let r;
  const alone = usesOf(app, sub.id) === 1;
  app.edit("Unterbaugruppe auflösen", () => {
    r = dissolveSub(asm, compId, clone(sub), () => uid("c"));
    // die Baugruppe bleibt im Projekt, wenn sie noch woanders steckt oder eine Zeichnung sie zeigt
    if (!r.error && alone && !app.project.docs.some((d) => d.kind === "drawing" && JSON.stringify(d).includes(sub.id))) app.project.docs = app.project.docs.filter((d) => d.id !== sub.id);
  });
  if (r.error) return toast(r.error, { kind: "err" });
  app.sel = null;
  app.refreshSelectionHits(); app.tree.render(); app.props.render();
  toast(`»${sub.name}« aufgelöst: ${r.added} Komponente(n) eine Ebene höher${r.dropped ? ` – ${r.dropped} Abhängigkeit(en) an der Unterbaugruppe entfernt, bitte neu fügen` : ""}`, { kind: r.dropped ? "" : "ok", timeout: 6000 });
}
/** Komponente im Baum auf eine Unterbaugruppe ziehen (Umhängen) */
export function moveCompIntoSub(app, compId, subCompId) {
  const asm = asmOf(app), sc = compOf(asm, subCompId), sub = sc && app.doc(sc.part);
  if (!asm || sub?.kind !== "assembly" || compId === subCompId) return;
  if (usesOf(app, sub.id) > 1) return toast(`»${sub.name}« steckt mehrfach im Projekt – Umhängen würde alle Vorkommen ändern. Erst eine eigene Unterbaugruppe bilden.`);
  const test = moveIntoSub(clone(asm), [compId], clone(sub), sc);
  if (test.error) return toast(test.error, { kind: "err" });
  let r;
  app.edit("In Unterbaugruppe verschieben", () => { r = moveIntoSub(asm, [compId], sub, sc); });
  app.tree.render(); app.props.render();
  report(r, `In »${sub.name}« verschoben`);
}

// ---------- Spiegeln erweitert (BG11) ----------
/** Mehrere Komponenten an einer Hauptebene (mit Abstand) oder an einer gewählten Fläche spiegeln */
export function mirrorDialog(app, preselect = null) {
  const asm = asmOf(app);
  if (!asm) return;
  const cand = asm.components.filter((c) => !c.pat && app.doc(c.part)?.kind === "part");
  if (!cand.length) return toast("Keine Bauteile zum Spiegeln");
  const pre = preselect || (app.sel?.type === "component" ? app.sel.id : null);
  const rows = cand.map((c) => {
    const box = h("input", { type: "checkbox", checked: c.id === pre ? true : undefined });
    const how = h("select", { class: "inp", style: { width: "auto" } }, h("option", { value: "spiegeln" }, "gespiegeltes Bauteil"), h("option", { value: "wieder" }, "wiederverwenden (symmetrisch)"));
    return { c, box, how };
  });
  const plane = h("select", { class: "inp" }, ...Object.keys(MIRROR_PLANES).map((k) => h("option", { value: k }, `${k}-Ebene der Baugruppe`)), h("option", { value: "flaeche" }, "Fläche im 3D-Fenster wählen …"));
  const off = h("input", { class: "inp", value: "0" });
  const err = h("div", { class: "hint" });
  // N6: assoziativ – ein Spiegel-Muster; die Kopien folgen Lage und Form der Quellen, Teile lassen sich später abwählen
  const run = (pl) => {
    const chosen = rows.filter((r) => r.box.checked);
    const pm = defaultAsmPattern(uid("pm"), chosen.map((r) => r.c.id), "spiegel");
    pm.name = `Spiegelung ${(asm.patterns || []).filter((x) => x.kind === "spiegel").length + 1}`;
    if (pl.key) { pm.plane = pl.key; pm.offset = String(pl.c); } else { pm.plane = null; pm.normal = pl.n.map((x) => Math.round(x * 1e9) / 1e9); pm.offset = String(Math.round(pl.c * 1e6) / 1e6); }
    for (const r of chosen) if (r.how.value === "wieder") pm.modes[r.c.id] = "wieder";
    app.edit("Komponenten spiegeln", () => { asm.patterns = [...(asm.patterns || []), pm]; });
    app.sel = { type: "asmpattern", id: pm.id };
    app.refreshSelectionHits(); app.tree.render(); app.props.render();
    toast(`${chosen.length} Komponente(n) gespiegelt – die Spiegelung folgt den Quellen`, { kind: "ok" });
  };
  modal({
    title: "Komponenten spiegeln", width: "560px",
    body: h("div", {},
      h("div", { class: "place-list" }, ...rows.map((r) => h("label", { class: "check", style: { display: "flex", gap: "6px", alignItems: "center" } }, r.box, h("span", { class: "grow" }, r.c.name), r.how))),
      h("div", { class: "field wide" }, h("label", {}, "Spiegelebene"), plane),
      h("div", { class: "field" }, h("label", {}, "Abstand vom Ursprung (mm)"), off),
      h("p", { class: "hint" }, "Die Spiegelung bleibt verknüpft: verschiebt oder ändert sich eine Quelle, folgt die gespiegelte Seite. Gespiegeltes Bauteil: abgeleitet, folgt Änderungen am Original. Wiederverwenden: dasselbe Bauteil an der Spiegelstelle – nur für Teile, die in sich symmetrisch sind (Rohre, Platten, Normteile)."), err),
    buttons: [{ label: "Abbrechen" }, { label: "Spiegeln", primary: true, run: () => {
      if (!rows.some((r) => r.box.checked)) { err.textContent = "Mindestens eine Komponente wählen"; return false; }
      if (plane.value !== "flaeche") {
        const c = Number(String(off.value).replace(",", "."));
        if (!Number.isFinite(c)) { err.textContent = "Abstand als Zahl"; return false; }
        run({ key: plane.value, n: MIRROR_PLANES[plane.value], c });
        return true;
      }
      app.pick = { kind: "custom", onPick: (hit) => {
        if (hit?.kind !== "face" || hit.info?.type !== "PLANE") return toast("Bitte eine ebene Fläche wählen");
        app.cancelPick();
        run(planeFromFace(hit.point, hit.normal || hit.info.normal));
      } };
      app.setHint("Spiegelebene: ebene Fläche einer Komponente anklicken – Esc bricht ab");
      return true;
    } }],
  });
}

// ---------- Fügepunkte (BG8) ----------
/** Fügepunkte aus den Abhängigkeiten der Komponente in beide Bauteile übernehmen */
export function learnFuegepunkte(app, compId) {
  const asm = asmOf(app);
  if (!asm) return;
  const list = inferFuegepunkte(asm, compId, (id) => app.doc(id), () => uid("fp"));
  if (!list.length) return toast("Die Komponente hat keine Abhängigkeit zu einem anderen Bauteil – erst fügen, dann merken");
  let n = 0;
  app.edit("Fügepunkte merken", () => {
    for (const { partId, fp } of list) n += addFuegepunkte(app.doc(partId), [fp]);
    // die vorhandenen Abhängigkeiten belegen ihre Fügepunkte
    for (const k of asm.constraints || []) if ((k.a?.comp === compId || k.b?.comp === compId) && !k.fp) { const hit = list.find(({ fp }) => fp.type === k.type && JSON.stringify(fp.ref) === JSON.stringify((({ comp, ...r }) => r)(fp.side === "a" ? k.a : k.b))); if (hit) k.fp = hit.fp.name; }
  });
  app.props.render();
  toast(n ? `${n} Fügepunkt(e) gemerkt – beim nächsten Platzieren fügen sich die Teile von selbst` : "Diese Fügepunkte gibt es schon", { kind: "ok", timeout: 6000 });
}
/** Abschnitt in den Komponenten-Eigenschaften: Fügepunkte des Bauteils */
export function fuegepunkteSection(props, asm, c) {
  const app = props.app, p = app.doc(c.part);
  if (p?.kind !== "part") return null;
  const fps = p.fuegepunkte || [];
  return props.section("Fügepunkte",
    fps.length ? h("ul", { class: "fp-list" }, ...fps.map((fp) => h("li", {}, h("span", { class: "grow" }, fp.name), h("span", { class: "hint" }, fp.side === "a" ? " (Ziel)" : " (bewegt)"),
      h("button", { class: "icon-btn", title: "Fügepunkt löschen", onclick: () => app.edit("Fügepunkt löschen", () => { p.fuegepunkte = p.fuegepunkte.filter((x) => x.id !== fp.id); if (!p.fuegepunkte.length) delete p.fuegepunkte; }) }, "×"))))
      : h("p", { class: "hint" }, "Fügepunkte merken, wie ein Teil sitzt (z. B. Schraube in Bohrung, Pfosten auf Fußplatte). Beim nächsten Platzieren fügt PBCAD es dann von selbst an das nächstliegende passende Gegenstück."),
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => learnFuegepunkte(app, c.id) }, "Aus Abhängigkeiten merken")));
}

// ---------- Skelett / Komponenten aus Körpern (BG12, wie Inventor »Komponenten erstellen«) ----------
/** Jeder Körper des Bauteils der Komponente wird ein eigenes, abgeleitetes Bauteil an derselben Stelle; das Skelett wird ausgeblendet */
export function componentsFromBodies(app, compId) {
  const asm = asmOf(app), c = compOf(asm, compId), src = c && app.doc(c.part);
  if (src?.kind !== "part") return toast("Nur Bauteile haben Körper");
  const bodies = (app.results.get(src.id)?.bodies || []).filter((b) => b.kind !== "sketch");
  if (bodies.length < 2) return toast("Das Bauteil hat nur einen Körper – im Skelett mehrere Körper modellieren (Extrusion »Neuer Körper«)");
  const made = [];
  app.edit("Komponenten aus Körpern", () => {
    bodies.forEach((b, i) => {
      // vorhandenes abgeleitetes Bauteil für diesen Körper wiederverwenden
      let doc = app.parts().find((d) => d.features?.[0]?.type === "abgeleitet" && d.features[0].source === src.id && Number(d.features[0].body) === i);
      if (!doc) {
        doc = app.withPartDefaults(newPart(b.name && !/^Körper/.test(b.name) ? b.name : `${src.name} ${i + 1}`));
        doc.material = src.material;
        doc.features = [{ id: uid("f"), type: "abgeleitet", name: "Aus Skelett", source: src.id, body: i, scale: "1" }];
        app.project.docs.push(doc);
      }
      const comp = { id: uid("c"), part: doc.id, name: `${doc.name}:${asm.components.filter((x) => x.part === doc.id).length + 1}`, pos: [...c.pos], rot: [...c.rot] };
      // fest am Skelett: Starr-Abhängigkeit hält die Teile in ihrer Lage
      asm.components.push(comp);
      asm.constraints = [...(asm.constraints || []), { id: uid("ab"), type: "starr", a: { comp: c.id, frame: true }, b: { comp: comp.id, frame: true }, rel: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], gap: "0", name: `Starr: ${comp.name} → Skelett` }];
      made.push(comp);
    });
    c.hidden = true;
    c.skelett = true;
  });
  app.tree.render(); app.props.render();
  toast(`${made.length} Bauteile aus »${src.name}« erstellt – Änderungen am Skelett übertragen sich. Skelett ausgeblendet (zählt nicht in der Stückliste).`, { kind: "ok", timeout: 7000 });
}

// ---------- Gelenk in einem Schritt (BG14, wie Fusion) ----------
/** Achse im 3D-Fenster wählen (Zylinderfläche, gerade Kante oder ebene Fläche = Normale am Klickpunkt), dann Gelenk anlegen */
export function jointPick(app, kind = "dreh") {
  const asm = asmOf(app);
  if (!asm) return;
  app.pick = { kind: "custom", onPick: (hit) => {
    const sel = hit && classifyHit(app, hit);
    if (!sel) return toast("Bitte eine Zylinderfläche, Kante oder ebene Fläche der Komponente wählen, die sich bewegen soll");
    const c = compOf(asm, sel.cid);
    if (c?.fixed) return toast(`${c.name} ist fixiert – die bewegliche Komponente wählen`);
    const M = placementMatrix(c.pos, c.rot);
    let axis = null;
    if (sel.kind === "axis") axis = { p: matApplyW(M, sel.info.axisP), d: dirW(M, sel.info.axisD) };
    else if (sel.kind === "edge" || sel.kind === "circle") axis = { p: matApplyW(M, sel.p), d: dirW(M, sel.d) };
    else if (sel.kind === "plane") axis = { p: hit.point, d: dirW(M, sel.info.normal) };
    if (!axis) return toast("Daraus lässt sich keine Achse bilden");
    app.cancelPick();
    app.sel = { type: "component", id: c.id };
    app.refreshSelectionHits();
    app.props.jointDialog(c, kind, axis);
  } };
  app.setHint(`${kind === "schiebe" ? "Schiebegelenk" : kind === "zylinder" ? "Zylindergelenk" : "Drehgelenk"}: an der beweglichen Komponente die Achse anklicken (Bohrung, Bolzen, Kante oder Fläche) – Esc bricht ab`);
}
const matApplyW = (M, p) => matApply(M, p);
const dirW = (M, d) => v3.norm(matApplyDir(M, d));
