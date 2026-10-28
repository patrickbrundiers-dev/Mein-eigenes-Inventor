// Arbeitselemente durch Anklicken erzeugen (wie Inventor: Geometrie wählen, die Art ergibt sich aus der Auswahl).
// Reine Rechnung: aus der Liste gewählter Bezüge die Art und die Feature-Daten ableiten.
import { v3 } from "./geom.js";
import { polylineParam } from "./datums.js";

/**
 * Gewählter Bezug: { kind: "plane"|"axis"|"point"|"cyl"|"curve", ref, at?, label }
 *  plane: "XY"/"XZ"/"YZ", Arbeitsebenen-ID oder {o, n, x} (ebene Modellfläche)
 *  axis:  "X"/"Y"/"Z", Arbeitsachsen-ID oder {p, d, a?, b?, circle?} (gerade Kante oder Kreiskante)
 *  point: "O", Arbeitspunkt-ID oder {p} (Modellecke)
 *  cyl:   {p, d, r} Zylinderfläche, at = angeklickter Punkt
 *  curve: {pts} gekrümmte Kante, at = angeklickter Punkt
 */
const round = (x) => Math.round(x * 1e6) / 1e6;
const fmt = (x) => String(round(x));

/** Kurzbezeichnung, was als Nächstes gewählt werden kann */
export const PICK_HINT = Object.freeze({
  arbeitsebene: "Ebene, Fläche, Kante, Achse, Punkt oder Zylinder anklicken",
  arbeitsachse: "Kante, Zylinder, Kreis, zwei Punkte, zwei Ebenen oder Ebene und Punkt anklicken",
  arbeitspunkt: "Ecke, Kreis, Kante, zwei Punkte, Achse und Ebene oder drei Ebenen anklicken",
});

/**
 * Art aus der Auswahl ableiten.
 * → { feature: {type, mode, …} | null, complete: bool (keine Erweiterung mehr möglich), label: Text der Art, need: Text, was fehlt }
 */
export function inferDatum(type, refs) {
  const list = (refs || []).filter(Boolean);
  const sig = list.map((r) => r.kind).join(",");
  const R = (i) => list[i]?.ref;
  const out = (mode, data, label, complete = true) => ({ feature: { type, mode, ...data }, complete, label, need: complete ? "" : "Weitere Bezüge möglich – Eingabe oder OK übernimmt" });
  const need = (text) => ({ feature: null, complete: false, label: "", need: text });
  if (!list.length) return need(PICK_HINT[type]);
  if (type === "arbeitsebene") {
    switch (sig) {
      case "plane": return out("versatz", { base: R(0), distance: typeof R(0) === "object" ? "0" : "20" }, "Versatz zu Ebene", false);
      case "plane,plane": return out("mitte", { plane1: R(0), plane2: R(1) }, "Mittelebene");
      case "plane,point": return out("parallelPunkt", { base: R(0), point: R(1) }, "Parallel durch Punkt");
      case "point,plane": return out("parallelPunkt", { base: R(1), point: R(0) }, "Parallel durch Punkt");
      case "plane,axis": return out("winkel", { base: R(0), axis: R(1), angle: "90" }, "Im Winkel um Achse");
      case "axis,plane": return out("winkel", { base: R(1), axis: R(0), angle: "90" }, "Im Winkel um Achse");
      case "axis,point": return out("achsePunkt", { axis: R(0), point: R(1) }, "Durch Achse und Punkt");
      case "point,axis": return out("normal", { axis: R(1), point: R(0) }, "Senkrecht zu Achse durch Punkt");
      case "axis,axis": return out("zweiAchsen", { axis: R(0), axis2: R(1) }, "Durch zwei Achsen");
      case "point,point,point": return out("punkte", { p1: R(0), p2: R(1), p3: R(2) }, "Durch drei Punkte");
      case "curve": return out("kurve", { curve: R(0), pos: fmt(100 * polylineParam(R(0).pts, list[0].at || R(0).pts[0])) }, "Senkrecht zur Kante");
      case "cyl": {
        const c = R(0), k = v3.norm(c.d), w = v3.sub(list[0].at || v3.add(c.p, [1, 0, 0]), c.p);
        return out("tangential", { cyl: c, start: v3.norm(v3.sub(w, v3.mul(k, v3.dot(w, k)))).map(round), angle: "0" }, "Tangential an Zylinder", false);
      }
      case "cyl,plane": return out("tangential", { cyl: R(0), base: R(1), side: "+" }, "Tangential, parallel zu Ebene");
      case "axis": return need("Zweite Achse, Punkt oder Ebene wählen");
      case "point": case "point,point": return need("Weitere Punkte (drei) oder eine Achse wählen");
      default: return need("Diese Kombination geht nicht – Esc und neu wählen");
    }
  }
  if (type === "arbeitsachse") {
    switch (sig) {
      case "axis": {
        const r = R(0);
        if (typeof r === "object") return out(r.circle ? "kreis" : "kante", { ref: { p: r.p, d: r.d } }, r.circle ? "Durch Kreismitte" : "Auf Kante");
        return need("Punkt wählen, durch den die Parallele geht");
      }
      case "cyl": return out("zylinder", { ref: { p: R(0).p, d: R(0).d } }, "Durch Zylinderachse");
      case "point,point": return out("punkte", { p1: R(0), p2: R(1) }, "Durch zwei Punkte");
      case "plane,plane": return out("schnitt", { plane1: R(0), plane2: R(1) }, "Schnitt zweier Ebenen");
      case "plane,point": return out("normalEbene", { plane: R(0), point: R(1) }, "Senkrecht zu Ebene durch Punkt");
      case "point,plane": return out("normalEbene", { plane: R(1), point: R(0) }, "Senkrecht zu Ebene durch Punkt");
      case "axis,point": return out("parallel", { dir: R(0), point: R(1) }, "Parallel durch Punkt");
      case "point,axis": return out("parallel", { dir: R(1), point: R(0) }, "Parallel durch Punkt");
      case "point": return need("Zweiten Punkt, Ebene oder Achse wählen");
      case "plane": return need("Zweite Ebene oder einen Punkt wählen");
      default: return need("Diese Kombination geht nicht – Esc und neu wählen");
    }
  }
  switch (sig) {
    case "point": return out("modell", { point: typeof R(0) === "object" ? { p: R(0).p } : R(0) }, "Punkt", false);
    case "point,point": return out("mitte", { p1: R(0), p2: R(1) }, "Mitte zwischen zwei Punkten");
    case "axis": {
      const r = R(0);
      if (typeof r === "object" && r.circle) return out("modell", { point: { p: r.p } }, "Kreismitte");
      if (typeof r === "object" && r.a && r.b) return out("modell", { point: { p: v3.mul(v3.add(r.a, r.b), 0.5).map(round) } }, "Kantenmitte");
      return need("Ebene wählen, die die Achse schneidet");
    }
    case "cyl": return out("modell", { point: { p: R(0).p } }, "Zylindermitte");
    case "axis,plane": return out("schnitt", { axis: R(0), plane: R(1) }, "Schnitt Achse mit Ebene");
    case "plane,axis": return out("schnitt", { axis: R(1), plane: R(0) }, "Schnitt Achse mit Ebene");
    case "plane,plane,plane": return out("dreiEbenen", { plane1: R(0), plane2: R(1), plane3: R(2) }, "Schnitt dreier Ebenen");
    case "plane": case "plane,plane": return need("Weitere Ebenen (drei) oder eine Achse wählen");
    default: return need("Diese Kombination geht nicht – Esc und neu wählen");
  }
}

