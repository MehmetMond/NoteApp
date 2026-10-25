# Korrektheit der Live-Ebene in der echten App: nach jedem liveClear() muss sie ganz durchsichtig sein (sonst bleiben
# Reste stehen), ohne Inhalt ist sie ausgeblendet, beim Schweben des Stifts sichtbar. Dazu alle Werkzeuge.
# python test_live.py <Notizen.exe> <Profil>
import sys, os, json, time, math
from harness import *

exe, profile = sys.argv[1:3]
proc, c = launch(exe, profile)
fails = []
def check(ok, what):
    print(('ok   ' if ok else 'FEHLER ') + what, flush=True)
    if not ok: fails.append(what)

HOOK = r'''
(() => {
  window.__lc = { n: 0, bad: [] }; window.__errs = [];
  addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push(String(e.reason)));
  const empty = () => { const d = ctxLive.getImageData(0, 0, cvLive.width, cvLive.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return i >> 2; return -1; };
  window.__empty = empty;
  const f = liveClear;
  liveClear = function () {
    const had = liveBB; f(); __lc.n++;
    const p = empty();
    if (p >= 0) __lc.bad.push({ n: __lc.n, x: p % cvLive.width, y: (p / cvLive.width) | 0, bb: had && had.map(Math.round), tool: S.tool, act: action && action.kind });
  };
  return true;
})()
'''
def state(): return c.js("({ n: __lc.n, bad: __lc.bad.slice(0, 5), nbad: __lc.bad.length, op: cvLive.style.opacity, bb: liveBB, sel: !!S.sel, hov: hovers.size, items: S.items.length })")

def stroke(pts, ptype='pen', hold=0):
    move = lambda x, y, b: c.send('Input.dispatchMouseEvent', type='mouseMoved', x=x, y=y, pointerType=ptype, button='left' if b else 'none', buttons=b, force=0.5 if b else 0)
    move(*pts[0], 0)
    c.send('Input.dispatchMouseEvent', type='mousePressed', x=pts[0][0], y=pts[0][1], pointerType=ptype, button='left', buttons=1, clickCount=1, force=0.5)
    paced(pts[1:], lambda x, y: move(x, y, 1), 1 / 125)
    if hold: time.sleep(hold)
    c.send('Input.dispatchMouseEvent', type='mouseReleased', x=pts[-1][0], y=pts[-1][1], pointerType=ptype, button='left', buttons=0, clickCount=1, force=0)
    time.sleep(0.15)
def wave(x0, x1, y, amp=8, step=3):
    return [(x0 + i * step, y + amp * math.sin(i / 3)) for i in range(int((x1 - x0) / step) + 1)]
def key(k):
    c.send('Input.dispatchKeyEvent', type='keyDown', key=k, text=k); c.send('Input.dispatchKeyEvent', type='keyUp', key=k)
def settle(): time.sleep(0.35)

