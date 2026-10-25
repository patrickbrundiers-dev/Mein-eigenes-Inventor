// Werkzeuge Stufe 44: »Abhängigkeit platzieren« wie in Inventor – ein Bereich in den Eigenschaften (das 3D-Fenster
// bleibt bedienbar) mit den Reitern Baugruppe, Bewegung, Übergang und Abhängigkeitssatz. »Passend« erkennt aus der
// Auswahl, was gemeint ist: Fläche/Fläche, Achse oder Kante/Achse oder Kante, Punkt/Punkt, Punkt/Fläche, Kante/Fläche.
// Erste Auswahl = Bauteil, das bewegt wird; zweite = Ziel. Vorhandene Abhängigkeiten werden im selben Stil bearbeitet.
import { h, toast } from "./dom.js";
import { uid } from "../core/examples.js";
import { faceRef, axisRef, insertRef, endFaceFor, worldToLocal, solveAssembly, pointRef, edgeRef, frameRef, rigidRelation, CONSTRAINT_TYPES, AXIS_SOLUTIONS, valueKey } from "../core/asmsolve.js";
import { MOTION_KINDS, motionProblem } from "../core/kinematik.js";
import { matApply, matApplyDir, v3 } from "../core/geom.js";

export const PLACE_TYPES = [["passend", "Passend"], ["winkel", "Winkel"], ["tangential", "Tangential"], ["einfuegen", "Einfügen"], ["symmetrie", "Symmetrie"], ["starr", "Starr"]];
const TABS = [["baugruppe", "Baugruppe"], ["bewegung", "Bewegung"], ["uebergang", "Übergang"], ["satz", "Abhängigkeitssatz"]];
const KIND_LABEL = { plane: "Fläche", axis: "Zylinderachse", edge: "Kante", circle: "Kreiskante", point: "Punkt" };
const LEGACY = { gegen: ["passend", "passend"], buendig: ["passend", "fluchtend"], konzentrisch: ["passend", "passend"] };

/** Zustand der Platzierung (app.align) – alte Aufrufe mit mode werden übersetzt */
export function placeState(a = {}) {
  const st = { tab: "baugruppe", type: "passend", solution: "passend", axisSol: "unbestimmt", gap: "0", angle: "90", picks: [], persist: true, ratio: "1", motion: "drehung", sense: "gleich", ...a };
  if (a.mode && !a.type) {
    const [type, sol] = LEGACY[a.mode] || [a.mode, null];
    st.type = type;
    if (sol) st.solution = sol;
    if (a.mode === "einfuegen") st.solution = "entgegengesetzt";
  }
  if (!Array.isArray(st.picks)) st.picks = [];
  if (a.first && !st.picks.length) st.picks = [a.first];
  return st;
}

/** Wie viele Auswahlen braucht der Typ? */
const needed = (st) => (st.tab === "baugruppe" && (st.type === "symmetrie" || (st.type === "winkel" && st.solution === "referenz")) ? 3 : 2);

