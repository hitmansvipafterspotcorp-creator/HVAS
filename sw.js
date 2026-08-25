// Keeps the app loadable when the internet is not.
//
// The venue's server is the laptop in the room, on the room's own wifi. If the
// venue's INTERNET drops, that server is completely fine and every phone on the
// wifi can still reach it — but until now nobody could load the app to do it,
// because the app itself is served from the public web. A full room, a working
// game, and a blank screen.
//
// NETWORK FIRST, cache second. That order matters and is not the usual PWA
// advice: this app is redeployed constantly and a service worker that serves
// its cache first will happily run last week's build for people. So every
// request goes to the network, the cache is refreshed from whatever comes back,
// and the cache is only read when the network actually fails.
//
// The venue API is never cached. Round state, who is in the lobby, whose turn
// it is — a stale answer to any of those is worse than an honest error, and the
// API is a different origin anyway.

// Stamped at build time by stampBuild() in vite.config.js. It has to change
// every deploy: a browser only installs a new worker when the script's BYTES
// change, and while this was the constant 'hvas-v1' the worker never
// reinstalled — so it never re-primed its cache with the new bundle, and a
// member who went offline kept running whatever build first reached them.
const VERSION = 'hvas-7fc4d81a';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Best effort: one asset 404ing must not stop the worker installing, or a
    // renamed file takes offline support down with it.
    await Promise.allSettled(SHELL.map((u) => cache.add(u)));

    // The shell alone is not enough to run offline, and waiting for normal
    // traffic to fill the cache does not work: on the very first visit this
    // worker is not controlling the page yet, so the bundle and stylesheet go
    // straight to the network and are never seen here. The member would then
    // lose their internet and get index.html with nothing to run.
    //
    // So read index.html and cache what it actually points at. The build hashes
    // those filenames, so they cannot be listed above — but they can be found.
    try {
      const res = await fetch('./index.html', { cache: 'reload' });
      const html = await res.text();
      const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((m) => m[1])
        .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('data:'));
      await Promise.allSettled([...new Set(urls)].map((u) => cache.add(u)));
    } catch { /* offline at install time — normal traffic will fill it in */ }

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop older versions so a redeploy cannot leave two generations of the app
    // fighting over the same cache.
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
    // A worker activating means a real deploy landed. Anything already open is
    // now running the old bundle against a new cache, so tell it — the app
    // decides when it is safe to reload (never mid-performance).
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      c.postMessage({ type: 'hvas-updated', version: VERSION });
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only ever cache this app's own files. Anything else — the venue backend,
  // YouTube, the room directory — must be live or fail honestly.
  if (url.origin !== self.location.origin) return;
  // version.json is how the running app finds out it is out of date. Serving a
  // cached copy would answer "you are current" forever, which is the one answer
  // that makes the whole update check pointless. Always live, or nothing.
  if (url.pathname.endsWith('/version.json')) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // Keep the cache current from real traffic, so whatever the member last
      // loaded successfully is what they get offline.
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      // A navigation with nothing cached for that exact URL still wants the
      // app shell — otherwise a deep link offline is a dead tab.
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw new Error('offline and not cached');
    }
  })());
});
