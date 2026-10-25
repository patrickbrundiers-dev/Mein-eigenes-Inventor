// Öffnen, Speichern, Import/Export – über die Electron-Brücke oder im Browser per Download
import { toast, choiceDialog, downloadBlob, h } from "./dom.js";
import { sketchToDxf } from "../core/dxf.js";
import { newPart, uid } from "../core/examples.js";
import { serializeProject, loadProject, validateProject } from "../core/project.js";
import { bomRows, collectCutSources } from "./props.js";
import { cutListRows, cutListCsv } from "../core/cutlist.js";
import { collectWelds, weldRows, weldCsv } from "../core/weld.js";
import { flattenAssembly, structureBom, modularBom } from "../core/subasm.js";
import { decomposePlacement } from "../core/geom.js";
import { buildXlsx } from "../core/xlsx.js";
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
  async open(path) {
    if (!(await this.confirmDiscard())) return;
    try {
      let loaded, file;
      if (this.bridge) {
        const r = path ? await this.bridge.readProject(path) : await this.bridge.openProject();
        if (!r) return;
        file = r.path;
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
      toast("Geöffnet: " + (file ? file.split(/[\\/]/).pop() : prj.name), { kind: "ok", timeout: 2000 });
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
    // Speichern nie blockieren (kein Datenverlust), aber auf Strukturfehler hinweisen
    showIssues(validateProject(app.project), "Beim Speichern");
    const text = this.serialize();
    const defaultName = safeName(app.project.name) + ".wcad";
    try {
      if (this.bridge) {
        const r = await this.bridge.saveProject({ path: saveAs ? null : app.filePath, text, defaultName });
        if (!r) return false;
        app.filePath = r.path;
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
  exportItems() {
    const app = this.app;
    const d = app.activeDoc();
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
  async exportListsXlsx() {
    const app = this.app;
    const d = app.activeDoc();
    const src = collectCutSources(app, d);
    const asm = d.kind === "assembly";
    const docOf = (id) => app.doc(id);
    // Struktur- und Baukastenliste nur, wenn es Unterbaugruppen gibt – sonst wären sie gleich der Stückliste
    const nested = asm && d.components.some((c) => app.doc(c.part)?.kind === "assembly");
    const sheets = listSheets({
      cut: cutListRows(src), welds: weldRows(collectWelds(src)), bom: asm ? bomRows(app, d) : [],
      structure: nested ? structureBom(d, docOf).map((x) => ({ level: x.level, name: x.doc.name, number: x.doc.number, kind: x.kind, qty: x.qty, total: x.total })) : [],
      modular: nested ? modularBom(d, docOf).map((m) => ({ name: m.asm.name, number: m.asm.number, rows: m.rows.map((x) => ({ pos: x.pos, name: x.doc.name, number: x.doc.number, kind: x.kind, qty: x.qty })) })) : [],
    });
    if (!sheets.length) return toast("Keine Listen vorhanden – keine Profile, Nähte oder Bauteile");
    const data = buildXlsx(sheets);
    await this.saveBinary(data, safeName(d.number || d.name) + "_Listen.xlsx", [{ name: "Excel-Arbeitsmappe", extensions: ["xlsx"] }]);
    toast(`Excel: ${sheets.map((s) => s.name).join(", ")}`, { kind: "ok" });
  }
  async exportBom() {
    const app = this.app;
    const d = app.activeDoc();
    if (d.kind !== "assembly") return;
    const rows = bomRows(app, d);
    const head = ["Pos", "Benennung", "Teilenummer", "Menge", "Werkstoff", "Masse kg/Stk", "Masse kg gesamt"];
    const lines = rows.map((r) => [r.pos, r.name, r.number, r.qty, r.material, num(r.mass, 3), num(r.mass * r.qty, 3)]);
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
  async importStepAsPart() {
    const f = await this.pickStep();
    if (!f) return;
    const p = newPart(f.name.replace(/\.(step|stp|stl)$/i, ""));
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
