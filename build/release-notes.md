**Neu in 0.19.0**

- **Neuer Startbildschirm nach Inventor-Vorbild:**
  - Links: Öffnen, Neu mit Vorlagen (Bauteil, Rahmen, Baugruppe, leer, Beispiel) und Verweise auf Neuigkeiten, Erste Schritte, Befehl suchen und Anwendungsoptionen.
  - Rechts: zuletzt verwendete Projekte als Kacheln mit Vorschaubild oder als Liste. Du sortierst nach Änderungsdatum, Öffnungsreihenfolge oder Name, suchst und hast per Rechtsklick »Im Ordner anzeigen« und »Aus der Liste entfernen«.
  - Vorschaubilder entstehen beim Speichern oder beim nächsten Öffnen.
  - Das Menüband auf der Startseite hat einen Reiter »Extras«.
- **Problemliste und Freigabe:**
  - Alle Fehler und Warnungen des Projekts stehen in einer Liste, ein Klick springt zur Stelle. Die Statusleiste zeigt die Anzahl.
  - Bauteil und Baugruppe haben einen Freigabestatus: In Arbeit, Geprüft oder Freigegeben. Vor dem Freigeben werden Werkstoff, Teilenummer, Rechenfehler, ungültige Körper und die Fertigungsprüfung kontrolliert.
  - Nach einer Änderung heißt es »Nach Freigabe geändert«.
  - Die Fertigungsmappe prüft vorher. Gibt es offene Punkte, bekommt sie eine Seite »Offene Punkte – nicht freigegeben«.
- **Rohr-Konturen über die Eckrundung:**
  - Langlöcher und andere Konturen gehen jetzt über die Eckrundung, z. B. 30 mm breit an QR 40x40x3. Vorher wurde so eine Kontur übersprungen.
  - In 2D wird auf der Rundung senkrecht zur Mantelfläche geschnitten, in 3D eben mit parallelen Wänden bis 0,1 mm vor der Seitenwand.
  - Rundrohr: in 2D radial auf der Abwicklung, in 3D parallel bis zur Winkelkorrektur ±45°. Darüber wird begrenzt und gemeldet.
  - Schnitt 2D/3D am Bauteil gilt für alle Profile, Rundrohr beginnt in 3D.
  - Mindest-Restwand 0,1 mm: Ein Schnitt oder eine Bohrung mit Tiefe gleich Wandstärke lässt 0,1 mm stehen. Das ist am Bauteil abschaltbar, die Vorgabe steht in den Einstellungen.
