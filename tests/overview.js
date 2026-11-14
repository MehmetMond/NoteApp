// Unscharfe Übersicht beim Rauszoomen: wo noch keine Kachel gezeichnet ist, zeigt die Seite die Übersicht statt leerem
// Papier. Aufbau schnell; beim Schreiben nur ergänzt (dieselbe Leinwand), nach Radieren erst nach kurzer Ruhe neu;
// eine andere Seite zeigt nie die Übersicht der vorigen.
// node tests/overview.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  // Mitschrift: 4000 Striche Handschrift, Kästen, breite Textmarker-Linien (bis Welt-y ≈ 2960)
  res.page = await p.evaluate(async () => {
    const now = Date.now(), n = { id: uid(), name: 'Mitschrift', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, list = [];
    for (let k = 0; k < 4000; k++) {
      const line = Math.floor(k / 80), x0 = 60 + (k % 80) * 15.5 + rnd() * 4, y0 = 80 + line * 34 + Math.floor(line / 8) * 40, m = 12 + Math.floor(rnd() * 18), pts = [];
      for (let q = 0; q < m; q++) { const a = q / m * Math.PI * (1.5 + rnd()); pts.push(x0 + Math.cos(a) * 6 + q * 0.5, y0 + Math.sin(a) * 8, 0.5); }
      list.push(makeStroke(pts, 'ink', 2, false));
    }
    for (let q = 0; q < 20; q++) { const y = 92 + q * 150; list.push(makeStroke([60, y, .5, 900, y, .5], '#fdd835', 18, true)); }
    commit(appendItems([], list)); setView(0, 0, 1, true);
    return { strokes: list.length, box: contentBox().map(Math.round) };
  });
  await p.waitForTimeout(1500);   // Kacheln fertig, Übersicht im Leerlauf aufgebaut
  res.built = await p.evaluate(() => ov && { w: ov.c.width, h: ov.c.height, upToDate: ov.items === S.items });
  check('Übersicht nach dem Öffnen im Leerlauf aufgebaut, höchstens 3 Mpx und 8192 px je Seite', res.built && res.built.upToDate && res.built.w * res.built.h <= 3e6 + res.built.w + res.built.h + 1 && Math.max(res.built.w, res.built.h) <= 8192, res.built);
  res.buildMs = await p.evaluate(() => { const t = []; for (let r = 0; r < 3; r++) { const t0 = performance.now(); dropOverview(); buildOverview({ timeRemaining: () => 1e9 }); t.push(performance.now() - t0); } return +Math.min(...t).toFixed(1); });
  check('Aufbau schnell (4000 Striche)', res.buildMs < 60, res.buildMs);
  // der Augenblick nach dem Rauszoomen: neue Kacheln angehalten, auf 35 % wie mit dem Mausrad
  const px = (x, y) => p.evaluate(([x, y]) => { const d = cvMain.getContext('2d').getImageData(Math.round((x + PADC) * DPR), Math.round((y + PADC) * DPR), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
  await p.evaluate(() => { window.__rt = renderTile; renderTile = () => null; zoomAt(VW / 2, VH / 2, 0.35, false); });
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Textmarker-Linie bei Welt-y 1592 (weit unter dem alten Ausschnitt und seinem Rand), Welt-x 500
  const sx = 720 + (500 - 720) * 0.35, sy = 450 + (1592 - 450) * 0.35;
  res.edge = { marker: await px(sx, sy), paper: await px(sx, sy + 20) };
  await p.evaluate(() => { renderTile = window.__rt; settleZoom(); requestDraw(); });
  await p.waitForTimeout(700);
  res.sharp = await px(sx, sy);
  check('Direkt nach dem Rauszoomen: am neuen Rand die Übersicht statt Papier', res.edge.marker[2] < 215 && res.edge.paper[2] > 235, res.edge);
  check('Danach die scharfe Kachel an derselben Stelle', res.sharp[2] < 215, res.sharp);
  // Zwei-Finger-Zoom über mehrere Stufen, ohne dass für die Zwischenstufen Kacheln entstehen: Ersatz bleibt die Stufe
  // mit Kacheln (vorher wurde es die leere Zwischenstufe, und der ganze Bildschirm zeigte kurz nur die Übersicht)
  res.fallback = await p.evaluate(() => {
    const L0 = S.level, out = []; renderTile = () => null;
    for (const z of [0.7, 1.4, 2.8]) { zoomAt(VW / 2, VH / 2, z, false); out.push(fallbackL); }
    settleZoom(); out.push(fallbackL); renderTile = window.__rt; requestDraw(); return { L0, out };
  });
  check('Zoomen über mehrere Stufen: Ersatz bleibt die Stufe mit Kacheln', res.fallback.out.every(f => f === res.fallback.L0), res.fallback);
  // Schreiben: nur ergänzt (dieselbe Leinwand); Radieren: erst nach kurzer Ruhe neu (neue Leinwand)
  await p.evaluate(() => setView(0, 0, 1, true));
  const cdp = await p.context().newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: .6 });
  await p.evaluate(() => { setTool('pen'); window.__c = ov.c; window.__n = S.items.length; });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 200, pointerType: 'pen' }); await pen('mousePressed', 300, 200);
  for (let k = 1; k <= 10; k++) await pen('mouseMoved', 300 + k * 12, 200 + k * 3); await pen('mouseReleased', 420, 230);
  await p.waitForTimeout(2200);
  res.write = await p.evaluate(() => ({ added: S.items.length - window.__n, sameCanvas: ov.c === window.__c, upToDate: ov.items === S.items }));
  check('Schreiben: Übersicht nur ergänzt', res.write.added === 1 && res.write.sameCanvas && res.write.upToDate, res.write);
  await p.evaluate(() => { const id = S.items.at(-1).id; commit(S.items.filter(i => i.id !== id)); });   // wie Radieren
  await p.waitForTimeout(500);
  const early = await p.evaluate(() => ov.items === S.items);
  await p.waitForTimeout(2200);
  res.erase = await p.evaluate(() => ({ newCanvas: ov.c !== window.__c, upToDate: ov.items === S.items }));
  check('Radieren: erst nach kurzer Ruhe neu aufgebaut', !early && res.erase.newCanvas && res.erase.upToDate, { early, ...res.erase });
  // andere Seite: die Übersicht der vorigen ist weg
  res.other = await p.evaluate(async () => {
    await closeNote(); const gone = ov === null;
    const now = Date.now(), n = { id: uid(), name: 'Leer', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n); await new Promise(r => setTimeout(r, 900));
    return { gone, empty: ov === null };
  });
  check('Andere Seite: keine Übersicht der vorigen, leere Seite ohne Übersicht', res.other.gone && res.other.empty, res.other);
  // lange Notiz (wie 54 PDF-Folien untereinander: 1094 breit, 43 000 hoch): eine Folie war in der Übersicht nur 26 px breit
  res.tall = await p.evaluate(async () => {
    commit(appendItems([], [makeStroke([0, 0, .5, 1094, 0, .5], 'ink', 2, false), makeStroke([0, 43000, .5, 1094, 43000, .5], 'ink', 2, false)]));
    await new Promise(r => setTimeout(r, 1500));
    return ov && { w: ov.c.width, h: ov.c.height, folie: Math.round(1094 * ov.s), upToDate: ov.items === S.items };
  });
  check('Lange Notiz: Übersicht nach Fläche begrenzt, eine Folie über 100 px breit', res.tall && res.tall.upToDate && res.tall.folie > 100 && res.tall.w * res.tall.h <= 3e6 + res.tall.w + res.tall.h + 1, res.tall);
  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
