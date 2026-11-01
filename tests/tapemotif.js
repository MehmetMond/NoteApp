// Tape mit Figuren (Kätzchen, Hündchen): Auswahl im Menü, Figuren entlang des Tapes, aufgedeckt ohne Figuren,
// Vorschaubild ohne Fehler, Zeichendauer vieler Figuren-Tapes im Vergleich zu Streifen
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(400);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  const draw = async pts => {
    const t0 = Date.now() / 1000, ts = i => ({ timestamp: t0 + i * 0.006 });
    await send('mouseMoved', ...pts[0], { buttons: 0, ...ts(0) }); await send('mousePressed', ...pts[0], ts(0));
    for (let i = 1; i < pts.length; i++) await send('mouseMoved', ...pts[i], ts(i));
    await send('mouseReleased', ...pts.at(-1), ts(pts.length)); await p.waitForTimeout(150);
  };
  const line = (x0, x1, y) => Array.from({ length: Math.round(Math.abs(x1 - x0) / 3) + 1 }, (_, i) => [x0 + Math.sign(x1 - x0) * i * 3, y]);
  const tap = async (x, y) => { await send('mouseMoved', x, y, { buttons: 0 }); await send('mousePressed', x, y); await send('mouseReleased', x, y); await p.waitForTimeout(250); };
  // Farben im Band eines waagerechten Tapes zählen (Bildschirmfoto): weiß (Figur), dunkel (Umriss Kätzchen), blau (Umriss Hündchen)
  const band = async (x0, x1, y, hw) => {
    const png = (await p.screenshot({ clip: { x: x0, y: y - hw, width: x1 - x0, height: 2 * hw } })).toString('base64');
    return p.evaluate(async s => {
      const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, n = d.length / 4; let white = 0, dark = 0, blue = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (r >= 254 && gg >= 254 && bb >= 254) white++; /* reines Weiß der Figuren, das Papier ist #fcfcfa */ else if (r < 70 && gg < 70 && bb < 70) dark++; else if (bb > 150 && bb - r > 70 && bb - gg > 20) blue++; }
      return { white: +(white / n).toFixed(3), dark: +(dark / n).toFixed(3), blue: +(blue / n).toFixed(3) };
    }, png);
  };
  // Muster im Menü: sechs, in zwei Reihen
  await p.keyboard.press('t'); await p.click('#sizes .sz.on');
  res.chips = await p.evaluate(() => { const bs = [...document.querySelectorAll('#tpPats button')]; return { names: bs.map(b => b.textContent), rows: new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size }; });
  check(res.chips.names.join() === 'Uni,Streifen,Punkte,Karo,Kätzchen,Hündchen' && res.chips.rows === 2, 'Sechs Muster in zwei Reihen (' + JSON.stringify(res.chips) + ')');
  await p.click('#tpPats button:text-is("Kätzchen")');
  res.pick = await p.evaluate(() => [S.tapePat, localStorage.getItem('notizen.tapePat'), $('#tpPats button.on').textContent]);
  check(res.pick.join() === 'kitty,"kitty",Kätzchen', 'Kätzchen gewählt und gemerkt (' + res.pick + ')');
  res.preview = await p.evaluate(() => { const c = $('#szPrev'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let w = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240 && d[i + 3] > 200) w++; return w; });
  check(res.preview > 200, 'Vorschau im Menü zeigt Figuren (' + res.preview + ' weiße Pixel)');
  await p.keyboard.press('Escape');
  // Kätzchen: rosa Tape, waagerecht
  await p.click('#colors .sw:nth-child(1)');
  await draw(line(200, 900, 250));
  res.kitty = await p.evaluate(() => { const s = S.items.at(-1); return { tp: s.tp, hid: s.hid, w: s.w }; });
  check(res.kitty.tp === 'kitty' && res.kitty.hid === true, 'Tape mit Kätzchen angelegt');
  res.kittyBand = await band(230, 870, 250, 8);
  check(res.kittyBand.white > 0.12 && res.kittyBand.dark > 0.02, 'Kätzchen sichtbar: weiß mit dunklem Umriss (' + JSON.stringify(res.kittyBand) + ')');
  // Hündchen: blaues Tape, von rechts nach links gezogen
  await p.click('#sizes .sz.on'); await p.click('#tpPats button:text-is("Hündchen")'); await p.keyboard.press('Escape');
  await p.click('#colors .sw:nth-child(4)');
  await draw(line(900, 200, 400));
  res.hund = await p.evaluate(() => S.items.at(-1).tp); check(res.hund === 'hund', 'Tape mit Hündchen angelegt');
  res.hundBand = await band(230, 870, 400, 8);
  check(res.hundBand.white > 0.12 && res.hundBand.dark < 0.01, 'Hündchen sichtbar: weiß, ohne schwarzen Umriss (' + JSON.stringify(res.hundBand) + ')');
  // aufdecken: keine Figuren mehr
  await tap(500, 250); res.revealed = await p.evaluate(() => S.items.find(i => i.tp === 'kitty').hid);
  res.revealedBand = await band(230, 870, 250, 8);
  check(res.revealed === false && res.revealedBand.white < 0.01 && res.revealedBand.dark < 0.005, 'Aufgedeckt ohne Figuren (' + JSON.stringify(res.revealedBand) + ')');
  await tap(500, 250);
  // Lage der Figuren, nachgemessen an jedem gestempelten Bild (Mitte und Drehung): eigene Leinwand, Tape direkt gezeichnet
  res.geo = await p.evaluate(() => {
    const stamps = tape => {
      const c = document.createElement('canvas'); c.width = c.height = 1200; const g = c.getContext('2d'), out = [];
      const o = g.drawImage.bind(g); g.drawImage = (...a) => { const t = g.getTransform(); out.push({ x: t.e, y: t.f, ang: Math.atan2(t.b, t.a), fig: a[4] > tape.w * 0.5 /* Figur 0,72, Beigabe 0,3 Breiten hoch */ }); return o(...a); };
      drawTape(g, tape, 1); return out;
    };
    const mk = (pts, tp = 'kitty', w = 40) => ({ t: 's', pts: Float32Array.from(pts.flatMap(([x, y]) => [x, y, 0.5])), w, c: '#f4a7b9', tp, hid: true, live: true });
    const M = TAPE_MOTIFS.kitty, h = 0.72 * 40, sp = M.w * h * 1.18 + 0.3 * 40 * M.aw;
    // gerade, Länge 2,05 Abstände: Figuren genau an ihren Plätzen (sp/2, 3sp/2); die dritte begänne erst hinter dem Ende
    const len = 2.05 * sp, st = stamps(mk([[100, 300], [100 + len, 300]])).filter(s => s.fig).map(s => +(s.x - 100).toFixed(1));
    // U-Kurve: hin, Bogen, zurück – keine Figur auf dem Kopf
    const U = []; for (let i = 0; i <= 40; i++) U.push([100 + i * 10, 200]); for (let a = 1; a < 30; a++) U.push([500 + 60 * Math.sin(a * Math.PI / 30), 260 - 60 * Math.cos(a * Math.PI / 30)]); for (let i = 0; i <= 40; i++) U.push([500 - i * 10, 320]);
    const uAng = stamps(mk(U)).map(s => Math.cos(s.ang));
    // senkrecht mit Zittern, wachsend wie beim Zeichnen: Köpfe immer zur selben Seite
    const V = []; for (let i = 0; i <= 120; i++) V.push([300 + 1.5 * Math.sin(i / 3), 100 + i * 8]);
    const side = new Set(); for (let k = 12; k <= 121; k += 4) for (const s of stamps(mk(V.slice(0, k), 'hund', 30)).filter(s => s.fig)) side.add(Math.sign(Math.round(Math.sin(s.ang) * 10) || 1));
    // enge Kehre (Hündchen, Haarnadel und kurzes spitzes V): keine Figur, die aus dem Band ragen würde
    // (dicht abgetastet wie ein echter Strich; die ersten und letzten 0,6 Breiten macht tapeGeo gerade)
    const dense = P => { const out = [P[0]]; for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2)); for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); } return out; };
    const pin = [[300, 300], [340, 300]]; for (let a = 1; a < 12; a++) pin.push([340 + 6 * Math.sin(a * Math.PI / 12), 306 - 6 * Math.cos(a * Math.PI / 12)]); pin.push([340, 312], [300, 312]);
    const near = st => st.filter(s => s.fig && Math.hypot(s.x - 330, s.y - 306) < 20).length;   // Figuren an der Kehre selbst
    const vee = near(stamps(mk(dense(pin), 'hund', 40))) + stamps(mk(dense([[300, 300], [329, 317], [300, 334]]), 'hund', 40)).filter(s => s.fig).length;
    return { sp: +sp.toFixed(1), straight: st, uMinCos: +Math.min(...uAng).toFixed(2), vertSides: [...side], vee };
  });
  check(res.geo.straight.length === 2 && res.geo.straight.every((x, i) => Math.abs(x - (i + 0.5) * res.geo.sp) < 0.6), 'Figuren an ihren Plätzen, keine aufs Ende gerückt (' + JSON.stringify(res.geo) + ')');
  check(res.geo.uMinCos > -0.35, 'U-Kurve: keine Figur auf dem Kopf (' + res.geo.uMinCos + ')');
  check(res.geo.vertSides.length === 1, 'Senkrechtes Tape: Figuren kippen beim Zeichnen nicht hin und her (' + res.geo.vertSides + ')');
  check(res.geo.vee === 0, 'Enge Kehre: keine Figur (' + res.geo.vee + ')');
  // Vorschau im Menü nach dem Menü des Textmarkers: nicht blass
  await p.keyboard.press('m'); await p.click('#sizes .sz.on'); await p.keyboard.press('Escape');
  await p.keyboard.press('t'); await p.click('#sizes .sz.on'); await p.click('#tpPats button:text-is("Kätzchen")');
  res.previewAfterHl = await p.evaluate(() => { const c = $('#szPrev'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let w = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240 && d[i + 3] > 200) w++; return w; });
  check(res.previewAfterHl > 200, 'Vorschau nach dem Textmarker-Menü nicht blass (' + res.previewAfterHl + ' weiße Pixel)');
  await p.keyboard.press('Escape');
  // Vorschaubild der Seite (gleicher Zeichenweg wie Export) ohne Fehler
  res.thumb = await p.evaluate(async () => (await makeThumb()).length > 1000);
  check(res.thumb, 'Vorschaubild mit Figuren-Tapes');
  // viele lange Tapes: Zeichendauer aller Kacheln, Figuren gegen Streifen
  res.ms = await p.evaluate(() => {
    const time = tp => {
      const list = []; for (let k = 0; k < 40; k++) { const pts = []; for (let i = 0; i <= 80; i++) pts.push(40 + i * 15, 60 + k * 19 + Math.sin(i / 6) * 4, 0.5); list.push(makeStroke(pts, '#f4a7b9', 22, false, { tp, hid: true })); }
      setItems(list); const t = []; for (let r = 0; r < 3; r++) { clearTiles(); pathCache.clear(); const t0 = performance.now(); draw(); t.push(performance.now() - t0); } return Math.round(Math.min(...t));
    };
    const keep = S.items, out = { streifen: time('streifen'), kitty: time('kitty'), hund: time('hund') }; setItems(keep); clearTiles(); draw(); return out;
  });
  check(res.ms.kitty < Math.max(250, res.ms.streifen * 3) && res.ms.hund < Math.max(250, res.ms.streifen * 3), 'Figuren-Tapes zeichnen schnell genug (' + JSON.stringify(res.ms) + ')');
  await p.screenshot({ path: path.join(__dirname, 'tapemotif.png') });
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
