// Baugruppenerstellung (BG1–BG14): reine Rechnung für Platzieren mit Vorschau, Schnellfügen und Umbau der Struktur.
// Anzeige und Maus in src/ui/baugruppe.js.
import { placementMatrix, matMul, matInvertRigid, decomposePlacement, matApply, matApplyDir, v3 } from "./geom.js";

/**
 * Schnellfügen (BG6, wie Inventor Alt-Ziehen / SolidWorks SmartMates): Art aus den beiden gegriffenen Elementen.
 * src/tgt = Art der Auswahl ("plane" | "axis"); flip = Leertaste gedrückt (wechselt die Lösung).
 * Rückgabe Zustand für »Abhängigkeit platzieren« ({ type, solution, axisSol }) und Klartext, oder null.
 */
export function quickMate(src, tgt, flip = false, { insert = false } = {}) {
  if (src === "plane" && tgt === "plane") return flip ? { type: "passend", solution: "fluchtend", label: "Bündig" } : { type: "passend", solution: "passend", label: "Fläche an Fläche" };
  if (src === "axis" && tgt === "axis") {
    if (insert) return { type: "einfuegen", solution: flip ? "ausgerichtet" : "entgegengesetzt", label: flip ? "Einfügen (ausgerichtet)" : "Einfügen" };
    return { type: "passend", solution: "passend", axisSol: flip ? "entgegengesetzt" : "ausgerichtet", label: flip ? "Konzentrisch (entgegengesetzt)" : "Konzentrisch" };
  }
  if ((src === "plane" && tgt === "axis") || (src === "axis" && tgt === "plane")) return { type: "tangential", solution: "aussen", label: "Tangential" };
  return null;
}

/** Lage einer neuen Komponente: Mitte ihres Hüllquaders (Bauteil-System) liegt am Punkt p, ungedreht */
export function placeAt(p, center = [0, 0, 0]) {
  return { pos: p.map((x, i) => Math.round((x - center[i]) * 1000) / 1000), rot: [0, 0, 0] };
}

/** Lage nach einer Bewegung D (4×4, Welt) auf die Komponente c – auf µm bzw. 1e-6° gerundet */
export function applyDelta(c, D) {
  const d = decomposePlacement(matMul(D, placementMatrix(c.pos, c.rot)));
  return { pos: d.pos.map((x) => Math.round(x * 1e6) / 1e6), rot: d.rot.map((x) => Math.round(x * 1e6) / 1e6) };
}

/** Bewegung, die Komponente von Lage a nach Lage b bringt (4×4, Welt) */
export function deltaBetween(a, b) {
  return matMul(placementMatrix(b.pos, b.rot), matInvertRigid(placementMatrix(a.pos, a.rot)));
}

// ---------- Unterbaugruppe bilden / auflösen (BG7, wie Inventor Herabstufen/Hochstufen) ----------
const r9 = (x) => Math.round(x * 1e9) / 1e9;
/**
 * Bezug einer Abhängigkeit (Komponenten-System) mit der Platzierung M in ein anderes System umrechnen.
 * Rückgabe neuer Bezug für Komponente compId, oder null (Koordinatensystem-Bezug lässt sich nicht übertragen).
 */
export function transformRef(ref, M, compId) {
  if (!ref || ref.frame) return null;
  const R = (v) => matApplyDir(M, v), P = (p) => matApply(M, p);
  if (ref.point) return { ...ref, comp: compId, p: P(ref.p).map(r9) };
  const plane = (n, d) => { const n2 = v3.norm(R(n)), p = P(v3.mul(n, d)); return { n: n2.map(r9), d: r9(v3.dot(n2, p)) }; };
  if (ref.axis) {
    const d = v3.norm(R(ref.d)), q = P(ref.p);
    const foot = ref.edge ? q : v3.sub(q, v3.mul(d, v3.dot(q, d)));
    return { ...ref, comp: compId, p: foot.map(r9), d: d.map(r9), ...(ref.plane ? { plane: plane(ref.plane.n, ref.plane.d) } : {}) };
  }
  return { ...ref, comp: compId, ...plane(ref.n, ref.d) };
}
const refsOf = (k) => [["a", k.a], ["b", k.b], ["s", k.s]].filter(([, r]) => r);

/**
 * Komponenten ids aus asm in die Unterbaugruppe sub verschieben, die in asm als Komponente subComp steckt.
 * Lage bleibt in der Welt gleich; Abhängigkeiten zwischen verschobenen Teilen wandern mit, solche nach außen
 * hängen danach an der Unterbaugruppe. Muster, Bewegungen und Stecksysteme dürfen die Grenze nicht kreuzen.
 * Rückgabe { moved, constraints (mitgenommen), relinked (nach außen umgehängt), dropped, error }
 */
