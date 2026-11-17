# Verschwindet beim Zoomen mit zwei Fingern ein Teil der PDF-Seiten? Echte App, leeres Testprofil, Notiz mit PDF-artigen
# Folien (wie pdfzoom.py), aber kalt geöffnet wie nach einem App-Start (keine Bilder im Speicher) und bei einem Zoom, bei
# dem die kleinen Fassungen reichen: beim Reinzoomen werden die vollen Fassungen erst nachgeladen. Gemessen wird am Bild
# selbst (Page.startScreencast): in jedem Compositor-Bild der Anteil der Folienfläche auf dem Bildschirm, der nicht weiß
# ist (Messpunkte im weißen Rand jeder Folie) – dort fehlt die PDF-Seite.
# python -X utf8 pdfloch.py <Notizen.exe> <Profil (neu)> <Ausgabeordner> [--zoom 0.3,1.5,0.2,0.8,0.15] [--seiten 54]
import sys, os, json, time, base64, argparse, bisect
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import launch, kill
import websocket, urllib.request
import numpy as np, cv2

ap = argparse.ArgumentParser(); ap.add_argument('exe'); ap.add_argument('profile'); ap.add_argument('out')
ap.add_argument('--zoom', default='0.3,1.5,0.2,0.8,0.15', help='Start-Zoom und die Ziele der Gesten nacheinander')
ap.add_argument('--sek', type=float, default=0.8); ap.add_argument('--pause', type=float, default=1.5)
ap.add_argument('--port', type=int, default=9341); ap.add_argument('--seiten', type=int, default=54)
ap.add_argument('--weiter', type=int, default=15, help='nach dem Öffnen so viele Folien weiterblättern (0 = an der Öffnungsstelle zoomen)')
args = ap.parse_args(); os.makedirs(args.out, exist_ok=True)
ZO = [float(x) for x in args.zoom.split(',')]; PW, PH, GAPY = 1094, 773, 30

proc, c0 = launch(args.exe, args.profile, args.port)
page = next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % args.port)) if x.get('type') == 'page')

class C:
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
  const now = Date.now(), N = %N%, PW = 1094, PH = 773;
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
  // Vorschaubild schon da (wie bei einer bestehenden Notiz): die Startseite lädt die Bilder dann nicht
  const n = { id: 'pdf', name: 'PDF', created: now, updated: now, thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', bg: 'dots',
    view: { tx: innerWidth / 2 - PW / 2 * %Z0%, ty: innerHeight / 2 - (Math.floor(N / 2) * (PH + 30) + PH / 2) * %Z0%, z: %Z0% }, book: 'tb' };
  await writeRecords(n, items, [], true);
  homeBook = 'tb'; await renderHome(true);
  releaseImages();   // kalt wie nach einem App-Start
  return items.length;
})()
'''.replace('%Z0%', str(ZO[0])).replace('%N%', str(args.seiten))
HOOK = r'''
(() => { window.__D = []; const f = window.draw;
  window.draw = function () { const t0 = performance.now(); const r = f.apply(this, arguments);
    __D.push([Math.round(t0), +S.view.z.toFixed(4), +S.view.tx.toFixed(1), +S.view.ty.toFixed(1), +S.level.toFixed(3), fallbackL == null ? null : +fallbackL.toFixed(3), gesture ? 1 : 0, tiles.size]); return r; };
  window.__I = []; const inv = window.invalidateImage; window.invalidateImage = function (id) { __I.push(Math.round(performance.now())); return inv.apply(this, arguments); };
  return true; })()
'''
# Übersicht: wie viele Folien sind darin wirklich als Bild (weißer Rand der Folie), wie viele nur Platzhalter?
OVCHECK = r'''
(() => { if (!ov) return null; const g = ov.c.getContext('2d'); let ok = 0, n = 0;
  for (const it of S.items) if (it.t === 'i') { n++; const x = Math.round((it.x + it.w * 0.9 - ov.box[0]) * ov.s), y = Math.round((it.y + it.h * 0.5 - ov.box[1]) * ov.s);
    const d = g.getImageData(x, y, 1, 1).data; if (d[3] > 200 && d[0] > 200 && d[1] > 200 && d[2] > 200) ok++; }
  return [ok, n, ov.c.width, ov.c.height]; })()
