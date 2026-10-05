/*
 * Write Canvas — offline support.
 * Network first, so updates arrive as soon as they're published;
 * the cached copy is used whenever there is no connection.
 */
const CACHE = 'writecanvas-v1';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'js/storage.js',
  'js/markdown.js',
  'js/ui.js',
  'js/books.js',
  'js/chapters.js',
  'js/editor.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })));
});
