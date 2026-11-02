// Tintenmeer: ein Meer aus Schriftzeichen, von oben gesehen. Eigene Engine, kein fremder Code.
// Alles landet in einem Zeichenraster; gemalt wird über einen Glyphen-Atlas und nur dort, wo sich eine Zelle
// geändert hat. 15 Bilder/s, Pause sobald unsichtbar. Die Tiere stehen in TM.kinds (kinds/*.js).
//
// Eine Art (kind) ist ein Objekt:
//   label, len:[min,max] Körperlänge in px (bei 1440×900), speed:[min,max] px/s, turn: rad/s,
//   depth:[min,max] 0 = Oberfläche … 1 = Grund (tiefer = kleiner, blasser, wird zuerst gemalt, kürzerer Schatten),
//   ext: halbe Länge des Umrisses in Körperlängen (Flossen, Tentakel mitgerechnet), wext: halbe Breite dito,
//   amp: Schlagweite des Schwanzes, waveK: Wellen pro Körperlänge, beat: Schlagtakt, dash: Faktor beim Flitzen,
//   rigid: true = Körper biegt sich nicht (Qualle, Rochen …), solid: andere weichen trotz rigid aus,
//   colors: ['#rrggbb', …] für dunkles Wasser, light: [...] gleich viele für helles Papier (sonst automatisch),
//   ramp: Zeichen von dunkel nach hell (sonst TM.RAMP), gamma: Kurve Helligkeit → Zeichen (1.4), rim: Mindest-
//   helligkeit der Umrisse (0.62), eats: schwimmt zum Futter, count: wie viele im Demo-Meer, hidden: nicht in Listen,
//   init(c, R, oc): eigene Werte setzen (R() = Zufall 0..1), update(c, dt, oc): eigenes Verhalten (sonst TM.swim),
//   prep(c, oc): je Bild einmal vor dem Abtasten (Werte vorrechnen, damit cell billig bleibt),
//   cell(a, b, c, o, oc): Pflicht, läuft für jede Zelle im Umriss-Rechteck, jedes Bild. a = längs (-0.5 Schwanz …
//     0.5 Kopf), b = quer (+ = rechte Seite), beides in Körperlängen, schon mit Schwimmwelle und Kurve verbogen
//     (außer rigid). Setzt in o:
//     o.f   > 0 innen (am besten Abstand zum Rand in Körperlängen, außen negativ: daraus kommen die Randzeichen)
//     o.lit 0..1 Helligkeit (Zeichendichte und Farbstufe), o.col Index in colors, o.ch Zeichencode statt Rampe,
//     o.line = 1: wo der Rand durch eine Zelle läuft, das passende Zeichen . , ' - _ / \ | ( )
//   marks(c, oc): optionale Punkte, die immer sichtbar sein sollen (Augen): [[a, b, 'o', col, lit], …]
//   tap(c, oc, x, y): optional, was beim Antippen passiert (sonst: erschrickt und flitzt weg).
//   update und tap werden ohne this aufgerufen (init, prep, cell, marks dagegen als Methoden der Art).
//   space: Radius in Körperlängen, mit dem große Tiere einander von oben gesehen Platz lassen (TM.crowd),
//   every: 2 = solange langsamer als slowV px/s (14), nur jedes zweite Bild neu abtasten (spart bei trägen Tieren),
//   margin: px Wasser zwischen Körper und Bildrand in TM.swim (sonst wie der Koi, der auch mal halb hinausschwimmt),
//   tapTip: kurzer Hinweis, was Antippen bewirkt (für die Vorschauseite).
// Die Leinwand ist deckend: sie malt den Wassergrund (Thema bg) selbst, die Seite darunter spielt keine Rolle.
// Stil: tiles: true (oder oc.setTiles(true)) legt unter jedes Zeichen eines Tiers ein Kästchen in seiner Farbe.
//   Dann tragen die Kacheln Form und Licht, die Zeichen sind nur Struktur darauf; Umrisszeichen außerhalb
//   des Körpers fallen weg, dünne Striche bleiben, der Schatten wird zu dunkleren Kacheln.
// Am Tier c: x, y (px), th (Richtung), hx, hy (Einheitsvektor), v, len, depth, ph (Schlagphase), bend, t, seed,
//   lx (Licht von oben links, für TM.shade), burst (> 0: flitzt), alles aus add(name, {…}) und init.
//   Belegt von der Engine (nicht selbst benutzen): n, ci, cg, cc, mk, fx, fy, om, wt, sT, sL.
//   Tipp: viele Felder oder c[k] = … machen das Objekt langsam; Werte für cell lieber in einem eigenen Objekt fester Form.
// Am Meer oc: W, H, t, scale, list, food, add(name, opts), remove(c), resort(), ripple(x, y, s), put(x, y, ch, farbNr),
//   ring(x, y, r, farbNr), pal(kind)[col][stufe 0..7] → farbNr, ramp([r,g,b]) → 8 farbNr, fx.push({ depth, under,
//   update(dt, oc) → weiter?, draw(oc) }) für Effekte. Kurzlebige Dinge (Tintenwolke) am besten als eigene
//   versteckte Art (hidden: true) mit oc.add und später oc.remove: dann gelten Umriss, Schatten, Tiefe von selbst.
//   Kantentabelle für eigene feine Striche: oc.lut[ia * oc.ND + id] (ia = Winkel der Normale in oc.NA Schritten,
//   id = Lage in der Zelle in oc.ND Schritten), wie in ring(). TM.crowd(c, oc) → {x, y}: Ausweichrichtung (space).
// Szenen (welche Arten wie oft, eigenes Wasser je Szene) stehen in scenes.js: TM.scenes, TM.themeFor, TM.populate.
(function (root) {
'use strict';
const TM = root.TM || (root.TM = {});
const KINDS = TM.kinds || (TM.kinds = {});
const TAU = Math.PI * 2, LV = 8;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y); let u = x - xi, v = y - yi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const noise1 = x => noise2(x, 17.3);

// Farben
const hex = s => { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const rgb = c => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; }
  return [h, s, l];
}
function fromHsl(h, s, l) { const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; }
// Für helles Papier: helle Farben werden zu dunkler Tinte, der Farbton bleibt
function inked(c) { const [h, s, l] = hsl(c); return fromHsl(h, Math.min(1, s * 1.08), 0.13 + (1 - l) * 0.45); }

