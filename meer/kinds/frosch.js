// Frösche (Teich): sitzen auf den Seerosenblättern und treiben mit ihnen, quaken (zwei Schallblasen blähen sich
// seitlich am Kopf auf), springen im Bogen zum nächsten freien Blatt (im Sprung größer, der Schatten rückt weg,
// das Blatt wippt beim Landen) und schwimmen mit Beinschlägen, wenn sie im Wasser landen. Kommt eine Libelle oder
// Futter in Reichweite, schnellt die Zunge vor. Antippen: springt weg.
(function () {
const { TAU, clamp, lerp, smooth, noise2, hash2 } = TM.util;
const Q = TM.Q || new URLSearchParams('');
const SIT = 0, HOP = 1, SWIM = 2;

// Gelenke der rechten Seite (die linke ist gespiegelt), je [a, b] in Körperlängen:
// Hüfte, Knie, Ferse, Zehen (Hinterbein), Schulter, Ellbogen, Hand (Vorderbein)
const P_SIT = [-0.28, 0.15, -0.05, 0.47, -0.45, 0.50, -0.30, 0.68, 0.12, 0.18, 0.22, 0.36, 0.40, 0.44];   // gespreizt wie ein Frosch von oben
const P_TUCK = [-0.28, 0.15, -0.15, 0.55, -0.52, 0.56, -0.42, 0.75, 0.12, 0.18, 0.22, 0.38, 0.36, 0.50];   // schwimmen: noch weiter gespreizt
const P_EXT = [-0.32, 0.14, -0.62, 0.25, -0.93, 0.22, -1.18, 0.26, 0.12, 0.19, 0.26, 0.28, 0.46, 0.27];    // gestreckt: Sprung, Beinschlag
// Glieder: [Gelenk von, Gelenk bis, Radius]; 0..2 Hinterbein, 3..4 Vorderbein
const SEG = [[0, 1, 0.095], [1, 2, 0.075], [2, 3, 0.06], [4, 5, 0.055], [5, 6, 0.048]];

// Abstand Punkt–Strecke, dazu wo auf der Strecke (0..1) und wie weit quer (für Licht und Ringel)
const D = { d: 0, t: 0, q: 0 };
function seg(a, b, a0, b0, a1, b1) {
  const da = a1 - a0, db = b1 - b0, l2 = da * da + db * db;
  const t = l2 > 0 ? clamp(((a - a0) * da + (b - b0) * db) / l2, 0, 1) : 0;
  const pa = a0 + da * t, pb = b0 + db * t, l = Math.sqrt(l2) || 1;
  D.d = Math.hypot(a - pa, b - pb); D.t = t; D.q = ((a - a0) * db - (b - b0) * da) / l;   // q: Seite der Strecke
  return D;
}
// Rumpf von oben: rundlich, vorn etwas breiter (Kopf), hinten rund
const bodyW = a => { const u = Math.abs((a - 0.025) / 0.475); return u >= 1 ? 0 : 0.26 * Math.pow(1 - Math.pow(u, 2.6), 1 / 2.6) * (0.92 + 0.12 * (a + 0.45)); };

// Sitzplatz auf einem Blatt: auf Blättern ohne Blüte nah der Mitte, sonst gegenüber der Blüte am Rand
function seatOn(c, p) {
  if (p.var === 'blatt' || !p.fl) { c.sr = lerp(0.03, 0.13, rnd(c, 1)); c.sp = Math.PI + lerp(-0.9, 0.9, rnd(c, 2)); }
  else { c.sr = 0.3; c.sp = p.fl.offa + Math.PI + lerp(-0.45, 0.45, rnd(c, 3)); }
}
const rnd = (c, k) => hash2(c.seed, (c.rn += 1) * 7919 + k);
const SP = { x: 0, y: 0 };
function seatPos(c, p) {
  const ca = Math.cos(p.ang), sa = Math.sin(p.ang), lx = Math.cos(c.sp) * c.sr * p.len, ly = Math.sin(c.sp) * c.sr * p.len;
  SP.x = p.px + ca * lx - sa * ly; SP.y = p.py + sa * lx + ca * ly; return SP;
}
const pads = oc => oc.list.filter(d => d.name === 'seerose' && !d.dead);
const taken = (oc, p, c) => oc.list.some(d => d !== c && d.name === 'frosch' && (d.pad === p || d.hpad === p));
// freies Blatt in Sprungweite (nicht das eigene), zufällig unter den näheren
function freePad(c, oc, maxD, away) {
  let best = null, bs = -1e9;
  for (const p of pads(oc)) {
    if (p === c.pad || taken(oc, p, c)) continue;
    const d = Math.hypot(p.px - c.x, p.py - c.y); if (d > maxD || d < 20) continue;
    let s = -d / maxD + rnd(c, 7) * 0.8 + (p.var === 'blatt' ? 0.3 : 0);
    if (away) s += ((p.px - c.x) * away.x + (p.py - c.y) * away.y) / (d || 1);   // weg vom Finger
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function turnTo(c, want, rate, dt) { let d = want - c.th; d -= Math.round(d / TAU) * TAU; c.th += clamp(d, -rate * dt, rate * dt); return Math.abs(d); }

// Sprung beginnen: erst kurz ducken und hindrehen, dann im Bogen
function hop(c, oc, pad, x, y, quick) {
  c.st = HOP; c.hpad = pad; c.htx = x; c.hty = y; c.hu = 0; c.pre = quick ? 0.08 : 0.24;
  c.hx0 = c.x; c.hy0 = c.y; c.hd0 = c.depth;
  c.hT = clamp(0.45 + Math.hypot(x - c.x, y - c.y) / 520, 0.5, 1.05);
  if (c.pad) { c.pad.wob = Math.max(c.pad.wob, 0.35); c.pad.wt2 = 0; }   // Absprung: das Blatt wippt
  c.pad = null; c.cro = 0; c.tg = 0;
}
// Ziel im Wasser: ein Stück weg, nicht auf einem Blatt, im Bild
function waterSpot(c, oc, away) {
  const L = c.len0, m = 40 * oc.scale + L;
  for (let i = 0; i < 24; i++) {
    let ang = rnd(c, 11) * TAU; if (away && i < 16) ang = Math.atan2(away.y, away.x) + lerp(-0.9, 0.9, rnd(c, 12));
    const d = L * lerp(1.5, 2.8, rnd(c, 13)), x = c.x + Math.cos(ang) * d, y = c.y + Math.sin(ang) * d;
    if (x < m || y < m || x > oc.W - m || y > oc.H - m) continue;
    if (pads(oc).some(p => Math.hypot(p.px - x, p.py - y) < p.len * 0.5 + L * 0.3)) continue;
    return { x, y };
  }
  return { x: clamp(c.x + L * 1.8, m, oc.W - m), y: clamp(c.y, m, oc.H - m) };
}
function leave(c, oc, away, quick) {
  const p = freePad(c, oc, c.len0 * 4.6 + 80 * oc.scale, away);
  if (p) { seatOn(c, p); const s = seatPos(c, p); hop(c, oc, p, s.x, s.y, quick); return; }
  const w = waterSpot(c, oc, away); hop(c, oc, null, w.x, w.y, quick);
}

function update(c, dt, oc) {
  const L0 = c.len0, sc = oc.scale;
  c.blk -= dt; if (c.blk < -0.16) c.blk = lerp(2.5, 7, rnd(c, 21));
  c.tcd -= dt;
  if (!c.started) { c.started = 1; if (c.solo) return; const p = freePad(c, oc, 1e9); if (p) { seatOn(c, p); c.pad = p; } else { c.st = SWIM; c.depth = 0.03; c.swT = 0; oc.resort(); } }
  if (c.solo) return;
  // Zunge: raus in 0.12 s, zurück in 0.18 s; am weitesten draußen wird Futter gefressen
  if (c.tg > 0) {
    c.tg += dt / 0.3; const T = c.tgt;
    if (T && T.age != null) { c.tgx = T.x; c.tgy = T.y; if (c.tg > 0.4 && oc.food.includes(T)) oc.eat(T, c); }
    else if (T) { c.tgx = T.x; c.tgy = T.y; }
    if (c.tg >= 1) { c.tg = 0; c.tgt = null; }
  }
  if (c.st === SIT) {
    c.v = c.tg > 0 || c.turn || c.cro > 0 ? 99 : 0;   // still sitzen: jedes zweite Bild abtasten reicht (every: 2)
    const p = c.pad;
    if (!p || p.dead) { c.pad = null; c.st = SWIM; c.depth = 0.03; oc.resort(); return; }
    const s = seatPos(c, p); c.x = s.x; c.y = s.y;
    c.th = p.ang + c.sth;
    if (c.turn) { const st = clamp(c.turn, -2 * dt, 2 * dt); c.sth += st; c.turn -= st; if (Math.abs(c.turn) < 1e-3) c.turn = 0; }
    c.kk += (0 - c.kk) * Math.min(1, dt * 8); c.ss += (0 - c.ss) * Math.min(1, dt * 3);
    // quaken: Schallblasen pumpen 3–5 Mal, jedes Mal ein kleiner Ring im Wasser
    if (c.cro > 0) { const ph = c.cp; c.cp += dt / 0.42; c.cro -= dt; if (Math.floor(c.cp) > Math.floor(ph)) oc.ripple(c.x, c.y, 0.22, true); }
    // Zunge nach Libelle oder Futter in Reichweite (vor dem Maul, ±50°)
    if (c.tcd <= 0 && c.tg === 0 && c.cro <= 0) {
      const mx = c.x + c.hx * L0 * 0.47, my = c.y + c.hy * L0 * 0.47, reach = L0 * 2.1;
      let tgt = null, bd = reach;
      for (const d of oc.list) if (d.name === 'libelle' && d.st !== 2) { const e = Math.hypot(d.x - mx, d.y - my); if (e < bd && ((d.x - mx) * c.hx + (d.y - my) * c.hy) > e * 0.64) { bd = e; tgt = d; } }
      for (const f of oc.food) { const e = Math.hypot(f.x - mx, f.y - my); if (e < bd && ((f.x - mx) * c.hx + (f.y - my) * c.hy) > e * 0.64) { bd = e; tgt = f; } }
      if (tgt) {
        c.tg = 1e-3; c.tgt = tgt; c.tgx = tgt.x; c.tgy = tgt.y; c.tcd = lerp(4, 8, rnd(c, 31));
        if (tgt.kind && TM.kinds.libelle && TM.kinds.libelle.scare) TM.kinds.libelle.scare(tgt, oc, c.x, c.y, 0.12);   // entwischt knapp
      }
    }
    c.tn -= dt;
    if (c.tn <= 0) {
      const r = rnd(c, 41); c.tn = lerp(3, 9, rnd(c, 42));
      if (r < 0.36) { c.cro = lerp(1.2, 2.1, rnd(c, 43)); c.cp = 0; }
      else if (r < 0.62) c.turn = (rnd(c, 44) < 0.5 ? -1 : 1) * lerp(0.4, 1.3, rnd(c, 45));
      else if (r < 0.86) leave(c, oc, null, false);
    }
    return;
  }
  if (c.st === HOP) {
    if (c.hpad && c.hpad.dead) c.hpad = null;
    let tx = c.htx, ty = c.hty;
    if (c.hpad) { const s = seatPos(c, c.hpad); tx = s.x; ty = s.y; }
    if (c.pre > 0) {   // ducken und hindrehen
      c.v = 99; c.pre -= dt; turnTo(c, Math.atan2(ty - c.y, tx - c.x), 9, dt); c.kk += (0 - c.kk) * Math.min(1, dt * 10);
      c.hx0 = c.x; c.hy0 = c.y; return;
    }
    c.v = 99; c.hu = Math.min(1, c.hu + dt / c.hT); const u = c.hu, h = 4 * u * (1 - u);
    c.x = lerp(c.hx0, tx, u); c.y = lerp(c.hy0, ty, u);
    turnTo(c, Math.atan2(ty - c.hy0, tx - c.hx0), 6, dt);
    const land = c.hpad ? -0.02 : 0.03;
    c.depth = lerp(c.hd0, land, u) - 0.5 * h; c.len = L0 * (1 + 0.32 * h); oc.resort();
    c.kk = u < 0.12 ? u / 0.12 : u > 0.76 ? Math.max(0.2, 1 - (u - 0.76) / 0.24) : 1;
    if (u >= 1) {
      c.len = L0;
      if (c.hpad) {   // auf dem Blatt: es wippt unter dem Gewicht
        const p = c.hpad; c.hpad = null; c.pad = p; c.st = SIT; c.sth = c.th - p.ang; c.depth = -0.02; c.tn = lerp(3, 8, rnd(c, 51));
        p.wob = Math.max(p.wob, 0.75); p.wt2 = 0; oc.ripple(c.x, c.y, 0.3, true);
      } else { c.st = SWIM; c.depth = 0.03; c.v = 30 * sc; c.sk = 0.3; c.swT = lerp(4, 9, rnd(c, 52)); oc.ripple(c.x, c.y, 0.8); }
      oc.resort();
    }
    return;
  }
  // schwimmen: Beinschlag (schnell strecken, langsam anziehen), zum nächsten freien Blatt; dort hinaufspringen
  c.ss += (1 - c.ss) * Math.min(1, dt * 3);
  const ph = c.sk; c.sk += dt / 1.05; const u = c.sk % 1;
  if (Math.floor(c.sk) > Math.floor(ph)) c.v += 70 * sc;
  c.kk = u < 0.26 ? smooth(0, 0.26, u) : 1 - smooth(0.26, 1, u);
  c.v *= Math.exp(-dt * 1.5);
  c.swT -= dt;
  if (!c.hpad || c.hpad.dead || taken(oc, c.hpad, c)) c.hpad = c.swT <= 0 ? freePad(c, oc, 1e9) : null;
  let tx, ty;
  if (c.hpad) { const s = seatPos(c, c.hpad); tx = s.x; ty = s.y; }
  else { tx = c.x + Math.cos(c.th + (noise2(c.seed, oc.t * 0.2) - 0.5) * 2) * 100; ty = c.y + Math.sin(c.th + (noise2(c.seed, oc.t * 0.2) - 0.5) * 2) * 100; }
  const m = 30 * sc + L0; let want = Math.atan2(ty - c.y, tx - c.x);
  if (c.x < m || c.x > oc.W - m || c.y < m || c.y > oc.H - m) want = Math.atan2(oc.H / 2 - c.y, oc.W / 2 - c.x);
  turnTo(c, want, 1.6, dt);
  c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
  if (c.hpad && Math.hypot(tx - c.x, ty - c.y) < c.hpad.len * 0.5 + L0 * 0.35) { const p = c.hpad; seatOn(c, p); const s = seatPos(c, p); hop(c, oc, p, s.x, s.y, true); c.hT = 0.45; }
}

TM.kinds.frosch = {
  label: 'Frosch', count: 2, len: [80, 94], speed: [0, 0], depth: [-0.02, -0.02], rigid: true, ext: 1.3, wext: 0.88, every: 2, slowV: 1,
  tapTip: 'springt im Bogen zum nächsten Blatt',   // Hinweis beim Antippen (Vorschauseite)
  //        grün       Flecken    Rückenleiste Iris      Pupille    Schallblase Zunge      braun      Flecken    Leiste
  colors: ['#62a24a', '#2f5b2b', '#a3cf6b', '#e8bf4f', '#151b14', '#dfe9b8', '#e98a98', '#a07a4a', '#5c4126', '#cfae73'],
  light: ['#3f7d2c', '#1e3b1b', '#6c9c3a', '#b8860f', '#101410', '#8ea65c', '#c24f62', '#7a5630', '#3e2a16', '#a07c40'],
  init(c, R) {
    c.var = c.var || (R() < 0.7 ? 'gruen' : 'braun');
    c.len0 = c.len; c.st = SIT; c.pad = null; c.hpad = null; c.sr = 0; c.sp = 0; c.sth = R() * TAU; c.turn = 0;
    c.tn = lerp(1.5, 6, R()); c.cro = 0; c.cp = 0; c.blk = lerp(1, 6, R()); c.tcd = lerp(2, 6, R()); c.tg = 0; c.tgt = null; c.tgx = 0; c.tgy = 0;
    c.hu = 0; c.pre = 0; c.hT = 1; c.hx0 = 0; c.hy0 = 0; c.hd0 = 0; c.htx = 0; c.hty = 0; c.kk = 0; c.ss = 0; c.sk = 0; c.swT = 0; c.v = 0;
    c.rn = 0; c.started = 0; c.px0 = R() * 97; c.py0 = R() * 89; c.vb = c.var === 'braun' ? 7 : 0;
    c.J = new Float32Array(14); c.mko = []; c.sac = 0;
    // Testzustände für Probebilder: fpose = sit | jump | croak | swim | tongue
    const fp = Q.get('fpose');
    if (fp) { c.solo = 1; c.kk = fp === 'jump' ? 1 : fp === 'swim' ? 0.5 : 0; c.ss = fp === 'swim' ? 1 : 0; if (fp === 'croak') { c.cro = 1; c.cp = 0.25; } if (fp === 'tongue') { c.tg = 0.45; c.tgx = 1e9; } }
  },
  update,
  tap(c, oc, x, y) {
    const d = Math.hypot(c.x - x, c.y - y) || 1, away = { x: (c.x - x) / d, y: (c.y - y) / d };
    if (c.st === SIT) leave(c, oc, away, true);
    else if (c.st === SWIM) { c.v += 110 * oc.scale; c.th = Math.atan2(away.y, away.x); c.sk = Math.floor(c.sk) + 0.01; }
  },
  prep(c, oc) {
    // Gelenke der aktuellen Haltung: Sitzen ↔ gespreizt (Schwimmen), dazu gestreckt (Sprung, Beinschlag)
    const J = c.J, s = c.ss, k = c.kk;
    for (let i = 0; i < 14; i++) J[i] = lerp(lerp(P_SIT[i], P_TUCK[i], s), P_EXT[i], k);
    c.ext = 0.68 + 0.64 * k; c.wext = 0.8 + 0.07 * s;   // nur so viel abtasten, wie die Beine gerade reichen
    c.sac = c.cro > 0 ? Math.max(0, Math.sin(c.cp * Math.PI)) * Math.min(1, c.cro * 3) : 0;
    c.shut = c.blk < 0;
    // Zunge: Ziel im Körpermaß
    if (c.tg > 0) {
      const L = c.len, dx = c.tgx - c.x, dy = c.tgy - c.y;
      c.ta = c.tgx > 1e8 ? 1.6 : (dx * c.hx + dy * c.hy) / L; c.tb = c.tgx > 1e8 ? 0.15 : (dy * c.hx - dx * c.hy) / L;
    }
  },
  cell(a, b, c, o) {
    if (a > 0.62 || a < -1.32) { o.f = -0.1; return; }
    const side = b < 0 ? -1 : 1, bb = b * side, J = c.J, vb = c.vb;
    // Rumpf
    const w = bodyW(a); let f = w - bb, part = 0, pt = 0, pq = 0, pr = 1;
    // Augen
    const de = Math.hypot(a - 0.32, bb - 0.2), fe = 0.105 - de;
    if (fe > f) { f = fe; part = 1; }
    // Schallblasen
    if (c.sac > 0.03) { const r = 0.125 * c.sac, ds = Math.hypot(a - 0.12, bb - (0.25 + 0.07 * c.sac)), fs = r - ds; if (fs > f) { f = fs; part = 2; pq = (bb - 0.25 - 0.07 * c.sac) / r; } }
    // Beine
    if (bb > 0.05 || a < -0.4) {
      for (let i = 0; i < 5; i++) {
        const S = SEG[i], j0 = S[0] * 2, j1 = S[1] * 2, d = seg(a, bb, J[j0], J[j0 + 1], J[j1], J[j1 + 1]), fl = S[2] - d.d;
        if (fl > f) { f = fl; part = i < 3 ? 3 : 4; pt = d.t + i; pq = d.q / S[2]; pr = S[2]; }
      }
      // Schwimmhäute am Fuß, Finger an der Hand
      const ff = 0.09 - Math.hypot(a - J[6], bb - J[7]); if (ff > f) { f = ff; part = 5; }
      const fh = 0.065 - Math.hypot(a - J[12], bb - J[13]); if (fh > f) { f = fh; part = 5; }
    }
    o.f = f;
    if (f <= 0) return;
    o.line = 1;
    switch (part) {
      case 0: {   // Rücken: rund schattiert, Leisten, Flecken
        const t = b / Math.max(w, 1e-3);
        o.lit = TM.shade(t, c) - 0.12 * ((a - 0.03) / 0.47) ** 2 + 0.06 * (noise2(a * 19 + c.px0, b * 19) - 0.5);
        o.col = vb;
        if (a < 0.3 && noise2(a * 7 + c.px0, b * 7 + c.py0) > 0.7) o.col = vb + 1;   // wenige dunkle Flecken
        return;
      }
      case 1:   // Auge (zu: Lid in Körperfarbe)
        if (c.shut) { o.col = vb; o.lit = 0.55; } else { o.col = 3; o.lit = 0.95 - 0.25 * Math.max(0, de / 0.105 - 0.5); }
        return;
      case 2: o.col = 5; o.lit = 0.55 + 0.4 * Math.sqrt(Math.max(0, 1 - pq * pq)); return;   // Schallblase, kugelig
      case 3: case 4: {   // Beine: rund, mit dunklen Ringeln
        o.lit = (0.3 + 0.5 * Math.sqrt(Math.max(0, 1 - pq * pq)) + 0.12 * pq * side * c.lx) * 0.8;   // etwas dunkler als der Rücken
        o.col = Math.sin(pt * Math.PI * 2.2 + 1) > 0.7 ? vb + 1 : vb;
        return;
      }
      default: o.col = vb; o.lit = 0.42; return;   // Füße, Hände
    }
  },
  marks(c) {
    const m = c.mko; m.length = 0;
    if (!c.shut) m.push([0.33, -0.215, 64, 4, 1], [0.33, 0.215, 64, 4, 1]);   // Pupillen
    if (c.tg > 0) {   // Zunge: vom Maul zum Ziel und zurück, Spitze klebrig rund
      const e = c.tg < 0.4 ? c.tg / 0.4 : 1 - (c.tg - 0.4) / 0.6, a0 = 0.47, ta = lerp(a0, c.ta, e), tb = c.tb * e;
      const n = Math.max(2, Math.ceil(Math.hypot(ta - a0, tb) * c.len / 4));
      for (let i = 1; i <= n; i++) { const s = i / n; m.push([lerp(a0, ta, s), tb * s, i === n ? 111 : TM.dirGlyph(c, ta - a0, tb), 6, i === n ? 1 : 0.8]); }
    }
    return m;
  },
};
})();
