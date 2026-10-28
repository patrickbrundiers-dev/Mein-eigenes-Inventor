// 2D-Skizzierer über der 3D-Ansicht (SVG-Overlay, eigene Trefferprüfung im Bildschirmraum)
import { svgEl, h, toast, fmtNum, choiceDialog, modal } from "./dom.js";
import { solveSketch, checkNewConstraint, measureConstraint, explainDependency, DIMENSION_TYPES, entityFree } from "../core/solver.js";
import { arcGeometry, circleFrom3, deleteEntities, extractProfiles } from "../core/sketch.js";
import { evaluate, resolveParams } from "../core/expr.js";
import { planeFrame, toLocal, toWorld, v3 } from "../core/geom.js";
import { resolvePlane } from "../core/datums.js";
import { parseDxf, dxfToSketch, primsBounds } from "../core/dxfread.js";
import { uid } from "../core/examples.js";
import { trimEntity, filletCorner, chamferCorner, cornerAt, extendEntity, splitEntity } from "../core/sketchedit.js";
import { inferLine, inferCircle } from "../core/autoconstraints.js";
import { buildSlot, buildPolygon, buildTangentArc, tangentArcCenter, constraintLabel, mirrorEntities, offsetEntities, entitiesInBox, patternEntities, transformEntities } from "../core/sketchshapes.js";
import { splineSamples, splineNearest } from "../core/spline.js";
import { specialSnap, alignSnap } from "../core/sketchsnap.js";
import { autoDimension } from "../core/autodim.js";
import { cleanSketch, cleanReportText, CLEAN_KINDS, CLEAN_DEFAULTS } from "../core/sketchclean.js";
import { splineCtrl } from "../core/sketch.js";
import { defaultText, textBox, textPolylines, partTextVars, TEXT_STYLES } from "../core/schrift.js";
import { imageCorners, newImageEntity, rescaleImage } from "../core/skizzenbild.js";
import { ellipseGeom, ellipseNearest, ellipseLocal, ellipsePoint, ellipseSamples } from "../core/ellipse.js";
import { createDynInput, dynKey, dynTyped, dynValues, rectLive, rectCorner, buildRect, lineLive, lineEnd, axisAngle } from "../core/dyninput.js";

const PT_R = 7, CURVE_R = 6;

export const SKETCH_TOOLS = {
  select: "Auswählen und ziehen; im Leeren ziehen = Fenster (nach rechts: ganz innen, nach links: berührend), Strg+A wählt alles",
  line: "Linie: Startpunkt klicken, weitere Punkte klicken – oder Länge tippen, Tab, Winkel, Enter – Esc beendet",
  rect: "Rechteck: erste Ecke, dann gegenüberliegende Ecke klicken – oder Breite tippen, Tab, Höhe tippen, Enter",
  rectc: "Rechteck aus Mitte: Mittelpunkt, dann Ecke klicken – oder Breite tippen, Tab, Höhe tippen, Enter",
  circle: "Kreis: Mittelpunkt, dann Radius klicken – oder Durchmesser tippen, Enter",
  arc3: "Bogen: Anfang, Ende, dann Punkt auf dem Bogen klicken",
  spline: "Spline: Kontrollpunkte nacheinander klicken – Enter, Doppelklick oder Esc beendet, Klick auf den ersten Punkt schließt",
  ellipse: "Ellipse: Mittelpunkt, Ende der Hauptachse (Halbachse Tab Winkel tippbar), dann Nebenhalbachse klicken oder tippen, Enter",
  arcc: "Bogen um Mittelpunkt: Mitte, Anfang (Radius Tab Winkel tippbar), Ende gegen Uhrzeigersinn (Öffnungswinkel tippbar), Enter",
  point: "Punkt / Bohrungsmitte setzen",
  slot: "Langloch: erster Mittelpunkt, zweiter Mittelpunkt (Abstand Tab Winkel tippbar), dann Breite klicken oder tippen, Enter",
  text: "Text: Anfangspunkt auf der Grundlinie klicken, dann Text und Schrifthöhe eingeben. Platzhalter: {teilenummer}, {name}, {werkstoff}, {datum}",
  image: "Bild: linke untere Ecke klicken, dann Bild (PNG/JPG) wählen und Breite in mm eingeben. Das Bild ist nur Vorlage zum Nachzeichnen",
  polygon: "Polygon: Mittelpunkt klicken, Eckenzahl tippen, Tab, Umkreisradius tippen, Enter – oder eine Ecke klicken",
  offset: "Versatz: Kontur anklicken (oder vorher Elemente wählen), dann die Seite klicken und den Abstand eingeben",
  pattern: "Rechteckmuster: vorher Elemente wählen, dann ins Bild klicken und Anzahl/Abstände in X und Y eingeben",
  cpattern: "Kreismuster: vorher Elemente wählen, dann den Mittelpunkt klicken und Anzahl/Winkel eingeben",
  smove: "Verschieben: vorher Elemente wählen, dann den Basispunkt klicken und die Verschiebung eingeben",
  scopy: "Kopieren: vorher Elemente wählen, dann den Basispunkt klicken und den Versatz der Kopie eingeben",
  srotate: "Drehen: vorher Elemente wählen, dann den Drehpunkt klicken und den Winkel eingeben",
  sscale: "Skalieren: vorher Elemente wählen, dann den Bezugspunkt klicken und den Faktor eingeben",
  mirror: "Spiegeln: vorher Elemente wählen (Auswählen, Umschalt für mehrere), dann die Spiegellinie anklicken",
  dimension: "Bemaßung: Linie, Kreis, zwei Punkte oder zwei Linien wählen, dann Lage klicken",
  project: "Kante des 3D-Modells anklicken, um sie in die Skizze zu übernehmen",
  trim: "Stutzen: Teil einer Linie, eines Kreises oder Bogens anklicken – wird bis zu den nächsten Schnittpunkten entfernt",
  extend: "Verlängern: Linie oder Bogen nahe dem Ende anklicken, das bis zum nächsten Element verlängert wird",
  split: "Teilen: Linie oder Bogen an der Stelle anklicken, an der geteilt wird (nahe einem Schnittpunkt wird dort geteilt)",
  sfillet: "Rundung: Ecke anklicken, an der zwei Linien enden, dann Radius eingeben",
  schamfer: "Fase: Ecke anklicken, an der zwei Linien enden, dann Abstand eingeben (zwei Abstände mit Semikolon, z. B. 5;10)",
  circle3: "Kreis durch 3 Punkte: drei Punkte auf dem Umfang klicken – getroffene Punkte werden an den Kreis gebunden",
  arct: "Tangentialer Bogen: Ende einer Linie klicken, dann den Endpunkt des Bogens – der Bogen schließt tangential an",
  horizontal: "Horizontal: Linie oder zwei Punkte wählen",
  vertical: "Vertikal: Linie oder zwei Punkte wählen",
  coincident: "Koinzident: Punkt und Punkt/Linie/Kreis wählen",
  parallel: "Parallel: zwei Linien wählen",
  perpendicular: "Senkrecht: zwei Linien wählen",
  equal: "Gleich: zwei Linien oder zwei Kreise wählen",
  tangent: "Tangential: Linie/Bogen und Kreis/Bogen wählen",
  fix: "Fixieren: Punkt wählen",
  midpoint: "Mittelpunkt: Punkt, dann Linie wählen",
  concentric: "Konzentrisch: zwei Kreise/Bögen wählen",
  collinear: "Kollinear: zwei Linien wählen",
  symmetric: "Symmetrisch: zwei Punkte, dann Symmetrielinie wählen",
};

const GLYPH = { horizontal: "H", vertical: "V", parallel: "∥", perpendicular: "⊥", equal: "=", tangent: "T", tangentAt: "T", fix: "Fix", coincident: "•", pointOnLine: "∈", pointOnCircle: "∈", midpoint: "M", concentric: "◎", collinear: "K", symmetric: "S" };

export class Sketcher {
  constructor(app) {
    this.app = app;
    this.viewer = app.viewer;
    this.svg = document.getElementById("overlay");
    this.stage = document.getElementById("stage");
    this.canvas = this.viewer.renderer.domElement;
    this.active = false;
    this.tool = "select";
    this.sel = new Set(); // "e:<id>" | "p:<id>" | "c:<id>"
    this.hover = null;
    this.state = null;
    this.showGlyphs = true;
    this.gridSnap = false;
    this.snapR = PT_R;
    this.gridFixed = 0;
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    this.onDbl = (e) => this.dblClick(e);
    this.viewer.onCamera(() => { if (this.active) this.render(); });
  }

  /** Benutzereinstellungen; Rasterfang/Symbole gelten ab dem nächsten Öffnen einer Skizze */
  applyPrefs(v) {
    this.prefs = v;
    this.snapR = v["skizze.fangradius"];
    this.gridFixed = v["skizze.rasterweite"] || 0;
    if (this.active) this.render();
  }

  /** Zuletzt eingegebener Wert eines Werkzeugs (werkzeuge.letzte), sonst undefined */
  lastValue(tool) { return this.prefs?.["werkzeuge.merken"] === false ? undefined : this.prefs?.["werkzeuge.letzte"]?.[tool]; }
  rememberValue(tool, v) {
    if (this.prefs?.["werkzeuge.merken"] === false || !this.app.prefs) return;
    const cur = this.app.prefs.get("werkzeuge.letzte") || {};
    if (JSON.stringify(cur[tool]) !== JSON.stringify(v)) this.app.prefs.set("werkzeuge.letzte", { ...cur, [tool]: v });
  }

  // ---------- Lebenszyklus ----------
  get part() { return this.app.activeDoc(); }
  get sk() { return this.part?.features.find((f) => f.id === this.sketchId); }
  scope() { return resolveParams(this.part?.params || []).values; }

  start(sketchId) {
    this.sketchId = sketchId;
    const sk = this.sk;
    if (!sk) return;
    this.ensureOrigin(sk);
    let plane = sk.plane;
    try { plane = resolvePlane(sk.plane, this.app.datumMap(this.part)); } catch (e) { toast(e.message, { kind: "err" }); plane = { ref: "XY" }; }
    this.frame = planeFrame(plane, safeEval(sk.offset || "0", this.scope()));
    this.active = true;
    this.tool = "select";
    this.state = null;
    this.sel.clear();
    this.gridSnap = !!this.prefs?.["skizze.rasterfang"];
    this.showGlyphs = this.prefs ? !!this.prefs["skizze.symbole"] : true;
    this.canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("dblclick", this.onDbl);
    this.viewer.enterSketch(this.frame);
    this.solve();
    this.render();
  }
  stop() {
    this.cancelInput();
    this.active = false;
    this.canvas.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("dblclick", this.onDbl);
    this.svg.replaceChildren();
    this.viewer.exitSketch();
  }
  ensureOrigin(sk) {
    if (sk.points.some((p) => p.id === "O")) return;
    sk.points.unshift({ id: "O", x: 0, y: 0 });
    sk.entities.unshift({ id: "Oe", type: "point", p: "O", construction: true, origin: true });
    sk.constraints.unshift({ id: "Of", type: "fix", p: "O", x: 0, y: 0 });
  }
  setTool(t) {
    this.cancelInput();
    this.tool = t;
    this.state = null;
    if (!["select", "dimension"].includes(t)) this.pendingPick = [];
    this.pendingPick = [];
    this.app.setHint(SKETCH_TOOLS[t] || "");
    this.render();
    this.app.refreshRibbon();
  }

  // ---------- Koordinaten ----------
  mapping() {
    const o = this.viewer.worldToScreen(this.frame.origin);
    const px = this.viewer.worldToScreen(v3.add(this.frame.origin, this.frame.xDir));
    const py = this.viewer.worldToScreen(v3.add(this.frame.origin, this.frame.yDir));
    const ex = [px[0] - o[0], px[1] - o[1]], ey = [py[0] - o[0], py[1] - o[1]];
    const det = ex[0] * ey[1] - ex[1] * ey[0] || 1e-12;
    this.M = { o, ex, ey, det, scale: Math.hypot(ex[0], ex[1]) };
    return this.M;
  }
  S(x, y) { const m = this.M; return [m.o[0] + m.ex[0] * x + m.ey[0] * y, m.o[1] + m.ex[1] * x + m.ey[1] * y]; }
  L(sx, sy) {
    const m = this.M;
    const dx = sx - m.o[0], dy = sy - m.o[1];
    return [(dx * m.ey[1] - dy * m.ey[0]) / m.det, (m.ex[0] * dy - m.ex[1] * dx) / m.det];
  }
  eventPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // ---------- Lösen ----------
  solve(extra = []) {
    const sk = this.sk;
    if (!sk) return null;
    const r = solveSketch(sk, this.scope(), { extra, free: this.prefs?.["skizze.bestimmtheit"] !== false || this.showDof, directions: !!this.showDof });
    this.lastSolve = r;
    this.profiles = extractProfiles(sk, { vars: this.textVars() });
    this.app.updateSketchStatus(r, this.profiles);
    return r;
  }
  /** Wie commit, aber erst an einer Kopie prüfen: Fehler (ungültige Eingabe) erzeugen keinen Rückgängig-Schritt */
  commitShape(label, fn) {
    try { fn(JSON.parse(JSON.stringify(this.sk))); } catch (e) { toast(`${label}: ${e.message}`, { kind: "err" }); return; }
    this.commit(label, fn);
  }
  commit(label, fn) {
    this.app.checkpoint(label);
    fn(this.sk);
    const r = this.solve();
    if (r && !r.ok) toast("Skizze nicht vollständig lösbar – Bemaßung prüfen", { kind: "err" });
    this.app.changed({ rebuild: false });
    this.render();
  }

