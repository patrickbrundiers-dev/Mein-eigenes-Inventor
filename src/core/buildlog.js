// Berechnungsprotokoll: je Neuaufbau eines Bauteils Dauer, Featureanzahl und Meldungen (Fehler/Warnungen je Feature).
// Ringpuffer nur im Speicher (Bauteilnamen sind Projektdaten und gehören nicht ins Fehlerprotokoll).

export const BUILDLOG_MAX = 200;

/** Eintrag aus Bauteil und Ergebnis des Kernels (status: {featureId: {ok, error?, warning?}}) */
export function buildEntry(part, res, ms, time = Date.now()) {
  const name = (id) => part.features.find((f) => f.id === id)?.name || part.features.find((f) => f.id === id)?.type || id;
  const msgs = [];
  for (const [id, s] of Object.entries(res?.status || {})) {
    if (s && !s.ok) msgs.push({ kind: "Fehler", feature: name(id), text: String(s.error || "fehlgeschlagen") });
    else if (s?.warning) msgs.push({ kind: "Warnung", feature: name(id), text: String(s.warning) });
  }
  return { time, part: part.name, ms: Math.round(ms), features: part.features.filter((f) => !f.suppressed).length, bodies: res?.bodies?.length ?? 0, msgs };
}

/** Eine Zeile Text (für das Fehlerprotokoll und »Kopieren«) */
export function entryLine(e) {
  const t = new Date(e.time).toISOString().slice(11, 19);
  const head = `${t}  ${e.part}: ${e.ms} ms, ${e.features} Feature(s), ${e.bodies} Körper`;
  return e.msgs.length ? head + "\n" + e.msgs.map((m) => `    ${m.kind} ${m.feature}: ${m.text}`).join("\n") : head;
}

export class BuildLog {
  constructor(max = BUILDLOG_MAX) { this.max = max; this.list = []; }
  add(e) { this.list.push(e); if (this.list.length > this.max) this.list.splice(0, this.list.length - this.max); return e; }
  entries() { return [...this.list].reverse(); } // neueste zuerst
  clear() { this.list = []; }
  text() { return this.entries().map(entryLine).join("\n"); }
}
