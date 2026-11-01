// Geländer-Generator (MegaCAD-Abgleich M11): Pfosten mit automatischer Aufteilung, Handlauf auf den Pfosten
// (über Eck gegehrt), Ober-/Untergurt zwischen den Pfosten, Füllung (Staketen, Querstäbe, Blech, Glas, Kreuz mit
// oder ohne Ring, Rahmen mit Staketen), Fußplatten.
// Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage: Lauflinie auf dem Boden (z = 0) ab Ursprung entlang +X, Pfosten mittig auf der Linie. Über Eck: weitere
// Längen in »Läufe«, jede Ecke dreht um »Eckwinkel« (positiv = nach links). Höhe = Oberkante Handlauf.
// Hinweise nach üblicher Bauordnung: Höhe ≥ 900 mm (≥ 1100 mm bei Absturzhöhe > 12 m), Öffnungen ≤ 120 mm.

import { fieldError } from "./generror.js";
import { platePlan } from "./anschluss.js";
import { splitList } from "./expr.js";
import { holderSchema, holderDrop, holderParts, innerReach, entryDepth } from "./handlaufhalter.js";
import { orientRot, rotExtent } from "./orient.js";
import { normSchema, normRules, railingIssues } from "./gelaendernorm.js";
import { sectionGeometry } from "./sections.js";
import { bentChain } from "./biegeteil.js";
import { jointStations, splitPolyline, paramOf, arcLengths, pointAt, sleeveFor } from "./handlaufstoss.js";
import { mountSchema, mountConfig, topMount, sideMount, sideOffset, planeFace, slabFace, findMemberFace, findSideFace, findPlateFace, faceCoords, holesBelow, applyTargetHoles, overrideFor, mountCollisions, mountInfo } from "./pfostenbefestigung.js";
const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

const GLASS_T = [8.76, 10.76, 12.76, 16.76, 20.76];
/** Ganzglas: Glasscheiben tragen selbst, keine Pfosten, Gurte und Pfostenbefestigung */
const allGlass = (p) => p.fill === "glas" && (p.glassMount === "boden" || p.glassMount === "punkt");
const mountKind = (p) => (p.base === "oben" || p.base === "seitlich" ? p.base : null);
const SEC = { rohr: "Rundrohr", vierkant: "Quadratrohr", rechteck: "Rechteckrohr", flach: "Flachstahl", rund: "Rundstahl", vierkantvoll: "Vierkantstahl" };

/**
 * Pfostenstellen eines Laufs (O3, wie HiCAD Pfostenaufteilung): Abstände ab Laufbeginn [0, …, L].
 * max: gleichmäßig mit Abstand ≤ postMax; anzahl: postCount gleiche Felder; abstand: postStep, Rest am Ende
 * (Rest unter 1/4 Abstand wird mit dem letzten Feld zusammengelegt); liste: Feldlängen aus list (wird verbraucht),
 * was im Lauf übrig bleibt, gleichmäßig nach postMax.
 */
export function postStations(p, L, run = 0, list = null) {
  const even = (from, len, max) => { const n = Math.max(1, Math.ceil(len / max - 1e-9)); return Array.from({ length: n }, (_, k) => from + (len * (k + 1)) / n); };
  const mode = p.postMode || "max";
  if (mode === "anzahl") {
    const n = Math.round(p.postCount);
    if (!(n >= 1)) throw fieldError("Felder je Lauf: mindestens 1", "postCount");
    return [0, ...Array.from({ length: n }, (_, k) => (L * (k + 1)) / n)];
  }
  if (mode === "abstand") {
    const a = p.postStep;
    if (!(a > (p.post?.geom?.width || 0))) throw fieldError("Pfostenabstand zu klein", "postStep");
    const out = [0];
    while (L - out.at(-1) > a + 1e-6) out.push(out.at(-1) + a);
    if (out.length > 1 && L - out.at(-1) < a / 4) out.pop(); // kleiner Rest: letztes Feld länger
    out.push(L);
    return out;
  }
  if (mode === "liste" && list) {
    const out = [0];
    while (list.length && L - out.at(-1) > 1e-6) {
      const f = list[0];
      if (!(f > 0)) throw fieldError("Feldlängen > 0 angeben", "postList");
      if (out.at(-1) + f > L + 1e-6) throw fieldError(`Feld ${fmt(f)} mm passt nicht mehr in Lauf ${run + 1} (Rest ${fmt(L - out.at(-1))} mm) – Feldlängen enden an jeder Ecke`, "postList");
      list.shift();
      out.push(Math.min(L, out.at(-1) + f));
    }
    if (L - out.at(-1) > 1e-6) out.push(...even(out.at(-1), L - out.at(-1), p.postMax));
    return out;
  }
  return [0, ...even(0, L, p.postMax)];
}

