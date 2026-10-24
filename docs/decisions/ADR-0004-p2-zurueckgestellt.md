# ADR-0004: P2-Themen zurückgestellt

Status: angenommen · Datum: 24.10.2026 · Plan Abschnitt 8

## Kontext

Der Plan verlangt vor jedem P2-Projekt eine Nutzen-/Kosten-/Risikoentscheidung und sagt: P2 darf die Knickrahmen- und Fertigungsbasis nicht verzögern.

| Thema | Nutzen heute | Kosten / Risiko | Entscheidung |
|---|---|---|---|
| FEM/Simulation | gering, Rahmen werden nach Erfahrung dimensioniert | Solver-Lizenz, Validierung, Haftung bei falschen Ergebnissen | zurückgestellt |
| CAM/CNC-Postprozessor | gering, der Rohrlaser hat eigene Software (STEP/CSV-Import) | ungeprüfte Bahnen sind gefährlich | zurückgestellt; Übergabe bleibt STEP + Zuschnittliste |
| Verschachtelung | mittel (Materialausnutzung) | Rohrlaser-Software verschachtelt selbst | zurückgestellt |
| Fotorealistisches Rendering | gering | bremst die CAD-Ansicht | zurückgestellt |
| PDM/Cloud/Mehrbenutzer | gering, ein Anwender | Datenschutz, Konflikte, Betrieb eines Servers | zurückgestellt |
| ERP/MES | gering | Schnittstellenvertrag fehlt | zurückgestellt |

## Entscheidung

Kein P2-Projekt wird jetzt begonnen. Die Zeit geht in P1 (Fertigung, Baugruppen) – siehe `docs/roadmap/p1-backlog.md`.

## Wiedervorlage

Ein Thema wird neu bewertet, wenn Patrick einen konkreten Fall nennt (z. B. „Rahmen muss X kg tragen“ → FEM, „Maschine Y braucht Format Z“ → CAM/Export).
