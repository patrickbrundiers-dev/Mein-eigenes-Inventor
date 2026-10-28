// Verbindung zum Geometrie-Kern (SY1): Neustart wegen Speicher im Leerlauf, Zustand nach Neustart erneut setzen
import test from "node:test";
import assert from "node:assert/strict";

const workers = [];
class FakeWorker {
  constructor() { this.sent = []; this.heapMB = 100; this.terminated = false; workers.push(this); }
  postMessage(msg) {
    this.sent.push(msg.cmd);
    setTimeout(() => this.onmessage?.({ data: { id: msg.id, ok: true, result: msg.cmd === "build" ? { bodies: [] } : "ok", heapMB: this.heapMB } }), 1);
  }
  terminate() { this.terminated = true; }
}
globalThis.Worker = FakeWorker;
globalThis.window = {};
const { KernelClient } = await import("../src/ui/kernel.js");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("Kern startet über der Speichergrenze erst im Leerlauf neu und setzt Werkstoffe erneut", async () => {
  workers.length = 0;
  const k = new KernelClient();
  k.heapLimit = 500;
  await k.ready;
  await k.call("materials", { user: [{ key: "X" }], project: [] });
  await k.build({ id: "p1", features: [] });
  workers[0].heapMB = 600;
  await k.build({ id: "p1", features: [{}] });
  assert.equal(workers.length, 1, "nicht sofort");
  await wait(1700);
  assert.equal(workers.length, 2, "nach der Wartezeit neu gestartet");
  assert.ok(workers[0].terminated);
  await wait(20);
  assert.deepEqual(workers[1].sent, ["ping", "materials"], "Werkstoffe an den neuen Kern");
  assert.equal(k.recycles, 1);
});

test("unter der Grenze kein Neustart", async () => {
  workers.length = 0;
  const k = new KernelClient();
  await k.ready;
  await k.build({ id: "p1", features: [] });
  await wait(1700);
  assert.equal(workers.length, 1);
});

test("großes Modell: Grenze wächst mit dem Bedarf nach dem ersten Bau", async () => {
  workers.length = 0;
  const k = new KernelClient();
  k.heapLimit = 500;
  await k.ready;
  workers[0].heapMB = 400; // erster Bau braucht 400 MB → Grenze 800
  await k.build({ id: "p1", features: [] });
  workers[0].heapMB = 700;
  await k.build({ id: "p1", features: [{}] });
  await wait(1700);
  assert.equal(workers.length, 1, "700 MB < 2 × 400 MB");
  assert.equal(k.recycleLimit, 800);
});

test("Abbrechen startet den Kern neu und lehnt offene Aufträge ab, ohne als Absturz zu zählen", async () => {
  workers.length = 0;
  const states = [];
  const k = new KernelClient((busy, msg) => states.push(msg));
  await k.ready;
  workers[0].postMessage = function (msg) { this.sent.push(msg.cmd); }; // hängt
  const p = k.call("build", { part: { id: "x" } });
  k.abort();
  await assert.rejects(p, /abgebrochen/);
  assert.equal(workers.length, 2);
  assert.equal(k.busy >= 0, true);
  assert.equal((k.crashes || []).length, 0);
  assert.ok(states.includes("Berechnung abgebrochen"));
});

test("dreimal abgestürzt in einer Minute: Hinweis zur Abhilfe", () => {
  workers.length = 0;
  const msgs = [];
  const k = new KernelClient((busy, msg) => msg && msgs.push(msg));
  for (let i = 0; i < 3; i++) k.restart("Geometrie-Kern abgestürzt");
  assert.ok(/wiederholt/.test(msgs[2]) && !/wiederholt/.test(msgs[1]));
});
