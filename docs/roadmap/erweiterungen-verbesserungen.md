# Erweiterungen und Verbesserungen nach dem MegaCAD-Abgleich

Stand 25.10.2026. Grundlage: [megacad-metall-abgleich.md](megacad-metall-abgleich.md) ist vollständig umgesetzt (M1–M24,
#71–#94). Dieser Plan sammelt, was danach den größten Nutzen für die Arbeit im Metallbau bringt: **neue Funktionen (E)**
und **Verbesserungen am Bestand (V)**. Jede Zeile wurde am Code geprüft (Stand `main` nach #94).

Aufwand: XS < ½ Tag · S ≈ 1 Tag · M 2–3 Tage · L ≥ 1 Woche. Prio: P0 zuerst, P3 nur bei Bedarf.

## Kurzfassung

Mit M1–M24 kann PBCAD konstruieren. Was noch fehlt, ist der Schritt **vom Modell zum Auftrag**: Was kostet das Teil? Wie
viele Stangen und Tafeln brauche ich? Was geht an den Laser, was an den Kunden? Deshalb stehen Stangenoptimierung,
Kalkulation und Fertigungsmappe ganz vorne. Daneben gibt es drei Verbesserungen, die echte Fehler beheben: die gleiche
Listen-Schwäche, die beim Kantteil auffiel, steckt noch in den Generatoren; ein Oberflächentest wackelt; verknüpfte Bauteile
lassen sich noch nicht aus PBCAD heraus in ihrer Quelldatei öffnen.

**Stand 25.10.2026:** Freigegeben sind F1 und F2. Stangenoptimierung (E1) und Kalkulation (E2) hat Patrick vorerst
zurückgestellt; umgesetzt sind V1, V2, E7 (#96) sowie V3, E3, E4 und E5.

## Teil A – Erweiterungen

### A.1 Vom Modell zum Auftrag

| Nr | Funktion | Heute | Nutzen | Aufwand | Prio |
|---|---|---|---|---|---|
| E1 ⏸ | **Stangenoptimierung (1D-Zuschnitt)** – zurückgestellt (Patrick, 25.10.2026); Entwurf mit Tests liegt als `plan/zurueckgestellt/E1-stangenplan.patch` im Projektordner: Teile der Zuschnittliste auf Stangen (Standard 6000/6500 mm je Profil, Greiferrest und Endbeschnitt aus der Fertigungsprüfung) verteilen, Verschnitt in % und kg, Schnittplan als Liste und Excel, Restlängen-Lager optional | Zuschnittliste gruppiert, Fertigungsprüfung kennt Stangenlänge (`dfm.js`), aber keine Verteilung | Materialbestellung und Verschnitt sofort sichtbar; täglich nutzbar | M | P0 |
| E2 ⏸ | **Kalkulation** – zurückgestellt (Patrick, 25.10.2026): Material (kg × €/kg je Werkstoff/Profilart), Laser (Schneidweg + Einstiche × Maschinensatz), Schweißen (Nahtlänge aus M9 × min/m), Biegen (je Biegung), Oberfläche (Verzinken nach kg, Pulvern nach m²), Zuschlag; Kalkulationsblatt als Excel und im Panel | Masse, Schneidweg, Einstiche, Nähte, Oberfläche einzeln vorhanden; keine Preise | Angebotspreis direkt aus dem Modell statt Nebenrechnung | M | P0 |
| E3 ✓ | **Fertigungsmappe als PDF**: alle Zeichnungen, Stückliste, Zuschnittliste, Biegeliste, DXF-/STEP-Paket je Position als ZIP. Umgesetzt als ZIP mit PDF (jede Zeichnung in ihrem Blattformat, Stück- und Zuschnittliste A4), Excel-Listen, Zuschnitt-CSV, STEP gesamt und je Position, Profil-STEPs für den Rohrlaser, Zeichnungen als DXF; fehlende Einzelteilzeichnungen entstehen dabei | PDF je Zeichnung, Listen einzeln | ein Klick für die Werkstatt bzw. den Laser-Dienstleister | S | P1 |
| E4 ✓ | **Angebotsblatt**: Render-Bild (M22), Hauptmaße, Werkstoff/Oberfläche, Gewicht, Feld für den Preis (von Hand, solange E2 zurückgestellt ist), Firmenkopf aus den Einstellungen, als PDF | fehlt | Angebote ohne Word-Nacharbeit | S | P1 |
| E5 ✓ | **Einzelteilzeichnungen auf Knopfdruck**: für alle Positionen einer Baugruppe (oder alle Körper eines Generators) Zeichnungen mit Ansichten, Bemaßung (Auto-Bemaßung vorhanden) und Schriftfeld erzeugen | Zeichnung je Dokument von Hand | Fertigungszeichnungen für 30 Positionen in Minuten | M | P1 |
| E6 | **Blech-Nesting (2D)**: Platten, Kantteil-Abwicklungen, Knotenbleche auf Tafeln (z. B. 3000 × 1500) verteilen, Tafel-DXF, Ausnutzung in % | DXF je Teil | Tafelbestellung und Laser-Vorbereitung | L | P2 |

### A.2 Konstruktion

| Nr | Funktion | Heute | Nutzen | Aufwand | Prio |
|---|---|---|---|---|---|
| E7 ✓ | **Oberfläche und RAL-Farbe je Bauteil**: Feld Oberfläche (roh, verzinkt, pulverbeschichtet + RAL, verzinkt + pulver) in Bauteil/Generator; Fotodarstellung färbt danach, Stückliste nutzt es | Werkstoff ja, Oberfläche nein | Angebotsbilder in Kundenfarbe; Pulvern richtig kalkuliert | S | P0 |
| E8 | **Schiebetor (freitragend)** mit Laufschiene, Rollenböcken, Gegengewichtsteil, Torfüllung aus dem Geländer-Baukasten; dazu **Schiebegelenk** in der Kinematik | Tor-Generator: Dreh-/Doppeltor; nur Drehgelenk | häufiger Auftrag, mit Bewegungsprüfung | M | P1 |
| E9 | **Zaun-Generator**: Zaunfelder in Reihe mit Pfosten, Gefälle/Stufung am Hang, Füllungen aus dem Geländer | Geländer über Eck, kein Gelände | Grundstückszäune schnell und mit Stückliste | M | P1 |
| E10 | **Vordach/Carport-Generator**: Stützen, Binder, Pfetten mit Pfettenschuhen, Windverband – kombiniert die Stahlbau-Generatoren aus #88 | Einzelne Stahlbau-Generatoren | ganzes Vordach aus wenigen Maßen | M | P2 |
| E11 | **Beschläge als Normteile**: Torbänder/Anschweißbänder, Schlosskasten, Bodenanschlag, Kugelkopf-Pfostenkappen | Schrauben/Muttern/Spannschloss | Tore und Geländer mit vollständiger Stückliste | S | P2 |
| E12 | **Blech erweitert**: Laschen/Flansche an Platten (Kantteil an Kontur), Blechkasten aus Quader mit Eckfreischnitt, Treppenwange aus Blech mit Abwicklung | Kantteil (gerader Querschnitt) | Kassetten, Abdeckungen, Blechwangen | L | P2 |
| E13 | **Sweep und Loft als freie Features**, **Bezugsebenen/-achsen** | intern genutzt (Biegerohr), nicht als Werkzeug | Sonderformen, Skizzen auf beliebigen Ebenen | M | P2 |
| E14 | **Eigene Teilebibliothek**: oft genutzte Bauteile/Generator-Vorlagen projektübergreifend ablegen und einfügen (verknüpft über M24) | Generator-Vorlagen je Gerät, verknüpfte Bauteile | Standardteile (Konsolen, Fußplatten) nicht neu zeichnen | S | P2 |

### A.3 Austausch

| Nr | Funktion | Heute | Nutzen | Aufwand | Prio |
|---|---|---|---|---|---|
| E15 | **glTF/GLB und 3MF-Export** | STEP, STL, PNG | 3D-Ansicht für Kunden im Browser/Handy; 3D-Druck mit Farben | S | P2 |
| E16 | **Verknüpfte Baugruppen** (Rest aus M24) | nur Bauteile verknüpfbar | große Projekte in Teilen bearbeiten | M | P3 |

## Teil B – Verbesserungen am Bestand

| Nr | Verbesserung | Befund | Aufwand | Prio |
|---|---|---|---|---|
| V1 ✓ | **Listen-Eingaben mit Ausdrücken** in allen Generatoren (Lauflängen, Feldteilungen …) | `generator.js:44` und `balkon.js:117` trennen noch an Leerzeichen; `L + 5` zerfällt. Derselbe Fehler wurde beim Kantteil in #94 behoben; `splitList` aus `blech.js` überall nutzen | XS | P0 |
| V2 ✓ | **Oberflächentest stabil** | CI-Lauf zu #94 brach einmal am Tastenkürzel-Dialog ab (`tools/e2e.mjs:935`, Klick-Timeout); auf Sichtbarkeit warten statt sofort klicken | XS | P0 |
| V3 ✓ | **Verknüpfte Bauteile bequemer**: Aktualisieren, Quelldatei öffnen, Verknüpfung lösen bzw. „Als eigene Datei speichern“ auch im Kontextmenü des Baums | im Eigenschaftenfeld gab es die Knöpfe schon, im Baum nicht; Aktualisieren beim Öffnen läuft schon (M24) | XS | P1 |
| V4 | **Neuaufbau großer Generatoren schneller**: gleiche Stäbe (gleicher Querschnitt, gleiche Länge und Schnitte) nur einmal bauen und versetzen, erst Zeit messen | Feature-Zwischenspeicher gibt es schon (`build.js`, Präfix-Cache); ein Generator wird bei jeder Parameteränderung aber als Ganzes mit allen Stäben neu gebaut | M | P2 |
| V5 | **Generator-Bedienung**: Bemaßungsbild der Parameter im Eigenschaftenfeld (was ist „Gurtabstand“?), Fehler direkt am betroffenen Feld, Prüfhinweise (Öffnung, Steigung) farbig neben dem Wert | Modell rechnet bei jeder Änderung neu, Fehler und Hinweise erscheinen nur als Meldung bzw. Liste | M | P1 |
| V6 | **Kollision automatisch in den Gelenkbereich**: aus der Bewegungsprüfung den freien Bereich als min/max vorschlagen | Prüfung zeigt nur Treffer | S | P2 |
| V7 | **Fotodarstellung**: Hintergrund (weiß, Verlauf, transparent für Angebote), Bildgröße wählbar, Kamera speichern | fester Hintergrund, Faktor 4 | S | P2 |
| V8 | **Hilfe im Programm**: Kurzanleitung je Generator und Werkzeug (F1), Beispielprojekte je Generator auf der Startseite | ein Beispiel (Schweißrahmen) | S | P2 |
| V9 | **Signierter Installer** (SmartScreen-Warnung weg) | ungesigniert; braucht ein Code-Signing-Zertifikat auf Patricks Namen/Firma | XS + Zertifikat | P2 |

## Reihenfolge

| Block | Inhalt | Warum so |
|---|---|---|
| **F1 (P0)** | V1 ✓, V2 ✓, E7 ✓ (E1, E2 zurückgestellt) | zwei schnelle Fehlerbehebungen, dann Oberfläche |
| **F2 (P1)** | E3 ✓, E4 ✓, E5 ✓, V3 ✓, V5, E8, E9 | Ausgabe für Werkstatt und Kunde, dann Bedienung, dann die zwei häufigsten neuen Generatoren |
| **F3 (P2)** | E10, E11, E12, E13, E14, E15, V4, V6, V7, V8, V9, E6 | Ausbau nach Bedarf; Blech-Nesting zuletzt, weil am aufwendigsten |
| **F4 (P3)** | E16 | nur bei konkretem Bedarf |

## Entscheidungen und offene Punkte

1. **Preise in der Kalkulation (E2)** kommen aus den Einstellungen (Werkstoff €/kg, Maschinensätze €/min, Zuschläge) mit
   neutralen Startwerten. PBCAD ruft keine Preise aus dem Netz ab.
2. **Stangenoptimierung (E1)** rechnet nach „First Fit Decreasing“ mit anschließender Verbesserung; das ist schnell und
   in der Praxis nahe am Optimum. Keine Garantie auf das mathematische Optimum.
3. **Keine Statik**, wie bisher (ADR-0004). Vordach/Carport (E10) liefert Geometrie, keine Bemessung.
4. **Signierter Installer (V9)** geht nur mit einem Zertifikat, das Patrick beschafft (ca. 200–400 €/Jahr). Ohne das bleibt
   die Zeile offen.
5. Releases macht weiter der Thread „Entwicklungsplan“. Skizzenwerkzeuge bleiben beim Thread „Werkzeuge und
   Einstellungscenter“.
