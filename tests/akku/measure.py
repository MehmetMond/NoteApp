# Verbrauch der echten Windows-App messen: CPU-Zeit je Prozess (Haupt-, Grafik-, Seitenprozess), GPU-Zeit (App und
# dwm) und Zähler in der Seite, je Ablauf (Leerlauf, Stift schweben, Schreiben, Verschieben, Zoomen, Radieren, Lasso,
# Tape, minimiert, Blatt-Dokument). Die App läuft mit einem leeren Testprofil, die eigenen Notizen bleiben unberührt.
# python measure.py <Notizen.exe> <Profilordner> <Ergebnis.json> [Phasen …]
# Vergleich zweier Läufe: python cmp_runs.py alt.json neu.json (am besten direkt nacheinander, gleicher Akkustand)
import sys, os, json, time, math, ctypes
from harness import *

EXE, PROFILE, OUT = sys.argv[1:4]
ONLY = set(sys.argv[4:])
EXE_N = os.path.normcase(os.path.abspath(EXE))

# Zähler im Seitenkontext, vor dem App-Skript eingerichtet
INSTR = r'''
window.__c = { raf: 0, to: 0, idle: 0 };
{ const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => r(t => { __c.raf++; cb(t); });
  const s = window.setTimeout.bind(window); window.setTimeout = (cb, ms, ...a) => s(typeof cb === 'function' ? (...x) => { __c.to++; cb(...x); } : cb, ms, ...a);
  if (window.requestIdleCallback) { const q = window.requestIdleCallback.bind(window); window.requestIdleCallback = (cb, o) => q(d => { __c.idle++; cb(d); }, o); } }
'''
# Funktionen der App zählen (nach dem Laden)
HOOK = r'''
(() => { if (window.__hooked) return; window.__hooked = true;
  for (const n of ['draw', 'drawLive', 'renderTile']) {
    const f = window[n]; __c[n] = 0; __c[n + 'Ms'] = 0;
    window[n] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { __c[n]++; __c[n + 'Ms'] += performance.now() - t; } };
  }
  return true; })()
'''

proc, c = launch(EXE, PROFILE)
res = {'exe': EXE, 'phases': {}}
try:
    c.send('Page.enable'); c.send('Runtime.enable'); c.send('Performance.enable')
    c.send('Page.addScriptToEvaluateOnNewDocument', source=INSTR)
    c.send('Page.reload'); time.sleep(1)
    for _ in range(100):
        if c.js("document.readyState === 'complete' && typeof openNote === 'function' && !!db") is True: break
        time.sleep(0.2)
    print('Karten:', c.js(SETUP)); c.js(HOOK)
    W, H, dpr = c.js('[innerWidth, innerHeight, devicePixelRatio]'); res['viewport'] = [W, H, dpr]

    def phase(name, fn):
        if ONLY and name not in ONLY: fn(); return
        a = sample(EXE_N); m0 = c.perf(); j0 = c.js('JSON.parse(JSON.stringify(__c))')
        fn()
        j1 = c.js('JSON.parse(JSON.stringify(__c))'); m1 = c.perf(); b = sample(EXE_N)
        d = delta(a, b)
        d['js'] = {k: round(j1[k] - j0.get(k, 0), 1) for k in j1}
        d['renderer_ms'] = {k: round((m1[k] - m0[k]) * 1000) for k in ('TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration')}
        d['anims'] = c.js('document.getAnimations().filter(a => a.playState === "running").length')
        res['phases'][name] = d
        print(name, json.dumps(d), flush=True)
    idle = lambda s: (lambda: time.sleep(s))
    # Stift verlässt die Fläche (wie auf dem Gerät: pointerleave), bevor mit dem Finger verschoben oder gezoomt wird
    def leave_pen():
        c.js("(typeof hovers !== 'undefined' ? [...hovers.keys()] : [2]).forEach(id => cvLive.dispatchEvent(new PointerEvent('pointerleave', { pointerId: id, pointerType: 'pen' })))")
        time.sleep(1.8)
    def drag(pts, dt=1 / 125):
        pen(c, 'mouseMoved', *pts[0], 0); pen(c, 'mousePressed', *pts[0], 1)
        paced(pts[1:], lambda x, y: pen(c, 'mouseMoved', x, y, 1), dt); pen(c, 'mouseReleased', *pts[-1], 0)

    time.sleep(1)
    phase('home_idle', idle(20))
    c.js("openNote(homeData.notes.find(n => n.id === 'tn'))"); time.sleep(0.3)
    phase('open_settle', idle(5))
    phase('note_idle', idle(30))
    phase('hover_10s', lambda: hover(c, W, H, 1250))
    phase('write_18', lambda: write(c))
    phase('after_write_idle', idle(10))
    leave_pen(); phase('pan_touch', lambda: pan(c, W, H))
    phase('after_pan_idle', idle(8))
    leave_pen(); phase('pinch_zoom', lambda: zoom(c, W, H))
    phase('after_zoom_idle', idle(10))
    def erase():
        c.js("setTool('eraser')")
        for k in range(4): drag([(200 + i * 4, 330 + 70 * k + 8 * math.sin(i / 3)) for i in range(100)])
        c.js("setTool('pen')")
    phase('erase', erase)
    phase('after_erase_idle', idle(8))
    def lasso_move():
        c.js("setTool('lasso')")
        drag([(150 + 600 * (i / 50), 250) for i in range(50)] + [(750, 250 + 300 * (i / 30)) for i in range(30)] + [(750 - 600 * (i / 50), 550) for i in range(50)] + [(150, 550 - 300 * (i / 30)) for i in range(30)])
        time.sleep(0.3); drag([(400 + i * 2, 400 + i) for i in range(120)]); time.sleep(0.3)
        c.js("clearSel(); setTool('pen')")
    phase('lasso_move', lasso_move)
    def tape():
        c.js("setTool('tape')")
        for k in range(4): drag([(200 + i * 4, 650 + 40 * k + 2 * math.sin(i / 5)) for i in range(100)])
        c.js("setTool('pen')")
    phase('tape', tape)
    # minimiert
    user32, hwnds = ctypes.windll.user32, []
    EnumProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def cb(h, _):
        pid = ctypes.c_ulong(); user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
        if pid.value == proc.pid and user32.IsWindowVisible(h): hwnds.append(h)
        return True
    user32.EnumWindows(EnumProc(cb), 0)
    if hwnds:
        user32.ShowWindow(hwnds[0], 6); time.sleep(1)
        phase('minimized', idle(20))
        user32.ShowWindow(hwnds[0], 9); time.sleep(1.5)
    # Blatt-Dokument (A4): Öffnen, Leerlauf, Verschieben
    c.js("closeNote()"); time.sleep(1.5)
    c.js("openNote(homeData.notes.find(n => n.id === 'tp'))"); time.sleep(0.3)
    phase('a4_open_settle', idle(5))
    phase('a4_idle', idle(15))
    leave_pen(); phase('a4_pan', lambda: pan(c, W, H))
finally:
    json.dump(res, open(OUT, 'w'), indent=1)
    kill(proc)
