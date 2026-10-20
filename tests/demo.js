// Gemeinsame Hilfen für books.js / shot.js: Demo-Daten mit echten Vorschaubildern
exports.seed = async (p, opts = {}) => p.evaluate(async opts => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const scribble = (x0, y0, words, seed) => {
    const out = []; let x = x0, r = seed;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let w = 0; w < words; w++) {
      const pts = [], n = 8 + Math.floor(rnd() * 14), h = 7 + rnd() * 5;
      for (let i = 0; i <= n * 6; i++) { const t = i / 6; pts.push(x + t * 4.2 + Math.cos(t * 2.4) * 2.2, y0 - Math.abs(Math.sin(t * 1.2)) * h + Math.sin(t * 0.7) * 1.5, 0.45 + 0.2 * Math.sin(t)); }
      out.push(makeStroke(pts, 'ink', 2, false)); x += n * 4.2 + 12 + rnd() * 8;
    }
    return out;
  };
  const page = async (book, name, build, created) => {
    const now = created || Date.now();
    const n = { id: uid(), name, created: now, updated: now, thumb: null, bg: build.bg || 'dots', view: { tx: 0, ty: 0, z: 1 }, book };
    await dbIndexPut(n); await openNote(n);
    const items = build(); if (items.length) commit(appendItems(S.items, items));
    await closeNote(); await sleep(30);
    return n;
  };
  const text = (lines, color) => () => { let all = []; for (let l = 0; l < lines; l++) all = all.concat(scribble(40, 60 + l * 34, 5 + (l * 7) % 5, l * 17 + 3)); if (color) all.push(makeStroke([40, 66, .5, 330, 66, .5], color, 3, false)); return all; };
  const graph = () => () => {
    const a = [makeStroke([60, 300, .5, 420, 300, .5], 'ink', 2), makeStroke([240, 60, .5, 240, 420, .5], 'ink', 2)], pts = [];
    for (let x = -170; x <= 170; x += 4) pts.push(240 + x, 300 - x * x / 140, .5);
    a.push(makeStroke(pts, '#1e88e5', 3)); a.push(...scribble(40, 40, 3, 5)); return a;
  };
  const books = opts.books || [['Mathe', 'blue'], ['Physik', 'teal'], ['Deutsch', 'red'], ['Englisch', 'orange'], ['Biologie', 'green'], ['Geschichte', 'mustard'], ['Chemie', 'purple'], ['Tagebuch', 'pink'], ['Elektrotechnik und Informationstechnik', 'graphite']];
  const ids = {}; let t = Date.now() - 1e8;
  for (const [name, color] of books) { const b = { id: uid(), name, color, created: t += 1000 }; await dbBookPut(b); ids[name] = b.id; }
  if (opts.pages !== false) {
    await page(ids.Mathe, 'Seite 1', graph(), t += 1000);
    await page(ids.Mathe, 'Ableitungen', text(9, '#e53935'), t += 1000);
    await page(ids.Mathe, 'Seite 3', Object.assign(text(5), { bg: 'grid' }), t += 1000);
    await page(ids.Mathe, 'Integralrechnung – Übungen zur Klausur', text(12), t += 1000);
    await page(ids.Mathe, 'Seite 5', () => [], t += 1000);
    await page(ids.Physik, 'Seite 1', text(6, '#43a047'), t += 1000);
    await page(ids.Deutsch, 'Erörterung', Object.assign(text(10), { bg: 'lines' }), t += 1000);
    await page(ids.Deutsch, 'Seite 2', text(4), t += 1000);
  }
  return ids;
}, opts);
