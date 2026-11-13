// Loslassen ohne ganze Kacheln neu zu rastern: ein neues Tape kommt obendrauf, Textmarker und Striche oder Formen unter
// einem Tape werden als Streifen neu gemalt. renderTile wird dabei nicht aufgerufen, und die Kacheln sehen danach aus wie
// frisch gemalt (hell und dunkel, mit Füllung, mit Figuren-Tape): mit Ausschnitt rechnet der Browser die Kantenglättung
// an einzelnen Pixeln minimal anders (auch ganz ohne Änderung), ein fehlender Strich gäbe Hunderte deutlich andere Pixel
// node tests/repaint.js [Notizen.html]
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
    const now = Date.now(), n = { id: uid(), name: 'Neu malen', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
    let seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, list = [];
    for (let k = 0; k < 900; k++) { const x = 80 + rnd() * 1250, y = 90 + rnd() * 820, m = 8 + Math.floor(rnd() * 12), q = []; for (let i = 0; i < m; i++) q.push(x + i * 2.2 + Math.sin(i / 2) * 3, y + Math.cos(i / 1.7) * 5, 0.4 + rnd() * 0.4); list.push(makeStroke(q, rnd() < 0.2 ? '#e53935' : 'ink', 2 + rnd() * 2, false)); }
    for (let k = 0; k < 12; k++) { const x = 100 + rnd() * 1000, y = 120 + rnd() * 700; list.push(makeStroke([x, y, .5, x + 90, y + 2, .5, x + 200, y, .5], '#fdd835', 20, true)); }
    list.push(makeStroke([300, 400, .5, 700, 404, .5], '#8ec5ef', 26, false, { tp: 'uni', hid: true }));
    list.push(makeStroke([800, 300, .5, 860, 700, .5], '#f8bbd0', 30, false, { tp: 'streifen', hid: true }));
    commit(appendItems(S.items, list));
    window.__rt = 0; const f = window.renderTile; window.renderTile = (...a) => { window.__rt++; return f(...a); };
  });
  await p.waitForTimeout(600);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const T_ = await p.evaluate(() => T);
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6 });
  // Zug mit dem Stift; beim Loslassen renderTile zählen; danach die Kacheln unter dem neuen Strich mit frisch gemalten vergleichen
  async function scenario(name, setup, pts, arg) {
    await p.evaluate(setup, arg); await p.waitForTimeout(150);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen' });
    await pen('mousePressed', ...pts[0]);
    for (const q of pts.slice(1)) await pen('mouseMoved', ...q);
    await frames();
    await p.evaluate(() => { window.__rt = 0; });
    await pen('mouseReleased', ...pts.at(-1)); await frames(); await p.waitForTimeout(100);
    const r = await p.evaluate(() => {
      const it = S.items.at(-1), bb = itemBox(it), out = { rt: window.__rt, k: it.k || (it.tp ? 'tape' : it.hl ? 'hl' : 'pen'), tiles: 0, big: 0, small: 0, max: 0 };
      for (const [key, t] of tiles) {
        if (t.L !== S.level || !boxHit(t.wb, bb)) continue;
        const [, i, j] = key.split(':').map(Number), c = document.createElement('canvas'); c.width = c.height = T;
        const fresh = { c, ctx: c.getContext('2d', { alpha: false }), L: t.L, wb: t.wb, v: 0 };
        paintTile(fresh, i, j, null);
        const A = t.ctx.getImageData(0, 0, T, T).data, B = fresh.ctx.getImageData(0, 0, T, T).data;
        for (let q = 0; q < A.length; q += 4) { const d = Math.max(Math.abs(A[q] - B[q]), Math.abs(A[q + 1] - B[q + 1]), Math.abs(A[q + 2] - B[q + 2])); if (d > 40) out.big++; else if (d > 2) out.small++; if (d > out.max) out.max = d; }
        out.tiles++;
      }
      return out;
    });
    res[name] = r;
    check(name + ': keine ganze Kachel neu, danach wie frisch gemalt', r.rt === 0 && r.tiles > 0 && r.big <= 20 && r.small <= r.tiles * T_ * T_ * 0.004, r);
    await p.evaluate(() => { if (S.sel) clearSel(); }); await frames();
  }
  const line = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n + Math.sin(i / 3) * 3]);
  await scenario('Textmarker über Schrift und Textmarker', () => { setTool('hl'); S.size.hl = 22; S.color.hl = '#fdd835'; S.straight.hl = false; }, line(150, 250, 900, 520, 40));
  await scenario('Stift quer unter einem Tape', () => { setTool('pen'); S.size.pen = 3; S.straight.pen = false; }, line(500, 330, 520, 480, 30));
  await scenario('Rechteck unter einem Tape', () => { setShape('rect'); S.shapeStyle = { ds: 'solid', rnd: 0, sl: 0, fs: 'none' }; setTool('shape'); }, line(600, 250, 900, 600, 30));
  await scenario('Rechteck mit Schraffur, skizzenhaft', () => { setShape('rect'); S.shapeStyle = { ds: 'dash', rnd: 1, sl: 2, fs: 'hachure' }; setTool('shape'); }, line(250, 600, 650, 850, 30));
  const motif = await p.evaluate(() => (TAPE_PATTERNS.find(([k]) => TAPE_MOTIFS[k]) || ['uni'])[0]);
  await scenario('Tape mit Figuren obendrauf', m => { setTool('tape'); S.tapePat = m; S.straight.tape = false; }, line(120, 700, 1100, 760, 50), motif);
  await scenario('Tape uni obendrauf', () => { setTool('tape'); S.tapePat = 'uni'; }, line(200, 150, 1000, 200, 40));
  // Radierer: wo weggewischt wird, nur Streifen neu (keine ganze Kachel), danach wie frisch gemalt
  await p.evaluate(() => { setTool('eraser'); window.__rt = 0; window.__n0 = S.items.length; });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 350, y: 600, pointerType: 'pen' }); await pen('mousePressed', 350, 600);
  for (let k = 1; k <= 30; k++) { await pen('mouseMoved', 350 + k * 12, 600 + Math.sin(k / 3) * 30); if (k % 3 === 0) await frames(); }
  await pen('mouseReleased', 710, 600); await frames(); await p.waitForTimeout(150);
  res.erase = await p.evaluate(() => {
    const bb = [330, 550, 730, 650], out = { rt: window.__rt, removed: window.__n0 - S.items.length, tiles: 0, big: 0, small: 0, max: 0 };
    for (const [key, t] of tiles) {
      if (t.L !== S.level || !boxHit(t.wb, bb)) continue;
      const [, i, j] = key.split(':').map(Number), c = document.createElement('canvas'); c.width = c.height = T;
      const fresh = { c, ctx: c.getContext('2d', { alpha: false }), L: t.L, wb: t.wb, v: 0 }; paintTile(fresh, i, j, null);
      const A = t.ctx.getImageData(0, 0, T, T).data, B = fresh.ctx.getImageData(0, 0, T, T).data;
      for (let q = 0; q < A.length; q += 4) { const d = Math.max(Math.abs(A[q] - B[q]), Math.abs(A[q + 1] - B[q + 1]), Math.abs(A[q + 2] - B[q + 2])); if (d > 40) out.big++; else if (d > 2) out.small++; if (d > out.max) out.max = d; }
      out.tiles++;
    }
    return out;
  });
  check('Radierer: keine ganze Kachel neu, danach wie frisch gemalt', res.erase.rt === 0 && res.erase.removed > 3 && res.erase.tiles > 0 && res.erase.big <= 20 && res.erase.small <= res.erase.tiles * T_ * T_ * 0.004, res.erase);
  // Vergleich der Kacheln in einem Kasten mit frisch gemalten
  const compare = bb => p.evaluate(bb => {
    const out = { tiles: 0, big: 0, small: 0, max: 0 };
    for (const [key, t] of tiles) {
      if (t.L !== S.level || !boxHit(t.wb, bb)) continue;
      const [, i, j] = key.split(':').map(Number), c = document.createElement('canvas'); c.width = c.height = T;
      const fresh = { c, ctx: c.getContext('2d', { alpha: false }), L: t.L, wb: t.wb, v: 0 }; paintTile(fresh, i, j, null);
      const A = t.ctx.getImageData(0, 0, T, T).data, B = fresh.ctx.getImageData(0, 0, T, T).data;
      for (let q = 0; q < A.length; q += 4) { const d = Math.max(Math.abs(A[q] - B[q]), Math.abs(A[q + 1] - B[q + 1]), Math.abs(A[q + 2] - B[q + 2])); if (d > 40) out.big++; else if (d > 2) out.small++; if (d > out.max) out.max = d; }
      out.tiles++;
    }
    return out;
  }, bb);
  const fine = r => r.tiles > 0 && r.big <= 20 && r.small <= r.tiles * T_ * T_ * 0.004;
  // Rückgängig (holt die weggewischten Striche zurück): nur Streifen neu, danach wie frisch gemalt
  await p.evaluate(() => { window.__rt = 0; undo(); }); await frames(); await p.waitForTimeout(100);
  res.undo = { rt: await p.evaluate(() => window.__rt), back: await p.evaluate(() => S.items.length - window.__n0), ...(await compare([330, 550, 730, 650])) };
  check('Rückgängig: keine ganze Kachel neu, danach wie frisch gemalt', res.undo.rt === 0 && res.undo.back === 0 && fine(res.undo), res.undo);
  // Auswahl verschieben: am Anfang (ohne die Auswahl) und am Ende (an der neuen Stelle) nur Streifen, danach wie frisch gemalt
  await p.evaluate(() => { setTool('lasso'); const ids = new Set(S.items.filter(it => it.t === 's' && !it.tp && !it.hl && boxHit(it.bb, [600, 250, 760, 330])).map(it => it.id)); setSel(ids); window.__sel = ids.size; window.__rt = 0; });
  const sb = await p.evaluate(() => S.sel.bb);
  const mx = (sb[0] + sb[2]) / 2, my = (sb[1] + sb[3]) / 2;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, pointerType: 'pen' }); await pen('mousePressed', mx, my);
  for (let k = 1; k <= 12; k++) { await pen('mouseMoved', mx + k * 9, my + k * 5); if (k % 3 === 0) await frames(); }
  await pen('mouseReleased', mx + 108, my + 60); await frames(); await p.waitForTimeout(150);
  res.move = { sel: await p.evaluate(() => window.__sel), rt: await p.evaluate(() => window.__rt), moved: await p.evaluate(() => !!S.sel && S.sel.bb[0] > 0), ...(await compare([sb[0] - 10, sb[1] - 10, sb[2] + 120, sb[3] + 70])) };
  check('Auswahl verschieben: keine ganze Kachel neu, danach wie frisch gemalt', res.move.sel > 3 && res.move.rt === 0 && fine(res.move), res.move);
  await p.evaluate(() => clearSel());
  await p.evaluate(() => { S.dark = true; applyDark(); }); await p.waitForTimeout(400);
  await scenario('Dunkel: Textmarker', () => { setTool('hl'); }, line(200, 880, 1000, 860, 40));
  await scenario('Dunkel: Stift unter Tape', () => { setTool('pen'); }, line(830, 280, 840, 720, 30));
  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
