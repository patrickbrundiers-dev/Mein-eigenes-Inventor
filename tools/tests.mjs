// Testlauf (SY6): alle test/*.test.mjs, ohne von Hand gepflegte Liste.
// Aufruf: node tools/tests.mjs [core|kernel|alle] [weitere Optionen für node --test]
//   core   – ohne Geometrie-Kern (schnell)
//   kernel – Tests mit OpenCascade (replicad), brauchen --stack-size
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const [which = "alle", ...extra] = process.argv.slice(2);
const files = fs.readdirSync("test").filter((f) => f.endsWith(".test.mjs")).sort().map((f) => "test/" + f);
// Geometrie-Tests erkennt man am Laden von OpenCascade
const isKernel = (f) => /replicad-opencascadejs/.test(fs.readFileSync(f, "utf8"));
const pick = which === "core" ? files.filter((f) => !isKernel(f)) : which === "kernel" ? files.filter(isKernel) : files;
if (!pick.length) { console.error("Keine Tests für " + which); process.exit(1); }
const r = spawnSync(process.execPath, ["--stack-size=8000", "--test", ...extra, ...pick], { stdio: "inherit" });
process.exit(r.status ?? 1);
