# Flackern beim Reinzoomen mit zwei Fingern auf PDF-Seiten nachstellen (echte App, leeres Testprofil): Notiz mit
# PDF-artigen Folienbildern (wie insertPdf: volle JPEG-Fassung ~2,2-fach, kleine 640 px), Zwei-Finger-Zoom über CDP,
# Mitschnitt jedes Compositor-Bilds (Page.startScreencast) und jedes draw() (Ansicht, Stufe, fehlende Kacheln).
# python -X utf8 pdfzoom.py <Notizen.exe> <Profil (neu)> <Ausgabeordner> [--von 0.33] [--bis 2.0] [--sek 1.0]
import sys, os, json, time, math, base64, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import launch, kill
import websocket

ap = argparse.ArgumentParser(); ap.add_argument('exe'); ap.add_argument('profile'); ap.add_argument('out')
ap.add_argument('--von', type=float, default=0.33); ap.add_argument('--bis', type=float, default=2.0); ap.add_argument('--sek', type=float, default=1.0)
ap.add_argument('--port', type=int, default=9340)
ap.add_argument('--seiten', type=int, default=54, help='Zahl der PDF-Seiten (untereinander)')
ap.add_argument('--zurueck', type=float, default=0.2, help='danach wieder rauszoomen bis zu diesem Zoom (0 = nicht)')
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)

proc, c0 = launch(args.exe, args.profile, args.port)
ws_url = c0.ws.url if hasattr(c0.ws, 'url') else None
import urllib.request
page = next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % args.port)) if x.get('type') == 'page')

