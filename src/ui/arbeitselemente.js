// Arbeitselemente in der Oberfläche (Inventor »Arbeitselemente«, Fusion »Konstruieren«): Erzeugen durch Anklicken mit
// erkannter Art und Vorschau, Bezüge im 3D-Fenster wählen, Griff zum Ziehen des Abstands, Anzeige mit Bezügen,
// Auswahl im 3D-Fenster und Sichtbarkeit. Die Rechnung steht in src/core/datums.js und src/core/datumpick.js.
import { h, toast } from "./dom.js";
import { resolveParams, evaluate } from "../core/expr.js";
import { planeFrame, planeFromFace, v3 } from "../core/geom.js";
import { resolveDatums, refResolver, MODES_OF, DEFAULT_MODE, isPlaneSnap, isAxisSnap, isPointSnap, isCurveSnap, polylineParam } from "../core/datums.js";
import { inferDatum, circleFrom3, datumRefsOf, tangentSide, PICK_HINT } from "../core/datumpick.js";

const NAMES = { arbeitsebene: "Arbeitsebene", arbeitsachse: "Arbeitsachse", arbeitspunkt: "Arbeitspunkt" };
const KIND_OF_TYPE = { arbeitsebene: "plane", arbeitsachse: "axis", arbeitspunkt: "point" };
const ORIGIN = {
  XY: { kind: "plane", label: "XY-Ebene", color: 0x2457b8 }, XZ: { kind: "plane", label: "XZ-Ebene", color: 0x2e9d4a }, YZ: { kind: "plane", label: "YZ-Ebene", color: 0xd23b2a },
  X: { kind: "axis", label: "X-Achse", color: 0xd23b2a }, Y: { kind: "axis", label: "Y-Achse", color: 0x2e9d4a }, Z: { kind: "axis", label: "Z-Achse", color: 0x2457b8 },
  O: { kind: "point", label: "Ursprung", color: 0x555555 },
};
const r6 = (v) => v.map((c) => (Math.abs(c) < 1e-12 ? 0 : Math.round(c * 1e6) / 1e6));
const evOf = (part) => { const scope = resolveParams(part?.params || []).values; return (x) => evaluate(x, scope); };

/** Ist ein Auswahlmodus für Arbeitselemente aktiv? */
export const datumPicking = (app) => app.pick?.kind === "datumCreate" || app.pick?.kind === "datumRef";

// ---------- Anzeige ----------

/** Größe für Ebenen und Achsen aus dem Modell */
function displaySize(app) {
  const bb = app.viewer.contentBox();
  return bb.isEmpty() ? 120 : Math.max(60, bb.getSize(new (bb.min.constructor)()).length() * 0.5);
}

/** Geometrie eines Bezugs für die Anzeige → Liste für viewer.showDatums */
function refDisplay(R, item, size, extra = {}) {
  try {
    if (item.kind === "plane") return [{ kind: "plane", frame: R.plane(item.ref), size: size * 0.9, ...extra }];
    if (item.kind === "axis" || item.kind === "cyl") { const a = R.axis(item.kind === "cyl" ? { p: item.ref.p, d: item.ref.d } : item.ref); return [{ kind: "axis", p: a.p, d: a.d, size: size * 1.1, ...extra }]; }
    if (item.kind === "point") return [{ kind: "point", p: R.point(item.ref), size, ...extra }];
    if (item.kind === "curve" && isCurveSnap(item.ref)) return [{ kind: "curve", pts: item.ref.pts, size, ...extra }];
  } catch { /* Bezug fehlt: nichts zeigen */ }
  return [];
}

/**
 * Alles, was im 3D-Fenster an Arbeitselementen zu sehen ist: sichtbare Elemente, beim gewählten Element seine Bezüge (blau)
 * und den Griff, beim Erzeugen die Ursprungselemente zum Anklicken, die gewählten Bezüge und die Vorschau (grün).
 */
