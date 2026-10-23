// Vergleich: Live-Strich vs. Strich nach Neuzeichnen der Kacheln (z. B. nach Zoomen)
const { chromium } = require('playwright'); const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */   /* ab 1.4: Seiten liegen in Büchern */ await p.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(p);
  const send = (type, x, y, f = .6) => cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, force: f });
  // Handschrift-artig: Schleifen
  for (let row = 0; row < 3; row++) { const pts = Array.from({ length: 120 }, (_, i) => [300 + i * 4 + Math.cos(i / 3) * 14, 260 + row * 50 + Math.sin(i / 3) * 16, .3 + .6 * Math.abs(Math.sin(i / 11))]);
    await send('mousePressed', ...pts[0]); for (const q of pts.slice(1)) await send('mouseMoved', ...q); await send('mouseReleased', ...pts.at(-1)); await p.waitForTimeout(100); }
  await p.waitForTimeout(300);
  const clip = { x: 250, y: 220, width: 600, height: 180 };
  const a = await p.screenshot({ clip });
  await p.evaluate(() => { clearTiles(); pathCache.clear(); draw(); }); await p.waitForTimeout(200);
  const c = await p.screenshot({ clip });
  require('fs').writeFileSync(path.join(__dirname, 'rr_a.png'), a); require('fs').writeFileSync(path.join(__dirname, 'rr_b.png'), c);
  const cmp = await ctx.newPage(); await cmp.setContent('<body></body>');
  console.log(JSON.stringify(await cmp.evaluate(async ([a, c]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a), load(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
    const hist = {}; let ink = 0; for (let i = 0; i < da.length; i += 4) { if (da[i] < 128) ink++; const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (!d) continue; const k = d <= 8 ? '1-8' : d <= 32 ? '9-32' : d <= 96 ? '33-96' : '>96'; hist[k] = (hist[k] || 0) + 1; }
    return { inkPixels: ink, hist };
  }, [a.toString('base64'), c.toString('base64')])));
  await b.close();
})();