export function moveIntoSub(asm, ids, sub, subComp) {
  const set = new Set(ids);
  const comps = (asm.components || []).filter((c) => set.has(c.id));
  if (!comps.length) return { error: "Keine Komponente gewählt" };
  if (set.has(subComp.id)) return { error: "Die Unterbaugruppe kann nicht in sich selbst" };
  if (comps.some((c) => c.pat)) return { error: "Musterkopien folgen ihrer Quelle – bitte das Muster selbst verschieben" };
  const pats = (asm.patterns || []).filter((p) => p.comps.some((x) => set.has(x)));
  if (pats.some((p) => !p.comps.every((x) => set.has(x)))) return { error: "Ein Komponentenmuster würde geteilt – alle seine Quellen mitnehmen" };
  if (pats.some((p) => p.hole && !set.has(p.hole.comp)) || (asm.patterns || []).some((p) => p.hole && set.has(p.hole.comp) && !pats.includes(p))) return { error: "Ein Lochbild-Muster verbindet innen und außen – Bauteil mit den Bohrungen mitnehmen" };
  const cross = (x, y) => set.has(x) !== set.has(y);
  if ((asm.motions || []).some((m) => cross(m.a, m.b))) return { error: "Eine Bewegungs-Abhängigkeit verbindet innen und außen – zuerst löschen" };
  if ((asm.steckverbindungen || []).some((s) => cross(s.tab, s.slot))) return { error: "Ein Stecksystem verbindet innen und außen – zuerst löschen" };
  const MS = placementMatrix(subComp.pos, subComp.rot), inv = matInvertRigid(MS);
  const local = new Map(comps.map((c) => [c.id, matMul(inv, placementMatrix(c.pos, c.rot))]));
  let constraints = 0, relinked = 0, dropped = 0;
  const keep = [], inner = [];
  for (const k of asm.constraints || []) {
    const inside = refsOf(k).filter(([, r]) => set.has(r.comp)).length, all = refsOf(k).length;
    if (!inside) { keep.push(k); continue; }
    if (inside === all) { inner.push(k); constraints++; continue; }
    if (k.type === "starr" || k.type === "koordinaten") { dropped++; continue; }
    const out = { ...k };
    let ok = true;
    for (const [key, r] of refsOf(k)) {
      if (!set.has(r.comp)) continue;
      const t = transformRef(r, local.get(r.comp), subComp.id);
      if (!t) ok = false; else out[key] = t;
    }
    if (ok && out.refVec && set.has(out.refVec.comp)) out.refVec = { comp: subComp.id, n: v3.norm(matApplyDir(local.get(out.refVec.comp), out.refVec.n)).map(r9) };
    if (ok) { keep.push(out); relinked++; } else dropped++;
  }
  for (const c of comps) {
    const { pos, rot } = decomposePlacement(local.get(c.id));
    const moved = { ...c, pos: pos.map(r9), rot: rot.map(r9) };
    // Gelenkachse liegt im System der Baugruppe
    if (c.joint) moved.joint = { ...c.joint, p: matApply(inv, c.joint.p).map(r9), d: v3.norm(matApplyDir(inv, c.joint.d)).map(r9) };
    sub.components.push(moved);
  }
  asm.components = asm.components.filter((c) => !set.has(c.id) && !(c.pat && pats.some((p) => p.id === c.pat)));
  asm.constraints = keep;
  if (inner.length) sub.constraints = [...(sub.constraints || []), ...inner];
  if (pats.length) { sub.patterns = [...(sub.patterns || []), ...pats]; asm.patterns = asm.patterns.filter((p) => !pats.includes(p)); }
  const mv = (key, pred) => { const list = (asm[key] || []).filter(pred); if (list.length) { sub[key] = [...(sub[key] || []), ...list]; asm[key] = asm[key].filter((x) => !list.includes(x)); } };
  mv("motions", (m) => set.has(m.a));
  mv("steckverbindungen", (s) => set.has(s.tab));
  return { moved: comps.length, constraints, relinked, dropped, error: null };
}

/**
 * Unterbaugruppe compId in asm auflösen: ihre Komponenten (mit Abhängigkeiten, Mustern, Bewegungen) kommen eine
 * Ebene höher, an derselben Stelle in der Welt. Abhängigkeiten, die an der Unterbaugruppe hingen, entfallen
 * (ihre Flächen gehören jetzt zu einzelnen Teilen) und werden gezählt. newId() liefert neue Komponenten-IDs.
 * Rückgabe { added, dropped, error }
 */
