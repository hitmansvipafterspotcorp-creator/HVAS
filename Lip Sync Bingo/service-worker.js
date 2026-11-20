/*
 * service-worker.js — Lip Sync Bingo app shell cache.
 *
 * Why this matters: HOTSPOT MODE. Once the app has been opened once
 * with internet (or installed as a PWA), the whole shell — including
 * the PeerJS / QR libraries — is cached, so the game can be hosted
 * and played on a phone hotspot with zero internet and zero servers.
 *
 * Strategy:
 *  - App shell (same-origin): cache-first, filled on install.
 *  - CDN libraries: stale-while-revalidate into a runtime cache.
 *  - YouTube embeds are never cached (they need internet anyway).
 */
var SHELL_CACHE = 'lsb-shell-v13';
var CDN_CACHE = 'lsb-cdn-v13';
var SHELL = [
  './',
  './index.html',
  './style.css',
  './decks.js', './fonts/bricolage.woff2', './fonts/manrope.woff2',
  './js/core.js',
  './js/net.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/logo-header.png',
  './icons/logo-full.png',
  './icons/logo-animated.mp4'
];
var CDN = [
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () {
        // Best effort: pre-cache the CDN libraries too. If one fails
        // (offline install), the app still works for hotspot mode —
        // net.js only needs RTCPeerConnection, which is built in.
        return caches.open(CDN_CACHE).then(function (cache) {
          return Promise.allSettled(CDN.map(function (url) { return cache.add(url); }));
        });
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== SHELL_CACHE && key !== CDN_CACHE) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.hostname.indexOf('youtube') !== -1 || url.hostname.indexOf('googlevideo') !== -1) return;

  if (url.origin === self.location.origin) {
    // App shell: cache-first.
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(event.request).then(function (res) {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function (cache) { cache.put(event.request, copy); });
          return res;
        });
      })
    );
  } else {
    // CDN libraries: stale-while-revalidate.
    event.respondWith(
      caches.match(event.request).then(function (hit) {
        var network = fetch(event.request).then(function (res) {
          var copy = res.clone();
          caches.open(CDN_CACHE).then(function (cache) { cache.put(event.request, copy); });
          return res;
        }).catch(function () { return hit; });
        return hit || network;
      })
    );
  }
});
