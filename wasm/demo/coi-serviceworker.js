/* Cross-origin isolation shim for hosts that cannot send response headers
 * (GitHub Pages). The wasm build needs SharedArrayBuffer, which needs
 * COOP/COEP; a service worker can add those headers to every response it
 * proxies. First visit: register + one reload, after which the page is
 * crossOriginIsolated. Served with real headers (wasm/serve.py), this file
 * does nothing. */
if (typeof window === "undefined") {
  /* Service-worker context: proxy fetches, stamping the isolation headers. */
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
  /* Offline: keep a copy of the app's own files and the translator library so
   * the Home Screen app opens with no connection. Network first (updates win),
   * cache when offline. The speech model lives in OPFS and the translator
   * weights in transformers.js's own cache, so neither is copied here. */
  const SHELL = "tingdong-shell-v1";
  const keep = (req) => req.method === "GET" && !req.headers.has("range") &&
    (new URL(req.url).origin === self.location.origin ||
     req.url.startsWith("https://cdn.jsdelivr.net/npm/@huggingface/transformers@"));
  const stamp = (res) => {
    if (res.status === 0) return res; /* opaque: pass through untouched */
    const h = new Headers(res.headers);
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
    h.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(res.body, {
      status: res.status, statusText: res.statusText, headers: h,
    });
  };
  self.addEventListener("fetch", (e) => {
    const req = e.request;
    if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
    if (!keep(req)) { e.respondWith(fetch(req).then(stamp)); return; }
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        /* no-cache: revalidate, so an update shows up on the next open
         * instead of after the CDN's 10-minute max-age. */
        const same = new URL(req.url).origin === self.location.origin;
        const res = await fetch(same ? new Request(req, { cache: "no-cache" }) : req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return stamp(res);
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
        if (hit) return stamp(hit);
        throw err;
      }
    })());
  });
} else if (!window.crossOriginIsolated && window.isSecureContext &&
           navigator.serviceWorker) {
  /* Page context, not yet isolated: install the worker and reload once.
   * The sessionStorage guard stops a reload loop if isolation still fails
   * (e.g. an extension interferes). */
  const KEY = "coiReloadedOnce";
  navigator.serviceWorker.register(document.currentScript.src).then((reg) => {
    const reload = () => {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
      location.reload();
    };
    if (reg.active && !navigator.serviceWorker.controller) reload();
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (w) {
        w.addEventListener("statechange", () => {
          if (w.state === "activated" && !navigator.serviceWorker.controller) reload();
        });
      }
    });
    navigator.serviceWorker.ready.then(() => {
      if (!navigator.serviceWorker.controller) setTimeout(reload, 300);
    });
  }).catch((err) => console.warn("coi-serviceworker:", err));
} else if (window.crossOriginIsolated) {
  sessionStorage.removeItem("coiReloadedOnce");
}
