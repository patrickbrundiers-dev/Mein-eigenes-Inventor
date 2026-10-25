# Abgleich Fusion-360-Unterlagen mit PBCAD

Stand 25.10.2026. Grundlage: Patricks Plan „CAD-Funktionsübernahme" und die drei Fusion-360-Unterlagen (zwei Leseproben,
ein Grundkurs). Geprüft wurde `main` nach Release 0.17.0 (Commit `9a63e56`) und die offenen PRs #121 (Werkzeuge 38–40),
#123 (Menüband) und #125 (Pfostenbefestigung). Aus den PDFs wurden nur Themen übernommen, keine Texte oder Bilder.

Status: **vorhanden** · **teilweise** · **fehlt** · **läuft** (in einem anderen Thread geplant oder in Arbeit) ·
**n. r.** (nicht relevant für PBCAD).
Aufwand: XS < ½ Tag · S ≈ 1 Tag · M 2–3 Tage · L ≥ 1 Woche.

## 1. Kurzfazit

PBCAD deckt den Kern aus deinem Plan schon ab: Parameter mit Formeln und Einheiten, Feature-Baum mit Fehlerstatus und
Neuberechnen (F5, Berechnungsprotokoll), Formatversion mit Migration, Sicherungen und Körperprüfung, Baugruppen mit
Abhängigkeiten, Kollision und Bewegung, Zeichnungen mit Stückliste, Positionsnummern, Bohrungstabelle und Symbolen,
Kantteil mit Biegetabellen und Abwicklungs-DXF, Messen, Menüband und Tastaturkürzel. Die P0- und P1-Punkte deines Plans
sind fast alle erledigt, viele davon schon in den früheren P0/P1-Backlogs.

Übrig bleiben **20 Lücken**. Die wichtigsten für den Metallbau sind:

1. **Text in der Skizze**, damit man Teilenummern und Schilder gravieren oder lasern kann.
2. **Vollständigkeitsprüfung und Freigabestatus** vor der Fertigungsmappe (Plan P1.3/P1.4).
3. **Geometrie-Referenzfälle** als Regressionstest (Plan Abschnitt 5).
4. **Versionen mit Änderungsnotiz** (Plan P0.4).
5. **Komponente ersetzen** und **Positionsdarstellungen** (z. B. Tor offen/zu).

Vieles aus den PDFs ist schon in anderen Threads geplant (Stufen 41–47, Menüband, Pfostenbefestigung, 3D-Schnitt).
Das steht in Abschnitt 4 und wird hier nicht noch einmal geplant.

## 2. Abgleich nach Themen

### 2.1 Parameter, Skizze, Feature-Verlauf (Plan 2.1, 2.2, P0.1–P0.3)

