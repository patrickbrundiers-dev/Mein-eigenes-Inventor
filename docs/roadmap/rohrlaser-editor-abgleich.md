# Abgleich Rohrlaser-Editor ↔ PBCAD

Stand: 24.10.2026 · PBCAD `main` @ `2006e16` · Rohrlaser-Kalkulation `main` (Repository
`patrickbrundiers-dev/Rohrlaser-Kalkulation-`, nur gelesen, dort nichts geändert).

Auftrag: Patricks Plan „Inventor-System mit Verbesserungen aus dem Rohrlaser-Editor weiterentwickeln“.
„Inventor-System“ = PBCAD (früher WerkCAD), nicht Autodesk Inventor. Ziel ist Umsetzung; die Analyse ist die Grundlage.

## 1. Bestandsaufnahme

### System A: Rohrlaser-Angebotskalkulation (Python 3, PySide6/Qt, SQLite)

Kein allgemeines CAD, sondern ein **Merkmals-Editor** für Rohr- und Blechteile: gerades Rohr mit Enden
(gerade, Gehrung, Ausklinkung) und Konturen an Lagen (x ab Ende A, Seite/Winkel, Muster). Gerechnet wird aus den
Eingaben (Abwicklung), nicht aus einem B-Rep. Geprüfte Module (`programm/rohrlaser/`):

| Bereich | Module | Befund |
|---|---|---|
| Editor-Rahmen | `teile_editor.py` (1408 Z.) | Merkmalsbaum mit Herkunft je Wert (STEP / manuell / Vorgabe), Prüfmeldungen unten, Klick wählt Merkmal in Baum, Tabelle, Skizze und 3D gleich, QUndoStack |
| Eigenschaften | `editor_eigenschaften.py`, `massbild.py` | nur Felder des gewählten Merkmals; **Maßbild** je Konturart (welcher Buchstabe welches Maß ist); nicht sinnvolle Felder ausgeblendet |
| Eingabe | `rechenfeld.py`, `tabellen_eingabe.py` | Maßfelder mit + − × ÷ und Namen L, B, H, D, S (AST, kein eval); Muster „3x25“; **Profil-Vervollständigung** „40x3“ → „QR 40x40x3“; Excel-artige Tabellen |
| Ansicht | `editor_ansicht.py`, `ansicht3d*.py`, `ansichtswuerfel.py`, `editor_schnitt.py`, `skizze*.py` | 3D und maßstäbliche Skizze/Abwicklung, Ansichtswürfel, Querschnitt an Stelle x |
| Am Modell bearbeiten | `editor_griffe.py` | Griffe längs/quer mit Fang (Raster, Mitte), Gehrungsebene ziehen, Maße am Modell per Doppelklick |
| Prüfen | `dfm.py` (493 Z.) | **Fertigungsprüfung** als Regeltabelle (je Regel an/aus, Grenzwert, Stufe HINWEIS/WARNUNG/FEHLER): Bohrung zu klein, Steg zu schmal, Rand, Teil zu kurz, Knickrahmen (Schenkel, Knickbereich, Wand), Biegerohr |
| Maschinen | `stammdaten.py` (Tabelle MASCHINEN) | Endbeschnitt, Greiferrest, max. Stangenlänge, max. Hüllkreis-Ø, max. Metergewicht, kürzestes Teil, 3D-Schwenkwinkel |
| Geometrie | `durchdringung.py`, `knickrahmen.py`, `biegerohr.py`, `blech*.py` | Durchdringungskurven Rohr/Rohr analytisch, Knickrahmen-Formeln (DIN 6935), Blech-Abwicklung |
| Austausch | `dxf.py`, `dxf_import.py`, `step*.py`, `step_messung/` | eigener DXF-R12-Schreiber/-Leser mit Layern, STEP-Messung (OCC) für den Import |
| Bedienung | `befehlspalette.py`, `tastatur.py`, `verlauf.py`, `einblendung.py`, `mausrad.py`, `konturvorlagen.py` | Strg+K, Kürzel, Undo über Zustandsvergleich, ruhige Einblendungen, Mausrad verstellt keine Werte, Kontur-Vorlagen |
| Tests | `tests/` (≈ 450 Dateien, viele STEP-Referenzteile) | pytest, Regressionen auf echten Teilen |

