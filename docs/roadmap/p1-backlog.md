# PBCAD – Backlog nach P0 (Rest P0-E, P1, Entscheidung P2)

Stand: 24.10.2026 · Basis: `main` nach Release 0.3.0 · Patrick: „weiter mit dem Plan komplett abarbeiten“, „alles selber prüfen und entscheiden“.

Aufwand: **XS** < 1 h · **S** ≈ halber Tag · **M** 1–2 Tage · **L** > 2 Tage. Jede Zeile = ein kleiner PR von `main`, CI grün → selbst mergen; Release gesammelt.

Reihenfolge nach Nutzen für Patricks Fertigung (Rohrlaser, Schweißbaugruppen) und Risiko.

## Rest P0-E: Regression und Release-Härtung

| ID | Aufgabe | Tests | Abnahme | Aufwand |
|---|---|---|---|---|
| **E-6** | Doku „Wiederherstellen und Zurückrollen“: Autosave, `.bak`, Fehlerprotokoll, ältere Version installieren | – | Weg ist in `docs/` und README beschrieben | XS |
| **E-7** | Upgrade-Test: Referenzdateien aus 0.2 (ohne neue Felder) öffnen, neu aufbauen, Kennwerte gleich | `test/project-kernel.test.mjs` | Upgrade aus Vorversion nachgewiesen | XS |

## P1-A: Parametrik und Feature-Baum

| ID | Aufgabe | Tests | Abnahme | Aufwand |
|---|---|---|---|---|
| **A-1** | Folgefehler sichtbar: Feature, dessen Skizze/Bezug fehlerhaft ist, meldet „hängt von »X« ab“ statt nur „fehlt“ | Kernel-Test | Ursache im Feature-Baum erkennbar | S |
| **A-2** | Testmodell „vorgelagertes Feature ändern“: Skizzenmaß ändern → Bohrung/Fase/Muster bleiben gültig, Neuaufbau deterministisch (zweimal gleich) | Kernel-Test | deterministische Neuberechnung belegt | S |

## P1-C: Fertigung (höchster Nutzen)

| ID | Aufgabe | Tests | Abnahme | Aufwand |
|---|---|---|---|---|
| **F-1** | Zuschnittliste: verwendete Regeln offenlegen (Länge = Außenmaß entlang Achse, Gehrungswinkel, Abwicklungslänge beim Knickrahmen) als Kopf in CSV und Hinweis im Panel; gleiche Profile/Längen zusammenfassen mit Anzahl | Unit-Test | Regeln nachvollziehbar, Anzahl stimmt | S |
| **F-2** | Zeichnung: Positionsnummern an Baugruppenansichten + Stückliste als Tabelle auf dem Blatt (PDF/DXF/SVG) | UI-Test + Export-Test | Pos.-Nr. auf Blatt = Stückliste | M |
| **F-3** | Zeichnung: Detailansicht (Kreis-Ausschnitt, Maßstab) | UI-Test | Detail im Export | M |

## P1-B: Baugruppen und Kollision

| ID | Aufgabe | Tests | Abnahme | Aufwand |
|---|---|---|---|---|
| **G-1** | Kollisionsprüfung zwischen Komponenten (Schnittvolumen > Toleranz 1 mm³), Ergebnis als Liste + Markierung | Kernel-Test: Kontakt (keine Kollision), Überlappung (Kollision), Abstand | absichtlich kollidierender Fall wird erkannt | M |
| **G-2** | Abhängigkeit „Konzentrisch“ (Achse an Achse) | Unit-Test asmsolve | Rohr in Bohrung ausrichtbar | M |

## P1-D: Blech und Material

| ID | Aufgabe | Abnahme | Aufwand |
|---|---|---|---|
| **D-1** | ADR: Blech (Kanten/Abwicklung) vorerst nicht, nur Knickrahmen-Biegung. Grund: OCCT/replicad bietet keine Blech-Abwicklung, eigene Algorithmen verbietet der Plan. Biege- und Materialdaten zentral in `sections.js`/`knickrahmen.js` | ADR liegt vor | XS |

## P1-E: API und Erweiterbarkeit

| ID | Aufgabe | Abnahme | Aufwand |
|---|---|---|---|
| **X-1** | ADR: keine Plugin-API, solange das Datenmodell sich noch ändert. Stattdessen stabile, versionierte Kern-Schnittstelle `src/core/` + Kernel-Aufrufe dokumentiert und durch Tests abgesichert | ADR + Schnittstellen-Doku | S |

## P2: Entscheidung

Laut Plan (Abschnitt 8) nur nach Nutzen-/Kosten-/Risikoentscheidung. **Entscheidung:** P2 wird jetzt nicht begonnen (ADR-0003). Begründung und Wiedervorlage-Kriterien stehen im ADR.
