# ADR-0005: Blech, erste Ausbaustufe – Kantteile mit Abwicklung

Status: angenommen · Datum: 25.10.2026 · ersetzt [ADR-0002](ADR-0002-blech.md) · Plan: MegaCAD-Metall-Abgleich M17

## Kontext

ADR-0002 hat eine allgemeine Blechfunktion ausgeschlossen, weil OpenCascade keine Blech-Abwicklung mitbringt und ein eigener, allgemeiner Abwicklungsalgorithmus fragil wäre. Die Wiedervorlage war: Wenn gekantete Bauteile regelmäßig gebraucht werden, sollen einfache Kantteile kommen – ein Querschnitt, nur gerade Kanten, extrudiert, Abwicklung über dieselbe Biegezugabe-Formel wie beim Knickrahmen.

Mit dem MegaCAD-Metall-Abgleich hat Patrick am 25.10.2026 alle Stufen freigegeben, darunter Blechteile (Kassetten, Abdeckungen, Wangen aus Blech, DXF-Abwicklung für den Laser).

## Entscheidung

1. Neues Feature **Kantteil** (`type: "kantteil"`): Querschnitt aus Schenkellängen und Biegewinkeln, Blechdicke, Innenradius, K-Faktor; Maßbezug außen, innen oder Mitte Blech; über eine Länge extrudiert. Ansicht gefaltet oder abgewickelt.
2. Die Abwicklung ist **analytisch**: gerade Stücke der Mittellinie plus Biegezugabe `(ri + K · t) · θ` je Biegung. Es gibt keinen allgemeinen Abwicklungsalgorithmus. Die Formel liegt einmal in `src/core/blech.js` (`bendAllowance`) und wird vom Knickrahmen mitbenutzt.
3. Abwicklung als **DXF**: Kontur, Biegelinien auf eigenem Layer (gestrichelt) mit Winkel, Richtung (auf/ab) und Innenradius.
4. Weiterhin **nicht** enthalten: Laschen an beliebigen Kanten, Eckausklinkungen und Eckentlastung, Durchbrüche in der Abwicklung, kegelige oder verwundene Teile, Faltkörper aus Quader. Diese Fälle bleiben Platte + DXF oder kommen als eigene, wieder analytische Stufe.
5. Biege- und Materialdaten bleiben zentral: Querschnitte und Werkstoffe in `src/core/sections.js`, die Biegezugabe in `src/core/blech.js`, die Knickrahmen-Parameter in `src/core/knickrahmen.js`.

## Folgen

- Kassetten, Abdeckungen, Winkel, U- und Z-Profile aus Blech lassen sich konstruieren und als Abwicklung lasern.
- Die Genauigkeit hängt am K-Faktor; er muss zur Abkantpresse passen (Standard 0,33 wie beim Knickrahmen).
- Tests prüfen die Abwicklung gegen den Ausgleichswert nach DIN 6935 für 90° und das Volumen des gefalteten Körpers.
