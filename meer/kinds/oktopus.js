// Oktopus von oben: runder Mantel, Augen am Armansatz, acht Arme mit eigener Welle und eingerollten Spitzen,
// Saugnäpfe angedeutet. Kriecht/treibt langsam mit gespreizten Armen oder schießt per Rückstoß davon (Arme
// gebündelt hinter dem Mantel). Marmorierung und langsame Farbwolken (Chromatophoren).
// Antippen: stößt eine Tintenwolke aus (versteckte Art 'tinte') und schießt davon.
(function () {
const { TAU, clamp, lerp, smooth, noise1, noise2, hash2 } = TM.util;
// eigener Zufall je Tier (wiederholbar, z. B. für Probebilder)
const rnd = c => hash2(c.seed, ++c.rn);

// Strich durch eine Zelle (Normale nx, ny auf dem Bildschirm, Zellmitte liegt d davor) → Zeichen aus der
// Kantentabelle der Engine; 0 = trifft die Zelle nicht
function stroke(oc, nx, ny, d) {
  const half = 0.5 * (Math.abs(nx) * oc.cw + Math.abs(ny) * oc.ch);
  if (d <= -half || d > half) return 0;
  const NA = oc.NA; let ia = Math.round(Math.atan2(ny, nx) / TAU * NA) % NA; if (ia < 0) ia += NA;
  return oc.lut[ia * oc.ND + Math.min(oc.ND - 1, Math.floor((d / half + 1) * 0.5 * oc.ND))];
}
// weiches Maximum: Vereinigung mit Hohlkehle (Haut zwischen den Armansätzen, Hals)
const smax = (p, q, k) => { const h = Math.max(k - Math.abs(p - q), 0) / k; return (p > q ? p : q) + h * h * k * 0.25; };

const NARM = 8, NS = 10, NP = NS + 1;          // Arme, Abschnitte je Arm
const GN = 20, CAP = 40;                        // Fächergitter für die Abschnittssuche
const SA = new Uint8Array(NARM * NP); for (let m = 0; m < SA.length; m++) SA[m] = (m / NP) | 0;   // Arm je Abschnitt
// Armwinkel von hinten gemessen (rad), vorn → hinten; gespreizt beim Kriechen, gebündelt beim Rückstoß
const SPREAD = [1.95, 1.42, 0.9, 0.35], BUNDLE = [0.3, 0.2, 0.12, 0.05], ALEN = [0.42, 0.48, 0.5, 0.46];
const F32 = () => new Float32Array(NARM * NP);

// Farbe je Stelle: Grundton wandert zwischen Terrakotta und Koralle, dunkle Flecken, blass beim Rückstoß
function tone(G, x, y, t) {
  const iL = G.iL, n = noise2(x * iL * 9 + G.px0 + t * 0.06, y * iL * 9 + G.py0);
  if (G.blush > 0.4 && n > 0.35) return 1;
  if (G.j > 0.6) return n > 0.62 ? 0 : 2;
  if (n > 0.64 - 0.06 * Math.sin(t * 0.4 + x * iL * 6)) return 1;
  return noise2(x * iL * 2.5 + t * 0.06, y * iL * 2.5 + G.py0) > 0.35 + 0.3 * G.hue ? 0 : 4;
}

TM.kinds.oktopus = {
  label: 'Oktopus', count: 1, len: [150, 210], speed: [6, 10], depth: [0.55, 0.85], rigid: true, solid: true,
  tapTip: 'Tintenwolke, dann Rückstoß',   // Hinweis beim Antippen (Vorschauseite)
  ext: 0.62, wext: 0.6, space: 0.45, every: 2, rim: 0.5, ramp: '.:-+ooOO0', gamma: 1.15,   // runde Zeichen für die Haut, auch in der Tiefe
  //        Terrakotta Dunkel     Hell       Auge       Koralle
  colors: ['#ee8664', '#b85a42', '#f7c4a8', '#f0d08a', '#f59a70'],
  light: ['#a4442c', '#6e271b', '#c0735a', '#8c6418', '#b85a35'],
  init(c, R) {
    c.j = 0; c.flee = 0; c.fleeT = 1; c.power = 1; c.ink = 0; c.base = c.th; c.pp = 0; c.squeeze = 0;
    c.nextJet = 18 + R() * 25; c.blush = 0; c.rn = 0;
    // alles, was cell je Zelle liest, in einem Objekt fester Form (das Tier-Objekt selbst hat viele Felder
    // und wird dadurch langsam im Zugriff)
    c.G = {
      L: 1, iL: 1, j: 0, blush: 0, hue: 0, px0: R() * 50, py0: R() * 50, cs: 1, sn: 0,
      mcx: 0, mra: 1, mrb: 1, hcx: 0, hr: 1, ex: 0, ey: 0, er: 1, er2: 1, kb: 1, ke: 1, ka: 1, kw: 1, wr: 1, wr2: 1,
      x0: 0, x1: 0, y0: 0, y1: 0, mg: 1, bx0: 0, bx1: 0, by: 0, gx: 1, gy: 1,
      AX: F32(), AY: F32(), AW: F32(), SX: F32(), SY: F32(), DX: F32(), DY: F32(), IL: F32(), W0: F32(), DW: F32(),
      AL: new Float32Array(NARM), al: new Float32Array(NARM), bin: new Int16Array(GN * GN * CAP), bn: new Uint8Array(GN * GN),
    };
    for (let i = 0; i < NARM; i++) c.G.al[i] = 0.88 + 0.24 * R();   // Armlängen etwas verschieden
    if (TM.Q && TM.Q.get('jet') === '1') c.j = 1;                  // Testzustand
  },
  update(c, dt, oc) {
    const L = c.len;
    c.wt += dt * 0.03;
    // Rückstoß: ausgelöst durch Antippen (flee) oder ab und zu von selbst, dann etwas sanfter
    c.nextJet -= dt;
    if (c.nextJet < 0 && c.flee <= 0) {   // eigener Sprung: grob zur Bildmitte hin, damit er nicht hinausschießt
      c.flee = c.fleeT = 1.8 + rnd(c) * 0.8; c.power = 0.6; c.nextJet = 25 + rnd(c) * 30;
      c.base = Math.atan2(oc.H / 2 - c.y, oc.W / 2 - c.x) + (rnd(c) - 0.5) * 2 - (noise1(c.seed * 0.13 + c.wt) - 0.5) * 4;
    }
    if (c.flee > 0) c.flee -= dt;
    const jet = c.flee > 0, fresh = jet && c.fleeT - c.flee < 0.45;   // gerade erschrocken: rasch herumdrehen
    c.j += ((jet ? 1 : 0) - c.j) * Math.min(1, dt * (jet ? 6 : 0.9));
    // Zielrichtung: langsam schweifen, vom Rand weg
    const wa = c.base + (noise1(c.seed * 0.13 + c.wt) - 0.5) * 4;
    let sx = Math.cos(wa), sy = Math.sin(wa), ex = 0, ey = 0;
    const pad = Math.min(160, oc.W * 0.14) + L * 0.45;
    if (c.x < pad) ex = (pad - c.x) / pad; else if (c.x > oc.W - pad) ex = -(c.x - oc.W + pad) / pad;
    if (c.y < pad) ey = (pad - c.y) / pad; else if (c.y > oc.H - pad) ey = -(c.y - oc.H + pad) / pad;
    sx += ex * 3.5; sy += ey * 3.5;
    if (!jet) { const cr = TM.crowd(c, oc); sx += cr.x * 1.5; sy += cr.y * 1.5; }   // beim Kriechen anderen Platz lassen
    let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
    const tr = fresh ? 5 : jet ? 1.2 : 0.25 + 0.5 * Math.min(1, Math.abs(ex) + Math.abs(ey));   // am Rand entschlossener wenden
    c.om += (clamp(da * (fresh ? 7 : 1.2), -tr, tr) - c.om) * Math.min(1, dt * (fresh ? 10 : 2));
    c.th += c.om * dt;
    // Mantel: beim Kriechen ruhiges Atmen, beim Rückstoß kräftige Stöße (zusammenziehen = Schub)
    c.pp += dt * (jet ? 2.2 : 0.33);
    const p = c.pp % 1, pulse = jet ? (p < 0.35 ? Math.sin(p / 0.35 * Math.PI) : 0) : 0;
    c.squeeze = jet ? pulse : 0.5 + 0.5 * Math.sin(c.pp * TAU);
    c.v += (pulse * 4.4 * L * c.power - (c.v - c.cruise * (1 - c.j)) * (jet ? 1.6 : 0.9)) * dt;
    c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
    c.blush = Math.max(0, c.blush - dt * 0.8);
  },
  // je Bild: Mantel, Kopf und die acht Arme als Polylinien (Körperkoordinaten in px, x längs, y quer)
  prep(c, oc) {
    const G = c.G, L = c.len, j = c.j, t = oc.t, sq = c.squeeze;
    G.L = L; G.iL = 1 / L; G.j = j; G.blush = c.blush; G.cs = Math.cos(c.th); G.sn = Math.sin(c.th);
    G.hue = noise1(c.seed * 0.01 + t * 0.05);
    // Mantel: Ei, zum hinteren Ende (vorn in Fahrtrichtung) etwas breiter; atmet, stößt beim Rückstoß
    G.mcx = L * lerp(0.2, 0.21, j); G.mra = L * lerp(0.16, 0.165, j);
    G.mrb = L * lerp(0.14, 0.105, j) * (1 - (j > 0.5 ? 0.17 : 0.045) * sq);
    G.hcx = 0; G.hr = L * lerp(0.066, 0.052, j);
    G.ex = G.hcx + L * 0.02; G.ey = G.hr * 1.05; G.er = L * 0.024; G.er2 = 16 * G.er * G.er;
    G.kb = L * 0.024; G.ke = L * 0.015; G.ka = L * 0.03;   // Rundungen der weichen Übergänge (Hals, Augen, Arme)
    G.kw = L * 0.045 * (1 - 0.7 * j); G.wr = L * 0.24; G.wr2 = G.wr * G.wr;   // Haut zwischen den Armansätzen
    const AX = G.AX, AY = G.AY, AW = G.AW;
    let x0 = G.mcx - G.mra, x1 = G.mcx + G.mra, y0 = -G.mrb * 1.15, y1 = G.mrb * 1.15, wmax = 0;
    for (let i = 0; i < NARM; i++) {
      const side = i < 4 ? -1 : 1, n = i & 3, ph = c.seed + i * 1.7;
      const psi = lerp(SPREAD[n], BUNDLE[n], j) + (1 - j) * 0.12 * Math.sin(t * 0.23 + ph);
      let phi = Math.PI - side * psi - c.om * 0.5;   // beim Drehen schleppen die Arme nach
      const La = G.AL[i] = L * ALEN[n] * G.al[i] * lerp(1, 1.05, j), ds = La / NS, w0 = L * 0.04 * lerp(1, 0.7, j);
      // Krümmung je Arm: langsamer Grundbogen, wandernde Welle, Spitze rollt sich ein (mal mehr, mal weniger)
      const k0 = (1 - j) * 0.8 * Math.sin(t * 0.17 + ph * 1.3);
      const curl = (1 - 0.8 * j) * (i & 1 ? side : -side) * (7 + 4 * Math.sin(t * 0.13 + i * 2.1 + c.seed * 0.7));
      let x = G.hcx + Math.cos(phi) * G.hr * 0.45, y = Math.sin(phi) * G.hr * 0.45;
      for (let k = 0; k < NP; k++) {
        const u = k / NS, m = i * NP + k;
        // breiter, weich in die Haut übergehender Ansatz, spitz erst am Ende
        AX[m] = x; AY[m] = y; AW[m] = w0 * (1 - 0.82 * Math.pow(u, 1.15)) + (u < 0.2 ? L * 0.02 * (1 - u / 0.2) * (1 - u / 0.2) * (1 - j) : 0);
        const kap = k0 + (1 - j) * 3.2 * Math.sin(TAU * 0.9 * u - t * 0.7 + ph) + curl * smooth(0.55, 1, u) + j * 1.4 * Math.sin(TAU * 1.4 * u - t * 9 + i);
        phi += kap / NS;
        x += Math.cos(phi) * ds; y += Math.sin(phi) * ds;
        if (AX[m] < x0) x0 = AX[m]; if (AX[m] > x1) x1 = AX[m]; if (AY[m] < y0) y0 = AY[m]; if (AY[m] > y1) y1 = AY[m];
      }
      if (w0 > wmax) wmax = w0;
    }
    // Rand für richtige Feldwerte, soweit die Engine sie für die Umrisszeichen braucht (Nachbarn der Randzellen)
    const mg = 1.6 * Math.max(oc.cw, oc.ch), e0 = mg + wmax + L * 0.03;
    G.x0 = x0 - e0; G.x1 = x1 + e0; G.y0 = y0 - e0; G.y1 = y1 + e0; G.mg = mg;
    G.bx0 = G.hcx - G.hr - mg; G.bx1 = G.mcx + G.mra + mg; G.by = Math.max(G.mrb * 1.12, G.ey + G.er) + mg;
    // Abschnitte vorrechnen; Fächer: jeder Abschnitt in die Fächer, deren Mitte ihm nahe genug kommt
    const gx = G.gx = GN / (G.x1 - G.x0), gy = G.gy = GN / (G.y1 - G.y0), hb = 0.5 * Math.hypot(1 / gx, 1 / gy);
    const SX = G.SX, SY = G.SY, DX = G.DX, DY = G.DY, IL = G.IL, W0 = G.W0, DW = G.DW, bn = G.bn, bin = G.bin;
    bn.fill(0);
    for (let i = 0; i < NARM; i++) for (let k = 0; k < NS; k++) {
      const m = i * NP + k, e = Math.max(AW[m], AW[m + 1]) + mg, ax = AX[m], ay = AY[m];
      const dx = DX[m] = AX[m + 1] - ax, dy = DY[m] = AY[m + 1] - ay; SX[m] = ax; SY[m] = ay;
      const ll = dx * dx + dy * dy, il = IL[m] = ll > 1e-6 ? 1 / ll : 0; W0[m] = AW[m]; DW[m] = AW[m + 1] - AW[m];
      const qa = Math.max(0, ((Math.min(ax, AX[m + 1]) - e - G.x0) * gx) | 0), qb = Math.min(GN - 1, ((Math.max(ax, AX[m + 1]) + e - G.x0) * gx) | 0);
      const ra = Math.max(0, ((Math.min(ay, AY[m + 1]) - e - G.y0) * gy) | 0), rb = Math.min(GN - 1, ((Math.max(ay, AY[m + 1]) + e - G.y0) * gy) | 0);
      const lim = (e + hb) * (e + hb);
      for (let r = ra; r <= rb; r++) for (let q = qa; q <= qb; q++) {
        const px = G.x0 + (q + 0.5) / gx - ax, py = G.y0 + (r + 0.5) / gy - ay;
        let t = (px * dx + py * dy) * il; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ux = px - dx * t, uy = py - dy * t;
        if (ux * ux + uy * uy > lim) continue;
        const g = r * GN + q; if (bn[g] < CAP) bin[g * CAP + bn[g]++] = m;
      }
    }
  },
  cell(a, b, c, o, oc) {
    const G = c.G, L = G.L, x = a * L, y = b * L;
    if (x < G.x0 || x > G.x1 || y < G.y0 || y > G.y1) { o.f = -G.mg; return; }
    // Mantel (Ei), Kopf (Kreis) mit Augenbuckeln, nur in ihrer Nähe gerechnet
    const hx = x - G.hcx, hd2 = hx * hx + y * y;
    let fb = -G.mg, fm = -1, fh = -1;
    if (x > G.bx0 && x < G.bx1 && y > -G.by && y < G.by) {
      const mx = (x - G.mcx) / G.mra, rb = G.mrb * (1 + 0.12 * clamp(mx, -1, 1)), my = y / rb;
      fm = (1 - Math.sqrt(mx * mx + my * my)) * rb; fh = G.hr - Math.sqrt(hd2);
      fb = smax(fm, fh, G.kb);
      const ex = x - G.ex, ey = Math.abs(y) - G.ey, e2 = ex * ex + ey * ey;
      if (e2 < G.er2) fb = smax(fb, G.er - Math.sqrt(e2), G.ke);
    }
    // Arme: Abschnitte aus dem Fach; je Arm das Beste, die zwei besten Arme weich vereint (Haut am Ansatz)
    let fa = -1e9, bm = -1, bt = 0, bd = 0, bw = 0, bnx = 0, bny = 0, f1 = -1e9, f2 = -1e9, ca = -1, cf = -1e9;
    const q = ((x - G.x0) * G.gx) | 0, r = ((y - G.y0) * G.gy) | 0;
    if (q >= 0 && q < GN && r >= 0 && r < GN) {
      const g = r * GN + q, B = G.bin, SX = G.SX, SY = G.SY, DX = G.DX, DY = G.DY, IL = G.IL, W0 = G.W0, DW = G.DW;
      for (let s = g * CAP, se = s + G.bn[g]; s < se; s++) {
        const m = B[s], ai = SA[m];
        if (ai !== ca) { if (cf > f1) { f2 = f1; f1 = cf; } else if (cf > f2) f2 = cf; ca = ai; cf = -1e9; }
        const px = x - SX[m], py = y - SY[m], dx = DX[m], dy = DY[m];
        let t = (px * dx + py * dy) * IL[m]; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - dx * t, qy = py - dy * t, d2 = qx * qx + qy * qy, w = W0[m] + DW[m] * t, lim = w - cf;
        if (lim <= 0 || d2 >= lim * lim) continue;   // kann das Beste dieses Arms nicht schlagen: keine Wurzel nötig
        const d = Math.sqrt(d2), fs = w - d;
        cf = fs;
        if (fs > fa) { fa = fs; bm = m; bt = t; bd = d; bw = w; bnx = qx; bny = qy; }
      }
      if (cf > f1) { f2 = f1; f1 = cf; } else if (cf > f2) f2 = cf;
      if (hd2 < G.wr2 && f2 > -1e8) { const kw = G.kw * smooth(G.wr, L * 0.08, Math.sqrt(hd2)); if (kw > 0.5) fa = smax(f1, f2, kw); }
    }
    const f = smax(fb, fa, G.ka);
    o.f = f;
    if (fa > fb && bm >= 0) {
      const i = SA[bm], u = ((bm - i * NP) + bt) / NS;
      // Bildschirm-Normale des Arms an dieser Stelle (vom Arm zur Zelle)
      const dl = bd || 1e-3, nxb = bnx / dl, nyb = bny / dl;
      const nx = nxb * G.cs - nyb * G.sn, ny = nxb * G.sn + nyb * G.cs;
      const hn = 0.5 * (Math.abs(nx) * oc.cw + Math.abs(ny) * oc.ch), thin = bw < 0.7 * hn;
      if (f <= 0 && !(thin && bd <= hn)) return;   // außen: nur das Feld zählt
      // Saugnäpfe: auf der Mittellinie in festem Abstand (etwa alle 2,5 Zellen längs des Arms) ein kleiner Ring
      const along = Math.abs(ny) * oc.cw + Math.abs(nx) * oc.ch;
      const suck = !thin && G.j < 0.6 && u > 0.1 && u < 0.7 && bd < bw * 0.5 && ((u * G.AL[i] / (2.5 * along) + i * 0.37) % 1) < 0.3;
      o.col = suck ? 2 : tone(G, x, y, oc.t);
      if (thin) {   // dünn: als Strich zeichnen (sonst zerfiele er zwischen den Zellmitten)
        const g = stroke(oc, nx, ny, bd) || stroke(oc, nx, ny, bd * 0.5);   // diese Zelle trägt den Durchgang: lieber Strich als Lücke
        if (g) { o.f = Math.max(f, 0.5); o.ch = suck ? 111 : g; o.lit = 0.85 - 0.3 * u; }
        else o.f = Math.min(f, -0.5);
        return;
      }
      // Armansatz und Haut rund schattiert wie der Körper, nach außen hin heller und leichter
      o.line = 1;
      o.lit = suck ? 0.6 : TM.shade(clamp((y > 0 ? bd : -bd) / Math.max(bw, 1), -1, 1), c) * 0.65 * (1 - smooth(0.05, 0.45, u)) + 0.12;
      if (suck) o.ch = 111;
      return;
    }
    if (f <= 0) return;
    o.line = 1;
    // Körper: Rundung quer, Marmorierung
    const side = fm > fh ? y / Math.max(G.mrb, 1) : y / Math.max(G.hr, 1);
    o.lit = TM.shade(clamp(side, -1, 1), c) * (0.82 + 0.12 * clamp((x - G.mcx) / G.mra, -1, 1)) + 0.1 * (noise2(x * 0.18 + G.px0, y * 0.18 + oc.t * 0.05) - 0.5);
    o.col = tone(G, x, y, oc.t);
  },
  marks(c) {
    const G = c.G, a = G.ex / G.L, b = G.ey / G.L;
    c.mk2 = c.mk2 || [[0, 0, 'θ', 3, 1], [0, 0, 'θ', 3, 1]];
    c.mk2[0][0] = c.mk2[1][0] = a; c.mk2[0][1] = -b; c.mk2[1][1] = b;
    return c.mk2;
  },
  tap(c, oc, x, y) {
    const L = c.len;
    // Tinte aus dem Trichter (am Kopf, nach hinten ausgestoßen), dann weg vom Finger
    if (c.ink <= oc.t) {
      const back = c.th + Math.PI, dep = Math.max(0.05, c.depth - 0.04), want = L * 1.25;
      oc.add('tinte', { x: c.x, y: c.y, th: back, depth: dep, len: want / (oc.scale * (1 - 0.2 * dep)) });
      c.ink = oc.t + 1.5;
    }
    const dx = c.x - x, dy = c.y - y, dd = Math.hypot(dx, dy);
    const away = dd > L * 0.05 ? Math.atan2(dy, dx) : c.th;
    c.base = away - (noise1(c.seed * 0.13 + c.wt) - 0.5) * 4;
    c.flee = c.fleeT = 3.2; c.power = 1; c.blush = 1; c.pp = Math.floor(c.pp) + 0.97;
  },
};

// Tintenwolke: erst ein dichter Klecks hinter dem Oktopus, dann quellen Schwaden auf; sie wird lichter,
// franst aus und zerfällt (~5 s). Deckt zu, was darunter liegt. th = Ausstoßrichtung.
// Dichte als Summe weicher Bällchen (Metaballs): wo mehrere überlappen, wird es dunkler; schwinden die
// Gewichte, zerfällt die Wolke von selbst in Fetzen
const PUFFS = 9;
TM.kinds.tinte = {
  label: 'Tinte', hidden: true, rigid: true, count: 0, len: [220, 220], speed: [0, 0], depth: [0.6, 0.6],
  ext: 0.56, wext: 0.56, rim: 0.55, gamma: 0.9, ramp: '.:~+*%&@',
  //        Kern       Saum
  colors: ['#4e3c80', '#9a87d6'],
  light: ['#1c1628', '#463a62'],
  init(c, R) {
    c.age = 0; c.life = 5.2; c.v = 24 * c.len / 220;
    c.P = new Float32Array(PUFFS * 7); c.Q = new Float32Array(PUFFS * 4);
    for (let p = 0; p < PUFFS; p++) {
      const s = p / (PUFFS - 1), o = p * 7, an = (R() - 0.5) * 3.4, sp = 0.1 + R() * 0.2;
      c.P[o] = s * 0.22; c.P[o + 1] = (R() - 0.5) * 0.04;                                 // Strahl
      c.P[o + 2] = Math.cos(an) * sp * 0.7 + s * 0.08; c.P[o + 3] = Math.sin(an) * sp;   // Ausbreitung
      c.P[o + 4] = 0.035 + 0.02 * R(); c.P[o + 5] = 0.05 + R() * 0.07;                    // Radius: Start, Zuwachs
      c.P[o + 6] = 0.75 + 0.5 * R();                                                     // Gewicht
    }
  },
  update(c, dt, oc) {
    c.age += dt;
    c.v *= Math.exp(-dt * 0.9);
    c.x += (Math.cos(c.th) * c.v + 2.5 * oc.scale) * dt; c.y += (Math.sin(c.th) * c.v + 0.8 * oc.scale) * dt;   // treibt mit
    if (c.age > c.life) oc.remove(c);
  },
  prep(c) {
    const g = 1 - Math.exp(-c.age * 1.4), gr = 1 - Math.exp(-c.age * 0.8);
    // Gewicht: kurz anschwellen, dann verdünnen; am Ende unter die Schwelle
    const w = smooth(0, 0.25, c.age) * (1 - 0.45 * smooth(0.6, 3, c.age)) * (1 - smooth(2.8, c.life - 0.2, c.age));
    for (let p = 0; p < PUFFS; p++) {
      const o = p * 7, q = p * 4, r = c.P[o + 4] + c.P[o + 5] * gr;
      c.Q[q] = c.P[o] + c.P[o + 2] * g; c.Q[q + 1] = c.P[o + 1] + c.P[o + 3] * g;
      c.Q[q + 2] = 1 / (r * r); c.Q[q + 3] = c.P[o + 6] * w;
    }
  },
  cell(a, b, c, o) {
    let D = 0;
    for (let p = 0; p < PUFFS; p++) {
      const q = p * 4, dx = a - c.Q[q], dy = b - c.Q[q + 1], e = (dx * dx + dy * dy) * c.Q[q + 2];
      if (e < 9) D += c.Q[q + 3] * Math.exp(-e);
    }
    if (D < 0.08) { o.f = -0.05; return; }
    // Schlieren und ausgefranster Rand (wandern langsam)
    const nz = noise2(a * 9 + c.age * 0.5, b * 9 - c.age * 0.3), sw = noise2(a * 5 - c.age * 0.3, b * 5 + c.age * 0.2 + 7);
    D *= 0.8 + 0.4 * nz;
    o.f = (D - 0.5) * 0.12; o.line = 1;
    o.lit = clamp((D - 0.5) * 0.9, 0, 1) * (0.7 + 0.45 * sw) + 0.12;
    o.col = D < 0.62 ? 1 : 0;
  },
};
})();
