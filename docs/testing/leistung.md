# Leistung und Speicher (SY0/SY1)

Messung mit `tools/messen.mjs` (vorher `npm run build`, headless Chromium mit SwiftShader, 80 Änderungen je Szenario).
Aufruf: `CHROME_PATH=/opt/pw-browsers/chromium node tools/messen.mjs --runden 80 [--grenze 400] [--json datei]`.
`--grenze` setzt die Speichergrenze des Kerns für die Messung herunter (Vorgabe 1024 MB), damit der Neustart schon
bei kleinen Modellen greift.

Szenarien: Grundplatte des Beispielprojekts (Länge ändern), Generator Treppe (Höhe), Generator Geländer (Länge).
„WASM“ ist der Speicher des Geometrie-Kerns (OpenCascade), „RSS“ der Arbeitsspeicher aller Browser-Prozesse.

## Befund

OpenCascade gibt Speicher aus Booleschen Operationen nicht vollständig frei: 2000 × `Quader − Zylinder` mit
`delete()` auf allen Objekten und erzwungener Speicherbereinigung lassen den WASM-Speicher von 100 auf 595 MB wachsen
(auch direkt über `BRepAlgoAPI_Cut`, also nicht in replicad). Der WASM-Speicher schrumpft nie; bei 4 GB stürzt der
Kern ab. Mit jedem Neuaufbau eines Generators wächst er daher stetig.

## 28.10.2026, main d25e458 (vorher)

| Szenario | Median | WASM nach je 10 Änderungen | RSS am Ende |
|---|---|---|---|
| Start | Oberfläche 1,0 s, Kern 1,4 s | 100 MB | 1071 MB |
| Grundplatte | 176 ms | 100 → 127 MB | 1337 MB |
| Treppe | 250 ms | 127 → 163 → 199 → 239 → 287 → 344 → 413 MB | 1613 MB |
| Geländer | 794 ms | 413 → 496 → 595 → 714 → 811 MB | 2051 MB |

## Nach SY1 (Neustart im Leerlauf, Grenze für die Messung 400 MB)

| Szenario | Median | WASM | RSS am Ende | Neustarts |
|---|---|---|---|---|
| Grundplatte | 167 ms | 100 → 127 MB | 1353 MB | 0 |
| Treppe | 238 ms | bis 413, danach 100 MB | 1357 MB | 1 |
| Geländer | 817 ms | bis 413, danach 100 MB | 1467 MB | 2 |

Der erste Bau nach einem Neustart dauert etwa 1 s länger (Kern laden, Modell ohne Zwischenspeicher). Neu gestartet wird
nur, wenn 1,5 s lang nichts läuft; große Modelle bekommen als Grenze mindestens das Doppelte ihres Bedarfs.

## Start (SY3)

Die 3D-Ansicht zeichnet nur, wenn sie sichtbar ist. Beim Start liegt die Startseite darüber; das erste Bild (mit dem
Übersetzen aller Shader) entfällt dort und kommt erst beim Öffnen eines Modells.

| | vorher | nachher |
|---|---|---|
| Oberfläche bereit (DOMContentLoaded, 3 Läufe) | 0,7–1,7 s | 0,4–0,65 s |
| Geometrie-Kern bereit | 1,3–1,8 s | 0,85–1,1 s |

Auf einem Windows-PC mit Grafikkarte sind die Zeiten anders (hier SwiftShader ohne GPU), die Reihenfolge bleibt.

## Spindeltreppe (31.10.2026)

Messung mit `node --stack-size=8000 tools/generator-zeit.mjs spindel` (Vorgaben, ohne Zwischenspeicher, Container ohne GPU).

| | vorher | nachher |
|---|---|---|
| Bau | 29 s (davon 21 s Bohrungen im Wendel-Handlauf, 3 s Ziehen) | unverändert |
| Netz | 15 s (Handlauf 12 s, 750 000 Dreiecke) | Handlauf etwa ein Drittel der Dreiecke |

Befund: OpenCascade braucht je Bohrung Ø 12,1 in den gezogenen Wendel-Handlauf etwa 0,3 s – unabhängig von der Länge
des Abschnitts, von Toleranzen der Zieh-Operation, von einem gemeinsamen Schnitt aller Bohrungen und von der
Reihenfolge (erst bohren, dann innen ausschneiden). Ein Loft durch Kreise statt des Ziehens ist langsamer und
ungenau. Die Bohrungen bleiben daher so; der Generator-Zwischenspeicher hält den Handlauf, solange sich nur andere
Maße ändern. Das Netz gezogener Körper (`meta.rolled`) ist eine Stufe gröber (0,2 mm statt 0,08 mm), weil OpenCascade
diese Freiformflächen entlang der Bahn sehr dicht teilt (27°-Stück: 47 000 statt 400 Dreiecke bei einem geraden Rohr).
