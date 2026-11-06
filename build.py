src=open('app.src.html',encoding='utf-8').read()
b='pdfjs/package/build/'
w=open(b+'pdf.worker.min.js',encoding='utf-8').read(); l=open(b+'pdf.min.js',encoding='utf-8').read()
assert '</script' not in w and '</script' not in l
src=src.replace('@@PDFWORKER@@',w,1).replace('@@PDFJS@@',l,1)
open('Notizen.html','w',encoding='utf-8').write(src)
