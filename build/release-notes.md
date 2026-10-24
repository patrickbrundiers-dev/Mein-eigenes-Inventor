**Neu in 0.4.0**

- **Zuschnittliste mit Regeln:** Der Dialog und die CSV-Datei erklären, wie Längen, Gehrungen und Knickrahmen-Abwicklungen gezählt werden. Gleiche Profile mit gleicher Länge werden mit Anzahl zusammengefasst.
- **Positionsnummern und Stückliste auf dem Blatt:** In Baugruppen-Zeichnungen setzt „Pos.-Nummern“ die Nummern automatisch an die Bauteile (verschiebbar, mit Entf löschbar). „Stückliste“ setzt eine Tabelle über das Schriftfeld. Beides geht mit in PDF, SVG und DXF.
- **Detailansicht:** Ansicht anklicken, „Detail“ wählen, dann Mittelpunkt und Rand des Ausschnitts klicken. WerkCAD setzt den Ausschnitt vergrößert (mindestens doppelter Maßstab) an eine freie Stelle und markiert ihn in der Ursprungsansicht mit Kreis und Buchstabe.
- **Kollisionsprüfung** (Baugruppe → Prüfen): listet Bauteile, die sich überschneiden, mit Schnittvolumen. Reine Berührung zählt nicht.
- **Abhängigkeit „Konzentrisch“:** richtet zwei Zylinderflächen auf eine gemeinsame Achse aus, z. B. Rohr in Bohrung.
- **Verständlichere Fehler im Feature-Baum:** Ein Feature, dessen Skizze oder Bezug fehlerhaft, unterdrückt oder gelöscht ist, sagt jetzt, wovon es abhängt und was zu tun ist.
- **Updates:** Der Ablauf wird im Fehlerprotokoll mitgeschrieben. Ein fehlgeschlagener Download zeigt eine Meldung mit „Erneut versuchen“. „Jetzt neu starten und installieren“ installiert still in den bisherigen Ordner und startet WerkCAD neu. Die Update-Prüfung zeigt bei Fehlern die genaue Meldung.
- Anleitung „Daten retten und ältere Version installieren“ im README.

Hinweis: Projekte mit der Abhängigkeit „Konzentrisch“ lassen sich in 0.3.0 öffnen, diese Abhängigkeit wird dort aber nicht gelöst. Detailansichten zeigt 0.3.0 als ganze Ansicht ohne Ausschnitt.
