// Popup neben einer mit dem Lasso gewählten Form: Kontur, Kanten, Sauberkeit und Füllung nachträglich, nur für die
// gewählten Formen (der Stil für neue bleibt), je ein Schritt, Auswahl bleibt; nur passende Zeilen (Pfeil: ohne Kanten
// und Füllung); mehrere Formen: gemeinsamer Wert markiert, Änderung für alle; nicht bei gemischter Auswahl und nicht
// gleich nach dem Zeichnen im Formen-Werkzeug; neben der Auswahl, ohne die Auswahlleiste zu verdecken; beim Verschieben
// weg und danach am neuen Ort. Dazu die Dicken von Textmarker und Tape als Stück (Bilder).
// node tests/shapepop.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const SHOTS = process.env.NOTES_SHOTS;
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
    const now = Date.now(), n = { id: uid(), name: 'Formen nachträglich', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  });
  await p.waitForTimeout(300);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.7 });
  async function path_(pts, release = true) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen' });
    await pen('mousePressed', ...pts[0]);
    for (let k = 1; k < pts.length; k++) { const [a, c] = [pts[k - 1], pts[k]]; for (let i = 1; i <= 6; i++) await pen('mouseMoved', a[0] + (c[0] - a[0]) * i / 6, a[1] + (c[1] - a[1]) * i / 6); }
    if (release) { await pen('mouseReleased', ...pts.at(-1)); await frames(); }
  }
  const drag = (x0, y0, x1, y1) => path_([[x0, y0], [x1, y1]]);
  const tap = async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'pen' }); await pen('mousePressed', x, y); await pen('mouseReleased', x, y); await frames(); };
  const shape = async (k, a, c) => {
    await p.evaluate(k => { S.shapeStyle = { ds: 'solid', rnd: 0, sl: 0, fs: 'none' }; store.set('shapeStyle', S.shapeStyle); setShape(k); setTool('shape'); S.size.pen = 3; }, k);
    await drag(a[0], a[1], c[0], c[1]);
    return p.evaluate(() => S.items.at(-1).id);
  };
  const item = id => p.evaluate(id => { const s = S.items.find(i => i.id === id); return s && { k: s.k, ds: s.ds || 'solid', fs: s.fs || 'none', rnd: shOf(s).rnd || 0, sl: shOf(s).sl || 0 }; }, id);
  // Zustand des Popups: sichtbar, Zeilen, markierte Werte, Lage gegenüber Auswahl und Auswahlleiste (Bildschirm)
  const pop = () => p.evaluate(() => {
    const el = $('#shapePop'), vis = !el.classList.contains('hidden'), r = el.getBoundingClientRect(), sb = $('#selbar'), q = sb.getBoundingClientRect(), cv = cvLive.getBoundingClientRect();
    const rows = [...el.querySelectorAll('.sprow')].filter(x => !x.hidden).map(x => x.dataset.g);
    const on = {}; for (const g of ['ds', 'rnd', 'sl', 'fs']) { const o = el.querySelector(`button[data-${g}].on`); on[g] = o ? o.dataset[g] : null; }
    let sel = null; if (S.sel) { const [x0, y0] = toScreen(S.sel.bb[0], S.sel.bb[1]), [x1, y1] = toScreen(S.sel.bb[2], S.sel.bb[3]); sel = [cv.left + x0, cv.top + y0, cv.left + x1, cv.top + y1]; }
    const barVis = !sb.classList.contains('hidden'), hit = barVis && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
    return { vis, rows, on, box: [r.left, r.top, r.right, r.bottom].map(Math.round), sel: sel && sel.map(Math.round), barVis, overlapsBar: hit, ids: S.sel ? [...S.sel.ids] : [], tool: S.tool };
  });

  // ---- Formen zeichnen: Rechteck, Pfeil, dazu Handschrift ----
  const R = await shape('rect', [300, 250], [500, 380]);
  res.afterDraw = await pop();
  check('Gleich nach dem Zeichnen (Formen-Werkzeug): kein Popup', !res.afterDraw.vis && res.afterDraw.ids.join() === R, res.afterDraw);
  const A = await shape('arrow', [760, 320], [980, 260]);
  await p.evaluate(() => { setTool('pen'); S.size.pen = 3; });
  await path_([[300, 600], [340, 590], [380, 615], [430, 595], [470, 610]]);
  const H = await p.evaluate(() => S.items.at(-1).id);

  // ---- Lasso: Rechteck antippen ----
  await p.evaluate(() => setTool('lasso'));
  await tap(300, 315);
  res.rect = await pop();
  check('Lasso-Tipp aufs Rechteck: Popup mit allen vier Zeilen, aktueller Stil markiert', res.rect.vis && res.rect.ids.join() === R && res.rect.rows.join() === 'ds,rnd,sl,fs'
    && res.rect.on.ds === 'solid' && res.rect.on.rnd === '0' && res.rect.on.sl === '0' && res.rect.on.fs === 'none', res.rect);
  check('Popup rechts neben der Auswahl (Griffe frei), verdeckt die Auswahlleiste nicht', res.rect.box[0] >= res.rect.sel[2] + 20 && !res.rect.overlapsBar && res.rect.barVis, res.rect);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'shapepop_light.png'), clip: { x: 260, y: 150, width: 560, height: 300 } });

  // ---- Stil ändern: je ein Schritt, nur die Form, Auswahl bleibt ----
  const steps0 = await p.evaluate(() => S.undo.length);
  for (const [g, v] of [['sl', '2'], ['rnd', '1'], ['ds', 'dash'], ['fs', 'hachure']]) await p.click(`#shapePop button[data-${g}="${v}"]`);
  res.styled = { item: await item(R), pop: await pop(), steps: (await p.evaluate(() => S.undo.length)) - steps0, def: await p.evaluate(() => ({ ...S.shapeStyle, stored: localStorage.getItem('notizen.shapeStyle') })) };
  const it = res.styled.item;
  check('Skizzenhaft, rund, gestrichelt, schraffiert: gilt für das Rechteck, je ein Schritt', it.sl === 2 && it.rnd === 1 && it.ds === 'dash' && it.fs === 'hachure' && res.styled.steps === 4, res.styled);
  check('Popup bleibt und zeigt den neuen Stil, Auswahl bleibt', res.styled.pop.vis && res.styled.pop.ids.join() === R && res.styled.pop.on.sl === '2' && res.styled.pop.on.rnd === '1' && res.styled.pop.on.ds === 'dash' && res.styled.pop.on.fs === 'hachure', res.styled.pop);
  check('Der Stil für neue Formen bleibt unverändert', res.styled.def.ds === 'solid' && res.styled.def.rnd === 0 && res.styled.def.sl === 0 && res.styled.def.fs === 'none' && JSON.parse(res.styled.def.stored).sl === 0, res.styled.def);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'shapepop_styled.png'), clip: { x: 260, y: 150, width: 560, height: 300 } });
  await p.evaluate(() => undo()); await frames();
  res.undo = { item: await item(R), pop: await pop() };
  check('Rückgängig: Füllung wieder weg, Popup zeigt es, Auswahl bleibt', res.undo.item.fs === 'none' && res.undo.item.ds === 'dash' && res.undo.pop.vis && res.undo.pop.on.fs === 'none' && res.undo.pop.ids.join() === R, res.undo);

  // ---- Pfeil: nur Kontur und Sauberkeit ----
  await p.evaluate(() => clearSel()); await tap(870, 290);
  res.arrow = await pop();
  check('Pfeil: Popup nur mit Kontur und Sauberkeit', res.arrow.vis && res.arrow.ids.join() === A && res.arrow.rows.join() === 'ds,sl', res.arrow);
  await p.click('#shapePop button[data-sl="1"]');
  check('Pfeil: leicht von Hand', (await item(A)).sl === 1, await item(A));

  // ---- gemischte Auswahl (Form und Handschrift): kein Popup ----
  await p.evaluate(() => clearSel());
  await path_([[250, 200], [560, 200], [560, 660], [250, 660], [250, 205]]);
  res.mixed = await pop();
  check('Form und Handschrift zusammen: kein Popup, Auswahlleiste schon', !res.mixed.vis && res.mixed.ids.length === 2 && res.mixed.ids.includes(H) && res.mixed.barVis, res.mixed);

  // ---- zwei Formen: gemeinsamer Wert markiert, Änderung für beide ----
  await p.evaluate(() => clearSel());
  const R2 = await shape('rect', [300, 430], [460, 520]);
  await p.evaluate(() => setTool('lasso'));
  await path_([[250, 200], [560, 200], [560, 560], [250, 560], [250, 205]]);
  res.two = await pop();
  check('Zwei Rechtecke: Popup, verschiedene Kontur ohne Markierung, gleiche Füllung markiert', res.two.vis && res.two.ids.length === 2 && res.two.on.ds === null && res.two.on.fs === 'none', res.two);
  await p.click('#shapePop button[data-ds="dot"]');
  res.twoDot = [await item(R), await item(R2)];
  check('Gepunktet gilt für beide', res.twoDot.every(q => q.ds === 'dot'), res.twoDot);

  // ---- verschieben: Popup weg, danach am neuen Ort ----
  const before = (await pop()).box;
  await path_([[380, 300], [440, 330], [520, 360]], false);
  res.moving = await pop();
  await pen('mouseReleased', 520, 360); await frames(); await p.waitForTimeout(150);
  res.moved = await pop();
  check('Beim Verschieben verschwindet das Popup, danach ist es am neuen Ort', !res.moving.vis && res.moved.vis && res.moved.box[0] - before[0] > 100 && !!res.moved.sel && res.moved.box[0] >= res.moved.sel[2] + 20, { moving: res.moving, before, moved: res.moved });

  // ---- Werkzeug wechseln / Esc: weg ----
  await p.keyboard.press('Escape'); await frames();
  res.esc = await pop();
  check('Esc: Auswahl und Popup weg', !res.esc.vis && !res.esc.ids.length, res.esc);

  // ---- am rechten Rand: Popup links neben der Auswahl; dicht unter der Leiste: Auswahlleiste darunter, Popup unten bündig ----
  const RE = await shape('rect', [1250, 600], [1420, 700]);
  await p.evaluate(() => setTool('lasso')); await tap(1250, 650);
  res.edge = await pop();
  check('Am rechten Rand: Popup links neben der Auswahl', res.edge.vis && res.edge.ids.join() === RE && res.edge.box[2] <= res.edge.sel[0] - 20 && !res.edge.overlapsBar, res.edge);
  await p.evaluate(() => clearSel());
  const RT = await shape('rect', [1160, 165], [1000, 100]);   // von unten rechts: oben liegt die Formenleiste
  await p.evaluate(() => setTool('lasso')); await tap(1000, 132);
  res.top = { ...(await pop()), barTop: await p.evaluate(() => Math.round($('#selbar').getBoundingClientRect().top)) };
  check('Dicht unter der Leiste: Auswahlleiste darunter, Popup verdeckt sie nicht', res.top.vis && res.top.ids.join() === RT && res.top.barTop >= res.top.sel[3] && !res.top.overlapsBar && res.top.box[0] >= res.top.sel[2] + 20, res.top);
  await p.evaluate(() => clearSel());

  // ---- dunkel ----
  await p.evaluate(() => { S.dark = true; applyDark(); setTool('lasso'); });
  const [lx, ly] = await p.evaluate(id => { const s = shOf(S.items.find(i => i.id === id)); return [Math.min(s.a[0], s.b[0]), (s.a[1] + s.b[1]) / 2]; }, R);
  await tap(lx, ly);   // linke Kante des verschobenen Rechtecks
  res.dark = await pop();
  check('Dunkel: Popup da', res.dark.vis, res.dark);
  if (SHOTS) {
    const r = res.dark;
    await p.screenshot({ path: path.join(SHOTS, 'shapepop_dark.png'), clip: { x: Math.max(0, r.sel[0] - 40), y: Math.max(0, Math.min(r.sel[1], r.box[1]) - 70), width: 620, height: 360 } });
    for (const t of ['hl', 'tape']) {
      await p.evaluate(t => setTool(t), t); await frames();
      const q = await p.evaluate(() => { const r = $('#sizes').getBoundingClientRect(); return { x: r.left - 10, y: r.top - 4, width: r.width + 70, height: r.height + 8 }; });
      await p.screenshot({ path: path.join(SHOTS, 'strip_dark_' + t + '.png'), clip: q });
      await p.evaluate(() => { S.dark = false; applyDark(); }); await frames();
      await p.screenshot({ path: path.join(SHOTS, 'strip_light_' + t + '.png'), clip: q });
      await p.evaluate(() => { S.dark = true; applyDark(); });
    }
  }

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
