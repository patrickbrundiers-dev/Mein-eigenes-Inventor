# WerkCAD – Datenfluss

Stand: 24.10.2026 · Commit `cf39217`

## Modelländerung bis Anzeige

```
Benutzer (Ribbon / Eigenschaften / Skizzierer)
   │  App.edit(label, fn)                        src/ui/app.js
   ├─ checkpoint(): Projekt-JSON auf Undo-Stapel
   ├─ fn(): Feature-Objekt im Projekt ändern (nur Daten, keine Geometrie)
   └─ changed(): dirty, Autosave (1,5 s), Baum/Panel neu, rebuild() (90 ms entprellt)
          │
          ▼
   KernelClient.build(part)                      src/ui/kernel.js
     – pro Bauteil gewinnt der letzte Auftrag, ältere werden zusammengefasst
          │  postMessage({cmd:"build", part, quality})
          ▼
   Worker handlers.build                         src/kernel/worker.js
     – Cache nach Hash des Bauteil-JSON (24 Einträge)
     – K.buildPart(part)                         src/kernel/build.js
         · Parameter auflösen (expr.js)
         · Features der Reihe nach; Prefix-Cache überspringt unveränderte Anfänge
         · je Feature: status {ok, error, warning, info}
     – meshBody() + bodyProps() je Körper (Volumen, Hüllbox)
          │  Ergebnis: status, values, bodies[mesh, meta, props], sketches
          ▼
   App.results.set(part.id, …) → Viewer zeigt Meshes, Props zeigt Probleme/Zuschnittliste
```

Die **Quelle der Wahrheit ist das Projekt-JSON**. Geometrie existiert nur im Worker und
wird jederzeit aus dem JSON neu erzeugt. Das entspricht bereits dem Prinzip
„Domain-Modell maßgeblich, 3D-Ansicht ist Darstellung“ aus dem Entwicklungsplan.

## Speichern und Laden

```
Speichern:  App.project ─JSON.stringify─▶ bridge.saveProject ─IPC─▶ main.cjs atomicWrite
            (Datei.tmp schreiben → alte Datei nach .bak kopieren → umbenennen)

Laden:      main.cjs readFileSync ─IPC─▶ Files.parse (format/docs prüfen) ─▶ App.setProject
            → Undo leeren → erstes Dokument öffnen → Neuaufbau

Autosave:   App.changed → Files.autosave → localStorage "werkcad.autosave" (≤ 4,5 MB)
```

## Export

| Export | Weg |
|---|---|
| STEP / STEP + Zuschnittliste | Renderer sammelt Bauteile/Platzierungen → Worker `exportStep` → Text → `file:save` (mit Begleitdatei `_Zuschnitt.csv`) |
| Profile einzeln | Worker `bodySteps` (nur `kind: "member"`) → `file:saveMany` |
| Zuschnittliste / Stückliste CSV | im Renderer aus `results` (`cutListRows`, `bomRows`) |
| STL | Worker `exportStl` (binär) |
| Platten-DXF | Worker `plateDxf` (Projektion senkrecht zur größten ebenen Fläche) |
| Zeichnung PDF/DXF/SVG | Renderer erzeugt SVG aus Worker-Projektionen; PDF über verstecktes Fenster im Hauptprozess |

## Update

```
Start (installiert) ─8 s─▶ updater.check ─▶ GitHub-Releases (öffentlich, optional Token)
   → Hinweisleiste im Renderer → Klick: download → Klick: quitAndInstall
```

Release-Erstellung nur manuell über `.github/workflows/release.yml`.

## Wo ein Knickrahmen einhängt

Ein neuer Feature-Typ im Bauteil (`features[]`) durchläuft genau denselben Weg:
Eigenschaften-Panel ändert Daten → `buildPart` erzeugt `member`-Körper → Zuschnittliste,
STEP-Export und Baugruppen funktionieren ohne weitere Änderungen. Siehe
[Stufe-1-Plan](../knickrahmen/stufe1-plan.md).
