# Notizen 1.4 – Formen, Raster, Koordinatensysteme, Bücher

The app is a single-file, German-language handwriting/notes app (GoodNotes-like) for a Surface Pro 11
(Windows ARM64, Surface Pen), shipped as an Electron wrapper around one HTML file. Version 1.3 is the base.

The user (German, writes casually) asked for:
> "kannst du formen hinzufügen die standard mässigen maybe noch pfeil form dazu noch ein snap to grid funktion die man
> an oder aus machen kann um sachen schön und tidy zu ordnen. und für graphen eine quasi preset form für x und y und ein
> weiteres für xyz und maybe das star design so ändern das ich verschiedene bücher habe mit einem titel wie zb mathe und
> ich da drinnen die verschiedenen seiten aka notizen hab damit es eine schöne aufmachung und design hat"

("star design" = Start-Design, i.e. the start/home screen.)

## Source layout and build (same in every work directory)

- `app.js` – the whole app script, **source of truth for JS**. Top-level `const`/`function` are globals
  (classic script), so tests can call e.g. `S`, `uid()`, `dbIndexPut()`, `openNote()`, `zoomAt()` from `page.evaluate`.
- `app.src.html` – HTML + CSS + the assembled script. Edit **only the part before** `<script>\n"use strict";`
  (head, CSS, markup, SVG icon symbols). Then re-assemble and build:
  ```sh
  python3 - <<'EOF'
  s=open('app.js').read(); h=open('app.src.html').read(); i=h.index('<script>\n"use strict";')
  open('app.src.html','w').write(h[:i]+'<script>\n'+s+'</script>\n</body>\n</html>\n')
  EOF
  python3 build.py        # -> Notizen.html (inlines pdf.js from ./pdfjs)
  ```
- Tests are Playwright scripts in `t3/` run with `node t3/<name>.js` (Playwright + Chromium are preinstalled; never run
  `playwright install`, never `npm install`). Each launch has a fresh browser profile, so tests are independent.
  Existing tests that must keep passing: `t3/test3.js` (big regression test; prints JSON with `"errors": []`),
  `t3/hl.js` then `t3/diff.js` (pen + highlighter live-vs-final pixel identity, both `hist` must be `{}`),
  `t3/width.js` (pen width presets; `errs` must be `[]`). `Notizen-v1.html` is version 1 (used by test3.js for the
  v1→v2 migration), `Notizen-v13.html` is the current 1.3 build (use it to create "old" data for migration tests).
- Do **not** touch `/mnt/project-files`, the Electron folder, or anything outside your work directory.
  Do not run Electron in the implementation phase (it uses a shared profile dir).

## Code conventions (match the existing code)

Plain ES2022, no frameworks, no external resources, no new dependencies. Compact style like the surrounding code,
German comments (sparse, explaining *why*), German UI text with proper umlauts and „…“ quotes. Keep 60 fps paths cheap:
no per-frame allocations beyond what the existing code does, no layout thrash in pointer handlers.
Key existing pieces you will build on:

- World coordinates; view `S.view = {tx, ty, z}`; `toWorld`, `toScreen`; tiles cache rendered at `S.level`.
- Items `S.items` in z-order: strokes `{t:'s', id, c, w, hl, pts: Float32Array [x,y,p,...], bb, o}` and images
  `{t:'i', id, img, x, y, w, h, o}`. `makeStroke(pts, c, w, hl)`; `bboxOf(pts, margin)`; `buildPath(pts, w, hl)`
  (radius = `w/2 * (0.45 + p*1.1)`, so **p = 0.5 gives exactly width w**); `appendItems`, `withImages`, `commit(next)`
  (undo-able, invalidates tiles of changed items, marks dirty → diff-based save to IndexedDB `items` store; any extra
  fields on an item are persisted automatically via structured clone and in backups via JSON).
- Live layer `cvLive` / `ctxLive` (`liveClear`, `liveWorld`, `drawLive`, `liveStyle`). `finishStroke(a)` commits a stroke
  and, when it is fully in view and `S.view.z === S.level`, copies the live-layer pixels into the tiles so nothing changes
  visually on pen-up. Keep that guarantee for everything new that is drawn live.
