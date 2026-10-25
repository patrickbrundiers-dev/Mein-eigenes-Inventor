// Befehlsliste und Tastaturkürzel: Daten, Normalisierung, Konfliktprüfung. Ohne DOM.
// Ausgeführt werden die Befehle in src/ui/commands.js.
//
// scope: global (überall) · part · sketch · assembly · drawing · 3d (Bauteil + Baugruppe).
// Kürzel ohne Strg/Alt wirken nur, wenn kein Eingabefeld den Fokus hat.

export const COMMANDS = [
  { id: "file.new", label: "Neues Projekt", group: "Datei", scope: "global", key: "Strg+N", typing: true },
  { id: "file.open", label: "Projekt öffnen", group: "Datei", scope: "global", key: "Strg+O", typing: true },
  { id: "file.save", label: "Speichern", group: "Datei", scope: "global", key: "Strg+S", typing: true },
  { id: "file.saveAs", label: "Speichern unter", group: "Datei", scope: "global", key: "Strg+Umschalt+S", typing: true },
  { id: "file.newPart", label: "Neues Bauteil", group: "Datei", scope: "global" },
  { id: "file.newAssembly", label: "Neue Baugruppe", group: "Datei", scope: "global" },
  { id: "file.importStep", label: "STEP als Bauteil importieren", group: "Datei", scope: "global" },
  { id: "app.settings", label: "Einstellungen", group: "Programm", scope: "global", key: "Strg+,", typing: true, keywords: "optionen konfiguration" },
  { id: "app.search", label: "Befehl suchen", group: "Programm", scope: "global", key: "Strg+K", typing: true, keywords: "werkzeugsuche palette" },
  { id: "edit.undo", label: "Rückgängig", group: "Bearbeiten", scope: "global", key: "Strg+Z" },
  { id: "edit.redo", label: "Wiederholen", group: "Bearbeiten", scope: "global", key: "Strg+Y" },

  { id: "view.fit", label: "Alles zeigen", group: "Ansicht", scope: "3d", key: "F6", keywords: "zoom einpassen" },
  { id: "view.fitSel", label: "Auswahl zeigen", group: "Ansicht", scope: "3d", key: "Umschalt+F6", keywords: "zoom" },
  { id: "view.saveNamed", label: "Ansicht speichern", group: "Ansicht", scope: "3d", keywords: "benannte ansicht merken kamera" },
  { id: "view.named", label: "Gespeicherte Ansichten", group: "Ansicht", scope: "3d", keywords: "benannte ansicht kamera" },
  { id: "view.iso", label: "Ansicht Iso", group: "Ansicht", scope: "3d", keywords: "isometrisch" },
  { id: "view.front", label: "Ansicht Vorne", group: "Ansicht", scope: "3d" },
  { id: "view.back", label: "Ansicht Hinten", group: "Ansicht", scope: "3d" },
  { id: "view.left", label: "Ansicht Links", group: "Ansicht", scope: "3d" },
  { id: "view.right", label: "Ansicht Rechts", group: "Ansicht", scope: "3d" },
  { id: "view.top", label: "Ansicht Oben", group: "Ansicht", scope: "3d" },
  { id: "view.bottom", label: "Ansicht Unten", group: "Ansicht", scope: "3d" },
  { id: "view.normal", label: "Normal zur Fläche", group: "Ansicht", scope: "3d", keywords: "senkrecht blick" },
  { id: "view.perspective", label: "Perspektive ein/aus", group: "Ansicht", scope: "3d", keywords: "orthogonal projektion" },
  { id: "view.mode.kanten", label: "Darstellung schattiert mit Kanten", group: "Ansicht", scope: "3d" },
  { id: "view.mode.schattiert", label: "Darstellung schattiert", group: "Ansicht", scope: "3d" },
  { id: "view.mode.draht", label: "Darstellung Drahtmodell", group: "Ansicht", scope: "3d", keywords: "wireframe" },
  { id: "view.mode.transparent", label: "Darstellung transparent", group: "Ansicht", scope: "3d" },
  { id: "view.showAll", label: "Alle Körper einblenden", group: "Ansicht", scope: "3d", keywords: "sichtbarkeit ausgeblendet" },
  { id: "view.hideSel", label: "Gewählten Körper ausblenden", group: "Ansicht", scope: "3d", keywords: "sichtbarkeit verbergen" },
  { id: "view.isolateSel", label: "Gewählten Körper isolieren", group: "Ansicht", scope: "3d", keywords: "sichtbarkeit nur" },
  { id: "select.all", label: "Auswahlfilter: alles", group: "Auswahl", scope: "part" },
  { id: "select.faces", label: "Auswahlfilter: nur Flächen", group: "Auswahl", scope: "part" },
  { id: "select.edges", label: "Auswahlfilter: nur Kanten", group: "Auswahl", scope: "part" },
  { id: "select.everything", label: "Alles auswählen", group: "Auswahl", scope: "part", key: "Strg+A", keywords: "markieren flächen kanten" },
  { id: "select.invert", label: "Auswahl umkehren", group: "Auswahl", scope: "part", key: "Strg+I", keywords: "invertieren" },
  { id: "view.clipX", label: "Schnitt X ein/aus", group: "Ansicht", scope: "3d", keywords: "schnittebene clipping" },
  { id: "view.clipY", label: "Schnitt Y ein/aus", group: "Ansicht", scope: "3d", keywords: "schnittebene clipping" },
  { id: "view.clipZ", label: "Schnitt Z ein/aus", group: "Ansicht", scope: "3d", keywords: "schnittebene clipping" },

  { id: "tools.measure", label: "Messen", group: "Prüfen", scope: "3d", key: "M", keywords: "abstand winkel radius durchmesser länge fläche" },
  { id: "part.sketch", label: "Skizze erstellen", group: "3D-Modell", scope: "part", key: "S" },
  { id: "part.extrude", label: "Extrusion", group: "3D-Modell", scope: "part", key: "E", keywords: "aufsatz extrudieren" },
  { id: "part.cutExtrude", label: "Ausschnitt", group: "3D-Modell", scope: "part", keywords: "tasche" },
  { id: "part.revolve", label: "Drehung", group: "3D-Modell", scope: "part", keywords: "rotation" },
  { id: "part.hole", label: "Bohrung", group: "3D-Modell", scope: "part", key: "H", keywords: "gewinde senkung" },
  { id: "part.emboss", label: "Prägen / Gravieren", group: "3D-Modell", scope: "part", keywords: "gravur beschriftung text logo abwickeln rohr" },
  { id: "part.profile", label: "Rohr / Profil", group: "3D-Modell", scope: "part" },
  { id: "part.frame", label: "Rahmen aus Skizze", group: "3D-Modell", scope: "part" },
  { id: "part.knickrahmen", label: "Knickrahmen", group: "3D-Modell", scope: "part" },
  { id: "part.normteil", label: "Normteil", group: "3D-Modell", scope: "part", keywords: "schraube mutter scheibe gewindestange spannschloss iso 4014 4017 4032 7089 din 976 1480 sechskant verbindungselement" },
  { id: "part.platte", label: "Stirn-/Fußplatte", group: "3D-Modell", scope: "part", keywords: "kopfplatte fussplatte stirnplatte anschlussblech platte bohrbild stahlbau" },
  { id: "part.rippe", label: "Rippe (Steife)", group: "3D-Modell", scope: "part", keywords: "steife rippe knotenblech versteifung stahlbau" },
  { id: "part.gelaender", label: "Geländer (Generator)", group: "3D-Modell", scope: "part", keywords: "geländer pfosten handlauf staketen füllung brüstung generator" },
  { id: "part.tor", label: "Tor (Generator)", group: "3D-Modell", scope: "part", keywords: "tor hoftor gartentor doppeltor flügel rundbogen stichbogen generator" },
  { id: "part.treppe", label: "Treppe (Generator)", group: "3D-Modell", scope: "part", keywords: "treppe geradläufig l-form u-form podest viertelgewendelt halbgewendelt wange holm stufen gitterrost steigung auftritt din 18065 generator" },
  { id: "part.balkon", label: "Balkon (Generator)", group: "3D-Modell", scope: "part", keywords: "balkon vorstellbalkon anbaubalkon rahmen belag stützen geländer wandanschluss generator" },
  { id: "part.rahmenecke", label: "Rahmenecke biegesteif (Generator)", group: "3D-Modell", scope: "part", keywords: "eckstoß rahmenecke stirnplatte riegel stütze hea ipe verschraubung steife stahlbau halle" },
  { id: "part.pfette", label: "Pfette mit Pfettenschuhen (Generator)", group: "3D-Modell", scope: "part", keywords: "pfette pfettenschuh pfettenstoß binder dach carport vordach stahlbau" },
  { id: "part.windverband", label: "Windverband mit Spannschloss (Generator)", group: "3D-Modell", scope: "part", keywords: "windverband verband diagonale rundstahl spannschloss knotenblech aussteifung stahlbau" },
  { id: "part.spindel", label: "Spindeltreppe (Generator)", group: "3D-Modell", scope: "part", keywords: "spindeltreppe wendeltreppe spirale mittelrohr stufen generator" },
  { id: "file.png", label: "Bild der Ansicht (PNG)", group: "Export", scope: "3d", keywords: "png bild screenshot foto ansicht export" },
  { id: "file.listsXlsx", label: "Listen als Excel (.xlsx)", group: "Export", scope: "3d", keywords: "excel xlsx zuschnittliste stückliste nahtliste tabelle export" },
  { id: "part.naht", label: "Schweißnaht", group: "3D-Modell", scope: "part", keywords: "schweissen kehlnaht v-naht hv-naht iso 2553 a-maß nahtliste" },
  { id: "part.kantteil", label: "Kantteil (Blech)", group: "3D-Modell", scope: "part", keywords: "blech kantteil abkanten abwicklung biegen winkel u-profil z-profil kassette abdeckung laser dxf" },
  { id: "part.regelkoerper", label: "Regelkörper", group: "3D-Modell", scope: "part", keywords: "quader zylinder kugel kegel kegelstumpf torus ring pyramide grundkörper primitiv" },
  { id: "part.biegerohr", label: "Rohr gebogen (über Polygonzug)", group: "3D-Modell", scope: "part", keywords: "biegen bogen biegeradius biegeliste handlauf bügel rohrconnect" },
  { id: "part.profilzug", label: "Profilzug 3D", group: "3D-Modell", scope: "part", keywords: "räumlich eckpunkte polygonzug rahmen gehrung zwei ebenen" },
  { id: "part.fillet", label: "Rundung", group: "3D-Modell", scope: "part", keywords: "verrundung" },
  { id: "part.chamfer", label: "Fase", group: "3D-Modell", scope: "part" },
  { id: "part.shell", label: "Wandung", group: "3D-Modell", scope: "part", keywords: "schale aushöhlen" },
  { id: "part.patternLin", label: "Muster rechteckig", group: "3D-Modell", scope: "part", keywords: "linear" },
  { id: "part.patternCirc", label: "Muster kreisförmig", group: "3D-Modell", scope: "part" },
  { id: "part.mirror", label: "Spiegeln", group: "3D-Modell", scope: "part" },
  { id: "part.params", label: "Parameter", group: "3D-Modell", scope: "part", keywords: "variablen formeln" },
  { id: "part.importStep", label: "STEP einfügen", group: "3D-Modell", scope: "part" },
  { id: "doc.newDrawing", label: "Zeichnung ableiten", group: "3D-Modell", scope: "3d" },

  { id: "sketch.select", label: "Skizze: Auswählen", group: "Skizze", scope: "sketch", key: "S" },
  { id: "sketch.line", label: "Skizze: Linie", group: "Skizze", scope: "sketch", key: "L", keywords: "polylinie" },
  { id: "sketch.rect", label: "Skizze: Rechteck", group: "Skizze", scope: "sketch", key: "R" },
  { id: "sketch.rectc", label: "Skizze: Rechteck aus Mitte", group: "Skizze", scope: "sketch" },
  { id: "sketch.circle", label: "Skizze: Kreis", group: "Skizze", scope: "sketch", key: "C" },
  { id: "sketch.arc3", label: "Skizze: Bogen", group: "Skizze", scope: "sketch", key: "A" },
  { id: "sketch.arcc", label: "Skizze: Bogen um Mittelpunkt", group: "Skizze", scope: "sketch" },
  { id: "sketch.importDxf", label: "Skizze: DXF importieren", group: "Skizze", scope: "sketch", keywords: "dxf einlesen laden fremdzeichnung laserkontur autocad übernehmen" },
  { id: "sketch.clean", label: "Skizze: Säubern", group: "Skizze", scope: "sketch", keywords: "aufräumen doppelte überlappende linien endpunkte zusammenführen dxf import bereinigen" },
  { id: "sketch.autodim", label: "Skizze: Vollständig bemaßen", group: "Skizze", scope: "sketch", keywords: "automatische bemaßung auto maße" },
  { id: "sketch.spline", label: "Skizze: Spline", group: "Skizze", scope: "sketch", keywords: "freiform kurve bspline" },
  { id: "sketch.ellipse", label: "Skizze: Ellipse", group: "Skizze", scope: "sketch", keywords: "oval" },
  { id: "sketch.slot", label: "Skizze: Langloch", group: "Skizze", scope: "sketch", keywords: "nut schlitz" },
  { id: "sketch.polygon", label: "Skizze: Polygon", group: "Skizze", scope: "sketch", keywords: "vieleck sechskant" },
  { id: "sketch.selectAll", label: "Skizze: Alles auswählen", group: "Skizze", scope: "sketch", key: "Strg+A", keywords: "markieren" },
  { id: "sketch.offset", label: "Skizze: Versatz", group: "Skizze", scope: "sketch", keywords: "offset parallel abstand kontur" },
  { id: "sketch.pattern", label: "Skizze: Rechteckmuster", group: "Skizze", scope: "sketch", keywords: "muster reihe feld array kopieren" },
  { id: "sketch.cpattern", label: "Skizze: Kreismuster", group: "Skizze", scope: "sketch", keywords: "muster lochkreis polar rund array" },
  { id: "sketch.mirror", label: "Skizze: Spiegeln", group: "Skizze", scope: "sketch", keywords: "symmetrisch kopieren" },
  { id: "sketch.point", label: "Skizze: Punkt", group: "Skizze", scope: "sketch", key: "P" },
  { id: "sketch.dimension", label: "Skizze: Bemaßung", group: "Skizze", scope: "sketch", key: "D", keywords: "maß" },
  { id: "sketch.trim", label: "Skizze: Stutzen", group: "Skizze", scope: "sketch", key: "T", keywords: "trimmen" },
  { id: "sketch.extend", label: "Skizze: Verlängern", group: "Skizze", scope: "sketch", keywords: "extend bis kante" },
  { id: "sketch.split", label: "Skizze: Teilen", group: "Skizze", scope: "sketch", keywords: "split trennen brechen" },
  { id: "sketch.sfillet", label: "Skizze: Rundung", group: "Skizze", scope: "sketch", key: "F" },
  { id: "sketch.project", label: "Skizze: Kante projizieren", group: "Skizze", scope: "sketch" },
  { id: "sketch.construction", label: "Skizze: Konstruktionslinie ein/aus", group: "Skizze", scope: "sketch", key: "X", keywords: "hilfslinie" },
  { id: "sketch.horizontal", label: "Abhängigkeit horizontal", group: "Skizze", scope: "sketch" },
  { id: "sketch.vertical", label: "Abhängigkeit vertikal", group: "Skizze", scope: "sketch" },
  { id: "sketch.coincident", label: "Abhängigkeit koinzident", group: "Skizze", scope: "sketch" },
  { id: "sketch.parallel", label: "Abhängigkeit parallel", group: "Skizze", scope: "sketch" },
  { id: "sketch.perpendicular", label: "Abhängigkeit senkrecht", group: "Skizze", scope: "sketch" },
  { id: "sketch.equal", label: "Abhängigkeit gleich", group: "Skizze", scope: "sketch" },
  { id: "sketch.tangent", label: "Abhängigkeit tangential", group: "Skizze", scope: "sketch" },
  { id: "sketch.fix", label: "Abhängigkeit fixieren", group: "Skizze", scope: "sketch" },
  { id: "sketch.midpoint", label: "Abhängigkeit Mittelpunkt", group: "Skizze", scope: "sketch" },
  { id: "sketch.concentric", label: "Abhängigkeit konzentrisch", group: "Skizze", scope: "sketch" },
  { id: "sketch.collinear", label: "Abhängigkeit kollinear", group: "Skizze", scope: "sketch" },
  { id: "sketch.symmetric", label: "Abhängigkeit symmetrisch", group: "Skizze", scope: "sketch" },
  { id: "sketch.gridsnap", label: "Skizze: Rasterfang ein/aus", group: "Skizze", scope: "sketch" },
  { id: "sketch.finish", label: "Skizze fertig", group: "Skizze", scope: "sketch", keywords: "beenden" },

  { id: "asm.normteil", label: "Normteil einfügen", group: "Baugruppe", scope: "assembly", keywords: "schraube mutter scheibe gewindestange spannschloss iso din verbindungselement" },
  { id: "asm.place", label: "Bauteil platzieren", group: "Baugruppe", scope: "assembly", keywords: "komponente einfügen" },
  { id: "asm.align", label: "Fläche an Fläche", group: "Baugruppe", scope: "assembly", keywords: "abhängigkeit" },
  { id: "asm.alignFlush", label: "Bündig", group: "Baugruppe", scope: "assembly", keywords: "abhängigkeit" },
  { id: "asm.alignConc", label: "Konzentrisch", group: "Baugruppe", scope: "assembly", keywords: "abhängigkeit achse" },
  { id: "asm.bom", label: "Stückliste", group: "Baugruppe", scope: "assembly" },
  { id: "asm.cutlist", label: "Zuschnittliste", group: "Baugruppe", scope: "assembly" },
  { id: "asm.collide", label: "Kollision prüfen", group: "Baugruppe", scope: "assembly" },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));
