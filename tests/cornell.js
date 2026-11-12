// Cornell-Vorlage (DIN A4 hoch): vierte Karte „Cornell“ beim Anlegen einer Seite; oben Thema/Datum, links Stichworte und
// Fragen (≈ 6,35 cm), rechts Notizen, unten Zusammenfassung (≈ 5 cm), Linien auf dem Raster. Knopf „Verdecken“ macht die
// Notizen-Spalte unscharf (Stichworte bleiben scharf), Fingertipp darauf deckt auf. Export mit Vorlage, ohne Unschärfe.
// node tests/cornell.js [Notizen.html]    Bilder: NOTES_SHOTS=<Ordner> (sonst der Temp-Ordner)
const { chromium } = require('playwright');
const path = require('path'), os = require('os');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const SHOTS = process.env.NOTES_SHOTS || os.tmpdir();
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
const near = (a, b, e = 0.5) => Math.abs(a - b) <= e;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  const wait = ms => p.waitForTimeout(ms);
  await p.click('#hNewBook'); await p.click('#dlgOk'); await wait(400);

  // ---------- Neue Seite: vierte Karte „Cornell“ ----------
  await p.click('#hNew'); await wait(400);
  const dlg0 = await p.evaluate(() => ({ cards: $$('#dlgFmt [data-f]').map(b => b.dataset.f).join(), rows: new Set($$('#dlgFmt [data-f]').map(b => Math.round(b.getBoundingClientRect().top))).size }));
  await p.click('#dlgFmt [data-f=cornell]'); await wait(150);
  const dlg1 = await p.evaluate(() => ({ on: $('#dlgFmt [data-f=cornell]').classList.contains('on'), a4: $('#dlgFmt [data-f=a4]').classList.contains('on'), ori: $$('#dlgFmt [data-o]').map(b => b.disabled), hint: $('#dlgFmtHint').textContent }));
  check('Neue Seite: vierte Karte „Cornell“ in einer Reihe; gewählt: Hochformat fest, Erklärung', dlg0.cards === 'inf,a4,a3,cornell' && dlg0.rows === 1 && dlg1.on && !dlg1.a4 && dlg1.ori.every(Boolean) && /Stichworte/.test(dlg1.hint) && /verdecken/.test(dlg1.hint), { dlg0, dlg1 });
  await p.screenshot({ path: path.join(SHOTS, 'cornell_dialog.png'), clip: await p.evaluate(() => { const r = $('#dlgBox').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 }; }) });
  await p.click('#dlgOk'); await p.waitForFunction(() => S.note && S.note.paper, null, { timeout: 8000 }); await wait(600);
  const paper = await p.evaluate(() => S.note.paper);
  check('Seite angelegt als Cornell (DIN A4 hoch)', paper.f === 'a4' && paper.o === 'p' && paper.t === 'cornell' && await p.evaluate(() => paperName(S.note.paper)) === 'Cornell (DIN A4)', paper);

  // ---------- Aufteilung: wie bei Pauk, auf dem Raster ----------
  const geo = await p.evaluate(() => { const c = cornellOf(0), G = gridSize(), mm = v => v / MM; return { cue: mm(c.cue), head: mm(c.head), sum: mm(c.sum), G: mm(G), onGrid: [c.cue - c.f[0], c.head - c.f[1], c.sum - c.f[1]].every(v => Math.abs(v / G - Math.round(v / G)) < 1e-6) }; });
  check('Stichworte ≈ 6,35 cm breit, Kopf ≈ 2,4 cm, Zusammenfassung ≈ 5 cm; Linien auf dem Raster', near(geo.cue, 63.5, geo.G / 2) && near(geo.head, 24, geo.G / 2) && near(297 - geo.sum, 50, geo.G / 2) && geo.onGrid, geo);

  // ---------- Linien auf dem Bildschirm ----------
  // Pixel von cvMain an einem Weltpunkt: über die echte Lage der Fläche (beim Verschieben rückt sie per CSS mit)
  const px = (wx, wy) => p.evaluate(([x, y]) => { for (let i = 0; i < 6; i++) draw(); const [sx, sy] = toScreen(x, y), r = cvMain.getBoundingClientRect(), k = cvMain.width / r.width;
    return [...ctxMain.getImageData(Math.round((sx - r.left) * k), Math.round((sy - r.top) * k), 1, 1).data].slice(0, 3); }, [wx, wy]);
  // Haarlinie: der Pixel mit dem stärksten Blauanteil quer zur Linie (±3 Welteinheiten)
  const line = async (wx, wy, vert) => { let best = null; for (let d = -3; d <= 3; d += 0.5) { const q = await px(vert ? wx + d : wx, vert ? wy : wy + d); if (!best || q[2] - q[0] > best[2] - best[0]) best = q; } return best; };
  { const c = await p.evaluate(() => cornellOf(0));
    const v = await line(c.cue, (c.head + c.sum) / 2 + 3, true), hd = await line((c.cue + c.f[2]) / 2 + 3, c.head), sm = await line((c.cue + c.f[2]) / 2 + 3, c.sum), paperPx = await px((c.cue + c.f[2]) / 2 + 9, (c.head + c.sum) / 2 + 9);
    const blue = q => q[2] - q[0] > 12;
    const G = await p.evaluate(() => gridSize()), headDot = await px(c.f[0] + 3 * G, c.f[1] + G), notesDot = await px(c.cue + 3 * G, c.head + 3 * G), cueTint = await px(c.f[0] + 2.5 * G, c.head + 3.5 * G);
    check('Vorlage sichtbar: senkrechte Linie, Linien unter dem Kopf und über der Zusammenfassung', blue(v) && blue(hd) && blue(sm) && !blue(paperPx), { v, hd, sm, paperPx });
    check('Elegant: Kopf ohne Punkte, Notizen mit Punkten, Stichworte zart getönt', near(headDot[0], paperPx[0], 2) && notesDot[0] < paperPx[0] - 20 && cueTint[2] - cueTint[0] > paperPx[2] - paperPx[0] && cueTint[0] < paperPx[0], { headDot, notesDot, cueTint, paperPx }); }
  await p.screenshot({ path: path.join(SHOTS, 'cornell_page.png') });

  // ---------- Schreiben: Notizen rechts, Stichwort links ----------
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.6, ...extra });
  const scribble = async (x0, y0, w) => { const t0 = Date.now() / 1000; await send('mouseMoved', x0, y0, { buttons: 0 }); await send('mousePressed', x0, y0, { timestamp: t0 });
    for (let i = 1; i <= 40; i++) await send('mouseMoved', x0 + i * w / 40, y0 + Math.sin(i / 2) * 9, { timestamp: t0 + i * 0.008 }); await send('mouseReleased', x0 + w, y0, { timestamp: t0 + 0.4 }); await wait(150); };
  await p.evaluate(() => setTool('pen'));
  const spots = await p.evaluate(() => { const c = cornellOf(0); return { notes: toScreen(c.cue + 40, c.head + 120), cue: toScreen(c.f[0] + 20, c.head + 120) }; });
  await scribble(spots.notes[0], spots.notes[1], 260); await scribble(spots.cue[0], spots.cue[1], 120); await wait(300);
  const strokes = await p.evaluate(() => S.items.slice(-2).map(s => s.bb));
  const darkest = bb => p.evaluate(bb => { for (let i = 0; i < 6; i++) draw(); const [x0, y0] = toScreen(bb[0], bb[1]), [x1, y1] = toScreen(bb[2], bb[3]), r = cvMain.getBoundingClientRect(), k = cvMain.width / r.width;
    const d = ctxMain.getImageData(Math.round((x0 - r.left) * k), Math.round((y0 - r.top) * k), Math.max(1, Math.round((x1 - x0) * k)), Math.max(1, Math.round((y1 - y0) * k))).data;
    let m = 255; for (let i = 0; i < d.length; i += 4) m = Math.min(m, (d[i] + d[i + 1] + d[i + 2]) / 3); return Math.round(m); }, bb);
  const before = [await darkest(strokes[0]), await darkest(strokes[1])];

  // ---------- Verdecken: Notizen unscharf, Stichworte scharf ----------
  const btn = () => p.evaluate(() => { const b = $('#cornBtn'), r = b.getBoundingClientRect(), c = cornellOf(currentSheet()), [x0, y0] = toScreen(c.cue, c.head), [x1] = toScreen(sheetRect(currentSheet())[2], c.head);
    return { vis: getComputedStyle(b).display !== 'none' && b.style.visibility !== 'hidden', txt: b.textContent.trim(), on: b.classList.contains('on'), inNotes: r.left > x0 && r.right <= Math.min(x1, innerWidth) && r.top > y0, hide: !!S.cornellHide }; });
  const b0 = await btn();
  await p.click('#cornBtn'); await wait(300);
  const b1 = await btn(), after = [await darkest(strokes[0]), await darkest(strokes[1])];
  check('Knopf „Verdecken“ oben rechts in der Notizen-Spalte', b0.vis && b0.txt === 'Verdecken' && !b0.on && b0.inNotes && !b0.hide, b0);
  check('Verdecken: Notizen unscharf, Stichworte bleiben scharf, Knopf „Aufdecken“', b1.hide && b1.on && b1.txt === 'Aufdecken' && before[0] < 90 && after[0] > before[0] + 60 && near(after[1], before[1], 12), { before, after, b1 });
  await p.screenshot({ path: path.join(SHOTS, 'cornell_hidden.png') });
  // Export: Vorlage dabei, Notizen scharf
  { const ex = await p.evaluate(async () => { const c = cornellOf(0), sc = 2, cv = await renderTo(S.items, sheetRect(0), sc, S.note.bg, { note: S.note, light: true }), g = cv.getContext('2d');
      const px1 = (x, y) => [...g.getImageData(Math.round(x * sc), Math.round(y * sc), 1, 1).data].slice(0, 3), bb = S.items[S.items.length - 2].bb;
      const at = (x, y) => { let best = null; for (let d = -2; d <= 2; d += 0.5) { const q = px1(x + d, y); if (!best || q[2] - q[0] > best[2] - best[0]) best = q; } return best; };
      const d = g.getImageData(Math.round(bb[0] * sc), Math.round(bb[1] * sc), Math.round((bb[2] - bb[0]) * sc), Math.round((bb[3] - bb[1]) * sc)).data; let m = 255; for (let i = 0; i < d.length; i += 4) m = Math.min(m, (d[i] + d[i + 1] + d[i + 2]) / 3);
      return { line: at(c.cue, (c.head + c.sum) / 2 + 3), ink: Math.round(m) }; });
    check('Export (PDF, Vorschaubild): mit Vorlage, Notizen auch verdeckt scharf', ex.line[2] > ex.line[0] + 12 && ex.ink < 90, ex); }
  // Fingertipp auf die verdeckte Spalte: aufdecken
  await wait(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spots.notes[0] + 100, y: spots.notes[1] + 80, id: 1 }] }); await wait(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(350);
  const b2 = await btn();
  check('Fingertipp auf die verdeckten Notizen deckt auf', !b2.hide && b2.txt === 'Verdecken' && near(await darkest(strokes[0]), before[0], 12), { b2 });

  // ---------- Darkmode ----------
  await p.click('#bDark'); await wait(400);
  { const c = await p.evaluate(() => cornellOf(0)), v = await line(c.cue, (c.head + c.sum) / 2 + 3, true), bg = await px((c.cue + c.f[2]) / 2 + 9, (c.head + c.sum) / 2 + 9);
    check('Darkmode: Linien gedämpft auf dunklem Papier', bg[0] < 40 && v[2] > bg[2] + 15, { v, bg }); }
  await p.click('#cornBtn'); await wait(300);
  await p.screenshot({ path: path.join(SHOTS, 'cornell_dark_hidden.png') });
  await p.click('#cornBtn'); await p.click('#bDark'); await wait(300);

  // ---------- Nächste neue Seite im Buch: Cornell vorgewählt; andere Formate ohne Knopf ----------
  await p.click('#bBack'); await wait(600);
  await p.click('#hNew'); await wait(400);
  check('Nächste neue Seite: Cornell vorgewählt', await p.evaluate(() => $('#dlgFmt [data-f=cornell]').classList.contains('on')));
  await p.click('#dlgFmt [data-f=a4]'); await wait(100); await p.click('#dlgOk'); await p.waitForFunction(() => S.note, null, { timeout: 8000 }); await wait(500);
  check('DIN A4 ohne Cornell: keine Vorlage, kein Knopf', await p.evaluate(() => !S.note.paper.t && !isCornell() && $('#cornBtn').classList.contains('hidden')));

  check('Keine Fehler', errs.length === 0, errs);
  res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  console.log(fails.length ? 'FEHLER: ' + fails.length : 'alles ok');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(res, null, 1)); process.exit(1); });
