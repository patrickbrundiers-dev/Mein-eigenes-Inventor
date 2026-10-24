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
| Zuschnittliste (Profil-ID, Länge, Gehrungen, Gewicht) + CSV | vorhanden | `props.js:662` |
| Profil-IDs wie Rohrlaser-Kalkulation | vorhanden | `profileId` |
| Benutzerdefinierte Querschnitte | fehlt | |
| Profil entlang räumlichem Pfad | teilweise | Rahmen nur aus ebener Skizze |
| Bohrungen/Langlöcher/Freistellungen in Profilen | teilweise | Bohrung/Ausschnitt über Skizze möglich, nicht profilbezogen |
| Maschinenlimits / Maschinenprofile | fehlt | |

## 6. Knickrahmen (Modul-Plan)

| Anforderung | Status | Bemerkung |
|---|---|---|
| Funktion „Knickrahmen erstellen“ | vorhanden (seit Stufe 1) | Feature `knickrahmen`, siehe `docs/knickrahmen/stufe1-plan.md` |
| 2–3 Segmente in einer Ebene, Längen, Knickwinkel | fehlt | mit `makeMember` + Gehrungslogik direkt baubar |
| Ein definierter Querschnitt (Rechteck-Hohlprofil) | vorhanden (Baustein) | `sectionGeometry("rechteck" / "vierkant")` |
| Gehrung am Knick als echte Schnittfläche | vorhanden (Baustein) | Winkelhalbierende in `buildFrame` |
| Stumpfstoß / überlappend | teilweise | Stumpf existiert im Rahmen; überlappend fehlt |
| Runde Freistellungen, Laschen, Langlöcher | teilweise | Freistellung rund/rechteckig und Positionier-Zapfen vorhanden; Laschen, Langlöcher fehlen |
| Gekantetes Blech mit Abwicklung | blockiert | keine Blechfunktion, keine Biegelogik im Projekt; braucht eigenen ADR |
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
| Unterbaugruppen, Explosion, Kollision | fehlt | |
| Stückliste mit Masse | vorhanden | |
| Zeichnungsblätter A4–A0, Schriftfeld | vorhanden | `drawing.js` |
| Grund-, Iso-, Schnittansichten, verdeckte Kanten, Mittellinien | vorhanden | |
| Bemaßung, Hauptmaße automatisch, Texte | vorhanden | |
| Detailansicht, Positionsnummern, Stückliste auf dem Blatt | fehlt | |
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

| Kategorie | Status | Bemerkung |
|---|---|---|
| L Updates | vorhanden | Token, automatische Prüfung (`props.js:586`) |
| A Allgemein (Ordner, zuletzt geöffnet) | teilweise | letzte Ordner und Dateien automatisch, nicht einstellbar |
| D 3D-Ansicht (Qualität) | teilweise | umschaltbar, nicht gespeichert |
| B, C, E, F, G, H, I, J, K, M, N | fehlt | kein Einstellungscenter |
| Trennung Benutzer/Dokument/Maschine | fehlt | |
| Lizenzierung | n. r. | kein Lizenzsystem vorhanden |

## 10. Infrastruktur

| Anforderung | Status | Bemerkung |
|---|---|---|
| CI unter Linux mit Kern-, Geometrie-, Oberflächen-, Electron-Tests | vorhanden | `ci.yml` |
| Release-Workflow Windows, manuell | vorhanden | führt nur Kern-Tests aus |
| Signierte Releases | fehlt | README weist auf SmartScreen hin |
| Lizenzprüfung Abhängigkeiten | teilweise | MIT + LGPL-2.1 (OCCT); LGPL-Text im Installer unklar |
| Linter/Formatter | fehlt | |
