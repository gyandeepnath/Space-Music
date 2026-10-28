// App-shell cache so Space Music opens instantly and works as an installed app.
// Live data and imagery are always fetched from the network.
const CACHE = 'space-music-v2';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/astro.js',
  'js/dj.js',
  'js/engine.js',
  'js/map.js',
  'js/qr.js',
  'js/radio.js',
  'js/sources.js',
  'js/stations.js',
  'js/views.js',
  'vendor/qrcode.mjs',
  'data/land.json',
  'fonts/space-grotesk-latin-400-normal.woff2',
  'fonts/space-grotesk-latin-500-normal.woff2',
  'fonts/space-grotesk-latin-600-normal.woff2',
  'fonts/space-grotesk-latin-700-normal.woff2',
  'fonts/jetbrains-mono-latin-400-normal.woff2',
  'fonts/jetbrains-mono-latin-500-normal.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'art/iss.png',
  'art/earth.png',
  'art/sun.png',
  'art/mars.png',
  'art/deep.png',
  'art/launch.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Same-origin files: serve from cache, refresh in the background.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
