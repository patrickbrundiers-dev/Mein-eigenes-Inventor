// Einstellungscenter: Kategorien links, Suche oben, Optionen rechts. Gültige Änderungen wirken sofort.
import { slicerEditor, plasticRulesEditor } from "./datenwerkzeuge.js";
import { THEMES } from "../core/themes.js";
import { h, modal, toast, confirmDialog, promptDialog } from "./dom.js";
import { CATEGORIES, SETTINGS, searchSettings, settingDef, defaultSettings, profileSnapshot } from "../core/settings.js";
import { materialList, validateMaterial, exportMaterialLib, importMaterialLib, usedMaterialKeys } from "../core/materials.js";
import { keymapEditor, quickAccessEditor } from "./commands.js";
import { orderedLabels, setGroupHidden, moveGroup, resetRibbonLayout, PROTECTED } from "../core/ribbonlayout.js";
import { RULES as BEND_RULES } from "../core/bendtable.js";
import { DEFAULT_SHEET_RULES, RELIEFS, outdatedSheetRules } from "../core/blechregeln.js";
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
      ...(cat === "darstellung" && !query ? [themeCards(app, render)] : []),
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
    } else if (s.type === "text") {
      input = h("input", { class: "inp", value: v, spellcheck: "false" });
      input.addEventListener("change", () => commit(input.value));
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
  if (cat === "lizenz") return [licenseSection(app)];
  if (cat === "allgemein") return [profileEditor(app)];
  if (cat === "werkzeuge") {
    const memo = app.prefs.get("werkzeuge.letzte") || {};
    const forget = h("div", { class: "btn-row" }, h("button", { class: "btn", disabled: !Object.keys(memo).length, onclick: (e) => { app.prefs.reset(["werkzeuge.letzte"]); e.currentTarget.disabled = true; toast("Werkzeuge starten wieder mit den Standardwerten"); } }, "Letzte Werkzeugwerte vergessen"));
    return [forget, quickAccessEditor(app), ribbonEditor(app), keymapEditor(app)];
  }
  if (cat === "maus3d") return [spaceMouseSection(app)];
  if (cat === "material") return [materialsEditor(app), plasticRulesEditor(app)];
  if (cat === "blech") return [sheetRulesEditor(app), bendTablesEditor(app)];
  if (cat === "dateien") {
    return [h("ul", { class: "hint" },
      h("li", {}, "Wiederherstellung: nach einem Absturz bietet der Startbildschirm die letzte automatische Sicherung an."),
      h("li", {}, "Beim Speichern bleiben die vorigen Fassungen als ».wcad.bak«, ».bak2« … neben der Datei (Anzahl oben)."),
      h("li", {}, "Schreibgeschützt öffnen (Datei-Menü): Ansehen und Ausprobieren, gespeichert wird nur unter neuem Namen. Gesperrte oder schreibgeschützte Dateien öffnen automatisch so."),
      h("li", {}, "Projekt paketieren (Datei-Menü): eine Kopie, in der verknüpfte Bauteile ganz enthalten sind – zum Weitergeben ohne die Bauteil-Dateien."),
      h("li", {}, "Ältere Projektdateien werden beim Öffnen migriert; vorher wird eine Sicherung angelegt.")), slicerEditor(app)];
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

const deDate = (iso) => (typeof iso === "string" ? iso.slice(0, 10).split("-").reverse().join(".") : "");
/** Lizenzstand, Rechner-ID, Schlüssel eingeben (Prüfung im Hauptprozess, electron/lizenz.cjs) */
export function licenseSection(app) {
  const bridge = window.werkcad;
  if (!bridge?.licenseStatus) return h("p", {}, "Die Lizenz wird nur in der installierten Windows-Version geprüft.");
  const box = h("div", { class: "lizenz-box" }, h("p", { class: "hint" }, "Lade …"));
  const render = (s) => {
    const key = h("textarea", { class: "inp", rows: 4, spellcheck: false, placeholder: "PBCAD1.…", "aria-label": "Lizenzschlüssel", style: { width: "100%", fontFamily: "Consolas, monospace", fontSize: "12px" } });
    const msg = h("div", { class: "hint", role: "status" });
    const d = s.daten;
    const state = s.state === "lizenziert"
      ? h("p", {}, h("b", {}, `Lizenziert für ${d.name}${d.firma ? " (" + d.firma + ")" : ""}`), ` · Lizenz-Nr. ${d.nr}`,
        h("br"), d.bis ? `gültig bis ${deDate(d.bis)} (noch ${s.restTage} Tage)` : "unbefristet", d.rechner ? " · an diesen Rechner gebunden" : "")
      : s.state === "test" ? h("p", {}, h("b", {}, `Testversion: noch ${s.restTage} von ${s.testTage} Tagen.`), " Danach startet PBCAD nur mit Lizenzschlüssel.")
        : s.state === "entwicklung" ? h("p", {}, "Entwicklungsstart (nicht installiert): keine Lizenzprüfung.")
          : h("p", {}, h("b", {}, "Keine gültige Lizenz."));
    const activate = async (text) => {
      const r = await bridge.activateLicense(text);
      if (!r.ok) { msg.textContent = r.fehler; msg.style.color = "var(--danger, #b3261e)"; return; }
      toast(`Lizenz ${r.status.daten.nr} aktiviert`, { kind: "ok" });
      app.license = r.status;
      render(r.status);
    };
    box.replaceChildren(...[state,
      s.fehler ? h("p", { class: "hint" }, "Gespeicherter Schlüssel: " + s.fehler) : null,
      h("p", {}, "Rechner-ID: ", h("code", { style: { userSelect: "all", fontSize: "14px" } }, s.rechnerId || "unbekannt"), " ",
        h("button", { class: "btn", onclick: async () => { try { await navigator.clipboard.writeText(s.rechnerId); toast("Rechner-ID kopiert"); } catch { toast("Bitte markieren und Strg+C"); } } }, "Kopieren")),
      h("h3", {}, s.state === "lizenziert" ? "Andere Lizenz eingeben" : "Lizenzschlüssel eingeben"),
      key,
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", onclick: () => activate(key.value) }, "Aktivieren"),
        h("button", { class: "btn", onclick: async () => { const t = await bridge.readLicenseFile(); if (t !== null) { key.value = t.trim(); activate(t); } } }, "Lizenzdatei öffnen …"),
        s.state === "lizenziert" ? h("button", { class: "btn danger", onclick: async () => { app.license = await bridge.removeLicense(); render(app.license); toast("Lizenz von diesem Rechner entfernt"); } }, "Lizenz entfernen") : null),
      msg].filter(Boolean));
  };
  bridge.licenseStatus().then(render);
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

/** Blechregeln (Stufe 44): Tabelle zum direkten Bearbeiten; jede gültige Änderung wird sofort gespeichert */
function sheetRulesEditor(app) {
  const prefs = app.prefs;
  const wrap = h("div", { class: "mat-editor sheet-rules" });
  const lib = () => (prefs.get("blech.regeln") || []).map((r) => ({ ...r }));
  const save = (next) => { const r = prefs.set("blech.regeln", next); if (!r.ok) toast(r.error, { kind: "err", timeout: 6000 }); render(); return r.ok; };
  const newId = (list) => { let n = list.length + 1; while (list.some((r) => r.id === "r" + n)) n++; return "r" + n; };
  const num = (v) => Number(String(v).replace(",", "."));
  const render = () => {
    const list = lib();
    const cell = (r, i, key, kind = "num") => {
      const upd = (v) => { const next = lib(); next[i] = { ...next[i], [key]: kind === "num" ? num(v) : v }; save(next); };
      if (kind === "mat") return h("select", { class: "inp", onchange: (e) => upd(e.target.value) }, ...materialList().map((m) => h("option", { value: m.key, selected: m.key === r.material }, m.label)));
      if (kind === "rule") return h("select", { class: "inp", onchange: (e) => upd(e.target.value) }, ...BEND_RULES.map((x) => h("option", { value: x.value, selected: x.value === r.rule }, x.label)));
      if (kind === "angle") return h("select", { class: "inp", onchange: (e) => upd(e.target.value) }, ...[["biege", "Biegewinkel"], ["innen", "Eingeschlossen"]].map(([v, l]) => h("option", { value: v, selected: v === (r.angleDisplay || "biege") }, l)));
      if (kind === "opt") return h("input", { class: "inp num", value: r[key] == null ? "" : String(r[key]).replace(".", ","), placeholder: "–", onchange: (e) => { const v = e.target.value.trim(); const next = lib(); const o = { ...next[i] }; if (v === "") delete o[key]; else o[key] = num(v); next[i] = o; save(next); } });
      if (kind === "relief") return h("select", { class: "inp", onchange: (e) => upd(e.target.value) }, ...RELIEFS.map(([v, l]) => h("option", { value: v, selected: v === r.relief }, l)));
      return h("input", { class: "inp" + (kind === "num" ? " num" : ""), value: kind === "num" ? String(r[key]).replace(".", ",") : r[key], onchange: (e) => upd(e.target.value.trim()) });
    };
    const outdated = outdatedSheetRules(app.project?.docs || [], list);
    wrap.replaceChildren(
      h("h3", {}, "Blechregeln"),
      h("p", { class: "hint" }, "Freischnitt 0 = Breite t, Tiefe t/2. Spalt Umschlag und Spalt Ecke gelten für Umschläge und »Ecke schließen« ohne eigenen Wert. Winkel in DXF: Biegewinkel oder eingeschlossener Winkel (180° − Biegewinkel) in den Biegenotizen. Kantteile speichern eine Kopie der Regel; geänderte Regeln werden am Kantteil oder hier für das ganze Projekt übernommen."),
      h("table", { class: "grid" },
        h("thead", {}, h("tr", {}, ...["Name", "Werkstoff", "Dicke", "Innenradius", "Abwicklung", "K-Faktor", "Freischnitt", "Breite", "Tiefe", "Spalt Umschlag", "Spalt Ecke", "Winkel in DXF", ""].map((x) => h("th", {}, x)))),
        h("tbody", {}, ...list.map((r, i) => h("tr", {},
          h("td", {}, cell(r, i, "name", "text")), h("td", {}, cell(r, i, "material", "mat")), h("td", {}, cell(r, i, "t")), h("td", {}, cell(r, i, "ri")),
          h("td", {}, cell(r, i, "rule", "rule")), h("td", {}, cell(r, i, "k")), h("td", {}, cell(r, i, "relief", "relief")), h("td", {}, cell(r, i, "reliefW")), h("td", {}, cell(r, i, "reliefD")), h("td", {}, cell(r, i, "hemGap", "opt")), h("td", {}, cell(r, i, "gap", "opt")), h("td", {}, cell(r, i, "angleDisplay", "angle")),
          h("td", {}, h("button", { class: "btn", onclick: () => save(lib().filter((_, k) => k !== i)) }, "Löschen")))))),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: () => { const l = lib(); const last = l.at(-1) || DEFAULT_SHEET_RULES[0]; let n = 1; while (l.some((r) => r.name === `${last.name} (${n})`)) n++; save([...l, { ...last, id: newId(l), name: `${last.name} (${n})` }]); } }, "Regel anlegen"),
        h("button", { class: "btn", onclick: async () => { if (await confirmDialog("Blechregeln zurücksetzen", "Blechregeln auf die Vorgaben zurücksetzen? Eigene Regeln gehen verloren.", { ok: "Zurücksetzen", danger: true })) save(DEFAULT_SHEET_RULES.map((r) => ({ ...r }))); } }, "Vorgaben"),
        outdated.length ? h("button", { class: "btn primary", onclick: () => {
          app.edit("Blechregeln übernehmen", () => { for (const o of outdated) { const d = app.doc(o.doc), f = d?.features.find((x) => x.id === o.feature); if (!f) continue; f.sheetRule = { ...o.rule }; if (f.matFromRule !== false) d.material = o.rule.material; } });
          toast(`${outdated.length} Kantteil(e) aktualisiert`, { kind: "ok" }); render();
        } }, `Geänderte Regeln in ${outdated.length} Kantteil(e) übernehmen`) : null));
  };
  render();
  return wrap;
}

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

