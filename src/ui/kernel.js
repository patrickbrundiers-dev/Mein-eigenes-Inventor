// Verbindung zum Geometrie-Worker mit Neustart nach Absturz und Zusammenfassung von Bau-Aufträgen
import { inlineDerived } from "../core/ableiten.js";
import { linkedPart } from "../core/baugruppenparameter.js";

// OpenCascade gibt Speicher aus Booleschen Operationen nicht vollständig frei (~0,25 MB je Schnitt, auch nach delete):
// der WASM-Speicher wächst mit jeder Änderung. Über dieser Grenze wird der Kern im Leerlauf unbemerkt neu gestartet.
export const HEAP_LIMIT_MB = 1024;
// Aufträge, die den Zustand des Kerns setzen – nach einem Neustart erneut schicken
const SETUP = ["materials", "bendTables"];

export class KernelClient {
  constructor(onState) {
    this.setup = new Map();
    this.heapMB = 0;
    this.heapLimit = HEAP_LIMIT_MB;
    this.recycles = 0;
    this.onState = onState || (() => {});
    this.pending = new Map();
    this.seq = 0;
    this.busy = 0;
    this.latest = new Map(); // partId -> {part, resolvers[]}
    this.running = new Set();
    this.spawn();
  }
  spawn() {
    if (this.w) this.w.terminate();
    this.w = new Worker("worker.js");
    this.heapMB = 0;
    this.baseHeap = 0;
    this.w.onmessage = (ev) => {
      const { id, ok, result, error, fatal, heapMB } = ev.data;
      if (heapMB) this.heapMB = heapMB;
      const p = this.pending.get(id);
      if (!p) return;
      // Speicher nach dem ersten Bau im frischen Kern ≈ Arbeitsbedarf des Modells; große Modelle nicht ständig neu starten
      if (p.cmd === "build" && !this.baseHeap) this.baseHeap = heapMB || 0;
      this.pending.delete(id);
      this.busy--;
      this.onState(this.busy);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
      if (fatal) this.restart("Geometrie-Kern wurde nach einem Fehler neu gestartet");
      else this.maybeRecycle();
    };
    this.w.onerror = (e) => {
      e.preventDefault?.();
      this.restart("Geometrie-Kern abgestürzt: " + (e.message || "unbekannt"));
    };
    this.ready = this.call("ping");
    this.ready.catch(() => {}); // Neustart vor der ersten Antwort: kein unbehandelter Fehler
    for (const [cmd, args] of this.setup) this.call(cmd, args).catch(() => {});
  }
  /** Speicher über der Grenze: neu starten, sobald nichts mehr läuft (kurz warten, Folgeaufträge kommen oft gleich) */
  get recycleLimit() { return Math.max(this.heapLimit, 2 * (this.baseHeap || 0)); }
  maybeRecycle() {
    if (this.heapMB < this.recycleLimit || this.recycleTimer) return;
    this.recycleTimer = setTimeout(() => {
      this.recycleTimer = null;
      if (this.heapMB < this.recycleLimit) return;
      if (this.busy || this.running.size || this.latest.size) return this.maybeRecycle();
      window.werkcad?.log?.("info", "geometrie-kern", `Neustart wegen Speicher (${this.heapMB} MB)`);
      this.recycles++;
      this.spawn();
    }, 1500);
  }
  restart(msg, { crash = true } = {}) {
    // Absturzschleife (SY5): dreimal in einer Minute → Hinweis, was der Anwender tun kann
    if (crash) {
      const now = Date.now();
      this.crashes = [...(this.crashes || []).filter((t) => now - t < 60000), now];
      if (this.crashes.length >= 3) msg += " – stürzt wiederholt ab: letzte Änderung mit Strg+Z zurücknehmen oder das Feature unterdrücken";
    }
    window.werkcad?.log?.(crash ? "error" : "info", "geometrie-kern", msg);
    for (const [, p] of this.pending) p.reject(new Error(msg));
    this.pending.clear();
    this.busy = 0;
    this.onState(0, msg);
    this.spawn();
  }
  /** Laufende Berechnung abbrechen (SY5): OpenCascade lässt sich nicht unterbrechen, also Kern neu starten */
  abort() {
    if (!this.busy) return;
    this.restart("Berechnung abgebrochen", { crash: false });
  }
  /** Abgeleitete Bauteile bekommen ihre Quelle mit (der Kern kennt nur das einzelne Bauteil), mit der Baugruppe verknüpfte Parameter ihren Wert (FU4) */
  withSources(args) {
    if (!this.lookup || !args) return args;
    const fix = (p) => (p?.kind === "part" ? inlineDerived(linkedPart(p, this.lookup).part, this.lookup) : p);
    let out = args;
    if (args.part) out = { ...out, part: fix(args.part) };
    if (Array.isArray(args.items)) out = { ...out, items: args.items.map((it) => (it?.part ? { ...it, part: fix(it.part) } : it)) };
    return out;
  }
  call(cmd, args) {
    if (SETUP.includes(cmd)) this.setup.set(cmd, args);
    args = this.withSources(args);
    const id = ++this.seq;
    this.busy++;
    this.onState(this.busy);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, cmd });
      this.w.postMessage({ id, cmd, args });
    });
  }
  /** Bauteil bauen; bei schnell aufeinanderfolgenden Änderungen gewinnt die letzte */
  build(part, quality = "normal") {
    return new Promise((resolve, reject) => {
      const entry = this.latest.get(part.id) || { waiters: [] };
      entry.part = JSON.parse(JSON.stringify(part));
      entry.quality = quality;
      entry.waiters.push({ resolve, reject });
      this.latest.set(part.id, entry);
      this.pump(part.id);
    });
  }
  async pump(pid) {
    if (this.running.has(pid)) return;
    const entry = this.latest.get(pid);
    if (!entry) return;
    this.latest.delete(pid);
    this.running.add(pid);
    try {
      const r = await this.call("build", { part: entry.part, quality: entry.quality });
      // Wenn inzwischen neuer Auftrag da ist, Ergebnis trotzdem liefern (Anzeige aktualisiert sich gleich wieder)
      for (const w of entry.waiters) w.resolve(r);
    } catch (e) {
      for (const w of entry.waiters) w.reject(e);
    } finally {
      this.running.delete(pid);
      if (this.latest.has(pid)) this.pump(pid);
    }
  }
}