| Thema | PBCAD heute (Beleg) | Status |
|---|---|---|
| Benannte Parameter mit Formel, Einheit, Kommentar | Parameter-Dialog (`src/ui/props.js`, `src/core/expr.js`), mm/cm/m/Zoll/° | vorhanden |
| Parameter importieren/exportieren | kein Import/Export im Dialog | **fehlt → FU3** |
| Parameter der Baugruppe steuern Bauteile | nur bei Generator-Baugruppen (`app.generatorAssembly`) | **teilweise → FU4** |
| Ungültige Werte abfangen, Einheiten prüfen | `test/units.test.mjs`, `test/validation.test.mjs` | vorhanden |
| Skizze voll bestimmt, Widersprüche mit Ursache, Auto-Bemaßung | `solver.js`, Stufen 6, 16, 22 | vorhanden |
| Zeichenbefehle Linie bis Spline, Langloch, Polygon, Versatz, Muster, Spiegeln | Werkzeuge Stufen 6–21 | vorhanden |
| Text in der Skizze (für Gravieren/Prägen) | Prägen/Gravieren gibt es (`emboss`), aber nur aus Skizzenkonturen; kein Textwerkzeug | **fehlt → FU1** |
| Bild in Skizze einlegen und nachzeichnen | nicht vorhanden; DXF-Import ja (`dxfread.js`) | **fehlt → FU2** |
| Skizze als DXF exportieren, DXF importieren | `x_dxf`, `sdxf` | vorhanden |
| Feature-Baum benennen, unterdrücken, verschieben | `src/ui/tree.js`, `App.moveFeature` | vorhanden |
| Fehler je Feature, kein stilles Weiterzeigen alter Geometrie | `status[fid]`, `errorText`, Stufe 28 | vorhanden |
| Ende-Markierung zurückziehen („bis hier rechnen", dazwischen einfügen) | nicht vorhanden | **fehlt → FU5** |
| Alle Fehler und Warnungen gesammelt anzeigen | Statusleiste zählt Fehler, Berechnungsprotokoll; keine Liste zum Hinspringen | **teilweise → FU15** |
| Bezugsgeometrie, Sweep, Erhebung, Spirale, Rippe, Prägen | Stufen 36, 37, M8 | vorhanden |
| Bohrung mit Gewinde, Senkung | Feature `hole` | vorhanden |
| Kombinieren, Trennen, Aufdicken, Fläche verschieben, Entformung | PR #121 | läuft |

### 2.2 Speichern, Versionen, Wiederherstellen (Plan 2.7, P0.4)

| Thema | PBCAD heute | Status |
|---|---|---|
| Formatversion, Migration, neuere Datei mit Warnung | `src/core/project.js` (`MIGRATIONS`), P0 B-1/B-2 | vorhanden |
| Atomisches Speichern, mehrere Sicherungen, Autosave, schreibgeschützt öffnen | P0 B-3/B-4, Stufe 27 | vorhanden |
| Version mit Nummer, Zeitstempel und Änderungsnotiz; Liste; ältere Version öffnen oder wiederherstellen | Sicherungen `.bak`, `.bak2` ohne Notiz und ohne Liste | **teilweise → FU6** |
| Cloud, Team, Rollen, Freigabelinks | – | n. r. |

### 2.3 Baugruppen (Plan 2.3, P1.1)

| Thema | PBCAD heute | Status |
|---|---|---|
| Komponenten platzieren, fixieren, numerisch positionieren | `asmsolve.js` | vorhanden |
| Abhängigkeiten Fläche/Bündig/Konzentrisch | P1 G-2 | vorhanden |
| Winkel, Tangential, Einfügen, Zylindergelenk, Komponentenmuster | PR #121 | läuft |
| Alle Arten von Abhängigkeiten, Bewegung (Drehschiebung), Blechregeln | Stufe 44 | läuft |
| Unterbaugruppen, Strukturstückliste | `subasm.js`, `lists.js` | vorhanden |
| Verknüpfte Bauteile aus eigener Datei (extern) | M24, V3 | vorhanden |
| Normteile (Schrauben, Muttern, Scheiben …) | M20 | vorhanden |
| Kollision, Drehgelenk, Schiebegelenk, Bewegen | G-1, M23, E8 | vorhanden |
| Ausblenden, Isolieren | Stufe 5 | vorhanden |
| Komponente ersetzen (Teil tauschen, Lage bleibt) | Kontextmenü hat kein „Ersetzen" | **fehlt → FU7** |
| Positionsdarstellungen speichern (Tor offen/zu) | Bewegen ist nur momentan | **fehlt → FU8** |
| Explosion | nur ein Regler „von der Mitte weg" (`props.explodeDialog`) | **teilweise → FU9** |
| Bauteil im Baugruppenkontext bearbeiten (Nachbarteile sichtbar) | „Bauteil bearbeiten" öffnet das Bauteil allein | **fehlt → FU21** |
| Komponentenfarben zum Unterscheiden | – | **fehlt → FU16** |
| Kontaktsätze, Bewegungsstudie, Antriebsgelenke | – | n. r. (Bewegungsprüfung reicht für Tore) |

### 2.4 Zeichnung und Stückliste (Plan 2.4, P1.3)

| Thema | PBCAD heute | Status |
|---|---|---|
| Ansichten Grund/Projektion/Iso/Schnitt/Detail/Hilfs/Bruch/Ausbruch/Abwicklung | Stufen 33–35, P1 F-3 | vorhanden |
| Ansichten folgen dem Modell | Zeichnung rechnet bei jeder Anzeige aus dem Modell (`drawing.update`) | vorhanden |
| Maße, Hauptmaße automatisch, Koordinaten- und Lochkreismaße | `autodims.js` | vorhanden |
| Ketten- und Bezugsmaß als Werkzeug, Bogenlänge, Maße ausrichten, Positionsnummern ausrichten/neu nummerieren, Mittelpunktmarkierung von Hand | nur Einzelmaß von Hand | **teilweise → FU11** |
| Toleranzen, Oberflächen, Form/Lage, Bezug, Schweißsymbole, Änderungstabelle, Bohrungstabelle | Stufen 30, 33, 34, M9 | vorhanden |
| Stückliste, Positionsnummern, Blattformate A4–A0 | P1 | vorhanden |
| Eigene Zeichnungsvorlage (Firmenlogo, eigene Schriftfeld-Felder, Linienbreiten/Schrifthöhen) | festes DIN-Schriftfeld; Firmenkopf nur im Angebotsblatt | **teilweise → FU12** |
| Positionsnummern auf Explosionsansicht | – | **fehlt → in FU9** |
| PDF/DXF/SVG, Fertigungsmappe | E3 | vorhanden |
| DWG-Export | – | n. r. (DXF reicht, DWG nur mit Lizenzbibliothek) |
| Zeichnung/Modell gleicher Stand vor Export, unvollständige Daten blockieren Freigabe | Fertigungsprüfung nur für die Zuschnittliste (`dfm.js`), Mappe prüft nichts | **fehlt → FU13** |

### 2.5 Blech (Plan 2.5, P2.1)

| Thema | PBCAD heute | Status |
|---|---|---|
| Kantteil mit Abwicklung, Biegetabellen, K-Faktor, DIN 6935, Abwicklungs-DXF | ADR-0005, Stufe 31, `kantteilFlatDxf` | vorhanden |
| Abwicklung in der Zeichnung mit Biegelinien und -tabelle | Stufe 34 | vorhanden |
| Laschen/Flansche an Kanten | Stufe 41 | läuft |
| Blechregeln (Vorgaben je Dicke) | Stufe 44 | läuft |
| Falz, Konturlasche über Skizze, In Blech umwandeln, Auftrennen, Eckfreischnitt | – | **fehlt → FU19** (erst nach 41/44, deckt sich mit E12) |

### 2.6 Bedienung, Analyse, Darstellung (Plan 2.6, 2.8, 2.9)

| Thema | PBCAD heute | Status |
|---|---|---|
| Auswahlfilter, Fensterauswahl, Ansichten, ViewCube, Perspektive, benannte Ansichten | Stufen 2, 5, 8, 13 | vorhanden |
| Menüband anpassen, Schnellzugriff, Kürzel, Befehlssuche | Stufen 3, 15, 25; Umbau #123 | vorhanden / läuft |
| Rückgängig/Wiederholen | P0 C-1/C-2 | vorhanden |
| Messen, Masse, Schwerpunkt, Trägheit | Stufen 4, 10, 17; Ausbau Stufe 47 | vorhanden / läuft |
| 3D-Schnitt | Stufe 2/18; Fix am Rohr läuft | vorhanden / läuft |
| Benannte 3D-Schnitte speichern | – | **fehlt → FU18** |
| Notizen am Modell (für Werkstatt/Kollegen) | Kommentar nur je Parameter | **fehlt → FU20** |
| Fotodarstellung, Werkstofffarben, RAL | M22, E7 | vorhanden |
| Montage-Animation als Video | – | **fehlt → FU10** (P3) |
| Zebra-, Krümmungs-, Formschräge-Analysen | – | n. r. (keine Freiformflächen) |
| FEM/Simulation | ADR-0004 | n. r. |

### 2.7 Fertigungsdaten (Plan P1.4)

| Thema | PBCAD heute | Status |
|---|---|---|
| Profil-IDs wie Rohrlaser-Kalkulation, Zuschnittliste CSV/Excel, Profil-STEPs | 0.2.0, M18, E3 | vorhanden |
| Stangenoptimierung, Kalkulation | E1, E2 | zurückgestellt (deine Entscheidung) |
| Verknüpfung mit „Werkcard" | „Werkcard" ist WerkCAD, der alte Name von PBCAD; die Verbindung zur Rohrlaser-Kalkulation läuft über Profil-IDs und Zuschnittliste | vorhanden (FU17 entfällt) |

## 3. Lückenliste

Prio: P1 = als Nächstes, P2 = danach, P3 = nur bei Bedarf.

| Nr | Lücke | Nutzen für dich | Aufwand | Abhängigkeit | Prio |
|---|---|---|---|---|---|
| FU1 | **Text in der Skizze**: Schriftzug mit Schriftart, Höhe, Winkel, Ausrichtung; als Kontur für Gravieren/Prägen (auch auf Rohr), Ausschnitt, DXF für den Laser; Platzhalter wie `{teilenummer}` | Teilenummern auf Laserteilen, Schilder, Hausnummern, Beschriftungen ohne Fremdprogramm | M | keine; eingebaute Schrift mit freier Lizenz (OFL) | P1 |
| FU13 | **Freigabe und Vollständigkeit**: Status Entwurf/Geprüft/Freigegeben je Bauteil/Baugruppe; vor Fertigungsmappe und Einzelteilzeichnungen prüfen: Teilenummer, Werkstoff, Oberfläche, Zeichnung vorhanden, Körper gültig, Fertigungsprüfung grün; Liste der Mängel mit Sprung zum Teil | keine Mappe mit fehlenden Angaben in der Werkstatt | M | FU15 nutzt dieselbe Liste | P1 |
| FU14 | **Geometrie-Referenzfälle**: Referenzprojekte (Knickrahmen, Gestell, Geländer mit Pfostenbefestigung inkl. U200-Treppe, Kantteil, Treppe) mit gespeicherten Sollwerten (Volumen, Hüllmaße, Bohrungsmitten, Schnittwinkel, Stückzahlen); Vergleich mit fester Toleranz in CI | Fehler in Generatoren fallen vor dem Release auf, nicht bei dir | M | Pfostenbefestigung #125 gemergt (für den U200-Fall) | P1 |
| FU6 | **Versionen mit Notiz**: „Version speichern" mit Text, Liste aller Versionen (Datum, Notiz, Größe), Version öffnen (schreibgeschützt) oder wiederherstellen; Versionen liegen im Ordner neben der Datei | „Wie war das vor der Kundenänderung?" ohne Dateikopien von Hand | M | keine | P1 |
| FU15 | **Problemliste**: alle Fehler und Hinweise des Projekts (Features, Generatoren, Körperprüfung, Fertigungsprüfung) in einem Fenster, Klick springt hin | Fehler in großen Baugruppen schnell finden | S | keine | P1 |
| FU7 | **Komponente ersetzen**: ein oder alle Vorkommen gegen ein anderes Bauteil tauschen; Lage bleibt, Abhängigkeiten bleiben, soweit die Flächen passen, sonst deutlicher Hinweis | Variante tauschen (anderer Pfosten, andere Platte) ohne neu zu montieren | S–M | #121 und Stufe 44 gemergt (Abhängigkeiten) | P1 |
| FU3 | **Parameter importieren/exportieren** (Excel/CSV), Parameter aus anderem Bauteil übernehmen | Maßlisten vom Kunden oder aus Excel direkt ins Modell | S | keine | P2 |
| FU5 | **Ende-Markierung im Modellbrowser**: ziehbar; Features danach werden nicht gerechnet, neue Features landen an der Markierung | nachträglich eine Bohrung vor die Muster setzen, ohne zu verschieben | S–M | keine | P2 |
| FU8 | **Positionsdarstellungen**: Gelenkstellungen benannt speichern (z. B. „Tor offen 90°"), umschalten, in der Zeichnung als Ansicht wählbar | Öffnungsbereich zeigen, Kollision in Endlage | M | Stufe 44 (Bewegung) | P2 |
| FU9 | **Explosion in Schritten**: Komponenten je Schritt in Richtung/Abstand verschieben, Ebenen automatisch, Explosionsansicht in der Zeichnung mit Positionsnummern | Montagezeichnungen für Kunden und Monteure | M–L | FU8 hilfreich | P2 |
| FU11 | **Zeichnung: weitere Bemaßung**: Ketten- und Bezugsmaß als Werkzeug, Bogenlänge, Maße ausrichten, Positionsnummern ausrichten und neu nummerieren, Mittelpunktmarkierung und Lochkreis-Mittellinie von Hand | weniger Nacharbeit an Werkstattzeichnungen | M | keine | P2 |
| FU12 | **Eigene Zeichnungsvorlage**: Logo, Firmenangaben, zusätzliche Schriftfeld-Felder, Linienbreiten und Schrifthöhen; als Vorgabe neuer Zeichnungen | Zeichnungen sehen aus wie deine bisherigen Firmenzeichnungen | M | keine | P2 |
| FU2 | **Bild in Skizze**: Foto/Scan einlegen, über zwei Punkte mit bekanntem Abstand maßstäblich setzen, durchscheinend, nachzeichnen | Ziergitter, Kundenskizzen, Aufmaßfotos | S–M | keine | P2 |
| FU21 | **Bauteil in der Baugruppe bearbeiten**: Nachbarteile bleiben durchscheinend sichtbar, Kanten anderer Teile projizierbar | Montageplatte passend zum Nachbarteil konstruieren | L | Stufe 42 (abgeleitetes Bauteil) | P2 |
| FU4 | **Parameter der Baugruppe an Bauteile weitergeben** (nicht nur bei Generatoren) | ein Maß ändert alle Teile (Top-down) | M | Stufe 42 | P2 |
| FU16 | **Komponentenfarben** umschalten | Teile in großen Baugruppen unterscheiden | XS | keine | P2 |
| FU18 | **Benannte 3D-Schnitte** speichern und wieder aufrufen | Prüfschnitte nicht jedes Mal neu einstellen | S | 3D-Schnitt-Fix am Rohr gemergt | P2 |
| FU19 | **Blech erweitert**: Falz, Konturlasche aus Skizze, In Blech umwandeln, Auftrennen, Eckfreischnitt | Kassetten, Abdeckungen | L | Stufen 41 und 44; mit E12 zusammenlegen | P2 |
| FU20 | **Notizen** an Bauteil, Feature oder Komponente; auf Wunsch in der Fertigungsmappe | Hinweise für Werkstatt bleiben am Modell | S | keine | P3 |
| FU10 | **Montage-Animation als Video** (aus Bewegung und Explosion) | Präsentation beim Kunden | M | FU8, FU9 | P3 |
| FU17 | entfällt: „Werkcard" ist WerkCAD = PBCAD selbst | – | – | – | – |

## 4. Schon anderswo geplant oder in Arbeit (nicht doppelt)

| Thema aus den PDFs | Wo |
|---|---|
| Kombinieren, Trennen, Aufdicken, Fläche verschieben, Entformung; Winkel/Tangential/Einfügen/Zylindergelenk, Komponentenmuster; Endkappe, Kürzen, Gleichteile | PR #121 (Stufen 38–40) |
| Laschen/Flansche am Blech | Stufe 41 |
| 3D-Skizze, abgeleitetes Bauteil, Komponente spiegeln, Feature kopieren | Stufe 42 |
| Konfigurationen (Variantentabelle), Regeln, Makros/Skripte, Englisch | Stufe 43 |
| Blechregeln, alle Abhängigkeitsarten, Bewegung | Stufe 44 |
| Stecksystem Zapfen/Schlitz | Stufen 45/46 |
| Messen wie Inventor | Stufe 47 |
| Menüband, Skizze/Komponente verschieben/drehen, Fangen | PR #123 |
| Pfostenbefestigung inkl. U200 an der Treppe (Plan P1.2) | PR #125 |
| 3D-Schnitt und Langloch am Rohr | Thread „Fix 3D-Schnitt und Langloch am Rohr" |
| Stangenoptimierung, Kalkulation | E1, E2 zurückgestellt |
| Teilebibliothek, glTF/3MF, Fotodarstellung mit Hintergrund, Hilfe (F1) | E14, E15, V7, V8 |

## 5. Bewusst nicht übernehmen

Freiform- und Netzmodellierung, Flächenanalysen (Zebra, Krümmung), FEM/Simulation (ADR-0004), CAM und 3D-Druck-Bahnen,
Elektronik, Cloud/Team/Rollen, Herstellerkataloge als Online-Dienst (STEP-Import reicht), DWG-Export, Aufkleber.
Dein Plan sagt dasselbe: erst Konstruktion, Zeichnung und Fertigungsdaten.

## 6. Reihenfolge

Jeder Block sind kleine PRs von `main`, CI grün → mergen, Release über den Release-Thread.

| Block | Inhalt | Warum so |
|---|---|---|
| **G1 (P1)** | FU15, FU13, FU14 | zuerst Sicherheit: Mängel sehen, keine unvollständige Mappe, Regressionen abfangen |
| **G2 (P1)** | FU1, FU6, FU7 | größter direkter Nutzen im Alltag; FU7 erst, wenn #121 und Stufe 44 auf main sind |
| **G3 (P2)** | FU3, FU5, FU16, FU18, FU2, FU11, FU12 | Bedienung und Zeichnung, alles klein bis mittel |
| **G4 (P2)** | FU8, FU9, FU4, FU21, FU19 | Baugruppen-Ausbau, wartet auf Stufen 42 und 44 |
| **G5 (P3)** | FU20, FU10 | nur bei Bedarf |

## 7. Offene Punkte

1. **Werkcard (FU17):** gemeint ist WerkCAD, der alte Name von PBCAD. Die Rohrlaser-Kalkulation bleibt ein eigenes Programm; dort ändert sich nichts.
2. **Schrift für FU1:** Vorschlag ist eine eingebaute DIN-ähnliche Schrift mit freier Lizenz, dazu eine einfache
   Strichschrift für Gravuren. Windows-Schriften einzulesen wäre möglich, macht die Dateien aber vom Rechner abhängig.
3. **Feature-Matrix:** `docs/roadmap/feature-matrix.md` im Repo ist vom 24.10. und führt viele Punkte noch als „fehlt",
   die längst fertig sind. Sie wird mit dem ersten PR dieses Plans auf den Stand von hier gebracht.
