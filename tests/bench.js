const { chromium } = require('playwright'); const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch({ args: process.argv[2] === 'gpu' ? ['--enable-gpu', '--use-angle=swiftshader'] : [] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */   /* ab 1.4: Seiten liegen in Büchern */ await p.waitForTimeout(300);
  console.log(JSON.stringify(await p.evaluate(() => {
    // realistische Handschrift: 2500 Striche je ~80 Punkte, Zeilen über 3 Bildschirme
    const add = [];
    for (let k = 0; k < 2500; k++) { const pts = []; const x0 = (k % 50) * 28, y0 = Math.floor(k / 50) * 34; for (let i = 0; i < 80; i++) pts.push(x0 + i * 0.3 + Math.cos(i / 3) * 4, y0 + Math.sin(i / 2.5) * 8, 0.3 + 0.5 * Math.abs(Math.sin(i / 7))); add.push(makeStroke(pts, 'ink', 1.5 + (k % 3), false)); }
    commit(appendItems(S.items, add)); setView(20, 80, 1, true);
    const t = (fn) => { const t0 = performance.now(); fn(); return +(performance.now() - t0).toFixed(1); };
    const res = {};
    res.firstDraw = t(draw);
    res.tilesVisible = tiles.size;
    clearTiles(); res.warmFullDraw = t(draw);
    const one = []; for (let k = 0; k < 10; k++) { clearTiles(); const t0 = performance.now(); renderTile(S.level, 1, 1); one.push(performance.now() - t0); }
    res.oneTileWarm = +(one.sort((a, b) => a - b)[5]).toFixed(1);
    pathCache.clear(); clearTiles(); const t0 = performance.now(); renderTile(S.level, 1, 1); res.oneTileCold = +(performance.now() - t0).toFixed(1);
    // nur Pfade bauen
    const pts = S.items.slice(0, 500); const t1 = performance.now(); for (const s of pts) buildPath(s.pts, s.w, s.hl); res.build500 = +(performance.now() - t1).toFixed(1);
    return res;
  })));
  await b.close();
})();
