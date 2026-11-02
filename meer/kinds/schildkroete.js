// Meeresschildkröte von oben: gewölbter Panzer mit Hornplatten (Wirbel-, Rippen-, Randplatten), Kopf mit Augen,
// große Vorderflossen im langsamen, gleichzeitigen Flugschlag, kleine Hinterflossen zum Steuern.
// Taucht ab und zu auf (größer, längerer Schatten), holt Luft und sinkt wieder.
// Antippen: Kopf einziehen, still treiben, dann kräftig davonrudern.
(function () {
const { TAU, clamp, lerp, smooth, rng, lineGlyph } = TM.util;

// Panzer (Körperlängen): halbe Länge vorn SF / hinten SR, halbe Breite SB, Eiform EGG, Breite der Randplatten RIM;
// 25 Randplatten ringsum (Nackenplatte vorn, Naht hinten in der Mitte)
const SF = 0.3, SR = 0.32, SB = 0.235, EGG = 0.08, RIM = 0.042, DM = TAU / 25;
// Hornplatten: Wirbelreihe (halbe Breite WV, leicht sechseckig gewellt, Plattenlänge VP) mit Quernähten VA;
// Rippennähte setzen an den Seitenecken der Wirbelplatten an (CA) und laufen schräg nach hinten (Normalen CN)
const WV = 0.068, WAVE = 0.006, VP = 0.107, VA = [0.152, 0.045, -0.062, -0.169], CA = [0.098, -0.009, -0.116];
const CN = [[0.99, 0.15], [0.96, 0.29], [0.9, 0.44]];
// Kopf: Mitte, halbe Länge vorn/hinten, halbe Breite; Hals
const HC = 0.39, HF = 0.095, HR = 0.09, HW = 0.07, NW = 0.05;
// Vorderflosse: Wurzel, Länge, Breite Vorder-/Hinterkante, Grundkrümmung; Winkel von vorn: Ausholen, Ende, Gleiten
const FA = 0.15, FB = 0.15, FL = 0.37, FWL = 0.05, FWT = 0.11, FK = 0.9, PS0 = 1.1, PS1 = 2.6, PSG = 2.68;
// Hinterflosse
const RA = -0.215, RB = 0.125, RL = 0.16, RWL = 0.035, RWT = 0.07, RK = 0.4, RPS = 2.55;

// je Bild in prep gesetzt (prep läuft direkt vor dem Abtasten desselben Tiers)
let L = 200, HX = 1, HY = 0, CW = 5, CH = 9, LA = 0, LB = 0, LUT = null, NA = 48, ND = 24;
let fC = 0, fS = 1, fLn = FL, fK = FK, fW = 1, hOff = 0, rCR = 0, rSR = 1, rCL = 0, rSL = 1;
// Rückgaben der Feldfunktionen (keine Objekte pro Zelle)
let eA = 0, eB = 0, eE = 0, eQa = 0, eQb = 0, bU = 0, bV = 0;

// Abstand zum Rand einer Ei-Ellipse (vorn halbe Länge af, hinten ar, halbe Breite bw), innen +.
// Für einen Kreis exakt R - r; Normale nach innen in eA, eB.
function eggF(X, Y, af, ar, bw, egg) {
  const rho = Math.sqrt(X * X + Y * Y) + 1e-7, A = X > 0 ? af : ar, B = bw * (1 + egg * X / rho);
  const qa = X / A, qb = Y / B, E = Math.sqrt(qa * qa + qb * qb) + 1e-7;
  const ga = qa / A, gb = qb / B, gm = Math.sqrt(ga * ga + gb * gb) + 1e-9;
  eA = -ga / gm; eB = -gb / gm; eE = E; eQa = qa; eQb = qb;
  return E * (1 - E) / gm;
}
// Naht im Körper (Normale na, nb als Einheitsvektor), Zellmitte liegt d px vor ihr → Zeichen, 0 = nicht in dieser Zelle.
// Meist die Randtabelle der Engine (_ - ' / je nach Lage in der Zelle, so sauber wie Umrisse); fast senkrechte
// Nähte nur nach Richtung, denn die Tabelle setzt dort nahe am Zellrand ein '-'.
function lineAt(na, nb, d) {
  const nx = na * HX - nb * HY, ny = na * HY + nb * HX;
  const half = 0.5 * ((nx < 0 ? -nx : nx) * CW + (ny < 0 ? -ny : ny) * CH);
  if (d <= -half || d > half) return 0;
  if (!LUT || (ny < 0 ? -ny : ny) < 0.42) {
    // nur die Zelle, durch deren Mitte die Naht läuft (sonst doppelte Striche)
    const h2 = 0.5 * Math.max((nx < 0 ? -nx : nx) * CW, (ny < 0 ? -ny : ny) * CH);
    return d > -h2 && d <= h2 ? lineGlyph(-ny, nx) : 0;
  }
  let ia = Math.round(Math.atan2(ny, nx) / TAU * NA) % NA; if (ia < 0) ia += NA;
  return LUT[ia * ND + Math.min(ND - 1, Math.floor((d / half + 1) * 0.5 * ND))];
}
// Flosse als gebogenes Blatt: Punkt relativ zur Wurzel (pa, pb), Richtung (cs, sn), Länge ln,
// halbe Breite an Vorder-/Hinterkante wl/wt, Krümmung k (+ = Spitze nach hinten). bU, bV = Lage im Blatt
function blade(pa, pb, cs, sn, ln, wl, wt, k) {
  const u = pa * cs + pb * sn;
  if (u < -0.1 || u > ln + 0.1) return -0.1;   // weit vor der Wurzel oder hinter der Spitze
  const v = pb * cs - pa * sn, w0 = v - k * u * u;
  if (w0 < -wl - 0.1 || w0 > wt * 0.82 + 0.1) return -0.1;   // weit neben dem Blatt
  // Paddel: lange fast gleich breit, dann spitz; Vorderkante dick und rund, Hinterkante bauchig
  const s = u < 0 ? 0 : u > ln ? 1 : u / ln, r = 1 - s;
  const hl = wl * Math.sqrt(1 - s * s), ht = wt * Math.sqrt(r) * (0.62 + 1.4 * s) * (1 - 0.3 * s);
  const hw = (hl + ht) * 0.5, dv = w0 - (ht - hl) * 0.5;
  bU = s; bV = dv / (hw + 1e-4);
  let f = hw - (dv < 0 ? -dv : dv);
  const tip = (ln - u) * 0.9; if (tip < f) f = tip;
  const root = u + 0.04; if (root < f) f = root;
  return f;
}
// an der Oberfläche: Atemzug als Ring vor dem Kopf
function breath(c, oc) { oc.ripple(c.x + c.hx * c.len * 0.47, c.y + c.hy * c.len * 0.47, 0.6); }

// Panzer innen. Platten mit festem Füllzeichen (ruhige Fläche, Wölbung nur über die Farbstufe), die Wirbelreihe
// heller und bernsteinfarben; Nähte als dunkle Linien. Randplatten: gepunktetes Band mit kurzen Quernähten (eine
// zweite Randlinie wäre bei dieser Größe nur ein doppelter Umriss).
function shell(a, b, fs, o, qa, qb, sE) {
  const dome = 0.7 + 0.4 * (0.3 + 0.42 * Math.sqrt(Math.max(0, 1 - sE * sE)) + 0.2 * (LA * qa + LB * qb));
  o.line = 1; o.col = 2; o.lit = 0.95;
  let g;
  if (fs < RIM) {
    const t = Math.atan2(qb, qa), dt = t - (Math.round(t / DM - 0.5) + 0.5) * DM;
    const A = qa > 0 ? SF : SR, ta = -A * Math.sin(t), tb = SB * Math.cos(t), tl = Math.sqrt(ta * ta + tb * tb);
    g = lineAt(ta / tl, tb / tl, dt * tl * L);
    if (g) { o.ch = g; o.lit = 0.8; return; }
    o.ch = 58; o.col = 5; o.lit = 0.42 * dome; return;
  }
  // Wirbelreihe: Abstand zur gewellten Längsgrenze
  const bb = b < 0 ? -b : b, sg = b < 0 ? -1 : 1;
  const ph = (a - CA[0]) * (TAU / VP), wv = WV + WAVE * Math.cos(ph), dw = -WAVE * TAU / VP * Math.sin(ph);
  const nl = Math.sqrt(1 + dw * dw), dV = (wv - bb) / nl;
  g = lineAt(dw / nl, -sg / nl, dV * L);
  if (g) { o.ch = g; return; }
  let s;
  if (dV > 0) {
    let d = 1;
    for (let k = 0; k < 4; k++) { const e = a - VA[k]; if ((e < 0 ? -e : e) < (d < 0 ? -d : d)) d = e; }
    g = lineAt(1, 0, d * L); s = Math.min(d < 0 ? -d : d, dV);
  } else {
    let d = 1, kk = 0;
    for (let k = 0; k < 3; k++) {
      const e = (a - CA[k]) * CN[k][0] + (bb - WV) * CN[k][1];
      if ((e < 0 ? -e : e) < (d < 0 ? -d : d)) { d = e; kk = k; }
    }
    g = lineAt(CN[kk][0], CN[kk][1] * sg, d * L); s = Math.min(d < 0 ? -d : d, -dV);
  }
  if (g) { o.ch = g; return; }
  const k = smooth(0, 0.035, s);
  if (dV > 0) { o.ch = k > 0.5 ? 79 : 111; o.col = 1; o.lit = (0.55 + 0.4 * k) * dome; }
  else { o.ch = 111; o.col = 0; o.lit = (0.45 + 0.25 * k) * dome; }
}

TM.kinds.schildkroete = {
  label: 'Meeresschildkröte', count: 1, len: [170, 230], speed: [11, 16], turn: 0.22, wander: 0.05, dash: 1.4,
  tapTip: 'zieht den Kopf ein, rudert dann davon',   // Hinweis beim Antippen (Vorschauseite)
  depth: [0.2, 0.5], eats: true, rigid: true, solid: true, ext: 0.5, wext: 0.57, rim: 0.85, space: 0.42, every: 2, slowV: 20, margin: 90,
  //        Panzer oliv  Bernstein  Nähte      Haut       Augen      Panzerrand
  colors: ['#94804f', '#c99a4b', '#5a4930', '#8f9c86', '#3b423c', '#cdbb8a'],
  light: ['#6e5b2d', '#a26a1a', '#2f2415', '#566451', '#161a17', '#4d3f22'],
  init(c, R) {
    c.var = c.var || 'gruen';
    c.rnd = rng(c.seed + 11);
    c.len0 = c.len / (1 - 0.2 * c.depth);   // Größe ohne Tiefe (Tiefe ändert sich beim Auftauchen)
    c.home = c.depth; c.ds = 0; c.dz = 20 + R() * 40; c.dv = 0; c.sd = c.depth;
    c.cr0 = c.cruise; c.nst = 2 + ((R() * 3) | 0); c.gt = 0; c.gl = 0; c.hin = 0; c.shy = 0;
    c.mkE = [[0, 0, '@', 4, 1], [0, 0, '@', 4, 1]]; c.mk0 = [];
    const Q = TM.Q;   // Testzustände für Probebilder
    if (Q && Q.get('glide') === '1') c.gl = 1;
    if (Q && Q.get('headin') === '1') c.hin = 1;
  },
  update(c, dt, oc) {
    const rnd = c.rnd;
    // Auftauchen: alle 30–70 s langsam zur Oberfläche, kurz Luft holen, wieder hinab
    c.dz -= dt;
    let tgt = c.home;
    if (c.ds === 0) { if (c.dz <= 0) c.ds = 1; }
    if (c.ds === 1) { tgt = 0.04; if (c.depth < 0.065) { c.ds = 2; c.dz = 4 + rnd() * 3; breath(c, oc); } }
    else if (c.ds === 2) { tgt = 0.04; if (c.dz <= 0) c.ds = 3; }
    else if (c.ds === 3 && Math.abs(c.depth - c.home) < 0.01) { c.ds = 0; c.dz = 30 + rnd() * 40; }
    const vd = clamp((tgt - c.depth) * 0.3, -0.03, 0.03);
    c.dv += (vd - c.dv) * Math.min(1, dt * 0.7);
    c.depth = clamp(c.depth + c.dv * dt, 0.03, 0.6);
    // oben deutlich größer als die Tiefe allein ergäbe: sie kommt dem Betrachter entgegen
    c.len = c.len0 * (1 - 0.2 * c.depth) * (1 + 0.12 * clamp((c.home - c.depth) / Math.max(0.05, c.home - 0.04), 0, 1));
    if (Math.abs(c.depth - c.sd) > 0.004) { c.sd = c.depth; oc.resort(); }

    // Flossenschlag: ein paar Schläge, dann mit angelegten Flossen gleiten
    const sp0 = ((c.ph / TAU) % 1 + 1) % 1;
    let rate = 0;
    if (c.shy > 0) {
      // erschrocken: Kopf rein, Flossen still, treibt aus
      c.shy -= dt; c.hin += (1 - c.hin) * Math.min(1, dt * 10);
      c.v *= Math.exp(-dt * 0.8); c.om *= Math.exp(-dt * 3);
      c.th += c.om * dt; c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
      if (c.shy <= 0) { c.burst = 3.2; c.nst = Math.max(c.nst, 3); c.gt = 0; }
    } else {
      c.hin += (0 - c.hin) * Math.min(1, dt * 2.2);
      if (c.gt > 0) { c.gt -= dt; if (c.gt <= 0) c.nst = 2 + ((rnd() * 3) | 0); }
      const flee = c.burst > 0, power = sp0 < 0.6;
      c.cruise = c.cr0 * (c.gt > 0 ? 0.6 : power ? 1.15 : 0.85) * (c.ds === 2 ? 0.6 : 1);
      const ph = c.ph; TM.swim(c, dt, oc); c.ph = ph;
      if (c.burst <= 0) c.v = Math.min(c.v, c.cr0 * 1.3);   // auch zum Futter nur gemächlich
      if (c.gt <= 0) rate = (flee ? 0.62 : 0.3) * (0.8 + 0.25 * c.v / Math.max(1, c.cr0));
    }
    c.gl += ((c.gt > 0 ? 1 : 0) - c.gl) * Math.min(1, dt * 1.5);
    c.ph += dt * TAU * rate;
    const sp1 = ((c.ph / TAU) % 1 + 1) % 1;
    if (sp0 < 0.6 && sp1 >= 0.6 && c.burst <= 0 && --c.nst <= 0) {
      // Ende des Schlags: gleiten (an der Oberfläche länger)
      c.gt = (2 + rnd() * 3) * (c.ds === 2 ? 1.6 : 1); c.ph = (Math.floor(c.ph / TAU) + 0.6) * TAU;
    }
  },
  tap(c, oc, x, y) {
    c.shy = 1.6; c.fx = x; c.fy = y; c.burst = 0; c.gt = 0;
  },
  prep(c, oc) {
    L = c.len; HX = c.hx; HY = c.hy; CW = oc.cw; CH = oc.ch; LUT = oc.lut || null; NA = oc.NA; ND = oc.ND;
    LB = c.lx; LA = -0.6 * c.hx - 0.8 * c.hy;
    // Schlagphase → Winkel, Biegung (Spitze hängt nach), Verkürzung von oben gesehen, Breite (Anstellwinkel)
    const sp = ((c.ph / TAU) % 1 + 1) % 1, P = 0.6;
    let psi, k, ln, w;
    if (sp < P) {
      const u = sp / P, e = 0.5 - 0.5 * Math.cos(Math.PI * u), s = Math.sin(Math.PI * u);
      psi = PS0 + (PS1 - PS0) * e; k = FK - 0.55 * s; ln = 1 - 0.13 * (1 - s); w = 1 - 0.12 * s;
    } else {
      const u = (sp - P) / (1 - P), e = 0.5 - 0.5 * Math.cos(Math.PI * u), s = Math.sin(Math.PI * u);
      psi = PS1 - (PS1 - PS0) * e; k = FK + 0.5 * s; ln = 1 - 0.13 * (1 - s); w = 1 - 0.3 * s;
    }
    const g = c.gl;
    psi = lerp(psi, PSG, g); k = lerp(k, FK, g); ln = lerp(ln, 1, g); w = lerp(w, 1, g);
    fC = Math.cos(psi); fS = Math.sin(psi); fK = k; fLn = FL * ln; fW = w;
    hOff = -0.11 * c.hin;
    // Hinterflossen: die kurveninnere spreizt ab, beide paddeln leicht mit
    const st = clamp(c.om * 1.6, -0.5, 0.5), pd = 0.08 * Math.sin(c.ph + 1.2) * (1 - g);
    rCR = Math.cos(RPS - st + pd); rSR = Math.sin(RPS - st + pd);
    rCL = Math.cos(RPS + st + pd); rSL = Math.sin(RPS + st + pd);
  },
  cell(a, b, c, o) {
    // weit weg von allen Teilen (Kreis um die größte Ausdehnung plus Rand): nichts zu tun
    if (a * a + b * b > 0.42) { o.f = -0.1; return; }
    const bb = b < 0 ? -b : b;
    let fs = -0.1, sA = 1, sB = 0, sE = 2, qa = 0, qb = 0;
    if (a > -0.4 && a < 0.37 && bb < 0.32) {
      fs = eggF(a, b, SF, SR, SB, EGG);
      if (eQa < -0.8) { const t = Math.min(-eQa, 1) - 0.8; fs += 0.4 * t * t; }   // hinten leicht spitz
      sA = eA; sB = eB; sE = eE; qa = eQa; qb = eQb;
      if (fs * L > 7) { o.f = fs; shell(a, b, fs, o, qa, qb, sE); return; }
    }
    // Teile unter und neben dem Panzer: Kopf mit Hals, Flossen, Schwanz
    let fo = -1, part = 0, pu = 0, pv = 0;
    const ha = a - HC - hOff;
    if (ha > -0.22 && ha < 0.12 && bb < 0.1) {
      let fh = eggF(ha, b, HF, HR, HW, -0.18);
      pu = eQa; pv = eQb;
      const fn = Math.min(NW - bb, ha + 0.2, -ha);
      if (fn > fh) fh = fn;
      if (fh > fo) { fo = fh; part = 1; }
    }
    let pa = a - FA, pb = bb - FB;
    { const f = blade(pa, pb, fC, fS, fLn, FWL * fW, FWT * fW, fK);
      if (f > fo) { fo = f; part = 2; pu = bU; pv = bV; } }
    pa = a - RA; pb = bb - RB;
    if (pa * pa + pb * pb < (RL + 0.06) * (RL + 0.06)) {
      const f = b >= 0 ? blade(pa, pb, rCR, rSR, RL, RWL, RWT, RK) : blade(pa, pb, rCL, rSL, RL, RWL, RWT, RK);
      if (f > fo) { fo = f; part = 3; pu = bU; pv = bV; }
    }
    if (a < -0.26 && a > -0.42) {
      const s = (-0.27 - a) / 0.11, f = Math.min(0.024 * (1 - s) - bb, a + 0.4);
      if (f > fo) { fo = f; part = 4; }
    }
    o.f = fs > fo ? fs : fo;
    // Rand des Panzers, wo Kopf oder Flossen darunter hervorkommen
    const ge = fo > 0 ? lineAt(sA, sB, fs * L) : 0;
    if (fs > 0) {
      shell(a, b, fs, o, qa, qb, sE);
      if (ge) { o.ch = ge; o.col = 5; o.lit = 1; }
      return;
    }
    if (fo <= 0) return;
    o.line = 1; o.col = 3;
    if (ge) { o.ch = ge; o.col = 5; o.lit = 1; return; }
    if (part === 1) {   // Kopf: gewölbt, Licht von oben links
      const z = Math.sqrt(Math.max(0, 1 - pu * pu - pv * pv));
      o.lit = 0.32 + 0.45 * z + 0.2 * (LA * pu + LB * pv);
    } else if (part === 4) o.lit = 0.45;
    else o.lit = 0.34 + 0.22 * (1 - pv * pv) + 0.1 * (b < 0 ? -LB : LB);
  },
  marks(c) {
    if (c.hin > 0.45) return c.mk0;
    const m = c.mkE, ea = HC - 0.11 * c.hin + 0.015;
    m[0][0] = ea; m[0][1] = -0.046; m[1][0] = ea; m[1][1] = 0.046;
    return m;
  },
};
})();
