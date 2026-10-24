// Eigenschaften-Fenster und Dialoge (Parameter, Stückliste, Zuschnittliste, Einstellungen)
import { settingsCenter } from "./settings.js";
import { h, icon, toast, modal, fmtNum, confirmDialog } from "./dom.js";
import { evaluate, resolveParams, isValidName } from "../core/expr.js";
import { SECTION_KINDS, FIELD_LABELS, CATALOG, catalogToDims, profileId, MATERIALS, THREADS, CLEARANCE } from "../core/sections.js";
import { profileMatches, resolveProfile } from "../core/profilesearch.js";
import { BASE_PLANES, planeFromFace } from "../core/geom.js";
import { uid } from "../core/examples.js";
import { KNICK_LIMITS, KNICK_SECTIONS } from "../core/knickrahmen.js";
import { cutListRows, endsText, CUT_RULES } from "../core/cutlist.js";
import { checkCutList, dfmLimits, DFM_RULES } from "../core/dfm.js";
import { FEATURE_NAMES } from "./app.js";
import { scaleLabel } from "./tree.js";

export class Props {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById("props");
  }
  scope() {
    const d = this.app.activeDoc();
    return d?.kind === "part" ? resolveParams(d.params).values : {};
  }

  // ---------- Feld-Bausteine ----------
  section(title, ...children) { return h("div", { class: "section" }, title ? h("h3", {}, title) : null, ...children); }
  field(label, input, wide = false) { return h("div", { class: "field" + (wide ? " wide" : "") }, h("label", {}, label), input); }
  expr(label, value, onCommit, { unit = "mm", allowZero = true, allowNeg = true } = {}) {
    const scope = this.scope();
    const inp = h("input", { class: "inp", value: value ?? "", spellcheck: "false" });
    const badge = h("span", { class: "val" });
    const check = () => {
      try {
        const v = evaluate(inp.value, scope);
        if ((!allowZero && v === 0) || (!allowNeg && v < 0)) throw new Error("Wert ungültig");
        inp.classList.remove("bad");
        inp.title = "";
        badge.textContent = /^\s*-?[\d.,]+\s*$/.test(inp.value) ? unit : `= ${fmtNum(v, 3)} ${unit}`;
        return true;
      } catch (e) {
        inp.classList.add("bad");
        inp.title = e.message;
        badge.textContent = "";
        return false;
      }
    };
    check();
    inp.addEventListener("input", check);
    inp.addEventListener("change", () => { if (check() && inp.value !== value) onCommit(inp.value.trim()); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    return this.field(label, h("div", { class: "expr-wrap" }, inp, badge));
  }
  text(label, value, onCommit, { area = false, placeholder = "" } = {}) {
    const inp = h(area ? "textarea" : "input", { class: "inp", value: value ?? "", placeholder, rows: area ? 3 : undefined });
    if (area) inp.value = value ?? "";
    inp.addEventListener("change", () => onCommit(inp.value));
    return this.field(label, inp, area);
  }
  select(label, options, value, onChange) {
    const sel = h("select", { class: "inp" }, ...options.map(([v, l]) => h("option", { value: v, selected: v === value ? true : undefined }, l)));
    sel.value = value ?? options[0]?.[0];
    sel.addEventListener("change", () => onChange(sel.value));
    return this.field(label, sel);
  }
  seg(label, options, value, onChange) {
    const wrap = h("div", { class: "seg" }, ...options.map(([v, l]) => h("button", { class: v === value ? "on" : "", onclick: () => v !== value && onChange(v), title: l }, l)));
    return label ? this.field(label, wrap) : wrap;
  }
  check(label, value, onChange) {
    const c = h("input", { type: "checkbox", checked: !!value });
    c.addEventListener("change", () => onChange(c.checked));
    return h("label", { class: "chk" }, c, label);
  }
  vec3(label, arr, onCommit, { numeric = false } = {}) {
    const scope = this.scope();
    const vals = [...(arr || ["0", "0", "0"])].map(String);
    const inputs = vals.map((v, i) => {
      const inp = h("input", { class: "inp", value: v, title: "XYZ"[i] });
      inp.addEventListener("change", () => {
        try {
          const n = evaluate(inp.value, scope);
          inp.classList.remove("bad");
          const next = [...vals];
          next[i] = numeric ? n : inp.value.trim();
          onCommit(numeric ? next.map((x, k) => (k === i ? n : Number(evaluate(String(x), scope)))) : next);
        } catch { inp.classList.add("bad"); }
      });
      return inp;
    });
    return this.field(label, h("div", { class: "vec3" }, ...inputs));
  }
  msgs(st) {
    if (!st) return null;
    return [st.error ? h("div", { class: "msg err" }, st.error) : null, st.warning ? h("div", { class: "msg warn" }, st.warning) : null, st.info ? h("div", { class: "msg info" }, st.info) : null];
  }
  /** Feature ändern mit Rückgängig */
  set(f, key, value, label) {
    this.app.edit(label || "Ändern", () => {
      if (typeof key === "function") key(f);
      else f[key] = value;
    });
  }

  // ---------- Darstellung ----------
  render() {
    const app = this.app;
    const d = app.activeDoc();
    const body = h("div", { class: "props-body" });
    let title = "Eigenschaften";
    if (app.mode === "start" || !d) {
      body.append(h("p", { class: "hint" }, "Kein Dokument geöffnet."));
    } else if (app.mode === "drawing") {
      title = "Zeichnung";
      body.append(...app.drawing.renderProps(this));
    } else if (app.mode === "sketch") {
      title = "Skizze";
      body.append(...this.sketchProps(d));
    } else if (app.pick?.kind === "sketchPlane") {
      title = "Neue Skizze";
      body.append(this.section("Ebene wählen",
        h("p", { class: "hint" }, "Eine Hauptebene oder eine ebene Fläche im 3D-Fenster anklicken."),
        h("div", { class: "btn-row" }, ...Object.entries(BASE_PLANES).map(([k, p]) => h("button", { class: "btn", onclick: () => app.createSketch({ ref: k }) }, p.label))),
        h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.cancelPick() }, "Abbrechen"))));
    } else if (app.pick?.kind === "measure") {
      title = "Messen";
      body.append(...this.measureProps());
    } else if (d.kind === "part") {
      if (app.sel?.type === "feature") {
        const f = app.feature(app.sel.id);
        if (f) { title = f.name; body.append(...this.featureProps(d, f)); }
      } else if (app.sel?.type === "geometry" && app.selHits.length) {
        title = "Auswahl";
        body.append(...this.geometryProps(d));
      } else {
        title = "Bauteil";
        body.append(...this.partProps(d));
      }
    } else if (d.kind === "assembly") {
      if (app.pick?.kind === "align") { title = "Ausrichten"; body.append(...this.alignProps()); }
      else if (app.sel?.type === "constraint") {
        const c = (d.constraints || []).find((x) => x.id === app.sel.id);
        if (c) { title = "Abhängigkeit"; body.append(...this.constraintProps(d, c)); }
      } else if (app.sel?.type === "component") {
        const c = d.components.find((x) => x.id === app.sel.id);
        if (c) { title = c.name || "Komponente"; body.append(...this.componentProps(d, c)); }
      } else { title = "Baugruppe"; body.append(...this.assemblyProps(d)); }
    }
    this.el.replaceChildren(h("div", { class: "pane-head" }, h("span", { class: "grow" }, title)), body);
  }

  // ---------- Bauteil ----------
  partProps(part) {
    const app = this.app;
    const r = app.results.get(part.id);
    const out = [];
    out.push(this.section("Allgemein",
      this.text("Name", part.name, (v) => app.edit("Name", () => { part.name = v; }, { rebuild: false })),
      this.text("Teilenummer", part.number, (v) => app.edit("Nummer", () => { part.number = v; }, { rebuild: false })),
      this.text("Beschreibung", part.description, (v) => app.edit("Beschreibung", () => { part.description = v; }, { rebuild: false }), { area: true }),
      this.select("Werkstoff", Object.entries(MATERIALS).map(([k, m]) => [k, m.label]), part.material, (v) => app.edit("Werkstoff", () => { part.material = v; })),
      this.field("Farbe", h("div", { style: { display: "flex", gap: "6px" } },
        h("input", { type: "color", value: app.partColor(part), onchange: (e) => app.edit("Farbe", () => { part.color = e.target.value; }) }),
        part.color ? h("button", { class: "btn", onclick: () => app.edit("Farbe", () => { part.color = null; }) }, "Wie Werkstoff") : null))));
    if (r) {
      const vol = r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0);
      const dens = MATERIALS[part.material]?.density || 7.85;
      const bb = unionBox(r.bodies.map((b) => b.props?.bbox).filter(Boolean));
      out.push(this.section("Masse-Eigenschaften", h("dl", { class: "kv" },
        h("dt", {}, "Volumen"), h("dd", {}, fmtNum(vol / 1000, 2) + " cm³"),
        h("dt", {}, "Masse"), h("dd", {}, fmtNum((vol * dens) / 1e6, 3) + " kg"),
        h("dt", {}, "Dichte"), h("dd", {}, fmtNum(dens, 2) + " g/cm³"),
        h("dt", {}, "Oberfläche"), h("dd", {}, fmtNum(r.bodies.reduce((s, b) => s + (b.props?.area || 0), 0) / 100, 2) + " cm²"),
        centerOf(r.bodies) ? [h("dt", {}, "Schwerpunkt"), h("dd", {}, centerOf(r.bodies).map((v) => fmtNum(v, 1)).join(" / ") + " mm")] : null,
        bb ? [h("dt", {}, "Abmessungen"), h("dd", {}, `${fmtNum(bb[1][0] - bb[0][0], 1)} × ${fmtNum(bb[1][1] - bb[0][1], 1)} × ${fmtNum(bb[1][2] - bb[0][2], 1)}`)] : null,
        h("dt", {}, "Körper"), h("dd", {}, String(r.bodies.length)))));
      const members = r.bodies.filter((b) => b.kind === "member");
      if (members.length) {
        const rows = cutListRows([{ part, result: r, qty: 1 }]);
        out.push(this.section("Zuschnittliste", cutListTable(rows, true), this.dfmList(rows),
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.files.exportMembers() }, "Profile als STEP"), h("button", { class: "btn", onclick: () => app.files.exportCutList() }, "CSV"))));
      }
      const errs = Object.entries(r.status).filter(([, s]) => !s.ok);
      if (errs.length) out.push(this.section("Probleme", ...errs.map(([id, s]) => h("div", { class: "msg err" }, `${app.feature(id)?.name || id.replace("param:", "Parameter ")}: ${s.error}`))));
    }
    out.push(h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.paramsDialog() }, "Parameter…")));
    return out;
  }
  geometryProps(part) {
    const app = this.app;
    const hits = app.selHits;
    const edges = hits.filter((x) => x.kind === "edge");
    const faces = hits.filter((x) => x.kind === "face");
    const out = [];
    const typeName = { LINE: "Gerade", CIRCLE: "Kreis", ELLIPSE: "Ellipse", BSPLINE_CURVE: "Freiform", PLANE: "Ebene", CYLINDER: "Zylinder", CONE: "Kegel", SPHERE: "Kugel", TORUS: "Torus" };
    if (faces.length) {
      const f = faces[0];
      out.push(this.section(`${faces.length} Fläche(n)`,
        h("dl", { class: "kv" }, h("dt", {}, "Typ"), h("dd", {}, typeName[f.info?.type] || f.info?.type || "–"),
          f.info?.normal ? [h("dt", {}, "Normale"), h("dd", {}, f.info.normal.map((x) => fmtNum(x, 3)).join(" / "))] : null,
          f.info?.radius ? [h("dt", {}, "Durchmesser"), h("dd", {}, "Ø " + fmtNum(2 * f.info.radius, 2) + " mm")] : null),
        f.info?.type === "PLANE" ? h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => app.createSketch(planeFromFace(f.info.point, f.info.normal)) }, "Skizze auf Fläche")) : null,
        h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.ribbon.run("shell") }, "Wandung (Fläche offen)"))));
    }
    if (edges.length) {
      out.push(this.section(`${edges.length} Kante(n)`,
        h("dl", { class: "kv" }, h("dt", {}, "Typ"), h("dd", {}, [...new Set(edges.map((e) => typeName[e.info?.type] || e.info?.type))].join(", "))),
        h("div", { class: "btn-row" },
          h("button", { class: "btn primary", onclick: () => app.ribbon.run("fillet") }, "Rundung"),
          h("button", { class: "btn", onclick: () => app.ribbon.run("chamfer") }, "Fase"))));
    }
    if (faces.length === 2 && faces.every((f) => f.info?.type === "PLANE")) {
      const [a, b] = faces;
      const n = a.info.normal, p = a.info.point, q = b.info.point;
      const dot = Math.abs(n[0] * b.info.normal[0] + n[1] * b.info.normal[1] + n[2] * b.info.normal[2]);
      if (dot > 0.9999) out.push(this.section("Messen", h("dl", { class: "kv" }, h("dt", {}, "Abstand der Flächen"), h("dd", {}, fmtNum(Math.abs((q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1] + (q[2] - p[2]) * n[2]), app.prefs.get("allgemein.dezimalstellen")) + " mm"))));
      else out.push(this.section("Messen", h("dl", { class: "kv" }, h("dt", {}, "Winkel"), h("dd", {}, fmtNum((Math.acos(Math.min(1, dot)) * 180) / Math.PI, app.prefs.get("allgemein.dezimalstellen")) + "°"))));
    }
    out.push(h("p", { class: "hint" }, "Strg/Umschalt+Klick wählt mehrere Elemente."));
    return out;
  }

  /** Ergebnis des Messwerkzeugs (exakte Kernwerte, siehe Kernel measure) */
  measureProps() {
    const app = this.app;
    const m = app.measure || {};
    const dec = app.prefs.get("allgemein.dezimalstellen");
    const L = (v) => fmtNum(v, dec) + " mm";
    const P = (p) => p.map((v) => fmtNum(v, dec)).join(" / ");
    const T = { PLANE: "Ebene Fläche", CYLINDER: "Zylinderfläche", CONE: "Kegelfläche", SPHERE: "Kugelfläche", TORUS: "Torusfläche", BSPLINE: "Freiformfläche", LINE: "Gerade Kante", CIRCLE: "Kreiskante", ELLIPSE: "Ellipsenkante", BSPLINE_CURVE: "Freiformkante" };
    const out = [h("p", { class: "hint" }, "Eine oder zwei Flächen/Kanten anklicken. Ein dritter Klick beginnt neu. Esc beendet.")];
    if (m.busy) out.push(h("p", { class: "hint" }, "Messe …"));
    if (m.error) out.push(h("div", { class: "msg err" }, m.error));
    const r = m.result;
    if (r) {
      r.items.forEach((it, i) => {
        const rows = [h("dt", {}, "Art"), h("dd", {}, T[it.type] || it.type)];
        if (it.area !== undefined) rows.push(h("dt", {}, "Fläche"), h("dd", {}, fmtNum(it.area, dec) + " mm²"));
        if (it.length !== undefined) rows.push(h("dt", {}, "Länge"), h("dd", {}, L(it.length)));
        if (it.radius !== undefined) rows.push(h("dt", {}, "Radius"), h("dd", {}, L(it.radius)), h("dt", {}, "Durchmesser"), h("dd", {}, "Ø " + L(2 * it.radius)));
        if (it.center && it.kind === "edge") rows.push(h("dt", {}, "Mittelpunkt"), h("dd", {}, P(it.center)));
        if (it.kind === "edge" && it.type === "LINE") rows.push(h("dt", {}, "Start"), h("dd", {}, P(it.start)), h("dt", {}, "Ende"), h("dd", {}, P(it.end)));
        if (it.normal) rows.push(h("dt", {}, "Normale"), h("dd", {}, it.normal.map((v) => fmtNum(v, 3)).join(" / ")));
        out.push(this.section(`Element ${i + 1}`, h("dl", { class: "kv" }, ...rows)));
      });
      if (r.items.length === 2) {
        const rows = [h("dt", {}, "Kürzester Abstand"), h("dd", {}, L(r.distance))];
        if (r.angle !== undefined) rows.push(h("dt", {}, "Winkel"), h("dd", {}, fmtNum(r.angle, dec) + "°"));
        const cc = centerDistance(r.items);
        if (cc !== null) rows.push(h("dt", {}, "Mittenabstand"), h("dd", {}, L(cc)));
        out.push(this.section("Zwischen beiden", h("dl", { class: "kv" }, ...rows)));
      }
    }
    out.push(h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.cancelPick() }, "Messen beenden")));
    return out;
  }

  sketchList(part, value, onChange, pred) {
    const sks = part.features.filter((f) => f.type === "sketch" && (!pred || pred(f)));
    return this.select("Skizze", [["", "– wählen –"], ...sks.map((s) => [s.id, s.name])], value || "", (v) => onChange(v));
  }
  opSeg(f) {
    return this.seg("Vorgang", [["join", "Vereinigen"], ["cut", "Differenz"], ["intersect", "Schnitt"], ["new", "Neuer Körper"]], f.op || "join", (v) => this.set(f, "op", v, "Vorgang"));
  }

  featureProps(part, f) {
    const app = this.app;
    const r = app.results.get(part.id);
    const st = r?.status?.[f.id];
    const out = [];
    out.push(...(this.msgs(st) || []).filter(Boolean));
    const E = (label, key, opts) => this.expr(label, f[key], (v) => this.set(f, key, v, label), opts);
    switch (f.type) {
      case "sketch": {
        out.push(this.section("Skizze",
          h("dl", { class: "kv" }, h("dt", {}, "Ebene"), h("dd", {}, f.plane.ref === "face" ? "auf Fläche" : BASE_PLANES[f.plane.ref]?.label || f.plane.ref),
            h("dt", {}, "Elemente"), h("dd", {}, String(f.entities.filter((e) => !e.origin).length)),
            h("dt", {}, "Freiheitsgrade"), h("dd", {}, st?.dof === 0 ? "vollständig bestimmt" : String(st?.dof ?? "–")),
            h("dt", {}, "Konturen"), h("dd", {}, String(r?.sketches?.[f.id]?.regions ?? "–"))),
          this.expr("Ebenen-Abstand", f.offset || "0", (v) => this.set(f, "offset", v, "Abstand")),
          h("div", { class: "btn-row" },
            h("button", { class: "btn primary", onclick: () => app.editSketch(f.id) }, "Skizze bearbeiten"),
            h("button", { class: "btn", onclick: () => app.files.exportSketchDxf(f.id) }, "DXF"))));
        const users = part.features.filter((g) => g.sketch === f.id);
        if (!users.length) out.push(this.section("Weiter mit", h("div", { class: "btn-row" },
          ...[["extrude", "Extrusion"], ["revolve", "Drehung"], ["hole", "Bohrung"], ["frame", "Rahmen"]].map(([a, l]) => h("button", { class: "btn", onclick: () => app.ribbon.run(a) }, l)))));
        break;
      }
      case "extrude":
        out.push(this.section("Extrusion",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze")),
          this.seg("Richtung", [["normal", "Normal"], ["reverse", "Umgekehrt"], ["symmetric", "Symmetrisch"], ["twoSided", "Beidseitig"], ["through", "Durch alles"]], f.mode || "normal", (v) => this.set(f, "mode", v, "Richtung")),
          f.mode !== "through" ? E("Abstand", "distance", { allowNeg: false, allowZero: false }) : null,
          f.mode === "twoSided" ? E("Abstand 2", "distance2") : null,
          this.opSeg(f)));
        break;
      case "revolve": {
        const sk = part.features.find((s) => s.id === f.sketch);
        const lines = sk ? sk.entities.filter((e) => e.type === "line") : [];
        out.push(this.section("Drehung",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze")),
          this.select("Achse", [["x", "Skizzen-X-Achse"], ["y", "Skizzen-Y-Achse"], ...lines.map((l, i) => [l.id, `Linie ${i + 1}${l.construction ? " (Konstruktion)" : ""}`])], f.axis || "y", (v) => this.set(f, "axis", v, "Achse")),
          E("Winkel", "angle", { unit: "°" }),
          this.opSeg(f)));
        break;
      }
      case "hole":
        out.push(this.section("Bohrung",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze")),
          this.select("Gewinde", [["", "ohne"], ...Object.keys(THREADS).map((k) => [k, `${k} (Kernloch Ø${String(THREADS[k]).replace(".", ",")})`])], f.thread || "", (v) => this.set(f, "thread", v || undefined, "Gewinde")),
          f.thread ? null : E("Durchmesser", "diameter", { allowNeg: false, allowZero: false }),
          f.thread ? null : h("div", { class: "hint" }, "Durchgang mittel: ", Object.entries(CLEARANCE).slice(2, 8).map(([k, v]) => `${k} → ${String(v).replace(".", ",")}`).join(", ")),
          this.seg("Ende", [["through", "Durch alles"], ["depth", "Tiefe"]], f.extent || "through", (v) => this.set(f, "extent", v, "Ende")),
          f.extent === "depth" ? E("Tiefe", "depth", { allowNeg: false }) : null,
          this.seg("Richtung", [["reverse", "Ins Material"], ["normal", "Normale"], ["both", "Beidseitig"]], f.direction || "reverse", (v) => this.set(f, "direction", v, "Richtung")),
          this.seg("Senkung", [["none", "Keine"], ["senkung", "Kegel"], ["flach", "Flach"]], f.sink || "none", (v) => this.set(f, (x) => { x.sink = v; if (v !== "none" && !x.sinkDiameter) { x.sinkDiameter = "2*(" + (x.diameter || "8") + ")"; x.sinkAngle = "90"; x.sinkDepth = "5"; } }, "Senkung")),
          f.sink && f.sink !== "none" ? E("Senk-Ø", "sinkDiameter") : null,
          f.sink === "senkung" ? E("Senkwinkel", "sinkAngle", { unit: "°" }) : null,
          f.sink === "flach" ? E("Senktiefe", "sinkDepth") : null));
        break;
      case "profile":
        out.push(this.sectionEditor(f));
        out.push(this.section("Lage",
          E("Länge (Mitte)", "length", { allowNeg: false, allowZero: false }),
          this.vec3("Startpunkt", f.start, (v) => this.set(f, "start", v, "Startpunkt")),
          this.seg("Richtung", [["X", "X"], ["Y", "Y"], ["Z", "Z"], ["-X", "−X"], ["-Y", "−Y"], ["-Z", "−Z"], ["custom", "frei"]], f.axis || "X", (v) => this.set(f, "axis", v, "Richtung")),
          f.axis === "custom" ? this.vec3("Richtungsvektor", f.dir || ["1", "0", "0"], (v) => this.set(f, "dir", v, "Richtung")) : null,
          E("Drehung um Achse", "rotation", { unit: "°" })));
        out.push(this.section("Gehrung / Schrägschnitt",
          E("Anfang", "miterStart", { unit: "°" }),
          E("Ende", "miterEnd", { unit: "°" }),
          this.seg("Schräg über", [["v", "Höhe"], ["u", "Breite"]], f.miterAxis || "v", (v) => this.set(f, "miterAxis", v, "Gehrungsachse")),
          this.check("Enden parallel (statt trapezförmig)", f.miterSame, (v) => this.set(f, "miterSame", v, "Gehrung")),
          h("p", { class: "hint" }, "Die Länge gilt auf der Mittellinie; die Zuschnittlänge (längste Kante) steht in der Zuschnittliste.")));
        break;
      case "frame":
        out.push(this.section("Rahmen",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze"), (s) => s.entities.some((e) => e.type === "line")),
          this.seg("Ecken", [["gehrung", "Gehrung"], ["stumpf", "Stumpf"]], f.corner || "gehrung", (v) => this.set(f, "corner", v, "Ecken")),
          this.seg("Lage zur Linie", [["mitte", "Mitte"], ["links", "Links"], ["rechts", "Rechts"]], f.align || "mitte", (v) => this.set(f, "align", v, "Lage")),
          E("Drehung", "rotation", { unit: "°" }),
          h("p", { class: "hint" }, "Jede Linie der Skizze wird zum Profil. Linien, die auf anderen enden, werden ausgeklinkt (T-Stoß).")));
        out.push(this.sectionEditor(f));
        break;
      case "knickrahmen": {
        const segs = f.segments || [], bends = f.bends || [];
        const setIn = (list, i, key, label) => (v) => this.set(f, (x) => { x[list][i] = { ...x[list][i], [key]: v }; }, label);
        const allow = r?.bodies?.find((b) => b.fid === f.id)?.meta?.bendAllowances || [];
        const inner = (j) => { try { return fmtNum(180 - Math.abs(evaluate(bends[j].angle, this.scope())), 2) + "°"; } catch { return "–"; } };
        out.push(this.section("Knickrahmen",
          this.seg("Ansicht", [["gefaltet", "Gefaltet"], ["abgewickelt", "Abgewickelt"]], f.view || "gefaltet", (v) => this.set(f, "view", v, "Ansicht")),
          h("p", { class: "hint" }, "Ein Bauteil: an jedem Knick V-förmig durch drei Wände ausgeklinkt, die Außenwand wird gebogen. »Gefaltet« zeigt die Gehrung als Trennlinie, »Abgewickelt« das gerade Rohr für den Rohrlaser (STEP, Zuschnittliste).")));
        out.push(this.sectionEditor(f, KNICK_SECTIONS));
        out.push(this.section("Lage",
          this.select("Ebene", ["XY", "XZ", "YZ"].map((k) => [k, BASE_PLANES[k].label]), f.plane || "XY", (v) => this.set(f, "plane", v, "Ebene")),
          E("Ebenen-Abstand", "offset"),
          this.expr("Start X", f.start?.[0] ?? "0", (v) => this.set(f, (x) => { x.start = [v, x.start?.[1] ?? "0"]; }, "Startpunkt")),
          this.expr("Start Y", f.start?.[1] ?? "0", (v) => this.set(f, (x) => { x.start = [x.start?.[0] ?? "0", v]; }, "Startpunkt")),
          E("Startrichtung", "direction", { unit: "°" }),
          this.seg("Profillage", [["hochkant", "B in Knickebene"], ["flach", "H in Knickebene"]], f.orientation || "hochkant", (v) => this.set(f, "orientation", v, "Profillage"))));
        const rows = [];
        segs.forEach((s, i) => {
          rows.push(this.expr(`Segment ${i + 1}`, s.length, setIn("segments", i, "length", `Segment ${i + 1}`), { allowNeg: false, allowZero: false }));
          if (i < bends.length) {
            const b = bends[i];
            rows.push(h("div", { class: "knick" },
              this.expr(`Knick ${i + 1}`, b.angle, setIn("bends", i, "angle", `Knick ${i + 1}`), { unit: "°" }),
              h("div", { class: "hint" }, `Innenwinkel ${inner(i)} · + = nach links, − = nach rechts`),
              this.text("Minimum °", b.min, setIn("bends", i, "min", "Minimum"), { placeholder: "–" }),
              this.text("Maximum °", b.max, setIn("bends", i, "max", "Maximum"), { placeholder: "–" }),
              Number.isFinite(allow[i]) ? h("div", { class: "hint" }, `Biegezugabe ${fmtNum(allow[i], 2)} mm (aus Radius und K-Faktor)`) : null));
          }
        });
        out.push(this.section("Biegung der Außenwand",
          E("Innenradius", "bendRadius", { allowNeg: false }),
          E("K-Faktor", "kFactor", { unit: "", allowNeg: false }),
          h("p", { class: "hint" }, "Biegezugabe je Knick = (Innenradius + K-Faktor · Wandstärke) · Winkel im Bogenmaß. Werte aus der Biegetabelle der Abkantung eintragen – die Vorgabe ist nur ein Startwert.")));
        const rk = f.relief === "rechteck" || f.relief === "keine" ? f.relief : "rund";
        const kmeta = r?.bodies?.find((b) => b.fid === f.id)?.meta;
        const mins = kmeta?.reliefMin || [];
        const minText = rk !== "keine" && mins.some(Boolean) ? "Mindestmaß: " + mins.map((m, j) => !m ? "" : `Knick ${j + 1}: ` + (m.dia ? `Ø ${fmtNum(m.dia, 1)}` : `${fmtNum(m.width, 1)} × ${fmtNum(m.height, 1)}`)).join(", ") + " mm" : "";
        out.push(this.section("Freistellung, Spalt, Zapfen",
          this.seg("Freistellung", [["keine", "Keine"], ["rund", "Rund (Langloch)"], ["rechteck", "Rechteckig"]], rk, (v) => this.set(f, "relief", v, "Freistellung")),
          rk === "keine" ? null : rk === "rund" ? this.text("Durchmesser", f.reliefDia, (v) => this.set(f, "reliefDia", v, "Freistellung"), { placeholder: "automatisch" })
            : [this.text("Breite", f.reliefWidth, (v) => this.set(f, "reliefWidth", v, "Freistellung"), { placeholder: "automatisch" }),
              this.text("Tiefe", f.reliefHeight, (v) => this.set(f, "reliefHeight", v, "Freistellung"), { placeholder: "automatisch" })],
          minText ? h("div", { class: "hint" }, minText) : null,
          E("Reststeg", "restWall", { allowNeg: false }),
          E("Schweißspalt", "weldGap", { allowNeg: false }),
          this.seg("Zapfen", [["aus", "Aus"], ["an", "An"]], f.tabs || "aus", (v) => this.set(f, "tabs", v, "Zapfen")),
          f.tabs === "an" ? [E("Zapfen-Durchmesser", "tabDia", { allowNeg: false, allowZero: false }), E("Zapfenspiel", "tabClearance", { allowNeg: false })] : null,
          h("p", { class: "hint" }, "Freistellung (empfohlen): hält die Seitenwände an der Außenwand über die ganze Biegezone frei, damit sie beim Biegen nicht eingedrückt werden; leer = Mindestmaß. „Keine“: die Flanken enden an einem Bogen um den Biegemittelpunkt, die Ecke bleibt geschlossen. Reststeg: der Schnitt endet so weit vor der Außenwand (Vorgabe 0,1 mm), der Steg wird mitgebogen. Schweißspalt typisch 0,5–1 mm. Zapfen: Nase auf der Gehrung am Segment vor dem Knick, Loch im Segment danach um das Spiel größer.")));
        out.push(this.section("Segmente und Knicke", ...rows,
          h("p", { class: "hint" }, "Längen auf der Mittellinie von Knoten zu Knoten."),
          h("div", { class: "btn-row" },
            segs.length < KNICK_LIMITS.maxSegments ? h("button", { class: "btn", onclick: () => this.set(f, (x) => { x.segments.push({ length: "400" }); x.bends.push({ angle: "30", min: "", max: "" }); }, "Segment hinzufügen") }, "+ Segment") : null,
            segs.length > 1 ? h("button", { class: "btn", onclick: () => this.set(f, (x) => { x.segments.pop(); x.bends.pop(); }, "Segment entfernen") }, "− Segment") : null)));
        break;
      }
      case "fillet":
      case "chamfer": {
        const isF = f.type === "fillet";
        const picking = app.pick?.kind === "edges" && app.pick.feature === f.id;
        out.push(this.section(isF ? "Rundung" : "Fase",
          E(isF ? "Radius" : "Abstand", "radius", { allowNeg: false, allowZero: false }),
          this.seg("Kanten", [["edges", "Gewählte"], ["dir", "Richtung"], ["all", "Alle"]], f.mode || "edges", (v) => { this.set(f, "mode", v, "Modus"); app.selectFeature(f.id); }),
          f.mode === "dir" ? this.seg("Parallel zu", [["X", "X"], ["Y", "Y"], ["Z", "Z"]], f.dir || "Z", (v) => this.set(f, "dir", v, "Richtung")) : null,
          (f.mode || "edges") === "edges" ? h("div", { class: picking ? "picking" : "" },
            h("div", {}, `${(f.edges || []).length} Kante(n) gewählt`),
            h("p", { class: "hint" }, picking ? "Kanten im 3D-Fenster anklicken (nochmal klicken entfernt)." : ""),
            h("div", { class: "btn-row" },
              h("button", { class: "btn" + (picking ? " primary" : ""), onclick: () => { if (picking) app.cancelPick(); else app.selectFeature(f.id); } }, picking ? "Auswahl beenden" : "Kanten wählen"),
              (f.edges || []).length ? h("button", { class: "btn", onclick: () => this.set(f, "edges", [], "Kanten leeren") }, "Leeren") : null)) : null));
        break;
      }
      case "shell": {
        const picking = app.pick?.kind === "faces" && app.pick.feature === f.id;
        out.push(this.section("Wandung",
          E("Wandstärke", "thickness", { allowNeg: false, allowZero: false }),
          h("div", { class: picking ? "picking" : "" }, `${(f.faces || []).length} offene Fläche(n)`,
            h("p", { class: "hint" }, "Flächen anklicken, die offen bleiben sollen."),
            h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => (picking ? app.cancelPick() : app.selectFeature(f.id)) }, picking ? "Auswahl beenden" : "Flächen wählen")))));
        break;
      }
      case "pattern": {
        const srcs = part.features.filter((g) => ["extrude", "revolve", "hole", "profile", "frame", "import"].includes(g.type) && g.id !== f.id);
        const axisSeg = (label, key, def) => this.seg(label, [["X", "X"], ["Y", "Y"], ["Z", "Z"], ["-X", "−X"], ["-Y", "−Y"], ["-Z", "−Z"]], f[key] || def, (v) => this.set(f, key, v, label));
        out.push(this.section(f.kind === "circular" ? "Kreismuster" : "Rechteckmuster",
          this.select("Feature", srcs.map((s) => [s.id, s.name]), f.feature, (v) => this.set(f, "feature", v, "Feature")),
          f.kind === "circular" ? [
            axisSeg("Achse", "axis", "Z"),
            this.vec3("Mittelpunkt", f.center, (v) => this.set(f, "center", v, "Mittelpunkt")),
            E("Anzahl", "count", { unit: "Stk" }),
            E("Gesamtwinkel", "angle", { unit: "°" }),
          ] : [
            axisSeg("Richtung 1", "dir", "X"),
            E("Anzahl 1", "count", { unit: "Stk" }),
            E("Abstand 1", "spacing"),
            this.check("Zweite Richtung", !!f.dir2, (v) => this.set(f, (x) => { x.dir2 = v ? "Y" : undefined; x.count2 = x.count2 || "2"; x.spacing2 = x.spacing2 || "20"; }, "Richtung 2")),
            f.dir2 ? [axisSeg("Richtung 2", "dir2", "Y"), E("Anzahl 2", "count2", { unit: "Stk" }), E("Abstand 2", "spacing2")] : null,
          ]));
        break;
      }
      case "mirror":
        out.push(this.section("Spiegeln",
          this.seg("Ebene", [["YZ", "YZ"], ["XZ", "XZ"], ["XY", "XY"]], f.plane || "YZ", (v) => this.set(f, "plane", v, "Ebene")),
          E("Abstand der Ebene", "offset"),
          this.check("Als getrennten Körper", f.separate, (v) => this.set(f, "separate", v, "Getrennt"))));
        break;
      case "import":
        out.push(this.section("Import",
          h("dl", { class: "kv" }, h("dt", {}, "Datei"), h("dd", {}, f.fileName || "–"), h("dt", {}, "Größe"), h("dd", {}, f.data ? fmtNum(f.data.length / 1024, 0) + " KB" : "–")),
          this.opSeg(f),
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.files.replaceImport(f) }, "Andere Datei…"))));
        break;
    }
    out.push(h("div", { class: "btn-row" },
      h("button", { class: "btn", onclick: () => this.set(f, "suppressed", !f.suppressed, "Unterdrücken") }, f.suppressed ? "Aktivieren" : "Unterdrücken"),
      h("button", { class: "btn danger", onclick: () => app.deleteFeature(f.id) }, icon("trash"), " Löschen")));
    return out;
  }
  sectionEditor(f, kinds = Object.keys(SECTION_KINDS)) {
    const kind = f.section || "vierkant";
    const def = SECTION_KINDS[kind];
    const cat = CATALOG[kind] || [];
    return this.section("Querschnitt",
      this.profileQuick(f, kinds),
      this.select("Profilart", kinds.map((k) => [k, SECTION_KINDS[k].label]), kind, (v) => this.set(f, (x) => { x.section = v; x.dims = catalogToDims(v, CATALOG[v][Math.floor(CATALOG[v].length / 2)]); }, "Profilart")),
      this.select("Normgröße", [["", "– eigene Maße –"], ...cat.map((c) => [c, c.replace(/\./g, ",")])], matchCatalog(kind, f.dims) || "", (v) => v && this.set(f, (x) => { x.dims = catalogToDims(kind, v); }, "Normgröße")),
      ...def.fields.map((k) => this.expr(FIELD_LABELS[k], f.dims?.[k] ?? "", (v) => this.set(f, (x) => { x.dims = { ...x.dims, [k]: v }; }, FIELD_LABELS[k]), { allowNeg: false })));
  }

  /** Profil-Schnelleingabe: Profil-ID oder Kurzform tippen ("40x3", "RE 70x50x4"), Treffer darunter zum Anklicken */
  profileQuick(f, kinds) {
    let current = "";
    try {
      const scope = this.scope();
      const d = Object.fromEntries(Object.entries(f.dims || {}).map(([k, v]) => [k, evaluate(String(v), scope)]));
      current = profileId(f.section || "vierkant", d);
    } catch { /* Maß mit Fehler: Feld bleibt leer */ }
    const inp = h("input", { class: "inp profile-quick", value: current, spellcheck: "false", placeholder: "z. B. 40x3, RE 60x40x3", title: "Profil-ID oder Maße tippen, Enter übernimmt" });
    const list = h("div", { class: "profile-hits" });
    const apply = (hit) => {
      list.replaceChildren();
      if (hit.kind === f.section && Object.keys(hit.dims).every((k) => String(f.dims?.[k]) === String(hit.dims[k]))) { inp.value = current; return; }
      this.set(f, (x) => { x.section = hit.kind; x.dims = { ...hit.dims }; }, "Profil " + hit.id);
    };
    const commit = () => {
      if (!inp.value.trim() || inp.value === current) { inp.classList.remove("bad"); list.replaceChildren(); return; }
      const r = resolveProfile(inp.value, kinds);
      if (r.error) { inp.classList.add("bad"); inp.title = r.error; toast(r.error, { kind: "err" }); return; }
      apply(r);
    };
    inp.addEventListener("input", () => {
      inp.classList.remove("bad");
      list.replaceChildren(...profileMatches(inp.value, kinds).map((e) =>
        h("button", { class: "profile-hit", onmousedown: (ev) => { ev.preventDefault(); apply(e); } }, e.id)));
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { inp.value = current; inp.classList.remove("bad"); list.replaceChildren(); }
    });
    inp.addEventListener("blur", () => setTimeout(() => list.replaceChildren(), 0));
    return [this.field("Profil-ID", inp), list];
  }

  // ---------- Skizzenmodus ----------
  sketchProps(part) {
    const app = this.app;
    const sk = app.sketcher.sk;
    if (!sk) return [];
    const out = [];
    const sel = app.sketchSel || [];
    const P = new Map(sk.points.map((p) => [p.id, p]));
    if (sel.length === 1) {
      const [t, id] = [sel[0][0], sel[0].slice(2)];
      if (t === "e") {
        const e = sk.entities.find((x) => x.id === id);
        if (e) {
          const label = { line: "Linie", circle: "Kreis", arc: "Bogen", point: "Punkt" }[e.type];
          const info = [];
          if (e.type === "line") { const a = P.get(e.p1), b = P.get(e.p2); info.push(h("dt", {}, "Länge"), h("dd", {}, fmtNum(Math.hypot(b.x - a.x, b.y - a.y), 3)), h("dt", {}, "Winkel"), h("dd", {}, fmtNum((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, 2) + "°")); }
          if (e.type === "circle") info.push(h("dt", {}, "Durchmesser"), h("dd", {}, fmtNum(2 * e.r, 3)));
          if (e.type === "arc") { const c = P.get(e.c), a = P.get(e.p1); info.push(h("dt", {}, "Radius"), h("dd", {}, fmtNum(Math.hypot(a.x - c.x, a.y - c.y), 3))); }
          out.push(this.section(label, h("dl", { class: "kv" }, ...info),
            e.origin ? null : this.check("Konstruktionslinie", e.construction, () => app.sketcher.toggleConstruction()),
            h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => app.sketcher.deleteSelection() }, "Löschen"))));
        }
      } else if (t === "p") {
        const p = P.get(id);
        if (p) {
          const fixed = sk.constraints.find((c) => c.type === "fix" && c.p === id);
          out.push(this.section("Punkt", h("dl", { class: "kv" }, h("dt", {}, "X"), h("dd", {}, fmtNum(p.x, 3)), h("dt", {}, "Y"), h("dd", {}, fmtNum(p.y, 3))),
            fixed && id !== "O" ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.sketcher.commit("Fixierung lösen", (s) => { s.constraints = s.constraints.filter((c) => c !== fixed && c.id !== fixed.id); }) }, "Fixierung lösen")) : null));
        }
      } else if (t === "c") {
        const c = sk.constraints.find((x) => x.id === id);
        if (c) {
          const names = { distance: "Abstand", length: "Länge", radius: "Radius", diameter: "Durchmesser", angle: "Winkel", horizontal: "Horizontal", vertical: "Vertikal", parallel: "Parallel", perpendicular: "Senkrecht", equal: "Gleich", tangent: "Tangential", tangentAt: "Tangential", fix: "Fixiert", coincident: "Koinzident", pointOnLine: "Punkt auf Linie", pointOnCircle: "Punkt auf Kreis", midpoint: "Mittelpunkt", concentric: "Konzentrisch", collinear: "Kollinear", symmetric: "Symmetrisch", offset: "Versatz" };
          out.push(this.section(names[c.type] || c.type,
            c.value !== undefined && !c.driven ? this.expr("Wert", c.value, (v) => app.sketcher.commit("Maß ändern", (s) => { s.constraints.find((k) => k.id === id).value = v; }), { unit: c.type === "angle" ? "°" : "mm" }) : null,
            c.driven ? h("p", { class: "hint" }, "Getriebenes Maß (nur Anzeige). Doppelklick auf das Maß macht es steuernd.") : null,
            c.id === "Of" ? null : this.check("Unterdrückt", !!c.disabled, (v) => app.sketcher.commit(v ? "Bedingung unterdrücken" : "Bedingung aktivieren", (s) => { const k = s.constraints.find((x) => x.id === id); if (v) k.disabled = true; else delete k.disabled; })),
            c.disabled ? h("p", { class: "hint" }, "Unterdrückt: bleibt gespeichert, wirkt aber nicht auf die Skizze.") : null,
            h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => app.sketcher.deleteSelection() }, "Löschen"))));
        }
      }
    } else if (sel.length > 1) {
      out.push(this.section(`${sel.length} Elemente gewählt`, h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: () => app.sketcher.toggleConstruction() }, "Konstruktion umschalten"),
        h("button", { class: "btn danger", onclick: () => app.sketcher.deleteSelection() }, "Löschen"))));
    }
    out.push(this.section(sk.name,
      h("dl", { class: "kv" }, h("dt", {}, "Ebene"), h("dd", {}, sk.plane.ref === "face" ? "auf Fläche" : BASE_PLANES[sk.plane.ref]?.label || sk.plane.ref)),
      h("p", { class: "hint" }, "Tasten: L Linie · R Rechteck · C Kreis · A Bogen · P Punkt · D Bemaßung · T Stutzen · F Rundung · X Konstruktion · Entf löschen · Esc beenden"),
      h("p", { class: "hint" }, "Maße akzeptieren Formeln mit Parametern, z. B. »Breite/2«."),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => app.finishSketch() }, "Skizze fertig"), h("button", { class: "btn", onclick: () => this.paramsDialog() }, "Parameter…"))));
    return out;
  }

  // ---------- Baugruppe ----------
  assemblyProps(asm) {
    const app = this.app;
    const out = [];
    out.push(this.section("Allgemein",
      this.text("Name", asm.name, (v) => app.edit("Name", () => { asm.name = v; }, { rebuild: false })),
      this.text("Nummer", asm.number, (v) => app.edit("Nummer", () => { asm.number = v; }, { rebuild: false })),
      this.text("Beschreibung", asm.description, (v) => app.edit("Beschreibung", () => { asm.description = v; }, { rebuild: false }), { area: true })));
    const rows = bomRows(app, asm);
    const total = rows.reduce((s, r) => s + (r.mass || 0) * r.qty, 0);
    out.push(this.section("Stückliste", bomTable(rows, true), h("dl", { class: "kv", style: { marginTop: "6px" } }, h("dt", {}, "Gesamtmasse"), h("dd", {}, fmtNum(total, 2) + " kg")),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: () => this.placeComponentDialog() }, "Bauteil platzieren"), h("button", { class: "btn", onclick: () => this.bomDialog() }, "Stückliste…"), h("button", { class: "btn", onclick: () => this.cutListDialog() }, "Zuschnittliste…"))));
    return out;
  }
  componentProps(asm, c) {
    const app = this.app;
    const p = app.doc(c.part);
    const upd = (label, fn) => app.edit(label, fn);
    return [
      this.section("Komponente",
        this.text("Name", c.name, (v) => upd("Name", () => { c.name = v; })),
        this.select("Bauteil", app.parts().map((x) => [x.id, x.name]), c.part, (v) => upd("Bauteil", () => { c.part = v; })),
        this.check("Fixiert", c.fixed, (v) => upd("Fixieren", () => { c.fixed = v; })),
        this.check("Ausgeblendet", c.hidden, (v) => upd("Sichtbarkeit", () => { c.hidden = v; }))),
      this.section("Lage",
        this.vec3("Position", c.pos, (v) => upd("Position", () => { c.pos = v; }), { numeric: true }),
        this.vec3("Drehung X/Y/Z °", c.rot, (v) => upd("Drehung", () => { c.rot = v; }), { numeric: true }),
        h("div", { class: "btn-row" },
          ...[["X", 0], ["Y", 1], ["Z", 2]].map(([l, i]) => h("button", { class: "btn", title: `90° um ${l}`, disabled: c.fixed, onclick: () => upd("Drehen", () => { c.rot = c.rot.map((x, k) => (k === i ? (x + 90) % 360 : x)); }) }, `↻ ${l}`))),
        h("div", { class: "btn-row" },
          h("button", { class: "btn primary", disabled: c.fixed, onclick: () => { app.beginAlign("gegen"); app.align.first = null; } }, "Fläche an Fläche"),
          h("button", { class: "btn", disabled: c.fixed, onclick: () => app.beginAlign("buendig") }, "Bündig"))),
      h("div", { class: "btn-row" },
        p ? h("button", { class: "btn", onclick: () => app.openDoc(p.id) }, "Bauteil bearbeiten") : null,
        h("button", { class: "btn", onclick: () => this.duplicateComponent(c.id) }, "Duplizieren"),
        h("button", { class: "btn danger", onclick: () => this.deleteComponent(c.id) }, "Entfernen")),
    ];
  }
  constraintProps(asm, c) {
    const app = this.app;
    const err = app.asmErrors?.[c.id];
    const comp = (id) => asm.components.find((x) => x.id === id);
    return [
      err ? h("div", { class: "msg err" }, err) : null,
      this.section(c.name || "Abhängigkeit",
        h("dl", { class: "kv" }, h("dt", {}, "Bewegt"), h("dd", {}, comp(c.b.comp)?.name || "–"), h("dt", {}, "Ziel"), h("dd", {}, comp(c.a.comp)?.name || "–")),
        this.seg("Art", [["gegen", "Gegeneinander"], ["buendig", "Bündig"]], c.type, (v) => app.edit("Abhängigkeit", () => { c.type = v; c.name = c.name?.replace(/^[^:]+/, v === "buendig" ? "Bündig" : "Fläche an Fläche"); })),
        this.expr("Abstand", c.gap || "0", (v) => app.edit("Abstand", () => { c.gap = v; })),
        this.check("Unterdrückt", c.suppressed, (v) => app.edit("Abhängigkeit", () => { c.suppressed = v; }))),
      h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => this.deleteConstraint(c.id) }, "Löschen")),
    ];
  }
  deleteConstraint(id) {
    const asm = this.app.activeDoc();
    this.app.edit("Abhängigkeit löschen", () => { asm.constraints = (asm.constraints || []).filter((c) => c.id !== id); this.app.sel = null; });
  }
  alignProps() {
    const app = this.app;
    const a = app.align || {};
    const conc = a.mode === "konzentrisch";
    return [this.section(conc ? "Konzentrisch ausrichten" : a.mode === "buendig" ? "Bündig ausrichten" : "Fläche an Fläche",
      h("p", {}, conc ? (a.first ? "2. Zylinderfläche (Bohrung, Rohr) am anderen Bauteil anklicken." : "1. Zylinderfläche am Bauteil anklicken, das bewegt wird.") : a.first ? "2. Zielfläche am anderen Bauteil anklicken." : "1. Fläche am Bauteil anklicken, das bewegt wird."),
      this.seg("Art", [["gegen", "Gegeneinander"], ["buendig", "Bündig"], ["konzentrisch", "Konzentrisch"]], a.mode || "gegen", (v) => { app.align.mode = v; app.align.first = null; app.refreshSelectionHits(); this.render(); }),
      conc ? h("p", { class: "hint" }, "Achsen fluchten; Lage entlang der Achse und Drehung um sie bleiben frei – mit »Fläche an Fläche« festlegen.") : this.expr("Abstand", a.gap || "0", (v) => { app.align.gap = v; }),
      this.check("Als Abhängigkeit speichern (folgt Änderungen)", a.persist !== false, (v) => { app.align.persist = v; }),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.cancelPick() }, "Abbrechen")))];
  }
  placeComponentDialog() {
    const app = this.app;
    const asm = app.activeDoc();
    if (asm?.kind !== "assembly") return;
    const parts = app.parts();
    if (!parts.length) return toast("Im Projekt gibt es noch kein Bauteil");
    let chosen = parts[0].id;
    const qty = h("input", { class: "inp", type: "number", min: 1, value: 1 });
    const list = h("div", {}, ...parts.map((p) => h("label", { class: "chk" }, h("input", { type: "radio", name: "pp", checked: p.id === chosen, onchange: () => { chosen = p.id; } }), p.name, p.number ? h("span", { class: "hint" }, " " + p.number) : null)));
    modal({
      title: "Bauteil platzieren",
      body: h("div", {}, list, this.field("Anzahl", qty)),
      buttons: [{ label: "Abbrechen" }, { label: "Platzieren", primary: true, run: () => {
        const n = Math.max(1, Math.min(100, Number(qty.value) || 1));
        const p = app.doc(chosen);
        const r = app.results.get(chosen);
        const bb = r ? unionBox(r.bodies.map((b) => b.props?.bbox).filter(Boolean)) : null;
        const w = bb ? bb[1][0] - bb[0][0] + 20 : 100;
        app.edit("Platzieren", () => {
          const existing = asm.components.length;
          for (let i = 0; i < n; i++) asm.components.push({ id: uid("c"), part: chosen, name: `${p.name}:${asm.components.filter((c) => c.part === chosen).length + 1}`, pos: [(existing + i) * w * 0 + i * w, 0, 0], rot: [0, 0, 0], fixed: asm.components.length === 0 && i === 0 });
        });
      } }],
    });
  }
  newPartForAssembly() {
    const app = this.app;
    const asm = app.activeDoc();
    const p = app.newPart();
    app.edit("Bauteil einfügen", () => { asm.components.push({ id: uid("c"), part: p.id, name: p.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0] }); }, { rebuild: false });
    toast(`»${p.name}« angelegt und in »${asm.name}« eingefügt`);
  }
  deleteComponent(id) {
    const asm = this.app.activeDoc();
    this.app.edit("Komponente entfernen", () => {
      asm.components = asm.components.filter((c) => c.id !== id);
      asm.constraints = (asm.constraints || []).filter((c) => c.a.comp !== id && c.b.comp !== id);
      this.app.sel = null;
    });
  }
  duplicateComponent(id) {
    const asm = this.app.activeDoc();
    const c = asm.components.find((x) => x.id === id);
    const copy = { ...JSON.parse(JSON.stringify(c)), id: uid("c"), fixed: false, name: c.name.replace(/:\d+$/, "") + ":" + (asm.components.filter((x) => x.part === c.part).length + 1) };
    copy.pos = [c.pos[0] + 50, c.pos[1], c.pos[2]];
    this.app.edit("Duplizieren", () => asm.components.push(copy));
    this.app.sel = { type: "component", id: copy.id };
  }

  // ---------- Dialoge ----------
  paramsDialog() {
    const app = this.app;
    const part = app.activeDoc();
    if (part?.kind !== "part") return toast("Parameter gehören zu einem Bauteil");
    const rows = JSON.parse(JSON.stringify(part.params));
    const tbody = h("tbody");
    const draw = () => {
      const { values, errors } = resolveParams(rows);
      tbody.replaceChildren(...rows.map((r, i) => {
        const name = h("input", { class: "inp", value: r.name, style: { width: "130px" } });
        const ex = h("input", { class: "inp", value: r.expr, style: { width: "160px", fontFamily: "var(--din)" } });
        const cm = h("input", { class: "inp", value: r.comment || "" });
        name.addEventListener("change", () => { r.name = name.value.trim(); draw(); });
        ex.addEventListener("change", () => { r.expr = ex.value.trim(); draw(); });
        cm.addEventListener("change", () => { r.comment = cm.value; });
        const bad = !isValidName(r.name) || rows.filter((x) => x.name === r.name).length > 1;
        if (bad) name.classList.add("bad");
        if (errors[r.name]) { ex.classList.add("bad"); ex.title = errors[r.name]; }
        return h("tr", {}, h("td", {}, name), h("td", {}, ex), h("td", { class: "num" }, errors[r.name] ? "Fehler" : fmtNum(values[r.name], 4)), h("td", {}, cm),
          h("td", {}, h("button", { class: "icon-btn", title: "Entfernen", onclick: () => { rows.splice(i, 1); draw(); } }, icon("trash"))));
      }));
    };
    draw();
    modal({
      title: `Parameter – ${part.name}`, width: "760px",
      body: h("div", {},
        h("table", { class: "grid" }, h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "Ausdruck"), h("th", {}, "Wert"), h("th", {}, "Kommentar"), h("th"))), tbody),
        h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => { let n = rows.length + 1; while (rows.some((r) => r.name === "P" + n)) n++; rows.push({ name: "P" + n, expr: "10", comment: "" }); draw(); } }, icon("plus"), " Parameter")),
        h("p", { class: "hint" }, "Parameter können in jedem Maß verwendet werden, z. B. »Länge - 2*Rand«. Funktionen: sin, cos, tan (Grad), sqrt, min, max, round, wenn(Bedingung; dann; sonst). Dezimalkomma ist erlaubt.")),
      buttons: [{ label: "Abbrechen" }, { label: "Übernehmen", primary: true, run: () => {
        const names = rows.map((r) => r.name);
        if (rows.some((r) => !isValidName(r.name))) { toast("Ungültiger Parametername (Buchstabe am Anfang, keine Leerzeichen)", { kind: "err" }); return false; }
        if (new Set(names).size !== names.length) { toast("Parameternamen müssen eindeutig sein", { kind: "err" }); return false; }
        app.edit("Parameter", () => { part.params = rows; });
      } }],
    });
  }
  bomDialog() {
    const app = this.app;
    const asm = app.activeDoc();
    const rows = bomRows(app, asm);
    modal({ title: `Stückliste – ${asm.name}`, width: "760px", body: bomTable(rows), buttons: [{ label: "Schließen" }, { label: "Als CSV exportieren", primary: true, run: () => app.files.exportBom() }] });
  }
  cutListDialog() {
    const app = this.app;
    const d = app.activeDoc();
    const rows = cutListRows(collectCutSources(app, d));
    modal({ title: `Zuschnittliste – ${d.name}`, width: "820px", body: rows.length ? h("div", {}, cutListTable(rows), this.dfmList(rows, true), h("details", { class: "hint" }, h("summary", {}, "Regeln der Zuschnittliste"), h("ul", {}, ...CUT_RULES.map((t) => h("li", {}, t))))) : h("p", {}, "Keine Profile (Rohr / Rahmen) enthalten."), buttons: [{ label: "Schließen" }, { label: "Als CSV exportieren", primary: true, run: () => app.files.exportCutList() }] });
  }
  /** Fertigungsprüfung Rohrlaser (src/core/dfm.js) unter der Zuschnittliste; Grenzen im Einstellungscenter */
  dfmList(rows, rules = false) {
    const found = checkCutList(rows, dfmLimits((k) => this.app.prefs.get(k)));
    const cls = { Fehler: "err", Warnung: "warn", Hinweis: "info" };
    return h("div", { class: "dfm" },
      found.length
        ? found.map((f) => h("div", { class: "msg " + cls[f.level] }, h("b", {}, `Pos ${f.pos} · ${f.rule}: `), f.text))
        : h("div", { class: "msg info" }, "Fertigungsprüfung: keine Befunde"),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.settingsDialog({ category: "fertigung" }) }, "Maschinengrenzen…")),
      rules ? h("details", { class: "hint" }, h("summary", {}, "Regeln der Fertigungsprüfung"), h("ul", {}, ...DFM_RULES.map((t) => h("li", {}, t)))) : null);
  }
  /** Kollisionsprüfung der Baugruppe (Schnittvolumen > 1 mm³; Berührung zählt nicht) */
  async collisionDialog() {
    const app = this.app;
    const asm = app.activeDoc();
    if (asm?.kind !== "assembly") return;
    const comps = asm.components.filter((c) => !c.hidden && app.doc(c.part));
    if (comps.length < 2) return toast("Mindestens zwei sichtbare Komponenten nötig");
    const name = (id) => { const c = asm.components.find((x) => x.id === id); return c?.name || app.doc(c?.part)?.name || id; };
    const busy = toast("Kollisionen werden geprüft …", { timeout: 0 });
    let res;
    try { res = await app.kernel.call("collisions", { items: comps.map((c) => ({ key: c.id, part: app.doc(c.part), pos: c.pos, rot: c.rot, name: c.name })) }); }
    catch (e) { busy.remove(); return toast("Kollisionsprüfung fehlgeschlagen: " + e.message, { kind: "err" }); }
    busy.remove();
    app.collisions = res;
    const show = (r) => app.viewer.setSelectionHits([{ kind: "group", key: "comp:" + r.a }, { kind: "group", key: "comp:" + r.b }]);
    if (res[0]) show(res[0]);
    const body = res.length
      ? h("div", {}, h("p", {}, `${res.length} Kollision(en) – Zeile anklicken, um die beiden Komponenten zu markieren.`),
        h("table", { class: "grid" }, h("thead", {}, h("tr", {}, h("th", {}, "Komponente"), h("th", {}, "Komponente"), h("th", {}, "Überschneidung"))),
          h("tbody", {}, ...res.map((r) => h("tr", { style: { cursor: "pointer" }, onclick: () => show(r) }, h("td", {}, name(r.a)), h("td", {}, name(r.b)), h("td", { class: "num" }, r.unsure ? "nicht messbar" : fmtNum(r.volume / 1000, 2) + " cm³"))))))
      : h("p", {}, `Keine Kollision zwischen ${comps.length} Komponenten. Berührende Flächen zählen nicht als Kollision.`);
    modal({ title: `Kollisionsprüfung – ${asm.name}`, width: "620px", body, buttons: [{ label: "Schließen", primary: true, run: () => app.refreshSelectionHits() }] });
    return res;
  }
  /** Einstellungscenter (src/ui/settings.js); Updates sind dort eine eigene Kategorie */
  settingsDialog(opts) { return settingsCenter(this.app, opts); }
  aboutDialog() {
    const v = window.werkcad?.version || "Entwicklerversion";
    modal({ title: "Über PBCAD", body: h("div", { style: { maxWidth: "52ch" } },
      h("p", { style: { marginTop: 0 } }, h("b", {}, "PBCAD "), v),
      h("p", {}, "Parametrisches 3D-CAD für Bauteile, Rohr- und Profilkonstruktionen, Baugruppen und Zeichnungen."),
      h("p", { class: "hint" }, "Geometrie-Kern: OpenCascade (über replicad). 3D-Darstellung: three.js. Bedienung angelehnt an gängige Konstruktionsprogramme."),
      window.werkcad?.openLogFolder ? h("p", { class: "hint" }, "Bei Problemen hilft das Fehlerprotokoll (enthält keine Projektdaten).") : null),
    buttons: [window.werkcad?.openLogFolder ? { label: "Protokollordner öffnen", run: () => window.werkcad.openLogFolder() } : null, { label: "OK", primary: true }].filter(Boolean) });
  }
}

