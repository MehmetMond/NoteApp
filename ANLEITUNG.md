# Notizen für das Surface Pro 11 (Version 1.6.3)

## Neu in 1.6.3: Desktop-App mit neuem Chromium, sparsamer
- **Neues Chromium in der Desktop-App:** Die Windows-App läuft jetzt auf Electron 45 (Chromium 156) statt Electron 38 (Chromium 140), dieselbe Generation wie aktuelle Browser und mit allen Sicherheitsupdates. Auf dem PC gemessen braucht sie fürs Schreiben, Tape, Formen und Verschieben zusammen etwa ein Fünftel weniger Rechenzeit.
- **Keine Akku-Falle mehr beim Start:** Ein zweites Antippen des Symbols, während die App noch lädt, schaltet sie nicht mehr dauerhaft auf Darstellung ohne Grafikkarte (dann zeichnet der Prozessor alles, das kostet viel Akku). Musste die App einmal ohne Grafikkarte laufen, versucht sie es nach einem Update wieder mit.
- **Protokoll:** `%APPDATA%\Notizen\notizen-log.txt` zeigt bei jedem Start, ob die Grafikbeschleunigung läuft.

## Neu in 1.6.2: Mehrere Bilder in einer Notiz, Zoomen in Notizen, Notiz geht mit ihrer Stelle, flüssigerer Werkzeugwechsel
- **Mehrere Bilder in einer Notiz:** „Einfügen“, „Bild“ (jetzt auch mehrere Dateien auf einmal), Strg + V und Bilder, die man auf die Karte zieht, kommen zu den Bildern der Notiz dazu, statt das bisherige zu ersetzen. Mehrere Bilder stehen nebeneinander in einer Reihe: mit dem Finger wischen (oder mit dem Mausrad) blättert durch. Ein Bild antippen zeigt die Bilder groß, das angetippte in der Mitte, zum Durchwischen; nochmal antippen wieder klein. Jedes Bild hat sein eigenes ✕. Notizen mit einem Bild bleiben, wie sie sind.
- **In einer Notiz zoomen:** Mit zwei Fingern auf der Schreibfläche auseinanderziehen zoomt hinein (bis 800 %), mit zwei Fingern schieben bewegt den Ausschnitt. Mit der Maus: Strg + Mausrad zoomt um den Zeiger, das Mausrad allein schiebt. Unten rechts zeigt ein kleiner Knopf den Zoom (zum Beispiel „250 %“), ein Tipp darauf geht zurück auf 100 %. Geschrieben, radiert und getapet wird genau dort, wo der Stift ist; jede Notiz öffnet wieder mit 100 %.
- **Notiz geht mit ihrer Stelle:** Ist das, was eine Notiz markiert, ganz weg (zum Beispiel mit dem Radierer weggewischt oder der Text gelöscht), verschwindet auch die Notiz mit ihrem „i“. Solange noch ein Teil der Stelle da ist, bleibt sie. Rückgängig holt beides zurück.
- **Flüssigerer Werkzeugwechsel:** Der Wechsel zwischen Tape, Formen, Stift und Textmarker baut die Leiste nicht mehr jedes Mal neu auf (die kleinen Tape- und Marker-Vorschauen werden gemerkt, die Leiste wird nicht jedes Mal neu ausgemessen).
- **Radierer:** Auch beim schnellen Wischen werden dünne Striche erwischt, die zwischen zwei Stiftpositionen liegen. Radieren stockt nicht mehr: es wird nur noch dort neu gezeichnet, wo etwas weggewischt wurde.
- **Rückgängig, Verschieben und Radieren ohne Stocken:** Es wird nur noch dort neu gezeichnet, wo sich etwas ändert, statt ganzer Bereiche der Seite (mit gebremstem Prozessor gemessen: Rückgängig 148 → 61 ms, eine Auswahl verschieben 530 → 206 ms).
- **Zoomen mit zwei Fingern flüssiger:** Während des Zoomens werden keine Bereiche mehr gezeichnet, die beim Loslassen gleich wieder verworfen würden; die Ränder zeigt solange die Vorschau der ganzen Seite.
- **PDF-Seiten öffnen:** Beim Öffnen wartet die Seite einen Augenblick auf die sichtbaren Bilder, statt erst graue Flächen zu zeichnen und dann alles noch einmal; die scharfe Fassung lädt gleich mit.
- **Textmarker und Tape beim Ziehen sparsamer:** Die Stelle am Ende wird so geleert, dass die Grafik des Surface nur diese kleine Fläche bearbeitet statt den ganzen Bildschirm – flüssiger und akkufreundlicher.
- **Schneller im Hintergrund:** Ein großes Lasso über viele Striche wählt beim Loslassen deutlich schneller aus. Gespeichert wird nicht mehr, während der Stift auf der Seite ist, und meist nur das Neue. Beim Verschieben und Zoomen mit einer Auswahl rechnen Auswahlleiste und Formen-Fenster nicht mehr in jedem Bild alles neu.

## Neu in 1.6.1: Textmarker neu, flüssiger auf dem Surface
- **Textmarker neu:** gleichmäßig breit mit weichen Kurven und runden Ecken (keine Kanten mehr in Kurven), flache Enden genau dort, wo der Stift aufsetzt und abhebt – nichts steht über.
  - **Überlappen wird nicht dunkler:** Wo sich Textmarker überlappen, bleibt die Fläche einfarbig und gleich hell; bei verschiedenen Farben liegt die zuletzt gezogene oben.
  - **Schon beim Ziehen richtig:** Der Marker liegt beim Ziehen unter der Schrift, unter Formen und Tapes (auch im Darkmode bleibt weiße Schrift weiß), und Überlappungen bleiben gleich hell – wie nach dem Loslassen.
