// Direktbearbeitung am Modell (Inventor »Direkt«): Leiste mit Verschieben, Größe, Drehen, Löschen, Flächen,
// »Messen ab«, Maßeingabe und Fertig/Abbrechen; dazu eine Triade an der Fläche, deren Pfeile man ziehen kann.
// Ergebnis ist das Feature »direkt« im Verlauf (Geometrie: src/kernel/direkt.js).

import { h, icon, toast } from "./dom.js";
import { v3 } from "../core/geom.js";
import { DIREKT_RICHTUNGEN, DIREKT_ACHSEN, DIREKT_GROESSE, newDirekt, faceAxes, moveDir, measureFromValue } from "../core/direkt.js";

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const isNum = (s) => /^\s*-?\d+([.,]\d+)?\s*$/.test(String(s ?? ""));
const num = (s) => Number(String(s).replace(",", "."));
const fmt = (x) => String(Math.round(x * 1000) / 1000).replace(".", ",");
const OPS = [["verschieben", "Verschieben", "direct"], ["groesse", "Größe", "facesize"], ["drehen", "Drehen", "facerot"], ["loeschen", "Löschen", "facedel"]];
/** Feld des Werts je Vorgang */
const FIELD = { verschieben: "distance", groesse: "size", drehen: "angle" };

/** Flächenbezug aus einem Pick-Treffer: Punkt, Normale (eben) bzw. Radius (Zylinder) in Weltkoordinaten */
export function directFaceRef(app, hit) {
  const info = app.viewer.faceWorldInfo(hit) || {};
  const n = info.type === "PLANE" ? info.normal || hit.normal : null;
  let p = hit.point;
  // Zylinder: Klickpunkt liegt auf dem Dreiecksnetz – radial auf die echte Fläche schieben, sonst findet der Kern sie nicht
  if (info.type === "CYLINDER" && info.axisP && info.axisD && info.radius > 0) {
    const d = v3.norm(info.axisD), w = v3.sub(p, info.axisP), rad = v3.sub(w, v3.mul(d, v3.dot(w, d)));
    if (v3.len(rad) > 1e-9) p = v3.add(v3.add(info.axisP, v3.mul(d, v3.dot(w, d))), v3.mul(v3.norm(rad), info.radius));
  }
  return { p: p.map(r6), ...(n ? { n: v3.norm(n).map(r6) } : {}), ...(info.type === "CYLINDER" ? { r: r6(info.radius) } : {}) };
}

/** Direktbearbeitung starten: gewählte Flächen übernehmen, sonst Flächen anklicken lassen */
export function startDirekt(app, op = null) {
  if (app.mode !== "part") return;
  const faces = (app.selHits || []).filter((x) => x.kind === "face").map((x) => directFaceRef(app, x));
  const cyl = faces.length && faces.every((x) => x.r);
  const f = newDirekt(op || (cyl ? "groesse" : "verschieben"), faces);
  if (cyl) f.size = fmt(faces[0].r * 2).replace(",", ".");
  else f.sizeMode = "offset";
  if (f.op === "groesse" && !cyl) f.size = "1";
  if (cyl) f.sizeMode = "durchmesser";
  app.selHits = [];
  app.viewer.setSelectionHits([]);
  app.addFeature(f);
  if (!faces.length) app.setHint("Direkt: Flächen anklicken (nochmal klicken entfernt), dann in der Leiste den Wert eingeben");
}

