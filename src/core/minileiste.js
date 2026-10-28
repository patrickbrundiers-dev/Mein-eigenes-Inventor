// Mini-Werkzeugleiste an der Auswahl (src/ui/minibar.js): welche Befehle zu welcher Auswahl passen. Ohne DOM.

/** Befehle zur Auswahl (ohne DOM, damit im Test prüfbar) */
export function miniBarItems(hits) {
  if (!hits?.length) return [];
  const edges = hits.every((x) => x.kind === "edge"), faces = hits.every((x) => x.kind === "face");
  const plane = faces && hits.length === 1 && hits[0].info?.type === "PLANE";
  const items = [];
  if (edges) items.push({ id: "fillet", label: "Rundung", icon: "fillet" }, { id: "chamfer", label: "Fase", icon: "chamfer" }, { id: "naht", label: "Schweißnaht", icon: "naht" });
  if (plane) items.push({ id: "faceSketch", label: "Skizze auf Fläche", icon: "sketch" }, { id: "normal", label: "Normal zur Fläche", icon: "plane" });
  if (faces) items.push({ id: "shell", label: "Wandung", icon: "shell" });
  items.push({ id: "measure", label: "Messen", icon: "dimension" }, { id: "fitSel", label: "Auswahl zeigen", icon: "fit" });
  return items;
}
