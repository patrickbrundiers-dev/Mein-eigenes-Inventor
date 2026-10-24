# Knickrahmen – Spezifikation und Plan für Stufe 1 (MVP)

Stand: 24.10.2026 · Status: **wartet auf Freigabe**, nichts davon ist implementiert.

## 1. Fachliche Abgrenzung

Die Planungsdokumente verstehen „Knickrahmen“ unterschiedlich:

- **Knickrahmen-Modul-Plan:** ein *geknickter* Rahmen bzw. Ausleger – gerade Abschnitte
  mit festem Knickwinkel, Gehrung oder Stoß am Übergang, später Freistellungen, Laschen,
  Blechvariante. Starres Bauteil.
- **Entwicklungsplan (5.2/5.3):** zusätzlich *Gelenke* mit Drehachse, Freiheitsgraden,
  Min/Max-Winkel und „Auf-/Zusammenklappen visualisieren“ – also ein beweglicher,
  klappbarer Rahmen.

Die Referenzbilder, auf die sich der Modul-Plan bezieht, liegen nicht vor.

**Vorschlag für Stufe 1:** das starre Verständnis aus dem Modul-Plan. Jeder Knick bekommt
aber schon jetzt optionale Min/Max-Grenzen für den Winkel, damit die Grenzwertprüfung aus
dem Entwicklungsplan abgedeckt ist. Echte Gelenke (beweglich, mehrere Körper mit
Drehachse) kämen frühestens in Stufe 3 über Baugruppen. **Diese Abgrenzung braucht
Patricks Freigabe.**

## 2. Modellierungsvariante für Stufe 1

Variante **B/C aus dem Modul-Plan: Profilrahmen aus geraden Rechteck-Hohlprofil-Segmenten,
am Knick auf Gehrung geschnitten.**

- Jedes Segment ist ein eigener, echter Volumenkörper (`kind: "member"`) mit Innen- und
  Außenkontur. Dadurch erscheint jedes Segment automatisch in der Zuschnittliste mit
  Profil-ID, Zuschnittlänge und Gehrungswinkel und wird von „STEP + Zuschnittliste“
  und „Profile einzeln (STEP)“ ausgegeben.
- Kein Biegen, kein Biegeradius, keine Abwicklung. Ein geknickter Profilkörper wird nicht
  als gebogenes Rohr ausgegeben.
- Gekantetes Blech (Variante A) ist im Projekt **blockiert**: es gibt keine Blech- oder
  Biegelogik. Dafür braucht es einen eigenen ADR (K-Faktor, Biegetabellen) – Stufe 3.

## 3. Koordinaten- und Winkelkonvention

- **Ebene:** XY, XZ oder YZ (wie Skizzen, `planeFrame` in `src/core/geom.js`), optional
  mit Abstand. Lokale Achsen `u` (xDir) und `v` (yDir), Normale `n`.
- **Startpunkt** `(u0, v0)` und **Startrichtung** `α` in der Ebene (0° = +u, gegen den
  Uhrzeigersinn um `n` positiv).
- **Bezug: Mittellinie (Systemlinie)** des Profils. Segmentlänge `Lᵢ` = Abstand der
  Knotenpunkte auf der Mittellinie.
- **Knickwinkel θⱼ** = Richtungsänderung zwischen Segment j und j+1.
  0° = gerade weiter, +θ = Knick nach links (gegen den Uhrzeigersinn um `n`), −θ = nach rechts.
  Die Oberfläche zeigt zusätzlich den **Innenwinkel 180° − |θ|**, damit es keine
  Verwechslung gibt. Beispiel: θ = 90° ↔ Innenwinkel 90°; θ = 30° ↔ Innenwinkel 150°.
- **Gehrung:** Schnittebene ist die Winkelhalbierende am Knoten, Gehrungswinkel je Ende
  = |θ|/2 (wie im vorhandenen Rahmen, `buildFrame`).
- **Profillage:** „hochkant“ (Höhe H senkrecht zur Ebene, Breite B in der Ebene) oder
  „flach“ (um 90° gedreht). `W` = Profilbreite in der Knickebene.
- **Einheiten:** mm und Grad, Eingaben als Ausdrücke mit Parametern wie überall.

## 4. Datenmodell (Feature im Bauteil)

```json
{
  "id": "f…", "type": "knickrahmen", "name": "Knickrahmen", "version": 1,
  "section": "rechteck", "dims": { "B": "60", "H": "40", "t": "3", "r": "6" },
  "plane": "XY", "offset": "0", "start": ["0", "0"], "direction": "0",
  "orientation": "hochkant",
  "segments": [{ "length": "1000" }, { "length": "600" }],
  "bends": [{ "angle": "30", "min": "", "max": "" }],
  "joint": "gehrung"
}
```

