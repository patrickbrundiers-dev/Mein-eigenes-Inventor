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
