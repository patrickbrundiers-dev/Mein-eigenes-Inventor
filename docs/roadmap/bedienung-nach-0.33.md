# Bedienung verbessern und Vorschläge (nach 0.33)

Stand 02.11.2026, Basis 0.33.0. Auftrag Patrick: „Verbessern und neue Vorschläge machen.“
Thread „PBCAD intuitiver und moderner machen“. Folgt auf [intuitiv-modern.md](intuitiv-modern.md) (U1–U9, Dokument-Reiter).

## Befund (Durchgang durch Startseite, Bauteil, Skizze, Baugruppe, Zeichnung bei 1600, 1280 und 1024 px)

- Bei 1280 px und kleiner läuft das Menüband rechts aus dem Fenster. Die Gruppen dort (z. B. Verwalten, Bewegung, Zeichnung in der Baugruppe) sieht man nur durch waagrechtes Scrollen, das kaum jemand bemerkt.
- Rückgängig geht nur Schritt für Schritt. Man sieht nicht, welche Schritte zurückgenommen werden.
- Einen Befehl mehrmals hintereinander (Fase, Bohrung, Normteil) muss man jedes Mal im Menüband suchen.
- Die Befehlssuche zeigt bei leerer Eingabe immer dieselbe lange Liste. Die eigenen häufigen Befehle stehen nicht vorn. GLB-Export fehlte in der Suche.

## Umgesetzt in diesem Durchgang (eine PR)

| Nr. | Was | Vorbild |
|---|---|---|
| Q1 | **Menüband passt sich der Fensterbreite an.** Passt eine Karte nicht, klappen Gruppen von rechts zu je einem Knopf ein. Ein Klick zeigt ihre Befehle im Ausklappfeld. Das geht automatisch, auch beim Ändern der Fenstergröße. | Inventor, Office |
| Q2 | **Rückgängig-Verlauf**: Ein Pfeil neben Rückgängig zeigt die letzten 15 Schritte. Ein Klick nimmt bis einschließlich diesen Schritt zurück. | Inventor, SolidWorks |
| Q3 | **Letzten Befehl wiederholen**: Der Rechtsklick im 3D-Fenster bietet »Nochmal: Fase«. | Inventor »Wiederholen« |
| Q4 | **Befehlssuche mit »Zuletzt benutzt«**: Bei leerer Eingabe stehen die 8 zuletzt benutzten Befehle oben. GLB ist jetzt suchbar. | Fusion, VS Code |

## Vorschläge für danach (Patrick wählt)

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| Q5 | **Zwei Dokumente nebeneinander**, z. B. Bauteil links und Zeichnung rechts, beide live | Ändern und Ergebnis in der Zeichnung gleichzeitig sehen (Inventor »Nebeneinander«) | M–L |
| Q6 | **„Nächster Schritt“-Hinweis im 3D-Fenster**: leeres Bauteil → Kachel „Skizze starten“, fertige Skizze → „Extrudieren“, Generator → „Als Baugruppe“ | Einsteiger finden ohne Suchen weiter | S |
| Q7 | **Werte per Mausrad oder Ziehen ändern** (Maßfelder im Eigenschaftenfeld) mit sofortiger Vorschau, Umschalt = feiner | schneller ausprobieren | S |
| Q8 | **Startseite mit Schnellstart-Kacheln**: Geländer, Treppe, Tor, Rahmen, Blechteil direkt als neues Projekt | Metallbau-Aufträge in zwei Klicks starten | S |
| Q9 | **Werkstattmodus**: große Schrift, hoher Kontrast, große Knöpfe für Monitor oder Tablet an der Maschine, nur Ansehen, Messen und Listen | Zeichnung und Modell in der Werkstatt ohne Papier | M |
| Q10 | **Tablet-Bedienung**: zwei Finger drehen und zoomen, langes Tippen = Rechtsklick | wie Q9, auf dem Tablet | M |
| Q11 | **Arbeitsbereiche speichern**: Anordnung von Panels und Menüband als „Konstruktion“, „Zeichnung“, „Präsentation“ umschalten | weniger Umstellen | S |

Empfehlung: Q6, Q7 und Q8 zusammen (klein, sofort spürbar). Danach Q5 und Q9.

## Stand

- 02.11.2026: Q1–Q4 umgesetzt, PR #187 gemergt (in 0.34.1).
- 02.11.2026: Patrick wählt „alles der Reihe nach“: Q6–Q8, dann Q5, dann Q9/Q10, dann Q11.
- 02.11.2026: Q6–Q8 umgesetzt. „Nächster Schritt“-Kachel (core/naechster.js, ui/naechster.js, abschaltbar unter Ansicht). Werte per Mausrad im Feld oder Ziehen am Feldnamen (core/wertschritt.js, Props.scrubbable). Schnellstart-Kacheln auf der Startseite.
