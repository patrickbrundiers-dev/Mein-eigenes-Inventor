**Neu in 0.3.0**

- **Skizze: Maße direkt eintippen** beim Rechteck – Breite und Höhe mit Tab wechseln, mit Enter übernehmen.
- **Zoll in Maßfeldern:** `1 in`, `2 zoll`, `3/4"` (1 Zoll = 25,4 mm). Eine Einheit gilt jetzt für den ganzen Ausdruck davor: `100/2 cm` = 500 mm.
- **Sichereres Speichern:** Die Datei wird erst vollständig geschrieben und dann ersetzt. Lässt sich ein Projekt nicht öffnen, bietet WerkCAD die automatische Sicherung (`.bak`) an.
- **Projektprüfung beim Öffnen:** beschädigte Dateien werden mit klarer Meldung abgelehnt, das offene Projekt bleibt erhalten. Dateien aus neueren Versionen öffnen mit Hinweis.
- **Automatische Sicherung ohne Größengrenze** – auch große Projekte mit STEP-Importen werden gesichert.
- **Fehlerprotokoll:** Über WerkCAD → „Protokollordner öffnen“. Enthält keine Projektdaten.
- Lizenztexte der verwendeten Bibliotheken liegen im Installationsordner unter `resources\lizenzen`.

Hinweis: In Ausdrücken wie `1/2 cm` ändert sich der Wert (vorher 0,05 mm, jetzt 5 mm). Ausdrücke mit `mm` oder ohne Einheit sind nicht betroffen.
