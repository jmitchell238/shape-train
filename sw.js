// Shape Train — bump with GAME_VERSION in js/config.js
const CACHE = 'shape-train-1.0.001';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/save.js',
  './js/audio.js',
  './js/particles.js',
  './js/game.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './apple-touch-icon.png',
  './art/cover.jpg',
];

function precacheAll(cache) {
  return Promise.allSettled(
    ASSETS.map(url =>
      cache.add(url).catch(err => console.warn('[sw] precache failed', url, err))
    )
  );
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(precacheAll).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

function sameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; }
  catch { return false; }
}

function networkFirst(request) {
  return fetch(request).then(res => {
    if (res.ok && sameOrigin(request.url)) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy));
    }
    return res;
  }).catch(() => caches.match(request).then(hit => hit || Response.error()));
}

function cacheFirst(request) {
  return caches.match(request).then(hit => hit ||
    fetch(request).then(res => {
      if (res.ok && sameOrigin(request.url)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    }));
}

function isShell(url) {
  const path = new URL(url).pathname;
  return path.endsWith('.html') || path.endsWith('/') ||
    path.includes('/css/') || path.includes('/js/') ||
    path.endsWith('manifest.webmanifest') || path.endsWith('/sw.js');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!sameOrigin(e.request.url)) return;
  if (e.request.mode === 'navigate' || isShell(e.request.url)) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  e.respondWith(cacheFirst(e.request));
});
