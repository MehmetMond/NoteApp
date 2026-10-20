// Screenshots von Menüs und Dialogen der Startseite
const { chromium } = require('playwright'); const path = require('path'), DIR = path.resolve(__dirname, '..');
const { seed } = require('./demo');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(300);
  const ids = await seed(p); await p.evaluate(() => showShelf()); await p.waitForTimeout(500);
  for (const dark of [false, true]) {
    const m = dark ? 'dark' : 'light';
    await p.evaluate(d => { if (S.dark !== d) toggleDark(); showShelf(); }, dark); await p.waitForTimeout(500);
    await p.click('.book:nth-child(3) .mbtn'); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, `ui_${m}_bookmenu.png`), clip: { x: 300, y: 200, width: 700, height: 400 } });
    await p.keyboard.press('Escape');
    await p.click('#hNewBook'); await p.waitForTimeout(200); await p.keyboard.type('Mathe Leistungskurs');
    await p.click('.bsw[data-c=teal]');
    await p.screenshot({ path: path.join(__dirname, `ui_${m}_newbook.png`) });
    await p.click('#dlgNo');
    await p.evaluate(id => openBook(id), ids.Mathe); await p.waitForTimeout(500);
    await p.click('.card:nth-child(2) .mbtn'); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, `ui_${m}_pagemenu.png`) });
    await p.click('#homeMenu button:nth-child(2)'); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, `ui_${m}_move.png`) });
    await p.keyboard.press('Escape');
    await p.click('#hBookMenu'); await p.click('#homeMenu .del'); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, `ui_${m}_delbook.png`) });
    await p.click('#dlgNo');
  }
  console.log(JSON.stringify(errs)); await b.close();
})();
