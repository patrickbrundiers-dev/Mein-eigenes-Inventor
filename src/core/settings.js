import { validateSheetRules, DEFAULT_SHEET_RULES } from "./blechregeln.js";
import { DEFAULT_LAYOUT, validateLayout } from "./layout.js";
import { validateMacros } from "./makros.js";
import { validateMaterialLib } from "./materials.js";
import { validateRibbonLayout } from "./ribbonlayout.js";
import { validateNameTemplate } from "./naming.js";
import { CLASSES } from "./tolerance.js";
import { validateBendTables } from "./bendtable.js";
import { validateKeymap, commandDef } from "./commands.js";
import { validateTemplate, DEFAULT_TEMPLATE } from "./zeichnungsvorlage.js";
import { validatePlasticRules, DEFAULT_PLASTIC_RULES } from "./kunststoff.js";
import { validateHolePresets } from "./bohrvorlagen.js";
import { THEMES } from "./themes.js";

// Benutzereinstellungen: Schema, Standardwerte, Prüfung, Migration, Suche.
// Reines Modul ohne DOM – die Oberfläche (src/ui/prefs.js) speichert und wendet an.
//
// Effektiver Wert (Masterplan 14): Werkzeugstandard < Benutzervorgabe < Dokumentvorgabe < explizite Eingabe.
// Heute gibt es nur die Benutzerebene; Dokument- und Maschinenwerte bleiben bewusst getrennt
// (Dokument → .wcad, Maschinenprofile → eigenes Format, Geheimnisse → einstellungen.json im Hauptprozess).

export const SETTINGS_FORMAT = "werkcad-einstellungen";
export const SETTINGS_VERSION = 1;

/**
 * Kategorien nach Masterplan 13. status: aktiv = alle gezeigten Optionen wirken;
 * teilweise = einige Optionen wirken, Rest geplant; geplant = nur Beschreibung, keine Optionen.
 */
export const CATEGORIES = [
  { id: "allgemein", label: "Allgemein", status: "teilweise", planned: ["Englisch auch für Eigenschaften, Meldungen und Zeichnungstexte", "Zahlenformat"], note: "Sprache: Englisch gilt in dieser Ausbaustufe für Menüband, Befehlssuche und Befehlsnamen; Eigenschaften, Meldungen und Zeichnungstexte bleiben deutsch." },
  { id: "ansicht", label: "3D-Ansicht", status: "aktiv", note: "Schnittebene: Menüband Ansicht → Schnitt (gilt nur für die Sitzung)." },
  { id: "skizze", label: "Skizzen", status: "aktiv" },
  { id: "maus3d", label: "3D-Maus", status: "aktiv", note: "SpaceMouse und SpaceNavigator von 3Dconnexion über USB oder Empfänger. Ansicht gleichzeitig verschieben und drehen; in Skizzen nur Schwenken und Zoomen." },
  { id: "werkzeuge", label: "Werkzeuge und Tastatur", status: "teilweise", note: "Befehlssuche: Strg+K. Fest belegt bleiben Esc (abbrechen), Entf (löschen) sowie Ziffern, Komma und Tab für die Maßeingabe." },
  { id: "darstellung", label: "Darstellung", status: "aktiv", note: "Tooltips im Menüband erscheinen nach knapp einer halben Sekunde mit Kurzbeschreibung; beim Weiterfahren sofort." },
  { id: "dokument", label: "Dokument und Modell", status: "aktiv", note: "Gilt für neu angelegte Dokumente; vorhandene bleiben, wie sie sind. Toleranz am einzelnen Maß: in der Zeichnung Doppelklick auf das Maß. Platzhalter: {n} laufende Nummer ({n:3} = dreistellig), {projekt}, {datum}, bei Zeichnungen {quelle}." },
  { id: "material", label: "Materialien", status: "aktiv", note: "Eigene Werkstoffe gelten für Masse, Trägheit, Zuschnittliste und Zeichnung. Benutzte eigene Werkstoffe werden als Kopie in der Projektdatei gespeichert, damit sie auf anderen Rechnern stimmen." },
  { id: "kernel", label: "CAD-Kernel und Leistung", status: "aktiv", note: "Die Rechengenauigkeit des Kernels ist fest und bewusst nicht einstellbar: gröbere Werte können Körper beschädigen. Maßtoleranzen stehen unter Dokument und Modell. Neu berechnen: F5 oder Menüband 3D-Modell → Verwalten. Berechnungsprotokoll: Befehlssuche (Strg+K) → »Berechnungsprotokoll«." },
  { id: "dateien", label: "Dateien und Datensicherheit", status: "aktiv", note: "Speichern ist immer atomar: erst vollständig schreiben, dann umbenennen. Datei → Schreibgeschützt öffnen bzw. Projekt paketieren." },
  { id: "blech", label: "Blechparameter", status: "aktiv", note: "Blechregeln bündeln Werkstoff, Dicke, Radius und Abwicklung für Kantteile. Biegetabellen gelten für Kantteil und Knickrahmen, wenn dort als Biegeregel »Biegetabelle des Werkstoffs« gewählt ist. Benutzte Tabellen werden als Kopie in der Projektdatei gespeichert." },
  { id: "fertigung", label: "Rohrlaser und Fertigung", status: "teilweise", planned: ["mehrere Maschinenprofile (getrennt von den CAD-Einstellungen gespeichert)"], note: "Fertigungsprüfung der Zuschnittliste (Bauteil und Zuschnittliste). Startwerte aus den Beispielmaschinen der Rohrlaser-Kalkulation – bitte an die eigene Maschine anpassen. 0 = Regel aus." },
  { id: "kalkulation", label: "Kalkulation", status: "aktiv", note: "Vorkalkulation aus Stückliste, Zuschnitt, Stangenplan und Nahtliste (Baugruppe → Kalkulation, Fertigungsmappe, Angebotsblatt). Startwerte sind Beispiele – bitte an den eigenen Betrieb anpassen." },
  { id: "lizenz", label: "Lizenz", status: "aktiv", note: "Ohne Lizenz läuft PBCAD 30 Tage als Testversion. Lizenzschlüssel vergibt Patrick Brundiers; für eine an den Rechner gebundene Lizenz die Rechner-ID mitschicken." },
  { id: "updates", label: "Updates", status: "aktiv" },
  { id: "datenschutz", label: "Datenschutz und Diagnose", status: "teilweise", note: "PBCAD sendet keine Diagnosedaten. Das Fehlerprotokoll bleibt lokal und enthält keine Projektdaten." },
];

export const DISPLAY = [
  { value: "kanten", label: "Schattiert mit Kanten" },
  { value: "schattiert", label: "Schattiert" },
  { value: "draht", label: "Drahtmodell" },
  { value: "transparent", label: "Transparent" },
  { value: "foto", label: "Fotorealistisch" },
];
const QUAL = [{ value: "grob", label: "Schnell" }, { value: "normal", label: "Normal" }, { value: "fein", label: "Fein" }];

