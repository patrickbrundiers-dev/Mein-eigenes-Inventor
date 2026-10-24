# Risiken und P0-Backlog

Stand: 24.10.2026 · nach dem Audit ([current-state.md](../architecture/current-state.md))

## Risiken (priorisiert)

| # | Risiko | Wahrscheinlichkeit / Wirkung | Gegenmaßnahme |
|---|---|---|---|
| R1 | Fachliches Missverständnis „Knickrahmen“ (starr geknickt vs. klappbar mit Gelenken); Referenzbilder fehlen | hoch / hoch | Freigabe der Abgrenzung vor Stufe 1 (`docs/knickrahmen/stufe1-plan.md`, Abschnitt 1) |
| R2 | Ungültige Körper bleiben unerkannt (keine BRepCheck-Prüfung) | mittel / hoch | Prüfung zuerst für neue Features, später optional für alle |
| R3 | Fertigungsdaten falsch (Zuschnittlänge, Gehrung) | mittel / hoch | analytische Tests mit begründeten Toleranzen; fachliche Prüfung an einem realen Teil |
| R4 | Dateiformat ohne Migration; spätere Feldänderungen brechen alte Dateien | mittel / hoch | neue Funktionen nur als neue Feature-Typen mit eigener `version`; Roundtrip-Test |
| R5 | Release ohne Geometrie-Tests | mittel / mittel | Geometrie-Tests in den Release-Workflow (nur nach Freigabe) |
| R6 | LGPL-2.1 (OpenCascade) bei kommerzieller Weitergabe | niedrig / hoch | Lizenztext im Installer prüfen, WASM austauschbar halten |
| R7 | Autosave greift bei großen Projekten nicht | mittel / mittel | Autosave als Datei im userData-Ordner statt localStorage |
| R8 | Kernel-Fehler bei Grenzgeometrie (sehr flache Gehrung, kurze Segmente) | mittel / mittel | Vorab-Prüfregeln vor dem Kernel-Aufruf, klare Meldungen |
| R9 | Funktionsumfang der Masterpläne wächst unkontrolliert | hoch / mittel | P0/P1/P2-Gates, max. 3 kleine Schritte gleichzeitig |

## Abhängigkeiten

```
Körperprüfung (B1) ──▶ Knickrahmen Stufe 1 (B2) ──▶ Stufe 2 Verbindungen ──▶ Stufe 3 Varianten
Roundtrip-Test (B4) ──▶ jede Formatänderung
Einstellungscenter (B8) ──▶ Blech-/Maschinenparameter
```

## Backlog (Vorschlag)

Aufwand: XS < 1 h · S ≈ halber Tag · M ≈ 1–2 Tage · L > 2 Tage.

| ID | Aufgabe | Dateien | Tests | Abnahme | Aufwand |
|---|---|---|---|---|---|
| B1 | Hilfsfunktion Körperprüfung (`BRepCheck_Analyzer`), zunächst nur für neue Features | `src/kernel/build.js` | Geometrie-Test gültiger/ungültiger Körper | keine Änderung an bestehenden Modellen | S |
| B2 | **Knickrahmen Stufe 1** (K1–K4, K6–K8 im Kleinen) | siehe Stufe-1-Plan | T1–T11, E1 | Akzeptanzkriterien Stufe 1 | M |
| B3 | Geometrie-Tests im Release-Workflow | `.github/workflows/release.yml` | Testlauf Release ohne Veröffentlichung | Release bricht bei roten Geometrie-Tests ab | XS |
| B4 | Roundtrip-Test Projektdatei für Beispielprojekt | `test/kernel.test.mjs` | neuer Test | grün | XS |
| B5 | Prüfung `version` beim Öffnen, Warnung bei neuerer Datei | `src/ui/files.js` | Kern-Test | ältere App meldet neuere Datei verständlich | S |
| B6 | Autosave als Datei statt localStorage | `electron/main.cjs`, `preload.cjs`, `files.js` | Electron-Rauchtest | große Projekte werden gesichert | S |
| B7 | Einheit Zoll in Ausdrücken (`in`, `"`) | `src/core/expr.js` | Kern-Test | `1 in` = 25,4 mm | XS |
| B8 | Einstellungscenter, erste Kategorien (Anzeige, Einheiten-Anzeige, Autosave) | `props.js`, `main.cjs` | E2E | Werte bleiben nach Neustart | L |
| B9 | Knickrahmen Stufe 2: Stumpfstoß, runde Freistellungen, Bohrungen/Langlöcher | `knickrahmen.js`, `build.js`, `props.js` | Modul-Plan E, F | | M |
| B10 | ADR Blech/Abwicklung | `docs/decisions/` | – | Entscheidung dokumentiert | S |

## Vorschlag: höchstens drei erste Schritte

1. **B1 + B2 zusammen** als ein PR „Knickrahmen Stufe 1“ – die Körperprüfung wird dort
   gebraucht und nur dort eingesetzt. Risikoarm, weil nur ein neuer Feature-Typ dazukommt.
2. **B4** Roundtrip-Test (XS) – schützt das Dateiformat, bevor weitere Typen dazukommen.
3. **B3** Geometrie-Tests im Release-Workflow (XS) – nur mit ausdrücklicher Freigabe,
   weil es den Release-Mechanismus betrifft.
