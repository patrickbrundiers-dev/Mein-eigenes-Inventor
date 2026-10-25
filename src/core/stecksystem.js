// Werkzeuge Stufe 45: Stecksystem (Zapfen und Schlitz, »Tab & Slot«) für Laserteile. Ein Körper (Zapfenteil, z. B.
// eine Rippe oder ein Steg) steht auf einem anderen (Schlitzteil: Platte, Blech oder Rohr). Entlang der Berührlinie
// wachsen Zapfen durch die Wand des Schlitzteils, dort werden passende Schlitze mit Spiel ausgeschnitten. So lassen
// sich die Teile vor dem Schweißen zusammenstecken und richten sich selbst aus.
// Hier steht die reine Rechnung (Lage der Zapfen, Wanddicke); die Körper baut der Kern (src/kernel/build.js).

export const MAX_TABS = 100;
export const TAB_MODES = [["anzahl", "Anzahl"], ["abstand", "Höchstabstand"]];

export const defaultStecksystem = (tab = "", slot = "") => ({ type: "stecksystem", tab, slot, mode: "anzahl", count: "3", spacing: "150", width: "20", edge: "15", clearance: "0.2", length: "", over: "0" });

/**
 * Mitten der Zapfen entlang der Berührlinie (0 … L).
 * mode "anzahl": count Zapfen gleichmäßig zwischen den Randabständen; "abstand": so viele, dass der Abstand ≤ spacing bleibt.
 */
export function tabLayout(L, { mode = "anzahl", count = 3, spacing = 150, width, edge = 0 }) {
  if (!(width > 0)) throw new Error("Zapfenbreite muss > 0 sein");
  if (!(edge >= 0)) throw new Error("Randabstand darf nicht negativ sein");
  const usable = L - 2 * edge;
  if (usable < width - 1e-9) throw new Error(`Berührlinie ${round(L)} mm ist zu kurz für Zapfen ${round(width)} mm mit Randabstand ${round(edge)} mm`);
  let n;
  if (mode === "abstand") {
    if (!(spacing > 0)) throw new Error("Höchstabstand muss > 0 sein");
    n = Math.max(1, Math.ceil((usable - width) / spacing - 1e-9) + 1);
  } else {
    n = Math.round(count);
    if (!(n >= 1)) throw new Error("Mindestens ein Zapfen");
  }
  if (n > MAX_TABS) throw new Error(`Höchstens ${MAX_TABS} Zapfen`);
  if (n === 1) return [L / 2];
  const pitch = (usable - width) / (n - 1);
  if (pitch < width + 1e-9) throw new Error(`${n} Zapfen à ${round(width)} mm passen nicht auf ${round(usable)} mm – weniger oder schmalere Zapfen`);
  return Array.from({ length: n }, (_, k) => edge + width / 2 + k * pitch);
}

/**
 * Wanddicke unter der Berührfläche aus den Tiefen (Abstand von der Fläche ins Schlitzteil) der Kantenpunkte einer
 * Sonde durch das Schlitzteil: die erste Wand reicht bis zum kleinsten Wert > 0 (bei Rohren kommt danach der Hohlraum).
 */
export function wallFromDepths(depths, eps = 1e-6) {
  const pos = depths.filter((d) => d > eps).sort((a, b) => a - b);
  if (!pos.length) throw new Error("Unter der Berührfläche liegt kein Material des Schlitzteils");
  return pos[0];
}

/** Schlitzmaß aus Zapfen und Spiel: je Seite das Spiel dazu */
export function slotSize(width, thick, clearance) {
  if (!(clearance >= 0)) throw new Error("Spiel darf nicht negativ sein");
  return { w: width + 2 * clearance, t: thick + 2 * clearance };
}

const round = (x) => Math.round(x * 10) / 10;

// ---------- Stecksystem zwischen zwei Komponenten einer Baugruppe (Stufe 46) ----------
// asm.steckverbindungen = [{ id, name, tab: compId, slot: compId, ...Zapfen-Werte wie oben }]. Der Kern plant die
// Quader in der Baugruppe; die Bauteile bekommen je ein Feature »steckzapfen« bzw. »steckschlitz« (steck = id) mit den
// Quadern im Bauteil-System. Wird ein Bauteil mehrfach verbaut, tragen alle Exemplare die Zapfen bzw. Schlitze.
export function defaultSteckverbindung(id, tab, slot) {
  const values = defaultStecksystem();
  delete values.type;
  return { ...values, id, tab, slot };
}

/** Bauteil ohne die Features dieser Steckverbindung (für die Planung: Berührfläche ohne alte Zapfen) */
export function withoutSteck(part, steckId) {
  return { ...part, features: (part.features || []).filter((f) => f.steck !== steckId) };
}

/** Prüfen, ob zwei Komponenten verbunden werden können; Rückgabe Fehlertext oder null */
export function steckProblem(asm, conn, docOf) {
  const A = asm.components.find((c) => c.id === conn.tab), B = asm.components.find((c) => c.id === conn.slot);
  if (!A || !B) return "Komponente fehlt";
  if (A.id === B.id) return "Zwei verschiedene Komponenten wählen";
  const pa = docOf(A.part), pb = docOf(B.part);
  if (pa?.kind !== "part" || pb?.kind !== "part") return "Nur Bauteile (keine Unterbaugruppen)";
  if (pa.id === pb.id) return "Zapfen- und Schlitzteil sind dasselbe Bauteil – eines davon als eigenes Bauteil anlegen";
  if (pa.link || pa.variant || pb.link || pb.variant) return "Verknüpfte Bauteile und Varianten werden in ihrer Quelle geändert";
  return null;
}

/** Ergebnis der Planung in die Bauteile schreiben (ersetzt die Features derselben Verbindung) */
export function applySteck(docs, asm, conn, plan, newId) {
  const comp = (id) => asm.components.find((c) => c.id === id);
  const put = (partId, type, boxes, body) => {
    const d = docs.find((x) => x.id === partId);
    d.features = (d.features || []).filter((f) => f.steck !== conn.id);
    d.features.push({ id: newId(), type, name: `${type === "steckzapfen" ? "Zapfen" : "Schlitze"} ${conn.name || "Stecksystem"}`, steck: conn.id, source: asm.name, body, boxes: boxes.map(roundBox) });
  };
  put(comp(conn.tab).part, "steckzapfen", plan.tabs, plan.tabBody);
  put(comp(conn.slot).part, "steckschlitz", plan.slots, plan.slotBody);
}

/** Steckverbindung entfernen: Features in beiden Bauteilen löschen */
export function removeSteck(docs, steckId) {
  for (const d of docs) if (d.kind === "part" && d.features?.some((f) => f.steck === steckId)) d.features = d.features.filter((f) => f.steck !== steckId);
}

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const roundBox = (b) => ({ c: b.c.map(r6), u: b.u.map(r6), n: b.n.map(r6), w: r6(b.w), t: r6(b.t), depth: r6(b.depth) });
