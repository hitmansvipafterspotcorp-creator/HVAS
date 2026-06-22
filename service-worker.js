'use strict';
// Relative paths so the SW works whether hosted at domain root or a /subpath/
// (e.g. GitHub Pages project sites) and inside packaged TWA / Xbox PWA shells.
const CACHE_NAME = 'hitgear-os-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/hitgear.css',
  './css/game.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './data/characters.json',
  './data/venues.json',
  './data/enemies.json',
  './runtime/save_system.js',
  './runtime/vip_status.js',
  './runtime/input_manager.js',
  './runtime/asset_loader.js',
  './runtime/sprite_system.js',
  './runtime/combat_engine.js',
  './runtime/fighter_engine.js',
  './runtime/scene_manager.js',
  './runtime/stage1_scene.js',
  './runtime/npc_engine.js',
  './runtime/mission_engine.js',
  './runtime/bingo_engine.js',
  './runtime/quest_engine.js',
  './runtime/story_mode.js',
  './runtime/versus_engine.js',
  './runtime/hitgear_os.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // addAll is atomic — one 404 rejects the whole batch, so cache individually
      .then(cache => Promise.all(CORE_ASSETS.map(u =>
        cache.add(u).catch(() => { /* tolerate a missing optional asset */ })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first, then network with runtime caching (covers all the lazy-loaded art).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
