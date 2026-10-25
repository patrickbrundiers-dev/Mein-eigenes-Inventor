# Feature-Matrix

Stand: 24.10.2026 · Commit `cf39217`

Abgleich der Anforderungen aus den drei Planungsdokumenten (Entwicklungsplan,
Knickrahmen-Modul, Masterplan Werkzeuge/Einstellungen) mit dem Code.

Status: **vorhanden** · **teilweise** · **fehlt** · **unklar** · **blockiert**
(technisch nicht ohne Vorarbeit möglich) · **n. r.** (nicht relevant für jetzt).

## 1. Fundament (P0)

| Anforderung | Status | Wo / Bemerkung |
|---|---|---|
| Projektdatei speichern/öffnen | vorhanden | `src/ui/files.js`, `electron/main.cjs` (`.wcad`, JSON) |
| Atomisches Speichern + Backup | vorhanden | `atomicWrite`: `.tmp` → `.bak` → umbenennen |
| Autosave + Wiederherstellung | teilweise | `localStorage`, nur bis 4,5 MB, nur letzte Sitzung |
| Formatversion + Migration | teilweise | `version: 1` wird geschrieben, nie geprüft; keine Migrationen |
| Validierung beim Laden | teilweise | nur `format` und `docs`; keine Schema-Prüfung |
| Beschädigte Datei → klare Meldung | teilweise | JSON-Fehler → Toast „Öffnen fehlgeschlagen“; keine Detailprüfung |
| Undo/Redo | vorhanden | Snapshots, 100 Schritte (`app.js:158`) |
| Einheiten intern eindeutig | vorhanden | mm/Grad; Eingabe `mm`, `cm`, `m`, `°` |
| Zoll | fehlt | nicht in `expr.js` |
| Koordinatensysteme | teilweise | Basisebenen + Skizze auf Fläche; keine Bezugsebenen/-achsen |
| Geometrievalidierung (BRepCheck) | fehlt | Kernel kann es (`BRepCheck_Analyzer` geprüft), wird nicht genutzt |
| Fehlermeldungen je Feature | vorhanden | `status[fid]`, `errorText` übersetzt OCCT-Ausnahmen |
| Letzter gültiger Zustand bei Fehler | teilweise | fehlerhaftes Feature wird übersprungen, Parameter bleiben |
| Kernel im Worker, UI blockiert nicht | vorhanden | Worker + Neustart nach Absturz |
| Zentrale Protokollierung / Supportpaket | fehlt | nur Toasts und Konsole |
| Build-/Test-Baseline | vorhanden | siehe `docs/testing/baseline-2026-10-24.md` |

## 2. Arbeitsplatz, Auswahl, Ansicht

| Anforderung | Status | Wo / Bemerkung |
|---|---|---|
| Ribbon nach Arbeitsbereich (Teil, Skizze, Baugruppe, Zeichnung, Export) | vorhanden | `src/ui/ribbon.js` |
| Modellbrowser: Umbenennen, Unterdrücken, Kontextmenü | vorhanden | `src/ui/tree.js` |
| Feature-Reihenfolge ändern | fehlt | |
| Eigenschaften-Panel | vorhanden | `src/ui/props.js` |
| Tastaturkürzel | vorhanden (fest) | `app.js:686ff`; nicht anpassbar |
| Werkzeugsuche, anpassbare Leisten | fehlt | |
| Auswahl Fläche/Kante, Mehrfachauswahl mit Strg/Umschalt | vorhanden | `app.js:423ff` |
| Fensterauswahl, Auswahlfilter | fehlt | |
| Standardansichten, Alles zeigen, ViewCube | vorhanden | `viewer.js` (Iso, Vorne, Oben, Rechts) |
| Ansicht normal zur Fläche | vorhanden | beim Skizzieren auf Fläche |
| Perspektive | fehlt | nur orthografisch |
| Schnitt/Clipping im 3D-Fenster | fehlt | Schnitt nur in Zeichnungen |
| Darstellungsmodi (Drahtmodell, transparent …) | teilweise | Qualitätsstufen; Transparenz intern |
| Messen Abstand/Winkel | teilweise | zwischen zwei gewählten Flächen (`props.js:203`) |
| Masse, Volumen, Abmessungen | vorhanden | Masse-Eigenschaften im Panel |
| Schwerpunkt, Trägheit | fehlt | |

## 3. Skizze

