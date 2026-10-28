# DSTV-NC (NC1) für Säge-, Bohr- und Brennanlagen

**Export → Werkstatt → DSTV-NC (Stahlbau)** schreibt für ein Bauteil oder eine Baugruppe je Position eine `.nc1`-Datei
nach der DSTV-Richtlinie „Standardbeschreibung für Stahlbauteile für die NC-Steuerung“, dazu ein Protokoll. Die
Fertigungsmappe enthält die Dateien im Ordner `NC/`.

## Was übertragen wird

| Teil | Inhalt |
|---|---|
| Stäbe (Profil, Rahmen, Gestell, Profilzug, Generatoren) | Kopf mit Profil, Code (I, U, L, T, M, RO, RU, B), Länge, Maßen, kg/m, Anstrichfläche, Gehrung Steg/Flansch je Ende; Bohrungen und Langlöcher je Fläche (BO); Signatur mit der Positionsnummer (SI) |
| Ebene Platten (Stirn-/Fußplatte, Knotenblech, Platten aus Skizzen) | Code B, Profil `BL<Dicke>`, Außenkontur mit Bögen (AK), runde Löcher als Bohrungen (BO), andere Öffnungen als Innenkontur (IK) |

Gleiche Stücke (gleiches Profil, gleiche Länge, Gehrungen, Bohrungen, Werkstoff) bekommen eine Position mit Stückzahl.
Positionen: Stäbe nach Profil und Länge, danach Platten. Dateiname `P001_IPE200.nc1`.

## Lage der Flächen

Wie im DSTV-Bild: `v` vorne (Steg), `h` hinten, `o` oben, `u` unten. x läuft ab dem Stabanfang. y auf `v`/`h` ab
Unterkante, auf `o` ab der Vorderkante, auf `u` ab der Hinterkante. Platten liegen ganz auf `v`, Ursprung links unten.
Beim ersten Einsatz an einer Anlage bitte ein Teil im NC-Programm der Anlage gegenprüfen.

## Was nicht übertragen wird (steht im Protokoll)

- gebogene Rohre und Knickrahmen (Abwicklung über die Biegeliste), Kantteile (Abwicklung als DXF),
- Ausklinkungen und freie Konturen am Stab (Kontur aus dem STEP),
- schräge oder nicht runde Bohrungen am Stab.
