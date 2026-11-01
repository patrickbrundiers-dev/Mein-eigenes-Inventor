// Spindeltreppe (MegaCAD-Abgleich M14): Stufen als Kreisring-Ausschnitte um ein Mittelrohr, je Stufe ein
// Stufenträger (Flachstahl) und ein Geländerstab außen, Handlauf als gegehrter Zug über die Stabköpfe.
// Reine Rechnung; den Körper baut src/kernel/build.js (Platten mit Umriss »poly«).
//
// Lage: Spindelachse = Z-Achse, Antritt (erste Steigung) bei Winkel 0 (+X), Boden z = 0.
// n Steigungen, n − 1 Stufen; die letzte Steigung führt auf die obere Decke.
// Prüfung: Schrittmaß 2s + a auf der Gehlinie (Mitte der Laufbreite), Durchgangshöhe ≥ 2000 mm (Hinweise, keine Statik).

const DEG = Math.PI / 180;

import { orientRot, rotExtent } from "./orient.js";
import { splitPath, bendIssues, bendRadius, pathLength } from "./biegeteil.js";
import { fieldError } from "./generror.js";
import { normSchema, normRules, railingIssues } from "./gelaendernorm.js";
import { holderSchema, holderDrop, holderParts } from "./handlaufhalter.js";
import { mountSchema, mountConfig, topMount, plateFace, applyTargetHoles, mountCollisions, mountInfo, overrideFor } from "./pfostenbefestigung.js";

