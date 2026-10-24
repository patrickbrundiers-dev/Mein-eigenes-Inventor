# WerkCAD – P0-Backlog (Auftrag 2)

Freigegeben von Patrick am 24.10.2026 (inkl. Release-Workflow) · Basis: `main` @ `cf39217` · Analyse aus PR #1 (Audit Phase 0) übernommen, nicht neu gemacht.

Baseline heute erneut geprüft: Kern-Tests 16/16, Geometrie-Tests 15/15 grün (Node 22, `npm ci`).

Aufwand: **XS** < 1 h · **S** ≈ halber Tag · **M** 1–2 Tage · **L** > 2 Tage.

## Abgrenzung zu den laufenden PRs

| PR | Inhalt | Folge für dieses Backlog |
|---|---|---|
| #1 | Audit Phase 0 + Knickrahmen Stufe 1 (inkl. Körperprüfung `BRepCheck_Analyzer` nur für den Knickrahmen) | K1–K10 bleiben dort. Körperprüfung für alle Features (V-1) erst nach Merge von #1, sonst Konflikt in `build.js`. |
| #2 | Rechteck-Maßeingabe in der Skizze | kein Überlapp |

Damit es keine Konflikte gibt, fassen die Etappen hier `build.js`, `props.js`, `sketcher.js` und `core.test.mjs` nicht an. Neue Tests kommen in **eigene Testdateien** (`test/project.test.mjs`).

## Etappe P0-B: Dokumentmodell, Dateiversion, Migration, Backup

| ID | Aufgabe | Dateien | Abhängig von | Tests | Abnahme | Aufwand |
|---|---|---|---|---|---|---|
| **B-1** | Laden/Prüfen aus `Files.parse` in ein reines Modul `src/core/project.js` herauslösen (`parseProject(text)`), Verhalten unverändert | `src/core/project.js` (neu), `src/ui/files.js` | – | `test/project.test.mjs`: gültige Datei, kein JSON, falsches `format`, `docs` fehlt | gleiche Meldungen wie bisher; Oberflächentest grün | S |
| **B-2** | Roundtrip-Test: Beispielprojekt + eingefrorene v1-Referenzdatei → speichern → laden → identisch; Geometrie (Volumen) vor/nach gleich | `test/fixtures/beispiel-v1.wcad` (neu), `test/project.test.mjs` | B-1 | Roundtrip + Geometrievergleich | bestehende Dateien bleiben nachweislich lesbar | XS |
| **B-3** | Formatversion prüfen + Migrationskette (`migrate(prj)`, Register `1 → 2 …`, heute leer). Neuere Datei → verständliche Meldung; fehlende `version` → als 1 behandeln | `src/core/project.js`, `src/ui/files.js` | B-1 | unbekannte/neuere Version, fehlende Version, Migration mit Test-Dummy | **kein** Formatwechsel: Dateien bleiben `version: 1` | S |
| **B-4** | Strukturprüfung nach Laden und vor Speichern: eindeutige IDs, bekannte `kind`, `features` als Liste, Komponenten-/Zeichnungsverweise vorhanden. Ergebnis als Liste `{code, schwere, bezug, meldung}`; Warnungen öffnen trotzdem, nur Unlesbares wird abgelehnt | `src/core/project.js`, `src/ui/files.js` | B-1 | je ein beschädigtes Fixture pro Regel | klare Meldung statt stillem Fehler; nichts wird beim Laden verändert | S |
| **B-5** | Robusteres Lesen/Speichern im Hauptprozess: Lesefehler (fehlt, gesperrt) abfangen, `fsync` vor dem Umbenennen, bei unlesbarer Datei Angebot „Sicherung (.bak) öffnen“ | `electron/main.cjs`, `electron/preload.cjs`, `src/ui/files.js` | B-4 | Electron-Rauchtest: beschädigte Datei + `.bak` | kein Absturz, Sicherung erreichbar | S |
| **B-6** | Autosave als Datei im userData-Ordner statt `localStorage` (4,5-MB-Grenze fällt weg); Browser behält `localStorage` | `electron/main.cjs`, `preload.cjs`, `src/ui/files.js`, `src/ui/start.js` | B-5 | Electron-Rauchtest: großes Projekt, Wiederherstellen nach Neustart | große Projekte werden gesichert | S |
| **B-7** | Einheit Zoll in Ausdrücken (`in`, `"`) | `src/core/expr.js` | – | `1 in` = 25,4 mm, Mischformen | bestehende Ausdrücke unverändert | XS |

## Körpervalidierung

