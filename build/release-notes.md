**Neu in 0.5.0**

- **WerkCAD heißt jetzt PBCAD.** Das Update installiert in den bisherigen Ordner, Einstellungen, Projekte (`.wcad`) und Benutzerdaten bleiben erhalten. Die Setup-Datei heißt ab jetzt `PBCAD-Setup-<Version>.exe`.
- **Update-Suche robuster:** lädt die Update-Information direkt vom neuesten Release. Fehler erscheinen nur noch einmal in den Einstellungen statt als gestapelte rote Meldungen, ein privates Repository wird als Ursache benannt.
- **Ansicht:**
  - Alle sieben Richtungen (Iso, Vorne, Hinten, Links, Rechts, Oben, Unten).
  - „Normal zur Fläche“ für eine gewählte ebene Fläche und „Auswahl zeigen“ (Zoom auf die Auswahl).
  - Perspektive und orthogonale Ansicht umschaltbar (wird gemerkt). Beim Skizzieren ist die Ansicht immer orthogonal.
  - Darstellungsmodi: schattiert mit Kanten, schattiert, Drahtmodell, transparent.
  - Schnittebene X/Y/Z im 3D-Fenster mit Schieber und Seitenwechsel. Sie ist nur Anzeige und ändert das Modell nicht.
- **Befehlssuche** mit Strg+K. Tastaturkürzel lassen sich im Einstellungscenter anpassen, doppelt belegte Tasten werden abgelehnt.
- **Messwerkzeug** (Taste M): Fläche, Kante oder Bohrung anklicken. Es zeigt exakte Werte aus dem Geometrie-Kern, Abstände, Oberfläche und Schwerpunkt.
- Geprüft mit einer Baugruppe aus 150 Komponenten:
  - Öffnen und Auswählen bleiben unter einer Sekunde.
  - Die Kollisionsprüfung braucht etwa eine Sekunde.

Hinweis: Wenn die Update-Suche in 0.3.0 oder 0.4.0 „404“ meldet, bitte 0.5.0 einmal von Hand installieren (Setup von der Release-Seite, in den bisherigen Ordner). Ab 0.5.0 sucht PBCAD auf dem neuen Weg.
