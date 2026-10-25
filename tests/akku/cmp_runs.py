# Tabelle: Phasen zweier Messläufe nebeneinander (GPU-Zeit, CPU-Zeit der App)
# python cmp_runs.py alt.json neu.json
import sys, json
a, b = (json.load(open(p)) for p in sys.argv[1:3])
def g(d): return d['gpu_ms'].get('gpu-process', 0) + d['gpu_ms'].get('dwm', 0)
print('%-18s %9s %9s %7s | %9s %9s %7s | %7s %7s' % ('Phase', 'GPU alt', 'GPU neu', '%', 'CPU alt', 'CPU neu', '%', 'Bilder', ''))
ta = tb = ca = cb = 0
for k, x in a['phases'].items():
    y = b['phases'].get(k)
    if not y: continue
    ga, gb = g(x), g(y); xa, xb = x['cpu_app_ms'], y['cpu_app_ms']
    ta += ga; tb += gb; ca += xa; cb += xb
    pct = lambda p, q: ('%+6.0f%%' % ((q - p) / p * 100)) if p > 30 else '      '
    print('%-18s %9d %9d %7s | %9d %9d %7s | %7s %7s' % (k, ga, gb, pct(ga, gb), xa, xb, pct(xa, xb), x['js'].get('raf', ''), y['js'].get('raf', '')))
print('%-18s %9d %9d %+6.0f%% | %9d %9d %+6.0f%%' % ('Summe', ta, tb, (tb - ta) / ta * 100, ca, cb, (cb - ca) / ca * 100))
