const CACHE = 'hitgear-v1';
const ASSETS = ['/', '/index.html', '/css/hitgear.css', '/css/game.css',
  '/js/boot.js', '/js/os.js', '/js/game.js', '/js/characters.js',
  '/js/venues.js', '/js/combat.js', '/js/vip-status.js', '/icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
