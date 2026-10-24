# Knickrahmen – Spezifikation Stufe 1 (MVP)

Stand: 24.10.2026 · Status: **umgesetzt** (Feature-Typ `knickrahmen`)

## 1. Fachliche Abgrenzung (von Patrick freigegeben)

Ein Knickrahmen ist **ein einziges Rechteck- oder Quadratrohr**. An jedem Knick schneidet
der Rohrlaser einen **V-förmigen Ausschnitt durch drei Wände**. Die vierte Wand
(Außenwand auf der konvexen Seite des Knicks) bleibt stehen und wird gekantet. Danach
wird der Rahmen verschweißt. Das entspricht den Referenzbildern (gefalteter Rahmen,
Rohr mit mehreren Ausklinkungen, Detail des V-Ausschnitts).

Es handelt sich um ein starres Bauteil, nicht um einen klappbaren Rahmen mit Gelenken.
Min/Max-Grenzen je Knick gibt es nur als Eingabeprüfung.

Folgen für die Fertigungsdaten:

- In der Zuschnittliste steht **eine Zeile pro Rahmen**: das gerade Rohr in
  Abwicklungslänge, „Ausgeklinkt: ja“.
- Für den Rohrlaser zählt das **abgewickelte** Rohr mit seinen V-Ausschnitten. Die
  gefaltete Form ist für Baugruppe, Zeichnung und Sichtprüfung gedacht.

## 2. Zwei Ansichten eines Features

| Ansicht | Körper | Verwendung |
|---|---|---|
| Gefaltet (Standard) | Segmente auf Gehrung, zu einem Körper vereinigt | Baugruppe, Zeichnung, Masse |
| Abgewickelt | gerades Rohr mit V-Ausklinkungen | STEP für den Rohrlaser, Zuschnittliste |

Gebaut werden immer beide Körper, auch geprüft werden immer beide. Angezeigt und
exportiert wird der Körper der gewählten Ansicht.

## 3. Koordinaten- und Winkelkonvention

- **Ebene:** XY, XZ oder YZ, optional mit Abstand. Startpunkt `(X, Y)` in der Ebene,
  **Startrichtung** α (0° = Ebenen-x-Achse, gegen den Uhrzeigersinn positiv).
- **Segmentlänge Lᵢ:** Abstand der Knotenpunkte auf der **Mittellinie**.
- **Knickwinkel θⱼ:** Richtungsänderung. 0° = gerade, +θ = nach links (gegen den
  Uhrzeigersinn um die Ebenennormale), −θ = nach rechts. Im Eigenschaftsfenster steht
  zusätzlich der **Innenwinkel 180° − |θ|**. Zulässig sind 0,5° ≤ |θ| ≤ 160°.
- **Außenwand / Faltlinie:** die Außenwand liegt auf der konvexen Seite. Gefaltet wird um
  die Linie auf der **Innenseite der Außenwand** (Spitze des V). Bei gegensinnigen Knicken
  wechselt die Außenwand die Seite.
- **Profillage:** „B in Knickebene“ (Standard) oder „H in Knickebene“. W = Profilbreite in
  der Knickebene, t = Wandstärke.

## 4. Abwicklung

Die Gehrungsebene am Knoten enthält die Faltlinie. Deshalb passen gefaltete und
abgewickelte Form exakt zusammen:

- Abstand der V-Spitzen auf der Rohrachse: `Lᵢ + (W/2 − t)·(tan(|θ_links|/2) + tan(|θ_rechts|/2))`
- V-Flanken: je |θ|/2 gegen die Querschnittsebene, von der Spitze bis durch die Gegenwand.
- **Biegezugabe bⱼ ≥ 0** je Knick, wird **nicht geschätzt**. Sie verlängert das gerade Rohr
  um bⱼ, und das V bekommt an der Spitze eine flache Sohle der Breite bⱼ.
- Abwicklungslänge = `ΣLᵢ + Σ 2·(W/2 − t)·tan(|θⱼ|/2) + Σ bⱼ`

Beispiel RE 60×40×3, 800 + 600 mm, 90°, b = 0: 1400 + 2·27·1 = **1454 mm**.

Grenzen des Modells: In der gefalteten Ansicht ist die Außenkante scharf dargestellt, der
Biegeradius der gekanteten Wand wird nicht modelliert. Die Masse kommt aus dem gefalteten
Körper und weicht vom abgewickelten Rohr um wenige Kubikmillimeter ab (Ecke der Außenwand).

## 5. Datenmodell (Feature im Bauteil)

```json
{
  "id": "f…", "type": "knickrahmen", "name": "Knickrahmen 1", "version": 1,
  "section": "rechteck", "dims": { "B": "60", "H": "40", "t": "3", "r": "6" },
  "plane": "XY", "offset": "0", "start": ["0", "0"], "direction": "0",
  "orientation": "hochkant",
  "segments": [{ "length": "800" }, { "length": "600" }],
  "bends": [{ "angle": "30", "min": "", "max": "", "allowance": "0" }],
  "view": "gefaltet"
}
```

Alle Zahlen sind Ausdrücke mit Parametern. Das Projektformat bleibt `version: 1`: es ist
nur ein neuer Feature-Typ, bestehende Felder ändern ihre Bedeutung nicht. Ältere
WerkCAD-Versionen zeigen für das Feature „Unbekanntes Feature“ und stürzen nicht ab.

