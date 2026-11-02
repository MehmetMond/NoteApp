// Seerosen (Teich): runde Schwimmblätter mit Kerbe und feinen Adern, an der Oberfläche treibend; manche tragen
// eine Blüte (eigene versteckte Art, liegt knapp über ihrem Blatt und folgt ihm). Antippen: Blatt wippt, Welle läuft.
(function () {
const { clamp, lerp, noise1, noise2, hash2, TAU, lineGlyph } = TM.util;
const Q = TM.Q || new URLSearchParams('');
const NV = 20;   // höchstens so viele Adern

// Zufall aus dem Samen des Blattes (update hat kein R)
const rnd = (c, k) => hash2(c.seed, k * 7919 + 13);

// Dünner Strich längs einer Linie (wie die Randzeichen der Engine): Feldwert f in Körperlängen, Gradient (ga, gb)
// in Bildrichtung. Gibt das passende Zeichen . , ' - _ / \ | ( ) oder 0, wenn die Linie die Zelle nicht trifft.
function stroke(c, oc, f, ga, gb) {
  const gm = Math.sqrt(ga * ga + gb * gb); if (gm < 1e-6) return 0;
  const nx = ga / gm, ny = gb / gm, d = f * c.len / gm, half = 0.5 * (Math.abs(nx) * oc.cw + Math.abs(ny) * oc.ch);
  if (d <= -half || d > half) return 0;
  if (!oc.lut) return lineGlyph(-ny, nx);
  let ia = Math.round(Math.atan2(ny, nx) / TAU * oc.NA) % oc.NA; if (ia < 0) ia += oc.NA;
  return oc.lut[ia * oc.ND + Math.min(oc.ND - 1, Math.floor((d / half + 1) * 0.5 * oc.ND))];
}

// Zwischenspeicher: Blätter treiben sehr langsam. Lage (auf 1/3 Zelle) und Drehung (0.01 rad) werden gerundet;
// solange sich daran nichts ändert, gibt cell() die Werte vom letzten Bild zurück, statt neu zu rechnen.
// Nebenbei flimmert die Fläche so nicht bei jedem Bild ein wenig.
function snap(c, oc) {
  const q = oc.cw / 3, r = oc.ch / 3;
  if (c.x !== c.sx) c.px = c.x;   // von außen verschoben (z. B. Filmstreifen): übernehmen
  if (c.y !== c.sy) c.py = c.y;
  c.x = c.sx = Math.round(c.px / q) * q; c.y = c.sy = Math.round(c.py / r) * r;
}
function cacheKey(c, k1, k2, k3, k4) {
  const same = c.zn > 0 && c.k0 === c.x && c.k1 === c.y && c.k2 === k1 && c.k3 === k2 && c.k4 === k3 && c.k5 === k4 && c.k6 === c.len;
  c.k0 = c.x; c.k1 = c.y; c.k2 = k1; c.k3 = k2; c.k4 = k3; c.k5 = k4; c.k6 = c.len;
  c.zh = same; c.zi = 0;
  return same;
}
function cached(x, y, c, o, fn) {
  const i = c.zi++;
  if (c.zh && i < c.zn) { o.f = c.zf[i]; o.lit = c.zl[i]; o.col = c.zc[i]; o.ch = c.zg[i]; o.line = c.zL[i]; return; }
  fn(x, y, c, o);
  if (i >= c.zf.length) {   // selten: Speicher wächst
    const m = Math.max(1024, i * 2), f = new Float32Array(m), l = new Float32Array(m), cc = new Uint8Array(m), g = new Uint16Array(m), L = new Uint8Array(m);
    f.set(c.zf); l.set(c.zl); cc.set(c.zc); g.set(c.zg); L.set(c.zL); c.zf = f; c.zl = l; c.zc = cc; c.zg = g; c.zL = L;
  }
  c.zf[i] = o.f; c.zl[i] = o.lit; c.zc[i] = o.col; c.zg[i] = o.ch; c.zL[i] = o.line; c.zn = i + 1;
}
function cacheInit(c) {
  c.zf = new Float32Array(0); c.zl = new Float32Array(0); c.zc = new Uint8Array(0); c.zg = new Uint16Array(0); c.zL = new Uint8Array(0);
  c.zn = 0; c.zi = 0; c.zh = false; c.px = c.x; c.py = c.y; c.sx = c.x; c.sy = c.y;
}

// erster Schritt: Blätter in losen Gruppen verteilen (meist dicht an ein schon liegendes Blatt)
function place(c, oc) {
  c.placed = 1;
  const pads = oc.list.filter(d => d.kind === c.kind && d !== c && d.placed);
  const W = oc.W, H = oc.H, R = c.len * 0.5;
  for (let i = 0; i < 40; i++) {
    let x, y;
    const near = pads.length && rnd(c, i) < 0.4;   // meist einzeln, manchmal zu zweit
    if (near) {
      const p = pads[(rnd(c, i + 50) * pads.length) | 0], a = rnd(c, i + 90) * TAU, d = (p.len * 0.5 + R) * (0.95 + 0.12 * rnd(c, i + 130));
      x = p.px + Math.cos(a) * d; y = p.py + Math.sin(a) * d;
    } else { x = R + 30 + rnd(c, i + 170) * (W - 2 * R - 60); y = R + 30 + rnd(c, i + 210) * (H - 2 * R - 60); }
    if (x < R + 14 || y < R + 14 || x > W - R - 14 || y > H - R - 14) continue;
    let ok = true;
    for (const p of pads) { const m = (p.len * 0.5 + R) * (near ? 0.93 : 1.7); if ((p.px - x) ** 2 + (p.py - y) ** 2 < m * m) { ok = false; break; } }
    if (ok) { c.px = c.x = c.sx = x; c.py = c.y = c.sy = y; return; }
  }
}

function update(c, dt, oc) {
  if (c.x !== c.sx) c.px = c.x;
  if (c.y !== c.sy) c.py = c.y;
  if (!c.placed) place(c, oc);
  const t = oc.t, W = oc.W, H = oc.H, R = c.len * 0.5, sc = oc.scale;
  let x = c.px, y = c.py;
  // Strömung: großräumig und langsam, alle Blätter treiben ähnlich (Gruppen bleiben beisammen)
  const ang = noise2(x * 0.0012 + 3.1, y * 0.0012 + t * 0.004) * TAU * 2;
  let ax = Math.cos(ang) * c.drift, ay = Math.sin(ang) * c.drift;
  // Rand: ganz im Bild bleiben
  const m = R + 16 * sc, k = 0.06;
  if (x < m + 30) ax += (m + 30 - x) * k; else if (x > W - m - 30) ax -= (x - W + m + 30) * k;
  if (y < m + 30) ay += (m + 30 - y) * k; else if (y > H - m - 30) ay -= (y - H + m + 30) * k;
  // Nachbarblätter: leicht überlappen darf sein, mehr nicht
  for (const d of oc.list) {
    if (d === c || d.kind !== c.kind) continue;
    const ex = x - d.px, ey = y - d.py, q = Math.hypot(ex, ey) || 1, mn = (R + d.len * 0.5) * 0.94;
    if (q < mn) { const s = (mn - q) * 0.25; ax += ex / q * s; ay += ey / q * s; }
  }
  c.vx += (ax - c.vx) * Math.min(1, dt * 0.6); c.vy += (ay - c.vy) * Math.min(1, dt * 0.6);
  c.px = clamp(x + c.vx * dt, m, W - m); c.py = clamp(y + c.vy * dt, m, H - m);
  // langsam drehen; nach dem Antippen kurz pendeln
  const want = (noise1(c.seed * 0.01 + t * 0.02) - 0.5) * 0.08;
  c.spin += (want - c.spin) * Math.min(1, dt * 0.3);
  c.ang += (c.spin + c.kick * Math.exp(-c.wt2 * 1.6) * Math.cos(c.wt2 * 5)) * dt;
  c.wt2 += dt; c.wob = Math.max(0, c.wob - dt * 0.55);
}

// Antippen: Blatt wippt und dreht sich ein wenig, vom Rand läuft eine Welle (unter dem Blatt)
function tapPad(c, oc, x, y) {
  c.wob = 1; c.wt2 = 0; c.kick = (x - c.x > 0 ? 1 : -1) * 0.8;
  const k = c.kind, R0 = c.len * 0.5, cx = c.x, cy = c.y;
  for (let i = 0; i < 2; i++) {
    let age = -i * 0.45;
    oc.fx.push({ depth: c.depth + 0.003, under: false,
      update(dt) { age += dt; return age < 2.6; },
      draw(oc) { if (age < 0) return; const f = age / 2.6, lv = clamp(Math.round((1 - f) * 6), 0, 7); if (lv) oc.ring(cx, cy, R0 * (0.98 + age * 0.38) + age * 8, oc.pal(k)[6][lv]); } });
  }
}

// Blatt: Scheibe mit leicht gewelltem Rand, Kerbe als Keil von der Mitte zum Rand, getupfte Fläche, Adern
function padCell(x, y, c, o) {
  const r = Math.sqrt(x * x + y * y);
  if (r > 0.53) { o.f = 0.5 - r; return; }
  const a = x * c.ca + y * c.sa, b = y * c.ca - x * c.sa;   // ins gedrehte Blatt
  const phi = Math.atan2(b, a), an = Math.abs(phi) - c.nw;
  // Wellung nur außen nötig; die Kerbe nur nahe ihrem Winkel genau
  const fd = (r > 0.4 ? c.rr * (1 + c.wv1 * Math.sin(5 * phi + c.s1) + c.wv2 * Math.sin(9 * phi + c.s2)) : c.rr) - r;
  const fw = r < 0.015 ? 0.01 : an < 0.7 ? r * Math.sin(an) : r * 0.65;
  const f = fd < fw ? fd : fw;
  o.f = f;
  if (f <= 0) return;
  o.line = 1; o.col = 0;
  // Fläche: matt gefleckt, Licht von oben links, Rand etwas heller (leicht aufgebogen)
  const lt = (a * c.la + b * c.lb) * 2, tex = Math.sin(a * 23 + c.tx) * Math.sin(b * 19 - a * 7 + c.tx * 0.7);
  o.lit = 0.31 + 0.06 * lt + 0.07 * tex - c.dip * 0.16 + (fd < 0.03 ? (0.03 - fd) * 4 * (0.5 + 0.5 * lt) : 0);
  // Adern: nächste Ader als feiner Strich, nicht bis zum Rand
  if (r > c.vr0 && fd > 0.05 && c.lut) {
    const p = phi < 0 ? phi + TAU : phi, k = Math.floor((p - c.nw) / c.vd);
    if (k >= 0 && k < c.vn) {
      const dq = r * Math.sin(p - (c.nw + (k + 0.5) * c.vd)), h = c.vh[k];
      if (dq > -h && dq <= h) {
        const g = c.lut[c.vi[k] * c.ND + Math.min(c.ND - 1, Math.floor((dq / h + 1) * 0.5 * c.ND))];
        if (g) { o.ch = g; o.col = 1; o.lit = 0.36 + 0.06 * lt; }
      }
    }
  }
}

TM.kinds.seerose = {
  label: 'Seerosen', count: 6, len: [85, 160], speed: [1.5, 3.5], depth: [0, 0], rigid: true, ext: 0.52, wext: 0.52, every: 2,
  tapTip: 'das Blatt wippt, Wellen laufen',   // Hinweis beim Antippen (Vorschauseite)
  //        Blatt      Ader       Blatt dunkel  -          -          -          Welle
  colors: ['#4f7d47', '#7fa463', '#36593a', '#4f7d47', '#4f7d47', '#4f7d47', '#a6cfc8'],
  light: ['#2f5d2c', '#5a8443', '#22451f', '#2f5d2c', '#2f5d2c', '#2f5d2c', '#4f7d86'],
  init(c, R, oc) {
    // Variante: blatt (ohne Blüte), weiss, rosa
    if (!c.var && Q.get('pvar')) c.var = Q.get('pvar');
    if (!c.var) { const v = R(); c.var = c.len > 95 && v < 0.55 ? (v < 0.3 ? 'weiss' : 'rosa') : 'blatt'; }
    c.nw = lerp(0.13, 0.22, R());                    // halbe Kerbenöffnung (rad)
    c.wv1 = lerp(0.006, 0.016, R()); c.wv2 = lerp(0.004, 0.01, R()); c.s1 = R() * TAU; c.s2 = R() * TAU;
    c.vx = 0; c.vy = 0; c.spin = 0; c.kick = 0; c.wt2 = 9; c.wob = 0; c.placed = Q.get('mode') === 'solo' ? 1 : 0;
    c.drift = c.cruise; c.tx = R() * 50;
    c.vi = new Uint16Array(NV); c.vh = new Float32Array(NV); c.vn = 0; c.vr0 = 0.2;
    // Drehung selbst führen: das Blatt ist rund, mit Richtung 0 bleibt das abgetastete Rechteck klein
    c.ang = c.th; c.th = 0; c.ra = 0;
    cacheInit(c);
    // Blüte als eigenes Tier knapp über dem Blatt (kleinere Tiefe = später gemalt)
    c.fl = oc.add('seerose_bluete', { pad: c, depth: c.depth - 0.004, x: c.x, y: c.y, th: 0 });
  },
  update,
  tap: tapPad,
  prep(c, oc) {
    snap(c, oc);
    // Wippen: Blatt taucht leicht ein und hebt sich wieder (Radius und Helligkeit)
    const w = c.wob * c.wob, L = c.len, ra = c.ra = Math.round(c.ang * 100) / 100;
    c.rr = 0.5 * (1 - 0.06 * w * (0.5 + 0.5 * Math.sin(c.wt2 * 9)));
    c.dip = w * (0.5 + 0.5 * Math.sin(c.wt2 * 9 + 1));
    if (cacheKey(c, ra, c.rr, c.dip, oc.cw + oc.dpr * 1000)) return;
    // Adern: wenige, gleichmäßig außerhalb der Kerbe; je Ader Zeile der Strich-Tabelle und halbe Zellbreite
    const n = clamp(Math.round(L / 11), 7, NV), dphi = (TAU - 2 * c.nw) / n, NA = oc.NA || 48;
    c.vn = n; c.vd = dphi; c.vr0 = clamp(2.6 * oc.cw / (dphi * L), 0.1, 0.36);
    for (let k = 0; k < n; k++) {
      const sa = ra + c.nw + (k + 0.5) * dphi, nx = -Math.sin(sa), ny = Math.cos(sa);
      let ia = Math.round(Math.atan2(ny, nx) / TAU * NA) % NA; if (ia < 0) ia += NA;
      c.vi[k] = ia; c.vh[k] = 0.5 * (Math.abs(nx) * oc.cw + Math.abs(ny) * oc.ch) / L;
    }
    c.ca = Math.cos(ra); c.sa = Math.sin(ra);
    c.la = -0.8 * c.ca - 0.6 * c.sa; c.lb = 0.8 * c.sa - 0.6 * c.ca;   // Licht von oben links, im Blatt gemessen
    c.lut = oc.lut; c.ND = oc.ND;
  },
  cell(x, y, c, o) { cached(x, y, c, o, padCell); },
};

// Blüte von oben: ein Stern breiter, spitzer Blütenblätter, dazwischen ein kleinerer, versetzter Kranz,
// in der Mitte gelbe Staubgefäße. Einzelne Blätter wären bei dieser Größe nur Rauschen; die Form trägt.
// Blattprofil je Blatt: x im Takt der Blätter (−π/2 … π/2), breiter Bauch, Knick an der Spitze
const wrapH = x => x - Math.round(x / Math.PI) * Math.PI;
const P = x => { const u = Math.max(0, 1 - Math.abs(wrapH(x)) * (2 / Math.PI)); return Math.sqrt(u * Math.sqrt(u)); };   // u^0.75
function flowerCell(a, b, c, o) {
  if (c.len < 2) { o.f = -1; return; }
  const r = Math.sqrt(a * a + b * b);
  if (r > 0.53) { o.f = 0.5 - r; return; }
  const phi = Math.atan2(b * c.ca - a * c.sa, a * c.ca + b * c.sa), h = c.np / 2;   // Winkel in der gedrehten Blüte
  const f1 = 0.5 * (0.22 + 0.78 * P(h * phi)) - r;                     // äußerer Kranz
  const f2 = 0.3 * (0.4 + 0.6 * P(h * (phi - Math.PI / c.np))) - r;   // innerer Kranz, versetzt
  const fc = 0.085 - r;                                               // Mitte
  const f = Math.max(f1, f2, fc);
  o.f = f;
  if (f <= 0) return;
  o.line = 1;
  const lt = -1.6 * a - 1.2 * b;   // Licht von oben links (a, b sind hier Bildrichtungen)
  if (fc > 0) { o.col = 2; o.lit = 0.8 + 0.15 * lt; o.ch = r < 0.04 ? 64 : 42; return; }   // Staubgefäße
  // ruhige Fläche: außen o, innerer Kranz O (getönt); Schattierung nur über die Farbe. Nahe am Umriss
  // nichts vorgeben, dort setzt die Engine die Randzeichen
  const deep = f > c.edge;
  if (f2 > 0) { o.col = c.pink ? 4 : 3; o.lit = 0.8 + 0.25 * r + 0.06 * lt; if (deep) o.ch = 79; }
  else { o.col = c.pink ? 1 : 0; o.lit = 0.6 + 0.5 * r + 0.08 * lt; if (deep) o.ch = 111; }
  // Rand der Mitte als feiner gelber Strich
  const rr = r > 1e-4 ? r : 1e-4, g = stroke(c, c.oc, fc, -a / rr, -b / rr);
  if (g) { o.ch = g; o.col = 2; o.lit = 0.7; }
}
TM.kinds.seerose_bluete = {
  label: 'Seerosenblüte', hidden: true, count: 0, len: [60, 60], speed: [0, 0], depth: [0, 0], rigid: true, ext: 0.52, wext: 0.52, every: 2,
  rim: 0.75,
  //        weiß       rosa       gelb       weiß innen  rosa innen
  colors: ['#efeae0', '#e8a7b8', '#e6bb4a', '#f4dccf', '#d98a9f'],
  light: ['#8c8178', '#b0607a', '#b8860f', '#a5807a', '#94485d'],
  init(c, R, oc) {
    const p = c.pad;
    c.rot = R() * TAU; c.off = lerp(0.06, 0.16, R()); c.offa = Math.PI * lerp(0.6, 1.4, R()); c.th = 0;
    c.size = clamp(p.len * lerp(0.6, 0.72, R()), 64, 110);
    c.np = R() < 0.6 ? 7 : R() < 0.5 ? 6 : 8;   // Blätter je Kranz
    cacheInit(c);
  },
  update(c, dt, oc) { if (c.pad.dead) oc.remove(c); },
  tap(c, oc, x, y) { tapPad(c.pad, oc, x, y); },
  prep(c, oc) {
    const p = c.pad, show = p.var !== 'blatt';
    // folgt dem Blatt: Lage auf dem Blatt, Drehung, Wippen
    const L = p.len, fa = p.ra + c.rot;
    c.x = c.px = p.x + Math.cos(p.ra + c.offa) * c.off * L; c.y = c.py = p.y + Math.sin(p.ra + c.offa) * c.off * L;
    snap(c, oc);
    c.th = 0; c.hx = 1; c.hy = 0;
    c.len = show ? c.size * oc.scale * (1 - 0.2 * c.depth) * (1 + 0.05 * p.wob * p.wob * Math.sin(p.wt2 * 9 + 0.6)) : 0.5;
    c.pink = p.var === 'rosa';
    if (cacheKey(c, fa, c.pink ? 1 : 0, c.np, oc.cw + oc.dpr * 1000)) return;
    c.ca = Math.cos(fa); c.sa = Math.sin(fa);
    c.oc = oc; c.edge = 0.55 * oc.cw / Math.max(c.len, 1);   // so nah am Umriss setzt die Engine die Randzeichen
  },
  cell(x, y, c, o) { cached(x, y, c, o, flowerCell); },
};
})();
