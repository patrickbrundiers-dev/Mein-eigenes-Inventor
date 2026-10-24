# Werkzeug- und Einstellungsmatrix (Masterplan CAD-Werkzeuge/Einstellungen)

Stand: 24.10.2026. Ergänzt [feature-matrix.md](feature-matrix.md) um die Punkte des Masterplans, die dort fehlen,
und legt die Stufen dieses Arbeitspakets fest. Status: **vorhanden** · **teilweise** · **fehlt** · **blockiert**.

Abgrenzung: Baugruppen, Fertigung/Zuschnitt, Zeichnungen, Feature-Baum/Parametrik und Releases laufen im
Entwicklungsplan (P1). Hier: Einstellungen, Arbeitsplatz, Auswahl/Ansicht, Messen, Skizzenwerkzeuge, Tastatur.

## Arbeitsplatz (Masterplan 2)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Arbeitsbereiche Teil/Skizze/Baugruppe/Zeichnung | vorhanden | Menüband je Modus, `src/ui/ribbon.js` |
| Modellbrowser: Umbenennen, Unterdrücken, Reihenfolge | vorhanden | `src/ui/tree.js`, `App.moveFeature` |
| Eigenschaftenpanel | vorhanden | `src/ui/props.js` |
| Statusleiste mit Einheiten und Modellstatus | vorhanden | `App.updateStatus` (Masse, Körper, Fehler, mm · Grad) |
| Befehls-/Werkzeugsuche | fehlt | Stufe 3 |
| Anpassbare Tastaturkürzel | fehlt | fest in `App.bindKeys`, Skizze in `Sketcher.key`; Stufe 3 |
| Skalierbare Oberfläche | vorhanden (neu) | Einstellung „Oberflächengröße“, Desktop |
| Protokollfenster / Fehlerdetails | teilweise | Fehlerprotokoll als Datei (`electron/log.cjs`), Ordner aus dem Center öffenbar |
| Konfigurierbare Werkzeugleisten, gespeicherte Panelanordnung | fehlt | P3, erst nach Werkzeugsuche |

## Auswahl, Navigation, Ansicht (Masterplan 3)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Auswahl Fläche/Kante, Mehrfachauswahl Strg/Umschalt | vorhanden | `App.viewerClick` |
| Auswahlfilter, Fensterauswahl, Auswahl invertieren | fehlt | Stufe 5 |
| Ausblenden/Isolieren | teilweise | Komponenten ausblendbar; Körper nicht |
| Zoom auf alles | vorhanden | F6, `Viewer.fit` |
| Zoom auf Auswahl | vorhanden | Ansicht → Zoom, Kontextmenü, Leiste unten rechts (Stufe 2) |
| Ansichten Iso, Vorne, Oben, Rechts | vorhanden | `VIEWS` in `viewer.js` |
| Ansichten Hinten, Links, Unten | vorhanden | Menüband Ansicht → Ausrichtung (Stufe 2) |
| Normal zur gewählten Fläche | vorhanden | ebene Fläche wählen → Ansicht → Normal zur Fläche (Stufe 2) |
| Orbit, Pan, Zoom, ViewCube | vorhanden | OrbitControls, Maustasten jetzt einstellbar |
| Perspektive | vorhanden | Umschalter + Einstellung; Skizzieren immer orthogonal (Stufe 2) |
| Schnittansicht/Clipping im 3D-Fenster | vorhanden | Schnitt X/Y/Z mit Schieber, Seite wechseln; nur Anzeige, Schnittflächen nicht gefüllt (Stufe 2) |
| Darstellungsmodi (schattiert, mit Kanten, Drahtmodell, transparent) | vorhanden | Auswahl folgt dem Sichtbaren (Drahtmodell: nur Kanten wählbar) (Stufe 2) |
| Farben für Kanten/Auswahl/Hover | vorhanden (neu) | Einstellungscenter |
| Gespeicherte benannte Ansichten | fehlt | P3 |

## Skizze (Masterplan 4 und 5)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Linie, Rechteck, Kreis, Bogen (3 Punkte, Mitte), Punkt | vorhanden | `src/ui/sketcher.js` |
| Maße direkt beim Zeichnen | vorhanden | Rechteck/Linie/Kreis, `src/core/dyninput.js` |
| Polylinie (Linienkette) | vorhanden | Linienwerkzeug setzt am Endpunkt fort |
| Langloch, Polygon | fehlt | Stufe 6, aus Linien/Bögen + Bedingungen baubar |
| Ellipse, Spline | blockiert | Solver (`src/core/solver.js`) und Profilbildung kennen nur Linie/Kreis/Bogen |
| Stutzen, Skizzenrundung | vorhanden | `src/core/sketchedit.js` |
| Versatz, Spiegeln, Muster, Verlängern, Teilen | fehlt | Stufe 6 (Spiegeln/Versatz zuerst) |
| Projizieren, Konstruktionslinien | vorhanden | |
| 12 Bedingungsarten, Bemaßung mit Formeln | vorhanden | `solver.js` |
| Automatische Bedingungen beim Zeichnen | teilweise | horizontal/vertikal, auf Linie/Kreis, Mittelpunkt |
| Raster, Rasterfang, Fangradius | vorhanden | Rasterweite und Fangradius jetzt einstellbar |
| Status unter-/vollständig bestimmt | vorhanden | Freiheitsgrade im HUD |
| Überbestimmt / widersprüchlich mit Ursache | teilweise | nur „Bemaßung widersprüchlich“; welche Bedingung, fehlt (Stufe 6) |
| Offene Konturen erkennen | vorhanden | `extractProfiles` |
| Bedingungen unterdrücken | fehlt | |