- **Flüssiger auf dem Surface:** Beim Loslassen von Tape, Textmarker und von Formen oder Strichen in der Nähe eines Tapes stockte die App kurz, weil ganze Kacheln neu gezeichnet wurden. Jetzt kommt ein neues Tape einfach obendrauf (Tapes liegen immer oben), sonst werden nur schmale Streifen entlang des neuen Strichs neu gezeichnet.
- **Tape beim Ziehen:** Es wird nur noch das Ende neu gezeichnet, nicht in jedem Bild das ganze Tape mit allen Figuren.
- **Tape antippen ohne Aufblitzen:** Beim Antippen (zum Auf- und Abdecken) erscheint kein dünnes Tape-Stück mehr; ein neues Tape zeigt sich erst, wenn der Stift sich wirklich bewegt. Genauso in einer Notiz.
- **Form nachträglich ändern:** Im kleinen Fenster neben einer mit dem Lasso gewählten Form gibt es jetzt auch **Farbe** und **Dicke** (wie beim Stift), jede Änderung ein Schritt für Rückgängig.

## Neu in 1.6.0: Text auf der Seite, Notizen an markierten Stellen, Formen mit Stil, Cornell-Seite
- **Formen mit eigenem Knopf und eigener Leiste:** „Formen“ hat jetzt links in der Leiste einen eigenen Knopf, gleich nach „Text“ (Taste F); er zeigt die gewählte Form. Solange Formen gewählt ist, steht direkt unter der Leiste, dort wo Farben und Dicken sind, die **Formenleiste**: alle Formen, die drei Koordinatensysteme mit dem Knopf für ihre Einstellungen, die eigenen Formen (der Knopf klappt sie auf und zeigt danach die gewählte) und rechts Kontur, Kanten, Sauberkeit und Füllung – alles mit einem Tipp. Farben und Dicken bleiben, wo sie sind. **Lasso** (Taste L) und **Tape** (Taste T) haben ebenfalls je einen eigenen Knopf. Damit alles in eine Zeile passt, wird das Feld mit dem Namen der Seite bei Bedarf schmaler (der Name endet dann mit „…“, ganz steht er beim Draufzeigen und beim Antippen).
- **Neue Form bleibt ausgewählt:** Nach dem Zeichnen ist die Form ausgewählt (gestrichelter Rahmen). Was du gleich danach in der Formenleiste antippst (Kontur, Kanten, Sauberkeit, Füllung) oder bei Farben und Dicken, gilt auch für sie – jede Änderung ist ein Schritt für Rückgängig, und danach bleibt sie ausgewählt. Wo anders ziehen (auch gleich an ihrer Ecke) zeichnet die nächste Form, ein Tipp daneben oder ein anderes Werkzeug hebt die Auswahl auf. Was du selbst ausgewählt hast (Lasso, Taste am Stift), lässt sich auch im Formen-Werkzeug wie gewohnt verschieben.
- **Füllung:** ganz rechts in der Formenleiste: ohne, Schraffur, Kreuzschraffur oder gefüllt (eine zarte Fläche in der Farbe der Form, Kontur und was darunter steht bleiben sichtbar). Gilt für Rechteck, Ellipse, die Dreiecke und die Raute, auch mit runden Kanten und von Hand. Eine gefüllte Form lässt sich mit dem Lasso auch innen antippen; eigene Formen und die Sicherung behalten die Füllung.
- **Pfeile und Linien biegen:** Pfeil, Doppelpfeil und Linie haben in der Mitte einen kleinen weißen Punkt, gleich nach dem Zeichnen und wenn sie mit dem Lasso ausgewählt sind. Den Punkt ziehen biegt sie zu einer Kurve durch diesen Punkt; die Spitzen folgen der Richtung der Kurve. Zurück in die Mitte gezogen werden sie wieder gerade. Dazu je ein Punkt an Anfang und Spitze: ziehen versetzt dieses Ende (mit „Am Raster ausrichten“ rastet es ein), ein Bogen bleibt erhalten. Kontur und Sauberkeit bleiben, Verschieben, Vergrößern und Duplizieren nehmen den Bogen mit, Rückgängig macht ihn rückgängig.
- **Breite und Höhe einzeln:** Rechteck, Ellipse, Dreiecke und Raute haben, wenn sie ausgewählt sind (gleich nach dem Zeichnen oder mit dem Lasso), an jeder Seite einen kleinen Griff, etwas außerhalb der Form: rechts oder links ziehen ändert nur die Breite, oben oder unten nur die Höhe. An der Kante selbst gegriffen wird die Form wie gewohnt verschoben. Kanten, Füllung und Kontur bleiben, mit Raster rastet die Seite ein.
- **Form nachträglich ändern:** Wählst du Formen mit dem Lasso aus (zum Beispiel ein Rechteck oder einen Pfeil, nur Formen), erscheint rechts daneben ein kleines Fenster mit **Kontur, Kanten, Sauberkeit und Füllung**. Was du dort antippst, gilt sofort für die ausgewählten Formen, jede Änderung lässt sich einzeln rückgängig machen; der Stil für neue Formen bleibt, wie er ist. Es zeigt, was gerade eingestellt ist, und nur, was zur Form passt: Kanten bei Rechteck, Dreiecken und Raute, Füllung bei Rechteck, Ellipse, Dreiecken und Raute. Beim Verschieben verschwindet es kurz und kommt danach wieder.
- **Dicken als Vorschau:** Bei Textmarker und Tape zeigen die Dicken in der Leiste ein kurzes Stück statt eines Punkts: das Tape im gewählten Muster und seiner Farbe mit gerissenen Enden, der Textmarker als kleiner Schwung in seiner Farbe, so wie ein kurzer Strich mit dem Marker. Die vier Knöpfe reichen bis zu den Einstellungen, ohne Lücke.
- **Tapes liegen immer oben:** Ein Tape deckt alles darunter ab, auch Striche, die erst später gezogen werden (zum Beispiel über ein aufgedecktes Tape). Was auf ein abgedecktes Tape geschrieben wird, liegt wie bisher darauf. Genauso in der Schreibfläche einer Notiz.
- **Textmarker wie ein echter Marker:** gerade abgeschnittene, flache Enden statt runder wie beim Stift – schon beim Ziehen. Auch lange Striche zeichnen dabei so flüssig wie der Stift.
- **Tape in einer Notiz ohne Ruckeln:** Auch lange Tapes lassen sich in der Schreibfläche einer Notiz flüssig ziehen; der leichte Schatten kommt beim Loslassen dazu (auf der Seite ebenso).
- **Vorschau der Glättung:** zeigt jetzt eine Schreibprobe wie Handschrift (ℓℓℓℓ) statt einer gleichmäßig zittrigen Welle: bei „Aus“ so, wie geschrieben, mit mehr Glättung ruhiger und in engen Schlaufen runder.
- **Stil der Formen (wie bei Excalidraw):** in der Formenleiste rechts drei kleine Umschalter. Er gilt für Linie, Pfeil, Doppelpfeil, Rechteck, Ellipse, die Dreiecke und die Raute; die Wahl bleibt gespeichert, bis sie geändert wird. Schon gezeichnete Formen bleiben, wie sie sind.
  - **Kontur:** durchgezogen, gestrichelt oder gepunktet. Die Striche und Punkte werden so verteilt, dass sie aufgehen: Linien und Pfeile beginnen und enden mit einem Strich, Rechteck, Dreiecke und Raute haben in jeder Ecke einen Winkel bzw. einen Punkt. Pfeilspitzen bleiben gefüllt. Dickere Stifte geben längere Striche.
  - **Kanten:** eckig oder rund (Rechteck, Dreiecke, Raute; die Rundung passt sich der Größe an).
  - **Sauberkeit:** exakt, leicht von Hand (Kanten leicht gebogen, Ecken etwas versetzt, kleine Überstände) oder skizzenhaft (stärker und zweimal nachgezogen). Jede Form wackelt anders; beim Ziehen bleibt die Vorschau ruhig.
  - Koordinatensysteme und eigene Formen bleiben immer genau. Ist eines davon gewählt, wechselt ein Tipp auf einen Stil zum Rechteck. Eigene Formen aus gestrichelten oder gepunkteten Formen behalten ihre Kontur.
