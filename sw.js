const CACHE_NAME = 'cs-helper-v5';

const STATIC_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './app-manifest.yml',
  './libs/js-yaml.min.js',
  './libs/marked.min.js',
  './manifest.json',
  './books/calculators/drug-dilution.html',
  './books/calculators/heparin.html',
  './books/calculators/insulin-bb.html',
  './books/calculators/iv-infusion.html',
  './books/cheatsheets/carotid-doppler.md',
  './books/cheatsheets/cirrhosis.md',
  './books/cheatsheets/prism-setup.md',
  './books/cheatsheets/renal-failure.md',
  './books/icd/diagnoses.json',
  './books/icd/procedures.json',
  './books/protocols/heparin-protocol.md',
  './books/references/drug-formulary.md',
  './books/references/ecg-norms.md',
  './books/references/echo-norms.md',
  './books/scales/cha2ds2-vasc.md',
  './books/scales/has-bled.md',
  './books/scales/nyha.md'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Pre-caching assets...');
      return cache.addAll(STATIC_ASSETS);
    })
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
  if (!event.request.url.startsWith('http')) return;

  // Network First Strategy
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache, ignoring search parameters for data files (md, json)
        return caches.match(event.request, { ignoreSearch: true }).then(cached => {
          if (cached) return cached;
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