  // ---------- Trefferprüfung ----------
  ellG(e, P = this.pts()) { return ellipseGeom(P.get(e.c), P.get(e.a), e.r); }
  pts() { return new Map(this.sk.points.map((p) => [p.id, p])); }
  hitTest(sx, sy, { points = true, curves = true, dims = true, exclude = new Set() } = {}) {
    const sk = this.sk;
    const P = this.pts();
    if (dims && this.dimBoxes) {
      for (const b of this.dimBoxes) if (sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1) return { kind: "dim", id: b.id };
    }
    if (dims && this.glyphBoxes) {
      for (const b of this.glyphBoxes) if (sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1) return { kind: "con", id: b.id };
    }
    if (points) {
      let best = null, bd = this.snapR;
      for (const p of sk.points) {
        if (exclude.has(p.id)) continue;
        const [x, y] = this.S(p.x, p.y);
        const d = Math.hypot(x - sx, y - sy);
        if (d < bd) { bd = d; best = { kind: "point", id: p.id }; }
      }
      if (best) return best;
    }
    if (curves) {
      let best = null, bd = CURVE_R;
      for (const e of sk.entities) {
        let d = Infinity;
        if (e.type === "line") {
          const a = P.get(e.p1), b = P.get(e.p2);
          const A = this.S(a.x, a.y), B = this.S(b.x, b.y);
          d = segDist(sx, sy, A, B);
        } else if (e.type === "circle" || e.type === "arc") {
          const c = P.get(e.c);
          const C = this.S(c.x, c.y);
          const r = (e.type === "circle" ? e.r : Math.hypot(P.get(e.p1).x - c.x, P.get(e.p1).y - c.y)) * this.M.scale;
          d = Math.abs(Math.hypot(sx - C[0], sy - C[1]) - r);
          if (e.type === "arc") {
            const g = arcGeometry(c, P.get(e.p1), P.get(e.p2));
            const [lx, ly] = this.L(sx, sy);
            let a = Math.atan2(ly - c.y, lx - c.x);
            while (a < g.a1) a += Math.PI * 2;
            if (a - g.a1 > g.sweep) d = Infinity;
          }
        }
        else if (e.type === "spline") {
          const ctrl = splineCtrl(e, P), [lx, ly] = this.L(sx, sy);
          if (ctrl) d = splineNearest(ctrl, lx, ly).d * this.M.scale;
        } else if (e.type === "ellipse") {
          const [lx, ly] = this.L(sx, sy);
          d = ellipseNearest(this.ellG(e, P), lx, ly).d * this.M.scale;
        } else if (e.type === "text") {
          const b = textBox(e, P.get(e.p), this.textVars());
          if (b && insidePoly([sx, sy], b.map(([x, y]) => this.S(x, y)))) d = CURVE_R - 1;
        } else if (e.type === "image") {
          // Bild liegt hinten: nur wählbar, wenn nichts anderes näher ist
          const b = imageCorners(e, P.get(e.p));
          if (b && insidePoly([sx, sy], b.map(([x, y]) => this.S(x, y)))) d = CURVE_R - 0.5;
        }
        if (d < bd) { bd = d; best = { kind: "entity", id: e.id }; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Fangen beim Zeichnen: liefert {x,y, pointId?, on?: {type, e}} */
  snap(sx, sy, { exclude = new Set() } = {}) {
    const hit = this.hitTest(sx, sy, { dims: false, exclude });
    const P = this.pts();
    if (hit?.kind === "point") { const p = P.get(hit.id); return { x: p.x, y: p.y, pointId: p.id, label: "Punkt" }; }
    let [lx, ly] = this.L(sx, sy);
    const tol = this.snapR / (this.M?.scale || 1);
    // Schnittpunkt, Linienmitte, Mittelpunkt, Quadrant, Bogenmitte (sketchsnap.js)
    const sp = specialSnap(this.sk, lx, ly, tol, { exclude });
    if (sp) return sp;
    if (hit?.kind === "entity") {
      const e = this.sk.entities.find((q) => q.id === hit.id);
      if (e.type === "line") {
        const a = P.get(e.p1), b = P.get(e.p2);
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        const t = ((lx - a.x) * dx + (ly - a.y) * dy) / L2;
        return { x: a.x + t * dx, y: a.y + t * dy, on: e.id, onType: "line", label: "Auf Linie" };
      }
      if (e.type === "spline") { const q = splineNearest(splineCtrl(e, P), lx, ly); return { x: q.x, y: q.y, on: e.id, onType: "circle", label: "Auf Spline" }; }
      if (e.type === "ellipse") { const q = ellipseNearest(this.ellG(e, P), lx, ly); return { x: q.x, y: q.y, on: e.id, onType: "circle", label: "Auf Ellipse" }; }
      const c = P.get(e.c);
      const r = e.type === "circle" ? e.r : Math.hypot(P.get(e.p1).x - c.x, P.get(e.p1).y - c.y);
      const ang = Math.atan2(ly - c.y, lx - c.x);
      return { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang), on: e.id, onType: "circle", label: "Auf Kreis" };
    }
    // Ausrichtung waagrecht/senkrecht zu vorhandenen Punkten und zum Startpunkt (gestrichelte Hilfslinie)
    if (this.prefs?.["skizze.ausrichten"] !== false) {
      const st = this.state, refs = [st?.start, ...(st?.pts || [])].filter((q) => q && Number.isFinite(q.x));
      const al = alignSnap(this.sk, lx, ly, tol, { refs });
      if (al) return al;
    }
    if (this.gridSnap) {
      const step = this.gridFixed || gridStep(this.M.scale);
      lx = Math.round(lx / step) * step;
      ly = Math.round(ly / step) * step;
    }
    return { x: lx, y: ly };
  }

  // ---------- Erzeugen ----------
  /** Punkt aus Fang-Ergebnis verwenden/erzeugen; Fang-Bedingungen werden gesammelt */
  usePoint(sk, sn, cons) {
    if (sn.pointId) return sn.pointId;
    const id = uid("p");
    sk.points.push({ id, x: sn.x, y: sn.y });
    if (sn.on) cons.push({ id: uid("k"), type: sn.onType === "line" ? "pointOnLine" : "pointOnCircle", p: id, e: sn.on });
    if (sn.on2) cons.push({ id: uid("k"), type: sn.onType2 === "line" ? "pointOnLine" : "pointOnCircle", p: id, e: sn.on2 });
    if (sn.mid) cons.push({ id: uid("k"), type: "midpoint", p: id, e: sn.mid });
    return id;
  }
  addLine(a, b, opts = {}) {
    let hv = null;
    this.commit("Linie", (sk) => {
      const cons = [];
      const p1 = opts.p1 || this.usePoint(sk, a, cons);
      const p2 = this.usePoint(sk, b, cons);
      const id = uid("l");
      sk.entities.push({ id, type: "line", p1, p2, construction: !!this.construction });
      const P = new Map(sk.points.map((p) => [p.id, p]));
      const A = P.get(p1), B = P.get(p2);
      const ang = Math.abs((Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI);
      if (!opts.noInfer) {
        if (Math.min(ang, Math.abs(180 - ang)) < 2.5) hv = "horizontal";
        else if (Math.abs(90 - ang) < 2.5) hv = "vertical";
        if (hv && !this.lineAlreadyHV(sk, p1, p2, hv)) cons.push({ id: uid("k"), type: hv, e: id });
      }
      if (opts.length != null) cons.push({ id: uid("m"), type: "length", e: id, value: String(opts.length), labelOffset: 18 / this.M.scale });
      sk.constraints.push(...cons);
      // getippter Winkel (nicht 0/90/180/270°, die werden waagrecht/senkrecht) bleibt als Maß zur x-Achse stehen
      if (opts.angle != null) {
        const c = { id: uid("m"), type: "lineAngle", e: id, value: String(opts.angle), labelOffset: 34 / this.M.scale };
        try { if (checkNewConstraint(sk, c, this.scope()) === "ok") sk.constraints.push(c); } catch { /* weglassen */ }
      }
      // automatische Bedingungen nur, wenn sie die Skizze nicht überbestimmen
      for (const a of hv ? [] : opts.auto || []) {
        const c = { id: uid("k"), ...a, e1: a.e1 ?? id, e2: a.e2 ?? id, ...(a.type === "tangentAt" ? { p: p1 } : {}) };
        try { if (checkNewConstraint(sk, c, this.scope()) === "ok") sk.constraints.push(c); } catch { /* unpassend: weglassen */ }
      }
      this.lastLine = { p1, p2 };
    });
    return this.lastLine;
  }
  lineAlreadyHV(sk, p1, p2, type) {
    // Verhindert redundante H/V, wenn beide Punkte schon durch andere Linien gekoppelt sind
    const c = { id: "tmp", type, p: p1, q: p2 };
    try { return checkNewConstraint(sk, c, this.scope()) !== "ok"; } catch { return false; }
  }
  addRect(a, b, center = false, dims = {}) {
    this.mapping();
    const [ox, oy] = this.S(0, 0), [xx] = this.S(1, 0), [, yy] = this.S(0, 1);
    this.commit("Rechteck", (sk) => buildRect(sk, a, b, {
      center, dims, construction: !!this.construction, uid,
      usePoint: (s, sn, cons) => this.usePoint(s, sn, cons),
      screen: { xRight: xx > ox, yUp: yy < oy }, gap: 18 / this.M.scale,
    }));
  }
  /** Gegenecke des Rechtecks aus Maus und getippten Maßen; null, wenn ein getippter Wert ungültig ist */
  rectTarget(cur) {
    const st = this.state, center = this.tool === "rectc";
    if (!dynTyped(st.dyn)) return { b: cur, dims: {} };
    const r = dynValues(st.dyn, rectLive(st.start, cur, center), this.scope());
    if (!r.ok) return null;
    return { b: rectCorner(st.start, cur, r.values.w, r.values.h, center), dims: r.exprs };
  }
  /** Getippte Werte der laufenden Eingabe; null (mit Meldung), wenn ein Wert ungültig ist */
  dynResult(live) {
    const r = dynValues(this.state.dyn, live, this.scope());
    if (r.ok) return r;
    toast(this.state.dyn.fields.find((f) => f.error)?.error || "Ungültiger Wert", { kind: "err" });
    this.render();
    return null;
  }
  /** Endpunkt der Linie aus Maus und getippter Länge/Winkel */
  lineTarget(cur) {
    const st = this.state;
    if (!dynTyped(st.dyn)) { const b = this.inferHV(st.start, cur); return { b, opts: { auto: b.auto, noInfer: this.noAuto || !this.autoOn("hv") } }; }
    const r = this.dynResult(lineLive(st.start, cur));
    if (!r) return null;
    const b = lineEnd(st.start, r.values.len, r.values.ang);
    const typedAng = r.exprs.ang != null && !axisAngle(r.values.ang);
    return { b, opts: { length: r.exprs.len, angle: typedAng ? r.exprs.ang : null, noInfer: typedAng } };
  }
  finishLine(cur) {
    const t = this.lineTarget(cur);
    if (!t) return;
    const a = this.state.start, b = t.b;
    if (Math.hypot(b.x - a.x, b.y - a.y) * this.M.scale < 2) return;
    const res = this.addLine(a, b, t.opts);
    if (!res) { this.state = null; return; }
    if (!this.state.firstId) this.state.firstId = res.p1;
    if (b.pointId && b.pointId === this.state.firstId) { this.state = null; return; }
    const np = this.pts().get(res.p2);
    this.state.start = { x: np.x, y: np.y, pointId: res.p2 };
    this.state.dyn = createDynInput(["len", { key: "ang", signed: true }]);
  }
  finishCircle(cur) {
    const c = this.state.start;
    const r = Math.hypot(cur.x - c.x, cur.y - c.y);
    if (!dynTyped(this.state.dyn)) {
      if (r * this.M.scale < 1) return;
      this.state = null;
      const inf = this.noAuto ? null : inferCircle(this.sk, c, r, { tolR: this.autoTol(), kinds: this.autoKinds() });
      this.addCircle(c, inf ? inf.r : r, null, inf?.cons);
      return;
    }
    const res = this.dynResult({ d: 2 * r });
    if (!res) return;
    this.state = null;
    this.addCircle(c, res.values.d / 2, res.exprs.d);
  }
  finishDyn(cur) {
    if (this.tool === "line") this.finishLine(cur);
    else if (this.tool === "circle") this.finishCircle(cur);
    else if (this.tool === "slot" || this.tool === "ellipse" || this.tool === "arcc") this.stepPolar(cur);
    else if (this.tool === "polygon") this.finishPolygon(cur);
    else this.finishRect(cur);
  }
  /** Punkt in Länge/Winkel von origin: getippt (Maßeingabe) oder Maus; null bei ungültigem Wert */
  polarTarget(origin, cur) {
    if (!dynTyped(this.state.dyn)) return { b: cur, exprs: {}, values: lineLive(origin, cur) };
    const r = this.dynResult(lineLive(origin, cur));
    if (!r) return null;
    return { b: lineEnd(origin, r.values.len, r.values.ang), exprs: r.exprs, values: r.values };
  }
  /** Polygon-Eckenzahl ohne Eingabe: zuletzt benutzt bzw. Voreinstellung */
  polygonN() { return Math.max(3, Math.min(64, Math.round(Number(this.lastValue("polygon") || this.prefs?.["werkzeuge.std.polygon"]) || 6))); }
  /** Live-Werte der dritten Stufe (Langloch-Breite, Nebenhalbachse, Bogenwinkel) */
  thirdLive(cur) {
    const [a, b] = this.state.pts;
    if (this.tool === "slot") return { w: 2 * slotRadius(a, b, cur) };
    if (this.tool === "ellipse") return { b: Math.abs(ellipseLocal(ellipseGeom(a, b, 1), cur.x, cur.y).v) };
    const t1 = Math.atan2(b.y - a.y, b.x - a.x), t = Math.atan2(cur.y - a.y, cur.x - a.x);
    let sw = ((t - t1) * 180) / Math.PI;
    while (sw <= 0) sw += 360;
    return { sw };
  }
  /** Langloch, Ellipse, Bogen um Mitte: 2. Klick (Länge/Winkel tippbar), 3. Klick (Breite, Nebenhalbachse, Bogenwinkel tippbar) */
  stepPolar(cur) {
    const st = this.state, t = this.tool;
    if (st.pts.length === 1) {
      const p = this.polarTarget(st.pts[0], cur);
      if (!p) return;
      if (Math.hypot(p.b.x - st.pts[0].x, p.b.y - st.pts[0].y) * this.M.scale <= 2) return;
      st.pts.push(p.b);
      st.first = p.exprs;
      st.firstAng = p.values.ang;
      st.dyn = createDynInput([t === "arcc" ? { key: "sw", signed: true } : t === "slot" ? "w" : "b"]);
      return;
    }
    const live = this.thirdLive(cur);
    const r = dynTyped(st.dyn) ? this.dynResult(live) : { values: live, exprs: {} };
    if (!r) return;
    const [a, b] = st.pts, first = st.first || {}, axisAng = first.ang != null && axisAngle(st.firstAng);
    const angDim = first.ang != null && !axisAng ? first.ang : null;
    const hv = axisAng ? (Math.abs(Math.sin((st.firstAng * Math.PI) / 180)) < 1e-9 ? "horizontal" : "vertical") : null;
    this.state = null;
    const up = (s, p, cons) => this.usePoint(s, p, cons);
    if (t === "slot") {
      const rad = r.values.w / 2;
      if (rad * this.M.scale < 1 && !r.exprs.w) return;
      this.commitShape("Langloch", (sk) => {
        const s = buildSlot(sk, a, b, rad, { uid, usePoint: up, construction: !!this.construction });
        const dims = [];
        if (first.len != null) dims.push({ id: uid("m"), type: "length", e: s.axis, value: String(first.len), labelOffset: 0 });
        if (angDim != null) dims.push({ id: uid("m"), type: "lineAngle", e: s.axis, value: String(angDim), labelOffset: 34 / this.M.scale });
        if (hv) dims.push({ id: uid("k"), type: hv, e: s.axis });
        if (r.exprs.w != null) dims.push({ id: uid("m"), type: "diameter", e: s.arcs[0], value: String(r.exprs.w), labelAngle: Math.PI * 0.75 });
        this.pushChecked(sk, dims);
      });
    } else if (t === "ellipse") {
      if (r.values.b * this.M.scale < 1 && !r.exprs.b) return;
      const dims = [];
      if (first.len != null) dims.push({ type: "semiAxis", axis: "a", value: String(first.len) });
      if (first.ang != null) dims.push({ type: "axisAngle", value: String(first.ang) });
      if (r.exprs.b != null) dims.push({ type: "semiAxis", axis: "b", value: String(r.exprs.b) });
      this.addEllipse(a, b, r.values.b, dims);
    } else {
      const R = Math.hypot(b.x - a.x, b.y - a.y), t1 = Math.atan2(b.y - a.y, b.x - a.x) + (r.values.sw * Math.PI) / 180;
      const end = r.exprs.sw != null ? { x: a.x + R * Math.cos(t1), y: a.y + R * Math.sin(t1) } : cur;
      this.addArc(a, b, end, first.len != null ? first.len : null);
    }
  }
  finishPolygon(cur) {
    const st = this.state, c = st.start;
    const live = { n: this.polygonN(), r: Math.hypot(cur.x - c.x, cur.y - c.y) };
    const res = dynTyped(st.dyn) ? this.dynResult(live) : { values: live, exprs: {} };
    if (!res) return;
    const n = Math.round(res.values.n);
    if (!(n >= 3 && n <= 64)) { toast("Polygon: 3 bis 64 Ecken", { kind: "err" }); return; }
    if (res.values.r * this.M.scale < 2 && res.exprs.r == null) return;
    const a0 = Math.atan2(cur.y - c.y, cur.x - c.x);
    const v = res.exprs.r != null ? { x: c.x + res.values.r * Math.cos(a0), y: c.y + res.values.r * Math.sin(a0) } : cur;
    this.state = null;
    if (res.exprs.n != null) this.rememberValue("polygon", String(n));
    this.commitShape("Polygon", (sk) => {
      const p = buildPolygon(sk, c, v, n, { uid, usePoint: (s, q, cons) => this.usePoint(s, q, cons), construction: !!this.construction });
      if (res.exprs.r != null) this.pushChecked(sk, [{ id: uid("m"), type: "radius", e: p.circle, value: String(res.exprs.r), labelAngle: a0 + Math.PI / n }]);
    });
  }
  /** Maße/Bedingungen einzeln anhängen, nur wenn sie nicht überbestimmen */
  pushChecked(sk, list) {
    for (const c of list) {
      try { if (checkNewConstraint(sk, c, this.scope()) === "ok") sk.constraints.push(c); } catch { /* weglassen */ }
    }
  }
  finishRect(cur) {
    const t = this.rectTarget(cur);
    if (!t) { toast(this.state.dyn.fields.find((f) => f.error)?.error || "Ungültiger Wert", { kind: "err" }); this.render(); return; }
    const a = this.state.start;
    if (Math.abs(t.b.x - a.x) < 1e-9 || Math.abs(t.b.y - a.y) < 1e-9) { toast("Rechteck braucht Breite und Höhe"); return; }
    this.state = null;
    this.addRect(a, t.b, this.tool === "rectc", t.dims);
  }
  /** „Skizze vollständig bemaßen“: Auswahl der Maßarten, Bezug Ursprung oder gewählter Punkt; ein Rückgängig-Schritt */
  autoDimensionDialog() {
    if (!this.sk) return;
    const selPt = [...this.sel].filter((s) => s.startsWith("p:")).map((s) => s.slice(2));
    const ref = selPt.length === 1 ? selPt[0] : "O";
    const kinds = { radius: true, length: true, angle: true, position: true };
    const labels = { radius: "Durchmesser und Radien", length: "Linienlängen", angle: "Winkel an Ecken", position: "Lage zum Bezugspunkt" };
    const info = h("p", { class: "hint" });
    const run = () => autoDimension(this.sk, this.scope(), { ref, kinds, uid });
    const update = () => {
      const r = run();
      info.textContent = r.dofBefore === 0 ? "Die Skizze ist schon voll bestimmt."
        : `${r.constraints.length} Maß(e) werden gesetzt. Danach frei: ${r.dofAfter} Freiheitsgrad(e)` + (r.dofAfter ? " – für den Rest weitere Maßarten zulassen oder Bedingungen setzen." : ".");
    };
    const boxes = Object.keys(kinds).map((k) => {
      const cb = h("input", { type: "checkbox", checked: true, onchange: () => { kinds[k] = cb.checked; update(); } });
      return h("label", { class: "chk" }, cb, labels[k]);
    });
    update();
    modal({
      title: "Skizze vollständig bemaßen",
      body: h("div", {}, ...boxes, h("p", { class: "hint" }, ref === "O" ? "Bezug: Skizzenursprung. Einen Punkt vorher wählen, um ihn als Bezug zu nehmen." : "Bezug: gewählter Punkt."), info),
      buttons: [{ label: "Abbrechen", value: null }, { label: "Bemaßen", primary: true, run: () => {
        const r = run();
        if (!r.constraints.length) { toast("Keine Maße nötig"); return; }
        this.commit("Vollständig bemaßen", (sk) => sk.constraints.push(...r.constraints));
        toast(`${r.constraints.length} Maß(e) gesetzt` + (r.dofAfter ? `, ${r.dofAfter} Freiheitsgrad(e) bleiben` : " – Skizze voll bestimmt"), { kind: r.dofAfter ? "" : "ok" });
      } }],
    });
  }
  /** „Skizze säubern“ (MegaCAD-Abgleich M7): Vorschau der Änderungen, ein Rückgängig-Schritt */
  /** DXF in die offene Skizze übernehmen: Layer wählen, Lage, als Konstruktion, danach säubern (M21) */
  async importDxfDialog(file) {
    if (!this.sk) return;
    file = file || (await this.app.files.pickDxf());
    if (!file) return;
    let dx;
    try { dx = parseDxf(file.text); } catch (e) { toast("DXF: " + e.message, { kind: "err" }); return; }
    if (!dx.prims.length) { toast("DXF enthält keine Linien, Bögen oder Kreise", { kind: "err" }); return; }
    const on = new Set(dx.layers.map((l) => l.name));
    const opt = { place: "origin", construction: false, clean: true };
    const info = h("p", { class: "hint" });
    const chosen = () => dx.prims.filter((p) => on.has(p.layer));
    const update = () => {
      const bb = primsBounds(chosen());
      info.textContent = bb ? `${chosen().length} Elemente, ${fmtNum(bb[1][0] - bb[0][0], 1)} × ${fmtNum(bb[1][1] - bb[0][1], 1)} mm, Einheit der Datei: ${dx.unit}` : "Kein Layer gewählt";
    };
    const skipped = Object.entries(dx.skipped).map(([k, n]) => `${n} × ${k}`).join(", ");
    const radio = (val, label) => h("label", { class: "chk" }, h("input", { type: "radio", name: "dxfplace", checked: opt.place === val, onchange: () => { opt.place = val; } }), label);
    const chk = (key, label) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: opt[key], onchange: (e) => { opt[key] = e.target.checked; } }), label);
    update();
    modal({
      title: "DXF importieren – " + file.name,
      body: h("div", {},
        h("h4", {}, "Layer"),
        ...dx.layers.map((l) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { if (e.target.checked) on.add(l.name); else on.delete(l.name); update(); } }), `${l.name} (${l.count})`)),
        h("h4", {}, "Lage"), radio("origin", "Koordinaten wie in der Datei"), radio("corner", "linke untere Ecke auf den Skizzen-Nullpunkt"), radio("center", "Mitte auf den Skizzen-Nullpunkt"),
        h("h4", {}, "Optionen"), chk("construction", "als Konstruktionslinien"), chk("clean", "danach säubern (Endpunkte zusammenführen, doppelte entfernen)"),
        info,
        skipped ? h("p", { class: "hint" }, "Nicht übernommen: " + skipped + ".") : null,
        dx.warnings.length ? h("p", { class: "hint" }, dx.warnings.join("; ")) : null,
        h("p", { class: "hint" }, "Splines und Ellipsenbögen werden als Polygonzug übernommen. Maße und Bedingungen entstehen nicht; Maße danach mit »Automatisch bemaßen«.")),
      buttons: [{ label: "Abbrechen", value: null }, { label: "Importieren", primary: true, run: () => {
        const prims = chosen();
        if (!prims.length) { toast("Kein Layer gewählt"); return false; }
        const bb = primsBounds(prims);
        const offset = opt.place === "corner" ? [-bb[0][0], -bb[0][1]] : opt.place === "center" ? [-(bb[0][0] + bb[1][0]) / 2, -(bb[0][1] + bb[1][1]) / 2] : [0, 0];
        let rep = null, cnt = null;
        this.sel.clear();
        this.commit("DXF importieren", (sk) => {
          cnt = dxfToSketch(sk, prims, { uid, offset, construction: opt.construction });
          if (opt.clean) rep = cleanSketch(sk, { ...CLEAN_DEFAULTS, kinds: { ...Object.fromEntries(Object.keys(CLEAN_KINDS).map((k) => [k, true])), straighten: false }, uid });
        });
        const corners = [[bb[0][0], bb[0][1]], [bb[1][0], bb[1][1]]].map(([x, y]) => toWorld(this.frame, x + offset[0], y + offset[1]));
        this.viewer.fitPoints(corners);
        toast(`DXF: ${cnt.entities} Elemente übernommen` + (rep?.total ? ` · ${cleanReportText(rep)}` : ""), { kind: "ok" });
      } }],
    });
  }
  cleanDialog() {
    if (!this.sk) return;
    const kinds = Object.fromEntries(Object.keys(CLEAN_KINDS).map((k) => [k, true]));
    const opt = { tol: CLEAN_DEFAULTS.tol, angle: CLEAN_DEFAULTS.angle };
    const info = h("p", { class: "hint" });
    // auf einer Kopie säubern und lösen; widerspricht das Geradestellen der Bemaßung, ohne es
    const run = () => {
      const tryOnce = (straighten) => {
        const work = JSON.parse(JSON.stringify(this.sk));
        const rep = cleanSketch(work, { ...opt, kinds: { ...kinds, straighten: kinds.straighten && straighten }, uid });
        return { work, rep, ok: solveSketch(work, this.scope()).ok !== false };
      };
      let r = tryOnce(true);
      if (!r.ok && kinds.straighten) { const r2 = tryOnce(false); if (r2.ok) r = { ...r2, skipped: true }; }
      return r;
    };
    const update = () => {
      const r = run();
      info.textContent = cleanReportText(r.rep) + (r.skipped ? ". Geradestellen widerspricht der Bemaßung und entfällt." : r.ok ? "." : ". Achtung: Skizze danach nicht lösbar.");
    };
    const num = (label, key, unit) => {
      const inp = h("input", { class: "inp", value: String(opt[key]).replace(".", ","), onchange: () => { const v = Number(inp.value.replace(",", ".")); if (v >= 0) { opt[key] = v; update(); } } });
      return h("div", { class: "field" }, h("label", {}, label), h("div", { class: "expr-wrap" }, inp, h("span", { class: "val" }, unit)));
    };
    const boxes = Object.entries(CLEAN_KINDS).map(([k, label]) => {
      const cb = h("input", { type: "checkbox", checked: true, onchange: () => { kinds[k] = cb.checked; update(); } });
      return h("label", { class: "chk" }, cb, label);
    });
    update();
    modal({
      title: "Skizze säubern",
      body: h("div", {}, ...boxes, num("Fangabstand", "tol", "mm"), num("Winkeltoleranz", "angle", "°"),
        h("p", { class: "hint" }, "Endpunkte näher als der Fangabstand werden ein Punkt, doppelte Elemente fallen weg (Maße gehen auf das verbliebene über), überlappende Linien werden eine. Linien, die weniger als die Winkeltoleranz schief liegen, bekommen „waagrecht“ bzw. „senkrecht“."), info),
      buttons: [{ label: "Abbrechen", value: null }, { label: "Säubern", primary: true, run: () => {
        const r = run();
        if (!r.rep.total) { toast("Nichts zu säubern"); return; }
        this.sel.clear();
        this.commit("Skizze säubern", (sk) => { sk.points = r.work.points; sk.entities = r.work.entities; sk.constraints = r.work.constraints; });
        toast(cleanReportText(r.rep), { kind: "ok" });
      } }],
    });
  }
  /** Spline aus den geklickten Punkten anlegen; closed = letzter Punkt ist der erste */
  finishSpline(closed = false) {
    const pts = this.state?.pts || [];
    this.state = null;
    if (pts.length < 2) { this.render(); return; }
    this.commit("Spline", (sk) => {
      const cons = [];
      const ids = pts.map((p) => this.usePoint(sk, p, cons));
      if (closed) ids.push(ids[0]);
      sk.entities.push({ id: uid("sp"), type: "spline", pts: ids, p1: ids[0], p2: ids[ids.length - 1], construction: !!this.construction });
      sk.constraints.push(...cons);
    });
    this.render();
  }
  addEllipse(c, a, rb, dims = []) {
    this.commit("Ellipse", (sk) => {
      const cons = [];
      const cid = this.usePoint(sk, c, cons), aid = this.usePoint(sk, a, cons);
      const id = uid("el");
      sk.entities.push({ id, type: "ellipse", c: cid, a: aid, r: Math.max(rb, 1e-3), construction: !!this.construction });
      sk.constraints.push(...cons);
      this.pushChecked(sk, dims.map((d) => ({ id: uid("m"), ...d, e: id })));
    });
  }
  addCircle(c, r, diameter = null, auto = null) {
    this.commit("Kreis", (sk) => {
      const cons = [];
      const cid = this.usePoint(sk, c, cons);
      const id = uid("k");
      sk.entities.push({ id, type: "circle", c: cid, r: Math.max(r, 1e-3), construction: !!this.construction });
      if (diameter != null) cons.push({ id: uid("m"), type: "diameter", e: id, value: String(diameter), labelAngle: Math.PI / 4 });
      sk.constraints.push(...cons);
      for (const a of auto || []) {
        const k = { id: uid("k"), ...a, e1: id };
        try { if (checkNewConstraint(sk, k, this.scope()) === "ok") sk.constraints.push(k); } catch { /* weglassen */ }
      }
    });
  }
  /** Kreis durch 3 Fangpunkte; vorhandene Punkte liegen danach auf dem Kreis */
  addCircle3(pts) {
    const c = circleFrom3(...pts.map((p) => [p.x, p.y]));
    if (!c || c.r * this.M.scale < 1) { toast("Die drei Punkte liegen auf einer Geraden – kein Kreis möglich"); this.render(); return; }
    this.commit("Kreis", (sk) => {
      const cid = uid("p"), id = uid("k");
      sk.points.push({ id: cid, x: c.x, y: c.y });
      sk.entities.push({ id, type: "circle", c: cid, r: c.r, construction: !!this.construction });
      const cons = [];
      for (const p of pts) {
        if (p.pointId) cons.push({ id: uid("k"), type: "pointOnCircle", p: p.pointId, e: id });
        else if (p.on) { const q = this.usePoint(sk, p, []); cons.push({ id: uid("k"), type: p.onType === "line" ? "pointOnLine" : "pointOnCircle", p: q, e: p.on }, { id: uid("k"), type: "pointOnCircle", p: q, e: id }); sk.entities.push({ id: uid("pt"), type: "point", p: q, construction: true }); }
      }
      this.pushChecked(sk, cons);
    });
  }
  addArc(center, start, end, radius = null) {
    this.commit("Bogen", (sk) => {
      const cons = [];
      const cid = center.pointId || (() => { const id = uid("p"); sk.points.push({ id, x: center.x, y: center.y }); return id; })();
      const p1 = this.usePoint(sk, start, cons);
      // Endpunkt auf Radius projizieren
      const r = Math.hypot(start.x - center.x, start.y - center.y);
      const ang = Math.atan2(end.y - center.y, end.x - center.x);
      const e2 = end.pointId ? end : { ...end, x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) };
      const p2 = this.usePoint(sk, e2, cons);
      const id = uid("b");
      sk.entities.push({ id, type: "arc", c: cid, p1, p2, construction: !!this.construction });
      sk.constraints.push(...cons);
      if (radius != null) this.pushChecked(sk, [{ id: uid("m"), type: "radius", e: id, value: String(radius), labelAngle: Math.atan2(start.y - center.y, start.x - center.x) }]);
    });
  }
  addPoint(sn) {
    this.commit("Punkt", (sk) => {
      const cons = [];
      const id = this.usePoint(sk, { ...sn, pointId: null }, cons);
      sk.entities.push({ id: uid("pt"), type: "point", p: id, construction: false });
      sk.constraints.push(...cons);
    });
  }

  /** Platzhalter für Text: Teilenummer, Name und Werkstoff des Bauteils, Datum heute */
  textVars() { return partTextVars(this.part); }
  /** Text setzen (FU1): Dialog für Text und Schrifthöhe, Anfangspunkt ist ein normaler Skizzenpunkt */
  addText(sn) {
    this.textDialog({ ...defaultText(), h: this.lastTextH || defaultText().h }, (vals) => {
      this.lastTextH = vals.h;
      this.commit("Text", (sk) => {
        const cons = [];
        const id = this.usePoint(sk, sn, cons);
        sk.entities.push({ id: uid("tx"), type: "text", p: id, ...vals, construction: !!this.construction });
        sk.constraints.push(...cons);
      });
    });
  }
  /** Dialog Text bearbeiten; onOk({text, h, angle, style, align, spacing}) */
  textDialog(e, onOk) {
    const ta = h("textarea", { class: "inp", rows: 2, style: { width: "100%", fontSize: "14px" } });
    ta.value = e.text ?? "";
    const num = (v, step) => h("input", { class: "inp", type: "number", step, value: v });
    const hi = num(e.h, "0.5"), an = num(e.angle || 0, "1"), sp = num(e.spacing || 0, "0.1");
    const st = h("select", { class: "inp" }, ...TEXT_STYLES.map((o) => h("option", { value: o.value, selected: o.value === (e.style || "normal") }, o.label)));
    const al = h("select", { class: "inp" }, ...[["links", "Links"], ["mitte", "Mitte"], ["rechts", "Rechts"]].map(([v, l]) => h("option", { value: v, selected: v === (e.align || "links") }, l)));
    const f = (label, el) => h("div", { class: "field" }, h("label", {}, label), el);
    modal({ title: "Text", width: "440px",
      body: h("div", { class: "text-dialog" }, f("Text", ta), f("Schrifthöhe (mm)", hi), f("Winkel (°)", an), f("Schrift", st), f("Ausrichtung", al), f("Zeichenabstand (mm)", sp),
        h("p", { class: "hint" }, "Mehrere Zeilen mit Enter. Platzhalter: {teilenummer}, {name}, {werkstoff}, {datum}. Für den Laser genügt meist Gravieren mit 0,2–0,5 mm Tiefe.")),
      buttons: [{ label: "Abbrechen" }, { label: "OK", primary: true, run: () => {
        const H = Number(hi.value);
        if (!ta.value.trim()) { toast("Bitte einen Text eingeben"); return false; }
        if (!(H > 0)) { toast("Schrifthöhe muss > 0 sein"); return false; }
        onOk({ text: ta.value, h: H, angle: Number(an.value) || 0, style: st.value, align: al.value, spacing: Number(sp.value) || 0 });
      } }] });
    setTimeout(() => ta.select(), 30);
  }
  /** Gewählten Text bearbeiten */
  /** Bild einfügen (FU2): Datei wählen, verkleinern, im Projekt ablegen, Breite abfragen */
  async addImage(sn) {
    const img = await this.app.files.pickImage();
    if (!img) return;
    const w0 = Math.round((this.lastImageW || 200) * 10) / 10;
    this.imageDialog({ w: w0, h: (w0 * img.px[1]) / img.px[0], angle: 0, opacity: 0.5 }, img.px, (vals) => {
      this.lastImageW = vals.w;
      const prj = this.app.project;
      const imgId = uid("bild");
      this.commit("Bild", (sk) => {
        prj.images = prj.images || {};
        prj.images[imgId] = { src: img.src, name: img.name, px: img.px };
        const cons = [];
        const id = this.usePoint(sk, sn, cons);
        sk.entities.push({ ...newImageEntity(uid("im"), id, imgId, img.px, vals.w), ...vals });
        sk.constraints.push(...cons);
      });
    });
  }
  /** Dialog Breite, Winkel, Deckkraft, Maßstab über bekannte Strecke; Höhe folgt dem Seitenverhältnis */
  imageDialog(e, px, onOk) {
    const num = (v, step) => h("input", { class: "inp", type: "number", step, value: Math.round(v * 1000) / 1000 });
    const wi = num(e.w, "1"), an = num(e.angle || 0, "1"), op = num(Math.round((e.opacity ?? 0.5) * 100), "5");
    const meas = num(0, "0.1"), real = num(0, "0.1");
    const f = (label, el) => h("div", { class: "field" }, h("label", {}, label), el);
    modal({ title: "Bild", width: "440px",
      body: h("div", { class: "image-dialog" }, f("Breite (mm)", wi), f("Winkel (°)", an), f("Deckkraft (%)", op),
        h("p", { class: "hint" }, "Maßstab über eine bekannte Strecke: im Bild messen (z. B. mit einer Konstruktionslinie), dann beide Werte eintragen."),
        f("Strecke im Bild (mm)", meas), f("Wirkliche Länge (mm)", real)),
      buttons: [{ label: "Abbrechen" }, { label: "OK", primary: true, run: () => {
        let w = Number(wi.value);
        const sc = rescaleImage({ w, h: 1 }, Number(meas.value), Number(real.value));
        if (sc) w = sc.w;
        if (!(w > 0)) { toast("Breite muss > 0 sein"); return false; }
        const o = Math.min(100, Math.max(5, Number(op.value) || 50)) / 100;
        onOk({ w, h: (w * px[1]) / px[0], angle: Number(an.value) || 0, opacity: o });
      } }] });
  }
  editImage(id) {
    const e = this.entity(id);
    const im = e && this.app.project.images?.[e.img];
    if (!e) return;
    const px = im?.px || [e.w, e.h];
    this.imageDialog(e, px, (vals) => this.commit("Bild ändern", (sk) => Object.assign(sk.entities.find((x) => x.id === id), vals)));
  }
  editText(id) {
    const e = this.entity(id);
    if (!e) return;
    this.textDialog(e, (vals) => this.commit("Text ändern", (sk) => Object.assign(sk.entities.find((x) => x.id === id), vals)));
  }

  // ---------- Bedingungen / Bemaßung ----------
  entity(id) { return this.sk.entities.find((e) => e.id === id); }
  pickForConstraint(hit) {
    const t = this.tool;
    if (!hit) return;
    const picks = this.pendingPick;
    if (hit.kind === "entity" || hit.kind === "point") picks.push(hit);
    else return;
    const E = (h) => (h.kind === "entity" ? this.entity(h.id) : null);
    const isLine = (h) => E(h)?.type === "line";
    const isCirc = (h) => ["circle", "arc"].includes(E(h)?.type);
    const isEll = (h) => E(h)?.type === "ellipse";
    const isSpl = (h) => E(h)?.type === "spline";
    const isPt = (h) => h.kind === "point";
    let c = null;
    const done = () => { this.pendingPick = []; };
    switch (t) {
      case "horizontal": case "vertical":
        if (isLine(picks[0])) c = { type: t, e: picks[0].id };
        else if (picks.length === 2 && isPt(picks[0]) && isPt(picks[1])) c = { type: t, p: picks[0].id, q: picks[1].id };
        else if (!isPt(picks[0])) { done(); return toast("Linie oder zwei Punkte wählen"); }
        break;
      case "fix":
        if (isPt(picks[0])) { const p = this.pts().get(picks[0].id); c = { type: "fix", p: p.id, x: p.x, y: p.y }; }
        else if (isLine(picks[0])) {
          const e = E(picks[0]); const P = this.pts();
          this.addConstraint({ type: "fix", p: e.p1, x: P.get(e.p1).x, y: P.get(e.p1).y });
          c = { type: "fix", p: e.p2, x: P.get(e.p2).x, y: P.get(e.p2).y };
        } else { done(); return; }
        break;
      case "coincident":
        if (picks.length < 2) return;
        if (isPt(picks[0]) && isPt(picks[1])) c = { type: "coincident", p: picks[0].id, q: picks[1].id };
        else {
          const pt = picks.find(isPt), cur = picks.find((x) => !isPt(x));
          if (!pt || !cur) { done(); return toast("Punkt und Linie/Kreis wählen"); }
          c = { type: isLine(cur) ? "pointOnLine" : "pointOnCircle", p: pt.id, e: cur.id };
        }
        break;
      case "parallel": case "perpendicular": case "collinear":
        if (picks.length < 2) { if (!isLine(picks[0])) done(); return; }
        if (!isLine(picks[1])) { done(); return toast("Zwei Linien wählen"); }
        c = { type: t, e1: picks[0].id, e2: picks[1].id };
        break;
      case "equal":
        if (picks.length < 2) return;
        if ((isLine(picks[0]) && isLine(picks[1])) || (isCirc(picks[0]) && isCirc(picks[1]))) c = { type: "equal", e1: picks[0].id, e2: picks[1].id };
        else { done(); return toast("Zwei Linien oder zwei Kreise wählen"); }
        break;
      case "concentric":
        if (picks.length < 2) return;
        if ((isCirc(picks[0]) || isEll(picks[0])) && (isCirc(picks[1]) || isEll(picks[1]))) c = { type: "concentric", e1: picks[0].id, e2: picks[1].id };
        else { done(); return; }
        break;
      case "tangent":
        if (picks.length < 2) return;
        if ((isLine(picks[0]) && isEll(picks[1])) || (isEll(picks[0]) && isLine(picks[1]))) c = { type: "tangent", e1: picks[0].id, e2: picks[1].id };
        else if (isSpl(picks[0]) || isSpl(picks[1])) {
          const sp = isSpl(picks[0]) ? E(picks[0]) : E(picks[1]), o = sp === E(picks[0]) ? E(picks[1]) : E(picks[0]);
          if (!o || !["line", "arc", "circle"].includes(o.type)) { done(); return toast("Spline: tangential zu Linie, Bogen oder Kreis am Spline-Ende"); }
          const P = this.pts(), ends = [o.p1, o.p2, o.c].filter(Boolean).map((id) => P.get(id));
          const dist = (id) => Math.min(...ends.map((q) => Math.hypot(q.x - P.get(id).x, q.y - P.get(id).y)));
          c = { type: "tangent", e1: sp.id, e2: o.id, end: dist(sp.pts.at(-1)) < dist(sp.pts[0]) ? "end" : "start" };
        }
        else if (isEll(picks[0]) || isEll(picks[1])) { done(); return toast("Ellipse: tangential nur zu einer Linie"); }
        else if ((isLine(picks[0]) || isCirc(picks[0])) && isCirc(picks[1]) || (isCirc(picks[0]) && isLine(picks[1]))) {
          c = { type: "tangent", e1: picks[0].id, e2: picks[1].id };
          if (isCirc(picks[0]) && isCirc(picks[1])) {
            const P = this.pts();
            const a = E(picks[0]), b = E(picks[1]);
            const ra = a.type === "circle" ? a.r : Math.hypot(P.get(a.p1).x - P.get(a.c).x, P.get(a.p1).y - P.get(a.c).y);
            const rb = b.type === "circle" ? b.r : Math.hypot(P.get(b.p1).x - P.get(b.c).x, P.get(b.p1).y - P.get(b.c).y);
            const d = Math.hypot(P.get(a.c).x - P.get(b.c).x, P.get(a.c).y - P.get(b.c).y);
            c.internal = d < Math.max(ra, rb);
          }
        } else { done(); return; }
        break;
      case "midpoint":
        if (picks.length < 2) return;
        if (isPt(picks[0]) && isLine(picks[1])) c = { type: "midpoint", p: picks[0].id, e: picks[1].id };
        else { done(); return toast("Erst Punkt, dann Linie wählen"); }
        break;
      case "symmetric":
        if (picks.length < 3) return;
        if (isPt(picks[0]) && isPt(picks[1]) && isLine(picks[2])) c = { type: "symmetric", p: picks[0].id, q: picks[1].id, e: picks[2].id };
        else { done(); return toast("Zwei Punkte und eine Linie wählen"); }
        break;
    }
    done();
    if (c) this.addConstraint(c);
  }
  addConstraint(c) {
    c.id = c.id || uid("k");
    const res = checkNewConstraint(this.sk, c, this.scope());
    if (res === "redundant" || res === "conflict") {
      const why = this.blame(c);
      toast((res === "redundant" ? "Bedingung ist schon erfüllt (überzählig)" : "Bedingung widerspricht vorhandenen Bedingungen") + (why ? ` – festgelegt durch: ${why}` : ""), { kind: res === "conflict" ? "err" : "" });
      return false;
    }
    this.commit("Abhängigkeit", (sk) => sk.constraints.push(c));
    return true;
  }

  /** Bedingungen, die eine neue Bedingung überzählig machen: für ein paar Sekunden rot markieren, Klartext zurück */
  blame(c) {
    let ids = [];
    try { ids = explainDependency(this.sk, c, this.scope()).filter((id) => id !== "Of"); } catch { /* ohne Erklärung */ }
    if (!ids.length) return "";
    this.flash = new Set(ids);
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { this.flash = null; if (this.active) this.render(); }, 4000);
    this.render();
    const names = [...new Set(ids.map((id) => this.sk.constraints.find((k) => k.id === id)).filter(Boolean).map(constraintLabel))];
    return names.slice(0, 4).join(", ") + (names.length > 4 ? ` (+${names.length - 4})` : "");
  }

  /** Bemaßung aus gewählten Elementen ableiten */
  dimensionFrom(picks, place) {
    const E = (h) => (h.kind === "entity" ? this.entity(h.id) : null);
    const P = this.pts();
    if (picks.length === 1 && E(picks[0])) {
      const e = E(picks[0]);
      if (e.type === "line") {
        const a = P.get(e.p1), b = P.get(e.p2);
        const dir = this.placeDir(a, b, place);
        if (dir === "a") return { type: "length", e: e.id, labelOffset: this.offsetFor(a, b, place, dir) };
        return { type: "distance", p: e.p1, q: e.p2, dir, labelOffset: this.offsetFor(a, b, place, dir) };
      }
      if (e.type === "circle") return { type: "diameter", e: e.id, labelAngle: this.angleFor(P.get(e.c), place) };
      if (e.type === "arc") return { type: "radius", e: e.id, labelAngle: this.angleFor(P.get(e.c), place) };
      if (e.type === "ellipse") { // Halbachse nach Klickrichtung: nahe der Hauptachse → a, sonst b
        const q = ellipseLocal(this.ellG(e, P), place.x, place.y);
        return { type: "semiAxis", e: e.id, axis: Math.abs(q.v) > Math.abs(q.u) ? "b" : "a" };
      }
      return null;
    }
    if (picks.length === 2) {
      const [A, B] = picks;
      if (A.kind === "point" && B.kind === "point") {
        const a = P.get(A.id), b = P.get(B.id);
        const dir = this.placeDir(a, b, place);
        return { type: "distance", p: A.id, q: B.id, dir: dir === "a" ? undefined : dir, labelOffset: this.offsetFor(a, b, place, dir) };
      }
      const ea = E(A), eb = E(B);
      if (ea?.type === "line" && eb?.type === "line") {
        const u = [P.get(ea.p2).x - P.get(ea.p1).x, P.get(ea.p2).y - P.get(ea.p1).y];
        const v = [P.get(eb.p2).x - P.get(eb.p1).x, P.get(eb.p2).y - P.get(eb.p1).y];
        const cr = Math.abs(u[0] * v[1] - u[1] * v[0]) / (Math.hypot(...u) * Math.hypot(...v) || 1);
        if (cr > 1e-3) return { type: "angle", e1: ea.id, e2: eb.id, labelOffset: 30 / this.M.scale };
        return { type: "distance", p: eb.p1, e: ea.id, labelOffset: 0 };
      }
      const pt = picks.find((x) => x.kind === "point"), ln = picks.find((x) => E(x)?.type === "line");
      if (pt && ln) return { type: "distance", p: pt.id, e: ln.id, labelOffset: 0 };
      const circs = picks.filter((x) => ["circle", "arc"].includes(E(x)?.type));
      if (circs.length === 2) return { type: "distance", p: E(circs[0]).c, q: E(circs[1]).c, labelOffset: 12 / this.M.scale };
      if (pt && circs.length === 1) return { type: "distance", p: pt.id, q: E(circs[0]).c, labelOffset: 12 / this.M.scale };
    }
    return null;
  }
  placeDir(a, b, place) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const axisAligned = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
    if (axisAligned) return Math.abs(a.y - b.y) < 1e-9 ? "h" : "v";
    const outX = place.x < x0 || place.x > x1, outY = place.y < y0 || place.y > y1;
    if (outY && !outX) return "h";
    if (outX && !outY) return "v";
    return "a";
  }
  offsetFor(a, b, place, dir) {
    if (dir === "h") return place.y - Math.max(a.y, b.y) >= 0 ? place.y - Math.max(a.y, b.y) : place.y - Math.min(a.y, b.y);
    if (dir === "v") return place.x - Math.max(a.x, b.x) >= 0 ? place.x - Math.max(a.x, b.x) : place.x - Math.min(a.x, b.x);
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return ((place.x - a.x) * -dy + (place.y - a.y) * dx) / L;
  }
  angleFor(c, place) { return Math.atan2(place.y - c.y, place.x - c.x); }

  async finishDimension(c, sx, sy) {
    c.id = uid("m");
    const measured = measureConstraint(this.sk, { ...c, value: "0" });
    const res = checkNewConstraint(this.sk, { ...c, value: String(measured) }, this.scope());
    if (res !== "ok") {
      const why = this.blame({ ...c, value: String(measured) });
      const ch = await choiceDialog("Maß würde überbestimmen", "Dieses Maß ist durch andere Bedingungen schon festgelegt" + (why ? ` (rot markiert: ${why})` : "") + ". Als getriebenes Maß (nur Anzeige, in Klammern) hinzufügen?", [{ label: "Abbrechen", value: null }, { label: "Getriebenes Maß", value: "driven", primary: true }]);
      if (ch !== "driven") return;
      c.driven = true;
      c.value = String(round4(measured));
      this.commit("Getriebenes Maß", (sk) => sk.constraints.push(c));
      return;
    }
    this.askValue(sx, sy, round4(measured), (val) => {
      c.value = val;
      this.commit("Bemaßung", (sk) => sk.constraints.push(c));
    });
  }
  askValue(sx, sy, initial, onOk, { allowList = false } = {}) {
    this.cancelInput();
    const scope = this.scope();
    const inp = h("input", { value: String(initial).replace(".", ","), spellcheck: "false" });
    const box = h("div", { class: "dim-input", style: { left: sx + 12 + "px", top: sy - 14 + "px" } }, inp, h("button", { class: "btn primary", onclick: () => ok() }, "OK"));
    const ok = () => {
      const v = inp.value.trim();
      try {
        for (const part of allowList ? v.split(";") : [v]) {
          const num = evaluate(part.trim(), scope);
          if (!(num > 0) && !part.includes("-")) throw new Error("Wert muss > 0 sein");
        }
        this.cancelInput();
        onOk(v);
      } catch (err) {
        inp.style.borderColor = "var(--err)";
        inp.title = err.message;
      }
    };
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") ok();
      if (e.key === "Escape") this.cancelInput();
    });
    this.stage.append(box);
    this.inputBox = box;
    setTimeout(() => { inp.focus(); inp.select(); }, 10);
  }
  /** Verschieben / Kopieren / Drehen / Skalieren der gewählten Elemente um den geklickten Punkt */
  transformDialog(t, ids, at) {
    const scope = this.scope();
    const kind = { smove: "move", scopy: "move", srotate: "rotate", sscale: "scale" }[t];
    const title = { smove: "Verschieben", scopy: "Kopieren", srotate: "Drehen", sscale: "Skalieren" }[t];
    const last = this.lastValue("trafo-" + kind) || { move: { dx: "10", dy: "0" }, rotate: { angle: "90" }, scale: { factor: "2" } }[kind];
    const fields = { move: [["dx", "Verschiebung X"], ["dy", "Verschiebung Y"]], rotate: [["angle", "Winkel ° (gegen Uhrzeigersinn)"]], scale: [["factor", "Faktor"]] }[kind];
    const inputs = Object.fromEntries(fields.map(([k]) => [k, h("input", { class: "inp", value: last[k], spellcheck: "false", "data-k": k })]));
    const copy = h("input", { type: "checkbox", checked: t === "scopy" });
    const err = h("div", { class: "hint" });
    modal({
      title,
      body: h("div", { class: "pattern-dlg" }, ...fields.map(([k, label]) => h("div", { class: "field" }, h("label", {}, label), inputs[k])),
        h("label", { class: "check" }, copy, " Als Kopie (Original bleibt)"),
        h("p", { class: "hint" }, kind === "move" ? "Verschiebung relativ zum geklickten Basispunkt." : `${kind === "rotate" ? "Drehpunkt" : "Bezugspunkt"}: ${fmtNum(at.x, 2)} / ${fmtNum(at.y, 2)}`), err),
      buttons: [{ label: "Abbrechen", value: null }, { label: title, primary: true, run: () => {
        const v = Object.fromEntries(fields.map(([k]) => [k, inputs[k].value.trim()]));
        let op;
        try {
          const E = (x) => evaluate(x, scope);
          op = kind === "move" ? { kind, dx: E(v.dx), dy: E(v.dy) } : kind === "rotate" ? { kind, cx: at.x, cy: at.y, angle: E(v.angle) } : { kind, cx: at.x, cy: at.y, factor: E(v.factor) };
          op.copy = copy.checked;
          transformEntities(JSON.parse(JSON.stringify(this.sk)), ids, op, { uid });
        } catch (e) { err.textContent = e.message; return false; }
        this.rememberValue("trafo-" + kind, v);
        this.commit(title, (sk) => transformEntities(sk, ids, op, { uid }));
        this.sel.clear();
        this.app.selectSketchItems([]);
        this.render();
        return true;
      } }],
    });
  }
  /** Dialog für Rechteck- bzw. Kreismuster; center = Fangpunkt (bestehender Punkt oder freie Lage) */
  patternDialog(mode, ids, center) {
    const scope = this.scope();
    const n0 = String(this.prefs?.["werkzeuge.std.musterAnzahl"] ?? 3), a0 = String(this.prefs?.["werkzeuge.std.musterAbstand"] ?? 20);
    const memo = mode === "rot" ? "kreismuster" : "muster";
    const last = this.lastValue(memo) || (mode === "rot" ? { n: n0, total: "360" } : { nx: n0, a: a0, ny: "1", b: a0 });
    const fields = mode === "rot" ? [["n", "Anzahl"], ["total", "Gesamtwinkel °"]] : [["nx", "Anzahl X"], ["a", "Abstand X"], ["ny", "Anzahl Y"], ["b", "Abstand Y"]];
    const inputs = Object.fromEntries(fields.map(([k]) => [k, h("input", { class: "inp", value: last[k], spellcheck: "false", "data-k": k })]));
    const err = h("div", { class: "hint" });
    const cid = center?.pointId || uid("p");
    const build = (v) => {
      if (mode === "rot") {
        const n = Math.round(evaluate(v.n, scope)), total = evaluate(v.total, scope);
        // voller Kreis: n gleiche Teilungen, sonst Anfang und Ende besetzt
        const step = Math.abs(Math.abs(total) - 360) < 1e-9 ? `(${v.total})/${n}` : `(${v.total})/${Math.max(1, n - 1)}`;
        return { mode, center: cid, n, step };
      }
      return { mode, nx: Math.round(evaluate(v.nx, scope)), ny: Math.round(evaluate(v.ny, scope)), a: v.a, b: v.b };
    };
    const apply = (sk, opts) => {
      if (mode === "rot" && !center?.pointId && !sk.points.some((p) => p.id === cid)) {
        sk.points.push({ id: cid, x: center.x, y: center.y });
        sk.entities.push({ id: uid("pt"), type: "point", p: cid, construction: true });
      }
      return patternEntities(sk, ids, opts, { uid, scopeEval: (x) => evaluate(String(x), scope) });
    };
    modal({
      title: mode === "rot" ? "Kreismuster" : "Rechteckmuster",
      body: h("div", { class: "pattern-dlg" }, ...fields.map(([k, label]) => h("div", { class: "field" }, h("label", {}, label), inputs[k])), err),
      buttons: [{ label: "Abbrechen", value: null }, { label: "Muster erzeugen", primary: true, run: () => {
        const v = Object.fromEntries(fields.map(([k]) => [k, inputs[k].value.trim()]));
        let opts;
        try { opts = build(v); apply(JSON.parse(JSON.stringify(this.sk)), opts); } catch (e) { err.textContent = e.message; return false; }
        this.rememberValue(memo, v);
        this.commit(mode === "rot" ? "Kreismuster" : "Rechteckmuster", (sk) => apply(sk, opts));
        this.sel.clear();
        this.app.selectSketchItems([]);
        this.render();
        return true;
      } }],
    });
  }
  cancelInput() { if (this.inputBox) { this.inputBox.remove(); this.inputBox = null; } }
  editDimension(id, sx, sy) {
    const c = this.sk.constraints.find((k) => k.id === id);
    if (!c) return;
    if (c.driven) {
      choiceDialog("Getriebenes Maß", "Getriebene Maße zeigen nur an. In ein steuerndes Maß umwandeln?", [{ label: "Abbrechen", value: null }, { label: "Steuernd machen", value: "drive", primary: true }]).then((v) => {
        if (v !== "drive") return;
        const test = { ...c, driven: false, value: String(measureConstraint(this.sk, c)) };
        if (checkNewConstraint({ ...this.sk, constraints: this.sk.constraints.filter((k) => k.id !== id) }, test, this.scope()) !== "ok") return toast("Würde die Skizze überbestimmen", { kind: "err" });
        this.commit("Maß steuernd", (sk) => { const k = sk.constraints.find((q) => q.id === id); k.driven = false; });
      });
      return;
    }
    this.askValue(sx, sy, c.value, (val) => this.commit("Maß ändern", (sk) => { sk.constraints.find((k) => k.id === id).value = val; }));
  }

  // ---------- Projektion von Modellkanten ----------
  projectEdge(hit) {
    const info = hit.info;
    if (!info) return;
    const pk = this.viewer.findPickable(hit);
    if (!pk) return;
    const [s, c] = pk.lines.userData.edgeRanges[hit.edge];
    const arr = pk.lines.geometry.attributes.position.array;
    // Weltlage der Kante: Nachbarteile im Kontext (FU21) stehen mit eigener Matrix neben dem Bauteil
    pk.lines.updateMatrixWorld();
    const mw = pk.lines.matrixWorld.elements;
    const pts3 = [];
    for (let i = s; i < s + c; i++) {
      const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      pts3.push([0, 1, 2].map((k) => mw[k] * x + mw[4 + k] * y + mw[8 + k] * z + mw[12 + k]));
    }
    const loc = pts3.map((p) => toLocal(this.frame, p));
    const flat = loc.every((p) => Math.abs(p[2] - loc[0][2]) < 1e-3);
    if (info.type === "LINE" || !flat) {
      const a = loc[0], b = loc[loc.length - 1];
      this.commit("Kante projizieren", (sk) => {
        const p1 = uid("p"), p2 = uid("p");
        sk.points.push({ id: p1, x: a[0], y: a[1] }, { id: p2, x: b[0], y: b[1] });
        sk.entities.push({ id: uid("l"), type: "line", p1, p2, projected: true });
        sk.constraints.push({ id: uid("k"), type: "fix", p: p1, x: a[0], y: a[1] }, { id: uid("k"), type: "fix", p: p2, x: b[0], y: b[1] });
      });
    } else if (info.type === "CIRCLE") {
      const n = loc.length;
      const circ = circleFrom3(loc[0], loc[Math.floor(n / 3)], loc[Math.floor((2 * n) / 3)]);
      if (!circ) return;
      const closed = Math.hypot(loc[0][0] - loc[n - 1][0], loc[0][1] - loc[n - 1][1]) < 1e-3;
      this.commit("Kreis projizieren", (sk) => {
        const cid = uid("p");
        sk.points.push({ id: cid, x: circ.x, y: circ.y });
        sk.constraints.push({ id: uid("k"), type: "fix", p: cid, x: circ.x, y: circ.y });
        if (closed) {
          const eid = uid("k");
          sk.entities.push({ id: eid, type: "circle", c: cid, r: circ.r, projected: true });
          sk.constraints.push({ id: uid("m"), type: "radius", e: eid, value: String(round4(circ.r)), hidden: true });
        } else {
          const a = loc[0], b = loc[n - 1];
          const p1 = uid("p"), p2 = uid("p");
          // Orientierung gegen Uhrzeigersinn sicherstellen
          const m = loc[Math.floor(n / 2)];
          const cross = (a[0] - circ.x) * (m[1] - circ.y) - (a[1] - circ.y) * (m[0] - circ.x);
          const [s0, s1] = cross > 0 ? [a, b] : [b, a];
          sk.points.push({ id: p1, x: s0[0], y: s0[1] }, { id: p2, x: s1[0], y: s1[1] });
          sk.entities.push({ id: uid("b"), type: "arc", c: cid, p1, p2, projected: true });
          sk.constraints.push({ id: uid("k"), type: "fix", p: p1, x: s0[0], y: s0[1] }, { id: uid("k"), type: "fix", p: p2, x: s1[0], y: s1[1] });
        }
      });
    } else {
      // Kurve als Polylinie
      this.commit("Kante projizieren", (sk) => {
        let prev = null;
        for (const q of loc.filter((_, i) => i % 2 === 0 || i === loc.length - 1)) {
          const id = uid("p");
          sk.points.push({ id, x: q[0], y: q[1] });
          sk.constraints.push({ id: uid("k"), type: "fix", p: id, x: q[0], y: q[1] });
          if (prev) sk.entities.push({ id: uid("l"), type: "line", p1: prev, p2: id, projected: true });
          prev = id;
        }
      });
    }
  }

  // ---------- Maus ----------
  pointerDown(e) {
    if (e.button !== 0 || !this.active) return;
    this.noAuto = !!e.ctrlKey;
    if (this.viewer.handleCubeClick(e.clientX, e.clientY)) return;
    this.mapping();
    const [sx, sy] = this.eventPos(e);
    const [lx, ly] = this.L(sx, sy);
    const t = this.tool;
    if (t === "select") {
      const hit = this.hitTest(sx, sy);
      if (!hit) {
        if (!e.shiftKey) this.sel.clear();
        this.app.selectSketchItems([...this.sel]);
        // Fensterauswahl: nach rechts ziehen = ganz innen, nach links = berührend
        this.box = { x0: sx, y0: sy, x1: sx, y1: sy };
        this.canvas.setPointerCapture?.(e.pointerId);
        this.render();
        return;
      }
      const key = hit.kind === "point" ? "p:" + hit.id : hit.kind === "entity" ? "e:" + hit.id : "c:" + hit.id;
      if (e.shiftKey) { if (this.sel.has(key)) this.sel.delete(key); else this.sel.add(key); }
      else if (!this.sel.has(key)) { this.sel.clear(); this.sel.add(key); }
      this.app.selectSketchItems([...this.sel]);
      // Ziehen vorbereiten
      if (hit.kind === "point" || hit.kind === "entity" || hit.kind === "dim") {
        this.drag = { hit, start: [lx, ly], moved: false, snapshot: JSON.stringify(this.sk) };
        this.canvas.setPointerCapture?.(e.pointerId);
      }
      this.render();
      return;
    }
    if (t === "trim") {
      const hit = this.hitTest(sx, sy, { points: false, dims: false });
      if (hit?.kind !== "entity") return;
      // erst an einer Kopie prüfen, damit Fehlversuche keinen Rückgängig-Schritt erzeugen
      const test = JSON.parse(JSON.stringify(this.sk));
      const r = trimEntity(test, hit.id, { x: lx, y: ly }, uid);
      if (!r.ok) return toast(r.message);
      this.commit("Stutzen", (sk) => trimEntity(sk, hit.id, { x: lx, y: ly }, uid));
      if (r.dropped?.length) toast("Entfernt, weil nicht mehr gültig: " + [...new Set(r.dropped)].map((t) => ({ length: "Längenmaß", midpoint: "Mittelpunkt", equal: "Gleich" })[t] || t).join(", "));
      this.hover = null;
      this.render();
      return;
    }
    if (t === "extend" || t === "split") {
      const hit = this.hitTest(sx, sy, { points: false, dims: false });
      if (hit?.kind !== "entity") return toast("Linie oder Bogen anklicken");
      const [ox, oy] = this.L(sx, sy), [ux, uy] = this.L(sx + 10, sy);
      const tol = Math.hypot(ux - ox, uy - oy);
      const run = (sk) => (t === "extend" ? extendEntity(sk, hit.id, { x: lx, y: ly }, uid) : splitEntity(sk, hit.id, { x: lx, y: ly }, uid, tol));
      const r = run(JSON.parse(JSON.stringify(this.sk)));
      if (!r.ok) return toast(r.message);
      this.commit(t === "extend" ? "Verlängern" : "Teilen", run);
      if (r.dropped?.length) toast("Entfernt, weil nicht mehr gültig: " + [...new Set(r.dropped)].map((x) => ({ length: "Längenmaß", midpoint: "Mittelpunkt", equal: "Gleich" })[x] || x).join(", "));
      this.hover = null;
      this.render();
      return;
    }
    if (t === "sfillet" || t === "schamfer") {
      let best = null, bd = 14;
      for (const p of this.sk.points) {
        if (!cornerAt(this.sk, p.id)) continue;
        const [x, y] = this.S(p.x, p.y);
        const d = Math.hypot(x - sx, y - sy);
        if (d < bd) { bd = d; best = p.id; }
      }
      if (!best) return toast("Ecke anklicken, an der genau zwei Linien enden");
      if (t === "schamfer") {
        this.askValue(sx, sy, this.lastValue("fase") || "5", (val) => {
          const parts = String(val).split(";").map((x) => x.trim()).filter(Boolean);
          let d;
          try { d = parts.map((x) => evaluate(x, this.scope())); } catch (err) { return toast(err.message, { kind: "err" }); }
          const opts = { d2: d[1] ?? d[0], expr1: parts[0], expr2: parts[1] };
          const res = chamferCorner(JSON.parse(JSON.stringify(this.sk)), best, d[0], uid, opts);
          if (!res.ok) return toast(res.message, { kind: "err" });
          this.rememberValue("fase", val);
          this.commit("Skizzenfase", (sk) => chamferCorner(sk, best, d[0], uid, opts));
          if (res.dropped?.length) toast("Entfernt, weil nicht mehr gültig: " + [...new Set(res.dropped)].map((x) => ({ midpoint: "Mittelpunkt", equal: "Gleich" })[x] || x).join(", "));
        }, { allowList: true });
        return;
      }
      this.askValue(sx, sy, this.lastValue("rundung") || String(this.prefs?.["werkzeuge.std.rundung"] ?? 5), (val) => {
        const r = evaluate(val, this.scope());
        const test = JSON.parse(JSON.stringify(this.sk));
        const res = filletCorner(test, best, r, uid, val);
        if (!res.ok) return toast(res.message, { kind: "err" });
        this.rememberValue("rundung", val);
        this.commit("Skizzenrundung", (sk) => filletCorner(sk, best, r, uid, val));
        if (res.dropped?.length) toast("Entfernt, weil nicht mehr gültig: " + [...new Set(res.dropped)].map((t) => ({ midpoint: "Mittelpunkt", equal: "Gleich" })[t] || t).join(", "));
      });
      return;
    }
    if (t === "project") {
      const hit = this.viewer.pick(e.clientX, e.clientY, { edges: true, faces: false, ghosts: true });
      if (hit?.kind === "edge") this.projectEdge(hit);
      else toast("Keine Modellkante getroffen");
      return;
    }
    if (t === "dimension") {
      const hit = this.hitTest(sx, sy, { dims: false });
      const st = this.state;
      if (st && !st.locked && st.picks.length === 1 && hit && hit.id !== st.picks[0].id) {
        this.state = { picks: [...st.picks, hit], place: true, locked: true };
      } else if (st && st.place) {
        const c = this.dimensionFrom(st.picks, { x: lx, y: ly });
        this.state = null;
        if (c) this.finishDimension(c, sx, sy);
        else toast("Für diese Auswahl gibt es kein Maß");
      } else if (hit) {
        this.state = { picks: [hit], place: hit.kind === "entity", locked: false };
      } else this.state = null;
      this.render();
      return;
    }
    if (t === "offset") {
      const ids = [...this.sel].filter((k) => k.startsWith("e:")).map((k) => k.slice(2));
      if (!ids.length) {
        const hit = this.hitTest(sx, sy, { points: false, dims: false });
        if (hit?.kind !== "entity") return toast("Linie, Bogen oder Kreis der Kontur anklicken");
        for (const id of this.connectedChain(hit.id)) this.sel.add("e:" + id);
        this.app.selectSketchItems([...this.sel]);
        toast("Jetzt die Seite anklicken, zu der versetzt wird");
        this.render();
        return;
      }
      const pick = { x: lx, y: ly };
      this.askValue(sx, sy, this.lastValue("versatz") || String(this.prefs?.["werkzeuge.std.versatz"] ?? 5), (val) => {
        const d = evaluate(val, this.scope());
        try { offsetEntities(JSON.parse(JSON.stringify(this.sk)), ids, d, pick, { uid, value: val }); } catch (err) { return toast(err.message, { kind: "err" }); }
        this.rememberValue("versatz", val);
        this.commit("Versatz", (sk) => offsetEntities(sk, ids, d, pick, { uid, value: val }));
        this.sel.clear();
        this.app.selectSketchItems([]);
        this.render();
      });
      return;
    }
    if (t === "pattern" || t === "cpattern") {
      const ids = [...this.sel].filter((k) => k.startsWith("e:")).map((k) => k.slice(2));
      if (!ids.length) return toast("Zuerst die Elemente für das Muster wählen (Auswählen, Umschalt oder Fenster), dann hier klicken");
      const sn = t === "cpattern" ? this.snap(sx, sy) : null;
      this.patternDialog(t === "cpattern" ? "rot" : "lin", ids, sn);
      return;
    }
    if (t === "smove" || t === "scopy" || t === "srotate" || t === "sscale") {
      const ids = [...this.sel].filter((k) => k.startsWith("e:")).map((k) => k.slice(2));
      if (!ids.length) return toast("Zuerst die Elemente wählen (Auswählen, Umschalt oder Fenster), dann den Bezugspunkt klicken");
      this.transformDialog(t, ids, this.snap(sx, sy));
      return;
    }
    if (t === "mirror") {
      const hit = this.hitTest(sx, sy, { points: false, dims: false });
      const line = hit?.kind === "entity" && this.entity(hit.id)?.type === "line" ? hit.id : null;
      const ids = [...this.sel].filter((k) => k.startsWith("e:")).map((k) => k.slice(2)).filter((id) => id !== line);
      if (!line) return toast("Spiegellinie anklicken (eine Linie, gern als Konstruktionslinie)");
      if (!ids.length) return toast("Zuerst die zu spiegelnden Elemente wählen, dann die Spiegellinie anklicken");
      try { mirrorEntities(JSON.parse(JSON.stringify(this.sk)), ids, line, { uid }); } catch (err) { return toast(err.message, { kind: "err" }); }
      this.commit("Spiegeln", (sk) => mirrorEntities(sk, ids, line, { uid }));
      this.sel.clear();
      this.app.selectSketchItems([]);
      this.render();
      return;
    }
    if (GLYPH[t] || ["horizontal", "vertical", "coincident", "parallel", "perpendicular", "equal", "tangent", "fix", "midpoint", "concentric", "collinear", "symmetric"].includes(t)) {
      const hit = this.hitTest(sx, sy, { dims: false });
      this.pickForConstraint(hit);
      this.render();
      return;
    }
    const sn = this.snap(sx, sy);
    switch (t) {
      case "line":
        if (!this.state) this.state = { start: sn, dyn: createDynInput(["len", { key: "ang", signed: true }]) };
        else this.finishLine(sn);
        break;
      case "rect": case "rectc":
        if (!this.state) this.state = { start: sn, dyn: createDynInput(["w", "h"]) };
        else this.finishRect(sn);
        break;
      case "circle":
        if (!this.state) this.state = { start: sn, dyn: createDynInput(["d"]) };
        else this.finishCircle(sn);
        break;
      case "arc3":
        if (!this.state) this.state = { pts: [sn] };
        else if (this.state.pts.length === 1) this.state.pts.push(sn);
        else {
          const [a, b] = this.state.pts;
          const circ = circleFrom3([a.x, a.y], [sn.x, sn.y], [b.x, b.y]);
          if (circ) {
            const cross = (b.x - a.x) * (sn.y - a.y) - (b.y - a.y) * (sn.x - a.x);
            const center = { x: circ.x, y: circ.y };
            if (cross < 0) this.addArc(center, a, b); else this.addArc(center, b, a);
          }
          this.state = null;
        }
        break;
      case "spline": {
        if (!this.state) { this.state = { pts: [sn] }; break; }
        const first = this.state.pts[0], last = this.state.pts.at(-1);
        const [fx, fy] = this.S(first.x, first.y), [lx, ly] = this.S(last.x, last.y);
        if (this.state.pts.length >= 3 && Math.hypot(fx - sx, fy - sy) < this.snapR) { this.finishSpline(true); break; }
        if (Math.hypot(lx - sx, ly - sy) > 2) this.state.pts.push(sn);
        break;
      }
      case "ellipse": case "arcc":
        if (!this.state) this.state = { pts: [sn], dyn: createDynInput(["len", { key: "ang", signed: true }]) };
        else this.stepPolar(sn);
        break;
      case "point":
        this.addPoint(sn);
        break;
      case "circle3":
        if (!this.state) this.state = { pts: [sn] };
        else if (this.state.pts.length < 2) this.state.pts.push(sn);
        else { const pts = [...this.state.pts, sn]; this.state = null; this.addCircle3(pts); }
        break;
      case "arct": {
        if (!this.state) {
          const line = sn.pointId && this.sk.entities.find((e) => e.type === "line" && !e.origin && (e.p1 === sn.pointId || e.p2 === sn.pointId));
          if (!line) { toast("Ende einer Linie anklicken – dort schließt der Bogen tangential an"); break; }
          this.state = { start: sn, line: line.id };
          break;
        }
        const { start, line } = this.state;
        this.state = null;
        this.commitShape("Tangentialer Bogen", (sk) => buildTangentArc(sk, start.pointId, line, sn, { uid, usePoint: (s, p, cons) => this.usePoint(s, p, cons), construction: !!this.construction }));
        break;
      }
      case "text":
        this.addText(sn);
        break;
      case "image":
        this.addImage(sn);
        break;
      case "slot":
        if (!this.state) this.state = { pts: [sn], dyn: createDynInput(["len", { key: "ang", signed: true }]) };
        else this.stepPolar(sn);
        break;
      case "polygon":
        if (!this.state) this.state = { start: sn, dyn: createDynInput(["n", "r"]) };
        else this.finishPolygon(sn);
        break;
    }
    this.render();
  }
  selectAll() {
    if (!this.sk) return;
    this.sel = new Set(this.sk.entities.filter((e) => !e.origin).map((e) => "e:" + e.id));
    this.app.selectSketchItems([...this.sel]);
    this.render();
  }
  /** zusammenhängende Linien/Bögen über gemeinsame Punkte (Kreis: nur er selbst) */
  connectedChain(id) {
    const start = this.entity(id);
    if (!start || start.type === "circle" || start.type === "ellipse" || start.type === "point") return start ? [id] : [];
    const kind = !!start.construction;
    const pool = this.sk.entities.filter((e) => (e.type === "line" || e.type === "arc") && !e.origin && !!e.construction === kind);
    const out = new Set([id]), queue = [start];
    while (queue.length) {
      const e = queue.pop();
      for (const o of pool) if (!out.has(o.id) && [o.p1, o.p2].some((p) => p === e.p1 || p === e.p2)) { out.add(o.id); queue.push(o); }
    }
    return [...out];
  }
  /** Art automatischer Bedingungen erlaubt? (Einstellung; Strg unterdrückt alle) */
  autoOn(kind) { return !this.noAuto && this.prefs?.["skizze.auto." + kind] !== false; }
  autoKinds() { return { parallel: this.autoOn("parallel"), tangent: this.autoOn("tangential"), equal: this.autoOn("gleich") }; }
  autoTol() { return (this.snapR || 7) / (this.M?.scale || 1); }
  /** Endpunkt einer neuen Linie einrasten: horizontal/vertikal, sonst parallel/senkrecht/tangential/gleich */
  inferHV(a, b) {
    if (b.pointId || this.noAuto) return b;
    const dx = b.x - a.x, dy = b.y - a.y;
    const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    if (this.autoOn("hv")) {
      if (Math.min(ang, 180 - ang) < 2.5) return { ...b, y: a.y, on: null, mid: null, inferred: "H" };
      if (Math.abs(90 - ang) < 2.5) return { ...b, x: a.x, on: null, mid: null, inferred: "V" };
    }
    const r = inferLine(this.sk, a, b, { tolLen: this.autoTol(), kinds: this.autoKinds() });
    return r ? { ...r.b, inferred: r.glyph, auto: r.cons } : b;
  }
  pointerMove(e) {
    if (!this.active) return;
    this.noAuto = !!e.ctrlKey;
    this.mapping();
    const [sx, sy] = this.eventPos(e);
    const [lx, ly] = this.L(sx, sy);
    this.mouse = { sx, sy, lx, ly };
    if (this.box) {
      this.box.x1 = sx; this.box.y1 = sy;
      this.render();
      return;
    }
    if (this.drag) {
      const d = this.drag;
      if (!d.moved && Math.hypot(lx - d.start[0], ly - d.start[1]) * this.M.scale < 3) return;
      if (!d.moved) { d.moved = true; this.app.checkpoint("Ziehen"); }
      this.dragTo(d, lx, ly, e);
      this.render();
      return;
    }
    if (this.tool === "project") {
      const hit = this.viewer.pick(e.clientX, e.clientY, { edges: true, faces: false, ghosts: true });
      this.viewer.highlight(hit ? [hit] : []);
    }
    this.hover = this.hitTest(sx, sy, { dims: this.tool === "select" });
    if (!["select", "dimension", "project", "trim", "extend", "split", "sfillet", "schamfer", "pattern"].includes(this.tool) && !GLYPH[this.tool]) this.snapInfo = this.snap(sx, sy);
    else this.snapInfo = null;
    this.render();
  }
  dragTo(d, lx, ly) {
    const sk = this.sk;
    const P = this.pts();
    const hit = d.hit;
    if (hit.kind === "dim") {
      const c = sk.constraints.find((k) => k.id === hit.id);
      if (!c) return;
      if (c.type === "radius" || c.type === "diameter") { const e = this.entity(c.e); const cc = P.get(e.c); c.labelAngle = Math.atan2(ly - cc.y, lx - cc.x); return; }
      if (c.type === "semiAxis" || c.type === "axisAngle") return;
      if (c.type === "lineAngle") { const e = this.entity(c.e), a = e && P.get(e.p1); if (a) c.labelOffset = Math.max(8 / this.M.scale, Math.hypot(lx - a.x, ly - a.y)); return; }
      if (c.type === "angle") { c.labelOffset = Math.max(5 / this.M.scale, Math.hypot(lx - d.start[0], ly - d.start[1]) + (c._base ?? (c._base = c.labelOffset || 20))); return; }
      const [a, b] = this.dimPoints(c, P);
      if (!a || !b) return;
      c.labelOffset = this.offsetFor(a, b, { x: lx, y: ly }, c.type === "length" ? "a" : c.dir || "a");
      return;
    }
    const dx = lx - d.start[0], dy = ly - d.start[1];
    let targets = [];
    if (hit.kind === "point") targets = [{ p: hit.id, x: lx, y: ly }];
    else {
      const e = this.entity(hit.id);
      if (!d.orig) d.orig = JSON.parse(d.snapshot).points;
      const O = new Map(d.orig.map((p) => [p.id, p]));
      if (e.type === "line") targets = [e.p1, e.p2].map((p) => ({ p, x: O.get(p).x + dx, y: O.get(p).y + dy }));
      else if (e.type === "circle") {
        // Radius ziehen
        const c = P.get(e.c);
        const r = Math.hypot(lx - c.x, ly - c.y);
        const before = e.r;
        e.r = r;
        const res = solveSketch(sk, this.scope(), { computeDof: false });
        if (!res.ok) e.r = before;
        this.profiles = extractProfiles(sk, { vars: this.textVars() });
        return;
      } else if (e.type === "arc") targets = [e.c, e.p1, e.p2].map((p) => ({ p, x: O.get(p).x + dx, y: O.get(p).y + dy }));
      else if (e.type === "spline") targets = [...new Set(e.pts)].map((p) => ({ p, x: O.get(p).x + dx, y: O.get(p).y + dy }));
      else if (e.type === "ellipse") targets = [e.c, e.a].map((p) => ({ p, x: O.get(p).x + dx, y: O.get(p).y + dy }));
      else if (e.type === "point") targets = [{ p: e.p, x: lx, y: ly }];
      else if (e.type === "text" || e.type === "image") targets = [{ p: e.p, x: O.get(e.p).x + dx, y: O.get(e.p).y + dy }];
    }
    const keep = JSON.stringify(sk.points.concat(sk.entities.filter((x) => x.type === "circle" || x.type === "ellipse").map((x) => ({ id: x.id, r: x.r }))));
    const extra = targets.map((t, i) => ({ id: "drag" + i, type: "target", p: t.p, x: t.x, y: t.y, w: 0.05 }));
    solveSketch(sk, this.scope(), { extra, computeDof: false, writeOnFail: true, maxIterations: 40 });
    const r2 = solveSketch(sk, this.scope(), { computeDof: false, maxIterations: 40 });
    if (!r2.ok) {
      const old = JSON.parse(keep);
      const m = new Map(old.map((o) => [o.id, o]));
      for (const p of sk.points) { const o = m.get(p.id); if (o) { p.x = o.x; p.y = o.y; } }
      for (const c of sk.entities) if ((c.type === "circle" || c.type === "ellipse") && m.get(c.id)) c.r = m.get(c.id).r;
    }
    this.profiles = extractProfiles(sk, { vars: this.textVars() });
  }
  pointerUp(e) {
    if (!this.active) return;
    if (this.box) {
      const b = this.box;
      this.box = null;
      if (Math.abs(b.x1 - b.x0) > 4 || Math.abs(b.y1 - b.y0) > 4) {
        for (const id of entitiesInBox(this.sk, (x, y) => this.S(x, y), b, b.x1 < b.x0)) this.sel.add("e:" + id);
        this.app.selectSketchItems([...this.sel]);
      }
      this.render();
      return;
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.moved) {
        for (const c of this.sk.constraints) delete c._base;
        this.solve();
        this.app.changed({ rebuild: false });
      }
      this.render();
    }
  }
  dblClick(e) {
    if (!this.active) return;
    this.mapping();
    const [sx, sy] = this.eventPos(e);
    if (this.tool === "spline" && this.state?.pts) { this.finishSpline(false); return; }
    const hit = this.hitTest(sx, sy);
    if (hit?.kind === "dim") this.editDimension(hit.id, sx, sy);
    else if (hit?.kind === "entity" && this.entity(hit.id)?.type === "text") this.editText(hit.id);
    else if (hit?.kind === "entity" && this.entity(hit.id)?.type === "image") this.editImage(hit.id);
    else if (hit?.kind === "point") {
      // Ankerpunkt eines Textes: ebenfalls Text bearbeiten
      const t = this.sk.entities.find((x) => (x.type === "text" || x.type === "image") && x.p === hit.id);
      if (t) (t.type === "text" ? this.editText(t.id) : this.editImage(t.id));
    }
  }
  key(e) {
    if (!this.active || this.inputBox) return false;
    const k = e.key;
    // Dynamische Maßeingabe beim Rechteck: Tippen geht ins aktive Feld, Tab wechselt, Enter erzeugt
    if (this.state?.dyn && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const r = dynKey(this.state.dyn, k, { shift: e.shiftKey });
      if (r === "commit") {
        const m = this.mouse;
        if (m) { this.mapping(); this.finishDyn(this.snapInfo || { x: m.lx, y: m.ly }); }
        this.render();
        return true;
      }
      if (r) { this.render(); return true; }
    }
    if (this.tool === "spline" && this.state?.pts && (k === "Enter" || k === "Escape")) { this.finishSpline(false); return true; }
    if (k === "Escape") {
      if (this.state) { this.state = null; this.render(); return true; }
      // wie Inventor: erst die Auswahl aufheben, erst bei leerer Auswahl die Skizze beenden
      if (this.tool === "select" && this.sel.size) { this.sel.clear(); this.app.selectSketchItems([]); this.render(); return true; }
      if (this.tool !== "select") { this.setTool("select"); return true; }
      this.app.finishSketch();
      return true;
    }
    if (k === "Delete" || k === "Backspace") { this.deleteSelection(); return true; }
    // Werkzeug-Tasten (L, R, C …) kommen aus der Befehlsliste (src/core/commands.js), anpassbar
    return false;
  }
  deleteSelection() {
    if (!this.sel.size) return;
    const ents = [], cons = [], pts = [];
    for (const s of this.sel) {
      const [t, id] = [s.slice(0, 1), s.slice(2)];
      if (t === "e") ents.push(id);
      if (t === "c") cons.push(id);
      if (t === "p") pts.push(id);
    }
    if (pts.includes("O")) pts.splice(pts.indexOf("O"), 1);
    this.commit("Löschen", (sk) => {
      // Punkte: zugehörige Elemente mitlöschen
      for (const p of pts) for (const e of sk.entities) if (([e.p1, e.p2, e.c, e.p, e.a].includes(p) || e.pts?.includes(p)) && !e.origin) ents.push(e.id);
      sk.constraints = sk.constraints.filter((c) => !cons.includes(c.id));
      deleteEntities(sk, ents.filter((id) => id !== "Oe"));
    });
    this.sel.clear();
    this.app.selectSketchItems([]);
    this.render();
  }
  toggleConstruction() {
    const ents = [...this.sel].filter((s) => s.startsWith("e:")).map((s) => s.slice(2));
    if (!ents.length) {
      this.construction = !this.construction;
      toast(this.construction ? "Neue Elemente als Konstruktionslinien" : "Neue Elemente als normale Linien");
      this.app.refreshRibbon();
      return;
    }
    this.commit("Konstruktion", (sk) => {
      for (const e of sk.entities) if (ents.includes(e.id) && !e.origin) e.construction = !e.construction;
    });
  }

  // ---------- Darstellung ----------
  dimPoints(c, P) {
    if (c.type === "length") { const e = this.entity(c.e); return e ? [P.get(e.p1), P.get(e.p2)] : []; }
    if (c.type === "distance" && c.q) return [P.get(c.p), P.get(c.q)];
    return [];
  }
  render() {
    if (!this.active || !this.sk) return;
    this.mapping();
    const svg = this.svg;
    svg.replaceChildren();
    const sk = this.sk;
    const P = this.pts();
    const S = (x, y) => this.S(x, y);
    const full = this.lastSolve && this.lastSolve.dof === 0;
    // Bestimmtheit je Element (nur nach erfolgreichem Lösen aussagekräftig)
    const free = this.lastSolve?.ok ? this.lastSolve.free : null;
    const isSel = (k) => this.sel.has(k);
    const hov = this.hover;
    const pend = new Set((this.pendingPick || []).map((x) => x.id).concat((this.state?.picks || []).map((x) => x.id)));
    const g = svgEl("g");
    svg.append(g);
    // Achsen der Skizze
    const ax = svgEl("g", { opacity: 0.5 });
    const [ox, oy] = S(0, 0);
    ax.append(svgEl("line", { x1: ox - 4000, y1: oy, x2: ox + 4000, y2: oy, stroke: "#d23b2a", "stroke-width": 0.8, "stroke-dasharray": "8 4" }));
    const [vx, vy] = S(0, 1);
    const dirY = [vx - ox, vy - oy];
    const ly = Math.hypot(...dirY) || 1;
    ax.append(svgEl("line", { x1: ox - (dirY[0] / ly) * 4000, y1: oy - (dirY[1] / ly) * 4000, x2: ox + (dirY[0] / ly) * 4000, y2: oy + (dirY[1] / ly) * 4000, stroke: "#2e9d4a", "stroke-width": 0.8, "stroke-dasharray": "8 4" }));
    g.append(ax);
    if (this.gridSnap) this.renderGrid(g);
    if (this.box) {
      const b = this.box;
      svg.append(svgEl("rect", { class: "sk-box" + (b.x1 < b.x0 ? " cross" : ""), x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1), width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0) }));
    }
    const openPts = new Set(this.profiles?.openPoints || []);
    // Bilder (FU2) ganz hinten: Einheitsquadrat per Matrix auf die gedrehten Ecken
    for (const e of sk.entities) {
      if (e.type !== "image") continue;
      const c = imageCorners(e, P.get(e.p));
      if (!c) continue;
      const [BL, BR, , TL] = c.map(([x, y]) => S(x, y));
      const src = this.app.project.images?.[e.img]?.src;
      const sel = isSel("e:" + e.id) || (hov?.kind === "entity" && hov.id === e.id);
      if (src) g.append(svgEl("image", { href: src, x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: "none", opacity: e.opacity ?? 0.5,
        transform: `matrix(${BR[0] - BL[0]},${BR[1] - BL[1]},${BL[0] - TL[0]},${BL[1] - TL[1]},${TL[0]},${TL[1]})`, class: "sk-image" }));
      if (!src || sel) g.append(svgEl("path", { d: "M" + c.map(([x, y]) => S(x, y).join(",")).join("L") + "Z", class: "sk-ctrl" + (src ? "" : " missing") }));
    }
    // Elemente
    for (const e of sk.entities) {
      if (e.type === "image") continue;
      const key = "e:" + e.id;
      const cls = ["sk-line"];
      if (e.construction) cls.push("constr");
      else if (full) cls.push("full");
      else if (free) cls.push(entityFree(e, free) ? "free" : "full");
      if (isSel(key) || pend.has(e.id)) cls.push("sel");
      else if (hov?.kind === "entity" && hov.id === e.id) cls.push("hover");
      let d = null;
      if (e.type === "line") {
        const a = P.get(e.p1), b = P.get(e.p2);
        const A = S(a.x, a.y), B = S(b.x, b.y);
        d = `M${A[0]},${A[1]}L${B[0]},${B[1]}`;
      } else if (e.type === "circle") {
        const c = P.get(e.c);
        const C = S(c.x, c.y), r = e.r * this.M.scale;
        d = `M${C[0] - r},${C[1]}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
      } else if (e.type === "spline") {
        const ctrl = splineCtrl(e, P);
        if (ctrl) {
          d = "M" + splineSamples(ctrl, 24).map((q) => S(q[0], q[1]).join(",")).join("L");
          g.append(svgEl("path", { d: "M" + ctrl.map((q) => S(q[0], q[1]).join(",")).join("L"), class: "sk-ctrl" })); // Kontrollpolygon
        }
      } else if (e.type === "ellipse") {
        d = "M" + ellipseSamples(this.ellG(e, P), 96).map((q) => S(q[0], q[1]).join(",")).join("L") + "Z";
      } else if (e.type === "text") {
        const vars = this.textVars();
        d = textPolylines(e, P.get(e.p), vars, 6).map((pl) => "M" + pl.map((q) => S(q[0], q[1]).join(",")).join("L") + "Z").join("") || null;
        if (cls.includes("sel") || cls.includes("hover")) {
          const b = textBox(e, P.get(e.p), vars);
          if (b) g.append(svgEl("path", { d: "M" + b.map((q) => S(q[0], q[1]).join(",")).join("L") + "Z", class: "sk-ctrl" }));
        }
      } else if (e.type === "arc") {
        const c = P.get(e.c), p1 = P.get(e.p1), p2 = P.get(e.p2);
        const geo = arcGeometry(c, p1, p2);
        const A = S(p1.x, p1.y), B = S(p2.x, p2.y), r = geo.r * this.M.scale;
        const large = geo.sweep > Math.PI ? 1 : 0;
        const sweepFlag = this.M.det > 0 ? 1 : 0;
        d = `M${A[0]},${A[1]}A${r},${r} 0 ${large},${sweepFlag} ${B[0]},${B[1]}`;
      }
      if (d) g.append(svgEl("path", { d, class: cls.join(" ") }));
    }
    // Punkte
    const pointEnt = new Map();
    for (const e of sk.entities) if (e.type === "point") pointEnt.set(e.p, e);
    const fixed = new Set(sk.constraints.filter((c) => c.type === "fix").map((c) => c.p));
    for (const p of sk.points) {
      const [x, y] = S(p.x, p.y);
      const pe = pointEnt.get(p.id);
      if (pe?.origin) { g.append(svgEl("circle", { cx: x, cy: y, r: 4, class: "sk-origin" })); continue; }
      const cls = ["sk-pt"];
      if (fixed.has(p.id)) cls.push("fixed");
      else if (free?.points.has(p.id)) cls.push("free");
      if (openPts.has(p.id)) cls.push("open");
      if (isSel("p:" + p.id) || pend.has(p.id)) cls.push("sel");
      else if (hov?.kind === "point" && hov.id === p.id) cls.push("hover");
      if (pe && !pe.construction) {
        g.append(svgEl("circle", { cx: x, cy: y, r: 5, class: cls.join(" ") + " hole" }));
        g.append(svgEl("path", { d: `M${x - 7},${y}h14M${x},${y - 7}v14`, class: "sk-line" }));
      } else g.append(svgEl("circle", { cx: x, cy: y, r: 2.8, class: cls.join(" ") }));
    }
    // Freiheitsgrade: Doppelpfeile an Punkten, die sich noch bewegen lassen
    if (this.showDof && free?.dirs) {
      let dd = "";
      for (const [pid, dirs] of free.dirs) {
        const p = P.get(pid);
        if (!p || pid === "O") continue;
        const [x, y] = S(p.x, p.y);
        for (const [ux, uy] of dirs) {
          const [qx, qy] = S(p.x + ux, p.y + uy), L = Math.hypot(qx - x, qy - y) || 1, dx = (qx - x) / L, dy = (qy - y) / L;
          for (const s of [1, -1]) {
            const ex = x + s * dx * 18, ey = y + s * dy * 18;
            dd += `M${x + s * dx * 5},${y + s * dy * 5}L${ex},${ey}l${-s * (dx * 5 - dy * 3)},${-s * (dy * 5 + dx * 3)}M${ex},${ey}l${-s * (dx * 5 + dy * 3)},${-s * (dy * 5 - dx * 3)}`;
          }
        }
      }
      if (dd) g.append(svgEl("path", { d: dd, class: "sk-dof" }));
    }
    // Bemaßungen und Abhängigkeiten
    this.dimBoxes = [];
    this.glyphBoxes = [];
    for (const c of sk.constraints) {
      if (DIMENSION_TYPES.has(c.type) && !c.hidden) this.renderDim(g, c, P);
    }
    if (this.showGlyphs) this.renderGlyphs(g, P);
    // Vorschau
    this.renderPreview(g, P);
  }
  renderGrid(g) {
    // feste Rasterweite: bei kleinem Zoom nur jede n-te Linie zeichnen (Fang bleibt auf der Rasterweite)
    const step = this.gridFixed ? this.gridFixed * Math.max(1, Math.ceil(8 / (this.gridFixed * this.M.scale))) : gridStep(this.M.scale);
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    const [x0, y0] = this.L(0, hgt), [x1, y1] = this.L(w, 0);
    const gx = svgEl("g", { class: "sk-grid" });
    const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
    let n = 0;
    for (let x = Math.ceil(lo(x0, x1) / step) * step; x <= hi(x0, x1) && n < 400; x += step, n++) {
      const A = this.S(x, lo(y0, y1)), B = this.S(x, hi(y0, y1));
      gx.append(svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1] }));
    }
    for (let y = Math.ceil(lo(y0, y1) / step) * step; y <= hi(y0, y1) && n < 800; y += step, n++) {
      const A = this.S(lo(x0, x1), y), B = this.S(hi(x0, x1), y);
      gx.append(svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1] }));
    }
    g.append(gx);
  }
  dimText(c) {
    const scope = this.scope();
    let v = NaN;
    try { v = c.driven ? measureConstraint(this.sk, c) : evaluate(c.value, scope); } catch { /* */ }
    const num = fmtNum(v, 2);
    const isExpr = !c.driven && !/^\s*-?[\d.,]+\s*$/.test(String(c.value));
    let t = c.type === "diameter" ? "Ø" + num : c.type === "radius" ? "R" + num : c.type === "angle" || c.type === "axisAngle" || c.type === "lineAngle" ? num + "°" : c.type === "semiAxis" ? `${c.axis === "b" ? "b" : "a"} ${num}` : num;
    if (isExpr) t = `fx: ${t}`;
    if (c.driven) t = `(${t})`;
    return t;
  }
  renderDim(g, c, P, preview = false) {
    const sel = preview || this.sel.has("c:" + c.id);
    const bad = this.lastSolve?.failed?.includes(c.id) || this.flash?.has(c.id);
    const cls = "sk-dim" + (c.driven ? " driven" : "") + (c.disabled ? " off" : "") + (bad ? " err" : "") + (preview ? " preview" : "");
    const grp = svgEl("g");
    const text = this.dimText(c);
    let tx, ty, rot = 0;
    const arrow = (x, y, dx, dy) => {
      const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      return `M${x},${y}l${-ux * 8 + uy * 3},${-uy * 8 - ux * 3}M${x},${y}l${-ux * 8 - uy * 3},${-uy * 8 + ux * 3}`;
    };
    if (c.type === "length" || (c.type === "distance" && c.q)) {
      const [a, b] = this.dimPoints(c, P);
      if (!a || !b) return;
      const dir = c.type === "length" ? "a" : c.dir || "a";
      const off = c.labelOffset ?? 10 / this.M.scale;
      let A1, B1;
      if (dir === "h") { const y = (off >= 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y)) + off; A1 = [a.x, y]; B1 = [b.x, y]; }
      else if (dir === "v") { const x = (off >= 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x)) + off; A1 = [x, a.y]; B1 = [x, b.y]; }
      else {
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const n = [-dy / L, dx / L];
        A1 = [a.x + n[0] * off, a.y + n[1] * off]; B1 = [b.x + n[0] * off, b.y + n[1] * off];
      }
      const sa = this.S(a.x, a.y), sb = this.S(b.x, b.y), s1 = this.S(...A1), s2 = this.S(...B1);
      const ext = (p, q) => {
        const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
        if (L < 1) return "";
        return `M${p[0] + (dx / L) * 3},${p[1] + (dy / L) * 3}L${q[0] + (dx / L) * 4},${q[1] + (dy / L) * 4}`;
      };
      const dx = s2[0] - s1[0], dy = s2[1] - s1[1];
      grp.append(svgEl("path", { class: cls, d: ext(sa, s1) + ext(sb, s2) + `M${s1[0]},${s1[1]}L${s2[0]},${s2[1]}` + arrow(s1[0], s1[1], -dx, -dy) + arrow(s2[0], s2[1], dx, dy) }));
      tx = (s1[0] + s2[0]) / 2; ty = (s1[1] + s2[1]) / 2;
      rot = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (rot > 90) rot -= 180;
      if (rot < -90) rot += 180;
    } else if (c.type === "distance" && c.e) {
      const e = this.entity(c.e), p = P.get(c.p);
      if (!e || !p) return;
      const a = P.get(e.p1), b = P.get(e.p2);
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
      const f = [a.x + t * dx, a.y + t * dy];
      const sp = this.S(p.x, p.y), sf = this.S(...f);
      const ddx = sf[0] - sp[0], ddy = sf[1] - sp[1];
      grp.append(svgEl("path", { class: cls, d: `M${sp[0]},${sp[1]}L${sf[0]},${sf[1]}` + arrow(sf[0], sf[1], ddx, ddy) + arrow(sp[0], sp[1], -ddx, -ddy) }));
      tx = (sp[0] + sf[0]) / 2; ty = (sp[1] + sf[1]) / 2;
      rot = (Math.atan2(ddy, ddx) * 180) / Math.PI;
      if (rot > 90) rot -= 180;
      if (rot < -90) rot += 180;
    } else if (c.type === "offset") {
      const e1 = this.entity(c.e1), e2 = this.entity(c.e2);
      if (!e1 || !e2) return;
      let p, f;
      if (e1.type === "line") {
        const a2 = P.get(e2.p1), b2 = P.get(e2.p2), a = P.get(e1.p1), b = P.get(e1.p2);
        p = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
        f = { x: a.x + t * dx, y: a.y + t * dy };
      } else {
        const cc = P.get(e1.c);
        const rad = (e) => (e.type === "circle" ? e.r : Math.hypot(P.get(e.p1).x - cc.x, P.get(e.p1).y - cc.y));
        let ang = Math.PI / 4;
        if (e2.type === "arc") { const a1 = P.get(e2.p1), a2 = P.get(e2.p2); let t1 = Math.atan2(a1.y - cc.y, a1.x - cc.x), sw = Math.atan2(a2.y - cc.y, a2.x - cc.x) - t1; while (sw <= 1e-12) sw += 2 * Math.PI; ang = t1 + sw / 2; }
        p = { x: cc.x + rad(e2) * Math.cos(ang), y: cc.y + rad(e2) * Math.sin(ang) };
        f = { x: cc.x + rad(e1) * Math.cos(ang), y: cc.y + rad(e1) * Math.sin(ang) };
      }
      const sp = this.S(p.x, p.y), sf = this.S(f.x, f.y);
      const ddx = sf[0] - sp[0], ddy = sf[1] - sp[1];
      grp.append(svgEl("path", { class: cls, d: `M${sp[0]},${sp[1]}L${sf[0]},${sf[1]}` + arrow(sf[0], sf[1], ddx, ddy) + arrow(sp[0], sp[1], -ddx, -ddy) }));
      tx = (sp[0] + sf[0]) / 2; ty = (sp[1] + sf[1]) / 2;
      rot = (Math.atan2(ddy, ddx) * 180) / Math.PI;
      if (rot > 90) rot -= 180;
      if (rot < -90) rot += 180;
    } else if (c.type === "semiAxis" || c.type === "axisAngle") {
      const e = this.entity(c.e);
      if (!e) return;
      const g = this.ellG(e, P), sc = this.S(g.cx, g.cy);
      if (c.type === "semiAxis") {
        const q = c.axis === "b" ? ellipsePoint(g, Math.PI / 2) : ellipsePoint(g, 0), sq = this.S(q.x, q.y);
        grp.append(svgEl("path", { class: cls, d: `M${sc[0]},${sc[1]}L${sq[0]},${sq[1]}` + arrow(sq[0], sq[1], sq[0] - sc[0], sq[1] - sc[1]) }));
        tx = (sc[0] + sq[0]) / 2; ty = (sc[1] + sq[1]) / 2;
        rot = (Math.atan2(sq[1] - sc[1], sq[0] - sc[0]) * 180) / Math.PI;
      } else {
        const r = g.A * 0.45, n = 16, pts = [];
        for (let i = 0; i <= n; i++) { const t = (g.rot * i) / n; pts.push(this.S(g.cx + r * Math.cos(t), g.cy + r * Math.sin(t))); }
        const ref = this.S(g.cx + r * 1.2, g.cy);
        grp.append(svgEl("path", { class: cls, d: `M${sc[0]},${sc[1]}L${ref[0]},${ref[1]}M` + pts.map((q) => q.join(",")).join("L") }));
        // Text unterhalb der Winkelhalbierenden, damit er nicht auf dem Maß der Halbachse a liegt
        [tx, ty] = this.S(g.cx + r * 0.75 * Math.cos(g.rot / 2 - 0.4), g.cy + r * 0.75 * Math.sin(g.rot / 2 - 0.4));
      }
      if (rot > 90) rot -= 180;
      if (rot < -90) rot += 180;
    } else if (c.type === "radius" || c.type === "diameter") {
      const e = this.entity(c.e);
      if (!e) return;
      const cc = P.get(e.c);
      const r = e.type === "circle" ? e.r : Math.hypot(P.get(e.p1).x - cc.x, P.get(e.p1).y - cc.y);
      const ang = c.labelAngle ?? Math.PI / 4;
      const pOn = [cc.x + r * Math.cos(ang), cc.y + r * Math.sin(ang)];
      const pOut = [cc.x + (r + 14 / this.M.scale) * Math.cos(ang), cc.y + (r + 14 / this.M.scale) * Math.sin(ang)];
      const sc = this.S(cc.x, cc.y), so = this.S(...pOn), sx = this.S(...pOut);
      const start = c.type === "diameter" ? this.S(cc.x - r * Math.cos(ang), cc.y - r * Math.sin(ang)) : sc;
      grp.append(svgEl("path", { class: cls, d: `M${start[0]},${start[1]}L${sx[0]},${sx[1]}` + arrow(so[0], so[1], so[0] - sc[0], so[1] - sc[1]) }));
      tx = sx[0] + (sx[0] >= sc[0] ? 4 : -4); ty = sx[1];
      grp.append(textEl(text, tx, ty, 0, "sk-dim-text" + (c.driven ? " driven" : "") + (c.disabled ? " off" : "") + (sel ? " sel" : "") + (bad ? " err" : "") + (preview ? " preview" : ""), sx[0] >= sc[0] ? "start" : "end"));
      g.append(grp);
      const bb = estimateBox(text, tx, ty, sx[0] >= sc[0] ? "start" : "end");
      this.dimBoxes.push({ id: c.id, ...bb });
      return;
    } else if (c.type === "lineAngle") {
      // Bogen am Linienanfang von der x-Richtung bis zur Linie, kurze waagrechte Bezugslinie
      const e = this.entity(c.e);
      if (!e) return;
      const a = P.get(e.p1), b = P.get(e.p2);
      const r = c.labelOffset || 34 / this.M.scale, t = Math.atan2(b.y - a.y, b.x - a.x), sweep = t < 0 ? t + 2 * Math.PI : t;
      const n = 32, pts = [];
      for (let i = 0; i <= n; i++) { const q = (sweep * i) / n; pts.push(this.S(a.x + r * Math.cos(q), a.y + r * Math.sin(q))); }
      const sa = this.S(a.x, a.y), ref = this.S(a.x + r * 1.15, a.y), end = pts[n], prev = pts[n - 1];
      grp.append(svgEl("path", { class: cls, d: `M${sa[0]},${sa[1]}L${ref[0]},${ref[1]}M` + pts.map((p) => p.join(",")).join("L") + arrow(end[0], end[1], end[0] - prev[0], end[1] - prev[1]) }));
      [tx, ty] = this.S(a.x + (r + 12 / this.M.scale) * Math.cos(sweep / 2), a.y + (r + 12 / this.M.scale) * Math.sin(sweep / 2));
    } else if (c.type === "angle") {
      const e1 = this.entity(c.e1), e2 = this.entity(c.e2);
      if (!e1 || !e2) return;
      const a1 = P.get(e1.p1), b1 = P.get(e1.p2), a2 = P.get(e2.p1), b2 = P.get(e2.p2);
      const X = lineIntersect(a1, b1, a2, b2) || { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
      const r = c.labelOffset || 30 / this.M.scale;
      let t1 = Math.atan2(b1.y - a1.y, b1.x - a1.x), t2 = Math.atan2(b2.y - a2.y, b2.x - a2.x);
      // gemessener Winkel liegt zwischen den Richtungen (< 180°)
      let d = t2 - t1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const n = 24, pts = [];
      for (let i = 0; i <= n; i++) { const t = t1 + (d * i) / n; pts.push(this.S(X.x + r * Math.cos(t), X.y + r * Math.sin(t))); }
      grp.append(svgEl("path", { class: cls, d: "M" + pts.map((p) => p.join(",")).join("L") }));
      const tm = t1 + d / 2;
      [tx, ty] = this.S(X.x + (r + 10 / this.M.scale) * Math.cos(tm), X.y + (r + 10 / this.M.scale) * Math.sin(tm));
    }
    if (tx === undefined) return;
    const anchorUp = 4;
    const nx = Math.sin((rot * Math.PI) / 180) * anchorUp, ny = -Math.cos((rot * Math.PI) / 180) * anchorUp;
    grp.append(textEl(text, tx + nx, ty + ny, rot, "sk-dim-text" + (c.driven ? " driven" : "") + (c.disabled ? " off" : "") + (sel ? " sel" : "") + (bad ? " err" : "") + (preview ? " preview" : ""), "middle"));
    g.append(grp);
    this.dimBoxes.push({ id: c.id, ...estimateBox(text, tx + nx, ty + ny - 4, "middle") });
  }
  renderGlyphs(g, P) {
    const sk = this.sk;
    const slots = new Map(); // Element -> Anzahl Glyphen
    const anchor = (c) => {
      const E = (id) => this.entity(id);
      if (c.e && E(c.e)?.type === "line" && !c.p) { const e = E(c.e); const a = P.get(e.p1), b = P.get(e.p2); return { key: c.e, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, nx: -(b.y - a.y), ny: b.x - a.x }; }
      if (c.e1) {
        const e = E(c.e1);
        if (!e) return null;
        if (e.type === "line") { const a = P.get(e.p1), b = P.get(e.p2); return { key: c.e1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, nx: -(b.y - a.y), ny: b.x - a.x }; }
        const cc = P.get(e.c); return { key: c.e1, x: cc.x, y: cc.y, nx: 0, ny: 1 };
      }
      if (c.p) { const p = P.get(c.p); if (!p) return null; return { key: c.p, x: p.x, y: p.y, nx: 1, ny: -1 }; }
      return null;
    };
    for (const c of sk.constraints) {
      const label = GLYPH[c.type];
      if (!label || c.id === "Of" || c.hidden) continue;
      // implizite Bedingungen projizierter Geometrie nicht anzeigen
      const a = anchor(c);
      if (!a) continue;
      const n = slots.get(a.key) || 0;
      slots.set(a.key, n + 1);
      const [x, y] = this.S(a.x, a.y);
      const nl = Math.hypot(a.nx, a.ny) || 1;
      const [px, py] = this.S(a.x + a.nx / nl, a.y + a.ny / nl);
      const ux = (px - x) / (Math.hypot(px - x, py - y) || 1), uy = (py - y) / (Math.hypot(px - x, py - y) || 1);
      const gx = x + ux * 14 + n * 16, gy = y + uy * 14;
      const w = label.length > 1 ? 20 : 13;
      const sel = this.sel.has("c:" + c.id);
      const grp = svgEl("g", { class: "sk-glyph" + (sel ? " sel" : "") + (c.disabled ? " off" : "") + (this.lastSolve?.failed?.includes(c.id) || this.flash?.has(c.id) ? " err" : "") });
      grp.append(svgEl("rect", { x: gx - w / 2, y: gy - 7, width: w, height: 13, rx: 2 }));
      const t = svgEl("text", { x: gx, y: gy + 3.5, "text-anchor": "middle" });
      t.textContent = label;
      grp.append(t);
      g.append(grp);
      this.glyphBoxes.push({ id: c.id, x0: gx - w / 2, x1: gx + w / 2, y0: gy - 7, y1: gy + 6 });
    }
  }
  renderPreview(g, P) {
    const m = this.mouse;
    if (!m) return;
    const sn = this.snapInfo;
    if (sn) {
      const [x, y] = this.S(sn.x, sn.y);
      for (const gl of sn.guides || []) { const [x1, y1] = this.S(gl.x1, gl.y1); g.append(svgEl("line", { x1, y1, x2: x, y2: y, class: "sk-guide" })); }
      if (sn.on2) g.append(svgEl("path", { d: `M${x - 6} ${y - 6}L${x + 6} ${y + 6}M${x - 6} ${y + 6}L${x + 6} ${y - 6}`, class: "sk-snap" }));
      else if (sn.pointId || sn.mid || sn.on) g.append(svgEl("circle", { cx: x, cy: y, r: 6, class: "sk-snap" }));
      if (sn.label) { const t = svgEl("text", { x: x + 9, y: y - 8, class: "sk-infer" }); t.textContent = sn.label; g.append(t); }
    }
    const st = this.state;
    if (!st) return;
    const cur = sn || { x: m.lx, y: m.ly };
    const path = (d) => g.append(svgEl("path", { d, class: "sk-preview" }));
    const S = (x, y) => this.S(x, y);
    if (this.tool === "line" && st.start) {
      const a = st.start;
      const typed = dynTyped(st.dyn);
      const live = lineLive(a, typed ? cur : this.inferHV(a, cur));
      const vals = typed ? dynValues(st.dyn, live, this.scope()).values : live;
      const b = typed ? lineEnd(a, vals.len, vals.ang) : this.inferHV(a, cur);
      const A = S(a.x, a.y), B = S(b.x, b.y);
      path(`M${A[0]},${A[1]}L${B[0]},${B[1]}`);
      if (b.inferred) { const t = svgEl("text", { x: B[0] + 10, y: B[1] + 16, class: "sk-infer" }); t.textContent = b.inferred; g.append(t); }
      if (st.dyn) this.renderDynLine(g, A, B, vals);
    } else if ((this.tool === "rect" || this.tool === "rectc") && st.start) {
      const a = st.start, center = this.tool === "rectc";
      const live = rectLive(a, cur, center);
      const vals = st.dyn ? dynValues(st.dyn, live, this.scope()).values : live;
      const b = rectCorner(a, cur, vals.w, vals.h, center);
      const pts = !center
        ? [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]]
        : [[2 * a.x - b.x, 2 * a.y - b.y], [b.x, 2 * a.y - b.y], [b.x, b.y], [2 * a.x - b.x, b.y]];
      path("M" + pts.map((p) => S(...p).join(",")).join("L") + "Z");
      if (st.dyn) this.renderDynRect(g, pts.map((p) => S(...p)), vals);
    } else if (this.tool === "circle" && st.start) {
      const c = S(st.start.x, st.start.y);
      const live = { d: 2 * Math.hypot(cur.x - st.start.x, cur.y - st.start.y) };
      const vals = st.dyn ? dynValues(st.dyn, live, this.scope()).values : live;
      const inf = st.dyn && dynTyped(st.dyn) || this.noAuto ? null : inferCircle(this.sk, st.start, vals.d / 2, { tolR: this.autoTol(), kinds: this.autoKinds() });
      const r = ((inf ? 2 * inf.r : vals.d) / 2) * this.M.scale;
      g.append(svgEl("circle", { cx: c[0], cy: c[1], r, class: "sk-preview" }));
      if (inf) { const t = svgEl("text", { x: c[0] + r + 8, y: c[1] + 4, class: "sk-infer" }); t.textContent = "="; g.append(t); }
      if (st.dyn) {
        const k = Math.SQRT1_2;
        g.append(svgEl("path", { d: `M${c[0]},${c[1]}L${c[0] + r * k},${c[1] - r * k}`, class: "sk-dyn-line" }));
        this.dynBox(g, 0, c[0] + r * k + 30, c[1] - r * k - 14, "Ø", "", vals.d);
      }
    } else if (this.tool === "spline" && st.pts) {
      const ctrl = [...st.pts, cur].map((p) => [p.x, p.y]);
      path("M" + splineSamples(ctrl, 16).map((q) => S(q[0], q[1]).join(",")).join("L"));
      g.append(svgEl("path", { d: "M" + ctrl.map((q) => S(q[0], q[1]).join(",")).join("L"), class: "sk-ctrl" }));
    } else if (["ellipse", "arcc", "slot"].includes(this.tool) && st.pts?.length === 1 && st.dyn) {
      // erste Strecke (Halbachse, Radius, Mittenabstand): Länge und Winkel tippbar wie bei der Linie
      const a = st.pts[0], live = lineLive(a, cur), typed = dynTyped(st.dyn);
      const vals = typed ? dynValues(st.dyn, live, this.scope()).values : live;
      const b = typed ? lineEnd(a, vals.len, vals.ang) : cur;
      const A = S(a.x, a.y), B = S(b.x, b.y);
      path(`M${A[0]},${A[1]}L${B[0]},${B[1]}`);
      if (this.tool === "arcc") g.append(svgEl("circle", { cx: A[0], cy: A[1], r: vals.len * this.M.scale, class: "sk-preview", opacity: 0.35 }));
      this.renderDynLine(g, A, B, vals, a);
    } else if (this.tool === "ellipse" && st.pts) {
      const [c, a] = st.pts;
      const live = this.thirdLive(cur), rb = st.dyn ? dynValues(st.dyn, live, this.scope()).values.b : live.b;
      path("M" + ellipseSamples(ellipseGeom(c, a, rb), 96).map((q) => S(q[0], q[1]).join(",")).join("L") + "Z");
      const A = S(c.x, c.y), B = S(a.x, a.y);
      g.append(svgEl("path", { d: `M${2 * A[0] - B[0]},${2 * A[1] - B[1]}L${B[0]},${B[1]}`, class: "sk-dyn-line" }));
      if (st.dyn) {
        const q = ellipsePoint(ellipseGeom(c, a, rb), Math.PI / 2), Q = S(q.x, q.y);
        g.append(svgEl("path", { d: `M${A[0]},${A[1]}L${Q[0]},${Q[1]}`, class: "sk-dyn-line" }));
        this.dynBox(g, 0, (A[0] + Q[0]) / 2 + 26, (A[1] + Q[1]) / 2, "b ", "", rb);
      }
    } else if (this.tool === "arcc" && st.pts) {
      const [c, a] = st.pts, live = this.thirdLive(cur), sw = st.dyn ? dynValues(st.dyn, live, this.scope()).values.sw : live.sw;
      const R = Math.hypot(a.x - c.x, a.y - c.y), t1 = Math.atan2(a.y - c.y, a.x - c.x), n = 48, pts = [];
      for (let i = 0; i <= n; i++) { const t = t1 + ((sw * Math.PI) / 180) * (i / n); pts.push(S(c.x + R * Math.cos(t), c.y + R * Math.sin(t))); }
      path("M" + pts.map((q) => q.join(",")).join("L"));
      const C = S(c.x, c.y), tm = t1 + ((sw * Math.PI) / 360), M = S(c.x + R * 0.6 * Math.cos(tm), c.y + R * 0.6 * Math.sin(tm));
      g.append(svgEl("path", { d: `M${pts[0][0]},${pts[0][1]}L${C[0]},${C[1]}L${pts[n][0]},${pts[n][1]}`, class: "sk-dyn-line" }));
      if (st.dyn) this.dynBox(g, 0, M[0], M[1], "", "°", sw);
    } else if (this.tool === "circle3" && st.pts) {
      const pts = [...st.pts, cur];
      if (pts.length === 3) {
        const c = circleFrom3(...pts.map((p) => [p.x, p.y]));
        if (c) { const C = S(c.x, c.y); g.append(svgEl("circle", { cx: C[0], cy: C[1], r: c.r * this.M.scale, class: "sk-preview" })); }
      } else path("M" + pts.map((p) => S(p.x, p.y).join(",")).join("L"));
      for (const p of st.pts) { const q = S(p.x, p.y); g.append(svgEl("circle", { cx: q[0], cy: q[1], r: 3, class: "sk-snap" })); }
    } else if (this.tool === "arct" && st.start) {
      const P0 = this.pts(), line = this.entity(st.line), s0 = P0.get(st.start.pointId), f = line && P0.get(line.p1 === st.start.pointId ? line.p2 : line.p1);
      if (s0 && f) {
        const L = Math.hypot(s0.x - f.x, s0.y - f.y) || 1, a = tangentArcCenter(s0, { x: (s0.x - f.x) / L, y: (s0.y - f.y) / L }, cur);
        if (a) {
          const t0 = Math.atan2(s0.y - a.c.y, s0.x - a.c.x), t1 = Math.atan2(cur.y - a.c.y, cur.x - a.c.x);
          let sw = t1 - t0;
          if (a.ccw) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
          const pts = [];
          for (let i = 0; i <= 48; i++) { const q = t0 + (sw * i) / 48; pts.push(S(a.c.x + a.r * Math.cos(q), a.c.y + a.r * Math.sin(q))); }
          path("M" + pts.map((q) => q.join(",")).join("L"));
        }
      }
    } else if (this.tool === "arc3" && st.pts) {
      const pts = [...st.pts, cur];
      if (this.tool === "arc3" && pts.length === 3) {
        const circ = circleFrom3([pts[0].x, pts[0].y], [pts[2].x, pts[2].y], [pts[1].x, pts[1].y]);
        if (circ) {
          const C = S(circ.x, circ.y);
          g.append(svgEl("circle", { cx: C[0], cy: C[1], r: circ.r * this.M.scale, class: "sk-preview", opacity: 0.4 }));
        }
      }
      path("M" + pts.map((p) => S(p.x, p.y).join(",")).join("L"));
    } else if (this.tool === "slot" && st.pts) {
      const [a, b] = st.pts;
      if (!b) { const A = S(a.x, a.y), B = S(cur.x, cur.y); path(`M${A[0]},${A[1]}L${B[0]},${B[1]}`); }
      else {
        const live = this.thirdLive(cur), r = (st.dyn ? dynValues(st.dyn, live, this.scope()).values.w : live.w) / 2;
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
        // Umriss als Punktfolge: Halbkreis um b (von +n über +Achse nach −n), dann um a zurück
        const base = Math.atan2(ny, nx), pts = [];
        for (let i = 0; i <= 16; i++) { const t = base - (Math.PI * i) / 16; pts.push(S(b.x + r * Math.cos(t), b.y + r * Math.sin(t))); }
        for (let i = 0; i <= 16; i++) { const t = base + Math.PI - (Math.PI * i) / 16; pts.push(S(a.x + r * Math.cos(t), a.y + r * Math.sin(t))); }
        path("M" + pts.map((q) => q.join(",")).join("L") + "Z");
        if (st.dyn) {
          const P1 = S(b.x + r * nx, b.y + r * ny), P2 = S(b.x - r * nx, b.y - r * ny);
          g.append(svgEl("path", { d: `M${P1[0]},${P1[1]}L${P2[0]},${P2[1]}`, class: "sk-dyn-line" }));
          this.dynBox(g, 0, (P1[0] + P2[0]) / 2 + 30, (P1[1] + P2[1]) / 2 - 14, "", "", 2 * r);
        }
      }
    } else if (this.tool === "polygon" && st.start) {
      const c = st.start, live = { n: this.polygonN(), r: Math.hypot(cur.x - c.x, cur.y - c.y) };
      const vals = st.dyn ? dynValues(st.dyn, live, this.scope()).values : live;
      const n = Math.max(3, Math.min(64, Math.round(vals.n) || 3)), r = vals.r, a0 = Math.atan2(cur.y - c.y, cur.x - c.x);
      const pts = Array.from({ length: n }, (_, i) => S(c.x + r * Math.cos(a0 + (2 * Math.PI * i) / n), c.y + r * Math.sin(a0 + (2 * Math.PI * i) / n)));
      path("M" + pts.map((q) => q.join(",")).join("L") + "Z");
      if (st.dyn) {
        const C = S(c.x, c.y);
        g.append(svgEl("path", { d: `M${C[0]},${C[1]}L${pts[0][0]},${pts[0][1]}`, class: "sk-dyn-line" }));
        this.dynBox(g, 0, C[0], C[1] + 26, "", " Ecken", vals.n);
        this.dynBox(g, 1, (C[0] + pts[0][0]) / 2, (C[1] + pts[0][1]) / 2 - 14, "R ", "", r);
      }
    } else if (this.tool === "dimension" && st.picks) {
      // Vorschau wie Inventor: das Maß hängt an der Maus und zeigt, ob waagrecht, senkrecht oder ausgerichtet bemaßt wird
      let shown = false;
      if (st.place) {
        const c = this.dimensionFrom(st.picks, { x: m.lx, y: m.ly });
        if (c) {
          try {
            c.id = "_vorschau";
            c.value = String(round4(measureConstraint(this.sk, { ...c, value: "0" })));
            const nb = this.dimBoxes.length;
            this.renderDim(g, c, P, true);
            this.dimBoxes.length = nb;
            shown = true;
          } catch { /* keine Vorschau möglich */ }
        }
      }
      const t = svgEl("text", { x: m.sx + 12, y: m.sy + (shown ? 34 : 18), class: "sk-infer" });
      t.textContent = st.place ? (shown ? (st.locked ? "Klick setzt das Maß" : "Klick setzt das Maß – oder zweites Element wählen") : st.locked ? "Lage klicken" : "Lage klicken oder zweites Element wählen") : "zweites Element wählen";
      g.append(t);
    }
  }
  /** Ein Maßfeld der laufenden Eingabe als Kästchen bei (cx, cy); zeigt getippten Text oder den Mauswert */
  dynBox(g, i, cx, cy, prefix = "", suffix = "", live) {
    const dyn = this.state.dyn, f = dyn.fields[i];
    const typed = f.text.trim() !== "";
    const grp = svgEl("g", { class: "sk-dyn" + (i === dyn.active ? " active" : "") + (typed ? " typed" : "") + (f.error ? " err" : "") });
    const text = prefix + (typed ? f.text : fmtNum(live, 2) + suffix);
    const w = Math.max(44, text.length * 7.6 + 14);
    grp.append(svgEl("rect", { x: cx - w / 2, y: cy - 10, width: w, height: 20, rx: 2 }));
    const t = svgEl("text", { x: cx, y: cy + 4.5, "text-anchor": "middle" });
    t.textContent = text + (i === dyn.active && !dyn.fresh ? "|" : "");
    grp.append(t);
    g.append(grp);
  }
  /** Maßfelder am Vorschau-Rechteck: Breite über der oberen Kante, Höhe an der rechten Kante */
  renderDynRect(g, scr, vals) {
    const xs = scr.map((p) => p[0]), ys = scr.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const off = 22;
    const lines = {
      w: { a: [x0, y0 - off], b: [x1, y0 - off], ext: [[x0, y0], [x1, y0]] },
      h: { a: [x1 + off, y0], b: [x1 + off, y1], ext: [[x1, y0], [x1, y1]] },
    };
    this.state.dyn.fields.forEach((f, i) => {
      const L = lines[f.key];
      const ext = L.ext.map((p, j) => { const q = j ? L.b : L.a; return `M${p[0]},${p[1]}L${q[0]},${q[1]}`; }).join("");
      g.append(svgEl("path", { d: ext + `M${L.a[0]},${L.a[1]}L${L.b[0]},${L.b[1]}`, class: "sk-dyn-line" }));
      this.dynBox(g, i, (L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2, "", "", vals[f.key]);
    });
  }
  /** Maßfelder an der Vorschau-Linie: Länge neben der Linienmitte, Winkel am Startpunkt */
  renderDynLine(g, A, B, vals, origin = this.state.start) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    // Normale zeigt auf dem Bildschirm nach oben bzw. rechts
    let nx = dy / L, ny = -dx / L;
    if (ny > 0 || (Math.abs(ny) < 1e-9 && nx < 0)) { nx = -nx; ny = -ny; }
    const off = 22;
    const A1 = [A[0] + nx * off, A[1] + ny * off], B1 = [B[0] + nx * off, B[1] + ny * off];
    g.append(svgEl("path", { d: `M${A[0]},${A[1]}L${A1[0]},${A1[1]}M${B[0]},${B[1]}L${B1[0]},${B1[1]}M${A1[0]},${A1[1]}L${B1[0]},${B1[1]}`, class: "sk-dyn-line" }));
    this.dynBox(g, 0, (A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2, "", "", vals.len);
    // Winkel: Bogen von der Skizzen-x-Achse bis zur Linie, Feld auf der Winkelhalbierenden
    const a = origin, R = 34 / this.M.scale, ang = (vals.ang * Math.PI) / 180;
    const arc = [];
    for (let k = 0; k <= 24; k++) { const t = (ang * k) / 24; arc.push(this.S(a.x + R * Math.cos(t), a.y + R * Math.sin(t))); }
    const X = this.S(a.x + R * 1.3, a.y);
    g.append(svgEl("path", { d: `M${A[0]},${A[1]}L${X[0]},${X[1]}M` + arc.map((p) => p.join(",")).join("L"), class: "sk-dyn-line" }));
    const q = this.S(a.x + R * 1.9 * Math.cos(ang / 2), a.y + R * 1.9 * Math.sin(ang / 2));
    this.dynBox(g, 1, q[0], q[1], "", "°", vals.ang);
  }
}

function textEl(text, x, y, rot, cls, anchor) {
  const t = svgEl("text", { x, y, class: cls, "text-anchor": anchor, transform: rot ? `rotate(${rot} ${x} ${y})` : undefined });
  t.textContent = text;
  return t;
}
function estimateBox(text, x, y, anchor) {
  const w = text.length * 7.4 + 6;
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return { x0, x1: x0 + w, y0: y - 14, y1: y + 6 };
}
function segDist(px, py, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((px - A[0]) * dx + (py - A[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (A[0] + t * dx), py - (A[1] + t * dy));
}
function lineIntersect(a, b, c, d) {
  const r = [b.x - a.x, b.y - a.y], s = [d.x - c.x, d.y - c.y];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s[1] - (c.y - a.y) * s[0]) / den;
  return { x: a.x + t * r[0], y: a.y + t * r[1] };
}
function gridStep(scale) {
  const target = 24 / scale;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const m = target / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;
/** Langloch-Radius = Abstand des Mauspunkts von der Mittellinie a–b */
function slotRadius(a, b, m) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  return Math.abs(dx * (m.y - a.y) - dy * (m.x - a.x)) / L;
}
function safeEval(e, scope) { try { return evaluate(e, scope); } catch { return 0; } }

/** Punkt in Polygon (Bildschirmkoordinaten) */
function insidePoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
