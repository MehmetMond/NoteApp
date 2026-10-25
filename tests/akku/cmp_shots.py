# Vergleicht Bildschirmfotos: je Foto alt vs. neu und (im neuen Ordner) Foto vs. volles Neuzeichnen
# python cmp_shots.py <Ordner alt> <Ordner neu>
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1:3]
bad = 0
def diff(p, q):
    x, y = Image.open(p).convert('RGB'), Image.open(q).convert('RGB')
    if x.size != y.size: return 'Größe %s vs %s' % (x.size, y.size)
    d = ImageChops.difference(x, y); bb = d.getbbox()
    if not bb: return None
    px = sum(1 for v in d.getdata() if v != (0, 0, 0))
    return '%d Pixel verschieden in %s, max %s' % (px, bb, max(max(v) for v in d.getdata()))
for f in sorted(os.listdir(b)):
    if not f.endswith('.png'): continue
    if f.endswith('.voll.png'):
        r = diff(os.path.join(b, f.replace('.voll.png', '.png')), os.path.join(b, f)); what = 'neu gegen volles Neuzeichnen'
    else:
        if not os.path.exists(os.path.join(a, f)): print('fehlt im alten Ordner:', f); continue
        r = diff(os.path.join(a, f), os.path.join(b, f)); what = 'alt gegen neu'
    print(('ok    ' if not r else 'ANDERS ') + f + ' (' + what + ')' + ('' if not r else ': ' + r))
    bad += bool(r)
print('ALLES GLEICH' if not bad else '%d Abweichungen' % bad)
