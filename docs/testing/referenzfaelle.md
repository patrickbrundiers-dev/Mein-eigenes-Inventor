# Geometrie-Referenzfälle

Stand 25.10.2026 (Fusion-Abgleich FU14). `test/referenz-kernel.test.mjs` baut repräsentative Bauteile neu und vergleicht
sie mit den Sollwerten in `test/fixtures/referenz.json`.

| Fall | Was abgesichert ist |
|---|---|
| Beispielprojekt (Grundplatte, Rahmen, Rohr mit Gehrung) | Skizze/Extrusion/Bohrung/Rundung, Rahmen aus Skizze, Gehrung |
| Knickrahmen (Vorgabe 60×40×3) | V-Ausklinkung, gekantete Außenwand |
| Kantteil, Rohr gebogen | Abwicklungslänge, Biegeliste |
| Geländer über Eck, Tor, Treppe, Zaun | Generatoren: Stückzahl, Namen, Lage, Schnitte, Bohrungen |
| Gestell (Rechteck mit Mittelstab) | Einzelteile mit Gehrung und Auf Gestell stutzen |

Je Körper: Name, Art, Volumen, Hüllquader, Profil-ID, Zuschnittlänge, Gehrungen, Bohrungen, Abwicklung; je Fall die
Meldungen der Features. Toleranzen fest: Längen ±0,01 mm, Winkel ±0,01°, Volumen ±0,5 mm³ bzw. 1 ppm.

**Sollwerte erneuern** nur nach einer gewollten, geprüften Änderung an der Geometrie:

```
REFERENZ_NEU=1 node --stack-size=8000 --test test/referenz-kernel.test.mjs
```

Danach den Unterschied in `test/fixtures/referenz.json` im PR ansehen und begründen. Ein neuer Fall ohne Sollwerte lässt
den Test fehlschlagen, bis die Sollwerte angelegt sind. Die U200-Pfostenbefestigung kommt dazu, sobald #125 auf `main` ist.
