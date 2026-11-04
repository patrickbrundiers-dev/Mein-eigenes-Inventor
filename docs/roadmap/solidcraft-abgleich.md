# SolidCraft-Abgleich: Oberfläche anlehnen und fehlende Funktionen

Stand 04.11.2026. Vorlage: SolidCraft (app.solidcraft.io, Open Source, MIT/Apache-2.0, Quelle github.com/tangency-labs/solidcraft).
Die Web-App selbst ist aus der Cloud gesperrt; Grundlage sind die Bildschirmfotos und Farbthemen aus dem Repository
(docs/book/src/media/ui-tour/window.png, docs/design/ux-redesign/*.png, assets/styles/ui/themes/*.json) und die Befehlsliste (assets/locales/de.json, 504 Befehle) und der Quellcode (crates/sketch, crates/engine).

Patrick: »Funktionen prüfen, fehlende nachbauen« und »an dieses Programm unser Design und Oberfläche anlehnen, umbauen«.
Nicht die App kopieren: Aufbau und Bedienung bleiben PBCAD (Inventor-Menüband, Metallbau-Reiter), nur Optik und Anordnung werden angelehnt.

## Teil 1: Oberfläche (D1–D8)

| Nr. | Was | SolidCraft | PBCAD heute | Umbau |
|---|---|---|---|---|
| D1 | Kopfleiste | dunkle Leiste: Logo, Start, Speichern, Rückgängig/Wiederholen, Dokument-Reiter, rechts Einstellungen/Hilfe | Dokument-Reiter unten, Rückgängig im Reiterbalken | dunkle Kopfleiste oben mit Logo, Start, Speichern, Rückgängig, Dokument-Reiter als Pillen, Befehlssuche, Einstellungen, Hilfe |
| D2 | Menüband | Reiter als Pillen, große zweifarbige Symbole, Gruppennamen mit ⌄ | Inventor-Reiter mit Unterstrich | Reiter als Pillen, Symbole in Akzentblau, Gruppen mit ⌄, Arbeitsbereich-Kachel links |
| D3 | Seitenpanels | schwebende Karten mit runden Ecken über der Ansicht | angedockt mit Trennlinie | Browser und Eigenschaften als schwebende Karten (Abstand, Radius, Schatten) |
| D4 | Verlauf | Leiste unten: ⏮ ◀ ▶ ⏭, Feature-Symbole, Marke zum Zurückrollen | Bauteilende nur im Baum | Verlaufsleiste unten im Bauteil: Symbole je Feature, Klick bearbeitet, Marke ziehen setzt Bauteilende, Abspielen |
| D5 | Navigationsleiste | schwebende Pille unten Mitte mit Symbolen | Textknöpfe unten rechts | Pille unten rechts mit Symbolen (Iso, Vorne, Oben, Rechts, Alles, Auswahl), darüber die Schnellmessung |
| D6 | Startseite | blaue Leiste links mit Befehlen und Kürzeln, Kacheln | helle Leiste | blaue Leiste links, Kacheln wie SolidCraft |
| D7 | Farben | Graphite (dunkel) und hell mit Blau #2f7fc8 / #4aa3d8 | Stahlgrau, Anreißblau | Farbwerte an SolidCraft angelehnt, hell und dunkel |
| D8 | Eigenschaftenfeld | Abschnittsköpfe in Großbuchstaben, OK blau | gemischt | Abschnittsköpfe klein in Großbuchstaben, Primärknopf blau |

Ansichtswürfel bleibt (Inventor-Gewohnheit), nur farblich angepasst.

## Teil 2: Funktionen, die PBCAD fehlen (F1–F8)

Abgeglichen gegen alle 504 SolidCraft-Befehle (Tabelle unten). Das meiste hat PBCAD schon (Skizze, Volumenkörper, Blech, Gelenke, Bewegung,
Kontaktsatz, Kollision, Stückliste, Parameter, Varianten, Rendern, STEP/IGES/STL/GLB). Nicht übernommen: Kunststoffteile
(Boss, Lip, Snap Fit), Flächenmodellierung (Patch, Stitch, Zebra), Punktwolken, URDF, Slicer, KI-Agent.

| Nr. | Funktion | Nutzen im Metallbau |
|---|---|---|
| F1 | Lochblech / Perforieren (Rundloch versetzt/gerade, Quadratloch, Langloch) auf einer ebenen Fläche mit freiem Rand | Lochblechfüllungen, Trittstufen, Lüftungsbleche |
| F2 | Verlaufsleiste mit Zurückrollen und Abspielen (= D4) | Aufbau nachvollziehen, Feature schnell finden |
| F3 | Schnellmessung: Länge/Fläche/Abstand der Auswahl dauerhaft in der Ansichtsecke, Klick kopiert | Messen ohne Befehl |
| F4 | Gleichungskurve in der Skizze (x(t), y(t)) | Evolvente, Spirale, Bögen nach Formel |
| F5 | Abgerundetes Rechteck in der Skizze | Langlöcher, Platten mit Eckradius in einem Schritt |
| F6 | Export OBJ und 3MF | 3D-Druck, Visualisierung |
| F7 | Hüllkörper (Quader um Auswahl mit Zugabe) | Bauraum, Rohmaß, Transportmaß |
| F8 | Ausdrücke: sinh, cosh, tanh, fest(x; n) | Kettenlinie, Zahlen in Text |

## Umsetzung (PR, Stand 04.11.2026)

Ein Zweig, ein PR. Alles umgesetzt, Merge erst nach dem Merge-Stopp für 0.38.0.

**Oberfläche (D1–D8):** dunkle Kopfleiste mit Logo, Speichern, Rückgängig-Verlauf und Dokument-Reitern als Pillen;
Menüband-Reiter als Pillen, blaue Symbole, Gruppen mit ⌄; Modellbrowser und Eigenschaften als schwebende Karten;
Verlaufsleiste unten (⏮ ◀ ▶ ⏭, Symbole je Feature, Marke ziehen = Bauteilende, abschaltbar unter Einstellungen → Darstellung);
Navigationspille unten rechts mit Symbolen; Startseite mit blauer Leiste; Farben hell und Graphite dunkel; Abschnittsköpfe in Großbuchstaben.
Ansichtswürfel und Inventor-Menübandaufbau bleiben.

**Skizze (aus dem Abgleich aller Skizzenbefehle):** abgerundetes Rechteck (ein Radiusmaß treibt alle Ecken), Linie aus Mitte,
Kreis über 2 Punkte, Bogenlangloch, Kegelschnitt (rho), Gleichungskurve x(t)/y(t) oder y(x), SVG-Import,
Hilfslinien-Familie (waagrecht, senkrecht, Winkel, parallel, senkrecht zu Linie, Winkelhalbierende, Tangente durch Punkt, gemeinsame Tangente),
Ecke (zwei Linien verbinden), Stutzen per Wischen über mehrere Linien, Skizzenrundung an mehreren Ecken auf einmal,
Kopieren/Einfügen (Strg+C/V, auch in eine andere Skizze, mit Abhängigkeiten).

**Funktionen (F1–F8):**
- F1 Lochblech: Rv/Rg/Qg/Lv nach DIN 24041 auf ebener Fläche, freier Rand zu Außenkante und Ausschnitten, Raster parallel zur längsten Kante (oder quer), Meldung mit Lochzahl und freiem Querschnitt. Bis 4000 Löcher (rund 1500 Löcher ≈ 6 s).
- F2 Verlaufsleiste mit Abspielen (= D4).
- F3 Schnellmessung unten rechts: Länge, Ø/R, Bogen, Fläche, Punkt, Abstand und Winkel, Summe mehrerer Kanten/Flächen; Klick kopiert. Abschaltbar.
- F4 Gleichungskurve, F5 abgerundetes Rechteck: siehe Skizze.
- F6 Export OBJ (Punktfarben) und 3MF (mm, Farben je Körper).
- F7 Hüllkörper: Quader um gewählte Körper mit Zugabe je Seite, durchsichtig blau, zählt nicht zur Masse, Maße in der Meldung.
- F8 Ausdrücke: sinh, cosh, tanh, exp, ln, log, sign, mod, fest(x; n). Bestehende Parameter mit diesen Namen funktionieren weiter.

Offen gelassen (siehe Tabelle): Bewegungsbahn, Kettenwahl in der Skizze, Spline-Punkte einfügen/entfernen, Verwendungsliste je Parameter.

## Alle SolidCraft-Befehle im Abgleich

Alle 504 Befehle aus SolidCraft (assets/locales/de.json, Schlüssel cmd.*), einzeln gegen PBCAD abgeglichen.

Ergebnis: **289 vorhanden**, **25 teilweise**, **27 neu nachgebaut** (dieser PR), **163 bewusst weggelassen**.


### Skizze (94: 50 vorhanden, 13 teilweise, 19 neu, 12 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Konstruktionslinie <sub>`sketch.construction_line`</sub> | **neu** | Hilfslinie (lang, Konstruktion) |
| Konstruktionslinie unter Winkel <sub>`sketch.construction_line.angle`</sub> | **neu** | Hilfslinie unter Winkel |
| Winkelhalbierende <sub>`sketch.construction_line.bisector`</sub> | **neu** | Winkelhalbierende |
| Horizontale Konstruktionslinie <sub>`sketch.construction_line.horizontal`</sub> | **neu** | Hilfslinie waagrecht |
| Parallele Konstruktionslinie <sub>`sketch.construction_line.parallel`</sub> | **neu** | Hilfslinie parallel |
| Senkrechte Konstruktionslinie <sub>`sketch.construction_line.perpendicular`</sub> | **neu** | Hilfslinie senkrecht zu Linie |
| Tangente an Kurvenpunkt <sub>`sketch.construction_line.tangent_at`</sub> | teilweise | Linie + tangential-Abhängigkeit |
| Tangente durch äußeren Punkt <sub>`sketch.construction_line.tangent_external`</sub> | **neu** | Tangente durch Punkt |
| Gemeinsame Tangente <sub>`sketch.construction_line.tangent_two`</sub> | **neu** | Gemeinsame Tangente |
| Vertikale Konstruktionslinie <sub>`sketch.construction_line.vertical`</sub> | **neu** | Hilfslinie senkrecht |
| 3D-Bogen <sub>`sketch_arc3d`</sub> | teilweise | 3D-Skizze: Punktzug mit Biegeradien |
| Mittelpunkt-Kreisbogen <sub>`sketch_arc_center_point`</sub> | vorhanden | Bogen um Mittelpunkt |
| Tangentialbogen <sub>`sketch_arc_tangent`</sub> | vorhanden | Tangentialer Bogen |
| 3-Punkt-Kreisbogen <sub>`sketch_arc_three_point`</sub> | vorhanden | Bogen |
| Auto-Bedingung <sub>`sketch_auto_constrain`</sub> | vorhanden | Abhängigkeiten beim Zeichnen + Vollständig bemaßen |
| Auto-Bedingung von Bezug <sub>`sketch_auto_constrain_from_datum`</sub> | vorhanden | Vollständig bemaßen ab Ursprung |
| Kanten automatisch auf Referenz projizieren <sub>`sketch_auto_project`</sub> | vorhanden | Kante projizieren |
| Übergangskurve <sub>`sketch_blend_curve`</sub> | weggelassen | Freiform |
| Skizze abbrechen <sub>`sketch_cancel`</sub> | vorhanden | Esc / Abbrechen |
| Kette <sub>`sketch_chain`</sub> | teilweise | Konturen erkennt PBCAD selbst; Fenster-/Kreuzwahl statt Kettenwahl |
| Abschrägung mit Abstand und Winkel <sub>`sketch_chamfer_distance_angle`</sub> | teilweise | Skizzenfase gleich/zwei Abstände |
| Abschrägung mit gleichem Abstand <sub>`sketch_chamfer_equal_distance`</sub> | vorhanden | Skizzenfase |
| Abschrägung mit zwei Abständen <sub>`sketch_chamfer_two_distance`</sub> | vorhanden | Skizzenfase |
| Kreis aus Mittelpunkt und Durchmesser <sub>`sketch_circle_center`</sub> | vorhanden | Kreis |
| 3-Punkt-Kreis <sub>`sketch_circle_three_point`</sub> | vorhanden | Kreis durch 3 Punkte |
| 3-Tangenten-Kreis <sub>`sketch_circle_three_tangent`</sub> | vorhanden | Kreis tangential an 3 Linien |
| 2-Punkt-Kreis <sub>`sketch_circle_two_point`</sub> | **neu** | Kreis über 2 Punkte |
| 2-Tangenten-Kreis <sub>`sketch_circle_two_tangent`</sub> | teilweise | Skizzenrundung zwischen zwei Linien |
| Skizzen-Bedingung <sub>`sketch_constrainer`</sub> | vorhanden | Bedingungsleiste (PR #188) |
| Fixieren/Lösen <sub>`sketch_constraint_fix`</sub> | vorhanden | Fixieren |
| Mittelpunkt <sub>`sketch_constraint_midpoint`</sub> | vorhanden | Mittelpunkt |
| Normal/Konstruktion <sub>`sketch_construction`</sub> | vorhanden | Konstruktionslinie ein/aus |
| Skizzenelemente kopieren <sub>`sketch_copy`</sub> | **neu** | Strg+C |
| Skizzenelemente ausschneiden <sub>`sketch_cut`</sub> | teilweise | Strg+C, dann Entf |
| Skizzenentitäten löschen <sub>`sketch_delete`</sub> | vorhanden | Entf |
| Maßtext verschieben <sub>`sketch_dimension_text`</sub> | vorhanden | Maß ziehen |
| Skizzengeometrie ziehen <sub>`sketch_drag`</sub> | vorhanden | Ziehen |
| Skizzen-Ziehen beenden <sub>`sketch_drag_end`</sub> | vorhanden | Ziehen |
| Skizzengeometrie mit Maßen zeichnen <sub>`sketch_draw_dimensioned`</sub> | vorhanden | Maßeingabe beim Zeichnen (PR #2/#10) |
| Zeichnungsgröße <sub>`sketch_drawing_bounds`</sub> | weggelassen | Zeichnungsgröße braucht die Skizze nicht |
| Skizze bearbeiten <sub>`sketch_edit`</sub> | vorhanden | Skizze bearbeiten |
| Text bearbeiten <sub>`sketch_edit_text`</sub> | vorhanden | Text bearbeiten |
| Gleichungskurve <sub>`sketch_equation_curve`</sub> | **neu** | Gleichungskurve x(t)/y(t) oder y(x) |
| Gleichungskurve bearbeiten <sub>`sketch_equation_curve_edit`</sub> | teilweise | neu einfügen; Formel bleibt im Dialog gemerkt |
| Als DXF speichern <sub>`sketch_export_dxf`</sub> | vorhanden | Skizze als DXF |
| Mit Auto-Bedingung fertigstellen <sub>`sketch_finish_auto_constrain`</sub> | weggelassen | Vollständig bemaßen vor Fertig |
| Kurven an Netzquerschnitt anpassen <sub>`sketch_fit_curves_to_section`</sub> | weggelassen | Netzrückführung |
| Bedingungssymbole <sub>`sketch_glyphs`</sub> | vorhanden | Abhängigkeitssymbole |
| 3D-Geometrie einbeziehen <sub>`sketch_include_3d`</sub> | vorhanden | Kante projizieren |
| Unendliche Linie <sub>`sketch_infinite`</sub> | **neu** | Hilfslinien (lange Konstruktionslinie) |
| DXF einfügen <sub>`sketch_insert_dxf`</sub> | vorhanden | DXF importieren |
| SVG einfügen <sub>`sketch_insert_svg`</sub> | **neu** | SVG importieren |
| Skizze prüfen <sub>`sketch_inspect`</sub> | vorhanden | Freiheitsgrade, Bereichseigenschaften |
| Schnittkurve <sub>`sketch_intersection_curve`</sub> | weggelassen | Flächen-Schnittkurven, Freiform |
| Isoparametrische Kurve <sub>`sketch_isoparametric_curve`</sub> | weggelassen | Freiform |
| 3D-Linie <sub>`sketch_line3d`</sub> | vorhanden | 3D-Skizze |
| Linie über den Mittelpunkt <sub>`sketch_line_midpoint`</sub> | **neu** | Linie aus Mitte |
| Lose Enden <sub>`sketch_loose_ends`</sub> | vorhanden | Säubern zeigt offene Enden |
| Lose Enden verknüpfen <sub>`sketch_loose_ends_tie`</sub> | vorhanden | Säubern |
| Skizzenentitäten verschieben/kopieren <sub>`sketch_move`</sub> | vorhanden | Verschieben/Kopieren |
| 3D-Punkt verschieben <sub>`sketch_move3d`</sub> | vorhanden | 3D-Skizze Punkte bearbeiten |
| Skizzenpunkt ziehen <sub>`sketch_move_point`</sub> | vorhanden | Punkt ziehen |
| Versatzverknüpfung trennen <sub>`sketch_offset_break`</sub> | weggelassen | Versatz bleibt verknüpft |
| Skizzenpalettenoptionen <sub>`sketch_options`</sub> | vorhanden | Einstellungen → Skizze |
| Skizzenelemente einfügen <sub>`sketch_paste`</sub> | **neu** | Strg+V an Mausposition, auch in andere Skizze |
| 3D-Punkt <sub>`sketch_point3d`</sub> | vorhanden | 3D-Skizze |
| Umgeschriebenes Polygon <sub>`sketch_polygon_circumscribed`</sub> | vorhanden | Polygon |
| Polygon über eine Kante <sub>`sketch_polygon_edge`</sub> | teilweise | Polygon über Mitte |
| Eingeschriebenes Polygon <sub>`sketch_polygon_inscribed`</sub> | vorhanden | Polygon |
| Auf Fläche projizieren <sub>`sketch_project_to_surface`</sub> | weggelassen | Freiform |
| Rechteck vom Mittelpunkt <sub>`sketch_rectangle_center`</sub> | vorhanden | Rechteck aus Mitte |
| Abgerundetes Rechteck <sub>`sketch_rectangle_rounded`</sub> | **neu** | Abgerundetes Rechteck mit Radiusmaß |
| 3-Punkt-Rechteck <sub>`sketch_rectangle_three_point`</sub> | vorhanden | Rechteck über 3 Punkte |
| 2-Punkt-Rechteck <sub>`sketch_rectangle_two_point`</sub> | vorhanden | Rechteck |
| Skizzierebene neu definieren <sub>`sketch_redefine`</sub> | teilweise | Skizze neu auf Fläche |
| Mittelpunkt-Bogenschlitz <sub>`sketch_slot_arc_center`</sub> | **neu** | Bogenlangloch |
| 3-Punkt-Bogenschlitz <sub>`sketch_slot_arc_three_point`</sub> | teilweise | Bogenlangloch über Mittelpunkt |
| Mittelpunktschlitz <sub>`sketch_slot_center_point`</sub> | vorhanden | Langloch |
| Schlitz von Mittelpunkt zu Mittelpunkt <sub>`sketch_slot_center_to_center`</sub> | vorhanden | Langloch |
| Gesamtschlitz <sub>`sketch_slot_overall`</sub> | vorhanden | Langloch |
| Einrastinferenz <sub>`sketch_snap`</sub> | vorhanden | Fangen |
| Skizze lösen <sub>`sketch_solve`</sub> | vorhanden | Löser läuft immer |
| 3D-Spline <sub>`sketch_spline3d`</sub> | weggelassen | Freiform im Raum, im Metallbau selten |
| Spline mit Kontrollpunkten <sub>`sketch_spline_control_point`</sub> | vorhanden | Spline |
| Spline mit Kontrollpunkten (Grad 5) <sub>`sketch_spline_control_point_5`</sub> | weggelassen | Grad 3 genügt |
| Spline mit Fitpunkten <sub>`sketch_spline_fit_point`</sub> | teilweise | Gleichungskurve legt Spline durch Punkte |
| Splinepunkt hinzufügen <sub>`sketch_spline_insert_point`</sub> | teilweise | Spline neu zeichnen |
| Splinepunkt entfernen <sub>`sketch_spline_remove_point`</sub> | teilweise | Spline neu zeichnen |
| Splinerichtung umkehren <sub>`sketch_spline_reverse`</sub> | weggelassen | Richtung spielt für Metallbau keine Rolle |
| Gedrehtes Profil <sub>`sketch_spun_profile`</sub> | weggelassen | Drehteile, Drehung genügt |
| Radius / Durchmesser umschalten <sub>`sketch_toggle_diameter`</sub> | vorhanden | Maß Ø/R umschalten |
| Abhängiges Maß umschalten <sub>`sketch_toggle_driven`</sub> | vorhanden | Getriebenes Maß |
| Transformieren <sub>`sketch_transform`</sub> | vorhanden | Verschieben/Drehen/Skalieren |
| Entlang Pfad trimmen <sub>`sketch_trim_path`</sub> | **neu** | Stutzen: über Linien wischen |

### Volumenkörper (16: 10 vorhanden, 2 teilweise, 1 neu, 3 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Auflagefläche <sub>`body.print_face`</sub> | weggelassen | 3D-Druck-Auflagefläche, im Metallbau unnötig |
| Körper umbenennen <sub>`body_rename`</sub> | vorhanden | Feature/Körper umbenennen im Modellbrowser |
| Teil reparieren <sub>`body_repair`</sub> | teilweise | STEP-Import heilt Flächen; kein eigener Reparaturbefehl |
| Fläche löschen <sub>`face_delete`</sub> | vorhanden | Direkt → Löschen |
| Ausrichten <sub>`solid_align`</sub> | vorhanden | Fläche an Fläche (Baugruppe), Verschieben (Bauteil) |
| Begrenzungsfüllung <sub>`solid_boundary_fill`</sub> | weggelassen | Flächenmodellierung |
| Begrenzender Körper <sub>`solid_bounding_solid`</sub> | **neu** | Hüllkörper mit Zugabe, zählt nicht zur Masse |
| Prägen <sub>`solid_emboss`</sub> | vorhanden | Prägen / Gravieren |
| Verschieben/Kopieren <sub>`solid_move`</sub> | vorhanden | Körper verschieben/drehen, als Kopie |
| Fläche versetzen <sub>`solid_offset_face`</sub> | vorhanden | Fläche verschieben / Direkt |
| Drücken/Ziehen <sub>`solid_press_pull`</sub> | vorhanden | Fläche verschieben |
| Entfernen <sub>`solid_remove`</sub> | vorhanden | Körper löschen / Kombinieren |
| Fläche ersetzen <sub>`solid_replace_face`</sub> | vorhanden | Direkt → Ersetzen |
| Rippe <sub>`solid_rib`</sub> | vorhanden | Rippe (Steife) |
| Fläche teilen <sub>`solid_split_face`</sub> | weggelassen | nur für Flächenmodellierung nötig; Körper trennen gibt es |
| Gewebe <sub>`solid_web`</sub> | teilweise | Rippe; Gewebe-Netz als Muster aus Rippen |

### Blech (13: 9 vorhanden, 3 teilweise, 1 neu, 0 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| In Blech umwandeln <sub>`sheet_convert`</sub> | vorhanden | In Blech umwandeln |
| Biegungstabelle exportieren <sub>`sheet_export_bend_table`</sub> | vorhanden | Biegetabelle in Zeichnung/Fertigungsmappe |
| Flachmuster als DXF exportieren <sub>`sheet_export_dxf`</sub> | vorhanden | Abwicklung als DXF |
| Flansch <sub>`sheet_flange`</sub> | vorhanden | Lasche |
| Flachmuster erstellen <sub>`sheet_flat_pattern`</sub> | vorhanden | Abwicklung |
| Falten <sub>`sheet_fold`</sub> | teilweise | Ansicht gefaltet/abgewickelt |
| Umkantung <sub>`sheet_hem`</sub> | vorhanden | Umschlag |
| Blechregeln <sub>`sheet_manage_rules`</sub> | vorhanden | Blechregeln / Biegetabellen |
| Pfadflansch <sub>`sheet_path_flange`</sub> | vorhanden | Konturwalzen / Konturlasche |
| Perforieren <sub>`sheet_perforate`</sub> | **neu** | Lochblech Rv/Rg/Qg/Lv nach DIN 24041, freier Rand, freier Querschnitt |
| Wieder falten <sub>`sheet_refold`</sub> | teilweise | Ansicht gefaltet |
| Blechregeln auflisten <sub>`sheet_rules`</sub> | vorhanden | Blechregeln |
| Entfalten <sub>`sheet_unfold`</sub> | teilweise | Ansicht abgewickelt |

### Flächen (17: 2 vorhanden, 0 teilweise, 0 neu, 15 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Verbindungsfläche <sub>`surface_blend`</sub> | weggelassen | Flächenmodellierung |
| Begrenzungsfläche <sub>`surface_boundary`</sub> | weggelassen | Flächenmodellierung |
| Flächen-Extrusion <sub>`surface_extrude`</sub> | weggelassen | Flächenmodellierung |
| Flächenbegradigung <sub>`surface_fair`</sub> | weggelassen | Flächenmodellierung |
| Flächenverrundung <sub>`surface_fillet`</sub> | weggelassen | Flächenmodellierung |
| Flächen-Loft <sub>`surface_loft`</sub> | weggelassen | Flächenmodellierung |
| Flächenanpassung <sub>`surface_match`</sub> | weggelassen | Flächenmodellierung |
| Offsetfläche <sub>`surface_offset`</sub> | weggelassen | Flächenmodellierung |
| Patch <sub>`surface_patch`</sub> | weggelassen | Flächenmodellierung |
| Normale umkehren <sub>`surface_reverse_normal`</sub> | weggelassen | Flächenmodellierung |
| Flächen-Rotation <sub>`surface_revolve`</sub> | weggelassen | Flächenmodellierung |
| Regelfläche <sub>`surface_ruled`</sub> | vorhanden | Regelkörper |
| Nähen <sub>`surface_stitch`</sub> | weggelassen | Flächenmodellierung |
| Flächen-Sweep <sub>`surface_sweep`</sub> | weggelassen | Flächenmodellierung |
| Dicke vergeben <sub>`surface_thicken`</sub> | vorhanden | Aufdicken |
| Verbund aufheben <sub>`surface_unstitch`</sub> | weggelassen | Flächenmodellierung |
| Trimmen aufheben <sub>`surface_untrim`</sub> | weggelassen | Flächenmodellierung |

### Rahmen und Normteile (8: 8 vorhanden, 0 teilweise, 0 neu, 0 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Rahmenelement <sub>`frame_member`</sub> | vorhanden | Rohr / Profil, Rahmen aus Skizze |
| Profil einfügen <sub>`frame_profile_insert`</sub> | vorhanden | Profilbibliothek DIN/EN |
| Profilbibliothek <sub>`frame_profile_list`</sub> | vorhanden | Profilbibliothek |
| Profileigenschaften <sub>`frame_profile_properties`</sub> | vorhanden | Profilwerte in den Eigenschaften |
| Verbindungselement einfügen <sub>`parts_fastener`</sub> | vorhanden | Normteil / Schraubenverbindung / An Bohrung |
| Bauteil einfügen <sub>`parts_insert`</sub> | vorhanden | Normteil einfügen |
| Standardbauteile <sub>`parts_library`</sub> | vorhanden | Normteil-Bibliothek (36 Familien) |
| Bauteilgröße ändern <sub>`parts_resize`</sub> | vorhanden | Normteilgröße ändern |

### Arbeitselemente (18: 18 vorhanden, 0 teilweise, 0 neu, 0 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Ebene durch Achse und Punkt <sub>`construct.plane.axis_point`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch Kante <sub>`construct_axis_edge`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse senkrecht zur Fläche <sub>`construct_axis_normal_to_face`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch Zylinder/Kegel/Torus <sub>`construct_axis_through_cylinder`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch zwei Ebenen <sub>`construct_axis_two_planes`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Achse durch zwei Punkte <sub>`construct_axis_two_points`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Ebene entlang Pfad <sub>`construct_plane_along_path`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Mittenebene <sub>`construct_plane_midplane`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Rechtebene <sub>`construct_plane_perpendicular`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Tangentialebene <sub>`construct_plane_tangent`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Ebene durch drei Punkte <sub>`construct_plane_three_points`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Ebene durch zwei Kanten <sub>`construct_plane_two_edges`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt entlang Pfad <sub>`construct_point_along_path`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt im Mittelpunkt von Kreis/Kugel/Torus <sub>`construct_point_center`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt an Kante und Ebene <sub>`construct_point_edge_plane`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt aus drei Ebenen <sub>`construct_point_three_planes`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt aus zwei Kanten <sub>`construct_point_two_edges`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |
| Punkt an Scheitelpunkt <sub>`construct_point_vertex`</sub> | vorhanden | Arbeitsebene/-achse/-punkt (Versatz, Winkel, Mitte, 3 Punkte, an Kurve …) |

### Baugruppe und Gelenke (79: 61 vorhanden, 1 teilweise, 0 neu, 17 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Stückliste <sub>`assembly_bom`</sub> | vorhanden | Stückliste (Struktur, Bauteile, Baukasten) |
| Masseeigenschaften <sub>`assembly_mass_properties`</sub> | vorhanden | Masse und Schwerpunkt in den Eigenschaften |
| Komponente aktivieren <sub>`component_activate`</sub> | vorhanden | Bauteil im Kontext bearbeiten |
| Verknüpfung trennen <sub>`component_break_link`</sub> | vorhanden | Komponente unabhängig machen |
| Position erfassen <sub>`component_capture_position`</sub> | vorhanden | Positionsdarstellung |
| Identische Kopien finden <sub>`component_copies`</sub> | vorhanden | Gleichteile (Einzelteile mit Positionsnummern) |
| Körper einfügen <sub>`component_copy_bodies`</sub> | weggelassen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Neue Komponente <sub>`component_create`</sub> | vorhanden | Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Komponentenfarbe wechseln <sub>`component_cycle_color`</sub> | vorhanden | Bauteilfarben |
| Komponente löschen <sub>`component_delete`</sub> | vorhanden | Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| An Ort und Stelle bearbeiten <sub>`component_edit_in_place`</sub> | vorhanden | Bauteil im Kontext bearbeiten |
| In Datei extrahieren <sub>`component_extract`</sub> | vorhanden | Bauteil als eigene Datei speichern |
| Bearbeitung beenden <sub>`component_finish_edit`</sub> | vorhanden | Bauteil im Kontext bearbeiten |
| Komponenten aus Körpern erstellen <sub>`component_from_bodies`</sub> | weggelassen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Konstruktion einfügen <sub>`component_insert_design`</sub> | vorhanden | Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Verknüpfungen auflisten <sub>`component_links`</sub> | vorhanden | Verknüpfte Bauteile, Komponente ersetzen |
| Komponenten auflisten <sub>`component_list`</sub> | vorhanden | Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Teileeigenschaften <sub>`component_metadata`</sub> | vorhanden | Eigenschaften (iProperties) |
| Teileeigenschaften ändern <sub>`component_metadata_set`</sub> | vorhanden | Eigenschaften (iProperties) |
| Körper in Komponente verschieben <sub>`component_move_bodies`</sub> | weggelassen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Merkmale in Komponente verschieben <sub>`component_move_features`</sub> | weggelassen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Skizzen in Komponente verschieben <sub>`component_move_sketches`</sub> | weggelassen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Skizzen in ihre Teile verschieben <sub>`component_move_sketches_to_parts`</sub> | weggelassen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Aus einem anderen Design einfügen <sub>`component_paste_from_design`</sub> | vorhanden | Kopie konstruieren / Teilebibliothek |
| Neu einfügen <sub>`component_paste_new`</sub> | vorhanden | Kopie konstruieren / Teilebibliothek |
| Physikalische Eigenschaften der Komponente <sub>`component_properties`</sub> | vorhanden | Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Quelle neu verknüpfen <sub>`component_relink`</sub> | vorhanden | Verknüpfte Bauteile, Komponente ersetzen |
| Komponente umbenennen <sub>`component_rename`</sub> | vorhanden | Baugruppe: Bauteil platzieren, Modellbrowser, Eigenschaften |
| Durch Verknüpfung ersetzen <sub>`component_replace_with_link`</sub> | vorhanden | Verknüpfte Bauteile, Komponente ersetzen |
| Position zurücksetzen <sub>`component_revert_position`</sub> | vorhanden | Positionsdarstellung |
| Inhalt entsperren <sub>`component_unlock`</sub> | vorhanden | Komponente unabhängig machen |
| Verknüpfungen aktualisieren <sub>`component_update_links`</sub> | vorhanden | Verknüpfte Bauteile, Komponente ersetzen |
| Kontakt prüfen <sub>`contact_check`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Neuer Kontaktsatz <sub>`contact_create`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Kontakt deaktivieren <sub>`contact_disable_all`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Kontaktsatz bearbeiten <sub>`contact_edit`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Alle Kontakte aktivieren <sub>`contact_enable_all`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Kontaktsätze aktivieren <sub>`contact_enable_sets`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Kontaktsätze auflisten <sub>`contact_list`</sub> | vorhanden | Kontaktsatz / Kontaktlöser |
| Explosionsdarstellung <sub>`explode_create`</sub> | vorhanden | Explosion in Schritten |
| Explosionsdarstellung löschen <sub>`explode_delete`</sub> | vorhanden | Explosion |
| Explosionsdarstellungen auflisten <sub>`explode_list`</sub> | vorhanden | Explosion |
| Explosionsdarstellung anzeigen <sub>`explode_show`</sub> | vorhanden | Explosion |
| Fertigungsgelenk <sub>`joint_as_built`</sub> | vorhanden | Abhängigkeit an aktueller Lage |
| Nocken <sub>`joint_cam`</sub> | weggelassen | Getriebetechnik |
| Gelenk <sub>`joint_create`</sub> | vorhanden | Drehgelenk, Abhängigkeiten mit Grenzen |
| Gelenk löschen <sub>`joint_delete`</sub> | vorhanden | Abhängigkeit löschen |
| Gelenke antreiben <sub>`joint_drive`</sub> | vorhanden | Gelenke bewegen (Animation) |
| Gelenk bearbeiten <sub>`joint_edit`</sub> | vorhanden | Abhängigkeit bearbeiten |
| Zahnrad <sub>`joint_gear`</sub> | weggelassen | Getriebetechnik |
| Gelenk prüfen <sub>`joint_inspect`</sub> | vorhanden | Eigenschaften der Abhängigkeit |
| Gelenkgrenzen <sub>`joint_limits`</sub> | vorhanden | Grenzen an Abhängigkeiten |
| Gelenke auflisten <sub>`joint_list`</sub> | vorhanden | Modellbrowser → Abhängigkeiten |
| Bewegungsverknüpfung <sub>`joint_motion_link`</sub> | weggelassen | Getriebetechnik |
| Gelenkursprung <sub>`joint_origin`</sub> | weggelassen | Gelenkursprung ergibt sich aus Achse/Fläche |
| Zahnstange und Ritzel <sub>`joint_rack_pinion`</sub> | weggelassen | Getriebetechnik |
| Punkt anfahren <sub>`joint_reach`</sub> | weggelassen | Robotik-Anfahren |
| Starrgruppe <sub>`joint_rigid_group`</sub> | vorhanden | Unterbaugruppe / Schweißbaugruppe |
| Schraube <sub>`joint_screw`</sub> | weggelassen | Getriebetechnik |
| Gelenke lösen <sub>`joint_solve`</sub> | vorhanden | Baugruppe lösen |
| Gelenk bis zum Kontakt durchfahren <sub>`joint_sweep`</sub> | vorhanden | Kontaktlöser |
| Bewegungsuntersuchung löschen <sub>`motion_delete`</sub> | vorhanden | Animation |
| Bewegungsuntersuchung exportieren <sub>`motion_export`</sub> | vorhanden | Video |
| Bewegungsanimation exportieren <sub>`motion_export_animation`</sub> | vorhanden | Bewegung als Video |
| Kollisionen der Bewegungsuntersuchung <sub>`motion_interference`</sub> | teilweise | Kollision prüfen an gespeicherten Positionen |
| Bewegungsuntersuchungen auflisten <sub>`motion_list`</sub> | vorhanden | Animation |
| Bewegungsuntersuchung abspielen <sub>`motion_play`</sub> | vorhanden | Animation abspielen |
| Diagramm der Bewegungsuntersuchung <sub>`motion_plot`</sub> | weggelassen | Weg-Zeit-Diagramme nicht nötig |
| Bewegungsuntersuchung <sub>`motion_study`</sub> | vorhanden | Gelenke bewegen (Animation) |
| Bewegungsbahn <sub>`motion_trace`</sub> | weggelassen | Bewegungsbahn: vorgemerkt, wenn Tore/Klappen das brauchen |
| Bewegungsbahn bearbeiten <sub>`motion_trace_edit`</sub> | weggelassen | siehe Bewegungsbahn |
| Bewegungsbahn behalten <sub>`motion_trace_keep`</sub> | weggelassen | siehe Bewegungsbahn |
| Instanz ausrichten <sub>`occurrence_align`</sub> | vorhanden | Fläche an Fläche |
| Einfügen (Instanz) <sub>`occurrence_copy`</sub> | vorhanden | Komponente kopieren |
| Instanz ziehen <sub>`occurrence_drag`</sub> | vorhanden | Komponente ziehen |
| Festsetzen <sub>`occurrence_ground`</sub> | vorhanden | Fixiert |
| Instanz verschieben <sub>`occurrence_move`</sub> | vorhanden | Verschieben/Drehen |
| Physikalische Eigenschaften der Instanz <sub>`occurrence_properties`</sub> | vorhanden | Eigenschaften |
| In andere Komponente verschieben <sub>`occurrence_reparent`</sub> | vorhanden | In Unterbaugruppe verschieben |

### Prüfen (17: 6 vorhanden, 1 teilweise, 0 neu, 10 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Zugänglichkeitsanalyse <sub>`inspect_accessibility`</sub> | weggelassen | Werkzeugzugänglichkeit für Fräsen/Spritzguss |
| Massenschwerpunkt <sub>`inspect_center_of_mass`</sub> | vorhanden | Schwerpunkt (Eigenschaften, Gestell) |
| Freiraum <sub>`inspect_clearance`</sub> | vorhanden | Messen → Mindestabstand |
| Komponentenfarben einschalten <sub>`inspect_colored_components`</sub> | vorhanden | Bauteilfarben ein/aus |
| Komponentenfarben ausschalten <sub>`inspect_colored_components_disable`</sub> | vorhanden | Bauteilfarben ein/aus |
| Körper vergleichen <sub>`inspect_compare`</sub> | weggelassen | Versionen nebeneinander öffnen genügt |
| Kontinuitätsprüfung <sub>`inspect_continuity`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |
| Krümmungskamm-Analyse <sub>`inspect_curvature_comb`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |
| Krümmungskartenanalyse <sub>`inspect_curvature_map`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |
| Auswinkelanalyse <sub>`inspect_draft`</sub> | vorhanden | Entformungsanalyse |
| Umgebungskartenanalyse <sub>`inspect_environment_map`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |
| Eingriff <sub>`inspect_interference`</sub> | vorhanden | Kollision prüfen |
| Isokurvenanalyse <sub>`inspect_isocurve`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |
| Mindestradiusanalyse <sub>`inspect_minimum_radius`</sub> | weggelassen | Biegeradius kommt aus der Blechregel |
| Parametervariation <sub>`inspect_parameter_sweep`</sub> | teilweise | Variantentabelle rechnet Varianten durch |
| Silhouette <sub>`inspect_silhouette`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |
| Zebra-Analyse <sub>`inspect_zebra`</sub> | weggelassen | Flächenqualität für Freiform, nicht Metallbau |

### Parameter und Varianten (22: 17 vorhanden, 3 teilweise, 0 neu, 2 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Konfiguration aktivieren <sub>`config_activate`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfigurationsspalte <sub>`config_column`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfigurieren <sub>`config_configure`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfiguration vorschauen <sub>`config_preview`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfigurationszeile <sub>`config_row`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfigurationsregel <sub>`config_rule`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfigurationsregeln <sub>`config_rules`</sub> | vorhanden | Variantentabelle und Regeln |
| Konfigurationstabelle anzeigen <sub>`config_table`</sub> | vorhanden | Variantentabelle und Regeln |
| Ausdruck auswerten <sub>`expr_evaluate`</sub> | vorhanden | Ausdrücke in jedem Zahlenfeld; neu: sinh/cosh/tanh/exp/ln/log/fest/mod |
| Benutzerparameter hinzufügen <sub>`parameters_add`</sub> | vorhanden | Parameter |
| Parameter ändern <sub>`parameters_change`</sub> | vorhanden | Parameter |
| Parameter kommentieren <sub>`parameters_comment`</sub> | vorhanden | Kommentar am Parameter |
| Ausdruck vervollständigen <sub>`parameters_complete`</sub> | teilweise | Parameternamen in Ausdrücken, ohne Vorschlagsliste |
| Parameter löschen <sub>`parameters_delete`</sub> | vorhanden | Parameter |
| Parameter exportieren <sub>`parameters_export`</sub> | vorhanden | Parameterdatei |
| Favorisierter Parameter <sub>`parameters_favorite`</sub> | teilweise | Parameter der Baugruppe / Hauptmaße oben |
| Parametergraph <sub>`parameters_graph`</sub> | weggelassen | Abhängigkeitsgrafik, Liste genügt |
| Parameter importieren <sub>`parameters_import`</sub> | vorhanden | Parameterdatei |
| Parameter auflisten <sub>`parameters_list`</sub> | vorhanden | Parameter |
| Parameter verschieben <sub>`parameters_move`</sub> | weggelassen | Reihenfolge nach Anlage genügt |
| Parameter umbenennen <sub>`parameters_rename`</sub> | vorhanden | Parameter (Ausdrücke werden mitgezogen) |
| Parameterverwendungen <sub>`parameters_users`</sub> | teilweise | Umbenennen zieht Ausdrücke mit; keine Verwendungsliste |

### Verlauf (15: 12 vorhanden, 0 teilweise, 3 neu, 0 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Aufgezeichnetes Merkmal hinzufügen <sub>`timeline_add`</sub> | vorhanden | Makro aufzeichnen |
| Alles berechnen <sub>`timeline_compute_all`</sub> | vorhanden | Neu berechnen (F5) |
| Merkmale kopieren <sub>`timeline_copy`</sub> | vorhanden | Feature kopieren |
| Merkmalsabhängigkeiten <sub>`timeline_dependents`</sub> | vorhanden | Löschen fragt nach Abhängigen; Wo verwendet |
| Befehlsskript exportieren <sub>`timeline_export_script`</sub> | vorhanden | Makros |
| Merkmal prüfen <sub>`timeline_inspect`</sub> | vorhanden | Eigenschaften / Berechnungsprotokoll |
| Merkmale einfügen <sub>`timeline_paste`</sub> | vorhanden | Feature einfügen |
| Verlauf abspielen <sub>`timeline_play`</sub> | **neu** | Verlaufsleiste ▶ (Schritt für Schritt) |
| Merkmal bearbeiten <sub>`timeline_redefine`</sub> | vorhanden | Doppelklick bearbeitet |
| Umbenennen <sub>`timeline_rename`</sub> | vorhanden | Umbenennen |
| Merkmal neu ordnen <sub>`timeline_reorder`</sub> | vorhanden | Ziehen im Modellbrowser |
| Verlaufsmarkierung verschieben <sub>`timeline_roll_to`</sub> | **neu** | Marke in der Verlaufsleiste ziehen (Bauteilende) |
| Zeitleistenmarkierung verschieben <sub>`timeline_rollback`</sub> | vorhanden | Bauteilende |
| Verlauf anhalten <sub>`timeline_stop`</sub> | **neu** | Verlaufsleiste |
| Merkmal unterdrücken <sub>`timeline_suppress`</sub> | vorhanden | Unterdrücken |

### Datei und Dokument (56: 30 vorhanden, 2 teilweise, 2 neu, 22 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Zeichenfläche kalibrieren <sub>`canvas_calibrate`</sub> | teilweise | Bild über Maß skalieren |
| Dekal <sub>`canvas_decal`</sub> | weggelassen | Aufkleber fürs Rendern, im Metallbau unnötig |
| Zeichenfläche löschen <sub>`canvas_delete`</sub> | vorhanden | Bild löschen |
| Zeichenfläche bearbeiten <sub>`canvas_edit`</sub> | vorhanden | Bild in der Skizze verschieben/skalieren |
| Zeichenfläche <sub>`canvas_insert`</sub> | vorhanden | Skizze: Bild einfügen |
| Skizze aus Zeichenfläche <sub>`canvas_to_sketch`</sub> | weggelassen | automatisches Nachzeichnen unzuverlässig; DXF/SVG-Import nehmen |
| Konstruktion wiederherstellen <sub>`doc_recover`</sub> | vorhanden | Wiederherstellung nach Absturz |
| Wiederhergestellte Konstruktion verwerfen <sub>`doc_recovery_discard`</sub> | vorhanden | Wiederherstellung verwerfen |
| Wiederherstellbare Konstruktionen <sub>`doc_recovery_list`</sub> | vorhanden | Wiederherstellung |
| Konstruktion prüfen <sub>`document_inspect`</sub> | vorhanden | Problemliste |
| Konstruktionseigenschaften <sub>`document_metadata`</sub> | vorhanden | Eigenschaften (iProperties, AW3) |
| Konstruktionseigenschaft entfernen <sub>`document_metadata_remove`</sub> | vorhanden | Eigenschaften |
| Konstruktionseigenschaften ändern <sub>`document_metadata_set`</sub> | vorhanden | Eigenschaften |
| Konstruktionsrevision <sub>`document_revision`</sub> | vorhanden | Versionen / Revision im Schriftfeld |
| Einheiten der Konstruktion ändern <sub>`document_units`</sub> | weggelassen | Metallbau rechnet in mm; Zoll in Ausdrücken möglich (2 in) |
| Prüfpunkt <sub>`edit_checkpoint`</sub> | vorhanden | Version speichern |
| Letzten Befehl wiederholen <sub>`edit_repeat`</sub> | vorhanden | Nochmal (PR #187) |
| Prüfpunkt wiederherstellen <sub>`edit_restore_checkpoint`</sub> | vorhanden | Versionen |
| Als 3MF exportieren <sub>`file.export_3mf`</sub> | **neu** | Export → 3MF (3D-Druck, mm, Farben) |
| Als OBJ exportieren <sub>`file.export_obj`</sub> | **neu** | Export → OBJ (Netz mit Farben) |
| Als STEP exportieren <sub>`file.export_step`</sub> | vorhanden | STEP |
| Als STL exportieren <sub>`file.export_stl`</sub> | vorhanden | STL |
| Als URDF exportieren <sub>`file.export_urdf`</sub> | weggelassen | Robotik-Format |
| Exportieren <sub>`file_export`</sub> | vorhanden | Export-Reiter |
| Netz einfügen <sub>`file_insert_mesh`</sub> | vorhanden | STL einfügen |
| STEP einfügen <sub>`file_insert_step`</sub> | vorhanden | STEP einfügen |
| Mit EasyPrint öffnen <sub>`file_open_in_easyprint`</sub> | weggelassen | fremdes Druckprogramm |
| Als Netz speichern <sub>`file_save_mesh`</sub> | vorhanden | STL / OBJ / 3MF |
| An Slicer senden <sub>`file_send_to_slicer`</sub> | weggelassen | 3MF speichern und im Slicer öffnen genügt |
| Installierte Slicer <sub>`file_slicers`</sub> | weggelassen | siehe Slicer |
| Lokalen Bibliothekseintrag anwenden <sub>`library_apply`</sub> | vorhanden | Teilebibliothek |
| Designbibliothek exportieren <sub>`library_export`</sub> | vorhanden | Teilebibliothek |
| Lokale Bibliothek prüfen <sub>`library_inspect`</sub> | vorhanden | Teilebibliothek |
| Physikalisches Material <sub>`material_assign`</sub> | vorhanden | Werkstoff am Bauteil |
| Neues physikalisches Material <sub>`material_create`</sub> | vorhanden | Eigene Werkstoffe |
| Physisches Material löschen <sub>`material_delete`</sub> | vorhanden | Eigene Werkstoffe |
| Physisches Material bearbeiten <sub>`material_edit`</sub> | vorhanden | Eigene Werkstoffe |
| Physikalisches Material prüfen <sub>`material_inspect`</sub> | vorhanden | Werkstoffwerte |
| Materialien auflisten <sub>`material_list`</sub> | vorhanden | Werkstoffliste |
| Richtungsabhängiger Elastizitätsmodul <sub>`material_properties_directional`</sub> | weggelassen | nur für Verbundwerkstoffe |
| Physikalische Materialdaten prüfen <sub>`material_properties_validate`</sub> | vorhanden | Prüfung beim Speichern |
| Netz konvertieren <sub>`mesh_convert`</sub> | weggelassen | Netz in Volumenkörper wandeln, im Metallbau selten |
| Kanten auflisten <sub>`model_edges`</sub> | weggelassen | Skript-Abfrage |
| Flächen auflisten <sub>`model_faces`</sub> | weggelassen | Skript-Abfrage |
| Gewinde auflisten <sub>`model_threads`</sub> | teilweise | Gewinde stehen in Bohrungstabelle und Stückliste |
| Kunststoffregel zuweisen <sub>`plastic_assign_rule`</sub> | weggelassen | Kunststoffteile |
| Ansatz <sub>`plastic_boss`</sub> | weggelassen | Kunststoffteile |
| Lippe <sub>`plastic_lip`</sub> | weggelassen | Kunststoffteile |
| Kunststoffregeln verwalten <sub>`plastic_manage_rules`</sub> | weggelassen | Kunststoffteile |
| Auflage <sub>`plastic_rest`</sub> | weggelassen | Kunststoffteile |
| Kunststoffregeln auflisten <sub>`plastic_rules`</sub> | weggelassen | Kunststoffteile |
| Rastverbindung <sub>`plastic_snap_fit`</sub> | weggelassen | Kunststoffteile |
| Punktwolke löschen <sub>`pointcloud_delete`</sub> | weggelassen | Punktwolken / Scan |
| Punktwolke bearbeiten <sub>`pointcloud_edit`</sub> | weggelassen | Punktwolken / Scan |
| Punktwolke einfügen <sub>`pointcloud_insert`</sub> | weggelassen | Punktwolken / Scan |
| Punktwolken <sub>`pointcloud_list`</sub> | weggelassen | Punktwolken / Scan |

### Ansicht und Oberfläche (81: 59 vorhanden, 0 teilweise, 1 neu, 21 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Alles einklappen <sub>`browser_collapse_all`</sub> | vorhanden | Modellbrowser |
| Alles ausklappen <sub>`browser_expand_all`</sub> | vorhanden | Modellbrowser |
| Neue Gruppe <sub>`browser_group`</sub> | vorhanden | Ordner im Modellbrowser (B3) |
| Browser-Elemente verschieben <sub>`browser_move`</sub> | vorhanden | Ziehen im Modellbrowser |
| Browser-Elemente ordnen <sub>`browser_order`</sub> | vorhanden | Ziehen im Modellbrowser |
| Gruppe umbenennen <sub>`browser_rename_group`</sub> | vorhanden | Ordner umbenennen |
| In andere Komponente verschieben <sub>`browser_reparent`</sub> | vorhanden | In Unterbaugruppe verschieben |
| Gruppierung aufheben <sub>`browser_ungroup`</sub> | vorhanden | Ordner auflösen |
| Ein-/Ausblenden <sub>`browser_visibility`</sub> | vorhanden | Sichtbarkeit im Modellbrowser |
| Absturzbericht <sub>`diagnostics_crash_report`</sub> | weggelassen | Entwickler-Werkzeug |
| Absturzberichte <sub>`diagnostics_crash_reports`</sub> | weggelassen | Entwickler-Werkzeug |
| Absturzberichte löschen <sub>`diagnostics_crash_reports_clear`</sub> | weggelassen | Entwickler-Werkzeug |
| Absturztest <sub>`diagnostics_crash_test`</sub> | weggelassen | Entwickler-Werkzeug |
| Profil <sub>`diagnostics_profile`</sub> | weggelassen | Entwickler-Werkzeug |
| Prüfung <sub>`diagnostics_validation`</sub> | vorhanden | Problemliste |
| Befehle auflisten <sub>`engine_commands`</sub> | vorhanden | Befehl suchen (Strg+K) |
| Befehl beschreiben <sub>`engine_describe`</sub> | vorhanden | Befehlshilfe im Tooltip |
| Layout anwenden <sub>`layout.apply`</sub> | vorhanden | Panels anordnen (Einstellungen → Anordnung) |
| Layout prüfen <sub>`layout.get`</sub> | vorhanden | Panels anordnen (Einstellungen → Anordnung) |
| Layout zurücksetzen <sub>`layout.reset`</sub> | vorhanden | Panels anordnen (Einstellungen → Anordnung) |
| Layout speichern <sub>`layout.save`</sub> | vorhanden | Panels anordnen (Einstellungen → Anordnung) |
| Layout-Arbeitsbereich auswählen <sub>`layout.workspace.select`</sub> | vorhanden | Arbeitsbereiche |
| Panel-Registerkarte aktivieren <sub>`panel.activate`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel schließen <sub>`panel.close`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel-Bereich einklappen <sub>`panel.collapse`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel-Vorschau schließen <sub>`panel.dismiss`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel frei platzieren <sub>`panel.float`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel fokussieren <sub>`panel.focus`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panels auflisten <sub>`panel.list`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel verschieben <sub>`panel.move`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Nativen Panel-Bereich wieder andocken <sub>`panel.native_close`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel öffnen <sub>`panel.open`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Eingeklapptes Panel anzeigen <sub>`panel.peek`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel in eigenes Fenster verschieben <sub>`panel.popout`</sub> | weggelassen | ein Fenster genügt |
| Panel-Trennlinie zurücksetzen <sub>`panel.reset_pair`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel-Bereich skalieren <sub>`panel.resize`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Panel-Trennlinie verschieben <sub>`panel.resize_pair`</sub> | vorhanden | Panels andocken, Breite ziehen, einklappen |
| Auswahl aufheben <sub>`select_clear`</sub> | vorhanden | Esc |
| Einstellungsprofil anwenden <sub>`settings_profile_apply`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil löschen <sub>`settings_profile_delete`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil exportieren <sub>`settings_profile_export`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil importieren <sub>`settings_profile_import`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofile <sub>`settings_profile_list`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil umbenennen <sub>`settings_profile_rename`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil speichern <sub>`settings_profile_save`</sub> | weggelassen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Assistenten ein-/ausblenden <sub>`ui.assistant`</sub> | weggelassen | KI-Assistent; Claude arbeitet außerhalb der App |
| Eigener Ansichtsnavigator <sub>`view.navigator`</sub> | vorhanden | Ansichtswürfel |
| Render-Browser <sub>`view.render_browser`</sub> | weggelassen | Render-Studio |
| Render-Panel verschieben <sub>`view.render_dock`</sub> | weggelassen | Render-Studio |
| Render-Fokusansicht <sub>`view.render_focus`</sub> | weggelassen | Render-Studio |
| Statusdetails des Ansichtsfensters <sub>`view.status_details`</sub> | vorhanden | Statuszeile |
| Ansichtsstatus-Elemente <sub>`view.status_items`</sub> | vorhanden | Statuszeile |
| Umgebungsverdeckung <sub>`view_ambient_occlusion`</sub> | vorhanden | Darstellung fotorealistisch |
| Ansichtswinkel <sub>`view_angle_readout`</sub> | weggelassen | Kamerawinkel braucht man nicht |
| Benannte Ansicht wiederherstellen <sub>`view_apply`</sub> | vorhanden | Gespeicherte Ansichten |
| Rückansicht <sub>`view_back`</sub> | vorhanden | Ansicht Hinten |
| Untersicht <sub>`view_bottom`</sub> | vorhanden | Ansicht Unten |
| Benannte Ansicht löschen <sub>`view_delete`</sub> | vorhanden | Gespeicherte Ansichten |
| Ansicht einpassen <sub>`view_fit`</sub> | vorhanden | Alles zeigen (F6) |
| Vorderansicht <sub>`view_front`</sub> | vorhanden | Ansicht Vorne |
| Grafikprofil <sub>`view_graphics_preset`</sub> | vorhanden | Einstellungen → Darstellung |
| Raster <sub>`view_grid`</sub> | vorhanden | Raster |
| Bodenschatten <sub>`view_ground_shadow`</sub> | vorhanden | Bodenschatten |
| Startansicht <sub>`view_home`</sub> | vorhanden | Iso / Ansichtswürfel Haus |
| Isometrische Ansicht <sub>`view_isometric`</sub> | vorhanden | Ansicht Iso |
| Linke Seitenansicht <sub>`view_left`</sub> | vorhanden | Ansicht Links |
| Benannte Ansichten auflisten <sub>`view_list`</sub> | vorhanden | Gespeicherte Ansichten |
| Ansicht navigieren <sub>`view_navigate`</sub> | vorhanden | Maus/Tastatur |
| Navigationsleiste <sub>`view_navigation_bar`</sub> | **neu** | Navigationspille unten rechts |
| Nächster Tab <sub>`view_next_tab`</sub> | vorhanden | Dokument-Reiter in der Kopfleiste |
| Senkrecht zur Auswahl <sub>`view_normal_to`</sub> | vorhanden | Normal zur Fläche |
| Vorheriger Tab <sub>`view_previous_tab`</sub> | vorhanden | Dokument-Reiter |
| Benannte Ansicht umbenennen <sub>`view_rename`</sub> | vorhanden | Gespeicherte Ansichten |
| Render-Bildhilfen <sub>`view_render_frame`</sub> | weggelassen | Render-Studio |
| Rechte Seitenansicht <sub>`view_right`</sub> | vorhanden | Ansicht Rechts |
| Neue benannte Ansicht <sub>`view_save`</sub> | vorhanden | Ansicht speichern |
| Aufnahmenleiste <sub>`view_shots_strip`</sub> | weggelassen | Render-Studio |
| Ansicht kontinuierlich drehen <sub>`view_spin`</sub> | weggelassen | Dauerdrehen nur Präsentation; Video gibt es |
| Navigationswerkzeug <sub>`view_tool`</sub> | vorhanden | Orbit/Pan/Zoom |
| Draufsicht <sub>`view_top`</sub> | vorhanden | Ansicht Oben |
| Darstellungsstil <sub>`view_visual_style`</sub> | vorhanden | Darstellung schattiert/Kanten/Draht/transparent/foto |

### Rendern und Aussehen (68: 7 vorhanden, 0 teilweise, 0 neu, 61 weggelassen)

| SolidCraft | Stand | PBCAD bzw. Grund |
|---|---|---|
| Erscheinungsbild <sub>`appearance_assign`</sub> | vorhanden | Oberfläche und RAL-Farbe am Bauteil |
| Aussehen-Herkunft <sub>`appearance_chain`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Look kopieren <sub>`appearance_copy`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Look favorisieren <sub>`appearance_favorite`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Erscheinungsbild-Bibliothek <sub>`appearance_library`</sub> | vorhanden | RAL-Liste, Oberflächen, Werkstoffe |
| Erscheinungsbilder auflisten <sub>`appearance_list`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Aussehen aufmalen <sub>`appearance_paint`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Look einfügen <sub>`appearance_paste`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Aussehen aufnehmen <sub>`appearance_pick_up`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Erscheinungsbild ersetzen <sub>`appearance_replace`</sub> | weggelassen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Render-Vergleichstrenner verschieben <sub>`render.compare.divider`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderergebnis verwerfen <sub>`render.result.discard`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderergebnis auswählen <sub>`render.result.select`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Mehrschichtige Oberflächenalterung <sub>`render_aging_describe`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Backends <sub>`render_backends`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Alle Aufnahmen rendern <sub>`render_batch`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderobjekt einpassen <sub>`render_camera_fit`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderkamera prüfen <sub>`render_camera_get`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Rendering abbrechen <sub>`render_cancel`</sub> | vorhanden | Rendern (fotorealistisches PNG) |
| Bilder vergleichen <sub>`render_compare`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Objektiv- und Kreativeffekte <sub>`render_effects_describe`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| PNG exportieren <sub>`render_export`</sub> | vorhanden | Rendern (fotorealistisches PNG) |
| HDR-Quelle untersuchen <sub>`render_hdr_inspect`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Opakes Bibliotheksaussehen anwenden <sub>`render_library_appearance_apply`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Ressource untersuchen <sub>`render_library_describe`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Integrierte HDR-Umgebung anwenden <sub>`render_library_environment_apply`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Bibliothek durchsuchen <sub>`render_library_list`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Prepare Physical Reference <sub>`render_library_physical_prepare`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Originale Oberflächentextur anzeigen <sub>`render_library_preview`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Erstellte Studiolichter anwenden <sub>`render_library_studio_apply`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Erstellte Studiolichter vorbereiten <sub>`render_library_studio_prepare`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Save Surface Binding <sub>`render_library_surface_bind`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Erstellte Oberflächenmaps vorbereiten <sub>`render_library_surface_prepare`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Remove Surface Binding <sub>`render_library_surface_unbind`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Ziele für Render-Ressourcen suchen <sub>`render_library_targets`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Licht hinzufügen <sub>`render_lights_add`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Licht duplizieren <sub>`render_lights_duplicate`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Lichter auflisten <sub>`render_lights_list`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Licht stummschalten <sub>`render_lights_mute`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Licht entfernen <sub>`render_lights_remove`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Licht einstellen <sub>`render_lights_set`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Licht allein anzeigen <sub>`render_lights_solo`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Optische Einstellungen zuweisen <sub>`render_optics_bind`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Zuweisung optischer Einstellungen entfernen <sub>`render_optics_unbind`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Ausgabegröße festlegen <sub>`render_output_size`</sub> | vorhanden | Rendern (fotorealistisches PNG) |
| Renderanfrage prüfen <sub>`render_preflight`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Prüfbericht kopieren <sub>`render_preflight_copy`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Studio-Voreinstellung anwenden <sub>`render_preset_apply`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Studio-Voreinstellung überprüfen <sub>`render_preset_resolve`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Festes Sampling-Budget überprüfen <sub>`render_quality_prepare`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderbild schließen <sub>`render_result_close`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderbild kopieren <sub>`render_result_copy`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Angezeigtes Render-Ergebnis behalten <sub>`render_result_pin`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Lineares Master-Rendering erneut farbkorrigieren <sub>`render_result_regrade`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderbild anzeigen <sub>`render_result_view`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderszene prüfen <sub>`render_scene`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderkamera anwenden <sub>`render_settings_apply`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Einstellungen mit HDR speichern <sub>`render_settings_capture_hdr`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Rendereinstellungen <sub>`render_settings_get`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Rendereinstellungen speichern <sub>`render_settings_set`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Aufnahme duplizieren <sub>`render_shot_duplicate`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Aufnahme entfernen <sub>`render_shot_remove`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Aufnahme umbenennen <sub>`render_shot_rename`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Physischen Renderhintergrund speichern <sub>`render_stage_backdrop`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Remove Render Stage <sub>`render_stage_clear`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Save Render Ground <sub>`render_stage_ground`</sub> | weggelassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Bild rendern <sub>`render_start`</sub> | vorhanden | Rendern (fotorealistisches PNG) |
| Renderfortschritt <sub>`render_status`</sub> | vorhanden | Rendern (fotorealistisches PNG) |

## Nachtrag 04.11.2026 20:28: Patrick »Alle Befehle Funktionen einbauen, rendern erst komplett weglassen«

Rendern (Render-Studio, Looks, Dekal, Render-Panels und -Bildhilfen) bleibt ganz weg. Alles andere wird in Etappen nachgebaut, auch die »teilweise«-Befehle:

| Etappe | Inhalt |
|---|---|
| E1 Skizze | Übergangskurve, Schnittkurve, isoparametrische Kurve, auf Fläche projizieren, 3D-Spline, Spline Grad 5, Spline umkehren, Splinepunkt einfügen/entfernen, Spline durch Punkte, gedrehtes Profil, Netzquerschnitt, Versatz lösen, mit Auto-Bedingung fertig, Zeichnungsgröße, Kettenwahl, Tangente an Kurvenpunkt, 2-Tangenten-Kreis, 3-Punkt-Bogenlangloch, Polygon über Kante, Fase Abstand/Winkel, Ausschneiden, Gleichungskurve bearbeiten |
| E2 Flächen und Körper | Flächen-Extrusion/-Rotation/-Sweep/-Loft, Regelfläche, Offsetfläche, Patch, Nähen/Verbund aufheben, Normale umkehren, Trimmen aufheben, Flächenverrundung, Verbindungs-/Begrenzungsfläche, Begrenzungsfüllung, Fläche teilen, Auflagefläche |
| E3 Baugruppe und Bewegung | Komponenten aus Körpern, Körper/Features/Skizzen in Komponente verschieben, Kopplungen Zahnrad/Zahnstange/Schraube/Nocken/Bewegungsverknüpfung, Gelenkursprung, Punkt anfahren, Bewegungsbahn, Weg-Zeit-Diagramm |
| E4 Prüfen | Zebra, Krümmungskamm/-karte, Isokurven, Silhouette, Umgebungskarte, Kontinuität, Mindestradius, Zugänglichkeit, Körper vergleichen |
| E5 Datei und Daten | Einheiten, URDF, an Slicer senden, Netz in Körper, Kanten/Flächen auflisten, Kunststoffteile (Ansatz, Lippe, Auflage, Rastverbindung, Regeln), Punktwolken, Bild nachzeichnen, richtungsabhängiger E-Modul |
| E6 Oberfläche | Einstellungsprofile, Absturzberichte, Leistungsprofil, Panel in eigenes Fenster, Ansichtswinkel, Dauerdrehen, Parametergraph, Parameter verschieben |

### Stand E1 (04.11.2026, PR #198)

Umgesetzt: Übergangskurve, Tangente an Kurvenpunkt, Kreis an zwei Linien, Bogenlangloch über 3 Punkte, Polygon über Kante, Polygon umschrieben, Spline Grad 5, Spline durch Punkte, Spline umkehren, Splinepunkt einfügen/entfernen, Versatz lösen, Zeichnungsrahmen. Kettenwahl war schon da (Doppelklick wählt die verbundene Kette). Test: test/skizze-e1.test.mjs.

E1 Teil 2 (04.11.2026, nächster PR): Schnittkurve (Kern, Skizzenebene durch die Körper), Netzquerschnitt (Anzeigenetz, auch STL), gedrehtes Profil (Körper um gewählte Linie gedreht, halbes Drehprofil), Kurve auf Fläche (neues Feature: Isokurve u/v oder Skizze auf Fläche projiziert, als Sweep-Pfad nutzbar), 3D-Spline (3D-Skizze »Als Spline«, Sweep mit korrigiertem Frenet), Auto-Bedingungen und »Skizze fertig mit Auto-Bedingungen« (Befehlssuche), Fase Abstand + Winkel (»5;30°«), Strg+X Ausschneiden, Doppelklick bearbeitet Gleichungskurve. Damit ist E1 vollständig.

### Oberfläche L1–L6 (04.11.2026, PR #198)

Arbeitsbereich-Kachel links neben dem Menüband, Menüband als Karte, Gruppenname öffnet Befehlsliste mit Anheften an den Schnellzugriff, Navigationswerkzeuge Drehen/Schieben/Zoomen und Ansichten-Menü in der Leiste unten rechts, Schild »bearbeiten« über dem gewählten Feature in der Verlaufsleiste. Vorher/nachher-Bilder: optik/solidcraft/.
