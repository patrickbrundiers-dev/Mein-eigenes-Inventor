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
| Gefaltet (Standard) | ein Körper aus Segmenten auf Gehrung, Gehrung als Trennlinie sichtbar, Außenwand mit Innenradius gebogen | Baugruppe, Zeichnung, Masse |
| Abgewickelt | gerades Rohr mit V-Ausklinkungen | STEP für den Rohrlaser, Zuschnittliste |

Gebaut werden immer beide Körper, auch geprüft werden immer beide. Die Segmente werden
an der Gehrungsebene getrennt gebaut (jedes mit der halben Biegung) und ohne
Flächen-Vereinigung verschmolzen, damit die Gehrung wie in der Referenz als Linie sichtbar
bleibt (Wunsch Patrick, 24.10.2026). Angezeigt und
exportiert wird der Körper der gewählten Ansicht.

## 3. Koordinaten- und Winkelkonvention

- **Ebene:** XY, XZ oder YZ, optional mit Abstand. Startpunkt `(X, Y)` in der Ebene,
  **Startrichtung** α (0° = Ebenen-x-Achse, gegen den Uhrzeigersinn positiv).
- **Segmentlänge Lᵢ:** Abstand der Knotenpunkte auf der **Mittellinie**.
- **Knickwinkel θⱼ:** Richtungsänderung. 0° = gerade, +θ = nach links (gegen den
  Uhrzeigersinn um die Ebenennormale), −θ = nach rechts. Im Eigenschaftsfenster steht
  zusätzlich der **Innenwinkel 180° − |θ|**. Zulässig sind 0,5° ≤ |θ| ≤ 160°.
- **Außenwand / Biegung:** die Außenwand liegt auf der konvexen Seite und wird mit dem
  **Innenradius rᵢ** gebogen. Der Biegemittelpunkt liegt im Abstand `d = W/2 − t − rᵢ` von
  der Mittellinie (zur Außenwand hin). Bei gegensinnigen Knicken wechselt die Außenwand die
  Seite.
- **Profillage:** „B in Knickebene“ (Standard) oder „H in Knickebene“. W = Profilbreite in
  der Knickebene, t = Wandstärke.

## 4. Abwicklung mit Biegeradius und K-Faktor

Eingaben je Knickrahmen: **Innenradius rᵢ ≥ 0** und **K-Faktor k (0…1)**. Vorgabe beim
Erstellen: rᵢ = 3 mm, k = 0,33. Das sind nur Startwerte; sie sind gegen die Biegetabelle
der Kantbank zu ersetzen.

- Biegezugabe je Knick (Länge der neutralen Faser): `bⱼ = (rᵢ + k·t)·|θⱼ|` (θ im Bogenmaß)
- Gerades Rohr zwischen den Biegezonen (an der Rohrachse gemessen): `Lᵢ + d·(tan(|θ_links|/2) + tan(|θ_rechts|/2))`
- Abwicklungslänge = `ΣLᵢ + Σ 2·d·tan(|θⱼ|/2) + Σ bⱼ` mit `d = W/2 − t − rᵢ`
- V-Ausklinkung im abgewickelten Rohr: die Flanken (je |θ|/2 gegen die Querschnittsebene) laufen
  **gerade bis zur Außenwand-Innenseite** (Vogel-Ausklinkwerkzeug, Rohrlaser-Praxis). Treffen sich
  die Flanken schon vorher, endet das V dort in einer Spitze.
- Gefaltet liegen die Seitenwände auf der Gehrung aneinander; die Außenwand ist zwischen den
  Tangentenpunkten mit rᵢ gebogen. Ist rᵢ ≥ W − 2t, wird das mit einer Meldung abgelehnt.

Beispiel RE 60×40×3, 800 + 600 mm, 90°, rᵢ = 3, k = 0,33:
d = 24, b = (3 + 0,99)·π/2 = 6,267 mm, Abwicklung = 1400 + 48 + 6,267 = **1454,27 mm**.
Mit rᵢ = 0 und k = 0 ergibt sich der scharfe Knick: 1400 + 2·27 = 1454 mm.

Gefaltete Ansicht: zwischen den Tangentenpunkten ist die Außenwand ein Kreisring-Ausschnitt
(Innenradius rᵢ, Außenradius rᵢ + t, Rotation des Wandquerschnitts um den Biegemittelpunkt).
Kontrolle: Bei k = 0,5 ist das Volumen gefaltet = abgewickelt (Guldin), im Test auf 1·10⁻⁶
geprüft.

## 4a. Freistellung, Schweißspalt, Zapfen (nach Recherche, freigegeben 24.10.2026)

Quellen und Begründung: `/mnt/project-files/knickrahmen/recherche-ausklinken-biegen.md`.

