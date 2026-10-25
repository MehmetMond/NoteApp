# Notizen

Handschrift-App im Stil von GoodNotes für das Surface Pro 11 (Windows ARM64, Surface Pen). Version 1.5.4.

![Vorschau](docs/vorschau.png)

Bücher mit Seiten, unendliche Arbeitsfläche oder Dokument aus Blättern DIN A4/A3 (hoch/quer), Stift, Textmarker, Radierer, Lasso, Formen und Pfeile, Graphen-Vorlagen (x/y, x/y/z), eigene Formen, Am Raster ausrichten, PDF-Import, PDF-Export, Darkmode, Sichern/Wiederherstellen. Bedienung: siehe [ANLEITUNG.md](ANLEITUNG.md).

## Aufbau
- `app.js` – das JavaScript der App (lesbare Quelle).
- `app.src.html` – HTML/CSS-Vorlage, in der `app.js` bereits eingefügt ist. Nach einer Änderung an `app.js` neu zusammensetzen:
  ```python
  s=open('app.js').read(); h=open('app.src.html').read(); i=h.index('<script>\n"use strict";')
  open('app.src.html','w').write(h[:i]+'<script>\n'+s+'</script>\n</body>\n</html>\n')
  ```
  (`app.js` beginnt mit `"use strict";`.) Die Platzhalter `@@PDFJS@@` und `@@PDFWORKER@@` nicht anfassen (beide stehen als Text in der Seite, pdf.js wird erst beim ersten PDF ausgeführt).
- `build.py` – baut `Notizen.html` und fügt pdf.js 3.11.174 aus `pdfjs/` ein. Die Datei läuft auch direkt im Browser.
- `Notizen-Browser.html` – die gebaute Datei (wie `Notizen.html`) für GitHub Pages: <https://mehmetmond.github.io/NoteApp/>. Dazu gehören `index.html` (leitet weiter), `sw.js` (Service Worker für den Offline-Start), `manifest.webmanifest` und `icon-180.png` (Home-Bildschirm, iPad). Der Service Worker läuft nur bei `http(s)://`, nicht im Windows-Programm.
- `electron/` – Windows-Hülle (Electron 38, electron-builder).
- `tests/` – Playwright-Tests (Chromium); Pfade in den Skripten ggf. anpassen.
- `tests/akku/` – Messen und Prüfen in der echten Windows-App (Python, siehe unten).
- `docs/` – Entwurfsnotizen für Version 1.4.

## Windows-Programm bauen
```sh
python3 build.py
mkdir -p electron/app && cp Notizen.html electron/app/index.html
cd electron && npm ci
npx electron-builder --win --arm64 --dir   # portabel: dist/win-arm64-unpacked
npx electron-builder --win --arm64         # Installer (unter Linux mit Wine)
```
Für x64 statt ARM `"arch": ["x64"]` im `win.target` von `electron/package.json` setzen.
Vor jeder Weitergabe `version` in `electron/package.json` erhöhen.

## Wichtig bei Änderungen
- Die Daten liegen in IndexedDB `notizen-app` (Version 4; Stores index, items, images, books, shapes) unter `%APPDATA%\Notizen`. Ein Upgrade darf nie bestehende Notizen löschen; die Version nur erhöhen.
- Das Sicherungsformat (3) muss alte Sicherungen weiter lesen können.
- Striche liegen in Weltkoordinaten, Ansicht {tx, ty, z}, gezeichnet wird in Kacheln zu 512 px.
- Akku: `cvMain` ist an jeder Seite um einen Rand (`PADD`) größer als der Bildschirm; beim Verschieben schiebt der Compositor sie (`transform`), neu gemalt wird erst, wenn der Rand nicht reicht. Bildschirm-Koordinaten der Kacheln liefert `tileRange`, Leinwand-Koordinaten `mainRange`.
- Akku: wer auf `ctxLive` zeichnet, meldet den Bereich mit `liveMark`/`liveMarkDev`; `liveClear` leert nur diesen Bereich (Leeren kostet auf dem Surface Grafikzeit je Fläche, `clearRect` auf einem Teil so viel wie auf allem). Leer und ohne schwebenden Stift ist die Live-Ebene ausgeblendet (`liveVis`). `tests/akku/test_live.py` prüft nach jedem Leeren, dass nichts übrig bleibt.
- Seitenformat im Index-Eintrag: `paper: { f: 'a4' | 'a3', o: 'p' | 'l', n }`, ohne `paper` ist die Fläche unendlich. `n` Blätter liegen untereinander, das erste bei (0, 0), Abstand 40; 1 Welteinheit = 1/96 Zoll (A4 hoch = 793,7 × 1122,5). Das Raster (Muster, Am Raster ausrichten) beginnt auf Blättern am inneren Rand jedes Felds (`fieldsOf`), sonst bei 0.

## Akku messen (`tests/akku/`)
In der echten App, mit leerem Testprofil (eigene Notizen bleiben unberührt). Python 3 mit `pip install websocket-client pillow`.
```sh
python -X utf8 tests/akku/mkapp.py . <installierte App> <Ziel>     # neue Version als startbare Kopie (app.asar wie electron-builder)
python tests/akku/measure.py <Notizen.exe> <Profilordner> alt.json   # CPU-/GPU-Zeit je Ablauf
python tests/akku/cmp_runs.py alt.json neu.json                     # Vergleich (beide Läufe direkt nacheinander)
python tests/akku/test_live.py <Notizen.exe> <Profilordner>          # Live-Ebene: leer nach jedem Leeren, ein-/ausgeblendet
python tests/akku/test_screen.py <Notizen.exe> <Profilordner> <Ordner>   # Bildschirmfotos; cmp_shots.py alt neu vergleicht pixelgenau
python tests/akku/test_pdf.py <Notizen.exe> <Profilordner>           # PDF-Import mit nachgeladenem pdf.js
```
`gpu_kosten.py` und `verschieben.py` sind die Versuche, mit denen die Akkufresser gefunden wurden (GPU-Zeit je Bild).
