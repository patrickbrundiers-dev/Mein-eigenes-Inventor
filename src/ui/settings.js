// Einstellungscenter: Kategorien links, Suche oben, Optionen rechts. Gültige Änderungen wirken sofort.
import { h, modal, toast, confirmDialog } from "./dom.js";
import { CATEGORIES, SETTINGS, searchSettings, settingDef, defaultSettings } from "../core/settings.js";
import { materialList, validateMaterial, exportMaterialLib, importMaterialLib, usedMaterialKeys } from "../core/materials.js";
import { keymapEditor, quickAccessEditor } from "./commands.js";
import { orderedLabels, setGroupHidden, moveGroup, resetRibbonLayout, PROTECTED } from "../core/ribbonlayout.js";
import { MODES, ANGLE_REFS, validateBendTable, tableToCsv, parseTableText, dinK, bendTableUses, tableId, sameTable } from "../core/bendtable.js";

const STATUS = { aktiv: "", teilweise: "teilweise", geplant: "geplant" };

export function settingsCenter(app, { category = "allgemein" } = {}) {
  const prefs = app.prefs;
  let cat = category;
  let query = "";
  const nav = h("nav", { class: "set-nav" });
  const pane = h("div", { class: "set-pane" });
  const search = h("input", { class: "inp", type: "search", placeholder: "Einstellung suchen …", "aria-label": "Einstellungen durchsuchen" });
  search.addEventListener("input", () => { query = search.value; render(); });

  const render = () => {
    const found = searchSettings(query);
    const cats = query ? found.categories : CATEGORIES;
    if (!cats.some((c) => c.id === cat) && cats[0]) cat = cats[0].id;
    nav.replaceChildren(...cats.map((c) => h("button", { class: "set-cat" + (c.id === cat ? " on" : ""), onclick: () => { cat = c.id; render(); } },
      h("span", {}, c.label), STATUS[c.status] ? h("span", { class: "set-badge " + c.status }, STATUS[c.status]) : null)));
    if (!cats.length) { pane.replaceChildren(h("p", { class: "hint" }, `Nichts gefunden für »${query}«.`)); return; }
    const c = CATEGORIES.find((x) => x.id === cat);
    const list = (query ? found.settings : SETTINGS).filter((s) => s.cat === cat && !s.custom);
    pane.replaceChildren(...[
      h("h3", { class: "set-title" }, c.label),
      c.note ? h("p", { class: "hint" }, c.note) : null,
      ...list.map((s) => row(s)),
      ...extras(app, cat),
      c.planned?.length ? h("div", { class: "set-planned" }, h("b", {}, "Geplant, noch nicht einstellbar:"), h("ul", {}, ...c.planned.map((t) => h("li", {}, t)))) : null,
      list.length ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => { prefs.reset(list.map((s) => s.key)); render(); } }, `»${c.label}« auf Standard`)) : null,
    ].filter(Boolean));
  };

  const row = (s) => {
    const err = h("div", { class: "set-err", role: "alert" });
    const v = prefs.get(s.key);
    const commit = (val) => {
      const r = prefs.set(s.key, val);
      err.textContent = r.ok ? "" : r.error;
      input.classList.toggle("bad", !r.ok);
      dflt.hidden = prefs.get(s.key) === s.default;
    };
    let input, after = null;
    if (s.type === "bool") {
      input = h("input", { type: "checkbox", checked: !!v });
      input.addEventListener("change", () => commit(input.checked));
    } else if (s.type === "enum") {
      input = h("select", { class: "inp" }, ...s.options.map((o) => h("option", { value: String(o.value), selected: o.value === v ? true : undefined }, o.label)));
      input.addEventListener("change", () => commit(input.value));
    } else if (s.type === "materialkey") {
      const list = materialList().filter((m) => m.source !== "project");
      const known = list.some((m) => m.key === v);
      input = h("select", { class: "inp" }, ...(known ? [] : [h("option", { value: v, selected: true }, v + " (fehlt)")]),
        ...list.map((m) => h("option", { value: m.key, selected: m.key === v ? true : undefined }, m.label + (m.source === "user" ? " (eigen)" : ""))));
      input.addEventListener("change", () => commit(input.value));
    } else if (s.type === "folder") {
      input = h("input", { class: "inp set-folder", value: v, spellcheck: "false", placeholder: "zuletzt benutzter Ordner" });
      input.addEventListener("change", () => commit(input.value));
      if (window.werkcad?.pickFolder) after = h("button", { class: "btn", onclick: async () => { const d = await window.werkcad.pickFolder({ dir: prefs.get(s.key) || undefined }); if (d) { input.value = d; commit(d); } } }, "Wählen…");
    } else if (s.type === "name") {
      input = h("input", { class: "inp", value: v, spellcheck: "false", placeholder: s.allowEmpty ? "leer = keine" : "" });
      input.addEventListener("change", () => commit(input.value));
    } else if (s.type === "color") {
      input = h("input", { type: "color", class: "inp set-color", value: v });
      input.addEventListener("input", () => commit(input.value));
    } else {
      input = h("input", { class: "inp num", value: String(v).replace(".", ","), inputmode: "decimal", spellcheck: "false" });
      input.addEventListener("change", () => commit(input.value));
    }
    const dflt = h("button", { class: "set-default", title: "Auf Standardwert zurücksetzen", hidden: v === s.default, onclick: () => { prefs.reset([s.key]); render(); } }, "Standard");
    return h("div", { class: "set-row", "data-key": s.key },
      h("label", {}, s.label, s.unit && s.type !== "enum" ? h("span", { class: "hint" }, ` (${s.unit})`) : null),
      h("div", { class: "set-input" }, input, after, dflt),
      s.help ? h("div", { class: "hint set-help" }, s.help) : null,
      err);
  };

  const exportPrefs = () => app.files.saveText(prefs.exportText(), "PBCAD-Einstellungen.json", "application/json", [{ name: "PBCAD-Einstellungen", extensions: ["json"] }]);
  const importPrefs = async () => {
    const text = await pickText(app);
    if (text === null) return;
    const r = prefs.importText(text);
    if (r.corrupt) return toast("Import fehlgeschlagen: " + r.warnings[0], { kind: "err", timeout: 6000 });
    toast(r.warnings.length ? `Importiert mit ${r.warnings.length} Hinweis(en): ${r.warnings[0]}` : "Einstellungen importiert", { kind: r.warnings.length ? "" : "ok", timeout: 6000 });
    render();
  };

  render();
  const m = modal({
    title: "Einstellungen", width: "880px",
    body: h("div", { class: "set-center" }, h("div", { class: "set-search" }, search), h("div", { class: "set-main" }, nav, pane)),
    buttons: [
      { label: "Exportieren …", run: () => { exportPrefs(); return false; } },
      { label: "Importieren …", run: () => { importPrefs(); return false; } },
      { label: "Alles auf Standard", run: () => { prefs.reset(); render(); toast("Alle Einstellungen auf Standard gesetzt"); return false; } },
      { label: "Schließen", primary: true },
    ],
  });
  setTimeout(() => search.focus(), 30);
  return { ...m, select: (id) => { cat = id; render(); }, search: (q) => { search.value = q; query = q; render(); } };
}

