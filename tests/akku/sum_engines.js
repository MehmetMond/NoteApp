// Mittel je Name aus Ergebnissen von engines.js: CPU-Zeit der Engine (ohne dwm), GPU-Laufzeit, CPU des Grafikprozesses
// und der Seite, je Ablauf. node sum_engines.js <ergebnis.json> …
const fs = require('fs');
const runs = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const by = {};
for (const r of runs) { if (r.error) console.log('FEHLER in', r.name, r.error.split('\n')[0]); (by[r.name] = by[r.name] || []).push(r); }
const phases = ['ruhe', 'schreiben', 'tape', 'formen', 'verschieben', 'ruhe_danach'], active = phases.slice(1, 5);
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const f = x => isNaN(x) ? '-' : String(Math.round(x));
const names = Object.keys(by);
console.log('Ablauf'.padEnd(13) + names.map(n => (n + ' (' + (by[n][0].version || '?').replace('Chrome/', 'Chromium ') + ', ' + by[n].length + '×)').padEnd(40)).join(''));
console.log(' '.repeat(13) + names.map(() => 'CPU ms  GPU ms  Grafikproz.  Seite'.padEnd(40)).join(''));
const tot = {};
for (const ph of phases) {
  let line = ph.padEnd(13);
  for (const n of names) {
    const ok = by[n].filter(r => r.phases && r.phases[ph]).map(r => r.phases[ph]);
    const cpu = avg(ok.map(d => d.cpu_ms)), gpu = avg(ok.map(d => d.gpu_ms)), gp = avg(ok.map(d => d.cpu['gpu-process'] || 0)), rd = avg(ok.map(d => d.cpu.renderer || 0));
    if (active.includes(ph)) { tot[n] = tot[n] || [0, 0]; tot[n][0] += cpu; tot[n][1] += gpu; }
    line += (f(cpu).padStart(6) + f(gpu).padStart(8) + f(gp).padStart(13) + f(rd).padStart(7)).padEnd(40);
  }
  console.log(line);
}
console.log('Summe aktiv'.padEnd(13) + names.map(n => (f(tot[n][0]).padStart(6) + f(tot[n][1]).padStart(8)).padEnd(40)).join(''));
console.log('Einzelläufe (CPU ms, Summe aktiv):', names.map(n => n + ' ' + by[n].map(r => f(active.reduce((s, ph) => s + (r.phases[ph] ? r.phases[ph].cpu_ms : 0), 0))).join('/')).join(', '));
