// Parameterstudie (SolidCraft »Parameter sweep«): ein Parameter durchläuft Werte, je Wert wird eine Kopie des
// Bauteils gerechnet und gemeldet, was dabei fehlschlägt oder sich verändert. Hier: Werteliste und Auswertung (ohne Kern).

/** Werte aus »von/bis/Schritte« (steps Abschnitte → steps + 1 Werte) oder aus einer Liste »10; 20; 35« */
export function sweepValues({ list = "", from = "", to = "", steps = 10 } = {}) {
  const num = (x) => Number(String(x).trim().replace(",", "."));
  if (String(list).trim()) {
    const v = String(list).split(/[;\s]+/).filter(Boolean).map(num);
    if (!v.length || v.some((x) => !Number.isFinite(x))) throw new Error("Werteliste: Zahlen mit ; trennen");
    if (v.length > 200) throw new Error("Höchstens 200 Werte");
    return v;
  }
  const a = num(from), b = num(to), n = Math.round(Number(steps));
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Von und Bis angeben");
  if (!(n >= 1 && n <= 200)) throw new Error("Schritte 1 bis 200");
  return Array.from({ length: n + 1 }, (_, k) => Math.round((a + ((b - a) * k) / n) * 1e9) / 1e9);
}

/** Bauteil-Kopie mit geändertem Parameter (Ausdruck = Zahl) */
export function sweepPart(part, name, value, k) {
  const copy = JSON.parse(JSON.stringify(part));
  copy.id = `${part.id}@studie${k}`;
  const p = (copy.params || []).find((x) => x.name === name);
  if (!p) throw new Error(`Parameter »${name}« fehlt`);
  p.expr = String(value);
  delete copy.endAfter;
  return copy;
}

/**
 * Ergebnis eines Laufs gegen den Ausgangszustand bewerten.
 * res/base: { status: {fid: {ok, error, warning}}, bodies: [{props: {volume}}] }; Rückgabe { fails, warnings, bodies, volume, verdict }
 */
export function sweepRow(res, base, features = []) {
  const name = (id) => features.find((f) => f.id === id)?.name || id;
  const st = Object.entries(res?.status || {});
  const fails = st.filter(([id, s]) => s && !s.ok && !(base?.status?.[id] && !base.status[id].ok)).map(([id, s]) => `${name(id)}: ${s.error || "Fehler"}`);
  const warnings = st.filter(([id, s]) => s?.ok && s.warning && !base?.status?.[id]?.warning).map(([id, s]) => `${name(id)}: ${s.warning}`);
  const bodies = (res?.bodies || []).length;
  const volume = (res?.bodies || []).reduce((s, b) => s + (b.props?.volume || 0), 0);
  const lost = bodies < (base?.bodies || []).length;
  const verdict = fails.length ? "fehler" : lost ? "koerper" : warnings.length ? "warnung" : "ok";
  return { fails, warnings, bodies, volume, verdict };
}
