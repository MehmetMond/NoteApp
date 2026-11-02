// Kugelfisch von oben: kurzer runder Leib mit braunen Tupfen, große Augen, schnell flatternde Brustflossen,
// kleiner Schwanz. Schwebt, flitzt kurz los, frisst Futter. Antippen: bläst sich in 0.4 s zur Stachelkugel auf,
// treibt so ~4 s langsam dahin und wird wieder schlank.
(function () {
const { TAU, clamp, lerp, rng, lineGlyph } = TM.util;

// Leib schlank → Kugel (Körperlängen): Mitte BC, halbe Länge vorn/hinten, halbe Breite, Eiform; Kugelradius R1
const BC = 0.1, AF0 = 0.34, AR0 = 0.3, BW0 = 0.25, EG0 = 0.15, R1 = 0.38;
const NS = 18;   // Stacheln rundum

// je Bild in prep gesetzt
let L = 80, HX = 1, HY = 0, CW = 5, CH = 9, LA = 0, LB = 0, P = 0, AF = AF0, AR = AR0, BW = BW0, EG = EG0;
let EA = 0.3, EB = 0.16, ER = 0.07, FA = 0.12, FB = 0.17, FCS = 0, FSN = 1, TA = -0.24, TC = 1, TS = 0;
let eE = 0, eQa = 0, eQb = 0;

// Abstand zum Rand einer Ei-Ellipse, innen + (für einen Kreis exakt R - r)
function eggF(X, Y, af, ar, bw, egg) {
  const rho = Math.sqrt(X * X + Y * Y) + 1e-7, A = X > 0 ? af : ar, B = bw * (1 + egg * X / rho);
  const qa = X / A, qb = Y / B, E = Math.sqrt(qa * qa + qb * qb) + 1e-7;
  const ga = qa / A, gb = qb / B, gm = Math.sqrt(ga * ga + gb * gb) + 1e-9;
  eE = E; eQa = qa; eQb = qb;
  return E * (1 - E) / gm;
}
// Randabstand des Leibs in Richtung (cs, sn) von der Mitte aus
function radius(cs, sn) {
  const A = cs > 0 ? AF : AR, B = BW * (1 + EG * cs);
  return 1 / Math.sqrt(cs * cs / (A * A) + sn * sn / (B * B));
}

TM.kinds.kugelfisch = {
  label: 'Kugelfisch', count: 1, len: [70, 100], speed: [6, 10], turn: 2, depth: [0.15, 0.42], eats: true,
  tapTip: 'bläst sich zur Stachelkugel auf',   // Hinweis beim Antippen (Vorschauseite)
  rigid: true, solid: true, ext: 0.55, wext: 0.52, space: 0.45,
  //        Sand       Tupfen     Flossen/Stacheln  Pupille   Iris (Akzent)
  colors: ['#d6c08a', '#86592c', '#e8dfc4', '#343e3b', '#b8b35a'],
  light: ['#a08548', '#4a3016', '#9a8f74', '#121514', '#6b6a1c'],
  init(c, R) {
    c.var = c.var || 'tupfen';
    c.rnd = rng(c.seed + 5);
    // Tupfen im schlanken Leib: a, b relativ zur Mitte, Radius (nicht auf den Augen)
    const sp = c.spots = new Float32Array(24);
    for (let k = 0, n = 0; n < 8 && k < 300; k++) {
      const u = -0.85 + R() * 1.3, v = (R() * 2 - 1) * 0.85;
      if (u * u + v * v > 0.75) continue;
      const sa = u * (u > 0 ? AF0 : AR0), sb = v * BW0, r = 0.05 + R() * 0.025;
      if ((sa - 0.2) * (sa - 0.2) + (Math.abs(sb) - 0.16) * (Math.abs(sb) - 0.16) < 0.014) continue;
      let ok = true;   // Tupfen nicht ineinander
      for (let j = 0; j < n; j++) { const da = sa - sp[j * 3], db = sb - sp[j * 3 + 1]; if (da * da + db * db < (r + sp[j * 3 + 2] + 0.03) ** 2) ok = false; }
      if (!ok) continue;
      sp[n * 3] = sa; sp[n * 3 + 1] = sb; sp[n * 3 + 2] = r; n++;
    }
    c.mode = 0; c.mt = 0.5 + R() * 1.5; c.tdir = c.th + (R() - 0.5) * 2; c.puff = 0; c.pt = -1; c.hold = 4.4; c.jig = 0; c.spin = 0;
    c.fp = R() * TAU; c.ta = 0.1; c.tk = 0; c.dvx = 0; c.dvy = 0; c.dash = 0; c.drift = 0; c.pff = 0;
    c.mkP = []; for (let i = 0; i < 2 + NS * 2; i++) c.mkP.push([0, 0, 46, 2, 1]);
    c.mkO = [];
    const Q = TM.Q;   // Testzustand für Probebilder: puff=1 (alle rund), puff=alt (jeder zweite)
    if (Q && (Q.get('puff') === '1' || Q.get('puff') === 'alt' && c.id % 2)) { c.puff = 1; c.pt = 1; c.hold = 1e9; }
  },
  update(c, dt, oc) {
    const L = c.len, rnd = c.rnd, S = oc.scale || 1;
    // Aufblasen: schnell mit kleinem Überschwinger, rund treiben, langsam wieder schlank
    if (c.pt >= 0) {
      const t = (c.pt += dt), H = c.hold;
      if (t < 0.4) { const y = t / 0.4 - 1; c.puff = 1 + 2.2 * y * y * y + 1.2 * y * y; }
      else if (t < H) c.puff = 1 + 0.02 * Math.sin((t - 0.4) * 2.4);
      else if (t < H + 0.9) {
        const x = (t - H) / 0.9; c.puff = (1 - x * x * (3 - 2 * x)) * (1 + 0.05 * Math.sin(x * 14));
        if (!c.pff) { c.pff = 1; oc.ripple(c.x + c.hx * c.len * 0.5, c.y + c.hy * c.len * 0.5, 0.3); }   // pustet Wasser aus
      }
      else { c.puff = 0; c.pt = -1; c.mode = 0; c.mt = 1.2; c.tdir = c.th; }   // erst kurz verschnaufen
      c.jig = Math.max(0, c.jig - dt * 2);
      // treibt: Schwung klingt ab bis auf eine leise Strömung, dreht sich langsam
      const k = Math.exp(-dt * 0.8), cx = Math.cos(c.drift) * 4 * S, cy = Math.sin(c.drift) * 4 * S;
      c.dvx = cx + (c.dvx - cx) * k; c.dvy = cy + (c.dvy - cy) * k;
      c.th += c.spin * dt; c.spin *= Math.exp(-dt * 0.15);
      c.v = 0; c.x += c.dvx * dt; c.y += c.dvy * dt;
      edges(c, oc, dt);
      c.fp += dt * TAU * 4.6; c.ph += dt * TAU * 1.6; c.ta += (0.14 - c.ta) * Math.min(1, dt * 4); c.tk += (0 - c.tk) * Math.min(1, dt * 6);
      return;
    }
    // Wunschrichtung: umherschweifen, Ränder, Futter, Stift, Abstand zu anderen
    // Ziel-Richtung wird beim Schweben neu gewählt (fest, sonst dreht er sich im Kreis)
    let sx = Math.cos(c.tdir), sy = Math.sin(c.tdir), food = null, fd = 300 * S, flee = 0;
    const pad = Math.min(110, oc.W * 0.1);
    if (c.x < pad) sx += (pad - c.x) / pad * 3; else if (c.x > oc.W - pad) sx -= (c.x - oc.W + pad) / pad * 3;
    if (c.y < pad) sy += (pad - c.y) / pad * 3; else if (c.y > oc.H - pad) sy -= (c.y - oc.H + pad) / pad * 3;
    const mx = c.x + c.hx * L * 0.45, my = c.y + c.hy * L * 0.45;
    for (const p of oc.food) { const d = Math.hypot(p.x - mx, p.y - my); if (d < fd) { fd = d; food = p; } }
    if (food) {
      sx = (food.x - mx) / fd * 3 + sx * 0.3; sy = (food.y - my) / fd * 3 + sy * 0.3;
      if (fd < L * 0.1 + 5) { oc.eat(food, c); c.jig = 0.4; food = null; c.mt = Math.min(c.mt, 0.5); }
    }
    const Pt = oc.ptr, pd = Math.hypot(c.x - Pt.x, c.y - Pt.y), fr = 110 * S + L * 0.4;
    if (oc.t - Pt.t < 0.6 && pd < fr) { const s = (1 - pd / fr) * 6; sx += (c.x - Pt.x) / pd * s; sy += (c.y - Pt.y) / pd * s; flee = 1; }
    for (const d of oc.list) {
      if (d === c || d.kind.rigid && !d.kind.solid || Math.abs(d.depth - c.depth) > 0.22) continue;
      const ex = c.x - d.x, ey = c.y - d.y, r = (L + d.len) * 0.4, q = ex * ex + ey * ey;
      if (q < r * r && q > 1) { const m = Math.sqrt(q), s = (1 - m / r) * 2.5; sx += ex / m * s; sy += ey / m * s; }
    }
    { const cr = TM.crowd(c, oc); sx += cr.x; sy += cr.y; }   // von oben gesehen Platz lassen
    let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
    if (c.mode === 0) {   // schweben: fast still, dreht sich auf der Stelle zum nächsten Ziel
      c.v += (2.5 * S - c.v) * Math.min(1, dt * 4);
      c.om += (clamp(da * 2.6, -1.9, 1.9) - c.om) * Math.min(1, dt * 5);
      c.mt -= dt * (flee ? 4 : food ? 2 : 1);
      if (c.mt <= 0 && Math.abs(da) < 0.35) {
        c.mode = 1; c.dash = (60 + rnd() * 25) * S;
        c.mt = food ? clamp((fd - c.dash * 0.3) / c.dash, 0.08, 0.5) : 0.25 + rnd() * 0.3;
      }
    } else if (c.mode === 1) {   // flitzen
      c.v += (c.dash - c.v) * Math.min(1, dt * 12);
      c.om += (clamp(da * 1.5, -0.9, 0.9) - c.om) * Math.min(1, dt * 4);
      if ((c.mt -= dt) <= 0) c.mode = 2;
    } else {   // ausgleiten
      c.v *= Math.exp(-dt * 3.2); c.om *= Math.exp(-dt * 3);
      if (c.v < 5 * S) { c.mode = 0; c.mt = food ? 0.2 : 0.7 + rnd() * 1.8; c.tdir = c.th + (rnd() - 0.5) * 2.4; }
    }
    c.th += c.om * dt;
    c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
    c.dvx = Math.cos(c.th) * c.v; c.dvy = Math.sin(c.th) * c.v;
    // Brustflossen flattern (beim Flitzen angelegt), Schwanz schlägt beim Flitzen kräftig
    const m = c.mode;
    c.fp += dt * TAU * (m === 1 ? 2 : 4.2);
    c.ph += dt * TAU * (m === 1 ? 5 : m === 2 ? 2.4 : 1.3);
    c.ta += ((m === 1 ? 0.5 : m === 2 ? 0.22 : 0.12) - c.ta) * Math.min(1, dt * 6);
    c.tk += ((m === 1 ? 1 : 0) - c.tk) * Math.min(1, dt * 8);
    c.jig = Math.max(0, c.jig - dt * 2);
  },
  tap(c, oc) {
    if (c.pt < 0) {
      c.pt = 0; c.hold = 4.4; c.pff = 0; c.mode = 0; c.spin = (c.rnd() - 0.5) * 0.7; c.drift = c.rnd() * TAU;
      c.dvx *= 0.3; c.dvy *= 0.3;   // mitten im Flitzen: bremst beim Aufblasen fast ganz ab
    }
    else { c.hold = Math.max(c.hold, c.pt + 3); c.jig = 1; }   // nochmal getippt: wackelt und bleibt länger rund
  },
  prep(c, oc) {
    L = c.len; HX = c.hx; HY = c.hy; CW = oc.cw; CH = oc.ch; LB = c.lx; LA = -0.6 * c.hx - 0.8 * c.hy;
    P = c.puff; const p1 = clamp(P, 0, 1);
    AF = lerp(AF0, R1, P); AR = lerp(AR0, R1, P); BW = lerp(BW0, R1, P); EG = EG0 * (1 - p1);
    if (c.jig > 0) { const j = 0.07 * c.jig * Math.sin(c.t * 22); AF *= 1 + j; AR *= 1 + j; BW *= 1 - j; }
    EA = lerp(0.3, 0.34, p1); EB = lerp(0.16, 0.25, p1); ER = lerp(0.07, 0.062, p1);
    // Brustflossen: am Rand hinter den Augen, flattern schnell (beim Flitzen angelegt)
    FA = lerp(0.14, 0.1, p1);
    const X = FA - BC; FB = BW * (1 + EG * 0.5) * Math.sqrt(Math.max(0, 1 - X * X / (AF * AF))) - 0.015;
    const psi = lerp(2.0 + 0.55 * Math.sin(c.fp), 2.75, c.tk);
    FCS = Math.cos(psi); FSN = Math.sin(psi);
    // Schwanz: Wurzel am hinteren Leibende, schwingt um sie
    TA = BC - AR + 0.035; const al = c.ta * Math.sin(c.ph); TC = Math.cos(al); TS = Math.sin(al);
  },
  cell(a, b, c, o) {
    const bb = b < 0 ? -b : b, X = a - BC;
    const fb = eggF(X, b, AF, AR, BW, EG), qa = eQa, qb = eQb, E = eE;
    // Augen wölben sich über den Rand
    const ex = a - EA, ey = bb - EB, fe = ER - Math.sqrt(ex * ex + ey * ey);
    // Brustflossen: kleiner Fächer
    let ff = -1;
    { const pa = a - FA, pb = bb - FB, u = pa * FCS + pb * FSN, v = pb * FCS - pa * FSN;
      if (u > -0.03 && u < 0.14) { const hw = 0.012 + 0.03 * clamp(u / 0.1, 0, 1); ff = Math.min(hw - Math.abs(v), 0.1 - u, u + 0.02); } }
    // Schwanz: Stiel und Fächer, um die Wurzel geschwenkt
    let ft = -1, fin = false;
    { const pa = a - TA, u = -(pa * TC + b * TS), v = b * TC - pa * TS;
      if (u > -0.05 && u < 0.3) {
        const hw = u < 0.08 ? 0.065 - 0.025 * u / 0.08 : 0.04 + 0.06 * Math.pow((u - 0.08) / 0.16, 0.8);
        ft = Math.min(hw - Math.abs(v), 0.24 + 0.025 * (1 - v * v / 0.01) - u, u + 0.05); fin = u > 0.08; } }
    o.f = Math.max(fb, fe, ff, ft);
    if (o.f <= 0) return;
    o.line = 1;
    if (fe > 0 && fe >= fb - 0.03) { o.col = 4; o.lit = 0.9; return; }   // Auge: Iris um die Pupille
    if (fb > 0) {
      const z = Math.sqrt(Math.max(0, 1 - E * E));
      o.lit = 0.32 + 0.48 * z + 0.22 * (LA * qa + LB * qb); o.col = 0;
      // Tupfen: Lage auf der (gedehnten) Haut im schlanken Leib
      const sa = qa * (qa > 0 ? AF0 : AR0), sb = qb * BW0, sp = c.spots;
      for (let k = 0; k < 24; k += 3) { const da = sa - sp[k], db = sb - sp[k + 1]; if (sp[k + 2] && da * da + db * db < sp[k + 2] * sp[k + 2]) { o.col = 1; o.lit = 0.95; break; } }
      return;
    }
    if (ft > 0 && !fin) { o.col = 0; o.lit = 0.5; return; }
    o.col = 2; o.lit = 0.16;   // Flossen zart
  },
  marks(c) {
    const out = c.mkO, pool = c.mkP; out.length = 0;
    // Pupillen
    for (let s = -1; s <= 1; s += 2) { const m = pool[s < 0 ? 0 : 1]; m[0] = EA + 0.005; m[1] = s * EB; m[2] = 64; m[3] = 3; m[4] = 1; out.push(m); }
    if (P < 0.5) return out;
    // Stacheln: strahlen nach außen, Zeichen folgt der Richtung
    let n = 2;
    const g = clamp((P - 0.5) / 0.35, 0, 1);
    for (let k = 0; k < NS; k++) {
      const ph = (k + 0.5) / NS * TAU, cs = Math.cos(ph), sn = Math.sin(ph);
      if (cs < -0.9 || cs > 0.985) continue;   // nicht am Schwanz, nicht am Maul
      const nx = cs * HX - sn * HY, ny = cs * HY + sn * HX, half = 0.5 * (Math.abs(nx) * CW + Math.abs(ny) * CH);
      const gl = lineGlyph(nx, ny), r = radius(cs, sn) * L, lit = 0.5 + 0.45 * g;
      const len = (k & 1 ? 1 : 2) * (g > 0.7 ? 1 : 0.5);
      for (let j = 0; j < 2; j++) {
        if (j >= len) break;
        const d = (r + half + 1.5 + j * 2 * half) / L, m = pool[n++];
        m[0] = BC + cs * d; m[1] = sn * d; m[2] = g < 0.35 ? 46 : gl; m[3] = 2; m[4] = lit; out.push(m);
      }
    }
    return out;
  },
};
// Kugel am Rand sanft zurückschieben
function edges(c, oc, dt) {
  const pad = 60;
  if (c.x < pad) c.dvx += (pad - c.x) * dt; else if (c.x > oc.W - pad) c.dvx -= (c.x - oc.W + pad) * dt;
  if (c.y < pad) c.dvy += (pad - c.y) * dt; else if (c.y > oc.H - pad) c.dvy -= (c.y - oc.H + pad) * dt;
}
})();