export function datumDisplay(app, part) {
  if (!part || part.kind !== "part") return [];
  const ev = evOf(part);
  const { map } = resolveDatums(part.features, ev);
  const size = displaySize(app);
  const selId = app.sel?.type === "feature" ? app.sel.id : null;
  const hover = app._datumHover || null;
  const picking = datumPicking(app);
  const allHidden = !!part.hideDatums && !picking;
  const out = [];
  for (const f of part.features) {
    const g = map.get(f.id);
    if (!g) continue;
    const active = f.id === selId;
    if ((f.hidden || allHidden) && !active && !picking) continue;
    out.push({ id: f.id, name: f.name, size, active, hover: hover === "datum:" + f.id, ...g });
  }
  const paths = (app.results.get(part.id)?.paths3d || []).filter((p) => part.features.some((f) => f.id === p.id && !f.hidden)).map((p) => ({ id: p.id, kind: "path", pts: p.pts, size, active: p.id === selId }));
  out.push(...paths);
  const R = refResolver(map, ev);
  // Gewähltes Arbeitselement: Bezüge blau, Griff zum Ziehen
  const sel = selId && part.features.find((f) => f.id === selId && KIND_OF_TYPE[f.type]);
  if (sel && !picking) {
    for (const item of datumRefsOf(sel)) out.push(...refDisplay(R, item, size, { role: "ref", key: null }));
    const hd = handleOf(part, sel, map, ev);
    if (hd) out.push({ kind: "handle", p: hd.p, d: hd.d, size, key: "handle:" + sel.id, hover: hover === "handle:" + sel.id });
  }
  if (picking) {
    // Ursprungselemente zum Anklicken
    for (const [k, o] of Object.entries(ORIGIN)) {
      if (o.kind === "plane") out.push({ kind: "plane", frame: planeFrame({ ref: k }, 0), size: size * 0.7, key: k, color: hover === k ? 0xef7d1a : o.color });
      else if (o.kind === "axis") out.push({ kind: "axis", p: [0, 0, 0], d: { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[k], size: size * 0.8, key: k, color: hover === k ? 0xef7d1a : o.color });
      else out.push({ kind: "point", p: [0, 0, 0], size, key: k, color: hover === k ? 0xef7d1a : o.color });
    }
    const p = app.pick;
    if (p.kind === "datumCreate") {
      for (const item of p.refs) out.push(...refDisplay(R, item, size, { role: "ref", key: null }));
      const cand = candidateOf(app, part);
      if (cand) {
        const res = resolveDatums([...part.features, { ...cand, id: "__vorschau" }], ev);
        const g = res.map.get("__vorschau");
        if (g) out.push({ ...g, size, role: "preview", key: null });
      }
    }
  }
  return out;
}

/** Griff eines Arbeitselements: nur bei Ebenen mit einfachem Zahlen-Abstand → { p, d, key } */
function handleOf(part, f, map, ev) {
  if (f.type !== "arbeitsebene" || !["versatz", "flaeche"].includes(f.mode || "versatz")) return null;
  const g = map.get(f.id);
  if (!g) return null;
  const d = f.flip ? v3.mul(g.frame.normal, -1) : g.frame.normal;
  return { p: g.frame.origin, d, key: "distance" };
}

// ---------- Anklicken ----------

/** Angeklickte Stelle → gewählter Bezug { kind, ref, at?, label, pts? } oder null */
export function classifyPick(app, e) {
  const part = app.activeDoc();
  const v = app.viewer;
  const dh = v.pickDatum(e.clientX, e.clientY);
  const fromKey = (key) => {
    if (!key) return null;
    if (ORIGIN[key]) return { kind: ORIGIN[key].kind, ref: key, label: ORIGIN[key].label };
    if (key.startsWith("datum:")) {
      const f = part?.features.find((x) => x.id === key.slice(6));
      if (!f || !KIND_OF_TYPE[f.type]) return null;
      return { kind: KIND_OF_TYPE[f.type], ref: f.id, label: f.name };
    }
    return null;
  };
  if (dh && !dh.handle && (dh.kind === "point" || dh.kind === "axis")) { const r = fromKey(dh.key); if (r) return r; }
  const hit = v.pick(e.clientX, e.clientY, { edges: true, faces: true, vertices: true });
  if (hit?.kind === "vertex") return { kind: "point", ref: { p: r6(hit.point) }, label: "Ecke" };
  if (hit?.kind === "edge") {
    const pts = v.edgeWorldPoints(hit);
    if (pts?.length >= 2) {
      const t = hit.info?.type;
      if (t === "LINE") { const a = r6(pts[0]), b = r6(pts.at(-1)); return { kind: "axis", ref: { p: a, d: r6(v3.norm(v3.sub(b, a))), a, b }, label: "Kante", pts: [a, b] }; }
      if (t === "CIRCLE" && pts.length >= 4) {
        const c = circleFrom3(pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)]);
        if (c) return { kind: "axis", ref: { p: r6(c.p), d: r6(c.d), r: Math.round(c.r * 1e6) / 1e6, circle: true }, label: "Kreiskante", pts: pts.map(r6) };
      }
      const q = v.rayClosest ? v.rayClosest(e.clientX, e.clientY, pts) : pts[0];
      return { kind: "curve", ref: { pts: pts.map(r6) }, at: q, label: "Kante", pts: pts.map(r6) };
    }
  }
  if (hit?.kind === "face") {
    const info = v.faceWorldInfo(hit);
    if (info.type === "PLANE" && info.normal) {
      const o = r6(info.point || hit.point), n = r6(v3.norm(info.normal));
      return { kind: "plane", ref: { o, n, x: r6(planeFromFace(o, n).xDir) }, label: "Fläche" };
    }
    if (info.type === "CYLINDER" && info.axisD) return { kind: "cyl", ref: { p: r6(info.axisP), d: r6(v3.norm(info.axisD)), r: Math.round(info.radius * 1e6) / 1e6 }, at: hit.point, label: "Zylinder" };
  }
  if (dh && !dh.handle) return fromKey(dh.key);
  return null;
}

