# PBCAD System- und Optik-Optimierung – Bestandsaufnahme und Plan

Stand 28.10.2026, Basis main d25e458. Auftrag Patrick: „Danach eine System- und Optik-Optimierung starten.“
„Danach“ = nach dem gesammelten Update. Bis dahin nur Analyse und Plan, nichts gemergt.
Lesart: **System** = Leistung, Stabilität, Speicher, Ladezeit, Codepflege. **Optik** = Aussehen der Oberfläche.
Baut auf U1 aus PR #149 auf (Schatten, Radien `--radius-l`, Übergänge, Meldungen mit Symbol) und wiederholt das nicht.

## Messung heute (Browser-Build, Chromium headless, Beispielprojekt Schweißrahmen)

| Messgröße | Wert |
|---|---|
| Oberfläche bereit | 2,0 s |
| Geometrie-Kern bereit (22 MB WASM) | 3,0 s |
| Bundle | app.js 1,8 MB, worker.js 0,9 MB, WASM 21,9 MB |
| Grundplatte ändern → neu angezeigt | ~170 ms (davon 90 ms Entprellung) |
| Speicher (RSS) nach Start / 10 / 40 Änderungen | 1022 / 1193 / 1256 MB, wächst ~2 MB je Änderung an einer einfachen Platte und fällt nicht |
| Undo-Stapel nach 40 Änderungen | 231 KB (bei großen Projekten × 100 Schritte) |

## Befunde System

1. **Speicher im Geometrie-Kern wächst.** Genauer gemessen (SY0): OpenCascade selbst gibt Speicher aus Booleschen Operationen nicht vollständig frei (~0,25 MB je Schnitt, auch mit `delete()` und Speicherbereinigung). 80 Änderungen am Geländer-Generator: 413 → 811 MB, stetig steigend; bei 4 GB stürzt der Kern ab. Die Zwischenspeicher sind nicht die Ursache.
2. **Daten werden mehrfach kopiert.** Jeder Bau-Auftrag macht `JSON.parse(JSON.stringify(part))` in der Oberfläche, im Worker nochmal `JSON.stringify` für den Hash; Netze kommen per `postMessage` ohne Transfer-Liste zurück (Kopie statt Übergabe der Puffer).
3. **Undo speichert 100× das ganze Projekt** als JSON, unabhängig von der Größe. Autosave serialisiert ebenfalls das ganze Projekt nach jeder Änderung.
4. **Ladezeit:** 22 MB WASM werden bei jedem Start neu übersetzt; Schriftumrisse (110 KB) und selten genutzte Module (IFC, DSTV, IGES, Zeichnung) liegen im Startpaket.
5. **Nach jedem Bau** werden Modellbrowser und Eigenschaftenfeld komplett neu aufgebaut, auch wenn sich dort nichts geändert hat.
6. **Stabilität:** Absturz des Kerns → Neustart ist da. Es fehlen: Zeitlimit für hängende Geometrie-Befehle, Erkennung einer Absturzschleife (immer dasselbe Feature), Langlauftest.
7. **Codepflege:** Testliste in `package.json` doppelt von Hand gepflegt (`test` und `test:core`), `profillib.test.mjs` steht zweimal drin; kein Linter; unbenutztes Feld `hash` in `app.results`; `props.js` (2650 Zeilen) und `kernel/build.js` (2970 Zeilen) sind sehr groß.

## Befunde Optik

1. **Schriftgrößen:** 9 verschiedene Größen (10 / 10,5 / 11 / 11,5 / 12 / 12,5 / 13 / 14 px) ohne Stufung.
2. **Abstände:** 57 verschiedene `padding`-Werte, kein Raster.
3. **Feste Farben:** 114 Farbwerte direkt in `styles.css`, 32 in `viewer.js`, 53 in `drawing.js` – die folgen dem Hell/Dunkel-Schema nur teilweise.
4. **Kontrast:** Grauer Hinweistext (`--steel-4`) hat im hellen Schema nur 3,3 : 1 (18 Stellen, Ziel 4,5 : 1). Laser-Orange auf Weiß 2,8 : 1, darf nur Fläche/Rahmen sein, kein Text. Dunkel: Anreißblau auf Fläche knapp 4,0 : 1.
5. **Symbole:** 159 Symbole, aber eins steht oft für viele Befehle: „Ansicht“ 19×, „Bemaßung“ 11×, „Schnitt“ 10×; „Abhängigkeit“, „Fläche an Fläche“ und „Bündig“ sehen gleich aus. So erkennt man Befehle schlecht wieder.
6. **Feinschliff:** Zeilenhöhen und Einrückung im Modellbrowser, Feldraster im Eigenschaftenfeld, Knopfreihenfolge in Dialogen, Fokusrahmen sind uneinheitlich.

## Plan (Reihenfolge = Umsetzung, je Stufe eine PR, nach dem gesammelten Release)

