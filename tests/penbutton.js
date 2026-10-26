// Taste am Stift = Lasso (Radierer-Ende radiert weiter); in der Auswahl verschiebt der Stift sie, daneben schreibt er
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  // Stift mit Spitze (left) oder mit gedrückter Taste (right, buttons 2)
  const send = (type, x, y, btn = 'left', extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: btn,
    buttons: type === 'mouseReleased' ? 0 : btn === 'right' ? 2 : 1, clickCount: 1, force: 0.5, ...extra });
  const draw = async (pts, btn = 'left') => {
    const t0 = Date.now() / 1000, ts = i => ({ timestamp: t0 + i * 0.006 });
    await send('mouseMoved', ...pts[0], btn, { buttons: 0, ...ts(0) }); await send('mousePressed', ...pts[0], btn, ts(0));
    for (let i = 1; i < pts.length; i++) await send('mouseMoved', ...pts[i], btn, ts(i));
    await send('mouseReleased', ...pts.at(-1), btn, ts(pts.length)); await p.waitForTimeout(200);
  };
  const line = (x0, x1, y, wob = 0) => Array.from({ length: Math.round((x1 - x0) / 3) + 1 }, (_, i) => [x0 + i * 3, y + wob * Math.sin(i / 2.5)]);
  const loop = (x0, y0, x1, y1) => { const q = []; for (let t = 0; t <= 1; t += 0.02) { const a = t * 2 * Math.PI; q.push([(x0 + x1) / 2 + (x1 - x0) / 2 * Math.cos(a), (y0 + y1) / 2 + (y1 - y0) / 2 * Math.sin(a)]); } return q; };
  const st = () => p.evaluate(() => ({ tool: S.tool, n: S.items.length, sel: S.sel ? S.sel.ids.size : 0, x0: Math.min(...S.items.map(i => i.bb[0])) }));
  for (const y of [300, 330, 360]) await draw(line(400, 700, y, 6));
  await draw(line(400, 700, 600, 6));   // weiter unten, nicht in der Auswahl
  res.start = await st(); check(res.start.n === 4, '4 Striche geschrieben');
  // Taste gedrückt: Lasso um die oberen drei, Werkzeug bleibt der Stift, kein neuer Strich
  await draw(loop(360, 260, 740, 400), 'right');
  res.lasso = await st();
  check(res.lasso.tool === 'pen' && res.lasso.n === 4 && res.lasso.sel === 3, 'Stifttaste wählt mit dem Lasso aus (' + JSON.stringify(res.lasso) + ')');
  check(await p.evaluate(() => !$('#selbar').classList.contains('hidden')), 'Leiste der Auswahl erscheint');
  // Stift schwebt über der Auswahl: Zeiger „move“, kein Punkt
  await send('mouseMoved', 550, 330, 'left', { buttons: 0 }); await p.waitForTimeout(50);
  res.hover = await p.evaluate(() => [cvLive.style.cursor, penDot.style.display]);
  check(res.hover[0] === 'move' && res.hover[1] !== 'block', 'über der Auswahl: Zeiger zum Verschieben (' + res.hover + ')');
  // mit dem Stift (ohne Taste) in der Auswahl ziehen: verschiebt sie
  const before = await p.evaluate(() => S.items.slice(0, 3).map(i => i.bb[0]));
  await draw(line(550, 640, 330));
  const after = await p.evaluate(() => S.items.slice(0, 3).map(i => i.bb[0]));
  res.moved = after.map((x, i) => +(x - before[i]).toFixed(1));
  res.afterMove = await st();
  check(res.moved.every(d => Math.abs(d - 90) < 4) && res.afterMove.n === 4 && res.afterMove.sel === 3, 'Stift verschiebt die Auswahl (' + res.moved + ')');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  check((await p.evaluate(() => S.items.slice(0, 3).map(i => i.bb[0]))).every((x, i) => Math.abs(x - before[i]) < 0.01), 'Rückgängig nimmt das Verschieben zurück');
  // daneben schreiben: Auswahl weg, neuer Strich
  await draw(line(400, 600, 750, 4));
  res.outside = await st(); check(res.outside.sel === 0 && res.outside.n === 5, 'daneben schreibt der Stift (' + JSON.stringify(res.outside) + ')');
  // Taste und antippen: wählt den Strich darunter
  await draw([[500, 600], [500, 600]], 'right');
  res.tap = await st(); check(res.tap.sel === 1 && res.tap.n === 5, 'Stifttaste + Antippen wählt einen Strich');
  await p.keyboard.press('Escape');
  // Radierer-Ende (button 5, buttons 32) radiert weiter
  res.erase = await p.evaluate(async () => {
    const n0 = S.items.length, r = cvLive.getBoundingClientRect();
    const ev = (type, x, y, buttons) => cvLive.dispatchEvent(new PointerEvent(type, { pointerId: 77, pointerType: 'pen', isPrimary: true, button: type === 'pointermove' ? -1 : 5, buttons, clientX: r.left + x, clientY: r.top + y, pressure: 0.5, bubbles: true, cancelable: true }));
    ev('pointerdown', 450, 590, 32); for (let x = 450; x <= 650; x += 10) ev('pointermove', x, 600, 32); ev('pointerup', 650, 600, 0);
    await new Promise(ok => setTimeout(ok, 200));
    return { n0, n: S.items.length, tool: S.tool };
  });
  check(res.erase.n === res.erase.n0 - 1 && res.erase.tool === 'pen', 'Radierer-Ende radiert (' + JSON.stringify(res.erase) + ')');
  // Maus mit rechter Taste verschiebt weiter die Ansicht
  const v0 = await p.evaluate(() => S.view.tx);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 500, button: 'right', buttons: 2, clickCount: 1 });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900 - i * 10, y: 500, button: 'right', buttons: 2 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 500, button: 'right', buttons: 0, clickCount: 1 }); await p.waitForTimeout(150);
  res.pan = +(await p.evaluate(() => S.view.tx) - v0).toFixed(1); check(Math.abs(res.pan + 100) < 2 && (await st()).sel === 0, 'Maus rechts verschiebt die Ansicht (' + res.pan + ')');
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