/** Bezug für ein bestimmtes Feld umwandeln (z. B. Kreiskante als Punkt = Mitte) → Wert für f[key] oder null */
function refForField(item, want) {
  if (!item) return null;
  if (want === item.kind && want !== "cyl" && want !== "curve") {
    if (want === "axis" && typeof item.ref === "object") return { p: item.ref.p, d: item.ref.d };
    return item.ref;
  }
  if (want === "axis" && item.kind === "cyl") return { p: item.ref.p, d: item.ref.d };
  if (want === "point" && item.kind === "axis" && typeof item.ref === "object") {
    if (item.ref.circle) return { p: item.ref.p };
    if (item.ref.a && item.ref.b) return { p: r6(v3.mul(v3.add(item.ref.a, item.ref.b), 0.5)) };
  }
  if (want === "point" && item.kind === "cyl") return { p: item.ref.p };
  if (want === "cyl" && item.kind === "cyl") return item.ref;
  if (want === "cyl" && item.kind === "axis" && item.ref?.circle) return { p: item.ref.p, d: item.ref.d, r: item.ref.r };
  if (want === "curve" && item.pts) return { pts: item.pts };
  return null;
}

/** Kandidat (Feature-Daten) aus der aktuellen Auswahl beim Erzeugen */
function candidateOf(app, part) {
  const p = app.pick;
  if (p?.kind !== "datumCreate") return null;
  const r = inferDatum(p.type, p.refs);
  if (!r.feature) return null;
  const f = r.feature;
  // Tangentiale Ebene parallel zu einer Ebene: Seite beim angeklickten Punkt
  if (f.mode === "tangential" && f.base) {
    try {
      const R = refResolver(resolveDatums(part.features, evOf(part)).map, evOf(part));
      f.side = tangentSide(f.cyl, R.plane(f.base).normal, p.refs.find((x) => x.kind === "cyl")?.at);
    } catch { /* Ebene fehlt */ }
  }
  return f;
}

/** Erzeugen durch Anklicken beginnen (Knopf im Menüband) */
export function startDatumPick(app, type) {
  const part = app.activeDoc();
  if (!part || part.kind !== "part" || app.linkedReadOnly?.(part)) return;
  if (app.pick) app.cancelPick();
  app.sel = null;
  app.pick = { kind: "datumCreate", type, refs: [] };
  app.setHint(PICK_HINT[type] + " – Eingabe übernimmt, Esc bricht ab");
  app.showSketches3D();
  app.tree?.render();
  app.props.render();
}

/** Bezug für ein Feld eines bestehenden Arbeitselements im 3D-Fenster wählen */
export function startRefPick(app, f, key, want) {
  app.pick = { kind: "datumRef", fid: f.id, key, want };
  const what = { plane: "Ebene oder ebene Fläche", axis: "Achse, gerade Kante, Kreiskante oder Zylinder", point: "Punkt, Ecke, Kreis- oder Kantenmitte", cyl: "Zylinderfläche oder Kreiskante", curve: "Kante" }[want];
  app.setHint(what + " anklicken – Esc bricht ab");
  app.showSketches3D();
  app.props.render();
}