/** Zusatzinhalte je Kategorie, die keine einfachen Optionen sind */
function extras(app, cat) {
  if (cat === "updates") return [updatesSection(app)];
  if (cat === "werkzeuge") {
    const memo = app.prefs.get("werkzeuge.letzte") || {};
    const forget = h("div", { class: "btn-row" }, h("button", { class: "btn", disabled: !Object.keys(memo).length, onclick: (e) => { app.prefs.reset(["werkzeuge.letzte"]); e.currentTarget.disabled = true; toast("Werkzeuge starten wieder mit den Standardwerten"); } }, "Letzte Werkzeugwerte vergessen"));
    return [forget, quickAccessEditor(app), ribbonEditor(app), keymapEditor(app)];
  }
  if (cat === "material") return [materialsEditor(app)];
  if (cat === "blech") return [bendTablesEditor(app)];
  if (cat === "dateien") {
    return [h("ul", { class: "hint" },
      h("li", {}, "Wiederherstellung: nach einem Absturz bietet der Startbildschirm die letzte automatische Sicherung an."),
      h("li", {}, "Beim Speichern bleiben die vorigen Fassungen als ».wcad.bak«, ».bak2« … neben der Datei (Anzahl oben)."),
      h("li", {}, "Schreibgeschützt öffnen (Datei-Menü): Ansehen und Ausprobieren, gespeichert wird nur unter neuem Namen. Gesperrte oder schreibgeschützte Dateien öffnen automatisch so."),
      h("li", {}, "Projekt paketieren (Datei-Menü): eine Kopie, in der verknüpfte Bauteile ganz enthalten sind – zum Weitergeben ohne die Bauteil-Dateien."),
      h("li", {}, "Ältere Projektdateien werden beim Öffnen migriert; vorher wird eine Sicherung angelegt."))];
  }
  if (cat === "datenschutz") {
    return window.werkcad?.openLogFolder ? [h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => window.werkcad.openLogFolder() }, "Protokollordner öffnen"))] : [];
  }
  return [];
}

