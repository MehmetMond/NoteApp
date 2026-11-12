// Füllung (ohne, Schraffur, Kreuzschraffur, gefüllt) für geschlossene Formen; Linien und Pfeile biegen mit einem Punkt
// in der Mitte: gleich nach dem Zeichnen (Formen-Werkzeug) und bei Auswahl mit dem Lasso. Spitze folgt der Kurve,
// Rückgängig, zurück zur Mitte = gerade, Verschieben und Duplizieren nehmen den Knick mit, Neuladen behält alles.
// node tests/fillbend.js [Notizen.html]
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
    const now = Date.now(), n = { id: uid(), name: 'Füllen und Biegen', created: now, updated: now, thumb: null, bg: 'blank', view: { tx: 0, ty: 0, z: 1 } };
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
  const tap = async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'pen' }); await pen('mousePressed', x, y); await pen('mouseReleased', x, y); await frames(); };
  const shape = async (k, st, a, c, w = 3) => {
    await p.evaluate(([k, st, w]) => { S.shapeStyle = { ds: 'solid', rnd: 0, sl: 0, fs: 'none', ...st }; setShape(k); setTool('shape'); S.size.pen = w; }, [k, st, w]);
    await drag(a[0], a[1], c[0], c[1]);
    return p.evaluate(() => { const s = S.items.at(-1); return { id: s.id, k: s.k, fs: s.fs, ds: s.ds, sh: s.sh, n: s.pts.length / 3, fl: s.fl }; });
  };
  const item = id => p.evaluate(id => { const s = S.items.find(i => i.id === id); return s && { id: s.id, k: s.k, sh: s.sh, c: s.c, w: s.w, fs: s.fs, fl: s.fl, ds: s.ds, valid: validFl(s.fl, s.pts.length / 3), n: s.pts.length / 3, pts: Array.from(s.pts) }; }, id);
  const scan = (x0, y0, x1, y1) => p.evaluate(([x0, y0, x1, y1]) => {
    const g = cvMain.getContext('2d'), n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0))), out = [];
    for (let i = 0; i <= n; i++) { const d = g.getImageData(Math.round((x0 + (x1 - x0) * i / n + PADC) * DPR), Math.round((y0 + (y1 - y0) * i / n + PADC) * DPR), 1, 1).data; out.push(Math.round((d[0] + d[1] + d[2]) / 3)); }
    return out;
  }, [x0, y0, x1, y1]);
  const runs = (v, th) => { const r = []; let cur = null; for (const g of v) { const ink = g < th; if (!cur || cur.ink !== ink) r.push(cur = { ink, n: 0 }); cur.n++; } return r; };
  const summary = (v, th = 170) => { const r = runs(v, th); return { ink: r.filter(x => x.ink).length, paper: r.filter(x => !x.ink).length, min: Math.min(...v), max: Math.max(...v) }; };
  const px = async (x, y) => (await scan(x, y, x, y))[0];

  // ---------------- Formenleiste: Füllung ----------------
  await p.evaluate(() => { setShape('rect'); setTool('shape'); }); await p.waitForTimeout(450);
  const bar = await p.evaluate(() => ({ groups: $$('#shStyle .shgrp').map(g => g.getAttribute('aria-label')), fills: $$('#shStyle [data-fs]').map(b => b.title), on: $$('#shStyle [data-fs].on').map(b => b.dataset.fs),
    fits: (() => { const r = $('#shapeBar').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })(), rows: new Set($$('#shapeBar button').map(b => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size }));
  check('Formenleiste: Füllung mit vier Knöpfen, Vorgabe ohne, alles in einer Reihe und im Bild',
    bar.groups.join() === 'Kontur,Kanten,Sauberkeit,Füllung' && bar.fills.join() === 'Ohne Füllung,Schraffur,Kreuzschraffur,Gefüllt' && bar.on.join() === 'none' && bar.fits && bar.rows === 1, bar);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_bar.png'), clip: { x: 0, y: 0, width: 1440, height: 140 } });
  await p.click('#shStyle [data-fs="solid"]');
  check('Füllung antippen: gewählt und gespeichert', await p.evaluate(() => S.shapeStyle.fs === 'solid' && JSON.parse(localStorage.getItem('notizen.shapeStyle')).fs === 'solid' && $('#shStyle [data-fs="solid"]').classList.contains('on')));

  // ---------------- Füllung zeichnen ----------------
  const none = await shape('rect', {}, [200, 220], [400, 360]);
  const solid = await shape('rect', { fs: 'solid' }, [450, 220], [650, 360]);
  const hach = await shape('rect', { fs: 'hachure' }, [700, 220], [900, 360]);
  const cross = await shape('rect', { fs: 'cross' }, [950, 220], [1150, 360]);
  const ell = await shape('ellipse', { fs: 'solid' }, [200, 420], [400, 560]);
  const arr = await shape('arrow', { fs: 'solid' }, [450, 490], [650, 490]);
  await p.waitForTimeout(250);
  // dunkle Pixel in einer Fläche (Schraffur gegen Kreuzschraffur)
  const inkArea = (x0, y0, x1, y1) => p.evaluate(([x0, y0, x1, y1]) => { const d = cvMain.getContext('2d').getImageData(Math.round((x0 + PADC) * DPR), Math.round((y0 + PADC) * DPR), Math.round((x1 - x0) * DPR), Math.round((y1 - y0) * DPR)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 170) n++; return n; }, [x0, y0, x1, y1]);
  res.fill = { none: await px(300, 290), solid: await px(550, 290), hach: summary(await scan(720, 290, 880, 290)), hachA: await inkArea(720, 250, 880, 330), crossA: await inkArea(970, 250, 1130, 330), ellipse: await px(300, 490) };
  check('Ohne Füllung: innen Papier', !none.fs && res.fill.none > 235, res.fill);
  check('Gefüllt: innen zart in der Farbe der Form', solid.fs === 'solid' && res.fill.solid < 225 && res.fill.solid > 120, res.fill);
  check('Schraffur: dünne Linien mit Papier dazwischen', hach.fs === 'hachure' && res.fill.hach.ink >= 8 && res.fill.hach.paper >= 8 && res.fill.hach.max > 235, res.fill.hach);
  check('Kreuzschraffur: dichter als Schraffur', cross.fs === 'cross' && res.fill.crossA > res.fill.hachA * 1.5, res.fill);
  check('Ellipse gefüllt, Pfeil ohne Füllung', ell.fs === 'solid' && res.fill.ellipse < 225 && !arr.fs, { ell: ell.fs, arr: arr.fs });
  // Lasso: Antippen innen wählt die gefüllte Form, die leere nicht
  await p.evaluate(() => setTool('lasso'));
  await tap(550, 290); const selSolid = await p.evaluate(() => S.sel ? [...S.sel.ids] : []);
  await p.evaluate(() => clearSel()); await tap(300, 290); const selNone = await p.evaluate(() => S.sel ? [...S.sel.ids] : []);
  await p.evaluate(() => clearSel());
  check('Lasso-Tipp innen: gefüllte Form ausgewählt, leere nicht', selSolid.join() === solid.id && selNone.length === 0, { selSolid, selNone });
  // eigene Form, Sicherung, Vorschaubild
  const cust = await p.evaluate(id => {
    const s = S.items.find(i => i.id === id), [x0, y0] = geoBox([s]), pts = new Float32Array(s.pts);
    for (let i = 0; i < pts.length; i += 3) { pts[i] -= x0; pts[i + 1] -= y0; }
    const back = shapeFromBackup(JSON.parse(JSON.stringify({ id: 'x1', name: 'Kasten', strokes: [{ c: s.c, w: s.w, hl: false, pts: Array.from(pts), fs: s.fs }] })));
    const placed = stampStrokes(back, 1, 600, 600, uid());
    const bad = shapeFromBackup({ id: 'x2', name: 'kaputt', strokes: [{ c: 'ink', w: 2, pts: [0, 0, 0.5, 10, 0, 0.5], fs: 'wellig' }] });
    return { back: back && back.strokes[0].fs, placed: placed[0].fs, bad: bad && bad.strokes[0].fs === undefined };
  }, hach.id);
  check('Eigene Form und Sicherung behalten die Füllung, Unsinn fällt weg', cust.back === 'hachure' && cust.placed === 'hachure' && cust.bad, cust);
  res.thumb = await p.evaluate(async id => {
    const s = S.items.find(i => i.id === id), c = await renderTo([s], [440, 210, 660, 370], 2, 'blank', { cheap: true, light: true }), d = c.getContext('2d').getImageData(220, 160, 1, 1).data;   // Welt (550, 290)
    return Math.round((d[0] + d[1] + d[2]) / 3);
  }, solid.id);
  check('Vorschaubild: Füllung zu sehen', res.thumb < 235 && res.thumb > 100, res.thumb);

  // ---------------- Neue Form bleibt ausgewählt: Stil, Füllung, Farbe, Dicke gelten für sie ----------------
  await p.evaluate(() => { S.color.pen = 'ink'; setSize('pen', 1); renderColors(); renderSizes(); });
  const R = await shape('rect', {}, [1200, 420], [1380, 560]);
  const undo0 = await p.evaluate(() => S.undo.length);
  await p.click('#shStyle [data-rnd="1"]'); const R1 = await item(R.id);
  await p.click('#shStyle [data-fs="cross"]'); const R2 = await item(R.id);
  await p.click('#colors .sw:nth-child(2)'); const R3 = await item(R.id);
  await p.click('#sizes .sz:nth-child(4)'); const R4 = await item(R.id);
  res.restyle = { sel: await p.evaluate(() => S.sel ? [...S.sel.ids] : []), steps: (await p.evaluate(() => S.undo.length)) - undo0, rnd: R1.sh.rnd, n0: R.n, n1: R1.n, fs: R2.fs, c: R3.c, w: [R.w, R4.w], next: await p.evaluate(() => [S.shapeStyle.rnd, S.shapeStyle.fs]) };
  check('Gleich danach antippen: Kanten rund, Kreuzschraffur, Farbe, Dicke gelten für die neue Form (je ein Schritt, bleibt ausgewählt)',
    res.restyle.sel.join() === R.id && res.restyle.steps === 4 && R1.sh.rnd === 1 && R1.n > R.n && R2.fs === 'cross' && R3.c !== 'ink' && R4.w !== R.w && res.restyle.next.join() === '1,cross', res.restyle);
  const R5 = await shape('rect', { rnd: 1, fs: 'cross' }, [1200, 600], [1380, 680]);
  check('Nächste Form: die vorige ist nicht mehr ausgewählt, die neue schon', await p.evaluate(([a, b]) => !!S.sel && S.sel.ids.has(b) && !S.sel.ids.has(a), [R.id, R5.id]));
  await p.evaluate(() => { S.color.pen = 'ink'; setSize('pen', 1); renderColors(); renderSizes(); });

  // ---------------- Biegen gleich nach dem Zeichnen ----------------
  const A = await shape('arrow', {}, [200, 700], [600, 700]);
  const h0 = await p.evaluate(() => { const it = bendTarget(); return it && { id: it.id, p: bendPoint(it), sel: [...S.sel.ids], selbar: $('#selbar').classList.contains('hidden') }; });
  check('Nach dem Zeichnen: ausgewählt (ohne Auswahlleiste), Punkt zum Biegen in der Mitte', h0 && h0.id === A.id && h0.sel.join() === A.id && h0.selbar && Math.abs(h0.p[0] - 400) < 1 && Math.abs(h0.p[1] - 700) < 1 && A.sh && A.n === 12, { h0, n: A.n, sh: A.sh });
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_handle.png'), clip: { x: 160, y: 640, width: 480, height: 120 } });
  const nItems = await p.evaluate(() => S.items.length);
  await drag(400, 700, 400, 820);
  await p.waitForTimeout(200);
  const B = await item(A.id);
  res.bent = { m: B.sh.m, valid: B.valid, n: B.n, items: await p.evaluate(() => S.items.length), onCurve: await px(400, 820), oldMid: await px(400, 700) };
  check('Gezogen: gebogen durch den Punkt (gleiche id, Spitze gefüllt, nichts Neues gezeichnet)',
    B.sh.m && Math.abs(B.sh.m[0] - 400) < 1 && Math.abs(B.sh.m[1] - 820) < 1 && B.valid && B.n > 20 && res.bent.items === nItems && res.bent.onCurve < 120 && res.bent.oldMid > 235, res.bent);
  const dir = await p.evaluate(id => {
    const s = S.items.find(i => i.id === id), L = s.sh, M = L.m, C = [2 * M[0] - (L.a[0] + L.b[0]) / 2, 2 * M[1] - (L.a[1] + L.b[1]) / 2], [a, e] = s.fl[0], q = s.pts;
    let best = a, dm = -1; for (let i = a; i <= e; i++) { const d = Math.hypot(q[i * 3] - q[a * 3], q[i * 3 + 1] - q[a * 3 + 1]); if (d > dm) { dm = d; best = i; } }
    const tip = [q[best * 3], q[best * 3 + 1]], notch = [q[a * 3], q[a * 3 + 1]], u = [tip[0] - notch[0], tip[1] - notch[1]], t = [L.b[0] - C[0], L.b[1] - C[1]];
    return { tip, ang: Math.abs(Math.atan2(u[0] * t[1] - u[1] * t[0], u[0] * t[0] + u[1] * t[1])) * 180 / Math.PI };
  }, A.id);
  check('Spitze bleibt am Ende und zeigt in Richtung der Kurve', Math.hypot(dir.tip[0] - 600, dir.tip[1] - 700) < 0.5 && dir.ang < 12, dir);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_bent.png'), clip: { x: 160, y: 640, width: 480, height: 220 } });
  await p.click('#bUndo'); await p.waitForTimeout(100);
  const U = await item(A.id);
  check('Rückgängig: wieder gerade', !U.sh.m && U.n === 12, { m: U.sh.m, n: U.n });
  await p.click('#bRedo'); await p.waitForTimeout(100);
  await drag(400, 820, 400, 703);
  const St = await item(A.id);
  check('Punkt zurück in die Mitte gezogen: wieder gerade', !St.sh.m && St.n === 12, { m: St.sh.m, n: St.n });
  await drag(400, 700, 400, 600);   // nach oben biegen
  // anderswo tippen: der Punkt verschwindet, der Tipp biegt nichts
  await tap(900, 820);
  check('Tipp daneben: Auswahl weg, kein Punkt mehr', await p.evaluate(() => !S.sel && !bendTarget()));

  // ---------------- Biegen mit dem Lasso ----------------
  await p.evaluate(() => setTool('lasso'));
  await tap(400, 600);
  const sel = await p.evaluate(id => ({ ids: S.sel ? [...S.sel.ids] : [], target: bendTarget() && bendTarget().id, id }), A.id);
  check('Lasso-Tipp auf den Pfeil: ausgewählt, Punkt zum Biegen da', sel.ids.join() === A.id && sel.target === A.id, sel);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_lasso.png'), clip: { x: 160, y: 520, width: 480, height: 220 } });
  await drag(400, 600, 400, 560);
  const L1 = await item(A.id);
  check('Mit dem Lasso gebogen, Auswahl bleibt', L1.sh.m && Math.abs(L1.sh.m[1] - 560) < 1 && (await p.evaluate(id => !!S.sel && S.sel.ids.has(id), A.id)), { m: L1.sh.m });
  // Verschieben nimmt Enden und Knick mit
  await drag(250, 690, 250, 790);
  const Mv = await item(A.id);
  check('Verschieben: Enden und Knick wandern mit', Mv.sh.a[1] === 800 && Mv.sh.b[1] === 800 && Math.abs(Mv.sh.m[1] - 660) < 1 && Math.abs(Mv.sh.a[0] - 200) < 0.01, Mv.sh);
  // Duplizieren: eigener Knick, unabhängig vom Original
  await p.click('#sDup', { timeout: 5000 }); await p.waitForTimeout(150);
  const dup = await p.evaluate(id => { const c = S.items.find(i => S.sel && S.sel.ids.has(i.id)); return c && { id: c.id, ln: c.sh, orig: S.items.find(i => i.id === id).sh }; }, A.id);
  check('Duplizieren: Kopie mit eigenem, versetztem Knick', dup && dup.id !== A.id && Math.abs(dup.ln.m[0] - dup.orig.m[0] - 24) < 0.01 && Math.abs(dup.ln.a[1] - dup.orig.a[1] - 24) < 0.01, dup);
  await p.evaluate(() => clearSel());

  // ---------------- Doppelpfeil, Linie, Stil ----------------
  const D = await shape('arrow2', {}, [700, 450], [1100, 450]);
  await drag(900, 450, 900, 530);
  const Db = await item(D.id);
  check('Doppelpfeil gebogen: zwei gefüllte Spitzen', Db.sh.m && Db.valid && Db.fl.length === 2, { m: Db.sh.m, fl: Db.fl });
  const Ln = await shape('line', {}, [700, 600], [1100, 600]);
  await drag(900, 600, 900, 520);
  const Lb = await item(Ln.id);
  check('Linie gebogen: ohne Spitze', Lb.sh.m && !Lb.fl && Lb.n > 20, { m: Lb.sh.m, n: Lb.n });
  const Sk = await shape('arrow', { sl: 2, ds: 'dash' }, [700, 700], [1100, 700]);
  await drag(900, 700, 900, 800);
  const Skb = await item(Sk.id);
  check('Skizzenhaft gestrichelt gebogen: Stil bleibt, Spitze gefüllt', Skb.sh.m && Skb.ds === 'dash' && Skb.valid && Skb.sh.sl === 2, { sh: Skb.sh, ds: Skb.ds });
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_page.png') });

  // ---------------- Punkte an Anfang und Spitze ----------------
  const E = await shape('arrow', {}, [700, 860], [1000, 860]);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_ends.png'), clip: { x: 660, y: 820, width: 380, height: 80 } });
  await drag(1000, 860, 1060, 900);   // Spitze ziehen
  const E1 = await item(E.id);
  await drag(700, 860, 680, 820);   // Anfang ziehen
  const E2 = await item(E.id);
  res.ends = { b: E1.sh.b, a: E2.sh.a, m: E2.sh.m, valid: E2.valid, sel: await p.evaluate(() => S.sel ? [...S.sel.ids] : []) };
  check('Punkte an Anfang und Spitze: beide Enden lassen sich versetzen, gerade bleibt gerade, bleibt ausgewählt',
    E1.sh.b[0] === 1060 && E1.sh.b[1] === 900 && E2.sh.a[0] === 680 && E2.sh.a[1] === 820 && !E2.sh.m && E2.valid && res.ends.sel.join() === E.id, res.ends);
  await drag(870, 860, 870, 800);   // biegen
  await drag(1060, 900, 1100, 860);   // dann die Spitze versetzen: der Bogenpunkt bleibt
  const E3 = await item(E.id);
  check('Gebogen und Spitze versetzt: Punkt des Bogens bleibt liegen', E3.sh.m && E3.sh.m[0] === 870 && E3.sh.m[1] === 800 && E3.sh.b[0] === 1100 && E3.sh.b[1] === 860 && E3.valid, E3.sh);

  // ---------------- Kastenformen: Breite und Höhe einzeln (Griffe an den Seiten) ----------------
  const boxOf = s => [Math.min(s.sh.a[0], s.sh.b[0]), Math.min(s.sh.a[1], s.sh.b[1]), Math.max(s.sh.a[0], s.sh.b[0]), Math.max(s.sh.a[1], s.sh.b[1])];
  const X = await shape('rect', { rnd: 1, fs: 'hachure' }, [1200, 160], [1360, 260]);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'fillbend_box.png'), clip: { x: 1170, y: 140, width: 220, height: 140 } });
  await drag(1371.5, 210, 1411.5, 230);   // Griff rechts (etwas außerhalb: Breite 3 → 1,5 + 10)
  const X1 = await item(X.id);
  await drag(1300, 271.5, 1310, 311.5);   // Griff unten (Mitte ist jetzt bei x 1300)
  const X2 = await item(X.id);
  res.box = { b1: boxOf(X1), b2: boxOf(X2), fs: X2.fs, rnd: X2.sh.rnd, n: [X.n, X2.n] };
  check('Kastenform: rechte Seite ändert nur die Breite, untere nur die Höhe; Füllung und runde Kanten bleiben',
    res.box.b1.join() === '1200,160,1400,260' && res.box.b2.join() === '1200,160,1400,300' && X2.fs === 'hachure' && X2.sh.rnd === 1, res.box);
  await p.evaluate(() => setTool('lasso'));
  await tap(1200, 230);   // Lasso-Tipp auf die linke Kante wählt aus
  await drag(1188.5, 230, 1158.5, 250);   // Griff links mit dem Lasso
  const X3 = await item(X.id);
  check('Mit dem Lasso: linke Seite ändert nur die Breite', boxOf(X3).join() === '1170,160,1400,300', boxOf(X3));
  // an der Kante selbst (nicht am Griff) gezogen: verschieben, Breite und Höhe bleiben
  await drag(1170, 240, 1190, 250);
  const X4 = await item(X.id);
  check('An der Kante gegriffen: verschoben statt Breite geändert', boxOf(X4).join() === '1190,170,1420,310', boxOf(X4));
  await p.evaluate(() => clearSel());

  // ---------------- Neu laden ----------------
  const before = { a: (await item(A.id)).pts, fsBefore: hach.fs };
  await p.evaluate(async () => { await window.__flush(); });
  await p.reload(); await p.waitForTimeout(500);
  const after = await p.evaluate(async ([ida, idh]) => {
    const m = (await dbIndexAll()).find(x => x.name === 'Füllen und Biegen'); await openNote(m);
    const a = S.items.find(i => i.id === ida), h = S.items.find(i => i.id === idh);
    return { pts: Array.from(a.pts), m: a.sh && a.sh.m, fs: h.fs, style: S.shapeStyle.fs };
  }, [A.id, hach.id]);
  check('Neu geladen: Knick, Punkte und Füllung bleiben, gewählte Füllung gespeichert', JSON.stringify(after.pts) === JSON.stringify(before.a) && after.m && after.fs === 'hachure' && after.style === 'cross', { m: after.m, fs: after.fs, style: after.style });

  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
