// Minimal service worker — exists so Chrome/Android treats this as an
// installable PWA (a fetch handler is part of the install-prompt criteria).
// Deliberately does no caching: this app always wants the latest deploy,
// never a stale one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
