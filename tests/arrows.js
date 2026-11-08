// Pfeile mit gefüllter Speerspitze (nach einer Vorlage): Fläche gefüllt, Spitze spitz, halb durchsichtig ohne dunklere
// Stelle, Radierer an der Spitze, eigene Form und Sicherung behalten die Fläche, Vorschaubild, alte Pfeile unverändert.
// node tests/arrows.js [Notizen.html]
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
    const now = Date.now(), n = { id: uid(), name: 'Pfeile', created: now, updated: now, thumb: null, bg: 'blank', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  });
  await p.waitForTimeout(300);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.8 });
  async function drag(x0, y0, x1, y1) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' });
    await pen('mousePressed', x0, y0);
    for (let k = 1; k <= 10; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / 10, y0 + (y1 - y0) * k / 10);
    await pen('mouseReleased', x1, y1); await frames();
  }
  const shape = async (k, w, a, c) => { await p.evaluate(([k, w]) => { S.shape = k; setTool('shape'); S.size.pen = w; }, [k, w]); await drag(a[0], a[1], c[0], c[1]); return p.evaluate(() => { const s = S.items.at(-1); return { id: s.id, fl: s.fl, n: s.pts.length / 3, pts: Array.from(s.pts) }; }); };
  // Grauwert der Seite (Hauptebene) an einem Bildschirmpunkt
  const px = (x, y) => p.evaluate(([x, y]) => { const d = cvMain.getContext('2d').getImageData(Math.round((x + PADC) * DPR), Math.round((y + PADC) * DPR), 1, 1).data; return Math.round((d[0] + d[1] + d[2]) / 3); }, [x, y]);

  // dicker Pfeil waagrecht: Länge der Spitze 10 + 4 · 8 = 42, halbe Breite 0,42 · 42 ≈ 17,6, Kerbe 0,12 · 42 ≈ 5
  const a = await shape('arrow', 8, [200, 200], [600, 200]);
  check('Pfeil: Anfang und gefüllte Spitze (fl) im Strich', JSON.stringify(a.fl) === '[[1,11]]' && a.n === 12 && a.pts[18] === 600 && a.pts[19] === 200, a);
  res.px = { inHead: await px(585, 200), headEdge: await px(568, 212), outsideCorner: await px(555, 200 + 17.6 + 6), beforeTip: await px(605, 200), shaft: await px(400, 200), paper: await px(400, 240) };
  check('Spitze gefüllt, spitz (kein runder Strich darum), daneben Papier', res.px.inHead < 60 && res.px.headEdge < 90 && res.px.beforeTip > 200 && res.px.outsideCorner > 200 && res.px.shaft < 60 && res.px.paper > 200, res.px);
  // halb durchsichtig: Schaft, Kerbe und Spitze gleich hell (ein Pfad, keine doppelte Deckung, keine Löcher)
  await p.evaluate(id => { commit(S.items.map(it => it.id === id ? { ...it, al: 0.5 } : it)); }, a.id); await frames(); await p.waitForTimeout(200);
  res.half = { shaft: await px(450, 200), notch: await px(560, 200), head: await px(585, 200), nearTip: await px(594, 200) };
  check('Halb durchsichtig: Schaft und Spitze gleich, auch wo der Schaft in die Spitze geht', Math.max(...Object.values(res.half)) - Math.min(...Object.values(res.half)) <= 3 && res.half.shaft > 90 && res.half.shaft < 170, res.half);
  // Doppelpfeil: zwei Flächen, Schaft von Kerbe zu Kerbe
  const d = await shape('arrow2', 4, [200, 320], [600, 320]);
  res.px2 = { left: await px(212, 320), right: await px(588, 320), mid: await px(400, 320) };
  check('Doppelpfeil: zwei gefüllte Spitzen', JSON.stringify(d.fl) === '[[0,10],[11,21]]' && d.n === 22 && res.px2.left < 70 && res.px2.right < 70 && res.px2.mid < 90, { fl: d.fl, px: res.px2 });
  // Radierer an der Spitze nimmt den ganzen Pfeil
  { const n0 = await p.evaluate(() => S.items.length);
    await p.evaluate(() => setTool('eraser')); await drag(588, 320, 590, 322);
    const gone = await p.evaluate(id => !S.items.some(i => i.id === id), d.id);
    check('Radierer an der Spitze löscht den Pfeil', gone && (await p.evaluate(() => S.items.length)) === n0 - 1); }
  // eigene Form aus einem Pfeil: Fläche bleibt (auch nach Sicherung und Wiederherstellung)
  {
    const e = await shape('arrow', 3, [200, 450], [420, 450]);
    const r = await p.evaluate(async id => {
      setTool('lasso'); setSel(new Set([id]));
      const strokes = S.items.filter(it => S.sel.ids.has(it.id)), [x0, y0] = geoBox(strokes);
      // wie saveCustomShape, ohne Dialog
      const list = strokes.map(s => { const pts = new Float32Array(s.pts); for (let i = 0; i < pts.length; i += 3) { pts[i] -= x0; pts[i + 1] -= y0; } const st = { c: s.c, w: s.w, hl: !!s.hl, pts }; if (s.fl) st.fl = s.fl.map(q => [q[0], q[1]]); return st; });
      const back = shapeFromBackup(JSON.parse(JSON.stringify({ id: 'x1', name: 'Pfeil', strokes: list.map(st => ({ ...st, pts: Array.from(st.pts) })) })));
      const placed = stampStrokes(back, 1, 600, 600, uid());
      const bad = shapeFromBackup({ id: 'x2', name: 'kaputt', strokes: [{ c: 'ink', w: 2, pts: [0, 0, 0.5, 10, 0, 0.5], fl: [[0, 9]] }] });
      return { fl: back && back.strokes[0].fl, placed: placed[0].fl, badFl: bad && bad.strokes[0].fl === undefined };
    }, e.id);
    check('Eigene Form und Sicherung behalten die Fläche, kaputte Angaben fallen weg', JSON.stringify(r.fl) === '[[1,11]]' && JSON.stringify(r.placed) === '[[1,11]]' && r.badFl, r);
    await p.evaluate(() => clearSel());
  }
  // Vorschaubild (einfache Linien) füllt die Spitze auch
  res.thumb = await p.evaluate(async () => {
    const s = S.items.find(it => it.k === 'arrow' && it.w === 8);
    const c = await renderTo([s], [520, 160, 640, 240], 2, 'blank', { cheap: true, light: true }), d = c.getContext('2d').getImageData(130, 80, 1, 1).data;   // Welt (585, 200)
    return Math.round((d[0] + d[1] + d[2]) / 3);
  });
  check('Vorschaubild: Spitze gefüllt', res.thumb < 140, res.thumb);
  // alter Pfeil (offene Spitze ohne fl) bleibt, wie er war: innen nicht gefüllt
  await p.evaluate(() => {
    const C = Math.cos(27 * Math.PI / 180), Sn = Math.sin(27 * Math.PI / 180), h = 30;
    const xy = [200, 650, 600, 650, 600 - h * C, 650 - h * Sn, 600, 650, 600 - h * C, 650 + h * Sn];
    const pts = new Float32Array(15); for (let i = 0; i < 5; i++) { pts[i * 3] = xy[i * 2]; pts[i * 3 + 1] = xy[i * 2 + 1]; pts[i * 3 + 2] = 0.5; }
    commit(appendItems(S.items, [{ t: 's', id: uid(), c: 'ink', w: 2, hl: false, pts, bb: bboxOf(pts, 2), k: 'arrow' }]));
  });
  await frames(); await p.waitForTimeout(200);
  res.old = { inside: await px(585, 650 + 4), wing: await px(600 - 15 * Math.cos(27 * Math.PI / 180), 650 - 15 * Math.sin(27 * Math.PI / 180)) };
  check('Alter Pfeil mit offener Spitze unverändert (innen leer)', res.old.inside > 200 && res.old.wing < 120, res.old);

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
