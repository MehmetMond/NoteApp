const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const DIR = path.resolve(__dirname, '..');
const ICON = fs.existsSync(DIR + '/electron/icon.png') ? DIR + '/electron/icon.png' : path.join(__dirname, 'icon.png');
const res = {};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, acceptDownloads: true });
  const errs = [];
  const p = await ctx.newPage();
  // Startseite ab 1.4: erst das Buch öffnen (Regal -> Buch), dann Seiten; Seiten stehen in der Reihenfolge ihrer Anlage
  const inBook = async () => { if (await p.isVisible('#hNewBook')) { await p.click('.book'); await p.waitForTimeout(400); } };
  const lastCard = () => p.locator('.card').last().click();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  // ---- 1. v1-Daten anlegen
  await p.goto('file://' + DIR + '/Notizen-v1.html');
  await p.click('#hNew'); await p.waitForTimeout(300);
  await p.mouse.move(300, 300); await p.mouse.down(); await p.mouse.move(600, 360, { steps: 15 }); await p.mouse.up();
  await p.setInputFiles('#fImg', ICON); await p.waitForTimeout(800);
  await p.click('#bBack'); await p.waitForTimeout(800);
  // ---- 2. neue Version öffnen -> Migration
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(800);
  res.shelfAfterMigration = await p.$$eval('.book .nm', e => e.map(x => x.textContent));
  await inBook();
  res.migratedCards = await p.$$eval('.card .nm', e => e.map(x => x.textContent));
  await p.click('.card'); await p.waitForTimeout(800);
  res.migratedItems = await p.evaluate(() => S.items.map(i => i.t + (i.t === 'i' ? (i.img ? ':img' : ':src!') : ':' + (i.pts instanceof Float32Array))));
  await p.screenshot({ path: path.join(__dirname, 'migrated.png') });
  await p.click('#bBack'); await p.waitForTimeout(500);
  // ---- 3. neue Notiz, Live vs. fertig (Pixelvergleich)
  await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */ await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  async function penStroke(pts, finish = true) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.3 });
    for (let k = 1; k < pts.length; k++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[k][0], y: pts[k][1], button: 'left', buttons: 1, pointerType: 'pen', force: pts[k][2] ?? 0.6 });
    if (finish) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1)[0], y: pts.at(-1)[1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  }
  const wave = (x0, y0) => Array.from({ length: 60 }, (_, i) => [x0 + i * 6, y0 + Math.sin(i / 5) * 25, 0.2 + 0.8 * Math.abs(Math.sin(i / 9))]);
  const clip = { x: 250, y: 200, width: 500, height: 200 };
  async function liveVsFinal(tool) {
    await p.click(`[data-tool=${tool}]`);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const y = tool === 'pen' ? 280 : 300;
    await penStroke(wave(300, y), false);
    await p.waitForTimeout(150);
    const live = await p.screenshot({ clip });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300 + 59 * 6, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
    await p.waitForTimeout(300);
    const fin = await p.screenshot({ clip });
    return [live.toString('base64'), fin.toString('base64')];
  }
  const pairs = { pen: await liveVsFinal('pen'), hl: await liveVsFinal('hl') };
  const cmp = await ctx.newPage();
  await cmp.setContent('<canvas id=c></canvas>');
  for (const [k, [a, bb]] of Object.entries(pairs)) {
    res['diff_' + k] = await cmp.evaluate(async ([a, bb]) => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
      const [A, B] = await Promise.all([load(a), load(bb)]);
      const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.clearRect(0, 0, c.width, c.height); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0, max = 0, ink = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (d > 0) n++; if (d > max) max = d; if (da[i] < 200) ink++; }
      return { changedPixels: n, maxDelta: max, inkPixels: ink };
    }, [a, bb]);
  }
  await p.click('[data-tool=pen]');
  res.pressureVaries = await p.evaluate(() => { const s = S.items[0].pts; let mn = 9, mx = 0; for (let i = 2; i < s.length; i += 3) { mn = Math.min(mn, s[i]); mx = Math.max(mx, s[i]); } return [mn.toFixed(2), mx.toFixed(2)]; });
  // ---- 4. Radierer (Stift-Radiertaste), Undo, Redo
  const n0 = await p.evaluate(() => S.items.length);
  await p.evaluate(() => { const cv = document.getElementById('cvLive'); const s = S.items[0]; const [x, y] = toScreen(s.pts[60], s.pts[61]); const r = cv.getBoundingClientRect();
    const ev = (t, o) => cv.dispatchEvent(new PointerEvent(t, Object.assign({ bubbles: true, cancelable: true, pointerId: 77, pointerType: 'pen', clientX: x + r.left, clientY: y + r.top, pressure: .5 }, o)));
    ev('pointerdown', { button: 5, buttons: 32 }); ev('pointermove', { buttons: 32 }); ev('pointerup', { buttons: 0 }); });
  res.erase = [n0, await p.evaluate(() => S.items.length)];
  await p.keyboard.press('Control+z'); res.afterUndo = await p.evaluate(() => S.items.length);
  await p.keyboard.press('Control+y'); res.afterRedo = await p.evaluate(() => S.items.length);
  await p.keyboard.press('Control+z');
  // ---- 5. Lasso + verschieben + skalieren
  await p.keyboard.press('l');
  await p.mouse.move(270, 200); await p.mouse.down(); for (const q of [[700, 200], [700, 340], [270, 340], [270, 200]]) await p.mouse.move(q[0], q[1], { steps: 6 }); await p.mouse.up();
  res.selected = await p.evaluate(() => S.sel ? S.sel.ids.size : 0);
  const x0 = await p.evaluate(() => S.items[0].pts[0]);
  await p.mouse.move(480, 270); await p.mouse.down(); await p.mouse.move(530, 470, { steps: 8 }); await p.mouse.up();
  res.movedBy = await p.evaluate(x0 => S.items[0].pts[0] - x0, x0);
  const hb = await p.evaluate(() => toScreen(S.sel.bb[2], S.sel.bb[3]));
  const w0 = await p.evaluate(() => S.sel.bb[2] - S.sel.bb[0]);
  await p.mouse.move(hb[0] + 6, hb[1] + 6); await p.mouse.down(); await p.mouse.move(hb[0] + 6 + 1, hb[1] + 6 + 1, { steps: 2 });
  res.scaleJumpOnGrab = await p.evaluate(() => action && action.s);
  await p.mouse.move(hb[0] + 100, hb[1] + 60, { steps: 6 }); await p.mouse.up();
  res.scaled = await p.evaluate(w0 => ((S.sel.bb[2] - S.sel.bb[0]) / w0).toFixed(2), w0);
  // Taste während des Ziehens -> darf nicht abstürzen
  await p.mouse.move(520, 470); await p.mouse.down(); await p.mouse.move(540, 480, { steps: 3 });
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+z'); await p.mouse.up();
  await p.keyboard.press('Delete'); res.afterDelete = await p.evaluate(() => S.items.length);
  await p.keyboard.press('Control+z'); res.afterUndoDelete = await p.evaluate(() => S.items.length);
  await p.keyboard.press('p');
  // ---- 6. Titel-Fokus und Tastenkürzel
  await p.click('#title'); await p.keyboard.type('X');
  await p.mouse.move(400, 600); await p.mouse.down(); await p.mouse.move(500, 620, { steps: 5 }); await p.mouse.up();
  await p.keyboard.press('e'); res.toolAfterTitle = await p.evaluate(() => [S.tool, document.activeElement.tagName, S.note.name]);
  await p.keyboard.press('p');
  // ---- 7. Leertaste nach Klick auf Undo
  await p.click('#bUndo'); const c1 = await p.evaluate(() => S.items.length);
  await p.keyboard.down(' '); await p.mouse.move(700, 700); await p.mouse.down(); await p.mouse.move(800, 750, { steps: 4 }); await p.mouse.up(); await p.keyboard.up(' ');
  res.spaceNoExtraUndo = [c1, await p.evaluate(() => S.items.length)];
  await p.keyboard.press('Control+y');
  // ---- 8. PDF, Bild
  const tp = await ctx.newPage(); await tp.setContent('<h1>Seite 1</h1>' + Array.from({ length: 5 }, (_, i) => `<div style="page-break-before:always"><h1>Seite ${i + 2}</h1><p>${'Text '.repeat(200)}</p></div>`).join(''));
  await tp.pdf({ path: path.join(__dirname, 'six.pdf'), format: 'A4' }); await tp.close();
  await p.setInputFiles('#fPdf', path.join(__dirname, 'six.pdf'));
  await p.waitForFunction(() => S.items.filter(i => i.t === 'i').length >= 6 && S.busy === 0, null, { timeout: 30000 });
  res.pdfWorkerReal = await p.evaluate(() => !!(pdfWorker && pdfWorker._webWorker === null && pdfWorker._port));
  res.order = await p.evaluate(() => S.items.map(i => i.t).join(''));
  await p.setInputFiles('#fImg', ICON); await p.waitForFunction(() => S.busy === 0);
  await p.click('#bMore'); await p.click('#mFit'); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(__dirname, 'fit.png') });
  // ---- 9. Performance: 3000 Striche, Verschieben
  res.perf = await p.evaluate(async () => {
    const add = [];
    for (let k = 0; k < 3000; k++) { const pts = []; const x0 = (k % 60) * 40 - 1200, y0 = Math.floor(k / 60) * 30 - 600; for (let i = 0; i < 60; i++) pts.push(x0 + i * 0.6, y0 + Math.sin(i / 4) * 8, 0.5); add.push(makeStroke(pts, 'ink', 2, false)); }
    commit(appendItems(S.items, add)); setView(VW / 2, VH / 2, 1, true); draw();
    const t = [];
    for (let f = 0; f < 60; f++) { const t0 = performance.now(); setView(S.view.tx + 7, S.view.ty + 3, S.view.z); draw(); t.push(performance.now() - t0); }
    const z = [];
    for (let f = 0; f < 40; f++) { const t0 = performance.now(); zoomAt(VW / 2, VH / 2, S.view.z * 0.98, false); draw(); z.push(performance.now() - t0); }
    settleZoom();
    const s = a => { a = a.slice().sort((x, y) => x - y); return { med: +a[a.length >> 1].toFixed(1), p95: +a[Math.floor(a.length * .95)].toFixed(1), max: +a.at(-1).toFixed(1) }; };
    const t0 = performance.now(); await saveNow(); const save1 = performance.now() - t0;
    commit(appendItems(S.items, [makeStroke([0, 0, .5, 10, 10, .5], 'ink', 2, false)]));
    await new Promise(r => setTimeout(r, 1500)); await saving;
    const lt = []; const ob = new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(+e.duration.toFixed(0)))); ob.observe({ entryTypes: ['longtask'] });
    const t1 = performance.now(); await saveNow(); const save2 = performance.now() - t1;
    await new Promise(r => setTimeout(r, 100)); ob.disconnect();
    // Strich-Ende bis Bild fertig
    const t2 = performance.now(); commit(appendItems(S.items, [makeStroke([5, 5, .5, 30, 30, .5], 'ink', 2, false)])); draw(); const commitDraw = performance.now() - t2;
    return { pan: s(t), pinch: s(z), saveAll_ms: +save1.toFixed(0), saveOneStroke_ms: +save2.toFixed(0), saveLongTasks: lt, commitPlusDraw_ms: +commitDraw.toFixed(1), items: S.items.length };
  });
  // ---- 10. Export PNG
  const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.click('#bMore'); await p.click('#mPng'); })()]);
  const pngPath = path.join(__dirname, 'export.png'); await dl.saveAs(pngPath); res.exportBytes = fs.statSync(pngPath).size;
  // ---- 11. zurück, Vorschaubild, neu laden, Persistenz
  const before = await p.evaluate(() => S.items.length);
  await p.click('#bBack'); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(__dirname, 'shelf.png') });
  await inBook();
  res.cards = await p.$$eval('.card', e => e.length);
  await p.screenshot({ path: path.join(__dirname, 'home.png') });
  await lastCard(); await p.waitForTimeout(800);
  res.persist = [before, await p.evaluate(() => S.items.length)];
  // Schließen ohne Pause: letzter Strich muss bleiben
  await p.mouse.move(900, 800); await p.mouse.down(); await p.mouse.move(1000, 820, { steps: 4 }); await p.mouse.up();
  await p.evaluate(() => window.__flush());
  await p.reload(); await p.waitForTimeout(600); await inBook(); await lastCard(); await p.waitForTimeout(800);
  res.lastStrokeKept = (await p.evaluate(() => S.items.length)) === before + 1;
  await p.click('#bBack'); await p.waitForTimeout(800);
  // ---- 12. Sicherung + Wiederherstellung
  const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bkPath = path.join(__dirname, 'backup.notizen'); await bk.saveAs(bkPath); res.backupBytes = fs.statSync(bkPath).size;
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); renderHome(); });
  await p.waitForTimeout(300);
  await p.setInputFiles('#fRestore', bkPath); await p.waitForTimeout(3000);
  await inBook();
  res.backupFormat = JSON.parse(fs.readFileSync(bkPath, 'utf8').slice(0, 200).split('\n')[0]).format;
  res.restoredCards = await p.$$eval('.card', e => e.length);
  await lastCard(); await p.waitForTimeout(1000);
  res.restoredItems = await p.evaluate(() => [S.items.length, S.items.filter(i => i.t === 'i').length]);
  await p.waitForTimeout(500);
  res.imagesOk = await p.evaluate(() => [...IM.values()].map(e => e.state));
  // ---- 13. Darkmode
  await p.click('#bDark'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, 'dark.png') });
  res.inkSwatch = await p.$eval('#colors .sw', e => e.style.background);
  res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(res, null, 1)); process.exit(1); });