/** Einstellungsprofile (SolidCraft-Abgleich E6): speichern, anwenden, umbenennen, löschen, exportieren, importieren */
export function profileEditor(app) {
  const prefs = app.prefs, box = h("div", { class: "set-profiles" });
  const render = () => {
    const all = prefs.get("allgemein.profile") || {};
    const put = (next) => { const r = prefs.set("allgemein.profile", next); if (!r.ok) toast(r.error, { kind: "err" }); render(); };
    const name = h("input", { class: "inp", placeholder: "Name, z. B. Werkstatt" });
    const apply = (n) => {
      const keep = prefs.get("allgemein.profile");
      const r = prefs.importText(all[n]);
      if (r.corrupt) return toast("Profil beschädigt", { kind: "err" });
      prefs.set("allgemein.profile", keep);
      toast(`Profil »${n}« angewendet – die Einstellungen gelten sofort`, { kind: "ok" });
      render();
    };
    box.replaceChildren(h("h4", {}, "Einstellungsprofile"),
      h("p", { class: "hint" }, "Ein Profil merkt sich alle Einstellungen (außer den Profilen selbst). Anwenden ersetzt die aktuellen Einstellungen."),
      Object.keys(all).length ? h("table", { class: "grid set-profile-list" }, h("tbody", {}, ...Object.keys(all).map((n) => h("tr", {}, h("td", {}, n),
        h("td", {}, h("button", { class: "btn", onclick: () => apply(n) }, "Anwenden"),
          h("button", { class: "btn", onclick: () => put({ ...all, [n]: profileSnapshot(prefs.values) }) }, "Überschreiben"),
          h("button", { class: "btn", onclick: async () => { const v = await promptDialog("Profil umbenennen", "Neuer Name", n); if (v && v.trim() && v !== n) { const o = {}; for (const [k, t] of Object.entries(all)) o[k === n ? v.trim() : k] = t; put(o); } } }, "Umbenennen"),
          h("button", { class: "btn", onclick: () => app.files.saveText(all[n], `PBCAD-Profil ${n}.json`, "application/json", [{ name: "PBCAD-Einstellungen", extensions: ["json"] }]) }, "Exportieren"),
          h("button", { class: "btn danger", onclick: () => { const o = { ...all }; delete o[n]; put(o); } }, "Löschen")))))) : null,
      h("div", { class: "btn-row" }, name,
        h("button", { class: "btn", onclick: () => { const n = name.value.trim(); if (!n) return toast("Namen eingeben"); put({ ...all, [n]: profileSnapshot(prefs.values) }); } }, "Aktuelle Einstellungen speichern"),
        h("button", { class: "btn", onclick: async () => { const text = await pickText(app); if (text == null) return; const n = name.value.trim() || `Profil ${Object.keys(all).length + 1}`; put({ ...all, [n]: text }); } }, "Profil importieren …")));
  };
  render();
  return box;
}

