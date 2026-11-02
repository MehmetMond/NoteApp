// Szenen für den Startbildschirm: welche Arten wie oft (Einträge [Art, Anzahl, Optionen für oc.add]).
// Ruhig genug für den Hintergrund hinter dem Notizbuch-Regal, lebendig genug, dass immer etwas zieht.
// Der Teich hat eigenes Wasser: grünlicher und etwas wärmer, auf Papier ein leicht grünliches Blatt.
// Nach engine.js und den Arten laden. Benutzung:
//   const oc = new TM.Ocean(box, { theme: TM.themeFor('teich', 'dark') }); TM.populate(oc, 'teich'); oc.start();
//   Wechsel: oc.clear(); TM.populate(oc, szene); oc.setTheme(TM.themeFor(szene, look)); oc.full = true; oc.render();
(function (root) {
'use strict';
const TM = root.TM || (root.TM = {});
const T = TM.themes;

// Teich-Wasser: erbt alles vom normalen Thema, nur Grund, Schwebeteilchen, Schatten und Wellen werden grüner
T.teichDark = Object.assign({}, T.dark, { bg: '#0b1612', mote: '#6a957c', shadowCol: '#0b1612', ripple: '#a3d4bd' });
T.teichLight = Object.assign({}, T.light, { bg: '#eef0e7', mote: '#869c86', shadowCol: '#c8cfc0', ripple: '#4f7f69' });

TM.scenes = {
  meer: {
    label: 'Meer',
    kinds: [
      ['oktopus', 1],                          // tief am Grund
      ['hai', 1],                              // zieht tief weite Bögen
      ['rochen', 1],
      ['qualle', 3],
      ['schildkroete', 1],
      ['kugelfisch', 1],
      ['schwarm', 18, { var: 'sardine', len: 34 }],     // ein Schwarm Sardinen (len: Größe des ersten, die anderen streuen darum)
    ],
  },
  teich: {
    label: 'Teich',
    theme: { dark: 'teichDark', light: 'teichLight' },
    kinds: [
      ['seerose', 6],                          // Blätter treiben oben, manche mit Blüte
      ['koi', 3],
      ['schwarm', 10, { var: 'goldfisch', len: 42 }],   // ein Trupp Goldfische, etwas größer als Sardinen, sonst nur Krümel
    ],
  },
};

// Thema einer Szene für 'dark' oder 'light' (Name in TM.themes)
TM.themeFor = (scene, look) => {
  const s = TM.scenes[scene];
  return (s && s.theme && s.theme[look]) || look;
};

// Szene ins Meer setzen (vorher oc.clear()). Große Tiere (Art mit space) liegen schon zu Anfang auseinander:
// von 24 Zufallsorten nimmt jedes den, der am weitesten von den schon gesetzten entfernt ist. n = Anzahlen
// je Eintrag statt der Szenenwerte (für Tests).
TM.populate = (oc, scene, n) => {
  const S = TM.scenes[scene]; if (!S) return;
  const R = oc.R, put = [];
  S.kinds.forEach(([id, count, opts], e) => {
    const k = TM.kinds[id], m = n && n[e] != null ? n[e] : count;
    for (let i = 0; i < m; i++) {
      const o = Object.assign({}, opts);
      if (k && k.space && o.x == null && o.y == null) {
        const r = k.space * (k.len[0] + k.len[1]) * 0.5 * oc.scale;
        let bx = 0, by = 0, bd = -Infinity;
        for (let j = 0; j < 24; j++) {
          const x = r + R() * Math.max(1, oc.W - 2 * r), y = r + R() * Math.max(1, oc.H - 2 * r);
          let d = Infinity; for (const p of put) d = Math.min(d, Math.hypot(x - p.x, y - p.y) - p.r - r);
          if (d > bd) { bd = d; bx = x; by = y; }
        }
        o.x = bx; o.y = by; put.push({ x: bx, y: by, r });
      }
      oc.add(id, o);
    }
  });
};
})(typeof window !== 'undefined' ? window : globalThis);