export const GELAENDER = {
  label: "Geländer",
  schema: [
    { key: "runs", label: "Läufe (Längen)", type: "list", default: "3000", group: "Lauflinie" },
    { key: "angle", label: "Eckwinkel", type: "num", unit: "°", default: "90", group: "Lauflinie", when: (p) => splitList(p.runs).length > 1 },
    { key: "height", label: "Höhe (OK Handlauf)", type: "num", default: "1000", group: "Lauflinie" },
    ...normSchema(undefined, "Lauflinie"),
    { key: "post", label: "Pfosten", type: "section", default: { kind: "rohr", size: "42.4x2.6" }, group: "Pfosten" },
    { key: "postMode", label: "Pfostenaufteilung", type: "select", options: [["max", "gleichmäßig, Abstand höchstens"], ["anzahl", "feste Anzahl Felder je Lauf"], ["abstand", "fester Abstand, Rest am Ende"], ["liste", "Feldlängen von Hand"]], default: "max", missing: "max", group: "Pfosten" },
    { key: "postMax", label: "Pfostenabstand max.", type: "num", default: "1200", group: "Pfosten", when: (p) => !p.postMode || p.postMode === "max" || p.postMode === "liste" },
    { key: "postCount", label: "Felder je Lauf", type: "num", default: "3", group: "Pfosten", when: (p) => p.postMode === "anzahl" },
    { key: "postStep", label: "Pfostenabstand", type: "num", default: "1000", group: "Pfosten", when: (p) => p.postMode === "abstand" },
    { key: "postList", label: "Feldlängen (über alle Läufe, Rest nach Abstand max.)", type: "list", default: "1000; 1000", group: "Pfosten", when: (p) => p.postMode === "liste" },
    { key: "base", label: "Befestigung", type: "select", options: [["oben", "oben mit Fußplatte, Bohrbild ins Anschlussbauteil"], ["seitlich", "seitlich mit Befestigungsblech (Deckenstirn bzw. Randprofil links)"], ["fussplatte", "einfache Fußplatte (bisher)"], ["keine", "ohne (eingespannt)"]], default: "oben", group: "Pfosten" },
    { key: "baseSize", label: "Fußplatte Größe", type: "num", default: "120", group: "Pfosten", when: (p) => p.base === "fussplatte" },
    { key: "baseT", label: "Fußplatte Dicke", type: "num", default: "10", group: "Pfosten", when: (p) => p.base === "fussplatte" },
    { key: "mTarget", label: "Anschlussbauteil", type: "select", options: [["boden", "Boden / Decke (nicht im Modell, Bohrbild für Dübel)"], ["profil", "Randprofil (wird erzeugt)"]], default: "boden", group: "Pfostenbefestigung", when: (p) => mountKind(p) },
    { key: "mProfile", label: "Randprofil", type: "section", default: { kind: "upn", size: "200" }, group: "Pfostenbefestigung", when: (p) => mountKind(p) && p.mTarget === "profil" },
    { key: "mSlab", label: "Deckenstärke (Stirnseite)", type: "num", default: "200", group: "Pfostenbefestigung", when: (p) => mountKind(p) === "seitlich" && p.mTarget !== "profil" },
    ...mountSchema(undefined, "Pfostenbefestigung", (p) => mountKind(p)),
    { key: "rail", label: "Handlauf", type: "section", default: { kind: "rohr", size: "42.4x2.6" }, group: "Handlauf und Gurte" },
    ...holderSchema(undefined, "Handlauf und Gurte"),
    { key: "overhang", label: "Handlauf-Überstand an den Enden", type: "num", default: "50", group: "Handlauf und Gurte" },
    { key: "railBend", label: "Handlauf an den Ecken", type: "select", options: [["gehrung", "gegehrt"], ["bogen", "Bogen (Krümmling)"]], default: "gehrung", missing: "gehrung", group: "Handlauf und Gurte", when: (p) => ["rohr", "rund"].includes(p.rail?.kind) },
    { key: "railEnd", label: "Handlauf-Enden", type: "select", options: [["gerade", "gerade"], ["bogen", "Endbogen nach unten"]], default: "gerade", missing: "gerade", group: "Handlauf und Gurte", when: (p) => ["rohr", "rund"].includes(p.rail?.kind) },
    { key: "railR", label: "Biegeradius Handlauf (Mitte Rohr)", type: "num", default: "80", group: "Handlauf und Gurte", when: (p) => ["rohr", "rund"].includes(p.rail?.kind) && (p.railBend === "bogen" || p.railEnd === "bogen") },
    { key: "railMax", label: "Handlauf am Stück bis (sonst Stoß)", type: "num", default: "6000", missing: "0", group: "Handlauf und Gurte" },
    { key: "railJoint", label: "Handlaufstoß", type: "select", options: [["einschiebling", "mit Einschiebling (Hohlprofil)"], ["stumpf", "stumpf geschweißt"]], default: "einschiebling", group: "Handlauf und Gurte", when: (p) => p.railMax > 0 },
    { key: "top", label: "Obergurt", type: "check", default: true, group: "Handlauf und Gurte" },
    { key: "topGap", label: "Obergurt unter Handlauf", type: "num", default: "100", group: "Handlauf und Gurte", when: (p) => p.top },
    { key: "bottom", label: "Untergurt", type: "check", default: true, group: "Handlauf und Gurte" },
    { key: "bottomZ", label: "Untergurt über Boden", type: "num", default: "100", group: "Handlauf und Gurte", when: (p) => p.bottom },
    { key: "belt", label: "Gurtprofil", type: "section", default: { kind: "rohr", size: "26.9x2.3" }, group: "Handlauf und Gurte", when: (p) => p.top || p.bottom },
    { key: "beltMode", label: "Gurte", type: "select", options: [["durch", "durch die Pfosten gesteckt, Stäbe durch die Gurte"], ["zwischen", "zwischen den Pfosten"]], default: "durch", missing: "zwischen", group: "Handlauf und Gurte", when: (p) => p.top || p.bottom },
    { key: "beltMax", label: "Gurt am Stück bis (sonst Stoß im Pfosten)", type: "num", default: "5800", group: "Handlauf und Gurte", when: (p) => (p.top || p.bottom) && p.beltMode !== "zwischen" },
    { key: "allow", label: "Aufmaß der Bohrungen (auf Ø bzw. Maß)", type: "num", default: "1", group: "Handlauf und Gurte", when: (p) => (p.top || p.bottom) && p.beltMode !== "zwischen" },
    { key: "toe", label: "Fußleiste (100 mm)", type: "select", options: [["auto", "nach Geländernorm (Industrie)"], ["ja", "ja"], ["nein", "nein"]], default: "auto", missing: "nein", group: "Handlauf und Gurte" },
    { key: "fill", label: "Füllung", type: "select", options: [["staketen", "Staketen"], ["quer", "Querstäbe"], ["blech", "Blech"], ["glas", "Glas"], ["kreuz", "Kreuz"], ["rahmen", "Rahmen mit Staketen"], ["keine", "keine"]], default: "staketen", tiles: "front", group: "Füllung" },
    { key: "bar", label: "Stab", type: "section", default: { kind: "rund", size: "12" }, group: "Füllung", when: (p) => ["staketen", "quer", "kreuz", "rahmen"].includes(p.fill) },
    { key: "gapMax", label: "Öffnung max.", type: "num", default: "110", group: "Füllung", when: (p) => ["staketen", "quer", "rahmen"].includes(p.fill) },
    { key: "ring", label: "Ring in der Kreuzmitte", type: "check", default: true, group: "Füllung", when: (p) => p.fill === "kreuz" },
    { key: "ringD", label: "Ring-Durchmesser (Mitte Stab)", type: "num", default: "300", group: "Füllung", when: (p) => p.fill === "kreuz" && p.ring },
    { key: "frame", label: "Füllungsrahmen", type: "section", default: { kind: "vierkant", size: "20x2" }, group: "Füllung", when: (p) => p.fill === "rahmen" },
    { key: "glassMount", label: "Glas-Befestigung", type: "select", options: [["klemme", "Glasklemmhalter am Pfosten"], ["lasche", "Lasche am Pfosten, verschraubt"], ["boden", "Ganzglas im Bodenprofil (ohne Pfosten)"], ["punkt", "Ganzglas mit Punkthaltern an der Deckenstirn"]], default: "klemme", missing: "lasche", group: "Füllung", when: (p) => p.fill === "glas" },
    { key: "glassT", label: "Glas (VSG)", type: "select", options: GLASS_T.map((t) => [String(t), `VSG ${String(t).replace(".", ",")} mm`]), default: "10.76", group: "Füllung", when: (p) => p.fill === "glas" && p.glassMount !== "lasche" },
    { key: "panelT", label: "Dicke", type: "num", default: "3", group: "Füllung", when: (p) => p.fill === "blech" || (p.fill === "glas" && p.glassMount === "lasche") },
    { key: "panelGap", label: "Abstand zu Pfosten/Gurt", type: "num", default: "15", group: "Füllung", when: (p) => ["blech", "glas", "rahmen"].includes(p.fill) },
  ],

  /** Bauplan aus aufgelösten Parametern (Zahlen, Profile mit geom) */
  plan(p) {
    if (allGlass(p)) return glassPlan(p);
    const issues = [];
    const runs = p.runs;
    if (!runs.length || runs.some((x) => !(x > 0))) throw fieldError("Läufe: Längen > 0 angeben", "runs");
    const H = p.height, post = p.post, rail = p.rail;
    if (!(H > 200)) throw fieldError("Höhe zu klein", "height");
    if (!(p.postMax > post.geom.width)) throw fieldError("Pfostenabstand zu klein", "postMax");
    // Lauflinie in der Ebene
    const pts = [[0, 0]];
    let ang = 0;
    runs.forEach((L, i) => {
      if (i > 0) ang += (p.angle * Math.PI) / 180;
      const [x, y] = pts[pts.length - 1];
      pts.push([x + L * Math.cos(ang), y + L * Math.sin(ang)]);
    });
    if (runs.length > 1 && !(Math.abs(p.angle) > 0 && Math.abs(p.angle) < 180)) throw fieldError("Eckwinkel zwischen 0° und 180° angeben", "angle");
    // Pfostenstellen je Lauf (Ecken einmal)
    const posts = [];
    const fields = [];
    const stations = []; // je Lauf: Pfosten an der Stelle s (Index in posts)
    const list = p.postMode === "liste" ? [...(p.postList || [])] : null; // O3: Feldlängen von Hand, über die Läufe verbraucht
    runs.forEach((L, i) => {
      const a = pts[i], b = pts[i + 1];
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const ss = postStations(p, L, i, list), n = ss.length - 1;
      for (let k = i === 0 ? 0 : 1; k <= n; k++) posts.push({ at: [a[0] + d[0] * ss[k], a[1] + d[1] * ss[k]], d });
      stations.push(ss.map((s, k) => ({ s, post: posts.length - 1 - n + k })));
      for (let k = 0; k < n; k++) fields.push({ a: [a[0] + d[0] * ss[k], a[1] + d[1] * ss[k]], d, len: ss[k + 1] - ss[k], run: i, pa: posts.length - 1 - n + k });
    });
    if (list?.length) issues.push({ level: "Hinweis", message: `${list.length} Feldlänge(n) übrig – die Läufe sind schon voll` });
    const railH = rail.geom.height, railW = rail.geom.width;
    const zBase = p.base === "fussplatte" ? p.baseT : p.base === "oben" ? p.oT : 0;
    const kind = mountKind(p);
    const holder = p.holder !== "keine";
    const zPostTop = H - railH - holderDrop(holder, post, p.holderGap);
    const members = [], plates = [], chains = [], drills = [], norms = [], tubes = [];
    const P3 = (xy, z) => [xy[0], xy[1], z];
    const up = [0, 0, 1];
    // Pfostenbefestigung oben (pfostenbefestigung.js): Fußplatte auf dem Boden oder auf einem Randprofil, dessen
    // Oberseite auf z = 0 liegt (U/UPN offen nach außen = rechts der Lauflinie); Bohrbild geht ins Randprofil
    // Pfostenbefestigung (pfostenbefestigung.js). Oben: Fußplatte auf dem Boden oder auf einem Randprofil unter der
    // Lauflinie, Oberseite auf z = 0 (U/UPN offen nach außen = rechts). Seitlich: Decke bzw. Randprofil links der
    // Lauflinie (Innenseite), Oberkante z = 0, Befestigungsblech an der Stirnseite, Pfosten rechts davor.
    const mount = kind ? mountConfig(p, undefined, kind) : null, mounted = [];
    const mountTop = kind ? mountConfig(p, undefined, "oben") : null, mountSide = kind ? mountConfig(p, undefined, "seitlich") : null;
    const sOff = kind === "seitlich" ? sideOffset(mount, post) : 0;
    let rand = null;
    const sup = mount && p.supports ? p.supports : null; // vom Balkon: Rahmen (Stäbe) und Belag in Geländer-Lage
    if (mount && !sup && p.mTarget === "profil") {
      const sec = p.mProfile, d0 = norm2(sub2(pts[1], pts[0])), side = kind === "seitlich";
      const open = side ? [-d0[1], d0[0], 0] : [d0[1], -d0[0], 0];
      const rot = orientRot(sec, [d0[0], d0[1], 0], up, { tall: up, open, legs: [-d0[1], d0[0], -1], stem: [0, 0, -1] });
      const ex = rotExtent(sec, rot), zr = -ex.high / 2, ext = (side ? mount.sW : mount.L) / 2 + 20;
      const line = side ? offsetLine(pts, sOff + ex.wide / 2) : pts;
      const rp = line.map((q) => P3(q, zr));
      const e0 = norm2(sub2(line[0], line[1])), e1 = norm2(sub2(line[line.length - 1], line[line.length - 2]));
      rp[0] = P3([line[0][0] + e0[0] * ext, line[0][1] + e0[1] * ext], zr);
      rp[rp.length - 1] = P3([line[line.length - 1][0] + e1[0] * ext, line[line.length - 1][1] + e1[1] * ext], zr);
      chains.push({ section: sec, points: rp, name: "Randprofil", up, rot });
      rand = rp.slice(1).map((b, k) => ({ name: "Randprofil", a: rp[k], b, section: sec, up, rot }));
    }
    // Pfosten (Breite quer zur Lauflinie): Profil-u zeigt quer → Drehung so, dass Breite u ⟂ Lauf
    let cornerPosts = 0;
    posts.forEach((q, i) => {
      const top = P3(q.at, zPostTop), name = `Pfosten ${i + 1}`, along = [q.d[0], q.d[1], 0];
      const ov = mount ? overrideFor(mount.per, name) : null, kindP = ov || kind; // einzelne Pfosten abweichend
      if (mount && ov !== "aus") {
        let r;
        if (kindP === "oben") {
          let face;
          if (sup) {
            // Balkon: auf dem Belag (Bohrungen auch in den Rahmen darunter) bzw. direkt auf dem Rahmen
            face = findPlateFace(sup.plates, top);
            if (!face) { face = findMemberFace(sup.members, P3(q.at, 0), up, 400); if (face?.cPhys) { const c = faceCoords(face, P3(q.at, 0))[1]; if (c < face.cPhys[0] - 1 || c > face.cPhys[1] + 1) face = null; } }
            if (!face) throw fieldError(`${name}: weder Belag noch Rahmen unter dem Pfosten – Geländer vom Rand prüfen`, "mTarget");
          } else face = rand ? findMemberFace(rand, P3(q.at, 0), up) : planeFace([0, 0, 0], up, along, "Boden");
          if (!face) throw fieldError(`${name}: kein Randprofil unter dem Pfosten`, "mTarget");
          r = topMount(mountTop, { name, post, top, along, face, plateName: `Fußplatte ${i + 1}` });
          if (sup && face.targetKind === "plate") {
            applyTargetHoles(sup.plates, face, r.targetHoles);
            const below = holesBelow(mount, r.holes, sup.members, name);
            r.drills.push(...below.drills); r.issues.push(...below.issues); r.transferred += below.drills.length; r.below = below.drills.length;
          }
        } else {
          const left = [-q.d[1], q.d[0], 0];
          let face;
          try { face = sup ? findSideFace(sup.members, P3(q.at, 0), along, 2 * sOff + 500, 100 + mountSide.gap) : rand ? findSideFace(rand, P3(q.at, 0), along, 2 * sOff + 500) : slabFace(P3([q.at[0] + left[0] * sOff, q.at[1] + left[1] * sOff], 0), [-left[0], -left[1], 0], along, p.mSlab, "Deckenstirn"); } catch (e) { throw fieldError(e.message, "mProfile"); }
          if (!face) throw fieldError(`${name}: ${sup ? "kein Rahmen" : "kein Randprofil"} neben dem Pfosten`, "mTarget");
          r = sideMount(mountSide, { name, post, top, base: P3(q.at, 0), along, face, plateName: `Befestigungsblech ${i + 1}` });
        }
        members.push({ section: post, a: r.a, b: top, name, up: along, ...(r.cuts ? { cuts: r.cuts } : {}) });
        plates.push(r.plate, ...(r.parts || [])); drills.push(...r.drills); issues.push(...r.issues); mounted.push(r);
      } else members.push({ section: post, a: P3(q.at, mount ? 0 : zBase), b: top, name, up: [q.d[0], q.d[1], 0] });
      // Eckpfosten unter einem Krümmling: der Bogen läuft innen an der Ecke vorbei, kein Halter (Pfosten trägt über die Gurte)
      const underBend = ["rohr", "rund"].includes(rail.kind) && p.railBend === "bogen" && pts.slice(1, -1).some((c) => Math.hypot(c[0] - q.at[0], c[1] - q.at[1]) < 1e-6);
      if (underBend) cornerPosts++;
      if (holder && !underBend) {
        const hp = holderParts({ q: P3(q.at, zPostTop), along: q.d, axisZ: H - railH / 2, post, railH, d: p.holderD, name: `Pfosten ${i + 1}`, target: "Handlauf" });
        members.push(...hp.members); plates.push(...hp.plates); drills.push(...hp.drills);
      }
      if (p.base === "fussplatte") {
        const pl = platePlan({ width: post.geom.width, height: post.geom.height }, { thickness: p.baseT, width: p.baseSize, height: p.baseSize, holes: 4, holeDia: 11, edge: Math.min(20, p.baseSize / 4) });
        plates.push({ center: P3(q.at, 0), xDir: [q.d[0], q.d[1], 0], normal: up, W: pl.W, H: pl.H, t: pl.t, holes: pl.holes, d: pl.d, name: `Fußplatte ${i + 1}` });
      }
    });
    // Handlauf über die ganze Lauflinie, an den Ecken gegehrt; Überstand an beiden Enden
    const zr = H - railH / 2;
    const rp = pts.map((q) => P3(q, zr));
    if (p.overhang > 0) {
      const ext = (i0, i1) => { const d = norm2(sub2(pts[i0], pts[i1])); return P3([pts[i0][0] + d[0] * p.overhang, pts[i0][1] + d[1] * p.overhang], zr); };
      rp[0] = ext(0, 1);
      rp[rp.length - 1] = ext(pts.length - 1, pts.length - 2);
    }
    // Handlauf als Kette; über railMax geteilt (O2): Stoß kurz hinter einem Pfosten, Einschiebling bei Hohlprofilen
    let railJoints = 0, railPiece = 0;
    const pushRail = (line) => {
      const total = arcLengths(line).at(-1);
      if (!(p.railMax > 0) || total <= p.railMax + 1e-6) { chains.push({ section: rail, points: line, name: "Handlauf" }); return; }
      const s = arcLengths(line);
      let ts;
      try { ts = jointStations(total, { max: p.railMax, posts: posts.map((q) => paramOf(line, q.at)), corners: s.slice(1, -1), off: Math.max(150, post.geom.width / 2 + 60) }); } catch (e) { throw fieldError(e.message, "railMax"); }
      for (const piece of splitPolyline(line, ts)) chains.push({ section: rail, points: piece, name: `Handlauf ${++railPiece}`, target: "Handlauf" });
      for (const t of ts) {
        railJoints++;
        const { p: q, d } = pointAt(line, t);
        const sl = p.railJoint === "stumpf" ? null : sleeveFor(rail, q, d, 160, `Handlauf Einschiebling ${railJoints}`);
        if (sl) members.push({ ...sl, up: [0, 0, 1] });
      }
    };
    // Krümmlinge (N2): Bögen an den Ecken bzw. Endbogen 90° nach unten (Schenkel 50 mm) statt Gehrung
    const roundRail = ["rohr", "rund"].includes(rail.kind), bendCorners = roundRail && p.railBend === "bogen", bendEnds = roundRail && p.railEnd === "bogen";
    if (bendCorners || bendEnds) {
      const R = p.railR, rq = rp.map((q) => [...q]);
      if (!(R >= rail.geom.width)) throw fieldError(`Biegeradius mindestens ${Math.ceil(rail.geom.width)} mm (Rohr-Ø)`, "railR");
      // Endbogen beginnt erst nach dem Überstand: Enden um R weiter hinaus, dann senkrecht nach unten
      const out = (i, j) => { const d = v3n(sub3(rq[i], rq[j])); rq[i] = rq[i].map((x, k) => x + d[k] * R); };
      if (bendEnds) { out(0, 1); out(rq.length - 1, rq.length - 2); }
      if (bendEnds) { rq.unshift([rq[0][0], rq[0][1], rq[0][2] - R - 50]); rq.push([rq.at(-1)[0], rq.at(-1)[1], rq.at(-1)[2] - R - 50]); }
      // ohne Eckbögen: Enden als eigene Bogenstücke, der innere Zug bleibt eine gegehrte Kette
      const parts = bendCorners ? [{ pts: rq, bend: true }] : splitAtCorners(rq);
      let nb = 0, nm = 0;
      for (const part of parts) {
        if (!part.bend) { pushRail(part.pts); continue; }
        const bc = bentChain({ section: rail, points: part.pts, name: "Handlauf", radius: R });
        for (const m of bc.members) members.push({ ...m, name: `Handlauf ${++nm}` });
        for (const t of bc.tubes) tubes.push({ ...t, name: `Handlauf Bogen ${++nb}` });
        if (bc.short.length) issues.push({ key: "railR", level: "Warnung", message: `Handlauf: an ${bc.short.length} Ecke(n) ist das Stück zu kurz für den Biegeradius – dort bleibt ein Knick` });
      }
      if (bendCorners && holder && runs.length > 1) issues.push({ key: "railBend", level: "Hinweis", message: "Eckpfosten ohne Handlaufhalter: der Bogen läuft innen an der Ecke vorbei – Pfosten trägt über die Gurte" });
      if (bendCorners && R < 1.5 * rail.geom.width) issues.push({ key: "railR", level: "Warnung", message: `Biegeradius unter 1,5 × Ø (${Math.ceil(1.5 * rail.geom.width)} mm): Rohr knickt ohne Dorn ein – Formbogen verwenden` });
    } else pushRail(rp);
    // Gurte und Füllung je Feld zwischen den Pfostenflächen
    const half = post.geom.height / 2; // Pfostentiefe entlang der Lauflinie (v zeigt entlang d)
    const belt = p.belt, beltH = belt?.geom.height || 0;
    const zTop = H - railH - p.topGap;
    let zBot = p.bottomZ;
    // Fußleiste (EN ISO 14122-3: ≥ 100 mm, Luft zum Boden ≤ 10 mm) zwischen den Pfosten; der Untergurt geht darüber
    const toeOn = p.toe === "ja" || (p.toe === "auto" && normRules(p.use, p.fall).toe > 0), toeH = 100, toeZ = Math.max(10, zBase);
    if (toeOn && p.bottom && zBot - beltH / 2 < toeZ + toeH + 10) {
      zBot = Math.ceil((toeZ + toeH + 10 + beltH / 2) / 5) * 5;
      issues.push({ key: "bottomZ", level: "Hinweis", message: `Untergurt über die Fußleiste gelegt (${zBot} mm über Boden)` });
    }
    const fillLo = p.bottom ? zBot + beltH / 2 : toeOn ? toeZ + toeH : zBase;
    const fillHi = p.top ? zTop - beltH / 2 : zPostTop;
    if (p.top && p.bottom && zTop - zBot < 2 * beltH + 50) throw fieldError("Ober- und Untergurt liegen zu dicht – Höhen prüfen", "topGap");
    if (p.fill !== "keine" && !(fillHi - fillLo > 20)) throw fieldError("Kein Platz für die Füllung", "fill");
    // Gurte durch die Pfosten gesteckt (wie Musterbild): Gurt-Querschnitt mit Aufmaß als Durchbruch im Pfosten,
    // Stäbe durch Bohrungen (Stab + Aufmaß) in den Gurten bis bündig an deren Außenseite
    const through = (p.top || p.bottom) && p.beltMode !== "zwischen";
    const beltRot = (d, open) => orientRot(belt, [d[0], d[1], 0], up, { open, legs: [-d[1], d[0], open[2]], stem: [0, 0, -open[2]] });
    const beltExt = (d, open) => rotExtent(belt, beltRot(d, open));
    const allow = p.allow || 0;
    if (through) {
      const e = beltExt([1, 0], [0, 0, 1]), inner = Math.min(post.geom.width, post.geom.height);
      if (!(Math.max(e.high, e.wide) + allow < inner - 2)) throw fieldError(`Gurt ${Math.round(Math.max(e.high, e.wide))} mm passt nicht durch den Pfosten (${Math.round(inner)} mm) – kleineren Gurt oder größeren Pfosten wählen`, "belt");
      if (p.fill === "staketen" && !(Math.min(p.bar.geom.width, p.bar.geom.height) + allow < Math.min(e.high, e.wide) - 2)) throw fieldError("Stab passt nicht durch den Gurt – kleineren Stab oder größeren Gurt wählen", "bar");
    }
    // Stäbe nur durch die innere Gurtwand, Ende innen an der gegenüberliegenden Wand (Vollprofil: Sackloch bis zur Mitte)
    const beltHalf = beltExt([1, 0], [0, 0, 1]).high / 2, reach = through && p.bar ? innerReach(belt, 2 * beltHalf, p.bar.geom.width) : 0;
    const barLo = through && p.bottom ? zBot - reach : fillLo, barHi = through && p.top ? zTop + reach : fillHi;
    const barHoles = []; // [{ x, y, field }] Stellen der Stäbe für die Gurtbohrungen
    let nBars = 0, gapMaxSeen = 0;
    const flat = (B, t) => ({ kind: "flach", dims: { B, t }, geom: sectionGeometry("flach", { B, t }) });
    const rund = (D) => ({ kind: "rund", dims: { D }, geom: sectionGeometry("rund", { D }) });
    const toeSec = flat(toeH, 5);
    fields.forEach((fd, i) => {
      const s0 = half, s1 = fd.len - half, clear = s1 - s0;
      const at = (s) => [fd.a[0] + fd.d[0] * s, fd.a[1] + fd.d[1] * s];
      const nrm = [-fd.d[1], fd.d[0], 0];
      // Hüllkörper zum Ausklinken: Pfosten links/rechts des Feldes, Gurte im Feld (Teile liegen voll an, ohne Durchdringung)
      const postCope = (j) => { const m = members.find((x) => x.name === `Pfosten ${fd.pa + j + 1}`); return m && { section: m.section, a: m.a, b: m.b, up: m.up, rot: m.rot }; };
      const posts2 = [postCope(0), postCope(1)];
      const beltCope = (top) => (top ? p.top : p.bottom) ? { section: belt, a: P3(at(s0 - 60), top ? zTop : zBot), b: P3(at(s1 + 60), top ? zTop : zBot), up: [0, 0, 1], rot: beltRot(fd.d, top ? [0, 0, -1] : [0, 0, 1]) } : null;
      // über den Fußplatten ausgeklinkt (Platz für Schraubenköpfe bzw. Muttern, 35 mm über der Platte) – vorher lag die
      // Fußleiste auf den Schrauben der Fußplatten
      const footCope = (j) => {
        const pl = plates.find((x) => x.name === `Fußplatte ${fd.pa + j + 1}`);
        if (!pl) return null;
        const xd = pl.xDir, hl = pl.W / 2 + 5;
        return { section: { kind: "flach", dims: { B: pl.H + 10, t: 2 * (pl.t + 35) } }, a: pl.center.map((v, k) => v - xd[k] * hl), b: pl.center.map((v, k) => v + xd[k] * hl), up: [0, 0, 1] };
      };
      if (toeOn) members.push({ section: toeSec, a: P3(at(0), toeZ + toeH / 2), b: P3(at(fd.len), toeZ + toeH / 2), name: `Fußleiste ${i + 1}`, up: nrm, copes: [...posts2, footCope(0), footCope(1)].filter(Boolean) });
      // Gurte zwischen den Pfosten: U/UPN offen zur Füllung (Obergurt nach unten, Untergurt nach oben), Flachstahl liegend
      if (!through && p.top) members.push({ section: belt, a: P3(at(s0), zTop), b: P3(at(s1), zTop), name: `Obergurt ${i + 1}`, rot: beltRot(fd.d, [0, 0, -1]) });
      if (!through && p.bottom) members.push({ section: belt, a: P3(at(s0), zBot), b: P3(at(s1), zBot), name: `Untergurt ${i + 1}`, rot: beltRot(fd.d, [0, 0, 1]) });
      if (p.fill === "staketen") {
        const b = p.bar.geom.height; // Stabdicke entlang der Lauflinie (v zeigt entlang d)
        const n = Math.max(0, Math.ceil((clear - p.gapMax) / (b + p.gapMax) - 1e-9));
        const gap = (clear - n * b) / (n + 1);
        gapMaxSeen = Math.max(gapMaxSeen, gap);
        for (let k = 0; k < n; k++) {
          const s = s0 + gap * (k + 1) + b * k + b / 2;
          members.push({ section: p.bar, a: P3(at(s), barLo), b: P3(at(s), barHi), name: `Stab ${i + 1}.${k + 1}`, up: [fd.d[0], fd.d[1], 0] });
          if (through) barHoles.push({ q: at(s), d: fd.d, run: fd.run });
        }
        nBars += n;
      } else if (p.fill === "quer") {
        const b = p.bar.geom.height, span = fillHi - fillLo;
        const n = Math.max(0, Math.ceil((span - p.gapMax) / (b + p.gapMax) - 1e-9));
        const gap = (span - n * b) / (n + 1);
        gapMaxSeen = Math.max(gapMaxSeen, gap);
        for (let k = 0; k < n; k++) {
          const z = fillLo + gap * (k + 1) + b * k + b / 2;
          members.push({ section: p.bar, a: P3(at(s0), z), b: P3(at(s1), z), name: `Querstab ${i + 1}.${k + 1}` });
        }
        nBars += n;
      } else if (p.fill === "kreuz") {
        // Diagonalen von Ecke zu Ecke des Feldes, an den Pfosten senkrecht abgeschnitten; Ring in der Mitte (gegehrter Zug)
        // Kreuzung: ohne Ring läuft Diagonale 1 durch, Diagonale 2 ist in zwei Stücke geteilt und an Diagonale 1
        // ausgeklinkt; mit Ring enden alle vier Stücke am Ring (an seine Außenseite angepasst). Keine Durchdringung.
        const along = [fd.d[0], fd.d[1], 0], n = [-fd.d[1], fd.d[0], 0];
        const A = P3(at(s0), fillLo), B = P3(at(s1), fillHi), C = P3(at(s0), fillHi), D = P3(at(s1), fillLo);
        const M = P3(at((s0 + s1) / 2), (fillLo + fillHi) / 2);
        const cut = (q, sg) => ({ p: q, n: along.map((x) => x * sg) });
        const ext = (a, b, e) => { const u = norm3(sub3(b, a)); return [sub3(a, mul3(u, e)), add3(b, mul3(u, e))]; };
        let ring = null;
        if (p.ring) {
          const r = p.ringD / 2, bw = Math.max(p.bar.geom.width, p.bar.geom.height);
          if (!(r > bw && 2 * r + bw < Math.min(clear, fillHi - fillLo))) throw fieldError(`Ring ⌀ ${p.ringD} passt nicht ins Feld ${Math.round(clear)} × ${Math.round(fillHi - fillLo)} mm`, "ringD");
          // Ring gewalzt (ein Teil), Ebene des Feldes: Achse quer zum Feld, Winkel 0 in Laufrichtung
          const c = at((s0 + s1) / 2), zc = (fillLo + fillHi) / 2;
          ring = { c: [c[0], c[1], zc], r, a0: 0, sweep: 360, rise: 0, axis: [fd.d[1], -fd.d[0], 0], x0: [fd.d[0], fd.d[1], 0] };
          tubes.push({ section: p.bar, path: ring, name: `Ring ${i + 1}` });
          const rc = { section: p.bar, path: ring };
          // vier Stücke von der Ecke bis zur Ringmitte, am Ring ausgeklinkt
          for (const [q, j, pos] of [[A, 1, "unten"], [B, 1, "oben"], [C, 2, "oben"], [D, 2, "unten"]]) {
            const sg = q === A || q === C ? -1 : 1, e = add3(M, mul3(norm3(sub3(q, M)), r));
            const bc = beltCope(pos === "oben");
            members.push({ section: p.bar, a: q, b: e, name: `Diagonale ${i + 1}.${j} ${pos}`, up: along, cuts: { start: [cut(q, sg)], end: [] }, copes: bc ? [rc, bc] : [rc] });
          }
          nBars += 4;
        } else {
          const bt = [beltCope(true)].filter(Boolean), bb = [beltCope(false)].filter(Boolean);
          members.push({ section: p.bar, a: A, b: B, name: `Diagonale ${i + 1}.1`, up: along, cuts: { start: [cut(A, -1)], end: [cut(B, 1)] }, copes: [...bt, ...bb] });
          const copes = [{ section: p.bar, a: A, b: B, up: along, cuts: { start: [cut(A, -1)], end: [cut(B, 1)] } }];
          members.push({ section: p.bar, a: C, b: M, name: `Diagonale ${i + 1}.2 oben`, up: along, cuts: { start: [cut(C, -1)], end: [] }, copes: [...copes, ...bt] });
          members.push({ section: p.bar, a: D, b: M, name: `Diagonale ${i + 1}.2 unten`, up: along, cuts: { start: [cut(D, 1)], end: [] }, copes: [...copes, ...bb] });
          nBars += 3;
        }
        // Öffnung = größter Inkreis der vier Dreiecke zwischen Diagonalen und Rand (Ring nicht angerechnet)
        const w = clear / 2, h = (fillHi - fillLo) / 2, L = Math.hypot(w, h);
        gapMaxSeen = Math.max(gapMaxSeen, w + h - L); // Inkreis-⌀ des rechtwinkligen Dreiecks
      } else if (p.fill === "rahmen") {
        // Füllungsrahmen (gegehrt) mit Abstand zu Pfosten und Gurten, Staketen innen zwischen den Rahmenstäben
        const fr = p.frame, fw = fr.geom.width, g = p.panelGap; // Kette mit up = Feldnormale: Breite liegt in der Feldebene
        const fs0 = s0 + g + fw / 2, fs1 = s1 - g - fw / 2, fz0 = fillLo + g + fw / 2, fz1 = fillHi - g - fw / 2;
        if (!(fs1 - fs0 > 3 * fw && fz1 - fz0 > 3 * fw)) throw fieldError("Füllungsrahmen passt nicht ins Feld – Abstand oder Rahmenprofil prüfen", "frame");
        const n = [-fd.d[1], fd.d[0], 0];
        chains.push({ section: fr, points: [P3(at(fs0), fz0), P3(at(fs1), fz0), P3(at(fs1), fz1), P3(at(fs0), fz1), P3(at(fs0), fz0)], name: `Füllungsrahmen ${i + 1}`, up: n });
        const i0 = fs0 + fw / 2, i1 = fs1 - fw / 2, inner = i1 - i0, zl = fz0 + fw / 2, zh = fz1 - fw / 2;
        const b = p.bar.geom.height;
        const m = Math.max(0, Math.ceil((inner - p.gapMax) / (b + p.gapMax) - 1e-9));
        const gap = (inner - m * b) / (m + 1);
        gapMaxSeen = Math.max(gapMaxSeen, gap, g);
        for (let k = 0; k < m; k++) {
          const s = i0 + gap * (k + 1) + b * k + b / 2;
          members.push({ section: p.bar, a: P3(at(s), zl), b: P3(at(s), zh), name: `Stab ${i + 1}.${k + 1}`, up: [fd.d[0], fd.d[1], 0] });
        }
        nBars += m;
        // Abstandhalter Rundstahl Ø 12 (geschweißt): je zwei zu den Pfosten und zu den Gurten, an Pfosten/Gurt angepasst
        const sp = rund(12), zs = [fz0 + (fz1 - fz0) * 0.2, fz1 - (fz1 - fz0) * 0.2], ss = [s0 + clear * 0.25, s1 - clear * 0.25];
        let k = 0;
        for (const [j, sp0, sg] of [[0, s0, 1], [1, s1, -1]]) for (const z of zs)
          if (posts2[j]) members.push({ section: sp, a: P3(at(sp0 - sg * half), z), b: P3(at(sp0 + sg * g), z), name: `Füllungsrahmen ${i + 1} Abstandhalter ${++k}`, up: nrm, copes: [posts2[j]] });
        for (const [top, zb, zf] of [[false, zBot, fillLo + g], [true, zTop, fillHi - g]]) {
          const bc = beltCope(top);
          if (bc) for (const s of ss) members.push({ section: sp, a: P3(at(s), zb), b: P3(at(s), zf), name: `Füllungsrahmen ${i + 1} Abstandhalter ${++k}`, up: [fd.d[0], fd.d[1], 0], copes: [bc] });
        }
      } else if (p.fill === "glas" && p.glassMount === "klemme") {
        // Glasklemmhalter (N3): Glas mittig auf der Lauflinie, je Pfostenseite 2 Halter (bei kleinen Feldern 1),
        // Halter mit M8 in den Pfosten (Gewindebohrung), Glas nur geklemmt (ohne Bohrung)
        const tg = Number(p.glassT), W = clear - 2 * p.panelGap, Hp = fillHi - fillLo - 2 * p.panelGap;
        if (!(W > 0 && Hp > 0)) throw fieldError("Füllung: Abstand zu groß für das Feld", "panelGap");
        if (!(p.panelGap >= 8 && p.panelGap <= 30)) issues.push({ key: "panelGap", level: "Hinweis", message: `Glasklemmhalter: Glas ${Math.round(p.panelGap)} mm vom Pfosten – der Klemmschlitz fasst 8 … 30 mm` });
        const n = [-fd.d[1], fd.d[0], 0], c = at((s0 + s1) / 2), zc = (fillLo + fillHi) / 2, nm = `Glas ${i + 1}`;
        const hz = Hp > 400 ? [zc - Hp / 2 + 100, zc + Hp / 2 - 100] : [zc];
        for (const [j, sp0, sg] of [[0, s0, 1], [1, s1, -1]]) {
          if (!posts2[j]) continue;
          for (const z of hz) {
            const dir = [fd.d[0] * sg, fd.d[1] * sg, 0];
            norms.push({ kind: "glasklemme", size: `VSG ${String(tg).replace(".", ",")}`, grade: "A2", pos: P3(at(sp0), z), dir, xDir: [0, 0, 1] });
            drills.push({ target: `Pfosten ${fd.pa + j + 1}`, p: P3(at(sp0 + sg), z), dir: dir.map((x) => -x), len: 8, d: 6.8 });
          }
        }
        plates.push({ center: [c[0] - (n[0] * tg) / 2, c[1] - (n[1] * tg) / 2, zc], xDir: [fd.d[0], fd.d[1], 0], normal: n, W, H: Hp, t: tg, name: nm, glass: true, vertical: true });
        gapMaxSeen = Math.max(gapMaxSeen, p.panelGap);
      } else if (p.fill === "blech" || p.fill === "glas") {
        const W = clear - 2 * p.panelGap, Hp = fillHi - fillLo - 2 * p.panelGap;
        if (!(W > 0 && Hp > 0)) throw fieldError("Füllung: Abstand zu groß für das Feld", "panelGap");
        const n = [-fd.d[1], fd.d[0], 0];
        const c = at((s0 + s1) / 2);
        const zc = (fillLo + fillHi) / 2, nm = `${p.fill === "glas" ? "Glas" : "Blech"} ${i + 1}`, t = p.panelT;
        // Halter: Lasche FL 40 × 6 an den Pfosten geschweißt (angepasst), hinter der Füllung; M8 durch Lasche und Füllung
        // (Bohrung Ø 9 in beiden); Glas mit Punkthalter-Bohrung, Edelstahlschraube
        const lasche = flat(40, 6), holes = [], hz = Hp > 260 ? [zc - Hp / 2 + 60, zc + Hp / 2 - 60] : [zc];
        let k = 0;
        for (const [j, sp0, sg] of [[0, s0, 1], [1, s1, -1]]) {
          if (!posts2[j]) continue;
          const sh = sp0 + sg * (p.panelGap + 20);
          for (const z of hz) {
            const off = (s, dn) => { const q = P3(at(s), z); return [q[0] + n[0] * dn, q[1] + n[1] * dn, q[2]]; };
            const ln = `${nm} Halter ${++k}`;
            members.push({ section: lasche, a: off(sp0 - sg * half, t / 2 + 3), b: off(sp0 + sg * (p.panelGap + 40), t / 2 + 3), name: ln, up: n, copes: [posts2[j]] });
            drills.push({ target: ln, p: off(sh, t / 2 + 7), dir: n.map((x) => -x), len: 8, d: 9 });
            holes.push([sh - (s0 + s1) / 2, -(z - zc), 9]);
            norms.push({ bolt: true, size: "M8", clamp: t + 6, pos: off(sh, -t / 2), dir: n, grade: p.fill === "glas" ? "A2-70" : "8.8" });
          }
        }
        plates.push({ center: [c[0] - (n[0] * t) / 2, c[1] - (n[1] * t) / 2, zc], xDir: [fd.d[0], fd.d[1], 0], normal: n, W, H: Hp, t, name: nm, glass: p.fill === "glas", vertical: true, ...(holes.length ? { holes, d: 9 } : {}) });
        gapMaxSeen = Math.max(gapMaxSeen, p.panelGap);
      }
    });
    if (holder && p.overhang < p.holderD / 2 + 10) issues.push({ key: "overhang", level: "Hinweis", message: `Handlauf-Überstand ${Math.round(p.overhang)} mm: die Bohrung für den Halter am Endpfosten liegt am Rohrende – mindestens ${Math.ceil(p.holderD / 2 + 10)} mm vorsehen` });
    let nBelts = 0;
    if (through) {
      const halfP = post.geom.height / 2; // Pfostentiefe entlang der Lauflinie
      stations.forEach((st, r) => {
        const a = pts[r], d = norm2(sub2(pts[r + 1], a)), at = (s) => [a[0] + d[0] * s, a[1] + d[1] * s];
        const xDir = [-d[1], d[0], 0];
        // Stücke: so lang wie möglich bis beltMax, Stoß in der Mitte eines Pfostens
        const pieces = [];
        let from = 0;
        while (from < st.length - 1) {
          let to = from + 1;
          while (to + 1 < st.length && st[to + 1].s - st[from].s <= p.beltMax + 1e-6) to++;
          if (st[to].s - st[from].s > p.beltMax + 1e-6) throw fieldError(`Pfostenabstand größer als Gurt am Stück (${Math.round(p.beltMax)} mm)`, "beltMax");
          pieces.push([from, to]);
          from = to;
        }
        for (const [zc, open, label] of [[zTop, [0, 0, -1], "Obergurt"], [zBot, [0, 0, 1], "Untergurt"]]) {
          if ((label === "Obergurt" && !p.top) || (label === "Untergurt" && !p.bottom)) continue;
          const rot = beltRot(d, open), e = rotExtent(belt, rot);
          const hole = belt.kind === "rohr" || belt.kind === "rund" ? { d: e.wide + allow } : { w: e.wide + allow, h: e.high + allow, xDir };
          for (const [f0, f1] of pieces) {
            // Enden: Mitte des Pfostens, an Ecken (Gurt des nächsten/vorigen Laufs) um den halben Gurt zurück
            const cutA = r > 0 && f0 === 0 ? e.wide / 2 : 0, cutB = r < runs.length - 1 && f1 === st.length - 1 ? e.wide / 2 : 0;
            const name = `${label} ${++nBelts}`;
            members.push({ section: belt, a: P3(at(st[f0].s + cutA), zc), b: P3(at(st[f1].s - cutB), zc), name, rot });
            // Durchbrüche: durchgehend in den Pfosten dazwischen, einseitig an den Enden
            for (let k = f0; k <= f1; k++) {
              const pn = `Pfosten ${st[k].post + 1}`, c = at(st[k].s);
              if (k > f0 && k < f1) drills.push({ target: pn, p: P3([c[0] - d[0] * (halfP + 1), c[1] - d[1] * (halfP + 1)], zc), dir: [d[0], d[1], 0], len: 2 * halfP + 2, ...hole });
              else drills.push({ target: pn, p: P3(c, zc), dir: k === f0 ? [d[0], d[1], 0] : [-d[0], -d[1], 0], len: halfP + 1, ...hole });
            }
            // Bohrungen für die Stäbe in diesem Stück
            for (const b of barHoles.filter((x) => x.run === r)) {
              const sb = (b.q[0] - a[0]) * d[0] + (b.q[1] - a[1]) * d[1];
              if (sb < st[f0].s || sb > st[f1].s) continue;
              const bh = p.bar.kind === "rohr" || p.bar.kind === "rund" ? { d: p.bar.geom.width + allow } : { w: p.bar.geom.width + allow, h: p.bar.geom.height + allow, xDir };
              drills.push({ target: name, p: P3(b.q, zc + open[2] * (e.high / 2 + 1)), dir: [0, 0, -open[2]], len: entryDepth(belt, e.high, bh.d ?? bh.w) + 2, ...bh });
            }
          }
        }
      });
    }
    issues.push(...mountCollisions(mounted, { members, plates }));
    // Geländernorm: Höhe, Öffnungen, Abstand zum Boden nach Nutzung (gelaendernorm.js)
    const bottomEdge = p.bottom ? zBot - beltExt([1, 0], [0, 0, 1]).high / 2 : ["blech", "glas", "rahmen"].includes(p.fill) ? fillLo + p.panelGap : 0;
    const gapKey = ["staketen", "quer", "rahmen"].includes(p.fill) ? "gapMax" : ["blech", "glas"].includes(p.fill) ? "panelGap" : p.fill === "kreuz" ? (p.ring ? "ringD" : "fill") : "fill";
    issues.push(...railingIssues({ use: p.use, fall: p.fall, height: H, fill: p.fill, toe: toeOn, gap: gapMaxSeen, bottom: bottomEdge, open: fillHi - fillLo, rail }, { height: "height", fill: "fill", gap: gapKey, bottom: p.bottom ? "bottomZ" : "fill", rail: "rail", use: "use" }));
    const total = runs.reduce((a, b) => a + b, 0);
    let info = `${posts.length} Pfosten, ${fields.length} Feld(er) à ${fields.map((f) => Math.round(f.len)).filter((x, i, a) => a.indexOf(x) === i).join(" / ")} mm` + (nBars ? `, ${nBars} Stäbe` : "") + `, Lauflänge ${Math.round(total)} mm` + (holder ? `, ${posts.length} Handlaufhalter (Bohrung Ø ${String(Math.round((p.holderD + 0.1) * 100) / 100).replace(".", ",")})` : "") + (through ? `, Gurte durchgesteckt (${nBelts} Stück, Aufmaß ${String(allow).replace(".", ",")} mm)` : "") + (railJoints ? `, Handlauf ${railPiece} Stücke (${railJoints} Stoß${railJoints > 1 ? "e" : ""}${p.railJoint === "stumpf" ? ", stumpf" : " mit Einschiebling"})` : "") + (mounted.length ? `; Befestigung: ${mountInfo(mounted, kind === "seitlich" ? "Befestigungsbleche" : "Fußplatten")}` : "");
    if (toeOn) info += `, Fußleiste ${toeH} × 5 mm`;
    return { chains, members, plates, drills, norms, tubes, info, issues, sections: SEC };
  },

  views: ["front", "top"],
  /** Maßlinien: Ansicht des ersten Laufs (Höhe, Feld), Grundriss der Läufe */
  dims(p, plan, view) {
    const gap = Math.max(150, p.height * 0.12), r = Math.round;
    const posts = plan.members.filter((m) => /^Pfosten \d+$/.test(m.name)).map((m) => m.a);
    if (view === "front") {
      const out = [{ key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }, { key: "runs", a: [0, 0], b: [p.runs[0], 0], off: -gap, text: r(p.runs[0]) }];
      if (posts.length > 1 && Math.abs(posts[1][1]) < 1e-6) out.push({ key: "postMax", a: [posts[0][0], p.height], b: [posts[1][0], p.height], off: gap / 2, text: r(posts[1][0] - posts[0][0]) });
      if (p.bottom) out.push({ key: "bottomZ", a: [p.runs[0], 0], b: [p.runs[0], p.bottomZ], off: -gap / 2, text: r(p.bottomZ) });
      return out;
    }
    let x = 0, y = 0, ang = 0;
    return p.runs.map((L, i) => {
      if (i > 0) ang += (p.angle * Math.PI) / 180;
      const a = [x, y];
      x += L * Math.cos(ang); y += L * Math.sin(ang);
      return { key: "runs", a, b: [x, y], off: -gap, text: r(L) };
    });
  },
};

