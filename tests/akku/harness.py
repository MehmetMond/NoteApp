# Bausteine zum Messen der echten Notizen-App (Electron) mit eigenem Testprofil
import json, subprocess, os, time, threading, urllib.request, math, ctypes, shutil
import websocket

REAL_LOG = os.path.join(os.environ['APPDATA'], 'Notizen', 'notizen-log.txt')
HERE = os.path.dirname(os.path.abspath(__file__))
PS_FILE = os.path.join(HERE, 'sample.ps1')   # CPU-Zeit je Prozess und GPU-Zeit (Leistungsindikatoren)

def sample(exe_n):
    r = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_FILE, exe_n.lower()],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=60)
    d = json.loads(r.stdout.strip())
    procs = d['procs'] if isinstance(d['procs'], list) else [d['procs']]
    return {'t': time.perf_counter(), 'procs': {p['pid']: (p['type'], p['t']) for p in procs}, 'gpu': {int(k): v for k, v in (d['gpu'] or {}).items()}}

def delta(a, b):
    cpu, gpu = {}, {}
    for pid, (typ, t) in b['procs'].items():
        t0 = a['procs'].get(pid, (typ, 0))[1]
        cpu[typ] = cpu.get(typ, 0) + (t - t0) / 1e4
        if pid in b['gpu']: gpu[typ] = gpu.get(typ, 0) + (b['gpu'][pid] - a['gpu'].get(pid, 0)) / 1e4
    return {'sec': round(b['t'] - a['t'], 2), 'cpu_app_ms': round(sum(v for k, v in cpu.items() if k != 'dwm')),
            'cpu': {k: round(v) for k, v in sorted(cpu.items())}, 'gpu_ms': {k: round(v) for k, v in sorted(gpu.items())}}

class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, suppress_origin=True, timeout=120); self.n = 0
    def send(self, method, **params):
        self.n += 1; i = self.n
        self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == i:
                if 'error' in m: raise RuntimeError(method + ': ' + json.dumps(m['error']))
                return m.get('result', {})
    def js(self, expr):
        r = self.send('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'])[:800])
        return r['result'].get('value')
    def perf(self):
        return {m['name']: m['value'] for m in self.send('Performance.getMetrics')['metrics']}

def launch(exe, profile, port=9333):
    """Startet die App mit leerem Testprofil; bricht ab, wenn sie das echte Profil benutzt"""
    for _ in range(40):   # die vorige App gibt ihre Dateien erst kurz nach dem Beenden frei
        try:
            if os.path.exists(profile): shutil.rmtree(profile)
            break
        except PermissionError: time.sleep(0.5)
    os.makedirs(profile)
    real0 = os.path.getsize(REAL_LOG) if os.path.exists(REAL_LOG) else -1
    proc = subprocess.Popen([exe, '--user-data-dir=' + profile, '--remote-debugging-port=%d' % port], stdin=subprocess.DEVNULL)
    page = None
    for _ in range(100):
        try:
            ls = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % port, timeout=2))
            page = next((x for x in ls if x.get('type') == 'page'), None)
            if page: break
        except Exception: pass
        time.sleep(0.3)
    time.sleep(1.5)
    real1 = os.path.getsize(REAL_LOG) if os.path.exists(REAL_LOG) else -1
    if not page or real1 != real0 or not os.path.exists(os.path.join(profile, 'notizen-log.txt')):
        kill(proc); raise SystemExit('ABBRUCH: keine Seite oder nicht das Testprofil')
    c = CDP(page['webSocketDebuggerUrl'])
    for _ in range(100):   # bis die App fertig geladen ist
        try:
            if c.js("document.readyState === 'complete' && typeof openNote === 'function' && !!db") is True: break
        except Exception: pass
        time.sleep(0.2)
    time.sleep(0.5)
    return proc, c

def kill(proc):
    subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)

def paced(points, fn, dt):
    t0 = time.perf_counter()
    for k, pt in enumerate(points):
        fn(*pt)
        w = t0 + (k + 1) * dt - time.perf_counter()
        if w > 0: time.sleep(w)