function pickables(app, hit) { return app.viewer.pickables?.find((p) => p.key === hit.key && p.body === hit.body); }
/** Treffer einordnen und in das System der Komponente umrechnen */
export function classifyHit(app, hit) {
  if (!hit?.key?.startsWith("comp:")) return null;
  const cid = hit.key.slice(5);
  const comp = app.activeDoc().components.find((c) => c.id === cid);
  if (!comp) return null;
  const inner = hit.group?.userData?.inner;
  if (hit.kind === "face") {
    let info = hit.info;
    if (inner && info) info = { ...info, ...(info.point ? { point: matApply(inner, info.point) } : {}), ...(info.normal ? { normal: matApplyDir(inner, info.normal) } : {}), ...(info.axisP ? { axisP: matApply(inner, info.axisP) } : {}), ...(info.axisD ? { axisD: matApplyDir(inner, info.axisD) } : {}) };
    if (info?.type === "PLANE" && info.normal) return { cid, kind: "plane", info, hit };
    if (info?.type === "CYLINDER" && info.axisD) return { cid, kind: "axis", info, hit };
    return null;
  }
  const toLocal = (wp) => worldToLocal(comp, wp, [0, 0, 1]).p;
  if (hit.kind === "vertex") return { cid, kind: "point", p: toLocal(hit.point), hit };
  if (hit.kind === "edge") {
    const pk = pickables(app, hit), pos = hit.info?.positions;
    if (!pk || !pos || pos.length < 6) return null;
    pk.lines.updateMatrixWorld?.();
    const M = pk.lines.matrixWorld.elements;
    const n = pos.length / 3, P = (k) => toLocal(matApply(M, [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]));
    if (hit.info.type === "LINE") { const a = P(0), b = P(n - 1); return v3.len(v3.sub(b, a)) > 1e-9 ? { cid, kind: "edge", p: a, d: v3.sub(b, a), hit } : null; }
    if (hit.info.type === "CIRCLE" && n >= 4) {
      const a = P(0), b = P(Math.floor(n / 3)), c = P(Math.floor((2 * n) / 3));
      const ab = v3.sub(b, a), ac = v3.sub(c, a), nn = v3.cross(ab, ac), l2 = v3.dot(nn, nn);
      if (l2 < 1e-12) return null;
      const center = v3.add(a, v3.mul(v3.add(v3.mul(v3.cross(nn, ab), v3.dot(ac, ac)), v3.mul(v3.cross(ac, nn), v3.dot(ab, ab))), 1 / (2 * l2)));
      return { cid, kind: "circle", p: center, d: v3.norm(nn), r: v3.len(v3.sub(a, center)), hit };
    }
  }
  return null;
}

const isAxisLike = (k) => k === "axis" || k === "edge" || k === "circle";
const isPointLike = (k) => k === "point" || k === "circle";
const refOf = (s, as) => {
  if (as === "plane") return faceRef(s.cid, s.info);
  if (as === "insert") return insertRef(s.cid, s.info, s.info.end);
  if (as === "point") return pointRef(s.cid, s.p);
  if (as === "frame") return frameRef(s.cid);
  if (s.kind === "axis") return axisRef(s.cid, s.info);
  return { ...edgeRef(s.cid, s.p, s.d), ...(s.kind === "circle" ? { r: Math.round(s.r * 1e9) / 1e9 } : {}) };
};
/** Richtung einer Auswahl (Referenzvektor beim Winkel) im System ihrer Komponente */
const dirOf = (s) => (s.kind === "plane" ? v3.norm(s.info.normal) : s.kind === "axis" ? v3.norm(s.info.axisD) : v3.norm(s.d));

/** Passt die Auswahl an Stelle i zum Typ? Rückgabe Fehlertext oder null */
function pickProblem(st, sel, i, picks) {
  const k = sel.kind;
  if (st.tab !== "baugruppe" || st.type === "starr") return null;
  const t = st.type;
  if (t === "winkel") return i < 2 ? (k === "plane" ? null : "Winkel: ebene Flächen wählen") : k === "point" ? "Referenz: Fläche, Kante oder Achse wählen" : null;
  if (t === "symmetrie") return k === "plane" ? null : "Symmetrie: ebene Flächen wählen";
  if (t === "einfuegen") return k === "axis" ? null : "Einfügen: zylindrische Fläche wählen (Bohrung, Bolzen)";
  if (t === "tangential") {
    if (k !== "plane" && k !== "axis") return "Tangential: ebene oder zylindrische Fläche wählen";
    if (i === 1 && picks[0].kind === "plane" && k === "plane") return "Tangential: jetzt eine zylindrische Fläche wählen";
    return null;
  }
  return null;
}