## 6. Prüfregeln

Rechnerisch (`src/core/knickrahmen.js`, `planKnickrahmen`):

| Code | Regel |
|---|---|
| `SECTION_KIND` | nur `rechteck` oder `vierkant` |
| `SECTION` | Querschnitt gültig (Wandstärke, Maße > 0) |
| `SEG_COUNT` | 1–3 Segmente, Knicke = Segmente − 1 |
| `SEG_LENGTH` | Lᵢ > 0 |
| `ANGLE_RANGE` | 0,5° ≤ \|θ\| ≤ 160° |
| `ANGLE_LIMIT` | min ≤ θ ≤ max, falls angegeben; min ≤ max |
| `ALLOWANCE` | Biegezugabe ≥ 0 |
| `SEG_SHORT` | Lᵢ größer als (W/2)·tan(\|θ\|/2) + b/2 je Ausklinkung am Segment, sonst würde das V über das Segment hinausreichen |

Im Geometrie-Kern (`buildKnickrahmen`, `checkSolid`): beide Körper je genau ein
Volumenkörper, `BRepCheck_Analyzer` gültig, Volumen > 0. Schlägt etwas fehl, liefert das
Feature **keinen** Körper (kein Teilergebnis), die Meldung nennt Segment oder Knick. Die
eingegebenen Werte bleiben gespeichert.

## 7. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/core/knickrahmen.js` | neu: Vorgabewerte, Mittellinie, Abwicklung, Prüfregeln, Ausdrücke auswerten |
| `src/kernel/build.js` | `case "knickrahmen"`, `buildKnickrahmen`, `checkSolid` |
| `src/ui/ribbon.js` | Knopf „Knickrahmen“ in 3D-Modell → Profile |
| `src/ui/props.js` | Eigenschaften: Ansicht, Querschnitt (nur Rechteck/Quadrat), Lage, Segmente/Knicke; `sectionEditor` mit wählbaren Profilarten |
| `src/ui/app.js`, `tree.js`, `dom.js` | Typname, Symbol |
| `test/core.test.mjs` | Pfad, Abwicklung, alle Prüfregeln |
| `test/kernel.test.mjs` | 4 Geometrie-Tests (siehe 8) |
| `tools/e2e.mjs` | Oberflächenschritt Knickrahmen |

Nicht angefasst: `electron/`, Workflows, Update, Dateiformat-Version, vorhandene Features.

## 8. Tests

Toleranzen: Abwicklungslänge rechnerisch 1·10⁻⁹ mm, am Körper gemessen ±0,01 mm
(Vernetzungstoleranz der Messung; Kanten an ebenen Schnitten liegen exakt). Volumen
gefaltet = A·ΣLᵢ relativ 1·10⁻⁶ (die Gehrung ist symmetrisch, Zu- und Abschnitt heben sich
auf). STEP-Rückimport relativ 1·10⁻³.

| Fall (Modul-Plan) | Test |
|---|---|
| A gerades Rohr | 1 Segment: gültig, Volumen = A·L, Länge 1000 |
| B 30°/45°/90° | Körper gültig in beiden Ansichten, Volumen, Abwicklungslänge, Lage des Endes, gerades Rohr so lang wie die Abwicklung |
| C/D drei Segmente, gegensinnig | Ebene XZ, Profillage H, Biegezugabe 1,5 mm, eine Zuschnittzeile |
| G Wandstärke | t = 20 bei H = 40 → Fehler, kein Körper |
| I Parameteränderung | Formeln aus der Parametertabelle; Neuaufbau mit Cache = ohne Cache |
| J ungültige Eingaben | negative Länge, 175°, über Maximum, Segment zu kurz, 4 Segmente: Fehler mit Bezug, kein Teilergebnis, anderes Feature unberührt |
| K Speichern/Laden | JSON-Roundtrip baut identisch (Meta, Volumen) |
| L STEP | Export und Rückimport beider Ansichten, Volumen gleich |
| N Regression | alle bisherigen Tests grün |
| Oberfläche | Knopf → Winkel im Eigenschaftsfenster auf 90° → Länge 1454 → Ansicht abgewickelt → zweimal Rückgängig |

Spätere Stufen: E runde Freistellungen an der V-Spitze, F Bohrungen/Langlöcher, Laschen
und Biegehilfe-Schlitze in der Außenwand (Referenzbild 2), Biegeradius der Außenwand,
weitere Querschnitte, JSON-Austausch mit der Kalkulation.

## 9. Akzeptanzkriterien Stufe 1

- [x] Knickrahmen mit 1–3 Segmenten entsteht reproduzierbar aus Parametern.
- [x] Alle Parameter sind nachträglich änderbar, auch als Formeln.
- [x] Beide Körper sind laut `BRepCheck_Analyzer` gültig, je ein Körper, Volumen > 0.
- [x] Abwicklung und Volumen stimmen analytisch.
- [x] Ungültige Eingaben werden mit Bezug gemeldet; kein Teilergebnis.
- [x] Speichern/Wiederöffnen ergibt dieselbe Konstruktion.
- [x] Zuschnittliste: eine Zeile, Abwicklungslänge, ausgeklinkt; STEP enthält den gewählten Zustand.
- [x] Alle vorhandenen Tests bleiben grün.
- [ ] Fachliche Prüfung an einem realen Teil (Biegezugabe, Lage der Ausklinkung) durch Patrick.