/** Menüband anordnen: Karte wählen, Gruppen ein-/ausblenden und verschieben */
function ribbonEditor(app) {
  const prefs = app.prefs;
  const tabs = app.ribbon.catalog();
  const box = h("div", { class: "rb-editor" });
  let tabId = tabs.find((t) => t.id === "modell")?.id || tabs[0]?.id;
  const cfg = () => prefs.get("werkzeuge.menueband") || {};
  const set = (r) => {
    if (!r.ok) { toast(r.error, { kind: "err" }); return; }
    const s = prefs.set("werkzeuge.menueband", r.value);
    if (!s.ok) toast(s.error, { kind: "err" });
    render();
  };
  const render = () => {
    const t = tabs.find((x) => x.id === tabId);
    const c = cfg(), hide = new Set(c[tabId]?.hide || []);
    const order = t ? orderedLabels(tabId, t.labels, c) : [];
    const pick = h("select", { class: "inp", "aria-label": "Registerkarte", onchange: (e) => { tabId = e.target.value; render(); } },
      ...tabs.map((x) => h("option", { value: x.id, selected: x.id === tabId }, x.label)));
    box.replaceChildren(h("h3", {}, "Menüband anordnen"),
      h("div", { class: "btn-row" }, pick,
        h("button", { class: "btn", disabled: !c[tabId], onclick: () => set({ ok: true, value: resetRibbonLayout(cfg(), tabId) }) }, "Karte zurücksetzen"),
        h("button", { class: "btn", disabled: !Object.keys(c).length, onclick: () => set({ ok: true, value: resetRibbonLayout(cfg()) }) }, "Alles zurücksetzen")),
      h("ol", { class: "qa-list rb-list" }, ...order.map((label, i) => {
        const locked = (PROTECTED[tabId] || []).includes(label);
        return h("li", { "data-group": label },
          h("label", { class: "chk grow" }, h("input", { type: "checkbox", checked: !hide.has(label), disabled: locked, "aria-label": label + " sichtbar", onchange: (e) => set(setGroupHidden(cfg(), tabId, label, !e.target.checked, t.labels)) }), label, locked ? h("span", { class: "hint" }, " (immer sichtbar)") : null),
          h("button", { class: "icon-btn", title: "Nach links", disabled: i === 0, onclick: () => set(moveGroup(cfg(), tabId, label, -1, t.labels)) }, "↑"),
          h("button", { class: "icon-btn", title: "Nach rechts", disabled: i === order.length - 1, onclick: () => set(moveGroup(cfg(), tabId, label, +1, t.labels)) }, "↓"));
      })),
      h("p", { class: "hint" }, "Auch im Menüband: Rechtsklick auf eine Gruppe. Ausgeblendete Befehle bleiben über die Befehlssuche (Strg+K) erreichbar."));
  };
  render();
  return box;
}

