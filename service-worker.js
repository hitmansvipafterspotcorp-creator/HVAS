// KILL-SWITCH service worker — temporary, deployed 2026-11-22.
//
// Why this exists: on 2026-11-22 a publish placed a service worker at this
// path (cache "hitgear-os-v45") that the AFTER SPOT app never had before.
// Phones that picked it up may keep serving the broken shell that came with
// it from cache. The app's real service worker lives at sw.js and is not
// touched by this file.
//
// What this does: installs immediately, deletes ALL caches on this origin,
// unregisters ITSELF, and reloads any open app windows so they fetch the
// restored app fresh from the network. Once it has run, this registration
// is gone and nothing of it remains. This file can be deleted from the
// repo afterwards (or left — with no registration pointing at it, it is
// never fetched again).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache on this origin, including this worker's own
      // hitgear-os-v45 cache and any older app caches.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      // Remove this registration entirely.
      await self.registration.unregister();

      // Reload open windows so they load the restored app from the network.
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        clients.map((client) => {
          try {
            return client.navigate(client.url);
          } catch (e) {
            return Promise.resolve();
          }
        })
      );
    })()
  );
});

// Never serve anything from cache while this worker is alive: pass every
// fetch straight to the network so no stale shell can be served in the
// window between install and activation completing.
self.addEventListener('fetch', () => {});