- **Freistellung (Pflicht)** an der Außenwand-Innenseite, symmetrisch zur Biegezone, nur in den
  Seitenwänden – die Außenwand bleibt ganz. Sie hält die Seitenwände über die ganze Biegezone frei
  (sonst würden sie beim Biegen eingedrückt) und entfernt alles, was gefaltet in die gebogene Wand
  ragen würde. Mindestmaße je Knick (Rand m = 0,5 mm):
  - halbe Breite `w = max(b/2, rᵢ·tan(θ/2) − b/2) + m`
  - Tiefe `h = max(rᵢ·(1 − cos(θ/2)) + m, [Flanken kreuzen:] rᵢ − b/(2·tan(θ/2)) + m, t/2)`
  - *rund*: Langloch mit Radius ≥ h, Kreismitten bei ±w; *rechteckig*: Breite ≥ 2w, Tiefe ≥ h.
  Leere Felder = Mindestmaß; kleinere Eingaben werden abgelehnt. Das Mindestmaß steht im
  Eigenschaftsfenster.
- **Schweißspalt g** (Vorgabe 0, typisch 0,5–1 mm): hinter jeder Flanke ein Streifen g/2, gefaltet
  ergibt das den Spalt g auf der Gehrung. g < t.
- **Zapfen**, Durchmesser Dz, **Spiel** c (Vorgabe 0,2 mm): Nase auf der Gehrungslinie beider
  Seitenwände am Segment vor dem Knick, mittig zwischen Eckradius und Freistellung; Loch im Segment
  danach mit Radius Dz/2 + c. Prüfung: passt in die Seitenwand, stößt abgewickelt nicht an die
  Gegenflanke.
- Gefaltet und abgewickelt verwenden dieselben Umrisse (Abwicklungs-Koordinaten im Rahmen des
  jeweiligen Segments ab dem Tangentenpunkt). Kontrolle: bei k = 0,5 Volumen gleich – das schlägt
  auch fehl, sobald sich gefaltet etwas überlappt.

## 5. Datenmodell (Feature im Bauteil)

```json
{
  "id": "f…", "type": "knickrahmen", "name": "Knickrahmen 1", "version": 1,
  "section": "rechteck", "dims": { "B": "60", "H": "40", "t": "3", "r": "6" },
  "plane": "XY", "offset": "0", "start": ["0", "0"], "direction": "0",
  "orientation": "hochkant",
  "bendRadius": "3", "kFactor": "0.33",
  "relief": "rund", "reliefDia": "", "reliefWidth": "", "reliefHeight": "",
  "weldGap": "0", "tabs": "aus", "tabDia": "8", "tabClearance": "0.2",
  "segments": [{ "length": "800" }, { "length": "600" }],
  "bends": [{ "angle": "30", "min": "", "max": "" }],
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
| `BEND_RADIUS` | 0 ≤ rᵢ < W − 2t |
| `K_FACTOR` | 0 ≤ k ≤ 1 |
| `RELIEF` | Maße > 0 und ≥ Mindestmaß |
| `WELD_GAP` | 0 ≤ g < t |
| `TAB` | Zapfen passt in die Seitenwand und stößt in der Abwicklung nicht an die Gegenflanke |
| `SEG_SHORT` | Lᵢ größer als Σ tan(\|θ\|/2)·max(W/2, −d) der Ausklinkungen am Segment, sonst würde das V über das Segment hinausreichen |

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
gefaltet = abgewickelt relativ 1·10⁻⁶ bei k = 0,5; bei rᵢ = 0, k = 0 zusätzlich = A·ΣLᵢ. STEP-Rückimport relativ 1·10⁻³.

| Fall (Modul-Plan) | Test |
|---|---|
| A gerades Rohr | 1 Segment: gültig, Volumen = A·L, Länge 1000 |
| B 30°/45°/90° | Körper gültig in beiden Ansichten, Volumen, Abwicklungslänge, Lage des Endes, gerades Rohr so lang wie die Abwicklung |
| C/D drei Segmente, gegensinnig | Ebene XZ, Profillage H, Radius und K-Faktor, eine Zuschnittzeile |
| G Wandstärke | t = 20 bei H = 40 → Fehler, kein Körper |
| I Parameteränderung | Formeln aus der Parametertabelle; Neuaufbau mit Cache = ohne Cache |
| J ungültige Eingaben | negative Länge, 175°, über Maximum, Segment zu kurz, 4 Segmente, negativer Radius, K > 1: Fehler mit Bezug, kein Teilergebnis, anderes Feature unberührt |
| K Speichern/Laden | JSON-Roundtrip baut identisch (Meta, Volumen) |
| L STEP | Export und Rückimport beider Ansichten, Volumen gleich |
| E/F Freistellung, Spalt, Zapfen | sieben Varianten gefaltet = abgewickelt, Mindestmaß, Biegezone frei, Außenwand ganz, Spalt, Zapfen volumenneutral, Spiel, Prüfregeln |
| N Regression | alle bisherigen Tests grün |
| Oberfläche | Knopf → Winkel im Eigenschaftsfenster auf 90° → Länge 1454,27 → Ansicht abgewickelt → zweimal Rückgängig |

Spätere Stufen: Bohrungen/Langlöcher, Laschen
und Biegehilfe-Schlitze in der Außenwand (Referenzbild 2), Biegetabelle je Material/Dicke,
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
- [ ] Fachliche Prüfung an einem realen Teil (Innenradius/K-Faktor aus der Biegetabelle, Lage der Ausklinkung) durch Patrick.