function updatesSection(app) {
  const bridge = window.werkcad;
  if (!bridge?.getSettings) return h("p", {}, "Updates sind nur in der installierten Windows-Version verfügbar.");
  const box = h("div", {}, h("p", { class: "hint" }, "Lade …"));
  bridge.getSettings().then((s) => {
    const token = h("input", { class: "inp", type: "password", placeholder: s.hasToken ? "•••••••• (gespeichert)" : "github_pat_…", autocomplete: "off" });
    const auto = h("input", { type: "checkbox", checked: s.autoCheck !== false });
    const statusEl = h("div", { class: "hint" }, `Installierte Version: ${s.version}`);
    box.replaceChildren(
      h("p", { style: { marginTop: 0 } }, "Updates kommen aus den Releases auf GitHub. Vor dem Herunterladen und vor dem Installieren wirst du jedes Mal gefragt."),
      app.props.field("GitHub-Token", token),
      h("p", { class: "hint" }, "Nur nötig, wenn das Repository privat ist: GitHub → Settings → Developer settings → Fine-grained tokens, nur dieses Repository, »Contents: Read-only«. Wird verschlüsselt auf diesem PC gespeichert, getrennt von den übrigen Einstellungen."),
      h("label", { class: "chk" }, auto, "Beim Start nach Updates suchen (Installation erst nach Freigabe)"),
      statusEl,
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", onclick: async () => {
          await bridge.saveSettings({ token: token.value.trim() || undefined, autoCheck: auto.checked });
          token.value = "";
          statusEl.textContent = "Update-Einstellungen gespeichert";
        } }, "Update-Einstellungen speichern"),
        h("button", { class: "btn", onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          statusEl.textContent = "Suche…";
          try { statusEl.textContent = (await bridge.checkForUpdates()).message; } finally { btn.disabled = false; }
        } }, "Jetzt nach Updates suchen"),
        s.hasToken ? h("button", { class: "btn danger", onclick: async () => { await bridge.saveSettings({ token: "" }); statusEl.textContent = "Token entfernt"; } }, "Token entfernen") : null));
  });
  return box;
}

const dens = (v) => String(v).replace(".", ",");