/** Farbthemen als Bildkarten (SolidCraft-Abgleich Runde 2, G1): Kopfleiste, Panel, 3D-Hintergrund, Akzent */
export function themeCards(app, rerender) {
  const box = h("div", { class: "theme-cards-box" });
  const BUILTIN = [
    { id: "hell", name: "Hell", vars: { appbar: "#2b3340", "steel-0": "#ffffff", "stage-a": "#eef1f5", "stage-b": "#dfe5ec", dye: "#1f6fb5", ink: "#1b2430", "steel-3": "#cbd3dd" } },
    { id: "dunkel", name: "Dunkel", vars: { appbar: "#1c1e21", "steel-0": "#25272b", "stage-a": "#2f333a", "stage-b": "#23262b", dye: "#4aa3d8", ink: "#e0e2e5", "steel-3": "#484d55" } },
    { id: "system", name: "Wie Windows", vars: null },
  ];
  const card = (t) => {
    const v = t.vars;
    const pic = v ? h("div", { class: "theme-pic", style: { background: `linear-gradient(180deg, ${v["stage-a"]}, ${v["stage-b"]})` } },
      h("i", { class: "tp-bar", style: { background: v.appbar } }), h("i", { class: "tp-panel", style: { background: v["steel-0"], borderColor: v["steel-3"] } }, h("b", { style: { background: v.ink } }), h("b", { style: { background: v.ink, width: "60%" } })),
      h("i", { class: "tp-body", style: { borderColor: v.dye } }), h("i", { class: "tp-accent", style: { background: v.dye } }))
      : h("div", { class: "theme-pic theme-pic-system" }, h("i", { class: "half-l" }), h("i", { class: "half-r" }));
    return h("button", { class: "theme-card" + (app.prefs.get("darstellung.schema") === t.id ? " on" : ""), "data-theme-id": t.id, title: t.base ? `${t.name} (${t.base === "dark" ? "dunkel" : "hell"}) – nach SolidCraft` : t.name,
      onclick: () => { app.prefs.set("darstellung.schema", t.id); rerender ? rerender() : render(); } }, pic, h("span", {}, t.name));
  };
  const render = () => box.replaceChildren(h("h3", {}, "Farbthema"), h("p", { class: "hint" }, "Klick wählt das Thema für Menüband, Panels, Dialoge und 3D-Hintergrund. Die Themen ab Graphite übernehmen die Farbwerte von SolidCraft."),
    h("div", { class: "theme-cards" }, ...BUILTIN.map(card), ...THEMES.map(card)));
  render();
  return box;
}

