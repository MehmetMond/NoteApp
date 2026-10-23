const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */   /* ab 1.4: Seiten liegen in Büchern */ await p.waitForTimeout(400); await p.evaluate(z => zoomAt(VW / 2, VH / 2, z), +process.env.Z); await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.6, ...extra });
  const wave = (x0, y0) => Array.from({ length: 60 }, (_, i) => [x0 + i * 6, y0 + Math.sin(i / 5) * 25]);
  for (const [tool, y] of [['pen', 280], ['hl', 300]]) {
    await p.click(`[data-tool=${tool}]`); await p.waitForTimeout(100);
    const w = wave(300, y); await send('mouseMoved', w[0][0], w[0][1], { buttons: 0 }); await send('mousePressed', ...w[0]);
    for (const q of w.slice(1)) await send('mouseMoved', ...q);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(__dirname, tool + '_live.png'), clip: { x: 250, y: 200, width: 500, height: 200 } });
    console.log(tool, await p.evaluate(() => [getComputedStyle(cvLive).opacity, getComputedStyle(cvLive).mixBlendMode]));
    await send('mouseReleased', ...w.at(-1)); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, tool + '_final.png'), clip: { x: 250, y: 200, width: 500, height: 200 } });
  }
  await b.close();
})();