// Felder, die nur für Pfosten-Geländer gelten: bei Ganzglas ausblenden
{
  const keep = new Set(["runs", "angle", "height", "rail", "railBend", "railR", "fill", "glassMount", "glassT"]);
  for (const s of GELAENDER.schema) {
    if (keep.has(s.key) || ["Lauflinie"].includes(s.group)) continue;
    const w = s.when;
    s.when = s.key === "mSlab" ? (p) => (allGlass(p) ? p.glassMount === "punkt" : !w || w(p)) : (p) => !allGlass(p) && (!w || w(p));
  }
}

const GLASS_JOINT = 10, GLASS_MAX_W = 1500, STANDOFF = 40;
/**
 * Ganzglas-Geländer (N3) ohne Pfosten. »boden«: Glas mittig auf der Lauflinie in einem Alu-U-Bodenprofil (Klemmkeile
 * je Seite 15 mm, Setzklotz 5 mm), Profil mit Bohrungen Ø 11 für Betonschrauben. »punkt«: Deckenstirn auf der Lauflinie
 * (Decke links wie bei seitlicher Pfostenbefestigung), Glas außen davor auf Punkthaltern (Abstand 40 mm), zwei Reihen,
 * Glasunterkante bündig mit der Deckenunterseite. Handlauf als Nutrohr auf der Glaskante.
 */
