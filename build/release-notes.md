**Neu in 0.3.0**

- **Knickrahmen** (3D-Modell → Profile): ein Rechteck- oder Quadratrohr mit 1–3 Segmenten, an jedem Knick V-förmig durch drei Wände ausgeklinkt, die Außenwand wird gebogen.
  - Ansicht **gefaltet** (ein Bauteil, Gehrung als Linie sichtbar, Außenwand mit Innenradius) oder **abgewickelt** (gerades Rohr mit Ausklinkungen für den Rohrlaser, STEP).
  - Biegezugabe aus **Innenradius und K-Faktor**; Abwicklungslänge in der Zuschnittliste (eine Zeile pro Rahmen).
  - **Freistellung** an der Außenwand (rund als Langloch oder rechteckig), Mindestmaß automatisch; **Schweißspalt** auf der Gehrung; optionale **Positionier-Zapfen** mit Spiel.
  - Knickwinkel, Min/Max-Grenzen und alle Maße auch als Formeln aus der Parametertabelle; ungültige Eingaben werden mit Bezug gemeldet.
- Projektdokumentation: Ist-Analyse, Feature-Matrix, Backlog und Spezifikation unter `docs/`.

Hinweis: Innenradius 3 mm und K-Faktor 0,33 sind nur Startwerte – bitte Werte aus der eigenen Biegetabelle eintragen.
