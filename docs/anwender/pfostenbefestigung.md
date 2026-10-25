# Pfostenbefestigung an Geländern – Anleitung

Gilt für die Generatoren **Geländer**, **Treppe** (gerade, L, U), **Balkon** und **Spindeltreppe**. Die Felder stehen in
der Gruppe **Pfostenbefestigung** des Generators.

## Arten

| Art | Was entsteht | Wo |
|---|---|---|
| **oben mit Fußplatte** | Platte unter dem Pfosten, Bohrbild als Gegenbohrung im Bauteil darunter | Boden, Randprofil (z. B. U200), Wange, Holm, Podestrahmen, Stufe, Balkonbelag (Bohrungen auch im Rahmen) |
| **seitlich mit Befestigungsblech** | Blech an der Seitenfläche, Pfosten liegt am Blech an, Gegenbohrungen im Bauteil | Wange, Podestrahmen, Deckenstirn, Randprofil, Balkonrahmen außen |
| **Abstandsausgleich** (bei seitlich) | Flacheisen zwischen Blech und Pfosten: steckt durch einen Schlitz im Pfosten, Stecknasen greifen in Schlitze im Blech | wie seitlich, Abstand bis zum Höchstmaß |
| **einfache Fußplatte / aus** | wie bisher | alte Projekte öffnen unverändert damit |

Vorgaben für neue Teile: Treppe **seitlich**, Geländer **oben**, Balkon **oben**, Spindeltreppe **geschweißt** (Fußplatte je Stab wählbar).

## Was das Programm selbst macht

- **Pfosten rücken**, wenn die Platte am Bauteilende oder an der Stufenkante überstehen würde (höchstens ein Drittel des Feldes; Ecken bleiben stehen).
- **Blech verlängern** am Bauteilende (Eckpfosten am Podest, Balkonecke): das Bohrbild liegt ganz auf dem Bauteil und neben dem Pfosten.
- **Futterblech** bei kleiner Luft zwischen Blech und Bauteil (Vorgabe bis 20 mm, z. B. Podestrahmen hinter der Wangenflucht).
- **Eine Bohrreihe mittig**, wenn die Fläche für 4 Bohrungen zu niedrig ist (Hinweis).
- **Ausweichen**: seitlich ohne Bauteil daneben → Fußplatte oben (Antritt, Auslauf, Pfosten auf dem Podest); oben ohne Auflage → Blech seitlich. Nur wenn es passt; die Info-Zeile zählt es.

## Einzelne Pfosten

- **Einzelne Pfosten abweichend:** z. B. `4 aus; rechts 5 7 oben; links 2 seitlich`. Zahl = Pfosten- bzw. Stabnummer, Wörter wie `rechts`/`links` grenzen auf einen Geländerzug ein, am Ende die Art (`oben`, `seitlich`, `aus`). Die übrigen Pfosten bleiben unverändert.
- **Meldung am Pfosten:** Fährt man im Eigenschaftenfeld mit der Maus über eine Meldung »Pfosten 3: …«, wird dieser Pfosten mit Blech, Fußplatte und Flacheisen im 3D-Fenster hervorgehoben; der Fokus auf einem Befestigungsfeld hebt alle Bleche/Fußplatten hervor.
- **Befestigungsprofile wiederverwenden:** über »Vorlagen« des Generators (speichert alle Werte, auch die Befestigung).

## Prüfungen und Meldungen

Geprüft werden Randabstände in Platte und Bauteil (1,2 · d bzw. eigener Wert), Bohrungen auf Rundung, Steg oder Flansch,
vom Pfosten verdeckte Bohrungen, offene Seite von U-Profilen, Überstand, Kollision mit anderen Teilen (Hüllquader,
meldet eher zu viel), beim Flacheisen Höchstabstand, Nasen und Stege, Schlitzpassung, Einstecktiefe, Vollmaterial.

**Fehler** heißt: so nicht baubar, die Bohrung wird nicht übertragen. **Warnung**: prüfen. **Hinweis**: zur Kenntnis.

## Wichtig

- Die Prüfung ist **geometrisch**. Es gibt **keinen statischen Nachweis** (Dübel, Schrauben, Schweißnähte, Bauteil).
- Stecknasen sichern nur die Lage – Flacheisen mit Pfosten und Blech verschweißen.
- Bekannte Grenzen: Rundrohre als Anschlussfläche werden abgelehnt; sehr enges Treppenauge der U-Treppe (Blech schmaler wählen); Eckpfosten innen am L-Podest mit „oben“ (Platten überlappen).