/** Alle einstellbaren Werte. Jede Option hier wirkt tatsächlich (sonst steht sie unter planned). */
export const SETTINGS = [
  { key: "allgemein.sprache", cat: "allgemein", label: "Sprache der Oberfläche", type: "enum", default: "de", options: [{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }], help: "Englisch: Menüband, Befehlssuche und Befehlsnamen. Eigenschaften und Meldungen bleiben vorerst deutsch." },
  { key: "allgemein.ordner", cat: "allgemein", label: "Standardordner für Projekte", type: "folder", default: "", help: "Hier starten »Öffnen« und »Speichern unter«. Leer = zuletzt benutzter Ordner. Nur in der Desktop-Version." },
  { key: "allgemein.autosaveSekunden", cat: "allgemein", label: "Automatische Sicherung nach", unit: "s", type: "number", default: 1.5, min: 0.5, max: 120, help: "Wartezeit nach der letzten Änderung, bevor die Wiederherstellungsdatei geschrieben wird. Abschalten ist nicht vorgesehen." },
  { key: "allgemein.loeschenBestaetigen", cat: "allgemein", label: "Löschen von Dokumenten bestätigen", type: "bool", default: true },
  { key: "allgemein.startAnsicht", cat: "allgemein", label: "Startseite: zuletzt verwendete Dateien als", type: "enum", default: "kacheln", options: [{ value: "kacheln", label: "Kacheln mit Vorschaubild" }, { value: "liste", label: "Liste" }], help: "Auch direkt auf der Startseite umschaltbar." },
  { key: "allgemein.startSortierung", cat: "allgemein", label: "Startseite: sortieren nach", type: "enum", default: "geaendert", options: [{ value: "geaendert", label: "Änderungsdatum" }, { value: "geoeffnet", label: "zuletzt geöffnet" }, { value: "name", label: "Name" }] },
  { key: "allgemein.dezimalstellen", cat: "allgemein", label: "Dezimalstellen für Messwerte", type: "int", default: 3, min: 0, max: 6, help: "Anzeige beim Messen (Abstand, Winkel). Gerechnet wird immer mit voller Genauigkeit." },
  { key: "messen.winkelstellen", cat: "allgemein", label: "Dezimalstellen für Winkel beim Messen", type: "int", default: 2, min: 0, max: 6, help: "Winkelgenauigkeit im Messwerkzeug." },
  { key: "allgemein.einheit", cat: "allgemein", label: "Einheit der Konstruktion (Anzeige)", type: "enum", default: "mm", options: [{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m" }, { value: "in", label: "Zoll (in)" }], help: "Messwerte in dieser Einheit. Eingaben ohne Einheit bleiben mm; andere Einheiten direkt dazuschreiben, z. B. »2 in« oder »1,5 m«." },
  { key: "messen.zweiteinheit", cat: "allgemein", label: "Zweiteinheit beim Messen", type: "enum", default: "", options: [{ value: "", label: "Kein(e)" }, { value: "in", label: "Zoll (in)" }, { value: "cm", label: "cm" }, { value: "m", label: "m" }], help: "Messwerte zusätzlich in dieser Einheit anzeigen, z. B. »88,000 mm (3,465 in)«." },
  { key: "messen.fangradius", cat: "allgemein", label: "Fangradius beim Messen", unit: "px", type: "int", default: 9, min: 3, max: 30, help: "Abstand, ab dem Endpunkte, Mitten, Kreismitten, Quadranten und Flächenmitten beim Messen gefangen werden." },
  { key: "messen.anzeige3d", cat: "allgemein", label: "Maß beim Messen im 3D-Fenster zeigen", type: "bool", default: true },
  { key: "messen.achsabstaende", cat: "allgemein", label: "Achsabstände beim Messen aufgeklappt zeigen", type: "bool", default: false, help: "X-, Y- und Z-Abstand zwischen zwei gemessenen Elementen gleich offen statt eingeklappt unter »Delta«." },
  { key: "allgemein.auflageHervorheben", cat: "allgemein", label: "Hervorhebung der Auflagefläche", type: "bool", default: true, help: "Hat ein Bauteil das Feature »Auflagefläche (3D-Druck)«, werden die Flächen, auf denen es im Drucker liegt, grün markiert." },

  { key: "ansicht.qualitaet", cat: "ansicht", label: "Darstellungsqualität beim Start", type: "enum", default: "normal", options: QUAL, help: "Feinheit der Dreiecksvernetzung. Wirkt nur auf die Anzeige, nicht auf Export oder Masse." },
  { key: "ansicht.projektion", cat: "ansicht", label: "Projektion", type: "enum", default: "orthogonal", options: [{ value: "orthogonal", label: "Orthogonal" }, { value: "perspektive", label: "Perspektive" }], help: "Skizzieren ist immer orthogonal." },
  { key: "ansicht.blickwinkel", cat: "ansicht", label: "Ansichtswinkel (Perspektive)", unit: "°", type: "number", default: 35, min: 10, max: 100, help: "Öffnungswinkel der Kamera bei perspektivischer Projektion: klein wie ein Teleobjektiv, groß wie ein Weitwinkel." },
  { key: "ansicht.darstellung", cat: "ansicht", label: "Darstellungsmodus", type: "enum", default: "kanten", options: DISPLAY },
  { key: "ansicht.maus", cat: "ansicht", label: "Maustasten", type: "enum", default: "rechts-drehen", options: [
    { value: "rechts-drehen", label: "Rechte Taste drehen, mittlere schwenken" },
    { value: "mitte-drehen", label: "Mittlere Taste drehen, rechte schwenken" },
  ] },
  { key: "ansicht.drehpunktCursor", cat: "ansicht", label: "Um den Punkt unter dem Mauszeiger drehen", type: "bool", default: true, help: "Drehpunkt ist der Modellpunkt, auf den die Maus beim Drücken zeigt; im Leeren die Bildmitte." },
  { key: "ansicht.drehpunktFest", cat: "ansicht", label: "Drehpunkt ohne Mauszeiger-Drehpunkt", type: "enum", default: "mitte", options: [{ value: "mitte", label: "Bildmitte" }, { value: "ursprung", label: "Ursprung (0, 0, 0)" }], help: "Gilt, wenn »Um den Punkt unter dem Mauszeiger drehen« aus ist." },
  { key: "ansicht.drehart", cat: "ansicht", label: "Drehen", type: "enum", default: "frei", options: [{ value: "frei", label: "Frei (um die Bildachsen)" }, { value: "drehteller", label: "Drehteller (Z bleibt oben)" }], help: "Drehteller: waagrechtes Ziehen dreht immer um die senkrechte Z-Achse, das Modell kippt nicht zur Seite." },
  { key: "ansicht.zoomUmkehren", cat: "ansicht", label: "Zoomrichtung des Mausrads umkehren", type: "bool", default: false },
  { key: "ansicht.mitteDoppelklick", cat: "ansicht", label: "Doppelklick mit der mittleren Taste", type: "enum", default: "alles", options: [{ value: "alles", label: "Alles zeigen" }, { value: "aus", label: "nichts" }] },
  { key: "ansicht.markierungsmenue", cat: "ansicht", label: "Rechtsklick öffnet das Markierungsmenü", type: "bool", default: true, help: "Häufige Befehle im Kreis um den Mauszeiger, seltene als Liste darunter (wie Inventor). Aus: nur die Liste." },
  { key: "ansicht.griffe", cat: "ansicht", label: "Ziehgriffe an gewählten Features", type: "bool", default: true, help: "Pfeil an Extrusion, Bohrungstiefe und Profillänge: ziehen ändert den Wert mit Vorschau, über null hinaus kippt die Extrusion auf die andere Seite. Umschalt: 0,1-mm-Schritte." },
  { key: "ansicht.naechsterSchritt", cat: "ansicht", label: "Hinweis »Nächster Schritt« anzeigen", type: "bool", default: true, help: "Bei leerem Bauteil, leerer Baugruppe, leerem Blatt oder einer fertigen Skizze schlägt eine kleine Kachel unten im Fenster die naheliegenden Befehle vor. Mit × lässt sie sich einzeln wegklicken." },
  { key: "ansicht.miniLeiste", cat: "ansicht", label: "Mini-Werkzeugleiste an der Auswahl", type: "bool", default: true, help: "Nach dem Anklicken von Kanten oder Flächen erscheinen passende Befehle (Rundung, Fase, Skizze …) neben dem Mauszeiger." },
  { key: "ansicht.bohrungsangaben", cat: "ansicht", label: "Bohrungsangaben und Gewinde am 3D-Modell", type: "bool", default: true, help: "Bohrungen zeigen ihre Angabe (z. B. „4× M8, 12 tief“) mit Hinweislinie, Gewinde als Ring im Nenndurchmesser." },
  { key: "ansicht.zoomZumCursor", cat: "ansicht", label: "Zum Mauszeiger zoomen", type: "bool", default: true },
  { key: "ansicht.zoomGeschwindigkeit", cat: "ansicht", label: "Zoomgeschwindigkeit", type: "number", default: 1.2, min: 0.2, max: 5 },
  { key: "ansicht.drehGeschwindigkeit", cat: "ansicht", label: "Drehgeschwindigkeit", type: "number", default: 0.9, min: 0.1, max: 5 },
  { key: "ansicht.schwenkenUmkehrenH", cat: "ansicht", label: "Horizontale Schwenkrichtung umkehren", type: "bool", default: false, help: "Beim Schwenken mit der Maus bewegt sich die Ansicht statt das Modell (links/rechts)." },
  { key: "ansicht.schwenkenUmkehrenV", cat: "ansicht", label: "Vertikale Schwenkrichtung umkehren", type: "bool", default: false, help: "Wie oben, für auf/ab." },
  { key: "ansicht.sanftZoomen", cat: "ansicht", label: "Sanftes Zoomen mit dem Rad", type: "bool", default: false, help: "Ein Radschritt zoomt über einige Bilder verteilt statt in einem Sprung." },
  { key: "ansicht.trackpadDrehen", cat: "ansicht", label: "Zwei-Finger-Scrollen dreht (Umschalt: schwenkt)", type: "bool", default: false, help: "Für Trackpads wie SolidCraft: Scrollen mit zwei Fingern dreht das Modell, mit Umschalt schwenkt es, Kneifen oder Strg + Scrollen zoomt. Geht vor »schwenkt«." },
  { key: "ansicht.trackpadUmkehren", cat: "ansicht", label: "Trackpad: Drehrichtung umkehren", type: "bool", default: false, help: "Kehrt beim Drehen mit zwei Fingern beide Richtungen um." },
  { key: "ansicht.trackpadSchwenken", cat: "ansicht", label: "Zwei-Finger-Scrollen schwenkt", type: "bool", default: false, help: "Für Trackpads: Scrollen mit zwei Fingern schwenkt die Ansicht, Kneifen oder Strg + Scrollen zoomt." },
  { key: "ansicht.zoomStopp", cat: "ansicht", label: "Zoom am Modell stoppen", type: "bool", default: false, help: "Beim Heranzoomen nicht durch das Modell hindurch: kurz vor seiner Hüllkugel ist Schluss." },
  { key: "ansicht.animTempo", cat: "ansicht", label: "Animationsgeschwindigkeit", type: "enum", default: "normal", options: [{ value: "langsam", label: "Langsam" }, { value: "normal", label: "Normal" }, { value: "schnell", label: "Schnell" }], help: "Wie schnell Ansichtswechsel (Würfel, Home, Skizzenansicht) ablaufen. Ganz aus: Darstellung → Ansichtswechsel animieren." },
  { key: "ansicht.einpassenGroesse", cat: "ansicht", label: "Größe bei Home und Einpassen", unit: "%", type: "number", default: 80, min: 30, max: 100, help: "Wie viel der Ansicht das Modell beim Einpassen füllt. 100 % = randlos." },
  { key: "ansicht.einpassenWuerfel", cat: "ansicht", label: "Modell nach einem Ansichtswechsel am Würfel einpassen", type: "bool", default: false, help: "Ein Klick auf den Ansichtswürfel blickt auch auf die Modellmitte und passt ein. Aus: Die Ansicht dreht sich an Ort und Stelle." },
  { key: "ansicht.drehpfeileUmkehren", cat: "ansicht", label: "Drehrichtung der Pfeiltasten umkehren", type: "bool", default: false, help: "Pfeiltasten drehen die Kamera statt das Modell." },
  { key: "ansicht.ebenennamen", cat: "ansicht", label: "Namen der Ursprungsebenen", type: "enum", default: "xyz", options: [{ value: "xyz", label: "XY-Ebene, XZ-Ebene, YZ-Ebene" }, { value: "ansicht", label: "Oben, Vorne, Rechts" }], help: "Z zeigt nach oben: XY = Oben, XZ = Vorne, YZ = Rechts." },
  { key: "ansicht.bildrate", cat: "ansicht", label: "Bildrate anzeigen", type: "bool", default: false, help: "Bilder je Sekunde und Zeichenzeit in der Ecke der 3D-Ansicht – zum Prüfen großer Modelle." },
  { key: "ansicht.raster", cat: "ansicht", label: "Bodenraster anzeigen", type: "bool", default: true },
  { key: "grafik.voreinstellung", cat: "ansicht", label: "Grafik-Voreinstellung", type: "enum", default: "eigen", options: [{ value: "leistung", label: "Leistung – am schnellsten" }, { value: "qualitaet", label: "Qualität – am schärfsten" }, { value: "eigen", label: "Benutzerdefiniert" }], help: "Leistung: normale Qualität, kein Supersampling, kein Bodenschatten. Qualität: feine Darstellung, 2× Supersampling, Bodenschatten. Eine Änderung von Hand stellt auf Benutzerdefiniert." },
  { key: "grafik.supersampling", cat: "ansicht", label: "Supersampling", type: "enum", default: "1", options: [{ value: "1", label: "Aus" }, { value: "1.5", label: "1,5×" }, { value: "2", label: "2×" }], help: "Zeichnet die Ansicht in höherer Auflösung und rechnet herunter: glattere Kanten. Kostet Grafikleistung (1,5× ≈ 2,25-mal so viele Pixel)." },
  { key: "grafik.bodenschatten", cat: "ansicht", label: "Bodenschatten", type: "bool", default: false, help: "Weicher Schatten unter dem Modell auf Höhe seiner Unterkante." },
  { key: "grafik.rasterSeite", cat: "ansicht", label: "Raster in Seitenansichten aufrecht", type: "bool", default: false, help: "Bei Blick von vorne/hinten bzw. links/rechts liegt das Raster in der zugewandten senkrechten Ebene statt am Boden." },
  { key: "ansicht.schnittFuellen", cat: "ansicht", label: "Schnittflächen füllen", type: "bool", default: true, help: "Beim Schnitt X/Y/Z wird das geschnittene Material als geschlossene, abgedunkelte Fläche gezeigt statt hohl." },
  { key: "ansicht.viewcube", cat: "ansicht", label: "ViewCube anzeigen", type: "bool", default: true },
  { key: "ansicht.navigatorStil", cat: "ansicht", label: "Navigator", type: "enum", default: "wuerfel", options: [{ value: "wuerfel", label: "Würfel" }, { value: "achsen", label: "Achsen" }], help: "Oben rechts in der Ansicht: Ansichtswürfel oder Achsenkreuz mit anklickbaren Kugeln (±X, ±Y, ±Z)." },
  { key: "ansicht.beleuchtung", cat: "ansicht", label: "Beleuchtung", type: "enum", default: "standard", options: [{ value: "standard", label: "Standard" }, { value: "kontrast", label: "Kontrastreich (Kanten und Rundungen deutlicher)" }, { value: "weich", label: "Weich (wenig Schatten)" }], help: "Gilt für die normale Darstellung; die Fotodarstellung hat ihr eigenes Licht." },
  { key: "ansicht.kantenfarbe", cat: "ansicht", label: "Kantenfarbe", type: "color", default: "#1c2733" },
  { key: "ansicht.auswahlfarbe", cat: "ansicht", label: "Auswahlfarbe", type: "color", default: "#1e78e6", help: "Gewählte Flächen, Kanten und Punkte – bewusst anders als die Hervorhebung unter dem Mauszeiger." },
  { key: "ansicht.hoverfarbe", cat: "ansicht", label: "Hervorhebung unter dem Mauszeiger", type: "color", default: "#ef7d1a" },

  { key: "skizze.standardebene", cat: "skizze", label: "Erste Skizze in leerem Bauteil auf", type: "enum", default: "waehlen", options: [{ value: "waehlen", label: "Ebene jedes Mal wählen" }, { value: "XY", label: "XY-Ebene" }, { value: "XZ", label: "XZ-Ebene" }, { value: "YZ", label: "YZ-Ebene" }], help: "Hat das Bauteil schon Körper, wählst du die Ebene oder Fläche wie gewohnt." },
  { key: "skizze.ansichtDrehen", cat: "skizze", label: "Beim Öffnen einer Skizze senkrecht auf die Ebene drehen", type: "bool", default: true, help: "Aus: Die Ansicht bleibt, gezeichnet wird trotzdem auf der Skizzenebene. Strg+8 dreht jederzeit senkrecht." },
  { key: "skizze.ansichtZurueck", cat: "skizze", label: "Beim Beenden einer Skizze", type: "enum", default: "bleiben", options: [{ value: "bleiben", label: "Ansicht bleiben lassen" }, { value: "zurueck", label: "zur Ansicht davor zurück" }, { value: "unveraendert", label: "zurück, wenn in der Skizze nicht verschoben oder gezoomt" }] },
  { key: "skizze.tasteWechselt", cat: "skizze", label: "Werkzeugtaste nochmal drücken wechselt die Variante", type: "bool", default: true, help: "L, R und C starten die zuletzt benutzte Variante (z. B. Rechteck aus Mitte). Vor dem ersten Klick nochmal drücken schaltet zur nächsten: Linie ↔ aus Mitte, Rechteck → aus Mitte → 3 Punkte → abgerundet, Kreis → 3 Punkte → 2 Punkte → 3 Tangenten → 2 Linien." },
  { key: "skizze.rasterfang", cat: "skizze", label: "Rasterfang beim Öffnen einer Skizze", type: "bool", default: false },
  { key: "skizze.rasterweite", cat: "skizze", label: "Rasterweite", unit: "mm", type: "number", default: 0, min: 0, max: 1000, help: "0 = automatisch passend zum Zoom." },
  { key: "skizze.fangradius", cat: "skizze", label: "Fangradius", unit: "px", type: "int", default: 7, min: 3, max: 30, help: "Abstand, ab dem Punkte, Schnittpunkte, Mitten, Quadranten und Ausrichtungen gefangen werden." },
  { key: "skizze.ausrichten", cat: "skizze", label: "Ausrichtungslinien beim Zeichnen", type: "bool", default: true, help: "Fängt waagrecht bzw. senkrecht zu vorhandenen Punkten (gestrichelte Hilfslinie, wie Inventor)." },
  { key: "skizze.symbole", cat: "skizze", label: "Symbole der Abhängigkeiten anzeigen", type: "bool", default: true },
  { key: "skizze.bestimmtheit", cat: "skizze", label: "Bestimmtheit farbig zeigen", type: "bool", default: true, help: "Noch bewegliche Elemente hellblau, vollständig bestimmte dunkel, Widersprüche rot." },
  { key: "skizze.auto.hv", cat: "skizze", label: "Automatisch: horizontal/vertikal", type: "bool", default: true, help: "Beim Zeichnen gesetzte Bedingungen. Strg gedrückt halten unterdrückt alle für diesen Klick." },
  { key: "skizze.auto.parallel", cat: "skizze", label: "Automatisch: parallel/senkrecht", type: "bool", default: true },
  { key: "skizze.auto.tangential", cat: "skizze", label: "Automatisch: tangential am Bogenende", type: "bool", default: true },
  { key: "skizze.auto.gleich", cat: "skizze", label: "Automatisch: gleich lang / gleicher Radius", type: "bool", default: true, help: "Greift, wenn Länge bzw. Radius bis auf wenige Pixel getroffen wird." },
  { key: "skizze.ziehenLinie", cat: "skizze", label: "Drücken und Ziehen zeichnet eine Linie", type: "bool", default: false, help: "Mit dem Linienwerkzeug Maustaste drücken, ziehen und loslassen: eine Linie, ohne zweiten Klick." },
  { key: "skizze.vollBemassen", cat: "skizze", label: "Neue Formen vollständig bemaßen", type: "bool", default: false, help: "Jede neu gezeichnete Form bekommt gleich ihre Maße (Längen, Durchmesser, Winkel), soweit noch frei." },
  { key: "skizze.vonUrsprung", cat: "skizze", label: "Neue Formen vom Skizzenursprung aus positionieren", type: "bool", default: false, help: "Zusätzlich zu »vollständig bemaßen«: waagrechter und senkrechter Abstand zum Skizzenursprung." },
  { key: "skizze.flaecheProjizieren", cat: "skizze", label: "Flächenkanten in neue Skizzen projizieren", type: "enum", default: "aus", options: [{ value: "aus", label: "Nein" }, { value: "immer", label: "Immer" }, { value: "fragen", label: "Zuerst fragen" }], help: "Skizze auf einer ebenen Körperfläche: deren Randkanten als feste, projizierte Geometrie übernehmen." },
  { key: "skizze.symboleZoom", cat: "skizze", label: "Symbole beim Herauszoomen ausblenden", type: "bool", default: false, help: "Ist die Skizze auf dem Bildschirm kleiner als etwa 160 Bildpunkte, werden die Bedingungssymbole ausgeblendet." },
  { key: "skizze.konfliktfarbe", cat: "skizze", label: "Konfliktfarbe", type: "color", default: "#d93025", help: "Farbe für widersprüchliche Maße und Bedingungen." },
  { key: "skizze.bemassungEingabe", cat: "skizze", label: "Bemaßungswerte eingeben", type: "enum", default: "ansicht", options: [{ value: "ansicht", label: "In der Ansicht" }, { value: "fenster", label: "In einem Fenster" }], help: "In der Ansicht: Eingabefeld am Maß. In einem Fenster: festes Feld oben in der Mitte mit − / + Knöpfen." },
  { key: "skizze.schrittLaenge", cat: "skizze", label: "Schritt für Längen", unit: "mm", type: "number", default: 1, min: 0.001, max: 1000, help: "Was Pfeil auf/ab, Mausrad und − / + im Maßfeld zu einer Länge addieren." },
  { key: "skizze.schrittWinkel", cat: "skizze", label: "Schritt für Winkel", unit: "°", type: "number", default: 5, min: 0.01, max: 90, help: "Was Pfeil auf/ab, Mausrad und − / + zu einem Winkel addieren." },
  { key: "auswahl.klick", cat: "skizze", label: "Klick wählt", type: "enum", default: "elemente", options: [{ value: "elemente", label: "Flächen und Kanten" }, { value: "koerper", label: "Ganze Körper" }], help: "Im Bauteil: ein Klick wählt die Fläche/Kante unter dem Mauszeiger oder gleich den ganzen Körper." },
  { key: "auswahl.umschalt", cat: "skizze", label: "Umschalt und Strg bei der Auswahl", type: "enum", default: "umschalten", options: [{ value: "umschalten", label: "Umschalt oder Strg: hinzufügen oder wieder entfernen" }, { value: "hinzufuegen", label: "Umschalt fügt nur hinzu, Strg schaltet um" }] },

  { key: "werkzeuge.menueband", cat: "werkzeuge", label: "Menüband anordnen", type: "ribbon", default: {}, custom: true, help: "Gruppen je Registerkarte aus- und einblenden und umsortieren. Rechtsklick auf eine Gruppe im Menüband oder hier im Einstellungscenter. Ausgeblendete Befehle bleiben über die Befehlssuche (Strg+K) erreichbar." },
  { key: "werkzeuge.schnellzugriff", cat: "werkzeuge", label: "Schnellzugriff", type: "cmdlist", default: [], custom: true, help: "Befehle in der Leiste oben neben Rückgängig. Anheften in der Befehlssuche (Strg+K) über die Stecknadel." },
  { key: "werkzeuge.std.rundung", cat: "werkzeuge", label: "Standardwert Skizzenrundung", unit: "mm", type: "number", default: 5, min: 0.001, max: 100000 },
  { key: "werkzeuge.std.versatz", cat: "werkzeuge", label: "Standardwert Versatz", unit: "mm", type: "number", default: 5, min: 0.001, max: 100000 },
  { key: "werkzeuge.std.polygon", cat: "werkzeuge", label: "Standardwert Polygon-Ecken", type: "int", default: 6, min: 3, max: 64 },
  { key: "werkzeuge.std.musterAnzahl", cat: "werkzeuge", label: "Standardwert Musteranzahl", type: "int", default: 3, min: 2, max: 400 },
  { key: "werkzeuge.std.musterAbstand", cat: "werkzeuge", label: "Standardwert Musterabstand", unit: "mm", type: "number", default: 20, min: -100000, max: 100000 },
  { key: "werkzeuge.std.extrusion", cat: "werkzeuge", label: "Standardwert Extrusionstiefe", unit: "mm", type: "number", default: 10, min: 0.001, max: 100000, help: "Startwert neuer Extrusionen." },
  { key: "werkzeuge.extrusionAutomatisch", cat: "werkzeuge", label: "Extrusion: Vorgang automatisch wählen", type: "bool", default: true, help: "Liegt die Skizze auf dem Körper und zeigt die Richtung ins Material, wird die Extrusion eine Differenz; berührt sie keinen Körper, ein neuer Körper; sonst Vereinigen. Rechts jederzeit umstellbar." },
  { key: "werkzeuge.merken", cat: "werkzeuge", label: "Letzte Werkzeugwerte merken", type: "bool", default: true, help: "Rundung, Versatz, Polygon und Muster starten mit dem zuletzt eingegebenen Wert, auch nach einem Neustart. Aus = immer die Standardwerte oben." },
  { key: "baugruppe.ziehen", cat: "werkzeuge", label: "Komponenten in der Baugruppe mit der Maus ziehen", type: "bool", default: true, help: "Linke Taste auf einer Komponente ziehen verschiebt sie, Umschalt+Ziehen dreht sie – nur in die Richtungen, die ihre Abhängigkeiten frei lassen. Alt+Ziehen fügt sie an eine Fläche oder Bohrung (Schnellfügen)." },
  { key: "baugruppe.fuegepunkte", cat: "werkzeuge", label: "Beim Platzieren über Fügepunkte automatisch fügen", type: "bool", default: true, help: "Hat ein Bauteil gemerkte Fügepunkte (Komponente → Eigenschaften → Fügepunkte), fügt es sich beim Absetzen an das nächstliegende passende Gegenstück." },
  { key: "baugruppe.abhaengigkeitFortsetzen", cat: "werkzeuge", label: "Abhängigkeit: Befehl nach dem Setzen aktiv lassen", type: "bool", default: true, help: "Wie Inventor »Anwenden«: Nach jeder Abhängigkeit geht es gleich mit der nächsten Auswahl weiter; Esc oder »Fertig« beendet. Die zuletzt gesetzte lässt sich dabei umkehren, im Versatz ändern oder zurücknehmen." },
  { key: "baugruppe.freiheitsgrade", cat: "werkzeuge", label: "Freiheitsgrade der gewählten Komponente zeigen", type: "bool", default: true, help: "Pfeile für freie Verschiebungen, Bögen für freie Drehungen an der gewählten Komponente." },
  { key: "baugruppe.drehSchrittNah", cat: "werkzeuge", label: "Baugruppe drehen: Schritt nahe der Achse", unit: "°", type: "number", default: 15, min: 0.1, max: 90, help: "Drehen einer Komponente mit Umschalt + Ziehen rastet in diesem Winkel ein." },
  { key: "baugruppe.drehSchrittFern", cat: "werkzeuge", label: "Baugruppe drehen: Schritt fern der Achse", unit: "°", type: "number", default: 1, min: 0.01, max: 90, help: "Für den feinen Schritt beim Drehen weiter als etwa 60 Bildpunkte nach oben oder unten wegziehen." },
  { key: "baugruppe.schiebeSchritt", cat: "werkzeuge", label: "Baugruppe verschieben: Schritt", unit: "mm", type: "number", default: 0, min: 0, max: 1000, help: "Verschieben einer Komponente rastet in diesem Abstand ein. 0 = stufenlos." },
  { key: "werkzeuge.letzte", cat: "werkzeuge", label: "Zuletzt verwendete Werkzeugwerte", type: "toolmemo", default: {}, custom: true },
  { key: "werkzeuge.bohrvorlagen", cat: "werkzeuge", label: "Bohrungsvorlagen", type: "holepresets", default: [], custom: true, help: "Persönliche Vorlagen für Bohrungen (Gewinde, Ø, Tiefe, Senkung, Bohrgrund); speichern und abrufen im Bohrungsdialog." },
  { key: "werkzeuge.makros", cat: "werkzeuge", label: "Makros", type: "macros", default: [], custom: true, help: "Benannte Befehlsfolgen; anlegen und aufzeichnen über die Befehlssuche (»Makros verwalten«, »Makro aufzeichnen«)." },
  { key: "werkzeuge.kuerzel", cat: "werkzeuge", label: "Tastaturkürzel", type: "keymap", default: {}, custom: true, help: "Abweichungen von der Standardbelegung; Konflikte werden abgelehnt." },
  { key: "werkzeuge.modelltastenInSkizze", cat: "werkzeuge", label: "Modelltasten aus Skizzen heraus", type: "bool", default: false, help: "In einer Skizze lösen auch Kürzel von Bauteilbefehlen aus (z. B. E für Extrusion): die Skizze wird dann zuerst beendet." },

  { key: "fertigung.stange", cat: "fertigung", label: "Max. Stangenlänge", unit: "mm", type: "number", default: 6500, min: 0, max: 20000, help: "Nutzbar ist die Stange minus Endbeschnitt und Greiferrest. 0 = nicht prüfen." },
  { key: "fertigung.endbeschnitt", cat: "fertigung", label: "Endbeschnitt", unit: "mm", type: "number", default: 10, min: 0, max: 2000, help: "Anschnitt am Stangenanfang." },
  { key: "fertigung.greiferrest", cat: "fertigung", label: "Greiferrest", unit: "mm", type: "number", default: 142, min: 0, max: 2000, help: "Nicht nutzbares Ende im Greifer." },
  { key: "fertigung.lagerlaenge", cat: "fertigung", label: "Lagerlänge (Stangenplan)", unit: "mm", type: "number", default: 6000, min: 100, max: 30000, help: "Handelslänge der gekauften Stangen für den Stangenplan; je Profil abweichend in der Zuschnittliste einstellbar." },
  { key: "fertigung.schnittfuge", cat: "fertigung", label: "Schnittfuge (Stangenplan)", unit: "mm", type: "number", default: 0, min: 0, max: 20, help: "Materialverlust je Trennschnitt zwischen zwei Teilen im Stangenplan; Laser ≈ 0–1 mm, Säge ≈ 2–4 mm." },
  { key: "fertigung.stangenJeProfil", cat: "fertigung", label: "Stangenlänge je Profil", type: "stocklist", default: {}, custom: true, help: "Abweichende Lagerlänge je Profil-ID, im Stangenplan der Zuschnittliste einstellbar." },
  { key: "kalkulation.stundensatz", cat: "kalkulation", label: "Stundensatz Werkstatt", unit: "€/h", type: "number", default: 65, min: 0, max: 1000 },
  { key: "kalkulation.stahl", cat: "kalkulation", label: "Stahl", unit: "€/kg", type: "number", default: 1.4, min: 0, max: 100 },
  { key: "kalkulation.edelstahl", cat: "kalkulation", label: "Edelstahl", unit: "€/kg", type: "number", default: 5.5, min: 0, max: 100 },
  { key: "kalkulation.alu", cat: "kalkulation", label: "Aluminium", unit: "€/kg", type: "number", default: 5, min: 0, max: 100 },
  { key: "kalkulation.sonst", cat: "kalkulation", label: "Sonstige Werkstoffe", unit: "€/kg", type: "number", default: 3, min: 0, max: 100 },
  { key: "kalkulation.blechVerschnitt", cat: "kalkulation", label: "Blechverschnitt", unit: "%", type: "number", default: 15, min: 0, max: 200, help: "Zuschlag auf die Masse von Blechen, Platten und übrigen Teilen (Profile rechnen über den Stangenplan)." },
  { key: "kalkulation.schnitt", cat: "kalkulation", label: "Zuschnitt je Profilteil", unit: "min", type: "number", default: 3, min: 0, max: 120 },
  { key: "kalkulation.gehrung", cat: "kalkulation", label: "Zuschlag Gehrung/Ausklinkung", unit: "min", type: "number", default: 2, min: 0, max: 120 },
  { key: "kalkulation.loch", cat: "kalkulation", label: "Bohren je Loch", unit: "min", type: "number", default: 1.5, min: 0, max: 60 },
  { key: "kalkulation.plattenTeil", cat: "kalkulation", label: "Platte/Blech je Stück", unit: "min", type: "number", default: 4, min: 0, max: 240, help: "Schneiden oder Lasern lassen, Entgraten, Handhaben." },
  { key: "kalkulation.nahtM", cat: "kalkulation", label: "Schweißen je Meter Naht", unit: "min", type: "number", default: 15, min: 0, max: 600 },
  { key: "kalkulation.teil", cat: "kalkulation", label: "Heften, Richten, Handhaben je Teil", unit: "min", type: "number", default: 3, min: 0, max: 240 },
  { key: "kalkulation.verzinken", cat: "kalkulation", label: "Feuerverzinken", unit: "€/kg", type: "number", default: 0.6, min: 0, max: 50 },
  { key: "kalkulation.pulvern", cat: "kalkulation", label: "Pulverbeschichten", unit: "€/kg", type: "number", default: 1.4, min: 0, max: 50 },
  { key: "kalkulation.normteil", cat: "kalkulation", label: "Normteil pauschal", unit: "€/Stk", type: "number", default: 0.5, min: 0, max: 1000 },
  { key: "kalkulation.gemein", cat: "kalkulation", label: "Gemeinkosten", unit: "%", type: "number", default: 15, min: 0, max: 300 },
  { key: "kalkulation.gewinn", cat: "kalkulation", label: "Gewinn", unit: "%", type: "number", default: 10, min: 0, max: 300 },
  { key: "fertigung.kuerzestesTeil", cat: "fertigung", label: "Kürzestes Teil", unit: "mm", type: "number", default: 0, min: 0, max: 20000, help: "Kürzere Teile kann die Maschine nicht entladen. 0 = keine Grenze." },
  { key: "fertigung.huellkreis", cat: "fertigung", label: "Max. Hüllkreis-Ø", unit: "mm", type: "number", default: 255, min: 0, max: 2000, help: "Größter Querschnitt, den das Spannfutter fasst. 0 = nicht prüfen." },
  { key: "fertigung.metergewicht", cat: "fertigung", label: "Max. Metergewicht", unit: "kg/m", type: "number", default: 36, min: 0, max: 1000, help: "0 = nicht prüfen." },
  { key: "fertigung.bohrungKlein", cat: "fertigung", label: "Bohrung mindestens", unit: "× Wand", type: "number", default: 1, min: 0, max: 10, help: "Konturen am Rohr: Bohrung kleiner als Faktor × Wandstärke gibt eine Warnung. 0 = nicht prüfen." },
  { key: "fertigung.steg", cat: "fertigung", label: "Steg mindestens", unit: "× Wand", type: "number", default: 1.5, min: 0, max: 20, help: "Konturen am Rohr: Abstand zweier Konturen (auch über die Kante und zur Gegenseite) kleiner als Faktor × Wand gibt eine Warnung. 0 = nicht prüfen." },
  { key: "fertigung.rand", cat: "fertigung", label: "Abstand zum Ende mindestens", unit: "× Wand", type: "number", default: 1, min: 0, max: 20, help: "Konturen am Rohr näher am Ende als Faktor × Wand geben eine Warnung (Ausklinkungen zählen nicht). 0 = nicht prüfen." },
  { key: "fertigung.knickSchenkel", cat: "fertigung", label: "Knickrahmen: Schenkel mindestens", unit: "× Rohrmaß", type: "number", default: 2, min: 0, max: 20, help: "Schenkel kürzer als Faktor × Rohrmaß in der Rahmenebene gibt eine Warnung. 0 = nicht prüfen." },
  { key: "fertigung.knickWand", cat: "fertigung", label: "Knickrahmen: Wand höchstens", unit: "mm", type: "number", default: 4, min: 0, max: 30, help: "Dickere Wände lassen sich schwer von Hand knicken (Hinweis). 0 = nicht prüfen." },

  { key: "darstellung.schema", cat: "darstellung", label: "Farbschema", type: "enum", default: "hell", options: [{ value: "hell", label: "Hell" }, { value: "dunkel", label: "Dunkel" }, { value: "system", label: "Wie Windows" }, ...THEMES.map((t) => ({ value: t.id, label: t.name }))], help: "Themen Graphite bis Platinum 9 nach SolidCraft. Gilt für Menüband, Panels, Dialoge und den 3D-Hintergrund. Zeichnungsblätter bleiben weiß." },
  { key: "dokument.neuesProjekt", cat: "dokument", label: "Neues Projekt beginnt mit", type: "enum", default: "bauteil", options: [{ value: "bauteil", label: "einem Bauteil" }, { value: "baugruppe", label: "Baugruppe mit einem Bauteil" }, { value: "leer", label: "leerem Projekt" }], help: "Datei → Neues Projekt (Strg+N). Die Kacheln auf der Startseite bleiben, wie sie heißen." },
  { key: "dokument.werkstoff", cat: "dokument", label: "Werkstoff neuer Bauteile", type: "materialkey", default: "S235", help: "Eingebaute und eigene Werkstoffe (Einstellungen → Material). Fehlt der gewählte, gilt S235." },
  { key: "dokument.name.bauteil", cat: "dokument", label: "Name neuer Bauteile", type: "name", default: "Bauteil {n}", placeholders: ["n", "projekt", "datum"], help: "Beispiel: »{projekt}-{n:2}« → »Carport-01«. Ist der Name schon vergeben, zählt {n} weiter." },
  { key: "dokument.name.baugruppe", cat: "dokument", label: "Name neuer Baugruppen", type: "name", default: "Baugruppe {n}", placeholders: ["n", "projekt", "datum"] },
  { key: "dokument.name.zeichnung", cat: "dokument", label: "Name neuer Zeichnungen", type: "name", default: "Zeichnung {quelle}", placeholders: ["n", "projekt", "datum", "quelle"] },
  { key: "dokument.nummer", cat: "dokument", label: "Sachnummer neuer Bauteile", type: "name", default: "", allowEmpty: true, placeholders: ["n", "projekt", "datum"], help: "Leer = keine Sachnummer. Beispiel: »BT-{n:3}« → »BT-001«; steht im Schriftfeld und in der Stückliste." },
  { key: "dokument.restwand", cat: "dokument", label: "Mindest-Restwand 0,1 mm in neuen Bauteilen", type: "bool", default: true, help: "Extrusion (Schnitt), Bohrung mit Tiefe oder Skizzenkontur, die genau auf der Rückseite der Wand endet (Tiefe = Wandstärke), lässt 0,1 mm stehen. Am Bauteil einzeln abschaltbar." },
  { key: "dokument.teilenummerPflicht", cat: "dokument", label: "Teilenummer ist Pflicht für die Freigabe", type: "bool", default: false, help: "Aus: fehlende Teilenummer ist eine Warnung. Ein: ein Fehler – Freigeben geht dann erst mit Nummer. Reine Normteile brauchen keine." },
  { key: "dokument.toleranzklasse", cat: "dokument", label: "Allgemeintoleranz neuer Zeichnungen", type: "enum", default: "m", options: CLASSES.map((c) => ({ value: c.value, label: "ISO 2768-" + c.label })), help: "Steht im Schriftfeld. »Allgemeintoleranz anzeigen« am Maß nimmt das ± aus dieser Klasse (Längen, Radien und Fasen nach ISO 2768-1)." },
  { key: "zeichnung.vorlage", cat: "dokument", label: "Zeichnungsvorlage", type: "drawtemplate", default: { ...DEFAULT_TEMPLATE, extra: [] }, custom: true },
  { key: "dokument.nachkomma", cat: "dokument", label: "Nachkommastellen neuer Zeichnungsmaße", type: "int", default: 1, min: 0, max: 3, help: "Gilt für neue Zeichnungen; jedes Maß lässt sich einzeln ändern." },
  { key: "dokument.parameterZeilen", cat: "dokument", label: "Zeilen der Parameterliste", type: "int", default: 0, min: 0, max: 200, help: "So viele Parameter sind im Parameterdialog ohne Blättern zu sehen. 0 = so viele, wie in den Dialog passen." },
  { key: "blech.regeln", cat: "blech", label: "Blechregeln", type: "sheetrules", default: DEFAULT_SHEET_RULES.map((r) => ({ ...r })), custom: true, help: "Benannte Vorgaben für Kantteile: Werkstoff, Dicke, Innenradius, Abwicklungsregel und Freischnitt. Am Kantteil als »Blechregel« wählbar." },
  { key: "blech.biegetabellen", cat: "blech", label: "Biegetabellen", type: "bendtables", default: [], custom: true, help: "Je Werkstoff und Blechdicke ein Raster Biegewinkel × Innenradius mit Werten der Abkantpresse. Zwischen den Zellen wird interpoliert, außerhalb gilt der Ersatz-K-Faktor der Tabelle." },
  { key: "material.eigene", cat: "material", label: "Eigene Werkstoffe", type: "materials", default: [], custom: true },
  { key: "material.kunststoffregeln", cat: "material", label: "Kunststoffregeln", type: "plasticrules", default: DEFAULT_PLASTIC_RULES.map((r) => ({ ...r })), custom: true, help: "Wanddicke, Formschräge und Radius je Kunststoff für Ansatz, Rastnase, Lippe/Nut und die Regelprüfung." },
  { key: "oberflaeche.layout", cat: "darstellung", label: "Anordnung der Panels", type: "layout", default: DEFAULT_LAYOUT, custom: true, help: "Seite und Breite von Modellbrowser und Eigenschaften; Menüband Ansicht → Fenster oder am Rand ziehen." },
  { key: "oberflaeche.anordnung", cat: "darstellung", label: "Fensteraufbau", type: "enum", default: "schwebend", options: [{ value: "schwebend", label: "Schwebend (Karten über der Ansicht)" }, { value: "kompakt", label: "Kompakt (angedockt, dichter)" }], help: "Kompakt: Menüband, Modellbrowser und Eigenschaften liegen ohne Abstand an den Fensterrändern – mehr Platz für die 3D-Ansicht." },
  { key: "oberflaeche.nurSymbole", cat: "darstellung", label: "Menüband nur mit Symbolen", type: "bool", default: false, help: "Beschriftungen ausblenden; der Name steht im Tooltip. Spart Höhe und Breite." },
  { key: "darstellung.eigenerHintergrund", cat: "darstellung", label: "Eigene Hintergrundfarbe der 3D-Ansicht", type: "bool", default: false, help: "Aus = Farbverlauf des Farbschemas." },
  { key: "darstellung.hintergrund", cat: "darstellung", label: "Hintergrundfarbe", type: "color", default: "#ffffff", help: "Gilt, wenn »Eigene Hintergrundfarbe« an ist." },
  { key: "darstellung.eigenerAkzent", cat: "darstellung", label: "Eigene Akzentfarbe", type: "bool", default: false, help: "Überschreibt die Akzentfarbe des Farbthemas (Knöpfe, aktive Reiter, Fokus)." },
  { key: "darstellung.akzent", cat: "darstellung", label: "Akzentfarbe", type: "color", default: "#2f6fd6" },
  { key: "oberflaeche.meldungen", cat: "darstellung", label: "Meldungen erscheinen", type: "enum", default: "rechts", options: [{ value: "rechts", label: "unten rechts" }, { value: "mitte", label: "unten in der Mitte" }] },
  { key: "oberflaeche.statusleiste", cat: "darstellung", label: "Statusleiste am unteren Rand", type: "bool", default: true, help: "Maustasten-Hinweis, Masse, Körperzahl und Einheiten. Aus = mehr Platz für die Ansicht." },
  { key: "oberflaeche.navPosition", cat: "darstellung", label: "Navigationsleiste: Lage", type: "enum", default: "rechts", options: [{ value: "links", label: "unten links" }, { value: "mitte", label: "unten Mitte" }, { value: "rechts", label: "unten rechts" }] },
  { key: "oberflaeche.navGroesse", cat: "darstellung", label: "Navigationsleiste: Größe", type: "enum", default: "normal", options: [{ value: "normal", label: "Normal" }, { value: "kompakt", label: "Kompakt" }] },
  { key: "oberflaeche.navLeerlauf", cat: "darstellung", label: "Navigationsleiste ohne Maus darüber", type: "enum", default: "immer", options: [{ value: "immer", label: "immer deutlich" }, { value: "blass", label: "blass, beim Darüberfahren deutlich" }] },
  { key: "oberflaeche.navFelder", cat: "darstellung", label: "Navigationsleiste: Reihenfolge der Felder", type: "text", default: "", help: "Felder in der Leiste mit der Maus an eine andere Stelle ziehen; leer = Standardreihenfolge. Kürzel: orbit, pan, zoom, iso, vorne, oben, rechts, ansichten, alles, auswahl, sep1, sep2." },
  { key: "oberflaeche.dialogKnoepfe", cat: "darstellung", label: "OK und Abbrechen in Dialogen", type: "enum", default: "unten", options: [{ value: "unten", label: "unten" }, { value: "oben", label: "oben" }] },
  { key: "oberflaeche.dialogeOffen", cat: "darstellung", label: "Feature-Eigenschaften beim Dokumentwechsel offen lassen", type: "bool", default: false, help: "Wer zwischen Dokument-Reitern wechselt, findet beim Zurückkommen das zuletzt bearbeitete Feature wieder geöffnet." },
  { key: "darstellung.farbsehen", cat: "darstellung", label: "Farbsehschwäche", type: "enum", default: "aus", options: [{ value: "aus", label: "Aus" }, { value: "protan", label: "Protan (Rot schwach)" }, { value: "deutan", label: "Deutan (Grün schwach)" }, { value: "tritan", label: "Tritan (Blau schwach)" }], help: "Färbt Farben mit Bedeutung um: Skizzenzustand, OK/Warnung/Fehler, Achsen und Prüffarben." },
  { key: "oberflaeche.verlauf", cat: "darstellung", label: "Verlaufsleiste unten im Bauteil", type: "bool", default: true, help: "Alle Features als Symbole in Aufbaureihenfolge; die Marke ist das Bauteilende und lässt sich ziehen." },
  { key: "oberflaeche.schnellmessung", cat: "darstellung", label: "Schnellmessung unten rechts", type: "bool", default: true, help: "Zeigt für gewählte Kanten und Flächen Länge, Ø, Fläche, Abstand und Winkel. Klick kopiert den Wert. Das Messwerkzeug (M) kann mehr." },
  { key: "baum.skizzenEinordnen", cat: "darstellung", label: "Modellbrowser: genutzte Skizzen unter ihrem Feature", type: "bool", default: true, help: "Wie Inventor: die Skizze einer Extrusion, Bohrung … steht eingerückt darunter. Aus = alle Features in einer flachen Liste." },
  { key: "baum.erweiterteNamen", cat: "darstellung", label: "Modellbrowser: erweiterte Namen (Maße)", type: "bool", default: false, help: "Zeigt hinter dem Namen das wichtigste Maß, z. B. »Extrusion · 10 mm«, »Bohrung · Ø 11 durch«." },
  { key: "darstellung.animation", cat: "darstellung", label: "Ansichtswechsel animieren", type: "bool", default: true, help: "Aus = reduzierte Bewegung." },
  { key: "kernel.automatisch", cat: "kernel", label: "Automatisch neu berechnen", type: "bool", default: true, help: "Aus = Änderungen sammeln und erst mit F5 (»Neu berechnen«) rechnen – hilfreich bei großen Bauteilen. Beim Öffnen und Wechseln eines Dokuments wird immer gerechnet." },
  { key: "kernel.protokoll", cat: "kernel", label: "Berechnungsprotokoll führen", type: "bool", default: false, help: "Merkt sich für die letzten 200 Berechnungen Dauer, Features und Meldungen (nur im Speicher, nicht im Fehlerprotokoll). Ansehen und kopieren: Befehlssuche → »Berechnungsprotokoll«." },
  { key: "kernel.koerperpruefung", cat: "kernel", label: "Körperprüfung", type: "enum", default: "ende", options: [{ value: "ende", label: "Einmal am Ende" }, { value: "feature", label: "Nach jedem Feature" }, { value: "aus", label: "Aus (schneller)" }], help: "Prüft die Körper mit OpenCascade auf gültige Geometrie. Nach jedem Feature: die Warnung steht am Feature, das den Fehler erzeugt hat – dauert länger." },
  { key: "dateien.dreiMfObjekte", cat: "dateien", label: "3MF / Slicer: Objekte", type: "enum", default: "komponente", options: [{ value: "komponente", label: "je Komponente ein Objekt" }, { value: "koerper", label: "je Körper ein Objekt" }, { value: "eins", label: "alles ein Objekt" }], help: "Wie Körper beim 3MF-Export und »An Slicer senden« zu druckbaren Objekten zusammengefasst werden (wie SolidCraft)." },
  { key: "dateien.slicer", cat: "dateien", label: "Installierte Slicer", type: "slicers", default: [], custom: true, help: "Programme für »An Slicer senden«. Leer = 3MF mit dem Programm öffnen, das Windows für .3mf kennt." },
  { key: "allgemein.profile", cat: "allgemein", label: "Einstellungsprofile", type: "profiles", default: {}, custom: true, help: "Benannte Stände aller Einstellungen, z. B. »Werkstatt« und »Büro«." },
  { key: "ansicht.grenzenSchrittWinkel", cat: "ansicht", label: "Grenzen finden: Schritt Drehgelenk (°)", type: "number", default: 5, min: 0.1, max: 90, help: "Grob-Schritt beim Suchen der Anschläge eines Drehgelenks. Kleiner findet dünne Hindernisse sicherer, dauert länger." },
  { key: "ansicht.grenzenGenauWinkel", cat: "ansicht", label: "Grenzen finden: Genauigkeit Drehgelenk (°)", type: "number", default: 0.1, min: 0.001, max: 5, help: "Bis auf diesen Winkel wird jeder Anschlag eingegrenzt." },
  { key: "ansicht.grenzenSchrittWeg", cat: "ansicht", label: "Grenzen finden: Schritt Schiebegelenk (mm)", type: "number", default: 5, min: 0.1, max: 500 },
  { key: "ansicht.grenzenGenauWeg", cat: "ansicht", label: "Grenzen finden: Genauigkeit Schiebegelenk (mm)", type: "number", default: 0.01, min: 0.0001, max: 10 },
  { key: "dateien.netzgenauigkeit", cat: "dateien", label: "Netzgenauigkeit STL/OBJ/3MF (mm)", type: "number", default: 0, min: 0, max: 5, help: "Größte Abweichung des Dreiecksnetzes von gekrümmten Flächen beim Export. 0 = STL 0,02 mm, OBJ/3MF wie in der Ansicht. Kleiner = genauer, größere Dateien." },
  { key: "dateien.urdfPfad", cat: "dateien", label: "URDF: Pfad vor den Netzen", type: "enum", default: "paket", options: [{ value: "paket", label: "package://<Name>/meshes/" }, { value: "relativ", label: "../meshes/ (relativ)" }], help: "Wie die URDF-Datei auf die STL-Netze der Glieder verweist." },
  { key: "dateien.urdfKraft", cat: "dateien", label: "URDF: Kraft-/Momentgrenze je Gelenk", type: "number", default: 100, min: 0.001, max: 1e6, help: "effort-Grenze in N bzw. Nm für alle Gelenke." },
  { key: "dateien.urdfGeschw", cat: "dateien", label: "URDF: Geschwindigkeitsgrenze je Gelenk", type: "number", default: 1, min: 0.001, max: 1e6, help: "velocity-Grenze in m/s bzw. rad/s für alle Gelenke." },
  { key: "dateien.sicherungen", cat: "dateien", label: "Sicherungen beim Speichern", type: "int", default: 1, min: 0, max: 9, help: "So viele frühere Fassungen bleiben neben der Datei: ».wcad.bak« ist die jüngste, dann ».bak2«, ».bak3« … 0 = keine neue Sicherung. Nur in der Desktop-Version." },
  { key: "dateien.maxImportMB", cat: "dateien", label: "Größte Datei ohne Rückfrage: STEP und Import", unit: "MB", type: "number", default: 200, min: 0, max: 100000, help: "Größere Dateien werden erst nach Rückfrage geöffnet. 0 = keine Grenze." },
  { key: "dateien.maxProjektMB", cat: "dateien", label: "Größte Datei ohne Rückfrage: Projekt", unit: "MB", type: "number", default: 500, min: 0, max: 100000, help: "0 = keine Grenze." },
  { key: "dateien.importAusrichtung", cat: "dateien", label: "Dateien aus unbekannten Programmen", type: "enum", default: "fragen", options: [{ value: "fragen", label: "Nach dem Einfügen »Aufstellen« anbieten" }, { value: "aufstellen", label: "Immer aufstellen (Y oben → Z oben)" }, { value: "standard", label: "So lassen, nicht fragen" }], help: "Viele Programme speichern mit Y nach oben, PBCAD hat Z oben." },
  { key: "darstellung.skalierung", cat: "darstellung", label: "Oberflächengröße", unit: "%", type: "enum", default: 100, options: [80, 90, 100, 110, 125, 150].map((v) => ({ value: v, label: v + " %" })), help: "Nur in der Desktop-Version; im Browser die Zoomfunktion des Browsers verwenden." },
  { key: "maus3d.aktiv", cat: "maus3d", label: "3D-Maus verwenden", type: "bool", default: true, help: "Freigegebene 3D-Mäuse werden beim Start und beim Einstecken automatisch verbunden." },
  { key: "maus3d.empfindlichkeit", cat: "maus3d", label: "Empfindlichkeit", type: "number", default: 1, min: 0.1, max: 5 },
  { key: "maus3d.totzone", cat: "maus3d", label: "Totzone", unit: "%", type: "number", default: 8, min: 0, max: 50, help: "Kleine Auslenkungen um die Ruhelage zählen nicht – gegen Wandern der Ansicht." },
  { key: "maus3d.modus", cat: "maus3d", label: "Bewegung", type: "enum", default: "alles", options: [{ value: "alles", label: "Verschieben und Drehen" }, { value: "drehen", label: "Nur Drehen" }, { value: "schwenken", label: "Nur Verschieben und Zoomen" }] },
  { key: "maus3d.dominant", cat: "maus3d", label: "Nur die stärkste Achse", type: "bool", default: false, help: "Es wirkt jeweils nur die Achse mit der größten Auslenkung – für gerade Bewegungen." },
  { key: "maus3d.schwenkenUmkehren", cat: "maus3d", label: "Verschieben umkehren", type: "bool", default: false },
  { key: "maus3d.zoomUmkehren", cat: "maus3d", label: "Zoomen umkehren", type: "bool", default: false },
  { key: "maus3d.drehenUmkehren", cat: "maus3d", label: "Drehen umkehren", type: "bool", default: false },
  { key: "maus3d.tasteLinks", cat: "maus3d", label: "Linke Taste", type: "enum", default: "view.fit", options: [{ value: "", label: "Nichts" }, { value: "view.fit", label: "Einpassen" }, { value: "view.iso", label: "Iso-Ansicht" }, { value: "view.front", label: "Vorne" }, { value: "view.top", label: "Oben" }, { value: "view.right", label: "Rechts" }, { value: "view.normal", label: "Senkrecht auf Auswahl" }, { value: "view.perspective", label: "Perspektive an/aus" }] },
  { key: "maus3d.tasteRechts", cat: "maus3d", label: "Rechte Taste", type: "enum", default: "view.iso", options: [{ value: "", label: "Nichts" }, { value: "view.fit", label: "Einpassen" }, { value: "view.iso", label: "Iso-Ansicht" }, { value: "view.front", label: "Vorne" }, { value: "view.top", label: "Oben" }, { value: "view.right", label: "Rechts" }, { value: "view.normal", label: "Senkrecht auf Auswahl" }, { value: "view.perspective", label: "Perspektive an/aus" }] },
  { key: "maus3d.kalibrierung", cat: "maus3d", label: "Kalibrierung", type: "cal3d", default: null, custom: true },
  { key: "darstellung.schrift", cat: "darstellung", label: "Schrift der Oberfläche", type: "enum", default: "standard", options: [{ value: "standard", label: "Standard (IBM Plex Sans / Segoe UI)" }, { value: "system", label: "Systemschrift" }, { value: "segoe", label: "Segoe UI" }, { value: "arial", label: "Arial" }, { value: "verdana", label: "Verdana" }, { value: "eigen", label: "Eigene (Name unten)" }] },
  { key: "darstellung.schriftEigen", cat: "darstellung", label: "Eigene Schrift (Name einer installierten Schrift)", type: "text", default: "", help: "Wird bei »Schrift der Oberfläche: Eigene« verwendet, z. B. »Calibri«. Fehlt die Schrift, gilt die Standardschrift." },
  { key: "oberflaeche.panels", cat: "darstellung", label: "Seitenleisten", type: "enum", default: "deckend", options: [{ value: "deckend", label: "Undurchsichtig" }, { value: "durchscheinend", label: "Durchscheinend" }], help: "Durchscheinend: Modellbrowser und Eigenschaften lassen den Hintergrund leicht durchscheinen (vor allem im schwebenden Fensteraufbau)." },
];

/** Werkzeuge, deren letzte Eingabe gemerkt wird (werkzeuge.letzte) */
export const TOOL_MEMO_KEYS = ["rundung", "versatz", "polygon", "muster", "kreismuster", "trafo-move", "trafo-rotate", "trafo-scale", "varianten"];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
export const settingDef = (key) => BY_KEY.get(key);

export function defaultSettings() {
  return Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));
}

/** Einen Wert prüfen. Ungültig → {ok:false, error}; nie stillschweigend ersetzen. */
export function validateValue(def, v) {
  if (!def) return { ok: false, error: "Unbekannte Einstellung" };
  switch (def.type) {
    case "bool":
      return typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: "Ja/Nein erwartet" };
    case "int":
    case "number": {
      const n = typeof v === "string" ? Number(v.trim().replace(",", ".")) : v;
      if (typeof n !== "number" || !Number.isFinite(n) || (typeof v === "string" && v.trim() === "")) return { ok: false, error: "Zahl erwartet" };
      if (def.type === "int" && !Number.isInteger(n)) return { ok: false, error: "Ganze Zahl erwartet" };
      if (def.min !== undefined && n < def.min) return { ok: false, error: `Mindestens ${def.min}${def.unit ? " " + def.unit : ""}` };
      if (def.max !== undefined && n > def.max) return { ok: false, error: `Höchstens ${def.max}${def.unit ? " " + def.unit : ""}` };
      return { ok: true, value: n };
    }
    case "enum": {
      const opt = def.options.find((o) => o.value === v || String(o.value) === String(v));
      return opt ? { ok: true, value: opt.value } : { ok: false, error: "Wert nicht erlaubt" };
    }
    case "keymap":
      return validateKeymap(v);
    case "macros":
      return validateMacros(v);
    case "cmdlist": {
      if (!Array.isArray(v)) return { ok: false, error: "Liste von Befehlen erwartet" };
      if (v.length > 30) return { ok: false, error: "Höchstens 30 Befehle" };
      const bad = v.filter((id) => typeof id !== "string" || !commandDef(id));
      if (bad.length) return { ok: false, error: "Unbekannter Befehl: " + bad.join(", ") };
      if (new Set(v).size !== v.length) return { ok: false, error: "Befehl doppelt" };
      return { ok: true, value: [...v] };
    }
    case "layout":
      return validateLayout(v);
    case "folder":
      if (typeof v !== "string") return { ok: false, error: "Ordner erwartet" };
      if (v.length > 500 || /[\u0000-\u001f]/.test(v)) return { ok: false, error: "Ungültiger Ordnerpfad" };
      return { ok: true, value: v.trim() };
    case "cal3d": {
      if (v === null) return { ok: true, value: null };
      const ok3 = (a) => Array.isArray(a) && a.length === 3 && a.every((x) => Number.isFinite(x) && Math.abs(x) <= 2000);
      if (!v || !ok3(v.t) || !ok3(v.r)) return { ok: false, error: "Kalibrierung ungültig" };
      return { ok: true, value: { t: v.t.map(Math.round), r: v.r.map(Math.round) } };
    }
    case "text":
      if (typeof v !== "string") return { ok: false, error: "Text erwartet" };
      if (v.length > 200 || /[\u0000-\u001f"';{}<>]/.test(v)) return { ok: false, error: "Ungültige Zeichen" };
      return { ok: true, value: v.trim() };
    case "name":
      return validateNameTemplate(v, def.placeholders, { allowEmpty: !!def.allowEmpty });
    case "sheetrules":
      return validateSheetRules(v);
    case "bendtables":
      return validateBendTables(v);
    case "materialkey":
      return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(v) ? { ok: true, value: v } : { ok: false, error: "Werkstoff-Kürzel erwartet" };
    case "ribbon":
      return validateRibbonLayout(v);
    case "materials":
      return validateMaterialLib(v);
    case "toolmemo": { // {werkzeug: Text | {feld: Text}} – nur bekannte Werkzeuge, kurze Texte
      if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Werkzeugwerte erwartet" };
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        if (!TOOL_MEMO_KEYS.includes(k)) return { ok: false, error: "Unbekanntes Werkzeug: " + k };
        const okText = (t) => typeof t === "string" && t.length <= 200;
        if (okText(x)) out[k] = x;
        else if (x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length <= 8 && Object.values(x).every(okText)) out[k] = { ...x };
        else return { ok: false, error: "Ungültiger Wert für " + k };
      }
      return { ok: true, value: out };
    }
    case "drawtemplate":
      return validateTemplate(v);
    case "holepresets":
      return validateHolePresets(v);
    case "slicers": {
      if (!Array.isArray(v) || v.length > 8) return { ok: false, error: "Liste von höchstens 8 Slicern erwartet" };
      const bad = (t, n) => typeof t !== "string" || !t.trim() || t.length > n || /[\u0000-\u001f]/.test(t);
      if (v.some((x) => !x || bad(x.name, 60) || bad(x.exe, 500))) return { ok: false, error: "Slicer braucht Namen und Programmpfad" };
      return { ok: true, value: v.map((x) => ({ name: x.name.trim(), exe: x.exe.trim() })) };
    }
    case "plasticrules":
      return validatePlasticRules(v);
    case "profiles": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Profile erwartet" };
      const e = Object.entries(v);
      if (e.length > 20) return { ok: false, error: "Höchstens 20 Profile" };
      if (e.some(([k, t]) => !k.trim() || k.length > 60 || typeof t !== "string" || t.length > 400000)) return { ok: false, error: "Ungültiges Profil" };
      return { ok: true, value: { ...v } };
    }
    case "stocklist": { // {Profil-ID: Stangenlänge mm}
      if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Stangenlängen erwartet" };
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        const n = Number(x);
        if (typeof k !== "string" || !k || k.length > 60 || !(n >= 100 && n <= 30000)) return { ok: false, error: `Stangenlänge für ${k}: 100 … 30000 mm` };
        out[k] = n;
      }
      if (Object.keys(out).length > 300) return { ok: false, error: "Höchstens 300 Profile" };
      return { ok: true, value: out };
    }
    case "color":
      return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false, error: "Farbe als #rrggbb erwartet" };
    default:
      return { ok: false, error: "Unbekannter Typ" };
  }
}

