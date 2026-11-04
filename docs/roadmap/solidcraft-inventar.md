# SolidCraft – vollständiges Inventar (Handbuch + Quellcode)

Stand: 04.11.2026. Quelle: github.com/tangency-labs/solidcraft (MIT/Apache-2.0), Handbuch `docs/book/src/guide/*.md`,
Befehlsliste und deutsche Hilfetexte aus `assets/locales/de.json`, Befehlsoptionen aus `crates/engine/src/schema/*.rs`,
Einstellungen aus `crates/ui-egui/src/prefs/*.rs`. Zu jedem Befehl steht, ob PBCAD ihn schon hat.

**Inhalt**

1. Überblick und Kern
2. Aufbau des Quellcodes
3. Handbuch Kapitel für Kapitel
4. Dateiformate
5. Tastenkürzel und Maus
6. Lückenliste für PBCAD (was noch fehlt oder dünner ist)
7. Alle Befehle nach Bereich mit Stand PBCAD (Teil 1)
8. Alle Befehlsoptionen (Teil 2)
9. Alle Einstellungen nach Seite (Teil 3)

**Zahlen auf einen Blick:** 504 Befehle in der deutschen Sprachdatei, davon 441 bedienbare Befehle in den Tabellen
unten. In PBCAD: **264 vorhanden**, **117 in E1–E6 nachgebaut**, **60 bewusst weggelassen** (58 Rendern, 2 Kernfunktionen).
138 Befehle haben ein Optionen-Schema. 9 Einstellungsseiten.

---

## 1. Überblick und Kern

SolidCraft ist ein parametrisches 3D-CAD in Rust: Skizze mit Bedingungslöser, Zeitleiste (Verlauf), Volumen, Flächen, Blech,
Kunststoffteile, Baugruppen mit Gelenken und Bewegungsstudien; Rendern ist ein großer eigener Teil.
Alles ist ein Befehl: jede Schaltfläche ruft einen benannten Befehl (`solid.extrude`, `sheet.flange` …) mit JSON-Optionen auf.
Dieselben Befehle laufen über die Kommandozeile (`solidcraft-cli`), einen Steuerkanal, MCP und den eingebauten KI-Assistenten.

**Kern (Richtigstellung):** Der Volumenkern ist **solidcore**, die Rust-Portierung von **NVIDIA SMLib** (Apache-2.0,
eigenes Repo tangency-labs/solidcore), eingebunden über `crates/smlib` und dahinter eine eigene Schnittstelle `crates/kernel`
(Extrudieren, Drehen, Boolesche Operationen, Rundungen, Fasen, Schale, Netze, Messen, STEP). Meine frühere Angabe
„truck“ war falsch: Es ist kein selbst geschriebener Kern, aber auch nicht truck, sondern ein portierter, ausgereifter
NURBS-Kern. PBCAD nutzt Open Cascade (OCCT); der Abstand ist damit klein, ein Kernwechsel bringt nichts.

## 2. Aufbau des Quellcodes

| Crate | Zweck | Umfang |
|---|---|---|
| `geom` | Vektoren, Ebenen, Koordinatensysteme, Netze und ihre Maße | 74 Dateien, 37 000 Zeilen |
| `smlib` | Kern solidcore (SMLib-Port) hinter sicherer Hülle | 53 Dateien, 25 000 Zeilen |
| `kernel` | eigene Kern-Schnittstelle: Körper, Booleans, Rundungen, Netze, Messen, STEP | 161 Dateien, 70 000 Zeilen |
| `sketch` | Punkte, Kurven, Bedingungen, Maße, Bedingungslöser, Profilerkennung | 54 Dateien, 31 000 Zeilen |
| `doc` | Dokumentmodell: Parameter und Ausdrücke, Skizzen und Features auf der Zeitleiste, schrittweise Neuberechnung | 225 Dateien, 77 000 Zeilen |
| `engine` | Sitzung, Befehlsregister („alles ist ein Befehl“), Rückgängig, Auswahl, Befehlsschemas | 426 Dateien, 199 000 Zeilen |
| `io` | Dateiformate: .sc/JSON, STL, OBJ, STEP, IGES, 3MF, glTF, FreeCAD/Rhino-Import | 35 Dateien, 18 000 Zeilen |
| `ui-egui` | Oberfläche (egui + wgpu), austauschbar | 458 Dateien, 324 000 Zeilen |

Rund 780 000 Zeilen Rust. Bemerkenswert: Die Oberfläche ist vom Rest getrennt, jeder Klick erzeugt einen Befehl, der
auch ohne Fenster läuft. Das Handbuch hat zu jedem Befehl Bilder, die ein Skript aus Beispiel-JSONs erzeugt
(`docs/book/scripts/*.json`).

## 3. Handbuch Kapitel für Kapitel

### Erste Schritte
Installer je System, Programm `solidcraft`, Kommandozeile `solidcraft-cli`, Dateien `.sc`. `solidcraft teil.step` öffnet
STEP, IGES, 3MF, STL direkt. Abgesicherter Modus (`--safe-mode`): Standardeinstellungen, Software-Grafik, keine Wiederherstellung.

### Rundgang durch die Oberfläche
Menüband mit Reitern (Volumen, Flächen, Blech, Kunststoff, Baugruppe, Prüfen, Einfügen, Werkzeuge), darunter Befehlssuche (Taste S).
Links Browser (Modellbaum) mit Ursprung, Körpern, Skizzen, Komponenten; unten Zeitleiste; rechts schwebende Dialoge mit
Vorschau; Navigationsleiste unten (Drehen, Schwenken, Zoom, Einpassen, Ansichtsart); ViewCube oben rechts; Statusleiste.
Dokument-Reiter oben, Aktualisieren-Hinweis in der Titelleiste. Schwebende oder kompakte Anordnung, 14 Farbthemen.

### Skizzieren und Bedingungen
- **Geometrie:** Linie (auch Mittelpunktlinie, Tangente), Rechteck (2 Punkte, 3 Punkte, Mittelpunkt), Kreis (Mittelpunkt,
  2/3 Punkte, 2/3 Tangenten), Bögen (3 Punkte, Mittelpunkt, tangential), Ellipse, Langloch (mehrere Arten), Polygon,
  Spline (Stützpunkte und Kontrollpunkte), Übergangskurve, Gleichungskurve, Text, Punkt, 3D-Skizze mit Bogen im Raum.
- **Ändern:** Stutzen, Dehnen, Trennen, Versatz, Spiegeln, Muster (rechteckig, kreisförmig), Rundung, Fase (gleich, zwei
  Abstände, Abstand + Winkel), Verschieben/Kopieren/Drehen/Skalieren, Ausschneiden/Einfügen, Projizieren, Schnittkurve.
- **Bedingungen:** koinzident, horizontal/vertikal, parallel, senkrecht, tangential, krümmungsstetig, gleich, symmetrisch,
  Mittelpunkt, fixiert, konzentrisch, Punkt auf Kurve; Maße (Länge, Abstand, Winkel, Radius, Durchmesser).
  Auto-Bedingung legt eine grobe Skizze in einem Schritt fest, auch von einem Bezugspunkt aus.
- **Fang:** Endpunkt, Mitte, Kreuzung, Mittelpunkt, Hilfslinien aus Punkten; Strg/Alt unterdrückt den Fang, Umschalt
  bevorzugt Linienmitte. L, R, C starten die zuletzt benutzte Variante; nochmal drücken schaltet die Variante weiter.
- **Profile:** geschlossene Bereiche werden selbst erkannt, Inseln und Überschneidungen ausgewertet.
- **Einheiten:** mm, cm, m, Zoll, Fuß je Dokument; Werte mit Einheit eintippbar.
- **Spiegeln/Muster/Versatz prüfen:** Ergebnis wird hervorgehoben, Fehler werden erklärt.

### Volumen-Features
Extrusion (Abstand, bis Fläche, symmetrisch, zwei Seiten, Verjüngung, Operation neu/vereinigen/schneiden/schneiden mit
Automatik), Drehen, Austragen (Sweep), Erhebung (Loft mit Führungen), Rohr, Rippe, Gewinde, Bohrung (Senkung, Gewinde,
Normbohrung), Rundung (konstant, variabel, Vollrundung), Fase, Schale, Formschräge, Teilen, Kombinieren, Spiegeln,
Muster (rechteckig, kreisförmig, entlang Pfad), Drücken/Ziehen (Q), Fläche verschieben/versetzen/ersetzen/löschen,
Körper verschieben/kopieren, Skalieren. **Körper vergleichen** zeigt Unterschiede zweier Körper farbig.
Achsen und Punkte auf runden Kanten und Flächen (Mittelachse, Mittelpunkt) für Arbeitselemente.
Jedes Feature ist per Skript editierbar (`feature.edit`).

### Parameter und Ausdrücke
Benutzerparameter mit Einheit und Kommentar, Ausdrücke in jedem Wertfeld (`breite / 2 + 3`), Wert beim Tippen benennen
(`breite = 40`), Funktionen (sin, cos, sqrt, min, max, if …), Pfeiltasten und Mausrad verstellen Werte (Umschalt ×10, Alt ×0,1).
**Parameterbereich prüfen:** ein Parameter wird über einen Bereich durchgespielt, Fehler und Kollisionen werden gemeldet.

### Kunststoffteile
Vorsprung (Dom), Rippe, Schnappverbindung, Lüftungsgitter, Lippe/Nut, Wanddicke prüfen, Entformschräge analysieren –
mit Kunststoffregeln (Wanddicke, Formschräge, Radien) je Dokument.

### Blech
Blechregeln (Dicke, Biegeradius, K-Faktor, Freistiche, Spalte, Eckfreistich, Winkelanzeige), persönliche Regeln im Profil
(bis 64, „Neu speichern“, Umbenennen, Löschen). Flansch (Grundflansch aus Profil, Konturflansch aus offener Skizze,
Kantenflansch), **Höhe gemessen ab** außen / innen / tangential, **Biegeposition** innen / außen / Mitte / Material außen /
tangential, Saum, Falten an Skizzenlinie, Abwickeln/Zurückfalten, Umwandeln (Platte oder Volumen mit Biegekanten),
Abwicklung mit Biegelinien und Biegetabelle, Export DXF und Biegetabelle CSV. Spiegeln eines Blechkörpers ergibt
ein Spiegelteil mit eigener Abwicklung. Pfadflansch, Biegung hinzufügen, weitere Biegungen.

### Baugruppen und Gelenke
- Komponenten anlegen, aus Körpern erzeugen, aktive Komponente, Skizzen an ihre Teile verschieben.
- Vorkommen: Einfügen (gleiche Komponente), Neu einfügen (unabhängige Kopie), Lage übernehmen/zurücksetzen,
  Fixieren/Lösen; erstes Teil wird automatisch fixiert.
- **Teil ziehen:** Teil folgt der Maus in der Bildebene, Gelenke begrenzen; Esc setzt zurück.
- **Bewegen entlang freier Gelenkachsen** mit Pfeilen und Drehringen, Rastung 10° / 0,1°, Anzeige von Weg und Winkel.
- **Gelenke:** starr, Dreh, Schiebe, Zylinder, Stift-Nut, eben, Kugel; Versatz, Umkehren, Grenzen; Gelenk „wie gebaut“,
  starre Gruppe, Gelenke antreiben, Bewegungskopplung (verkettbar bis 64).
- **Beziehungen:** parallel, senkrecht, Winkel, Punkt auf Ebene, Punkt auf Linie, Linie auf Ebene – addieren sich.
- Werte als Ausdrücke über Parameter; Gelenkursprung auf Kante, Ecke, Fläche, Bohrung, per Name wiedergefunden.
- **Zahnrad, Zahnstange-Ritzel, Schraube, Nocken** (Messerkante, Rolle, Flachstößel) als Kopplungen.
- Geschlossene Schleifen (Viergelenk, Schubkurbel), Freiheitsgrade je Teil, Kontaktsätze, freischwebende Ketten gemeldet.
- **Bewegungsbahn** eines Punkts als 3D-Spline, aktualisiert sich mit dem Mechanismus.
- **Animation exportieren** als GIF oder Einzelbilder; Explosionsansicht animiert.
- **Bewegungsanalyse:** Diagramm von Wert, Geschwindigkeit, Beschleunigung; Kollisionen über die Studie.
- **Gelenk durchfahren** bis zur ersten Berührung; **Grenzen finden** füllt Min/Max automatisch aus.
- **Kollision/Abstand prüfen** (Überlappung, Mindestabstand, nächster Nachbar), Netzkörper werden als ungeprüft gemeldet.
- **Design einfügen** (verknüpft), Verknüpfungen aktualisieren (automatisch beim Zurückkehren), verknüpfte Datei öffnen,
  **an Ort und Stelle bearbeiten** (Doppelklick, Rest der Baugruppe blass), Fertig, Verknüpfung lösen, **Quelle neu verknüpfen**.
- In eigene Datei auslagern; Eigenschaften (Masse, Schwerpunkt mit Hauptachsen, Trägheit).
- **Teileigenschaften und Stückliste:** Teilenummer, Beschreibung, Revision, eigene Felder; Stückliste flach/oberste Ebene,
  gruppiert nach Teilenummer, Unterteile unter Schraube; Stücklistentyp normal/Phantom/Referenz/Kaufteil/untrennbar; CSV/JSON.

### Dateien
Formate siehe Abschnitt 4. Große Dateien: Laden im Hintergrund, Speicheranzeige. Design-Eigenschaften (Titel, Autor,
eigene Schlüssel, fremde Werkzeugdaten unter umgekehrtem DNS-Schlüssel). Dateien in Sync-Ordnern: Änderung auf
Platte erkannt, „Schreibgeschützt öffnen“ / „Trotzdem öffnen“ / „Woanders öffnen“. An Slicer senden (3MF), Gesicht drucken.
Web-App speichert im Browser.

### Gleichungskurven
Kurve per Regel: explizit y(x), parametrisch x(t)/y(t), polar r(θ); Beispiele Rampe, Parabel, Welle, Spirale, Evolvente
(Zahnflanke), Blume. Mit Parametern verknüpfbar.

### Aufbau eines Designs (Arbeitsweise)
Zeitleiste ist das Design; Skizzen voll bestimmen; Maße an Parameter hängen; Körper vs. Komponenten; Begriffe für
Umsteiger (Inventor, SolidWorks, Fusion).

### KI-Assistent, MCP, lokale Modelle
Eingebauter Chat, der Befehle ausführt; MCP-Server für externe KI; lokale Modelle (Ollama, LM Studio). Für PBCAD nicht
übernommen (eigener Assistent vorhanden).

### Aktualisierungen
Hinweis in der Titelleiste „Update auf x.y“, Fenster mit Versionshinweisen, Herunterladen / Version überspringen /
später erinnern (3 Tage). Keine Daten werden gesendet.

### Fehlerbehebung
Abgesicherter Modus, Software-Grafik, Protokolldateien, bekannte Grafiktreiberprobleme.

## 4. Dateiformate

| Format | Lesen | Schreiben |
|---|---|---|
| `.sc` / `.json` | ja | ja |
| STEP AP203/214/242 | Körper, Baugruppen, Einheiten, Namen, Farben | AP242 mit Namen, Farben, Baugruppenbaum |
| IGES 5.3 | Volumen, vernähte Flächen | Volumen mit Namen und Farben |
| FreeCAD `.FCStd`, Rhino `.3dm` | Volumen | – |
| 3MF, STL, OBJ | Netzkörper | ja (3MF auch je Komponente ein Objekt, mit Flächenkennung) |
| glTF `.glb/.gltf` | Netze mit Baum und Materialien | – |
| URDF | – | Baugruppe als Roboter (Glieder, Masse, Gelenke) |
| DXF, SVG | in Skizze | Skizzen und Abwicklungen als DXF |
| PNG, JPEG | Leinwand, Abziehbild | – |

## 5. Tastenkürzel und Maus

| Taste | Befehl | Taste | Befehl |
|---|---|---|---|
| L | Linie | E | Extrusion |
| R | Rechteck | Q | Drücken/Ziehen |
| C | Kreis | F | Rundung |
| D | Skizzenmaß | H | Bohrung |
| X | Konstruktion | M | Verschieben/Kopieren |
| O | Versatz | J | Gelenk |
| T | Stutzen | I | Messen |
| P | Projizieren | A | Aussehen |
| S | Befehlssuche | V | Ein-/Ausblenden |
| F2 | Umbenennen | F6 | Einpassen |
| Pfeile | Ansicht 15° drehen (Umschalt 90°) | Strg+Pfeile | Schwenken |
| Strg+1…7 | Vorne, Hinten, Links, Rechts, Oben, Unten, Iso | Strg+8 | Senkrecht auf Auswahl |
| Strg+Z / Strg+Y | Rückgängig / Wiederholen | Esc | Abbrechen / Auswahl leeren |

Maus: erneuter Klick an gleicher Stelle wählt das Nächste darunter (Durchschalten); Halten oder „Andere auswählen…“ listet
alles unter dem Cursor; Doppelklick auf Kante wählt die Kette; Doppelklick mittlere Taste = Ausgangsansicht.
Tastenkürzel-Editor mit Aufnahme (Modifikatoren nachträglich, 1 s Wartezeit), mehrere Tasten je Befehl,
„Modelltasten aus Skizzen heraushalten“. Touchpad-Voreinstellung: Umschalt = Schwenken, Alt = Drehen.

## 6. Lückenliste für PBCAD

Abgeglichen mit dem PBCAD-Quellcode (Stand Zweig Runde 2). „Teilweise“ heißt: Grundfunktion da, SolidCraft kann mehr.

| Nr. | Funktion | Stand PBCAD | Vorschlag |
|---|---|---|---|
| L1 | Klick-Durchschalten und „Andere auswählen…“ (alles unter dem Cursor) | fehlt | einbauen (Runde 2) |
| L2 | Grenzen finden / Gelenk durchfahren bis Berührung | fehlt | einbauen |
| L3 | Verknüpftes Teil an Ort und Stelle bearbeiten (Rest blass) | fehlt | einbauen |
| L4 | Quelle neu verknüpfen (alle Vorkommen) | fehlt | einbauen |
| L5 | Kantenflansch: Höhe gemessen ab außen/innen/tangential, Biegeposition (5 Arten) | teilweise (Maßbezug beim Kantteil) | einbauen |
| L6 | Persönliche Blechregeln im Benutzerprofil | fehlt (Regeln je Dokument) | einbauen |
| L7 | L/R/C starten zuletzt benutzte Variante, erneut drücken schaltet weiter | fehlt | einbauen |
| L8 | Tastenkürzel-Editor mit mehreren Tasten je Befehl, „Modelltasten aus Skizzen heraus“ | teilweise | ausbauen |
| L9 | Pfeiltasten drehen Ansicht 15°, Strg+Pfeile schwenken, Strg+8 senkrecht | prüfen | einbauen |
| L10 | Teil ziehen mit Gelenkbegrenzung und Ketten | teilweise (Gelenk-Ziehen) | ausbauen |
| L11 | Stücklistentyp untrennbar, Unterteile unter Schraube gruppiert | teilweise (Phantom/Referenz da) | ausbauen |
| L12 | 3MF je Komponente ein Objekt, an Slicer senden mit Auswahl | teilweise | prüfen |
| L13 | Schwerpunkt mit Hauptachsen im Fenster Eigenschaften | prüfen | einbauen |
| L14 | Runde 2 Etappe 3: Skizze drehen/zurück, Hilfslinien aus Mitten, Kreuzungsfang, Alt unterdrückt Fang | offen | in Arbeit |
| L15 | Runde 2: Navigation (Drehteller, Zoomrichtung, Doppelklick Mitte), Extrusion Operation automatisch, Y-oben-STEP | offen | in Arbeit |
| L16 | Verlauf links (Zeitleiste als Liste am Rand) | offen | in Arbeit |

Nicht übernommen (bleibt so): Rendern komplett, Flächenbegradigung und Flächenanpassung (Kern), KI-Chat/MCP von SolidCraft,
Web-App-Speicher, Panel in eigenem Fenster, E-Modul.

---

## 7. Alle Befehle nach Bereich mit Stand PBCAD


