// Einstiegspunkt
import { App } from "./app.js";
import { h, modal } from "./dom.js";

let app;
try {
  app = new App();
} catch (e) {
  const gl = /WebGL/i.test(String(e && e.message));
  document.body.replaceChildren(h("div", { style: { padding: "40px", maxWidth: "70ch", font: "15px/1.5 var(--ui)" } },
    h("h2", { style: { fontFamily: "var(--din)" } }, gl ? "3D-Grafik konnte nicht gestartet werden" : "PBCAD konnte nicht gestartet werden"),
    h("p", {}, gl ? "Der Grafiktreiber stellt kein WebGL bereit. Bitte den Grafiktreiber aktualisieren oder PBCAD direkt am PC statt über Remotedesktop starten." : "Beim Start ist ein Fehler aufgetreten."),
    h("pre", { style: { whiteSpace: "pre-wrap", background: "#fff", padding: "10px", border: "1px solid #ccc" } }, String(e && (e.stack || e.message) || e))));
  throw e;
}
window.__werkcad = app; // für automatische Tests

const bridge = window.werkcad;
if (bridge?.log) {
  // Fehler der Oberfläche ins Protokoll (nur Meldung und Stack, keine Projektdaten)
  window.addEventListener("error", (e) => bridge.log("error", "oberflaeche", e.error?.stack || `${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => bridge.log("error", "oberflaeche", e.reason?.stack || String(e.reason)));
}
if (bridge) {
  // Datei per Doppelklick / zweite Instanz
  bridge.onOpenFile?.((path) => app.files.open(path));
  // Schließen mit ungespeicherten Änderungen
  bridge.onCloseRequest?.(async () => {
    if (!app.dirty) return bridge.confirmClose(true);
    const ok = await app.files.confirmDiscard();
    bridge.confirmClose(!!ok);
  });
  // Updates mit Freigabe
  let bar = null;
  const showBar = (...children) => {
    bar?.remove();
    bar = h("div", { class: "update-bar", role: "status" }, ...children);
    document.body.append(bar);
  };
  const startDownload = () => {
    bridge.downloadUpdate();
    showBar(h("span", {}, "Lade Update…"), h("div", { class: "progress" }, h("i", { style: { width: "0%" } })));
  };
  bridge.onUpdateEvent?.((ev) => {
    if (ev.type === "available") {
      const notes = notesText(ev.notes);
      showBar(h("span", {}, `Version ${ev.version} ist verfügbar.`),
        notes ? h("button", { class: "btn", onclick: () => modal({ title: `Neu in ${ev.version}`, body: h("div", { style: { whiteSpace: "pre-wrap", maxWidth: "70ch" } }, notes), buttons: [{ label: "OK", primary: true }] }) }, "Was ist neu?") : null,
        h("button", { class: "btn primary", onclick: startDownload }, "Herunterladen"),
        h("button", { class: "btn", onclick: () => bar.remove() }, "Später"));
    } else if (ev.type === "progress") {
      const i = bar?.querySelector(".progress > i");
      if (i) i.style.width = Math.round(ev.percent) + "%";
    } else if (ev.type === "downloaded") {
      showBar(h("span", {}, `Version ${ev.version} ist bereit.`),
        h("button", { class: "btn primary", onclick: async () => {
          if (app.dirty && !(await app.files.confirmDiscard())) return;
          bridge.installUpdate();
        } }, "Jetzt neu starten und installieren"),
        h("button", { class: "btn", onclick: () => bar.remove() }, "Beim Beenden"));
    } else if (ev.type === "error" && ev.stage === "download") {
      showBar(h("span", {}, "Update konnte nicht geladen werden: " + ev.message),
        h("button", { class: "btn", onclick: startDownload }, "Erneut versuchen"),
        h("button", { class: "btn", onclick: () => bar.remove() }, "Schließen"));
    }
    // Fehler der Update-Suche zeigt die Einstellungsseite selbst an (Startprüfung nur im Protokoll) – kein Toast, sonst stapeln sie sich
  });
  const initial = bridge.initialFile?.();
  Promise.resolve(initial).then((p) => { if (p) app.files.open(p); });
}

/** Release-Notizen (HTML von GitHub) als reiner Text */
function notesText(notes) {
  if (!notes) return "";
  const raw = Array.isArray(notes) ? notes.map((n) => n.note || "").join("\n") : String(notes);
  const doc = new DOMParser().parseFromString(raw.replace(/<\/(p|li|h\d)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li>/gi, "• "), "text/html");
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

// Erste Hilfe beim allerersten Start
window.addEventListener("error", (e) => console.error("Fehler:", e.message));
export default app;
