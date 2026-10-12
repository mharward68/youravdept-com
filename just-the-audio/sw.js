// Offline support. Bump VERSION on every release so installed copies pick up the new files.
const VERSION = 'v2.1.2';
const CACHE = 'just-the-audio-' + VERSION;
const FILES = [
  './', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'app/', 'app/licenses.html', 'app/css/styles.css',
  'app/js/app.js', 'app/js/queue.js', 'app/js/engine.js', 'app/js/count.js',
  'app/vendor/mediabunny.min.mjs', 'app/vendor/mediabunny-mp3-encoder.min.mjs', 'app/vendor/LICENSE-mediabunny.txt',
  'app/fonts/montserrat-latin-800-normal.woff2', 'app/fonts/inter-latin-400-normal.woff2',
  'app/fonts/inter-latin-600-normal.woff2', 'app/fonts/inter-latin-700-normal.woff2',
  'app/img/emblem.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('just-the-audio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
