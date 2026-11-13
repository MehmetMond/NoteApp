// Erklärung (Notiz) verschwindet mit ihrer Stelle: mit dem Radierer das Letzte weg, was sie markiert -> die Notiz auch (ihr
// „i“ ist dann auch auf der Seite weg); solange noch etwas davon da ist, bleibt sie. Rückgängig holt beides zurück. Text
// mit Notiz löschen nimmt sie ebenso mit, Löschen mit dem Lasso wie bisher.
// node tests/notedel.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => {
    const now = Date.now(), n = { id: uid(), name: 'Notiz löschen', created: now, updated: now, thumb: null, bg: 'blank', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  });
  await p.waitForTimeout(300);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6 });
  async function drag(x0, y0, x1, y1, n = 16) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' }); await pen('mousePressed', x0, y0);
    for (let k = 1; k <= n; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
    await pen('mouseReleased', x1, y1); await frames(); await p.waitForTimeout(80);
  }
  // zwei Striche, eine Notiz auf beiden (wie beim Speichern der Karte)
  const ids = await p.evaluate(() => {
    const A = makeStroke([300, 300, .5, 400, 302, .5, 500, 300, .5], 'ink', 3, false), B = makeStroke([300, 360, .5, 400, 362, .5, 500, 360, .5], 'ink', 3, false);
    commit(appendItems(S.items, [A, B]));
    const mark = noteMark(new Set([A.id, B.id]), { text: 'Merke', img: null, ink: [] });
    commit(appendItems(S.items.map(x => x.id === A.id || x.id === B.id ? { ...x, on: mark.id } : x), [mark]));
    return { A: A.id, B: B.id, N: mark.id };
  });
  await frames();
  const state = () => p.evaluate(ids => ({ A: S.items.some(i => i.id === ids.A), B: S.items.some(i => i.id === ids.B), note: S.items.some(i => i.id === ids.N) }), ids);
  const badge = () => p.evaluate(id => { const n = S.items.find(i => i.id === id) || null; return n && itemBox(n); }, ids.N);
  const box = await badge();
  // Radierer über A: die Notiz bleibt (B ist noch da)
  await p.evaluate(() => setTool('eraser'));
  await drag(320, 280, 480, 320);
  res.afterA = await state();
  check('Radierer nimmt einen der markierten Striche: Notiz bleibt', !res.afterA.A && res.afterA.B && res.afterA.note, res.afterA);
  // Radierer über B: das Letzte ist weg -> die Notiz auch
  await drag(320, 340, 480, 380);
  res.afterB = await state();
  check('Radierer nimmt das Letzte, was markiert ist: Notiz ist auch weg', !res.afterB.A && !res.afterB.B && !res.afterB.note, res.afterB);
  // ihr „i“ ist auch auf der Seite weg: Kacheln dort neu (keine blauen Pixel mehr am Rand oben rechts)
  await frames(); await p.waitForTimeout(150);
  res.badgePx = await p.evaluate(b => {
    const g = cvMain.getContext('2d'), x0 = Math.round((b[2] - 30 + PADC) * DPR), y0 = Math.round((b[1] - 10 + PADC) * DPR), d = g.getImageData(x0, y0, Math.round(50 * DPR), Math.round(40 * DPR)).data;
    let blue = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > d[i] + 60) blue++; return blue;
  }, box);
  check('Das „i“ der Notiz ist auf der Seite verschwunden', res.badgePx === 0, res.badgePx);
  // Rückgängig: B und die Notiz kommen zusammen zurück
  await p.evaluate(() => undo()); await frames();
  res.undo = await state();
  check('Rückgängig holt den Strich und die Notiz zurück', res.undo.B && res.undo.note && !res.undo.A, res.undo);
  // Text mit Notiz: Text löschen nimmt die Notiz mit
  const tx = await p.evaluate(() => {
    const t = { t: 'x', id: uid(), x: 700, y: 500, w: 200, h: 40, fs: 20, runs: [{ s: 'Satz des Pythagoras' }], c: 'ink' };
    commit(appendItems(S.items, [t]));
    const mark = noteMark(new Set([t.id]), { text: 'a² + b² = c²', img: null, ink: [] });
    commit(appendItems(S.items.map(x => x.id === t.id ? { ...x, on: mark.id } : x), [mark]));
    return { T: t.id, N: mark.id };
  });
  await p.evaluate(id => commit(S.items.filter(x => x.id !== id)), tx.T);
  res.textDel = await p.evaluate(ids => ({ text: S.items.some(i => i.id === ids.T), note: S.items.some(i => i.id === ids.N) }), tx);
  check('Text mit Notiz gelöscht: Notiz ist auch weg', !res.textDel.text && !res.textDel.note, res.textDel);
  // andere Änderungen (Verschieben, Stil) lassen die Notiz in Ruhe
  await p.evaluate(() => undo());
  res.keep = await p.evaluate(ids => { const t = S.items.find(i => i.id === ids.T); commit(S.items.map(x => x.id === t.id ? { ...x, x: x.x + 20 } : x)); return S.items.some(i => i.id === ids.N); }, tx);
  check('Verschieben lässt die Notiz stehen', res.keep, res.keep);
  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