/** Abhängigkeit aus den Auswahlen bauen. picks[0] = bewegt (b), picks[1] = Ziel (a) */
export function buildConstraint(asm, st, picks) {
  const [B, A, C] = picks;
  const compName = (id) => asm.components.find((c) => c.id === id)?.name || "?";
  let type = st.type, a, b, extra = {};
  if (st.tab === "satz") { type = "koordinaten"; a = refOf(A, "frame"); b = refOf(B, "frame"); }
  else if (type === "starr") {
    a = refOf(A, "frame"); b = refOf(B, "frame");
    const CA = asm.components.find((c) => c.id === A.cid), CB = asm.components.find((c) => c.id === B.cid);
    extra.rel = rigidRelation(CA, CB);
  } else if (type === "passend") {
    const k1 = B.kind, k2 = A.kind;
    if (k1 === "plane" && k2 === "plane") { type = st.solution === "fluchtend" ? "buendig" : "gegen"; a = refOf(A, "plane"); b = refOf(B, "plane"); }
    else if ((k1 === "point" || k2 === "point") && isPointLike(k1) && isPointLike(k2)) { type = "punkt"; a = refOf(A, "point"); b = refOf(B, "point"); }
    else if (isAxisLike(k1) && isAxisLike(k2)) { type = "konzentrisch"; a = refOf(A); b = refOf(B); extra.solution = st.axisSol || "unbestimmt"; }
    else if ((k1 === "plane") !== (k2 === "plane")) {
      const other = k1 === "plane" ? k2 : k1;
      type = isPointLike(other) ? "punktflaeche" : "kanteflaeche";
      const r = (s) => (s.kind === "plane" ? refOf(s, "plane") : refOf(s, type === "punktflaeche" ? "point" : undefined));
      a = r(A); b = r(B);
    } else return { error: `${KIND_LABEL[k1]} und ${KIND_LABEL[k2]} lassen sich nicht passend verbinden` };
  } else if (type === "winkel") {
    a = refOf(A, "plane"); b = refOf(B, "plane");
    if (C) extra.refVec = { comp: C.cid, n: dirOf(C).map((x) => Math.round(x * 1e9) / 1e9) };
  } else if (type === "tangential") {
    a = refOf(A, A.kind === "plane" ? "plane" : undefined); b = refOf(B, B.kind === "plane" ? "plane" : undefined);
    if (A.kind === "axis" && B.kind === "axis") extra.solution = st.solution === "innen" ? "innen" : "aussen";
  } else if (type === "einfuegen") {
    a = refOf(A, "insert"); b = refOf(B, "insert");
    extra.solution = st.solution === "ausgerichtet" ? "ausgerichtet" : "entgegengesetzt";
  } else if (type === "symmetrie") {
    a = refOf(A, "plane"); b = refOf(B, "plane"); extra.s = refOf(C, "plane");
  }
  const vk = valueKey(type);
  const label = type === "konzentrisch" && (a.edge || b.edge) ? "Kante an Kante" : CONSTRAINT_TYPES[type];
  const con = {
    id: uid("ab"), type, a, b, ...extra,
    gap: vk === "gap" ? st.gap || "0" : "0",
    ...(vk === "angle" ? { angle: st.angle || "90" } : {}),
    ...(st.limits?.on && vk ? { limits: { min: Number(st.limits.min), max: Number(st.limits.max), rest: st.limits.rest !== false } } : {}),
    name: `${label}: ${compName(B.cid)} → ${compName(A.cid)}`,
  };
  return { con };
}

