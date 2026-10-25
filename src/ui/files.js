// Öffnen, Speichern, Import/Export – über die Electron-Brücke oder im Browser per Download
import { toast, choiceDialog, downloadBlob, h, modal } from "./dom.js";
import { sketchToDxf, DxfWriter } from "../core/dxf.js";
import { planKantteil, kantteilFlatDxf, splitList } from "../core/blech.js";
import { bendRule } from "../core/bendtable.js";
import { evaluate } from "../core/expr.js";
import { newPart, uid } from "../core/examples.js";
import { serializeProject, loadProject, validateProject, parseProject } from "../core/project.js";
import { linkCandidates, findLinkedDoc, applyLinked, partProject, makeLink, baseName, packProject } from "../core/links.js";
import { bomRows, collectCutSources } from "./props.js";
import { cutListRows, cutListCsv } from "../core/cutlist.js";
import { collectWelds, weldRows, weldCsv } from "../core/weld.js";
import { collectNorm } from "../core/normteile.js";
import { flattenAssembly, structureBom, modularBom } from "../core/subasm.js";
import { decomposePlacement } from "../core/geom.js";
import { buildXlsx, zipFiles } from "../core/xlsx.js";
import { mappeHtml, listPages, mappeName } from "../core/mappe.js";
import { checkBeforeMappe, openPointsPage } from "./pruefung.js";
import { releaseText } from "../core/pruefung.js";
import { angebotPage } from "../core/angebot.js";
import { bendListCsv } from "../core/biegerohr.js";
import { bodiesMass } from "../core/mass.js";
import { materialOf } from "../core/materials.js";
import { finishLabel } from "../core/oberflaeche.js";
import { listSheets } from "../core/lists.js";
import { fmtNum } from "./dom.js";

const PROJECT_FILTERS = [{ name: "PBCAD-Projekt", extensions: ["wcad"] }];
const AUTOSAVE_KEY = "werkcad.autosave";

export class Files {
  constructor(app) { this.app = app; }
  get bridge() { return window.werkcad || null; }

