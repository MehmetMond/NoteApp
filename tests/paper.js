// Seitenformate: Dialog beim Anlegen, Blätter DIN A4/A3, Muster passend im Blatt, PDF auf Blätter, Blatt hinzufügen, PDF-Export
// Aufruf: node tests/paper.js  -> JSON mit "fails": [] und "errors": []
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const DIR = path.resolve(__dirname, '..'), OUT = __dirname;
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const errs = [];
  try {
    // Test-PDF: 5 Seiten A4
    const PDF = path.join(OUT, 'paper5.pdf');
    const tp = await ctx.newPage(); await tp.setContent('<h1>Seite 1</h1>' + [2, 3, 4, 5].map(i => `<div style="page-break-before:always"><h1>Seite ${i}</h1></div>`).join(''));
    await tp.pdf({ path: PDF, format: 'A4' }); await tp.close();

    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const idle = () => p.evaluate(() => new Promise(r => setTimeout(r, 60))).then(() => p.waitForFunction(() => !navBusy));
    const inEditor = () => p.waitForFunction(() => !!S.note && !$('#editor').classList.contains('hidden'));
    const back = async () => { await p.click('#bBack'); await p.waitForFunction(() => !S.note && !$('#home').classList.contains('hidden')); await idle(); };
    const newPage = async (f, o) => {
      await p.click('#hNew'); await p.waitForSelector('#dlg:not(.hidden) #dlgFmt:not(.hidden)');
      await p.click(`#dlgFmt [data-f="${f}"]`); if (o) await p.click(`#dlgFmt [data-o="${o}"]`);
      await p.click('#dlgOk'); await inEditor(); await p.waitForTimeout(200);
    };
    await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500);
    await p.evaluate(() => { if (S.dark) toggleDark(); });
    await p.click('#hNewBook'); await p.click('#dlgOk'); await idle();

    // ---------- 1. Dialog: Auswahl, Abbrechen legt nichts an, Ziele groß genug
    await p.click('#hNew'); await p.waitForSelector('#dlg:not(.hidden) #dlgFmt:not(.hidden)');
    const d0 = await p.evaluate(() => ({ f: $('#dlgFmt .fmts .on').dataset.f, ori: [...$$('#dlgFmt .ori button')].every(x => x.disabled), input: $('#dlgIn').offsetParent === null }));
    check('dialog: default unendlich, Hoch/Quer aus, ohne Eingabefeld', eq(d0, { f: 'inf', ori: true, input: true }), d0);
    await p.click('#dlgFmt [data-f="a3"]'); await p.click('#dlgFmt [data-o="l"]');
    check('dialog: A3 quer Hinweis', /linke Hälfte/.test(await p.textContent('#dlgFmtHint')));
    check('dialog targets ≥ 40px', await p.$$eval('#dlg button', e => e.filter(x => x.offsetParent).every(x => { const r = x.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; })));
    await p.click('#dlgNo'); await idle();
    check('dialog: Abbrechen legt keine Seite an', (await p.evaluate(() => dbIndexAll().then(l => l.length))) === 0);

    // ---------- 2. A4 hoch: Blatt ganz im Bild, Muster passend (ganze Kästchen, gleicher Rand)
    await newPage('a4', 'p');
    const a4 = await p.evaluate(() => {
      const [w, h] = paperSize(), G = gridSize(), f = fieldsOf(0)[0], r = sheetRect(0), [sx0, sy0] = toScreen(r[0], r[1]), [sx1, sy1] = toScreen(r[2], r[3]);
      return { w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, cols: (f[2] - f[0]) / G, rows: (f[3] - f[1]) / G, mx: [f[0], w - f[2]].map(v => Math.round(v * 100) / 100), my: [f[1], h - f[3]].map(v => Math.round(v * 100) / 100),
        inView: sx0 >= 0 && sy0 >= barBottom() && sx1 <= VW && sy1 <= VH, btn: !$('#bSheet').classList.contains('hidden'), no: $('#sheetNo').textContent };
    });
    check('A4 hoch: Größe 210 × 297 mm', a4.w === 793.7 && a4.h === 1122.5, a4);
    check('A4: ganze Kästchen', Number.isInteger(Math.round(a4.cols * 1e6) / 1e6) && Number.isInteger(Math.round(a4.rows * 1e6) / 1e6), a4);
    check('A4: Rand links = rechts, oben = unten, 0,6 bis 1,1 Kästchen', a4.mx[0] === a4.mx[1] && a4.my[0] === a4.my[1] && [...a4.mx, ...a4.my].every(v => v >= 0.6 * 28 - 1e-6 && v <= 1.1 * 28 + 1e-6), a4);
    check('A4: Blatt beim Öffnen ganz zu sehen, Knopf und Zähler da', a4.inView && a4.btn && a4.no === '1 / 1', a4);

    // ---------- 3. PDF mit 5 Seiten: 5 Blätter im selben Dokument
    await p.setInputFiles('#fPdf', PDF); await p.waitForFunction(() => !S.busy && S.items.length === 5, null, { timeout: 30000 }); await p.waitForTimeout(300);
    const imp = await p.evaluate(() => { const step = paperSize()[1] + GAP; return { n: sheetCount(), at: S.items.map(i => [i.page, Math.round(i.y / step * 1000) / 1000, Math.round(i.x), Math.round(i.w)]), undo: S.undo.length, no: $('#sheetNo').textContent }; });
    check('PDF: 5 Blätter, Seite i auf Blatt i, füllt das Blatt', imp.n === 5 && eq(imp.at, [1, 2, 3, 4, 5].map(i => [i, i - 1, 0, 794])), imp);
    check('PDF: ein Schritt zum Rückgängigmachen, Zähler', imp.undo === 1 && imp.no === '1 / 5', imp);
    await p.keyboard.press('Control+z');
    check('PDF rückgängig: wieder 1 Blatt, nichts drauf', eq(await p.evaluate(() => [sheetCount(), S.items.length]), [1, 0]));
    await p.keyboard.press('Control+y');
    check('PDF wiederholen', eq(await p.evaluate(() => [sheetCount(), S.items.length]), [5, 5]));

    // ---------- 4. Blatt hinzufügen: hinter dem aktuellen, Rest rutscht nach unten; Rückgängig
    await p.evaluate(() => fitAll(1));
    await p.click('#bSheet'); await p.waitForTimeout(100);
    const add = await p.evaluate(() => { const step = paperSize()[1] + GAP; return { n: sheetCount(), at: S.items.map(i => Math.round(i.y / step)), cur: currentSheet() }; });
    check('Blatt hinzufügen: hinter Blatt 2, Rest verschoben', add.n === 6 && eq(add.at, [0, 1, 3, 4, 5]) && add.cur === 2, add);
    await p.keyboard.press('Control+z');
    check('Blatt hinzufügen rückgängig', eq(await p.evaluate(() => { const step = paperSize()[1] + GAP; return [sheetCount(), S.items.map(i => Math.round(i.y / step))]; }), [5, [0, 1, 2, 3, 4]]));

    // ---------- 5. PDF-Export: eine Seite je Blatt, A4 in pt, gültige Querverweise
    const ex = await p.evaluate(async () => {
      const orig = download; let got = null; download = async (blob, name) => { got = { blob, name }; };
      try { await exportPDF(); } finally { download = orig; }
      const bytes = new Uint8Array(await got.blob.arrayBuffer()), doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const sizes = []; for (let i = 1; i <= doc.numPages; i++) { const v = (await doc.getPage(i)).getViewport({ scale: 1 }); sizes.push([Math.round(v.width * 10) / 10, Math.round(v.height * 10) / 10]); }
      const txt = new TextDecoder('latin1').decode(bytes), sx = +txt.match(/startxref\n(\d+)/)[1], m = txt.slice(sx).match(/xref\n0 (\d+)\n([\s\S]*?)trailer/);
      const bad = m[2].match(/.{20}/gs).map((l, i) => i && !txt.startsWith(i + ' 0 obj', +l.slice(0, 10)) ? i : 0).filter(Boolean);
      return { name: got.name, pages: doc.numPages, sizes: [...new Set(sizes.map(String))], bad, title: (await doc.getMetadata()).info.Title };
    });
    check('PDF-Export: 5 Seiten A4, gültig', ex.pages === 5 && eq(ex.sizes, ['595.3,841.9']) && !ex.bad.length && ex.title === 'Seite 1', ex);

    // ---------- 6. Am Raster ausrichten: Ursprung am inneren Rand des Felds, auf jedem Blatt
    const sn = await p.evaluate(() => {
      const G = gridSize(), step = paperSize()[1] + GAP;
      return [[300, 200], [512, 3 * step + 777]].map(([x, y]) => { const f = fieldsOf(sheetAt(y))[0]; return [((snapX(x) - f[0]) / G) % 1, ((snapY(y) - f[1]) / G) % 1].every(v => Math.abs(v) < 1e-6 || Math.abs(v - 1) < 1e-6); });
    });
    check('Raster: Punkte auf dem Muster jedes Blatts', sn.every(Boolean), sn);
    await p.screenshot({ path: path.join(OUT, 'paper_a4.png') });
    await back();
    check('Karte: Format und Blätter als Schild', (await p.textContent('#grid .card .pfmt')) === 'A4 hoch · 5 Blätter');

    // ---------- 7. A3 quer: PDF links, jede Hälfte mit eigenem Muster; zweites PDF auf neue Blätter dahinter
    await newPage('a3', 'l');
    await p.setInputFiles('#fPdf', PDF); await p.waitForFunction(() => !S.busy && S.items.length === 5, null, { timeout: 30000 }); await p.waitForTimeout(300);
    const a3 = await p.evaluate(() => {
      const [w, h] = paperSize(), fs = fieldsOf(0), it = S.items[0];
      return { w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, slot: [it.x, it.y, it.x + it.w, it.y + it.h].map(v => Math.round(v)), fields: fs.length,
        sym: Math.abs((fs[1][0] - w / 2) - (w - fs[1][2])) < 1e-6 && Math.abs(fs[0][0] - (w / 2 - fs[0][2])) < 1e-6 };
    });
    check('A3 quer: 420 × 297 mm, PDF-Seite füllt die linke Hälfte', a3.w === 1587.4 && a3.h === 1122.5 && eq(a3.slot, [0, 0, 794, 1123]), a3);
    check('A3 quer: zwei Felder, jedes mittig', a3.fields === 2 && a3.sym, a3);
    await p.evaluate(() => fitAll(0));
    await p.setInputFiles('#fPdf', PDF); await p.waitForFunction(() => !S.busy && S.items.length === 10, null, { timeout: 30000 }); await p.waitForTimeout(300);
    const two = await p.evaluate(() => { const step = paperSize()[1] + GAP; return { n: sheetCount(), at: S.items.map(i => Math.round(i.y / step)).sort((a, b) => a - b), first: S.items.filter(i => i.page === 1).map(i => Math.round(i.y / step)).sort() }; });
    check('zweites PDF: Blatt 1 war belegt, neue Blätter 2–6, alte rutschen nach 7–10', two.n === 10 && eq(two.at, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) && eq(two.first, [0, 1]), two);
    await p.screenshot({ path: path.join(OUT, 'paper_a3.png') });
    await back();

    // ---------- 8. Unendliche Fläche bleibt wie bisher
    await newPage('inf');
    check('unendlich: kein Blatt, kein Knopf, Raster ab 0', eq(await p.evaluate(() => [!!paperSize(), $('#bSheet').classList.contains('hidden'), snapX(41), snapY(-13)]), [false, true, 28, 0]));
    await back();
    check('neue Seite übernimmt Format der letzten Seite', await p.evaluate(async () => { $('#hNew').click(); await new Promise(r => setTimeout(r, 300)); const f = $('#dlgFmt .fmts .on').dataset.f; $('#dlgNo').click(); return f === 'inf'; }));
  } catch (e) { errs.push('exception: ' + (e && e.message || e)); console.error('FAIL', e); }
  res.checks = Object.keys(res).length; res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