/** Klick im 3D-Fenster während eines Auswahlmodus → true, wenn behandelt */
export function datumPickClick(app, e) {
  const p = app.pick;
  if (!datumPicking(app)) return false;
  const part = app.activeDoc();
  const item = classifyPick(app, e);
  if (!item) { toast("Hier ist nichts zum Wählen"); return true; }
  if (p.kind === "datumRef") {
    const f = part.features.find((x) => x.id === p.fid);
    if (!f) { app.cancelPick(); return true; }
    if (typeof item.ref === "string" && item.ref !== "O" && !ORIGIN[item.ref]) {
      const i = part.features.findIndex((x) => x.id === item.ref), self = part.features.findIndex((x) => x.id === f.id);
      if (i < 0 || i >= self) { toast("Nur Arbeitselemente, die im Baum davor stehen"); return true; }
    }
    const val = refForField(item, p.want);
    if (val == null) { toast("Das passt hier nicht"); return true; }
    app.pick = null;
    app.edit("Bezug wählen", () => {
      f[p.key] = val;
      if (p.key === "cyl" && item.at && !f.base) { const k = v3.norm(val.d), w = v3.sub(item.at, val.p); f.start = r6(v3.norm(v3.sub(w, v3.mul(k, v3.dot(w, k))))); }
      if (p.key === "curve" && item.at) f.pos = String(Math.round(polylineParam(val.pts, item.at) * 1000) / 10);
    });
    app.setHint("");
    return true;
  }
  p.refs.push(item);
  const r = inferDatum(p.type, p.refs);
  if (!r.feature && /geht nicht/.test(r.need)) { p.refs.pop(); toast(`${item.label} passt nicht zur bisherigen Auswahl`); return true; }
  if (r.feature && r.complete) return finishDatumPick(app), true;
  app.setHint(r.feature ? `${r.label} – ${r.need}` : r.need);
  app.showSketches3D();
  app.props.render();
  return true;
}

/** Erzeugen abschließen: Feature mit der erkannten Art anlegen */
export function finishDatumPick(app) {
  const part = app.activeDoc();
  if (app.pick?.kind !== "datumCreate") return;
  const cand = candidateOf(app, part);
  if (!cand) { toast(inferDatum(app.pick.type, app.pick.refs).need); return; }
  // Vorher prüfen, ob die Lage sich rechnen lässt (z. B. windschiefe Kanten)
  const res = resolveDatums([...part.features, { ...cand, id: "__probe" }], evOf(part));
  if (res.errors.__probe) { toast(res.errors.__probe, { kind: "err" }); return; }
  app.pick = null;
  app.viewer.clearPlanes();
  app.setHint("");
  app.addFeature(cand);
}

/** Hover im Auswahlmodus und über Arbeitselementen: Hervorhebung → true, wenn behandelt */
export function datumHover(app, e) {
  if (app.mode !== "part") return false;
  const dh = app.viewer.pickDatum(e.clientX, e.clientY);
  const key = dh?.key || null;
  if (key !== (app._datumHover || null)) { app._datumHover = key; app.viewer.showDatums(datumDisplay(app, app.activeDoc())); }
  if (!datumPicking(app)) return !!dh?.handle;
  const hit = app.viewer.pick(e.clientX, e.clientY, { edges: true, faces: true, vertices: true });
  if (hit && !(dh && (dh.kind === "point" || dh.kind === "axis"))) app.viewer.highlight([hit]);
  else app.viewer.clearHover();
  return true;
}

/** Klick ohne Auswahlmodus: Arbeitselement im 3D-Fenster anklicken wählt es (Ebenen nur, wenn kein Körper getroffen wird) */
export function datumSelectClick(app, e) {
  if (app.mode !== "part" || app.pick) return false;
  const dh = app.viewer.pickDatum(e.clientX, e.clientY);
  if (!dh?.key?.startsWith("datum:")) return false;
  if (dh.kind === "plane" && app.viewer.pick(e.clientX, e.clientY, { edges: true, faces: true })) return false;
  app.selectFeature(dh.key.slice(6));
  app.tree?.render();
  app.props.render();
  return true;
}

/**
 * Griff ziehen (pointerdown im 3D-Fenster): Abstand der Ebene längs ihrer Normalen. Während des Ziehens wird nur die Anzeige
 * aktualisiert; beim Loslassen ein Rückgängig-Schritt. → true, wenn ein Griff getroffen wurde.
 */
