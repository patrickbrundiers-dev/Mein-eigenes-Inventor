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

## Geometrie-Kern schneller (01.11.2026)

Messung mit `node --stack-size=8000 tools/leistung-generatoren.mjs --cache` über alle Prüfmodelle der Generator-Prüfung
(gemeinsame Liste `tools/generator-faelle.mjs`), Container ohne GPU, ein Kern. „Bau“ = erster Aufbau ohne
Zwischenspeicher (Öffnen, Kern-Neustart), „Netz+Werte“ = Anzeigenetz und Körperwerte wie im Kern-Worker,
„Neuaufbau“ = gleicher Aufbau noch einmal mit Zwischenspeicher samt Netz (Obergrenze dessen, was eine Änderung sparen kann).

Befunde und Abhilfe:

1. **Jede Boolesche Operation lief doppelt.** replicad baut `new BRepAlgoAPI_Cut(a, b)` – dieser Konstruktor rechnet
   bereits – und ruft danach `Build()` noch einmal auf. Gilt für `cut`, `fuse` und `intersect`. `src/kernel/bool.js`
   ersetzt die drei Methoden: leerer Builder, einmal `Build()`, Builder sofort löschen (vorher erst bei einer späteren
   Speicherbereinigung freigegeben).
2. **Bohrungen einzeln geschnitten.** Ein Stab mit 21 Bohrungen brauchte 21 Schnitte, jeder teurer als der vorige.
   `cutMany` schneidet alle Werkzeuge eines Stabs in einem Durchgang (Rohr mit 21 Bohrungen: 4,8 s → 1,1 s).
   Ergebnis geometrisch gleich (Differenzkörper in beide Richtungen 0 mm³); das gemessene Volumen kann in der letzten
   Stelle abweichen (Eckpfosten Geländer: 280 398,24 → 280 396,92 mm³, Referenzwerte angepasst).
3. **Stablänge über ein Feinnetz.** Zuschnittlänge und Stabachse wurden aus einem 0,01-mm-Netz bestimmt, je Stab
   zweimal. Jetzt exakt aus den Kanten (Geraden: Endpunkte, Kurven: Extremwert eingegrenzt).
4. **Flächenschwerpunkt adaptiv auf 1e-7.** Für jede ebene und zylindrische Fläche des Anzeigenetzes; jetzt
   Gauß-Integration fester Ordnung (6× schneller, Abweichung ~1e-4 mm).
5. **Nach jeder Änderung alle Körper neu vernetzt.** Unveränderte Körper aus dem Generator-Zwischenspeicher und
   Schraubensätze an gleicher Stelle behalten jetzt Netz und Körperwerte.
6. **Desktop-Start:** Programmcode (app.js, worker.js) wird von Electron zwischengespeichert (`codeCache` am
   `app:`-Schema). Das WASM des Kerns wird von Chromium bei eigenen Schemata nicht zwischengespeichert (geprüft:
   Ordner `Code Cache/wasm` bleibt leer).

| Modell | Bau vorher | Bau nachher | Netz+Werte vorher | nachher | Neuaufbau vorher | nachher |
|---|---|---|---|---|---|---|
| spindel-fussplatte | 28,8 s | 14,4 s | 9,9 s | 8,8 s | 8,7 s | 159 ms |
| spindel | 27,2 s | 11,3 s | 9,6 s | 6,9 s | 7,6 s | 25 ms |
| gelaender-stoss | 25,9 s | 8,1 s | 7,1 s | 2,7 s | 3,8 s | 14 ms |
| gelaender-stoss-vierkant | 25,1 s | 6,0 s | 3,1 s | 2,3 s | 2,9 s | 18 ms |
| treppe-gerade-boegen-staketen | 20,3 s | 6,9 s | 3,7 s | 3,5 s | 4,1 s | 244 ms |
| treppe-gerade-staketen | 18,1 s | 5,5 s | 3,4 s | 2,9 s | 3,9 s | 193 ms |
| treppe-U-boegen | 15,7 s | 6,7 s | 4,5 s | 3,3 s | 5,5 s | 338 ms |
| arbeitsbuehne | 12,9 s | 4,8 s | 4,8 s | 4,0 s | 4,9 s | 309 ms |
| rampe | 14,6 s | 7,2 s | 2,6 s | 1,5 s | 2,4 s | 12 ms |
| arbeitsbuehne-leiter | 12,7 s | 3,4 s | 3,4 s | 3,2 s | 3,6 s | 24 ms |
| treppe-U-podestwange | 10,7 s | 3,8 s | 4,2 s | 3,8 s | 4,1 s | 288 ms |
| gelaender-boegen | 12,1 s | 4,6 s | 1,7 s | 1,3 s | 2,0 s | 20 ms |
| treppe-gerade | 6,1 s | 1,9 s | 3,2 s | 2,1 s | 2,6 s | 212 ms |
| gelaender-kreuz | 5,2 s | 2,1 s | 1,1 s | 1,0 s | 1,1 s | 3 ms |
| tor-stich | 8,7 s | 4,3 s | 1,2 s | 988 ms | 1,2 s | 4 ms |
| zaun | 1,1 s | 800 ms | 1,0 s | 1,0 s | 913 ms | 2 ms |
| gestell | 817 ms | 396 ms | 209 ms | 156 ms | 225 ms | 2 ms |
| **alle 88** | **431,7 s** | **176,3 s** | **148,7 s** | **115,3 s** | **141,0 s** | **4,2 s** |


Echte Maßänderung (zweiter Aufbau mit geänderten Parametern, samt Netz):

| | vorher | nachher |
|---|---|---|
| Geländer 3000 + 1500 mit Staketen, zweiter Lauf 1500 → 1600 | 5,7 s | 1,9 s |
| Treppe gerade, Geländer einseitig → beidseitig | 2,8 s | 0,3 s |

Oberflächenmessung `tools/messen.mjs --runden 15` (Vorgabemodelle, Browser): Geländer ändern Median 546 → 222 ms,
WASM-Speicher nach 15 Änderungen 163 → 127 MB; Treppe 329 → 284 ms; Grundplatte unverändert (~260 ms, Entprellung).

Noch offen (nicht umgesetzt): gleiche Körper (Stufen, Staketen, Schrauben) nur einmal vernetzen und in der Ansicht
als Instanzen zeigen – das Netz ist jetzt der größere Teil beim ersten Aufbau.
