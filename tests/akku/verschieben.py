# Versuch: was kostet Verschieben, und wie viel davon ist Neuzeichnen bzw. die leere Live-Ebene?
# python verschieben.py <Notizen.exe> <Profil> <Ergebnis.json>
import sys, os, json, time
from harness import *

exe, profile, out = sys.argv[1:4]
exe_n = os.path.normcase(os.path.abspath(exe))
proc, c = launch(exe, profile)
res = {}
try:
    c.send('Runtime.enable'); c.send('Performance.enable')
    c.js(SETUP); time.sleep(0.5)
    c.js("openNote(homeData.notes.find(n => n.id === 'tn'))"); time.sleep(4)
    W, H = c.js('[innerWidth, innerHeight]')
    VAR = {
        'normal': ('', ''),
        'live_opacity0': ("cvLive.style.opacity = '0'", "cvLive.style.opacity = ''"),
        'css_only': ("window.__sv = setView; window.__v0 = { ...S.view }; setView = (tx, ty) => { cvMain.style.transform = `translate(${tx - __v0.tx}px,${ty - __v0.ty}px)`; }",
                     "setView = __sv; cvMain.style.transform = ''; setView(__v0.tx, __v0.ty, __v0.z, true)"),
    }
    VAR['css_only_opacity0'] = (VAR['css_only'][0] + ';' + VAR['live_opacity0'][0], VAR['css_only'][1] + ';' + VAR['live_opacity0'][1])
    for rnd in range(2):
        for name, (pre, post) in (VAR.items() if rnd == 0 else reversed(list(VAR.items()))):
            if pre: c.js(pre)
            time.sleep(0.5)
            a = sample(exe_n); m0 = c.perf()
            pan(c, W, H, reps=3)
            m1 = c.perf(); b = sample(exe_n)
            if post: c.js(post)
            time.sleep(2)
            d = delta(a, b); d['task_ms'] = round((m1['TaskDuration'] - m0['TaskDuration']) * 1000)
            res.setdefault(name, []).append(d); print(name, json.dumps(d), flush=True)
finally:
    json.dump(res, open(out, 'w'), indent=1)
    kill(proc)
