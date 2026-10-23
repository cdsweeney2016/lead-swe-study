// Lead SWE Study service worker.
// Bump VERSION on every release so the app shell is re-cached and users see "Update ready".
const VERSION = "2026-10-23.2";
const SHELL_CACHE = "lss-shell-" + VERSION;
const RUNTIME_CACHE = "lss-runtime";

// Paths are relative to this file, so the same files work at /lead-swe-study/ on GitHub Pages or at any other path.
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-maskable.svg"];
// Cached when present; a missing file must not break installation.
const OPTIONAL = ["./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png", "./icons/apple-touch-icon.png"];
// Third-party files the app may load (the TypeScript compiler for code tasks). Cached on first use.
const CDN_HOSTS = ["cdnjs.cloudflare.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })));
    await Promise.all(OPTIONAL.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("lss-shell-") && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over after the user taps "Reload".
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: network first (so online users get the newest index.html), cache when offline.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  // Same-origin files: serve from cache immediately, refresh in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  // Versioned CDN files never change: cache first.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetchWithTimeout(req, 4000);
    if (res && res.ok) cache.put("./index.html", res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) ||
           (await cache.match("./index.html")) ||
           (await cache.match("./")) ||
           new Response("Offline, and the app isn't cached yet. Open it once while online.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => undefined);
  return cached || (await network) || new Response("", { status: 504 });
}

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}
