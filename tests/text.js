// Text auf der Seite: Werkzeug „Text“ (im Knopf mit Lasso, Tape und Formen, Taste X). Antippen öffnet ein Textfeld mit
// Leiste (Schrift, Größe, Fett, Kursiv, Unterstrichen, Durchgestrichen, Farbe, Ausrichtung, Löschen, Fertig); gespeichert
// als Element t 'x' mit Läufen und auf den Kacheln gesetzt wie im Textfeld (gleiche Umbrüche). Dazu: bearbeiten,
// Rückgängig, Tastenkürzel im Text, leer = kein Text, Breite (Ziehen, Griff), löschen, Lasso (verschieben, skalieren,
// duplizieren), Notiz an einem Text, Finger, Speichern, Sicherung.
// node tests/text.js [Notizen.html]    Bilder: NOTES_SHOTS=<Ordner> (sonst der Temp-Ordner)
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
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  const penTap = async (x, y) => { await send('mouseMoved', x, y, { buttons: 0 }); await send('mousePressed', x, y); await send('mouseReleased', x, y); await wait(250); };
  const drag = async (x0, y0, x1, y1, n = 10) => { await send('mouseMoved', x0, y0, { buttons: 0 }); await send('mousePressed', x0, y0); for (let i = 1; i <= n; i++) await send('mouseMoved', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await send('mouseReleased', x1, y1); await wait(250); };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const fingerTap = async (x, y) => { await wait(700); await touch('touchStart', [[x, y]]); await wait(60); await touch('touchEnd', []); await wait(300); };
  const ed = () => p.evaluate(() => ({ open: !!txEd, vis: !$('#txEd').classList.contains('hidden'), bar: !$('#txBar').classList.contains('hidden'), focus: document.activeElement === $('#txEd'),
    html: $('#txEd').innerHTML, text: $('#txEd').innerText, id: txEd && txEd.id, w: txEd && txEd.w }));
  const texts = () => p.evaluate(() => S.items.filter(i => i.t === 'x').map(i => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h, ff: i.ff, fs: i.fs, c: i.c, al: i.al, runs: i.runs, lines: textLayout(i).lines.length })));
  const count = () => p.evaluate(() => ({ n: S.items.length, undo: S.undo.length }));
  const sel = s => p.evaluate(s => { const w = document.createTreeWalker($('#txEd'), NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const i = n.data.indexOf(s); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + s.length); const g = getSelection(); g.removeAllRanges(); g.addRange(r); return true; } }
    return false; }, s);
  const center = it => p.evaluate(it => toScreen(it.x + it.w / 2, it.y + it.h / 2), it);

  // ---------- Werkzeug: eigener Knopf in der Leiste (nach dem Textmarker) ----------
  await p.click('#bar [data-tool=text]'); await wait(300);
  { const t = await p.evaluate(() => ({ tool: S.tool, on: $('#bar [data-tool=text]').classList.contains('on'), after: $('#bar [data-tool=text]').previousElementSibling.dataset.tool, grp: $('#bGroup').dataset.tool, cur: cvLive.style.cursor, menu: $$('#grpMenu [data-gtool]').map(b => b.dataset.gtool).join() }));
    check('Werkzeug „Text“ mit eigenem Knopf in der Leiste (nicht im Knopf mit Lasso und Tape)', t.tool === 'text' && t.on && t.after === 'hl' && t.grp === 'lasso' && t.cur === 'text' && t.menu === 'lasso,tape', t); }

  // ---------- Antippen, tippen, formatieren ----------
  const c0 = await count();
  await penTap(300, 200); await wait(200);
  let e = await ed();
  check('Antippen: Textfeld mit Leiste, Cursor darin', e.open && e.vis && e.bar && e.focus && e.id === null, e);
  { const r = await p.evaluate(() => { const r = $('#txEd').getBoundingClientRect(); return { l: r.left, t: r.top, fs: parseFloat($('#txEd').style.fontSize) }; });
    check('Textfeld dort, wo getippt wurde (erste Zeile mittig)', near(r.l, 300, 1) && near(r.t + r.fs * 0.675, 200, 1.5), r); }
  await p.keyboard.type('Hallo Welt'); await p.keyboard.press('Enter'); await p.keyboard.type('Zeile zwei');
  { const r = await p.evaluate(() => ({ html: $('#txEd').innerHTML, text: $('#txEd').innerText }));
    check('Enter: Zeilenumbruch im Text (kein Block)', !/<(div|p)\b/.test(r.html) && r.text.startsWith('Hallo Welt\nZeile zwei'), r); }
  await sel('Welt'); await p.click('#txBar .txf[data-cmd=bold]'); await p.click('#txColors .txc[title="#e53935"]');
  check('Fett-Knopf zeigt den Zustand der Markierung', await p.evaluate(() => $('#txBar .txf[data-cmd=bold]').classList.contains('on')));
  await sel('zwei'); await p.click('#txBar .txf[data-cmd=underline]');
  await sel('Zeile'); await p.click('#txBar .txf[data-cmd=italic]');
  await sel('Hallo'); await p.click('#txBar .txf[data-cmd=strikeThrough]');
  await p.selectOption('#txFont', 'serif'); await p.click('#txPlus'); await p.click('#txPlus'); await p.click('#txBar .txa[data-al=c]'); await wait(150);
  { const r = await p.evaluate(() => ({ ff: txEd.ff, fs: txEd.fs, al: txEd.al, css: [$('#txEd').style.fontFamily, $('#txEd').style.fontSize, $('#txEd').style.textAlign], size: $('#txSize').textContent }));
    check('Schrift, Größe (20 → 28) und Ausrichtung gelten für das ganze Textfeld', r.ff === 'serif' && r.fs === 28 && r.al === 'c' && /Times New Roman/.test(r.css[0]) && r.css[1] === '28px' && r.css[2] === 'center' && r.size === '28', r); }
  await p.screenshot({ path: path.join(SHOTS, 'text_edit_xp.png'), clip: { x: 180, y: 60, width: 760, height: 260 } });
  // daneben tippen: fertig (mit dem Text-Werkzeug entsteht dabei kein neues Textfeld)
  await penTap(900, 650);
  let T = await texts(); const c1 = await count();
  check('Daneben tippen: gespeichert (ein Schritt), kein neues Textfeld', !(await ed()).open && T.length === 1 && c1.n === c0.n + 1 && c1.undo === c0.undo + 1, { T, c0, c1 });
  const tx = T[0];
  check('Gespeichert: Läufe mit Format, Schrift, Größe, Ausrichtung, zwei Zeilen', JSON.stringify(tx.runs) === JSON.stringify([{ s: 'Hallo', k: 1 }, { s: ' ' }, { s: 'Welt', b: 1, c: '#e53935' }, { s: '\n' }, { s: 'Zeile', i: 1 }, { s: ' ' }, { s: 'zwei', u: 1 }])
    && tx.ff === 'serif' && tx.fs === 28 && tx.al === 'c' && tx.c === 'ink' && tx.lines === 2 && near(tx.h, 2 * 28 * 1.35, 0.01), tx);
  { const px = await p.evaluate(it => { for (let i = 0; i < 6; i++) draw(); const [x0, y0] = toScreen(it.x, it.y), [x1, y1] = toScreen(it.x + it.w, it.y + it.h);
      const d = ctxMain.getImageData(Math.round(x0 * DPR + PADD), Math.round(y0 * DPR + PADD), Math.round((x1 - x0) * DPR), Math.round((y1 - y0) * DPR)).data; let red = 0, dark = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 110) red++; else if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) dark++; } return { red, dark }; }, tx);
    check('Auf der Seite gezeichnet (rotes „Welt“, dunkle Schrift)', px.red > 30 && px.dark > 100, px); }
  await p.screenshot({ path: path.join(SHOTS, 'text_page_xp.png'), clip: { x: 180, y: 140, width: 760, height: 160 } });

  // ---------- Bearbeiten: antippen, das Format ist wieder da; alles kursiv ----------
  await penTap(...(await center(tx)));
  e = await ed();
  check('Text antippen: bearbeiten, Format wieder da, auf der Seite ausgeblendet', e.open && e.id === tx.id && /<b>/.test(e.html) && /<u>/.test(e.html) && /<i>/.test(e.html) && /<strike>/.test(e.html)
    && e.text.startsWith('Hallo Welt') && await p.evaluate(id => { const h = hiddenIds(); return !!h && h.has(id); }, tx.id), e);
  await p.evaluate(() => { const r = document.createRange(); r.selectNodeContents($('#txEd')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); });
  await p.click('#txBar .txf[data-cmd=italic]'); await p.click('#txOk'); await wait(250);
  T = await texts(); const c2 = await count();
  check('Alles kursiv, ✓: gespeichert (ein Schritt)', T.length === 1 && T[0].runs.every(r => r.i === 1) && c2.undo === c1.undo + 1 && c2.n === c1.n, { runs: T[0].runs, c2 });
  await p.click('#bUndo'); await wait(150);
  const undone = (await texts())[0].runs;
  await p.click('#bRedo'); await wait(150);
  check('Rückgängig / Wiederholen', JSON.stringify(undone) === JSON.stringify(tx.runs) && (await texts())[0].runs.every(r => r.i === 1));

  // ---------- Buchstaben im Text sind keine Kürzel; Esc speichert ----------
  await penTap(300, 420); await p.keyboard.type('pel ehx 12'); await p.keyboard.press('Escape'); await wait(250);
  T = await texts();
  check('Tippen im Text: kein Werkzeugwechsel; Esc speichert', await p.evaluate(() => S.tool) === 'text' && T.length === 2 && T.some(t => t.runs.map(r => r.s).join('') === 'pel ehx 12'), T.map(t => t.runs));
  // leer: kein Text
  const c3 = await count();
  await penTap(300, 560); await penTap(900, 650);
  check('Leeres Textfeld: nichts gespeichert', JSON.stringify(await count()) === JSON.stringify(c3) && !(await ed()).open);

  // ---------- Breite: beim Anlegen ziehen; Umbruch wie im Textfeld; Griff ----------
  await drag(600, 300, 800, 300);
  e = await ed();
  const long = 'Ein langer Satz, der in diesem schmalen Textfeld über mehrere Zeilen umbrechen muss.';
  await p.keyboard.type(long); await wait(100);
  const edLines = await p.evaluate(() => Math.round($('#txEd').getBoundingClientRect().height / (txEd.fs * S.view.z * 1.35)));
  await penTap(900, 650);
  T = await texts(); let lt = T.find(t => t.runs.map(r => r.s).join('') === long);
  check('Ziehen beim Anlegen: so breit wie gezogen; Umbrüche wie im Textfeld', near(e.w, 200, 1) && lt && near(lt.w, 200, 1) && lt.lines >= 3 && lt.lines === edLines, { w: e.w, lt: lt && { w: lt.w, lines: lt.lines }, edLines });
  await penTap(...(await center(lt)));
  { const g = await p.evaluate(() => { const r = $('#txGrip').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.mouse.move(g[0], g[1]); await p.mouse.down(); await p.mouse.move(g[0] + 60, g[1], { steps: 4 }); await p.mouse.move(g[0] + 120, g[1], { steps: 4 }); await p.mouse.up(); await wait(150); }
  const wGrip = (await ed()).w;
  await p.click('#txOk'); await wait(250);
  lt = (await texts()).find(t => t.id === lt.id);
  check('Griff rechts: um den gezogenen Weg breiter, weniger Zeilen', near(wGrip, 320, 1) && near(lt.w, wGrip, 0.01) && lt.lines < edLines, { wGrip, w: lt.w, lines: lt.lines, edLines });

  // ---------- Dreieck unten rechts: das Textfeld beim Schreiben verschieben ----------
  { const it0 = (await texts()).find(t => t.id === lt.id), c5 = await count();
    await penTap(...(await center(it0)));
    const m = await p.evaluate(() => { const r = $('#txMove').getBoundingClientRect(), e = $('#txEd').getBoundingClientRect(), g = $('#txGrip').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: getComputedStyle($('#txMove')).display !== 'none', below: r.top >= g.bottom - 1, corner: r.left >= e.right - 6 && r.top >= e.bottom - 10 }; });
    await p.mouse.move(m.x, m.y); await p.mouse.down(); await p.mouse.move(m.x + 40, m.y + 25, { steps: 4 }); await p.mouse.move(m.x + 80, m.y + 50, { steps: 4 }); await p.mouse.up(); await wait(150);
    const want = await p.evaluate(([x, y]) => S.snap ? [snapX(x), snapY(y)] : [x, y], [it0.x + 80, it0.y + 50]);
    const during = await p.evaluate(() => ({ x: txEd.x, y: txEd.y, focus: document.activeElement === $('#txEd'), open: !!txEd }));
    await p.click('#txOk'); await wait(250);
    const it1 = (await texts()).find(t => t.id === lt.id);
    check('Dreieck unten rechts verschiebt das Textfeld (Text bleibt offen, ein Schritt fürs Rückgängigmachen)', m.vis && m.below && m.corner && during.open && during.focus
      && near(during.x, want[0], 0.01) && near(during.y, want[1], 0.01) && near(it1.x, want[0], 0.01) && near(it1.y, want[1], 0.01) && (await count()).undo === c5.undo + 1, { m, during, want, it1: [it1.x, it1.y] }); }

  // ---------- Löschen über die Leiste ----------
  const short = (await texts()).find(t => t.runs.map(r => r.s).join('') === 'pel ehx 12'), c4 = await count();
  await penTap(...(await center(short))); await p.click('#txDel'); await wait(250);
  check('Mülleimer der Leiste: Text weg (ein Schritt)', !(await texts()).some(t => t.id === short.id) && (await count()).undo === c4.undo + 1 && !(await ed()).open);

  // ---------- Lasso: auswählen, verschieben, skalieren, duplizieren ----------
  await p.evaluate(() => setTool('lasso'));
  const [hx, hy] = await center(tx);
  await penTap(hx, hy);
  check('Lasso tippt einen Text an: ausgewählt', await p.evaluate(id => !!S.sel && S.sel.ids.has(id) && S.sel.ids.size === 1, tx.id));
  await drag(hx, hy, hx + 60, hy + 40);
  { const m = (await texts()).find(t => t.id === tx.id); check('Verschieben', near(m.x - tx.x, 60, 1.5) && near(m.y - tx.y, 40, 1.5), { dx: m.x - tx.x, dy: m.y - tx.y }); }
  { const s = await p.evaluate(id => { const it = S.items.find(i => i.id === id), n = transformItem(it, 1.5, it.x, it.y, 0, 0); return { fs: n.fs / it.fs, w: n.w / it.w, h: n.h / it.h, lines: textLayout(n).lines.length === textLayout(it).lines.length }; }, tx.id);
    check('Skalieren: Schrift, Breite und Höhe wachsen mit, gleiche Zeilen', near(s.fs, 1.5, 1e-9) && near(s.w, 1.5, 1e-9) && near(s.h, 1.5, 1e-9) && s.lines, s); }
  await p.click('#sDup'); await wait(200);
  check('Duplizieren: Kopie des Textes', (await texts()).filter(t => JSON.stringify(t.runs) === JSON.stringify((T.find(x => x.id === tx.id) || tx).runs)).length === 2);
  await p.click('#bUndo'); await wait(150);

  // ---------- Notiz an einem Text ----------
  await penTap(...(await center((await texts()).find(t => t.id === tx.id))));
  await p.click('#sNote'); await wait(400);
  await p.click('#ncText'); await p.keyboard.type('Notiz zum Text'); await p.keyboard.press('Escape'); await wait(300);
  { const r = await p.evaluate(id => { const m = S.items.find(i => i.nt), it = S.items.find(i => i.id === id); return m && { text: m.nt.text, on: it.on === m.id, box: noteBox(m), it: [it.x, it.y, it.x + it.w, it.y + it.h] }; }, tx.id);
    check('Notiz an einem Text: Markierung 6 px um den Textkasten', r && r.text === 'Notiz zum Text' && r.on && [0, 1].every(i => near(r.box[i], r.it[i] - 6, 0.05)) && [2, 3].every(i => near(r.box[i], r.it[i] + 6, 0.05)), r); }

  // ---------- Finger: mit dem Text-Werkzeug antippen schreibt ----------
  await p.evaluate(() => setTool('text'));
  await fingerTap(300, 760);
  e = await ed();
  check('Finger tippt mit dem Text-Werkzeug: Textfeld', e.open && e.id === null && e.focus, e);
  await p.keyboard.press('Escape'); await wait(200);

  // ---------- Speichern: Seite zu und wieder auf ----------
  const noteId = await p.evaluate(() => S.note.id), before = await texts();
  await p.click('#bBack'); await wait(700);
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId); await wait(600);
  check('Nach dem Wiederöffnen: Texte mit Format da', JSON.stringify((await texts()).map(t => [t.runs, t.ff, t.fs, t.al])) === JSON.stringify(before.map(t => [t.runs, t.ff, t.fs, t.al])));

  // ---------- Sicherung als Kopie: Text bekommt kein Bild-Feld ----------
  await p.click('#bBack'); await wait(600);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bk = path.join(os.tmpdir(), 'text-backup.notizen'); await dl.saveAs(bk);
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId);   // danach noch ändern: die Sicherung ist älter, sie kommt als Kopie zurück
  await wait(400); await p.evaluate(() => { setTool('text'); }); await penTap(300, 700); await p.keyboard.type('neu'); await p.keyboard.press('Escape'); await wait(200);
  await p.click('#bBack'); await wait(600);
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy, null, { timeout: 20000 }); await wait(400);
  { const r = await p.evaluate(async () => { const copy = (await dbIndexAll()).find(x => / \(Sicherung\)$/.test(x.name)); if (!copy) return null; const its = (await dbItems(copy.id)).filter(i => i.t === 'x'); return { n: its.length, img: its.some(i => 'img' in i), runs: its.every(i => Array.isArray(i.runs)) }; });
    check('Sicherung als Kopie: Texte da, ohne Bild-Feld', r && r.n === before.length && !r.img && r.runs, r); }
  fs.unlinkSync(bk);

  // ---------- Bilder im modernen Aussehen ----------
  await p.evaluate(async id => { toggleTheme(); await openNote(await dbIndexGet(id)); setTool('text'); }, noteId); await wait(600);
  { const it = (await texts()).find(t => t.id === tx.id); await penTap(...(await center(it))); await wait(300);
    const r = await p.evaluate(() => { const a = $('#txBar').getBoundingClientRect(), b = $('#txEd').getBoundingClientRect(); return [Math.min(a.left, b.left), Math.min(a.top, b.top), Math.max(a.right, b.right), Math.max(a.bottom, b.bottom)]; });
    await p.screenshot({ path: path.join(SHOTS, 'text_edit_modern.png'), clip: { x: Math.max(0, r[0] - 30), y: Math.max(0, r[1] - 20), width: Math.min(1280, r[2] + 40) - Math.max(0, r[0] - 30), height: Math.min(860, r[3] + 30) - Math.max(0, r[1] - 20) } });
    await p.keyboard.press('Escape'); await wait(200); }

  check('Keine Fehler', errs.length === 0, errs);
  res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  console.log(fails.length ? 'FEHLER: ' + fails.length : 'alles ok');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify(res, null, 1)); process.exit(1); });
