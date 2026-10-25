// Eigenschaften-Fenster und Dialoge (Parameter, Stückliste, Zuschnittliste, Einstellungen)
import { RULES } from "../core/bendtable.js";
import { settingsCenter } from "./settings.js";
import { h, icon, toast, modal, fmtNum, confirmDialog, promptDialog } from "./dom.js";
import { evaluate, resolveParams, isValidName } from "../core/expr.js";
import { SECTION_KINDS, fieldLabel, CATALOG, catalogToDims, profileId, sectionGeometry, kgPerMeter, THREADS, CLEARANCE } from "../core/sections.js";
import { profileMatches, resolveProfile } from "../core/profilesearch.js";
import { LIB_GROUPS, groupOfMaterial, groupKinds, mainSizes, wallsFor, wallLabel, hasWall, findEntry, pickEntry, defaultEntry, mainOfDims, mainLabel, splitSize } from "../core/profillib.js";
import { BASE_PLANES, planeFromFace } from "../core/geom.js";
import { PLANE_MODES, AXIS_MODES, POINT_MODES } from "../core/datums.js";
import { sketchRefs } from "../core/featurerefs.js";
import { COMBINE_OPS, SPLIT_KEEP, THICKEN_SIDES } from "../core/koerper.js";
import { CONSTRAINT_TYPES } from "../core/asmsolve.js";
import { defaultAsmPattern } from "../core/asmmuster.js";
import { CAP_MODES, equalParts } from "../core/rahmen.js";
import { uid } from "../core/examples.js";
import { KNICK_LIMITS, KNICK_SECTIONS } from "../core/knickrahmen.js";
import { cutListRows, cutListTotals, endsText, partsText, CUT_RULES } from "../core/cutlist.js";
import { checkCutList, dfmLimits, DFM_RULES } from "../core/dfm.js";
import { TUBE_CUT_KINDS, TUBE_CUT_FIELDS, TUBE_CUT_SECTIONS, SIDES, TILT_QUICK, defaultTubeCut, parsePattern, parsePolygon, atEnd } from "../core/tubecuts.js";
import { END_CUT_SECTIONS, featureCutSettings } from "../core/endcut.js";
import { contourSketch } from "../core/massbild.js";
import { resolvePathPoints, nextPointDefault } from "../core/profilzug.js";
import { BIEGEROHR_SECTIONS, bendListCsv } from "../core/biegerohr.js";
import { PLATE_HOLES, RIB_SIDES } from "../core/anschluss.js";
import { GENERATORS, applyTemplate, genValues, resolveGenParams } from "../core/generator.js";
import { sketchViews, VIEW_LABEL, fieldParts } from "../core/genskizze.js";
import { sketchSvg, linkFieldToSketch } from "./genskizze.js";
import { listTemplates, getTemplate, saveTemplate, deleteTemplate } from "./gentemplates.js";
import { WELD_KINDS, WELD_SIDES, weldRows, collectWelds, weldText } from "../core/weld.js";
import { REGEL_KINDS, REGEL_DEFAULTS, regelLabel, regelVolume } from "../core/regelkoerper.js";
import { newPart, newAssembly } from "../core/examples.js";
import { NORM_KINDS, NORM_SIZES, BOLT_LENGTHS, defaultNormteil, normDesignation, collectNorm } from "../core/normteile.js";
import { patternOf } from "../core/sketchshapes.js";
import { inertiaFromMeshes } from "../core/inertia.js";
import { bodiesMass, hasOwnDensity } from "../core/mass.js";
import { decomposePlacement, matMul, placementMatrix, matApply, matApplyDir } from "../core/geom.js";
import { defaultJoint, jointDelta, setJointAngle, swingAngle, sweepAngles, jointFollowers, isSlide, isCylinder, slideDelta, setJointSlide, jointUnit, jointLabel } from "../core/kinematik.js";
import { flattenAssembly, partCounts, canInsert, structureBom, modularBom } from "../core/subasm.js";
import { materialOf, materialList } from "../core/materials.js";
import { FINISHES, RAL, finishOf, finishLabel, ralName } from "../core/oberflaeche.js";
import { ellipseGeom, ellipsePerimeter } from "../core/ellipse.js";
import { splineLength, splineDegree } from "../core/spline.js";

