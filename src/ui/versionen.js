// Versionen mit Notiz (FU6): Version speichern, Liste, schreibgeschützt öffnen, wiederherstellen
import { h, modal, toast, confirmDialog } from "./dom.js";
import { versionChanges, versionLabel, storageVersions } from "../core/versionen.js";
import { loadProject, parseProject } from "../core/project.js";

/** Versionsspeicher: Desktop neben der Datei, Browser im localStorage je Projekt */
function store(app) {
  const b = window.werkcad;
  if (b?.listVersions) {
    const path = app.filePath;
    const ok = (r) => { if (r?.error) throw new Error(r.error); return r; };
    return {
      where: path,
      async list() { return (await b.listVersions(path)) || []; },
      async save(e) { return ok(await b.saveVersion({ path, ...e })); },
      async read(n) { return ok(await b.readVersion({ path, n })).text; },
    };
  }
  return { where: null, ...storageVersions(localStorage, `pbcad.versionen.${app.project.name}.${app.project.created || ""}`) };
}

const fmt = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); };

/** Notiz abfragen (mehrzeilig) → Text oder null */
function noteDialog(title, hint) {
  return new Promise((res) => {
    const ta = h("textarea", { class: "inp", rows: 3, placeholder: "z. B. Stand für Angebot, Pfosten auf 60×60 geändert" });
    modal({ title, width: "480px", body: h("div", { class: "version-note" }, h("p", { class: "hint" }, hint), h("div", { class: "field wide" }, h("label", {}, "Notiz"), ta)),
      onClose: (v) => res(v ?? null),
      buttons: [{ label: "Abbrechen", value: null }, { label: "Version speichern", primary: true, run: () => ta.value.trim() }] });
  });
}

/** Stand der jüngsten Version als Projekt (für die Änderungsliste) */
async function lastProject(s) {
  const [last] = await s.list();
  if (!last) return null;
  try { return parseProject(await s.read(last.n)); } catch { return null; }
}

/**
 * Aktuellen Stand als Version ablegen. Desktop: vorher speichern (die Version ist der gespeicherte Stand).
 * note = undefined fragt nach; Rückgabe: Eintrag oder null
 */
export async function saveVersion(app, note) {
  if (app.readOnly) { toast("Schreibgeschützt geöffnet – Versionen nur in der eigenen Datei."); return null; }
  if (window.werkcad?.listVersions && (!app.filePath || app.dirty)) {
    if (!(await app.files.save(false))) return null;
  }
  const s = store(app);
  if (note === undefined) {
    note = await noteDialog("Version speichern", s.where ? `Der gespeicherte Stand wird als neue Version abgelegt (Ordner »${s.where.split(/[\\/]/).pop().replace(/\.wcad$/i, "")}.versionen« neben der Datei).` : "Der aktuelle Stand wird als neue Version abgelegt (im Browser).");
    if (note === null) return null;
  }
  try {
    app.embedMaterials?.();
    const text = JSON.stringify(app.project, null, 1);
    const changes = versionChanges(await lastProject(s), app.project).text;
    const e = await s.save({ text, note, changes });
    toast(`${versionLabel(e.n)} gespeichert${note ? ": " + note : ""}`, { kind: "ok" });
    return e;
  } catch (err) {
    toast("Version nicht gespeichert: " + err.message, { kind: "err", timeout: 6000 });
    return null;
  }
}

/** Version schreibgeschützt öffnen: eigenes Fenster gibt es nicht – das Projekt wird ersetzt, »Speichern unter« bleibt möglich */
async function openVersion(app, s, v) {
  if (!(await app.files.confirmDiscard())) return false;
  const from = app.filePath;
  const { project } = loadProject(await s.read(v.n));
  app.setProject(project, null);
  app.readOnly = true;
  app.versionView = { n: v.n, from };
  app.updateTitle();
  toast(`${versionLabel(v.n)} vom ${fmt(v.time)} schreibgeschützt geöffnet. Ändern geht nur über »Speichern unter«.`,
    { timeout: 10000, action: from && window.werkcad ? { label: "Zurück zur Datei", run: () => app.files.open(from) } : null });
  return true;
}

/** Version wiederherstellen: aktueller Stand wird vorher selbst eine Version, dann ersetzt die alte Version das Modell */
async function restoreVersion(app, s, v) {
  if (!(await confirmDialog("Version wiederherstellen", `${versionLabel(v.n)} vom ${fmt(v.time)} ersetzt das Modell. Der jetzige Stand wird vorher als Version gesichert.`, { ok: "Wiederherstellen" }))) return false;
  const text = await s.read(v.n);
  const { project } = loadProject(text);
  if (!(await saveVersion(app, `Automatisch vor Wiederherstellen von ${versionLabel(v.n)}`))) return false;
  const path = app.filePath;
  app.setProject(project, path);
  app.dirty = true;
  app.updateTitle();
  toast(`${versionLabel(v.n)} wiederhergestellt${path ? " – »Speichern« übernimmt sie in die Datei" : ""}.`, { kind: "ok", timeout: 6000 });
  return true;
}

/** Liste der Versionen mit Notiz, Datum und Änderungen */
export async function versionsDialog(app) {
  if (window.werkcad?.listVersions && !app.filePath) return toast("Erst speichern – Versionen liegen neben der Projektdatei.");
  if (app.versionView) return toast(`Gerade ist ${versionLabel(app.versionView.n)} geöffnet. Erst die Projektdatei wieder öffnen.`);
  const s = store(app);
  let list;
  try { list = await s.list(); } catch (e) { return toast("Versionen nicht lesbar: " + e.message, { kind: "err" }); }
  let dlg;
  const act = (fn, v) => async () => { if (await fn(app, s, v)) dlg.close(); };
  const rows = list.map((v) => h("tr", {},
    h("td", {}, h("b", {}, versionLabel(v.n))),
    h("td", {}, fmt(v.time)),
    h("td", {}, v.note || h("span", { class: "hint" }, "–"), v.changes ? h("div", { class: "hint" }, v.changes) : null),
    h("td", { class: "btn-cell" },
      h("button", { class: "btn", title: "Schreibgeschützt öffnen", onclick: act(openVersion, v) }, "Öffnen"),
      h("button", { class: "btn", title: "Diesen Stand wiederherstellen", onclick: act(restoreVersion, v) }, "Wiederherstellen"))));
  dlg = modal({ title: "Versionen – " + app.project.name, width: "760px",
    body: h("div", { class: "versions-dialog" },
      list.length ? h("table", { class: "versions" }, h("thead", {}, h("tr", {}, h("th", {}, "Nr."), h("th", {}, "Datum"), h("th", {}, "Notiz und Änderungen"), h("th", {}))), h("tbody", {}, ...rows))
        : h("div", { class: "msg info" }, "Noch keine Version. »Version speichern« legt den aktuellen Stand mit Notiz ab.")),
    buttons: [{ label: "Version speichern…", run: async () => { if (await saveVersion(app)) setTimeout(() => versionsDialog(app), 0); } }, { label: "Schließen", primary: true }] });
}
