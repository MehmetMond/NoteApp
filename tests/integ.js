// Zusammenspiel Teil A + B (1.4): Formen, Graphen und Raster in einer Seite, die über Regal -> Buch geöffnet wurde;
// Zurück führt ins Buch, alles bleibt nach Neuladen und nach Sicherung/Wiederherstellung (Format 3) erhalten.
// Aufruf: node t3/integ.js  -> JSON mit "fails": [] und "errors": []
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const DIR = path.resolve(__dirname, '..');
const res = { checks: 0, fails: [] };
const check = (name, ok, detail) => { res.checks++; res[name] = detail === undefined ? !!ok : detail; if (!ok) res.fails.push(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail))); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, acceptDownloads: true });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const idle = () => p.evaluate(() => new Promise(r => setTimeout(r, 60))).then(() => p.waitForFunction(() => !navBusy));
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y, mods = 0) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.7, modifiers: mods });
  async function drag(x0, y0, x1, y1, { steps = 10, finish = true } = {}) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' });
    await pen('mousePressed', x0, y0);
    for (let k = 1; k <= steps; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps);
    if (finish) { await pen('mouseReleased', x1, y1); await frames(); }
  }
  async function scribble(x0, y0) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' });
    await pen('mousePressed', x0, y0);
    for (let i = 1; i <= 40; i++) await pen('mouseMoved', x0 + i * 5, y0 + Math.sin(i / 4) * 18);
    await pen('mouseReleased', x0 + 200, y0); await frames();
  }
  const pickShape = async k => {
    await p.evaluate(() => { if (S.tool !== 'shape') setTool('shape'); openGroupMenu(); }); await p.waitForSelector('#shapeMenu:not(.hidden)');
    await p.click(`#shapeMenu [data-shape="${k}"]`); await frames();
  };
  const items = () => p.evaluate(() => S.items.map(s => ({ t: s.t, k: s.k || null, g: s.g || null, n: s.t === 's' ? s.pts.length / 3 : 0, pts: s.t === 's' ? Array.from(s.pts) : null })));
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, sel);
  const cmp = await ctx.newPage(); await cmp.setContent('<body></body>');
  const diff = (a, c) => cmp.evaluate(async ([a, c]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, ink = 0;
    for (let i = 0; i < da.length; i += 4) { if (da[i] < 160) ink++; if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++; }
    return { changedPixels: n, inkPixels: ink };
  }, [a.toString('base64'), c.toString('base64')]);

  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500); await idle();
  check('startsOnShelf', await vis('#hShelfHead') && !(await vis('#editor')) && await vis('#hNewBook'));

  // ---------- 1. Buch anlegen (Dialog mit Farbe), Seite anlegen ----------
  await p.click('#hNewBook'); await p.waitForSelector('#dlg:not(.hidden)');
  await p.fill('#dlgIn', 'Mathe'); await p.click('.bsw[data-c=teal]'); await p.press('#dlgIn', 'Enter'); await idle();
  const book = await p.evaluate(() => homeData.books.find(b => b.id === homeBook));
  check('bookCreated', book && book.name === 'Mathe' && book.color === 'teal' && await vis('#hBookHead'), book);
  await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */ await p.waitForFunction(() => S.note && !$('#editor').classList.contains('hidden')); await p.waitForTimeout(300);
  check('pageInBook', await p.evaluate(id => [S.note.book === id, S.note.name, $('#title').value], book.id), await p.evaluate(id => [S.note.book === id, S.note.name, $('#title').value], book.id));

  // ---------- 2. Stift, Formen, Graph, Raster in dieser Seite ----------
  await p.evaluate(() => { if (S.snap) toggleSnap(); });
  await p.click('[data-tool=pen]'); await scribble(150, 200);
  await pickShape('axes2');
  check('menuPick', await p.evaluate(() => [S.tool, S.shape, $('#shapeMenu').classList.contains('hidden')]), await p.evaluate(() => [S.tool, S.shape, $('#shapeMenu').classList.contains('hidden')]));
  // Vorschau = Ergebnis (Pixel), auch in einer Seite aus einem Buch
  const clip = { x: 380, y: 280, width: 360, height: 320 };
  await drag(400, 300, 720, 580, { finish: false }); await p.waitForTimeout(150);
  const live = await p.screenshot({ clip });
  await pen('mouseReleased', 720, 580); await p.waitForTimeout(300);
  const fin = await p.screenshot({ clip });
  const d = await diff(live, fin);
  check('graphLiveEqualsFinal', d.changedPixels === 0 && d.inkPixels > 300, d);
  let it = await items();
  const gs = new Set(it.filter(s => s.k === 'axes2').map(s => s.g));
  check('graphGrouped', it.filter(s => s.k === 'axes2').length > 10 && gs.size === 1 && [...gs][0], { n: it.filter(s => s.k === 'axes2').length, groups: gs.size });
  // Raster an (Taste G), Rechteck: Ecken auf Vielfachen von 28 (Punktepapier)
  await p.keyboard.press('g'); await frames();
  check('snapKey', await p.evaluate(() => [S.snap, $('#bSnap').classList.contains('on')]), await p.evaluate(() => [S.snap, $('#bSnap').classList.contains('on')]));
  await pickShape('rect'); await drag(803, 211, 1010, 395);
  it = await items(); const rect = it[it.length - 1];
  check('rectSnapped28', rect.k === 'rect' && rect.pts.every((v, i) => i % 3 === 2 ? v === 0.5 : Math.abs(v / 28 - Math.round(v / 28)) < 1e-6), rect.pts);
  // Lasso-Tipp auf die x-Achse wählt den ganzen Graphen
  await p.evaluate(() => setTool('lasso'));
  const ax = await p.evaluate(() => { const s = S.items.find(i => i.k === 'axes2'); return toScreen(s.pts[0] + 30, s.pts[1]); });
  await drag(ax[0], ax[1], ax[0] + 1, ax[1], { steps: 1 }); await p.waitForTimeout(100);
  const sel = await p.evaluate(() => S.sel ? S.sel.ids.size : 0), nGraph = it.filter(s => s.k === 'axes2').length;
  check('lassoTapGroup', sel === nGraph, [sel, nGraph]);
  await p.keyboard.press('Escape');
  // Rückgängig/Wiederholen: der Graph ist ein Schritt
  const n0 = it.length;
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
  const nu = await p.evaluate(() => S.items.length);
  await p.keyboard.press('Control+y'); await p.keyboard.press('Control+y');
  check('undoRedo', nu === 1 && (await p.evaluate(() => S.items.length)) === n0, [nu, n0]);
  await p.screenshot({ path: path.join(__dirname, 'integ_page.png') });

  // ---------- 3. Zurück -> ins Buch, nicht ins Regal ----------
  await p.click('#bBack'); await idle(); await p.waitForTimeout(300);
  const home = await p.evaluate(() => ({ editor: !$('#editor').classList.contains('hidden'), bookHead: !$('#hBookHead').classList.contains('hidden'), name: $('#hBookName').textContent, cards: $$('#grid .card').length, thumb: !!$('#grid .card img'), menus: $$('.menu').filter(m => !m.classList.contains('hidden')).length }));
  check('backToBook', !home.editor && home.bookHead && home.name === 'Mathe' && home.cards === 1 && home.thumb && home.menus === 0, home);
  // Tasten G/F tun auf der Startseite nichts; Esc führt ins Regal
  const before = await p.evaluate(() => [S.snap, S.tool]);
  await p.keyboard.press('g'); await p.keyboard.press('f');
  check('keysIgnoredOnHome', JSON.stringify(await p.evaluate(() => [S.snap, S.tool])) === JSON.stringify(before), before);
  await p.keyboard.press('Escape'); await idle();
  check('escToShelf', await vis('#hShelfHead') && (await p.$$('#grid .book')).length === 1);

  // ---------- 4. Wieder öffnen (Regal -> Buch -> Seite): alles da, Formen gehen weiter ----------
  await p.click('#grid .book .cv'); await idle(); await p.click('#grid .card'); await p.waitForFunction(() => S.note && S.items.length); await p.waitForTimeout(300);
  const again = await items();
  check('reopened', again.length === n0 && again.filter(s => s.k === 'axes2').every(s => s.g === [...gs][0]) && again.some(s => s.k === 'rect'), again.length);
  check('toolKept', await p.evaluate(() => [S.tool, S.shape, S.snap]), await p.evaluate(() => [S.tool, S.shape, S.snap]));
  await p.evaluate(() => { S.snap && toggleSnap(); });
  await pickShape('ellipse'); await drag(250, 650, 420, 760);
  await pickShape('arrow'); await drag(500, 700, 700, 640);
  const n1 = await p.evaluate(() => S.items.length);
  check('shapesInReopenedPage', n1 === n0 + 2, [n1, n0]);
  // Hintergrund Linien -> neue Seite im Buch erbt ihn, Raster dort 34
  await p.click('#bBg'); await p.click('#bgMenu [data-bg=lines]'); await frames();
  await p.click('#bBack'); await idle(); await p.waitForTimeout(200);
  check('backToBook2', await vis('#hBookHead') && (await p.$$('#grid .card')).length === 1);
  await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */ await p.waitForFunction(() => S.note && S.note.name === 'Seite 2'); await p.waitForTimeout(200);
  await p.evaluate(() => { if (!S.snap) toggleSnap(); });
  await pickShape('rect'); await drag(205, 300, 410, 470);
  const r34 = (await items()).at(-1);
  check('newPageLinesGrid34', await p.evaluate(() => [S.note.bg, gridSize()]).then(v => v[0] === 'lines' && v[1] === 34) && r34.pts.every((v, i) => i % 3 === 2 || Math.abs(v / 34 - Math.round(v / 34)) < 1e-6), r34.pts);
  await p.click('#bBack'); await idle(); await p.waitForTimeout(200);
  check('twoPagesInOrder', await p.$$eval('#grid .card .nm', e => e.map(x => x.textContent)), await p.$$eval('#grid .card .nm', e => e.map(x => x.textContent)));

  // ---------- 5. Neu laden: Regal, Buch, Seiten, Formen ----------
  await p.reload(); await p.waitForTimeout(500); await idle();
  await p.waitForFunction(() => warmed && !document.querySelector('[data-warm]'), null, { timeout: 5000 });   // Aufwärmen enthält Kopien der Startseite
  check('reloadShelf', await vis('#hShelfHead') && (await p.$$('#grid .book')).length === 1);
  await p.click('#grid .book .cv'); await idle(); await p.locator('#grid .card').first().click(); await p.waitForFunction(() => S.note && S.items.length); await p.waitForTimeout(300);
  const persisted = await items();
  check('persisted', persisted.length === n1 && persisted.filter(s => s.k === 'axes2').length === nGraph && persisted.filter(s => s.k === 'axes2').every(s => s.g === [...gs][0]) && persisted.some(s => s.k === 'ellipse') && persisted.some(s => s.k === 'arrow'), persisted.length);
  check('prefsPersisted', await p.evaluate(() => [S.shape, S.snap, localStorage.getItem('notizen.shape')]), await p.evaluate(() => [S.shape, S.snap, localStorage.getItem('notizen.shape')]));
  await p.click('#bBack'); await idle();

  // ---------- 6. Sicherung (Format 3) -> Buch löschen -> Wiederherstellen ----------
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bk = path.join(__dirname, 'integ-backup.notizen'); await dl.saveAs(bk);
  const lines = fs.readFileSync(bk, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const bItems = lines.filter(l => l.k === 'items').flatMap(l => l.items);
  check('backupHasShapes', lines[0].format === 3 && lines.some(l => l.k === 'book' && l.name === 'Mathe') && bItems.filter(s => s.k === 'axes2' && s.g === [...gs][0]).length === nGraph, { format: lines[0].format, items: bItems.length });
  await p.click('#hBookMenu'); await p.click('#homeMenu .del'); await p.waitForSelector('#dlg:not(.hidden)'); await p.click('#dlgOk'); await idle(); await p.waitForTimeout(200);
  check('bookDeleted', await p.evaluate(async () => [(await dbIndexAll()).length, homeData.books.length]).then(v => v[0] === 0 && v[1] === 0));
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy && $$('#grid .book').length === 1, null, { timeout: 20000 }); await idle();
  await p.click('#grid .book .cv'); await idle();
  const names = await p.$$eval('#grid .card .nm', e => e.map(x => x.textContent));
  await p.locator('#grid .card').first().click(); await p.waitForFunction(() => S.note && S.items.length); await p.waitForTimeout(300);
  const restored = await items();
  check('restoredShapes', names.join() === 'Seite 1,Seite 2' && restored.length === n1 && restored.filter(s => s.k === 'axes2').every(s => s.g === [...gs][0]) && restored.some(s => s.k === 'rect'), { names, n: restored.length });
  // Lasso-Tipp nach der Wiederherstellung: Gruppe noch zusammen
  await p.evaluate(() => setTool('lasso'));
  const ax2 = await p.evaluate(() => { const s = S.items.find(i => i.k === 'axes2'); return toScreen(s.pts[0] + 30, s.pts[1]); });
  await drag(ax2[0], ax2[1], ax2[0] + 1, ax2[1], { steps: 1 }); await p.waitForTimeout(100);
  check('groupAfterRestore', (await p.evaluate(() => S.sel ? S.sel.ids.size : 0)) === nGraph);
  await p.keyboard.press('Escape');
  await p.click('#bBack'); await idle();
  check('backAfterRestore', await vis('#hBookHead') && await p.evaluate(() => $('#hBookName').textContent) === 'Mathe');

  check('noErrors', errs.length === 0, errs);
  res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(res.fails.length || errs.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(res, null, 1)); process.exit(1); });