export function datumHandleDown(app, e) {
  if (app.mode !== "part" || app.pick || e.button !== 0) return false;
  const dh = app.viewer.pickDatum(e.clientX, e.clientY);
  if (!dh?.handle) return false;
  const part = app.activeDoc(), f = part.features.find((x) => x.id === dh.key.slice(7));
  if (!f) return false;
  const ev = evOf(part);
  const hd = handleOf(part, f, resolveDatums(part.features, ev).map, ev);
  if (!hd) return false;
  const old = f.distance ?? "0";
  if (!/^\s*-?\d+([.,]\d+)?\s*$/.test(String(old))) { toast("Der Abstand ist ein Ausdruck – im Eigenschaftenfeld ändern"); return true; }
  const v0 = Number(String(old).replace(",", "."));
  const t0 = app.viewer.rayLineParam(e.clientX, e.clientY, hd.p, hd.d);
  if (t0 == null) return true;
  e.preventDefault();
  e.stopImmediatePropagation();
  const cv = app.viewer.renderer.domElement;
  app.viewer.controls.enabled = false;
  cv.setPointerCapture?.(e.pointerId);
  let val = v0;
  const move = (m) => {
    const t = app.viewer.rayLineParam(m.clientX, m.clientY, hd.p, hd.d);
    if (t == null) return;
    const step = m.shiftKey ? 0.1 : 1;
    val = Math.round((v0 + t - t0) / step) * step;
    f.distance = String(Math.round(val * 1000) / 1000);
    app.setHint(`Abstand ${String(f.distance).replace(".", ",")} mm – Umschalt: 0,1-mm-Schritte`);
    app.viewer.showDatums(datumDisplay(app, part));
  };
  const up = () => {
    cv.removeEventListener("pointermove", move, true);
    cv.removeEventListener("pointerup", up, true);
    app.viewer.controls.enabled = true;
    const next = f.distance;
    f.distance = old;
    app.setHint("");
    if (next !== old) app.edit("Abstand ziehen", () => { f.distance = next; });
    else app.showSketches3D();
  };
  cv.addEventListener("pointermove", move, true);
  cv.addEventListener("pointerup", up, true);
  return true;
}

/** Alle Arbeitselemente des Bauteils ein- oder ausblenden (Inventor »Objektsichtbarkeit«) */
export function toggleAllDatums(app, part = app.activeDoc()) {
  if (!part || part.kind !== "part") return;
  app.edit(part.hideDatums ? "Arbeitselemente einblenden" : "Arbeitselemente ausblenden", () => { part.hideDatums = !part.hideDatums || undefined; });
}

// ---------- Eigenschaften ----------

/** Text für einen gewählten Schnappschuss-Bezug */
function snapLabel(v) {
  if (isPlaneSnap(v)) return "Modellfläche (gewählt)";
  if (isAxisSnap(v)) return v.r ? "Zylinder/Kreis (gewählt)" : "Modellkante (gewählt)";
  if (isPointSnap(v)) return "Modellpunkt (gewählt)";
  if (isCurveSnap(v)) return "Modellkante (gewählt)";
  return null;
}

/**
 * Eigenschaften von Arbeitsebene, -achse, -punkt: Art, Bezüge (Liste oder im 3D-Fenster wählen), Werte, Umkehren, Sichtbarkeit.
 * props: Eigenschaften-Feld, E(label, key, opts): Ausdrucksfeld.
 */
