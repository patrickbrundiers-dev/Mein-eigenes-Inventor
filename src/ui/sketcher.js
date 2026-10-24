// 2D-Skizzierer über der 3D-Ansicht (SVG-Overlay, eigene Trefferprüfung im Bildschirmraum)
import { svgEl, h, toast, fmtNum, choiceDialog } from "./dom.js";
import { solveSketch, checkNewConstraint, measureConstraint, DIMENSION_TYPES } from "../core/solver.js";
import { arcGeometry, circleFrom3, deleteEntities, extractProfiles } from "../core/sketch.js";
import { evaluate, resolveParams } from "../core/expr.js";
import { planeFrame, toLocal, v3 } from "../core/geom.js";
import { uid } from "../core/examples.js";
import { trimEntity, filletCorner, cornerAt } from "../core/sketchedit.js";

const PT_R = 7, CURVE_R = 6;

export const SKETCH_TOOLS = {
  select: "Auswählen und ziehen",
  line: "Linie: Startpunkt klicken, weitere Punkte klicken – Esc beendet",
  rect: "Rechteck: erste Ecke, dann gegenüberliegende Ecke klicken",
  rectc: "Rechteck aus Mitte: Mittelpunkt, dann Ecke klicken",
  circle: "Kreis: Mittelpunkt, dann Radius klicken",
  arc3: "Bogen: Anfang, Ende, dann Punkt auf dem Bogen klicken",
  arcc: "Bogen um Mittelpunkt: Mitte, Anfang, Ende (gegen Uhrzeigersinn)",
  point: "Punkt / Bohrungsmitte setzen",
  dimension: "Bemaßung: Linie, Kreis, zwei Punkte oder zwei Linien wählen, dann Lage klicken",
  project: "Kante des 3D-Modells anklicken, um sie in die Skizze zu übernehmen",
  trim: "Stutzen: Teil einer Linie, eines Kreises oder Bogens anklicken – wird bis zu den nächsten Schnittpunkten entfernt",
  sfillet: "Rundung: Ecke anklicken, an der zwei Linien enden, dann Radius eingeben",
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
    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = (e) => this.pointerUp(e);
    this.onDbl = (e) => this.dblClick(e);
    this.viewer.onCamera(() => { if (this.active) this.render(); });
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
    this.frame = planeFrame(sk.plane, safeEval(sk.offset || "0", this.scope()));
    this.active = true;
    this.tool = "select";
    this.state = null;
    this.sel.clear();
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
    const r = solveSketch(sk, this.scope(), { extra });
    this.lastSolve = r;
    this.profiles = extractProfiles(sk);
    this.app.updateSketchStatus(r, this.profiles);
    return r;
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
      let best = null, bd = PT_R;
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
    // Mittelpunkte von Linien
    for (const e of this.sk.entities) {
      if (e.type !== "line") continue;
      const a = P.get(e.p1), b = P.get(e.p2);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [x, y] = this.S(mx, my);
      if (Math.hypot(x - sx, y - sy) < PT_R) return { x: mx, y: my, mid: e.id, label: "Mitte" };
      if (e.type === "circle") continue;
    }
    for (const e of this.sk.entities) {
      if (e.type !== "circle" && e.type !== "arc") continue;
      const c = P.get(e.c);
      const [x, y] = this.S(c.x, c.y);
      if (Math.hypot(x - sx, y - sy) < PT_R) return { x: c.x, y: c.y, pointId: c.id, label: "Mitte" };
    }
    let [lx, ly] = this.L(sx, sy);
    if (hit?.kind === "entity") {
      const e = this.sk.entities.find((q) => q.id === hit.id);
      if (e.type === "line") {
        const a = P.get(e.p1), b = P.get(e.p2);
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        const t = ((lx - a.x) * dx + (ly - a.y) * dy) / L2;
        return { x: a.x + t * dx, y: a.y + t * dy, on: e.id, onType: "line", label: "Auf Linie" };
      }
      const c = P.get(e.c);
      const r = e.type === "circle" ? e.r : Math.hypot(P.get(e.p1).x - c.x, P.get(e.p1).y - c.y);
      const ang = Math.atan2(ly - c.y, lx - c.x);
      return { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang), on: e.id, onType: "circle", label: "Auf Kreis" };
    }
    if (this.gridSnap) {
      const step = gridStep(this.M.scale);
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
      sk.constraints.push(...cons);
      this.lastLine = { p1, p2 };
    });
    return this.lastLine;
  }
  lineAlreadyHV(sk, p1, p2, type) {
    // Verhindert redundante H/V, wenn beide Punkte schon durch andere Linien gekoppelt sind
    const c = { id: "tmp", type, p: p1, q: p2 };
    try { return checkNewConstraint(sk, c, this.scope()) !== "ok"; } catch { return false; }
  }
  addRect(a, b, center = false) {
    this.commit("Rechteck", (sk) => {
      const cons = [];
      let corners;
      if (center) {
        const dx = b.x - a.x, dy = b.y - a.y;
        corners = [[a.x - dx, a.y - dy], [a.x + dx, a.y - dy], [a.x + dx, a.y + dy], [a.x - dx, a.y + dy]];
      } else corners = [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]];
      const ids = corners.map((c, i) => {
        if (!center && i === 0) return this.usePoint(sk, a, cons);
        if (!center && i === 2) return this.usePoint(sk, b, cons);
        const id = uid("p");
        sk.points.push({ id, x: c[0], y: c[1] });
        return id;
      });
      const lines = [0, 1, 2, 3].map((i) => {
        const id = uid("l");
        sk.entities.push({ id, type: "line", p1: ids[i], p2: ids[(i + 1) % 4], construction: !!this.construction });
        return id;
      });
      cons.push({ id: uid("k"), type: "horizontal", e: lines[0] }, { id: uid("k"), type: "horizontal", e: lines[2] }, { id: uid("k"), type: "vertical", e: lines[1] }, { id: uid("k"), type: "vertical", e: lines[3] });
      if (center) {
        const cid = this.usePoint(sk, a, cons);
        const diag = uid("l");
        sk.entities.push({ id: diag, type: "line", p1: ids[0], p2: ids[2], construction: true });
        cons.push({ id: uid("k"), type: "midpoint", p: cid, e: diag });
      }
      sk.constraints.push(...cons);
    });
  }
  addCircle(c, r) {
    this.commit("Kreis", (sk) => {
      const cons = [];
      const cid = this.usePoint(sk, c, cons);
      sk.entities.push({ id: uid("k"), type: "circle", c: cid, r: Math.max(r, 1e-3), construction: !!this.construction });
      sk.constraints.push(...cons);
    });
  }
  addArc(center, start, end) {
    this.commit("Bogen", (sk) => {
      const cons = [];
      const cid = center.pointId || (() => { const id = uid("p"); sk.points.push({ id, x: center.x, y: center.y }); return id; })();
      const p1 = this.usePoint(sk, start, cons);
      // Endpunkt auf Radius projizieren
      const r = Math.hypot(start.x - center.x, start.y - center.y);
      const ang = Math.atan2(end.y - center.y, end.x - center.x);
      const e2 = end.pointId ? end : { ...end, x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) };
      const p2 = this.usePoint(sk, e2, cons);
      sk.entities.push({ id: uid("b"), type: "arc", c: cid, p1, p2, construction: !!this.construction });
      sk.constraints.push(...cons);
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
        if (isCirc(picks[0]) && isCirc(picks[1])) c = { type: "concentric", e1: picks[0].id, e2: picks[1].id };
        else { done(); return; }
        break;
      case "tangent":
        if (picks.length < 2) return;
        if ((isLine(picks[0]) || isCirc(picks[0])) && isCirc(picks[1]) || (isCirc(picks[0]) && isLine(picks[1]))) {
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
    if (res === "redundant") { toast("Bedingung ist bereits erfüllt (überzählig)"); return false; }
    if (res === "conflict") { toast("Bedingung widerspricht vorhandenen Bedingungen", { kind: "err" }); return false; }
    this.commit("Abhängigkeit", (sk) => sk.constraints.push(c));
    return true;
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
      const ch = await choiceDialog("Maß würde überbestimmen", "Dieses Maß ist durch andere Bedingungen schon festgelegt. Als getriebenes Maß (nur Anzeige, in Klammern) hinzufügen?", [{ label: "Abbrechen", value: null }, { label: "Getriebenes Maß", value: "driven", primary: true }]);
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
  askValue(sx, sy, initial, onOk) {
    this.cancelInput();
    const scope = this.scope();
    const inp = h("input", { value: String(initial).replace(".", ","), spellcheck: "false" });
    const box = h("div", { class: "dim-input", style: { left: sx + 12 + "px", top: sy - 14 + "px" } }, inp, h("button", { class: "btn primary", onclick: () => ok() }, "OK"));
    const ok = () => {
      const v = inp.value.trim();
      try {
        const num = evaluate(v, scope);
        if (!(num > 0) && !v.includes("-")) throw new Error("Wert muss > 0 sein");
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
    const pk = this.viewer.pickables.find((p) => p.key === hit.key && p.body === hit.body);
    const [s, c] = pk.lines.userData.edgeRanges[hit.edge];
    const arr = pk.lines.geometry.attributes.position.array;
    const pts3 = [];
    for (let i = s; i < s + c; i++) pts3.push([arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]]);
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
    if (this.viewer.handleCubeClick(e.clientX, e.clientY)) return;
    this.mapping();
    const [sx, sy] = this.eventPos(e);
    const [lx, ly] = this.L(sx, sy);
    const t = this.tool;
    if (t === "select") {
      const hit = this.hitTest(sx, sy);
      if (!hit) { if (!e.shiftKey) this.sel.clear(); this.app.selectSketchItems([...this.sel]); this.render(); return; }
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
    if (t === "sfillet") {
      let best = null, bd = 14;
      for (const p of this.sk.points) {
        if (!cornerAt(this.sk, p.id)) continue;
        const [x, y] = this.S(p.x, p.y);
        const d = Math.hypot(x - sx, y - sy);
        if (d < bd) { bd = d; best = p.id; }
      }
      if (!best) return toast("Ecke anklicken, an der genau zwei Linien enden");
      this.askValue(sx, sy, this.lastFillet || "5", (val) => {
        const r = evaluate(val, this.scope());
        const test = JSON.parse(JSON.stringify(this.sk));
        const res = filletCorner(test, best, r, uid, val);
        if (!res.ok) return toast(res.message, { kind: "err" });
        this.lastFillet = val;
        this.commit("Skizzenrundung", (sk) => filletCorner(sk, best, r, uid, val));
        if (res.dropped?.length) toast("Entfernt, weil nicht mehr gültig: " + [...new Set(res.dropped)].map((t) => ({ midpoint: "Mittelpunkt", equal: "Gleich" })[t] || t).join(", "));
      });
      return;
    }
    if (t === "project") {
      const hit = this.viewer.pick(e.clientX, e.clientY, { edges: true, faces: false });
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
    if (GLYPH[t] || ["horizontal", "vertical", "coincident", "parallel", "perpendicular", "equal", "tangent", "fix", "midpoint", "concentric", "collinear", "symmetric"].includes(t)) {
      const hit = this.hitTest(sx, sy, { dims: false });
      this.pickForConstraint(hit);
      this.render();
      return;
    }
    const sn = this.snap(sx, sy);
    switch (t) {
      case "line": {
        if (!this.state) { this.state = { start: sn }; break; }
        const a = this.state.start;
        const b = this.inferHV(a, sn);
        if (Math.hypot(b.x - a.x, b.y - a.y) * this.M.scale < 2) break;
        const res = this.addLine(a, b);
        if (!res) { this.state = null; break; }
        if (!this.state.firstId) this.state.firstId = res.p1;
        if (b.pointId && b.pointId === this.state.firstId) { this.state = null; break; }
        const np = this.pts().get(res.p2);
        this.state.start = { x: np.x, y: np.y, pointId: res.p2 };
        break;
      }
      case "rect": case "rectc":
        if (!this.state) this.state = { start: sn };
        else { this.addRect(this.state.start, sn, t === "rectc"); this.state = null; }
        break;
      case "circle":
        if (!this.state) this.state = { start: sn };
        else { const c = this.state.start; this.addCircle(c, Math.hypot(sn.x - c.x, sn.y - c.y)); this.state = null; }
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
      case "arcc":
        if (!this.state) this.state = { pts: [sn] };
        else if (this.state.pts.length === 1) this.state.pts.push(sn);
        else { const [c, a] = this.state.pts; this.addArc(c, a, sn); this.state = null; }
        break;
      case "point":
        this.addPoint(sn);
        break;
    }
    this.render();
  }
  inferHV(a, b) {
    if (b.pointId) return b;
    const dx = b.x - a.x, dy = b.y - a.y;
    const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    if (Math.min(ang, 180 - ang) < 2.5) return { ...b, y: a.y, on: null, mid: null, inferred: "H" };
    if (Math.abs(90 - ang) < 2.5) return { ...b, x: a.x, on: null, mid: null, inferred: "V" };
    return b;
  }
  pointerMove(e) {
    if (!this.active) return;
    this.mapping();
    const [sx, sy] = this.eventPos(e);
    const [lx, ly] = this.L(sx, sy);
    this.mouse = { sx, sy, lx, ly };
    if (this.drag) {
      const d = this.drag;
      if (!d.moved && Math.hypot(lx - d.start[0], ly - d.start[1]) * this.M.scale < 3) return;
      if (!d.moved) { d.moved = true; this.app.checkpoint("Ziehen"); }
      this.dragTo(d, lx, ly, e);
      this.render();
      return;
    }
    if (this.tool === "project") {
      const hit = this.viewer.pick(e.clientX, e.clientY, { edges: true, faces: false });
      this.viewer.highlight(hit ? [hit] : []);
    }
    this.hover = this.hitTest(sx, sy, { dims: this.tool === "select" });
    if (!["select", "dimension", "project", "trim", "sfillet"].includes(this.tool) && !GLYPH[this.tool]) this.snapInfo = this.snap(sx, sy);
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
        this.profiles = extractProfiles(sk);
        return;
      } else if (e.type === "arc") targets = [e.c, e.p1, e.p2].map((p) => ({ p, x: O.get(p).x + dx, y: O.get(p).y + dy }));
      else if (e.type === "point") targets = [{ p: e.p, x: lx, y: ly }];
    }
    const keep = JSON.stringify(sk.points.concat(sk.entities.filter((x) => x.type === "circle").map((x) => ({ id: x.id, r: x.r }))));
    const extra = targets.map((t, i) => ({ id: "drag" + i, type: "target", p: t.p, x: t.x, y: t.y, w: 0.05 }));
    solveSketch(sk, this.scope(), { extra, computeDof: false, writeOnFail: true, maxIterations: 40 });
    const r2 = solveSketch(sk, this.scope(), { computeDof: false, maxIterations: 40 });
    if (!r2.ok) {
      const old = JSON.parse(keep);
      const m = new Map(old.map((o) => [o.id, o]));
      for (const p of sk.points) { const o = m.get(p.id); if (o) { p.x = o.x; p.y = o.y; } }
      for (const c of sk.entities) if (c.type === "circle" && m.get(c.id)) c.r = m.get(c.id).r;
    }
    this.profiles = extractProfiles(sk);
  }
  pointerUp(e) {
    if (!this.active) return;
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
    const hit = this.hitTest(sx, sy);
    if (hit?.kind === "dim") this.editDimension(hit.id, sx, sy);
  }
  key(e) {
    if (!this.active || this.inputBox) return false;
    const k = e.key;
    if (k === "Escape") {
      if (this.state) { this.state = null; this.render(); return true; }
      if (this.tool !== "select") { this.setTool("select"); return true; }
      this.app.finishSketch();
      return true;
    }
    if (k === "Delete" || k === "Backspace") { this.deleteSelection(); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const map = { l: "line", r: "rect", c: "circle", a: "arc3", p: "point", d: "dimension", s: "select", t: "trim", f: "sfillet" };
    if (map[k.toLowerCase()]) { this.setTool(map[k.toLowerCase()]); return true; }
    if (k.toLowerCase() === "x") { this.toggleConstruction(); return true; }
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
      for (const p of pts) for (const e of sk.entities) if ([e.p1, e.p2, e.c, e.p].includes(p) && !e.origin) ents.push(e.id);
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
    const openPts = new Set(this.profiles?.openPoints || []);
    // Elemente
    for (const e of sk.entities) {
      const key = "e:" + e.id;
      const cls = ["sk-line"];
      if (e.construction) cls.push("constr");
      else if (full) cls.push("full");
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
      if (openPts.has(p.id)) cls.push("open");
      if (isSel("p:" + p.id) || pend.has(p.id)) cls.push("sel");
      else if (hov?.kind === "point" && hov.id === p.id) cls.push("hover");
      if (pe && !pe.construction) {
        g.append(svgEl("circle", { cx: x, cy: y, r: 5, class: cls.join(" ") + " hole" }));
        g.append(svgEl("path", { d: `M${x - 7},${y}h14M${x},${y - 7}v14`, class: "sk-line" }));
      } else g.append(svgEl("circle", { cx: x, cy: y, r: 2.8, class: cls.join(" ") }));
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
    const step = gridStep(this.M.scale);
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
    let t = c.type === "diameter" ? "Ø" + num : c.type === "radius" ? "R" + num : c.type === "angle" ? num + "°" : num;
    if (isExpr) t = `fx: ${t}`;
    if (c.driven) t = `(${t})`;
    return t;
  }
  renderDim(g, c, P) {
    const sel = this.sel.has("c:" + c.id);
    const cls = "sk-dim" + (c.driven ? " driven" : "");
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
      grp.append(textEl(text, tx, ty, 0, "sk-dim-text" + (c.driven ? " driven" : "") + (sel ? " sel" : ""), sx[0] >= sc[0] ? "start" : "end"));
      g.append(grp);
      const bb = estimateBox(text, tx, ty, sx[0] >= sc[0] ? "start" : "end");
      this.dimBoxes.push({ id: c.id, ...bb });
      return;
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
    grp.append(textEl(text, tx + nx, ty + ny, rot, "sk-dim-text" + (c.driven ? " driven" : "") + (sel ? " sel" : ""), "middle"));
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
      const grp = svgEl("g", { class: "sk-glyph" + (sel ? " sel" : "") });
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
      if (sn.pointId || sn.mid || sn.on) g.append(svgEl("circle", { cx: x, cy: y, r: 6, class: "sk-snap" }));
      if (sn.label) { const t = svgEl("text", { x: x + 9, y: y - 8, class: "sk-infer" }); t.textContent = sn.label; g.append(t); }
    }
    const st = this.state;
    if (!st) return;
    const cur = sn || { x: m.lx, y: m.ly };
    const path = (d) => g.append(svgEl("path", { d, class: "sk-preview" }));
    const S = (x, y) => this.S(x, y);
    if (this.tool === "line" && st.start) {
      const b = this.inferHV(st.start, cur);
      const A = S(st.start.x, st.start.y), B = S(b.x, b.y);
      path(`M${A[0]},${A[1]}L${B[0]},${B[1]}`);
      const L = Math.hypot(b.x - st.start.x, b.y - st.start.y);
      const t = svgEl("text", { x: B[0] + 10, y: B[1] + 16, class: "sk-infer" });
      t.textContent = fmtNum(L, 1) + (b.inferred ? "  " + b.inferred : "");
      g.append(t);
    } else if ((this.tool === "rect" || this.tool === "rectc") && st.start) {
      const a = st.start;
      const pts = this.tool === "rect"
        ? [[a.x, a.y], [cur.x, a.y], [cur.x, cur.y], [a.x, cur.y]]
        : [[2 * a.x - cur.x, 2 * a.y - cur.y], [cur.x, 2 * a.y - cur.y], [cur.x, cur.y], [2 * a.x - cur.x, cur.y]];
      path("M" + pts.map((p) => S(...p).join(",")).join("L") + "Z");
      const t = svgEl("text", { x: S(cur.x, cur.y)[0] + 10, y: S(cur.x, cur.y)[1] + 16, class: "sk-infer" });
      t.textContent = `${fmtNum(Math.abs(pts[1][0] - pts[0][0]), 1)} × ${fmtNum(Math.abs(pts[2][1] - pts[1][1]), 1)}`;
      g.append(t);
    } else if (this.tool === "circle" && st.start) {
      const c = S(st.start.x, st.start.y);
      const r = Math.hypot(cur.x - st.start.x, cur.y - st.start.y) * this.M.scale;
      g.append(svgEl("circle", { cx: c[0], cy: c[1], r, class: "sk-preview" }));
      const t = svgEl("text", { x: c[0] + r + 8, y: c[1], class: "sk-infer" });
      t.textContent = "Ø" + fmtNum((2 * r) / this.M.scale, 1);
      g.append(t);
    } else if ((this.tool === "arc3" || this.tool === "arcc") && st.pts) {
      const pts = [...st.pts, cur];
      if (this.tool === "arc3" && pts.length === 3) {
        const circ = circleFrom3([pts[0].x, pts[0].y], [pts[2].x, pts[2].y], [pts[1].x, pts[1].y]);
        if (circ) {
          const C = S(circ.x, circ.y);
          g.append(svgEl("circle", { cx: C[0], cy: C[1], r: circ.r * this.M.scale, class: "sk-preview", opacity: 0.4 }));
        }
      }
      path("M" + pts.map((p) => S(p.x, p.y).join(",")).join("L"));
    } else if (this.tool === "dimension" && st.picks) {
      const t = svgEl("text", { x: m.sx + 12, y: m.sy + 18, class: "sk-infer" });
      t.textContent = st.place ? (st.locked ? "Lage klicken" : "Lage klicken oder zweites Element wählen") : "zweites Element wählen";
      g.append(t);
    }
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
function safeEval(e, scope) { try { return evaluate(e, scope); } catch { return 0; } }