- `segments.length` = 1…3, `bends.length` = `segments.length − 1`.
- `section`: in Stufe 1 nur `rechteck` und `vierkant` (beides Rechteck-Hohlprofil).
- `version` am Feature erlaubt spätere Migration nur dieses Features.
- Projektformat bleibt `version: 1` (neuer Feature-Typ, keine Bedeutungsänderung). Ältere
  WerkCAD-Versionen zeigen für dieses Feature „Unbekanntes Feature“, stürzen aber nicht ab.

## 5. Prüfregeln

Vor der Geometrie, rein rechnerisch in `src/core/knickrahmen.js`:

| Code | Regel | Meldung (Beispiel) |
|---|---|---|
| `SEG_COUNT` | 1 ≤ Segmente ≤ 3, Knicke = Segmente − 1 | „Knickrahmen: 1 bis 3 Segmente“ |
| `SEG_LENGTH` | Lᵢ > 0 | „Segment 2: Länge muss > 0 sein“ |
| `ANGLE_RANGE` | 0,5° ≤ \|θ\| ≤ 170° (technische Grenze der Gehrung) | „Knick 1: Winkel 175° außerhalb 0,5–170°“ |
| `ANGLE_LIMIT` | min ≤ θ ≤ max, falls angegeben; min ≤ max | „Knick 1: 50° über Maximum 45°“ |
| `SEG_SHORT` | Lᵢ − oₗ − oᵣ > 0 mit o = (W/2)·tan(\|θ\|/2) | „Segment 2 zu kurz für die Gehrung (mindestens 41,2 mm)“ |
| `SECTION` | Querschnitt gültig (`sectionGeometry`: Wandstärke, Maße > 0) | „Wandstärke zu groß“ |

Nach der Geometrie, im Kernel:

- jedes Segment ist genau ein Volumenkörper, Volumen > 0,
- `BRepCheck_Analyzer(...).IsValid()` ist wahr,
- sonst Fehler am Feature mit Segmentnummer.

**Atomar:** alle Segmente werden erst gebaut und geprüft, danach gemeinsam übernommen.
Schlägt eines fehl, liefert das Feature keinen Körper und meldet den Fehler; die
Parameter bleiben unverändert gespeichert.

## 6. Kleinstes technisch korrektes MVP (Stufe 1)

Enthalten:

1. Ribbon „3D-Modell → Profile → Knickrahmen“ legt ein Feature mit Vorgabewerten an
   (2 Segmente, 30°, RE 60×40×3 aus dem Katalog).
2. Eigenschaften-Panel: Querschnitt (vorhandener Editor), Ebene, Startpunkt,
   Startrichtung, Profillage, Segmentliste (hinzufügen/entfernen bis 3), Knickwinkel mit
   Anzeige des Innenwinkels, optionale Min/Max.
3. Körper je Segment mit Gehrung, Zuschnittliste/STEP wie oben.
4. Prüfregeln aus Abschnitt 5 mit verständlichen Meldungen am Feature.
5. Speichern/Laden, Undo/Redo über die vorhandenen Wege.

Nicht enthalten (spätere Stufen): Stumpfstoß/Überlappung, Freistellungen, Bohrungen,
Langlöcher, Laschen, Rundrohr und andere Querschnitte, räumliche Knicke, Biegeradius,
Blech, Gelenke/Bewegung, Kollisionsprüfung, JSON-Austauschformat, Zeichnungsanpassungen.

## 7. Dateiliste Stufe 1

| Datei | Änderung | Umfang |
|---|---|---|
| `src/core/knickrahmen.js` | **neu**: Mittellinie berechnen, Gehrungsüberstand, Prüfregeln, Vorgabewerte | ~120 Zeilen |
| `src/kernel/build.js` | `case "knickrahmen"` in `buildPart`, kleine Hilfsfunktion `checkSolid` (BRepCheck) | ~60 Zeilen |
| `src/ui/ribbon.js` | Knopf in der Gruppe „Profile“, Vorgabe-Feature anlegen | ~5 Zeilen |
| `src/ui/props.js` | `case "knickrahmen"`: Eingabefelder, Segmentliste | ~50 Zeilen |
| `src/ui/app.js`, `src/ui/tree.js` | Typname und Symbol | je 1 Zeile |
| `test/core.test.mjs` | Tests für Pfad und Prüfregeln | ~80 Zeilen |
| `test/kernel.test.mjs` | Geometrie-Tests (siehe 8) | ~120 Zeilen |
| `tools/e2e.mjs` | ein Oberflächenschritt: anlegen, Winkel ändern, Rückgängig | ~25 Zeilen |
| `README.md`, `docs/knickrahmen/` | Bedienung und Grenzen | kurz |

