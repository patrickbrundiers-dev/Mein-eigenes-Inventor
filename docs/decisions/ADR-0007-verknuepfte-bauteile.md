# ADR-0007: Bauteile als eigene Dateien verknüpfen

Status: angenommen · Datum: 25.10.2026 · Plan: MegaCAD-Metall-Abgleich M24 · Bezug: [ADR-0004](ADR-0004-p2-zurueckgestellt.md) (PDM/Mehrbenutzer bleibt zurückgestellt)

## Kontext

Bisher liegt ein Projekt vollständig in einer .wcad-Datei. Für Wiederholteile (Fußplatte, Scharnier, Standard-Pfosten) und als Grundlage, dass zwei Leute an verschiedenen Teilen arbeiten, sollen Bauteile in eigenen Dateien liegen und in Baugruppen anderer Projekte verwendet werden können. Ein Server, Sperren oder Versionsverwaltung (PDM) sind nicht gewollt (ADR-0004).

## Entscheidung

- Ein verknüpftes Bauteil ist im Projekt ein normales Bauteil-Dokument **mit Kopie des Inhalts** und `link = { path, rel, docId, number, name, time }`. Das Projekt geht dadurch auch ohne die Quelldatei auf (letzte Kopie), Stückliste, Zeichnung und Export bleiben unverändert.
- Gelesen wird zuerst relativ zum Projektordner (`rel`), dann der absolute Pfad – ein Ordner mit Projekt und Teilen kann umziehen.
- Beim Öffnen eines Projekts werden alle Verknüpfungen aus ihren Dateien neu geladen; „Aktualisieren“ macht das auf Wunsch. Fehlt eine Datei, bleibt die Kopie und es kommt ein Hinweis.
- Im Projekt ist ein verknüpftes Bauteil **schreibgeschützt** (jede Änderung wird zurückgenommen, mit Hinweis). Geändert wird in der Quelldatei („Quelldatei öffnen“) oder man löst die Verknüpfung (dann wird es ein eigenes Bauteil dieses Projekts).
- „Als eigene Datei speichern“ schreibt ein Bauteil (mit seinem eigenen Werkstoff) in eine neue .wcad-Datei und verknüpft es.
- Die Desktop-App liest Verknüpfungen über einen eigenen, auf .wcad beschränkten Kanal (`link:read`), der „Zuletzt geöffnet“ nicht verändert. Im Browser lässt sich verknüpfen, aber nicht aktualisieren.

## Nicht enthalten

Verknüpfte Baugruppen (nur Bauteile), Sperren gegen gleichzeitiges Bearbeiten, automatisches Nachladen bei Dateiänderung, Versionsstände.

## Folgen

- Die Projektdatei wird nicht kleiner (Kopie), dafür bleibt sie in sich vollständig.
- Wer eine Quelldatei ändert, sieht die Änderung in anderen Projekten beim nächsten Öffnen oder Aktualisieren.
