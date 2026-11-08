// Koordinatensysteme: Einstellungen (Abstand der Teilstriche, Beschriftung der Achsen) für neue Graphen, eigene
// Beschriftung für 3D, Graph nachträglich ändern (ein Schritt beim Rückgängigmachen, auch verschoben und skaliert),
// Graphen aus früheren Versionen (ohne gespeicherte Daten), Duplizieren, Neuladen
// node tests/graphsettings.js [Notizen.html]
const { chromium } = require('playwright');
const path = require('path'), DIR = path.resolve(__dirname, '..');
const FILE = path.resolve(process.argv[2] || path.join(DIR, 'Notizen.html'));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [], fails = [], res = {};
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const check = (ok, what) => { if (!ok) fails.push(what); };
  await p.goto('file://' + FILE); await p.waitForTimeout(400);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(async () => {
    const now = Date.now(), n = { id: uid(), name: 'Graphen', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 0, ty: 0, z: 1 } };
    await dbIndexPut(n); await openNote(n);
  });
  await p.waitForTimeout(400);
  const frames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const drag = async (x0, y0, x1, y1) => { await p.mouse.move(x0, y0); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10); await p.mouse.up(); await frames(); };
  const shape = async (k, ...a) => { await p.evaluate(k => { setShape(k); if (S.tool !== 'shape') setTool('shape'); }, k); await drag(...a); };
  // Daten eines Graphen: Anzahl Striche, Abstand der Teilstriche auf der waagrechten Achse, Beschriftung, gr
  const info = g => p.evaluate(g => {
    const L = S.items.filter(s => s.g === g), gr = L[0] && L[0].gr, [ox, oy] = gr ? gr.o : [0, 0];
    // Teilstriche: zwei Punkte, senkrecht mit der Mitte auf der waagrechten Achse bzw. waagrecht mit der Mitte auf der senkrechten
    const vert = s => s.pts.length === 6 && Math.abs(s.pts[0] - s.pts[3]) < 1e-3 && Math.abs((s.pts[1] + s.pts[4]) / 2 - oy) < 1e-3;
    const horz = s => s.pts.length === 6 && Math.abs(s.pts[1] - s.pts[4]) < 1e-3 && Math.abs((s.pts[0] + s.pts[3]) / 2 - ox) < 1e-3;
    const vt = L.filter(vert).map(s => s.pts[0]).filter(x => x > ox + 1e-3).sort((a, b) => a - b), ticks = L.filter(s => vert(s) || horz(s)).length;
    return { n: L.length, labels: L.length - 2 - ticks, gap: vt.length ? +(vt[0] - ox).toFixed(3) : null,
      gr: gr ? { k: gr.k, step: gr.step, f: +gr.f.toFixed(4), lx: gr.lx, ly: gr.ly, lz: gr.lz, o: gr.o.map(v => +v.toFixed(2)) } : null, allGr: L.every(s => s.gr), ids: L.map(s => s.id) };
  }, g);
  const lastG = () => p.evaluate(() => S.items.at(-1).g);
  const labelLines = (...ls) => p.evaluate(ls => ls.reduce((n, s) => n + textPolys(s).lines.length, 0), ls);
  // 1) wie bisher: x, y, Teilstriche im Rasterabstand
  await shape('axes2', 200, 200, 520, 480); const g1 = await lastG(); res.g1 = await info(g1);
  check(res.g1.gap === 28 && res.g1.gr.step === 1 && res.g1.gr.lx === 'x' && res.g1.gr.ly === 'y' && res.g1.allGr, 'Neuer Graph wie bisher (' + JSON.stringify(res.g1) + ')');
  // 2) Einstellungen über den Knopf neben den Dicken: 2 Kästchen, Beschriftung t und s(t)
  await p.click('#bTune'); await p.waitForTimeout(500);
  res.menu = await p.evaluate(() => ({ open: isOpen($('#graphMenu')), edit: !!grEdit, title: $('#grTitle').textContent, val: $('#grStepVal').textContent, lx: $('#grLx').value, ly: $('#grLy').value, z: !$('#grLzRow').hidden }));
  check(res.menu.open && !res.menu.edit && res.menu.val === '1 Kästchen' && res.menu.lx === 'x' && res.menu.ly === 'y' && !res.menu.z, 'Menü für neue Graphen (' + JSON.stringify(res.menu) + ')');
  res.prevInk = await p.evaluate(() => { const c = $('#grPrev'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++; return n; });
  check(res.prevInk > 300, 'Vorschau zeigt den Graphen (' + res.prevInk + ' Pixel)');
  await p.click('#grSteps button:nth-child(3)');
  await p.fill('#grLx', 't'); await p.fill('#grLy', 's(t)'); await p.waitForTimeout(200);
  res.settings = await p.evaluate(() => [S.graph, JSON.parse(localStorage.getItem('notizen.graph')), $('#shapeMenu [data-shape=axes2] span').textContent]);
  check(res.settings[0].step === 2 && res.settings[0].lx === 't' && res.settings[0].ly === 's(t)' && res.settings[1].ly === 's(t)' && res.settings[2] === 'Koordinatensystem (t, s(t))', 'Einstellungen gespeichert, Formen-Menü zeigt sie (' + JSON.stringify(res.settings) + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await shape('axes2', 700, 200, 1020, 480); const g2 = await lastG(); res.g2 = await info(g2);
  const lab1 = await labelLines('x', 'y'), lab2 = await labelLines('t', 's(t)');
  check(res.g1.labels === lab1 && lab1 === 4, 'Graph 1: Beschriftung x, y aus 4 Linien (' + res.g1.labels + ')');
  check(res.g2.gap === 56 && res.g2.gr.lx === 't' && res.g2.gr.ly === 's(t)' && res.g2.labels === lab2, 'Neuer Graph mit 2 Kästchen und t, s(t) (' + JSON.stringify([res.g2, lab2]) + ')');
  // 3) 3D hat eigene Beschriftungen
  await p.evaluate(() => setShape('axes3')); await p.click('#bTune'); await p.waitForTimeout(500);
  res.menu3 = await p.evaluate(() => [$('#grLx').value, $('#grLy').value, $('#grLz').value, !$('#grLzRow').hidden, $('#grPairs').hidden]);
  await p.fill('#grLz', 'h'); await p.waitForTimeout(150);
  res.after3 = await p.evaluate(() => [S.graph.lx, S.graph.ly, S.graph.lx3, S.graph.ly3, S.graph.lz]);
  check(res.menu3.join() === 'x,y,z,true,true' && res.after3.join() === 't,s(t),x,y,h', '3D: eigene Beschriftung (' + JSON.stringify([res.menu3, res.after3]) + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await shape('axes3', 200, 560, 520, 860); res.g3 = await info(await lastG());
  check(res.g3.gr.k === 'axes3' && res.g3.gr.lx === 'x' && res.g3.gr.lz === 'h' && res.g3.gap === 56, '3D-Graph mit h und 2 Kästchen (' + JSON.stringify(res.g3) + ')');
  // 4) Graph 1 nachträglich ändern: Lasso antippen, „Graph ändern“, 3 Kästchen, Beschriftung v
  await p.keyboard.press('l'); await p.mouse.click(360, 340); await p.waitForTimeout(300);
  res.sel = await p.evaluate(() => [!$('#sGraph').classList.contains('hidden'), selGraph()]);
  check(res.sel[0] && res.sel[1] === g1, '„Graph ändern“ bei ausgewähltem Graphen (' + JSON.stringify(res.sel) + ')');
  const undo0 = await p.evaluate(() => S.undo.length);
  await p.click('#sGraph'); await p.waitForTimeout(500);
  res.edit = await p.evaluate(() => ({ open: isOpen($('#graphMenu')), g: grEdit && grEdit.g, val: $('#grStepVal').textContent, lx: $('#grLx').value, r: (() => { const m = $('#graphMenu').getBoundingClientRect(), b = S.sel.bb, [x0, y0] = toScreen(b[0], b[1]), [x1, y1] = toScreen(b[2], b[3]); return m.left >= x1 || m.right <= x0 || m.top >= y1 || m.bottom <= y0; })() }));
  check(res.edit.open && res.edit.g === g1 && res.edit.val === '1 Kästchen' && res.edit.lx === 'x' && res.edit.r, 'Menü bearbeitet Graph 1 und liegt neben ihm (' + JSON.stringify(res.edit) + ')');
  await p.click('#grSteps button:nth-child(4)'); await p.waitForTimeout(150);
  await p.click('#grLy'); await p.keyboard.press('Control+a'); await p.keyboard.type('va'); await p.keyboard.press('Backspace'); await p.waitForTimeout(150);
  res.g1b = await info(g1);
  res.undo1 = await p.evaluate(() => S.undo.length) - undo0;
  res.sel1 = await p.evaluate(g => { const ids = S.items.filter(s => s.g === g).map(s => s.id); return ids.length && ids.every(id => S.sel.ids.has(id)); }, g1);
  check(res.g1b.gap === 84 && res.g1b.gr.ly === 'v' && res.g1b.gr.lx === 'x' && res.undo1 === 1 && res.sel1, 'Graph 1 neu gezeichnet, ein Schritt, bleibt ausgewählt (' + JSON.stringify([res.g1b, res.undo1, res.sel1]) + ')');
  check(JSON.stringify(res.g1b.gr.o) === JSON.stringify(res.g1.gr.o), 'Ursprung bleibt (' + JSON.stringify([res.g1.gr.o, res.g1b.gr.o]) + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200); res.g1u = await info(g1);
  check(res.g1u.gap === 28 && res.g1u.gr.ly === 'y' && JSON.stringify(res.g1u.ids) === JSON.stringify(res.g1.ids), 'Rückgängig: Graph 1 wie vorher (' + JSON.stringify(res.g1u) + ')');
  // 5) verschoben und auf 150 % skaliert, dann ändern: Abstand wächst mit, Ursprung folgt
  await p.evaluate(g => { const L = S.items.map(it => it.g === g ? transformItem(it, 1.5, 200, 200, 30, 20) : it); commit(L); setSel(new Set(S.items.filter(s => s.g === g).map(s => s.id))); }, g1);
  res.g1s = await info(g1);
  await p.evaluate(() => openGraphMenu($('#sGraph'), true)); await p.waitForTimeout(400);
  await p.click('#grSteps button:nth-child(3)'); await p.waitForTimeout(150); res.g1t = await info(g1);
  check(res.g1s.gr.f === 1.5 && res.g1t.gap === 84 && JSON.stringify(res.g1t.gr.o) === JSON.stringify(res.g1s.gr.o) && res.g1t.gr.o[0] === 30 + 200 + (360 - 200) * 1.5, 'Skaliert: Abstand 1,5 × 2 Kästchen, Ursprung folgt (' + JSON.stringify([res.g1s.gr, res.g1t]) + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // 6) Graph aus einer früheren Version (wie damals gezeichnet: x, y, ein Kästchen; dann auf 150 % skaliert; Striche ohne
  //    Daten): Daten abgeleitet, unverändert neu gezeichnet genau gleich, dann ändern
  await p.evaluate(() => { window.__sg = { ...S.graph }; Object.assign(S.graph, GRAPH_DEFAULT); });
  await shape('axes2', 700, 560, 1020, 860); const g4 = await lastG();
  await p.evaluate(() => Object.assign(S.graph, window.__sg));
  //    Achsen wie damals mit offener Spitze (Ende, Spitze, Flügel, Spitze, Flügel); neu gezeichnet bekommt er die gefüllte
  const old = await p.evaluate(g => {
    const C = Math.cos(27 * Math.PI / 180), Sn = Math.sin(27 * Math.PI / 180);
    const openHead = s => {
      const sh = shaftOf(s), q0 = [s.pts[sh[0]], s.pts[sh[0] + 1]], q1 = [s.pts[sh[1]], s.pts[sh[1] + 1]];
      const L = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), ux = (q1[0] - q0[0]) / L, uy = (q1[1] - q0[1]) / L, h = Math.min(L * 0.35, 1.5 * (12 + 2 * 2.5));
      const xy = [...q0, ...q1, q1[0] - h * (ux * C - uy * Sn), q1[1] - h * (ux * Sn + uy * C), ...q1, q1[0] - h * (ux * C + uy * Sn), q1[1] - h * (-ux * Sn + uy * C)];
      const pts = new Float32Array(15); for (let i = 0; i < 5; i++) { pts[i * 3] = xy[i * 2]; pts[i * 3 + 1] = xy[i * 2 + 1]; pts[i * 3 + 2] = 0.5; }
      const { fl, ...rest } = s; return { ...rest, pts, bb: bboxOf(pts, s.w) };
    };
    const L = S.items.map(it => { if (it.g !== g) return it; const { gr, ...rest } = transformItem(it, 1.5, 700, 560, 0, 0); return rest.fl ? openHead(rest) : rest; }); commit(L);
    // Teilstrich: zwei Punkte, quer mittig auf einer Achse (die Beschriftung liegt neben den Achsen)
    const o = graphData(g).o, isTick = s => s.pts.length === 6 && ((Math.abs(s.pts[0] - s.pts[3]) < 1e-3 && Math.abs((s.pts[1] + s.pts[4]) / 2 - o[1]) < 0.01)
      || (Math.abs(s.pts[1] - s.pts[4]) < 1e-3 && Math.abs((s.pts[0] + s.pts[3]) / 2 - o[0]) < 0.01));
    const key = s => Array.from(s.pts).map(v => +v.toFixed(2)).join(), mine = () => S.items.filter(s => s.g === g);
    const ends = s => { const sh = shaftOf(s); return [s.pts[sh[0]], s.pts[sh[0] + 1], s.pts[sh[1]], s.pts[sh[1] + 1]].map(v => +v.toFixed(2)).join(); };
    const oldAxes = mine().filter(s => s.pts.length === 15), ticks0 = mine().filter(isTick).map(key);
    const d = graphData(g), r = rebuildGraph(g, {}), now = r.items.filter(s => s.g === g), newAxes = now.filter(s => s.fl);
    return { d: { k: d.k, step: d.step, G: d.G, f: +d.f.toFixed(4), lx: d.lx, ly: d.ly }, oldAxes: oldAxes.length, newAxes: newAxes.length,
      sameTicks: ticks0.length > 6 && ticks0.join('|') === now.filter(isTick).map(key).join('|'), sameEnds: oldAxes.map(ends).join('|') === newAxes.map(ends).join('|'),
      labels: now.length - newAxes.length - ticks0.length, noGr: mine().every(s => !s.gr) };
  }, g4);
  check(old.noGr && old.d.k === 'axes2' && old.d.G === 28 && old.d.f === 1.5 && old.d.lx === 'x' && old.oldAxes === 2 && old.newAxes === 2 && old.sameTicks && old.sameEnds && old.labels === 4,
    'Früherer Graph (offene Spitzen): Daten abgeleitet, neu gezeichnet gleich, nur mit gefüllten Spitzen (' + JSON.stringify(old) + ')');
  await p.evaluate(g => setSel(new Set(S.items.filter(s => s.g === g).map(s => s.id))), g4); await p.waitForTimeout(200);
  res.oldBtn = await p.evaluate(() => !$('#sGraph').classList.contains('hidden'));
  await p.click('#sGraph'); await p.waitForTimeout(400); await p.click('#grSteps button:nth-child(3)'); await p.waitForTimeout(150);
  res.g4b = await info(g4);
  check(res.oldBtn && res.g4b.allGr && res.g4b.gap === 84 && res.g4b.gr.lx === 'x' && res.g4b.gr.f === 1.5, 'Früherer Graph lässt sich ändern (' + JSON.stringify([res.oldBtn, res.g4b]) + ')');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // 7) Duplizieren: eigene Gruppe, Daten mitverschoben
  await p.click('#sDup'); await p.waitForTimeout(300);
  res.dup = await p.evaluate(g => { const c = S.items.at(-1), o = S.items.find(s => s.g === g); return { other: c.g !== g, dx: +(c.gr.o[0] - o.gr.o[0]).toFixed(2), dy: +(c.gr.o[1] - o.gr.o[1]).toFixed(2), sel: selGraph() === c.g }; }, g4);
  check(res.dup.other && res.dup.dx === 24 && res.dup.dy === 24 && res.dup.sel, 'Duplikat mit eigener Gruppe und verschobenen Daten (' + JSON.stringify(res.dup) + ')');
  // 8) Neuladen: Daten und Einstellungen bleiben
  await p.waitForTimeout(2200);
  await p.reload(); await p.waitForTimeout(600);
  res.reload = await p.evaluate(async g => { const all = await dbIndexAll(); await openNote(all[0]); const s = S.items.find(it => it.g === g); return { gr: s && s.gr && [s.gr.step, s.gr.ly, +s.gr.f.toFixed(2)], graph: S.graph }; }, g1);
  check(JSON.stringify(res.reload.gr) === '[2,"y",1.5]' && res.reload.graph.ly === 's(t)' && res.reload.graph.lz === 'h', 'Nach dem Neuladen gleich (' + JSON.stringify(res.reload) + ')');
  if (errs.length) fails.push('Fehler: ' + errs.join(' | '));
  res.errs = errs; res.fails = fails;
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exitCode = fails.length ? 1 : 0;
})();
