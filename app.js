"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
// Aussehen Windows XP: vorerst ausgeschaltet (das Aussehen wird am Ende neu gemacht); der Code bleibt. Wieder an: true,
// dazu im <head> von app.src.html die Zeile, die die Klasse xp setzt
const XP_ON = false;

/* ---------- Zustand ---------- */
const PALETTE = ['ink', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
// Strichstärken in Weltkoordinaten: ein Strich ist bei jedem Zoom gleich dick wie die anderen.
// Die Voreinstellungen lassen sich per Schieberegler ändern (aktive Dicke nochmal antippen).
const SIZES = { pen: [1, 2, 3.5, 6, 10], hl: [8, 14, 22, 32], tape: [14, 22, 32, 48] };
const SIZE_DEFAULT = { pen: 2, hl: 1, tape: 1 };
const SIZE_RANGE = { pen: [0.5, 30], hl: [4, 80], tape: [6, 120] };
// Tape (wie Washi-Tape): eigene Farben und Muster
const TAPE_PALETTE = ['#f4a7b9', '#f6c86e', '#9fd6aa', '#8ec5ef', '#c4a9ea', '#b8bec7'];
const TAPE_PATTERNS = [['uni', 'Uni'], ['streifen', 'Streifen'], ['punkte', 'Punkte'], ['karo', 'Karo'], ['kitty', 'Kätzchen'], ['hund', 'Hündchen'], ['kuro', 'Teufelchen']];
// Glättung der Handschrift (0 = roh … 1 = stark), fünf Voreinstellungen wie bei der Strichstärke; 0,5 entspricht der
// früheren festen Glättung und ist gewählt
const SMOOTH_PRESETS = [0, 0.25, 0.5, 0.75, 1], SMOOTH_IDX = 2;
const HL_ALPHA = { light: 0.42, dark: 0.45 };
// Deckkraft neuer Striche (Regler im Menü von Stift und Textmarker): Stift 1 = deckend, Textmarker wie bisher 0,42 (im
// Hellmodus; im Darkmode im selben Verhältnis kräftiger). Am Strich steht sie als al, nur wenn sie von der Vorgabe abweicht.
const ALPHA_DEFAULT = { pen: 1, hl: HL_ALPHA.light };
// Koordinatensysteme: Abstand der Teilstriche in Kästchen und Beschriftung der Achsen für neue Graphen
// (2D: lx, ly; 3D für sich: lx3, ly3, lz)
const GRAPH_STEPS = [0.5, 1, 2, 3, 4, 5];
const GRAPH_DEFAULT = { step: 1, lx: 'x', ly: 'y', lx3: 'x', ly3: 'y', lz: 'z' };
const LABEL_MAX = 16;
const S = {
  note: null,          // Eintrag aus dem Index (Name, Ansicht, Hintergrund, Vorschaubild)
  items: [],           // Striche und Bilder der offenen Notiz, in Zeichenreihenfolge
  saved: new Map(),    // id -> Objekt, so wie es zuletzt gespeichert wurde
  view: { tx: 0, ty: 0, z: 1 },
  level: 1,            // Zoomstufe, in der die Kacheln gerendert werden
  tool: 'pen', color: { pen: 'ink', hl: '#fdd835', tape: '#8ec5ef' }, size: {}, presets: {}, sizeIdx: {},
  tapePat: 'streifen',  // Muster neuer Tapes
  straight: { hl: false, tape: false },   // Textmarker / Tape immer gerade
  sel: null, undo: [], redo: [], fingerDraw: false, dark: false,
  busy: 0, thumbDirty: false,
  shape: 'rect',       // gewählte Form des Formen-Werkzeugs
  snap: false,         // Am Raster ausrichten
  smooth: SMOOTH_PRESETS[SMOOTH_IDX], smoothPresets: [], smoothIdx: SMOOTH_IDX,   // Glättung von Stift und Textmarker
  alpha: { ...ALPHA_DEFAULT },   // Deckkraft neuer Striche von Stift und Textmarker
  graph: { ...GRAPH_DEFAULT },   // Einstellungen neuer Koordinatensysteme
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('notizen.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('notizen.' + k, JSON.stringify(v)); } catch (e) {} },
};
S.dark = store.get('dark', matchMedia('(prefers-color-scheme: dark)').matches);
S.theme = XP_ON && store.get('theme', 'xp') !== 'modern' ? 'xp' : 'modern';   // Aussehen: Windows XP (Vorgabe, wenn XP_ON) oder modern
S.fingerDraw = store.get('fingerDraw', false);
S.snap = store.get('snap', false) === true;
{ const a = store.get('alpha', {}); for (const k of ['pen', 'hl']) if (typeof a[k] === 'number' && a[k] >= 0.1 && a[k] <= 1) S.alpha[k] = a[k]; }
{
  const g = store.get('graph', {});
  if (GRAPH_STEPS.includes(g.step)) S.graph.step = g.step;
  for (const k of ['lx', 'ly', 'lx3', 'ly3', 'lz']) if (typeof g[k] === 'string') S.graph[k] = g[k].slice(0, LABEL_MAX);
}
{
  const ps = store.get('smoothPresets'), i = store.get('smoothIdx');
  S.smoothPresets = Array.isArray(ps) && ps.length === SMOOTH_PRESETS.length && ps.every(v => typeof v === 'number' && v >= 0 && v <= 1) ? ps : [...SMOOTH_PRESETS];
  S.smoothIdx = Number.isInteger(i) && i >= 0 && i < S.smoothPresets.length ? i : SMOOTH_IDX;
  S.smooth = S.smoothPresets[S.smoothIdx];
}
Object.assign(S.color, store.get('color', {}));
if (TAPE_PATTERNS.some(([k]) => k === store.get('tapePat'))) S.tapePat = store.get('tapePat');
{ const st = store.get('straight', {}); for (const k of ['hl', 'tape']) S.straight[k] = st[k] === true; }
{
  const pre = store.get('presets', {}), idx = store.get('sizeIdx', {}), old = store.get('size', {});
  for (const k of Object.keys(SIZES)) {
    const [lo, hi] = SIZE_RANGE[k], p = pre[k];
    const ps = S.presets[k] = Array.isArray(p) && p.length === SIZES[k].length && p.every(v => typeof v === 'number' && v >= lo && v <= hi) ? p : [...SIZES[k]];
    let i = idx[k];
    if (!(Number.isInteger(i) && i >= 0 && i < ps.length)) {
      i = SIZE_DEFAULT[k];
      if (typeof old[k] === 'number') ps.forEach((v, j) => { if (Math.abs(v - old[k]) < Math.abs(ps[i] - old[k])) i = j; });   // Wert aus Version 1.2
    }
    S.sizeIdx[k] = i; S.size[k] = ps[i];
  }
}

// iPad/iPhone (iPadOS meldet sich als Mac mit Touch)
const IOS = /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Der PDF-Export zeichnet immer hell (Papier zum Drucken), auch im Darkmode
let lightOnly = false;
const isDark = () => S.dark && !lightOnly;
function colorOf(c) { return c === 'ink' ? (isDark() ? '#f1f1f1' : '#1b1b1d') : c; }
function paperColor() { return isDark() ? '#1c1d20' : '#fcfcfa'; }
function patternColor() { return isDark() ? '#43464c' : '#c9c9c4'; }
function hlAlpha() { return isDark() ? HL_ALPHA.dark : HL_ALPHA.light; }
function deskColor() { return isDark() ? '#111214' : '#dcddd8'; }

/* Seitenformat: ohne paper ist die Fläche unendlich. Sonst ist die Seite ein Dokument aus Blättern DIN A4/A3,
   hoch (p) oder quer (l), untereinander mit Abstand GAP; paper.n = Zahl der Blätter (mindestens 1).
   Weltkoordinaten sind CSS-Pixel bei 96 dpi; das erste Blatt liegt mit der linken oberen Ecke bei (0, 0). */
const PAPER = { a4: [210, 297], a3: [297, 420] };
const MM = 96 / 25.4, GAP = 40;
function paperSize(n = S.note) {
  const p = n && n.paper, mm = p && PAPER[p.f]; if (!mm) return null;
  return (p.o === 'l' ? [mm[1], mm[0]] : mm).map(v => v * MM);
}
const sheetCount = (n = S.note) => Math.max(1, (n && n.paper && n.paper.n) | 0);
function sheetRect(k, n = S.note) { const [w, h] = paperSize(n), y = k * (h + GAP); return [0, y, w, y + h]; }
// Blatt bei der Höhe y (zwischen zwei Blättern gilt die Mitte des Abstands)
function sheetAt(y, n = S.note) { const h = paperSize(n)[1]; return clamp(Math.floor((y + GAP / 2) / (h + GAP)), 0, sheetCount(n) - 1); }
const paperName = p => p && PAPER[p.f] ? (p.t === 'cornell' ? 'Cornell (DIN A4)' : 'DIN ' + p.f.toUpperCase() + (p.o === 'l' ? ' quer' : ' hoch')) : 'Unendlich';
const sheetsWord = k => k === 1 ? '1 Blatt' : k + ' Blätter';

/* ---------- Hinweis ---------- */
let toastT;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toastT); if (ms) toastT = setTimeout(() => t.style.opacity = 0, ms);
}

/* ---------- Speicher (IndexedDB) ----------
   index:  ein kleiner Eintrag pro Notiz (Name, Datum, Vorschaubild, Ansicht, Hintergrund)
   items:  jeder Strich und jedes Bild als eigener Datensatz, Schlüssel [Notiz, id]
   images: die Bilddaten (Blob) einmal pro Bild, dazu eine kleine Vorschau
   books:  die Bücher (Name, Farbe); jede Notiz (Seite) gehört über meta.book zu einem Buch
   shapes: eigene Formen (gespeicherte Striche), für alle Bücher und Seiten gleich */
let db = null;
function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('Speicherfehler'));
    tx.onabort = () => rej(tx.error || new Error('Speichern abgebrochen (Speicher voll?)'));
  });
}
function dataURLToBlob(s) {
  const i = s.indexOf(','), head = s.slice(0, i), body = s.slice(i + 1);
  const mime = (head.match(/data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  if (!/;base64/.test(head)) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body), u = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
  return new Blob([u], { type: mime });
}
// Notiz aus Version 1 (alles in einem Datensatz, Bilder als Data-URL) in die neue Form bringen
function legacyToRecords(n) {
  const id = n.id || uid();
  const meta = { id, name: n.name || 'Notiz', created: n.created || n.updated || Date.now(), updated: n.updated || Date.now(),
    thumb: n.thumb || null, bg: n.bg || 'dots', view: n.view || { tx: 0, ty: 0, z: 1 } };
  const items = [], images = [], bySrc = new Map();
  (n.items || []).forEach((it, k) => {
    if (it.t === 's' && it.pts) items.push({ ...it, pts: Float32Array.from(it.pts), o: k, n: id });
    else if (it.t === 'i' && it.src) {
      let img = bySrc.get(it.src);
      if (!img) { img = uid(); bySrc.set(it.src, img); images.push({ id: img, n: id, blob: dataURLToBlob(it.src), low: null, w: 0, h: 0 }); }
      const { src, ...rest } = it; items.push({ ...rest, img, o: k, n: id });
    }
  });
  return { meta, items, images };
}
// Version 4 = 3 + eigene Formen. Jeder Speicher wird nur angelegt, wenn er fehlt: so kommt jede ältere Datenbank
// (auch eine Version 3 ohne „shapes“) auf denselben Stand.
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('notizen-app', 4);
    r.onupgradeneeded = () => {
      const d = r.result, t = r.transaction;
      if (!d.objectStoreNames.contains('index')) d.createObjectStore('index', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: ['n', 'id'] }).createIndex('n', 'n');
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' }).createIndex('n', 'n');
      if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('shapes')) d.createObjectStore('shapes', { keyPath: 'id' });
      if (d.objectStoreNames.contains('notes')) {
        const idx = t.objectStore('index'), its = t.objectStore('items'), ims = t.objectStore('images');
        t.objectStore('notes').openCursor().onsuccess = ev => {
          const c = ev.target.result;
          if (!c) { d.deleteObjectStore('notes'); return; }
          const { meta, items, images } = legacyToRecords(c.value);
          idx.put(meta); items.forEach(i => its.put(i)); images.forEach(i => ims.put(i));
          c.continue();
        };
      }
    };
    r.onsuccess = () => { db = r.result; db.onversionchange = () => db.close(); res(); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => toast('Bitte andere Fenster mit den Notizen schließen', 6000);
  });
}
const dbIndexAll = () => reqP(db.transaction('index').objectStore('index').getAll());
const dbIndexGet = id => reqP(db.transaction('index').objectStore('index').get(id));
async function dbIndexPut(meta) { const tx = db.transaction('index', 'readwrite'); tx.objectStore('index').put(meta); return txDone(tx); }
const dbItems = n => reqP(db.transaction('items').objectStore('items').index('n').getAll(n));
const dbImageGet = id => reqP(db.transaction('images').objectStore('images').get(id));
async function dbImagePut(rec) { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(rec); return txDone(tx); }
async function dbDeleteNote(id) { return dbDeleteNotes([id]); }
// Seiten (und auf Wunsch ihr Buch) in einer Transaktion löschen: ganz oder gar nicht
async function dbDeleteNotes(ids, bookId) {
  const tx = db.transaction(['index', 'items', 'images', 'books'], 'readwrite');
  for (const id of ids) {
    tx.objectStore('index').delete(id);
    tx.objectStore('items').delete(IDBKeyRange.bound([id], [id, []]));
    const st = tx.objectStore('images');
    st.index('n').openKeyCursor(IDBKeyRange.only(id)).onsuccess = ev => { const c = ev.target.result; if (c) { st.delete(c.primaryKey); c.continue(); } };
  }
  if (bookId) tx.objectStore('books').delete(bookId);
  return txDone(tx);
}
const dbBookGet = id => reqP(db.transaction('books').objectStore('books').get(id));
async function dbBookPut(b) { const tx = db.transaction('books', 'readwrite'); tx.objectStore('books').put(b); return txDone(tx); }
async function dbBookDelete(id) { const tx = db.transaction('books', 'readwrite'); tx.objectStore('books').delete(id); return txDone(tx); }
const dbShapesAll = () => reqP(db.transaction('shapes').objectStore('shapes').getAll());
const dbShapeGet = id => reqP(db.transaction('shapes').objectStore('shapes').get(id));
async function dbShapePut(r) { const tx = db.transaction('shapes', 'readwrite'); tx.objectStore('shapes').put(r); return txDone(tx); }
async function dbShapeDelete(id) { const tx = db.transaction('shapes', 'readwrite'); tx.objectStore('shapes').delete(id); return txDone(tx); }

/* Bücher: Farben der Einbände (Name, hell, dunkel) */
const BOOK_COLORS = {
  blue: ['Blau', '#5b8ce2', '#2b53a6'], red: ['Rot', '#dc5f55', '#a3302d'], green: ['Grün', '#4fa072', '#276445'],
  orange: ['Orange', '#ef9446', '#bf5d1d'], purple: ['Lila', '#9270d3', '#5b3c98'], teal: ['Petrol', '#3a98a0', '#1a5c66'],
  pink: ['Rosa', '#ea8aac', '#b9547e'], graphite: ['Graphit', '#6a7079', '#33373e'], mustard: ['Senf', '#e2b445', '#a87b12'],
};
const DEFAULT_BOOK = 'Meine Notizen';
const bookColor = c => BOOK_COLORS[c] || BOOK_COLORS.blue;
function coverVars(el, c) { const [, a, b] = bookColor(c); el.style.setProperty('--c1', a); el.style.setProperty('--c2', b); }
// Jede Notiz ohne (gültiges) Buch kommt ins Buch „Meine Notizen“, das bei Bedarf angelegt wird.
// Lesen und Schreiben in einer Transaktion: zwei gleichzeitige Aufrufe legen das Buch nicht doppelt an.
async function ensureBooks() {
  try { return await ensureBooksTx(); }
  catch (e) {
    // Schreiben geht nicht (z. B. Speicher voll): nur lesen und Seiten ohne Buch vorläufig im Standardbuch zeigen
    const books = await reqP(db.transaction('books').objectStore('books').getAll()), notes = await dbIndexAll();
    const ids = new Set(books.map(b => b.id)), orphans = notes.filter(n => !ids.has(n.book));
    if (orphans.length) {
      let def = books.filter(b => b.name === DEFAULT_BOOK).sort(byCreated)[0];
      if (!def) { def = { id: 'standard', name: DEFAULT_BOOK, color: 'blue', created: 0 }; books.push(def); }
      for (const n of orphans) n.book = def.id;
    }
    return { books, notes };
  }
}
function ensureBooksTx() {
  return new Promise((res, rej) => {
    const tx = db.transaction(['books', 'index'], 'readwrite'), bs = tx.objectStore('books'), is = tx.objectStore('index');
    const out = { books: null, notes: null };
    const step = () => {
      if (!out.books || !out.notes) return;
      const ids = new Set(out.books.map(b => b.id)), orphans = out.notes.filter(n => !ids.has(n.book));
      if (!orphans.length) return;
      let def = out.books.filter(b => b.name === DEFAULT_BOOK).sort(byCreated)[0];
      if (!def) { def = { id: uid(), name: DEFAULT_BOOK, color: 'blue', created: Date.now() }; bs.put(def); out.books.push(def); }
      for (const n of orphans) { n.book = def.id; is.put(n); }
    };
    bs.getAll().onsuccess = e => { out.books = e.target.result; step(); };
    is.getAll().onsuccess = e => { out.notes = e.target.result; step(); };
    txDone(tx).then(() => res(out), rej);
  });
}
// Seiten eines Buchs: in der Reihenfolge, in der sie angelegt wurden (wie in einem echten Heft)
const byCreated = (a, b) => (a.created || 0) - (b.created || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const pagesWord = n => n === 1 ? '1 Seite' : n + ' Seiten';
const booksWord = n => n === 1 ? '1 Buch' : n + ' Bücher';

/* Speichern: nur geänderte Striche/Bilder werden geschrieben */
let saveT = null, firstDirty = 0, saving = Promise.resolve();
function markDirty() {
  if (!S.note) return;
  S.note.updated = Date.now(); S.thumbDirty = true;
  const now = performance.now(); if (!firstDirty) firstDirty = now;
  clearTimeout(saveT);
  saveT = setTimeout(saveSoon, Math.max(0, Math.min(400, 2000 - (now - firstDirty))));
}
// solange der Stift unten ist (Strich, Radierer …), nicht speichern: kurz warten, höchstens 8 s nach der ersten Änderung.
// Schließen, Ausblenden und Seitenwechsel speichern weiter sofort (saveNow)
function saveSoon() { if (action && performance.now() - firstDirty < 8000) { saveT = setTimeout(saveSoon, 300); return; } saveNow(); }
function saveNow() {
  clearTimeout(saveT); saveT = null; firstDirty = 0;
  const note = S.note; if (!note) return saving;
  saving = saving.then(async () => {
    if (S.note !== note) return;
    const n = note.id, prev = S.saved, list = S.items, old = S.savedList;
    const tx = db.transaction(['items', 'index'], 'readwrite'), st = tx.objectStore('items');
    // meist kam nur etwas dazu (neue Striche hinten): dann nur das Neue schreiben, ohne alles zu vergleichen
    let i = 0; if (old) { const m = Math.min(old.length, list.length); while (i < m && old[i] === list[i]) i++; }
    const app = !!old && i === old.length; let cur = null;
    if (app) for (let k = i; k < list.length; k++) st.put({ ...list[k], n });
    else {
      cur = new Map(); for (const it of list) cur.set(it.id, it);
      for (const [id, it] of cur) if (prev.get(id) !== it) st.put({ ...it, n });
      for (const id of prev.keys()) if (!cur.has(id)) st.delete([n, id]);
    }
    tx.objectStore('index').put({ ...note, view: { ...S.view } });
    await txDone(tx);
    if (S.note === note) { if (app) for (let k = i; k < list.length; k++) prev.set(list[k].id, list[k]); else S.saved = cur; S.savedList = list; }
    S.saveError = null;
  }).catch(e => { S.saveError = e; toast('Speichern fehlgeschlagen: ' + e.message, 6000); markDirtyLater(); });
  return saving;
}
function markDirtyLater() { clearTimeout(saveT); saveT = setTimeout(saveNow, 3000); }
let viewSaveT = null;
function viewChanged() {
  clearTimeout(viewSaveT);
  viewSaveT = setTimeout(() => { if (S.note) { const m = { ...S.note, view: { ...S.view } }; saving = saving.then(() => dbIndexPut(m)).catch(() => {}); } }, 1200);
}

/* ---------- Bilder: Blob in der Datenbank, dekodiert in zwei Stufen ---------- */
const IM = new Map();  // Bild-id -> { rec, low, full, ... }
const MAX_FULL = 8, LOW_W = 640;
let frameNo = 0;
async function decodeBlob(blob) {
  try { return await createImageBitmap(blob); } catch (e) {
    // Fallback z. B. für SVG
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image(); im.src = url; await im.decode();
      return await createImageBitmap(im);
    } finally { URL.revokeObjectURL(url); }
  }
}
function canvasToBlob(c, type, q) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Bild konnte nicht kodiert werden')), type, q)); }
async function makeLow(bmp, type) {
  const s = Math.min(1, LOW_W / bmp.width), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height);
  return canvasToBlob(c, type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.85);
}
function imgEntry(id) {
  let e = IM.get(id);
  if (!e) { e = { rec: null, low: null, full: null, fullLoading: null, state: 'new', used: 0 }; IM.set(id, e); e.ready = loadLow(id, e); }
  return e;
}
async function loadLow(id, e) {
  e.state = 'loading';
  try {
    const rec = await dbImageGet(id);
    if (!rec) { e.state = 'missing'; invalidateImage(id); return; }
    e.rec = rec;
    if (!rec.low) {
      const bmp = await decodeBlob(rec.blob);
      rec.w = bmp.width; rec.h = bmp.height; rec.low = await makeLow(bmp, rec.blob.type); bmp.close();
      dbImagePut(rec).catch(() => {});
    }
    e.low = await createImageBitmap(rec.low);
    e.state = 'ok';
  } catch (err) { e.state = 'error'; }
  invalidateImage(id);
}
function wantFull(id, e) {
  if (e.full || e.fullLoading || !e.rec || e.fullFailed) return;
  e.fullLoading = decodeBlob(e.rec.blob).then(b => {
    e.full = b; e.fullLoading = null; e.used = frameNo;
    if (IM.get(id) === e) { invalidateImage(id); evictFull(); } else b.close();
  }).catch(() => { e.fullLoading = null; e.fullFailed = true; });
}
function evictFull() {
  const full = [...IM.values()].filter(e => e.full && e.used < frameNo).sort((a, b) => a.used - b.used);
  let count = [...IM.values()].filter(e => e.full).length;
  while (count > MAX_FULL && full.length) { const e = full.shift(); e.full.close(); e.full = null; count--; }
}
function releaseImages() { for (const e of IM.values()) { e.low && e.low.close(); e.full && e.full.close(); } IM.clear(); }
function invalidateImage(id) { for (const it of S.items) if (it.t === 'i' && it.img === id) invalidateBox(itemBox(it)); }
function drawImageItem(ctx, it, devScale, quality = true) {
  const e = imgEntry(it.img); e.used = frameNo;
  const devW = it.w * devScale;
  let bmp = null;
  if (e.low && (!quality || devW <= e.low.width * 1.3)) bmp = e.low;
  else { wantFull(it.img, e); bmp = e.full || e.low; }
  // danach wieder die übliche Glättung: sonst zeichnete die Kachel (auch später, aus dem Vorrat) alles Weitere mit 'high', langsamer
  if (bmp) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, it.x, it.y, it.w, it.h); ctx.imageSmoothingQuality = 'low'; return; }
  ctx.fillStyle = 'rgba(128,128,128,.15)'; ctx.fillRect(it.x, it.y, it.w, it.h);
  if (e.state === 'error' || e.state === 'missing') {
    ctx.strokeStyle = 'rgba(128,128,128,.6)'; ctx.lineWidth = 2 / devScale;
    ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x + it.w, it.y + it.h); ctx.moveTo(it.x + it.w, it.y); ctx.lineTo(it.x, it.y + it.h); ctx.stroke();
  }
}

/* ---------- Striche ---------- */
const pathCache = new Map();
const radAt = (pts, i, w, hl) => w / 2 * (hl ? 1 : (0.45 + pts[i * 3 + 2] * 1.1));
// Ein Stück eines Strichs: Kreis am Punkt i und Verbindung zum Punkt i-1.
// Alle Teile haben denselben Umlaufsinn, damit "nonzero" sie vereinigt.
function addPiece(P, pts, i, w, hl) {
  const x = pts[i * 3], y = pts[i * 3 + 1], r = radAt(pts, i, w, hl);
  P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2);
  if (i > 0) {
    const x0 = pts[i * 3 - 3], y0 = pts[i * 3 - 2], r0 = radAt(pts, i - 1, w, hl);
    const dx = x - x0, dy = y - y0, L = Math.hypot(dx, dy);
    if (L > 0.01) {
      const nx = -dy / L, ny = dx / L;
      P.moveTo(x0 + nx * r0, y0 + ny * r0); P.lineTo(x0 - nx * r0, y0 - ny * r0);
      P.lineTo(x - nx * r, y - ny * r); P.lineTo(x + nx * r, y + ny * r);
    }
  }
}
// Fertiger Strich: Verbindungen überall, Kreise nur an den Enden und in Kurven (> 20°).
// Bei kleineren Winkeln füllen zwei Dreiecke die Lücke zwischen den Verbindungen; das spart viel Rechenzeit.
const COS20 = Math.cos(20 * Math.PI / 180);
// Dreieck mit gleichem Umlaufsinn wie alle anderen Teile
function tri(P, cx, cy, ax, ay, bx, by) {
  if ((ax - cx) * (by - cy) - (ay - cy) * (bx - cx) < 0) { const tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }
  P.moveTo(cx, cy); P.lineTo(ax, ay); P.lineTo(bx, by);
}
// Flächen eines Strichs (fl) gültig? n: Zahl der Punkte
const validFl = (fl, n) => Array.isArray(fl) && fl.length > 0 && fl.every(r => Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[1] > r[0] + 1 && r[1] < n);
// fl: Flächen im Strich (gefüllte Pfeilspitzen), je [erster, letzter] Punkt eines geschlossenen Umrisses. Ihre Kanten
// bekommen keinen Strich (sonst würde die Spitze rund), die Fläche wird gefüllt; die Linie dazwischen wie gewohnt.
function buildPath(pts, w, hl, fl, ds) {
  if (hl) return hlGeo(pts, w).P;   // Textmarker: Mittellinie, als Strich gemalt (paintPath)
  const n = pts.length / 3, rs = Array.isArray(fl) ? fl.filter(r => Array.isArray(r) && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[1] > r[0] + 1 && r[1] < n) : [];
  const linePath = ds === 'dash' || ds === 'dot' ? (P, q, w, hl) => dashPath(P, q, w, hl, ds) : solidPath;   // Kontur der Form (Flächen bleiben voll)
  if (!rs.length) return linePath(new Path2D(), pts, w, hl);
  const P = new Path2D(), only = new Uint8Array(n + 1);   // only[i]: Abschnitt i − 1 → i liegt in einer Fläche
  for (const [a, b] of rs) for (let i = a + 1; i <= b; i++) only[i] = 1;
  let s = 0;
  for (let i = 1; i <= n; i++) if (i === n || only[i]) { if (i - 1 > s) linePath(P, pts.subarray ? pts.subarray(s * 3, i * 3) : pts.slice(s * 3, i * 3), w, hl); s = i; }
  for (const [a, b] of rs) {   // im selben Umlaufsinn wie alle anderen Teile (sonst entstünden Löcher)
    let A = 0;
    for (let i = a; i <= b; i++) { const j = i === b ? a : i + 1; A += pts[i * 3] * pts[j * 3 + 1] - pts[j * 3] * pts[i * 3 + 1]; }
    const at = k => A >= 0 ? a + k : b - k;
    P.moveTo(pts[at(0) * 3], pts[at(0) * 3 + 1]);
    for (let k = 1; k <= b - a; k++) P.lineTo(pts[at(k) * 3], pts[at(k) * 3 + 1]);
    P.closePath();
  }
  return P;
}
// gestrichelt oder gepunktet entlang des Linienzugs. Längen wachsen mit der Strichbreite und werden leicht gestreckt,
// damit das Muster aufgeht. Genaue Vielecke (Knicke über 35°, nur lange Kanten dazwischen): jede Kante für sich, Punkte
// genau in den Ecken, an den Ecken ein Winkel aus zwei halben Strichen. Sonst gleichmäßig über den ganzen Zug: offene
// Linien beginnen und enden mit Strich bzw. Punkt, geschlossene gehen ohne Stoß herum.
const COS35 = Math.cos(35 * Math.PI / 180);
function dashPath(P, pts, w, hl, ds) {
  const n = pts.length / 3, cum = new Float64Array(Math.max(n, 1));
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2]);
  const L = n > 1 ? cum[n - 1] : 0, dot = ds === 'dot', closed = n > 2 && Math.hypot(pts[0] - pts[n * 3 - 3], pts[1] - pts[n * 3 - 2]) < 0.01;
  const on = Math.max(6, w * 3.4), gap = dot ? Math.max(4.5, w * 2.9) : Math.max(4.5, w * 2.3), r = Math.max(0.9, w * 0.62);
  if (L < (dot ? 0.5 : on * 1.6)) return solidPath(P, pts, w, hl);   // zu kurz für ein Muster
  let j = 1;
  const at = d => {   // Punkt (x, y, Druck) bei Bogenlänge d; d wächst von Aufruf zu Aufruf
    while (j < n - 1 && cum[j] < d) j++;
    const s = cum[j] - cum[j - 1], t = s > 0 ? clamp((d - cum[j - 1]) / s, 0, 1) : 0, a = j * 3 - 3;
    return [pts[a] + (pts[a + 3] - pts[a]) * t, pts[a + 1] + (pts[a + 4] - pts[a + 1]) * t, pts[a + 2] + (pts[a + 5] - pts[a + 2]) * t];
  };
  const dash = (s, e) => {   // Strich von Bogenlänge s bis e, mit den Ecken dazwischen
    const run = at(s);
    for (let q = j; q < n - 1 && cum[q] < e; q++) if (cum[q] > s) run.push(pts[q * 3], pts[q * 3 + 1], pts[q * 3 + 2]);
    run.push(...at(e)); solidPath(P, Float32Array.from(run), w, hl);
  };
  const circle = d => { const [x, y] = at(d); P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2); };
  const cuts = [0];
  for (let i = 1; i < n - 1; i++) {
    const ax = pts[i * 3] - pts[i * 3 - 3], ay = pts[i * 3 + 1] - pts[i * 3 - 2], bx = pts[i * 3 + 3] - pts[i * 3], by = pts[i * 3 + 4] - pts[i * 3 + 1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la > 1e-6 && lb > 1e-6 && (ax * bx + ay * by) / (la * lb) < COS35) cuts.push(i);
  }
  cuts.push(n - 1);
  const edges = []; for (let k = 1; k < cuts.length; k++) edges.push([cum[cuts[k - 1]], cum[cuts[k]]]);
  if (edges.length < 2 || edges.some(([a, b]) => b - a < on + gap)) {   // ein Zug für sich
    if (dot) { const k = Math.max(1, Math.round(L / gap)); for (let i = 0; i < (closed ? k : k + 1); i++) circle(L * i / k); return P; }
    const per = on + gap, k = closed ? Math.max(2, Math.round(L / per)) : Math.max(1, Math.round((L - on) / per)), f = L / (closed ? k * per : k * per + on);
    for (let i = 0; i < (closed ? k : k + 1); i++) { const s = i * per * f; dash(s, Math.min(L, s + on * f)); }
    return P;
  }
  edges.forEach(([a, b], k) => {
    const len = b - a, last = k === edges.length - 1;
    if (dot) {   // Punkte an beiden Enden der Kante (die Ecke nur einmal)
      const m = Math.max(1, Math.round(len / gap));
      for (let i = k ? 1 : 0; i <= m; i++) if (!(closed && last && i === m)) circle(a + len * i / m);
      return;
    }
    const d0 = k || closed ? on / 2 : on, d1 = !last || closed ? on / 2 : on;   // an einer Ecke ein halber Strich
    const m = Math.max(1, Math.round((len - d0 - d1 + on) / (on + gap))), f = len / (d0 + d1 - on + m * (on + gap)), o = on * f, g = gap * f;
    dash(a, a + d0 * f);
    for (let i = 1; i <= m; i++) { const s = a + d0 * f + i * g + (i - 1) * o; dash(s, i < m ? s + o : b); }
  });
  return P;
}
// Stück i eines Strichs (ab 1): die Verbindung von Punkt i-1 nach i und das Gelenk bei i-1 zum vorigen Stück (Kreis in
// Kurven über 20°, sonst zwei Dreiecke). st: Richtung des vorigen Stücks, wird fortgeschrieben; ohne P nur sie
function joinPiece(P, pts, i, w, hl, st) {
  const x = pts[i * 3], y = pts[i * 3 + 1], x0 = pts[i * 3 - 3], y0 = pts[i * 3 - 2];
  const dx = x - x0, dy = y - y0, L = Math.hypot(dx, dy);
  if (L <= 0.01) return;
  const ux = dx / L, uy = dy / L;
  if (P) {
    const r = radAt(pts, i, w, hl), r0 = radAt(pts, i - 1, w, hl), nx = -uy, ny = ux;
    P.moveTo(x0 + nx * r0, y0 + ny * r0); P.lineTo(x0 - nx * r0, y0 - ny * r0);
    P.lineTo(x - nx * r, y - ny * r); P.lineTo(x + nx * r, y + ny * r);
    if (st.has) {
      if (st.px * ux + st.py * uy < COS20) circleAt(P, pts, i - 1, w, hl);
      else { const qx = -st.py, qy = st.px; tri(P, x0, y0, x0 + qx * r0, y0 + qy * r0, x0 + nx * r0, y0 + ny * r0); tri(P, x0, y0, x0 - qx * r0, y0 - qy * r0, x0 - nx * r0, y0 - ny * r0); }
    }
  }
  st.px = ux; st.py = uy; st.has = true;
}
function solidPath(P, pts, w, hl) {
  const n = pts.length / 3, st = { px: 0, py: 0, has: false };
  for (let i = 1; i < n; i++) joinPiece(P, pts, i, w, hl, st);
  if (!n) return P;
  circleAt(P, pts, 0, w, hl); if (n > 1) circleAt(P, pts, n - 1, w, hl);
  return P;
}
// Textmarker: eine Mittellinie, gemalt als Strich fester Breite (paintPath): flache Enden genau am ersten und letzten
// Punkt (butt, kein Überstand), runde Verbindungen. Das erste und letzte Stück (bis eine halbe Breite) ist gerade, damit
// die Enden quer zur Bewegung liegen (beim Aufsetzen und Abheben zittert der Stift); dazwischen geglättet: quadratische
// Bögen durch die Mitten der Stücke, so bleiben Kurven und Ecken weich statt kantig. Nur angetippt: ein Quadrat.
// b: letzter Punkt vor dem geraden Ende, len: Länge (für das Zeichnen beim Schreiben)
function hlGeo(pts, w) {
  const n = pts.length / 3, P = new Path2D(), X = i => pts[i * 3], Y = i => pts[i * 3 + 1], d = (i, j) => Math.hypot(X(i) - X(j), Y(i) - Y(j));
  let len = 0; for (let i = 1; i < n; i++) len += d(i, i - 1);
  if (!(len >= 0.5)) { P.moveTo(X(0) - w / 2, Y(0)); P.lineTo(X(0) + w / 2, Y(0)); return { P, b: 0, len: len || 0 }; }
  const dmin = Math.min(w * 0.5, len / 3);
  let a = 1; while (a < n - 1 && d(a, 0) < dmin) a++;
  let b = n - 2; while (b > 0 && d(b, n - 1) < dmin) b--;
  const q = [0]; for (let i = a; i <= b; i++) q.push(i); q.push(n - 1);
  P.moveTo(X(0), Y(0));
  for (let k = 1; k < q.length - 1; k++) { const i = q[k], j = q[k + 1]; P.quadraticCurveTo(X(i), Y(i), (X(i) + X(j)) / 2, (Y(i) + Y(j)) / 2); }
  P.lineTo(X(n - 1), Y(n - 1));
  return { P, b: Math.max(0, b), len };
}
// Pfad eines Strichs malen: Textmarker als Strich (Mittellinie), alles andere gefüllt; Farbe aus fillStyle
function paintPath(ctx, P, w, hl) {
  if (!hl) { ctx.fill(P); return; }
  ctx.save(); ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(P); ctx.restore();
}
// Rechteck R (ganze Gerätepixel) durchsichtig machen: Übermalen mit „destination-out“ statt clearRect. Auf dem Surface
// kostet clearRect auf einem Teil einer Fläche so viel wie auf der ganzen (siehe liveClear), Übermalen nur die Fläche
function wipe(g, R) { g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(R[0], R[1], R[2] - R[0], R[3] - R[1]); g.globalCompositeOperation = 'source-over'; }
const isHlStroke = it => it.t === 's' && it.hl && !it.tp && !it.nt;
const alKey = a => Math.round(a * 1000);   // Deckkraft vergleichen (0,42 · 0,42 / 0,42 ist nicht genau 0,42)
const hlBox = st => st.bb || bboxOf(st.pts, st.w);
// Textmarker als eine Schicht: wo sich Textmarker gleicher Deckkraft überlappen, wird es nicht dunkler. Sie kommen deckend
// auf eine Hilfsfläche (der spätere über den früheren) und die einmal mit ihrer Deckkraft (hell multipliziert) auf die
// Fläche. Die Hilfsfläche ist nur so groß wie die Striche (auf der Fläche), ctx hat die Welt-Transformation
let hlScratch = null;
function paintHl(ctx, group) {
  const M = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height, byA = new Map();
  for (const st of group) { const a = alKey(strokeAlpha(st)); let l = byA.get(a); if (!l) byA.set(a, l = []); l.push(st); }
  for (const [ak, l] of byA) {
    const a = ak / 1000;
    let x0 = 0, y0 = 0, x1 = cw, y1 = ch;
    if (!M.b && !M.c) {
      let b0 = Infinity, b1 = Infinity, b2 = -Infinity, b3 = -Infinity;
      for (const st of l) { const q = hlBox(st); b0 = Math.min(b0, q[0]); b1 = Math.min(b1, q[1]); b2 = Math.max(b2, q[2]); b3 = Math.max(b3, q[3]); }
      x0 = Math.max(0, Math.floor(Math.min(M.a * b0, M.a * b2) + M.e) - 2); x1 = Math.min(cw, Math.ceil(Math.max(M.a * b0, M.a * b2) + M.e) + 2);
      y0 = Math.max(0, Math.floor(Math.min(M.d * b1, M.d * b3) + M.f) - 2); y1 = Math.min(ch, Math.ceil(Math.max(M.d * b1, M.d * b3) + M.f) + 2);
    }
    if (x1 <= x0 || y1 <= y0) continue;
    const W = x1 - x0, H = y1 - y0;
    // Kacheln und Ausschnitte: eine Hilfsfläche, die bleibt; Großes (Export, Auswahl) nur für diesmal (sonst bliebe sie riesig)
    const big = W * H > 1100 * 1100, sc = big ? document.createElement('canvas') : hlScratch || (hlScratch = document.createElement('canvas'));
    if (big) { sc.width = W; sc.height = H; } else if (sc.width < W || sc.height < H) { sc.width = Math.max(sc.width, W); sc.height = Math.max(sc.height, H); }
    const g = sc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); if (!big) wipe(g, [0, 0, W, H]); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.setTransform(M.a, M.b, M.c, M.d, M.e - x0, M.f - y0);
    for (const st of l) { g.fillStyle = colorOf(st.c); paintPath(g, strokePath(st), st.w, true); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; if (!isDark()) ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(sc, 0, 0, W, H, x0, y0, W, H); ctx.restore();
    if (big) sc.width = sc.height = 0;
  }
}
// Liste in ihrer Reihenfolge malen (skip: auslassen); aufeinanderfolgende Textmarker als eine Schicht (paintHl)
function paintItems(ctx, list, s, skip) {
  for (let i = 0; i < list.length;) {
    const it = list[i];
    if (skip && skip(it)) { i++; continue; }
    if (!isHlStroke(it)) { drawItem(ctx, it, s); i++; continue; }
    const group = []; let j = i;
    for (; j < list.length; j++) { const q = list[j]; if (skip && skip(q)) continue; if (!isHlStroke(q)) break; group.push(q); }
    paintHl(ctx, group); i = j;
  }
}
/* Textmarker beim Schreiben: nur der Teil, der sich ändert (ab dem Punkt vor dem geraden Ende), wird geleert und mit dem
   ganzen Strich neu gemalt, auf diesen Bereich beschnitten (deckend; die Ebene hat die Deckkraft). Dort wird ausgespart,
   was auf der Seite schon liegt und gleich aussehen soll: Textmarker gleicher Deckkraft (sonst würde es beim Überlappen
   dunkler) und alles, was über dem Textmarker liegt (Schrift, Formen, Tapes): der Marker liegt schon beim Ziehen darunter.
   g: Ebene; k, ox, oy: Welt -> Gerätepixel; a: { pts, w, c, cut: [Liste, Kasten, Aussparen] }, hlB/hlLen: Stand des vorigen
   Bilds (ohne: alles neu). Gibt den Bereich in Gerätepixeln zurück */
function hlLive(g, a, k, ox, oy) {
  const pts = a.pts, n = pts.length / 3, w = a.w; if (!n) return null;
  const geo = hlGeo(pts, w), part = a.hlB != null && a.hlLen >= w * 1.6 && geo.len >= w * 1.6, from = part ? Math.max(0, Math.min(a.hlB, geo.b) - 1) : 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = from; i < n; i++) { const x = pts[i * 3], y = pts[i * 3 + 1]; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const m = w * 0.75 + 3 / k, R = [Math.floor((x0 - m) * k + ox), Math.floor((y0 - m) * k + oy), Math.ceil((x1 + m) * k + ox), Math.ceil((y1 + m) * k + oy)];
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); wipe(g, R);
  g.beginPath(); g.rect(R[0], R[1], R[2] - R[0], R[3] - R[1]); g.clip();
  g.setTransform(k, 0, 0, k, ox, oy); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = colorOf(a.c); paintPath(g, geo.P, w, true);
  if (a.cut) {
    const [list, box, out] = a.cut, rb = [(R[0] - ox) / k, (R[1] - oy) / k, (R[2] - ox) / k, (R[3] - oy) / k];
    for (const it of list) if (boxHit(box(it), rb)) { g.save(); g.globalCompositeOperation = 'destination-out'; out(g, it, k); g.restore(); }
  }
  g.restore();
  a.hlB = geo.b; a.hlLen = geo.len;
  return R;
}
// Was ein neuer Textmarker auf der Seite ausspart (sichtbar in der Ansicht): Textmarker gleicher Deckkraft und alles, was
// über dem Textmarker liegt; Bilder liegen darunter
function hlCutPage(al) {
  const [vx0, vy0] = toWorld(-40, -40), [vx1, vy1] = toWorld(VW + 40, VH + 40), vb = [vx0, vy0, vx1, vy1], list = [];
  for (const it of paintOrder()) {
    if (it.t === 'i' || it.nt || !boxHit(itemBox(it), vb)) continue;
    if (isHlStroke(it) && !it.on && alKey(strokeAlpha(it)) !== alKey(al)) continue;
    list.push(it);
  }
  const out = (g, it, k) => { if (isHlStroke(it)) paintPath(g, strokePath(it), it.w, true); else if (it.tp) drawTape(g, it, k, true); else drawItem(g, it, k); };
  return [list, itemBox, out];
}
function circleAt(P, pts, i, w, hl) { const x = pts[i * 3], y = pts[i * 3 + 1], r = radAt(pts, i, w, hl); P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2); }
function strokePath(s) { let p = pathCache.get(s); if (!p) { p = buildPath(s.pts, s.w, s.hl, s.fl, s.ds); pathCache.set(s, p); } return p; }
function prunePaths() {
  if (pathCache.size < S.items.length * 1.5 + 300) return;
  const cur = new Set(S.items); for (const k of pathCache.keys()) if (!cur.has(k)) pathCache.delete(k);
}
function bboxOf(pts, m) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1]; if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a - m, b - m, c + m, d + m];
}
const isBox = it => it.t === 'i' || it.t === 'x';   // Bild oder Text: ein Kasten x, y, w, h (alles andere sind Striche, auch ohne t)
const itemBox = it => it.t === 's' ? it.bb : it.t === 'x' ? [it.x - 2, it.y - 2, it.x + it.w + it.fs * 0.3, it.y + it.h + 2] : [it.x, it.y, it.x + it.w, it.y + it.h];
const boxHit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
// more: weitere Angaben (Tape: tp, hid; Strich auf einem Tape: on)
function makeStroke(pts, c, w, hl, more) { const p = Float32Array.from(pts); return { t: 's', id: uid(), c, w, hl: !!hl, pts: p, bb: bboxOf(p, w), ...more }; }
// Deckkraft eines Strichs (oder einer Aktion mit hl und al): ohne al der Stift deckend, der Textmarker wie bisher
function strokeAlpha(s) {
  if (s.hl) return s.al ? Math.min(1, s.al * hlAlpha() / HL_ALPHA.light) : hlAlpha();
  return s.al > 0 && s.al < 1 ? s.al : 1;
}
// Ein Strich mit seinem Pfad: Kacheln, Formvorschau und Vorschaubilder zeichnen alle genau so. Der ganze Strich ist ein
// Pfad: wo er sich selbst überlappt, wird er mit Deckkraft nicht dunkler
function fillStroke(ctx, s, P) {
  ctx.fillStyle = colorOf(s.c);
  const a = strokeAlpha(s); if (a < 1) ctx.globalAlpha = a;
  if (s.hl && !isDark()) ctx.globalCompositeOperation = 'multiply';
  paintPath(ctx, P, s.w, s.hl);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
// Füllung einer geschlossenen Form (fs: 'solid' | 'hachure' | 'cross') unter ihrer Kontur. Die Fläche sind die Punkte
// der Form (nonzero: auch skizzenhaft zweimal herum bleibt sie voll). Voll ist zart (FILL_A) in der Farbe der Form, damit
// Kontur und was darunter steht sichtbar bleiben; Schraffur sind dünne Linien „/“ (Kreuzschraffur dazu „\“), auf die
// Fläche beschnitten, ihr Abstand wächst mit der Strichbreite.
const FILL_A = 0.25, fillCache = new WeakMap(), hitCtx = document.createElement('canvas').getContext('2d');   // hitCtx: Treffer in Weltkoordinaten
function fillGeo(s) {
  let g = fillCache.get(s); if (g) return g;
  const p = s.pts, n = p.length / 3, P = new Path2D();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1]; if (i) P.lineTo(x, y); else P.moveTo(x, y);
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  P.closePath(); g = { P };
  if (s.fs === 'hachure' || s.fs === 'cross') {
    const H = new Path2D(), step = Math.max(6, s.w * 3.2) * Math.SQRT2, a = x0 - 2, b = x1 + 2;
    for (let c = x0 + y0 + step / 2; c < x1 + y1; c += step) { H.moveTo(a, c - a); H.lineTo(b, c - b); }   // „/“: y = c − x
    if (s.fs === 'cross') for (let c = y0 - x1 + step / 2; c < y1 - x0; c += step) { H.moveTo(a, a + c); H.lineTo(b, b + c); }   // „\“: y = x + c
    g.H = H;
  }
  fillCache.set(s, g); return g;
}
function fillShape(ctx, s) {
  const g = fillGeo(s), al = strokeAlpha(s);
  ctx.save();
  if (s.fs === 'solid') { ctx.globalAlpha = FILL_A * al; ctx.fillStyle = colorOf(s.c); ctx.fill(g.P); }
  else if (g.H) { ctx.clip(g.P); ctx.globalAlpha = 0.8 * al; ctx.strokeStyle = colorOf(s.c); ctx.lineWidth = Math.max(0.8, s.w * 0.45); ctx.lineCap = 'round'; ctx.stroke(g.H); }
  ctx.restore();
}
const shapeDraw = (ctx, s, P) => { if (s.fs) fillShape(ctx, s); fillStroke(ctx, s, P); };
function drawItem(ctx, it, devScale) {
  if (it.t === 's') { if (it.tp) drawTape(ctx, it, devScale); else if (it.nt) drawNoteBadge(ctx, it, devScale); else shapeDraw(ctx, it, strokePath(it)); }   // Erklärung: nur das „i“
  else if (it.t === 'i') drawImageItem(ctx, it, devScale);
  else if (it.t === 'x') drawText(ctx, it);
}
/* ---------- Text: Satz und Zeichnen ----------
   Ein Text ist { t: 'x', x, y, w (Breite der Zeilen), h (Höhe, aus dem Satz), ff (Schrift), fs (Größe), c (Farbe),
   al ('c' | 'r', sonst links), runs: [{ s, b, i, u, k (durchgestrichen), c }] }; \n trennt Zeilen. Gesetzt wird wie
   im Textfeld beim Schreiben (CSS white-space: pre-wrap, Zeilenhöhe 1,35): Umbruch an Leerzeichen, die am Zeilenende
   überhängen, zu lange Wörter zeichenweise; die Grundlinie mit dem halben Zeilenabstand über der Schrift. */
const TEXT_FONTS = {
  sans: ['Standard', '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif'],
  calibri: ['Calibri', 'Calibri, Carlito, "Segoe UI", sans-serif'],
  serif: ['Times', '"Times New Roman", Times, "Liberation Serif", serif'],
  mono: ['Schreibmaschine', 'Consolas, "Cascadia Mono", "Courier New", monospace'],
  hand: ['Handschrift', '"Ink Free", "Segoe Print", "Bradley Hand", cursive'],
  comic: ['Comic', '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive'],
};
const fontStack = ff => (TEXT_FONTS[ff] || TEXT_FONTS.sans)[1];
const textFontStr = (it, r) => `${r.i ? 'italic ' : ''}${r.b ? 700 : 400} ${it.fs}px ${fontStack(it.ff)}`;
const txMeasure = document.createElement('canvas').getContext('2d'), txLayouts = new WeakMap();
function textLayout(it) {
  let L = txLayouts.get(it); if (L) return L;
  const g = txMeasure, W = it.w, lh = it.fs * 1.35, lines = [], sp = f => /^ +$/.test(f.t);
  let line = { frags: [], w: 0 };
  const flush = () => { let w = line.w; for (let k = line.frags.length - 1; k >= 0 && sp(line.frags[k]); k--) w -= line.frags[k].w; line.tw = w; lines.push(line); line = { frags: [], w: 0 }; };
  const put = (s, r, w) => { line.frags.push({ t: s, r, x: line.w, w }); line.w += w; };
  for (const r of it.runs || []) {
    g.font = textFontStr(it, r);
    for (const tok of r.s.split(/(\n| +)/)) {
      if (!tok) continue;
      if (tok === '\n') { flush(); continue; }
      let s = tok, w = g.measureText(s).width;
      if (tok[0] === ' ') { put(s, r, w); continue; }   // Leerzeichen hängen am Zeilenende über
      if (line.w + w > W && line.frags.some(f => !sp(f))) flush();
      while (line.w + w > W && s.length > 1) {   // länger als die Zeile: so viele Zeichen wie passen
        let n = s.length - 1; while (n > 1 && line.w + g.measureText(s.slice(0, n)).width > W) n--;
        put(s.slice(0, n), r, g.measureText(s.slice(0, n)).width); flush();
        s = s.slice(n); w = g.measureText(s).width;
      }
      put(s, r, w);
    }
  }
  flush();
  g.font = textFontStr(it, {}); const m = g.measureText('Hg');
  const asc = m.fontBoundingBoxAscent || it.fs * 0.92, desc = m.fontBoundingBoxDescent || it.fs * 0.24, base = (lh - asc - desc) / 2 + asc;
  lines.forEach((ln, k) => { ln.base = k * lh + base; ln.dx = it.al === 'c' ? (W - ln.tw) / 2 : it.al === 'r' ? W - ln.tw : 0; });
  L = { lines, h: lines.length * lh }; txLayouts.set(it, L); return L;
}
function drawText(ctx, it) {
  const L = textLayout(it), th = Math.max(it.fs / 15, 0.6);
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  for (const ln of L.lines) for (const f of ln.frags) {
    const x = it.x + ln.dx + f.x, y = it.y + ln.base;
    ctx.fillStyle = colorOf(f.r.c || it.c);
    if (!/^ +$/.test(f.t)) { ctx.font = textFontStr(it, f.r); ctx.fillText(f.t, x, y); }
    if (f.r.u) ctx.fillRect(x, y + it.fs * 0.12, f.w, th);
    if (f.r.k) ctx.fillRect(x, y - it.fs * 0.28, f.w, th);
  }
  ctx.restore();
}

/* ---------- Tape ----------
   Wie das Tape bei Goodnotes: ein Band zum Abdecken. Technisch ein Strich mit tp (Muster) und hid (abgedeckt);
   Auswahl, Radierer, Rückgängig, Speichern und Export gelten damit wie für Striche. Abgedeckt ist es deckend in seiner
   Farbe mit Muster, aufgedeckt nur ein Schimmer mit gestrichelter Kante. Antippen deckt auf bzw. wieder ab. Was auf
   einem abgedeckten Tape geschrieben wird (on = Tape), verschwindet beim Aufdecken mit ihm: Antwort daraufschreiben,
   aufdecken, vergleichen. */
const covered = s => s.hid !== false;
// Band (Mittellinie, Enden gerade abgeschnitten), Zacken an beiden Enden und Umriss für die gestrichelte Kante
function tapeGeo(s) {
  let g = pathCache.get(s); if (g) return g;
  const p = s.pts, h = s.w / 2, P0 = Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 1]]);
  // Mittellinie Q: das erste und letzte Stück (etwa eine halbe Breite) wird zur Geraden. Beim Aufsetzen und Abheben
  // zittert der Stift oft in eine andere Richtung; die gerade Schnittkante des Bands folgt dem ersten bzw. letzten
  // Stück und muss genau so liegen wie die Zacken, sonst entstehen Kerben
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), N0 = P0.length;
  let len = 0; for (let i = 1; i < N0; i++) len += dist(P0[i], P0[i - 1]);
  const dmin = Math.min(s.w * 0.6, len / 3);
  let a = 1; while (a < N0 - 1 && dist(P0[a], P0[0]) < dmin) a++;
  let b = N0 - 2; while (b > 0 && dist(P0[b], P0[N0 - 1]) < dmin) b--;
  const Q = N0 < 2 ? [P0[0], P0[0]] : a < b ? [P0[0], ...P0.slice(a, b + 1), P0[N0 - 1]] : [P0[0], P0[N0 - 1]], n = Q.length;
  const line = new Path2D(); line.moveTo(...Q[0]); for (let i = 1; i < n; i++) line.lineTo(...Q[i]);
  const dir = (i0, i1) => { const dx = Q[i1][0] - Q[i0][0], dy = Q[i1][1] - Q[i0][1], d = Math.hypot(dx, dy); return d > 1e-6 ? [dx / d, dy / d] : [1, 0]; };
  const u0 = dir(0, 1), u1 = dir(n - 2, n - 1);   // genau die Richtung des ersten und letzten Stücks
  const k = Math.max(3, Math.round(s.w / 6)), dep = Math.min(s.w * 0.12, 4);
  // Zacken an der Stirnseite durch (x, y) mit Richtung u, nach außen out (±1): von links (+Normale) nach rechts
  const zig = (x, y, u, out) => Array.from({ length: 2 * k + 1 }, (_, j) => {
    const q = h - j * h / k, o = j % 2 ? out * dep : 0;
    return [x - u[1] * q + u[0] * o, y + u[0] * q + u[1] * o];
  });
  const z1 = zig(...Q[n - 1], u1, 1), z0 = zig(...Q[0], u0, -1);
  // Zacken: für den Schatten genau anschließend, zum Malen etwas ins Band hinein (sonst bleibt eine helle Fuge)
  const teeth = new Path2D(), teethS = new Path2D();
  for (const [z, u, out] of [[z0, u0, -1], [z1, u1, 1]]) {
    for (const P of [teeth, teethS]) { P.moveTo(...z[0]); for (const q of z.slice(1)) P.lineTo(...q); }
    const [ax, ay] = z[0], [bx, by] = z[z.length - 1], d = -out * 1.2;
    teeth.lineTo(bx + u[0] * d, by + u[1] * d); teeth.lineTo(ax + u[0] * d, ay + u[1] * d);
    teeth.closePath(); teethS.closePath();
  }
  // Umriss: links vorwärts, Zacken am Ende, rechts zurück, Zacken am Anfang
  const edge = new Path2D(), side = (i, sg) => {
    const u = i === 0 ? u0 : i === n - 1 ? u1 : dir(Math.max(0, i - 2), Math.min(n - 1, i + 2));
    return [Q[i][0] - u[1] * h * sg, Q[i][1] + u[0] * h * sg];
  };
  edge.moveTo(...side(0, 1)); for (let i = 1; i < n; i++) edge.lineTo(...side(i, 1));
  for (const q of z1) edge.lineTo(...q);
  for (let i = n - 1; i >= 0; i--) edge.lineTo(...side(i, -1));
  for (const q of z0.slice().reverse()) edge.lineTo(...q);
  edge.closePath();
  g = { line, teeth, teethS, edge, q: Q }; if (!s.live) pathCache.set(s, g);   // die Vorschau beim Zeichnen nicht merken
  return g;
}
// Muster des Tapes, hell über der Farbe, 16 Welteinheiten groß. Gemalt in der Auflösung, in der es erscheint (ds
// Gerätepixel je Welteinheit): ein hochskaliertes kleines Muster zeigt an den Kachelecken helle Punkte
const tapePats = new WeakMap();
function tapePattern(ctx, kind, ds) {
  const r = clamp(Math.round(ds * 2) / 2, 1, 8), key = kind + '@' + r;
  let m = tapePats.get(ctx); if (!m) tapePats.set(ctx, m = new Map());
  if (m.has(key)) return m.get(key);
  const N = 16, c = document.createElement('canvas'); c.width = c.height = Math.round(N * r);
  const g = c.getContext('2d'); g.scale(r, r); g.fillStyle = g.strokeStyle = 'rgba(255,255,255,.42)';
  // jeweils ein Pfad in einem Zug: wo sich Teile überlappen, wird es nicht doppelt hell
  g.beginPath();
  if (kind === 'streifen') { g.lineWidth = 3.4; for (const o of [-N, 0, N]) { g.moveTo(o - 4, N + 4); g.lineTo(o + N + 4, -4); } g.stroke(); }   // über die Ecken hinaus
  else if (kind === 'punkte') { for (const [x, y] of [[4, 4], [12, 12]]) { g.moveTo(x + 1.9, y); g.arc(x, y, 1.9, 0, 6.2832); } g.fill(); }
  else if (kind === 'karo') { g.rect(0, 0, N, 2); g.rect(0, 0, 2, N); g.fill(); }
  const pat = kind === 'uni' ? null : ctx.createPattern(c, 'repeat');
  if (pat) pat.setTransform(new DOMMatrix().scale(N / c.width));
  m.set(key, pat); return pat;
}
/* Figuren (Kätzchen, Hündchen): nicht gekachelt wie die Muster, sondern einzeln entlang der Mittellinie gestempelt,
   0,72 Tape-Breiten hoch, längs des Tapes und nie auf dem Kopf, dazwischen eine kleine Beigabe – wie gedrucktes
   Washi-Tape, das irgendwo abgeschnitten wird. Eigene, vereinfachte Zeichnungen im Stil von Hello Kitty und
   Cinnamoroll. Eine Figur: Höhe 1 um (0, 0), Breite w; die Beigabe Höhe 1, Breite aw; c: die passende Tape-Farbe, die
   beim Wählen des Musters gleich mit eingestellt wird. */
const TAPE_MOTIFS = {
  // Kätzchen: weißer Kopf mit schwarzem Umriss, Schleife am rechten Ohr, gelbe Nase, je drei Schnurrhaare; dazwischen Schleifen
  kitty: { w: 1.42, aw: 1.4, c: '#f4a7b9',
    draw(g) {
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      const K = '#111', P = '#e5195e', T = 0.05;
      // Flügel der Schleife vom Knoten (Ursprung) aus: am Knoten spitz, außen breit und rund, in Richtung a
      const wing = (a, L, p, q, m) => {
        const c = Math.cos(a), s = Math.sin(a), Q = (x, y) => [c * x - s * y, s * x + c * y];
        g.moveTo(0, 0);
        g.bezierCurveTo(...Q(p, -q), ...Q(L, -m), ...Q(L, 0));
        g.bezierCurveTo(...Q(L, m), ...Q(p, q), 0, 0);
      };
      // Kopf: ein gespiegelter Pfad (Kinn, Backe, Ohransatz, Ohrspitze, innere Ohrecke, flacher Scheitel, zurück)
      const R = [[0.40, 0.458, 0.537, 0.35, 0.537, 0.095],
                 [0.537, 0.02, 0.507, -0.06, 0.498, -0.10],
                 [0.515, -0.22, 0.50, -0.42, 0.405, -0.428],
                 [0.35, -0.432, 0.28, -0.37, 0.22, -0.346]];
      g.beginPath(); g.moveTo(0, 0.458);
      for (const s of R) g.bezierCurveTo(s[0], s[1], s[2], s[3], s[4], s[5]);
      g.bezierCurveTo(0.08, -0.362, -0.08, -0.362, -0.22, -0.346);
      for (let i = R.length - 1; i >= 0; i--) {
        const s = R[i], p = i ? R[i - 1] : [0, 0, 0, 0, 0, 0.458];
        g.bezierCurveTo(-s[2], s[3], -s[0], s[1], -p[4], p[5]);
      }
      g.closePath();
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = K; g.lineWidth = T; g.stroke();
      // Schnurrhaare: je drei, nach unten gefächert, beginnen in den Backen
      g.lineWidth = 0.044; g.beginPath();
      for (const s of [-1, 1]) {
        g.moveTo(s * 0.45, 0.115); g.lineTo(s * 0.67, 0.125);
        g.moveTo(s * 0.455, 0.22); g.lineTo(s * 0.612, 0.25);
        g.moveTo(s * 0.40, 0.305); g.lineTo(s * 0.565, 0.39);
      }
      g.stroke();
      // Augen: schwarze, hohe Ovale, weit auseinander
      g.fillStyle = K; g.beginPath();
      g.ellipse(-0.276, 0.162, 0.046, 0.063, 0, 0, 7);
      g.ellipse(0.276, 0.162, 0.046, 0.063, 0, 0, 7); g.fill();
      // Nase: gelbes Oval, der schwarze Rand liegt außen (erst Umriss, dann Füllung), damit das Gelb groß bleibt
      g.beginPath(); g.ellipse(0, 0.252, 0.05, 0.034, 0, 0, 7);
      g.lineWidth = 0.044; g.stroke(); g.fillStyle = '#f6c500'; g.fill();
      // Schleife am rechten Ohr: großer Flügel nach links oben, kleinerer nach rechts unten, runder Knoten; die Ohrspitze schaut dazwischen hervor
      g.translate(0.27, -0.205);
      g.beginPath(); wing(-2.58, 0.30, 0.15, 0.15, 0.17); wing(0.35, 0.29, 0.15, 0.15, 0.16);
      g.lineWidth = 2 * T; g.stroke();   // Umriss außen um die Flügel …
      g.fillStyle = P; g.fill();         // … das Rosa deckt die innere Hälfte
      g.beginPath(); g.arc(0, 0, 0.094, 0, 7);
      g.fill(); g.lineWidth = T; g.stroke();
      g.restore();
    },
    accent(g) {
      // kleine pinke Schleife: runde Flügel, leicht nach oben, runder Knoten (Umriss außen)
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = '#111'; g.fillStyle = '#e5195e';
      g.beginPath();
      for (const s of [-1, 1]) {
        g.moveTo(0, 0.06);
        g.bezierCurveTo(s * 0.26, -0.48, s * 0.62, -0.46, s * 0.6, -0.02);
        g.bezierCurveTo(s * 0.58, 0.44, s * 0.26, 0.48, 0, 0.06);
      }
      g.lineWidth = 0.15; g.stroke(); g.fill();
      g.beginPath(); g.arc(0, 0.05, 0.155, 0, 7); g.fill(); g.lineWidth = 0.075; g.stroke();
      g.restore();
    } },
  // Hündchen: weiß mit weichem blauem Umriss, lange Schlappohren, rosa Bäckchen, „ω“-Mund, Ringelschwanz; dazwischen Sterne
  hund: { w: 1.95, aw: 1, c: '#8ec5ef',
    draw(g) {
      const B = '#3f8fdc', T = 0.046, P = 2 * Math.PI, PI = Math.PI;
      // rechtes Ohr: vom Kopf über die obere Kante, die runde Spitze und die untere Kante zur Backe (das linke gespiegelt, rückwärts)
      const E = [0.2962, -0.3528, 0.45, -0.372, 0.697, -0.071, 0.856, 0.051, 0.988, 0.152, 0.836, 0.351, 0.704, 0.249, 0.585, 0.158, 0.509, 0.091, 0.4403, 0.0386];
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      // Umriss: Kopf mit Ohren, sitzender Körper mit zwei Füßen und Ringelschwanz (alle im Uhrzeigersinn: eine Fläche);
      // erst breit blau umranden, dann weiß füllen: ein weicher Umriss außen um die ganze Figur
      g.beginPath();
      g.moveTo(E[0], E[1]);
      for (let i = 2; i < 20; i += 6) g.bezierCurveTo(E[i], E[i + 1], E[i + 2], E[i + 3], E[i + 4], E[i + 5]);
      g.bezierCurveTo(0.3878, 0.1538, 0.224, 0.205, 0, 0.205);
      g.bezierCurveTo(-0.224, 0.205, -0.3878, 0.1538, -E[18], E[19]);
      for (let i = 16; i > 0; i -= 6) g.bezierCurveTo(-E[i], E[i + 1], -E[i - 2], E[i - 1], -E[i - 4], E[i - 3]);
      g.bezierCurveTo(-0.1361, -0.456, 0.1361, -0.456, E[0], E[1]);
      g.moveTo(0, 0.05);
      g.bezierCurveTo(0.14, 0.05, 0.21, 0.13, 0.24, 0.25);
      g.bezierCurveTo(0.275, 0.39, 0.22, 0.437, 0.12, 0.437);
      g.bezierCurveTo(0.06, 0.437, 0.025, 0.43, 0, 0.408);
      g.bezierCurveTo(-0.025, 0.43, -0.06, 0.437, -0.12, 0.437);
      g.bezierCurveTo(-0.22, 0.437, -0.275, 0.39, -0.24, 0.25);
      g.bezierCurveTo(-0.21, 0.13, -0.14, 0.05, 0, 0.05);
      g.moveTo(-0.135, 0.332); g.arc(-0.24, 0.332, 0.105, 0, P);
      g.strokeStyle = B; g.lineWidth = 2 * T; g.stroke();
      g.fillStyle = '#fff'; g.fill();
      // Linien innen, bündig mit dem Umriss: Kinn, Schwanzkante vor dem Körper mit Spirale, Kopfrand über den Ohransätzen, kleiner Mund
      g.beginPath();
      g.moveTo(0.2246, 0.2014); g.quadraticCurveTo(0, 0.2454, -0.2246, 0.2014); g.lineTo(-0.24, 0.2086);
      g.arc(-0.24, 0.3228, 0.1142, -PI / 2, PI / 2);
      g.arc(-0.24, 0.368, 0.069, PI / 2, 1.5 * PI);
      g.arc(-0.24, 0.337, 0.038, 1.5 * PI, 2.3 * PI);
      for (const s of [1, -1]) { g.moveTo(s * 0.4552, 0.0502); g.quadraticCurveTo(s * 0.4943, -0.0964, s * 0.4579, -0.1722); }
      g.moveTo(-0.07, 0); g.quadraticCurveTo(-0.035, 0.065, 0, 0.015); g.quadraticCurveTo(0.035, 0.065, 0.07, 0);
      g.lineWidth = 0.8 * T; g.stroke();
      // Bäckchen, dann Augen
      g.fillStyle = '#f7aec3'; g.beginPath();
      g.ellipse(-0.31, 0.06, 0.08, 0.045, 0, 0, P); g.moveTo(0.39, 0.06); g.ellipse(0.31, 0.06, 0.08, 0.045, 0, 0, P); g.fill();
      g.fillStyle = '#2f7fd4'; g.beginPath();
      g.ellipse(-0.225, -0.03, 0.046, 0.067, 0, 0, P); g.moveTo(0.271, -0.03); g.ellipse(0.225, -0.03, 0.046, 0.067, 0, 0, P); g.fill();
      g.restore();
    },
    accent(g) {
      // runder, hellgelber Stern mit demselben weichen blauen Umriss, leicht geneigt
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.translate(0.03, 0.012); g.rotate(-0.22);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.215 : 0.43;
        g.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
      g.closePath();
      g.fillStyle = '#f8ec9a'; g.strokeStyle = '#3f8fdc'; g.lineWidth = 0.1;
      g.fill(); g.stroke();
      g.restore();
    } },
  // Teufelchen: weißes, freches Gesicht in dunkler Kapuze mit spitzen Ohren und Kugeln daran, rosa Totenkopf; dazwischen Totenköpfe
  kuro: { w: 1.16, aw: 0.9, c: '#c4a9ea',
    draw(g) {
      const K = '#1b181e', H = '#46424c', P = '#f4a3c4', T = 0.048, C = 2 * Math.PI;
      // rechtes Ohr (das linke gespiegelt): verdeckter Ansatz, innere Ecke, Kugel an der Spitze, äußere Ecke, zurück
      const E = [[0.15, 0], [0.185, -0.235], [0.43, 0], [0.3, 0.08]], B = [0.49, -0.405, 0.037, 2.18];
      // Gesicht, rechte Hälfte ab der Spitze über der Stirn: Bogen über dem Auge, dann die Backe hinunter zum Kinn (links gespiegelt)
      const F = [[0.045, 0.158, 0.1, 0.112, 0.15, 0.112], [0.31, 0.112, 0.41, 0.448, 0, 0.448]];
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = K; g.fillStyle = H; g.lineWidth = 2 * T;
      // 1. Ohren mit den Kugeln an den Spitzen, hinter der Kapuze (breit umranden, dann füllen: der Umriss liegt außen)
      g.beginPath();
      for (const s of [1, -1]) {
        const a = s > 0 ? B[3] : Math.PI - B[3];
        g.moveTo(s * E[0][0], E[0][1]); g.lineTo(s * E[1][0], E[1][1]);
        g.arc(s * B[0], B[1], B[2], a, a + s * C, s < 0);
        g.lineTo(s * E[2][0], E[2][1]); g.lineTo(s * E[3][0], E[3][1]);
      }
      g.stroke(); g.fill();
      // 2. Kapuze: runde Kuppel, die Seiten hängen neben den Backen herab; der offene Rand liegt hinter dem Gesicht
      g.beginPath(); g.moveTo(-0.24, 0.376);
      g.bezierCurveTo(-0.47, 0.43, -0.43, -0.19, 0, -0.19);
      g.bezierCurveTo(0.43, -0.19, 0.47, 0.43, 0.24, 0.376);
      g.stroke(); g.fill();
      // 3. weißes Gesicht mit derselben Linienbreite: seine Linie führt den Umriss der Kapuze ums Kinn weiter
      g.beginPath(); g.moveTo(0, 0.168);
      for (const f of F) g.bezierCurveTo(f[0], f[1], f[2], f[3], f[4], f[5]);
      for (let i = F.length - 1; i >= 0; i--) {
        const f = F[i], p = i ? F[i - 1] : [0, 0, 0, 0, 0, 0.168];
        g.bezierCurveTo(-f[2], f[3], -f[0], f[1], -p[4], p[5]);
      }
      g.stroke(); g.fillStyle = '#fff'; g.fill();
      // 4. schwarz: Rand der Nase, freche Augen (Lid fällt zur Mitte hin ab, Wimper außen), schiefes Grinsen
      g.fillStyle = K; g.beginPath();
      g.ellipse(0, 0.334, 0.036, 0.025, 0, 0, C);
      for (const s of [-1, 1]) {
        g.moveTo(s * 0.232, 0.212); g.lineTo(s * 0.125, 0.254);
        g.bezierCurveTo(s * 0.108, 0.278, s * 0.122, 0.35, s * 0.17, 0.35);
        g.bezierCurveTo(s * 0.208, 0.35, s * 0.228, 0.3, s * 0.218, 0.25);
      }
      g.moveTo(-0.042, 0.388); g.bezierCurveTo(-0.01, 0.402, 0.048, 0.436, 0.058, 0.377);
      g.fill(); g.lineWidth = 0.012; g.stroke();   // dünner Rand in derselben Farbe rundet alle Ecken, auch das Mundende
      // 5. rosa: Totenkopf auf der Kapuze (Augen und Zahnlücken gegenläufig ausgespart), Nase, Zunge
      g.fillStyle = P; g.beginPath();
      g.ellipse(0, -0.012, 0.118, 0.09, 0, 0, C); g.ellipse(0, 0.334, 0.025, 0.015, 0, 0, C);
      g.rect(-0.047, 0.044, 0.094, 0.06);
      for (const s of [-1, 1]) {
        g.ellipse(s * 0.054, 0.004, 0.033, 0.038, 0, C, 0, true);
        g.rect(s * 0.016 + 0.0065, 0.082, -0.013, 0.022);
      }
      g.ellipse(0.027, 0.403, 0.019, 0.0095, -0.25, 0, C);
      g.fill();
      g.restore();
    },
    accent(g) {
      // kleiner rosa Totenkopf mit demselben dunklen Rand: runder Schädel und Kiefer, dunkle Augen und Zahnlücken
      g.save();
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = '#1b181e'; g.fillStyle = '#f4a3c4'; g.lineWidth = 0.14;
      g.beginPath(); g.ellipse(0, -0.07, 0.36, 0.3, 0, 0, 2 * Math.PI); g.rect(-0.19, 0.06, 0.38, 0.29);
      g.stroke(); g.fill();
      g.fillStyle = '#1b181e'; g.beginPath();
      for (const s of [-1, 1]) { g.ellipse(s * 0.15, -0.03, 0.105, 0.125, 0, 0, 2 * Math.PI); g.rect(s * 0.0625 - 0.0225, 0.23, 0.045, 0.12); }
      g.fill();
      g.restore();
    } },
};
// Jede Figur wird je Größe einmal als Bild gemalt (in 4-px-Stufen, höchstens 512 px hoch) und dann nur gestempelt
const motifBmps = new Map();
function motifBitmap(kind, part, hPx) {
  const px = clamp(Math.ceil(hPx / 4) * 4, 8, 512), key = kind + part + px;
  let c = motifBmps.get(key); if (c) return c;
  const m = TAPE_MOTIFS[kind], a = part === 'a', pad = 2;
  c = document.createElement('canvas'); c.width = Math.ceil(px * (a ? m.aw : m.w)) + 2 * pad; c.height = px + 2 * pad; c.px = px;
  const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.scale(px, px);
  if (a) m.accent(g); else m.draw(g);
  if (motifBmps.size >= 48) motifBmps.delete(motifBmps.keys().next().value);
  motifBmps.set(key, c); return c;
}
function drawMotifs(ctx, s, g, ds, box) {   // box: nur dort stempeln (Weltkoordinaten)
  const Q = g.q, n = Q.length, L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]));
  const m = TAPE_MOTIFS[s.tp], total = L[n - 1], h = 0.72 * s.w, ha = 0.3 * s.w, lm = h * m.w, la = ha * m.aw, sp = lm * 1.18 + la;
  if (!(total > 0)) return;
  // Punkt bei der Länge d entlang der Mittellinie; vor dem Anfang und hinter dem Ende geht es gerade weiter (wie die
  // Schnittkanten): die Figur am Ende bleibt an ihrem Platz und wird dort abgeschnitten, statt aufs Ende zu rutschen
  const pos = d => {
    let lo = 1, hi = n - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (L[mid] < d) lo = mid + 1; else hi = mid; }
    const t = L[lo] > L[lo - 1] ? (d - L[lo - 1]) / (L[lo] - L[lo - 1]) : 0;
    return [Q[lo - 1][0] + (Q[lo][0] - Q[lo - 1][0]) * t, Q[lo - 1][1] + (Q[lo][1] - Q[lo - 1][1]) * t];
  };
  // Lage der Figuren der Reihe nach: längs des Tapes (Richtung über eine Figurbreite gemittelt, ruhig auch bei zittriger
  // Hand) und aufrecht. Umgedreht wird erst, wenn eine Figur um mehr als gut 100° kippen würde (U-Kurve, Zickzack);
  // senkrecht zeigen die Köpfe nach links. So kippt beim Zeichnen nichts hin und her, und alle Kacheln rechnen gleich
  let flip = null;
  const angle = d => {
    const a = pos(d - sp / 2), b = pos(d + sp / 2), r = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(r);
    if (flip === null) flip = c > 0.3 ? 0 : c < -0.3 || Math.sin(r) > 0 ? Math.PI : 0;
    else if (Math.cos(r + flip) < -0.3) flip = flip ? 0 : Math.PI;
    return r + flip;
  };
  // in einer engen Kehre ist kein Platz für eine Figur (sie ragte aus dem Band): dort keine
  const bent = d => { const a = pos(d - lm / 2), b = pos(d + lm / 2); return Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.7 * lm; };
  // sichtbarer Ausschnitt in Weltkoordinaten (Kachel, Vorschau, Export: ohne Drehung), Figuren daneben nicht stempeln
  const T = ctx.getTransform(), cw = ctx.canvas.width, chh = ctx.canvas.height, rr = h * Math.max(m.w, 1);
  const cull = !T.b && !T.c && T.a > 0 && T.d > 0;
  let vx0 = -T.e / T.a - rr, vy0 = -T.f / T.d - rr, vx1 = (cw - T.e) / T.a + rr, vy1 = (chh - T.f) / T.d + rr;
  if (box) { vx0 = Math.max(vx0, box[0] - rr); vy0 = Math.max(vy0, box[1] - rr); vx1 = Math.min(vx1, box[2] + rr); vy1 = Math.min(vy1, box[3] + rr); }
  const bm = motifBitmap(s.tp, 'm', h * ds), ba = motifBitmap(s.tp, 'a', ha * ds), ends = [];
  const stamp = (c, x, y, r, hw) => {   // hw: Höhe in Welteinheiten
    const k = hw / c.px;
    ctx.save(); ctx.translate(x, y); ctx.rotate(r);
    ctx.drawImage(c, -c.width / 2 * k, -c.height / 2 * k, c.width * k, c.height * k); ctx.restore();
  };
  // Figuren, die über ein Ende ragen, werden auf das Band (mit Zacken) beschnitten; die anderen liegen ganz im Band
  // (0,72 Breiten hoch) und kommen ohne das teure Beschneiden aus
  const put = (c, d, hw, len, fig) => {
    const r = angle(d), [x, y] = pos(d);   // die Lage auch für nicht sichtbare Figuren, sie hängt von der Reihe ab
    if ((fig && bent(d)) || (cull && (x < vx0 || x > vx1 || y < vy0 || y > vy1))) return;
    if (d - len / 2 < 0 || d + len / 2 > total) ends.push([c, x, y, r, hw]); else stamp(c, x, y, r, hw);
  };
  if (total < sp) put(bm, total / 2, h, lm, true);   // kurzes Stück: eine Figur in der Mitte (bei total = sp dieselbe Stelle)
  else for (let d = sp / 2; d - lm / 2 < total; d += sp) { put(bm, d, h, lm, true); if (d + sp / 2 - la / 2 < total) put(ba, d + sp / 2, ha, la, false); }
  if (ends.length) { ctx.save(); ctx.clip(g.edge); for (const e of ends) stamp(...e); ctx.restore(); }
}
function drawTape(ctx, s, ds = 1, flat = false, box = null) {   // flat: ohne Schatten (gewähltes Muster im Menü, dort mit Umriss); box: Figuren nur dort
  const g = tapeGeo(s), on = covered(s);
  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.lineWidth = s.w;
  if (!on) ctx.globalAlpha = 0.16;
  else if (!flat && !s.live) {   // beim Ziehen ohne Schatten (spart viel bei langen Tapes)
    // abgedeckt liegt es mit einem Schatten nach unten auf dem Papier, mit der Dicke wachsend. Nur der Schatten wird
    // hier gemalt (die Form liegt weit daneben, der Versatz in Gerätepixeln holt den Schatten zurück)
    const far = 30000 / ds;
    ctx.save(); ctx.translate(-far, 0);
    ctx.shadowColor = isDark() ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.32)';
    ctx.shadowOffsetX = (far + s.w * 0.04) * ds; ctx.shadowOffsetY = s.w * 0.13 * ds; ctx.shadowBlur = s.w * 0.035 * ds;
    ctx.strokeStyle = ctx.fillStyle = '#000'; ctx.stroke(g.line); ctx.fill(g.teethS);
    ctx.restore();
  }
  ctx.strokeStyle = ctx.fillStyle = s.c; ctx.stroke(g.line); ctx.fill(g.teeth);
  if (on && TAPE_MOTIFS[s.tp]) drawMotifs(ctx, s, g, ds, box);
  else {
    const pat = on && tapePattern(ctx, s.tp, ds);
    if (pat) { ctx.strokeStyle = ctx.fillStyle = pat; ctx.stroke(g.line); ctx.fill(g.teethS); }   // halb durchsichtig: nicht doppelt
  }
  ctx.globalAlpha = 1;
  if (!on) { ctx.setLineDash([5 * DPR / ds, 4 * DPR / ds]); ctx.lineWidth = 1.3 * DPR / ds; ctx.strokeStyle = s.c; ctx.stroke(g.edge); }
  ctx.restore();
}
// Was gezeichnet wird, in welcher Reihenfolge: Bilder, dann Textmarker (unter der Schrift wie auf Papier, außer auf
// einem Tape), dann alles andere wie gelegt; ohne das, was auf einem aufgedeckten Tape geschrieben wurde
const orderCache = new WeakMap();
function tapeInfo(items = S.items) {
  let r = orderCache.get(items); if (r) return r;
  const open = new Set(); for (const it of items) if (it.tp && !covered(it)) open.add(it.id);
  // Tapes liegen immer oben, jedes mit dem, was darauf geschrieben steht (on); on kann auch eine Erklärung meinen
  const img = [], hl = [], rest = [], tapes = [], onTape = new Map(), tapeIds = new Set();
  for (const it of items) if (it.tp) tapeIds.add(it.id);
  for (const it of items) {
    if (it.on && open.has(it.on)) continue;
    if (it.tp) tapes.push(it);
    else if (it.on && tapeIds.has(it.on)) { let l = onTape.get(it.on); if (!l) onTape.set(it.on, l = []); l.push(it); }
    else (it.t === 'i' ? img : it.hl && !it.on ? hl : rest).push(it);
  }
  const top = []; for (const t of tapes) top.push(t, ...(onTape.get(t.id) || []));
  orderCache.set(items, r = { order: [...img, ...hl, ...rest, ...top], open }); return r;
}
const paintOrder = (items = S.items) => tapeInfo(items).order;
// sichtbar (nicht mit einem aufgedeckten Tape verschwunden)
const shown = it => !it.on || !tapeInfo().open.has(it.on);
// oberstes Tape unter (x, y)
function tapeAt(x, y) {
  for (let k = S.items.length - 1; k >= 0; k--) { const it = S.items[k]; if (it.tp && hitStroke(it, x, y, 4 / S.view.z)) return it; }
  return null;
}
// Tapes ab- (hid) oder aufdecken. Kein Bearbeiten: nicht im Verlauf, aber gespeichert
function setTapes(ids, hid) {
  let changed = false;
  const next = S.items.map(it => { if (it.tp && ids.has(it.id) && covered(it) !== hid) { changed = true; return { ...it, hid }; } return it; });
  if (!changed) return false;
  next.sheets = S.items.sheets;
  for (const it of S.items) if (it.on && ids.has(it.on)) invalidateBox(it.bb);   // Schrift auf dem Tape kommt/geht mit
  setItems(next); markDirty(); requestDraw(); return true;
}
function toggleTapeAt(x, y) {
  const t = tapeAt(x, y); if (!t) return false;
  setTapes(new Set([t.id]), !covered(t));
  const n = S.items.find(it => it.id === t.id); if (n) showTapeMenu(n);   // Blase am Tape: einzeln an/aus, entfernen
  return true;
}
/* Blase an einem angetippten Tape: Schalter „Abgedeckt“ für genau dieses Tape und ein Mülleimer. Sie sitzt über dem Tape
   (sonst darunter) und geht beim nächsten Tipp, Werkzeugwechsel oder Verschieben der Ansicht zu. */
let tmTape = null;
function showTapeMenu(t) {
  const m = $('#tapeMenu'); tmTape = t.id;
  for (const x of $$('.menu')) if (x !== m) popOut(x);
  syncTapeMenu(t);
  m.classList.remove('hidden');
  const r = cvLive.getBoundingClientRect(), [x0, y0] = toScreen(t.bb[0], t.bb[1]), [x1, y1] = toScreen(t.bb[2], t.bb[3]);
  const w = m.offsetWidth, h = m.offsetHeight, cx = r.left + clamp((x0 + x1) / 2, 0, r.width), top0 = barBottom() + 8;
  let top = r.top + y0 - h - 10;   // über dem Tape
  if (top < top0) top = r.top + y1 + 10;   // sonst darunter
  m.style.left = clamp(cx - w / 2, 8, innerWidth - w - 8) + 'px';
  m.style.top = clamp(top, top0, innerHeight - h - 8) + 'px';
  popIn(m, { getBoundingClientRect: () => ({ left: cx, top: r.top + (y0 + y1) / 2, width: 0, height: 0 }) });
}
function syncTapeMenu(t) {
  const on = covered(t), b = $('#tmCover');
  b.setAttribute('aria-checked', on ? 'true' : 'false');
  b.title = on ? 'Dieses Tape aufdecken' : 'Dieses Tape wieder abdecken';
  $('#tmPic').replaceChildren(tapeSwatch(t.tp || 'uni', 30, 14, false, t.c));
  const box = $('#tmColors'); box.replaceChildren();
  for (const c of TAPE_PALETTE) {   // Farbe genau dieses Tapes
    const b = document.createElement('button'); b.className = 'tmc' + (t.c === c ? ' on' : ''); b.style.background = colorOf(c);
    b.title = 'Dieses Tape in dieser Farbe'; b.setAttribute('aria-label', 'Farbe dieses Tapes: ' + c); b.onclick = () => recolorTape(c);
    box.appendChild(b);
  }
  const pats = $('#tmPats'), cur = typeof t.tp === 'string' ? t.tp : 'uni'; pats.replaceChildren();
  TAPE_PATTERNS.forEach(([k, name], i) => {   // Muster genau dieses Tapes (in seiner Farbe; Figuren in ihrer)
    const b = document.createElement('button'); b.className = 'tmp' + (cur === k ? ' on' : ''); b.title = name; b.setAttribute('aria-label', 'Muster dieses Tapes: ' + name);
    const c = tapeSwatch(k, 26, 13, cur === k, TAPE_MOTIFS[k] ? null : t.c); c.style.setProperty('--r', TAPE_TILT[i % TAPE_TILT.length] + 'deg');
    b.appendChild(c); b.onclick = () => repatternTape(k); pats.appendChild(b);
  });
}
function repatternTape(k) {
  const t = S.items.find(it => it.id === tmTape && it.tp); if (!t || t.tp === k) return;
  const n = { ...t, tp: k }; if (TAPE_MOTIFS[k]) n.c = TAPE_MOTIFS[k].c;   // Figuren: ihre Farbe gleich mit
  commit(S.items.map(it => it.id === t.id ? n : it)); syncTapeMenu(n);
}
function recolorTape(c) {
  const t = S.items.find(it => it.id === tmTape && it.tp); if (!t || t.c === c) return;
  commit(S.items.map(it => it.id === t.id ? { ...it, c } : it));
  syncTapeMenu(S.items.find(it => it.id === t.id));
}
const hideTapeMenu = () => { const m = $('#tapeMenu'); if (!m.classList.contains('hidden')) popOut(m); };
$('#tmCover').onclick = () => {
  const t = S.items.find(it => it.id === tmTape && it.tp); if (!t) { hideTapeMenu(); return; }
  setTapes(new Set([t.id]), !covered(t));
  syncTapeMenu(S.items.find(it => it.id === t.id) || t);
};
$('#tmDel').onclick = () => {
  const id = tmTape, t = S.items.find(it => it.id === id && it.tp); hideTapeMenu(); if (!t) return;
  for (const it of S.items) if (it.id === id || it.on === id) invalidateBox(it.bb);
  commit(S.items.filter(it => it.id !== id && it.on !== id));   // mit allem, was darauf steht (wie der Radierer)
  toast('Tape entfernt · Rückgängig holt es zurück', 1800);
};

/* ---------- Canvas & Kacheln ----------
   cvMain zeigt Hintergrund + zwischengespeicherte Kacheln (512 px), cvLive den Strich,
   der gerade geschrieben wird, sowie Lasso und Auswahl. */
const cvMain = $('#cvMain'), cvLive = $('#cvLive'), penDot = $('#penDot');
const ctxMain = cvMain.getContext('2d', { alpha: false });
// Wenig Verzögerung beim Schreiben nur im Windows-Programm (Surface): Laut Chrome darf über so einer durchsichtigen Fläche
// nichts liegen, hier liegt die Leiste darüber. Auf Android (Pixel 8) war damit die ganze Notiz schwarz, nur die Leiste zu
// sehen. Im Browser nicht: Mit dem Energiesparmodus von Chromium (Helium 157, „bei Akkubetrieb“) zeigt er die Ebene als
// schwarze Fläche über der ganzen Notiz, sobald der Stift schwebt oder schreibt (und gibt der Seite nur 8 Bilder/s)
const LOW_LATENCY = /Windows/.test(navigator.userAgent) && /Electron\//.test(navigator.userAgent);
const ctxLive = cvLive.getContext('2d', { desynchronized: LOW_LATENCY });
let VW = 0, VH = 0, DPR = 1;
const T = 512, MAX_TILES = 110;
const tiles = new Map();
const tilePool = [];
// Platzhalter: nach einer Änderung (Radieren, Rückgängig, Tape aufdecken …) bleibt die alte Kachel sichtbar, bis die
// neue gezeichnet ist. Ohne sie zeigte die Stelle so lange nur leeres Papier: weiße Rechtecke flackerten auf (vor allem
// über PDF-Seiten, deren Kacheln teuer sind)
const stale = new Map();
let fallbackL = null;
const tkey = (L, i, j) => L + ':' + i + ':' + j;
// Neue Zoomstufe: die bisherige wird Ersatz (ihre Kacheln skaliert, wo die neuen noch fehlen), wenn sie vom Bildschirm
// mindestens so viel abdeckt wie der bisherige Ersatz; sonst bleibt der. In einer Geste wechselt die Stufe mehrmals, und
// die Zwischenstufen haben keine oder nur wenige Kacheln: im Bild direkt nach dem Wechsel malt draw() bis zu 3, je nachdem,
// welcher Finger die Schwelle überschritten hat (je Bild kommt eine Bewegung pro Finger). Mit so einer Ersatzstufe blieb
// fast der ganze Bildschirm unscharfe Übersicht (bei PDFs weißes, ohne Übersicht schwarzes Flackern beim Zoomen).
// Bei gleich viel die neuere Stufe (näher am Zoom, schärfer)
function switchLevel(z) {
  if (fallbackL == null || levelCover(S.level) >= levelCover(fallbackL) - 1) fallbackL = S.level;
  S.level = z;
}
// Fläche der Ansicht (Welt), die Kacheln der Stufe L abdecken (fertige und Platzhalter)
function levelCover(L) {
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(VW, VH); let a = 0;
  for (const m of [tiles, stale]) for (const t of m.values()) if (t.L === L) {
    const w = Math.min(x1, t.wb[2]) - Math.max(x0, t.wb[0]), h = Math.min(y1, t.wb[3]) - Math.max(y0, t.wb[1]);
    if (w > 0 && h > 0) a += w * h;
  }
  return a;
}
function clearTiles() {
  for (const t of tiles.values()) tilePool.push(t); for (const t of stale.values()) tilePool.push(t);
  tiles.clear(); stale.clear(); fallbackL = null; requestDraw();
}
function invalidateBox(b) {
  if (!b) return;
  for (const [k, t] of tiles) if (boxHit(t.wb, b)) {
    tiles.delete(k);
    if (t.L !== S.level) { tilePool.push(t); continue; }
    const old = stale.get(k); if (old) tilePool.push(old);
    stale.set(k, t);
  }
  requestDraw();
}
// v zählt jedes Neuzeichnen der Kachel: daran sieht draw(), welche Plätze auf dem Bildschirm neu gemalt werden müssen
function newTile() {
  const c = document.createElement('canvas'); c.width = c.height = T;
  return { c, ctx: c.getContext('2d', { alpha: false }), v: 0 };
}
function hiddenIds() {
  if (action && action.kind === 'erase') return action.removed;
  if (action && (action.kind === 'move' || action.kind === 'scale')) return S.sel.ids;
  if (action && action.kind === 'bend') return new Set([action.it.id]);   // wird gerade gebogen: die Live-Ebene zeigt sie
  if (txEd && txEd.id) return new Set([txEd.id]);   // wird gerade bearbeitet: das Textfeld zeigt ihn
  return null;
}
function renderTile(L, i, j) {
  const t = tilePool.pop() || newTile(), s = L * DPR;
  t.L = L; t.wb = [i * T / s, j * T / s, (i + 1) * T / s, (j + 1) * T / s]; t.v++;
  paintTile(t, i, j, null);
  const key = tkey(L, i, j), old = stale.get(key);
  if (old) { stale.delete(key); tilePool.push(old); }   // Platzhalter hat ausgedient
  tiles.set(key, t);
  return t;
}
// Kachel malen, ganz oder nur in den Rechtecken clips (Kachelpixel, ein Durchgang für alle): Papier, dann alles darauf
// in der Reihenfolge; gemalt wird nur, was eines der Rechtecke berührt
function paintTile(t, i, j, clips) {
  const L = t.L, s = L * DPR, ctx = t.ctx, x = i * T, y = j * T;
  const wbs = clips && clips.map(c => [(x + c[0]) / s, (y + c[1]) / s, (x + c[2]) / s, (y + c[3]) / s]);
  const wb = wbs ? wbs.reduce((u, q) => [Math.min(u[0], q[0]), Math.min(u[1], q[1]), Math.max(u[2], q[2]), Math.max(u[3], q[3])], [Infinity, Infinity, -Infinity, -Infinity]) : t.wb;
  ctx.save();
  if (clips) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); for (const c of clips) ctx.rect(c[0], c[1], c[2] - c[0], c[3] - c[1]); ctx.clip(); }
  fillBg(ctx, L, -x, -y, T, T);
  ctx.setTransform(s, 0, 0, s, -x, -y);
  const hid = hiddenIds();
  paintItems(ctx, paintOrder(), s, it => {
    if (hid && hid.has(it.id)) return true;
    const b = itemBox(it); if (!boxHit(b, wb)) return true;
    if (wbs && wbs.length > 1) { for (const q of wbs) if (boxHit(b, q)) return false; return true; }
    return false;
  });
  // Cornell, Notizen verdeckt: die Spalte noch einmal, Papier frisch und alles darauf unscharf (die Stichworte bleiben)
  if (S.cornellHide && isCornell()) for (let k = sheetAt(t.wb[1]); k <= sheetAt(t.wb[3]); k++) {
    const f = cornellNotes(k); if (!boxHit(f, t.wb)) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(f[0], f[1], f[2] - f[0], f[3] - f[1]); ctx.clip();
    fillBg(ctx, L, -i * T, -j * T, T, T);
    ctx.setTransform(s, 0, 0, s, -i * T, -j * T); ctx.filter = `blur(${(7 * s).toFixed(1)}px)`;
    paintItems(ctx, paintOrder(), s, it => (hid && hid.has(it.id)) || !boxHit(itemBox(it), f) || !boxHit(itemBox(it), wb));
    ctx.restore();
  }
  ctx.restore();
}
/* Neue Striche in die Kacheln der Ansicht bringen, ohne ganze Kacheln neu zu rastern (das kostete beim Loslassen auf
   dem Surface spürbar Zeit): ein neues Tape liegt über allem und kommt einfach darüber (paintOnTop); sonst werden nur
   Streifen entlang der Striche neu gemalt (bei Füllung der ganze Kasten), mit allem, was dort liegt, in der Reihenfolge.
   Kacheln anderer Zoomstufen werden verworfen, Platzhalter bleiben (sie werden ohnehin ganz neu gemalt) */
function forTiles(bb, fn) {
  for (const [k, t] of [...tiles]) {
    if (!boxHit(t.wb, bb)) continue;
    if (t.L !== S.level) { tiles.delete(k); tilePool.push(t); continue; }
    const [, i, j] = k.split(':').map(Number); fn(t, i, j);
  }
}
function paintOnTop(list) {
  const s = S.level * DPR;
  forTiles(contentBox(list), (t, i, j) => {
    const ctx = t.ctx; ctx.save(); ctx.setTransform(s, 0, 0, s, -i * T, -j * T);
    for (const st of list) if (boxHit(itemBox(st), t.wb)) drawItem(ctx, st, s);
    ctx.restore(); t.v++;
  });
}
function stripRects(st, s) {   // Gerätepixel bei Stufe s: Stücke von höchstens 64 px entlang des Strichs (lange Abschnitte geteilt)
  const p = st.pts, m = (st.hl ? st.w * 0.5 : st.w * 0.8) * s + 3, out = [], CH = 64;
  if (st.t !== 's' || st.fs || !p || p.length < 6) { const b = itemBox(st); return [[Math.floor(b[0] * s) - 3, Math.floor(b[1] * s) - 3, Math.ceil(b[2] * s) + 3, Math.ceil(b[3] * s) + 3]]; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const flush = () => { if (x0 <= x1) out.push([Math.floor(x0 - m), Math.floor(y0 - m), Math.ceil(x1 + m), Math.ceil(y1 + m)]); x0 = y0 = Infinity; x1 = y1 = -Infinity; };
  for (let i = 3; i < p.length; i += 3) {
    const ax = p[i - 3] * s, ay = p[i - 2] * s, bx = p[i] * s, by = p[i + 1] * s, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / CH));
    for (let q = 0; q < n; q++) {
      const ux = ax + (bx - ax) * q / n, uy = ay + (by - ay) * q / n, vx = ax + (bx - ax) * (q + 1) / n, vy = ay + (by - ay) * (q + 1) / n;
      if (Math.max(x1, ux, vx) - Math.min(x0, ux, vx) > CH || Math.max(y1, uy, vy) - Math.min(y0, uy, vy) > CH) flush();
      x0 = Math.min(x0, ux, vx); y0 = Math.min(y0, uy, vy); x1 = Math.max(x1, ux, vx); y1 = Math.max(y1, uy, vy);
    }
  }
  flush(); return out;
}
function repaintStrips(list, within) {   // within: Kästen (Welt), nur der Schnitt der Streifen mit ihnen wird neu gemalt
  const s = S.level * DPR; let rects = list.flatMap(st => stripRects(st, s));
  if (within) {
    const out = [];
    for (const q of rects) for (const b of within) { const r = [Math.max(q[0], Math.floor(b[0] * s) - 2), Math.max(q[1], Math.floor(b[1] * s) - 2), Math.min(q[2], Math.ceil(b[2] * s) + 2), Math.min(q[3], Math.ceil(b[3] * s) + 2)]; if (r[2] > r[0] && r[3] > r[1]) out.push(r); }
    rects = out;
  }
  if (!rects.length) return;
  forTiles(contentBox(list), (t, i, j) => {   // je Kachel ein Durchgang mit allen Streifen darin
    const cs = [];
    for (const q of rects) {
      const c = [Math.max(q[0] - i * T, 0), Math.max(q[1] - j * T, 0), Math.min(q[2] - i * T, T), Math.min(q[3] - j * T, T)];
      if (c[2] > c[0] && c[3] > c[1]) cs.push(c);
    }
    if (!cs.length) return;
    let area = 0; for (const c of cs) area += (c[2] - c[0]) * (c[3] - c[1]);
    if (cs.length > 300 || area > T * T * 4) {   // sehr viel auf einmal (z. B. alles verschoben): wie bisher ganz neu, das ist dann schneller
      const k = tkey(t.L, i, j); tiles.delete(k); const old = stale.get(k); if (old) tilePool.push(old); stale.set(k, t); requestDraw(); return;
    }
    paintTile(t, i, j, cs); t.v++;
  });
}
// Kacheln auf dem Bildschirm (Gerätepixel des Bildschirms, so groß wie cvLive)
function tileRange(L) {
  const k = S.view.z / L, txD = Math.round(S.view.tx * DPR), tyD = Math.round(S.view.ty * DPR);
  const W = cvLive.width, H = cvLive.height;
  return { k, txD, tyD, i0: Math.floor(-txD / k / T), i1: Math.floor((W - txD) / k / T), j0: Math.floor(-tyD / k / T), j1: Math.floor((H - tyD) / k / T) };
}
/* cvMain ist an jeder Seite PADD Gerätepixel größer als der Bildschirm und zeigt die Kacheln so, wie der Bildschirm sie
   bei der Ansicht (orgX, orgY) zeigte (Verschiebung in Gerätepixeln). Ändert sich nur die Verschiebung, schiebt der
   Compositor die Leinwand (transform) um ganze Gerätepixel, statt dass sie bei jedem Bild neu gemalt wird: beim
   Verschieben etwa halb so viel Grafikarbeit, die Pixel sind dieselben. Neu gemalt wird erst, wenn der Rand nicht mehr
   reicht. Beim Zoomen (Kacheln skaliert) ist die Leinwand nur im Bildschirm gültig und folgt jedem Bild. */
let PADD = 0, PADC = 0;   // Rand in Geräte- und CSS-Pixeln; 0 = ohne Rand (wenn er nicht auf ganze Pixel fällt)
let orgX = 0, orgY = 0;
// Bereich von cvMain, der für Ebene L gemalt wird (0 … x1, 0 … y1 in Leinwandpixeln), mit den Kacheln darin.
// wide: mit Rand (Kacheln unskaliert); sonst nur der Bildschirm, oben links in der Leinwand: dann sind es genau die
// Zeichenbefehle wie ohne Rand (skaliert gezeichnete Kacheln rundet die GPU sonst an anderer Stelle minimal anders)
function mainRange(L, wide) {
  const k = S.view.z / L, off = wide ? PADD : 0, txD = orgX + off, tyD = orgY + off;
  const x1 = wide ? cvMain.width : cvLive.width, y1 = wide ? cvMain.height : cvLive.height;
  return { k, off, txD, tyD, x1, y1, i0: Math.floor(-txD / k / T), i1: Math.floor((x1 - txD) / k / T), j0: Math.floor(-tyD / k / T), j1: Math.floor((y1 - tyD) / k / T) };
}
// Was zuletzt auf cvMain steht: Ursprung und Ansicht (shownSig) und je Kachelplatz die Kachel mit ihrem Stand. Bleibt
// beides gleich (Schreiben, Radieren, Rückgängig, Verschieben im Rand …), malt draw() nur die Plätze neu, deren Kachel
// sich geändert hat oder neu da ist, statt jedes Mal den ganzen Bildschirm: spart Grafikarbeit und Akku
let shownSig = '';
const shownSlots = new Map();
cvMain.addEventListener('contextrestored', () => { shownSig = ''; requestDraw(); });
// cur: Ebene L ist die aktuelle (merkt sich die Plätze); only: nur geänderte Plätze malen; r: Bereich (mainRange)
function drawLevel(ctx, L, cur, only, r) {
  if ((r.i1 - r.i0 + 1) * (r.j1 - r.j0 + 1) > 400) return;
  for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
    const key = tkey(L, i, j), fresh = tiles.get(key), t = fresh || stale.get(key); if (!t) continue;
    if (cur && fresh) { tiles.delete(key); tiles.set(key, t); }
    if (cur) {
      const was = shownSlots.get(key);
      if (only && was && was.t === t && was.v === t.v) continue;
      shownSlots.set(key, { t, v: t.v });
    }
    const x0 = Math.floor(i * T * r.k + r.txD), x1 = Math.floor((i + 1) * T * r.k + r.txD);
    const y0 = Math.floor(j * T * r.k + r.tyD), y1 = Math.floor((j + 1) * T * r.k + r.tyD);
    if (r.k === 1) ctx.drawImage(t.c, x0, y0); else ctx.drawImage(t.c, x0, y0, x1 - x0, y1 - y0);
  }
}
const patCache = new Map();
// Papier + Muster; Punkte liegen bei offX + k * Abstand (Gerätepixel).
// Mit Seitenformat: Tisch, darauf die Blätter mit leichtem Schatten, das Muster passend in jedem Feld.
function fillBg(ctx, z, offX, offY, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const ps = paperSize();
  if (!ps) { ctx.fillStyle = paperColor(); ctx.fillRect(0, 0, W, H); fillPattern(ctx, z, offX, offY, W, H); return; }
  const s = z * DPR, m = 40 * DPR, step = (ps[1] + GAP) * s, n = sheetCount();
  ctx.fillStyle = deskColor(); ctx.fillRect(0, 0, W, H);
  if (offX > W + m || offX + ps[0] * s < -m) return;
  const k0 = clamp(Math.floor((-offY - m) / step), 0, n - 1), k1 = clamp(Math.floor((H - offY + m) / step), 0, n - 1);
  for (let k = k0; k <= k1; k++) {
    const r = sheetRect(k), x = offX + r[0] * s, y = offY + r[1] * s, w = (r[2] - r[0]) * s, h = (r[3] - r[1]) * s;
    if (y > H + m || y + h < -m) continue;
    ctx.save();
    ctx.shadowColor = S.dark ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.16)'; ctx.shadowBlur = 16 * DPR; ctx.shadowOffsetY = 3 * DPR;
    ctx.fillStyle = paperColor(); ctx.fillRect(x, y, w, h);
    ctx.restore();
    const pad = 3 * DPR, cor = isCornell() ? cornellOf(k) : null;   // Punkte und Linien am Rand des Felds ganz zeigen
    if (cor) cornellTint(ctx, cor, s, offX, offY);
    for (const f of fieldsOf(k)) {
      const top = cor ? offY + cor.head * s + pad : offY + f[1] * s - pad;   // Cornell: der Kopf bleibt ohne Muster
      ctx.save(); ctx.beginPath(); ctx.rect(offX + f[0] * s - pad, top, (f[2] - f[0]) * s + 2 * pad, offY + f[3] * s + pad - top); ctx.clip();
      fillPattern(ctx, z, offX + f[0] * s, offY + f[1] * s, W, H);
      ctx.restore();
    }
    if (cor) drawCornell(ctx, cor, s, offX, offY);
  }
}
function fillPattern(ctx, z, offX, offY, W, H) {
  const bg = S.note.bg || 'dots'; if (bg === 'blank') return;
  let sp = (bg === 'lines' ? 34 : 28) * z; while (sp < 14) sp *= 2;
  const spD = sp * DPR, C = Math.max(4, Math.round(spD)), f = C / spD;
  const rD = clamp(1.25 * Math.sqrt(z), 0.8, 2.2) * DPR, lw = Math.max(1, DPR * 0.8);
  const key = bg + '|' + C + '|' + (bg === 'dots' ? rD.toFixed(2) : lw) + '|' + S.dark;
  let pat = patCache.get(key);
  if (!pat) {
    const c = document.createElement('canvas'); c.width = c.height = C;
    const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = patternColor();
    if (bg === 'dots') { g.beginPath(); g.arc(C / 2, C / 2, rD * f, 0, 6.2832); g.fill(); }
    else { g.globalAlpha = 0.75; g.fillRect(0, C / 2 - lw * f / 2, C, lw * f); if (bg === 'grid') g.fillRect(C / 2 - lw * f / 2, 0, lw * f, C); }
    if (patCache.size > 24) patCache.clear();
    pat = ctxMain.createPattern(c, 'repeat'); patCache.set(key, pat);
  }
  const ox = (offX % spD + spD) % spD, oy = (offY % spD + spD) % spD;
  pat.setTransform(new DOMMatrix([1 / f, 0, 0, 1 / f, ox - spD / 2, oy - spD / 2]));
  ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
}
let drawQ = false, liveQ = false;
function requestDraw() { if (!drawQ) { drawQ = true; requestAnimationFrame(() => { if (drawQ) draw(); }); } }
function requestLive() { if (!liveQ) { liveQ = true; requestAnimationFrame(drawLive); } }
function draw() {
  drawQ = false; if (!S.note) return;
  frameNo++;
  const ctx = ctxMain, L = S.level, txD = Math.round(S.view.tx * DPR), tyD = Math.round(S.view.ty * DPR);
  // Ursprung behalten, solange der Bildschirm (Kacheln unskaliert) ganz im Rand liegt; sonst hierher legen
  const wide = PADD > 0 && S.view.z === L;
  if (!wide || Math.abs(txD - orgX) > PADD || Math.abs(tyD - orgY) > PADD) { orgX = txD; orgY = tyD; }
  const r = mainRange(L, wide), sr = tileRange(L), missing = [];
  let have = 0;
  for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) if (!tiles.has(tkey(L, i, j))) missing.push([i, j]); else have++;
  if (missing.length) {
    const ci = (cvLive.width / 2 - sr.txD) / sr.k / T - 0.5, cj = (cvLive.height / 2 - sr.tyD) / sr.k / T - 0.5;
    missing.sort((a, b) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b[0] - ci, b[1] - cj));
    // Geänderte Kacheln (mit Platzhalter) zuerst und gleich alle: die Änderung erscheint in einem Bild, nicht stückweise
    // (höchstens 150 ms, der Rest bleibt solange Platzhalter)
    const t00 = performance.now();
    for (let k = 0; k < missing.length;) {
      const [i, j] = missing[k];
      if (stale.has(tkey(L, i, j)) && performance.now() - t00 < 150) { renderTile(L, i, j); missing.splice(k, 1); } else k++;
    }
    // Beim Öffnen alles sofort zeichnen, beim Verschieben/Zoomen nur wenige ms pro Bild (Rest folgt)
    const first = have === 0 && fallbackL == null;
    // mitten im Zoomen (Stufe passt nicht): Kacheln der alten Stufe würden gleich verworfen; die Ränder zeigt die Übersicht
    const zooming = (gesture || wheelT) && S.view.z !== L, ovOk = !!ov && ov.note === S.note && ov.items === S.items && ov.dark === S.dark;
    const t0 = performance.now(), budget = first ? 250 : 7, maxN = first ? Infinity : zooming ? (ovOk ? 0 : 1) : (gesture || wheelT ? 3 : 8);
    let done = 0;
    while (missing.length && done < maxN && performance.now() - t0 < budget) { const [i, j] = missing.shift(); renderTile(L, i, j); done++; }
  }
  // Platzhalter außerhalb des Bilds oder einer anderen Zoomstufe werden nicht mehr gebraucht (beim Zurückscrollen
  // zeigten sie sonst einen alten Stand)
  for (const [k, t] of stale) {
    const [, si, sj] = k.split(':').map(Number);
    if (t.L !== L || si < r.i0 || si > r.i1 || sj < r.j0 || sj > r.j1) { stale.delete(k); tilePool.push(t); }   // r: mit Rand
  }
  // Papier (und die vorige Zoomstufe) nur dort nötig, wo eine Kachel ganz fehlt; sonst decken die Kacheln alles ab.
  // Fehlt eine nur im Rand, bekommt der Platz beim ganzen Malen Papier und später seine Kachel (nur geänderte Plätze);
  // fehlt eine auf dem Bildschirm, wird wie bisher jedes Bild ganz gemalt, bis sie da ist
  const many = (r.i1 - r.i0 + 1) * (r.j1 - r.j0 + 1) > 400, gap = ([i, j]) => !stale.has(tkey(L, i, j));
  const seen = ([i, j]) => i >= sr.i0 && i <= sr.i1 && j >= sr.j0 && j <= sr.j1;
  const gaps = many || missing.some(q => gap(q) && seen(q)), anyGaps = many || missing.some(gap);
  const sig = [L, S.view.z, r.txD, r.tyD, wide, cvMain.width, cvMain.height].join('|'), only = !gaps && sig === shownSig;
  if (!only) {
    shownSlots.clear(); shownSig = gaps ? '' : sig;
    if (anyGaps) {
      fillBg(ctx, S.view.z, r.txD, r.tyD, r.x1, r.y1);   // beim Zoomen nur der Bildschirm
      drawOverview(ctx, r);                              // wo noch keine Kachel ist: die unscharfe Übersicht
      if (fallbackL != null && fallbackL !== L) drawLevel(ctx, fallbackL, false, false, mainRange(fallbackL, wide));
    }
  }
  drawLevel(ctx, L, true, only, r);
  // Leinwand an die Ansicht schieben (ganze Gerätepixel; die Leinwand liegt um den Rand nach oben links versetzt)
  const dx = txD - orgX + PADD - r.off, dy = tyD - orgY + PADD - r.off;
  const mt = dx || dy ? `translate(${dx / DPR}px, ${dy / DPR}px)` : '';   // so, wie der Browser es zurückgibt
  if (cvMain.style.transform !== mt) cvMain.style.transform = mt;
  if (missing.length) requestDraw();
  else { if (fallbackL != null && !gesture && !wheelT) fallbackL = null; schedulePrefetch(); }
  overviewCheck();
  // älteste Kacheln verwerfen
  for (const [k, t] of tiles) { if (tiles.size <= MAX_TILES) break; tiles.delete(k); tilePool.push(t); }
  if (tilePool.length > 40) tilePool.length = 40;
  const zt = Math.round(S.view.z * 100) + ' %', ze = $('#zoom'); if (ze.textContent !== zt) ze.textContent = zt;
  if (paperSize()) { const t = (currentSheet() + 1) + ' / ' + sheetCount(), el = $('#sheetNo'); if (el.textContent !== t) el.textContent = t; }
  placeSelbar();
  if (action && action.kind === 'shape') requestLive();   // Formvorschau enthält Kachelpixel: mitziehen
}
// In Ruhepausen die Kacheln rund um den sichtbaren Bereich vorab zeichnen
let prefetchQ = false;
const idle = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8 }), 50));
function schedulePrefetch() {
  if (prefetchQ) return; prefetchQ = true;
  idle(dl => {
    prefetchQ = false;
    if (!S.note || gesture || action || S.view.z !== S.level) return;
    const L = S.level, r = tileRange(L), ring = [];
    for (let j = r.j0 - 1; j <= r.j1 + 1; j++) for (let i = r.i0 - 1; i <= r.i1 + 1; i++) if (!tiles.has(tkey(L, i, j))) ring.push([i, j]);
    let done = 0;
    while (ring.length && done < 4 && dl.timeRemaining() > 4) { const [i, j] = ring.shift(); renderTile(L, i, j); done++; }
    if (ring.length) schedulePrefetch();
  }, { timeout: 1000 });
}
/* Unscharfe Übersicht der ganzen Seite: alle Striche und Bilder einmal klein (höchstens OV_PX Pixel Fläche und OV_DIM
   je Seite). Wo beim Rauszoomen oder schnellen Verschieben noch Kacheln fehlen, zeigt draw() sie vergrößert statt leerem
   Papier, bis die scharfen Kacheln da sind. Begrenzt wird die Fläche, nicht die längste Seite: bei einer langen Notiz
   (54 PDF-Folien untereinander) war eine Folie mit 1536 px für die ganze Höhe nur 26 px breit und beim Zoomen ein weißer
   Fleck; jetzt etwa 140 px. Kosten für den Akku: beim Schreiben kommen nur die neuen Striche dazu; nach anderen
   Änderungen (Radieren, Verschieben, Rückgängig …) wird sie erst nach 1,2 s Ruhe im Leerlauf neu gezeichnet, in Stücken. */
const OV_PX = 3e6, OV_DIM = 8192;
let ov = null, ovT = 0;   // ov: { c, box, s, items, note, dark }
function overviewCheck() {
  if (!S.note || ovT || (ov && ov.note === S.note && ov.items === S.items && ov.dark === S.dark)) return;
  const same = ov && ov.note === S.note;
  ovT = setTimeout(() => { ovT = 0; idle(buildOverview, { timeout: 4000 }); }, same ? 1200 : 300);
}
function dropOverview() { if (ov) { ov.c.width = ov.c.height = 0; ov = null; } clearTimeout(ovT); ovT = 0; }
function buildOverview(dl) {
  const items = S.items, note = S.note, dark = S.dark;
  if (!note) return;
  if (gesture || action) { overviewCheck(); return; }
  // beim Schreiben: die bisherigen Striche stehen unverändert vorne, die neuen liegen im Rechteck der Übersicht
  if (ov && ov.note === note && ov.dark === dark && ov.items.length < items.length && ov.items.every((it, k) => items[k] === it)) {
    const add = new Set(items.slice(ov.items.length)), b = ov.box;
    if ([...add].every(it => { const q = itemBox(it); return q[0] >= b[0] && q[1] >= b[1] && q[2] <= b[2] && q[3] <= b[3]; })) {
      const ctx = ov.c.getContext('2d'); ctx.setTransform(ov.s, 0, 0, ov.s, -b[0] * ov.s, -b[1] * ov.s);
      for (const it of paintOrder(items)) if (add.has(it)) drawItem(ctx, it, ov.s);
      ov.items = items; return;
    }
  }
  const cb = contentBox(items);
  if (!cb) { dropOverview(); return; }
  // Rahmen mit Reserve, damit Weiterschreiben (nächste Zeile darunter) meist nur dazukommt statt alles neu zu zeichnen:
  // DIN-Seiten alle Blätter, unendliche Fläche ein Viertel der Größe rundum (400 bis 1500: bei einer langen Notiz sonst
  // vor allem leerer Rand, eine 43 000 hohe Notiz bekam rundum 10 800)
  let box;
  if (paperSize()) { const a = sheetRect(0), z = sheetRect(sheetCount() - 1); box = [Math.min(cb[0], a[0]) - 24, Math.min(cb[1], a[1]) - 24, Math.max(cb[2], z[2]) + 24, Math.max(cb[3], z[3]) + 24]; }
  else { const m = clamp(Math.max(cb[2] - cb[0], cb[3] - cb[1]) / 4, 400, 1500); box = [cb[0] - m, cb[1] - m, cb[2] + m, cb[3] + m]; }
  const w = box[2] - box[0], h = box[3] - box[1];
  const s = Math.min(1, Math.sqrt(OV_PX / (w * h)), OV_DIM / w, OV_DIM / h), c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * s - 1e-6)); c.height = Math.max(1, Math.ceil(h * s - 1e-6));   // 8192,0000001 ist 8192
  const ctx = c.getContext('2d'); ctx.setTransform(s, 0, 0, s, -box[0] * s, -box[1] * s);
  const order = paintOrder(items); let k = 0;
  const step = d => {
    if (S.items !== items || S.note !== note || S.dark !== dark) { c.width = c.height = 0; overviewCheck(); return; }   // inzwischen geändert
    do { for (let n = 0; n < 150 && k < order.length; n++) drawItem(ctx, order[k++], s); } while (k < order.length && d.timeRemaining() > 3);
    if (k < order.length) { idle(step, { timeout: 2000 }); return; }
    if (ov) ov.c.width = ov.c.height = 0;
    ov = { c, box, s, items, note, dark };
  };
  step(dl);
}
// unter die Kacheln der Ansicht (r: Bereich von cvMain wie bei drawLevel)
function drawOverview(ctx, r) {
  if (!ov || ov.note !== S.note || ov.dark !== S.dark) return;
  const z = S.view.z * DPR, x = ov.box[0] * z + r.txD, y = ov.box[1] * z + r.tyD, w = (ov.box[2] - ov.box[0]) * z, h = (ov.box[3] - ov.box[1]) * z;
  if (x > r.x1 || y > r.y1 || x + w < 0 || y + h < 0) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ov.c, x, y, w, h);
}
// Die Live-Ebene merkt sich, wo etwas auf ihr steht (liveBB, Rechteck in Gerätepixeln; null = leer), und leert nur
// dieses Rechteck. Leeren kostet auf dem Surface (Adreno) Grafikzeit je Fläche, den ganzen Bildschirm etwa 7 ms – beim
// Radieren, Lasso, Tape und Verschieben einer Auswahl bei jedem Bild. clearRect auf einem Teil ist dort so teuer wie auf
// allem; Übermalen mit „destination-out“ auf ganzen Pixeln ergibt genau dasselbe (durchsichtig) und kostet nur die Fläche.
// Wer auf ctxLive zeichnet, meldet den Bereich mit liveMark (Welt) oder liveMarkDev (Gerätepixel), lieber zu groß.
let liveBB = null;
function liveMarkDev(x0, y0, x1, y1) {
  const b = liveBB;
  liveBB = b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1];
  liveVis();
}
// Rechteck in Weltkoordinaten, dazu m Gerätepixel Rand (Kantenglättung)
function liveMark(x0, y0, x1, y1, m = 3) {
  const { tx, ty, z } = S.view, k = z * DPR;
  liveMarkDev(x0 * k + tx * DPR - m, y0 * k + ty * DPR - m, x1 * k + tx * DPR + m, y1 * k + ty * DPR + m);
}
function liveClear() {
  const b = liveBB; if (!b) return; liveBB = null;
  const W = cvLive.width, H = cvLive.height, g = ctxLive;
  const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(W, Math.ceil(b[2])), y1 = Math.min(H, Math.ceil(b[3]));
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (x1 > x0 && y1 > y0) {
    if (x0 === 0 && y0 === 0 && x1 === W && y1 === H) g.clearRect(0, 0, W, H);
    else {
      g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; g.fillStyle = '#000'; g.shadowColor = 'transparent'; g.filter = 'none';
      g.fillRect(x0, y0, x1 - x0, y1 - y0); g.restore();
    }
  }
  liveVis();
}
/* Ist die Live-Ebene leer und schwebt kein Stift (und keine Maus) über der Fläche, ist sie ausgeblendet: opacity 0, sie
   bekommt weiter alle Eingaben. Sonst setzt der Compositor die durchsichtige Fläche über der ganzen Notiz bei jedem Bild
   mit ein, beim Verschieben mit dem Finger etwa ein Drittel der Grafikzeit. Schwebt ein Stift, bleibt sie sichtbar: der
   erste Punkt eines Strichs erscheint ohne Verzögerung (das Einblenden bräuchte ein Bild). Ein Stift gilt nach dem
   Verlassen noch 1,5 s als da, eine Maus, solange sie sich in den letzten 10 s bewegt hat; mit dem Finger zeichnen:
   immer sichtbar. */
let liveOpacity = '';            // Deckkraft beim Schreiben (Textmarker)
const hovers = new Map();        // pointerId -> Zeitgeber fürs Vergessen (0: ist da)
function liveVis() {
  const o = liveBB || action || hovers.size || S.fingerDraw ? liveOpacity : '0';
  if (cvLive.style.opacity !== o) cvLive.style.opacity = o;
}
function hoverIn(e) {
  if (e.pointerType === 'touch' || (e.pointerType === 'mouse' && performance.now() < penActiveUntil)) return;   // vom Stift ausgelöste Mausbewegung
  const t = hovers.get(e.pointerId), mouse = e.pointerType === 'mouse';
  if (t === 0 && !mouse) return;
  clearTimeout(t);
  hovers.set(e.pointerId, mouse ? setTimeout(() => forget(e.pointerId), 10000) : 0);
  liveVis();
}
function hoverOut(e) {
  if (!hovers.has(e.pointerId)) return;
  clearTimeout(hovers.get(e.pointerId)); hovers.set(e.pointerId, setTimeout(() => forget(e.pointerId), 1500));
}
function forget(id) { hovers.delete(id); liveVis(); }
// Textmarker und Stift mit Deckkraft: die Live-Ebene zeigt den Strich deckend und ist selbst durchsichtig, so wird er
// beim Schreiben nicht dort dunkler, wo sich seine Stücke überlappen
function liveStyle(a) {
  const al = a ? strokeAlpha(a) : 1;
  liveOpacity = al < 1 ? String(al) : '';
  cvLive.style.mixBlendMode = a && a.hl && !S.dark ? 'multiply' : '';
  liveVis();
}
function liveWorld() { const { tx, ty, z } = S.view; ctxLive.setTransform(DPR * z, 0, 0, DPR * z, DPR * tx, DPR * ty); }
// Ausdehnung von Punkten (x, y, Druck) mit Rand m in Weltkoordinaten, ab Punkt i0
function markPts(pts, m, i0 = 0) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = i0 * 3; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1]; if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  if (a <= c) liveMark(a - m, b - m, c + m, d + m);
}
function drawLive() {
  liveQ = false;
  if (action && action.kind === 'draw') {   // der Strich wird direkt gezeichnet
    const a = action, { tx, ty, z } = S.view, k = DPR * z, ox = DPR * tx, oy = DPR * ty;
    if (a.hlInc && !a.redraw) { hlLivePage(a); return; }   // Textmarker: nur, was sich ändert
    if (!a.redraw) return;
    if (a.tape && tapTiny(a.raw || a.start, a.start, a.pts, z)) return;   // Tape: erst nach mehr als einem Antippen
    if (a.tape && !a.straight) { const R = tapeLive(ctxLive, a, k, ox, oy, a.pts); liveMarkDev(R[0], R[1], R[2], R[3]); return; }
    liveClear(); liveWorld();   // Geraden: jedes Mal ganz
    const pts = a.straight ? straightPts(a) : a.pts;
    if (a.tape) { markPts(pts, a.w * 1.5); drawTape(ctxLive, { pts, w: a.w, c: a.c, tp: a.tp, live: true }, k); }
    else if (a.hl) { const R = hlLive(ctxLive, { pts, w: a.w, c: a.c, cut: a.cut }, k, ox, oy); if (R) liveMarkDev(R[0], R[1], R[2], R[3]); }
    else { markPts(pts, a.w); ctxLive.fillStyle = colorOf(a.c); ctxLive.fill(buildPath(pts, a.w, false)); }
    return;
  }
  liveClear();
  if (!S.sel && !(action && (action.kind === 'shape' || action.kind === 'lasso' || action.kind === 'erase' || action.kind === 'bend'))) return;
  liveWorld();
  const ctx = ctxLive, z = S.view.z, blue = S.dark ? '#8fb0ff' : '#2f6fed';
  if (action && action.kind === 'bend') {   // gebogene Form mit ihrem Kasten und dem Punkt
    const s = action.tmp || action.it, b = s.bb; liveMark(b[0], b[1], b[2], b[3]);
    drawItem(ctx, s, DPR * z);
    ctx.setLineDash([6 / z, 5 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = blue; const g = contentBox([s]);
    liveMark(g[0] - 2 / z, g[1] - 2 / z, g[2] + 2 / z, g[3] + 2 / z); ctx.strokeRect(g[0], g[1], g[2] - g[0], g[3] - g[1]); ctx.setLineDash([]);
    drawEditHandles(ctx, s, z, blue); return;
  }
  if (action && action.kind === 'shape') liveShape(action);
  if (action && action.kind === 'lasso' && action.pts.length > 2) {
    const p = action.pts; let x0 = p[0], y0 = p[1], x1 = x0, y1 = y0;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) { ctx.lineTo(p[i], p[i + 1]); x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    ctx.closePath(); liveMark(x0 - 2 / z, y0 - 2 / z, x1 + 2 / z, y1 + 2 / z);
    ctx.fillStyle = 'rgba(80,130,255,.08)'; ctx.fill();
    ctx.setLineDash([6 / z, 5 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = blue; ctx.stroke(); ctx.setLineDash([]);
  }
  if (action && action.kind === 'erase' && action.at) {
    const [x, y] = action.at, r = (ERASE_R + 1) / z; liveMark(x - r, y - r, x + r, y + r);
    ctx.beginPath(); ctx.arc(x, y, ERASE_R / z, 0, 6.2832);
    ctx.lineWidth = 1 / z; ctx.strokeStyle = S.dark ? '#aaa' : '#777'; ctx.stroke();
  }
  if (S.sel) {
    let [a0, b0, a1, b1] = S.sel.bb;
    const mv = action && (action.kind === 'move' || action.kind === 'scale');
    if (mv) {
      const a = action;
      if (a.bmp) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        let x, y, w = a.bmp.c.width, h = a.bmp.c.height;
        if (a.kind === 'move') { x = (a.bmp.sx + a.dx * z) * DPR; y = (a.bmp.sy + a.dy * z) * DPR; ctx.drawImage(a.bmp.c, x, y); }
        else { const [ax, ay] = toScreen(...a.anchor); x = (ax + (a.bmp.sx - ax) * a.s) * DPR; y = (ay + (a.bmp.sy - ay) * a.s) * DPR; w *= a.s; h *= a.s; ctx.drawImage(a.bmp.c, x, y, w, h); }
        liveMarkDev(x - 2, y - 2, x + w + 2, y + h + 2);
        liveWorld();
      } else {
        ctx.save();
        if (a.kind === 'move') { ctx.translate(a.dx, a.dy); liveMark(a0 + a.dx, b0 + a.dy, a1 + a.dx, b1 + a.dy); }
        else {
          const [ax, ay] = a.anchor, f = v => v * a.s; ctx.translate(ax, ay); ctx.scale(a.s, a.s); ctx.translate(-ax, -ay);
          liveMark(ax + f(a0 - ax), ay + f(b0 - ay), ax + f(a1 - ax), ay + f(b1 - ay));
        }
        paintItems(ctx, paintOrder(), DPR * z * (a.s || 1), it => !S.sel.ids.has(it.id));
        ctx.restore();
      }
      if (a.kind === 'move') { a0 += a.dx; a1 += a.dx; b0 += a.dy; b1 += a.dy; }
      else { const [ax, ay] = a.anchor; a1 = ax + (a1 - ax) * a.s; b1 = ay + (b1 - ay) * a.s; }
    }
    const m = 11 / z;   // Griff: Radius 9, Rand 2
    liveMark(Math.min(a0, a1) - m, Math.min(b0, b1) - m, Math.max(a0, a1) + m, Math.max(b0, b1) + m);
    ctx.setLineDash([6 / z, 5 / z]); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = blue;
    ctx.strokeRect(a0, b0, a1 - a0, b1 - b0); ctx.setLineDash([]);
    if (!(S.sel.auto && S.tool === 'shape')) {   // Griff zum Skalieren (nicht an der eben gezeichneten Form)
      ctx.beginPath(); ctx.arc(a1, b1, 9 / z, 0, 6.2832); ctx.fillStyle = blue; ctx.fill();
      ctx.lineWidth = 2 / z; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    const et = !mv && editTarget(); if (et) drawEditHandles(ctx, et, z, blue);
  }
}
// Rand von cvMain: etwa 384 Gerätepixel, so gewählt, dass er in CSS- und in Gerätepixeln ganz aufgeht (sonst läge die
// Leinwand zwischen den Pixeln und würde unscharf); [CSS, Gerät], [0, 0] = ohne Rand
function padFor(dpr) {
  for (let c = Math.round(384 / dpr); c >= 64; c--) { const d = c * dpr; if (Math.abs(d - Math.round(d)) < 1e-6) return [c, Math.round(d)]; }
  return [0, 0];
}
function resize() {
  const oldDPR = DPR;
  DPR = window.devicePixelRatio || 1;
  const r = $('#stage').getBoundingClientRect(); VW = r.width; VH = r.height;
  const w = Math.round(VW * DPR), h = Math.round(VH * DPR);
  [PADC, PADD] = padFor(DPR);
  if (cvLive.width !== w || cvLive.height !== h) {
    cvLive.width = w; cvLive.height = h;
    liveBB = null;   // neue Größe: die Live-Ebene ist leer
    if (action && action.kind === 'draw') { action.noComposite = true; endAction(false); }
  }
  if (cvMain.width !== w + 2 * PADD || cvMain.height !== h + 2 * PADD) { cvMain.width = w + 2 * PADD; cvMain.height = h + 2 * PADD; shownSig = ''; }
  const ms = cvMain.style; ms.left = ms.top = -PADC + 'px'; ms.width = VW + 2 * PADC + 'px'; ms.height = VH + 2 * PADC + 'px';
  if (oldDPR !== DPR) { clearTiles(); patCache.clear(); }
  if (ncCur) { drawNoteInk(); placeNoteCard(); } else closeMenus();
  if (txEd) styleTextEd();   // Text bleibt offen (Bildschirmtastatur)   // offene Erklärung: bleibt (Bildschirmtastatur), Schreibfläche passt sich an
  fitBar();
  if (S.note) { S.view.tx = snap(S.view.tx); S.view.ty = snap(S.view.ty); draw(); drawLive(); }
  liveVis();
}
new ResizeObserver(resize).observe($('#stage'));
(function watchDPR() {
  const mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener('change', () => { resize(); watchDPR(); }, { once: true });
})();

const toWorld = (sx, sy) => [(sx - S.view.tx) / S.view.z, (sy - S.view.ty) / S.view.z];
const toScreen = (wx, wy) => [wx * S.view.z + S.view.tx, wy * S.view.z + S.view.ty];
const snap = v => Math.round(v * DPR) / DPR;

// Hintergrund als Pfad, für Export und Vorschaubild
function drawBg(ctx, bg, view, W, H, scale) {
  if (bg === 'blank') return;
  const { tx, ty, z } = view;
  let sp = (bg === 'lines' ? 34 : 28) * z;
  while (sp < 14) sp *= 2;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const ox = ((tx % sp) + sp) % sp - sp, oy = ((ty % sp) + sp) % sp - sp;
  ctx.fillStyle = ctx.strokeStyle = patternColor();
  if (bg === 'dots') {
    const r = clamp(1.25 * Math.sqrt(z), 0.8, 2.2);
    ctx.beginPath();
    for (let x = ox; x < W + sp; x += sp) for (let y = oy; y < H + sp; y += sp) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
    ctx.fill();
  } else {
    ctx.lineWidth = Math.max(1, scale * 0.8) / scale; ctx.beginPath();
    if (bg === 'grid') for (let x = ox; x < W + sp; x += sp) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy; y < H + sp; y += sp) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.globalAlpha = 0.75; ctx.stroke(); ctx.globalAlpha = 1;
  }
}

/* ---------- Ansicht ---------- */
let wheelT = null;
function setView(tx, ty, z, settle) {
  S.view.tx = snap(tx); S.view.ty = snap(ty); S.view.z = z;
  if (txEd) styleTextEd();   // Textfeld wandert mit (Zoom mit Rad oder Tasten)
  placeCornellBtn(); hideTapeMenu();
  if (action && action.kind === 'draw') {   // Ansicht ändert sich während des Schreibens: Strich neu zeichnen
    const a = action; a.noComposite = true; liveClear(); a.drawn = 0;
    if (a.redraw) { a.tapeT0 = null; requestLive(); }
    else if (a.hlInc) { a.hlB = null; if (a.hl) a.cut = hlCutPage(strokeAlpha(a)); hlLivePage(a); }
    else { liveWorld(); ctxLive.fillStyle = colorOf(a.c); livePiece(a); }
  }
  if (settle) settleZoom();
  else if (z / S.level < 0.6 || z / S.level > 1.8) switchLevel(z);
  requestDraw(); if (S.sel || (action && action.kind !== 'draw')) requestLive();
  viewChanged();
}
function settleZoom() {
  if (S.level !== S.view.z) { switchLevel(S.view.z); requestDraw(); }
}
function zoomAt(sx, sy, nz, settle = true) {
  nz = clamp(nz, 0.1, 8);
  const [wx, wy] = toWorld(sx, sy);
  setView(sx - wx * nz, sy - wy * nz, nz, settle);
}
function contentBox(items = S.items) {
  if (!items.length) return null;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const it of items) { const q = itemBox(it); if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[2] > b[2]) b[2] = q[2]; if (q[3] > b[3]) b[3] = q[3]; }
  return b;
}
// Unterkante der Leiste; mit Formen darunter die der Formenleiste (Menüs, Blasen und „Alles anzeigen“ beginnen darunter)
// (aus dem Layout, nicht aus der Lage während des Aufploppens: #editor liegt fest bei 0, 0)
function barBottom() { const sb = $('#shapeBar'); return sb.classList.contains('hidden') || sb.dataset.closing ? (barGeo ? barGeo.bottom : $('#bar').getBoundingClientRect().bottom) : (parseFloat(sb.style.top) || 0) + (shapeBarWH ? shapeBarWH[1] : sb.offsetHeight); }
// Blatt in der Mitte des Bildschirms
function currentSheet() { return sheetAt(viewCenterWorld()[1]); }
// mit Seitenformat: das ganze Blatt in der Mitte (oder Blatt k), sonst alles Beschriebene
function fitAll(k) {
  const b = paperSize() ? sheetRect(k === undefined ? currentSheet() : k) : contentBox();
  if (!b) { setView(0, 0, 1, true); return; }
  const top = barBottom() + 20;
  const w = b[2] - b[0], h = b[3] - b[1];
  const z = clamp(Math.min((VW - 80) / w, (VH - top - 40) / h), 0.1, 2);
  setView(VW / 2 - (b[0] + w / 2) * z, top + (VH - top) / 2 - (b[1] + h / 2) * z, z, true);
}

/* ---------- Änderungen & Verlauf ---------- */
// Neue Liste übernehmen; geänderte Bereiche der Kacheln werden neu gezeichnet
function setItems(next, inval = true) {
  let changed = null;
  if (inval) {
    const oldSet = new Set(S.items), newSet = new Set(next); changed = [];
    for (const it of next) if (!oldSet.has(it)) changed.push(it);
    for (const it of S.items) if (!newSet.has(it)) changed.push(it);
  }
  S.items = next;
  if (changed) repaintItems(changed);   // mit der neuen Liste: wo etwas weg ist, kommt, oder sich ändert
}
// Kacheln dort neu, wo diese Dinge liegen oder lagen: nur Streifen (repaintStrips) statt ganzer Kacheln; ganze Kacheln wie
// bisher mitten im Zoomen, bei verdeckten Cornell-Notizen und für Erklärungen (ihr „i“ ragt über den Kasten)
function repaintItems(list) {
  if (!list.length) return;
  const strips = S.view.z === S.level && !(S.cornellHide && isCornell()) ? list.filter(it => !it.nt) : [];
  if (strips.length) { repaintStrips(strips); requestDraw(); }
  for (const it of list) if (!strips.includes(it)) invalidateBox(itemBox(it));
}
// Jeder Stand im Verlauf merkt sich die Zahl der Blätter (Blatt anhängen, PDF einfügen: Rückgängig nimmt die Blätter mit)
// Eine Erklärung ohne ihre Stelle: Ist mit dieser Änderung das Letzte weg, was sie markiert (Radierer, Text löschen,
// Tape entfernen …), geht sie mit; solange noch etwas davon da ist, bleibt sie. Rückgängig holt beides zurück
function dropOrphanNotes(prev, next) {
  let notes = null; for (const it of next) if (it.nt) (notes || (notes = new Set())).add(it.id);
  if (!notes) return next;
  const still = new Set(); for (const it of next) if (it.on && notes.has(it.on)) still.add(it.on);
  const gone = new Set(); for (const it of prev) if (it.on && notes.has(it.on) && !still.has(it.on)) gone.add(it.on);
  if (!gone.size) return next;
  for (const it of next) if (gone.has(it.id)) invalidateBox(itemBox(it));   // das „i“ verschwindet auch ohne Neuzeichnen der Änderung
  return next.filter(it => !gone.has(it.id));
}
function commit(next, inval = true, sheets) {
  if (S.items.sheets === undefined) S.items.sheets = sheetCount();
  if (next.length < S.items.length) next = dropOrphanNotes(S.items, next);   // etwas ist weg: Erklärung ohne Stelle mit
  next.sheets = sheets || S.items.sheets;
  S.undo.push(S.items); if (S.undo.length > 150) S.undo.shift();
  S.redo = []; setItems(next, inval); setSheets(next.sheets); markDirty(); requestDraw(); updateUndo(); prunePaths();
}
function setSheets(n) { if (!S.note || !S.note.paper || !n || sheetCount() === n) return; S.note.paper.n = n; clearTiles(); }
function stepHistory(from, to) {
  if (ncCur) closeMenus();   // offene Erklärung erst speichern
  if (txEd) commitText();   // offener Text ebenso
  cancelAction(); if (!from.length) return;
  if (S.items.sheets === undefined) S.items.sheets = sheetCount();
  const keep = S.sel ? [...S.sel.ids] : [], auto = !!(S.sel && S.sel.auto);
  to.push(S.items); const it = from.pop(); setItems(it); setSheets(it.sheets); hideTapeMenu();
  const live = new Set(it.map(i => i.id)), still = new Set(keep.filter(id => live.has(id)));   // Auswahl bleibt, soweit es sie noch gibt
  if (still.size) setSel(still, auto); else clearSel();
  markDirty(); requestDraw(); updateUndo();
}
function undo() { stepHistory(S.undo, S.redo); }
function redo() { stepHistory(S.redo, S.undo); }
function updateUndo() {
  for (const [id, off] of [['#bUndo', !S.undo.length], ['#bRedo', !S.redo.length]]) { const b = $(id); if (b.disabled !== off) b.disabled = off; }
}
// Reihenfolge: neue Striche ans Ende, Bilder direkt über die vorhandenen Bilder (also unter die Schrift)
function appendItems(list, added) {
  const base = list.length ? list[list.length - 1].o : 0;
  added.forEach((it, k) => it.o = base + k + 1);
  return [...list, ...added];
}
function withImages(list, added) {
  let k = 0; list.forEach((it, i) => { if (it.t === 'i') k = i + 1; });
  const lo = k > 0 ? list[k - 1].o : (list.length ? list[0].o - added.length - 1 : 0);
  const hi = k < list.length ? list[k].o : lo + added.length + 1;
  added.forEach((it, m) => it.o = lo + (hi - lo) * (m + 1) / (added.length + 1));
  return [...list.slice(0, k), ...added, ...list.slice(k)];
}

/* ---------- Auswahl ---------- */
// Striche eines Graphen gehören zusammen: wird einer gewählt, kommt die ganze Gruppe mit;
// mit einem Tape kommt auch, was darauf geschrieben ist
function withGroups(ids) {
  const gs = new Set();
  for (const it of S.items) if (it.g && ids.has(it.id)) gs.add(it.g);
  if (gs.size) for (const it of S.items) if (it.g && gs.has(it.g)) ids.add(it.id);
  // Erklärung: was markiert ist, nimmt seine Markierung mit (und die Markierung alles, was sie markiert)
  const marks = new Set(); for (const it of S.items) if (it.nt) marks.add(it.id);
  if (marks.size) for (const it of S.items) if (it.on && ids.has(it.id) && marks.has(it.on)) ids.add(it.on);
  for (const it of S.items) if (it.on && ids.has(it.on)) ids.add(it.id);
  return ids;
}
// Ausdehnung ohne Strichbreite (Punkte der Striche, Bildränder) – daran richtet sich das Raster aus
function geoBox(items) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const it of items) {
    if (isBox(it)) { b[0] = Math.min(b[0], it.x); b[1] = Math.min(b[1], it.y); b[2] = Math.max(b[2], it.x + it.w); b[3] = Math.max(b[3], it.y + it.h); continue; }
    const p = it.pts;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  }
  return b;
}
// Schaft eines Pfeils (auch einer Achse eines Koordinatensystems): Indizes von Anfang und Spitze in pts, sonst null.
// Mit gefüllter Spitze (fl): Anfang ist der erste Punkt (beim Doppelpfeil die erste Spitze), die Spitze der Punkt ihrer
// Fläche, der am weitesten von der Kerbe weg liegt. Früher: Ende, Spitze, Flügel, Spitze, Flügel bzw. beim Doppelpfeil
// Flügel, Anfang, Flügel, Anfang, Ende, …
function shaftOf(it) {
  const p = it.pts, same = (i, j) => p[3 * i] === p[3 * j] && p[3 * i + 1] === p[3 * j + 1];
  if (Array.isArray(it.fl) && it.fl.length) {
    const n = p.length / 3, tip = r => {
      let best = -1, dm = -1;
      if (!Array.isArray(r) || !(r[0] >= 0 && r[1] < n)) return -1;
      for (let i = r[0]; i <= r[1]; i++) { const d = Math.hypot(p[3 * i] - p[3 * r[0]], p[3 * i + 1] - p[3 * r[0] + 1]); if (d > dm) { dm = d; best = i; } }
      return best * 3;
    };
    if (it.k === 'arrow2' && it.fl.length === 2) { const a = tip(it.fl[0]), b = tip(it.fl[1]); return a >= 0 && b >= 0 ? [a, b] : null; }
    if (it.k === 'arrow' || GRAPHS.has(it.k)) { const b = tip(it.fl[0]); return b >= 0 ? [0, b] : null; }
    return null;
  }
  if ((it.k === 'arrow' || GRAPHS.has(it.k)) && p.length === 15 && same(1, 3)) return [0, 3];
  if (it.k === 'arrow2' && p.length === 24 && same(1, 3) && same(4, 6)) return [3, 12];
  return null;
}
// Was mit Raster auf dem Raster liegt (ohne Strichbreite): Bildränder und die Punkte der Striche, bei Pfeilen nur der Schaft
// (die Spitze ragt seitlich darüber hinaus), bei Koordinatensystemen das aufgezogene Rechteck ohne Teilstriche und Beschriftung
function gridBox(items) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
  for (const it of items) {
    if (isBox(it)) { add(it.x, it.y); add(it.x + it.w, it.y + it.h); continue; }
    if (it.gr) { const q = it.gr.b; add(q[0], q[1]); add(q[2], q[3]); continue; }
    const p = it.pts, sh = shaftOf(it);
    if (sh) { add(p[sh[0]], p[sh[0] + 1]); add(p[sh[1]], p[sh[1] + 1]); continue; }
    if (GRAPHS.has(it.k) || it.nt) continue;   // früher gezeichneter Graph: nur die Achsen (eben); Markierung einer Erklärung: steht über
    for (let i = 0; i < p.length; i += 3) add(p[i], p[i + 1]);
  }
  return b[0] <= b[2] ? b : geoBox(items);
}
function selGridBox(a) { return a.gb || (a.gb = gridBox(S.items.filter(it => S.sel.ids.has(it.id)))); }
// Punkt, der beim Verschieben mit Raster auf dem Raster landet: der Ursprung eines Koordinatensystems (Achsen und
// Teilstriche liegen dann auf dem Raster, auch auf einem anderen Blatt), sonst die linke obere Ecke von gridBox
function snapRef(items) {
  const gi = items.find(it => it.g && GRAPHS.has(it.k)), d = gi && graphData(gi.g);
  if (d) return d.o;
  const b = gridBox(items); return [b[0], b[1]];
}
function setSel(ids, auto = false) {   // auto: eben gezeichnet (nur im Formen-Werkzeug, ohne Auswahlleiste)
  if (!ids.size) return clearSel();
  const items = S.items.filter(it => ids.has(it.id));
  if (!items.length) return clearSel();
  S.sel = { ids: new Set(items.map(i => i.id)), bb: contentBox(items), auto: !!auto }; requestLive(); placeSelbar();
}
// was Auswahlleiste, Formen-Fenster und Griffe über die Auswahl wissen müssen: einmal je Auswahl und Stand der Seite
// (draw() führt die Leiste in jedem Bild nach, beim Verschieben und Zoomen)
function selFacts() {
  const s = S.sel; if (s.facts && s.facts.items === S.items) return s.facts;
  const sel = S.items.filter(it => s.ids.has(it.id));
  return s.facts = { items: S.items, sel, strokes: sel.some(it => it.t === 's'), note: sel.some(it => !it.tp), graph: selGraph() };
}
function clearSel() {
  if (action && (action.kind === 'move' || action.kind === 'scale' || action.kind === 'bend')) cancelAction();
  S.sel = null; $('#selbar').classList.add('hidden'); $('#shapePop').classList.add('hidden'); requestLive();
}
function refreshSel() { if (S.sel) setSel(S.sel.ids, S.sel.auto); }
function placeSelbar() {
  const bar = $('#selbar');
  if (!S.sel || !S.note || (S.tool === 'shape' && S.sel.auto) || (action && (action.kind === 'move' || action.kind === 'scale' || action.kind === 'bend'))) { bar.classList.add('hidden'); placeShapePop(false); return; }
  const f = selFacts();
  for (const id of ['#sColor', '#sSize', '#sSave']) $(id).classList.toggle('hidden', !f.strokes);
  $('#sGraph').classList.toggle('hidden', !f.graph);
  $('#sNote').classList.toggle('hidden', !f.note);
  const appear = bar.classList.contains('hidden');   // nur beim Erscheinen aufploppen, nicht bei jedem Nachführen
  bar.classList.remove('hidden');
  const b = S.sel.bb, [x0, y0] = toScreen(b[0], b[1]), [x1, y1] = toScreen(b[2], b[3]);
  const top = barBottom() + 8, h = bar.offsetHeight, hw = bar.offsetWidth / 2 + 8;
  let y = y0 - 12 - h;                       // über der Auswahl
  if (y < top) y = y1 + 16;                  // sonst darunter
  if (y + h > VH - 8) y = Math.max(top, Math.min(VH - h - 8, y0 + 12));  // sonst innen oben
  bar.style.left = clamp((x0 + x1) / 2, hw, VW - hw) + 'px';
  bar.style.top = y + 'px';
  if (appear) popIn(bar, null, 'translateX(-50%)', 0, 0.8);   // die Leiste ist mittig verschoben, das bleibt
  placeShapePop(true);
}
function transformItem(it, s, ox, oy, dx, dy) {
  const f = (x, o) => o + (x - o) * s;
  if (it.t === 's') {
    const pts = new Float32Array(it.pts);
    for (let i = 0; i < pts.length; i += 3) { pts[i] = f(pts[i], ox) + dx; pts[i + 1] = f(pts[i + 1], oy) + dy; }
    const n = { ...it, pts, w: it.w * s, bb: bboxOf(pts, it.w * s) };
    if (it.gr) { const g = it.gr; n.gr = { ...g, b: [f(g.b[0], ox) + dx, f(g.b[1], oy) + dy, f(g.b[2], ox) + dx, f(g.b[3], oy) + dy], o: [f(g.o[0], ox) + dx, f(g.o[1], oy) + dy], f: (g.f || 1) * s }; }
    if (it.sh) { const q = v => [f(v[0], ox) + dx, f(v[1], oy) + dy]; n.sh = { ...it.sh, a: q(it.sh.a), b: q(it.sh.b) }; if (it.sh.m) n.sh.m = q(it.sh.m); }   // Ecken, Enden und Knick
    return n;
  }
  return { ...it, x: f(it.x, ox) + dx, y: f(it.y, oy) + dy, w: it.w * s, h: it.h * s, ...(it.t === 'x' ? { fs: it.fs * s } : {}) };
}
// Lasso-Test für viele Punkte: die Kanten nach ihrer Höhe in Streifen sortiert, ein Punkt prüft nur die Kanten seines
// Streifens (gleiches Ergebnis wie pointInPoly, bei großem Lasso viel schneller)
function polyTester(P) {
  let y0 = Infinity, y1 = -Infinity; for (let i = 1; i < P.length; i += 2) { if (P[i] < y0) y0 = P[i]; if (P[i] > y1) y1 = P[i]; }
  const B = Math.max(1, Math.min(64, P.length >> 3)), h = (y1 - y0) / B || 1, bands = Array.from({ length: B }, () => []), band = y => clamp(Math.floor((y - y0) / h), 0, B - 1);
  for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) { const a = band(Math.min(P[i + 1], P[j + 1])), b = band(Math.max(P[i + 1], P[j + 1])); for (let k = a; k <= b; k++) bands[k].push(i, j); }
  return (x, y) => {
    if (!(y >= y0 && y <= y1)) return false;
    const e = bands[band(y)]; let inside = false;
    for (let q = 0; q < e.length; q += 2) { const i = e[q], j = e[q + 1], xi = P[i], yi = P[i + 1], xj = P[j], yj = P[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
    return inside;
  };
}
function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 2; i < P.length; j = i, i += 2) {
    const xi = P[i], yi = P[i + 1], xj = P[j], yj = P[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Lasso nur angetippt, und zwar auf das „i“ einer Erklärung
function lassoBadge(P) {
  let len = 0; for (let i = 2; i < P.length; i += 2) len += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
  return len * S.view.z < 12 ? noteBadgeAt(P[0], P[1]) : null;
}
function lassoSelect(P) {
  const ids = new Set();
  let len = 0; for (let i = 2; i < P.length; i += 2) len += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
  if (len * S.view.z < 12) { // Antippen: oberstes Objekt unter dem Stift
    const x = P[0], y = P[1];
    for (let k = S.items.length - 1; k >= 0; k--) {
      const it = S.items[k]; if (!shown(it)) continue;
      if (isBox(it) ? (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) : hitStroke(it, x, y, 8 / S.view.z) || (it.fs && hitCtx.isPointInPath(fillGeo(it).P, x, y))) { ids.add(it.id); break; }
    }
    return withGroups(ids);
  }
  const lb = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 2) { lb[0] = Math.min(lb[0], P[i]); lb[1] = Math.min(lb[1], P[i + 1]); lb[2] = Math.max(lb[2], P[i]); lb[3] = Math.max(lb[3], P[i + 1]); }
  const inPoly = polyTester(P);
  for (const it of S.items) {
    const b = itemBox(it); if (!boxHit(b, lb) || !shown(it)) continue;
    if (isBox(it)) { if (inPoly(it.x + it.w / 2, it.y + it.h / 2)) ids.add(it.id); continue; }
    const n = it.pts.length / 3, step = Math.max(1, Math.floor(n / 40)), total = Math.ceil(n / step);
    let inside = 0, tested = 0;   // mindestens die Hälfte der Punkte im Lasso; aufhören, sobald das entschieden ist
    for (let i = 0; i < n; i += step) { tested++; if (inPoly(it.pts[i * 3], it.pts[i * 3 + 1])) inside++; if (inside * 2 >= total || (tested - inside) * 2 > total) break; }
    if (inside * 2 >= total) ids.add(it.id);
  }
  return withGroups(ids);
}
function selBitmap() {
  const b = S.sel.bb, [x0, y0] = toScreen(b[0], b[1]), [x1, y1] = toScreen(b[2], b[3]);
  const sx0 = Math.max(x0, -VW), sy0 = Math.max(y0, -VH), sx1 = Math.min(x1, 2 * VW), sy1 = Math.min(y1, 2 * VH);
  const w = Math.ceil((sx1 - sx0) * DPR), h = Math.ceil((sy1 - sy0) * DPR);
  if (w <= 0 || h <= 0 || w * h > 40e6) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), z = S.view.z;
  g.setTransform(DPR * z, 0, 0, DPR * z, DPR * (S.view.tx - sx0), DPR * (S.view.ty - sy0));
  paintItems(g, paintOrder(), DPR * z, it => !S.sel.ids.has(it.id));
  return { c, sx: sx0, sy: sy0 };
}

/* ---------- Radierer ---------- */
const ERASE_R = 12;
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const boxNear = (b, x, y, r) => x >= b[0] - r && x <= b[2] + r && y >= b[1] - r && y <= b[3] + r;
function hitStroke(s, x, y, r) {
  const b = s.bb; if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) return false;
  const p = s.pts, lim = r + s.w / 2;
  if (p.length === 3) return Math.hypot(x - p[0], y - p[1]) < lim;
  for (let i = 3; i < p.length; i += 3) if (distSeg(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) < lim) return true;
  return false;
}
// zwischen zwei Abtastungen in Schritten von höchstens dem Radius: schnelles Wischen erwischt auch dünne Striche dazwischen
function eraseAt(x, y) {
  const r = ERASE_R / S.view.z, a = action, [fx, fy] = a.last || [x, y], n = Math.max(1, Math.ceil(Math.hypot(x - fx, y - fy) / r));
  const gone = [];
  for (let k = 1; k <= n; k++) eraseOne(fx + (x - fx) * k / n, fy + (y - fy) * k / n, r, gone);
  a.last = [x, y];
  if (!gone.length) return;
  // wo sie lagen, nur Streifen neu malen (hiddenIds lässt die weggewischten aus) statt ganze Kacheln neu zu rastern
  if (S.view.z === S.level && !(S.cornellHide && isCornell())) { repaintStrips(gone); requestDraw(); }
  else for (const it of gone) invalidateBox(itemBox(it));
}
function eraseOne(x, y, r, gone) {
  for (const it of S.items) if (it.t === 's' && !it.nt && boxNear(it.bb, x, y, r) && !action.removed.has(it.id) && shown(it) && hitStroke(it, x, y, r)) {
    action.removed.add(it.id); gone.push(it);
    if (it.tp) for (const o of S.items) if (o.on === it.id && !action.removed.has(o.id)) { action.removed.add(o.id); gone.push(o); }   // was darauf steht, geht mit
  }
}

/* ---------- Formen, Koordinatensysteme, Raster ----------
   Formen sind gewöhnliche Striche (Druck 0,5 = genau die Stiftbreite). Damit funktionieren Auswahl,
   Radierer, Farbe, Dicke, Rückgängig, Speichern und Export ohne Sonderfälle. */
const SHAPE_KINDS = ['line', 'arrow', 'arrow2', 'rect', 'ellipse', 'tri', 'rtri', 'diamond', 'axes2', 'axes2p', 'axes3'];
const LINE_SHAPES = new Set(['line', 'arrow', 'arrow2']), GRAPHS = new Set(['axes2', 'axes2p', 'axes3']);
const SQUARE_MAGNET = new Set(['rect', 'ellipse', 'diamond']);
/* Stil der Grundformen (wie bei Excalidraw): Kontur durchgezogen, gestrichelt oder gepunktet (am Strich als ds, beim
   Zeichnen umgesetzt, Flächen wie Pfeilspitzen bleiben voll); Kanten spitz oder rund (Rechteck, Dreiecke, Raute);
   Sauberkeit exakt, leicht von Hand oder skizzenhaft (zwei Durchgänge). Rund und von Hand werden in die Punkte
   gerechnet, mit einem Startwert je Form (gleiche Form, gleiches Wackeln; die Vorschau beim Ziehen bleibt ruhig).
   Koordinatensysteme und eigene Formen bleiben, wie sie sind. */
const SHAPE_BASIC = new Set(['line', 'arrow', 'arrow2', 'rect', 'ellipse', 'tri', 'rtri', 'diamond']), SHAPE_CLOSED = new Set(['rect', 'tri', 'rtri', 'diamond']);
const SHAPE_FILL = new Set(['rect', 'ellipse', 'tri', 'rtri', 'diamond']), FILLS = ['none', 'hachure', 'cross', 'solid'];
S.shapeStyle = { ds: 'solid', rnd: 0, sl: 0, fs: 'none' };
{ const v = store.get('shapeStyle'); if (v) { if (FILLS.includes(v.fs)) S.shapeStyle.fs = v.fs; if (['solid', 'dash', 'dot'].includes(v.ds)) S.shapeStyle.ds = v.ds; if (v.rnd === 0 || v.rnd === 1) S.shapeStyle.rnd = v.rnd; if ([0, 1, 2].includes(v.sl)) S.shapeStyle.sl = v.sl; } }
// kleiner Zufallsgenerator mit Startwert (xorshift32)
function seeded(seed) { let x = (seed | 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
// Ecken eines geschlossenen Linienzugs (erster = letzter Punkt) runden: Bogen mit Radius r, höchstens 45 % der Kanten
function roundCorners(xy, r) {
  const P = []; for (let i = 0; i + 3 < xy.length; i += 2) P.push([xy[i], xy[i + 1]]);
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const rr = Math.min(r, l1 * 0.45, l2 * 0.45), p1 = [b[0] + (a[0] - b[0]) / l1 * rr, b[1] + (a[1] - b[1]) / l1 * rr], p2 = [b[0] + (c[0] - b[0]) / l2 * rr, b[1] + (c[1] - b[1]) / l2 * rr];
    for (let k = 0; k <= 8; k++) { const t = k / 8, s = 1 - t; out.push(s * s * p1[0] + 2 * s * t * b[0] + t * t * p2[0], s * s * p1[1] + 2 * s * t * b[1] + t * t * p2[1]); }
  }
  out.push(out[0], out[1]);
  return out;
}
// von Hand, eckige Formen und Linien: jede Kante leicht gebogen, Ecken etwas versetzt, kleine Überstände an den Enden.
// Skizzenhaft stärker und zweimal: der zweite Strich liegt etwa eine Strichbreite daneben und biegt sich anders, wie
// zweimal nachgezogen (offene Linien gehen beim zweiten Mal zurück).
const roughOff = (rnd, w, len) => (rnd() < 0.5 ? -1 : 1) * Math.min(2 + w * 1.25, len * 0.07) * (0.75 + 0.25 * rnd());
function roughEdges(xy, sl, rnd, w) {
  const m = xy.length / 2, closed = m > 2 && xy[0] === xy[m * 2 - 2] && xy[1] === xy[m * 2 - 1];
  const J = (sl === 1 ? 0.8 : 1.2) + w * 0.12, B = sl === 1 ? 0.012 : 0.016, out = [];
  const jit = () => (rnd() * 2 - 1) * J;
  const curve = (e, pass) => {   // Kante e (Punkt e → e + 1): Anfang, Kontrollpunkt, Ende, Schritte
    const x0 = xy[e * 2], y0 = xy[e * 2 + 1], x1 = xy[e * 2 + 2], y1 = xy[e * 2 + 3], len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.5) return null;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len, ov = Math.min(len * 0.05, sl === 1 ? 2.5 : 5) * rnd();
    const bow = len * B * (0.35 + 0.65 * rnd()) * (rnd() < 0.5 ? -1 : 1), off = pass ? roughOff(rnd, w, len) : 0;
    const sx = x0 - uy * off + jit(), sy = y0 + ux * off + jit(), ex = x1 - uy * off + jit() + ux * ov, ey = y1 + ux * off + jit() + uy * ov;
    return [sx, sy, (sx + ex) / 2 - uy * bow * 2, (sy + ey) / 2 + ux * bow * 2, ex, ey, clamp(Math.round(len / 10), 3, 40)];
  };
  for (let pass = 0; pass < (sl === 2 ? 2 : 1); pass++) {
    const back = pass && !closed, cs = [];
    for (let e = 0; e + 1 < m; e++) cs.push(curve(e, pass));
    for (let k = 0; k < cs.length; k++) {
      const c = cs[back ? cs.length - 1 - k : k]; if (!c) continue;
      const [sx, sy, cx, cy, ex, ey, steps] = c;
      for (let s = 0; s <= steps; s++) { const t = back ? 1 - s / steps : s / steps, q = 1 - t; out.push(q * q * sx + 2 * q * t * cx + t * t * ex, q * q * sy + 2 * q * t * cy + t * t * ey); }
    }
  }
  return out;
}
// von Hand, runde Formen (Ellipse, gerundete Ecken): sanftes Wackeln quer zur Linie, Anfang an zufälliger Stelle, das Ende
// läuft etwas über den Anfang. Skizzenhaft eine zweite Runde ohne Absatz; das Wackeln wiederholt sich nicht genau (keine
// ganzzahligen Frequenzen), so liegen die Runden mal nebeneinander, mal übereinander.
function roughSmooth(xy, sl, rnd, w) {
  const m = xy.length / 2, L = [0];
  for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]));
  const tot = L[m - 1]; if (!(tot > 1)) return xy;
  const closed = Math.hypot(xy[0] - xy[m * 2 - 2], xy[1] - xy[m * 2 - 1]) < 1e-6, amp = clamp(tot * (sl === 1 ? 0.004 : 0.008), 0.7, sl === 1 ? 2.6 : 5) + w * 0.1;
  const at = d => {   // Punkt und Normale bei Bogenlänge d
    let lo = 0, hi = m - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] <= d) lo = mid; else hi = mid; }
    const sg = L[hi] - L[lo] || 1, t = (d - L[lo]) / sg, x0 = xy[lo * 2], y0 = xy[lo * 2 + 1], x1 = xy[hi * 2], y1 = xy[hi * 2 + 1];
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, -(y1 - y0) / sg, (x1 - x0) / sg];
  };
  const f1 = 1.3 + rnd() * 0.4, f2 = 3.3 + rnd() * 0.4, p1 = rnd() * 6.283, p2 = rnd() * 6.283, d0 = closed ? rnd() * tot : 0;
  const laps = closed ? (sl === 2 ? 2 : 1) + (sl === 1 ? 0.04 : 0.08) * (0.6 + rnd() * 0.8) : 1, total = tot * laps, N = Math.ceil(total / 5), out = [];
  for (let s = 0; s <= N; s++) {
    const d = total * s / N, [x, y, nx, ny] = at(closed ? (d0 + d) % tot : Math.min(d, tot)), off = amp * (0.62 * Math.sin(6.283 * f1 * d / tot + p1) + 0.38 * Math.sin(6.283 * f2 * d / tot + p2));
    out.push(x + nx * off, y + ny * off);
  }
  return out;
}
// von Hand, Pfeile: nur der Schaft leicht gebogen und sein freies Ende versetzt, die Spitzen (Flächen) bleiben genau
function roughArrow(xy, sl, rnd, w) {
  const m = xy.length / 2, rid = new Int32Array(m), out = [], map = new Int32Array(m), B = sl === 1 ? 0.014 : 0.026, J = (sl === 1 ? 0.8 : 1.6) + w * 0.12;
  xy.fl.forEach(([a, b], k) => { for (let i = a; i <= b; i++) rid[i] = k + 1; });
  for (let i = 0; i < m; i++) {
    let x = xy[i * 2], y = xy[i * 2 + 1];
    if (i === 0 && !rid[0]) { x += (rnd() * 2 - 1) * J; y += (rnd() * 2 - 1) * J; }
    if (i > 0 && !(rid[i] && rid[i] === rid[i - 1])) {   // Schaft: Bogen bis hierher
      const x0 = out[out.length - 2], y0 = out[out.length - 1], len = Math.hypot(x - x0, y - y0);
      if (len > 1) {
        const bow = len * B * (rnd() * 2 - 1), cx = (x0 + x) / 2 - (y - y0) / len * bow * 2, cy = (y0 + y) / 2 + (x - x0) / len * bow * 2, steps = clamp(Math.round(len / 10), 3, 40);
        for (let s = 1; s < steps; s++) { const t = s / steps, q = 1 - t; out.push(q * q * x0 + 2 * q * t * cx + t * t * x, q * q * y0 + 2 * q * t * cy + t * t * y); }
      }
    }
    map[i] = out.length / 2; out.push(x, y);
  }
  if (sl === 2) {   // skizzenhaft: den Schaft ein zweites Mal zurück, etwas daneben (nach der letzten Spitze)
    let i = 1; while (i < m && rid[i] && rid[i] === rid[i - 1]) i++;   // Schaft: Abschnitt i − 1 → i
    const x0 = out[map[i - 1] * 2], y0 = out[map[i - 1] * 2 + 1], x1 = out[map[i] * 2], y1 = out[map[i] * 2 + 1], len = Math.hypot(x1 - x0, y1 - y0);
    if (i < m && len > 1) {
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len, off = roughOff(rnd, w, len), bow = len * B * (rnd() * 2 - 1), steps = clamp(Math.round(len / 10), 3, 40);
      const sx = x1 - uy * off, sy = y1 + ux * off, ex = x0 - uy * off + (rnd() * 2 - 1) * J, ey = y0 + ux * off + (rnd() * 2 - 1) * J;
      const cx = (sx + ex) / 2 - uy * bow * 2, cy = (sy + ey) / 2 + ux * bow * 2;
      for (let s = 0; s <= steps; s++) { const t = s / steps, q = 1 - t; out.push(q * q * sx + 2 * q * t * cx + t * t * ex, q * q * sy + 2 * q * t * cy + t * t * ey); }
    }
  }
  out.fl = xy.fl.map(([a, b]) => [map[a], map[b]]);
  return out;
}
/* Grundformen neu rechnen: am Strich steht sh = { a, b (Ecken der Form bzw. Enden der Linie, beim Pfeil die Spitze),
   rnd, sl, seed (Stil und Startwert wie beim Zeichnen), m (nur Linien: Punkt, durch den sie gebogen ist) }. Ältere
   Formen ohne sh: aus den Punkten. reshape ändert Stil, Füllung, Farbe, Dicke oder den Knick und rechnet die Punkte neu.
   Die eben gezeichnete Form bleibt im Formen-Werkzeug ausgewählt; was dann in der Formenleiste, bei den Farben oder
   Dicken gewählt wird, gilt auch für sie. Linien und Pfeile haben in der Mitte einen Punkt zum Biegen (ausgewählt
   nach dem Zeichnen oder mit dem Lasso); zurück in die Mitte gezogen werden sie wieder gerade. */
// Linie, Pfeil oder Doppelpfeil von A nach B, gerade (M null, genau wie beim Zeichnen) oder durch M gebogen
function lineXY(k, A, B, M, w, sl, seed) {
  if (!M) return styledLines(k, shapeLines(k, A[0], A[1], B[0], B[1], w), { rnd: 0, sl, seed, w }, null);
  return [bentLine(k, A, B, M, w, sl, seed)];
}
// Gebogen: quadratische Kurve von A nach B, die bei t = 0,5 durch M geht. Pfeilspitzen sitzen wie bei geraden Pfeilen an
// den Enden, ausgerichtet nach der Richtung der Kurve dort; der Schaft endet an ihrer Kerbe. Von Hand wackelt der
// Schaft sanft (an den Spitzen fest), skizzenhaft kommt er ein zweites Mal etwas daneben.
function bentLine(k, A, B, M, w, sl, seed) {
  const C = [2 * M[0] - (A[0] + B[0]) / 2, 2 * M[1] - (A[1] + B[1]) / 2];
  const at = t => { const q = 1 - t; return [q * q * A[0] + 2 * q * t * C[0] + t * t * B[0], q * q * A[1] + 2 * q * t * C[1] + t * t * B[1]]; };
  let len = 0; { let p = A; for (let i = 1; i <= 32; i++) { const q = at(i / 32); len += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; } }
  const N = clamp(Math.round(len / 5), 16, 160), P = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const two = k === 'arrow2', head = k === 'arrow' || two, L = head ? headSize(len, w, two ? 0.3 : 0.4) : 0, back = L * (1 - HEAD_N);   // Kerbe: so weit hinter der Spitze
  let i0 = 0, i1 = N;
  if (head) while (i1 > 1 && Math.hypot(P[i1][0] - B[0], P[i1][1] - B[1]) < back) i1--;
  if (two) while (i0 < i1 - 1 && Math.hypot(P[i0][0] - A[0], P[i0][1] - A[1]) < back) i0++;
  const unit = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const uB = unit(P[i1], B), uA = unit(P[i0], A);
  let shaft = []; for (let i = i0; i <= i1; i++) shaft.push(P[i][0], P[i][1]);
  let second = null;
  if (sl) ({ xy: shaft, second } = roughShaft(shaft, sl, seeded(seed), w, two, head));
  const out = [];
  if (!head) { out.push(...shaft); if (second) out.push(...second); return out; }
  const fl = [];
  if (two) fl.push(headPts(out, A[0], A[1], uA[0], uA[1], L));
  out.push(...shaft);
  fl.push(headPts(out, B[0], B[1], uB[0], uB[1], L));
  if (second) out.push(...second);
  out.fl = fl;
  return out;
}
// von Hand, Schaft einer gebogenen Linie: sanftes Wackeln quer zur Richtung, an Pfeilspitzen (fix0, fix1) fest;
// skizzenhaft ein zweiter Durchgang zurück, etwas daneben
function roughShaft(xy, sl, rnd, w, fix0, fix1) {
  const m = xy.length / 2, L = [0];
  for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]));
  const tot = L[m - 1]; if (!(m > 1 && tot > 1)) return { xy, second: null };
  const amp = clamp(tot * (sl === 1 ? 0.006 : 0.012), 0.6, sl === 1 ? 3 : 6) + w * 0.1;
  const f1 = 1 + rnd() * 0.6, p1 = rnd() * 6.283, f2 = 2.2 + rnd() * 0.8, p2 = rnd() * 6.283, sep = sl === 2 ? roughOff(rnd, w, tot) : 0;
  const win = t => Math.min(1, fix0 ? t / 0.2 : 1, fix1 ? (1 - t) / 0.2 : 1);
  const nrm = i => { const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1), dx = xy[b * 2] - xy[a * 2], dy = xy[b * 2 + 1] - xy[a * 2 + 1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  const pass = (k, s, rev) => {
    const out = [];
    for (let j = 0; j < m; j++) {
      const i = rev ? m - 1 - j : j, t = L[i] / tot, [nx, ny] = nrm(i);
      const o = amp * win(t) * (0.65 * Math.sin(6.283 * f1 * t + p1 + k) + 0.35 * Math.sin(6.283 * f2 * t + p2 + k * 1.7)) + s * (0.3 + 0.7 * win(t));
      out.push(xy[i * 2] + nx * o, xy[i * 2 + 1] + ny * o);
    }
    return out;
  };
  return { xy: pass(0, 0, false), second: sl === 2 ? pass(2.1, sep, true) : null };
}
// Ecken bzw. Enden, Stil und Knick einer Grundform (ältere ohne sh: aus den Punkten, genau und mit Startwert 1)
function shOf(it) {
  if (it.sh) return it.sh;
  const p = it.pts, n = p.length / 3, keep = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 4 ? { a, b, rnd: 0, sl: 0, seed: 1 } : null;
  if (LINE_SHAPES.has(it.k)) {
    if (it.k === 'line') return keep([p[0], p[1]], [p[n * 3 - 3], p[n * 3 - 2]]);
    const sh = shaftOf(it); return sh ? keep([p[sh[0]], p[sh[0] + 1]], [p[sh[1]], p[sh[1] + 1]]) : null;
  }
  if (!SHAPE_BASIC.has(it.k)) return null;
  if ((it.k === 'rect' && n === 5) || (it.k === 'rtri' && n === 4)) return keep([p[0], p[1]], [p[6], p[7]]);   // Ecke a, gegenüber b
  const g = geoBox([it]); return keep([g[0], g[1]], [g[2], g[3]]);
}
const restylable = it => !!it && it.t === 's' && SHAPE_BASIC.has(it.k) && !it.g && !it.tp && !it.nt && !!shOf(it);
const bendable = it => restylable(it) && LINE_SHAPES.has(it.k);
function bendPoint(it) { const L = shOf(it); return L.m || [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2]; }
// Punkt einer Linie unter (sx, sy): 'a' Anfang, 'b' Ende bzw. Spitze, 'm' Mitte zum Biegen; knapp daneben: verschieben
function lineHandleAt(it, sx, sy) {
  const L = shOf(it), on = p => { const [x, y] = toScreen(p[0], p[1]); return Math.hypot(sx - x, sy - y) < 11; };
  return on(L.b) ? 'b' : on(L.a) ? 'a' : on(bendPoint(it)) ? 'm' : null;
}
// Griffe an den Seiten einer Kastenform (Rechteck, Ellipse, Dreiecke, Raute): Mitte jeder Seite ihres Kastens
function boxHandles(it) {
  const L = shOf(it), x0 = Math.min(L.a[0], L.b[0]), x1 = Math.max(L.a[0], L.b[0]), y0 = Math.min(L.a[1], L.b[1]), y1 = Math.max(L.a[1], L.b[1]), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { left: [x0, cy], right: [x1, cy], top: [cx, y0], bottom: [cx, y1] };
}
// wo die Griffe sitzen: etwas außerhalb der Form, vor dem gestrichelten Rahmen (die Kante selbst greift man zum Verschieben)
function boxGrips(it) {
  const h = boxHandles(it), o = it.w / 2 + 10 / S.view.z;
  return { left: [h.left[0] - o, h.left[1]], right: [h.right[0] + o, h.right[1]], top: [h.top[0], h.top[1] - o], bottom: [h.bottom[0], h.bottom[1] + o] };
}
function boxHandleAt(it, sx, sy) {
  const h = boxGrips(it);
  for (const k of ['right', 'bottom', 'left', 'top']) { const [x, y] = toScreen(h[k][0], h[k][1]); if (Math.hypot(sx - x, sy - y) < 9) return k; }
  return null;
}
// genau eine Grundform ausgewählt (nach dem Zeichnen oder mit dem Lasso): Linien haben Punkte (Enden, Mitte), Kastenformen
// Griffe an den Seiten
function editTarget() {
  if (!S.sel || S.sel.ids.size !== 1) return null;
  const it = selFacts().sel[0]; return restylable(it) ? it : null;   // je Stand einmal gesucht (Schweben fragt bei jeder Bewegung)
}
const editPartAt = (it, sx, sy) => LINE_SHAPES.has(it.k) ? lineHandleAt(it, sx, sy) : SHAPE_FILL.has(it.k) ? boxHandleAt(it, sx, sy) : null;
const bendHit = (it, sx, sy) => !!editPartAt(it, sx, sy);
function bendTarget() { const it = editTarget(); return it && LINE_SHAPES.has(it.k) ? it : null; }
// Form neu mit geändertem Stil (ds, rnd, sl, fs), Farbe (c), Dicke (w), Knick (m, null = gerade) oder Enden (a, b); gleiche id
function reshape(it, o = {}) {
  const sh = shOf(it); if (!sh) return null;
  const k = it.k, line = LINE_SHAPES.has(k), w = o.w ?? it.w, c = o.c ?? it.c, sl = o.sl ?? sh.sl ?? 0, rnd = o.rnd ?? sh.rnd ?? 0, seed = sh.seed || 1, A = o.a || sh.a, B = o.b || sh.b;
  const ds = o.ds ?? it.ds ?? 'solid', fs = o.fs ?? it.fs ?? 'none', m = 'm' in o ? o.m : sh.m || null;
  const box = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[0], B[0]), Math.max(A[1], B[1])];
  const xy = line ? lineXY(k, A, B, m, w, sl, seed)[0] : styledLines(k, shapeLines(k, A[0], A[1], B[0], B[1], w), { rnd, sl, seed, w }, box)[0];
  if (!xy || xy.length < 4) return null;
  const n = xy.length / 2, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = xy[i * 2]; p[i * 3 + 1] = xy[i * 2 + 1]; p[i * 3 + 2] = 0.5; }
  const s = { ...it, c, w, pts: p, bb: bboxOf(p, w), sh: { a: [A[0], A[1]], b: [B[0], B[1]], rnd, sl, seed } };
  if (line && m) s.sh.m = [m[0], m[1]];
  if (xy.fl) s.fl = xy.fl.map(r => [r[0], r[1]]); else delete s.fl;
  if (ds !== 'solid') s.ds = ds; else delete s.ds;
  if (fs !== 'none' && SHAPE_FILL.has(k)) s.fs = fs; else delete s.fs;
  return s;
}
// ausgewählte Grundformen mit geändertem Stil, Farbe oder Dicke; ein Schritt. Im Formen-Werkzeug (die eben gezeichnete);
// any: auch sonst (Popup neben einer mit dem Lasso gewählten Form)
function restyleSel(o, any = false) {
  if (!S.sel || (!any && S.tool !== 'shape')) return false;
  let changed = false;
  const next = S.items.map(it => { if (!S.sel.ids.has(it.id) || !restylable(it)) return it; const n = reshape(it, o); if (!n) return it; changed = true; return n; });
  if (!changed) return false;
  commit(next); refreshSel(); return true;
}
function beginBend(e, it, wx, wy) {
  const [sx, sy] = localXY(e), part = editPartAt(it, sx, sy) || 'm', p = part === 'm' ? bendPoint(it) : part.length > 1 ? boxHandles(it)[part] : shOf(it)[part];
  action = { kind: 'bend', part, id: e.pointerId, it, off: [p[0] - wx, p[1] - wy], m: p, s0: [sx, sy], tmp: null, moved: false, touch: e.pointerType === 'touch' };
  invalidateBox(it.bb); $('#selbar').classList.add('hidden'); $('#shapePop').classList.add('hidden'); requestLive();
}
function moveBend(a, sx, sy, wx, wy) {
  if (!a.moved && Math.hypot(sx - a.s0[0], sy - a.s0[1]) < 3) return;
  a.moved = true;
  const L = shOf(a.it), mx = (L.a[0] + L.b[0]) / 2, my = (L.a[1] + L.b[1]) / 2;
  a.m = [wx + a.off[0], wy + a.off[1]];
  if (a.part.length > 1) {   // Seite eines Kastens: nur Breite bzw. nur Höhe; mit Raster rastet die Seite ein
    const A = [...L.a], B = [...L.b], h = a.part === 'left' || a.part === 'right', v = h ? (S.snap ? snapX(a.m[0]) : a.m[0]) : (S.snap ? snapY(a.m[1]) : a.m[1]), i = h ? 0 : 1;
    const maxSide = a.part === 'right' || a.part === 'bottom';   // die Ecke (a oder b) mit dem größeren bzw. kleineren Wert wandert
    if ((A[i] >= B[i]) === maxSide) A[i] = v; else B[i] = v;
    if (Math.abs(A[i] - B[i]) * S.view.z >= 4) a.tmp = reshape(a.it, { a: A, b: B });
    requestLive(); return;
  }
  if (a.part !== 'm') {   // Anfang oder Spitze versetzen, ein Bogen bleibt; mit Raster rastet das Ende ein
    if (S.snap) a.m = [snapX(a.m[0]), snapY(a.m[1])];
    a.tmp = reshape(a.it, { [a.part]: a.m }); requestLive(); return;
  }
  const straight = Math.hypot(a.m[0] - mx, a.m[1] - my) * S.view.z < 6;   // zurück in die Mitte: wieder gerade
  if (straight) a.m = [mx, my];
  a.tmp = reshape(a.it, { m: straight ? null : a.m });
  requestLive();
}
// Griffe der ausgewählten Grundform: Linie (Anfang, Ende bzw. Spitze, Mitte) oder Kasten (vier Seiten)
function drawEditHandles(ctx, it, z, blue) { if (LINE_SHAPES.has(it.k)) drawLineHandles(ctx, it, z, blue); else if (SHAPE_FILL.has(it.k)) drawBoxHandles(ctx, it, z, blue); }
function drawBoxHandles(ctx, it, z, blue) {
  const h = boxGrips(it), r = 3.5 / z, l = 8 / z;   // kleine Striche quer zur Seite: links/rechts senkrecht, oben/unten waagerecht
  for (const k of ['left', 'right', 'top', 'bottom']) {
    const [x, y] = h[k], vert = k === 'left' || k === 'right', w = vert ? r : l, hh = vert ? l : r;
    liveMark(x - w - 3 / z, y - hh - 3 / z, x + w + 3 / z, y + hh + 3 / z);
    ctx.beginPath(); ctx.roundRect(x - w, y - hh, 2 * w, 2 * hh, r); ctx.fillStyle = S.dark ? '#232427' : '#fff'; ctx.fill();
    ctx.lineWidth = 2.2 / z; ctx.strokeStyle = blue; ctx.stroke();
  }
}
// Punkte einer ausgewählten Linie: Anfang, Ende bzw. Spitze und Mitte
function drawLineHandles(ctx, it, z, blue) { const L = shOf(it); if (!L) return; for (const p of [L.a, L.b, bendPoint(it)]) drawBendHandle(ctx, p, z, blue); }
function drawBendHandle(ctx, p, z, blue) {
  const r = 7 / z, [x, y] = p; liveMark(x - r - 3 / z, y - r - 3 / z, x + r + 3 / z, y + r + 3 / z);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = S.dark ? '#232427' : '#fff'; ctx.fill();
  ctx.lineWidth = 2.5 / z; ctx.strokeStyle = blue; ctx.stroke();
}
// Stil einer Grundform anwenden: erst Kanten runden, dann von Hand; box = umschließendes Rechteck der Form
function styledLines(k, lines, a, box) {
  if (!SHAPE_BASIC.has(k) || (!a.rnd && !a.sl)) return lines;
  const rnd = seeded(a.seed);
  return lines.map(xy => {
    let out = xy, smooth = k === 'ellipse';
    if (a.rnd && SHAPE_CLOSED.has(k)) { out = roundCorners(out, clamp(Math.min(box[2] - box[0], box[3] - box[1]) * 0.16, 3, 26)); smooth = true; }
    if (a.sl) out = out.fl && out.fl.length ? roughArrow(out, a.sl, rnd, a.w) : smooth ? roughSmooth(out, a.sl, rnd, a.w) : roughEdges(out, a.sl, rnd, a.w);
    return out;
  });
}
const isCustom = k => typeof k === 'string' && k.startsWith('custom:');   // eigene Form: 'custom:<id>'
let CUSTOM = [], customReady = false;   // Bibliothek der eigenen Formen (nach Erstellung sortiert), geladen?
const customOf = k => (isCustom(k) && CUSTOM.find(r => 'custom:' + r.id === k)) || null;
S.shape = SHAPE_KINDS.includes(store.get('shape')) || isCustom(store.get('shape')) ? store.get('shape') : 'rect';
// Rasterabstand wie das sichtbare Muster (Ursprung bei 0,0)
function gridSize(n = S.note) { return n && n.bg === 'lines' ? 34 : 28; }
// Abstand, in dem eingerastet wird: wie die sichtbaren Punkte und Linien. Weit herausgezoomt zeigt das Muster nur jeden
// 2., 4., … davon (fillPattern); dann rastet alles auch nur dort ein, sonst lägen Ecken zwischen den sichtbaren Punkten
function snapStep() { const G = gridSize(); let m = 1; while (G * m * S.level < 14) m *= 2; return G * m; }
// Auf Blättern liegt das Muster passend im Blatt: ganze Kästchen, mittig mit gleichem Rand (A3 quer: jede Hälfte
// für sich, wie zwei A4-Blätter nebeneinander). Liefert die inneren Rechtecke [x0, y0, x1, y1] der Felder von Blatt k;
// ihre linke obere Ecke ist der Ursprung des Rasters.
function fieldsOf(k, n = S.note) {
  const [w, h] = paperSize(n), G = gridSize(n), y = k * (h + GAP);
  const edge = len => (len - Math.max(1, Math.floor((len - 1.2 * G) / G)) * G) / 2;   // Rand zwischen 0,6 und 1,1 Kästchen
  const my = edge(h), xs = n.paper.f === 'a3' && n.paper.o === 'l' ? [[0, w / 2], [w / 2, w]] : [[0, w]];
  return xs.map(([a, b]) => { const mx = edge(b - a); return [a + mx, y + my, b - mx, y + h - my]; });
}
/* Cornell-Vorlage (paper.t 'cornell', DIN A4 hoch), wie bei Walter Pauk: oben ein Kopf (Thema, Datum), links eine Spalte
   für Stichworte und Fragen (2,5″ ≈ 6,35 cm), rechts die Notizen, unten die Zusammenfassung (2″ ≈ 5 cm); Stichworte und
   Zusammenfassung zart getönt, der Kopf (Thema) ohne Muster, feine Linien bis zum Blattrand. Die Linien liegen
   auf dem Raster des Blatts (Punkte, Linien und „Am Raster ausrichten“ passen). Zum Lernen lässt sich die Notizen-Spalte
   unscharf machen (S.cornellHide): die Stichworte stehen frei, die Antworten sind verdeckt. */
const isCornell = (n = S.note) => !!(n && n.paper && n.paper.t === 'cornell' && paperSize(n));
function cornellOf(k, n = S.note) {
  const f = fieldsOf(k, n)[0], r = sheetRect(k, n), G = gridSize(n), on = (v, o) => o + Math.round((v - o) / G) * G;
  return { f, r, head: on(r[1] + 24 * MM, f[1]), sum: on(r[1] + (297 - 50) * MM, f[1]), cue: on(63.5 * MM, f[0]) };
}
// Notizen-Spalte eines Blatts (bis zum Rand des Blatts)
function cornellNotes(k, n = S.note) { const c = cornellOf(k, n), r = sheetRect(k, n); return [c.cue, c.head, r[2], c.sum]; }
function cornellNotesAt(x, y) { if (!isCornell()) return -1; const k = sheetAt(y), b = cornellNotes(k); return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] ? k : -1; }
// Zarte Tönung unter dem Muster: Stichworte-Spalte und Zusammenfassung (bis zum Blattrand); c aus cornellOf,
// s Gerätepixel je Welteinheit, offX/offY Lage von (0, 0)
function cornellTint(ctx, c, s, offX, offY) {
  const X = v => offX + v * s, Y = v => offY + v * s;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = isDark() ? 'rgba(150,175,225,.055)' : 'rgba(70,110,175,.05)';
  ctx.fillRect(X(c.r[0]), Y(c.head), (c.cue - c.r[0]) * s, (c.sum - c.head) * s);
  ctx.fillRect(X(c.r[0]), Y(c.sum), (c.r[2] - c.r[0]) * s, (c.r[3] - c.sum) * s);
  ctx.restore();
}
// Haarlinien bis zum Blattrand und Beschriftung in dezenten Kapitälchen (über dem Muster); lw Linienbreite in Gerätepixeln
function drawCornell(ctx, c, s, offX, offY, lw = Math.max(1, DPR)) {
  const X = v => offX + v * s, Y = v => offY + v * s, dark = isDark();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dark ? 'rgba(150,175,225,.36)' : 'rgba(50,95,165,.42)';
  ctx.fillRect(X(c.r[0]), Y(c.head) - lw / 2, (c.r[2] - c.r[0]) * s, lw);   // unter dem Kopf
  ctx.fillRect(X(c.r[0]), Y(c.sum) - lw / 2, (c.r[2] - c.r[0]) * s, lw);    // über der Zusammenfassung
  ctx.fillRect(X(c.cue) - lw / 2, Y(c.head), lw, (c.sum - c.head) * s);      // Stichworte | Notizen
  const fs = 9 * s;
  if (fs >= 4.5) {   // weit herausgezoomt: ohne Beschriftung
    ctx.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`; ctx.textBaseline = 'top'; ctx.fillStyle = dark ? 'rgba(170,190,230,.55)' : 'rgba(55,85,135,.55)';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (1.3 * s).toFixed(2) + 'px';
    const p = 7 * s;
    ctx.fillText('THEMA', X(c.f[0]) + p, Y(c.f[1]) + p * 0.6);
    ctx.fillText('STICHWORTE & FRAGEN', X(c.f[0]) + p, Y(c.head) + p);
    ctx.fillText('NOTIZEN', X(c.cue) + p, Y(c.head) + p);
    ctx.fillText('ZUSAMMENFASSUNG', X(c.f[0]) + p, Y(c.sum) + p);
  }
  ctx.restore();
}
// Ursprung des Rasters in Achse ax (0 = x, 1 = y) beim Wert v: unendliche Fläche 0, sonst Feld bzw. Blatt bei v
function gridOrigin(ax, v) {
  if (!paperSize()) return 0;
  if (ax) return fieldsOf(sheetAt(v))[0][1];
  const fs = fieldsOf(0); return (fs.length > 1 && v >= fs[1][0] - (fs[1][0] - fs[0][2]) / 2 ? fs[1] : fs[0])[0];
}
const snapAx = (ax, v, round = Math.round) => { const o = gridOrigin(ax, v), G = snapStep(); return o + round((v - o) / G) * G; };
const snapX = v => snapAx(0, v), snapY = v => snapAx(1, v);
/* Pfeilspitze wie eine Speerspitze (nach einer Vorlage des Nutzers): gefüllt, hinten nach innen gewölbt. Länge L, halbe
   Breite HEAD_W · L; die Kerbe in der Mitte des hinteren Randes liegt HEAD_N · L vor den hinteren Ecken, dort endet der
   Schaft. Im Strich ist die Spitze eine Fläche (fl): ab der Kerbe der hintere Rand bis zur einen Ecke, die Spitze, die
   andere Ecke, der Rand zurück bis zur Kerbe. Früher gezeichnete Pfeile (offene Spitze aus zwei Flügeln) bleiben, wie sie sind. */
const HEAD_W = 0.42, HEAD_N = 0.12, HEAD_SEG = 4;   // halbe Breite und Kerbe (je Länge), Stücke je Hälfte des hinteren Randes
const headSize = (len, w, f) => Math.min(len * f, 10 + w * 4);
// Spitze bei (tx, ty), u = Richtung zur Spitze, Länge L: Punkte an out (flach x, y) anhängen; liefert [erster, letzter] Punkt
function headPts(out, tx, ty, ux, uy, L) {
  const nx = -uy, ny = ux, H = L * HEAD_W, d = L * HEAD_N, k0 = out.length / 2;
  // hinterer Rand: quadratische Kurve von der Ecke (L, H) über die Kerbe (L − d, 0) zur Ecke (L, −H) (a zurück, b seitlich)
  const at = t => { const s = 1 - t, a = (s * s + t * t) * L + 2 * s * t * (L - 2 * d), b = (s * s - t * t) * H; out.push(tx - ux * a + nx * b, ty - uy * a + ny * b); };
  for (let k = 0; k <= HEAD_SEG; k++) at(0.5 - 0.5 * k / HEAD_SEG);
  out.push(tx, ty);
  for (let k = 0; k <= HEAD_SEG; k++) at(1 - 0.5 * k / HEAD_SEG);
  return [k0, out.length / 2 - 1];
}
// Pfeil von a nach b als Linienzug mit Fläche (fl am Feld): Anfang, dann die Spitze ab der Kerbe
function arrowLine(ax, ay, bx, by, L) {
  const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, out = [ax, ay];
  out.fl = [headPts(out, bx, by, ux, uy, L)];
  return out;
}
// Doppelpfeil: Spitze bei a, Schaft von Kerbe zu Kerbe, Spitze bei b
function arrow2Line(ax, ay, bx, by, L) {
  const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, out = [];
  out.fl = [headPts(out, ax, ay, -ux, -uy, L), headPts(out, bx, by, ux, uy, L)];
  return out;
}
/* Strichschrift für die Beschriftung der Achsen (eigene Zeichnung, wie Normschrift): jedes Zeichen als Linienzüge in
   Einheiten, in denen die x-Höhe 10 ist (Grundlinie y = 0, x-Höhe -10, Großbuchstaben und Ziffern -14, Unterlängen bis 4).
   Ein Linienzug: Punkte „x,y“ und Bögen „(cx,cy,rx,ry,a0,a1)“ (Grad, im Uhrzeigersinn, 0 = rechts, 90 = unten), Linienzüge
   durch „|“ getrennt. x, y und z sind genau die Buchstaben der bisherigen Koordinatensysteme. */
const FONT_SRC = {
  a: '(4,-5,4,5,0,360)|8,-10 8,0', b: '0,-14 0,0|(4,-5,4,5,180,540)', c: '(4.5,-5,4.5,5,320,40)', d: '(4,-5,4,5,0,360)|8,-14 8,0',
  e: '0.2,-5 8,-5 (4,-5,4,5,0,-320)', f: '(5,-11,2.5,3,300,180) 2.5,0|0,-10 6,-10', g: '(4,-5,4,5,0,360)|8,-10 8,1 (4,1,4,3,0,150)',
  h: '0,-14 0,0|0,-6 (4,-6,4,4,180,360) 8,0', i: '1,-10 1,0|1,-13.6 1,-13.2', j: '2.5,-10 2.5,1 (0.5,1,2,3,0,150)|2.5,-13.6 2.5,-13.2',
  k: '0,-14 0,0|7,-10 0,-3.5|2.4,-5.8 7.5,0', l: '1,-14 1,0', m: '0,-10 0,0|0,-7 (2.75,-7,2.75,3,180,360) 5.5,0|5.5,-7 (8.25,-7,2.75,3,180,360) 11,0',
  n: '0,-10 0,0|0,-6 (4,-6,4,4,180,360) 8,0', o: '(4.5,-5,4.5,5,0,360)', p: '0,-10 0,4|(4,-5,4,5,180,540)', q: '(4,-5,4,5,0,360)|8,-10 8,4',
  r: '0,-10 0,0|0,-5.5 (4.5,-5.5,4.5,4.5,180,295)', s: '(4,-7.5,3.5,2.5,330,90) (4,-2.5,4,2.5,270,510)', t: '2.5,-13 2.5,-2 (5,-2,2.5,2,180,90)|0,-10 6,-10',
  u: '0,-10 0,-4 (4,-4,4,4,180,0)|8,-10 8,0', v: '0,-10 4,0 8,-10', w: '0,-10 2.75,0 5.5,-10 8.25,0 11,-10',
  x: '0,-10 8,0|8,-10 0,0', y: '0,-10 5.6,-2.3|9,-10 3,3.5', z: '0,-10 8,-10 0,0 8,0',
  A: '0,0 5,-14 10,0|2,-5 8,-5', B: '0,0 0,-14 5,-14 (5,-10.5,3.5,3.5,270,450) 0,-7|0,-7 5.5,-7 (5.5,-3.5,3.5,3.5,270,450) 0,0',
  C: '(5.5,-7,5.5,7,318,42)', D: '0,0 0,-14 3.5,-14 (3.5,-7,5.5,7,270,450) 0,0', E: '9,-14 0,-14 0,0 9,0|0,-7 7,-7', F: '9,-14 0,-14 0,0|0,-7 7,-7',
  G: '(5.5,-7,5.5,7,318,0) 6.5,-7', H: '0,-14 0,0|9,-14 9,0|0,-7 9,-7', I: '1,-14 1,0', J: '6,-14 6,-3.5 (3,-3.5,3,3.5,0,180)',
  K: '0,-14 0,0|9,-14 0,-5|3.2,-8.4 9,0', L: '0,-14 0,0 8,0', M: '0,0 0,-14 5.5,-4 11,-14 11,0', N: '0,0 0,-14 9,0 9,-14',
  O: '(6,-7,6,7,0,360)', P: '0,0 0,-14 5,-14 (5,-10.5,3.5,3.5,270,450) 0,-7', Q: '(6,-7,6,7,0,360)|7.5,-3.5 11.5,0.5',
  R: '0,0 0,-14 5,-14 (5,-10.5,3.5,3.5,270,450) 0,-7|4.5,-7 9,0', S: '(5,-10.5,4.5,3.5,330,90) (5,-3.5,5,3.5,270,510)',
  T: '0,-14 10,-14|5,-14 5,0', U: '0,-14 0,-4.5 (4.5,-4.5,4.5,4.5,180,0) 9,-14', V: '0,-14 5,0 10,-14', W: '0,-14 3.5,0 7,-14 10.5,0 14,-14',
  X: '0,-14 9,0|9,-14 0,0', Y: '0,-14 5,-7 10,-14|5,-7 5,0', Z: '0,-14 9,-14 0,0 9,0',
  0: '(4.5,-7,4.5,7,0,360)', 1: '1.5,-11 5,-14 5,0', 2: '(4.5,-9.5,4.5,4.5,200,400) 0,0 9,0', 3: '(4.5,-10.5,4,3.5,200,450) (4.5,-3.5,4.5,3.5,270,520)',
  4: '7,0 7,-14 0,-4 9.5,-4', 5: '8.5,-14 1,-14 0.5,-8 (4.5,-4.5,4.5,4.5,233,495)', 6: '(8,-5,8,9,258,180) (4.5,-4.5,4.5,4.5,180,540)',
  7: '0,-14 9,-14 3,0', 8: '(4.5,-10.5,3.8,3.5,0,360)|(4.5,-3.5,4.5,3.5,0,360)', 9: '(4.5,-9.5,4.5,4.5,0,360)|(1,-9,8,9,0,78)',
  '-': '1,-5 7,-5', '−': '0,-5 8,-5', '+': '0,-5 8,-5|4,-9 4,-1', '=': '0,-7 8,-7|0,-3 8,-3', '(': '(5.5,-5.5,4.5,9,245,115)', ')': '(0,-5.5,4.5,9,295,425)',
  '[': '4,-14 1,-14 1,3 4,3', ']': '0,-14 3,-14 3,3 0,3', '/': '0,3 7,-14', '|': '1,-14 1,3', ',': '1.4,-0.6 0,2.6', '.': '0.6,-0.4 0.6,0',
  ':': '0.6,-9.6 0.6,-9.2|0.6,-0.4 0.6,0', ';': '1.2,-9.6 1.2,-9.2|1.4,-0.6 0,2.6', "'": '1.6,-14 0.6,-10.6', '°': '(2.2,-12,2.2,2.2,0,360)',
  '*': '3,-14 3,-8|0.4,-12.5 5.6,-9.5|5.6,-12.5 0.4,-9.5', '%': '(2,-11.5,2,2.5,0,360)|(8,-2.5,2,2.5,0,360)|9,-14 1,0', '<': '8,-10 0,-5 8,0', '>': '0,-10 8,-5 0,0',
  '!': '0.8,-14 0.8,-4|0.8,-0.4 0.8,0', '?': '(4,-10.5,4,3.5,200,450) 4,-4|4,-0.4 4,0', '_': '0,3 8,3', '^': '0,-10 3.5,-14 7,-10', '·': '0.6,-5.2 0.6,-4.8',
  ß: '0,0 0,-11 (3,-11,3,3,180,450) 2,-8|2,-8 (3.5,-4,4,4,270,450) 0.8,0',
  α: '(4,-5,4,5,0,360)|8.6,-10 7.8,-5 9.6,0', β: '0,4 0,-11 (3,-11,3,3,180,450) 2,-8|2,-8 (3.5,-4,4,4,270,450) 0,-0.5', γ: '0,-10 4,0 4,4|8,-10 4,0',
  δ: '(4,-4.5,4,4.5,0,360)|4,-9 1.5,-11.5 3,-14 7.5,-14', ε: '(4.5,-7.5,3.5,2.5,330,90) (4.5,-2.5,4.5,2.5,270,30)', η: '0,-10 0,0|0,-6 (4,-6,4,4,180,360) 8,4',
  θ: '(4,-7,4,7,0,360)|0,-7 8,-7', λ: '0.5,-14 9,0|4.8,-7 0,0', μ: '0,4 0,-10|0,-4 (4,-4,4,4,180,0)|8,-10 8,0', π: '0,-10 10,-10|2.8,-10 2.8,0|7.2,-10 7.2,0',
  ρ: '(4,-5,4,5,0,360)|0,-5 0,4', σ: '(4,-5,4,5,0,360)|4,-10 10,-10', τ: '0,-10 9,-10|4.5,-10 4.5,-2 (6.5,-2,2,2,180,90)', φ: '(5,-5,4.5,5,0,360)|5,-13 5,4',
  ψ: '0,-10 0,-6 (5,-6,5,4,180,0) 10,-10|5,-13 5,4', ω: '0,-9 0,-4 (3,-4,3,4,180,0) 6,-7|6,-4 (9,-4,3,4,180,0) 12,-9',
  Δ: '0,0 5.5,-14 11,0 0,0', Σ: '9,-14 0,-14 5,-7 0,0 9,0', Φ: '(6,-7,5,4.5,0,360)|6,-14 6,0', Ω: '0,0 3.5,0 (6,-8,5.5,6,120,420) 8.5,0 12,0',
};
const FONT = {};
{
  const parse = src => src.split('|').map(part => {
    const pts = [];
    for (const tok of part.match(/\([^)]*\)|-?[\d.]+,-?[\d.]+/g) || []) {
      if (tok[0] !== '(') { pts.push(...tok.split(',').map(Number)); continue; }
      const [cx, cy, rx, ry, a0, a1] = tok.slice(1, -1).split(',').map(Number), n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 10));
      for (let i = 0; i <= n; i++) { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t)); }
    }
    return pts;
  });
  const make = lines => { let w = 0; for (const p of lines) for (let i = 0; i < p.length; i += 2) w = Math.max(w, p[i]); return { lines, w }; };
  for (const [ch, src] of Object.entries(FONT_SRC)) FONT[ch] = make(parse(src));
  // Umlaute: Buchstabe mit zwei Punkten; hoch- und tiefgestellte Ziffern: kleiner, über der x-Höhe bzw. unter der Grundlinie
  const dots = (x1, x2, y) => parse(`${x1},${y} ${x1},${y + 0.4}|${x2},${y} ${x2},${y + 0.4}`);
  for (const [ch, base, x1, x2, y] of [['ä', 'a', 2, 6, -13], ['ö', 'o', 2.5, 6.5, -13], ['ü', 'u', 2, 6, -13], ['Ä', 'A', 3, 7, -17], ['Ö', 'O', 3.5, 8.5, -17], ['Ü', 'U', 2.5, 6.5, -17]])
    FONT[ch] = make([...FONT[base].lines, ...dots(x1, x2, y)]);
  const scaled = (g, s, dy) => make(g.lines.map(p => p.map((v, i) => i % 2 ? v * s + dy : v * s)));
  for (const [d, sup, sub] of ['0⁰₀', '1¹₁', '2²₂', '3³₃', '4⁴₄', '5⁵₅', '6⁶₆', '7⁷₇', '8⁸₈', '9⁹₉']) { FONT[sup] = scaled(FONT[d], 0.55, -6.5); FONT[sub] = scaled(FONT[d], 0.55, 3.5); }
  FONT['∆'] = FONT['Δ']; FONT['µ'] = FONT['μ']; FONT['–'] = FONT['−'];
  // schmale Zeichen stehen etwas eingerückt: rechts gleich viel Luft wie links
  for (const [c, w] of [['i', 2], ['l', 2], ['I', 2], ['j', 3.5], ['!', 1.6], ['.', 1.2], [':', 1.2], [';', 1.6], ['·', 1.2], ['|', 2], ["'", 2.2]]) FONT[c] = { ...FONT[c], w };
}
// Text als Linienzüge in Schrift-Einheiten, dazu Breite und Ober-/Unterkante der Striche; unbekannte Zeichen als „?“
function textPolys(str) {
  const lines = []; let x = 0, top = Infinity, bot = -Infinity;
  for (const ch of String(str || '').trim()) {
    if (ch === ' ') { x += 5; continue; }
    const g = FONT[ch] || FONT['?'];
    for (const p of g.lines) {
      const q = p.map((v, i) => i % 2 ? v : v + x); lines.push(q);
      for (let i = 1; i < q.length; i += 2) { top = Math.min(top, q[i]); bot = Math.max(bot, q[i]); }
    }
    x += g.w + 2.6;
  }
  return { lines, w: Math.max(0, x - 2.6), top, bot };
}
// Beschriftung in Weltkoordinaten an out anhängen: x-Höhe h; ax 0 = links bündig an x, 1 = rechts bündig;
// ay 'top' = Oberkante der Striche bei y, 'mid' = Striche senkrecht mittig um y
function placeText(out, str, x, y, h, ax, ay) {
  const t = textPolys(str), k = h / 10;
  if (!t.lines.length) return;
  const ox = x - ax * t.w * k, oy = ay === 'mid' ? y - (t.top + t.bot) / 2 * k : y - t.top * k;
  for (const p of t.lines) out.push(p.map((v, i) => i % 2 ? oy + v * k : ox + v * k));
}
// Beschriftung um 90° gedreht, von unten nach oben zu lesen (wie an der y-Achse in Büchern), senkrecht mittig um cy;
// ihre rechte Seite (Grundlinie bzw. Unterlängen, zur Achse hin) liegt bei x = xr
function placeTextUp(out, str, xr, cy, h) {
  const t = textPolys(str), k = h / 10;
  if (!t.lines.length) return;
  const bx = xr - Math.max(0, t.bot) * k;   // Grundlinie
  for (const p of t.lines) { const q = []; for (let i = 0; i < p.length; i += 2) q.push(bx + p[i + 1] * k, cy - (p[i] - t.w / 2) * k); out.push(q); }
}
// Beschriftungen mit mehr als 2 Zeichen stehen mittig an der Achse, kürzere an der Pfeilspitze
const longLabel = s => [...String(s || '').trim()].length > 2;
// Endpunkte nach Raster, Umschalt (gerade/quadratisch) und sanftem Magnet
function shapeEnds(a) {
  const k = a.shape, snapOn = S.snap, G = snapStep();
  let [ax, ay] = a.a0, [bx, by] = a.b;
  if (snapOn) { ax = snapX(ax); ay = snapY(ay); }
  const unit = q => { let ux = Math.cos(q), uy = Math.sin(q); if (Math.abs(ux) < 1e-9) ux = 0; if (Math.abs(uy) < 1e-9) uy = 0; return [ux, uy]; };
  if (LINE_SHAPES.has(k)) {
    const dx = bx - ax, dy = by - ay, ang = Math.atan2(dy, dx);
    if (a.shift) {   // 15°-Schritte
      const q = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12), [ux, uy] = unit(q);
      const k45 = Math.round(q / (Math.PI / 4)), on45 = Math.abs(q - k45 * Math.PI / 4) < 1e-9;
      let L = Math.max(0, dx * ux + dy * uy);
      if (snapOn) { const st = on45 && k45 % 2 ? G * Math.SQRT2 : G; L = Math.round(L / st) * st; }
      bx = ax + L * ux; by = ay + L * uy;
      if (snapOn && on45) { bx = snapX(bx); by = snapY(by); }
    } else if (snapOn) { bx = snapX(bx); by = snapY(by); }
    else {           // fast waagrecht, senkrecht oder diagonal: genau ausrichten
      const q = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(ang - q) < 4 * Math.PI / 180) { const L = Math.hypot(dx, dy), [ux, uy] = unit(q); bx = ax + L * ux; by = ay + L * uy; }
    }
    return [ax, ay, bx, by];
  }
  if (snapOn) { bx = snapX(bx); by = snapY(by); }
  let dx = bx - ax, dy = by - ay;
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1, adx = Math.abs(dx), ady = Math.abs(dy);
  if (a.shift && k === 'tri') {   // gleichseitig
    let s = Math.max(adx, ady * 2 / Math.sqrt(3)); if (snapOn) s = Math.max(G, Math.round(s / G) * G);
    dx = sx * s; dy = sy * s * Math.sqrt(3) / 2;
  } else if (a.shift || (SQUARE_MAGNET.has(k) && adx && ady && Math.abs(adx - ady) <= 0.08 * Math.max(adx, ady))) {
    const s = Math.max(adx, ady); dx = sx * s; dy = sy * s;
  }
  return [ax, ay, ax + dx, ay + dy];
}
// Linienzüge (flach: x, y, x, y, …) einer Form in Weltkoordinaten
function shapeLines(k, ax, ay, bx, by, w) {
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1e-6) return [];
  if (k === 'line') return [[ax, ay, bx, by]];
  if (k === 'arrow') return [arrowLine(ax, ay, bx, by, headSize(len, w, 0.4))];
  if (k === 'arrow2') return [arrow2Line(ax, ay, bx, by, headSize(len, w, 0.3))];
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (k === 'rect') return [[ax, ay, bx, ay, bx, by, ax, by, ax, ay]];
  if (k === 'tri') return [[cx, y0, x1, y1, x0, y1, cx, y0]];
  if (k === 'rtri') return [[ax, ay, ax, by, bx, by, ax, ay]];
  if (k === 'diamond') return [[cx, y0, x1, cy, cx, y1, x0, cy, cx, y0]];
  if (k === 'ellipse') {
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const n = clamp(Math.round(per / 16) * 4, 36, 240), P = [];   // durch 4 teilbar: berührt alle vier Seiten der Box
    for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; P.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t)); }
    P.push(P[0], P[1]);
    return [P];
  }
  return graphLines(graphParams(k, x0, y0, x1, y1), w);
}
/* Koordinatensysteme: Achsen mit Pfeilspitzen, Teilstriche, Beschriftung der Achsen. Jeder Strich eines Graphen trägt
   seine Daten (gr): Art k, Rechteck b, Ursprung o, Abstand der Teilstriche step (in Kästchen der Rasterweite G),
   Maßstab f (1 beim Zeichnen, wächst und schrumpft mit, wenn der Graph mit dem Lasso skaliert wird) und die
   Beschriftungen lx, ly, lz. Daraus lässt er sich jederzeit neu zeichnen (Einstellungen nachträglich ändern). */
function graphParams(k, x0, y0, x1, y1) {
  const snx = v => S.snap ? snapX(v) : v, sny = v => S.snap ? snapY(v) : v;
  // 3D: Schrägbild, z nach oben, y nach rechts, x nach vorne (45° nach links unten, halbe Einheiten)
  const o = k === 'axes3' ? [snx(x0 + 0.4 * (x1 - x0)), sny(y0 + 0.6 * (y1 - y0))] : k === 'axes2p' ? [x0, y1] : [snx((x0 + x1) / 2), sny((y0 + y1) / 2)];
  return { k, b: [x0, y0, x1, y1], o, G: gridSize(), f: 1, ...newGraphSettings(k) };
}
// Einstellungen für einen neuen Graphen der Art k (3D hat eigene Beschriftungen)
function newGraphSettings(k) {
  const s = S.graph, d3 = k === 'axes3';
  return { step: s.step, lx: d3 ? s.lx3 : s.lx, ly: d3 ? s.ly3 : s.ly, lz: s.lz };
}
// Linienzüge eines Koordinatensystems; w: Strichbreite. Alle Maße wie bei einem neu gezeichneten Graphen der Breite w / f, mal f
function graphLines(p, w) {
  const [x0, y0, x1, y1] = p.b, [ox, oy] = p.o, f = p.f > 0 ? p.f : 1, w0 = w / f, out = [];
  const U = (p.step > 0 ? p.step : 1) * (p.G > 0 ? p.G : gridSize()) * f;   // Abstand der Teilstriche
  const th = f * Math.max(4, w0 * 1.5), LH = f * (13 + Math.max(0, w0 - 2) * 2.5), m = 3 * f, cap = f * (10 + w0 * 2.5);
  const gx = f * (7 + w0), gy = f * (8 + w0), half = h => Math.max(th, h * HEAD_W);   // Abstand der Beschriftung zur Achse
  const axis = (fx, fy, tx, ty) => { const L = Math.hypot(tx - fx, ty - fy); if (L < 0.5 * f) return -1; const h = Math.min(L * 0.35, cap); out.push(arrowLine(fx, fy, tx, ty, h)); return h; };
  const corner = p.k === 'axes2p';   // Ursprung in der Ecke: daneben ist nichts, eine lange Beschriftung darf dort anfangen
  // waagrechte Achse mit der Spitze bei tx: kurze Beschriftung unter der Spitze, lange mittig unter der Achse zwischen
  // Ursprung und Spitze (nicht über den Ursprung hinaus, dort kreuzt sonst die senkrechte Achse)
  const labelX = (s, tx, h) => {
    if (!longLabel(s)) { placeText(out, s, tx, oy + half(h) + gx, LH, 1, 'top'); return; }
    const W = textPolys(s).w * LH / 10, lo = corner ? ox : ox + th + gx;
    placeText(out, s, Math.max((ox + tx) / 2, lo + W / 2), oy + th + gx, LH, 0.5, 'top');
  };
  // senkrechte Achse mit der Spitze bei ty: kurze Beschriftung links neben der Spitze, lange gedreht (von unten nach oben
  // zu lesen) mittig links neben der Achse zwischen Ursprung und Spitze
  const labelY = (s, ty, h) => {
    if (!longLabel(s)) { placeText(out, s, ox - half(h) - gy, ty, LH, 1, 'top'); return; }
    const W = textPolys(s).w * LH / 10, hi = corner ? oy : oy - th - gx;
    placeTextUp(out, s, ox - th - gx, Math.min((oy + ty) / 2, hi - W / 2), LH);
  };
  if (p.k === 'axes3') {
    const d = Math.max(0, Math.min(ox - x0, y1 - oy)), r = Math.SQRT1_2;
    const hz = axis(ox, oy, ox, y0), hy = axis(ox, oy, x1, oy), hx = axis(ox, oy, ox - d, oy + d);
    if (hy >= 0) { for (let i = 1; i <= Math.floor((x1 - ox - hy - m) / U); i++) out.push([ox + i * U, oy - th, ox + i * U, oy + th]); labelX(p.ly, x1, hy); }
    if (hz >= 0) { for (let i = 1; i <= Math.floor((oy - y0 - hz - m) / U); i++) out.push([ox - th, oy - i * U, ox + th, oy - i * U]); labelY(p.lz, y0, hz); }
    if (hx >= 0) {
      for (let i = 1; i <= Math.floor((d * Math.SQRT2 - hx - m) / (U * r)); i++) { const px = ox - i * U / 2, py = oy + i * U / 2; out.push([px - th * r, py - th * r, px + th * r, py + th * r]); }
      placeText(out, p.lx, ox - d - gy, oy + d, LH, 1, 'mid');
    }
    return out;
  }
  const pos = corner;
  const hx = axis(x0, oy, x1, oy), hy = axis(ox, y1, ox, y0);
  let nx = Math.floor((x1 - ox - hx - m) / U), ny = Math.floor((oy - y0 - hy - m) / U);
  if (!pos) { nx = Math.min(nx, Math.floor((ox - x0 - hx - m) / U)); ny = Math.min(ny, Math.floor((y1 - oy - hy - m) / U)); }
  if (hx >= 0) {
    for (let i = pos ? 1 : -nx; i <= nx; i++) if (i) out.push([ox + i * U, oy - th, ox + i * U, oy + th]);
    labelX(p.lx, x1, hx);
  }
  if (hy >= 0) {
    for (let i = pos ? 1 : -ny; i <= ny; i++) if (i) out.push([ox - th, oy - i * U, ox + th, oy - i * U]);
    labelY(p.ly, y0, hy);
  }
  return out;
}
function shapeStroke(xy, c, w, k, g, gr) {
  const n = xy.length / 2, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = xy[i * 2]; p[i * 3 + 1] = xy[i * 2 + 1]; p[i * 3 + 2] = 0.5; }
  const s = { t: 's', id: uid(), c, w, hl: false, pts: p, bb: bboxOf(p, w), k };
  if (xy.fl) s.fl = xy.fl.map(r => [r[0], r[1]]);   // gefüllte Pfeilspitzen
  if (g) s.g = g;
  if (gr) s.gr = gr;
  return s;
}
// Striche + Pfade der Vorschau; neu berechnet nur, wenn sich etwas geändert hat
function shapeGeo(a) {
  if (a.custom) return stampGeo(a);
  const small = Math.hypot(a.b[0] - a.a0[0], a.b[1] - a.a0[1]) * S.view.z < 6;
  const key = small ? 'small' : a.b[0] + ',' + a.b[1] + ',' + a.shift + ',' + S.snap + ',' + gridSize() + ',' + snapStep();
  if (a.geo && a.geo.key === key) return a.geo;
  const strokes = [];
  if (!small) {
    const [ax, ay, bx, by] = shapeEnds(a);
    // Koordinatensystem: alle Striche tragen dieselben Daten, damit es sich später neu zeichnen lässt
    const gr = GRAPHS.has(a.shape) && Math.hypot(bx - ax, by - ay) >= 1e-6 ? graphParams(a.shape, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)) : null;
    const box = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
    const line = !gr && LINE_SHAPES.has(a.shape);
    for (const xy of gr ? graphLines(gr, a.w) : line ? lineXY(a.shape, [ax, ay], [bx, by], null, a.w, a.sl || 0, a.seed) : styledLines(a.shape, shapeLines(a.shape, ax, ay, bx, by, a.w), a, box)) {
      const st = shapeStroke(xy, a.c, a.w, a.shape, a.g, gr);
      if (!gr && a.ds && a.ds !== 'solid' && SHAPE_BASIC.has(a.shape)) st.ds = a.ds;   // gestrichelt oder gepunktet
      if (!gr && a.fs && a.fs !== 'none' && SHAPE_FILL.has(a.shape)) st.fs = a.fs;   // Füllung
      if (!gr && SHAPE_BASIC.has(a.shape)) st.sh = { a: [ax, ay], b: [bx, by], rnd: a.rnd || 0, sl: a.sl || 0, seed: a.seed || 1 };   // zum Neurechnen (Stil ändern, biegen)
      strokes.push(st);
    }
  }
  return a.geo = { key, strokes, paths: strokes.map(s => buildPath(s.pts, s.w, false, s.fl, s.ds)) };
}
/* Eigene Formen platzieren: Antippen = gespeicherte Größe, mittig auf dem Punkt; Ziehen = gleichmäßig in das
   aufgezogene Rechteck eingepasst, an seiner oberen linken Ecke (nie gespiegelt). Mit Raster liegt die geometrische
   obere linke Ecke der Form auf dem Raster. Strichbreiten wachsen mit, Farben bleiben wie gespeichert. */
const STAMP_BIG = 4000;              // ab so vielen Punkten wird die Vorschau beim Ziehen nur skaliert (flüssig)
const stampInfo = new WeakMap();     // Form -> { n: Punkte, paths, bbs }, einmal berechnet
function stampData(r) {
  let d = stampInfo.get(r);
  if (!d) { d = { n: r.strokes.reduce((m, st) => m + st.pts.length / 3, 0), paths: null, bbs: null }; stampInfo.set(r, d); }
  return d;
}
// Maßstab und obere linke Ecke der platzierten Form
function stampPlace(a, tap) {
  const r = a.custom, G = snapStep();
  if (tap) {
    let x = a.a0[0] - r.w / 2, y = a.a0[1] - r.h / 2;
    if (S.snap) { x = snapX(x); y = snapY(y); }
    return [1, x, y];
  }
  let [ax, ay] = a.a0, [bx, by] = a.b;
  if (S.snap) { ax = snapX(ax); ay = snapY(ay); bx = snapX(bx); by = snapY(by); }
  let dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  if (S.snap) { dx = Math.max(dx, G); dy = Math.max(dy, G); }   // mindestens ein Kästchen
  const m = Math.max(r.w, r.h);
  let s = 1;
  if (m > 0.5) {   // ein einzelner Punkt behält seine Größe
    s = Math.min(r.w > 0.01 ? dx / r.w : Infinity, r.h > 0.01 ? dy / r.h : Infinity);
    s = clamp(s, Math.min(1, Math.max(0.05, 12 / S.view.z / m)), 50);   // nie kleiner als ~12 px am Bildschirm
  }
  return [s, Math.min(ax, bx), Math.min(ay, by)];
}
// Striche der platzierten Form: Maßstab s, obere linke Ecke (x, y), gemeinsame Gruppe g
function stampStrokes(r, s, x, y, g) {
  return r.strokes.map(st => {
    const q = st.pts, p = new Float32Array(q.length), w = st.w * s;
    for (let i = 0; i < q.length; i += 3) { p[i] = x + q[i] * s; p[i + 1] = y + q[i + 1] * s; p[i + 2] = q[i + 2]; }
    const k = { t: 's', id: uid(), c: st.c, w, hl: st.hl, pts: p, bb: bboxOf(p, w), k: 'custom', g };
    if (st.al) k.al = st.al;
    if (st.fl) k.fl = st.fl.map(r => [r[0], r[1]]);
    if (st.ds) k.ds = st.ds;
    if (st.fs) k.fs = st.fs;
    return k;
  });
}
function stampGeo(a) {
  const r = a.custom, tap = Math.hypot(a.b[0] - a.a0[0], a.b[1] - a.a0[1]) * S.view.z < 6;
  const key = (tap ? 'tap' : a.b[0] + ',' + a.b[1] + ',' + S.view.z) + ',' + S.snap + ',' + snapStep();
  if (a.geo && a.geo.key === key) return a.geo;
  const [s, x, y] = stampPlace(a, tap);
  if (!tap && stampData(r).n > STAMP_BIG) {   // große Form: ihre fertigen Pfade nur verschieben und skalieren
    const d = stampData(r);
    if (!d.paths) { d.paths = r.strokes.map(st => buildPath(st.pts, st.w, st.hl, st.fl, st.ds)); d.bbs = r.strokes.map(st => bboxOf(st.pts, st.w)); }
    const strokes = r.strokes.map((st, i) => { const b = d.bbs[i]; return { t: 's', c: st.c, hl: st.hl, bb: [x + b[0] * s, y + b[1] * s, x + b[2] * s, y + b[3] * s] }; });
    return a.geo = { key, strokes, paths: d.paths, xf: [s, x, y], box: true };
  }
  const strokes = stampStrokes(r, s, x, y, a.g);
  return a.geo = { key, strokes, paths: strokes.map(k => buildPath(k.pts, k.w, k.hl, k.fl, k.ds)), box: true };
}
// Vorschau kachelweise, wie renderTile: unter der Form die Kachelpixel (deckend), darauf die Striche mit der Kachel
// als Clip. Skia glättet Kanten abhängig vom Clip; so entstehen genau die Pixel, die später in der Kachel stehen,
// und deckende Pixel zeigt der Browser über der Hauptebene unverändert.
// Kleine Rechtecke (Gerätepixel bei Stufe s) entlang der Linienzüge: nur dort ändert die Form Pixel
function shapeRects(g, s) {
  if (g.rects && g.rects.s === s) return g.rects;
  const out = [], CH = 64;
  out.s = s;
  for (const k of g.strokes) {
    const p = k.pts, m = k.w * s / 2 + 3;   // Radius + Kantenglättung
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const flush = () => { if (x0 <= x1) out.push([Math.floor(x0 - m), Math.floor(y0 - m), Math.ceil(x1 + m), Math.ceil(y1 + m)]); x0 = y0 = Infinity; x1 = y1 = -Infinity; };
    for (let i = 3; i < p.length; i += 3) {
      const ax = p[i - 3] * s, ay = p[i - 2] * s, bx = p[i] * s, by = p[i + 1] * s, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / CH));
      for (let q = 0; q < n; q++) {
        const ux = ax + (bx - ax) * q / n, uy = ay + (by - ay) * q / n, vx = ax + (bx - ax) * (q + 1) / n, vy = ay + (by - ay) * (q + 1) / n;
        if (Math.max(x1, ux, vx) - Math.min(x0, ux, vx) > CH || Math.max(y1, uy, vy) - Math.min(y0, uy, vy) > CH) flush();
        x0 = Math.min(x0, ux, vx); y0 = Math.min(y0, uy, vy); x1 = Math.max(x1, ux, vx); y1 = Math.max(y1, uy, vy);
      }
    }
    flush();
  }
  return g.rects = out;
}
// Große eigene Form beim Ziehen: einmal als Bild zeichnen und nur skaliert zeigen (flüssig).
// Genau gerechnet wird beim Absetzen (Kacheln werden neu gezeichnet).
function liveStampBitmap(a, xf) {
  const r = a.custom, d = stampData(r), s = xf[0], k = DPR * S.view.z * s;
  const m = r.strokes.reduce((v, st) => Math.max(v, st.w), 1), [sx, sy] = toScreen(xf[1] - m * s, xf[2] - m * s);
  const ox = sx * DPR, oy = sy * DPR, fx = ox - Math.floor(ox), fy = oy - Math.floor(oy);
  // In genauer Größe und auf ganze Gerätepixel ausgerichtet nachzeichnen, damit die Vorschau scharf bleibt;
  // bei sehr großen Formen nicht öfter, als es ihre Zeichendauer erlaubt
  const now = performance.now(), b0 = d.bmp, wait = b0 ? Math.max(40, b0.cost * 3) : 0;
  const off = b0 && (Math.abs(k / b0.k - 1) > 0.005 || Math.abs(fx - b0.fx) > 0.02 || Math.abs(fy - b0.fy) > 0.02);
  if (off && !b0.pend) { b0.pend = true; setTimeout(() => { if (d.bmp) d.bmp.pend = false; requestLive(); }, wait); }
  if (!b0 || b0.dark !== S.dark || k / b0.k > 1.5 || k / b0.k < 0.6 || (off && now - b0.t > wait)) {
    const kk = Math.min(k, Math.sqrt(4e6 / ((r.w + 2 * m) * (r.h + 2 * m))));   // höchstens ~4 Mio. Pixel
    const c = b0 ? b0.c : document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((r.w + 2 * m) * kk) + 1); c.height = Math.max(1, Math.ceil((r.h + 2 * m) * kk) + 1);
    const cx = c.getContext('2d'); cx.setTransform(kk, 0, 0, kk, m * kk + fx, m * kk + fy);
    r.strokes.forEach((st, i) => shapeDraw(cx, st, d.paths[i]));
    d.bmp = { c, k: kk, fx, fy, dark: S.dark, t: performance.now(), cost: performance.now() - now, pend: false };
  }
  const b = d.bmp, q = k / b.k, x = ox - b.fx * q, y = oy - b.fy * q, w = b.c.width * q, h = b.c.height * q;
  ctxLive.setTransform(1, 0, 0, 1, 0, 0); liveMarkDev(x - 2, y - 2, x + w + 2, y + h + 2);
  ctxLive.drawImage(b.c, x, y, w, h);
  liveWorld();
}
// Ruht der Stift, zeigt die Vorschau einer großen Form die genaue Geometrie (wie später in den Kacheln)
function stampRest(a) {
  a.restT = null;
  if (action !== a) return;
  const t = performance.now() - (a.mt || 0);
  if (t >= 180) { a.rest = true; requestLive(); } else a.restT = setTimeout(() => stampRest(a), 190 - t);
}
function exactStamp(a, g) {
  if (!a.exact || a.exact.key !== g.key) { const st = stampStrokes(a.custom, ...g.xf, a.g); a.exact = { key: g.key, strokes: st, paths: st.map(k => buildPath(k.pts, k.w, k.hl, k.fl, k.ds)), box: true }; }
  return a.exact;
}
function liveShape(a) {
  let g = shapeGeo(a); if (!g.strokes.length) return;
  let xf = g.xf;
  if (xf) {
    if (!a.rest) { liveStampBitmap(a, xf); if (!a.restT) a.restT = setTimeout(() => stampRest(a), 190); return; }
    g = exactStamp(a, g); xf = null;
  }
  const ctx = ctxLive, cb = contentBox(g.strokes);
  liveMark(cb[0], cb[1], cb[2], cb[3], 5);   // die Rechtecke mit Kachelpixeln liegen höchstens 3 Gerätepixel um die Striche
  if (S.view.z !== S.level) {   // mitten im Zoomen
    if (xf) ctx.transform(xf[0], 0, 0, xf[0], xf[1], xf[2]);
    g.strokes.forEach((k, n) => shapeDraw(ctx, k, g.paths[n]));
    liveWorld(); return;
  }
  const L = S.level, s = L * DPR, r = tileRange(L), bb = contentBox(g.strokes);
  // eigene Formen sind kompakt: ein Rechteck um die ganze Form statt Stücken entlang der Linien
  const rects = g.box || g.strokes.some(k => k.fs) ? [[Math.floor(bb[0] * s - 3), Math.floor(bb[1] * s - 3), Math.ceil(bb[2] * s + 3), Math.ceil(bb[3] * s + 3)]] : shapeRects(g, s);
  const i0 = Math.max(r.i0, Math.floor(bb[0] * s / T)), i1 = Math.min(r.i1, Math.floor(bb[2] * s / T));
  const j0 = Math.max(r.j0, Math.floor(bb[1] * s / T)), j1 = Math.min(r.j1, Math.floor(bb[3] * s / T));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const ox = i * T, oy = j * T, sx = ox + r.txD, sy = oy + r.tyD, wb = [ox / s, oy / s, (ox + T) / s, (oy + T) / s];
    let t = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const q of rects) {
      const x0 = Math.max(q[0] - ox, 0), y0 = Math.max(q[1] - oy, 0), x1 = Math.min(q[2] - ox, T), y1 = Math.min(q[3] - oy, T);
      if (x1 <= x0 || y1 <= y0) continue;
      if (!t) t = tiles.get(tkey(L, i, j)) || renderTile(L, i, j);
      ctx.drawImage(t.c, x0, y0, x1 - x0, y1 - y0, sx + x0, sy + y0, x1 - x0, y1 - y0);
    }
    if (!t) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, T, T); ctx.clip();
    ctx.setTransform(s, 0, 0, s, r.txD, r.tyD);
    if (xf) ctx.transform(xf[0], 0, 0, xf[0], xf[1], xf[2]);
    g.strokes.forEach((k, n) => { if (boxHit(k.bb, wb)) shapeDraw(ctx, k, g.paths[n]); });   // einzeln, genau wie renderTile
    ctx.restore();
  }
  liveWorld();
}
function finishShape(a) {
  const g = shapeGeo(a);
  liveClear();
  if (!g.strokes.length) { requestLive(); return; }
  liveWorld(); liveShape(a);   // Live-Ebene zeigt jetzt genau die endgültige Form
  // große eigene Form: genaue Striche, die Kacheln werden sofort neu gezeichnet (die Vorschau war nur ein Bild)
  const ex = g.xf && exactStamp(a, g), list = ex ? ex.strokes : g.strokes;
  list.forEach((s, i) => pathCache.set(s, (ex || g).paths[i]));
  // Textmarker in einer eigenen Form: Kacheln neu zeichnen statt Pixel übernehmen
  if (g.xf) { const d = stampData(a.custom); if (d.bmp) { d.bmp.c.width = 0; d.bmp = null; } }   // Vorschaubild freigeben
  commitLive(list, list.some(s => s.hl) || !!g.xf, !!a.custom);
  setSel(withGroups(new Set(list.map(s => s.id))), true);   // bleibt ausgewählt (nur im Formen-Werkzeug): Stil, Farbe, Dicke ändern, biegen
}
// Auswahl beim Skalieren: geometrischer rechter (bei hohen Auswahlen unterer) Rand aufs Raster
function snapScale(a) {
  const b = selGridBox(a), [ax, ay] = a.anchor, G = snapStep(), ex = b[2] - ax, ey = b[3] - ay;
  const e = Math.max(ex, ey), o = ex >= ey ? ax : ay;
  if (!(e >= G / 2)) return a.s;
  let t = snapAx(ex >= ey ? 0 : 1, o + e * a.s);
  while (t <= o + 1e-6) t += G;
  return clamp((t - o) / e, 0.05, 50);
}
function toggleSnap() {
  S.snap = !S.snap; store.set('snap', S.snap); $('#bSnap').classList.toggle('on', S.snap);
  toast('Am Raster ausrichten: ' + (S.snap ? 'an' : 'aus'), 1400);
  if (action && action.kind === 'shape') requestLive();
}

/* ---------- Eingabe: Stift, Maus, Finger ---------- */
let action = null;           // aktuelle Stift-/Maus-Aktion
const touches = new Map();   // aktive Finger
let gesture = null, penActiveUntil = 0, spaceDown = false;

function capture(e) { try { cvLive.setPointerCapture(e.pointerId); } catch (err) {} }
function localXY(e, r = cvLive.getBoundingClientRect()) { return [e.clientX - r.left, e.clientY - r.top]; }
function pressureOf(e) { return e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.05, 1) : 0.5; }

// Eingabefilter: glättet die Stiftposition schon beim Schreiben, so stark wie eingestellt (S.smooth).
// Verfahren wie der 1€-Filter (Casiez, Roussel, Vogel, CHI 2012): ein Tiefpass, dessen Grenzfrequenz mit der
// Geschwindigkeit steigt. Langsam geschrieben, wo Zittern auffällt, glättet er stark; schnell geschrieben, wo Nachlauf
// auffällt, kaum. So bleiben Buchstaben in Form (ein fester Filter rundet sie bei Tempo ab, aus einem n wird ein h).
// Gefiltert wird in Bildschirmpunkten und nach der Zeit der Ereignisse, damit die Wirkung weder vom Zoom noch von der
// Abtastrate des Stifts abhängt. Über 50 % kommt eine zweite gleiche Stufe dazu (nimmt Zittern stärker weg als eine
// Stufe mit gleichem Nachlauf). 50 % entspricht der früheren festen Glättung. Beim Absetzen holt der Strich bis zur
// Stiftspitze auf. Gespeichert wird genau das, was auf dem Bildschirm zu sehen ist, nichts ändert sich danach.
const logLerp = (a, b, t) => a * Math.pow(b / a, t);
// S.smooth → Grenzfrequenz in Ruhe (Hz), Anstieg je px/s, Glättung der Geschwindigkeit (Hz), Anteil der zweiten Stufe
function smoothParams(s) {
  if (s <= 0.5) { const t = s / 0.5; return { fmin: logLerp(120, 17.3, t), beta: logLerp(0.08, 0.0475, t), dcut: 8, w2: 0 }; }
  const t = Math.sqrt((s - 0.5) / 0.5);
  return { fmin: logLerp(17.3, 1.5, t), beta: logLerp(0.0475, 0.005, t), dcut: logLerp(8, 0.5, t), w2: t };
}
const alphaOf = (fc, dt) => 1 / (1 + 1 / (2 * Math.PI * fc * dt));
// ein Schritt mit der Stiftposition (Bildschirm) zur Zeit t (ms); Druck wird immer leicht geglättet
function filterStep(a, x, y, p, t) {
  const f = a.f, g = a.g, P = a.P;
  f.p += (p - f.p) * 0.35; g.p = f.p;
  if (!P) { f.x = g.x = x; f.y = g.y = y; return; }   // Glättung aus
  const dt = clamp((t - f.t) / 1000, 0.001, 0.05); f.t = t;
  const ad = alphaOf(P.dcut, dt);
  f.vx += ((x - f.x) / dt - f.vx) * ad; f.vy += ((y - f.y) / dt - f.vy) * ad;
  const al = alphaOf(P.fmin + P.beta * Math.hypot(f.vx, f.vy), dt), a2 = 1 - (1 - al) * P.w2;
  f.x += (x - f.x) * al; f.y += (y - f.y) * al;
  g.x += (f.x - g.x) * a2; g.y += (f.y - g.y) * a2;
}
// Ausgang anhängen (in Weltkoordinaten), wenn er sich auf dem Bildschirm genug bewegt hat
function pushFiltered(a) {
  const g = a.g;
  if (Math.hypot(g.x - a.last[0], g.y - a.last[1]) < 0.8) return false;
  a.last = [g.x, g.y]; const [wx, wy] = a.toW(g.x, g.y); a.pts.push(wx, wy, g.p); return true;
}
// Filter für einen neuen Strich ab (x, y) auf dem Bildschirm zur Zeit t
function smoothStart(x, y, p, t, toW = toWorld) {
  return { pts: [...toW(x, y), p], f: { x, y, p, t, vx: 0, vy: 0 }, g: { x, y, p }, P: S.smooth > 0 ? smoothParams(S.smooth) : null, last: [x, y], raw: null, toW };
}
function strokeInput(a, sx, sy, p, t) {
  a.raw = [sx, sy, p, t];
  filterStep(a, sx, sy, p, t);
  const pushed = pushFiltered(a);
  if (a.holdT !== undefined && Math.hypot(sx - a.still[0], sy - a.still[1]) > 4) { a.still = [sx, sy]; armHold(a); }
  if (a.redraw || a.hlInc) requestLive(); else if (pushed) livePiece(a);
}
// Halten zum Begradigen (Textmarker, Tape): bleibt der Stift eine knappe halbe Sekunde fast still, wird der Strich zur
// Geraden vom Anfang bis zum Stift, Weiterziehen dreht und verlängert sie (wie bei Goodnotes)
function armHold(a) {
  clearTimeout(a.holdT);
  a.holdT = setTimeout(() => { if (action === a && !a.straight && a.pts.length > 9) { a.straight = a.redraw = true; liveClear(); requestLive(); } }, 450);
}
// Gerade vom Anfang bis zum Stift; fast waagerecht oder senkrecht wird genau waagerecht bzw. senkrecht
function straightPts(a) {
  const [x0, y0] = toWorld(...a.start), [x1, y1] = a.raw ? toWorld(a.raw[0], a.raw[1]) : [x0, y0];
  const ang = Math.abs(Math.atan2(y1 - y0, x1 - x0)) * 180 / Math.PI;
  let ex = x1, ey = y1;
  if (ang < 4 || ang > 176) ey = y0; else if (Math.abs(ang - 90) < 4) ex = x0;
  return [x0, y0, a.g.p, ex, ey, a.g.p];
}
const pathLen = p => { let L = 0; for (let i = 3; i < p.length; i += 3) L += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]); return L; };
// Beim Absetzen: der Strich läuft bis dorthin weiter, wo der Stift abgehoben hat (bei starker Glättung endet er sonst zu früh)
function catchUp(a) {
  const [x, y, p] = a.raw, g = a.g; let t = a.raw[3];
  for (let i = 0; i < 400 && Math.hypot(x - g.x, y - g.y) > 0.5; i++) { t += 4; filterStep(a, x, y, p, t); pushFiltered(a); }
}
function settleStroke(a) { if (a.raw) { catchUp(a); livePiece(a); } }
// Textmarker auf der Live-Ebene (in der Ansicht der Seite), mit dem Bereich, den er berührt hat
function hlLivePage(a) {
  const { tx, ty, z } = S.view, R = hlLive(ctxLive, a, DPR * z, DPR * tx, DPR * ty);
  if (R) liveMarkDev(R[0], R[1], R[2], R[3]);
}
// noch ein Antippen (wie beim Loslassen geprüft): das Tape erscheint erst danach (sonst blitzte ein dünnes Stück auf)
const tapTiny = (r, start, pts, z) => Math.hypot(r[0] - start[0], r[1] - start[1]) < 6 && pathLen(pts) * z < 12;
/* Tape beim Ziehen: nur der Bereich, der sich ändert, wird geleert und mit dem ganzen Tape neu gemalt, auf ihn
   beschnitten (Figuren daneben werden nicht gestempelt): das Ende mit Schnittkante, Zacken und den letzten Figuren; der
   Rest steht schon auf der Ebene. Solange das Tape kurz ist, ganz. a.tapeT0/tapeLen: Stand des vorigen Bilds */
function tapeLive(g, a, k, ox, oy, pts) {
  const n = pts.length / 3, w = a.w, mt = TAPE_MOTIFS[a.tp], X = i => pts[i * 3], Y = i => pts[i * 3 + 1];
  let len = 0; for (let i = 1; i < n; i++) len += Math.hypot(X(i) - X(i - 1), Y(i) - Y(i - 1));
  const sp = mt ? 0.72 * w * mt.w * 1.18 + 0.3 * w * mt.aw : 0, tail = w * 1.6 + 2 * sp, short = w * 2 + sp;   // sp: Abstand der Figuren (drawMotifs)
  let t0 = n - 1, acc = 0; while (t0 > 0 && acc < tail) { acc += Math.hypot(X(t0) - X(t0 - 1), Y(t0) - Y(t0 - 1)); t0--; }
  const from = a.tapeT0 == null || len < short || a.tapeLen < short ? 0 : Math.min(a.tapeT0, t0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = from; i < n; i++) { const x = X(i), y = Y(i); if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const m = w * 0.75 + (mt ? 0.36 * w * Math.max(mt.w, 1) : 0) + 3 / k;
  const R = [Math.floor((x0 - m) * k + ox), Math.floor((y0 - m) * k + oy), Math.ceil((x1 + m) * k + ox), Math.ceil((y1 + m) * k + oy)];
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); wipe(g, R);
  g.beginPath(); g.rect(R[0], R[1], R[2] - R[0], R[3] - R[1]); g.clip(); g.setTransform(k, 0, 0, k, ox, oy);
  drawTape(g, { pts, w, c: a.c, tp: a.tp, live: true }, k, false, [(R[0] - ox) / k, (R[1] - oy) / k, (R[2] - ox) / k, (R[3] - oy) / k]);
  g.restore();
  a.tapeT0 = t0; a.tapeLen = len;
  return R;
}
function livePiece(a) {
  const P = new Path2D(), n = a.pts.length / 3;
  if (a.drawn >= n) return;
  for (let i = a.drawn; i < n; i++) addPiece(P, a.pts, i, a.w, a.hl);
  markPts(a.pts, a.w, Math.max(0, a.drawn - 1));   // jedes Stück reicht bis zum vorigen Punkt; Radius höchstens 0,775 · w
  a.drawn = n;
  ctxLive.fill(P);
}

// Stift: das Radierer-Ende radiert, die Taste am Stift wählt mit dem Lasso aus (wie in OneNote). In einer Auswahl
// verschiebt der Stift sie auch ohne Taste, am Griff skaliert er sie; daneben verschwindet sie und es wird geschrieben
const penErase = e => e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32));
const penButton = e => e.pointerType === 'pen' && !penErase(e) && (e.button === 2 || (e.buttons & 2));
// Wo ein Punkt die Auswahl trifft: 'scale' am Griff, 'move' darin (mit etwas Rand), sonst null
function selHit(sx, sy, wx, wy) {
  if (!S.sel) return null;
  { const et = editTarget(); if (et && bendHit(et, sx, sy)) return 'bend'; }   // Punkte einer Linie (Enden, Mitte), Seiten eines Kastens
  const b = S.sel.bb, [hx, hy] = toScreen(b[2], b[3]), m = 6 / S.view.z;
  if (Math.hypot(sx - hx, sy - hy) < 22) return 'scale';
  return wx >= b[0] - m && wx <= b[2] + m && wy >= b[1] - m && wy <= b[3] + m ? 'move' : null;
}
function startAction(e) {
  const [sx, sy] = localXY(e), [wx, wy] = toWorld(sx, sy);
  let tool = S.tool;
  if (penErase(e)) tool = 'eraser';
  else if (penButton(e) || (e.pointerType === 'pen' && tool !== 'hand' && !(tool === 'shape' && S.sel && S.sel.auto) && selHit(sx, sy, wx, wy))) tool = 'lasso';
  if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || spaceDown)) tool = 'hand';
  if (tool === 'text') { clearSel(); action = { kind: 'text', id: e.pointerId, sx, sy, wx, wy, ex: sx, cx: e.clientX, cy: e.clientY, t0: e.timeStamp, touch: e.pointerType === 'touch' }; return; }
  if (tool === 'hand') { action = { kind: 'pan', id: e.pointerId, sx, sy, tx: S.view.tx, ty: S.view.ty, touch: e.pointerType === 'touch', right: e.pointerType === 'mouse' && e.button === 2 }; return; }
  if (tool !== 'lasso' && tool !== 'shape' && S.sel) clearSel();
  if (tool === 'pen' || tool === 'hl' || tool === 'tape') {
    const hl = tool === 'hl', tape = tool === 'tape', p = pressureOf(e);
    action = { kind: 'draw', id: e.pointerId, hl, tape, tp: tape ? S.tapePat : undefined, c: S.color[tool], w: S.size[tool], al: tape ? undefined : S.alpha[tool], drawn: 0,
      ...smoothStart(sx, sy, p, e.timeStamp), start: [sx, sy], still: [sx, sy], straight: !!S.straight[tool] };
    if (!tape) { const t = tapeAt(wx, wy); if (t && covered(t)) action.on = t.id; }   // auf ein abgedecktes Tape geschrieben
    if (hl) action.cut = hlCutPage(strokeAlpha(action));   // was der Marker beim Ziehen ausspart
    liveClear(); liveStyle(tape ? null : action);
    if (tape || action.straight) { action.redraw = true; requestLive(); }
    else if (hl) { action.hlInc = true; hlLivePage(action); }   // Textmarker: Stück für Stück mit flachen Enden (hlLive)
    else { liveWorld(); ctxLive.fillStyle = colorOf(action.c); livePiece(action); }
    if (hl || tape) armHold(action);
  } else if (tool === 'shape') {
    if (S.sel) {   // die eben gezeichnete Form: Punkt zum Biegen; sonst entsteht eine neue (auch an ihrer Ecke)
      const et = e.pointerType === 'touch' ? null : editTarget();
      if (et && bendHit(et, sx, sy)) { beginBend(e, et, wx, wy); return; }
      clearSel();
    }
    let cs = null;
    if (isCustom(S.shape)) { cs = customOf(S.shape); if (!cs) { if (!customReady) return; setShape('rect'); } }   // Bibliothek lädt noch / Form fehlt
    // eigene Form und Graph: alle Striche bekommen eine gemeinsame Gruppe (Antippen mit dem Lasso wählt alles)
    action = { kind: 'shape', id: e.pointerId, shape: S.shape, custom: cs, c: S.color.pen, w: S.size.pen, a0: [wx, wy], b: [wx, wy], shift: e.shiftKey, g: GRAPHS.has(S.shape) || cs ? uid() : null, geo: null,
      ds: S.shapeStyle.ds, rnd: S.shapeStyle.rnd, sl: S.shapeStyle.sl, fs: S.shapeStyle.fs, seed: (Math.random() * 4294967296) >>> 0 };   // Stil und Startwert für diese Form
    liveClear(); liveStyle(null); requestLive();
  } else if (tool === 'eraser') {
    action = { kind: 'erase', id: e.pointerId, removed: new Set(), at: [wx, wy] }; eraseAt(wx, wy); requestLive();
  } else if (tool === 'lasso') {
    if (S.sel) {
      const h = selHit(sx, sy, wx, wy);
      if (h === 'bend') { beginBend(e, editTarget(), wx, wy); return; }
      if (h === 'scale') { const gb = S.snap ? gridBox(S.items.filter(it => S.sel.ids.has(it.id))) : S.sel.bb;   // mit Raster: an der Ecke, die auf dem Raster liegt
        beginTransform({ kind: 'scale', id: e.pointerId, anchor: [gb[0], gb[1]], s: 1, p0: [wx, wy] }); return; }
      if (h === 'move') { beginTransform({ kind: 'move', id: e.pointerId, wx, wy, sx, sy, dx: 0, dy: 0, moved: false }); return; }
      clearSel();
    }
    action = { kind: 'lasso', id: e.pointerId, pts: [wx, wy], last: [sx, sy] };
  }
  if (action) action.touch = e.pointerType === 'touch';
}
function beginTransform(a) {
  action = a;
  a.bmp = selBitmap();
  repaintItems(selFacts().sel);   // Kacheln ohne die Auswahl (hiddenIds), nur wo sie liegt
  placeSelbar(); requestLive();
}
function moveAction(e) {
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const list = evs.length ? evs : [e];
  const a = action, rc = cvLive.getBoundingClientRect();   // einmal für alle Teilereignisse
  for (const ev of list) {
    const [sx, sy] = localXY(ev, rc);
    if (a.kind === 'draw') { strokeInput(a, sx, sy, pressureOf(ev), ev.timeStamp); continue; }
    const [wx, wy] = toWorld(sx, sy);
    if (a.kind === 'pan') setView(a.tx + sx - a.sx, a.ty + sy - a.sy, S.view.z);
    else if (a.kind === 'erase') { a.at = [wx, wy]; eraseAt(wx, wy); }
    else if (a.kind === 'lasso') { if (Math.hypot(sx - a.last[0], sy - a.last[1]) >= 3) { a.pts.push(wx, wy); a.last = [sx, sy]; } }
    else if (a.kind === 'text') a.ex = sx;
    else if (a.kind === 'bend') moveBend(a, sx, sy, wx, wy);
    else if (a.kind === 'shape') { a.b[0] = wx; a.b[1] = wy; a.shift = ev.shiftKey; a.mt = performance.now(); a.rest = false; }
    else if (a.kind === 'move') {
      a.dx = wx - a.wx; a.dy = wy - a.wy;
      if (S.snap) {   // springt von Rasterpunkt zu Rasterpunkt, der Bezugspunkt der Auswahl liegt immer auf dem Raster
        const r = a.ref || (a.ref = snapRef(S.items.filter(it => S.sel.ids.has(it.id))));
        a.dx = snapX(r[0] + a.dx) - r[0]; a.dy = snapY(r[1] + a.dy) - r[1];
      }
      if (Math.hypot(sx - a.sx, sy - a.sy) > 3) a.moved = true;
    }
    else if (a.kind === 'scale') {
      const [ax, ay] = a.anchor;
      const d0 = Math.hypot(a.p0[0] - ax, a.p0[1] - ay), d1 = Math.hypot(wx - ax, wy - ay);
      a.s = d0 > 0 ? clamp(d1 / d0, 0.05, 50) : 1;
      if (S.snap) a.s = snapScale(a);
    }
  }
  if (a.kind !== 'draw') requestLive();
}
function deferLiveClear() {
  requestAnimationFrame(() => requestAnimationFrame(() => { if (!action || action.kind !== 'draw') { if (!action) liveStyle(null); drawLive(); } }));   // drawLive leert selbst
}
// Textmarker und Tape: Kacheln neu zeichnen statt die Live-Ebene übernehmen (Textmarker liegt unter der Schrift)
function finishStroke(a) {
  clearTimeout(a.holdT);
  if (a.straight) a.pts = straightPts(a); else if (a.redraw) { if (a.raw) catchUp(a); } else if (a.hlInc) { if (a.raw) { catchUp(a); hlLivePage(a); } } else settleStroke(a);
  if (!a.tape && !a.straight) {   // nur angetippt, und zwar auf das „i“ einer Erklärung: die Karte öffnen statt einen Punkt setzen
    const r = a.raw || a.start;
    if (Math.hypot(r[0] - a.start[0], r[1] - a.start[1]) < 6 && pathLen(a.pts) * S.view.z < 12) {
      const [x, y] = toWorld(...a.start), n = noteBadgeAt(x, y);
      if (n) { liveClear(); requestLive(); openNoteCard(n.id, null, noteBox(n)); return; }
    }
  }
  if (a.tape) {
    const r = a.raw || a.start;
    if (!a.straight && Math.hypot(r[0] - a.start[0], r[1] - a.start[1]) < 6 && pathLen(a.pts) * S.view.z < 12) {   // nur angetippt
      liveClear(); toggleTapeAt(...toWorld(...a.start)); return;
    }
    commitLive([makeStroke(a.pts, a.c, a.w, false, { tp: a.tp, hid: true })], true, true); return;
  }
  const more = {};
  if (a.on) more.on = a.on;
  if (a.al !== undefined && a.al !== ALPHA_DEFAULT[a.hl ? 'hl' : 'pen']) more.al = a.al;
  const see = a.hl || !!more.al;   // durchsichtig: Kacheln neu zeichnen statt die (deckende) Live-Ebene übernehmen
  commitLive([makeStroke(a.pts, a.c, a.w, a.hl, more)], a.noComposite || see, see);
}
// Fertige Striche übernehmen, die gerade auf der Live-Ebene zu sehen sind (Strich oder Form).
// Liegen sie ganz im Bild, werden die Pixel von der Live-Ebene übernommen,
// damit sie beim Absetzen exakt gleich aussehen.
// sync: werden die Kacheln neu gezeichnet, dann die sichtbaren unter den Strichen sofort (sonst flackert die Umgebung)
function commitLive(list, noComposite, sync) {
  const bb = contentBox(list), hl = list[0].hl;
  const [vx0, vy0] = toWorld(0, 0), [vx1, vy1] = toWorld(VW, VH);
  // Tapes liegen obendrauf: wird unter einem gezogen, kommen erst die Pixel der Live-Ebene, dann werden nur die Streifen
  // neu gemalt, die ein Tape berühren (dort liegt es dann wieder darüber)
  const tapesHit = list.some(s => !s.tp && !s.on) ? S.items.filter(t => t.tp && boxHit(t.bb, bb)) : [];
  const inView = !noComposite && bb[0] > vx0 && bb[1] > vy0 && bb[2] < vx1 && bb[3] < vy1 && S.view.z === S.level;
  // sonst ohne ganze Kacheln: neues Tape obendrauf, Textmarker und Striche unter einem Tape als Streifen (nicht mitten im
  // Zoomen und nicht bei verdeckten Cornell-Notizen: dort wie bisher ganze Kacheln)
  const part = !inView && S.view.z === S.level && !(S.cornellHide && isCornell());
  commit(appendItems(S.items, list), !inView && !part);
  if (part) { if (list.every(st => st.tp)) paintOnTop(list); else repaintStrips(list); }
  else if (!inView && sync && S.view.z === S.level) {
    const L = S.level, s = L * DPR, r = tileRange(L);
    for (let j = Math.max(r.j0, Math.floor(bb[1] * s / T)); j <= Math.min(r.j1, Math.floor(bb[3] * s / T)); j++)
      for (let i = Math.max(r.i0, Math.floor(bb[0] * s / T)); i <= Math.min(r.i1, Math.floor(bb[2] * s / T)); i++) if (!tiles.has(tkey(L, i, j))) renderTile(L, i, j);
  }
  if (inView) {
    const txD = Math.round(S.view.tx * DPR), tyD = Math.round(S.view.ty * DPR);
    for (const [k, t] of tiles) {
      if (!boxHit(t.wb, bb)) continue;
      if (t.L !== S.level) { tiles.delete(k); tilePool.push(t); continue; }
      const i = Math.round(t.wb[0] * S.level * DPR / T), j = Math.round(t.wb[1] * S.level * DPR / T);
      const g = t.ctx; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); t.v++;
      if (hl) { g.globalAlpha = hlAlpha(); if (!S.dark) g.globalCompositeOperation = 'multiply'; }
      g.drawImage(cvLive, i * T + txD, j * T + tyD, T, T, 0, 0, T, T);
      g.restore();
    }
    if (tapesHit.length && !(S.cornellHide && isCornell())) repaintStrips(list, tapesHit.map(t => t.bb));
    else if (tapesHit.length) invalidateBox(bb);
  }
  draw();
  deferLiveClear();
}
function endAction(cancel) {
  const a = action; action = null;
  if (!a) return;
  liveVis();
  if (a.kind === 'draw') {
    if (cancel) { clearTimeout(a.holdT); liveClear(); liveStyle(null); return; }
    finishStroke(a); return;
  }
  if (a.kind === 'shape') {
    if (cancel) { liveClear(); requestLive(); return; }
    finishShape(a); return;
  }
  if (a.kind === 'text') { if (!cancel) textTap(a); return; }
  if (a.kind === 'pan') { lastPan = { right: a.right, moved: S.view.tx !== a.tx || S.view.ty !== a.ty, t: performance.now() }; viewChanged(); requestLive(); return; }
  if (a.kind === 'bend') {
    if (!cancel && a.moved && a.tmp) { commit(S.items.map(x => x.id === a.it.id ? a.tmp : x)); if (S.sel) refreshSel(); }
    else repaintItems([a.it]);
    requestDraw(); requestLive(); placeSelbar(); return;
  }
  if (cancel) {
    if (a.kind === 'erase') for (const id of a.removed) { const it = S.items.find(i => i.id === id); if (it) invalidateBox(it.bb); }
    if ((a.kind === 'move' || a.kind === 'scale') && S.sel) repaintItems(selFacts().sel);
    requestDraw(); requestLive(); placeSelbar(); return;
  }
  if (a.kind === 'erase') { if (a.removed.size) commit(S.items.filter(it => !a.removed.has(it.id)), false); }
  else if (a.kind === 'lasso') { const n = lassoBadge(a.pts); if (n) openNoteCard(n.id, null, noteBox(n)); else setSel(lassoSelect(a.pts)); }
  else if (a.kind === 'move' || a.kind === 'scale') {
    const moved = a.kind === 'move' ? a.moved && (a.dx || a.dy) : Math.abs(a.s - 1) > 0.005;
    if (moved) {
      const [ox, oy] = a.kind === 'scale' ? a.anchor : [0, 0], s = a.kind === 'scale' ? a.s : 1;
      commit(S.items.map(it => S.sel.ids.has(it.id) ? transformItem(it, s, ox, oy, a.dx || 0, a.dy || 0) : it));
      refreshSel();
    } else repaintItems(selFacts().sel);
  }
  requestDraw(); requestLive(); placeSelbar();
}
function cancelAction() { if (action) endAction(true); }

/* Finger-Gesten: ein Finger verschiebt, zwei Finger zoomen, Zwei-Finger-Tipp = Rückgängig */
function gestureStart() {
  const pts = [...touches.values()];
  if (!pts.length) { gesture = null; return; }
  const c = pts.length >= 2 ? [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] : [pts[0].x, pts[0].y];
  const d = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  const prev = gesture;
  gesture = { c0: c, d0: d, tx: S.view.tx, ty: S.view.ty, z: S.view.z, n: pts.length,
    t0: prev ? prev.t0 : performance.now(), view0: prev ? prev.view0 : { ...S.view },
    maxN: Math.max(prev ? prev.maxN : 0, pts.length), moved: prev ? prev.moved : false, cancelled: prev ? prev.cancelled : false };
}
function gestureMove() {
  const g = gesture, pts = [...touches.values()];
  if (!g || !pts.length) return;
  const c = pts.length >= 2 ? [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2] : [pts[0].x, pts[0].y];
  if (Math.hypot(c[0] - g.c0[0], c[1] - g.c0[1]) > 10) g.moved = true;
  if (g.held && g.moved) { g.held = false; closeMenus(); }   // nach dem Gedrückthalten doch verschoben: Blase zu
  if (pts.length >= 2 && g.d0 > 0) {
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (Math.abs(d - g.d0) > 12) g.moved = true;
    const z = clamp(g.z * d / g.d0, 0.1, 8);
    const wx = (g.c0[0] - g.tx) / g.z, wy = (g.c0[1] - g.ty) / g.z;
    setView(c[0] - wx * z, c[1] - wy * z, z);
  } else {
    setView(g.tx + c[0] - g.c0[0], g.ty + c[1] - g.c0[1], S.view.z);
  }
}
// Der Stift ist da: laufende Finger-Geste (meist der Handballen) abbrechen
function penArrived() {
  if (gesture) {
    if (performance.now() - gesture.t0 < 500) setView(gesture.view0.tx, gesture.view0.ty, gesture.view0.z, true);
    gesture = null; touches.clear(); settleZoom();
  }
  if (action && action.touch) endAction(true);
}
// Stift schwebt über der Fläche: statt Fadenkreuz ein durchsichtiger Punkt in Farbe und Dicke des Strichs
// (Dicke bei mittlerem Druck, mindestens 3 px). Beim Schreiben selbst ist er aus.
// Das Fadenkreuz kommt erst zurück, wenn wirklich die Maus benutzt wird: Windows meldet beim Aufsetzen
// und Abheben des Stifts auch Mausbewegungen, und beim Verlassen der Fläche ist der Cursor ohnehin nicht zu sehen.
let penLast = false;   // zuletzt war der Stift auf oder über der Fläche, nicht die Maus
const inkTool = t => t === 'pen' || t === 'hl' || t === 'tape';   // Werkzeuge mit Farbe, Dicke und Punkt beim Schweben
function toolCursor(t) { return t === 'hand' ? 'grab' : t === 'lasso' ? 'default' : t === 'text' ? 'text' : penLast && inkTool(t) ? 'none' : 'crosshair'; }
function hoverDot(e) {
  if (e.pointerType === 'mouse' && performance.now() < penActiveUntil) return;   // vom Stift ausgelöste Mausbewegung
  penLast = e.pointerType === 'pen';
  const k = S.tool, [sx, sy] = localXY(e);
  // über einer Auswahl (z. B. mit der Stifttaste gemacht) zeigt der Zeiger, dass der Stift sie verschiebt bzw. skaliert
  const sh = penLast && !action && k !== 'hand' && k !== 'lasso' && !(e.buttons & 34) ? selHit(sx, sy, ...toWorld(sx, sy)) : null;
  const on = penLast && !action && !spaceDown && !(e.buttons & 34) && inkTool(k) && !sh;
  if (on) {
    // beim Schweben ändert sich meist nur die Lage: nur transform setzen, das verschiebt der Compositor ohne Neuzeichnen
    const d = Math.max(3, S.size[k] * S.view.z), st = penDot.style, px = d + 'px', c = colorOf(S.color[k]);
    if (st.width !== px) st.width = st.height = px;
    if (penDot.dataset.c !== c) { penDot.dataset.c = c; st.background = c; }
    st.transform = `translate(${sx - d / 2}px,${sy - d / 2}px)`;
  }
  const disp = on ? 'block' : '';
  if (penDot.style.display !== disp) penDot.style.display = disp;
  const cur = on ? 'none' : sh ? (sh === 'scale' ? 'nwse-resize' : 'move')
    : penLast && (e.buttons & 32) ? 'crosshair' : penLast && (e.buttons & 2) ? toolCursor('lasso') : toolCursor(k);   // Radierer-Ende: radiert, Stifttaste: Lasso
  if (!action && !spaceDown && cvLive.style.cursor !== cur) cvLive.style.cursor = cur;
}

// Der Stift ist irgendwo im Fenster (auch auf der Leiste oder an einem Regler im Menü): Handballen auf der Seite ignorieren
document.addEventListener('pointerdown', e => { if (e.pointerType === 'pen') penActiveUntil = Math.max(penActiveUntil, performance.now() + 600); }, true);
document.addEventListener('pointermove', e => { if (e.pointerType === 'pen') penActiveUntil = Math.max(penActiveUntil, performance.now() + 300); }, true);
cvLive.addEventListener('pointerdown', e => {
  hoverIn(e);
  if (e.pointerType === 'touch' && performance.now() < penActiveUntil) return;   // Handballen: schließt auch kein offenes Menü
  penDot.style.display = '';
  if (e.pointerType === 'pen') { penLast = true; if (!spaceDown) cvLive.style.cursor = toolCursor(S.tool); }
  const ae = document.activeElement; if (ae && ae !== document.body && ae.blur) ae.blur();
  hideTapeMenu();   // die Blase am Tape geht zu, der Tipp wirkt trotzdem
  if ($$('.menu').some(isOpen)) { closeMenus(); return; }
  if (e.pointerType === 'touch') {
    if (performance.now() < penActiveUntil) return;           // Handballen ignorieren
    if (action && !action.touch) return;                      // Stift/Maus ist schon aktiv
    capture(e);
    const [x, y] = localXY(e);
    touches.set(e.pointerId, { x, y });
    if (S.fingerDraw && touches.size === 1 && S.tool !== 'hand' && !gesture) { startAction(e); return; }
    if (action && action.touch) endAction(action.kind !== 'pan');  // zweiter Finger: Strich verwerfen, Geste starten
    gestureStart();
    if (touches.size === 1) { armPasteHold(gesture); gesture.ev0 = e.timeStamp; }   // gedrückt halten: „Einfügen“
    return;
  }
  if (e.pointerType === 'pen') { penActiveUntil = performance.now() + 600; penArrived(); }
  if (action) {
    if (action.id === e.pointerId) return;
    endAction(false);                                         // verlorenes pointerup nachholen
  }
  if (e.pointerType === 'mouse' && e.button > 2) return;
  capture(e);
  startAction(e);
  e.preventDefault();
});
cvLive.addEventListener('pointermove', e => {
  if (e.pointerType === 'pen') {
    penActiveUntil = Math.max(penActiveUntil, performance.now() + (action ? 600 : 300));
    if (gesture && !action) penArrived();
  }
  hoverIn(e);
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) { const [x, y] = localXY(e); touches.set(e.pointerId, { x, y }); }   // für eine zweite Hand: aktuelle Position
  if (!action && e.pointerType !== 'touch') hoverDot(e);
  if (action && action.id === e.pointerId) {
    if (e.pointerType !== 'touch' && e.buttons === 0) { endAction(false); return; }   // Taste wurde unbemerkt losgelassen
    moveAction(e); return;
  }
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const [x, y] = localXY(e); touches.set(e.pointerId, { x, y }); gestureMove();
  }
});
function pointerEnd(e) {
  const cancelled = e.type === 'pointercancel';
  if (action && action.id === e.pointerId) {
    if (e.pointerType === 'pen') penActiveUntil = performance.now() + 500;
    touches.delete(e.pointerId);
    endAction(cancelled && (action.touch || action.kind === 'shape' || (action.kind === 'draw' && action.pts.length < 6)));
    return;
  }
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.delete(e.pointerId);
    if (cancelled && gesture) gesture.cancelled = true;
    if (touches.size === 0) {
      const g = gesture; gesture = null;
      if (g && !g.cancelled && g.maxN === 2 && !g.moved && performance.now() - g.t0 < 350) { undo(); toast('Rückgängig', 900); }
      else if (g && !g.cancelled && g.maxN === 1 && !g.moved && performance.now() - g.t0 < 350) {   // Erklärung öffnen oder Tape antippen
        const [x, y] = toWorld(...g.c0), n = noteAt(x, y);
        if (S.tool === 'text') { const r = cvLive.getBoundingClientRect(); textTap({ sx: g.c0[0], sy: g.c0[1], ex: g.c0[0], wx: x, wy: y, cx: r.left + g.c0[0], cy: r.top + g.c0[1], t0: g.ev0 }); }   // Text schreiben oder bearbeiten
        else if (n) openNoteCard(n.id, null, noteBox(n));
        else if (S.cornellHide && cornellNotesAt(x, y) >= 0) setCornellHide(false);   // verdeckte Notizen antippen: aufdecken
        else toggleTapeAt(x, y);
      }
      settleZoom(); viewChanged();
    } else gestureStart();
  }
}
cvLive.addEventListener('pointerup', pointerEnd);
cvLive.addEventListener('pointercancel', pointerEnd);
cvLive.addEventListener('pointerleave', e => { penDot.style.display = ''; hoverOut(e); });
cvLive.addEventListener('pointercancel', hoverOut);
cvLive.addEventListener('lostpointercapture', e => { if (action && action.id === e.pointerId) endAction(false); });
// Rechtsklick mit der Maus: „Einfügen“ wie beim Gedrückthalten mit dem Finger (Finger und Stift lösen hier nichts aus;
// Windows meldet auch langes Drücken mit dem Finger als Kontextmenü, das übernimmt armPasteHold)
cvLive.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!S.note || (e.pointerType && e.pointerType !== 'mouse')) return;
  if (lastPan && lastPan.right && lastPan.moved && performance.now() - lastPan.t < 1000) return;   // mit der rechten Taste verschoben
  showPasteMenu(...localXY(e));
});
window.addEventListener('blur', () => {
  if (action) endAction(action.kind === 'draw' && action.pts.length < 6);
  touches.clear(); gesture = null; settleZoom();
  if (spaceDown) { spaceDown = false; setTool(S.tool); }
});
cvLive.addEventListener('wheel', e => {
  e.preventDefault();
  const [sx, sy] = localXY(e), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VH : 1;
  if (e.ctrlKey) {
    zoomAt(sx, sy, S.view.z * Math.exp(-clamp(e.deltaY * unit, -60, 60) * 0.0045), false);
    clearTimeout(wheelT); wheelT = setTimeout(() => { wheelT = null; settleZoom(); }, 180);
  } else setView(S.view.tx - e.deltaX * unit, S.view.ty - e.deltaY * unit, S.view.z);
}, { passive: false });
// Browser-Zoom der ganzen Seite verhindern (Strg+Mausrad, Pinch auf der Leiste)
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());   // Safari (iPad): Zwei-Finger-Zoom der Seite

/* ---------- Werkzeugleiste ---------- */
function setTool(t) {
  if (txEd && t !== 'text') commitText();
  if (action && t !== S.tool) cancelAction();
  S.tool = t;
  $$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  if (t !== 'lasso' || (S.sel && S.sel.auto)) clearSel(); else if (S.sel) placeSelbar();   // die Auswahl nach dem Zeichnen gilt nur im Formen-Werkzeug
  $('#sizeMenu').classList.add('hidden'); $('#colorMenu').classList.add('hidden'); $('#tapeMenu').classList.add('hidden'); $('#bTune').classList.remove('on'); if (t !== 'shape') $('#shapeMenu').classList.add('hidden');
  cvLive.style.cursor = toolCursor(t); penDot.style.display = '';   // der Punkt kommt mit der nächsten Stiftbewegung wieder
  renderColors(); placeShapeBar();   // die Leiste selbst ändert sich nicht (feste Breiten): nicht neu messen
}
// Lasso, Tape und Formen teilen sich einen Knopf, damit die Leiste einzeilig bleibt. Er zeigt das zuletzt gewählte der
// drei: Antippen wählt es (Formen: mit der Auswahl der Form), ist es schon gewählt, öffnet sich die Auswahl der drei
// Die Leiste bleibt einzeilig: wird es eng, wird zuerst der Titel schmaler; erst wenn das nicht reicht, bricht sie um
// barGeo: Unterkante der Leiste und linke Kante der Farben, gemessen in fitBar (Größe, Öffnen, Name, Aussehen). Beim
// Werkzeugwechsel bleibt beides gleich; jedes Messen nach einer Änderung zwänge den Browser, die ganze Seite neu
// anzuordnen (auf dem Surface spürbar beim Wechsel zwischen Tape und Formen)
let barGeo = null, shapeBarWH = null;
function fitBar() {
  const bar = $('#bar'); if (!bar.offsetParent) return;
  bar.classList.remove('wrap');
  if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add('wrap');
  const ti = $('#title'); ti.title = ti.scrollWidth > ti.clientWidth + 1 ? ti.value : '';   // gekürzt: ganzer Name beim Draufzeigen
  barGeo = { left: $('#colors').getBoundingClientRect().left, bottom: bar.getBoundingClientRect().bottom, btn: $('#bShape').getBoundingClientRect() }; shapeBarWH = null;
  placeShapeBar();
}
// Formenleiste: solange Formen gewählt ist, unter der Leiste, links bündig mit den Farben (dort, wo die Einstellungen
// des Stifts stehen); passt sie dort nicht, rückt sie nach links
function placeShapeBar() {
  const sb = $('#shapeBar'), show = S.tool === 'shape' && !!S.note && !!barGeo;
  if (!show) { if (!sb.classList.contains('hidden')) popOut(sb); return; }
  const was = sb.classList.contains('hidden') || !!sb.dataset.closing;
  sb.classList.remove('hidden');
  if (!shapeBarWH) shapeBarWH = [sb.offsetWidth, sb.offsetHeight];   // einmal je Leistenlage messen
  sb.style.top = barGeo.bottom + 8 + 'px';
  sb.style.left = clamp(barGeo.left - 8, 8, innerWidth - shapeBarWH[0] - 8) + 'px';
  if (was) {   // aus dem Knopf „Formen“ (Lage gemerkt, nichts messen)
    markShapeMenu();
    const r = barGeo.btn, L = parseFloat(sb.style.left), Tp = barGeo.bottom + 8, [w, h] = shapeBarWH;
    popIn(sb, null, '', 0, POP.from, [clamp(r.left + r.width / 2 - L, 12, w - 12), r.top + r.height / 2 < Tp + h / 2 ? -10 : h + 10]);
  }
}
// Farbe und Dicke gelten für Stift, Textmarker, Lasso (übernehmen) und Formen – nicht für eigene Formen,
// die behalten ihre gespeicherten Farben (Antippen wechselt dann zum Stift, wie beim Radierer)
const penLike = () => inkTool(S.tool) || S.tool === 'lasso' || (S.tool === 'shape' && !isCustom(S.shape));
const toolKind = () => S.tool === 'hl' || S.tool === 'tape' ? S.tool : 'pen';   // wessen Farbe und Dicke die Leiste zeigt
function renderColors() {
  const box = $('#colors'); box.innerHTML = '';
  const k = toolKind();
  const show = penLike();
  box.style.opacity = show ? 1 : 0.35;
  const pick = () => { store.set('color', S.color); if (!show) setTool('pen'); else { renderColors(); if (k === 'pen') restyleSel({ c: S.color.pen }); } };
  for (const c of k === 'tape' ? TAPE_PALETTE : PALETTE) {
    const b = document.createElement('button'); b.className = 'sw' + (S.color[k] === c ? ' on' : '');
    b.style.background = colorOf(c); b.title = c === 'ink' ? 'Schwarz / Weiß' : c;
    b.onclick = () => { S.color[k] = c; pick(); };
    box.appendChild(b);
  }
  const custom = !(k === 'tape' ? TAPE_PALETTE : PALETTE).includes(S.color[k]);
  const cb = document.createElement('button'); cb.className = 'sw custom' + (custom ? ' on has' : ''); cb.title = 'Eigene Farbe';
  if (custom) cb.style.setProperty('--cc', S.color[k]);   // innen die Farbe, außen der Regenbogen-Ring (CSS)
  cb.onclick = openColorMenu;
  box.appendChild(cb);
  renderSizes();   // die Stücke bei Textmarker und Tape zeigen die Farbe
}

/* Eigene Farbe: ein Farbwähler im Stil der App statt des Fensters von Windows/Chrome. Feld für Sättigung (nach
   rechts) und Helligkeit (nach oben), darunter der Farbton; Ziehen mit Stift, Finger oder Maus gilt sofort (der
   nächste Strich hat die Farbe schon), gespeichert wird beim Loslassen. Dazu die zuletzt benutzten eigenen Farben
   und abgestimmte Vorschläge (kräftig, sanft, gedeckt; auf hellem und dunklem Papier gut zu sehen). */
const CP_SUGGEST = [
  '#dc4a4a', '#e8793a', '#e3a72f', '#4c9a4f', '#1f9a8f', '#3576d4', '#6a5acd', '#c7457f',
  '#f3a5a5', '#f6c29a', '#f2dc85', '#b4dba6', '#a3dbd3', '#a9c7ee', '#c8bdf0', '#efb6d3',
  '#8c6a54', '#b39672', '#7f8f62', '#5d8a87', '#617b9b', '#83769f', '#9b6f84', '#7c8189',
];
const cp = { h: 215, s: 0.6, v: 0.8, hex: '#3576d4', k: 'pen', drag: null };
let recentColors = (store.get('recentColors', []) || []).filter(c => /^#[0-9a-f]{6}$/.test(c)).slice(0, 8);
const hsvHex = (h, s, v) => {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
};
const hexRgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// Farbe übernehmen; bei Grau (keine Sättigung) bleibt der Farbton, sonst spränge die Leiste an den Anfang
function cpFrom(hex) {
  const [r, g, b] = hexRgb(hex).map(x => x / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d > 1e-4) cp.h = 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  cp.s = mx ? d / mx : 0; cp.v = mx; cp.hex = hex;
}
function cpShow() {
  const hex = cp.hex, f = $('#cpField'), knob = $('#cpKnob'), hk = $('#cpHueKnob');
  f.style.setProperty('--hue', `hsl(${cp.h} 100% 50%)`);
  knob.style.left = cp.s * 100 + '%'; knob.style.top = (1 - cp.v) * 100 + '%'; knob.style.background = hex;
  hk.style.left = cp.h / 360 * 100 + '%'; hk.style.background = `hsl(${cp.h} 100% 50%)`;
  $('#cpHue').setAttribute('aria-valuenow', Math.round(cp.h));
  $('#cpChip').style.background = hex;
  if (document.activeElement !== $('#cpHex')) $('#cpHex').value = hex;
  $$('#colorMenu .cpsw button').forEach(b => b.classList.toggle('on', b.dataset.c === hex));
}
// zuletzt benutzt: vorne die neueste; fast gleiche Farbe (beim Nachstellen) ersetzt die vorige statt sich anzureihen
function cpRemember(hex) {
  const near = (a, b) => { const p = hexRgb(a), q = hexRgb(b); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 24; };
  if (recentColors[0] && near(recentColors[0], hex)) recentColors.shift();
  recentColors = [hex, ...recentColors.filter(c => c !== hex)].slice(0, 8);
  store.set('recentColors', recentColors);
}
// kleines Federn (angetippter Tupfer, neue Farbe in „Zuletzt“, Punkt in der Leiste)
function cpPop(el, from = 0.7) {
  if (el && !reduceMotion()) el.animate([{ transform: `scale(${from})` }, { transform: 'none' }], sp(spring(0.4, 340)));
}
function cpSwatch(c) {
  const b = document.createElement('button'); b.dataset.c = c; b.style.background = c; b.title = c.toUpperCase();
  b.onclick = () => { cpFrom(c); cpApply(true, c); if (b.isConnected) cpPop(b); };
  return b;
}
// Vorschläge stehen fest; „Zuletzt“ ist immer da (leer mit Hinweis), damit beim ersten Mal nichts unter dem
// Finger wegrutscht. pop: die neue vorderste Farbe ploppt herein
function cpRecentRow(pop) {
  const box = $('#cpRecent'); box.innerHTML = '';
  if (!recentColors.length) { box.innerHTML = '<span class="cpempty">Hier erscheinen deine eigenen Farben</span>'; return; }
  for (const c of recentColors) box.appendChild(cpSwatch(c));
  if (pop) cpPop(box.firstChild, 0.2);
}
CP_SUGGEST.forEach(c => $('#cpSugg').appendChild(cpSwatch(c)));
// gilt sofort für das Werkzeug; commit: speichern, merken und die Leiste neu zeichnen. exact: genau dieser Farbwert
// (Vorschlag, eingetippt), sonst der aus Farbton, Sättigung und Helligkeit
function cpApply(commit, exact) {
  const hex = cp.hex = exact || hsvHex(cp.h, cp.s, cp.v), sw = $('#colors .sw.custom');
  S.color[cp.k] = hex;
  if (sw) { sw.style.setProperty('--cc', hex); $$('#colors .sw').forEach(b => b.classList.toggle('on', b === sw)); sw.classList.add('has'); }
  if (commit) { const first = recentColors[0]; store.set('color', S.color); cpRemember(hex); cpRecentRow(recentColors[0] !== first); renderColors(); if (cp.k === 'pen') restyleSel({ c: hex }); }
  cpShow();
}
function openColorMenu() {
  const m = $('#colorMenu'), was = isOpen(m); closeMenus(); if (was) return;
  if (!penLike()) setTool(toolKind());   // vom Radierer aus: zurück zum Stift (wie die anderen Farben)
  const k = cp.k = toolKind(), cur = S.color[k], pal = k === 'tape' ? TAPE_PALETTE : PALETTE;
  // Start: die gewählte Farbe (zum Abwandeln); die zuletzt benutzten eigenen stehen darunter zum Antippen
  cpFrom(pal.includes(cur) ? colorOf(cur) : cur);
  cpRecentRow(); m.classList.remove('hidden'); cpShow();
  // unter der ganzen Leiste, mittig unter dem Punkt (wie die Einstellungen des Werkzeugs); in niedrigen Fenstern scrollbar
  const sw = $('#colors .sw.custom'), r = sw.getBoundingClientRect(), top = Math.max(r.bottom, barBottom()) + 8;
  m.style.top = top + 'px'; m.style.maxHeight = Math.max(220, innerHeight - top - 12) + 'px';
  m.style.left = clamp(r.left + r.width / 2 - m.offsetWidth / 2, 8, innerWidth - m.offsetWidth - 8) + 'px';
  // Auftritt wie alle Popups, dazu federt der Punkt mit und die Farbtupfer ploppen kurz nacheinander auf
  popIn(m, sw);
  if (reduceMotion()) return;
  cpPop(sw, 0.85);
  $$('#colorMenu .cpsw button').forEach((b, i) => b.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    sp(spring(0.3, 320), { delay: 40 + i * 6, fill: 'backwards' })));
}
// Ziehen im Feld bzw. auf der Leiste (Stift, Finger, Maus); der Zeiger bleibt gefangen, auch wenn er hinausfährt
function cpDrag(el, set) {
  el.addEventListener('pointerdown', e => {
    if (cp.drag != null) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); cp.drag = e.pointerId; el.classList.add('drag');   // Griff wird größer
    const at = ev => { const r = el.getBoundingClientRect(); set(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); cpApply(false); };
    const move = ev => { if (ev.pointerId === cp.drag) at(ev); };
    const up = ev => {
      if (ev.pointerId !== cp.drag) return;
      cp.drag = null; el.classList.remove('drag'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      cpApply(true);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    at(e);
  });
}
cpDrag($('#cpField'), (x, y) => { cp.s = x; cp.v = 1 - y; });
cpDrag($('#cpHue'), x => { cp.h = x * 360; });
// Tastatur: Pfeile verschieben (mit Umschalt in großen Schritten)
$('#cpField').addEventListener('keydown', e => {
  const d = e.shiftKey ? 0.1 : 0.02, m = { arrowleft: [-d, 0], arrowright: [d, 0], arrowup: [0, d], arrowdown: [0, -d] }[e.key.toLowerCase()];
  if (!m) return; e.preventDefault(); cp.s = clamp(cp.s + m[0], 0, 1); cp.v = clamp(cp.v + m[1], 0, 1); cpApply(true);
});
$('#cpHue').addEventListener('keydown', e => {
  const d = { arrowleft: -1, arrowdown: -1, arrowright: 1, arrowup: 1 }[e.key.toLowerCase()];
  if (!d) return; e.preventDefault(); cp.h = clamp(cp.h + d * (e.shiftKey ? 15 : 2), 0, 360); cpApply(true);
});
// Farbwert eintippen: #3a7bd5 oder kurz #3ad; gilt, sobald er vollständig ist
$('#cpHex').addEventListener('input', e => {
  let v = e.target.value.trim().toLowerCase(); if (v[0] !== '#') v = '#' + v;
  if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map(x => x + x).join('');
  if (/^#[0-9a-f]{6}$/.test(v)) { cpFrom(v); cpApply(false, v); }
});
$('#cpHex').addEventListener('change', () => cpApply(true, cp.hex));
$('#cpHex').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('#cpHex').addEventListener('blur', cpShow);   // Unvollständiges verwerfen: wieder die gewählte Farbe zeigen
const fmtSize = v => String(v).replace('.', ',');
const fmtSmooth = v => v ? Math.round(v * 100) + ' %' : 'Aus';
const dotPx = (k, v) => k === 'tape' ? clamp(2 + v * 0.42, 6, 26) : k === 'hl' ? clamp(2 + v * 0.55, 4, 26) : clamp(1.5 + v * 1.65, 3, 24);
function setSize(k, i) { S.sizeIdx[k] = i; S.size[k] = S.presets[k][i]; store.set('sizeIdx', S.sizeIdx); }
// Dicke von Textmarker und Tape als kurzes Stück, so wie es auf der Seite aussieht: das Tape im gewählten Muster und
// seiner Farbe mit gerissenen Enden; der Textmarker als Schwung (ein kurzer Strich mit dem Marker: erst nach unten, dann
// hinauf), mit dem echten Textmarker-Pfad und seinen flachen Enden, in seiner Farbe und Deckkraft, an den Rändern etwas
// kräftiger und an den Enden mit weich etwas mehr Tinte. In der Leiste kräftiger als auf der Seite, damit er auch
// dunkel leuchtet; hell wie auf Papier multipliziert. Die Dicke wächst wie die Punkte beim Stift (dotPx), der Schwung
// wird dabei flacher, damit er in den Knopf passt
// gleiche Dicke, Farbe, Muster, Deckkraft, Hell/Dunkel: dasselbe Bild (der Werkzeugwechsel baut es nicht jedes Mal neu)
const stripCache = new Map();
function sizeStrip(k, v) {
  const key = [k, v, k === 'tape' ? S.tapePat : '', S.color[k], k === 'tape' ? '' : S.alpha[k], isDark(), DPR].join('|');
  let c = stripCache.get(key);
  if (!c) { c = makeSizeStrip(k, v); stripCache.set(key, c); if (stripCache.size > 48) stripCache.delete(stripCache.keys().next().value); }
  return c;
}
function makeSizeStrip(k, v) {
  const h = Math.round(dotPx(k, v));
  if (k === 'tape') return tapeSwatch(S.tapePat, 26, h + 2);
  const W = 34, A = Math.max(3.5, 8 - h * 0.22), H = Math.ceil(h + 2 * A + 6), c = document.createElement('canvas');
  c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); c.style.width = W + 'px'; c.style.height = H + 'px';
  if (!isDark()) c.style.mixBlendMode = 'multiply';
  const x0 = h * 0.37 + 1.5, L = W - 2 * x0, cy = H / 2, q = [];
  const B = [[x0, cy - A * 0.3], [x0 + L * 0.28, cy + A * 1.9], [x0 + L * 0.62, cy + A * 0.9], [x0 + L, cy - A * 1.1]];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32, u = 1 - t, f = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    q.push(f.reduce((s, m, j) => s + m * B[j][0], 0), f.reduce((s, m, j) => s + m * B[j][1], 0), 0.5);
  }
  const P = Float32Array.from(q), col = colorOf(S.color.hl), a = Math.min(1, strokeAlpha({ hl: true, al: S.alpha.hl }) * (isDark() ? 1.45 : 1.6));
  const layer = () => { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const g = o.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = col; paintPath(g, buildPath(P, h, true), h, true); return [o, g]; };
  const g = c.getContext('2d');
  const [body] = layer(); g.globalAlpha = a; g.drawImage(body, 0, 0);   // der Strich deckend, dann mit Deckkraft: gleichmäßig
  const [rim, rg] = layer(); rg.globalCompositeOperation = 'destination-out'; paintPath(rg, buildPath(P, h * 0.62, true), h * 0.62, true);   // Ränder
  g.globalAlpha = a * 0.32; g.drawImage(rim, 0, 0);
  const [ends, eg] = layer(); eg.globalCompositeOperation = 'destination-in';   // Enden: nach innen weich auslaufend
  const m = document.createElement('canvas'); m.width = c.width; m.height = c.height; const mg = m.getContext('2d'); mg.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const j of [0, q.length / 3 - 1]) {
    const x = q[j * 3], y = q[j * 3 + 1], R = h * 0.9 + 3, gr = mg.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = gr; mg.fillRect(x - R, y - R, 2 * R, 2 * R);
  }
  eg.setTransform(1, 0, 0, 1, 0, 0); eg.drawImage(m, 0, 0);
  g.globalAlpha = a * 0.5; g.drawImage(ends, 0, 0);
  return c;
}
function renderSizes() {
  const box = $('#sizes'); box.innerHTML = '';
  const k = toolKind();
  const show = penLike();
  box.style.opacity = show ? 1 : 0.35;
  S.presets[k].forEach((v, i) => {
    const on = S.sizeIdx[k] === i;
    const b = document.createElement('button'); b.className = 'sz' + (on ? ' on' : '');
    b.title = 'Strichstärke ' + fmtSize(v) + (on ? ' (nochmal tippen zum Anpassen)' : '');
    if (k === 'pen') {
      const d = document.createElement('span'); d.style.width = d.style.height = dotPx(k, v) + 'px';
      const fa = S.alpha.pen / ALPHA_DEFAULT.pen; if (fa < 1) d.style.opacity = Math.max(0.25, fa);   // durchsichtiger eingestellt
      b.appendChild(d);
    } else { b.classList.add('strip'); b.appendChild(sizeStrip(k, v)); }   // Textmarker, Tape: ein Stück zum Vorstellen
    b.onclick = () => {
      if (on && show) { openSizeMenu(k, b); return; }
      popOut($('#sizeMenu')); $('#bTune').classList.remove('on'); setSize(k, i);
      if (!show) setTool(k); else { renderSizes(); if (k === 'pen') restyleSel({ w: S.size.pen }); }
    };
    box.appendChild(b);
  });
  const t = $('#bTune'); t.style.opacity = box.style.opacity;
  t.title = graphTool() ? 'Einstellungen der Koordinatensysteme: Abstand der Teilstriche, Beschriftung der Achsen'
    : 'Einstellungen ' + { pen: 'des Stifts: Dicke, Deckkraft, Glättung', hl: 'des Textmarkers: Dicke, Deckkraft, Glättung, Immer gerade', tape: 'des Tapes: Dicke, Muster, Immer gerade' }[k];
}
// Einstellungen des Werkzeugs (Dicke, Glättung, Muster …) über einen eigenen Knopf neben den Dicken; das zweite Antippen
// der gewählten Dicke geht weiterhin. Radierer, Hand: wie beim Antippen einer Dicke erst zum Stift. Ist bei den Formen
// ein Koordinatensystem gewählt: dessen Einstellungen
function graphTool() { return S.tool === 'shape' && GRAPHS.has(S.shape); }
$('#bTune').onclick = () => {
  if (graphTool()) { openGraphMenu($('#bTune'), false); return; }
  if (!penLike()) setTool(toolKind()); openSizeMenu(toolKind(), $('#bTune'));
};
// Schieberegler für die gewählte Voreinstellung, logarithmisch (feine Schritte bei dünnen Stiften)
let sizeKind = 'pen';
const sizeToT = (k, v) => { const [lo, hi] = SIZE_RANGE[k]; return Math.round(Math.log(v / lo) / Math.log(hi / lo) * 1000); };
const tToSize = (k, t) => { const [lo, hi] = SIZE_RANGE[k], v = lo * Math.pow(hi / lo, t / 1000); return v < 10 ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2; };
function showSize() {
  const k = sizeKind, v = S.size[k];
  $('#szLabel').textContent = { hl: 'Textmarker', tape: 'Tape' }[k] || 'Stift';
  $('#sizeMenu').dataset.title = $('#szLabel').textContent;   // Titelleiste (Aussehen XP)
  $('#szVal').textContent = fmtSize(v);
  if (k !== 'tape') $('#opVal').textContent = Math.round(S.alpha[k] * 100) + ' %';
  $('#smVal').textContent = fmtSmooth(S.smooth);
  $('#stBtn').classList.toggle('on', !!S.straight[k]);
  $('#szHint').textContent = k === 'tape' ? 'Ein Tape antippen (auch mit dem Finger) deckt es auf oder wieder ab; die kleine Blase daran schaltet genau dieses Tape um oder entfernt es. Was auf dem Tape geschrieben steht, verschwindet beim Aufdecken mit. Am Ende kurz halten macht es gerade.'
    : k === 'hl' ? 'Der Textmarker liegt unter der Schrift. Am Ende kurz halten macht die Linie gerade.' : '';
  drawSizePreview(k, v);
}
// Probestrich: Wellenlinie mit leichtem Zittern der Hand, im Tempo normaler Schrift (ein Ereignis alle 8 ms) durch
// denselben Filter wie beim Schreiben; so dick, wie der Strich beim jetzigen Zoom aussieht. Tape und gerade
// Textmarker: ein gerades Stück quer durch die Vorschau
function drawSizePreview(k, v) {
  const cv = $('#szPrev'), W = cv.clientWidth || 248, H = cv.clientHeight || 84;
  if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  const g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';   // der Textmarker ließ sonst seine Deckkraft stehen
  const w = clamp(v * S.view.z, 1, H * 0.6), m = Math.max(12, w / 2 + 6), amp = Math.max(3, (H / 2 - m) * 0.75);
  if (k === 'tape' || (k === 'hl' && S.straight.hl)) {
    const pts = [m, H / 2, 0.5, W - m, H / 2, 0.5];
    if (k === 'tape') drawTape(g, { pts, w, c: S.color.tape, tp: S.tapePat, live: true }, DPR);
    else { g.globalAlpha = strokeAlpha({ hl: true, al: S.alpha.hl }); g.fillStyle = colorOf(S.color.hl); paintPath(g, buildPath(pts, w, true), w, true); }
    return;
  }
  // Schreibprobe wie Handschrift: vier Schlaufen, leichtes Zittern, etwa 1 s geschrieben (4 ms je Punkt), in den Bögen langsamer
  let seed = 7, a = null, t = 0; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647 - 0.5, N = 240, loops = 4, adv = (W - 2 * m - 24) / loops;
  for (let i = 0; i <= N; i++) {
    const u = i / N, ph = 2 * Math.PI * loops * u, x = m + 12 + u * (W - 2 * m - 24) - adv * 0.32 * Math.sin(ph), y = H / 2 - amp * 0.95 * Math.cos(ph) * (0.75 + 0.25 * Math.sin(u * Math.PI));   // Schlaufen oben wie bei „ℓ“
    const p = 0.45 + 0.2 * Math.sin(u * Math.PI) + 0.08 * Math.sin(ph), jx = 0.45 * rnd(), jy = 0.45 * rnd();
    t += 4 * (1 + 0.35 * Math.abs(Math.sin(ph)));
    if (!a) a = smoothStart(x + jx, y + jy, p, 0, (x, y) => [x, y]); else { filterStep(a, x + jx, y + jy, p, t); pushFiltered(a); }
    a.raw = [x + jx, y + jy, p, t];
  }
  catchUp(a);
  const P = new Path2D();
  for (let i = 0; i < a.pts.length / 3; i++) addPiece(P, a.pts, i, w, k === 'hl');
  g.globalAlpha = strokeAlpha({ hl: k === 'hl', al: S.alpha[k] }); g.fillStyle = colorOf(S.color[k]); g.fill(P);
}
function openSizeMenu(k, btn) {
  const m = $('#sizeMenu');
  const was = isOpen(m); closeMenus(); if (was) return;
  sizeKind = k; $('#szRange').value = sizeToT(k, S.size[k]); renderSmooth(); renderTapePats();
  // Stift: Deckkraft, Glättung; Textmarker: dazu „Immer gerade“; Tape: Muster, „Immer gerade“, alle auf- und abdecken
  $('#tpBox').hidden = $('#tpAll').hidden = k !== 'tape'; $('#smBox').hidden = $('#opBox').hidden = k === 'tape'; $('#stBox').hidden = k === 'pen';
  m.classList.toggle('tape', k === 'tape');   // fürs Tape etwas breiter: die Muster passen in eine Reihe
  if (k !== 'tape') $('#opRange').value = Math.round(S.alpha[k] * 100);
  m.classList.remove('hidden'); showSize(); $('#bTune').classList.add('on');
  // unter der ganzen Leiste: bricht sie um, verdeckte das Menü sonst Knöpfe der nächsten Zeile; in niedrigen Fenstern scrollbar
  const r = btn.getBoundingClientRect(), top = Math.max(r.bottom, barBottom()) + 8;
  m.style.top = top + 'px'; m.style.maxHeight = Math.max(220, innerHeight - top - 12) + 'px';
  m.style.left = clamp(r.left + r.width / 2 - m.offsetWidth / 2, 8, innerWidth - m.offsetWidth - 8) + 'px';
  popIn(m, btn);
}
$('#szRange').oninput = () => {
  const k = sizeKind, v = tToSize(k, +$('#szRange').value);
  S.presets[k][S.sizeIdx[k]] = v; S.size[k] = v;
  store.set('presets', S.presets); showSize(); renderSizes();
};
// Deckkraft neuer Striche von Stift bzw. Textmarker (10–100 %); „Farbe übernehmen“ gibt sie auch ausgewählten Strichen
$('#opRange').oninput = () => {
  const k = sizeKind; if (k === 'tape') return;
  S.alpha[k] = clamp(Math.round(+$('#opRange').value) / 100, 0.1, 1);
  store.set('alpha', S.alpha); showSize(); renderSizes();
};
// Tape: Muster neuer Tapes, gerade oder frei, alle Tapes der Seite auf- oder abdecken
// Muster als kleine Tape-Stücke, leicht schräg auf Papier geklebt (wie Washi-Tape), alle in einer Reihe; der Name steht
// unsichtbar dabei (Vorlesen, Tooltip), der des gewählten oben neben „Muster“
const TAPE_TILT = [-4, 3, -2, 4, -3, 2, -4];
function renderTapePats() {
  const box = $('#tpPats'); box.innerHTML = '';
  $('#tpName').textContent = (TAPE_PATTERNS.find(([k]) => k === S.tapePat) || ['', ''])[1];
  TAPE_PATTERNS.forEach(([k, name], i) => {
    const b = document.createElement('button'); b.className = S.tapePat === k ? 'on' : ''; b.title = name;
    const c = tapeSwatch(k, 36, 18, S.tapePat === k); c.style.setProperty('--r', TAPE_TILT[i % TAPE_TILT.length] + 'deg'); b.append(c, name);   // Name: Schriftgröße 0
    b.onclick = () => {
      S.tapePat = k; store.set('tapePat', k);
      if (TAPE_MOTIFS[k]) { S.color.tape = TAPE_MOTIFS[k].c; store.set('color', S.color); renderColors(); }   // Figuren: ihre Farbe gleich mit
      renderTapePats(); showSize(); renderSizes();
    };
    box.appendChild(b);
  });
}
$('#stBtn').onclick = () => { S.straight[sizeKind] = !S.straight[sizeKind]; store.set('straight', S.straight); showSize(); };
function allTapes(hid) {
  const ids = new Set(S.items.filter(it => it.tp).map(it => it.id));
  if (!ids.size) { toast('Auf dieser Seite gibt es noch kein Tape'); return; }
  setTapes(ids, hid);
}
$('#tpShow').onclick = () => allTapes(false);
$('#tpHide').onclick = () => allTapes(true);
// Glättung: fünf Voreinstellungen (Knöpfe) für Stift und Textmarker, der Regler stellt die gewählte ein (wie bei der
// Strichstärke); alles bleibt gespeichert. Neue Striche werden so geschrieben, alte bleiben, wie sie sind.
function renderSmooth() {
  const box = $('#smPresets'); box.innerHTML = '';
  S.smoothPresets.forEach((v, i) => {
    const b = document.createElement('button'); b.className = i === S.smoothIdx ? 'on' : '';
    b.textContent = fmtSmooth(v); b.title = 'Glättung ' + fmtSmooth(v);
    b.onclick = () => setSmooth(i);
    box.appendChild(b);
  });
  $('#smRange').value = Math.round(S.smooth * 100);
}
function setSmooth(i) { S.smoothIdx = i; S.smooth = S.smoothPresets[i]; store.set('smoothIdx', i); renderSmooth(); showSize(); }
$('#smRange').oninput = () => {
  const v = +$('#smRange').value / 100;
  S.smoothPresets[S.smoothIdx] = v; S.smooth = v; store.set('smoothPresets', S.smoothPresets);
  const b = $('#smPresets').children[S.smoothIdx]; b.textContent = fmtSmooth(v); b.title = 'Glättung ' + fmtSmooth(v); showSize();
};
$$('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
// Eigene Formen: klappt unter ihrem Knopf in der Formenleiste auf
function openShapeMenu() {
  if (S.tool !== 'shape') setTool('shape');
  for (const a of $('#shapeBar').getAnimations()) a.finish();   // gerade erschienen: erst an ihrem Platz messen
  const m = $('#shapeMenu'), btn = $('#sbCustom'), r = btn.getBoundingClientRect(), top = Math.max(r.bottom, barBottom()) + 10;   // auch unter einer umbrochenen Formenleiste
  closeMenus(); renderCustomGrid(); markShapeMenu();
  m.classList.remove('hidden');
  m.style.top = top + 'px'; m.style.maxHeight = Math.max(220, innerHeight - top - 12) + 'px';
  m.style.left = clamp(r.left + r.width / 2 - m.offsetWidth / 2, 8, innerWidth - m.offsetWidth - 8) + 'px';
  popIn(m, btn);
}
$('#sbCustom').onclick = () => { if (isOpen($('#shapeMenu'))) closeMenus(); else openShapeMenu(); };
// Stil in der Formenleiste: Kontur, Kanten, Sauberkeit (gilt für neue Grundformen, bleibt gespeichert)
function markShapeStyle() {
  const st = S.shapeStyle;
  $$('#shStyle [data-ds]').forEach(b => b.classList.toggle('on', b.dataset.ds === st.ds));
  $$('#shStyle [data-rnd]').forEach(b => b.classList.toggle('on', +b.dataset.rnd === st.rnd));
  $$('#shStyle [data-sl]').forEach(b => b.classList.toggle('on', +b.dataset.sl === st.sl));
  $$('#shStyle [data-fs]').forEach(b => b.classList.toggle('on', b.dataset.fs === st.fs));
}
$$('#shStyle button').forEach(b => b.onclick = () => {
  const st = S.shapeStyle;
  if (b.dataset.ds) st.ds = b.dataset.ds; if (b.dataset.rnd) st.rnd = +b.dataset.rnd; if (b.dataset.sl) st.sl = +b.dataset.sl; if (b.dataset.fs) st.fs = b.dataset.fs;
  store.set('shapeStyle', st);
  restyleSel(b.dataset.ds ? { ds: st.ds } : b.dataset.rnd ? { rnd: st.rnd } : b.dataset.sl ? { sl: st.sl } : { fs: st.fs });   // gilt auch für die eben gezeichnete Form
  if (isCustom(S.shape) || GRAPHS.has(S.shape)) setShape('rect');   // der Stil gilt für Grundformen: sonst weiter mit dem Rechteck
  if (S.tool !== 'shape') setTool('shape');
  markShapeMenu();
});
/* Popup neben einer mit dem Lasso gewählten Form (nur Grundformen in der Auswahl, nicht im Formen-Werkzeug, dort ist die
   Formenleiste): Farbe und Dicke (wie beim Stift), Kontur, Kanten, Sauberkeit und Füllung (dieselben Knöpfe wie in der
   Formenleiste), aber nur für die
   gewählten Formen; der Stil für neue Formen bleibt. Jede Änderung ist ein Schritt. Es zeigt, was gerade gilt (bei
   mehreren Formen nur, was alle gemeinsam haben), und nur, was zu ihnen passt: Kanten bei Rechteck, Dreiecken und
   Raute, Füllung bei Kastenformen. Es kommt und geht mit der Auswahlleiste und sitzt rechts neben der Auswahl (sonst
   links), oben bündig; liegt die Auswahlleiste unter der Auswahl, unten bündig. */
const SP_NAMES = { ds: 'Kontur', rnd: 'Kanten', sl: 'Sauberkeit', fs: 'Füllung' };
const SP_VAL = { ds: it => it.ds || 'solid', rnd: it => shOf(it).rnd || 0, sl: it => shOf(it).sl || 0, fs: it => it.fs || 'none' };
const SP_FITS = { ds: () => true, rnd: it => SHAPE_CLOSED.has(it.k), sl: () => true, fs: it => SHAPE_FILL.has(it.k) };
for (const [g, name] of [['c', 'Farbe'], ['w', 'Dicke']]) {   // Farbe und Dicke: Knöpfe kommen beim Zeigen (placeShapePop)
  const row = document.createElement('div'), lab = document.createElement('span'), box = document.createElement('div');
  row.className = 'sprow'; row.dataset.g = g; lab.textContent = name; box.className = 'sp' + g; row.append(lab, box); $('#shapePop').appendChild(row);
}
$$('#shStyle .shgrp').forEach(gp => {
  const g = ['ds', 'rnd', 'sl', 'fs'].find(k => gp.querySelector(`[data-${k}]`));
  const row = document.createElement('div'), lab = document.createElement('span'); row.className = 'sprow'; row.dataset.g = g; lab.textContent = SP_NAMES[g];
  row.append(lab, gp.firstElementChild.cloneNode(true)); $('#shapePop').appendChild(row);
});
$$('#shapePop .sprow:not([data-g=c]):not([data-g=w]) button').forEach(b => b.onclick = () => {
  const d = b.dataset;
  restyleSel(d.ds ? { ds: d.ds } : d.rnd ? { rnd: +d.rnd } : d.sl ? { sl: +d.sl } : { fs: d.fs }, true);
});
function popShapes() {
  if (!S.sel || S.sel.auto || S.tool === 'shape') return null;
  const items = selFacts().sel;
  return items.length && items.every(restylable) ? items : null;
}
function placeShapePop(show) {
  const pop = $('#shapePop'), items = show ? popShapes() : null;
  if (!items) { pop.classList.add('hidden'); return; }
  // Farbe: die Farben des Stifts, eine gemeinsame eigene dazu; Dicke: die Stärken des Stifts (Punkt wie in der Leiste)
  const cs = new Set(items.map(it => it.c)), c1 = cs.size === 1 ? [...cs][0] : null, ws = new Set(items.map(it => Math.round(it.w * 100))), w1 = ws.size === 1 ? [...ws][0] / 100 : null;
  // die Knöpfe nur neu bauen, wenn sich etwas daran ändert (nicht bei jedem Nachführen)
  const sig = [c1, w1, S.presets.pen.join()].join('|'), rebuild = pop.dataset.sig !== sig;
  const cbox = pop.querySelector('.spc'), wbox = pop.querySelector('.spw'); if (rebuild) { pop.dataset.sig = sig; pop.wh = null; cbox.replaceChildren(); wbox.replaceChildren(); }
  if (rebuild) for (const c of c1 && !PALETTE.includes(c1) ? [...PALETTE, c1] : PALETTE) {
    const b = document.createElement('button'); b.className = 'spcol' + (c === c1 ? ' on' : ''); b.style.setProperty('--c', colorOf(c));
    b.title = c === 'ink' ? 'Schwarz / Weiß' : c; b.setAttribute('aria-label', 'Farbe ' + b.title); b.onclick = () => restyleSel({ c }, true); cbox.appendChild(b);
  }
  if (rebuild) for (const v of S.presets.pen) {
    const b = document.createElement('button'), d = document.createElement('span'); b.className = 'spdot' + (w1 !== null && Math.abs(v - w1) < 0.01 ? ' on' : '');
    d.style.width = d.style.height = Math.min(16, dotPx('pen', v)) + 'px'; b.title = 'Dicke ' + fmtSize(v); b.setAttribute('aria-label', b.title);
    b.appendChild(d); b.onclick = () => restyleSel({ w: v }, true); wbox.appendChild(b);
  }
  for (const g of ['ds', 'rnd', 'sl', 'fs']) {
    const its = items.filter(SP_FITS[g]), vs = new Set(its.map(SP_VAL[g])), one = vs.size === 1 ? String([...vs][0]) : null;
    const row = pop.querySelector(`.sprow[data-g=${g}]`); if (row.hidden !== !its.length) { row.hidden = !its.length; pop.wh = null; }
    pop.querySelectorAll(`button[data-${g}]`).forEach(b => b.classList.toggle('on', b.dataset[g] === one));
  }
  const appear = pop.classList.contains('hidden'); pop.classList.remove('hidden');
  if (!pop.wh || appear) pop.wh = [pop.offsetWidth, pop.offsetHeight];   // messen nur nach einer Änderung
  const b = S.sel.bb, [x0, y0] = toScreen(b[0], b[1]), [x1, y1] = toScreen(b[2], b[3]), [w, h] = pop.wh, gap = 24;
  let x = x1 + gap; if (x + w > VW - 8) x = x0 - gap - w >= 8 ? x0 - gap - w : VW - 8 - w;
  const bar = $('#selbar'), shown = !bar.classList.contains('hidden'), top = barBottom() + 8, below = shown && parseFloat(bar.style.top) >= y1;
  let y = clamp(below ? y1 - h : y0, top, VH - h - 8);
  if (shown) {   // nie über der Auswahlleiste (kleine Form dicht unter der Leiste): dann darunter, sonst darüber
    const bw = bar.offsetWidth, bl = parseFloat(bar.style.left) - bw / 2, bt = parseFloat(bar.style.top), bh = bar.offsetHeight;
    if (x < bl + bw && x + w > bl && y < bt + bh && y + h > bt) y = bt + bh + 8 + h <= VH - 8 ? bt + bh + 8 : Math.max(top, bt - 8 - h);
  }
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  if (appear) popIn(pop, null, '', 0, 0.8);
}
// gewählte Form überall zeigen: Formenleiste, eigene Formen (Knopf mit ihrem Bild), Knopf „Formen“ in der Leiste
function markShapeMenu() {
  markShapeStyle(); $('#shStyle').classList.toggle('dim', isCustom(S.shape) || GRAPHS.has(S.shape));   // Stil gilt nur für Grundformen
  $$('#shapeBar [data-shape], #shapeMenu [data-shape]').forEach(b => b.classList.toggle('on', b.dataset.shape === S.shape));
  const cs = customOf(S.shape), cb = $('#sbCustom'), pic = $('#sbCustom .sbct');
  cb.classList.toggle('on', !!cs); cb.title = cs ? 'Eigene Form: ' + cs.name + ' · antippen: andere wählen' : 'Eigene Formen';
  if (cs) { const src = customThumb(cs), c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); pic.replaceChildren(c); }
  else if (!pic.querySelector('svg')) pic.innerHTML = '<svg class="i"><use href="#ic-shape"/></svg>';
  $('#shapeMenu .mhint').textContent = isCustom(S.shape) ? 'Tippen: in Originalgröße platzieren · Ziehen: Größe wählen' : 'Ziehen zum Zeichnen · Umschalt: gerade/quadratisch';
  $('#bShape use').setAttribute('href', '#' + (isCustom(S.shape) ? 'ic-shape' : 'sh-' + S.shape));
}
function shapeTitle() {
  const cs = customOf(S.shape), b = !isCustom(S.shape) && $(`#shapeBar [data-shape="${S.shape}"]`);
  $('#bShape').title = 'Formen (F)' + (cs ? ' – ' + cs.name : b ? ' – ' + b.title : '');
}
function setShape(k) { S.shape = k; store.set('shape', k); shapeTitle(); markShapeMenu(); renderColors(); }
function pickShape(k) { setShape(k); closeMenus(); if (S.tool !== 'shape') setTool('shape'); }
$$('#shapeBar [data-shape]').forEach(b => b.onclick = () => pickShape(b.dataset.shape));
shapeTitle(); markShapeMenu();

/* ---------- Koordinatensysteme: Einstellungen ----------
   Abstand der Teilstriche (in Kästchen) und Beschriftung der Achsen, mit Vorschau. Ohne Auswahl gelten sie für neue
   Graphen (Knopf neben den Dicken, wenn bei den Formen ein Koordinatensystem gewählt ist, oder „Einstellungen“ im
   Formen-Menü). „Graph ändern“ in der Leiste einer Auswahl ändert einen gezeichneten Graphen: er wird sofort neu
   gezeichnet, alle Änderungen bis zum Schließen sind ein Schritt beim Rückgängigmachen. */
const GRAPH_NAMES = { axes2: 'Koordinatensystem', axes2p: 'Koordinatensystem, nur positiv', axes3: 'Koordinatensystem 3D' };
const GRAPH_PAIRS = [['x', 'y'], ['t', 's'], ['t', 'v'], ['x', 'f(x)']];
const fmtStep = v => (v === 0.5 ? '½' : String(v)) + ' Kästchen';
let grEdit = null;   // { g: Gruppe des Graphen, items: Stand nach der letzten Änderung }; null: Einstellungen für neue Graphen
// Daten eines gezeichneten Graphen (Gruppe g): gespeichert oder, bei Graphen aus früheren Versionen, aus den Strichen abgeleitet
function graphData(g) {
  const list = S.items.filter(it => it.g === g && it.t === 's');
  const s = list.find(it => it.gr && Array.isArray(it.gr.b) && Array.isArray(it.gr.o));
  return s ? s.gr : graphFromStrokes(list);
}
// Früher gezeichnete Graphen hatten keine Daten: Rechteck und Ursprung aus den Achsen (zuerst gezeichnet, je 5 Punkte),
// Abstand und Maßstab aus den Teilstrichen, Beschriftung x, y, z
function graphFromStrokes(list) {
  const k = list.length ? list[0].k : null;
  if (!GRAPHS.has(k) || !list.every(s => s.k === k)) return null;
  const P = (s, i) => [s.pts[i * 3], s.pts[i * 3 + 1]], arrow = s => !!s && s.pts.length === 15;
  const vert = list.filter(s => s.pts.length === 6 && Math.abs(s.pts[0] - s.pts[3]) < 1e-3);   // senkrechte Teilstriche
  let b, o, gaps;
  if (k === 'axes3') {
    const [za, ya, xa] = list; if (!arrow(za) || !arrow(ya) || !arrow(xa)) return null;
    const [ox, oy] = P(za, 0), [, y0] = P(za, 1), [x1] = P(ya, 1), [xx, xy] = P(xa, 1);
    o = [ox, oy]; b = [xx, y0, x1, xy]; gaps = vert.map(s => s.pts[0] - ox).filter(v => v > 1e-3);
  } else {
    const [xa, ya] = list; if (!arrow(xa) || !arrow(ya)) return null;
    const [x0, oy] = P(xa, 0), [x1] = P(xa, 1), [ox, y1] = P(ya, 0), [, y0] = P(ya, 1);
    o = [ox, oy]; b = [x0, y0, x1, y1]; gaps = vert.map(s => Math.abs(s.pts[0] - ox)).filter(v => v > 1e-3);
  }
  const ge = gaps.length ? Math.min(...gaps) : gridSize(), G = [28, 34].find(v => Math.abs(ge - v) < 0.05) || gridSize();
  return { k, b, o, step: 1, G, f: ge / G, lx: 'x', ly: 'y', lz: 'z' };
}
// Genau ein Graph in der Auswahl (daneben darf anderes ausgewählt sein, etwa die Kurve darauf): seine Gruppe, sonst null
function selGraph() {
  if (!S.sel) return null;
  let g = null;
  for (const it of S.items) if (S.sel.ids.has(it.id) && it.g && GRAPHS.has(it.k)) { if (g && it.g !== g) return null; g = it.g; }
  return g && graphData(g) ? g : null;
}
// Graph g mit geänderten Daten neu zeichnen: neue Striche an der Stelle der alten (Reihenfolge), gleiche Farbe, Dicke, Deckkraft
function rebuildGraph(g, ch) {
  const old = S.items.filter(it => it.g === g), d = graphData(g), first = old.find(it => it.t === 's');
  if (!d || !first) return null;
  const p = { ...d, ...ch };
  const strokes = graphLines(p, first.w).map(xy => { const s = shapeStroke(xy, first.c, first.w, p.k, g, p); if (first.al) s.al = first.al; return s; });
  const ids = new Set(old.map(it => it.id)), k = S.items.findIndex(it => ids.has(it.id));
  const before = S.items.slice(0, k), after = S.items.slice(k).filter(it => !ids.has(it.id));
  const lo = k > 0 ? before[k - 1].o : (after.length ? after[0].o - strokes.length - 1 : 0), hi = after.length ? after[0].o : lo + strokes.length + 1;
  strokes.forEach((s, m) => s.o = lo + (hi - lo) * (m + 1) / (strokes.length + 1));
  return { items: [...before, ...strokes, ...after], old: ids, ids: new Set(strokes.map(s => s.id)) };
}
function applyGraphEdit(ch) {
  const r = rebuildGraph(grEdit.g, ch); if (!r) return;
  const keep = S.sel ? [...S.sel.ids].filter(id => !r.old.has(id)) : [];
  if (grEdit.items === S.items) { r.items.sheets = S.items.sheets; setItems(r.items); markDirty(); requestDraw(); prunePaths(); }   // derselbe Schritt
  else commit(r.items);
  grEdit.items = S.items;
  setSel(new Set([...keep, ...r.ids]));
}
function grValues() {
  if (grEdit) return graphData(grEdit.g);
  const k = GRAPHS.has(S.shape) ? S.shape : 'axes2';
  return { k, ...newGraphSettings(k) };
}
function setGraph(ch) {
  if (grEdit) applyGraphEdit(ch);
  else {
    const d3 = grValues().k === 'axes3';
    for (const [key, v] of Object.entries(ch)) S.graph[d3 && (key === 'lx' || key === 'ly') ? key + '3' : key] = v;
    store.set('graph', S.graph); graphShapeLabels();
  }
  renderGraphMenu();
}
function renderGraphMenu() {
  const v = grValues(); if (!v) return;
  $('#grTitle').textContent = GRAPH_NAMES[v.k] || GRAPH_NAMES.axes2;
  $('#graphMenu').dataset.title = $('#grTitle').textContent;
  $('#grStepVal').textContent = fmtStep(v.step);
  const sb = $('#grSteps'); sb.innerHTML = '';
  for (const s of GRAPH_STEPS) {
    const b = document.createElement('button'); b.textContent = s === 0.5 ? '½' : s; b.className = s === v.step ? 'on' : '';
    b.title = fmtStep(s) + ' zwischen den Teilstrichen'; b.onclick = () => setGraph({ step: s });
    sb.appendChild(b);
  }
  for (const [id, key] of [['#grLx', 'lx'], ['#grLy', 'ly'], ['#grLz', 'lz']]) { const inp = $(id); if (document.activeElement !== inp && inp.value !== v[key]) inp.value = v[key]; }
  $('#grLzRow').hidden = v.k !== 'axes3';
  const pb = $('#grPairs'); pb.innerHTML = ''; pb.hidden = v.k === 'axes3';
  for (const [a, c] of GRAPH_PAIRS) {
    const b = document.createElement('button'); b.textContent = a + ' · ' + c; b.className = v.lx === a && v.ly === c ? 'on' : '';
    b.title = `Achsen ${a} und ${c}`; b.onclick = () => setGraph({ lx: a, ly: c });
    pb.appendChild(b);
  }
  $('#grHint').textContent = grEdit ? 'Ändert den ausgewählten Graphen.' : 'Gilt für neue Koordinatensysteme. Einen gezeichneten ändern: mit dem Lasso antippen, dann „Graph ändern“.';
  drawGraphPreview(v);
}
// Vorschau: ein kleiner Graph mit den Einstellungen, in Farbe und Dicke des Stifts bzw. des ausgewählten Graphen
function drawGraphPreview(v) {
  const cv = $('#grPrev'), W = cv.clientWidth || 248, H = cv.clientHeight || 120;
  if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  const g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  const src = grEdit && S.items.find(it => it.g === grEdit.g && it.t === 's');
  const z = 0.6, w = src ? src.w / (v.f || 1) : S.size.pen, c = src ? src.c : S.color.pen, pad = 10;
  // Rechteck so groß wie die Fläche bei 60 %; danach alles mit Beschriftung einpassen (kleiner, wenn sie weit hinausragt)
  const x0 = 0, y0 = 0, x1 = (W - 2 * pad) / z, y1 = (H - 2 * pad) / z;
  const o = v.k === 'axes3' ? [x0 + 0.4 * (x1 - x0), y0 + 0.6 * (y1 - y0)] : v.k === 'axes2p' ? [x0, y1] : [(x0 + x1) / 2, (y0 + y1) / 2];
  const lines = graphLines({ ...v, b: [x0, y0, x1, y1], o, f: 1 }, w), bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const xy of lines) for (let i = 0; i < xy.length; i += 2) { bb[0] = Math.min(bb[0], xy[i]); bb[1] = Math.min(bb[1], xy[i + 1]); bb[2] = Math.max(bb[2], xy[i]); bb[3] = Math.max(bb[3], xy[i + 1]); }
  const bw = bb[2] - bb[0] + w, bh = bb[3] - bb[1] + w, s = Math.min(z, (W - 2 * pad) / bw, (H - 2 * pad) / bh);
  g.translate((W - bw * s) / 2 - (bb[0] - w / 2) * s, (H - bh * s) / 2 - (bb[1] - w / 2) * s); g.scale(s, s);
  for (const xy of lines) {
    const s = shapeStroke(xy, c, w, v.k); if (src && src.al) s.al = src.al;
    fillStroke(g, s, buildPath(s.pts, s.w, false, s.fl));
  }
}
function openGraphMenu(btn, edit) {
  const m = $('#graphMenu'), g = edit ? selGraph() : null;
  const same = isOpen(m) && !!grEdit === !!edit;   // derselbe Knopf nochmal: schließen
  closeMenus(); if (same || (edit && !g)) return;
  grEdit = edit ? { g, items: null } : null;
  m.classList.remove('hidden'); renderGraphMenu();
  if (!edit) $('#bTune').classList.add('on');
  const r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth, top0 = barBottom() + 8;
  let top = edit ? r.bottom + 8 : Math.max(r.bottom, barBottom()) + 8, left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8);
  if (edit) {
    // neben die Auswahl, damit der Graph beim Ändern zu sehen bleibt; geht das nicht, unter (oder über) die Leiste der Auswahl
    const b = S.sel.bb, [sx0, sy0] = toScreen(b[0], b[1]), [sx1] = toScreen(b[2], b[3]), gap = 20;
    const t = clamp(sy0, top0, Math.max(top0, innerHeight - h - 8));
    if (sx1 + gap + w <= innerWidth - 8) { left = sx1 + gap; top = t; }
    else if (sx0 - gap - w >= 8) { left = sx0 - gap - w; top = t; }
    else if (top + h > innerHeight - 8 && r.top - 8 - h >= top0) top = r.top - 8 - h;
  }
  m.style.top = top + 'px'; m.style.maxHeight = Math.max(220, innerHeight - top - 12) + 'px';
  m.style.left = left + 'px';
  popIn(m, btn);
}
for (const [id, key] of [['#grLx', 'lx'], ['#grLy', 'ly'], ['#grLz', 'lz']]) {
  const inp = $(id); inp.maxLength = LABEL_MAX;
  inp.oninput = () => setGraph({ [key]: inp.value.slice(0, LABEL_MAX) });
  inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
}
$('#sGraph').onclick = () => openGraphMenu($('#sGraph'), true);
$('#grOpen').onclick = () => openGraphMenu($('#bTune'), false);
// Namen der Koordinatensysteme in der Formenleiste mit ihrer Beschriftung
function graphShapeLabels() {
  const L = s => String(s).trim() || '–', { lx, ly, lx3, ly3, lz } = S.graph;
  const t = { axes2: `Koordinatensystem (${L(lx)}, ${L(ly)})`, axes2p: `Nur positiv (${L(lx)}, ${L(ly)})`, axes3: `3D (${L(lx3)}, ${L(ly3)}, ${L(lz)})` };
  for (const k of GRAPHS) { const b = $(`#shapeBar [data-shape="${k}"]`); if (b) { b.title = t[k]; b.setAttribute('aria-label', t[k]); } }
  shapeTitle();
}
graphShapeLabels();

/* ---------- Eigene Formen: Bibliothek ----------
   Gespeichert werden die Striche einer Auswahl (Bilder nicht), Punkte relativ zur geometrischen oberen linken Ecke
   (Punkte ohne Strichbreite), w/h = diese Box. Die Bibliothek gilt für alle Bücher und Seiten. */
const CUSTOM_MAX_PTS = 60000;
const shapesWord = n => n === 1 ? '1 eigene Form' : n + ' eigene Formen';
async function loadCustomShapes() {
  try { CUSTOM = (await dbShapesAll()).sort(byCreated); } catch (e) { CUSTOM = []; }
  customReady = true;
  if (isCustom(S.shape) && !customOf(S.shape)) setShape('rect');   // Form gibt es nicht mehr
  shapeTitle(); markShapeMenu(); renderColors();
  if (!$('#shapeMenu').classList.contains('hidden')) renderCustomGrid();
}
async function saveCustomShape() {
  if (!S.sel) return;
  const strokes = S.items.filter(it => S.sel.ids.has(it.id) && it.t === 's' && !it.tp && !it.nt);   // Tapes und Markierungen nicht als Form
  if (!strokes.length) return;
  const n = strokes.reduce((m, s) => m + s.pts.length / 3, 0);
  if (n > CUSTOM_MAX_PTS) { toast(`Die Auswahl ist zu groß für eine Form (${n.toLocaleString('de-DE')} Punkte, höchstens ${CUSTOM_MAX_PTS.toLocaleString('de-DE')})`, 4500); return; }
  let k = CUSTOM.length + 1; while (CUSTOM.some(r => r.name === 'Form ' + k)) k++;
  const name = await ask('Name der Form:', 'Form ' + k, true, { ok: 'Speichern' });
  if (name == null) return;
  const [x0, y0] = geoBox(strokes);
  const list = strokes.map(s => {
    const p = new Float32Array(s.pts);
    for (let i = 0; i < p.length; i += 3) { p[i] -= x0; p[i + 1] -= y0; }
    const st = { c: s.c, w: s.w, hl: !!s.hl, pts: p };
    if (s.al) st.al = s.al;
    if (s.fl) st.fl = s.fl.map(r => [r[0], r[1]]);
    if (s.ds) st.ds = s.ds;
    if (s.fs) st.fs = s.fs;
    return st;
  });
  const b = geoBox(list), rec = { id: uid(), name: name.trim() || 'Form ' + k, created: Date.now(), w: b[2], h: b[3], strokes: list };
  try { await dbShapePut(rec); } catch (e) { toast('Speichern nicht möglich: ' + e.message, 5000); return; }
  CUSTOM.push(rec);
  toast('Gespeichert – zu finden unter Formen › Eigene Formen', 3200);
}
async function deleteCustomShape(r) {
  if (!await askYes(`Form „${r.name}“ löschen?`, { ok: 'Löschen', danger: true })) return;
  try { await dbShapeDelete(r.id); } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 5000); return; }
  CUSTOM = CUSTOM.filter(x => x.id !== r.id);   // schon platzierte Formen bleiben (gewöhnliche Striche)
  for (const k of [...thumbCache.keys()]) if (k.startsWith(r.id + '|')) thumbCache.delete(k);
  if (S.shape === 'custom:' + r.id) setShape('rect');
  if (!$('#shapeMenu').classList.contains('hidden')) { renderCustomGrid(); markShapeMenu(); }
}
// Vorschaubild einer eigenen Form (56 px), mit den echten Pfaden; dünne Striche bleiben sichtbar
const thumbCache = new Map();   // id|dunkel|DPR -> Canvas
function customThumb(r) {
  const key = r.id + '|' + S.dark + '|' + DPR;
  let c = thumbCache.get(key); if (c) return c;
  const SZ = 56, room = SZ - 10, mw = r.strokes.reduce((m, st) => Math.max(m, st.w), 0) * 0.8;   // Rand für die Strichbreite
  const k = Math.min(room / (r.w + 2 * mw), room / (r.h + 2 * mw), 6);
  c = document.createElement('canvas'); c.width = c.height = Math.round(SZ * DPR);
  const g = c.getContext('2d'), f = c.width / SZ;
  g.setTransform(f * k, 0, 0, f * k, f * (SZ / 2 - r.w / 2 * k), f * (SZ / 2 - r.h / 2 * k));
  for (const st of r.strokes) shapeDraw(g, st, buildPath(st.pts, Math.max(st.w, (st.hl ? 3 : 1.3) / k), st.hl, st.fl, st.ds));
  thumbCache.set(key, c);
  return c;
}
function renderCustomGrid() {
  const box = $('#customGrid'); box.innerHTML = '';
  if (!CUSTOM.length) {
    box.innerHTML = '<div class="cempty"><span class="ci"><svg class="i"><use href="#ic-lasso"/></svg></span><span>Etwas zeichnen, mit dem Lasso markieren und „<b>Als Form speichern</b>“ tippen.</span></div>';
    return;
  }
  for (const r of CUSTOM) {
    const t = document.createElement('div'); t.className = 'ct';
    t.innerHTML = '<button class="cpick"><span class="cth"></span><span class="cn"></span></button><button class="cdel" title="Form löschen"><svg class="i"><use href="#ic-x"/></svg></button>';
    const b = t.firstChild; b.dataset.shape = 'custom:' + r.id; b.title = r.name;
    b.firstChild.appendChild(customThumb(r)); b.lastChild.textContent = r.name;
    b.onclick = () => pickShape(b.dataset.shape);
    t.lastChild.onclick = () => deleteCustomShape(r);
    box.appendChild(t);
  }
}
$('#bSnap').onclick = toggleSnap; $('#bSnap').classList.toggle('on', S.snap);
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
$('#zoom').onclick = () => zoomAt(VW / 2, VH / 2, 1);
// Knöpfe nach dem Klick nicht fokussiert lassen (sonst löst die Leertaste sie erneut aus)
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) requestAnimationFrame(() => { if (document.activeElement === b) b.blur(); }); });   // im nächsten Bild: nicht mitten im Umbau alle Stile neu

function applyDark() {
  document.documentElement.classList.toggle('dark', S.dark);
  $('meta[name=theme-color]').content = S.dark ? '#151618' : '#f2f2ef';   // Statusleiste auf dem iPad
  $('#hDark span').textContent = S.dark ? 'Hellmodus' : 'Darkmode';
  patCache.clear(); clearTiles(); renderColors();
  if (S.note) { draw(); drawLive(); }
}
function toggleDark() { S.dark = !S.dark; store.set('dark', S.dark); applyDark(); }
$('#bDark').onclick = toggleDark; $('#hDark').onclick = toggleDark;
/* Aussehen „Windows XP“: nur CSS (html.xp, gesetzt schon im Kopf der Seite); die Titelleisten zeigen data-title, ihr rotes ✕
   schließt das Fenster (im Editor: zurück zum Buch). Der Schreibbereich folgt weiter Hell/Dunkel. */
const isXP = () => document.documentElement.classList.contains('xp');
function applyTheme() {
  const xp = XP_ON && S.theme === 'xp';
  document.documentElement.classList.toggle('xp', xp);
  $('#hTheme').classList.toggle('on', xp);
  $('#hTheme').classList.toggle('hidden', !XP_ON); $('#mTheme').classList.toggle('hidden', !XP_ON);   // XP aus: keine Umschalter
  xpTitle(); fitBar(); if (S.sel) placeSelbar();
}
function toggleTheme() { if (!XP_ON) return; S.theme = S.theme === 'xp' ? 'modern' : 'xp'; store.set('theme', S.theme); applyTheme(); toast('Aussehen: ' + (S.theme === 'xp' ? 'Windows XP' : 'modern'), 1400); }
$('#hTheme').onclick = toggleTheme;
$('#mTheme').onclick = () => { closeMenus(); toggleTheme(); };
// Titelleiste des Editors: „Name – Notizen“ wie ein Fenster damals
function xpTitle() { $('#bar').dataset.title = ($('#title').value.trim() || 'Ohne Titel') + ' – Notizen'; }
// Trifft ein Tipp das ✕ rechts in der Titelleiste von el? (als Hintergrund gezeichnet, der Tipp trifft el selbst)
function xpCloseHit(el, e, top, h = 30) {
  if (!isXP() || e.target !== el) return false;
  const r = el.getBoundingClientRect(), y0 = top === undefined ? r.top : top;
  return e.clientX > r.right - 34 && e.clientY >= y0 && e.clientY < y0 + h;
}
for (const m of $$('.menu[data-title]')) m.addEventListener('pointerdown', e => { if (xpCloseHit(m, e)) { e.preventDefault(); e.stopPropagation(); closeMenus(); } });
$('#dlgBox').addEventListener('pointerdown', e => { if (xpCloseHit($('#dlgBox'), e)) { e.preventDefault(); $('#dlgNo').click(); } });
$('#bar').addEventListener('pointerdown', e => { const r = $('#bar').getBoundingClientRect(); if (xpCloseHit($('#bar'), e, r.top - 30)) { e.preventDefault(); $('#bBack').click(); } });

/* Aufploppen aller Popups (Menüs, Farbwähler, Dialog, Auswahlleiste): aus dem Knopf heraus, kurz federnd (dieselbe
   Feder wie bei den Buch-Animationen); beim Schließen huschen Menüs kurz zusammen. Bei „Bewegung reduzieren“ ohne
   Bewegung. Ein Menü, das gerade zugeht, gilt schon als zu (isOpen): nochmal antippen öffnet es gleich wieder. */
const POP = { bounce: 0.36, ms: 380, from: 0.58 };
const isOpen = m => !m.classList.contains('hidden') && !m.dataset.closing;
// el ist schon sichtbar und an seinem Platz. from: Knopf, aus dem es kommt (sonst aus der Mitte); base: eigenes
// transform des Elements (Auswahlleiste: zentriert); s0: Startgröße
// popAnims: die Animationen von popIn/popOut je Element. Sie selbst abzubrechen statt getAnimations zu fragen: das zwänge
// den Browser, alle Stile sofort neu zu berechnen (beim Werkzeugwechsel nach dem Umbau der Leiste spürbar).
// origin: Ursprung schon bekannt (Formenleiste: aus der gemerkten Lage), dann wird nichts gemessen
const popAnims = new WeakMap();
function popIn(el, from, base = '', delay = 0, s0 = POP.from, origin = null) {
  (popAnims.get(el) || []).forEach(a => a.cancel()); popAnims.delete(el); delete el.dataset.closing;
  if (reduceMotion()) return;
  if (origin) el.style.transformOrigin = `${origin[0]}px ${origin[1]}px`;
  else if (from) {
    const r = from.getBoundingClientRect(), m = el.getBoundingClientRect();
    const ox = clamp(r.left + r.width / 2 - m.left, 12, m.width - 12), oy = r.top + r.height / 2 < m.top + m.height / 2 ? -10 : m.height + 10;
    el.style.transformOrigin = `${ox}px ${oy}px`;
  } else el.style.transformOrigin = '';
  popAnims.set(el, [el.animate([{ transform: `${base} scale(${s0})` }, { transform: base || 'none' }], sp(spring(POP.bounce, POP.ms), { delay, fill: 'backwards' })),
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, easing: 'ease-out', delay, fill: 'backwards' })]);
}
// Die Zugeh-Animation hält ihr Ende (fill: forwards), bis das Menü versteckt ist, und wird dann sofort entfernt. Bliebe
// sie am versteckten Menü stehen, brachte Chromium (Windows-App, Chrome 140) beim späteren Öffnen manchmal ihr Ende
// zurück, obwohl popIn sie abgebrochen hatte: das Menü war offen, aber durchsichtig und etwas kleiner, und das bei
// jedem weiteren Öffnen, bis zum Neustart
function popOut(el) {
  if (el.classList.contains('hidden') || el.dataset.closing) return;
  if (reduceMotion()) { el.classList.add('hidden'); return; }
  el.dataset.closing = '1';
  const a = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.95)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
  popAnims.set(el, [...(popAnims.get(el) || []), a]);
  a.onfinish = () => { if (el.dataset.closing) { delete el.dataset.closing; el.classList.add('hidden'); } a.cancel(); };
}
function closeMenus() { saveNoteCard(); hideDim(); $$('.menu').forEach(popOut); $$('.mbtn.on').forEach(b => b.classList.remove('on')); $('#bTune').classList.remove('on'); }
function openMenu(menu, btn) {
  const was = isOpen(menu); closeMenus(); if (was) return;
  menu.classList.remove('hidden');
  const r = btn.getBoundingClientRect();
  menu.style.top = (r.bottom + 8) + 'px';
  menu.style.left = clamp(r.right - menu.offsetWidth, 8, innerWidth - menu.offsetWidth - 8) + 'px';
  popIn(menu, btn);
}
// Der Dialog schließt kein Menü (eine eigene Form im offenen Formen-Menü löschen)
document.addEventListener('pointerdown', e => { if (txEd && !e.target.closest('#txEd,#txBar,#txGrip,#txMove')) { commitText(); txClosedAt = e.timeStamp; }   // daneben: Text fertig (dieser Tipp legt keinen neuen an)
  if (ncCur && e.pointerType === 'touch' && performance.now() < penActiveUntil) return; if (!e.target.closest('.menu') && !e.target.closest('#bBg,#bImg,#bMore,#sizes,#bTune,.mbtn,#dlg,.sw.custom,#sGraph,#sbCustom,#grOpen') && e.target !== cvLive) closeMenus(); }, true);
$('#bBg').onclick = () => { $$('#bgMenu [data-bg]').forEach(b => b.classList.toggle('on', b.dataset.bg === (S.note.bg || 'dots'))); openMenu($('#bgMenu'), $('#bBg')); };
$$('#bgMenu [data-bg]').forEach(b => b.onclick = () => { S.note.bg = b.dataset.bg; markDirty(); clearTiles(); closeMenus(); });
$('#bSheet').onclick = addSheet;
$('#bMore').onclick = () => {
  $('#mFit').textContent = paperSize() ? 'Ganzes Blatt anzeigen' : 'Alles anzeigen'; $('#mFinger').textContent = 'Mit dem Finger zeichnen: ' + (S.fingerDraw ? 'an' : 'aus');
  $('#mFull').textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild';
  $('#mTheme').textContent = 'Aussehen: ' + (S.theme === 'xp' ? 'modern' : 'Windows XP');
  openMenu($('#moreMenu'), $('#bMore'));
};
// Vollbild: ohne Titelleiste des Fensters und ohne Taskleiste; Esc oder nochmal beendet es. Das Windows-Programm ruft
// das auch bei F11 auf (main.js), damit es dasselbe Vollbild ist
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(e => toast('Vollbild geht hier nicht: ' + e.message, 4000));
  return true;
}
$('#mFull').onclick = () => { closeMenus(); toggleFullscreen(); };
// Esc beendet das Vollbild, wenn nichts anderes offen ist (der Browser macht das selbst, das Windows-Programm nicht)
const escFullscreen = () => { if (document.fullscreenElement && !$$('.menu').some(isOpen) && !S.sel) { document.exitFullscreen().catch(() => {}); return true; } return false; };
$('#mFinger').onclick = () => { S.fingerDraw = !S.fingerDraw; store.set('fingerDraw', S.fingerDraw); liveVis(); closeMenus(); toast(S.fingerDraw ? 'Ein Finger zeichnet jetzt, zwei Finger verschieben und zoomen' : 'Finger verschieben und zoomen nur noch', 2600); };
$('#mFit').onclick = () => { closeMenus(); fitAll(); };
$('#mPng').onclick = () => { closeMenus(); exportPNG(); };
$('#mPdf').onclick = () => { closeMenus(); exportPDF(); };
$('#mClear').onclick = async () => { closeMenus(); if (S.items.length && await askYes('Alles auf dieser Seite löschen? (Rückgängig ist möglich)')) { clearSel(); commit([]); } };

$('#sDel').onclick = () => { if (!S.sel) return; const ids = S.sel.ids; clearSel(); commit(S.items.filter(it => !ids.has(it.id))); };
$('#sDup').onclick = () => {
  if (!S.sel) return;
  const sel = S.items.filter(it => S.sel.ids.has(it.id)), ids = new Set(), groups = new Map();
  let dx = 24 / S.view.z, dy = dx;
  if (S.snap) { const r = snapRef(sel), st = snapStep(); dx = snapX(r[0] + st) - r[0]; dy = snapY(r[1] + st) - r[1]; }   // einen Rasterpunkt weiter, auf dem Raster
  const newId = new Map(sel.map(it => [it.id, uid()]));   // was auf etwas Kopiertem liegt (Tape, Erklärung), gehört zur Kopie
  const copies = sel.map(it => {
    const c = transformItem(it, 1, 0, 0, dx, dy); c.id = newId.get(it.id); ids.add(c.id);
    if (c.on && newId.has(c.on)) c.on = newId.get(c.on);
    if (c.g) { if (!groups.has(c.g)) groups.set(c.g, uid()); c.g = groups.get(c.g); }   // Kopie = eigene Gruppe
    return c;
  });
  commit(appendItems(withImages(S.items, copies.filter(c => c.t === 'i')), copies.filter(c => c.t !== 'i')));
  setSel(ids);
};
$('#sSave').onclick = saveCustomShape;
// Farbe übernehmen: mit der Deckkraft von Stift bzw. Textmarker
$('#sColor').onclick = () => {
  if (!S.sel) return;
  commit(S.items.map(it => {
    if (!S.sel.ids.has(it.id) || it.t !== 's' || it.nt) return it;
    if (it.tp) return { ...it, c: S.color.tape };
    const k = it.hl ? 'hl' : 'pen', n = { ...it, c: S.color[k] };
    if (S.alpha[k] !== ALPHA_DEFAULT[k]) n.al = S.alpha[k]; else delete n.al;
    return n;
  })); refreshSel();
};
$('#sSize').onclick = () => {
  if (!S.sel) return;
  commit(S.items.map(it => {
    if (!S.sel.ids.has(it.id) || it.t !== 's' || it.nt) return it;
    const w = it.tp ? S.size.tape : it.hl ? S.size.hl : S.size.pen;
    return { ...it, w, bb: bboxOf(it.pts, w) };
  })); refreshSel();
};

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && (k === '+' || k === '=' || k === '-' || k === '0')) e.preventDefault();   // kein Browser-Zoom
  if (!$('#dlg').classList.contains('hidden')) {
    if (k === 'escape') $('#dlgNo').click();
    else if (k === 'enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { e.preventDefault(); $('#dlgBox').requestSubmit(); }
    return;
  }
  if ($('#editor').classList.contains('hidden') && k === 'escape') {   // Startseite: Menü schließen, sonst zurück zum Regal
    if ($$('.menu').some(isOpen)) closeMenus(); else if (homeBook) showShelf(); else escFullscreen();
    return;
  }
  // Esc schließt offene Menüs auch, wenn ein Regler darin noch den Fokus hat
  if (k === 'escape' && $$('.menu').some(isOpen)) { closeMenus(); if (e.target.blur) e.target.blur(); return; }
  if ($('#editor').classList.contains('hidden') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (k === ' ') { e.preventDefault(); if (!spaceDown && !action) { spaceDown = true; cvLive.style.cursor = 'grab'; } return; }
  if (action) {
    if (k === 'escape') cancelAction();
    else if (k === 'shift' && action.kind === 'shape') { action.shift = true; requestLive(); }
    return;
  }
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === '0') zoomAt(VW / 2, VH / 2, 1);
  else if (mod && (k === '+' || k === '=')) zoomAt(VW / 2, VH / 2, S.view.z * 1.25);
  else if (mod && k === '-') zoomAt(VW / 2, VH / 2, S.view.z / 1.25);
  else if ((k === 'delete' || k === 'backspace') && S.sel) { e.preventDefault(); $('#sDel').click(); }
  else if (k === 'escape') { if (!escFullscreen()) { clearSel(); closeMenus(); } }
  else if (!mod && !e.altKey && k === 'g') toggleSnap();
  else if (!mod && !e.altKey) { const t = { p: 'pen', m: 'hl', t: 'tape', f: 'shape', e: 'eraser', l: 'lasso', h: 'hand', x: 'text' }[k]; if (t) setTool(t); }
});
document.addEventListener('keyup', e => {
  if (e.key === ' ' && spaceDown) { e.preventDefault(); spaceDown = false; setTool(S.tool); }
  if (e.key === 'Shift' && action && action.kind === 'shape') { action.shift = false; requestLive(); }
});

/* ---------- Bilder & PDF ---------- */
let importChain = Promise.resolve();
function queueImport(fn) {
  S.busy++;
  const run = importChain.then(fn).catch(err => { console.error(err); toast('Import fehlgeschlagen: ' + (err.message || err), 5000); })
    .finally(() => { S.busy--; });
  importChain = run;
  return run;
}
function viewCenterWorld() { const top = barBottom(); return toWorld(VW / 2, top + (VH - top) / 2); }
// nicht exakt über einen vorherigen Import legen (mit Raster: obere linke Ecke auf einen Rasterpunkt)
function freeSpot(x, y, w) {
  const G = gridSize();
  if (S.snap) x = snapX(x);
  for (let k = 0; k < 50; k++) {
    if (!S.items.some(it => it.t === 'i' && Math.abs(it.x - x) < 1 && Math.abs(it.y - y) < 1)) return x;
    x += w + 40 / S.view.z; if (S.snap) x = snapAx(0, x, Math.ceil);
  }
  return x;
}
async function prepareImage(file) {
  const bmp = await decodeBlob(file);
  const w0 = bmp.width, h0 = bmp.height;
  const s = Math.min(1, Math.sqrt(16e6 / (w0 * h0)), 8192 / Math.max(w0, h0));
  let blob = file, w = w0, h = h0;
  const keep = /^image\/(jpeg|png|webp)$/.test(file.type) && s === 1;
  if (!keep) {
    w = Math.max(1, Math.round(w0 * s)); h = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
    blob = await canvasToBlob(c, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.92);
    c.width = c.height = 0;
  }
  const low = await makeLow(bmp, blob.type); bmp.close();
  return { blob, low, w, h };
}
// at: Weltpunkt, auf dem das (erste) Bild mittig liegt; sonst die Mitte des Bildschirms
function insertImages(files, at) {
  const list = [...files].filter(f => f.type.startsWith('image/'));
  if (!list.length || !S.note) return;
  const note = S.note;
  return queueImport(async () => {
    toast('Bild wird eingefügt …', 0);
    const [cx, cy] = at || viewCenterWorld(), added = [];
    let off = 0;
    for (const f of list) {
      try {
        const { blob, low, w, h } = await prepareImage(f);
        const imgId = uid();
        await dbImagePut({ id: imgId, n: note.id, blob, low, w, h });
        const sw = Math.min(w / DPR, VW * 0.5, (VH * 0.6) * w / h), ww = sw / S.view.z, hh = ww * h / w;
        const y = S.snap ? snapY(cy - hh / 2 + off) : cy - hh / 2 + off, x = freeSpot(cx - ww / 2 + off, y, ww);
        added.push({ t: 'i', id: uid(), img: imgId, x, y, w: ww, h: hh });
        off += 30 / S.view.z;
      } catch (e) { toast('„' + f.name + '“ kann nicht geöffnet werden (Format nicht unterstützt?)', 4500); await new Promise(r => setTimeout(r, 1200)); }
    }
    if (added.length && S.note === note) {
      commit(withImages(S.items, added)); setTool('lasso'); setSel(new Set(added.map(a => a.id)));
      toast('Eingefügt. Zum Verschieben ziehen, über den blauen Punkt skalieren.', 3000);
    }
  });
}
let pdfWorker = null;
// pdf.js liegt als Text in der Seite und wird erst beim ersten PDF ausgeführt: spart bei jedem Start etwa 75 ms
function loadPdfJs() {
  if (window.pdfjsLib) return;
  const s = document.createElement('script'); s.textContent = $('#pdfjsSrc').textContent; document.head.appendChild(s);
}
function getPdfWorker() {
  loadPdfJs();
  if (pdfWorker) return pdfWorker;
  const url = URL.createObjectURL(new Blob([$('#pdfWorkerSrc').textContent], { type: 'text/javascript' }));
  pdfjsLib.GlobalWorkerOptions.workerSrc = url;
  try { pdfWorker = new pdfjsLib.PDFWorker({ port: new Worker(url) }); } catch (e) { pdfWorker = null; }
  return pdfWorker;
}
// Eine PDF-Seite als Bild in der Datenbank ablegen; w = Breite in Weltkoordinaten
async function pdfPageImage(page, vp1, w, noteId) {
  // etwa doppelte Bildschirmauflösung bei 100 %, höchstens ~10 Mio. Pixel
  let scale = clamp(w * 2.2 / vp1.width, 0.5, 4);
  scale = Math.min(scale, Math.sqrt(10e6 / (vp1.width * vp1.height)));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  const low = await makeLow(c, 'image/jpeg');
  const pw = c.width, ph = c.height; c.width = c.height = 0;
  const imgId = uid();
  await dbImagePut({ id: imgId, n: noteId, blob, low, w: pw, h: ph });
  return imgId;
}
// Seitenformat: wohin eine PDF-Seite auf Blatt k kommt (A3 quer: linke Hälfte, sonst das ganze Blatt)
function pdfSlot(k, n = S.note) {
  const r = sheetRect(k, n);
  return n.paper.f === 'a3' && n.paper.o === 'l' ? [r[0], r[1], (r[0] + r[2]) / 2, r[3]] : r;
}
// m leere Blätter hinter Blatt k einfügen: was darunter liegt, rutscht nach unten
function withSheets(items, k, m) {
  const cut = sheetRect(k)[3] + GAP / 2, dy = m * (paperSize()[1] + GAP);
  return items.map(it => itemBox(it)[1] >= cut ? transformItem(it, 1, 0, 0, 0, dy) : it);
}
// Blatt k oben ins Bild holen (Zoom bleibt)
function showSheet(k) { const r = sheetRect(k), z = S.view.z; setView(S.view.tx, barBottom() + 16 - r[1] * z, z, true); }
function addSheet() {
  if (!S.note || !paperSize()) return;
  cancelAction(); clearSel();
  const k = currentSheet();
  commit(withSheets(S.items, k, 1), true, sheetCount() + 1);
  showSheet(k + 1);
  toast(`Blatt ${k + 2} von ${sheetCount()} eingefügt`, 1600);
}
// in das Feld einpassen: Seitenverhältnis bleibt, mittig
function fitInto(slot, w, h) {
  const sw = slot[2] - slot[0], sh = slot[3] - slot[1], s = Math.min(sw / w, sh / h);
  return { x: slot[0] + (sw - w * s) / 2, y: slot[1] + (sh - h * s) / 2, w: w * s, h: h * s };
}
function insertPdf(file) {
  if (!S.note) return;
  const note = S.note;
  return queueImport(async () => {
    toast('PDF wird geladen …', 0);
    const worker = getPdfWorker();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...(worker ? { worker } : {}) }).promise;
    if (paperSize(note)) return insertPdfPages(pdf, file, note);
    const added = [], failed = [];
    try {
      const [cx] = viewCenterWorld(), [, y0] = toWorld(0, barBottom() + 30);
      let y = S.snap ? snapY(y0) : y0, x = null;
      for (let i = 1; i <= pdf.numPages; i++) {
        toast(`PDF-Seite ${i} von ${pdf.numPages} …`, 0);
        try {
          const page = await pdf.getPage(i), vp1 = page.getViewport({ scale: 1 });
          const w = vp1.width * 1.3, h = vp1.height * 1.3;
          const imgId = await pdfPageImage(page, vp1, w, note.id);
          if (x === null) x = freeSpot(cx - w / 2, y, w);
          added.push({ t: 'i', id: uid(), img: imgId, x, y, w, h, pdf: file.name, page: i });
          y += h + 30; if (S.snap) y = snapAx(1, y, Math.ceil);
          page.cleanup();
        } catch (err) { console.error(err); failed.push(i); }
        await nextFrame();
      }
    } finally { pdf.destroy(); }
    if (added.length && S.note === note) commit(withImages(S.items, added));
    toast(`${added.length} Seite${added.length === 1 ? '' : 'n'} eingefügt` + (failed.length ? `, Seite ${failed.join(', ')} fehlerhaft` : ''), 3500);
  });
}
// Seite mit Format: jede PDF-Seite kommt auf ein eigenes Blatt dieses Dokuments (A3 quer: die linke Hälfte).
// Die erste auf das Blatt in der Mitte des Bildschirms, wenn dort noch kein Bild liegt (sonst auf ein neues dahinter),
// die weiteren auf neue Blätter direkt dahinter; was danach kommt, rutscht nach unten. Rückgängig ist ein Schritt.
async function insertPdfPages(pdf, file, note) {
  const N = pdf.numPages, cur = currentSheet(), added = [], failed = [];
  const free = !S.items.some(it => it.t === 'i' && boxHit(itemBox(it), pdfSlot(cur, note)));
  try {
    for (let i = 1; i <= N; i++) {
      toast(`PDF-Seite ${i} von ${N} …`, 0);
      try {
        const page = await pdf.getPage(i), vp1 = page.getViewport({ scale: 1 }), box = fitInto(pdfSlot(0, note), vp1.width, vp1.height);
        const imgId = await pdfPageImage(page, vp1, box.w, note.id);
        added.push({ t: 'i', id: uid(), img: imgId, ...box, pdf: file.name, page: i });   // vorerst auf Blatt 0, unten verschoben
        page.cleanup();
      } catch (err) { console.error(err); failed.push(i); }
      await nextFrame();
    }
  } finally { pdf.destroy(); }
  const bad = failed.length ? `, Seite ${failed.join(', ')} fehlerhaft` : '';
  if (!added.length || S.note !== note) { toast('Keine PDF-Seite eingefügt' + bad, 4500); return; }
  const first = free ? cur : cur + 1, extra = added.length - (free ? 1 : 0), step = paperSize(note)[1] + GAP;
  added.forEach((it, j) => { it.y += (first + j) * step; });
  commit(withImages(extra ? withSheets(S.items, cur, extra) : S.items, added), true, sheetCount() + extra);
  if (first !== cur) showSheet(first);
  const last = first + added.length - 1;
  toast((added.length === 1 ? `1 PDF-Seite auf Blatt ${first + 1}` : `${added.length} PDF-Seiten auf Blatt ${first + 1}–${last + 1}`) + ' eingefügt' + bad, 4000);
}
// Bild aus der Zwischenablage, ohne es erst als Datei zu speichern (etwa ein Bildschirmfoto mit Win + Umschalt + S).
// Der Browser fragt dabei evtl. nach Erlaubnis; Strg + V geht auch so (paste-Ereignis unten)
const CLIP_EMPTY = 'In der Zwischenablage ist kein Bild. Bildschirmfoto: Win + Umschalt + S';
// Inhalt der Zwischenablage: Bilder (als Dateien) und Text; null (mit Hinweis), wenn der Zugriff fehlt
async function clipRead() {
  const cb = navigator.clipboard;
  if (!cb || !cb.read) { toast('Hier geht das Einfügen aus der Zwischenablage nur mit Strg + V', 4000); return null; }
  const files = []; let text = '';
  try {
    for (const it of await cb.read()) {
      const type = it.types.find(t => t.startsWith('image/'));
      if (type) files.push(new File([await it.getType(type)], 'Bild aus der Zwischenablage', { type }));
      else if (!text && it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
    }
  } catch (e) {
    toast(e && e.name === 'NotAllowedError' ? 'Kein Zugriff auf die Zwischenablage. Mit Strg + V geht es auch.' : CLIP_EMPTY, 4500); return null;
  }
  return { files, text };
}
// nur Bilder (Einfügen auf der Seite); null mit Hinweis, wenn keins da ist
async function clipImages() {
  const r = await clipRead(); if (!r) return null;
  if (!r.files.length) { toast(CLIP_EMPTY, 4500); return null; }
  return r.files;
}
async function pasteImage(at) {
  if (!S.note) return;
  const files = await clipImages();
  if (files) return insertImages(files, at);
}
/* Finger auf der Seite gedrückt halten (oder Rechtsklick mit der Maus): Blase „Einfügen“. Sie legt ein Bild aus der
   Zwischenablage genau dorthin, mittig unter den Finger. Bewegt sich der Finger, verschiebt er wie sonst die Seite und
   die Blase geht zu. Zeichnet der Finger („Mit dem Finger zeichnen“), gibt es das nicht. */
const HOLD_MS = 500;
let pasteAt = null, pasteHoldT = 0, lastPan = null;
function armPasteHold(g) {
  clearTimeout(pasteHoldT);
  pasteHoldT = setTimeout(() => {
    if (gesture !== g || g.moved || g.cancelled || g.maxN !== 1 || touches.size !== 1 || action || !S.note) return;
    g.held = true; showPasteMenu(g.c0[0], g.c0[1]);
  }, HOLD_MS);
}
// sx, sy: Punkt auf der Seite wie localXY
function showPasteMenu(sx, sy) {
  const m = $('#pasteMenu'), r = cvLive.getBoundingClientRect(), x = r.left + sx, y = r.top + sy;
  closeMenus(); pasteAt = toWorld(sx, sy);
  m.classList.remove('hidden');
  const w = m.offsetWidth, h = m.offsetHeight;
  let top = y - h - 40;   // über dem Finger, damit er die Blase nicht verdeckt
  if (top < barBottom() + 8) top = y + 32;
  m.style.left = clamp(x - w / 2, 8, innerWidth - w - 8) + 'px';
  m.style.top = clamp(top, 8, innerHeight - h - 8) + 'px';
  popIn(m, { getBoundingClientRect: () => ({ left: x, top: y, width: 0, height: 0 }) });
}
$('#pmPaste').onclick = () => { const at = pasteAt; closeMenus(); pasteImage(at); };
/* ---------- Erklärungen (in der App heißen sie „Notiz“) ----------
   Mit dem Lasso etwas auswählen, dann „Erklärung“: eine Karte mit kurzem Text, einem Bild (Zwischenablage oder Datei)
   und einer kleinen Fläche zum Schreiben. Sie hängt an einer Markierung: einem unsichtbaren Strich (k 'note', Inhalt
   in nt), einem Rechteck 6 px um das Markierte; zu sehen ist nur ein blaues „i“ in seiner oberen rechten Ecke. Das
   Markierte hängt an ihr (on): beides wandert zusammen. Ein Fingertipp auf die Stelle oder ein Stifttipp auf das „i“
   öffnet die Karte. Gespeichert wird beim Schließen, als ein Schritt fürs Rückgängigmachen; ganz leer heißt: keine
   Erklärung. (Markierungen mit fl und hl stammen aus der ersten Testversion mit blauer Fläche; sie gelten weiter.) */
const NOTE_C = '#7fb0ff', NOTE_PAD = 6;
let ncCur = null;   // offene Karte: { id (Markierung) oder ids (neu zu markieren), box, nt (Arbeitskopie), orig, url }
const noteOf = id => S.items.find(it => it.id === id && it.nt) || null;
const noteBox = it => geoBox([it]);   // der Kasten selbst (bb ist um die Strichbreite größer)
function noteMark(ids, nt) {
  const items = S.items.filter(it => ids.has(it.id) && !it.tp && !it.nt);
  if (!items.length) return null;
  const b = geoBox(items), p = NOTE_PAD, x0 = b[0] - p, y0 = b[1] - p, x1 = b[2] + p, y1 = b[3] + p;
  return makeStroke([x0, y0, .5, x1, y0, .5, x1, y1, .5, x0, y1, .5, x0, y0, .5], NOTE_C, 1, false, { k: 'note', nt });
}
// „i“ in der oberen rechten Ecke, 16 px groß auf dem Bildschirm, nie größer als der Kasten (Weltkoordinaten)
function noteBadge(it, devScale) {
  const b = noteBox(it), r = Math.min(8 * DPR / devScale, (b[2] - b[0]) / 2.4, (b[3] - b[1]) / 2.4);
  return { x: b[2] - r * 0.95, y: b[1] + r * 0.95, r };
}
function drawNoteBadge(ctx, it, devScale) {
  const { x, y, r } = noteBadge(it, devScale); if (!(r > 0)) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#2f6fd6'; ctx.fill();
  ctx.lineWidth = r * 0.2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - r * 0.42, r * 0.19, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - r * 0.15, y - r * 0.12, r * 0.3, r * 0.6);
  ctx.restore();
}
function noteAt(x, y) {
  for (let k = S.items.length - 1; k >= 0; k--) { const it = S.items[k]; if (!it.nt) continue; const b = noteBox(it); if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return it; }
  return null;
}
function noteBadgeAt(x, y) {
  for (let k = S.items.length - 1; k >= 0; k--) {
    const it = S.items[k]; if (!it.nt) continue;
    const g = noteBadge(it, S.view.z * DPR); if (Math.hypot(x - g.x, y - g.y) < g.r + 6 / S.view.z) return it;
  }
  return null;
}
// ohne die Markierung id; was an ihr hing, ist wieder frei
const dropNote = id => S.items.filter(x => x.id !== id).map(x => x.on === id ? (({ on, ...r }) => r)(x) : x);
// Bilder einer Erklärung (ids, in ihrer Reihenfolge): früher genau eines (nt.img), jetzt eine Liste (nt.imgs)
const noteImgs = nt => nt.imgs ? nt.imgs.slice() : nt.img ? [nt.img] : [];
// id: vorhandene Markierung; ids: neu zu markieren; box: wo sie liegt (Welt), die Karte kommt darunter oder darüber
function openNoteCard(id, ids, box) {
  closeMenus(); clearSel();
  const it = id ? noteOf(id) : null; if (id && !it) return;
  const nt = it ? it.nt : { text: '', imgs: [], ink: [] }, imgs = noteImgs(nt);
  // orig so, wie syncNoteCard schreibt: eine ältere Erklärung (nt.img) öffnen und schließen ist kein Schritt
  ncCur = { id: it ? it.id : null, ids: it ? null : ids, box, nt: { text: nt.text || '', imgs, ink: (nt.ink || []).map(s => ({ ...s })) },
    orig: it ? JSON.stringify({ text: nt.text || '', imgs, ink: nt.ink || [] }) : null, pics: new Map() };
  const m = $('#noteCard'); m.classList.remove('big', 'glance'); ncDraw = null; liveInkClear(); ncResetView();
  ncPal.getAnimations().forEach(a => a.cancel()); delete ncPal.dataset.closing; ncPal.classList.add('hidden'); ncToolBtn();
  $('#ncText').value = ncCur.nt.text;
  m.classList.remove('hidden');
  growBtn(); fitNoteText(); drawNoteInk(); placeNoteCard(); showNoteImgs();
  popIn(m, null);
}
// Pfeil oben rechts in der Schreibfläche: großes Fenster auf bzw. zurück zur kleinen Karte
function growBtn() {
  const big = $('#noteCard').classList.contains('glance'), b = $('#ncGrow'), txt = big ? 'Schreibfläche verkleinern' : 'Schreibfläche vergrößern';
  b.title = txt; b.setAttribute('aria-label', txt); b.querySelector('use').setAttribute('href', big ? '#ic-shrink' : '#ic-grow');
}
// Groß: eigenes Fenster in der Mitte (85 % des Bildschirms), dahinter abgedunkelt; es wächst aus der Karte heraus und
// schrumpft beim Zurück wieder in sie hinein (wie „Glance“ im Zen-Browser). Daneben tippen schließt wie bei der Karte.
const ncDim = $('#ncDim');
function setGlance(on) {
  const m = $('#noteCard'); if (!ncCur || m.classList.contains('glance') === on) return;
  const r0 = m.getBoundingClientRect();
  m.getAnimations().forEach(a => a.cancel());
  m.classList.toggle('glance', on); ncResetView();
  if (!on) placeNoteCard();   // zurück an ihren Platz bei der Markierung
  growBtn(); fitNoteText(); drawNoteInk();
  if (on) showDim(); else hideDim();
  if (reduceMotion()) return;
  const r1 = m.getBoundingClientRect();
  m.style.transformOrigin = '0 0';
  const a = m.animate([{ transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / r1.width}, ${r0.height / r1.height})` }, { transform: 'none' }], sp(spring(0.12, 420)));
  a.onfinish = () => { m.style.transformOrigin = ''; };
}
function showDim() {
  ncDim.getAnimations().forEach(a => a.cancel()); ncDim.classList.remove('hidden');
  if (!reduceMotion()) ncDim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}
function hideDim() {
  if (ncDim.classList.contains('hidden')) return;
  ncDim.getAnimations().forEach(a => a.cancel());
  if (reduceMotion()) { ncDim.classList.add('hidden'); return; }
  const a = ncDim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
  a.onfinish = () => { ncDim.classList.add('hidden'); a.cancel(); };   // nicht am versteckten Element stehen lassen (siehe popOut)
}
// Textfeld wächst mit dem Text (bis 180 px, dann scrollt es)
function fitNoteText() { const ta = $('#ncText'); ta.style.height = ''; ta.style.height = clamp(ta.scrollHeight + 2, 58, 180) + 'px'; }
function placeNoteCard() {
  const m = $('#noteCard'), c = ncCur; if (!c || !c.box) return;
  const top = barBottom() + 8; m.style.maxHeight = Math.max(160, innerHeight - top - 8) + 'px';   // passt immer ganz hinein
  const [x0, y0] = toScreen(c.box[0], c.box[1]), [, y1] = toScreen(c.box[2], c.box[3]), w = m.offsetWidth, h = m.offsetHeight;
  let y = y1 + 12;
  if (y + h > innerHeight - 8) y = y0 - 12 - h;          // passt nicht darunter: darüber
  if (y < top) y = clamp(innerHeight - h - 8, top, innerHeight);
  m.style.left = clamp(x0, 8, Math.max(8, innerWidth - w - 8)) + 'px'; m.style.top = Math.max(top, y) + 'px';
}
// Inhalt der Karte übernehmen (ein Schritt fürs Rückgängigmachen), die Karte bleibt offen. final (beim Schließen):
// ganz leer heißt keine Erklärung
function syncNoteCard(final) {
  const c = ncCur; if (!c || !S.note) return;
  const nt = { text: $('#ncText').value.trim(), imgs: c.nt.imgs.slice(), ink: c.nt.ink.slice() };
  const empty = !nt.text && !nt.imgs.length && !nt.ink.length, js = JSON.stringify(nt);
  if (c.id) {
    if (!noteOf(c.id)) return;
    if (empty) { if (final) commit(dropNote(c.id)); return; }
    if (js !== c.orig) { commit(S.items.map(x => x.id === c.id ? { ...x, nt } : x)); c.orig = js; }
  } else if (!empty && c.ids) {
    const mark = noteMark(c.ids, nt); if (!mark) return;
    const linked = S.items.map(x => c.ids.has(x.id) && !x.on && !x.tp && !x.nt && !x.hl ? { ...x, on: mark.id } : x);
    commit(appendItems(linked, [mark]));
    c.id = mark.id; c.ids = null; c.orig = js;
  }
}
function saveNoteCard() {
  const c = ncCur; if (!c) return;
  syncNoteCard(true); ncCur = null;
  dropPics(c);
}
const dropPics = c => { for (const p of c.pics.values()) if (p.url) URL.revokeObjectURL(p.url); c.pics.clear(); };
// Bilder in die Notiz, hinten an die Reihe (Datei, Zwischenablage, Strg + V oder hineingezogen, auch mehrere auf einmal)
async function addNoteImages(files) {
  const c = ncCur, note = S.note, list = [...files].filter(f => f.type.startsWith('image/'));
  if (!c || !note || !list.length) return;
  const many = list.length > 1; let bad = 0, gone = false;
  if (many) toast('Bilder werden eingefügt …', 0);
  for (const f of list) {
    try {
      const { blob, low, w, h } = await prepareImage(f), id = uid();
      await dbImagePut({ id, n: note.id, blob, low, w, h });
      if (ncCur !== c) { gone = true; break; }   // Karte inzwischen zu: das Bild räumt das Schließen der Seite weg
      c.nt.imgs.push(id); c.pics.set(id, { rec: { blob, low, w, h } }); showNoteImgs(id);
    } catch (e) { bad++; }
  }
  if (bad) toast(bad === list.length ? (many ? 'Die Bilder können' : 'Das Bild kann') + ' nicht geöffnet werden'
    : (bad === 1 ? '1 Bild von ' : bad + ' Bilder von ') + list.length + (bad === 1 ? ' kann' : ' können') + ' nicht geöffnet werden', 3500);
  else if (many && !gone) toast(list.length + ' Bilder eingefügt', 1600);
  else if (many) $('#toast').style.opacity = 0;   // Karte schon zu: Hinweis weg
}
// Bilder der Karte als Reihe (bei mehreren zum Wischen), jedes mit ✕. Klein die kleine Fassung (low), groß die volle.
// Die Größe steht schon vor dem Laden fest (Seitenverhältnis --r und Breite --w aus dem Datensatz): nichts springt,
// wenn ein Bild oder seine volle Fassung kommt. focus: dieses Bild in die Mitte der Reihe holen
function showNoteImgs(focus) {
  const c = ncCur, box = $('#ncImgBox'); if (!c) return;
  const ids = c.nt.imgs, big = $('#noteCard').classList.contains('big');
  for (const [id, p] of c.pics) if (!ids.includes(id)) { if (p.url) URL.revokeObjectURL(p.url); c.pics.delete(id); }
  let wait = false, shown = 0;
  const els = ids.map((id, i) => {
    let p = c.pics.get(id); if (!p) c.pics.set(id, p = { rec: null });
    if (!p.el) {
      p.el = document.createElement('div'); p.el.className = 'ncim'; p.el.dataset.id = id; p.el.setAttribute('role', 'listitem');
      p.el.innerHTML = '<img alt="" draggable="false" title="Antippen: groß / klein"><button class="ncimdel" title="Bild entfernen"><svg class="i"><use href="#ic-x"/></svg></button>';
    }
    const n = ids.length > 1 ? ' ' + (i + 1) : '';
    p.el.firstChild.alt = 'Bild' + n + ' der Notiz'; p.el.lastChild.setAttribute('aria-label', 'Bild' + n + ' entfernen');
    if (!p.rec) wait = true; else if (!p.rec.missing) { picSrc(c, p, big); shown++; }
    p.el.classList.toggle('wait', !p.rec || !!p.rec.missing);   // noch nicht geladen oder fehlt: nicht zeigen
    return p.el;
  });
  els.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
  while (box.children.length > els.length) box.lastChild.remove();
  box.classList.toggle('hidden', !shown); box.classList.toggle('many', shown > 1);
  placeNoteCard();
  const f = focus && c.pics.get(focus); if (f && f.rec) box.scrollLeft = f.el.offsetLeft + f.el.offsetWidth / 2 - box.clientWidth / 2;
  if (wait && !c.picsLoading) loadPics(c);
}
// Datensätze der Bilder, die noch fehlen, alle zugleich (dann einmal neu, nicht Bild für Bild)
async function loadPics(c) {
  c.picsLoading = true;
  const todo = [...c.pics].filter(([, p]) => !p.rec), recs = await Promise.all(todo.map(([id]) => dbImageGet(id).catch(() => null)));
  c.picsLoading = false;
  if (ncCur !== c) return;
  todo.forEach(([, p], k) => { p.rec = recs[k] && recs[k].blob ? recs[k] : { missing: true }; });
  showNoteImgs();
}
// Quelle eines Bildes: klein die kleine Fassung, groß (oder ohne kleine Fassung) die volle
function picSrc(c, p, big) {
  const r = p.rec, blob = big || !r.low ? r.blob : r.low; if (p.blob === blob) return;
  const im = p.el.firstChild;
  if (r.w && r.h) { p.el.style.setProperty('--r', r.w / r.h); p.el.style.setProperty('--w', r.w + 'px'); }
  else im.onload = () => { if (im.naturalWidth && ncCur === c) { p.el.style.setProperty('--r', im.naturalWidth / im.naturalHeight); placeNoteCard(); } };   // alte Sicherung ohne Maße
  if (p.url) URL.revokeObjectURL(p.url);   // das gezeigte Bild bleibt, bis das neue da ist
  p.blob = blob; p.url = URL.createObjectURL(blob); im.src = p.url;
}
// Schreibfläche der Karte, wie auf der Seite: Papier und Muster der Seite; Stift, Textmarker und Tape mit Farbe, Dicke,
// Deckkraft und Muster der Leiste (gemeinsam mit der Seite) und demselben Filter (Glättung, Druck); Textmarker und Tape
// auf Wunsch gerade (oder kurz still halten). Stift, Maus oder Finger (nicht der Handballen, solange der Stift da ist).
// Der laufende Strich kommt auf eine eigene schnelle Ebene (wie cvLive), fertige Striche liegen unten: Textmarker unter
// der Schrift, sonst wie gelegt; was auf einem Tape steht, verschwindet mit ihm, wenn es aufgedeckt wird (Tape mit dem
// Tape oder dem Finger antippen). Beim Schweben zeigt ein Punkt, wo der Stift schreibt; Radierer-Ende oder Radierer
// radieren ganze Striche. Werkzeug, Farbe und Dicke: Knopf oben links, ein Tipp klappt die Auswahl auf.
const ncInk = $('#ncInk'), ncLive = $('#ncLive'), ncDot = $('#ncDot'), ncPal = $('#ncPal'), inkPaths = new WeakMap(); let ncDraw = null;
const ncBase = ncInk.getContext('2d', { alpha: false });
const ncLiveCtx = ncLive.getContext('2d', { desynchronized: LOW_LATENCY });
let ncTool = 'pen';   // Werkzeug der Schreibfläche: pen, hl, tape, eraser
const NC_TOOLS = [['pen', 'ic-pen', 'Stift'], ['hl', 'ic-hl', 'Textmarker'], ['tape', 'ic-tape', 'Tape'], ['eraser', 'ic-eraser', 'Radierer']];
// Maßstab der Schreibfläche: 1, außer das Geschriebene ist größer als die Fläche (im großen Fenster geschrieben) –
// dann verkleinert, damit alles zu sehen ist. Neu Geschriebenes kommt im selben Maßstab dazu.
let ncInkS = 1;
/* Zoom der Schreibfläche: z über dem Grundmaßstab (ncInkS: alles zu sehen), x/y Verschiebung in CSS-Pixeln. Zwei
   Finger zoomen und schieben, Strg + Mausrad zoomt, das Mausrad schiebt; der Knopf unten rechts zeigt den Zoom und setzt
   ihn zurück. Man bleibt auf der Fläche (100 % bis 800 %); jede Notiz öffnet mit 100 % */
const ncView = { z: 1, x: 0, y: 0 };
const ncS = () => ncInkS * ncView.z;
function ncClampView() {
  const W = ncInk.clientWidth || 296, H = ncInk.clientHeight || 140;
  ncView.z = clamp(ncView.z, 1, 8); ncView.x = clamp(ncView.x, W - W * ncView.z, 0); ncView.y = clamp(ncView.y, H - H * ncView.z, 0);
  const b = $('#ncZoom'), t = Math.round(ncView.z * 100) + ' %'; b.classList.toggle('hidden', ncView.z < 1.01); if (b.textContent !== t) b.textContent = t;
}
function ncResetView() { ncView.z = 1; ncView.x = ncView.y = 0; ncClampView(); }
function ncZoomAt(cx, cy, z) {   // (cx, cy): CSS-Pixel in der Fläche, der Punkt dort bleibt, wo er ist
  const s0 = ncS(), ux = (cx - ncView.x) / s0, uy = (cy - ncView.y) / s0;
  ncView.z = clamp(z, 1, 8); const s1 = ncS(); ncView.x = cx - ux * s1; ncView.y = cy - uy * s1; ncClampView(); requestNcDraw();
}
let ncDrawQ = false;
function requestNcDraw() { if (!ncDrawQ) { ncDrawQ = true; requestAnimationFrame(() => { ncDrawQ = false; drawNoteInk(); }); } }
function inkScale(W, H) {
  let mx = 0, my = 0;
  for (const s of ncCur ? ncCur.nt.ink : []) for (let i = 0; i < s.pts.length; i += 3) { mx = Math.max(mx, s.pts[i] + s.w + 8); my = Math.max(my, s.pts[i + 1] + s.w + 8); }   // mit etwas Rand
  return Math.min(1, W / Math.max(1, mx), H / Math.max(1, my));
}
// zu sehen: nicht auf einem aufgedeckten Tape geschrieben
function inkShown(list) { const open = new Set(list.filter(x => x.tp && !covered(x)).map(x => x.id)); return st => !st.on || !open.has(st.on); }
function paintInk(g, st, s) {
  if (st.tp) { drawTape(g, st, DPR * s); return; }
  let P = inkPaths.get(st); if (!P) inkPaths.set(st, P = buildPath(Float32Array.from(st.pts), st.w, !!st.hl));
  fillStroke(g, st, P);
}
function drawNoteInk() {
  const W = ncInk.clientWidth || 296, H = ncInk.clientHeight || 140, w = Math.round(W * DPR), h = Math.round(H * DPR);
  for (const c of [ncInk, ncLive]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  if (!ncDraw) ncInkS = inkScale(W, H);   // während eines Strichs (oder beim Radieren) bleibt der Maßstab
  ncClampView();
  const g = ncBase, s = ncS(), ox = ncView.x, oy = ncView.y, list = ncCur ? ncCur.nt.ink : [];
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.fillStyle = paperColor(); g.fillRect(0, 0, w, h);
  if (S.note) { let sp = (S.note.bg === 'lines' ? 34 : 28) * s; while (sp < 14) sp *= 2; fillPattern(g, s, (sp / 2 + ox) * DPR, (sp / 2 + oy) * DPR, w, h); }   // Muster wie auf der Seite, nicht am Rand angeschnitten, zieht mit
  g.setTransform(DPR * s, 0, 0, DPR * s, DPR * ox, DPR * oy);
  const vis = inkShown(list);
  { const hlg = list.filter(st => st.pts.length && st.hl && !st.on && !st.tp); if (hlg.length) paintHl(g, hlg); }   // Textmarker unter der Schrift, als eine Schicht
  for (const st of list) if (st.pts.length && !st.tp && !st.on && !st.hl) paintInk(g, st, s);   // Schrift
  for (const t of list) if (t.tp && t.pts.length) { paintInk(g, t, s); for (const st of list) if (st.on === t.id && st.pts.length && vis(st)) paintInk(g, st, s); }   // Tapes immer oben, mit dem, was darauf steht
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  $('#noteCard').classList.toggle('inked', list.length > 0 || !!(ncDraw && !ncDraw.erase));
}
function liveInkClear() { ncLiveCtx.setTransform(1, 0, 0, 1, 0, 0); ncLiveCtx.clearRect(0, 0, ncLive.width, ncLive.height); ncLive.style.opacity = ''; ncLive.style.mixBlendMode = ''; }
// neue Stücke des laufenden Strichs auf die schnelle Ebene (wie livePiece auf der Seite)
function inkPiece(d) {
  const n = d.pts.length / 3; if (d.drawn >= n) return;
  const P = new Path2D(); for (let i = d.drawn; i < n; i++) addPiece(P, d.pts, i, d.w, d.hl);
  d.drawn = n; ncLiveCtx.fill(P);
}
// gerade vom Anfang bis zum Stift (fast waagerecht oder senkrecht: genau), in Koordinaten der Schreibfläche
function inkStraight(d) {
  const s = d.s, [ox, oy] = d.o, r = d.raw || d.start, x0 = (d.start[0] - ox) / s, y0 = (d.start[1] - oy) / s, x1 = (r[0] - ox) / s, y1 = (r[1] - oy) / s;
  const ang = Math.abs(Math.atan2(y1 - y0, x1 - x0)) * 180 / Math.PI; let ex = x1, ey = y1;
  if (ang < 4 || ang > 176) ey = y0; else if (Math.abs(ang - 90) < 4) ex = x0;
  return [x0, y0, d.g.p, ex, ey, d.g.p];
}
// Tape und gerade Striche auf der schnellen Ebene: Tape erst nach mehr als einem Antippen, dann nur das Ende neu (wie
// auf der Seite); Geraden jedes Mal ganz
function inkRedraw(d) {
  const g = ncLiveCtx, s = d.s, k = DPR * s, ox = DPR * d.o[0], oy = DPR * d.o[1];
  if (d.tape && tapTiny(d.raw || d.start, d.start, d.pts, s)) return;
  if (d.tape && !d.straight) { tapeLive(g, d, k, ox, oy, d.pts); return; }
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ncLive.width, ncLive.height); g.setTransform(k, 0, 0, k, ox, oy);
  const pts = d.straight ? inkStraight(d) : d.pts;
  if (d.tape) { if (pts.length < 6) return; const o = d.live || (d.live = { c: d.c, w: d.w, tp: d.tp, hid: true, live: true }); o.pts = pts; drawTape(g, o, k); }
  else if (d.hl) hlLive(g, { pts, w: d.w, c: d.c, cut: d.cut }, k, ox, oy);
  else { g.fillStyle = colorOf(d.c); g.fill(buildPath(Float32Array.from(pts), d.w, false)); }
}
// was ein neuer Textmarker in der Notiz ausspart: Textmarker gleicher Deckkraft und alles darüber (Schrift, Tapes)
const inkBoxes = new WeakMap(), inkStBox = st => { let b = inkBoxes.get(st); if (!b) inkBoxes.set(st, b = bboxOf(st.pts, st.w)); return b; };
function hlCutInk(al, s) {
  const list = ncCur ? ncCur.nt.ink : [], vis = inkShown(list), out = [];
  for (const st of list) {
    if (!st.pts.length || (st.on && !vis(st))) continue;
    if (st.hl && !st.tp && !st.on && alKey(strokeAlpha(st)) !== alKey(al)) continue;
    out.push(st);
  }
  return [out, inkStBox, (g, st) => { if (st.hl && !st.tp) paintPath(g, strokePath(st), st.w, true); else if (st.tp) drawTape(g, st, DPR * s, true); else paintInk(g, st, s); }];
}
// Textmarker und Tape: knapp eine halbe Sekunde still halten macht den Strich gerade (wie auf der Seite)
function armInkHold(d) { clearTimeout(d.holdT); d.holdT = setTimeout(() => { if (ncDraw === d && !d.straight && d.pts.length > 9) { d.straight = d.redraw = true; inkRedraw(d); } }, 450); }
// Abstand eines Punkts (Koordinaten der Schreibfläche) zu einem Strich kleiner als lim?
function inkNear(st, x, y, lim) {
  const q = st.pts; if (q.length === 3) return Math.hypot(x - q[0], y - q[1]) < lim;
  for (let i = 3; i < q.length; i += 3) if (distSeg(x, y, q[i - 3], q[i - 2], q[i], q[i + 1]) < lim) return true;
  return false;
}
// oberstes Tape unter (x, y)
function inkTapeAt(x, y) {
  const list = ncCur ? ncCur.nt.ink : [];
  for (let k = list.length - 1; k >= 0; k--) if (list[k].tp && inkNear(list[k], x, y, list[k].w / 2 + 4 / ncS())) return list[k];
  return null;
}
// Radierer: ganze Striche unter dem Stift weg (wie auf der Seite, 12 px); mit einem Tape geht auch, was darauf steht
function inkErase(d, ev) {
  const s = ncS(), x = (ev.clientX - d.r.left - ncView.x) / s, y = (ev.clientY - d.r.top - ncView.y) / s, R = ERASE_R / s, ink = ncCur ? ncCur.nt.ink : [], vis = inkShown(ink);
  const gone = new Set(ink.filter(st => boxNear(inkStBox(st), x, y, R) && vis(st) && inkNear(st, x, y, R + st.w / 2)));
  if (!gone.size) return;
  for (const g of [...gone]) if (g.tp) for (const st of ink) if (st.on === g.id) gone.add(st);
  ncCur.nt.ink = ink.filter(st => !gone.has(st)); requestNcDraw();   // höchstens einmal pro Bild
}
// beim Schweben: Punkt in Farbe und Dicke des Werkzeugs, wo es schreiben wird (wie auf der Seite)
function inkHover(e) {
  const k = ncTool, on = e.pointerType === 'pen' && !(e.buttons & 34) && k !== 'eraser';
  if (on) {
    const r = ncLive.getBoundingClientRect(), d = Math.max(3, S.size[k] * ncS()), st = ncDot.style, px = d + 'px', c = colorOf(S.color[k]);
    if (st.width !== px) st.width = st.height = px;
    if (ncDot.dataset.c !== c) { ncDot.dataset.c = c; st.background = c; }
    st.transform = `translate(${e.clientX - r.left - d / 2}px,${e.clientY - r.top - d / 2}px)`;
  }
  const disp = on ? 'block' : '', cur = on ? 'none' : 'crosshair';
  if (ncDot.style.display !== disp) ncDot.style.display = disp;
  if (ncLive.style.cursor !== cur) ncLive.style.cursor = cur;
}
ncLive.addEventListener('pointerdown', e => {
  if (!ncCur || (e.pointerType === 'touch' && performance.now() < penActiveUntil) || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); try { ncLive.setPointerCapture(e.pointerId); } catch (err) {}
  ncDot.style.display = ''; if (!ncPal.classList.contains('hidden')) popOut(ncPal);
  const r = ncLive.getBoundingClientRect(), k = penErase(e) ? 'eraser' : ncTool;
  if (k === 'eraser') { ncDraw = { id: e.pointerId, r, erase: true }; inkErase(ncDraw, e); return; }
  const s = ncS(), ox = ncView.x, oy = ncView.y, x = e.clientX - r.left, y = e.clientY - r.top, hl = k === 'hl', tape = k === 'tape';
  const d = ncDraw = { id: e.pointerId, r, s, o: [ox, oy], hl, tape, tp: tape ? S.tapePat : undefined, c: S.color[k], w: S.size[k], al: tape ? undefined : S.alpha[k], drawn: 0,
    touch: e.pointerType === 'touch', start: [x, y], still: [x, y], straight: !!S.straight[k], ...smoothStart(x, y, pressureOf(e), e.timeStamp, (u, v) => [(u - ox) / s, (v - oy) / s]) };
  if (!tape) { const tp = inkTapeAt((x - ox) / s, (y - oy) / s); if (tp && covered(tp)) d.on = tp.id; }   // auf ein abgedecktes Tape geschrieben: gehört dazu
  if (hl) d.cut = hlCutInk(strokeAlpha(d), s);
  liveInkClear();
  if (!tape) { const al = strokeAlpha(d); if (al < 1) ncLive.style.opacity = String(al); if (hl && !isDark()) ncLive.style.mixBlendMode = 'multiply'; }   // wie auf der Seite
  if (tape || d.straight) { d.redraw = true; inkRedraw(d); }
  else if (hl) { d.hlInc = true; hlLive(ncLiveCtx, d, DPR * s, DPR * ox, DPR * oy); }   // Textmarker: nur, was sich ändert (wie auf der Seite)
  else { ncLiveCtx.setTransform(DPR * s, 0, 0, DPR * s, DPR * ox, DPR * oy); ncLiveCtx.fillStyle = colorOf(d.c); inkPiece(d); }
  if (hl || tape) armInkHold(d);
  $('#noteCard').classList.add('inked');
});
ncLive.addEventListener('pointermove', e => {
  const d = ncDraw;
  if (!d) { inkHover(e); return; }
  if (e.pointerId !== d.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of evs.length ? evs : [e]) {
    if (d.erase) { inkErase(d, ev); continue; }
    const x = ev.clientX - d.r.left, y = ev.clientY - d.r.top, pr = pressureOf(ev);
    d.raw = [x, y, pr, ev.timeStamp]; filterStep(d, x, y, pr, ev.timeStamp); pushFiltered(d);
    if (d.holdT !== undefined && Math.hypot(x - d.still[0], y - d.still[1]) > 4) { d.still = [x, y]; armInkHold(d); }
  }
  if (d.erase) return;
  if (d.redraw || d.hlInc) { if (!d.rq) { d.rq = true; requestAnimationFrame(() => { d.rq = false; if (ncDraw === d) { if (d.redraw) inkRedraw(d); else hlLive(ncLiveCtx, d, DPR * d.s, DPR * d.o[0], DPR * d.o[1]); } }); } }   // höchstens einmal pro Bild
  else inkPiece(d);
});
ncLive.addEventListener('pointerleave', () => { if (ncDot.style.display) ncDot.style.display = ''; });
// zwei Finger: zoomen und schieben (ein eben mit dem Finger begonnener Strich war der Anfang davon und fällt weg)
const ncTouches = new Map(); let ncPinch = null;
function ncPinchState() {
  const [a, b] = [...ncTouches.values()]; return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, d: Math.max(8, Math.hypot(a[0] - b[0], a[1] - b[1])) };
}
ncLive.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || !ncCur || performance.now() < penActiveUntil) return;
  const r = ncLive.getBoundingClientRect(); ncTouches.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
  if (ncTouches.size !== 2) return;
  if (ncDraw && ncDraw.touch) { clearTimeout(ncDraw.holdT); ncDraw = null; liveInkClear(); drawNoteInk(); }
  const p = ncPinchState(), s = ncS(); ncPinch = { d0: p.d, z0: ncView.z, ux: (p.cx - ncView.x) / s, uy: (p.cy - ncView.y) / s };
  try { ncLive.setPointerCapture(e.pointerId); } catch (err) {}
  e.stopImmediatePropagation();
}, true);
ncLive.addEventListener('pointermove', e => {
  if (!ncTouches.has(e.pointerId)) return;
  const r = ncLive.getBoundingClientRect(); ncTouches.set(e.pointerId, [e.clientX - r.left, e.clientY - r.top]);
  if (!ncPinch || ncTouches.size < 2) return;
  e.stopImmediatePropagation();
  const p = ncPinchState(); ncView.z = clamp(ncPinch.z0 * p.d / ncPinch.d0, 1, 8);
  const s = ncS(); ncView.x = p.cx - ncPinch.ux * s; ncView.y = p.cy - ncPinch.uy * s; ncClampView(); requestNcDraw();
}, true);
// der Finger, der danach liegen bleibt, schreibt nicht (er hat keinen Strich begonnen)
const ncTouchUp = e => { if (ncTouches.delete(e.pointerId) && ncTouches.size < 2) ncPinch = null; };
ncLive.addEventListener('pointerup', ncTouchUp, true); ncLive.addEventListener('pointercancel', ncTouchUp, true);
ncLive.addEventListener('wheel', e => {
  if (!ncCur) return;
  const r = ncLive.getBoundingClientRect();
  if (e.ctrlKey) { e.preventDefault(); ncZoomAt(e.clientX - r.left, e.clientY - r.top, ncView.z * Math.exp(-e.deltaY * 0.01)); }
  else if (ncView.z > 1.01) { e.preventDefault(); ncView.x -= e.deltaX; ncView.y -= e.deltaY; ncClampView(); requestNcDraw(); }
}, { passive: false });
$('#ncZoom').onclick = () => { ncResetView(); drawNoteInk(); };
const endInk = e => {
  const d = ncDraw; if (!d || e.pointerId !== d.id) return;
  ncDraw = null; clearTimeout(d.holdT);
  if (!d.erase && ncCur) {
    if (d.straight) d.pts = inkStraight(d); else if (d.raw) { catchUp(d); if (!d.redraw && !d.hlInc) inkPiece(d); }   // bis dorthin, wo der Stift abgehoben hat
    const r = d.raw || d.start, tap = !d.straight && Math.hypot(r[0] - d.start[0], r[1] - d.start[1]) < 6 && pathLen(d.pts) * d.s < 12;
    const tp = tap && (d.tape || d.touch) ? inkTapeAt((d.start[0] - d.o[0]) / d.s, (d.start[1] - d.o[1]) / d.s) : null;
    if (tp) ncCur.nt.ink = ncCur.nt.ink.map(x => x === tp ? { ...x, hid: !covered(x) } : x);   // Tape antippen: auf- bzw. abdecken
    else if (d.pts.length && !(tap && d.tape)) {
      const st = { c: d.c, w: d.w, pts: d.pts.map(v => Math.round(v * 10) / 10) };
      if (d.hl) st.hl = true;
      if (d.tape) Object.assign(st, { tp: d.tp, hid: true, id: uid() });
      else if (d.al !== undefined && d.al !== ALPHA_DEFAULT[d.hl ? 'hl' : 'pen']) st.al = d.al;
      if (d.on) st.on = d.on;
      ncCur.nt.ink.push(st);
    }
  }
  drawNoteInk(); liveInkClear();
};
ncLive.addEventListener('pointerup', endInk); ncLive.addEventListener('pointercancel', endInk);
// Knopf oben links: zeigt Werkzeug und Farbe; ein Tipp klappt Werkzeuge, Farben, Tape-Muster und Dicken auf. Farbe,
// Muster oder Dicke gewählt: die Auswahl geht wieder zu (Werkzeug gewählt: bleibt offen für die Farbe)
function ncToolBtn() {
  const b = $('#ncTools'), t = NC_TOOLS.find(x => x[0] === ncTool), dot = b.querySelector('i'), txt = t[2] + ': Werkzeug, Farbe und Dicke';
  b.querySelector('use').setAttribute('href', '#' + t[1]); b.title = txt; b.setAttribute('aria-label', txt);
  dot.style.display = ncTool === 'eraser' ? 'none' : ''; if (ncTool !== 'eraser') dot.style.background = colorOf(S.color[ncTool]);
}
// kleines Bild eines Tape-Musters (W × H Pixel): Figuren in ihrer Farbe, sonst in der Farbe des Tapes
// Tape-Stück als kleines Bild für die Menüs (W × H: das Stück selbst); ringsum etwas Luft, damit Kanten, Schatten und
// Umriss nicht abgeschnitten werden (auch schräg gestellt). sel: gewählt, mit einem Umriss in der Akzentfarbe, der der
// Form folgt (auch den gerissenen Enden), dafür ohne Schatten.
function tapeSwatch(p, W = 20, H = 12, sel = false, col = null) {   // col: Farbe eines vorhandenen Tapes
  const pad = Math.max(2, Math.round(H * 0.18)), cw = W + 2 * pad, ch = H + 2 * pad;
  const c = document.createElement('canvas'); c.width = Math.round(cw * DPR); c.height = Math.round(ch * DPR); c.style.width = cw + 'px'; c.style.height = ch + 'px';
  const g = c.getContext('2d'), s = { c: col || (TAPE_MOTIFS[p] ? TAPE_MOTIFS[p].c : S.color.tape), w: H - 2, tp: p, hid: true, pts: [pad + 1, pad + H / 2, .5, pad + W - 1, pad + H / 2, .5] };
  if (sel) {   // Umriss: die Form in alle Richtungen etwas versetzt, eingefärbt; das Tape kommt darüber
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const og = o.getContext('2d'), tg = tapeGeo(s); og.setTransform(DPR, 0, 0, DPR, 0, 0); og.lineCap = 'butt'; og.lineWidth = s.w; og.stroke(tg.line); og.fill(tg.teeth);
    const r = Math.max(1.5, H * 0.09) * DPR;
    for (let k = 0; k < 16; k++) g.drawImage(o, Math.cos(k * Math.PI / 8) * r, Math.sin(k * Math.PI / 8) * r);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6fed';
    g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over';
  }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTape(g, s, DPR, sel);
  return c;
}
function renderNcPal() {
  const box = ncPal; box.innerHTML = '';
  const add = (cls, title, on, fn, fill) => {
    const b = document.createElement('button'); b.className = cls + (on ? ' on' : ''); b.title = title; b.setAttribute('aria-label', title);
    if (fill) fill(b); b.onclick = fn; box.appendChild(b);
  };
  const sep = () => { const s = document.createElement('i'); s.className = 'sep'; box.appendChild(s); };
  const done = () => { ncToolBtn(); popOut(ncPal); };
  for (const [k, ic, name] of NC_TOOLS) add('nct', name, ncTool === k, () => { ncTool = k; ncToolBtn(); renderNcPal(); }, b => { b.innerHTML = `<svg class="i"><use href="#${ic}"/></svg>`; });
  const k = ncTool; if (k === 'eraser') return;
  sep();
  const pal = k === 'tape' ? TAPE_PALETTE : PALETTE;
  if (!pal.includes(S.color[k])) add('ncc', 'Eigene Farbe', true, done, b => { b.style.background = colorOf(S.color[k]); });
  for (const c of pal) add('ncc', c === 'ink' ? 'Schwarz / Weiß' : c, S.color[k] === c, () => { S.color[k] = c; store.set('color', S.color); renderColors(); done(); }, b => { b.style.background = colorOf(c); });
  if (k === 'tape') {
    sep();
    for (const [pk, name] of TAPE_PATTERNS) add('ncp', name, S.tapePat === pk, () => {
      S.tapePat = pk; store.set('tapePat', pk);
      if (TAPE_MOTIFS[pk]) { S.color.tape = TAPE_MOTIFS[pk].c; store.set('color', S.color); renderColors(); }   // Figuren: ihre Farbe gleich mit
      renderSizes(); done();
    }, b => b.appendChild(tapeSwatch(pk, 20, 12, S.tapePat === pk)));
  }
  sep();
  S.presets[k].forEach((v, i) => add('ncs', 'Dicke ' + fmtSize(v), S.sizeIdx[k] === i, () => { setSize(k, i); renderSizes(); done(); },
    b => { const d = document.createElement('span'); d.style.width = d.style.height = Math.min(18, dotPx(k, v)) + 'px'; b.appendChild(d); }));
}
$('#ncTools').onclick = () => {
  if (ncPal.classList.contains('hidden') || ncPal.dataset.closing) { renderNcPal(); ncPal.classList.remove('hidden'); popIn(ncPal, $('#ncTools')); }
  else popOut(ncPal);
};
ncToolBtn();
let ncPalm = false;
$('#noteCard').addEventListener('pointerdown', e => { ncPalm = e.pointerType === 'touch' && performance.now() < penActiveUntil; }, true);
$('#noteCard').addEventListener('click', e => { if (ncPalm && e.target.closest('button,img')) { e.preventDefault(); e.stopPropagation(); } }, true);
$('#ncText').addEventListener('input', fitNoteText);
$('#ncGrow').onclick = () => setGlance(!$('#noteCard').classList.contains('glance'));
$('#ncClear').onclick = () => { if (ncCur) { ncCur.nt.ink = []; drawNoteInk(); } };
// Einfügen in der Notiz: Bilder kommen zu ihren Bildern, Text ins Textfeld (dorthin, wo der Cursor steht)
$('#ncPaste').onclick = async () => {
  const r = await clipRead(); if (!r || !ncCur) return;
  if (r.files.length) addNoteImages(r.files);
  else if (r.text.trim()) insertNoteText(r.text);
  else toast('In der Zwischenablage ist weder Text noch ein Bild', 3500);
};
function insertNoteText(text) { const ta = $('#ncText'); ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); fitNoteText(); }
$('#ncFile').onclick = () => $('#fNoteImg').click();
$('#fNoteImg').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; addNoteImages(fs); };
// Bild antippen: groß ansehen (das angetippte in der Mitte, zum Wischen) und wieder klein; ✕: dieses Bild aus der Notiz
$('#ncImgBox').addEventListener('click', e => {
  const c = ncCur, el = e.target.closest('.ncim'), m = $('#noteCard'); if (!c || !el) return;
  if (e.target.closest('.ncimdel')) {
    c.nt.imgs = c.nt.imgs.filter(x => x !== el.dataset.id);
    if (!c.nt.imgs.length && m.classList.contains('big')) { m.classList.remove('big'); drawNoteInk(); }   // kein Bild mehr: wieder klein
    showNoteImgs(); return;
  }
  m.classList.toggle('big'); drawNoteInk(); showNoteImgs(el.dataset.id);
});
// Mausrad über der Reihe (klein): seitlich blättern; am Ende scrollt wieder die Karte
$('#ncImgBox').addEventListener('wheel', e => {
  const b = e.currentTarget, max = b.scrollWidth - b.clientWidth;
  if (e.ctrlKey || e.deltaX || max < 1 || $('#noteCard').classList.contains('big')) return;
  const x = clamp(b.scrollLeft + e.deltaY * (e.deltaMode === 1 ? 40 : 1), 0, max); if (x === b.scrollLeft) return;
  e.preventDefault(); b.scrollLeft = x;
}, { passive: false });
// Bilder auf die offene Karte gezogen: in die Notiz (nicht auf die Seite)
$('#noteCard').addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (ncCur) addNoteImages(e.dataTransfer.files); });
$('#ncDel').onclick = () => { const c = ncCur; if (!c) return; ncCur = null; dropPics(c); if (c.id) commit(dropNote(c.id)); closeMenus(); };
$('#sNote').onclick = () => {
  if (!S.sel) return;
  const sel = S.items.filter(it => S.sel.ids.has(it.id)), mark = sel.find(it => it.nt);
  if (mark) { openNoteCard(mark.id, null, noteBox(mark)); return; }
  const ids = new Set(sel.filter(it => !it.tp).map(it => it.id)); if (!ids.size) return;
  openNoteCard(null, ids, geoBox(sel.filter(it => !it.tp)));
};
/* ---------- Text: schreiben und bearbeiten ----------
   Mit dem Werkzeug „Text“ (eigener Knopf in der Leiste, Taste X) antippen: ein neues Textfeld, wo getippt wurde (Ziehen: so breit wie gezogen);
   einen Text antippen: bearbeiten, der Cursor steht, wo getippt wurde. Das Textfeld ist contenteditable und liegt genau
   über der Seite (gleiche Schrift, Größe, Zeilenhöhe); die Leiste darüber formatiert: Schrift, Größe und Ausrichtung
   für den ganzen Text, Fett, Kursiv, Unterstrichen, Durchgestrichen und Farbe für den markierten Text (wie in Word).
   Der Griff rechts ändert die Breite, das Dreieck unten rechts verschiebt das Feld. Daneben tippen, Esc oder ✓: fertig (ein Schritt fürs Rückgängigmachen);
   ein leerer Text verschwindet. Enter und Einfügen setzen nur Text (keine Blöcke, keine fremden Formate). */
const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80];
S.text = { ff: 'sans', fs: 20, al: 'l' };
{ const v = store.get('text'); if (v && TEXT_FONTS[v.ff]) S.text.ff = v.ff; if (v && v.fs > 4 && v.fs < 400) S.text.fs = v.fs; if (v && /^[lcr]$/.test(v.al)) S.text.al = v.al; }
const storeText = () => store.set('text', S.text);
let txEd = null, txClosedAt = -1;   // offener Text: { id (vorhanden) oder null, x, y, w, ff, fs, c, al, orig }
const txEdEl = $('#txEd'), txBar = $('#txBar'), txGrip = $('#txGrip'), txMove = $('#txMove');
const textKey = it => JSON.stringify([it.x, it.y, it.w, it.ff, it.fs, it.c, it.al || 'l', it.runs]);
function textAt(x, y) {
  for (let k = S.items.length - 1; k >= 0; k--) { const it = S.items[k]; if (it.t === 'x' && x >= it.x - 4 && x <= it.x + it.w + 4 && y >= it.y - 4 && y <= it.y + it.h + 4) return it; }
  return null;
}
// Antippen (oder Ziehen) mit dem Text-Werkzeug; a: { sx, sy, ex (Bildschirm), wx, wy (Welt), cx, cy (Fenster) }
function textTap(a) {
  if (a.t0 !== undefined && a.t0 === txClosedAt) return;   // dieser Tipp hat nur den offenen Text beendet
  const moved = Math.abs(a.ex - a.sx) > 8, hit = !moved && textAt(a.wx, a.wy);
  if (hit) { openTextEd(hit, a.cx, a.cy); return; }
  const z = S.view.z, x0 = moved ? Math.min(a.sx, a.ex) : a.sx, w = moved ? Math.max(60, Math.abs(a.ex - a.sx)) : clamp(VW - a.sx - 16, 160, 420);
  const [wx] = toWorld(x0, a.sy);
  openTextEd(null, null, null, { x: wx, y: a.wy - S.text.fs * 0.675, w: w / z });
}
function runsToDom(root, runs) {
  root.textContent = '';
  for (const r of runs || []) {
    let n = document.createTextNode(r.s);
    const wrap = tag => { const e = document.createElement(tag); e.appendChild(n); n = e; };
    if (r.c) { const f = document.createElement('font'); f.setAttribute('color', colorOf(r.c)); f.appendChild(n); n = f; }   // wie execCommand('foreColor')
    if (r.k) wrap('strike'); if (r.u) wrap('u'); if (r.i) wrap('i'); if (r.b) wrap('b');
    root.appendChild(n);
  }
}
const hexOf = c => { const m = String(c).match(/\d+(\.\d+)?/g); if (/^#/.test(c)) return c.toLowerCase(); return m ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('') : ''; };
// Läufe aus dem Textfeld: Format aus den berechneten Stilen (egal mit welchen Tags), Farbe der Schwarz/Weiß-Taste als 'ink'
function textRunsFrom(root, t) {
  const runs = [], inkHex = hexOf(colorOf('ink')), baseHex = hexOf(colorOf(t.c));
  const push = (s, el) => {
    if (!s) return;
    const cs = getComputedStyle(el), r = {};
    if (parseInt(cs.fontWeight, 10) >= 600) r.b = 1;
    if (cs.fontStyle !== 'normal') r.i = 1;
    for (let e = el; e; e = e.parentElement) { const d = getComputedStyle(e).textDecorationLine; if (d.includes('underline')) r.u = 1; if (d.includes('line-through')) r.k = 1; if (e === root) break; }
    const hx = hexOf(cs.color); if (hx && hx !== baseHex) r.c = hx === inkHex ? 'ink' : hx;
    const l = runs[runs.length - 1];
    if (l && l.b === r.b && l.i === r.i && l.u === r.u && l.k === r.k && l.c === r.c) l.s += s; else runs.push({ s, ...r });
  };
  const walk = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) push(n.data, el);
      else if (n.nodeName === 'BR') push('\n', el);
      else if (n.nodeType === 1) { if (/^(DIV|P)$/.test(n.nodeName) && runs.length && !runs[runs.length - 1].s.endsWith('\n')) push('\n', el); walk(n); }
    }
  };
  walk(root);
  while (runs.length) { const l = runs[runs.length - 1]; l.s = l.s.replace(/\n+$/, ''); if (l.s) break; runs.pop(); }   // keine leeren Zeilen am Ende
  return runs;
}
function openTextEd(it, cx, cy, at) {
  if (txEd) commitText();
  closeMenus(); clearSel();
  txEd = it ? { id: it.id, x: it.x, y: it.y, w: it.w, ff: it.ff, fs: it.fs, c: it.c, al: it.al || 'l', orig: textKey(it) }
    : { id: null, x: at.x, y: at.y, w: at.w, ff: S.text.ff, fs: S.text.fs, c: S.color.pen, al: S.text.al };
  runsToDom(txEdEl, it ? it.runs : []);
  for (const e of [txEdEl, txBar, txGrip, txMove]) e.classList.remove('hidden');
  renderTextBar(); styleTextEd();
  txEdEl.focus({ preventScroll: true });
  const sel = getSelection(); let r = it && cx != null && document.caretRangeFromPoint ? document.caretRangeFromPoint(cx, cy) : null;
  if (!r || !txEdEl.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(txEdEl); r.collapse(false); }   // sonst ans Ende
  sel.removeAllRanges(); sel.addRange(r);
  if (it) { invalidateBox(itemBox(it)); requestDraw(); }
  popIn(txBar, null);
}
// Textfeld genau über die Seite legen (Lage, Breite, Schrift in Bildschirm-Pixeln), Griff und Leiste daneben
function styleTextEd() {
  const t = txEd; if (!t) return;
  const z = S.view.z, [sx, sy] = toScreen(t.x, t.y), s = txEdEl.style;
  s.left = sx + 'px'; s.top = sy + 'px'; s.width = t.w * z + 'px'; s.fontSize = t.fs * z + 'px'; s.fontFamily = fontStack(t.ff);
  s.textAlign = { l: 'left', c: 'center', r: 'right' }[t.al]; s.color = colorOf(t.c);
  placeTextBar();
}
function placeTextBar() {
  if (!txEd) return;
  const r = txEdEl.getBoundingClientRect(), bw = txBar.offsetWidth, bh = txBar.offsetHeight, top = barBottom() + 6;
  txGrip.style.left = r.right + 4 + 'px'; txGrip.style.top = r.top + 'px'; txGrip.style.height = Math.max(16, r.height - 12) + 'px';
  txMove.style.left = r.right - 4 + 'px'; txMove.style.top = r.bottom - 8 + 'px';   // Dreieck unten rechts, unter dem Griff
  let y = r.top - bh - 14; if (y < top) y = r.bottom + 14;
  if (y + bh > innerHeight - 6) y = Math.max(top, innerHeight - 6 - bh);
  txBar.style.left = clamp(r.left, 8, Math.max(8, innerWidth - bw - 8)) + 'px'; txBar.style.top = y + 'px';
}
function hideTextEd() {
  for (const e of [txEdEl, txBar, txGrip, txMove]) e.classList.add('hidden');
  if (document.activeElement === txEdEl) txEdEl.blur();   // Bildschirmtastatur zu
  txEdEl.textContent = '';
}
function commitText() {
  const t = txEd; if (!t) return;
  const runs = textRunsFrom(txEdEl, t); txEd = null; hideTextEd();
  if (!S.note) return;
  const old = t.id ? S.items.find(i => i.id === t.id) : null;
  if (!runs.some(r => r.s.trim())) { if (old) commit(S.items.filter(i => i !== old)); return; }   // leer: kein Text
  const it = { ...(old || {}), t: 'x', id: t.id || uid(), x: t.x, y: t.y, w: t.w, ff: t.ff, fs: t.fs, c: t.c, runs };
  if (t.al !== 'l') it.al = t.al; else delete it.al;
  it.h = textLayout(it).h;
  if (old && textKey(it) === t.orig) { invalidateBox(itemBox(old)); requestDraw(); return; }   // unverändert: wieder zeigen
  if (old) commit(S.items.map(i => i === old ? it : i)); else commit(appendItems(S.items, [it]));
}
function deleteText() {
  const t = txEd; if (!t) return; txEd = null; hideTextEd();
  if (t.id && S.items.some(i => i.id === t.id)) commit(S.items.filter(i => i.id !== t.id));
}
function setTextSize(dir) {
  const t = txEd; if (!t) return;
  const next = dir > 0 ? TEXT_SIZES.find(v => v > t.fs + 0.01) : [...TEXT_SIZES].reverse().find(v => v < t.fs - 0.01);
  if (!next) return;
  t.fs = next; S.text.fs = next; storeText(); $('#txSize').textContent = fmtSize(next); styleTextEd();
}
function renderTextBar() {
  const box = $('#txColors'); box.innerHTML = '';
  for (const c of PALETTE) {
    const b = document.createElement('button'); b.className = 'txc'; b.title = c === 'ink' ? 'Schwarz / Weiß' : c; b.setAttribute('aria-label', b.title);
    b.style.background = colorOf(c); b.onclick = () => { document.execCommand('foreColor', false, colorOf(c)); syncTextBar(); };
    box.appendChild(b);
  }
  $('#txFont').value = txEd.ff; $('#txSize').textContent = fmtSize(Math.round(txEd.fs * 10) / 10);
  syncTextBar();
}
function syncTextBar() {
  if (!txEd) return;
  for (const b of $$('#txBar .txf')) b.classList.toggle('on', document.queryCommandState(b.dataset.cmd));
  for (const b of $$('#txBar .txa')) b.classList.toggle('on', b.dataset.al === txEd.al);
}
$('#txFont').innerHTML = Object.entries(TEXT_FONTS).map(([k, [name, st]]) => `<option value="${k}" style="font-family:${st.replace(/"/g, '&quot;')}">${name}</option>`).join('');
txBar.addEventListener('pointerdown', e => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });   // Fokus und Markierung bleiben im Text
for (const b of $$('#txBar .txf')) b.onclick = () => { document.execCommand(b.dataset.cmd); syncTextBar(); };
for (const b of $$('#txBar .txa')) b.onclick = () => { if (!txEd) return; txEd.al = S.text.al = b.dataset.al; storeText(); styleTextEd(); syncTextBar(); };
$('#txFont').onchange = e => { if (!txEd) return; txEd.ff = S.text.ff = e.target.value; storeText(); styleTextEd(); txEdEl.focus({ preventScroll: true }); };
$('#txMinus').onclick = () => setTextSize(-1);
$('#txPlus').onclick = () => setTextSize(1);
$('#txDel').onclick = deleteText;
$('#txOk').onclick = commitText;
document.addEventListener('selectionchange', () => { if (txEd) syncTextBar(); });
txEdEl.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commitText(); return; }
  if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }   // nur ein Zeilenumbruch, kein Absatz-Block
  else if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); }
});
txEdEl.addEventListener('paste', e => { e.preventDefault(); e.stopPropagation(); const s = e.clipboardData.getData('text/plain'); if (s) document.execCommand('insertText', false, s.replace(/\r\n?/g, '\n')); });
txEdEl.addEventListener('drop', e => e.preventDefault());
txEdEl.addEventListener('input', placeTextBar);
// Griff rechts: Breite ziehen
let txGripD = null;   // Ziehen am Griff: Startpunkt und -breite
txGrip.addEventListener('pointerdown', e => { if (!txEd) return; e.preventDefault(); try { txGrip.setPointerCapture(e.pointerId); } catch (err) {} txGripD = { x: e.clientX, w: txEd.w }; });
txGrip.addEventListener('pointermove', e => { if (!txEd || !txGripD) return; txEd.w = Math.max(40 / S.view.z, txGripD.w + (e.clientX - txGripD.x) / S.view.z); styleTextEd(); });
const txGripEnd = () => { txGripD = null; };
// Dreieck unten rechts: das ganze Textfeld verschieben (Cursor und Markierung bleiben im Text); mit Raster rastet es ein
let txMoveD = null;
txMove.addEventListener('pointerdown', e => { if (!txEd) return; e.preventDefault(); try { txMove.setPointerCapture(e.pointerId); } catch (err) {} txMoveD = { x: e.clientX, y: e.clientY, ox: txEd.x, oy: txEd.y }; });
txMove.addEventListener('pointermove', e => {
  if (!txEd || !txMoveD) return;
  let x = txMoveD.ox + (e.clientX - txMoveD.x) / S.view.z, y = txMoveD.oy + (e.clientY - txMoveD.y) / S.view.z;
  if (S.snap) { x = snapX(x); y = snapY(y); }
  txEd.x = x; txEd.y = y; styleTextEd();
});
const txMoveEnd = () => { txMoveD = null; };
txMove.addEventListener('pointerup', txMoveEnd); txMove.addEventListener('pointercancel', txMoveEnd);
txGrip.addEventListener('pointerup', txGripEnd); txGrip.addEventListener('pointercancel', txGripEnd);
// Cornell: Knopf oben rechts in der Notizen-Spalte des Blatts in der Mitte; verdeckt die Notizen (unscharf) und deckt sie
// wieder auf. Er bleibt beim Scrollen unter der Leiste stehen, solange die Spalte zu sehen ist
function setCornellHide(on) {
  if (!!S.cornellHide === on || !isCornell()) return;
  S.cornellHide = on;
  for (let k = 0; k < sheetCount(); k++) invalidateBox(cornellNotes(k));
  requestDraw(); placeCornellBtn();
}
function placeCornellBtn() {
  const b = $('#cornBtn'), on = !!S.note && isCornell();
  b.classList.toggle('hidden', !on); if (!on) return;
  const hide = !!S.cornellHide, txt = hide ? 'Aufdecken' : 'Verdecken';
  if (b.dataset.st !== txt) { b.dataset.st = txt; b.querySelector('span').textContent = txt; b.title = hide ? 'Notizen wieder zeigen' : 'Notizen unscharf machen: mit den Stichworten links abfragen'; b.classList.toggle('on', hide); }
  const k = currentSheet(), f = cornellNotes(k), [x0, y0] = toScreen(f[0], f[1]), [x1, y1] = toScreen(f[2], f[3]);
  if (!b.wh || b.wh.t !== txt) b.wh = { t: txt, w: b.offsetWidth, h: b.offsetHeight };   // messen nur, wenn sich der Text ändert
  const { w, h } = b.wh, x = Math.min(x1, VW) - w - 12, y = clamp(y0 + 10, barBottom() + 10, y1 - h - 10);
  const vis = x > x0 && y1 - y0 > h + 20 && y1 > barBottom() + h + 20 && y0 < VH;
  b.style.visibility = vis ? '' : 'hidden'; b.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}
$('#cornBtn').onclick = () => setCornellHide(!S.cornellHide);
// Bild-Knopf: kleines Menü, aus der Zwischenablage oder aus einer Datei
$('#bImg').onclick = () => openMenu($('#imgMenu'), $('#bImg'));
$('#mImgClip').onclick = () => { closeMenus(); pasteImage(); };
$('#mImgFile').onclick = () => { closeMenus(); $('#fImg').click(); };
$('#mImgPdf').onclick = () => { closeMenus(); $('#fPdf').click(); };   // PDF: im Menü des Bild-Knopfs (Platz in der Leiste für den Text-Knopf)
$('#fImg').onchange = e => { insertImages(e.target.files); e.target.value = ''; };
$('#fPdf').onchange = e => { if (e.target.files[0]) insertPdf(e.target.files[0]); e.target.value = ''; };
document.addEventListener('paste', e => {
  if ($('#editor').classList.contains('hidden') || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  if (ncCur && files.length) { e.preventDefault(); addNoteImages(files); return; }   // offene Notiz: Bilder hinein
  if (e.target.tagName === 'TEXTAREA') return;
  if (ncCur) { const text = e.clipboardData?.getData('text/plain'); if (text) { e.preventDefault(); insertNoteText(text); } return; }   // offene Notiz: Text ins Textfeld
  if (files.length) { e.preventDefault(); insertImages(files); }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
$('#stage').addEventListener('drop', e => {
  e.preventDefault(); const files = [...e.dataTransfer.files];
  files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)).forEach(insertPdf);
  insertImages(files);
});

/* ---------- Export ---------- */
// o: { cheap (Vorschaubild: Striche als einfache Linien), note (Seite mit Format: außen Tisch, Muster passend in den Feldern),
//      light (immer hell) }
async function renderTo(items, box, scale, bg, o = {}) {
  const [x0, y0, x1, y1] = box, W = Math.max(1, Math.ceil((x1 - x0) * scale)), H = Math.max(1, Math.ceil((y1 - y0) * scale));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // Farben hängen am Darkmode: hell gezeichnet wird nur in diesen kurzen, synchronen Abschnitten (dazwischen zeichnet evtl. der Bildschirm)
  const paint = fn => { lightOnly = !!o.light; try { fn(); } finally { lightOnly = false; } };
  paint(() => {
    const n = o.note && paperSize(o.note) ? o.note : null, X = v => (v - x0) * scale, Y = v => (v - y0) * scale;
    if (!n) { ctx.fillStyle = paperColor(); ctx.fillRect(0, 0, W, H); drawBg(ctx, bg, { tx: -x0 * scale, ty: -y0 * scale, z: scale }, W, H, 1); return; }
    ctx.fillStyle = deskColor(); ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < sheetCount(n); k++) {
      const r = sheetRect(k, n); if (!boxHit(r, box)) continue;
      ctx.fillStyle = paperColor(); ctx.fillRect(X(r[0]), Y(r[1]), (r[2] - r[0]) * scale, (r[3] - r[1]) * scale);
      const cor = isCornell(n) ? cornellOf(k, n) : null;
      if (cor) cornellTint(ctx, cor, scale, X(0), Y(0));
      for (const f of fieldsOf(k, n)) {
        const pad = 2, top = cor ? Y(cor.head) + pad : Y(f[1]) - pad;
        ctx.save(); ctx.beginPath(); ctx.rect(X(f[0]) - pad, top, (f[2] - f[0]) * scale + 2 * pad, Y(f[3]) + pad - top); ctx.clip();
        drawBg(ctx, bg, { tx: X(f[0]), ty: Y(f[1]), z: scale }, W, H, 1);
        ctx.restore();
      }
      if (cor) drawCornell(ctx, cor, scale, X(0), Y(0), Math.max(1, 0.5 * scale));
    }
  });
  ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  const order = paintOrder(items);
  for (let n = 0; n < order.length; n++) {
    const it = order[n];
    if (!o.cheap && isHlStroke(it)) {   // Textmarker als eine Schicht (wie auf der Seite)
      const group = [it]; while (n + 1 < order.length && isHlStroke(order[n + 1])) group.push(order[++n]);
      paint(() => paintHl(ctx, group)); continue;
    }
    if (it.t === 'i') {
      const e = imgEntry(it.img); await e.ready;
      // Export: jedes Bild einzeln in voller Auflösung dekodieren und gleich wieder freigeben
      const bmp = !o.cheap && e.rec ? await decodeBlob(e.rec.blob).catch(() => null) : null;
      const use = bmp || e.low;
      if (use) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(use, it.x, it.y, it.w, it.h); }
      if (bmp) bmp.close();
    } else if (o.cheap && it.t === 's' && !it.nt) paint(() => {
      // Vorschaubild: Striche als einfache Linien (schnell), Tapes deckend bzw. aufgedeckt nur als Schimmer
      ctx.strokeStyle = colorOf(it.c); ctx.lineWidth = it.w; ctx.lineCap = ctx.lineJoin = 'round';
      if (!it.tp) { const a = strokeAlpha(it); if (a < 1) ctx.globalAlpha = a; if (it.hl && !isDark()) ctx.globalCompositeOperation = 'multiply'; }
      if (it.tp) { ctx.lineCap = 'butt'; if (!covered(it)) ctx.globalAlpha = 0.16; }
      if (it.hl) ctx.lineCap = 'square';
      if (it.fs) { const al = ctx.globalAlpha; ctx.globalAlpha = al * FILL_A; ctx.fillStyle = colorOf(it.c); ctx.fill(fillGeo(it).P); ctx.globalAlpha = al; }   // Füllung
      if (it.ds) ctx.setLineDash(it.ds === 'dot' ? [0.01, Math.max(4.5, it.w * 2.9)] : [Math.max(6, it.w * 3.4), Math.max(4.5, it.w * 2.3)]);   // gestrichelt, gepunktet
      ctx.beginPath(); ctx.moveTo(it.pts[0], it.pts[1]);
      const step = Math.max(3, Math.floor(it.pts.length / 3 / 20) * 3);
      for (let i = step; i < it.pts.length; i += step) ctx.lineTo(it.pts[i], it.pts[i + 1]);
      ctx.lineTo(it.pts[it.pts.length - 3], it.pts[it.pts.length - 2]); ctx.stroke();
      if (validFl(it.fl, it.pts.length / 3)) {   // gefüllte Pfeilspitzen
        ctx.fillStyle = colorOf(it.c);
        for (const [a, b] of it.fl) { ctx.beginPath(); ctx.moveTo(it.pts[a * 3], it.pts[a * 3 + 1]); for (let i = a + 1; i <= b; i++) ctx.lineTo(it.pts[i * 3], it.pts[i * 3 + 1]); ctx.fill(); }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
    });
    else paint(() => drawItem(ctx, it, scale));
  }
  return c;
}
// Beschriebener Bereich mit etwas Rand (unendliche Fläche)
function inkBox() {
  const b = contentBox(); if (!b) return null;
  const pad = 40; return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}
// PNG: mit Seitenformat das Blatt in der Mitte des Bildschirms, sonst der beschriebene Bereich
async function exportPNG() {
  const box = paperSize() ? sheetRect(currentSheet()) : inkBox(); if (!box) { toast('Die Seite ist noch leer'); return; }
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const scale = Math.min(2, 16000 / Math.max(bw, bh), Math.sqrt(120e6 / (bw * bh)));
  toast('Bild wird erstellt …', 0);
  try {
    const c = await renderTo(S.items.filter(it => boxHit(itemBox(it), box)), box, scale, S.note.bg || 'dots', { note: S.note });
    const blob = await canvasToBlob(c, 'image/png'); c.width = c.height = 0;
    download(blob, (S.note.name || 'Notiz') + '.png'); toast('Bild gespeichert');
  } catch (e) { toast('Export fehlgeschlagen: ' + e.message, 5000); }
}
/* PDF: jede Seite als ein Bild (verlustfrei, etwa 240 dpi), immer hell. Mit Seitenformat eine PDF-Seite je Blatt,
   genau DIN A4/A3; sonst eine Seite so groß wie der beschriebene Bereich. 1 Welteinheit = 1/96 Zoll = 0,75 pt. */
async function exportPDF() {
  const boxes = paperSize() ? Array.from({ length: sheetCount() }, (_, k) => sheetRect(k)) : [inkBox()];
  if (!boxes[0]) { toast('Die Seite ist noch leer'); return; }
  const note = S.note, items = S.items, bg = note.bg || 'dots';
  const pages = boxes.map((box, k) => {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const scale = Math.min(2.5, 16000 / Math.max(bw, bh), Math.sqrt(24e6 / (bw * bh)));
    const pt = 0.75 * Math.min(1, 14400 / (0.75 * Math.max(bw, bh)));   // PDF-Seiten höchstens 200 Zoll
    return { w: bw * pt, h: bh * pt, render: () => {
      if (boxes.length > 1) toast(`PDF wird erstellt … Blatt ${k + 1} von ${boxes.length}`, 0);
      return renderTo(items.filter(it => boxHit(itemBox(it), box)), box, scale, bg, { note, light: true });
    } };
  });
  toast('PDF wird erstellt …', 0);
  try {
    const blob = await makePDF(pages, note.name || 'Notiz');
    download(blob, (note.name || 'Notiz') + '.pdf');
    toast(boxes.length > 1 ? `PDF mit ${boxes.length} Seiten gespeichert` : 'PDF gespeichert');
  } catch (e) { toast('Export fehlgeschlagen: ' + e.message, 5000); }
}
// Bild einer Seite für das PDF: RGB, mit Deflate komprimiert (ohne CompressionStream: JPEG)
async function pdfImage(c) {
  const W = c.width, H = c.height;
  if (typeof CompressionStream === 'undefined') {
    const jpg = await canvasToBlob(c, 'image/jpeg', 0.92);
    return { W, H, filter: 'DCTDecode', data: new Uint8Array(await jpg.arrayBuffer()) };
  }
  const ctx = c.getContext('2d'), parts = [], band = Math.max(1, Math.floor(4e6 / W));
  for (let y = 0; y < H; y += band) {
    const h = Math.min(band, H - y), d = ctx.getImageData(0, y, W, h).data, rgb = new Uint8Array(W * h * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    parts.push(rgb);
  }
  const z = new Blob(parts).stream().pipeThrough(new CompressionStream('deflate'));
  return { W, H, filter: 'FlateDecode', data: new Uint8Array(await new Response(z).arrayBuffer()) };
}
// Text im PDF (Titel): UTF-16 mit Byte-Order-Mark, als Hex
const pdfText = s => '<FEFF' + Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(16).padStart(4, '0')).join('').toUpperCase() + '>';
// pages: [{ render: () => Promise<Canvas>, w, h (Seitengröße in pt) }]; die Seiten werden nacheinander gezeichnet
// und gleich wieder freigegeben (viele Blätter in hoher Auflösung passen nicht gleichzeitig in den Speicher)
async function makePDF(pages, title) {
  const enc = new TextEncoder(), out = [], offs = [];
  let len = 0;
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; out.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; put(n + ' 0 obj\n'); body(); put('\nendobj\n'); };
  const num = v => String(Math.round(v * 100) / 100);
  const d = new Date(), p2 = v => String(v).padStart(2, '0');
  put('%PDF-1.4\n'); put(new Uint8Array([37, 226, 227, 207, 211, 10]));   // %âãÏÓ: Datei enthält Binärdaten
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Kids [${pages.map((_, k) => (4 + 3 * k) + ' 0 R').join(' ')}] /Count ${pages.length} >>`));
  obj(3, () => put(`<< /Title ${pdfText(title)} /Producer (Notizen) /CreationDate (D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`));
  for (let k = 0; k < pages.length; k++) {
    const pg = pages[k], P = 4 + 3 * k, c = await pg.render(), im = await pdfImage(c), W = num(pg.w), H = num(pg.h);
    c.width = c.height = 0;
    const cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(P, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${P + 1} 0 R >> >> /Contents ${P + 2} 0 R >>`));
    obj(P + 1, () => { put(`<< /Type /XObject /Subtype /Image /Width ${im.W} /Height ${im.H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${im.filter} /Length ${im.data.length} >>\nstream\n`); put(im.data); put('\nendstream'); });
    obj(P + 2, () => put(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
  }
  const xref = len, size = 4 + 3 * pages.length;
  put(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let i = 1; i < size; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(out, { type: 'application/pdf' });
}
async function download(blob, name) {
  name = name.replace(/[\\/:*?"<>|]/g, '_');
  // iPad: über das Teilen-Menü (In Dateien sichern, AirDrop, Mail …), ein Download ist dort schlecht auffindbar
  if (IOS && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if (e.name === 'AbortError') return; }   // abgebrochen; sonst (z. B. zu lange nach dem Antippen) normal herunterladen
    }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function makeThumb(note = S.note, items = S.items) {
  const b = contentBox(items); if (!b) return null;
  const pg = paperSize(note) && sheetRect(0, note);
  let box;
  if (pg) {
    // Seitenformat: das ganze erste Blatt mit etwas Tisch drumherum, Ausschnitt 4:3
    const m = 0.8 * GAP, cx = (pg[0] + pg[2]) / 2, cy = (pg[1] + pg[3]) / 2;   // Rand kleiner als der Abstand: das nächste Blatt bleibt draußen
    let w = pg[2] - pg[0] + 2 * m, h = pg[3] - pg[1] + 2 * m;
    if (w / h > 4 / 3) h = w * 3 / 4; else w = h * 4 / 3;
    box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
  } else {
    const pad = 20, x0 = b[0] - pad, y0 = b[1] - pad;
    let w = b[2] + pad - x0, h = b[3] + pad - y0;
    // Ausschnitt im Format 4:3, oben links beginnend (erste Seite / Anfang der Notiz)
    if (w / h > 4 / 3) h = w * 3 / 4; else w = Math.min(w, h * 4 / 3), h = w * 3 / 4;
    box = [x0, y0, x0 + w, y0 + h];
  }
  const w = box[2] - box[0];
  const c = await renderTo(items.filter(it => boxHit(itemBox(it), box)), box, 320 / w, note.bg || 'dots', { cheap: true, note });
  const url = c.toDataURL('image/jpeg', 0.8); c.width = c.height = 0;
  return url;
}

/* ---------- Dialog ---------- */
// Eigener Dialog, weil prompt/confirm in Electron nicht gehen.
// o: { value, input (false = nur Ja/Nein), ok (Beschriftung), danger, color (Buch-Dialog mit Farbwahl und Vorschau),
//      page ({ f: 'inf'|'a4'|'a3', o: 'p'|'l' }: Seitenformat wählen, liefert die Auswahl) }
function dialog(msg, o = {}) {
  return new Promise(res => {
    const d = $('#dlg'), box = $('#dlgBox'), inp = $('#dlgIn'), ok = $('#dlgOk'), sw = $('#dlgSw'), prev = $('#dlgPrev');
    const withInput = o.input !== false, bk = !!o.color, pf = !!o.page, fmt = $('#dlgFmt');
    let color = o.color;
    const sel = pf ? { ...o.page } : null;
    box.classList.toggle('pf', pf); fmt.classList.toggle('hidden', !pf);
    if (pf) {
      const upd = () => {
        const cor = sel.t === 'cornell';
        fmt.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === (cor ? 'cornell' : sel.f)));
        fmt.querySelectorAll('[data-o]').forEach(b => { b.classList.toggle('on', b.dataset.o === sel.o); b.disabled = sel.f === 'inf' || cor; });
        fmt.classList.toggle('ls', sel.o === 'l'); fmt.classList.toggle('inf', sel.f === 'inf');
        $('#dlgFmtHint').textContent = sel.f === 'inf' ? 'Freie Fläche ohne Rand, sie wächst in alle Richtungen.'
          : cor ? 'Cornell: rechts mitschreiben, danach links Stichworte und Fragen, unten eine kurze Zusammenfassung. Zum Lernen die Notizen verdecken und die Fragen aus dem Kopf beantworten.'
          : sel.f === 'a3' && sel.o === 'l' ? 'Jede PDF-Seite kommt auf die linke Hälfte eines Blatts, rechts bleibt eine A4-Seite frei für Notizen.'
          : 'Mehrere Blätter untereinander; ein PDF kommt Seite für Seite auf eigene Blätter.';
      };
      fmt.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (b.dataset.f === 'cornell') Object.assign(sel, { f: 'a4', o: 'p', t: 'cornell' }); else { sel.f = b.dataset.f; delete sel.t; } upd(); });
      fmt.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { sel.o = b.dataset.o; upd(); });
      upd();
    }
    const ae = document.activeElement; if (ae && ae.blur) ae.blur();
    $('#dlgMsg').textContent = msg; inp.classList.toggle('hidden', !withInput); inp.value = o.value || '';
    inp.placeholder = o.placeholder || '';
    ok.textContent = o.ok || 'OK'; ok.classList.toggle('danger', !!o.danger);
    box.classList.toggle('bk', bk); sw.classList.toggle('hidden', !bk); prev.classList.toggle('hidden', !bk);
    sw.innerHTML = ''; inp.oninput = null;
    if (bk) {
      const upd = () => { coverVars(prev, color); coverLabel(prev.querySelector('.lbl'), inp.value.trim() || o.placeholder || '', 5.3); };
      for (const [k, [label]] of Object.entries(BOOK_COLORS)) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'bsw' + (k === color ? ' on' : ''); b.title = label; b.dataset.c = k;
        coverVars(b, k);
        b.onclick = () => { color = k; sw.querySelectorAll('.bsw').forEach(x => x.classList.toggle('on', x === b)); upd(); };
        sw.appendChild(b);
      }
      inp.oninput = upd; upd();
    }
    d.classList.remove('hidden');
    // Auftritt wie die anderen Popups: der Hintergrund blendet ein, die Karte ploppt aus der Mitte
    d.getAnimations().forEach(a => a.cancel());
    if (!reduceMotion()) d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
    popIn(box, null, '', 0, 0.88);
    if (withInput) { inp.focus(); inp.select(); } else ok.focus();
    const done = v => {
      // Abgang: als Kopie ausblenden, der echte Dialog ist sofort frei. Buch angelegt: Vorschau-Einband merken (dort
      // startet die Animation), sein Einband fliegt weiter, die Kopie zeigt ihn nicht
      if (!reduceMotion()) {
        const book = bk && v, ms = book ? 220 : 130;
        if (book) lastCoverRect = rectOf(prev);
        const g = d.cloneNode(true); g.style.pointerEvents = 'none'; g.querySelector('#dlgIn').value = inp.value;
        if (book) g.querySelector('#dlgPrev').style.visibility = 'hidden';
        document.body.appendChild(g);
        g.querySelector('#dlgBox').animate([{ transform: 'none' }, { transform: book ? 'scale(.97)' : 'scale(.95)' }], { duration: ms, easing: book ? 'ease-out' : 'ease-in', fill: 'forwards' });
        g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }).finished.then(() => g.remove());
      }
      d.classList.add('hidden'); box.onsubmit = $('#dlgNo').onclick = d.onpointerdown = inp.oninput = null; res(v); };
    box.onsubmit = e => { e.preventDefault(); done(pf ? sel : !withInput ? true : bk ? { name: inp.value, color } : inp.value); };
    $('#dlgNo').onclick = () => done(null);
    d.onpointerdown = e => { if (e.target === d) done(null); };
  });
}
function ask(msg, value, withInput = true, o = {}) { return dialog(msg, { ...o, value, input: withInput }); }
const askYes = (msg, o) => dialog(msg, { ...o, input: false }).then(v => v === true);
// Neue Seite: Format wählen, liefert { f, o } oder null
const askPage = page => dialog('Neue Seite', { input: false, ok: 'Anlegen', page });
// Buch anlegen/bearbeiten: liefert { name, color } oder null
let lastCoverRect = null;   // wo die Einband-Vorschau im Buch-Dialog zuletzt stand
function askBook(title, name, color, ok) {
  return dialog(title, { value: name, color: BOOK_COLORS[color] ? color : 'blue', ok, placeholder: 'Neues Buch' })
    .then(v => v && { name: v.name.trim() || name || 'Neues Buch', color: v.color });
}

/* ---------- Startseite: Regal mit Büchern, im Buch die Seiten ---------- */
const fmtDate = t => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDay = t => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
let homeToken = 0;
let homeBook = null;                     // geöffnetes Buch (id) oder null = Regal
let homeData = { books: [], notes: [] }; // Stand der letzten Anzeige
let homeKey = null, homeScroll = null;   // für Animation und Scrollposition beim Zurückkommen
// Beschriftung auf dem Einband: die Schrift wächst mit dem Einband (cqw); lange Wörter werden kleiner gesetzt,
// damit sie nicht mitten im Wort umbrechen. avail = nutzbare Breite des Schildes in em.
let measureCtx = null;
function coverLabel(lbl, name, avail = 6.7) {
  lbl.firstChild.textContent = name; lbl.parentNode.dataset.n = name;   // data-n: großer Name im Hintergrund (Aussehen XP)
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '650 100px ' + getComputedStyle(document.body).fontFamily;
  const em = t => measureCtx.measureText(t).width / 100;
  const longest = Math.max(0, ...name.split(/\s+/).map(em)), total = em(name);
  avail *= 0.93;   // Reserve: Kerning und Schriftersatz messen nicht exakt
  let k = longest > avail ? avail / longest : 1;
  if (total > 2.2 * avail) k = Math.min(k, 0.82);   // lange Namen: lieber kleiner als abgeschnitten
  lbl.style.setProperty('--k', Math.max(0.55, k).toFixed(3));
  // Aussehen XP: großer Titel unten (Franklin Gothic), etwa 5,3 Geviert breit; das längste Wort passt hinein
  measureCtx.font = 'bold 100px "Franklin Gothic Medium","Trebuchet MS",Tahoma,sans-serif';
  const longX = Math.max(0.01, ...name.split(/\s+/).map(em));
  lbl.style.setProperty('--kx', Math.max(0.5, Math.min(1, 5.3 / longX)).toFixed(3));
}
// quiet: ohne die Einblend-Animation des Rasters (die Buch-Animation übernimmt das)
async function renderHome(quiet) {
  const token = ++homeToken;
  let data = { books: [], notes: [] };
  try { data = await ensureBooks(); } catch (e) { toast('Speicher nicht verfügbar: ' + e.message, 6000); }
  if (token !== homeToken) return;   // eine neuere Anzeige läuft schon
  homeData = data;
  const grid = $('#grid'), book = homeBook && data.books.find(b => b.id === homeBook);
  if (!book) homeBook = null;
  const key = homeBook || '', back = homeScroll && homeScroll.key === key;
  const top = back ? homeScroll.top : key === homeKey ? grid.scrollTop : 0;
  if (!$('#homeMenu').classList.contains('hidden')) closeMenus();
  grid.innerHTML = '';
  if (book) renderBook(grid, book, data.notes); else renderShelf(grid, data.books, data.notes);
  grid.classList.toggle('enter', !quiet && (key !== homeKey || !!back));
  homeKey = key; homeScroll = null;
  grid.scrollTop = top;
}
// home: die Startseite (oder eine Kopie davon, siehe warmUpBookFx)
function setHomeMode(book, home = $('#home')) {
  const q = s => home.querySelector(s), grid = q('#grid');
  q('#hShelfHead').classList.toggle('hidden', !!book); q('#hBookHead').classList.toggle('hidden', !book);
  q('#hNewBook').classList.toggle('hidden', !!book); q('#hNew').classList.toggle('hidden', !book);
  grid.classList.toggle('shelf', !book); grid.classList.toggle('pages', !!book);
  home.classList.toggle('inbook', !!book);
  if (book) coverVars(home, book.color); else { home.style.removeProperty('--c1'); home.style.removeProperty('--c2'); }
}
function renderShelf(grid, books, notes) {
  setHomeMode(null);
  const cnt = new Map(), last = new Map();
  for (const n of notes) { cnt.set(n.book, (cnt.get(n.book) || 0) + 1); last.set(n.book, Math.max(last.get(n.book) || 0, n.updated || 0)); }
  $('#hShelfSub').textContent = books.length ? booksWord(books.length) + ' · ' + pagesWord(notes.length) : '';
  if (!books.length) { grid.appendChild(emptyState(false)); return; }
  books.sort(byCreated).forEach((b, k) => {
    const n = cnt.get(b.id) || 0, el = document.createElement('div');
    el.className = 'book'; el.dataset.id = b.id; coverVars(el, b.color); el.style.setProperty('--i', Math.min(k, 10));
    el.innerHTML = `<button class="cv"><span class="pgs"></span><span class="cover"><span class="gl"></span><span class="lbl"><span class="t"></span></span></span></button>
      <div class="cap"><div class="grow"><div class="nm"></div><div class="dt"></div></div>
      <button class="mbtn" title="Buch bearbeiten"><svg class="i"><use href="#ic-more"/></svg></button></div>`;
    coverLabel(el.querySelector('.lbl'), b.name);
    el.querySelector('.gl').dataset.p = n ? (n === 1 ? '1 Seite' : n + ' Seiten') : 'Neu';   // Schild auf dem Einband (Aussehen XP)
    el.querySelector('.nm').textContent = el.firstChild.title = b.name;
    el.querySelector('.dt').textContent = (n ? pagesWord(n) : 'Leer') + ' · ' + fmtDay(last.get(b.id) || b.created || Date.now());
    el.firstChild.onclick = () => openBook(b.id, el);
    const mb = el.querySelector('.mbtn'); mb.onclick = () => bookMenu(b, mb);
    grid.appendChild(el);
  });
  grid.appendChild(addTile('bk', 'Neues Buch', newBook, books.length));
}
function renderBook(grid, book, notes, home = $('#home')) {
  setHomeMode(book, home);
  const pages = notes.filter(n => n.book === book.id).sort(byCreated), q = s => home.querySelector(s);
  q('#hBookName').textContent = q('#hBookName').title = book.name;
  const sub = q('#hBookSub'); sub.textContent = pages.length ? pagesWord(pages.length) : 'Noch keine Seiten';
  if (pages.length) { const o = document.createElement('span'); o.className = 'opt'; o.textContent = ' · zuletzt bearbeitet ' + fmtDay(Math.max(...pages.map(n => n.updated || 0))); sub.appendChild(o); }
  if (!pages.length) { grid.appendChild(emptyState(true)); return; }
  pages.forEach((n, k) => {
    const card = document.createElement('div'); card.className = 'card'; card.dataset.id = n.id; card.style.setProperty('--i', Math.min(k, 10));
    card.innerHTML = `<div class="th"><span class="pno"></span></div>
      <div class="meta"><div class="grow"><div class="nm"></div><div class="dt"></div></div>
      <button class="mbtn" title="Seite bearbeiten"><svg class="i"><use href="#ic-more"/></svg></button></div>`;
    if (n.thumb) { const im = new Image(); im.alt = ''; im.src = n.thumb; card.firstChild.prepend(im); }
    else if (paperSize(n)) {   // leeres Blatt: auf dem Tisch, im richtigen Format
      const sh = document.createElement('span'), [w, h] = paperSize(n);
      sh.className = 'sheet bg-' + (n.bg || 'dots'); sh.style.aspectRatio = w + '/' + h; sh.classList.toggle('ls', w > h);
      card.firstChild.classList.add('desk'); card.firstChild.prepend(sh);
    } else card.firstChild.classList.add('bg-' + (n.bg || 'dots'));   // leere Seite: ihr Hintergrund
    card.querySelector('.pno').textContent = k + 1;
    card.querySelector('.nm').textContent = n.name;
    card.querySelector('.dt').textContent = fmtDate(n.updated);
    if (paperSize(n)) {   // Format und Zahl der Blätter als Schild auf dem Vorschaubild
      const f = document.createElement('span'); f.className = 'pfmt';
      f.textContent = paperName(n.paper).replace('DIN ', '') + (sheetCount(n) > 1 ? ' · ' + sheetsWord(sheetCount(n)) : '');
      card.firstChild.appendChild(f);
    }
    const mb = card.querySelector('.mbtn');
    card.onclick = e => { if (e.target.closest('.mbtn')) pageMenu(n, book, mb); else openNote(n); };
    grid.appendChild(card);
  });
  grid.appendChild(addTile('pg', 'Neue Seite', newPage, pages.length));
}
function addTile(kind, label, fn, k) {
  const b = document.createElement('button'); b.className = 'addtile ' + kind; b.style.setProperty('--i', Math.min(k, 10));
  b.innerHTML = '<span class="plus"><svg class="i"><use href="#ic-plus"/></svg></span><span></span>';
  b.lastChild.textContent = label; b.onclick = fn;
  return b;
}
function emptyState(inBook) {
  const el = document.createElement('div'); el.className = 'empty';
  el.innerHTML = inBook
    ? `<div class="ill"><span class="sheet back"></span><span class="sheet"><i style="top:36px"></i><i style="top:54px;right:58px"></i></span></div>
      <h2>Dieses Buch ist noch leer</h2><p>Lege die erste Seite an und schreib los.</p>
      <button class="btn primary"><svg class="i"><use href="#ic-plus"/></svg>Erste Seite anlegen</button>`
    : `<div class="ill"><span class="mini"></span><span class="mini"></span><span class="mini"></span></div>
      <h2>Dein Regal ist noch leer</h2><p>Lege ein Buch an – zum Beispiel „Mathe“ – und sammle darin deine Seiten.</p>
      <button class="btn primary"><svg class="i"><use href="#ic-plus"/></svg>Erstes Buch anlegen</button>`;
  if (!inBook) el.querySelectorAll('.mini').forEach((m, i) => coverVars(m, ['teal', 'blue', 'mustard'][i]));
  el.querySelector('button').onclick = inBook ? newPage : newBook;
  return el;
}
function openBook(id, from) {
  if (navBusy || S.note || homeAnim) return;
  homeBook = id;
  if (from && !reduceMotion()) animate(fx => bookOpenFx(from, id, fx)); else renderHome();
}
function showShelf() {
  if (homeAnim) return;
  const id = homeBook; homeBook = null;
  if (id && !reduceMotion() && !$('#home').classList.contains('hidden')) animate(fx => bookCloseFx(id, fx)); else renderHome();
}

/* ---------- Animation: Buch anlegen, öffnen und schließen ----------
   Öffnen: das Buch fliegt in die Mitte und klappt auf, dann kommt es etwas näher und löst sich auf, während die Seiten
   ruhig an ihren Plätzen erscheinen. Schließen: die Seiten blenden aus, das offene Buch erscheint in der Mitte, klappt
   zu und stellt sich an seinen Platz. Anlegen: der Einband fliegt aus dem Dialog an seinen Platz im Regal (die anderen
   rücken nach), dann geht das Buch auf.
   Sauber und flüssig: bevor sich etwas bewegt, ist die neue Ansicht schon fertig aufgebaut (Bilder dekodiert), ein
   Standbild der alten liegt darüber und blendet weich aus. Während der Bewegung ändern sich nur transform und opacity.
   Mit „Bewegung reduzieren“ im System wird nur umgeschaltet. */
let homeAnim = false;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
async function animate(fn) {
  homeAnim = navBusy = true;   // gilt als Navigation: nichts anderes öffnen, bis es fertig ist
  const fx = document.createElement('div'); fx.id = 'fx'; document.body.appendChild(fx);   // fängt Klicks ab, solange es läuft
  try { await fn(fx); } catch (e) { console.error(e); renderHome(); }
  finally { fx.remove(); homeAnim = navBusy = false; }
}
// Warten auf der Zeitachse der Animationen (läuft genau mit ihnen, nicht mit setTimeout daneben)
const wait = ms => document.documentElement.animate([], { duration: Math.max(0, ms) }).finished;
const rectOf = el => el.getBoundingClientRect();
const onScreen = r => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
// Feder als Easing (CSS linear() mit Stützpunkten), wie bei Apple über Dauer und Nachschwingen beschrieben:
// bounce 0 = kommt ohne Überschwingen an. Liefert { easing, duration } bis zum Ausschwingen und settled: ab da
// weicht sie um weniger als 0,5 % ab (sichtbar angekommen, der Rest ist nur noch feines Ausschwingen).
const SPRINGS = new Map();
function spring(bounce, ms) {
  const key = bounce + '|' + ms; if (SPRINGS.has(key)) return SPRINGS.get(key);
  const w = 2 * Math.PI / (ms / 1000), z = 1 - bounce, wd = w * Math.sqrt(Math.max(1e-9, 1 - z * z));
  const x = t => z >= 1 ? 1 - Math.exp(-w * t) * (1 + w * t) : 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + z * w / wd * Math.sin(wd * t));
  let T = 0.1; while (T < 3 && (Math.abs(1 - x(T)) > 0.0015 || Math.abs(1 - x(T + 0.03)) > 0.0015)) T += 0.01;
  let S = T; while (S > 0 && Math.abs(1 - x(S)) < 0.005) S -= 0.005;
  const pts = Array.from({ length: 61 }, (_, i) => i === 60 ? 1 : +x(T * i / 60).toFixed(4));
  const ok = window.CSS && CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)');
  const r = { easing: ok ? `linear(${pts.join(', ')})` : 'cubic-bezier(.22,1,.36,1)', duration: Math.round(T * 1000), settled: Math.round((S + 0.005) * 1000) };
  SPRINGS.set(key, r); return r;
}
// WAAPI-Optionen einer Feder (ohne settled)
const sp = (s, o = {}) => ({ easing: s.easing, duration: s.duration, ...o });
const LID = 'cubic-bezier(.45,.05,.2,1)';   // Einband auf- und zuklappen: weich an und weich aus
// transform, das ein Element mit Rechteck a (origin oben links) auf Rechteck b legt (Breite bestimmt die Größe;
// scale3d, damit die Dicke des Buchs im Raum mitwächst)
const toRect = (a, b) => { const k = b.width / a.width; return `translate(${b.left - a.left}px,${b.top - a.top}px) scale3d(${k},${k},${k})`; };
// Lage des Buchs: im Regal flach (Tiefe zusammengedrückt, deckt sich genau mit dem echten Buch), auf der Bühne
// frontal mit voller Dicke; die Sicht von leicht vorne (fxBook: Auge unterhalb des Buchs) zeigt Schnitt und Kanten.
const FLAT = 'scaleZ(.02)', TILT = 'scaleZ(1)';
const OPEN = 'rotateY(-180deg)', SHUT = 'rotateY(0deg)';   // Vorderdeckel aufgeschlagen bzw. zu
/* Kopie des Buchs als 3D-Körper (Koordinaten des ungedrehten Buchs, transform-origin oben links), in der Mitte
   aufgeschlagen wie ein dickes Buch: Rückendeckel, darauf die rechte Hälfte der Seiten. Am Rücken aufgehängt darüber
   die linke Hälfte (dieselben Seiten, in der Tiefe gespiegelt) mit dem Vorderdeckel (Innenseite, Einband außen); sie
   klappt als Ganzes nach links auf. Die Kanten der Deckel folgen genau den runden Ecken des Einbands, in seiner Farbe.
   Beim Aufklappen wölben sich die Seiten: am Rücken gebunden laufen sie in einer Falz zusammen, jede behält ihre
   Länge, darum ziehen sich die oberen nach innen und die unteren stehen außen weiter heraus (wie bei einem echten
   Buch). In .tilt liegt alles, was sich neigt; .pgs ist der flache Schnitt wie im Regal, .lsh der Schatten der
   linken Hälfte auf dem Tisch. Der Rücken (.spine) verbindet Vorder- und Rückendeckel: ein Bezug, der beim Aufklappen
   mitgeht und offen unter dem Bund liegt. */
function fxBook(fx, book, r) {
  const W = r.width, H = r.height, T = Math.round(W * 0.105), c = Math.max(2.5, W * 0.022);   // T: Dicke je Hälfte
  const x1 = W * 0.97, y0 = H * 0.022, y1 = H * 0.978, ph = y1 - y0;
  const el = document.createElement('div'); el.className = 'fxbook'; coverVars(el, book.color);
  // Blick auf das Buch, in seinen eigenen Maßen (wächst mit ihm): über dem Rücken, weit vorne, sechs Buchhöhen unter
  // der Unterkante und neun entfernt. So sieht es in jedem Fenster gleich aus, und für das Ein- und Ausblenden ist das
  // Buch ein fertiges Bild (Deckkraft am Ganzen, ohne Nähte zwischen den Flächen).
  Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: H + 'px', perspective: H * 9 + 'px', perspectiveOrigin: `0 ${H * 7}px` });
  const px = v => +v.toFixed(2) + 'px', rad = v => +v.toFixed(4) + 'rad';
  const face = (cls, st, more = '', inner = '') => `<span class="f ${cls}" style="${st}" ${more}>${inner}</span>`;
  const box = (l, t, w, h) => `left:${px(l)};top:${px(t)};width:${px(w)};height:${px(h)};`;
  // Teile, die sich mit dem Deckel bewegen: Eigenschaft und Werte von zu bis auf, gleichmäßig über den Weg verteilt
  // (bendBook spielt sie im Takt des Deckels ab)
  const parts = [], bend = (prop, ...v) => (parts.push({ prop, v }), `data-k="${parts.length - 1}"`);
  // Kante eines Deckels (Dicke c ab z0) als Streifen von A nach B in der Ebene des Buchs, Farbe wie der Einband an
  // der Stelle, nach Richtung abgedunkelt (unten am dunkelsten)
  const wall = (ax, ay, bx, by, z0) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, m = Math.round(60 * (1 - (ay + by) / 2 / H));
    return face('rim', box(0, 0, l + 0.6, c) + `transform:translate3d(${px(ax)},${px(ay)},${px(z0)}) rotateZ(${rad(Math.atan2(dy, dx))}) rotateX(90deg);` +
      `background:color-mix(in srgb,color-mix(in srgb,var(--c1) ${m}%,var(--c2)) ${Math.round(91 - 7 * ny + 4 * nx)}%,#000)`);
  };
  // Umriss mit den Radien des Einbands (links 4, rechts 12 px): unten, rechts und die Ecken dazwischen; oben links
  // sieht man nie
  const rim = z0 => {
    const pts = [], arc = (cx, cy, rr, f0, f1, k) => { for (let i = 0; i <= k; i++) { const f = f0 + (f1 - f0) * i / k; pts.push([cx + rr * Math.cos(f), cy + rr * Math.sin(f)]); } };
    const R = Math.min(12, W / 4), q = Math.min(4, W / 8), P2 = Math.PI / 2;
    arc(q, H - q, q, Math.PI, P2, 2); arc(W - R, H - R, R, P2, 0, 4); arc(W - R, R, R, 0, -P2, 4);
    return pts.slice(1).map((p, i) => wall(pts[i][0], pts[i][1], p[0], p[1], z0)).join('');
  };
  // Profil der obersten Seite (x vom Bund, z über dem Rückendeckel). Zu: flach bei z = T. Auf: am Bund unten
  // gebunden (z = 0), steil hoch, leicht gewölbt, dann flach; X so, dass die Länge gleich bleibt
  const U = [0, .01, .025, .05, .085, .13, .2, .3, .45, .65, .84, 1], lam = W * 0.032, hump = T * 0.16;
  const zf = (x, X) => T * (1 - Math.exp(-x / lam)) + hump * 6.75 * (x / X) * (1 - x / X) ** 2;
  const prof = X => U.map(u => [u * X, zf(u * X, X)]), len = P => P.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), 0);
  let X = x1; for (let i = 0; i < 8; i++) X *= x1 / len(prof(X));
  const P = prof(X), seg = P.slice(1).map((p, i) => ({ x: P[i][0], z: P[i][1], l: Math.hypot(p[0] - P[i][0], p[1] - P[i][1]), a: Math.atan2(p[1] - P[i][1], p[0] - P[i][0]) }));
  const S = [0]; seg.forEach(s => S.push(S[S.length - 1] + s.l));
  // Schatten der Wölbung je Punkt: je steiler, desto dunkler (in der Falz am dunkelsten)
  const ang = P.map((_, i) => (seg[Math.max(0, i - 1)].a + seg[Math.min(seg.length - 1, i)].a) / 2);
  const shade = i => Math.min(0.5, 0.62 * (1 - Math.cos(ang[i]))).toFixed(3);
  const n = seg.length, last = P[n], fe = Math.hypot(x1 - last[0], last[1]), hc = Math.ceil(T + hump + 2);
  const flatTop = S.map(v => `${px(v)} ${px(T)}`).reverse().join(','), curvedTop = P.map(p => `${px(p[0])} ${px(p[1])}`).reverse().join(',');
  const down = rad(-Math.PI / 2);
  // eine Hälfte der Seiten (rechts; links dieselbe im Deckel, gespiegelt). Unter dem flachen Teil liegt eine Seite als
  // Grund, unter der Falz je Stück eine etwas breitere im Ton des Schattens: zwischen den Stücken der Wölbung scheint
  // so nie der Hintergrund durch (auch nicht beim Ausblenden, wo sich Überlappungen als helle Linien zeigen würden)
  const j = 5, bw = S[n] - S[j];
  const under = seg.slice(0, j).map((s, i) => {
    const a = `translate3d(${px(S[i] - 0.6)},0,${px(T - 0.5)}) rotateY(0rad)`, b = `translate3d(${px(s.x - 0.6 * Math.cos(s.a))},0,${px(s.z - 0.6 * Math.sin(s.a) - 0.5)}) rotateY(${rad(-s.a)})`;
    return face('pgu', box(0, y0, s.l + 1.2, ph) + `background:color-mix(in srgb,var(--page) ${Math.round(100 - 100 * shade(i))}%,#000);transform:${a}`, bend('transform', a, b));
  }).join('');
  const half = under + face('pg pgb', box(0, y0, bw, ph) + `transform:translate3d(${px(S[j])},0,${px(T - 0.4)}) scaleX(1)`,
      bend('transform', `translate3d(${px(S[j])},0,${px(T - 0.4)}) scaleX(1)`, `translate3d(${px(P[j][0])},0,${px(T * 0.95)}) scaleX(${((X - P[j][0]) / bw).toFixed(4)})`)) +
    seg.map((s, i) => {
      const a = `translate3d(${px(S[i])},0,${px(T)}) rotateY(0rad)`, b = `translate3d(${px(s.x)},0,${px(s.z)}) rotateY(${rad(-s.a)})`;
      return face('pg', box(0, y0, s.l + 0.3, ph) + `background-position:${px(-S[i])} 0,0 0;` + (i === n - 1 ? 'border-radius:0 3px 3px 0;' : '') + `transform:${a}`,
        bend('transform', a, b), `<i style="background:linear-gradient(90deg,rgba(0,0,0,${shade(i)}),rgba(0,0,0,${shade(i + 1)}))" ${bend('opacity', 0, 1)}></i>`);
    }).join('') +
    // Schnitt unten: oben entlang der Seite, außen schräg (untere Seiten weiter draußen)
    face('cut cut-b', box(0, y1, x1 + 1, hc) + `transform:rotateX(90deg);clip-path:polygon(0 0,${px(x1)} 0,${flatTop})`,
      bend('clipPath', `polygon(0 0,${px(x1)} 0,${flatTop})`, `polygon(0 0,${px(x1)} 0,${curvedTop})`)) +
    // Schnitt außen: von der untersten Seite (x1, 0) zur obersten
    face('cut cut-r', box(0, y0, T, ph) + `transform:translate3d(${px(x1)},0,0) rotateY(${down}) scaleX(1)`,
      bend('transform', `translate3d(${px(x1)},0,0) rotateY(${down}) scaleX(1)`, `translate3d(${px(x1)},0,0) rotateY(${rad(-Math.atan2(last[1], last[0] - x1))}) scaleX(${(fe / T).toFixed(4)})`)) +
    // Seiten am Bund: füllt beim Aufklappen die Stelle zwischen Gelenk und Falz (offen nicht mehr nötig)
    face('cut cut-s', box(0, y0, T, ph) + `transform:translate3d(0,0,${px(T)}) rotateY(${down}) scaleX(.001)`,
      bend('transform', `translate3d(0,0,${px(T)}) rotateY(${down}) scaleX(.001)`, `translate3d(0,0,${px(T / 2)}) rotateY(${down}) scaleX(.5)`, `translate3d(0,0,0) rotateY(${down}) scaleX(.001)`));
  // Rücken: Bezug von der Außenseite des Rückendeckels (0, -c) zu der des Vorderdeckels, der sich um (0, T) dreht,
  // als Kreisbogen: zu gerade an der linken Kante (so lang wie das Buch dick ist), beim Aufklappen wölbt er sich nach
  // außen und zieht sich unter den Bund zurück; offen sieht man von ihm nur das flache Ende unten (.spn).
  // NS Stücke, Lage an KF + 1 Stellen des Wegs.
  const Ls = 2 * (T + c), NS = 8, KF = 12;
  const spineAt = t => {
    const f = Math.PI * t, A = [0, -c], B = [-(T + c) * Math.sin(f), T + (T + c) * Math.cos(f)];
    const dx = B[0] - A[0], dz = B[1] - A[1], dd = Math.hypot(dx, dz), L = Math.max(dd * 1.02, Ls - (Ls - 0.5 * c) * t * t);
    const out = pts => ({ pts, k: L / Ls });
    if (dd >= L * 0.9995) return out(Array.from({ length: NS + 1 }, (_, k) => [A[0] + dx * k / NS, A[1] + dz * k / NS]));
    const v = dd > 1e-3 ? [dx, dz] : [-Math.sin(f), 1 + Math.cos(f)], vm = Math.hypot(v[0], v[1]);
    const u = vm > 1e-9 ? [v[0] / vm, v[1] / vm] : [-1, 0], nb = [-u[1], u[0]];   // Richtung A→B, Wölbung links davon
    let lo = 1e-6, hi = 2 * Math.PI;   // Mittelpunktswinkel al: Sehne dd bei Bogenlänge L
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (Math.sin(m / 2) / (m / 2) > dd / L) lo = m; else hi = m; }
    const al = (lo + hi) / 2, r = L / al, h = r * Math.cos(al / 2);
    const C = [(A[0] + B[0]) / 2 - nb[0] * h, (A[1] + B[1]) / 2 - nb[1] * h], b0 = Math.atan2(A[1] - C[1], A[0] - C[0]);
    const top = [C[0] + nb[0] * r, C[1] + nb[1] * r], mid = sg => [C[0] + r * Math.cos(b0 + sg * al / 2), C[1] + r * Math.sin(b0 + sg * al / 2)];
    const sg = Math.hypot(...mid(1).map((q, i) => q - top[i])) < Math.hypot(...mid(-1).map((q, i) => q - top[i])) ? 1 : -1;
    return out(Array.from({ length: NS + 1 }, (_, k) => [C[0] + r * Math.cos(b0 + sg * al * k / NS), C[1] + r * Math.sin(b0 + sg * al * k / NS)]));
  };
  const SP = Array.from({ length: KF + 1 }, (_, j) => spineAt(j / KF));
  const spine = Array.from({ length: NS }, (_, k) => {
    let prev = null;
    const tf = SP.map(({ pts, k: sc }) => {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      let a = Math.atan2(bz - az, bx - ax);
      if (prev !== null) a += 2 * Math.PI * Math.round((prev - a) / (2 * Math.PI));   // ohne Sprung um 360°
      prev = a;
      return `translate3d(${px(ax)},0,${px(az)}) rotateY(${rad(-a)}) scaleX(${sc.toFixed(4)})`;
    });
    return face('spine', box(0, 0, Ls / NS + 0.6, H) + `transform:${tf[0]}`, bend('transform', ...tf));
  }).join('');
  // Ende des Rückens unten am Bund (wie bei einem echten Buch): flache Linse über der Fuge der Deckel, oben bündig mit
  // ihnen, unten leicht gerundet; erscheint im letzten Drittel des Aufklappens
  const sw = W * 0.07, sh = 1.8 * c;
  const spn = face('spn', box(-sw, H + 0.4, 2 * sw, sh) + `transform:translateZ(${px(-sh)}) rotateX(90deg)`, '', `<i ${bend('opacity', 0, 0, 0, 1)}></i>`);
  el.innerHTML = `<div class="tilt" style="transform:${FLAT}">
    <span class="f lsh" style="${box(-W, 0, W, H)}transform:translateZ(${px(-c - 1)})"><span class="sh"></span></span>
    ${rim(-c)}${face('back', box(0, 0, W, H))}
    ${half}
    ${spine}${spn}
    <span class="f pgs"></span>
    <div class="lidz" style="transform:translateZ(${px(T)})"><div class="lid">
      <div class="mz" style="transform:translateZ(${px(T)}) scaleZ(-1)">${half}</div>
      ${rim(T)}
      <span class="f inner" style="transform:translateZ(${px(T)}) rotateY(180deg)"></span>
      <span class="cover" style="transform:translateZ(${px(T + c)})"><span class="gl"></span><span class="lbl"><span class="t"></span></span></span>
    </div></div></div>`;
  el.bend = parts;
  fx.appendChild(el); coverLabel(el.querySelector('.lbl'), book.name);
  return el;
}
// Seiten wölben (open) bzw. wieder glätten, im Takt des Deckels
function bendBook(bk, open, o) {
  for (const p of bk.querySelectorAll('[data-k]')) {
    const { prop, v } = bk.bend[p.dataset.k], k = v.map(x => ({ [prop]: x }));
    p.animate(open ? k : k.reverse(), { fill: 'both', ...o });
  }
}
const tiltOf = bk => bk.querySelector('.tilt'), cutOf = bk => bk.querySelector('.pgs'), shadeOf = bk => bk.querySelector('.lsh .sh');
// Buch ein- oder ausblenden: als Ganzes (es ist ein flaches Bild seiner 3D-Ansicht, siehe fxBook), sonst schienen
// beim Ausblenden die Nähte und Schichten zwischen den Flächen durch
const fadeBook = (bk, from, to, o) => bk.animate([{ opacity: from }, { opacity: to }], { fill: 'both', ...o });
// Standbild der Startseite über allem; darunter wird schon die nächste Ansicht aufgebaut
function snapshot(fx) {
  const g = $('#grid'), s = $('#home').cloneNode(true);
  s.classList.add('fxsnap'); fx.prepend(s);
  s.querySelector('#grid').scrollTop = g.scrollTop;
  return s;
}
// Bilder der neuen Ansicht fertig dekodieren, bevor sich etwas bewegt (höchstens 200 ms warten)
const decoded = root => Promise.race([Promise.all([...root.querySelectorAll('img')].map(i => i.decode().catch(() => {}))), wait(200)]);
// Erst losfahren, wenn das Vorbereitete gezeichnet ist: das erste Zeichnen neuer Inhalte (Standbild, Buch) kann die
// Grafikkarte kurz aufhalten, dann steht das Bild still (es sieht noch genau aus wie vorher), statt dass die Animation
// gleich am Anfang hängt
const painted = async () => { await nextFrame(); await nextFrame(); };
// Bühne: das Buch kommt zum Aufklappen etwas größer in die Mitte, der Rücken mittig (Einband klappt nach links auf).
// Offen ist es zwei Seiten breit, das muss ins Fenster passen (je Seite höchstens 44 % der Breite) und in der Höhe
// unter den Kopf; schmaler wird es nur, wenn sonst nichts geht
function stageRect(r) {
  const w = Math.min(r.width * 1.3, innerWidth * 0.44, (innerHeight - 180) * r.width / r.height), h = w * r.height / r.width;
  return { left: innerWidth / 2 - w * 0.04, top: Math.max(96, (innerHeight - h) / 2), width: w, height: h };
}
// offenes Buch größer um den Rücken (linke Kante) herum: wirkt, als käme man näher
const grown = (r, k) => ({ left: r.left, top: r.top + r.height * (1 - k) / 2, width: r.width * k, height: r.height * k });

async function bookOpenFx(from, id, fx) {
  const book = homeData.books.find(b => b.id === id), r0 = rectOf(from.querySelector('.cv')), r1 = stageRect(r0);
  // 1. vorbereiten: Standbild des Regals, Buch als Kopie, darunter die Buchansicht fertig aufbauen (noch unsichtbar)
  const snap = snapshot(fx);
  snap.querySelector(`.book[data-id="${id}"]`).style.visibility = 'hidden';
  const bk = fxBook(fx, book, r0), lid = bk.querySelector('.lid');
  homeBook = id; await renderHome(true);
  const grid = $('#grid'), head = $('#home header'), items = [...grid.children];
  items.forEach(e => e.style.visibility = 'hidden');
  await decoded(grid); await painted();
  // 2. los: Regal blendet aus (der neue Kopf erst danach, nicht übereinander), Buch fliegt in die Mitte und klappt auf
  snap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
  head.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 340, delay: 200, easing: 'ease-out', fill: 'backwards' });
  bk.animate([{ transform: 'none' }, { transform: toRect(r0, r1) }], sp(spring(0.06, 520), { fill: 'forwards' }));
  tiltOf(bk).animate([{ transform: FLAT }, { transform: TILT }], sp(spring(0.04, 640), { fill: 'forwards' }));   // neigt sich: wird räumlich
  cutOf(bk).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
  const tOpen = 110, dOpen = 680;
  lid.animate([{ transform: SHUT }, { transform: OPEN }], { duration: dOpen, delay: tOpen, easing: LID, fill: 'forwards' });
  shadeOf(bk).animate([{ opacity: 0 }, { opacity: 1 }], { duration: dOpen * 0.3, delay: tOpen + dOpen * 0.7, easing: 'ease-in-out', fill: 'both' });
  bendBook(bk, true, { duration: dOpen, delay: tOpen, easing: LID });
  // 3. das offene Buch kommt etwas näher und löst sich auf; die Seiten erscheinen dabei ruhig an ihren Plätzen,
  //    der Reihe nach (leicht von unten, kaum merklich größer werdend)
  const tf = tOpen + dOpen - 100;
  bk.animate([{ transform: toRect(r0, r1) }, { transform: toRect(r0, grown(r1, 1.1)) }], { duration: 600, delay: tf, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
  const gone = fadeBook(bk, 1, 0, { duration: 440, delay: tf, easing: 'ease-out' }).finished;
  items.forEach((e, i) => {
    e.style.visibility = '';
    e.animate([{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: tf + 80 + Math.min(i, 12) * 35, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
  });
  await gone;
}

async function bookCloseFx(id, fx) {
  const book = homeData.books.find(b => b.id === id); if (!book) { renderHome(); return; }
  // 1. vorbereiten: Standbild der Buchansicht, darunter das Regal fertig aufbauen (noch unsichtbar)
  const grid = $('#grid'), snap = snapshot(fx);
  homeBook = null; await renderHome(true);
  const target = grid.querySelector(`.book[data-id="${id}"]`);
  if (!target) { snap.remove(); return; }
  let r0 = rectOf(target.querySelector('.cv'));
  if (r0.bottom > innerHeight - 20 || r0.top < rectOf(grid).top) { grid.scrollTop += r0.top - rectOf(grid).top - 40; r0 = rectOf(target.querySelector('.cv')); }
  const others = [...grid.children].filter(e => e !== target), head = $('#home header');
  target.style.visibility = 'hidden'; others.forEach(e => e.style.visibility = 'hidden');
  await decoded(grid);
  // das Buch erst jetzt anlegen, gleich mit seiner Startlage: offen, etwas näher, unsichtbar
  const r1 = stageRect(r0), bk = fxBook(fx, book, r0), lid = bk.querySelector('.lid');
  lid.style.transform = OPEN; bk.style.transform = toRect(r0, grown(r1, 1.1));
  tiltOf(bk).style.transform = TILT; cutOf(bk).style.opacity = 0;
  // 2. los: die Seiten blenden aus (der Regal-Kopf erst danach), das offene Buch kommt aus der Nähe in die Mitte
  snap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
  head.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 340, delay: 220, easing: 'ease-out', fill: 'backwards' });
  fadeBook(bk, 0, 1, { duration: 300, delay: 60, easing: 'ease-out' });
  bk.animate([{ transform: toRect(r0, grown(r1, 1.1)) }, { transform: toRect(r0, r1) }], sp(spring(0, 480), { delay: 60, fill: 'both' }));
  // 3. zuklappen, dann an den Platz im Regal; das Regal kommt dabei herein
  const tc = 340, dClose = 540, tb = tc + dClose * 0.62;
  lid.animate([{ transform: OPEN }, { transform: SHUT }], { duration: dClose, delay: tc, easing: LID, fill: 'forwards' });
  shadeOf(bk).animate([{ opacity: 1 }, { opacity: 0 }], { duration: dClose * 0.3, delay: tc, easing: 'ease-in-out', fill: 'both' });
  bendBook(bk, false, { duration: dClose, delay: tc, easing: LID });
  others.forEach((e, i) => { e.style.visibility = ''; e.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: tb + Math.min(i, 8) * 28, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }); });
  const home = spring(0.08, 480), back = bk.animate([{ transform: toRect(r0, r1) }, { transform: 'none' }], sp(home, { delay: tb, fill: 'forwards' }));
  tiltOf(bk).animate([{ transform: TILT }, { transform: FLAT }], sp(spring(0.04, 520), { delay: tb, fill: 'forwards' }));   // stellt sich wieder gerade hin
  cutOf(bk).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: tb + home.settled * 0.5, fill: 'forwards' });
  await wait(tb + home.settled);
  target.style.visibility = ''; back.cancel(); bk.remove();   // sichtbar angekommen: das echte Buch übernimmt
  target.querySelector('.cap').animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  await wait(220);
}

// Neues Buch: der Einband fliegt aus dem Dialog an seinen Platz im Regal, die anderen rücken weich nach; dann geht es auf
async function bookCreateFx(b, from, fx) {
  const grid = $('#grid'), key = e => e.dataset.id || e.className, before = new Map([...grid.children].map(e => [key(e), rectOf(e)]));
  homeBook = null; await renderHome(true);
  const el = grid.querySelector(`.book[data-id="${b.id}"]`); if (!el) return;
  let r0 = rectOf(el.querySelector('.cv'));
  const jump = r0.bottom > innerHeight - 20;
  if (jump) { grid.scrollTop += r0.bottom - innerHeight + 60; r0 = rectOf(el.querySelector('.cv')); }
  el.style.visibility = 'hidden';
  const bk = fxBook(fx, b, r0);
  if (!from) from = { left: innerWidth / 2 - r0.width / 2, top: innerHeight / 2 - r0.height / 2, width: r0.width, height: r0.height };
  bk.style.transform = toRect(r0, from);
  // Nachrücken (FLIP): jedes Element startet an seiner alten Stelle
  if (!jump) for (const e of grid.children) {
    const r = before.get(key(e)); if (!r || e === el) continue;
    const n = rectOf(e), dx = r.left - n.left, dy = r.top - n.top;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], sp(spring(0.12, 460)));
  }
  // der Einband fliegt mit leichtem Nachfedern an seinen Platz; sobald er sichtbar sitzt, übernimmt das echte Buch
  const cap = el.querySelector('.cap'), land = spring(0.12, 500), fly = bk.animate([{ transform: toRect(r0, from) }, { transform: 'none' }], sp(land, { fill: 'forwards' }));
  cap.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: land.settled * 0.5, easing: 'ease-out', fill: 'backwards' });
  await wait(land.settled * 0.85);
  el.style.visibility = ''; fly.cancel(); bk.remove();
  await wait(80);   // kurz innehalten, dann geht das neue Buch auf
  await bookOpenFx(el, b.id, fx);
}

/* Aufwärmen: Das erste Öffnen eines Buchs nach dem Start ruckelte stark (Hänger bis 200 ms). Beim ersten Zeichnen des
   3D-Buchs übersetzt die Grafikkarte ihre Zeichenprogramme (unter Windows etwa 70, je einige ms, auf dem Surface länger)
   und hält so lange an, nach jedem Start von Neuem (ihr Zwischenspeicher hilft da nicht). Darum spielt die App kurz
   nach dem Start, wenn nichts los ist, das Aufklappen einmal unsichtbar ab (Deckkraft fast 0, keine Klicks): danach sind
   die Programme übersetzt und das echte Öffnen läuft flüssig. */
let warmed = false;
function scheduleWarmUp() {
  if (warmed) return;
  setTimeout(() => idle(() => warmUpBookFx().catch(() => {}), { timeout: 2000 }), 400);
}
async function warmUpBookFx() {
  if (warmed || homeAnim || S.note || reduceMotion() || $('#home').classList.contains('hidden')) return;
  warmed = true;
  const cv = $('#grid .book .cv'), book = (cv && homeData.books.find(b => b.id === cv.parentElement.dataset.id)) || { name: DEFAULT_BOOK, color: 'blue' };
  const r0 = cv ? rectOf(cv) : { left: innerWidth / 2 - 80, top: innerHeight / 2 - 107, width: 160, height: 213 };
  const fx = document.createElement('div'); fx.dataset.warm = '';   // enthält Kopien der Startseite (gleiche ids, wie beim Standbild)
  Object.assign(fx.style, { position: 'fixed', inset: 0, zIndex: 29, pointerEvents: 'none', opacity: 0.004 });
  document.body.appendChild(fx);
  try {
    // wie beim echten Öffnen: unten die Buchansicht (Kopf und Seitenkarten), darüber das Regal, das ausblendet
    const view = $('#home').cloneNode(true), shelf = $('#home').cloneNode(true), vg = view.querySelector('#grid');
    vg.innerHTML = ''; if (book.id) renderBook(vg, book, homeData.notes, view);
    fx.append(view, shelf);
    shelf.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    [...vg.children].forEach((e, i) => e.animate([{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 200 + Math.min(i, 6) * 30, fill: 'backwards' }));
    const r1 = stageRect(r0), bk = fxBook(fx, book, r0), lid = bk.querySelector('.lid'), o = { duration: 360, fill: 'forwards' };
    bk.animate([{ transform: 'none' }, { transform: toRect(r0, r1) }], o);
    tiltOf(bk).animate([{ transform: FLAT }, { transform: TILT }], o);
    cutOf(bk).animate([{ opacity: 1 }, { opacity: 0 }], o);
    lid.animate([{ transform: SHUT }, { transform: OPEN }], o);
    shadeOf(bk).animate([{ opacity: 0 }, { opacity: 1 }], o);
    bendBook(bk, true, { duration: 360 });
    await wait(400);
    await fadeBook(bk, 1, 0, { duration: 300 }).finished;
  } finally { fx.remove(); }
}

/* Menüs der Startseite (⋯ an Büchern und Seiten) */
let homeMenuKey = null, homeMenuBtn = null;
function homeMenu(btn, key, items) {
  const open = isOpen($('#homeMenu')) && homeMenuKey === key;
  closeMenus(); if (open) return;
  homeMenuKey = key; homeMenuBtn = btn; btn.classList.add('on'); fillMenu(items);
}
function fillMenu(items) {
  const m = $('#homeMenu'), opening = !isOpen(m); m.innerHTML = '';   // nur beim Öffnen aufploppen, nicht beim Wechsel ins Untermenü
  for (const it of items) {
    if (it === '-') { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button'); if (it.cls) b.className = it.cls;
    if (it.icon) b.innerHTML = `<svg class="i"><use href="#${it.icon}"/></svg>`;
    if (it.chip) { const c = document.createElement('span'); c.className = 'chip'; coverVars(c, it.chip); b.appendChild(c); }
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = it.label; b.appendChild(l);
    if (it.sub) { const t = document.createElement('span'); t.className = 'sub'; t.textContent = it.sub; b.appendChild(t); }
    if (it.more) b.insertAdjacentHTML('beforeend', '<svg class="i"><use href="#ic-chev"/></svg>');
    b.onclick = it.keep ? it.run : () => { closeMenus(); it.run(); };
    m.appendChild(b);
  }
  m.classList.remove('hidden');
  const r = homeMenuBtn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
  let top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - 6 - h);
  m.style.top = top + 'px'; m.style.left = clamp(r.right - w, 8, innerWidth - w - 8) + 'px';
  if (opening) popIn(m, homeMenuBtn);   // geht es über dem Knopf auf, kommt es von unten
}
function bookMenu(b, btn) {
  homeMenu(btn, 'b:' + b.id, [
    { icon: 'ic-edit', label: 'Umbenennen / Farbe', run: () => editBook(b) },
    '-',
    { icon: 'ic-trash', label: 'Löschen', cls: 'del', run: () => deleteBook(b) },
  ]);
}
function pageMenu(n, book, btn) {
  const main = [
    { icon: 'ic-edit', label: 'Umbenennen', run: () => renamePage(n) },
    { icon: 'ic-move', label: 'In anderes Buch verschieben', more: true, keep: true, run: () => fillMenu(moveTo()) },
    '-',
    { icon: 'ic-trash', label: 'Löschen', cls: 'del', run: () => deletePage(n) },
  ];
  const moveTo = () => {
    const cnt = new Map(); for (const x of homeData.notes) cnt.set(x.book, (cnt.get(x.book) || 0) + 1);
    const others = homeData.books.filter(b => b.id !== book.id).sort(byCreated);
    return [
      { icon: 'ic-back', label: 'Verschieben nach …', cls: 'head', keep: true, run: () => fillMenu(main) },
      ...others.map(b => ({ chip: b.color, label: b.name, sub: pagesWord(cnt.get(b.id) || 0), run: () => movePage(n, b) })),
      '-',
      { icon: 'ic-plus', label: 'Neues Buch …', run: () => movePageToNew(n) },
    ];
  };
  homeMenu(btn, 'p:' + n.id, main);
}
// Neue Bücher bekommen eine Farbe, die es im Regal noch nicht gibt
function freeColor() {
  const used = new Set(homeData.books.map(b => b.color)), keys = Object.keys(BOOK_COLORS);
  return keys.find(k => !used.has(k)) || keys[homeData.books.length % keys.length];
}
async function createBook() {
  const r = await askBook('Neues Buch', 'Neues Buch', freeColor(), 'Anlegen'); if (!r) return null;
  const b = { id: uid(), name: r.name, color: r.color, created: Date.now() };
  try { await dbBookPut(b); } catch (e) { toast('Speichern nicht möglich: ' + e.message, 5000); return null; }
  return b;
}
async function newBook() {
  if (navBusy || S.note || homeAnim) return;
  lastCoverRect = null;
  const b = await createBook(); if (!b) return;
  if (reduceMotion() || homeAnim) { homeBook = b.id; renderHome(); return; }   // das neue Buch gleich öffnen
  animate(fx => bookCreateFx(b, lastCoverRect, fx));
}
async function editBook(b) {
  const r = await askBook('Buch bearbeiten', b.name, b.color, 'Speichern'); if (!r) return;
  try { await dbBookPut({ ...b, name: r.name, color: r.color }); } catch (e) { toast('Speichern nicht möglich: ' + e.message, 5000); }
  renderHome();
}
async function deleteBook(b) {
  let pages = [];
  try { pages = (await dbIndexAll()).filter(n => n.book === b.id); } catch (e) { toast('Speicher nicht verfügbar: ' + e.message, 5000); return; }
  const msg = pages.length ? `Buch „${b.name}“ mit ${pagesWord(pages.length)} löschen? Das kann nicht rückgängig gemacht werden.` : `Buch „${b.name}“ löschen?`;
  if (!await askYes(msg, { ok: 'Löschen', danger: true })) return;
  if (navBusy) return;
  navBusy = true;   // solange keine Seite öffnen
  try {
    const all = (await dbIndexAll()).filter(n => n.book === b.id);   // auch Seiten, die seit der Rückfrage dazukamen
    await dbDeleteNotes(all.map(n => n.id), b.id);
  } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 5000); }
  navBusy = false;
  if (homeBook === b.id) homeBook = null;
  renderHome();
}
async function renamePage(n) {
  if (navBusy) return;
  const nm = await ask('Seite umbenennen', n.name, true, { ok: 'Umbenennen' });
  if (!nm || !nm.trim()) return;
  try { await dbIndexPut({ ...n, name: nm.trim() }); } catch (e) { toast('Speichern nicht möglich: ' + e.message, 5000); }
  renderHome();
}
async function deletePage(n) {
  if (navBusy) return;
  if (!await askYes(`„${n.name}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`, { ok: 'Löschen', danger: true })) return;
  try { await dbDeleteNote(n.id); } catch (e) { toast('Löschen fehlgeschlagen: ' + e.message, 5000); }
  renderHome();
}
async function movePage(n, b) {
  if (navBusy) return;
  try { await dbIndexPut({ ...n, book: b.id }); } catch (e) { toast('Verschieben fehlgeschlagen: ' + e.message, 5000); return; }
  toast(`„${n.name}“ ist jetzt im Buch „${b.name}“`); renderHome();
}
async function movePageToNew(n) { const b = await createBook(); if (b) movePage(n, b); }
async function newPage() {
  if (navBusy || S.note) return;
  let fmt;
  try {
    // Format abfragen, vorausgewählt wie die letzte Seite im Buch (sonst wie zuletzt gewählt)
    const { books, notes } = await ensureBooks(), book = books.find(b => b.id === homeBook);
    const last = book && notes.filter(x => x.book === book.id).sort(byCreated).pop();
    const st = store.get('paper', {}), was = last ? (last.paper && PAPER[last.paper.f] ? last.paper : { f: 'inf', o: st.o }) : st;
    fmt = await askPage({ f: PAPER[was.f] ? was.f : 'inf', o: was.o === 'l' ? 'l' : 'p', ...(was.t === 'cornell' ? { t: 'cornell' } : {}) });
  } catch (e) { toast('Speicher nicht verfügbar: ' + e.message, 5000); return; }
  if (!fmt || navBusy || S.note) return;
  store.set('paper', fmt);
  navBusy = true;
  let n;
  try {
    const { books, notes } = await ensureBooks();
    let book = books.find(b => b.id === homeBook) || books.sort(byCreated)[0];
    if (!book) { book = { id: uid(), name: DEFAULT_BOOK, color: 'blue', created: Date.now() }; await dbBookPut(book); }
    const pages = notes.filter(x => x.book === book.id).sort(byCreated), prev = pages[pages.length - 1], now = Date.now();
    // neue Seite immer ans Ende, mit dem Hintergrund der letzten Seite (z. B. kariert in Mathe)
    n = { id: uid(), name: 'Seite ' + (pages.length + 1), created: Math.max(now, prev ? (prev.created || 0) + 1 : 0), updated: now,
      thumb: null, bg: (prev && prev.bg) || 'dots', view: { tx: 0, ty: 0, z: 1 }, book: book.id };
    if (PAPER[fmt.f]) { n.paper = { f: fmt.f, o: fmt.o, ...(fmt.t === 'cornell' ? { t: 'cornell' } : {}) }; n.view = null; }   // Blatt: beim Öffnen ganz zeigen
    await dbIndexPut(n); homeBook = book.id;
  } catch (e) { toast('Speichern nicht möglich: ' + e.message, 5000); navBusy = false; return; }
  navBusy = false;
  openNote(n);
}
$('#hNewBook').onclick = newBook;
$('#hNew').onclick = newPage;
$('#hShelf').onclick = showShelf;
$('#hBookMenu').onclick = () => { const b = homeData.books.find(x => x.id === homeBook); if (b) bookMenu(b, $('#hBookMenu')); };
$('#grid').addEventListener('scroll', () => { if (!$('#homeMenu').classList.contains('hidden')) closeMenus(); }, { passive: true });
// Ist ein Menü offen, schließt der erste Tipp daneben nur das Menü (öffnet nicht versehentlich ein Buch)
let homeSwallow = false;
window.addEventListener('pointerdown', e => {
  homeSwallow = !$('#home').classList.contains('hidden') && isOpen($('#homeMenu')) && !e.target.closest('.menu,.mbtn,#dlg');
}, true);
$('#home').addEventListener('click', e => { if (homeSwallow) { homeSwallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
let navBusy = false;
async function openNote(meta) {
  if (navBusy || S.note) return; navBusy = true;
  try {
    // aktueller Stand aus dem Speicher (die Karte kann älter sein: verschoben, umbenannt, gelöscht)
    const fresh = await dbIndexGet(meta.id);
    if (!fresh) { navBusy = false; toast('Diese Seite gibt es nicht mehr'); renderHome(); return; }
    Object.assign(meta, fresh);
    let items = await dbItems(meta.id);
    items.sort((a, b) => a.o - b.o);
    let renumber = false;
    for (let i = 1; i < items.length; i++) if (!(items[i].o - items[i - 1].o > 1e-7)) { renumber = true; break; }
    // Bilder, die gleich zu sehen sind: kurz (höchstens 150 ms) auf ihre kleine Fassung warten, damit das erste Zeichnen
    // sie schon hat (sonst erst graue Flächen und gleich alles noch einmal); die volle Fassung lädt, falls nötig, gleich mit
    { const v = meta.view || { tx: 0, ty: 0, z: 1 }, vb = [-v.tx / v.z, -v.ty / v.z, (innerWidth - v.tx) / v.z, (innerHeight - v.ty) / v.z];
      const vis = items.filter(it => it.t === 'i' && boxHit(itemBox(it), vb));
      if (vis.length) {
        await Promise.race([Promise.all(vis.map(it => imgEntry(it.img).ready)), new Promise(r => setTimeout(r, 150))]);
        for (const it of vis) { const e = imgEntry(it.img); if (e.low && it.w * v.z * DPR > e.low.width * 1.3) wantFull(it.img, e); }
      } }
    S.note = meta; S.items = items; S.saved = new Map(items.map(i => [i.id, i])); S.savedList = items;
    if (renumber) { items.forEach((it, i) => it.o = i); S.saved = new Map(); S.savedList = []; }
    S.view = meta.view ? { ...meta.view } : { tx: 0, ty: 0, z: 1 }; S.level = S.view.z;
    S.undo = []; S.redo = []; S.sel = null; action = null; S.thumbDirty = false; S.cornellHide = false;
    clearTiles(); pathCache.clear();
    $('#title').value = meta.name; xpTitle();
    if (!$('#home').classList.contains('hidden')) homeScroll = { key: homeKey, top: $('#grid').scrollTop };
    closeMenus(); $('#home').classList.add('hidden'); $('#editor').classList.remove('hidden');
    updateUndo(); setTool(S.tool === 'hand' ? 'pen' : S.tool); resize();
    $('#bSheet').classList.toggle('hidden', !paperSize()); $('#sheetNo').classList.toggle('hidden', !paperSize()); fitBar();
    if (!meta.view) fitAll(0);   // neue Seite mit Format: das ganze erste Blatt zeigen
    if (renumber) markDirty();
  } catch (e) { toast('Notiz konnte nicht geöffnet werden: ' + e.message, 6000); S.note = null; }
  navBusy = false;
}
async function flushNote() {
  if (!S.note) return;
  if (action) endAction(action.kind === 'draw' && action.pts.length < 6);
  await saveNow();   // zuerst die Striche (Electron wartet beim Schließen nicht beliebig lange), dann das Vorschaubild
  if (S.thumbDirty && S.note) { try { S.note.thumb = await makeThumb(); S.thumbDirty = false; } catch (e) {} await saveNow(); }
}
async function closeNote() {
  if (!S.note || navBusy) return;
  if (ncCur) closeMenus();
  if (txEd) commitText();
  dropOverview();
  if (S.busy) { toast('Bitte warten, bis der Import fertig ist'); return; }
  navBusy = true;
  clearSel();
  await flushNote();
  if (S.saveError) { navBusy = false; toast('Die Notiz konnte nicht gespeichert werden und bleibt offen: ' + S.saveError.message, 7000); return; }
  // Bilder, die in der Notiz nicht mehr vorkommen, aus dem Speicher entfernen
  const note = S.note, used = new Set(S.items.filter(i => i.t === 'i').map(i => i.img));
  for (const it of S.items) if (it.nt) for (const id of noteImgs(it.nt)) used.add(id);   // Bilder der Erklärungen
  S.note = null; S.items = []; S.saved = new Map(); S.savedList = null; S.undo = []; S.redo = [];
  clearTiles(); pathCache.clear(); releaseImages();
  $('#editor').classList.add('hidden'); $('#home').classList.remove('hidden');
  navBusy = false;
  homeBook = note.book || null;   // zurück in das Buch dieser Seite (ohne gültiges Buch: Regal)
  renderHome();
  try {
    const tx = db.transaction('images', 'readwrite'), st = tx.objectStore('images');
    st.index('n').openKeyCursor(IDBKeyRange.only(note.id)).onsuccess = ev => { const c = ev.target.result; if (c) { if (!used.has(c.primaryKey)) st.delete(c.primaryKey); c.continue(); } };
  } catch (e) {}
}
window.__flush = () => { syncNoteCard(); if (txEd) commitText(); return flushNote().catch(() => {}); };
$('#bBack').onclick = closeNote;
$('#title').addEventListener('input', () => { if (S.note) { S.note.name = $('#title').value.trim() || 'Ohne Titel'; markDirty(); } xpTitle(); fitBar(); });
$('#title').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });
/* Sicherung: eine Textdatei mit einer Zeile pro Buch, Notiz, Stricheliste und Bild.
   So entsteht nie ein einzelner riesiger Text, auch bei vielen PDFs.
   Format 3: Kopfzeile, dann {k:'book'} je Buch, {k:'shape'} je eigene Form, dann je Notiz {k:'note'} (mit book),
   {k:'items'}, {k:'img'}. */
function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
$('#hBackup').onclick = async () => {
  if (navBusy) return;
  try {
    const { books, notes: metas } = await ensureBooks(), shapes = (await dbShapesAll()).sort(byCreated);
    if (!metas.length && !books.length && !shapes.length) { toast('Es gibt noch nichts zu sichern'); return; }
    toast('Sicherung wird erstellt …', 0);
    const parts = [JSON.stringify({ app: 'notizen', format: 3, saved: Date.now() }) + '\n'];
    for (const b of books.sort(byCreated)) parts.push(JSON.stringify({ k: 'book', ...b }) + '\n');
    for (const r of shapes) parts.push(JSON.stringify({ k: 'shape', ...r, strokes: r.strokes.map(st => ({ ...st, pts: Array.from(st.pts, v => Math.round(v * 100) / 100) })) }) + '\n');
    for (const m of metas) {
      parts.push(JSON.stringify({ k: 'note', ...m }) + '\n');
      const items = (await dbItems(m.id)).map(it => it.t === 's' ? { ...it, pts: Array.from(it.pts, v => Math.round(v * 100) / 100) } : it);
      parts.push(JSON.stringify({ k: 'items', n: m.id, items }) + '\n');
      const imgs = await reqP(db.transaction('images').objectStore('images').index('n').getAll(m.id));
      for (const im of imgs) parts.push(JSON.stringify({ k: 'img', id: im.id, n: im.n, w: im.w, h: im.h, data: await blobToDataURL(im.blob) }) + '\n');
    }
    download(new Blob(parts, { type: 'application/x-ndjson' }), 'Notizen-Sicherung-' + new Date().toISOString().slice(0, 10) + '.notizen');
    const what = [metas.length || books.length ? booksWord(books.length) + ' mit ' + pagesWord(metas.length) : '', shapes.length ? shapesWord(shapes.length) : ''];
    toast(what.filter(Boolean).join(' und ') + ' gesichert');
  } catch (e) { toast('Sicherung fehlgeschlagen: ' + e.message, 6000); }
};
async function* fileLines(file) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value; let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) yield line; }
  }
  if (buf.trim()) yield buf;
}
// Eigene Form aus einer Sicherung prüfen und in die gespeicherte Form bringen (Punkte als Float32Array)
function shapeFromBackup(r) {
  if (typeof r.id !== 'string' || !r.id || !Array.isArray(r.strokes)) return null;
  const strokes = r.strokes.filter(st => st && Array.isArray(st.pts) && st.pts.length >= 3 && st.pts.length % 3 === 0 && st.pts.every(Number.isFinite))
    .map(st => ({ c: typeof st.c === 'string' ? st.c : 'ink', w: st.w > 0 ? +st.w : 2, hl: !!st.hl, pts: Float32Array.from(st.pts),
      ...(st.al > 0 && st.al <= 1 ? { al: +st.al } : {}), ...(validFl(st.fl, st.pts.length / 3) ? { fl: st.fl.map(r => [r[0], r[1]]) } : {}), ...(st.ds === 'dash' || st.ds === 'dot' ? { ds: st.ds } : {}), ...(FILLS.includes(st.fs) && st.fs !== 'none' ? { fs: st.fs } : {}) }));
  if (!strokes.length) return null;
  const [x0, y0] = geoBox(strokes);
  if (x0 || y0) for (const st of strokes) for (let i = 0; i < st.pts.length; i += 3) { st.pts[i] -= x0; st.pts[i + 1] -= y0; }
  const b = geoBox(strokes);
  return { id: r.id, name: String(r.name || 'Form').slice(0, 80), created: +r.created || Date.now(), w: b[2], h: b[3], strokes };
}
async function writeRecords(meta, items, images, replace) {
  const tx = db.transaction(['index', 'items', 'images'], 'readwrite');
  const its = tx.objectStore('items');
  if (replace) its.delete(IDBKeyRange.bound([meta.id], [meta.id, []]));   // vor dem Schreiben, in derselben Transaktion
  if (meta) tx.objectStore('index').put(meta);
  for (const it of items || []) its.put(it);
  for (const im of images || []) tx.objectStore('images').put(im);
  return txDone(tx);
}
if (IOS) $('#fRestore').removeAttribute('accept');   // iPadOS kennt .notizen nicht und würde die Sicherungen ausgrauen
$('#hRestore').onclick = () => $('#fRestore').click();
$('#fRestore').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || navBusy) return;
  navBusy = true; toast('Sicherung wird geladen …', 0);
  let count = 0, same = 0, books = 0, shapes = 0;
  try {
    const noteMap = new Map(), imgMap = new Map();
    const mapImg = (n, id) => { if (!noteMap.get(n)?.copy) return id; if (!imgMap.has(id)) imgMap.set(id, uid()); return imgMap.get(id); };
    let first = true;
    for await (const line of fileLines(f)) {
      const r = JSON.parse(line);
      if (first) {
        first = false;
        if (Array.isArray(r.notes)) {          // alte Sicherung (Version 1)
          for (const n of r.notes) { const { meta, items, images } = legacyToRecords(n); const ex = await dbIndexGet(meta.id); if (ex && ex.updated > meta.updated) { meta.id = uid(); meta.name += ' (Sicherung)'; items.forEach(i => i.n = meta.id); images.forEach(i => i.n = meta.id); } await writeRecords(meta, items, images, true); count++; }
          break;
        }
        if (r.app !== 'notizen') throw new Error('keine Notizen-Sicherung');
        continue;
      }
      if (r.k === 'book') {
        const { k, ...bk } = r;
        if (typeof bk.id === 'string' && bk.id && !(await dbBookGet(bk.id))) {
          await dbBookPut({ ...bk, name: String(bk.name || 'Buch'), color: BOOK_COLORS[bk.color] ? bk.color : 'blue', created: +bk.created || Date.now() });
          books++;
        }
      } else if (r.k === 'shape') {   // eigene Form: nur neue (unbekannte id) dazunehmen
        const rec = shapeFromBackup(r);
        if (rec && !(await dbShapeGet(rec.id))) { await dbShapePut(rec); shapes++; }
      } else if (r.k === 'note') {
        // Geschrieben wird erst mit der Stricheliste, in einer Transaktion: bricht die Datei ab, bleibt die Seite unverändert
        const { k, ...meta } = r, ex = await dbIndexGet(meta.id);
        if (ex && ex.updated === meta.updated) { noteMap.set(meta.id, { skip: true }); same++; continue; }   // unverändert: Name und Buch hier behalten
        const copy = !!(ex && ex.updated > meta.updated), newId = copy ? uid() : meta.id;
        if (copy) meta.name += ' (Sicherung)';
        if (ex && !copy && !('book' in meta)) meta.book = ex.book;   // ältere Sicherung: die Seite bleibt in ihrem Buch
        meta.id = newId;
        noteMap.set(r.id, { id: newId, copy, meta, replace: !copy, done: false });
      } else if (r.k === 'items') {
        const m = noteMap.get(r.n); if (!m || m.skip || m.done) continue;
        const items = r.items.map(it => ({ ...it, n: m.id, ...(it.t === 's' ? { pts: Float32Array.from(it.pts), ...(it.nt ? { nt: { ...it.nt, ...(it.nt.img ? { img: mapImg(r.n, it.nt.img) } : {}), ...(it.nt.imgs ? { imgs: it.nt.imgs.map(id => mapImg(r.n, id)) } : {}) } } : {}) } : it.t === 'i' ? { img: mapImg(r.n, it.img) } : {}) }));
        await writeRecords(m.meta, items, [], m.replace); m.done = true; count++;
      } else if (r.k === 'img') {
        const m = noteMap.get(r.n); if (!m || m.skip) continue;
        await writeRecords(null, [], [{ id: mapImg(r.n, r.id), n: m.id, blob: dataURLToBlob(r.data), low: null, w: r.w || 0, h: r.h || 0 }], false);
      }
    }
    for (const m of noteMap.values()) if (!m.skip && !m.done && !(await dbIndexGet(m.id))) { await writeRecords(m.meta, [], [], false); count++; }   // Seite ohne Striche
    const extra = [books ? (books === 1 ? '1 neues Buch' : books + ' neue Bücher') : '', shapes ? shapesWord(shapes) : ''].filter(Boolean).join(', ');
    toast((count || !same ? pagesWord(count) + ' wiederhergestellt' : 'Alles war schon da') + (extra ? ' (' + extra + ')' : '') + (same && count ? ', ' + pagesWord(same) + ' unverändert' : ''));
  } catch (err) { toast('Datei konnte nicht geladen werden: ' + err.message, 6000); }
  if (shapes) await loadCustomShapes();
  navBusy = false;
  if (books) homeBook = null;   // neue Bücher stehen im Regal
  renderHome();   // ordnet Seiten ohne Buch (ältere Sicherungen) dem Buch „Meine Notizen“ zu
};
document.addEventListener('visibilitychange', () => { if (document.hidden && S.note) { syncNoteCard(); flushNote(); } });
window.addEventListener('pagehide', () => { if (S.note) { syncNoteCard(); if (txEd) commitText(); saveNow(); } });

/* ---------- Start ---------- */
applyDark(); applyTheme();
openDB().then(() => { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); loadCustomShapes(); renderHome().then(scheduleWarmUp); })
  .catch(e => { $('#grid').innerHTML = '<div id="empty">Der Speicher ist nicht verfügbar (' + e.message + ').<br>Bitte nicht im privaten Fenster öffnen.</div>'; });
// Browser-Version im Netz (GitHub Pages): Offline-Start über sw.js; das Windows-Programm lädt die Datei lokal
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
