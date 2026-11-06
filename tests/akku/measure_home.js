// Verbrauch der echten Windows-App (Electron), Schwerpunkt Startseite: CPU-Zeit je Prozess und GPU-Zeit
// (App und dwm, über tests/akku/sample.ps1) und Hauptthread-Zeit der Seite, je Ablauf. Leeres Testprofil.
// Wie measure.py, nur in Node (Playwright verbindet sich über CDP, kein Python-websocket nötig), ohne Tastendrücke ans
// System. Abläufe: Startseite (hat die Seite ein Aquarium, auch Meer/Teich/Linien/Aus), minimiert (mit echtem Fokus: das Meer
// muss stillstehen), Editor (Leerlauf, Schreiben, Verschieben), zurück. Vergleich alt/neu: beide nacheinander messen.
// node measure_home.js <Notizen.exe> <Profilordner> <Ergebnis.json>
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), http = require('http');
const [EXE, PROFILE, OUT] = process.argv.slice(2);
const PORT = 9333, AKKU = __dirname;
const REAL_LOG = path.join(process.env.APPDATA, 'Notizen', 'notizen-log.txt');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => performance.now();

function sample() {
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(AKKU, 'sample.ps1'), path.resolve(EXE).toLowerCase()], { encoding: 'utf8', timeout: 60000 });
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
  return { sec: +((b.t - a.t) / 1000).toFixed(1), cpu_app_ms: Math.round(Object.entries(cpu).filter(([k]) => k !== 'dwm').reduce((s, [, v]) => s + v, 0)), cpu: r(cpu), gpu_ms: r(gpu) };
}
const getJSON = url => new Promise((res, rej) => http.get(url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); }).on('error', rej));
function showWindow(pid, cmd) {   // 6 = minimieren, 9 = wiederherstellen (nur das Fenster der Test-App)
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);'; $h = (Get-Process -Id ${pid}).MainWindowHandle; if ($h -ne 0) { [W.U]::ShowWindow($h, ${cmd}) | Out-Null; 'ok' } else { 'kein Fenster' }`], { encoding: 'utf8' });
}

const INSTR = `window.__c = { raf: 0, to: 0 };
{ const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => r(t => { __c.raf++; cb(t); });
  const s = window.setTimeout.bind(window); window.setTimeout = (cb, ms, ...a) => s(typeof cb === 'function' ? (...x) => { __c.to++; cb(...x); } : cb, ms, ...a); }`;
const SETUP = `(async () => {
  const now = Date.now();
  await dbBookPut({ id: 'tb', name: 'Test', color: 'blue', created: now });
  for (let b = 0; b < 5; b++) await dbBookPut({ id: 'b' + b, name: 'Buch ' + b, color: ['red', 'green', 'teal', 'purple', 'orange'][b], created: now - b - 1 });
  const mk = (off) => { const out = []; let o = 0;
    for (let k = 0; k < 2500; k++) { const pts = []; const x0 = (k % 50) * 28 + off[0], y0 = Math.floor(k / 50) * 34 + off[1];
      for (let i = 0; i < 80; i++) pts.push(x0 + i * 0.3 + Math.cos(i / 3) * 4, y0 + Math.sin(i / 2.5) * 8, 0.3 + 0.5 * Math.abs(Math.sin(i / 7)));
      const s = makeStroke(pts, k % 7 === 0 ? '#1e88e5' : 'ink', 1.5 + (k % 3), false); s.o = o++; out.push(s); }
    return out; };
  const a = { id: 'tn', name: 'Unendlich', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 20, ty: 80, z: 1 }, book: 'tb' };
  const ia = mk([0, 0]); ia.forEach(s => s.n = 'tn');
  await writeRecords(a, ia, [], true);
  homeBook = null; await renderHome(true);
  return document.querySelectorAll('.book').length;
})()`;

