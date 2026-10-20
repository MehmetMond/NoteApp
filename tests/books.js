// Bücher auf der Startseite (1.4): Migration aus 1.3, Bücher/Seiten anlegen, bearbeiten, verschieben, löschen,
// Navigation, Sicherung Format 3 (Hin und zurück), alte Sicherungen (Format 2 und 1), Layout und Screenshots.
// Aufruf: node t3/books.js   -> JSON mit "fails": [] und "errors": []
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const DIR = path.resolve(__dirname, '..');
const ICON = path.join(__dirname, 'icon.png');
const OLD2 = path.join(__dirname, 'backup-v2.notizen');   // Sicherung aus Version 1.3 (Format 2)
const { seed } = require('./demo');
const res = { checks: 0, fails: [] };
const check = (name, ok, detail) => { res.checks++; if (!ok) res.fails.push(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail))); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, acceptDownloads: true });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const idle = () => p.evaluate(() => new Promise(r => setTimeout(r, 60))).then(() => p.waitForFunction(() => !navBusy));
  const shelfReady = () => p.waitForSelector('#hShelfHead:not(.hidden)');
  const bookReady = name => p.waitForFunction(n => !$('#hBookHead').classList.contains('hidden') && $('#hBookName').textContent === n, name);
  const inEditor = () => p.waitForFunction(() => !!S.note && !$('#editor').classList.contains('hidden'));
  const atHome = () => p.waitForFunction(() => !S.note && !$('#home').classList.contains('hidden'));
  const dlgOpen = () => p.waitForSelector('#dlg:not(.hidden)');
  const dlgClosed = () => p.waitForSelector('#dlg.hidden', { state: 'attached' });
  const db = () => p.evaluate(async () => {
    const books = (await reqP(db.transaction('books').objectStore('books').getAll())).sort(byCreated);
    const notes = (await dbIndexAll()).sort(byCreated).map(({ thumb, ...m }) => ({ ...m, thumb: !!thumb }));
    return { books, notes };
  });
  const cards = () => p.$$eval('#grid .card .nm', e => e.map(x => x.textContent));
  const covers = () => p.$$eval('#grid .book .nm', e => e.map(x => x.textContent));
  const draw = async (x, y) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 160, y + 40, { steps: 8 }); await p.mouse.up(); };
  const back = async () => { await p.click('#bBack'); await atHome(); await idle(); };
  const menuItem = async label => { await p.locator('#homeMenu button', { hasText: label }).first().click(); };
  const cardMenu = async name => { await p.locator('#grid .card', { has: p.locator('.nm', { hasText: name }) }).locator('.mbtn').click(); await p.waitForSelector('#homeMenu:not(.hidden)'); };
  const coverMenu = async name => { await p.locator('#grid .book', { has: p.locator('.nm', { hasText: name }) }).locator('.mbtn').click(); await p.waitForSelector('#homeMenu:not(.hidden)'); };
  const openCover = async name => { await p.locator('#grid .book', { has: p.locator('.nm', { hasText: name }) }).locator('.cv').click(); await bookReady(name); await idle(); };
  const openCard = async name => { await p.locator('#grid .card', { has: p.locator('.nm', { hasText: name }) }).locator('.th').click(); await inEditor(); };

  // ---------- 0. Neuinstallation (eigener Kontext = leere Datenbank): leeres Regal, kein Buch von selbst
  {
    const c0 = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 }); const q = await c0.newPage();
    q.on('pageerror', e => errs.push('pageerror(fresh): ' + e.message)); q.on('console', m => { if (m.type() === 'error') errs.push('console(fresh): ' + m.text()); });
    await q.goto('file://' + DIR + '/Notizen.html'); await q.waitForSelector('#grid .empty');
    const f = await q.evaluate(async () => ({ books: (await ensureBooks()).books.length, empty: $('#grid .empty h2').textContent, btn: $('#grid .empty button').textContent.trim(), sub: $('#hShelfSub').textContent, title: $('#hShelfHead h1').textContent }));
    check('fresh install: empty shelf, no automatic book', eq(f, { books: 0, empty: 'Dein Regal ist noch leer', btn: 'Erstes Buch anlegen', sub: '', title: 'Meine Bücher' }), f);
    await q.click('#grid .empty button'); await q.waitForSelector('#dlg:not(.hidden)'); await q.press('#dlgIn', 'Enter');
    await q.waitForFunction(() => $('#hBookName').textContent === 'Neues Buch' && $('#grid .empty'));
    check('fresh install: first book via empty state', (await q.evaluate(() => ensureBooks().then(r => r.books.length))) === 1);
    await c0.close();
  }

  // ---------- 1. Daten in Version 1.3 anlegen (echte alte Daten)
  await p.goto('file://' + DIR + '/Notizen-v13.html'); await p.waitForTimeout(400);
  await p.click('#hNew'); await p.waitForTimeout(400);
  await draw(300, 300); await draw(300, 420);
  await p.setInputFiles('#fImg', ICON); await p.waitForFunction(() => S.busy === 0 && S.items.some(i => i.t === 'i'));
  await p.waitForTimeout(200);
  await p.click('#bBack'); await p.waitForTimeout(800);
  await p.click('#hNew'); await p.waitForTimeout(400); await p.click('[data-tool=pen]');   // nach dem Bild war das Lasso aktiv
  await p.fill('#title', 'Vokabeln'); await draw(500, 500);
  await p.evaluate(() => { S.note.bg = 'grid'; markDirty(); });
  await p.click('#bBack'); await p.waitForTimeout(800);
  await p.click('#hNew'); await p.waitForTimeout(400); await p.fill('#title', 'Skizze'); await p.evaluate(() => zoomAt(VW / 2, VH / 2, 1.5)); await draw(400, 300);
  await p.click('#bBack'); await p.waitForTimeout(800);
  const dump = () => p.evaluate(async () => {
    const metas = (await dbIndexAll()).sort((a, b) => a.created - b.created);
    const out = [];
    for (const m of metas) {
      const items = (await dbItems(m.id)).sort((a, b) => a.o - b.o).map(it => ({ ...it, pts: it.pts ? Array.from(it.pts) : undefined }));
      const imgs = await reqP(db.transaction('images').objectStore('images').index('n').getAll(m.id));
      const { book, ...rest } = m;
      out.push({ meta: rest, items, imgs: imgs.map(i => ({ id: i.id, n: i.n, w: i.w, h: i.h, size: i.blob.size, type: i.blob.type })) });
    }
    return out;
  });
  const before = await dump();
  check('v13 data created', before.length === 3 && eq(before.map(x => x.items.length), [3, 1, 1]) && before[0].imgs.length === 1 && before.every(x => x.meta.thumb), before.map(x => x.items.length));

  // ---------- 2. Neue Version öffnen -> DB v3, alles im Buch „Meine Notizen“
  await p.goto('file://' + DIR + '/Notizen.html'); await shelfReady(); await idle();
  const after = await dump();
  check('migration: data unchanged', eq(before, after));
  const dbInfo = await p.evaluate(() => ({ v: db.version, stores: [...db.objectStoreNames].sort() }));
  check('db version 4 with books + shapes stores', dbInfo.v === 4 && eq(dbInfo.stores, ['books', 'images', 'index', 'items', 'shapes']), dbInfo);
  let st = await db();
  check('migration: one default book', st.books.length === 1 && st.books[0].name === 'Meine Notizen' && st.books[0].color === 'blue', st.books);
  check('migration: all notes in default book', st.notes.every(n => n.book === st.books[0].id) && st.notes.length === 3);
  check('migration: thumbs + views kept', st.notes.every(n => n.thumb) && st.notes[2].view.z === 1.5, st.notes.map(n => n.view));
  check('migration: updated not touched', eq(st.notes.map(n => n.updated), before.map(x => x.meta.updated)));
  check('shelf shows default book', eq(await covers(), ['Meine Notizen']));
  check('shelf caption', /^3 Seiten · \d\d\.\d\d\.\d{4}$/.test(await p.textContent('.book .dt')), await p.textContent('.book .dt'));
  check('shelf subtitle', (await p.textContent('#hShelfSub')) === '1 Buch · 3 Seiten', await p.textContent('#hShelfSub'));
  check('shelf: #hNew hidden, #hNewBook visible', !(await p.isVisible('#hNew')) && await p.isVisible('#hNewBook'));
  // zwei gleichzeitige Anzeigen / Neuladen legen kein zweites Standardbuch an
  await p.evaluate(async () => { await Promise.all([ensureBooks(), ensureBooks(), renderHome(), renderHome()]); });
  await p.reload(); await shelfReady(); await idle();
  check('default book not duplicated', (await db()).books.length === 1);
  await openCover('Meine Notizen');
  check('book view: pages in created order', eq(await cards(), before.map(x => x.meta.name)), await cards());
  check('book view: header', (await p.textContent('#hBookSub')).startsWith('3 Seiten'), await p.textContent('#hBookSub'));
  check('book view: #hNew visible', await p.isVisible('#hNew') && !(await p.isVisible('#hNewBook')));
  check('book view: thumbnails', (await p.$$eval('#grid .card .th img', e => e.length)) === 3);
  await openCard(before[0].meta.name);
  await p.waitForFunction(() => [...IM.values()].every(e => e.state === 'ok'));
  check('migrated note opens with strokes + image', eq(await p.evaluate(() => S.items.map(i => i.t)), before[0].items.map(i => i.t)));
  await back();
  check('back returns to the page book', await p.isVisible('#hBookHead') && (await p.textContent('#hBookName')) === 'Meine Notizen');
  await p.keyboard.press('Escape'); await shelfReady();
  check('Esc in book view goes to shelf', await p.isVisible('#hShelfHead'));

  // ---------- 3. Buch anlegen (Dialog mit Farben)
  await p.click('#hNewBook'); await dlgOpen();
  check('new book dialog: swatches', (await p.$$eval('#dlgSw .bsw', e => e.length)) === 9);
  check('new book dialog: default name + free colour', eq(await p.evaluate(() => [$('#dlgIn').value, $('#dlgSw .bsw.on').dataset.c, $('#dlgOk').textContent]), ['Neues Buch', 'red', 'Anlegen']));
  await p.keyboard.press('Escape'); await dlgClosed(); await idle();
  check('cancel creates nothing', (await db()).books.length === 1);
  await p.click('#hNewBook'); await dlgOpen();
  await p.fill('#dlgIn', 'Mathe'); await p.click('.bsw[data-c=teal]');
  check('dialog preview follows input', eq(await p.evaluate(() => [$('#dlgPrev .lbl').textContent, $('#dlgPrev').style.getPropertyValue('--c1')]), ['Mathe', '#3a98a0']));
  await p.press('#dlgIn', 'Enter'); await bookReady('Mathe'); await idle();
  st = await db();
  const mathe = st.books.find(x => x.name === 'Mathe');
  check('book created', mathe && mathe.color === 'teal' && typeof mathe.created === 'number', st.books);
  check('new book opens, empty state', await p.isVisible('#grid .empty') && (await p.textContent('#hBookSub')) === 'Noch keine Seiten');
  await p.screenshot({ path: path.join(__dirname, 'books_empty_book.png') });
  // Standardname: OK ohne Eingabe
  await p.click('#hShelf'); await shelfReady(); await idle();
  await p.click('#hNewBook'); await dlgOpen(); await p.click('#dlgOk'); await bookReady('Neues Buch'); await idle();
  // Swatch anklicken, dann Enter (Fokus nicht im Feld)
  await p.click('#hShelf'); await shelfReady(); await idle();
  await p.click('#grid .addtile'); await dlgOpen(); await p.fill('#dlgIn', 'Physik'); await p.click('.bsw[data-c=purple]'); await p.keyboard.press('Enter'); await bookReady('Physik'); await idle();
  st = await db();
  check('three more books', eq(st.books.map(x => [x.name, x.color]), [['Meine Notizen', 'blue'], ['Mathe', 'teal'], ['Neues Buch', 'red'], ['Physik', 'purple']]), st.books);

  // ---------- 4. Buch bearbeiten (Kopf-Menü) und Farbe
  await p.click('#hBookMenu'); await p.waitForSelector('#homeMenu:not(.hidden)');
  check('book menu items', eq(await p.$$eval('#homeMenu button', e => e.map(x => x.textContent.trim())), ['Umbenennen / Farbe', 'Löschen']));
  await p.click('#hBookMenu');
  check('book menu toggles closed', await p.isHidden('#homeMenu'));
  await p.click('#hBookMenu'); await menuItem('Umbenennen / Farbe'); await dlgOpen();
  check('edit dialog prefilled', eq(await p.evaluate(() => [$('#dlgMsg').textContent, $('#dlgIn').value, $('#dlgSw .bsw.on').dataset.c, $('#dlgOk').textContent]), ['Buch bearbeiten', 'Physik', 'purple', 'Speichern']));
  await p.fill('#dlgIn', 'Physik LK'); await p.click('.bsw[data-c=mustard]'); await p.press('#dlgIn', 'Enter'); await bookReady('Physik LK'); await idle();
  st = await db();
  check('book edited', st.books.some(x => x.name === 'Physik LK' && x.color === 'mustard'));
  check('header accent colour', (await p.evaluate(() => $('#home').style.getPropertyValue('--c1'))) === '#e2b445');
  // leerer Name beim Bearbeiten behält den alten Namen
  await p.click('#hBookMenu'); await menuItem('Umbenennen / Farbe'); await dlgOpen(); await p.fill('#dlgIn', '   '); await p.press('#dlgIn', 'Enter'); await idle();
  check('empty name keeps old name', (await db()).books.some(x => x.name === 'Physik LK'));
  // Bearbeiten über das ⋯ am Einband
  await p.click('#hShelf'); await shelfReady(); await idle();
  await coverMenu('Neues Buch'); await menuItem('Umbenennen / Farbe'); await dlgOpen(); await p.fill('#dlgIn', 'Chemie'); await p.press('#dlgIn', 'Enter'); await idle();
  check('rename from cover menu', eq(await covers(), ['Meine Notizen', 'Mathe', 'Chemie', 'Physik LK']), await covers());
  check('cover colours', eq(await p.$$eval('#grid .book', e => e.map(x => x.style.getPropertyValue('--c1'))), ['#5b8ce2', '#3a98a0', '#dc5f55', '#e2b445']));

  // ---------- 5. Seiten anlegen, Reihenfolge, Navigation
  await openCover('Mathe');
  await p.click('#grid .empty button'); await inEditor();
  check('new page name + book', eq(await p.evaluate(() => [S.note.name, S.note.book === homeBook, $('#title').value]), ['Seite 1', true, 'Seite 1']));
  await draw(300, 300); await back();
  check('back to Mathe after new page', (await p.textContent('#hBookName')) === 'Mathe' && eq(await cards(), ['Seite 1']));
  await p.click('#hNew'); await inEditor(); await draw(320, 320);
  await p.evaluate(() => { S.note.bg = 'grid'; markDirty(); }); await back();
  await p.click('#grid .addtile'); await inEditor();
  check('new page inherits background of last page', (await p.evaluate(() => S.note.bg)) === 'grid');
  await back();
  check('page order: appended', eq(await cards(), ['Seite 1', 'Seite 2', 'Seite 3']));
  check('page numbers', eq(await p.$$eval('#grid .card .pno', e => e.map(x => x.textContent)), ['1', '2', '3']));
  check('empty page placeholder shows its background', await p.$eval('#grid .card:nth-child(3) .th', e => e.classList.contains('bg-grid') && !e.querySelector('img')));
  await openCard('Seite 2'); await draw(400, 400); await back();
  check('editing does not reorder pages', eq(await cards(), ['Seite 1', 'Seite 2', 'Seite 3']));
  st = await db();
  const mp = st.notes.filter(n => n.book === mathe.id);
  check('pages created ascending', mp.length === 3 && mp[0].created < mp[1].created && mp[1].created < mp[2].created);
  // Notiz ohne Buch (wie Teil A und ältere Tests sie anlegen) -> Zurück führt ins Regal, Seite landet in „Meine Notizen“
  await p.evaluate(async () => { const now = Date.now(); const n = { id: 'nobook1', name: 'Ohne Buch', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } }; await dbIndexPut(n); await openNote(n); });
  await inEditor(); await draw(300, 300); await back();
  check('note without book: back goes to shelf', await p.isVisible('#hShelfHead'));
  st = await db();
  check('note without book adopted by default book', st.notes.find(n => n.id === 'nobook1').book === st.books.find(x => x.name === 'Meine Notizen').id);
  check('shelf captions', eq(await p.$$eval('#grid .book .dt', e => e.map(x => x.textContent.split(' · ')[0])), ['4 Seiten', '3 Seiten', 'Leer', 'Leer']));
  // __flush (Electron beim Schließen) mit einer Notiz ohne Buch
  await p.evaluate(async () => { const now = Date.now(); const n = { id: 'nobook2', name: 'Flush', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } }; await dbIndexPut(n); await openNote(n); });
  await inEditor(); await draw(300, 300); await p.evaluate(() => window.__flush());
  await p.reload(); await shelfReady(); await idle();
  st = await db();
  const fl = st.notes.find(n => n.id === 'nobook2');
  check('__flush keeps stroke, note adopted after reload', fl && fl.book && (await p.evaluate(() => dbItems('nobook2').then(l => l.length))) === 1);
  check('app starts on the shelf', await p.isVisible('#hShelfHead') && await p.isVisible('#hNewBook'));

  // ---------- 6. Seite umbenennen, verschieben, löschen
  await openCover('Mathe');
  await cardMenu('Seite 2');
  check('page menu items', eq(await p.$$eval('#homeMenu button', e => e.map(x => x.textContent.trim())), ['Umbenennen', 'In anderes Buch verschieben', 'Löschen']));
  await p.mouse.click(1300, 900);   // daneben tippen: schließt nur das Menü
  await p.waitForTimeout(100);
  check('tap outside closes menu only', await p.isHidden('#homeMenu') && (await p.textContent('#hBookName')) === 'Mathe' && !(await p.evaluate(() => !!S.note)));
  await cardMenu('Seite 2');
  await p.locator('#grid .card').first().locator('.th').click();   // Tipp auf eine andere Seite bei offenem Menü
  await p.waitForTimeout(150);
  check('tap on a card with open menu does not open it', await p.isHidden('#homeMenu') && !(await p.evaluate(() => !!S.note)));
  await cardMenu('Seite 2'); await menuItem('Umbenennen'); await dlgOpen();
  await p.fill('#dlgIn', 'Ableitungen'); await p.press('#dlgIn', 'Enter'); await idle();
  check('page renamed, order kept', eq(await cards(), ['Seite 1', 'Ableitungen', 'Seite 3']), await cards());
  await cardMenu('Ableitungen'); await menuItem('In anderes Buch verschieben');
  check('move list shows other books', eq(await p.$$eval('#homeMenu button .lbl', e => e.map(x => x.textContent)), ['Verschieben nach …', 'Meine Notizen', 'Chemie', 'Physik LK', 'Neues Buch …']));
  await menuItem('Verschieben nach …');
  check('move list back to main menu', (await p.$$eval('#homeMenu button', e => e.length)) === 3);
  await menuItem('In anderes Buch verschieben'); await menuItem('Physik LK'); await idle();
  check('page moved away', eq(await cards(), ['Seite 1', 'Seite 3']));
  st = await db();
  const abl = st.notes.find(n => n.name === 'Ableitungen');
  check('page now in Physik LK, items kept', abl.book === st.books.find(x => x.name === 'Physik LK').id && (await p.evaluate(id => dbItems(id).then(l => l.length), abl.id)) === 2);
  await cardMenu('Seite 3'); await menuItem('In anderes Buch verschieben'); await menuItem('Neues Buch …'); await dlgOpen();
  await p.fill('#dlgIn', 'Biologie'); await p.press('#dlgIn', 'Enter'); await idle();
  st = await db();
  check('move to new book', st.notes.find(n => n.name === 'Seite 3').book === st.books.find(x => x.name === 'Biologie').id && eq(await cards(), ['Seite 1']));
  // Löschen: Abbrechen, dann bestätigen
  await cardMenu('Seite 1'); await menuItem('Löschen'); await dlgOpen();
  check('delete page confirm text', eq(await p.evaluate(() => [$('#dlgMsg').textContent, $('#dlgOk').textContent, $('#dlgOk').classList.contains('danger')]), ['„Seite 1“ wirklich löschen? Das kann nicht rückgängig gemacht werden.', 'Löschen', true]));
  await p.click('#dlgNo'); await idle();
  check('delete cancelled', eq(await cards(), ['Seite 1']));
  const s1 = (await db()).notes.find(n => n.name === 'Seite 1').id;
  await cardMenu('Seite 1'); await menuItem('Löschen'); await dlgOpen(); await p.click('#dlgOk'); await idle();
  check('page deleted (index + items)', (await cards()).length === 0 && await p.isVisible('#grid .empty') && (await p.evaluate(id => Promise.all([dbIndexGet(id), dbItems(id)]), s1)).every(x => !x || (Array.isArray(x) && !x.length)));

  // ---------- 7. Buch löschen
  await p.click('#hShelf'); await shelfReady(); await idle();
  await openCover('Physik LK'); await p.click('#hNew'); await inEditor(); await draw(300, 300); await back();
  const phys = (await db()).notes.filter(n => n.book === (st.books.find(x => x.name === 'Physik LK').id)).map(n => n.id);
  await p.click('#hBookMenu'); await menuItem('Löschen'); await dlgOpen();
  check('delete book text', (await p.textContent('#dlgMsg')) === 'Buch „Physik LK“ mit 2 Seiten löschen? Das kann nicht rückgängig gemacht werden.', await p.textContent('#dlgMsg'));
  await p.click('#dlgNo'); await idle();
  check('delete book cancelled', (await db()).books.some(x => x.name === 'Physik LK'));
  await p.click('#hBookMenu'); await menuItem('Löschen'); await dlgOpen(); await p.click('#dlgOk'); await shelfReady(); await idle();
  st = await db();
  check('book + its pages deleted', !st.books.some(x => x.name === 'Physik LK') && !st.notes.some(n => phys.includes(n.id)) && (await p.evaluate(ids => Promise.all(ids.map(dbItems)).then(l => l.every(x => !x.length)), phys)));
  check('other books intact', eq(await covers(), ['Meine Notizen', 'Mathe', 'Chemie', 'Biologie']));
  await coverMenu('Chemie'); await menuItem('Löschen'); await dlgOpen();
  check('delete empty book text', (await p.textContent('#dlgMsg')) === 'Buch „Chemie“ löschen?');
  await p.click('#dlgOk'); await idle();
  check('empty book deleted', eq(await covers(), ['Meine Notizen', 'Mathe', 'Biologie']));

  // ---------- 8. Sicherung (Format 3) und Wiederherstellung
  await openCover('Biologie'); await openCard('Seite 3'); await p.setInputFiles('#fImg', ICON); await p.waitForFunction(() => S.busy === 0 && S.items.some(i => i.t === 'i')); await back();
  const snap = async () => {
    const s = await db(), its = {};
    for (const n of s.notes) its[n.id] = await p.evaluate(async id => {
      const l = (await dbItems(id)).sort((a, b) => a.o - b.o);
      const imgs = await reqP(db.transaction('images').objectStore('images').index('n').getAll(id));
      return { n: l.length, s: l.filter(i => i.t === 's').map(i => Array.from(i.pts.slice(0, 6), v => Math.round(v * 100) / 100)), imgs: imgs.map(i => i.blob.size).sort() };
    }, n.id);
    return { books: s.books, notes: s.notes.map(({ thumb, ...m }) => m), its };
  };
  const full = await snap();
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bk = path.join(__dirname, 'books-backup.notizen'); await dl.saveAs(bk);
  const lines = fs.readFileSync(bk, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  check('backup header format 3', lines[0].app === 'notizen' && lines[0].format === 3 && typeof lines[0].saved === 'number', lines[0]);
  const bl = lines.filter(l => l.k === 'book');
  check('backup book lines first', eq(bl.map(l => l.name), ['Meine Notizen', 'Mathe', 'Biologie']) && lines.slice(1, 4).every(l => l.k === 'book'));
  check('backup note lines carry book', lines.filter(l => l.k === 'note').every(l => bl.some(x => x.id === l.book)));
  check('backup has items + images', lines.some(l => l.k === 'items') && lines.some(l => l.k === 'img'));
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); for (const b of await reqP(db.transaction('books').objectStore('books').getAll())) await dbBookDelete(b.id); await renderHome(); });
  await idle();
  check('wiped: empty shelf', await p.isVisible('#grid .empty') && (await db()).books.length === 0);
  await p.screenshot({ path: path.join(__dirname, 'books_empty_shelf.png') });
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy && $$('#grid .book').length === 3, null, { timeout: 20000 }); await idle();
  const rest = await snap();
  check('restore format 3: books identical', eq(rest.books, full.books), rest.books);
  check('restore format 3: notes identical', eq(rest.notes, full.notes));
  check('restore format 3: items + images identical', eq(rest.its, full.its));
  // nochmal wiederherstellen: keine doppelten Bücher, keine Kopien (gleicher Stand)
  await p.setInputFiles('#fRestore', bk); await p.waitForTimeout(400); await idle();
  const again = await db();
  check('restore twice: no duplicates', again.books.length === 3 && again.notes.length === full.notes.length);
  // vorhandene Bücher bleiben, wie sie lokal sind (Name/Farbe nach der Sicherung geändert)
  await p.evaluate(async id => { const b = await dbBookGet(id); await dbBookPut({ ...b, name: 'Mathe neu', color: 'green' }); }, full.books[1].id);
  await p.setInputFiles('#fRestore', bk); await p.waitForTimeout(400); await idle();
  check('restore keeps existing local book', eq((await db()).books.map(x => [x.name, x.color]), [['Meine Notizen', 'blue'], ['Mathe neu', 'green'], ['Biologie', full.books[2].color]]), (await db()).books);
  await p.evaluate(async b => dbBookPut(b), full.books[1]);
  // lokal neuer -> Kopie „(Sicherung)“ im selben Buch
  const target = full.notes.find(n => n.name === 'Seite 3');
  await p.evaluate(async id => { const m = await dbIndexGet(id); m.updated = Date.now() + 1e6; await dbIndexPut(m); }, target.id);
  await p.setInputFiles('#fRestore', bk); await p.waitForTimeout(400); await idle();
  const cp = (await db()).notes.find(n => n.name === 'Seite 3 (Sicherung)');
  check('conflict copy keeps book', cp && cp.book === target.book && cp.id !== target.id);
  // Format 2 (Sicherung aus 1.3): landet in „Meine Notizen“; ohne dieses Buch wird es angelegt
  await coverMenu('Meine Notizen'); await menuItem('Löschen'); await dlgOpen(); await p.click('#dlgOk'); await idle();
  const old2 = fs.readFileSync(OLD2, 'utf8').split('\n', 2);
  check('old backup is format 2', JSON.parse(old2[0]).format === 2);
  const old2Notes = fs.readFileSync(OLD2, 'utf8').split('\n').filter(l => l.startsWith('{"k":"note"')).map(l => JSON.parse(l).id);
  await p.setInputFiles('#fRestore', OLD2); await p.waitForFunction(() => !navBusy, null, { timeout: 30000 }); await idle();
  st = await db();
  const def = st.books.find(x => x.name === 'Meine Notizen');
  check('format 2 restore: default book recreated', !!def && st.books.length === 3, st.books.map(x => x.name));
  check('format 2 restore: notes in default book', old2Notes.length === 2 && old2Notes.every(id => st.notes.find(n => n.id === id)?.book === def.id));
  check('format 2 restore: items', (await p.evaluate(ids => Promise.all(ids.map(dbItems)).then(l => l.map(x => x.length)), old2Notes)).reduce((a, b) => a + b, 0) > 3000);
  // Format 1 (Version 1): ebenfalls „Meine Notizen“
  const v1 = path.join(__dirname, 'books-v1.json');
  fs.writeFileSync(v1, JSON.stringify({ app: 'notizen', version: 1, notes: [{ id: 'v1note', name: 'Alt', created: 1, updated: 2, bg: 'dots', items: [{ t: 's', id: 'a', c: 'ink', w: 2, pts: [0, 0, .5, 50, 50, .5], bb: [-2, -2, 52, 52] }] }] }));
  await p.setInputFiles('#fRestore', v1); await p.waitForTimeout(500); await idle();
  st = await db();
  check('format 1 restore: in default book', st.notes.find(n => n.id === 'v1note')?.book === def.id);
  check('format 1 restore: first page of the book (oldest)', (await (async () => { await openCover('Meine Notizen'); return (await cards())[0]; })()) === 'Alt');

  // ---------- 9. Layout, Screenshots hell/dunkel, quer/hoch
  for (const n of await p.evaluate(() => dbIndexAll().then(l => l.map(m => m.id)))) await p.evaluate(id => dbDeleteNote(id), n);
  await p.evaluate(async () => { for (const b of await reqP(db.transaction('books').objectStore('books').getAll())) await dbBookDelete(b.id); });
  const ids = await seed(p);
  const layout = () => p.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const small = $$('#home button').filter(vis).map(e => e.getBoundingClientRect()).filter(r => r.width < 40 || r.height < 40).length;
    const h = $('#home header').getBoundingClientRect().height, sw = document.documentElement.scrollWidth, gw = $('#grid').scrollWidth - $('#grid').clientWidth;
    return { small, headerH: Math.round(h), overflowX: Math.max(0, sw - innerWidth, gw) };
  });
  for (const [w, h, tag] of [[1440, 960, 'land'], [960, 1440, 'port']]) {
    await p.setViewportSize({ width: w, height: h });
    for (const dark of [false, true]) {
      const m = dark ? 'dark' : 'light';
      await p.evaluate(d => { if (S.dark !== d) toggleDark(); }, dark);
      await p.mouse.move(1, 1); await p.evaluate(() => showShelf()); await shelfReady(); await idle(); await p.waitForTimeout(600);
      const l1 = await layout();
      check(`layout shelf ${tag} ${m}`, l1.small === 0 && l1.headerH < 100 && l1.overflowX === 0, l1);
      await p.screenshot({ path: path.join(__dirname, `books_shelf_${tag}_${m}.png`) });
      await p.evaluate(id => openBook(id), ids.Mathe); await bookReady('Mathe'); await idle(); await p.waitForTimeout(600);
      const l2 = await layout();
      check(`layout book ${tag} ${m}`, l2.small === 0 && l2.headerH < 100 && l2.overflowX === 0, l2);
      await p.screenshot({ path: path.join(__dirname, `books_book_${tag}_${m}.png`) });
    }
  }
  await p.setViewportSize({ width: 1440, height: 960 });
  await p.evaluate(() => { if (S.dark) toggleDark(); showShelf(); }); await shelfReady(); await idle();
  await p.click('#hNewBook'); await dlgOpen(); await p.fill('#dlgIn', 'Mathe Leistungskurs');
  check('dialog targets ≥ 40px', await p.$$eval('#dlg button', e => e.every(x => { const r = x.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; })));
  await p.screenshot({ path: path.join(__dirname, 'books_dialog_light.png') });
  await p.click('#dlgNo');
  // Scrollposition bleibt beim Öffnen und Schließen einer Seite erhalten
  await p.setViewportSize({ width: 1440, height: 560 });
  await p.evaluate(id => openBook(id), ids.Mathe); await bookReady('Mathe'); await idle();
  await p.evaluate(() => { $('#grid').scrollTop = 200; });
  const top0 = await p.evaluate(() => $('#grid').scrollTop);
  await p.evaluate(() => $$('#grid .card .th').at(-1).click()); await inEditor(); await back();
  check('scroll position kept after closing a page', top0 > 50 && Math.abs((await p.evaluate(() => $('#grid').scrollTop)) - top0) < 2, [top0, await p.evaluate(() => $('#grid').scrollTop)]);

  res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e); res.errors = ['exception: ' + e.message]; console.log(JSON.stringify(res, null, 1)); process.exit(1); });