### Skizze

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| 3D-Bogen <sub>`sketch_arc3d`</sub> | Zeichnet bei eingeschalteter 3D-Skizze einen exakten Kreisbogen im Raum durch drei Punkte. Für Biegungen in Pfaden und Leitkurven, die die Skizzenebene verlassen. | nachgebaut (E1–E6) – 3D-Skizze: Punktzug mit Biegeradien |
| Mittelpunkt-Kreisbogen <sub>`sketch_arc_center_point`</sub> | Zeichnet einen Kreisbogen um einen Mittelpunkt, von einem Start- zu einem Endpunkt. Für Bögen mit bekanntem Mittelpunkt, etwa einen Radius um eine Bohrung oder einen Drehpunkt. | vorhanden – Bogen um Mittelpunkt |
| Tangentialbogen <sub>`sketch_arc_tangent`</sub> | Zeichnet einen Bogen, der am Ende einer Linie oder eines Bogens tangential weiterläuft. Damit setzen Sie eine Kette mit einer weichen Biegung statt einer Ecke fort. | vorhanden – Tangentialer Bogen |
| 3-Punkt-Kreisbogen <sub>`sketch_arc_three_point`</sub> | Zeichnet einen Bogen von einem Start- zu einem Endpunkt durch einen dritten Punkt. Für Bögen, die durch vorgegebene Punkte laufen sollen statt um einen bekannten Mittelpunkt. | vorhanden – Bogen |
| Auto-Bedingung <sub>`sketch_auto_constrain`</sub> | Fügt die Bedingungen hinzu, die die Skizze schon fast erfüllt, etwa horizontal, parallel oder koinzident, und bemaßt sie dann vollständig. Damit legen Sie eine grob gezeichnete Skizze in einem Schritt fest. | vorhanden – Abhängigkeiten beim Zeichnen + Vollständig bemaßen |
| Auto-Bedingung von Bezug <sub>`sketch_auto_constrain_from_datum`</sub> | Arbeitet wie Auto-Bedingung, misst die Lagen aber von einem gewählten Bezugspunkt statt vom Ursprung. Für Teile, die von einem Bezugspunkt aus bemaßt werden, etwa einer Ecke oder einer Bohrung. | vorhanden – Vollständig bemaßen ab Ursprung |
| Kanten automatisch auf Referenz projizieren <sub>`sketch_auto_project`</sub> | – | vorhanden – Kante projizieren |
| Übergangskurve <sub>`sketch_blend_curve`</sub> | Verbindet die Enden zweier Kurven mit einem glatten Spline, der an beide tangential oder auf Wunsch auch krümmungsstetig anschließt. Damit überbrücken Sie eine Lücke zwischen Kurven ohne Knick. | nachgebaut (E1–E6) – Freiform |
| Skizze abbrechen <sub>`sketch_cancel`</sub> | Verlässt die Skizze und verwirft alles, was seit dem Erstellen oder Öffnen zum Bearbeiten geändert wurde. Mit Rückgängig holen Sie die Änderungen zurück. | vorhanden – Esc / Abbrechen |
| Kette <sub>`sketch_chain`</sub> | – | nachgebaut (E1–E6) – Konturen erkennt PBCAD selbst; Fenster-/Kreuzwahl statt Kettenwahl |
| Abschrägung mit Abstand und Winkel <sub>`sketch_chamfer_distance_angle`</sub> | Schrägt die Ecke zwischen zwei Linien ab, bestimmt durch einen Abstand entlang der ersten Linie und einen Winkel. Wenn eine Zeichnung die Fase als Länge und Winkel angibt, etwa 2 mm × 30°. | nachgebaut (E1–E6) – Skizzenfase gleich/zwei Abstände |
| Abschrägung mit gleichem Abstand <sub>`sketch_chamfer_equal_distance`</sub> | Schrägt die Ecke zwischen zwei Linien mit gleichem Abstand auf beiden Seiten ab. Für die übliche 45°-Fase an einer Kontur. | vorhanden – Skizzenfase |
| Abschrägung mit zwei Abständen <sub>`sketch_chamfer_two_distance`</sub> | Schrägt die Ecke zwischen zwei Linien mit je einem eigenen Abstand entlang jeder Linie ab. Für Fasen, die nicht 45° haben und mit zwei Längen angegeben sind. | vorhanden – Skizzenfase |
| Kreis aus Mittelpunkt und Durchmesser <sub>`sketch_circle_center`</sub> | Zeichnet einen Kreis aus Mittelpunkt und Durchmesser. Für Bohrungen, Zapfen und andere runde Formen mit bekanntem Mittelpunkt. | vorhanden – Kreis |
| 3-Punkt-Kreis <sub>`sketch_circle_three_point`</sub> | Zeichnet einen Kreis durch drei Punkte. Wenn der Kreis durch vorgegebene Punkte laufen soll, etwa auf vorhandener Geometrie. | vorhanden – Kreis durch 3 Punkte |
| 3-Tangenten-Kreis <sub>`sketch_circle_three_tangent`</sub> | Zeichnet einen Kreis, der drei Linien, Kreise oder Bögen berührt. Damit setzen Sie einen Kreis passend zwischen drei Kurven, etwa den Inkreis eines Dreiecks. | vorhanden – Kreis tangential an 3 Linien |
| 2-Tangenten-Kreis <sub>`sketch_circle_two_tangent`</sub> | Zeichnet einen Kreis vorgegebener Größe, der zwei Linien, Kreise oder Bögen berührt. Für eine Rundung mit festem Radius zwischen zwei Kurven. | nachgebaut (E1–E6) – Skizzenrundung zwischen zwei Linien |
| Skizzen-Bedingung <sub>`sketch_constrainer`</sub> | Setzt die Bedingung, die eine oder zwei gewählte Kurven schon fast erfüllen, etwa horizontal, parallel, tangential oder gleich. Damit räumen Sie eine frei gezeichnete Skizze Beziehung für Beziehung auf. | vorhanden – Bedingungsleiste (PR #188) |
| Fixieren/Lösen <sub>`sketch_constraint_fix`</sub> | Fixiert Punkte oder Kurven an ihrer Stelle oder löst sie wieder. Für Geometrie, die sich beim Ziehen oder Lösen der Skizze nicht bewegen darf. | vorhanden – Fixieren |
| Mittelpunkt <sub>`sketch_constraint_midpoint`</sub> | Setzt einen Punkt auf die Mitte einer Linie oder lässt die Mittelpunkte zweier Linien zusammenfallen. Damit mitten Sie Geometrie auf einer Kante ein. | vorhanden – Mittelpunkt |
| Normal/Konstruktion <sub>`sketch_construction`</sub> | Schaltet Kurven zwischen normaler Geometrie und Konstruktionsgeometrie um, die nicht zu Profilen gehört. Konstruktionskurven dienen als Hilfen für Aufteilung, Bezüge und Maße. | vorhanden – Konstruktionslinie ein/aus |
| Skizzenelemente ausschneiden <sub>`sketch_cut`</sub> | Kopiert die gewählte Skizzengeometrie und löscht sie aus der Skizze, in einem Rückgängig-Schritt. Fügen Sie sie an anderer Stelle oder in eine andere Skizze ein. | nachgebaut (E1–E6) – Strg+C, dann Entf |
| Skizzenentitäten löschen <sub>`sketch_delete`</sub> | – | vorhanden – Entf |
| Maßtext verschieben <sub>`sketch_dimension_text`</sub> | – | vorhanden – Maß ziehen |
| Skizzengeometrie ziehen <sub>`sketch_drag`</sub> | – | vorhanden – Ziehen |
| Skizzen-Ziehen beenden <sub>`sketch_drag_end`</sub> | – | vorhanden – Ziehen |
| Skizzengeometrie mit Maßen zeichnen <sub>`sketch_draw_dimensioned`</sub> | – | vorhanden – Maßeingabe beim Zeichnen (PR #2/#10) |
| Zeichnungsgröße <sub>`sketch_drawing_bounds`</sub> | – | nachgebaut (E1–E6) – Zeichnungsgröße braucht die Skizze nicht |
| Skizze bearbeiten <sub>`sketch_edit`</sub> | Öffnet eine vorhandene Skizze zum Bearbeiten. Die darauf aufbauenden Elemente werden aktualisiert, wenn Sie die Skizze fertigstellen. | vorhanden – Skizze bearbeiten |
| Text bearbeiten <sub>`sketch_edit_text`</sub> | – | vorhanden – Text bearbeiten |
| Gleichungskurve bearbeiten <sub>`sketch_equation_curve_edit`</sub> | – | nachgebaut (E1–E6) – neu einfügen; Formel bleibt im Dialog gemerkt |
| Als DXF speichern <sub>`sketch_export_dxf`</sub> | – | vorhanden – Skizze als DXF |
| Mit Auto-Bedingung fertigstellen <sub>`sketch_finish_auto_constrain`</sub> | Wendet Auto-Bedingung auf die Skizze an und stellt sie dann fertig. Damit verlassen Sie eine Skizze in einem Schritt vollständig bestimmt. | nachgebaut (E1–E6) – Vollständig bemaßen vor Fertig |
| Kurven an Netzquerschnitt anpassen <sub>`sketch_fit_curves_to_section`</sub> | Schneidet einen Netz- oder Volumenkörper mit der Skizzenebene und passt Linien und Bögen an den Querschnitt an. Damit bauen Sie ein gescanntes oder importiertes Teil als bearbeitbare Skizze nach. | nachgebaut (E1–E6) – Netzrückführung |
| Bedingungssymbole <sub>`sketch_glyphs`</sub> | – | vorhanden – Abhängigkeitssymbole |
| 3D-Geometrie einbeziehen <sub>`sketch_include_3d`</sub> | Holt Modellkanten, Eckpunkte und Kurven anderer Skizzen als verknüpfte Bezüge in diese Skizze und legt Teile außerhalb der Ebene flach auf sie. Damit bauen Sie auf Geometrie auf, die nicht in der Skizzenebene liegt. | vorhanden – Kante projizieren |
| DXF einfügen <sub>`sketch_insert_dxf`</sub> | Liest die Kurven einer DXF-Zeichnung in eine Skizze ein, skaliert, gedreht und an der gewünschten Stelle. Damit bauen Sie auf einer 2D-Zeichnung aus einem anderen Programm auf, etwa einer Laserschnitt-Kontur. | vorhanden – DXF importieren |
| Skizze prüfen <sub>`sketch_inspect`</sub> | Öffnet einen Bericht zur offenen Skizze: wie viele Freiheitsgrade übrig sind und ob sie vollständig bestimmt ist. Damit sehen Sie, was sich noch bewegt, bevor Sie die Skizze abschließen. | vorhanden – Freiheitsgrade, Bereichseigenschaften |
| Schnittkurve <sub>`sketch_intersection_curve`</sub> | Erzeugt 3D-Kurven, wo sich zwei Körper oder Flächen treffen, mit diesen verknüpft. Als Pfade oder Leitkurven, die dem Modell folgen. | nachgebaut (E1–E6) – Flächen-Schnittkurven, Freiform |
| Isoparametrische Kurve <sub>`sketch_isoparametric_curve`</sub> | Erzeugt eine 3D-Kurve in U- oder V-Richtung einer Fläche durch einen gewählten Punkt, mit der Fläche verknüpft. Als Pfad oder Trennlinie, die der Fläche folgt. | nachgebaut (E1–E6) – Freiform |
| 3D-Linie <sub>`sketch_line3d`</sub> | Zeichnet bei eingeschalteter 3D-Skizze verbundene gerade Linien zwischen Punkten im Raum. Für Pfade und Rahmen, die die Skizzenebene verlassen. | vorhanden – 3D-Skizze |
| Lose Enden <sub>`sketch_loose_ends`</sub> | – | vorhanden – Säubern zeigt offene Enden |
| Lose Enden verknüpfen <sub>`sketch_loose_ends_tie`</sub> | – | vorhanden – Säubern |
| Skizzenentitäten verschieben/kopieren <sub>`sketch_move`</sub> | Verschiebt oder dreht Skizzenkurven und -punkte oder eine Kopie davon. Damit setzen Sie Geometrie um, ohne Form und Bedingungen zu verlieren. | vorhanden – Verschieben/Kopieren |
| 3D-Punkt verschieben <sub>`sketch_move3d`</sub> | – | vorhanden – 3D-Skizze Punkte bearbeiten |
| Skizzenpunkt ziehen <sub>`sketch_move_point`</sub> | – | vorhanden – Punkt ziehen |
| Versatzverknüpfung trennen <sub>`sketch_offset_break`</sub> | – | nachgebaut (E1–E6) – Versatz bleibt verknüpft |
| Skizzenpalettenoptionen <sub>`sketch_options`</sub> | – | vorhanden – Einstellungen → Skizze |
| 3D-Punkt <sub>`sketch_point3d`</sub> | Setzt bei eingeschalteter 3D-Skizze einen Punkt im Raum. Als Bezug für 3D-Kurven und Pfade. | vorhanden – 3D-Skizze |
| Umgeschriebenes Polygon <sub>`sketch_polygon_circumscribed`</sub> | Zeichnet ein regelmäßiges Polygon um einen Kreis, bemessen vom Mittelpunkt zur Mitte einer Seite. Wenn die Schlüsselweite bekannt ist, etwa bei einer Sechskantmutter. | vorhanden – Polygon |
| Polygon über eine Kante <sub>`sketch_polygon_edge`</sub> | Zeichnet ein regelmäßiges Polygon aus den beiden Enden einer Seite. Wenn Länge und Lage einer Seite bekannt sind. | nachgebaut (E1–E6) – Polygon über Mitte |
| Eingeschriebenes Polygon <sub>`sketch_polygon_inscribed`</sub> | Zeichnet ein regelmäßiges Polygon in einen Kreis, bemessen vom Mittelpunkt zu einer Ecke. Wenn das Eckmaß bekannt ist. | vorhanden – Polygon |
| Auf Fläche projizieren <sub>`sketch_project_to_surface`</sub> | Projiziert Kurven anderer Skizzen entlang der Normalen dieser Skizze auf eine Fläche, als verknüpfte 3D-Kurven. Damit bringen Sie ein Logo, eine Trennlinie oder einen Pfad auf eine gekrümmte Fläche. | nachgebaut (E1–E6) – Freiform |
| Rechteck vom Mittelpunkt <sub>`sketch_rectangle_center`</sub> | Zeichnet ein Rechteck aus Mittelpunkt und einer Ecke. Für Konturen, die mittig auf einem Punkt liegen, etwa dem Ursprung. | vorhanden – Rechteck aus Mitte |
| 3-Punkt-Rechteck <sub>`sketch_rectangle_three_point`</sub> | Zeichnet ein Rechteck aus einer Kante und einem Punkt auf der gegenüberliegenden Seite. Für Rechtecke, die schräg zu den Skizzenachsen liegen. | vorhanden – Rechteck über 3 Punkte |
| 2-Punkt-Rechteck <sub>`sketch_rectangle_two_point`</sub> | Zeichnet ein Rechteck aus zwei gegenüberliegenden Ecken. Für die Konturen von Platten, Blöcken und Taschen. | vorhanden – Rechteck |
| Skizzierebene neu definieren <sub>`sketch_redefine`</sub> | – | nachgebaut (E1–E6) – Skizze neu auf Fläche |
| 3-Punkt-Bogenschlitz <sub>`sketch_slot_arc_three_point`</sub> | Zeichnet einen gebogenen Schlitz vorgegebener Breite entlang eines Bogens durch drei Punkte. Wenn der Verlauf des Schlitzes durch vorgegebene Punkte gehen soll. | nachgebaut (E1–E6) – Bogenlangloch über Mittelpunkt |
| Mittelpunktschlitz <sub>`sketch_slot_center_point`</sub> | Zeichnet einen geraden Schlitz vorgegebener Breite von seiner Mitte zum Mittelpunkt eines Endbogens. Für Schlitze, die mittig auf einem Punkt liegen. | vorhanden – Langloch |
| Schlitz von Mittelpunkt zu Mittelpunkt <sub>`sketch_slot_center_to_center`</sub> | Zeichnet einen geraden Schlitz vorgegebener Breite zwischen den Mittelpunkten seiner beiden Endbögen. Für Schlitze, die von Mitte zu Mitte bemaßt sind, etwa Langlöcher für Schrauben. | vorhanden – Langloch |
| Gesamtschlitz <sub>`sketch_slot_overall`</sub> | Zeichnet einen geraden Schlitz vorgegebener Breite von einem äußeren Ende zum anderen. Wenn es auf die Gesamtlänge des Schlitzes ankommt. | vorhanden – Langloch |
| Einrastinferenz <sub>`sketch_snap`</sub> | – | vorhanden – Fangen |
| Skizze lösen <sub>`sketch_solve`</sub> | – | vorhanden – Löser läuft immer |
| 3D-Spline <sub>`sketch_spline3d`</sub> | Zeichnet bei eingeschalteter 3D-Skizze eine glatte Kurve durch Punkte im Raum. Für Austragungspfade und Kabelwege, die die Skizzenebene verlassen. | nachgebaut (E1–E6) – Freiform im Raum, im Metallbau selten |
| Spline mit Kontrollpunkten <sub>`sketch_spline_control_point`</sub> | Zeichnet einen kubischen Spline, den Kontrollpunkte formen, ohne dass er durch sie läuft. Für glatte, fließende Kurven, die Sie durch Verschieben der Punkte formen. | vorhanden – Spline |
| Spline mit Kontrollpunkten (Grad 5) <sub>`sketch_spline_control_point_5`</sub> | Zeichnet einen Spline vom Grad 5, den Kontrollpunkte formen. Wo Kurven mit glatterer Krümmung anschließen müssen, etwa an gestalteten Sichtflächen. | nachgebaut (E1–E6) – Grad 3 genügt |
| Spline mit Fitpunkten <sub>`sketch_spline_fit_point`</sub> | Zeichnet einen glatten Spline durch alle gesetzten Punkte, offen oder geschlossen. Damit zeichnen Sie eine Form durch bekannte Punkte nach. | nachgebaut (E1–E6) – Gleichungskurve legt Spline durch Punkte |
| Splinepunkt hinzufügen <sub>`sketch_spline_insert_point`</sub> | – | nachgebaut (E1–E6) – Spline neu zeichnen |
| Splinepunkt entfernen <sub>`sketch_spline_remove_point`</sub> | – | nachgebaut (E1–E6) – Spline neu zeichnen |
| Splinerichtung umkehren <sub>`sketch_spline_reverse`</sub> | – | nachgebaut (E1–E6) – Richtung spielt für Metallbau keine Rolle |
| Gedrehtes Profil <sub>`sketch_spun_profile`</sub> | Erzeugt in der Skizzenebene die Kontur, die ein Körper bei einer Drehung um eine Achse überstreicht. Damit erhalten Sie den Umriss eines Drehteils für eine Drehung oder eine Zeichnung. | nachgebaut (E1–E6) – Drehteile, Drehung genügt |
| Radius / Durchmesser umschalten <sub>`sketch_toggle_diameter`</sub> | – | vorhanden – Maß Ø/R umschalten |
| Abhängiges Maß umschalten <sub>`sketch_toggle_driven`</sub> | – | vorhanden – Getriebenes Maß |
| Transformieren <sub>`sketch_transform`</sub> | Skaliert, dreht und verschiebt Skizzengeometrie um einen Mittelpunkt in einem Schritt. Damit setzen Sie eine Auswahl gleichzeitig um und ändern ihre Größe. | vorhanden – Verschieben/Drehen/Skalieren |

### Volumenkörper

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Körper umbenennen <sub>`body_rename`</sub> | – | vorhanden – Feature/Körper umbenennen im Modellbrowser |
| Teil reparieren <sub>`body_repair`</sub> | – | nachgebaut (E1–E6) – STEP-Import heilt Flächen; kein eigener Reparaturbefehl |
| Fläche löschen <sub>`face_delete`</sub> | Entfernt die ausgewählten Flächen. Die angrenzenden Flächen schließen dabei die entstandene Lücke, oder sie bleibt als offene Fläche bestehen. So können Sie beispielsweise eine Rundung, eine Bohrung oder einen störenden Ansatz entfernen. | vorhanden – Direkt → Löschen |
| Ausrichten <sub>`solid_align`</sub> | Verschiebt die ausgewählten Körper so, dass ein Punkt, eine Fläche oder eine Ebene eines Körpers mit einem entsprechenden Punkt, einer Fläche oder Ebene an anderer Stelle zusammenfällt. So können Sie Bauteile aneinander ausrichten, ohne Abstände messen zu müssen. | vorhanden – Fläche an Fläche (Baugruppe), Verschieben (Bauteil) |
| Begrenzungsfüllung <sub>`solid_boundary_fill`</sub> | Erzeugt Volumenkörper aus den Bereichen, die sich überlappende Werkzeugkörper einschließen, und füllt nur die gewählten Bereiche. Damit bauen Sie eine Form aus dem Raum, den mehrere Körper gemeinsam begrenzen. | nachgebaut (E1–E6) – Flächenmodellierung |
| Prägen <sub>`solid_emboss`</sub> | Hebt Skizzenprofile wie Text oder ein Logo aus einer Fläche heraus oder senkt sie hinein. Für Beschriftungen, Etiketten und Markierungen auf ebenen oder runden Flächen. | vorhanden – Prägen / Gravieren |
| Verschieben/Kopieren <sub>`solid_move`</sub> | Verschiebt oder dreht die ausgewählten Körper oder deren Kopien um den eingestellten Abstand und Winkel. So können Sie einen Körper neu positionieren oder an anderer Stelle eine Kopie erstellen. | vorhanden – Körper verschieben/drehen, als Kopie |
| Fläche versetzen <sub>`solid_offset_face`</sub> | Versetzt die ausgewählten Flächen um den eingestellten Abstand nach innen oder außen. Die angrenzenden Flächen werden entsprechend angepasst. So können Sie beispielsweise eine Wand verdicken, eine Tasche vertiefen oder einen Ansatz erhöhen, ohne die Skizze bearbeiten zu müssen. | vorhanden – Fläche verschieben / Direkt |
| Drücken/Ziehen <sub>`solid_press_pull`</sub> | Fügt Material hinzu oder trägt es ab, indem Sie eine Fläche ziehen. Durch Ziehen an einer Kante können Sie diese abrunden. So lassen sich schnelle Änderungen direkt am Modell vornehmen. | vorhanden – Fläche verschieben |
| Entfernen <sub>`solid_remove`</sub> | Entfernt die ausgewählten Körper ab dieser Stelle der Timeline aus dem Design. In den vorherigen Schritten bleiben sie erhalten. So können Sie beispielsweise einen nicht mehr benötigten Hilfs- oder Schneidkörper entfernen. | vorhanden – Körper löschen / Kombinieren |
| Fläche ersetzen <sub>`solid_replace_face`</sub> | Verschiebt die ausgewählten ebenen Flächen auf eine Ebene oder eine parallele Fläche. Der Körper wird dabei entsprechend vergrößert oder verkleinert. So können Sie eine Fläche bündig zu einem anderen Bauteil oder einer Konstruktionsebene ausrichten. | vorhanden – Direkt → Ersetzen |
| Rippe <sub>`solid_rib`</sub> | Fügt entlang einer offenen Skizzenkurve eine dünne Wand hinzu, die bis zu den nächsten Flächen des Körpers reicht. Damit versteifen Sie Wände und Ecken, etwa bei Spritzguss- oder Druckteilen. | vorhanden – Rippe (Steife) |
| Fläche teilen <sub>`solid_split_face`</sub> | Teilt die ausgewählten Flächen entlang einer Ebene, der Fläche eines anderen Körpers oder von Skizzenkurven, ohne den Körper selbst zu teilen. So können Sie Teilbereiche einer Fläche mit einer eigenen Formschräge, Farbe oder einem Versatz versehen. | nachgebaut (E1–E6) – nur für Flächenmodellierung nötig; Körper trennen gibt es |
| Gewebe <sub>`solid_web`</sub> | Fügt entlang jeder offenen Skizzenkurve eine dünne Wand hinzu, jede bis zu den nächsten Flächen des Körpers. Für ein Gitter aus Stützwänden in Gehäusen und Schalen. | nachgebaut (E1–E6) – Rippe; Gewebe-Netz als Muster aus Rippen |

### Blech

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| In Blech umwandeln <sub>`sheet_convert`</sub> | Macht aus einer Platte oder einem ausgehöhlten Körper gleichmäßiger Dicke einen Blechkörper, mit Biegungen an den gewählten Kanten. Damit wird ein vorhandenes Teil abwickelbar. | vorhanden – In Blech umwandeln |
| Biegungstabelle exportieren <sub>`sheet_export_bend_table`</sub> | Speichert die Biegungstabelle eines Blechkörpers als CSV oder JSON: Winkel, Radien und Lage der Biegungen im Flachmuster. Für die Abkantpresse oder die Werkstatt. | vorhanden – Biegetabelle in Zeichnung/Fertigungsmappe |
| Flachmuster als DXF exportieren <sub>`sheet_export_dxf`</sub> | Speichert das Flachmuster als DXF, mit Konturen, Biegelinien und optionalen Biegevermerken. Für Laser-, Plasma- oder Wasserstrahlschneiden. | vorhanden – Abwicklung als DXF |
| Flansch <sub>`sheet_flange`</sub> | Fügt einen Flansch hinzu: eine Grundplatte aus einer Skizze, eine Wand entlang einer offenen Skizzenkontur oder eine gebogene Wand an Blechkanten. Damit bauen Sie Blechteile auf. | vorhanden – Lasche |
| Flachmuster erstellen <sub>`sheet_flat_pattern`</sub> | Erstellt das Flachmuster eines Blechkörpers mit Größe, Ausschnitten und Biegelinien. Damit prüfen Sie den Zuschnitt, bevor Sie ihn schneiden. | vorhanden – Abwicklung |
| Falten <sub>`sheet_fold`</sub> | Faltet ein Blech entlang einer Skizzenlinie um einen Winkel und Radius. Damit falten Sie ein flaches Blech, nachdem Sie Elemente hineingeschnitten haben. | nachgebaut (E1–E6) – Ansicht gefaltet/abgewickelt |
| Umkantung <sub>`sheet_hem`</sub> | Faltet eine Blechkante auf sich selbst zurück. Für sichere, steife Kanten ohne scharfen Grat. | vorhanden – Umschlag |
| Blechregeln <sub>`sheet_manage_rules`</sub> | Erstellt und bearbeitet Blechregeln: Dicke, Biegeradius, K-Faktor, Freischnitte und Spalte. Damit passen Sie die Teile an Material und Werkzeuge Ihrer Werkstatt an. | vorhanden – Blechregeln / Biegetabellen |
| Pfadflansch <sub>`sheet_path_flange`</sub> | Fügt entlang einer Blechkante eine Kette von Flanschen hinzu, die einer offenen Kette von Skizzenlinien folgt. Für Profile wie eine U- oder Z-Form in einem Schritt. | vorhanden – Konturwalzen / Konturlasche |
| Wieder falten <sub>`sheet_refold`</sub> | Faltet einen entfalteten Blechkörper wieder auf. Nachdem Sie dem flachen Blech Elemente hinzugefügt haben. | nachgebaut (E1–E6) – Ansicht gefaltet |
| Blechregeln auflisten <sub>`sheet_rules`</sub> | – | vorhanden – Blechregeln |
| Entfalten <sub>`sheet_unfold`</sub> | Entfaltet alle Biegungen eines Blechkörpers. Damit fügen Sie Bohrungen oder Schnitte hinzu, die über eine Biegung laufen müssen, und falten dann wieder. | nachgebaut (E1–E6) – Ansicht abgewickelt |

### Flächen

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Verbindungsfläche <sub>`surface_blend`</sub> | Erzeugt eine Fläche, die die Kanten zweier Körper überbrückt, tangential oder krümmungsstetig zu beiden. Damit verbinden Sie zwei Flächen glatt über eine Lücke. | nachgebaut (E1–E6) – Flächenmodellierung |
| Begrenzungsfläche <sub>`surface_boundary`</sub> | Erzeugt eine Fläche, die eine Schleife aus zwei bis vier Skizzenkurven oder ein Kurvennetz füllt. Für Freiformflächen, die durch ihre Ränder bestimmt sind. | nachgebaut (E1–E6) – Flächenmodellierung |
| Flächen-Extrusion <sub>`surface_extrude`</sub> | Zieht Skizzenkurven oder Profile über eine Strecke zu einer Fläche, nur Wände ohne Deckel. Für dünne Wände und als Werkzeug zum Schneiden oder Teilen. | nachgebaut (E1–E6) – Flächenmodellierung |
| Flächenbegradigung <sub>`surface_fair`</sub> | Glättet das Innere von Freiformflächen, während ihre Kanten an Ort und Stelle bleiben. Damit gleichen Sie Beulen und wellige Spiegelungen in einer Fläche aus. | weggelassen (Kern) |
| Flächenverrundung <sub>`surface_fillet`</sub> | – | nachgebaut (E1–E6) – Flächenmodellierung |
| Flächen-Loft <sub>`surface_loft`</sub> | Erzeugt eine Fläche, die der Reihe nach durch zwei oder mehr Querschnitte läuft, ohne Deckel. Für Schalen und Übergänge zwischen verschiedenen Formen. | nachgebaut (E1–E6) – Flächenmodellierung |
| Flächenanpassung <sub>`surface_match`</sub> | Baut die Kante einer Fläche so neu auf, dass sie an die Kante eines anderen Körpers anschließt, mit passender Tangente oder Krümmung. Damit schließen Sie eine Naht zwischen zwei Flächen glatt. | weggelassen (Kern) |
| Offsetfläche <sub>`surface_offset`</sub> | Erzeugt eine Kopie von Flächen in einem Abstand entlang ihrer Normalen, als neuen Flächenkörper. Für Häute, Spiele oder die Gegenseite einer Wand. | nachgebaut (E1–E6) – Flächenmodellierung |
| Patch <sub>`surface_patch`</sub> | Füllt einen Skizzenbereich oder eine geschlossene Kantenschleife mit einer Fläche, eben oder glatt gekrümmt. Damit schließen Sie Löcher in einem Flächenkörper. | nachgebaut (E1–E6) – Flächenmodellierung |
| Normale umkehren <sub>`surface_reverse_normal`</sub> | Dreht Flächen eines Flächenkörpers um, sodass ihre Außenseite in die andere Richtung zeigt. Vor dem Aufdicken oder Vernähen, wenn die Flächen nach innen zeigen. | nachgebaut (E1–E6) – Flächenmodellierung |
| Flächen-Rotation <sub>`surface_revolve`</sub> | Dreht Skizzenkurven oder Profile um eine Achse zu einer Fläche, ohne Deckel. Für runde Schalen wie Lampenschirme, Schüsseln und Düsen. | nachgebaut (E1–E6) – Flächenmodellierung |
| Regelfläche <sub>`surface_ruled`</sub> | Erzeugt einen Streifen aus geraden Linien, der von einer Kantenkette ausgeht, entlang der Flächennormalen, tangential oder unter einem Winkel. Für Schrägwände, Ausläufe und Trennflächen. | vorhanden – Regelkörper |
| Nähen <sub>`surface_stitch`</sub> | Vernäht Flächenkörper entlang gemeinsamer Kanten, zu einem Volumenkörper, wenn sie sich schließen. Damit machen Sie aus mehreren Flächen einen Körper. | nachgebaut (E1–E6) – Flächenmodellierung |
| Flächen-Sweep <sub>`surface_sweep`</sub> | Führt Skizzenkurven oder Profile entlang eines Pfads zu einer Fläche, ohne Deckel. Für Rinnen, Leisten und andere dünne Formen, die einem Pfad folgen. | nachgebaut (E1–E6) – Flächenmodellierung |
| Dicke vergeben <sub>`surface_thicken`</sub> | Gibt einem Flächenkörper eine Dicke und macht ihn so zum Volumenkörper. Damit machen Sie aus Flächen druck- oder fräsbare Teile. | vorhanden – Aufdicken |
| Verbund aufheben <sub>`surface_unstitch`</sub> | Löst Flächen eines Körpers als eigene Flächenkörper heraus; ein Volumenkörper zerfällt dabei in Flächen. Damit überarbeiten Sie einzelne Flächen eines Körpers. | nachgebaut (E1–E6) – Flächenmodellierung |
| Trimmen aufheben <sub>`surface_untrim`</sub> | Entfernt Löcher aus einer Fläche oder stellt ihren äußeren Rand auf die natürlichen Grenzen der Fläche zurück. Damit holen Sie nach einem Trimmen die volle Fläche zurück. | nachgebaut (E1–E6) – Flächenmodellierung |

### Rahmen und Normteile

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Rahmenelement <sub>`frame_member`</sub> | Setzt ein Profil, etwa ein Rohr oder ein Aluprofil, entlang der Linien einer Rahmenskizze, ein Stab je Linie. Für Rahmen, Gestelle und Schweißkonstruktionen. | vorhanden – Rohr / Profil, Rahmen aus Skizze |
| Profil einfügen <sub>`frame_profile_insert`</sub> | – | vorhanden – Profilbibliothek DIN/EN |
| Profilbibliothek <sub>`frame_profile_list`</sub> | – | vorhanden – Profilbibliothek |
| Profileigenschaften <sub>`frame_profile_properties`</sub> | – | vorhanden – Profilwerte in den Eigenschaften |
| Verbindungselement einfügen <sub>`parts_fastener`</sub> | Fügt eine genormte Schraube, Mutter, Unterlegscheibe, einen Stift oder ein Lager in der gewählten Größe ein. Auf ein Loch gesetzt, sitzt es mit einem Gelenk darin, sodass Sie Verbindungselemente nicht selbst modellieren müssen. | vorhanden – Normteil / Schraubenverbindung / An Bohrung |
| Bauteil einfügen <sub>`parts_insert`</sub> | Fügt ein Normteil in der gewählten Art, Größe und Länge ein. Auf den Rand oder die Wand eines Lochs gesetzt, sitzt es mit einem starren Gelenk auf dem Loch. | vorhanden – Normteil einfügen |
| Standardbauteile <sub>`parts_library`</sub> | Öffnet die Standardbauteile: Schrauben, Muttern, Unterlegscheiben, Gewindestifte, Passstifte und Lager in Normgrößen. Damit fügen Sie ein Normteil ein, statt es selbst zu modellieren. | vorhanden – Normteil-Bibliothek (36 Familien) |
| Bauteilgröße ändern <sub>`parts_resize`</sub> | Ändert Größe oder Länge eines eingefügten Normteils und baut es neu auf; seine Gelenke halten es an seinem Platz. Für den Fall, dass eine Schraube zu lang ist oder ein Loch eine andere Größe braucht. | vorhanden – Normteilgröße ändern |

### Arbeitselemente

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Achse durch Kante <sub>`construct_axis_edge`</sub> | Erzeugt eine Konstruktionsachse entlang einer geraden Kante oder Skizzenlinie. Als Achse für Drehung, Kreismuster oder Verbindung. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse senkrecht zur Fläche <sub>`construct_axis_normal_to_face`</sub> | Erzeugt eine Konstruktionsachse durch einen Punkt, senkrecht zu einer Fläche. Als Achse, die gerade aus einer Fläche heraussteht. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch Zylinder/Kegel/Torus <sub>`construct_axis_through_cylinder`</sub> | Erzeugt eine Konstruktionsachse durch die Mitte einer Zylinder-, Kegel- oder Torusfläche oder einer Kreiskante. Damit drehen oder mustern Sie Elemente um ein rundes Teil. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch zwei Ebenen <sub>`construct_axis_two_planes`</sub> | Erzeugt eine Konstruktionsachse, wo sich zwei Ebenen oder ebene Flächen schneiden. Wenn die benötigte Achse die Schnittlinie zweier Flächen ist. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch zwei Punkte <sub>`construct_axis_two_points`</sub> | Erzeugt eine Konstruktionsachse durch zwei Punkte, Eckpunkte oder Skizzenpunkte. Für eine Achse zwischen zwei bekannten Lagen. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Ebene entlang Pfad <sub>`construct_plane_along_path`</sub> | Erzeugt eine Konstruktionsebene senkrecht zu einer Kante oder Kurve, an einer Stelle entlang dieser. Damit skizzieren Sie ein Profil für eine Austragung oder einen Querschnitt eines Pfads. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Mittenebene <sub>`construct_plane_midplane`</sub> | Erzeugt eine Konstruktionsebene mittig zwischen zwei Ebenen oder ebenen Flächen oder als Winkelhalbierende, wo sie schräg zueinander stehen. Als Symmetrieebene zum Spiegeln. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Rechtebene <sub>`construct_plane_perpendicular`</sub> | Erzeugt eine Konstruktionsebene, die eine Linie oder Kante enthält und senkrecht auf einer Ebene oder Fläche steht. Damit skizzieren Sie aufrecht entlang einer Kante am Modell. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Tangentialebene <sub>`construct_plane_tangent`</sub> | Erzeugt eine Konstruktionsebene, die einen Zylinder, Kegel, eine Kugel oder einen Torus in einem Punkt berührt. Damit skizzieren Sie seitlich an einem runden Teil. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Ebene durch drei Punkte <sub>`construct_plane_three_points`</sub> | Erzeugt eine Konstruktionsebene durch drei Punkte. Für eine Ebene, die durch Lagen am Modell bestimmt ist, etwa drei Ecken. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Ebene durch zwei Kanten <sub>`construct_plane_two_edges`</sub> | Erzeugt eine Konstruktionsebene durch zwei gerade Kanten oder Linien, die in einer Ebene liegen. Für eine Ebene quer durch ein Teil, etwa durch zwei gegenüberliegende Kanten. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt entlang Pfad <sub>`construct_point_along_path`</sub> | Erzeugt einen Konstruktionspunkt an einer Stelle entlang einer Kante oder Kurve. Als Bezug auf halbem oder beliebigem Weg entlang eines Pfads. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt im Mittelpunkt von Kreis/Kugel/Torus <sub>`construct_point_center`</sub> | Erzeugt einen Konstruktionspunkt im Mittelpunkt einer Kreiskante, eines Skizzenkreises oder -bogens, einer Kugel oder eines Torus. Als Bezug für Bohrungen, Achsen und Verbindungen. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt an Kante und Ebene <sub>`construct_point_edge_plane`</sub> | Erzeugt einen Konstruktionspunkt, wo eine Kante oder Linie eine Ebene oder ebene Fläche durchstößt. Damit markieren Sie, wo ein Pfad eine Ebene kreuzt. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt aus drei Ebenen <sub>`construct_point_three_planes`</sub> | Erzeugt einen Konstruktionspunkt, wo sich drei Ebenen oder ebene Flächen treffen. Als Eckbezug, auch wo das Modell keinen Eckpunkt hat. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt aus zwei Kanten <sub>`construct_point_two_edges`</sub> | Erzeugt einen Konstruktionspunkt, wo sich zwei Kanten oder Linien treffen oder am nächsten kommen. Als Bezug an einer virtuellen Ecke. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt an Scheitelpunkt <sub>`construct_point_vertex`</sub> | Erzeugt einen Konstruktionspunkt auf einem Eckpunkt oder Skizzenpunkt. Als Bezug, der bleibt, wenn Skizze oder Körper darum ausgeblendet sind. | vorhanden – Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |

### Baugruppe und Gelenke

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Stückliste <sub>`assembly_bom`</sub> | Listet die Teile des Designs oder einer Komponente mit ihrer Anzahl nach Teilenummer auf und kann die Liste als CSV oder JSON speichern. Als Stückliste für Bestellung und Montage. | vorhanden – Stückliste (Struktur, Bauteile, Baukasten) |
| Masseeigenschaften <sub>`assembly_mass_properties`</sub> | – | vorhanden – Masse und Schwerpunkt in den Eigenschaften |
| Komponente aktivieren <sub>`component_activate`</sub> | – | vorhanden – Bauteil im Kontext bearbeiten |
| Verknüpfung trennen <sub>`component_break_link`</sub> | Löst eine verknüpfte Komponente von ihrer Konstruktionsdatei und behält ihre Körper unverändert. Damit folgt das Teil Änderungen an der Originaldatei nicht mehr. | vorhanden – Komponente unabhängig machen |
| Position erfassen <sub>`component_capture_position`</sub> | Übernimmt die Lage von Teilen, die Sie von Hand verschoben haben, als ihre neue Position. Für Teile, die von keinem Gelenk gehalten und von Hand an ihren Platz gezogen wurden. | vorhanden – Positionsdarstellung |
| Identische Kopien finden <sub>`component_copies`</sub> | – | vorhanden – Gleichteile (Einzelteile mit Positionsnummern) |
| Körper einfügen <sub>`component_copy_bodies`</sub> | – | nachgebaut (E1–E6) – Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Neue Komponente <sub>`component_create`</sub> | Fügt der Konstruktion eine neue, leere Komponente hinzu, in der aktiven Komponente, sofern Sie kein anderes übergeordnetes Element wählen. Damit bekommt ein neues Teil einer Baugruppe einen eigenen Platz für Körper und Skizzen. | vorhanden – Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Komponentenfarbe wechseln <sub>`component_cycle_color`</sub> | – | vorhanden – Bauteilfarben |
| Komponente löschen <sub>`component_delete`</sub> | – | vorhanden – Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| An Ort und Stelle bearbeiten <sub>`component_edit_in_place`</sub> | – | vorhanden – Bauteil im Kontext bearbeiten |
| In Datei extrahieren <sub>`component_extract`</sub> | – | vorhanden – Bauteil als eigene Datei speichern |
| Bearbeitung beenden <sub>`component_finish_edit`</sub> | Speichert das an Ort und Stelle bearbeitete Teil, kehrt zu seiner Baugruppe zurück und aktualisiert die Baugruppe daraus. Verwenden Sie es, wenn Ihre Änderungen am verknüpften Teil fertig sind. | vorhanden – Bauteil im Kontext bearbeiten |
| Komponenten aus Körpern erstellen <sub>`component_from_bodies`</sub> | Macht aus jedem gewählten Körper eine eigene Komponente, benannt nach dem Körper. Für Konstruktionen aus losen Körpern, die zu einer Baugruppe mit verbindbaren, beweglichen Teilen werden sollen. | nachgebaut (E1–E6) – Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Konstruktion einfügen <sub>`component_insert_design`</sub> | Fügt eine andere gespeicherte Konstruktion als Komponente ein, die mit ihrer Datei verknüpft ist; ihre Volumenkörper liegen so wie dort. Damit verwenden Sie ein Teil in einer Baugruppe wieder und übernehmen spätere Änderungen mit „Verknüpfungen aktualisieren“. | vorhanden – Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Verknüpfungen auflisten <sub>`component_links`</sub> | – | vorhanden – Verknüpfte Bauteile, Komponente ersetzen |
| Komponenten auflisten <sub>`component_list`</sub> | – | vorhanden – Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Teileeigenschaften <sub>`component_metadata`</sub> | – | vorhanden – Eigenschaften (iProperties) |
| Teileeigenschaften ändern <sub>`component_metadata_set`</sub> | – | vorhanden – Eigenschaften (iProperties) |
| Körper in Komponente verschieben <sub>`component_move_bodies`</sub> | – | nachgebaut (E1–E6) – Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Merkmale in Komponente verschieben <sub>`component_move_features`</sub> | – | nachgebaut (E1–E6) – Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Skizzen in Komponente verschieben <sub>`component_move_sketches`</sub> | – | nachgebaut (E1–E6) – Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Skizzen in ihre Teile verschieben <sub>`component_move_sketches_to_parts`</sub> | – | nachgebaut (E1–E6) – Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Aus einem anderen Design einfügen <sub>`component_paste_from_design`</sub> | – | vorhanden – Kopie konstruieren / Teilebibliothek |
| Neu einfügen <sub>`component_paste_new`</sub> | – | vorhanden – Kopie konstruieren / Teilebibliothek |
| Physikalische Eigenschaften der Komponente <sub>`component_properties`</sub> | Zeigt Volumen, Masse, Schwerpunkt und Trägheitsmomente einer Komponente anhand der Materialien ihrer Körper. Damit prüfen Sie Gewicht und Balance einer Baugruppe. | vorhanden – Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Quelle neu verknüpfen <sub>`component_relink`</sub> | – | vorhanden – Verknüpfte Bauteile, Komponente ersetzen |
| Komponente umbenennen <sub>`component_rename`</sub> | – | vorhanden – Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Durch Verknüpfung ersetzen <sub>`component_replace_with_link`</sub> | – | vorhanden – Verknüpfte Bauteile, Komponente ersetzen |
| Position zurücksetzen <sub>`component_revert_position`</sub> | Setzt von Hand verschobene Teile an ihre vorige Stelle zurück und verwirft nicht erfasste Verschiebungen. Damit machen Sie Probebewegungen in einer Baugruppe rückgängig. | vorhanden – Positionsdarstellung |
| Inhalt entsperren <sub>`component_unlock`</sub> | – | vorhanden – Komponente unabhängig machen |
| Verknüpfungen aktualisieren <sub>`component_update_links`</sub> | Liest die verknüpften Konstruktionsdateien neu ein und ersetzt Körper, wo sie sich geändert haben. Damit übernehmen Sie Änderungen an einem Teil, das diese Baugruppe verwendet. | vorhanden – Verknüpfte Bauteile, Komponente ersetzen |
| Kontakt prüfen <sub>`contact_check`</sub> | Listet die Teilepaare in Kontaktsätzen auf, die sich in der aktuellen Stellung durchdringen. Damit finden Sie Kollisionen, bevor Sie Gelenke antreiben oder eine Bewegungsuntersuchung abspielen. | vorhanden – Kontaktsatz / Kontaktlöser |
| Neuer Kontaktsatz <sub>`contact_create`</sub> | Fasst zwei oder mehr Teile zu einem Kontaktsatz zusammen, dessen Körper sich beim Bewegen der Gelenke nicht durchdringen. Für Teile, die beim Berühren anhalten sollen, etwa ein Hebel an seinem Anschlag. | vorhanden – Kontaktsatz / Kontaktlöser |
| Kontakt deaktivieren <sub>`contact_disable_all`</sub> | Schaltet den Kontakt aus, sodass angetriebene Gelenke und Bewegungsuntersuchungen nicht mehr anhalten, wo sich Teile berühren. Damit bewegen Sie Teile wieder frei oder halten eine große Baugruppe flüssig. | vorhanden – Kontaktsatz / Kontaktlöser |
| Kontaktsatz bearbeiten <sub>`contact_edit`</sub> | Ändert einen Kontaktsatz: die enthaltenen Teile, den Namen oder ob er unterdrückt ist; der Satz lässt sich auch löschen. Damit passen Sie an, welche Teile sich nicht durchdringen dürfen. | vorhanden – Kontaktsatz / Kontaktlöser |
| Alle Kontakte aktivieren <sub>`contact_enable_all`</sub> | Nimmt alle Teile der Baugruppe in einen gemeinsamen Kontaktsatz, sodass sich beim Bewegen der Gelenke keine zwei Teile durchdringen. Für eine schnelle Prüfung des ganzen Mechanismus. | vorhanden – Kontaktsatz / Kontaktlöser |
| Kontaktsätze aktivieren <sub>`contact_enable_sets`</sub> | Schaltet den Kontakt für Ihre definierten Kontaktsätze ein, sodass angetriebene Gelenke und Bewegungsuntersuchungen anhalten, wo sich deren Teile durchdringen würden. Damit holen Sie Ihre Sätze zurück, nachdem der Kontakt aus war. | vorhanden – Kontaktsatz / Kontaktlöser |
| Kontaktsätze auflisten <sub>`contact_list`</sub> | Listet die Kontaktsätze der Konstruktion auf, die Teile in jedem Satz und ob der Kontakt eingeschaltet ist. Damit prüfen Sie die Kontakteinstellung, bevor Sie die Baugruppe antreiben. | vorhanden – Kontaktsatz / Kontaktlöser |
| Explosionsdarstellung <sub>`explode_create`</sub> | Erstellt eine Explosionsdarstellung, die die Teile vom Mittelpunkt der Baugruppe wegschiebt oder um die von Ihnen festgelegten Wege verschiebt. Damit zeigen Sie, wie eine Baugruppe zusammengesetzt wird, für Anleitungen oder Präsentationen. | vorhanden – Explosion in Schritten |
| Explosionsdarstellung löschen <sub>`explode_delete`</sub> | – | vorhanden – Explosion |
| Explosionsdarstellungen auflisten <sub>`explode_list`</sub> | – | vorhanden – Explosion |
| Explosionsdarstellung anzeigen <sub>`explode_show`</sub> | – | vorhanden – Explosion |
| Fertigungsgelenk <sub>`joint_as_built`</sub> | Verbindet zwei Teile dort, wo sie bereits liegen, ohne eines davon zu verschieben, und legt fest, wie sie sich noch bewegen dürfen. Für Teile, die Sie schon an ihre endgültige Stelle gesetzt haben. | vorhanden – Abhängigkeit an aktueller Lage |
| Nocken <sub>`joint_cam`</sub> | Koppelt eine sich drehende Kurvenscheibe mit einem Stößel, der gleitet oder schwenkt, während die Kontur der Scheibe unter ihm durchläuft. Für Nocken, Exzenter und Ventiltriebe. | nachgebaut (E1–E6) – Getriebetechnik |
| Gelenk <sub>`joint_create`</sub> | Verbindet zwei Teile an den gewählten Gelenkursprüngen und bewegt das zweite Teil an seine Stelle; der Gelenktyp legt fest, wie sie sich noch bewegen dürfen. Damit bauen Sie eine Baugruppe, deren Teile sich wie der echte Mechanismus bewegen. | vorhanden – Drehgelenk, Abhängigkeiten mit Grenzen |
| Gelenk löschen <sub>`joint_delete`</sub> | – | vorhanden – Abhängigkeit löschen |
| Gelenke antreiben <sub>`joint_drive`</sub> | Setzt Winkel oder Weg eines Gelenks und bewegt die Teile mit, innerhalb der Grenzen; gekoppelte Gelenke und geschlossene Schleifen folgen. Damit prüfen Sie, ob sich ein Mechanismus wie gewünscht bewegt. | vorhanden – Gelenke bewegen (Animation) |
| Gelenk bearbeiten <sub>`joint_edit`</sub> | – | vorhanden – Abhängigkeit bearbeiten |
| Zahnrad <sub>`joint_gear`</sub> | Koppelt zwei Drehgelenke mit einer Übersetzung, sodass das Antreiben des einen das andere dreht. Für Stirn- und Hohlräder, mit der Übersetzung aus Teilkreisradien oder Zähnezahlen. | nachgebaut (E1–E6) – Getriebetechnik |
| Gelenk prüfen <sub>`joint_inspect`</sub> | – | vorhanden – Eigenschaften der Abhängigkeit |
| Gelenkgrenzen <sub>`joint_limits`</sub> | Legt fest, wie weit sich ein Gelenk drehen oder schieben darf, als Minimum und Maximum, oder hebt diese Grenzen auf. Damit bleibt ein Scharnier, Schieber oder Hebel in seinem echten Bewegungsbereich. | vorhanden – Grenzen an Abhängigkeiten |
| Gelenke auflisten <sub>`joint_list`</sub> | – | vorhanden – Modellbrowser → Abhängigkeiten |
| Bewegungsverknüpfung <sub>`joint_motion_link`</sub> | Koppelt zwei Gelenke über ein Verhältnis und einen Versatz, sodass das Antreiben des einen das andere bewegt. Für feste Beziehungen zwischen Gelenken, die Zahnrad, Zahnstange und Ritzel oder Schraube nicht abdecken. | nachgebaut (E1–E6) – Getriebetechnik |
| Gelenkursprung <sub>`joint_origin`</sub> | Setzt einen benannten Gelenkursprung auf ein Teil: in die Mitte einer Fläche oder eines runden Endes, auf die Mitte einer Kante, an eine Ecke oder einen Punkt. Damit bereiten Sie vor, wo Gelenke ansetzen; auf einer Fläche gewählt, folgt er ihr, wenn sich die Größe des Teils ändert. | nachgebaut (E1–E6) – Gelenkursprung ergibt sich aus Achse/Fläche |
| Zahnstange und Ritzel <sub>`joint_rack_pinion`</sub> | Koppelt ein drehendes Ritzel mit einer gleitenden Zahnstange, die sich um die abgewälzte Länge des Teilkreises verschiebt. Für Zahnstangenantriebe, Lenkungen und Lineartische. | nachgebaut (E1–E6) – Getriebetechnik |
| Punkt anfahren <sub>`joint_reach`</sub> | Bewegt einen Punkt eines Teils auf ein Ziel zu, indem die Gelenke seiner Kette innerhalb ihrer Grenzen verstellt werden. Damit stellen Sie einen Mechanismus über die Lage seines Endes ein, etwa der Spitze eines Roboterarms. | nachgebaut (E1–E6) – Robotik-Anfahren |
| Starrgruppe <sub>`joint_rigid_group`</sub> | Verbindet die gewählten Teile starr in ihrer jetzigen Lage, sodass sie sich als Einheit bewegen. Für Teile, die zusammengehören und sich gegeneinander nicht bewegen. | vorhanden – Unterbaugruppe / Schweißbaugruppe |
| Schraube <sub>`joint_screw`</sub> | Koppelt Drehen und Schieben über eine Steigung, sodass jede Umdrehung um diesen Weg vorrückt. Für Gewindespindeln, Schrauben und Trapezspindeln. | nachgebaut (E1–E6) – Getriebetechnik |
| Gelenke lösen <sub>`joint_solve`</sub> | – | vorhanden – Baugruppe lösen |
| Gelenk bis zum Kontakt durchfahren <sub>`joint_sweep`</sub> | – | vorhanden – Kontaktlöser |
| Bewegungsuntersuchung löschen <sub>`motion_delete`</sub> | – | vorhanden – Animation |
| Bewegungsuntersuchung exportieren <sub>`motion_export`</sub> | – | vorhanden – Video |
| Bewegungsanimation exportieren <sub>`motion_export_animation`</sub> | – | vorhanden – Bewegung als Video |
| Kollisionen der Bewegungsuntersuchung <sub>`motion_interference`</sub> | – | nachgebaut (E1–E6) – Kollision prüfen an gespeicherten Positionen |
| Bewegungsuntersuchungen auflisten <sub>`motion_list`</sub> | – | vorhanden – Animation |
| Bewegungsuntersuchung abspielen <sub>`motion_play`</sub> | – | vorhanden – Animation abspielen |
| Diagramm der Bewegungsuntersuchung <sub>`motion_plot`</sub> | – | nachgebaut (E1–E6) – Weg-Zeit-Diagramme nicht nötig |
| Bewegungsuntersuchung <sub>`motion_study`</sub> | Legt Gelenkwerte an Schritten entlang einer Zeitleiste fest und spielt sie als Animation ab. Damit sehen Sie einen Mechanismus einen Ablauf durchlaufen und prüfen unterwegs die Abstände. | vorhanden – Gelenke bewegen (Animation) |
| Bewegungsbahn <sub>`motion_trace`</sub> | Verfolgt die Bahn eines Punkts auf einem Teil, während eine Bewegungsuntersuchung läuft oder ein Gelenk angetrieben wird, und behält sie beim Bestätigen als 3D-Skizzenkurve. Damit sehen Sie, wohin ein Mechanismus reicht, oder bauen auf seiner Bahn auf. | nachgebaut (E1–E6) – Bewegungsbahn: vorgemerkt, wenn Tore/Klappen das brauchen |
| Bewegungsbahn bearbeiten <sub>`motion_trace_edit`</sub> | – | nachgebaut (E1–E6) – siehe Bewegungsbahn |
| Bewegungsbahn behalten <sub>`motion_trace_keep`</sub> | – | nachgebaut (E1–E6) – siehe Bewegungsbahn |
| Instanz ausrichten <sub>`occurrence_align`</sub> | – | vorhanden – Fläche an Fläche |
| Einfügen (Instanz) <sub>`occurrence_copy`</sub> | – | vorhanden – Komponente kopieren |
| Instanz ziehen <sub>`occurrence_drag`</sub> | – | vorhanden – Komponente ziehen |
| Festsetzen <sub>`occurrence_ground`</sub> | Setzt ein Teil an seiner Stelle fest oder gibt es wieder frei, sodass Gelenke die übrigen Teile um es herum bewegen. Für den Rahmen oder Sockel, auf dem der Rest der Baugruppe aufbaut. | vorhanden – Fixiert |
| Instanz verschieben <sub>`occurrence_move`</sub> | Bewegt eine Baugruppeninstanz ausschließlich entlang der Freiheitsgrade, die ihre Gelenke zulassen. Wählen Sie eine Fläche des Bauteils aus und ziehen Sie anschließend einen der verfügbaren Pfeile oder Bögen. | vorhanden – Verschieben/Drehen |
| Physikalische Eigenschaften der Instanz <sub>`occurrence_properties`</sub> | – | vorhanden – Eigenschaften |
| In andere Komponente verschieben <sub>`occurrence_reparent`</sub> | – | vorhanden – In Unterbaugruppe verschieben |

### Prüfen

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Zugänglichkeitsanalyse <sub>`inspect_accessibility`</sub> | Färbt die Flächen, die ein Werkzeug aus einer Richtung erreicht, und die, die es nicht erreicht. Damit prüfen Sie ein Teil auf Fräsen oder Formen von dieser Seite. | nachgebaut (E1–E6) – Werkzeugzugänglichkeit für Fräsen/Spritzguss |
| Massenschwerpunkt <sub>`inspect_center_of_mass`</sub> | Zeigt den Schwerpunkt von Körpern, einzeln und zusammen, bei gleichmäßiger Dichte. Damit prüfen Sie die Balance und wohin ein Teil kippt. | vorhanden – Schwerpunkt (Eigenschaften, Gestell) |
| Freiraum <sub>`inspect_clearance`</sub> | – | vorhanden – Messen → Mindestabstand |
| Komponentenfarben einschalten <sub>`inspect_colored_components`</sub> | Gibt jeder Komponente vorübergehend eine eigene Farbe, ohne die Darstellungen zu ändern. Damit unterscheiden Sie die Teile einer Baugruppe auf einen Blick. | vorhanden – Bauteilfarben ein/aus |
| Komponentenfarben ausschalten <sub>`inspect_colored_components_disable`</sub> | – | vorhanden – Bauteilfarben ein/aus |
| Körper vergleichen <sub>`inspect_compare`</sub> | Vergleicht zwei Körper und zeigt, wo einer Material hat, das dem anderen fehlt, mit Volumen und Abweichung. Damit prüfen Sie ein geändertes oder importiertes Teil gegen das Original. | nachgebaut (E1–E6) – Versionen nebeneinander öffnen genügt |
| Kontinuitätsprüfung <sub>`inspect_continuity`</sub> | Prüft, wie glatt Flächen an ihren Kanten ineinander übergehen: Lücken, Knicke oder Krümmungssprünge, und färbt die Nähte. Damit finden Sie Stellen, an denen Flächen nicht sauber anschließen. | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |
| Krümmungskamm-Analyse <sub>`inspect_curvature_comb`</sub> | Zeichnet Kämme an Kurven, Kanten oder Flächen, deren Zinken zeigen, wie stark sie gekrümmt sind. Damit erkennen Sie flache Stellen, Knicke und ungleichmäßige Krümmung. | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |
| Krümmungskartenanalyse <sub>`inspect_curvature_map`</sub> | Färbt Flächen danach, wie stark sie gekrümmt sind, rot bei kleinem Radius. Damit finden Sie enge Stellen und beurteilen, wie glatt eine Fläche ist. | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |
| Auswinkelanalyse <sub>`inspect_draft`</sub> | Färbt Flächen nach ihrem Formschrägenwinkel zur Entformungsrichtung und markiert die mit zu wenig. Damit prüfen Sie ein Teil vor dem Spritzgießen oder Gießen. | vorhanden – Entformungsanalyse |
| Umgebungskartenanalyse <sub>`inspect_environment_map`</sub> | Zeigt das Modell mit spiegelnder Oberfläche. Damit beurteilen Sie den Verlauf von Flächen an der Art, wie Spiegelungen darüber laufen. | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |
| Eingriff <sub>`inspect_interference`</sub> | Findet Körper, die sich überschneiden, und zeigt jede Überschneidung mit ihrem Volumen. Damit prüfen Sie eine Baugruppe auf kollidierende Teile. | vorhanden – Kollision prüfen |
| Isokurvenanalyse <sub>`inspect_isocurve`</sub> | Zeichnet die isoparametrischen Kurven von Flächen, das Raster, auf dem die Fläche aufbaut. Damit sehen Sie, wie eine Fläche verläuft und wo sie sich staucht. | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |
| Mindestradiusanalyse <sub>`inspect_minimum_radius`</sub> | Findet den kleinsten Krümmungsradius von Kurven, Kanten oder Flächen und seine Lage. Damit prüfen Sie, ob ein Werkzeug oder eine Düse der Form folgen kann. | nachgebaut (E1–E6) – Biegeradius kommt aus der Blechregel |
| Parametervariation <sub>`inspect_parameter_sweep`</sub> | – | nachgebaut (E1–E6) – Variantentabelle rechnet Varianten durch |
| Silhouette <sub>`inspect_silhouette`</sub> | – | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |
| Zebra-Analyse <sub>`inspect_zebra`</sub> | Zeigt schwarze und weiße Streifen, die sich auf den Flächen des Modells spiegeln. Damit beurteilen Sie Glätte: Streifen, die an einer Kante brechen oder knicken, zeigen einen schlechten Übergang. | nachgebaut (E1–E6) – Flächenqualität für Freiform, nicht Metallbau |

### Parameter und Varianten

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Konfiguration aktivieren <sub>`config_activate`</sub> | – | vorhanden – Variantentabelle und Regeln |
| Konfigurationsspalte <sub>`config_column`</sub> | – | vorhanden – Variantentabelle und Regeln |
| Konfigurieren <sub>`config_configure`</sub> | Fügt Parameter, Elemente, Materialien oder Darstellungen als Spalten der Konfigurationstabelle hinzu. Damit bauen Sie Varianten eines Designs, etwa Baugrößen eines Teils. | vorhanden – Variantentabelle und Regeln |
| Konfiguration vorschauen <sub>`config_preview`</sub> | Prüft, ob sich eine Zeile der Konfigurationstabelle aufbauen lässt, ohne das Design oder seinen Verlauf zu ändern. Vor dem Wechsel zu einer Variante, bei der Sie unsicher sind. | vorhanden – Variantentabelle und Regeln |
| Konfigurationszeile <sub>`config_row`</sub> | – | vorhanden – Variantentabelle und Regeln |
| Konfigurationsregel <sub>`config_rule`</sub> | – | vorhanden – Variantentabelle und Regeln |
| Konfigurationsregeln <sub>`config_rules`</sub> | Zeigt die Regeln der Konfigurationstabelle, ihre Zeilen und die aktive Zeile. Damit sehen Sie, wie die Varianten eines Designs aufgebaut sind. | vorhanden – Variantentabelle und Regeln |
| Konfigurationstabelle anzeigen <sub>`config_table`</sub> | Zeigt die Konfigurationstabelle: eine Zeile je Variante, eine Spalte je Parameter oder Element, und ob das Design noch der aktiven Zeile entspricht. Damit überblicken Sie die Varianten eines Designs. | vorhanden – Variantentabelle und Regeln |
| Ausdruck auswerten <sub>`expr_evaluate`</sub> | – | vorhanden – Ausdrücke in jedem Zahlenfeld; neu: sinh/cosh/tanh/exp/ln/log/fest/mod |
| Benutzerparameter hinzufügen <sub>`parameters_add`</sub> | – | vorhanden – Parameter |
| Parameter ändern <sub>`parameters_change`</sub> | Öffnet die Tabelle mit benannten Parametern und Ausdrücken, die die Abmessungen des Designs steuern. Ändern Sie einen Wert an einer zentralen Stelle, werden alle Features, die diesen Wert verwenden, entsprechend aktualisiert. | vorhanden – Parameter |
| Parameter kommentieren <sub>`parameters_comment`</sub> | – | vorhanden – Kommentar am Parameter |
| Ausdruck vervollständigen <sub>`parameters_complete`</sub> | – | nachgebaut (E1–E6) – Parameternamen in Ausdrücken, ohne Vorschlagsliste |
| Parameter löschen <sub>`parameters_delete`</sub> | – | vorhanden – Parameter |
| Parameter exportieren <sub>`parameters_export`</sub> | Speichert die Parameter des Designs als CSV oder JSON. Damit bearbeiten Sie sie in einer Tabellenkalkulation oder übertragen sie in ein anderes Design. | vorhanden – Parameterdatei |
| Favorisierter Parameter <sub>`parameters_favorite`</sub> | – | nachgebaut (E1–E6) – Parameter der Baugruppe / Hauptmaße oben |
| Parametergraph <sub>`parameters_graph`</sub> | Zeigt, welche Parameter und Elemente welche anderen nutzen, samt Schleifen oder Fehlern. Damit sehen Sie, was eine Parameteränderung beeinflusst. | nachgebaut (E1–E6) – Abhängigkeitsgrafik, Liste genügt |
| Parameter importieren <sub>`parameters_import`</sub> | Liest Parameter aus CSV oder JSON in das Design ein, alle oder keine. Damit übernehmen Sie Werte aus einer Tabelle oder einem anderen Design. | vorhanden – Parameterdatei |
| Parameter auflisten <sub>`parameters_list`</sub> | – | vorhanden – Parameter |
| Parameter verschieben <sub>`parameters_move`</sub> | Verschiebt einen Benutzerparameter vor oder hinter einen anderen in der Liste. So bleiben zusammengehörige Parameter beieinander. | nachgebaut (E1–E6) – Reihenfolge nach Anlage genügt |
| Parameter umbenennen <sub>`parameters_rename`</sub> | – | vorhanden – Parameter (Ausdrücke werden mitgezogen) |
| Parameterverwendungen <sub>`parameters_users`</sub> | – | nachgebaut (E1–E6) – Umbenennen zieht Ausdrücke mit; keine Verwendungsliste |

### Verlauf

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Aufgezeichnetes Merkmal hinzufügen <sub>`timeline_add`</sub> | – | vorhanden – Makro aufzeichnen |
| Alles berechnen <sub>`timeline_compute_all`</sub> | Berechnet alle Features der Timeline von Anfang an neu. Dadurch wird das Modell aktualisiert und Sie sehen, bei welchen Features Berechnungsfehler auftreten. | vorhanden – Neu berechnen (F5) |
| Merkmale kopieren <sub>`timeline_copy`</sub> | – | vorhanden – Feature kopieren |
| Merkmalsabhängigkeiten <sub>`timeline_dependents`</sub> | Listet die Elemente, die mit einem Element gelöscht würden, und die, die ohne es fehlschlagen würden. Bevor Sie ein Element löschen oder ändern. | vorhanden – Löschen fragt nach Abhängigen; Wo verwendet |
| Befehlsskript exportieren <sub>`timeline_export_script`</sub> | – | vorhanden – Makros |
| Merkmal prüfen <sub>`timeline_inspect`</sub> | – | vorhanden – Eigenschaften / Berechnungsprotokoll |
| Merkmale einfügen <sub>`timeline_paste`</sub> | – | vorhanden – Feature einfügen |
| Merkmal bearbeiten <sub>`timeline_redefine`</sub> | – | vorhanden – Doppelklick bearbeitet |
| Umbenennen <sub>`timeline_rename`</sub> | – | vorhanden – Umbenennen |
| Merkmal neu ordnen <sub>`timeline_reorder`</sub> | – | vorhanden – Ziehen im Modellbrowser |
| Zeitleistenmarkierung verschieben <sub>`timeline_rollback`</sub> | – | vorhanden – Bauteilende |
| Merkmal unterdrücken <sub>`timeline_suppress`</sub> | – | vorhanden – Unterdrücken |

### Datei und Dokument

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Zeichenfläche kalibrieren <sub>`canvas_calibrate`</sub> | – | nachgebaut (E1–E6) – Bild über Maß skalieren |
| Dekal <sub>`canvas_decal`</sub> | Bringt ein Bild wie einen Aufkleber auf eine ebene Fläche des Modells. Damit zeigen Sie ein Etikett, ein Logo oder einen Aufdruck auf einem Teil. | nachgebaut (E1–E6) – Aufkleber fürs Rendern, im Metallbau unnötig |
| Zeichenfläche löschen <sub>`canvas_delete`</sub> | – | vorhanden – Bild löschen |
| Zeichenfläche bearbeiten <sub>`canvas_edit`</sub> | Ändert eine Zeichenfläche: Lage, Größe, Winkel, Deckkraft, Spiegelung, Sichtbarkeit oder Namen. Damit richten Sie ein Referenzbild an der Skizze aus, die Sie darüber nachzeichnen. | vorhanden – Bild in der Skizze verschieben/skalieren |
| Zeichenfläche <sub>`canvas_insert`</sub> | Legt ein PNG- oder JPEG-Bild als durchscheinende Referenz auf eine Ebene oder Fläche. Damit zeichnen Sie ein Foto oder eine Zeichnung in einer Skizze nach, mit dem Bild auf eine bekannte Größe skaliert. | vorhanden – Skizze: Bild einfügen |
| Skizze aus Zeichenfläche <sub>`canvas_to_sketch`</sub> | – | nachgebaut (E1–E6) – automatisches Nachzeichnen unzuverlässig; DXF/SVG-Import nehmen |
| Konstruktion wiederherstellen <sub>`doc_recover`</sub> | – | vorhanden – Wiederherstellung nach Absturz |
| Wiederhergestellte Konstruktion verwerfen <sub>`doc_recovery_discard`</sub> | – | vorhanden – Wiederherstellung verwerfen |
| Wiederherstellbare Konstruktionen <sub>`doc_recovery_list`</sub> | – | vorhanden – Wiederherstellung |
| Konstruktion prüfen <sub>`document_inspect`</sub> | Zeigt eine Übersicht des Designs: Komponenten, Körper, Skizzen, Elemente und Parameter. Damit finden Sie sich in einem Design zurecht, das Sie nicht selbst gebaut haben. | vorhanden – Problemliste |
| Konstruktionseigenschaften <sub>`document_metadata`</sub> | – | vorhanden – Eigenschaften (iProperties, AW3) |
| Konstruktionseigenschaft entfernen <sub>`document_metadata_remove`</sub> | – | vorhanden – Eigenschaften |
| Konstruktionseigenschaften ändern <sub>`document_metadata_set`</sub> | – | vorhanden – Eigenschaften |
| Konstruktionsrevision <sub>`document_revision`</sub> | – | vorhanden – Versionen / Revision im Schriftfeld |
| Einheiten der Konstruktion ändern <sub>`document_units`</sub> | Ändert die Einheit, in der die Konstruktion Längen anzeigt, etwa mm oder Zoll. Die Geometrie behält ihre Größe; nur Anzeige und Zahlen ohne Einheit folgen. | nachgebaut (E1–E6) – Metallbau rechnet in mm; Zoll in Ausdrücken möglich (2 in) |
| Prüfpunkt <sub>`edit_checkpoint`</sub> | Merkt sich das Design, die aktive Skizze und den Rückgängig-Verlauf im jetzigen Zustand. Vor einem riskanten Versuch, von dem Sie vielleicht zurück wollen. | vorhanden – Version speichern |
| Letzten Befehl wiederholen <sub>`edit_repeat`</sub> | – | vorhanden – Nochmal (PR #187) |
| Prüfpunkt wiederherstellen <sub>`edit_restore_checkpoint`</sub> | Kehrt zu einem Prüfpunkt zurück, samt Rückgängig-Verlauf. Damit verwerfen Sie alles seit dem Prüfpunkt in einem Schritt. | vorhanden – Versionen |
| Exportieren <sub>`file_export`</sub> | – | vorhanden – Export-Reiter |
| Netz einfügen <sub>`file_insert_mesh`</sub> | Fügt eine 3MF-, STL-, OBJ-, PLY- oder glTF-Datei als Netzkörper in einer neuen Komponente in die Konstruktion ein. Damit stellen Sie ein heruntergeladenes oder gescanntes Modell als Referenz neben Ihre Konstruktion. | vorhanden – STL einfügen |
| STEP einfügen <sub>`file_insert_step`</sub> | Fügt eine STEP-, IGES-, FreeCAD- oder Rhino-Datei als Volumenkörper in einer neuen Komponente in die Konstruktion ein; die Teile einer Baugruppe werden zu verschachtelten Komponenten. Damit übernehmen Sie Modelle von Herstellern oder aus anderen CAD-Programmen. | vorhanden – STEP einfügen |
| Mit EasyPrint öffnen <sub>`file_open_in_easyprint`</sub> | – | nachgebaut (E1–E6) – fremdes Druckprogramm |
| Als Netz speichern <sub>`file_save_mesh`</sub> | Speichert Körper als STL-, 3MF- oder OBJ-Netz, mit der gewählten Glätte gekrümmter Flächen. Damit bereiten Sie Teile für den 3D-Druck oder für Programme vor, die Netze lesen. | vorhanden – STL / OBJ / 3MF |
| An Slicer senden <sub>`file_send_to_slicer`</sub> | Speichert die gewählten Körper als 3MF-Datei und öffnet sie im gewählten Slicer. Damit kommen Sie in einem Schritt vom Modell zum Druck. | nachgebaut (E1–E6) – 3MF speichern und im Slicer öffnen genügt |
| Installierte Slicer <sub>`file_slicers`</sub> | – | nachgebaut (E1–E6) – siehe Slicer |
| Lokalen Bibliothekseintrag anwenden <sub>`library_apply`</sub> | Wendet ein Material oder eine Darstellung aus einer lokalen Bibliotheksdatei auf Körper, Flächen oder Komponenten an. Damit nutzen Sie Materialien aus einem anderen Design wieder. | vorhanden – Teilebibliothek |
| Designbibliothek exportieren <sub>`library_export`</sub> | Speichert die Materialien und Darstellungen des Designs in einer Bibliotheksdatei. Damit teilen Sie sie oder nutzen sie in anderen Designs wieder. | vorhanden – Teilebibliothek |
| Lokale Bibliothek prüfen <sub>`library_inspect`</sub> | Prüft eine Bibliotheksdatei und listet ihre Materialien und Darstellungen auf, ohne das Design zu ändern. Damit sehen Sie vor dem Anwenden, was eine Bibliothek enthält. | vorhanden – Teilebibliothek |
| Physikalisches Material <sub>`material_assign`</sub> | Legt fest, aus welchem Werkstoff die ausgewählten Körper bestehen, beispielsweise Stahl, Aluminium oder ABS. Dadurch entspricht die berechnete Masse derjenigen des realen Bauteils. | vorhanden – Werkstoff am Bauteil |
| Neues physikalisches Material <sub>`material_create`</sub> | – | vorhanden – Eigene Werkstoffe |
| Physisches Material löschen <sub>`material_delete`</sub> | – | vorhanden – Eigene Werkstoffe |
| Physisches Material bearbeiten <sub>`material_edit`</sub> | – | vorhanden – Eigene Werkstoffe |
| Physikalisches Material prüfen <sub>`material_inspect`</sub> | – | vorhanden – Werkstoffwerte |
| Materialien auflisten <sub>`material_list`</sub> | – | vorhanden – Werkstoffliste |
| Richtungsabhängiger Elastizitätsmodul <sub>`material_properties_directional`</sub> | – | nachgebaut (E1–E6) – nur für Verbundwerkstoffe |
| Physikalische Materialdaten prüfen <sub>`material_properties_validate`</sub> | Prüft eine Materialdatenkarte auf stimmige Werte und fehlende Angaben. Bevor Sie sich für Masse oder Steifigkeit auf die Daten verlassen. | vorhanden – Prüfung beim Speichern |
| Netz konvertieren <sub>`mesh_convert`</sub> | Baut einen Netzkörper, etwa aus einer STL, als bearbeitbaren Volumenkörper mit ebenen und zylindrischen Flächen nach. Damit ändern Sie importierte Maschinenteile wie einen modellierten Körper. | nachgebaut (E1–E6) – Netz in Volumenkörper wandeln, im Metallbau selten |
| Kanten auflisten <sub>`model_edges`</sub> | – | nachgebaut (E1–E6) – Skript-Abfrage |
| Flächen auflisten <sub>`model_faces`</sub> | – | nachgebaut (E1–E6) – Skript-Abfrage |
| Gewinde auflisten <sub>`model_threads`</sub> | – | nachgebaut (E1–E6) – Gewinde stehen in Bohrungstabelle und Stückliste |
| Kunststoffregel zuweisen <sub>`plastic_assign_rule`</sub> | Weist Körpern eine Kunststoffregel zu, sodass ihre Kunststoffelemente deren Formschräge und Spiel als Vorgabe nehmen. Damit richten Sie ein Spritzgussteil einmal für alle seine Elemente ein. | nachgebaut (E1–E6) – Kunststoffteile |
| Ansatz <sub>`plastic_boss`</sub> | Fügt einen Ansatz (Schraubdom) auf einer Fläche hinzu: einen Zapfen mit optionaler Bohrung, Formschräge, Fußrundung und Stützrippen. Für Schraubstellen in gespritzten oder gedruckten Gehäusen. | nachgebaut (E1–E6) – Kunststoffteile |
| Lippe <sub>`plastic_lip`</sub> | Fügt entlang des Rands eines ausgehöhlten Körpers eine Lippe oder eine passende Nut hinzu. Damit zentrieren sich zwei Gehäusehälften aufeinander und schließen dicht. | nachgebaut (E1–E6) – Kunststoffteile |
| Kunststoffregeln verwalten <sub>`plastic_manage_rules`</sub> | Erstellt und bearbeitet Kunststoffregeln: Material, Wandstärke, Radien, Spiel und Formschräge. Damit halten Sie die Elemente eines Spritzgussteils einheitlich. | nachgebaut (E1–E6) – Kunststoffteile |
| Auflage <sub>`plastic_rest`</sub> | Fügt eine Auflage auf einer Fläche hinzu: ein rundes oder rechteckiges Polster, voll oder hohl, mit Formschräge. Als Stütze oder Abstandshalter in einem Spritzgussgehäuse. | nachgebaut (E1–E6) – Kunststoffteile |
| Kunststoffregeln auflisten <sub>`plastic_rules`</sub> | – | nachgebaut (E1–E6) – Kunststoffteile |
| Rastverbindung <sub>`plastic_snap_fit`</sub> | Fügt eine Rastverbindung auf einer Fläche hinzu: einen Schnapphaken mit Länge, Dicke und Rastnase. Damit klipsen Sie Teile ohne Schrauben zusammen. | nachgebaut (E1–E6) – Kunststoffteile |
| Punktwolke löschen <sub>`pointcloud_delete`</sub> | – | nachgebaut (E1–E6) – Punktwolken / Scan |
| Punktwolke bearbeiten <sub>`pointcloud_edit`</sub> | – | nachgebaut (E1–E6) – Punktwolken / Scan |
| Punktwolke einfügen <sub>`pointcloud_insert`</sub> | Fügt einen PLY-, XYZ- oder PTS-Scan als Punktwolke neben dem Modell ein. Verwenden Sie ihn als Referenz beim Modellieren anhand von Messdaten. | nachgebaut (E1–E6) – Punktwolken / Scan |
| Punktwolken <sub>`pointcloud_list`</sub> | – | nachgebaut (E1–E6) – Punktwolken / Scan |

### Ansicht und Oberfläche

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Alles einklappen <sub>`browser_collapse_all`</sub> | – | vorhanden – Modellbrowser |
| Alles ausklappen <sub>`browser_expand_all`</sub> | – | vorhanden – Modellbrowser |
| Neue Gruppe <sub>`browser_group`</sub> | – | vorhanden – Ordner im Modellbrowser (B3) |
| Browser-Elemente verschieben <sub>`browser_move`</sub> | – | vorhanden – Ziehen im Modellbrowser |
| Browser-Elemente ordnen <sub>`browser_order`</sub> | – | vorhanden – Ziehen im Modellbrowser |
| Gruppe umbenennen <sub>`browser_rename_group`</sub> | – | vorhanden – Ordner umbenennen |
| In andere Komponente verschieben <sub>`browser_reparent`</sub> | – | vorhanden – In Unterbaugruppe verschieben |
| Gruppierung aufheben <sub>`browser_ungroup`</sub> | – | vorhanden – Ordner auflösen |
| Ein-/Ausblenden <sub>`browser_visibility`</sub> | – | vorhanden – Sichtbarkeit im Modellbrowser |
| Absturzbericht <sub>`diagnostics_crash_report`</sub> | – | nachgebaut (E1–E6) – Entwickler-Werkzeug |
| Absturzberichte <sub>`diagnostics_crash_reports`</sub> | – | nachgebaut (E1–E6) – Entwickler-Werkzeug |
| Absturzberichte löschen <sub>`diagnostics_crash_reports_clear`</sub> | – | nachgebaut (E1–E6) – Entwickler-Werkzeug |
| Absturztest <sub>`diagnostics_crash_test`</sub> | – | nachgebaut (E1–E6) – Entwickler-Werkzeug |
| Profil <sub>`diagnostics_profile`</sub> | – | nachgebaut (E1–E6) – Entwickler-Werkzeug |
| Prüfung <sub>`diagnostics_validation`</sub> | – | vorhanden – Problemliste |
| Befehle auflisten <sub>`engine_commands`</sub> | – | vorhanden – Befehl suchen (Strg+K) |
| Befehl beschreiben <sub>`engine_describe`</sub> | – | vorhanden – Befehlshilfe im Tooltip |
| Auswahl aufheben <sub>`select_clear`</sub> | – | vorhanden – Esc |
| Einstellungsprofil anwenden <sub>`settings_profile_apply`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil löschen <sub>`settings_profile_delete`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil exportieren <sub>`settings_profile_export`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil importieren <sub>`settings_profile_import`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofile <sub>`settings_profile_list`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil umbenennen <sub>`settings_profile_rename`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil speichern <sub>`settings_profile_save`</sub> | – | nachgebaut (E1–E6) – Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Umgebungsverdeckung <sub>`view_ambient_occlusion`</sub> | – | vorhanden – Darstellung fotorealistisch |
| Ansichtswinkel <sub>`view_angle_readout`</sub> | – | nachgebaut (E1–E6) – Kamerawinkel braucht man nicht |
| Benannte Ansicht wiederherstellen <sub>`view_apply`</sub> | Dreht die Ansicht in eine Standardrichtung wie vorne, oben oder iso oder zu einer gespeicherten Ansicht. Damit betrachten Sie das Modell aus einem festen Winkel. | vorhanden – Gespeicherte Ansichten |
| Rückansicht <sub>`view_back`</sub> | – | vorhanden – Ansicht Hinten |
| Untersicht <sub>`view_bottom`</sub> | – | vorhanden – Ansicht Unten |
| Benannte Ansicht löschen <sub>`view_delete`</sub> | Löscht eine gespeicherte Ansicht. Das Modell bleibt unverändert. | vorhanden – Gespeicherte Ansichten |
| Ansicht einpassen <sub>`view_fit`</sub> | Zoomt und verschiebt so, dass das ganze Modell oder die Auswahl die Ansicht füllt. Wenn das Modell aus dem Blick geraten ist. | vorhanden – Alles zeigen (F6) |
| Vorderansicht <sub>`view_front`</sub> | – | vorhanden – Ansicht Vorne |
| Grafikprofil <sub>`view_graphics_preset`</sub> | – | vorhanden – Einstellungen → Darstellung |
| Raster <sub>`view_grid`</sub> | Blendet das Raster im Ansichtsfenster ein oder aus. Als Größen- und Orientierungshilfe beim Modellieren. | vorhanden – Raster |
| Bodenschatten <sub>`view_ground_shadow`</sub> | Blendet den Schatten des Modells auf dem Boden ein oder aus. Damit schätzen Sie Höhe und Lage leichter ein. | vorhanden – Bodenschatten |
| Startansicht <sub>`view_home`</sub> | Dreht die Ansicht zurück in die Ausgangsrichtung und zeigt das ganze Modell. Damit kommen Sie schnell zu einer bekannten Ansicht zurück. | vorhanden – Iso / Ansichtswürfel Haus |
| Isometrische Ansicht <sub>`view_isometric`</sub> | – | vorhanden – Ansicht Iso |
| Linke Seitenansicht <sub>`view_left`</sub> | – | vorhanden – Ansicht Links |
| Benannte Ansichten auflisten <sub>`view_list`</sub> | Listet die im Design gespeicherten Ansichten auf. Damit finden Sie eine früher gespeicherte Ansicht. | vorhanden – Gespeicherte Ansichten |
| Ansicht navigieren <sub>`view_navigate`</sub> | Dreht, verschiebt oder zoomt die Ansicht schrittweise, etwa eine Vierteldrehung nach links. Damit bewegen Sie die Kamera genau statt durch Ziehen. | vorhanden – Maus/Tastatur |
| Nächster Tab <sub>`view_next_tab`</sub> | – | vorhanden – Dokument-Reiter in der Kopfleiste |
| Senkrecht zur Auswahl <sub>`view_normal_to`</sub> | – | vorhanden – Normal zur Fläche |
| Vorheriger Tab <sub>`view_previous_tab`</sub> | – | vorhanden – Dokument-Reiter |
| Benannte Ansicht umbenennen <sub>`view_rename`</sub> | Gibt einer gespeicherten Ansicht einen neuen Namen. Die Ansicht selbst bleibt gleich. | vorhanden – Gespeicherte Ansichten |
| Render-Bildhilfen <sub>`view_render_frame`</sub> | – | nachgebaut (E1–E6) – Render-Studio |
| Rechte Seitenansicht <sub>`view_right`</sub> | – | vorhanden – Ansicht Rechts |
| Neue benannte Ansicht <sub>`view_save`</sub> | Speichert die aktuelle Kameraposition als benannte Ansicht im Design. Damit kehren Sie später zum selben Blickwinkel zurück, etwa für Screenshots. | vorhanden – Ansicht speichern |
| Aufnahmenleiste <sub>`view_shots_strip`</sub> | – | nachgebaut (E1–E6) – Render-Studio |
| Ansicht kontinuierlich drehen <sub>`view_spin`</sub> | Dreht die Ansicht fortlaufend um das Modell, bis zum nächsten Klick oder Tastendruck. Damit präsentieren Sie ein Modell von allen Seiten. | nachgebaut (E1–E6) – Dauerdrehen nur Präsentation; Video gibt es |
| Navigationswerkzeug <sub>`view_tool`</sub> | Schaltet ein Kamerawerkzeug fest, Drehen, Verschieben oder Zoomen, sodass Ziehen mit der linken Maustaste die Ansicht bewegt, bis Sie es abschalten. Für Touchpads oder Mäuse ohne mittlere Taste. | vorhanden – Orbit/Pan/Zoom |
| Draufsicht <sub>`view_top`</sub> | – | vorhanden – Ansicht Oben |
| Darstellungsstil <sub>`view_visual_style`</sub> | Schaltet um, wie das Modell gezeichnet wird: schattiert mit oder ohne Kanten, Drahtmodell oder mit verdeckten Kanten. Drahtmodell zum Hineinschauen, schattiert für ein sauberes Bild. | vorhanden – Darstellung schattiert/Kanten/Draht/transparent/foto |

### Rendern und Aussehen

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
| Erscheinungsbild <sub>`appearance_assign`</sub> | Weist den ausgewählten Körpern, Flächen oder Komponenten eine Farbe oder ein Erscheinungsbild zu, ohne ihre Masse zu verändern. So können Sie Bauteile optisch unterscheiden oder das Aussehen einer Oberfläche vorab prüfen. | vorhanden – Oberfläche und RAL-Farbe am Bauteil |
| Aussehen-Herkunft <sub>`appearance_chain`</sub> | – | weggelassen (Rendern) |
| Look kopieren <sub>`appearance_copy`</sub> | – | weggelassen (Rendern) |
| Look favorisieren <sub>`appearance_favorite`</sub> | – | weggelassen (Rendern) |
| Erscheinungsbild-Bibliothek <sub>`appearance_library`</sub> | – | vorhanden – RAL-Liste, Oberflächen, Werkstoffe |
| Erscheinungsbilder auflisten <sub>`appearance_list`</sub> | – | weggelassen (Rendern) |
| Aussehen aufmalen <sub>`appearance_paint`</sub> | – | weggelassen (Rendern) |
| Look einfügen <sub>`appearance_paste`</sub> | – | weggelassen (Rendern) |
| Aussehen aufnehmen <sub>`appearance_pick_up`</sub> | – | weggelassen (Rendern) |
| Erscheinungsbild ersetzen <sub>`appearance_replace`</sub> | – | weggelassen (Rendern) |
| Mehrschichtige Oberflächenalterung <sub>`render_aging_describe`</sub> | – | weggelassen (Rendern) |
| Render-Backends <sub>`render_backends`</sub> | – | weggelassen (Rendern) |
| Alle Aufnahmen rendern <sub>`render_batch`</sub> | – | weggelassen (Rendern) |
| Renderobjekt einpassen <sub>`render_camera_fit`</sub> | – | weggelassen (Rendern) |
| Renderkamera prüfen <sub>`render_camera_get`</sub> | – | weggelassen (Rendern) |
| Rendering abbrechen <sub>`render_cancel`</sub> | – | vorhanden – Rendern (fotorealistisches PNG) |
| Bilder vergleichen <sub>`render_compare`</sub> | – | weggelassen (Rendern) |
| Objektiv- und Kreativeffekte <sub>`render_effects_describe`</sub> | – | weggelassen (Rendern) |
| PNG exportieren <sub>`render_export`</sub> | – | vorhanden – Rendern (fotorealistisches PNG) |
| HDR-Quelle untersuchen <sub>`render_hdr_inspect`</sub> | – | weggelassen (Rendern) |
| Opakes Bibliotheksaussehen anwenden <sub>`render_library_appearance_apply`</sub> | – | weggelassen (Rendern) |
| Render-Ressource untersuchen <sub>`render_library_describe`</sub> | – | weggelassen (Rendern) |
| Integrierte HDR-Umgebung anwenden <sub>`render_library_environment_apply`</sub> | – | weggelassen (Rendern) |
| Render-Bibliothek durchsuchen <sub>`render_library_list`</sub> | – | weggelassen (Rendern) |
| Prepare Physical Reference <sub>`render_library_physical_prepare`</sub> | – | weggelassen (Rendern) |
| Originale Oberflächentextur anzeigen <sub>`render_library_preview`</sub> | – | weggelassen (Rendern) |
| Erstellte Studiolichter anwenden <sub>`render_library_studio_apply`</sub> | – | weggelassen (Rendern) |
| Erstellte Studiolichter vorbereiten <sub>`render_library_studio_prepare`</sub> | – | weggelassen (Rendern) |
| Save Surface Binding <sub>`render_library_surface_bind`</sub> | – | weggelassen (Rendern) |
| Erstellte Oberflächenmaps vorbereiten <sub>`render_library_surface_prepare`</sub> | – | weggelassen (Rendern) |
| Remove Surface Binding <sub>`render_library_surface_unbind`</sub> | – | weggelassen (Rendern) |
| Ziele für Render-Ressourcen suchen <sub>`render_library_targets`</sub> | – | weggelassen (Rendern) |
| Licht hinzufügen <sub>`render_lights_add`</sub> | – | weggelassen (Rendern) |
| Render-Licht duplizieren <sub>`render_lights_duplicate`</sub> | – | weggelassen (Rendern) |
| Render-Lichter auflisten <sub>`render_lights_list`</sub> | – | weggelassen (Rendern) |
| Licht stummschalten <sub>`render_lights_mute`</sub> | – | weggelassen (Rendern) |
| Render-Licht entfernen <sub>`render_lights_remove`</sub> | – | weggelassen (Rendern) |
| Render-Licht einstellen <sub>`render_lights_set`</sub> | – | weggelassen (Rendern) |
| Licht allein anzeigen <sub>`render_lights_solo`</sub> | – | weggelassen (Rendern) |
| Optische Einstellungen zuweisen <sub>`render_optics_bind`</sub> | – | weggelassen (Rendern) |
| Zuweisung optischer Einstellungen entfernen <sub>`render_optics_unbind`</sub> | – | weggelassen (Rendern) |
| Render-Ausgabegröße festlegen <sub>`render_output_size`</sub> | – | vorhanden – Rendern (fotorealistisches PNG) |
| Renderanfrage prüfen <sub>`render_preflight`</sub> | – | weggelassen (Rendern) |
| Render-Prüfbericht kopieren <sub>`render_preflight_copy`</sub> | – | weggelassen (Rendern) |
| Studio-Voreinstellung anwenden <sub>`render_preset_apply`</sub> | – | weggelassen (Rendern) |
| Studio-Voreinstellung überprüfen <sub>`render_preset_resolve`</sub> | – | weggelassen (Rendern) |
| Festes Sampling-Budget überprüfen <sub>`render_quality_prepare`</sub> | – | weggelassen (Rendern) |
| Renderbild schließen <sub>`render_result_close`</sub> | – | weggelassen (Rendern) |
| Renderbild kopieren <sub>`render_result_copy`</sub> | – | weggelassen (Rendern) |
| Angezeigtes Render-Ergebnis behalten <sub>`render_result_pin`</sub> | – | weggelassen (Rendern) |
| Lineares Master-Rendering erneut farbkorrigieren <sub>`render_result_regrade`</sub> | – | weggelassen (Rendern) |
| Renderbild anzeigen <sub>`render_result_view`</sub> | – | weggelassen (Rendern) |
| Renderszene prüfen <sub>`render_scene`</sub> | – | weggelassen (Rendern) |
| Renderkamera anwenden <sub>`render_settings_apply`</sub> | – | weggelassen (Rendern) |
| Render-Einstellungen mit HDR speichern <sub>`render_settings_capture_hdr`</sub> | – | weggelassen (Rendern) |
| Rendereinstellungen <sub>`render_settings_get`</sub> | – | weggelassen (Rendern) |
| Rendereinstellungen speichern <sub>`render_settings_set`</sub> | – | weggelassen (Rendern) |
| Render-Aufnahme duplizieren <sub>`render_shot_duplicate`</sub> | – | weggelassen (Rendern) |
| Render-Aufnahme entfernen <sub>`render_shot_remove`</sub> | – | weggelassen (Rendern) |
| Render-Aufnahme umbenennen <sub>`render_shot_rename`</sub> | – | weggelassen (Rendern) |
| Physischen Renderhintergrund speichern <sub>`render_stage_backdrop`</sub> | – | weggelassen (Rendern) |
| Remove Render Stage <sub>`render_stage_clear`</sub> | – | weggelassen (Rendern) |
| Save Render Ground <sub>`render_stage_ground`</sub> | – | weggelassen (Rendern) |
| Bild rendern <sub>`render_start`</sub> | – | vorhanden – Rendern (fotorealistisches PNG) |
| Renderfortschritt <sub>`render_status`</sub> | – | vorhanden – Rendern (fotorealistisches PNG) |

### Stand E1

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|

### Oberfläche L1–L6

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|

### Stand E2

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|

### Stand E3

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|

### Stand E4

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|

### Stand E5

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|

### Stand E6

| Befehl | Was er tut (SolidCraft-Hilfe) | Stand PBCAD |
|---|---|---|
## 8. Alle Befehlsoptionen


#### appearance

- **AppearanceAssign** – Give bodies, faces or components a look, or clear theirs: a library appearance or a starter recipe by `appearance`, or a `color`.
  - `bodies` Bodies, by name (a placed copy's name, `KB (K:2)`, means the body it shows).
  - `faces` Faces, by a point on each, at most 10000.
  - `body` The body the `faces` points are on, for points that don't name one.
  - `components` Components, by name or id, or a placement's name (`K:2`).
  - `appearance` A library appearance's name or a starter recipe's name or stable `starter.*` id (see `appearance.library`).
  - `color` The colour, `"#rrggbb"` or `[r, g, b]` (0–255); with `appearance`, it replaces the recipe's colour.
  - `opacity` 0 (clear) to 1 (opaque).
  - `name` A label for a copied look: needs `color`, not with `appearance`.
  - `pbr` The opaque PBR response (needs `color` or `appearance`, and opacity 1).
- **AppearanceLibrary** – `appearance.library` takes no parameters.
  - `appearances` 
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.
- **AppearanceList** – `appearance.list` takes one parameter, `body`, optional.
  - `body` A body (or a placed copy's name, `KB (K:2)`, for the body it shows): the reply adds `body`, its resolved look and its faces' looks.

#### bom

- **Bom** – The bill of materials below a component: its parts, counted through subassemblies, by part number.
  - `component` The component, by id or name (default: the design).
  - `levels` `flat` (the default): every part at any depth, counted through its subassemblies; `top`: the component's direct children, subassemblies as one row each.
  - `group_by` 
  - `group_children` A component with a part number is one row, the parts placed inside it listed under it as `children` rather than as rows of their own (default false).
  - `path` Also write the bill of materials to this `.csv` or `.json` file (children as items 1.1, 1.2…).
  - `format` With `path`: `csv` or `json`, in any case (default: from the path's extension).

#### browser

- **Repair** – Repair a part the modelling kernel refuses, or an open part that should be a solid: faces SMLib refuses on their own are rebuilt on their own surfaces (geometry unchanged), free edges that pair up within `gap` are sewn (each sewn edge carries its own gap as its tolerance; the body's and the other edges' stay), and with `patch_holes` the loops of free edges left (missing faces) are patched and sewn in.
  - `body` The part (body name).
  - `gap` The widest gap between two free edges that is sewn, more than 0 and at most 1 mm.
  - `patch_holes` Patch each loop of free edges no pair explains (a missing face) and sew the patch in: the plane of the faces around it where they are all that plane, else a patch tangent to them (G1).
  - `common` 
- **DocumentUnits** – Change the units the design shows lengths in, and reads a bare number in.
  - `units` The design's new units: mm, cm, m, in or ft.

#### clearance

- **Clearance** – Find the solid bodies that overlap, and those closer than `clearance`, in world placement.
  - `bodies` The bodies to check (default: every solid body but those in `against`).
  - `against` Only pairs with one body in `bodies` and the other here.
  - `min_volume` Smaller overlaps count as contact, in mm³ (default 0.01).
  - `clearance` Report pairs closer than this, in mm: 0 to 1 000 000 (default 0).
  - `tolerance` A gap below this is contact, 0, in mm: 0 to 1 (default 1e-6).
  - `nearest` Each body of `bodies` gets its this many nearest others, 0 to 1000 (default 0); a fraction is rounded down.
  - `skip_within` 

#### compare

- **Compare** – Compare two bodies laid over each other, in world placement: measure both, sample each surface's distance to the other, and find, measure and (with `color`) colour the places where only one of them has material.
  - `a` The first body, by name.
  - `b` The second body, by name.
  - `tolerance` Surfaces closer than this agree, in mm: 0.001 to 10 (default 0.01).
  - `spacing` The largest piece of a face sampled as one point, in mm: 0.01 to 1000 (default 0.5), coarser for a body that would need more than `max_points` samples.
  - `max_points` The most samples per body: 10 000 to 50 million (default 8 million).
  - `max_regions` The most regions measured: 1 to 1000 (default 50); more are counted in `unlisted_regions`.
  - `color` 

#### component

- **EditInPlace** – Edit a linked component's design in place.
  - `component` The linked component, by id or name.
  - `path` The placement to edit it at, as occurrence ids from the top of the assembly down (`component.list`).
- **FinishEdit** – Finish editing a linked component's design in place.
  - `queued` In the app window, asked while the part's agent is in its turn: the edit finishes once the turn ends (Stop cancels it).
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.
- **OccurrenceAlign** – Align one or more component occurrence placements in world coordinates without modifying shared component geometry.
  - `occurrence` A single occurrence to align, by id or name (optionally disambiguated by `path`).
  - `occurrences` One or more occurrences to align together, by id or name.
  - `path` Exact placement path `[occ_id, ...]` of a single occurrence.
  - `paths` Exact placement paths `[[occ_id, ...], ...]` of one or more occurrences to align together.
  - `from` Source point (`[x, y, z]`, `"origin"`, or `{snap, at}`).
  - `from_face` Point on a planar source face in world coordinates (turns to meet `to_face` or `to_plane`).
  - `from_plane` Source plane (`XY`, `XZ`, `YZ`, a construction plane, or `{origin, normal}`).
  - `to` Destination point (`[x, y, z]`, `"origin"`, or `{snap, at}`).
  - `to_face` Point on a planar destination face in world coordinates.
  - `to_plane` Destination plane (`XY`, `XZ`, `YZ`, a construction plane, or `{origin, normal}`).
  - `flip` Flip face/plane normal alignment so normals point the same way instead of meeting opposite.
  - `capture` Capture the aligned position immediately (default: `true`); `false` leaves it pending.
  - `move_grounded` Allow aligning a grounded occurrence while keeping it grounded (default: `false`).
- **MoveFeatures** – Move timeline features (sketches too) into a component.
  - `features` The features to move, by id or name.
  - `component` The component they go to, by id or name.
- **MoveSketchesToParts** – Move sketches to the part whose face they are drawn on (`component.move_sketches.to_parts`), in one undo step.
  - `sketches` The sketches to look at, by id or name.
- **ReparentItems** – Move placements, timeline features and bodies into a component in one undo step, all or nothing.
  - `occurrences` The placements to move.
  - `features` The features to move, by id or name.
  - `bodies` The bodies to move, by name.
  - `component` The component they go to, by id or name.
  - `component_path` The placement of that component to place them by, as occurrence ids from the top.

#### config

- **ConfigTable** – The configuration table: its columns, rows and rules, the active row, and whether the design still matches it.
  - `row` The row, by name.
- **ConfigRow** – Switch to a configuration row: its parameter values, suppressions, materials and appearances are set, and its rules run.
  - `row` The row, by name.
- **ConfigConfigure** – Add columns to the configuration table: parameters, feature suppressions, and bodies' and components' materials and looks, each filled in every row with the design's current value.
  - `params` Parameters to configure, by name, as `parameters.list` gives them.
  - `features` Features whose suppression to configure, by name.
  - `materials` Bodies whose material to configure, by name.
  - `appearances` Bodies whose look to configure, by name.
  - `component_appearances` Components whose look to configure: each a component's name or id, or an occurrence's name (its component).
  - `face_appearances` Faces whose look to configure, each picked as `face_appearance` is for `config.column` (not by a column key).
- **ConfigColumn** – Add a column to the configuration table, or delete one: give exactly one of `param`, `feature`, `material`, `appearance`, `component_appearance` and `face_appearance`.
  - `param` A parameter, by name: its value in each row.
  - `feature` A feature, by name: whether each row suppresses it.
  - `material` A body, by name: its material in each row.
  - `appearance` A body, by name: its look in each row.
  - `component_appearance` A component, by name or id, or an occurrence by name (its component): its look in each row.
  - `face_appearance` 
  - `delete` Delete the column instead of adding it.
- **ConfigRowEdit** – Add a row to the configuration table, change one, rename it or delete it.
  - `name` The row, by name: 1 to 128 bytes once spaces at either end are dropped.
  - `from` A row to copy the cells of, by name.
  - `values` 
  - `rename` A new name for the row, which must exist: 1 to 128 bytes once spaces at either end are dropped, not another row's.
  - `delete` Delete the row instead; `from`, `values` and `rename` are then not used.
- **ConfigRule** – Add, replace, delete or move the configuration table's rules, which drive parameters and suppressions from conditions, in the order they run.
  - `rule` A rule to add, or to replace the rule with its id.
  - `rules` Without `rule`: rules to add or replace together, the rows then checked once with all of them in place (rules that only hold together can be added).
  - `id` Without `rule` or `rules`: the rule to delete or move, by id.
  - `delete` With `id`: delete the rule.
  - `index` With `id` and without `delete`: where to move the rule, from 0 (it runs first); less than the number of rules.

#### construct

- **AxisThroughCylinder** – Add a construction axis along the axis of a cylinder, cone or torus face, or of a circular edge.
  - `face` The face or circular edge whose axis it is.
  - `common` 
- **AxisNormalToFace** – Add a construction axis square to a face, through a point.
  - `face` The face: a plane, or a planar, cylindrical, conical, spherical or toroidal face.
  - `point` The point the axis goes through, square to the face where the face is nearest it: a vertex, a construction point, a sketch point, a fixed point, or the centre of a circular edge, a sketch circle or arc, or a spherical or toroidal face.
  - `common` 
- **AxisTwoPlanes** – Add a construction axis where two planes meet.
  - `a` The first plane or planar face.
  - `b` The second plane or planar face, not parallel to the first.
  - `common` 
- **AxisTwoPoints** – Add a construction axis through two points, from `a` towards `b`.
  - `a` The first point: a vertex, a construction point, a sketch point, a fixed point, or the centre of a circular edge, a sketch circle or arc, or a spherical or toroidal face.
  - `b` The second point, somewhere else.
  - `common` 
- **AxisEdge** – Add a construction axis along a straight edge or line.
  - `edge` The line: a straight edge, a sketch line, X, Y, Z or a construction axis (a cylinder, cone or torus face gives its axis).
  - `common` 
- **PointVertex** – Add a construction point at a vertex or point.
  - `point` The point: a vertex, a construction point, a sketch point, a fixed point, or the centre of a circular edge, a sketch circle or arc, or a spherical or toroidal face.
  - `common` 
- **PointTwoEdges** – Add a construction point where two lines meet, or midway between their closest points.
  - `a` The first line: a straight edge, a sketch line, X, Y, Z or a construction axis (a circular edge or a cylinder, cone or torus face gives its axis).
  - `b` The second line, not parallel to the first.
  - `common` 
- **PointThreePlanes** – Add a construction point where three planes meet.
  - `a` The first plane or planar face.
  - `b` The second plane or planar face, not parallel to the first.
  - `c` The third plane or planar face, not parallel to the line where the first two meet.
  - `common` 
- **PointCenter** – Add a construction point at the centre of a circle, sphere or torus.
  - `of` A circular edge, a sketch circle or arc, or a spherical or toroidal face.
  - `common` 
- **PointEdgePlane** – Add a construction point where a line meets a plane.
  - `edge` The line: a straight edge, a sketch line, X, Y, Z or a construction axis (a circular edge or a cylinder, cone or torus face gives its axis), not parallel to the plane.
  - `plane` The plane or planar face.
  - `common` 
- **PointAlongPath** – Add a construction point part way along a path.
  - `path` The path: an edge or a sketch curve, with some length.
  - `t` How far along the path, as a fraction of its length: 0 at its start, 1 at its end (a value outside is taken as the nearer end).
  - `common` 
- **Midplane** – Add a construction plane halfway between two planes: midway between parallel ones, else through the line where they meet, halving the angle between them.
  - `a` The first plane or planar face; between parallel planes, the new plane faces as this one.
  - `b` The second plane or planar face.
  - `common` 
- **PlaneTwoEdges** – Add a construction plane through two lines in one plane.
  - `a` The first line: a straight edge, a sketch line, X, Y, Z or a construction axis (a circular edge or a cylinder, cone or torus face gives its axis).
  - `b` The second line, in one plane with the first but not on the same line.
  - `common` 
- **PlaneAxisPoint** – Add a construction plane containing an axis and a point off that axis.
  - `axis` An origin axis, construction axis, straight edge or sketch line reference.
  - `point` A vertex, sketch point, construction point or fixed point, not on the axis.
  - `common` 
- **PlaneThreePoints** – Add a construction plane through three points.
  - `a` The first point (the plane's origin): a vertex, a construction point, a sketch point, a fixed point, or the centre of a circular edge, a sketch circle or arc, or a spherical or toroidal face.
  - `b` The second point.
  - `c` The third point, not on the line through the first two.
  - `common` 
- **PlaneTangent** – Add a construction plane that touches a face at a point.
  - `face` The face: a plane, or a planar, cylindrical, conical, spherical or toroidal face.
  - `at` Where the plane touches the face, in mm: the point of the face nearest it.
  - `reference` A plane or planar face to line the plane up with: it touches where the face turns towards the reference, parallel to it, on the side of `at`.
  - `angle` With `reference`, how far the plane is turned from it about the face's axis.
  - `common` 
- **PlaneAlongPath** – Add a construction plane square to a path, part way along it.
  - `path` The path: an edge or a sketch curve, with some length.
  - `t` How far along the path, as a fraction of its length: 0 at its start, 1 at its end (a value outside is taken as the nearer end).
  - `common` 
- **PlanePerpendicular** – Add a construction plane that holds a line and is square to a plane.
  - `plane` The plane or planar face the new plane is square to.
  - `line` The line it holds: a straight edge, a sketch line, X, Y, Z or a construction axis (a circular edge or a cylinder, cone or torus face gives its axis), not square to `plane`.
  - `common` 

#### diagnostics

- **CrashReports** – List this computer's crash reports, newest first.
  - `limit` How many reports to list, newest first.
- **CrashReport** – Read one crash report: the whole report as it was saved, with the paths of its files.
  - `id` The report's id, as `diagnostics.crash_reports` lists it.
- **CrashReportsClear** – Delete one crash report, or all of them.
  - `id` The report to delete, as `diagnostics.crash_reports` lists it.
- **CrashTest** – Check that crash reports work, by crashing on purpose.
  - `mode` What to break.
- **Profile** – What `diagnostics.profile` should do besides reporting.
  - `enabled` Start (`true`) or stop (`false`) recording, after the report is taken.
  - `reset` Forget what was recorded, after the report is taken.
  - `top` How many rows to return, the most self time first (default 20; 0: all of them).
  - `trace` Write the recorded spans here as a Chrome trace-event file (chrome://tracing, Perfetto).
- **Validation** – Read, or set, when SMLib's full check runs on the features computed from now on.
  - `mode` The mode to compute features under from now on.

#### edit

- **Assistant** – Assistant visibility is UI-owned and takes no parameters.
- **Repeat** – `edit.repeat` takes no parameters: it starts the last tool with its defaults.
- **TimelinePlay** – 
  - `action` Omit to toggle; explicit play/stop requests are idempotent.
- **Undo** – `edit.undo` takes no parameters: it takes back the last step of the undo history.
  - `undone` The name of the step taken back, as the undo history labels it.
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.
- **Redo** – `edit.redo` takes no parameters: it does again the last step undone.
  - `redone` The name of the step done again, as the undo history labels it.
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.
- **Checkpoint** – `edit.checkpoint` takes no parameters: it remembers the design, the active sketch and the undo history, to go back to with `edit.restore_checkpoint`.
  - `checkpoint` The checkpoint's id.
  - `restored` `edit.restore_checkpoint` only: true when the design went back to it, false when it was dropped (`forget`).
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.
- **RestoreCheckpoint** – Go back to a checkpoint, undo history included; or, with `forget`, drop it without going back.
  - `checkpoint` The checkpoint, by the id `edit.checkpoint` returned.
  - `forget` True to drop the checkpoint (and every later one) without going back.

#### features

- **Box** – Add a box primitive.
  - `length` Size along X.
  - `width` Size along Y.
  - `height` Size along Z.
  - `corner` The box's minimum corner.
  - `center` The box's centre, instead of `corner`.
  - `operation` How the box combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on.
  - `touching` What a join makes of pieces that share no face.
  - `participants` The bodies a join, cut or intersect works on, in place of `targets`.
  - `name` The feature's name in the timeline.
  - `body_name` The new body's name.
  - `body_names` Names for the new bodies, in order.
- **Extrude** – Extrude sketch profiles (or a planar body face) into a solid.
  - `distance` How far: the length one way; with `direction: symmetric`, the total thickness (per side with `convention: legacy_per_side`); with `distance2`, the first side's length.
  - `sketch` The sketch to extrude, by id or name.
  - `profiles` Which of the sketch's profiles to extrude.
  - `exact_regions` Each index or point pick is exactly the region it names.
  - `face` A point on a planar body face to extrude instead of a sketch profile.
  - `faces` Several coplanar faces of one body to extrude together, by a point on each.
  - `face_body` The body whose face to use, where faces of several bodies meet at `face` (or `faces`).
  - `body` With `face`, among placed instances: the body whose placement `face` is read in (read by the engine's frame mapping, before the command runs).
  - `through_all` Extrude through everything in the way.
  - `extent` `"through_all"`, the same as `through_all: true`.
  - `taper` Draft angle of the side walls (positive: outward, so the far end is larger along the extrusion direction; negative: inward, so the far end is smaller).
  - `direction` Which way to extrude.
  - `distance2` Two Sides: a second distance the other way from the first side, which may be `through_all` or `to`; with `direction: negative` the first side goes against the normal and `distance2` along it.
  - `start_offset` Start this far from the sketch plane, along its normal.
  - `convention` How a symmetric distance is read.
  - `to` Extrude up to this face, vertex or point (To Object).
  - `to_offset` How far past `to` to go.
  - `from` Start at this face or point (From Object).
  - `operation` How the extrusion combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on.
  - `touching` What a join makes of pieces that share no face.
  - `participants` The bodies taking part; overrides the default scope.
  - `name` The feature's name in the timeline.
  - `body_name` The new body's name.
  - `body_names` Names for the new bodies, in order.
  - `thin` 
  - `curves` With `thin`: the curves the wall follows.
  - `thickness` With `thin`: the wall's thickness.
  - `side` With `thin`: which side of the curves the wall lies on.
  - `thickness2` With `thin` and `side: two_sides`: the thickness outside.
- **Cylinder** – Add a cylinder primitive.
  - `radius` The radius.
  - `diameter` The diameter, instead of `radius`.
  - `height` The height, along `axis`.
  - `base` The centre of the bottom face.
  - `axis` The direction from the bottom to the top.
  - `references` Up to two straight edges of the face it stands on, each `{edge: [x, y, z], distance: expr}` (as `solid.hole`'s): the base centre goes that far from each edge's line, in the face's plane, and follows the edges.
  - `operation` How the cylinder combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on.
  - `common` 
- **Sphere** – Add a sphere primitive.
  - `radius` The radius.
  - `diameter` The diameter, instead of `radius`.
  - `center` The centre.
  - `operation` How the sphere combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on.
  - `common` 
- **Torus** – Add a torus primitive, around the Z axis.
  - `major` The major radius: from the centre to the middle of the ring.
  - `minor` The minor radius: of the ring's cross-section, above 0 and less than `major`.
  - `center` The centre.
  - `operation` How the torus combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on.
  - `common` 
- **Cone** – Add a cone or truncated cone: the base circle and, `height` along `axis`, the top circle (a point when its radius is 1e-6 mm or less).
  - `radius` The base circle's radius, above 1e-6 mm.
  - `diameter` The base circle's diameter, instead of `radius`.
  - `top_radius` The top circle's radius, 0 or more; up to 1e-6 mm makes a full cone ending in a point.
  - `top_diameter` The top circle's diameter, instead of `top_radius`.
  - `height` The top's distance from the base along `axis`, more than 1e-6 mm either way; a negative height goes the other way.
  - `base` The centre of the base circle.
  - `axis` The direction `height` is measured along: from the base towards the top when `height` is positive.
  - `operation` How the cone combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on.
  - `common` 
- **Pipe** – Add a solid tube along a path of sketch curves.
  - `path_sketch` The sketch holding the path, by id or name.
  - `path` The path's curve ids, in order along the path.
  - `diameter` The tube's outside diameter.
  - `wall` The wall thickness, for a hollow tube: above 0 and less than half `diameter`.
  - `operation` How the pipe combines with existing bodies.
  - `targets` The bodies a join, cut or intersect works on; given, they win over `participants`.
  - `common` 
- **BoundingSolid** – Add a box around bodies, larger by a margin on every side.
  - `bodies` The bodies to enclose (`participants` doesn't change which).
  - `margin` How much larger than the bodies on every side.
  - `common` 
- **Scale** – Scale bodies about a point.
  - `bodies` The bodies to scale.
  - `factor` The same factor in every direction, above 1e-9 and below 1e6.
  - `factors` Different factors along X, Y and Z, each above 1e-9 and below 1e6.
  - `origin` The point that stays where it is, in mm.
  - `name` The feature's name in the timeline.
  - `participants` The bodies taking part, which every feature records; each an existing body or `*`.
- **OffsetPlane** – Add a construction plane parallel to `base`: `offset` away along its normal, or through a point.
  - `base` The plane it is parallel to.
  - `offset` How far from `base`, along its normal (negative: the other way).
  - `through` A point the plane goes through instead: a vertex, a construction point, a sketch point, a fixed point, or the centre of a circular edge, a sketch circle or arc, or a spherical or toroidal face.
  - `common` 
- **PlaneAtAngle** – Add a construction plane: `base` turned by `angle` about an axis.
  - `base` The plane to turn.
  - `axis` The axis it turns about.
  - `angle` How far to turn, counterclockwise looking back along `axis`'s direction.
  - `common` 
- **Fillet** – Round edges of a body: a constant radius by default, or a chord, a curvature-continuous section or a radius varying along each edge (`type`).
  - `edges` The edges to round: a point on each, or `{body, index}`.
  - `radius` The radius; the chord's width with `type: chord`, the equivalent circular setback with `type: curvature`, the start radius with `type: variable` or `spline`.
  - `body` The body whose edges the points pick.
  - `tangent_chain` Round each picked edge's tangent chain with it.
  - `kind` 
  - `radius2` `type: variable`: the radius at the end away from `start`; it or `radius` may be 0, where the round closes to the corner.
  - `start` `type: variable` or `spline`: a point near the end the radius starts from.
  - `mid` `type: variable`: radii between the ends, each `[position, radius]`, the position between 0 and 1 from the start end.
  - `smooth` `type: variable`: smooth instead of straight between the radii.
  - `radii` `type: spline`: the control radii after `radius`.
  - `knots` `type: spline`: the knot vector from 0 to 1, as many knots as all control radii, the degree (1 to 3) and one more.
  - `fit` 
  - `corner` 
  - `setbacks` Corner setbacks: the corner at the vertex nearest each `vertex`, where every edge meeting it is rounded, starts its patch `distance` along each of those edges from the vertex, past where the rounds would meet.
  - `turn` 
  - `common` 

#### file

- **ExportStep** – Export bodies as a STEP file.
  - `path` The file to write.
  - `bodies` The bodies to export, by name.
- **ExportMesh** – Export bodies as a mesh file: binary STL for `file.export_stl`, OBJ for `file.export_obj` (the colours of the bodies go in a material library, `.mtl`, written next to it).
  - `path` The file to write.
  - `bodies` The bodies to export, by name.
  - `quality` How closely the mesh follows curved faces.
- **Export3mf** – Export bodies as a 3MF file, whatever the path's extension.
  - `path` The file to write.
  - `bodies` The bodies to export, by name.
  - `quality` How closely the mesh follows curved faces.
  - `objects` What each object in the file holds.
- **ExportUrdf** – Export the whole assembly as a robot description (URDF), with an STL mesh for each link written next to it (docs/urdf.md).
  - `path` The `.urdf` file to write; the meshes go in its folder.
  - `mesh_prefix` Put before each mesh file name in the URDF, such as `package://robot/meshes/`.
  - `effort` Each joint's effort limit, a positive number.
  - `velocity` Each joint's velocity limit, a positive number.

#### inspect

- **Describe** – Which command to describe.
  - `command` The command's id, such as `solid.extrude`.
- **BodyList** – List a body's edges or faces, with what picks each one.
  - `body` The body, by name.
- **ModelThreads** – List the design's cosmetic threads.
  - `body` The body's name.
  - `edges` Its edges, in the kernel's order.
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.

#### joints

- **EditJoint** – Edit a joint in place.
  - `joint` The joint, by id or name.
  - `a` Side a: a joint origin, as joint.create takes it.
  - `b` Side b: a joint origin, as joint.create takes it.
  - `kind` The joint's type, as joint.create takes it (rigid, revolute, slider, ...).
  - `flip` Whether b's z lies along a's instead of against it, as joint.create's `flip`.
  - `offset` The distance from a's frame to b's along z: a length, or an expression the joint follows.
  - `angle` The turn about that distance: an angle, or an expression the joint follows.
  - `suppressed` Suppress the joint (true) or bring it back (false).
  - `name` The joint's new name.
  - `quiet` Leave out the degrees of freedom and the fixed occurrences in the reply.

#### libraries

- **LibraryInspect** – Read a local library file and check it, without changing the design.
  - `path` The library file (`solidcraft-library/1` or `/2` JSON, at most 4 MiB).
- **LibraryExport** – Write the looks assigned in this design and its own physical materials to a library file.
  - `path` Where to write it: a `.json` file.
  - `id` The library's id, which qualifies each entry's id: lowercase letters, digits, `.`, `_` and `-`, starting with a letter, at most 64.
  - `name` The library's name: 1 to 128 bytes, without surrounding spaces or control characters.
  - `provenance` Where the entries come from, saved with each entry.
  - `overwrite` Replace the file if it exists.
  - `format` The file format.
- **LibraryApply** – Copy one library entry, at an exact revision, into this design in one undo step: an appearance onto bodies, faces or components, or a physical material (assigned to bodies).
  - `path` The library file.
  - `entry` The entry's qualified id, as `library.inspect` lists it (at most 129 bytes).
  - `revision` The entry's revision, as `library.inspect` lists it: the SHA-256 of its content, 64 hex digits.
  - `targets` What to copy it onto.
  - `name` For a physical material: the name to give it in this design (1 to 128 bytes).

#### mass_properties

- **AssemblyMass** – Mass, centre of mass and inertia tensor of every occurrence of the design and of every rigid group (occurrences joined by rigid joints, which move as one body), from each body's material density.
  - `origin` 
  - `x` 
  - `y` 
  - `z` 

#### material_properties

- **ValidateCard** – Check an engineering material card: its numbers' consistency, the isotropic moduli they imply, and the conditions and sources still to review.
  - `card` 
- **DirectionalModulus** – The Young modulus of an engineering material card in one direction, in the card's own material axes.
  - `card` 
  - `direction` 

#### metadata

- **Metadata** – Read the design's properties: its `metadata` object as saved, and SolidCraft's own design properties (project, part number, revision…) as text.
  - `metadata` The design's metadata object as saved, other tools' keys included.
  - `properties` Each of SolidCraft's design properties, by key: its text, or null when it is absent or not text.
- **MetadataSet** – Change design properties in one undo step: `key` and `value`, or `values` for several at once (all or nothing).
  - `key` The property to set: one of SolidCraft's keys (the ones `document.metadata`'s `properties` lists), which take text, or another tool's reverse-DNS key such as `com.example.tool`, which takes an object.
  - `value` The value for `key`: text for SolidCraft's keys, an object for another tool's.
  - `values` Several properties at once, `{key: value, …}`, at most 256 keys, each as `key` and `value` take them.
- **MetadataRemove** – Remove design properties in one undo step: `key`, or `keys` for several.
  - `key` The property to remove.
  - `keys` The properties to remove, at most 256.

#### motion

- **FindLimits** – Find where each value of a joint can go before the parts it moves touch another body.
  - `joint` 
  - `index` Which value (0 for a revolute's angle).
  - `refine` mm: each stop is bisected until no part moves more than this between the last clear value and the touching one (above 0, at most 1000).
  - `step` Between samples, in the value's unit (degrees for angles, mm for distances; above 0).
  - `occurrences` The parts checked against each other.
  - `against` The parts that stay: each of `occurrences` is checked only against these.
  - `contact_sets` Check the pairs of the design's contact sets instead (not with `occurrences`).

#### parameter_sweep

- **ParameterSweep** – Rebuild the design in a copy at each value of a parameter and report what fails, turns over or loses its reference there, against the design as it is.
  - `parameter` The parameter, by name, as `parameters.list` lists it.
  - `values` 
  - `from` The first value of an even sweep (used only with `to`).
  - `to` The last value of an even sweep (used only with `from`).
  - `steps` With `from` and `to`: how many steps between them (default 10), so `steps + 1` values.

#### parts

- **PartsLibrary** – List the standard part families, or one family's sizes with their dimensions (mm).
  - `family` One family, as the list names it (default: every family).
- **PartsInsert** – Insert a standard part as a new component: seated in holes with a rigid joint each (`at`), placed at a point (`point`), or at the origin.
  - `family` The family, as `parts.library` lists it: socket_head_cap_screw, button_head_cap_screw, hex_bolt, hex_nut, washer, set_screw, dowel_pin, bearing, hex_cap_screw_inch, hex_nut_inch, washer_sae or washer_uss.
  - `size` The size, as `parts.library` lists it: `M6`, `608` for a bearing, `1/2-13 UNC` for an inch screw or nut, `1/2` for an inch washer.
  - `length` 
  - `at` 
  - `point` Without `at`: where the part's origin goes, with no joint.
  - `direction` With `point`: the direction the part's +Z turns to (default +Z), a non-zero `[x, y, z]`.
  - `name` The component's name (default: the part's, such as `Socket Head Cap Screw M6x20`).
- **PartsResize** – Change an inserted standard part's size or length, rebuilding it in place; its joints keep it seated.
  - `component` The part's component, by id or name.
  - `size` The new size (default: the part's).
  - `length` 

#### print_face

- **PrintFace** – Mark the flat face of a body at a point as the body's print face, or clear it.
  - `body` The body, by name.
  - `point` A point on the flat face to mark, in mm.

#### render

- **Environment** – 
  - `name` 
  - `set` Complete numerical draft, validated before applying the requested edit.
  - `rotation_deg` Finite degrees within +/- one million; wrapped to [-180, 180).
  - `intensity` Linear intensity: 0..64 for CPU and 0..100 for GPU.

#### render_library

- **LibraryList** – List a page of one catalog of the built-in render library: each resource's id and name, its family, its source's status, and what the app can do with it.
  - `kind` The catalog.
  - `query` Text to look for, ignoring case: in a resource's id, name, family, description, domains, process, intended use and tags, or a physical profile's id, designation, family and material form.
  - `availability` Which resources: `all`, `usable` (the app can use them now), `specification` (described, not usable) or `blocked`.
  - `offset` How many matching resources to skip: at most 4096.
  - `limit` The most resources on the page: 1 to 128.
- **LibraryDescribe** – Describe one resource of a catalog of the built-in render library: the resource as its source holds it, and what the app can do with it.
  - `kind` The catalog, as `render.library.list` takes it.
  - `id` The resource's exact id, as `render.library.list` gives it: 1 to 128 ASCII letters, digits, hyphens or underscores.
- **LibraryTargets** – List a page of the bodies a render would show, with their place in the render scene and their looks, to pick the targets for the library's surfaces.
  - `query` Text to look for in a body's name, ignoring case: at most 256 bytes, without control characters.
  - `offset` How many matching bodies to skip: at most 262 144.
  - `limit` The most bodies on the page: 1 to 128.
- **LibraryPreview** – Read a library surface's original base-colour map, as PNG bytes checked against their recorded hash.
  - `id` The surface's id: `SURF-` and its number, as `render.library.list` gives it.

#### render_lights

- **List** – 
  - `setup` Saved setup name.
  - `settings` Complete RenderSetup snapshot, including an optional typed job.
- **Solo** – 
  - `id` 
  - `solo` 
- **Mute** – 
  - `id` 
  - `mute` 
- **Edit** – 
  - `name` 
  - `id` 
  - `settings` Complete unsaved setup, used as the edit's starting point without losing other controls.
  - `set` 
  - `expected_revision` 

#### render_shots

- **Shot** – Duplicate, rename or remove a saved render shot (a named render setup) in one undo step.
  - `name` The saved shot's exact name.
  - `new_name` The name for the copy or the renamed shot: 1 to 128 bytes, without spaces at either end or control characters, and not in use.
  - `expected_revision` The design's revision when the caller last read it, as `document.inspect` gives it.

#### render_stage

- **Ground** – Fit one ground panel under the visible product, a little below its lowest point, and save it with a render setup in one undo step.
  - `name` The render setup, saved or new.
  - `set` Changes to the setup before the ground is fitted, as `render.settings.set` takes them: an object of at most 13 setup fields.
  - `margin_fraction` How far the ground reaches past the product on each side, as a share of the product's largest size: 0 to 10.
  - `gap_mm` The gap between the product's lowest point and the ground (mm): 0.0001 to 1000.
  - `reflectance_linear` How much light the ground reflects, as linear red, green and blue: each 0 to 1.
  - `replace_stage` Replace a stage the setup already has.
- **Backdrop** – Fit a floor and a wall, or a curved cyclorama of 24 flat strips, behind the visible product, facing the setup's camera, and save it with the render setup in one undo step.
  - `name` The render setup, saved or new.
  - `set` Changes to the setup before the backdrop is fitted, as `render.settings.set` takes them: an object of at most 13 setup fields.
  - `kind` 
  - `reflectance_linear` How much light the panels reflect, as linear red, green and blue: each 0 to 1.
  - `replace_stage` Replace a stage the setup already has.
  - `expected_revision` The design's revision when the caller last read it, as `document.inspect` gives it.
- **Clear** – Remove the stage from a render setup in one undo step.
  - `name` The render setup, saved or new.
  - `set` Changes to the setup made with the removal, as `render.settings.set` takes them: an object of at most 13 setup fields.

#### render_ui

- **Batch** – 
  - `request` Optional render.start request.

#### section

- **Section** – 
  - `plane` Required unless clearing.
  - `offset` Signed distance along the original plane normal, in design units or an expression.
  - `at` World coordinate on a named plane's normal axis; mutually exclusive with offset.
  - `flip` 
  - `hatch` 
  - `clear` 

#### sheet

- **Flange** – Add a sheet metal flange: a base flange from sketch profiles, a contour flange along an open chain of sketch lines, or edge flanges on a sheet's edges.
  - `sketch` Base and contour: the sketch, by id or name.
  - `profiles` Base: which of the sketch's profiles become the sheet.
  - `rule` Base and contour: the sheet metal rule, by name.
  - `flip` Base: the thickness goes to the other side of the sketch plane.
  - `curves` Contour: the open chain's lines (curve ids; arcs aren't supported yet), 1 to 1000.
  - `distance` Contour: how far the flange runs from the sketch plane, positive.
  - `reverse` Contour: the flange runs from the sketch plane the other way.
  - `edges` Edge: the edges that get a flange.
  - `height` Edge: each flange's height, along the flange to its far edge, from where `height_from` says (an edge's own `height` replaces it).
  - `height_from` Edge: where the height is measured from: the outer virtual sharp (outer), the inner virtual sharp (inner), or past 90° the line square to the flange touching the bend's outside (tangent; up to 90° the outer sharp).
  - `angle` Edge: the bend angle, more than 0 and at most 180° (an edge's own `angle` replaces it).
  - `radius` Edge: the inner bend radius.
  - `position` Edge: where the bend starts: inside (the outer virtual sharp on the edge), outside or bend_outside (the bend starting at the edge), middle (half-way), material_outside (the inner virtual sharp on the edge) or tangent (the bend's outer face tangent to the edge's face; below 90° the bend's end on that face).
  - `body` Edge: the sheet metal body.
  - `corner_relief_shape` Edge: the shape of the relief cut where these flanges meet at a corner, in place of the rule's.
  - `corner_relief` Edge: the size across of a round or rectangular corner relief, in place of the rule's.
  - `then` Edge: further bends, each a flange on the far edge of the one before (at most 16).
  - `common` 
- **Perforate** – Add a field of round perforations over a whole flat sheet, or inside a sketch's outline: holes in the flat pattern, the DXF (layer PERFORATION) and the measured volume, not cut into the solid.
  - `diameter` The holes' diameter, more than 0.
  - `pitch` The distance between hole centres, more than the diameter.
  - `margin` How far the holes stay clear of the sheet's edges, cut-outs and bends, and of the outline, at least 0.
  - `pattern` How the holes are laid out.
  - `body` The sheet metal body.
  - `sketch` The field's outline: a sketch, by id or name, on a face of the sheet (or on the flat sheet while it is unfolded).
  - `profiles` Which of the outline sketch's profiles bound the field.
  - `common` 
- **Hem** – Add hems: the sheet folded back on itself along edges.
  - `edges` The edges to hem.
  - `length` The hem's length, to its outer face.
  - `gap` The gap inside the hem (its inner radius).
  - `flip` Hem to the other side.
  - `body` The sheet metal body.
  - `common` 
- **Fold** – Fold a sheet along a line on its top or bottom face: a sketch line (followed when the sketch changes) or two points.
  - `points` The fold line's two ends, instead of `sketch` and `curve`.
  - `sketch` The sketch holding the fold line, by id or name.
  - `curve` The fold line: a line of `sketch`, by id.
  - `angle` The bend angle.
  - `radius` The inner bend radius.
  - `position` Where the line sits in the bend zone: its centre (centerline), its start or end, from the side that stays, or the mould line (mould: where the outer faces meet).
  - `fixed` A point on the side that stays, on the sheet.
  - `flip` Fold the other way.
  - `body` The sheet metal body.
  - `common` 
- **Unfold** – Unfold every bend of a sheet (`sheet.unfold`), or fold an unfolded sheet back (`sheet.refold`).
  - `body` The sheet metal body.
  - `common` 
- **Convert** – Turn a body into sheet metal.
  - `body` The body to convert.
  - `face` Its large flat face (a plate), or the face that stays put (with `bends`).
  - `bends` The sharp edges that become bends of the rule's radius at their virtual sharp.
  - `rule` The sheet metal rule, by name.
  - `common` 
- **Rules** – List the design's sheet metal rules (the built-in steel rule if none are saved).
  - `name` The rule's name (trimmed, nonempty, at most 128 bytes).
  - `thickness` Thickness, more than 0 and less than 10000 mm.
  - `k_factor` Neutral-axis fraction, from 0 to 1.
  - `bend_radius` Inner bend radius, nonnegative.
  - `relief_width` Bend relief width.
  - `relief_depth` Bend relief depth.
  - `corner_relief` Corner relief size across.
  - `corner_relief_shape` Corner relief shape.
  - `hem_gap` Inner radius of flat hems.
  - `gap` Gap between meeting flanges.
  - `angle_display` How DXF bend notes show angles: bend or included, ignoring case and surrounding blanks.
  - `active` Make this the active rule.
  - `delete` Delete the named saved rule instead of editing it.
- **ManageRules** – Create or edit a sheet metal rule, activate it, or delete it.
  - `name` The rule's name (trimmed, nonempty, at most 128 bytes).
  - `thickness` Thickness, more than 0 and less than 10000 mm.
  - `k_factor` Neutral-axis fraction, from 0 to 1.
  - `bend_radius` Inner bend radius, nonnegative.
  - `relief_width` Bend relief width.
  - `relief_depth` Bend relief depth.
  - `corner_relief` Corner relief size across.
  - `corner_relief_shape` Corner relief shape.
  - `hem_gap` Inner radius of flat hems.
  - `gap` Gap between meeting flanges.
  - `angle_display` How DXF bend notes show angles: bend or included, ignoring case and surrounding blanks.
  - `active` Make this the active rule.
  - `delete` Delete the named saved rule instead of editing it.

#### sketch

- **Edit** – 
  - `sketch` 
  - `restore_marker` When present, temporarily roll to this sketch and restore this position when the edit ends.
- **Exit** – 
  - `restore_marker` Restore the temporary editor marker (default true).

#### sketch_constraints

- **ToggleDiameter** – Switch a circle's or an arc's dimension between its radius and its diameter.
  - `constraint` The radius or diameter dimension's constraint id.
  - `diameter` `true` for a diameter, `false` for a radius (default: the other one).
  - `sketch` The sketch (default: the one being edited).

#### sketch_create

- **ConstructionLine** – Create a reference line in the active sketch: infinite, or a segment of a given length.
  - `mode` The construction method.
  - `at` Point to pass through; for tangent_at it selects a contact on the curve.
  - `through` Second point of a two-point construction line.
  - `near` Point used to select the closest solution when several exist; for a line with a `length`, the side of `at` it runs towards.
  - `solution` Zero-based index in the deterministic list of solutions.
  - `curve` A reference line for parallel and perpendicular constructions.
  - `curve2` Second reference curve for a common tangent or an angle bisector.
  - `alternate` Choose the other tangent when two solutions exist.
  - `angle` Direction measured counter-clockwise from sketch X, in degrees.
  - `length` A segment of this length from `at` instead of an infinite line, held by a length dimension.
  - `construction` `false` makes a line with a `length` a normal sketch line, ready for a profile, instead of construction geometry (default `true`).
  - `sketch` The sketch (default: the one being edited).
- **SplineReverse** – Reverse a spline's direction: its last point becomes its first, and the curve runs the other way along the same path.
  - `curve` The spline's curve id.
  - `sketch` The sketch (default: the one being edited).
- **SplineRemovePoint** – Take one point out of a spline: it runs through (or over) its other points only, and the point goes with the constraints on it unless another curve uses it.
  - `curve` The spline's curve id.
  - `point` One of the spline's points: a point id, or the curve's `start` or `end` (`s1.end`).
  - `sketch` The sketch (default: the one being edited).

#### sketch_ends

- **LooseEnds** – The ends of a sketch's profile curves (not construction, projected or text curves) that can make a profile fail.
  - `sketch` 
- **TieLooseEnds** – Tie each untied end to what it touches: coincident with another curve's end, or on another curve.
  - `sketch` 
  - `points` The untied ends to tie, by point id (default: every untied end).

#### sketch_equation

- **EquationCurve** – Draw a curve from formulas: x(t) and y(t) over a range of t, or y = f(x) over a range of x.
  - `x` x(t), a formula of t.
  - `y` y(t), a formula of t; or f(x), a formula of x, with `explicit: true`.
  - `explicit` The explicit form, y = f(x): `y` is a formula of x and `x` is left out.
  - `start` Where the variable starts: a number, an angle ("360 deg" is 2·pi) or a length (in the design's unit).
  - `end` Where the variable ends, as `start`.
  - `tolerance` How far (mm) the curve may stray from its formulas.
  - `variable_unit` What the variable is in the formulas.
  - `construction` Make it construction geometry.
  - `sketch` The sketch (default: the one being edited).
- **EquationEdit** – Change an equation curve's formulas, range or tolerance.
  - `curve` The equation curve.
  - `x` x(t).
  - `y` y(t), or f(x) for an explicit curve.
  - `explicit` The explicit form, y = f(x).
  - `start` Where the variable starts.
  - `end` Where the variable ends.
  - `tolerance` How far (mm) the curve may stray from its formulas.
  - `variable_unit` What the variable is in the formulas.
  - `sketch` The sketch (default: the one being edited).

#### sketch_inspect

- **CurvatureComb** – Curvature combs: teeth along each curve, edge or face isocurve, each as long as the curvature there times `scale`, standing out on the convex side.
  - `curves` Sketch curve ids (the first 1000 are used).
  - `sketch` The sketch the curves are in (default: the one being edited).
  - `edges` 
  - `faces` 
  - `count` With `faces`: how many isoparametric curves each way (default 4; 1 to 50).
  - `density` Teeth per curve (default 40; 2 to 2000).
  - `scale` Tooth length per unit of curvature (mm²).
  - `length` A multiplier on the automatic scale (default 1; 0.01 to 100).
  - `add` Keep the combs shown and add these, every comb again at one scale.
  - `clear` Turn the analysis off.
- **MinimumRadius** – The smallest radius of curvature of each sketch curve, edge or face, and where it is.
  - `curves` Sketch curve ids (the first 1000 are used).
  - `sketch` The sketch the curves are in (default: the one being edited).
  - `edges` 
  - `faces` 
- **Isocurve** – The isoparametric curves of faces, u = const and v = const of each face's surface, cut to its trims; `faces` unless `clear`.
  - `faces` 
  - `count` How many curves each way (default 8; 1 to 100).
  - `add` Keep the faces already shown.
  - `clear` Turn the analysis off.
- **CenterOfMass** – The centre of mass of bodies, at uniform density, each and all together, where the bodies are placed in the assembly.
  - `bodies` The bodies, by name (default: all).

#### surface_analysis

- **Analysis** – Say which view analysis is on (zebra, draft, curvature map, environment map, accessibility, continuity, isocurves or curvature combs: one at a time), or turn it off.
  - `off` Turn the view analysis on now off.
- **Zebra** – 
  - `stripes` Stripe frequency across the view, including fractional values.
  - `clear` 
- **Draft** – 
  - `pull` Nonzero pull direction.
  - `angle` Threshold in degrees, 0 inclusive to 90 exclusive.
  - `clear` 
- **Environment** – 
  - `clear` 
- **Accessibility** – 
  - `direction` Nonzero direction the tool comes from.
  - `clear` 
- **Curvature** – 
  - `radius` Radius in mm shown red, greater than 1e-6 and less than 1e9.
  - `clear` 
- **Continuity** – 
  - `body` Body name; otherwise visible bodies.
  - `edges` At most 512 edge indices or points.
  - `samples` Integer stations per edge, 3…257.
  - `gap_tolerance_mm` Positional tolerance in mm, 0…1e9 exclusive.
  - `angle_tolerance_deg` Normal angle tolerance in degrees.
  - `curvature_tolerance_per_mm` Curvature tolerance in inverse mm.
  - `curvature_change_tolerance_per_mm2` Tolerance on the jump of the curvature's change across the seam (G3) in inverse mm².
  - `curvature_change_rate_tolerance_per_mm3` Tolerance on the jump of that change's rate (G4) in inverse mm³.
  - `add` Preserve other measured seams, replacing only matching body/edge records.
  - `clear` 

#### surface_boundary

- **Boundary** – A surface through curves: either one patch through a loop of two to four curves of one sketch (`curves`, with `continuity`, `crown` and `samples`), or one surface through a curve network (`u`, with `v` and `operation`).
  - `sketch` The sketch the loop's curves, or a network's bare curve ids, are in (default: the one being edited).
  - `curves` The loop: 2 to 4 sketch curve ids in loop order, each ending where the next begins and the last where the first does.
  - `continuity` 
  - `crown` With two curves: how full the middle is, without touching a boundary, -0.9 to 3 (default 0).
  - `samples` Stations per boundary: a whole number from 8 to 512 (default 25).
  - `u` 
  - `v` 
  - `operation` A network's: `new` (the default) or `join`, which sews the surface into the body of its first edge curve, a solid when it closes the gap.
  - `common` 

#### surface_match

- **MatchSurface** – Rebuild one face of a surface body so that its boundary nearest a picked edge chain of another body lies on that chain and repeats that body's shape there up to `order`, while the opposite boundary keeps its place.
  - `body` The surface body whose face is rebuilt, by name.
  - `faces` 
  - `target` The body the seam must meet, by name.
  - `edges` 
  - `order` How closely the seam follows the target: `g1` (tangent), `g2` (curvature, the default) or `g3`, in any case.
  - `name` The feature's name in the timeline.
  - `participants` The bodies taking part, which every feature records; each an existing body or `*`.

#### ui_prefs

- **Prefs** – 
  - `theme_options` 
  - `settings` 

#### view_navigation

- **StatusItems** – Empty input for the read-only viewport effect query.
  - `enabled` True shows the readout, false hides it.
- **AngleReadout** – Show or hide the View angles readout under the orientation gizmo (#6032): the view's pitch, yaw and roll in degrees (the angles of `view.apply`'s camera, which takes them in radians) and Ortho or Persp for the projection.
  - `enabled` True shows the readout, false hides it.
- **StandardView** – Turn the view to the command's standard orientation (front, back, left, right, top, bottom or isometric), as the view cube does, keeping the camera's target, distance, projection and up axis.
  - `camera` The camera to turn.
- **NormalTo** – Look straight at the first selected planar face or plane, centred on the point it was picked at (a plane: its origin); asked again while already facing it, look from the other side.
  - `camera` The camera to turn.
- **TabStep** – `view.next_tab` and `view.previous_tab` take no parameters (#8565).
  - `step` 1: the tab to the right; -1: the tab to the left.
  - `param_warnings` In the warn parameter-check mode: what the call's parameters got wrong.
- **Navigator** – Set the view navigator at the view's corner: its type, and for the custom one the body it draws, its texture and the controls around it.
  - `style` The navigator: signed axes, the cube, or a custom body (the cube until a body is chosen).
  - `body` A body of the open design for the custom navigator to draw; the app keeps a snapshot of it, so it stays when the design closes.
  - `texture` The custom navigator's colours: the cube's (`themed`) or the body's own appearance and edge colour (`modeled`).
  - `arrows` The cube's orbit and roll arrows around the custom navigator.
  - `home` The cube's Home button beside the custom navigator.
## 9. Alle Einstellungen nach Seite


### Allgemein <sub>prefs/general.rs</sub>

- **Allgemein**
  - Profile, Sprache, Dateien und Updates.
- **Sprache**
- **Oberflächensprache**
- **System**
- **Starten und Speichern**
- **Autospeichern alle**
- **Minuten**
  - Für Organisationen, die Entwürfe auf Dateiservern speichern. Aus: nur erlaubte Server.
- **Entfernen**
- **Dateien in einem bereits laufenden Slicer öffnen**
  - Für Slicer, die Dateien in ein laufendes Fenster laden.
- **Hervorhebung der Auflagefläche**
  - Wie stark die Auflagefläche eines Körpers in der Ansicht eingefärbt und umrandet wird. 0 % zeigt keine Hervorhebung.
- **Updates**
- **Absturzberichte**
- **Absturzberichte öffnen…**
  - Die Berichte bleiben auf diesem Computer. Sie enthalten das Design und die Befehle, mit denen sich das Problem reproduzieren lässt.
- **Maximale Dateigröße zum Öffnen**
  - Die Web-App öffnet STEP- und Importdateien bis 512 MB und Designs bis 256 MB: Ein Browser-Tab kann keine größeren Dateien aufnehmen. In der Desktop-App lassen sich diese Grenzen erhöhen.
- **Größte zu öffnende Datei: STEP und Import**
- **Größte zu öffnende Datei: Entwurf**
- **STEP und Import**
- **Design**
  - Standard: 512 MB und 256 MB; höchstens 16 GB. Das Öffnen einer Datei benötigt ein Mehrfaches ihrer Größe im Arbeitsspeicher. Ein Design mit großem Import benötigt zum Speichern und erneuten Öffnen eventuell eine höhere Grenze für Designdateien.

### Darstellung und Layout <sub>prefs/interface.rs</sub>

- **Erscheinungsbild**
  - Farben, Text und Barrierefreiheit.
- **Ansichtsfenster und Logo**
- **Hintergrund**
- **Verlauf des Designs**
- **Farbe**
- **Farben der 3D-Ansicht**
- **Eigene Designfarben**
- **Hell**
- **Dunkel**
- **Ansichtsfenster**
- **Logo**
- **Designfarben**
- **Akzentfarbe**
- **Skalierung und Text**
- **Oberflächenskalierung**
  - Die Skalierung lässt sich auch mit Strg + / Strg − im Fenster ändern. Bei 100 % sind die Schaltflächen 28 px groß.
- **Schrift**
- **Schriftdatei auswählen…**
- **Die ausgewählte Schriftdatei konnte nicht gelesen werden.**
  - Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich · Ø12,50 mm · 45,0° · 0123456789
  - Zeichen, die in der ausgewählten Schrift fehlen, werden mit der integrierten Ersatzschrift dargestellt. So werden keine Beschriftungen als leere Kästchen angezeigt.
- **Farbsehen**
- **Modus**
  - Ändert die bedeutungstragenden Farben: Skizzenzustände, Achsen, Biegungen, Analysen und Symbole.
- **Layout**
  - Anordnung der Fensterbereiche.
- **Fenster**
- **Arbeitsbereich**
- **Schwebend**
- **Kompakt**
- **Werkzeugleiste**
- **Beschriftungen**
- **Nur Symbole**
- **Menüs**
- **Liste**
- **Große Symbole**
- **Hinweise**
- **Unten rechts**
- **Unten mittig**
- **Statusleiste**
  - Eine schmale Leiste am unteren Fensterrand zeigt, was gerade bearbeitet wird, den Zustand der offenen Skizze in seiner Farbe und die Einheiten der Konstruktion; ein Klick auf die Einheiten ändert sie. Der Zustand der Skizze steht dann nicht mehr in der Ecke der Ansicht.
- **Dialoge und Werkzeuge beim Wechsel zwischen Konstruktionen offen lassen**
  - Jeder Konstruktions-Tab behält seinen offenen Dialog oder sein Werkzeug mit allem, was darin ausgewählt und eingegeben wurde, sowie seinen Werkzeugleisten-Tab. Beim Zurückkehren zur Konstruktion ist alles wieder da. Aus: Ein Wechsel bricht sie ab und zeigt den Tab Modell.
- **Bereiche**
- **Unten**
- **Links**
- **Unter dem Browser**
- **Im Browser**
- **Verlauf**
- **Timeline unten**
- **Linke Seitenleiste**
- **Spalte**
- **Karte**
- **Browser**
- **Undurchsichtig**
- **Durchscheinend**
- **Angezeigt**
- **Bei Mauszeiger**
- **Skizzen im Verlauf**
  - Wenn „Skizzen“ auf „Unter dem zugehörigen Feature“ eingestellt ist, wird jede Skizze im linken Verlauf eine Ebene unter dem ersten daraus erstellten Feature angezeigt, sofern der Bereich breit genug für die Namen ist. Die Timeline unten zeigt weiterhin die Reihenfolge, in der die Elemente erstellt wurden.
- **In Erstellungsreihenfolge**
- **Unter dem zugehörigen Feature**
- **Körperordner**
- **Mehrere**
- **Verlaufswiedergabe**
  - Fügt „Verlauf abspielen“ zwischen „Einen Schritt zurück“ und „Einen Schritt vor“ in die Verlaufssteuerelemente ein. Mit einem Rechtsklick auf die Steuerelemente lässt sich die Schaltfläche auch ein- oder ausblenden.
- **Ursprung und Körper oben**
  - Der Verlauf links oder unter dem Browser beginnt mit dem Körper-Ordner der aktiven Komponente und dem Ursprung, mit Augen und Menüs wie im Browser. Der Verlauf unten bleibt unverändert.
- **Komponenten zu Beginn aufgeklappt**
  - Jede Komponente im Browser ist wie bisher von Anfang an aufgeklappt, statt zugeklappt zu bleiben, bis du sie aufklappst.
- **Auge neben dem Aufklapppfeil**
  - Browserzeilen zeigen ihr Auge zum Ein- und Ausblenden wie bisher neben dem Aufklapppfeil statt in einer Spalte am rechten Zeilenende.
- **Dialoge**
- **Öffnen**
  - Wo Befehlsdialoge öffnen: am Rand der Ansicht angedockt oder in der linken Spalte anstelle von Browser und Verlauf, die beim Schließen des Dialogs wie zuvor zurückkehren.
- **Am Rand der Ansicht**
- **In der linken Spalte**
- **OK und Abbrechen**
- **Oben**
- **Dialogschaltflächen**
- **Auch in der Ansichtsecke**
  - Solange ein Dialog oder eine Skizze geöffnet ist, übernehmen ein Häkchen und ein Kreuz oben rechts in der Ansicht dieselben Funktionen wie „OK“ und „Abbrechen“ des Dialogs. Eine Skizze wird damit beendet oder verworfen. Der Ansichtsnavigator rückt darunter.
- **Werkzeugleisten-Registerkarten**
- **Registerkarte Skizze immer zeigen**
- **Aktive Befehle hervorheben**
- **Suchergebnisse im Menüband zeigen**
- **Angeheftete Befehle aus Menüs ausblenden**
  - Die Registerkarte Skizze bleibt im Menüband direkt nach Modell, auch wenn keine Skizze offen ist. Ihre Zeichenwerkzeuge beginnen dann eine Skizze auf der ausgewählten Ebene oder Fläche oder auf der Ebene, die Sie als Nächstes wählen, und das Werkzeug ist darin bereit.
  - Hebt Befehle im Menüband hervor, solange ihre Effekte eingeschaltet sind. Deaktivieren Sie diese Option, um die bisherige neutrale Darstellung und Befehlshilfe beizubehalten.
  - Steht der Zeiger über einem Ergebnis in Befehle suchen, zeigt das Menüband, wo der Befehl liegt: seine Registerkarte, seine Schaltfläche oder seine Zeile im Aufklappmenü eines Panels. Ein aus der Suche gestarteter Befehl blinkt dort, und ein laufender Befehl aus einem Aufklappmenü markiert sein Panel.
- **Angeheftete Befehle nicht in den Aufklappmenüs wiederholen**
  - Angezeigt lässt den Browser auf dem Bildschirm. Beim Überfahren einblenden blendet ihn aus, bis der Zeiger über seinen Platz oder die schmale Lasche an seinem linken Rand kommt; er bleibt offen, solange der Zeiger darin ist oder ein Menü daraus offen ist.

### Konstruktion <sub>prefs/design.rs</sub>

- **Einheiten für neue Designs**
- **Längen-Dezimalstellen**
- **Winkel-Dezimalstellen**
- **Zeilen der Parameterliste**
- **Namen der Ursprungsebenen**
- **Dateien aus unbekannten Programmen**
- **Konstruktion**
  - Womit neue Konstruktionen beginnen.
- **Einheiten und Genauigkeit**
  - Maximale Anzahl der Parameter, die Pfeil abwärts in einem leeren Ausdrucksfeld auflistet.
- **Zeilen**
  - Pfeil auf/ab und das Mausrad über einem Wertefeld ändern dessen Zahl.
  - Abstand beim Extrudieren, Radius beim Verrunden … als Feld in der Ansicht.
- **Körperprüfung**
- **Nach jedem Schritt**
- **Einmal je Feature**
- **Aus (experimentell)**
- **Vollständige Kernel-Prüfung**
  - Nach jedem Schritt: prüft jeden Sweep, jede Boolesche Operation und jede Rundung. Einmal je Feature: prüft das Ergebnis jedes Features einmal. Aus (experimentell): keine Prüfung.
- **Ausrichtung**
- **Standard**
  - Wenn eine STEP- oder IGES-Datei mit der Z-Achse nach oben geöffnet wird, wird eine Vierteldrehung um die X-Achse angeboten.
- **Importierte Dateien**
  - Wie der Vorschlag erscheint, wenn die Datei kein bekanntes Programm nennt.
- **Fragen**
- **Hinweis**
- **Verknüpfte Designs**
  - Oder zum Bearbeiten einer verknüpften Komponente an Ort und Stelle.
- **Ursprung**

### Werkzeuge <sub>prefs/tools.rs</sub>

- **Werkzeuge**
  - Verhalten der Modellierungswerkzeuge.
- **Erstellen**
- **Bohrung**
  - Die Mitte einer Fläche und die Mittelpunkte ihrer kreisförmigen Kanten.
  - Erneutes Auswählen der Fläche verschiebt die Bohrung, statt sie zu entfernen.
  - Eine Fläche, ein Scheitelpunkt oder eine parallele Ebene stellt die Ausdehnung auf Bis Objekt um.
  - Vereinigung, Neuer Körper oder Schnitt, je nachdem, was das Material berührt.
- **Auflage, Zapfen, Schnappverbindung**
  - Eine Markierung zum Verschieben des Features über das Modell und ein Ring zum Drehen.
- **Baugruppe verschieben**
  - Aus: das bisherige Verschieben-Panel.
- **Schritt nahe der Achse**
- **Schritt fern der Achse**
- **Für den feinen Schritt außerhalb der gestrichelten Führung ziehen.**
- **Grad**
- **Messen und Zeiger**
- **Achsabstände beim Messen**
- **Direkte Bearbeitung**

### Skizze und Auswahl <sub>prefs/sketch.rs</sub>

- **Skizze**
- **Zeichnen, Fangen und Auswählen.**
- **Fangen und Hilfslinien**
- **Hilfslinien für Mittelpunkte und Kantenmitten**
- **Hilfslinien auch von Skizzenpunkten**
- **Am Schnittpunkt zweier Hilfslinien fangen**
- **An anderen Skizzenpunkten ausrichten**
  - Temporäre waagerechte und senkrechte Hilfslinien von überfahrenen Mittelpunkten und Kantenmitten.
  - Während ein Zeichenwerkzeug auf einen Punkt wartet, zeigt das Überfahren eines Linien- oder Bogenendes, einer Rechteckecke oder eines freien Punkts dieselbe temporäre gepunktete Hilfslinie wie ein Mittelpunkt. Aus: nur Mittelpunkte.
  - Fängt den Zeiger beim Zeichnen dort ein, wo sich die Hilfslinien der beiden zuletzt verwendeten Kreismittelpunkte oder Kantenmitten kreuzen. Aus: die Hilfslinien bleiben sichtbar und der Zeiger bewegt sich nicht.
  - Beim Zeichnen richten sich Linien gleichzeitig an Punkten auf beiden Achsen aus.
- **Gedrückt halten, um das Einrasten zu deaktivieren**
  - Gilt beim Zeichnen oder Verschieben eines Skizzenpunkts.
- **Zeichnen**
- **Drücken und Ziehen zeichnet eine Linie**
- **Auf dem letzten Linienpunkt verweilen, um zum Tangentialbogen zu wechseln**
- **Mittelpunktbogen folgt dem Zeiger**
- **Erweiterte Konstruktionslinien-Werkzeuge**
- **Ellipsen mit ihren Achsen zeichnen**
- **Neue Formen vollständig bemaßen**
- **Vom Skizzenursprung aus positionieren**
- **Erneuter Kurzbefehl wechselt den Modus**
- **Klick auf die Schaltfläche des laufenden Werkzeugs beendet es**
- **Flächenkanten in neue Skizzen projizieren**
- **Zuerst Projektionsoptionen abfragen**
  - Im Linienwerkzeug zeichnet Drücken, Ziehen und Loslassen eine Linie vom Drückpunkt bis zum Loslassen, und dort endet sie. Klicks zeichnen weiterhin eine Kette. Aus: Ein Ziehen setzt wie ein Klick einen Punkt dort, wo losgelassen wird.
  - Im Linienwerkzeug: Nach einem Segment vom letzten Punkt der Kette wegbewegen, zurückkehren und den Zeiger still darauf halten. Der nächste Klick beendet dann einen Tangentialbogen, und dieselbe Geste wechselt zurück zu Linien. Aus: Das Verweilen bewirkt nichts.
  - Ein Mittelpunkt-Kreisbogen läuft im oder gegen den Uhrzeigersinn, je nachdem, wie der Mauszeiger um seinen Mittelpunkt geführt wird. Aus: immer gegen den Uhrzeigersinn vom Start aus.
  - Haupt- und Nebenachse als Konstruktionslinien, damit Halbachsen und Achsen bemaßt werden können. Aus: nur die Ellipse, und D darauf ergibt ihren Nebenradius, wohin der Wert auch gezogen wird, gezeichnet und mit R beschriftet wie bisher.
  - Eingegebene Werte und alle Maße, die die Form festlegen.
  - Mit vollständiger Bemaßung.
  - Aus: Das Werkzeug startet erneut.
  - Ein Klick auf die hervorgehobene Schaltfläche des aktiven Skizzenwerkzeugs beendet das Werkzeug, sodass Klicks in die Ansicht wieder auswählen. Aus: Der Klick startet das Werkzeug neu.
  - Ein: Vor dem Projizieren Geometrie oder Körper und die Projektionsverknüpfung auswählen. Aus: Den bisherigen Direktwahl-Ablauf beibehalten.
- **Öffnen und Schließen**
- **Skizzieren auf der Fläche eines Teils aktiviert dieses Teil**
  - Eine Skizze, die auf einer Fläche am Körper einer anderen Komponente begonnen wird, aktiviert zuerst diese Komponente, sodass die Skizze zu ihr gehört und im Browser bei diesem Teil bleibt. Das Teil bleibt danach aktiv. Aus: Die Skizze gehört zur aktiven Komponente.
- **Beim Öffnen einer Skizze auf sie ausrichten**
  - Aus: Beim Erstellen oder Bearbeiten einer Skizze bleibt die Ansicht, wie sie ist. „Ansehen“ richtet die Ansicht bei Bedarf auf die Skizze aus.
- **Ansicht nach dem Beenden einer Skizze**
- **Zur Ansicht davor zurückkehren**
- **Beibehalten**
- **Außer bei Drehung**
  - zurück, wenn nicht gedreht
  - Legt fest, zu welcher Ansicht nach „Skizze beenden“, „Abbrechen“ oder zweimaligem Drücken der Esc-Taste gewechselt wird.
- **Markierungen in der Skizze**
- **Statussymbole**
  - Im Verlauf und im Browser nimmt das Symbol einer Skizze die Farbe ihres Zustands an (unterbestimmt, vollständig bestimmt oder im Konflikt), und ihr Tooltip nennt den Zustand. Aus: Alle Skizzen haben dasselbe Symbol.
- **Konfliktfarbe**
  - Solange die Bedingungen einer Skizze im Konflikt stehen, werden auch die Kurven und Punkte, die eine nicht erfüllte Bedingung hält, in der Konfliktfarbe gezeichnet, nicht nur ihr Symbol oder ihre Bemaßung. Aus: Sie behalten ihre üblichen Farben.
- **Symbole beim Herauszoomen ausblenden**
  - Bindungssymbole verschwinden, wenn die Skizze so weit herausgezoomt ist, dass sie sie überladen würden. Aus: sie behalten bei jedem Zoom eine feste Bildschirmgröße.
- **Auswahl**
- **Klick wählt**
- **Flächen und Kanten**
- **Ganze Körper**
- **Umschalt fügt nur hinzu; Strg / Cmd schaltet die Auswahl um**
  - An: Umschalt fügt Elemente hinzu, Strg/Cmd schaltet um. Aus (Standard): Umschalt und Strg/Cmd schalten beide um.
- **Klicken**
- **Umschalt**
- **Element hinzufügen oder wieder entfernen**
- **Ein Element auswählen**
- **Element hinzufügen**
- **Bei Überlappung bewegliche Punkte bevorzugen**
- **Verdeckte Kanten in der schattierten Ansicht mit verdeckten Kanten auswählen**
  - Kanten durch Flächen auswählen, wenn die schattierte Ansicht mit verdeckten Kanten aktiv ist, auch zum Verrunden. Aus behält das Auswahlverhalten von v0.30.1 bei. Ausgeblendete Körper bleiben ausgeschlossen.
- **Andere auswählen erfasst verdeckte Geometrie**
  - Ein: Verborgene Körper, Skizzen und verdeckte Kanten nahe dem Zeiger einbeziehen. Aus: Die ursprüngliche Liste sichtbarer Geometrie direkt unter dem Zeiger verwenden.
- **Alt / Option schaltet auch an Manipulatorpfeilen das Einrasten ab**
  - An: Alt/Option oder Strg/Cmd auf Extrusions-/Gizmo-Pfeilen deaktiviert das Einrasten von Werten. Aus: nur Strg/Cmd.
- **Bemaßungswerte**
  - Wo der Wert einer Bemaßung eingegeben wird. Ein Fenster hat Pfeile, die ihn schrittweise ändern; das Bemaßungswerkzeug platziert zuerst den Text.
- **In der Ansicht**
- **In einem Fenster**
- **Schritte im Fenster**
- **Was die Pfeile des Fensters, Auf/Ab und das Mausrad zu einer Länge addieren**
- **Was die Pfeile des Fensters, Auf/Ab und das Mausrad zu einem Winkel addieren**

### Navigation <sub>prefs/navigation.rs</sub>

- **Navigation**
  - Maus und Trackpad. Die 3D-Maus hat eine eigene Seite.
- **Ziehen mit der linken Maustaste**
- **Ziehen mit der mittleren Maustaste**
- **Ziehen mit der rechten Maustaste**
- **Ansicht drehen**
- **Ansicht verschieben**
- **Ansicht zoomen**
- **Mausrad**
- **Zoomen zum Mauszeiger hin**
- **Linksklick**
- **Auswählen**
- **Rechtsklick**
- **Kontextmenü · Gedrückt halten, um das Radialmenü zu öffnen**
- **Kontextmenü**
- **Maus**
  - Umschalt gedrückt halten und den Zeiger zum Verschieben bewegen; mit Alt/Option drehen. Keine Maustaste nötig. Vertikales Scrollen zoomt.
  - Mit Strg und gedrückter linker Maustaste auf einer freien Fläche drehen. Leertaste gedrückt halten, um die Ansicht zu verschieben.
  - Halten Sie beim Drehen die Umschalttaste gedrückt, um die Ansicht an einer Achse einrasten zu lassen.
- **Mausbelegung**
  - Aus: rechtes Ziehen lässt die Kamera unverändert, die rechte Maustaste öffnet nur das Kontextmenü. Die Mausbelegung SolidWorks schaltet es beim Auswählen aus.
  - Die rechte Taste halten oder kurz bewegen, um einen Werkzeugring zu öffnen.
- **Umkreisen um**
- **Ansichtszentrum**
- **Unter dem Cursor**
- **Drehstil**
- **Drehen**
  - Maus und 3D-Maus drehen über beide Pole hinweg und behalten die Rollausrichtung bei. Halten Sie beim Ziehen zum Drehen die Umschalttaste gedrückt, um Blickrichtung und Rollausrichtung einrasten zu lassen.
- **Drehteller**
- **Frei**
  - Seitliches Ziehen mit der Maus dreht das Modell um die senkrechte Achse der Welt; Ziehen nach oben und unten neigt es ohne Begrenzung über den Pol hinweg.
- **Mausrad und Trackpad**
- **Zum Cursor zoomen**
- **Zoomrichtung umkehren**
- **Horizontale Schwenkrichtung umkehren**
- **Vertikale Schwenkrichtung umkehren**
- **Sanftes Zoomen mit dem Rad**
- **Zwei-Finger-Scrollen schwenkt**
- **Drehrichtung am Touchpad umkehren**
- **Zoom am Modell stoppen**
  - Touchpad verwendet vertikales Scrollen zum Zoomen. Die Zwei-Finger-Verschiebung bleibt für andere Vorgaben gespeichert.
  - Scrollen mit zwei Fingern verschiebt die Ansicht; bei Fusion dreht Umschalt + zwei Finger die Ansicht. Aus: Scrollen zoomt. Mausrad und Pinch-Geste zoomen; das Daumenrad verschiebt seitlich.
  - 3D-Maus und Geräte-App zoomen zur Oberfläche in der Ansichtsmitte; Zieh-Zoom hält den Punkt am Beginn des Ziehens fest. Aus: Zoom kann durch das Modell gehen. Mausrad und Pinch verwenden separat Zoom zum Mauszeiger
- **Zoomgeschwindigkeit des Mausrads**
- **Mit zwei Fingern zoomen bei gedrückter Taste**
  - Nur diese Taste gedrückt halten, um durch vertikales Scrollen am Zeiger zu zoomen. Aus behält das bisherige Scrollverhalten bei.
- **Ansicht**
- **Achsen**
- **Würfel**
- **Animationsgeschwindigkeit**
- **Größe bei Home und Einpassen**
  - Wie viel der Ansicht das Modell füllt, wenn Home, Einpassen, ein geöffnetes Design oder ein Ansichtswechsel am Navigator es einrahmt, unabhängig von der Einstellung darunter. 100 %: füllt die Ansicht zwischen den Leisten, dem Kompass und der Navigationsleiste.
- **Modell nach einem Ansichtswechsel am Navigator einpassen**
  - Eine Fläche, Ecke oder ein Pfeil des Würfels oder eine Achse des Gizmos blickt auch auf die Mitte des Modells, aus dem einen Abstand, der es von jeder Seite einpasst (seine Hüllkugel). Home nutzt denselben Zoom und dieselbe Mitte, solange dies an ist, sodass danach gewählte Ansichten sich nur drehen. Aus: Die Ansicht dreht sich an Ort und Stelle und behält Ziel und Zoom.
- **Drehpfeile des Ansichtswürfels umkehren**
  - Die Pfeile um den Würfel drehen die Kamera in die Richtung, in die sie zeigen, wie in Fusion und Inventor: Der linke Pfeil zeigt nach rechts und schwenkt die Kamera nach rechts. Aus: Ein Pfeil dreht den Würfel zu der Seite hin, an der er sitzt, sodass der linke Pfeil die Kamera nach links schwenkt. Die gebogenen Rollpfeile sind davon nicht betroffen.

### Navigationsleiste <sub>prefs/navbar.rs</sub>

- **Navigationsleiste**
- **Vorschau als**
- **Entwurf**
- **Rendern**
- **Navigationsleiste anzeigen**
- **Auf Standard zurücksetzen**
- **Entfernen Sie ein Feld, um ein weiteres hinzuzufügen.**
- **Immer sichtbar**
- **Immer**
- **Ausblenden, bis die Maus darüber ist**
- **Symbole und Beschriftungen**
- **Symbole + Beschriftungen**
  - Wählen Sie die Bedienelemente der Leiste am unteren Rand der 3D-Ansicht und ihre Reihenfolge. Ziehen Sie ein Feld, um es zu verschieben, oder aus der Leiste heraus, um es zu entfernen.
- **Symbol und Wert**
- **Nur Symbol**
- **Verfügbar**
  - Eine Trennlinie zwischen Gruppen von Schaltflächen. Auf die Leiste ziehen oder auf Hinzufügen klicken; beliebig oft verwendbar.
- **Normal**
- **Symbole**
- **Abblenden**
- **Oben links**
- **Oben mittig**
- **Oben rechts**
- **Unten links**
- **Position**

### Grafik <sub>prefs/graphics.rs</sub>

- **Supersampling**
- **Grafikkarte**
- **Fenstersystem**
- **Grafik**
- **Geschwindigkeit gegen Glätte abwägen.**
- **Voreinstellung**
- **Leistung**
- **Am schnellsten**
- **Qualität**
- **Am schärfsten**
- **Benutzerdefiniert**
- **Eigene Mischung**
  - Qualität: Umgebungsverdeckung, feine Anzeigequalität und adaptives 2× Supersampling. Leistung: keine Umgebungsverdeckung, normale Anzeigequalität und kein Supersampling. Manuelle Änderungen: Benutzerdefiniert. MSAA bleibt unverändert.
- **Gekrümmte Flächen**
- **Stärker geglättet**
- **Am langsamsten**
  - Feinere Stufen zeigen gekrümmte Flächen und Kanten glatter und brauchen länger zum Vernetzen. Nur die Ansicht ändert sich, nie das Design oder Exporte.
- **Kanten und Schattierung**
- **Kantenglättung**
- **Neustart erforderlich**
- **Die Kantenglättung wird beim nächsten Start von SolidCraft übernommen**
- **Auf dieser GPU nicht verfügbar**
  - Die Kantenglättung verwendet 1×, da der Starttest mit Multisampling keine Ausgabe erzeugt hat, während der Test mit 1× erfolgreich war. Sie können oben eine andere Einstellung wählen. Starten Sie SolidCraft neu, damit die Änderung übernommen wird, sofern der Test erfolgreich ist.
  - Zeichnet die Ansicht in höherer Auflösung und rechnet sie herunter: glattere Kanten, Linien und Raster auf Bildschirmen unter 4K. Kostet GPU-Zeit: etwa 2,25-mal so viele Pixel bei 1,5× und 4-mal bei 2×.
  - Die Ansicht in linearem Licht mit sanftem Himmelslicht schattieren, damit dunkle Flächen einen Verlauf behalten statt schwarz zu werden
- **Aktuelle Ansicht**
- **Auch in der Ansichtsleiste**
- **Raster**
- **Bodenschatten**
- **Perspektivisch**
- **Umgebungsverdeckung**
- **Ansichtswinkel**
  - Zeigt Nick-, Gier- und Rollwinkel der Ansicht in Grad sowie die Projektion unter dem Orientierungs-Gizmo. Klicken Sie auf die Anzeige, um genaue Winkel einzugeben.
- **Schnellmessung**
  - Zeigt unten rechts in der Ansicht die Größe der Auswahl an: bei einer Kante die Länge, bei einer kreisförmigen Kante zusätzlich Durchmesser (Ø) und Radius (R), bei einer Fläche den Flächeninhalt, bei einem Punkt die Position, bei zwei Elementen Abstand und Winkel sowie bei mehreren Kanten oder Flächen die Gesamtlänge bzw. Gesamtfläche. Ein Klick kopiert den Messwert.
- **Bildrate**
  - Zeigt die Bilder pro Sekunde unten rechts in der Ansicht.
- **Schnellmessung in der Ecke der Ansicht**
- **Bildratendetails**
  - Fügt ein Diagramm der Bildzeiten der letzten Bilder hinzu, darüber die gezeichneten Dreiecke, dazu ein Histogramm der Bildzeiten und was die GPU gezeichnet hat. Ein Klick auf die Bildrate in der Ansicht blendet sie ein oder aus.
  - Zeichnet auf, wie lange SMLib-Aufrufe, Kernel-Vorgänge, Features, Befehle und Importe dauern. Agenten lesen es mit diagnostics.profile.
- **Status-Chips**
- **Analyse**
  - Zeigt aktive Analysen über dem Ansichtsfenster und ihre Legenden am jeweiligen Eintrag. Esc beendet die neueste Analyse. Ausschalten stellt Ecklegenden und das bisherige Esc-Verhalten wieder her.
  - Die Schnitteinstellung im Ansichtsfenster anzeigen. Escape und die aktive Schaltfläche schalten den Schnitt aus. Deaktivieren, um die bisherigen Schnittbedienelemente zu behalten.
- **Live-Details**
  - Aktive Analyse- und Schnitteinstellungen in standardisierten Detailkarten bearbeiten. Deaktivieren, um schreibgeschützte Analyselegenden und den Schnittdialog wiederherzustellen.
- **Elemente einklappen**
  - Drei oder mehr Statuselemente in einer Zusammenfassung anzeigen. Deaktivieren, um jedes Element in der vollständigen Zeile zu behalten.
- **Kosmetische Gewindemarkierungen**
  - Schematische Markierungen an zylindrischen Gewindewänden anzeigen. Ändert nur die Anzeige, nie das Design oder Exporte.
  - Eine Vorschau eines Features, das einen Körper ändert, kann die hinzugefügte Fläche in der Vorschaufarbe zeichnen. Wenn deaktiviert, wird der Körper wie er ist gezeichnet.
  - Eine Vorschau füllt das Material, das ein Feature entfernt, sowie die ersetzte Form mit einem roten, durchscheinenden Geist. Wenn deaktiviert, sind diese Füllungen völlig transparent und es werden nur ihre Umrisse gezeichnet.
  - Konturen inaktiver Skizzen und Bezugsebenen über schattierten Körpern zeichnen
  - Seitenansichten zeigen das Raster auf der aufrechten Ebene, die ihnen zugewandt ist, statt auf dem Boden
  - Wenn deaktiviert, können Flächenschattierung und Stetigkeitsanalyse gleichzeitig aktiv bleiben. Beim Aktivieren bleibt die zuletzt gestartete oder geänderte Analyse erhalten.
- **Dieser Computer**
  - Stellt die bisherige feste Obergrenze für die Geometrie wieder her (512 MiB auf 64-Bit-Desktop-Systemen, andernfalls 128 MiB) anstelle des geräteabhängigen Budgets.
- **CPU (Software)**
  - Diese Einstellung wird nach einem Neustart von SolidCraft wirksam. Die Umgebungsvariable WGPU_ADAPTER_NAME hat Vorrang vor dieser Auswahl.
- **Automatisch**
  - Die gespeicherte Grafikkarte ist nicht verfügbar. Stattdessen wird „Automatisch“ verwendet.
  - Die gespeicherte Grafikkarte wurde für dieses Fenster nicht verwendet; die tatsächlich genutzte Karte steht unter Hilfe › Info und in der Statuszeile. Versuchen Sie Automatisch, oder setzen Sie WGPU_ADAPTER_NAME auf einen eindeutigen Teil des Kartennamens.
- **Sichtfeld**

### 3D-Maus <sub>prefs/mouse3d.rs</sub>

- **3D-Maus**
  - SpaceMouse und SpaceNavigator.
- **Tasten**
- **Gerät**
- **Verbunden**
- **Kalibriert**
- **Nicht kalibriert**
- **Gefunden, aber nicht lesbar**
- **Bewegen Sie die 3D-Maus einmal, damit SolidCraft sie erkennt.**
- **Keine 3D-Maus gefunden**
  - SolidCraft sieht eine 3D-Maus, darf sie aber nicht lesen. Die udev-Regel steht in den Einrichtungshinweisen zur 3D-Maus.
- **Falls eine angeschlossen ist, bewegen Sie sie kurz.**
- **Kalibrieren…**
- **Kalibrierung verwerfen**
  - Bewegen Sie die Kappe so, wie das Fenster es verlangt. So lernt SolidCraft, in welche Richtung und wie weit jede Achse dieser 3D-Maus geht. Wird für diese 3D-Maus gespeichert.
  - Ansicht gleichzeitig verschieben und drehen; Skizzen verwenden nur Schwenken und Zoomen.
  - Ein Bild Ihrer 3D-Maus unten links, das sich mit ihr bewegt.
- **Ansicht links**
- **Ansicht rechts**
- **Fenster links**
- **Gesamtgeschwindigkeit**
- **Verfolgt**
- **Klassisch**
- **Orbit**
  - Verfolgt: Die 3D-Maus dreht die Ansicht um den Teil des Modells, der zu Beginn der Drehung in der Ansichtsmitte liegt, markiert durch eine blasse Kugel. Klassisch: um die Ansichtsmitte
  - Die 3D-Maus dreht die Ansicht auch, solange eine Skizze offen ist und frontal gesehen wird, wie es die Maus kann. Aus: Sie verschiebt und zoomt die Skizze, bis Sie die Ansicht neigen.
  - Welche kalibrierte Bewegung des Geräts diese Achse steuert. Wählen Sie eine, die schon eine andere Achse nutzt, werden die beiden getauscht.
  - Das Profil des 3D-Maus-Treibers schaltet diese Achse ab, daher bewegt ihre Bewegung die Ansicht nicht. Wählen Sie hier die Bewegung einer anderen Achse, werden die beiden getauscht und sie bewegt die Ansicht nicht mehr.
- **Achsenzuordnung zurücksetzen**
- **Wird vorerst über spacenavd gelesen: das Gerät selbst ließ sich nicht öffnen.**
- **Totzone**
  - Wie weit sich die Kappe bewegen muss, bevor sich die Ansicht bewegt, als Anteil ihres vollen Wegs. Erhöhen Sie sie, wenn die Ansicht wandert, obwohl die Kappe ruht.
  - 3D-Maus-Einstellungen auf die Standardwerte zurücksetzen? Kalibrierung und Tastenbelegung bleiben.
- **3D-Maus-Standardwerte wiederherstellen**
- **Abbrechen**
  - Die Kreise zeigen, was das Gerät nach der Kalibrierung sendet. Das Testmodell zeigt, was die Ansicht daraus macht, nach Umkehren, Geschwindigkeit und Achsenzuordnung.