export const commandDef = (id) => BY_ID.get(id);

/** Diese Tasten bleiben fest: Abbrechen, Löschen und die Maßeingabe in der Skizze (Ziffern, Komma, Tab …) */
const RESERVED = new Set(["Esc", "Entf", "Rücktaste", "Tab", "Eingabe", "Leertaste", ..."0123456789".split(""), ",", ".", "-", "+", "*", "/"]);
const NAMED = { Escape: "Esc", Delete: "Entf", Backspace: "Rücktaste", Enter: "Eingabe", " ": "Leertaste", Home: "Pos1", End: "Ende", PageUp: "BildAuf", PageDown: "BildAb", Insert: "Einfg", ArrowUp: "Hoch", ArrowDown: "Runter", ArrowLeft: "Links", ArrowRight: "Rechts", Tab: "Tab" };
const MODS = ["Strg", "Alt", "Umschalt"];
const KEY_RE = /^(F([1-9]|1[0-2])|[A-ZÄÖÜ0-9]|Pos1|Ende|BildAuf|BildAb|Einfg|Hoch|Runter|Links|Rechts|Esc|Entf|Rücktaste|Eingabe|Leertaste|Tab|[,.\-+*/#<])$/;

/** Tastendruck → Kürzeltext wie »Strg+Umschalt+S«; nur Modifikatortaste → null */
export function comboFromEvent(e) {
  const k = e.key;
  if (!k || ["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "Dead", "Unidentified", "Process"].includes(k)) return null;
  let name = NAMED[k] || (k.length === 1 ? k.toUpperCase() : k);
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  // Strg+Umschalt+1 liefert »!« – die Ziffer der Taste nehmen
  if (mod && e.code?.startsWith("Digit")) name = e.code.slice(5);
  // Umschalt zählt bei Buchstaben und Sondertasten; bei Zeichen bestimmt es nur das Zeichen (»;« statt »,«)
  const shift = e.shiftKey && (/^[A-ZÄÖÜ0-9]$/.test(name) && (mod || /^[A-ZÄÖÜ]$/.test(name)) || k.length > 1);
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Strg");
  if (e.altKey) parts.push("Alt");
  if (shift) parts.push("Umschalt");
  parts.push(name);
  return parts.join("+");
}

/** Kürzeltext prüfen und in feste Reihenfolge bringen; Fehler als Text */
export function parseCombo(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Leeres Kürzel" };
  const parts = text.split("+").map((p) => p.trim());
  // »Strg++« → Taste »+«
  if (text.endsWith("++")) { parts.splice(parts.length - 2, 2, "+"); }
  const key = parts.pop();
  const mods = new Set();
  for (const m of parts) {
    const n = { ctrl: "Strg", strg: "Strg", alt: "Alt", shift: "Umschalt", umschalt: "Umschalt" }[m.toLowerCase()];
    if (!n) return { ok: false, error: `Unbekannte Zusatztaste »${m}«` };
    mods.add(n);
  }
  const k = key.length === 1 ? key.toUpperCase() : key;
  if (!KEY_RE.test(k)) return { ok: false, error: `Unbekannte Taste »${key}«` };
  const combo = [...MODS.filter((m) => mods.has(m)), k].join("+");
  if (!mods.has("Strg") && !mods.has("Alt") && RESERVED.has(k)) return { ok: false, error: `»${combo}« ist fest belegt (Abbrechen, Löschen oder Maßeingabe)` };
  if (mods.size === 1 && mods.has("Umschalt") && /^[A-ZÄÖÜ]$/.test(k)) return { ok: false, error: `»${combo}« würde Großbuchstaben in Eingaben stören` };
  return { ok: true, combo };
}

const overlap = (a, b) => a === b || a === "global" || b === "global" || (a === "3d" && (b === "part" || b === "assembly")) || (b === "3d" && (a === "part" || a === "assembly"));

/** Wirksame Belegung: Standard, überschrieben durch Benutzerwerte ("" = keine Taste) */
export function effectiveKeymap(user = {}) {
  const map = {};
  for (const c of COMMANDS) {
    const v = Object.prototype.hasOwnProperty.call(user, c.id) ? user[c.id] : c.key;
    if (v) map[c.id] = v;
  }
  return map;
}

/** Doppelte Belegungen in überlappenden Bereichen: [{combo, ids:[a,b]}] */
export function keymapConflicts(map) {
  const out = [];
  const ids = Object.keys(map);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = commandDef(ids[i]), b = commandDef(ids[j]);
      if (a && b && map[ids[i]] === map[ids[j]] && overlap(a.scope, b.scope)) out.push({ combo: map[ids[i]], ids: [a.id, b.id] });
    }
  }
  return out;
}

/** Benutzerbelegung prüfen (für Einstellungen): bekannte Befehle, gültige Tasten, keine Konflikte */
export function validateKeymap(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return { ok: false, error: "Zuordnung Befehl → Taste erwartet" };
  const clean = {};
  for (const [id, v] of Object.entries(user)) {
    if (!BY_ID.has(id)) return { ok: false, error: `Unbekannter Befehl »${id}«` };
    if (v === "") { if (BY_ID.get(id).key) clean[id] = ""; continue; }
    const r = parseCombo(v);
    if (!r.ok) return { ok: false, error: `${BY_ID.get(id).label}: ${r.error}` };
    if (r.combo !== BY_ID.get(id).key) clean[id] = r.combo;
  }
  const conf = keymapConflicts(effectiveKeymap(clean));
  if (conf.length) return { ok: false, error: `»${conf[0].combo}« doppelt belegt: ${conf[0].ids.map((i) => BY_ID.get(i).label).join(" und ")}` };
  return { ok: true, value: clean };
}

/** Befehl zu einem Tastendruck im aktuellen Modus */
export function commandForCombo(map, combo, mode) {
  const scopes = mode === "sketch" ? ["sketch", "global"] : mode === "part" ? ["part", "3d", "global"] : mode === "assembly" ? ["assembly", "3d", "global"] : mode === "drawing" ? ["drawing", "global"] : ["global"];
  for (const s of scopes) {
    const c = COMMANDS.find((x) => x.scope === s && map[x.id] === combo);
    if (c) return c;
  }
  return null;
}

/** Ist der Befehl im Modus sinnvoll? */
export function inScope(cmd, mode) {
  if (cmd.scope === "global") return true;
  if (cmd.scope === "3d") return mode === "part" || mode === "assembly";
  return cmd.scope === mode;
}

/** Befehlssuche: alle Wörter müssen vorkommen; Treffer am Wortanfang zuerst */
export function searchCommands(query, mode) {
  const q = norm(query);
  const list = COMMANDS.filter((c) => !mode || inScope(c, mode));
  if (!q) return list;
  const words = q.split(/\s+/);
  const scored = [];
  for (const c of list) {
    const label = norm(c.label), hay = norm([c.label, c.group, c.keywords].filter(Boolean).join(" "));
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    if (label.startsWith(words[0])) score += 3;
    if (label.split(/[\s:/]+/).some((t) => t.startsWith(words[0]))) score += 2;
    if (label.includes(q)) score += 1;
    scored.push({ c, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.c);
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").trim();
