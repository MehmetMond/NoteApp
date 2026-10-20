const { chromium } = require('playwright');
const file = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const W of [1180, 1280, 1366, 1440, 1536, 1920]) {
    const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('file://' + file); await p.waitForTimeout(400);
    await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew');   /* ab 1.4: Seiten liegen in Büchern */ await p.waitForTimeout(400);
    await p.fill('#title', 'Notiz vom 20.10.2026'); await p.keyboard.press('Enter');   // üblicher Titel wie in 1.3 (statt „Seite 1“)
    out[W] = await p.evaluate(() => {
      const bar = document.querySelector('#bar'); const kids = [...bar.children].filter(e => getComputedStyle(e).display !== 'none');
      const tops = new Set(kids.map(e => Math.round(e.getBoundingClientRect().top)));
      const need = kids.reduce((s, e) => s + e.getBoundingClientRect().width, 0) + 6 * (kids.length - 1) + 16 + 2;
      const grow = kids.filter(e => e.classList.contains('grow')).reduce((s, e) => s + e.getBoundingClientRect().width, 0);
      return { rows: tops.size, title: document.querySelector('#title').getBoundingClientRect().width, barW: bar.getBoundingClientRect().width, needNoGrow: Math.round(need - grow), h: bar.getBoundingClientRect().height };
    });
    await ctx.close();
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