/** Werkstofftabelle: eingebaute (fest), eigene (anlegen, bearbeiten, duplizieren, löschen), Import/Export */
function materialsEditor(app) {
  const prefs = app.prefs;
  const wrap = h("div", { class: "mat-editor" });
  const lib = () => [...(prefs.get("material.eigene") || [])];
  const save = (next) => { const r = prefs.set("material.eigene", next); if (!r.ok) toast(r.error, { kind: "err", timeout: 6000 }); render(); return r.ok; };
  const edit = (m, { isNew = false } = {}) => {
    const f = {
      label: h("input", { class: "inp", value: m.label || "", "aria-label": "Name" }),
      key: h("input", { class: "inp", value: m.key || "", "aria-label": "Kürzel", disabled: isNew ? undefined : true }),
      density: h("input", { class: "inp", value: m.density ? dens(m.density) : "", inputmode: "decimal", "aria-label": "Dichte" }),
      color: h("input", { type: "color", value: m.color || "#8d99a6", "aria-label": "Farbe" }),
      number: h("input", { class: "inp", value: m.number || "", "aria-label": "Werkstoffnummer" }),
    };
    const err = h("div", { class: "set-err", role: "alert" });
    const row = (label, el) => h("div", { class: "field wide" }, h("label", {}, label), el);
    modal({
      title: isNew ? "Werkstoff anlegen" : "Werkstoff bearbeiten", width: "420px",
      body: h("div", { class: "mat-form" }, row("Name", f.label), row("Kürzel", f.key), row("Dichte (g/cm³)", f.density), row("Farbe", f.color), row("Werkstoffnummer (optional)", f.number), err),
      buttons: [{ label: "Abbrechen" }, { label: "Übernehmen", primary: true, run: () => {
        const v = validateMaterial({ label: f.label.value, key: f.key.value, density: f.density.value, color: f.color.value, number: f.number.value });
        if (!v.ok) { err.textContent = v.error; return false; }
        const list = lib();
        const i = list.findIndex((x) => x.key === (isNew ? v.value.key : m.key));
        if (isNew && i >= 0) { err.textContent = `Kürzel »${v.value.key}« gibt es schon`; return false; }
        if (i >= 0) list[i] = v.value; else list.push(v.value);
        return save(list) ? true : false;
      } }],
    });
  };
  const freeKey = (base) => { const keys = new Set(materialList().map((m) => m.key)); let k = base.slice(0, 17) + "-2", n = 2; while (keys.has(k)) k = base.slice(0, 17) + "-" + ++n; return k; };
  const remove = async (m) => {
    if (usedMaterialKeys(app.project).has(m.key)) return toast(`»${m.label}« wird im offenen Projekt benutzt und kann nicht gelöscht werden.`, { kind: "err", timeout: 6000 });
    if (await confirmDialog("Werkstoff löschen", `»${m.label}« aus der Bibliothek löschen?`, { ok: "Löschen", danger: true })) save(lib().filter((x) => x.key !== m.key));
  };
  const exportLib = () => app.files.saveText(exportMaterialLib(lib()), "PBCAD-Werkstoffe.json", "application/json", [{ name: "PBCAD-Werkstoffe", extensions: ["json"] }]);
  const importLib = async () => {
    const text = await pickText(app, "PBCAD-Werkstoffe");
    if (text === null) return;
    const r = importMaterialLib(text, lib());
    if (!r.ok) return toast("Import fehlgeschlagen: " + r.error, { kind: "err", timeout: 6000 });
    if (save(r.value)) toast(`Werkstoffe importiert: ${r.added} neu, ${r.replaced} ersetzt`, { kind: "ok" });
  };
  const render = () => {
    const used = usedMaterialKeys(app.project);
    const btn = (label, run, attrs = {}) => h("button", { class: "btn", onclick: run, ...attrs }, label);
    const rows = materialList().map((m) => h("tr", { "data-key": m.key },
      h("td", {}, h("span", { class: "mat-swatch", style: { background: m.color } }), m.label, m.source === "project" ? h("span", { class: "hint" }, " (nur in dieser Projektdatei)") : null),
      h("td", {}, m.source === "builtin" ? m.key : h("b", {}, m.key)),
      h("td", { class: "num" }, dens(m.density)),
      h("td", { class: "mat-actions" },
        m.source === "user" ? [btn("Bearbeiten", () => edit(m)), btn("Duplizieren", () => edit({ ...m, key: freeKey(m.key), label: m.label + " (Kopie)" }, { isNew: true })),
          btn("Löschen", () => remove(m), used.has(m.key) ? { disabled: true, title: "Wird im offenen Projekt benutzt" } : {})]
          : m.source === "project" ? btn("In Bibliothek übernehmen", () => { const { source, ...c } = m; save([...lib(), c]); })
          : btn("Duplizieren", () => edit({ ...m, key: freeKey(m.key), label: m.label + " (eigen)" }, { isNew: true })))));
    wrap.replaceChildren(
      h("div", { class: "btn-row" }, btn("Werkstoff anlegen …", () => edit({}, { isNew: true })), btn("Importieren …", importLib), btn("Exportieren …", exportLib, lib().length ? {} : { disabled: true })),
      h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", {}, "Werkstoff"), h("th", {}, "Kürzel"), h("th", {}, "Dichte g/cm³"), h("th", {}, ""))),
        h("tbody", {}, ...rows)));
  };
  render();
  return wrap;
}

const nf = (v, d = 3) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ","));

