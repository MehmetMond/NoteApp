// Dieselbe Seite (Notizen.html) in verschiedenen Engines messen: CPU-Zeit aller Prozesse der Engine (Prozessbaum),
// GPU-Laufzeit je Prozess, je Ablauf (Ruhe, Schreiben, Tape, Formen, Verschieben, Ruhe). Vergleich Desktop-App mit
// älterem/neuerem Electron gegen einen Browser (Helium, Chrome, Edge) auf demselben Gerät.
//   Electron: eine Testkopie der Windows-Hülle (electron/main.js, Fenster ohne Fokus an ENG_POS) mit Notizen.html, eigenes
//   Profil. Browser: eigenes Profil, Seite über einen kleinen Server auf 127.0.0.1. Eigene Notizen bleiben unberührt.
//   Standard: Fenster außerhalb des Bildschirms und Verdeckungsberechnung aus (sonst zeichnet ein Browser dort nicht);
//   ENG_POS=0,0 legt es sichtbar hin (realistischer, dann das Gerät nicht anfassen). ENG_DPR=2 (Standard) wie das Surface.
// node tests/akku/engines.js <name> <electron|browser> <exe> <leerer Profilordner> <ergebnis.json>
// node tests/akku/sum_engines.js <ergebnis1.json> <ergebnis2.json> …     (Mittel je Name)
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');
const [NAME, KIND, EXE, PROFILE, OUT] = process.argv.slice(2);
if (!OUT) { console.log('node engines.js <name> <electron|browser> <exe> <leerer Profilordner> <ergebnis.json>'); process.exit(2); }
const REPO = path.resolve(__dirname, '..', '..'), PORT = 9333, HTTP = 8765;
const [W, H] = (process.env.ENG_SIZE || '1440,700').split(',').map(Number);
const [PX, PY] = (process.env.ENG_POS || '-3300,40').split(',').map(Number);
const DPR = process.env.ENG_DPR || '2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();
let ROOT = 0;

function sample() {
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'sample_tree.ps1'), String(ROOT)], { encoding: 'utf8', timeout: 60000 });
  const d = JSON.parse(out.trim()), procs = Array.isArray(d.procs) ? d.procs : [d.procs];
  return { t: now(), procs: new Map(procs.map(p => [p.pid, [p.type, p.t]])), gpu: new Map(Object.entries(d.gpu || {}).map(([k, v]) => [+k, v])) };
}
function delta(a, b) {
  const cpu = {}, gpu = {};
  for (const [pid, [typ, t]] of b.procs) {
    const t0 = (a.procs.get(pid) || [typ, 0])[1]; cpu[typ] = (cpu[typ] || 0) + (t - t0) / 1e4;
    if (b.gpu.has(pid)) gpu[typ] = (gpu[typ] || 0) + (b.gpu.get(pid) - (a.gpu.get(pid) || 0)) / 1e4;
  }
  const r = o => Object.fromEntries(Object.entries(o).sort().map(([k, v]) => [k, Math.round(v)]));
  const sum = o => Math.round(Object.entries(o).filter(([k]) => k !== 'dwm').reduce((s, [, v]) => s + v, 0));
  return { sec: +((b.t - a.t) / 1000).toFixed(1), cpu_ms: sum(cpu), gpu_ms: sum(gpu), dwm_cpu: Math.round(cpu.dwm || 0), dwm_gpu: Math.round(gpu.dwm || 0), cpu: r(cpu), gpu: r(gpu) };
}
const getJSON = url => new Promise((res, rej) => http.get(url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));

// Testkopie der Windows-Hülle: Fenster ohne Fokus an fester Stelle statt maximiert
function testApp() {
  const dir = path.join(path.dirname(path.resolve(PROFILE)), 'engines_app');
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  let m = fs.readFileSync(path.join(REPO, 'electron', 'main.js'), 'utf8');
  const a = 'width: 1400, height: 900, show: true,', mx = /  win\.maximize\(\);\r?\n/;
  if (!m.includes(a) || !mx.test(m)) throw new Error('electron/main.js: Fensterzeilen nicht gefunden, engines.js anpassen');
  m = m.replace(a, `x: ${PX}, y: ${PY}, width: ${W}, height: ${H}, useContentSize: true, show: false,`).replace(mx, '  win.showInactive();\n');
  fs.writeFileSync(path.join(dir, 'main.js'), m);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'notizen', productName: 'Notizen', version: '0.0.0-test', main: 'main.js' }));
  fs.copyFileSync(path.join(REPO, 'electron', 'icon.png'), path.join(dir, 'icon.png'));
  fs.copyFileSync(path.join(REPO, 'Notizen.html'), path.join(dir, 'app', 'index.html'));
  return dir;
}