const INERTIA = new WeakMap(); // Ergebnis → Trägheitswerte
import { FEATURE_NAMES } from "./app.js";
import { scaleLabel } from "./tree.js";
import { gestellSections, memberSection } from "./gestell.js";

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
  /** Oberfläche (E7): roh, verzinkt, pulver/duplex/lack mit RAL-Farbe */
  finishSelect(part) {
    const app = this.app, f = finishOf(part);
    const setF = (next, label) => app.edit(label, () => { part.finish = next.kind === "roh" ? null : next; });
    const kind = this.select("Oberfläche", Object.entries(FINISHES).map(([k, d]) => [k, d.label]), f.kind, (k) => setF({ kind: k, ral: FINISHES[k].ral ? f.ral || "7016" : undefined }, "Oberfläche"));
    if (!f.def.ral) return kind;
    const known = Object.keys(RAL);
    const ral = this.select("RAL-Farbe", [...known.map((k) => [k, ralName(k)]), ...(f.ral && !RAL[f.ral] ? [[f.ral, ralName(f.ral)]] : [])], f.ral, (v) => setF({ kind: f.kind, ral: v }, "RAL-Farbe"));
    const free = this.text("RAL frei", f.ral, (v) => setF({ kind: f.kind, ral: v.replace(/^RAL\s*/i, "").trim() }, "RAL-Farbe"), { placeholder: "z. B. 6029" });
    return h("div", {}, kind, ral, free, part.color ? h("p", { class: "hint" }, "Eigene Farbe ist gesetzt und geht vor – »Wie Werkstoff« zeigt die RAL-Farbe.") : null);
  }
  /** Werkstoffauswahl: eingebaute und eigene in Gruppen; unbekannter Schlüssel mit Warnung */
  materialSelect(part) {
    const app = this.app, mat = materialOf(part.material), all = materialList();
    const opt = (m) => h("option", { value: m.key }, m.label + (m.source === "project" ? " (aus Projektdatei)" : ""));
    const groups = [["builtin", "Eingebaut"], ["user", "Eigene"], ["project", "Nur in dieser Datei"]]
      .map(([src, label]) => [label, all.filter((m) => m.source === src)]).filter(([, l]) => l.length);
    const sel = h("select", { class: "inp" }, ...groups.map(([label, list]) => h("optgroup", { label }, ...list.map(opt))));
    sel.value = mat.key;
    sel.addEventListener("change", () => app.edit("Werkstoff", () => { part.material = sel.value; }));
    const warn = part.material && mat.source === "fallback"
      ? h("div", { class: "msg warn" }, `Werkstoff »${part.material}« ist unbekannt – gerechnet wird mit ${mat.label}.`) : null;
    return h("div", {}, this.field("Werkstoff", sel), warn);
  }
  seg(label, options, value, onChange) {
    const wrap = h("div", { class: "seg" }, ...options.map(([v, l]) => h("button", { class: v === value ? "on" : "", onclick: () => v !== value && onChange(v), title: l }, l)));
    return label ? this.field(label, wrap) : wrap;
  }
  /** Skizze der Generator-Einstellungen mit Ansichtswahl; null, wenn der Bauplan gerade nicht rechnet */
  /**
   * Einstellungen eines Generators (Skizze, Felder mit Meldungen, Vorlagen). f: { gen, params, name }; part: Bauteil
   * oder Baugruppe (Werkstoffgruppe, Hervorhebung nur im Bauteil); update(fn, label) ändert f mit Rückgängig.
   */
  genFields(f, part, update) {
    const app = this.app, out = [];
    const gen = GENERATORS[f.gen];
    const P = genValues(f.gen, f.params);
    const setP = (key, v, label) => update((x) => { x.params = { ...x.params, [key]: v }; }, label);
    // Skizze mit Maßen (Bebilderung der Einstellungen); Fokus auf einem Feld hebt sein Maß hervor
    const scope = this.scope();
    const planOf = (params) => gen.plan(resolveGenParams(f.gen, params, (x) => evaluate(String(x), scope)));
    let svg = null;
    const sketch = this.genSketch(f, gen, P, planOf, (el) => { svg = el; });
    if (sketch) out.push(sketch);
    // Fehler und Hinweise des Bauplans direkt am betroffenen Feld (V5)
    let planErr = null, planIssues = [];
    try { planIssues = planOf(f.params).issues || []; } catch (e) { planErr = e; }
    const msgsFor = (key) => [...(planErr?.key === key ? [["err", planErr.message]] : []), ...planIssues.filter((x) => x.key === key).map((x) => [x.level === "Hinweis" ? "hint" : "warn", x.message])];
    // Fokus auf einem Feld hebt die zugehörigen Körper im 3D-Fenster hervor
    const markBodies = (key) => (on) => {
      const rx = on && part.kind === "part" && fieldParts(gen, key), bodies = rx ? app.results.get(part.id)?.bodies || [] : [];
      app.viewer.highlightBodies(rx ? bodies.flatMap((b, i) => (b.fid === f.id && rx.test(b.name || "") ? [i] : [])) : []);
    };
    const groups = [];
    for (const s of gen.schema) {
      if (s.when && !s.when(P)) continue;
      let g = groups.find((x) => x.name === (s.group || ""));
      if (!g) groups.push((g = { name: s.group || "", items: [] }));
      const v = P[s.key];
      const n0 = g.items.length;
      if (s.type === "num") g.items.push(this.expr(s.label, String(v), (x) => setP(s.key, x, s.label), { unit: s.unit || "mm" }));
      else if (s.type === "list") g.items.push(this.text(s.label + " (mm, mit ; trennen)", String(v), (x) => setP(s.key, x, s.label), { placeholder: "3000; 1500" }));
      else if (s.type === "check") g.items.push(this.check(s.label, !!v, (x) => setP(s.key, x, s.label)));
      else if (s.type === "select" && s.tiles) g.items.push(this.genTiles(s, v, P, planOf, (x) => setP(s.key, x, s.label)));
      else if (s.type === "select") g.items.push(this.select(s.label, s.options, v, (x) => setP(s.key, x, s.label)));
      else if (s.type === "section") {
        g.items.push(...this.genSectionPicker(s, v, part, (x) => setP(s.key, x, s.label)));
      }
      for (const el of g.items.slice(n0)) linkFieldToSketch(el, s.key, () => svg, markBodies(s.key));
      const msgs = msgsFor(s.key);
      if (msgs.length) {
        g.items.slice(n0).forEach((el) => el.classList?.add(msgs.some(([k]) => k === "err") ? "field-bad" : "field-warn"));
        g.items.push(...msgs.map(([k, m]) => h("p", { class: "field-msg " + k }, m)));
      }
    }
    for (const g of groups) out.push(this.section(g.name, ...g.items));
    const tpls = listTemplates(f.gen);
    out.push(this.section("Vorlagen",
      tpls.length ? this.select("Vorlage laden", [["", "– wählen –"], ...tpls.map((t) => [t, t])], "", (name) => name && update((x) => { x.params = applyTemplate(f.gen, x.params, getTemplate(f.gen, name)); }, "Vorlage " + name)) : null,
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: async () => {
          const name = await promptDialog("Vorlage speichern", "Name der Vorlage", f.name || gen.label);
          if (!name) return;
          if (saveTemplate(f.gen, name.trim(), f.params)) { toast(`Vorlage „${name.trim()}“ gespeichert`, { kind: "ok" }); this.render(); } else toast("Vorlage konnte nicht gespeichert werden", { kind: "err" });
        } }, "Als Vorlage speichern"),
        tpls.length ? h("button", { class: "btn", onclick: async () => {
          const name = await promptDialog("Vorlage löschen", "Name der Vorlage", tpls[0]);
          if (name && tpls.includes(name.trim())) { deleteTemplate(f.gen, name.trim()); this.render(); }
        } }, "Vorlage löschen") : null),
      h("p", { class: "hint" }, "Vorlagen merken sich alle Werte dieses Generators auf diesem Rechner. Das Modell rechnet bei jeder Änderung neu; Zuschnittliste, Gewicht und STEP enthalten alle Stäbe.")));
    return out;
  }
  genSketch(f, gen, P, planOf, setSvg) {
    let plan;
    try { plan = planOf(f.params); } catch { return null; }
    const views = sketchViews(gen);
    this.genView = this.genView || {};
    const view = views.includes(this.genView[f.gen]) ? this.genView[f.gen] : views[0];
    const svg = sketchSvg(plan, view, { gen, p: resolvedOrNull(() => resolveGenParams(f.gen, f.params, (x) => evaluate(String(x), this.scope()))) || P });
    setSvg(svg);
    return this.section("Skizze",
      views.length > 1 ? this.seg("", views.map((v) => [v, VIEW_LABEL[v]]), view, (v) => { this.genView[f.gen] = v; this.render(); }) : null,
      h("div", { class: "gsk-wrap" }, svg));
  }
  /** Auswahl als Bildkacheln: jede Variante als kleine Ansicht des Bauplans mit diesem Wert */
  genTiles(s, value, P, planOf, onChange) {
    const tiles = s.options.map(([v, label]) => {
      let pic = null;
      try { pic = sketchSvg(planOf({ ...P, [s.key]: v }), s.tiles, { dims: false, cls: "gsk tile-pic" }); } catch { /* Variante passt gerade nicht */ }
      return h("button", { class: "tile" + (v === value ? " on" : ""), title: label, onclick: () => v !== value && onChange(v) }, pic || h("div", { class: "tile-pic none" }), h("span", {}, label));
    });
    return this.field(s.label, h("div", { class: "tiles" }, ...tiles), true);
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
    if (app.viewer.fieldGroup?.children.length) app.viewer.highlightBodies([]); // Feld-Hervorhebung gehört zum alten Feld
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
      } else if (app.sel?.type === "asmpattern") {
        const p = (d.patterns || []).find((x) => x.id === app.sel.id);
        if (p) { title = p.name || "Komponentenmuster"; body.append(...this.asmPatternProps(d, p)); }
      } else if (app.sel?.type === "component") {
        const c = d.components.find((x) => x.id === app.sel.id);
        if (c?.pat) { title = c.name; body.append(...this.patternCopyProps(d, c)); }
        else if (c) { title = c.name || "Komponente"; body.append(...this.componentProps(d, c)); }
      } else { title = "Baugruppe"; body.append(...this.assemblyProps(d)); }
    }
    this.el.replaceChildren(h("div", { class: "pane-head" }, h("span", { class: "grow" }, title)), body);
  }

  /** Bauteil als eigene Datei (M24): Verknüpfung anzeigen, aktualisieren, lösen – oder Datei anlegen */
  linkSection(part) {
    const app = this.app, l = part.link;
    if (!l) return this.section("Datei", h("p", { class: "hint" }, "Bauteil liegt in diesem Projekt. Als eigene Datei kann es in mehreren Projekten und Baugruppen verwendet und getrennt bearbeitet werden."),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.files.savePartAsFile(part) }, "Als eigene Datei speichern")));
    const when = l.time ? new Date(l.time).toLocaleString("de-DE") : "–";
    return this.section("Verknüpft",
      h("div", { class: "msg info" }, `Dieses Bauteil kommt aus ${l.path.split(/[\\/]/).pop()} und ist hier schreibgeschützt. Ändern in der Quelldatei, dann »Aktualisieren«.`),
      h("dl", { class: "kv" }, h("dt", {}, "Datei"), h("dd", { title: l.path, style: { wordBreak: "break-all" } }, l.path), h("dt", {}, "Stand"), h("dd", {}, when)),
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", onclick: () => app.files.refreshLinks() }, "Aktualisieren"),
        app.files.bridge ? h("button", { class: "btn", onclick: () => app.files.open(l.path) }, "Quelldatei öffnen") : null,
        h("button", { class: "btn", onclick: () => app.edit("Verknüpfung lösen", () => { delete part.link; }, { link: true, rebuild: false }) }, "Verknüpfung lösen")));
  }

  // ---------- Bauteil ----------
  partProps(part) {
    const app = this.app;
    const r = app.results.get(part.id);
    const out = [this.linkSection(part)];
    out.push(this.section("Allgemein",
      this.text("Name", part.name, (v) => app.edit("Name", () => { part.name = v; }, { rebuild: false })),
      this.text("Teilenummer", part.number, (v) => app.edit("Nummer", () => { part.number = v; }, { rebuild: false })),
      this.text("Beschreibung", part.description, (v) => app.edit("Beschreibung", () => { part.description = v; }, { rebuild: false }), { area: true }),
      this.materialSelect(part),
      this.finishSelect(part),
      this.field("Farbe", h("div", { style: { display: "flex", gap: "6px" } },
        h("input", { type: "color", value: app.partColor(part), onchange: (e) => app.edit("Farbe", () => { part.color = e.target.value; }) }),
        part.color ? h("button", { class: "btn", onclick: () => app.edit("Farbe", () => { part.color = null; }) }, "Wie Werkstoff") : null))));
    if (r) {
      const vol = r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0);
      const dens = materialOf(part.material).density;
      const bb = unionBox(r.bodies.map((b) => b.props?.bbox).filter(Boolean));
      out.push(this.section("Masse-Eigenschaften", h("dl", { class: "kv" },
        h("dt", {}, "Volumen"), h("dd", {}, fmtNum(vol / 1000, 2) + " cm³"),
        h("dt", {}, "Masse"), h("dd", {}, fmtNum(bodiesMass(r.bodies, dens), 3) + " kg"),
        h("dt", {}, "Dichte"), h("dd", {}, fmtNum(dens, 2) + " g/cm³" + (hasOwnDensity(r.bodies) ? " (Glas, Gitterrost, Holz eigene)" : "")),
        h("dt", {}, "Oberfläche"), h("dd", {}, fmtNum(r.bodies.reduce((s, b) => s + (b.props?.area || 0), 0) / 100, 2) + " cm²"),
        centerOf(r.bodies) ? [h("dt", {}, "Schwerpunkt"), h("dd", {}, centerOf(r.bodies).map((v) => fmtNum(v, 1)).join(" / ") + " mm")] : null,
        bb ? [h("dt", {}, "Abmessungen"), h("dd", {}, `${fmtNum(bb[1][0] - bb[0][0], 1)} × ${fmtNum(bb[1][1] - bb[0][1], 1)} × ${fmtNum(bb[1][2] - bb[0][2], 1)}`)] : null,
        h("dt", {}, "Körper"), h("dd", {}, String(r.bodies.length))),
        this.inertiaBlock(r, dens, vol)));
      const members = r.bodies.filter((b) => b.kind === "member");
      if (members.length) {
        const rows = cutListRows([{ part, result: r, qty: 1 }]);
        out.push(this.section("Zuschnittliste", cutListTable(rows, true), this.dfmList(rows),
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.files.exportMembers() }, "Profile als STEP"), h("button", { class: "btn", onclick: () => app.files.exportCutList() }, "CSV"))));
        // Gleichteile: welche Stäbe gleich gefertigt werden (gleiches Profil, Länge, Enden, Ausklinkungen)
        const eq = equalParts(members, part.material).filter((g) => g.count > 1);
        if (eq.length) out.push(this.section("Gleichteile",
          h("dl", { class: "kv eqparts" }, ...eq.flatMap((g, i) => [h("dt", {}, `${String.fromCharCode(65 + (i % 26))} · ${g.count}×`), h("dd", {}, `${g.profileId} L ${fmtNum(g.length, 1)}: ${g.names.join(", ")}`)])),
          h("p", { class: "hint" }, "Gleich gefertigte Stäbe: in der Zuschnittliste eine Zeile mit Anzahl.")));
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
    const T = { PLANE: "Ebene Fläche", CYLINDER: "Zylinderfläche", CONE: "Kegelfläche", SPHERE: "Kugelfläche", TORUS: "Torusfläche", BSPLINE: "Freiformfläche", POINT: "Ecke", LINE: "Gerade Kante", CIRCLE: "Kreiskante", ELLIPSE: "Ellipsenkante", BSPLINE_CURVE: "Freiformkante" };
    const out = [h("p", { class: "hint" }, "Eine oder zwei Flächen, Kanten oder Ecken anklicken (Ecke: nahe am Kantenende). Ein dritter Klick beginnt neu. Esc beendet.")];
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
        if (it.point) rows.push(h("dt", {}, "Lage X/Y/Z"), h("dd", {}, P(it.point)));
        if (it.normal) rows.push(h("dt", {}, "Normale"), h("dd", {}, it.normal.map((v) => fmtNum(v, 3)).join(" / ")));
        out.push(this.section(`Element ${i + 1}`, h("dl", { class: "kv" }, ...rows)));
      });
      if (r.items.length === 2) {
        const rows = [h("dt", {}, "Kürzester Abstand"), h("dd", {}, L(r.distance))];
        if (r.angle !== undefined) rows.push(h("dt", {}, "Winkel"), h("dd", {}, fmtNum(r.angle, dec) + "°"));
        if (r.delta) rows.push(h("dt", {}, "Δ X/Y/Z"), h("dd", {}, P(r.delta)));
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

  /** Nahtliste des Bauteils (alle Nähte: Feature „Schweißnaht“, Platten und Rippen mit a-Maß) */
  weldListSection(part) {
    const rows = weldRows(collectWelds(collectCutSources(this.app, part)));
    if (!rows.length) return null;
    return this.section("Nahtliste",
      h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", {}, "Pos"), h("th", {}, "Naht"), h("th", {}, "Anz."), h("th", {}, "Länge mm"), h("th", {}, "kg"))),
        h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, String(r.pos)), h("td", {}, weldText(r)), h("td", { class: "num" }, String(r.count)), h("td", { class: "num" }, fmtNum(r.length, 0)), h("td", { class: "num" }, fmtNum(r.mass, 3)))))),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.app.files.exportWeldList() }, "Nahtliste CSV")));
  }
  /** Normteile des Bauteils mit Anzahl */
  normListSection(part) {
    const rows = collectNorm([{ bodies: this.app.results.get(part.id)?.bodies }]);
    if (!rows.length) return null;
    return this.section("Normteile im Bauteil",
      h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", {}, "Bezeichnung"), h("th", {}, "Anz."), h("th", {}, "kg/Stk"))),
        h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", {}, r.name), h("td", { class: "num" }, String(r.qty)), h("td", { class: "num" }, fmtNum(r.mass, 3)))))));
  }
  /** Baugruppe: Normteil wählen, als eigenes Bauteil anlegen (gleiche Bezeichnung → vorhandenes Bauteil) und platzieren */
  normteilDialog() {
    const app = this.app;
    const asm = app.activeDoc();
    if (asm?.kind !== "assembly") return;
    const f = defaultNormteil("schraube4017");
    const sel = (opts, val, on) => h("select", { class: "inp", onchange: (e) => on(e.target.value) }, ...opts.map(([v, l]) => h("option", { value: v, selected: v === val }, l)));
    const body = h("div");
    const qty = h("input", { class: "inp", type: "number", min: 1, value: 1 });
    const draw = () => {
      const def = NORM_KINDS[f.kind];
      const len = h("input", { class: "inp", type: "number", min: 1, value: f.length, oninput: (e) => { f.length = e.target.value; name.textContent = normDesignation(f); } });
      const name = h("b", {}, normDesignation(f));
      body.replaceChildren(
        this.field("Art", sel(Object.entries(NORM_KINDS).map(([k, d]) => [k, `${d.label} (${d.norm})`]), f.kind, (v) => { const d = defaultNormteil(v); f.kind = v; f.grade = d.grade; f.length = d.length; draw(); })),
        this.field("Gewinde", sel(NORM_SIZES.map((s) => [s, s]), f.size, (v) => { f.size = v; draw(); })),
        def.length ? this.field(f.kind === "gewindestange" ? "Länge mm" : "Nennlänge mm", len) : null,
        this.field("Festigkeit", sel(def.grades.map((g) => [g, g]), f.grade, (v) => { f.grade = v; draw(); })),
        this.field("Anzahl", qty),
        h("p", {}, name));
    };
    draw();
    modal({
      title: "Normteil einfügen",
      body,
      buttons: [{ label: "Abbrechen" }, { label: "Einfügen", primary: true, run: () => {
        const designation = normDesignation(f);
        const n = Math.max(1, Math.min(100, Number(qty.value) || 1));
        let p = app.parts().find((x) => x.normDesignation === designation);
        app.edit("Normteil einfügen", () => {
          if (!p) {
            p = newPart(designation);
            p.normDesignation = designation;
            p.features.push({ id: uid("f"), name: designation, ...f, pos: ["0", "0", "0"], axis: "Z" });
            app.project.docs.push(p);
          }
          const have = asm.components.filter((c) => c.part === p.id).length;
          for (let i = 0; i < n; i++) asm.components.push({ id: uid("c"), part: p.id, name: `${designation}:${have + i + 1}`, pos: [i * 40, 0, 0], rot: [0, 0, 0] });
        });
        toast(`${n} × ${designation} eingefügt`, { kind: "ok" });
      } }],
    });
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
          h("dl", { class: "kv" }, h("dt", {}, "Ebene"), h("dd", {}, f.plane.ref === "face" ? "auf Fläche" : f.plane.ref === "datum" ? part.features.find((g) => g.id === f.plane.id)?.name || "Arbeitsebene fehlt" : BASE_PLANES[f.plane.ref]?.label || f.plane.ref),
            h("dt", {}, "Elemente"), h("dd", {}, String(f.entities.filter((e) => !e.origin).length)),
            h("dt", {}, "Freiheitsgrade"), h("dd", {}, st?.dof === 0 ? "vollständig bestimmt" : String(st?.dof ?? "–")),
            h("dt", {}, "Konturen"), h("dd", {}, String(r?.sketches?.[f.id]?.regions ?? "–"))),
          this.expr("Ebenen-Abstand", f.offset || "0", (v) => this.set(f, "offset", v, "Abstand")),
          h("div", { class: "btn-row" },
            h("button", { class: "btn primary", onclick: () => app.editSketch(f.id) }, "Skizze bearbeiten"),
            h("button", { class: "btn", onclick: () => app.files.exportSketchDxf(f.id) }, "DXF"))));
        const users = part.features.filter((g) => sketchRefs(g).includes(f.id));
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
      case "emboss":
        out.push(this.section("Prägen / Gravieren",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze")),
          this.seg("Art", [["gravieren", "Gravieren"], ["praegen", "Prägen"]], f.mode || "gravieren", (v) => this.set(f, "mode", v, "Art")),
          E(f.mode === "praegen" ? "Höhe" : "Tiefe", "depth", { allowNeg: false, allowZero: false }),
          this.seg("Blickrichtung", [["auto", "Auto"], ["reverse", "Vorne"], ["normal", "Hinten"]], f.direction || "auto", (v) => this.set(f, "direction", v, "Richtung")),
          this.check("Auf Rohr abwickeln (Längen bleiben auf dem Umfang gleich)", f.wrap !== false, (v) => this.set(f, "wrap", v, "Abwickeln")),
          h("p", { class: "hint" }, "Gravieren = vertieft, Prägen = erhaben. Jede geschlossene Kontur der Skizze kommt auf die erste Fläche, die sie in Blickrichtung trifft (vorne = auf die Skizze geschaut, hinten = durch sie hindurch, Auto = erst vorne, dann hinten): ebene Flächen senkrecht, Rundrohre abgewickelt um den Umfang (Skizzenebene parallel zur Rohrachse). Über eine Kante gibt eine Warnung (Gravur über Kante).")));
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
          END_CUT_SECTIONS.includes(f.section || "vierkant") ? this.cutModeFields(f, "beide Enden dieses Profils") : null,
          h("p", { class: "hint" }, "Die Länge gilt auf der Mittellinie; die Zuschnittlänge (längste Kante) steht in der Zuschnittliste.")));
        out.push(this.tubeCutsEditor(f));
        break;
      case "frame":
        out.push(this.section("Rahmen",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze"), (s) => s.entities.some((e) => e.type === "line")),
          this.seg("Ecken", [["gehrung", "Gehrung"], ["stumpf", "Stumpf"]], f.corner || "gehrung", (v) => this.set(f, "corner", v, "Ecken")),
          this.seg("Lage zur Linie", [["mitte", "Mitte"], ["links", "Links"], ["rechts", "Rechts"]], f.align || "mitte", (v) => this.set(f, "align", v, "Lage")),
          E("Drehung", "rotation", { unit: "°" }),
          h("p", { class: "hint" }, "Jede Linie der Skizze wird zum Profil. Linien, die auf anderen enden, werden ausgeklinkt (T-Stoß).")));
        out.push(this.sectionEditor(f));
        if (END_CUT_SECTIONS.includes(f.section || "vierkant")) out.push(this.section("Schnitt 2D / 3D", this.cutModeFields(f, "alle Gehrungen dieses Rahmens")));
        break;
      case "profilzug": {
        const rows = this.pathPointsEditor(f, true);
        out.push(this.section("Profilzug",
          ...rows,
          this.check("Geschlossen (letzter Punkt zurück zum ersten)", !!f.closed, (v) => this.set(f, "closed", v, "Geschlossen")),
          this.seg("Ecken", [["gehrung", "Gehrung"], ["stumpf", "Stumpf"]], f.corner || "gehrung", (v) => this.set(f, "corner", v, "Ecken")),
          this.seg("Lage zur Linie", [["mitte", "Mitte"], ["links", "Links"], ["rechts", "Rechts"]], f.align || "mitte", (v) => this.set(f, "align", v, "Lage")),
          this.seg("Profilhöhe zeigt nach", [["Z", "Z"], ["Y", "Y"], ["X", "X"]], f.up || "Z", (v) => this.set(f, "up", v, "Oben")),
          E("Drehung aller Profile", "rotation", { unit: "°" }),
          h("p", { class: "hint" }, "Eckpunkte im Raum eingeben (absolut oder als Δ zum vorigen Punkt). Jedes Segment wird ein Profil; an den Ecken auf der Winkelhalbierenden gegehrt – auch wenn die Ecke in zwei Ebenen abknickt. Läuft ein Segment parallel zur gewählten Höhenrichtung, zeigt die Höhe nach Y (bzw. Z).")));
        out.push(this.sectionEditor(f));
        if (END_CUT_SECTIONS.includes(f.section || "vierkant")) out.push(this.section("Schnitt 2D / 3D", this.cutModeFields(f, "alle Gehrungen dieses Profilzugs")));
        break;
      }
      case "regelkoerper": {
        const kind = f.kind || "zylinder";
        let volText = "–";
        try { const sc = this.scope(); volText = fmtNum(regelVolume(kind, Object.fromEntries(REGEL_KINDS[kind].fields.map((k) => [k, evaluate(String(f.dims?.[k] ?? "0"), sc)]))) / 1000, 1) + " cm³"; } catch { /* Maß mit Fehler */ }
        out.push(this.section("Regelkörper",
          this.select("Form", Object.entries(REGEL_KINDS).map(([k, d]) => [k, d.label]), kind, (v) => this.set(f, (x) => { x.kind = v; x.dims = { ...REGEL_DEFAULTS[v] }; }, "Form")),
          ...REGEL_KINDS[kind].fields.map((k) => this.expr(regelLabel(kind, k), f.dims?.[k] ?? "", (v) => this.set(f, (x) => { x.dims = { ...x.dims, [k]: v }; }, regelLabel(kind, k)), { allowNeg: false, allowZero: kind === "kegel" && k === "d" })),
          h("dl", { class: "kv" }, h("dt", {}, "Volumen"), h("dd", {}, volText)),
          kind === "kegel" ? h("p", { class: "hint" }, "d = 0 ergibt einen Spitzkegel, d > 0 einen Kegelstumpf.") : null));
        out.push(this.section("Lage",
          this.vec3(kind === "kugel" || kind === "torus" ? "Mittelpunkt" : "Basispunkt (Mitte unten)", f.pos, (v) => this.set(f, "pos", v, "Basispunkt")),
          this.seg("Achse", [["Z", "Z"], ["Y", "Y"], ["X", "X"], ["-Z", "−Z"], ["-Y", "−Y"], ["-X", "−X"], ["custom", "frei"]], f.axis || "Z", (v) => this.set(f, "axis", v, "Achse")),
          f.axis === "custom" ? this.vec3("Richtungsvektor", f.dir || ["0", "0", "1"], (v) => this.set(f, "dir", v, "Richtung")) : null,
          this.opSeg(f)));
        break;
      }
      case "kantteil": {
        const sh = r?.bodies?.find((b) => b.fid === f.id)?.meta?.sheet;
        out.push(this.section("Querschnitt",
          this.text("Schenkel (mm, mit ; trennen)", f.legs || "", (v) => this.set(f, "legs", v, "Schenkel"), { placeholder: "40; 100; 40" }),
          this.text("Biegewinkel (°, + auf / − ab)", f.angles || "", (v) => this.set(f, "angles", v, "Biegewinkel"), { placeholder: "90; 90" }),
          this.seg("Maßbezug", [["aussen", "außen"], ["innen", "innen"], ["mitte", "Mitte Blech"]], f.ref || "aussen", (v) => this.set(f, "ref", v, "Maßbezug")),
          E("Blechdicke", "t", { allowNeg: false, allowZero: false }),
          E("Innenradius", "ri", { allowNeg: false }),
          this.select("Biegeregel", RULES.map((x) => [x.value, x.label]), f.rule || "k", (v) => this.set(f, "rule", v, "Biegeregel")),
          E((f.rule || "k") === "k" ? "K-Faktor" : "K-Faktor ohne Tabelle", "k", { unit: "", allowNeg: false }),
          E("Länge (Kantlänge)", "length", { allowNeg: false, allowZero: false }),
          sh?.rule && (f.rule || "k") !== "k" ? h("p", { class: "hint" }, "Gerechnet: " + sh.rule) : null,
          h("p", { class: "hint" }, "Schenkel von Biegung zu Biegung, Winkel zwischen den Schenkeln (90 = rechtwinklig nach oben, −90 nach unten). Biegezugabe = (ri + K · t) · Winkel – wie beim Knickrahmen. Mit »Biegetabelle« kommt K je Biegung aus Einstellungen → Blechparameter (Werkstoff und Dicke des Bauteils).")));
        out.push(this.section("Lage und Ansicht",
          this.vec3("Startpunkt (Mitte Blech)", f.pos || ["0", "0", "0"], (v) => this.set(f, "pos", v, "Startpunkt")),
          this.seg("Ansicht", [["gefaltet", "gefaltet"], ["abgewickelt", "abgewickelt"]], f.view || "gefaltet", (v) => this.set(f, "view", v, "Ansicht")),
          sh ? h("dl", { class: "kv" }, h("dt", {}, "Abwicklung"), h("dd", {}, `${fmtNum(sh.flat, 2)} × ${fmtNum(sh.length, 1)} mm`), h("dt", {}, "Biegelinien"), h("dd", {}, sh.bendLines.map((x) => fmtNum(x, 2)).join(" · ") || "–")) : null,
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.app.files.exportKantteilDxf(f) }, "Abwicklung als DXF"))));
        break;
      }
      case "normteil": {
        const kind = f.kind || "schraube4017", def = NORM_KINDS[kind];
        out.push(this.section("Normteil",
          this.select("Art", Object.entries(NORM_KINDS).map(([k, d]) => [k, `${d.label} (${d.norm})`]), kind, (v) => this.set(f, (x) => { const d = defaultNormteil(v); x.kind = v; x.grade = d.grade; if (NORM_KINDS[v].length && !NORM_KINDS[kind].length) x.length = d.length; if (v === "gewindestange" && kind !== v) x.length = "1000"; }, "Art")),
          this.select("Gewinde", NORM_SIZES.map((s) => [s, s]), f.size || "M12", (v) => this.set(f, "size", v, "Gewinde")),
          def.length ? E(kind === "gewindestange" ? "Länge" : "Nennlänge (unter Kopf)", "length", { allowNeg: false, allowZero: false }) : null,
          def.length && kind !== "gewindestange" ? h("p", { class: "hint" }, "Vorzugslängen: " + BOLT_LENGTHS.filter((l) => l <= 200).join(", ")) : null,
          this.select("Festigkeit / Werkstoff", def.grades.map((g) => [g, g]), f.grade || def.grades[0], (v) => this.set(f, "grade", v, "Festigkeit")),
          kind !== "spannschloss" ? this.check("feuerverzinkt (tZn)", !!f.galv, (v) => this.set(f, "galv", v, "Verzinkt")) : null,
          h("dl", { class: "kv" }, h("dt", {}, "Bezeichnung"), h("dd", {}, st?.info || normDesignation({ ...f, kind })))));
        out.push(this.section("Lage",
          this.vec3(kind.startsWith("schraube") ? "Basispunkt (Kopfunterseite)" : kind === "spannschloss" ? "Mittelpunkt" : "Basispunkt (Auflagefläche)", f.pos, (v) => this.set(f, "pos", v, "Basispunkt")),
          this.seg("Achse", [["Z", "Z"], ["Y", "Y"], ["X", "X"], ["-Z", "−Z"], ["-Y", "−Y"], ["-X", "−X"], ["custom", "frei"]], f.axis || "Z", (v) => this.set(f, "axis", v, "Achse")),
          f.axis === "custom" ? this.vec3("Richtungsvektor", f.dir || ["0", "0", "1"], (v) => this.set(f, "dir", v, "Richtung")) : null,
          h("p", { class: "hint" }, "Normteile bleiben eigene Körper und stehen mit Normbezeichnung in der Stückliste. Mehrere gleiche: Feature »Muster«.")));
        out.push(this.normListSection(part));
        break;
      }
      case "platte": {
        const targets = part.features.filter((g) => ["profile", "frame", "profilzug"].includes(g.type));
        const members = (r?.bodies || []).filter((b) => b.fid === f.target && b.kind === "member");
        out.push(this.section("Anschluss am Stabende",
          this.select("Profil", targets.map((g) => [g.id, g.name]), f.target, (v) => this.set(f, (x) => { x.target = v; x.member = 0; }, "Profil")),
          members.length > 1 ? this.select("Stab", members.map((b, i) => [String(i), b.name]), String(f.member ?? 0), (v) => this.set(f, "member", Number(v), "Stab")) : null,
          this.seg("Ende", [["A", "Anfang (A)"], ["B", "Ende (B)"]], f.end || "A", (v) => this.set(f, "end", v, "Ende")),
          h("p", { class: "hint" }, "Die Platte sitzt außen am Stabende, mittig auf der Achse; das Profil wird nicht gekürzt. Automatische Größe = Profil + 2 × Überstand. So entstehen Stirn-, Kopf- und Fußplatten.")));
        out.push(this.section("Platte",
          E("Dicke", "thickness", { allowNeg: false, allowZero: false }),
          E("Überstand je Seite", "overhang", { allowNeg: false }),
          E("Breite (0 = automatisch)", "width", { allowNeg: false }),
          E("Höhe (0 = automatisch)", "height", { allowNeg: false }),
          E("Eckradius", "radius", { allowNeg: false }),
          E("Kehlnaht a, umlaufend (0 = keine)", "weldA", { allowNeg: false })));
        out.push(this.section("Bohrbild",
          this.seg("Bohrungen", PLATE_HOLES.map((n) => [String(n), String(n)]), String(f.holes ?? "4"), (v) => this.set(f, "holes", v, "Bohrungen")),
          Number(f.holes ?? 4) ? [E("Bohrung Ø", "holeDia", { allowNeg: false, allowZero: false }), E("Randabstand (Mitte Bohrung)", "edge", { allowNeg: false })] : null,
          h("p", { class: "hint" }, "2 Bohrungen liegen auf der längeren Seite, 4 in den Ecken. Hinweis bei Randabstand unter 1,2 · d. Als DXF für den Laser: Fläche der Platte wählen → Export → Platte als DXF.")));
        out.push(this.section("Stoß und Verschraubung",
          this.check("Gegenplatte (Stirnplattenstoß zweier Stäbe)", !!f.counter, (v) => this.set(f, "counter", v, "Gegenplatte")),
          Number(f.holes ?? 4) ? this.check("verschrauben (Schraube, Scheiben, Mutter)", !!f.bolts, (v) => this.set(f, "bolts", v, "Verschraubung")) : null,
          f.bolts && Number(f.holes ?? 4) ? [
            this.select("Schraube", [["", "passend zur Bohrung"], ...NORM_SIZES.map((s) => [s, s])], f.boltSize || "", (v) => this.set(f, "boltSize", v || undefined, "Schraube")),
            this.select("Festigkeit", NORM_KINDS.schraube4017.grades.map((g) => [g, g]), f.boltGrade || "8.8", (v) => this.set(f, "boltGrade", v, "Festigkeit")),
            this.check("feuerverzinkt (tZn)", !!f.galv, (v) => this.set(f, "galv", v, "Verzinkt")),
            E("zusätzliche Klemmlänge (z. B. Stützenflansch)", "clampExtra", { allowNeg: false }),
          ] : null,
          h("p", { class: "hint" }, "Gegenplatte = gleiche Platte für den anschließenden Stab (Pfetten-, Träger- oder Rahmenstoß). Die Schrauben gehen durch beide Platten; für eine Kopfplatte an einem Stützenflansch die Flanschdicke als zusätzliche Klemmlänge angeben. Schraubenlänge = nächste Vorzugslänge.")));
        out.push(this.normListSection(part));
        out.push(this.weldListSection(part));
        break;
      }
      case "generator": {
        if (!GENERATORS[f.gen]) break;
        out.push(...this.genFields(f, part, (fn, label) => this.set(f, fn, label)));
        if (f.gen === "schiebetor") out.push(this.section("Baugruppe",
          h("p", { class: "hint" }, "Legt Flügel und feste Teile als zwei Bauteile an und setzt sie in eine neue Baugruppe; der Flügel bekommt ein Schiebegelenk über die ganze Durchfahrt (öffnen, Bewegungsbereich prüfen, animieren)."),
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.slidingGateAssembly(f, (params) => GENERATORS[f.gen].plan(resolveGenParams(f.gen, params, (x) => evaluate(String(x), this.scope())))) }, "Als Baugruppe mit Schiebegelenk"))));
        else out.push(this.section("Baugruppe",
          h("p", { class: "hint" }, "Legt eine Baugruppe an, in der jedes Rohr, jeder Stab und jedes Blech ein eigenes Bauteil ist (gleiche Teile einmal, mehrfach eingesetzt). Die Maße bleiben in der Baugruppe einstellbar; in den Bauteilen kann man weiter bearbeiten (Bohrung, Ausschnitt …)."),
          h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.generatorAssembly(f.gen, { params: f.params, name: f.name, from: part }) }, "Als Baugruppe mit Einzelteilen"))));
        break;
      }
      case "genteil": {
        const asm = app.project.docs.find((d) => d.id === part.genAsm);
        out.push(this.section("Teil aus Generator",
          h("p", {}, `${f.body || f.key} aus ${GENERATORS[f.gen]?.label || (f.gen === "gestell" ? "Gestell" : f.gen)}${asm ? ` in der Baugruppe »${asm.name}«` : ""}.`),
          h("p", { class: "hint" }, "Maße und Profile werden in der Baugruppe eingestellt und gelten für alle Teile. Hier weitere Features anhängen (Bohrung, Ausschnitt, Fase …) – sie bleiben beim Aktualisieren erhalten."),
          asm ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => { app.openDoc(asm.id); app.sel = null; this.render(); } }, "Baugruppe öffnen")) : null));
        break;
      }
      case "naht": {
        const picking = app.pick?.kind === "edges" && app.pick.feature === f.id;
        const kind = f.kind || "kehl";
        out.push(this.section("Schweißnaht",
          this.select("Nahtart", Object.entries(WELD_KINDS).map(([k, d]) => [k, d.label]), kind, (v) => this.set(f, "kind", v, "Nahtart")),
          E(kind === "kehl" ? "Nahtdicke a" : "Nahtdicke s", "a", { allowNeg: false, allowZero: false }),
          this.seg("Seite", Object.entries(WELD_SIDES), f.side || "pfeil", (v) => this.set(f, "side", v, "Seite")),
          this.check("Umlaufend", !!f.around, (v) => this.set(f, "around", v, "Umlaufend")),
          this.check("Montagenaht (auf der Baustelle)", !!f.field, (v) => this.set(f, "field", v, "Montagenaht")),
          h("div", { class: picking ? "picking" : "" },
            h("div", {}, `${(f.edges || []).length} Kante(n) gewählt`),
            h("p", { class: "hint" }, picking ? "Nahtkanten im 3D-Fenster anklicken (nochmal klicken entfernt)." : ""),
            h("div", { class: "btn-row" },
              h("button", { class: "btn" + (picking ? " primary" : ""), onclick: () => { if (picking) app.cancelPick(); else app.selectFeature(f.id); } }, picking ? "Auswahl beenden" : "Kanten wählen"),
              (f.edges || []).length ? h("button", { class: "btn", onclick: () => this.set(f, "edges", [], "Kanten leeren") }, "Leeren") : null)),
          h("p", { class: "hint" }, "Die Naht verändert den Körper nicht. Sie erscheint in der Nahtliste (Export) und als Symbol nach ISO 2553 in der Zeichnung (Zeichnung → Schweißnähte).")));
        out.push(this.weldListSection(part));
        break;
      }
      case "rippe": {
        const plates = part.features.filter((g) => g.type === "platte");
        const sides = f.sides || [];
        out.push(this.section("Rippe (Steife)",
          this.select("Platte", plates.map((g) => [g.id, g.name]), f.plate, (v) => this.set(f, "plate", v, "Platte")),
          h("div", { class: "chk-col" }, ...Object.entries(RIB_SIDES).map(([k, label]) => this.check(label, sides.includes(k), (on) => this.set(f, (x) => { x.sides = Object.keys(RIB_SIDES).filter((s) => (s === k ? on : (x.sides || []).includes(s))); }, "Seiten")))),
          E("Länge am Profil", "length", { allowNeg: false, allowZero: false }),
          E("Höhe an der Platte (0 = bis Plattenrand)", "height", { allowNeg: false }),
          E("Dicke", "thickness", { allowNeg: false, allowZero: false }),
          E("Freischnitt Schweißecke", "chamfer", { allowNeg: false }),
          E("Kehlnaht a, beidseitig (0 = keine)", "weldA", { allowNeg: false }),
          h("p", { class: "hint" }, "Dreieckige Steife zwischen Platte und Profilseite, mittig auf der Seite. Der Freischnitt lässt Platz für die Kehlnaht in der Ecke.")));
        out.push(this.weldListSection(part));
        break;
      }
      case "biegerohr": {
        const meta = r?.bodies?.find((b) => b.fid === f.id)?.meta;
        out.push(this.section("Rohr über Polygonzug", ...this.pathPointsEditor(f, false),
          E("Biegeradius (Mitte)", "radius", { allowNeg: false, allowZero: false }),
          h("p", { class: "hint" }, "Eckpunkte des Polygonzugs eingeben; an jedem Eckpunkt wird mit dem Biegeradius (Mittellinie) gebogen. Die Zuschnittliste nennt die Abwicklungslänge (Geraden + Bögen).")));
        out.push(this.sectionEditor(f, BIEGEROHR_SECTIONS));
        if (meta?.bends) {
          const n1 = (x) => fmtNum(x, 1);
          out.push(this.section("Biegeliste",
            h("table", { class: "grid" },
              h("thead", {}, h("tr", {}, h("th", {}, "Nr"), h("th", {}, "Gerade vor"), h("th", {}, "Drehung °"), h("th", {}, "Winkel °"))),
              h("tbody", {}, ...meta.bends.map((b, i) => h("tr", {}, h("td", { class: "num" }, String(i + 1)), h("td", { class: "num" }, n1(b.straight)), h("td", { class: "num" }, n1(b.rotation)), h("td", { class: "num" }, n1(b.angle)))),
                h("tr", {}, h("td", {}, "Ende"), h("td", { class: "num" }, n1(meta.lastStraight)), h("td", {}), h("td", {})))),
            h("dl", { class: "kv" }, h("dt", {}, "Abwicklungslänge"), h("dd", {}, n1(meta.length) + " mm")),
            h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.files.saveText(bendListCsv({ bends: meta.bends, last: meta.lastStraight, length: meta.length }, f.name || "Biegerohr"), (f.name || "Biegerohr").replace(/[^\w\-äöüÄÖÜß ]+/g, "_") + "_Biegeliste.csv", "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]) }, "Biegeliste CSV")),
            h("p", { class: "hint" }, "Gerade vor = Länge vom vorigen Bogenende bis zum Bogenanfang. Drehung = Drehung der Biegeebene gegenüber der vorigen Biegung (für die Biegemaschine).")));
        }
        break;
      }
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
          this.select("Biegeregel", RULES.map((x) => [x.value, x.label]), f.bendRule || "k", (v) => this.set(f, "bendRule", v, "Biegeregel")),
          E((f.bendRule || "k") === "k" ? "K-Faktor" : "K-Faktor ohne Tabelle", "kFactor", { unit: "", allowNeg: false }),
          r?.bodies?.find((b) => b.fid === f.id)?.meta?.rule && (f.bendRule || "k") !== "k" ? h("p", { class: "hint" }, "Gerechnet: " + r.bodies.find((b) => b.fid === f.id).meta.rule) : null,
          h("p", { class: "hint" }, "Biegezugabe je Knick = (Innenradius + K-Faktor · Wandstärke) · Winkel im Bogenmaß. Mit »Biegetabelle« kommt K aus Einstellungen → Blechparameter (Werkstoff des Bauteils, Dicke = Wandstärke) – sonst ist die Vorgabe nur ein Startwert.")));
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
        const srcs = part.features.filter((g) => ["extrude", "revolve", "hole", "profile", "frame", "profilzug", "biegerohr", "regelkoerper", "normteil", "kantteil", "sweep", "loft", "spirale", "import"].includes(g.type) && g.id !== f.id);
        const dAxes = this.datumsBefore(part, f, "arbeitsachse");
        const axisSeg = (label, key, def) => [this.seg(label, [["X", "X"], ["Y", "Y"], ["Z", "Z"], ["-X", "−X"], ["-Y", "−Y"], ["-Z", "−Z"]], f[key] || def, (v) => this.set(f, key, v, label)),
          dAxes.length ? this.select(label + " (Arbeitsachse)", [["", "–"], ...dAxes.map((g) => ["datum:" + g.id, g.name])], String(f[key] || "").startsWith("datum:") ? f[key] : "", (v) => this.set(f, key, v || def, label)) : null];
        const pathSks = part.features.filter((g) => g.type === "sketch");
        out.push(this.section(f.kind === "circular" ? "Kreismuster" : f.kind === "path" ? "Muster entlang Pfad" : "Rechteckmuster",
          this.select("Feature", srcs.map((s) => [s.id, s.name]), f.feature, (v) => this.set(f, "feature", v, "Feature")),
          f.kind === "path" ? [
            this.select("Pfad", [["", "– Skizze –"], ...pathSks.map((x) => [x.id, x.name])], f.path || "", (v) => this.set(f, "path", v, "Pfad")),
            E("Anzahl", "count", { unit: "Stk" }),
            this.seg("Verteilung", [["gleich", "Über ganze Länge"], ["abstand", "Mit Abstand"]], f.spacingMode === "abstand" ? "abstand" : "gleich", (v) => this.set(f, (x) => { x.spacingMode = v; x.spacing = x.spacing || "50"; }, "Verteilung")),
            f.spacingMode === "abstand" ? E("Abstand (entlang Pfad)", "spacing", { allowNeg: false, allowZero: false }) : null,
            this.check("Mit dem Pfad drehen", f.align !== false, (v) => this.set(f, "align", v, "Ausrichtung")),
            this.check("Richtung umkehren", f.reverse, (v) => this.set(f, "reverse", v || undefined, "Richtung")),
            h("p", { class: "hint" }, "Das erste Exemplar ist das Original; der Pfad beginnt am freien Ende des zuerst gezeichneten Elements (sonst »Richtung umkehren«)."),
          ] : f.kind === "circular" ? [
            axisSeg("Achse", "axis", "Z"),
            String(f.axis || "").startsWith("datum:") ? null : this.vec3("Mittelpunkt", f.center, (v) => this.set(f, "center", v, "Mittelpunkt")),
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
          this.datumsBefore(part, f, "arbeitsebene").length ? this.select("Arbeitsebene", [["", "–"], ...this.datumsBefore(part, f, "arbeitsebene").map((g) => ["datum:" + g.id, g.name])], String(f.plane || "").startsWith("datum:") ? f.plane : "", (v) => this.set(f, "plane", v || "YZ", "Ebene")) : null,
          String(f.plane || "").startsWith("datum:") ? null : E("Abstand der Ebene", "offset"),
          this.check("Als getrennten Körper", f.separate, (v) => this.set(f, "separate", v, "Getrennt"))));
        break;
      case "sweep": {
        const sks = part.features.filter((g) => g.type === "sketch");
        out.push(this.section("Sweeping",
          this.select("Profil", [["", "– wählen –"], ...sks.map((x) => [x.id, x.name])], f.sketch || "", (v) => this.set(f, "sketch", v, "Profil")),
          this.select("Pfad", [["", "– wählen –"], ...sks.filter((x) => x.id !== f.sketch).map((x) => [x.id, x.name])], f.path || "", (v) => this.set(f, "path", v, "Pfad")),
          this.seg("Ausrichtung", [["mit", "Profil folgt dem Pfad"], ["fest", "Profil bleibt parallel"]], f.orient === "fest" ? "fest" : "mit", (v) => this.set(f, "orient", v === "fest" ? "fest" : undefined, "Ausrichtung")),
          h("p", { class: "hint" }, "Profil: geschlossene Kontur am Anfang des Pfads, möglichst senkrecht dazu. Pfad: zusammenhängende Linien und Bögen einer anderen Skizze."),
          this.opSeg(f)));
        break;
      }
      case "loft": {
        const sks = part.features.filter((g) => g.type === "sketch");
        const ids = f.sketches || [];
        const move = (i, d) => this.set(f, (x) => { const a = [...ids]; [a[i], a[i + d]] = [a[i + d], a[i]]; x.sketches = a; }, "Reihenfolge");
        out.push(this.section("Erhebung",
          h("ol", { class: "loft-list" }, ...ids.map((id, i) => h("li", {}, sks.find((x) => x.id === id)?.name || "fehlt",
            h("button", { class: "btn", title: "nach oben", disabled: i === 0 ? true : undefined, onclick: () => move(i, -1) }, "↑"),
            h("button", { class: "btn", title: "nach unten", disabled: i === ids.length - 1 ? true : undefined, onclick: () => move(i, 1) }, "↓"),
            h("button", { class: "btn", title: "entfernen", onclick: () => this.set(f, (x) => { x.sketches = ids.filter((_, k) => k !== i); }, "Querschnitt entfernen") }, "×")))),
          sks.some((x) => !ids.includes(x.id)) ? this.select("Querschnitt hinzufügen", [["", "– Skizze –"], ...sks.filter((x) => !ids.includes(x.id)).map((x) => [x.id, x.name])], "", (v) => v && this.set(f, (x) => { x.sketches = [...ids, v]; }, "Querschnitt")) : null,
          this.check("Gerade Übergänge (Regelfläche)", f.ruled, (v) => this.set(f, "ruled", v, "Übergänge")),
          h("p", { class: "hint" }, "Querschnitte in der Reihenfolge des Übergangs; je Skizze zählt die äußere Kontur. Ebenen z. B. mit Abstand oder als Arbeitsebene versetzen."),
          this.opSeg(f)));
        break;
      }
      case "spirale": {
        const sk = part.features.find((x) => x.id === f.sketch);
        const lines = sk ? sk.entities.filter((e) => e.type === "line") : [];
        const byHeight = f.mode === "hoehe";
        out.push(this.section("Spirale",
          this.sketchList(part, f.sketch, (v) => this.set(f, "sketch", v, "Skizze")),
          this.select("Achse", [["x", "Skizzen-X-Achse"], ["y", "Skizzen-Y-Achse"], ...lines.map((l, i) => [l.id, `Linie ${i + 1}${l.construction ? " (Konstruktion)" : ""}`])], f.axis || "y", (v) => this.set(f, "axis", v, "Achse")),
          this.seg("Vorgabe", [["umdrehungen", "Steigung + Umdrehungen"], ["hoehe", "Steigung + Höhe"]], byHeight ? "hoehe" : "umdrehungen", (v) => this.set(f, (x) => { x.mode = v; if (v === "hoehe") x.height = x.height || "50"; else x.turns = x.turns || "5"; }, "Vorgabe")),
          E("Steigung", "pitch", { allowNeg: false, allowZero: false }),
          byHeight ? E("Höhe", "height", { allowNeg: false, allowZero: false }) : E("Umdrehungen", "turns", { unit: "", allowNeg: false, allowZero: false }),
          this.check("Linksgängig", f.lefthand, (v) => this.set(f, "lefthand", v || undefined, "Drehsinn")),
          h("p", { class: "hint" }, "Profil (z. B. Kreis für eine Feder) neben der Achse in derselben Skizze; die Steigung muss größer als die Profilhöhe sein, sonst überschneiden sich die Windungen."),
          this.opSeg(f)));
        break;
      }
      case "endkappe": case "kuerzen": {
        const targets = part.features.filter((g) => ["profile", "frame", "profilzug", "generator"].includes(g.type));
        const members = (r?.bodies || []).filter((b) => b.fid === f.target && b.kind === "member");
        const cur = f.members || [];
        const memberChecks = members.length > 1 ? this.field("Stäbe (keiner gewählt = alle)", h("div", { class: "checks" }, ...members.map((b, i) => {
          const c = h("input", { type: "checkbox", checked: cur.includes(i) ? true : undefined });
          c.addEventListener("change", () => this.set(f, (x) => { x.members = c.checked ? [...new Set([...cur, i])].sort((a, b2) => a - b2) : cur.filter((y) => y !== i); }, "Stäbe"));
          return h("label", { class: "check" }, c, " ", b.name);
        })), true) : null;
        const tsel = this.select("Profil / Rahmen", [["", "– wählen –"], ...targets.map((g) => [g.id, g.name])], f.target || "", (v) => this.set(f, (x) => { x.target = v; x.members = []; }, "Profil"));
        if (f.type === "endkappe") {
          out.push(this.section("Endkappe", tsel, memberChecks,
            this.seg("Ende", [["A", "A"], ["B", "B"], ["beide", "Beide"]], f.end || "beide", (v) => this.set(f, "end", v, "Ende")),
            this.seg("Art", CAP_MODES, f.mode || "aufgesetzt", (v) => this.set(f, "mode", v, "Art")),
            E("Dicke", "thickness", { allowNeg: false, allowZero: false }),
            E(f.mode === "eingesetzt" ? "Spiel je Seite" : "Überstand je Seite (negativ = kleiner)", "overhang"),
            E("Nahtdicke a (0 = keine Naht)", "weldA", { allowNeg: false }),
            h("p", { class: "hint" }, "Aufgesetzt: Platte mit der Außenkontur des Profils auf dem Stabende. Eingesetzt: Stopfen mit der Innenkontur, bündig im Rohr. Gehrungsenden bleiben ohne Kappe.")));
        } else {
          out.push(this.section("Kürzen / Verlängern", tsel, memberChecks,
            this.select("Ebene", this.planeChoices(part, f), f.plane || "YZ", (v) => this.set(f, "plane", v, "Ebene")),
            E("Abstand der Ebene", "offset"),
            this.seg("Ende", [["auto", "Näheres"], ["A", "A"], ["B", "B"]], f.end || "auto", (v) => this.set(f, "end", v, "Ende")),
            h("p", { class: "hint" }, "Das Stabende endet genau an der Ebene: liegt sie innerhalb, wird gekürzt, sonst gerade verlängert und an der Ebene geschnitten (schräge Ebene = Gehrung). Für Flächen eines Bauteils vorher eine Arbeitsebene auf die Fläche legen.")));
        }
        break;
      }
      case "kombinieren": case "trennen": case "verschieben": case "aufdicken": case "flaeche": case "entformung":
        out.push(...this.bodyToolProps(part, f, E));
        break;
      case "arbeitsebene": case "arbeitsachse": case "arbeitspunkt":
        out.push(...this.datumProps(part, f, E));
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
  /** Körper des Bauteils nach erzeugendem Feature (fid) für die Auswahl */
  bodyChoices(part) {
    const seen = new Map();
    for (const b of this.app.results.get(part.id)?.bodies || []) if (b.fid && !seen.has(b.fid)) seen.set(b.fid, b.name || part.features.find((f) => f.id === b.fid)?.name || b.fid);
    for (const f of part.features) if (!seen.has(f.id) && ["extrude", "revolve", "sweep", "loft", "spirale", "regelkoerper", "import"].includes(f.type) && f.op === "new") seen.set(f.id, f.name);
    return [...seen];
  }
  /** Auswahl mehrerer Körper als Kästchen */
  bodyChecks(part, f, key, label, exclude = []) {
    const list = this.bodyChoices(part).filter(([id]) => !exclude.includes(id) && id !== f.id);
    const cur = f[key] || [];
    return this.field(label, h("div", { class: "checks" }, ...list.map(([id, name]) => {
      const c = h("input", { type: "checkbox", checked: cur.includes(id) ? true : undefined });
      c.addEventListener("change", () => this.set(f, (x) => { x[key] = c.checked ? [...new Set([...cur, id])] : cur.filter((y) => y !== id); }, label));
      return h("label", { class: "check" }, c, " ", name);
    })), true);
  }
  /** Ebenen- und Achsenwahl mit Arbeitselementen */
  planeChoices(part, f) { return [["XY", "XY-Ebene"], ["XZ", "XZ-Ebene"], ["YZ", "YZ-Ebene"], ...this.datumsBefore(part, f, "arbeitsebene").map((g) => ["datum:" + g.id, g.name])]; }
  axisChoices(part, f) { return [["X", "X-Achse"], ["Y", "Y-Achse"], ["Z", "Z-Achse"], ...this.datumsBefore(part, f, "arbeitsachse").map((g) => ["datum:" + g.id, g.name])]; }
  /** Eigenschaften der Körper-Werkzeuge (Stufe 38) */
  bodyToolProps(part, f, E) {
    const app = this.app;
    const facePick = (hint) => {
      const picking = app.pick?.kind === "faces" && app.pick.feature === f.id;
      return h("div", { class: picking ? "picking" : "" }, `${(f.faces || []).length} Fläche(n) gewählt`,
        h("p", { class: "hint" }, hint),
        h("div", { class: "btn-row" }, h("button", { class: "btn" + (picking ? " primary" : ""), onclick: () => (picking ? app.cancelPick() : app.selectFeature(f.id)) }, picking ? "Auswahl beenden" : "Flächen wählen"),
          (f.faces || []).length ? h("button", { class: "btn", onclick: () => this.set(f, "faces", [], "Flächen leeren") }, "Leeren") : null));
    };
    const bodies = this.bodyChoices(part);
    switch (f.type) {
      case "kombinieren":
        return [this.section("Kombinieren",
          this.select("Zielkörper", [["", "– wählen –"], ...bodies.filter(([id]) => id !== f.id)], f.target || "", (v) => this.set(f, (x) => { x.target = v; x.tools = (x.tools || []).filter((t) => t !== v); }, "Zielkörper")),
          this.bodyChecks(part, f, "tools", "Werkzeugkörper", [f.target]),
          this.seg("Vorgang", COMBINE_OPS, f.op || "join", (v) => this.set(f, "op", v, "Vorgang")),
          this.check("Werkzeugkörper behalten", f.keep, (v) => this.set(f, "keep", v || undefined, "Behalten")))];
      case "trennen":
        return [this.section("Trennen",
          this.select("Trennebene", this.planeChoices(part, f), f.plane || "YZ", (v) => this.set(f, "plane", v, "Ebene")),
          E("Abstand", "offset"),
          this.seg("Ergebnis", SPLIT_KEEP, f.keep || "beide", (v) => this.set(f, "keep", v, "Ergebnis")),
          this.bodyChecks(part, f, "bodies", "Nur diese Körper (leer = alle)"))];
      case "verschieben":
        return [this.section("Körper verschieben",
          this.bodyChecks(part, f, "bodies", "Körper (leer = alle)"),
          this.vec3("Verschiebung X/Y/Z", f.move, (v) => this.set(f, "move", v, "Verschiebung")),
          this.select("Drehachse", this.axisChoices(part, f), f.axis || "Z", (v) => this.set(f, "axis", v, "Drehachse")),
          E("Drehwinkel", "angle", { unit: "°" }),
          this.check("Als Kopie", f.copy, (v) => this.set(f, "copy", v || undefined, "Kopie")))];
      case "aufdicken":
        return [this.section("Aufdicken",
          facePick("Ebene Flächen im 3D-Fenster anklicken (nochmal klicken entfernt)."),
          E("Dicke", "thickness", { allowNeg: false, allowZero: false }),
          this.seg("Richtung", THICKEN_SIDES, f.side || "aussen", (v) => this.set(f, "side", v, "Richtung")),
          this.seg("Vorgang", [["new", "Neuer Körper"], ["join", "Vereinigen"]], f.op || "new", (v) => this.set(f, "op", v, "Vorgang")))];
      case "flaeche":
        return [this.section("Fläche verschieben",
          facePick("Ebene Flächen anklicken; positiver Abstand zieht heraus, negativer setzt zurück."),
          E("Abstand", "distance", { allowZero: false }))];
      default:
        return [this.section("Entformung",
          facePick("Seitenflächen anklicken, die eine Formschräge bekommen."),
          E("Winkel", "angle", { unit: "°", allowZero: false }),
          this.select("Neutrale Ebene (Zugrichtung = Normale)", this.planeChoices(part, f), f.plane || "XY", (v) => this.set(f, "plane", v, "Ebene")),
          E("Abstand der Ebene", "offset"))];
    }
  }
  /** Frühere, aktive Arbeitselemente einer Art (nur sie dürfen Bezug sein) */
  datumsBefore(part, f, type) {
    const i = part.features.findIndex((x) => x.id === f.id);
    return part.features.slice(0, i < 0 ? undefined : i).filter((x) => x.type === type && !x.suppressed);
  }
  /** Eigenschaften von Arbeitsebene, -achse, -punkt */
  datumProps(part, f, E) {
    const app = this.app;
    const planes = [["XY", "XY-Ebene"], ["XZ", "XZ-Ebene"], ["YZ", "YZ-Ebene"], ...this.datumsBefore(part, f, "arbeitsebene").map((g) => [g.id, g.name])];
    const axes = [["X", "X-Achse"], ["Y", "Y-Achse"], ["Z", "Z-Achse"], ...this.datumsBefore(part, f, "arbeitsachse").map((g) => [g.id, g.name])];
    const pts = this.datumsBefore(part, f, "arbeitspunkt");
    const sel = (label, key, opts, def) => this.select(label, opts, f[key] || def, (v) => this.set(f, key, v, label));
    // Punkt: Ursprung, früherer Arbeitspunkt oder freie Koordinaten
    const point = (label, key) => {
      const v = f[key];
      const mode = typeof v === "string" ? v : "frei";
      const free = typeof v === "object" && v ? v : { x: "0", y: "0", z: "0" };
      return [this.select(label, [["O", "Ursprung"], ...pts.map((g) => [g.id, g.name]), ["frei", "Koordinaten"]], mode, (m) => this.set(f, (x) => { x[key] = m === "frei" ? { ...free } : m; }, label)),
        mode === "frei" ? this.vec3(label + " XYZ", [free.x, free.y, free.z], (a) => this.set(f, (x) => { x[key] = { x: a[0], y: a[1], z: a[2] }; }, label)) : null];
    };
    const modes = { arbeitsebene: PLANE_MODES, arbeitsachse: AXIS_MODES, arbeitspunkt: POINT_MODES }[f.type];
    const def = { arbeitsebene: "versatz", arbeitsachse: "punkte", arbeitspunkt: "koordinaten" }[f.type];
    const mode = f.mode || def;
    const body = [this.select("Art", modes.map((m) => [m.value, m.label]), mode, (v) => this.set(f, "mode", v, "Art"))];
    if (f.type === "arbeitsebene") {
      if (mode === "versatz") body.push(sel("Bezugsebene", "base", planes, "XY"), E("Abstand", "distance"));
      else if (mode === "winkel") body.push(sel("Bezugsebene", "base", planes, "XY"), sel("Drehachse", "axis", [["u", "x-Richtung der Ebene"], ["v", "y-Richtung der Ebene"], ...axes.slice(3)], "u"), E("Winkel", "angle", { unit: "°" }));
      else if (mode === "punkte") body.push(...point("Punkt 1", "p1"), ...point("Punkt 2", "p2"), ...point("Punkt 3", "p3"));
      else if (mode === "normal") body.push(sel("Achse", "axis", axes, "Z"), ...point("Durch Punkt", "point"));
      else if (mode === "flaeche") {
        const picking = app.pick?.kind === "datumFace" && app.pick.feature === f.id;
        body.push(h("div", {}, f.origin ? "Fläche gewählt" : "Noch keine Fläche gewählt"), E("Abstand", "distance"),
          h("div", { class: "btn-row" }, h("button", { class: "btn" + (picking ? " primary" : ""), onclick: () => { if (picking) app.cancelPick(); else { app.pick = { kind: "datumFace", feature: f.id }; app.setHint("Ebene Fläche anklicken – Esc bricht ab"); this.render(); } } }, picking ? "Auswahl beenden" : "Fläche wählen")));
      }
    } else if (f.type === "arbeitsachse") {
      if (mode === "punkte") body.push(...point("Punkt 1", "p1"), ...point("Punkt 2", "p2"));
      else if (mode === "schnitt") body.push(sel("Ebene 1", "plane1", planes, "XY"), sel("Ebene 2", "plane2", planes, "XZ"));
      else body.push(this.seg("Richtung", [["X", "X"], ["Y", "Y"], ["Z", "Z"]], f.dir || "Z", (v) => this.set(f, "dir", v, "Richtung")), ...point("Durch Punkt", "point"));
    } else {
      if (mode === "koordinaten") body.push(this.vec3("Koordinaten", [f.x ?? "0", f.y ?? "0", f.z ?? "0"], (a) => this.set(f, (x) => { x.x = a[0]; x.y = a[1]; x.z = a[2]; }, "Koordinaten")));
      else body.push(sel("Achse", "axis", axes, "Z"), sel("Ebene", "plane", planes, "XY"));
    }
    body.push(this.check("Im 3D-Fenster zeigen", !f.hidden, (v) => this.set(f, "hidden", !v || undefined, "Sichtbarkeit")));
    const out = [this.section({ arbeitsebene: "Arbeitsebene", arbeitsachse: "Arbeitsachse", arbeitspunkt: "Arbeitspunkt" }[f.type], ...body)];
    if (f.type === "arbeitsebene") out.push(h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.createSketch({ ref: "datum", id: f.id }) }, "Skizze auf dieser Ebene")));
    return out;
  }
  sectionEditor(f, kinds = Object.keys(SECTION_KINDS)) {
    const kind = f.section || "vierkant";
    const def = SECTION_KINDS[kind];
    return this.section("Querschnitt",
      this.profileQuick(f, kinds),
      ...this.profileLibrary(f, kinds),
      ...def.fields.map((k) => this.expr(fieldLabel(kind, k), f.dims?.[k] ?? "", (v) => this.set(f, (x) => { x.dims = { ...x.dims, [k]: v }; }, fieldLabel(kind, k)), { allowNeg: false })),
      this.meterWeightInfo(f));
  }
  /** Punkte eines räumlichen Zugs (Profilzug, Biegerohr): absolut oder relativ, mit Drehung je Segment (rolls) */
  pathPointsEditor(f, rolls) {
    const pts = f.points || [];
    const setPt = (i, patch, label) => this.set(f, (x) => { x.points[i] = { ...x.points[i], ...patch }; }, label);
    const rows = pts.map((p, i) => h("div", { class: "pz-point" },
      this.vec3(`Punkt ${i + 1}` + (p.rel && i ? " (Δ)" : ""), [p.x, p.y, p.z], (v) => setPt(i, { x: v[0], y: v[1], z: v[2] }, `Punkt ${i + 1}`)),
      h("div", { class: "pz-opts" },
        i ? this.check("relativ zum vorigen", !!p.rel, (v) => setPt(i, { rel: v }, `Punkt ${i + 1} relativ`)) : h("span", { class: "hint" }, "Startpunkt"),
        pts.length > 2 ? h("button", { class: "btn", title: "Punkt entfernen", onclick: () => this.set(f, (x) => { x.points.splice(i, 1); if (x.points[0]) x.points[0] = { ...x.points[0], rel: false }; }, "Punkt entfernen") }, "Entfernen") : null),
      rolls && i < pts.length - (f.closed ? 0 : 1) ? this.text(`Drehung Segment ${i + 1} °`, p.roll || "", (v) => setPt(i, { roll: v }, `Segment ${i + 1} Drehung`), { placeholder: "0" }) : null));
    rows.push(h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.set(f, (x) => { let w = []; try { const sc = this.scope(); w = resolvePathPoints(x.points, (v) => evaluate(String(v), sc)); } catch { /* ungültig: Vorschlag entlang X */ } x.points.push(nextPointDefault(w)); }, "Punkt hinzufügen") }, "+ Punkt")));
    return rows;
  }
  /** Fläche und Metergewicht des Querschnitts mit dem Werkstoff des Bauteils */
  meterWeightInfo(f) {
    try {
      const scope = this.scope();
      const d = Object.fromEntries(Object.entries(f.dims || {}).map(([k, v]) => [k, evaluate(String(v), scope)]));
      const area = sectionGeometry(f.section || "vierkant", d).area;
      const part = this.app.activeDoc();
      const mat = materialOf(part?.material);
      return h("dl", { class: "kv" },
        h("dt", {}, "Fläche A"), h("dd", {}, fmtNum(area, 1) + " mm²"),
        h("dt", {}, "Metergewicht"), h("dd", { title: mat.label }, fmtNum(kgPerMeter(area, mat.density), 2) + " kg/m"));
    } catch { return null; }
  }

  /**
   * Profilbibliothek in Schritten (src/core/profillib.js): Werkstoff des Bauteils → Profilart → Abmessung → Wandstärke.
   * Angeboten wird nur, was es in der Werkstoffgruppe nach Norm gibt; eigene Maße bleiben über die Felder darunter möglich.
   */
  profileLibrary(f, kinds) {
    const app = this.app, kind = f.section || "vierkant";
    const part = app.activeDoc();
    const isPart = part?.kind === "part";
    const group = groupOfMaterial(materialOf(part?.material));
    const lib = group ? LIB_GROUPS[group] : null;
    let d = null;
    try {
      const scope = this.scope();
      d = Object.fromEntries(Object.entries(f.dims || {}).map(([k, v]) => [k, evaluate(String(v), scope)]));
    } catch { /* Maß mit Fehler: gilt als eigene Maße */ }
    const groups = group ? [group] : Object.keys(LIB_GROUPS);
    const hit = d && groups.map((g) => findEntry(g, kind, d)).find(Boolean);
    const g = hit?.group || groups.find((x) => LIB_GROUPS[x].kinds[kind]) || null;
    const setEntry = (e, label) => e && this.set(f, (x) => { x.section = e.kind; x.dims = { ...e.dims }; }, label);
    const out = [];
    if (isPart) out.push(this.materialSelect(part));
    const offered = groupKinds(group, kinds);
    const kindOpts = (offered.includes(kind) ? offered : [kind, ...offered]).map((k) => [k, SECTION_KINDS[k].label]);
    out.push(this.select("Profilart", kindOpts, kind, (v) => {
      const e = groups.map((x) => defaultEntry(x, v)).find(Boolean);
      if (e) setEntry(e, "Profilart");
      else this.set(f, (x) => { x.section = v; x.dims = catalogToDims(v, CATALOG[v][Math.floor(CATALOG[v].length / 2)]); }, "Profilart");
    }));
    if (!g) {
      out.push(h("p", { class: "hint" }, `${SECTION_KINDS[kind].label} gibt es für ${lib ? lib.label : "diesen Werkstoff"} nicht in der Normliste – Maße unten frei eingeben.`));
      return out;
    }
    const main = hit?.main ?? (d ? mainOfDims(kind, d) : null);
    const mains = mainSizes(g, kind);
    const known = mains.some(([m]) => m === main);
    out.push(this.select("Abmessung", [...(known ? [] : [["", "– eigene Maße –"]]), ...mains], known ? main : "", (v) => v && setEntry(pickEntry(g, kind, v, Number(d?.t)), "Abmessung")));
    if (hasWall(kind) && known) {
      const walls = wallsFor(g, kind, main);
      out.push(this.select(wallLabel(kind), [...(hit ? [] : [["", "– eigene –"]]), ...walls], hit ? hit.wall : "", (v) => v && setEntry(pickEntry(g, kind, main, Number(v)), wallLabel(kind))));
    }
    out.push(h("p", { class: "hint" }, hit
      ? `${hit.norm} · ${LIB_GROUPS[hit.group].label}`
      : `Eigene Maße – nicht in der Normliste für ${LIB_GROUPS[g].label}.`));
    return out;
  }

  /**
   * Profilauswahl im Generator in Schritten wie im Querschnitt: Profilart (nur die im Werkstoff des Bauteils
   * vorhandenen) → Abmessung → Wandstärke. Wert bleibt { kind, size } in Katalog-Schreibweise.
   */
  genSectionPicker(s, v, part, set) {
    const group = groupOfMaterial(materialOf(part?.material));
    const kinds = s.kinds || Object.keys(CATALOG);
    const offered = groupKinds(group, kinds);
    const kindOpts = (offered.includes(v.kind) ? offered : [v.kind, ...offered]).map((k) => [k, SECTION_KINDS[k].label]);
    // Werkstoffgruppe mitspeichern: Kantenradius der Hohlprofile (Aluminium fast scharfkantig) – sectionOf/catalogToDims
    const withGroup = (x) => (group ? { ...x, group } : x);
    const choose = (e) => e && set(withGroup({ kind: e.kind, size: e.size }));
    const out = [this.select(s.label, kindOpts, v.kind, (k) => choose(defaultEntry(group, k) || defaultEntry(null, k)))];
    const g = mainSizes(group, v.kind).length ? group : null;
    const { main, wall } = splitSize(v.kind, v.size);
    const outside = " (nicht in Normliste)";
    const mains = mainSizes(g, v.kind);
    if (!mains.some(([m]) => m === main)) mains.unshift([main, mainLabel(v.kind, main) + outside]);
    out.push(this.select("Abmessung", mains, main, (m) => choose(pickEntry(g, v.kind, m, Number(wall)))));
    if (hasWall(v.kind)) {
      const walls = wallsFor(g, v.kind, main);
      if (!walls.some(([w]) => w === wall)) walls.unshift([wall, String(wall).replace(".", ",") + " mm" + outside]);
      out.push(this.select(wallLabel(v.kind), walls, wall, (w) => set(withGroup({ kind: v.kind, size: `${main}x${w}` }))));
    }
    return out;
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

  /** Konturen am Rohr wie im Rohr-Editor: Art, Lage ab Ende A, Seite/Winkel, Versatz, Muster „3x25“ (src/core/tubecuts.js) */
  tubeCutsEditor(f) {
    if (!TUBE_CUT_SECTIONS.includes(f.section || "vierkant")) return this.section("Konturen am Rohr", h("p", { class: "hint" }, "Nur für Rund-, Quadrat- und Rechteckrohr."));
    const round = f.section === "rohr";
    const cuts = f.cuts || [];
    const edit = (i, fn, label) => this.set(f, (x) => { x.cuts = (x.cuts || []).map((c, k) => (k === i ? { ...c } : c)); fn(x.cuts[i]); }, label);
    const add = (kind) => {
      let L = 1000;
      try { L = evaluate(String(f.length), this.scope()); } catch { /* Vorgabe */ }
      this.set(f, (x) => { x.cuts = [...(x.cuts || []), defaultTubeCut(kind, L)]; }, TUBE_CUT_KINDS[kind].label + " hinzufügen");
    };
    const card = (c, i) => {
      const E = (label, key, opts) => this.expr(label, c[key] ?? "0", (v) => edit(i, (x) => { x[key] = v; }, label), opts);
      const kind = TUBE_CUT_KINDS[c.kind] ? c.kind : "bohrung";
      return h("div", { class: "tube-cut" },
        h("div", { class: "tube-cut-head" }, h("b", {}, `${i + 1}. ${TUBE_CUT_KINDS[kind].label}`),
          h("button", { class: "btn small", title: "Duplizieren", onclick: () => this.set(f, (x) => { x.cuts = [...x.cuts.slice(0, i + 1), { ...c }, ...x.cuts.slice(i + 1)]; }, "Kontur duplizieren") }, "⧉"),
          h("button", { class: "btn small danger", title: "Entfernen", onclick: () => this.set(f, (x) => { x.cuts = x.cuts.filter((_, k) => k !== i); }, "Kontur entfernen") }, icon("trash"))),
        h("div", { class: "massbild-wrap", html: contourSketch(kind) }),
        atEnd(kind)
          ? this.seg("Ende", [["A", "A (Anfang)"], ["B", "B (Ende)"]], c.end === "B" ? "B" : "A", (v) => edit(i, (x) => { x.end = v; }, "Ende"))
          : [E("Lage ab Ende A", "x"), this.patternField(c.pattern, (v) => edit(i, (x) => { x.pattern = v; }, "Muster"))],
        round
          ? [E("Winkel", "angle", { unit: "°" }), this.seg("", SIDES.map(([n, a]) => [String(a), n]), String(c.angle ?? "0"), (v) => edit(i, (x) => { x.angle = v; }, "Winkel"))]
          : this.seg("Seite", SIDES.map(([n]) => [n, n]), c.side || "oben", (v) => edit(i, (x) => { x.side = v; }, "Seite")),
        E("Versatz quer", "q"),
        ...TUBE_CUT_KINDS[kind].fields.map((k) => (k === "punkte"
          ? this.polygonField(c.punkte, (v) => edit(i, (x) => { x.punkte = v; }, "Eckpunkte"))
          : E(TUBE_CUT_FIELDS[k], k, { allowNeg: false, allowZero: k === "r" }))),
        atEnd(kind) ? null : this.check("Durchgehend (auch Gegenseite)", c.through, (v) => edit(i, (x) => { x.through = v; }, "Durchgehend")),
        kind === "bohrung" ? this.check("3D (schräg gebohrt, Kopf geschwenkt)", c.d3, (v) => edit(i, (x) => { x.d3 = v; x.tiltL = x.tiltL || "0"; x.tiltQ = x.tiltQ || "0"; }, "Bohrung 3D")) : null,
        kind === "bohrung" && c.d3 ? [["Neigung längs", "tiltL"], ["Neigung quer", "tiltQ"]].map(([label, key]) => [
          E(label, key, { unit: "°" }),
          this.seg("", TILT_QUICK.map((a) => [String(a), (a > 0 ? "+" : a < 0 ? "−" : "") + Math.abs(a) + "°"]), String(c[key] ?? "0"), (v) => edit(i, (x) => { x[key] = v; }, label))]) : null);
    };
    return this.section("Konturen am Rohr",
      ...cuts.map(card),
      h("div", { class: "btn-row" }, ...Object.entries(TUBE_CUT_KINDS).map(([k, d]) => h("button", { class: "btn", onclick: () => add(k) }, "+ " + d.label.replace(" am Ende", "")))),
      h("p", { class: "hint" }, "Wie im Rohr-Editor: Lage = Mitte der ersten Kontur ab Ende A, Muster „3x25“ = 3 Stück im Abstand 25. Seite von Ende A gesehen, Versatz + = im Uhrzeigersinn. Polygon: Eckpunkte x längs, y quer, optional dritte Zahl = Bogen (Bulge wie in DXF)."));
  }
  /** Eckpunkte eines Polygons „0,0; 30,0; 30,10,0.41“ mit Prüfung */
  polygonField(value, onCommit) {
    const inp = h("input", { class: "inp", value: value ?? "", spellcheck: "false", placeholder: "0,0; 30,0; 15,20" });
    const check = () => {
      try { parsePolygon(inp.value); inp.classList.remove("bad"); inp.title = ""; return true; }
      catch (e) { inp.classList.add("bad"); inp.title = e.message; return false; }
    };
    check();
    inp.addEventListener("input", check);
    inp.addEventListener("change", () => { if (check() && inp.value !== value) onCommit(inp.value.trim()); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    return this.field(TUBE_CUT_FIELDS.punkte, inp);
  }
  /** 2D/3D und Winkelkorrektur eines Profils bzw. Rahmens (gilt für alle seine Schnitte) */
  cutModeFields(f, scope) {
    const cur = featureCutSettings(f);
    return [
      this.seg("Schnitt", [["2D", "2D"], ["3D", "3D"]], cur.mode, (v) => this.set(f, (x) => { x.cutMode = v; delete x.endCuts; }, "Schnitt 2D/3D")),
      this.expr("Winkelkorrektur ±", cur.swivel, (v) => this.set(f, "swivel", v, "Winkelkorrektur"), { unit: "°", allowNeg: false }),
      h("p", { class: "hint" }, `Gilt für ${scope}. Wie im Rohr-Editor: 2D = Strahl senkrecht zur Oberfläche, die Gehrung ist innen verdreht. 3D = Kopf geschwenkt, Schnittfläche eben, höchstens bis zur Winkelkorrektur (Maschine, Vorgabe ±45°); darüber nicht maßhaltig.`)];
  }
  /** Musterfeld „3x25“ mit Prüfung */
  patternField(value, onCommit) {
    const scope = this.scope();
    const inp = h("input", { class: "inp", value: value ?? "1", spellcheck: "false", placeholder: "1 oder 3x25" });
    const check = () => {
      try { parsePattern(inp.value, (s) => evaluate(s, scope)); inp.classList.remove("bad"); inp.title = ""; return true; }
      catch (e) { inp.classList.add("bad"); inp.title = e.message; return false; }
    };
    check();
    inp.addEventListener("input", check);
    inp.addEventListener("change", () => { if (check() && inp.value !== value) onCommit(inp.value.trim()); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    return this.field("Muster", inp);
  }

  /** Trägheitsmomente aus dem Darstellungsnetz (Kernel liefert sie nicht) */
  inertiaBlock(r, dens, vol) {
    const meshes = r.bodies.map((b) => b.mesh).filter((m) => m?.positions && m?.indices);
    if (meshes.length !== r.bodies.length || !meshes.length) return null;
    let memo = INERTIA.get(r);
    if (!memo || memo.dens !== dens) { memo = { dens, it: inertiaFromMeshes(meshes, dens, vol) }; INERTIA.set(r, memo); }
    const it = memo.it;
    if (!it) return null;
    const f = (v) => fmtNum(v, v >= 100 ? 0 : 2);
    const I = it.atCenter;
    const dev = it.meshDeviation;
    return h("details", { class: "inertia" }, h("summary", {}, "Trägheitsmomente"),
      h("dl", { class: "kv" },
        h("dt", {}, "Haupt-I₁/I₂/I₃"), h("dd", {}, it.principal.map(f).join(" / ") + " kg·mm²"),
        h("dt", {}, "Ixx/Iyy/Izz"), h("dd", {}, [I[0][0], I[1][1], I[2][2]].map(f).join(" / ")),
        h("dt", {}, "Ixy/Ixz/Iyz"), h("dd", {}, [I[0][1], I[0][2], I[1][2]].map(f).join(" / ")),
        h("dt", {}, "um Ursprung Ixx/Iyy/Izz"), h("dd", {}, [it.atOrigin[0][0], it.atOrigin[1][1], it.atOrigin[2][2]].map(f).join(" / "))),
      h("p", { class: "hint" }, `Bezogen auf den Schwerpunkt, Achsen parallel zum Bauteil. Berechnet aus dem Darstellungsnetz (Qualität „${{ grob: "Schnell", normal: "Normal", fein: "Fein" }[this.app.quality] || this.app.quality}“)` +
        (dev != null ? `; Volumen des Netzes weicht ${fmtNum(Math.abs(dev) * 100, 2)} % vom exakten Wert ab – Trägheitswerte ähnlich genau.` : ".")));
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
          const label = { line: "Linie", circle: "Kreis", arc: "Bogen", point: "Punkt", ellipse: "Ellipse", spline: "Spline" }[e.type];
          const info = [];
          if (e.type === "line") { const a = P.get(e.p1), b = P.get(e.p2); info.push(h("dt", {}, "Länge"), h("dd", {}, fmtNum(Math.hypot(b.x - a.x, b.y - a.y), 3)), h("dt", {}, "Winkel"), h("dd", {}, fmtNum((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, 2) + "°")); }
          if (e.type === "circle") info.push(h("dt", {}, "Durchmesser"), h("dd", {}, fmtNum(2 * e.r, 3)));
          if (e.type === "arc") { const c = P.get(e.c), a = P.get(e.p1); info.push(h("dt", {}, "Radius"), h("dd", {}, fmtNum(Math.hypot(a.x - c.x, a.y - c.y), 3))); }
          let extra = null;
          if (e.type === "spline") {
            const ctrl = e.pts.map((q) => [P.get(q).x, P.get(q).y]), closed = e.p1 === e.p2;
            info.push(h("dt", {}, "Kontrollpunkte"), h("dd", {}, String(new Set(e.pts).size)), h("dt", {}, "Grad"), h("dd", {}, String(splineDegree(e.pts.length))),
              h("dt", {}, "Länge"), h("dd", {}, fmtNum(splineLength(ctrl), 2)), h("dt", {}, "Geschlossen"), h("dd", {}, closed ? "ja" : "nein"));
            // Punkt einfügen: Mitte des längsten Abschnitts im Kontrollpolygon
            extra = h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.sketcher.commit("Spline-Punkt einfügen", (s) => {
              const se = s.entities.find((x) => x.id === e.id), Q = new Map(s.points.map((p) => [p.id, p]));
              let best = 0, bl = -1;
              for (let i = 0; i + 1 < se.pts.length; i++) { const a = Q.get(se.pts[i]), b = Q.get(se.pts[i + 1]), l = Math.hypot(b.x - a.x, b.y - a.y); if (l > bl) { bl = l; best = i; } }
              const a = Q.get(se.pts[best]), b = Q.get(se.pts[best + 1]), id = uid("p");
              s.points.push({ id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              se.pts.splice(best + 1, 0, id);
            }) }, "Punkt einfügen"),
            h("span", { class: "hint" }, "Kontrollpunkte ziehen formt die Kurve; Punkt wählen → „Aus Spline entfernen“."));
          }
          if (e.type === "ellipse") {
            const g = ellipseGeom(P.get(e.c), P.get(e.a), e.r), deg = (g.rot * 180) / Math.PI;
            info.push(h("dt", {}, "Halbachse a"), h("dd", {}, fmtNum(g.A, 3)), h("dt", {}, "Halbachse b"), h("dd", {}, fmtNum(g.B, 3)),
              h("dt", {}, "Achswinkel"), h("dd", {}, fmtNum(deg, 2) + "°"), h("dt", {}, "Umfang"), h("dd", {}, fmtNum(ellipsePerimeter(g.A, g.B), 2)));
            const has = (pred) => sk.constraints.some((c) => c.e === e.id && pred(c));
            const btn = (txt, c) => h("button", { class: "btn", onclick: () => app.sketcher.addConstraint({ ...c, e: e.id }) }, txt);
            extra = h("div", { class: "btn-row" },
              has((c) => c.type === "semiAxis" && c.axis !== "b") ? null : btn("a bemaßen", { type: "semiAxis", axis: "a", value: String(Math.round(g.A * 1000) / 1000) }),
              has((c) => c.type === "semiAxis" && c.axis === "b") ? null : btn("b bemaßen", { type: "semiAxis", axis: "b", value: String(Math.round(g.B * 1000) / 1000) }),
              has((c) => c.type === "axisAngle") ? null : btn("Winkel bemaßen", { type: "axisAngle", value: String(Math.round(deg * 100) / 100) }));
          }
          out.push(this.section(label, h("dl", { class: "kv" }, ...info),
            extra,
            e.origin ? null : this.check("Konstruktionslinie", e.construction, () => app.sketcher.toggleConstruction()),
            h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => app.sketcher.deleteSelection() }, "Löschen"))));
          const own = new Set([e.p1, e.p2, e.c, e.p].filter(Boolean));
          const pc = sk.constraints.find((c) => c.type === "pattern" && (own.has(c.q) || own.has(c.p)));
          const pat = pc && patternOf(sk, pc.pat);
          if (pat) {
            const setAll = (key, label) => (v) => app.sketcher.commit(label, (s) => { for (const k of s.constraints) if (k.pat === pat.pat && k.type === "pattern") k[key] = v; });
            out.push(this.section(pat.mode === "rot" ? "Kreismuster" : "Rechteckmuster",
              h("dl", { class: "kv" }, h("dt", {}, "Anzahl"), h("dd", {}, pat.mode === "rot" ? String(pat.n) : `${pat.nx} × ${pat.ny}`)),
              pat.mode === "rot"
                ? this.expr("Winkelschritt", pat.value, setAll("value", "Muster ändern"), { unit: "°" })
                : [this.expr("Abstand X", pat.value, setAll("value", "Muster ändern")), this.expr("Abstand Y", pat.value2, setAll("value2", "Muster ändern"))],
              h("p", { class: "hint" }, "Die Kopien folgen dem Original. Andere Anzahl: Kopien löschen und das Muster neu anlegen."),
              h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.sketcher.commit("Muster auflösen", (s) => { s.constraints = s.constraints.filter((k) => k.pat !== pat.pat); }) }, "Muster auflösen"))));
          }
        }
      } else if (t === "p") {
        const p = P.get(id);
        if (p) {
          const fixed = sk.constraints.find((c) => c.type === "fix" && c.p === id);
          const spl = sk.entities.find((x) => x.type === "spline" && x.pts.indexOf(id) > 0 && x.pts.indexOf(id) < x.pts.length - 1 && new Set(x.pts).size > 2);
          out.push(this.section("Punkt", h("dl", { class: "kv" }, h("dt", {}, "X"), h("dd", {}, fmtNum(p.x, 3)), h("dt", {}, "Y"), h("dd", {}, fmtNum(p.y, 3))),
            fixed && id !== "O" ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.sketcher.commit("Fixierung lösen", (s) => { s.constraints = s.constraints.filter((c) => c !== fixed && c.id !== fixed.id); }) }, "Fixierung lösen")) : null,
            spl ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => { app.sketcher.commit("Spline-Punkt entfernen", (s) => {
              const se = s.entities.find((x) => x.id === spl.id);
              se.pts = se.pts.filter((q) => q !== id);
              if (!s.entities.some((x) => x.id !== se.id && ["p1", "p2", "c", "p", "a"].some((k) => x[k] === id)) && !s.entities.some((x) => x.pts?.includes(id))) {
                s.points = s.points.filter((p) => p.id !== id);
                s.constraints = s.constraints.filter((c) => c.p !== id && c.q !== id);
              }
            }); app.sketcher.sel.clear(); app.selectSketchItems([]); } }, "Aus Spline entfernen")) : null));
        }
      } else if (t === "c") {
        const c = sk.constraints.find((x) => x.id === id);
        if (c) {
          const names = { distance: "Abstand", length: "Länge", radius: "Radius", diameter: "Durchmesser", angle: "Winkel", horizontal: "Horizontal", vertical: "Vertikal", parallel: "Parallel", perpendicular: "Senkrecht", equal: "Gleich", tangent: "Tangential", tangentAt: "Tangential", fix: "Fixiert", coincident: "Koinzident", pointOnLine: "Punkt auf Linie", pointOnCircle: "Punkt auf Kreis", midpoint: "Mittelpunkt", concentric: "Konzentrisch", collinear: "Kollinear", symmetric: "Symmetrisch", offset: "Versatz", pattern: "Muster", semiAxis: "Halbachse", axisAngle: "Achswinkel" };
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
    // Generator-Baugruppe: Einstellungen hier, Einzelteile folgen (syncGenAssembly)
    if (asm.generator && GENERATORS[asm.generator.gen]) {
      out.push(this.section(GENERATORS[asm.generator.gen].label, h("p", { class: "hint" }, "Jedes Rohr, jeder Stab und jedes Blech ist ein eigenes Bauteil (gleiche Teile einmal, mehrfach eingesetzt). Änderungen hier passen alle Einzelteile an; Features, die in einem Bauteil angehängt wurden, bleiben erhalten.")));
      out.push(...this.genFields(asm.generator, asm, (fn, label) => app.edit(label, () => { fn(asm.generator); app.syncGenAssembly(asm); })));
      out.push(h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.paramsDialog() }, "Parameter…")));
    }
    if (asm.gestell) out.push(...gestellSections(this, asm));
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
      ...(asm.gestell ? memberSection(this, asm, c) : []),
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
      this.jointSection(asm, c),
    ];
  }
  /** Dreh- oder Schiebegelenk der Komponente (M23, E8): Wert live verstellen, Bereich, Bewegen, Kollision im Bereich */
  jointSection(asm, c) {
    const app = this.app, j = c.joint;
    if (!j) return this.section("Gelenk", h("p", { class: "hint" }, "Drehgelenk für Tor-Flügel, Klappen, Deckel; Schiebegelenk für Schiebetore und Auszüge: Achse bzw. Richtung festlegen, dann im Bereich bewegen."),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => this.jointDialog(c) }, "Drehgelenk anlegen"), h("button", { class: "btn", onclick: () => this.jointDialog(c, "schiebe") }, "Schiebegelenk anlegen"), h("button", { class: "btn", onclick: () => this.jointDialog(c, "zylinder") }, "Zylindergelenk anlegen")));
    const u = jointUnit(j), slide = isSlide(j);
    const out = h("span", { class: "num" }, fmtNum(j.angle, 1) + " " + u);
    const slider = h("input", { type: "range", class: "joint-angle", min: Math.min(j.min, j.max), max: Math.max(j.min, j.max), step: slide ? "5" : "0.5", value: j.angle, style: { width: "100%" } });
    const movers = [c.id, ...jointFollowers(asm, c.id)];
    slider.addEventListener("input", () => {
      const a = Number(slider.value);
      out.textContent = fmtNum(a, 1) + " " + u;
      const d = jointDelta(j, a);
      app.viewer.setComponentDeltas(new Map(movers.map((id) => [id, d])));
    });
    slider.addEventListener("change", () => app.edit(slide ? "Gelenkweg" : "Gelenkwinkel", () => { setJointAngle(c, Number(slider.value), movers.slice(1).map((id) => asm.components.find((x) => x.id === id)).filter(Boolean)); }));
    const lim = (label, key) => {
      const inp = h("input", { class: "inp", type: "number", step: "1", value: j[key] });
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        const next = { ...j, [key]: v };
        if (!Number.isFinite(v) || !(Math.min(next.min, next.max) <= j.angle && j.angle <= Math.max(next.min, next.max))) { inp.classList.add("bad"); inp.title = slide ? "Bereich muss den aktuellen Weg enthalten" : "Bereich muss den aktuellen Winkel enthalten"; return; }
        app.edit("Gelenkbereich", () => { j[key] = v; });
      });
      return this.field(label, h("div", { class: "expr-wrap" }, inp, h("span", { class: "val" }, u)));
    };
    const f = (v) => v.map((x) => fmtNum(x, 1)).join(" / ");
    // Zylindergelenk: zweiter Regler für den Weg entlang der Achse
    let slideRow = null;
    if (isCylinder(j)) {
      const so = h("span", { class: "num" }, fmtNum(j.s || 0, 1) + " mm");
      const ss = h("input", { type: "range", class: "joint-slide", min: Math.min(j.smin, j.smax), max: Math.max(j.smin, j.smax), step: "1", value: j.s || 0, style: { width: "100%" } });
      ss.addEventListener("input", () => { so.textContent = fmtNum(Number(ss.value), 1) + " mm"; const d = slideDelta(j, Number(ss.value)); app.viewer.setComponentDeltas(new Map(movers.map((id) => [id, d]))); });
      ss.addEventListener("change", () => app.edit("Gelenkweg", () => { setJointSlide(c, Number(ss.value), movers.slice(1).map((id) => asm.components.find((x) => x.id === id)).filter(Boolean)); }));
      slideRow = [this.field("Weg", h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, ss, so)), h("p", { class: "hint" }, `Weg ${fmtNum(j.smin, 0)} … ${fmtNum(j.smax, 0)} mm entlang der Achse`)];
    }
    return this.section(jointLabel(j),
      this.field(slide ? "Weg" : "Winkel", h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, slider, out)),
      lim("von", "min"), lim("bis", "max"),
      slideRow,
      h("dl", { class: "kv" }, slide ? null : h("dt", {}, "Achse durch"), slide ? null : h("dd", {}, f(j.p)), h("dt", {}, "Richtung"), h("dd", {}, f(j.d)),
        movers.length > 1 ? h("dt", {}, "Geht mit") : null, movers.length > 1 ? h("dd", {}, movers.slice(1).map((id) => asm.components.find((x) => x.id === id)?.name).join(", ")) : null),
      h("p", { class: "hint" }, "Abhängigkeiten verschieben diese Komponente nicht mehr; daran hängende Teile gehen mit."),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: () => this.animateJoints([c.id]) }, "Bewegen"),
        h("button", { class: "btn", onclick: () => this.jointSweepCheck(c) }, "Kollision im Bereich prüfen"),
        h("button", { class: "btn danger", onclick: () => app.edit(jointLabel(j) + " entfernen", () => { delete c.joint; }) }, "Gelenk entfernen")));
  }
  /** Schiebegelenk anlegen: Richtung (±X, ±Y, ±Z), Weg von … bis in mm; 0 = heutige Lage */
  slideDialog(c) {
    const app = this.app;
    const box = app.viewer.componentBox(c.id);
    const st = { dir: "-x", min: 0, max: box ? Math.round(box[1][0] - box[0][0]) : 1000 };
    const dirs = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
    const seg = h("div", { class: "seg" });
    const draw = () => seg.replaceChildren(...Object.keys(dirs).map((k) => h("button", { class: st.dir === k ? "on" : "", onclick: () => { st.dir = k; draw(); } }, k.toUpperCase())));
    draw();
    const num = (key) => { const i = h("input", { class: "inp", type: "number", step: "10", value: st[key] }); i.addEventListener("change", () => { st[key] = Number(i.value); }); return i; };
    modal({ title: "Schiebegelenk anlegen", width: "480px", body: h("div", {},
      h("p", {}, `Komponente »${c.name}« verschiebt sich entlang einer Richtung. Weg 0 ist die heutige Lage.`),
      this.field("Richtung", seg),
      this.field("Weg von", h("div", { class: "expr-wrap" }, num("min"), h("span", { class: "val" }, "mm"))),
      this.field("Weg bis", h("div", { class: "expr-wrap" }, num("max"), h("span", { class: "val" }, "mm")))),
    buttons: [{ label: "Abbrechen" }, { label: "Anlegen", primary: true, run: () => {
      if (!(Math.min(st.min, st.max) <= 0 && Math.max(st.min, st.max) >= 0) || st.min === st.max) { toast("Der Bereich muss 0 (heutige Lage) enthalten", { kind: "err" }); return false; }
      app.edit("Schiebegelenk", () => { c.joint = defaultJoint([0, 0, 0], dirs[st.dir], { min: st.min, max: st.max, kind: "schiebe" }); });
      app.sel = { type: "component", id: c.id };
      this.render();
    } }] });
  }
  /** Drehgelenk anlegen: Achse an einer Kante der Komponente, an einer Konzentrisch-Abhängigkeit oder frei */
  jointDialog(comp, kind = "dreh") {
    const app = this.app, asm = app.activeDoc();
    if (asm?.kind !== "assembly") return;
    const c = comp || (app.sel?.type === "component" ? asm.components.find((x) => x.id === app.sel.id) : null);
    if (!c) return toast("Erst die Komponente wählen, die sich drehen soll (z. B. den Torflügel)");
    if (c.joint) return toast(`${c.name} hat schon ein ${jointLabel(c.joint)}`);
    if (c.fixed) return toast("Fixierte Komponenten bewegen sich nicht – Fixierung lösen");
    if (kind === "schiebe") return this.slideDialog(c);
    const box = app.viewer.componentBox(c.id);
    if (!box) return toast("Komponente ist leer oder ausgeblendet");
    // Achse aus Konzentrisch-Abhängigkeit (Bolzen, Scharnier) in Baugruppen-Koordinaten
    const conc = (asm.constraints || []).find((k) => !k.suppressed && k.type === "konzentrisch" && (k.a.comp === c.id || k.b.comp === c.id));
    let concAxis = null;
    if (conc) { const ref = conc.a.comp === c.id ? conc.b : conc.a, other = asm.components.find((x) => x.id === ref.comp); if (other) { const M = placementMatrix(other.pos, other.rot); concAxis = { p: matApply(M, ref.p), d: matApplyDir(M, ref.d) }; } }
    const st = { at: concAxis ? "bolzen" : "links", dir: "z", min: 0, max: 90, smin: 0, smax: 100 };
    const point = () => {
      if (st.at === "bolzen") return concAxis.p;
      const [lo, hi] = box, mid = lo.map((x, k) => (x + hi[k]) / 2);
      const p = [...mid];
      const ax = { x: 0, y: 1, z: 2 }[st.dir];
      p[ax] = lo[ax];
      if (st.at === "links") p[0] = lo[0]; else if (st.at === "rechts") p[0] = hi[0]; else if (st.at === "vorne") p[1] = lo[1]; else if (st.at === "hinten") p[1] = hi[1];
      return p;
    };
    const dirVec = () => (st.at === "bolzen" ? concAxis.d : { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[st.dir]);
    const pIn = [0, 1, 2].map(() => h("input", { class: "inp" }));
    const fill = () => point().forEach((x, k) => { pIn[k].value = String(Math.round(x * 100) / 100); });
    const seg = (opts, key) => { const w = h("div", { class: "seg" }); const draw = () => { w.replaceChildren(...opts.map(([v, l]) => h("button", { class: st[key] === v ? "on" : "", onclick: () => { st[key] = v; draw(); fill(); } }, l))); }; draw(); return w; };
    const num = (key) => { const i = h("input", { class: "inp", type: "number", step: "1", value: st[key] }); i.addEventListener("change", () => { st[key] = Number(i.value); }); return i; };
    const atOpts = [...(concAxis ? [["bolzen", "Bolzenachse"]] : []), ["links", "links"], ["rechts", "rechts"], ["vorne", "vorne"], ["hinten", "hinten"], ["mitte", "Mitte"]];
    fill();
    const body = h("div", {},
      h("p", {}, `Komponente »${c.name}« dreht sich um eine Achse. Winkel 0° ist die heutige Lage.`),
      this.field("Achse an", seg(atOpts, "at")),
      this.field("Richtung", seg([["z", "senkrecht (Z)"], ["x", "X"], ["y", "Y"]], "dir")),
      this.field("Punkt auf der Achse", h("div", { class: "vec3" }, ...pIn)),
      this.field("Winkel von", h("div", { class: "expr-wrap" }, num("min"), h("span", { class: "val" }, "°"))),
      this.field("Winkel bis", h("div", { class: "expr-wrap" }, num("max"), h("span", { class: "val" }, "°"))),
      kind === "zylinder" ? this.field("Weg von", h("div", { class: "expr-wrap" }, num("smin"), h("span", { class: "val" }, "mm"))) : null,
      kind === "zylinder" ? this.field("Weg bis", h("div", { class: "expr-wrap" }, num("smax"), h("span", { class: "val" }, "mm"))) : null,
      h("p", { class: "hint" }, "Positiv = gegen den Uhrzeigersinn, wenn man entgegen der Achsrichtung schaut (bei Z: von oben). Für die andere Richtung negative Winkel angeben."));
    const label = kind === "zylinder" ? "Zylindergelenk" : "Drehgelenk";
    modal({ title: label + " anlegen", width: "520px", body, buttons: [{ label: "Abbrechen" }, { label: "Anlegen", primary: true, run: () => {
      const p = pIn.map((i) => Number(String(i.value).replace(",", ".")));
      if (p.some((x) => !Number.isFinite(x))) { toast("Punkt auf der Achse prüfen", { kind: "err" }); return false; }
      if (!(Math.min(st.min, st.max) <= 0 && Math.max(st.min, st.max) >= 0) || st.min === st.max) { toast("Der Bereich muss 0° (heutige Lage) enthalten", { kind: "err" }); return false; }
      if (kind === "zylinder" && (!(Math.min(st.smin, st.smax) <= 0 && Math.max(st.smin, st.smax) >= 0) || st.smin === st.smax)) { toast("Der Weg muss 0 (heutige Lage) enthalten", { kind: "err" }); return false; }
      app.edit(label, () => { c.joint = defaultJoint(p, dirVec(), { min: st.min, max: st.max, kind, smin: st.smin, smax: st.smax }); });
      app.sel = { type: "component", id: c.id };
      this.render();
    } }] });
  }
  /** Gelenke hin und zurück bewegen (nur Anzeige); ids = Komponenten mit Gelenk, sonst alle */
  animateJoints(ids, { duration = 3000 } = {}) {
    const app = this.app, asm = app.activeDoc();
    if (asm?.kind !== "assembly") return Promise.resolve(false);
    const list = asm.components.filter((c) => c.joint && !c.hidden && (!ids || ids.includes(c.id)));
    if (!list.length) { toast("Keine Komponente mit Drehgelenk – erst »Drehgelenk« anlegen"); return Promise.resolve(false); }
    if (this.animating) return this.animating;
    const movers = list.map((c) => ({ c, ids: [c.id, ...jointFollowers(asm, c.id)] }));
    this.animating = new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const map = new Map();
        for (const m of movers) { const d = jointDelta(m.c.joint, swingAngle(m.c.joint, t)); for (const id of m.ids) map.set(id, d); }
        app.viewer.setComponentDeltas(map);
        if (t < 1) requestAnimationFrame(step);
        else { app.viewer.setComponentDeltas(new Map()); this.animating = null; resolve(true); }
      };
      requestAnimationFrame(step);
    });
    return this.animating;
  }
  /** Kollision im Bewegungsbereich: an 7 Winkeln die bewegten Teile gegen alle anderen prüfen */
  async jointSweepCheck(c, { steps = 6, silent = false } = {}) {
    const app = this.app, asm = app.activeDoc();
    const movers = new Set([c.id, ...jointFollowers(asm, c.id)]);
    const comps = asm.components.filter((x) => !x.hidden && app.doc(x.part));
    const busy = silent ? null : toast("Bewegungsbereich wird geprüft …", { timeout: 0 });
    const rows = [];
    try {
      for (const a of sweepAngles(c.joint, steps)) {
        const D = jointDelta(c.joint, a);
        const items = comps.flatMap((x) => flattenAssembly({ id: asm.id, components: [x] }, (id) => app.doc(id)).map((o) => ({ key: x.id, part: o.part, ...decomposePlacement(movers.has(x.id) ? matMul(D, o.matrix) : o.matrix), name: x.name })));
        const res = (await app.kernel.call("collisions", { items })).filter((r) => r.a !== r.b && (movers.has(r.a) !== movers.has(r.b)));
        rows.push({ angle: a, hits: res });
      }
    } catch (e) { busy?.remove(); toast("Prüfung fehlgeschlagen: " + e.message, { kind: "err" }); return null; }
    busy?.remove();
    if (silent) return rows;
    const name = (id) => asm.components.find((x) => x.id === id)?.name || id;
    const bad = rows.filter((r) => r.hits.length);
    const u = jointUnit(c.joint), sl = isSlide(c.joint), what = sl ? "Stellungen" : "Winkeln";
    const body = bad.length
      ? h("div", {}, h("p", {}, `Kollision bei ${bad.length} von ${rows.length} geprüften ${what}.`),
        h("table", { class: "grid" }, h("thead", {}, h("tr", {}, h("th", {}, sl ? "Weg" : "Winkel"), h("th", {}, "Stößt an"))),
          h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, fmtNum(r.angle, 1) + " " + u), h("td", {}, r.hits.length ? [...new Set(r.hits.map((x) => name(movers.has(x.a) ? x.b : x.a)))].join(", ") : "frei"))))))
      : h("p", {}, `Frei im ganzen Bereich ${fmtNum(c.joint.min, 1)} ${u} … ${fmtNum(c.joint.max, 1)} ${u} (${rows.length} ${what} geprüft). Berührende Flächen zählen nicht.`);
    modal({ title: `Bewegungsbereich – ${c.name}`, width: "520px", body, buttons: [{ label: "Schließen", primary: true }] });
    return rows;
  }
  /** Explosionsdarstellung: Regler für den Abstand (nur Anzeige, bleibt bis zum Zurücksetzen) */
  explodeDialog() {
    const app = this.app, v = app.viewer;
    if (app.activeDoc()?.kind !== "assembly") return;
    const out = h("span", { class: "num" });
    const r = h("input", { type: "range", class: "explode-factor", min: "0", max: "2", step: "0.05", value: v.explode || 0.6, style: { width: "100%" } });
    const show = () => { out.textContent = Math.round(Number(r.value) * 100) + " %"; v.setExplode(Number(r.value)); };
    r.addEventListener("input", show);
    show();
    modal({ title: "Explosionsdarstellung", width: "420px",
      body: h("div", {}, h("p", {}, "Komponenten rücken von der Mitte weg. Nur Anzeige – Lage, Stückliste und Export bleiben unverändert; das Bild (PNG/Rendern) zeigt die Explosion."),
        this.field("Abstand", h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, r, out))),
      buttons: [{ label: "Zusammenbauen", run: () => { v.setExplode(0); app.ribbon.render(); } }, { label: "Übernehmen", primary: true, run: () => app.ribbon.render() }],
      onClose: () => app.ribbon.render() });
  }
  constraintProps(asm, c) {
    const app = this.app;
    const err = app.asmErrors?.[c.id];
    const comp = (id) => asm.components.find((x) => x.id === id);
    return [
      err ? h("div", { class: "msg err" }, err) : null,
      this.section(c.name || "Abhängigkeit",
        h("dl", { class: "kv" }, h("dt", {}, "Bewegt"), h("dd", {}, comp(c.b.comp)?.name || "–"), h("dt", {}, "Ziel"), h("dd", {}, comp(c.a.comp)?.name || "–")),
        ["gegen", "buendig"].includes(c.type) ? this.seg("Art", [["gegen", "Gegeneinander"], ["buendig", "Bündig"]], c.type, (v) => app.edit("Abhängigkeit", () => { c.type = v; c.name = c.name?.replace(/^[^:]+/, v === "buendig" ? "Bündig" : "Fläche an Fläche"); })) : h("dl", { class: "kv" }, h("dt", {}, "Art"), h("dd", {}, CONSTRAINT_TYPES[c.type] || c.type)),
        c.type === "winkel" ? this.expr("Winkel", c.angle ?? "90", (v) => app.edit("Winkel", () => { c.angle = v; }), { unit: "°", allowNeg: false })
          : c.type === "konzentrisch" ? null : this.expr("Abstand", c.gap || "0", (v) => app.edit("Abstand", () => { c.gap = v; })),
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
    const mode = a.mode || "gegen";
    const conc = mode === "konzentrisch" || mode === "einfuegen";
    const titles = { konzentrisch: "Konzentrisch ausrichten", buendig: "Bündig ausrichten", winkel: "Winkel", tangential: "Tangential", einfuegen: "Einfügen" };
    const steps = {
      konzentrisch: ["1. Zylinderfläche am Bauteil anklicken, das bewegt wird.", "2. Zylinderfläche (Bohrung, Rohr) am anderen Bauteil anklicken."],
      einfuegen: ["1. Zylinderfläche nahe der Stirnfläche am Bauteil anklicken, das bewegt wird (z. B. Schraubenschaft unter dem Kopf).", "2. Bohrung nahe der Fläche anklicken, auf der es aufliegen soll."],
      tangential: ["1. Ebene oder zylindrische Fläche am Bauteil anklicken, das bewegt wird.", "2. Die andere Art (Zylinder bzw. Ebene) am anderen Bauteil anklicken."],
    };
    const st = steps[mode] || ["1. Fläche am Bauteil anklicken, das bewegt wird.", "2. Zielfläche am anderen Bauteil anklicken."];
    return [this.section(titles[mode] || "Fläche an Fläche",
      h("p", {}, a.first ? st[1] : st[0]),
      this.select("Art", [["gegen", "Gegeneinander"], ["buendig", "Bündig"], ["konzentrisch", "Konzentrisch"], ["einfuegen", "Einfügen"], ["winkel", "Winkel"], ["tangential", "Tangential"]], mode, (v) => { app.align.mode = v; app.align.first = null; app.refreshSelectionHits(); this.render(); }),
      mode === "konzentrisch" ? h("p", { class: "hint" }, "Achsen fluchten; Lage entlang der Achse und Drehung um sie bleiben frei – mit »Fläche an Fläche« festlegen.")
        : mode === "winkel" ? this.expr("Winkel", a.angle || "90", (v) => { app.align.angle = v; }, { unit: "°", allowNeg: false })
        : this.expr("Abstand", a.gap || "0", (v) => { app.align.gap = v; }),
      this.check("Als Abhängigkeit speichern (folgt Änderungen)", a.persist !== false, (v) => { app.align.persist = v; }),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => app.cancelPick() }, "Abbrechen")))];
  }
  placeComponentDialog() {
    const app = this.app;
    const asm = app.activeDoc();
    if (asm?.kind !== "assembly") return;
    const parts = [...app.parts(), ...app.project.docs.filter((x) => x.kind === "assembly" && canInsert(asm, x, (id) => app.doc(id)))];
    if (!parts.length) return toast("Im Projekt gibt es noch kein Bauteil");
    let chosen = parts[0].id;
    const qty = h("input", { class: "inp", type: "number", min: 1, value: 1 });
    const list = h("div", {}, ...parts.map((p) => h("label", { class: "chk" }, h("input", { type: "radio", name: "pp", checked: p.id === chosen, onchange: () => { chosen = p.id; } }), p.name, p.kind === "assembly" ? h("span", { class: "hint" }, " (Unterbaugruppe)") : null, p.number ? h("span", { class: "hint" }, " " + p.number) : null)));
    modal({
      title: "Bauteil oder Unterbaugruppe platzieren",
      body: h("div", {}, list, this.field("Anzahl", qty)),
      buttons: [{ label: "Abbrechen" }, { label: "Platzieren", primary: true, run: () => {
        const n = Math.max(1, Math.min(100, Number(qty.value) || 1));
        const p = app.doc(chosen);
        const occ = p.kind === "assembly" ? flattenAssembly(p, (id) => app.doc(id)) : [{ part: p }];
        const bb = unionBox(occ.flatMap((o) => (app.results.get(o.part.id)?.bodies || []).map((b) => b.props?.bbox).filter(Boolean)));
        const w = bb ? bb[1][0] - bb[0][0] + 20 : 100;
        app.edit("Platzieren", () => {
          const existing = asm.components.length;
          for (let i = 0; i < n; i++) asm.components.push({ id: uid("c"), part: chosen, name: `${p.name}:${asm.components.filter((c) => c.part === chosen).length + 1}`, pos: [(existing + i) * w * 0 + i * w, 0, 0], rot: [0, 0, 0], fixed: asm.components.length === 0 && i === 0 });
        });
      } }],
    });
  }
  /** Schiebetor (E8) als Baugruppe: Bauteil Flügel (Schiebegelenk −X, 0 … Durchfahrt) und Bauteil feste Teile */
  slidingGateAssembly(f, planOf, { into } = {}) {
    const app = this.app, src = into ? {} : app.activeDoc();
    let W;
    try { W = resolveGenParams(f.gen, f.params, (x) => evaluate(String(x), this.scope())).width; planOf(f.params); } catch (e) { return toast("Schiebetor rechnet nicht: " + e.message, { kind: "err" }); }
    const base = f.name || "Schiebetor";
    const mk = (teil, label) => {
      const p = app.withPartDefaults(newPart(`${base} ${label}`));
      p.material = src.material || p.material;
      p.color = src.color ?? null;
      if (src.finish) p.finish = JSON.parse(JSON.stringify(src.finish));
      p.params = JSON.parse(JSON.stringify(src.params || []));
      p.features = [{ ...JSON.parse(JSON.stringify(f)), id: uid("f"), name: `${base} ${label}`, params: { ...f.params, teil } }];
      return p;
    };
    const leaf = mk("fluegel", "Flügel"), fixed = mk("fest", "feste Teile");
    const asm = newAssembly(app.docName("assembly"));
    asm.name = base;
    asm.components.push({ id: uid("c"), part: fixed.id, name: fixed.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true });
    asm.components.push({ id: uid("c"), part: leaf.id, name: leaf.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0], joint: defaultJoint([0, 0, 0], [-1, 0, 0], { min: 0, max: Math.round(W), kind: "schiebe" }) });
    app.edit("Schiebetor als Baugruppe", () => {
      app.project.docs.push(leaf, fixed, asm);
      if (into) into.components.push({ id: uid("c"), part: asm.id, name: asm.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: !into.components.length });
    }, { rebuild: false });
    app.openDoc(asm.id);
    app.sel = { type: "component", id: asm.components[1].id };
    this.render();
    toast(`Baugruppe »${asm.name}« mit Schiebegelenk angelegt`, { kind: "ok" });
  }
  newPartForAssembly() {
    const app = this.app;
    const asm = app.activeDoc();
    const p = app.newPart();
    app.edit("Bauteil einfügen", () => { asm.components.push({ id: uid("c"), part: p.id, name: p.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0] }); }, { rebuild: false });
    toast(`»${p.name}« angelegt und in »${asm.name}« eingefügt`);
  }
  /** Komponentenmuster aus der gewählten Komponente anlegen */
  newAsmPattern() {
    const app = this.app, asm = app.activeDoc();
    if (asm?.kind !== "assembly") return;
    const c = app.sel?.type === "component" ? asm.components.find((x) => x.id === app.sel.id && !x.pat) : null;
    if (!c) return toast("Erst die Komponente wählen, die vervielfältigt werden soll");
    const box = app.viewer.componentBox(c.id);
    const p = defaultAsmPattern(uid("pm"), [c.id]);
    p.name = `Muster ${(asm.patterns || []).length + 1}`;
    if (box) p.spacing = String(Math.round((box[1][0] - box[0][0]) * 1.5) || 100);
    app.edit("Komponentenmuster", () => { asm.patterns = [...(asm.patterns || []), p]; });
    app.sel = { type: "asmpattern", id: p.id };
    this.render();
  }
  asmPatternProps(asm, p) {
    const app = this.app;
    const set = (label, fn) => app.edit(label, fn);
    const E = (label, key, opts) => this.expr(label, p[key] ?? "", (v) => set(label, () => { p[key] = v; }), opts);
    const dirs = [["X", "X"], ["Y", "Y"], ["Z", "Z"], ["-X", "−X"], ["-Y", "−Y"], ["-Z", "−Z"]];
    const err = app.asmErrors?.[p.id];
    const srcs = asm.components.filter((c) => !c.pat);
    const n = asm.components.filter((c) => c.pat === p.id).length;
    return [
      err ? h("div", { class: "msg err" }, err) : null,
      this.section("Komponentenmuster",
        this.text("Name", p.name || "", (v) => set("Name", () => { p.name = v; })),
        this.field("Komponenten", h("div", { class: "checks" }, ...srcs.map((c) => {
          const box = h("input", { type: "checkbox", checked: p.comps.includes(c.id) ? true : undefined });
          box.addEventListener("change", () => set("Komponenten", () => { p.comps = box.checked ? [...new Set([...p.comps, c.id])] : p.comps.filter((x) => x !== c.id); }));
          return h("label", { class: "check" }, box, " ", c.name);
        })), true),
        this.seg("Art", [["linear", "Rechteckig"], ["circular", "Kreisförmig"]], p.kind, (v) => set("Art", () => { Object.assign(p, defaultAsmPattern(p.id, p.comps, v), { name: p.name }); })),
        p.kind === "circular" ? [
          this.seg("Achse", dirs.slice(0, 3), p.axis || "Z", (v) => set("Achse", () => { p.axis = v; })),
          this.vec3("Mittelpunkt", p.center, (v) => set("Mittelpunkt", () => { p.center = v; })),
          E("Anzahl", "count", { unit: "Stk" }), E("Gesamtwinkel", "angle", { unit: "°" }),
        ] : [
          this.seg("Richtung 1", dirs, p.dir || "X", (v) => set("Richtung", () => { p.dir = v; })),
          E("Anzahl 1", "count", { unit: "Stk" }), E("Abstand 1", "spacing"),
          this.check("Zweite Richtung", !!p.dir2, (v) => set("Richtung 2", () => { p.dir2 = v ? "Y" : undefined; p.count2 = p.count2 || "2"; p.spacing2 = p.spacing2 || p.spacing; })),
          p.dir2 ? [this.seg("Richtung 2", dirs, p.dir2, (v) => set("Richtung 2", () => { p.dir2 = v; })), E("Anzahl 2", "count2", { unit: "Stk" }), E("Abstand 2", "spacing2")] : null,
        ],
        h("p", { class: "hint" }, `${n} Kopie(n). Sie folgen der Quelle und zählen in Stückliste und Zeichnung.`),
        this.check("Unterdrückt", p.suppressed, (v) => set("Muster", () => { p.suppressed = v || undefined; }))),
      h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => set("Muster löschen", () => { asm.patterns = asm.patterns.filter((x) => x.id !== p.id); asm.components = asm.components.filter((c) => c.pat !== p.id); app.sel = null; }) }, "Muster löschen")),
    ];
  }
  patternCopyProps(asm, c) {
    const app = this.app, p = (asm.patterns || []).find((x) => x.id === c.pat), src = asm.components.find((x) => x.id === c.src);
    return [this.section("Musterkopie",
      h("p", {}, `Kopie von »${src?.name || "?"}« aus ${p?.name || "Muster"}. Lage und Bauteil kommen aus der Quelle.`),
      h("div", { class: "btn-row" },
        p ? h("button", { class: "btn primary", onclick: () => { app.sel = { type: "asmpattern", id: p.id }; app.tree.render(); this.render(); } }, "Muster bearbeiten") : null,
        src ? h("button", { class: "btn", onclick: () => { app.sel = { type: "component", id: src.id }; app.refreshSelectionHits(); app.tree.render(); this.render(); } }, "Quelle wählen") : null))];
  }
  deleteComponent(id) {
    const asm = this.app.activeDoc();
    this.app.edit("Komponente entfernen", () => {
      asm.components = asm.components.filter((c) => c.id !== id && c.src !== id);
      asm.constraints = (asm.constraints || []).filter((c) => c.a.comp !== id && c.b.comp !== id);
      for (const p of asm.patterns || []) p.comps = p.comps.filter((x) => x !== id);
      asm.patterns = (asm.patterns || []).filter((p) => p.comps.length);
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
    if (part?.kind !== "part" && !part?.generator) return toast("Parameter gehören zu einem Bauteil");
    const rows = JSON.parse(JSON.stringify(part.params || []));
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
        app.edit("Parameter", () => { part.params = rows; if (part.generator) app.syncGenAssembly(part); });
      } }],
    });
  }
  bomDialog() {
    const app = this.app;
    const asm = app.activeDoc();
    const rows = bomRows(app, asm);
    const docOf = (id) => app.doc(id);
    const nested = asm.components.some((c) => docOf(c.part)?.kind === "assembly");
    const body = h("div", {});
    const show = (form) => {
      if (form === "struktur") body.replaceChildren(structureTable(structureBom(asm, docOf), app));
      else if (form === "baukasten") body.replaceChildren(...modularBom(asm, docOf).map((x) => h("div", {}, h("h4", {}, x.asm.name), modularTable(x.rows, app))));
      else body.replaceChildren(bomTable(rows));
    };
    const tabs = h("div", {});
    const setForm = (v) => { tabs.replaceChildren(this.seg("", [["menge", "Mengen"], ["struktur", "Struktur"], ["baukasten", "Baukasten"]], v, setForm)); show(v); };
    if (nested) setForm("menge"); else show("menge");
    modal({ title: `Stückliste – ${asm.name}`, width: "760px", body: h("div", {}, tabs, body, nested ? h("p", { class: "hint" }, "Mengen: alle Bauteile summiert. Struktur: Baum mit Ebenen (Menge je übergeordneter Einheit, Gesamt). Baukasten: je Baugruppe nur die direkten Bestandteile. Alle drei stehen auch in »Listen (Excel)«.") : null), buttons: [{ label: "Schließen" }, { label: "Als CSV exportieren", primary: true, run: () => app.files.exportBom() }] });
  }
  cutListDialog() {
    const app = this.app;
    const d = app.activeDoc();
    const rows = cutListRows(collectCutSources(app, d));
    modal({ title: `Zuschnittliste – ${d.name}`, width: "820px", body: rows.length ? h("div", {}, cutListTable(rows), cutListTotalsTable(cutListTotals(rows)), this.dfmList(rows, true), h("details", { class: "hint" }, h("summary", {}, "Regeln der Zuschnittliste"), h("ul", {}, ...CUT_RULES.map((t) => h("li", {}, t))))) : h("p", {}, "Keine Profile (Rohr / Rahmen) enthalten."), buttons: [{ label: "Schließen" }, { label: "Als CSV exportieren", primary: true, run: () => app.files.exportCutList() }] });
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
    // Unterbaugruppen: alle ihre Bauteile mit dem Schlüssel der Komponente (innere Kollisionen zählen hier nicht)
    const items = comps.flatMap((c) => flattenAssembly({ id: asm.id, components: [c] }, (id) => app.doc(id)).map((o) => ({ key: c.id, part: o.part, ...decomposePlacement(o.matrix), name: c.name })));
    const name = (id) => { const c = asm.components.find((x) => x.id === id); return c?.name || app.doc(c?.part)?.name || id; };
    const busy = toast("Kollisionen werden geprüft …", { timeout: 0 });
    let res;
    try { res = (await app.kernel.call("collisions", { items })).filter((r) => r.a !== r.b); }
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
  /** Berechnungsprotokoll (Einstellung kernel.protokoll): letzte Neuaufbauten mit Dauer und Meldungen */
  buildLogDialog() {
    const app = this.app;
    const on = app.prefs.get("kernel.protokoll");
    const body = h("div", { class: "buildlog" });
    const render = () => {
      const list = app.buildLog.entries();
      body.replaceChildren(
        on ? null : h("p", { class: "msg warn" }, "Das Protokoll ist aus. Einschalten unter Einstellungen → CAD-Kernel und Leistung."),
        list.length ? h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Zeit", "Bauteil", "Dauer", "Features", "Körper", "Meldungen"].map((t) => h("th", {}, t)))),
          h("tbody", {}, ...list.map((e) => h("tr", { class: e.msgs.some((m) => m.kind === "Fehler") ? "err" : "" },
            h("td", {}, new Date(e.time).toLocaleTimeString("de-DE")), h("td", {}, e.part), h("td", { class: "num" }, e.ms + " ms"),
            h("td", { class: "num" }, String(e.features)), h("td", { class: "num" }, String(e.bodies)),
            h("td", {}, ...e.msgs.map((m) => h("div", {}, `${m.kind} ${m.feature}: ${m.text}`)))))))
          : h("p", { class: "hint" }, "Noch keine Berechnung protokolliert."));
    };
    render();
    modal({ title: "Berechnungsprotokoll", width: 760, body, buttons: [
      { label: "Leeren", run: () => { app.buildLog.clear(); render(); return false; } },
      { label: "Kopieren", run: () => { navigator.clipboard?.writeText(app.buildLog.text()).then(() => toast("Protokoll kopiert", { kind: "ok" }), () => toast("Kopieren nicht möglich", { kind: "err" })); return false; } },
      { label: "Schließen", primary: true }] });
  }
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
/** Mengenstückliste: alle Bauteile der Baugruppe einschließlich der Unterbaugruppen, summiert */
const resolvedOrNull = (fn) => { try { return fn(); } catch { return null; } };

