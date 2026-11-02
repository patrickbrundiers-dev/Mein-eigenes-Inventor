// Menü »Arbeitsbereich« (Q11) im Reiter Ansicht: eingebaute und eigene Anordnungen umschalten, speichern, löschen.
// Eigene Bereiche liegen je Rechner im localStorage (wie Generator-Vorlagen), nicht im Projekt.
import { contextMenu, promptDialog, toast } from "./dom.js";
import { BUILTIN_WORKSPACES, captureWorkspace, upsertWorkspace, readWorkspaces, activeWorkspace, layoutFor } from "../core/arbeitsbereiche.js";
import { DEFAULT_LAYOUT } from "../core/layout.js";

const KEY = "pbcad.arbeitsbereiche";
const load = () => { try { return readWorkspaces(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };

function state(app) {
  return { layout: app.prefs.get("oberflaeche.layout") || DEFAULT_LAYOUT, grid: app.prefs.get("ansicht.raster") !== false, side: !!app.side?.on };
}

export function applyWorkspace(app, ws) {
  const cur = app.prefs.get("oberflaeche.layout") || DEFAULT_LAYOUT;
  const r = app.prefs.set("oberflaeche.layout", layoutFor(ws, cur));
  if (!r.ok) { toast(r.error, { kind: "err" }); return; }
  app.prefs.set("ansicht.raster", ws.grid);
  if (!!app.side?.on !== ws.side) app.side?.toggle(ws.side);
  app.ribbon.render();
  toast(`Arbeitsbereich »${ws.name}«`, { timeout: 1500 });
}

export function workspaceMenu(app, e) {
  const r = e.currentTarget.getBoundingClientRect();
  const own = load();
  const active = activeWorkspace([...BUILTIN_WORKSPACES, ...own], state(app));
  const item = (ws) => ({ label: (ws.name === active ? "✓ " : "   ") + ws.name, icon: ws.builtin ? "layout" : "star", run: () => applyWorkspace(app, ws) });
  contextMenu(r.left, r.bottom, [
    ...BUILTIN_WORKSPACES.map(item),
    own.length ? "-" : null,
    ...own.map(item),
    "-",
    { label: "Aktuelle Anordnung speichern…", icon: "save", run: () => saveCurrent(app, own) },
    ...own.map((ws) => ({ label: `»${ws.name}« löschen`, icon: "trash", run: () => { save(own.filter((x) => x !== ws)); toast(`Arbeitsbereich »${ws.name}« gelöscht`); } })),
  ].filter(Boolean));
}

async function saveCurrent(app, own) {
  const name = await promptDialog("Arbeitsbereich speichern", "Name", "", { ok: "Speichern", validate: (v) => { const t = upsertWorkspace(own, captureWorkspace(v, state(app))); return t.ok ? null : t.error; } });
  if (!name) return;
  const t = upsertWorkspace(own, captureWorkspace(name, state(app)));
  if (t.ok && save(t.value)) toast(`Arbeitsbereich »${name}« gespeichert`, { kind: "ok" });
}
