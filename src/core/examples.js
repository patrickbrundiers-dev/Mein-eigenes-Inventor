// Vorlagen und Beispielprojekt
import { catalogToDims } from "./sections.js";

let counter = 0;
export const uid = (prefix = "x") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const num = (e, fb) => (Number.isFinite(Number(e)) ? Number(e) : fb);

/** Rechteck-Skizze mit Bemaßung (Breite/Höhe als Ausdruck) und fixierter Ecke */
export function rectSketchFeature(id, plane, offset, x, y, w, h, name = "Skizze") {
  const W = num(w, 100), H = num(h, 50);
  return {
    id, type: "sketch", name, plane: { ref: plane }, offset: String(offset),
    points: [
      { id: id + "a", x, y }, { id: id + "b", x: x + W, y },
      { id: id + "c", x: x + W, y: y + H }, { id: id + "d", x, y: y + H },
    ],
    entities: [
      { id: id + "l1", type: "line", p1: id + "a", p2: id + "b" },
      { id: id + "l2", type: "line", p1: id + "b", p2: id + "c" },
      { id: id + "l3", type: "line", p1: id + "c", p2: id + "d" },
      { id: id + "l4", type: "line", p1: id + "d", p2: id + "a" },
    ],
    constraints: [
      { id: id + "k1", type: "horizontal", e: id + "l1" },
      { id: id + "k2", type: "horizontal", e: id + "l3" },
      { id: id + "k3", type: "vertical", e: id + "l2" },
      { id: id + "k4", type: "vertical", e: id + "l4" },
      { id: id + "k5", type: "fix", p: id + "a", x, y },
      { id: id + "m1", type: "length", e: id + "l1", value: String(w), labelOffset: -12 },
      { id: id + "m2", type: "length", e: id + "l2", value: String(h), labelOffset: 12 },
    ],
  };
}

export function newPart(name = "Bauteil") {
  return { id: uid("p"), kind: "part", name, material: "S235", color: null, params: [], features: [], description: "", number: "" };
}
export function newAssembly(name = "Baugruppe") {
  return { id: uid("a"), kind: "assembly", name, components: [], description: "", number: "" };
}
export function newDrawing(name = "Zeichnung", source = null) {
  return {
    id: uid("d"), kind: "drawing", name,
    sheet: { format: "A3", orientation: "quer" },
    title: { benennung: name, nummer: "", werkstoff: "", ersteller: "", firma: "", datum: new Date().toLocaleDateString("de-DE"), massstab: "1:1", revision: "A", toleranz: "ISO 2768-m" },
    source, views: [], dims: [], notes: [],
  };
}

export function newProject(name = "Neues Projekt") {
  return { format: "werkcad", version: 1, name, docs: [], created: new Date().toISOString() };
}