export function datumPropsPanel(props, part, f, E) {
  const app = props.app;
  const before = (type) => props.datumsBefore(part, f, type);
  const modes = MODES_OF[f.type];
  const mode = f.mode || DEFAULT_MODE[f.type];
  const def = modes.find((m) => m.value === mode);
  const visibleModes = modes.filter((m) => !m.legacy || m.value === mode);
  const body = [props.select("Art", visibleModes.map((m) => [m.value, m.label]), mode, (v) => props.set(f, (x) => { x.mode = v; }, "Art"))];
  const picking = (key) => app.pick?.kind === "datumRef" && app.pick.fid === f.id && app.pick.key === key;
  const pickBtn = (key, want) => h("button", { class: "btn" + (picking(key) ? " primary" : ""), title: "Im 3D-Fenster wählen", onclick: () => (picking(key) ? app.cancelPick() : startRefPick(app, f, key, want)) }, picking(key) ? "Abbrechen" : "Wählen");
  const LABEL = { base: "Bezugsebene", plane: "Ebene", plane1: "Ebene 1", plane2: "Ebene 2", plane3: "Ebene 3", axis: f.mode === "winkel" ? "Drehachse" : "Achse", axis2: "Achse 2", dir: "Richtung wie", point: f.type === "arbeitspunkt" && mode === "versatz" ? "Ausgangspunkt" : "Durch Punkt", p1: "Punkt 1", p2: "Punkt 2", p3: "Punkt 3", ref: { zylinder: "Zylinder", kreis: "Kreiskante", kante: "Kante" }[mode] || "Bezug", cyl: "Zylinder", curve: "Kante oder Pfad" };
  const refRow = (key, want) => {
    const v = f[key], label = LABEL[key] || key;
    const opts = [];
    if (want === "plane") opts.push(["XY", "XY-Ebene"], ["XZ", "XZ-Ebene"], ["YZ", "YZ-Ebene"], ...before("arbeitsebene").map((g) => [g.id, g.name]));
    if (want === "axis") { if (mode === "winkel" && key === "axis") opts.push(["u", "x-Richtung der Ebene"], ["v", "y-Richtung der Ebene"]); opts.push(["X", "X-Achse"], ["Y", "Y-Achse"], ["Z", "Z-Achse"], ...before("arbeitsachse").map((g) => [g.id, g.name])); }
    if (want === "point") opts.push(["O", "Ursprung"], ...before("arbeitspunkt").map((g) => [g.id, g.name]), ["frei", "Koordinaten"]);
    const snap = snapLabel(v);
    if (snap) opts.unshift(["__snap", snap]);
    if (!opts.length) opts.push(["", v ? snap || "gewählt" : "– noch nicht gewählt –"]);
    const freePt = want === "point" && v && typeof v === "object" && !isPointSnap(v);
    const cur = snap ? "__snap" : freePt ? "frei" : (v ?? (want === "plane" ? "XY" : want === "axis" ? (mode === "winkel" ? "u" : "Z") : want === "point" ? "O" : ""));
    const sel = props.select(label, opts, cur, (m) => { if (m === "__snap" || m === "") return; props.set(f, (x) => { x[key] = m === "frei" ? { x: "0", y: "0", z: "0" } : m; }, label); });
    const row = h("div", { class: "datum-ref" }, sel, pickBtn(key, want));
    const free = freePt ? props.vec3(label + " XYZ", [v.x ?? "0", v.y ?? "0", v.z ?? "0"], (a) => props.set(f, (x) => { x[key] = { x: a[0], y: a[1], z: a[2] }; }, label)) : null;
    return [row, free];
  };
  for (const spec of def?.refs || []) { const [key, want] = spec.split(":"); body.push(...refRow(key, want)); }
  // Werte je Art
  if (f.type === "arbeitsebene") {
    if (mode === "versatz" || mode === "flaeche") body.push(E("Abstand", "distance"));
    if (mode === "winkel") body.push(E("Winkel", "angle", { unit: "°" }));
    if (mode === "kurve") body.push(E("Stelle (0 = Anfang, 100 = Ende)", "pos", { unit: "%", allowNeg: false }));
    if (mode === "tangential") {
      const baseName = typeof f.base === "string" ? (part.features.find((g) => g.id === f.base)?.name || f.base + "-Ebene") : "Modellfläche (gewählt)";
      if (f.base) body.push(h("div", { class: "datum-ref" }, props.select("Parallel zu", [["", "– ohne (Winkel um die Achse) –"], ["__cur", baseName]], "__cur", (v) => { if (!v) props.set(f, (x) => { delete x.base; delete x.side; }, "Parallel zu"); }), pickBtn("base", "plane")),
        props.seg("Seite", [["+", "Vorne"], ["-", "Hinten"]], f.side || "+", (v) => props.set(f, "side", v, "Seite")));
      else body.push(E("Winkel um die Achse", "angle", { unit: "°" }), h("div", { class: "datum-ref" }, h("span", { class: "hint" }, "Oder parallel zu einer Ebene:"), pickBtn("base", "plane")));
    }
    if (mode === "flaeche") {
      const pk = app.pick?.kind === "datumFace" && app.pick.feature === f.id;
      body.push(h("div", { class: "btn-row" }, h("button", { class: "btn" + (pk ? " primary" : ""), onclick: () => { if (pk) app.cancelPick(); else { app.pick = { kind: "datumFace", feature: f.id }; app.setHint("Ebene Fläche anklicken – Esc bricht ab"); props.render(); } } }, pk ? "Auswahl beenden" : "Fläche wählen")));
    }
    body.push(props.check("Umkehren (Normale zur Gegenseite)", !!f.flip, (v) => props.set(f, "flip", v || undefined, "Umkehren")));
  } else if (f.type === "arbeitspunkt") {
    if (mode === "koordinaten") body.push(props.vec3("Koordinaten", [f.x ?? "0", f.y ?? "0", f.z ?? "0"], (a) => props.set(f, (x) => { x.x = a[0]; x.y = a[1]; x.z = a[2]; }, "Koordinaten")));
    if (mode === "versatz") body.push(props.vec3("Versatz ΔX ΔY ΔZ", [f.dx ?? "0", f.dy ?? "0", f.dz ?? "0"], (a) => props.set(f, (x) => { x.dx = a[0]; x.dy = a[1]; x.dz = a[2]; }, "Versatz")));
  }
  if (def?.refs?.some((s) => /:(cyl|curve)$/.test(s) || s.startsWith("ref:")) || Object.values(f).some((x) => snapLabel(x)))
    body.push(h("p", { class: "hint" }, "Gewählte Modellgeometrie wird als Lage gespeichert. Ändert sich das Modell, Bezug neu wählen."));
  body.push(props.check("Im 3D-Fenster zeigen", !f.hidden, (v) => props.set(f, "hidden", !v || undefined, "Sichtbarkeit")));
  const out = [props.section(NAMES[f.type], ...body)];
  const btns = [];
  if (f.type === "arbeitsebene") btns.push(h("button", { class: "btn", onclick: () => app.createSketch({ ref: "datum", id: f.id }) }, "Skizze auf dieser Ebene"));
  btns.push(h("button", { class: "btn", onclick: () => toggleAllDatums(app, part) }, part.hideDatums ? "Alle Arbeitselemente zeigen" : "Alle Arbeitselemente ausblenden"));
  out.push(h("div", { class: "btn-row" }, ...btns));
  return out;
}

