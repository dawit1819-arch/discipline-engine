/* Koyomi service worker: cache-first shell so it opens instantly offline.
   Bump VERSION after any change or phones keep the old files. */
const VERSION = 'koyomi-v3.0.1';
const ASSETS = ['./', 'index.html', 'css/app.css', 'js/core.js', 'js/ntfy.js', 'js/ai.js', 'js/voice.js', 'js/ui.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && !k.startsWith('de-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.includes('/v2/')) return;
  if (u.origin !== location.origin && !u.host.includes('fonts.g')) return;   // APIs always hit the network
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