/** Klick im 3D-Fenster während der Platzierung */
export function placePick(app, hit) {
  const st = (app.align = placeState(app.align));
  if (st.tab === "uebergang") return toast("Übergang (Kurvenbahn) gibt es noch nicht");
  const sel = classifyHit(app, hit);
  if (!sel) return toast("Bitte eine Fläche, Kante oder einen Eckpunkt an einer Komponente wählen");
  const i = st.picks.length;
  const asm = app.activeDoc();
  if (i === 0 && st.tab === "baugruppe" && asm.components.find((c) => c.id === sel.cid)?.pat) return toast("Musterkopien folgen ihrer Quelle – bitte die Quelle ausrichten");
  if (i === 1 && sel.cid === st.picks[0].cid) return toast("Bitte etwas an einer anderen Komponente wählen");
  const prob = pickProblem(st, sel, i, st.picks);
  if (prob) return toast(prob);
  if (st.type === "einfuegen" && st.tab === "baugruppe") {
    const comp = asm.components.find((c) => c.id === sel.cid);
    const end = endFaceFor(sel.info, worldToLocal(comp, hit.point, [0, 0, 1]).p, app.assemblyFaces(comp.part));
    if (!end) return toast("Zur Zylinderfläche fehlt eine ebene Stirnfläche");
    sel.info = { ...sel.info, end };
  }
  st.picks.push(sel);
  app.align.first = st.picks[0];
  app.refreshSelectionHits();
  if (st.picks.length < needed(st)) { app.setHint(stepText(st)); app.props.render(); return; }
  finishPlace(app);
}

function finishPlace(app) {
  const st = app.align, asm = app.activeDoc();
  const picks = st.picks;
  const done = (sel) => {
    app.align = { ...placeState(st), picks: [], first: null, edit: null };
    app.pick = null;
    app.setHint("");
    app.sel = sel;
    app.refreshSelectionHits();
    app.tree.render();
    app.props.render();
    app.ribbon?.render?.();
  };
  if (st.tab === "bewegung") {
    const m = { id: uid("bw"), kind: st.motion || "drehung", a: picks[0].cid, b: picks[1].cid, ratio: st.ratio || "1", sense: st.sense || "gleich" };
    const prob = motionProblem(asm, m);
    if (prob) { st.picks = []; app.align.first = null; app.refreshSelectionHits(); app.props.render(); return toast(prob + " – Gelenk an der Komponente anlegen", { kind: "err", timeout: 6000 }); }
    const nm = (id) => asm.components.find((c) => c.id === id)?.name || "?";
    m.name = `${MOTION_KINDS.find(([k]) => k === m.kind)[1]}: ${nm(m.a)} → ${nm(m.b)}`;
    app.edit("Bewegung", () => { asm.motions = [...(asm.motions || []), m]; });
    return done({ type: "motion", id: m.id });
  }
  const A = asm.components.find((c) => c.id === picks[1].cid), B = asm.components.find((c) => c.id === picks[0].cid);
  if (st.type !== "starr" && st.tab !== "satz" && A.fixed && B.fixed) { toast("Beide Bauteile sind fixiert"); return app.cancelPick(); }
  const r = buildConstraint(asm, st, picks);
  if (r.error) { st.picks = []; app.align.first = null; app.refreshSelectionHits(); app.props.render(); return toast(r.error, { kind: "err" }); }
  const con = r.con;
  const persist = st.persist !== false;
  const editId = st.edit;
  app.edit(editId ? "Abhängigkeit neu wählen" : persist ? "Abhängigkeit" : "Ausrichten", () => {
    asm.constraints = asm.constraints || [];
    if (editId) {
      const i = asm.constraints.findIndex((c) => c.id === editId);
      if (i >= 0) { con.id = editId; con.suppressed = asm.constraints[i].suppressed; asm.constraints[i] = con; } else asm.constraints.push(con);
    } else asm.constraints.push(con);
    solveAssembly(asm, (pid) => app.assemblyFaces(pid), (g) => app.asmEval(g));
    if (!persist && !editId) asm.constraints = asm.constraints.filter((c) => c.id !== con.id);
  });
  done(persist || editId ? { type: "constraint", id: con.id } : { type: "component", id: B.id });
}

