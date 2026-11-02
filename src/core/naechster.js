// „Nächster Schritt“ (Q6): kleine Kachel im 3D-Fenster bzw. auf dem leeren Blatt, die bei einem leeren Dokument
// oder einer gerade fertigen Skizze die naheliegenden Befehle anbietet. Reine Rechnung; die Knöpfe sind Menüband-ids.
import { sketchRefs } from "./featurerefs.js";

/**
 * @param {{ mode: string, doc: object|null }} s
 * @returns {{ key: string, title: string, text: string, items: { id: string, label: string, icon: string }[] }|null}
 */
export function nextSteps({ mode, doc }) {
  if (!doc) return null;
  if (mode === "part" && doc.kind === "part") {
    const feats = (doc.features || []).filter((f) => !f.suppressed);
    if (!feats.length) return {
      key: "leer", title: "Leeres Bauteil", text: "Womit soll es losgehen?",
      items: [
        { id: "sketch", label: "Skizze starten", icon: "sketch" },
        { id: "profile", label: "Profil / Rohr", icon: "profile" },
        { id: "kantteil", label: "Blech-Kantteil", icon: "kantteil" },
        { id: "normteil", label: "Normteil", icon: "normteil" },
      ] };
    const last = feats[feats.length - 1];
    if (last.type === "sketch" && !feats.some((f) => sketchRefs(f).includes(last.id))) {
      const ents = (last.entities || []).filter((e) => !e.construction);
      if (!ents.length) return null;
      const closed = ents.some((e) => e.type === "circle" || e.type === "ellipse") || isClosedLoop(ents);
      const lines = ents.some((e) => e.type === "line" || e.type === "arc");
      const holes = (last.entities || []).some((e) => e.type === "circle" || (e.type === "point" && !e.construction));
      const items = [];
      if (closed) items.push({ id: "extrude", label: "Extrudieren", icon: "extrude" }, { id: "revolve", label: "Drehen", icon: "revolve" });
      if (lines) items.push({ id: "frame", label: "Rahmen aus Linien", icon: "frame" });
      if (holes && feats.length > 1) items.push({ id: "hole", label: "Bohrung", icon: "hole" });
      if (!items.length) return null;
      return { key: "skizze:" + last.id, title: `${last.name || "Skizze"} ist fertig`, text: closed ? "Daraus einen Körper machen:" : "Offene Linien – als Profilrahmen:", items: items.slice(0, 4) };
    }
    return null;
  }
  if (mode === "assembly" && doc.kind === "assembly") {
    if ((doc.components || []).length) return null;
    return {
      key: "leer", title: "Leere Baugruppe", text: "Teile hinzufügen oder einen Generator starten:",
      items: [
        { id: "place", label: "Platzieren", icon: "place" },
        { id: "newPartInAsm", label: "Neues Bauteil", icon: "part" },
        { id: "gelaender", label: "Geländer", icon: "gelaender" },
        { id: "treppe", label: "Treppe", icon: "treppe" },
      ] };
  }
  if (mode === "drawing" && doc.kind === "drawing") {
    if ((doc.views || []).length) return null;
    return {
      key: "leer", title: "Leeres Blatt", text: "Ansichten vom Modell ableiten:",
      items: [
        { id: "dv_base", label: "Grundansichten", icon: "baseViews" },
        { id: "dv_add", label: "Ansicht hinzufügen", icon: "plus" },
      ] };
  }
  return null;
}

/** Linien/Bögen bilden einen geschlossenen Zug: jeder Endpunkt kommt genau zweimal vor */
function isClosedLoop(ents) {
  const segs = ents.filter((e) => e.type === "line" || e.type === "arc");
  if (segs.length < 2) return false;
  const count = new Map();
  for (const e of segs) for (const p of [e.p1, e.p2]) { if (p == null) return false; count.set(p, (count.get(p) || 0) + 1); }
  return [...count.values()].every((n) => n === 2);
}
