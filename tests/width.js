const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  // Migration: Wert aus Version 1.2
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('notizen.size', JSON.stringify({ pen: 9, hl: 10 })); });
  await p.reload(); await p.waitForTimeout(400);
  const res = {};
  res.migrated = await p.evaluate(() => ({ idx: S.sizeIdx, size: S.size }));
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  res.fresh = await p.evaluate(() => ({ idx: S.sizeIdx, size: S.size, presets: S.presets }));
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  // ab 1.4: Seiten liegen in Büchern -> Buch anlegen (öffnet es), dann neue Seite
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  const line = async (x0, y0) => {
    const w = Array.from({ length: 40 }, (_, i) => [x0 + i * 5, y0]);
    await send('mouseMoved', ...w[0], { buttons: 0 }); await send('mousePressed', ...w[0]);
    for (const q of w.slice(1)) await send('mouseMoved', ...q);
    await send('mouseReleased', ...w.at(-1)); await p.waitForTimeout(150);
  };
  res.penButtons = await p.$$eval('#sizes .sz', l => l.length);
  for (const z of [0.5, 1, 2]) {
    await p.evaluate(z => zoomAt(VW / 2, VH / 2, z), z); await p.waitForTimeout(250);
    await line(500, 300 + z * 100);
  }
  res.widths = await p.evaluate(() => S.items.map(i => i.w));
  // Schieberegler
  await p.click('#sizes .sz.on'); await p.waitForTimeout(100);
  res.menuOpen = await p.evaluate(() => !$('#sizeMenu').classList.contains('hidden'));
  await p.evaluate(() => { const r = $('#szRange'); r.value = 700; r.dispatchEvent(new Event('input')); });
  res.afterSlider = await p.evaluate(() => ({ size: S.size.pen, presets: S.presets.pen, stored: localStorage.getItem('notizen.presets'), label: $('#szVal').textContent, title: $('#sizes .sz.on').title }));
  await p.screenshot({ path: path.join(__dirname, 'sizes_menu.png'), clip: { x: 0, y: 0, width: 1440, height: 260 } });
  await p.click('#sizes .sz.on'); await p.waitForTimeout(100);
  res.menuClosedByRetap = await p.evaluate(() => $('#sizeMenu').classList.contains('hidden'));
  await p.click('#sizes .sz:nth-child(1)'); await p.waitForTimeout(100);
  res.pick1 = await p.evaluate(() => ({ idx: S.sizeIdx.pen, size: S.size.pen, menuHidden: $('#sizeMenu').classList.contains('hidden') }));
  await p.click('[data-tool=hl]'); res.hlButtons = await p.$$eval('#sizes .sz', l => l.length);
  // Dicke übernehmen
  await p.click('[data-tool=pen]'); await p.click('#sizes .sz:nth-child(5)');
  await p.evaluate(() => { setTool('lasso'); setSel(new Set(S.items.map(i => i.id))); }); await p.waitForTimeout(100);
  res.sSizeVisible = await p.isVisible('#sSize');
  await p.click('#sSize'); await p.waitForTimeout(200);
  res.afterApply = await p.evaluate(() => S.items.map(i => [i.w, i.bb.map(v => Math.round(v))]));
  await p.click('#bUndo'); res.afterUndo = await p.evaluate(() => S.items.map(i => i.w));
  // Persistenz nach Neuladen
  await p.waitForTimeout(800); await p.reload(); await p.waitForTimeout(400);
  res.reloaded = await p.evaluate(() => ({ idx: S.sizeIdx, presets: S.presets.pen }));
  await p.click('.book'); await p.click('.card'); await p.waitForTimeout(500);
  await p.evaluate(() => zoomAt(VW / 2, VH / 2, 1)); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, 'widths.png') });
  res.errs = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
