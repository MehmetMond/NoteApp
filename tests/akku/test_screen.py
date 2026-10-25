# Bildschirmfotos (fertig gezeichnet) bei festen Ansichten und Änderungen; dazu in derselben App je Foto ein zweites nach
# erzwungenem vollem Neuzeichnen. python test_screen.py <Notizen.exe> <Profil> <Ordner>
import sys, os, json, time, base64
from harness import *

exe, profile, outdir = sys.argv[1:4]
os.makedirs(outdir, exist_ok=True)
proc, c = launch(exe, profile)
n = 0
SETTLE = r'''(async () => {   // warten, bis nichts mehr zu zeichnen ist
  const f = () => new Promise(r => requestAnimationFrame(() => r()));
  for (let k = 0; k < 400; k++) { await f(); if (!drawQ && !liveQ && !prefetchQ && !(typeof wheelT !== 'undefined' && wheelT)) { await f(); await f(); if (!drawQ) return k; } }
  return -1; })()'''
FULL = r'''(async () => { if (typeof orgX !== 'undefined') { orgX = Math.round(S.view.tx * DPR) + 1e9; } shownSig = ''; draw();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()'''
def shot(name, full_too=True):
    global n
    n += 1
    k = c.js(SETTLE)
    png = base64.b64decode(c.send('Page.captureScreenshot', format='png')['data'])
    open(os.path.join(outdir, '%02d_%s.png' % (n, name)), 'wb').write(png)
    if full_too:
        c.js(FULL); c.js(SETTLE)
        png2 = base64.b64decode(c.send('Page.captureScreenshot', format='png')['data'])
        open(os.path.join(outdir, '%02d_%s.voll.png' % (n, name)), 'wb').write(png2)
    print(n, name, 'gewartet', k, flush=True)

try:
    c.send('Runtime.enable')
    c.js(SETUP); time.sleep(0.3)
    c.js("openNote(homeData.notes.find(n => n.id === 'tn'))"); time.sleep(1)
    c.js("setTool('lasso'); penDot.style.display = ''")   # kein Punkt, kein Fadenkreuz-Wechsel
    shot('offen')
    # Verschieben in kleinen Schritten (im Rand) und großen (über den Rand)
    for k, (dx, dy) in enumerate([(-40, -25), (-40, -25), (-60, 30), (90, -120), (-300, 0), (0, -260), (513.5, 417), (-7, 3)]):
        c.js(f"setView(S.view.tx + {dx}, S.view.ty + {dy}, S.view.z)")
        shot('verschoben%d' % k)
    # schnell hintereinander verschieben, Foto ohne Warten auf das Vorabzeichnen
    c.js("(async () => { for (let i = 0; i < 30; i++) { setView(S.view.tx - 23, S.view.ty - 17, S.view.z); await new Promise(r => requestAnimationFrame(r)); } })()")
    shot('schnell')
    # Zoomen: mitten im Zoom (Kacheln skaliert), danach fertig
    c.js("zoomAt(VW / 2, VH / 2, S.view.z * 1.3, false)"); shot('zoom_mitte', False)
    c.js("zoomAt(VW / 2, VH / 2, S.view.z * 1.4, false)"); shot('zoom_mitte2', False)
    c.js("settleZoom()"); shot('zoom_fertig')
    c.js("setView(S.view.tx + 150, S.view.ty + 100, S.view.z)"); shot('zoom_verschoben')
    c.js("zoomAt(VW / 2, VH / 2, 1, true)"); shot('zoom_zurueck')
    # Änderungen: Striche dazu (auch am Rand und außerhalb), wegnehmen, Rückgängig
    c.js(r'''(() => { const add = []; for (let k = 0; k < 40; k++) { const pts = []; for (let i = 0; i < 50; i++) pts.push(100 + k * 37 + i * 2, 200 + k * 23 + 20 * Math.sin(i / 4), 0.5); add.push(makeStroke(pts, '#e53935', 3, false)); }
      commit(appendItems(S.items, add)); return add.length; })()''')
    shot('striche_dazu')
    c.js("setView(S.view.tx - 120, S.view.ty - 90, S.view.z)"); shot('striche_verschoben')
    c.js("commit(S.items.filter((it, i) => i % 5)); null"); shot('striche_weg')
    c.js("undo()"); shot('rueckgaengig')
    c.js("setView(S.view.tx + 60, S.view.ty + 45, S.view.z)"); shot('rueckgaengig_verschoben')
    c.js("toggleDark()"); shot('dunkel')
    c.js("setView(S.view.tx - 200, S.view.ty + 10, S.view.z)"); shot('dunkel_verschoben')
    c.js("toggleDark()")
    # Seite mit Blättern (Schatten, Tisch)
    c.js("closeNote()"); time.sleep(1)
    c.js("openNote(homeData.notes.find(n => n.id === 'tp'))"); time.sleep(1); c.js("setTool('lasso')")
    shot('a4')
    for k, (dx, dy) in enumerate([(-50, -80), (0, -350), (120, 40), (-480, -200)]):
        c.js(f"setView(S.view.tx + {dx}, S.view.ty + {dy}, S.view.z)"); shot('a4_verschoben%d' % k)
    c.js("zoomAt(VW / 2, VH / 2, 0.5, true)"); shot('a4_klein')
    c.js("setView(S.view.tx + 30, S.view.ty - 300, S.view.z)"); shot('a4_klein_verschoben')
finally:
    kill(proc)
