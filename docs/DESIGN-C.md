# Part C – Eigene Formen (own reusable shapes / stamps)

Follow-up wish from the user (verbatim): „ahh bitte erstell noch ne funktion womit ich was zeichnen kann und dann zu den
formen hinzufügen kann um es dann immer wieder zu platzieren kann“.
Builds on the merged 1.4 code (parts A + B of DESIGN.md are already implemented: shape tool + `#shapeMenu`, graph
groups `g`, snap-to-grid `S.snap`/`gridSize()`, DB v3 with `books`, backup format 3). Same source layout, build,
conventions and rules as DESIGN.md.

## Behaviour
- Saving: when a lasso selection contains at least one stroke, the selection bar shows „Als Form speichern“ (`#sSave`).
  It asks for a name (`ask('Name der Form:', 'Form N')`, Enter = OK, Abbrechen = nothing saved) and stores the selected
  **strokes** (images in the selection are ignored; if the selection has no strokes the button is hidden). Toast:
  „Gespeichert – zu finden unter Formen › Eigene Formen“. Refuse with a toast if the selection is enormous
  (> 60 000 points in total).
- Storage: IndexedDB store `shapes` (add it to the existing version-3 upgrade; make the upgrade path robust for
  databases that are already at v3 without `shapes` – e.g. bump to v4 if needed, B's v3 has never shipped but tests may
  have created such DBs). Record `{ id, name, created, w, h, strokes: [{ c, w, hl, pts: Float32Array }] }`, where `pts`
  are relative to the geometric top-left of the strokes (point extents, without width margin) and `w`/`h` is that
  geometric box. Custom shapes are global (available in every book/page).
- Library UI: in `#shapeMenu` a third section „Eigene Formen“ with a grid of thumbnail tiles (≈56 px, rendered on the
  fly from the stroke data with `buildPath` into small canvases, correct ink colour for light/dark; cache per id+theme).
  Selected custom shape is highlighted like the other shape buttons; current choice stored as `custom:<id>` in the
  existing `shape` pref. Each tile has a small delete button (×) with `askYes('Form „…“ löschen?')`. Empty state hint:
  „Etwas zeichnen, mit dem Lasso markieren und „Als Form speichern“ tippen.“ The menu must stay usable with many shapes
  (scrolls; max height).
- Placing (shape tool with a custom shape selected):
  - Tap (< 6 px movement): places it at its saved size, centred on the tap point.
  - Drag A→B: uniform scale so the shape fits the dragged box (`s = min(|Δx|/w, |Δy|/h)`, min size sensible), placed at
    the box's top-left (normalised box, no mirroring). Live preview while dragging.
  - With `S.snap` on, the placed shape's geometric top-left snaps to the grid.
  - Stroke widths scale with `s`; colours stay as saved (the 'ink' colour adapts to dark mode as usual). All placed
    strokes get one fresh group id `g` (lasso tap selects the whole stamp) and `k: 'custom'`. Appended on top
    (`appendItems`), one undo step.
  - The tool stays on that custom shape so it can be placed again and again.
  - Committing must look identical to the preview: composite the live-layer pixels like the other shapes when it is
    safe (no highlighter strokes, fully in view, `S.view.z === S.level`), otherwise commit with tile invalidation.
- Backup format 3 also writes one `{k:'shape', …}` line per custom shape (pts as plain arrays rounded like strokes);
  restore adds shapes whose id is unknown. Old backups without shapes still restore.

## Tests (`t3/custom.js`, plus keep all existing tests green)
Draw a few strokes (pen + one highlighter), lasso them, save as form (name via dialog), check the record; open the
shape menu, pick it, place by tap and by drag (scale + aspect), with snap on (top-left on grid), place repeatedly,
lasso-tap selects the whole stamp, undo, reload persistence, delete from the library, backup→restore round trip
including shapes, dark-mode thumbnail correctness, live-vs-final pixel identity for a pen-only stamp. Screenshots of
the shape menu with several custom shapes in light and dark. No console errors.
