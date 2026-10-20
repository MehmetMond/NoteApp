const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.setContent('<body></body>');
  for (const t of ['pen', 'hl']) {
    const a = fs.readFileSync(path.join(__dirname, t + '_live.png')).toString('base64'), c = fs.readFileSync(path.join(__dirname, t + '_final.png')).toString('base64');
    console.log(t, JSON.stringify(await p.evaluate(async ([a, c]) => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
      const [A, B] = await Promise.all([load(a), load(c)]); const cv = document.createElement('canvas'); cv.width = A.width; cv.height = A.height; const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, cv.width, cv.height).data;
      const hist = {}; let tailOnly = 0, minx = 1e9, maxx = 0;
      for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (!d) continue; const x = (i / 4) % cv.width; const bucket = d <= 2 ? '1-2' : d <= 8 ? '3-8' : d <= 32 ? '9-32' : '>32'; hist[bucket] = (hist[bucket] || 0) + 1; if (d > 8) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); } }
      return { hist, bigDiffXRange: [minx, maxx], width: cv.width };
    }, [a, c])));
  } await b.close(); })();
