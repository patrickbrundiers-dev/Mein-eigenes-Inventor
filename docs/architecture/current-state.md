# PBCAD – Ist-Zustand (Audit Phase 0)

Stand: 24.10.2026 · Commit `cf39217` (main) · nur Analyse, keine Produktdatei geändert

## Kurzfassung

PBCAD ist eine Electron-Desktop-App (Windows) mit einem echten B-Rep-Kernel:
OpenCascade (WASM) über **replicad**, das in einem Web-Worker läuft. Die Oberfläche ist
reines JavaScript ohne UI-Framework, die 3D-Ansicht ist three.js. Das Modell ist ein
JSON-Dokument mit Featureliste; Geometrie wird bei jeder Änderung deterministisch aus
den Features neu aufgebaut. Es gibt bereits Rohr-/Profilfunktionen mit Gehrung,
„Rahmen aus Skizze“, Zuschnittliste und STEP-Export – darauf lässt sich das
Knickrahmen-Modul direkt aufbauen, ohne Architekturumbau.

## Technik

| Bereich | Ist-Zustand | Dateien |
|---|---|---|
| Sprache | JavaScript (ES-Module), keine Typen, kein Linter | `src/**` |
| Laufzeit | Electron 45 (Desktop), alternativ Browser über `npm run serve` | `electron/`, `tools/serve.mjs` |
| Build | esbuild → `dist/` (app.js, worker.js, `replicad_single.wasm`) | `build.mjs` |
| UI | eigenes DOM-Helferlein (`h()`), Ribbon, Modellbrowser, Eigenschaften-Panel, Modale | `src/ui/dom.js`, `ribbon.js`, `tree.js`, `props.js` |
| 3D-Ansicht | three.js 0.186, orthografische Kamera, ViewCube, Auswahl von Flächen/Kanten | `src/ui/viewer.js` |
| CAD-Kernel | replicad 1.2.0 + replicad-opencascadejs 1.1.0 (OCCT als WASM) im Web-Worker | `src/kernel/worker.js`, `src/kernel/build.js` |
| Kern ohne Geometrie | Formeln/Parameter, Skizzen-Löser, Querschnitte, DXF, SVG-Pfade, Baugruppen-Löser | `src/core/*.js` |
| Persistenz | eine `.wcad`-Datei (JSON) pro Projekt, atomisches Schreiben + `.bak` | `src/ui/files.js`, `electron/main.cjs:110` |
| Autosave | `localStorage` (bis 4,5 MB), Wiederherstellung beim Start | `src/ui/files.js:77` |
| Undo/Redo | Projekt-Snapshots als JSON, max. 100 Schritte | `src/ui/app.js:158` |
| Updates | electron-updater, GitHub-Releases, Download/Installation nur nach Klick, optionaler Token (safeStorage) | `electron/updater.cjs`, `electron/main.cjs` |
| Lizenzlogik | keine (Produkt ist `UNLICENSED`, privat) | – |
| Einstellungen | `einstellungen.json` im userData-Ordner: Token, Auto-Update, zuletzt geöffnet, letzte Ordner | `electron/main.cjs:27` |

## Prozessgrenzen

1. **Hauptprozess** (`electron/main.cjs`): Fenster, `app://`-Protokoll für `dist/`
   (mit Pfadprüfung), Dateidialoge, Lesen/Schreiben von Dateien, PDF-Druck,
   Einstellungen, Updates.
2. **Preload** (`electron/preload.cjs`): schmale Brücke `window.werkcad` über
   `contextBridge` (contextIsolation, sandbox, kein nodeIntegration).
3. **Renderer** (`src/ui/*`): komplette Oberfläche, Projektzustand, Undo, Skizzierer,
   Zeichnungseditor. Kennt keine Node-APIs.
4. **Geometrie-Worker** (`src/kernel/worker.js`): lädt OCCT-WASM, baut Bauteile,
   vernetzt für die Anzeige, exportiert STEP/STL, Projektionen für Zeichnungen,
   Platten-DXF. Absturz → automatischer Neustart (`src/ui/kernel.js`).

Details zum Datenfluss: [data-flow.md](data-flow.md).

## Datenmodell

Projekt (`newProject`, `src/core/examples.js`):

```
{ format: "werkcad", version: 1, name, created, saved, docs: [ … ] }
```

Dokumente (`docs[]`) haben `kind`:

- `part`: `id, name, number, material, color, params[], features[], description`
- `assembly`: `components[]` (part-Referenz, `pos`, `rot`, `fixed`, `hidden`) + Abhängigkeiten
- `drawing`: Blatt, Schriftfeld, Ansichten, Maße, Texte, Quelle

Features eines Bauteils (`features[]`, je mit `id`, `type`, `name`, optional `suppressed`):
`sketch`, `extrude`, `revolve`, `hole`, `profile`, `frame`, `fillet`, `chamfer`,
`shell`, `pattern`, `mirror`, `import`. Zahlenwerte sind **Ausdrücke** (Strings) mit
Parametern und Einheiten (`mm`, `cm`, `m`, `°`), ausgewertet in `src/core/expr.js`.

Ergebnis eines Aufbaus (`buildPart`, `src/kernel/build.js:189`):
`bodies[]` mit `kind: "solid" | "member"`, `meta` (bei Profilen: Profil-ID, Fläche,
Zuschnittlänge, Gehrungswinkel, ausgeklinkt), plus `status[featureId]` mit
`ok/error/warning/info`.

