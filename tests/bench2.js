const { chromium } = require('playwright'); const path = require('path'), DIR = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.goto('file://' + DIR + '/Notizen.html'); await p.waitForTimeout(500);
  await p.evaluate(async () => { for (const m of await dbIndexAll()) await dbDeleteNote(m.id); });
  await p.click('#hNewBook'); await p.click('#dlgOk'); await p.click('#hNew'); await p.click('#dlgOk');   /* Seitenformat wählen (vorausgewählt: unendlich) */   /* ab 1.4: Seiten liegen in Büchern */ await p.waitForTimeout(300);
  console.log(JSON.stringify(await p.evaluate(() => {
    const add = [];
    for (let k = 0; k < 2500; k++) { const pts = []; const x0 = (k % 50) * 28, y0 = Math.floor(k / 50) * 34; for (let i = 0; i < 80; i++) pts.push(x0 + i * 0.3 + Math.cos(i / 3) * 4, y0 + Math.sin(i / 2.5) * 8, 0.3 + 0.5 * Math.abs(Math.sin(i / 7))); add.push(makeStroke(pts, 'ink', 1.5 + (k % 3), false)); }
    commit(appendItems(S.items, add)); setView(20, 80, 1, true);
    const c = document.createElement('canvas'); c.width = 2880; c.height = 1800; const g = c.getContext('2d', { alpha: false });
    const flush = () => g.getImageData(0, 0, 1, 1);
    const vis = S.items.filter(s => s.bb[1] < 900 && s.bb[0] < 1440);
    const groups = new Map();
    function grp(s) {
      let G = groups.get(s); if (G) return G; G = [];
      const pts = s.pts, n = pts.length / 3, step = s.w * 0.04; let cur = null;
      for (let i = 0; i < n; i++) {
        const lw = Math.round(2 * radAt(pts, i, s.w, s.hl) / step) * step;
        if (!cur || Math.abs(cur.lw - lw) > 1e-9) { cur = { lw, p: new Path2D() }; G.push(cur); if (i > 0) cur.p.moveTo(pts[i * 3 - 3], pts[i * 3 - 2]); else cur.p.moveTo(pts[0], pts[1]); }
        cur.p.lineTo(pts[i * 3], pts[i * 3 + 1]);
      }
      groups.set(s, G); return G;
    }
    const time = fn => { const r = []; for (let k = 0; k < 5; k++) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.setTransform(2, 0, 0, 2, 0, 0); const t0 = performance.now(); fn(); flush(); r.push(performance.now() - t0); } return +r.sort((a, b) => a - b)[2].toFixed(1); };
    vis.forEach(strokePath); vis.forEach(grp);
    const union = time(() => { g.fillStyle = '#111'; for (const s of vis) g.fill(strokePath(s)); });
    const strokes = time(() => { g.strokeStyle = '#111'; g.lineCap = g.lineJoin = 'round'; for (const s of vis) for (const q of grp(s)) { g.lineWidth = q.lw; g.stroke(q.p); } });
    const variant = (circ) => { const m = new Map(); for (const s of vis) { const P = new Path2D(), pts = s.pts, n = pts.length / 3;
      for (let i = 0; i < n; i++) { const x = pts[i*3], y = pts[i*3+1], r = radAt(pts, i, s.w, s.hl);
        if (circ === 'arc') { P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2); }
        else if (circ > 0) { P.moveTo(x + r, y); for (let k = 1; k < circ; k++) { const a = k / circ * Math.PI * 2; P.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
        else if (i === 0 || i === n - 1) { P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2); }
        if (i > 0) { const x0 = pts[i*3-3], y0 = pts[i*3-2], r0 = radAt(pts, i-1, s.w, s.hl), dx = x - x0, dy = y - y0, L = Math.hypot(dx, dy); if (L > .01) { const nx = -dy / L, ny = dx / L; P.moveTo(x0 + nx*r0, y0 + ny*r0); P.lineTo(x0 - nx*r0, y0 - ny*r0); P.lineTo(x - nx*r, y - ny*r); P.lineTo(x + nx*r, y + ny*r); } } }
      m.set(s, P); } return m; };
    const res2 = {};
    for (const v of ['arc', 8, 12, 0]) { const m = variant(v); res2['v_' + v] = time(() => { g.fillStyle = '#111'; for (const s of vis) g.fill(m.get(s)); }); }
    // Umriss-Polygon
    const outl = new Map(); for (const s of vis) { const P = new Path2D(), pts = s.pts, n = pts.length / 3, L = [], R = [];
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let dx = pts[b*3] - pts[a*3], dy = pts[b*3+1] - pts[a*3+1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const r = radAt(pts, i, s.w, s.hl); L.push([pts[i*3] - dy * r, pts[i*3+1] + dx * r]); R.push([pts[i*3] + dy * r, pts[i*3+1] - dx * r]); }
      P.moveTo(...L[0]); for (const q of L) P.lineTo(...q); for (let i = R.length - 1; i >= 0; i--) P.lineTo(...R[i]); P.closePath(); outl.set(s, P); }
    res2.outline = time(() => { g.fillStyle = '#111'; for (const s of vis) g.fill(outl.get(s)); });
    const avgGroups = vis.reduce((a, s) => a + grp(s).length, 0) / vis.length;
    return { visibleStrokes: vis.length, union_ms: union, strokeGroups_ms: strokes, avgGroups: +avgGroups.toFixed(1), ...res2 };
  })));
  await b.close();
})();
