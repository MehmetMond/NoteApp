// Popups nach dem Schließen wieder öffnen: sie sind wieder voll zu sehen (Deckkraft 1, normale Größe). In der
// Windows-App (Chrome 140) blieb die Zugeh-Animation am versteckten Menü stehen und kam beim späteren Öffnen zurück:
// offen, aber durchsichtig und etwas kleiner, bis zum Neustart (nachgestellt: Tape-Einstellungen zu, Tape darunter
// gezogen, wieder auf). Geprüft wird auch, dass nach dem Zugehen keine Animation am Menü hängen bleibt.
// node tests/popupreopen.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgFmt [data-f="a4"]'); await p.click('#dlgOk'); await p.waitForTimeout(500);
  const st = id => p.evaluate(id => {
    const m = document.getElementById(id), cs = getComputedStyle(m);
    return { open: isOpen(m), hidden: m.classList.contains('hidden'), op: +cs.opacity, tf: cs.transform, anims: m.getAnimations().length };
  }, id);
  const shown = s => s.open && s.op === 1 && s.tf === 'none';
  // [Menü, Knopf, Taste vorher]
  const MENUS = [['sizeMenu', '#bTune'], ['colorMenu', '#colors .sw.custom'], ['bgMenu', '#bBg'], ['moreMenu', '#bMore'], ['grpMenu', '#bGroup', 'l']];
  for (const [id, sel, key] of MENUS) {
    if (key) { await p.keyboard.press(key); await p.waitForTimeout(150); }
    await p.click(sel); await p.waitForTimeout(700); const first = await st(id);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400); const closed = await st(id);
    await p.waitForTimeout(3000);
    await p.click(sel); await p.waitForTimeout(900); const again = await st(id);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    res[id] = { first, closed, again };
    check(shown(first), id + ': erstes Öffnen zu sehen (' + JSON.stringify(first) + ')');
    check(closed.hidden && closed.anims === 0, id + ': zu, und keine Animation bleibt am Menü hängen (' + JSON.stringify(closed) + ')');
    check(shown(again), id + ': ein paar Sekunden später wieder offen und voll zu sehen (' + JSON.stringify(again) + ')');
  }
  // wie nachgestellt: Tape-Einstellungen auf und zu, ein Tape schräg unter dem Menü durch, wieder auf
  await p.keyboard.press('p'); await p.keyboard.press('t'); await p.waitForTimeout(200);
  await p.click('#bTune'); await p.waitForTimeout(700);
  const r = await p.$eval('#sizeMenu', e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  await p.click('#bTune'); await p.waitForTimeout(500);
  const [x0, y0, x1, y1] = [r[0] - 100, r[1] + 100, r[0] + 100, Math.min(r[1] + 480, 860)];
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let i = 1; i <= 40; i++) { await p.mouse.move(x0 + (x1 - x0) * i / 40, y0 + (y1 - y0) * i / 40); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(800);
  res.tapes = await p.evaluate(() => S.items.filter(it => it.tp).length);
  await p.click('#bTune'); await p.waitForTimeout(900); res.tapeMenu = await st('sizeMenu');
  check(res.tapes === 1 && shown(res.tapeMenu), 'Tape unter den Tape-Einstellungen: wieder geöffnet voll zu sehen (' + res.tapes + ' Tape, ' + JSON.stringify(res.tapeMenu) + ')');
  // schnell hintereinander: zu und gleich wieder auf (das Zugehen wird abgebrochen), dann zu
  await p.click('#bTune'); await p.waitForTimeout(40); await p.click('#bTune'); await p.waitForTimeout(700); res.quick = await st('sizeMenu');
  check(shown(res.quick), 'Zu und sofort wieder auf: zu sehen (' + JSON.stringify(res.quick) + ')');
  await p.click('#bTune'); await p.waitForTimeout(400); res.quickClosed = await st('sizeMenu');
  check(res.quickClosed.hidden && res.quickClosed.anims === 0, 'Danach zu, ohne hängende Animation (' + JSON.stringify(res.quickClosed) + ')');
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exitCode = fails.length ? 1 : 0;
})();
