# ADR-0002: Keine allgemeine Blechfunktion, nur Knickrahmen-Biegung

Status: angenommen · Datum: 24.10.2026 · Plan P1-D

## Kontext

Der Entwicklungsplan erlaubt Blechparameter und Abwicklung nur, „wenn der Kernel dies verlässlich unterstützt“, und verbietet eigene, fragile Geometriealgorithmen. OpenCascade (über replicad) hat keine Blech-Abwicklung; eine allgemeine Abwicklung (beliebige Kanten, Laschen, Ecken) müsste selbst geschrieben werden.

## Entscheidung

1. Keine allgemeine Blechfunktion (Lasche, Kante, Abwicklung beliebiger Teile).
2. Die einzige Biegung bleibt die Außenwand beim Knickrahmen. Sie ist analytisch (Biegezugabe = (Innenradius + K·t)·θ) und gegen Kennwerte getestet.
3. Biege- und Materialdaten bleiben zentral: Querschnitte und Werkstoffe in `src/core/sections.js`, Biegeparameter in `src/core/knickrahmen.js`.
4. Flache Laserteile werden weiter als Platte konstruiert und als DXF exportiert.

## Wiedervorlage

Wenn Patrick gekantete Bauteile regelmäßig braucht und eine Biegetabelle liefert: einfache Kantteile (ein Querschnitt, nur gerade Kanten, extrudiert) mit Abwicklung über dieselbe Biegezugabe-Formel – das ist ohne allgemeinen Abwicklungsalgorithmus machbar.