/** Mittenabstand: zwei Kreiskanten → Abstand der Mittelpunkte; zwei parallele Zylinder → Achsabstand */
export function centerDistance(items) {
  const [a, b] = items;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const len = (v) => Math.hypot(v[0], v[1], v[2]);
  const pa = a.kind === "edge" ? a.center : a.axisP, pb = b.kind === "edge" ? b.center : b.axisP;
  if (!pa || !pb || !a.axisD || !b.axisD) return null;
  const dot = a.axisD[0] * b.axisD[0] + a.axisD[1] * b.axisD[1] + a.axisD[2] * b.axisD[2];
  if (Math.abs(Math.abs(dot) - 1) > 1e-9) return null;
  const d = sub(pb, pa);
  if (a.kind === "edge" && b.kind === "edge") return len(d);
  // Abstand paralleler Achsen: Anteil senkrecht zur Achse
  const t = d[0] * a.axisD[0] + d[1] * a.axisD[1] + d[2] * a.axisD[2];
  return len([d[0] - t * a.axisD[0], d[1] - t * a.axisD[1], d[2] - t * a.axisD[2]]);
}

/** Volumengewichteter Schwerpunkt mehrerer Körper (gleicher Werkstoff) */
function centerOf(bodies) {
  let V = 0;
  const c = [0, 0, 0];
  for (const b of bodies) {
    const v = b.props?.volume, p = b.props?.center;
    if (!(v > 0) || !p) return null;
    V += v;
    for (let k = 0; k < 3; k++) c[k] += p[k] * v;
  }
  return V > 0 ? c.map((x) => x / V) : null;
}

