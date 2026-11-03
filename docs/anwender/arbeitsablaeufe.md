# Arbeitsabläufe wie in Inventor und SolidWorks

## Ähnliche Konstruktion aus einer alten ableiten (Kopie konstruieren)

1. Baugruppe öffnen, im Menüband **Baugruppe › Komponente › Kopie konstruieren** (oder Rechtsklick auf die Baugruppe im Modellbrowser).
2. Präfix/Suffix eintragen, z. B. `P25-`. Mit Suchen/Ersetzen lässt sich auch ein Wort tauschen (»links« → »rechts«).
3. Je Zeile **kopieren** oder **wiederverwenden** wählen. Kaufteile, Normteile und verknüpfte Dateien stehen schon auf »wiederverwenden«.
4. **Kopieren**: die neue Baugruppe öffnet sich. Zeichnungen der kopierten Teile sind mitkopiert und zeigen auf die Kopien.

## Ein Teil nur an einer Stelle ändern (Unabhängig machen)

Rechtsklick auf die Komponente › **Unabhängig machen**. Sie bekommt ein eigenes Bauteil (»Name-2«), alle anderen Vorkommen bleiben beim alten.

## Wo steckt dieses Teil? (Wo verwendet)

Im Eigenschaftenfeld eines Bauteils oder einer Baugruppe steht **Verwendet in**: Baugruppen mit Anzahl, Zeichnungen, abgeleitete Bauteile. Ein Klick öffnet das Dokument. **Zeichnung öffnen** springt zur Zeichnung des Modells.

## Eigenschaften und Schriftfeld

Unter **Eigenschaften** stehen Konstrukteur, Projekt und eigene Felder (z. B. Kunde, Auftrag). Im Schriftfeld der Zeichnung werden Platzhalter ersetzt: `{Projekt}`, `{Konstrukteur}`, `{Beschreibung}`, `{Werkstoff}`, `{Status}` oder der Name einer eigenen Eigenschaft. Ein Platzhalter mit Tippfehler bleibt sichtbar stehen.
Wird ein Bauteil umbenannt, ziehen Benennung und Nummer seiner Zeichnungen mit, solange dort noch der alte Wert steht.

## Stücklistenstruktur

- Komponente **Referenz**: bleibt sichtbar und zählt für Kollision und Messen, steht aber nicht in Stückliste, Zuschnittliste und Bestellliste und bekommt keine Positionsnummer. Gut für Wand, Bestand oder Hilfsteile.
- Baugruppe **Phantom**: steht in Struktur- und Baukastenstückliste nicht als eigene Zeile, ihre Teile rücken eine Ebene höher. Gut für Schraubengarnituren oder Montagehilfen.
