/* PocketPage offline shell.
 *
 * The whole tool is one HTML file and every client page lives in a URL
 * fragment, which is never sent to a server — so caching that single file is
 * enough to make the builder AND every page you have ever handed out work
 * with no signal at all. That matters: you will be selling in parking lots.
 */
var CACHE = "pocketpage-v1";
var SHELL = ["./", "./index.html"];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   /* QR images etc. go to the network */

  /* Serve the shell immediately, then refresh it in the background so the next
     launch has any update. Never let a failed refresh take the app down. */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function(hit){
      var live = fetch(req).then(function(res){
        if (res && res.status === 200 && res.type === "basic"){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || live;
    })
  );
});