const INSTR = `window.__c = { raf: 0 };
{ const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => r(t => { __c.raf++; cb(t); }); }`;
// Testnotiz mit 2500 Strichen öffnen
const SETUP = `(async () => {
  const now = Date.now();
  await dbBookPut({ id: 'tb', name: 'Test', color: 'blue', created: now });
  const out = []; let o = 0;
  for (let k = 0; k < 2500; k++) { const pts = []; const x0 = (k % 50) * 28, y0 = Math.floor(k / 50) * 34;
    for (let i = 0; i < 80; i++) pts.push(x0 + i * 0.3 + Math.cos(i / 3) * 4, y0 + Math.sin(i / 2.5) * 8, 0.3 + 0.5 * Math.abs(Math.sin(i / 7)));
    const s = makeStroke(pts, k % 7 === 0 ? '#1e88e5' : 'ink', 1.5 + (k % 3), false); s.o = o++; s.n = 'tn'; out.push(s); }
  const a = { id: 'tn', name: 'Unendlich', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 20, ty: 80, z: 1 }, book: 'tb' };
  await writeRecords(a, out, [], true);
  homeBook = null; await renderHome(true);
  await openNote(homeData.notes.find(n => n.id === 'tn'));
  return [innerWidth, innerHeight, devicePixelRatio, S.items.length];
})()`;

