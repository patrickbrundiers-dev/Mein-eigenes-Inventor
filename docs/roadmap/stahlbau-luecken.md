# Stahl- und Metallbau: was PBCAD noch fehlt

Stand 28.10.2026, Basis 0.24.0 (main f7ac429). Auftrag Patrick: „Weiter wichtige Funktionen einbauen, dafür Stand prüfen und recherchieren, was noch fehlt“ – ohne Einzelfreigabe, der Thread entscheidet selbst.

## Vorgehen

Verglichen mit dem Funktionsumfang von HiCAD Stahlbau, MegaCAD Metall/Stahlbau 2025, Advance Steel / Tekla (Anschlusstypen, NC-Ausgabe), Inventor und SolidWorks (Schweißkonstruktionen) sowie Fusion. Jede Lücke ist am Code geprüft (Stand `main` f7ac429).

Nicht doppelt geplant – schon abgeglichen und fertig: MegaCAD M1–M24, Werkzeug-Stufen 13–55, Fusion G1–G4, Folgeplan F1/F2. Der UX-Thread macht U1–U9 sowie E10 (Vordach), E11 (Beschläge), E15 (glTF), V4, V7. Ohne Patrick bleiben: Stangenoptimierung/Kalkulation, Statik/FEM, Freiform/Guss, SolidWorks-/Inventor-Dateiformate.

## Befund

PBCAD ist im Metallbau (Geländer, Tore, Treppen, Rahmen, Blech, Rohrlaser) schon sehr breit. Die deutlichste Lücke liegt im **klassischen Stahlbau**: Es gibt keine Ausgabe für Säge-/Bohranlagen (DSTV-NC), keinen BIM-Austausch (IFC), und von den Standardanschlüssen fehlen die gelenkigen Trägeranschlüsse, der Laschenstoß und der Stützenfuß mit Ankern. Dazu fehlen typische Bauteile wie Steigleiter und Fachwerkträger.

## Lückenliste

Aufwand: S ≈ 1 Tag · M 2–3 Tage · L ≥ 1 Woche.

