// Profil-Schnelleingabe: Querschnitt per Profil-ID oder Kurzform tippen ("40x3", "qr 40", "RE 70x50x4").
// Suchregeln übernommen aus der Rohrlaser-Kalkulation (tabellen_eingabe.profil_treffer/profil_aufloesen),
// Profil-IDs im selben Format wie dort (sections.profileId).
import { SECTION_KINDS, CATALOG, catalogToDims, profileId } from "./sections.js";

// Kürzel der Profil-ID → Profilart (Gegenstück zu sections.profileId)
const PREFIX = { rr: "rohr", qr: "vierkant", re: "rechteck", fl: "flach", rd: "rund", vk: "vierkantvoll", l: "winkel", u: "u" };
// Wie viele Maße die Profil-ID je Art trägt (QR schreibt die Seite doppelt: QR 40x40x3)
const COUNT = { rohr: 2, vierkant: 3, rechteck: 3, flach: 2, rund: 1, vierkantvoll: 1, winkel: 3, u: 3 };

const kurz = (t) => String(t ?? "").toLowerCase().replace(/\s+/g, "").replace(/[*×]/g, "x").replace(/,/g, ".");
const zahlen = (k) => (k.match(/\d+(?:\.\d+)?/g) || []).map(Number);
const ohneDoppelte = (nz) => nz.filter((x, i) => i === 0 || x !== nz[i - 1]);
const gleich = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const beginnt = (nz, z) => z.length <= nz.length && z.every((x, i) => x === nz[i]);

/** Alle Normgrößen der erlaubten Arten als Einträge { id, kind, dims } */
export function catalogEntries(kinds = Object.keys(SECTION_KINDS)) {
  const out = [];
  for (const kind of kinds) {
    for (const c of CATALOG[kind] || []) {
      const dims = catalogToDims(kind, c);
      out.push({ id: profileId(kind, numDims(dims)), kind, dims });
    }
  }
  return out;
}
// Hohlprofile zuerst: „40x3“ meint wie in der Rohrlaser-Kalkulation QR 40x40x3, nicht RR 40x3 oder FL 40x3
const FIRST = ["vierkant", "rechteck"];
const searchOrder = (kinds = Object.keys(SECTION_KINDS)) => [...FIRST.filter((k) => kinds.includes(k)), ...kinds.filter((k) => !FIRST.includes(k))];
const numDims = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)]));

/**
 * Normgrößen zur Eingabe, beste zuerst: gleiche Maße (doppelte dürfen fehlen: 40x3 = 40x40x3), dann Maße am Anfang
 * (40 → 40x40x3, 40x20x2 …), dann Text irgendwo in der ID. Buchstaben vorne (QR, RE …) müssen am Anfang der ID stehen.
 */
export function profileMatches(text, kinds, max = 12) {
  const t = kurz(text);
  if (!t) return [];
  const vorne = t.match(/^[a-zäöü]+/)?.[0] || "";
  const z = zahlen(t);
  const [same, start, other] = [[], [], []];
  for (const e of catalogEntries(searchOrder(kinds))) {
    const k = kurz(e.id);
    if (vorne && !k.startsWith(vorne)) continue;
    const nz = zahlen(k), od = ohneDoppelte(nz);
    if (z.length && (gleich(z, nz) || gleich(z, od))) same.push(e);
    else if (z.length && (beginnt(nz, z) || beginnt(od, z))) start.push(e);
    else if (k.includes(t) || (!z.length && vorne)) other.push(e);
  }
  return [...same, ...start, ...other].slice(0, max);
}

/**
 * Eine vollständige Profil-ID mit Kürzel lesen, auch ohne Normgröße ("RE 70x50x4", "RR 42,4x2", "QR 40x3").
 * Ergebnis { kind, dims } (Maße als Text wie in den Feldern) oder null.
 */
export function parseProfileId(text) {
  const t = kurz(text);
  const m = t.match(/^(rr|qr|re|fl|rd|vk|l|u)(\d.*)$/);
  if (!m) return null;
  let kind = PREFIX[m[1]];
  if (!/^\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)*$/.test(m[2])) return null;
  let n = zahlen(m[2]);
  if (kind === "vierkant" && n.length === 3) {
    if (n[0] === n[1]) n = [n[0], n[2]];
    else kind = "rechteck"; // QR mit ungleichen Seiten ist ein Rechteckrohr
  }
  const need = kind === "vierkant" ? 2 : COUNT[kind];
  if (n.length !== need || n.some((x) => !(x > 0))) return null;
  if (kind === "flach") return { kind, dims: { B: String(Math.max(n[0], n[1])), t: String(Math.min(n[0], n[1])) } };
  return { kind, dims: catalogToDims(kind, n.join("x")) };
}

/**
 * Bestätigte Eingabe auflösen: genaue Normgröße, sonst vollständige Profil-ID mit Kürzel, sonst der beste Treffer
 * mit gleichen Maßen bzw. der einzige Treffer. Profilarten außerhalb von kinds werden abgelehnt.
 * Ergebnis { kind, dims, id } oder { error }.
 */
export function resolveProfile(text, kinds = Object.keys(SECTION_KINDS)) {
  const t = kurz(text);
  if (!t) return { error: "Keine Eingabe" };
  const entries = catalogEntries(kinds);
  const exact = entries.find((e) => kurz(e.id) === t);
  if (exact) return exact;
  const parsed = parseProfileId(text);
  if (parsed) {
    if (!kinds.includes(parsed.kind)) return { error: `${SECTION_KINDS[parsed.kind].label} ist hier nicht möglich` };
    return { ...parsed, id: profileId(parsed.kind, numDims(parsed.dims)) };
  }
  const hits = profileMatches(text, kinds, 30);
  const z = zahlen(t);
  if (hits.length && z.length) {
    const nz = zahlen(kurz(hits[0].id));
    if (gleich(z, nz) || gleich(z, ohneDoppelte(nz))) return hits[0];
  }
  if (hits.length === 1) return hits[0];
  return { error: hits.length ? `Mehrdeutig: ${hits.slice(0, 3).map((e) => e.id).join(", ")} …` : "Kein Profil gefunden (z. B. „QR 40x40x3“, „RE 70x50x4“, „40x3“)" };
}