- **Ein einzelnes Tape an- und ausschalten:** Ein Tape antippen (mit dem Finger oder mit dem Tape-Werkzeug) deckt es wie bisher sofort auf oder ab. Dazu erscheint jetzt eine kleine Blase am Tape: der Schalter **„Abgedeckt“** schaltet genau dieses Tape um, der Mülleimer entfernt es (mit dem, was darauf geschrieben ist; Rückgängig holt es zurück). Darunter die Farben und alle Muster, auch die Figuren: ein Tipp gibt genau diesem Tape Farbe oder Muster (Figuren bringen ihre Farbe mit). Der nächste Tipp schließt die Blase und wirkt trotzdem, so lassen sich beim Lernen mehrere Tapes nacheinander aufdecken. „Alle aufdecken“ und „Alle abdecken“ in den Einstellungen des Tapes gibt es weiterhin.
- **Tape-Muster:** Das gewählte Muster hat jetzt selbst einen blauen Rand, der seiner Form folgt (statt eines Kastens darum); die Tape-Stücke im Menü werden nicht mehr abgeschnitten. Genauso in den Werkzeugen der Notiz.
- **Cornell-Seite zum Lernen:** Beim Anlegen einer neuen Seite gibt es neben Unendlich, DIN A4 und DIN A3 die Karte „Cornell“ (DIN A4 hoch). Die Seite ist aufgeteilt wie bei der Cornell-Methode (Walter Pauk): oben das Thema, links eine Spalte für Stichworte und Fragen (etwa 6,35 cm), rechts die Notizen, unten die Zusammenfassung (etwa 5 cm); Stichworte und Zusammenfassung sind zart getönt. Die Linien liegen auf dem Raster, weitere Blätter bekommen dieselbe Aufteilung, der PDF-Export auch.
  - **So lernt man damit:** In der Vorlesung rechts mitschreiben. Danach links zu jedem Abschnitt Stichworte und Fragen notieren und unten in ein, zwei Sätzen zusammenfassen. Zum Wiederholen oben rechts in der Notizen-Spalte auf **„Verdecken“** tippen: die Notizen werden unscharf, die Fragen links bleiben lesbar. Fragen aus dem Kopf beantworten, dann mit **„Aufdecken“** (oder einem Fingertipp auf die Notizen) nachsehen. Der PDF-Export zeigt die Notizen immer scharf.