Einheiten: intern ausschließlich Millimeter und Grad. Zoll gibt es nicht.

## Wichtige Abläufe

| Ablauf | Wo | Bemerkung |
|---|---|---|
| Start | `src/ui/main.js`, `start.js` | Startbildschirm, zuletzt geöffnet, Beispielprojekt, Angebot zur Wiederherstellung |
| Projekt öffnen | `Files.open` → `bridge.readProject` | Prüft nur `format === "werkcad"` und `docs` als Array |
| Modell bearbeiten | `App.edit(label, fn)` → `checkpoint` → `changed` → `rebuild` (90 ms entprellt) | jede Änderung läuft über diesen Weg |
| Speichern | `Files.save` → `project:save` → `atomicWrite` | `.tmp` + Umbenennen, vorherige Datei als `.bak` |
| Export | `Files.export*` → Worker | STEP, STEP+Zuschnittliste, STL, Profile einzeln, CSV, Platten-DXF, Skizzen-DXF, Zeichnung PDF/DXF/SVG |
| Update | `updater.cjs` | Hinweisleiste, Download und Installation jeweils erst nach Klick |

## Tests und CI

Siehe [Baseline](../testing/baseline-2026-10-24.md). Kurz: 16 Kern-Tests, 15
Geometrie-Tests, 25 Oberflächenschritte (Chrome/Playwright), 6 Electron-Rauchtests –
alle grün. CI: `.github/workflows/ci.yml` (Linux, bei PRs und bei Code-Pushes auf
main), Release: `.github/workflows/release.yml` (Windows, manuell).

## Vorhandene Bausteine, die das Knickrahmen-Modul nutzen kann

| Baustein | Ort | Nutzen |
|---|---|---|
| `sectionGeometry` + Katalog | `src/core/sections.js` | Rechteck-/Quadratrohr mit Innen- und Außenkontur, Radien nach EN 10219, Wandstärkenprüfung |
| `makeMember` | `src/kernel/build.js:85` | echter Profilkörper mit beliebigen Schnittebenen an beiden Enden (Gehrung) |
| `memberFrame` | `src/kernel/build.js:126` | lokales Koordinatensystem eines Stabs |
| Gehrungslogik in `buildFrame` | `src/kernel/build.js:544` | Winkelhalbierende als Schnittebene an Knoten – genau der Knickstoß |
| `memberLength`, `profileId`, `meta` | `build.js`, `sections.js` | Zuschnittlänge, Profil-ID im Format der Rohrlaser-Kalkulation |
| Zuschnittliste / Stückliste | `src/ui/props.js:652–680` | gruppiert alle `member`-Körper automatisch |
| STEP + Zuschnittliste | `src/ui/files.js` (`exportStepWithList`) | Übergabe an die Kalkulation existiert schon |
| Feature-Status | `buildPart` | Fehler je Feature mit verständlichem Text |
| Prefix-Cache | `build.js:178` | schneller Neuaufbau bei Parameteränderung |

## Befunde (bekannte Schwächen, nicht behoben)

Diese Punkte sind nur markiert, nichts wurde geändert.

1. **Keine Körperprüfung.** Kein Aufruf von `BRepCheck_Analyzer`; ungültige Körper
   würden nicht erkannt. Die Klasse ist im WASM-Build verfügbar (geprüft:
   `new OC.BRepCheck_Analyzer(shape.wrapped, true, false).IsValid()` liefert `true`).
2. **Fehlgeschlagene Features werden übersprungen**, nicht zurückgerollt: das Modell
   zeigt den Zustand ohne dieses Feature. Kein Datenverlust (Parameter bleiben), aber
   kein „letzter gültiger Zustand“.
3. **Dateiformat ohne Migration.** `version: 1` wird geschrieben, aber nicht geprüft;
   es gibt keine Schema-Validierung. Ein unbekannter Feature-Typ führt zu einer
   Feature-Fehlermeldung („Unbekanntes Feature“), nicht zum Absturz – ältere
   Programmversionen öffnen neuere Dateien also, zeigen aber Fehler.
4. **Autosave-Grenze.** Projekte über 4,5 MB (z. B. mit eingebetteten STEP-Importen)
   werden stillschweigend nicht automatisch gesichert.
5. **Keine Zoll-Einheit** in Ausdrücken.
6. **Release-Workflow führt nur Kern-Tests aus**, keine Geometrie- oder
   Oberflächentests vor der Veröffentlichung.
7. **Versionsnummer im Repo** (`package.json`: 0.1.0) entspricht nicht dem letzten
   Release (0.2.0); der Release-Workflow setzt sie erst beim Bauen. Lokale
   `npm run dist`-Builds tragen daher 0.1.0.
8. **Lizenz OpenCascade: LGPL-2.1.** Für die Weitergabe muss der Lizenztext
   beiliegen und die Bibliothek austauschbar sein. Die WASM-Datei liegt getrennt in
   `dist/` (günstig); ob der LGPL-Text im Installer landet, ist **unklar** und sollte
   vor kommerzieller Weitergabe geprüft werden. replicad, three.js, electron-updater: MIT.
9. **Einstellungen** sind nur für Updates vorhanden; Anzeigequalität, Raster usw. werden
   nicht gespeichert. Kein Einstellungscenter.
10. **Kein Linter/Formatter** im Projekt.

## Doppelte oder veraltete Module

Keine gefunden. Die Commits `2c9153f`–`edc19df` („Probe“) waren API-Erkundungen; ihre
Dateien sind nicht mehr im Baum.
