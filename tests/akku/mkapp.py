# Setzt app.src.html aus app.js zusammen (wie im README), baut Notizen.html (build.py) und legt eine Test-App an:
# Kopie der installierten App mit neuer resources/app.asar (wie electron-builder, ohne Node/npm).
# python -X utf8 mkapp.py <Repo> <installierte App> <Ziel>
import sys, os, shutil, subprocess, json, tempfile
repo, inst, dst = sys.argv[1:4]
s = open(os.path.join(repo, 'app.js'), encoding='utf-8').read(); h = open(os.path.join(repo, 'app.src.html'), encoding='utf-8').read()
i = h.index('<script>\n"use strict";')
open(os.path.join(repo, 'app.src.html'), 'w', encoding='utf-8', newline='\n').write(h[:i] + '<script>\n' + s + '</script>\n</body>\n</html>\n')
subprocess.run([sys.executable, '-X', 'utf8', 'build.py'], cwd=repo, check=True)
if not os.path.exists(dst): shutil.copytree(inst, dst)
asar_path = os.path.join(dst, 'resources', 'app.asar')
app = tempfile.mkdtemp(prefix='notizen-asar-')   # Inhalt von app.asar
shutil.rmtree(os.path.join(dst, 'resources', 'app'), ignore_errors=True)
os.makedirs(os.path.join(app, 'app'), exist_ok=True)
shutil.copy(os.path.join(repo, 'electron', 'main.js'), app); shutil.copy(os.path.join(repo, 'electron', 'icon.png'), app)
pk = json.load(open(os.path.join(repo, 'electron', 'package.json'), encoding='utf-8'))
json.dump({k: pk[k] for k in ('name', 'productName', 'version', 'description', 'author', 'main')}, open(os.path.join(app, 'package.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
shutil.copy(os.path.join(repo, 'Notizen.html'), os.path.join(app, 'app', 'index.html'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import asar
asar.pack(app, asar_path, ['app/index.html', 'icon.png', 'main.js', 'package.json'])
print('app.asar', os.path.getsize(asar_path)); shutil.rmtree(app, ignore_errors=True)
print('ok', os.path.getsize(os.path.join(app, 'app', 'index.html')))