(async () => {
  for (let i = 0; i < 40; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch { await sleep(500); } }
  fs.mkdirSync(PROFILE, { recursive: true });
  const real0 = fs.existsSync(REAL_LOG) ? fs.statSync(REAL_LOG).size : -1;
  const proc = spawn(EXE, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: 'ignore' });
  const kill = () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { } };
  const res = { exe: EXE, phases: {} };
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { await getJSON(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(300); } }
    await sleep(1500);
    const real1 = fs.existsSync(REAL_LOG) ? fs.statSync(REAL_LOG).size : -1;
    if (real1 !== real0 || !fs.existsSync(path.join(PROFILE, 'notizen-log.txt'))) throw new Error('ABBRUCH: nicht das Testprofil');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const ctx = browser.contexts()[0];
    let p = ctx.pages()[0]; for (let i = 0; !p && i < 50; i++) { await sleep(200); p = ctx.pages()[0]; }
    const c = await ctx.newCDPSession(p);
    await c.send('Performance.enable');
    await c.send('Page.enable'); await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTR });
    await p.reload(); await p.waitForFunction(() => document.readyState === 'complete' && typeof openNote === 'function' && !!db, null, { timeout: 30000 });
    await sleep(500);
    console.log('Bücher:', await p.evaluate(SETUP));
    const [W, H, dpr] = await p.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]); res.viewport = [W, H, dpr];
    const sea = await p.evaluate(() => typeof seaSet === 'function'); res.sea = sea;
    await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }); await p.evaluate(() => typeof seaRun === 'function' && seaRun());
    const perf = async () => Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    async function phase(name, fn) {
      const a = sample(), m0 = await perf(), j0 = await p.evaluate(() => ({ ...__c }));
      await fn();
      const j1 = await p.evaluate(() => ({ ...__c })), m1 = await perf(), b = sample();
      const d = delta(a, b);
      d.js = Object.fromEntries(Object.keys(j1).map(k => [k, j1[k] - (j0[k] || 0)]));
      d.renderer_ms = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(k => [k, Math.round((m1[k] - m0[k]) * 1000)]));
      if (sea) d.sea = await p.evaluate(() => sea.oc ? { on: sea.oc.on, ms: +sea.oc.stats.ms.toFixed(2), cells: sea.oc.stats.cells, cols: sea.oc.cols, rows: sea.oc.rows } : null);
      res.phases[name] = d; console.log(name, JSON.stringify(d));
    }
    const idle = ms => () => sleep(ms);
    const paced = async (pts, fn, dt) => { const t0 = now(); for (let k = 0; k < pts.length; k++) { await fn(...pts[k]); const w = t0 + (k + 1) * dt - now(); if (w > 0) await sleep(w); } };
    const pen = (type, x, y, buttons) => c.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: buttons ? 'left' : 'none', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, force: buttons ? 0.5 : 0 });
    const touch = (type, pts) => c.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    async function write() {
      let y = 260;
      for (let s = 0; s < 18; s++) {
        const x0 = 150 + (s % 6) * 160; if (s % 6 === 0) y += 70;
        const pts = Array.from({ length: 60 }, (_, i) => [x0 + i * 2.2, y + 14 * Math.sin(i / 4) + 6 * Math.sin(i / 1.7)]);
        await pen('mouseMoved', ...pts[0], 0); await pen('mousePressed', ...pts[0], 1);
        await paced(pts.slice(1), (x, yy) => pen('mouseMoved', x, yy, 1), 8);
        await pen('mouseReleased', ...pts.at(-1), 0);
        await paced(Array.from({ length: 18 }, (_, j) => [x0 + 140, y + 10 + j]), (x, yy) => pen('mouseMoved', x, yy, 0), 8);
      }
    }
    async function pan() {
      for (let rep = 0; rep < 4; rep++) {
        await touch('touchStart', [[W / 2, H / 2]]);
        const n = 150, pts = Array.from({ length: n }, (_, i) => [W / 2 - 400 * Math.sin(i / n * Math.PI), H / 2 - 250 * Math.sin(i / n * Math.PI * 2)]);
        await paced(pts, (x, y) => touch('touchMove', [[x, y]]), 1000 / 60);
        await touch('touchEnd', []); await sleep(300);
      }
    }
    await sleep(2000);
    await phase('home_idle', idle(20000));   // neu: Aquarium wie vorgegeben (Meer, Kacheln)
    if (sea) {
      await p.evaluate(() => seaSet('teich', 'tiles')); await sleep(1000); await phase('home_teich_kacheln', idle(15000));
      await p.evaluate(() => seaSet('meer', 'lines')); await sleep(1000); await phase('home_meer_linien', idle(15000));
      await p.evaluate(() => seaSet('off')); await sleep(1000); await phase('home_aus', idle(15000));
      await p.evaluate(() => seaSet('meer', 'tiles')); await sleep(1000);
    }
    await c.send('Emulation.setFocusEmulationEnabled', { enabled: false }); res.realFocus = await p.evaluate(() => document.hasFocus());
    res.minimize = showWindow(proc.pid, 6).trim(); await sleep(1500);
    res.afterMin = await p.evaluate(() => ({ focus: document.hasFocus(), on: typeof sea !== 'undefined' && !!sea.oc && sea.oc.on }));
    if (res.afterMin.on && !res.afterMin.focus && !res.realFocus) { res.blurSimulated = true; await p.evaluate(() => dispatchEvent(new Event('blur'))); await sleep(300); }
    await phase('home_minimiert', idle(15000));
    showWindow(proc.pid, 9); await sleep(2000);
    await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }); await p.evaluate(() => typeof seaRun === 'function' && seaRun());
    await p.evaluate(() => openNote(homeData.notes.find(n => n.id === 'tn'))); await sleep(300);
    await phase('editor_oeffnen', idle(5000));
    await phase('editor_idle', idle(20000));
    await phase('editor_schreiben', write);
    await p.evaluate(() => (typeof hovers !== 'undefined' ? [...hovers.keys()] : [2]).forEach(id => cvLive.dispatchEvent(new PointerEvent('pointerleave', { pointerId: id, pointerType: 'pen' })))); await sleep(1800);
    await phase('editor_verschieben', pan);
    await p.evaluate(() => closeNote()); await sleep(2000);
    await phase('home_zurueck', idle(10000));
  } catch (e) { res.error = String(e && e.stack || e); console.log('FEHLER', res.error); }
  finally {
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    try { if (browser) await browser.close(); } catch { }
    kill();
  }
})();