| Nr. | Inhalt | Größe |
|---|---|---|
| SY0 | Messgerüst `tools/messen.mjs`: Startzeit, Kern bereit, Bauzeit, Speicher des Kerns (neuer Worker-Auftrag `stats` mit WASM-Heap und Cache-Größen), Lauf über Beispiel + 3 Generatoren; Ausgangswerte in `docs/testing/leistung.md` | S |
| SY1 | Speicher Kern: Kern im Leerlauf unbemerkt neu starten, wenn der WASM-Speicher über 1 GB liegt (große Modelle: doppelter Bedarf); Werkstoffe/Biegetabellen nach jedem Neustart erneut setzen (fehlte auch nach Absturz); Zwischenspeicher je Bauteil statt 24 insgesamt (große Baugruppen verdrängen sich nicht mehr selbst) | M |
| OP1 | Gestaltungsgrundlage: Schriftstufen (4), Abstandsraster (4/8/12/16), restliche feste Radien und alle festen Farben in `styles.css` auf Variablen | M |
| OP2 | Hell/Dunkel: Kontraste auf mindestens 4,5 : 1 bei Text, 3D-Ansicht, Skizze und Zeichnungseditor lesen Farben aus dem Schema, Prüftest für Kontrast | M |
| SY2 | Weniger Kopieren: Teil einmal serialisieren, Netze als übertragene Puffer, Undo nach Größe begrenzen (nur geänderte Dokumente speichern), Autosave im Leerlauf | M |
| SY3 | Ladezeit: WASM-Übersetzung zwischenspeichern (Electron Code-Cache bzw. IndexedDB), selten genutzte Module nachladen, Startseite vor dem Kern bereit; vorher/nachher messen | M |
| OP3 | Symbole: eigene Symbole für die mehrfach belegten Befehle, gleiches 24-px-Raster und Strichstärke, Symbolübersicht als Prüfseite | M |
| SY4 | Oberfläche flüssig: Modellbrowser/Eigenschaften nur bei echter Änderung neu zeichnen, gleiche Körper in Baugruppen als geteilte Geometrie (mit V4 aus dem Plan „intuitiver“ abgestimmt) | M |
| OP4 | Feinschliff: Menüband-Gruppen, Modellbrowser-Zeilen, Eigenschaften-Raster, Dialog-Fußleisten, Statusleiste, einheitlicher Fokusrahmen | S |
| SY5 | Stabilität: Zeitlimit für Geometrie-Aufträge mit Meldung, Absturzschleife erkennen und betroffenes Feature zum Unterdrücken anbieten, Langlauftest (200 Änderungen) in e2e | S |
| SY6 | Aufräumen: Testliste automatisch aus `test/*.test.mjs`, schlanker Linter-Lauf in CI (Syntax, unbenutzte Importe), totes Feld/tote Exporte entfernen, `props.js` nach Feature-Arten aufteilen, Doku `current-state.md` aktualisieren | M |
| OP5 | Prüfung: Bildschirmfotos aller Hauptansichten hell und dunkel im Oberflächentest, Vorher/Nachher in `/mnt/project-files/optik/` | S |

## Regeln

- Keine Funktionsänderung für den Anwender außer Aussehen und Geschwindigkeit; Dateiformat bleibt.
- Jede System-Stufe mit Messwert vorher/nachher in der PR, jede Optik-Stufe mit Bildern hell/dunkel.
- Menüband-Struktur und Abläufe bleiben (siehe U1–U9).
- Merge selbst bei grüner CI, kein eigenes Release; Release-Zeilen an den Release-Thread.

## Stand

- 28.10.2026: Analyse und Plan fertig. Patrick: „So umsetzen“. PRs werden vorbereitet, gemergt wird erst nach dem gesammelten Release.
- SY0, SY1, SY2, SY3, SY5, SY6 in einer PR (claude/project-thread-1cf1aj), Messwerte in `docs/testing/leistung.md`.
  - SY2: Rückgängig teilt unveränderte Dokumente zwischen den Ständen, Budget 200 Mio. Zeichen. Netze per Transfer und einmaliges Serialisieren zurückgestellt: erwarteter Nutzen klein (Kopien sind Speicherkopien von wenigen MB), nicht einzeln gemessen.
  - SY3: 3D-Ansicht zeichnet erst, wenn sichtbar. WASM-Zwischenspeicher zurückgestellt: im Container ohne Electron nicht messbar.
  - SY4: Modellbrowser + Eigenschaften neu zeichnen dauert ~1 ms – kein Handlungsbedarf; Baugruppen-Verdrängung im Kern mit SY1 behoben.
  - SY5: nach 8 s Rechnen »Abbrechen« (Kern-Neustart), Hinweis bei 3 Abstürzen in 1 min, kein unbehandelter Fehler beim Neustart.
  - SY6: eine Testliste (`tools/tests.mjs`, findet alle `test/*.test.mjs`); dadurch laufen `gestell.test.mjs` und `gestell-kernel.test.mjs` jetzt auch in der CI (fehlten). `release.yml` bleibt beim Release-Thread.
- OP1–OP5 (auf main mit #149) in derselben PR:
  - OP1: Schriftstufen `--fs-2xs` … `--fs-xl` statt 9 Einzelgrößen (11,5 → 12, 12,5 → 13 px).
  - OP2: `--text-faint` für Hinweistext (hell 5,1 : 1, dunkel 6,6 : 1 statt 3,3 : 1), Anreißblau dunkel 4,7 : 1; Ansichtsleiste und HUD im 3D-Fenster folgen dem dunklen Schema; Rahmenfarben im Menüband aus den Schemafarben.
  - OP3: 20 neue Symbole (6 Ansichtsrichtungen + Iso, Orthogonal/Perspektive, Ansicht speichern, Messen, Zuschnittliste, Grund-/Projizierte/Hilfsansicht, Auswahl, Umkehren, Fensteranordnung, Bündig, Zylindergelenk).
  - OP4: Menüband staucht Knöpfe nicht mehr (lange Wörter ragten in den Nachbarknopf), zu breit → rollt.
  - OP5: `tools/optik-bilder.mjs`, Vorher/Nachher in `/mnt/project-files/optik/`.
  - Abstands-Raster (57 Innenabstände) bewusst nicht pauschal ersetzt: viel Bewegung ohne sichtbaren Gewinn.
