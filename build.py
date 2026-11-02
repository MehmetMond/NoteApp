import glob
src=open('app.src.html',encoding='utf-8').read()
b='pdfjs/package/build/'
w=open(b+'pdf.worker.min.js',encoding='utf-8').read(); l=open(b+'pdf.min.js',encoding='utf-8').read()
assert '</script' not in w and '</script' not in l
# Meer im Hintergrund der Startseite (meer/): Engine zuerst, dann alle Arten, zuletzt die Szenen
m='\n'.join(open(f,encoding='utf-8').read() for f in ['meer/engine.js',*sorted(glob.glob('meer/kinds/*.js')),'meer/scenes.js'])
assert '</script' not in m.lower()
src=src.replace('@@PDFWORKER@@',w,1).replace('@@PDFJS@@',l,1).replace('/*@@MEER@@*/',m,1)
open('Notizen.html','w',encoding='utf-8').write(src)
