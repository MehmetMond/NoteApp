// Einstellungs-Knopf neben den Dicken: öffnet das Menü des aktuellen Werkzeugs (Stift, Textmarker, Tape), schließt es
// wieder, leuchtet solange; Radierer: erst zum Stift; das zweite Antippen der Dicke geht weiter; Leiste bleibt einzeilig
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgFmt [data-f="a4"]'); await p.click('#dlgOk'); await p.waitForTimeout(500);
  // offen = sichtbar und nicht gerade beim Zugehen (Menüs huschen kurz zusammen, bevor sie verschwinden)
  const st = () => p.evaluate(() => ({ open: isOpen($('#sizeMenu')), label: $('#szLabel').textContent, on: $('#bTune').classList.contains('on'), tool: S.tool,
    smooth: !$('#smBox').hidden, pats: !$('#tpBox').hidden, straight: !$('#stBox').hidden }));
  res.order = await p.$$eval('#bar > *', l => l.map(e => e.id || e.dataset.tool || e.className).join(' '));
  res.group = await p.evaluate(() => [...$('.szgrp').children].map(e => e.id).join());
  check(/szgrp grow/.test(res.order) && res.group === 'sizes,bTune', 'Knopf direkt neben den Dicken, mit ihnen in einer Gruppe (' + res.order + ' | ' + res.group + ')');
  await p.click('#bTune'); res.pen = await st();
  check(res.pen.open && res.pen.on && res.pen.label === 'Stift' && res.pen.smooth && !res.pen.pats && !res.pen.straight, 'Stift: Menü mit Dicke und Glättung (' + JSON.stringify(res.pen) + ')');
  await p.click('#bTune'); res.closed = await st(); check(!res.closed.open && !res.closed.on, 'Nochmal antippen schließt');
  await p.keyboard.press('m'); await p.click('#bTune'); res.hl = await st();
  check(res.hl.open && res.hl.label === 'Textmarker' && res.hl.smooth && res.hl.straight, 'Textmarker: mit Glättung und „Immer gerade“');
  await p.keyboard.press('Escape'); res.esc = await st(); check(!res.esc.open && !res.esc.on, 'Esc schließt, Knopf nicht mehr hervorgehoben');
  await p.keyboard.press('t'); await p.click('#bTune'); res.tape = await st();
  check(res.tape.open && res.tape.label === 'Tape' && res.tape.pats && !res.tape.smooth && res.tape.straight, 'Tape: mit Mustern');
  await p.mouse.click(400, 700); res.outside = await st();
  check(!res.outside.open && !res.outside.on && (await p.evaluate(() => S.items.length)) === 0, 'Tippen daneben schließt, ohne zu zeichnen');
  await p.keyboard.press('e'); res.dim = await p.evaluate(() => $('#bTune').style.opacity);
  await p.click('#bTune'); res.eraser = await st();
  check(res.dim === '0.35' && res.eraser.open && res.eraser.tool === 'pen' && res.eraser.label === 'Stift', 'Radierer: Knopf blass, Antippen wechselt zum Stift und öffnet');
  await p.click('#sizes .sz:nth-child(2)'); res.sizeClick = await st(); check(!res.sizeClick.open && !res.sizeClick.on, 'Dicke wählen schließt das Menü');
  await p.click('#sizes .sz.on'); res.dot = await st(); check(res.dot.open && res.dot.on, 'Zweites Antippen der Dicke öffnet weiterhin');
  await p.keyboard.press('Escape');
  await p.fill('#title', 'Integralrechnung und Kurvendiskussion Teil 2'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  res.barH = await p.evaluate(() => Math.round($('#bar').getBoundingClientRect().height));
  check(res.barH < 60, 'Leiste bleibt einzeilig (1440 px, DIN A4, langer Titel: ' + res.barH + ' px)');
  // Esc schließt auch, nachdem ein Regler im Menü benutzt wurde (der Regler hat dann den Fokus)
  await p.click('#bTune'); const sr = await p.$eval('#szRange', e => { const r = e.getBoundingClientRect(); return [r.x + r.width * 0.7, r.y + r.height / 2]; });
  await p.mouse.click(...sr); res.focus = await p.evaluate(() => document.activeElement.id);
  await p.keyboard.press('Escape'); res.escAfterSlider = await st();
  check(res.focus === 'szRange' && !res.escAfterSlider.open && !res.escAfterSlider.on, 'Esc schließt auch nach dem Regler (' + res.focus + ')');
  // Handballen: Finger auf der Seite, während der Stift am Regler ist, schließt das Menü nicht
  const cdp = await ctx.newCDPSession(p);
  await p.click('#bTune');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sr[0], y: sr[1], pointerType: 'pen', button: 'none', buttons: 0 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sr[0], y: sr[1], pointerType: 'pen', button: 'left', buttons: 1, clickCount: 1, force: 0.5 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 700, y: 700, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sr[0], y: sr[1], pointerType: 'pen', button: 'left', buttons: 0, clickCount: 1 });
  res.palm = await st(); check(res.palm.open, 'Handballen schließt das Menü nicht, solange der Stift am Regler ist');
  await p.keyboard.press('Escape');
  // DIN A4 bei 1440 px mit üblichem Titel: Titel ganz, nichts springt beim Werkzeugwechsel
  await p.fill('#title', 'Notiz vom 20.10.2026'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  const pos = () => p.evaluate(() => [Math.round($('#title').getBoundingClientRect().width), Math.round($('#title').scrollWidth), Math.round($('[data-tool=pen]').getBoundingClientRect().x), Math.round($('#bTune').getBoundingClientRect().x)]);
  res.layout = {}; for (const k of ['p', 'm', 't', 'e', 'f']) { await p.keyboard.press(k); res.layout[k] = await pos(); }
  const L = Object.values(res.layout); res.titleTip = await p.evaluate(() => $('#title').title);
  // der Name darf schmaler werden (… am Ende); gekürzt steht er ganz im Hinweis beim Draufzeigen
  check(L.every(v => v.join() === L[0].join()) && L[0][0] >= 120 && (L[0][0] >= L[0][1] || res.titleTip === 'Notiz vom 20.10.2026'),
    'Gleiche Lage für alle Werkzeuge (auch Formen), Name höchstens etwas gekürzt und dann ganz beim Draufzeigen (' + JSON.stringify(res.layout) + ' ' + res.titleTip + ')');
  // schmal (halbes Fenster) und Hochformat: Knopf bleibt neben den Dicken, Menü unter der ganzen Leiste
  res.narrow = {};
  for (const [w, h] of [[720, 900], [850, 900], [960, 1440]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(250);
    for (const k of ['p', 'm']) {
      await p.keyboard.press(k); await p.click('#bTune');
      res.narrow[w + k] = await p.evaluate(() => { const t = $('#bTune').getBoundingClientRect(), d = $('#sizes').getBoundingClientRect(), m = $('#sizeMenu').getBoundingClientRect(), b = $('#bar').getBoundingClientRect();
        return { sameRow: Math.abs(t.top - d.top) < 2 && t.left > d.left, below: m.top >= b.bottom, inView: m.right <= innerWidth && m.bottom <= innerHeight + 1, rows: Math.round(b.height) }; });
      await p.keyboard.press('Escape');
    }
  }
  check(Object.values(res.narrow).every(v => v.sameRow && v.below && v.inView), 'Schmal und hoch: Knopf bei den Dicken, Menü unter der Leiste und ganz im Bild (' + JSON.stringify(res.narrow) + ')');
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
