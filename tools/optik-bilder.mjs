// Bildvergleich der Oberfläche (OP5): Hauptansichten hell und dunkel als Bildschirmfotos.
// Vorher `npm run build`. Aufruf: node tools/optik-bilder.mjs [ausgabeordner] [präfix]
// Zwei Läufe (z. B. main und Zweig) mit unterschiedlichem Präfix ergeben Vorher/Nachher-Paare.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const outDir = path.resolve(process.argv[2] || "optik-out");
const prefix = process.argv[3] || "";
fs.mkdirSync(outDir, { recursive: true });
const port = 4197;
const srv = await serve(port);
const launchOpts = { headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };
let browser;
try { browser = await chromium.launch({ ...launchOpts, channel: "chrome" }); }
catch { browser = await chromium.launch({ ...launchOpts, executablePath: process.env.CHROME_PATH }); }
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => !!window.__werkcad, null, { timeout: 30000 });
await page.evaluate(() => window.__werkcad.kernel.ready);

const idle = () => page.waitForFunction(() => !window.__werkcad.kernel.busy, null, { timeout: 60000 }).then(() => page.waitForTimeout(600));
const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(outDir, `${prefix}${name}.png`) }); };
const app = (fn, arg) => page.evaluate(fn, arg);
const tab = (id) => app((id) => { const r = window.__werkcad.ribbon; r.tab = id; r.render(); }, id);

for (const theme of ["hell", "dunkel"]) {
  await app((t) => window.__werkcad.prefs.set("darstellung.schema", t), theme);
  await app(() => { const a = window.__werkcad; a.files.confirmDiscard = async () => true; a.setMode("start"); });
  await shot(`${theme}-1-start`);
  await app(() => window.__werkcad.openExample());
  await idle();
  await app(() => window.__werkcad.openDoc("beispiel_rahmen"));
  await idle();
  await shot(`${theme}-2-bauteil`);
  await tab("ansicht");
  await shot(`${theme}-3-ansicht-symbole`);
  const asm = await app(() => window.__werkcad.project.docs.find((d) => d.kind === "assembly")?.id);
  if (asm) { await app((id) => window.__werkcad.openDoc(id), asm); await idle(); await shot(`${theme}-4-baugruppe`); }
  const drw = await app(() => window.__werkcad.project.docs.find((d) => d.kind === "drawing")?.id);
  if (drw) { await app((id) => window.__werkcad.openDoc(id), drw); await idle(); await shot(`${theme}-5-zeichnung`); }
  await app(() => window.__werkcad.commands.exec("app.settings"));
  await shot(`${theme}-6-einstellungen`);
  await page.keyboard.press("Escape");
}
console.log(errors.length ? "Fehler im Browser:\n" + errors.join("\n") : `Bilder in ${outDir}`);
await browser.close();
srv.close();
process.exit(errors.length ? 1 : 0);
