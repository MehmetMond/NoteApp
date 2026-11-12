// Bild aus der Zwischenablage (Menü am Bild-Knopf, auch Strg + V) und gleiches Einrasten am Raster: Pfeile mit dem Schaft
// (nicht mit der Spitze), Koordinatensysteme mit dem Ursprung, auch auf einem anderen Blatt und in der anderen Hälfte von
// A3 quer, weit herausgezoomt an den sichtbaren Punkten, Duplizieren auf dem Raster
// node tests/snapclip.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const ICON = path.join(DIR, 'electron', 'icon.png');
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
// v liegt auf dem Raster mit Ursprung o und Abstand G
const onG = (v, o = 0, G = 28) => near((v - o) / G, Math.round((v - o) / G), 1e-3);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  const newNote = (o = {}) => p.evaluate(async o => {
    if (S.note) await closeNote();
    const now = Date.now(), n = { id: uid(), name: 'Raster', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 }, ...o };
    await dbIndexPut(n); await openNote(n);
  }, o);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.8 });
  async function drag(x0, y0, x1, y1, steps = 10) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' });
    await pen('mousePressed', x0, y0);
    for (let k = 1; k <= steps; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps);
    await pen('mouseReleased', x1, y1); await frames();
  }
  const scr = (wx, wy) => p.evaluate(([wx, wy]) => { const r = cvLive.getBoundingClientRect(), [x, y] = toScreen(wx, wy); return [r.left + x, r.top + y]; }, [wx, wy]);
  // Form von Weltpunkt a nach b ziehen; liefert die neuen Striche
  const shapeW = async (k, a, c) => {
    const n0 = await p.evaluate(k => { S.shape = k; setTool('shape'); return S.items.length; }, k);
    const A = await scr(...a), B = await scr(...c); await drag(A[0], A[1], B[0], B[1]);
    return p.evaluate(n0 => S.items.slice(n0).map(s => ({ id: s.id, k: s.k, g: s.g || null, pts: Array.from(s.pts) })), n0);
  };
  const item = id => p.evaluate(id => { const s = S.items.find(i => i.id === id); return s && (s.t === 'i' ? { x: s.x, y: s.y, w: s.w, h: s.h } : { pts: Array.from(s.pts), w: s.w }); }, id);
  const select = id => p.evaluate(id => { setTool('lasso'); setSel(withGroups(new Set([id]))); }, id);
  // Auswahl mit dem Stift um (dx, dy) Bildschirmpixel verschieben (von der Mitte aus)
  const moveSel = async (dx, dy) => { const [x, y] = await p.evaluate(() => { const b = S.sel.bb; return toScreen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); }); const r = await scr(0, 0), o = await p.evaluate(() => toScreen(0, 0)); await drag(x + r[0] - o[0], y + r[1] - o[1], x + r[0] - o[0] + dx, y + r[1] - o[1] + dy); };
  const snapOn = on => p.evaluate(on => { if (S.snap !== on) toggleSnap(); }, on);
  const graph = g => p.evaluate(g => { const d = graphData(g); return d && { o: d.o, b: d.b, f: d.f, G: d.G, step: d.step }; }, g);
  // senkrechte Teilstriche eines Graphen (2 Punkte, gleiche x): ihre x-Werte
  const ticksX = g => p.evaluate(g => S.items.filter(s => s.g === g && s.pts.length === 6 && Math.abs(s.pts[0] - s.pts[3]) < 1e-3).map(s => s.pts[0]), g);

  // ================= Bild aus der Zwischenablage =================
  await newNote();
  if (!await p.evaluate(() => !!document.querySelector('#imgMenu'))) check('Bild-Knopf öffnet ein Menü', false, 'kein Menü (alte Version)');
  else {
  await p.click('#bImg'); await p.waitForTimeout(350);
  res.menu = await p.evaluate(() => {
    const m = $('#imgMenu'), r = m.getBoundingClientRect(), bt = $('#bImg').getBoundingClientRect(), h = m.querySelector('.mhint');
    return { open: isOpen(m), below: r.top >= bt.bottom, inView: r.left >= 0 && r.right <= innerWidth, w: Math.round(r.width), h: Math.round(r.height),
      items: [...m.querySelectorAll('button')].map(x => x.textContent.trim()), hint: h.textContent, hintH: Math.round(h.getBoundingClientRect().height), title: $('#bImg').title };
  });
  check('Bild-Knopf öffnet ein Menü: Zwischenablage, Datei, PDF, Hinweis', res.menu.open && res.menu.below && res.menu.inView && res.menu.items.length === 3 && res.menu.items[0] === 'Aus der Zwischenablage'
    && res.menu.items[1] === 'Bild aus einer Datei …' && res.menu.items[2] === 'PDF einfügen …' && /Win \+ Umschalt \+ S/.test(res.menu.hint) && /Strg \+ V/.test(res.menu.hint) && res.menu.w <= 300, res.menu);
  await p.click('#bImg'); await p.waitForTimeout(350);
  check('Nochmal antippen schließt das Menü', await p.evaluate(() => !isOpen($('#imgMenu'))));
  // Zwischenablage nachgebildet: read() liefert, was der Test vorgibt (die echte bleibt unberührt)
  const fakeClipboard = () => p.evaluate(() => {
    window.__clip = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => { const c = window.__clip; if (c instanceof Error) throw c; return c; } } });
  });
  const setClip = kind => p.evaluate(async kind => {
    const png = async (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, w, h); return new Promise(r => c.toBlob(r, 'image/png')); };
    if (kind === 'png') { const blob = await png(300, 200); window.__clip = [{ types: ['text/html', 'image/png'], getType: async t => t === 'image/png' ? blob : new Blob(['<b>x</b>'], { type: 'text/html' }) }]; }
    else if (kind === 'text') window.__clip = [{ types: ['text/plain'], getType: async () => new Blob(['Hallo'], { type: 'text/plain' }) }];
    else if (kind === 'empty') window.__clip = [];
    else if (kind === 'denied') window.__clip = new DOMException('Read permission denied.', 'NotAllowedError');
    else if (kind === 'nodata') window.__clip = new DOMException('No valid data on clipboard.', 'DataError');
  }, kind);
  const images = () => p.evaluate(() => S.items.filter(i => i.t === 'i').map(i => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h })));
  const fromClip = async () => { await p.click('#bImg'); await p.waitForTimeout(300); await p.click('#mImgClip'); };
  await fakeClipboard(); await setClip('png'); await fromClip();
  await p.waitForFunction(() => S.busy === 0 && S.items.some(i => i.t === 'i'), null, { timeout: 15000 });
  res.pasted = await p.evaluate(async () => {
    const i = S.items.find(i => i.t === 'i'), rec = await new Promise(r => { const q = db.transaction('images').objectStore('images').get(i.img); q.onsuccess = () => r(q.result); });
    return { ratio: i.w / i.h, sel: !!S.sel && S.sel.ids.has(i.id), tool: S.tool, menu: isOpen($('#imgMenu')), stored: rec ? [rec.w, rec.h, rec.blob.type] : null, toast: $('#toast').textContent };
  });
  check('Bild aus der Zwischenablage: eingefügt, ausgewählt, Menü zu', near(res.pasted.ratio, 1.5, 1e-3) && res.pasted.sel && res.pasted.tool === 'lasso' && !res.pasted.menu
    && res.pasted.stored && res.pasted.stored.join() === '300,200,image/png' && /^Eingefügt/.test(res.pasted.toast), res.pasted);
  for (const [kind, want] of [['text', 'In der Zwischenablage ist kein Bild'], ['empty', 'In der Zwischenablage ist kein Bild'], ['nodata', 'In der Zwischenablage ist kein Bild'], ['denied', 'Kein Zugriff auf die Zwischenablage']]) {
    const n0 = (await images()).length;
    await setClip(kind); await fromClip(); await p.waitForTimeout(300);
    const t = await p.evaluate(() => $('#toast').textContent), n1 = (await images()).length;
    check('Zwischenablage „' + kind + '“: Hinweis, kein Bild', n1 === n0 && t.startsWith(want), { t, n0, n1 });
  }
  // Mit Raster: obere linke Ecke auf dem Raster
  await snapOn(true); await p.evaluate(() => setView(13, 7, 1, true));
  { const n0 = (await images()).length; await setClip('png'); await fromClip(); await p.waitForFunction(n => S.busy === 0 && S.items.filter(i => i.t === 'i').length === n + 1, n0);
    const im = (await images()).at(-1); check('Mit Raster: eingefügtes Bild liegt auf dem Raster', onG(im.x) && onG(im.y), im); }
  await snapOn(false);
  // Strg + V (paste-Ereignis mit einer Datei, wie bei einem Bildschirmfoto)
  { const n0 = (await images()).length;
    await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 240; c.getContext('2d').fillRect(0, 0, 120, 240);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')), dt = new DataTransfer();
      dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await p.waitForFunction(n => S.busy === 0 && S.items.filter(i => i.t === 'i').length === n + 1, n0);
    const im = (await images()).at(-1); check('Strg + V fügt ein Bild ein', near(im.w / im.h, 0.5, 1e-3), im); }
  // Bild aus einer Datei: Dateiauswahl wie bisher
  { const n0 = (await images()).length;
    const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), (async () => { await p.click('#bImg'); await p.waitForTimeout(300); await p.click('#mImgFile'); })()]);
    await fc.setFiles(ICON); await p.waitForFunction(n => S.busy === 0 && S.items.filter(i => i.t === 'i').length === n + 1, n0);
    check('„Bild aus einer Datei“ öffnet die Dateiauswahl und fügt ein', fc.isMultiple() && !(await p.evaluate(() => isOpen($('#imgMenu'))))); }
  // ohne Zwischenablage im Browser: Hinweis auf Strg + V
  await p.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await fromClip(); await p.waitForTimeout(300);
  check('Ohne Zugriff im Browser: Hinweis auf Strg + V', /Strg \+ V/.test(await p.evaluate(() => $('#toast').textContent)));
  }

  // ================= Einrasten am Raster =================
  await newNote(); await snapOn(true); await p.evaluate(() => { setSize('pen', 1); setView(0, 0, 1, true); });
  res.step = await p.evaluate(() => typeof snapStep === 'function' ? snapStep() : null);
  check('Rasterabstand bei 100 %: 28', res.step === 28, res.step);
  // Pfeil verschieben: der Schaft bleibt auf dem Raster (früher die Spitze oben, der Schaft lag dann zwischen den Punkten)
  {
    const [a] = await shapeW('arrow', [143, 205], [421, 198]);
    const shaft = id => p.evaluate(id => { const s = S.items.find(i => i.id === id), sh = shaftOf(s); return [s.pts[sh[0]], s.pts[sh[0] + 1], s.pts[sh[1]], s.pts[sh[1] + 1]]; }, id);
    const s0 = await shaft(a.id);
    await select(a.id); await moveSel(37, 23);
    const s1 = await shaft(a.id);
    check('Pfeil verschoben: Schaft auf dem Raster', s0.every(v => onG(v)) && s1.every(v => onG(v)) && !near(s1[1], s0[1]), { s0, s1 });
    // Skalieren am Griff: Anfang bleibt, Spitze aufs Raster, Schaft auf derselben Höhe
    const hb = await p.evaluate(() => { const r = cvLive.getBoundingClientRect(), [x, y] = toScreen(S.sel.bb[2], S.sel.bb[3]); return [r.left + x, r.top + y]; });
    await drag(hb[0], hb[1], hb[0] + 61, hb[1] + 9);
    const s2 = await shaft(a.id);
    check('Pfeil skaliert: Schaft bleibt auf dem Raster', near(s2[0], s1[0]) && near(s2[1], s1[1]) && near(s2[3], s1[3]) && onG(s2[2]) && s2[2] > s1[2] + 20, { s1, s2 });
  }
  {
    const [a] = await shapeW('arrow2', [601, 260], [880, 271]);
    await select(a.id); await moveSel(-23, 47);
    const s = await p.evaluate(id => { const s = S.items.find(i => i.id === id), sh = shaftOf(s); return [s.pts[sh[0]], s.pts[sh[0] + 1], s.pts[sh[1]], s.pts[sh[1] + 1]]; }, a.id);
    check('Doppelpfeil verschoben: Schaft (Spitze zu Spitze) auf dem Raster', s.every(v => onG(v)) && near(s[2] - s[0], 280, 0.6), s);
  }
  // Graph ohne Raster gezeichnet, mit Raster verschoben: Ursprung und Teilstriche springen aufs Raster
  {
    await snapOn(false);
    const L = await shapeW('axes2', [613, 451], [889, 697]), g = L[0].g, o0 = (await graph(g)).o;
    await snapOn(true); await select(L[0].id); await moveSel(41, 19);
    const o1 = (await graph(g)).o, tx = await ticksX(g);
    check('Graph verschoben: Ursprung und Teilstriche auf dem Raster', !onG(o0[0]) && o1.every(v => onG(v)) && tx.length > 4 && tx.every(v => onG(v)), { o0, o1, tx });
    // zusammen mit einem Freihandstrich ausgewählt: der Graph bestimmt das Raster
    await p.evaluate(() => setTool('pen'));
    { const A = await scr(700, 430), B = await scr(760, 445); await drag(A[0], A[1], B[0], B[1]); }
    const sid = await p.evaluate(() => S.items.at(-1).id);
    await p.evaluate(([g, sid]) => { setTool('lasso'); setSel(withGroups(new Set([sid, S.items.find(i => i.g === g).id]))); }, [g, sid]);
    await moveSel(-33, 52);
    const o2 = (await graph(g)).o;
    check('Graph mit Freihandstrich verschoben: Ursprung auf dem Raster', o2.every(v => onG(v)) && !near(o2[1], o1[1]), { o1, o2 });
  }
  // früher gezeichneter Graph (ohne gespeicherte Daten): Ursprung aus den Achsen
  {
    await snapOn(false);
    const L = await shapeW('axes2', [1003, 151], [1281, 387]), g = L[0].g;
    await p.evaluate(g => {   // wie vor 1.5.11: ohne Daten, Achsen mit offener Spitze (Ende, Spitze, Flügel, Spitze, Flügel)
      const C = Math.cos(27 * Math.PI / 180), Sn = Math.sin(27 * Math.PI / 180);
      const openHead = s => {
        const sh = shaftOf(s), q0 = [s.pts[sh[0]], s.pts[sh[0] + 1]], q1 = [s.pts[sh[1]], s.pts[sh[1] + 1]];
        const L = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), ux = (q1[0] - q0[0]) / L, uy = (q1[1] - q0[1]) / L, h = Math.min(L * 0.35, 17);
        const xy = [...q0, ...q1, q1[0] - h * (ux * C - uy * Sn), q1[1] - h * (ux * Sn + uy * C), ...q1, q1[0] - h * (ux * C + uy * Sn), q1[1] - h * (-ux * Sn + uy * C)];
        const pts = new Float32Array(15); for (let i = 0; i < 5; i++) { pts[i * 3] = xy[i * 2]; pts[i * 3 + 1] = xy[i * 2 + 1]; pts[i * 3 + 2] = 0.5; }
        const { fl, ...rest } = s; return { ...rest, pts, bb: bboxOf(pts, s.w) };
      };
      commit(S.items.map(it => { if (it.g !== g) return it; const { gr, ...rest } = it; return rest.fl ? openHead(rest) : rest; }));
    }, g);
    const o0 = (await graph(g)).o, plain = await p.evaluate(g => S.items.filter(i => i.g === g).every(i => !i.gr), g);
    await snapOn(true); await select(L[0].id); await moveSel(-29, 31);
    const o1 = (await graph(g)).o;
    check('Alter Graph ohne Daten verschoben: Ursprung auf dem Raster', plain && !onG(o0[1]) && o1.every(v => onG(v)), { o0, o1 });
  }
  // Duplizieren mit Raster: die Kopie liegt auf dem Raster, einen Punkt weiter
  {
    await snapOn(true); await p.evaluate(() => setTool('pen'));
    { const A = await scr(203, 603), B = await scr(287, 641); await drag(A[0], A[1], B[0], B[1]); }
    const id = await p.evaluate(() => S.items.at(-1).id);
    await select(id); await p.click('#sDup'); await frames();
    const r = await p.evaluate(id => { const src = S.items.find(i => i.id === id), cp = S.items.at(-1); return { src: geoBox([src]), cp: geoBox([cp]), other: cp.id !== id }; }, id);
    check('Duplizieren mit Raster: Kopie auf dem Raster, etwa ein Punkt weiter', r.other && onG(r.cp[0]) && onG(r.cp[1]) && r.cp[0] - r.src[0] > 13 && r.cp[0] - r.src[0] < 43 && r.cp[1] - r.src[1] > 13 && r.cp[1] - r.src[1] < 43, r);
  }
  // Weit herausgezoomt: das Muster zeigt nur jeden zweiten Punkt, eingerastet wird genau dort
  {
    await p.evaluate(() => { clearSel(); setView(20, 30, 0.4, true); });
    const st = await p.evaluate(() => { let sp = 28 * S.level; while (sp < 14) sp *= 2; return { step: typeof snapStep === 'function' ? snapStep() : null, pattern: sp / S.level }; });
    const [r] = await shapeW('rect', [2105, 1705], [2523, 1985]);
    const q = []; for (let i = 0; i < r.pts.length; i += 3) q.push(r.pts[i], r.pts[i + 1]);
    check('Bei 40 %: Abstand wie das Muster (56), Ecken auf sichtbaren Punkten', st.step === 56 && near(st.pattern, 56, 1e-9) && q.every(v => onG(v, 0, 56)), { st, q });
    await p.evaluate(() => setView(0, 0, 1, true));
    const [r2] = await shapeW('rect', [105, 705], [215, 789]);
    const q2 = []; for (let i = 0; i < r2.pts.length; i += 3) q2.push(r2.pts[i], r2.pts[i + 1]);
    check('Wieder bei 100 %: jeder Punkt (28)', q2.every(v => onG(v)) && q2.some(v => !onG(v, 0, 56)), q2);
  }

  // ================= Blätter: Raster jedes Blatts =================
  // A4 hoch: jedes Blatt hat sein eigenes Raster (Ränder), Blatt 2 ist gegen Blatt 1 um kein ganzes Kästchen versetzt
  await newNote({ paper: { f: 'a4', o: 'p', n: 2 } }); await snapOn(true);
  await p.evaluate(() => { setSize('pen', 1); setView(200, -300, 0.5, true); });
  {
    const F = await p.evaluate(() => [fieldsOf(0)[0], fieldsOf(1)[0]]);
    const L = await shapeW('axes2', [F[0][0] + 5 * 28 + 9, F[0][1] + 31 * 28 + 6], [F[0][0] + 13 * 28 - 7, F[0][1] + 37 * 28 - 4]), g = L[0].g;
    const o0 = (await graph(g)).o;
    await select(L[0].id); await moveSel(23, 160);   // 320 Welt-px tiefer: auf Blatt 2
    const o1 = (await graph(g)).o, tx = await ticksX(g), sheet = await p.evaluate(y => sheetAt(y), o1[1]);
    check('A4: Graph auf Blatt 2 verschoben, Ursprung und Teilstriche auf dessen Raster', onG(o0[0], F[0][0]) && onG(o0[1], F[0][1]) && sheet === 1 && onG(o1[0], F[1][0]) && onG(o1[1], F[1][1])
      && tx.every(v => onG(v, F[1][0])), { F, o0, o1, sheet });
    const [rc] = await shapeW('rect', [F[0][0] + 2 * 28 + 5, F[0][1] + 33 * 28 + 3], [F[0][0] + 10 * 28 - 6, F[0][1] + 37 * 28 + 2]);   // groß genug: die Mitte ist nicht der Griff
    await select(rc.id); await moveSel(-11, 170);
    const r = (await item(rc.id)).pts;
    check('A4: Rechteck auf Blatt 2 verschoben, Ecken auf dessen Raster', onG(r[0], F[1][0]) && onG(r[1], F[1][1]) && r[1] > F[1][1], { r: r.slice(0, 2), F1: F[1] });
  }
  // A3 quer: zwei Hälften mit eigenem Raster
  await newNote({ paper: { f: 'a3', o: 'l', n: 1 } }); await snapOn(true);
  await p.evaluate(() => { setSize('pen', 1); setView(40, 120, 0.5, true); });
  {
    const F = await p.evaluate(() => fieldsOf(0));
    const L = await shapeW('axes2', [F[0][0] + 4 * 28 + 9, F[0][1] + 6 * 28 + 6], [F[0][0] + 12 * 28 - 7, F[0][1] + 14 * 28 - 4]), g = L[0].g;
    await select(L[0].id); await moveSel(420, 9);   // 840 Welt-px nach rechts: in die rechte Hälfte
    const o1 = (await graph(g)).o;
    check('A3 quer: Graph in die rechte Hälfte verschoben, Ursprung auf deren Raster', o1[0] > F[1][0] && onG(o1[0], F[1][0]) && onG(o1[1], F[1][1]) && !onG(F[1][0], F[0][0]), { F, o1 });
  }

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
