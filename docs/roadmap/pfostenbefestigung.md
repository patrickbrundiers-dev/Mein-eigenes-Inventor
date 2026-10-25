# Pfostenbefestigung an Geländern – Bestandsanalyse und Umsetzungsplan

Stand: 25.10.2026 · Grundlage: Patricks Plan „Montageplatten und Befestigung an Geländerpfosten“
(Projektordner `plan/montageplatten-gelaender.md`) · Commit `ff0b95a` (main)

## 1. Bestand

### Welche Generatoren erzeugen Geländerpfosten?

| Generator | Datei | Pfosten heute | Befestigung heute |
|---|---|---|---|
| Geländer (gerade, über Eck) | `src/core/gelaender.js` | `Pfosten n`, lotrecht auf z = 0, Lauflinie in +X | `base`: einfache quadratische Fußplatte auf dem Boden (4 Löcher Ø 11, kein Gegenstück) oder ohne |
| Treppe gerade / L / U mit Podest | `src/core/treppe.js` → `railing()` → `src/core/treppengelaender.js` `railAlong()` | `Geländer links/rechts Pfosten n`, lotrecht, `gelDown` unter Stufenkante, Achse um Wangendicke + halbe Pfostenbreite neben dem Lauf | keine: Pfosten steht nur geometrisch neben der Wange, kein Blech, keine Bohrung |
| Balkon | `src/core/balkon.js` | ruft `GELAENDER.plan` und dreht das Ergebnis an die drei freien Seiten | Fußplatten des Geländers stehen auf dem Belag (kein Bezug zum Rahmen) |
| Spindeltreppe | `src/core/spindel.js` | `Geländerstab i` je Stufe, lotrecht auf der Stufe | keine |
| Zaun | `src/core/zaun.js` | `Pfosten n` | einbetoniert oder Fußplatte ohne Löcher (kein Geländer im Sinne des Plans, nur optional) |

Tore und Schiebetore haben Pfosten, sind aber keine Geländer und bleiben außen vor.

### Wie entsteht Geometrie?

- **Bauplan** (`src/core/generator.js`, Kopfkommentar): Generatoren rechnen rein in JavaScript
  `{ chains, members, plates, drills, norms, info, issues }`. Den Körper baut der OCCT-Kernel
  (`src/kernel/build.js`, Fall `generator`/`genteil`). **Das ist der Erweiterungspunkt**: Platten, Bohrungen und
  Durchbrüche lassen sich vollständig als Bauplan-Einträge ausdrücken.
- `members`: Stab von `a` nach `b`, Lage über `up` und `rot` (Rahmen wie `memberFrame`: v ≈ up, u = v × z),
  `cuts` = Schnittebenen an den Enden (der Kernel verlängert selbst, damit die Ebene den Querschnitt erfasst).
- `plates`: Mitte der Unterseite `center`, `xDir`, `normal`, Rechteck `W × H` oder Umriss `poly`, Dicke `t`,
  runde Löcher `holes` (ein gemeinsamer Ø `d`), Langlöcher `slots` (entlang `xDir`).
- `drills`: Bohrung Ø `d` oder Rechteckdurchbruch `w × h` ab `p` in Richtung `dir`, Länge `len`, im Stab namens
  `target` (nur am Stück, durch dessen Achse `p` geht). Wird schon für Gurte durch Pfosten, Handlaufhalter und die
  DIN-24531-Stufenbohrungen in der UPN-Wange genutzt – also auch für die Gegenbohrungen im Zielprofil.
