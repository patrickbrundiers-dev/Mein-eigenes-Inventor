**Neu in 0.3.0**

- **Knickrahmen** (3D-Modell → Profile): ein Rechteck-/Quadratrohr mit 1–3 Segmenten, an jedem Knick V-förmig durch drei Wände ausgeklinkt, die Außenwand wird mit Innenradius gebogen. Ansicht gefaltet (ein Bauteil, Gehrung als Linie sichtbar) oder abgewickelt (gerades Rohr mit Ausklinkungen für den Rohrlaser, STEP); eine Zeile in der Zuschnittliste in Abwicklungslänge.
- Knickrahmen: Biegezugabe aus Innenradius und K-Faktor, Freistellung an der Außenwand optional (keine, rund als Langloch oder rechteckig, Mindestmaß automatisch), Reststeg 0,1 mm vor der Außenwand, Schweißspalt auf der Gehrung, optionale Positionier-Zapfen mit Spiel. *Innenradius 3 mm und K-Faktor 0,33 sind nur Startwerte – bitte Werte aus der eigenen Biegetabelle eintragen.*
- **Maße direkt beim Zeichnen** (wie in Inventor): Nach dem ersten Klick Wert tippen, Tab wechselt das Feld, Enter übernimmt. Rechteck: Breite und Höhe, z. B. `50` Tab `25` Enter = 50 × 25. Linie: Länge und Winkel, der Linienzug läuft weiter, Esc beendet. Kreis: Durchmesser. Formeln mit Parametern gehen auch, z. B. `Breite/2`. Ohne Eingabe funktioniert Klicken wie bisher.
- **Zoll in Maßfeldern:** `1 in`, `2 zoll`, `3/4"` (1 Zoll = 25,4 mm). Eine Einheit gilt jetzt für den ganzen Ausdruck davor: `100/2 cm` = 500 mm.
- **Sichereres Speichern:** Die Datei wird erst vollständig geschrieben und dann ersetzt. Lässt sich ein Projekt nicht öffnen, bietet WerkCAD die automatische Sicherung (`.bak`) an.
- **Projektprüfung beim Öffnen:** beschädigte Dateien werden mit klarer Meldung abgelehnt, das offene Projekt bleibt erhalten. Dateien aus neueren Versionen öffnen mit Hinweis.
- **Automatische Sicherung ohne Größengrenze** – auch große Projekte mit STEP-Importen werden gesichert.
- **Fehlerprotokoll:** Über WerkCAD → „Protokollordner öffnen“. Enthält keine Projektdaten.
- **Geometrie-Prüfung:** Fehlerhafte Körper werden am Feature als Hinweis markiert. Unmögliche Eingaben (Gehrung über 90°, Profil zu kurz für die Gehrungen, Wandstärke zu groß, Tiefe 0 …) ergeben eine klare Meldung mit Grenzwert.
- **Änderungen ohne halben Stand:** Schlägt eine Änderung fehl, bleibt das Modell wie vorher.
- Lizenztexte der verwendeten Bibliotheken liegen im Installationsordner unter `resources\lizenzen`.

Hinweis: In Ausdrücken wie `1/2 cm` ändert sich der Wert (vorher 0,05 mm, jetzt 5 mm). Ausdrücke mit `mm` oder ohne Einheit sind nicht betroffen.
