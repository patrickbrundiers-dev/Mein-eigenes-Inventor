# Stahlbau: Anschlüsse, Leiter, Fachwerk, IFC

Alle Generatoren liegen im Reiter **Metallbau → Stahlbau**. Sie bauen Stäbe, Bleche und Normteile wie die übrigen
Generatoren (Zuschnittliste, Stückliste, STEP, DSTV-NC). Hinweise am Feld zeigen Grenzwerte; **eine Statik ersetzen sie
nicht** – Profile, Bleche, Schrauben und Anker weist der Tragwerksplaner nach.

| Generator | Inhalt | Prüfungen |
|---|---|---|
| Stützenfuß | Fußplatte mit 4/6/8 Ankerlöchern (Ø d + 6), Steifen, Gewindestangen als Anker mit Unterlegplatte und Mutter, Justiermuttern in der Mörtelfuge, Schubknagge | Randabstand ≥ 1,2 · d0, Anker nicht unter der Stütze, Unterlegplatte am Rand/an der Steife, Mörtelfuge 20 … 50 mm |
| Trägerstoß | Flanschlaschen außen (optional innen), Steglaschen beidseits, HV-Schrauben, Bohrungen in Laschen und Trägern | Schrauben am Steg, Lochabstand im Steg ≥ 2,4 · d0 |
| Trägeranschluss | Fahnenblech, Doppelwinkel oder kurze Stirnplatte; an Hauptträger (oben bündig, Ausklinkung oben und bei Bedarf unten) oder Stützenflansch | Schrauben passen in die Steghöhe, Winkelschenkel, Plattenbreite |
| Steigleiter | Holme, Sprossen durch die Holme, Wandhalter, Haltegriffe über dem Austritt, Rückenschutz mit Bügeln und Längsstäben | DIN EN ISO 14122-4: Weite 400 … 600, Sprossen 225 … 300, Wandabstand ≥ 200, Rückenschutz ab 3 m (Beginn 2,2 … 3 m, Tiefe 650 … 800, ≥ 5 Längsstäbe ≤ 300 mm, Bügel ≤ 1500 mm), Leiterzug ≤ 10 m |
| Fachwerkträger | Parallel-, Pult- oder Satteldachträger, Füllung N/V/W, Hohlprofile, Füllstäbe an den Gurtflächen gesägt, Spaltknoten, Auflagerplatten | Füllstäbe nicht breiter als die Gurte, Diagonalen 30 … 60°, Knotenversatz |
| Arbeitsbühne | Stützen mit Fuß- und Kopfplatte, Randträger mit Gehrung, Querträger an den Feldgrenzen, Gitterrost- oder Riffelblechfelder, Bordblech außen, Geländer rundum (Knieleiste oder Staketen) mit Aufgang als Treppe, Steigleiter oder Durchgang | Geländer nach DIN EN ISO 14122-3 (1100 mm), Treppe nach DIN 18065, Leiter nach ISO 14122-4; Hinweise zu Aussteifung, Spannweite der Querträger, Schranke am Durchstieg |

## IFC (BIM)

**Export → 3D → IFC (BIM)** schreibt eine IFC4-Datei für Planer und Viewer: Stäbe als Stütze (senkrecht), Träger
(waagrecht) oder Stab (schräg), Platten als IfcPlate, Normteile als IfcMechanicalFastener, alles andere als Bauteil. Jedes
Element hat Werkstoff, Farbe und die Eigenschaften »PBCAD_Bauteil« (Bauteil, Teilenummer, Profil, Länge, Dicke, Gewicht).
Die Geometrie ist ein Dreiecksnetz; das öffnen alle gängigen IFC-Viewer und Planungsprogramme.

## Achsraster

**Baugruppe → Metallbau → Stahlbau → Achsraster** legt ein Stützenraster an: Abstände in X (Achsen 1, 2, 3 …) und in Y
(Achsen A, B, C …) als Liste, Wiederholungen als »3*6000«, Beschriftung frei wählbar (Zahlen oder Buchstaben, nach Z folgt
AA). Das Raster steht im Baum, zeigt sich im 3D-Fenster strichpunktiert mit Achskreisen und erscheint in den Zeichnungen
der Baugruppe: im Grundriss alle Achsen, in den Ansichten die Achsen quer zur Blickrichtung bis zur eingestellten Höhe.
In den Eigenschaften einer Komponente setzt **Auf Achsschnittpunkt** sie auf einen Rasterpunkt (z. B. »B/3«); die Höhe
bleibt.
