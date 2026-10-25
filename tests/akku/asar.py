import json, struct, sys, os
def read(path):
    f = open(path, 'rb'); d = f.read(16)
    _, hsize, _, jlen = struct.unpack('<IIII', d)
    h = json.loads(f.read(jlen)); base = 8 + hsize
    return f, h, base
def walk(node, pre=''):
    for k, v in node.get('files', {}).items():
        p = pre + '/' + k
        if 'files' in v: yield from walk(v, p)
        else: yield p, v
if __name__ == '__main__':
    path, out = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None
    f, h, base = read(path)
    for p, v in walk(h):
        print(p, v.get('size'), 'unpacked' if v.get('unpacked') else '')
        if out and not v.get('unpacked'):
            f.seek(base + int(v['offset'])); data = f.read(v['size'])
            dst = os.path.join(out, p.lstrip('/')); os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(data)

# Packen wie electron-builder: Kopf (Pickle) mit Dateiliste, Größe, Versatz und SHA256 (je 4 MiB-Block), dann die Daten
import hashlib
def pack(src_dir, out_path, order=None):
    files, blobs, off = {}, [], 0
    paths = order or sorted(os.path.relpath(os.path.join(d, f), src_dir).replace(os.sep, '/') for d, _, fs in os.walk(src_dir) for f in fs)
    for rel in paths:
        data = open(os.path.join(src_dir, rel), 'rb').read()
        node = files
        parts = rel.split('/')
        for p in parts[:-1]: node = node.setdefault(p, {'files': {}})['files']
        bs = 4 * 1024 * 1024
        node[parts[-1]] = {'size': len(data), 'offset': str(off), 'integrity': {'algorithm': 'SHA256', 'hash': hashlib.sha256(data).hexdigest(),
                           'blockSize': bs, 'blocks': [hashlib.sha256(data[i:i + bs]).hexdigest() for i in range(0, max(1, len(data)), bs)]}}
        blobs.append(data); off += len(data)
    j = json.dumps({'files': files}, separators=(',', ':')).encode()
    pad = (4 - len(j) % 4) % 4
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<IIII', 4, 8 + len(j) + pad, 4 + len(j) + pad, len(j))); f.write(j + b'\0' * pad)
        for b in blobs: f.write(b)
