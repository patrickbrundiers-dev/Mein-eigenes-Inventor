// Einstellungscenter: Kategorien links, Suche oben, Optionen rechts. Gültige Änderungen wirken sofort.
import { h, modal, toast } from "./dom.js";
import { CATEGORIES, SETTINGS, searchSettings, settingDef, defaultSettings } from "../core/settings.js";
import { MATERIALS } from "../core/sections.js";

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
    const list = (query ? found.settings : SETTINGS).filter((s) => s.cat === cat);
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
    let input;
    if (s.type === "bool") {
      input = h("input", { type: "checkbox", checked: !!v });
      input.addEventListener("change", () => commit(input.checked));
    } else if (s.type === "enum") {
      input = h("select", { class: "inp" }, ...s.options.map((o) => h("option", { value: String(o.value), selected: o.value === v ? true : undefined }, o.label)));
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
      h("div", { class: "set-input" }, input, dflt),
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
  if (cat === "material") {
    return [h("table", { class: "grid" },
      h("thead", {}, h("tr", {}, h("th", {}, "Werkstoff"), h("th", {}, "Dichte g/cm³"))),
      h("tbody", {}, ...Object.values(MATERIALS).map((m) => h("tr", {}, h("td", {}, m.label), h("td", { class: "num" }, String(m.density).replace(".", ","))))))];
  }
  if (cat === "dateien") {
    return [h("ul", { class: "hint" },
      h("li", {}, "Wiederherstellung: nach einem Absturz bietet der Startbildschirm die letzte automatische Sicherung an."),
      h("li", {}, "Beim Speichern bleibt die vorige Fassung als ».wcad.bak« neben der Datei."),
      h("li", {}, "Ältere Projektdateien werden beim Öffnen migriert; vorher wird eine Sicherung angelegt."))];
  }
  if (cat === "datenschutz") {
    return window.werkcad?.openLogFolder ? [h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => window.werkcad.openLogFolder() }, "Protokollordner öffnen"))] : [];
  }
  return [];
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

async function pickText(app) {
  const bridge = window.werkcad;
  if (bridge?.openFile) {
    const r = await bridge.openFile({ filters: [{ name: "PBCAD-Einstellungen", extensions: ["json"] }] });
    return r ? (r.data ?? null) : null;
  }
  return new Promise((res) => {
    const inp = h("input", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", async () => res(inp.files[0] ? await inp.files[0].text() : null));
    inp.click();
  });
}

export { defaultSettings, settingDef };