'''
try:
    c.send('Runtime.enable'); c.send('Page.enable')
    print('Folien:', c.js(SETUP), flush=True)
    print('Hook:', c.js(HOOK), flush=True)
    c.js("openNote(homeData.notes.find(n => n.id === 'pdf'))"); time.sleep(1.0)
    for _ in range(100):
        if c.js('!!ov && ov.items === S.items'): break
        time.sleep(0.1)
    time.sleep(0.5)
    ovc = c.js(OVCHECK); print('Übersicht: %s von %s Folien als Bild (%s x %s px)' % tuple(ovc) if ovc else 'Übersicht: keine', flush=True)
    # wie Blättern im Skript: zu Folien weiter oben springen (ihre Kacheln und kleinen Fassungen entstehen dort neu)
    if args.weiter: c.js('setView(S.view.tx, S.view.ty + %d * %d * S.view.z, S.view.z, true)' % (args.weiter, PH + GAPY)); time.sleep(1.5)
    W, H, dpr = c.js('[innerWidth, innerHeight, devicePixelRatio]'); rc = c.js('(() => { const r = cvLive.getBoundingClientRect(); return [r.left, r.top]; })()')
    t_ref = c.js('performance.now()'); wall_ref = time.time()
    c.send('Page.startScreencast', format='jpeg', quality=60, maxWidth=int(W), maxHeight=int(H), everyNthFrame=1)
    c.pump(0.5)
    cx, cy = W * 0.5, H * 0.5; steps = int(args.sek * 60)
    tp = lambda d: [{'x': cx - d / 2, 'y': cy, 'id': 0}, {'x': cx + d / 2, 'y': cy, 'id': 1}]
    gesten = []
    def pinch(z1):
        z0 = c.js('S.view.z'); d0 = 120 if z1 > z0 else 1200; d1 = d0 * z1 / z0
        a = c.js('performance.now()')
        c.send('Input.dispatchTouchEvent', type='touchStart', touchPoints=tp(d0))
        for i in range(1, steps + 1):
            c.send('Input.dispatchTouchEvent', type='touchMove', touchPoints=tp(d0 * (d1 / d0) ** (i / steps))); c.pump(1 / 60)
        c.send('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        gesten.append((a, c.js('performance.now()'), z0, c.js('S.view.z')))
    for z in ZO[1:]: pinch(z); c.pump(args.pause)
    c.send('Page.stopScreencast'); c.pump(0.3)
    D, I = c.js('__D'), c.js('__I'); ovc2 = c.js(OVCHECK)
finally:
    kill(proc)

# Auswertung am Bild
Dt = [d[0] for d in D]; rows = []
pts = [(fx, fy) for fx in (0.84, 0.88, 0.92) for fy in (0.12, 0.25, 0.4, 0.55, 0.7, 0.85)]   # weißer Rand jeder Folie
for k, (ts, data) in enumerate(c.frames):
    im = cv2.imdecode(np.frombuffer(base64.b64decode(data), np.uint8), cv2.IMREAD_COLOR); fh, fw = im.shape[:2]; sc = fw / W
    t = t_ref + (ts - wall_ref) * 1000; j = bisect.bisect_right(Dt, t) - 1
    if j < 0: continue
    _, z, tx, ty, L, fb, g, nt = D[j]; n = miss = 0
    k0 = max(0, int((-ty / z) // (PH + GAPY)) - 1); k1 = min(args.seiten - 1, int(((H - ty) / z) // (PH + GAPY)) + 1)
    for s in range(k0, k1 + 1):
        for fx, fy in pts:
            x = (fx * PW * z + tx + rc[0]) * sc; y = ((s * (PH + GAPY) + fy * PH) * z + ty + rc[1]) * sc
            if x < 4 or x > fw - 5 or y < 90 * sc or y > fh - 5: continue   # oben liegt die Leiste
            n += 1; b = im[int(y) - 1:int(y) + 2, int(x) - 1:int(x) + 2].reshape(-1, 3).mean(0)
            if b.min() < 170: miss += 1
    rows.append((k, t, z, L, fb, g, n, miss, miss / n if n else 0.0))
    if n and miss / n > 0.25: cv2.imwrite(os.path.join(args.out, f'loch{k:03d}.jpg'), im)
res = {'uebersicht_vorher': ovc, 'uebersicht_nachher': ovc2, 'nachgeladen': len(I), 'bilder': len(rows), 'gesten': []}
for a, b, z0, z1 in gesten:
    dur = [r for r in rows if a <= r[1] <= b]; nach = [r for r in rows if b < r[1] <= b + args.pause * 1000]
    st = lambda rs: {'bilder': len(rs), 'fehlt_mittel': round(float(np.mean([r[8] for r in rs])) if rs else 0, 3), 'fehlt_max': round(max([r[8] for r in rs] or [0]), 2),
                     'bilder_ueber_10pct': sum(1 for r in rs if r[8] > 0.1)}
    lz = [r for r in nach if r[8] > 0.02]
    e = {'geste': f'{z0:.2f} -> {z1:.2f}', 'waehrend': st(dur), 'danach': st(nach), 'luecke_bis_ms_nach_loslassen': round(lz[-1][1] - b) if lz else 0}
    res['gesten'].append(e); print(json.dumps(e, ensure_ascii=False), flush=True)
print('nachgeladene volle Seiten:', len(I), '| Übersicht am Ende:', ovc2)
json.dump(res, open(os.path.join(args.out, 'ergebnis.json'), 'w'), indent=1, ensure_ascii=False)
json.dump({'rows': rows, 'gesten': gesten, 'inv': I}, open(os.path.join(args.out, 'log.json'), 'w'))