function stepText(st) {
  const i = st.picks.length;
  if (st.tab === "bewegung") return i ? "2. Komponente wählen, die mitbewegt wird (mit Gelenk)" : "1. Antreibende Komponente wählen (mit Gelenk)";
  if (st.tab === "satz") return i ? "2. Komponente wählen, deren Koordinatensystem das Ziel ist" : "1. Komponente wählen, die bewegt wird";
  if (i === 2) return st.type === "symmetrie" ? "3. Symmetrieebene wählen (Fläche einer dritten Komponente oder fixiertes Bauteil)" : "3. Referenz für den Drehsinn wählen (Fläche, Kante oder Achse)";
  const what = { passend: "Fläche, Kante, Achse oder Punkt", winkel: "ebene Fläche", tangential: "ebene oder zylindrische Fläche", einfuegen: "Zylinderfläche nahe der Stirnfläche", symmetrie: "ebene Fläche", starr: "beliebige Fläche" }[st.type];
  return i ? `2. Ziel: ${what} an einer anderen Komponente wählen` : `1. ${what} an der Komponente wählen, die bewegt wird`;
}

/** Grenzen: Haken, Minimum, Maximum, Ruhelage */
function limitFields(P, lim, unit, onChange) {
  const L = lim || {};
  const num = (label, key) => {
    const inp = h("input", { class: "inp", type: "number", step: "any", value: Number.isFinite(L[key]) ? L[key] : "" });
    inp.addEventListener("change", () => onChange({ ...L, on: true, [key]: inp.value === "" ? NaN : Number(inp.value) }));
    return P.field(label, h("div", { class: "expr-wrap" }, inp, h("span", { class: "val" }, unit)));
  };
  return [
    P.check("Grenzen verwenden", !!L.on, (v) => onChange({ ...L, on: v, min: Number.isFinite(L.min) ? L.min : 0, max: Number.isFinite(L.max) ? L.max : unit === "°" ? 90 : 100 })),
    ...(L.on ? [num("Minimum", "min"), num("Maximum", "max"), P.check("Wert als Ruhelage", L.rest !== false, (v) => onChange({ ...L, rest: v })),
      h("p", { class: "hint" }, "Mit Ruhelage gilt der eingegebene Wert (in den Grenzen); ohne bleibt die Lage stehen, solange sie in den Grenzen liegt.")] : []),
  ];
}

