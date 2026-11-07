// Finger auf der Seite gedrückt halten (oder Rechtsklick): Blase „Einfügen“, das Bild aus der Zwischenablage kommt mittig
// unter den Finger. Kurz antippen, verschieben, zwei Finger, Stift und „Mit dem Finger zeichnen“ zeigen sie nicht.
// Achsenbeschriftung: bis 2 Zeichen an der Pfeilspitze, länger mittig an der Achse (senkrecht gedreht).
// node tests/holdlabels.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
const near = (a, b, e = 0.5) => Math.abs(a - b) <= e;
const onG = (v, G = 28) => near(v / G, Math.round(v / G), 1e-3);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => {
    const now = Date.now(), n = { id: uid(), name: 'Halten', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
    // Zwischenablage nachgebildet: ein PNG 300 × 200
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; c.getContext('2d').fillRect(0, 0, 300, 200);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => [{ types: ['image/png'], getType: async () => blob }] } });
  });
  await p.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const wait = ms => p.waitForTimeout(ms);
  const bubble = () => p.evaluate(() => { const m = $('#pasteMenu'), r = m.getBoundingClientRect(); return { open: isOpen(m), cx: r.left + r.width / 2, bottom: r.bottom, top: r.top, at: pasteAt }; });
  const images = () => p.evaluate(() => S.items.filter(i => i.t === 'i').map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h })));
  const closeAll = async () => { await p.evaluate(() => closeMenus()); await wait(250); };

  // ---------- Gedrückt halten mit dem Finger ----------
  await touch('touchStart', [[600, 500]]); await wait(700);
  const held = await bubble();
  await touch('touchEnd', []); await wait(200);
  const afterLift = await bubble(), view = await p.evaluate(() => ({ ...S.view }));
  check('Finger 0,7 s halten: Blase „Einfügen“ über dem Finger, bleibt nach dem Abheben', held.open && near(held.cx, 600, 2) && held.bottom <= 470 && afterLift.open
    && near(held.at[0], (600 - view.tx) / view.z) && near(held.at[1], (500 - view.ty) / view.z), { held, afterLift });
  await p.click('#pmPaste'); await p.waitForFunction(() => S.busy === 0 && S.items.some(i => i.t === 'i'), null, { timeout: 15000 });
  { const [im] = await images(); check('„Einfügen“: Bild mittig unter dem Finger', near(im.x + im.w / 2, held.at[0], 1) && near(im.y + im.h / 2, held.at[1], 1) && near(im.w / im.h, 1.5, 1e-3), { im, at: held.at }); }
  await p.evaluate(() => { clearSel(); setTool('pen'); });
  // kurz antippen: keine Blase
  await touch('touchStart', [[900, 300]]); await wait(120); await touch('touchEnd', []); await wait(700);
  check('Kurz antippen: keine Blase', !(await bubble()).open);
  // halten, dann verschieben: Blase geht zu, die Seite folgt dem Finger
  { const tx0 = await p.evaluate(() => S.view.tx);
    await touch('touchStart', [[700, 600]]); await wait(700); const shown = (await bubble()).open;
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[700 + k * 15, 600]]); await wait(16); }
    const gone = !(await bubble()).open; await touch('touchEnd', []); await wait(300);
    const tx1 = await p.evaluate(() => S.view.tx);
    check('Halten und dann ziehen: Blase zu, Seite verschoben', shown && gone && near(tx1 - tx0, 90, 2), { shown, gone, dx: tx1 - tx0 }); }
  await p.evaluate(() => setView(0, 0, 1, true));
  // ziehen ohne Pause: keine Blase
  await touch('touchStart', [[500, 650]]); for (let k = 1; k <= 8; k++) { await touch('touchMove', [[500 + k * 10, 650]]); await wait(30); } await wait(500);
  const panNo = !(await bubble()).open; await touch('touchEnd', []); await wait(200);
  check('Gleich ziehen: keine Blase', panNo);
  await p.evaluate(() => setView(0, 0, 1, true));
  // zwei Finger halten: keine Blase
  await touch('touchStart', [[600, 500], [760, 520]]); await wait(700);
  const two = !(await bubble()).open; await touch('touchEnd', []); await wait(300);
  check('Zwei Finger halten: keine Blase', two);
  // Stift halten: zeichnet, keine Blase
  { const n0 = await p.evaluate(() => S.items.length);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 700, pointerType: 'pen' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 700, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.6 });
    await wait(700); const pen = !(await bubble()).open;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 700, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' }); await wait(300);
    check('Stift halten: keine Blase', pen, { n0 }); }
  // „Mit dem Finger zeichnen“: der Finger schreibt, keine Blase
  await p.evaluate(() => { S.fingerDraw = true; liveVis(); });
  await touch('touchStart', [[400, 760]]); await wait(700);
  const fd = !(await bubble()).open; await touch('touchEnd', []); await wait(300);
  await p.evaluate(() => { S.fingerDraw = false; liveVis(); });
  check('Mit dem Finger zeichnen: keine Blase', fd);
  // mit Raster: obere linke Ecke auf dem Raster
  await p.evaluate(() => { if (!S.snap) toggleSnap(); });
  { const n0 = (await images()).length;
    await touch('touchStart', [[1013, 437]]); await wait(700); await touch('touchEnd', []); await wait(200);
    await p.click('#pmPaste'); await p.waitForFunction(n => S.busy === 0 && S.items.filter(i => i.t === 'i').length === n + 1, n0);
    const im = (await images()).at(-1); check('Mit Raster: eingefügtes Bild auf dem Raster', onG(im.x) && onG(im.y), im); }
  await p.evaluate(() => { if (S.snap) toggleSnap(); clearSel(); setTool('pen'); });
  // Rechtsklick mit der Maus: Blase an der Stelle; mit der rechten Taste verschieben: keine
  await closeAll();
  await p.mouse.click(820, 330, { button: 'right' }); await wait(400);
  const rc = await bubble();
  check('Rechtsklick: Blase „Einfügen“', rc.open && near(rc.cx, 820, 2) && rc.bottom <= 300, rc);
  await closeAll();
  await p.mouse.move(820, 600); await p.mouse.down({ button: 'right' }); await p.mouse.move(900, 640, { steps: 6 }); await p.mouse.up({ button: 'right' }); await wait(400);
  const rd = await bubble(), moved = await p.evaluate(() => S.view.tx);
  check('Mit der rechten Taste verschieben: keine Blase', !rd.open && near(moved, 80, 2), { rd, moved });
  // Escape schließt die Blase
  await p.mouse.click(700, 400, { button: 'right' }); await wait(300); await p.keyboard.press('Escape'); await wait(300);
  check('Escape schließt die Blase', !(await bubble()).open);

  // ---------- Achsenbeschriftung ----------
  res.labels = await p.evaluate(() => {
    const out = {};
    // Beschriftungen eines Graphen: Linien der Beschriftung von x und y (Reihenfolge wie graphLines)
    const parts = q => {
      const L = graphLines(q, 2), base = graphLines({ ...q, lx: '', ly: '' }, 2);
      const ntx = base.filter(s => s.length === 4 && Math.abs(s[0] - s[2]) < 1e-6 && Math.abs(s[1] - s[3]) > 1e-6).length;   // senkrechte Teilstriche
      const nx = textPolys(q.lx).lines.length, ny = textPolys(q.ly).lines.length;
      return { x: L.slice(2 + ntx, 2 + ntx + nx), y: L.slice(L.length - ny), n: L.length - base.length };
    };
    const box = ls => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const s of ls) for (let i = 0; i < s.length; i += 2) { b[0] = Math.min(b[0], s[i]); b[1] = Math.min(b[1], s[i + 1]); b[2] = Math.max(b[2], s[i]); b[3] = Math.max(b[3], s[i + 1]); } return b.map(v => +v.toFixed(2)); };
    const W = s => textPolys(s).w * 1.3;   // Breite bei x-Höhe 13 (Stift 2)
    // nur positiv, wie in Büchern: x mittig unter der Achse (zwischen Ursprung und Spitze), y gedreht mittig links daneben
    let q = { k: 'axes2p', b: [100, 100, 500, 400], o: [100, 400], G: 28, f: 1, step: 1, lx: 'Durchgang i', ly: 'Fehleranteil' }, s = parts(q);
    out.long = { x: box(s.x), y: box(s.y), wx: W(q.lx), wy: W(q.ly), n: s.n };
    // kurz (bis 2 Zeichen): an der Spitze wie bisher
    q = { ...q, lx: 'x', ly: 't²' }; s = parts(q);
    out.short = { x: box(s.x), y: box(s.y) };
    // 3 Zeichen sind schon lang
    q = { ...q, lx: 'abc', ly: 'ab' }; s = parts(q);
    out.three = { x: box(s.x), y: box(s.y), w: W('abc') };
    // mit Ursprung in der Mitte: rechte bzw. obere Hälfte, nie über den Ursprung hinaus
    q = { k: 'axes2', b: [100, 100, 500, 500], o: [300, 300], G: 28, f: 1, step: 1, lx: 'Zeit in s', ly: 'Weg in m' }; s = parts(q);
    out.mid = { x: box(s.x), y: box(s.y), wx: W(q.lx), wy: W(q.ly) };
    return out;
  });
  { const L = res.labels;
    // th = 4, Abstand 7 + 2 = 9: x-Beschriftung beginnt 13 unter der Achse, y-Beschriftung endet 13 links davon
    // Mitte nach der Laufweite der Schrift; die Striche selbst sitzen darin bis etwa 1 Einheit versetzt
    check('Lange x-Beschriftung mittig unter der Achse', near((L.long.x[0] + L.long.x[2]) / 2, 300, 1.5) && near(L.long.x[1], 413, 0.6) && near(L.long.x[2] - L.long.x[0], L.long.wx, 1.5), L.long);
    check('Lange y-Beschriftung gedreht mittig links der Achse', L.long.y[3] - L.long.y[1] > 3 * (L.long.y[2] - L.long.y[0]) && near(L.long.y[2], 87, 0.6) && near((L.long.y[1] + L.long.y[3]) / 2, 250, 1.5) && near(L.long.y[3] - L.long.y[1], L.long.wy, 1.5), L.long);
    check('Kurze Beschriftung (x, t²) an der Spitze', near(L.short.x[2], 500, 1.5) && L.short.x[1] > 400 && L.short.y[2] < 100 && near(L.short.y[1], 100, 0.6) && L.short.y[2] - L.short.y[0] > L.short.y[3] - L.short.y[1] - 8, L.short);
    check('Ab 3 Zeichen an der Achse, 2 Zeichen an der Spitze', near((L.three.x[0] + L.three.x[2]) / 2, 300, 1.5) && near(L.three.y[1], 100, 0.6), L.three);
    check('Ursprung in der Mitte: rechts unter bzw. oben links neben der Achse', L.mid.x[0] >= 300 + 13 - 0.6 && near(L.mid.x[1], 313, 0.6) && L.mid.y[3] <= 300 - 13 + 0.6 && near(L.mid.y[2], 287, 0.6), L.mid);
  }

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
