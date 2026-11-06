# SolidCraft-Optionen in PBCAD – Abgleich Option für Option

Stand: 05.11.2026, PR #204. Grundlage ist das Inventar aus Handbuch und Quellcode von SolidCraft (`solidcraft-inventar.md`). Hier steht für **jede Option** jedes Befehls und **jede Einstellung** der Einstellungsseiten, wie PBCAD sie abdeckt.

**Stand-Werte**

- **vorhanden** – gab es schon vor dieser Runde.
- **neu eingebaut** – in dieser Runde nachgebaut (PR #204).
- **teilweise** – das Wesentliche geht, Einschränkung steht in der Bemerkung.
- **nur Skript/KI** – Parameter, die SolidCraft nur für seine Skript- und KI-Schnittstelle hat (z. B. `participants`, `param_warnings`, `queued`, `name`/`body_name` als Rückgabe-Namen). PBCAD hat keine solche Schnittstelle; in der Oberfläche fehlt dadurch nichts.
- **weggelassen** – bewusst nicht nachgebaut (Rendern/Looks auf Patricks Wunsch, FEM, Flächenanpassung). Liste: `solidcraft-weggelassen.md`.
- **offen** – noch nicht gebaut.

## Teil A: Optionen je Befehl

| Gruppe | Befehl | Optionen | Stand | Bemerkung |
|---|---|---|---|---|
| appearance | AppearanceAssign | `bodies`, `faces`, `body`, `components`, `appearance`, `color`, `opacity`, `pbr` | weggelassen | Looks/Darstellungen gehören zum Rendern. Farbe je Körper/Fläche/Komponente gibt es (Farbe, Deckkraft); PBR-Looks weggelassen. Nur für Skripte: `name`. |
| appearance | AppearanceLibrary | `appearances` | weggelassen | Rendern Nur für Skripte: `param_warnings`. |
| appearance | AppearanceList | `body` | weggelassen | Rendern |
| bom | Bom | `component`, `levels`, `group_by`, `group_children`, `path`, `format` | vorhanden | Stückliste: flach/oberste Ebene, Gruppierung, Unterteile unter Baugruppe, Export CSV/JSON/XLSX. |
| browser | Repair | `body`, `gap`, `patch_holes` | vorhanden | Reparieren: Spaltweite und Löcher schließen (Nähen in OCC). Nur für Skripte: `common`. |
| browser | DocumentUnits | `units` | vorhanden | Einheit der Konstruktion mm/cm/m/in/ft (Einstellungen → Allgemein). |
| clearance | Clearance | `bodies`, `against`, `min_volume`, `clearance`, `tolerance`, `nearest`, `skip_within` | neu eingebaut | Mindestabstand, Toleranz und »Nur gegen« neu (Dialog »Optionen …« an der Kollisionsprüfung). »Je Komponente nur die n nächsten« (`nearest`, PR #206); `min_volume` = »Kleinere Überschneidung zählt als Berührung (mm³)«. |
| compare | Compare | `a`, `b`, `tolerance`, `spacing`, `max_points`, `max_regions`, `color` | neu eingebaut | Toleranz neu im Dialog »Körper vergleichen«. Abtastdichte/Höchstzahlen fest (aus der Netzgenauigkeit). |
| component | EditInPlace | `component`, `path` | neu eingebaut | L3: »Im Kontext bearbeiten« geht jetzt auch für verknüpfte Teile (Desktop-App). |
| component | FinishEdit |  | neu eingebaut | »Fertig« schreibt das Teil in seine Quelldatei (atomar, mit Sicherungen), »Verwerfen« stellt den Stand davor her. Nur für Skripte: `queued`, `param_warnings`. |
| component | OccurrenceAlign | `occurrence`, `occurrences`, `path`, `paths`, `from`, `from_face`, `from_plane`, `to`, `to_face`, `to_plane`, `flip`, `capture`, `move_grounded` | vorhanden | Ausrichten von Komponenten (Fläche/Ebene → Fläche/Ebene, umdrehen, fest). |
| component | MoveFeatures | `features`, `component` | vorhanden | Features in Bauteil verschieben (Ableiten/Kopie konstruieren, PR #194). |
| component | MoveSketchesToParts | `sketches` | vorhanden | Skelett: Skizzen in Teile übernehmen. |
| component | ReparentItems | `occurrences`, `features`, `bodies`, `component`, `component_path` | vorhanden | Umhängen per Ziehen im Modellbrowser. |
| config | ConfigTable | `row` | vorhanden | Variantentabelle. |
| config | ConfigRow | `row` | vorhanden | Zeilen anlegen/umbenennen/aktivieren. |
| config | ConfigConfigure | `params`, `features`, `materials`, `appearances`, `component_appearances`, `face_appearances` | vorhanden | Variante aktivieren. |
| config | ConfigColumn | `param`, `feature`, `material`, `appearance`, `component_appearance`, `face_appearance`, `delete` | neu eingebaut | Spalten Parameter, Werkstoff (neu) und Unterdrückung je Feature (neu). Farbspalten (appearance, component/face_appearance) weggelassen – Looks. |
| config | ConfigRowEdit | `from`, `values`, `rename`, `delete` | vorhanden | Nur für Skripte: `name`. |
| config | ConfigRule | `rule`, `rules`, `id`, `delete`, `index` | vorhanden | Regeln (Stufe 43). |
| construct | AxisThroughCylinder | `face` | vorhanden | Nur für Skripte: `common`. |
| construct | AxisNormalToFace | `face`, `point` | vorhanden | Nur für Skripte: `common`. |
| construct | AxisTwoPlanes | `a`, `b` | vorhanden | Nur für Skripte: `common`. |
| construct | AxisTwoPoints | `a`, `b` | vorhanden | Nur für Skripte: `common`. |
| construct | AxisEdge | `edge` | vorhanden | Nur für Skripte: `common`. |
| construct | PointVertex | `point` | vorhanden | Nur für Skripte: `common`. |
| construct | PointTwoEdges | `a`, `b` | neu eingebaut | Punkt »zwischen zwei Achsen/Kanten« (Mitte der nächsten Punkte) neu. Nur für Skripte: `common`. |
| construct | PointThreePlanes | `a`, `b`, `c` | vorhanden | Nur für Skripte: `common`. |
| construct | PointCenter | `of` | vorhanden | Nur für Skripte: `common`. |
| construct | PointEdgePlane | `edge`, `plane` | vorhanden | Nur für Skripte: `common`. |
| construct | PointAlongPath | `path`, `t` | neu eingebaut | Punkt auf Kurve mit Lage 0…1 neu. Nur für Skripte: `common`. |
| construct | Midplane | `a`, `b` | vorhanden | Nur für Skripte: `common`. |
| construct | PlaneTwoEdges | `a`, `b` | vorhanden | Nur für Skripte: `common`. |
| construct | PlaneAxisPoint | `axis`, `point` | vorhanden | Nur für Skripte: `common`. |
| construct | PlaneThreePoints | `a`, `b`, `c` | vorhanden | Nur für Skripte: `common`. |
| construct | PlaneTangent | `face`, `at`, `reference`, `angle` | vorhanden | Nur für Skripte: `common`. |
| construct | PlaneAlongPath | `path`, `t` | vorhanden | Nur für Skripte: `common`. |
| construct | PlanePerpendicular | `plane`, `line` | neu eingebaut | Ebene durch Achse senkrecht zu Ebene neu. Nur für Skripte: `common`. |
| diagnostics | CrashReports | `limit` | vorhanden | Fehlerprotokoll lokal (Einstellungen → Datenschutz). |
| diagnostics | CrashReport | `id` | vorhanden |  |
| diagnostics | CrashReportsClear | `id` | vorhanden |  |
| diagnostics | CrashTest | `mode` | nur Skript/KI | Nur zum Testen des Absturzberichts. |
| diagnostics | Profile | `enabled`, `reset`, `top`, `trace` | vorhanden | Leistungsprofil je Feature (Berechnungsprotokoll). |
| diagnostics | Validation | `mode` | neu eingebaut | Körperprüfung: am Ende / nach jedem Feature / aus (Einstellung). |
| edit | Assistant |  | nur Skript/KI | KI-Assistent in SolidCraft – PBCAD hat keine KI-Schnittstelle. |
| edit | Repeat |  | vorhanden | Nochmal (PR #187). |
| edit | TimelinePlay | `action` | neu eingebaut | Verlauf abspielen ⏯ mit einstellbarem Takt. |
| edit | Undo | `undone` | vorhanden | Nur für Skripte: `param_warnings`. |
| edit | Redo | `redone` | vorhanden | Nur für Skripte: `param_warnings`. |
| edit | Checkpoint | `checkpoint`, `restored` | neu eingebaut | Zwischenstand speichern (Bearbeiten → Zwischenstand). Nur für Skripte: `param_warnings`. |
| edit | RestoreCheckpoint | `checkpoint`, `forget` | neu eingebaut | Zwischenstand wiederherstellen / vergessen. |
| features | Box | `length`, `width`, `height`, `corner`, `center`, `operation`, `targets` | vorhanden | Ecke/Mitte über »Punkt ist« (neu), Zielkörper (neu). Nur für Skripte: `touching`, `participants`, `name`, `body_name`, `body_names`. |
| features | Extrude | `distance`, `sketch`, `profiles`, `face`, `faces`, `face_body`, `body`, `through_all`, `extent`, `taper`, `direction`, `distance2`, `start_offset`, `to`, `to_offset`, `from`, `operation`, `targets`, `thin`, `curves`, `thickness`, `side`, `thickness2` | neu eingebaut | Verjüngung, Versatz Start, Start ab Fläche, Bis Fläche + Abstand darüber hinaus, Seite 2 durch alles, Dünnwand (innen/mitte/außen/beidseitig, zweite Dicke), Körperfläche als Quelle, Zielkörper. »Bis Fläche« an gekrümmten Flächen (Rohr, Kugel, Freiform) endet genau an der Fläche (PR nach 0.45.0); offene Kurvenzüge als Dünnwand nur über geschlossene Profile. Nur für Skripte: `exact_regions`, `convention`, `touching`, `participants`, `name`, `body_name`, `body_names`. |
| features | Cylinder | `radius`, `diameter`, `height`, `base`, `axis`, `references`, `operation`, `targets` | vorhanden | Mit Zielkörper. Nur für Skripte: `common`. |
| features | Sphere | `radius`, `diameter`, `center`, `operation`, `targets` | vorhanden | Nur für Skripte: `common`. |
| features | Torus | `major`, `minor`, `center`, `operation`, `targets` | vorhanden | Nur für Skripte: `common`. |
| features | Cone | `radius`, `diameter`, `top_radius`, `top_diameter`, `height`, `base`, `axis`, `operation`, `targets` | vorhanden | Nur für Skripte: `common`. |
| features | Pipe | `path_sketch`, `path`, `diameter`, `wall`, `operation`, `targets` | neu eingebaut | Rohr entlang Pfad mit Außendurchmesser und Wanddicke. Nur für Skripte: `common`. |
| features | BoundingSolid | `bodies`, `margin` | vorhanden | Hüllkörper mit Rand. Nur für Skripte: `common`. |
| features | Scale | `bodies`, `factor`, `factors`, `origin` | neu eingebaut | Skalieren gleichmäßig oder je Achse, Bezugspunkt. Je Achse geht über ein Netz (Kern hat kein GTransform) – gekrümmte Flächen werden facettiert, Hinweis erscheint. Nur für Skripte: `name`, `participants`. |
| features | OffsetPlane | `base`, `offset`, `through` | vorhanden | Nur für Skripte: `common`. |
| features | PlaneAtAngle | `base`, `axis`, `angle` | vorhanden | Nur für Skripte: `common`. |
| features | Fillet | `edges`, `radius`, `body`, `tangent_chain`, `kind`, `radius2`, `start`, `mid`, `smooth`, `radii`, `knots`, `fit`, `corner`, `setbacks`, `turn` | neu eingebaut | Querschnitt Kreis/Sehne/Kurve, Zwischenradien (Lage:Radius) mit »weich«. Spline-Radienverlauf (knots/fit) über Zwischenradien abgedeckt; Eck-Rücksprünge (setbacks) nicht einstellbar. Nur für Skripte: `common`. |
| file | ExportStep | `path`, `bodies` | vorhanden | Ganzes Modell; Auswahl einzelner Körper über Ausblenden. |
| file | ExportMesh | `path`, `bodies`, `quality` | neu eingebaut | Netzgenauigkeit (Einstellung Dateien). |
| file | Export3mf | `path`, `bodies`, `quality`, `objects` | neu eingebaut | Netzgenauigkeit; je Komponente ein Objekt. |
| file | ExportUrdf | `path`, `mesh_prefix`, `effort`, `velocity` | neu eingebaut | Pfad vor den Netzen, Kraft- und Geschwindigkeitsgrenze (Einstellungen). |
| inspect | Describe | `command` | nur Skript/KI | Befehlsbeschreibung für Skripte – in PBCAD Befehlssuche mit Kurzhilfe. |
| inspect | BodyList | `body` | vorhanden | Körper im Modellbrowser / Kanten und Flächen auflisten. |
| inspect | ModelThreads | `body`, `edges` | vorhanden | Gewinde am Modell (Bohrungsangaben). Nur für Skripte: `param_warnings`. |
| joints | EditJoint | `joint`, `a`, `b`, `kind`, `flip`, `offset`, `angle`, `suppressed`, `quiet` | vorhanden | Gelenk bearbeiten. Nur für Skripte: `name`. |
| libraries | LibraryInspect | `path` | vorhanden | Teilebibliothek. |
| libraries | LibraryExport | `path`, `id`, `provenance`, `overwrite`, `format` | vorhanden | Nur für Skripte: `name`. |
| libraries | LibraryApply | `path`, `entry`, `revision`, `targets` | vorhanden | Nur für Skripte: `name`. |
| mass_properties | AssemblyMass | `origin`, `x`, `y`, `z` | vorhanden | Masse, Schwerpunkt, Trägheit bezogen auf Ursprung oder Punkt. |
| material_properties | ValidateCard | `card` | vorhanden | Werkstoffprüfung beim Anlegen eigener Werkstoffe. |
| material_properties | DirectionalModulus | `card`, `direction` | weggelassen | Richtungsabhängiger E-Modul – PBCAD hat keine FEM. |
| metadata | Metadata | `metadata`, `properties` | vorhanden | iProperties/Eigenschaften (PR #194). |
| metadata | MetadataSet | `key`, `value`, `values` | vorhanden |  |
| metadata | MetadataRemove | `key`, `keys` | vorhanden |  |
| motion | FindLimits | `joint`, `index`, `refine`, `step`, `occurrences`, `against`, `contact_sets` | neu eingebaut | Grenzen finden mit einstellbaren Schritten und Genauigkeit (Einstellungen → 3D-Ansicht). Beachtet den Kontaktsatz (nur Berührungen zwischen dessen Komponenten zählen, PR #206). |
| parameter_sweep | ParameterSweep | `parameter`, `values`, `from`, `to`, `steps` | neu eingebaut | Parameterstudie: Parameter, Werte oder von/bis/Schritte, Ergebnis Masse/Volumen/Hülle. |
| parts | PartsLibrary | `family` | vorhanden | Normteile. |
| parts | PartsInsert | `family`, `size`, `length`, `at`, `point`, `direction` | vorhanden | Nur für Skripte: `name`. |
| parts | PartsResize | `component`, `size`, `length` | vorhanden | Größe/Länge ändern am Normteil. |
| print_face | PrintFace | `body`, `point` | neu eingebaut | Auflagefläche für den Druck; Hervorhebung der aufliegenden Flächen neu (abschaltbar). |
| render | Environment | `set`, `rotation_deg`, `intensity` | weggelassen | Rendern Nur für Skripte: `name`. |
| render_library | LibraryList | `kind`, `query`, `availability`, `offset`, `limit` | weggelassen | Rendern |
| render_library | LibraryDescribe | `kind`, `id` | weggelassen | Rendern |
| render_library | LibraryTargets | `query`, `offset`, `limit` | weggelassen | Rendern |
| render_library | LibraryPreview | `id` | weggelassen | Rendern |
| render_lights | List | `setup`, `settings` | weggelassen | Rendern (Lichter) |
| render_lights | Solo | `id`, `solo` | weggelassen | Rendern |
| render_lights | Mute | `id`, `mute` | weggelassen | Rendern |
| render_lights | Edit | `id`, `settings`, `set`, `expected_revision` | vorhanden | Skizze bearbeiten. Nur für Skripte: `name`. |
| render_shots | Shot | `new_name`, `expected_revision` | weggelassen | Rendern Nur für Skripte: `name`. |
| render_stage | Ground | `set`, `margin_fraction`, `gap_mm`, `reflectance_linear`, `replace_stage` | weggelassen | Rendern – Bodenschatten in der Ansicht gibt es als Grafik-Einstellung. Nur für Skripte: `name`. |
| render_stage | Backdrop | `set`, `kind`, `reflectance_linear`, `replace_stage`, `expected_revision` | weggelassen | Rendern Nur für Skripte: `name`. |
| render_stage | Clear | `set` | weggelassen | Rendern Nur für Skripte: `name`. |
| render_ui | Batch | `request` | weggelassen | Rendern |
| section | Section | `plane`, `offset`, `at`, `flip`, `hatch`, `clear` | neu eingebaut | Schnitt an beliebiger Ebene/Fläche neu; Versatz, umdrehen, Schnittflächen füllen vorhanden. Schraffur in der Ansicht als gefüllte Fläche. |
| sheet | Flange | `sketch`, `profiles`, `rule`, `flip`, `curves`, `distance`, `reverse`, `edges`, `height`, `height_from`, `angle`, `radius`, `position`, `body`, `corner_relief_shape`, `corner_relief`, `then` | neu eingebaut | Höhe gemessen ab (außen/innen/tangential), Biegeposition, Eckfreistellung – PR #204. Nur für Skripte: `common`. |
| sheet | Perforate | `diameter`, `pitch`, `margin`, `pattern`, `body`, `sketch`, `profiles` | vorhanden | Lochblech mit Muster, Teilung, Rand. Nur für Skripte: `common`. |
| sheet | Hem | `edges`, `length`, `gap`, `flip`, `body` | neu eingebaut | Spalt leer = aus der Blechregel. Nur für Skripte: `common`. |
| sheet | Fold | `points`, `sketch`, `curve`, `angle`, `radius`, `position`, `fixed`, `flip`, `body` | neu eingebaut | Falten an Skizzenlinie, Winkel, Radius, Lage, feste Seite – PR #204. Nur für Skripte: `common`. |
| sheet | Unfold | `body` | vorhanden | Nur für Skripte: `common`. |
| sheet | Convert | `body`, `face`, `bends`, `rule` | vorhanden | In Blech umwandeln. Nur für Skripte: `common`. |
| sheet | Rules | `thickness`, `k_factor`, `bend_radius`, `relief_width`, `relief_depth`, `corner_relief`, `corner_relief_shape`, `hem_gap`, `gap`, `angle_display`, `active`, `delete` | neu eingebaut | Blechregeln mit Spalt Umschlag, Spalt Ecke und Winkel in DXF (innen/außen) neu. Nur für Skripte: `name`. |
| sheet | ManageRules | `thickness`, `k_factor`, `bend_radius`, `relief_width`, `relief_depth`, `corner_relief`, `corner_relief_shape`, `hem_gap`, `gap`, `angle_display`, `active`, `delete` | vorhanden | Nur für Skripte: `name`. |
| sketch | Edit | `sketch` | vorhanden | Skizze bearbeiten. Nur für Skripte: `restore_marker`. |
| sketch | Exit |  | vorhanden | Nur für Skripte: `restore_marker`. |
| sketch_constraints | ToggleDiameter | `constraint`, `diameter`, `sketch` | neu eingebaut | »Als Durchmesser/Radius bemaßen« am Maß. |
| sketch_create | ConstructionLine | `mode`, `at`, `through`, `near`, `solution`, `curve`, `curve2`, `alternate`, `angle`, `length`, `construction`, `sketch` | vorhanden |  |
| sketch_create | SplineReverse | `curve`, `sketch` | vorhanden |  |
| sketch_create | SplineRemovePoint | `curve`, `point`, `sketch` | vorhanden |  |
| sketch_ends | LooseEnds | `sketch` | vorhanden |  |
| sketch_ends | TieLooseEnds | `sketch`, `points` | vorhanden |  |
| sketch_equation | EquationCurve | `x`, `y`, `explicit`, `start`, `end`, `tolerance`, `variable_unit`, `construction`, `sketch` | neu eingebaut | »Als Konstruktionslinie« neu. Variable mit Einheit: Winkel in Grad fest. |
| sketch_equation | EquationEdit | `curve`, `x`, `y`, `explicit`, `start`, `end`, `tolerance`, `variable_unit`, `sketch` | vorhanden |  |
| sketch_inspect | CurvatureComb | `curves`, `sketch`, `edges`, `faces`, `count`, `density`, `scale`, `length`, `add`, `clear` | neu eingebaut | Kammfaktor und Dichte neu. |
| sketch_inspect | MinimumRadius | `curves`, `sketch`, `edges`, `faces` | vorhanden |  |
| sketch_inspect | Isocurve | `faces`, `count`, `add`, `clear` | neu eingebaut | Anzahl Isokurven neu. |
| sketch_inspect | CenterOfMass | `bodies` | vorhanden |  |
| surface_analysis | Analysis | `off` | vorhanden |  |
| surface_analysis | Zebra | `stripes`, `clear` | neu eingebaut | Streifenanzahl neu. |
| surface_analysis | Draft | `pull`, `angle`, `clear` | vorhanden | Auszugsrichtung und Winkel. |
| surface_analysis | Environment | `clear` | weggelassen | Rendern |
| surface_analysis | Accessibility | `direction`, `clear` | vorhanden |  |
| surface_analysis | Curvature | `radius`, `clear` | vorhanden |  |
| surface_analysis | Continuity | `body`, `edges`, `samples`, `gap_tolerance_mm`, `angle_tolerance_deg`, `curvature_tolerance_per_mm`, `curvature_change_tolerance_per_mm2`, `curvature_change_rate_tolerance_per_mm3`, `add`, `clear` | neu eingebaut | Toleranz neu; Krümmungsänderungs-Toleranzen zusammengefasst. |
| surface_boundary | Boundary | `sketch`, `curves`, `continuity`, `crown`, `samples`, `u`, `v`, `operation` | vorhanden | Begrenzungsfläche mit Stetigkeit. Nur für Skripte: `common`. |
| surface_match | MatchSurface | `body`, `faces`, `target`, `edges`, `order` | weggelassen | Flächenanpassung – weggelassen (siehe Liste). Nur für Skripte: `name`, `participants`. |
| ui_prefs | Prefs | `theme_options`, `settings` | vorhanden | Einstellungscenter. |
| view_navigation | StatusItems | `enabled` | vorhanden | Statusleiste ein/aus. |
| view_navigation | AngleReadout | `enabled` | vorhanden | Ansichtswinkel-Anzeige. |
| view_navigation | StandardView | `camera` | vorhanden |  |
| view_navigation | NormalTo | `camera` | vorhanden |  |
| view_navigation | TabStep | `step` | vorhanden | Tab springt zwischen Eingabefeldern. Nur für Skripte: `param_warnings`. |
| view_navigation | Navigator | `style`, `body`, `texture`, `arrows`, `home` | neu eingebaut | Stil Würfel oder Achsen (neu), Einpassen nach Würfelklick (neu), Home. Würfeltextur fest; Drehpfeile am Würfel gibt es nicht – Pfeiltasten drehen (Richtung umkehrbar). |

## Teil B: Einstellungsseiten

| SolidCraft-Seite | Einstellung | PBCAD (Einstellungen → …) | Stand |
|---|---|---|---|
| Allgemein | Sprache | Allgemein → Sprache | vorhanden |
| Allgemein | Autospeichern alle … Minuten | Allgemein → Automatische Sicherung nach | vorhanden |
| Allgemein | Dateien in laufendem Slicer öffnen | Dateien → Installierte Slicer | vorhanden |
| Allgemein | Hervorhebung der Auflagefläche | Allgemein → Hervorhebung der Auflagefläche | neu eingebaut |
| Allgemein | Updates, Absturzberichte | Updates; Datenschutz → Protokollordner | vorhanden |
| Allgemein | Maximale Dateigröße STEP/Import und Design | Dateien → Größte Datei ohne Rückfrage (Import / Projekt) | neu eingebaut |
| Darstellung | Farbthemen hell/dunkel, eigene Hintergrundfarbe | Darstellung → Farbschema (14 Themen), Hintergrund | vorhanden |
| Darstellung | Akzentfarbe, Designfarben | Darstellung → Eigene Akzentfarbe (über jedem Farbthema) | neu eingebaut |
| Darstellung | Oberflächenskalierung | Darstellung → Oberflächengröße | vorhanden |
| Darstellung | Schrift (Schriftdatei) | Darstellung → Schrift der Oberfläche (Auswahl oder Name einer installierten Schrift) | neu eingebaut |
| Darstellung | Farbsehen | Darstellung → Farbsehschwäche | vorhanden |
| Darstellung | Fenster: Arbeitsbereich / schwebend / kompakt | Darstellung → Fensteraufbau | vorhanden |
| Darstellung | Werkzeugleiste: Beschriftungen / nur Symbole | Darstellung → Menüband nur mit Symbolen | vorhanden |
| Darstellung | Hinweise unten rechts / mittig | Darstellung → Meldungen erscheinen | vorhanden |
| Darstellung | Statusleiste | Darstellung → Statusleiste | vorhanden |
| Darstellung | Verlauf unten / linke Seitenleiste | Darstellung → Verlaufsleiste unten; links zeigt der Modellbrowser den Verlauf als Liste mit Bauteilende | vorhanden |
| Darstellung | Browser undurchsichtig / durchscheinend | Darstellung → Seitenleisten | neu eingebaut |
| Darstellung | Skizzen im Verlauf unter dem Feature | Darstellung → Modellbrowser: genutzte Skizzen unter ihrem Feature | vorhanden |
| Darstellung | Dialoge: OK und Abbrechen oben/unten | Darstellung → OK und Abbrechen in Dialogen | vorhanden |
| Darstellung | Dialoge beim Wechsel zwischen Konstruktionen offen lassen | Darstellung → Feature-Eigenschaften beim Dokumentwechsel offen lassen | neu eingebaut |
| Darstellung | Registerkarte Skizze immer zeigen, Suchergebnisse im Menüband | Menüband nach Inventor; Befehlssuche Strg+K | teilweise |
| Konstruktion | Einheiten für neue Designs | Allgemein → Einheit der Konstruktion | vorhanden |
| Konstruktion | Längen-/Winkel-Dezimalstellen | Allgemein → Dezimalstellen, Messen → Winkelstellen | vorhanden |
| Konstruktion | Namen der Ursprungsebenen | 3D-Ansicht → Namen der Ursprungsebenen | vorhanden |
| Konstruktion | Körperprüfung: nach jedem Schritt / je Feature / aus | CAD-Kernel → Körperprüfung (am Ende / nach jedem Feature / aus) | neu eingebaut |
| Konstruktion | Dateien aus unbekannten Programmen (Ausrichtung) | Dateien → Dateien aus unbekannten Programmen (anbieten / immer aufstellen / so lassen) | neu eingebaut |
| Konstruktion | Zeilen der Parameterliste | Dokument und Modell → Zeilen der Parameterliste | neu eingebaut |
| Werkzeuge | Bohrung, Auflage/Zapfen/Schnappverbindung | Bohrungsvorlagen, Kunststoffregeln | vorhanden |
| Werkzeuge | Baugruppe verschieben: Schritt nahe/fern der Achse | Werkzeuge → Baugruppe drehen: Schritt nahe/fern, Baugruppe verschieben: Schritt | neu eingebaut |
| Werkzeuge | Achsabstände beim Messen | Allgemein → Achsabstände beim Messen aufgeklappt zeigen | neu eingebaut |
| Skizze | Hilfslinien Mittelpunkte, Kreuzungsfang, an Skizzenpunkten ausrichten, Alt hebt Fang auf | Skizzen → Ausrichtungslinien (Runde 2) | vorhanden |
| Skizze | Drücken und Ziehen zeichnet eine Linie | Skizzen → Drücken und Ziehen zeichnet eine Linie | neu eingebaut |
| Skizze | Tangentialbogen durch Verweilen, Mittelpunktbogen folgt dem Zeiger | Linienwerkzeug wechselt per Taste zum Bogen | vorhanden |
| Skizze | Neue Formen vollständig bemaßen, vom Skizzenursprung positionieren | Skizzen → Neue Formen vollständig bemaßen / vom Skizzenursprung aus positionieren | neu eingebaut |
| Skizze | Erneuter Kurzbefehl wechselt den Modus | Skizzen → Werkzeugtaste nochmal drücken wechselt die Variante | vorhanden |
| Skizze | Flächenkanten in neue Skizzen projizieren, zuerst fragen | Skizzen → Flächenkanten in neue Skizzen projizieren (nein / immer / fragen) | neu eingebaut |
| Skizze | Beim Öffnen ausrichten, Ansicht nach dem Beenden | Skizzen → senkrecht drehen, beim Beenden (zurück / bleiben / wenn unverändert) | vorhanden |
| Skizze | Statussymbole, Konfliktfarbe, Symbole beim Herauszoomen ausblenden | Skizzen → Symbole, Konfliktfarbe, Symbole beim Herauszoomen ausblenden | neu eingebaut |
| Skizze | Klick wählt Flächen und Kanten / ganze Körper | Skizzen → Klick wählt | neu eingebaut |
| Skizze | Umschalt fügt nur hinzu, Strg schaltet um | Skizzen → Umschalt und Strg bei der Auswahl | neu eingebaut |
| Skizze | Verdeckte Kanten wählen, Andere auswählen | Durchschalten (L1) | vorhanden |
| Skizze | Bemaßungswerte in der Ansicht / in einem Fenster, Schritte für Länge und Winkel | Skizzen → Bemaßungswerte eingeben, Schritt für Längen/Winkel (Pfeile, Mausrad, −/+) | neu eingebaut |
| Navigation | Maustasten drehen/schwenken/zoomen | 3D-Ansicht → Maustasten | vorhanden |
| Navigation | Umkreisen um Ansichtszentrum / unter dem Cursor, Drehteller/frei | 3D-Ansicht → Drehpunkt, Drehen | vorhanden |
| Navigation | Zoom zum Cursor, Zoomrichtung umkehren, Zoomgeschwindigkeit | 3D-Ansicht | vorhanden |
| Navigation | Horizontale / vertikale Schwenkrichtung umkehren | 3D-Ansicht → Schwenkrichtung umkehren | neu eingebaut |
| Navigation | Sanftes Zoomen mit dem Rad | 3D-Ansicht → Sanftes Zoomen | neu eingebaut |
| Navigation | Zwei-Finger-Scrollen schwenkt, Zoomen mit Taste | 3D-Ansicht → Zwei-Finger-Scrollen schwenkt (Kneifen/Strg zoomt) | neu eingebaut |
| Navigation | Drehrichtung am Touchpad umkehren | 3D-Ansicht → Zwei-Finger-Scrollen dreht, Trackpad: Drehrichtung umkehren (PR #206) | neu eingebaut |
| Navigation | Zoom am Modell stoppen | 3D-Ansicht → Zoom am Modell stoppen | neu eingebaut |
| Navigation | Ansicht: Achsen / Würfel | 3D-Ansicht → Navigator | neu eingebaut |
| Navigation | Animationsgeschwindigkeit | 3D-Ansicht → Animationsgeschwindigkeit | neu eingebaut |
| Navigation | Größe bei Home und Einpassen | 3D-Ansicht → Größe bei Home und Einpassen | neu eingebaut |
| Navigation | Modell nach Ansichtswechsel am Navigator einpassen | 3D-Ansicht → Modell nach einem Ansichtswechsel am Würfel einpassen | neu eingebaut |
| Navigation | Drehpfeile des Ansichtswürfels umkehren | 3D-Ansicht → Drehrichtung der Pfeiltasten umkehren | neu eingebaut |
| Navigationsleiste | Lage, Größe, ausblenden bis Maus darüber | Darstellung → Navigationsleiste: Lage, Größe, ohne Maus darüber | vorhanden |
| Navigationsleiste | Felder per Ziehen anordnen | Felder in der Leiste ziehen; Reihenfolge unter Darstellung → Navigationsleiste: Reihenfolge (PR #206) | neu eingebaut |
| Grafik | Voreinstellung Leistung / Qualität / Benutzerdefiniert | 3D-Ansicht → Grafik-Voreinstellung | neu eingebaut |
| Grafik | Supersampling | 3D-Ansicht → Supersampling (aus / 1,5× / 2×) | neu eingebaut |
| Grafik | Gekrümmte Flächen (Vernetzung) | 3D-Ansicht → Darstellungsqualität | vorhanden |
| Grafik | Kantenglättung (MSAA), Grafikkarte, Fenstersystem | vom Browser/Electron gesteuert | weggelassen |
| Grafik | Raster, Perspektivisch, Sichtfeld | 3D-Ansicht → Bodenraster, Projektion, Ansichtswinkel | vorhanden |
| Grafik | Raster in Seitenansichten aufrecht | 3D-Ansicht → Raster in Seitenansichten aufrecht | neu eingebaut |
| Grafik | Bodenschatten | 3D-Ansicht → Bodenschatten | neu eingebaut |
| Grafik | Umgebungsverdeckung, lineares Licht | Bildeffekte des Renderns | weggelassen (Rendern) |
| Grafik | Ansichtswinkel-Anzeige, Schnellmessung, Bildrate | Darstellung/3D-Ansicht | vorhanden |
| Grafik | Status-Chips, Live-Details, Elemente einklappen | Statuszeile: Chips für Filter, Navigationswerkzeug, Schnitt, Ausgeblendete, Fehler – Klick schaltet zurück (PR #206); Analyse-Legenden am Eintrag | neu eingebaut |
| Grafik | Kosmetische Gewindemarkierungen | 3D-Ansicht → Bohrungsangaben und Gewinde am 3D-Modell | vorhanden |
| Grafik | Geometrie-Obergrenze | fest | weggelassen |
| 3D-Maus | Gerät verbinden, Status, Kalibrieren, Kalibrierung verwerfen | 3D-Maus (neue Seite) | neu eingebaut |
| 3D-Maus | Gleichzeitig verschieben und drehen; Skizzen nur Schwenken/Zoomen | 3D-Maus → Bewegung, Nur die stärkste Achse, Empfindlichkeit, Totzone, Umkehren | neu eingebaut |
| 3D-Maus | Tasten | 3D-Maus → Linke / Rechte Taste | neu eingebaut |
| 3D-Maus | Bild der 3D-Maus, das sich mitbewegt | – | weggelassen |

## Teilweise und offen – was noch fehlt

- Verknüpftes Teil an Ort und Stelle bearbeiten (L3) schreibt nur in der Desktop-App zurück; im Browser bleibt es schreibgeschützt.
- Extrusion »Bis Fläche« an gekrümmten Flächen: »Abstand darüber hinaus« gilt dort nicht (endet genau an der Fläche).
- Rundung: Eck-Rücksprünge (setbacks) nicht einstellbar; Spline-Radienverlauf über Zwischenradien.
- Skalieren je Achse geht über ein Netz (facettierte Rundungen, Hinweis erscheint). Der Kern in PBCAD (OpenCascade-Übersetzung von replicad) enthält die allgemeine Transformation für Körper nicht; ohne eigene Kern-Übersetzung bleibt es so.
- Gleichungskurve: Variable immer ohne Einheit bzw. Winkel in Grad.
- 3D-Maus ist ohne Gerät getestet (Berichtsauswertung und Umrechnung mit Tests); mit echter SpaceMouse noch zu prüfen. Läuft der 3Dconnexion-Treiber, kann er das Gerät exklusiv belegen – dann zeigt PBCAD »gefunden, aber nicht lesbar«.

## Nachtrag PR #206 – weitere Punkte aus dem Inventar

| Punkt | SolidCraft | PBCAD | Stand |
|---|---|---|---|
| L8 | Mehrere Tastenkürzel je Befehl, Modelltasten in der Skizze | Tastenkürzel-Editor »+ Taste« (bis 4 je Befehl); Werkzeuge → Modelltasten in der Skizze | neu eingebaut |
| L10 | Teil ziehen mit Gelenkbegrenzung und Ketten | Komponente mit Gelenk im Modell ziehen: Wert im Bereich, Rasterschritt, gekoppelte Gelenke gehen mit; Gelenk »Hängt an« (Kette, Achse wandert mit) | neu eingebaut |
| L11 | Stücklistentyp untrennbar/Kaufteil, Unterteile unter Schraube | Stücklistenstruktur Untrennbar / Kaufteil; Scheiben und Muttern einer Garnitur als Unterpositionen 3.1, 3.2 (abschaltbar im Stücklisten-Dialog) | neu eingebaut |
| L12 | 3MF je Komponente ein Objekt, an Slicer senden mit Auswahl | Dialog: je Komponente / je Körper / alles ein Objekt, Komponenten wählen, Slicer wählen; Dateien → 3MF / Slicer: Objekte | neu eingebaut |
| – | Export einzelner Körper | STEP, IGES, STL: ist etwas gewählt, fragt der Export »Nur Auswahl« oder »Alles« | neu eingebaut |
| – | Netz (STL/OBJ) in Volumenkörper | Importieren nimmt STEP, STL und OBJ; STL/OBJ werden genäht und zu einem Volumenkörper geschlossen, ebene Dreiecke zu Flächen zusammengefasst; Netz mit Löchern bleibt Fläche mit Warnung | neu eingebaut |
