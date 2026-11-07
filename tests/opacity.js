// Deckkraft von Stift und Textmarker: Regler im Menü des Werkzeugs (nicht beim Tape), am Strich gespeichert (al, nur wenn
// anders als die Vorgabe), so gezeichnet (Seite und Export), beim Schreiben durchsichtig, an den Dicken zu sehen,
// „Farbe übernehmen“ gibt sie ausgewählten Strichen, bleibt nach dem Neuladen
// node tests/opacity.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const newNote = () => p.evaluate(async () => {
    if (S.note) await closeNote();
    const now = Date.now(), n = { id: uid(), name: 'Deckkraft', created: now, updated: now, thumb: null, bg: 'blank', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  });
  await newNote(); await p.waitForTimeout(400);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Pixel der Seite (Hauptebene) an einer Bildschirmstelle, Grauwert
  const px = (x, y) => p.evaluate(([x, y]) => { const d = cvMain.getContext('2d').getImageData(Math.round((x + PADC) * DPR), Math.round((y + PADC) * DPR), 1, 1).data; return Math.round((d[0] + d[1] + d[2]) / 3); }, [x, y]);
  const stroke = async (x0, y0, x1, y1, mid) => {
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12); if (i === 6 && mid) await mid(); }
    await p.mouse.up(); await p.waitForTimeout(250); await frames();
  };
  const setRange = v => p.evaluate(v => { const r = $('#opRange'); r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const menu = () => p.evaluate(() => ({ open: isOpen($('#sizeMenu')), op: !$('#opBox').hidden, val: $('#opVal').textContent, range: +$('#opRange').value }));
  // Stift: Regler bei 100 %, Strich deckend ohne al
  await p.keyboard.press('p'); await p.evaluate(() => { setSize('pen', 4); renderSizes(); });   // dickster Stift (10)
  await p.click('#bTune'); await p.waitForTimeout(500); res.penMenu = await menu();
  check(res.penMenu.open && res.penMenu.op && res.penMenu.val === '100 %' && res.penMenu.range === 100, 'Stift-Menü mit Deckkraft 100 % (' + JSON.stringify(res.penMenu) + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await stroke(200, 200, 600, 200);
  res.opaque = await p.evaluate(() => { const s = S.items.at(-1); return { al: s.al, a: strokeAlpha(s) }; });
  res.opaquePx = await px(400, 200);
  check(res.opaque.al === undefined && res.opaque.a === 1 && res.opaquePx < 60, 'Deckender Strich ohne al, dunkel (' + JSON.stringify([res.opaque, res.opaquePx]) + ')');
  // 50 %: Regler, gespeichert, Strich mit al 0,5, beim Schreiben ist die Live-Ebene durchsichtig
  await p.click('#bTune'); await p.waitForTimeout(500); await setRange(50); res.pen50 = await menu();
  res.stored = await p.evaluate(() => JSON.parse(localStorage.getItem('notizen.alpha')));
  check(res.pen50.val === '50 %' && res.stored.pen === 0.5, 'Regler auf 50 % gespeichert (' + JSON.stringify([res.pen50, res.stored]) + ')');
  res.dot = await p.evaluate(() => $('#sizes .sz.on span').style.opacity);
  check(res.dot === '0.5', 'Gewählte Dicke zeigt die Deckkraft (' + res.dot + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await stroke(200, 300, 600, 300, async () => { res.liveOpacity = await p.evaluate(() => cvLive.style.opacity); });
  res.half = await p.evaluate(() => { const s = S.items.at(-1); return { al: s.al, a: strokeAlpha(s) }; });
  res.halfPx = await px(400, 300);
  check(res.liveOpacity === '0.5', 'Beim Schreiben: Live-Ebene 50 % durchsichtig (' + res.liveOpacity + ')');
  check(res.half.al === 0.5 && res.halfPx > 110 && res.halfPx < 170, 'Strich mit 50 %: al 0,5 und mittleres Grau (' + JSON.stringify([res.half, res.halfPx]) + ')');
  // ein zweiter 50-%-Strich quer darüber: an der Kreuzung dunkler; ein Strich selbst überlappt sich nicht dunkler
  await stroke(400, 260, 400, 340);
  res.cross = await px(400, 300); res.single = await px(400, 330);
  check(res.cross < res.single - 25, 'Kreuzung zweier halbdurchsichtiger Striche dunkler (' + res.cross + ' / ' + res.single + ')');
  // Export (wie PNG/PDF) zeichnet genauso
  res.exportPx = await p.evaluate(async () => {
    const c = await renderTo(S.items, [150, 150, 650, 350], 1, 'blank', { light: true }), d = c.getContext('2d').getImageData(150, 150, 1, 1).data;   // Welt (300, 300)
    return Math.round((d[0] + d[1] + d[2]) / 3);
  });
  check(res.exportPx > 110 && res.exportPx < 170, 'Export mit Deckkraft (' + res.exportPx + ')');
  // Tape: kein Regler
  await p.keyboard.press('t'); await p.click('#bTune'); await p.waitForTimeout(500); res.tapeMenu = await menu();
  check(res.tapeMenu.open && !res.tapeMenu.op, 'Tape-Menü ohne Deckkraft');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // Textmarker: Vorgabe 42 %, auf 80 % gestellt, Strich mit al 0,8
  await p.keyboard.press('m'); await p.click('#bTune'); await p.waitForTimeout(500); res.hlMenu = await menu();
  check(res.hlMenu.open && res.hlMenu.op && res.hlMenu.val === '42 %', 'Textmarker-Menü mit Deckkraft 42 % (' + JSON.stringify(res.hlMenu) + ')');
  await setRange(80); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await stroke(200, 500, 600, 500, async () => { res.hlLive = await p.evaluate(() => cvLive.style.opacity); });
  res.hl = await p.evaluate(() => { const s = S.items.at(-1); return { hl: s.hl, al: s.al, a: +strokeAlpha(s).toFixed(3) }; });
  check(res.hl.hl && res.hl.al === 0.8 && res.hl.a === 0.8 && res.hlLive === '0.8', 'Textmarker mit 80 % (' + JSON.stringify([res.hl, res.hlLive]) + ')');
  // Textmarker zurück auf 42 %: kein al am Strich (wie vor dieser Version)
  await p.click('#bTune'); await p.waitForTimeout(500); await setRange(42); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await stroke(200, 560, 600, 560); res.hlDefault = await p.evaluate(() => S.items.at(-1).al);
  check(res.hlDefault === undefined, 'Textmarker mit Vorgabe ohne al (' + res.hlDefault + ')');
  // Farbe übernehmen: der deckende Strich bekommt die Deckkraft des Stifts (30 %)
  await p.keyboard.press('p'); await p.click('#bTune'); await p.waitForTimeout(500); await setRange(30); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.keyboard.press('l'); await p.mouse.click(300, 200); await p.waitForTimeout(300);
  await p.click('#sColor'); await p.waitForTimeout(300);
  res.applied = await p.evaluate(() => S.items[0].al);
  check(res.applied === 0.3, 'Farbe übernehmen gibt die Deckkraft mit (' + res.applied + ')');
  // nach dem Neuladen: Einstellung und Striche
  await p.waitForTimeout(2200);   // speichern
  await p.reload(); await p.waitForTimeout(600);
  res.reload = await p.evaluate(async () => { const all = await dbIndexAll(); await openNote(all[0]); return { alpha: S.alpha, al: S.items.map(s => s.al ?? null) }; });
  check(res.reload.alpha.pen === 0.3 && res.reload.alpha.hl === 0.42 && JSON.stringify(res.reload.al) === '[0.3,0.5,0.5,0.8,null]', 'Nach dem Neuladen gleich (' + JSON.stringify(res.reload) + ')');
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exitCode = fails.length ? 1 : 0;
})();
