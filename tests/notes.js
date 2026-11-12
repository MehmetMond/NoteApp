// Erklärungen: mit dem Lasso etwas auswählen, „Erklärung“ → Karte mit Text, Bild (Zwischenablage, Datei, Strg + V)
// und kleiner Schreibfläche. Gespeichert als hellblaue Markierung (Textmarker-Fläche, k 'note', Inhalt in nt) mit „i“;
// das Markierte hängt daran (on) und wandert mit. Öffnen per Fingertipp, Stifttipp aufs „i“ (Stift und Lasso) oder Knopf.
// Leer heißt keine Erklärung. Dazu: Rückgängig, Duplizieren, Farbe, Radierer, Bilder aufräumen, Sicherung (Kopie).
// node tests/notes.js [Notizen.html]    Bilder der Karte: NOTES_SHOTS=<Ordner> (sonst der Temp-Ordner)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const SHOTS = process.env.NOTES_SHOTS || os.tmpdir();
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
const near = (a, b, e = 0.5) => Math.abs(a - b) <= e;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, hasTouch: true, acceptDownloads: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(400);
  const wait = ms => p.waitForTimeout(ms);
  // Zwischenablage nachgebildet (zwei Bilder zum Austauschen), Schrift aus der Strichschrift der App
  await p.evaluate(async () => {
    const mk = async (w, h, col) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 6; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(40, h - 40); g.lineTo(w - 40, h - 40); g.lineTo(40, 40); g.closePath(); g.stroke();
      g.strokeRect(40, h - 70, 30, 30); g.fillStyle = col; g.font = 'bold 30px sans-serif'; g.fillText('c', w / 2 + 6, h / 2 - 6); g.fillText('a', 12, h / 2 + 20); g.fillText('b', w / 2 - 10, h - 8);
      return new Promise(r => c.toBlob(r, 'image/png'));
    };
    window.__clipA = await mk(320, 220, '#2f6fd6'); window.__clipB = await mk(240, 240, '#d5543a'); window.__clip = window.__clipA;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => window.__clipText ? [{ types: ['text/plain'], getType: async () => new Blob([window.__clipText], { type: 'text/plain' }) }] : [{ types: ['image/png'], getType: async () => window.__clip }] } });
    window.__write = (str, sx, sy, h) => {
      const [x, y] = toWorld(sx, sy), out = []; placeText(out, str, x, y, h, 0, 0);
      const list = out.map(l => { const q = []; for (let i = 0; i < l.length; i += 2) q.push(l[i], l[i + 1], 0.5); return makeStroke(q, 'ink', 2.2, false); });
      commit(appendItems(S.items, list)); return list.map(s => s.id);
    };
  });
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  const draw = async (pts, after = 150) => {
    const t0 = Date.now() / 1000, ts = i => ({ timestamp: t0 + i * 0.006 });
    await send('mouseMoved', ...pts[0], { buttons: 0, ...ts(0) }); await send('mousePressed', ...pts[0], ts(0));
    for (let i = 1; i < pts.length; i++) await send('mouseMoved', ...pts[i], ts(i));
    await send('mouseReleased', ...pts.at(-1), ts(pts.length)); if (after) await wait(after);
  };
  const seg = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const poly = (...pts) => pts.slice(1).flatMap((q, i) => seg(pts[i], q).slice(i ? 1 : 0));
  const penTap = async (x, y) => { await send('mouseMoved', x, y, { buttons: 0 }); await send('mousePressed', x, y); await send('mouseReleased', x, y); await wait(200); };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const fingerTap = async (x, y, pause = 700) => { if (pause) await wait(pause); await touch('touchStart', [[x, y]]); await wait(60); await touch('touchEnd', []); await wait(300); };
  const card = () => p.evaluate(() => {
    const m = $('#noteCard'), r = m.getBoundingClientRect();
    return { open: isOpen(m), id: ncCur && ncCur.id, sel: ncCur && ncCur.ids ? ncCur.ids.size : 0, text: $('#ncText').value, img: !!(ncCur && ncCur.nt.img), imgShown: !$('#ncImgBox').classList.contains('hidden') && $('#ncImg').naturalWidth > 0,
      ink: ncCur ? ncCur.nt.ink.length : -1, inked: m.classList.contains('inked'), r: { l: r.left, t: r.top, r: r.right, b: r.bottom } };
  });
  const marks = () => p.evaluate(() => S.items.filter(i => i.nt).map(m => ({ id: m.id, k: m.k, hl: m.hl, c: m.c, fl: m.fl, n: m.pts.length / 3, pts: Array.from(m.pts), nt: m.nt, box: noteBox(m), kids: S.items.filter(i => i.on === m.id).length })));
  const count = () => p.evaluate(() => ({ n: S.items.length, undo: S.undo.length }));
  const scr = (wx, wy) => p.evaluate(([x, y]) => toScreen(x, y), [wx, wy]);
  const badge = () => p.evaluate(() => { const m = S.items.find(i => i.nt), g = noteBadge(m, S.view.z * DPR); return [...toScreen(g.x, g.y), g.r * S.view.z]; });
  const pixel = (x, y) => p.evaluate(([x, y]) => { for (let i = 0; i < 6; i++) draw(); return [...ctxMain.getImageData(Math.round(x * DPR + PADD), Math.round(y * DPR + PADD), 1, 1).data]; }, [x, y]);
  const lassoAround = async box => { await p.evaluate(() => setTool('lasso')); const [x0, y0, x1, y1] = [box[0] - 18, box[1] - 18, box[2] + 18, box[3] + 18]; await draw(poly([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0 + 4])); };

  // ---------- Schrift, mit dem Lasso auswählen, „Erklärung“ ----------
  const text = await p.evaluate(() => __write('Satz des Pythagoras', 300, 200, 26));
  const tb = await p.evaluate(ids => { const b = geoBox(S.items.filter(i => ids.includes(i.id))); return [...toScreen(b[0], b[1]), ...toScreen(b[2], b[3])]; }, text);
  check('Schrift geschrieben', text.length > 10, { strokes: text.length, box: tb });
  await lassoAround(tb);
  const selN = await p.evaluate(() => S.sel ? S.sel.ids.size : 0);
  check('Lasso: Schrift ausgewählt, Knopf „Erklärung“ da', selN === text.length && await p.evaluate(() => !$('#sNote').classList.contains('hidden') && !$('#selbar').classList.contains('hidden')), selN);
  const c0 = await count();
  await p.click('#sNote'); await wait(500);
  let k = await card();
  check('Karte offen, noch ohne Markierung', k.open && k.id === null && k.sel === text.length && k.text === '' && !k.img && k.ink === 0 && !k.inked, k);
  check('Karte unter der Auswahl, ganz zu sehen', k.r.t >= tb[3] + 10 && near(k.r.l, tb[0], 2) && k.r.r <= 1280 && k.r.b <= 860, { card: k.r, box: tb });
  check('Öffnen ändert noch nichts', JSON.stringify(await count()) === JSON.stringify(c0));
  // Schreibfläche: Papier und Punkte wie auf der Seite
  { const bgc = await p.evaluate(() => { const g = $('#ncInk').getContext('2d'), px = (x, y) => [...g.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data].slice(0, 3);
      return { paper: px(5, 5), dot: px(14, 14), want: paperColor(), bg: S.note.bg }; });
    const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    check('Schreibfläche: Papier und Punkte wie auf der Seite', hex(bgc.paper) === bgc.want && bgc.dot[0] < bgc.paper[0] - 20, bgc); }
  // Text tippen: Buchstaben sind keine Kürzel (e = Radierer, h = Textmarker …)
  const typed = 'a² + b² = c² (rechtwinkliges Dreieck, c ist die Hypotenuse)';
  await p.click('#ncText'); await p.keyboard.type(typed); await wait(100);
  { const ta = await p.evaluate(() => { const t = $('#ncText'); return [t.clientHeight, t.scrollHeight]; });
    check('Textfeld wächst mit dem Text (nichts versteckt)', ta[0] > 58 && ta[1] <= ta[0] + 1, ta); }
  check('Tippen in der Karte: kein Werkzeugwechsel, nichts gelöscht', await p.evaluate(() => S.tool) === 'lasso' && (await count()).n === c0.n && (await card()).text === typed);
  // Schreibfläche: Stift schreibt; Handballen (Finger gleich nach dem Stift) drückt nicht „Leeren“
  const ir = await p.evaluate(() => { const r = $('#ncInk').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  await draw(poly([ir.l + 50, ir.t + 45], [ir.l + 120, ir.t + 100]), 0);   // oben links liegt der Werkzeugknopf
  await send('mouseMoved', ir.l + 130, ir.t + 105, { buttons: 0 });   // Stift schwebt noch über der Fläche
  const clr = await p.evaluate(() => { const r = $('#ncClear').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await fingerTap(...clr, 0);
  k = await card(); check('Stift schreibt in die Karte, Handballen leert nicht', k.ink === 1 && k.inked, k);
  { const st = await p.evaluate(() => ({ w: ncCur.nt.ink[0].w, pen: S.size.pen, c: ncCur.nt.ink[0].c, color: S.color.pen })); check('Strich in der Karte mit Stiftbreite und -farbe der Seite', st.w === st.pen && st.c === st.color, st); }
  await fingerTap(...clr);
  k = await card(); check('Finger auf „Leeren“: Schrift der Karte weg', k.open && k.ink === 0 && !k.inked, k);
  // kleines Dreieck mit c
  const L = ir.l, T = ir.t;
  await draw(poly([L + 40, T + 110], [L + 200, T + 110], [L + 40, T + 30], [L + 40, T + 110]));
  await draw(poly([L + 130, T + 60], [L + 122, T + 64], [L + 120, T + 72], [L + 126, T + 77], [L + 136, T + 74]));
  await draw(poly([L + 225, T + 50], [L + 260, T + 50]));
  await draw(poly([L + 230, T + 75], [L + 255, T + 75]));
  k = await card(); check('Skizze in der Karte (4 Striche)', k.ink === 4 && k.inked, k);
  // Glättung wie auf der Seite: eine zittrige Linie (±2 px) wird ruhiger gespeichert
  await draw(Array.from({ length: 45 }, (_, i) => [L + 20 + i * 3, T + 128 + (i % 2 ? 2 : -2)]));
  { const z = await p.evaluate(() => { const q = ncCur.nt.ink.at(-1).pts, ys = []; for (let i = 3; i < q.length - 3; i += 3) ys.push(q[i + 1]); const m = ys.reduce((a, b) => a + b, 0) / ys.length;
      return { smooth: S.smooth, n: ys.length, dev: Math.max(...ys.map(y => Math.abs(y - m))) }; });
    check('Glättung wie auf der Seite: Zittern gedämpft', z.smooth > 0 ? z.dev < 1.3 : z.dev <= 2.1, z); }
  // Radierer-Ende (button 5, buttons 32): nimmt den Strich darunter weg, sonst nichts
  { const r = await p.evaluate(async () => {
      const c = $('#ncLive'), b = c.getBoundingClientRect(), n0 = ncCur.nt.ink.length;
      const ev = (type, x, y, buttons) => c.dispatchEvent(new PointerEvent(type, { pointerId: 78, pointerType: 'pen', isPrimary: true, button: type === 'pointermove' ? -1 : 5, buttons, clientX: b.left + x, clientY: b.top + y, pressure: 0.5, bubbles: true, cancelable: true }));
      ev('pointerdown', 40, 128, 32); for (let x = 40; x <= 140; x += 8) ev('pointermove', x, 128, 32); ev('pointerup', 140, 128, 0);
      await new Promise(ok => setTimeout(ok, 100));
      return { n0, n: ncCur.nt.ink.length };
    });
    check('Radierer-Ende radiert in der Karte (ganzer Strich)', r.n0 === 5 && r.n === 4, r); }
  // Schweben: Punkt in Farbe und Dicke des Stifts, kein Mauszeiger; weg, wenn der Stift die Fläche verlässt
  await send('mouseMoved', L + 150, T + 60, { buttons: 0 }); await wait(50);
  { const h = await p.evaluate(() => { const d = $('#ncDot'), r = d.getBoundingClientRect(), c = $('#ncLive').getBoundingClientRect(); return { show: getComputedStyle(d).display, w: r.width, cx: r.left + r.width / 2 - c.left, cy: r.top + r.height / 2 - c.top, want: Math.max(3, S.size.pen * ncInkS), cur: $('#ncLive').style.cursor }; });
    await send('mouseMoved', 1200, 700, { buttons: 0 }); await wait(50);
    const gone = await p.evaluate(() => getComputedStyle($('#ncDot')).display);
    check('Schweben: Punkt wie auf der Seite, verschwindet beim Verlassen', h.show === 'block' && near(h.w, h.want, 0.6) && near(h.cx, 150, 1) && near(h.cy, 60, 1) && h.cur === 'none' && gone === 'none', { ...h, gone }); }
  // Bild aus der Zwischenablage
  await p.click('#ncPaste'); await p.waitForFunction(() => ncCur && ncCur.nt.img && $('#ncImg').naturalWidth > 0, null, { timeout: 8000 }); await wait(200);
  k = await card(); check('„Einfügen“: Bild in der Karte', k.img && k.imgShown && k.r.b <= 860, k);
  const imgA = await p.evaluate(() => ncCur.nt.img);
  await p.screenshot({ path: path.join(SHOTS, 'notes_card_xp.png'), clip: { x: Math.max(0, k.r.l - 30), y: Math.max(0, tb[1] - 40), width: Math.min(560, 1280 - Math.max(0, k.r.l - 30)), height: Math.min(860 - Math.max(0, tb[1] - 40), k.r.b - tb[1] + 70) } });
  // Bild antippen: groß, nochmal: klein
  await p.click('#ncImg'); await wait(150);
  const big = await p.evaluate(() => [$('#noteCard').classList.contains('big'), $('#noteCard').getBoundingClientRect().width, $('#ncInk').width]);
  await p.click('#ncImg'); await wait(150);
  const small = await p.evaluate(() => [$('#noteCard').classList.contains('big'), $('#noteCard').getBoundingClientRect().width, $('#ncInk').width]);
  check('Bild antippen: groß und wieder klein (Schreibfläche mit)', big[0] && big[1] > 600 && big[2] > 600 && !small[0] && near(small[1], 320, 1) && small[2] < 320, { big, small });
  // Größe des Fensters ändert sich (Bildschirmtastatur): Karte bleibt offen
  await p.setViewportSize({ width: 1280, height: 760 }); await wait(250);
  k = await card(); check('Fenster kleiner: Karte bleibt offen und ganz zu sehen', k.open && k.r.b <= 760 && k.text === typed, k);
  await p.setViewportSize({ width: 1280, height: 520 }); await wait(250);
  { k = await card(); const sc = await p.evaluate(() => { const m = $('#noteCard'); return [m.scrollHeight > m.clientHeight + 4, getComputedStyle(m).overflowY]; });
    check('Ganz kleines Fenster: Karte passt hinein und scrollt innen', k.open && k.r.b <= 520 && k.r.t >= 0 && sc[0] && sc[1] === 'auto', { r: k.r, sc }); }
  await p.setViewportSize({ width: 1280, height: 860 }); await wait(250);

  // ---------- Schließen (Stift tippt daneben): Markierung mit „i“, ein Schritt fürs Rückgängigmachen ----------
  await penTap(1100, 700);
  let [m] = await marks(); const c1 = await count();
  check('Karte zu, Stifttipp daneben setzt keinen Punkt', !(await card()).open && c1.n === c0.n + 1 && c1.undo === c0.undo + 1, { c0, c1 });
  check('Markierung: unsichtbarer Strich (Rechteck) mit Inhalt', m && m.k === 'note' && !m.hl && !m.fl && m.n === 5
    && m.nt.text === typed && m.nt.ink.length === 4 && m.nt.img === imgA && m.kids === text.length, m && { k: m.k, hl: m.hl, fl: m.fl, n: m.n, kids: m.kids, nt: { ...m.nt, ink: m.nt.ink.length } });
  { const gb = await p.evaluate(ids => geoBox(S.items.filter(i => ids.includes(i.id))), text);
    const q = m.pts;
    check('Rechteck 6 px um die Schrift', near(q[0], gb[0] - 6, 0.05) && near(q[1], gb[1] - 6, 0.05) && near(q[6], gb[2] + 6, 0.05) && near(q[7], gb[3] + 6, 0.05)
      && [0, 1].every(i => near(m.box[i], gb[i] - 6, 0.05)) && [2, 3].every(i => near(m.box[i], gb[i] + 6, 0.05)), { q, gb }); }
  { const [bx, by, br] = await badge(), px = await pixel(bx - br * 0.55, by + br * 0.1), white = await pixel(bx, by + br * 0.2);
    const gap = await pixel(tb[0] - 3, (tb[1] + tb[3]) / 2 + 3), inner = await pixel((tb[0] + tb[2]) / 2 + 1.5, tb[1] - 3);
    check('Nur das „i“ oben rechts in der Ecke (blau, weißer Strich), keine blaue Fläche', near(px[0], 47, 30) && near(px[1], 111, 30) && near(px[2], 214, 30) && white[0] > 170 && white[1] > 190 && white[2] > 220
      && near(br, 8, 0.05) && near(bx, tb[2] + 6 - 0.95 * 8, 0.6) && near(by, tb[1] - 6 + 0.95 * 8, 0.6) && gap[2] - gap[0] < 15 && inner[2] - inner[0] < 15, { px, white, br, bx, by, tb, gap, inner }); }
  await p.screenshot({ path: path.join(SHOTS, 'notes_mark_xp.png'), clip: { x: tb[0] - 30, y: tb[1] - 30, width: tb[2] - tb[0] + 90, height: tb[3] - tb[1] + 60 } });
  // Rückgängig, Wiederholen
  await p.click('#bUndo'); await wait(150);
  const undone = await p.evaluate(ids => ({ marks: S.items.filter(i => i.nt).length, on: S.items.filter(i => ids.includes(i.id) && i.on).length }), text);
  await p.click('#bRedo'); await wait(150);
  check('Rückgängig: Markierung weg, Schrift frei; Wiederholen: wieder da', undone.marks === 0 && undone.on === 0 && (await marks()).length === 1, undone);

  // ---------- Wieder öffnen: Fingertipp, Stifttipp aufs „i“ (Stift und Lasso) ----------
  const mid = [(tb[0] + tb[2]) / 2, (tb[1] + tb[3]) / 2];
  await fingerTap(...mid); await p.waitForFunction(() => $('#ncImg').naturalWidth > 0 && !$('#ncImgBox').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
  k = await card();
  check('Fingertipp auf die Markierung: Karte mit Text, Bild und Skizze', k.open && k.id === m.id && k.text === typed && k.imgShown && k.ink === 4 && k.inked, k);
  await p.keyboard.press('Escape'); await wait(300);
  check('Öffnen und schließen ohne Änderung: kein Schritt', !(await card()).open && JSON.stringify(await count()) === JSON.stringify(c1));
  await p.evaluate(() => setTool('pen'));
  const [bx, by] = await badge();
  await penTap(bx, by); await wait(300);
  k = await card(); check('Stift tippt aufs „i“: Karte, kein Punkt', k.open && k.id === m.id && (await count()).n === c1.n, k);
  await p.click('#ncText'); await p.keyboard.press('End'); await p.keyboard.type(' – a, b: Katheten'); await wait(50);
  await p.keyboard.press('Escape'); await wait(300);
  [m] = await marks(); const c2 = await count();
  check('Text ergänzt: gespeichert, ein Schritt', m.nt.text === typed + ' – a, b: Katheten' && c2.undo === c1.undo + 1 && c2.n === c1.n, { text: m.nt.text, c2 });
  await p.evaluate(() => setTool('lasso'));
  await penTap(bx, by); await wait(300);
  k = await card(); check('Lasso tippt aufs „i“: Karte statt Auswahl', k.open && k.id === m.id && await p.evaluate(() => !S.sel), k);
  await p.keyboard.press('Escape'); await wait(300);

  // ---------- Auswahl, Duplizieren, Farbe ----------
  const letter = await p.evaluate(id => { const s = S.items.find(i => i.id === id); return toScreen(s.pts[0], s.pts[1]); }, text[0]);
  await penTap(...letter);
  const sel = await p.evaluate(() => S.sel ? [...S.sel.ids] : []);
  check('Ein Buchstabe angetippt: ganze Erklärung ausgewählt', sel.length === text.length + 1 && sel.includes(m.id), sel.length);
  await p.click('#sDup'); await wait(200);
  { const ms = await marks(), copy = ms.find(x => x.id !== m.id);
    check('Duplizieren: neue Markierung, die Kopie der Schrift hängt an ihr', ms.length === 2 && copy && copy.kids === text.length && ms.find(x => x.id === m.id).kids === text.length && copy.nt.text === m.nt.text, ms.map(x => ({ id: x.id, kids: x.kids }))); }
  await p.click('#bUndo'); await wait(150);
  await penTap(...letter);
  await p.evaluate(() => { S.color.pen = '#d0021b'; }); await p.click('#sColor'); await wait(150);
  { const r = await p.evaluate(ids => ({ mark: S.items.find(i => i.nt).c, ink: [...new Set(S.items.filter(i => ids.includes(i.id)).map(i => i.c))] }), text);
    check('Farbe übernehmen: Schrift rot, Markierung bleibt hellblau', r.mark === '#7fb0ff' && r.ink.length === 1 && r.ink[0] === '#d0021b', r); }
  await p.click('#bUndo'); await wait(150); await p.keyboard.press('Escape'); await wait(150);

  // ---------- Leere Karte: keine Erklärung; Erklärung entfernen; leeren entfernt auch ----------
  const word = await p.evaluate(() => [__write('Hoehe', 300, 420, 22), __write('h = a * b / c', 300, 560, 22)]);
  const wb = await p.evaluate(ids => { const b = geoBox(S.items.filter(i => ids.includes(i.id))); return [...toScreen(b[0], b[1]), ...toScreen(b[2], b[3])]; }, word.flat());
  await lassoAround(wb); const c3 = await count();
  await p.click('#sNote'); await wait(400); await p.keyboard.press('Escape'); await wait(300);
  check('Leere Karte schließen: keine Markierung, kein Schritt', (await marks()).length === 1 && JSON.stringify(await count()) === JSON.stringify(c3));
  await lassoAround(wb); await p.click('#sNote'); await wait(400);
  await p.click('#ncText'); await p.keyboard.type('Höhensatz'); await p.keyboard.press('Escape'); await wait(300);
  let m2 = (await marks()).find(x => x.id !== m.id);
  check('Zweite Erklärung (zwei Zeilen) gespeichert', m2 && m2.nt.text === 'Höhensatz' && m2.kids === word.flat().length && !m2.nt.img && m2.nt.ink.length === 0, m2 && { text: m2.nt.text, kids: m2.kids });
  // Radierer über den Rand der Markierung (zwischen den Zeilen, weit weg von der Schrift): Markierung bleibt
  await p.evaluate(() => setTool('eraser'));
  { const [lx, ty] = await scr(m2.box[0], m2.box[1]), [, by2] = await scr(m2.box[2], m2.box[3]), ym = (ty + by2) / 2;
    const n0 = (await count()).n; await draw(seg([lx - 3, ym - 15], [lx + 3, ym + 15]));
    check('Radierer lässt die Markierung stehen', (await marks()).length === 2 && (await count()).n === n0, { n0, n: (await count()).n }); }
  // Text löschen: leer → Erklärung weg, die Schrift ist wieder frei
  await fingerTap(...(await scr((m2.box[0] + m2.box[2]) / 2, (m2.box[1] + m2.box[3]) / 2)));
  k = await card(); check('Fingertipp öffnet die zweite Erklärung', k.open && k.id === m2.id && k.text === 'Höhensatz', k);
  await p.click('#ncText'); await p.keyboard.press('Control+A'); await p.keyboard.press('Delete'); await p.keyboard.press('Escape'); await wait(300);
  check('Karte geleert: Erklärung weg, Schrift frei', (await marks()).length === 1 && await p.evaluate(ids => S.items.filter(i => ids.includes(i.id) && i.on).length, word.flat()) === 0);
  await p.click('#bUndo'); await wait(150);
  m2 = (await marks()).find(x => x.id !== m.id);
  check('Rückgängig: Erklärung wieder da', !!m2 && m2.kids === word.flat().length);
  await fingerTap(...(await scr((m2.box[0] + m2.box[2]) / 2, (m2.box[1] + m2.box[3]) / 2)));
  await p.click('#ncDel'); await wait(300);
  check('Mülleimer: Erklärung entfernt, Karte zu', !(await card()).open && (await marks()).length === 1 && await p.evaluate(ids => S.items.filter(i => ids.includes(i.id) && i.on).length, word.flat()) === 0);

  // ---------- Strg + V in die offene Karte: Bild austauschen; Aufräumen beim Schließen der Seite ----------
  await fingerTap(...mid); await wait(200);
  await p.evaluate(async () => { const dt = new DataTransfer(); dt.items.add(new File([window.__clipB], 'b.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await p.waitForFunction(a => ncCur && ncCur.nt.img && ncCur.nt.img !== a, imgA, { timeout: 8000 });
  const imgB = await p.evaluate(() => ncCur.nt.img), nImg = await p.evaluate(() => S.items.filter(i => i.t === 'i').length);
  check('Strg + V mit offener Karte: Bild kommt in die Karte, nicht auf die Seite', imgB !== imgA && nImg === 0, { imgB, nImg });
  await p.keyboard.press('Escape'); await wait(300);
  const noteId = await p.evaluate(() => S.note.id);
  await p.click('#bBack'); await wait(800);
  const kept = await p.evaluate(async ([a, bb]) => [!!(await dbImageGet(a)), !!(await dbImageGet(bb))], [imgA, imgB]);
  check('Seite zu: altes Bild der Karte gelöscht, neues bleibt', !kept[0] && kept[1], kept);
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId); await wait(600);
  [m] = await marks();
  check('Nach dem Wiederöffnen: Erklärung gespeichert', m && m.nt.img === imgB && m.nt.ink.length === 4 && m.kids === text.length, m && { img: m.nt.img, kids: m.kids });

  // ---------- Sicherung: als Kopie wiederhergestellt, Bild der Erklärung mit neuer id ----------
  await p.click('#bBack'); await wait(600);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bk = path.join(os.tmpdir(), 'notes-backup.notizen'); await dl.saveAs(bk);
  // Seite danach noch ändern: die Sicherung ist älter, sie kommt als Kopie zurück
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId); await wait(500);
  await p.evaluate(() => __write('neu', 300, 700, 20)); await p.click('#bBack'); await wait(600);
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy, null, { timeout: 20000 }); await wait(500);
  const rest = await p.evaluate(async () => {
    const copy = (await dbIndexAll()).find(x => / \(Sicherung\)$/.test(x.name)); if (!copy) return null;
    const mk = (await dbItems(copy.id)).find(i => i.nt); const im = mk && await dbImageGet(mk.nt.img);
    return { name: copy.name, img: mk && mk.nt.img, has: !!im, n: im && im.n === copy.id, text: mk && mk.nt.text };
  });
  check('Sicherung als Kopie: Erklärung mit eigenem Bild', rest && rest.has && rest.n && rest.img !== imgB && rest.text === m.nt.text, rest);
  fs.unlinkSync(bk);

  // ---------- Pfeil: Erklärung groß in einem eigenen Fenster (85 % des Bildschirms, dahinter abgedunkelt) ----------
  const shotAround = async (name, r) => {
    const x0 = Math.max(0, Math.min(tb[0], r.l) - 30), y0 = Math.max(0, Math.min(tb[1], r.t) - 30), x1 = Math.min(1280, Math.max(tb[2], r.r) + 30), y1 = Math.min(860, Math.max(tb[3], r.b) + 30);
    await p.screenshot({ path: path.join(SHOTS, name), clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
  };
  const glanceInfo = () => p.evaluate(() => {
    const m = $('#noteCard'), c = $('#ncInk'), d = $('#ncDim');
    return { glance: m.classList.contains('glance'), l: m.offsetLeft, t: m.offsetTop, w: m.offsetWidth, h: m.offsetHeight, inkW: c.clientWidth, inkH: c.clientHeight, boxH: c.parentNode.offsetHeight,
      dim: !d.classList.contains('hidden'), dimZ: +getComputedStyle(d).zIndex, z: +getComputedStyle(m).zIndex, icon: $('#ncGrow use').getAttribute('href'), title: $('#ncGrow').title, s: ncInkS,
      inkX: c.getBoundingClientRect().left - m.getBoundingClientRect().left };
  });
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId); await wait(600);
  await fingerTap(...mid, 0); await p.waitForFunction(() => $('#ncImg').naturalWidth > 0, null, { timeout: 5000 }).catch(() => {}); await wait(300);
  const g0 = await glanceInfo();
  await p.click('#ncGrow'); await wait(800);
  const g1 = await glanceInfo();
  check('Pfeil: großes Fenster in der Mitte (85 % des Bildschirms), dahinter abgedunkelt', !g0.glance && !g0.dim && g0.inkW < 300 && g0.boxH === 140 && g0.icon === '#ic-grow' && g0.title === 'Schreibfläche vergrößern'
    && g1.glance && near(g1.w, 1280 * 0.85, 1) && near(g1.h, 860 * 0.85, 1) && near(g1.l, 1280 * 0.075, 1) && near(g1.t, 860 * 0.075, 1) && g1.dim && g1.z > g1.dimZ
    && g1.inkW > 1000 && g1.inkH > 450 && g1.inkX < 30 && g1.icon === '#ic-shrink' && g1.title === 'Schreibfläche verkleinern', { g0, g1 });
  { const lay = await p.evaluate(() => { const r = s => $(s).getBoundingClientRect(); return { img: r('#ncImgBox'), text: r('#ncText'), btn: r('.ncrow'), ink: r('.ncink'), card: r('#noteCard') }; });
    const top = Math.max(lay.img.bottom, lay.text.bottom, lay.btn.bottom);
    check('Großes Fenster: oben eine Leiste (Bild, Text, Knöpfe nebeneinander), darunter die Schreibfläche über die ganze Breite',
      near(lay.img.top, lay.text.top, 2) && near(lay.text.top, lay.btn.top, 2) && lay.img.right < lay.text.left && lay.text.right < lay.btn.left && lay.ink.top >= top && near(lay.ink.left, lay.img.left, 1) && near(lay.ink.right, lay.btn.right, 1) && top - lay.card.top < 200,
      { img: [lay.img.left, lay.img.top, lay.img.right, lay.img.bottom], text: [lay.text.left, lay.text.top, lay.text.right], btn: [lay.btn.left, lay.btn.top, lay.btn.right], ink: [lay.ink.left, lay.ink.top, lay.ink.right] }); }
  // Handballen auf dem dunklen Rand, während der Stift schwebt: bleibt offen
  await send('mouseMoved', 700, 400, { buttons: 0 });
  await fingerTap(60, 820, 0);
  check('Handballen auf dem dunklen Rand: Fenster bleibt offen', (await glanceInfo()).glance && (await card()).open);
  // großer Strich unten rechts im großen Fenster
  { const r = await p.evaluate(() => { const r = $('#ncInk').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
    await draw(poly([r.l + r.w - 200, r.t + r.h - 70], [r.l + r.w - 120, r.t + r.h - 40], [r.l + r.w - 40, r.t + r.h - 60])); }
  const nInk = await p.evaluate(() => ncCur.nt.ink.length);
  await p.screenshot({ path: path.join(SHOTS, 'notes_glance_xp.png') });
  await p.click('#ncGrow'); await wait(800);
  const g2 = await glanceInfo(); k = await card();
  check('Pfeil im großen Fenster: zurück zur kleinen Karte bei der Markierung, Hintergrund wieder hell', !g2.glance && !g2.dim && g2.inkW < 300 && g2.boxH === 140 && g2.icon === '#ic-grow' && k.r.t > tb[1] && near(g2.l, tb[0] - 6, 3), { g2, card: k.r });
  check('Kleine Karte: große Skizze verkleinert, ganz zu sehen', nInk === 5 && g2.s > 0.15 && g2.s < 0.6, { s: g2.s, nInk });
  // in der verkleinerten Fläche weiterschreiben: landet im Maßstab der großen
  { const r = await p.evaluate(() => { const r = $('#ncInk').getBoundingClientRect(); return { l: r.left, t: r.top }; });
    await draw(seg([r.l + 20, r.t + 100], [r.l + 60, r.t + 100]));
    const st = await p.evaluate(() => { const s = ncCur.nt.ink.at(-1); return [s.pts[0], s.pts[1]]; });
    check('In der verkleinerten Fläche geschrieben: im Maßstab der großen gespeichert', near(st[0], 20 / g2.s, 3) && near(st[1], 100 / g2.s, 3), { st, s: g2.s }); }
  // groß, dann daneben tippen: Erklärung zu und gespeichert
  await p.click('#ncGrow'); await wait(800);
  await p.mouse.click(60, 820); await wait(500);
  { const g3 = await glanceInfo(), mk = (await marks()).find(x => x.id === m.id);
    check('Großes Fenster, daneben tippen: Erklärung zu, gespeichert, Hintergrund hell', !(await card()).open && !g3.dim && mk.nt.ink.length === nInk + 1, { ink: mk.nt.ink.length, nInk, dim: g3.dim }); }
  await fingerTap(...mid); await wait(300);
  { const g4 = await glanceInfo(); check('Wieder öffnen: kleine Karte, Skizze verkleinert', (await card()).open && !g4.glance && !g4.dim && g4.s < 0.6, g4); }
  await p.keyboard.press('Escape'); await wait(300);
  // Esc im großen Fenster schließt ebenso
  await fingerTap(...mid); await wait(300); await p.click('#ncGrow'); await wait(800); await p.keyboard.press('Escape'); await wait(500);
  check('Esc im großen Fenster: zu, Hintergrund hell', !(await card()).open && !(await glanceInfo()).dim);
  await p.click('#bBack'); await wait(600);

  // ---------- Notiz: Text einfügen, Werkzeuge (Knopf oben links in der Schreibfläche) ----------
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId); await wait(600);
  const ww = await p.evaluate(() => __write('Werkzeuge', 700, 430, 22));
  const wb2 = await p.evaluate(ids => { const b = geoBox(S.items.filter(i => ids.includes(i.id))); return [...toScreen(b[0], b[1]), ...toScreen(b[2], b[3])]; }, ww);
  await lassoAround(wb2); await p.click('#sNote'); await wait(500);
  await p.evaluate(() => { window.__clipText = 'Text aus der Zwischenablage'; });
  await p.click('#ncPaste'); await wait(300);
  { const k2 = await card(); check('Einfügen in der Notiz: Text aus der Zwischenablage kommt ins Textfeld', k2.text === 'Text aus der Zwischenablage' && !k2.img, k2); }
  await p.evaluate(() => { window.__clipText = null; });
  const pal = () => p.evaluate(() => ({ open: !$('#ncPal').classList.contains('hidden') && !$('#ncPal').dataset.closing, tools: $$('#ncPal .nct').length, colors: $$('#ncPal .ncc').length,
    pats: $$('#ncPal .ncp').length, sizes: $$('#ncPal .ncs').length, custom: !!$('#ncPal .ncc.on[title="Eigene Farbe"]'), tool: ncTool, icon: $('#ncTools use').getAttribute('href'), dot: $('#ncTools i').style.background }));
  const lastInk = () => p.evaluate(() => { const s = ncCur.nt.ink.at(-1); return s && { c: s.c, w: s.w, hl: !!s.hl, tp: s.tp, hid: s.hid, id: s.id, on: s.on, n: ncCur.nt.ink.length }; });
  const R = await p.evaluate(() => { const r = $('#ncLive').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const tool = async name => { await p.click('#ncTools'); await wait(400); await p.click(`#ncPal .nct[title="${name}"]`); await wait(150); const q = await pal(); await p.click('#ncTools'); await wait(400); return q; };
  const q0 = await pal();
  await p.click('#ncTools'); await wait(450);
  const q1 = await pal(), inside = await p.evaluate(() => { const a = $('#ncPal').getBoundingClientRect(), b = $('.ncink').getBoundingClientRect(); return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom; });
  check('Werkzeugknopf: ein Tipp klappt Werkzeuge, Farben und Dicken auf (in der Schreibfläche, eigene Farbe vorne)', !q0.open && q1.open && q1.tools === 4 && q1.colors === 8 && q1.custom && q1.sizes === 5 && q1.pats === 0 && q1.icon === '#ic-pen' && inside, { q0, q1, inside });
  await shotAround('notes_tools_xp.png', (await card()).r);
  await p.click('#ncPal .ncc[title="#e53935"]'); await wait(400);
  const q2 = await pal();
  await draw(seg([R.l + 50, R.t + 45], [R.l + 150, R.t + 45]));
  { const s = await lastInk(); check('Farbe gewählt: Auswahl geht zu, der Knopf zeigt sie, der Strich ist rot', !q2.open && /229, 57, 53/.test(q2.dot) && s.c === '#e53935' && !s.hl, { q2, s }); }
  const q3 = await tool('Textmarker');
  await draw(seg([R.l + 50, R.t + 72], [R.l + 180, R.t + 72]));
  { const s = await lastInk(), want = await p.evaluate(() => ({ w: S.size.hl, c: S.color.hl }));
    check('Textmarker in der Notiz: Farben und 4 Dicken der Leiste, Strich in Textmarker-Dicke', q3.tool === 'hl' && q3.icon === '#ic-hl' && q3.colors === 7 && q3.sizes === 4 && s.hl && s.w === want.w && s.c === want.c, { q3, s, want }); }
  // Tape mit Muster „Punkte“: deckt ab; darauf Geschriebenes gehört dazu; mit dem Tape antippen deckt auf (das Geschriebene ist weg)
  await p.click('#ncTools'); await wait(400); await p.click('#ncPal .nct[title="Tape"]'); await wait(150);
  const q4 = await pal(); await p.click('#ncPal .ncp[title="Punkte"]'); await wait(400);
  await draw(seg([R.l + 30, R.t + 108], [R.l + 220, R.t + 108], 20));
  const tape = await lastInk();
  await tool('Stift'); await draw(seg([R.l + 60, R.t + 108], [R.l + 100, R.t + 110]));
  const onTape = await lastInk();
  await tool('Tape'); await penTap(R.l + 180, R.t + 108);
  const tp2 = await p.evaluate(id => { const t = ncCur.nt.ink.find(s => s.id === id), on = ncCur.nt.ink.filter(s => s.on === id); return { hid: t.hid, onShown: on.map(s => inkShown(ncCur.nt.ink)(s)) }; }, tape.id);
  check('Tape in der Notiz: Muster und Farben der Leiste, abgedeckt; Geschriebenes darauf gehört dazu; antippen deckt auf',
    q4.pats === 7 && q4.colors === 6 && q4.sizes === 4 && tape.tp === 'punkte' && tape.hid === true && !!tape.id && onTape.on === tape.id && tp2.hid === false && tp2.onShown.length === 1 && tp2.onShown[0] === false, { q4, tape, onTape, tp2 });
  // Radierer der Notiz: nimmt das Tape samt dem, was darauf steht, sonst nichts
  const q5 = await tool('Radierer'), n0 = (await lastInk()).n;
  await draw(seg([R.l + 40, R.t + 108], [R.l + 210, R.t + 108]));
  { const r = await p.evaluate(id => ({ n: ncCur.nt.ink.length, tape: ncCur.nt.ink.some(s => s.id === id || s.on === id) }), tape.id);
    check('Radierer der Notiz: Tape und Geschriebenes darauf weg, sonst nichts', q5.tool === 'eraser' && q5.icon === '#ic-eraser' && q5.colors === 0 && q5.sizes === 0 && r.n === n0 - 2 && !r.tape, { q5, n0, r }); }
  await tool('Stift');
  await p.evaluate(() => { S.color.pen = 'ink'; store.set('color', S.color); renderColors(); });
  await p.click('#ncGrow'); await wait(800); await p.click('#ncTools'); await wait(450);
  { const g = await p.evaluate(() => { const a = $('#ncPal').getBoundingClientRect(), b = $('.ncink').getBoundingClientRect(); return { w: a.width, h: a.height, left: a.left - b.left, top: a.top - b.top }; });
    check('Großes Fenster: Auswahl als schmale Spalte am linken Rand', g.w < 90 && g.h > g.w * 3 && g.left < 10, g); }
  await p.screenshot({ path: path.join(SHOTS, 'notes_tools_glance_xp.png') });
  await p.keyboard.press('Escape'); await wait(400);
  await p.click('#bBack'); await wait(600);

  // ---------- Bilder im modernen Aussehen (klein, dann groß) ----------
  await p.evaluate(async id => { toggleTheme(); await openNote(await dbIndexGet(id)); }, noteId); await wait(600);
  await fingerTap(...mid); await p.waitForFunction(() => $('#ncImg').naturalWidth > 0, null, { timeout: 5000 }).catch(() => {}); await wait(400);
  await shotAround('notes_card_modern.png', (await card()).r);
  await p.click('#ncGrow'); await wait(800);
  await p.screenshot({ path: path.join(SHOTS, 'notes_glance_modern.png') });
  await p.keyboard.press('Escape'); await wait(300);

  check('Keine Fehler', errs.length === 0, errs);
  res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  console.log(fails.length ? 'FEHLER: ' + fails.length : 'alles ok');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(res, null, 1)); process.exit(1); });
