# SolidCraft-Befehle, die PBCAD bewusst weglässt

Stand 04.11.2026. Aus dem Abgleich aller 504 SolidCraft-Befehle (volle Tabelle: plan/solidcraft-abgleich.md).
Darunter die 25 nur teilweise vorhandenen Befehle.

> **Nachtrag 04.11.2026:** Patrick will alle Befehle außer Rendern. Inzwischen nachgebaut (PR #198, #200): die ganze Skizzen-Liste, alle Volumenkörper-Befehle außer Auflagefläche (kommt mit dem Slicer in E5), alle Flächen-Befehle außer **Flächenbegradigung** und **Flächenanpassung** (bleiben weg, im Kern fehlt ein stabiler Weg), die ganze Liste »Baugruppe und Gelenke« (Körper einfügen = abgeleitetes Bauteil, Komponenten aus Körpern = Skelett BG12, Verschieben = »In Bauteil verschieben…«). Die Tabellen unten zeigen den Stand vor dem Nachbau; der laufende Stand steht in solidcraft-abgleich.md unter »Stand E1/E2/E3«.

## Weggelassen (163)

### Skizze (12)

| Befehl | Grund |
|---|---|
| Übergangskurve | Freiform |
| Zeichnungsgröße | Zeichnungsgröße braucht die Skizze nicht |
| Mit Auto-Bedingung fertigstellen | Vollständig bemaßen vor Fertig |
| Kurven an Netzquerschnitt anpassen | Netzrückführung |
| Schnittkurve | Flächen-Schnittkurven, Freiform |
| Isoparametrische Kurve | Freiform |
| Versatzverknüpfung trennen | Versatz bleibt verknüpft |
| Auf Fläche projizieren | Freiform |
| 3D-Spline | Freiform im Raum, im Metallbau selten |
| Spline mit Kontrollpunkten (Grad 5) | Grad 3 genügt |
| Splinerichtung umkehren | Richtung spielt für Metallbau keine Rolle |
| Gedrehtes Profil | Drehteile, Drehung genügt |

### Volumenkörper (3)

| Befehl | Grund |
|---|---|
| Auflagefläche | 3D-Druck-Auflagefläche, im Metallbau unnötig |
| Begrenzungsfüllung | Flächenmodellierung |
| Fläche teilen | nur für Flächenmodellierung nötig; Körper trennen gibt es |

### Flächen (15)

| Befehl | Grund |
|---|---|
| Verbindungsfläche | Flächenmodellierung |
| Begrenzungsfläche | Flächenmodellierung |
| Flächen-Extrusion | Flächenmodellierung |
| Flächenbegradigung | Flächenmodellierung |
| Flächenverrundung | Flächenmodellierung |
| Flächen-Loft | Flächenmodellierung |
| Flächenanpassung | Flächenmodellierung |
| Offsetfläche | Flächenmodellierung |
| Patch | Flächenmodellierung |
| Normale umkehren | Flächenmodellierung |
| Flächen-Rotation | Flächenmodellierung |
| Nähen | Flächenmodellierung |
| Flächen-Sweep | Flächenmodellierung |
| Verbund aufheben | Flächenmodellierung |
| Trimmen aufheben | Flächenmodellierung |

### Baugruppe und Gelenke (17)

| Befehl | Grund |
|---|---|
| Körper einfügen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Komponenten aus Körpern erstellen | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Körper in Komponente verschieben | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Merkmale in Komponente verschieben | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Skizzen in Komponente verschieben | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Skizzen in ihre Teile verschieben | Fusion-Arbeitsweise; PBCAD trennt Bauteile wie Inventor, Mehrkörper → Einzelteile |
| Nocken | Getriebetechnik |
| Zahnrad | Getriebetechnik |
| Bewegungsverknüpfung | Getriebetechnik |
| Gelenkursprung | Gelenkursprung ergibt sich aus Achse/Fläche |
| Zahnstange und Ritzel | Getriebetechnik |
| Punkt anfahren | Robotik-Anfahren |
| Schraube | Getriebetechnik |
| Diagramm der Bewegungsuntersuchung | Weg-Zeit-Diagramme nicht nötig |
| Bewegungsbahn | Bewegungsbahn: vorgemerkt, wenn Tore/Klappen das brauchen |
| Bewegungsbahn bearbeiten | siehe Bewegungsbahn |
| Bewegungsbahn behalten | siehe Bewegungsbahn |

### Prüfen (10)

| Befehl | Grund |
|---|---|
| Zugänglichkeitsanalyse | Werkzeugzugänglichkeit für Fräsen/Spritzguss |
| Körper vergleichen | Versionen nebeneinander öffnen genügt |
| Kontinuitätsprüfung | Flächenqualität für Freiform, nicht Metallbau |
| Krümmungskamm-Analyse | Flächenqualität für Freiform, nicht Metallbau |
| Krümmungskartenanalyse | Flächenqualität für Freiform, nicht Metallbau |
| Umgebungskartenanalyse | Flächenqualität für Freiform, nicht Metallbau |
| Isokurvenanalyse | Flächenqualität für Freiform, nicht Metallbau |
| Mindestradiusanalyse | Biegeradius kommt aus der Blechregel |
| Silhouette | Flächenqualität für Freiform, nicht Metallbau |
| Zebra-Analyse | Flächenqualität für Freiform, nicht Metallbau |

### Parameter und Varianten (2)

| Befehl | Grund |
|---|---|
| Parametergraph | Abhängigkeitsgrafik, Liste genügt |
| Parameter verschieben | Reihenfolge nach Anlage genügt |

### Datei und Dokument (22)

| Befehl | Grund |
|---|---|
| Dekal | Aufkleber fürs Rendern, im Metallbau unnötig |
| Skizze aus Zeichenfläche | automatisches Nachzeichnen unzuverlässig; DXF/SVG-Import nehmen |
| Einheiten der Konstruktion ändern | Metallbau rechnet in mm; Zoll in Ausdrücken möglich (2 in) |
| Als URDF exportieren | Robotik-Format |
| Mit EasyPrint öffnen | fremdes Druckprogramm |
| An Slicer senden | 3MF speichern und im Slicer öffnen genügt |
| Installierte Slicer | siehe Slicer |
| Richtungsabhängiger Elastizitätsmodul | nur für Verbundwerkstoffe |
| Netz konvertieren | Netz in Volumenkörper wandeln, im Metallbau selten |
| Kanten auflisten | Skript-Abfrage |
| Flächen auflisten | Skript-Abfrage |
| Kunststoffregel zuweisen | Kunststoffteile |
| Ansatz | Kunststoffteile |
| Lippe | Kunststoffteile |
| Kunststoffregeln verwalten | Kunststoffteile |
| Auflage | Kunststoffteile |
| Kunststoffregeln auflisten | Kunststoffteile |
| Rastverbindung | Kunststoffteile |
| Punktwolke löschen | Punktwolken / Scan |
| Punktwolke bearbeiten | Punktwolken / Scan |
| Punktwolke einfügen | Punktwolken / Scan |
| Punktwolken | Punktwolken / Scan |

### Ansicht und Oberfläche (21)

| Befehl | Grund |
|---|---|
| Absturzbericht | Entwickler-Werkzeug |
| Absturzberichte | Entwickler-Werkzeug |
| Absturzberichte löschen | Entwickler-Werkzeug |
| Absturztest | Entwickler-Werkzeug |
| Profil | Entwickler-Werkzeug |
| Panel in eigenes Fenster verschieben | ein Fenster genügt |
| Einstellungsprofil anwenden | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil löschen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil exportieren | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil importieren | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofile | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil umbenennen | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Einstellungsprofil speichern | Einstellungen liegen im Benutzerordner; Profile nicht nötig |
| Assistenten ein-/ausblenden | KI-Assistent; Claude arbeitet außerhalb der App |
| Render-Browser | Render-Studio |
| Render-Panel verschieben | Render-Studio |
| Render-Fokusansicht | Render-Studio |
| Ansichtswinkel | Kamerawinkel braucht man nicht |
| Render-Bildhilfen | Render-Studio |
| Aufnahmenleiste | Render-Studio |
| Ansicht kontinuierlich drehen | Dauerdrehen nur Präsentation; Video gibt es |

### Rendern und Aussehen (61)

| Befehl | Grund |
|---|---|
| Aussehen-Herkunft | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Look kopieren | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Look favorisieren | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Erscheinungsbilder auflisten | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Aussehen aufmalen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Look einfügen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Aussehen aufnehmen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Erscheinungsbild ersetzen | Render-Looks; Farbe kommt aus Oberfläche/RAL des Bauteils |
| Render-Vergleichstrenner verschieben | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderergebnis verwerfen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderergebnis auswählen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Mehrschichtige Oberflächenalterung | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Backends | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Alle Aufnahmen rendern | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderobjekt einpassen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderkamera prüfen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Bilder vergleichen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Objektiv- und Kreativeffekte | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| HDR-Quelle untersuchen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Opakes Bibliotheksaussehen anwenden | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Ressource untersuchen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Integrierte HDR-Umgebung anwenden | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Bibliothek durchsuchen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Prepare Physical Reference | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Originale Oberflächentextur anzeigen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Erstellte Studiolichter anwenden | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Erstellte Studiolichter vorbereiten | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Save Surface Binding | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Erstellte Oberflächenmaps vorbereiten | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Remove Surface Binding | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Ziele für Render-Ressourcen suchen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Licht hinzufügen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Licht duplizieren | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Lichter auflisten | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Licht stummschalten | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Licht entfernen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Licht einstellen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Licht allein anzeigen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Optische Einstellungen zuweisen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Zuweisung optischer Einstellungen entfernen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderanfrage prüfen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Prüfbericht kopieren | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Studio-Voreinstellung anwenden | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Studio-Voreinstellung überprüfen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Festes Sampling-Budget überprüfen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderbild schließen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderbild kopieren | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Angezeigtes Render-Ergebnis behalten | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Lineares Master-Rendering erneut farbkorrigieren | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderbild anzeigen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderszene prüfen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Renderkamera anwenden | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Einstellungen mit HDR speichern | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Rendereinstellungen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Rendereinstellungen speichern | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Aufnahme duplizieren | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Aufnahme entfernen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Render-Aufnahme umbenennen | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Physischen Renderhintergrund speichern | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Remove Render Stage | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |
| Save Render Ground | Render-Studio (Lichter, HDR, Aufnahmen); PBCAD rendert mit festem Studio |

## Nur teilweise vorhanden (25)

| Bereich | Befehl | Was PBCAD stattdessen hat |
|---|---|---|
| Skizze | Tangente an Kurvenpunkt | Linie + tangential-Abhängigkeit |
| Skizze | 3D-Bogen | 3D-Skizze: Punktzug mit Biegeradien |
| Skizze | Kette | Konturen erkennt PBCAD selbst; Fenster-/Kreuzwahl statt Kettenwahl |
| Skizze | Abschrägung mit Abstand und Winkel | Skizzenfase gleich/zwei Abstände |
| Skizze | 2-Tangenten-Kreis | Skizzenrundung zwischen zwei Linien |
| Skizze | Skizzenelemente ausschneiden | Strg+C, dann Entf |
| Skizze | Gleichungskurve bearbeiten | neu einfügen; Formel bleibt im Dialog gemerkt |
| Skizze | Polygon über eine Kante | Polygon über Mitte |
| Skizze | Skizzierebene neu definieren | Skizze neu auf Fläche |
| Skizze | 3-Punkt-Bogenschlitz | Bogenlangloch über Mittelpunkt |
| Skizze | Spline mit Fitpunkten | Gleichungskurve legt Spline durch Punkte |
| Skizze | Splinepunkt hinzufügen | Spline neu zeichnen |
| Skizze | Splinepunkt entfernen | Spline neu zeichnen |
| Volumenkörper | Teil reparieren | STEP-Import heilt Flächen; kein eigener Reparaturbefehl |
| Volumenkörper | Gewebe | Rippe; Gewebe-Netz als Muster aus Rippen |
| Blech | Falten | Ansicht gefaltet/abgewickelt |
| Blech | Wieder falten | Ansicht gefaltet |
| Blech | Entfalten | Ansicht abgewickelt |
| Baugruppe und Gelenke | Kollisionen der Bewegungsuntersuchung | Kollision prüfen an gespeicherten Positionen |
| Prüfen | Parametervariation | Variantentabelle rechnet Varianten durch |
| Parameter und Varianten | Ausdruck vervollständigen | Parameternamen in Ausdrücken, ohne Vorschlagsliste |
| Parameter und Varianten | Favorisierter Parameter | Parameter der Baugruppe / Hauptmaße oben |
| Parameter und Varianten | Parameterverwendungen | Umbenennen zieht Ausdrücke mit; keine Verwendungsliste |
| Datei und Dokument | Zeichenfläche kalibrieren | Bild über Maß skalieren |
| Datei und Dokument | Gewinde auflisten | Gewinde stehen in Bohrungstabelle und Stückliste |
