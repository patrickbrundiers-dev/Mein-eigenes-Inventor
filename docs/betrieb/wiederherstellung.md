# Wiederherstellen und Zurückrollen

Stand: 0.3.0. Für Anwender und Support.

## Daten wiederherstellen

| Fall | Was WerkCAD tut | Wo die Daten liegen |
|---|---|---|
| Programm abgestürzt, Strom weg | Beim nächsten Start bietet die Startseite „Wiederherstellen“ an (jüngste automatische Sicherung, geprüft vor dem Öffnen). | `%APPDATA%\WerkCAD\wiederherstellung\autosave.json` |
| Projektdatei lässt sich nicht öffnen | Meldung mit Grund; gibt es eine Sicherung, bietet WerkCAD „Sicherung öffnen“ an. Die Sicherung öffnet ungespeichert, damit sie unter neuem Namen gespeichert wird. | `<Projekt>.wcad.bak` neben der Datei (Stand vor dem letzten Speichern) |
| Speichern bricht ab (Datenträger voll, gesperrt) | Die alte Datei bleibt unverändert: geschrieben wird erst in eine Hilfsdatei, dann ersetzt. | – |
| Änderung schlägt fehl | Modell bleibt auf dem Stand davor, kein halber Stand. | – |
| Datei aus neuerer WerkCAD-Version | Öffnet mit Hinweis; unbekannte Felder können beim Speichern verloren gehen, darum besser mit der neueren Version weiterarbeiten. | – |

Fehlerprotokoll: WerkCAD → „Protokollordner öffnen“ (`%APPDATA%\WerkCAD\protokoll\werkcad.log`, rotierend, ohne Projektinhalte). Bei Fehlermeldungen diese Datei mitschicken.

## Version zurückrollen

1. Unter **Releases** das Setup der gewünschten älteren Version (`WerkCAD-Setup-x.y.z.exe`) herunterladen und ausführen. Es installiert über die aktuelle Version; Einstellungen, Token und Sicherungen im `%APPDATA%\WerkCAD`-Ordner bleiben erhalten.
2. Automatische Updates bieten danach wieder die neueste Version an. Wer dauerhaft bei der älteren bleiben will, schaltet unter **Datei → Einstellungen → Updates** die automatische Prüfung aus.
3. Projektdateien: Das Format ist seit 0.1 unverändert `version: 1`. Ältere Versionen öffnen Dateien der neueren, solange keine neuen Feature-Typen (z. B. Knickrahmen ab 0.3.0) enthalten sind; diese Features zeigen dann einen Fehler, die übrigen Daten bleiben erhalten.

## Upgrade-Nachweis

`test/fixtures/beispiel-v1.wcad` ist eine eingefrorene Datei aus der Zeit vor 0.3.0. `test/project-kernel.test.mjs` öffnet sie mit der aktuellen Version, baut alle Bauteile neu auf und vergleicht die Volumina mit festen Sollwerten (Toleranz 1 mm³). Läuft in CI und vor jedem Release.