export function dissolveSub(asm, compId, sub, newId) {
  const sc = (asm.components || []).find((c) => c.id === compId);
  if (!sc || sub?.kind !== "assembly") return { error: "Keine Unterbaugruppe gewählt" };
  if (sc.pat) return { error: "Musterkopien lassen sich nicht auflösen" };
  const MS = placementMatrix(sc.pos, sc.rot);
  const map = new Map();
  for (const c of sub.components || []) map.set(c.id, newId());
  const mapId = (id) => map.get(id) || id;
  const added = [];
  for (const c of sub.components || []) {
    const { pos, rot } = decomposePlacement(matMul(MS, placementMatrix(c.pos, c.rot)));
    const n = { ...JSON.parse(JSON.stringify(c)), id: mapId(c.id), pos: pos.map(r9), rot: rot.map(r9) };
    if (c.src) n.src = mapId(c.src);
    if (c.pat) delete n.pat; // Musterkopien legt das übernommene Muster neu an
    if (c.joint) n.joint = { ...c.joint, p: matApply(MS, c.joint.p).map(r9), d: v3.norm(matApplyDir(MS, c.joint.d)).map(r9) };
    if (sc.hidden) n.hidden = true;
    if (!c.pat) added.push(n);
  }
  const dropped = (asm.constraints || []).filter((k) => refsOf(k).some(([, r]) => r.comp === compId)).length;
  asm.constraints = (asm.constraints || []).filter((k) => !refsOf(k).some(([, r]) => r.comp === compId));
  const remap = (k) => { const o = JSON.parse(JSON.stringify(k)); o.id = newId(); for (const [key, r] of refsOf(o)) o[key] = { ...r, comp: mapId(r.comp) }; if (o.refVec) o.refVec.comp = mapId(o.refVec.comp); return o; };
  asm.constraints.push(...(sub.constraints || []).map(remap));
  asm.patterns = [...(asm.patterns || []), ...(sub.patterns || []).map((p) => ({ ...JSON.parse(JSON.stringify(p)), id: newId(), comps: p.comps.map(mapId), ...(p.hole ? { hole: { ...p.hole, comp: mapId(p.hole.comp) } } : {}) }))];
  if (!asm.patterns.length) delete asm.patterns;
  if (sub.motions?.length) asm.motions = [...(asm.motions || []), ...sub.motions.map((m) => ({ ...m, id: newId(), a: mapId(m.a), b: mapId(m.b) }))];
  if (sub.steckverbindungen?.length) asm.steckverbindungen = [...(asm.steckverbindungen || []), ...sub.steckverbindungen.map((s) => ({ ...JSON.parse(JSON.stringify(s)), tab: mapId(s.tab), slot: mapId(s.slot) }))];
  const i = asm.components.indexOf(sc);
  asm.components.splice(i, 1, ...added);
  return { added: added.length, dropped, error: null };
}

// ---------- Spiegeln erweitert (BG11) ----------
/** Spiegelebene aus Fläche (Weltpunkt p, Normale n): { n, c } mit n·x = c */
export function planeFromFace(p, n) { const nn = v3.norm(n); return { n: nn.map(r9), c: r9(v3.dot(nn, p)) }; }
/**
 * »Wiederverwenden« statt Spiegeln (wie Inventor): das gleiche, in sich symmetrische Bauteil kommt an die gespiegelte
 * Stelle. Weltspiegelung an n·x = c, verkettet mit der Spiegelung des Bauteils an seiner eigenen Mittelebene
 * (Normale Rᵀn durch die Hüllquader-Mitte centerLocal) – ergibt eine echte Lage ohne Spiegelung.
 */
export function mirrorReusePlacement(pos, rot, n, c = 0, centerLocal = [0, 0, 0]) {
  const nn = v3.norm(n), M = placementMatrix(pos, rot);
  const m = v3.norm(matApplyDir(matInvertRigid(M), nn));
  const reflW = (x) => v3.sub(x, v3.mul(nn, 2 * (v3.dot(nn, x) - c)));
  const reflL = (x) => v3.sub(x, v3.mul(m, 2 * v3.dot(m, v3.sub(x, centerLocal))));
  // Ursprung des Bauteils: x = 0 → Rl(0) → M → Rw
  const p2 = reflW(matApply(M, reflL([0, 0, 0])));
  return { pos: p2.map(r9), rot: [...rot] };
}

// ---------- Fügepunkte (BG8, wie Inventor iMates / Onshape Mate Connector) ----------
// Ein Bauteil trägt part.fuegepunkte = [{ id, name, type, side: "a"|"b", ref, gap?, angle?, solution?, axisSol? }].
// ref ist der Bezug im Bauteil-System (ohne comp). Zwei Hälften mit gleichem Namen und Gegenseite passen zusammen.
const FP_TYPES = ["gegen", "buendig", "konzentrisch", "einfuegen", "winkel", "tangential", "punkt", "punktflaeche", "kanteflaeche"];
const stripComp = (r) => { const { comp, ...rest } = r; return JSON.parse(JSON.stringify(rest)); };

