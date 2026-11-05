# ADR-0009: Lizenzprüfung mit signierten Schlüsseln

Stand: 05.11.2026 · Status: umgesetzt

## Entscheidung

- Lizenzschlüssel sind mit **Ed25519** signiert: `PBCAD1.<Daten base64url>.<Signatur base64url>`.
  Daten: `nr`, `name`, optional `firma`, `email`, `ausgestellt`, `bis` (letzter gültiger Tag), `rechner` (Rechner-ID).
- In PBCAD steht nur der **öffentliche Schlüssel** (`electron/lizenz.cjs`). Prüfen geht offline, ohne Server.
- Der **private Schlüssel** ist nicht im Repository und in keinem Release. Er steckt nur im
  Lizenz-Werkzeug (eine HTML-Datei, läuft offline im Browser), das Patrick einmalig bekommen hat.
  Ohne diese Datei lassen sich keine Lizenzen erstellen; geht sie verloren, braucht es ein neues
  Schlüsselpaar (neuer öffentlicher Schlüssel in PBCAD, alle Lizenzen neu ausstellen).
- Ohne gültige Lizenz läuft PBCAD **30 Tage als Testversion** (Hinweis beim Start). Danach lädt das
  Fenster nur `lizenz.html`; `app://` liefert dann keine anderen Dateien aus.
- Rechner-ID: SHA-256 der Windows-MachineGuid, 16 Zeichen. Lizenzen ohne Rechner-ID gelten überall.
- Testbeginn steht in `einstellungen.json` und zusätzlich in `%LOCALAPPDATA%\PBCAD\pbcad-start.dat`;
  es zählt der frühere. Zurückgestellte Uhr: es zählt die zuletzt gesehene Zeit.
- Sperren: Lizenznummern in `SPERRLISTE` (`electron/lizenz.cjs`), wirkt ab dem nächsten Update.
- Ohne Installation (`npm start`) keine Prüfung, außer `PBCAD_LIZENZ_TEST=1`.

## Grenzen

Ein Kopierschutz für eine Electron-App lässt sich mit genug Aufwand umgehen (app.asar verändern).
Ziel ist, dass niemand ohne Patricks Werkzeug einen gültigen Schlüssel erzeugen kann, nicht ein
unknackbarer Schutz.