/** Eigenschaften-Feld beim Erzeugen durch Anklicken */
export function datumCreatePanel(props) {
  const app = props.app, p = app.pick, part = app.activeDoc();
  const r = inferDatum(p.type, p.refs);
  const list = p.refs.length
    ? h("ol", { class: "datum-picks" }, ...p.refs.map((it, i) => h("li", {}, it.label || it.kind, " ", h("button", { class: "btn small", title: "Entfernen", onclick: () => { p.refs.splice(i, 1); app.showSketches3D(); props.render(); } }, "×"))))
    : h("p", { class: "hint" }, PICK_HINT[p.type] + ". Die Art ergibt sich aus der Auswahl, wie in Inventor.");
  const own = (mode) => {
    const f = { type: p.type, mode };
    if (p.type === "arbeitsebene" && mode === "versatz") Object.assign(f, { base: "XY", distance: "50" });
    if (p.type === "arbeitsachse" && mode === "parallel") Object.assign(f, { dir: "Z", point: { x: "0", y: "0", z: "0" } });
    app.cancelPick();
    app.addFeature(f);
  };
  return [props.section(NAMES[p.type] + " erstellen",
    h("dl", { class: "kv" }, h("dt", {}, "Erkannt"), h("dd", {}, r.feature ? r.label : "–")),
    list,
    r.need ? h("p", { class: "hint" }, r.need) : null,
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary", disabled: r.feature ? undefined : true, onclick: () => finishDatumPick(app) }, "OK"),
      p.refs.length ? h("button", { class: "btn", onclick: () => { p.refs = []; app.setHint(PICK_HINT[p.type]); app.showSketches3D(); props.render(); } }, "Neu wählen") : null,
      h("button", { class: "btn", onclick: () => app.cancelPick() }, "Abbrechen")),
    props.select("Oder Art selbst wählen", [["", "–"], ...MODES_OF[p.type].filter((m) => !m.legacy).map((m) => [m.value, m.label])], "", (m) => m && own(m)),
    part?.hideDatums ? h("p", { class: "hint" }, "Arbeitselemente sind ausgeblendet; beim Wählen werden sie gezeigt.") : null)];
}