| Nr | Funktion | Heute | Vorbild | Aufwand | Prio |
|---|---|---|---|---|---|
| ST1 | **DSTV-NC-Export (NC1)** je Stab und je Platte: Kopf (Auftrag, Zeichnung, Position, Profil, Länge, Gehrung Steg/Flansch), Bohrungen (BO) je Fläche o/u/v/h, Außenkontur (AK) für Platten, Signatur (SI) mit Positionsnummer; ein Paket je Baugruppe | STEP je Stab, DXF je Platte | HiCAD, Tekla, Advance Steel, MegaCAD Stahlbau | M | P1 |
| ST2 | **IFC-Export (IFC4)**: Stäbe als IfcBeam/IfcColumn/IfcMember, Platten als IfcPlate, Normteile als IfcMechanicalFastener, mit Profil, Werkstoff, Gewicht, Position | nur STEP/IGES/STL | alle Stahlbau-CAD; Pflicht für BIM-Projekte | M | P1 |
| ST3 | **Stützenfuß** als Generator: Fußplatte mit Bohrbild, Steifen, Ankerschrauben (Gewindestange + Mutter + Scheibe), Schubknagge, Mörtelfuge, Futterbleche | Fußplatte am Profilende (M8) ohne Anker | HiCAD/Advance Steel „Fußplatte“ | S | P1 |
| ST4 | **Gelenkige Trägeranschlüsse**: Fahnenblech, Doppelwinkel, kurze Stirnplatte; Nebenträger an Hauptträger mit Ausklinkung oben/unten | biegesteife Rahmenecke (M15) | Advance Steel „Clip angle / Shear plate“, HiCAD-Anschlüsse | M | P1 |
| ST5 | **Trägerstoß mit Laschen**: Steg- und Flanschlaschen, Schraubbild je Seite, Spalt | Pfettenstoß, Rahmenecke | HiCAD, Tekla | S | P1 |
| ST6 | **Steigleiter** nach DIN EN ISO 14122-4: Holme, Sprossen (Abstand 225–300 mm), Rückenschutz ab 3 m Absturzhöhe mit Bügeln und Längsstäben, Wandhalter, Ausstieg mit Haltegriffen; Prüfung der Grenzwerte | fehlt | MegaCAD Metall, HiCAD Metallbau | M | P1 |
| ST7 | **Fachwerkträger**: Parallel-, Pult-, Satteldachträger; Füllung N, V, K; Gurte, Pfosten, Diagonalen aus Profilen, Knotenbleche | fehlt (nur Rahmen aus Skizze) | HiCAD „Fachwerk“, Tekla Truss | M | P2 |
| ST8 | **Arbeitsbühne/Podest**: Stützen, Randträger, Gitterrost-Felder, Geländer und Aufgang (Treppe oder Leiter) | Balkon (an der Wand) | MegaCAD/HiCAD Bühnen | M | P2 |
| ST9 | **Achsraster** in der Baugruppe: Achsen A, B, C / 1, 2, 3 mit Abständen, Fangpunkte für Stützen, in Zeichnungen als Übersicht | fehlt | alle Stahlbau-CAD | S | P2 |
| ST10 | **Positionsnummern für Einzelteile** über die ganze Baugruppe: Gleichteile (Stäbe und Platten) erkennen, Nummern stabil vergeben, in DSTV/IFC/Signatur und Zuschnittliste gleich | Pos je Zuschnittliste, Gleichteile nur im Gestell | HiCAD Positionierung | M | P2 |
| ST11 ✗ | **Blech-Nesting** (entfällt, Patrick 28.10.2026) (war E6, offen): Platten und Abwicklungen auf Tafeln verteilen, Tafel-DXF, Ausnutzung | DXF je Teil | – | L | P2 |
| ST12 | **Eigene Teilebibliothek** (war E14, offen): Standardteile projektübergreifend ablegen und einfügen | Generator-Vorlagen, iFeatures | Inventor Content Center, MegaCAD Bibliothek | S | P3 |

## Reihenfolge

1. ST1 DSTV-NC, dann ST2 IFC – Austausch mit Werkstatt und Planern.
2. ST3 Stützenfuß, ST5 Trägerstoß, ST4 Trägeranschlüsse – die fehlenden Standardanschlüsse.
3. ST6 Steigleiter, ST7 Fachwerkträger.
4. ST8–ST12 nach Bedarf.

## Entscheidungen

1. **DSTV** wird aus der fertigen Geometrie gelesen (Bohrungen = Zylinderflächen quer zur Stabachse, Flächenzuordnung über die Normale), damit Stäbe aus allen Quellen (Profil, Rahmen, Gestell, Generatoren, Rohrkonturen) gleich behandelt werden. Was sich nicht eindeutig als Bohrung lesen lässt, steht als Hinweis im Protokoll; die Kontur liefert weiter der STEP.
2. **IFC** mit Dreiecksnetz-Geometrie (IfcTriangulatedFaceSet) – das lesen alle gängigen Viewer und Planungsprogramme; parametrische IFC-Profile kommen später, falls gewünscht.
3. Anschlüsse und Bauteile sind **Generatoren** wie bisher (Bauplan → Stäbe, Platten, Normteile), mit Hinweisen, aber **ohne Statik** – Nachweise bleiben beim Tragwerksplaner.
4. Abstimmung: UX bleibt beim Thread „PBCAD intuitiver und moderner machen“; die Prüfung bestehender Generatoren auf Verbindungen/Bohrungen beim Thread „Generatoren auf Verbindungen und Bohrungen prüfen“.

## Stand

- 28.10.2026 Patrick: „Alle außer ST11“ – Blech-Nesting entfällt, alles andere wird gebaut.
- PR 1: ST1 DSTV-NC, ST2 IFC4 (mit IfcOpenShell geprüft), ST3 Stützenfuß, ST4 Trägeranschluss, ST5 Trägerstoß, ST6 Steigleiter, ST7 Fachwerkträger.
