// Screenshots von Regal und Buch (hell/dunkel, quer/hoch) zum Begutachten
const { chromium } = require('playwright'); const path = require('path'), DIR = path.resolve(__dirname, '..');
const { seed } = require('./demo');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const which = process.argv[2] || 'all';
  for (const [w, h, tag] of [[1440, 960, 'land'], [960, 1440, 'port']]) {
    if (which !== 'all' && which !== tag) continue;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.setItem('notizen.dark', 'false'); });
    await p.reload(); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, `shot_${tag}_empty.png`) });
    const ids = await seed(p);
    await p.evaluate(() => { showShelf(); }); await p.waitForTimeout(600);
    for (const dark of [false, true]) {
      await p.evaluate(d => { if (S.dark !== d) toggleDark(); }, dark); await p.evaluate(() => showShelf()); await p.waitForTimeout(600);
      const m = dark ? 'dark' : 'light';
      await p.screenshot({ path: path.join(__dirname, `shot_${tag}_shelf_${m}.png`) });
      await p.evaluate(id => openBook(id), ids.Mathe); await p.waitForTimeout(600);
      await p.screenshot({ path: path.join(__dirname, `shot_${tag}_book_${m}.png`) });
    }
    await ctx.close();
  }
  console.log(JSON.stringify(errs));
  await b.close();
})();