/** Bereich in den Eigenschaften während der Platzierung */
export function placeProps(P) {
  const app = P.app;
  const st = (app.align = placeState(app.align));
  const rerender = () => { app.refreshSelectionHits(); app.setHint(stepText(app.align)); P.render(); app.ribbon?.render?.(); };
  const reset = () => { st.picks = []; st.first = null; };
  const tabs = P.seg("", TABS, st.tab, (v) => { st.tab = v; reset(); rerender(); });
  const picksList = h("ol", { class: "place-picks" }, ...Array.from({ length: needed(st) }, (_, i) => {
    const s = st.picks[i];
    const comp = s && app.activeDoc().components.find((c) => c.id === s.cid);
    return h("li", { class: s ? "done" : i === st.picks.length ? "now" : "" }, s ? `${KIND_LABEL[s.kind]} an ${comp?.name || "?"}` : i === 0 ? "Auswahl 1" : i === 1 ? "Auswahl 2" : st.type === "symmetrie" ? "Symmetrieebene" : "Referenz");
  }));
  const body = [];
  if (st.tab === "baugruppe") {
    body.push(P.seg("Typ", PLACE_TYPES, st.type, (v) => { st.type = v; st.solution = { passend: "passend", winkel: "ohne", tangential: "aussen", einfuegen: "entgegengesetzt" }[v] || ""; reset(); rerender(); }));
    if (st.type === "passend") body.push(P.seg("Lösung Flächen", [["passend", "Passend (entgegengesetzt)"], ["fluchtend", "Fluchtend (ausgerichtet)"]], st.solution, (v) => { st.solution = v; rerender(); }),
      P.seg("Lösung Achsen", AXIS_SOLUTIONS, st.axisSol || "unbestimmt", (v) => { st.axisSol = v; rerender(); }));
    if (st.type === "winkel") body.push(P.seg("Lösung", [["ohne", "Ungerichtet (0–180°)"], ["referenz", "Mit Referenzvektor (0–360°)"]], st.solution === "referenz" ? "referenz" : "ohne", (v) => { st.solution = v; if (st.picks.length > 2) st.picks.length = 2; rerender(); }));
    if (st.type === "tangential") body.push(P.seg("Lösung (Zylinder an Zylinder)", [["aussen", "Außen"], ["innen", "Innen"]], st.solution === "innen" ? "innen" : "aussen", (v) => { st.solution = v; rerender(); }));
    if (st.type === "einfuegen") body.push(P.seg("Lösung", [["entgegengesetzt", "Entgegengesetzt"], ["ausgerichtet", "Ausgerichtet"]], st.solution === "ausgerichtet" ? "ausgerichtet" : "entgegengesetzt", (v) => { st.solution = v; rerender(); }));
    if (st.type === "winkel") body.push(P.expr("Winkel", st.angle || "90", (v) => { st.angle = v; }, { unit: "°", allowNeg: false }));
    else if (!["symmetrie", "starr"].includes(st.type)) body.push(P.expr("Versatz", st.gap || "0", (v) => { st.gap = v; }));
    if (!["symmetrie", "starr"].includes(st.type)) body.push(...limitFields(P, st.limits, st.type === "winkel" ? "°" : "mm", (L) => { st.limits = L; P.render(); }));
    body.push(h("p", { class: "hint" }, {
      passend: "Erkennt aus der Auswahl: Fläche an Fläche (passend oder fluchtend), Achse/Kante an Achse/Kante, Punkt an Punkt (wie Kugelgelenk), Punkt auf Fläche, Kante auf Fläche.",
      winkel: "Winkel zwischen zwei ebenen Flächen. Mit Referenzvektor (dritte Auswahl) ist der Drehsinn eindeutig und der Winkel geht bis 360°.",
      tangential: "Zylinder an Fläche oder Zylinder an Zylinder (außen oder innen anliegend).",
      einfuegen: "Achsen fluchten und Stirnfläche liegt auf (Schraube in Bohrung).",
      symmetrie: "Die zweite Fläche liegt spiegelbildlich zur ersten bezüglich der Symmetrieebene (dritte Auswahl).",
      starr: "Die Komponente bleibt in ihrer heutigen Lage fest mit der anderen verbunden (wie verschweißt).",
    }[st.type]));
    if (!st.edit) body.push(P.check("Als Abhängigkeit speichern (folgt Änderungen)", st.persist !== false, (v) => { st.persist = v; }));
  } else if (st.tab === "bewegung") {
    body.push(P.seg("Typ", MOTION_KINDS, st.motion || "drehung", (v) => { st.motion = v; P.render(); }),
      P.expr(st.motion === "drehschiebung" ? "Weg je Umdrehung" : "Übersetzung", st.ratio || "1", (v) => { st.ratio = v; }, { unit: st.motion === "drehschiebung" ? "mm" : "" }),
      P.seg("Richtung", [["gleich", "Gleichsinnig"], ["gegen", "Gegensinnig"]], st.sense || "gleich", (v) => { st.sense = v; P.render(); }),
      h("p", { class: "hint" }, st.motion === "drehschiebung" ? "Zahnstange oder Spindel: Die erste Komponente dreht (Dreh- oder Zylindergelenk), die zweite schiebt (Schiebegelenk) um den Weg je Umdrehung." : "Zahnräder, Riemen: Dreht die erste Komponente um 1°, dreht die zweite um die Übersetzung. Beide brauchen ein Dreh- oder Zylindergelenk."));
  } else if (st.tab === "uebergang") {
    body.push(h("div", { class: "msg info" }, "Übergang (Kurvenbahn, Nocken an Fläche) folgt später. Bis dahin Tangential oder ein Gelenk verwenden."));
  } else {
    body.push(h("p", { class: "hint" }, "Abhängigkeitssatz: Die Koordinatensysteme der beiden Komponenten fallen zusammen – Ursprung und Achsen. Eine beliebige Fläche je Komponente anklicken."));
  }
  return [P.section(st.edit ? "Abhängigkeit neu wählen" : "Abhängigkeit platzieren", tabs, st.tab === "uebergang" ? null : picksList, ...body,
    h("div", { class: "btn-row" },
      st.picks.length ? h("button", { class: "btn", onclick: () => { reset(); rerender(); } }, "Auswahl zurücksetzen") : null,
      h("button", { class: "btn", onclick: () => app.cancelPick() }, "Abbrechen")))];
}

