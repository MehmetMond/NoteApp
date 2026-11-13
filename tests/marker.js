// Textmarker: flache Enden genau an den Punkten (kein Überstand), beim Schreiben nur der Bereich am Ende neu und genau wie
// der fertige Strich (Seite und Notiz), Überlappungen gleich hell (auch beim Ziehen), beim Ziehen unter der Schrift; Tapes immer oben (Seite und Notiz), langes Tape in der Notiz
// höchstens einmal pro Bild neu gezeichnet, Vorschau der Glättung als Schreibprobe (fünf Stufen verschieden).
// node tests/marker.js [Notizen.html]
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
    const now = Date.now(), n = { id: uid(), name: 'Marker', created: now, updated: now, thumb: null, bg: 'blank', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  });
  await p.waitForTimeout(300);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const cdp = await ctx.newCDPSession(p);
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen', force: 0.6 });
  async function drag(x0, y0, x1, y1, steps = 20) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, pointerType: 'pen' });
    await pen('mousePressed', x0, y0);
    for (let k = 1; k <= steps; k++) await pen('mouseMoved', x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps);
    await pen('mouseReleased', x1, y1); await frames(); await p.waitForTimeout(150);
  }
  const px = (x, y) => p.evaluate(([x, y]) => { const d = cvMain.getContext('2d').getImageData(Math.round((x + PADC) * DPR), Math.round((y + PADC) * DPR), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
  const gray = q => Math.round((q[0] + q[1] + q[2]) / 3);

  // ---- Textmarker: flache Enden ----
  await p.evaluate(() => { setTool('hl'); S.size.hl = 24; S.color.hl = '#fdd835'; S.straight.hl = false; });
  await drag(300, 300, 600, 300);
  const hl = await p.evaluate(() => { const s = S.items.at(-1); return { hl: s.hl, w: s.w, x0: s.pts[0], x1: s.pts.at(-3) }; });
  await frames();
  // Ecken knapp innen gefüllt (flach), gleich hinter den Enden Papier (kein Überstand, auch kein runder)
  res.hlEnds = { cornerEnd: gray(await px(hl.x1 - 3, 300 - 10)), cornerStart: gray(await px(hl.x0 + 3, 300 + 10)), mid: gray(await px(450, 300)), afterEnd: gray(await px(hl.x1 + 4, 300)), beforeStart: gray(await px(hl.x0 - 4, 300)), paper: gray(await px(450, 360)) };
  check('Textmarker: Ecken an beiden Enden gefüllt (flach), dahinter gleich Papier (Enden genau an den Punkten)', hl.hl && res.hlEnds.cornerEnd < res.hlEnds.paper - 15 && res.hlEnds.cornerStart < res.hlEnds.paper - 15 && res.hlEnds.afterEnd > res.hlEnds.paper - 4 && res.hlEnds.beforeStart > res.hlEnds.paper - 4, { hl, ...res.hlEnds });
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'marker_flat.png'), clip: { x: 260, y: 260, width: 380, height: 80 } });

  // ---- Textmarker beim Schreiben: Stück für Stück, die Live-Ebene gleicht dem fertigen Strich (Kehre, über sich selbst) ----
  await p.evaluate(() => {
    window.__bp = 0; const f = window.buildPath; window.buildPath = (...q) => { window.__bp++; return f(...q); };
    // je Bild neu gemalter Bereich (Gerätepixel²); beim ganzen Strich wäre es der ganze Kasten
    window.__regs = []; const h = window.hlLive; window.hlLive = (...q) => { const R = h(...q); if (R) window.__regs.push((R[2] - R[0]) * (R[3] - R[1])); return R; };
  });
  const zig = [];   // hin, scharf zurück (kreuzt), dann quer über beide
  for (let k = 0; k <= 40; k++) zig.push([800 + k * 8, 150 + k * 2]);
  for (let k = 1; k <= 30; k++) zig.push([1120 - k * 9, 230 - k * 3.2]);
  for (let k = 1; k <= 20; k++) zig.push([850 + k * 3, 134 + k * 6]);
  async function liveVsFinal(points, card) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points[0][0], y: points[0][1], pointerType: 'pen' });
    await pen('mousePressed', points[0][0], points[0][1]);
    let c = 0; for (const [x, y] of points.slice(1)) { await pen('mouseMoved', x, y); if (++c % 2 === 0) await frames(); }   // wie ein Stift: wenige Punkte je Bild
    await frames();
    const r = await p.evaluate(card => {   // Live-Ebene gegen den ganzen Strich als ein Pfad, solange der Stift noch unten ist
      const a = card ? ncDraw : action, cv = card ? ncLive : cvLive, k = card ? DPR * a.s : DPR * S.view.z, ox = card ? 0 : DPR * S.view.tx, oy = card ? 0 : DPR * S.view.ty;
      const bp = window.__bp, pts = Float32Array.from(a.pts), bb = bboxOf(pts, a.w);
      const x0 = Math.max(0, Math.floor(bb[0] * k + ox) - 4), y0 = Math.max(0, Math.floor(bb[1] * k + oy) - 4), x1 = Math.min(cv.width, Math.ceil(bb[2] * k + ox) + 4), y1 = Math.min(cv.height, Math.ceil(bb[3] * k + oy) + 4);
      const W = x1 - x0, H = y1 - y0, L = cv.getContext('2d').getImageData(x0, y0, W, H).data;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, ox - x0, oy - y0); paintPath(g, buildPath(pts, a.w, true), a.w, true);
      if (a.cut) { const [list, , out] = a.cut; for (const it of list) { g.save(); g.globalCompositeOperation = 'destination-out'; out(g, it, k); g.restore(); } }   // ausgespart wie beim Ziehen
      const R = g.getImageData(0, 0, W, H).data; let bad = 0, ink = 0;
      for (let i = 3; i < L.length; i += 4) { if (R[i] > 128) ink++; if (Math.abs(L[i] - R[i]) > 200) bad++; }
      const regs = window.__regs.slice(Math.floor(window.__regs.length / 2)), full = W * H;   // zweite Hälfte: der Strich ist schon lang
      return { n: pts.length / 3, inc: !!a.hlInc, redraw: !!a.redraw, bp, region: +(Math.max(...regs) / full).toFixed(3), bad, ink };
    }, card);
    const last = points.at(-1); await pen('mouseReleased', last[0], last[1]); await frames(); await p.waitForTimeout(150);
    return r;
  }
  res.hlLive = await liveVsFinal(zig);
  check('Textmarker beim Schreiben: je Bild nur der Bereich am Ende neu (nicht der ganze Strich)', res.hlLive.inc && !res.hlLive.redraw && res.hlLive.n > 60 && res.hlLive.bp === 0 && res.hlLive.region < 0.3, res.hlLive);
  check('Textmarker beim Schreiben sieht aus wie der fertige Strich (flache Spitze, keine Reste, keine Lücken)', res.hlLive.ink > 20000 && res.hlLive.bad <= 40, res.hlLive);

  const hlDone = await p.evaluate(() => { const s = S.items.at(-1); return { hl: s.hl, n: s.pts.length / 3 }; });
  check('Textmarker beim Schreiben: danach als Strich gespeichert', hlDone.hl && hlDone.n >= res.hlLive.n, hlDone);

  // ---- Überlappung gleich hell (fertig und beim Ziehen), beim Ziehen unter der Schrift (dunkel: weiße Schrift bleibt weiß) ----
  const shot = async (x, y) => { const b = await p.screenshot({ clip: { x, y, width: 1, height: 1 } }); const png = require('zlib'); return b; };
  const pix = (x, y) => p.evaluate(([x, y]) => new Promise(r => requestAnimationFrame(() => r(null))), [x, y]);
  await p.evaluate(() => { setTool('hl'); S.color.hl = '#fdd835'; S.size.hl = 24; });
  await drag(200, 700, 700, 700, 30);   // waagerecht
  const scr = async () => { const buf = await p.screenshot({ clip: { x: 150, y: 600, width: 700, height: 220 } }); return buf; };
  // senkrecht darüber, beim Ziehen festhalten und den Bildschirm prüfen
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 450, y: 630, pointerType: 'pen' }); await pen('mousePressed', 450, 630);
  for (let k = 1; k <= 20; k++) await pen('mouseMoved', 450, 630 + k * 7);
  await frames();
  const readScr = async pts => { const out = []; for (const [x, y] of pts) { const b = await p.screenshot({ clip: { x, y, width: 1, height: 1 }, type: 'png' }); out.push(b); } return out; };
  const colorAt = async (x, y) => p.evaluate(async ([x, y]) => 0, [x, y]);
  res.overlapLive = await p.evaluate(async () => {
    // Bildschirm wie gezeigt: Hauptebene und Live-Ebene (Deckkraft und Mischen der Live-Ebene nachgerechnet)
    const at = (x, y) => { const m = cvMain.getContext('2d').getImageData(Math.round((x + PADC) * DPR), Math.round((y + PADC) * DPR), 1, 1).data, l = ctxLive.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data;
      const op = +(cvLive.style.opacity || getComputedStyle(cvLive).opacity || 1), a = l[3] / 255 * op, mul = getComputedStyle(cvLive).mixBlendMode === 'multiply';
      return [0, 1, 2].map(c => Math.round(mul ? m[c] * (1 - a) + m[c] * l[c] / 255 * a : m[c] * (1 - a) + l[c] * a)); };
    const g = q => Math.round((q[0] + q[1] + q[2]) / 3);
    return { cross: g(at(450, 700)), single: g(at(300, 700)), liveOnly: g(at(450, 660)) };
  });
  await pen('mouseReleased', 450, 770); await frames(); await p.waitForTimeout(150);
  res.overlapDone = { cross: gray(await px(450, 700)), single: gray(await px(300, 700)), other: gray(await px(450, 660)) };
  check('Zwei Textmarker übereinander: gleich hell wie einer, beim Ziehen und danach', Math.abs(res.overlapLive.cross - res.overlapLive.single) <= 4 && Math.abs(res.overlapDone.cross - res.overlapDone.single) <= 3 && Math.abs(res.overlapDone.other - res.overlapDone.single) <= 3, { live: res.overlapLive, done: res.overlapDone });
  // dunkel: weiße Schrift, Marker darüber gezogen: beim Ziehen bleibt die Schrift weiß (der Marker liegt darunter)
  await p.evaluate(() => { S.dark = true; applyDark(); setTool('pen'); S.size.pen = 6; S.color.pen = 'ink'; });
  await drag(200, 860, 700, 860, 30);
  await p.evaluate(() => setTool('hl'));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 220, y: 860, pointerType: 'pen' }); await pen('mousePressed', 220, 860);
  for (let k = 1; k <= 25; k++) await pen('mouseMoved', 220 + k * 18, 861);
  await frames();
  res.underInk = await p.evaluate(() => {
    const at = (x, y) => { const m = cvMain.getContext('2d').getImageData(Math.round((x + PADC) * DPR), Math.round((y + PADC) * DPR), 1, 1).data, l = ctxLive.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data;
      const op = +(cvLive.style.opacity || 1), a = l[3] / 255 * op; return [0, 1, 2].map(c => Math.round(m[c] * (1 - a) + l[c] * a)); };
    return { ink: at(400, 860), marker: at(400, 850) };
  });
  await pen('mouseReleased', 670, 861); await frames(); await p.waitForTimeout(150);
  res.underInkDone = { ink: await px(400, 860), marker: await px(400, 850) };
  check('Dunkel: beim Ziehen bleibt die Schrift über dem Marker weiß (wie danach)', res.underInk.ink.every(v => v > 200) && res.underInkDone.ink.every(v => v > 200) && res.underInk.marker[2] < 120, { live: res.underInk, done: res.underInkDone });
  await p.evaluate(() => { S.dark = false; applyDark(); });
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'marker_live.png'), clip: { x: 760, y: 100, width: 420, height: 180 } });

  // ---- Tapes immer oben (Seite) ----
  await p.evaluate(() => { setTool('tape'); S.size.tape = 22; S.tapePat = 'uni'; S.straight.tape = false; });
  await drag(300, 500, 700, 500);
  const tape = await p.evaluate(() => S.items.at(-1).id);
  await p.evaluate(id => setTapes(new Set([id]), false), tape);   // aufdecken
  await p.evaluate(() => { setTool('pen'); S.size.pen = 4; S.color.pen = 'ink'; });
  await drag(500, 440, 500, 560);   // Strich quer über das offene Tape: gehört nicht zum Tape
  const crossing = await p.evaluate(() => { const s = S.items.at(-1); return { id: s.id, on: s.on || null }; });
  await p.evaluate(id => setTapes(new Set([id]), true), tape);   // wieder abdecken
  await frames(); await p.waitForTimeout(150);
  res.top = { order: await p.evaluate(([t, s]) => { const o = paintOrder(); return [o.findIndex(i => i.id === t), o.findIndex(i => i.id === s)]; }, [tape, crossing.id]), atCross: gray(await px(500, 500)), stroke: gray(await px(500, 450)) };
  check('Tapes immer oben: später gezogener Strich liegt unter dem abgedeckten Tape', !crossing.on && res.top.order[0] > res.top.order[1] && res.top.atCross > 150 && res.top.stroke < 100, res.top);
  // was auf dem abgedeckten Tape geschrieben wird, liegt weiter darauf
  await drag(380, 495, 420, 505);
  const onT = await p.evaluate(t => { const s = S.items.at(-1); const o = paintOrder(); return { on: s.on, above: o.findIndex(i => i.id === s.id) > o.findIndex(i => i.id === t) }; }, tape);
  check('Schrift auf dem abgedeckten Tape liegt darauf', onT.on === tape && onT.above, onT);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'marker_tapetop.png'), clip: { x: 260, y: 420, width: 480, height: 160 } });

  // ---- Notiz: langes Tape, höchstens einmal pro Bild neu; Tapes oben ----
  await p.evaluate(() => { const s = makeStroke([300, 750, .5, 420, 755, .5], 'ink', 3, false); commit(appendItems(S.items, [s])); openNoteCard(null, new Set([s.id]), [290, 740, 430, 765]); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { ncTool = 'tape'; ncToolBtn(); window.__redraws = 0; const f = window.inkRedraw; window.inkRedraw = d => { window.__redraws++; return f(d); }; });
  const box = await p.evaluate(() => { const r = ncLive.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const y = box[1] + box[3] / 2, x0 = box[0] + 20, x1 = box[0] + box[2] - 20;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y, pointerType: 'pen' }); await pen('mousePressed', x0, y);
  const before = await p.evaluate(() => window.__redraws);
  // viele Bewegungen ohne Pause (wie ein schneller Stift): höchstens ein Neuzeichnen pro Bild
  const t0 = Date.now(); let moves = 0;
  for (let i = 1; i <= 60; i++) { await pen('mouseMoved', x0 + (x1 - x0) * i / 60, y + 6 * Math.sin(i / 5)); moves++; }
  const dt = Date.now() - t0; await frames();
  const during = (await p.evaluate(() => window.__redraws)) - before;
  await pen('mouseReleased', x1, y); await p.waitForTimeout(200);
  const ink = await p.evaluate(() => ncCur.nt.ink.map(s => ({ tp: !!s.tp, n: s.pts.length / 3 })));
  res.card = { moves, during, ms: dt, ink };
  check('Notiz: langes Tape wird höchstens einmal pro Bild neu gezeichnet und ist danach da', during <= Math.ceil(dt / 16) + 2 && during < moves && ink.some(s => s.tp && s.n > 20), res.card);
  // Tapes oben auch in der Notiz: Strich nach dem Tape, nicht auf ihm (aufgedeckt gezogen), liegt nach dem Abdecken darunter
  const cardTop = await p.evaluate(() => {
    const ink = ncCur.nt.ink, t = ink.find(s => s.tp), ty = t.pts[1], mx = (t.pts[0] + t.pts.at(-3)) / 2;
    ncCur.nt.ink = [...ink, { c: 'ink', w: 4, pts: [mx, ty - 30, .5, mx, ty + 30, .5] }];   // quer darüber, ohne on
    drawNoteInk();
    const g = ncInk.getContext('2d'), s = ncInkS, d = g.getImageData(Math.round(mx * s * DPR), Math.round(ty * s * DPR), 1, 1).data, e = g.getImageData(Math.round(mx * s * DPR), Math.round((ty - 25) * s * DPR), 1, 1).data;
    return { atTape: Math.round((d[0] + d[1] + d[2]) / 3), stroke: Math.round((e[0] + e[1] + e[2]) / 3) };
  });
  check('Notiz: Tape liegt über einem später gezogenen Strich', cardTop.atTape > 150 && cardTop.stroke < 120, cardTop);
  // Textmarker in der Notiz: Stück für Stück, genau wie der fertige Strich
  await p.evaluate(() => { ncTool = 'hl'; ncToolBtn(); window.__regs = []; window.__redraws = 0; window.__bp = 0; });
  const cz = [], fx = f => box[0] + box[2] * f, fy = f => box[1] + box[3] * f;
  for (let k = 0; k <= 24; k++) cz.push([fx(0.1 + 0.03 * k), fy(0.3 + 0.012 * k)]);
  for (let k = 1; k <= 20; k++) cz.push([fx(0.82 - 0.03 * k), fy(0.59 - 0.016 * k)]);
  for (let k = 1; k <= 12; k++) cz.push([fx(0.22 + 0.02 * k), fy(0.27 + 0.045 * k)]);
  res.cardHl = await liveVsFinal(cz, true);
  res.cardHl.redraws = await p.evaluate(() => window.__redraws);
  check('Notiz: Textmarker beim Schreiben nur am Ende neu und wie der fertige Strich', res.cardHl.inc && res.cardHl.n > 40 && res.cardHl.bp === 0 && res.cardHl.redraws === 0 && res.cardHl.region < 0.35 && res.cardHl.ink > 5000 && res.cardHl.bad <= 40, res.cardHl);
  const cardHlDone = await p.evaluate(() => { const s = ncCur.nt.ink.at(-1); return { hl: !!s.hl, n: s.pts.length / 3 }; });
  check('Notiz: Textmarker danach gespeichert', cardHlDone.hl && cardHlDone.n >= res.cardHl.n, cardHlDone);
  if (SHOTS) { const r = await p.evaluate(() => { const a = $('#noteCard').getBoundingClientRect(); return { x: a.left, y: a.top, width: a.width, height: a.height }; }); await p.screenshot({ path: path.join(SHOTS, 'marker_card.png'), clip: r }); }
  await p.evaluate(() => closeMenus()); await p.waitForTimeout(300);

  // ---- Vorschau der Glättung: Schreibprobe, fünf Stufen verschieden ----
  await p.evaluate(() => setTool('pen')); await p.click('#bTune'); await p.waitForTimeout(400);
  const prevs = [];
  for (let i = 1; i <= 5; i++) {
    await p.click(`#smPresets button:nth-child(${i})`); await p.waitForTimeout(120);
    prevs.push(await p.evaluate(() => { const c = $('#szPrev'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0, ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) { ink++; h = (h * 31 + i) % 1000000007; } return { ink, h }; }));
  }
  check('Vorschau der Glättung: fünf verschiedene Bilder mit Strich', prevs.every(q => q.ink > 500) && new Set(prevs.map(q => q.h)).size === 5, prevs);
  await p.keyboard.press('Escape');

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
