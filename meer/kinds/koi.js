// Koi von oben: runder Rumpf, Fächerschwanz, rudernde Brustflossen, vier Farbschläge
(function () {
const { clamp, noise2 } = TM.util;
// halbe Rumpfbreite an der Stelle a (Kopf vorn rund, hinten schlanker Stiel)
const bodyW = a => {
  let w = a > -0.3 && a < 0.5 ? 0.46 * Math.pow(0.5 - a, 0.55) * Math.pow(a + 0.3, 0.8) : 0;
  if (a > -0.37 && a < -0.1) w = Math.max(w, 0.03);
  return w;
};
TM.kinds.koi = {
  label: 'Koi', count: 3, len: [170, 235], speed: [20, 32], turn: 0.75, depth: [0.12, 0.5], eats: true,
  tapTip: 'erschrickt und flitzt weg',   // Hinweis beim Antippen (Vorschauseite)
  amp: 0.085, waveK: 0.7, beat: 0.5, ext: 0.58, wext: 0.2,
  //        weiß       rot-orange  sumi       gold       Flossen
  colors: ['#f4f0e6', '#f0662e', '#4d535a', '#f5bf4f', '#bcd6dc'],
  light: ['#a39d91', '#d4471b', '#26282c', '#c48812', '#9fb0b5'],
  init(c, R) {
    const v = R(); c.var = c.var || (v < 0.42 ? 'kohaku' : v < 0.7 ? 'showa' : v < 0.86 ? 'yamabuki' : 'tancho');
    c.px = R() * 97; c.py = R() * 89;
  },
  // je Bild einmal: Winkel der rudernden Brustflossen
  prep(c) {
    for (const side of [-1, 1]) { const beta = 0.85 + 0.3 * Math.sin(c.ph * 0.5 + side * 1.4); (side < 0 ? c.fl || (c.fl = [0, 0]) : c.fr || (c.fr = [0, 0])).splice(0, 2, -Math.sin(beta), side * Math.cos(beta)); }
  },
  cell(a, b, c, o) {
    const ab = Math.abs(b), w = bodyW(a), fb = w - ab;
    // Brustflossen: rudern langsam vor und zurück
    const side = b < 0 ? -1 : 1, dx = side < 0 ? c.fl[0] : c.fr[0], dy = side < 0 ? c.fl[1] : c.fr[1], ra = a - 0.19, rb = b - side * 0.1;
    const u = ra * dx + rb * dy, v = -ra * dy + rb * dx;
    const fp = u > -0.01 ? 0.03 * (1 - Math.hypot((u - 0.05) / 0.055, v / 0.03)) : -1;
    // Schwanzflosse: Fächer mit Gabel
    const e = -0.3 - a, tw = 0.026 + e * 0.6, edge = -0.43 - 0.1 * Math.min(1, ab / 0.12);
    const ft = e > 0 ? Math.min(tw - ab, a - edge) : -1;
    if (fb > 0) {
      const t = b / Math.max(w, 1e-3);
      o.f = fb; o.line = 1; o.lit = TM.shade(t, c) + 0.14 * (noise2(a * 22 + c.px, b * 22) - 0.5);
      o.col = this.pattern(a, b, t, c);
      return;
    }
    if (ft > 0 || fp > 0) {   // Flossen: zarter Umriss, innen fast leer
      o.f = Math.max(ft, fp); o.col = 4; o.line = 1; o.lit = 0.12;
      return;
    }
    o.f = Math.max(fb, ft, fp);
  },
  pattern(a, b, t, c) {
    switch (c.var) {
      case 'yamabuki': return 3;
      case 'tancho': return Math.hypot((a - 0.31) * 1.15, b) < 0.06 ? 1 : 0;
      case 'kohaku': return a < 0.43 && Math.abs(t) < 0.92 && noise2(a * 7 + c.px, b * 9 + c.py) > 0.54 ? 1 : 0;
      default: {   // showa: schwarz, rot, weiß
        if (noise2(a * 6 + c.py, b * 8 + c.px) > 0.63) return 2;
        return a < 0.44 && noise2(a * 7 + c.px, b * 9 + c.py) > 0.5 ? 1 : 0;
      }
    }
  },
  marks(c) { return [[0.385, -0.072, 'o', 2, 1], [0.385, 0.072, 'o', 2, 1]]; },
};
})();
