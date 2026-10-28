# Normteil-Bibliothek

Die Normteil-Bibliothek ist das PBCAD-Gegenstück zum Inventor Inhaltscenter. Sie enthält Schrauben, Muttern,
Scheiben, Gewindestangen, Dübel und Anker, Nieten sowie Stifte und Bolzen in den gängigen Größen (metrisch M3 bis M36).

## Öffnen

- **Baugruppe → Komponente → Normteil**: Das Teil wird als eigenes Bauteil angelegt. Gleiche Bezeichnung heißt gleiches
  Bauteil, deshalb steht es in der Stückliste nur einmal mit der richtigen Menge.
- **Bauteil → Metallbau → Normteil**: Das Teil wird ein Feature im Bauteil, bleibt aber ein eigener Körper mit
  Normbezeichnung in der Stückliste. In den Eigenschaften des Features ändert »Aus Bibliothek wählen …« Art und Größe.

## Auswählen

Links stehen die Kategorien, die eigenen Normteile und die zuletzt verwendeten Teile. Das Suchfeld findet nach Norm,
auch nach der alten DIN-Nummer (»DIN 933«, »din912«), nach Benennung (»Senkschraube«) und nach Größe (»M36 Mutter«).
Rechts stehen Größe, Länge (Vorzugslängen der Norm oder frei), Festigkeit/Werkstoff, feuerverzinkt, die fertige
Bezeichnung, der Werkstoff, die Masse je Stück und eine Seitenansicht. Die gestrichelte Linie zeigt die Auflagefläche.

## An Bohrung einfügen

»An Bohrung …« schließt den Dialog. Danach eine Bohrung (Zylinderfläche) nahe der Seite anklicken, auf der der Kopf
sitzen soll. In der Baugruppe geht das mit mehreren Bohrungen nacheinander, Esc beendet.

- **Größe und Länge aus der Bohrung**: Durchgangsbohrung nach ISO 273 (größte Schraube, die durchpasst),
  Gewindebohrung am Kernloch (dann ohne Mutter, Länge für 1,5 · d Einschraubtiefe), Dübel, Anker, Nieten und Stifte am
  Bohr-Ø.
- **Garnitur**: Schraube mit Scheibe unter Kopf und Mutter, Scheibe und Mutter auf der Gegenseite. Die Klemmlänge ist die
  Bohrungstiefe bis zur nächsten Gegenfläche oder der eingegebene Wert. Die Länge ist die nächste Vorzugslänge (mindestens
  zwei Gewindegänge Überstand). HV-Schrauben bekommen HV-Scheiben und HV-Muttern, Edelstahl passende A2/A4-Teile.
- Jedes Teil bekommt die Abhängigkeit **Einfügen**: die Kopfscheibe auf der Bohrung, die Schraube auf der Kopfscheibe,
  die Mutterscheibe an der Gegenseite und die Mutter auf der Mutterscheibe. Wird die Platte dicker oder verschoben,
  wandern die Teile mit.

## Inhalt

| Kategorie | Normen |
|---|---|
| Schrauben | ISO 4017 (DIN 933), ISO 4014 (DIN 931), ISO 4762 (DIN 912), ISO 10642 (DIN 7991), ISO 7380-1, DIN 603, EN 14399-4 HV |
| Muttern | ISO 4032 (DIN 934), ISO 4035 (DIN 439), DIN 985, DIN 1587, DIN 6923, DIN 557, DIN 929, EN 14399-4 HV |
| Scheiben | ISO 7089/7090 (DIN 125), ISO 7093-1 (DIN 9021), ISO 7094 (DIN 440), DIN 127-B, DIN 434, DIN 435, EN 14399-6 HV |
| Gewindestangen | DIN 976-1 (DIN 975), Spannschloss DIN 1480 |
| Dübel und Anker | Bolzenanker, Ankerstange für Injektionsmörtel, Betonschraube, Kunststoff-Spreizdübel (Typmaße, Zulassung des Herstellers prüfen) |
| Nieten | ISO 15977/15978 Blindniete, DIN 124, DIN 660, Blindnietmutter |
| Stifte und Bolzen | ISO 2338 (DIN 7), ISO 8734 (DIN 6325), ISO 8752 (DIN 1481), ISO 2339 (DIN 1), ISO 1234 (DIN 94), ISO 2341-B (DIN 1444) |

Gewinde werden wie bisher mit dem Kerndurchmesser dargestellt. Die Maße sind Nennmaße aus den Normtabellen.

## Eigene Normteile

»Eigene Normteile …« im Dialog übernimmt Werknormen und Sonderteile aus einer JSON-Datei, exportiert sie wieder und
bietet eine Vorlage zum Herunterladen. Die Teile liegen je Rechner. Ein Projekt speichert die Maße im Feature mit, damit
es auf anderen Rechnern ohne die Datei richtig aufgebaut wird.

```json
{ "normteile": [{
  "id": "zylinderschraube-flach", "label": "Zylinderschraube, niedriger Kopf", "norm": "DIN 7984",
  "noun": "Zylinderschraube", "cat": "schrauben", "template": "zylinderschraube",
  "sizes": { "M6": { "d": 6, "dk": 10, "k": 3.5, "sw": 4 }, "M8": { "d": 8, "dk": 13, "k": 5, "sw": 5 } },
  "lengths": [10, 12, 16, 20, 25, 30], "grades": ["8.8", "A2-70"]
}] }
```

Vorlagen (`template`) und ihre Pflichtmaße:

| Vorlage | Pflichtmaße | weitere |
|---|---|---|
| sechskantschraube | d, s, k | P (Steigung) |
| zylinderschraube | d, dk, k | sw, t (Innensechskant) |
| senkschraube | d, dk, k | sw |
| linsenschraube | d, dk, k | sw, v, f (Vierkantansatz) |
| mutter | d, s, m | |
| scheibe | d1, d2, h | |
| gewindestange | d | |
| stift | d | |
| bolzen | d, dk, k | d1, le (Splintloch) |
| niet | d, dk, k | hollow (Anteil Bohrung) |
| duebel | d, di | |

Größen mit metrischem Namen (M8, M10 …) bekommen Steigung und Kerndurchmesser automatisch. `hd` setzt den Bohr-Ø für
»Größe aus der Bohrung«, `cat` die Kategorie (schrauben, muttern, scheiben, gewinde, anker, nieten, stifte).
