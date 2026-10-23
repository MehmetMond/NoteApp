// Offline-Start der Browser-Version (GitHub Pages): die App-Dateien liegen zusätzlich im Cache.
// Mit Netz wird immer die neueste Version geladen und gespeichert, ohne Netz (oder nach 4 s) die gespeicherte.
// Die Notizen selbst liegen in IndexedDB und haben mit diesem Cache nichts zu tun.
const CACHE = 'notizen-app';
const FILES = ['./', 'index.html', 'Notizen-Browser.html', 'manifest.webmanifest', 'icon-180.png', 'electron/icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const r = e.request, url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin) return;
  const key = url.origin + url.pathname;   // ohne ?…, damit auch Aufrufe mit Parametern offline starten
  const net = fetch(r.url, { cache: 'no-cache' });
  // die Kopie entsteht vor der Antwort an die Seite (zuerst angehängt), danach darf die Seite den Inhalt lesen
  e.waitUntil(net.then(res => res.ok && caches.open(CACHE).then(c => c.put(key, res.clone()))).catch(() => {}));
  e.respondWith(caches.match(key).then(hit => {
    if (!hit) return net;
    return Promise.race([net.then(res => res.ok ? res : hit, () => hit), new Promise(ok => setTimeout(() => ok(hit), 4000))]);
  }));
});
