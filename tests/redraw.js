// Teilweises Neuzeichnen: nach jedem Schritt (Schreiben, Textmarker, Tape, Radieren, Rückgängig, Verschieben, Zoomen,
// Darkmode …) muss der Bildschirm genau so aussehen wie nach einem vollen Neuzeichnen aus den Kacheln.
// Dazu: wie viel bei jedem Schritt gemalt wird (Megapixel auf der Hauptfläche)
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5, hasTouch: true });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__mpx = 0; const o = ctxMain.drawImage.bind(ctxMain), f = ctxMain.fillRect.bind(ctxMain);
    ctxMain.drawImage = (...a) => { __mpx += (a.length === 3 ? a[0].width * a[0].height : a[3] * a[4]) / 1e6; return o(...a); };
    ctxMain.fillRect = (...a) => { __mpx += a[2] * a[3] / 1e6; return f(...a); }; });
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  const draw = async pts => {
    const t0 = Date.now() / 1000, ts = i => ({ timestamp: t0 + i * 0.006 });
    await send('mouseMoved', ...pts[0], { buttons: 0, ...ts(0) }); await send('mousePressed', ...pts[0], ts(0));
    for (let i = 1; i < pts.length; i++) await send('mouseMoved', ...pts[i], ts(i));
    await send('mouseReleased', ...pts.at(-1), ts(pts.length)); await p.waitForTimeout(150);
  };
  const line = (x0, x1, y, wob = 0) => Array.from({ length: Math.round((x1 - x0) / 3) + 1 }, (_, i) => [x0 + i * 3, y + wob * Math.sin(i / 2.5)]);
  const tap = async (x, y) => { await send('mouseMoved', x, y, { buttons: 0 }); await send('mousePressed', x, y); await send('mouseReleased', x, y); await p.waitForTimeout(150); };
  // Bildschirm nach dem Schritt vs. volles Neuzeichnen aus denselben Kacheln
  const steps = [];
  const verify = async name => {
    await p.waitForTimeout(350);
    const r = await p.evaluate(() => {
      const g = cvMain.getContext('2d'), W = cvMain.width, H = cvMain.height, a = g.getImageData(0, 0, W, H).data, m = __mpx;
      const pending = drawQ; shownSig = ''; draw();
      const c = g.getImageData(0, 0, W, H).data;
      let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - c[i]); if (d) { n++; if (d > mx) mx = d; } }
      return { n, mx, pending, mpx: +m.toFixed(1) };
    });
    steps.push([name, r]); check(r.n === 0, name + ': Bildschirm weicht vom vollen Neuzeichnen ab (' + r.n + ' Werte, max ' + r.mx + ')');
    await p.evaluate(() => { __mpx = 0; });
  };
  await verify('Start');
  for (const y of [200, 240, 280]) await draw(line(200, 700, y, 7));
  await verify('Schreiben');
  await p.keyboard.press('m'); await draw(line(190, 720, 240)); await verify('Textmarker');
  await p.keyboard.press('t'); await draw(line(180, 500, 320, 2)); await verify('Tape');
  await tap(300, 320); await verify('Tape aufdecken');
  await tap(300, 320); await verify('Tape abdecken');
  await p.keyboard.press('e'); await draw(line(250, 450, 200)); await verify('Radieren');
  await p.keyboard.press('Control+z'); await verify('Rückgängig');
  await p.keyboard.press('Control+y'); await verify('Wiederholen');
  // Lasso: Schrift wählen und verschieben
  await p.keyboard.press('l'); await draw([[180, 170], [720, 170], [720, 300], [180, 300], [180, 170]]); await verify('Lasso');
  await draw(line(400, 460, 230)); await verify('Verschieben der Auswahl');
  await p.keyboard.press('p'); await verify('Auswahl weg');
  // Ansicht ändert sich: verschieben (Rad), dann schreiben
  for (let i = 0; i < 8; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 430, deltaX: 7, deltaY: 23 }); await p.waitForTimeout(20); }
  await verify('Ansicht verschoben');
  await draw(line(220, 600, 500, 5)); await verify('Schreiben nach Verschieben');
  // Zoomen (Strg+Rad), dann schreiben; Strich zum Teil außerhalb des Bilds
  for (let i = 0; i < 6; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 430, deltaX: 0, deltaY: -40, modifiers: 2 }); await p.waitForTimeout(20); }
  await p.waitForTimeout(400); await verify('Gezoomt');
  await draw(line(900, 1270, 600, 4)); await draw(line(1100, 1300, 650)); await verify('Strich über den Rand');
  await p.evaluate(() => toggleDark()); await verify('Darkmode');
  await p.evaluate(() => { S.note.bg = 'grid'; clearTiles(); }); await verify('Hintergrund Kästchen');
  // Fenstergröße ändert sich
  await p.setViewportSize({ width: 1100, height: 800 }); await p.waitForTimeout(300); await verify('Fenstergröße');
  // nichts geändert: kein Malen
  await p.evaluate(() => { requestDraw(); }); await p.waitForTimeout(200);
  res.idleMpx = await p.evaluate(() => __mpx); check(res.idleMpx === 0, 'Neuzeichnen ohne Änderung malt nichts (' + res.idleMpx + ' Mpx)');
  res.steps = Object.fromEntries(steps.map(([k, v]) => [k, v.mpx + ' Mpx' + (v.n ? ' ABWEICHUNG ' + v.n : '')]));
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