/** Migrationen: Index = Ausgangsversion. Jede Funktion bekommt die Werte und gibt neue zurück. */
const MIGRATIONS = {
  // 0: Werte ohne Hülle (frühe Entwicklerstände) – nur einpacken
  0: (values) => values,
};

/**
 * Gespeicherten Text oder Objekt einlesen. Liefert immer ein vollständiges, gültiges Ergebnis:
 * { values, warnings[], migratedFrom, corrupt }. Ungültige oder unbekannte Einträge werden
 * verworfen und als Warnung gemeldet – nicht stillschweigend.
 */
export function loadSettings(input) {
  const warnings = [];
  const values = defaultSettings();
  if (input === null || input === undefined || input === "") return { values, warnings, migratedFrom: null, corrupt: false };
  let raw = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch {
      return { values, warnings: ["Einstellungsdatei ist beschädigt – Standardwerte werden verwendet, die alte Datei wird als Sicherung aufbewahrt."], migratedFrom: null, corrupt: true };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { values, warnings: ["Einstellungsdatei hat ein unbekanntes Format – Standardwerte werden verwendet."], migratedFrom: null, corrupt: true };
  }
  let version, stored;
  if (raw.format === SETTINGS_FORMAT) {
    version = Number(raw.version);
    stored = raw.values && typeof raw.values === "object" ? raw.values : {};
  } else if (raw.format === undefined && raw.values === undefined) {
    version = 0;
    stored = raw;
  } else {
    return { values, warnings: ["Keine PBCAD-Einstellungsdatei – Standardwerte werden verwendet."], migratedFrom: null, corrupt: true };
  }
  if (!Number.isInteger(version) || version < 0) {
    return { values, warnings: ["Unbekannte Version der Einstellungsdatei – Standardwerte werden verwendet."], migratedFrom: null, corrupt: true };
  }
  if (version > SETTINGS_VERSION) {
    warnings.push(`Einstellungen stammen aus einer neueren PBCAD-Version (${version}); bekannte Werte werden übernommen.`);
  }
  let migratedFrom = null;
  for (let v = version; v < SETTINGS_VERSION; v++) {
    if (!MIGRATIONS[v]) break;
    stored = MIGRATIONS[v]({ ...stored });
    migratedFrom = version;
  }
  for (const [k, v] of Object.entries(stored)) {
    const def = BY_KEY.get(k);
    if (!def) { if (version <= SETTINGS_VERSION) warnings.push(`Unbekannte Einstellung »${k}« ignoriert`); continue; }
    const r = validateValue(def, v);
    if (r.ok) values[k] = r.value;
    else warnings.push(`»${def.label}«: ${r.error} – Standardwert ${fmtDefault(def)} verwendet`);
  }
  return { values, warnings, migratedFrom, corrupt: false };
}

