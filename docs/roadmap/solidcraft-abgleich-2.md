# SolidCraft-Abgleich, Runde 2: Design, Layout, Oberfläche, Werkzeuge

Stand 04.11.2026, nach Release 0.41.0. Patrick: »Danach noch mehr aus SolidCraft übernehmen – Design, Layout, Oberfläche, Funktionen, Werkzeuge«.
Grundlage diesmal: die Einstellungs-Entwürfe von SolidCraft (docs/design/preferences/pages/*.md: Darstellung, Layout, Navigation,
Skizze, Werkzeuge, Konstruktion, Grafik), der Umbau-Vorschlag (docs/design/ux-redesign) und die 24 Farbthemen
(assets/styles/ui/themes/*.json, MIT/Apache-2.0). Die Befehle selbst sind seit #202 vollständig (außer Rendern).

Was PBCAD schon hat, steht nicht in der Liste (Einstellungsprofile, Oberflächengröße, Zoom zum Cursor, Blickwinkel,
Ansichtswechsel animieren, Panels links/rechts, Verlaufsleiste, Schnellmessung, Markierungsmenü, Griffe, Werte mit Mausrad).

## Design und Layout (G1–G8)

| Nr. | SolidCraft | PBCAD heute | Umbau |
|---|---|---|---|
| G1 | 24 Farbthemen als Bildkarten (Graphite, Nord, Gruvbox, Solarized, Tokyo Night, Blueprint, Hoher Kontrast …) | Hell, Dunkel, Wie Windows | Themenauswahl mit Vorschaukarten; ausgewählte SolidCraft-Themen (Farbwerte aus deren Dateien) auf PBCAD-Farben abgebildet, 3D-Hintergrund und Raster gehen mit |
| G2 | Layout »Schwebend« oder »Kompakt« (Panels angedockt, dichter) | nur schwebende Karten | Umschalter Schwebend/Kompakt |
| G3 | Menüband mit Beschriftung oder nur Symbole | immer Beschriftung | Umschalter »Nur Symbole« (spart Höhe) |
| G4 | Meldungen unten rechts oder unten Mitte; Statusleiste ein/aus | Meldungen fest | Ort der Meldungen wählbar, Statusleiste abschaltbar |
| G5 | Verlauf unten, links oder im Browser | unten | Verlauf unten oder senkrecht links |
| G6 | Navigationsleiste: Position links/Mitte/rechts, Größe, im Leerlauf blass | fest unten rechts | Position, Größe kompakt/normal, »im Leerlauf blass« |
| G7 | 3D-Hintergrund: Verlauf des Themas oder eigene Farbe | nur Thema | eigene Hintergrundfarbe |
| G8 | Farbsehschwäche (Protan, Deutan, Tritan) für Farben mit Bedeutung | – | Modus, der Skizzenzustände, Achsen, Prüffarben und Meldungen umfärbt |

## Bedienung und Werkzeuge (W1–W8)

| Nr. | SolidCraft | PBCAD heute | Umbau |
|---|---|---|---|
| W1 | Dialoge: OK/Abbrechen unten oder oben | unten | Einstellung »Knöpfe oben« |
| W2 | Skizze öffnen: senkrecht drehen; Skizze beenden: zur vorigen Ansicht zurück / bleiben / zurück, wenn nicht gedreht | dreht hin, bleibt | Einstellung mit drei Möglichkeiten |
| W3 | Skizze: Hilfslinien aus Mittelpunkten und Kantenmitten, Fang am Kreuzungspunkt zweier Hilfslinien, Fang mit Alt aussetzen | Ausrichtungslinien an Punkten | Mittelpunkte/Kantenmitten als Quelle, Kreuzungsfang, Alt hält Fang an |
| W4 | Navigation: Drehen »Drehteller« oder »frei«, Zoomrichtung umkehren, Doppelklick mittlere Taste = Alles zeigen, Drehpunkt Ursprung/Bildmitte/Cursor | Drehpunkt am Cursor ein/aus | Drehart, Zoomrichtung, Doppelklick, Drehpunkt in drei Stufen |
| W5 | Extrusion: Operation automatisch (Vereinigen/Neu/Ausschnitt nach Berührung) | Standard Vereinigen | Automatik beim Anlegen |
| W6 | Ursprungsebenen als »XY/XZ/YZ« oder »Oben/Vorne/Rechts« | XY/XZ/YZ | Einstellung |
| W7 | Bildrate anzeigen | – | Anzeige in der Ecke (Einstellungen → Ansicht) |
| W8 | STEP mit Y nach oben: aufstellen anbieten | – | nach dem Einfügen Vorschlag »um X drehen« |

## Reihenfolge

Etappe 1: G1 Themen (mit Vorher/nachher-Bildern), G2, G3, G7. Etappe 2: G4–G6, G8, W1, W6, W7. Etappe 3: W2–W5, W8.
Alles schaltbar in den Einstellungen; Standard bleibt das heutige Aussehen, nur G1 bekommt neue Auswahl.

## Stand

- **Etappe 1** (G1–G3, G7): 14 Farbthemen, kompakter Aufbau, Menüband nur Symbole, eigene Hintergrundfarbe.
- **Etappe 2** (G4–G6, G8, W1, W6, W7): Meldungen mittig, Statusleiste aus, Navigationsleiste Lage/Größe/blass, Dialogknöpfe
  oben, Farben für Farbsehschwäche, Ebenennamen Oben/Vorne/Rechts, Bildrate.
- **Etappe 3** (W2–W5, W8): Skizze senkrecht drehen ein/aus, beim Beenden zurück zur Ansicht davor (immer / wenn nicht
  verschoben), Strg+8 Skizzenansicht; Hilfslinien auch aus Linienmitten, Kreuzung zweier Hilfslinien, Alt setzt den Fang aus;
  Pfeiltasten drehen 15° (Umschalt 90°), Strg+Pfeile schwenken, Strg+1…7 Standardansichten, Drehteller, Zoomrichtung
  umkehren, Doppelklick mittlere Taste = Alles zeigen, Drehpunkt Bildmitte/Ursprung; Extrusion wählt den Vorgang
  (Differenz/Vereinigen/neuer Körper) nach Lage; STEP-Import »Aufstellen« (Y oben → Z oben) mit Vorschlag nach dem Einfügen.
- **Lücken aus dem Inventar** (siehe solidcraft-inventar.md, L1–L16): Klick-Durchschalten und »Andere auswählen…« (L1),
  Grenzen finden am Gelenk (L2), Quelle neu verknüpfen (L4), L/R/C mit zuletzt benutzter Variante (L7), Schwerpunkt mit Hauptachsen im Modell (L13).