/**
 * Fügepunkte aus den Abhängigkeiten einer Komponente ableiten (Inventor »iMates ableiten«): je Abhängigkeit zu einem
 * anderen Bauteil eine Hälfte für jedes der beiden Bauteile. Rückgabe [{ partId, fp }].
 */
export function inferFuegepunkte(asm, compId, docOf, newId) {
  const byId = new Map((asm.components || []).map((c) => [c.id, c]));
  const out = [];
  for (const k of asm.constraints || []) {
    if (k.suppressed || !FP_TYPES.includes(k.type) || k.s || k.refVec) continue;
    if (k.a?.comp !== compId && k.b?.comp !== compId) continue;
    const A = byId.get(k.a.comp), B = byId.get(k.b.comp), pa = A && docOf(A.part), pb = B && docOf(B.part);
    if (pa?.kind !== "part" || pb?.kind !== "part") continue;
    const name = k.name?.split(":")[0] ? `${k.name.split(":")[0]} ${pb.name} → ${pa.name}` : `${k.type} ${pb.name} → ${pa.name}`;
    const common = { name, type: k.type, ...(k.gap && k.gap !== "0" ? { gap: k.gap } : {}), ...(k.angle ? { angle: k.angle } : {}), ...(k.solution ? { solution: k.solution } : {}) };
    out.push({ partId: pa.id, fp: { id: newId(), ...common, side: "a", ref: stripComp(k.a) } });
    out.push({ partId: pb.id, fp: { id: newId(), ...common, side: "b", ref: stripComp(k.b) } });
  }
  return out;
}

/** Fügepunkte ins Bauteil übernehmen; gleiche Hälften (Name, Seite, Bezug) nicht doppelt. Rückgabe Anzahl neu */
export function addFuegepunkte(part, fps) {
  const same = (x, y) => x.name === y.name && x.side === y.side && JSON.stringify(x.ref) === JSON.stringify(y.ref);
  let n = 0;
  for (const fp of fps) {
    if ((part.fuegepunkte || []).some((x) => same(x, fp))) continue;
    part.fuegepunkte = [...(part.fuegepunkte || []), fp];
    n++;
  }
  return n;
}

/**
 * Neue Komponente newId über passende Fügepunkte an vorhandene Komponenten fügen (beim Platzieren).
 * near: Weltpunkt (Klick) – bei mehreren Kandidaten gewinnt die nächstliegende Komponente bzw. der nächste Bezug.
 * Rückgabe Liste neuer Abhängigkeiten (noch nicht eingefügt) mit name.
 */
export function autoMate(asm, newCompId, docOf, near = null, newId = () => Math.random().toString(36).slice(2)) {
  const byId = new Map((asm.components || []).map((c) => [c.id, c]));
  const C = byId.get(newCompId), P = C && docOf(C.part);
  if (!P?.fuegepunkte?.length) return [];
  const used = new Set((asm.constraints || []).flatMap((k) => (k.fp ? [`${k.a.comp}|${k.fp}|a`, `${k.b.comp}|${k.fp}|b`] : [])));
  const out = [];
  const wpos = (c, ref) => matApply(placementMatrix(c.pos, c.rot), ref.p || v3.mul(ref.n || [0, 0, 0], ref.d || 0));
  for (const fp of P.fuegepunkte) {
    const other = fp.side === "a" ? "b" : "a";
    let best = null, bd = Infinity;
    for (const c of asm.components) {
      if (c.id === newCompId || c.pat) continue;
      const d = docOf(c.part);
      for (const g of d?.fuegepunkte || []) {
        if (g.name !== fp.name || g.side !== other || used.has(`${c.id}|${fp.name}|${other}`)) continue;
        const dist = near ? v3.dist(wpos(c, g.ref), near) : 0;
        if (dist < bd) { bd = dist; best = { c, g }; }
      }
    }
    if (!best) continue;
    used.add(`${best.c.id}|${fp.name}|${other}`);
    const mine = { ...fp.ref, comp: newCompId }, theirs = { ...best.g.ref, comp: best.c.id };
    out.push({ id: newId(), type: fp.type, a: fp.side === "a" ? mine : theirs, b: fp.side === "a" ? theirs : mine, gap: fp.gap || "0",
      ...(fp.angle ? { angle: fp.angle } : {}), ...(fp.solution ? { solution: fp.solution } : {}), fp: fp.name, name: `${fp.name} (Fügepunkt)` });
  }
  return out;
}
