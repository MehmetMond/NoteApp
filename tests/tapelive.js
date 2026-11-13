// Tape beim Ziehen: Antippen zeigt kein dünnes Stück (leer und auf einem Tape, Seite und Notiz); ein langes Tape (auch mit
// Figuren) wird je Bild nur am Ende neu gemalt und sieht dabei aus wie das ganze Tape. Wie ein Stift: wenige Punkte je Bild.
// node tests/tapelive.js [Notizen.html]
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
    const now = Date.now(), n = { id: uid(), name: 'Tape', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
    commit(appendItems(S.items, [makeStroke([400, 200, .5, 800, 204, .5], '#8ec5ef', 26, false, { tp: 'uni', hid: true })]));
    window.__regs = []; const f = window.tapeLive; window.tapeLive = (...a) => { const R = f(...a); window.__regs.push((R[2] - R[0]) * (R[3] - R[1])); return R; };
  });
  await p.waitForTimeout(300);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6 });
  const inked = card => p.evaluate(card => { const c = card ? ncLive : cvLive, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; }, card);
  // Antippen: drücken, ein wenig zittern, Bilder abwarten, dann Ebene prüfen
  async function tap(x, y, card) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'pen' }); await pen('mousePressed', x, y);
    await pen('mouseMoved', x + 1.5, y + 1); await pen('mouseMoved', x + 2.5, y); await frames(); await frames();
    const n = await inked(card);
    await pen('mouseReleased', x + 2.5, y); await frames(); await p.waitForTimeout(150);
    return n;
  }
  await p.evaluate(() => { setTool('tape'); S.tapePat = 'uni'; S.size.tape = 26; S.straight.tape = false; });
  const items0 = await p.evaluate(() => S.items.length);
  res.tapEmpty = { live: await tap(300, 500), items: (await p.evaluate(() => S.items.length)) - items0 };
  check('Antippen daneben: kein dünnes Tape zu sehen, kein neues Tape', res.tapEmpty.live === 0 && res.tapEmpty.items === 0, res.tapEmpty);
  const hid0 = await p.evaluate(() => S.items[0].hid);
  res.tapOn = { live: await tap(600, 202), toggled: (await p.evaluate(() => S.items[0].hid)) !== hid0 };
  check('Antippen auf einem Tape: kein dünnes Tape zu sehen, das Tape wird auf- bzw. abgedeckt', res.tapOn.live === 0 && res.tapOn.toggled, res.tapOn);

  // langes Tape: wie ein Stift (zwei Punkte je Bild), bei gedrücktem Stift mit dem ganzen Tape vergleichen
  async function longTape(pts, card) {
    await p.evaluate(() => { window.__regs = []; });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0][0], y: pts[0][1], pointerType: 'pen' }); await pen('mousePressed', ...pts[0]);
    let c = 0; for (const q of pts.slice(1)) { await pen('mouseMoved', ...q); if (++c % 2 === 0) await frames(); }
    await frames();
    const r = await p.evaluate(card => {
      const a = card ? ncDraw : action, cv = card ? ncLive : cvLive, k = card ? DPR * a.s : DPR * S.view.z, ox = card ? 0 : DPR * S.view.tx, oy = card ? 0 : DPR * S.view.ty;
      const W = cv.width, H = cv.height, L = cv.getContext('2d').getImageData(0, 0, W, H).data, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, ox, oy); drawTape(g, { pts: a.pts, w: a.w, c: a.c, tp: a.tp, live: true }, k);
      const R = g.getImageData(0, 0, W, H).data; let bad = 0, ink = 0;
      // Farben mit ihrer Deckkraft gewichtet (fast durchsichtige Randpixel haben unscharfe Farbwerte)
      const pm = (D, i, c) => D[i + c] * D[i + 3] / 255;
      for (let i = 0; i < L.length; i += 4) { if (R[i + 3] > 128) ink++; if (Math.max(Math.abs(pm(L, i, 0) - pm(R, i, 0)), Math.abs(pm(L, i, 1) - pm(R, i, 1)), Math.abs(pm(L, i, 2) - pm(R, i, 2)), Math.abs(L[i + 3] - R[i + 3])) > 60) bad++; }
      const regs = window.__regs.slice(Math.floor(window.__regs.length / 2));
      const bb = bboxOf(Float32Array.from(a.pts), a.w), full = (bb[2] - bb[0]) * (bb[3] - bb[1]) * k * k;
      return { n: a.pts.length / 3, frames: window.__regs.length, region: +(Math.max(...regs) / full).toFixed(3), bad, ink };
    }, card);
    await pen('mouseReleased', ...pts.at(-1)); await frames(); await p.waitForTimeout(150);
    return r;
  }
  const wave = (x0, y0, n, dx, amp) => Array.from({ length: n + 1 }, (_, i) => [x0 + i * dx, y0 + Math.sin(i / 7) * amp]);
  res.long = await longTape(wave(150, 420, 80, 13, 40));
  check('Langes Tape beim Ziehen: je Bild nur das Ende neu, sieht aus wie das ganze Tape', res.long.frames > 20 && res.long.region < 0.3 && res.long.ink > 30000 && res.long.bad <= 60, res.long);
  const motif = await p.evaluate(() => (TAPE_PATTERNS.find(([k]) => TAPE_MOTIFS[k]) || ['uni'])[0]);
  await p.evaluate(m => { S.tapePat = m; S.color.tape = TAPE_MOTIFS[m].c; }, motif);
  res.motif = await longTape(wave(150, 640, 80, 13, 50));
  check('Tape mit Figuren beim Ziehen: nur das Ende neu, Figuren wie beim ganzen Tape', res.motif.region < 0.3 && res.motif.ink > 30000 && res.motif.bad <= 150, res.motif);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'tapelive.png'), clip: { x: 100, y: 340, width: 1200, height: 420 } });

  // Notiz: Antippen und langes Tape
  await p.evaluate(() => { const s = makeStroke([300, 860, .5, 420, 865, .5], 'ink', 3, false); commit(appendItems(S.items, [s])); openNoteCard(null, new Set([s.id]), [290, 850, 430, 875]); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { ncTool = 'tape'; ncToolBtn(); S.tapePat = 'uni'; });
  const box = await p.evaluate(() => { const r = ncLive.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  res.cardTap = await tap(box[0] + box[2] / 2, box[1] + box[3] / 2, true);
  check('Notiz: Antippen zeigt kein dünnes Tape', res.cardTap === 0, res.cardTap);
  res.cardLong = await longTape(wave(box[0] + 20, box[1] + box[3] / 2, 40, (box[2] - 40) / 40, box[3] * 0.25), true);
  check('Notiz: langes Tape beim Ziehen nur am Ende neu und wie das ganze Tape', res.cardLong.region < 0.45 && res.cardLong.ink > 5000 && res.cardLong.bad <= 60, res.cardLong);
  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
