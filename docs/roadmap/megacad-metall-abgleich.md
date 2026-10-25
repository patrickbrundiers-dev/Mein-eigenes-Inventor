# Abgleich MegaCAD Metall 3D ↔ PBCAD

Stand: 25.10.2026 · PBCAD `main` @ `ac8c811` (nach #68) · Status: **freigegeben 25.10.2026, Umsetzung läuft** (erledigt: Block A – M1 #71, M2 #73, M3 #74, M4 #76; Block B – M5 und M6 #79, M8)

Auftrag: Patrick hat den Funktionsumfang der Produktseite „MegaCAD Metall 3D“ geschickt („Das möchte ich auch alles
drin haben“). Übernommen wird nur der **Funktionsumfang als Ziel**; keine Texte, Bilder, Dialoge oder Daten von
MegaCAD. Normdaten (Profilmaße, Schrauben) kommen aus den öffentlichen Normen.

Ergänzt [feature-matrix.md](feature-matrix.md), [werkzeuge-einstellungen.md](werkzeuge-einstellungen.md) und
[rohrlaser-editor-abgleich.md](rohrlaser-editor-abgleich.md); was dort schon steht, wird hier nur verlinkt.

Status: **vorhanden** · **teilweise** · **fehlt** · **n. m.** (nicht machbar, Grund steht dabei)
Aufwand wie im P1-Backlog: **XS** < 1 h · **S** ≈ halber Tag · **M** 1–2 Tage · **L** > 2 Tage (wird in Stufen geteilt)
Priorität: **P0** sofort, direkter Nutzen Rohrlaser/Rahmen · **P1** nächster Block · **P2** danach · **P3** nur bei Bedarf

## 1. Abgleich je Funktion

### 1.1 Grundlagen

| Funktion (Ziel) | PBCAD heute | Status | Nutzen für Patrick | Aufwand | Prio | Stufe |
|---|---|---|---|---|---|---|
| 2D und 3D in einem Programm, 2D → 3D | Skizze → Extrusion/Drehung, Zeichnungen aus 3D, DXF-Export | vorhanden | – | – | – | – |
| Nachträglich ändern | parametrischer Feature-Baum, Formeln, Parameter | vorhanden | – | – | – | – |
| Gewicht und Länge der Profile automatisch | Zuschnittliste: Länge, Gehrungen, Masse je Zeile (`src/core/cutlist.js`); Statusleiste: Masse | vorhanden | fehlt nur: Metergewicht (kg/m) in der Profilauswahl und Summe je Profilart | XS | P0 | M1 |
| Gehrungswinkel in zwei Ebenen | Gehrung nur um eine Querachse (Rahmen aus ebener Skizze; Einzelprofil mit `miterAxis`) | teilweise | räumliche Rahmen, Geländer über Eck, Treppenwangen: schräge Schnitte in zwei Ebenen für den Rohrlaser | M | P0 | M3 |
| Normgerechte Stahlprofile (DIN/EN) | 8 Querschnittsarten: Rundrohr, Quadrat-/Rechteckrohr, Flach, Rund, Vierkant, L gleichschenklig, U (`src/core/sections.js`) | teilweise | Stahlbau, Podeste, Treppen brauchen IPE/HEA/HEB/UPN/T | M | P1 | M6 |
| Regelkörper (Kugel, Kegel, Kegelstumpf, Torus …) | nur über Skizze + Drehung | teilweise | Pfostenkappen, Kugeln, Zierteile in einem Klick | S | P1 | M5 |
| Zeichnung säubern (doppelte/überlappende Elemente, Endpunkte zusammenführen, Winkel glätten) | fehlt | fehlt | wichtig, sobald DXF-Import kommt (Fremddaten); auch für eigene Skizzen | S | P1 | M7 |

### 1.2 3D-Profilgenerator und Rohre

| Funktion (Ziel) | PBCAD heute | Status | Nutzen | Aufwand | Prio | Stufe |
|---|---|---|---|---|---|---|
| Profilzüge über mehrere Eckpunkte im Raum | Rahmen nur aus **ebener** Skizze (`buildFrame`); kein 3D-Pfad | teilweise | räumliche Gestelle, Geländer, Treppenwangen direkt als Profilzug | M | P0 | M2 |
| Profil drehen (Rollwinkel), Bezugspunkt (Mitte/Kante) | Rahmen: Versatz/Kante ja, Rollwinkel je Segment nein | teilweise | Rechteckrohr hochkant/flach, bündig an Kante | S | P0 | M2 |
| RohrConnect: Rohr über Polygonzug mit Biegeradien | fehlt (Knickrahmen ist ein Sonderfall mit einem Knick) | fehlt | gebogene Rohre (Handläufe, Bügel), Biegeliste fürs Biegen, Abwicklungslänge für den Rohrlaser | M | P0 | M4 |
| Rohre an Ecken: Gehrung oder Bogen wählbar | Rahmen: Gehrung/Stumpf/T-Stoß/Sattelschnitt | teilweise | mit M2/M4 abgedeckt | – | – | M2/M4 |

### 1.3 Stahlbau-Anschlüsse

Nur **Geometrie** nach üblichen Konstruktionsregeln; keine statische Bemessung (ADR-0004: FEM/Haftung).
„Nach DASt“ heißt hier: Bauform und Maße der Typisierten Anschlüsse als Vorlage, keine Nachweise.

| Funktion (Ziel) | PBCAD heute | Status | Nutzen | Aufwand | Prio | Stufe |
|---|---|---|---|---|---|---|
| Stirnplatten, Fußplatten, Kopfplatten an Profilenden | über Skizze + Extrusion von Hand | teilweise | sehr häufig im Metallbau: Platte mit Bohrbild am Rohrende, mit DXF für den Laser | M | P1 | M8 |
| Rippen / Steifen | fehlt (auch als 3D-Feature „Rippe“ fehlt) | fehlt | Steifen in Stirnplatten, Konsolen | S | P1 | M8 |
| Biegesteifer Eckstoß (Rahmenecke mit Stirnplatten und Schrauben) | fehlt | fehlt | Hallen-/Vordachrahmen | M | P2 | M15 |
| Pfetten mit Pfettenschuhen, Pfettenstoß | fehlt | fehlt | Vordächer, Carports | M | P2 | M15 |
| Windverbände mit Spannschloss | fehlt | fehlt | Hallen, Carports | M | P2 | M15 |
| Schweißnähte mit Symbolen | fehlt | fehlt | Fertigungszeichnungen für Schweißbaugruppen (Kehlnaht, a-Maß, umlaufend, Montagenaht) nach ISO 2553 | M | P1 | M9 |

### 1.4 Generatoren (Treppen, Geländer, Tore, Balkone)

Grundidee für alle: ein **Generator ist ein Feature**, das aus wenigen Parametern viele Profile/Platten als Körper
eines Bauteils erzeugt. Dadurch funktionieren Zuschnittliste, Gewicht, STEP-Export, Zeichnung und Rückgängig ohne
Sonderwege, und jede Änderung (z. B. Pfosten verschieben) baut alle abhängigen Teile neu – das ist die geforderte
„automatische Aktualisierung der Füllungen“.

| Funktion (Ziel) | PBCAD heute | Status | Nutzen | Aufwand | Prio | Stufe |
|---|---|---|---|---|---|---|
| Generator-Grundgerüst (Dialog mit Vorschau, Parameter, Neuaufbau) | Knickrahmen-Feature ist das Muster | teilweise | Basis für alles Folgende | M | P1 | M10 |
| Geländer: Pfosten mit automatischer Aufteilung, Handlauf, Ober-/Untergurt | fehlt | fehlt | häufigster Auftrag im Schlosserhandwerk | L | P1 | M11 |
| Füllungen: Staketen, Glas mit Glashaltern, Blechkassette, Kreuz (mit Ring), Rahmen mit Staketen, auch über Eck | fehlt | fehlt | zwischen zwei Pfosten einsetzen, folgt den Pfosten | L | P1 | M11 |
| Tore: Einzel-/Doppeltor, gerade, Rundbogen, Stichbogen, Stabteilung | fehlt | fehlt | Hoftore, Gartentore | M | P1 | M12 |
| Treppe geradläufig: Wangen (Flach, U, Blech) oder 1-/2-Holm, Stufen Gitterrost/Blech/Holz, aufgesattelt oder seitlich, Stoß oder Gehrung | fehlt | fehlt | Industrie- und Außentreppen; Steigungsregel prüfen (DIN 18065, z. B. 2s + a) | L | P1 | M13 |
| Treppe L- und U-Form mit Podest, Brüstungshöhen Treppe/Podest | fehlt | fehlt | | L | P2 | M14 |
| Spindeltreppe | fehlt | fehlt | seltener; Wangenabwicklung braucht Blech (M17) | L | P2 | M14 |
| Balkon mit Geländer (Stützen, Rahmen, Belag) | fehlt | fehlt | kombiniert Profilzug + Geländer-Generator | M | P2 | M16 |
| Industrietreppen- und Geländer-Generator gesamt | – | – | = M13 + M14 + M11 | – | – | – |

### 1.5 Stücklisten, Normteile, Austausch

| Funktion (Ziel) | PBCAD heute | Status | Nutzen | Aufwand | Prio | Stufe |
|---|---|---|---|---|---|---|
| Mengenstückliste (gleiche Teile zusammengefasst) | Stückliste der Baugruppe mit Masse, Zuschnittliste gruppiert | vorhanden | – | – | – | – |
| Struktur- und Baukastenstückliste | fehlt; dafür fehlen **Unterbaugruppen** | fehlt | mehrstufige Schweißbaugruppen (Gestell → Rahmen → Profile) | L | P1 | M19 |
| Automatische Aktualisierung der Stückliste | Stückliste/Zuschnittliste werden aus dem Modell berechnet | vorhanden | – | – | – | – |
| Export als Excel-Datei | CSV (öffnet in Excel) für Zuschnitt- und Stückliste | teilweise | echtes `.xlsx` mit Spaltenbreiten, Zahlenformat, Summenzeile | S | P1 | M18 |
| Normteile (Schrauben, Muttern, Scheiben, Gewindestangen, Spannschloss) | fehlt; nur Bohrung mit Gewinde/Senkung | fehlt | Eckstoß, Stirnplatten, Windverband; Stückliste mit Normbezeichnung | M | P1 | M20 |
| CADENAS PARTS4CAD | – | n. m. | kostenpflichtiger Dienst mit eigener Lizenz/Schnittstelle; Ersatz: Herstellerteile als STEP laden (geht schon) + eigene Normteile (M20) | – | P3 | – |
| STEP, STL | Import und Export | vorhanden | – | – | – | – |
| DXF (2D) | Export aus Skizze/Platte/Zeichnung; Import fehlt (P2 im Rohrlaser-Abgleich) | teilweise | Fremdzeichnungen und alte Laserkonturen in Skizze übernehmen | M | P1 | M21 |
| IGES | fehlt; ob der eingebaute OpenCascade-Build IGES enthält, wird in M21 geprüft | fehlt | ältere Kundendaten | S–M | P2 | M21 |
| Bildexport (PNG), 3MF, glTF/OBJ, VRML | fehlt | fehlt | Bilder fürs Angebot, 3D für Kunden/Webseite | S | P2 | M21 |
| Native Formate Inventor, SolidWorks, Parasolid, Solid Edge, NX, ACIS/SAT, DWG | – | n. m. | geschlossene Formate, nur mit Lizenz-Bibliotheken; Austausch läuft über STEP (DWG über DXF) | – | – | – |

### 1.6 Blech, Darstellung, Arbeiten im Team, Kinematik

| Funktion (Ziel) | PBCAD heute | Status | Nutzen | Aufwand | Prio | Stufe |
|---|---|---|---|---|---|---|
| Blechteile: Kantteile, Abwicklung, Faltkörper aus Quader, Abwicklung Treppenwangen | nur Knickrahmen-Biegung; ADR-0002: keine allgemeine Blechfunktion | fehlt | Kassetten, Wangen aus Blech, Abdeckungen; DXF-Abwicklung für den Laser | L | P2 | M17 |
| Fotorealistische Darstellung für Angebote (Materialien, Licht, Schatten) | Werkstofffarben, schattiert | teilweise | Angebotsbilder ohne Fremdprogramm | M | P2 | M22 |
| Verteiltes/paralleles Arbeiten mehrerer Konstrukteure | ein Anwender, eine Datei | fehlt | gering (ADR-0004); sinnvoller Teil: Bauteile als eigene Dateien in Baugruppen verknüpfen | L | P3 | M24 |
| Kinematik / Animation | Knickrahmen bewusst starr; Baugruppe ohne Bewegung | fehlt | Tor-Öffnungswinkel, Klappmechanik prüfen; Explosionsdarstellung | L | P3 | M23 |

## 2. Abhängigkeiten

```
M1 Metergewicht ───────────────────────────────┐
M2 3D-Profilzug ──► M3 Gehrung 2 Ebenen ──┬──► M10 Generator-Gerüst ──► M11 Geländer ──► M12 Tor
          │                               │                          │           └──► M16 Balkon
          └──► M4 Rohr über Polygonzug    │                          └──► M13 Treppe gerade ──► M14 L/U, Spindel
M6 DSTV-Profile ──────────────────────────┴──► M8 Stirnplatte/Rippe ──► M15 Stahlbau-Anschlüsse
M20 Normteile ──────────────────────────────────────────────────────────┘ (Schrauben, Spannschloss)
M21 DXF-Import ──► M7 Säubern (sinnvoll nach Import)
M19 Unterbaugruppen ──► Struktur-/Baukastenstückliste;  M18 Excel unabhängig
M17 Blech (ADR-0005) ──► Blechkassetten-Füllung, Blechwangen, Spindeltreppe
```

## 3. Stufenreihenfolge

Jede Stufe = ein PR von `main` mit Tests (Kern-, Kernel-, Oberflächentest), CI grün → selbst mergen, Release-Zeile an
den Entwicklungsplan-Thread. Große Stufen (L) werden beim Start in 2–3 PRs geteilt.

### Block A (P0) – Rahmen und Rohre für den Rohrlaser

| Stufe | Inhalt | Abnahme / Tests | Aufwand |
|---|---|---|---|
| M1 ✓ | Metergewicht in Profilauswahl und Zuschnittliste, Summen je Profilart (#71) | Unit-Test Gewicht = Fläche × Dichte | XS |
| M2 ✓ | **3D-Pfad** über Eckpunkte (Koordinatentabelle, Punkte relativ/absolut, Ecken anderer Körper fangen) und Profilzug darauf; Rollwinkel und Bezugspunkt je Segment. Umgesetzt als Feature »Profilzug 3D« (`src/core/profilzug.js`, `buildMembers` in `build.js` gemeinsam mit dem Rahmen); Ecken anderer Körper fangen folgt | Kernel-Test: räumlicher Zug mit 4 Ecken, Längen und Masse | M |
| M3 ✓ | **Gehrung in zwei Ebenen**: Schnitt auf der Winkelhalbierenden im Raum, Zuschnittliste zeigt Gesamtwinkel und die Anteile über Breite/Höhe (Kennzeichen »2 Ebenen«; CSV-Kopf bleibt für den Rohrlaser-Import gleich, die Schnittfläche kommt über STEP); 2D/3D-Schnitt aus #60 gilt weiter | Kernel-Test: beide Hälften spaltfrei, Winkel gegen Handrechnung | M |
| M4 ✓ | **Rohr über Polygonzug** mit Biegeradius (Sweep), Biegeliste (Gerade, Bogenwinkel, Drehung, Abwicklungslänge auf der Mittellinie; Feature »Rohr gebogen«, `src/core/biegerohr.js`, Kreis(ring) per Sweep) | Kernel-Test: Länge = Summe Geraden + Bögen; Prüfung Radius ≥ Mindestradius | M |

### Block B (P1) – Bibliothek, Anschlüsse, erste Generatoren

| Stufe | Inhalt | Aufwand |
|---|---|---|
| M5 ✓ | Regelkörper als Feature: Quader, Zylinder, Kugel, Kegel, Kegelstumpf, Torus, Pyramide | S |
| M6 ✓ | DSTV-/Stahlprofile: IPE, HEA, HEB, UPN, T mit Ausrundung und Metergewicht aus den Normtabellen (UPN-Flanschneigung und T-Kantenrundung vereinfacht, ±3 %); L ungleichschenklig gab es schon | M |
| M7 | Skizze säubern: doppelte/überlappende Elemente, Endpunkte zusammenführen, fast-waagrecht/-senkrecht korrigieren, Toleranz einstellbar | S |
| M8 ✓ | Stirn-/Fuß-/Kopfplatte am Profilende (Maße, Bohrbild, Überstand) und Rippe/Steife; Platte als eigener Körper mit DXF | M |
| M9 | Schweißnähte: Naht an Kanten/Stoß als Attribut, Symbol nach ISO 2553 in der Zeichnung (Kehl-, HV-, V-, I-Naht, a-Maß, umlaufend, Montage), Nahtliste | M |
| M10 | Generator-Grundgerüst: Dialog mit Vorschau, Parametersatz im Feature, Körper als Profile/Platten, Vorlagen speichern | M |
| M11 | Geländer-Generator mit Füllungsarten, Pfostenaufteilung, über Eck | L (2–3 PRs) |
| M12 | Tor-Generator: Einzel-/Doppeltor, gerade/Rund-/Stichbogen | M |
| M13 | Treppe geradläufig mit Wangen/Holmen und Stufenarten, Steigungsprüfung | L (2 PRs) |
| M18 | Excel-Export (`.xlsx`) für Zuschnitt- und Stückliste | S |
| M19 | Unterbaugruppen, dann Struktur- und Baukastenstückliste | L (2 PRs) |
| M20 | Normteile parametrisch: Sechskantschrauben (ISO 4014/4017), Muttern (ISO 4032), Scheiben (ISO 7089), Gewindestange, Spannschloss; in Stückliste mit Normbezeichnung | M |
| M21 | DXF-Import in Skizze; IGES prüfen; PNG-Bildexport | M |

### Block C (P2) – Erweiterte Generatoren, Stahlbau, Blech, Darstellung

| Stufe | Inhalt | Aufwand |
|---|---|---|
| M14 | Treppe L/U mit Podest, Spindeltreppe | L |
| M15 | Stahlbau-Anschlüsse: biegesteifer Eckstoß, Pfettenschuh, Pfettenstoß, Windverband mit Spannschloss | L |
| M16 | Balkon-Generator | M |
| M17 | Blech, erste Ausbaustufe: Kantteil aus Querschnitt (gerade Kanten), Abwicklung mit Biegezugabe, DXF; **neuer ADR-0005 ersetzt ADR-0002** | L |
| M22 | Fotorealistische Darstellung (PBR-Materialien, Umgebungslicht, Bodenschatten), Bild in hoher Auflösung; **ADR-0004 wird dafür aufgehoben** | M |

### Block D (P3) – nur bei konkretem Bedarf

| Stufe | Inhalt |
|---|---|
| M23 | Kinematik: Drehgelenk in Baugruppen (Tor-Flügel), Animation, Explosionsdarstellung |
| M24 | Bauteile als eigene Dateien in Baugruppen verknüpfen (Grundlage für Arbeiten zu mehreren) |

## 4. Entscheidungen, die dieser Plan trifft

1. **Generatoren sind Features in einem Bauteil**, keine Baugruppen-Makros. Grund: Zuschnittliste, Gewicht, Export und
   Neuaufbau funktionieren ohne Sonderweg (Muster: Knickrahmen).
2. **Keine Statik.** Anschlüsse liefern Geometrie, keine Nachweise (ADR-0004 bleibt für FEM).
3. **Blech und fotorealistische Darstellung werden wieder aufgenommen**, weil Patrick sie jetzt ausdrücklich will
   (Wiedervorlage-Kriterium aus ADR-0002 und ADR-0004). Beide stehen in Block C, damit Rahmen und Generatoren zuerst kommen.
4. **Geschlossene Formate und CADENAS** werden nicht nachgebaut; Austausch über STEP/DXF.
5. Abgrenzung zu anderen Threads: Skizzenwerkzeuge/Einstellungen/Ansicht bleiben im Thread „Werkzeuge und
   Einstellungscenter“ (dessen Stufen 19–24), Releases im Thread „Entwicklungsplan“. M7 (Säubern) ist ein
   Skizzenwerkzeug und wird mit jenem Thread abgestimmt, bevor es startet.