export function bomRows(app, asm) {
  const map = new Map(), norm = [];
  for (const o of flattenAssembly(asm, (id) => app.doc(id))) {
    const p = o.part;
    const r = app.results.get(p.id);
    // Normteile (M20) zählen als eigene Zeilen mit Normbezeichnung; ein Bauteil nur aus Normteilen entfällt selbst
    const own = (r?.bodies || []).filter((b) => !b.meta?.norm);
    if (r && r.bodies.length && !own.length) { norm.push({ bodies: r.bodies, qty: 1 }); continue; }
    if (r && own.length < r.bodies.length) norm.push({ bodies: r.bodies, qty: 1 });
    const mass = r ? bodiesMass(own, materialOf(p.material).density) : NaN;
    const row = map.get(p.id) || { part: p, name: p.name, number: p.number || "", material: p.material ? materialOf(p.material).label : "", finish: finishLabel(p), qty: 0, mass };
    row.qty++;
    map.set(p.id, row);
  }
  const normRows = collectNorm(norm).map((x) => ({ name: x.name, number: "", material: x.material, qty: x.qty, mass: x.mass, norm: true }));
  return [...map.values(), ...normRows].map((r, i) => ({ ...r, pos: i + 1 }));
}
function bomTable(rows, compact = false) {
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Pos"), h("th", {}, "Benennung"), compact ? null : h("th", {}, "Nummer"), h("th", {}, "Menge"), compact ? null : h("th", {}, "Werkstoff"), h("th", {}, "Masse kg"))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, String(r.pos)), h("td", {}, r.name), compact ? null : h("td", {}, r.number), h("td", { class: "num" }, String(r.qty)), compact ? null : h("td", {}, [r.material, finishLabel({ finish: r.part?.finish }, { short: true })].filter(Boolean).join(" · ")), h("td", { class: "num" }, fmtNum(r.mass, 3))))));
}
function structureTable(rows, app) {
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Ebene"), h("th", {}, "Benennung"), h("th", {}, "Nummer"), h("th", {}, "Menge"), h("th", {}, "Gesamt"), h("th", {}, "Art"))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", {}, r.level), h("td", { style: { paddingLeft: 6 + r.depth * 14 + "px" } }, r.doc.name), h("td", {}, r.doc.number || ""), h("td", { class: "num" }, String(r.qty)), h("td", { class: "num" }, String(r.total)), h("td", {}, r.kind === "assembly" ? "Baugruppe" : "Bauteil")))));
}
function modularTable(rows) {
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Pos"), h("th", {}, "Benennung"), h("th", {}, "Nummer"), h("th", {}, "Menge"), h("th", {}, "Art"))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, String(r.pos)), h("td", {}, r.doc.name), h("td", {}, r.doc.number || ""), h("td", { class: "num" }, String(r.qty)), h("td", {}, r.kind === "assembly" ? "Baugruppe" : "Bauteil")))));
}
export function collectCutSources(app, d) {
  if (d.kind === "part") { const r = app.results.get(d.id); return r ? [{ part: d, result: r, qty: 1 }] : []; }
  if (d.kind === "assembly") {
    const counts = partCounts(d, (id) => app.doc(id));
    return [...counts].map(([pid, qty]) => ({ part: app.doc(pid), result: app.results.get(pid), qty })).filter((x) => x.part && x.result);
  }
  return [];
}
function cutListTable(rows, compact = false) {
  const miter = (r) => endsText(r);
  return h("table", { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Pos"), h("th", {}, "Profil"), h("th", {}, "Länge"), h("th", {}, "Stk"), h("th", {}, "Enden"), compact ? null : h("th", {}, "kg/m"), compact ? null : h("th", {}, "kg/Stk"), compact ? null : h("th", {}, "Werkstoff"))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", { class: "num" }, String(r.pos)), h("td", { title: r.section, style: { whiteSpace: "nowrap" } }, r.profileId), h("td", { class: "num" }, fmtNum(r.length, 1)), h("td", { class: "num" }, String(r.qty)), h("td", { title: partsText(r) || null }, miter(r), compact || !r.miterParts ? null : h("div", { class: "hint" }, partsText(r))),
      compact ? null : h("td", { class: "num" }, fmtNum(r.kgm, 2)), compact ? null : h("td", { class: "num" }, fmtNum(r.mass, 2)), compact ? null : h("td", {}, r.material)))));
}
/** Summen je Profil (Bestellung/Lager) unter der Zuschnittliste */
function cutListTotalsTable(t) {
  return h("table", { class: "grid totals" },
    h("thead", {}, h("tr", {}, h("th", {}, "Profil"), h("th", {}, "Werkstoff"), h("th", {}, "Stk"), h("th", {}, "Länge gesamt m"), h("th", {}, "kg/m"), h("th", {}, "kg gesamt"))),
    h("tbody", {}, ...t.groups.map((g) => h("tr", {}, h("td", { style: { whiteSpace: "nowrap" } }, g.profileId), h("td", {}, g.material), h("td", { class: "num" }, String(g.qty)), h("td", { class: "num" }, fmtNum(g.length / 1000, 2)), h("td", { class: "num" }, fmtNum(g.kgm, 2)), h("td", { class: "num" }, fmtNum(g.mass, 2)))),
      h("tr", { class: "sum" }, h("td", {}, h("b", {}, "Summe")), h("td", {}), h("td", { class: "num" }, String(t.qty)), h("td", { class: "num" }, fmtNum(t.length / 1000, 2)), h("td", {}), h("td", { class: "num" }, h("b", {}, fmtNum(t.mass, 2))))));
}
export { FEATURE_NAMES, scaleLabel, cutListRows, endsText };
