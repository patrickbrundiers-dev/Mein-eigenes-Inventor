// Bild in der Skizze (FU2)
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageCorners, newImageEntity, rescaleImage, pruneImages } from "../src/core/skizzenbild.js";

test("Ecken, Seitenverhältnis, Maßstab über Strecke", () => {
  const e = newImageEntity("i", "p", "b1", [400, 300], 200);
  assert.deepEqual([e.w, e.h, e.opacity], [200, 150, 0.5]);
  assert.deepEqual(imageCorners(e, { x: 10, y: 20 }), [[10, 20], [210, 20], [210, 170], [10, 170]]);
  const r = imageCorners({ ...e, angle: 90 }, { x: 0, y: 0 }).map((q) => q.map((v) => Math.round(v * 1e9) / 1e9 || 0));
  assert.deepEqual(r, [[0, 0], [0, 200], [-150, 200], [-150, 0]]);
  assert.deepEqual(rescaleImage(e, 50, 100), { w: 400, h: 300 });
  assert.equal(rescaleImage(e, 0, 100), null);
  assert.equal(imageCorners({ w: 0, h: 1 }, { x: 0, y: 0 }), null);
});

test("unbenutzte Bilder fallen beim Speichern weg", () => {
  const prj = { images: { a: { src: "x" }, b: { src: "y" } }, docs: [{ features: [{ entities: [{ type: "image", img: "a" }] }] }] };
  assert.equal(pruneImages(prj), 1);
  assert.deepEqual(Object.keys(prj.images), ["a"]);
  prj.docs = [];
  pruneImages(prj);
  assert.equal("images" in prj, false);
});
