# Verbesserungsvorschläge nach 0.50.1 (10.11.2026)

Geprüft gegen `main` (Stand 0.50.1, #233) und alle bisherigen Pläne. Schon umgesetzt und deshalb nicht
mehr dabei: Stangenplan, Kalkulation, Zeichnungssatz, Schweißplan/WPS, assoziatives Spiegeln,
Positionsdarstellungen, Punktwolke, Teilebibliothek, Zeichnung aufräumen, Abbrechen langer Rechnungen,
Pack and Go, Etiketten mit QR, IFC, DSTV.

## Paket A – Auftrag → Werkstatt → Montage

| Nr. | Was | Nutzen | Aufwand |
|---|---|---|---|
| Z1 | **Reststücklager**: Reste aus dem Stangenplan ab einstellbarer Länge (z. B. 500 mm) merken (Profil, Werkstoff, Länge); der nächste Stangenplan nimmt zuerst Reste, Restliste druckbar | weniger Verschnitt, keine Zettelwirtschaft | S–M |
| Z2 | **Laufzettel je Teil**: Arbeitsgänge (Sägen, Laser, Bohren, Kanten, Schweißen, Verzinken) automatisch aus dem Modell, mit QR-Code; im Werkstattmodus am Tablet abhaken, Stand im Modellbaum sichtbar | Werkstatt weiß, was als Nächstes kommt | M |
| Z3 | **Lade- und Montageliste**: Teile je Montagestelle oder Bauabschnitt, Gewicht je Paket, Schrauben und Dübel je Stelle; als PDF in der Fertigungsmappe | nichts vergessen auf der Baustelle | S |
| Z4 | **Zeichnungsvergleich**: zwei Versionen gegenüberstellen, Änderungen mit roter Wolke markiert, Änderungsindex im Schriftfeld zählt automatisch hoch | Änderungen an Werkstatt und Kunde sauber weitergeben | M |
| Z5 | **QR am Teil → Einbauort**: Etiketten-QR öffnet auf dem Handy eine 3D-Ansicht (HTML-Datei in der Mappe, ohne Internet), in der das Teil an seinem Platz leuchtet | Montage ohne Plan suchen | M |

## Paket B – Konstruktion und Büro

| Nr. | Was | Nutzen | Aufwand |
|---|---|---|---|
| Z6 | **Statik-Schnellprüfung Geländer/Treppe**: Holmlast nach DIN EN 1991-1-1/NA (0,5 bzw. 1,0 kN/m), Biegung und Durchbiegung von Pfosten und Handlauf, Dübelzug an der Fußplatte; Ampel am Generator, Nachweisblatt als PDF (Vorbemessung, ersetzt keinen Statiker) | Pfosten passend wählen, bevor gebaut wird | M |
| Z7 | **Modellzustände in der Baugruppe** (AW6): z. B. »Bauabschnitt 1/2«, »mit/ohne Füllung«; je Zustand eigene Stückliste und Zeichnungsansicht | Varianten für Angebot und Bauabschnitte ohne Kopien | M–L |
| Z8 | **Stückliste mit frei wählbaren Spalten** (AW8) aus Eigenschaften (Kunde, Lieferant, Oberfläche …), Reihenfolge wird gemerkt | Stückliste passend für Einkauf und Werkstatt | S |
| Z9 | **GAEB-Import/-Export**: Leistungsverzeichnis (X83) einlesen, Positionen den Bauteilen zuordnen, Preise aus der Kalkulation als Angebot (X84) zurückgeben | Ausschreibungen direkt beantworten | M |

## Paket C – Praxis

| Nr. | Was | Nutzen | Aufwand |
|---|---|---|---|
| Z10 | **Praxistest mit echtem Auftrag** (offen seit R5): Patrick schickt Maße oder eine .wcad, der ganze Weg bis zur Mappe wird damit geprüft und Fehler werden behoben | zeigt die echten Stolpersteine | S–M |

## Empfehlung

Paket A zuerst (Z1, Z3, Z2, Z4, Z5), weil der Weg Auftrag → Werkstatt der zuletzt genannte nächste Schritt war.
Danach aus Paket B Z6 und Z8. Z10 läuft, sobald ein echter Auftrag da ist.

## Stand (10.11.2026)

Patrick: »Alle Empfehlungen« → Z1–Z5, Z6, Z8 umgesetzt; Z7 und Z9 nicht freigegeben, Z10 wartet auf einen echten Auftrag.

| Nr. | Umsetzung | Wo |
|---|---|---|
| Z1 | Stangenplan belegt passende Reste zuerst (kürzester passender), »Reste ins Lager buchen«, Restlager-Dialog mit Lagerplatz und Druck; Einstellungen Reste zuerst / Rest ab (500 mm) | `src/core/stangen.js`, Zuschnittliste, Export → Werkstatt → Restlager |
| Z2 | Laufzettel A5 quer je Position mit Arbeitsgängen aus dem Modell, QR-Code und Einbauort-Bild; Fertigungsstand zum Abhaken (auch im Werkstattmodus), Stand im Modellbaum | `src/core/laufzettel.js`, Export → Werkstatt → Laufzettel / Fertigungsstand |
| Z3 | Lade- und Montageliste: Komponenten einem Bauabschnitt zuordnen, je Abschnitt Teile, Paketgewicht, Schrauben/Dübel/Scheiben; PDF und CSV | `src/core/ladeliste.js`, Export → Montage → Ladeliste |
| Z4 | Zeichnungsvergleich: Stand je Blatt merken, Maße/Maßstab/Modell vergleichen, Änderung mit vorgeschlagenem Text eintragen, Wolke mit Index an geänderten und neuen Maßen | `src/core/aenderung.js`, Zeichnung → Beschriften → Vergleichen |
| Z5 | Einbauorte fürs Handy: HTML-Datei ohne Internet, je Position ein Bild mit dem Teil orange hervorgehoben, Suche nach Pos oder QR-Text. Abweichung vom Plan: der QR-Code öffnet die Datei nicht selbst (dafür bräuchte es einen Server); die Datei wird aufs Handy kopiert, das Bild steht zusätzlich auf jedem Laufzettel | `src/core/einbauort.js`, Export → Montage → Einbauorte |
| Z6 | Statik-Schnellprüfung im Geländer-Generator (Gruppe »Statik«): Holmlast nach DIN EN 1991-1-1/NA, Pfosten und Handlauf, Zug je Dübel; Ampel im Generatorfeld, Warnung bei über 100 %, Nachweisblatt. Vorbemessung, kein Standsicherheitsnachweis | `src/core/statik.js`, Export → Montage → Statik Geländer |
| Z8 | Stückliste »Spalten…«: feste Spalten und eigene Eigenschaften wählen und ordnen; gilt für Fenster, CSV und Fertigungsmappe | `src/core/bomspalten.js` |

Tests: `test/werkstatt-z.test.mjs`.