### System B: PBCAD (JavaScript, Electron, replicad/OpenCascade im Worker, three.js)

Geprüft im Code, Details in [../architecture/current-state.md](../architecture/current-state.md) und
[feature-matrix.md](feature-matrix.md). Kurzfassung: parametrische Bauteile mit Feature-Baum (`src/kernel/build.js`),
Skizzen mit Solver (`src/core/solver.js`), Profile/Rahmen/Knickrahmen (`sections.js`, `knickrahmen.js`), Baugruppen
mit Abhängigkeiten und Kollision, Zeichnungen mit Ansichten/Schnitt/Detail, Zuschnittliste mit Profil-IDs im Format
der Rohrlaser-Kalkulation (`cutlist.js`), Einstellungscenter, Befehlssuche, Messen. Tests: Kern (Node), Kernel
(OpenCascade), Oberfläche (Chrome, `tools/e2e.mjs`), Electron-Rauchtest.

## 2. Vergleichsmatrix

| Funktion | Rohrlaser-Editor | PBCAD | Kategorie | Empfohlene Aktion |
|---|---|---|---|---|
| Rückgängig/Wiederholen | Zustandsvergleich, gesamtes Angebot | Snapshots, 100 Schritte | beide vorhanden | beibehalten |
| Befehlspalette Strg+K, Kürzel | vorhanden | vorhanden, Kürzel anpassbar | beide, PBCAD besser | beibehalten |
| Ansichtswürfel, Standardansichten | vorhanden | vorhanden, + Perspektive, Schnittebene | beide, PBCAD besser | beibehalten |
| Rechnen in Maßfeldern | + − × ÷, Namen L/B/H/D/S | Formeln mit Funktionen, Parametern, Einheiten (`expr.js`) | PBCAD besser | beibehalten |
| Muster-Kurzform „3x25“ | vorhanden | Anzahl und Abstand als zwei Felder | Editor bequemer | P2: prüfen (klein) |
| **Profil per Kurzform tippen** | „40x3“ → QR 40x40x3, „qr 40“ | zwei Auswahllisten (Profilart, Normgröße), freie Maße einzeln | **Editor besser** | **übertragen (Etappe 1)** |
| Profil-ID-Format | `step_geometrie.profil_id_vorschlag` | `sections.profileId` (gleiches Format) | beide | beibehalten, jetzt auch rückwärts lesbar |
| **Fertigungsprüfung mit Maschinengrenzen** | `dfm.py` + Stammdaten Maschinen | fehlt (nur Kernel-Fehler, Knickrahmen-Grenzen) | **Editor besser** | **übertragen (Etappe 2)** |
| **Maßbild je Querschnitt/Merkmal** | `massbild.py` | nur Beschriftungen „Breite B“, „Wandstärke t“ | **Editor besser** | **übertragen (Etappe 3)** |
| Prüfmeldungen mit Klick zur Stelle | Liste, Klick markiert Merkmal | Abschnitt „Probleme“ im Bauteil, ohne Sprung | beide unvollständig | P1: Klick wählt Feature im Baum |
| Herkunft der Werte (STEP/manuell/Vorgabe) | vorhanden | n. r. (PBCAD erzeugt selbst) | – | nicht übertragen |
| Griffe am 3D-Modell (Ziehen mit Fang) | vorhanden | fehlt | Editor besser | P2: erst für Skizze/Bohrung sinnvoll, parametrisch aufwendig |
| Querschnitt an Stelle x | vorhanden | Schnittebene im 3D (Anzeige) | beide | beibehalten |
| Durchdringung Rohr/Rohr | analytische Kurve | echte Boolesche Operation (Sattelschnitt im Rahmen) | PBCAD besser | beibehalten |
| Knickrahmen | Formeln, Prüfregeln | 3D-Feature, Abwicklung, Freistellung | beide, PBCAD als 3D besser | Prüfregeln (Schenkel, Wand) übernehmen → Etappe 2 |
| Kontur-Vorlagen (Bohrbild speichern/einsetzen) | vorhanden | fehlt | Editor besser | P2: als Skizzenblock |
| Gravur-Text | vorhanden | Feature „Prägen“: beliebige Skizze, auf Rundrohr abgewickelt | gleichwertig (Skizze statt Text) | umgesetzt |
| DXF-Export | R12 mit Layern (Blech) | R12 (`dxf.js`), Platten und Skizzen | beide | beibehalten |
| DXF-Import | vorhanden (ohne Bibliothek) | fehlt | Editor besser | P2: in Skizze, Leser ist klar abgegrenzt |
| Mausrad verstellt keine Zahlenfelder | global (`mausrad.py`) | 2 Zahlenfelder (`type=number`) reagieren auf das Rad | Editor besser | **P0, mit Etappe 1 erledigt** |
| Excel-artige Tabellen | vorhanden | Parametertabelle einfach | Editor besser | P2: Parameterdialog |
| Stangenoptimierung, Kalkulation, Fracht, Lizenz | Kern der Kalkulation | n. r. | – | bleibt in der Kalkulation (ADR-0004: Verschachtelung zurückgestellt) |
| Blech-Editor, Biegerohr | vorhanden | nur Knickrahmen (ADR-0002) | – | nicht übertragen |
| Gegenprobe PBCAD-STEP → STEP-Import der Kalkulation | Messprogramm vorhanden | Export vorhanden | beide unvollständig | P2: gemeinsamer Referenztest (braucht Python + OCC im CI) |

