# Arbeitsabläufe aus Inventor und SolidWorks – Abgleich mit PBCAD

Stand 03.11.2026, geprüft an `main` nach Release 0.36.0. Auftrag Patrick: „Schau dir Arbeitsabläufe in Inventor und SolidWorks an und setze diese hier um.“

Verglichen wurden nicht einzelne Befehle (das haben Funktionsbestand, Fusion- und MegaCAD-Abgleich schon getan), sondern die typischen **Abläufe von Anfang bis Ende**, wie Konstrukteure sie in Inventor und SolidWorks täglich gehen.

## 1. Abläufe im Vergleich

| Ablauf | Inventor | SolidWorks | PBCAD vorher | Ergebnis |
|---|---|---|---|---|
| Bauteil: Skizze → Feature → Eigenschaften → Zeichnung | Skizze, Extrusion, iProperties, »Zeichnung erstellen« | Skizze, Feature, Benutzerdefinierte Eigenschaften, »Zeichnung aus Teil« | Skizze, Features, Name/Nummer/Beschreibung, »Zeichnung ableiten« | Eigenschaften und Schriftfeld fehlten (AW4) |
| Baugruppe bottom-up: platzieren → Abhängigkeiten → Stückliste | Platzieren, Abhängigkeiten, Stücklisten-Editor | Einfügen, Verknüpfungen, Stückliste | vorhanden (#123, #186) | Stücklistenstruktur fehlte (AW5) |
| Top-down: Skelett → Komponenten | Layout, »Komponenten erstellen« | Layout, »Körper speichern« | vorhanden (Skelett, Im Kontext) | – |
| Varianten | iPart, Modellzustände | Konfigurationen | Variantentabelle, Regeln (Stufe 43) | Baugruppen-Konfigurationen später (AW6) |
| Ähnliches Projekt aus altem ableiten | »Kopie konstruieren« | »Pack and Go« | nur »Duplizieren« eines Dokuments, Teile blieben gemeinsam | fehlte (AW2) |
| Ein Teil in einer Baugruppe abwandeln | »Ersetzen durch Kopie« | »Unabhängig machen« | nur »Ersetzen« durch vorhandenes Teil | fehlte (AW3) |
| Vor einer Änderung: wo steckt das Teil? | »Wo verwendet« | »Verwendungsnachweis« | – | fehlte (AW1) |
| Vom Modell zur Zeichnung springen | Rechtsklick »Zeichnung öffnen« | Strg+D »Zeichnung öffnen« | nur über den Modellbrowser suchen | fehlte (AW1) |
| Prüfen und freigeben | Design Assistant, Vault-Status | Design Checker, PDM-Status | Problemliste, Freigabe mit Fingerabdruck (FU13/FU15) | – |
| Ausgabe gesammelt | Task Scheduler | Task Scheduler | Fertigungsmappe, Einzelteilzeichnungen | – |

## 2. Umgesetzt (dieser PR)

| Nr. | Was | Wo |
|---|---|---|
| AW1 | **Wo verwendet**: Abschnitt »Verwendet in« bei Bauteil und Baugruppe (Baugruppen mit Anzahl, oberste Baugruppen, Zeichnungen, abgeleitete Bauteile, jeweils anklickbar), Rechtsklick »Wo verwendet …« und **»Zeichnung öffnen«** im Modellbrowser, Befehle in der Befehlssuche | `src/core/verwendung.js`, `src/ui/arbeitsablauf.js` |
| AW2 | **Kopie konstruieren** (Pack and Go): Baugruppe mit allen Ebenen und Zeichnungen, je Dokument »kopieren« oder »wiederverwenden«, Präfix/Suffix und Suchen/Ersetzen für Namen und Nummern. Kaufteile, Normteile und verknüpfte Dateien sind vorab auf »wiederverwenden«; Generator-Einzelteile folgen ihrer Generator-Baugruppe, Varianten ihrem Werksbauteil. Verweise (Komponenten, abgeleitete Features, Stücklisten-Reihenfolge, Positionsnummern, Zeichnungsquelle, Schriftfeld) zeigen auf die Kopien; Kopien starten »In Arbeit« | `src/core/kopiekonstruieren.js`, Menüband Baugruppe › Komponente, Rechtsklick auf die Baugruppe |
| AW3 | **Unabhängig machen**: Komponente bekommt eine eigene Kopie ihres Bauteils (»Name-2«), die anderen Vorkommen bleiben. Bei Generator-Einzelteilen gesperrt (die entstehen bei jeder Generatoränderung neu) | Rechtsklick auf die Komponente, Eigenschaftenfeld |
| AW4 | **Eigenschaften**: Konstrukteur, Projekt und eigene Felder (z. B. Kunde, Auftrag) je Bauteil und Baugruppe. Das Schriftfeld setzt Platzhalter wie `{Projekt}`, `{Konstrukteur}`, `{Kunde}` ein; leere Benennung/Nummer kommen aus dem Modell; Umbenennen eines Bauteils zieht Benennung und Nummer seiner Zeichnungen nach, solange dort noch der alte Wert steht | `src/core/eigenschaften.js`, `src/ui/drawing.js` |
| AW5 | **Stücklistenstruktur**: Komponente »Referenz« (sichtbar, rechnet mit, aber nicht in Stückliste, Zuschnittliste, Bestellliste und ohne Positionsnummer, z. B. Wand, Bestand, Hilfsteil); Baugruppe »Phantom« (in Struktur- und Baukastenstückliste aufgelöst, ihre Teile stehen eine Ebene höher, z. B. Schraubengarnitur) | `src/core/subasm.js` |

Tests: `test/arbeitsablaeufe.test.mjs` (9 Fälle), e2e-Schritt »Arbeitsabläufe: …«.

## 3. Später (noch nicht umgesetzt)

| Nr. | Was | Warum noch nicht |
|---|---|---|
| AW6 | Baugruppen-Konfigurationen / Modellzustände: Komponenten je Zustand unterdrücken, eigene Stückliste je Zustand | Ausblenden nimmt heute auch aus der Stückliste – erst Sichtbarkeit und Stückliste sauber trennen (AW5 ist der erste Schritt) |
| AW7 | Ansichtsdarstellungen (benannte Sichtbarkeit und Farben) | hängt an AW6 |
| AW8 | Stückliste mit frei wählbaren Spalten aus Eigenschaften (z. B. Spalte »Kunde«) | Eigenschaften gibt es jetzt; Spalten-Editor folgt |
| AW9 | Skizzenblöcke (Inventor) für Layout-Skizzen | großer Umbau im Skizzierer |
| AW10 | Ansichtenpalette (SolidWorks): Ansichten aus einer Leiste aufs Blatt ziehen | Grundansichten automatisch decken das meiste ab |
