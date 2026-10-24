// Tape (abdecken/aufdecken wie bei Goodnotes) und Textmarker (unter der Schrift, gerade Linien)
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, hasTouch: true });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  // Strich mit Zeitstempeln (6 ms); hold: am Ende so lange stillhalten (ms), ohne Ereignisse
  const draw = async (pts, hold = 0) => {
    const t0 = Date.now() / 1000, ts = i => ({ timestamp: t0 + i * 0.006 });
    await send('mouseMoved', ...pts[0], { buttons: 0, ...ts(0) }); await send('mousePressed', ...pts[0], ts(0));
    for (let i = 1; i < pts.length; i++) await send('mouseMoved', ...pts[i], ts(i));
    if (hold) await p.waitForTimeout(hold);
    await send('mouseReleased', ...pts.at(-1), ts(pts.length + hold / 6)); await p.waitForTimeout(150);
  };
  const line = (x0, x1, y, wob = 0) => Array.from({ length: Math.round((x1 - x0) / 3) + 1 }, (_, i) => [x0 + i * 3, y + wob * Math.sin(i / 2.5)]);
  const tap = async (x, y) => { await send('mouseMoved', x, y, { buttons: 0 }); await send('mousePressed', x, y); await send('mouseReleased', x, y); await p.waitForTimeout(150); };
  const last = () => p.evaluate(() => { const s = S.items.at(-1); return { id: s.id, tp: s.tp, hid: s.hid, on: s.on, hl: s.hl, n: s.pts.length / 3, w: s.w, y: [s.pts[1], s.pts.at(-2)] }; });
  const st = () => p.evaluate(() => ({ n: S.items.length, tapes: S.items.filter(i => i.tp).map(i => i.hid), shown: paintOrder().length }));
  // etwas Schrift, dann ein Tape darüber (Taste T)
  for (const y of [180, 205]) await draw(line(300, 640, y, 6));
  await p.keyboard.press('t'); res.tool = await p.evaluate(() => S.tool); check(res.tool === 'tape', 'Taste T wählt Tape');
  await draw(line(280, 660, 192, 3));
  const tape = await last(); res.tape = tape;
  check(tape.tp === 'streifen' && tape.hid === true && tape.w === 22, 'Tape: Muster Streifen, abgedeckt, Dicke 22');
  await p.screenshot({ path: path.join(__dirname, 'tape_covered.png'), clip: { x: 240, y: 130, width: 480, height: 130 } });
  // mit dem Stift aufs Tape schreiben: gehört zum Tape
  await p.keyboard.press('p'); await draw(line(340, 420, 192, 4));
  const onTape = await last(); check(onTape.on === tape.id, 'Schrift auf dem Tape gehört zum Tape');
  // Tape-Werkzeug: antippen deckt auf, Schrift darauf verschwindet
  await p.keyboard.press('t'); await tap(500, 192);
  res.afterTap = await st();
  check(res.afterTap.tapes[0] === false, 'Antippen deckt auf');
  check(!(await p.evaluate(id => paintOrder().some(i => i.id === id), onTape.id)), 'Schrift auf dem Tape ist mit aufgedeckt weg');
  await p.screenshot({ path: path.join(__dirname, 'tape_open.png'), clip: { x: 240, y: 130, width: 480, height: 130 } });
  // Radierer: das Tape geht mit dem, was darauf steht; Rückgängig holt beides zurück
  const has = id => p.evaluate(id => S.items.some(i => i.id === id), id);
  await p.keyboard.press('e'); await draw(line(340, 420, 192));
  check(!(await has(tape.id)) && !(await has(onTape.id)), 'Radierer nimmt das Tape mit seiner Schrift');
  await p.click('#bUndo'); await p.waitForTimeout(100);
  check(await has(tape.id) && await has(onTape.id), 'Rückgängig holt Tape und Schrift zurück');
  // Finger antippen deckt wieder ab (nach einer Pause: kurz nach dem Stift gilt ein Finger als Handballen)
  await p.keyboard.press('p'); await p.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 600, y: 192 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(200);
  res.afterFinger = await st(); check(res.afterFinger.tapes[0] === true, 'Finger antippen deckt wieder ab');
  // Lasso um das Tape: Schrift darauf kommt mit
  await p.keyboard.press('l');
  const sel = await p.evaluate(id => { const t = S.items.find(i => i.id === id); setSel(withGroups(new Set([t.id]))); return [...S.sel.ids]; }, tape.id);
  check(sel.includes(onTape.id), 'Auswahl des Tapes nimmt die Schrift darauf mit');
  await p.evaluate(() => clearSel());
  // Halten macht gerade (fast waagerecht -> genau waagerecht)
  await p.keyboard.press('t'); await draw(line(300, 640, 320, 5).map(([x, y], i) => [x, y + i * 0.05]), 650);
  const straight = await last(); res.straight = straight;
  check(straight.tp && straight.n === 2 && Math.abs(straight.y[0] - straight.y[1]) < 0.01, 'Halten: Tape wird gerade und waagerecht');
  // „Alle aufdecken“ / „Alle abdecken“ im Menü des Tapes
  await p.click('#sizes .sz.on'); await p.waitForTimeout(150);
  res.menu = await p.evaluate(() => ({ label: $('#szLabel').textContent, pats: [...$('#tpPats').children].map(c => c.textContent + (c.classList.contains('on') ? '*' : '')), smooth: !$('#smBox').hidden, straight: !$('#stBox').hidden, all: !$('#tpAll').hidden }));
  check(res.menu.label === 'Tape' && res.menu.pats.join() === 'Uni,Streifen*,Punkte,Karo' && !res.menu.smooth && res.menu.straight && res.menu.all, 'Menü des Tapes');
  await p.click('#tpPats button:nth-child(3)'); await p.waitForTimeout(80);
  const mbox = await p.evaluate(() => { const r = $('#sizeMenu').getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }; });
  await p.screenshot({ path: path.join(__dirname, 'tape_menu.png'), clip: mbox });
  await p.click('#tpShow'); res.allOpen = await st(); check(res.allOpen.tapes.every(h => h === false), 'Alle aufdecken');
  await p.click('#tpHide'); res.allShut = await st(); check(res.allShut.tapes.every(h => h === true), 'Alle abdecken');
  await p.click('#sizes .sz.on'); await p.waitForTimeout(100);
  check(await p.evaluate(() => S.tapePat) === 'punkte', 'Muster gemerkt');
  // Rückgängig nimmt ein Tape wieder weg
  const before = (await st()).n; await draw(line(300, 500, 420)); await p.click('#bUndo'); check((await st()).n === before, 'Rückgängig nimmt das Tape weg');
  // Textmarker: „Immer gerade“
  await p.keyboard.press('m'); await p.click('#sizes .sz.on'); await p.waitForTimeout(150);
  res.hlMenu = await p.evaluate(() => ({ label: $('#szLabel').textContent, smooth: !$('#smBox').hidden, straight: !$('#stBox').hidden, all: !$('#tpAll').hidden }));
  check(res.hlMenu.label === 'Textmarker' && res.hlMenu.smooth && res.hlMenu.straight && !res.hlMenu.all, 'Menü des Textmarkers');
  await p.click('#stBtn'); await p.click('#sizes .sz.on'); await p.waitForTimeout(100);
  await draw(line(300, 620, 480, 6));
  const hlS = await last(); check(hlS.hl && hlS.n === 2, 'Textmarker immer gerade');
  // Textmarker unter der Schrift (Darkmode: weiße Schrift bleibt weiß)
  await p.evaluate(() => { if (!S.dark) toggleDark(); }); await p.waitForTimeout(200);
  await p.keyboard.press('p'); await draw(line(300, 620, 560));
  await p.keyboard.press('m'); await draw(line(290, 630, 560));
  await p.waitForTimeout(300);
  res.ink = await p.evaluate(() => { const [x, y] = toScreen(460, 560); return Array.from(cvMain.getContext('2d').getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data.slice(0, 3)); });
  // (worldToScreen: die Seite beginnt bei der Ansicht; Punkt mitten auf der Schrift)
  check(res.ink[2] > 210, 'Schrift über dem Textmarker bleibt weiß (Blau ' + res.ink[2] + ')');
  await p.screenshot({ path: path.join(__dirname, 'tape_hl_dark.png'), clip: { x: 240, y: 130, width: 480, height: 480 } });
  // gespeichert nach Neuladen, Vorschaubild ohne Fehler
  await p.waitForTimeout(900); await p.reload(); await p.waitForTimeout(400);
  await p.click('.book'); await p.click('.card'); await p.waitForTimeout(500);
  res.reloaded = await p.evaluate(() => S.items.filter(i => i.tp).map(i => [i.tp, i.hid]));
  check(res.reloaded.length === 2 && res.reloaded.every(([, h]) => h === true), 'Tapes nach Neuladen da und abgedeckt');
  check(await p.evaluate(id => S.items.find(i => i.id === id)?.on, onTape.id) === tape.id, 'Zuordnung zum Tape gespeichert');
  await p.evaluate(async () => { await makeThumb(); });
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
