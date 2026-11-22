// Eigene Schriften: in der Textleiste „Schrift hinzufügen …“ (Dateiauswahl), Schrift gilt sofort im Text, bleibt nach dem
// Neuladen (eigene Datenbank „notizen-fonts“, die Hauptdatenbank bleibt Version 4), schon vorhandene Texte mit dem Schlüssel
// werden nach dem Hinzufügen neu gesetzt und gemalt (nicht in der Ersatzschrift hängen geblieben), „entfernen“ lässt Texte in
// der Standardschrift zurück, eine ungültige Datei wird abgelehnt.
// Die Schriftdatei liegt nicht im Repository (Lizenz: keine Weitergabe): sie wird als Argument oder mit NOTES_FONT übergeben,
// sonst nimmt der Test eine Windows-Schrift.
// node tests/fonts.js [Notizen.html] [Schriftdatei.otf|ttf]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
const FONT = [process.argv[3], process.env.NOTES_FONT, 'C:\\Windows\\Fonts\\segoepr.ttf', 'C:\\Windows\\Fonts\\comic.ttf', 'C:\\Windows\\Fonts\\georgia.ttf'].find(f => f && fs.existsSync(f));
const res = {}, fails = [];
const check = (name, ok, info) => { res[name] = info === undefined ? !!ok : info; if (!ok) fails.push(name + (info === undefined ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  if (!FONT) { console.error('FAIL: keine Schriftdatei (Argument 2 oder NOTES_FONT)'); process.exit(1); }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(async () => { localStorage.clear(); for (const d of ['notizen-fonts']) await new Promise(r => { const q = indexedDB.deleteDatabase(d); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.reload(); await p.waitForTimeout(500);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk'); await p.waitForTimeout(400);
  const wait = ms => p.waitForTimeout(ms);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: 0.5, ...extra });
  const penTap = async (x, y) => { await send('mouseMoved', x, y, { buttons: 0 }); await send('mousePressed', x, y); await send('mouseReleased', x, y); await wait(250); };
  const key = await p.evaluate(f => fontKey(f), path.basename(FONT));
  res.font = { datei: path.basename(FONT), key };

  // Vor dem Hinzufügen: ein Text mit dem Schlüssel (wie aus einer Sicherung von einem anderen Gerät) steht in der Standardschrift
  await p.evaluate(k => {
    const it = { t: 'x', id: uid(), x: 300, y: 500, w: 520, h: 0, ff: k, fs: 36, c: 'ink', runs: [{ s: 'Hello Typewriter 123' }] };
    it.h = textLayout(it).h; commit(appendItems(S.items, [it]));
  }, key);
  await wait(400);
  const info = () => p.evaluate(k => { const it = S.items.find(x => x.t === 'x' && x.ff === k); return it && { w: +textLayout(it).lines[0].tw.toFixed(1), sans: +textLayout({ ...it, ff: 'sans' }).lines[0].tw.toFixed(1), h: it.h, sx: toScreen(it.x, it.y) }; }, key);
  const shot = async it => crypto.createHash('md5').update(await p.screenshot({ clip: { x: Math.max(0, it.sx[0] - 4), y: Math.max(0, it.sx[1] - 4), width: 560, height: 70 } })).digest('hex');
  const before = await info(), hashBefore = await shot(before);
  check('Ohne die Schrift: Standardschrift (Breite wie sans)', before && before.w === before.sans, before);

  // Textleiste: Auswahl hat „hinzufügen“, aber noch kein „entfernen“; über die Dateiauswahl hinzufügen
  await p.click('#bar [data-tool=text]'); await wait(300); await penTap(300, 250);
  const opts0 = await p.evaluate(() => [...$('#txFont').options].map(o => o.value));
  check('Auswahl: „Schrift hinzufügen“ am Ende, kein „entfernen“ ohne eigene Schrift', opts0.at(-1) === '__add' && !opts0.includes('__del') && opts0.includes('sans'), opts0);
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.selectOption('#txFont', '__add')]);
  check('Dateiauswahl erlaubt mehrere Dateien (.otf, .ttf, .woff)', chooser.isMultiple() === true);
  await chooser.setFiles(FONT); await wait(900);
  const st = await p.evaluate(k => ({ table: !!TEXT_FONTS[k], name: TEXT_FONTS[k] && TEXT_FONTS[k][0], ff: txEd && txEd.ff, sel: $('#txFont').value, saved: S.text.ff,
    loaded: fontFaces.has(k) && fontFaces.get(k).status, opts: [...$('#txFont').options].map(o => o.value), toast: ($('#toast') || {}).textContent }), key);
  check('Schrift ist registriert, im Text gewählt und in der Auswahl; „entfernen“ erscheint', st.table && st.ff === key && st.sel === key && st.saved === key && st.loaded === 'loaded' && st.opts.includes('__del') && st.opts.at(-2) === '__add', st);
  // Tippen: der Text im Editor und danach auf der Seite in der Schrift
  await p.keyboard.type('Hello Typewriter 123'); await wait(150);
  const edFont = await p.evaluate(() => getComputedStyle($('#txEd')).fontFamily);
  check('Textfeld zeigt die Schrift', /nf-/.test(edFont), edFont);
  await p.click('#txOk'); await wait(500);
  const typed = await p.evaluate(k => S.items.filter(x => x.t === 'x').map(x => ({ ff: x.ff, w: +textLayout(x).lines[0].tw.toFixed(1), sans: +textLayout({ ...x, ff: 'sans' }).lines[0].tw.toFixed(1) })), key);
  check('Neuer Text in der Schrift gesetzt (Breite anders als sans)', typed.some(t => t.ff === key && Math.abs(t.w - t.sans) > 2), typed);

  // Der schon vorhandene Text (vor dem Hinzufügen angelegt) wurde neu gesetzt und neu gemalt
  const after = await info(), hashAfter = await shot(after);
  check('Vorhandener Text mit dem Schlüssel: Satz neu (Breite anders als vorher)', Math.abs(after.w - before.w) > 2, { vorher: before.w, nachher: after.w });
  check('Vorhandener Text: Höhe neu berechnet', after.h > 0 && Math.abs(after.h - before.h) <= before.h, { vorher: before.h, nachher: after.h });
  check('Vorhandener Text: Kacheln neu gemalt (Bild anders als in der Ersatzschrift)', hashAfter !== hashBefore, { hashBefore, hashAfter });
  check('Hauptdatenbank bleibt Version 4, Schriften in „notizen-fonts“', await p.evaluate(async () => { const l = await indexedDB.databases(); const v = n => (l.find(d => d.name === n) || {}).version; return v('notizen-app') === 4 && v('notizen-fonts') === 1; }));

  // Neuladen: Schrift und gemerkte Wahl kommen aus dem Speicher, die Notiz zeigt den Text in der Schrift
  await p.evaluate(() => saveNow && saveNow()); await wait(500);
  await p.reload(); await wait(900);
  const re = await p.evaluate(k => ({ table: !!TEXT_FONTS[k], pref: S.text.ff, face: fontFaces.has(k), n: [...$('#txFont').options].length }), key);
  check('Nach dem Neuladen: Schrift und gemerkte Wahl wieder da', re.table && re.face && re.pref === key, re);
  await p.evaluate(async () => { const m = (await dbIndexAll())[0]; await openNote(m); }); await wait(700);
  const reNote = await info();
  check('Notiz nach dem Neuladen: Text in der Schrift gesetzt', reNote && Math.abs(reNote.w - reNote.sans) > 2 && Math.abs(reNote.w - after.w) < 0.5, { reNote, nachHinzufuegen: after.w });

  // Entfernen: Dialog, danach Standardschrift (der Schlüssel bleibt am Text), Speicher leer
  await p.click('#bar [data-tool=text]'); await wait(300);
  const pos = await p.evaluate(k => { const it = S.items.find(q => q.t === 'x' && q.ff === k); return toScreen(it.x + 20, it.y + it.h / 2); }, key);
  await penTap(pos[0], pos[1]);
  const ed = await p.evaluate(() => ({ open: !!txEd, ff: txEd && txEd.ff, del: [...$('#txFont').options].some(o => o.value === '__del') }));
  check('Vorhandenen Text bearbeiten: Schrift gewählt, „entfernen“ da', ed.open && ed.ff === key && ed.del, ed);
  await p.selectOption('#txFont', '__del'); await wait(300);
  await p.click('#dlgOk'); await wait(800);
  const gone = await p.evaluate(async k => ({ table: !!TEXT_FONTS[k], face: fontFaces.has(k), db: (await fontsAll()).length, sel: $('#txFont').value, pref: S.text.ff, texts: S.items.filter(x => x.t === 'x').map(x => ({ ff: x.ff, w: +textLayout(x).lines[0].tw.toFixed(1), sans: +textLayout({ ...x, ff: 'sans' }).lines[0].tw.toFixed(1) })) }), key);
  check('Entfernt: nicht mehr in der Tabelle, nicht im Speicher, Wahl wieder Standard', !gone.table && !gone.face && gone.db === 0 && gone.pref === 'sans' && gone.sel === 'sans', gone);
  if (await p.evaluate(() => !!txEd)) await p.click('#txOk');   // der Klick im Dialog schließt das Textfeld sonst von selbst (wie überall außerhalb der Leiste)
  await wait(300);
  const left =await p.evaluate(k => S.items.filter(x => x.t === 'x').map(x => ({ ff: x.ff, w: +textLayout(x).lines[0].tw.toFixed(1), sans: +textLayout({ ...x, ff: 'sans' }).lines[0].tw.toFixed(1) })), key);
  check('Texte nach dem Entfernen in der Standardschrift, der Schlüssel bleibt am Text', left.some(x => x.ff === key && x.w === x.sans), left);

  // Ungültige Datei
  await p.evaluate(() => { window.__t = []; });
  await p.setInputFiles('#fFont', { name: 'kaputt.ttf', mimeType: 'font/ttf', buffer: Buffer.from('das ist keine schrift') }); await wait(700);
  const bad = await p.evaluate(() => ({ table: !!TEXT_FONTS['u:kaputt'], toast: [...document.querySelectorAll('.toast, #toast')].map(e => e.textContent).join('|') }));
  check('Ungültige Datei: keine Schrift angelegt, Hinweis', !bad.table && /keine gültige Schrift/.test(bad.toast), bad);
  check('Keine Fehler', !errs.length, errs);
  res.fails = fails; res.errors = errs;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