function glassPlan(p) {
  const issues = [], members = [], plates = [], chains = [], drills = [], norms = [], tubes = [];
  const runs = p.runs, H = p.height, rail = p.rail, tg = Number(p.glassT), boden = p.glassMount === "boden";
  if (!runs.length || runs.some((x) => !(x > 0))) throw fieldError("Läufe: Längen > 0 angeben", "runs");
  if (runs.length > 1 && !(Math.abs(p.angle) > 0 && Math.abs(p.angle) < 180)) throw fieldError("Eckwinkel zwischen 0° und 180° angeben", "angle");
  const pts = [[0, 0]];
  let ang = 0;
  runs.forEach((L, i) => { if (i > 0) ang += (p.angle * Math.PI) / 180; const [x, y] = pts.at(-1); pts.push([x + L * Math.cos(ang), y + L * Math.sin(ang)]); });
  const railH = rail.geom.height, zTop = H - railH;
  const prof = boden ? (() => { const B = Math.ceil((tg + 2 * 15 + 2 * 6) / 5) * 5; return { kind: "u", dims: { B, H: 110, t: 6 }, geom: sectionGeometry("u", { B, H: 110, t: 6 }) }; })() : null;
  const slab = p.mSlab || 200;
  if (!boden && !(slab >= 160)) throw fieldError("Deckenstirn zu niedrig für zwei Reihen Punkthalter (mindestens 160 mm)", "mSlab");
  const zBot = boden ? prof.dims.t + 5 : -slab;
  if (!(zTop - zBot > 300)) throw fieldError("Höhe zu klein für Ganzglas", "height");
  const out = (d) => [d[1], -d[0], 0]; // nach außen = rechts der Lauflinie
  // Glasebene: Mitte auf der Lauflinie (Boden) bzw. Abstand + halbe Glasdicke vor der Deckenstirn (Punkthalter)
  const gl = boden ? pts : offsetLine(pts, -(STANDOFF + tg / 2));
  let nGlass = 0, nHold = 0;
  for (let r = 0; r < runs.length; r++) {
    const a = gl[r], b = gl[r + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), d = norm2(sub2(b, a)), o = out(d);
    const inset = tg + GLASS_JOINT, s0 = r > 0 ? inset : 0, s1 = L - (r < runs.length - 1 ? inset : 0);
    const n = Math.max(1, Math.ceil((s1 - s0 + GLASS_JOINT) / (GLASS_MAX_W + GLASS_JOINT) - 1e-9)), W = (s1 - s0 - (n - 1) * GLASS_JOINT) / n;
    if (!(W > 200)) throw fieldError(`Lauf ${r + 1}: zu kurz für eine Glasscheibe`, "runs");
    for (let k = 0; k < n; k++) {
      const sm = s0 + k * (W + GLASS_JOINT) + W / 2, q = [a[0] + d[0] * sm, a[1] + d[1] * sm], zc = (zTop + zBot) / 2, Hg = zTop - zBot;
      const name = `Glas ${++nGlass}`, hs = [];
      if (!boden) {
        // Punkthalter je Scheibe: 2 Spalten (120 mm vom Rand) × 2 Reihen in der Deckenstirn
        const xs = W > 500 ? [-W / 2 + 120, W / 2 - 120] : [0];
        for (const x of xs) for (const z of [-60, -(slab - 60)]) {
          const f = [q[0] + d[0] * x - o[0] * (STANDOFF + tg / 2), q[1] + d[1] * x - o[1] * (STANDOFF + tg / 2), z];
          norms.push({ kind: "glaspunkthalter", size: `VSG ${String(tg).replace(".", ",")}`, grade: "A2", pos: f, dir: o });
          hs.push([x, z - zc, 22]);
          nHold++;
        }
        if (xs.length < 2) issues.push({ key: "runs", level: "Warnung", message: `${name}: nur ${W.toFixed(0)} mm breit – eine Spalte Punkthalter, Statik prüfen` });
      }
      // Platte: Mittelebene + Normale; Glas mittig auf gl (Normale nach außen, Dicke tg)
      plates.push({ center: [q[0] - (o[0] * tg) / 2, q[1] - (o[1] * tg) / 2, zc], xDir: [d[0], d[1], 0], normal: o, W, H: Hg, t: tg, name, glass: true, vertical: true, ...(hs.length ? { holes: hs, d: 22 } : {}) });
      // Setzklötze (Kunststoff 100 × Glasdicke × 5) im Bodenprofil, je 1/4 vom Rand
      if (boden) for (const x of [-W / 4, W / 4]) plates.push({ center: [q[0] + d[0] * x, q[1] + d[1] * x, prof.dims.t], xDir: [d[0], d[1], 0], normal: [0, 0, 1], W: 100, H: tg, t: 5, name: `Setzklotz ${nGlass}.${x < 0 ? 1 : 2}`, density: 1.2 });
    }
    if (boden) {
      const A = pts[r], B = pts[r + 1], Lr = Math.hypot(B[0] - A[0], B[1] - A[1]), dr = norm2(sub2(B, A)), m = Math.max(1, Math.ceil((Lr - 200) / 300 - 1e-9));
      for (let k = 0; k <= m; k++) { const s = 100 + ((Lr - 200) * k) / m; drills.push({ target: "Bodenprofil", p: [A[0] + dr[0] * s, A[1] + dr[1] * s, prof.dims.t + 1], dir: [0, 0, -1], len: prof.dims.t + 2, d: 11 }); }
    }
  }
  if (boden) {
    const d0 = norm2(sub2(pts[1], pts[0]));
    const rot = orientRot(prof, [d0[0], d0[1], 0], [0, 0, 1], { open: [0, 0, 1], legs: [-d0[1], d0[0], 1], stem: [0, 0, -1] });
    chains.push({ section: prof, points: pts.map((q) => [q[0], q[1], prof.dims.H / 2]), name: "Bodenprofil", up: [0, 0, 1], rot, density: 2.7 });
  }
  // Handlauf auf der Glaskante, an den Ecken gegehrt oder gebogen
  const rp = gl.map((q) => [q[0], q[1], H - railH / 2]);
  if (["rohr", "rund"].includes(rail.kind) && p.railBend === "bogen" && runs.length > 1) {
    const bc = bentChain({ section: rail, points: rp, name: "Handlauf", radius: p.railR });
    let nm = 0, nb = 0;
    for (const m of bc.members) members.push({ ...m, name: `Handlauf ${++nm}` });
    for (const t of bc.tubes) tubes.push({ ...t, name: `Handlauf Bogen ${++nb}` });
  } else chains.push({ section: rail, points: rp, name: "Handlauf" });
  if (tg < 16.76 - 1e-6) issues.push({ key: "glassT", level: "Warnung", message: `Ganzglas ohne Pfosten trägt die Holmlast allein: VSG ${String(tg).replace(".", ",")} ist dafür meist zu dünn – üblich ab VSG 16,76 aus TVG, Nachweis (abZ/AbP) nötig` });
  issues.push(...railingIssues({ use: p.use, fall: p.fall, height: H, fill: "glas", toe: false, gap: 0, bottom: Math.max(0, zBot), open: zTop - zBot, rail }, { height: "height", fill: "fill", gap: "glassMount", bottom: "glassMount", rail: "rail", use: "use" }));
  const total = runs.reduce((x, y) => x + y, 0);
  const info = `Ganzglas ${boden ? "im Bodenprofil" : "mit Punkthaltern an der Deckenstirn"}: ${nGlass} Scheiben VSG ${String(tg).replace(".", ",")} (Fuge ${GLASS_JOINT} mm), Lauflänge ${Math.round(total)} mm` +
    (boden ? `, Bodenprofil Alu U ${prof.dims.B} × ${prof.dims.H} (Klemmkeile je Seite 15 mm), Betonschrauben Ø 10 alle ≤ 300 mm` : `, ${nHold} Punkthalter (Glasbohrung Ø 22, Abstand ${STANDOFF} mm)`) + ", Handlauf als Nutrohr auf der Glaskante";
  return { chains, members, plates, drills, norms, tubes, info, issues, sections: SEC };
}

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
/** Handlauf nur mit Endbögen: [Bogen am Anfang], innerer Zug gegehrt, [Bogen am Ende]; Stöße mitten im ersten bzw. letzten Stück */
const v3n = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