export class DirectBar {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.fid = null;
    this.measureShown = false;
    const cv = app.viewer.renderer.domElement;
    cv.addEventListener("pointerdown", (e) => this.dragStart(e), { capture: true });
    app.viewer.onCamera(() => this.place());
  }
  feature() {
    const app = this.app;
    if (app.mode !== "part" || app.sel?.type !== "feature") return null;
    const f = app.feature(app.sel.id);
    return f?.type === "direkt" ? f : null;
  }
  /** Leiste und Triade zum gewählten Feature passend zeigen oder entfernen */
  sync() {
    const f = this.feature();
    if (!f) return this.hide();
    this.fid = f.id;
    this.renderBar(f);
    this.showGlyph(f);
  }
  hide() {
    this.el?.remove();
    this.el = null;
    this.fid = null;
    this.app.viewer.showDirectGlyph(null);
    if (this.measureShown) { this.app.viewer.showMeasure(null); this.measureShown = false; }
  }
  set(f, label, fn) { this.app.edit(label, () => fn(f)); }

  // ---------- Leiste ----------
  renderBar(f) {
    const app = this.app, op = f.op || "verschieben";
    const btn = (label, ic, on, onclick, title) => h("button", { class: "dbar-btn" + (on ? " on" : ""), title: title || label, onclick }, ic ? icon(ic) : null, label ? h("span", {}, label) : null);
    const seg = (opts, cur, onPick) => h("div", { class: "dbar-seg" }, ...opts.map(([k, l]) => btn(l, null, k === cur, () => onPick(k))));
    const picking = app.pick?.kind === "faces" && app.pick.feature === f.id;
    const rows = [
      h("div", { class: "dbar-row" }, ...OPS.map(([k, l, ic]) => btn(l, ic, k === op, () => k !== op && this.set(f, l, (x) => { x.op = k; if (k === "groesse" && !x.size) x.size = "1"; })))),
      h("div", { class: "dbar-row" },
        btn(`Flächen (${(f.faces || []).length})`, "facepick", picking, () => (picking ? app.cancelPick() : this.pickFaces(f)), "Flächen wählen oder abwählen"),
        op === "verschieben" ? seg(DIREKT_RICHTUNGEN, f.richtung || "normal", (k) => this.set(f, "Richtung", (x) => { x.richtung = k; })) : null,
        op === "drehen" ? seg(DIREKT_ACHSEN, f.achse || "U", (k) => (k === "kante" ? this.pickEdge(f) : this.set(f, "Drehachse", (x) => { x.achse = k; }))) : null,
        op === "groesse" ? seg(DIREKT_GROESSE, f.sizeMode || "durchmesser", (k) => this.set(f, "Größe", (x) => { x.sizeMode = k; })) : null),
    ];
    if (op !== "loeschen") {
      const field = FIELD[op];
      const inp = h("input", { class: "inp dbar-inp", value: String(f[field] ?? "").replace(".", ","), "aria-label": "Wert", spellcheck: "false" });
      const commit = () => {
        const v = inp.value.trim().replace(",", ".");
        if (!v || v === String(f[field] ?? "")) return;
        this.set(f, op === "drehen" ? "Winkel" : "Maß", (x) => { x[field] = v; });
      };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") inp.blur(); });
      inp.addEventListener("change", commit);
      const unit = op === "drehen" ? "°" : "mm";
      const label = op === "verschieben" ? (f.from?.p ? "Abstand ab Bezug" : "Abstand") : op === "drehen" ? "Winkel" : (f.sizeMode || "durchmesser") === "durchmesser" ? "Durchmesser" : f.sizeMode === "radius" ? "Radius" : "Versatz";
      rows.push(h("div", { class: "dbar-row" },
        op === "verschieben" ? btn(f.from?.p ? "Bezug ✓" : "Messen ab", "measure", !!f.from?.p, () => this.pickFrom(f), "Bezugsfläche, -kante oder -punkt anklicken; das Maß gilt dann ab dort") : null,
        op === "verschieben" && f.from?.p ? btn("", "cancel", false, () => this.set(f, "Bezug entfernen", (x) => { delete x.from; }), "Bezug entfernen") : null,
        h("label", { class: "dbar-val" }, label, inp, h("span", { class: "unit" }, unit))));
      this.inp = inp;
    } else this.inp = null;
    rows.push(h("div", { class: "dbar-row" },
      btn("", "finish", false, () => this.finish(), "Fertig (Eingabe)"),
      btn("", "cancel", false, () => this.cancel(), "Abbrechen: Direktbearbeitung verwerfen")));
    const el = h("div", { class: "direct-bar", role: "toolbar", "aria-label": "Direktbearbeitung" }, ...rows);
    const focused = this.el?.contains(document.activeElement);
    this.el?.remove();
    this.el = el;
    document.body.append(el);
    this.place();
    if (focused && this.inp) this.inp.focus();
  }
  /** Leiste neben die erste Fläche legen (unten rechts davon), im Fenster gehalten */
  place() {
    const f = this.feature();
    if (!this.el || !f) return;
    const r = this.el.getBoundingClientRect(), cv = this.app.viewer.renderer.domElement.getBoundingClientRect();
    let x = cv.left + cv.width - r.width - 16, y = cv.top + cv.height - r.height - 16;
    const p = f.faces?.[0]?.p;
    if (p) { const s = this.app.viewer.worldToScreen(p); x = cv.left + s[0] + 70; y = cv.top + s[1] + 40; }
    this.el.style.left = Math.max(cv.left + 4, Math.min(x, cv.right - r.width - 4)) + "px";
    this.el.style.top = Math.max(cv.top + 4, Math.min(y, cv.bottom - r.height - 4)) + "px";
  }
  pickFaces(f) {
    const app = this.app;
    app.pick = { kind: "faces", feature: f.id };
    app._editingFeature = f.id;
    app.setHint("Direkt: Flächen anklicken (nochmal klicken entfernt) – Esc beendet die Auswahl");
    app.rebuild();
    this.renderBar(f);
  }
  /** Messen ab: Bezug anklicken; der Wert wird mit dem jetzigen Abstand vorbelegt */
  pickFrom(f) {
    const app = this.app;
    app.pick = { kind: "custom", onPick: (hit) => {
      if (!hit) return;
      app.cancelPick();
      const info = hit.kind === "face" ? app.viewer.faceWorldInfo(hit) : {};
      const ref = { p: hit.point.map(r6), ...(info.type === "PLANE" && (info.normal || hit.normal) ? { n: v3.norm(info.normal || hit.normal).map(r6) } : {}) };
      const fp = f.faces?.[0];
      let cur = null;
      if (fp?.n) {
        // jetzige Lage der Fläche (ohne Bezug ist »distance« der Schiebeweg) → Abstand vorbelegen
        const dir = moveDir(f.richtung, fp.n), s = !f.from?.p && isNum(f.distance) ? num(f.distance) : 0;
        try { cur = measureFromValue(v3.add(fp.p, v3.mul(dir, s)), dir, ref); } catch { cur = null; }
      }
      this.set(f, "Messen ab", (x) => { x.from = ref; if (cur != null) x.distance = String(Math.round(cur * 1000) / 1000); });
      app.setHint("Messen ab: neuen Abstand eingeben und mit Eingabe bestätigen");
      setTimeout(() => { this.inp?.focus(); this.inp?.select(); }, 0);
    } };
    app.setHint("Messen ab: Bezugsfläche, -kante oder -ecke anklicken – Esc bricht ab");
  }
  /** Drehen um eine Kante: Kante anklicken */
  pickEdge(f) {
    const app = this.app;
    app.pick = { kind: "custom", onPick: (hit) => {
      if (hit?.kind !== "edge") return toast("Bitte eine gerade Kante anklicken");
      const pts = app.viewer.edgeWorldPoints(hit);
      if (!pts || pts.length < 2 || v3.dist(pts[0], pts[pts.length - 1]) < 1e-6) return toast("Bitte eine gerade Kante anklicken");
      app.cancelPick();
      this.set(f, "Drehkante", (x) => { x.achse = "kante"; x.edge = { p: pts[0].map(r6), d: v3.norm(v3.sub(pts[pts.length - 1], pts[0])).map(r6) }; });
    } };
    app.setHint("Drehen: Kante als Drehachse anklicken – Esc bricht ab");
  }
  finish() {
    const app = this.app;
    if (this.inp) this.inp.dispatchEvent(new Event("change"));
    if (app.pick) app.cancelPick();
    app.sel = null;
    app.setHint("");
    this.hide();
    app.tree.render();
    app.props.render();
  }
  cancel() {
    const id = this.fid;
    this.hide();
    if (this.app.pick) this.app.cancelPick();
    if (id) this.app.deleteFeature(id);
    this.app.setHint("");
  }

  // ---------- Triade ----------
  /** Pfeile/Ringe an der ersten Fläche; beim Verschieben wandert die Triade mit dem eingegebenen Abstand */
  glyphSpec(f) {
    const fr = f.faces?.[0];
    if (!fr) return null;
    const op = f.op || "verschieben";
    if (op === "loeschen") return null;
    const n = fr.n || null;
    let c = fr.p;
    if (op === "verschieben" && n && !f.from?.p && isNum(f.distance)) c = v3.add(fr.p, v3.mul(moveDir(f.richtung, n), num(f.distance)));
    if (op === "groesse" && n && isNum(f.size)) c = v3.add(fr.p, v3.mul(n, num(f.size)));
    const arrows = [], rings = [];
    if (op === "verschieben") {
      if (n) arrows.push({ id: "normal", d: n, color: 0xe08a00, on: (f.richtung || "normal") === "normal" });
      for (const [k, d, col] of [["X", [1, 0, 0], 0xd23b2a], ["Y", [0, 1, 0], 0x2e9d4a], ["Z", [0, 0, 1], 0x2457b8]]) if (!n || Math.abs(v3.dot(n, d)) < 0.999 || f.richtung === k) arrows.push({ id: k, d, color: col, on: f.richtung === k, small: true });
    } else if (op === "groesse" && n) arrows.push({ id: "normal", d: n, color: 0xe08a00, on: true });
    else if (op === "drehen" && n) {
      const ax = faceAxes(n);
      rings.push({ id: "U", k: ax.u, on: (f.achse || "U") === "U" }, { id: "V", k: ax.v, on: f.achse === "V" });
      if (f.achse === "kante" && f.edge) return { center: f.edge.p, arrows: [], rings: [{ id: "kante", k: f.edge.d, on: true }] };
    }
    return { center: c, arrows, rings };
  }
  showGlyph(f) {
    const app = this.app;
    app.viewer.showDirectGlyph(this.glyphSpec(f));
    // Messen ab: Maßlinie vom Bezug zur Fläche
    const fr = f.faces?.[0];
    if ((f.op || "verschieben") === "verschieben" && f.from?.p && fr) {
      const m = f.from.n || (fr.n ? moveDir(f.richtung, fr.n) : null);
      if (m) {
        const k = v3.dot(v3.sub(fr.p, f.from.p), v3.norm(m));
        const b = isNum(f.distance) ? v3.add(f.from.p, v3.mul(v3.norm(m), Math.sign(k || 1) * Math.abs(num(f.distance)))) : fr.p;
        app.viewer.showMeasure({ a: f.from.p, b, text: `${fmt(Math.abs(num(f.distance) || 0))} mm` });
        this.measureShown = true;
        return;
      }
    }
    if (this.measureShown) { app.viewer.showMeasure(null); this.measureShown = false; }
  }
  /** Pfeil ziehen = Wert ändern (1-mm-Schritte, Umschalt 0,1 mm); Pfeil oder Ring anklicken = Richtung/Achse wählen */
  dragStart(e) {
    const app = this.app, f = this.feature();
    if (!f || app.pick || e.button !== 0) return;
    const hit = app.viewer.pickDirectHandle(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const op = f.op || "verschieben";
    if (hit.ring) {
      if (hit.id !== "kante" && hit.id !== (f.achse || "U")) this.set(f, "Drehachse", (x) => { x.achse = hit.id; });
      return;
    }
    if (op === "verschieben" && hit.id !== (f.richtung || "normal")) return this.set(f, "Richtung", (x) => { x.richtung = hit.id; });
    const field = FIELD[op];
    if (op === "groesse" && (f.sizeMode || "durchmesser") !== "offset") return toast("Durchmesser und Radius bitte eintippen; Ziehen geht bei »Versatz«");
    const old = f[field] ?? "0";
    if (!isNum(old)) return toast("Der Wert ist ein Ausdruck – in der Leiste ändern");
    const v0 = num(old), base = hit.base, d = hit.d;
    const t0 = app.viewer.rayLineParam(e.clientX, e.clientY, base, d);
    if (t0 == null) return;
    const cv = app.viewer.renderer.domElement;
    app.viewer.controls.enabled = false;
    cv.setPointerCapture?.(e.pointerId);
    const move = (m) => {
      const t = app.viewer.rayLineParam(m.clientX, m.clientY, base, d);
      if (t == null) return;
      const step = m.shiftKey ? 0.1 : 1;
      f[field] = String(Math.round(Math.round((v0 + t - t0) / step) * step * 1000) / 1000);
      if (this.inp) this.inp.value = f[field].replace(".", ",");
      app.viewer.showDirectGlyph(this.glyphSpec(f));
      app.setHint(`${op === "groesse" ? "Versatz" : "Abstand"} ${fmt(num(f[field]))} mm – Umschalt: 0,1-mm-Schritte`);
    };
    const up = () => {
      cv.removeEventListener("pointermove", move, true);
      cv.removeEventListener("pointerup", up, true);
      app.viewer.controls.enabled = true;
      const next = f[field];
      f[field] = old;
      app.setHint("");
      if (next !== old) this.set(f, "Ziehen", (x) => { x[field] = next; });
      else this.showGlyph(f);
    };
    cv.addEventListener("pointermove", move, true);
    cv.addEventListener("pointerup", up, true);
  }
}
