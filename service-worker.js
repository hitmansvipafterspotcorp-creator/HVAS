'use strict';
const CACHE_NAME = 'hitgear-os-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/hitgear.css',
  '/css/game.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/data/characters.json',
  '/data/venues.json',
  '/data/enemies.json',
  '/runtime/save_system.js',
  '/runtime/vip_status.js',
  '/runtime/input_manager.js',
  '/runtime/combat_engine.js',
  '/runtime/scene_manager.js',
  '/runtime/npc_engine.js',
  '/runtime/mission_engine.js',
  '/runtime/bingo_engine.js',
  '/runtime/quest_engine.js',
  '/runtime/hitgear_os.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return resp;
    }))
  );
});
