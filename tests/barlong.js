const { chromium } = require('playwright');
const file = process.argv[2], outp = process.argv[3];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 300 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('file://' + file); await p.waitForTimeout(400);
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew');   /* ab 1.4: Seiten liegen in Büchern */ await p.waitForTimeout(400);
  await p.fill('#title', 'Integralrechnung und Kurvendiskussion Teil 2'); await p.keyboard.press('Enter');
  await p.click('#bSnap'); await p.waitForTimeout(1600);
  const r = await p.evaluate(() => ({ h: document.querySelector('#bar').getBoundingClientRect().height, t: document.querySelector('#title').getBoundingClientRect().width }));
  console.log(JSON.stringify(r));
  await p.screenshot({ path: outp, clip: { x: 0, y: 0, width: 1440, height: 80 } });
  await b.close();
})();
