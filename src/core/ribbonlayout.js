// Menüband selbst anordnen: Gruppen je Registerkarte ausblenden und umsortieren.
// Gespeichert in der Einstellung werkzeuge.menueband als {karte: {order: [Gruppe…], hide: [Gruppe…]}}.
// Gruppen werden über ihre Beschriftung erkannt; unbekannte Namen (z. B. nach einem Update) stören nicht.

/** Gruppen, die sich nicht ausblenden lassen (ohne sie kommt man nicht weiter) */
export const PROTECTED = Object.freeze({ skizze: ["Beenden"] });
const MAX_TABS = 20, MAX_NAMES = 40, MAX_LEN = 40;

const isProtected = (tab, label) => (PROTECTED[tab] || []).includes(label);
const names = (v) => Array.isArray(v) && v.length <= MAX_NAMES && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= MAX_LEN);

/** Prüfen → {ok, value} | {ok:false, error} */
export function validateRibbonLayout(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Menüband-Anordnung erwartet" };
  const keys = Object.keys(v);
  if (keys.length > MAX_TABS) return { ok: false, error: `Höchstens ${MAX_TABS} Registerkarten` };
  const out = {};
  for (const tab of keys) {
    if (!/^[a-z]{1,20}$/.test(tab)) return { ok: false, error: "Unbekannte Registerkarte: " + tab };
    const t = v[tab];
    if (!t || typeof t !== "object" || Array.isArray(t)) return { ok: false, error: "Anordnung für " + tab + " erwartet" };
    const order = t.order ?? [], hide = t.hide ?? [];
    if (!names(order) || !names(hide)) return { ok: false, error: `Gruppennamen für ${tab}: Liste mit höchstens ${MAX_NAMES} Namen erwartet` };
    const h = [...new Set(hide)].filter((x) => !isProtected(tab, x)), o = [...new Set(order)];
    if (h.length || o.length) out[tab] = { order: o, hide: h };
  }
  return { ok: true, value: out };
}

/** Gruppen einer Karte in der eingestellten Reihenfolge; neue Gruppen behalten ihren Platz nach dem Vorgänger */
export function orderedLabels(tab, labels, cfg = {}) {
  const order = (cfg[tab]?.order || []).filter((x) => labels.includes(x));
  const out = [...order];
  labels.forEach((l, i) => {
    if (out.includes(l)) return;
    // hinter den nächsten bekannten Vorgänger aus der Standardreihenfolge
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = out.indexOf(labels[j]); if (k >= 0) { at = k + 1; break; } }
    out.splice(at, 0, l);
  });
  return out;
}

/** Sichtbare Gruppen in Reihenfolge → {groups, hidden: [Namen]} */
export function applyRibbonLayout(tab, groups, cfg = {}) {
  const labels = groups.map((g) => g.label);
  const hide = new Set((cfg[tab]?.hide || []).filter((x) => !isProtected(tab, x)));
  const byLabel = new Map(groups.map((g) => [g.label, g]));
  const ordered = orderedLabels(tab, labels, cfg);
  return { groups: ordered.filter((l) => !hide.has(l)).map((l) => byLabel.get(l)), hidden: ordered.filter((l) => hide.has(l)) };
}

const withTab = (cfg, tab, t) => {
  const next = { ...cfg };
  if (t.order.length || t.hide.length) next[tab] = t; else delete next[tab];
  return next;
};

/** Gruppe aus- oder einblenden; die letzte sichtbare Gruppe und geschützte Gruppen bleiben */
export function setGroupHidden(cfg, tab, label, hidden, labels) {
  const t = { order: [...(cfg[tab]?.order || [])], hide: [...(cfg[tab]?.hide || [])] };
  if (hidden) {
    if (isProtected(tab, label)) return { ok: false, error: `»${label}« lässt sich nicht ausblenden` };
    const visible = labels.filter((l) => l !== label && !t.hide.includes(l));
    if (!visible.length) return { ok: false, error: "Mindestens eine Gruppe muss sichtbar bleiben" };
    if (!t.hide.includes(label)) t.hide.push(label);
  } else t.hide = t.hide.filter((x) => x !== label);
  return { ok: true, value: withTab(cfg, tab, t) };
}

/**
 * Gruppe um eine Stelle verschieben (dir −1 nach links, +1 nach rechts), bezogen auf alle Gruppen der Karte.
 * overHidden: ausgeblendete Nachbarn überspringen, damit sich im Menüband sichtbar etwas tut.
 */
export function moveGroup(cfg, tab, label, dir, labels, { overHidden = false } = {}) {
  const order = orderedLabels(tab, labels, cfg);
  const hide = new Set(overHidden ? cfg[tab]?.hide || [] : []);
  let i = order.indexOf(label);
  if (i < 0) return { ok: false, error: "Gruppe steht schon am Rand" };
  let moved = false;
  for (;;) {
    const j = i + dir;
    if (j < 0 || j >= order.length) break;
    [order[i], order[j]] = [order[j], order[i]];
    i = j;
    moved = true;
    if (!hide.has(order[i - dir])) break;
  }
  if (!moved || (hide.size && hide.has(order[i - dir]))) return { ok: false, error: "Gruppe steht schon am Rand" };
  const same = order.every((l, k) => l === labels[k]);
  return { ok: true, value: withTab(cfg, tab, { order: same ? [] : order, hide: [...(cfg[tab]?.hide || [])] }) };
}

/** Eine Karte (oder mit tab = null alles) auf den Standard */
export function resetRibbonLayout(cfg, tab = null) {
  if (!tab) return {};
  const next = { ...cfg };
  delete next[tab];
  return next;
}
