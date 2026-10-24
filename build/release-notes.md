**Neu in 0.3.0**

- **Maße direkt beim Zeichnen** (wie in Inventor): Nach dem ersten Klick Wert tippen, **Tab** wechselt das Feld, **Enter** übernimmt.
  - Rechteck: Breite (oben) und Höhe (rechts) → bemaßtes Rechteck, z. B. `50` Tab `25` Enter = 50 × 25.
  - Linie: Länge und Winkel, der Linienzug läuft weiter, Esc beendet.
  - Kreis: Durchmesser.
  - Formeln mit Parametern gehen auch, z. B. `Breite/2`. Ohne Eingabe funktioniert Klicken wie bisher.
- **Zoll** als Einheit in allen Maßfeldern: `2 in`, `2 zoll` oder `2"`.
- **Projektdatei robuster**: Formatversion mit automatischer Umstellung älterer Dateien, Prüfung beim Öffnen, sicheres Speichern, automatische Sicherung als Datei, die sich beim Start öffnen lässt.
- **Fehlerprotokoll** im Benutzerordner, damit Probleme nachvollziehbar sind.
- Installer enthält die Lizenztexte; Releases werden nur nach bestandenen Tests gebaut.