## Messen und Prüfen (Masterplan 7)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Abstand/Winkel zweier ebener Flächen | vorhanden | Eigenschaftenpanel bei zwei gewählten Flächen |
| Abstand Punkt/Kante/Fläche, Radius/Durchmesser, Koordinaten | teilweise | Durchmesser bei Zylinderfläche angezeigt; eigenes Messwerkzeug fehlt (Stufe 4) |
| Bounding Box, Volumen, Masse | vorhanden | `bodyProps` (Volumen, Box), Masse mit Werkstoffdichte |
| Oberfläche, Schwerpunkt, Trägheit | fehlt | OCCT liefert es (`GProp`), Stufe 4 |
| Kollisionsprüfung | vorhanden | Baugruppe (Entwicklungsplan G-1) |
| Ungültige Körper erkennen | vorhanden | Körperprüfung aus P0 |
| Messwerte mit konfigurierbarer Genauigkeit | vorhanden (neu) | Einstellung „Dezimalstellen“ |

## Einstellungen (Masterplan 13 und 14)

Umgesetzt in Stufe 1, Details in [../architecture/einstellungen.md](../architecture/einstellungen.md).

| Kategorie | Status | Bemerkung |
|---|---|---|
| A Allgemein | teilweise | Autosave-Wartezeit, Lösch-Rückfrage, Dezimalstellen; Sprache/Ordner geplant |
| B Dokument und Modell | fehlt | gehört in die Projektdatei; erst mit Vorlagen |
| C Skizzen | teilweise | Rasterfang, Rasterweite, Fangradius, Symbole |
| D 3D-Ansicht | teilweise | Projektion, Darstellungsmodus, Qualität, Maus, Zoom/Drehen, Raster, ViewCube, Farben |
| E Werkzeuge und Tastatur | fehlt | Stufe 3 |
| F Kernel | fehlt | bewusst: keine Toleranzen ohne Absicherung |
| G Materialien | teilweise | eingebaute Liste sichtbar; eigene Werkstoffe P2 |
| H Blech, I Rohrlaser/Maschinen | fehlt | ADR-0002; Maschinenprofile eigenes Format (P3) |
| J Leistung | teilweise | Darstellungsqualität; Rest geplant |
| K Dateien und Datensicherheit | vorhanden (Verhalten), Optionen fehlen | atomar + `.bak`, Autosave, Migration |
| L Updates | vorhanden | jetzt im Center |
| M Datenschutz | vorhanden | keine Telemetrie; Protokoll lokal |
| N Darstellung | teilweise | Oberflächengröße, Animation; Farbschema geplant |
| Versionierung, Migration, Validierung, Import/Export, Trennung Benutzer/Geheimnisse | vorhanden (neu) | `src/core/settings.js` |

## Stufen dieses Arbeitspakets

Jede Stufe = ein kleiner PR von `main`, CI grün → mergen, Release-Notiz an den Entwicklungsplan-Thread.

| Stufe | Inhalt | Tests |
|---|---|---|
| 1 | Einstellungscenter mit Schema, Prüfung, Migration, Suche, Import/Export | `test/settings.test.mjs`, Oberflächen- und Desktop-Rauchtest |
| 2 | Ansicht: alle sieben Ansichten, normal zur Fläche, Zoom auf Auswahl, Perspektive, Darstellungsmodi, Schnittebene | Oberflächentest |
| 3 | Befehlssuche und anpassbare Tastaturkürzel mit Konfliktanzeige | Unit-Test Kürzel-Tabelle, Oberflächentest |
| 4 | Messwerkzeug: Punkt/Kante/Fläche, Radius, Koordinaten; Oberfläche und Schwerpunkt aus dem Kernel | Kernel-Test (Würfel/Zylinder bekannte Werte) |
| 5 | Auswahlfilter, Körper ausblenden/isolieren | Oberflächentest |
| 6 | Skizze: Langloch, Polygon, Spiegeln, Versatz; Ursache bei widersprüchlichen Bedingungen | Solver-Tests |
