# Direktbearbeitung am Modell

Wie Inventor »Direkt«: am fertigen Körper Flächen ändern, ohne Skizzen oder frühere Features anzufassen.
Jede Änderung ist ein Feature »Direkt« im Verlauf und lässt sich später ändern, unterdrücken oder löschen.

## Starten

- Fläche(n) im 3D-Fenster anklicken (Strg/Umschalt für mehrere), in der Mini-Leiste **Direkt bearbeiten** oder **Fläche löschen**.
- Oder Menüband *3D-Modell › Ändern › Direkt* und danach die Flächen anklicken.

Am Modell erscheint die Leiste mit **Verschieben · Größe · Drehen · Löschen**, **Flächen**, Maßeingabe und
✓ (fertig) / ✗ (verwerfen). An der Fläche steht die Triade.

## Vorgänge

| Vorgang | Was passiert | Eingabe |
|---|---|---|
| Verschieben | Ebene Fläche wandert; Nachbarflächen wachsen oder schrumpfen mit (auch schräge, z. B. Fasen) | Abstand, Richtung Normale/X/Y/Z; Pfeil der Triade ziehen (Umschalt = 0,1 mm) |
| Messen ab | Bezugsfläche, -kante oder -ecke anklicken, dann den **Abstand ab Bezug** eintippen | Wert ist der Endabstand, vorbelegt mit dem jetzigen |
| Größe | Bohrung oder Bolzen auf neuen **Durchmesser** oder **Radius**; ebene Fläche oder Zylinder um einen **Versatz** | Wert eintippen; bei Versatz auch Pfeil ziehen |
| Drehen | Ebene Fläche kippt um Achse U oder V (durch die Flächenmitte) oder um eine angeklickte Kante | Winkel 0…80°; Ring der Triade anklicken wählt die Achse |
| Löschen | Flächen fallen weg, die Lücke wird geschlossen: Bohrung/Tasche wird gefüllt, Zapfen entfernt, Rundung/Fase wird wieder zur scharfen Kante | – |

## Grenzen

- Verschieben und Drehen nur für ebene Flächen. Mit schrägen Nachbarflächen nur Flächen mit geraden Kanten ohne Bohrungen.
- Größe nur für ganze Zylinder (Bohrung, Bolzen), nicht für Rundungen – die lassen sich löschen und neu runden.
- Eine Fläche, die den Körper trägt (z. B. die ganze Seite eines Quaders), lässt sich nicht löschen.
- Skalieren aus Inventors Leiste gibt es nicht; dafür *Körper verschieben* bzw. Parameter nutzen.