def pen(c, type, x, y, buttons):
    c.send('Input.dispatchMouseEvent', type=type, x=x, y=y, pointerType='pen', button='left' if buttons else 'none', buttons=buttons,
           clickCount=1 if type != 'mouseMoved' else 0, force=0.5 if buttons else 0)

def touch(c, type, pts):
    c.send('Input.dispatchTouchEvent', type=type, touchPoints=[{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)])

def pan(c, W, H, reps=4, n=150):
    for rep in range(reps):
        touch(c, 'touchStart', [(W / 2, H / 2)])
        pts = [(W / 2 - 400 * math.sin(i / n * math.pi), H / 2 - 250 * math.sin(i / n * math.pi * 2)) for i in range(n)]
        paced(pts, lambda x, y: touch(c, 'touchMove', [(x, y)]), 1 / 60)
        touch(c, 'touchEnd', [])
        time.sleep(0.3)

def zoom(c, W, H, reps=3):
    for rep in range(reps):
        cx, cy = W / 2, H / 2
        touch(c, 'touchStart', [(cx - 100, cy), (cx + 100, cy)])
        for i in range(120):
            d = 100 + 160 * math.sin(i / 120 * math.pi)
            touch(c, 'touchMove', [(cx - d, cy), (cx + d, cy)]); time.sleep(1 / 60)
        touch(c, 'touchEnd', []); time.sleep(0.4)

def write(c, strokes=18, y=260):
    for s in range(strokes):
        x0 = 150 + (s % 6) * 160
        if s % 6 == 0: y += 70
        pts = [(x0 + i * 2.2, y + 14 * math.sin(i / 4) + 6 * math.sin(i / 1.7)) for i in range(60)]
        pen(c, 'mouseMoved', *pts[0], 0); pen(c, 'mousePressed', *pts[0], 1)
        paced(pts[1:], lambda x, yy: pen(c, 'mouseMoved', x, yy, 1), 1 / 125)
        pen(c, 'mouseReleased', *pts[-1], 0)
        paced([(x0 + 140, y + 10 + j) for j in range(18)], lambda x, yy: pen(c, 'mouseMoved', x, yy, 0), 1 / 125)

def hover(c, W, H, n=600):
    pts = [(W / 2 + 300 * math.cos(i / 40), H / 2 + 200 * math.sin(i / 25)) for i in range(n)]
    paced(pts, lambda x, y: pen(c, 'mouseMoved', x, y, 0), 1 / 125)

SETUP = r'''
(async () => {
  const now = Date.now();
  await dbBookPut({ id: 'tb', name: 'Test', color: 'blue', created: now });
  const mk = (off) => { const out = []; let o = 0;
    for (let k = 0; k < 2500; k++) { const pts = []; const x0 = (k % 50) * 28 + off[0], y0 = Math.floor(k / 50) * 34 + off[1];
      for (let i = 0; i < 80; i++) pts.push(x0 + i * 0.3 + Math.cos(i / 3) * 4, y0 + Math.sin(i / 2.5) * 8, 0.3 + 0.5 * Math.abs(Math.sin(i / 7)));
      const s = makeStroke(pts, k % 7 === 0 ? '#1e88e5' : 'ink', 1.5 + (k % 3), false); s.o = o++; out.push(s); }
    return out; };
  const a = { id: 'tn', name: 'Unendlich', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 20, ty: 80, z: 1 }, book: 'tb' };
  const ia = mk([0, 0]); ia.forEach(s => s.n = 'tn');
  await writeRecords(a, ia, [], true);
  const b = { id: 'tp', name: 'A4', created: now + 1, updated: now, thumb: null, bg: 'grid', view: { tx: 300, ty: 90, z: 0.9 }, book: 'tb', paper: { f: 'a4', o: 'p', n: 3 } };
  const ib = mk([60, 60]).slice(0, 1500); ib.forEach(s => s.n = 'tp');
  await writeRecords(b, ib, [], true);
  homeBook = 'tb'; await renderHome(true);
  return document.querySelectorAll('.card').length;
})()
'''
