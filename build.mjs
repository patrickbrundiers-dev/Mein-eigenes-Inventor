// Baut die Oberfläche (dist/) mit esbuild
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dev = process.argv.includes("--dev");
const out = "dist";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  sourcemap: dev ? "inline" : "linked",
  minify: !dev,
  legalComments: "linked",
  logLevel: "info",
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
  // Node-Zweige im OpenCascade-Lader werden im Browser nie ausgeführt
  external: ["fs", "path", "module", "url", "crypto", "worker_threads", "perf_hooks", "os", "child_process", "node:*"],
  logOverride: { "empty-import-meta": "silent" },
};

await esbuild.build({ ...common, entryPoints: ["src/ui/main.js"], outfile: path.join(out, "app.js") });
await esbuild.build({ ...common, entryPoints: ["src/kernel/worker.js"], outfile: path.join(out, "worker.js") });

for (const f of ["index.html", "styles.css"]) fs.copyFileSync(path.join("src", f), path.join(out, f));
fs.copyFileSync(require.resolve("replicad-opencascadejs/wasm"), path.join(out, "replicad_single.wasm"));

const size = (f) => (fs.statSync(path.join(out, f)).size / 1024 / 1024).toFixed(1) + " MB";
console.log(`dist/ fertig: app.js ${size("app.js")}, worker.js ${size("worker.js")}, wasm ${size("replicad_single.wasm")}`);