## 3. Übertragungsliste (technisch geeignet)

Alle drei sind reine Logik in `src/core/` (ohne DOM, ohne neue Bibliothek) plus eine dünne Oberfläche. Code wird
nicht kopiert (Python/Qt → JavaScript), übernommen werden Regeln und Algorithmen. Urheber beider Programme ist
Patrick; Lizenzfragen entstehen nicht. Keine neue Abhängigkeit.

### Ü1 Profil-Schnelleingabe (P1, Etappe 1)

- **Nutzen:** Profil so eingeben, wie es in Angebot, Lager und Zuschnittliste heißt („RE 60x40x3“, „40x3“); auch
  Maße außerhalb der Normliste („RE 70x50x4“) in einem Schritt statt Profilart + drei Felder.
- **Herkunft:** `tabellen_eingabe.profil_treffer` / `profil_aufloesen` (Rangfolge: gleiche Maße, doppelte Maße
  dürfen fehlen; dann Maße am Anfang; Kürzel vorne muss passen).
- **Ziel:** neues Modul `src/core/profilesearch.js`; Feld „Profil-ID“ im Querschnitts-Editor (`src/ui/props.js`,
  Rohr/Profil, Rahmen, Knickrahmen – dort nur erlaubte Profilarten).
- **Anpassung:** Liste aus dem PBCAD-Katalog (`CATALOG` + `profileId`), zusätzlich Profil-ID rückwärts lesen.
- **Risiken:** falscher Treffer bei mehrdeutiger Eingabe → mehrdeutig wird abgelehnt und nennt Kandidaten.
- **Aufwand:** S. **Tests:** `test/rohrlaser.test.mjs`, Oberflächentest „Profil-Schnelleingabe“.

### Ü2 Fertigungsprüfung Rohrlaser (P1, Etappe 2)

- **Nutzen:** Teile, die der Laser so nicht kann, schon im CAD sehen statt erst im Angebot (Teil länger als die
  nutzbare Stange, kürzer als das kürzeste Teil, Profil zu groß oder zu schwer für die Maschine, Knickrahmen mit
  zu kurzem Schenkel oder zu dicker Wand).
- **Herkunft:** `dfm.py` (Regeln, Stufen, Texte mit Lage), Stammdaten MASCHINEN (Grenzen und Startwerte der
  Beispielmaschinen T03/T11: Stange 6500, Endbeschnitt 10, Greiferrest 142, Hüllkreis 255 mm, 36 kg/m).
