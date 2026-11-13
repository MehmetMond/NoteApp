// Notiz: Schreibfläche zoomen und verschieben. Zwei Finger auseinander zoomen hinein (ein begonnener Fingerstrich fällt weg),
// ein Strich danach liegt genau unter dem Stift, Strg + Mausrad zoomt um den Zeiger, das Mausrad schiebt (nicht über den
// Rand), der Knopf unten rechts zeigt den Zoom und setzt zurück, eine wieder geöffnete Notiz beginnt mit 100 %.
// node tests/notezoom.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const SHOTS = process.env.NOTES_SHOTS;
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => {
    const now = Date.now(), n = { id: uid(), name: 'Notiz zoomen', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
    const s = makeStroke([300, 300, .5, 420, 305, .5], 'ink', 3, false); commit(appendItems(S.items, [s]));
    openNoteCard(null, new Set([s.id]), [290, 290, 430, 315]);
  });
  await p.waitForTimeout(600);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6 });
  async function stroke(x0, y0, x1, y1) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' }); await pen('mousePressed', x0, y0);
    for (let k = 1; k <= 10; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / 10, y0 + (y1 - y0) * k / 10);
    await pen('mouseReleased', x1, y1); await frames(); await p.waitForTimeout(100);
  }
  const box = await p.evaluate(() => { const r = ncLive.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const view = () => p.evaluate(() => ({ z: +ncView.z.toFixed(3), x: +ncView.x.toFixed(1), y: +ncView.y.toFixed(1), s: ncS(), badge: $('#ncZoom').classList.contains('hidden') ? null : $('#ncZoom').textContent, ink: ncCur.nt.ink.length }));
  // erster Strich bei 100 %
  await stroke(box[0] + 40, box[1] + 40, box[0] + 120, box[1] + 50);
  res.v0 = await view();
  check('Am Anfang 100 %, kein Zoom-Knopf', res.v0.z === 1 && !res.v0.badge && res.v0.ink === 1, res.v0);
  // zwei Finger: der erste beginnt einen Strich, der zweite kommt dazu und beide gehen auseinander
  await p.evaluate(() => { penActiveUntil = 0; });
  const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 20, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 24, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 24, y: cy, id: 1 }, { x: cx + 20, y: cy, id: 2 }] });
  for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 24 - k * 6, y: cy, id: 1 }, { x: cx + 20 + k * 6, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await frames();
  res.pinch = await view();
  check('Zwei Finger auseinander: hineingezoomt, Knopf zeigt den Zoom, kein Fingerstrich dazu', res.pinch.z > 1.8 && res.pinch.badge === Math.round(res.pinch.z * 100) + ' %' && res.pinch.ink === 1, res.pinch);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'notezoom.png'), clip: { x: box[0] - 10, y: box[1] - 10, width: box[2] + 20, height: box[3] + 20 } });
  // Strich beim Zoom: liegt genau unter dem Stift (Punkt in Notiz-Einheiten = (Bildschirm - Verschiebung) / Maßstab)
  const px = box[0] + 60, py = box[1] + 70;
  await stroke(px, py, px + 50, py + 10);
  res.zoomStroke = await p.evaluate(([px, py, bx, by]) => { const s = ncCur.nt.ink.at(-1), k = ncS(); return { got: [s.pts[0], s.pts[1]], want: [(px - bx - ncView.x) / k, (py - by - ncView.y) / k] }; }, [px, py, box[0], box[1]]);
  check('Strich beim Zoom liegt unter dem Stift', Math.hypot(res.zoomStroke.got[0] - res.zoomStroke.want[0], res.zoomStroke.got[1] - res.zoomStroke.want[1]) < 1.5, res.zoomStroke);
  // gezeichnet: der neue Strich ist auf der Schreibfläche unter dem Stift dunkel
  res.zoomInk = await p.evaluate(([x, y, bx, by]) => { const d = ncInk.getContext('2d').getImageData(Math.round((x - bx + 25) * DPR), Math.round((y - by + 5) * DPR), 1, 1).data; return Math.round((d[0] + d[1] + d[2]) / 3); }, [px, py, box[0], box[1]]);
  check('Beim Zoom zu sehen, wo geschrieben wurde', res.zoomInk < 120, res.zoomInk);
  // Mausrad schiebt, nicht über den Rand
  await p.mouse.move(cx, cy); await p.mouse.wheel(0, 5000); await frames();
  res.wheel = await view();
  check('Mausrad schiebt beim Zoom, nicht über den Rand', Math.abs(res.wheel.y - (box[3] - box[3] * res.wheel.z)) < 1 && res.wheel.z === res.pinch.z, res.wheel);
  // Knopf: zurück auf 100 %
  await p.click('#ncZoom'); await frames();
  res.reset = await view();
  check('Knopf setzt auf 100 % zurück', res.reset.z === 1 && res.reset.x === 0 && res.reset.y === 0 && !res.reset.badge, res.reset);
  // Strg + Mausrad um den Zeiger: der Punkt unter dem Zeiger bleibt
  const mx = box[0] + 100, my = box[1] + 60;
  const before = await p.evaluate(([x, y]) => [(x - ncView.x) / ncS(), (y - ncView.y) / ncS()], [mx - box[0], my - box[1]]);
  await p.mouse.move(mx, my); await p.keyboard.down('Control'); await p.mouse.wheel(0, -120); await p.keyboard.up('Control'); await frames();
  res.ctrl = { ...(await view()), before, after: await p.evaluate(([x, y]) => [(x - ncView.x) / ncS(), (y - ncView.y) / ncS()], [mx - box[0], my - box[1]]) };
  check('Strg + Mausrad zoomt um den Zeiger', res.ctrl.z > 1.5 && Math.hypot(res.ctrl.after[0] - res.ctrl.before[0], res.ctrl.after[1] - res.ctrl.before[1]) < 0.5, res.ctrl);
  // wieder öffnen: 100 %
  await p.evaluate(() => closeMenus()); await p.waitForTimeout(300);
  await p.evaluate(() => { const n = S.items.find(i => i.nt); openNoteCard(n.id); }); await p.waitForTimeout(400);
  res.reopen = await view();
  check('Wieder geöffnet: 100 %, beide Striche gespeichert', res.reopen.z === 1 && !res.reopen.badge && res.reopen.ink === 2, res.reopen);
  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
