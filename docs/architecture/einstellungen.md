# Einstellungen

Stand: 24.10.2026 · Masterplan Werkzeuge/Einstellungen, Abschnitte 13 und 14.

## Aufbau

| Teil | Datei | Aufgabe |
|---|---|---|
| Schema, Prüfung, Migration, Suche | `src/core/settings.js` | rein, ohne DOM, getestet in `test/settings.test.mjs` |
| Laden/Speichern, Änderungen melden | `src/ui/prefs.js` | Desktop: `benutzereinstellungen.json` im Benutzerordner (atomar, `.bak`); Browser: `localStorage` |
| Einstellungscenter | `src/ui/settings.js` | Kategorien, Suche, sofortige Übernahme gültiger Werte, Import/Export |
| Anwenden | `App.applyPrefs`, `Viewer.applyPrefs`, `Sketcher.applyPrefs` | wirkt nur auf Anzeige und Bedienung |

Öffnen: **Datei → Einstellungen…** oder **Strg+,**.

## Regeln

- **Getrennte Ablage.** Benutzereinstellungen liegen in `benutzereinstellungen.json`. Token und Update-Daten bleiben in
  `einstellungen.json` (Token mit Windows-Verschlüsselung) und tauchen weder im Export noch im Protokoll auf.
  Dokumentwerte gehören später in die `.wcad`-Datei, Maschinenprofile in ein eigenes Format.
- **Effektiver Wert:** Werkzeugstandard < Benutzervorgabe < Dokumentvorgabe < explizite Eingabe (`effectiveValue`).
  Heute gibt es nur die Benutzerebene.
- **Keine stille Ersetzung.** Ungültige Eingaben im Center werden abgelehnt und rot markiert; der alte Wert bleibt.
  Ungültige Werte in der Datei werden beim Laden verworfen und als Hinweis gemeldet (Toast + Fehlerprotokoll).
- **Beschädigte Datei:** Standardwerte, die defekte Datei wird als `benutzereinstellungen.defekt-<Zeit>.json` aufbewahrt.
- **Version und Migration:** Datei `{ format: "werkcad-einstellungen", version, values }`, gespeichert werden nur
  Abweichungen vom Standard. Migrationen stehen in `MIGRATIONS` (Version 0 = Werte ohne Hülle). Dateien aus neueren
  Versionen: bekannte Werte werden übernommen, unbekannte ignoriert.
- **Keine Modelländerung.** Einstellungen ändern nie Projektdaten (geprüft im Oberflächentest).
- **Nur echte Optionen.** Was noch nicht wirkt, steht je Kategorie unter „Geplant“ und hat kein Eingabefeld.

## Optionen (Standardwerte)

| Kategorie | Option | Standard | Wirkung |
|---|---|---|---|
| Allgemein | Automatische Sicherung nach | 1,5 s | Wartezeit vor dem Schreiben der Wiederherstellungsdatei (0,5–120 s) |
| | Löschen von Dokumenten bestätigen | ja | Rückfrage bleibt immer, wenn das Dokument noch verwendet wird |
| | Dezimalstellen für Messwerte | 3 | Messen zweier Flächen (Abstand, Winkel) |
| 3D-Ansicht | Darstellungsqualität | Normal | auch über Menüband Ansicht → Darstellung, wird gemerkt |
| | Maustasten | rechts drehen, Mitte schwenken | alternativ Mitte drehen, rechts schwenken |
| | Zum Mauszeiger zoomen | ja | |
| | Zoom-/Drehgeschwindigkeit | 1,2 / 0,9 | |
| | Bodenraster, ViewCube | ja / ja | |
| | Kanten-, Auswahl-, Hover-Farbe | #1c2733 / #d9600c / #ef7d1a | |
| Skizzen | Rasterfang beim Öffnen | nein | |
| | Rasterweite | 0 = automatisch | feste Weite in mm für Fang und Anzeige |
| | Fangradius | 7 px | Punkte, Mittelpunkte, Elemente |
| | Symbole der Abhängigkeiten | ja | |
| Darstellung | Ansichtswechsel animieren | ja | aus = reduzierte Bewegung |
| | Oberflächengröße | 100 % | nur Desktop (Zoomfaktor des Fensters) |
| Updates | Token, Prüfung beim Start | – | wie bisher, jetzt als Kategorie im Center |
