# Schwarzbild mit eingeschaltetem Energiesparmodus (Helium/Chromium, „bei Akkubetrieb“) automatisch eingrenzen: eingespeister
# Stift (CDP) schwebt bzw. zeichnet, je Zustand (Stift-Punkt, Live-Ebene, Mauszeiger, desynchronisierte Ebene) Aufnahmen des
# Fensterinhalts; gemessen wird der Anteil heller Pixel im Notizbereich (Schrift sichtbar) – schwarz = 0.
# python -X utf8 schwarz3.py <Browser.exe> <Profilordner (neu)> <Bilderordner> [--url URL] [--ohne-energiesparen]
import sys, os, json, time, math, subprocess, argparse, urllib.request, ctypes
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import CDP, SETUP, kill
from PIL import ImageGrab

ap = argparse.ArgumentParser(); ap.add_argument('exe'); ap.add_argument('profile'); ap.add_argument('bilder')
ap.add_argument('--url', default='https://mehmetmond.github.io/NoteApp/'); ap.add_argument('--port', type=int, default=9338)
ap.add_argument('--ohne-energiesparen', action='store_true')
args = ap.parse_args()
os.makedirs(args.bilder, exist_ok=True)
if os.path.exists(args.profile): raise SystemExit('Profilordner gibt es schon (es wird nichts gelöscht)')
ctypes.windll.shcore.SetProcessDpiAwareness(2)
user32 = ctypes.windll.user32
class RECT(ctypes.Structure): _fields_ = [('l', ctypes.c_long), ('t', ctypes.c_long), ('r', ctypes.c_long), ('b', ctypes.c_long)]

os.makedirs(args.profile)
if not args.ohne_energiesparen: json.dump({'performance_tuning': {'battery_saver_mode': {'state': 2}}}, open(os.path.join(args.profile, 'Local State'), 'w'))
proc = subprocess.Popen([args.exe, '--user-data-dir=' + args.profile, '--remote-debugging-port=%d' % args.port, '--no-first-run', '--no-default-browser-check',
                         '--start-maximized', args.url], stdin=subprocess.DEVNULL)
page = None
for _ in range(150):
    try:
        ls = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % args.port, timeout=2))
        page = next((x for x in ls if x.get('type') == 'page' and x.get('url', '').startswith('http')), None)
        if page: break
    except Exception: pass
    time.sleep(0.3)
c = CDP(page['webSocketDebuggerUrl']); c.send('Runtime.enable'); c.send('Page.bringToFront')
for _ in range(100):
    try:
        if c.js("document.readyState === 'complete' && typeof openNote === 'function' && !!db") is True: break
    except Exception: pass
    time.sleep(0.2)
r = subprocess.run(['powershell', '-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('" + args.profile + "') } | ForEach-Object { $_.ProcessId }"],
                   capture_output=True, text=True, stdin=subprocess.DEVNULL)
pids = {int(x) for x in r.stdout.split() if x.isdigit()}
hw = []
cb_t = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
def cb(h, _):
    p = ctypes.c_ulong(); user32.GetWindowThreadProcessId(h, ctypes.byref(p))
    if p.value in pids and user32.IsWindowVisible(h) and user32.GetWindowTextLengthW(h) > 0: hw.append(h)
    return True
user32.EnumWindows(cb_t(cb), 0); h = hw[0]
k32 = ctypes.windll.kernel32
user32.ShowWindow(h, 3); fg = user32.GetForegroundWindow(); ft = user32.GetWindowThreadProcessId(fg, None); me = k32.GetCurrentThreadId()
user32.AttachThreadInput(me, ft, True); user32.BringWindowToTop(h); user32.SetForegroundWindow(h); user32.AttachThreadInput(me, ft, False)

def bright(name=None):
    rc = RECT(); user32.GetWindowRect(h, ctypes.byref(rc))
    im = ImageGrab.grab(bbox=(rc.l, rc.t, rc.r, rc.b), all_screens=True)
    w, hh = im.size; box = im.crop((int(w * 0.3), int(hh * 0.25), int(w * 0.9), int(hh * 0.9))).convert('L').resize((180, 120))
    if name: im.resize((w // 3, hh // 3)).save(os.path.join(args.bilder, name + '.png'))
    px = list(box.getdata()); return round(sum(1 for v in px if v > 100) / len(px), 3)
def ev(t, x, y, b):
    c.send('Input.dispatchMouseEvent', type=t, x=x, y=y, pointerType='pen', button='left' if (b or t == 'mouseReleased') else 'none', buttons=b, clickCount=0 if t == 'mouseMoved' else 1, force=0.5 if b else 0)

STATES = [('normal', ''), ('ohne Stift-Punkt', '#penDot{display:none!important}'), ('Live-Ebene immer sichtbar', '#cvLive{opacity:1!important}'),
          ('Live-Ebene nie sichtbar', '#cvLive{opacity:0!important}'), ('Mauszeiger sichtbar', '#cvLive{cursor:crosshair!important}'), ('normal (nochmal)', '')]
try:
    c.js(SETUP); time.sleep(0.5); c.js("openNote(homeData.notes.find(n => n.id === 'tp'))"); time.sleep(2)
    c.js("document.head.insertAdjacentHTML('beforeend', '<style id=__t></style>'); setTool('pen'); 1")
    W, H = c.js('[innerWidth, innerHeight]')
    print('Bildtakt ohne Eingabe (rAF/s):', c.js("new Promise(r => { let k = 0; const t0 = performance.now(); const f = () => { k++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(k); }; requestAnimationFrame(f); })"),
          '| desynchronisiert:', c.js('ctxLive.getContextAttributes().desynchronized'), '| hell ohne Stift:', bright('ruhe'), flush=True)
    for name, css in STATES:
        c.js("document.getElementById('__t').textContent = %s; 1" % json.dumps(css)); time.sleep(0.5)
        hv, dn = [], []
        for i in range(40):   # schweben, ~2 s
            ev('mouseMoved', W * 0.55 + 150 * math.cos(i / 6), H * 0.55 + 90 * math.sin(i / 5), 0); time.sleep(0.05)
            if i % 8 == 7: hv.append(bright(name.replace(' ', '_') + '_schwebt' if i == 31 else None))
        x0, y0 = W * 0.4, H * 0.75
        ev('mousePressed', x0, y0, 1)
        for i in range(40):   # zeichnen, ~2 s
            ev('mouseMoved', x0 + i * 6, y0 + 10 * math.sin(i / 3), 1); time.sleep(0.05)
            if i % 8 == 7: dn.append(bright(name.replace(' ', '_') + '_unten' if i == 31 else None))
        ev('mouseReleased', x0 + 240, y0, 0); time.sleep(0.4)
        ev('mouseMoved', W - 5, 5, 0); c.js("[...hovers.keys()].forEach(id => cvLive.dispatchEvent(new PointerEvent('pointerleave', { pointerId: id, pointerType: 'pen' })))"); time.sleep(1.8)
        print(f"{name:26s} hell beim Schweben {hv}  beim Zeichnen {dn}  danach {bright()}", flush=True)
finally:
    try:
        v = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/version' % args.port, timeout=3)); CDP(v['webSocketDebuggerUrl']).send('Browser.close'); proc.wait(15)
    except Exception: kill(proc)