- **Aussehen:** Der Windows-XP-Stil ist vorerst ausgeschaltet, die App sieht wieder modern aus (das Aussehen wird später neu gestaltet).
- **Text schreiben:** Werkzeug „Text“ (eigener Knopf oben in der Leiste, gleich nach dem Textmarker; Taste X). Dafür ist „PDF einfügen“ jetzt im Menü des Bild-Knopfs, neben „Aus der Zwischenablage“ und „Bild aus einer Datei“. Auf die Seite tippen öffnet ein Textfeld, dort wird getippt (auf dem Surface mit der Bildschirmtastatur). Ziehen statt Tippen legt die Breite fest.
  - **Leiste darüber:** Schrift (Standard, Calibri, Times, Schreibmaschine, Handschrift, Comic), Größe (A− / A+), Ausrichtung links, mittig, rechts – für den ganzen Text. Fett, Kursiv, Unterstrichen, Durchgestrichen und Farbe gelten für den markierten Text wie in Word (auch Strg + B, I, U); ohne Markierung für das, was als Nächstes getippt wird.
  - **Tape-Muster:** im Menü des Tapes (Einstellungen) jetzt als kleine Tape-Stücke wie in der Notiz, alle in einer Reihe; der Name des gewählten steht oben neben „Muster“.
  - **Breite und Lage:** der Griff rechts am Textfeld ändert die Breite, am kleinen Dreieck unten rechts lässt sich das Feld beim Schreiben verschieben (mit „Am Raster ausrichten“ rastet es ein). Der Text bricht auf der Seite genauso um wie im Textfeld.
  - **Fertig:** daneben tippen, Esc oder ✓ – ein Schritt für Rückgängig. Ein leeres Textfeld verschwindet, der Mülleimer löscht den Text.
  - **Bearbeiten:** einen Text mit dem Text-Werkzeug antippen (der Cursor steht, wo getippt wurde). Mit dem Lasso lässt er sich verschieben, größer und kleiner machen, duplizieren, löschen und mit einer Notiz versehen.
- **Notiz anlegen:** Mit dem Lasso etwas auswählen (ein Wort, eine Formel, ein Bild) und in der Leiste darüber auf „Notiz“ tippen. Es öffnet sich eine kleine Karte:
  - **Einfügen:** holt aus der Zwischenablage ein Bild (zum Beispiel einen Screenshot; es kommt zu den Bildern der Notiz) oder Text (er kommt ins Textfeld, dorthin, wo der Cursor steht); mit Tastatur geht auch Strg + V. „Bild“ nimmt Bilder aus Dateien (auch mehrere auf einmal); Bilder lassen sich auch auf die Karte ziehen. Mehrere Bilder stehen nebeneinander in einer Reihe (wischen blättert). Ein Bild antippen zeigt die Bilder groß, nochmal antippen wieder klein; das ✕ auf einem Bild entfernt es.
  - **Text:** ein Feld für einen kurzen Text zum Tippen.
  - **Werkzeuge:** Der Knopf oben links in der Schreibfläche zeigt Werkzeug und Farbe; ein Tipp klappt Stift, Textmarker, Tape und Radierer mit Farben, Tape-Mustern und Dicken auf (dieselben wie in der Leiste der Seite). Farbe, Muster oder Dicke gewählt: die Auswahl geht wieder zu. Der Textmarker liegt unter der Schrift, das Tape deckt ab (mit dem Tape oder dem Finger antippen: auf- und wieder zudecken, was darauf steht, verschwindet mit).
  - **Schreibfläche:** darunter mit dem Stift hineinschreiben oder skizzieren, auf demselben Papier wie die Seite und genau wie auf der Seite (Farbe, Dicke, Glättung, Punkt beim Schweben). Das umgedrehte Stiftende radiert, „Leeren“ löscht alles Geschriebene.
  - **Groß:** Der Pfeil oben rechts in der Schreibfläche öffnet die Notiz in einem eigenen Fenster in der Mitte (etwa 85 % des Bildschirms, der Rest wird abgedunkelt): oben eine Leiste mit den Bildern, Text und Knöpfen, darunter die Schreibfläche über die ganze Breite. Der Pfeil darin führt zurück zur kleinen Karte, daneben tippen schließt die Notiz (gespeichert). Was im großen Fenster geschrieben wurde, zeigt die kleine Karte verkleinert, damit alles zu sehen ist.
  - Der Mülleimer entfernt die ganze Notiz.
- **Speichern:** beim Schließen der Karte (daneben tippen, Esc oder im XP-Stil das rote ✕), als ein Schritt für Rückgängig. Bleibt die Karte leer, entsteht keine Notiz; wird sie später ganz geleert, ist die Notiz weg.
- **Markierung:** Oben rechts an der Stelle steht ein kleines blaues „i“; die Stelle selbst bleibt, wie sie ist.
- **Öffnen:** mit dem Finger auf die Stelle oder das „i“ tippen, mit dem Stift (auch mit dem Lasso) auf das „i“ tippen, oder die Stelle auswählen und „Notiz“.
- **Zusammen:** Die Stelle und ihre Notiz gehören zusammen. Auswählen, Verschieben, Duplizieren und Löschen nehmen beides mit. Der Radierer lässt das „i“ stehen, „Farbe übernehmen“ ändert es nicht. Bilder der Notizen kommen mit in die Sicherung.

## Neu in 1.5.13: Rauszoomen ohne leere Ränder
- **Rauszoomen ohne leere Ränder:** Beim Rauszoomen oder schnellen Verschieben war am Rand kurz nur leeres Papier zu sehen, bis die neuen Stellen gezeichnet waren. Jetzt zeigt die Seite dort sofort eine leicht unscharfe Vorschau der ganzen Seite, die Sekundenbruchteile später scharf wird. Die Vorschau wird nur im Leerlauf gezeichnet (bei 5.000 Strichen in wenigen Millisekunden); beim Schreiben kommen neue Striche einzeln dazu, nach Radieren oder Verschieben wird sie nach kurzer Ruhe neu gezeichnet. Im Hintergrund läuft dafür nichts dauerhaft.

