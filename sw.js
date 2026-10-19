/* =====================================================================
   DISCIPLINE ENGINE — service worker

   Cache-first for the shell so the app opens instantly and works with no
   signal. Google Fonts are cached opportunistically on first load, which
   is what makes the app fully offline from the second launch onward.
   API calls (Gemini, ntfy) always go to the network.
   ===================================================================== */

const VERSION = 'de-v2.1-public-clean-1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/data.js',
  'js/store.js',
  'js/money.js',
  'js/notify.js',
  'js/vision.js',
  'js/ui.js',
  'js/money-ui.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // addAll fails the whole install if any single file 404s; be tolerant
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // never cache the APIs
  if (url.hostname.includes('generativelanguage.googleapis.com') ||
      url.hostname.includes('ntfy.sh')) return;

  // fonts: stale-while-revalidate into the runtime cache
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(request).then(hit => {
        const net = fetch(request).then(res => {
          if (res.ok || res.type === 'opaque') {
            caches.open(RUNTIME).then(c => c.put(request, res.clone()));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // app shell: cache first, refresh in the background
  e.respondWith(
    caches.match(request).then(hit => {
      const net = fetch(request).then(res => {
        if (res.ok) caches.open(SHELL).then(c => c.put(request, res.clone()));
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    })
  );
});

/* Tapping a reminder should focus the open app rather than spawning tabs. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