- Baugruppe mit Einzelteilen (`src/core/genteil.js`, PR #117): jeder Bauplan-Körper wird ein Teil; Bohrungen gehen
  über `target` mit. Neue Bleche und Flacheisen werden dadurch automatisch eigene Teile mit Stückzahl.
- Profile und Querschnitte: `src/core/sections.js` (`sectionGeometry`: Breite entlang u, Höhe entlang v, Kontur),
  Katalog über `src/core/profillib.js`. UPN 200 = H 200, B 75, Steg s 8,5, Flansch t 11,5, r 11,5.
- Lage offener Profile: `src/core/orient.js` (`orientRot`). An der Treppe steht die UPN-Wange hochkant, offen nach
  außen; die **Oberseite der Wange ist die Außenfläche des oberen Flanschs (75 mm)** – das ist die „kurze Seite“ des
  U200 aus dem Plan.
- Vorhandenes Anschlussblech-Modell: `src/core/anschluss.js` `platePlan` (Bohrbild 0/2/4, Randabstand,
  Hinweis 1,2·d nach EN 1993-1-8). Wird wiederverwendet, ist aber auf Stabenden zugeschnitten.

### Oberfläche, Speicherung, Tests

- Eigenschaftenfeld: rein schemagetrieben (`src/ui/props.js` `genFields`): Gruppen, Sichtbarkeit `when`,
  Profil-Picker, Meldungen je Feld über `issues[].key`, Fokus hebt Körper hervor (`gen.parts`, `genskizze.js`),
  Vorlagen speichern und laden (= „Befestigungsprofile speichern und wiederverwenden“ ist damit schon vorhanden).
- Projektdatei: Generator-Parameter als JSON im Feature. Rückwärtskompatibilität über `missing` im Schema:
  ältere Features ohne den neuen Schlüssel bekommen den alten Wert.
- Tests: `test/metall.test.mjs` (Bauplan-Rechnung, ohne Kernel) und `test/metall-kernel.test.mjs` (echte Körper).
  CI: `.github/workflows/ci.yml`.

## 2. Was vom Plan schon da ist, was fehlt

| Plan | Stand |
|---|---|
| Fußplatte unter dem Pfosten | nur Geländer/Zaun, immer waagrecht auf z = 0, Löcher ohne Gegenstück |
| Montageebene, lokale Koordinatensysteme | fehlt (nur Stabrahmen im Kernel und in `genteil.js`) |
| Bohrbild ins Zielprofil | Mechanik vorhanden (`drills`), Logik fehlt |
| Anschlussfläche eines Profils (Wand, Flansch, offene Seite) | fehlt |
| Seitliches Blech, Flacheisen, Schlitz, Stecknasen | fehlt; Rechteckdurchbruch im Stab vorhanden, Rechteckausschnitt in Platten fehlt |
| Validierung Randabstand, Kollision | nur `platePlan` (in der eigenen Platte) |
| UI-Bereich, Vorlagen, Speicherung | Mechanik vorhanden (Schema, Vorlagen, `missing`) |

## 3. Entscheidungen

1. **Ein gemeinsames Modul `src/core/pfostenbefestigung.js`** (reine Rechnung, keine Kernel-Abhängigkeit). Es liefert
   Bauplan-Teile (`plates`, `drills`, Pfostenfuß mit Schnitt) und `issues`. Die Generatoren behalten ihre
   Geometrie und rufen das Modul nur dort auf, wo heute der Pfostenfuß entsteht.
2. **Anschlussfläche statt Profilsonderfall.** `profileFaces(section)` beschreibt für jede Profilart die vier
   Hüllseiten: Wanddicke dahinter, nutzbarer Bereich quer (bis Kante, Radius oder Steg), Aussparungen (Steg eines
   I-Profils) oder „offen“ (U, UPN, I, Winkel). `memberFace(stab, Wunschrichtung)` legt das in Weltlage. U200 ist
   damit nur ein Profil unter vielen, es gibt kein `if (U200)`.
3. **Lokale Koordinatensysteme**: Fläche (Ursprung, Normale n, längs s, quer c), Montagerahmen (Fußpunkt, n, x, y),
   Pfostenachse nach Regel `lotrecht` (bleibt senkrecht, Pfostenfuß schräg geschnitten) oder `normal`
   (Pfosten senkrecht zur Montagefläche). Die Fußplatte liegt immer plan auf der Fläche.
4. **Bohrbild-Übertragung** rechnet jede Plattenbohrung über den Montagerahmen in Flächenkoordinaten, prüft sie
   gegen den nutzbaren Bereich und den Mindestrandabstand und erzeugt erst dann `drills` im Zielstab (bzw.
   Löcher in einer Zielplatte, z. B. Stufe). Ungültige Bohrungen werden gemeldet, nie verschoben.
5. **Seitliche Befestigung**: Blech plan auf der Anschlussfläche, Pfosten um Blechdicke (+ Abstand) davor.
   **Abstandsausgleich**: Flacheisen senkrecht zum Blech, ein Ende steckt durch einen Schlitz in der Pfostenwand,
   das andere greift mit **Stecknasen in passende Steckschlitze des Befestigungsblechs**. (Die Nasen sitzen am
   Flacheisen, weil eine Nase in der Blechebene kein senkrecht stehendes Flacheisen fassen kann; geprüft wird die
   Passung beider Seiten.) Schlitz = Nase + 2 × Spiel, dieselbe Regel wie `slotSize` im Stecksystem (Stufe 45,
   Thread „Fehlende CAD-Werkzeuge“); sobald das auf main ist, wird darauf umgestellt. Die Nasen sichern nur die
   Lage, die Verbindung ist zu verschweißen – so steht es auch in der Meldung.
6. **Rückwärtskompatibel**: neue Schlüssel mit `missing` = bisheriges Verhalten. Bestehende Projekte rechnen
   unverändert. Neue Generatoren starten mit der neuen Befestigung.
7. **Kernel**: einzige Erweiterung sind Rechteckausschnitte in Platten (`plate.rects`) und optional ein eigener Ø
   je Loch (`holes: [x, y, d]`) – rückwärtskompatibel.
8. **Keine Statik**: Info-Zeile unterscheidet „geometrisch geprüft“, „fertigungstechnisch plausibilisiert“ und
   „statisch nicht nachgewiesen“.

## 4. Datenmodell (Parameter im Generator-Schema, Gruppe „Pfostenbefestigung“)

| Plan-Feld | Schlüssel (Treppe mit Präfix `gel`) |
|---|---|
| Befestigungsart `TOP_MOUNT`/`SIDE_MOUNT` | `mount`: `oben` / `seitlich` (+ bisherige Werte) |
| Anschlussbauteil, Anschlussfläche | `mFace`: automatisch / oben / außen / innen; Bauteil ergibt sich aus der Lage (Wange, Podestrahmen, Balkonrahmen, Stufe, Randprofil, Boden) |
| Platte Breite, Länge/Höhe, Stärke | `mW`, `mL`, `mT` |
| Lage, Drehung | `mDx`, `mDy` (Pfosten auf der Platte), `mRot` (um die Normale), `mZ` (Höhenlage seitlich) |
| Pfostenorientierung | `mRule`: `lotrecht` / `normal` |
| Bohrbild | `mHoles` (4, 2 längs, 2 quer, frei), `mFree`, `mD`, `mE`, `mSlot` (Langloch) |
| Zielbauteil-Prüfung | `mEdge` (Mindestrandabstand im Bauteil), `mTD` (Gegenbohrung Ø) |
| Abstandsausgleich | `mGap`, `mGapMax`, `mFlat` (Flachstahl-Profil), `mIns`, `mTabs`, `mTabW`, `mPlay`, `mSlotW`, `mSteg`, `mShift` |
| Fertigungsinfo | Teilenamen „Fußplatte“, „Befestigungsblech“, „Flacheisen“ → Einzelteile mit Stückzahl, Werkstoff der Baugruppe |
| Validierung | `issues` mit Feldschlüssel und Pfostenname |

Intern ergibt das je Pfosten ein Objekt `{ kind, face, frame, plate, holes, transfer, spacer, issues }`, das die
Unit-Tests direkt prüfen.

## 5. Etappen und PRs

| Etappe | Inhalt | Dateien | Tests |
|---|---|---|---|
| 1 | diese Analyse | `docs/roadmap/pfostenbefestigung.md` | – |
| 2 | Flächenmodell aller Profilarten, Anschlussfläche in Weltlage, Montagerahmen, Pfostenachse, Transformationen, Kollision (OBB) | `src/core/pfostenbefestigung.js`, `test/pfostenbefestigung.test.mjs` | Balkonpfosten eben, Treppenpfosten geneigt, U200-Flächen, offene Seiten, mehrdeutige Fläche |
| 3 | Fußplatte, Bohrbild, Übertragung, Prüfungen; Geländer mit Anschluss Boden/Randprofil; Treppe „oben auf der Wange“ | Modul, `gelaender.js`, `treppe.js`, `treppengelaender.js`, `build.js` (Loch-Ø) | U200-Referenz, Randabstand, Bohrung neben Flansch, Winkeländerung |
| 4 | seitliches Blech | Modul, Generatoren | ohne Abstand, Bohrung vom Pfosten verdeckt |
| 5 | Flacheisen, Pfostenschlitz, Stecknasen, Passung | Modul, `build.js` (`rects`) | kleiner/großer Abstand, ungültige Nasen, Spiel |
| 6 | Podest, Holmtreppe (auf der Stufe), Balkon (Rahmen), Spindeltreppe (Stufe) | Generatoren | je Typ, mehrere Pfosten mit verschiedenen Flächen |
| 7 | Feinschliff UI (Pfostenauswahl, Hervorhebung), Regressionstests, Anwender-Doku, Release-Notiz | `props.js`, Doku | alte Projekte, Kernel-Körper |

Jede Etappe ist ein eigener PR; nach jeder Etappe laufen alle Tests. Etappe 3–5 sind zusammen in einem PR gelandet, weil die Vorgabe der Treppe (seitlich) erst mit Etappe 4 meldungsfrei wird.

### Stand nach Etappe 5

- **Treppe:** neues Feld „Pfostenbefestigung“ (seitlich = Vorgabe für neue Treppen, oben, aus). Alte Projekte ohne das Feld laufen mit „aus“ wie bisher. Pfosten an Enden/Knicken rücken in ihr Feld zurück (höchstens ein Drittel des Feldes), damit das Blech auf dem Bauteil liegt; Pfosten ohne passendes Bauteil daneben (Podest-Auslauf) bekommen eine Fußplatte oben bzw. eine Fehlermeldung, wenn auch das nicht geht. UPN-Wangen mit der offenen Seite nach außen: Fehlermeldung, Pfosten wie bisher.
- **Geländer:** „Befestigung“ hat jetzt oben (Vorgabe), seitlich, Fußplatte (bisher) und keine; Anschluss an Boden/Deckenstirn (ohne Gegenbohrung, nur Randabstand) oder an ein Randprofil (Vorgabe U200, mit Gegenbohrungen).
- **Abstandsausgleich:** Flacheisen (Vorgabe 60 × 10) steht senkrecht auf dem Blech, greift mit Stecknasen (Länge = Blechdicke, bündig) durch Steckschlitze im Blech und steckt durch einen Schlitz in der nahen Pfostenwand bis kurz vor die Gegenwand. Schlitze = Nase bzw. Flacheisen + 2 × Passungsspiel (gleiche Regel wie `slotSize` im Stecksystem), Schlitzbreite von Hand mit Passungsprüfung. Geprüft: Höchstabstand, Nasen auf der Breite (Mindeststeg), Schlitze im Blech zu Bohrungen und Rand, Material neben dem Pfostenschlitz, Abstand zum Pfostenende, Einstecktiefe, Vollmaterial.
- **Kernel:** Plattenbohrungen mit eigenem Ø (`[x, y, Ø]`) und Rechteckausschnitte (`rects`).
- Noch offen (Etappe 6): Podestecken der L/U-Treppe (Blechbohrungen über dem Rahmenende), Holm- und Spindeltreppe, Balkon.

## 6. Bekannte Grenzen (erste Version)

- Kollisionsprüfung mit Hüllquadern (OBB) aus dem Bauplan, nicht mit den echten Körpern: meldet eher zu viel.
- Rundrohre haben keine ebene Anschlussfläche → Befestigung auf Rundrohr wird abgelehnt (Meldung).
- Keine Schrauben- oder Dübelauswahl, keine Schweißnähte am Blech (nur Hinweis).
- Keine statische Bemessung (Plan §11/§12).
