// Bild in der Skizze (Fusion-Abgleich FU2): Foto oder Scan als Vorlage zum Nachzeichnen. Nur Anzeige –
// das Bild erzeugt keine Kontur. Entität { type: "image", p: Punkt-ID (linke untere Ecke), img: Bild-ID,
// w, h (mm), angle (Grad), opacity (0–1) }. Die Bilddaten liegen einmal im Projekt: project.images[id] = { src, name, px: [b, h] }.

/** Ecken [links unten, rechts unten, rechts oben, links oben] in Skizzenkoordinaten */
export function imageCorners(e, anchor) {
  if (!anchor || !(e.w > 0) || !(e.h > 0)) return null;
  const a = ((Number(e.angle) || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const T = (x, y) => [anchor.x + x * c - y * s, anchor.y + x * s + y * c];
  return [T(0, 0), T(e.w, 0), T(e.w, e.h), T(0, e.h)];
}

/** Neue Bildentität: Breite in mm, Höhe aus dem Seitenverhältnis */
export function newImageEntity(id, p, imgId, px, width) {
  const w = Number(width) > 0 ? Number(width) : 200;
  return { id, type: "image", p, img: imgId, w, h: Math.round((w * px[1] / px[0]) * 1000) / 1000, angle: 0, opacity: 0.5 };
}

/** Maßstab über eine bekannte Strecke: gemessen (mm im Bild) soll wirklich sein → neue Breite/Höhe */
export function rescaleImage(e, measured, real) {
  if (!(measured > 0) || !(real > 0)) return null;
  const k = real / measured;
  return { w: e.w * k, h: e.h * k };
}

/** Bilder, die keine Skizze mehr verwendet, aus project.images entfernen; gibt die Anzahl zurück */
export function pruneImages(project) {
  if (!project?.images) return 0;
  const used = new Set();
  for (const d of project.docs || []) for (const f of d.features || []) for (const e of f.entities || []) if (e.type === "image") used.add(e.img);
  let n = 0;
  for (const id of Object.keys(project.images)) if (!used.has(id)) { delete project.images[id]; n++; }
  if (!Object.keys(project.images).length) delete project.images;
  return n;
}

/**
 * Bild nachzeichnen (SolidCraft-Abgleich E5): Umrisse dunkler Bereiche (Grauwert < threshold) mit Marching Squares.
 * gray = Uint8Array W×H (Zeile für Zeile, oben zuerst). Rückgabe geschlossene Züge in Pixelkoordinaten [[u, v] …]
 * (u nach rechts, v nach unten), erster Punkt am Ende wiederholt; Züge mit weniger als minPts Punkten fallen weg.
 */
export function traceContours(gray, W, H, { threshold = 128, minPts = 8 } = {}) {
  // Rand mit »hell« auffüllen, damit alle Umrisse geschlossen sind
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && gray[y * W + x] < threshold;
  const segs = new Map(); // Anfangspunkt → Endpunkt (gerichtet, dunkel links)
  const key = (x, y) => `${x},${y}`;
  const add = (a, b) => segs.set(key(...a), b);
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    // Ecken der Zelle: Pixelmitten (x,y) (x+1,y) (x+1,y+1) (x,y+1)
    const tl = inside(x, y), tr = inside(x + 1, y), br = inside(x + 1, y + 1), bl = inside(x, y + 1);
    const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (c === 0 || c === 15) continue;
    // Kantenmitten (Pixelmitte + 0,5), doppelt gezählt für ganze Zahlen
    const T = [2 * x + 2, 2 * y + 1], R = [2 * x + 3, 2 * y + 2], B = [2 * x + 2, 2 * y + 3], L = [2 * x + 1, 2 * y + 2];
    switch (c) {
      case 1: add(L, B); break; case 2: add(B, R); break; case 3: add(L, R); break; case 4: add(R, T); break;
      case 5: add(L, T); add(R, B); break; case 6: add(B, T); break; case 7: add(L, T); break; case 8: add(T, L); break;
      case 9: add(T, B); break; case 10: add(T, R); add(B, L); break; case 11: add(T, R); break; case 12: add(R, L); break;
      case 13: add(R, B); break; case 14: add(B, L); break;
    }
  }
  const loops = [];
  while (segs.size) {
    const [k0] = segs.keys();
    const start = k0.split(",").map(Number), loop = [start];
    let k = k0;
    for (let guard = 0; guard < 1e7; guard++) {
      const nx = segs.get(k);
      if (!nx) break;
      segs.delete(k);
      loop.push(nx);
      k = key(...nx);
      if (k === k0) break;
    }
    if (loop.length > minPts && key(...loop.at(-1)) === k0) loops.push(loop.map(([u, v]) => [u / 2 - 0.5, v / 2 - 0.5]));
  }
  return loops;
}

/** Pixelkoordinaten des Bildes (px = [Breite, Höhe]) → Skizzenkoordinaten über die Bildecken [BL, BR, TR, TL] */
export function imageToSketch(corners, px, [u, v]) {
  const [BL, BR, , TL] = corners, s = (u + 0.5) / px[0], t = (v + 0.5) / px[1];
  return [TL[0] + s * (BR[0] - BL[0]) + t * (BL[0] - TL[0]), TL[1] + s * (BR[1] - BL[1]) + t * (BL[1] - TL[1])];
}
