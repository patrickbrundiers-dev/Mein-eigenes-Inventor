// Komponentenfarben (FU16)
import { test } from "node:test";
import assert from "node:assert/strict";
import { distinctColor, colorMap } from "../src/core/komponentenfarben.js";

test("Farben: gültig, unterscheidbar, gleiche Bauteile gleich", () => {
  const cols = Array.from({ length: 24 }, (_, i) => distinctColor(i));
  assert.ok(cols.every((c) => /^#[0-9a-f]{6}$/.test(c)));
  assert.equal(new Set(cols).size, 24);
  const rgb = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  for (let i = 1; i < cols.length; i++) {
    const [a, b] = [rgb(cols[i - 1]), rgb(cols[i])];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 40, `Nachbarn ${i - 1}/${i} zu ähnlich`);
  }
  const m = colorMap(["p1", "p2", "p1", "p3"]);
  assert.deepEqual([...m.keys()], ["p1", "p2", "p3"]);
  assert.equal(m.get("p1"), distinctColor(0));
});
