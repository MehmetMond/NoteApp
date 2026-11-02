// Mantarochen von oben: breite Dreiecksflügel, zwei Kopflappen, dünner Peitschenschwanz. Starrer Körper, die
// Flügel schlagen selbst: die Spitzen rollen sich ein (die Spannweite atmet), das Licht läuft als Welle von vorn
// nach hinten über die Flügel. Dunkler Rücken, zwei helle Schulterflecken, heller Flügelsaum.
(function () {
const { clamp, lerp, smooth, noise1, TAU } = TM.util;

// Umriss einer Hälfte (s = |b| ≥ 0), in Scheibenlängen: Vorderkante LE(s), Hinterkante TE(s), Spitze bei S.
// Stützpunkte (s, a) mit weicher Kurve dazwischen; die Spitzen sind sichelförmig nach hinten gezogen.
const S = 1.07, NS = 160, SMAX = 1.25, DS = SMAX / (NS - 1);
const LE = new Float32Array(NS), TE = new Float32Array(NS), NL = new Float32Array(NS), NT = new Float32Array(NS);
// Catmull-Rom durch Stützpunkte [s, a, s, a, …] (s aufsteigend), außerhalb geradlinig weiter
function curve(P, s) {
  const n = P.length / 2;
  if (s <= P[0]) return P[1] + (s - P[0]) * (P[3] - P[1]) / (P[2] - P[0]);
  if (s >= P[2 * n - 2]) return P[2 * n - 1] + (s - P[2 * n - 2]) * (P[2 * n - 1] - P[2 * n - 3]) / (P[2 * n - 2] - P[2 * n - 4]);
  let i = 0; while (P[2 * i + 2] < s) i++;
  const s1 = P[2 * i], s2 = P[2 * i + 2], t = (s - s1) / (s2 - s1);
  const p0 = i > 0 ? P[2 * i - 1] : 2 * P[1] - P[3], p1 = P[2 * i + 1], p2 = P[2 * i + 3], p3 = i + 2 < n ? P[2 * i + 5] : 2 * P[2 * i + 3] - P[2 * i + 1];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
const LEP = [0.11, 0.405, 0.2, 0.36, 0.4, 0.27, 0.6, 0.16, 0.8, 0.03, 0.95, -0.09, S, -0.21];   // Kopf, Schulter, Flügel
const TEP = [0.0, -0.47, 0.12, -0.44, 0.22, -0.33, 0.35, -0.23, 0.5, -0.165, 0.7, -0.135, 0.9, -0.155, S, -0.21];
for (let i = 0; i < NS; i++) {
  const s = i * DS;
  LE[i] = s < 0.11 ? 0.405 : curve(LEP, s);
  TE[i] = curve(TEP, s);
}
for (let i = 0; i < NS; i++) {   // Steigung → Abstand senkrecht zur Kante statt längs
  const j = Math.min(NS - 1, i + 1), k = Math.max(0, i - 1);
  NL[i] = 1 / Math.hypot(1, (LE[j] - LE[k]) / ((j - k) * DS));
  NT[i] = 1 / Math.hypot(1, (TE[j] - TE[k]) / ((j - k) * DS));
}
// Rumpf (erhabene Mitte) nur für die Schattierung
const trunkW = a => a > 0.41 ? 0.15 : a > 0.15 ? lerp(0.2, 0.15, (a - 0.15) / 0.26) : a > -0.42 ? lerp(0.06, 0.2, (a + 0.42) / 0.57) : 0.06;
// Kopflappen (rechte Seite, links gespiegelt): je zwei Stücke, erst gerade nach vorn, die Spitze nach innen gerollt
const LOBE = [0.37, 0.135, 0.52, 0.128, 0.52, 0.128, 0.585, 0.1];
// Abstand zum Lappenstück j der Seite sd als Strich (innen > 0); das passende Zeichen landet in c.lg
function lobe(a, b, c, j, sd) {
  const P = LOBE, a0 = P[j * 4], b0 = sd * P[j * 4 + 1], da = P[j * 4 + 2] - a0, db = sd * P[j * 4 + 3] - b0;
  const l = Math.hypot(da, db), t = ((a - a0) * da + (b - b0) * db) / (l * l), dd = ((b - b0) * da - (a - a0) * db) / l;
  if (t < 0 || (t > 1 && j === 0)) return -1;
  const k = (sd < 0 ? 8 : 0) + j * 4, T = c.lo, g = T[k + 1] - (dd < 0 ? -dd : dd) - (t > 1 ? (t - 1) * l : 0);
  if (g > 0) { let gl = T[k + 3]; if (!gl) { const q = dd * T[k + 2]; gl = q > 0.38 ? 95 : 45; } c.lg = gl; }
  return g;
}
// Dünner Strich, genau eine Zelle dick: steil als | / \, flach als -, ganz unten in der Zelle als _.
// Merkt sich in c.lo ab k: px je Körperlänge quer zum Strich, halbe Dicke, Höhenfaktor, festes Zeichen.
function strokeSetup(c, oc, k, da, db) {
  const hx = c.hx, hy = c.hy;
  let dx = da * hx - db * hy, dy = da * hy + db * hx; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  const ml = Math.hypot(da, db), pa = -db / ml, pb = da / ml, nx = -dy, ny = dx;
  const kN = c.len * ((pa * hx - pb * hy) * nx + (pa * hy + pb * hx) * ny), T = c.lo;
  T[k] = kN; T[k + 1] = 0.5 * Math.max(Math.abs(dx) * oc.ch, Math.abs(dy) * oc.cw) / Math.max(Math.abs(kN), 1e-6);
  if (Math.abs(dy) < Math.abs(dx) * 0.75) { T[k + 2] = -kN / (ny * oc.ch); T[k + 3] = 0; }
  else { T[k + 2] = 0; T[k + 3] = TM.util.lineGlyph(dx, dy); }
}
// Flügelschlag als Tabelle über a: Auslenkung und ihre Ableitung längs (die Welle läuft von vorn nach hinten)
const NA = 72, AA0 = -0.62, AA1 = 0.66, DAA = (AA1 - AA0) / (NA - 1), KAP = 4.5, S0 = 0.17;   // S0: Flügelansatz

TM.kinds.rochen = {
  label: 'Mantarochen', count: 1, len: [138, 158], speed: [22, 30], turn: 0.16, depth: [0.3, 0.6], rigid: true,
  tapTip: 'ein kräftiger Flügelschlag, dann gleitet er',   // Hinweis beim Antippen (Vorschauseite)
  ext: 0.62, wext: 1.12, space: 0.8,
  ramp: '.,:;+*%#@', gamma: 1.2,   // Tupfen statt Striche: die große Fläche soll nicht schraffiert wirken
  //        Rücken     Schulterflecken  Flügelsaum  Auge
  colors: ['#6f7c85', '#dfe3dc', '#b4c0c4', '#e8ece6'],
  light: ['#2c3236', '#b3bab8', '#6f7c82', '#15191b'],
  init(c, R) {
    c.fp = R() * TAU; c.tt = 99; c.bank = 0; c.amp = 0.5; c.cb = 1; c.sb = 0;
    c.FA = new Float32Array(NA); c.FD = new Float32Array(NA); c.lo = new Float32Array(16);
    c.tn = 70; c.ta = new Float32Array(c.tn); c.tb = new Float32Array(c.tn);
    c.mkp = []; c.mko = [];   // Marken werden je Bild wiederverwendet statt neu angelegt
    for (let i = 0; i < 90; i++) c.mkp.push([0, 0, 45, 0, 1]);
  },
  // Gleiten: weite, sanfte Bögen mit Schräglage; früh vom Rand abdrehen; Futter egal
  update(c, dt, oc) {
    const k = c.kind, L = c.len;
    c.wt += dt * 0.05;
    const wa = (noise1(c.seed * 0.191 + c.wt) - 0.5) * 2;
    let sx = Math.cos(c.th + wa), sy = Math.sin(c.th + wa), fast = 0;
    const span = L * 1.1, look = span * 0.6 + c.v * 5, px = c.x + c.hx * look, py = c.y + c.hy * look, m = Math.min(oc.W, oc.H) * 0.25;
    if (px < m) sx += (m - px) / m * 2.5; else if (px > oc.W - m) sx -= (px - oc.W + m) / m * 2.5;
    if (py < m) sy += (m - py) / m * 2.5; else if (py > oc.H - m) sy -= (py - oc.H + m) / m * 2.5;
    if (c.x < 0 || c.y < 0 || c.x > oc.W || c.y > oc.H) {   // schon draußen: zurück zur Mitte
      const ex = oc.W / 2 - c.x, ey = oc.H / 2 - c.y, d = Math.hypot(ex, ey) || 1; sx += ex / d * 2; sy += ey / d * 2;
    }
    const P = oc.ptr, pd = Math.hypot(c.x - P.x, c.y - P.y) || 1, fr = 120 * oc.scale + span * 0.5;
    if (oc.t - P.t < 0.6 && pd < fr) { const s = (1 - pd / fr) * 2.5; sx += (c.x - P.x) / pd * s; sy += (c.y - P.y) / pd * s; fast = 0.5 * (1 - pd / fr); }
    if (c.burst > 0) {
      c.burst -= dt;
      if (c.fx != null) { const d = Math.hypot(c.x - c.fx, c.y - c.fy) || 1; sx += (c.x - c.fx) / d * 2.5; sy += (c.y - c.fy) / d * 2.5; }
    } else c.fx = null;
    const cr = TM.crowd(c, oc); sx += cr.x; sy += cr.y;   // von oben gesehen Platz lassen
    let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
    // Ziel fast hinter ihm: zur Seite mit mehr Platz (zur Mitte hin) wenden
    if (Math.abs(da) > 2) { const side = c.hx * (oc.H / 2 - c.y) - c.hy * (oc.W / 2 - c.x); if (side * da < 0) da = -da; }
    const mt = k.turn * (1 + (c.burst > 0 ? 1.2 : fast));
    c.om += (clamp(da * 0.9, -mt, mt) - c.om) * Math.min(1, dt * 0.8);
    c.th += c.om * dt;
    // Schräglage folgt der Kurve weich: der innere Flügel taucht ab
    c.bank += (clamp(-c.om * 1.8, -0.4, 0.4) - c.bank) * Math.min(1, dt * 1.2);
    // Flügelschlag: ruhig, 3,6 s je Schlag. Nach dem Antippen (c.tt = Zeit seitdem) ein kräftiger, schneller
    // Schlag, dann gleitet er mit fast ruhenden Flügeln und viel Schwung davon, bis er wieder ruhig schlägt.
    c.tt += dt;
    const kick = 1 - smooth(1.1, 1.6, c.tt), glide = smooth(1.1, 1.8, c.tt) * (1 - smooth(5, 7, c.tt));
    c.fp += dt * TAU / 3.6 * (1 + 1.5 * kick) * (1 - 0.6 * glide);
    c.amp = 0.5 * (1 + 0.6 * kick) * (1 - 0.75 * glide);
    const thrust = 1 + 0.14 * Math.sin(c.fp) * (c.amp / 0.5);   // Schub beim Abschlag
    c.v += (c.cruise * thrust * (1 + 2.2 * kick + 1.4 * glide + fast) - c.v) * Math.min(1, dt * (kick > 0.01 ? 1.8 : 0.45));
    c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
  },
  // Antippen: ein kräftiger Schlag, danach gleitet er davon (weg von der getippten Seite)
  tap(c, oc, x, y) {
    if (c.tt < 2) return;
    c.tt = 0; c.burst = 3;
    const side = (x - c.x) * -c.hy + (y - c.y) * c.hx >= 0 ? 1 : -1, L = c.len;
    c.fx = c.x - c.hx * L * 0.8 - c.hy * side * L * 0.5; c.fy = c.y - c.hy * L * 0.8 + c.hx * side * L * 0.5;
  },
  prep(c, oc) {
    // Flügelwelle: die Phase hinkt nach hinten nach
    const A = c.FA, D = c.FD, amp = c.amp;
    for (let i = 0; i < NA; i++) {
      const p = c.fp - KAP * (0.4 - (AA0 + i * DAA));
      A[i] = amp * Math.sin(p); D[i] = amp * KAP * Math.cos(p);
    }
    c.cb = Math.cos(c.bank); c.sb = Math.sin(c.bank);
    c.la = -0.6 * c.hx - 0.8 * c.hy;   // Licht längs (zum Licht hin), quer ist c.lx
    c.eb = 0.75 * Math.min(oc.cw, oc.ch) / c.len;   // Breite des hellen Saums
    c.inv = oc.theme.light ? 1 : 0;
    // Kopflappen als dünne Striche: je Seite zwei Stücke (rechts k = 0, 4, links k = 8, 12)
    for (let j = 0; j < 2; j++) {
      const da = LOBE[j * 4 + 2] - LOBE[j * 4], db = LOBE[j * 4 + 3] - LOBE[j * 4 + 1];
      strokeSetup(c, oc, j * 4, da, db); strokeSetup(c, oc, 8 + j * 4, da, -db);
    }
    // Schwanz: Punkte längs der Peitsche; schwingt träge und hängt in Kurven nach außen
    const n = c.tn, sw = 0.035 * Math.sin(c.t * 1.1), cv = -c.om * 0.5;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      c.ta[i] = -0.44 - u * 0.72; c.tb[i] = sw * u * Math.sin(c.t * 1.3 - u * 4) + cv * u * u * 0.6;
    }
  },
  cell(a, b, c, o) {
    const s = b < 0 ? -b : b;
    if (a > 0.66 || a < -0.6 || s > 1.16) { o.f = -0.05; return; }   // weit draußen: billig
    // Flügelschlag: aus der sichtbaren (verkürzten) Lage auf die wahre Spannweite st schließen
    let x = (a - AA0) / DAA; x = x < 0 ? 0 : x > NA - 1.001 ? NA - 1.001 : x;
    const i = x | 0, fr = x - i, Af = c.FA[i] + (c.FA[i + 1] - c.FA[i]) * fr, Ad = c.FD[i] + (c.FD[i + 1] - c.FD[i]) * fr;
    const sp = s / c.cb;
    let st = sp, u = 0;
    if (sp > S0) { u = (sp - S0) / (S - S0); const q = 2 * Af * u; st = S0 + (sp - S0) * (1 + 0.3 * q * q); }
    // Scheibe: zwischen Vorder- und Hinterkante
    let y = st / DS; y = y > NS - 1.001 ? NS - 1.001 : y;
    const j = y | 0, gr = y - j;
    const le = LE[j] + (LE[j + 1] - LE[j]) * gr, te = TE[j] + (TE[j + 1] - TE[j]) * gr;
    const fl = (le - a) * NL[j], ft = (a - te) * NT[j];
    let f = fl < ft ? fl : ft;
    if (st > S) f = Math.min(f, S - st);
    // Kopflappen: dünne Striche nach vorn
    let lg = 0;
    if (a > 0.34 && a < 0.62 && s < 0.25) {
      const sd = b < 0 ? -1 : 1;
      c.lg = 0; let g = lobe(a, b, c, 0, sd); if (g > f) { f = g; lg = c.lg; }
      c.lg = 0; g = lobe(a, b, c, 1, sd); if (g > f) { f = g; lg = c.lg; }
    }
    o.f = f;
    if (f <= 0) return;
    if (lg) { o.ch = lg; o.col = 2; o.lit = c.inv ? 0.75 : 0.62; return; }
    o.line = 1;
    // Helligkeit B (gedacht für dunkles Wasser): Grundton dunkel, Rumpf leicht gewölbt
    let B = 0.42;
    const tw = trunkW(a);
    if (s < tw) { const t = s / tw; B += 0.1 * Math.sqrt(1 - t * t); }
    // Flügel: was gerade oben ist, liegt näher am Licht und wird heller, so läuft die Welle sichtbar
    // von vorn nach hinten; dazu ein wenig Neigung gegen das Licht (oben links)
    if (sp > S0) {
      const zs = 2 * Af * u * (b < 0 ? -1 : 1) + c.sb, za = Ad * u * u * (S - S0);
      B += 0.5 * Af * Math.sqrt(u) + 0.08 * clamp(-(za * c.la + zs * c.lx), -1.2, 1.2);
    }
    B += 0.35 * c.sb * b;   // in der Kurve liegt der äußere Flügel höher
    o.col = 0;
    // Schulterflecken: helle Keile hinter der Vorderkante, von den Augen schräg nach außen
    if (st > 0.19 && st < 0.62) {
      const d = le - a, w = 0.12 * Math.sqrt(Math.max(0, 1 - ((st - 0.19) / 0.43) ** 2));
      if (d > 0.055 && d < 0.055 + w) { o.col = 1; B = 0.76 + 0.3 * (B - 0.42); }
    }
    if (f < c.eb) { o.col = 2; B = Math.max(B, 0.7); }   // heller Flügelsaum
    // auf hellem Papier heißt "dunkel" viel Tinte: Rücken dicht, Flecken und Saum licht
    o.lit = c.inv ? clamp(0.66 - 0.9 * (B - 0.42), 0.1, 1) : clamp(B, 0.08, 1);
  },
  // Peitschenschwanz als Strich (dünner als eine Zelle, Zeichen je nach Lage), Augen an den Kopfseiten
  marks(c, oc) {
    const out = c.mko, P = c.mkp, L = c.len, cw = oc.cw, ch = oc.ch, hx = c.hx, hy = c.hy;
    out.length = 0;
    let prev = -1;
    for (let i = 0; i < c.tn - 1 && out.length < P.length - 2; i++) {
      const a = c.ta[i], b = c.tb[i];
      const X = c.x + (hx * a - hy * b) * L, Y = c.y + (hy * a + hx * b) * L, q = Math.floor(X / cw), r = Math.floor(Y / ch), id = r * 4096 + q;
      if (id === prev) continue;   // je Zelle nur ein Zeichen
      prev = id;
      const da = c.ta[i + 1] - a, db = c.tb[i + 1] - b, dx = da * hx - db * hy, dy = da * hy + db * hx;
      let gl;
      if (Math.abs(dy) < Math.abs(dx) * 0.75) { gl = Y / ch - r > 0.85 ? 95 : 45; }
      else gl = TM.util.lineGlyph(dx, dy);
      const u = i / (c.tn - 1), mk = P[out.length];
      mk[0] = a; mk[1] = b; mk[2] = gl; mk[3] = 0; mk[4] = c.inv ? 0.9 - 0.3 * u : 0.75 - 0.35 * u; out.push(mk);
    }
    const e = P[out.length], e2 = P[out.length + 1];
    e[0] = 0.335; e[1] = -0.2 * c.cb; e[2] = 'o'; e[3] = 3; e[4] = 0.8; out.push(e);
    e2[0] = 0.335; e2[1] = 0.2 * c.cb; e2[2] = 'o'; e2[3] = 3; e2[4] = 0.8; out.push(e2);
    return out;
  },
};
})();
