// Teil A: Formen, Pfeile, Koordinatensysteme, Am Raster ausrichten
// Aufruf: node t3/shapes.js  -> JSON mit "fails": [] und "errors": []
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const DIR = path.resolve(__dirname, '..'), OUT = __dirname;
const ICON = fs.existsSync(DIR + '/electron/icon.png') ? DIR + '/electron/icon.png' : path.join(__dirname, 'icon.png');   // Testbild (t3/mkicon.js), falls kein Electron-Ordner da ist
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500);
  const newNote = (bg = 'dots') => p.evaluate(async bg => {
    if (S.note) await closeNote();
    const now = Date.now(); const n = { id: uid(), name: 'Test', created: now, updated: now, thumb: null, bg, view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  }, bg);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y, mods = 0) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.8, modifiers: mods });
  // Ziehen mit dem Stift von (x0,y0) nach (x1,y1); finish=false lässt den Stift unten
  async function drag(x0, y0, x1, y1, { mods = 0, steps = 8, finish = true } = {}) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen', modifiers: mods });
    await pen('mousePressed', x0, y0, mods);
    for (let k = 1; k <= steps; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps, mods);
    if (finish) { await pen('mouseReleased', x1, y1, mods); await frames(); }
  }
  const shape = async (k, ...args) => { await p.evaluate(k => { S.shape = k; setTool('shape'); }, k); return drag(...args); };
  const last = (n = 1) => p.evaluate(n => S.items.slice(-n).map(s => ({ k: s.k, g: s.g || null, c: s.c, w: s.w, hl: s.hl, pts: Array.from(s.pts) })), n);
  const xy = s => { const r = []; for (let i = 0; i < s.pts.length; i += 3) r.push([s.pts[i], s.pts[i + 1]]); return r; };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  const sameXY = (s, list, e = 0.02) => { const q = xy(s); return q.length === list.length / 2 && q.every((v, i) => near(v[0], list[i * 2], e) && near(v[1], list[i * 2 + 1], e)); };
  const allP = s => xy(s).length && s.pts.every((v, i) => i % 3 !== 2 || v === 0.5);
  const count = () => p.evaluate(() => S.items.length);
  // Pixelvergleich zweier Screenshots
  const cmp = await ctx.newPage(); await cmp.setContent('<body></body>');
  // seam: {x, y} = Geräte-Pixel des Ausschnitts minus Kachelversatz; Unterschiede bis 6 px neben einer Kachelnaht zählen extra
  const diff = (a, c, seam) => cmp.evaluate(async ([a, c, seam]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, max = 0, ink = 0, nAway = 0, maxAway = 0; const hist = {};
    const nearSeam = v => { const m = ((v % 512) + 512) % 512; return Math.min(m, 512 - m) <= 6; };
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] < 160 || Math.abs(da[i] - da[i + 2]) > 40) ink++;
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (!d) continue; n++; if (d > max) max = d; const k = d <= 2 ? '1-2' : d <= 8 ? '3-8' : d <= 32 ? '9-32' : '>32'; hist[k] = (hist[k] || 0) + 1;
      if (seam) { const px = (i / 4) % cv.width, py = Math.floor(i / 4 / cv.width); if (!nearSeam(seam.x + px) && !nearSeam(seam.y + py)) { nAway++; if (d > maxAway) maxAway = d; } }
    }
    return { changedPixels: n, maxDelta: max, inkPixels: ink, hist, ...(seam ? { awayFromSeams: { changedPixels: nAway, maxDelta: maxAway } } : {}) };
  }, [a.toString('base64'), c.toString('base64'), seam || null]);

  await newNote();
  await p.evaluate(() => { setSize('pen', 1); S.color.pen = 'ink'; renderSizes(); if (S.snap) toggleSnap(); });
  const W = await p.evaluate(() => S.size.pen);
  check('penWidth', W === 2, W);

  // ---------- 1. Geometrie jeder Form (ohne Raster) ----------
  const geo = {};
  const head = (len, f) => Math.min(len * f, 12 + W * 2.5);
  const angAt = (tip, a, w) => { const u = [a[0] - tip[0], a[1] - tip[1]], v = [w[0] - tip[0], w[1] - tip[1]]; return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
  {
    await shape('line', 100, 150, 300, 230); const [s] = await last();
    geo.line = sameXY(s, [100, 150, 300, 230]) && s.k === 'line' && allP(s) && s.w === W && s.c === 'ink' && !s.hl && !s.g;
  }
  {
    await shape('arrow', 100, 150, 300, 230); const [s] = await last(), q = xy(s), len = Math.hypot(200, 80), h = head(len, 0.35);
    geo.arrow = q.length === 5 && sameXY({ pts: s.pts.slice(0, 6) }, [100, 150, 300, 230]) && near(q[3][0], 300) && near(q[3][1], 230)
      && near(Math.hypot(q[2][0] - 300, q[2][1] - 230), h, 0.05) && near(Math.hypot(q[4][0] - 300, q[4][1] - 230), h, 0.05)
      && near(angAt(q[1], q[0], q[2]), 27, 0.05) && near(angAt(q[1], q[0], q[4]), 27, 0.05) && allP(s) && s.k === 'arrow';
  }
  {
    await shape('arrow2', 100, 150, 300, 230); const [s] = await last(), q = xy(s), h = head(Math.hypot(200, 80), 0.3);
    geo.arrow2 = q.length === 8 && near(q[1][0], 100) && near(q[3][1], 150) && near(q[4][0], 300) && near(q[6][1], 230)
      && near(Math.hypot(q[0][0] - 100, q[0][1] - 150), h, 0.05) && near(angAt(q[1], q[4], q[0]), 27, 0.05) && near(angAt(q[1], q[4], q[2]), 27, 0.05)
      && near(angAt(q[4], q[1], q[5]), 27, 0.05) && near(angAt(q[4], q[1], q[7]), 27, 0.05) && allP(s);
  }
  {
    await shape('rect', 100, 300, 300, 420); const [s] = await last();
    geo.rect = sameXY(s, [100, 300, 300, 300, 300, 420, 100, 420, 100, 300]) && allP(s) && s.k === 'rect';
  }
  {
    await shape('ellipse', 100, 300, 300, 420); const [s] = await last(), q = xy(s), n = q.length - 1;
    const onE = q.every(([x, y]) => near(((x - 200) / 100) ** 2 + ((y - 360) / 60) ** 2, 1, 0.002));
    geo.ellipse = n >= 36 && n <= 240 && near(q[0][0], q.at(-1)[0], 0) && near(q[0][1], q.at(-1)[1], 0) && onE && allP(s);
    geo.ellipsePoints = n;
  }
  {
    await shape('tri', 300, 420, 100, 300); const [s] = await last();   // auch rückwärts gezogen: Spitze oben in der Mitte
    geo.tri = sameXY(s, [200, 300, 300, 420, 100, 420, 200, 300]) && allP(s);
  }
  {
    await shape('rtri', 100, 300, 300, 420); const [s] = await last();
    geo.rtri = sameXY(s, [100, 300, 100, 420, 300, 420, 100, 300]) && allP(s);
  }
  {
    await shape('diamond', 100, 300, 300, 420); const [s] = await last();
    geo.diamond = sameXY(s, [200, 300, 300, 360, 200, 420, 100, 360, 200, 300]) && allP(s);
  }
  check('geometry', Object.values(geo).every(v => v !== false), geo);

  // ---------- 2. Koordinatensysteme ----------
  const graphOf = async () => p.evaluate(() => { const g = S.items.at(-1).g; return S.items.filter(s => s.g === g).map(s => ({ k: s.k, g: s.g, w: s.w, c: s.c, pts: Array.from(s.pts) })); });
  const th = Math.max(4, W * 1.5);
  const isTick = s => s.pts.length === 6 && near(Math.hypot(s.pts[3] - s.pts[0], s.pts[4] - s.pts[1]), 2 * th, 0.01);
  const gr = {};
  {
    const n0 = await count();
    await shape('axes2', 400, 500, 800, 780);
    const L = await graphOf(), [xa, ya] = L, ticks = L.filter(isTick), G = 28;
    gr.axes2Count = L.length; gr.axes2OneCommit = (await count()) - n0 === L.length;
    gr.axes2Group = L.every(s => s.g && s.g === L[0].g && s.k === 'axes2' && s.w === W && s.c === 'ink');
    gr.axes2X = sameXY({ pts: xa.pts.slice(0, 6) }, [400, 640, 800, 640]) && xa.pts.length === 15;
    gr.axes2Y = sameXY({ pts: ya.pts.slice(0, 6) }, [600, 780, 600, 500]) && ya.pts.length === 15;
    const tx = ticks.filter(s => near(s.pts[0], s.pts[3])).map(s => s.pts[0] - 600).sort((a, b) => a - b);
    const ty = ticks.filter(s => near(s.pts[1], s.pts[4])).map(s => 640 - s.pts[1]).sort((a, b) => a - b);
    gr.axes2TicksX = tx.length > 6 && tx.every(v => near(v / G, Math.round(v / G), 1e-3) && v !== 0) && tx.every((v, i) => near(v, -tx[tx.length - 1 - i], 1e-3)) && Math.max(...tx) <= 200 - head(400, 0.35);
    gr.axes2TicksY = ty.length > 4 && ty.every(v => near(v / G, Math.round(v / G), 1e-3) && v !== 0) && ty.every((v, i) => near(v, -ty[ty.length - 1 - i], 1e-3));
    gr.axes2Labels = L.length - 2 - ticks.length === 4;   // x und y je zwei Linien
    gr.axes2ticks = [tx.length, ty.length];
  }
  {
    await shape('axes2p', 900, 500, 1200, 780);
    const L = await graphOf(), [xa, ya] = L, ticks = L.filter(isTick);
    gr.axes2pX = sameXY({ pts: xa.pts.slice(0, 6) }, [900, 780, 1200, 780]);
    gr.axes2pY = sameXY({ pts: ya.pts.slice(0, 6) }, [900, 780, 900, 500]);
    gr.axes2pPositive = ticks.length > 6 && ticks.every(s => (near(s.pts[0], s.pts[3]) ? s.pts[0] > 900 : s.pts[1] < 780));
    gr.axes2pK = L.every(s => s.k === 'axes2p');
  }
  {
    await shape('axes3', 100, 500, 400, 800);
    const L = await graphOf(), ticks = L.filter(isTick), ax = L.filter(s => s.pts.length === 15);
    // Ursprung bei 40 % / 60 %, z nach oben, y nach rechts, x 45° nach links unten
    gr.axes3Axes = ax.length === 3 && ax.every(s => near(s.pts[0], 220) && near(s.pts[1], 680));
    const tips = ax.map(s => [s.pts[3], s.pts[4]]);
    gr.axes3Tips = JSON.stringify(tips.map(t => t.map(Math.round))) === JSON.stringify([[220, 500], [400, 680], [100, 800]]);
    const diag = ticks.filter(s => !near(s.pts[0], s.pts[3]) && !near(s.pts[1], s.pts[4])).map(s => [(s.pts[0] + s.pts[3]) / 2, (s.pts[1] + s.pts[4]) / 2]);
    gr.axes3XTicks = diag.length >= 5 && diag.every(([x, y], i) => near(220 - x, (i + 1) * 14, 0.01) && near(y - 680, (i + 1) * 14, 0.01));
    gr.axes3Labels = L.length - 3 - ticks.length === 2 + 2 + 1;   // x, y, z
    const gs = await p.evaluate(() => new Set(S.items.filter(s => s.g).map(s => s.g)).size);
    gr.distinctGroups = gs === 3;
  }
  check('graphs', Object.values(gr).every(v => v !== false), gr);
  await p.screenshot({ path: path.join(OUT, 'shapes_geometry.png') });

  // ---------- 3. Zu kurz, Esc, pointercancel ----------
  {
    const n0 = await count();
    const empty0 = await p.screenshot({ clip: { x: 560, y: 260, width: 180, height: 160 } });
    await shape('rect', 600, 300, 604, 302);
    const a = await count();
    await drag(600, 300, 700, 380, { finish: false }); await frames();
    const liveHas = await p.evaluate(() => action && action.kind === 'shape' && action.geo && action.geo.strokes.length);
    await p.keyboard.press('Escape'); await frames();
    const afterEsc = await p.evaluate(() => [S.items.length, action]);
    await pen('mouseReleased', 700, 380); await frames();
    const afterUp = await count();
    // pointercancel
    await p.evaluate(() => { const cv = cvLive, r = cv.getBoundingClientRect(); const ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 91, pointerType: 'pen', clientX: x + r.left, clientY: y + r.top, pressure: .5, button: t === 'pointermove' ? -1 : 0, buttons: t === 'pointercancel' ? 0 : 1 }));
      ev('pointerdown', 600, 300); ev('pointermove', 680, 360); ev('pointermove', 700, 380); ev('pointercancel', 700, 380); });
    await frames();
    const afterCancel = await count();
    const liveEmpty = (await diff(empty0, await p.screenshot({ clip: { x: 560, y: 260, width: 180, height: 160 } }))).changedPixels === 0;
    // Zoom 2: 4 px auf dem Bildschirm sind zu kurz, 12 px reichen
    await p.evaluate(() => zoomAt(VW / 2, VH / 2, 2)); await frames();
    await shape('line', 600, 300, 604, 300); const z1 = await count();
    await shape('line', 600, 300, 612, 300); const z2 = await count();
    await p.evaluate(() => { S.items = S.items.slice(0, -1); zoomAt(VW / 2, VH / 2, 1); }); await frames();
    check('shortEscCancel', a === n0 && liveHas && afterEsc[0] === n0 && afterEsc[1] === null && afterUp === n0 && afterCancel === n0 && liveEmpty && z1 === n0 && z2 === n0 + 1, { n0, a, liveHas, afterEsc, afterUp, afterCancel, liveEmpty, z1, z2 });
  }

  // ---------- 4. Umschalt und Magnet ----------
  await newNote();
  {
    const r = {};
    await shape('line', 100, 150, 300, 210, { mods: 8 }); let [s] = await last(); let q = xy(s);
    const ang = Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI;
    r.shiftLine15 = near(ang, 15, 0.01) && near(q[0][0], 100) && near(q[0][1], 150); r.ang = +ang.toFixed(3);
    await shape('rect', 100, 300, 260, 380, { mods: 8 }); [s] = await last(); r.shiftSquare = sameXY(s, [100, 300, 260, 300, 260, 460, 100, 460, 100, 300]);
    await shape('ellipse', 400, 300, 300, 360, { mods: 8 }); [s] = await last(); q = xy(s);
    r.shiftCircle = q.every(([x, y]) => near(Math.hypot(x - 350, y - 350), 50, 0.01));
    await shape('tri', 500, 400, 600, 300, { mods: 8 }); [s] = await last(); q = xy(s);
    r.shiftEquilateral = near(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]), 0.02) && near(Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]), Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]), 0.02);
    // Magnet ohne Umschalt
    await shape('line', 100, 500, 300, 510); [s] = await last(); r.magnet0 = sameXY(s, [100, 500, 100 + Math.hypot(200, 10), 500]);
    await shape('line', 100, 600, 300, 795); [s] = await last(); q = xy(s); r.magnet45 = near(q[1][0] - 100, q[1][1] - 600, 0.01);
    await shape('arrow', 700, 600, 712, 400); [s] = await last(); q = xy(s); r.magnet90 = near(q[1][0], 700, 0.001);
    await shape('line', 100, 700, 300, 780); [s] = await last(); r.noMagnet = sameXY(s, [100, 700, 300, 780]);
    await shape('rect', 800, 150, 1000, 338); [s] = await last(); r.magnetSquare = sameXY(s, [800, 150, 1000, 150, 1000, 350, 800, 350, 800, 150]);
    await shape('ellipse', 800, 400, 1000, 580); [s] = await last(); q = xy(s); r.noMagnet10 = Math.max(...q.map(v => v[1])) < 581;
    await shape('rtri', 1100, 150, 1300, 338); [s] = await last(); r.rtriNoMagnet = sameXY(s, [1100, 150, 1100, 338, 1300, 338, 1100, 150]);
    // Umschalt per Taste während des Ziehens (ohne Bewegung)
    await p.evaluate(() => { S.shape = 'rect'; });
    await drag(1100, 400, 1300, 480, { finish: false }); await p.keyboard.down('Shift'); await frames();
    const liveSq = await p.evaluate(() => Array.from(action.geo.strokes[0].pts.slice(6, 8)));
    await pen('mouseReleased', 1300, 480); await p.keyboard.up('Shift'); await frames();
    [s] = await last(); r.shiftKeyMidDrag = near(liveSq[0], 1300) && near(liveSq[1], 600) && sameXY(s, [1100, 400, 1300, 400, 1300, 600, 1100, 600, 1100, 400]);
    check('shiftMagnet', Object.entries(r).every(([k, v]) => k === 'ang' || v), r);
  }

  // ---------- 5. Am Raster ausrichten ----------
  await newNote();
  {
    const r = {};
    await p.keyboard.press('g'); await frames();
    r.toggleOn = await p.evaluate(() => [S.snap, $('#bSnap').classList.contains('on'), $('#toast').textContent, localStorage.getItem('notizen.snap')]);
    const m28 = v => near(v / 28, Math.round(v / 28), 1e-4), m34 = v => near(v / 34, Math.round(v / 34), 1e-4);
    await shape('rect', 103, 205, 290, 330); let [s] = await last();
    r.rectSnapped = sameXY(s, [112, 196, 280, 196, 280, 336, 112, 336, 112, 196]);
    await shape('line', 405, 210, 611, 333); [s] = await last(); r.lineSnapped = xy(s).every(([x, y]) => m28(x) && m28(y));
    await shape('arrow', 405, 410, 611, 433, { mods: 8 }); [s] = await last(); r.arrowShiftSnap = near(s.pts[1], s.pts[4]) && m28(s.pts[3]) && m28(s.pts[0]);
    await shape('arrow', 705, 410, 803, 512, { mods: 8 }); [s] = await last(); r.diagShiftSnap = m28(s.pts[3]) && m28(s.pts[4]) && near(s.pts[3] - s.pts[0], s.pts[4] - s.pts[1]);
    await shape('axes2', 700, 150, 1010, 395); let L = await graphOf();
    const ticks = L.filter(isTick);
    r.graphTicksOnGrid = ticks.every(t => (near(t.pts[0], t.pts[3]) ? m28(t.pts[0]) : m28(t.pts[1])));
    r.graphOriginOnGrid = m28(L[0].pts[1]) && m28(L[1].pts[0]) && m28(L[0].pts[0]) && m28(L[0].pts[3]);
    await shape('axes3', 1000, 450, 1300, 760); L = await graphOf(); r.axes3Origin = m28(L[0].pts[0]) && m28(L[0].pts[1]);
    // liniertes Papier: 34er Raster
    await p.evaluate(() => { S.note.bg = 'lines'; clearTiles(); });
    await shape('ellipse', 103, 500, 290, 640); [s] = await last(); const q = xy(s);
    const ex = [Math.min(...q.map(v => v[0])), Math.max(...q.map(v => v[0])), Math.min(...q.map(v => v[1])), Math.max(...q.map(v => v[1]))];
    r.lines34 = ex.every(v => m34(Math.round(v * 1000) / 1000)) && near(ex[0], 102) && near(ex[3], 646) && (await p.evaluate(() => gridSize())) === 34; r.ex = ex.map(v => +v.toFixed(2));
    await p.evaluate(() => { S.note.bg = 'dots'; clearTiles(); });
    // Freihand wird nie ausgerichtet
    await p.evaluate(() => setTool('pen'));
    await drag(503, 605, 590, 671, { steps: 12 }); [s] = await last(); r.freehandUntouched = near(s.pts[0], 503, 0.6) && !m28(s.pts[0]);
    check('snapShapes', Object.entries(r).every(([k, v]) => k === 'ex' || k === 'toggleOn' || v) && r.toggleOn[0] === true && r.toggleOn[1] && r.toggleOn[2] === 'Am Raster ausrichten: an' && r.toggleOn[3] === 'true', r);
  }
  // Verschieben und Skalieren mit Raster
  {
    const r = {};
    await p.evaluate(() => setTool('lasso'));
    // Freihandstrich (liegt nicht auf dem Raster) antippen und ziehen
    await p.mouse.click(546, 638); await frames();
    const sel1 = await p.evaluate(() => S.sel && S.sel.ids.size);
    const gb0 = await p.evaluate(() => geoBox(S.items.filter(it => S.sel.ids.has(it.id))));
    await p.mouse.move(546, 638); await p.mouse.down(); await p.mouse.move(566, 650, { steps: 3 }); await p.mouse.move(583, 671, { steps: 3 });
    r.liveDx = await p.evaluate(() => [action.kind, action.dx, action.dy]);
    await p.mouse.up(); await frames();
    const gb1 = await p.evaluate(() => geoBox(S.items.filter(it => S.sel.ids.has(it.id))));
    const onG = v => near(v / 28, Math.round(v / 28), 1e-3);
    r.moveSnapped = sel1 === 1 && r.liveDx[0] === 'move' && onG(gb1[0]) && onG(gb1[1]) && !onG(gb0[1]) && near(gb1[0] - gb0[0], r.liveDx[1], 0.01) && near(gb1[1] - gb0[1], r.liveDx[2], 0.01);
    r.gb = [gb0.map(v => +v.toFixed(2)), gb1.map(v => +v.toFixed(2))];
    // Skalieren am Griff: rechter Rand aufs Raster
    const hb = await p.evaluate(() => toScreen(S.sel.bb[2], S.sel.bb[3]));
    await p.mouse.move(hb[0], hb[1]); await p.mouse.down(); await p.mouse.move(hb[0] + 30, hb[1] + 20, { steps: 4 }); await p.mouse.move(hb[0] + 47, hb[1] + 31, { steps: 4 });
    r.liveScale = await p.evaluate(() => action && action.kind === 'scale' ? action.s : null);
    await p.mouse.up(); await frames();
    const gb2 = await p.evaluate(() => geoBox(S.items.filter(it => S.sel.ids.has(it.id))));
    r.scaleSnapped = r.liveScale > 1 && onG(gb2[2]) && near(gb2[0], gb1[0], 0.02) && near(gb2[1], gb1[1], 0.02); r.gb2 = gb2.map(v => +v.toFixed(2));
    // Rechteck (schon auf dem Raster) verschieben: bleibt auf dem Raster, Vorschau springt in Kästchen
    await p.mouse.click(112, 260); await frames();
    const rid = await p.evaluate(() => [...S.sel.ids]);
    await p.mouse.move(112, 260); await p.mouse.down(); const seen = new Set();
    for (let k = 1; k <= 12; k++) { await p.mouse.move(112 + k * 5, 260 + k * 3); seen.add(await p.evaluate(() => action.dx + ',' + action.dy)); }
    await p.mouse.up(); await frames();
    const [rs] = await p.evaluate(id => S.items.filter(i => i.id === id).map(s => Array.from(s.pts)), rid[0]);
    r.rectMoved = sameXY({ pts: rs }, [168, 224, 336, 224, 336, 364, 168, 364, 168, 224]); r.previewSteps = [...seen];
    r.previewCells = [...seen].every(v => v.split(',').every(n => near(+n % 28, 0, 1e-6)));
    // Duplizieren: ein Kästchen versetzt
    await p.click('#sDup'); await frames();
    const [ds] = await last(); r.dupOffset = sameXY(ds, [196, 252, 364, 252, 364, 392, 196, 392, 196, 252]);
    check('snapMoveScale', Object.entries(r).every(([k, v]) => ['gb', 'gb2', 'liveDx', 'liveScale', 'previewSteps'].includes(k) || v), r);
  }
  // Bilder und PDF-Seiten mit Raster
  {
    await p.evaluate(() => { clearSel(); zoomAt(VW / 2, VH / 2, 1); setView(13, 7, 1, true); });
    await p.setInputFiles('#fImg', ICON); await p.waitForFunction(() => S.busy === 0);
    await p.setInputFiles('#fImg', ICON); await p.waitForFunction(() => S.busy === 0);
    await p.setInputFiles('#fPdf', path.join(__dirname, 'six.pdf'));
    await p.waitForFunction(() => S.items.filter(i => i.t === 'i').length >= 8 && S.busy === 0, null, { timeout: 30000 });
    const imgs = await p.evaluate(() => S.items.filter(i => i.t === 'i').map(i => [i.x, i.y]));
    check('imagesSnapped', imgs.length === 8 && imgs.every(([x, y]) => near(x / 28, Math.round(x / 28), 1e-6) && near(y / 28, Math.round(y / 28), 1e-6)) && new Set(imgs.map(v => v.join())).size === 8, imgs);
    await p.evaluate(() => { setTool('pen'); toggleSnap(); setView(0, 0, 1, true); });
    check('snapOffAgain', await p.evaluate(() => !S.snap && !$('#bSnap').classList.contains('on') && localStorage.getItem('notizen.snap') === 'false'));
  }

  // ---------- 6. Gruppen: Antippen, Lasso, Duplizieren, Radierer ----------
  await newNote();
  {
    const r = {};
    await shape('axes2', 300, 200, 700, 500); await shape('axes3', 800, 200, 1100, 500); await shape('rect', 300, 600, 500, 700);
    const info = await p.evaluate(() => { const gs = [...new Set(S.items.filter(s => s.g).map(s => s.g))]; return { gs, n: gs.map(g => S.items.filter(s => s.g === g).length), total: S.items.length }; });
    await p.evaluate(() => setTool('lasso'));
    // Teilstrich der x-Achse antippen (nicht die Achse selbst)
    const tick = await p.evaluate(g => { const t = S.items.find(s => s.g === g && s.pts.length === 6 && Math.abs(s.pts[0] - s.pts[3]) < 0.01); return toScreen(t.pts[0], t.pts[1] + 1); }, info.gs[0]);
    await p.mouse.click(tick[0], tick[1]); await frames();
    r.tapGroup = await p.evaluate(n => S.sel && S.sel.ids.size === n, info.n[0]);
    await p.mouse.click(1300, 800); await frames();
    // Lasso um eine Ecke der 3D-Achsen (nur ein Teil der Striche) -> ganze Gruppe
    await p.mouse.move(1000, 340); await p.mouse.down(); for (const q of [[1125, 340], [1125, 425], [1000, 425], [1000, 340]]) await p.mouse.move(q[0], q[1], { steps: 5 }); await p.mouse.up(); await frames();
    r.lassoGroup = await p.evaluate(n => S.sel && S.sel.ids.size === n, info.n[1]);
    await p.mouse.click(400, 600); await frames();
    r.tapSingle = await p.evaluate(() => S.sel && S.sel.ids.size === 1 && S.items.find(i => S.sel.ids.has(i.id)).k === 'rect');
    // beide Graphen auswählen und duplizieren
    await p.evaluate(() => setSel(withGroups(new Set(S.items.filter(s => s.g).map(s => s.id)))));
    await p.click('#sDup'); await frames();
    const d = await p.evaluate(gs => { const all = [...new Set(S.items.filter(s => s.g).map(s => s.g))]; const fresh = all.filter(g => !gs.includes(g));
      return { all: all.length, fresh: fresh.length, sizes: fresh.map(g => S.items.filter(s => s.g === g).length), selIsCopies: [...S.sel.ids].every(id => fresh.includes(S.items.find(i => i.id === id).g)) }; }, info.gs);
    r.dupGroups = d.all === 4 && d.fresh === 2 && d.sizes.sort((a, b) => a - b).join() === [...info.n].sort((a, b) => a - b).join() && d.selIsCopies;
    await p.click('#sDel'); await frames();
    r.afterDel = (await count()) === info.total;
    // Radierer löscht nur den einen Strich (stark vergrößert, am freien Ende des Teilstrichs)
    await p.evaluate(() => setTool('eraser'));
    const n0 = await count();
    const er = await p.evaluate(([x, y]) => { zoomAt(x, y, 4); const t = S.items.find(s => s.g && s.pts.length === 6 && Math.abs(s.pts[0] - s.pts[3]) < 0.01); return toScreen(t.pts[0], t.pts[1] - 0.5); }, tick);
    await frames();
    await p.mouse.move(er[0], er[1]); await p.mouse.down(); await p.mouse.move(er[0] + 0.5, er[1]); await p.mouse.up(); await frames();
    r.eraserSingle = (await count()) === n0 - 1;
    await p.evaluate(() => setView(0, 0, 1, true)); await frames();
    // Rückgängig / Wiederholen: ein Graph ist ein Schritt
    await p.keyboard.press('Control+z'); r.undoErase = (await count()) === n0;
    await p.evaluate(() => setTool('shape')); const before = await count();
    await shape('axes2p', 300, 750, 600, 900); const after = await count();
    await p.keyboard.press('Control+z'); const u = await count(); await p.keyboard.press('Control+y'); const rd = await count();
    r.undoRedoGraph = after > before + 10 && u === before && rd === after;
    r.info = info;
    check('groups', Object.entries(r).every(([k, v]) => k === 'info' || v), r);
  }

  // ---------- 7. Live = fertig (Pixel), auch nach Neuzeichnen der Kacheln ----------
  await newNote();
  async function identity(kind, x0, y0, x1, y1, clip, opt = {}) {
    await p.evaluate(k => { S.shape = k; setTool('shape'); }, kind); await frames();
    await drag(x0, y0, x1, y1, { finish: false, steps: 10, mods: opt.mods || 0 });
    if (opt.wheel) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x1, y: y1, deltaX: 0, deltaY: 37 }); await p.waitForTimeout(100); clip = { ...clip, y: clip.y - 37 }; }
    await p.waitForTimeout(150);
    const live = await p.screenshot({ clip });
    await pen('mouseReleased', x1, y1); await p.waitForTimeout(300);
    const fin = await p.screenshot({ clip });
    // Kacheln neu zeichnen: wegzoomen und genau zur selben Ansicht zurück, Cache leeren
    const v = await p.evaluate(() => { const v = { ...S.view }; zoomAt(VW / 2, VH / 2, 0.5); return v; }); await p.waitForTimeout(200);
    const seam = await p.evaluate(v => { setView(v.tx, v.ty, v.z, true); clearTiles(); pathCache.clear(); draw(); return [Math.round(S.view.tx * DPR), Math.round(S.view.ty * DPR)]; }, v); await p.waitForTimeout(250);
    const rer = await p.screenshot({ clip });
    if (opt.save) { fs.writeFileSync(path.join(OUT, 'shape_live.png'), live); fs.writeFileSync(path.join(OUT, 'shape_final.png'), fin); fs.writeFileSync(path.join(OUT, 'shape_rerender.png'), rer); }
    return { liveVsFinal: await diff(live, fin), liveVsRerender: await diff(live, rer, { x: clip.x * 2 - seam[0], y: clip.y * 2 - seam[1] }) };
  }
  const id = {};
  // leeres Papier: nur die Form zählt -> exakt gleich, auch nach dem Neuzeichnen
  await newNote('blank');
  id.ellipse = await identity('ellipse', 200, 200, 520, 420, { x: 180, y: 180, width: 360, height: 260 }, { save: true });
  id.arrow2 = await identity('arrow2', 600, 220, 900, 400, { x: 570, y: 190, width: 360, height: 240 });
  id.axes2 = await identity('axes2', 200, 500, 560, 860, { x: 150, y: 470, width: 440, height: 420 });
  id.axes3wheel = await identity('axes3', 700, 500, 1100, 860, { x: 640, y: 470, width: 480, height: 420 }, { wheel: true });
  await p.evaluate(() => zoomAt(VW / 2, VH / 2, 1.37)); await p.waitForTimeout(200);
  id.diamondZoom137 = await identity('diamond', 1150, 150, 1390, 420, { x: 1130, y: 130, width: 290, height: 310 });
  // Punktepapier und Darkmode: Form exakt, das Punktmuster selbst schwankt beim Neuzeichnen um höchstens 1 Stufe
  await newNote('dots');
  id.dotsTri = await identity('tri', 300, 200, 640, 520, { x: 280, y: 180, width: 380, height: 360 });
  await p.evaluate(() => toggleDark()); await frames();
  id.rectDark = await identity('rect', 1150, 150, 1380, 330, { x: 1130, y: 130, width: 270, height: 220 });
  id.axes2pDark = await identity('axes2p', 700, 200, 1050, 600, { x: 640, y: 170, width: 430, height: 460 });
  await p.evaluate(() => toggleDark()); await frames();
  const strict = ['ellipse', 'arrow2', 'axes2', 'axes3wheel', 'diamondZoom137'];
  const exact = Object.values(id).every(v => v.liveVsFinal.changedPixels === 0 && v.liveVsFinal.inkPixels > 300);
  const rerOk = Object.entries(id).every(([k, v]) => strict.includes(k) ? v.liveVsRerender.changedPixels === 0 : v.liveVsRerender.maxDelta <= 1);
  check('pixelIdentity', exact && rerOk, id);

  // ---------- 8. Menü und Werkzeugleiste ----------
  {
    const r = {};
    await p.evaluate(() => { localStorage.removeItem('notizen.shape'); S.shape = 'rect'; setTool('pen'); });
    const vis = () => p.evaluate(() => !$('#shapeMenu').classList.contains('hidden'));
    await p.click('#bShape'); r.open1 = await vis(); r.tool = await p.evaluate(() => S.tool);
    await p.click('#bShape'); r.closed = !(await vis());
    await p.click('#bShape'); r.open2 = await vis();
    r.items = await p.$$eval('#shapeMenu [data-shape]', l => l.map(b => b.dataset.shape + ':' + b.textContent.trim()));
    r.sections = await p.$$eval('#shapeMenu .mh', l => l.map(e => e.textContent));
    r.hint = await p.$eval('#shapeMenu .mhint', e => e.textContent);
    r.onMark = await p.$$eval('#shapeMenu [data-shape].on', l => l.map(b => b.dataset.shape));
    await p.click('#shapeMenu [data-shape=arrow]'); r.closedAfterPick = !(await vis());
    r.picked = await p.evaluate(() => [S.shape, localStorage.getItem('notizen.shape'), $('#bShape').title]);
    await p.click('#bShape'); r.onMark2 = await p.$$eval('#shapeMenu [data-shape].on', l => l.map(b => b.dataset.shape));
    // Antippen der Zeichenfläche schließt das Menü, ohne zu zeichnen
    const n0 = await count(); await p.mouse.click(700, 700); r.canvasCloses = !(await vis()) && (await count()) === n0;
    // Farbe und Dicke bleiben beim Formen-Werkzeug
    await p.click('#colors .sw:nth-child(6)'); await p.click('#sizes .sz:nth-child(4)');
    r.colorSize = await p.evaluate(() => [S.tool, S.color.pen, S.size.pen, $('#colors').style.opacity, $('#bShape').classList.contains('on')]);
    await p.keyboard.press('p'); await p.keyboard.press('f'); r.keyF = await p.evaluate(() => [S.tool, cvLive.style.cursor]);
    await p.keyboard.press('g'); r.keyG = await p.evaluate(() => [S.snap, $('#toast').textContent]); await p.keyboard.press('g');
    r.titles = await p.evaluate(() => [$('#bSnap').title, $('#bShape').title]);
    r.order = await p.$$eval('#bar > *', l => l.map(e => e.id || e.dataset.tool || e.className).join(' '));
    const ok = r.open1 && r.tool === 'shape' && r.closed && r.open2 && r.items.length === 11 && r.sections.join() === 'Formen,Graphen,Eigene Formen'
      && r.hint === 'Ziehen zum Zeichnen · Umschalt: gerade/quadratisch' && r.onMark.join() === 'rect' && r.closedAfterPick
      && r.picked[0] === 'arrow' && r.picked[1] === '"arrow"' && r.picked[2] === 'Formen (F) – Pfeil' && r.onMark2.join() === 'arrow' && r.canvasCloses
      && r.colorSize[0] === 'shape' && r.colorSize[1] === '#1e88e5' && r.colorSize[2] === 6 && r.colorSize[3] === '1' && r.colorSize[4]
      && r.keyF.join() === 'shape,crosshair' && r.keyG[0] === true && r.keyG[1] === 'Am Raster ausrichten: an'
      && /hl bShape eraser/.test(r.order) && /bBg bSnap/.test(r.order);
    check('menuUI', ok, r);
    // Farbe/Dicke werden für die Form übernommen
    await drag(300, 300, 500, 420); const [s] = await last();
    check('shapeUsesPen', s.c === '#1e88e5' && s.w === 6 && s.k === 'arrow', { c: s.c, w: s.w, k: s.k });
    await p.evaluate(() => { S.color.pen = 'ink'; setSize('pen', 1); renderColors(); renderSizes(); store.set('color', S.color); });
  }

  // ---------- 9. Persistenz ----------
  {
    await newNote();
    await shape('axes2', 300, 200, 700, 500); await shape('ellipse', 800, 200, 1000, 400); await shape('arrow', 800, 500, 1100, 700);
    const before = await p.evaluate(() => S.items.map(s => [s.k, s.g || '', s.pts.length, s.w]));
    const nid = await p.evaluate(() => S.note.id);
    await p.evaluate(() => window.__flush());
    await p.reload(); await p.waitForTimeout(600);
    await p.evaluate(async id => { const m = (await dbIndexAll()).find(n => n.id === id); await openNote(m); }, nid); await p.waitForTimeout(400);
    const after = await p.evaluate(() => S.items.map(s => [s.k, s.g || '', s.pts.length, s.w]));
    const prefs = await p.evaluate(() => [S.shape, S.snap]);
    check('persistence', JSON.stringify(before) === JSON.stringify(after) && prefs[0] === 'arrow' && prefs[1] === false, { n: after.length, prefs });
    // Gruppe nach dem Neuladen per Antippen wählbar
    await p.evaluate(() => setTool('lasso'));
    await p.mouse.click(300 + 3, 350); await frames();
    check('groupAfterReload', await p.evaluate(() => S.sel && S.sel.ids.size === S.items.filter(s => s.g).length));
  }

  // ---------- 10. Leistung der Vorschau ----------
  res.previewMs = await p.evaluate(() => {
    const a = { kind: 'shape', shape: 'axes3', c: 'ink', w: 2, a0: [100, 150], b: [900, 900], shift: false, g: 'x', geo: null }, t = [];
    for (let k = 0; k < 60; k++) { a.b[0] = 900 + k; a.b[1] = 900 - k; const t0 = performance.now(); liveClear(); liveWorld(); liveShape(a); t.push(performance.now() - t0); }
    liveClear(); t.sort((x, y) => x - y); return { med: +t[30].toFixed(2), max: +t.at(-1).toFixed(2), strokes: a.geo.strokes.length };
  });
  check('previewFast', res.previewMs.med < 4, res.previewMs);

  // ---------- 11. Bildschirmfotos hell und dunkel ----------
  async function showcase() {
    await newNote();
    await p.evaluate(() => { setSize('pen', 1); S.snap = false; });
    const put = async (k, c, ...a) => { await p.evaluate(([k, c]) => { S.shape = k; S.color.pen = c; setTool('shape'); }, [k, c]); await drag(...a); };
    await put('line', 'ink', 70, 150, 230, 250);
    await put('arrow', '#1e88e5', 270, 250, 430, 150);
    await put('arrow2', '#e53935', 470, 200, 640, 200);
    await put('rect', 'ink', 690, 150, 860, 250);
    await put('ellipse', '#43a047', 900, 150, 1080, 250);
    await put('tri', '#fb8c00', 1120, 140, 1250, 255);
    await put('rtri', '#8e24aa', 1290, 140, 1400, 255);
    await put('diamond', 'ink', 70, 300, 200, 420);
    await put('rect', '#1e88e5', 240, 310, 340, 410, { mods: 8 });
    await put('ellipse', '#e53935', 380, 310, 480, 410, { mods: 8 });
    await put('tri', 'ink', 520, 310, 640, 410, { mods: 8 });
    await p.evaluate(() => { S.snap = true; });   // Graphen auf dem Raster: Teilstriche liegen auf den Punkten
    await put('axes2', 'ink', 70, 480, 470, 900);
    await put('axes2p', '#1e88e5', 560, 500, 900, 880);
    await put('axes3', 'ink', 980, 480, 1400, 900);
    await p.evaluate(() => { S.snap = false; });
    await p.evaluate(() => { S.color.pen = 'ink'; setTool('shape'); }); await p.waitForTimeout(300);
  }
  for (const mode of ['light', 'dark']) {
    await p.evaluate(m => { if (S.dark !== (m === 'dark')) toggleDark(); }, mode);
    await showcase();
    await p.screenshot({ path: path.join(OUT, `shapes_page_${mode}.png`) });
    await p.evaluate(() => toggleSnap()); await p.waitForTimeout(1600);   // Magnet aktiv zeigen (Hinweis abwarten)
    await p.screenshot({ path: path.join(OUT, `shapes_toolbar_${mode}.png`), clip: { x: 0, y: 0, width: 1440, height: 110 } });
    await p.evaluate(() => toggleSnap()); await p.waitForTimeout(100);
    await p.click('#bShape'); await p.waitForTimeout(150);
    const mb = await p.$eval('#shapeMenu', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await p.screenshot({ path: path.join(OUT, `shapes_menu_${mode}.png`), clip: { x: 0, y: 0, width: Math.min(1440, mb.x + mb.w + 40), height: mb.y + mb.h + 30 } });
    res['menuBox_' + mode] = mb;
    await p.click('#bShape');
  }
  await p.evaluate(() => { if (S.dark) toggleDark(); });
  // Hochformat: Leiste umbrechen, Menü bleibt im Bild
  await p.setViewportSize({ width: 960, height: 1440 }); await p.waitForTimeout(300);
  await p.click('#bShape'); await p.waitForTimeout(150);
  res.menuPortrait = await p.$eval('#shapeMenu', e => { const r = e.getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth, r.top >= barBottom()]; });
  await p.screenshot({ path: path.join(OUT, 'shapes_portrait.png') });
  check('portraitMenuFits', res.menuPortrait.every(Boolean), res.menuPortrait);

  check('noErrors', errs.length === 0, errs);
  res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); res.fails = fails; console.log(JSON.stringify(res, null, 1)); process.exit(1); });
