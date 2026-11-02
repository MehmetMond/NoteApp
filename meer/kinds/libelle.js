// Libellen (Teich): fliegen hoch über dem Wasser (größer, Schatten weit weg), schießen ruckartig von Punkt zu Punkt,
// stehen kurz in der Luft und landen ab und zu auf einem Seerosenblatt. Die Flügel sind durchscheinend (blasse
// Kacheln, nur lichter Schatten) und flirren im Flug. Schlanker Hinterleib mit dunklen Ringen, große Augen.
// Antippen (oder eine Froschzunge): im Zickzack davon.
(function () {
const { TAU, clamp, lerp, hash2 } = TM.util;
const Q = TM.Q || new URLSearchParams('');
const FLY = 0, HOVER = 1, REST = 2;
const rnd = (c, k) => hash2(c.seed, (c.rn += 1) * 7919 + k);

// Flügel: Wurzel [a, b], Neigung nach vorn (rad), Länge, größte halbe Breite, wo sie am breitesten ist (0..1)
const WINGS = [[0.245, 0.035, 0.14, 0.47, 0.05, 0.45], [0.165, 0.035, -0.2, 0.45, 0.064, 0.3]];
const W = { f: 0, u: 0, v: 0 };
function wing(a, bb, ra, rb, psi, len, wmax, peak) {
  const da = a - ra, db = bb - rb, s = Math.sin(psi), co = Math.cos(psi);
  const u = da * s + db * co, v = da * co - db * s;   // u: längs des Flügels nach außen, v: nach vorn
  W.u = u / len; W.v = v;
  if (u <= 0 || u >= len) { W.f = -Math.max(-u, u - len) - Math.abs(v); return W; }
  const x = W.u, prof = x < peak ? Math.sin(x / peak * Math.PI / 2) : Math.cos((x - peak) / (1 - peak) * Math.PI / 2);
  const w = wmax * (0.35 + 0.65 * Math.sqrt(Math.max(0, prof)));
  W.f = w * Math.min(1, 6 * (1 - x)) - Math.abs(v); return W;
}

const pads = oc => oc.list.filter(d => d.name === 'seerose' && !d.dead);
const SP = { x: 0, y: 0 };
function seatPos(c, p) {
  const ca = Math.cos(p.ang), sa = Math.sin(p.ang), lx = Math.cos(c.sp) * c.sr * p.len, ly = Math.sin(c.sp) * c.sr * p.len;
  SP.x = p.px + ca * lx - sa * ly; SP.y = p.py + sa * lx + ca * ly; return SP;
}
function aim(c, oc, x, y) { const m = 60 * oc.scale; c.tx = clamp(x, m, oc.W - m); c.ty = clamp(y, m, oc.H - m); c.st = FLY; }
// nächstes Ziel: meist ein Stück weiter in neuer Richtung (scharfe Wende), manchmal auf ein Blatt
function next(c, oc) {
  if (c.dart > 0) {
    c.dart--; const ang = c.th + (rnd(c, 1) < 0.5 ? -1 : 1) * lerp(0.9, 2.2, rnd(c, 2)), d = lerp(90, 200, rnd(c, 3)) * oc.scale;
    aim(c, oc, c.x + Math.cos(ang) * d, c.y + Math.sin(ang) * d); return;
  }
  const ps = pads(oc).filter(p => !oc.list.some(d => d !== c && (d.name === 'frosch' || d.name === 'libelle') && (d.pad === p || d.lpad === p || d.hpad === p)));
  if (ps.length && rnd(c, 4) < 0.3) {
    const p = ps[(rnd(c, 5) * ps.length) | 0];
    c.lpad = p; c.sr = lerp(0.18, 0.38, rnd(c, 6)); c.sp = rnd(c, 7) * TAU; c.sth = rnd(c, 8) * TAU;
    const s = seatPos(c, p); aim(c, oc, s.x, s.y); return;
  }
  c.lpad = null;
  const ang = c.th + (rnd(c, 9) < 0.5 ? -1 : 1) * lerp(0.7, 2.6, rnd(c, 10)), d = lerp(150, 430, rnd(c, 11)) * oc.scale;
  let x = c.x + Math.cos(ang) * d, y = c.y + Math.sin(ang) * d;
  if (x < 80 || x > oc.W - 80 || y < 80 || y > oc.H - 80) { x = lerp(0.15, 0.85, rnd(c, 12)) * oc.W; y = lerp(0.15, 0.85, rnd(c, 13)) * oc.H; }
  aim(c, oc, x, y);
}
// erschrecken (Antippen, Zunge, Finger): im Zickzack davon, vom Blatt sofort auf
function scare(c, oc, x, y, delay = 0) {
  const d = Math.hypot(c.x - x, c.y - y) || 1;
  c.pad = null; c.lpad = null; c.dart = 2 + ((rnd(c, 21) * 2) | 0); c.boost = 1;
  c.th = Math.atan2(c.y - y, c.x - x) + lerp(-0.5, 0.5, rnd(c, 22));
  aim(c, oc, c.x + (c.x - x) / d * 170 * oc.scale, c.y + (c.y - y) / d * 170 * oc.scale);
  c.late = delay;
}

function update(c, dt, oc) {
  const sc = oc.scale;
  c.flap += dt;
  if (c.solo) return;
  if (!c.started) { c.started = 1; next(c, oc); }
  if (c.late > 0) { c.late -= dt; return; }   // die Zunge kommt erst an, dann geht es los
  // Finger oder Stift kommen zu nah: auf und davon
  const P = oc.ptr; if (oc.t - P.t < 0.3 && Math.hypot(c.x - P.x, c.y - P.y) < 70 * sc && c.boost < 0.5) scare(c, oc, P.x, P.y);
  c.boost = Math.max(0, c.boost - dt * 0.6);
  let alt = 1;
  if (c.st === REST) {
    const p = c.pad;
    if (!p || p.dead) { c.pad = null; next(c, oc); return; }
    const s = seatPos(c, p); c.x = s.x; c.y = s.y; c.th = p.ang + c.sth; c.vx = c.vy = 0;
    c.tm -= dt; alt = 0; c.v = c.alt > 0.05 ? 99 : 0;   // sitzt still: jedes zweite Bild reicht
    if (c.tm <= 0) { c.pad = null; c.st = HOVER; c.tm = 0.5; }
  } else if (c.st === HOVER) {
    c.vx *= Math.exp(-dt * 6); c.vy *= Math.exp(-dt * 6); c.v = 99;   // Flügel flirren: jedes Bild
    c.x += c.vx * dt + Math.sin(oc.t * 2.3 + c.seed) * 3 * dt; c.y += c.vy * dt + Math.cos(oc.t * 1.9 + c.seed) * 3 * dt;
    c.th += Math.sin(oc.t * 0.9 + c.seed) * 0.25 * dt;
    c.tm -= dt; if (c.tm <= 0) next(c, oc);
  } else {
    let tx = c.tx, ty = c.ty;
    if (c.lpad) { if (c.lpad.dead) c.lpad = null; else { const s = seatPos(c, c.lpad); tx = s.x; ty = s.y; } }
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
    const vmax = (120 + 90 * c.boost) * sc * Math.min(1, 0.25 + d / (70 * sc));   // vor dem Ziel abbremsen
    c.vx += (dx / d * vmax - c.vx) * Math.min(1, dt * 5); c.vy += (dy / d * vmax - c.vy) * Math.min(1, dt * 5);
    c.x += c.vx * dt; c.y += c.vy * dt; c.v = 99;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > 15) { let da = Math.atan2(c.vy, c.vx) - c.th; da -= Math.round(da / TAU) * TAU; c.th += clamp(da, -9 * dt, 9 * dt); }
    if (c.lpad && d < 26 * sc) alt = d / (26 * sc);   // im Sinkflug aufs Blatt
    if (d < 6) {
      if (c.lpad) { c.pad = c.lpad; c.lpad = null; c.st = REST; c.tm = lerp(4, 11, rnd(c, 31)); c.sth = c.th - c.pad.ang; }
      else { c.st = HOVER; c.tm = c.dart > 0 ? lerp(0.08, 0.25, rnd(c, 32)) : lerp(0.4, 2, rnd(c, 33)); }
    }
  }
  // Höhe: gleitet zwischen Flug (hoch, größer) und Sitzen (knapp über dem Blatt)
  c.alt += (alt - c.alt) * Math.min(1, dt * 4);
  const dep = -0.03 - 0.42 * c.alt;
  if (Math.abs(dep - c.depth) > 0.004) { c.depth = dep; c.len = c.len0 * (1 + 0.12 * c.alt); oc.resort(); }
}

TM.kinds.libelle = {
  label: 'Libelle', count: 2, len: [64, 80], speed: [0, 0], depth: [-0.45, -0.45], rigid: true, ext: 0.54, wext: 0.54, every: 2, slowV: 1,
  tapTip: 'schießt im Zickzack davon',   // Hinweis beim Antippen (Vorschauseite)
  //        Flügel     Flügelmal  blau       Ringe      Brust      Augen      rot        Ringe      Brust      Augen
  colors: ['#cfe3ea', '#3a3f44', '#58b8e6', '#1d3b4f', '#3f8aa6', '#7fd0ff', '#e2533e', '#5a1d16', '#a8402f', '#ff7a5c'],
  light: ['#7d9aa6', '#22262a', '#1f86c2', '#0f2a3a', '#25627a', '#1b7fd0', '#c23a26', '#3d120d', '#7d2b1e', '#d23b22'],
  init(c, R) {
    c.var = c.var || (R() < 0.55 ? 'blau' : 'rot');
    c.len0 = c.len / (1 + 0.12); c.st = HOVER; c.tm = R() * 1.5; c.tx = c.x; c.ty = c.y; c.vx = 0; c.vy = 0;
    c.pad = null; c.lpad = null; c.sr = 0; c.sp = 0; c.sth = 0; c.dart = 0; c.boost = 0; c.late = 0; c.alt = 1;
    c.flap = R() * 10; c.rn = 0; c.started = 0; c.cb = c.var === 'rot' ? 6 : 2;
    c.wp = new Float32Array(4); c.wl = 1; c.hwA = 0.03; c.rp = 0.2; c.fly = 1;
    // Testzustand für Probebilder: lpose = rest (Flügel still, knapp über dem Blatt)
    if (Q.get('lpose')) { c.solo = 1; if (Q.get('lpose') === 'rest') { c.st = REST; c.alt = 0; } }
  },
  update,
  tap(c, oc, x, y) { scare(c, oc, x, y); },
  scare,
  prep(c, oc) {
    // Flügel: im Flug flirren sie (jedes Bild ein anderer Schlagwinkel) und wirken etwas kürzer; sitzend flach und still
    const fly = c.fly = c.st !== REST || c.alt > 0.2 ? 1 : 0, wp = c.wp;
    for (let i = 0; i < 4; i++) wp[i] = fly ? (hash2(oc.fn * 4 + i, c.seed) - 0.5) * 0.5 : 0;
    c.wl = fly ? 0.86 + 0.14 * hash2(oc.fn, c.seed + 7) : 1;
    // Hinterleib: so dünn wie gezeichnet, aber nie dünner als eine Zelle quer zur Richtung (sonst reißt er ab)
    c.hwA = 0.5 * (Math.abs(c.hy) * oc.cw + Math.abs(c.hx) * oc.ch) / c.len * 1.02;
    // Ringe: Abstand nach der Zellgröße längs der Richtung (gut zwei Zellen), sonst trifft jede Zelle dieselbe Stelle
    c.rp = 2.3 * (Math.abs(c.hx) * oc.cw + Math.abs(c.hy) * oc.ch) / c.len;
  },
  cell(a, b, c, o) {
    const side = b < 0 ? -1 : 1, bb = b * side, cb = c.cb;
    // Hinterleib: von der Brust bis zur Spitze, schmal, mit dunklen Ringen
    let f = -1, part = -1, t = 0;
    if (a < 0.14 && a > -0.52 && bb < 0.08) {
      const hw = Math.max(c.hwA, lerp(0.026, 0.04, clamp((a + 0.5) / 0.62, 0, 1))), e = Math.min(hw - bb, a + 0.5);
      if (e > f) { f = e; part = 0; t = (0.13 - a) / 0.62; }
    }
    // Brust und Augen
    const ft = 0.065 - Math.hypot((a - 0.215) * 0.76, bb); if (ft > f) { f = ft; part = 1; }
    const fe = 0.055 - Math.hypot(a - 0.322, bb - 0.042); if (fe > f) { f = fe; part = 2; }
    // Flügel (durchscheinend): nur wo nichts vom Körper liegt
    if (f <= 0 && a > -0.12 && a < 0.5) {
      for (let i = 0; i < 2; i++) {
        const G = WINGS[i], ww = wing(a, bb, G[0], G[1], G[2] + c.wp[i * 2 + (side > 0 ? 1 : 0)], G[3] * c.wl, G[4], G[5]);
        if (ww.f > f) {
          f = ww.f; o.f = f; if (f <= 0) continue;
          o.line = 1; o.sh = 1; o.col = 0;
          o.lit = (ww.v > G[4] * 0.45 ? 0.27 : 0.15) + (c.fly ? 0.06 * hash2(c.seed + i, (a * 40) | 0) : 0);   // Vorderkante etwas kräftiger
          if (ww.u > 0.8 && ww.u < 0.9 && ww.v > 0) { o.col = 1; o.lit = 0.7; }   // Flügelmal nahe der Spitze
        }
      }
      if (f > 0) return;
    }
    o.f = f;
    if (f <= 0) return;
    o.line = 1; o.solid = 1;
    if (part === 0) { const k = ((0.13 - a) / c.rp + 0.7) % 1, ring = k < 0.4 || t > 0.93; o.col = ring ? cb + 1 : cb; o.lit = ring ? 0.6 : 0.85; }   // gleichmäßig hell, dunkle Ringe
    else if (part === 1) { o.col = cb + 2; o.lit = TM.shade(b / 0.065, c); }
    else { o.col = cb + 3; o.lit = 0.65 + 0.35 * Math.max(0, 1 - Math.hypot(a - 0.33, bb - 0.05) / 0.055); }
  },
};
})();