| ID | Aufgabe | Dateien | Abhängig von | Tests | Abnahme | Aufwand |
|---|---|---|---|---|---|---|
| **V-1** | Körperprüfung (Helfer aus PR #1) nach jedem Feature als **Warnung** im Feature-Status, abschaltbar falls zu langsam | `src/kernel/build.js` | Merge PR #1 | alle vorhandenen Geometrie-Testmodelle sind gültig; ein absichtlich defekter Körper wird gemeldet; Laufzeit vorher/nachher | keine bestehende Konstruktion wird als Fehler blockiert | S |
| **V-2** | Vorab-Prüfregeln vor dem Kernel-Aufruf (Länge ≤ 0, Wandstärke, sehr flache Gehrung) mit klarer Meldung | `src/kernel/build.js` | V-1 | Grenzfälle | Meldung statt OCCT-Ausnahme | S |

## Etappe P0-C: Modelländerung und Rückgängig

| ID | Aufgabe | Dateien | Abhängig von | Tests | Abnahme | Aufwand |
|---|---|---|---|---|---|---|
| **C-1** | `App.edit` atomar: wirft die Änderung eine Ausnahme, wird der Zustand vor der Änderung wiederhergestellt | `src/ui/app.js` (nach Merge #1) | – | Oberflächentest: absichtlich fehlerhafte Änderung | kein halb geänderter Stand | S |
| **C-2** | Oberflächentest: Parameter ändern → Rückgängig → Wiederholen → Speichern enthält den erwarteten Wert | `tools/e2e.mjs` | B-1 | neuer Schritt | gespeicherte Daten = angezeigtes Modell | S |

## Etappe P0-E: CI- und Release-Härtung

| ID | Aufgabe | Dateien | Abhängig von | Tests | Abnahme | Aufwand |
|---|---|---|---|---|---|---|
| **E-1** | Release-Workflow: vorgeschalteter Linux-Job mit Kern- **und** Geometrie-Tests; Windows-Build startet nur, wenn er grün ist | `.github/workflows/release.yml` | – | Release-Lauf ohne Veröffentlichung | rote Geometrie-Tests verhindern ein Release | XS |
| **E-2** | `npm test` an CI angleichen (`--stack-size`, neue Testdateien) | `package.json`, `ci.yml` | B-1 | lokal + CI | ein Befehl = was CI prüft | XS |
| **E-3** | Fehlerprotokoll: Renderer-/Kernel-Fehler in `werkcad.log` im userData-Ordner (rotierend, ohne Projektinhalte), Menüpunkt „Protokollordner öffnen“ | `electron/main.cjs`, `preload.cjs`, `src/ui/kernel.js` | – | Electron-Rauchtest | Fehler sind nach Absturz nachvollziehbar | S |
| **E-4** | Versionsnummer in `package.json` auf letzten Release (0.2.0) heben | `package.json` | – | – | lokale Builds tragen richtige Version | XS |
| **E-5** | LGPL-2.1-Text (OpenCascade) und Drittlizenzen im Installer beilegen und prüfen | `package.json` (`extraResources`), `build/` | – | Testbuild, Datei im Installationsordner | Lizenzpflicht erfüllt | S |

E-1, E-4 und E-5 berühren den Release-Mechanismus und werden nur mit ausdrücklicher Freigabe umgesetzt.

## Knickrahmen-MVP (K1–K10)

Läuft im Knickrahmen-Thread auf PR #1. Hier nur als Abhängigkeit: K8 (Speichern/Laden, Migrationstest) nutzt B-2/B-3, K6 (Validierungsanzeige) nutzt V-1. Gelenke/Bewegungsgrenzen (K4) sind laut Entscheidung vom 24.10. nicht relevant (starrer Rahmen).

## Reihenfolge und PR-Schnitt

1. **PR A:** B-1 + B-2 + E-2 – reines Herauslösen plus Roundtrip-Test, kein Verhaltenswechsel. *Risikoärmster Einstieg.*
2. **PR B:** B-3 + B-4 – Versionsprüfung, Migration, Strukturprüfung.
3. **PR C:** E-1 – Geometrie-Tests vor dem Release (Freigabe nötig).
4. **PR D:** B-7 – Zoll.
5. **PR E:** B-5 + B-6 – Backup-Öffnen und Autosave als Datei.
6. Nach Merge von PR #1: V-1, V-2, C-1, C-2.
7. E-3, E-4, E-5 nach Freigabe.

Jede Etappe endet mit einem Bericht im Format von Abschnitt 13 des Entwicklungsplans.
