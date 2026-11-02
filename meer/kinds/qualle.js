// Ohrenqualle (Aurelia) von oben: durchscheinende Glocke, vier Hufeisen-Gonaden als Kleeblatt, Radialkanäle,
// vier krause Mundarme, Saum aus feinen Tentakeln. Pulsiert (zieht sich zusammen, stößt sich ab) und treibt.
(function () {
const { TAU, clamp, smooth, noise1, hash2 } = TM.util;

// Strich durch eine Zelle: Normale (nx, ny) auf dem Bildschirm, Zellmitte liegt d davor → Zeichen aus der
// Kantentabelle der Engine (wie oc.ring), 0 = Strich trifft die Zelle nicht
function stroke(oc, nx, ny, d) {
  const half = 0.5 * (Math.abs(nx) * oc.cw + Math.abs(ny) * oc.ch);
  if (d <= -half || d > half) return 0;
  const NA = oc.NA; let ia = Math.round(Math.atan2(ny, nx) / TAU * NA) % NA; if (ia < 0) ia += NA;
  return oc.lut[ia * oc.ND + Math.min(oc.ND - 1, Math.floor((d / half + 1) * 0.5 * oc.ND))];
}
// Kontraktion über die Pulsphase p (0..1): rasch zusammen, langsam wieder auf
const squeeze = p => p < 0.28 ? smooth(0, 0.28, p) : 1 - smooth(0.28, 1, p);
// Zielrichtung: Grundrichtung plus langsames Schweifen
const aim = c => c.base + (noise1(c.seed * 0.137 + c.wt) - 0.5) * 4;
// Gonaden-Ringe als feste Schablonen um eine Zellmitte: kleine Kreise aus Zeichen bleiben so rund und ruhig.
// Je Größe: halbe Breite/Höhe in Zellen, dann Zeilen (Mitte = Gonadenmitte)
const RINGS = [
  [0, 0, 'o'],
  [0, 0, 'O'],
  [2, 1, ' .-. ', '(   )', " '-' "],
  [3, 1, ' .---. ', '(     )', " '---' "],
  [4, 2, '  .---.  ', ' /     \\ ', '(       )', ' \\     / ', "  '---'  "],
];
const RQX = 4, RQY = 2, RW = 2 * RQX + 1;
const KC = new Float32Array(17), KS = new Float32Array(17);   // Richtungen der 16 Radialkanäle (j = -8 … 8)
for (let j = 0; j < 17; j++) { KC[j] = Math.cos((j - 8) * TAU / 16); KS[j] = Math.sin((j - 8) * TAU / 16); }
const TPL = RINGS.map(([hx, hy, ...rows]) => {
  const t = new Uint16Array(RW * (2 * RQY + 1));
  rows.forEach((row, r) => Array.from(row).forEach((ch, q) => { if (ch !== ' ') t[(r - hy + RQY) * RW + q - hx + RQX] = ch.charCodeAt(0); }));
  return { hx, hy, t };
});
// Die Glocke ist innen durchsichtig (dort wird nichts gemalt). Damit Antippen sie trotzdem trifft, trägt ein
// Effekt gleich nach der Qualle sie als Besitzer der leeren Zellen ihrer Scheibe ein (oc.O, wie put(…, owner)).
function own(c, oc) {
  const R = c.R * 0.97, cw = oc.cw, ch = oc.ch, cols = oc.cols, O = oc.O, id = c.id;
  const r0 = Math.max(0, Math.floor((c.y - R) / ch)), r1 = Math.min(oc.rows - 1, Math.floor((c.y + R) / ch));
  for (let r = r0; r <= r1; r++) {
    const dy = (r + 0.5) * ch - c.y, sp = R * R - dy * dy; if (sp <= 0) continue;
    const s = Math.sqrt(sp), q0 = Math.max(0, Math.ceil((c.x - s) / cw - 0.5)), q1 = Math.min(cols - 1, Math.floor((c.x + s) / cw - 0.5));
    for (let q = q0, i = r * cols + q0; q <= q1; q++, i++) if (!O[i]) O[i] = id;
  }
}

TM.kinds.qualle = {
  label: 'Qualle', count: 3, len: [72, 140], speed: [5, 9], depth: [0.2, 0.85], rigid: true, wake: 0,
  tapTip: 'pumpt schneller und treibt davon',   // Hinweis beim Antippen (Vorschauseite)
  ext: 0.66, wext: 0.66, space: 0.5, every: 2,   // every: träge, nur jedes zweite Bild neu abtasten
  //        Glocke     Saum       Gonaden    Mundarme   Kanäle     Gonaden (lila)
  colors: ['#d3dcf0', '#aeb8de', '#e09ad2', '#e6d6ea', '#9aa6cf', '#b59ae6'],
  light: ['#44527a', '#5d6790', '#963a80', '#76588a', '#6f799e', '#6a4aa0'],
  init(c, R, oc) {
    c.per = 2.3 + R() * 0.5;                  // Pulsdauer in s
    c.var = c.var || (R() < 0.6 ? 'rosa' : 'lila');   // Farbe der Gonaden (wie bei echten Ohrenquallen verschieden)
    c.alarm = 0; c.v = 0; c.base = c.th;      // Grundrichtung, um die sie langsam schweift
    c.gx = new Float32Array(4); c.gy = new Float32Array(4); c.sx = new Float32Array(4); c.sy = new Float32Array(4);
    if (oc) oc.fx.push({ get depth() { return c.depth - 1e-4; }, under: false, update: () => !c.dead, draw: o => { if (c.R) own(c, o); } });
  },
  update(c, dt, oc) {
    const al = c.alarm > 0; if (al) c.alarm -= dt;
    c.ph += dt * TAU / c.per * (al ? 2.7 : 1);
    const p = (c.ph / TAU) % 1;
    // Schub nur während der Kontraktion, danach gleitet sie aus
    const thrust = p < 0.3 ? Math.sin(p / 0.3 * Math.PI) : 0;
    c.v += (thrust * c.cruise * (al ? 19 : 5.8) - c.v * 1.1) * dt;
    // Richtung: langsam schweifen, vom Rand weg (Quallen steuern kaum: träge drehen)
    c.wt += dt * 0.035;
    const wa = aim(c);
    let sx = Math.cos(wa), sy = Math.sin(wa), ex = 0, ey = 0;
    const pad = Math.min(140, oc.W * 0.12) + c.len * 0.5;
    if (c.x < pad) ex = (pad - c.x) / pad; else if (c.x > oc.W - pad) ex = -(c.x - oc.W + pad) / pad;
    if (c.y < pad) ey = (pad - c.y) / pad; else if (c.y > oc.H - pad) ey = -(c.y - oc.H + pad) / pad;
    sx += ex * 2.5; sy += ey * 2.5;
    const cr = TM.crowd(c, oc), cm = Math.hypot(cr.x, cr.y); sx += cr.x * 1.5; sy += cr.y * 1.5;   // anderen Platz lassen
    let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
    const tr = 0.18 + 0.4 * Math.min(1, Math.abs(ex) + Math.abs(ey) + cm);   // am Rand und im Gedränge entschlossener wenden
    c.th += clamp(da * 0.6, -tr, tr) * dt;
    c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
  },
  // je Bild: Pulsform, Radien und Lage der Muster in Pixeln (die Qualle ist starr, alles in Bildschirmrichtung)
  prep(c, oc) {
    const L = c.len, p = ((c.ph / TAU) % 1 + 1) % 1, k = squeeze(p);
    c.k = k;
    c.R = 0.5 * L * (1 - 0.1 * k);
    // Gonaden: Schablone nach Größe, Abstand so, dass sich die Ringe nicht berühren
    const ti = L < 75 ? 0 : L < 112 ? 1 : L < 160 ? 2 : L < 230 ? 3 : 4, T = c.T = TPL[ti];
    c.rg = Math.max(0.13 * L, 1.75 * (T.hx + 0.5) * oc.cw) * (1 - 0.03 * k);
    for (let i = 0; i < 4; i++) {
      const an = TAU / 8 + i * TAU / 4; c.gx[i] = Math.cos(an) * c.rg; c.gy[i] = Math.sin(an) * c.rg;
      c.sx[i] = (Math.floor((c.x + c.gx[i]) / oc.cw) + 0.5) * oc.cw - c.x;   // auf Zellmitte
      c.sy[i] = (Math.floor((c.y + c.gy[i]) / oc.ch) + 0.5) * oc.ch - c.y;
    }
    c.mx = (Math.floor(c.x / oc.cw) + 0.5) * oc.cw - c.x; c.my = (Math.floor(c.y / oc.ch) + 0.5) * oc.ch - c.y;   // Mundzelle
    // Mundarme: Länge und Windrad-Schwung (atmet langsam)
    c.La = 0.34 * L; c.curl = 0.24 + 0.08 * Math.sin(oc.t * 0.35 + c.seed);
    // Saum: hinten (gegen die Fahrt) länger, beim Schub weht er nach
    c.trail = clamp(c.v / (c.cruise * 3), 0, 1);
    c.fl = 1 + 0.6 * squeeze((p + 0.85) % 1);
    const Ro = c.R + 2.5 * oc.ch; c.Ro2 = Ro * Ro;
  },
  cell(a, b, c, o, oc) {
    const L = c.len, px = (a * c.hx - b * c.hy) * L, py = (a * c.hy + b * c.hx) * L;
    const q = px * px + py * py, R = c.R;
    o.f = -1;
    if (q > c.Ro2) return;
    const d = Math.sqrt(q) || 1e-3, nx = -px / d, ny = -py / d, off = R - d;
    const half = 0.5 * (Math.abs(nx) * oc.cw + Math.abs(ny) * oc.ch);
    const li = 0.6 * nx + 0.8 * ny;   // Licht von oben links
    if (off <= half) {
      if (off > -half) {   // Glockenrand
        const g = stroke(oc, nx, ny, off);
        if (g) { o.f = 1; o.ch = g; o.col = 0; o.lit = 0.88 + 0.12 * li; }
        return;
      }
      // Tentakelsaum: Pünktchen in einem Band außen, hinten länger
      const back = -(px * c.hx + py * c.hy) / d;
      const band = 2 * half * Math.min(1.7, 0.75 * c.fl + 0.9 * c.trail * Math.max(0, back));
      if (off > -half - band) {
        const an = Math.atan2(py, px), h = hash2((an * 40 + 1000) | 0, c.id);
        if (h < 0.3) return;
        o.f = 1; o.col = 1; o.lit = 0.5 + 0.2 * li;
        o.ch = Math.abs(ny) > Math.abs(nx) * 1.5 ? (ny > 0 ? 46 : 39) : 183;
      }
      return;
    }
    // Gonaden: Ringschablone, zur Mitte hin offen (Hufeisen)
    const T = c.T;
    for (let i = 0; i < 4; i++) {
      const dq = Math.round((px - c.sx[i]) / oc.cw), dr = Math.round((py - c.sy[i]) / oc.ch);
      if (dq < -T.hx || dq > T.hx || dr < -T.hy || dr > T.hy) continue;
      const g = T.t[(dr + RQY) * RW + dq + RQX];
      if (!g) continue;
      const ex = dq * oc.cw, ey = dr * oc.ch, el = Math.sqrt(ex * ex + ey * ey);
      if (el > 0 && -(ex * c.gx[i] + ey * c.gy[i]) / (el * c.rg) > 0.75) continue;
      o.f = 1; o.ch = g; o.col = c.var === 'lila' ? 5 : 2; o.lit = el > 0 ? 0.85 - 0.15 * (ex * 0.6 + ey * 0.8) / el : 0.95; return;
    }
    if (Math.abs(px - c.mx) < oc.cw * 0.3 && Math.abs(py - c.my) < oc.ch * 0.3) { o.f = 1; o.ch = 43; o.col = 3; o.lit = 0.6; return; }   // Mund (Zelle der Mitte)
    // Mundarme: je eine gekräuselte Linie, alle im selben Drehsinn geschwungen (Windrad), zwischen den Gonaden
    // hindurch. Arm längs ±x oder ±y: s = längs, lat = quer (Armrichtung um 90° gedreht)
    const hor = Math.abs(px) > Math.abs(py), sg = hor ? (px > 0 ? 1 : -1) : (py > 0 ? 1 : -1);
    const s = hor ? px * sg : py * sg, lat = hor ? py * sg : -px * sg;
    if (s < c.La && lat > -oc.ch && lat < c.curl * c.La + oc.ch) {
      const t = s / c.La, arm = hor ? (sg > 0 ? 0 : 2) : (sg > 0 ? 1 : 3);
      // Mittellinie: Windrad-Bogen plus kurze Kräuselwelle
      const kk = TAU / (5 * (hor ? oc.cw : oc.ch)), A = (hor ? 0.14 * oc.ch : 0.25 * oc.cw) * (0.3 + 0.7 * t);
      const ph = kk * s - oc.t * 1.6 + arm * 1.9;
      const lc = c.curl * s * t + A * Math.sin(ph), dl = 2 * c.curl * t + A * kk * Math.cos(ph);
      const e = 1 / Math.sqrt(1 + dl * dl);
      // Normale auf dem Bildschirm: quer zum Arm, um die Steigung gekippt (Arm E, quer Q = E um 90° gedreht)
      const ex = hor ? sg : 0, ey = hor ? 0 : sg, qx = -ey, qy = ex;
      const g = stroke(oc, (qx - dl * ex) * e, (qy - dl * ey) * e, (lat - lc) * e);
      if (g) { o.f = 1; o.ch = g; o.col = 3; o.lit = 0.4 - 0.2 * t; return; }
    }
    // Radialkanäle als feine Punktreihen (16), nicht auf den Armen
    if (d < R * 0.45 || d > R - 3 * half || (s < c.La + oc.cw && lat > -2 * oc.cw && lat < c.curl * c.La + 2 * oc.cw)) return;
    const an = Math.atan2(py, px), j = Math.round(an / (TAU / 16)), dj = an - j * TAU / 16;
    const ca = KC[j + 8], sa = KS[j + 8];
    const dn = d * Math.sin(dj), ht = 0.5 * (Math.abs(sa) * oc.cw + Math.abs(ca) * oc.ch);
    if (dn > -ht && dn <= ht && (d / 7 | 0) % 2 === 0) { o.f = 1; o.ch = 183; o.col = 4; o.lit = j & 1 ? 0.32 : 0.42; }
  },
  // Antippen: pumpt ein paar Sekunden schnell und treibt vom Finger weg (Grundrichtung folgt mit)
  tap(c, oc, x, y) {
    c.alarm = 3.4;
    const d = Math.hypot(c.x - x, c.y - y);
    c.th = d > c.len * 0.06 ? Math.atan2(c.y - y, c.x - x) : c.th + Math.PI * (0.6 + 0.8 * hash2(c.seed, (oc.t * 15) | 0));
    c.base += c.th - aim(c);
    c.ph = Math.ceil(c.ph / TAU) * TAU;                               // sofort zusammenziehen
  },
};
})();