- **Ziel:** `src/core/dfm.js` (rein), Einstellungen Kategorie „Rohrlaser und Fertigung“ (bisher nur geplant),
  Anzeige im Bauteil (Zuschnittliste) und im Zuschnittlisten-Dialog.
- **Anpassung:** geprüft wird die Zuschnittliste (Profil-ID, Länge, kg/m), nicht die Eingabetabelle; Knickrahmen
  liefert Schenkel und Rohrmaß in der Ebene im Ergebnis mit.
- **Abhängigkeiten:** Einstellungscenter (Stufe 1), Zuschnittliste (P1-C F-1).
- **Risiken:** Grenzwerte sind Startwerte → in den Einstellungen änderbar, 0 = Regel aus; Prüfung ändert nichts am Modell.
- **Aufwand:** M. **Tests:** Unit-Tests je Regel, Oberflächentest.
- **Nicht in dieser Etappe:** Bohrung zu klein / Steg / Randabstand (brauchen die Lage der Konturen auf dem Profil,
  im B-Rep nicht direkt vorhanden) → nachgezogen mit den Konturen am Rohr, siehe Abschnitt 4.

### Ü3 Maßbilder (P1, Etappe 3)

- **Nutzen:** sofort sehen, welches Maß D, B, H, t, r am Querschnitt ist.
- **Herkunft:** `massbild.py` (kleine Zeichnung je Konturart, Buchstaben an Maßpfeilen, Farben aus dem Theme).
- **Ziel:** `src/core/massbild.js` (SVG-Text, testbar), eingeblendet im Querschnitts-Editor.
- **Aufwand:** S. **Tests:** Unit-Test (jede Profilart hat ein Bild mit genau ihren Feldbuchstaben).

## 4. Entwicklungsplan

Schwerpunkt nach Rückmeldung von Patrick (24.10.2026): **Funktionen des Rohr-Editors** (Schneidweg-Rechner im
Teile-Editor, `schneidweg.py`, `schneidweg_dialog.py`, `editor_*.py`, `dreid.py`, `schnittflaeche.py`). Wichtig sind
ihm besonders der **2D/3D-Schnitt** und bei 3D die **Winkelkorrektur ±45°**.

