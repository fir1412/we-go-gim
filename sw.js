// Offline cache. Bump VERSION whenever app files change.
const VERSION = 'wegogim-v12';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/state.js', './js/db.js', './js/seed.js', './js/engine.js', './js/ui.js', './js/io.js',
  './js/views/today.js', './js/views/workout.js', './js/views/history.js', './js/views/insights.js', './js/views/more.js', './js/views/levels.js', './js/views/setup.js', './js/split.js', './js/feedback.js',
  './fonts/fonts.css', './fonts/barlow-condensed-500.woff2', './fonts/barlow-condensed-600.woff2', './fonts/barlow-condensed-700.woff2', './fonts/dm-sans-var.woff2',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache key without the query string, so ?today=… doesn't create duplicate entries.
const keyFor = url => url.origin + url.pathname;

// App files: network first (so updates arrive) with a 3 s timeout, then cache.
// Fonts and CDN libraries: cache first.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const key = keyFor(url);
    const fromCache = () => caches.match(key).then(r => r || caches.match('./index.html'));
    e.respondWith(new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => { fromCache().then(r => { if (!settled && r) { settled = true; resolve(r); } }); }, 3000);
      // no-cache: always revalidate with the server, so the browser's HTTP cache can't serve stale app files.
      fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
        clearTimeout(timer);
        if (!settled) { settled = true; resolve(res); }
      }).catch(() => {
        clearTimeout(timer);
        fromCache().then(r => { if (!settled) { settled = true; resolve(r || Response.error()); } });
      });
    }));
  } else if (/cdnjs\.cloudflare\.com/.test(url.host)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
      }))
    );
  }
});