/** 3D-Maus: Gerätezustand, Verbinden, Kalibrieren (SolidCraft: Einstellungen → 3D-Maus) */
function spaceMouseSection(app) {
  const sm = app.spaceMouse;
  const box = h("div", { class: "mat-editor" });
  const draw = () => {
    const st = sm?.status || "nicht-unterstuetzt";
    const cal = app.prefs.get("maus3d.kalibrierung");
    const text = { verbunden: `Verbunden: ${sm.name || "3D-Maus"}` + (cal ? " · kalibriert" : " · nicht kalibriert"), gesperrt: "Gefunden, aber nicht lesbar – ein anderes Programm (z. B. der 3Dconnexion-Treiber) belegt das Gerät exklusiv.", keine: "Keine 3D-Maus verbunden. Falls eine angeschlossen ist, bewegen Sie sie kurz und klicken auf »Verbinden«.", "nicht-unterstuetzt": "In dieser Umgebung ist kein Zugriff auf USB-Eingabegeräte möglich." }[st];
    box.replaceChildren(h("h4", {}, "Gerät"), h("p", { class: "hint" }, text), h("div", { class: "btn-row" },
      h("button", { class: "btn", disabled: !sm || st === "nicht-unterstuetzt", onclick: async () => { await sm.connect(); draw(); } }, st === "verbunden" ? "Anderes Gerät …" : "Verbinden …"),
      h("button", { class: "btn", disabled: st !== "verbunden", title: "Kappe loslassen und 2 Sekunden nicht berühren", onclick: async (e) => { e.currentTarget.textContent = "Nicht berühren …"; const ok = await sm.calibrate(); toast(ok ? "3D-Maus kalibriert" : "Kalibrieren fehlgeschlagen", { kind: ok ? "ok" : "err" }); draw(); } }, "Kalibrieren"),
      h("button", { class: "btn", disabled: !cal, onclick: () => { app.prefs.set("maus3d.kalibrierung", null); draw(); } }, "Kalibrierung verwerfen")));
  };
  draw();
  sm?.onChange(() => { if (box.isConnected) draw(); });
  return box;
}