/** Biegetabellen: je Werkstoff und Dicke ein Raster Winkel × Innenradius; Eingabe als Text (aus Excel einfügen) mit Vorschau */
function bendTablesEditor(app) {
  const prefs = app.prefs;
  const wrap = h("div", { class: "mat-editor bend-editor" });
  const lib = () => [...(prefs.get("blech.biegetabellen") || [])];
  const save = (next) => { const r = prefs.set("blech.biegetabellen", next); if (!r.ok) toast(r.error, { kind: "err", timeout: 6000 }); render(); return r.ok; };
  const label = (key) => materialList().find((m) => m.key === key)?.label || key;
  const edit = (tb, { isNew = false } = {}) => {
    const sel = (opts, v) => h("select", { class: "inp" }, ...opts.map((o) => h("option", { value: o.value, selected: o.value === v }, o.label)));
    const f = {
      material: sel(materialList().map((m) => ({ value: m.key, label: m.label })), tb.material || app.prefs.get("dokument.werkstoff") || "S235"),
      t: h("input", { class: "inp", value: nf(tb.t) || "2", inputmode: "decimal", "aria-label": "Blechdicke" }),
      mode: sel(MODES, tb.mode || "verkuerzung"),
      ref: sel(ANGLE_REFS, tb.ref || "biege"),
      fallbackK: h("input", { class: "inp", value: nf(tb.fallbackK ?? 0.33), inputmode: "decimal", "aria-label": "Ersatz-K-Faktor" }),
      note: h("input", { class: "inp", value: tb.note || "", placeholder: "z. B. Matrize V16, Oberwerkzeug R2", "aria-label": "Notiz" }),
      grid: h("textarea", { class: "inp bend-grid", rows: 8, spellcheck: false, "aria-label": "Tabelle" }, tb.radii ? tableToCsv(tb) : "Winkel\\Radius;1;2;3\r\n90;;;"),
    };
    const preview = h("div", { class: "bend-preview" });
    const err = h("div", { class: "set-err", role: "alert" });
    const collect = () => {
      const g = parseTableText(f.grid.value);
      if (!g.ok) return g;
      return validateBendTable({ material: f.material.value, t: f.t.value, mode: f.mode.value, ref: f.ref.value, fallbackK: f.fallbackK.value, note: f.note.value, radii: g.radii, angles: g.angles, values: g.values });
    };
    const show = () => {
      const r = collect();
      err.textContent = r.ok ? "" : r.error;
      if (!r.ok) return preview.replaceChildren();
      const v = r.value;
      preview.replaceChildren(h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", {}, v.ref === "oeffnung" ? "Öffnung ° \\ ri mm" : "Biegung ° \\ ri mm"), ...v.radii.map((x) => h("th", { class: "num" }, nf(x))))),
        h("tbody", {}, ...v.angles.map((a, i) => h("tr", {}, h("th", {}, nf(a)), ...v.values[i].map((x) => h("td", { class: "num" + (x === null ? " empty" : "") }, x === null ? "–" : nf(x))))))));
    };
    for (const el of Object.values(f)) el.addEventListener("input", show);
    const din = () => {
      const t = Number(String(f.t.value).replace(",", "."));
      if (!(t > 0)) return (err.textContent = "Erst die Blechdicke angeben");
      const radii = [0.5, 1, 1.5, 2, 3].map((q) => Math.round(q * t * 100) / 100), angles = [30, 45, 60, 90, 120, 135];
      f.mode.value = "k"; f.ref.value = "biege";
      f.grid.value = tableToCsv({ radii, angles, values: angles.map(() => radii.map((r) => Math.round(dinK(r, t) * 1000) / 1000)) });
      show();
    };
    const row = (lbl, el) => h("div", { class: "field wide" }, h("label", {}, lbl), el);
    modal({
      title: isNew ? "Biegetabelle anlegen" : "Biegetabelle bearbeiten", width: "620px",
      body: h("div", { class: "mat-form" }, row("Werkstoff", f.material), row("Blechdicke (mm)", f.t), row("Werte in den Zellen", f.mode), row("Winkelbezug", f.ref), row("Ersatz-K-Faktor", f.fallbackK), row("Notiz", f.note),
        h("p", { class: "hint" }, "Erste Zeile: leere Zelle, dann die Innenradien (mm). Darunter je Zeile ein Winkel und die Werte; leere Zelle = kein Wert. Trennzeichen Semikolon oder Tab – Zellen lassen sich direkt aus Excel einfügen. Verkürzung: Abwicklung = Summe der Außenmaße (bis zum Schnittpunkt der Außenflächen) + v, v ist also meist negativ."),
        f.grid, h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: din }, "Mit DIN 6935 vorbelegen (K-Faktoren)")), preview, err),
      buttons: [{ label: "Abbrechen" }, { label: "Übernehmen", primary: true, run: () => {
        const r = collect();
        if (!r.ok) { err.textContent = r.error; return false; }
        const list = lib();
        const i = isNew ? -1 : list.findIndex((x) => tableId(x) === tableId(tb));
        if (list.some((x, j) => j !== i && sameTable(x, r.value))) { err.textContent = `Für ${label(r.value.material)} ${nf(r.value.t)} mm gibt es schon eine Tabelle`; return false; }
        if (i >= 0) list[i] = r.value; else list.push(r.value);
        return save(list) ? true : false;
      } }],
    });
    show();
  };
  const remove = async (tb) => {
    if (await confirmDialog("Biegetabelle löschen", `Biegetabelle ${label(tb.material)} ${nf(tb.t)} mm löschen?`, { ok: "Löschen", danger: true })) save(lib().filter((x) => tableId(x) !== tableId(tb)));
  };
  const exportCsv = (tb) => app.files.saveText(tableToCsv(tb), `Biegetabelle_${tb.material}_${nf(tb.t)}mm.csv`, "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]);
  const importCsv = async () => {
    const text = await pickText(app, "Biegetabelle (CSV)", ["csv", "txt"]);
    if (text === null) return;
    const g = parseTableText(text);
    if (!g.ok) return toast("Import fehlgeschlagen: " + g.error, { kind: "err", timeout: 6000 });
    edit({ radii: g.radii, angles: g.angles, values: g.values }, { isNew: true });
  };
  const render = () => {
    const uses = bendTableUses(app.project).map(([material, t]) => ({ material, t }));
    const btn = (lbl, run, attrs = {}) => h("button", { class: "btn", onclick: run, ...attrs }, lbl);
    const list = lib();
    const rows = list.map((tb) => h("tr", {},
      h("td", {}, label(tb.material), tb.note ? h("span", { class: "hint" }, " · " + tb.note) : null),
      h("td", { class: "num" }, nf(tb.t)),
      h("td", {}, MODES.find((m) => m.value === tb.mode)?.label || tb.mode),
      h("td", { class: "num" }, `${tb.angles.length} × ${tb.radii.length}`),
      h("td", { class: "mat-actions" }, uses.some((u) => sameTable(u, tb)) ? h("span", { class: "hint" }, "benutzt ") : null,
        btn("Bearbeiten", () => edit(tb)), btn("Duplizieren", () => edit({ ...tb, t: tb.t + 1 }, { isNew: true })), btn("CSV", () => exportCsv(tb)), btn("Löschen", () => remove(tb)))));
    wrap.replaceChildren(
      h("div", { class: "btn-row" }, btn("Biegetabelle anlegen …", () => edit({}, { isNew: true })), btn("CSV importieren …", importCsv)),
      list.length ? h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", {}, "Werkstoff"), h("th", {}, "Dicke mm"), h("th", {}, "Werte"), h("th", {}, "Winkel × Radien"), h("th", {}, ""))),
        h("tbody", {}, ...rows))
        : h("p", { class: "hint" }, "Noch keine Biegetabelle. Ohne Tabelle rechnen Kantteil und Knickrahmen mit ihrem K-Faktor."));
  };
  render();
  return wrap;
}

async function pickText(app, filterName = "PBCAD-Einstellungen", exts = ["json"]) {
  const bridge = window.werkcad;
  if (bridge?.openFile) {
    const r = await bridge.openFile({ filters: [{ name: filterName, extensions: exts }] });
    return r ? (r.data ?? null) : null;
  }
  return new Promise((res) => {
    const inp = h("input", { type: "file", accept: exts.map((e) => "." + e).join(",") });
    inp.addEventListener("change", async () => res(inp.files[0] ? await inp.files[0].text() : null));
    inp.click();
  });
}

export { defaultSettings, settingDef };
