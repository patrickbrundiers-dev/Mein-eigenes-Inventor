// 3D-Maus (SpaceMouse) über WebHID: verbinden, Berichte lesen, Ansicht bewegen (SolidCraft: Einstellungen → 3D-Maus).
import { SPACE_FILTERS, NULL_STATE, parseReport, motion, isMoving } from "../core/maus3d.js";
import { toast } from "./dom.js";

export class SpaceMouse {
  constructor(app) {
    this.app = app;
    this.device = null;
    this.state = { ...NULL_STATE };
    this.status = "keine"; // keine | verbunden | gesperrt | nicht-unterstuetzt
    this.listeners = [];
    this.raf = null;
    this.last = 0;
    if (!navigator.hid) { this.status = "nicht-unterstuetzt"; return; }
    navigator.hid.addEventListener?.("disconnect", (e) => { if (e.device === this.device) this.drop(); });
    navigator.hid.addEventListener?.("connect", () => { if (!this.device && this.enabled()) this.autoConnect(); });
  }
  enabled() { return this.app.prefs?.get("maus3d.aktiv") !== false; }
  onChange(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(this.status); }
  /** Schon freigegebene Geräte ohne Rückfrage öffnen (Programmstart, Gerät eingesteckt) */
  async autoConnect() {
    if (!navigator.hid || !this.enabled()) return false;
    try {
      const list = await navigator.hid.getDevices();
      const d = list.find((x) => SPACE_FILTERS.some((f) => f.vendorId === x.vendorId));
      return d ? this.open(d) : false;
    } catch { return false; }
  }
  /** Gerät auswählen lassen (Knopf »Verbinden« in den Einstellungen) */
  async connect() {
    if (!navigator.hid) { toast("Dieses Programm kann hier nicht auf USB-Eingabegeräte zugreifen", { kind: "err" }); return false; }
    try {
      const [d] = await navigator.hid.requestDevice({ filters: SPACE_FILTERS });
      if (!d) { toast("Keine 3D-Maus gefunden. Falls eine angeschlossen ist, bewegen Sie sie kurz und versuchen es noch einmal."); return false; }
      return this.open(d);
    } catch (e) { toast("3D-Maus: " + e.message, { kind: "err" }); return false; }
  }
  async open(d) {
    try { if (!d.opened) await d.open(); }
    catch { this.status = "gesperrt"; this.emit(); return false; }
    this.device = d;
    this.status = "verbunden";
    d.addEventListener("inputreport", (e) => this.report(e));
    this.emit();
    return true;
  }
  drop() { this.device = null; this.state = { ...NULL_STATE }; this.status = "keine"; this.emit(); }
  get name() { return this.device?.productName || ""; }
  report(e) {
    const prevButtons = this.state.buttons;
    this.state = parseReport(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), this.state);
    if (this.state.buttons !== prevButtons) this.buttons(this.state.buttons, prevButtons);
    if (this.calibrating) this.calibrating.push({ t: [...this.state.t], r: [...this.state.r] });
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t)); }
  }
  /** Tasten: links = Einpassen, rechts = Iso-Ansicht (wie die Standardbelegung der Geräte) */
  buttons(now, before) {
    const pressed = now & ~before, p = this.app.prefs;
    const run = (key) => { const id = p?.get(key); if (id) this.app.commands?.exec(id); };
    if (pressed & 1) run("maus3d.tasteLinks");
    if (pressed & 2) run("maus3d.tasteRechts");
  }
  opts() {
    const p = this.app.prefs;
    return {
      sens: Number(p.get("maus3d.empfindlichkeit")) || 1, dead: (Number(p.get("maus3d.totzone")) || 0) / 100, mode: p.get("maus3d.modus") || "alles",
      dominant: !!p.get("maus3d.dominant"), invert: { pan: !!p.get("maus3d.schwenkenUmkehren"), zoom: !!p.get("maus3d.zoomUmkehren"), rot: !!p.get("maus3d.drehenUmkehren") },
      cal: p.get("maus3d.kalibrierung") || undefined, sketch: this.app.mode === "sketch",
    };
  }
  tick(now) {
    this.raf = null;
    if (!this.enabled()) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const m = motion(this.state, this.opts());
    if (!isMoving(m)) return;
    const v = this.app.viewer;
    if (m.turn[0] || m.turn[1]) v.turnView(m.turn[0] * dt, m.turn[1] * dt);
    if (m.roll) v.rollView(m.roll * dt);
    if (m.pan[0] || m.pan[1]) v.panView(m.pan[0] * dt, m.pan[1] * dt);
    if (m.zoom) v.zoomBy(Math.exp(m.zoom * dt));
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
  /** Kalibrieren: 2 s ruhig liegen lassen, Mittelwert wird Nullpunkt */
  calibrate() {
    if (!this.device) return Promise.resolve(false);
    this.calibrating = [{ t: [...this.state.t], r: [...this.state.r] }];
    return new Promise((res) => setTimeout(() => {
      const s = this.calibrating; this.calibrating = null;
      if (!s.length) { res(false); return; }
      const avg = (k) => [0, 1, 2].map((i) => Math.round(s.reduce((a, x) => a + x[k][i], 0) / s.length));
      this.app.prefs.set("maus3d.kalibrierung", { t: avg("t"), r: avg("r") });
      res(true);
    }, 2000));
  }
}