// ---------- Listen ----------
export function unionBox(boxes) {
  if (!boxes.length) return null;
  const o = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const b of boxes) for (let k = 0; k < 3; k++) { o[0][k] = Math.min(o[0][k], b[0][k]); o[1][k] = Math.max(o[1][k], b[1][k]); }
  return o;
}
export function bomRows(app, asm) {
  const map = new Map();
  for (const c of asm.components) {
    const p = app.doc(c.part);
    if (!p) continue;
    const r = app.results.get(p.id);
    const vol = r ? r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0) : NaN;
    const mass = (vol * (MATERIALS[p.material]?.density || 7.85)) / 1e6;
    const row = map.get(p.id) || { part: p, name: p.name, number: p.number || "", material: MATERIALS[p.material]?.label || p.material, qty: 0, mass };
    row.qty++;
    map.set(p.id, row);
  }
  return [...map.values()].map((r, i) => ({ ...r, pos: i + 1 }));
}
function bomTable(rows, compact = false) {
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Pos"), h("th", {}, "Benennung"), compact ? null : h("th", {}, "Nummer"), h("th", {}, "Menge"), compact ? null : h("th", {}, "Werkstoff"), h("th", {}, "Masse kg"))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, String(r.pos)), h("td", {}, r.name), compact ? null : h("td", {}, r.number), h("td", { class: "num" }, String(r.qty)), compact ? null : h("td", {}, r.material), h("td", { class: "num" }, fmtNum(r.mass, 3))))));
}
export function collectCutSources(app, d) {
  if (d.kind === "part") { const r = app.results.get(d.id); return r ? [{ part: d, result: r, qty: 1 }] : []; }
  if (d.kind === "assembly") {
    const counts = new Map();
    for (const c of d.components) counts.set(c.part, (counts.get(c.part) || 0) + 1);
    return [...counts].map(([pid, qty]) => ({ part: app.doc(pid), result: app.results.get(pid), qty })).filter((x) => x.part && x.result);
  }
  return [];
}
function cutListTable(rows, compact = false) {
  const miter = (r) => endsText(r);
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Pos"), h("th", {}, "Profil"), h("th", {}, "Länge"), h("th", {}, "Stk"), h("th", {}, "Enden"), compact ? null : h("th", {}, "kg/m"), compact ? null : h("th", {}, "kg/Stk"), compact ? null : h("th", {}, "Werkstoff"))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, String(r.pos)), h("td", { title: r.section, style: { whiteSpace: "nowrap" } }, r.profileId), h("td", { class: "num" }, fmtNum(r.length, 1)), h("td", { class: "num" }, String(r.qty)), h("td", {}, miter(r)),
      compact ? null : h("td", { class: "num" }, fmtNum(r.kgm, 2)), compact ? null : h("td", { class: "num" }, fmtNum(r.mass, 2)), compact ? null : h("td", {}, r.material)))));
}
function matchCatalog(kind, dims) {
  if (!dims) return null;
  for (const c of CATALOG[kind] || []) {
    const d = catalogToDims(kind, c);
    if (Object.keys(d).every((k) => String(d[k]) === String(dims[k]))) return c;
  }
  return null;
}
export { FEATURE_NAMES, scaleLabel, cutListRows, endsText };
