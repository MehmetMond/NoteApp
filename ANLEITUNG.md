# Notizen für das Surface Pro 11 (Version 1.5.1)

## Neu in 1.5.1: Animationen
- **Animationen auf der Startseite:** Ein Buch fliegt beim Öffnen in die Mitte und schlägt wie ein echtes dickes Buch in der Mitte auf (die Seiten wölben sich in die Falz, der Rücken hält die Deckel zusammen, außen sieht man den Schnitt), dann gibt es den Blick auf seine Seiten frei; beim Zurückgehen klappt es zu und stellt sich wieder ins Regal. Ein neues Buch fliegt aus dem Dialog an seinen Platz im Regal und geht dann auf. Ist im System „Bewegung reduzieren“ eingeschaltet, wird ohne Animation umgeschaltet.
- **Tab-Symbol** in der Browser-Version: im Browser-Tab steht jetzt das Symbol der App statt eines grauen Felds.

## Neu in 1.5.0: Seitenformate und PDF-Export
- **Seitenformat:** Bei „Neue Seite“ fragt die App, ob die Seite eine unendliche Fläche oder ein Dokument aus Blättern DIN A4 bzw. DIN A3 sein soll, und bei DIN hoch oder quer. Vorausgewählt ist das Format der letzten Seite im Buch. Die Blätter liegen untereinander auf einem grauen Tisch; Punkte, Kästchen und Linien passen genau ins Blatt (mit gleichmäßigem Rand, bei A3 quer jede Hälfte für sich). Was über den Rand geschrieben wird, bleibt sichtbar, kommt aber nicht in den Export.
- **Blatt hinzufügen:** Knopf mit Blatt und Plus in der Leiste (nur bei DIN-Seiten), daneben z. B. „3 / 12“ für das Blatt in der Mitte des Bildschirms. Das neue Blatt kommt hinter das aktuelle; Rückgängig nimmt es wieder weg.
- **PDF auf DIN-Seiten:** Jede PDF-Seite kommt auf ein eigenes Blatt im selben Dokument, ein PDF mit 12 Seiten ergibt 12 Blätter. Die erste PDF-Seite landet auf dem aktuellen Blatt (liegt dort schon ein PDF, auf einem neuen dahinter), die weiteren auf neuen Blättern direkt dahinter. Bei **DIN A3 quer** kommt jede PDF-Seite auf die linke Hälfte, rechts bleibt eine A4-Seite frei für Notizen.
- **Als PDF exportieren** (unter „⋯“): DIN-Seiten ergeben ein PDF mit einer Seite pro Blatt, genau A4/A3; unendliche Seiten eine Seite so groß wie der beschriebene Bereich. Das PDF ist immer hell, auch im Darkmode. „Als Bild exportieren“ speichert bei DIN-Seiten das aktuelle Blatt.

## Neu in 1.4.2
- Beim Aufsetzen und Abheben des Stifts blitzt kein Fadenkreuz mehr auf.

## Neu in 1.4.1
- **Stift-Vorschau:** Schwebt der Stift über der Seite, zeigt ein durchsichtiger Punkt in Farbe und Dicke des Stifts bzw. Textmarkers, wo und wie dick der Strich wird. Das Fadenkreuz gibt es dafür nicht mehr.

## Neu in 1.4
- **Bücher:** Die Startseite ist jetzt ein Regal. Mit „Neues Buch“ legst du z. B. „Mathe“ mit Titel und Farbe an, darin liegen die Seiten in ihrer Reihenfolge. Über „⋯“ an einem Buch kannst du es umbenennen, die Farbe ändern oder es löschen. Über „⋯“ an einer Seite kannst du sie umbenennen, in ein anderes Buch verschieben oder löschen. Deine bisherigen Notizen liegen im Buch „Meine Notizen“.
- **Formen** (Formen-Knopf neben dem Textmarker, Taste F): Linie, Pfeil, Doppelpfeil, Rechteck, Ellipse, Dreieck, rechtwinkliges Dreieck und Raute. Einfach aufziehen. Fast gerade Linien und fast quadratische Formen werden automatisch gerade bzw. quadratisch, mit der Umschalttaste immer.
- **Graphen:** Im selben Menü gibt es ein Koordinatensystem (x, y), eines nur mit positiven Achsen und ein 3D-Achsenkreuz (x, y, z). Ein Graph lässt sich mit dem Lasso durch einmal Antippen als Ganzes auswählen.
- **Eigene Formen:** Zeichne etwas, markiere es mit dem Lasso und tippe „Als Form speichern“. Danach steht es im Formen-Menü unter „Eigene Formen“: antippen setzt es in Originalgröße, aufziehen in beliebiger Größe, so oft du willst. Mit dem × löschst du eine Form aus der Liste.
- **Am Raster ausrichten** (Magnet-Knopf neben dem Hintergrund, Taste G): Formen, Graphen, verschobene Auswahlen, Bilder und PDF-Seiten rasten an den Punkten bzw. Kästchen ein. Normales Schreiben bleibt frei.

## Neu in 1.3
- Ein Strich ist jetzt immer gleich dick, egal bei welchem Zoom er geschrieben wurde (wie bei GoodNotes). Wer reinzoomt, sieht die Schrift größer, aber im Verhältnis gleich dick.
- Fünf Stiftdicken und vier Textmarker-Dicken. Die gewählte Dicke **nochmal antippen**, dann lässt sie sich mit einem Schieberegler fein einstellen (Stift 0,5 bis 30, Textmarker 4 bis 80). Die Einstellung bleibt gespeichert.
- Ältere Striche behalten ihre Dicke. Wer sie angleichen will: mit dem Lasso markieren, Dicke wählen, **Dicke übernehmen** antippen.

