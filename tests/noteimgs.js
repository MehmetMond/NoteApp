// Mehrere Bilder in einer Notiz (Erklärung): Datei (mehrere auf einmal), Strg + V und Hineinziehen hängen hinten an; eine
// Reihe zum Wischen (Vorschau aus der kleinen Fassung, Mausrad blättert seitlich), Antippen groß (volle Fassung, das
// angetippte in der Mitte) und wieder klein, ✕ je Bild. Ältere Erklärungen mit einem Bild (nt.img) gehen weiter (Öffnen
// und Schließen ist kein Schritt), fehlende Bilder stören nicht. Aufräumen beim Schließen der Seite und Sicherung (Kopie)
// mit allen Bildern. node tests/noteimgs.js [Notizen.html]    Bilder: NOTES_SHOTS=<Ordner> (sonst der Temp-Ordner)
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
  // Bilder: quer, hochkant, breit, groß (kleine Fassung schmaler), quadratisch
  const pics = await p.evaluate(() => {
    const mk = (w, h, col, label) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = col; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(Math.min(w, h) * 0.5) + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, w / 2, h / 2); return c.toDataURL('image/png');
    };
    const ds = [mk(960, 660, '#2f6fd6', '1'), mk(600, 900, '#d5543a', '2'), mk(1800, 600, '#3a9d5d', '3'), mk(1600, 1200, '#8e5bd6', '4'), mk(780, 780, '#d6a12f', '5')];
    window.__files = ds.map((d, i) => { const bin = atob(d.split(',')[1]), a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); return new File([a], 'b' + (i + 1) + '.png', { type: 'image/png' }); });
    return ds;
  });
  const buf = d => Buffer.from(d.split(',')[1], 'base64');
  const R = [960 / 660, 600 / 900, 3, 4 / 3, 1];   // Seitenverhältnisse der Bilder
  // groß: jedes ganz, höchstens th hoch und tw breit (die Bilder sind größer, nichts wird vergrößert)
  const bigH = (r, th, tw) => Math.round(Math.min(th, tw / r));
  // Schrift auf die Seite und eine Erklärung dazu (Karte offen, noch ohne Markierung)
  const write = (str, sy) => p.evaluate(([str, sy]) => {
    const [x, y] = toWorld(300, sy), out = []; placeText(out, str, x, y, 40, 0, 0);
    const list = out.map(l => { const q = []; for (let i = 0; i < l.length; i += 2) q.push(l[i], l[i + 1], 0.5); return makeStroke(q, 'ink', 2.2, false); });
    commit(appendItems(S.items, list)); return list.map(s => s.id);
  }, [str, sy]);
  const strip = () => p.evaluate(() => {
    const box = $('#ncImgBox'), br = box.getBoundingClientRect(), m = $('#noteCard');
    return { hidden: box.classList.contains('hidden'), many: box.classList.contains('many'), big: m.classList.contains('big'), glance: m.classList.contains('glance'), sl: Math.round(box.scrollLeft), sw: box.scrollWidth, cw: box.clientWidth,
      box: [br.left, br.top, br.right, br.bottom].map(Math.round), cardW: Math.round(m.getBoundingClientRect().width), inkW: $('#ncInk').width, imgs: ncCur ? ncCur.nt.imgs.slice() : null,
      ims: [...box.querySelectorAll('.ncim')].map(el => {
        const r = el.getBoundingClientRect(), im = el.querySelector('img'), q = ncCur && ncCur.pics.get(el.dataset.id);
        return { id: el.dataset.id, wait: el.classList.contains('wait'), x: Math.round(r.left), w: Math.round(r.width), h: Math.round(im.getBoundingClientRect().height), nw: im.naturalWidth,
          alt: im.alt, del: el.querySelector('.ncimdel').getAttribute('aria-label'), low: !!(q && q.rec && q.blob === q.rec.low), full: !!(q && q.rec && q.blob === q.rec.blob) };
      }) };
  });
  // Bilder geladen und die Karte fertig aufgegangen (popIn federt: mitten drin stimmen die Maße auf dem Bildschirm nicht)
  const settled = () => p.waitForFunction(() => !$('#noteCard').getAnimations().length, null, { timeout: 4000 });
  const loaded = async n => {
    await p.waitForFunction(n => ncCur && ncCur.nt.imgs.length === n && [...$$('#ncImgBox .ncim:not(.wait) img')].every(i => i.complete && i.naturalWidth > 0), n, { timeout: 8000 });
    await settled();
  };
  const pageImgs = () => p.evaluate(() => S.items.filter(i => i.t === 'i').length);
  const ids = await write('Bilder', 200);
  await p.evaluate(ids => { const s = new Set(ids); openNoteCard(null, s, geoBox(S.items.filter(i => s.has(i.id)))); $('#ncText').value = 'Drei Bilder'; }, ids); await wait(300);

  // ---------- Datei mit drei Bildern auf einmal: Reihe mit Vorschau (kleine Fassung), die letzte zu sehen ----------
  check('Bild-Knopf: Datei mit mehreren Bildern erlaubt', await p.evaluate(() => $('#fNoteImg').multiple));
  await p.setInputFiles('#fNoteImg', [0, 1, 2].map(i => ({ name: 'b' + (i + 1) + '.png', mimeType: 'image/png', buffer: buf(pics[i]) })));
  await loaded(3); await wait(100);
  let s = await strip();
  const toast3 = await p.evaluate(() => $('#toast').textContent);
  const last = s.ims[2];
  check('Drei Bilder: Reihe, je 108 px hoch, Breite nach Seitenverhältnis (höchstens 220 px), Vorschau aus der kleinen Fassung',
    !s.hidden && s.many && s.ims.length === 3 && s.ims.every(q => q.h === 108 && q.low && !q.wait) && near(s.ims[0].w, 157, 1) && near(s.ims[1].w, 72, 1) && s.ims[2].w === 220, s);
  check('Reihe zum Wischen; die zuletzt eingefügte ganz zu sehen; Meldung', s.sw > s.cw + 100 && s.sl > 0 && last.x >= s.box[0] - 1 && last.x + last.w <= s.box[2] + 1 && toast3 === '3 Bilder eingefügt', { sw: s.sw, cw: s.cw, sl: s.sl, last, box: s.box, toast3 });
  check('Beschriftung je Bild (Bild 1 der Notiz, Bild 1 entfernen)', s.ims.every((q, i) => q.alt === 'Bild ' + (i + 1) + ' der Notiz' && q.del === 'Bild ' + (i + 1) + ' entfernen'), s.ims.map(q => [q.alt, q.del]));
  check('Nichts auf der Seite eingefügt', (await pageImgs()) === 0);
  await p.screenshot({ path: path.join(SHOTS, 'noteimgs_card.png'), clip: { x: s.box[0] - 30, y: s.box[1] - 40, width: 380, height: 420 } });
  // Mausrad über der Reihe: seitlich
  await p.evaluate(() => { $('#ncImgBox').scrollLeft = 0; });
  await p.mouse.move((s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2); await p.mouse.wheel(0, 100); await wait(200);
  check('Mausrad über der Reihe: blättert seitlich', (await strip()).sl === 100, (await strip()).sl);
  // Finger wischt nach links: die Reihe läuft mit (der Editor selbst hat touch-action: none)
  await p.evaluate(() => { $('#ncImgBox').scrollLeft = 0; });
  { const cdp = await ctx.newCDPSession(p), x = Math.round((s.box[0] + s.box[2]) / 2), y = Math.round((s.box[1] + s.box[3]) / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - k * 12, y }] }); await wait(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(300);
    const w = await strip();
    check('Finger wischt über die Reihe: seitlich (kein Antippen, Karte bleibt klein)', w.sl > 60 && !w.big && w.imgs.length === 3, { sl: w.sl, big: w.big }); }

  // ---------- Antippen: groß (volle Fassung, das angetippte in der Mitte), nochmal: klein ----------
  const [id1, id2, id3] = s.imgs;
  await p.click('#ncImgBox .ncim:nth-child(2) img'); await wait(250);
  s = await strip();
  { const q = s.ims[1], mid = (s.box[0] + s.box[2]) / 2;
    const want = [0, 1, 2].map(i => bigH(R[i], 400, 736));
    check('Antippen: groß (Karte breit, jedes Bild ganz: bis 400 px hoch und 736 px breit, volle Fassung), das angetippte in der Mitte',
      s.big && s.cardW === 760 && s.inkW > 600 && s.ims.every((r, i) => near(r.h, want[i], 1) && near(r.w, r.h * R[i], 1.5) && r.full) && near(q.x + q.w / 2, mid, 2), { big: s.big, cardW: s.cardW, ims: s.ims, want, mid }); }
  await p.screenshot({ path: path.join(SHOTS, 'noteimgs_big.png'), clip: { x: s.box[0] - 30, y: s.box[1] - 40, width: Math.min(1280 - s.box[0] + 30, s.box[2] - s.box[0] + 60), height: 560 } });
  await p.click('#ncImgBox .ncim:nth-child(2) img'); await wait(250);
  s = await strip();
  check('Nochmal antippen: wieder klein (kleine Fassung)', !s.big && near(s.cardW, 320, 1) && s.ims.every(r => r.h === 108 && r.low), { big: s.big, cardW: s.cardW, ims: s.ims });

  // ---------- ✕ am mittleren Bild ----------
  await p.click('#ncImgBox .ncim:nth-child(2) .ncimdel'); await wait(150);
  s = await strip();
  check('✕: nur dieses Bild weg, Reihenfolge bleibt', JSON.stringify(s.imgs) === JSON.stringify([id1, id3]) && s.ims.length === 2 && s.many && s.ims[1].alt === 'Bild 2 der Notiz', s.imgs);
  // Schließen: Erklärung mit beiden Bildern (neues Format)
  await p.keyboard.press('Escape'); await wait(300);
  const mark = await p.evaluate(() => { const m = S.items.find(i => i.nt); return m && { id: m.id, nt: { ...m.nt, ink: m.nt.ink.length } }; });
  check('Karte zu: Erklärung mit beiden Bildern (nt.imgs)', mark && JSON.stringify(mark.nt.imgs) === JSON.stringify([id1, id3]) && !('img' in mark.nt) && mark.nt.text === 'Drei Bilder', mark);
  // wieder öffnen: Bilder aus der Datenbank, in der Reihenfolge; ohne Änderung kein Schritt
  const u0 = await p.evaluate(() => S.undo.length);
  await p.evaluate(id => openNoteCard(id, null, noteBox(noteOf(id))), mark.id); await loaded(2); await wait(100);
  s = await strip();
  check('Wieder geöffnet: beide Bilder in ihrer Reihenfolge', JSON.stringify(s.ims.map(q => q.id)) === JSON.stringify([id1, id3]) && s.many && s.ims.every(q => !q.wait && q.low && q.h === 108), s.ims);
  await p.keyboard.press('Escape'); await wait(300);
  check('Öffnen und schließen ohne Änderung: kein Schritt', (await p.evaluate(() => S.undo.length)) === u0);

  // ---------- Strg + V mit zwei Bildern und Hineinziehen: hinten an, nicht auf die Seite ----------
  await p.evaluate(id => openNoteCard(id, null, noteBox(noteOf(id))), mark.id); await loaded(2);
  await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(__files[3]); dt.items.add(__files[4]); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await loaded(4);
  await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(__files[0]); const r = $('#ncText').getBoundingClientRect(); $('#ncText').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); });
  await loaded(5); await wait(100);
  s = await strip();
  check('Strg + V (zwei Bilder) und Hineinziehen: hinten an, nichts auf der Seite', s.imgs.length === 5 && s.imgs[0] === id1 && s.imgs[1] === id3 && new Set(s.imgs).size === 5 && (await pageImgs()) === 0, s.imgs);
  check('Großes Bild: Vorschau aus der kleinen Fassung (640 px breit)', s.ims[2].nw === 640 && s.ims[2].low, s.ims[2]);
  const five = s.imgs;
  // großes Fenster (Pfeil): Reihe links neben dem Text, Vorschau 96 px hoch; Antippen: groß
  await p.click('#ncGrow'); await wait(800);
  s = await strip();
  const lay = await p.evaluate(() => { const r = q => $(q).getBoundingClientRect(); return { text: r('#ncText').left, ink: r('.ncink').top }; });
  check('Großes Fenster: Reihe links neben dem Text (höchstens 34 % breit), Vorschau 96 px hoch', s.glance && s.many && s.ims.every(q => q.h === 96) && s.box[2] < lay.text && s.box[2] - s.box[0] <= Math.round(1280 * 0.34) + 1 && s.box[3] <= lay.ink, { box: s.box, lay, h: s.ims.map(q => q.h) });
  await p.screenshot({ path: path.join(SHOTS, 'noteimgs_glance.png') });
  await p.click('#ncImgBox .ncim:nth-child(3) img'); await wait(300);
  s = await strip();
  { const rs = [R[0], R[2], R[3], R[4], R[0]], want = rs.map(r => bigH(r, 860 * 0.42, 1280 * 0.42));
    check('Großes Fenster, Bild angetippt: jedes ganz (bis 42 % hoch und breit), volle Fassung', s.glance && s.big && s.ims.every((q, i) => near(q.h, want[i], 1) && q.full) && s.ims[2].nw === 1600, { h: s.ims.map(q => q.h), want, nw: s.ims[2].nw }); }
  await p.screenshot({ path: path.join(SHOTS, 'noteimgs_glance_big.png') });
  await p.click('#ncImgBox .ncim:nth-child(3) img'); await wait(300);
  await p.click('#ncGrow'); await wait(800);
  await p.keyboard.press('Escape'); await wait(300);
  check('Karte zu: Erklärung mit allen fünf Bildern', JSON.stringify(await p.evaluate(id => noteOf(id).nt.imgs, mark.id)) === JSON.stringify(five));
  // alle Bilder einzeln entfernen: ohne Bild wieder klein; Rückgängig holt sie zurück
  await p.evaluate(id => openNoteCard(id, null, noteBox(noteOf(id))), mark.id); await loaded(5);
  await p.click('#ncImgBox .ncim:nth-child(1) img'); await wait(200);
  for (let k = 0; k < 5; k++) { await p.click('#ncImgBox .ncim:first-child .ncimdel'); await wait(80); }
  s = await strip();
  check('Alle ✕: keine Bilder, Reihe weg, Karte wieder klein', s.hidden && !s.big && s.imgs.length === 0 && near(s.cardW, 320, 1), { hidden: s.hidden, big: s.big, cardW: s.cardW });
  await p.keyboard.press('Escape'); await wait(300);
  const none = await p.evaluate(id => noteOf(id).nt.imgs, mark.id);
  await p.evaluate(() => undo()); await wait(200);
  check('Ohne Bilder gespeichert; Rückgängig: alle fünf wieder da', none.length === 0 && JSON.stringify(await p.evaluate(id => noteOf(id).nt.imgs, mark.id)) === JSON.stringify(five), none);

  // ---------- ältere Erklärung (ein Bild in nt.img) und eine mit fehlendem Bild ----------
  const imgOld = await p.evaluate(async () => { const { blob, low, w, h } = await prepareImage(__files[1]), id = uid(); await dbImagePut({ id, n: S.note.id, blob, low, w, h }); return id; });
  const imgOld2 = await p.evaluate(async () => { const { blob, low, w, h } = await prepareImage(__files[2]), id = uid(); await dbImagePut({ id, n: S.note.id, blob, low, w, h }); return id; });
  const mkNote = async (str, sy, nt) => { const ids = await write(str, sy); return p.evaluate(([ids, nt]) => { const set = new Set(ids), m = noteMark(set, nt); commit(appendItems(S.items.map(x => set.has(x.id) ? { ...x, on: m.id } : x), [m])); return m.id; }, [ids, nt]); };
  const oldId = await mkNote('Alt', 420, { text: 'alt', img: imgOld, ink: [] });
  const old2Id = await mkNote('Alt2', 520, { text: 'alt2', img: imgOld2, ink: [] });
  const gapId = await mkNote('Fehlt', 620, { text: 'fehlt', imgs: ['gibtsnicht', imgOld2], ink: [] });
  const u1 = await p.evaluate(() => S.undo.length);
  await p.evaluate(id => openNoteCard(id, null, noteBox(noteOf(id))), oldId); await loaded(1); await wait(100);
  s = await strip();
  check('Ältere Erklärung (nt.img): ihr Bild in der Karte, allein (nicht als Reihe)', JSON.stringify(s.imgs) === JSON.stringify([imgOld]) && !s.hidden && !s.many && s.ims.length === 1 && s.ims[0].h === 180 && s.ims[0].w === 120, s.ims);
  await p.screenshot({ path: path.join(SHOTS, 'noteimgs_one.png'), clip: { x: s.box[0] - 30, y: s.box[1] - 40, width: 380, height: 420 } });
  await p.keyboard.press('Escape'); await wait(300);
  const oldNt = await p.evaluate(id => noteOf(id).nt, oldId);
  check('Ältere Erklärung öffnen und schließen: kein Schritt, bleibt wie sie ist', (await p.evaluate(() => S.undo.length)) === u1 && oldNt.img === imgOld && !('imgs' in oldNt), { undo: await p.evaluate(() => S.undo.length), u1, oldNt });
  await p.evaluate(id => openNoteCard(id, null, noteBox(noteOf(id))), oldId); await loaded(1);
  await p.evaluate(() => { const dt = new DataTransfer(); dt.items.add(__files[4]); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await loaded(2); const imgNew = await p.evaluate(() => ncCur.nt.imgs[1]);
  await p.keyboard.press('Escape'); await wait(300);
  const oldNt2 = await p.evaluate(id => noteOf(id).nt, oldId);
  check('Ältere Erklärung mit zweitem Bild: jetzt nt.imgs (beide)', JSON.stringify(oldNt2.imgs) === JSON.stringify([imgOld, imgNew]) && !('img' in oldNt2), oldNt2);
  await p.evaluate(id => openNoteCard(id, null, noteBox(noteOf(id))), gapId); await wait(400); await settled();
  s = await strip();
  { const v = s.ims.find(q => !q.wait);
    check('Fehlendes Bild: nur das vorhandene zu sehen (allein, in der Mitte), kein Fehler', !s.hidden && !s.many && s.ims.filter(q => !q.wait).length === 1 && v.id === imgOld2 && s.imgs.length === 2 && near(v.x + v.w / 2, (s.box[0] + s.box[2]) / 2, 1), { ims: s.ims, box: s.box }); }
  await p.keyboard.press('Escape'); await wait(300);

  // ---------- Seite zu: entfernte Bilder gelöscht, alle anderen bleiben ----------
  const noteId = await p.evaluate(() => S.note.id);
  const before = await p.evaluate(() => S.items.filter(i => i.nt).map(m => ({ text: m.nt.text, ids: noteImgs(m.nt), old: 'img' in m.nt })));
  await p.click('#bBack'); await wait(800);
  const kept = await p.evaluate(async ids => { const out = {}; for (const id of ids) out[id] = !!(await dbImageGet(id)); return out; }, [id1, id2, id3, ...five, imgOld, imgOld2, imgNew]);
  check('Seite zu: das entfernte Bild gelöscht, alle anderen bleiben', !kept[id2] && [id1, id3, ...five, imgOld, imgOld2, imgNew].every(id => kept[id]), kept);

  // ---------- Sicherung, als Kopie zurück: jede Erklärung mit eigenen Bildern (neue ids), auch die ältere ----------
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hBackup')]);
  const bk = path.join(os.tmpdir(), 'noteimgs-backup.notizen'); await dl.saveAs(bk);
  await p.evaluate(async id => openNote(await dbIndexGet(id)), noteId); await wait(500);
  await write('neu', 760); await p.click('#bBack'); await wait(600);
  await p.setInputFiles('#fRestore', bk); await p.waitForFunction(() => !navBusy, null, { timeout: 20000 }); await wait(500);
  const rest = await p.evaluate(async () => {
    const copy = (await dbIndexAll()).find(x => / \(Sicherung\)$/.test(x.name)); if (!copy) return null;
    const out = [];
    for (const m of (await dbItems(copy.id)).filter(i => i.nt)) {
      const ids = noteImgs(m.nt), recs = await Promise.all(ids.map(id => dbImageGet(id)));
      out.push({ text: m.nt.text, ids, old: 'img' in m.nt, has: recs.map(r => !!r && r.n === copy.id) });
    }
    return out;
  });
  fs.unlinkSync(bk);
  const orig = new Set(before.flatMap(m => m.ids));
  const byText = t => rest && rest.find(m => m.text === t);
  check('Sicherung als Kopie: jede Erklärung mit allen Bildern, neue ids, Bilder zur Kopie',
    rest && rest.length === before.length && before.every(m => { const r = byText(m.text); return r && r.ids.length === m.ids.length && r.ids.every(id => !orig.has(id)) && r.old === m.old; })
      && ['Drei Bilder', 'alt', 'alt2'].every(t => byText(t).has.every(Boolean)) && JSON.stringify(byText('fehlt').has) === JSON.stringify([false, true]), { rest, before });

  // ---------- dunkel: Reihe ansehen ----------
  await p.evaluate(async id => { toggleDark(); await openNote(await dbIndexGet(id)); }, noteId); await wait(600);
  await p.evaluate(() => { const m = S.items.find(i => i.nt && i.nt.text === 'Drei Bilder'); openNoteCard(m.id, null, noteBox(m)); }); await loaded(5); await wait(200);
  s = await strip();
  await p.screenshot({ path: path.join(SHOTS, 'noteimgs_card_dark.png'), clip: { x: s.box[0] - 30, y: s.box[1] - 60, width: 380, height: 440 } });
  check('Dunkel: Reihe gleich (fünf Bilder, 108 px hoch)', (await p.evaluate(() => S.dark)) && s.many && s.ims.length === 5 && s.ims.every(q => q.h === 108), s.ims.map(q => q.h));
  await p.keyboard.press('Escape'); await wait(300);

  check('Keine Fehler', errs.length === 0, errs);
  console.log(JSON.stringify({ ...res, fails }, null, 1));
  console.log(fails.length ? 'FEHLER: ' + fails.length : 'alles ok');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); console.log(JSON.stringify({ ...res, fails }, null, 1)); process.exit(1); });