- Input: `startAction` / `moveAction` / `endAction` / `cancelAction`, `action.kind` in
  `draw | erase | lasso | move | scale | pan`. Selection: `setSel`, `clearSel`, `lassoSelect`, `transformItem`,
  `beginTransform`, selection bar `#selbar` (`sColor`, `sSize`, `sDup`, `sDel`).
- Toolbar: `setTool`, `renderColors`, `renderSizes` (pen presets + slider `#sizeMenu`), menus with class `menu`
  (`openMenu`, `closeMenus`, capture-phase pointerdown closer that ignores `#bBg,#bMore,#sizes`).
- Background pattern (`drawBg`, `fillBg`): dots/grid spacing **28** world units, lines spacing **34**, origin at world 0,0.
- Dialog `ask(msg, value, withInput)` / `askYes(msg)` (custom, because prompt/confirm don't work in Electron).
- Storage helpers `dbIndexAll/Get/Put`, `dbItems`, `dbDeleteNote`, `openDB` (IndexedDB `notizen-app` v2: stores
  `index`, `items`, `images`), backup/restore NDJSON (`#hBackup`, `#fRestore`, `fileLines`, `writeRecords`),
  home `renderHome`, `openNote(meta)`, `closeNote()`, `flushNote()`, `window.__flush` (Electron calls it on close).
- `store.get/set` = localStorage prefs.

## Part A – Formen, Pfeile, Koordinatensysteme, Am Raster ausrichten  (editor only)

### Shape tool
- New toolbar tool button `data-tool="shape"` (id `bShape`) between highlighter and eraser, icon `#ic-shape`
  (small square + circle), title „Formen (F)“; keyboard `f`. Cursor crosshair.
- Shapes use the **pen** colour and pen width (`S.color.pen`, `S.size.pen`); `renderColors`/`renderSizes` treat the shape
  tool like the pen (active, editing `pen` values, no tool switch on click).
- Shape picker `#shapeMenu` (class `menu`): opens when the shape button is tapped (tap selects the tool and opens the menu;
  tapping again while open closes it). Add `#bShape` to the menu-closer exclusion. Grid of icon+label buttons,
  current choice highlighted, persisted with `store` key `shape` (default `rect`). Choosing closes the menu.
  Section „Formen“: Linie, Pfeil, Doppelpfeil, Rechteck, Ellipse, Dreieck, Rechtwinkliges Dreieck, Raute.
  Section „Graphen“: „Koordinatensystem (x, y)“ (`axes2`, origin in the middle, four quadrants),
  „Nur positiv (x, y)“ (`axes2p`, origin bottom-left, first quadrant), „3D (x, y, z)“ (`axes3`).
  A small hint line at the bottom: „Ziehen zum Zeichnen · Umschalt: gerade/quadratisch“.
- Interaction: pointer-down at A, drag to B, live preview, pointer-up commits. A drag shorter than ~6 screen px creates
  nothing. Pressure is ignored (all points p = 0.5). Esc / pointercancel cancels.
- Geometry = ordinary strokes (so lasso, move, scale, recolour, „Dicke übernehmen“, eraser, undo, save, backup, export
  all work unchanged). Every point has p = 0.5. Use enough points for curves (ellipse: ~perimeter/4 points, clamped
  36…240, closed). Rect/triangle/diamond are closed polylines (last point = first). Arrow = one polyline
  `tail, tip, wingL, tip, wingR` (open V head, ±27°, head length `min(len*0.35, 12 + w*2.5)`), double arrow similar on
  both ends. Isosceles triangle: apex at top-centre of the A/B box; right triangle: vertices `(ax,ay),(ax,by),(bx,by)`.
  Store the shape type on the stroke as `k: 'rect'` etc. (informational).
- Tidy helpers: holding Shift constrains (square/circle; line angles to 15° steps). Without Shift a gentle magnet:
  line/arrow angles within 4° of a multiple of 45° snap to it; rect/ellipse/diamond within 8 % of square become square.
- Live preview: draw with the same `buildPath` geometry on `ctxLive` (world transform, `liveStyle(null)`), re-rendered
  through `drawLive` (new `action.kind === 'shape'`). On commit, make sure the live layer shows exactly the final geometry,
  then commit like `finishStroke` (generalise it to a list of strokes with a union bbox) so the shape does not change by
  a single pixel when the pen lifts, and still matches after tiles are re-rendered. Must also work when the view
  changes mid-drag (wheel/pinch): just re-render the preview.
- Graph presets (all strokes of one graph share a group id `g: uid()`, pen colour/width):
  - `axes2`: the A/B box; origin at its centre (snapped to the grid when snapping is on). x-axis across the full width with
    an arrowhead on the right, y-axis across the full height with an arrowhead at the top. Tick marks every grid step
    (`gridSize()`, see below) along both axes, symmetric around the origin, skipping the origin and the arrowhead zone;
    tick half-length `max(4, w*1.5)`. Letter labels „x“ (below the right end) and „y“ (left of the top end) drawn as
    small stroke glyphs (≈13 world units high, see glyphs). No numbers.
  - `axes2p`: origin bottom-left of the box, axes to the right and up with arrowheads, ticks, labels.
  - `axes3`: cavalier projection like German school drawings: z up, y to the right, x towards the viewer drawn
    diagonally down-left at 45° with half-length units (one unit = displacement (−G/2, +G/2)). Origin at about 40 % of the
    width / 60 % of the height of the box. Arrowheads on all three positive ends, ticks every unit, labels x, y, z.
  - Glyphs as stroke polylines in a unit box (y down, height 1): x = `(0,0)-(0.8,1)` and `(0.8,0)-(0,1)`;
    y = `(0,0)-(0.45,0.62)` and `(0.9,0)-(0.3,1.35)`; z = `(0,0)-(0.8,0)-(0,1)-(0.8,1)`.
  - Lasso **tap** on any stroke of a group selects the whole group; a lasso loop that catches part of a group expands to
    the whole group. Duplicate („Duplizieren“) gives the copies fresh group ids (one new id per original group).
    The eraser still erases single strokes.

### Am Raster ausrichten (snap to grid)
- Toggle `S.snap` (persisted `store` key `snap`, default off). Toolbar button `#bSnap` (icon `#ic-snap`, a magnet or
  grid-with-dot) right after the background button `#bBg`, `.on` when active, title „Am Raster ausrichten (G)“, keyboard
  `g`, short toast „Am Raster ausrichten: an“ / „… aus“.
- `gridSize()` = 34 when the note background is `lines`, else 28 (matches the visible pattern; origin at world 0,0).
- When on:
  - Shape endpoints/corners and graph boxes/origins snap to grid points (both the start point and the moving point).
  - Moving a lasso selection snaps the selection's geometric top-left (point extents of strokes without the width margin,
    image x/y) to the grid during the drag, so the preview jumps cell by cell and the committed result matches it.
  - Scaling a selection snaps its geometric right edge to the grid (keep the anchor behaviour).
  - Inserted images / PDF pages get their top-left snapped to the grid. Duplicate offset = one grid cell.