// Befestigung der Geländerstäbe auf der Stufe: Felder mit Vorsilbe »stab« (stabOW …)
const sk = (k) => "stab" + k[0].toUpperCase() + k.slice(1);
/** zwei waagrechte Rechteckplatten (Bauplan-Format) überlappen sich im Grundriss (Trennachsen-Test, 1 mm Luft) */
function overlap2d(a, b) {
  const box = (pl) => { const x = [pl.xDir[0], pl.xDir[1]], l = Math.hypot(...x) || 1, u = [x[0] / l, x[1] / l], v = [-u[1], u[0]]; return { c: [pl.center[0], pl.center[1]], u, v, hw: pl.W / 2, hh: pl.H / 2 }; };
  const A = box(a), B = box(b), d = [B.c[0] - A.c[0], B.c[1] - A.c[1]];
  for (const ax of [A.u, A.v, B.u, B.v]) {
    const r = (o) => o.hw * Math.abs(o.u[0] * ax[0] + o.u[1] * ax[1]) + o.hh * Math.abs(o.v[0] * ax[0] + o.v[1] * ax[1]);
    if (Math.abs(d[0] * ax[0] + d[1] * ax[1]) >= r(A) + r(B) + 1) return false;
  }
  return true;
}
const stabMount = (p) => (p.railing && p.stabMount === "oben" ? "oben" : null);
export const SPINDEL = {
  label: "Spindeltreppe",
  schema: [
    { key: "height", label: "Geschosshöhe", type: "num", default: "2800", group: "Lauf" },
    { key: "steps", label: "Steigungen (0 = automatisch)", type: "num", unit: "Stk", default: "0", group: "Lauf" },
    { key: "D", label: "Außendurchmesser", type: "num", default: "1800", group: "Lauf" },
    { key: "angle", label: "Winkel je Stufe (0 = aus 2s + a = 630)", type: "num", unit: "°", default: "0", group: "Lauf" },
    { key: "dir", label: "Drehrichtung aufwärts", type: "select", options: [["links", "gegen den Uhrzeigersinn"], ["rechts", "im Uhrzeigersinn"]], default: "links", group: "Lauf" },
    { key: "overlap", label: "Überdeckung auf der Gehlinie", type: "num", default: "30", group: "Lauf" },
    { key: "spindle", label: "Spindel (Mittelrohr)", type: "section", default: { kind: "rohr", size: "114.3x3.6" }, group: "Tragwerk" },
    { key: "arm", label: "Stufenträger", type: "section", default: { kind: "flach", size: "60x10" }, group: "Tragwerk" },
    { key: "tread", label: "Stufen", type: "select", options: [["blech", "Blech (Riffelblech)"], ["gitterrost", "Gitterrost"], ["holz", "Holz"]], default: "blech", group: "Stufen" },
    { key: "treadT", label: "Stufendicke", type: "num", default: "6", group: "Stufen" },
    { key: "railing", label: "Geländer außen", type: "check", default: true, group: "Geländer" },
    ...normSchema(undefined, "Geländer", (p) => p.railing, { fall: false }),
    { key: "railH", label: "Geländerhöhe über Stufenvorderkante", type: "num", default: "900", group: "Geländer", when: (p) => p.railing },
    { key: "bars", label: "Stäbe je Stufe (0 = nach Geländernorm)", type: "num", unit: "Stk", default: "0", missing: "1", group: "Geländer", when: (p) => p.railing },
    ...holderSchema(undefined, "Geländer", (p) => p.railing),
    { key: "post", label: "Geländerstab", type: "section", default: { kind: "rohr", size: "26.9x2.3" }, group: "Geländer", when: (p) => p.railing },
    { key: "rail", label: "Handlauf", type: "section", default: { kind: "rohr", size: "42.4x2.6" }, group: "Geländer", when: (p) => p.railing },
    { key: "stabMount", label: "Befestigung der Stäbe", type: "select", options: [["aus", "auf die Stufe geschweißt (bisher)"], ["oben", "Fußplatte auf der Stufe, Bohrbild in die Stufe"]], default: "aus", missing: "aus", group: "Pfostenbefestigung", when: (p) => p.railing },
    ...mountSchema(sk, "Pfostenbefestigung", stabMount, { oW: "50", oL: "80", oT: "6", holes: "2l", d: "9", e: "12" }),
  ],

  plan(p) {
    const issues = [];
    const H = p.height, R = p.D / 2;
    if (!(H > 300)) throw fieldError("Geschosshöhe zu klein", "height");
    const r0 = p.spindle.geom.width / 2;
    if (!(R > r0 + 300)) throw fieldError("Außendurchmesser zu klein für eine Laufbreite ≥ 300 mm", "D");
    const n = p.steps > 0 ? Math.round(p.steps) : Math.max(3, Math.round(H / 190));
    const s = H / n, tt = p.treadT;
    if (!(tt > 0)) throw fieldError("Stufendicke muss > 0 sein", "treadT");
    const rg = (r0 + R) / 2; // Gehlinie
    const theta = p.angle > 0 ? p.angle : ((630 - 2 * s) / rg) / DEG;
    if (!(theta > 5 && theta < 90)) throw fieldError(`Winkel je Stufe ${fmt(theta)}° unbrauchbar (5 … 90°)`, "angle");
    const ag = theta * DEG * rg, step = 2 * s + ag;
    if (step < 590 - 1e-6 || step > 650 + 1e-6) issues.push({ key: "angle", level: "Warnung", message: `Schrittmaß auf der Gehlinie 2s + a = ${Math.round(step)} mm außerhalb 590 … 650 mm` });
    if (s > 210 + 1e-6) issues.push({ key: "steps", level: "Warnung", message: `Steigung ${fmt(s)} mm über 210 mm` });
    const perRev = 360 / theta, head = perRev * s - tt;
    if (head < 2000 - 1e-6) issues.push({ key: "angle", level: "Warnung", message: `Durchgangshöhe ${Math.round(head)} mm unter 2000 mm – größeren Durchmesser oder kleineren Winkel wählen` });
    if (R - r0 < 600 - 1e-6) issues.push({ key: "D", level: "Hinweis", message: `Nutzbare Laufbreite ${Math.round(R - r0)} mm unter 600 mm` });
    const sg = p.dir === "rechts" ? -1 : 1;
    const ov = (p.overlap || 0) / rg / DEG; // Überdeckung als Winkel
    const members = [], plates = [], chains = [];
    const at = (r, deg, z) => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG), z];
    const topZ = H + (p.railing ? p.railH : 0);
    members.push({ section: p.spindle, a: [0, 0, 0], b: [0, 0, topZ], name: "Spindel", up: [1, 0, 0] });
    const arm = p.arm, armH = Math.max(arm.geom.width, arm.geom.height);
    // Stufenträger hochkant, U/UPN offen nach unten, T mit dem Flansch oben
    const armRot = orientRot(arm, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, 0, -1], legs: [0, 1, -1], stem: [0, 0, -1] });
    const postOff = p.railing ? Math.max(p.post.geom.width, p.post.geom.height) / 2 + 15 : 0;
    const railPts = [], drills = [], mounted = [], mcfg = stabMount(p) ? mountConfig(p, sk, "oben") : null;
    const holder = p.railing && p.holder !== "keine", drop = p.railing ? holderDrop(holder, p.post, p.holderGap) : 0;
    // Stäbe je Stufe: so viele, dass der lichte Abstand (waagrecht) die Geländernorm einhält
    const barW = p.railing ? Math.max(p.post.geom.width, p.post.geom.height) : 0;
    const clearOf = (k) => 2 * (R - postOff) * Math.sin((theta * DEG) / 2 / k) - barW;
    let perStep = !p.railing ? 0 : p.bars > 0 ? Math.round(p.bars) : 1;
    if (p.railing && !(p.bars > 0)) while (perStep < 50 && clearOf(perStep) > normRules(p.use, H).gapV + 1e-6) perStep++;
    for (let i = 1; i < n; i++) {
      // Stufe i: Vorderkante bei (i − 1)·θ, hinten um θ + Überdeckung weiter
      const a0 = sg * (i - 1) * theta, a1 = a0 + sg * (theta + ov);
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const N = Math.max(4, Math.ceil((hi - lo) / 4));
      const poly = [];
      for (let k = 0; k <= N; k++) { const q = at(R, lo + ((hi - lo) * k) / N, 0); poly.push([q[0], q[1]]); }
      // innen an der Spindel: Sehnen tangential an das Rohr (Ecken auf r0 / cos), sonst schneidet die Stufe ins Rohr
      const Ni = Math.max(2, Math.ceil((hi - lo) / 6)), ri = r0 / Math.cos(((hi - lo) / Ni / 2) * DEG);
      for (let k = Ni; k >= 0; k--) { const q = at(ri, lo + ((hi - lo) * k) / Ni, 0); poly.push([q[0], q[1]]); }
      const z = i * s;
      plates.push({ center: [0, 0, z - tt], xDir: [1, 0, 0], normal: [0, 0, 1], poly, W: 2 * R, H: 2 * R, t: tt, name: `Stufe ${i}`, tread: p.tread });
      const mid = (a0 + a1) / 2;
      members.push({ section: arm, a: at(r0, mid, z - tt - armH / 2), b: at(R - 20, mid, z - tt - armH / 2), name: `Stufenträger ${i}`, up: [0, 0, 1], rot: armRot });
      if (p.railing) {
        const pa = a0 + sg * theta / 2;
        const top = z + p.railH;
        const feet = [];
        for (let j = 0; j < perStep; j++) {
          // Handlauf steigt gleichmäßig mit der Drehung; Handlaufpunkt über jedem Stab, Stab endet darunter
          const f = (j + 0.5) / perStep - 0.5, aj = pa + sg * theta * f, zt = top + f * s, nm = `Geländerstab ${i}${perStep > 1 ? "." + (j + 1) : ""}`;
          const q = at(R - postOff, aj, zt - drop);
          const tg = [-Math.sin(aj * DEG) * sg, Math.cos(aj * DEG) * sg];
          const ov = mcfg ? overrideFor(mcfg.per, nm) : null;
          if (ov === "seitlich") throw fieldError(`${nm}: Stäbe der Spindeltreppe nur »oben« oder »aus« – seitlich gibt es kein Bauteil`, sk("mPer"));
          if (mcfg && ov !== "aus") {
            // Fußplatte auf der Stufe (Platte entlang der Tangente), Bohrungen in die Stufe
            const step = plates.find((x) => x.name === `Stufe ${i}`), face = plateFace(step);
            const mount = (cfg) => topMount(cfg, { name: nm, post: p.post, top: q, along: [tg[0], tg[1], 0], face, plateName: `${nm} Fußplatte` });
            // Mutter unter der Stufe darf nicht am Stufenträger sitzen: sonst Platte länger und so versetzt, dass die Bohrung über den Träger hinweg springt
            const nearArm = (r) => (r.holes || []).some((h) => Math.abs(h[0] * Math.sin(mid * DEG) - h[1] * Math.cos(mid * DEG)) < Math.min(p.arm.geom.width, p.arm.geom.height) / 2 + 12);
            // … und nicht auf der Fußplatte des Nachbarstabs liegen (vorher überlappten sich die Platten bei 3 Stäben je Stufe)
            const clash = (r) => r.plate && feet.some((f) => overlap2d(f, r.plate));
            let r = mount(mcfg);
            if (nearArm(r) || clash(r)) {
              // kürzeste Platte zuerst, dann kleinster Versatz (Bohrungen dürfen beidseits des Trägers liegen)
              const tries = [];
              for (let L = mcfg.L; L <= mcfg.L + 80; L += 5) for (let k = 1; k <= 12; k++) for (const sg of [1, -1]) tries.push({ dx: sg * 5 * k, L });
              for (const t of tries) { const r2 = mount({ ...mcfg, dx: mcfg.dx + t.dx, L: t.L }); if (!nearArm(r2) && !clash(r2) && r2.ok && !r2.issues.some((x) => x.level !== "Hinweis")) { r = r2; break; } }
            }
            if (r.plate) feet.push(r.plate);
            members.push({ section: p.post, a: r.a, b: q, name: nm, up: [tg[0], tg[1], 0] }); // Lage wie bei der Prüfung der Fußplatte
            plates.push(r.plate); applyTargetHoles(plates, face, r.targetHoles); issues.push(...r.issues); mounted.push(r);
          } else members.push({ section: p.post, a: at(R - postOff, aj, z), b: q, name: nm, up: [1, 0, 0] });
          railPts.push([aj, zt + p.rail.geom.width / 2]);
          if (!holder) continue;
          const hp = holderParts({ q, along: tg, axisZ: zt + p.rail.geom.width / 2, post: p.post, railH: p.rail.geom.height, d: p.holderD, slope: s / (theta * DEG * (R - postOff)), name: nm, target: "Handlauf" });
          members.push(...hp.members); plates.push(...hp.plates); drills.push(...hp.drills);
        }
      }
    }
    const tubes = [];
    let railInfo = "";
    if (p.railing && railPts.length >= 2) {
      // Handlauf als gewendeltes Rohr (Schraubenlinie über die Stabköpfe), mit Halter 50 mm über den ersten und letzten
      // Stab hinaus, damit die Bohrung ganz im Rohr liegt; länger als eine Stange → gleich lange Stücke mit Stoß
      const rr = R - postOff, [aS, zS] = railPts[0], [aE, zE] = railPts[railPts.length - 1];
      const dz = (zE - zS) / ((aE - aS) * DEG || 1), ext = holder ? (50 / Math.hypot(rr, dz)) / DEG : 0, se = Math.sign(aE - aS) || 1;
      const path = { c: [0, 0, zS - dz * ext * se * DEG], r: rr, a0: aS - se * ext, sweep: aE - aS + 2 * se * ext, rise: zE - zS + 2 * dz * se * ext * DEG };
      const pieces = splitPath(path);
      pieces.forEach((pa, k) => tubes.push({ section: p.rail, path: pa, name: pieces.length > 1 ? `Handlauf ${k + 1}` : "Handlauf", target: "Handlauf" }));
      issues.push(...bendIssues(path, p.rail, "Handlauf", "rail"));
      railInfo = `, Handlauf gewendelt (Biegeradius ${Math.round(bendRadius(path))} mm, gestreckt ${Math.round(pathLength(path))} mm${pieces.length > 1 ? `, ${pieces.length} Stücke mit Stoß` : ""})`;
    }
    if (p.railing) {
      // Geländernorm: ein Stab je Stufe – lichter Abstand der Stäbe waagrecht gemessen
      issues.push(...railingIssues({ use: p.use, fall: H, height: p.railH, fill: "staketen", gap: clearOf(perStep), bottom: 0, rail: p.rail }, { height: "railH", gap: "post", rail: "rail", use: "use" }));
    }
    if (mounted.length) issues.push(...mountCollisions(mounted, { members, plates }, "stabMount"));
    const total = (n - 1) * theta;
    const info = `${n} Steigungen à ${fmt(s)} mm, ${fmt(theta)}° je Stufe (Gehlinie ${fmt(ag)} mm, 2s + a = ${Math.round(step)} mm), Gesamtdrehung ${fmt(total)}°, Durchgangshöhe ${Math.round(head)} mm, Laufbreite ${Math.round(R - r0)} mm` + (p.railing ? `, ${perStep} Geländerstäbe je Stufe` + (holder ? `, Handlaufhalter mit Bohrung Ø ${String(Math.round((p.holderD + 0.1) * 100) / 100).replace(".", ",")}` : "") : "") + (mounted.length ? `; Befestigung: ${mountInfo(mounted, "Fußplatten")}` : "");
    return { chains, members, plates, drills, tubes, info: info + railInfo, issues };
  },
};

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