class C:
    """CDP mit Ereignissen: Bilder des Screencasts werden gesammelt und sofort bestätigt"""
    def __init__(self, url):
        self.ws = websocket.create_connection(url, suppress_origin=True, timeout=120); self.n = 0; self.frames = []
    def _handle(self, m):
        if m.get('method') == 'Page.screencastFrame':
            p = m['params']; self.frames.append((p['metadata'].get('timestamp'), p['data']))
            self.n += 1; self.ws.send(json.dumps({'id': self.n, 'method': 'Page.screencastFrameAck', 'params': {'sessionId': p['sessionId']}}))
    def send(self, method, **params):
        self.n += 1; i = self.n
        self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == i:
                if 'error' in m: raise RuntimeError(method + ': ' + json.dumps(m['error']))
                return m.get('result', {})
            self._handle(m)
    def js(self, e):
        r = self.send('Runtime.evaluate', expression=e, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'])[:600])
        return r['result'].get('value')
    def pump(self, sec):
        t0 = time.time(); self.ws.settimeout(0.05)
        while time.time() - t0 < sec:
            try: self._handle(json.loads(self.ws.recv()))
            except Exception: pass
        self.ws.settimeout(120)
c = C(page['webSocketDebuggerUrl'])

SETUP = r'''
(async () => {
  const now = Date.now(), N = %N%, PW = 1094, PH = 773;   // Folien wie in der echten Notiz (54 Stück, 1094 breit)
  await dbBookPut({ id: 'tb', name: 'Test', color: 'blue', created: now });
  const items = [];
  for (let k = 0; k < N; k++) {
    const c = document.createElement('canvas'); c.width = Math.round(PW * 2.2); c.height = Math.round(PH * 2.2);
    const g = c.getContext('2d'), s = c.width / PW;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(s, s);
    g.fillStyle = '#1f6fb2'; g.fillRect(60, 170, 600, 26); g.fillStyle = '#c0102a'; g.font = 'bold 36px Arial'; g.fillText('HM', 40, 640);
    g.fillStyle = '#222'; g.font = '30px Calibri, Arial'; g.fillText('1.4   Folie ' + (k + 1) + ': Korrelation, Festlegung M, t_int', 40, 70);
    g.font = '15px Calibri, Arial';
    for (let l = 0; l < 22; l++) g.fillText('• Zeile ' + (l + 1) + ' mit etwas Text, Formeln x1(t) · x2(t − τ) dt und Zahlen ' + (k * 31 + l * 7), 70, 230 + l * 17);
    g.strokeStyle = '#c0102a'; g.lineWidth = 3; g.strokeRect(520, 220, 360, 120);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.9), low = await makeLow(c, 'image/jpeg');
    const imgId = uid(); await dbImagePut({ id: imgId, n: 'pdf', blob, low, w: c.width, h: c.height });
    items.push({ t: 'i', id: uid(), img: imgId, x: 0, y: k * (PH + 30), w: PW, h: PH, pdf: 'test.pdf', page: k + 1, o: k, n: 'pdf' });
    c.width = c.height = 0;
  }
  const n = { id: 'pdf', name: 'PDF', created: now, updated: now, thumb: null, bg: 'dots', view: { tx: 500, ty: 120 - Math.floor(N / 2) * (PH + 30) * %VON%, z: %VON% }, book: 'tb' };
  await writeRecords(n, items, [], true);
  homeBook = 'tb'; await renderHome(true);
  return items.length;
})()
'''.replace('%VON%', str(args.von)).replace('%N%', str(args.seiten))
HOOK = r'''
(() => { window.__D = []; const f = window.draw;
  // Anteil des Bildschirms ohne scharfe Kachel (weder aktuelle noch Ersatzstufe): dort ist nur die Übersicht zu sehen
  const cov = () => { let none = 0, n = 0;
    const has = (L, wx, wy) => { if (L == null) return false; const s = L * DPR, i = Math.floor(wx * s / T), j = Math.floor(wy * s / T); return tiles.has(tkey(L, i, j)) || stale.has(tkey(L, i, j)); };
    for (let a = 0.05; a < 1; a += 0.1) for (let b = 0.15; b < 1; b += 0.1) { const [wx, wy] = toWorld(a * VW, b * VH); n++; if (!has(S.level, wx, wy) && !has(fallbackL, wx, wy)) none++; }
    return +(none / n).toFixed(2); };
  window.draw = function () { const t0 = performance.now(); const r = f.apply(this, arguments);
    __D.push({ t: Math.round(t0), ms: +(performance.now() - t0).toFixed(1), z: +S.view.z.toFixed(3), L: +S.level.toFixed(3), fb: fallbackL == null ? null : +fallbackL.toFixed(3),
      g: !!gesture, tiles: tiles.size, stale: stale.size, tf: cvMain.style.transform, leer: cov(), ov: ov ? [ov.c.width, ov.c.height] : null }); return r; };
  window.__I = []; const inv = window.invalidateImage; window.invalidateImage = function (id) { __I.push(Math.round(performance.now())); return inv.apply(this, arguments); };
  return true; })()
'''
try:
    c.send('Runtime.enable'); c.send('Page.enable')
    print('Folien:', c.js(SETUP), flush=True)
    c.js("openNote(homeData.notes.find(n => n.id === 'pdf'))"); time.sleep(3)
    for _ in range(100):   # bis die Übersicht steht (wie in der echten App nach kurzer Zeit)
        if c.js('!!ov && ov.items === S.items'): break
        time.sleep(0.2)
    print('Übersicht:', c.js('ov ? [ov.c.width, ov.c.height, +ov.s.toFixed(4), Math.round(S.items[0].w * ov.s)] : null'), '(Breite, Höhe, Maßstab, Folienbreite in px)', flush=True)
    print('Hook:', c.js(HOOK), flush=True)
    W, H, dpr = c.js('[innerWidth, innerHeight, devicePixelRatio]')
    t_ref = c.js('performance.now()'); wall_ref = time.time()
    c.send('Page.startScreencast', format='jpeg', quality=55, maxWidth=int(W), maxHeight=int(H), everyNthFrame=1)
    c.pump(0.8)
    cx, cy = W * 0.55, H * 0.5; steps = int(args.sek * 60)
    tp = lambda d: [{'x': cx - d / 2, 'y': cy, 'id': 0}, {'x': cx + d / 2, 'y': cy, 'id': 1}]
    gesten = []
    def pinch(z0, z1):
        d0 = 120 if z1 > z0 else 1200; d1 = d0 * z1 / z0
        a = c.js('performance.now()')
        c.send('Input.dispatchTouchEvent', type='touchStart', touchPoints=tp(d0))
        for i in range(1, steps + 1):
            c.send('Input.dispatchTouchEvent', type='touchMove', touchPoints=tp(d0 * (d1 / d0) ** (i / steps))); c.pump(1 / 60)
        c.send('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        gesten.append((a, c.js('performance.now()'), z0, z1))
    t_start = c.js('performance.now()')
    pinch(args.von, args.bis); c.pump(2.0)
    if args.zurueck: pinch(c.js('S.view.z'), args.zurueck); c.pump(2.0)
    t_end = c.js('performance.now()')
    c.send('Page.stopScreencast'); c.pump(0.3)
    D, I = c.js('__D'), c.js('__I')
    json.dump({'draw': D, 'invalidate': I, 'geste': [t_start, t_end], 'frames': [f[0] for f in c.frames], 'wall_ref': wall_ref, 't_ref': t_ref}, open(os.path.join(args.out, 'log.json'), 'w'), indent=0)
    for k, (ts, data) in enumerate(c.frames): open(os.path.join(args.out, f's{k:03d}.jpg'), 'wb').write(base64.b64decode(data))
    print(f'{len(c.frames)} Compositor-Bilder, {len(D)} draw(), {len(I)} nachgeladene Bilder', flush=True)
    res = []
    for a, b, z0, z1 in gesten:
        dur = [d for d in D if a <= d['t'] <= b]; nach = [d for d in D if b < d['t'] <= b + 1500]
        leer = [d['leer'] for d in dur]
        r = {'geste': f'{z0:.2f} -> {z1:.2f}', 'draws': len(dur), 'nur_uebersicht_mittel': round(sum(leer) / max(1, len(leer)), 3), 'nur_uebersicht_max': max(leer or [0]),
             'bilder_mit_ueber_50pct_nur_uebersicht': sum(1 for v in leer if v > 0.5), 'nach_loslassen_max': max([d['leer'] for d in nach] or [0]),
             'stufenwechsel': [(d['L'], d['fb']) for i, d in enumerate(dur) if i and d['L'] != dur[i - 1]['L']]}
        res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
    json.dump(res, open(os.path.join(args.out, 'ergebnis.json'), 'w'), indent=1)
finally:
    kill(proc)
