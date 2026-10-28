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

## IFC (BIM)

**Export → 3D → IFC (BIM)** schreibt eine IFC4-Datei für Planer und Viewer: Stäbe als Stütze (senkrecht), Träger
(waagrecht) oder Stab (schräg), Platten als IfcPlate, Normteile als IfcMechanicalFastener, alles andere als Bauteil. Jedes
Element hat Werkstoff, Farbe und die Eigenschaften »PBCAD_Bauteil« (Bauteil, Teilenummer, Profil, Länge, Dicke, Gewicht).
Die Geometrie ist ein Dreiecksnetz; das öffnen alle gängigen IFC-Viewer und Planungsprogramme.