| Stufe | Punkt | Herkunft im Rohr-Editor | Status |
|---|---|---|---|
| P0 | Mausrad verstellt keine Zahlenfelder | `mausrad.py` | erledigt (#40) |
| P1 | Profil-Schnelleingabe (eigentlich aus der Positionsliste) | `tabellen_eingabe.py` | erledigt (#40) |
| P1 | Fertigungsprüfung mit Maschinengrenzen (Prüfmeldungen) | `dfm.py`, Stammdaten Maschinen | erledigt (#43) |
| P1 | **Konturen am Rohr** ohne Skizze: Bohrung, Langloch, Rechteck, Ausklinkung; Lage ab Ende A, Seite/Winkel, Versatz, Muster „3x25“, durchgehend; Schneidweg und Einstiche | `schneidweg.py` (konturen, Formeln), `rechenfeld.muster` | umgesetzt (`src/core/tubecuts.js`) |
| P1 | **2D/3D-Schnitt der Enden**: 2D = Strahl senkrecht zur Oberfläche (Gehrung innen verdreht), 3D = Kopf geschwenkt (ebene Fläche) | `schnittflaeche.py`, `dreid.py` | umgesetzt (`src/core/endcut.js`) |
| P1 | **Winkelkorrektur** (Kopfschwenk, Vorgabe ±45°): darüber Kopf auf der Grenze, nicht maßhaltig, Warnung | `dreid.begrenzen`, `schwenk_min/max` | umgesetzt |
| P1 | **Bohrung 3D** mit Neigung längs/quer, Schnellwahl ±45°/±30°/0°, Ellipse im Schneidweg | `dreid.py`, `schneidweg_dialog.py` | umgesetzt |
| P1 | Maßbild je Konturart im Eigenschaftenfeld | `massbild.py` | umgesetzt (`src/core/massbild.js`, Bild über den Feldern jeder Konturkarte) |
| P1 | Prüfregeln Bohrung zu klein, Steg zu schmal, Kontur zu nah am Ende (jetzt mit Lage der Konturen möglich) | `dfm.py` | umgesetzt (`checkContours` in `src/core/tubecuts.js`, Abwicklung mit Eckbögen, Gegenseite bei „durchgehend“; Faktoren unter Einstellungen → Rohrlaser und Fertigung) |
| P1 | Gravur: Feature „Prägen“ (Skizze wählen, vertieft oder erhaben, auf Rundrohr abgewickelt, Warnung „Gravur über Kante“) | `schneidweg.py`, `dfm.py` | umgesetzt |
| P1 | Schlitz, Polygon/Sonderkontur | `schneidweg.py` | offen |
| P2 | Griffe am 3D-Modell (Ziehen mit Fang), Maße am Modell, Kontur-Vorlagen, Querschnitt an Stelle x, Gegenrohr/Durchdringung am Ende, 2D/3D auch im Rahmen aus Skizze | `editor_griffe.py`, `konturvorlagen.py`, `editor_schnitt.py`, `durchdringung.py` | zurückgestellt |

Datenformat: neue Felder am Feature Rohr/Profil (`cuts`, `endCuts`, `swivel`) sind optional. Ältere Dateien ohne
`endCuts` bauen wie bisher mit ebenem (3D-)Schnitt; neue Profile starten mit 2D wie im Rohr-Editor.

## 5. Architektur und Abhängigkeiten

- Neue Module nur in `src/core/` (ohne DOM, in Node testbar), Oberfläche nur in `src/ui/props.js`.
- Keine Änderung an Datenformat `.wcad`, Update, Release oder Lizenz. Querschnitte werden wie bisher als
  `section` + `dims` (Text) gespeichert; die Profil-ID ist nur Eingabe und Anzeige.
- Fertigungsgrenzen sind Benutzereinstellungen (`src/core/settings.js`), nicht Dokumentwerte; mehrere
  Maschinenprofile bleiben geplant (eigenes Format, siehe `docs/architecture/einstellungen.md`).
- Abstimmung: Einstellungscenter gehört dem Thread „Werkzeuge und Einstellungscenter“; dort wird die neue
  Kategorie gemeldet. Releases nur über den Entwicklungsplan-Thread.

## 6. Testplan und Abnahme

| Etappe | Test | Abnahme |
|---|---|---|
| 1 | `test/rohrlaser.test.mjs`: Treffer-Rangfolge, Kürzel, Profil-ID lesen, Mehrdeutigkeit, gesperrte Profilarten | „40x3“ → QR 40x40x3; „RE 70x50x4“ ohne Normgröße; „qr 40“ mehrdeutig abgelehnt |
| 1 | `tools/e2e.mjs` „Profil-Schnelleingabe“ | tippen + Enter ändert das Profil, Treffer anklickbar, Strg+Z stellt zurück |
| 2 | Unit-Tests je Regel mit Grenzfall (genau an der Grenze = in Ordnung), Regel aus bei 0 | jede Regel meldet mit Stufe und Text, keine Meldung bei 0 |
| 2 | Oberflächentest: zu langes Profil → FEHLER in der Zuschnittliste | Meldung sichtbar, Modell unverändert |
| 3 | Unit-Test: jede Profilart liefert SVG mit genau ihren Maßbuchstaben | Bild erscheint im Querschnitts-Editor |
| alle | volle Suite (Kern, Kernel, Oberfläche, Electron) | CI grün vor dem Merge |

## 7. Die drei besten ersten Verbesserungen

1. **Profil-Schnelleingabe** – täglicher Nutzen bei jedem Profil, kleines Risiko, kein Formatwechsel.
2. **Fertigungsprüfung mit Maschinengrenzen** – höchster fachlicher Nutzen für Patricks Rohrlaser-Fertigung,
   aktiviert die bisher nur geplante Einstellungskategorie.
3. **Maßbilder** – weniger Eingabefehler bei Querschnittsmaßen, rein darstellend.
