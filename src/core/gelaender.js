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
import { mountSchema, mountConfig, topMount, sideMount, sideOffset, planeFace, slabFace, findMemberFace, findSideFace, findPlateFace, faceCoords, holesBelow, applyTargetHoles, overrideFor, mountCollisions, mountInfo } from "./pfostenbefestigung.js";

const mountKind = (p) => (p.base === "oben" || p.base === "seitlich" ? p.base : null);
const SEC = { rohr: "Rundrohr", vierkant: "Quadratrohr", rechteck: "Rechteckrohr", flach: "Flachstahl", rund: "Rundstahl", vierkantvoll: "Vierkantstahl" };

export const GELAENDER = {
  label: "Geländer",
  schema: [
    { key: "runs", label: "Läufe (Längen)", type: "list", default: "3000", group: "Lauflinie" },
    { key: "angle", label: "Eckwinkel", type: "num", unit: "°", default: "90", group: "Lauflinie", when: (p) => splitList(p.runs).length > 1 },
    { key: "height", label: "Höhe (OK Handlauf)", type: "num", default: "1000", group: "Lauflinie" },
    ...normSchema(undefined, "Lauflinie"),
    { key: "post", label: "Pfosten", type: "section", default: { kind: "rohr", size: "42.4x2.6" }, group: "Pfosten" },
    { key: "postMax", label: "Pfostenabstand max.", type: "num", default: "1200", group: "Pfosten" },
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
    { key: "panelT", label: "Dicke", type: "num", default: "3", group: "Füllung", when: (p) => p.fill === "blech" || p.fill === "glas" },
    { key: "panelGap", label: "Abstand zu Pfosten/Gurt", type: "num", default: "15", group: "Füllung", when: (p) => ["blech", "glas", "rahmen"].includes(p.fill) },
  ],

  /** Bauplan aus aufgelösten Parametern (Zahlen, Profile mit geom) */
  plan(p) {
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
    runs.forEach((L, i) => {
      const a = pts[i], b = pts[i + 1];
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const n = Math.max(1, Math.ceil(L / p.postMax - 1e-9));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) posts.push({ at: [a[0] + d[0] * (L * k) / n, a[1] + d[1] * (L * k) / n], d });
      stations.push(Array.from({ length: n + 1 }, (_, k) => ({ s: (L * k) / n, post: posts.length - 1 - n + k })));
      for (let k = 0; k < n; k++) fields.push({ a: [a[0] + d[0] * (L * k) / n, a[1] + d[1] * (L * k) / n], d, len: L / n, run: i, pa: posts.length - 1 - n + k });
    });
    const railH = rail.geom.height, railW = rail.geom.width;
    const zBase = p.base === "fussplatte" ? p.baseT : p.base === "oben" ? p.oT : 0;
    const kind = mountKind(p);
    const holder = p.holder !== "keine";
    const zPostTop = H - railH - holderDrop(holder, post, p.holderGap);
    const members = [], plates = [], chains = [], drills = [], norms = [];
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
      if (holder) {
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
    chains.push({ section: rail, points: rp, name: "Handlauf" });
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
      if (toeOn) members.push({ section: toeSec, a: P3(at(0), toeZ + toeH / 2), b: P3(at(fd.len), toeZ + toeH / 2), name: `Fußleiste ${i + 1}`, up: nrm, copes: posts2.filter(Boolean) });
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
          const c = at((s0 + s1) / 2), zc = (fillLo + fillHi) / 2, N = 24;
          ring = Array.from({ length: N + 1 }, (_, k) => { const t = (2 * Math.PI * k) / N; return [c[0] + fd.d[0] * r * Math.cos(t), c[1] + fd.d[1] * r * Math.cos(t), zc + r * Math.sin(t)]; });
          chains.push({ section: p.bar, points: ring, name: `Ring ${i + 1}`, up: n });
          const copes = ring.slice(1).map((b, k) => { const [a1, b1] = ext(ring[k], b, p.bar.geom.width / 2); return { section: p.bar, a: a1, b: b1, up: n }; });
          // vier Stücke von der Ecke bis zur Ringmitte, am Ring ausgeklinkt
          for (const [q, j, pos] of [[A, 1, "unten"], [B, 1, "oben"], [C, 2, "oben"], [D, 2, "unten"]]) {
            const sg = q === A || q === C ? -1 : 1, e = add3(M, mul3(norm3(sub3(q, M)), r));
            const near = copes.filter((c) => Math.hypot(...sub3(mul3(add3(c.a, c.b), 0.5), e)) < 0.6 * r + bw);
            const bc = beltCope(pos === "oben");
            members.push({ section: p.bar, a: q, b: e, name: `Diagonale ${i + 1}.${j} ${pos}`, up: along, cuts: { start: [cut(q, sg)], end: [] }, copes: bc ? [...near, bc] : near });
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
    let info = `${posts.length} Pfosten, ${fields.length} Feld(er) à ${fields.map((f) => Math.round(f.len)).filter((x, i, a) => a.indexOf(x) === i).join(" / ")} mm` + (nBars ? `, ${nBars} Stäbe` : "") + `, Lauflänge ${Math.round(total)} mm` + (holder ? `, ${posts.length} Handlaufhalter (Bohrung Ø ${String(Math.round((p.holderD + 0.1) * 100) / 100).replace(".", ",")})` : "") + (through ? `, Gurte durchgesteckt (${nBelts} Stück, Aufmaß ${String(allow).replace(".", ",")} mm)` : "") + (mounted.length ? `; Befestigung: ${mountInfo(mounted, kind === "seitlich" ? "Befestigungsbleche" : "Fußplatten")}` : "");
    if (toeOn) info += `, Fußleiste ${toeH} × 5 mm`;
    return { chains, members, plates, drills, norms, info, issues, sections: SEC };
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

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
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