| Anforderung | Status | Wo / Bemerkung |
|---|---|---|
| Linie, Rechteck (auch Mitte), Kreis, Bogen (3 Punkte, Mittelpunkt), Punkt | vorhanden | `sketcher.js` |
| Polylinie, Ellipse, Spline, Langloch, Polygon | fehlt | |
| Stutzen, Rundung | vorhanden | `sketchedit.js` |
| Versatz, Spiegeln, Muster, Verlängern in der Skizze | fehlt | |
| Kanten projizieren, Konstruktionslinien | vorhanden | |
| Bedingungen (12 Arten) + Bemaßung mit Formeln | vorhanden | `solver.js` |
| Freiheitsgrade, getriebene Maße | vorhanden | |
| Rasterfang | vorhanden | |
| Konturprüfung (offene Enden) | vorhanden | `extractProfiles` meldet offene Punkte |

## 4. 3D-Features

| Anforderung | Status | Wo / Bemerkung |
|---|---|---|
| Extrusion (5 Modi), Ausschnitt, Drehung | vorhanden | `build.js` |
| Bohrung mit Gewinde-Kernloch, Senkungen, Sackloch | vorhanden | |
| Rundung, Fase | vorhanden | Kanten über Lage referenziert, nicht über Index |
| Wandung (Schale) | vorhanden | |
| Rechteck-/Kreismuster, Spiegeln | vorhanden | Spiegeln nur an Basisebenen |
| Sweep, Loft | fehlt | replicad bietet `genericSweep`, `loft` |
| Rippe, Entformungsschräge, Trennen | fehlt | |
| Bezugsebenen/-achsen/-punkte | fehlt | |
| STEP/STL-Import | vorhanden | |
| Mehrere Körper | vorhanden | `bodies[]` |

## 5. Rohr, Profil, Rahmen

| Anforderung | Status | Wo / Bemerkung |
|---|---|---|
| Querschnitte Rundrohr, Quadrat-/Rechteckrohr, Flach, Rund, Vierkant, L, U | vorhanden | `sections.js` |
| Normgrößen-Katalog | vorhanden | `CATALOG` |
| Innen- und Außenkontur (Hohlprofil) | vorhanden | `sectionGeometry` mit `holes` |
| Wandstärkenprüfung | vorhanden | „Wandstärke zu groß“ |
| Einzelprofil mit Gehrung/Schrägschnitt | vorhanden | Feature `profile` |
| Rahmen aus Skizze, Gehrung/Stumpf, T-Stoß, Sattelschnitt | vorhanden | Feature `frame`, `buildFrame` |
| Gestell wie Inventor (Skelett → Baugruppe, je Stab ein Bauteil; Gehrung, Eckverbindung, Auf Gestell stutzen, Nuten, Verlängern/Kürzen, Ändern, Wiederverwenden, Gestell-Info) | vorhanden | `src/core/gestell.js`, `src/ui/gestell.js`, Feature `genteil` mit gen `gestell`; Endkappe, Stutzen an Fläche, Gleichteile: `src/core/rahmen.js` (Werkzeuge Stufe 40) |
| Zuschnittliste (Profil-ID, Länge, Gehrungen, Gewicht) + CSV | vorhanden | `props.js:662` |
| Profil-IDs wie Rohrlaser-Kalkulation | vorhanden | `profileId` |
| Benutzerdefinierte Querschnitte | fehlt | |
| Profil entlang räumlichem Pfad | teilweise | Rahmen nur aus ebener Skizze |
| Bohrungen/Langlöcher/Freistellungen in Profilen | teilweise | Bohrung/Ausschnitt über Skizze möglich, nicht profilbezogen |
| Maschinenlimits / Maschinenprofile | teilweise | Fertigungsprüfung der Zuschnittliste gegen Grenzen einer Maschine (`src/core/dfm.js`, Einstellungen „Rohrlaser und Fertigung“); mehrere Profile fehlen |

## 6. Knickrahmen (Modul-Plan)

| Anforderung | Status | Bemerkung |
|---|---|---|
| Funktion „Knickrahmen erstellen“ | vorhanden (seit Stufe 1) | Feature `knickrahmen`, siehe `docs/knickrahmen/stufe1-plan.md` |
| 2–3 Segmente in einer Ebene, Längen, Knickwinkel | fehlt | mit `makeMember` + Gehrungslogik direkt baubar |
| Ein definierter Querschnitt (Rechteck-Hohlprofil) | vorhanden (Baustein) | `sectionGeometry("rechteck" / "vierkant")` |
| Gehrung am Knick als echte Schnittfläche | vorhanden (Baustein) | Winkelhalbierende in `buildFrame` |
| Stumpfstoß / überlappend | teilweise | Stumpf existiert im Rahmen; überlappend fehlt |
| Runde Freistellungen, Laschen, Langlöcher | teilweise | Freistellung (Pflicht, Mindestmaß), Schweißspalt, Positionier-Zapfen mit Spiel vorhanden; Laschen, Langlöcher fehlen |
| Gekantetes Blech mit Abwicklung | vorhanden | Kantteil, Konturlasche, Laschen, Umschlag, Blechkasten, In Blech umwandeln (ADR-0005, ADR-0008, FU19) |
| Gebogenes Rohr (Biegeradius) | teilweise | Außenwand am Knick mit Innenradius + K-Faktor (Stufe 1); voll gebogenes Rohr braucht Sweep, Stufe 3 |
| Gelenke, Bewegungsgrenzen, Auf-/Zuklappen (Entwicklungsplan 5.2/5.3) | n. r. | Knickrahmen ist starr (Entscheidung 24.10.2026); Min/Max nur als Prüfung |
| Stück-/Zuschnittliste | vorhanden (Baustein) | jedes Segment als `member` → automatisch in der Liste |
| Neutrales JSON-Austauschmodell | fehlt | Stufe 4; STEP + CSV gibt es schon |
| Kollisionsprüfung | fehlt | |
| Referenzbilder | vorhanden | ein Rohr, V-Ausklinkung durch drei Wände, Außenwand gekantet |

