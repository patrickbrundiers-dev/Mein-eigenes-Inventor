# ADR-0003: Noch keine Plugin-API

Status: angenommen · Datum: 24.10.2026 · Plan P1-E

## Kontext

Der Plan sieht Plugin-/Automatisierungsschnittstellen vor, „sobald interne APIs stabil sind“. Das Datenmodell wächst gerade noch (Knickrahmen, Prüfregeln). Eine öffentliche API würde jede interne Änderung zum Kompatibilitätsbruch machen. Es gibt keinen Nutzer, der heute Plugins schreibt.

## Entscheidung

1. Keine Plugin-Schnittstelle und kein Skript-Interpreter in der App.
2. Die faktische Schnittstelle ist das Projektformat (`.wcad`, JSON, `version: 1`) mit Prüfung und Migrationskette in `src/core/project.js`. Externe Werkzeuge (z. B. die Rohrlaser-Kalkulation) lesen STEP + Zuschnitt-CSV oder das Projekt-JSON.
3. Interne Grenzen bleiben getestet: `src/core/*` (reine Funktionen, Unit-Tests), Kernel-Aufrufe (`buildPart`, Exporte; Kernel-Tests), Projektformat (Roundtrip- und Upgrade-Test).

## Wiedervorlage

Wenn ein konkreter Automatisierungsfall auftaucht (z. B. Rahmen aus einer Tabelle erzeugen): zuerst ein Kommandozeilenwerkzeug auf Basis von `src/core` + Kernel in Node, versioniert über die Formatversion. Erst danach eine In-App-API.