(async () => {
  let server = null, proc = null, browser = null;
  const res = { name: NAME, kind: KIND, exe: EXE, pos: [PX, PY], size: [W, H], dpr: DPR, phases: {} };
  const kill = () => { try { if (proc) execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { } };
  try {
    fs.mkdirSync(PROFILE, { recursive: true });
    if (fs.readdirSync(PROFILE).length) throw new Error('Profilordner ist nicht leer: ' + PROFILE);
    const URL = `http://127.0.0.1:${HTTP}/Notizen.html`, dpr = DPR !== '0' ? ['--force-device-scale-factor=' + DPR] : [];
    if (KIND === 'electron') {
      proc = spawn(EXE, [testApp(), '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, ...dpr], { stdio: 'ignore' });
    } else {
      server = http.createServer((q, s) => {
        if (q.url.split('?')[0] === '/Notizen.html') { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); fs.createReadStream(path.join(REPO, 'Notizen.html')).pipe(s); }
        else { s.writeHead(404); s.end(); }
      }).listen(HTTP, '127.0.0.1');
      proc = spawn(EXE, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check',
        '--disable-features=CalculateNativeWinOcclusion', ...dpr, `--window-position=${PX},${PY}`, `--window-size=${W},${H + 100}`, URL], { stdio: 'ignore' });
    }
    ROOT = proc.pid;
    for (let i = 0; i < 100; i++) { try { res.version = (await getJSON(`http://127.0.0.1:${PORT}/json/version`)).Browser; break; } catch { await sleep(300); } }
    await sleep(1500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    try {   // Grafik der Engine: Treiber und was beschleunigt läuft (wie chrome://gpu)
      const g = (await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo')).gpu;
      const dev = (g.devices || [])[0] || {};
      res.gpu = { device: dev.deviceString, driver: dev.driverVersion, features: g.featureStatus };
    } catch (e) { res.gpu = String(e.message || e); }
    const ctx = browser.contexts()[0];
    let p = null;
    for (let i = 0; i < 50 && !p; i++) { p = ctx.pages().find(x => /Notizen\.html|index\.html/.test(x.url())); if (!p) await sleep(200); }
    if (!p) { p = ctx.pages()[0] || await ctx.newPage(); await p.goto(URL); }
    for (const q of ctx.pages()) if (q !== p) await q.close().catch(() => { });
    const c = await ctx.newCDPSession(p);
    await c.send('Page.enable'); await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
    await p.reload(); await p.waitForFunction(() => document.readyState === 'complete' && typeof openNote === 'function' && typeof db !== 'undefined' && !!db, null, { timeout: 30000 });
    await sleep(500);
    if (KIND !== 'electron') {   // Inhalt genau W × H wie in der App
      const { windowId, bounds } = await c.send('Browser.getWindowForTarget');
      const [iw, ih] = await p.evaluate(() => [innerWidth, innerHeight]);
      await c.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width + W - iw, height: bounds.height + H - ih } });
      await sleep(500);
    }
    await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    res.setup = await p.evaluate(SETUP);
    console.log(NAME, res.version, 'Ansicht', JSON.stringify(res.setup));
    const perf = async () => Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await c.send('Performance.enable');
    async function phase(name, fn) {
      const a = sample(), m0 = await perf(), j0 = await p.evaluate(() => __c.raf);
      await fn();
      const j1 = await p.evaluate(() => __c.raf), m1 = await perf(), b = sample();
      const d = delta(a, b);
      d.raf = j1 - j0;
      d.task_ms = Math.round((m1.TaskDuration - m0.TaskDuration) * 1000);
      res.phases[name] = d; console.log(' ', name, JSON.stringify(d));
    }
    const idle = ms => () => sleep(ms);
    const paced = async (pts, fn, dt) => { const t0 = now(); for (let k = 0; k < pts.length; k++) { await fn(...pts[k]); const w = t0 + (k + 1) * dt - now(); if (w > 0) await sleep(w); } };
    // Stift: beim Loslassen button 'left' (mit 'none' kommt kein pointerup)
    const pen = (type, x, y, down) => c.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: type === 'mouseMoved' && !down ? 'none' : 'left', buttons: down ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, force: down ? 0.5 : 0 });
    const touch = (type, pts) => c.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    async function stroke(pts) {
      await pen('mouseMoved', ...pts[0], false); await pen('mousePressed', ...pts[0], true);
      await paced(pts.slice(1), (x, y) => pen('mouseMoved', x, y, true), 8);
      await pen('mouseReleased', ...pts.at(-1), false);
      const [x1, y1] = pts.at(-1);
      await paced(Array.from({ length: 18 }, (_, j) => [x1 + 10, y1 + 10 + j]), (x, y) => pen('mouseMoved', x, y, false), 8);
    }
    const unhover = async () => { await p.evaluate(() => [...hovers.keys()].forEach(id => cvLive.dispatchEvent(new PointerEvent('pointerleave', { pointerId: id, pointerType: 'pen' })))); await sleep(1800); };
    async function write() {
      let y = 120;
      for (let s = 0; s < 18; s++) {
        const x0 = 150 + (s % 6) * 160; if (s % 6 === 0) y += 70;
        await stroke(Array.from({ length: 60 }, (_, i) => [x0 + i * 2.2, y + 14 * Math.sin(i / 4) + 6 * Math.sin(i / 1.7)]));
      }
    }
    async function tape() {
      for (let s = 0; s < 6; s++) await stroke(Array.from({ length: 60 }, (_, i) => [200 + i * 8, 150 + s * 75 + 3 * Math.sin(i / 9)]));
    }
    async function shapes() {
      for (let s = 0; s < 6; s++) {
        await p.evaluate(k => setShape(k), s < 3 ? 'rect' : 'ellipse');
        const x0 = 150 + (s % 3) * 380, y0 = s < 3 ? 140 : 400;
        await stroke(Array.from({ length: 50 }, (_, i) => [x0 + i * 6, y0 + i * 3.2]));
      }
    }
    async function pan() {
      for (let rep = 0; rep < 4; rep++) {
        await touch('touchStart', [[W / 2, H / 2]]);
        const n = 150, pts = Array.from({ length: n }, (_, i) => [W / 2 - 400 * Math.sin(i / n * Math.PI), H / 2 - 200 * Math.sin(i / n * Math.PI * 2)]);
        await paced(pts, (x, y) => touch('touchMove', [[x, y]]), 1000 / 60);
        await touch('touchEnd', []); await sleep(300);
      }
    }
    await sleep(3000);
    await phase('ruhe', idle(15000));
    await phase('schreiben', write); await unhover();
    await p.evaluate(() => setTool('tape')); await sleep(300);
    await phase('tape', tape); await unhover();
    await p.evaluate(() => setTool('shape')); await sleep(300);
    await phase('formen', shapes); await unhover();
    await p.evaluate(() => { clearSel(); setTool('pen'); }); await sleep(500);
    await phase('verschieben', pan);
    await sleep(1000);
    await phase('ruhe_danach', idle(15000));
    res.items = await p.evaluate(() => S.items.length);
  } catch (e) { res.error = String(e && e.stack || e); console.log('FEHLER', res.error); }
  finally {
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    try { if (browser) await browser.close(); } catch { }
    await sleep(500); kill();
    if (server) server.close();
  }
})();
