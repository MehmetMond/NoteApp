// Fischschwarm: ein Tier = ein kleiner Fisch. Alle derselben Variante halten zusammen (Boids: Abstand,
// gleiche Richtung, Zusammenhalt), kreisen mal als Wirbel, fliehen gemeinsam vor Stift und Hai, ziehen zum Futter.
// Gezeichnet wird jeder Fisch als kurze Zeichenkette entlang der Wirbelsäule (Schwanz → Kopf).
(function () {
const { clamp, lerp, smooth, noise1, TAU } = TM.util;
const Q = TM.Q || new URLSearchParams('');
// Testzustände der Probeseite (dev.html): grid = Raster aller Richtungen, school = Schwarm im Filmstreifen
const GRID = !!Q.get('grid'), SCHOOL = +(Q.get('school') || 0);

// Vorlagen je Zellenzahl, so geschrieben wie sie auf dem Bild stehen (links → rechts, oben → unten).
// E/W: nach rechts/links schwimmend (eine Zelle je Spalte), S/N: nach unten/oben (eine Zelle je Zeile).
// Sardine: Gabelschwanz > < ψ ʎ, schlanker Leib (Rückenlinie Φ), Kopf O mit Schnauze.
// Goldfisch: Fächerschwanz } { W M, runder Leib.
const DES = {
  sardine: {
    E: ['', 'o', '>o', '>o)', '>=O)', '>-=O)', '>-=oO)', '>--=oO)', '>--==oO)', '>---=oO)', '>---==oO)', '>----==oO)'],
    W: ['', 'o', 'o<', '(o<', '(O=<', '(O=-<', '(Oo=-<', '(Oo=--<', '(Oo==--<', '(Oo=---<', '(Oo==---<', '(Oo==----<'],
    S: ['', 'O', 'ψO', 'ψ|O', 'ψ|ΦO', 'ψ|ΦOv', 'ψ||ΦOv', 'ψ|||ΦOv'],
    N: ['', 'O', 'Oʎ', 'O|ʎ', 'OΦ|ʎ', '^OΦ|ʎ', '^OΦ||ʎ', '^OΦ|||ʎ'],
  },
  goldfisch: {
    E: ['', 'O', '}O', '}O)', '}oO)', '}=oO)', '}~=oO)', '}~=oOO)', '}~-=oOO)', '}~--=oOO)', '}~---=oOO)', '}~----=oOO)'],
    W: ['', 'O', 'O{', '(O{', '(Oo{', '(Oo={', '(Oo=~{', '(OOo=~{', '(OOo=-~{', '(OOo=--~{', '(OOo=---~{', '(OOo=----~{'],
    S: ['', 'O', 'WO', 'WoO', 'W|oO', 'W|oOU', 'W:|oOU', 'W::|oOU'],
    N: ['', 'O', 'OM', 'OoM', 'Oo|M', 'nOo|M', 'nOo|:M', 'nOo|::M'],
  },
};
// Schwanzschlag: am Stiel läuft eine kleine Welle mit (je Richtung: ruhig, links, rechts)
const WAVE = { E: '-~~', W: '-~~', S: '|()', N: '|()' };
// dünne Zeichen des Leibs, die an einer Stufe durch einen Schrägstrich ersetzt werden dürfen (runde bleiben)
const STEM = new Set(Array.from('-=~|():', ch => ch.charCodeAt(0)));

// Schwarm-Daten je Meer und Variante (einmal je Schritt neu)
function school(c, oc) {
  const all = oc._schwarm || (oc._schwarm = {});
  return all[c.var] || (all[c.var] = { m: [], t: -1, seed: (c.seed % 997) + 3, cx: c.x, cy: c.y, gx: c.x, gy: c.y, mill: 0, spin: 1, th: c.th, depth: c.depth, len0: 0, threat: null, n: 0 });
}
function stepSchool(S, k, v, oc) {
  const m = S.m; m.length = 0;
  let sx = 0, sy = 0, hx = 0, hy = 0;
  for (const d of oc.list) if (d.kind === k && d.var === v && !d.dead && d.joined) { m.push(d); sx += d.x; sy += d.y; hx += d.hx; hy += d.hy; }
  const n = m.length; S.t = oc.t;
  if (n) { S.cx = sx / n; S.cy = sy / n; S.th = Math.atan2(hy, hx); }
  // Ziel des Schwarms: wandert langsam über das ganze Bild; manchmal Wirbel (Kreisen um die Mitte)
  const t = oc.t, W = oc.W, H = oc.H, pad = Math.min(220, W * 0.18);
  S.gx = clamp(W * (0.5 + 0.6 * (noise1(S.seed + t * 0.031) * 2 - 1)), pad, W - pad);
  S.gy = clamp(H * (0.5 + 0.6 * (noise1(S.seed + 40 + t * 0.027) * 2 - 1)), pad, H - pad);
  S.mill = smooth(0.52, 0.66, noise1(S.seed * 1.7 + 9 + t * 0.045));
  if (S.mill < 0.02) S.spin = noise1(S.seed + t * 0.2) > 0.5 ? 1 : -1;
  if (S.threat && t - S.threat.t > 1.6) S.threat = null;
}
// Fluchtkraft weg von (x, y) im Umkreis r, Stärke s; addiert in F, gibt Angst 0..1 zurück
const F = { x: 0, y: 0 };
function flee(c, x, y, r, s) {
  const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
  if (d >= r || d < 1e-3) return 0;
  const f = 1 - d / r; F.x += dx / d * f * s; F.y += dy / d * f * s;
  return f;
}
// Hai: Abstand zur Körperlinie (Kopf bis Schwanz), vor dem Maul gefährlicher. Flucht weg von der Linie und
// quer zu seiner Richtung, so teilt sich der Schwarm vor ihm und schließt sich dahinter wieder
function fleeShark(c, d, sc) {
  const hl = d.len * 0.45, ex = c.x - d.x, ey = c.y - d.y, u = clamp(ex * d.hx + ey * d.hy, -hl, hl);
  const px = ex - d.hx * u, py = ey - d.hy * u, m = Math.hypot(px, py) || 1e-3;
  const R = d.len * 0.22 + 70 * sc + Math.max(0, u) / hl * d.len * 0.3;   // vorne weiter
  if (m >= R) return 0;
  const f = 1 - m / R, side = px * -d.hy + py * d.hx >= 0 ? 1 : -1;
  F.x += (px / m * 0.7 - d.hy * side * 0.6) * f * 5; F.y += (py / m * 0.7 + d.hx * side * 0.6) * f * 5;
  return f;
}
// erster Schritt: zum Schwarm stoßen (gleiche Tiefe, ähnliche Größe, in der Nähe)
function join(c, S, oc) {
  c.joined = 1;
  // der Erste seiner Variante im Meer? (nicht über einen Zähler: nach oc.clear() und neuer Szene wäre der veraltet)
  if (!oc.list.some(d => d !== c && d.kind === c.kind && d.var === c.var && d.joined && !d.dead)) {
    S.depth = c.depth; S.len0 = c.len0; S.th = c.th;
    c.x = clamp(c.x, oc.W * 0.25, oc.W * 0.75); c.y = clamp(c.y, oc.H * 0.25, oc.H * 0.75); S.cx = c.x; S.cy = c.y;
    return;
  }
  const gold = c.var === 'goldfisch', a = c.r1 * TAU, r = c.len0 * oc.scale * (0.5 + 3 * Math.sqrt(c.r2));
  c.x = S.cx + Math.cos(a) * r; c.y = S.cy + Math.sin(a) * r * 0.8;
  c.th = S.th + (c.r3 - 0.5) * 0.7; c.hx = Math.cos(c.th); c.hy = Math.sin(c.th);
  c.depth = clamp(S.depth + (c.r3 - 0.5) * 0.08, 0.05, 0.95);
  c.len0 = S.len0 * (gold ? 0.75 + 0.5 * c.r2 : 0.86 + 0.28 * c.r2);
  c.len = c.len0 * oc.scale * (1 - 0.2 * c.depth);
  oc.resort();
}

function update(c, dt, oc) {
  if (GRID) return;
  const k = c.kind, S = school(c, oc);
  // Test (Filmstreifen): school=N setzt N-1 Begleiter um das erste Tier
  if (SCHOOL && !k._sp) {
    k._sp = 1; for (let i = 1; i < SCHOOL; i++) oc.add('schwarm', { x: c.x, y: c.y, th: c.th, depth: c.depth, var: c.var });
    // thai=Sekunden: ein Hai (falls geladen, extra=hai) schwimmt dann quer auf den Schwarm zu
    if (Q.get('thai') && TM.kinds.hai) k._hai = +Q.get('thai');
    if (Q.get('tfood')) k._food = +Q.get('tfood');   // tfood=Sekunden: Futter vor den Schwarm
  }
  if (k._hai && oc.t >= k._hai) { k._hai = 0; oc.add('hai', { x: c.x - 520 * oc.scale, y: c.y + 60, th: -0.1, depth: 0.55 }); }
  if (k._food && oc.t >= k._food) { k._food = 0; oc.feed(S.cx + Math.cos(S.th) * 150 + 60, S.cy + Math.sin(S.th) * 150 - 50); }
  if (!c.joined) join(c, S, oc);
  if (S.t !== oc.t) stepSchool(S, k, c.var, oc);
  const L = c.len, gold = c.var === 'goldfisch', t = oc.t, W = oc.W, H = oc.H, sc = oc.scale;
  let sx = 0, sy = 0, fast = 0;
  // Nachbarn: Abstand halten, gleiche Richtung, zusammenbleiben
  const rs = L * (gold ? 1.5 : 1.15), rv = L * (gold ? 4 : 5.5);
  let ax = 0, ay = 0, px = 0, py = 0, w = 0, nf = 0;
  for (const d of S.m) {
    if (d === c) continue;
    const dx = d.x - c.x, dy = d.y - c.y, q = dx * dx + dy * dy;
    if (q > rv * rv || q < 1e-4) continue;
    const m = Math.sqrt(q);
    if (m < rs) { const s = (1 - m / rs) * 2.6; sx -= dx / m * s; sy -= dy / m * s; }
    const wt = 1 - m / rv;
    ax += d.hx * wt; ay += d.hy * wt; px += dx * wt; py += dy * wt; w += wt;
    if (d.fear > nf) nf = d.fear;
  }
  if (w > 0) {
    const al = gold ? 0.9 : 1.3, co = gold ? 0.5 : 0.55, pm = Math.hypot(px / w, py / w) || 1, cs = co * clamp(pm / (L * 1.5), 0, 1.5);
    sx += ax / w * al + (px / w) / pm * cs; sy += ay / w * al + (py / w) / pm * cs;
  }
  // ganzer Schwarm: zur Mitte (wenn weit weg), zum Ziel, manchmal Wirbel
  const ex = S.cx - c.x, ey = S.cy - c.y, em = Math.hypot(ex, ey) || 1;
  const far = clamp((em - L * 3) / (L * 6), 0, 1.5);
  sx += ex / em * far * 1.4; sy += ey / em * far * 1.4;
  const gx = S.gx - c.x, gy = S.gy - c.y, gm = Math.hypot(gx, gy) || 1, goal = 0.45 * (1 - S.mill);
  sx += gx / gm * goal; sy += gy / gm * goal;
  if (S.mill > 0) {   // Kreisen: tangential um die Mitte, Ring bei einigen Körperlängen
    const rr = L * (2.2 + 0.08 * S.m.length), rad = clamp((em - rr) / rr, -1, 1);
    sx += (-ey / em * S.spin * 1.5 + ex / em * rad * 0.8) * S.mill;
    sy += (ex / em * S.spin * 1.5 + ey / em * rad * 0.8) * S.mill;
  }
  // Rand: rechtzeitig umkehren
  const pad = Math.min(150, W * 0.12) * sc;
  if (c.x < pad) sx += (pad - c.x) / pad * 2.5; else if (c.x > W - pad) sx -= (c.x - W + pad) / pad * 2.5;
  if (c.y < pad) sy += (pad - c.y) / pad * 2.5; else if (c.y > H - pad) sy -= (c.y - H + pad) / pad * 2.5;
  // Gefahr: Stift, Hai, Antippen → alle fliehen gemeinsam
  let fear = 0; F.x = 0; F.y = 0;
  const P = oc.ptr;
  if (t - P.t < 0.6) fear = Math.max(fear, flee(c, P.x, P.y, 110 * sc + L * 2.5, 4));
  if (S.threat) fear = Math.max(fear, flee(c, S.threat.x, S.threat.y, S.threat.r, 4.5 * (1 - (t - S.threat.t) / 1.6)));
  for (const d of oc.list) if (d.name === 'hai') fear = Math.max(fear, fleeShark(c, d, sc));
  sx += F.x; sy += F.y;
  c.fear = Math.max(fear, nf * 0.82, c.fear - dt * 1.2);
  fast = Math.max(fast, c.fear);
  // Futter: der nächste Brocken in Reichweite
  if (oc.food.length && c.fear < 0.3) {
    let best = null, bd = 420 * sc;
    const mx = c.x + c.hx * L * 0.45, my = c.y + c.hy * L * 0.45;
    for (const p of oc.food) { const d = Math.hypot(p.x - mx, p.y - my); if (d < bd) { bd = d; best = p; } }
    if (best) {
      sx += (best.x - mx) / bd * 3; sy += (best.y - my) / bd * 3; fast = Math.max(fast, 0.4);
      if (bd < L * 0.2 + 5) oc.eat(best, c);
    }
  }
  // Lenken und Tempo
  let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
  if (sx * sx + sy * sy < 1e-4) da = 0;
  const mt = (k.turn || 2.6) * (gold ? 0.6 : 1) * (1 + fast * 1.2);
  c.om += (clamp(da * 2.2, -mt, mt) - c.om) * Math.min(1, dt * 4);
  c.th += c.om * dt;
  const want = c.cruise * (1 + 0.12 * Math.sin(t * 0.7 + c.r1 * 9) + fast * (k.dash || 1.8));
  c.v += (want - c.v) * Math.min(1, dt * (fast > 0.3 ? 3 : 1.2));
  c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
  c.bend = clamp(c.om / Math.max(c.v, 8) * L * 0.5, -1, 1);
  c.ph += dt * TAU * (gold ? 0.5 : 0.62) * (0.8 + 2 * c.v / L);
  c.amp = (gold ? 0.11 : 0.08) * (0.8 + fast * 0.5);
  c.flash = Math.max(c.flash - dt * 2.5, clamp((Math.abs(c.om) - 0.9) * 0.7, 0, 1));
}

TM.kinds.schwarm = {
  label: 'Fischschwarm', count: 24, len: [26, 44], speed: [36, 50], turn: 2.8, depth: [0.28, 0.55], eats: true,
  tapTip: 'der ganze Schwarm stiebt auseinander',   // Hinweis beim Antippen (Vorschauseite)
  rigid: true, ext: 0.52, wext: 0.14, dash: 1.8,
  //        Silber      Rücken      Auge       Gold-Orange  Flossen gold  Kopf orange
  colors: ['#c3d6de', '#7c9db3', '#1d2a33', '#e48d3f', '#f0c487', '#cf6d33'],
  light: ['#4b6b7d', '#2a4a5e', '#14181b', '#bf5a16', '#b47a2c', '#8a3510'],
  init(c, R, oc) {
    c.var = c.var || Q.get('svar') || 'sardine';
    if (c.var === 'goldfisch') c.cruise = c.v = lerp(18, 28, R()) * oc.scale;
    c.len0 = c.len / (oc.scale * (1 - 0.2 * c.depth));
    c.sq = new Int16Array(24); c.sr = new Int16Array(24); c.sg = new Uint16Array(24); c.sc = new Uint8Array(24); c.sl = new Float32Array(24); c.slat = new Float32Array(24); c.sn = 0;
    c.fear = 0; c.flash = 0; c.joined = 0; c.r1 = R(); c.r2 = R(); c.r3 = R();
    if (GRID) {   // Testraster: Zeilen = Größen (oben Sardinen, unten Goldfische), Spalten = 16 Richtungen
      const K = TM.kinds.schwarm, j = K._gi = (K._gi || 0) + 1, col = (j - 1) % 16, row = ((j - 1) / 16) | 0;
      c.th = col * TAU / 16 + (+Q.get('gth') || 0); c.x = oc.W * (col + 0.5) / 16; c.y = 50 + row * 60;
      c.len = Q.get('glen') ? +Q.get('glen') : [44, 36, 28, 22][row % 4]; c.depth = 0.3; c.ph = +Q.get('gph') || 0; c.bend = 0;
      if (Q.get('gvar')) c.var = Q.get('gvar'); else if (row >= 4) c.var = 'goldfisch';
    }
  },
  update,
  tap(c, oc, x, y) {
    school(c, oc).threat = { x, y, t: oc.t, r: c.len * 6 + 60 * oc.scale };
    c.fear = 1;
  },
  // je Bild: Wirbelsäule vom Kopf aus als Zellkette rastern. Der Kopf liegt fest in seiner Zelle, die Stufen
  // der Kette hängen nur von Richtung und Länge ab: so flackert die Form beim Schwimmen nicht.
  prep(c, oc) {
    // Krümmung nur halb: bei wenigen Zellen würde sie Kopf und Schwanz sonst ganz aus der Kette reißen
    const cw = oc.cw, ch = oc.ch, L = c.len * 0.86, hx = c.hx, hy = c.hy, amp = c.amp || 0.08, ph = c.ph, bend = (c.bend || 0) * 0.5;
    const horiz = Math.abs(hx) * ch >= Math.abs(hy) * cw;
    const kx = c.x + hx * L * 0.5, ky = c.y + hy * L * 0.5, qh = Math.floor(kx / cw), rh = Math.floor(ky / ch);
    let n;
    // Lage des Kopfes in seiner Zelle: passt der ganze Fisch in eine Zeile (Spalte), liegt er mittig; sonst so,
    // dass Kopf und Leib möglichst lange zusammenbleiben und die Stufen zwischen zwei Zellen fallen (stabil)
    const cs = horiz ? cw : ch, cl = horiz ? ch : cw;
    let ax = horiz ? Math.abs(hx) : Math.abs(hy), st = (horiz ? -hy : -hx) * cs / ax;
    n = clamp(Math.round(L * ax / cs + 0.35), 2, 24);   // Zellen so, dass die gezeichnete Länge etwa L ist
    // Schräge Fische (um 45°) zerfielen als getreue Treppe in lauter Stücke aus ein, zwei Zeichen. Darum höchstens
    // eine Stufe je Fisch: er liegt etwas flacher, als er schwimmt, bleibt aber ein zusammenhängender, lesbarer Zug.
    for (let k = 0; k < 2 && Math.abs(st) * (n - 1) > cl; k++) {
      st = Math.sign(st) * cl / Math.max(1, n - 1); ax = cs / Math.hypot(cs, st);
      n = clamp(Math.round(L * ax / cs + 0.35), 2, 24);
    }
    if (Math.abs(st) * (n - 1) > cl) st = Math.sign(st) * cl / Math.max(1, n - 1);
    const s = Math.abs(st) / cl, span = (n - 1) * s;
    const base = horiz ? rh : qh, d = (horiz ? hx : hy) > 0 ? -1 : 1, lw = c.slat;
    let p0;
    if (span < 0.88) p0 = (base + 0.5) * cl - Math.sign(st) * span * 0.5 * cl;
    else {   // die Stufe liegt hinter dem Kopfteil (oO) bzw. =oO)), der Schwanz eine Zeile/Spalte versetzt
      const h = clamp(n - Math.floor(n * 0.45), 1, n - 1);
      p0 = st > 0 ? (base + 1 - (h - 0.5) * s) * cl : (base + (h - 0.5) * s) * cl;
    }
    // seitlicher Schlag und Krümmung, gemessen ab dem Kopf: der Kopf führt, der Leib folgt
    const lat0 = bend * 0.125 * L;
    for (let j = 0; j < n; j++) {
      const e = n > 1 ? j / (n - 1) : 0, lat = (amp * e * e * Math.sin(TAU * 0.75 * e - ph) + bend * (0.5 - e) * (0.5 - e) * 0.5) * L - lat0;
      const off = horiz ? lat / hx : -lat / hy;   // quer zur Kette (in Zeilen- bzw. Spaltenrichtung)
      lw[j] = off;
      if (horiz) { c.sq[j] = qh + d * j; c.sr[j] = Math.floor((p0 + j * st + off) / ch); }
      else { c.sq[j] = Math.floor((p0 + j * st + off) / cw); c.sr[j] = rh + d * j; }
      // mit Stufe: der Schlag darf den Schwanz nicht in die Kopfzeile zurückwerfen (sonst Lücke wie "(Oo== /<")
      if (span >= 0.88 && j > 0) {
        const P = horiz ? c.sr : c.sq, sg = st > 0 ? 1 : -1, v = P[j];
        P[j] = sg > 0 ? clamp(v, P[j - 1], P[0] + 1) : clamp(v, P[0] - 1, P[j - 1]);
      }
    }
    c.sn = n;
    // Vorlage: Index 0 = Kopf; E und S stehen auf dem Bild Schwanz zuerst
    const D = DES[c.var] || DES.sardine, dir = horiz ? (hx > 0 ? 'E' : 'W') : (hy > 0 ? 'S' : 'N'), rev = dir === 'E' || dir === 'S';
    const T = D[dir], tpl = T[Math.min(n, T.length - 1)], tl = tpl.length, wv = WAVE[dir], wth = amp * L * 0.3;
    const gold = c.var === 'goldfisch', fl = c.flash || 0, slant = TM.util.lineGlyph(hx, hy);
    for (let j = 0; j < n; j++) {
      const k = j === n - 1 ? tl - 1 : j >= tl - 1 ? tl - 2 : j;   // lange Fische: Stiel verlängern
      let g = tpl.charCodeAt(rev ? tl - 1 - Math.max(0, k) : Math.max(0, k));
      // Stiel biegt sich im Schlag: - wird ~, | wird ( oder )
      if (j >= n - 3 && j < n - 1 && g === wv.charCodeAt(0) && Math.abs(lw[j]) > wth) g = wv.charCodeAt(horiz ? 1 : lw[j] > 0 ? 2 : 1);
      // an einer Stufe der Kette verbindet ein Schrägstrich die beiden Zeilen (Leib bleibt ein Zug)
      if (j > 1 && j < n - 1 && (horiz ? c.sr[j] !== c.sr[j - 1] : c.sq[j] !== c.sq[j - 1]) && STEM.has(g)) g = slant;
      c.sg[j] = g;
      const head = j < 2, tail = j === n - 1 && n > 1;
      if (gold) { c.sc[j] = tail ? 4 : head ? 5 : 3; c.sl[j] = tail ? 0.8 : 0.95; }
      else { c.sc[j] = tail || head || fl > 0.4 ? 0 : 1; c.sl[j] = tail ? 0.75 : head ? 0.95 : 0.85 + 0.15 * fl; }
    }
  },
  cell(a, b, c, o, oc) {
    const L = c.len, x = c.x + (a * c.hx - b * c.hy) * L, y = c.y + (a * c.hy + b * c.hx) * L;
    const q = Math.floor(x / oc.cw), r = Math.floor(y / oc.ch);
    for (let i = 0; i < c.sn; i++) if (c.sq[i] === q && c.sr[i] === r) { o.f = 1; o.ch = c.sg[i]; o.col = c.sc[i]; o.lit = c.sl[i]; return; }
    o.f = -1;
  },
};
})();