## Neu in 1.5.12: Aussehen wie Windows XP, neue Pfeile
- **Aussehen wie Windows XP:** Die ganze App sieht aus wie ein Programm unter Windows XP.
  - Startseite und Buch wie ein Explorer-Fenster: blaue Titelleiste, beige Leiste, grüner Knopf „Neues Buch“, die Seiten als Vorschaubilder.
  - Die Bücher sehen aus wie Computerbücher von damals, jedes in seiner Farbe: Himmel mit Wolken über einem Hügel, der Name groß und durchscheinend im Hintergrund, die Zahl der Seiten auf einem orangen Schild, oben ein Reiter „Notizen“, am Rand eine CD.
  - Im Editor oben eine Titelleiste mit dem Namen der Seite; ihr rotes ✕ führt zurück zum Buch. Darunter die beige Werkzeugleiste mit bunten Symbolen und Farben als kleinen Quadraten.
  - Einstellungen (Stift, Formen, Koordinatensystem, eigene Farbe) und Dialoge sind Fenster mit Titelleiste und rotem ✕, die übrigen Menüs weiße Kontextmenüs mit blauer Markierung, Hinweise gelbe Sprechblasen.
  - Umschalten: „XP-Stil“ oben auf der Startseite oder „⋯ → Aussehen“. Im XP-Stil gilt der Darkmode nur für die Schreibfläche, die Fenster bleiben hell.
- **Neue Pfeile:** Pfeil, Doppelpfeil und die Achsen der Koordinatensysteme haben eine gefüllte Spitze wie eine Speerspitze, hinten nach innen gewölbt. Schon gezeichnete Pfeile bleiben, wie sie sind; ein Graph bekommt die neue Spitze, wenn er über „Graph ändern“ neu gezeichnet wird.

## Neu in 1.5.11: Deckkraft, Einstellungen für Koordinatensysteme, Bilder aus der Zwischenablage
- **Bild aus der Zwischenablage:** Der Bild-Knopf öffnet ein kleines Menü. **Aus der Zwischenablage** fügt ein Bildschirmfoto ein, ohne es vorher als Datei zu speichern: mit Win + Umschalt + S aufnehmen, dann hier einfügen. **Bild aus einer Datei …** öffnet wie bisher die Dateiauswahl. Mit Tastatur geht auch Strg + V. In der Browser-Version fragt der Browser beim ersten Mal, ob die Seite die Zwischenablage lesen darf.
- **Einfügen durch Gedrückthalten:** Einen Finger eine halbe Sekunde auf die Seite halten, dann erscheint die Blase **Einfügen**. Antippen legt das Bild aus der Zwischenablage genau dorthin, mittig unter den Finger (mit Raster auf das Raster). Mit der Maus geht dasselbe per Rechtsklick. Bewegt sich der Finger, verschiebt er wie gewohnt die Seite und die Blase geht zu. Ist „Mit dem Finger zeichnen“ an, schreibt der Finger; dann gibt es die Blase nicht.
- **Am Raster ausrichten rastet überall gleich ein:**
  - Pfeile richten sich beim Verschieben und Skalieren nach ihrem Schaft, nicht mehr nach der Spitze. Vorher lag ein verschobener Pfeil danach etwas neben den Punkten.
  - Koordinatensysteme richten sich beim Verschieben nach ihrem Ursprung: Achsen und Teilstriche liegen danach auf den Punkten, auch auf einem anderen Blatt, in der anderen Hälfte von A3 quer und bei Graphen, die ohne Raster gezeichnet wurden. Vorher wurden sie nur um ganze Kästchen verschoben und lagen auf dem nächsten Blatt zwischen den Punkten.
  - Weit herausgezoomt (unter 50 %) zeigt das Muster nur jeden zweiten Punkt. Jetzt rastet dann auch alles nur an den sichtbaren Punkten ein, nicht mehr dazwischen.
  - Duplizieren legt die Kopie einen Punkt weiter, auf das Raster.
- **Deckkraft:** Im Menü von Stift und Textmarker (Regler-Knopf neben den Dicken) gibt es den Regler **Deckkraft** (10 bis 100 %). Er gilt für neue Striche: Der Stift ist sonst deckend, der Textmarker hat wie bisher 42 %. Wo sich zwei durchsichtige Striche kreuzen, wird es dunkler, ein Strich selbst wird dort, wo er sich überlappt, nicht dunkler. Ist der Stift durchsichtiger eingestellt, sind auch die Punkte der Dicken blasser. „Farbe übernehmen“ in der Leiste einer Auswahl gibt den Strichen Farbe und Deckkraft.
- **Koordinatensysteme einstellen:** Ist bei den Formen ein Koordinatensystem gewählt, öffnet der Regler-Knopf neben den Dicken seine Einstellungen (auch über „Einstellungen“ im Formen-Menü bei „Graphen“): den **Abstand der Teilstriche** (½, 1, 2, 3, 4 oder 5 Kästchen) und die **Beschriftung der Achsen**, frei eintippbar oder mit einem Tipp (x · y, t · s, t · v, x · f(x)), mit Vorschau. Die Beschriftung kann Buchstaben, Ziffern, Umlaute, griechische Buchstaben (z. B. φ, ω, Δ), hoch- und tiefgestellte Ziffern (t², s₀) und Zeichen wie ( ) / , . − + = ' ° enthalten; sie wird wie die Achsen als Striche gezeichnet. 3D hat eigene Beschriftungen.
- **Lange Achsenbeschriftung an der Achse:** Hat eine Beschriftung mehr als 2 Zeichen (z. B. „Durchgang i“, „Fehleranteil“, auch „f(x)“), steht sie wie in Büchern mittig an der Achse: unter der waagrechten Achse, an der senkrechten gedreht und von unten nach oben zu lesen links daneben. Liegt der Ursprung in der Mitte, steht sie in der rechten bzw. oberen Hälfte; beim 3D-Achsenkreuz gilt das für die waagrechte und die senkrechte Achse. Kürzere wie x, y, t, t² oder s₀ bleiben an der Pfeilspitze. Schon gezeichnete Graphen ändern sich erst, wenn sie über „Graph ändern“ neu gezeichnet werden.
- **Graph nachträglich ändern:** Einen gezeichneten Graphen mit dem Lasso antippen, dann **Graph ändern** in der Leiste darüber. Abstand und Beschriftung lassen sich so jederzeit ändern, das Menü liegt neben dem Graphen und er wird sofort neu gezeichnet, an derselben Stelle (auch verschoben oder vergrößert) und in seiner Farbe und Dicke. Alle Änderungen bis zum Schließen sind ein Schritt beim Rückgängigmachen. Das geht auch mit Graphen, die vor dieser Version gezeichnet wurden.

