# ADR-0001: Bestehende Architektur und Geometrie-Kernel beibehalten

Status: vorgeschlagen · Datum: 24.10.2026

## Kontext

Die Planungsdokumente verlangen vor größeren Ausbauten (Knickrahmen, Blech, Baugruppen)
eine Entscheidung, ob der vorhandene Geometrie-Kernel ausreicht oder ein anderer
integriert werden muss. Das Audit ([current-state.md](../architecture/current-state.md))
zeigt:

- PBCAD nutzt bereits **OpenCascade als WASM über replicad** (replicad 1.2.0,
  replicad-opencascadejs 1.1.0) – einen echten
  B-Rep-Kernel mit Booleschen Operationen, Rundungen, Fasen, Schalen, Sweeps, Loft,
  STEP-Import/-Export und Hidden-Line-Projektion.
- Die Schichten sind schon weitgehend getrennt: `src/core` (fachliche Logik ohne
  Geometrie, in Node testbar), `src/kernel` (Geometrie-Adapter im Worker), `src/ui`
  (Darstellung und Bedienung), `electron` (Datei, Update, Infrastruktur).
- Das Projekt-JSON ist die Quelle der Wahrheit; Geometrie wird daraus jederzeit neu
  erzeugt.
- Körperprüfung (`BRepCheck_Analyzer`) ist im WASM-Build vorhanden, wird aber noch
  nicht genutzt.

## Entscheidung

1. **OpenCascade/replicad bleibt der Geometrie-Kernel.** Kein Wechsel, keine eigene
   Geometrie-Engine.
2. **Die Schichtung bleibt, wie sie ist.** Neue fachliche Logik (z. B. Knickrahmen-Pfad,
   Winkelregeln, Validierung) kommt als reines Modul nach `src/core/`, die
   Körpererzeugung als Feature-Typ in `src/kernel/build.js`, die Bedienung in
   `src/ui/`. Kein neues Framework, keine neue Abhängigkeit.
3. **Neue Bauteilfunktionen werden Feature-Typen** im bestehenden `features[]` eines
   Bauteils. Dadurch funktionieren Undo, Speichern, Cache, Zuschnittliste und STEP-Export
   ohne zusätzliche Wege.
4. **Körperprüfung wird schrittweise eingeführt**, zuerst nur für neue Features
   (Knickrahmen), später optional für alle – damit bestehende Modelle nicht plötzlich
   Warnungen zeigen.
5. **Dateiformat bleibt `version: 1`**, solange nur neue Feature-Typen hinzukommen.
   Sobald sich die Bedeutung bestehender Felder ändert, wird ein eigener ADR mit
   Migration geschrieben.

## Konsequenzen

- Positiv: kleinster Eingriff, alle vorhandenen Tests bleiben gültig, Knickrahmen-MVP
  nutzt erprobte Bausteine (`makeMember`, Gehrungslogik, Zuschnittliste).
- Negativ: OCCT-WASM ist groß (≈ 22 MB) und einzelne Operationen können bei
  ungünstigen Radien fehlschlagen (siehe Test „Fehler werden gemeldet“). Das bleibt so.
- Lizenz: OCCT steht unter LGPL-2.1. Vor kommerzieller Weitergabe prüfen, dass der
  Lizenztext im Installer liegt und die WASM-Datei austauschbar bleibt (sie liegt schon
  getrennt in `dist/`).
- Blechabwicklung ist mit OCCT nicht „fertig eingebaut“; dafür braucht es eine eigene,
  validierte Biegelogik. Das wird ein eigener ADR, bevor Blech umgesetzt wird.

## Verworfene Alternativen

- **Anderen Kernel integrieren** (z. B. kommerzielle Kernel): hohe Lizenzkosten,
  kompletter Umbau des Worker-Adapters, kein erkennbarer Vorteil für Profil- und
  Rahmenbau.
- **Eigene Geometrie für Knickrahmen** (nur Mesh/Visualisierung): widerspricht der
  Vorgabe „echte, gültige CAD-Volumenkörper“.
