// Aufwärmen der Buch-Animation nach dem Start: läuft einmal, ist unsichtbar, fängt keine Klicks ab, räumt auf;
// ein Buch lässt sich währenddessen und danach normal öffnen
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(async () => {
    localStorage.clear(); for (const m of await dbIndexAll()) await dbDeleteNote(m.id);
    const now = Date.now(); await dbBookPut({ id: 'wb', name: 'Mathe', color: 'green', created: now });
    for (let k = 0; k < 4; k++) { const items = []; for (let s = 0; s < 40; s++) { const pts = []; for (let i = 0; i < 20; i++) pts.push(80 + (s % 8) * 60 + i, 90 + Math.floor(s / 8) * 40 + Math.sin(i / 3) * 8, 0.5); const st = makeStroke(pts, 'ink', 2, false); st.o = s; st.n = 'w' + k; items.push(st); }
      const meta = { id: 'w' + k, name: 'Seite ' + (k + 1), created: now + k, updated: now + k, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 }, book: 'wb' };
      meta.thumb = await makeThumb(meta, items); await writeRecords(meta, items, [], true); }
  });
  // neu laden: wie ein frischer Start
  await p.reload();
  const warm = () => p.evaluate(() => !!document.querySelector('[data-warm]'));
  let seen = false; for (let i = 0; i < 150 && !seen; i++) { seen = await warm(); if (!seen) await p.waitForTimeout(20); }
  check(seen, 'Aufwärmen startet nach dem Laden');
  // während des Aufwärmens: Bildschirm wie ohne (höchstens 2 Stufen Unterschied), Klicks gehen durch
  const during = await p.screenshot();
  res.clickThrough = await p.evaluate(() => { const r = document.querySelector('.book .cv').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(el && el.closest('#home')); });
  check(res.clickThrough, 'Klicks gehen während des Aufwärmens an die Startseite');
  for (let i = 0; i < 100 && await warm(); i++) await p.waitForTimeout(30);
  res.gone = !(await warm()); check(res.gone, 'Aufwärmen räumt auf');
  await p.waitForTimeout(200);
  const after = await p.screenshot();
  const cmp = await ctx.newPage(); await cmp.setContent('<body></body>');
  res.diff = await cmp.evaluate(async ([a, c]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    let mx = 0, n = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (d) n++; if (d > mx) mx = d; }
    return { max: mx, pixels: n };
  }, [during.toString('base64'), after.toString('base64')]);
  check(res.diff.max <= 2, 'Aufwärmen ist unsichtbar (größter Unterschied ' + res.diff.max + ' Stufen)');
  res.state = await p.evaluate(() => ({ warmed, homeAnim, navBusy, dupHomes: document.querySelectorAll('#home').length }));
  check(res.state.warmed && !res.state.homeAnim && !res.state.navBusy && res.state.dupHomes === 1, 'nach dem Aufwärmen alles wie vorher');
  // Buch öffnen: Seiten erscheinen
  await p.click('.book .cv'); await p.waitForFunction(() => !homeAnim, null, { timeout: 5000 }); await p.waitForTimeout(200);
  res.cards = await p.evaluate(() => document.querySelectorAll('#grid .card').length); check(res.cards === 4, 'Buch öffnet mit 4 Seiten');
  // Öffnen gleich nach dem Start, mitten im Aufwärmen
  await p.click('#hShelf'); await p.waitForFunction(() => !homeAnim, null, { timeout: 5000 });
  await p.reload();
  for (let i = 0; i < 150 && !(await warm()); i++) await p.waitForTimeout(20);
  await p.click('.book .cv'); await p.waitForFunction(() => !homeAnim, null, { timeout: 5000 }); await p.waitForTimeout(800);
  res.early = await p.evaluate(() => ({ cards: document.querySelectorAll('#grid .card').length, warmLeft: !!document.querySelector('[data-warm]') }));
  check(res.early.cards === 4 && !res.early.warmLeft, 'Öffnen während des Aufwärmens klappt (' + JSON.stringify(res.early) + ')');
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
