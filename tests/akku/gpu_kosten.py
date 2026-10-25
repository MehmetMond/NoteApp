# Mikro-Versuch in der echten App: GPU-Kosten je Bild für verschiedene Arten, die Live-Ebene zu benutzen
# python gpu_kosten.py <Notizen.exe> <Profil> <Ergebnis.json> [Arten,…]
import sys, os, json, time
from harness import *

exe, profile, out = sys.argv[1:4]
exe_n = os.path.normcase(os.path.abspath(exe))
proc, c = launch(exe, profile)
res = {}
SETUP_CV = r'''
(() => {
  const mk = (desync) => { const cv = document.createElement('canvas'); cv.width = Math.round(innerWidth * devicePixelRatio); cv.height = Math.round(innerHeight * devicePixelRatio);
    Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 });
    document.body.appendChild(cv); return { cv, g: cv.getContext('2d', { desynchronized: desync }) }; };
  window.__D = mk(true); window.__N = mk(false);
  const mks = (desync) => { const cv = document.createElement('canvas'); cv.width = 720; cv.height = 640;
    Object.assign(cv.style, { position: 'fixed', left: '200px', top: '150px', width: '360px', height: '320px', pointerEvents: 'none', zIndex: 100 });
    document.body.appendChild(cv); return { cv, g: cv.getContext('2d', { desynchronized: desync }) }; };
  window.__SD = mks(true); window.__SN = mks(false);
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  Object.assign(svg.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100, overflow: 'visible' });
  const path = document.createElementNS(ns, 'path'); path.setAttribute('fill', 'rgba(80,130,255,.08)'); path.setAttribute('stroke', '#2f6fed'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-dasharray', '6 5');
  svg.appendChild(path); document.body.appendChild(svg); window.__path = path; window.__pts = [];
  const mv = document.createElement('canvas'); mv.width = 1200; mv.height = 800; Object.assign(mv.style, { position: 'fixed', left: 0, top: 0, width: '600px', height: '400px', pointerEvents: 'none', zIndex: 100, willChange: 'transform' });
  { const g = mv.getContext('2d'); g.fillStyle = '#1b1b1d'; for (let i = 0; i < 400; i++) { g.beginPath(); g.arc(Math.random() * 1200, Math.random() * 800, 3, 0, 6.283); g.fill(); } }
  document.body.appendChild(mv); window.__mv = mv;
  const dot = document.createElement('div'); Object.assign(dot.style, { position: 'fixed', left: 0, top: 0, width: '12px', height: '12px', borderRadius: '50%', background: '#e53935', opacity: .5, zIndex: 101, willChange: 'transform', pointerEvents: 'none' });
  document.body.appendChild(dot); window.__dot = dot;
  window.__run = (mode, ms) => new Promise(done => {
    const t0 = performance.now(); let k = 0;
    const step = () => {
      const t = performance.now(); if (t - t0 > ms) { done(k); return; }
      const x = 400 + 900 * (0.5 + 0.5 * Math.sin(k / 30)), y = 300 + 700 * (0.5 + 0.5 * Math.sin(k / 47)), C = mode.includes('desync') ? __D : __N, g = C.g;
      if (mode.includes('fullclear')) g.clearRect(0, 0, C.cv.width, C.cv.height);
      if (mode.includes('smallclear')) { const p = C.last; if (p) g.clearRect(p[0] - 40, p[1] - 40, 80, 80); }
      if (mode.includes('dstfull')) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(0, 0, C.cv.width, C.cv.height); g.restore(); }
      if (mode.includes('dstout')) { const p = C.last; if (p) { g.globalCompositeOperation = 'destination-out'; g.fillRect(p[0] - 40, p[1] - 40, 80, 80); g.globalCompositeOperation = 'source-over'; } }
      if (mode === 'svg_lasso') { __pts.push((x / 2).toFixed(1) + ',' + (y / 2).toFixed(1)); if (__pts.length > 300) __pts.shift(); __path.setAttribute('d', 'M' + __pts.join('L') + 'Z'); }
      if (mode === 'movecanvas') __mv.style.transform = `translate(${x / 2 - 300}px,${y / 2 - 200}px)`;
      const sx = C === __SD || C === __SN ? (x - 400) / 900 * 640 + 40 : x, sy = C === __SD || C === __SN ? (y - 300) / 700 * 560 + 40 : y;
      if (mode.includes('check')) { const d = g.getImageData(0, 0, C.cv.width, C.cv.height).data; let nz = 0; for (let i = 0; i < d.length; i++) if (d[i]) nz++; window.__nz = (window.__nz || 0) + nz; }
      if (mode.includes('fill')) { g.fillStyle = '#1b1b1d'; g.beginPath(); g.arc(sx, sy, 24, 0, 6.283); g.fill(); C.last = [sx, sy]; }
      if (mode === 'dot') __dot.style.transform = `translate(${x / 2}px,${y / 2}px)`;
      k++; requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return [__D.cv.width, __D.cv.height];
})()
'''
try:
    c.send('Runtime.enable')
    c.js(SETUP); time.sleep(0.5)
    c.js("openNote(homeData.notes.find(n => n.id === 'tn'))"); time.sleep(4)
    print('Leinwand', c.js(SETUP_CV), flush=True)
    modes = sys.argv[4].split(',') if len(sys.argv) > 4 else ['desync_fill', 'smalldesync_fill', 'smallnormal_fill', 'smalldesync_smallclear_fill', 'desync_dstout_fill', 'normal_dstout_fill', 'desync_fullclear', 'svg_lasso', 'movecanvas', 'dot']
    for rnd in range(2):
        for m in (modes if rnd == 0 else list(reversed(modes))):
            c.js("for (const C of [__D, __N, __SD, __SN]) { C.g.clearRect(0, 0, C.cv.width, C.cv.height); C.last = null }; __pts = []; __path.setAttribute('d', '')"); time.sleep(0.6)
            a = sample(exe_n)
            frames = c.js(f"__run('{m}', 5000)")
            b = sample(exe_n)
            d = delta(a, b); d['frames'] = frames
            d['gpu_per_frame_ms'] = round(d['gpu_ms'].get('gpu-process', 0) / max(1, frames), 3)
            d['gpucpu_per_frame_ms'] = round(d['cpu'].get('gpu-process', 0) / max(1, frames), 3)
            d['dwm_gpu_per_frame_ms'] = round(d['gpu_ms'].get('dwm', 0) / max(1, frames), 3)
            res.setdefault(m, []).append(d); print(m, json.dumps(d), flush=True)
finally:
    json.dump(res, open(out, 'w'), indent=1)
    kill(proc)
