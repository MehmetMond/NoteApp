src=open('app.src.html').read()
b='pdfjs/package/build/'
w=open(b+'pdf.worker.min.js').read(); l=open(b+'pdf.min.js').read()
assert '</script' not in w and '</script' not in l
src=src.replace('@@PDFWORKER@@',w,1).replace('@@PDFJS@@',l,1)
open('Notizen.html','w').write(src)