## 7. Baugruppen und Zeichnungen

| Anforderung | Status | Wo / Bemerkung |
|---|---|---|
| Komponenten platzieren, numerisch positionieren, fixieren | vorhanden | |
| Abhängigkeiten Fläche an Fläche, Bündig mit Abstand | vorhanden | `asmsolve.js` |
| Konzentrisch, Winkel, Freiheitsgrade | fehlt | |
| Unterbaugruppen, Explosion, Kollision | vorhanden | Unterbaugruppen, Explosion in Schritten (FU9), Kollision, Positionsdarstellungen (FU8) |
| Stückliste mit Masse | vorhanden | |
| Zeichnungsblätter A4–A0, Schriftfeld | vorhanden | `drawing.js` |
| Grund-, Iso-, Schnittansichten, verdeckte Kanten, Mittellinien | vorhanden | |
| Bemaßung, Hauptmaße automatisch, Texte | vorhanden | |
| Detailansicht, Positionsnummern, Stückliste auf dem Blatt | vorhanden | Positionsnummern auch auf explodierten Ansichten (FU9) |
| PDF/DXF/SVG | vorhanden | |

## 8. Export

| Format | Status | Bemerkung |
|---|---|---|
| STEP (Teil, Baugruppe, je Profil) | vorhanden | Rückimport nur für Würfel getestet |
| STEP + Zuschnittliste | vorhanden | |
| STL | vorhanden | |
| DXF aus Skizze / Platte / Zeichnung | vorhanden | |
| 3MF, IGES, Bildexport | fehlt | |

## 9. Einstellungen (Masterplan 13)

Seit dem Einstellungscenter (Stufe 1, Masterplan Werkzeuge) siehe [werkzeuge-einstellungen.md](werkzeuge-einstellungen.md).

## 10. Infrastruktur

| Anforderung | Status | Bemerkung |
|---|---|---|
| CI unter Linux mit Kern-, Geometrie-, Oberflächen-, Electron-Tests | vorhanden | `ci.yml` |
| Release-Workflow Windows, manuell | vorhanden | führt nur Kern-Tests aus |
| Signierte Releases | fehlt | README weist auf SmartScreen hin |
| Lizenzprüfung Abhängigkeiten | teilweise | MIT + LGPL-2.1 (OCCT); LGPL-Text im Installer unklar |
| Linter/Formatter | fehlt | |

## Nachtrag 25.10.2026: Fusion-360-Abgleich (G1–G4)

Die Zeilen oben stammen größtenteils vom 24.10.2026; seitdem ist vieles fertig geworden. Für den Fusion-Abgleich
(`docs/roadmap/fusion360-abgleich.md`) gilt:

| Block | Inhalt | Status |
|---|---|---|
| G1 | FU15 Problemliste, FU13 Freigabe-Prüfung, FU14 Referenzfälle | vorhanden (#129) |
| G2 | FU1 Text in der Skizze, FU6 Versionen, FU7 Komponente ersetzen | vorhanden (#137) |
| G3 | FU3 Parameter-CSV, FU5 Bauteilende, FU16 Bauteilfarben, FU18 benannte Schnitte, FU2 Bild in Skizze, FU11 Zeichnungsbemaßung, FU12 Zeichnungsvorlage | vorhanden (#137) |
| G4 | FU8 Positionsdarstellungen, FU9 Explosion in Schritten mit Positionsnummern, FU4 Baugruppenparameter an Bauteile | vorhanden (#146) |
| G4 | FU21 Bauteil im Kontext der Baugruppe bearbeiten, Nachbarkanten projizieren | vorhanden |
| G4 | FU19 Blech erweitert: Falz (Umschlag), Konturlasche und Eckfreischnitt gab es schon; neu Blechkasten, In Blech umwandeln, Ecken auftrennen | vorhanden |
| G5 | FU20, FU10 | nicht freigegeben |