## Starten ohne Installation (empfohlen)
1. `Notizen-1.5.1-arm64-ohne-Installation.zip` auf das Surface laden, rechtsklicken und **Alle extrahieren** wählen.
2. Im entpackten Ordner `Notizen\Notizen.exe` starten. Für eine Verknüpfung: rechtsklicken, **Weitere Optionen anzeigen**, **Senden an**, **Desktop (Verknüpfung erstellen)**.
3. Beim Wechsel von einer älteren Version das Programm schließen und den alten Ordner `Notizen` durch den neuen ersetzen. Die Notizen bleiben erhalten, sie liegen getrennt unter `%APPDATA%\Notizen`.
4. Hinweis: Nach dem ersten Start von 1.4 kann eine ältere Version die Notizen nicht mehr öffnen. Wer sicher gehen will, tippt vorher in der alten Version auf **Sichern**.

## Installieren (alternativ)
1. `Notizen-1.5.1-arm64.zip` entpacken und `Notizen-Setup-1.5.1-arm64.exe` doppelklicken.
2. Windows zeigt beim ersten Mal „Der Computer wurde durch Windows geschützt“, weil das Programm nicht signiert ist. Auf **Weitere Informationen** und dann **Trotzdem ausführen** klicken.
3. Neue Versionen einfach über die alte installieren, die Notizen bleiben erhalten.

## Auf dem iPad (oder in jedem Browser)
1. In **Safari** öffnen: <https://mehmetmond.github.io/NoteApp/>
2. Auf **Teilen** tippen, dann **Zum Home-Bildschirm**. Ab jetzt die App immer über dieses Symbol starten: Sie läuft dann im Vollbild, startet nach dem ersten Mal auch ohne Internet und aktualisiert sich von selbst, sobald Internet da ist.
3. Die Notizen liegen nur auf dem iPad und sind getrennt von denen in einem normalen Safari-Tab. Notizen vom Surface holen: dort **Sichern**, die Datei z. B. über iCloud Drive oder AirDrop aufs iPad bringen und auf dem iPad **Wiederherstellen** tippen. **Sichern** öffnet auf dem iPad das Teilen-Menü („In Dateien sichern“, AirDrop, Mail …).
4. Radieren geht mit dem Apple Pencil über das Radierer-Werkzeug in der Leiste (der Pencil hat keine Taste, die eine Webseite auswerten kann).

## Wenn das Programm nicht startet
- Im Task-Manager alle Einträge „Notizen“ beenden und neu starten.
- Nach einem hängenden Start schaltet das Programm automatisch auf eine einfachere Darstellung um. Ein zweiter Klick auf das Symbol löst das sofort aus.
- Das Protokoll liegt unter `%APPDATA%\Notizen\notizen-log.txt` (in die Adresszeile des Explorers eingeben).

## Bedienung
| Was | Wie |
|---|---|
| Schreiben | Surface Pen (druckempfindlich) |
| Strichstärke | Punkte in der Leiste; die gewählte nochmal antippen für den Schieberegler |
| Formen und Graphen | Formen-Knopf (F), dann aufziehen; nochmal antippen öffnet die Auswahl |
| Am Raster ausrichten | Magnet-Knopf (G) an/aus |
| Radieren | Radierer-Ende des Stifts oder die Taste am Stift gedrückt halten, oder Radierer-Werkzeug |
| Verschieben | Ein Finger ziehen |
| Zoomen | Zwei Finger auseinander/zusammen |
| Rückgängig | Mit zwei Fingern kurz tippen, oder Strg+Z |
| Auswählen | Lasso-Werkzeug: Kreis um Schrift oder Bilder ziehen, dann verschieben, über den blauen Punkt skalieren, löschen, duplizieren, umfärben, Dicke angleichen oder als eigene Form speichern |
| Bild einfügen | Bild-Knopf, Strg+V oder Datei ins Fenster ziehen |
| PDF einfügen | PDF-Knopf oder PDF ins Fenster ziehen, jede Seite wird zum Beschriften eingefügt (auf DIN-Seiten: eine PDF-Seite pro Blatt, bei A3 quer links) |
| Seitenformat | Beim Anlegen einer Seite: Unendlich, DIN A4 oder DIN A3, hoch oder quer |
| Blatt hinzufügen | DIN-Seiten: Knopf mit Blatt und Plus, neues Blatt hinter dem aktuellen |
| Exportieren | „⋯“: Als PDF exportieren oder Als Bild exportieren (PNG) |
| Hintergrund | Punkte-Knopf: Punkte, Kariert, Liniert, Leer |
| Darkmode | Mond-Knopf |
| Vollbild | F11 |

Der Handballen wird beim Schreiben ignoriert. Wer mit dem Finger zeichnen will, schaltet das unter „⋯“ ein.

## Speichern und Sichern
Alles wird automatisch auf dem Surface gespeichert, ohne Konto und ohne Cloud, auch beim Schließen des Fensters. Mit **Sichern** auf der Startseite entsteht eine `.notizen`-Datei mit allen Büchern, Seiten und eigenen Formen, die man mit **Wiederherstellen** wieder laden kann (z. B. auf einem neuen Gerät).
