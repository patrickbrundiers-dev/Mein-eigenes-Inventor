# Abhängigkeiten mit wenigen Klicks

## Skizze: erst wählen, dann Bedingung

- Elemente mit der Auswahl anklicken (Umschalt+Klick für weitere). Neben dem Mauszeiger erscheint eine Leiste mit den
  Bedingungen, die zur Auswahl passen – ein Klick setzt sie. Dieselben Knöpfe stehen oben im Eigenschaftenfeld unter
  »Bedingung hinzufügen«.
- Angeboten wird nur, was passt und noch etwas ändert: eine Linie → Horizontal, Vertikal, Fixieren; zwei Linien →
  Parallel, Senkrecht, Kollinear, Gleich; zwei Kreise → Konzentrisch, Gleich, Tangential; Linie + Kreis → Tangential;
  Punkt + Linie → Koinzident, Mittelpunkt; Punkt + Kreis → auf den Umfang oder in die Mitte; zwei Punkte + Linie →
  Symmetrisch. Schon erfüllte oder widersprüchliche Bedingungen fehlen in der Liste.
- Mehrere gleiche Elemente auf einmal: z. B. fünf Linien wählen → »Horizontal« macht alle waagrecht, »Parallel« richtet
  alle an der ersten aus. Das ist ein Rückgängig-Schritt.
- Ist beim Klick auf ein Bedingungswerkzeug im Menüband schon etwas Passendes gewählt, wird die Bedingung sofort gesetzt.
- Die Leiste lässt sich mit der Einstellung »Mini-Werkzeugleiste an der Auswahl« abschalten.

## Baugruppe: Abhängigkeit platzieren

- Der Befehl bleibt nach jeder Abhängigkeit aktiv (wie »Anwenden« in Inventor). Einfach die nächsten zwei Flächen
  anklicken; Esc oder »Fertig« beendet. Abschaltbar unter Einstellungen → Werkzeuge.
- »Lösung Flächen« steht auf »Automatisch«: Zeigen die beiden Flächen schon in dieselbe Richtung, wird fluchtend gesetzt,
  sonst passend. Passend oder Fluchtend lassen sich weiterhin fest wählen.
- Ist die zuerst gewählte Komponente fixiert, bewegt sich die andere – kein Fehler, kein Neuwählen.
- Die zuletzt gesetzte Abhängigkeit steht oben im Bereich: »Umkehren« (passend ↔ fluchtend, Achsrichtung, außen ↔ innen),
  Versatz bzw. Winkel ändern oder »Zurücknehmen«, ohne den Befehl zu verlassen.

## 3D-Modell: ziehen statt tippen

- Ist eine Extrusion gewählt, steht an ihrer Deckfläche ein oranger Pfeil. Ziehen ändert den Abstand mit laufender
  Vorschau; zieht man über null hinaus, kippt die Extrusion auf die andere Seite (Normal ↔ Umgekehrt). Symmetrisch und
  Beidseitig haben eigene Pfeile. Umschalt: 0,1-mm-Schritte. Loslassen ist ein Rückgängig-Schritt.
- Dieselben Pfeile gibt es für die Tiefe einer Sackbohrung und die Länge eines Profils.
- Doppelklick auf eine Fläche wählt das Feature, das sie erzeugt hat (Deckfläche → Extrusion), samt Pfeil.
- Steht im Wert ein Ausdruck oder Parameter, gibt es keinen Pfeil; der Wert wird dann im Eigenschaftenfeld geändert.
- Abschaltbar: Einstellungen → Ansicht → »Ziehgriffe an gewählten Features«.
