# PBCAD intuitiver und moderner – Bestandsaufnahme und Plan

Stand 28.10.2026, Basis 0.24.0 (main f7ac429). Auftrag Patrick: „Weiter verbessern und noch intuitiver und moderner machen, erweitern, ohne meine Entscheidung.“ Umsetzung in kleinen PRs, je PR Vorher-/Nachher-Bilder.

## Bestandsaufnahme

Was schon gut ist:
- Menüband nach Inventor (Reiter, Gruppen groß/klein/Symbol), anpassbar, Befehlssuche (Strg+K), Tastaturkürzel mit Konfliktprüfung.
- Startbildschirm mit Kacheln/Liste, helles und dunkles Schema, andockbare Seitenleisten.
- Rechtsklick-Menü im 3D-Fenster, Meldungen am Feld in Generatoren, Problemliste, Berechnungsprotokoll.

Was auffällt (beim Durchklicken mit Bildschirmfotos):
1. **Kleine Fehler**: Auf dem Startbildschirm steht ein „null“ vor „Sortieren nach“ (`replaceChildren` schreibt das leere Suchfeld als Text).
2. **Tooltips** sind nur der Browser-Titel („Extrusion (E)“): kein Hinweis, was ein Werkzeug tut, keine Gestaltung, erscheinen spät.
3. **Rechtsklick-Menü** ist eine lange Liste. Inventor und Fusion haben ein Markierungsmenü (Kreis mit den häufigsten Befehlen) – schneller und ohne Zielen.
4. **Nach einer Auswahl** (Fläche, Kante) muss man ins Menüband. Eine kleine Werkzeugleiste an der Auswahl fehlt (Skizze, Rundung, Fase, Messen …).
5. **Eigenschaftenfeld** ist mit langen Erklärtexten zugestellt (z. B. „Schnitt 2D/3D“ mit 8 Zeilen Text). Abschnitte lassen sich nicht einklappen.
6. **Optik**: Dialoge, Menüs und Meldungen erscheinen ohne Übergang, Meldungen ohne Symbol und ohne Schließen-Knopf, Schatten/Radien uneinheitlich.
7. **Rückmeldung beim Rechnen**: nur „Berechne…“ unten links; kein Fortschritt oben sichtbar.
8. **Einstieg**: „Erste Schritte“ ist ein Textdialog. Keine geführte Einführung beim ersten Start.
9. **Barrierefreiheit**: Menüband-Reiter ohne Rollen (tablist/tab), keine Pfeiltasten-Bedienung, keine Tastenhinweise (Alt) wie in Office/Inventor.
10. **Hilfe**: keine Kurzhilfe je Werkzeug (F1), siehe V8 im Folgeplan.

## Plan (Reihenfolge = Umsetzung)

| Nr. | Inhalt | Größe |
|---|---|---|
| U1 | Optik-Grundlage: einheitliche Schatten/Radien/Übergänge als Variablen, sanftes Einblenden von Dialogen, Menüs und Meldungen, Meldungen mit Symbol je Art und Schließen-Knopf, `prefers-reduced-motion` beachtet; „null“ auf dem Startbildschirm behoben | S |
| U2 | Reiche Tooltips im Menüband: Karte mit Symbol, Name, Tastenkürzel und Kurzbeschreibung (Befehlshilfe als Daten in `src/core`, getestet), erscheint nach kurzer Pause, auch per Tastaturfokus | M |
| U3 | Markierungsmenü im 3D-Fenster: Rechtsklick öffnet einen Kreis mit bis zu 8 passenden Befehlen (Bauteil, Baugruppe, Auswahl), seltene Befehle als Liste darunter; abschaltbar (dann alte Liste) | M |
| U4 | Mini-Werkzeugleiste an der Auswahl: Fläche → Skizze, Extrusion, Normal zur Fläche, Messen; Kante → Rundung, Fase; abschaltbar | M |
| U5 | Eigenschaftenfeld aufräumen: lange Erklärungen hinter ⓘ (aufklappbar), Abschnitte einklappbar und gemerkt | S |
| U6 | Rückmeldungen: Fortschrittsbalken unter dem Menüband beim Rechnen, Fehlermeldungen mit Aktion „Zeigen“ (springt zum Feature), freundlichere Texte | S |
| U7 | Geführte Einführung beim ersten Start (5 Schritte mit Hervorhebung: Menüband, Modellbrowser, 3D-Fenster, Eigenschaften, Befehlssuche), jederzeit über „Erste Schritte“ | S |
| U8 | Barrierefreiheit: Reiter als Tabliste mit Pfeiltasten, Tastenhinweise mit Alt (KeyTips), Kontrastprüfung hell/dunkel | M |
| U9 | Hilfe F1: Kurzhilfe zum Werkzeug unter der Maus bzw. im offenen Feature (aus U2-Daten), dazu Generator-Beispiele auf der Startseite (V8) | S |

Danach Erweiterungen für Metallbau (aus dem Folgeplan, ohne Zurückgestelltes):
- E11 Beschläge als Normteile (Torbänder, Anschweißbänder, Bodenanschlag, Pfostenkappen)
- E15 glTF/GLB-Export (3D für Kunden am Handy)
- V7 Fotodarstellung mit wählbarem Hintergrund und Bildgröße
- E10 Vordach/Carport-Generator
- V4 Leistung: gleiche Stäbe in Generatoren nur einmal bauen (vorher messen)

Nicht ohne Patrick: Stangenoptimierung/Kalkulation, Statik/FEM, Freiform/Guss, SolidWorks/Inventor-Formate.

## Regeln

- Menüband-Struktur (Reiter/Gruppen) bleibt; neue Knöpfe passend einsortieren, Breite im Oberflächentest prüfen.
- Jede Neuerung, die das Verhalten ändert (Markierungsmenü, Mini-Leiste), ist in den Anwendungsoptionen abschaltbar.
- Merge selbst bei grüner CI; Release-Zeilen in `plan/release-notizen-naechste-version.md`.

## Stand

- (wird je PR ergänzt)
