// Werkzeuge Stufe 43: Mehrsprachigkeit der Oberfläche (erste Ausbaustufe: Menüband, Befehlssuche, Kategorien).
// Texte bleiben im Code deutsch; t() übersetzt beim Anzeigen. Fehlt ein Eintrag, erscheint der deutsche Text.

export const LANGUAGES = [["de", "Deutsch"], ["en", "English"]];
let lang = "de";
export const setLanguage = (l) => { lang = LANGUAGES.some(([k]) => k === l) ? l : "de"; };
export const language = () => lang;

const EN = {
  "Iso": "Iso", "Vorne": "Front", "Hinten": "Back", "Links": "Left", "Rechts": "Right", "Oben": "Top", "Unten": "Bottom",
  "Normal zur Fläche": "Normal to face", "Alles zeigen": "Zoom all", "Auswahl zeigen": "Zoom selection", "Ansicht speichern": "Save view", "Ansichten": "Views",
  "Orthogonal": "Orthographic", "Perspektive": "Perspective", "Alles wählbar": "Select all types", "Nur Flächen": "Faces only", "Nur Kanten": "Edges only",
  "Alle wählen": "Select all", "Umkehren": "Invert", "Modellbrowser": "Model browser", "Eigenschaften": "Properties", "Anordnung zurücksetzen": "Reset layout",
  "Browser rechts": "Browser right", "Eigenschaften links": "Properties left", "Alle einblenden": "Show all", "Schnell": "Fast", "Normal": "Normal", "Fein": "Fine",
  "Skizze erstellen": "Create sketch", "3D-Skizze": "3D sketch", "Arbeitsebene": "Work plane", "Arbeitsachse": "Work axis", "Arbeitspunkt": "Work point",
  "Extrusion": "Extrude", "Ausschnitt": "Cut", "Drehung": "Revolve", "Bohrung": "Hole", "Prägen": "Emboss", "Regelkörper": "Primitive", "Sweeping": "Sweep",
  "Erhebung": "Loft", "Spirale": "Coil", "Rohr / Profil": "Tube / profile", "Rahmen aus Skizze": "Frame from sketch", "Profilzug 3D": "3D profile path",
  "Rohr gebogen": "Bent tube", "Knickrahmen": "Notched frame", "Endkappe": "End cap", "Kürzen/Verlängern": "Trim/extend", "Kantteil": "Bent sheet",
  "Konturlasche": "Contour flange", "Lasche": "Flange", "Umschlag": "Hem", "Durchzug": "Extruded hole", "Ecke schließen": "Corner seam", "Schraubenverbindung": "Bolted connection", "Stanzwerkzeug": "Punch tool", "Konturwalzen": "Contour roll", "Trennfuge": "Rip", "Geländer": "Railing", "Tor": "Gate",
  "Schiebetor": "Sliding gate", "Zaun": "Fence", "Treppe": "Stair", "Spindeltreppe": "Spiral stair", "Balkon": "Balcony", "Stirn-/Fußplatte": "End/base plate",
  "Rippe": "Rib", "Schweißnaht": "Weld", "Normteil": "Standard part", "Rahmenecke": "Frame corner", "Pfette": "Purlin", "Windverband": "Wind bracing", "Stützenfuß": "Column base", "Trägerstoß": "Beam splice", "Trägeranschluss": "Beam connection", "Fachwerkträger": "Truss", "Fachwerkträger Parallel/Pult/Sattel, N/V/W (Generator)": "Truss girder parallel/mono-pitch/duo-pitch, N/V/W (generator)", "Steigleiter": "Fixed ladder", "Steigleiter mit Rückenschutz nach ISO 14122-4 (Generator)": "Fixed ladder with safety cage to ISO 14122-4 (generator)", "Gelenkiger Trägeranschluss: Fahnenblech, Doppelwinkel, Stirnplatte (Generator)": "Pinned beam connection: fin plate, double angle, end plate (generator)", "Trägerstoß mit Flansch- und Steglaschen (Generator)": "Beam splice with flange and web plates (generator)", "Stützenfuß mit Ankern (Generator)": "Column base with anchors (generator)",
  "Rundung": "Fillet", "Fase": "Chamfer", "Wandung": "Shell", "Kombinieren": "Combine", "Trennen": "Split", "Verschieben": "Move", "Aufdicken": "Thicken",
  "Fläche verschieben": "Push/pull face", "Entformung": "Draft", "Rechteckig": "Rectangular", "Kreisförmig": "Circular", "Entlang Pfad": "Along path",
  "Spiegeln": "Mirror", "Messen": "Measure", "Parameter": "Parameters", "STEP einfügen": "Insert STEP", "Abgeleitetes Bauteil": "Derived part",
  "Neu berechnen": "Rebuild", "Zeichnung ableiten": "Create drawing", "Säubern": "Clean up", "DXF importieren": "Import DXF", "Konstruktion": "Construction",
  "Voll bemaßen": "Fully dimension", "Symbole": "Symbols", "Rasterfang": "Grid snap", "Skizze fertig": "Finish sketch", "Platzieren": "Place",
  "Neues Bauteil": "New part", "Aus Datei": "From file", "Muster": "Pattern", "Fläche an Fläche": "Mate", "Bündig": "Flush", "Konzentrisch": "Concentric",
  "Einfügen": "Insert", "Winkel": "Angle", "Tangential": "Tangent", "Stückliste": "Bill of materials", "Zuschnittliste": "Cut list", "Kollision prüfen": "Check interference",
  "Drehgelenk": "Revolute joint", "Zylindergelenk": "Cylindrical joint", "Bewegen": "Animate", "Kontaktlöser": "Contact solver", "Konstruktion": "Design accelerator", "Welle": "Shaft", "Stirnrad": "Spur gear", "Lager": "Bearing", "Druckfeder": "Compression spring", "Bereichseigenschaften": "Region properties", "Entformungsanalyse": "Draft analysis", "Schweißbaugruppe": "Weldment", "iFeature erstellen": "Extract iFeature", "iFeature einfügen": "Insert iFeature", "Kontaktsatz": "Contact set", "Video": "Video", "Explosion": "Explode", "Einzelteilzeichnungen": "Part drawings",
  "Grundansichten": "Base views", "Ansicht hinzufügen": "Add view", "Schnitt": "Section", "Schnitt Hohlprofil": "Hollow section", "Detail": "Detail",
  "Hilfsansicht": "Auxiliary view", "Abwicklung": "Flat pattern", "Bruch": "Break", "Ausbruch": "Break-out", "Bemaßung": "Dimension", "Hauptmaße": "Overall dimensions",
  "Text": "Text", "Hinweis": "Leader note", "Bohrungstabelle": "Hole table", "Oberfläche": "Surface texture", "Form/Lage": "Geometric tolerance", "Bezug": "Datum",
  "Schweißnähte": "Welds", "Änderung": "Revision", "Pos.-Nummern": "Balloons", "Blatt einpassen": "Fit sheet", "STEP": "STEP", "STEP + Zuschnittliste": "STEP + cut list",
  "STL": "STL", "IGES": "IGES", "IGES exportieren (Flächen, NURBS)": "Export IGES (surfaces, NURBS)", "Bild (PNG)": "Image (PNG)", "Rendern": "Render", "Profile einzeln (STEP)": "Profiles one by one (STEP)", "Zuschnittliste (CSV)": "Cut list (CSV)",
  "Nahtliste (CSV)": "Weld list (CSV)", "Listen (Excel)": "Lists (Excel)", "Platte als DXF": "Plate as DXF", "Skizze als DXF": "Sketch as DXF",
  "Fertigungsmappe": "Production package", "Angebotsblatt": "Quotation sheet", "DSTV-NC (Stahlbau)": "DSTV-NC (steel)", "IFC (BIM)": "IFC (BIM)", "IFC exportieren (BIM, Stahlbau)": "Export IFC (BIM, steel)", "DSTV-NC für Säge-, Bohr- und Brennanlagen (Stahlbau)": "DSTV-NC for saw, drill and cutting machines (steel)", "Stückliste (CSV)": "Bill of materials (CSV)", "PDF": "PDF", "DXF": "DXF", "SVG": "SVG",
  "Ansicht": "View", "Ausrichtung": "Orientation", "Zoom": "Zoom", "Benannt": "Named", "Projektion": "Projection", "Modus": "Mode", "Auswahl": "Selection",
  "Fenster": "Window", "Sichtbarkeit": "Visibility", "Qualität": "Quality", "3D-Modell": "3D model", "Skizze": "Sketch", "Arbeitselemente": "Work features",
  "Erstellen": "Create", "Profile": "Profiles", "Blech": "Sheet metal", "Generatoren": "Generators", "Anschluss": "Connections", "Stahlbau": "Steel construction",
  "Ändern": "Modify", "Körper": "Bodies", "Prüfen": "Inspect", "Verwalten": "Manage", "Zeichnung": "Drawing", "Formen": "Shapes", "Übernehmen": "Apply",
  "Abhängigkeiten": "Constraints", "Abhängigkeit": "Constraint", "Abhängigkeit platzieren": "Place Constraint", "Anzeige": "Display", "Beenden": "Exit", "Zusammenfügen": "Assemble", "Komponente": "Component", "Positionieren": "Position",
  "Listen": "Lists", "Bewegung": "Motion", "Beschriften": "Annotate", "Baugruppe": "Assembly", "Blatt": "Sheet", "3D": "3D", "2D": "2D", "Werkstatt": "Workshop",
  "Export": "Export", "Nach links": "Move left", "Nach rechts": "Move right", "Menüband anpassen…": "Customize ribbon…", "Neues Projekt": "New project",
  "Datei": "File", "Projekt öffnen": "Open project", "Speichern": "Save", "Speichern unter": "Save as", "Neue Baugruppe": "New assembly",
  "STEP als Bauteil importieren": "Import STEP as part", "Einstellungen": "Settings", "Programm": "Application", "Befehl suchen": "Search commands",
  "Rückgängig": "Undo", "Bearbeiten": "Edit", "Wiederholen": "Redo", "Modell": "Model", "Berechnungsprotokoll": "Rebuild log", "Gespeicherte Ansichten": "Saved views",
  "Perspektive ein/aus": "Perspective on/off", "Darstellung schattiert mit Kanten": "Shaded with edges", "Darstellung schattiert": "Shaded",
  "Darstellung Drahtmodell": "Wireframe", "Darstellung transparent": "Transparent", "Darstellung fotorealistisch": "Photorealistic",
  "Alle Körper einblenden": "Show all bodies", "Gewählten Körper ausblenden": "Hide selected body", "Gewählten Körper isolieren": "Isolate selected body",
  "Auswahlfilter: alles": "Selection filter: all", "Auswahlfilter: nur Flächen": "Selection filter: faces only", "Auswahlfilter: nur Kanten": "Selection filter: edges only",
  "Alles auswählen": "Select all", "Auswahl umkehren": "Invert selection", "Schnitt X ein/aus": "Section X on/off", "Schnitt Y ein/aus": "Section Y on/off", "Schnitt Z ein/aus": "Section Z on/off",
  "Prägen / Gravieren": "Emboss / engrave", "Rippe (Steife)": "Rib (stiffener)", "Geländer (Generator)": "Railing (generator)", "Tor (Generator)": "Gate (generator)",
  "Treppe (Generator)": "Stair (generator)", "Balkon (Generator)": "Balcony (generator)", "Rahmenecke biegesteif (Generator)": "Moment frame corner (generator)",
  "Pfette mit Pfettenschuhen (Generator)": "Purlin with cleats (generator)", "Windverband mit Spannschloss (Generator)": "Wind bracing with turnbuckle (generator)",
  "Spindeltreppe (Generator)": "Spiral stair (generator)", "Bauteil aus Datei verknüpfen": "Link part from file", "Bauteil als eigene Datei speichern": "Save part as own file",
  "Verknüpfte Bauteile aktualisieren": "Refresh linked parts", "Bild der Ansicht (PNG)": "Image of the view (PNG)", "Fotorealistisches Bild (PNG, hoch aufgelöst)": "Photorealistic image (PNG, high resolution)",
  "Listen als Excel (.xlsx)": "Lists as Excel (.xlsx)", "Angebotsblatt (PDF)": "Quotation sheet (PDF)", "Fertigungsmappe (PDF + Dateien als ZIP)": "Production package (PDF + files as ZIP)",
  "Kantteil (Blech)": "Bent sheet (sheet metal)", "Konturlasche (Blech aus Skizze)": "Contour flange (sheet metal from sketch)", "Lasche / Stirnlasche (Blech)": "Flange / end flange (sheet metal)",
  "3D-Skizze (Punktzug im Raum)": "3D sketch (polyline in space)", "Umschlag (Blech)": "Hem (sheet metal)", "Durchzug (Blech)": "Extruded hole (sheet metal)", "Ecke schließen (Blech)": "Corner seam (sheet metal)", "Stanzwerkzeug (Blech)": "Punch tool (sheet metal)", "Konturwalzen (Blech)": "Contour roll (sheet metal)", "Trennfuge (Blech)": "Rip (sheet metal)",
  "Rohr gebogen (über Polygonzug)": "Bent tube (along polyline)", "Muster rechteckig": "Rectangular pattern", "Muster kreisförmig": "Circular pattern", "Muster entlang Pfad": "Pattern along path",
  "Sweeping (Profil entlang Pfad)": "Sweep (profile along path)", "Erhebung (Loft zwischen Querschnitten)": "Loft (between sections)", "Spirale (Feder, Wendel)": "Coil (spring, helix)",
  "Endkappe (Profilende)": "End cap (profile end)", "Profil kürzen/verlängern an Ebene": "Trim/extend profile to plane", "Körper kombinieren": "Combine bodies", "Körper trennen": "Split body",
  "Körper verschieben/drehen": "Move/rotate body", "Entformung (Flächenverjüngung)": "Draft (face taper)", "Einzelteilzeichnungen erzeugen": "Create part drawings",
  "Normteil einfügen": "Insert standard part", "Bauteil platzieren": "Place part", "Einfügen (Achse und Stirnfläche)": "Insert (axis and face)", "Winkel zwischen Flächen": "Angle between faces",
  "Tangential (Zylinder an Fläche)": "Tangent (cylinder to face)", "Komponentenmuster": "Component pattern", "Komponente spiegeln": "Mirror component", "Drehgelenk anlegen": "Add revolute joint",
  "Gelenke bewegen (Animation)": "Animate joints", "Explosionsdarstellung": "Exploded view", "Makros": "Macros", "Makros verwalten": "Manage macros",
  "Makro aufzeichnen ein/aus": "Record macro on/off", "Variantentabelle": "Variant table", "Regeln": "Rules",
};
const PREFIX = [["Skizze: ", "Sketch: "], ["Abhängigkeit ", "Constraint "], ["Ansicht ", "View "], ["Makro: ", "Macro: "]];
const WORDS = { "Auswählen": "Select", "Linie": "Line", "Rechteck": "Rectangle", "Rechteck aus Mitte": "Center rectangle", "Kreis": "Circle", "Bogen": "Arc", "Bogen um Mittelpunkt": "Center arc",
  "Vollständig bemaßen": "Fully dimension", "Spline": "Spline", "Ellipse": "Ellipse", "Langloch": "Slot", "Polygon": "Polygon", "Versatz": "Offset", "Rechteckmuster": "Rectangular pattern",
  "Kreismuster": "Circular pattern", "Punkt": "Point", "Stutzen": "Trim", "Verlängern": "Extend", "Teilen": "Split", "Kante projizieren": "Project edge", "Konstruktionslinie ein/aus": "Construction on/off",
  "Rasterfang ein/aus": "Grid snap on/off", "horizontal": "horizontal", "vertikal": "vertical", "koinzident": "coincident", "parallel": "parallel", "senkrecht": "perpendicular", "gleich": "equal",
  "tangential": "tangent", "fixieren": "fix", "Mittelpunkt": "midpoint", "konzentrisch": "concentric", "kollinear": "collinear", "symmetrisch": "symmetric" };

/** Text in der eingestellten Sprache */
export function t(text) {
  if (lang === "de" || typeof text !== "string") return text;
  if (EN[text]) return EN[text];
  for (const [de, en] of PREFIX) if (text.startsWith(de)) { const rest = text.slice(de.length); return en + (EN[rest] || WORDS[rest] || rest); }
  return text;
}
/** Anteil übersetzter Texte (für den Test der Abdeckung) */
export const hasTranslation = (text) => !!EN[text] || PREFIX.some(([de]) => text.startsWith(de) && (EN[text.slice(de.length)] || WORDS[text.slice(de.length)]));