/** Tangentiale Ebene parallel zu einer Ebene: Seite so wählen, dass sie beim angeklickten Punkt liegt */
export function tangentSide(cyl, planeNormal, at) {
  if (!at) return "+";
  return v3.dot(v3.sub(at, cyl.p), planeNormal) >= 0 ? "+" : "-";
}

/** Kreismitte und Normale aus drei Punkten eines Kreisbogens → { p, d, r } oder null */
export function circleFrom3(a, b, c) {
  const ab = v3.sub(b, a), ac = v3.sub(c, a), nn = v3.cross(ab, ac), l2 = v3.dot(nn, nn);
  if (l2 < 1e-12) return null;
  const p = v3.add(a, v3.mul(v3.add(v3.mul(v3.cross(nn, ab), v3.dot(ac, ac)), v3.mul(v3.cross(ac, nn), v3.dot(ab, ab))), 1 / (2 * l2)));
  return { p, d: v3.norm(nn), r: v3.dist(a, p) };
}

/** Bezüge, die das Arbeitselement f verwendet (für die Vorschau im 3D-Fenster): [{kind, ref}] */
export function datumRefsOf(f) {
  const out = [];
  const add = (kind, ref) => { if (ref != null && ref !== "" && !(kind === "axis" && (ref === "u" || ref === "v"))) out.push({ kind, ref }); };
  const m = f.mode;
  if (f.type === "arbeitsebene") {
    if (["versatz", "parallelPunkt", "winkel"].includes(m || "versatz")) add("plane", f.base || "XY");
    if (m === "tangential" && f.base) add("plane", f.base);
    if (m === "mitte") { add("plane", f.plane1); add("plane", f.plane2); }
    if (["winkel", "achsePunkt", "zweiAchsen", "normal"].includes(m)) add("axis", f.axis);
    if (m === "zweiAchsen") add("axis", f.axis2);
    if (["parallelPunkt", "achsePunkt", "normal"].includes(m)) add("point", f.point || "O");
    if (m === "punkte") { add("point", f.p1); add("point", f.p2); add("point", f.p3); }
    if (m === "tangential" && f.cyl) add("axis", { p: f.cyl.p, d: f.cyl.d });
    if (m === "kurve" && f.curve) add("curve", f.curve);
  } else if (f.type === "arbeitsachse") {
    if (m === "punkte" || !m) { add("point", f.p1); add("point", f.p2); }
    if (m === "schnitt") { add("plane", f.plane1); add("plane", f.plane2); }
    if (m === "normalEbene") { add("plane", f.plane); add("point", f.point || "O"); }
    if (m === "parallel") { add("axis", f.dir || "Z"); add("point", f.point || "O"); }
  } else {
    if (m === "mitte") { add("point", f.p1); add("point", f.p2); }
    if (m === "versatz") add("point", f.point || "O");
    if (m === "schnitt") { add("axis", f.axis); add("plane", f.plane); }
    if (m === "dreiEbenen") { add("plane", f.plane1); add("plane", f.plane2); add("plane", f.plane3); }
  }
  return out;
}