function splitAtCorners(rq) {
  const n = rq.length;
  if (n <= 4) return [{ pts: rq, bend: true }]; // gerader Handlauf mit zwei Endbögen: ein Zug
  const mid = (a, b) => a.map((x, k) => (x + b[k]) / 2);
  const m0 = mid(rq[1], rq[2]), m1 = mid(rq[n - 3], rq[n - 2]);
  return [{ pts: [rq[0], rq[1], m0], bend: true }, { pts: [m0, ...rq.slice(2, n - 2), m1], bend: false }, { pts: [m1, rq[n - 2], rq[n - 1]], bend: true }];
}

/** Linienzug um off nach links versetzt (Ecken auf der Winkelhalbierenden) */
function offsetLine(pts, off) {
  return pts.map((q, i) => {
    const dA = i > 0 ? norm2(sub2(q, pts[i - 1])) : null, dB = i < pts.length - 1 ? norm2(sub2(pts[i + 1], q)) : null;
    const nA = dA && [-dA[1], dA[0]], nB = dB && [-dB[1], dB[0]];
    if (!nA || !nB) { const n = nA || nB; return [q[0] + n[0] * off, q[1] + n[1] * off]; }
    const m = norm2([nA[0] + nB[0], nA[1] + nB[1]]), k = off / Math.max(0.2, m[0] * nA[0] + m[1] * nA[1]);
    return [q[0] + m[0] * k, q[1] + m[1] * k];
  });
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return mul3(a, 1 / l); };
const norm2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
