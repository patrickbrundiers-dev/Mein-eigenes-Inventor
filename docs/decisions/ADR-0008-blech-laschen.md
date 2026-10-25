# ADR-0008: Blech, zweite Ausbaustufe – Laschen, Umschlag, Stirnlasche, Durchzug, Konturlasche

Status: angenommen · Datum: 25.10.2026 · ergänzt [ADR-0005](ADR-0005-blech-kantteile.md) · Plan: Werkzeuge Stufe 41 („Alles einbauen“)

## Kontext

ADR-0005 hat Blech auf das Kantteil beschränkt: ein Querschnitt aus geraden Schenkeln, über die Kantlänge extrudiert, Abwicklung analytisch über die Biegezugabe. Laschen an beliebigen Kanten, Eckentlastung und Durchbrüche in der Abwicklung blieben ausgeschlossen. Die Werkzeugrecherche (Inventor, SolidWorks, MegaCAD Metall) hat Lasche, Konturlasche, Umschlag, Eckfreischnitt, Durchzug und Abwicklung als fehlende Blechwerkzeuge genannt; Patrick hat alle Stufen freigegeben.

Ein allgemeines Blechmodell (beliebige Grundplatte, Laschen an jeder Kante, Abwicklung durch Aufbiegen der B-Rep-Flächen) bleibt mit OpenCascade fragil und groß. Für Metallbau-Teile (Abdeckungen, Kassetten, Winkel mit Laschen, Wangen) reicht ein Modell, in dem jede Biegung entweder längs (Achse in Kantlänge) oder quer an den Stirnseiten liegt.

## Entscheidung

1. Das **Kantteil bleibt die Grundlage**. Neue Features hängen mit `base` an einem Kantteil und stehen im Baum direkt dahinter: `lasche`, `umschlag`, `durchzug`. Zwischen Kantteil und Blech-Feature dürfen nur Skizzen und Arbeitselemente stehen; ein anderes Feature dazwischen ist ein Fehler mit klarer Meldung (sonst würde das Neuaufbauen dessen Änderung verwerfen). Der Kern baut den Blechkörper bei jedem Blech-Feature aus dem gesamten Plan neu.
2. **Lasche** am Anfang oder Ende über die ganze Länge wird ein zusätzlicher Schenkel. Die Außenkante der neuen Biegung liegt an der bisherigen Blechkante; der erste Schenkel bleibt an seiner Lage (Plan mit Anker). Mit Breite < Länge entsteht eine **Teil-Lasche**: Biegebereich nur über die Breite, daneben rechteckiger **Biegefreischnitt** (Breite Standard t, Tiefe Standard t/2 hinter der Biegung).
3. **Umschlag** ist eine 180°-Biegung (Länge ab Außenkante der Falz). Geschlossen rechnet mit Spalt 0,02 · t, weil sich berührende Innenflächen den Körper ungültig machen; offen mit dem angegebenen Spalt (Innenradius = Spalt/2).
4. **Stirnlasche** biegt an y = 0 oder y = Länge über das gerade Stück eines Schenkels. Der **Eckfreischnitt** nimmt die Biegezonen der benachbarten Längsbiegungen bis hinter die Stirnbiegung heraus; damit lassen sich Kassetten kanten. Runde Freischnitte und Eckausklinkungen mit Überlappung sind nicht enthalten.
5. **Durchzug** sitzt auf dem geraden Stück eines Schenkels (Lage entlang, Lage längs, mehrere Lagen möglich). Das Vorloch in der Abwicklung ist eine Näherung über die Volumenkonstanz mit auf 0,7 · t gezogener Wand und kann überschrieben werden; zu hohe Kragen werden abgelehnt.
6. **Konturlasche** ist ein Kantteil mit Querschnitt aus einer offenen Skizzenlinie: Schenkel von Ecke zu Ecke, Winkel aus dem Richtungswechsel, die Linie ist eine Blechfläche (Material links, rechts oder mittig), Kantlänge in Normalenrichtung, umgekehrt oder symmetrisch. Nur Linien; die Ecken bekommen den Innenradius.
7. Die **Abwicklung** rechnet der Kern einmal (`src/core/blechplus.js`, `planSheet`) und gibt sie als Modell mit (`meta.sheet.flatModel`: Umriss, Löcher, Vorlöcher, Biegelinien mit Lage, Winkel, Richtung, Radius, K). 3D-Ansicht „abgewickelt“, Zeichnungsansicht mit Biegetabelle und DXF benutzen dasselbe Modell; die Oberfläche rechnet den Plan nicht mehr selbst nach. Der Umriss entsteht aus Rechtecken (Grundfläche, angesetzte Laschen, abgezogene Biegebereiche, Freischnitte) und wird zu geschlossenen Polygonen verkettet.
8. Die Biegezugabe bleibt `(ri + K · t) · θ` mit K aus K-Faktor, DIN 6935 oder Biegetabelle (ADR-0005, Biegetabellen); der Rücksprung je Biegung (`bendCut`) ist `R · tan(θ/2)` mit R = ri + t (außen), ri (innen) oder ri + t/2 (Mitte), beim Umschlag R selbst.

## Folgen

- Abdeckungen mit Teil-Laschen, Kassetten mit vier gekanteten Seiten, Bleche mit Falz und Kragen für Gewindeformer sind konstruierbar und als DXF laserbar.
- Weiterhin nicht enthalten: Laschen an schrägen oder gebogenen Kanten, Laschen an Laschen, kegelige oder verwundene Teile, Faltkörper aus beliebigem Volumen, runde Freischnitte, Prägungen/Sicken (Prägen bleibt ein normales Feature), Gewindedurchzug nach Norm-Tabelle.
- Ein Blech-Feature hinter einer Bohrung oder Fase am Kantteil ist ein Fehler; Bohrungen am gekanteten Teil kommen hinter die Blech-Features (sie fehlen dann in der Abwicklung – Durchbrüche für den Laser als Durchzug oder in der DXF ergänzen).
- Tests: Unit-Test für Rücksprung, Umriss, Konturlasche und Vorloch, Kern-Test für alle Features (gültiger Körper, Maße), Oberflächentest mit DXF-Export.
