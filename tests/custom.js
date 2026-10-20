// Teil C: Eigene Formen – Auswahl als Form speichern, in der Bibliothek (Formen-Menü) wählen, platzieren
// (Antippen / Ziehen / Raster), Gruppe, Rückgängig, Persistenz, Löschen, Sicherung, DB-Upgrade v3 -> v4,
// Vorschau = Ergebnis (Pixel), Vorschaubilder hell/dunkel, Screenshots.
// Aufruf: node t3/custom.js  -> JSON mit "fails": [] und "errors": []
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const DIR = path.resolve(__dirname, '..'), OUT = __dirname;
const OLD2 = path.join(__dirname, 'backup-v2.notizen');   // Sicherung aus Version 1.3 (Format 2, ohne Formen)
const res = { checks: 0, fails: [] };
const check = (name, ok, detail) => { res.checks++; res[name] = detail === undefined ? !!ok : detail; if (!ok) res.fails.push(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail).slice(0, 700))); };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
const onGrid = (v, G = 28) => Math.abs(v / G - Math.round(v / G)) < 1e-4;
// Linienzug verdichten (alle ~4 Einheiten ein Punkt), Druck sanft zwischen p0 und p1
function poly(pts, p0 = 0.45, p1 = 0.65) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    for (let k = 0; k < n; k++) out.push(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 0);
  }
  out.push(pts.at(-1)[0], pts.at(-1)[1], 0);
  const N = out.length / 3;
  for (let i = 0; i < N; i++) out[i * 3 + 2] = +(p0 + (p1 - p0) * Math.sin(Math.PI * i / Math.max(1, N - 1))).toFixed(3);
  return out;
}
const curve = (f, n, p0, p1) => poly(Array.from({ length: n + 1 }, (_, i) => f(i / n)), p0, p1);
const circ = (cx, cy, rx, ry = rx, a0 = 0, a1 = Math.PI * 2) => t => [cx + rx * Math.cos(a0 + (a1 - a0) * t), cy + ry * Math.sin(a0 + (a1 - a0) * t)];
// Beispielformen (Weltkoordinaten um ox, oy): [pts, Farbe, Breite, Textmarker]
const DEMO = {
  Stern: (ox, oy) => {
    const st = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 26 : 62; st.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]); }
    return [[poly(st, 0.5, 0.7), '#fb8c00', 3], [poly([[ox - 84, oy - 52], [ox - 70, oy - 44]]), 'ink', 2.5], [poly([[ox + 84, oy - 52], [ox + 70, oy - 44]]), 'ink', 2.5], [poly([[ox, oy + 74], [ox, oy + 86]]), 'ink', 2.5]];
  },
  Herz: (ox, oy) => [[curve(t => { const a = t * Math.PI * 2; return [ox + 3.6 * 16 * Math.sin(a) ** 3, oy - 3.6 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]; }, 120, 0.5, 0.75), '#e53935', 3.5]],
  Smiley: (ox, oy) => [[curve(circ(ox, oy, 52), 90), 'ink', 3], [poly([[ox - 18, oy - 16], [ox - 18, oy - 8]]), 'ink', 6], [poly([[ox + 18, oy - 16], [ox + 18, oy - 8]]), 'ink', 6], [curve(circ(ox, oy + 2, 30, 24, 0.2 * Math.PI, 0.8 * Math.PI), 30), '#1e88e5', 3.5]],
  Blume: (ox, oy) => {
    const out = [];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, cx = ox + 30 * Math.cos(a), cy = oy - 40 + 30 * Math.sin(a); out.push([curve(circ(cx, cy, 17), 40), '#8e24aa', 2.5]); }
    out.push([curve(circ(ox, oy - 40, 12), 30), '#fdd835', 6]);
    out.push([poly([[ox, oy - 8], [ox + 4, oy + 40], [ox, oy + 80]]), '#43a047', 3]);
    out.push([curve(t => [ox + 4 + 36 * t, oy + 44 - 26 * Math.sin(Math.PI * t) - 10 * t], 24), '#43a047', 3]);
    return out;
  },
  Wolke: (ox, oy) => [[poly([...Array.from({ length: 13 }, (_, i) => circ(ox - 40, oy + 6, 26, 26, Math.PI * 0.5, Math.PI * 1.5)(i / 12)), ...Array.from({ length: 15 }, (_, i) => circ(ox - 2, oy - 18, 38, 36, Math.PI * 1.05, Math.PI * 1.95)(i / 14)), ...Array.from({ length: 13 }, (_, i) => circ(ox + 44, oy + 6, 26, 26, Math.PI * 1.5, Math.PI * 2.5)(i / 12)), [ox - 40, oy + 32]], 0.5, 0.6), '#1e88e5', 3]],
  Haken: (ox, oy) => [[poly([[ox - 40, oy], [ox - 12, oy + 30], [ox + 46, oy - 40]], 0.4, 0.8), '#43a047', 6]],
  Pfeil: (ox, oy) => {   // gebogener Pfeil mit offener Spitze am Ende des Bogens
    const a1 = Math.PI * 1.85, f = circ(ox, oy + 40, 64, 52, Math.PI * 1.08, a1), [ex, ey] = f(1);
    const tx = -64 * Math.sin(a1), ty = 52 * Math.cos(a1), L = Math.hypot(tx, ty), ux = tx / L, uy = ty / L, h = 20, c = Math.cos(0.5), s = Math.sin(0.5);
    const w1 = [ex - h * (ux * c - uy * s), ey - h * (ux * s + uy * c)], w2 = [ex - h * (ux * c + uy * s), ey - h * (-ux * s + uy * c)];
    return [[curve(f, 50, 0.45, 0.7), '#1e88e5', 3.5], [poly([w1, [ex, ey], w2], 0.6, 0.7), '#1e88e5', 3.5]];
  },
};

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const watch = (q, tag) => { q.on('pageerror', e => errs.push(tag + 'pageerror: ' + e.message)); q.on('console', m => { if (m.type() === 'error') errs.push(tag + 'console: ' + m.text()); }); };
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage(); watch(p, '');
  const cdp = await ctx.newCDPSession(p);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const idle = () => p.evaluate(() => new Promise(r => setTimeout(r, 60))).then(() => p.waitForFunction(() => !navBusy));
  const pen = (type, x, y, mods = 0) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6, modifiers: mods });
  // Stift entlang eines Linienzugs (Bildschirm-Pixel); finish=false lässt den Stift unten
  async function penPath(pts, { finish = true, step = 6 } = {}) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen' });
    await pen('mousePressed', pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 1; k <= n; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
    }
    if (finish) { const [x, y] = pts.at(-1); await pen('mouseReleased', x, y); await frames(); }
  }
  const drag = (x0, y0, x1, y1, o = {}) => penPath([[x0, y0], [x1, y1]], { step: Math.max(1, Math.hypot(x1 - x0, y1 - y0) / 10), ...o });
  const tap = async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'pen' }); await pen('mousePressed', x, y); await pen('mouseReleased', x, y); await frames(); };
  const newNote = (bg = 'dots') => p.evaluate(async bg => {
    if (S.note) await closeNote();
    const now = Date.now(); const n = { id: uid(), name: 'Test', created: now, updated: now, thumb: null, bg, view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  }, bg);
  const items = () => p.evaluate(() => S.items.map(s => s.t === 's' ? { t: 's', id: s.id, k: s.k || null, g: s.g || null, c: s.c, w: s.w, hl: s.hl, pts: Array.from(s.pts) } : { t: 'i', id: s.id }));
  const geo = list => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const s of list) for (let i = 0; i < s.pts.length; i += 3) { b[0] = Math.min(b[0], s.pts[i]); b[1] = Math.min(b[1], s.pts[i + 1]); b[2] = Math.max(b[2], s.pts[i]); b[3] = Math.max(b[3], s.pts[i + 1]); } return b; };
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, sel);
  const shapesDB = () => p.evaluate(async () => (await dbShapesAll()).sort(byCreated).map(r => ({ id: r.id, name: r.name, created: r.created, w: r.w, h: r.h, f32: r.strokes.every(s => s.pts instanceof Float32Array), strokes: r.strokes.map(s => ({ c: s.c, w: s.w, hl: s.hl, pts: Array.from(s.pts) })) })));
  const openMenu = async () => { if (!(await vis('#shapeMenu'))) await p.click('#bShape'); await p.waitForSelector('#shapeMenu:not(.hidden)'); };
  const closeMenu = async () => { if (await vis('#shapeMenu')) await p.click('#bShape'); };
  const pickCustom = async id => { await openMenu(); await p.click(`#shapeMenu [data-shape="custom:${id}"]`); await frames(); };
  // Auswahl über die Oberfläche speichern (Knopf in der Auswahlleiste, Name im Dialog, Enter)
  async function saveSel(name) {
    await p.waitForSelector('#sSave:not(.hidden)');
    await p.click('#sSave'); await p.waitForSelector('#dlg:not(.hidden)');
    await p.fill('#dlgIn', name); await p.press('#dlgIn', 'Enter');
    await p.waitForFunction(n => CUSTOM.some(r => r.name === n), name);
    return p.evaluate(n => CUSTOM.find(r => r.name === n).id, name);
  }
  // Striche direkt anlegen und mit dem Lasso auswählen (für Beispielformen)
  const mk = list => p.evaluate(list => {
    const ss = list.map(([pts, c, w, hl]) => makeStroke(pts, c, w, hl));
    commit(appendItems(S.items, ss)); setTool('lasso'); setSel(new Set(ss.map(s => s.id))); return ss.map(s => s.id);
  }, list);
  // Pixelvergleich zweier Screenshots
  const cmp = await ctx.newPage(); await cmp.setContent('<body></body>');
  const diff = (a, c) => cmp.evaluate(async ([a, c]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, max = 0, ink = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] < 160 || Math.abs(da[i] - da[i + 2]) > 40) ink++;
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d) { n++; if (d > max) max = d; }
    }
    return { changedPixels: n, maxDelta: max, inkPixels: ink };
  }, [a.toString('base64'), c.toString('base64')]);
  // Vorschau (Stift noch unten) gegen Ergebnis (Stift oben) und gegen neu gezeichnete Kacheln
  async function identity(x0, y0, x1, y1, clip, o = {}) {
    if (o.tap) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' }); await pen('mousePressed', x0, y0); }
    else await drag(x0, y0, x1, y1, { finish: false });
    await p.waitForTimeout(o.wait || 150);
    const live = await p.screenshot({ clip });
    await pen('mouseReleased', o.tap ? x0 : x1, o.tap ? y0 : y1); await p.waitForTimeout(300);
    const fin = await p.screenshot({ clip });
    const v = await p.evaluate(() => { const v = { ...S.view }; zoomAt(VW / 2, VH / 2, 0.5); return v; }); await p.waitForTimeout(200);
    await p.evaluate(v => { setView(v.tx, v.ty, v.z, true); clearTiles(); pathCache.clear(); draw(); }, v); await p.waitForTimeout(250);
    const rer = await p.screenshot({ clip });
    if (o.save) { fs.writeFileSync(path.join(OUT, 'custom_live.png'), live); fs.writeFileSync(path.join(OUT, 'custom_final.png'), fin); }
    return { liveVsFinal: await diff(live, fin), liveVsRerender: await diff(live, rer), finalVsRerender: await diff(fin, rer) };
  }

  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500); await idle();
  const db0 = await p.evaluate(() => ({ v: db.version, stores: [...db.objectStoreNames].sort(), custom: CUSTOM.length, ready: customReady, shape: S.shape }));
  check('freshDbV4', db0.v === 4 && db0.stores.join() === 'books,images,index,items,shapes' && db0.custom === 0 && db0.ready && db0.shape === 'rect', db0);

  // ---------- 1. Zeichnen (Stift schwarz + rot, Textmarker), dazu ein Bild ----------
  await newNote('dots');
  await p.evaluate(() => { setSize('pen', 1); S.color.pen = 'ink'; renderColors(); renderSizes(); if (S.snap) toggleSnap(); });
  await p.click('[data-tool=pen]');
  await penPath([[300, 420], [300, 300], [440, 300], [440, 420], [300, 420]]);
  await penPath([[285, 305], [370, 228], [455, 305]]);
  await p.click('#colors .sw:nth-child(2)');   // rot
  await penPath([[350, 420], [350, 372], [390, 372], [390, 420]]);
  await p.click('[data-tool=hl]');
  await penPath([[275, 444], [465, 444]]);
  await p.click('[data-tool=pen]'); await p.click('#colors .sw:nth-child(1)');
  await penPath([[620, 160], [700, 175], [780, 160]]);   // gehört nicht dazu
  // kleines Bild in das Haus (Bilder werden nicht gespeichert)
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 80; c.height = 60; const g = c.getContext('2d'); g.fillStyle = '#4fa072'; g.fillRect(0, 0, 80, 60);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); const img = uid();
    await dbImagePut({ id: img, n: S.note.id, blob, low: null, w: 80, h: 60 });
    commit(withImages(S.items, [{ t: 'i', id: uid(), img, x: 318, y: 318, w: 36, h: 27 }]));
  });
  await p.waitForTimeout(200);
  const drawn = await items();
  check('drawn', drawn.filter(i => i.t === 's').length === 5 && drawn.filter(i => i.t === 'i').length === 1 && drawn.filter(i => i.hl).length === 1 && drawn.some(i => i.c === '#e53935'), drawn.map(i => [i.t, i.c, i.hl]));

  // ---------- 2. Lasso: Knopf „Als Form speichern“ nur mit Strichen ----------
  await p.click('[data-tool=lasso]');
  await penPath([[250, 200], [490, 200], [490, 480], [250, 480], [250, 205]], { step: 5 });
  const sel1 = await p.evaluate(() => S.sel ? S.items.filter(i => S.sel.ids.has(i.id)).map(i => i.t) : []);
  check('lassoAll', sel1.filter(t => t === 's').length === 4 && sel1.filter(t => t === 'i').length === 1, sel1);
  check('saveButton', await vis('#sSave') && (await p.textContent('#sSave')) === 'Als Form speichern'
    && (await p.$$eval('#selbar button', l => l.map(b => b.id).join())) === 'sColor,sSize,sDup,sSave,sDel', await p.$$eval('#selbar button', l => l.map(b => b.id + ':' + b.textContent)));
  await p.keyboard.press('Escape');
  await drag(345, 337, 346, 337, { steps: 1 }); await frames();   // Antippen des Bildes: Auswahl nur mit Bild
  const imgOnly = await p.evaluate(() => S.sel && S.items.filter(i => S.sel.ids.has(i.id)).map(i => i.t).join());
  check('imageOnlyHidesSave', imgOnly === 'i' && !(await vis('#sSave')) && !(await vis('#sColor')) && await vis('#sDup'), imgOnly);
  await p.keyboard.press('Escape');
  await penPath([[250, 200], [490, 200], [490, 480], [250, 480], [250, 205]], { step: 5 });
  const src = await p.evaluate(() => S.items.filter(i => S.sel.ids.has(i.id) && i.t === 's').map(s => ({ c: s.c, w: s.w, hl: s.hl, pts: Array.from(s.pts) })));

  // ---------- 3. Speichern: Abbrechen speichert nichts, Enter speichert ----------
  await p.click('#sSave'); await p.waitForSelector('#dlg:not(.hidden)');
  const dlg = await p.evaluate(() => [$('#dlgMsg').textContent, $('#dlgIn').value, $('#dlgOk').textContent, document.activeElement === $('#dlgIn')]);
  check('saveDialog', dlg[0] === 'Name der Form:' && dlg[1] === 'Form 1' && dlg[2] === 'Speichern' && dlg[3], dlg);
  await p.click('#dlgNo'); await p.waitForTimeout(150);
  check('cancelSavesNothing', (await shapesDB()).length === 0 && (await p.evaluate(() => CUSTOM.length)) === 0);
  const idHaus = await saveSel('Haus');
  const toastSave = await p.textContent('#toast');
  const [rec] = await shapesDB();
  {
    const g0 = geo(src), x0 = g0[0], y0 = g0[1];
    const rel = rec && rec.strokes.length === 4 && rec.strokes.every((s, k) => s.c === src[k].c && s.w === src[k].w && s.hl === src[k].hl && s.pts.length === src[k].pts.length
      && s.pts.every((v, i) => i % 3 === 2 ? near(v, src[k].pts[i], 1e-6) : near(v, src[k].pts[i] - (i % 3 ? y0 : x0), 1e-3)));
    const gb = rec && geo(rec.strokes);
    check('savedRecord', rec && rec.id === idHaus && rec.name === 'Haus' && typeof rec.created === 'number' && rec.f32 && rel
      && near(gb[0], 0, 1e-6) && near(gb[1], 0, 1e-6) && near(rec.w, g0[2] - g0[0], 1e-3) && near(rec.h, g0[3] - g0[1], 1e-3) && near(gb[2], rec.w, 1e-6) && near(gb[3], rec.h, 1e-6),
      rec && { name: rec.name, w: rec.w, h: rec.h, n: rec.strokes.length, gb, x0, y0, rel });
  }
  check('saveToast', toastSave === 'Gespeichert – zu finden unter Formen › Eigene Formen', toastSave);
  check('selectionKept', await p.evaluate(() => S.sel && S.sel.ids.size === 5));
  // leerer Name -> Standardname; zweite Form heißt „Form 2“
  await p.click('#sSave'); await p.waitForSelector('#dlg:not(.hidden)');
  const def2 = await p.inputValue('#dlgIn');
  await p.fill('#dlgIn', '   '); await p.press('#dlgIn', 'Enter'); await p.waitForFunction(() => CUSTOM.length === 2);
  check('defaultName', def2 === 'Form 2' && (await p.evaluate(() => CUSTOM[1].name)) === 'Form 2', def2);
  await p.evaluate(async () => { await dbShapeDelete(CUSTOM[1].id); await loadCustomShapes(); });
  // zu große Auswahl: Hinweis, kein Dialog
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const pts = []; for (let i = 0; i <= 60000; i++) pts.push(600 + (i % 400), 600 + Math.floor(i / 400) * 0.5, 0.5); const s = makeStroke(pts, 'ink', 2); commit(appendItems(S.items, [s])); setTool('lasso'); setSel(new Set([s.id])); });
  await p.click('#sSave'); await p.waitForTimeout(150);
  const big = await p.evaluate(() => [$('#toast').textContent, $('#dlg').classList.contains('hidden'), CUSTOM.length]);
  check('tooBigRefused', /zu groß/.test(big[0]) && /60\.001 Punkte/.test(big[0]) && big[1] && big[2] === 1, big);
  await p.keyboard.press('Escape'); await p.keyboard.press('Control+z');
  check('bigUndone', (await p.evaluate(() => S.items.length)) === 6);

  // ---------- 4. Bibliothek im Formen-Menü ----------
  await p.click('[data-tool=pen]');
  await openMenu();
  const menu1 = await p.evaluate(() => ({ sections: $$('#shapeMenu .mh').map(e => e.textContent), tiles: $$('#customGrid .cpick').map(b => [b.dataset.shape, b.querySelector('.cn').textContent, b.title]),
    canvas: $$('#customGrid canvas').map(c => [c.width, c.height, c.getBoundingClientRect().width]), del: $$('#customGrid .cdel').length, hint: $('#shapeMenu .mhint').textContent, tool: S.tool }));
  check('menuLibrary', menu1.sections.join() === 'Formen,Graphen,Eigene Formen' && menu1.tiles.length === 1 && menu1.tiles[0][0] === 'custom:' + idHaus && menu1.tiles[0][1] === 'Haus'
    && menu1.canvas[0][0] === 112 && menu1.canvas[0][2] === 56 && menu1.del === 1 && menu1.hint === 'Ziehen zum Zeichnen · Umschalt: gerade/quadratisch' && menu1.tool === 'shape', menu1);
  await p.click(`#customGrid [data-shape="custom:${idHaus}"]`); await frames();
  const picked = await p.evaluate(() => ({ menu: $('#shapeMenu').classList.contains('hidden'), shape: S.shape, pref: localStorage.getItem('notizen.shape'), title: $('#bShape').title, tool: S.tool, colors: $('#colors').style.opacity, sizes: $('#sizes').style.opacity }));
  check('pickCustom', picked.menu && picked.shape === 'custom:' + idHaus && picked.pref === JSON.stringify('custom:' + idHaus) && picked.title === 'Formen (F) – Haus' && picked.tool === 'shape' && picked.colors === '0.35' && picked.sizes === '0.35', picked);
  await openMenu();
  const menu2 = await p.evaluate(() => ({ on: $$('#shapeMenu [data-shape].on').map(b => b.dataset.shape), hint: $('#shapeMenu .mhint').textContent }));
  check('menuMarksCustom', menu2.on.join() === 'custom:' + idHaus && menu2.hint === 'Tippen: in Originalgröße platzieren · Ziehen: Größe wählen', menu2);
  await closeMenu();
  const R = await p.evaluate(id => { const r = CUSTOM.find(x => x.id === id); return { w: r.w, h: r.h, strokes: r.strokes.map(s => ({ c: s.c, w: s.w, hl: s.hl, pts: Array.from(s.pts) })) }; }, idHaus);
  // Striche einer platzierten Form: genau Ecke + gespeicherte Punkte * s, Breite * s, Farben wie gespeichert
  const stampOk = (list, s, x, y) => list.length === R.strokes.length && list.every((it, k) => {
    const q = R.strokes[k]; return it.k === 'custom' && it.c === q.c && it.hl === q.hl && near(it.w, q.w * s, 1e-4) && it.pts.length === q.pts.length
      && it.pts.every((v, i) => i % 3 === 2 ? v === q.pts[i] : near(v, (i % 3 ? y : x) + q.pts[i] * s, 2e-3));
  });
  const added = async n0 => (await items()).slice(n0);

  // ---------- 5. Platzieren: Antippen, Ziehen, nach links oben ziehen, Raster ----------
  let n0 = (await items()).length;
  await tap(720, 620);
  let st = await added(n0), gb = geo(st);
  const gIds = new Set(st.map(s => s.g));
  check('tapPlaces', stampOk(st, 1, 720 - R.w / 2, 620 - R.h / 2) && gIds.size === 1 && !gIds.has(null) && near((gb[0] + gb[2]) / 2, 720, 2e-3) && near((gb[1] + gb[3]) / 2, 620, 2e-3)
    && !drawn.some(d => d.g && gIds.has(d.g)), { n: st.length, gb, g: [...gIds] });
  const tapStamp = st;
  check('toolStays', await p.evaluate(id => S.tool === 'shape' && S.shape === 'custom:' + id, idHaus));
  // Ziehen nach rechts unten: Kasten 0,6 w x 1,2 h -> s = 0,6, obere linke Ecke = Startpunkt
  n0 = (await items()).length;
  await drag(900, 150, 900 + 0.6 * R.w, 150 + 1.2 * R.h);
  st = await added(n0); gb = geo(st);
  check('dragFits', stampOk(st, 0.6, 900, 150) && near(gb[0], 900, 2e-3) && near(gb[1], 150, 2e-3) && near((gb[2] - gb[0]) / (gb[3] - gb[1]), R.w / R.h, 1e-3) && new Set(st.map(s => s.g)).size === 1, { gb, w: st.map(s => s.w) });
  // Ziehen nach links oben: Kasten normalisiert (Ecke = Endpunkt), nicht gespiegelt; s = min(1,2; 0,8) = 0,8
  n0 = (await items()).length;
  const ex = 1400 - 1.2 * R.w, ey = 930 - 0.8 * R.h;
  await drag(1400, 930, ex, ey);
  st = await added(n0); gb = geo(st);
  check('dragUpLeft', stampOk(st, 0.8, ex, ey) && near(gb[0], ex, 2e-3) && near(gb[1], ey, 2e-3), { gb, ex, ey });
  // Raster an (G): Antippen und Ziehen -> obere linke Ecke auf dem Raster, eingepasste Seite = Vielfaches von 28
  await p.keyboard.press('g'); await frames();
  n0 = (await items()).length;
  await tap(1110, 470);
  st = await added(n0); gb = geo(st);
  const tx0 = Math.round((1110 - R.w / 2) / 28) * 28, ty0 = Math.round((470 - R.h / 2) / 28) * 28;
  check('snapTap', stampOk(st, 1, tx0, ty0) && onGrid(gb[0]) && onGrid(gb[1]), { gb, tx0, ty0 });
  n0 = (await items()).length;
  await drag(565, 763, 565 + 150, 763 + 100);   // -> (560, 756) bis (728, 868): 168 x 112
  st = await added(n0); gb = geo(st);
  const sSnap = Math.min(168 / R.w, 112 / R.h), fitW = gb[2] - gb[0], fitH = gb[3] - gb[1];
  check('snapDrag', stampOk(st, sSnap, 560, 756) && onGrid(gb[0]) && onGrid(gb[1]) && (near(fitW, 168, 2e-3) || near(fitH, 112, 2e-3)), { gb, sSnap, fitW, fitH });
  await p.keyboard.press('g'); await frames();
  const stamps = await p.evaluate(() => new Set(S.items.filter(i => i.k === 'custom').map(i => i.g)).size);
  check('placedRepeatedly', stamps === 5 && await p.evaluate(id => S.shape === 'custom:' + id && S.tool === 'shape', idHaus), stamps);

  // ---------- 6. Lasso-Tipp wählt die ganze Form; Rückgängig = ein Schritt ----------
  await p.click('[data-tool=lasso]');
  const tp = [tapStamp[0].pts[3], tapStamp[0].pts[4]];
  await drag(tp[0], tp[1], tp[0] + 1, tp[1], { steps: 1 }); await frames();
  const selT = await p.evaluate(() => S.sel ? [...S.sel.ids] : []);
  check('lassoTapWholeStamp', selT.length === 4 && tapStamp.every(s => selT.includes(s.id)) && await vis('#sSave'), selT.length);
  await p.keyboard.press('Escape');
  const nA = (await items()).length, lastIds = (await items()).slice(-4).map(i => i.id);
  await p.keyboard.press('Control+z');
  const afterUndo = await items();
  await p.keyboard.press('Control+y');
  const afterRedo = await items();
  check('undoOneStep', afterUndo.length === nA - 4 && !afterUndo.some(i => lastIds.includes(i.id)) && afterRedo.length === nA && lastIds.every(id => afterRedo.some(i => i.id === id)), [nA, afterUndo.length, afterRedo.length]);
  // eigene Form gewählt: Farbe antippen wechselt zum Stift (Farben gelten nicht für eigene Formen)
  await p.keyboard.press('f');
  await p.click('#colors .sw:nth-child(6)');
  check('colorSwitchesToPen', await p.evaluate(() => [S.tool, S.color.pen, $('#colors').style.opacity]).then(v => v[0] === 'pen' && v[1] === '#1e88e5' && v[2] === '1'));
  await p.evaluate(() => { S.color.pen = 'ink'; store.set('color', S.color); renderColors(); });
  await p.keyboard.press('f');
  check('keyFKeepsCustom', await p.evaluate(id => S.tool === 'shape' && S.shape === 'custom:' + id && $('#colors').style.opacity === '0.35', idHaus));
  await p.screenshot({ path: path.join(OUT, 'custom_placed.png') });

  // ---------- 7. Vorschau = Ergebnis (Pixel) ----------
  await newNote('blank');
  const starIds = await mk(DEMO.Stern(200, 250));
  const idStern = await saveSel('Stern');
  await p.evaluate(() => { clearSel(); commit([]); });
  await pickCustom(idStern);
  const id = {};
  id.dragBlank = await identity(300, 300, 560, 520, { x: 270, y: 270, width: 320, height: 280 }, { save: true });
  id.tapBlank = await identity(900, 400, 0, 0, { x: 780, y: 280, width: 240, height: 240 }, { tap: true });
  await p.evaluate(() => zoomAt(VW / 2, VH / 2, 1.37)); await p.waitForTimeout(200);
  id.dragZoom137 = await identity(1000, 600, 1250, 860, { x: 980, y: 580, width: 290, height: 300 });
  await newNote('dots'); await pickCustom(idStern);
  id.dragDots = await identity(300, 300, 520, 500, { x: 270, y: 270, width: 280, height: 260 });
  await p.evaluate(() => toggleDark()); await frames();
  await newNote('blank'); await pickCustom(idStern);
  id.dragDark = await identity(500, 300, 760, 560, { x: 470, y: 270, width: 320, height: 320 });
  await p.evaluate(() => toggleDark()); await frames();
  // Haus enthält einen Textmarker: Kacheln werden neu gezeichnet; Ergebnis = neu gezeichnete Kacheln
  await newNote('blank'); await pickCustom(idHaus);
  id.hlStamp = await identity(300, 260, 600, 560, { x: 280, y: 240, width: 340, height: 340 });
  const penOnly = ['dragBlank', 'tapBlank', 'dragZoom137', 'dragDark'];
  // Absetzen ändert kein Pixel. Neu gezeichnete Kacheln: höchstens 1 Stufe Rundung (Live-Ebene mit Alphakanal, Kachel ohne)
  check('pixelIdentity', penOnly.every(k => id[k].liveVsFinal.changedPixels === 0 && id[k].liveVsFinal.inkPixels > 300 && id[k].liveVsRerender.maxDelta <= 1 && id[k].liveVsRerender.changedPixels <= 4)
    && id.dragDots.liveVsFinal.changedPixels === 0 && id.dragDots.liveVsRerender.maxDelta <= 1
    && id.hlStamp.finalVsRerender.changedPixels === 0 && id.hlStamp.liveVsFinal.maxDelta <= 2, id);

  // ---------- 8. Große Form: flüssige Vorschau, genaues Ergebnis ----------
  {
    await newNote('blank');
    const list = []; for (let k = 0; k < 50; k++) { const pts = []; for (let i = 0; i < 500; i++) pts.push(100 + i * 1.6, 150 + k * 9 + Math.sin(i / 9 + k) * 6, 0.4 + 0.3 * Math.sin(i / 30)); list.push([pts, k % 3 ? 'ink' : '#1e88e5', 1.5]); }
    await mk(list);
    const idBig = await saveSel('Groß');
    await p.evaluate(() => { clearSel(); commit([]); });
    await pickCustom(idBig);
    // Vorschau beim Ziehen (Pfade nur skaliert) gegen genaue Geometrie in jedem Bild (zum Vergleich)
    const perf = await p.evaluate(id => {
      const r = customOf('custom:' + id), a = { kind: 'shape', shape: 'custom:' + id, custom: r, c: 'ink', w: 2, a0: [200, 200], b: [900, 700], g: 'x', geo: null }, t = [];
      for (let k = 0; k < 30; k++) { a.b[0] = 900 + k; a.b[1] = 700 - k; const t0 = performance.now(); liveClear(); liveWorld(); liveShape(a); t.push(performance.now() - t0); }
      liveClear(); t.sort((x, y) => x - y);
      const t1 = performance.now(); for (const s of stampStrokes(r, 0.8, 200, 200, 'x')) buildPath(s.pts, s.w, s.hl);
      return { points: stampData(r).n, med: +t[15].toFixed(2), max: +t.at(-1).toFixed(2), quick: !!a.geo.xf, exactPerFrameMs: +(performance.now() - t1).toFixed(1) };
    }, idBig);
    res.bigPreview = perf;
    check('bigPreviewFast', perf.points === 25000 && perf.quick && perf.med < 8, perf);
    const R2 = await p.evaluate(id => { const r = customOf('custom:' + id); return { w: r.w, h: r.h, q: Array.from(r.strokes[7].pts.slice(0, 30)), w7: r.strokes[7].w }; }, idBig);
    const bigId = await identity(150, 200, 150 + 0.5 * R2.w, 200 + 1.2 * R2.h, { x: 130, y: 180, width: Math.round(0.5 * R2.w + 40), height: Math.round(0.5 * R2.h + 40) }, { wait: 900 });   // Vorschau wird nach dem Ziehen in genauer Größe nachgezeichnet
    const s7 = await p.evaluate(() => { const s = S.items[7]; return { k: s.k, w: s.w, pts: Array.from(s.pts.slice(0, 30)) }; });
    check('bigCommitExact', s7.k === 'custom' && near(s7.w, R2.w7 * 0.5, 1e-5) && s7.pts.every((v, i) => i % 3 === 2 ? v === R2.q[i] : near(v, (i % 3 ? 200 : 150) + R2.q[i] * 0.5, 2e-3))
      && bigId.liveVsFinal.changedPixels < bigId.liveVsFinal.inkPixels * 0.03 && bigId.liveVsFinal.inkPixels > 3000 && bigId.finalVsRerender.changedPixels < bigId.finalVsRerender.inkPixels * 0.01, { s7: s7.w, bigId });
    // Löschen aus der Bibliothek: Abbrechen behält, Löschen entfernt; Menü bleibt offen, platzierte Striche bleiben
    await openMenu();
    await p.click(`#customGrid .ct:has([data-shape="custom:${idBig}"]) .cdel`); await p.waitForSelector('#dlg:not(.hidden)');
    const askMsg = await p.evaluate(() => [$('#dlgMsg').textContent, $('#dlgOk').textContent, $('#dlgOk').classList.contains('danger')]);
    await p.click('#dlgNo'); await p.waitForTimeout(100);
    const kept = await p.evaluate(id => [CUSTOM.some(r => r.id === id), !$('#shapeMenu').classList.contains('hidden')], idBig);
    await p.click(`#customGrid .ct:has([data-shape="custom:${idBig}"]) .cdel`); await p.waitForSelector('#dlg:not(.hidden)');
    await p.click('#dlgOk'); await p.waitForFunction(id => !CUSTOM.some(r => r.id === id), idBig);
    const gone = await p.evaluate(async id => ({ db: !!(await dbShapeGet(id)), tile: !!document.querySelector(`#customGrid [data-shape="custom:${id}"]`), menu: !$('#shapeMenu').classList.contains('hidden'), shape: S.shape,
      pref: localStorage.getItem('notizen.shape'), placed: S.items.filter(i => i.k === 'custom').length, title: $('#bShape').title }), idBig);
    check('deleteFromLibrary', askMsg[0] === 'Form „Groß“ löschen?' && askMsg[1] === 'Löschen' && askMsg[2] && kept[0] && kept[1] && !gone.db && !gone.tile && gone.menu
      && gone.shape === 'rect' && gone.pref === '"rect"' && gone.placed === 50 && gone.title === 'Formen (F) – Rechteck', { askMsg, kept, gone });
    await closeMenu();
  }

  // ---------- 9. Vorschaubilder: richtige Tintenfarbe hell/dunkel, Zwischenspeicher je Darstellung ----------
  {
    const stats = () => p.evaluate(id => {
      const c = document.querySelector(`#customGrid [data-shape="custom:${id}"] canvas`), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let dark = 0, light = 0, red = 0, yellow = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        if (r < 70 && g < 70 && b < 70) dark++; else if (r > 215 && g > 215 && b > 215) light++; else if (r > 180 && g < 100 && b < 100) red++;
      }
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] > 150 && d[i + 1] > 130 && d[i + 2] < 120) yellow++;
      const mark = !!c.__mark; c.__mark = true;
      return { dark, light, red, yellow, mark };
    }, idHaus);
    await openMenu(); const l1 = await stats(); await closeMenu();
    await p.evaluate(() => toggleDark()); await openMenu(); const d1 = await stats(); await closeMenu();
    await p.evaluate(() => toggleDark()); await openMenu(); const l2 = await stats(); await closeMenu();
    check('thumbInkLight', l1.dark > 150 && l1.light === 0 && l1.red > 40 && l1.yellow > 40 && !l1.mark, l1);
    check('thumbInkDark', d1.light > 150 && d1.dark === 0 && d1.red > 40 && !d1.mark, d1);
    check('thumbCachedPerTheme', l2.mark && l2.dark === l1.dark, l2);
  }

  // ---------- 10. Mehrere Formen, Screenshots hell und dunkel ----------
  await newNote('dots');
  await p.evaluate(() => setSize('pen', 1));
  const demoIds = {};
  let col = 0;
  for (const name of ['Herz', 'Smiley', 'Blume', 'Wolke', 'Haken', 'Pfeil']) {
    await mk(DEMO[name](160 + (col % 6) * 210, 230)); demoIds[name] = await saveSel(name); await p.keyboard.press('Escape'); col++;
  }
  await p.evaluate(() => { clearSel(); commit([]); });
  const lib = await p.evaluate(() => CUSTOM.map(r => r.name));
  check('libraryOrder', lib.join() === 'Haus,Stern,Herz,Smiley,Blume,Wolke,Haken,Pfeil', lib);
  // Seite mit platzierten Formen
  await pickCustom(demoIds.Herz); await tap(200, 260); await drag(330, 180, 470, 320);
  await pickCustom(idStern); await tap(620, 250); await drag(760, 170, 980, 330);
  await pickCustom(demoIds.Blume); await tap(1120, 260); await drag(1240, 150, 1400, 380);
  await pickCustom(demoIds.Smiley); await tap(220, 560); await drag(340, 460, 520, 660);
  await pickCustom(idHaus); await tap(700, 600); await drag(860, 460, 1040, 700);
  await pickCustom(demoIds.Wolke); await tap(1200, 520);
  await pickCustom(demoIds.Haken); await tap(1180, 700); await tap(1300, 700);
  await pickCustom(demoIds.Pfeil); await drag(200, 760, 420, 920);
  await p.waitForTimeout(200);
  for (const mode of ['light', 'dark']) {
    await p.evaluate(m => { if (S.dark !== (m === 'dark')) toggleDark(); }, mode); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, `custom_page_${mode}.png`) });
    await pickCustom(demoIds.Blume); await openMenu(); await p.waitForTimeout(150);
    const mb = await p.$eval('#shapeMenu', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    res['menuBox_' + mode] = mb;
    await p.screenshot({ path: path.join(OUT, `custom_menu_${mode}.png`), clip: { x: 0, y: 0, width: Math.min(1440, mb.x + mb.w + 40), height: Math.min(960, mb.y + mb.h + 30) } });
    check('menuFits_' + mode, mb.y + mb.h <= 960 && mb.x >= 0 && mb.x + mb.w <= 1440, mb);
    await closeMenu();
  }
  await p.evaluate(() => { if (S.dark) toggleDark(); }); await p.waitForTimeout(200);
  // Auswahlleiste mit „Als Form speichern“
  await p.click('[data-tool=lasso]');
  await penPath([[150, 450], [560, 450], [560, 690], [150, 690], [150, 455]], { step: 6 });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, 'custom_selbar.png'), clip: { x: 0, y: 330, width: 760, height: 400 } });
  check('selbarFits', await p.evaluate(() => { const r = $('#selbar').getBoundingClientRect(); return !$('#selbar').classList.contains('hidden') && r.left >= 0 && r.right <= innerWidth && r.top > barBottom(); }));
  await p.keyboard.press('Escape');
  // viele Formen: das Raster scrollt, das Menü bleibt im Bild (Hochformat)
  await p.evaluate(async () => { const r = CUSTOM[2]; for (let k = 0; k < 10; k++) { const c = { ...r, id: uid(), name: r.name + ' ' + (k + 2), created: r.created + k + 1 }; await dbShapePut(c); } await loadCustomShapes(); });
  await p.setViewportSize({ width: 960, height: 1440 }); await p.waitForTimeout(300);
  await openMenu(); await p.waitForTimeout(150);
  const many = await p.evaluate(() => { const g = $('#customGrid'), m = $('#shapeMenu').getBoundingClientRect(); return { tiles: $$('#customGrid .cpick').length, scrolls: g.scrollHeight > g.clientHeight + 20, gridH: g.clientHeight, menu: [m.left >= 0, m.right <= innerWidth, m.bottom <= innerHeight, m.top >= barBottom()] }; });
  await p.screenshot({ path: path.join(OUT, 'custom_menu_many_portrait.png') });
  check('manyShapesScroll', many.tiles === 18 && many.scrolls && many.menu.every(Boolean), many);
  await closeMenu();
  await p.setViewportSize({ width: 1440, height: 960 }); await p.waitForTimeout(300);
  await p.evaluate(async () => { for (const r of CUSTOM.filter(r => / \d+$/.test(r.name))) await dbShapeDelete(r.id); await loadCustomShapes(); });

  // ---------- 11. Neu laden: Bibliothek, Auswahl und platzierte Formen bleiben; gilt für jede Seite ----------
  const libBefore = await shapesDB();
  const noteId = await p.evaluate(() => S.note.id), pageBefore = await items();
  await p.evaluate(() => window.__flush());
  await p.reload(); await p.waitForTimeout(600); await idle(); await p.waitForFunction(() => customReady);
  const libAfter = await shapesDB();
  check('libraryPersisted', JSON.stringify(libAfter) === JSON.stringify(libBefore) && libAfter.length === 8, libAfter.map(r => r.name));
  check('prefPersisted', await p.evaluate(id => S.shape === 'custom:' + id && $('#bShape').title === 'Formen (F) – Blume', demoIds.Blume));
  await p.evaluate(async id => { await openNote((await dbIndexAll()).find(n => n.id === id)); }, noteId); await p.waitForTimeout(300);
  const pageAfter = await items();
  check('stampsPersisted', JSON.stringify(pageAfter) === JSON.stringify(pageBefore) && new Set(pageAfter.map(i => i.g)).size === 14 && pageAfter.every(i => i.k === 'custom'), { before: pageBefore.length, after: pageAfter.length });
  await p.click('[data-tool=lasso]');
  const hz = pageAfter.find(i => pageAfter.filter(j => j.g === i.g).length === 4);   // ein platziertes Haus
  await drag(hz.pts[3], hz.pts[4], hz.pts[3] + 1, hz.pts[4], { steps: 1 }); await frames();
  check('groupAfterReload', await p.evaluate(g => S.sel && S.sel.ids.size === 4 && S.items.filter(i => S.sel.ids.has(i.id)).every(i => i.g === g), hz.g));
  await p.keyboard.press('Escape');
  // anderes Buch, andere Seite: dieselbe Bibliothek
  await p.evaluate(async () => { await closeNote(); const b = { id: uid(), name: 'Bio', color: 'green', created: Date.now() }; await dbBookPut(b); const now = Date.now(); const n = { id: uid(), name: 'Seite 1', created: now, updated: now, thumb: null, bg: 'grid', view: { tx: 0, ty: 0, z: 1 }, book: b.id }; await dbIndexPut(n); await openNote(n); });
  await p.waitForTimeout(200);
  await p.keyboard.press('f'); await tap(500, 500);
  check('globalLibrary', await p.evaluate(() => S.items.length === CUSTOM.find(r => r.name === 'Blume').strokes.length && S.items.every(i => i.k === 'custom')));

  // ---------- 12. Sicherung (Format 3) mit Formen -> Formen löschen -> Wiederherstellen ----------
  await p.click('#bBack'); await idle(); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bk = path.join(OUT, 'custom-backup.notizen'); await dl.saveAs(bk);
  const toastBk = await p.textContent('#toast');
  const lines = fs.readFileSync(bk, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const kinds = lines.map(l => l.k || 'head').join(' ');
  const shapeLines = lines.filter(l => l.k === 'shape');
  const rounded = shapeLines.every(l => l.strokes.every(s => Array.isArray(s.pts) && s.pts.every(v => typeof v === 'number' && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)));
  check('backupHasShapes', lines[0].format === 3 && shapeLines.length === 8 && /^head (book )+(shape ){8}note/.test(kinds + ' ') && rounded
    && shapeLines.map(l => l.name).join() === libAfter.map(r => r.name).join() && shapeLines.every(l => l.id && l.created && l.w > 0 && l.h > 0), { kinds: kinds.slice(0, 120), n: shapeLines.length, rounded });
  check('backupToast', /eigene Formen gesichert$/.test(toastBk) && /8 eigene Formen/.test(toastBk), toastBk);
  await p.evaluate(async () => { for (const r of await dbShapesAll()) await dbShapeDelete(r.id); await loadCustomShapes(); });
  check('libraryEmptied', await p.evaluate(() => CUSTOM.length === 0 && S.shape === 'rect'));
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy && CUSTOM.length === 8, null, { timeout: 20000 }); await idle();
  const toastRs = await p.textContent('#toast');
  const libRestored = await shapesDB();
  const sameish = libRestored.length === 8 && libRestored.every((r, k) => { const o = libAfter[k]; return r.id === o.id && r.name === o.name && r.created === o.created && r.f32 && near(r.w, o.w, 0.011) && near(r.h, o.h, 0.011)
    && r.strokes.length === o.strokes.length && r.strokes.every((s, j) => s.c === o.strokes[j].c && s.w === o.strokes[j].w && s.hl === o.strokes[j].hl && s.pts.every((v, i) => near(v, o.strokes[j].pts[i], 0.0051))); });
  check('restoreShapes', sameish && /8 eigene Formen/.test(toastRs), { toastRs, n: libRestored.length });
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy); await p.waitForTimeout(500); await idle();
  const toastRs2 = await p.textContent('#toast');
  check('restoreTwiceNoDuplicates', (await p.evaluate(() => CUSTOM.length)) === 8 && !/eigene Form/.test(toastRs2), toastRs2);
  // wiederhergestellte Form platzieren
  await p.evaluate(async () => { const n = (await dbIndexAll()).find(m => m.name === 'Seite 1'); await openNote(n); setShape('custom:' + CUSTOM[0].id); setTool('shape'); });
  await p.waitForTimeout(200); const nr = await p.evaluate(() => S.items.length);
  await tap(800, 500);
  check('placeRestored', await p.evaluate(n => S.items.length === n + 4 && S.items.slice(-4).every(i => i.k === 'custom'), nr));
  await p.click('#bBack'); await idle();

  // ---------- 13. Neuer Kontext: alte Sicherung (Format 2, ohne Formen); leere Bibliothek ----------
  {
    const c2 = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 }); const q = await c2.newPage(); watch(q, 'old2: ');
    await q.goto('file://' + DIR + '/Notizen.html'); await q.waitForTimeout(400);
    await q.setInputFiles('#fRestore', OLD2); await q.waitForFunction(() => !navBusy && $$('#grid .book').length === 1, null, { timeout: 30000 });
    const r = await q.evaluate(async () => ({ notes: (await dbIndexAll()).length, shapes: (await dbShapesAll()).length, custom: CUSTOM.length, toast: $('#toast').textContent }));
    check('oldBackupRestores', r.notes > 0 && r.shapes === 0 && r.custom === 0 && /wiederhergestellt$/.test(r.toast), r);
    // leere Bibliothek im Menü (Hinweis)
    await q.evaluate(async () => { const now = Date.now(); const n = { id: uid(), name: 'Leer', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } }; await dbIndexPut(n); await openNote(n); });
    await q.waitForTimeout(200); await q.click('#bShape'); await q.waitForTimeout(150);
    const e = await q.evaluate(() => ({ text: $('#customGrid .cempty') && $('#customGrid .cempty').textContent, tiles: $$('#customGrid .cpick').length }));
    const mb = await q.$eval('#shapeMenu', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await q.screenshot({ path: path.join(OUT, 'custom_menu_empty.png'), clip: { x: 0, y: 0, width: Math.min(1440, mb.x + mb.w + 40), height: mb.y + mb.h + 30 } });
    check('emptyLibraryHint', e.text === 'Etwas zeichnen, mit dem Lasso markieren und „Als Form speichern“ tippen.' && e.tiles === 0, e);
    await c2.close();
  }

  // ---------- 14. Upgrade einer Datenbank Version 3 ohne „shapes“ (1.4 vor Teil C) auf Version 4 ----------
  {
    const c3 = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 }); const q = await c3.newPage(); watch(q, 'v3: ');
    await q.goto('file://' + DIR + '/Notizen-v13.html'); await q.waitForTimeout(400);
    await q.click('#hNew'); await q.waitForTimeout(400);
    await q.mouse.move(300, 300); await q.mouse.down(); await q.mouse.move(460, 340, { steps: 8 }); await q.mouse.up();
    await q.click('#bBack'); await q.waitForTimeout(800);
    // so wie 1.4 (Teil A + B) die Datenbank hinterlassen hat: Version 3 mit „books“, Seiten mit book
    await q.evaluate(() => new Promise((res, rej) => {
      db.close();
      const r = indexedDB.open('notizen-app', 3);
      r.onupgradeneeded = () => {
        const d = r.result, t = r.transaction;
        d.createObjectStore('books', { keyPath: 'id' }).put({ id: 'bk3', name: 'Mathe', color: 'teal', created: 1 });
        t.objectStore('index').openCursor().onsuccess = ev => { const c = ev.target.result; if (c) { c.update({ ...c.value, book: 'bk3' }); c.continue(); } };
      };
      r.onsuccess = () => { r.result.close(); res(); }; r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blockiert'));
    }));
    const v3 = await q.evaluate(() => new Promise(res => { const r = indexedDB.open('notizen-app'); r.onsuccess = async () => { const d = r.result; const out = { v: d.version, stores: [...d.objectStoreNames].sort() }; d.close(); res(out); }; }));
    await q.goto('file://' + DIR + '/Notizen.html'); await q.waitForTimeout(500); await q.waitForFunction(() => customReady && !navBusy);
    const v4 = await q.evaluate(async () => { const notes = await dbIndexAll(); return { v: db.version, stores: [...db.objectStoreNames].sort(), books: (await reqP(db.transaction('books').objectStore('books').getAll())).map(b => b.name), notes: notes.map(n => [n.book, (n.thumb || '').length > 100]), items: (await dbItems(notes[0].id)).length, shelf: $$('#grid .book .nm').map(e => e.textContent) }; });
    check('upgradeV3toV4', v3.v === 3 && !v3.stores.includes('shapes') && v4.v === 4 && v4.stores.join() === 'books,images,index,items,shapes' && v4.books.join() === 'Mathe'
      && v4.notes.length === 1 && v4.notes[0][0] === 'bk3' && v4.notes[0][1] && v4.items === 1 && v4.shelf.join() === 'Mathe', { v3, v4 });
    await q.evaluate(async () => { await openNote((await dbIndexAll())[0]); setTool('lasso'); setSel(new Set([S.items[0].id])); });
    await q.click('#sSave'); await q.waitForSelector('#dlg:not(.hidden)'); await q.press('#dlgIn', 'Enter');
    await q.waitForFunction(() => CUSTOM.length === 1);
    check('saveAfterUpgrade', await q.evaluate(async () => (await dbShapesAll()).length === 1 && CUSTOM[0].name === 'Form 1'));
    await c3.close();
  }

  check('noErrors', errs.length === 0, errs);
  res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(res.fails.length || errs.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(res, null, 1)); process.exit(1); });