- Free-hand writing is never snapped.

### Tests for part A (write `t3/shapes.js`, plus anything else you need)
Open a fresh note with a helper that works regardless of the home screen (part B changes it):
```js
await p.evaluate(async () => { const now = Date.now(); const n = { id: uid(), name: 'Test', created: now, updated: now,
  thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } }; await dbIndexPut(n); await openNote(n); });
```
To re-open after reload use `dbIndexAll()` + `openNote(meta)`. Don't rely on the home screen markup or `#bBack` navigation.
Cover: every shape type creates the expected geometry; snapping on/off (endpoints multiples of 28); Shift/magnet;
live-vs-final pixel identity for a shape and a graph (screenshot before pointer-up vs after, and after a forced tile
re-render, e.g. zoom away and back); graph group selection by tap; duplicate remaps group ids; snapped move/scale;
undo/redo; persistence across reload; menu UI; light and dark screenshots (1440×960 @2x) of the toolbar, the open shape
menu and a page with all shapes and the three graphs. No console errors. Existing tests stay green.

## Part B – Bücher (notebooks) on the start screen  (home screen + storage only)

### Data
- IndexedDB version **3**: new store `books` (keyPath `id`). Book record `{ id, name, color, created }`
  (`color` = key of a cover palette, e.g. `blue`). Note metadata in `index` gets `book: <bookId>`.
- `ensureBooks()`: after `openDB` and before every home render: every note whose `book` is missing or unknown is put into a
  default book „Meine Notizen“ (created on demand, colour `blue`), written in one transaction. A fresh install with no
  notes starts with an empty shelf (no automatic book). Existing 1.3 data must come through intact
  (all notes, strokes, images, thumbnails, views).