Nicht angefasst: `electron/`, Workflows, Update, Dateiformat-Version, vorhandene
Feature-Typen. `buildFrame` wird nicht umgebaut; die Gehrungsrechnung wird im neuen
Modul nachgebildet und mit `makeMember` verwendet.

## 8. Testplan Stufe 1

Toleranzen: Längen ±0,01 mm (Vernetzungstoleranz für `memberLength` ist 0,01 mm; Kanten an
ebenen Schnittflächen liegen exakt), Volumen relativ 1·10⁻⁶ (OCCT-Volumenberechnung auf
exakten Flächen), Winkel ±0,01°.

| Nr. | Fall (Bezug Modul-Plan) | Prüfung |
|---|---|---|
| T1 | 1 Segment, gerades RE 60×40×3, L = 1000 (A) | 1 Körper, gültig, Volumen = A·L, Zuschnitt 1000 |
| T2 | 2 Segmente, θ = 30°, 45°, 90° (B) | Endpunkt der Mittellinie analytisch; Gehrung je |θ|/2; Zuschnitt = L + (W/2)·tan(\|θ\|/2) je Gehrungsende; Volumen = A·ΣLᵢ |
| T3 | 3 Segmente, gleiche und gegensinnige Knicke (C, D) | Mittelsegment mit Gehrung an beiden Enden; Zuschnittliste 3 Zeilen bzw. gruppiert bei gleichen Maßen |
| T4 | Dünnwand t = 0,5 und Grenzfall 2t ≥ H (G) | gültig bzw. Fehler „Wandstärke zu groß“, kein Körper |
| T5 | Parameter nachträglich ändern (I) | Neuaufbau mit Cache = Neuaufbau ohne Cache (Hüllbox, Volumen) |
| T6 | Ungültige Eingaben (J) | L ≤ 0, \|θ\| > 170°, θ außerhalb Min/Max, Segment zu kurz, 4 Segmente: je Fehlercode, Feature ohne Körper, andere Features unberührt |
| T7 | Speichern/Laden (K) | Projekt → `JSON.stringify` → `JSON.parse` → Aufbau identisch (Anzahl, Volumen, Hüllbox, Meta) |
| T8 | STEP-Export und Rückimport (L) | Volumen und Körperanzahl nach Rückimport gleich (±1·10⁻³ relativ) |
| T9 | Ausdrücke/Parameter | Länge `Gesamt/2`, Winkel `Knick` aus Parametertabelle |
| T10 | Ebene XZ/YZ, Startrichtung, Profillage „flach“ | Hüllbox liegt in der richtigen Ebene, W wechselt |
| T11 | Regression (N) | alle vorhandenen 16 + 15 Tests, 25 Oberflächenschritte, Electron-Rauchtest grün |
| E1 | Oberfläche | Knickrahmen anlegen → Winkel ändern → Zuschnittliste zeigt Segmente → Rückgängig |

Spätere Stufen: E (Freistellung), F (Bohrung/Langloch) → Stufe 2; H (Blech) → Stufe 3;
M (JSON-Schnittstelle) → Stufe 4.

## 9. Akzeptanzkriterien Stufe 1

- [ ] Knickrahmen mit 1–3 Segmenten entsteht reproduzierbar aus Parametern.
- [ ] Alle Parameter sind nachträglich änderbar, auch als Formeln.
- [ ] Jeder Segmentkörper ist laut `BRepCheck_Analyzer` gültig, Volumen > 0.
- [ ] Gehrungen stimmen analytisch (T2/T3).
- [ ] Ungültige Eingaben werden mit Feature-/Parameterbezug gemeldet; kein Teilergebnis.
- [ ] Speichern/Wiederöffnen ergibt dieselbe Konstruktion.
- [ ] Zuschnittliste und STEP enthalten die Segmente mit Profil-ID.
- [ ] Alle vorhandenen Tests bleiben grün.
- [ ] Bedienung und Grenzen sind dokumentiert.

## 10. Freigabepunkte

1. Fachliches Verständnis „Knickrahmen“ (Abschnitt 1): starrer, geknickter Profilrahmen
   in Stufe 1?
2. Querschnitt in Stufe 1: Rechteck-/Quadrat-Hohlprofil?
3. Winkelkonvention (Abschnitt 3): Richtungsänderung als Eingabe, Innenwinkel als Anzeige?
