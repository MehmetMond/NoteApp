# Flackern beim Zoomen in der laufenden App mitschneiden (App mit --remote-debugging-port gestartet): jedes Compositor-Bild
# (Page.startScreencast), dazu je draw() Ansicht, Kachelstufe, Rückfallstufe, Geste, Kacheln, Verschiebung der Leinwand und
# jedes nachgeladene Bild (volle Fassung einer PDF-Seite). An den Notizen ändert sich nichts (nur Mitschreiben).
# python -X utf8 zoomtrace.py <port> <Ausgabeordner> <Stopp-Datei> [Höchstdauer s]
import sys, os, json, time, base64, urllib.request
import websocket

port, out, stop = int(sys.argv[1]), sys.argv[2], sys.argv[3]
maxs = float(sys.argv[4]) if len(sys.argv) > 4 else 600
os.makedirs(out, exist_ok=True)
page = next(x for x in json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % port)) if x.get('type') == 'page')
ws = websocket.create_connection(page['webSocketDebuggerUrl'], suppress_origin=True, timeout=120)
n = [0]; frames = []
def handle(m):
    if m.get('method') == 'Page.screencastFrame':
        p = m['params']; frames.append((p['metadata'].get('timestamp'), p['data']))
        n[0] += 1; ws.send(json.dumps({'id': n[0], 'method': 'Page.screencastFrameAck', 'params': {'sessionId': p['sessionId']}}))
def send(method, **params):
    n[0] += 1; i = n[0]; ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == i: return m.get('result', {})
        handle(m)
def js(e):
    r = send('Runtime.evaluate', expression=e, awaitPromise=True, returnByValue=True)
    return r.get('result', {}).get('value')
HOOK = r'''
(() => { if (window.__Z) return 'schon'; const Z = window.__Z = { d: [], inv: [], tp: [] };
  const f = window.draw;
  window.draw = function () { const t0 = performance.now(); const r = f.apply(this, arguments);
    Z.d.push([Math.round(t0), +(performance.now() - t0).toFixed(1), +S.view.z.toFixed(3), Math.round(S.view.tx), Math.round(S.view.ty), +S.level.toFixed(3),
      fallbackL == null ? null : +fallbackL.toFixed(3), gesture ? (gesture.n || 1) : 0, tiles.size, stale.size, cvMain.style.transform, S.note ? S.note.id : null]);
    if (Z.d.length > 20000) Z.d.shift(); return r; };
  const inv = window.invalidateImage; window.invalidateImage = function (id) { Z.inv.push([Math.round(performance.now()), id]); return inv.apply(this, arguments); };
  for (const t of ['pointerdown', 'pointerup', 'pointercancel']) cvLive.addEventListener(t, e => { if (e.pointerType === 'touch') Z.tp.push([Math.round(e.timeStamp), t, touches.size]); }, true);
  return true; })()
'''
send('Runtime.enable'); send('Page.enable')
print('Hook:', js(HOOK), flush=True)
t_ref = js('performance.now()'); w_ref = time.time()
W, H = js('[innerWidth, innerHeight]')
send('Page.startScreencast', format='jpeg', quality=50, maxWidth=int(W), maxHeight=int(H), everyNthFrame=1)
if os.path.exists(stop): os.remove(stop)
print('BEREIT', time.strftime('%H:%M:%S'), flush=True)
t0 = time.time(); ws.settimeout(0.05)
while not os.path.exists(stop) and time.time() - t0 < maxs:
    try: handle(json.loads(ws.recv()))
    except Exception: pass
ws.settimeout(120)
send('Page.stopScreencast')
Z = js('__Z')
json.dump({'Z': Z, 'frames': [f[0] for f in frames], 't_ref': t_ref, 'w_ref': w_ref}, open(os.path.join(out, 'log.json'), 'w'))
for k, (ts, data) in enumerate(frames): open(os.path.join(out, f's{k:04d}.jpg'), 'wb').write(base64.b64decode(data))
print(len(frames), 'Bilder,', len(Z['d']), 'draw(),', len(Z['inv']), 'nachgeladene Bilder', flush=True)