/** Platzierung starten; opts {type, tab, solution, edit} */
export function beginPlace(app, opts = {}) {
  const prev = placeState(app.align || {});
  app.align = { ...prev, picks: [], first: null, edit: null, ...opts };
  if (opts.mode) Object.assign(app.align, placeState({ mode: opts.mode }), { picks: [], gap: prev.gap, angle: prev.angle, persist: prev.persist });
  app.pick = { kind: "align" };
  app.setHint(stepText(app.align));
  app.props.render();
  app.ribbon?.render?.();
}

const typeLabel = (c) => (c.type === "konzentrisch" && (c.a.edge || c.b.edge) ? "Kante an Kante" : CONSTRAINT_TYPES[c.type] || c.type);
/** Eigenschaften einer vorhandenen Abhängigkeit (wie Inventor »Abhängigkeit bearbeiten«) */
export function constraintEditor(P, asm, c) {
  const app = P.app;
  const err = app.asmErrors?.[c.id];
  const comp = (id) => asm.components.find((x) => x.id === id);
  const set = (label, fn) => app.edit(label, () => fn(c));
  const vk = valueKey(c.type);
  const unit = vk === "angle" ? "°" : "mm";
  const out = [];
  if (c.type === "gegen" || c.type === "buendig") out.push(P.seg("Lösung", [["gegen", "Passend"], ["buendig", "Fluchtend"]], c.type, (v) => set("Abhängigkeit", (x) => { x.type = v; x.name = x.name?.replace(/^[^:]+/, CONSTRAINT_TYPES[v]); })));
  if (c.type === "konzentrisch") out.push(P.seg("Lösung", AXIS_SOLUTIONS, c.solution || "unbestimmt", (v) => set("Lösung", (x) => { x.solution = v; })));
  if (c.type === "einfuegen") out.push(P.seg("Lösung", [["entgegengesetzt", "Entgegengesetzt"], ["ausgerichtet", "Ausgerichtet"]], c.solution === "ausgerichtet" ? "ausgerichtet" : "entgegengesetzt", (v) => set("Lösung", (x) => { x.solution = v; })));
  if (c.type === "tangential" && c.a.axis && c.b.axis) out.push(P.seg("Lösung", [["aussen", "Außen"], ["innen", "Innen"]], c.solution === "innen" ? "innen" : "aussen", (v) => set("Lösung", (x) => { x.solution = v; })));
  if (vk === "angle") out.push(P.expr("Winkel", c.angle ?? "90", (v) => set("Winkel", (x) => { x.angle = v; }), { unit: "°", allowNeg: false }));
  else if (vk === "gap") out.push(P.expr("Versatz", c.gap || "0", (v) => set("Versatz", (x) => { x.gap = v; })));
  if (c.type === "winkel") out.push(c.refVec
    ? h("div", { class: "btn-row" }, h("span", { class: "hint" }, `Referenzvektor an ${comp(c.refVec.comp)?.name || "?"} (0–360°)`), h("button", { class: "btn", onclick: () => set("Referenzvektor", (x) => { delete x.refVec; }) }, "Entfernen"))
    : h("p", { class: "hint" }, "Ungerichtet (0–180°). Für einen eindeutigen Drehsinn »Auswahl neu« mit Referenzvektor."));
  if (vk) out.push(...limitFields(P, c.limits ? { ...c.limits, on: true } : null, unit, (L) => set("Grenzen", (x) => { if (L.on) x.limits = { min: Number(L.min), max: Number(L.max), rest: L.rest !== false }; else delete x.limits; })));
  const kv = [h("dt", {}, "Art"), h("dd", {}, typeLabel(c)), h("dt", {}, "Bewegt"), h("dd", {}, comp(c.b.comp)?.name || "–"), h("dt", {}, "Ziel"), h("dd", {}, comp(c.a.comp)?.name || "–")];
  if (c.s) kv.push(h("dt", {}, "Symmetrieebene"), h("dd", {}, comp(c.s.comp)?.name || "–"));
  const typeForEdit = { gegen: "passend", buendig: "passend", konzentrisch: "passend", punkt: "passend", punktflaeche: "passend", kanteflaeche: "passend", koordinaten: null }[c.type] ?? c.type;
  return [
    err ? h("div", { class: "msg err" }, err) : null,
    P.section(c.name || "Abhängigkeit", h("dl", { class: "kv" }, ...kv), ...out,
      P.check("Unterdrückt", c.suppressed, (v) => set("Abhängigkeit", (x) => { x.suppressed = v; }))),
    h("div", { class: "btn-row" },
      h("button", { class: "btn", onclick: () => beginPlace(app, { edit: c.id, tab: c.type === "koordinaten" ? "satz" : "baugruppe", type: typeForEdit || "passend", solution: c.type === "buendig" ? "fluchtend" : c.type === "winkel" && c.refVec ? "referenz" : c.solution || (c.type === "tangential" ? "aussen" : "passend"), axisSol: c.solution || "unbestimmt", gap: c.gap || "0", angle: c.angle || "90", limits: c.limits ? { ...c.limits, on: true } : null }) }, "Auswahl neu"),
      h("button", { class: "btn danger", onclick: () => P.deleteConstraint(c.id) }, "Löschen")),
  ];
}