/** Beispielprojekt: Grundplatte, Rahmen aus Quadratrohr, Rohr mit Gehrung, Baugruppe, Zeichnung */
export function exampleProject() {
  const prj = newProject("Beispiel Schweißrahmen");

  const plate = newPart("Grundplatte");
  plate.id = "beispiel_platte";
  plate.number = "BG-100-01";
  plate.params = [
    { name: "Länge", expr: "300", comment: "Plattenlänge" },
    { name: "Breite", expr: "200", comment: "" },
    { name: "Dicke", expr: "10", comment: "Blechdicke" },
    { name: "Rand", expr: "25", comment: "Abstand Bohrung zum Rand" },
  ];
  const s1 = rectSketchFeature("ps1", "XY", "0", 0, 0, "Länge", "Breite", "Skizze Kontur");
  const holes = {
    id: "ps2", type: "sketch", name: "Skizze Bohrungen", plane: { ref: "XY" }, offset: "Dicke",
    points: [
      { id: "o", x: 0, y: 0 },
      { id: "h1", x: 25, y: 25 }, { id: "h2", x: 275, y: 25 }, { id: "h3", x: 275, y: 175 }, { id: "h4", x: 25, y: 175 },
    ],
    entities: [
      { id: "ref", type: "point", p: "o", construction: true },
      { id: "pt1", type: "point", p: "h1" }, { id: "pt2", type: "point", p: "h2" }, { id: "pt3", type: "point", p: "h3" }, { id: "pt4", type: "point", p: "h4" },
    ],
    constraints: [
      { id: "fx", type: "fix", p: "o", x: 0, y: 0 },
      { id: "d1", type: "distance", p: "o", q: "h1", dir: "h", value: "Rand" },
      { id: "d2", type: "distance", p: "o", q: "h1", dir: "v", value: "Rand" },
      { id: "d3", type: "distance", p: "h1", q: "h2", dir: "h", value: "Länge-2*Rand" },
      { id: "d4", type: "distance", p: "h1", q: "h4", dir: "v", value: "Breite-2*Rand" },
      { id: "c1", type: "horizontal", p: "h1", q: "h2" },
      { id: "c2", type: "vertical", p: "h2", q: "h3" },
      { id: "c3", type: "horizontal", p: "h3", q: "h4" },
      { id: "c4", type: "vertical", p: "h4", q: "h1" },
    ],
  };
  plate.features = [
    s1,
    { id: "pe1", type: "extrude", name: "Extrusion Platte", sketch: "ps1", distance: "Dicke", mode: "normal", op: "join" },
    holes,
    { id: "ph1", type: "hole", name: "Bohrungen M10", sketch: "ps2", diameter: "11", extent: "through", direction: "reverse", sink: "none" },
    { id: "pf1", type: "fillet", name: "Eckenrundung", mode: "dir", dir: "Z", radius: "15" },
  ];

  const frame = newPart("Rahmen");
  frame.id = "beispiel_rahmen";
  frame.number = "BG-100-02";
  frame.params = [
    { name: "RahmenL", expr: "1000", comment: "Außenmaß Länge (Mittellinie)" },
    { name: "RahmenH", expr: "600", comment: "Höhe" },
  ];
  const fs = rectSketchFeature("fs1", "XZ", "0", 0, 0, "RahmenL", "RahmenH", "Skizze Rahmen");
  // Mittelstrebe
  fs.points.push({ id: "fs1m1", x: 500, y: 0 }, { id: "fs1m2", x: 500, y: 600 });
  fs.entities.push({ id: "fs1l5", type: "line", p1: "fs1m1", p2: "fs1m2" });
  fs.constraints.push(
    { id: "fs1k6", type: "vertical", e: "fs1l5" },
    { id: "fs1k7", type: "pointOnLine", p: "fs1m1", e: "fs1l1" },
    { id: "fs1k8", type: "pointOnLine", p: "fs1m2", e: "fs1l3" },
    { id: "fs1m3", type: "distance", p: "fs1a", q: "fs1m1", dir: "h", value: "RahmenL/2" },
  );
  frame.features = [
    fs,
    { id: "ff1", type: "frame", name: "Rahmen 40x40", sketch: "fs1", section: "vierkant", dims: catalogToDims("vierkant", "40x3"), corner: "gehrung", align: "mitte", rotation: "0" },
  ];

  const tube = newPart("Rohr mit Gehrung");
  tube.id = "beispiel_rohr";
  tube.number = "BG-100-03";
  tube.material = "1.4301";
  tube.features = [
    { id: "tp1", type: "profile", name: "Rundrohr", section: "rohr", dims: catalogToDims("rohr", "48.3x2.6"), length: "400", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "30", miterEnd: "0", miterAxis: "v" },
    { id: "ts1", type: "sketch", name: "Skizze Querbohrung", plane: { ref: "XY" }, offset: "0", points: [{ id: "q1", x: 200, y: 0 }], entities: [{ id: "qp", type: "point", p: "q1" }], constraints: [{ id: "qf", type: "fix", p: "q1", x: 200, y: 0 }] },
    { id: "th1", type: "hole", name: "Querbohrung", sketch: "ts1", diameter: "13", extent: "through", direction: "both" },
  ];

  const asm = newAssembly("Gestell");
  asm.id = "beispiel_bg";
  asm.number = "BG-100";
  asm.components = [
    { id: "c1", part: "beispiel_rahmen", name: "Rahmen", pos: [0, 0, 20], rot: [0, 0, 0] },
    { id: "c2", part: "beispiel_platte", name: "Grundplatte links", pos: [-150, -100, 0], rot: [0, 0, 0] },
    { id: "c3", part: "beispiel_platte", name: "Grundplatte rechts", pos: [850, -100, 0], rot: [0, 0, 0] },
    { id: "c4", part: "beispiel_rohr", name: "Rohr", pos: [300, -150, 400], rot: [0, 0, 0] },
  ];

  const drw = newDrawing("Zeichnung Grundplatte", { kind: "part", id: "beispiel_platte" });
  drw.id = "beispiel_zeichnung";
  drw.title.benennung = "Grundplatte";
  drw.title.nummer = "BG-100-01";
  drw.title.werkstoff = "S235JR";
  drw.title.massstab = "1:2";
  drw.views = [
    { id: "v1", type: "front", x: 120, y: 190, scale: 0.5, hidden: true, label: "" },
    { id: "v2", type: "top", x: 120, y: 120, scale: 0.5, hidden: true, label: "" },
    { id: "v3", type: "left", x: 260, y: 190, scale: 0.5, hidden: true, label: "" },
    { id: "v4", type: "iso", x: 330, y: 95, scale: 0.3, hidden: false, label: "" },
  ];
  prj.docs.push(plate, frame, tube, asm, drw);
  return prj;
}