## Neu in 1.5.10: Popups sind wieder zu sehen
- **Popups bleiben sichtbar:** In 1.5.9 konnte ein Popup beim Wiederöffnen unsichtbar sein. Es ging kurz auf und verschwand gleich wieder, und das bei jedem weiteren Öffnen bis zum Neustart, zum Beispiel bei den Einstellungen des Tapes, nachdem ein Tape darunter gezogen wurde. Ursache: Die Animation beim Schließen blieb am versteckten Popup hängen, und Chromium holte ihr Ende beim nächsten Öffnen zurück. Jetzt wird sie entfernt, sobald das Popup zu ist. Das gilt für alle Menüs und den Farbwähler.

## Neu in 1.5.9: eigener Farbwähler, federnde Menüs
- **Eigene Farbe:** Der Regenbogen-Punkt neben den Farben öffnet jetzt einen Farbwähler im Stil der App statt des Fensters von Windows: ein Farbfeld (nach rechts kräftiger, nach oben heller) und darunter der Farbton, beides mit Stift, Finger oder Maus zu ziehen; die Farbe gilt sofort. Darunter die zuletzt benutzten eigenen Farben und abgestimmte Vorschläge (kräftig, sanft, gedeckt), oben lässt sich der Farbwert auch eintippen (z. B. #3a7bd5). Der Farbwähler springt wie alle Menüs aus dem Punkt heraus, die Farbtupfer ploppen nacheinander auf. Zeigt der Punkt eine eigene Farbe, liegt um sie ein schmaler Regenbogen-Ring. Gilt für Stift, Textmarker und Tape.
- **Menüs ploppen auf:** Alle Menüs und Fenster springen kurz und leicht federnd aus ihrem Knopf heraus: Einstellungen des Werkzeugs, Hintergrund, Mehr (⋯), Lasso/Tape/Formen, auf der Startseite das ⋯ an Büchern und Seiten, die Leiste über einer Auswahl und Fenster wie „Neue Seite“ oder „Umbenennen“. Beim Schließen huschen sie kurz zusammen; ein Menü, das gerade zugeht, öffnet sich beim nächsten Antippen gleich wieder. Bei „Animationen reduzieren“ in Windows gehen sie ohne Bewegung auf und zu.

## Neu in 1.5.8: Tape mit Figuren, Knopf für die Einstellungen
- **Tape mit Figuren:** drei neue Muster, **Kätzchen** (im Stil von Hello Kitty), **Hündchen** (im Stil von Cinnamoroll) und **Teufelchen** (im Stil von Kuromi). Die Figuren laufen wie bei gedrucktem Washi-Tape entlang des Tapes, folgen Bögen und stehen nie auf dem Kopf; dazwischen kleine Verzierungen (Schleifen, Sterne, Totenköpfe). Auswahl im Menü des Tapes (gewählte Dicke nochmal antippen) unter „Muster“: die einfachen Muster in der ersten Reihe, die Figuren in der zweiten. Dickere Tapes zeigen größere Figuren.
- **Passende Farbe gleich mit:** Wer eine Figur wählt, bekommt ihre Tape-Farbe dazu: Kätzchen Rosa, Hündchen Hellblau, Teufelchen Lila. Danach lässt sich die Farbe wie immer frei ändern.
- **Knopf für die Einstellungen:** Neben den Dicken sitzt ein eigener Knopf mit Reglern. Er öffnet die Einstellungen des Werkzeugs, das gerade gewählt ist: beim Stift Dicke und Glättung, beim Textmarker dazu „Immer gerade“, beim Tape die Muster. Solange sie offen sind, leuchtet er blau; nochmal antippen, daneben tippen oder Esc schließt sie. Die gewählte Dicke nochmal antippen geht weiterhin.

## Neu in 1.5.7: Leiste in einer Zeile, Vollbild
- **Leiste in einer Zeile:** Lasso, Tape und Formen teilen sich einen Knopf. Er zeigt das zuletzt gewählte der drei (kleine Ecke unten rechts); nochmal antippen öffnet die Auswahl, bei Formen mit den Formen darunter. Wird es eng, wird der Seitentitel gekürzt, erst im Hochformat bricht die Leiste um.
- **Vollbild** im Menü „⋯“ (oder F11): ohne die Titelleiste „Notizen“ und ohne Taskleiste. Esc oder „Vollbild beenden“ holt beides zurück.

## Neu in 1.5.6: Lasso mit der Stifttaste
- **Taste am Stift = Lasso** (wie in OneNote): Taste gedrückt halten und einen Kreis um Schrift oder Bilder ziehen, mit der Taste antippen wählt einen Strich. Danach verschiebt der Stift die Auswahl, wenn man darin zieht (auch ohne Taste), am blauen Punkt skaliert er sie; daneben schreibt er normal weiter und die Auswahl verschwindet. Das Werkzeug bleibt dabei der Stift. Radieren geht weiter mit dem Radierer-Ende des Stifts.
- Das erste Öffnen eines Buchs nach dem Programmstart ruckelt nicht mehr: Die App wärmt die Animation kurz nach dem Start unsichtbar vor.

## Neu in 1.5.5: noch weniger Akkuverbrauch
- Verschieben der Seite mit dem Finger braucht etwa 60 % weniger Grafikarbeit (mit Mausrad oder Hand ebenfalls weniger): Die Seite wird nur noch verschoben und erst neu gemalt, wenn ein neues Stück ins Bild kommt.
- Radieren, Lasso, Auswahl verschieben und Tape: 35 bis 45 % weniger Grafikarbeit, weil nur noch die Stelle unter Radierer, Lasso oder Auswahl neu gemalt wird. Zoomen: etwa 13 % weniger.
- Der Start ist etwas schneller: Der PDF-Teil wird erst beim ersten PDF-Import geladen.
- Aussehen, Schreiben und Stift bleiben genau wie vorher.

## Neu in 1.5.4: weniger Akkuverbrauch
- Nach einem Strich, beim Radieren, Rückgängig oder Tape-Antippen wird nur noch die Stelle neu gemalt, die sich geändert hat, nicht mehr der ganze Bildschirm (beim Schreiben etwa 98 % weniger Grafikarbeit, beim Verschieben etwa 60 % weniger).
- Der Punkt des schwebenden Stifts wird nur noch verschoben, nicht bei jeder Bewegung neu gezeichnet.
- Browser-Version auf Android (z. B. Pixel 8 mit Chrome): Die Notiz ist nicht mehr schwarz.

## Neu in 1.5.3: Tape und Textmarker
- **Tape** (Knopf neben dem Textmarker, Taste T), wie bei Goodnotes: Über Text oder Bilder ziehen deckt sie ab, wie mit Washi-Tape, das mit einem leichten Schatten auf dem Papier liegt. **Antippen** deckt auf (das Tape bleibt als blasser, gestrichelter Umriss), nochmal antippen deckt wieder ab, auch mit dem Finger. Was auf ein abgedecktes Tape geschrieben wird, gehört zum Tape und verschwindet beim Aufdecken mit: Antwort daraufschreiben, aufdecken, vergleichen. Am Ende kurz halten macht das Tape gerade (weiterziehen dreht es). Im Menü (gewählte Dicke nochmal antippen): Muster Uni, Streifen, Punkte oder Karo, „Immer gerade“ und **Alle aufdecken / Alle abdecken** für die ganze Seite. Radieren nimmt das Tape mit dem, was darauf steht; das Lasso wählt beides zusammen.
- **Textmarker:** Er liegt jetzt unter der Schrift wie auf Papier, die Schrift bleibt klar und wird nicht eingefärbt (vor allem im Darkmode). Am Ende kurz halten macht die Linie gerade; im Menü gibt es „Immer gerade“. Fast waagerechte Linien werden genau waagerecht.
- Beim Radieren flackern keine weißen Flächen mehr auf (vor allem über PDF-Seiten): Die Seite bleibt sichtbar, bis die Änderung fertig gezeichnet ist.

## Neu in 1.5.2: Glättung beim Stift
- **Glättung beim Stift:** Die gewählte Strichstärke nochmal antippen, dann gibt es unter der Dicke die **Glättung** mit fünf Voreinstellungen: **Aus** (die Linie genau so, wie der Stift sie zeichnet), **25 %**, **50 %** (wie bisher, voreingestellt), **75 %** (deutlich ruhiger) und **100 %** (sehr ruhig). Die Glättung richtet sich nach dem Tempo: Wer langsam schreibt, wo Zittern auffällt, bekommt mehr davon weggenommen; schnell geschriebene Linien folgen dem Stift fast ohne Verzögerung, so bleiben auch bei 100 % die Buchstaben in Form. Der Regler darunter stellt die gewählte Voreinstellung fein ein, die Vorschau zeigt die Wirkung an einer Probelinie. Gilt für Stift und Textmarker und bleibt gespeichert; wirkt auf neue Striche, schon geschriebene bleiben, wie sie sind.
- Beim Öffnen eines Buchs blendet das Buch jetzt als Ganzes aus, ohne helle Striche zwischen den Seiten.

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
- **Am Raster ausrichten** (Magnet-Knopf neben dem Hintergrund, Taste G): Formen, Graphen, verschobene Auswahlen, Bilder und PDF-Seiten rasten an den Punkten bzw. Kästchen ein, weit herausgezoomt nur an den sichtbaren. Normales Schreiben bleibt frei.

## Neu in 1.3
- Ein Strich ist jetzt immer gleich dick, egal bei welchem Zoom er geschrieben wurde (wie bei GoodNotes). Wer reinzoomt, sieht die Schrift größer, aber im Verhältnis gleich dick.
- Fünf Stiftdicken und vier Textmarker-Dicken. Die gewählte Dicke **nochmal antippen**, dann lässt sie sich mit einem Schieberegler fein einstellen (Stift 0,5 bis 30, Textmarker 4 bis 80). Die Einstellung bleibt gespeichert.
- Ältere Striche behalten ihre Dicke. Wer sie angleichen will: mit dem Lasso markieren, Dicke wählen, **Dicke übernehmen** antippen.

## Starten ohne Installation (empfohlen)
1. `Notizen-1.5.8-arm64-ohne-Installation.zip` auf das Surface laden, rechtsklicken und **Alle extrahieren** wählen.
2. Im entpackten Ordner `Notizen\Notizen.exe` starten. Für eine Verknüpfung: rechtsklicken, **Weitere Optionen anzeigen**, **Senden an**, **Desktop (Verknüpfung erstellen)**.
3. Beim Wechsel von einer älteren Version das Programm schließen und den alten Ordner `Notizen` durch den neuen ersetzen. Die Notizen bleiben erhalten, sie liegen getrennt unter `%APPDATA%\Notizen`.
4. Hinweis: Nach dem ersten Start von 1.4 kann eine ältere Version die Notizen nicht mehr öffnen. Wer sicher gehen will, tippt vorher in der alten Version auf **Sichern**.

## Installieren (alternativ)
1. `Notizen-1.5.8-arm64.zip` entpacken und `Notizen-Setup-1.5.8-arm64.exe` doppelklicken.
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
| Strichstärke | Punkte in der Leiste; feiner mit dem Schieberegler in den Einstellungen (Regler-Knopf neben den Dicken) |
| Eigene Farbe | Regenbogen-Punkt neben den Farben: Farbfeld und Farbton ziehen, zuletzt benutzte oder vorgeschlagene Farbe antippen, Farbwert eintippen |
| Glättung | Regler-Knopf neben den Dicken: Aus, 25, 50 (wie bisher), 75 oder 100 %, Feineinstellung mit dem Regler |
| Deckkraft | Regler-Knopf neben den Dicken (Stift, Textmarker): Regler „Deckkraft“, gilt für neue Striche |
| Lasso, Tape | Je ein eigener Knopf nach Formen. Tasten L, T |
| Tape | Tape (T), über den Inhalt ziehen; antippen deckt auf oder ab, die Blase daran schaltet genau dieses Tape um oder entfernt es; am Ende halten = gerade; Muster (auch Kätzchen, Hündchen und Teufelchen) über den Regler-Knopf neben den Dicken |
| Gerader Textmarker | Am Ende kurz halten, oder „Immer gerade“ in den Einstellungen des Textmarkers (Regler-Knopf) |
| Formen und Graphen | Knopf „Formen“ (F): darunter die Formenleiste mit allen Formen, Koordinatensystemen, eigenen Formen und Stil; Form antippen, dann aufziehen |
| Aussehen | „XP-Stil“ oben auf der Startseite oder „⋯ → Aussehen“: Windows XP oder modern |
| Koordinatensystem einstellen | Koordinatensystem gewählt: Regler-Knopf neben den Dicken (Abstand der Teilstriche, Beschriftung der Achsen); gezeichneten Graphen ändern: mit dem Lasso antippen, „Graph ändern“ |
| Am Raster ausrichten | Magnet-Knopf (G) an/aus |
| Radieren | Radierer-Ende des Stifts, oder Radierer-Werkzeug |
| Verschieben | Ein Finger ziehen |
| Zoomen | Zwei Finger auseinander/zusammen |
| Rückgängig | Mit zwei Fingern kurz tippen, oder Strg+Z; was ausgewählt war, bleibt ausgewählt |
| Auswählen | Lasso-Werkzeug oder die Taste am Stift gedrückt halten: Kreis um Schrift oder Bilder ziehen (mit der Taste antippen wählt einen Strich), dann verschieben, über den blauen Punkt skalieren, löschen, duplizieren, umfärben, Dicke angleichen oder als eigene Form speichern |
| Bild einfügen | Bild-Knopf (aus der Zwischenablage oder einer Datei), Finger auf der Seite halten bzw. Rechtsklick: „Einfügen“, Strg+V oder Datei ins Fenster ziehen |
| PDF einfügen | PDF-Knopf oder PDF ins Fenster ziehen, jede Seite wird zum Beschriften eingefügt (auf DIN-Seiten: eine PDF-Seite pro Blatt, bei A3 quer links) |
| Seitenformat | Beim Anlegen einer Seite: Unendlich, DIN A4 oder DIN A3, hoch oder quer |
| Blatt hinzufügen | DIN-Seiten: Knopf mit Blatt und Plus, neues Blatt hinter dem aktuellen |
| Exportieren | „⋯“: Als PDF exportieren oder Als Bild exportieren (PNG) |
| Hintergrund | Punkte-Knopf: Punkte, Kariert, Liniert, Leer |
| Darkmode | Mond-Knopf |
| Vollbild | „⋯“ → Vollbild oder F11 (ohne Titelleiste und Taskleiste), Esc beendet es |

Der Handballen wird beim Schreiben ignoriert. Wer mit dem Finger zeichnen will, schaltet das unter „⋯“ ein.

## Speichern und Sichern
Alles wird automatisch auf dem Surface gespeichert, ohne Konto und ohne Cloud, auch beim Schließen des Fensters. Mit **Sichern** auf der Startseite entsteht eine `.notizen`-Datei mit allen Büchern, Seiten und eigenen Formen, die man mit **Wiederherstellen** wieder laden kann (z. B. auf einem neuen Gerät).
