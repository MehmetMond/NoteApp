// Hai von oben: schlanker Torpedo, spitze Schnauze, große starre Brustflossen, Rückenflosse als Grat,
// langer Schwanz mit längerem Oberlappen. Zieht tief und ruhig weite Bögen, Futter ist ihm egal.
(function () {
const { clamp, noise1, TAU } = TM.util;

// Rumpfbreite als Tabelle: einmal rechnen, in cell nur nachschlagen (pow ist teuer)
const AM = 0.2, WM = 0.072, WP = 0.016, AP = -0.25;   // breiteste Stelle, Schwanzstiel
const NB = 240, A0 = -0.56, A1 = 0.56, DA = (A1 - A0) / (NB - 1), WT = new Float32Array(NB);
for (let i = 0; i < NB; i++) {
  const a = A0 + i * DA;
  let w = 0;
  if (a >= AM && a < 0.5) { const x = (a - AM) / (0.5 - AM); w = WM * Math.pow(1 - Math.pow(x, 1.7), 1.05); }   // spitze Schnauze
  else if (a < AM && a >= AP) { const x = (AM - a) / (AM - AP); w = WP + (WM - WP) * Math.pow(1 - x, 1.2) * (1 + 0.7 * x); }
  WT[i] = w;
}
function bodyW(a) {
  let x = (a - A0) / DA; if (x <= 0) return WT[0]; if (x >= NB - 1) return WT[NB - 1];
  const i = x | 0; x -= i; return WT[i] + (WT[i + 1] - WT[i]) * x;
}
// Flosse als Dreieck mit gewölbter Vorderkante und hohler Hinterkante (Sichel): Wurzel vorn R1, Wurzel hinten R2,
// Spitze T. fin() gibt den Abstand zum Rand (innen > 0) in Körperlängen.
function mkFin(r1a, r1s, r2a, r2s, ta, ts, bl, bt) {
  const la = ta - r1a, ls = ts - r1s, ll = Math.hypot(la, ls), ta2 = ta - r2a, ts2 = ts - r2s, lt = Math.hypot(ta2, ts2);
  return { r1a, r1s, r2a, r2s, ea: la / ll, es: ls / ll, il: 1 / ll, fa: ta2 / lt, fs: ts2 / lt, it: 1 / lt, bl, bt };
}
function fin(a, s, F) {
  let da = a - F.r1a, ds = s - F.r1s, u = (da * F.ea + ds * F.es) * F.il;
  let dl = ds * F.ea - da * F.es;   // Vorderkante
  if (u > 0 && u < 1) dl += F.bl * 4 * u * (1 - u);
  da = a - F.r2a; ds = s - F.r2s; u = (da * F.fa + ds * F.fs) * F.it;
  let dt = da * F.fs - ds * F.fa;   // Hinterkante
  if (u > 0 && u < 1) dt += F.bt * 4 * u * (1 - u);
  return dl < dt ? dl : dt;
}
const PE = mkFin(0.27, 0.055, 0.11, 0.05, -0.02, 0.25, 0.025, -0.045);       // Brustflosse
const PV = mkFin(-0.04, 0.022, -0.09, 0.018, -0.115, 0.05, 0.003, -0.004);  // Bauchflosse
// Augen: kleine Punkte seitlich am Kopf, knapp innerhalb des Umrisses
const EYES = [[0.425, -(bodyW(0.425) - 0.01), 'o', 3, 1], [0.425, bodyW(0.425) - 0.01, 'o', 3, 1]];

// Dünne Striche (Schwanzlappen, Grat) zeichnet der Hai selbst, genau eine Zelle dick (ohne Umriss drumherum, der
// sonst doppelt läge): steile als | / \, flache als -, ganz unten in der Zelle als _ (' wirkte gepunktet).
// prep merkt sich je Strich i in c.st: px je Körperlänge quer zum Strich, halbe Dicke, Höhenfaktor, festes Zeichen.
function station(c, oc, i, da, db, pa, pb) {
  const hx = c.hx, hy = c.hy;
  let dx = da * hx - db * hy, dy = da * hy + db * hx; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  const nx = -dy, ny = dx, kN = c.len * ((pa * hx - pb * hy) * nx + (pa * hy + pb * hx) * ny), S = c.st;
  S[i * 4] = kN; S[i * 4 + 1] = 0.5 * Math.max(Math.abs(dx) * oc.ch, Math.abs(dy) * oc.cw) / Math.max(Math.abs(kN), 1e-6);
  if (Math.abs(dy) < Math.abs(dx) * 0.75) { S[i * 4 + 2] = -kN / (ny * oc.ch); S[i * 4 + 3] = 0; }
  else { S[i * 4 + 2] = 0; S[i * 4 + 3] = TM.util.lineGlyph(dx, dy); }
}
function strokeGl(c, i, delta) {
  const S = c.st, g = S[i * 4 + 3];
  if (g) return g;
  const f = delta * S[i * 4 + 2];   // Lage des Strichs in der Zelle: < 0 oben, > 0 unten
  return f > 0.38 ? 95 : 45;
}
// Querneigung der Mittellinie durch Schwimmwelle und Kurve an der Stelle a (wie in Ocean.sample)
function slopeAt(c, kw, a) {
  const e = 0.5 - a;
  return -(2 * c.amp * e * Math.sin(kw * e - c.ph) + c.amp * e * e * kw * Math.cos(kw * e - c.ph)) + c.bend * a;
}

TM.kinds.hai = {
  label: 'Hai', count: 1, len: [320, 420], speed: [30, 42], turn: 0.2, depth: [0.45, 0.75],
  tapTip: 'Schwanzschlag, dann schießt er davon',   // Hinweis beim Antippen (Vorschauseite)
  amp: 0.07, waveK: 0.65, beat: 0.42, dash: 2.6, ext: 0.53, wext: 0.27, space: 0.3,
  ramp: '.,:;+oO0@',   // ohne - und =: der lange Rumpf bekommt sonst Streifen
  //        Rücken     Flossen    Saum, Grat  Auge
  colors: ['#93abbe', '#88a0b4', '#687f93', '#e4ecf0'],
  light: ['#3f5263', '#354758', '#233140', '#0e161b'],
  init(c) {
    c.fl = 0; c.eb = 0.02; c.lua = -1; c.lub = 0; c.utb = 0; c.st = new Float32Array(24);
  },
  // Eigenes Schwimmen: gleichmäßig, weit vorausschauend, früh in großem Bogen abdrehen; Futter egal
  update(c, dt, oc) {
    const k = c.kind, L = c.len;
    c.wt += dt * 0.06;
    const wa = (noise1(c.seed * 0.137 + c.wt) - 0.5) * 1.8;
    let sx = Math.cos(c.th + wa), sy = Math.sin(c.th + wa), fast = 0;
    // Vorausschau: wo ist der Kopf in ein paar Sekunden? Liegt der Punkt am Rand, früh abdrehen
    const look = L * 0.5 + c.v * 5, px = c.x + c.hx * look, py = c.y + c.hy * look, m = Math.min(oc.W, oc.H) * 0.25;
    if (px < m) sx += (m - px) / m * 2.5; else if (px > oc.W - m) sx -= (px - oc.W + m) / m * 2.5;
    if (py < m) sy += (m - py) / m * 2.5; else if (py > oc.H - m) sy -= (py - oc.H + m) / m * 2.5;
    if (c.x < 0 || c.y < 0 || c.x > oc.W || c.y > oc.H) {   // schon draußen: zurück zur Mitte
      const ex = oc.W / 2 - c.x, ey = oc.H / 2 - c.y, d = Math.hypot(ex, ey) || 1; sx += ex / d * 2; sy += ey / d * 2;
    }
    // Stift: weicht gelassen aus
    const P = oc.ptr, pd = Math.hypot(c.x - P.x, c.y - P.y) || 1, fr = 120 * oc.scale + L * 0.35;
    if (oc.t - P.t < 0.6 && pd < fr) { const s = (1 - pd / fr) * 3; sx += (c.x - P.x) / pd * s; sy += (c.y - P.y) / pd * s; fast = 0.5 * (1 - pd / fr); }
    if (c.burst > 0) {
      c.burst -= dt; fast = Math.max(fast, Math.min(1, c.burst));   // in der letzten Sekunde wieder ruhiger
      if (c.fx != null) { const d = Math.hypot(c.x - c.fx, c.y - c.fy) || 1; sx += (c.x - c.fx) / d * 3; sy += (c.y - c.fy) / d * 3; }
    } else c.fx = null;
    for (const d of oc.list) {   // Abstand zu anderen in ähnlicher Tiefe
      if (d === c || d.kind.rigid && !d.kind.solid || Math.abs(d.depth - c.depth) > 0.22) continue;
      const ex = c.x - d.x, ey = c.y - d.y, r = (L + d.len) * 0.36, q = ex * ex + ey * ey;
      if (q < r * r && q > 1) { const mm = Math.sqrt(q), s = (1 - mm / r) * 1.5; sx += ex / mm * s; sy += ey / mm * s; }
    }
    const cr = TM.crowd(c, oc); sx += cr.x; sy += cr.y;   // von oben gesehen Platz lassen (auch zu tieferen Tieren)
    let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
    // Ziel fast hinter ihm: zur Seite mit mehr Platz (zur Mitte hin) wenden, nicht zufällig in die Wand
    if (Math.abs(da) > 2) { const side = c.hx * (oc.H / 2 - c.y) - c.hy * (oc.W / 2 - c.x); if (side * da < 0) da = -da; }
    const mt = k.turn * (1 + fast * 1.5);
    c.om += (clamp(da * 1.1, -mt, mt) - c.om) * Math.min(1, dt * 1.2);
    c.th += c.om * dt;
    c.v += (c.cruise * (1 + fast * k.dash) - c.v) * Math.min(1, dt * (fast > 0.05 ? 2.2 : 0.45));
    c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
    c.bend = clamp(c.om / Math.max(c.v, 8) * L * 0.4, -0.85, 0.85);
    // Schwanzschlag: Takt wächst mit dem Tempo; nach dem Antippen ein kurzer, kräftiger Schlag (c.fl)
    c.fl = Math.max(0, c.fl - dt * 1.3);
    c.ph += dt * TAU * k.beat * (0.75 + 2 * c.v / L) * (1 + 2.2 * c.fl);
    c.amp = k.amp * (0.85 + 0.3 * fast + 1.2 * c.fl);
  },
  // Antippen: Schwanzschlag, dann schießt er nach vorn und dreht von der getippten Seite weg
  tap(c, oc, x, y) {
    const side = (x - c.x) * -c.hy + (y - c.y) * c.hx >= 0 ? 1 : -1, L = c.len;
    c.burst = 2.2; c.fl = 1;
    c.fx = c.x - c.hx * L * 0.5 - c.hy * side * L * 0.3; c.fy = c.y - c.hy * L * 0.5 + c.hx * side * L * 0.3;
  },
  prep(c, oc) {
    c.eb = 0.7 * Math.min(oc.cw, oc.ch) / c.len;   // Saumbreite der Flossen
    // Unterlappen der Schwanzflosse hängt dem Schlag hinterher und zeigt mal links, mal rechts heraus;
    // der Oberlappen weicht ein wenig zur Gegenseite, so bleibt die Gabel offen
    const kw = TAU * this.waveK, ang = 0.42 * Math.cos(kw - c.ph);
    c.lua = -Math.cos(ang); c.lub = Math.sin(ang); c.utb = Math.tan(-0.15 * ang);
    // Striche: Oberlappen (vier Stützstellen, die Schwimmwelle biegt ihn), Unterlappen, Rückenflossengrat
    for (let i = 0; i < 4; i++) station(c, oc, i, 1, slopeAt(c, kw, -0.27 - i * 0.075) - c.utb, 0, 1);
    station(c, oc, 4, c.lua, c.lub + c.lua * slopeAt(c, kw, -0.32), -c.lub, c.lua);
    station(c, oc, 5, 1, slopeAt(c, kw, 0.05), 0, 1);
  },
  cell(a, b, c, o) {
    const s = b < 0 ? -b : b;
    if (a > 0.56 || a < -0.56 || s > 0.31) { o.f = -0.03; return; }   // weit draußen: billig
    const w = bodyW(a), S = c.st;
    let f = w - s; if (a > 0.5) f -= a - 0.5;   // Rumpf
    const inP = a > -0.06 && a < 0.32 && s > 0.02, inV = a > -0.16 && a < 0 && s < 0.1, inT = a < -0.2 && s < 0.1;
    if (f < -0.035 && !inP && !inV && !inT) { o.f = f; return; }   // neben dem Rumpf, keine Flosse in der Nähe
    let part = 0, best = f, si = 0, sd = 0;
    // Brustflossen (starr, nach hinten gefegt) und kleine Bauchflossen; im Rumpf gewinnt immer der Rumpf
    if (inP) { const g = fin(a, s, PE); if (g > best) { best = g; if (f <= 0) part = 1; } }
    if (inV) { const g = fin(a, s, PV); if (g > best) { best = g; if (f <= 0) part = 1; } }
    // Schwanzflosse: langer dünner Oberlappen, kurzer Unterlappen schräg (je ein Strich, Feld = Strichbreite)
    if (inT) {
      const j = clamp(Math.round((-0.27 - a) / 0.075), 0, 3);
      const db = b - (-0.25 - a) * c.utb, g = S[j * 4 + 1] - (db < 0 ? -db : db) + (a < -0.49 ? a + 0.49 : 0);
      if (g > best) { best = g; if (f <= 0) { part = 2; si = j; sd = db; } }
      const da = a + 0.25, u = da * c.lua + b * c.lub, v = -da * c.lub + b * c.lua, t = u / 0.12;
      const h = (t > 0 ? S[17] : 0) - (v < 0 ? -v : v) - (t > 1 ? (t - 1) * 0.12 : 0);
      if (h > best) { best = h; if (f <= 0) { part = 2; si = 4; sd = v; } }
    }
    o.f = best;
    if (best <= 0) return;
    if (part === 0) {   // Rumpf: rund, Licht von oben links
      const t = clamp(b / Math.max(w, 1e-3), -1, 1);
      o.line = 1; o.lit = 0.3 + 0.52 * Math.sqrt(1 - t * t) + 0.18 * t * c.lx; o.col = 0;
      // Rückenflosse: ein schmaler dunkler Grat auf der Mittellinie
      if (s < S[21] && a > -0.02 && a < 0.09) { const gl = strokeGl(c, 5, b); if (gl) { o.ch = gl === 39 || gl === 95 ? 45 : gl; o.col = 2; o.lit = 0.9; } }
      return;
    }
    if (part === 2) {   // dünne Lappen: eigene Strichzeichen, kein Umriss drumherum
      const gl = strokeGl(c, si, sd);
      if (!gl) { o.f = -0.001; return; }
      o.ch = gl; o.col = 1; o.lit = 0.75; return;
    }
    o.line = 1; o.col = best < c.eb ? 2 : 1; o.lit = 0.32;   // Flossen: flach, licht gefüllt, dunkler Saum
  },
  marks() { return EYES; },
};
})();
