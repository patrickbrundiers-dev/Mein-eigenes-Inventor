// Bilder der Farbthemen und Fensteraufbauten (SolidCraft-Abgleich Runde 2). Vorher `npm run build`.
// Aufruf: node tools/optik-themen.mjs [ausgabeordner] [präfix]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const outDir = path.resolve(process.argv[2] || "optik-out");
const prefix = process.argv[3] || "";
fs.mkdirSync(outDir, { recursive: true });
const port = 4196;
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
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(outDir, `${prefix}${name}.png`) }); };
const app = (fn, arg) => page.evaluate(fn, arg);
const set = (k, v) => app(([k, v]) => window.__werkcad.prefs.set(k, v), [k, v]);

await app(() => window.__werkcad.openExample());
await idle();
await app(() => window.__werkcad.openDoc("beispiel_rahmen"));
await idle();
const themes = (process.env.THEMEN || "hell,dunkel,graphite,nord,tokyo-night,gruvbox-dark,blueprint,high-contrast,solarized-light,gruvbox-light,clay,cupertino").split(",");
for (const t of themes) { await set("darstellung.schema", t); await shot(`thema-${t}`); }
await set("darstellung.schema", "hell");
await set("oberflaeche.anordnung", "kompakt"); await shot("aufbau-kompakt");
await set("oberflaeche.nurSymbole", true); await shot("aufbau-kompakt-nur-symbole");
await set("oberflaeche.anordnung", "schwebend"); await shot("aufbau-schwebend-nur-symbole");
await set("oberflaeche.nurSymbole", false);
await set("darstellung.eigenerHintergrund", true); await set("darstellung.hintergrund", "#ffffff"); await shot("hintergrund-weiss");
await set("darstellung.eigenerHintergrund", false);
await set("darstellung.schema", "nord");
await app(() => window.__werkcad.commands.exec("app.settings"));
await page.waitForTimeout(300);
await page.locator(".set-cat", { hasText: "Darstellung" }).first().click();
await shot("einstellungen-themen");
await page.keyboard.press("Escape");
await set("darstellung.schema", "hell");
if (errors.length) console.log("Fehler:", errors.join(" | "));
console.log("Bilder in", outDir);
await browser.close();
srv.close?.();
process.exit(0);