- Page order inside a book: by `created` ascending (like a real notebook); a new page is appended.
  Default page name „Seite N“ (N = number of pages in that book + 1).
- Page count and „zuletzt bearbeitet“ of a book are computed from its notes at render time (not stored).
- Backup format 3: header `{app:'notizen', format:3, saved}`, then one `{k:'book', ...}` line per book, then the existing
  note/items/img lines (note metas carry `book`). Restore: book lines are added if their id is unknown locally (existing
  books are kept); notes keep their `book`; afterwards `ensureBooks()` adopts orphans (so format-2 backups such as
  `t3/backup.notizen` and v1 backups land in „Meine Notizen“). Keep the existing copy-on-conflict logic for notes.

### UI („schöne Aufmachung“ – this is the user's explicit wish, make it look polished)
- `#home` gets two modes: **Regal** (shelf) and **Buch** (one book's pages). Header right side: Darkmode, Sichern,
  Wiederherstellen and the primary action: „Neues Buch“ (`#hNewBook`, shelf) / „Neue Seite“ (keep id **`#hNew`**, book
  view). Shelf title „Meine Bücher“. Book view header: back button (to the shelf), the book name large with a small
  cover-coloured accent, and „N Seiten“; a ⋯ button with the book menu.
- Book covers (class `book`): portrait notebook covers (~3:4) in a responsive grid, each with the cover colour
  (subtle gradient), a darker spine band with a soft inner shadow on the left, an elastic-band strip near the right edge,
  a light rounded title label with the name (ellipsis for long names), soft drop shadow, slight lift on hover/press.
  Below the cover: name and „12 Seiten · 20.10.2026“. A ⋯ button (top-right of the cover or next to the caption) opens a
  book menu: „Umbenennen / Farbe“ and „Löschen“. Tapping the cover opens the book. An extra dashed „+ Neues Buch“ tile at
  the end of the grid. Cover palette ≈ 9 tasteful colours (Blau, Rot, Grün, Orange, Lila, Petrol, Rosa, Graphit,
  Senf); covers look good in light and dark mode.
- New book / edit book: a dialog with name field and the colour swatches (extend the existing `#dlg` with an optional
  swatch row, e.g. `askBook(title, name, color)` → `{name, color}` or `null`). Default name „Neues Buch“, Enter confirms.
- Page cards inside a book (keep class **`card`**, 4:3 thumbnail as today): name, date, and a ⋯ page menu:
  „Umbenennen“, „In anderes Buch verschieben“ (lists the other books), „Löschen“ (confirm). A dashed „+ Neue Seite“ tile at
  the end. Empty book: friendly empty state with the button.
- Delete book: `askYes('Buch „Mathe“ mit 12 Seiten löschen? Das kann nicht rückgängig gemacht werden.')`, then delete its
  notes (`dbDeleteNote`) and the book.
- Navigation: opening a page opens the editor; the editor's back button (`closeNote`) returns to **that page's book**
  (or the shelf if the note has no valid book). The app starts on the shelf. Keep `openNote(meta)`, `closeNote()`,
  `dbIndexPut`, `dbIndexAll`, `dbDeleteNote`, `window.__flush` working with the same signatures — including for a note meta
  that has no `book` field yet (tests and part A create notes that way).
- Responsive: looks right at 1440×960 and 960×1440 (portrait) and in dark mode; touch-friendly targets (≥ 40 px).

### Tests for part B (write `t3/books.js`, and adapt `t3/test3.js` to the new home flow)
Migration from real 1.3 data: create notes with strokes/images in `Notizen-v13.html` (same browser context; file://
pages share IndexedDB), then load `Notizen.html` and check the default book contains them unchanged. Create/edit/delete
books, colours, page create/rename/move/delete, page order, back-navigation to the book, backup→restore round trip
(format 3) and restoring the old `t3/backup.notizen` (format 2), empty states, no console errors. Screenshots of shelf
and book view in light and dark at 1440×960 and 960×1440 @2x — look at them critically and iterate on the design.
In `t3/test3.js`, open the (default) book before using `#hNew` / `.card`; keep all its checks.

## Deliverable of each implementation agent
Working code in its own directory, rebuilt `Notizen.html`, all tests green, and a short report: what was built, files
touched (functions/sections), test commands + results, screenshot paths, open issues / decisions.
