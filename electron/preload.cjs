// Sichere Brücke zwischen Oberfläche und Hauptprozess
const { contextBridge, ipcRenderer } = require("electron");

const version = ipcRenderer.sendSync("app:version-sync");

contextBridge.exposeInMainWorld("werkcad", {
  version,
  initialFile: () => ipcRenderer.invoke("app:initialFile"),
  recentFiles: () => ipcRenderer.invoke("recent:list"),
  openProject: () => ipcRenderer.invoke("project:open"),
  readProject: (path) => ipcRenderer.invoke("project:read", path),
  readProjectBackup: (path) => ipcRenderer.invoke("project:readBackup", path),
  writeAutosave: (data) => ipcRenderer.invoke("autosave:write", data),
  readAutosave: () => ipcRenderer.invoke("autosave:read"),
  saveProject: (opts) => ipcRenderer.invoke("project:save", opts),
  saveFile: (opts) => ipcRenderer.invoke("file:save", opts),
  saveFiles: (opts) => ipcRenderer.invoke("file:saveMany", opts),
  openFile: (opts) => ipcRenderer.invoke("file:open", opts),
  printPdf: (opts) => ipcRenderer.invoke("pdf:print", opts),
  setTitle: (t) => ipcRenderer.send("app:title", t),
  onOpenFile: (cb) => ipcRenderer.on("app:open-file", (_e, p) => cb(p)),
  onCloseRequest: (cb) => ipcRenderer.on("app:close-request", () => cb()),
  confirmClose: (ok) => ipcRenderer.send("app:close-confirmed", ok),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateEvent: (cb) => ipcRenderer.on("update:event", (_e, ev) => cb(ev)),
  log: (level, source, message) => ipcRenderer.send("log:write", { level, source, message: String(message ?? "") }),
  openLogFolder: () => ipcRenderer.invoke("log:openFolder"),
});
