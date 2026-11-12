// Stil der Formen (wie bei Excalidraw): Kontur durchgezogen, gestrichelt oder gepunktet; Kanten eckig oder rund;
// Sauberkeit exakt, leicht von Hand oder skizzenhaft. Menü, gespeicherte Wahl, Pixel auf der Seite, Pfeile behalten die
// gefüllte Spitze, Koordinatensysteme bleiben genau, eigene Formen und Sicherung, Vorschaubild, Speichern der Seite.
// node tests/shapestyle.js [Notizen.html]
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
    const now = Date.now(), n = { id: uid(), name: 'Stil', created: now, updated: now, thumb: null, bg: 'blank', view: { tx: 0, ty: 0, z: 1 } };
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
  // Form mit dem Stift ziehen, Stil vorher setzen
  const shape = async (k, st, a, c, w = 3) => {
    await p.evaluate(([k, st, w]) => { S.shapeStyle = { ds: 'solid', rnd: 0, sl: 0, ...st }; S.shape = k; setTool('shape'); S.size.pen = w; }, [k, st, w]);
    await drag(a[0], a[1], c[0], c[1]);
    return p.evaluate(() => { const s = S.items.at(-1); return { id: s.id, k: s.k, ds: s.ds, n: s.pts.length / 3, fl: s.fl, valid: validFl(s.fl, s.pts.length / 3), pts: Array.from(s.pts) }; });
  };
  // Grauwerte der Seite (Hauptebene) entlang einer Strecke, ein Wert je Welteinheit; Läufe von Tinte und Papier
  const scan = (x0, y0, x1, y1) => p.evaluate(([x0, y0, x1, y1]) => {
    const g = cvMain.getContext("2d"), n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0))), out = [];
    for (let i = 0; i <= n; i++) { const d = g.getImageData(Math.round((x0 + (x1 - x0) * i / n + PADC) * DPR), Math.round((y0 + (y1 - y0) * i / n + PADC) * DPR), 1, 1).data; out.push(Math.round((d[0] + d[1] + d[2]) / 3)); }
    return out;
  }, [x0, y0, x1, y1]);
  const runs = v => { const r = []; let cur = null; for (const g of v) { const ink = g < 140; if (!cur || cur.ink !== ink) r.push(cur = { ink, n: 0 }); cur.n++; } return r; };
  const summary = v => { const r = runs(v), ink = r.filter(x => x.ink), paper = r.filter(x => !x.ink); return { ink: ink.length, paper: paper.length, maxInk: Math.max(0, ...ink.map(x => x.n)), maxPaper: Math.max(0, ...paper.map(x => x.n)) }; };
  const px = async (x, y) => (await scan(x, y, x, y))[0];

  // ---- Formenleiste: Stil ----
  await p.evaluate(() => { setShape('rect'); setTool('shape'); });
  await p.waitForTimeout(450);
  const menu = await p.evaluate(() => {
    const sb = $('#shapeBar').getBoundingClientRect(), st = $('#shStyle').getBoundingClientRect();
    return { visible: !$('#shapeBar').classList.contains('hidden'), groups: $$('#shStyle .shgrp').map(g => g.getAttribute('aria-label')), btns: $$('#shStyle button').length, on: $$('#shStyle button.on').map(b => b.title),
      rows: new Set($$('#shStyle button').map(b => Math.round(b.getBoundingClientRect().top))).size, fits: st.left >= sb.left && st.right <= sb.right && sb.left >= 0 && sb.right <= innerWidth,
      shapes: $$('#shapeBar [data-shape]').length, labels: $$('#shStyle button').every(b => b.title && b.getAttribute('aria-label')) };
  });
  check('Formenleiste: Stil mit Kontur, Kanten und Sauberkeit, acht Knöpfe in einer Reihe; Vorgabe durchgezogen, eckig, exakt',
    menu.visible && menu.groups.join() === 'Kontur,Kanten,Sauberkeit' && menu.btns === 8 && menu.rows === 1 && menu.fits && menu.labels && menu.on.join() === 'Durchgezogen,Eckig,Exakt' && menu.shapes === 11, menu);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'shapestyle_menu.png'), clip: { x: 0, y: 0, width: 1440, height: 140 } });
  await p.click('#shStyle [data-ds="dash"]');
  const clicked = await p.evaluate(() => ({ st: { ...S.shapeStyle }, saved: JSON.parse(localStorage.getItem('notizen.shapeStyle')), open: !$('#shapeBar').classList.contains('hidden'), on: $$('#shStyle button.on').map(b => b.title) }));
  check('Antippen: gewählt und gespeichert, die Leiste bleibt', clicked.st.ds === 'dash' && clicked.saved.ds === 'dash' && clicked.open && clicked.on.join() === 'Gestrichelt,Eckig,Exakt', clicked);
  await p.evaluate(() => setShape('axes2'));
  await p.click('#shStyle [data-ds="solid"]');
  const fromGraph = await p.evaluate(() => ({ shape: S.shape, on: $$('#shapeBar [data-shape].on').map(b => b.dataset.shape) }));
  check('Stil antippen bei gewähltem Koordinatensystem: weiter mit dem Rechteck', fromGraph.shape === 'rect' && fromGraph.on.join() === 'rect', fromGraph);
  await p.evaluate(() => closeMenus()); await p.waitForTimeout(200);

  // ---- Kontur ----
  const solid = await shape('rect', {}, [200, 150], [500, 300]);
  const dash = await shape('rect', { ds: 'dash' }, [200, 400], [500, 550]);
  const dot = await shape('rect', { ds: 'dot' }, [600, 150], [900, 300]);
  await p.waitForTimeout(250);
  res.edges = { solid: summary(await scan(215, 150, 485, 150)), dash: summary(await scan(215, 400, 485, 400)), dot: summary(await scan(615, 150, 885, 150)),
    dashSide: summary(await scan(500, 412, 500, 538)) };
  check('Durchgezogen: Kante ohne Lücke, am Strich kein ds', !solid.ds && res.edges.solid.ink === 1 && res.edges.solid.paper === 0, { ds: solid.ds, e: res.edges.solid });
  check('Gestrichelt: Striche mit Lücken, auch an der Seite (ds am Strich)', dash.ds === 'dash' && res.edges.dash.ink >= 12 && res.edges.dash.maxInk >= 8 && res.edges.dash.maxInk <= 20 && res.edges.dash.paper >= 11 && res.edges.dashSide.ink >= 5, { ds: dash.ds, e: res.edges.dash, side: res.edges.dashSide });
  check('Gepunktet: kurze Punkte in gleichmäßigem Abstand', dot.ds === 'dot' && res.edges.dot.ink >= 20 && res.edges.dot.maxInk <= 7 && res.edges.dot.paper >= 19, { ds: dot.ds, e: res.edges.dot });
  // geschlossene Form: das Muster geht auf (keine doppelt langen Striche, keine großen Lücken am Anfang)
  const even = await p.evaluate(id => {
    // Rechteck (600, 150)–(900, 300): obere Kante 300 lang, Abstand ≈ 8,7 → etwa 35 Punkte von Ecke zu Ecke
    const s = S.items.find(i => i.id === id), P = buildPath(s.pts, s.w, false, null, 'dot'), c = document.createElement('canvas'); c.width = 400; c.height = 220;
    const g = c.getContext('2d'); g.translate(-550, -100); g.fill(P);   // Welt x 550–950, y 100–320
    const d = g.getImageData(0, 0, 400, 220).data; let dots = 0, inside = false;
    for (let x = 0; x < 400; x++) { const on = d[(50 * 400 + x) * 4 + 3] > 128; if (on && !inside) dots++; inside = on; }   // Zeile y = 150
    const corner = d[(50 * 400 + 50) * 4 + 3] > 128 && d[(50 * 400 + 350) * 4 + 3] > 128;   // Punkte genau in den Ecken (600 | 150), (900 | 150)
    return { dots, corner };
  }, dot.id);
  check('Gepunktet: Punkte bis in die Ecken, gleich viele je Länge', even.dots >= 32 && even.dots <= 38 && even.corner, even);
  // gestrichelt: an jeder Ecke ein Winkel (zwei halbe Striche), Ellipse gleichmäßig
  res.dashCorners = [await px(200, 400), await px(500, 400), await px(500, 550), await px(200, 550)];
  check('Gestrichelt: Winkel in allen vier Ecken', res.dashCorners.every(g => g < 120), res.dashCorners);

  // ---- Kanten ----
  const round = await shape('rect', { rnd: 1 }, [600, 400], [900, 550]);
  await p.waitForTimeout(250);
  res.corner = { sharp: await px(200, 150), roundCorner: await px(600, 400), roundArc: await px(606, 406), roundEdge: await px(750, 400), roundSide: await px(900, 475) };
  check('Rund: Ecke frei, Bogen und Kanten gezeichnet; eckig: Ecke gezeichnet', round.n > 20 && res.corner.sharp < 120 && res.corner.roundCorner > 200 && res.corner.roundArc < 140 && res.corner.roundEdge < 120 && res.corner.roundSide < 120, res.corner);

  // ---- Sauberkeit ----
  const geo = await p.evaluate(() => {
    const box = [200, 650, 500, 800], base = shapeLines('rect', 200, 650, 500, 800, 3);
    const run = (sl, seed, rnd = 0) => styledLines('rect', base, { rnd, sl, seed, w: 3 }, box)[0];
    // Abstand eines Punkts zum genauen Rechteck
    const dist = (x, y) => { const dx = Math.max(200 - x, 0, x - 500), dy = Math.max(650 - y, 0, y - 800); const inX = x >= 200 && x <= 500, inY = y >= 650 && y <= 800; return inX && inY ? Math.min(x - 200, 500 - x, y - 650, 800 - y) : Math.hypot(dx, dy); };
    const dev = xy => { let mx = 0, sum = 0; for (let i = 0; i < xy.length; i += 2) { const d = dist(xy[i], xy[i + 1]); mx = Math.max(mx, d); sum += d; } return { max: +mx.toFixed(2), mean: +(sum / (xy.length / 2)).toFixed(2) }; };
    // wie oft der Linienzug die senkrechte Mitte x = 350 kreuzt (oben und unten je einmal = 2)
    const cross = xy => { let k = 0; for (let i = 2; i < xy.length; i += 2) if ((xy[i - 2] - 350) * (xy[i] - 350) < 0) k++; return k; };
    const a = run(1, 42), a2 = run(1, 42), bb = run(1, 43), s2 = run(2, 42), r1 = run(1, 42, 1);
    return { exact: run(0, 42) === base[0], same: JSON.stringify(a) === JSON.stringify(a2), other: JSON.stringify(a) !== JSON.stringify(bb),
      dev1: dev(a), dev2: dev(s2), cross0: cross(base[0]), cross1: cross(a), cross2: cross(s2), roundRough: dev(r1) };
  });
  check('Exakt: Punkte unverändert', geo.exact && geo.cross0 === 2, geo);
  check('Leicht von Hand: kleine Abweichung (höchstens ein paar Einheiten), gleicher Startwert gleiches Bild, anderer Startwert anders',
    geo.same && geo.other && geo.dev1.max > 0.5 && geo.dev1.max < 7 && geo.dev1.mean < 2.5 && geo.cross1 === 2, geo);
  check('Skizzenhaft: zwei Durchgänge (jede Kante doppelt), etwas stärker', geo.cross2 === 4 && geo.dev2.max > geo.dev1.max && geo.dev2.max < 16, geo);
  check('Rund und von Hand zusammen bleiben nah an der Form', geo.roundRough.max < 30, geo.roundRough);
  const s1 = await shape('rect', { sl: 1 }, [200, 650], [500, 800]), s1b = await shape('rect', { sl: 1 }, [200, 650], [500, 800]);
  check('Zwei gleich gezogene Formen wackeln verschieden (Startwert je Form)', JSON.stringify(s1.pts) !== JSON.stringify(s1b.pts), { n1: s1.n, n2: s1b.n });
  await p.evaluate(ids => { commit(S.items.filter(i => !ids.includes(i.id))); }, [s1.id, s1b.id]);

  // ---- Pfeile: Spitze bleibt gefüllt ----
  const ad = await shape('arrow', { ds: 'dash' }, [1000, 200], [1350, 200]);
  const as = await shape('arrow2', { ds: 'dash', sl: 2 }, [1000, 350], [1350, 350]);
  const ap = await shape('arrow', { ds: 'dot', sl: 1 }, [1000, 450], [1350, 450]);
  await p.waitForTimeout(250);
  res.arrows = { dashShaft: summary(await scan(1010, 200, 1300, 200)), dashHead: await px(1342, 200), sketchHeadB: await px(1342, 350), sketchHeadA: await px(1008, 350), dotHead: await px(1342, 450) };
  check('Pfeil gestrichelt: Schaft mit Lücken, Spitze gefüllt', ad.ds === 'dash' && ad.valid && res.arrows.dashShaft.ink >= 10 && res.arrows.dashHead < 100, { fl: ad.fl, r: res.arrows });
  check('Doppelpfeil skizzenhaft: beide Spitzen gefüllt, Schaft doppelt', as.valid && as.fl.length === 2 && res.arrows.sketchHeadA < 100 && res.arrows.sketchHeadB < 100 && as.n > 30, { n: as.n, fl: as.fl, r: res.arrows });
  check('Pfeil gepunktet und von Hand: Spitze gefüllt', ap.ds === 'dot' && ap.valid && res.arrows.dotHead < 100, { fl: ap.fl, r: res.arrows });

  // ---- Koordinatensystem und Linie ----
  const gx = await shape('axes2', { ds: 'dash', rnd: 1, sl: 2 }, [1000, 550], [1350, 850]);
  const gStyled = await p.evaluate(g => S.items.filter(i => i.g === g).map(i => ({ ds: i.ds, pts: Array.from(i.pts) })), (await p.evaluate(id => S.items.find(i => i.id === id).g, gx.id)));
  await p.evaluate(ids => { commit(S.items.filter(i => !ids.includes(i.id))); }, await p.evaluate(id => { const g = S.items.find(i => i.id === id).g; return S.items.filter(i => i.g === g).map(i => i.id); }, gx.id));
  const gp = await shape('axes2', {}, [1000, 550], [1350, 850]);
  const gPlain = await p.evaluate(id => { const g = S.items.find(i => i.id === id).g; return S.items.filter(i => i.g === g).map(i => ({ ds: i.ds, pts: Array.from(i.pts) })); }, gp.id);
  check('Koordinatensystem: Stil gilt nicht, genau wie ohne Stil', gStyled.length === gPlain.length && gStyled.every(s => !s.ds) && JSON.stringify(gStyled.map(s => s.pts)) === JSON.stringify(gPlain.map(s => s.pts)), { n: gStyled.length, ds: gStyled.map(s => s.ds) });
  const ln = await shape('line', { ds: 'dot', rnd: 1 }, [200, 870], [500, 870]);
  check('Linie: rund ändert nichts, gepunktet schon', ln.ds === 'dot' && ln.n === 2, { n: ln.n, ds: ln.ds });

  // ---- eigene Form und Sicherung behalten die Kontur ----
  const cust = await p.evaluate(id => {
    const s = S.items.find(i => i.id === id), [x0, y0] = geoBox([s]);
    const pts = new Float32Array(s.pts); for (let i = 0; i < pts.length; i += 3) { pts[i] -= x0; pts[i + 1] -= y0; }
    const back = shapeFromBackup(JSON.parse(JSON.stringify({ id: 'x1', name: 'Kasten', strokes: [{ c: s.c, w: s.w, hl: false, pts: Array.from(pts), ds: s.ds }] })));
    const placed = stampStrokes(back, 1, 600, 600, uid());
    const bad = shapeFromBackup({ id: 'x2', name: 'kaputt', strokes: [{ c: 'ink', w: 2, pts: [0, 0, 0.5, 10, 0, 0.5], ds: 'wellig' }] });
    const th = customThumb({ ...back, id: 'x1', w: 300, h: 150 });
    return { back: back && back.strokes[0].ds, placed: placed[0].ds, bad: bad && bad.strokes[0].ds === undefined, thumb: th.width > 0 };
  }, dash.id);
  check('Eigene Form, Sicherung und Vorschau behalten „gestrichelt“, Unsinn fällt weg', cust.back === 'dash' && cust.placed === 'dash' && cust.bad && cust.thumb, cust);

  // ---- Vorschaubild (einfache Linien) zeigt die Lücken ----
  res.thumb = await p.evaluate(async id => {
    const s = S.items.find(i => i.id === id), c = await renderTo([s], [190, 390, 510, 560], 2, 'blank', { cheap: true, light: true }), g = c.getContext('2d');
    let ink = 0, paper = 0; for (let x = 30; x < 590; x++) { const d = g.getImageData(x, 20, 1, 1).data; if ((d[0] + d[1] + d[2]) / 3 < 140) ink++; else paper++; }   // Welt y = 400
    return { ink, paper };
  }, dash.id);
  check('Vorschaubild: gestrichelte Kante mit Lücken', res.thumb.ink > 150 && res.thumb.paper > 80, res.thumb);

  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'shapestyle_page.png') });

  // ---- Speichern: Seite und Wahl überstehen das Neuladen ----
  await p.evaluate(() => { setShape('rect'); setTool('shape'); });
  await p.waitForTimeout(450);
  for (const sel of ['[data-ds="dot"]', '[data-rnd="1"]', '[data-sl="2"]']) await p.click('#shStyle ' + sel);
  await p.evaluate(async () => { await window.__flush(); });
  await p.reload(); await p.waitForTimeout(500);
  const after = await p.evaluate(async ids => {
    const st = { ...S.shapeStyle }, m = (await dbIndexAll()).find(x => x.name === 'Stil'); await openNote(m);
    setTool('shape'); await new Promise(r => setTimeout(r, 450));
    const on = $$('#shStyle button.on').map(b => b.title);
    return { st, on, ds: ids.map(id => (S.items.find(i => i.id === id) || {}).ds) };
  }, [solid.id, dash.id, dot.id, ad.id]);
  check('Neu geladen: Wahl gespeichert (gepunktet, rund, skizzenhaft), Striche behalten ihre Kontur',
    after.st.ds === 'dot' && after.st.rnd === 1 && after.st.sl === 2 && after.on.join() === 'Gepunktet,Rund,Skizzenhaft' && JSON.stringify(after.ds) === JSON.stringify([undefined, 'dash', 'dot', 'dash']), after);
  const junk = await p.evaluate(async () => { localStorage.setItem('notizen.shapeStyle', JSON.stringify({ ds: 'wellig', rnd: 5, sl: 'x' })); return true; });
  await p.reload(); await p.waitForTimeout(400);
  const fixed = await p.evaluate(() => ({ ...S.shapeStyle }));
  check('Kaputte gespeicherte Wahl: Vorgabe', junk && fixed.ds === 'solid' && fixed.rnd === 0 && fixed.sl === 0, fixed);

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
