# ADR-0006: Fotorealistische Darstellung als eigener Anzeigemodus

Status: angenommen · Datum: 25.10.2026 · hebt in [ADR-0004](ADR-0004-p2-zurueckgestellt.md) die Zeile „Fotorealistisches Rendering“ auf · Plan: MegaCAD-Metall-Abgleich M22

## Kontext

ADR-0004 hat fotorealistisches Rendering zurückgestellt: geringer Nutzen, und es bremst die CAD-Ansicht. Mit dem MegaCAD-Metall-Abgleich hat Patrick am 25.10.2026 alle Stufen freigegeben, darunter Bilder für Angebote und Kunden (Tor, Geländer, Balkon „wie in echt“).

Ein Raytracer (Pfadverfolgung) wäre ein eigenes Projekt mit langen Rechenzeiten. three.js bringt physikalisch basierte Materialien (PBR), Umgebungsbilder und Schatten bereits mit; das reicht für Angebotsbilder.

## Entscheidung

- Neuer Darstellungsmodus **Fotorealistisch** neben Kanten/Schattiert/Draht/Transparent. Nur in diesem Modus laufen Umgebungsbild (Raum-Umgebung, vorgefiltert), Filmkurve (ACES), weiche Schatten einer Sonne und eine unsichtbare Bodenfläche, die nur den Schatten zeigt. Die normale CAD-Ansicht bleibt unverändert schnell.
- Oberflächen je Körper aus dem Werkstoff des Bauteils (Baustahl, Edelstahl, Aluminium, Messing, Kunststoff) und aus der Bedeutung im Generator (Glas, Holzbelag, Gitterrost, Riffelblech, Normteile verzinkt) – reine Zuordnung in `src/core/rendering.js`.
- Kanten sind im Fotomodus aus, das Raster auch. Auswahl und Messen funktionieren weiter.
- Export → „Rendern“ schaltet vorübergehend in den Fotomodus und speichert ein PNG in bis zu vierfacher Fenstergröße (höchstens 8192 px Kantenlänge).

## Nicht enthalten

Raytracing/Pfadverfolgung, Texturen (Holzmaserung, Pulverbeschichtungsstruktur), frei setzbare Lichter und Kameras, Hintergrundbilder. Wiedervorlage, wenn Bilder für Kunden damit nicht reichen.

## Folgen

- Mehr GPU-Last nur im Fotomodus (Schattenkarte 2048², Umgebungsbild einmalig erzeugt).
- Neue Werkstoffe brauchen einen Eintrag in `rendering.js`; sonst gelten die Werte von Baustahl.
