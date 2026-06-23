'use strict';
// Relative paths so the SW works whether hosted at domain root or a /subpath/
// (e.g. GitHub Pages project sites) and inside packaged TWA / Xbox PWA shells.
const CACHE_NAME = 'hitgear-os-v7';
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
  './runtime/char_renderer.js',
  './runtime/loading_screen.js',
  './runtime/versus_engine.js',
  './runtime/hitgear_os.js',
  './assets/venues/cafe8fifty_exterior.png',
  './assets/venues/hvas_interior.png',
  './assets/venues/kingdom_come_saloon.png',
  './assets/venues/kingdom_come_exterior.png',
  './assets/venues/outta_interior.png',
  './assets/venues/outta_exterior.png',
  './assets/venues/tally_exterior.png',
  './assets/venues/tally_den.png',
  './assets/venues/tally_itus.png',
  './assets/venues/tally_sammys.png',
  './assets/venues/tally_public_hall.png',
  './assets/venues/tally_13rave.png',
  './assets/venues/dukes_interior.png',
  './assets/venues/dukes_exterior.png',
  './assets/venues/qhf_exterior.png',
  './assets/venues/qhf_pack_07_exterior_bg.png',
  './assets/venues/dukes_pack_07_exterior_bg.png',
  './assets/venues/dukes_pack_08_interior_bg.png',
  './assets/venues/tally_pack_02_exterior_stage.png',
  './assets/venues/kcs_pack_08_interior_bg.png',
  './assets/venues/clean/kcs_interior_clean.png',
  './assets/venues/clean/dukes_interior_clean.png',
  './assets/venues/clean/publichall_interior_clean.png',
  './assets/venues/clean/itus_interior_clean.png',
  './assets/venues/clean/den_interior_clean.png',
  './assets/venues/clean/sammys_interior_clean.png',
  './assets/venues/clean/rave_interior_clean.png',
  './assets/venues/clean/tallyrow_exterior_clean.png',
  './assets/characters/creator_sheet01_loco.png',
  './assets/characters/creator_sheet02_combat.png',
  './assets/characters/creator_sheet03_damage.png',
  './assets/characters/creator_sheet04_supers.png',
  './assets/characters/creator_sheet05_topdown.png',
  './assets/characters/creator_sheet06_vfx.png',
  './assets/characters/dj_sheet01_loco.png',
  './assets/characters/dj_sheet02_combat.png',
  './assets/characters/dj_sheet03_damage.png',
  './assets/characters/dj_sheet04_supers.png',
  './assets/characters/dj_sheet05_topdown.png',
  './assets/characters/dj_sheet06_vfx.png',
  './assets/characters/vendor_sheet02_combat.png',
  './assets/characters/vendor_sheet03_damage.png',
  './assets/characters/vendor_sheet04_supers.png',
  './assets/characters/vendor_sheet05_topdown.png',
  './assets/characters/vendor_sheet06_vfx.png',
  './assets/characters/security_sheet02_combat.png',
  './assets/characters/security_sheet03_damage.png',
  './assets/characters/security_sheet04_supers.png',
  './assets/characters/security_sheet05_topdown.png',
  './assets/characters/security_sheet06_vfx.png'
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