try:
    c.send('Runtime.enable')
    c.js(SETUP); time.sleep(0.5)
    c.js("openNote(homeData.notes.find(n => n.id === 'tn'))"); time.sleep(2)
    c.js(HOOK)
    W, H = c.js('[innerWidth, innerHeight]')
    st = state(); check(st['op'] == '0', 'nach dem Öffnen ausgeblendet (opacity %r)' % st['op'])

    # Stift schwebt: sichtbar; Schreiben; danach leer
    c.send('Input.dispatchMouseEvent', type='mouseMoved', x=300, y=300, pointerType='pen', button='none', buttons=0)
    settle(); st = state(); check(st['op'] == '', 'Stift schwebt: sichtbar (%r)' % st['op'])
    for y in (300, 360, 420): stroke(wave(200, 700, y))
    settle(); st = state(); check(st['bb'] is None and st['op'] == '' and st['nbad'] == 0, 'Schreiben: leer, sichtbar, %d mal geleert, Fehler %s' % (st['n'], st['bad']))
    # Stift weg: nach 1,5 s ausgeblendet
    c.send('Input.dispatchMouseEvent', type='mouseMoved', x=W + 50, y=300, pointerType='pen', button='none', buttons=0)
    c.js("cvLive.dispatchEvent(new PointerEvent('pointerleave', { pointerId: [...hovers.keys()][0], pointerType: 'pen' }))")
    time.sleep(0.3); check(state()['op'] == '', 'kurz nach dem Verlassen noch sichtbar')
    time.sleep(1.5); check(state()['op'] == '0', 'Stift weg: ausgeblendet (%r)' % state()['op'])

    # Textmarker, auch gerade (halten), Tape (gerade durch Halten, Antippen)
    key('m'); stroke(wave(180, 720, 360, 2)); stroke(wave(180, 600, 420, 1), hold=0.7)
    key('t'); stroke(wave(180, 520, 480, 2)); stroke(wave(200, 520, 540, 1), hold=0.7)
    stroke([(300, 480), (300, 480)]); stroke([(300, 480), (300, 480)])   # Tape auf- und zudecken
    settle(); st = state(); check(st['bb'] is None and st['nbad'] == 0, 'Textmarker/Tape: leer, Fehler %s' % st['bad'])

    # Radierer, auch mit der Maus
    key('e'); stroke(wave(250, 650, 300, 10)); stroke(wave(250, 650, 420, 10), ptype='mouse')
    settle(); st = state(); check(st['bb'] is None and st['nbad'] == 0, 'Radierer: leer, Fehler %s' % st['bad'])

    # Lasso: wählen, verschieben, skalieren (Griff), mit Auswahl verschieben (Finger), Auswahl weg
    key('l'); stroke([(150, 250), (760, 250), (760, 600), (150, 600), (150, 250)])
    settle(); st = state(); check(st['sel'] and st['bb'] is not None and st['op'] == '', 'Lasso: Auswahl sichtbar')
    stroke(wave(400, 520, 420, 0, 4))
    b = c.js("(() => { const b = S.sel.bb; return toScreen(b[2], b[3]); })()")
    stroke([(b[0], b[1])] + [(b[0] + i * 3, b[1] + i * 2) for i in range(30)])
    pan(c, W, H, reps=1, n=60)
    settle(); st = state(); check(st['nbad'] == 0, 'Auswahl verschieben/skalieren/Ansicht verschieben: Fehler %s' % st['bad'])
    key('p'); settle(); st = state(); check(st['bb'] is None and not st['sel'] and st['nbad'] == 0, 'Auswahl weg: leer (%s)' % st['bad'])

    # Formen: Rechteck, Ellipse, Pfeil, Koordinatensystem
    for k in ('rect', 'ellipse', 'arrow', 'axes2'):
        c.js(f"setShape('{k}'); setTool('shape')")
        stroke([(300 + i * 4, 300 + i * 3) for i in range(60)])
    settle(); st = state(); check(st['bb'] is None and st['nbad'] == 0, 'Formen: leer, Fehler %s' % st['bad'])
    # eigene Formen: klein (genaue Vorschau) und groß (> 4000 Punkte, Vorschau als Bild)
    c.js(r'''(async () => {
      const mk = (id, n) => { const strokes = []; for (let k = 0; k < n; k++) { const p = new Float32Array(300); for (let i = 0; i < 100; i++) { p[i*3] = k * 6 + i * 0.4; p[i*3+1] = 20 * Math.sin(i / 9 + k); p[i*3+2] = 0.5; } strokes.push({ c: 'ink', w: 2, hl: false, pts: p }); }
        const g = geoBox(strokes); for (const st of strokes) for (let i = 0; i < st.pts.length; i += 3) { st.pts[i] -= g[0]; st.pts[i+1] -= g[1]; }
        const b = geoBox(strokes); return { id, name: id, created: Date.now(), w: b[2], h: b[3], strokes }; };
      for (const r of [mk('klein', 5), mk('gross', 60)]) { await dbShapePut(r); CUSTOM.push(r); }
      return CUSTOM.length; })()''')
    for k in ('custom:klein', 'custom:gross'):
        c.js(f"setShape('{k}'); setTool('shape')")
        stroke([(300 + i * 5, 300 + i * 3) for i in range(60)], hold=0.4)
        stroke([(500, 500), (500, 500)])
    settle(); time.sleep(0.4); st = state(); check(st['bb'] is None and st['nbad'] == 0, 'eigene Formen: leer, Fehler %s' % st['bad'])

    # Zoomen während des Schreibens (Strg+Rad), Strich über den Rand, dann Zoom zurück
    key('p')
    c.send('Input.dispatchMouseEvent', type='mouseMoved', x=200, y=650, pointerType='pen', button='none', buttons=0)
    c.send('Input.dispatchMouseEvent', type='mousePressed', x=200, y=650, pointerType='pen', button='left', buttons=1, clickCount=1, force=0.5)
    for i in range(40):
        c.send('Input.dispatchMouseEvent', type='mouseMoved', x=200 + i * 8, y=650 + 10 * math.sin(i / 3), pointerType='pen', button='left', buttons=1, force=0.5)
        if i % 10 == 5: c.send('Input.dispatchMouseEvent', type='mouseWheel', x=600, y=500, deltaX=0, deltaY=-60, modifiers=2)
        time.sleep(0.01)
    c.send('Input.dispatchMouseEvent', type='mouseReleased', x=520, y=650, pointerType='pen', button='left', buttons=0, clickCount=1)
    time.sleep(0.6)
    stroke([(W - 150 + i * 4, 500) for i in range(60)])   # bis über den rechten Rand
    settle(); st = state(); check(st['bb'] is None and st['nbad'] == 0, 'Zoomen beim Schreiben, Strich über den Rand: leer, Fehler %s' % st['bad'])
    # Fenstergröße ändern (Live-Ebene wird neu angelegt)
    c.js("window.resizeBy ? 0 : 0");
    c.send('Emulation.setDeviceMetricsOverride', width=int(W) - 200, height=int(H) - 100, deviceScaleFactor=0, mobile=False); time.sleep(0.6)
    stroke(wave(200, 500, 300)); c.send('Emulation.clearDeviceMetricsOverride'); time.sleep(0.6); stroke(wave(200, 500, 360))
    settle(); st = state(); check(st['bb'] is None and st['nbad'] == 0, 'Fenstergröße: leer, Fehler %s' % st['bad'])
    # Finger zeichnet: immer sichtbar
    c.js("S.fingerDraw = true; liveVis()"); check(state()['op'] == '', 'Finger zeichnet: sichtbar')
    c.js("S.fingerDraw = false; liveVis()")
    # Maus: nach 10 s Ruhe ausgeblendet (vorher den Stift wegnehmen)
    c.js("for (const id of [...hovers.keys()]) if (id !== 1) cvLive.dispatchEvent(new PointerEvent('pointerleave', { pointerId: id, pointerType: 'pen' }))"); time.sleep(1.7)
    check(state()['op'] == '0', 'ohne Stift und Maus: ausgeblendet')
    c.send('Input.dispatchMouseEvent', type='mouseMoved', x=400, y=400, pointerType='mouse', button='none', buttons=0); time.sleep(0.3)
    check(state()['op'] == '', 'Maus bewegt: sichtbar')
    time.sleep(10.5); check(state()['op'] == '0', 'Maus 10 s still: ausgeblendet (%r)' % state()['op'])
    st = state(); print('liveClear-Aufrufe geprüft:', st['n'], 'Striche:', st['items'])
    errs = c.js("window.__errs || []"); check(not errs, 'keine Fehler in der Seite %s' % errs)
finally:
    kill(proc)
print('FEHLER:' if fails else 'ALLES OK', fails)
sys.exit(1 if fails else 0)
