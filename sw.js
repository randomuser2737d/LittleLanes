// Little Lanes service worker: lets the installed app open offline and pick up new versions.
const VERSION = 'little-lanes-3.25';
const CORE = ['./', 'index.html', 'manifest.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // the page itself: try the network first so updates show up, fall back to the saved copy offline
    e.respondWith(fetch(req, {cache: 'no-store'}).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return r; })
      .catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  const path = new URL(req.url).pathname;
  // the game's own scripts: network first (so they always match the page), saved copy when offline
  if (/\.(js|json|html)$/.test(path) && !/\/vendor\//.test(path)) {
    e.respondWith(fetch(req, {cache: 'no-store'}).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req)));
    return;
  }
  // icons and libraries that never change: use the saved copy, fetch and save it the first time
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })));
});
