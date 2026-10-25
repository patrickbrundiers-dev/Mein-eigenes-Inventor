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
| Befehls-/Werkzeugsuche | vorhanden | Strg+K oder Knopf „Befehl suchen“, nur Befehle des aktuellen Arbeitsbereichs (Stufe 3) |
| Anpassbare Tastaturkürzel | vorhanden | Befehlsliste `src/core/commands.js`, Editor im Einstellungscenter mit Konfliktprüfung je Arbeitsbereich; Esc, Entf, Ziffern/Komma/Tab bleiben fest (Stufe 3) |
| Skalierbare Oberfläche | vorhanden (neu) | Einstellung „Oberflächengröße“, Desktop |
| Protokollfenster / Fehlerdetails | teilweise | Fehlerprotokoll als Datei (`electron/log.cjs`), Ordner aus dem Center öffenbar |
| Konfigurierbare Werkzeugleisten, gespeicherte Panelanordnung | teilweise | Stufe 15: Schnellzugriffsleiste (anheften in der Befehlssuche, ordnen im Center); Menüband/Panels selbst anordnen: P3 |

## Auswahl, Navigation, Ansicht (Masterplan 3)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Auswahl Fläche/Kante, Mehrfachauswahl Strg/Umschalt | vorhanden | `App.viewerClick` |
| Auswahlfilter (alles / nur Flächen / nur Kanten) | vorhanden | Ansicht → Auswahl, Anzeige in der Statusleiste (Stufe 5) |
| Fensterauswahl in der Skizze, Alles auswählen | vorhanden | Stufe 9: im Leeren ziehen – nach rechts ganz innen, nach links berührend; Strg+A in der Skizze |
| Fensterauswahl im 3D-Fenster, Auswahl invertieren | vorhanden | Stufe 13: im Bauteil links ziehen (nach rechts ganz innen, nach links berührend), folgt dem Auswahlfilter; Strg+A alles, Strg+I umkehren; verdeckte Elemente zählen mit; Baugruppe: Einzelauswahl wie bisher |
| Ausblenden/Isolieren | vorhanden | Rechtsklick: Körper bzw. Komponente ausblenden/isolieren, „Alle einblenden“; nur Anzeige, keine Modelländerung (Stufe 5) |
| Zoom auf alles | vorhanden | F6, `Viewer.fit` |
| Zoom auf Auswahl | vorhanden | Ansicht → Zoom, Kontextmenü, Leiste unten rechts (Stufe 2) |
| Ansichten Iso, Vorne, Oben, Rechts | vorhanden | `VIEWS` in `viewer.js` |
| Ansichten Hinten, Links, Unten | vorhanden | Menüband Ansicht → Ausrichtung (Stufe 2) |
| Normal zur gewählten Fläche | vorhanden | ebene Fläche wählen → Ansicht → Normal zur Fläche (Stufe 2) |
| Orbit, Pan, Zoom, ViewCube | vorhanden | OrbitControls, Maustasten einstellbar; Drehen um den Modellpunkt unter dem Mauszeiger (#62, abschaltbar) |
| Perspektive | vorhanden | Umschalter + Einstellung; Skizzieren immer orthogonal (Stufe 2) |
| Schnittansicht/Clipping im 3D-Fenster | vorhanden | Schnitt X/Y/Z mit Schieber, Seite wechseln; nur Anzeige (Stufe 2); Schnittflächen geschlossen und abgedunkelt, abschaltbar (Stufe 18) |
| Darstellungsmodi (schattiert, mit Kanten, Drahtmodell, transparent) | vorhanden | Auswahl folgt dem Sichtbaren (Drahtmodell: nur Kanten wählbar) (Stufe 2) |
| Farben für Kanten/Auswahl/Hover | vorhanden (neu) | Einstellungscenter |
| Gespeicherte benannte Ansichten | vorhanden | Stufe 8: Ansicht → Benannt; im Bauteil bzw. in der Baugruppe gespeichert (`namedViews`), mit Rückgängig; Projektion bleibt Einstellung |

## Skizze (Masterplan 4 und 5)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Linie, Rechteck, Kreis, Bogen (3 Punkte, Mitte), Punkt | vorhanden | `src/ui/sketcher.js` |
| Maße direkt beim Zeichnen | vorhanden | Rechteck/Linie/Kreis, `src/core/dyninput.js` |
| Polylinie (Linienkette) | vorhanden | Linienwerkzeug setzt am Endpunkt fort |
| Langloch, Polygon | vorhanden | Stufe 6: aus Bögen/Linien mit tangentAt/gleich bzw. Konstruktionskreis + gleiche Seiten; bleibt parametrisch |
| Ellipse, Spline | teilweise | Stufe 19: Ellipse (Mittelpunkt, Achsenende, Nebenhalbachse; Halbachsen, Achswinkel, Punkt auf Ellipse, Tangente an Linie; Profil, DXF als Polylinie). Ellipsenbogen, Stutzen an Ellipsen und Spline (Stufe 21) folgen |
| Stutzen, Skizzenrundung | vorhanden | `src/core/sketchedit.js` |
| Spiegeln | vorhanden | Stufe 6: Kopien über »symmetrisch« an Originale gebunden |
| Versatz | vorhanden | Stufe 7: Kontur anklicken (ganze Kette), Seite klicken, Abstand; Ecken im Schnittpunkt, Bögen konzentrisch; ein sichtbares Maß steuert alle Kopien |
| Verlängern, Teilen | vorhanden | Stufe 11: Ende bis zum nächsten Element verlängern (Punkt auf Element), Linie/Bogen am Klick oder nächsten Schnittpunkt teilen (kollinear bzw. gleiche Mitte) |
| Muster (rechteckig, kreisförmig) | vorhanden | Stufe 12: Kopien über Bedingung »pattern« an die Originale gebunden; Abstände/Winkelschritt in den Eigenschaften einer Kopie änderbar, »Muster auflösen« |
| Projizieren, Konstruktionslinien | vorhanden | |
| 12 Bedingungsarten, Bemaßung mit Formeln | vorhanden | `solver.js` |
| Automatische Bedingungen beim Zeichnen | vorhanden | horizontal/vertikal, auf Linie/Kreis, Mittelpunkt; Stufe 14: parallel/senkrecht, tangential am Bogenende, gleich lang/gleicher Radius (`src/core/autoconstraints.js`); Strg unterdrückt, je Art abschaltbar |
| Raster, Rasterfang, Fangradius | vorhanden | Rasterweite und Fangradius jetzt einstellbar |
| Status unter-/vollständig bestimmt | vorhanden | Freiheitsgrade im HUD |
| Überbestimmt / widersprüchlich mit Ursache | vorhanden | Stufe 6: HUD nennt die nicht erfüllbaren Bedingungen, Maße/Symbole rot |
| Offene Konturen erkennen | vorhanden | `extractProfiles` |
| Bedingungen unterdrücken | vorhanden | Stufe 7: Eigenschaften → „Unterdrückt“; bleibt gespeichert, wirkt nicht, wird blass gezeigt |

## Messen und Prüfen (Masterplan 7)

| Punkt | Status | Wo / Bemerkung |
|---|---|---|
| Abstand/Winkel zweier ebener Flächen | vorhanden | Eigenschaftenpanel bei zwei gewählten Flächen |
| Messwerkzeug: Fläche, Kantenlänge, Radius/Ø, Mittelpunkt, kürzester Abstand, Winkel, Mittenabstand | vorhanden | Taste M / „Messen“, Bauteil und Baugruppe; Werte exakt aus OpenCascade (GProp, BRepExtrema), nicht aus dem Anzeigenetz (Stufe 4) |
| Punkte (Ecken) einzeln anklicken | vorhanden | Stufe 10: beim Messen nahe am Kantenende klicken; Lage X/Y/Z, Abstand Ecke–Ecke/Kante/Fläche exakt (BRepExtrema), Δ X/Y/Z |
| Bounding Box, Volumen, Masse | vorhanden | `bodyProps` (Volumen, Box), Masse mit Werkstoffdichte |
| Oberfläche, Schwerpunkt | vorhanden | Masse-Eigenschaften im Bauteil (Stufe 4) |
| Trägheitsmomente | vorhanden (Stufe 17) | aus dem Dreiecksnetz berechnet, da `GProp_GProps.MatrixOfInertia` im eingebauten OpenCascade fehlt; Netzabweichung wird angezeigt |
| Kollisionsprüfung | vorhanden | Baugruppe (Entwicklungsplan G-1) |
| Ungültige Körper erkennen | vorhanden | Körperprüfung aus P0 |
| Messwerte mit konfigurierbarer Genauigkeit | vorhanden (neu) | Einstellung „Dezimalstellen“ |

## Einstellungen (Masterplan 13 und 14)

Umgesetzt in Stufe 1, Details in [../architecture/einstellungen.md](../architecture/einstellungen.md).

| Kategorie | Status | Bemerkung |
|---|---|---|
| A Allgemein | teilweise | Autosave-Wartezeit, Lösch-Rückfrage, Dezimalstellen; Sprache/Ordner geplant |
| B Dokument und Modell | fehlt | gehört in die Projektdatei; erst mit Vorlagen |
| C Skizzen | teilweise | Rasterfang, Rasterweite, Fangradius, Symbole, automatische Bedingungen je Art, Bestimmtheit farbig (Stufe 16) |
| D 3D-Ansicht | teilweise | Projektion, Darstellungsmodus, Qualität, Maus, Zoom/Drehen, Raster, ViewCube, Farben |
| E Werkzeuge und Tastatur | teilweise | Kürzel verwalten, Konflikte, Werkzeugsuche, Schnellzugriff, Standardwerte je Werkzeug (Stufe 15); Menüband anordnen geplant |
| F Kernel | fehlt | bewusst: keine Toleranzen ohne Absicherung |
| G Materialien | teilweise | eingebaute Liste sichtbar; eigene Werkstoffe P2 |
| H Blech | fehlt | ADR-0002 |
| I Rohrlaser/Maschinen | teilweise | Grenzen einer Maschine für die Fertigungsprüfung (`src/core/dfm.js`); mehrere Maschinenprofile eigenes Format (P3) |
| J Leistung | teilweise | Darstellungsqualität; Rest geplant |
| K Dateien und Datensicherheit | vorhanden (Verhalten), Optionen fehlen | atomar + `.bak`, Autosave, Migration |
| L Updates | vorhanden | jetzt im Center |
| M Datenschutz | vorhanden | keine Telemetrie; Protokoll lokal |
| N Darstellung | teilweise | Oberflächengröße, Animation, Farbschema hell/dunkel/wie Windows (Stufe 20) |
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
| 6 | Skizze: Langloch, Polygon, Spiegeln; Ursache bei widersprüchlichen Bedingungen | Solver-Tests |
| 7 | Skizze: Versatz, Bedingungen unterdrücken | Unit-Tests Versatz (Rechteck innen/außen, Langloch, Kreis, offene Kette), Oberflächentest |
| 8 | Ansicht: benannte Ansichten speichern/wiederherstellen/löschen | Oberflächentest |
| 9 | Skizze: Fensterauswahl, Strg+A | Unit-Test `entitiesInBox`, Oberflächentest |
| 10 | Messen: Ecken anklicken, Lage und Δ X/Y/Z | Kernel-Test Ecke–Ecke/Ecke–Fläche, Oberflächentest |
| 11 | Skizze: Verlängern, Teilen | Unit-Test `extendEntity`/`splitEntity`, Oberflächentest |
| 12 | Skizze: Rechteck- und Kreismuster, Abstände nachträglich änderbar | Unit-Test `patternEntities` (Lage, Freiheitsgrade, Werte ändern), Oberflächentest |
| 13 | 3D-Fensterauswahl nach Auswahlfilter, Auswahl umkehren (Strg+I), Alles auswählen im Modell | Unit-Test Box-Logik, Oberflächentest |
| 14 | Automatische Skizzenbedingungen: parallel, senkrecht, tangential, konzentrisch, gleich; Strg unterdrückt; je Art abschaltbar | Unit-Tests Erkennung, Oberflächentest |
| 15 | Schnellzugriffsleiste (Befehle anheften) und Standardwerte je Werkzeug | Unit-Test Schema/Migration, Oberflächentest |
| 16 | Bestimmtheit der Skizze farbig (frei/bestimmt/Widerspruch) | Solver-Tests Nullraum, Oberflächentest |
| 17 | Trägheitsmomente aus dem Dreiecksnetz (Messen → Masse-Eigenschaften) | Kernel-Test Quader/Zylinder/Rohr |
| 18 | Gefüllte Schnittflächen im 3D-Schnitt (Stencil, Einstellung „Schnittflächen füllen“) | Oberflächentest (Pixel) |
| 19 | Ellipse in der Skizze (Solver, Profil, DXF) | Solver-/Kernel-/Oberflächentest |
| 20 | Farbschema hell/dunkel, letzte Werkzeugwerte über die Sitzung hinaus merken | Unit-Test Schema, Oberflächentest |