/** Eigenschaften einer Bewegungs-Abhängigkeit */
export function motionEditor(P, asm, m) {
  const app = P.app;
  const prob = motionProblem(asm, m);
  const comp = (id) => asm.components.find((x) => x.id === id);
  const set = (label, fn) => app.edit(label, () => fn(m));
  return [
    prob ? h("div", { class: "msg err" }, prob) : null,
    P.section(m.name || "Bewegung",
      h("dl", { class: "kv" }, h("dt", {}, "Antrieb"), h("dd", {}, comp(m.a)?.name || "–"), h("dt", {}, "Folgt"), h("dd", {}, comp(m.b)?.name || "–")),
      P.seg("Typ", MOTION_KINDS, m.kind, (v) => set("Bewegung", (x) => { x.kind = v; })),
      P.expr(m.kind === "drehschiebung" ? "Weg je Umdrehung" : "Übersetzung", m.ratio || "1", (v) => set("Übersetzung", (x) => { x.ratio = v; }), { unit: m.kind === "drehschiebung" ? "mm" : "" }),
      P.seg("Richtung", [["gleich", "Gleichsinnig"], ["gegen", "Gegensinnig"]], m.sense || "gleich", (v) => set("Richtung", (x) => { x.sense = v; })),
      P.check("Unterdrückt", m.suppressed, (v) => set("Bewegung", (x) => { x.suppressed = v; })),
      h("p", { class: "hint" }, "Am Gelenk der antreibenden Komponente den Winkel verstellen oder »Bewegen« – die zweite folgt.")),
    h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => app.edit("Bewegung löschen", () => { asm.motions = (asm.motions || []).filter((x) => x.id !== m.id); app.sel = null; }) }, "Löschen")),
  ];
}
