# PDF-Import mit erst bei Bedarf geladenem pdf.js: unendliche Seite und Blatt-Dokument, dazu PDF-Export
# python test_pdf.py <Notizen.exe> <Profil>
import sys, time
from harness import *

exe, profile = sys.argv[1:3]
proc, c = launch(exe, profile)
ok = True
try:
    c.send('Runtime.enable')
    c.js(SETUP); time.sleep(0.3)
    print('pdf.js beim Start geladen:', c.js("typeof pdfjsLib !== 'undefined'"))
    MK = r'''makePDF([1, 2, 3].map(k => ({ w: 300, h: 400, render: async () => { const c = document.createElement('canvas'); c.width = 300; c.height = 400;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 400); g.fillStyle = ['#e53935', '#43a047', '#1e88e5'][k - 1]; g.fillRect(40, 40, 120 + k * 30, 200); return c; } })), 'Test')'''
    for nid in ('tn', 'tp'):
        c.js(f"openNote(homeData.notes.find(n => n.id === '{nid}'))"); time.sleep(1)
        r = c.js("(async () => { const n0 = S.items.length; const blob = await " + MK + "; await insertPdf(new File([blob], 'test.pdf', { type: 'application/pdf' }));"
                 " const imgs = S.items.filter(it => it.pdf === 'test.pdf'); await Promise.all(imgs.map(it => imgEntry(it.img).ready));"
                 " return { neu: S.items.length - n0, seiten: imgs.map(it => it.page), ok: imgs.map(it => imgEntry(it.img).state), blaetter: S.note.paper ? S.note.paper.n : null }; })()")
        print(nid, r, flush=True)
        ok &= r['seiten'] == [1, 2, 3] and all(s == 'ok' for s in r['ok'])
        c.js("closeNote()"); time.sleep(1)
    print('pdf.js jetzt geladen:', c.js("typeof pdfjsLib !== 'undefined'"))
finally:
    kill(proc)
print('ALLES OK' if ok else 'FEHLER')
sys.exit(0 if ok else 1)