TM.RAMP = '.:-=+oO0@';
TM.EDGE = ".,'-_/\\|()";   // Kandidaten für Umrisse
TM.themes = {
  dark: { light: false, bg: '#0a1418', mote: '#5f8f99', shadow: 0, shadowCol: '#0a1418', food: '#f0c36a', ripple: '#9fd2d8' },
  light: { light: true, bg: '#f2f2ef', mote: '#7e9aa0', shadow: 183, shadowCol: '#c9ccc6', food: '#a86c12', ripple: '#4f7d86' },
};

// Linie in Bildschirmrichtung (dx, dy in Pixeln, y nach unten) → - / | \
function lineGlyph(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay < ax * 0.42) return 45;
  if (ay > ax * 2.8) return 124;
  return (dx > 0) === (dy > 0) ? 92 : 47;
}
// Rand einer Fläche; gx, gy = Steigung des Feldes (zeigt nach innen)
function edgeGlyph(gx, gy) {
  const ax = Math.abs(gx), ay = Math.abs(gy);
  if (ay > ax * 2.2) return gy > 0 ? 45 : 95;        // obere Kante -, untere _
  if (ax > ay * 1.15) return gx > 0 ? 40 : 41;       // linke Kante (, rechte )
  return (gx > 0) === (gy > 0) ? 47 : 92;
}

TM.util = { TAU, LV, clamp, lerp, smooth, rng, noise1, noise2, hash2, lineGlyph, edgeGlyph };
// Helligkeit quer über einen runden Körper: t = b / halbe Breite (-1 … 1); Licht fällt von oben links
TM.shade = (t, c) => clamp(0.3 + 0.6 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.22 * t * c.lx, 0, 1);
// Richtung im Körper (längs da, quer db) als Linienzeichen auf dem Bildschirm
TM.dirGlyph = (c, da, db) => lineGlyph(da * c.hx - db * c.hy, da * c.hy + db * c.hx);

// Platz lassen: große Tiere (Art mit space = Radius in Körperlängen) weichen sich von oben gesehen sanft aus,
// auch in verschiedener Tiefe; sonst liegen Qualle, Schildkröte und Rochen oft lange übereinander.
// Gibt eine Lenkrichtung zurück (gemeinsames Objekt {x, y}, Stärke 0 … w je Nachbar), zum Wunschkurs addieren.
const CROWD = { x: 0, y: 0 };
TM.crowd = function (c, oc, w = 1.2) {
  const sp = c.kind.space; CROWD.x = 0; CROWD.y = 0;
  if (!sp) return CROWD;
  for (const d of oc.list) {
    const ds = d.kind.space; if (d === c || !ds || d.dead) continue;
    const ex = c.x - d.x, ey = c.y - d.y, r = (c.len * sp + d.len * ds) * 1.2, q = ex * ex + ey * ey;
    if (q < r * r && q > 0.01) { const m = Math.sqrt(q), s = (1 - m / r) * w; CROWD.x += ex / m * s; CROWD.y += ey / m * s; }
  }
  return CROWD;
};

// Standard-Schwimmen: umherschweifen, am Rand umkehren, Futter suchen, vor dem Stift fliehen, Abstand halten
TM.swim = function (c, dt, oc) {
  const k = c.kind, L = c.len;
  c.wt += dt * (k.wander || 0.12);
  const wa = (noise1(c.seed * 0.137 + c.wt) - 0.5) * 2.6;
  let sx = Math.cos(c.th + wa), sy = Math.sin(c.th + wa), fast = 0;
  // Rand: margin (px) = so viel Wasser hält die Art zwischen Körper und Bildrand (träge Tiere); sonst wie der Koi
  const pad = k.margin != null ? k.margin * oc.scale + L * 0.5 : Math.min(140, oc.W * 0.12), ox = k.margin != null ? 0 : L * 0.25;
  if (c.x < pad - ox) sx += (pad - ox - c.x) / pad * 2.2; else if (c.x > oc.W - pad + ox) sx -= (c.x - oc.W + pad - ox) / pad * 2.2;
  if (c.y < pad - ox) sy += (pad - ox - c.y) / pad * 2.2; else if (c.y > oc.H - pad + ox) sy -= (c.y - oc.H + pad - ox) / pad * 2.2;
  if (k.eats && oc.food.length) {
    let best = null, bd = 380 * oc.scale;
    const mx = c.x + c.hx * L * 0.45, my = c.y + c.hy * L * 0.45;
    for (const p of oc.food) { const d = Math.hypot(p.x - mx, p.y - my); if (d < bd) { bd = d; best = p; } }
    if (best) {
      sx += (best.x - mx) / bd * 3.2; sy += (best.y - my) / bd * 3.2; fast = Math.max(fast, 0.7);
      if (bd < L * 0.12 + 6) { oc.eat(best, c); c.burst = Math.max(c.burst, 0.3); }
    }
  }
  const P = oc.ptr, pd = Math.hypot(c.x - P.x, c.y - P.y), fr = 120 * oc.scale + L * 0.35;
  if (oc.t - P.t < 0.6 && pd < fr) { const s = (1 - pd / fr) * 4; sx += (c.x - P.x) / pd * s; sy += (c.y - P.y) / pd * s; fast = Math.max(fast, 1 - pd / fr); }
  if (c.burst > 0) { c.burst -= dt; if (c.fx != null) { const d = Math.hypot(c.x - c.fx, c.y - c.fy) || 1; sx += (c.x - c.fx) / d * 4; sy += (c.y - c.fy) / d * 4; } fast = Math.max(fast, 1); } else c.fx = null;
  for (const d of oc.list) {
    if (d === c || d.kind.rigid && !d.kind.solid) continue;
    if (Math.abs(d.depth - c.depth) > 0.22) continue;
    const ex = c.x - d.x, ey = c.y - d.y, r = (L + d.len) * 0.36, q = ex * ex + ey * ey;
    if (q < r * r && q > 1) { const m = Math.sqrt(q), s = (1 - m / r) * 2; sx += ex / m * s; sy += ey / m * s; }
  }
  if (k.space) { const cr = TM.crowd(c, oc); sx += cr.x; sy += cr.y; }
  let da = Math.atan2(sy, sx) - c.th; da -= Math.round(da / TAU) * TAU;
  const mt = (k.turn || 0.9) * (1 + fast * 1.4);
  c.om += (clamp(da * 1.6, -mt, mt) - c.om) * Math.min(1, dt * 3);
  c.th += c.om * dt;
  const want = c.cruise * (1 + fast * (k.dash || 2.2));
  c.v += (want - c.v) * Math.min(1, dt * (fast ? 2.5 : 0.8));
  c.x += Math.cos(c.th) * c.v * dt; c.y += Math.sin(c.th) * c.v * dt;
  c.bend = clamp(c.om / Math.max(c.v, 8) * L * 0.55, -1.3, 1.3);
  c.ph += dt * TAU * (k.beat || 0.55) * (0.7 + 2.4 * c.v / L);
  c.amp = (k.amp || 0.08) * (0.8 + fast * 0.5);
};

