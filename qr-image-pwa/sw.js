// Service Worker : met en cache l'application pour un fonctionnement hors ligne.
// Incrémentez CACHE_VERSION à chaque modification des fichiers listés.

const CACHE_VERSION = 'v3';
const CACHE_NAME = `qr-image-pwa-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './scanner.html',
  './style.css',
  './manifest.json',
  './js/app.js',
  './js/database.js',
  './js/qrcode.js',
  './js/scanner.js',
  './js/utils.js',
  './lib/qrcode.min.js',
  './lib/jsQR.js',
  './images/android-chrome-192x192.png',
  './images/android-chrome-512x512.png',
  './images/android-chrome-maskable-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('qr-image-pwa-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Stratégie « cache d'abord, puis réseau » ; les réponses réseau valides sont ajoutées au cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    // ignoreSearch : scanner.html?id=... doit être servi depuis le cache de scanner.html
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
