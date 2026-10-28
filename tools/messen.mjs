// Leistungsmessung im Browser (SY0): Startzeit, Bauzeit und Speicher des Geometrie-Kerns über viele Änderungen.
// Vorher `npm run build`. Aufruf: node tools/messen.mjs [--json datei] [--runden 40]
// Läuft headless wie der Oberflächentest (CHROME_PATH für einen eigenen Chromium).
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";
import { GENERATORS } from "../src/core/generator.js";

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const rounds = Number(arg("--runden", 40));
const jsonOut = arg("--json", null);
const limit = arg("--grenze", null); // Speichergrenze des Kerns in MB (Neustart im Leerlauf), sonst Vorgabe
const port = 4198;
const srv = await serve(port);
const launchOpts = { headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info"] };
let browser;
try { browser = await chromium.launch({ ...launchOpts, channel: "chrome" }); }
catch { browser = await chromium.launch({ ...launchOpts, executablePath: process.env.CHROME_PATH }); }
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// Arbeitsspeicher aller Browser-Prozesse (Linux), sonst null
const rssMB = () => { try { return Math.round(Number(execSync(`ps -u ${process.getuid()} -o rss=,comm= | awk '/chrom|headless/ {s+=$1} END {print s}'`).toString()) / 1024); } catch { return null; } };
const stats = () => page.evaluate(() => window.__werkcad.kernel.call("stats"));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

const report = { date: new Date().toISOString(), rounds, start: {}, scenarios: [], errors };
const t0 = Date.now();
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => !!window.__werkcad, null, { timeout: 30000 });
report.start.uiMs = Date.now() - t0;
await page.evaluate(() => window.__werkcad.kernel.ready);
report.start.kernelMs = Date.now() - t0;
if (limit) await page.evaluate((l) => { window.__werkcad.kernel.heapLimit = l; }, Number(limit));
report.start.heapMB = (await stats()).heapMB;
report.start.rssMB = rssMB();
console.log(`Start: Oberfläche ${report.start.uiMs} ms, Kern ${report.start.kernelMs} ms, WASM ${report.start.heapMB} MB, RSS ${report.start.rssMB} MB`);

await page.evaluate(() => { const a = window.__werkcad; a.files.confirmDiscard = async () => true; return a.openExample(); });
await page.waitForFunction(() => !window.__werkcad.kernel.busy, null, { timeout: 60000 });

// Szenario: Bauteil öffnen, dann `rounds`-mal einen Wert ändern und auf das fertige Modell warten
async function scenario(name, setup, change, setupArg = null) {
  const pid = await page.evaluate(setup, setupArg);
  await page.evaluate((id) => window.__werkcad.openDoc(id), pid);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !window.__werkcad.kernel.busy, null, { timeout: 120000 });
  const before = await stats();
  const times = [], heap = [];
  for (let i = 0; i < rounds; i++) {
    if (i % 10 === 0) heap.push((await stats()).heapMB);
    times.push(await page.evaluate(async ([pid, i, change]) => {
      const a = window.__werkcad, p = a.doc(pid), t = performance.now();
      a.edit("Messung", () => new Function("p", "i", change)(p, i));
      await new Promise((r) => setTimeout(r, 100));
      while (a.kernel.busy) await new Promise((r) => setTimeout(r, 10));
      return Math.round(performance.now() - t);
    }, [pid, i, change]));
  }
  const after = await stats();
  const r = { name, medianMs: median(times), maxMs: Math.max(...times), heapBeforeMB: before.heapMB, heapAfterMB: after.heapMB, heapEvery10: heap, rssMB: rssMB(), recycles: await page.evaluate(() => window.__werkcad.kernel.recycles ?? 0), cache: after };
  report.scenarios.push(r);
  console.log(`${name}: Median ${r.medianMs} ms, max ${r.maxMs} ms, WASM ${r.heapBeforeMB} → ${r.heapAfterMB} MB (je 10: ${heap.join("/")}), RSS ${r.rssMB} MB, Neustarts ${r.recycles}`);
}

await scenario("Grundplatte", () => "beispiel_platte", "p.params[0].expr = String(300 + i)");
for (const [gen, key] of [["treppe", "height"], ["gelaender", "fall"]]) {
  const base = Number(GENERATORS[gen].schema.find((s) => s.key === key).default);
  await scenario(`Generator ${gen}`, (gen) => {
    const a = window.__werkcad;
    const d = a.newPart("Messung " + gen);
    a.edit("Generator", () => d.features.push({ id: "g1", type: "generator", gen, name: gen, params: {} }));
    return d.id;
  }, `p.features[0].params.${key} = String(${base} + 10 * i)`, gen);
}

console.log(errors.length ? "Fehler im Browser:\n" + errors.join("\n") : "keine Fehler im Browser");
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
await browser.close();
srv.close();
process.exit(errors.length ? 1 : 0);
