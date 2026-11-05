// SolidCraft-Abgleich: weitere Arbeitselement-Arten
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDatums } from "../src/core/datums.js";

const ev = (s) => Number(s);
const near = (a, b) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-9, `${a} ≠ ${b}`));

test("Ebene durch Achse senkrecht zu Ebene, Punkt aus zwei Achsen und auf Pfad", () => {
  const r = resolveDatums([
    { id: "e", type: "arbeitsebene", mode: "senkrecht", axis: "X", base: "XY" },
    { id: "p", type: "arbeitspunkt", mode: "zweiAchsen", axis: "X", axis2: "Y" },
    { id: "q", type: "arbeitspunkt", mode: "kurve", curve: { pts: [[0, 0, 0], [100, 0, 0]] }, pos: "25" },
  ], ev);
  assert.deepEqual(r.errors, {});
  const n = r.map.get("e").frame?.normal || r.map.get("e").normal;
  assert.ok(Math.abs(Math.abs(n[1]) - 1) < 1e-9, "Normale ±Y " + n);
  near(r.map.get("p").p, [0, 0, 0]);
  near(r.map.get("q").p, [25, 0, 0]);
});