  // ---------- Projekt ----------
  serialize() { this.app.embedMaterials(); return serializeProject(this.app.project); }
  /** Datei lesen, prüfen, ggf. migrieren; Hinweise (keine Fehler) kommen in `issues` */
  parse(text) { return loadProject(text); }
  async confirmDiscard() {
    if (!this.app.dirty) return true;
    const r = await choiceDialog("Ungespeicherte Änderungen", "Das aktuelle Projekt enthält ungespeicherte Änderungen.", [
      { label: "Abbrechen", value: null }, { label: "Verwerfen", value: "discard" }, { label: "Speichern", value: "save", primary: true }]);
    if (r === "save") return await this.save(false);
    return r === "discard";
  }
  async open(path, { readOnly = false } = {}) {
    if (!(await this.confirmDiscard())) return;
    try {
      let loaded, file, locked = false;
      if (this.bridge) {
        const r = path ? await this.bridge.readProject(path) : await this.bridge.openProject({ dir: this.app.prefs.get("allgemein.ordner") || undefined });
        if (!r) return;
        file = r.path;
        locked = !!r.readOnly;
        try {
          if (r.error) throw new Error(r.error);
          loaded = this.parse(r.text);
        } catch (e) { return await this.offerBackup(r, e.message); }
      } else {
        const f = await pickFile(".wcad,application/json");
        if (!f) return;
        loaded = this.parse(await f.text()); file = null;
        this.browserName = f.name;
      }
      const { project: prj, issues } = loaded;
      this.app.setProject(prj, file);
      if (file && (readOnly || locked)) {
        this.app.readOnly = true;
        this.app.updateTitle();
        toast(`${file.split(/[\\/]/).pop()} ist schreibgeschützt geöffnet${locked && !readOnly ? " (Datei ist gesperrt oder schreibgeschützt)" : ""}. Änderungen gehen nur über »Speichern unter«.`, { timeout: 7000 });
      } else toast("Geöffnet: " + (file ? file.split(/[\\/]/).pop() : prj.name), { kind: "ok", timeout: 2000 });
      showIssues(issues, "Beim Öffnen");
    } catch (e) {
      toast("Öffnen fehlgeschlagen: " + e.message, { kind: "err", timeout: 6000 });
    }
  }
  /** Datei unlesbar: Sicherung (.bak vom letzten Speichern) anbieten, falls vorhanden */
  async offerBackup(r, problem) {
    const name = r.path.split(/[\\/]/).pop();
    if (!r.backup || !this.bridge.readProjectBackup) throw new Error(problem);
    const when = new Date(r.backup.time).toLocaleString("de-DE");
    const choice = await choiceDialog("Projekt lässt sich nicht öffnen", `${name}: ${problem.replace(/\.$/, "")}. Es gibt eine Sicherung vom ${when} (Stand vor dem letzten Speichern). Sicherung öffnen?`, [
      { label: "Abbrechen", value: null }, { label: "Sicherung öffnen", value: "bak", primary: true }]);
    if (choice !== "bak") return;
    const b = await this.bridge.readProjectBackup(r.path);
    if (!b || b.error) throw new Error("Sicherung nicht lesbar" + (b?.error ? ": " + b.error : ""));
    const { project: prj, issues } = this.parse(b.text);
    // ohne Dateipfad öffnen: »Speichern« fragt nach einem Namen, damit weder Datei noch Sicherung überschrieben werden
    this.app.setProject(prj, null);
    this.app.dirty = true;
    this.app.updateTitle();
    toast(`Sicherung von ${name} geöffnet – bitte unter neuem Namen speichern.`, { kind: "ok", timeout: 8000 });
    showIssues(issues, "Beim Öffnen");
  }
  async save(saveAs = false) {
    const app = this.app;
    if (app.readOnly && !saveAs) { toast("Schreibgeschützt geöffnet – bitte unter neuem Namen speichern."); saveAs = true; }
    // Speichern nie blockieren (kein Datenverlust), aber auf Strukturfehler hinweisen
    showIssues(validateProject(app.project), "Beim Speichern");
    const text = this.serialize();
    const defaultName = safeName(app.project.name) + ".wcad";
    try {
      if (this.bridge) {
        const r = await this.bridge.saveProject({ path: saveAs ? null : app.filePath, text, defaultName, backups: app.prefs.get("dateien.sicherungen"), dir: app.prefs.get("allgemein.ordner") || undefined });
        if (!r) return false;
        app.filePath = r.path;
        app.readOnly = false;
        this.storePreview();
      } else {
        downloadBlob(new Blob([text], { type: "application/json" }), this.browserName || defaultName);
      }
      app.dirty = false;
      app.updateTitle();
      app.ribbon.render();
      toast("Gespeichert", { kind: "ok", timeout: 1500 });
      return true;
    } catch (e) {
      toast("Speichern fehlgeschlagen: " + e.message, { kind: "err", timeout: 6000 });
      return false;
    }
  }
  /** Vorschaubild der aktuellen 3D-Ansicht für die Startseite ablegen (nur Desktop, nur Bauteil/Baugruppe) */
  storePreview() {
    const app = this.app;
    if (!this.bridge?.writePreview || !app.filePath || !["part", "assembly"].includes(app.mode)) return;
    let url = null;
    try { url = app.viewer.thumbnail(); } catch { /* WebGL nicht bereit */ }
    if (url) this.bridge.writePreview(app.filePath, url).catch(() => { /* nur Komfort */ });
  }
  /** Projekt paketieren: eine Datei mit allen verknüpften Bauteilen als eigenem Inhalt, zum Weitergeben */
  async packageProject() {
    const app = this.app;
    app.embedMaterials();
    const { project, packed } = packProject(app.project);
    const r = await this.saveText(serializeProject(project), safeName(app.project.name) + " (Paket).wcad", "application/json", PROJECT_FILTERS);
    if (r && packed.length) toast(`${packed.length} verknüpfte(s) Bauteil(e) eingebettet (Stand der letzten Aktualisierung): ${packed.join(", ")}`, { timeout: 7000 });
    return r ? { ...r, packed } : null;
  }
  autosave() {
    clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      try {
        const entry = { time: Date.now(), path: this.app.filePath, json: JSON.stringify(this.app.project) };
        // Desktop: Datei im Benutzerordner, ohne Größengrenze; Browser: localStorage (bis ca. 5 MB)
        if (this.bridge?.writeAutosave) this.bridge.writeAutosave(entry).catch((e) => console.warn("Autosave fehlgeschlagen", e));
        else if (entry.json.length < 4.5e6) localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(entry));
      } catch { /* Speicher voll oder gesperrt */ }
    }, (this.app.prefs?.get("allgemein.autosaveSekunden") ?? 1.5) * 1000);
  }
  /** Letzte automatische Sicherung; nur wenn sie sich gefahrlos öffnen lässt */
  async recovery() {
    const read = (r) => {
      if (!r?.json) return null;
      try { return { time: r.time, path: r.path, project: loadProject(r.json).project }; } catch { return null; }
    };
    let fromFile = null;
    try { fromFile = read(await this.bridge?.readAutosave?.()); } catch { /* */ }
    // Sicherung aus älteren Versionen (localStorage) weiter anbieten
    let fromStorage = null;
    try { fromStorage = read(JSON.parse(localStorage.getItem(AUTOSAVE_KEY))); } catch { /* */ }
    return [fromFile, fromStorage].filter(Boolean).sort((a, b) => b.time - a.time)[0] || null;
  }

  // ---------- Verknüpfte Bauteile (M24) ----------
  /** Datei einer Verknüpfung lesen → Text; wirft mit Grund (Desktop-App nötig) */
  async readLinkedFile(path) {
    if (!this.bridge?.readLinked) throw new Error("Verknüpfte Dateien lassen sich nur in der Desktop-App lesen");
    const r = await this.bridge.readLinked(path);
    if (!r || r.error) throw new Error(r?.error || "nicht lesbar");
    return r.text;
  }
  /** .wcad-Datei wählen → { path, text } oder null */
  async pickProjectFile() {
    if (this.bridge) {
      const r = await this.bridge.openFile({ filters: PROJECT_FILTERS });
      return r ? { path: r.path, text: r.data } : null;
    }
    const f = await pickFile(".wcad,application/json");
    return f ? { path: f.name, text: await f.text() } : null;
  }
  /** Bauteil-Datei schreiben (Speichern-Dialog) → Pfad oder null */
  async writeProjectFile(name, text) {
    if (this.bridge) { const r = await this.bridge.saveFile({ defaultName: name, filters: PROJECT_FILTERS, data: text }); return r?.path || null; }
    downloadBlob(new Blob([text], { type: "application/json" }), name);
    return name;
  }
  /** Assembly: Bauteil aus einer anderen .wcad-Datei verknüpft einfügen */
  async linkPartFromFile() {
    const app = this.app, asm = app.activeDoc();
    if (asm?.kind !== "assembly") return toast("Erst eine Baugruppe öffnen");
    const f = await this.pickProjectFile();
    if (!f) return;
    let remotePrj;
    try { remotePrj = parseProject(f.text); } catch (e) { return toast("Datei nicht lesbar: " + e.message, { kind: "err" }); }
    const parts = remotePrj.docs.filter((d) => d.kind === "part");
    if (!parts.length) return toast(`${baseName(f.path)} enthält kein Bauteil`);
    let remote = parts[0];
    if (parts.length > 1) {
      remote = await new Promise((res) => {
        const sel = h("select", { class: "inp" }, ...parts.map((p, i) => h("option", { value: i }, (p.number ? p.number + " – " : "") + p.name)));
        modal({ title: "Bauteil wählen", width: "460px", body: h("div", {}, h("p", {}, `${baseName(f.path)} enthält ${parts.length} Bauteile.`), sel),
          buttons: [{ label: "Abbrechen", value: null }, { label: "Verknüpfen", primary: true, run: () => parts[Number(sel.value)] }], onClose: (v) => res(v || null) });
      });
      if (!remote) return;
    }
    const existing = app.project.docs.find((d) => d.kind === "part" && d.link && d.link.docId === remote.id && d.link.path === f.path);
    app.edit("Bauteil verknüpfen", () => {
      let doc = existing;
      if (!doc) {
        doc = applyLinked(app.project, { id: uid("p"), link: makeLink(f.path, remote, app.filePath) }, remotePrj, remote).doc;
        app.project.docs.push(doc);
      }
      const n = asm.components.filter((c) => c.part === doc.id).length;
      asm.components.push({ id: uid("c"), part: doc.id, name: `${doc.name}:${n + 1}`, pos: [0, 0, 0], rot: [0, 0, 0], fixed: asm.components.length === 0 });
    }, { link: true });
    app.syncMaterials?.();
    toast(`${remote.name} aus ${baseName(f.path)} verknüpft`, { kind: "ok" });
  }
  /** Bauteil als eigene Datei speichern und im Projekt damit verknüpfen */
  async savePartAsFile(part) {
    const app = this.app;
    if (part.link) return toast(`${part.name} liegt schon in ${baseName(part.link.path)}`);
    this.app.embedMaterials();
    const text = serializeProject(partProject(app.project, part));
    const path = await this.writeProjectFile(safeName(part.number || part.name) + ".wcad", text);
    if (!path) return;
    app.edit("Als eigene Datei", () => { part.link = makeLink(path, part, app.filePath); }, { link: true, rebuild: false });
    toast(`${part.name} gespeichert als ${baseName(path)} – im Projekt jetzt verknüpft`, { kind: "ok" });
  }
  /**
   * Verknüpfte Bauteile aus ihren Dateien neu laden. Fehlende Dateien: letzte Kopie bleibt, Hinweis.
   * interactive = false beim Öffnen (kein Rückgängig-Punkt). Rückgabe { updated, same, missing: [Text] }
   */
  async refreshLinks({ interactive = true } = {}) {
    const app = this.app, prj = app.project;
    const linked = prj.docs.filter((d) => d.kind === "part" && d.link);
    const res = { updated: [], same: 0, missing: [] };
    if (!linked.length) { if (interactive) toast("Keine verknüpften Bauteile im Projekt"); return res; }
    const loaded = [];
    for (const d of linked) {
      let text = null, why = "";
      for (const p of linkCandidates(d.link, app.filePath)) {
        try { text = await this.readLinkedFile(p); break; } catch (e) { why = e.message; }
      }
      if (text == null) { res.missing.push(`${d.name}: ${baseName(d.link.path)} – ${why}`); continue; }
      try {
        const rp = parseProject(text), remote = findLinkedDoc(rp, d.link);
        if (!remote) { res.missing.push(`${d.name}: Bauteil in ${baseName(d.link.path)} nicht mehr gefunden`); continue; }
        loaded.push({ d, rp, remote });
      } catch (e) { res.missing.push(`${d.name}: ${e.message}`); }
    }
    const apply = () => {
      for (const { d, rp, remote } of loaded) {
        const { doc, changed } = applyLinked(prj, d, rp, remote);
        if (!changed) { res.same++; continue; }
        for (const k of Object.keys(d)) delete d[k];
        Object.assign(d, doc);
        app.results.delete(d.id);
        res.updated.push(d.name);
      }
    };
    if (interactive) app.edit("Verknüpfungen aktualisieren", apply, { link: true });
    else { apply(); if (res.updated.length) { app.dirty = true; app.updateTitle(); app.syncMaterials?.(); app.rebuild(); app.tree.render(); } }
    if (res.updated.length || interactive) toast(res.updated.length ? `Aktualisiert: ${res.updated.join(", ")}` : `Verknüpfte Bauteile sind aktuell (${res.same})`, { kind: "ok", timeout: 4000 });
    if (res.missing.length) toast("Nicht aktualisiert – letzte Kopie wird verwendet: " + res.missing.join("; "), { timeout: 10000 });
    return res;
  }

  // ---------- Hilfen ----------
  async saveText(text, name, mime = "text/plain", filters) {
    if (this.bridge) {
      const r = await this.bridge.saveFile({ defaultName: name, filters, data: text });
      if (r) toast("Gespeichert: " + r.path.split(/[\\/]/).pop(), { kind: "ok" });
      return r;
    }
    downloadBlob(new Blob([text], { type: mime }), name);
    return { path: name };
  }
  async saveBinary(buf, name, filters) {
    if (this.bridge) {
      const r = await this.bridge.saveFile({ defaultName: name, filters, data: buf, binary: true });
      if (r) toast("Gespeichert: " + r.path.split(/[\\/]/).pop(), { kind: "ok" });
      return r;
    }
    downloadBlob(new Blob([buf]), name);
    return { path: name };
  }
  exportItems(d = this.app.activeDoc()) {
    const app = this.app;
    if (!d) return null;
    if (d.kind === "part") return [{ part: d, name: d.name }];
    // alle Komponenten, auch ausgeblendete – passend zu Stück- und Zuschnittliste
    if (d.kind === "assembly") return flattenAssembly(d, (id) => app.doc(id), { includeHidden: true }).map((o) => ({ part: o.part, ...decomposePlacement(o.matrix), name: o.path.join(" / ") }));
    return null;
  }
  async withBusy(label, fn) {
    const t = toast(label + " …", { timeout: 0 });
    try { return await fn(); } catch (e) { toast(label + " fehlgeschlagen: " + e.message, { kind: "err", timeout: 6000 }); } finally { t.remove(); }
  }

  // ---------- Export ----------
  async exportStep() {
    const items = this.exportItems();
    if (!items?.length) return toast("Nichts zu exportieren");
    const d = this.app.activeDoc();
    await this.withBusy("STEP-Export", async () => {
      const text = await this.app.kernel.call("exportStep", { items });
      await this.saveText(text, safeName(d.number || d.name) + ".step", "model/step", [{ name: "STEP", extensions: ["step", "stp"] }]);
    });
  }
  async exportStl() {
    const items = this.exportItems();
    if (!items?.length) return toast("Nichts zu exportieren");
    const d = this.app.activeDoc();
    await this.withBusy("STL-Export", async () => {
      const buf = await this.app.kernel.call("exportStl", { items });
      await this.saveBinary(buf, safeName(d.number || d.name) + ".stl", [{ name: "STL", extensions: ["stl"] }]);
    });
  }
  /** Jedes Profil/Rohr als eigene STEP-Datei – direkt für die Rohrlaser-Software */
  async exportMembers() {
    const app = this.app;
    const d = app.activeDoc();
    const parts = d.kind === "part" ? [d] : [...new Set(flattenAssembly(d, (id) => app.doc(id), { includeHidden: true }).map((o) => o.part))];
    await this.withBusy("Profil-Export", async () => {
      const files = [];
      for (const p of parts) {
        const list = await app.kernel.call("bodySteps", { part: p, onlyMembers: true });
        list.forEach((x) => files.push({ name: `${safeName(x.name).replace(/\s+/g, "_")}.step`, data: x.text }));
      }
      if (!files.length) return toast("Keine Profile (Rohr / Rahmen) vorhanden");
      if (this.bridge) {
        const r = await this.bridge.saveFiles({ files });
        if (r) toast(`${files.length} STEP-Dateien gespeichert in ${r.dir}`, { kind: "ok", timeout: 5000 });
      } else for (const f of files) downloadBlob(new Blob([f.data], { type: "model/step" }), f.name);
    });
  }
  /**
   * STEP-Datei (alle Körper, jeder mit Profil-ID benannt; Baugruppe als Satz) und daneben die
   * Zuschnittliste als CSV mit gleichem Namen. Passt direkt zum STEP-Import der Rohrlaser-Kalkulation.
   */
  async exportStepWithList() {
    const app = this.app;
    const d = app.activeDoc();
    const items = this.exportItems();
    if (!items?.length) return toast("Nichts zu exportieren");
    const name = safeName(d.number || d.name) + ".step";
    await this.withBusy("STEP-Export", async () => {
      const step = await app.kernel.call("exportStep", { items });
      const rows = cutListRows(collectCutSources(app, d));
      const csvText = rows.length ? cutListCsv(rows) : null;
      if (this.bridge) {
        const r = await this.bridge.saveFile({ defaultName: name, filters: [{ name: "STEP", extensions: ["step", "stp"] }], data: step, siblings: csvText ? [{ suffix: "_Zuschnitt.csv", data: csvText }] : [] });
        if (r?.siblingErrors?.length) toast("STEP gespeichert, Zuschnittliste nicht: " + r.siblingErrors.join("; ") + " (Datei evtl. in Excel geöffnet?)", { kind: "err", timeout: 8000 });
        else if (r) toast("Gespeichert: " + r.path.split(/[\\/]/).pop() + (csvText ? " + Zuschnittliste" : ""), { kind: "ok" });
      } else {
        downloadBlob(new Blob([step], { type: "model/step" }), name);
        if (csvText) downloadBlob(new Blob([csvText], { type: "text/csv" }), name.replace(/\.step$/, "_Zuschnitt.csv"));
      }
    });
  }
  async exportCutList() {
    const app = this.app;
    const d = app.activeDoc();
    const rows = cutListRows(collectCutSources(app, d));
    if (!rows.length) return toast("Keine Profile (Rohr / Rahmen) vorhanden");
    await this.saveText(cutListCsv(rows), safeName(d.number || d.name) + "_Zuschnitt.csv", "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]);
  }
  /** Nahtliste (Schweißnähte aus Bauteil bzw. allen Bauteilen der Baugruppe × Anzahl) */
  async exportWeldList() {
    const d = this.app.activeDoc();
    const rows = weldRows(collectWelds(collectCutSources(this.app, d)));
    if (!rows.length) return toast("Keine Schweißnähte vorhanden – Naht an Kanten setzen oder an Platte/Rippe ein a-Maß eintragen");
    await this.saveText(weldCsv(rows, d.name), safeName(d.number || d.name) + "_Nahtliste.csv", "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]);
  }
  /** Alle Listen als Excel-Arbeitsmappe: Stückliste (Baugruppe), Zuschnitt, Summen je Profil, Nahtliste */
  /** Abwicklung eines Kantteils als DXF (Kontur, Biegelinien mit Winkel) */
  async exportKantteilDxf(f) {
    const app = this.app, part = app.activeDoc();
    const sh = app.results.get(part?.id)?.bodies?.find((b) => b.fid === f.id)?.meta?.sheet;
    if (!sh) return toast("Kantteil hat Fehler – erst korrigieren", { kind: "err" });
    let plan;
    try {
      const sc = app.props.scope();
      const E = (x) => evaluate(String(x), sc);
      const t = E(f.t), ri = E(f.ri), k = E(f.k);
      const br = bendRule({ rule: f.rule || "k", material: part.material || "S235", t, ri, k });
      plan = planKantteil({ legs: splitList(f.legs).map(E), angles: splitList(f.angles).map(E), t, ri, k, kOf: br.kOf, ref: f.ref || "aussen" });
    } catch (e) { return toast("Kantteil: " + e.message, { kind: "err" }); }
    const name = `${safeName(part.number || part.name)}_${safeName(f.name || "Kantteil")}_${String(sh.t).replace(".", ",")}mm.dxf`.replace(/\s+/g, "_");
    await this.saveText(kantteilFlatDxf(DxfWriter, plan, sh.length, { name: f.name || part.name, t: sh.t }), name, "application/dxf", [{ name: "DXF", extensions: ["dxf"] }]);
    toast(`Abwicklung ${fmtNum(plan.flat, 1)} × ${fmtNum(sh.length, 1)} mm gespeichert`, { kind: "ok" });
  }
  /** Bild der 3D-Ansicht als PNG (doppelte Auflösung, weißer Hintergrund) */
  /** Bild der Ansicht; photo: fotorealistisch (vorübergehend Fotodarstellung) in vierfacher Auflösung */
  async exportPng({ photo = false } = {}) {
    const d = this.app.activeDoc();
    const v = this.app.viewer;
    const prev = v.displayMode;
    if (photo && prev !== "foto") v.setDisplayMode("foto");
    let img;
    try { img = v.snapshotPng({ scale: photo ? 4 : 2 }); } finally { if (photo && prev !== "foto") v.setDisplayMode(prev); }
    await this.saveBinary(img.data, safeName(d?.number || d?.name || "Ansicht") + (photo ? "_Render" : "") + ".png", [{ name: "PNG-Bild", extensions: ["png"] }]);
    toast(`Bild ${img.width} × ${img.height} px gespeichert`, { kind: "ok" });
  }
  async exportListsXlsx() {
    const d = this.app.activeDoc();
    const sheets = this.listSheetsFor(d);
    if (!sheets.length) return toast("Keine Listen vorhanden – keine Profile, Nähte oder Bauteile");
    const data = buildXlsx(sheets);
    await this.saveBinary(data, safeName(d.number || d.name) + "_Listen.xlsx", [{ name: "Excel-Arbeitsmappe", extensions: ["xlsx"] }]);
    toast(`Excel: ${sheets.map((s) => s.name).join(", ")}`, { kind: "ok" });
  }
  /** Tabellenblätter der Excel-Listen für Bauteil oder Baugruppe */
  listSheetsFor(d) {
    const app = this.app;
    const src = collectCutSources(app, d);
    const asm = d.kind === "assembly";
    const docOf = (id) => app.doc(id);
    // Struktur- und Baukastenliste nur, wenn es Unterbaugruppen gibt – sonst wären sie gleich der Stückliste
    const nested = asm && d.components.some((c) => app.doc(c.part)?.kind === "assembly");
    return listSheets({
      cut: cutListRows(src), welds: weldRows(collectWelds(src)),
      bom: asm ? bomRows(app, d) : collectNorm(src.map((s) => ({ bodies: s.result.bodies, qty: s.qty }))).map((x, i) => ({ ...x, pos: i + 1, number: "" })),
      structure: nested ? structureBom(d, docOf).map((x) => ({ level: x.level, name: x.doc.name, number: x.doc.number, kind: x.kind, qty: x.qty, total: x.total })) : [],
      modular: nested ? modularBom(d, docOf).map((m) => ({ name: m.asm.name, number: m.asm.number, rows: m.rows.map((x) => ({ pos: x.pos, name: x.doc.name, number: x.doc.number, kind: x.kind, qty: x.qty })) })) : [],
    });
  }
  /**
   * Angebotsblatt (E4) als PDF (Browser: druckfertiges HTML): Firmenkopf, Kunde, Bild der aktuellen Ansicht
   * (fotorealistisch), Hauptmaße, Werkstoff, Oberfläche, Gewicht und der von Hand eingetragene Preis.
   * Die Angaben bleiben am Dokument (d.angebot); Firmenkopf und Hinweis merkt sich PBCAD auch für neue Projekte.
   */
  async exportAngebot() {
    const app = this.app, d = app.activeDoc();
    if (d?.kind !== "part" && d?.kind !== "assembly") return toast("Angebotsblatt gibt es für Bauteile und Baugruppen");
    const mem = (k, v) => { try { if (v === undefined) return localStorage.getItem("pbcad.angebot." + k) || ""; localStorage.setItem("pbcad.angebot." + k, v); } catch { /* ohne Speicher */ } return ""; };
    const last = d.angebot || {};
    const v = {
      firma: last.firma ?? mem("firma"), kunde: last.kunde || "", nummer: last.nummer || "", betreff: last.betreff || "Angebot: " + d.name,
      text: last.text || "", qty: last.qty || 1, price: last.price || "", vat: last.vat ?? 19,
      hinweis: last.hinweis ?? (mem("hinweis") || "Alle Preise in Euro. Angebot freibleibend, gültig 30 Tage."), foto: last.foto !== false,
    };
    const inp = (k, opts = {}) => { const el = h(opts.area ? "textarea" : "input", { class: "inp", rows: opts.area || undefined, type: opts.type || "text", placeholder: opts.placeholder || "" }); el.value = v[k]; el.addEventListener("input", () => { v[k] = el.value; }); return el; };
    const field = (label, el) => h("div", { class: "field" }, h("label", {}, label), el);
    const foto = h("input", { type: "checkbox", checked: v.foto, onchange: (e) => { v.foto = e.target.checked; } });
    const ok = await new Promise((res) => modal({
      title: "Angebotsblatt", width: "560px", onClose: (r) => res(!!r),
      body: h("div", { class: "angebot-form" },
        field("Firmenkopf", inp("firma", { area: 3, placeholder: "Firma, Anschrift, Telefon" })),
        field("Kunde", inp("kunde", { area: 3, placeholder: "Name und Anschrift" })),
        field("Angebots-Nr.", inp("nummer")),
        field("Betreff", inp("betreff")),
        field("Leistung", inp("text", { area: 3, placeholder: "Beschreibung, z. B. Lieferung und Montage" })),
        field("Menge", inp("qty", { type: "number" })),
        field("Einzelpreis netto €", inp("price", { placeholder: "leer = Feld zum Eintragen" })),
        field("MwSt. %", inp("vat", { type: "number" })),
        field("Hinweis", inp("hinweis", { area: 2 })),
        h("label", { class: "chk" }, foto, "Bild fotorealistisch")),
      buttons: [{ label: "Abbrechen" }, { label: "Erstellen", primary: true, value: true }],
    }));
    if (!ok) return;
    mem("firma", v.firma);
    mem("hinweis", v.hinweis);
    app.edit("Angebotsangaben", () => { d.angebot = { ...v }; }, { rebuild: false });
    await this.withBusy("Angebotsblatt", async () => {
      await app.builtParts(d);
      const rows = d.kind === "assembly" ? bomRows(app, d) : [{ part: d, qty: 1, mass: bodiesMass((app.results.get(d.id)?.bodies || []).filter((b) => !b.meta?.norm), materialOf(d.material).density) }];
      const own = rows.filter((r) => r.part);
      const uniq = (a) => [...new Set(a.filter(Boolean))];
      const viewer = app.viewer, prev = viewer.displayMode;
      if (v.foto && prev !== "foto") viewer.setDisplayMode("foto");
      let img;
      try { img = viewer.snapshotPng({ scale: 2 }); } finally { if (v.foto && prev !== "foto") viewer.setDisplayMode(prev); }
      let bin = "";
      for (let i = 0; i < img.data.length; i += 0x8000) bin += String.fromCharCode.apply(null, img.data.subarray(i, i + 0x8000));
      const box = viewer.contentBox();
      const dims = box.isEmpty() ? [] : [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
      const page = angebotPage({
        ...v, datum: new Date().toLocaleDateString("de-DE"), image: "data:image/png;base64," + btoa(bin), dims,
        materials: uniq(own.map((r) => (r.part.material ? materialOf(r.part.material).label : ""))), finishes: uniq(own.map((r) => finishLabel(r.part))),
        mass: rows.reduce((a, r) => a + (Number.isFinite(r.mass) ? r.mass * (r.qty || 1) : 0), 0), positions: d.kind === "assembly" ? own.length : 1,
      });
      const html = mappeHtml([page], { title: v.betreff });
      const base = mappeName((v.nummer ? "Angebot_" + v.nummer : "Angebot_" + (d.number || d.name)));
      if (this.bridge?.renderPdf) await this.saveBinary(new Uint8Array(await this.bridge.renderPdf(html)), base + ".pdf", [{ name: "PDF", extensions: ["pdf"] }]);
      else await this.saveText(html, base + ".html", "text/html", [{ name: "HTML", extensions: ["html"] }]);
    });
  }
  /**
   * Fertigungsmappe (E3) als ZIP: PDF mit allen Zeichnungen (fehlende Einzelteilzeichnungen entstehen dabei), Stück- und
   * Zuschnittliste; dazu Excel-Listen, Zuschnitt-CSV, STEP gesamt und je Position, Profil-STEPs für den Rohrlaser und
   * die Zeichnungen als DXF. Im Browser steht statt des PDFs eine druckfertige HTML-Datei im ZIP.
   */
  async exportMappe(d = this.app.activeDoc()) {
    const app = this.app;
    if (d?.kind !== "part" && d?.kind !== "assembly") return toast("Fertigungsmappe gibt es für Bauteile und Baugruppen");
    // Vollständigkeit vorher prüfen (FU13); offene Punkte kommen auf eine eigene Seite
    const check = await checkBeforeMappe(app, d);
    if (!check.go) return;
    const open = check.items.filter((x) => x.level !== "Hinweis");
    await this.withBusy("Fertigungsmappe", async () => {
      const parts = await app.builtParts(d);
      const made = await app.partDrawings(d.id, { quiet: true });
      const cutSrc = collectCutSources(app, d);
      // Bauteil: Stückliste = seine Normteile (wie im Excel), Baugruppe: Positionen
      const bom = d.kind === "assembly" ? bomRows(app, d) : collectNorm(cutSrc.map((s) => ({ bodies: s.result.bodies, qty: s.qty }))).map((x, i) => ({ ...x, pos: i + 1, number: "" }));
      const order = [d.id, ...bom.filter((r) => r.part).map((r) => r.part.id), ...parts.map((p) => p.id)];
      const drawings = [...new Set(order)].flatMap((id) => app.project.docs.filter((x) => x.kind === "drawing" && x.source?.id === id));
      const sheets = [];
      for (const dr of drawings) sheets.push(await app.drawing.sheetExport(dr));
      const cut = cutListRows(cutSrc);
      const bends = parts.flatMap((p) => (app.results.get(p.id)?.bodies || []).filter((b) => b.meta?.bends?.length).map((b) => ({ name: `${p.name} – ${b.name}`, bends: b.meta.bends, last: b.meta.lastStraight || 0, length: b.meta.length })));
      const base = mappeName(d.number || d.name);
      const status = open.length ? "nicht freigegeben" : releaseText(d, (id) => app.doc(id));
      const html = mappeHtml([...sheets, ...listPages({ title: d.name, number: d.number, status, bom, cut, bends }), ...(open.length ? [openPointsPage(d, open)] : [])], { title: "Fertigungsmappe " + d.name });
      const files = [];
      const pdf = this.bridge?.renderPdf ? await this.bridge.renderPdf(html) : null;
      files.push(pdf ? [base + "_Fertigungsmappe.pdf", new Uint8Array(pdf)] : [base + "_Fertigungsmappe.html", html]);
      const used = new Set();
      const unique = (dir, name, ext) => { let n = `${dir}/${mappeName(name)}`, k = 2; while (used.has(n + ext)) n = `${dir}/${mappeName(name)}_${k++}`; used.add(n + ext); return n + ext; };
      for (const s of sheets) files.push([unique("Zeichnungen", s.name, ".dxf"), s.dxf]);
      const xl = this.listSheetsFor(d);
      if (xl.length) files.push([base + "_Listen.xlsx", buildXlsx(xl)]);
      if (cut.length) files.push([base + "_Zuschnitt.csv", cutListCsv(cut)]);
      for (const b of bends) files.push([unique("Biegelisten", b.name, ".csv"), bendListCsv(b, b.name)]);
      files.push([base + ".step", await app.kernel.call("exportStep", { items: this.exportItems(d) })]);
      if (d.kind === "assembly") for (const r of bom.filter((x) => x.part)) files.push([unique("Positionen", `${String(r.pos).padStart(2, "0")}_${r.number || r.name}`, ".step"), await app.kernel.call("exportStep", { items: [{ part: r.part, name: r.part.name }] })]);
      for (const p of parts) for (const x of await app.kernel.call("bodySteps", { part: p, onlyMembers: true })) files.push([unique("Laser", x.name, ".step"), x.text]);
      await this.saveBinary(zipFiles(files), base + "_Fertigungsmappe.zip", [{ name: "ZIP-Archiv", extensions: ["zip"] }]);
      toast(`Fertigungsmappe: ${sheets.length} Zeichnung${sheets.length === 1 ? "" : "en"}${made.length ? ` (${made.length} neu)` : ""}, ${files.length} Dateien`, { kind: "ok", timeout: 6000 });
    });
  }
  async exportBom() {
    const app = this.app;
    const d = app.activeDoc();
    if (d.kind !== "assembly") return;
    const rows = bomRows(app, d);
    const head = ["Pos", "Benennung", "Teilenummer", "Menge", "Werkstoff", "Oberfläche", "Masse kg/Stk", "Masse kg gesamt"];
    const lines = rows.map((r) => [r.pos, r.name, r.number, r.qty, r.material, r.finish || "", num(r.mass, 3), num(r.mass * r.qty, 3)]);
    await this.saveText(csv([head, ...lines]), safeName(d.number || d.name) + "_Stueckliste.csv", "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]);
  }
  /** Platte/Blechteil als DXF 1:1 (Kontur und Bohrungen), z. B. für den Flachbettlaser */
  async exportPlateDxf() {
    const app = this.app;
    const part = app.activeDoc();
    if (part?.kind !== "part") return toast("Platten-DXF gibt es für Bauteile");
    const face = app.selHits?.find((x) => x.kind === "face" && x.info?.type === "PLANE");
    await this.withBusy("Platten-DXF", async () => {
      const r = await app.kernel.call("plateDxf", { part, body: face ? face.body : null, normal: face ? face.info.normal : null });
      const t = Math.round(r.thickness * 100) / 100;
      const name = `${safeName(part.number || part.name)}${r.body ? "_" + (r.body + 1) : ""}_${String(t).replace(".", ",")}mm.dxf`.replace(/\s+/g, "_");
      await this.saveText(r.dxf, name, "application/dxf", [{ name: "DXF", extensions: ["dxf"] }]);
      toast(`Kontur ${fmtNum(r.width, 1)} × ${fmtNum(r.height, 1)} mm, Dicke ${fmtNum(r.thickness, 2)} mm, ${r.circles} Kreis(e)`, { timeout: 5000 });
    });
  }
  async exportSketchDxf(id) {
    const app = this.app;
    const part = app.activeDoc();
    if (part?.kind !== "part") return;
    const sid = id || (app.sel?.type === "feature" && app.feature(app.sel.id)?.type === "sketch" ? app.sel.id : app.mode === "sketch" ? app.sketcher.sketchId : app.lastSketchId());
    const sk = part.features.find((f) => f.id === sid);
    if (!sk) return toast("Keine Skizze gewählt");
    await this.saveText(sketchToDxf(sk), `${safeName(part.name)}_${safeName(sk.name)}.dxf`, "application/dxf", [{ name: "DXF", extensions: ["dxf"] }]);
  }

  // ---------- Import ----------
  async pickStep() {
    if (this.bridge) return await this.bridge.openFile({ filters: [{ name: "STEP / STL", extensions: ["step", "stp", "stl"] }] });
    const f = await pickFile(".step,.stp,.stl");
    if (!f) return null;
    const isStl = /\.stl$/i.test(f.name);
    return { name: f.name, data: isStl ? bytesToBase64(new Uint8Array(await f.arrayBuffer())) : await f.text(), binary: isStl };
  }
  /** DXF-Datei wählen → { name, text } */
  async pickDxf() {
    if (this.bridge) { const f = await this.bridge.openFile({ filters: [{ name: "DXF", extensions: ["dxf"] }] }); return f && { name: f.name, text: f.data }; }
    const f = await pickFile(".dxf");
    return f && { name: f.name, text: await f.text() };
  }
  async importStepAsPart() {
    const f = await this.pickStep();
    if (!f) return;
    const p = this.app.withPartDefaults(newPart(f.name.replace(/\.(step|stp|stl)$/i, "")));
    p.features.push(importFeature(f));
    this.app.addDoc(p);
  }
  async importStepIntoPart() {
    const app = this.app;
    const f = await this.pickStep();
    if (!f) return;
    app.addFeature(importFeature(f));
  }
  async replaceImport(feat) {
    const f = await this.pickStep();
    if (!f) return;
    this.app.edit("Import ersetzen", () => { Object.assign(feat, importFeature(f), { id: feat.id, name: feat.name }); });
  }
}

function importFeature(f) {
  const isStl = /\.stl$/i.test(f.name);
  return { id: uid("f"), type: "import", name: "Import " + f.name, fileName: f.name, format: isStl ? "stl" : "step", data: f.data, op: "new" };
}
function pickFile(accept) {
  return new Promise((res) => {
    const inp = h("input", { type: "file", accept, style: { display: "none" } });
    inp.addEventListener("change", () => { res(inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
    setTimeout(() => { if (!inp.files?.length) { /* bleibt offen bis Auswahl */ } }, 0);
  });
}
function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function safeName(s) { return String(s || "Export").replace(/[\\/:*?"<>|]+/g, "_").trim() || "Export"; }
const num = (v, d) => (Number.isFinite(v) ? fmtNum(v, d).replace(/\./g, "") : "");
function csv(rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}

/** Prüfhinweise als Meldung zeigen; reine Info (z. B. Migration) nur in der Konsole */
function showIssues(issues, context) {
  for (const i of issues) console.info("[Projektprüfung]", i.code, i.message);
  const shown = issues.filter((i) => i.severity !== "info");
  if (!shown.length) return;
  const more = shown.length > 1 ? ` (+${shown.length - 1} weitere Hinweise)` : "";
  toast(`${context}: ${shown[0].message}${more}`, { kind: shown.some((i) => i.severity === "error") ? "err" : "", timeout: 8000 });
}