function startle(c, oc, x, y) { c.burst = 1.4; c.fx = x; c.fy = y; }

class Ocean {
  constructor(box, opt) {
    this.box = box;
    this.opt = Object.assign({ theme: 'dark', font: 8, lh: 1.1, fps: 15, seed: 7, shadows: true, caustics: true, tiles: false,
      family: '"Cascadia Mono","Cascadia Code",Consolas,"SF Mono",Menlo,"Roboto Mono","Droid Sans Mono",monospace' }, opt);
    const cv = this.cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;left:0;top:0;display:block;pointer-events:none';
    box.appendChild(cv); this.g = cv.getContext('2d');
    this.R = rng(this.opt.seed); this.ids = 0;
    this.list = []; this.food = []; this.rip = []; this.fx = [];
    this.t = 0; this.fn = 0; this.ptr = { x: -1e4, y: -1e4, t: -1e4 };
    this.o = { f: 0, lit: 0, col: 0, ch: 0, line: 0 };
    this.css = []; this.tcss = []; this.cssId = new Map();
    this.stats = { cells: 0, ms: 0 };
    this.theme = TM.themes[this.opt.theme];
    this.layout();
  }
  // Farb-Nr. für eine CSS-Farbe (t: Farbe der Kachel unter dem Zeichen, sonst Wassergrund)
  cid(s, t) {
    const key = t ? s + '|' + t : s; let i = this.cssId.get(key);
    if (i === undefined) { i = this.css.length; this.css.push(s); this.tcss.push(t || null); this.cssId.set(key, i); }
    return i;
  }
  // Stufe 0..LV-1 einer Farbe: von kaum sichtbar (nah am Wasser) bis volle Farbe. Im Kachel-Stil (außer plain)
  // ist die Stufe die Kachel; das Zeichen darauf hebt sich leicht ab: auf hellen Kacheln dunkler, sonst heller.
  // Im Kachel-Stil ist die Stufe zugleich die Deckkraft der Kachel (blasse Kachel = durchscheinend): Ränder,
  // dünne Teile und tiefe Tiere landen unten. Auf blassen Kacheln ist auch das Zeichen zurückhaltender.
  ramp(c, plain) {
    const bg = this.bgA, out = [], tiles = this.opt.tiles && !plain;
    for (let l = 0; l < LV; l++) {
      const u = l / (LV - 1), t = mix(bg, c, tiles ? 0.12 + 0.88 * u : 0.2 + 0.8 * u);
      if (!tiles) { out.push(this.cid(rgb(t))); continue; }
      const lum = (0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]) / 255;
      out.push(this.cid(rgb(mix(t, lum > 0.55 ? [0, 0, 0] : [255, 255, 255], (lum > 0.55 ? 0.4 : 0.34) * (0.45 + 0.55 * u))), rgb(t)));
    }
    return out;
  }
  pal(k) {
    // gilt nur für dieses Meer und diesen Themenstand: setTheme vergibt die Farb-Nr. neu (sonst behielte eine Art,
    // die beim Wechsel Meer → Teich → Meer nicht im Bild war, alte Nummern und würde unsichtbar oder falsch bunt)
    if (k._pal && k._po === this && k._pg === this.lay) return k._pal;
    const th = this.theme, src = th.light ? (k.light || k.colors.map(s => rgb(inked(hex(s))))) : k.colors;
    k._pal = src.map(s => this.ramp(s[0] === '#' ? hex(s) : s.match(/\d+/g).map(Number))); k._po = this; k._pg = this.lay;
    k._ramp = Array.from(k.ramp || TM.RAMP, ch => ch.charCodeAt(0));
    return k._pal;
  }
  setTheme(name) {
    this.opt.theme = name; this.theme = TM.themes[name];
    this.css = []; this.tcss = []; this.cssId = new Map(); this.atlasReset();
    this.lay = (this.lay || 0) + 1;   // Farb-Nr. und Raster sind neu: alle Tiere beim nächsten Bild neu abtasten
    const th = this.theme;
    // Wasser: im Kachel-Stil bei dunklem Wasser einen Hauch heller, damit die dunkleren Schattenkacheln zu sehen sind
    this.bgA = this.opt.tiles && !th.light ? mix(hex(th.bg), [255, 255, 255], 0.04) : hex(th.bg); this.bg = rgb(this.bgA);
    this.moCol = this.ramp(hex(th.mote), true).slice(0, 5); this.shCol = this.cid(th.shadowCol);
    this.foodCol = this.ramp(hex(th.food), true); this.ripCol = this.ramp(hex(th.ripple), true);
    // Schatten im Kachel-Stil: leere Kachel, deutlich dunkler als das Wasser (auf Papier: grau)
    this.shTile = this.cid(this.bg, rgb(th.light ? mix(this.bgA, hex(th.shadowCol), 0.85) : mix(this.bgA, [0, 0, 0], 0.52)));
    this.bgDirty = true; this.full = true;
  }
  setTiles(on) { this.opt.tiles = !!on; this.setTheme(this.opt.theme); }
  layout() {
    const dpr = this.dpr = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
    const W = this.box.clientWidth, H = this.box.clientHeight;
    const fs = this.opt.font, m = document.createElement('canvas').getContext('2d');
    m.font = fs * dpr + 'px ' + this.opt.family;
    this.cwD = Math.max(4, Math.round(m.measureText('M').width)); this.chD = Math.round(fs * dpr * (this.opt.lh || 1.16));
    this.cw = this.cwD / dpr; this.ch = this.chD / dpr;
    this.cols = Math.ceil(W / this.cw); this.rows = Math.ceil(H / this.ch);
    this.buildLut();
    this.W = W; this.H = H; this.scale = clamp(Math.min(W, H) / 900, 0.55, 1.25);
    const cv = this.cv; cv.width = this.cols * this.cwD; cv.height = this.rows * this.chD;
    cv.style.width = cv.width / dpr + 'px'; cv.style.height = cv.height / dpr + 'px';
    const n = this.cols * this.rows;
    this.G = new Uint16Array(n); this.C = new Uint16Array(n); this.L = new Uint8Array(n); this.O = new Uint16Array(n);
    this.PG = new Uint16Array(n); this.PC = new Uint16Array(n);
    this.setTheme(this.opt.theme); this.motes();
  }
  // Tabelle: welches Zeichen zeichnet eine gerade Kante am besten, die in Winkel φ (Normale, nach innen) im
  // Abstand d an der Zellmitte vorbeiläuft? Dazu wird jede Lage als Strich gerastert und mit der Tinte der
  // Zeichen (in 3×6 Feldern) verglichen. Einmal je Schriftgröße, ein paar Millisekunden.
  buildLut() {
    const cw = this.cwD, ch = this.chD, GX = 3, GY = 6, NA = this.NA = 48, ND = this.ND = 24;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.font = this.opt.font * this.dpr + 'px ' + this.opt.family; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    const fieldOf = (x, y) => Math.min(GY - 1, (y * GY / ch) | 0) * GX + Math.min(GX - 1, (x * GX / cw) | 0), per = cw * ch / (GX * GY);
    const ink = chr => { g.clearRect(0, 0, cw, ch); g.fillText(chr, cw / 2, ch * 0.54); const d = g.getImageData(0, 0, cw, ch).data, v = new Float32Array(GX * GY);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) v[fieldOf(x, y)] += d[(y * cw + x) * 4 + 3] / 255 / per; return v; };
    // Strichstärke der Schrift: Tinte von | in der mittleren Zeile
    g.clearRect(0, 0, cw, ch); g.fillText('|', cw / 2, ch * 0.54);
    const mid = g.getImageData(0, (ch / 2) | 0, cw, 1).data; let sw = 0; for (let x = 0; x < cw; x++) sw += mid[x * 4 + 3] / 255;
    sw = clamp(sw, 1, cw * 0.4);
    const cand = Array.from(TM.EDGE), vecs = cand.map(ink);
    const lut = this.lut = new Uint16Array(NA * ND), v = new Float32Array(GX * GY);
    for (let ia = 0; ia < NA; ia++) {
      const a = ia / NA * TAU, nx = Math.cos(a), ny = Math.sin(a), half = 0.5 * (Math.abs(nx) * cw + Math.abs(ny) * ch);
      for (let id = 0; id < ND; id++) {
        const d = (-1 + 2 * (id + 0.5) / ND) * half;   // Zellmitte liegt d vor der Kante (in Richtung n)
        v.fill(0);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const dist = Math.abs((x + 0.5 - cw / 2) * nx + (y + 0.5 - ch / 2) * ny + d);
          const cov = clamp(sw / 2 - dist + 0.5, 0, 1); if (cov) v[fieldOf(x, y)] += cov / per;
        }
        let best = 0, bs = 0; for (let k = 0; k < v.length; k++) bs += v[k] * v[k];   // leer lassen als Vergleich
        for (let c = 0; c < cand.length; c++) { let s = 0; const w = vecs[c]; for (let k = 0; k < v.length; k++) { const e = w[k] - v[k]; s += e * e; } if (s < bs) { bs = s; best = cand[c].charCodeAt(0); } }
        lut[ia * ND + id] = best;
      }
    }
  }
  atlasReset() {
    const a = this.atlas || (this.atlas = document.createElement('canvas'));
    this.per = Math.max(1, Math.floor(2048 / (this.cwD || 8))); a.width = this.per * (this.cwD || 8); a.height = (this.chD || 16) * 16;
    this.ax = a.getContext('2d'); this.slots = new Map(); this.nslot = 0; this.axFont = false;
  }
  slot(gl, co) {
    const key = gl * 65536 + co; let s = this.slots.get(key);
    if (s !== undefined) return s;
    s = this.nslot++; this.slots.set(key, s);
    const a = this.atlas, cw = this.cwD, ch = this.chD, x = (s % this.per) * cw, y = ((s / this.per) | 0) * ch;
    if (y + ch > a.height) {   // Atlas voll: doppelt so hoch, Inhalt mitnehmen
      if (a.height >= 4096) { this.atlasReset(); this.full = true; return this.slot(gl, co); }
      const old = document.createElement('canvas'); old.width = a.width; old.height = a.height; old.getContext('2d').drawImage(a, 0, 0);
      a.height *= 2; this.ax = a.getContext('2d'); this.ax.drawImage(old, 0, 0); this.axFont = false;
    }
    const g = this.ax;
    if (!this.axFont) { g.font = this.opt.font * this.dpr + 'px ' + this.opt.family; g.textAlign = 'center'; g.textBaseline = 'middle'; this.axFont = true; }
    // deckend: Zeichen samt Wassergrund, so ersetzt drawImage die Zelle ganz und blit braucht kein clearRect.
    // Kachel: rechts und unten eine Fuge von 1 Gerätepixel Wasser, damit die Kästchen einzeln zu sehen sind.
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); g.fillStyle = this.bg; g.fillRect(x, y, cw, ch);
    const t = this.tcss[co]; if (t) { g.fillStyle = t; g.fillRect(x, y, cw - 1, ch - 1); }
    g.fillStyle = this.css[co]; g.fillText(String.fromCharCode(gl), x + cw / 2, y + ch * 0.54); g.restore();
    return s;
  }

  add(name, o = {}) {
    const k = KINDS[name]; if (!k) return null;
    const R = this.R, c = { ...o, kind: k, name, id: ++this.ids, seed: (R() * 1e5) | 0, t: 0, wt: R() * 50, om: 0, ph: R() * TAU, bend: 0, burst: 0, fx: null, fy: 0, n: 0,
      ci: new Int32Array(256), cg: new Uint16Array(256), cc: new Uint16Array(256), mk: [] };
    c.depth = o.depth ?? lerp(k.depth[0], k.depth[1], R());
    c.len = (o.len ?? lerp(k.len[0], k.len[1], R())) * this.scale * (1 - 0.2 * c.depth);
    c.cruise = c.v = lerp(k.speed[0], k.speed[1], R()) * this.scale;
    c.x = o.x ?? R() * this.W; c.y = o.y ?? R() * this.H; c.th = o.th ?? R() * TAU;
    c.amp = k.amp || 0.08; c.hx = Math.cos(c.th); c.hy = Math.sin(c.th); c.lx = 0;
    if (k.init) k.init(c, R, this);
    this.list.push(c); this.list.sort((p, q) => q.depth - p.depth);
    return c;
  }
  // Tiefe geändert (z. B. Schildkröte taucht auf): Reihenfolge neu
  resort() { this.list.sort((p, q) => q.depth - p.depth);
  }
  remove(c) { c.dead = true; }   // wird nach dem Schritt entfernt
  clear() { this.list = []; this.food = []; this.rip = []; this.fx = []; }

  feed(x, y) {
    this.ripple(x, y, 1);
    const n = 3 + ((this.R() * 3) | 0);
    for (let i = 0; i < n; i++) { const a = this.R() * TAU, r = 6 + this.R() * 26 * this.scale; this.food.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.8, age: 0, life: 14 + this.R() * 8 }); }
  }
  eat(p, c) { const i = this.food.indexOf(p); if (i >= 0) this.food.splice(i, 1); this.ripple(p.x, p.y, 0.35); }
  // under: Welle unter den Tieren malen (nur im Wasser sichtbar), z. B. beim Antippen eines Tiers
  ripple(x, y, s = 1, under = false) { this.rip.push({ x, y, age: 0, s, life: 1.6 + s * 1.2, under }); }
  hit(x, y) {
    const q = Math.floor(x / this.cw), r = Math.floor(y / this.ch);
    for (const [dq, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const qq = q + dq, rr = r + dr; if (qq < 0 || rr < 0 || qq >= this.cols || rr >= this.rows) continue;
      const id = this.O[rr * this.cols + qq]; if (id) return this.list.find(c => c.id === id) || null;
    }
    return null;
  }
  tap(x, y) {
    const c = this.hit(x, y);
    // getroffen: die kleine Welle läuft unter den Tieren, damit sie nicht über Panzer, Kugel oder Glocke zieht
    if (c) { (c.kind.tap || startle)(c, this, x, y); this.ripple(x, y, 0.5, true); } else this.feed(x, y);
  }
  point(x, y) { this.ptr.x = x; this.ptr.y = y; this.ptr.t = this.t; }

  step(dt) {
    this.t += dt; this.dtR = (this.dtR || 0) + dt;
    for (const c of this.list) {
      c.t += dt; (c.kind.update || TM.swim)(c, dt, this);
      c.hx = Math.cos(c.th); c.hy = Math.sin(c.th); c.lx = 0.6 * c.hy - 0.8 * c.hx;
    }
    if (this.list.some(c => c.dead)) this.list = this.list.filter(c => !c.dead);
    for (let i = this.food.length - 1; i >= 0; i--) { const p = this.food[i]; p.age += dt; if (p.age > p.life) this.food.splice(i, 1); }
    for (let i = this.rip.length - 1; i >= 0; i--) { const r = this.rip[i]; r.age += dt; if (r.age > r.life) this.rip.splice(i, 1); }
    for (let i = this.fx.length - 1; i >= 0; i--) if (!this.fx[i].update(dt, this)) this.fx.splice(i, 1);
  }

  // Schwebeteilchen: ein paar hundert Pünktchen, die langsam mit der Strömung treiben (weit weg = matter)
  motes() {
    const want = Math.round(this.W * this.H / 6500 * (this.opt.motes ?? 1)), P = this.mo || (this.mo = []), R = this.R;
    while (P.length < want) P.push({ x: R() * this.W, y: R() * this.H, z: R(), p: R() * TAU });
    P.length = want;
  }
  drawMotes(dt) {
    const W = this.W, H = this.H, t = this.t, cm = this.moCol;
    for (const m of this.mo) {
      const s = (0.35 + 0.65 * (1 - m.z)) * this.scale;   // nah = schneller
      m.x += ((noise2(m.x * 0.004, m.y * 0.004 + t * 0.02) - 0.5) * 14 + 3.5) * s * dt;
      m.y += ((noise2(m.x * 0.004 + 9.1, m.y * 0.004 - t * 0.02) - 0.5) * 14 + 1.2) * s * dt;
      if (m.x < -5) m.x += W + 10; else if (m.x > W + 5) m.x -= W + 10;
      if (m.y < -5) m.y += H + 10; else if (m.y > H + 5) m.y -= H + 10;
      const tw = 0.5 + 0.5 * Math.sin(t * 0.7 + m.p);   // leises Funkeln
      const lv = clamp(Math.round((1 - m.z) * 3 + tw * 1.5), 0, 4);
      const q = Math.floor(m.x / this.cw), r = Math.floor(m.y / this.ch);
      if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) continue;
      const i = r * this.cols + q; this.G[i] = lv > 3 ? 183 : 46; this.C[i] = cm[lv]; this.L[i] = 1;
    }
  }

  // Ein Tier ins Raster abtasten (noch nicht schreiben)
  sample(c) {
    const k = c.kind, L = c.len, cw = this.cw, ch = this.ch, cols = this.cols, rows = this.rows;
    // enges Rechteck um das gedrehte Tier: längs ext, quer wext (+ Platz für Schwanzschlag und Kurve)
    const ex = (k.ext || 0.62) * L, ey = ((k.wext || k.ext || 0.62) + (k.rigid ? 0 : c.amp * 1.3 + Math.abs(c.bend) * 0.16)) * L;
    const hw = Math.abs(c.hx) * ex + Math.abs(c.hy) * ey + cw, hh = Math.abs(c.hy) * ex + Math.abs(c.hx) * ey + ch;
    let q0 = Math.floor((c.x - hw) / cw), q1 = Math.floor((c.x + hw) / cw), r0 = Math.floor((c.y - hh) / ch), r1 = Math.floor((c.y + hh) / ch);
    q0 = Math.max(q0, -1); q1 = Math.min(q1, cols); r0 = Math.max(r0, -1); r1 = Math.min(r1, rows);
    c.n = 0; c.mk.length = 0;
    if (q0 > q1 || r0 > r1) return;
    const W = q1 - q0 + 1, H = r1 - r0 + 1, n = W * H;
    if (!this.sF || this.sF.length < n) { const m = Math.max(n, 4096) * 2; this.sF = new Float32Array(m); this.sL = new Float32Array(m); this.sC = new Uint8Array(m); this.sH = new Uint16Array(m); this.sN = new Uint8Array(m); this.sJ = new Float32Array(m); }
    const F = this.sF, LI = this.sL, CO = this.sC, CH = this.sH, LN = this.sN, J = this.sJ, o = this.o, tiles = this.opt.tiles;
    const hx = c.hx, hy = c.hy, iL = 1 / L, rigid = k.rigid, amp = c.amp, kw = TAU * (k.waveK || 0.75), ph = c.ph, bend = c.bend;
    let i = 0;
    for (let r = r0; r <= r1; r++) {
      const py = (r + 0.5) * ch - c.y;
      for (let q = q0; q <= q1; q++, i++) {
        const px = (q + 0.5) * cw - c.x;
        const a = (px * hx + py * hy) * iL; let b = (py * hx - px * hy) * iL;
        if (!rigid) { const e = clamp(0.5 - a, 0, 1.25); b -= amp * e * e * Math.sin(kw * e - ph) + bend * a * a * 0.5; }
        o.f = -1; o.lit = 0.6; o.col = 0; o.ch = 0; o.line = 0;
        k.cell(a, b, c, o, this);
        F[i] = o.f;
        if (o.f > 0) {
          LI[i] = o.lit; CO[i] = o.col; CH[i] = o.ch; LN[i] = o.line;
          // Kacheln: Zeichen um eine Stufe streuen, fest am Körper (wandert mit dem Tier, flackert nicht)
          if (tiles) J[i] = hash2(Math.floor(a * L / 6), Math.floor(b * L / 6) + c.seed) - 0.5;
        }
      }
    }
    // tiefer = matter; bei Kacheln stärker, dort heißt matt durchscheinend (Kachel näher am Wasser)
    const pal = this.pal(k), rmp = k._ramp, rl = rmp.length - 1, dim = 1 - (tiles ? 0.55 : 0.38) * c.depth, rim = k.rim ?? 0.62, gam = k.gamma || 1.4;
    const lut = this.lut, NA = this.NA, ND = this.ND, dpr = this.dpr;
    let m = 0;
    if (c.ci.length < n) { c.ci = new Int32Array(n * 2); c.cg = new Uint16Array(n * 2); c.cc = new Uint16Array(n * 2); }
    for (let rr = 0; rr < H; rr++) {
      const r = r0 + rr; if (r < 0 || r >= rows) continue;
      for (let qq = 0; qq < W; qq++) {
        const q = q0 + qq; if (q < 0 || q >= cols) continue;
        const j = rr * W + qq, f = F[j];
        const fl = qq > 0 ? F[j - 1] : -1, fr = qq < W - 1 ? F[j + 1] : -1, fu = rr > 0 ? F[j - W] : -1, fd = rr < H - 1 ? F[j + W] : -1;
        let s = j, cov = 1;   // Zelle, deren Farbe gilt; Deckkraft der Kachel
        if (tiles) {
          // Kacheln: Deckkraft = wie viel der Zelle im Körper liegt (Abstand zum Rand über die Steigung des Feldes).
          // Innen am Rand halb bis ganz, knapp außen eine blasse Kachel: der Umriss wird weich wie bei Pinselfarbe.
          const gx = Math.abs(fr - fl) / (2 * cw), gy = Math.abs(fd - fu) / (2 * ch), gs = gx * cw + gy * ch;
          if (gs > 1e-7) cov = clamp(0.5 + f / gs, 0, 1);
          if (f <= 0) {
            if (cov < 0.15 || (fl <= 0 && fr <= 0 && fu <= 0 && fd <= 0)) continue;
            s = fl > 0 ? j - 1 : fr > 0 ? j + 1 : fu > 0 ? j - W : j + W;
          }
        } else if (f <= 0) {   // außen: nur wenn die Kante einer Fläche mit Umriss durch diese Zelle läuft
          if (fl <= 0 && fr <= 0 && fu <= 0 && fd <= 0) continue;
          s = fl > 0 ? j - 1 : fr > 0 ? j + 1 : fu > 0 ? j - W : j + W;
          if (!LN[s]) continue;
        }
        let gl = f > 0 ? CH[j] : 0, edge = false;
        if (!gl && LN[s]) {
          if (f > 0 && ((fl <= 0 && fr <= 0) || (fu <= 0 && fd <= 0))) {
            // dünner Strich (Flossensaum, Stiel): Richtung aus den Nachbarn, die innen liegen
            let txx = 0, txy = 0, tyy = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) {
              if (!dq && !dr) continue; const y = rr + dr, x = qq + dq; if (y < 0 || x < 0 || y >= H || x >= W || F[y * W + x] <= 0) continue;
              const dx = dq * cw, dy = dr * ch; txx += dx * dx; txy += dx * dy; tyy += dy * dy;
            }
            if (txx + tyy) { const th = 0.5 * Math.atan2(2 * txy, txx - tyy); gl = lineGlyph(Math.cos(th), Math.sin(th)); } else gl = 183;
            edge = true;
          } else if (!tiles) {
            const gx = (fr - fl) / (2 * cw), gy = (fd - fu) / (2 * ch), gm = Math.hypot(gx, gy);
            if (gm > 1e-7) {
              const nx = gx / gm, ny = gy / gm, d = f / gm, half = 0.5 * (Math.abs(nx) * cw + Math.abs(ny) * ch);
              if (d > -half && d <= half) {
                let ia = Math.round(Math.atan2(ny, nx) / TAU * NA) % NA; if (ia < 0) ia += NA;
                gl = lut[ia * ND + Math.min(ND - 1, Math.floor((d / half + 1) * 0.5 * ND))]; edge = true;
              }
            }
          }
        }
        let lit = clamp(LI[s], 0, 1);
        if (edge && gl) lit = rim + (1 - rim) * lit;
        lit *= dim * cov;
        if (!gl) { if (f <= 0 && !tiles) continue; gl = rmp[tiles ? clamp(Math.round(Math.pow(lit, gam) * rl + J[s] * 2.4), 0, rl) : Math.round(Math.pow(lit, gam) * rl)]; }
        c.ci[m] = r * cols + q; c.cg[m] = gl; c.cc[m] = pal[CO[s]][clamp(Math.round(lit * (LV - 1)), 0, LV - 1)]; m++;
      }
    }
    c.n = m;
    if (k.marks) for (const [a, b, g, col, lit] of k.marks(c, this)) {
      const e = clamp(0.5 - a, 0, 1.25), bb = rigid ? b : b + amp * e * e * Math.sin(kw * e - ph) + bend * a * a * 0.5;
      const x = c.x + (hx * a - hy * bb) * L, y = c.y + (hy * a + hx * bb) * L, q = Math.floor(x / cw), r = Math.floor(y / ch);
      if (q >= 0 && r >= 0 && q < cols && r < rows) c.mk.push(r * cols + q, typeof g === 'string' ? g.charCodeAt(0) : g, pal[col][clamp(Math.round((lit ?? 1) * dim * (LV - 1)), 0, LV - 1)]);
    }
  }
  shadow(c) {
    if (!this.opt.shadows) return;
    const off = (1 - c.depth) * 34 * this.scale, dq = Math.round(off * 0.55 / this.cw), dr = Math.round(off * 0.83 / this.ch);
    if (!dq && !dr) return;
    const cols = this.cols, rows = this.rows, G = this.G, C = this.C, Ly = this.L, tiles = this.opt.tiles;
    const sg = tiles ? 32 : this.theme.shadow, sc = tiles ? this.shTile : this.shCol;
    for (let m = 0; m < c.n; m++) {
      const i = c.ci[m], q = i % cols + dq, r = ((i / cols) | 0) + dr; if (q >= cols || r >= rows) continue;
      const j = r * cols + q; if (Ly[j] < 2) { G[j] = !tiles && sg && (q + r) & 1 ? 0 : sg; C[j] = sc; Ly[j] = 2; }
    }
  }
  write(c) {
    const G = this.G, C = this.C, Ly = this.L, O = this.O, id = c.id;
    for (let m = 0; m < c.n; m++) { const i = c.ci[m]; G[i] = c.cg[m]; C[i] = c.cc[m]; Ly[i] = 3; O[i] = id; }
    const mk = c.mk; for (let m = 0; m < mk.length; m += 3) { const i = mk[m]; G[i] = mk[m + 1]; C[i] = mk[m + 2]; Ly[i] = 3; O[i] = id; }
  }
  // einzelnes Zeichen an Pixelstelle (für Futter, Wellen, Effekte)
  put(x, y, gl, co, owner = 0) {
    const q = Math.floor(x / this.cw), r = Math.floor(y / this.ch);
    if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) return;
    const i = r * this.cols + q; this.G[i] = typeof gl === 'string' ? gl.charCodeAt(0) : gl; this.C[i] = co; this.L[i] = 3; if (owner) this.O[i] = owner;
  }
  // Kreislinie (Mitte x, y, Radius R in px) mit den Kanten-Zeichen: genau ein Zeichen je Durchgang
  ring(x, y, R, co, owner = 0) {
    const cw = this.cw, ch = this.ch, cols = this.cols, rows = this.rows, lut = this.lut, NA = this.NA, ND = this.ND;
    const r0 = Math.max(0, Math.floor((y - R) / ch) - 1), r1 = Math.min(rows - 1, Math.floor((y + R) / ch) + 1);
    for (let r = r0; r <= r1; r++) {
      const py = (r + 0.5) * ch - y, span = Math.sqrt(Math.max(0, R * R - py * py));
      for (const sx of span ? [-span, span] : [0]) {
        const qc = Math.floor((x + sx) / cw);
        for (let q = Math.max(0, qc - 2); q <= Math.min(cols - 1, qc + 2); q++) {
          if (span && sx < 0 && (q + 0.5) * cw > x || span && sx > 0 && (q + 0.5) * cw <= x) continue;
          const px = (q + 0.5) * cw - x, d = Math.hypot(px, py) || 1e-3, nx = -px / d, ny = -py / d, off = R - d;
          const half = 0.5 * (Math.abs(nx) * cw + Math.abs(ny) * ch); if (off <= -half || off > half) continue;
          let ia = Math.round(Math.atan2(ny, nx) / TAU * NA) % NA; if (ia < 0) ia += NA;
          const gl = lut[ia * ND + Math.min(ND - 1, Math.floor((off / half + 1) * 0.5 * ND))]; if (!gl) continue;
          const i = r * cols + q; this.G[i] = gl; this.C[i] = co; this.L[i] = 3; if (owner) this.O[i] = owner;
        }
      }
    }
  }
  drawRipples(under) {
    for (const w of this.rip) {
      if (!w.under !== !under) continue;
      const f = w.age / w.life, lv = clamp(Math.round((1 - f) * (LV - 1) * (0.55 + 0.45 * w.s)), 0, LV - 1); if (!lv) continue;
      this.ring(w.x, w.y, (4 + w.age * 42) * w.s * this.scale + 3, this.ripCol[lv]);
      if (w.age > 0.4 && lv > 2) this.ring(w.x, w.y, (4 + (w.age - 0.4) * 34) * w.s * this.scale + 3, this.ripCol[lv - 2]);
    }
  }
  drawFood() {
    for (const p of this.food) {
      const f = p.age / p.life, gl = f < 0.08 ? 111 : f < 0.6 ? 8226 : 183;
      this.put(p.x + Math.sin(p.age * 0.7 + p.x) * 3, p.y + f * 10, gl, this.foodCol[clamp(Math.round((1 - f * 0.7) * (LV - 1)), 1, LV - 1)]);
    }
  }

  render() {
    const t0 = performance.now(), fr = 2.5 / (this.opt.fps || 15);
    this.G.fill(0); this.L.fill(0); this.O.fill(0);
    if (this.opt.motes !== 0) this.drawMotes(this.dtR || 0);
    for (const c of this.list) {
      const k = c.kind;
      // träge Tiere (every: 2) nur jedes zweite Bild neu abtasten, solange sie langsam sind und das letzte Abtasten
      // erst ein Bild her ist; versetzt nach id, damit die Last gleichmäßig bleibt. Sonst gelten die alten Zellen.
      if (k.every > 1 && c.sL === this.lay && this.t - c.sT < fr && (this.fn + c.id) % k.every && Math.abs(c.v) < (k.slowV || 14) * this.scale) continue;
      if (k.prep) k.prep(c, this);
      this.sample(c); c.sT = this.t; c.sL = this.lay;
    }
    for (const c of this.list) this.shadow(c);
    const fx = this.fx.filter(e => e.under);
    for (const e of fx) e.draw(this);
    this.drawRipples(true);
    // Tiere von tief nach flach, Effekte mit Tiefe dazwischen
    const over = this.fx.filter(e => !e.under).sort((p, q) => q.depth - p.depth);
    let j = 0;
    for (const c of this.list) { while (j < over.length && over[j].depth > c.depth) over[j++].draw(this); this.write(c); }
    while (j < over.length) over[j++].draw(this);
    this.drawFood(); this.drawRipples(false); this.dtR = 0;
    this.blit(); this.fn++;
    this.stats.ms = this.stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  // Nur geänderte Zellen malen. Die Leinwand ist deckend (Wassergrund selbst gemalt): ein Zeichen ist ein
  // drawImage aus dem Atlas, frei gewordene Zellen einer Zeile werden zusammen mit einem Rechteck gefüllt.
  blit() {
    const g = this.g, A = this.atlas, cw = this.cwD, ch = this.chD, cols = this.cols, G = this.G, C = this.C, PG = this.PG, PC = this.PC, full = this.full;
    g.fillStyle = this.bg;
    if (full) g.fillRect(0, 0, this.cv.width, this.cv.height);
    let n = 0, e0 = 0, en = 0;   // Lauf leerer Zellen: Anfang, Länge
    for (let i = 0, len = G.length; i < len; i++) {
      const gl = G[i], co = C[i];
      if (!full && gl === PG[i] && (gl === 0 || co === PC[i])) continue;
      PG[i] = gl; PC[i] = co; n++;
      if (gl) { const s = this.slot(gl, co), per = this.per; g.drawImage(A, (s % per) * cw, ((s / per) | 0) * ch, cw, ch, (i % cols) * cw, ((i / cols) | 0) * ch, cw, ch); }
      else if (!full) {
        if (en && e0 + en === i && i % cols) en++;
        else { if (en) g.fillRect((e0 % cols) * cw, ((e0 / cols) | 0) * ch, en * cw, ch); e0 = i; en = 1; }
      }
    }
    if (en) g.fillRect((e0 % cols) * cw, ((e0 / cols) | 0) * ch, en * cw, ch);
    this.full = false; this.stats.cells = n;
  }

  start() {
    if (this.on) return; this.on = true; this.last = performance.now();
    const tick = () => { this.raf = requestAnimationFrame(now => {
      if (!this.on) return;
      const dt = Math.min(0.25, (now - this.last) / 1000); this.last = now;
      this.step(dt); this.render();
      this.tm = setTimeout(tick, Math.max(0, 1000 / this.opt.fps - (performance.now() - now) - 3));
    }); };
    tick();
  }
  stop() { this.on = false; clearTimeout(this.tm); cancelAnimationFrame(this.raf); }
}
TM.Ocean = Ocean;
})(typeof window !== 'undefined' ? window : globalThis);
