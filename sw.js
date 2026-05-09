const CACHE_NAME = 'cs-helper-v1';
 
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './app-manifest.yml',
  'https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js',
  'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js'
];
 
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});
 
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
 
self.addEventListener('fetch', event => {
  // Skip non-http(s) requests (chrome-extension, data:, etc.)
  if (!event.request.url.startsWith('http')) return;
 
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        // Only cache http(s) requests
        if (!event.request.url.startsWith('http')) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
