// Flächenmodellierung (SolidCraft-Abgleich E2): Arten des Features »freiflaeche« mit Bezeichnung, Hilfe und Startwerten.
// Eine Liste für Menüband, Befehlssuche, Befehlshilfe und Eigenschaften.

export const FF_ARTEN = [
  { art: "extrusion", label: "Flächen-Extrusion", help: "Offene oder geschlossene Skizzenkurve als Fläche senkrecht zur Skizzenebene ziehen.", def: { sketch: "", distance: "50" }, need: ["sketch", "distance"] },
  { art: "rotation", label: "Flächen-Rotation", help: "Skizzenkurve um eine Achse der Skizze drehen – ergibt eine Drehfläche.", def: { sketch: "", axis: "y", angle: "360" }, need: ["sketch", "axis", "angle"] },
  { art: "sweep", label: "Flächen-Sweep", help: "Profilkurve entlang eines Pfads (Skizze oder 3D-Skizze) führen, als Fläche.", def: { sketch: "", path: "" }, need: ["sketch", "path"] },
  { art: "loft", label: "Flächen-Loft", help: "Glatte Fläche über zwei oder mehr Kurven.", def: { sections: [] }, need: ["sections"] },
  { art: "regel", label: "Regelfläche", help: "Gerade Verbindung zwischen zwei oder mehr Kurven (Regelfläche).", def: { sections: [] }, need: ["sections"] },
  { art: "verbindung", label: "Verbindungsfläche", help: "Glatter Übergang zwischen genau zwei Kurven.", def: { sections: [] }, need: ["sections"] },
  { art: "begrenzung", label: "Begrenzungsfläche", help: "Fläche aus zwei bis vier Randkurven, die zusammen einen geschlossenen Rand bilden.", def: { sections: [] }, need: ["sections"] },
  { art: "fuellung", label: "Patch / Begrenzungsfüllung", help: "Geschlossene Randkurve (Skizze oder 3D-Skizze) mit einer glatten Fläche füllen.", def: { sketch: "" }, need: ["sketch"] },
  { art: "offset", label: "Offsetfläche", help: "Gewählte Fläche(n) im Abstand versetzt als neue Fläche.", def: { faces: [], distance: "5" }, need: ["faces", "distance"] },
  { art: "kopie", label: "Fläche kopieren", help: "Gewählte Flächen eines Körpers als eigene Flächenkörper übernehmen.", def: { faces: [] }, need: ["faces"] },
  { art: "untrim", label: "Trimmen aufheben", help: "Gewählte Fläche ohne Ausschnitte und Ränder auf die volle Grundfläche zurücksetzen.", def: { faces: [] }, need: ["faces"] },
  { art: "teilen", label: "Fläche teilen", help: "Flächen oder Körper entlang der Kurven einer Skizze (senkrecht zur Skizzenebene) teilen.", def: { sketch: "" }, need: ["sketch"] },
  { art: "naehen", label: "Nähen", help: "Flächenkörper an gemeinsamen Kanten zusammennähen; geschlossen entsteht ein Volumenkörper.", def: { solid: true }, need: ["solid"] },
  { art: "aufheben", label: "Verbund aufheben", help: "Letzten Körper (oder gewählte) in einzelne Flächenkörper zerlegen.", def: {}, need: [] },
  { art: "umkehren", label: "Normale umkehren", help: "Vorder- und Rückseite der Flächenkörper tauschen.", def: {}, need: [] },
  { art: "verrundung", label: "Flächenverrundung", help: "Flächenkörper an ihrer gemeinsamen Kante mit Radius verrunden.", def: { radius: "5" }, need: ["radius"] },
  { art: "dicke", label: "Dicke vergeben", help: "Flächenkörper zu Volumenkörpern aufdicken (negativ = andere Seite).", def: { distance: "2" }, need: ["distance"] },
];
export const ffArt = (art) => FF_ARTEN.find((a) => a.art === art) || FF_ARTEN[0];
