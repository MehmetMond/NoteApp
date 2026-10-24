// Glättung (Stift-Menü): Voreinstellungen (Knöpfe), Schieberegler, Wirkung auf neue Striche, Ende des Strichs, Speichern
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [], fails = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const res = { default: await p.evaluate(() => ({ smooth: S.smooth, idx: S.smoothIdx, presets: S.smoothPresets })) };
  check(res.default.smooth === 0.5 && res.default.idx === 2 && res.default.presets.join() === '0,0.25,0.5,0.75,1', 'Voreinstellungen 0/25/50/75/100 %, gewählt 50 %');
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  // Wellenlinie mit Zittern der Hand (fest vorgegeben), ein Ereignis alle 6 ms (Zeitstempel), etwa 330 px/s
  const wave = y0 => { let s = 11; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647 - 0.5;
    return Array.from({ length: 300 }, (_, i) => [300 + i * 2, y0 + 25 * Math.sin(i * 2 / 40) + 2.5 * Math.sin(i / 4.5) + 3 * rnd()]); };
  const draw = async w => {
    const t0 = Date.now() / 1000, ts = i => ({ timestamp: t0 + i * 0.006 });
    await send('mouseMoved', ...w[0], { buttons: 0, ...ts(0) }); await send('mousePressed', ...w[0], ts(0));
    for (let i = 1; i < w.length; i++) await send('mouseMoved', ...w[i], ts(i));
    await send('mouseReleased', ...w.at(-1), ts(w.length)); await p.waitForTimeout(150);
  };
  await p.evaluate(() => { window.__dts = []; let last = 0; addEventListener('pointermove', e => { if (e.buttons) window.__dts.push(e.timeStamp - last); last = e.timeStamp; }, true); });
  const menu = async open => { const isOpen = await p.isVisible('#sizeMenu'); if (isOpen !== open) { await p.click('#sizes .sz.on'); await p.waitForTimeout(150); } };
  const chip = async i => { await p.click(`#smPresets button:nth-child(${i + 1})`); await p.waitForTimeout(60); };
  const state = () => p.evaluate(() => ({ smooth: S.smooth, idx: S.smoothIdx, presets: [...S.smoothPresets], slider: $('#smRange').value, label: $('#smVal').textContent,
    chips: [...$('#smPresets').children].map(c => c.textContent + (c.classList.contains('on') ? '*' : '')) }));
  // Menü: vier Knöpfe, 30 % gewählt
  await menu(true);
  res.menu = await state();
  check(res.menu.chips.join() === 'Aus,25 %,50 %*,75 %,100 %' && res.menu.slider === '50' && res.menu.label === '50 %', 'Knöpfe Aus/25/50/75/100, 50 % gewählt');
  const box = await p.evaluate(() => { const r = $('#sizeMenu').getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }; });
  for (const i of [0, 1, 2, 3, 4]) { await chip(i); await p.screenshot({ path: path.join(__dirname, `smooth_menu_${i}.png`), clip: box }); }
  res.chip100 = await state();
  check(res.chip100.smooth === 1 && res.chip100.idx === 4 && res.chip100.slider === '100' && res.chip100.chips[4] === '100 %*', 'Knopf 100 % wählt 100 %');
  // Regler stellt die gewählte Voreinstellung ein, die anderen bleiben
  await chip(3); await p.evaluate(() => { const r = $('#smRange'); r.value = 85; r.dispatchEvent(new Event('input')); }); await p.waitForTimeout(50);
  res.edited = await state();
  check(res.edited.presets.join() === '0,0.25,0.5,0.85,1' && res.edited.chips[3] === '85 %*' && res.edited.smooth === 0.85, 'Regler ändert nur die gewählte Voreinstellung');
  await p.evaluate(() => { const r = $('#smRange'); r.value = 75; r.dispatchEvent(new Event('input')); });
  await menu(false);
  // gleiche Linie mit 0, 25, 50, 75, 100 % schreiben (über die Knöpfe)
  const strokes = {};
  for (const [i, y0] of [[0, 160], [1, 300], [2, 440], [3, 580], [4, 720]]) {
    await menu(true); await chip(i); await menu(false);
    const w = wave(y0); await draw(w);
    strokes[[0, 25, 50, 75, 100][i]] = await p.evaluate(end => {
      const s = S.items[S.items.length - 1], P = s.pts, n = P.length / 3;
      let turn = 0, len = 0, prev = null;
      for (let i = 1; i < n; i++) {
        const dx = P[i * 3] - P[i * 3 - 3], dy = P[i * 3 + 1] - P[i * 3 - 2], a = Math.atan2(dy, dx); len += Math.hypot(dx, dy);
        if (prev !== null) { let d = Math.abs(a - prev); if (d > Math.PI) d = 2 * Math.PI - d; turn += d; } prev = a;
      }
      const [ex, ey] = toWorld(...end);
      return { points: n, turnPer100px: +(turn / len * 100).toFixed(2), endGap: +Math.hypot(P[(n - 1) * 3] - ex, P[(n - 1) * 3 + 1] - ey).toFixed(2) };
    }, w.at(-1));
  }
  res.strokes = strokes;
  const dts = await p.evaluate(() => window.__dts.filter(d => d > 0 && d < 100)); dts.sort((a, b) => a - b);
  res.eventSpacingMs = dts[dts.length >> 1];
  check(Math.abs(res.eventSpacingMs - 6) < 1.5, 'Ereignisse kommen im Abstand von 6 ms an (Zeitstempel)');
  const T = v => strokes[v].turnPer100px;
  check(T(0) > T(25) && T(25) > T(50) && T(50) > T(75) && T(75) > T(100), 'mehr Glättung = ruhigere Linie');
  check(T(100) < T(0) * 0.3, '100 % glättet stark (Drehung unter 30 % von roh)');
  for (const v of [0, 25, 50, 75, 100]) check(strokes[v].endGap < 1, `Strich ${v} % endet am Absetzpunkt`);
  // alte Striche bleiben, wie sie sind
  const before = await p.evaluate(() => S.items.map(s => Array.from(s.pts).join(',')));
  await menu(true); await chip(2); await menu(false);
  check((await p.evaluate(() => S.items.map(s => Array.from(s.pts).join(',')))).every((v, i) => v === before[i]), 'alte Striche unverändert');
  // gespeichert nach Neuladen (gewählt 30 %, Voreinstellungen)
  await p.waitForTimeout(800); await p.reload(); await p.waitForTimeout(400);
  res.reloaded = await p.evaluate(() => ({ smooth: S.smooth, idx: S.smoothIdx, presets: S.smoothPresets }));
  check(res.reloaded.smooth === 0.5 && res.reloaded.idx === 2 && res.reloaded.presets.join() === '0,0.25,0.5,0.75,1', 'nach Neuladen gespeichert');
  await p.click('.book'); await p.click('.card'); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 'smooth_strokes.png') });
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
