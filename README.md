# WerkCAD

Eigenes parametrisches 3D-CAD für Windows – angelehnt an die Arbeitsweise von Inventor, mit Schwerpunkt auf Rohr- und Profilteilen für den Rohrlaser.

## Was es kann

**Bauteile**
- Skizzen auf XY/XZ/YZ oder direkt auf ebenen Flächen des Modells
- Linie, Rechteck (auch aus Mitte), Kreis, Bogen, Punkt, Konstruktionslinien, Modellkanten projizieren
- Stutzen (Linien, Kreise, Bögen an Schnittpunkten) und Skizzenrundung (Ecke bleibt als virtueller Punkt für Maße erhalten)
- Abhängigkeiten: horizontal, vertikal, koinzident, parallel, senkrecht, gleich, tangential, fixiert, Mittelpunkt, konzentrisch, kollinear, symmetrisch
- Bemaßung mit Formeln und Parametern (`Länge/2 + Rand`), Anzeige der Freiheitsgrade, getriebene Maße bei Überbestimmung
- Extrusion (normal, umgekehrt, symmetrisch, beidseitig, durch alles), Ausschnitt, Drehung
- Bohrungen mit Gewinde-Kernloch (M3–M24), Kegel- und Flachsenkung, Sackloch, durchgehend
- Rundung und Fase an gewählten Kanten, Wandung, rechteckiges und kreisförmiges Muster, Spiegeln
- STEP/STL-Import
- Parameter-Tabelle, Werkstoffe mit Dichte, Masse und Abmessungen

**Rohr und Profil**
- Rundrohr, Quadrat- und Rechteckrohr (EN 10219-Radien), Flach-, Rund-, Vierkantstahl, Winkel, U-Profil mit Normgrößen-Katalog
- Einzelprofil mit Gehrung/Schrägschnitt an beiden Enden
- **Rahmen aus Skizze**: jede Linie wird ein Profil, Ecken mit Gehrung oder Stumpfstoß, T-Stöße werden automatisch ausgeklinkt (bei Rundrohr Sattelschnitt)
- Zuschnittliste mit Profil-ID im Format der Rohrlaser-Kalkulation (`RR 42,4x2`, `QR 40x40x3`, `RE 60x40x3` …), Länge, Gehrungswinkeln, kg/m und Gewicht – als CSV für Excel
- **STEP + Zuschnittliste**: eine STEP-Datei mit allen Körpern (jeder mit Profil-ID benannt, Baugruppe als Satz) und daneben die Zuschnittliste – direkt zum Hineinziehen ins Angebot der Kalkulation
- Jedes Profil einzeln als STEP für die Rohrlaser-Software
- **Platte als DXF 1:1**: Kontur und Bohrungen eines Blechteils senkrecht zur größten Fläche (oder zur gewählten Fläche), mit echten Kreisen und Bögen

**Baugruppen**
- Bauteile platzieren, Position/Drehung numerisch, fixieren, ausblenden
- Abhängigkeiten „Fläche an Fläche“ und „Bündig“ mit Abstand – bleiben gespeichert und rechnen nach, wenn sich Bauteile ändern
- Stückliste mit Mengen und Massen, Zuschnittliste über alle Bauteile

**Zeichnungen**
- Blattformate A4–A0, Rahmen und Schriftfeld (Benennung, Nummer, Werkstoff, Maßstab, Masse …)
- Vorder-, Drauf-, Seitenansichten in Projektionsmethode 1 (DIN), Isometrie, verdeckte Kanten, Mittellinien
- Schnittansichten A–A (waagerecht/senkrecht) mit Schraffur, Schnittlinie und Pfeilen
- Bemaßung mit Fangpunkten, Durchmesser/Radius, „Hauptmaße“ automatisch, Texte
- Export als PDF, DXF (mit Layern) und SVG

**Export**: STEP (Bauteil oder Baugruppe), STL, DXF aus Skizzen (z. B. für Laserteile)

## Installation

Unter **Releases** die Datei `WerkCAD-Setup-x.y.z.exe` herunterladen und ausführen. Da die Datei nicht signiert ist, zeigt Windows beim ersten Start eventuell „Der Computer wurde durch Windows geschützt“ – dann „Weitere Informationen → Trotzdem ausführen“.

## Online-Updates

WerkCAD prüft beim Start die Releases dieses Repositorys. Gibt es eine neue Version, erscheint oben ein Hinweis: erst nach deinem Klick wird heruntergeladen, und installiert wird erst nach einer zweiten Freigabe (oder beim Beenden).

Solange das Repository öffentlich ist, braucht es dafür nichts weiter. Wird es wieder privat gestellt, unter **Datei → Einstellungen und Updates** einen Lese-Token hinterlegen (GitHub → Settings → Developer settings → Fine-grained tokens → nur dieses Repository, **Contents: Read-only**). Der Token wird mit der Windows-Verschlüsselung nur auf diesem PC gespeichert.

## Neue Version veröffentlichen

1. Im Repository auf **Actions → Windows-Release → Run workflow**
2. Versionsnummer eingeben (höher als die letzte, z. B. `0.2.0`)
3. Nach ca. 10 Minuten liegt das Release vor; installierte Programme melden das Update

Der Workflow „Windows-Release“ läuft nur auf Knopfdruck (Windows-Minuten zählen doppelt). Die automatischen Tests laufen auf Linux mit 15 Minuten Zeitlimit und nur, wenn sich Programmcode ändert.

## Bedienung (Kurzfassung)

| Aktion | Maus / Taste |
|---|---|
| Schwenken | mittlere Maustaste |
| Drehen | Umschalt + mittlere Taste oder rechte Maustaste ziehen |
| Zoomen | Mausrad (zum Mauszeiger) |
| Alles zeigen | F6 |
| Neue Skizze | S |
| Extrusion / Bohrung | E / H |
| Skizzenwerkzeuge | L Linie · R Rechteck · C Kreis · A Bogen · P Punkt · D Bemaßung · T Stutzen · F Rundung · X Konstruktion |
| Maße beim Zeichnen | Nach dem ersten Klick Wert tippen, Tab wechselt das Feld, Enter übernimmt: Rechteck Breite/Höhe, Linie Länge/Winkel, Kreis Durchmesser |
| Rückgängig / Wiederholen | Strg+Z / Strg+Y |
| Speichern | Strg+S |

Projekte werden als `.wcad` gespeichert (eine Datei mit allen Bauteilen, Baugruppen und Zeichnungen). Eine automatische Sicherung der letzten Sitzung wird beim Start angeboten.

## Entwicklung

```bash
npm install
npm start            # baut die Oberfläche und startet die Desktop-App
npm run serve        # nach "npm run build": im Browser unter http://localhost:4173
npm test             # Kern- und Geometrie-Tests
npm run e2e          # Oberflächentest mit Chrome (Bildschirmfotos in e2e-out/)
npm run dist         # Windows-Setup lokal bauen
```

Aufbau:
- `src/core/` – Formeln/Parameter, Skizzen-Löser, Profile, DXF, Geometrie-Helfer (ohne Abhängigkeiten, lokal testbar)
- `src/kernel/` – Modellaufbau mit OpenCascade (replicad) im Web-Worker
- `src/ui/` – Oberfläche (three.js-Ansicht, Skizzierer, Modellbrowser, Eigenschaften, Zeichnung)
- `electron/` – Desktop-Hülle, Dateidialoge, PDF-Druck, Updates

Geometrie-Kern: [OpenCascade](https://dev.opencascade.org/) über [replicad](https://replicad.xyz/), Darstellung: [three.js](https://threejs.org/).