/** Zum Speichern/Exportieren: nur Abweichungen vom Standard, mit Format und Version */
/** Einstellungsprofil (E6): alle Werte außer den Profilen selbst als Text */
export function profileSnapshot(values) {
  return serializeSettings({ ...values, "allgemein.profile": {} });
}
export function serializeSettings(values) {
  const out = {};
  for (const s of SETTINGS) {
    const v = values[s.key];
    if (v === undefined) continue;
    if (typeof v === "object" ? JSON.stringify(v) !== JSON.stringify(s.default) : v !== s.default) out[s.key] = v;
  }
  return JSON.stringify({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION, values: out }, null, 2);
}

/** Effektiver Wert nach Masterplan 14; undefined-Ebenen werden übersprungen */
export function effectiveValue(key, { user, doc, explicit } = {}) {
  const def = BY_KEY.get(key);
  for (const layer of [explicit, doc, user]) {
    if (layer && layer[key] !== undefined && validateValue(def, layer[key]).ok) return validateValue(def, layer[key]).value;
  }
  return def?.default;
}

/** Suche über Bezeichnung, Hilfe, Kategorie und geplante Punkte */
export function searchSettings(query) {
  const q = norm(query);
  if (!q) return { settings: SETTINGS, categories: CATEGORIES };
  const words = q.split(/\s+/);
  const hit = (text) => { const t = norm(text); return words.every((w) => t.includes(w)); };
  const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || "";
  const settings = SETTINGS.filter((s) => hit([s.label, s.help, s.unit, s.key, catLabel(s.cat), ...(s.options || []).map((o) => o.label)].filter(Boolean).join(" ")));
  const categories = CATEGORIES.filter((c) => settings.some((s) => s.cat === c.id) || hit([c.label, c.note, ...(c.planned || [])].filter(Boolean).join(" ")));
  return { settings, categories };
}

function fmtDefault(def) {
  if (def.type === "bool") return def.default ? "»ja«" : "»nein«";
  if (def.type === "enum") return "»" + (def.options.find((o) => o.value === def.default)?.label ?? def.default) + "«";
  return String(def.default) + (def.unit ? " " + def.unit : "");
}
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").trim();
