/* CMMS-TPT Service Worker â€” PWA full-app shell v8
 * à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ:
 *  - Navigation (HTML): network-only â†’ offline.html â†’ synthesized offline page
 *    (à¹„à¸¡à¹ˆà¸„à¸·à¸™à¸«à¸™à¹‰à¸² HTML à¹€à¸à¹ˆà¸²à¸ˆà¸²à¸ cache à¹€à¸”à¹‡à¸”à¸‚à¸²à¸” â€” à¸à¸±à¸™à¹€à¸«à¹‡à¸™à¸«à¸™à¹‰à¸²à¹€à¸à¹ˆà¸²à¸«à¸¥à¸±à¸‡ deploy)
 *  - API (GET /api/v1/*): network-first + cache fallback
 *  - Static assets (/_next/static, /icons): stale-while-revalidate
 *    (à¸¡à¸µ cache â†’ à¹€à¸ªà¸´à¸£à¹Œà¸Ÿà¸—à¸±à¸™à¸—à¸µ + à¸­à¸±à¸›à¹€à¸”à¸•à¸ˆà¸²à¸ network à¹ƒà¸™à¸žà¸·à¹‰à¸™à¸«à¸¥à¸±à¸‡ / à¹„à¸¡à¹ˆà¸¡à¸µ â†’ à¹‚à¸«à¸¥à¸” network)
 *  - Install: precache à¹à¸šà¸š per-URL (URL à¸«à¸™à¸¶à¹ˆà¸‡à¸žà¸±à¸‡ à¹„à¸¡à¹ˆà¸¥à¹‰à¸¡à¸—à¸±à¹‰à¸‡à¸Šà¸¸à¸”)
 *  à¸—à¸¸à¸ respondWith à¸„à¸·à¸™ Response à¹€à¸ªà¸¡à¸­ â€” à¸›à¹‰à¸­à¸‡à¸à¸±à¸™ "Failed to convert value to 'Response'"
 *
 * âš ï¸ à¹€à¸¡à¸·à¹ˆà¸­ deploy UI à¹ƒà¸«à¸¡à¹ˆ à¹ƒà¸«à¹‰ bump SW_VERSION (v8 â†’ v9 ...) à¸«à¸™à¸¶à¹ˆà¸‡à¸šà¸£à¸£à¸—à¸±à¸”à¹€à¸”à¸µà¸¢à¸§:
 *    SW à¹ƒà¸«à¸¡à¹ˆ activate â†’ à¸¥à¹‰à¸²à¸‡ cache à¹€à¸à¹ˆà¸²à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” (activate handler) â†’ à¸žà¸™à¸±à¸à¸‡à¸²à¸™à¹€à¸«à¹‡à¸™à¸‚à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸—à¸±à¸™à¸—à¸µ
 *    à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¸¥à¹‰à¸²à¸‡ cache à¹€à¸­à¸‡ (PwaRegister reload à¸«à¸™à¹‰à¸²à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´à¸œà¹ˆà¸²à¸™ SKIP_WAITING)
 */
const SW_VERSION = "v13-20260824-0708";
const SHELL_CACHE = `cmms-tpt-shell-${SW_VERSION}`;
const ASSET_CACHE = `cmms-tpt-assets-${SW_VERSION}`;
const API_CACHE = `cmms-tpt-api-${SW_VERSION}`;
const PAGE_CACHE = `cmms-tpt-pages-${SW_VERSION}`;

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/* ---------- Offline Routes (PWA) ----------
 * à¸«à¸™à¹‰à¸²à¹€à¸«à¸¥à¹ˆà¸²à¸™à¸µà¹‰à¹€à¸›à¸´à¸”à¸”à¸¹/à¸à¸£à¸­à¸à¹„à¸”à¹‰à¹à¸¡à¹‰à¹„à¸¡à¹ˆà¸¡à¸µà¹€à¸™à¹‡à¸•:
 *  - /repair/request (à¹à¸ˆà¹‰à¸‡à¸‹à¹ˆà¸­à¸¡à¸”à¹ˆà¸§à¸™ â€” LIFF) â€” à¸Ÿà¸­à¸£à¹Œà¸¡ + queue submit à¸­à¸­à¸Ÿà¹„à¸¥à¸™à¹Œ
 *  - /repair/my_tasks (à¸‡à¸²à¸™à¸‚à¸­à¸‡à¸‰à¸±à¸™) â€” à¸”à¸¹à¸£à¸²à¸¢à¸à¸²à¸£à¸‡à¸²à¸™à¸ˆà¸²à¸ cache
 * à¸«à¸™à¹‰à¸²à¹à¸£à¸à¸—à¸µà¹ˆà¸­à¸­à¸™à¹„à¸¥à¸™à¹Œ à¸ˆà¸°à¸–à¸¹à¸à¹€à¸à¹‡à¸š HTML à¸¥à¸‡ PAGE_CACHE à¹à¸¥à¹‰à¸§à¸•à¸­à¸™ offline à¹€à¸ªà¸´à¸£à¹Œà¸Ÿà¸ˆà¸²à¸ cache
 * (à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¸¥à¸´à¸ªà¸•à¹Œ = network-only à¹€à¸”à¸´à¸¡ â€” à¸à¸±à¸™à¹€à¸«à¹‡à¸™à¸«à¸™à¹‰à¸²à¹€à¸à¹ˆà¸²à¸«à¸¥à¸±à¸‡ deploy) */
const OFFLINE_ROUTES = [
  "/repair/request",
  "/repair/my_tasks",
  "/repair/view",
  "/pm_am/checksheet",
];

/* API à¸—à¸µà¹ˆ precache à¸•à¸­à¸™ install â€” à¸Ÿà¸­à¸£à¹Œà¸¡à¹à¸ˆà¹‰à¸‡à¸‹à¹ˆà¸­à¸¡à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ (à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£/à¹à¸œà¸™à¸) */
const PRECACHE_APIS = [
  "/api/v1/asset_registry.php",
  "/api/v1/departments.php",
  "/api/v1/repair.php?reference=codes",
  "/api/v1/menu_permissions.php",
  "/api/v1/pm_am.php",
  "/api/v1/index.php?resource=assets",
];

/* ---------- Helpers ---------- */
function cachePut(cacheName, request, response) {
  if (!response || !response.ok) return;
  caches
    .open(cacheName)
    .then((cache) => cache.put(request, response))
    .catch(() => {});
}

function offlineFallback() {
  return new Response(
    "<!DOCTYPE html><html lang='th'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>CMMS-TPT â€” Offline</title><style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f1f1;color:#262626;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}.card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:40px 32px;max-width:360px;box-shadow:0 2px 4px rgba(0,0,0,.05)}.logo{width:64px;height:64px;border-radius:18px;background:#0D4785;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;margin-bottom:16px}h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#737373;line-height:1.6;margin:0}</style></head><body><div class='card'><div class='logo'>C</div><h1>à¹„à¸¡à¹ˆà¸¡à¸µà¸à¸²à¸£à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸•à¹ˆà¸­à¸­à¸´à¸™à¹€à¸—à¸­à¸£à¹Œà¹€à¸™à¹‡à¸•</h1><p>à¸£à¸°à¸šà¸š CMMS-TOPPAN à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¹€à¸„à¸£à¸·à¸­à¸‚à¹ˆà¸²à¸¢à¹€à¸žà¸·à¹ˆà¸­à¹‚à¸«à¸¥à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥<br>à¸à¸£à¸¸à¸“à¸²à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸à¸²à¸£à¹€à¸Šà¸·à¹ˆà¸­à¸¡à¸•à¹ˆà¸­à¹à¸¥à¸°à¸¥à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡</p></div></body></html>",
    {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/* ---------- Install: precache shell + data APIs (per-URL â€” à¹„à¸¡à¹ˆà¸¥à¹‰à¸¡à¸—à¸±à¹‰à¸‡à¸Šà¸¸à¸”) ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => shell.add(url).catch(() => {}))
      );
      // precache API à¸ªà¸³à¸«à¸£à¸±à¸šà¸«à¸™à¹‰à¸² offline (à¸¥à¹‰à¸¡à¹„à¸¡à¹ˆà¹€à¸›à¹‡à¸™à¹„à¸£ â€” à¸•à¸­à¸™à¸­à¸­à¸™à¹„à¸¥à¸™à¹Œà¸ˆà¸° cache à¹€à¸­à¸‡à¸œà¹ˆà¸²à¸™ fetch handler)
      const api = await caches.open(API_CACHE);
      await Promise.allSettled(
        PRECACHE_APIS.map((url) => api.add(url).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

/* ---------- Message: SKIP_WAITING à¸ˆà¸²à¸à¸«à¸™à¹‰à¸²à¹€à¸§à¹‡à¸š (PwaRegister) ---------- */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ---------- Activate: à¸¥à¹‰à¸²à¸‡ cache à¹€à¸§à¸­à¸£à¹Œà¸Šà¸±à¸™à¹€à¸à¹ˆà¸² ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE && key !== API_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ---------- Fetch ---------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin (CDN, LINE) à¸›à¸¥à¹ˆà¸­à¸¢à¸œà¹ˆà¸²à¸™

  // 1) API â€” network-first + cache fallback (à¸„à¸·à¸™ Response.error() à¹à¸—à¸™ undefined)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(API_CACHE, request, response.clone());
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 2) Static assets â€” stale-while-revalidate (à¹‚à¸«à¸¥à¸”à¹€à¸£à¹‡à¸§ + à¸­à¸±à¸›à¹€à¸”à¸• cache à¹ƒà¸™à¸žà¸·à¹‰à¸™à¸«à¸¥à¸±à¸‡)
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // à¸¡à¸µ cache â†’ à¹€à¸ªà¸´à¸£à¹Œà¸Ÿà¸—à¸±à¸™à¸—à¸µ + à¸”à¸¶à¸‡ version à¹ƒà¸«à¸¡à¹ˆà¸ˆà¸²à¸ network à¸­à¸±à¸›à¹€à¸”à¸• cache (à¸žà¸·à¹‰à¸™à¸«à¸¥à¸±à¸‡)
          fetch(request)
            .then((response) => {
              if (response && response.ok) cachePut(ASSET_CACHE, request, response.clone());
            })
            .catch(() => {});
          return cached;
        }
        // à¹„à¸¡à¹ˆà¸¡à¸µ cache â†’ à¹‚à¸«à¸¥à¸”à¸ˆà¸²à¸ network à¸•à¸²à¸¡à¸›à¸à¸•à¸´ + à¹€à¸à¹‡à¸š cache
        return fetch(request)
          .then((response) => {
            cachePut(ASSET_CACHE, request, response.clone());
            return response;
          })
          .catch(() => Response.error());
      })
    );
    return;
  }

  // 3) Navigation / pages
  //    - à¸«à¸™à¹‰à¸²à¹ƒà¸™ OFFLINE_ROUTES: network-first + cache fallback (à¹€à¸›à¸´à¸”à¸”à¸¹à¹„à¸”à¹‰à¸•à¸­à¸™ offline)
  //    - à¸«à¸™à¹‰à¸²à¸­à¸·à¹ˆà¸™: network-only (à¹„à¸¡à¹ˆà¸„à¸·à¸™ HTML à¹€à¸à¹ˆà¸² â€” à¸à¸±à¸™à¹€à¸«à¹‡à¸™à¸«à¸™à¹‰à¸²à¹€à¸à¹ˆà¸²à¸«à¸¥à¸±à¸‡ deploy)
  if (request.mode === "navigate") {
    const isOfflineRoute = OFFLINE_ROUTES.some((r) => url.pathname === r || url.pathname.startsWith(r + "/"));
    if (!isOfflineRoute) {
      event.respondWith(
        fetch(request).catch(() =>
          caches.match("/offline.html").then((res) => res || offlineFallback())
        )
      );
      return;
    }
    // offline route â€” network-first, à¹€à¸à¹‡à¸š HTML à¸¥à¸‡ PAGE_CACHE, offline à¹€à¸ªà¸´à¸£à¹Œà¸Ÿà¸ˆà¸²à¸ cache
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(PAGE_CACHE, request, response.clone());
          return response;
        })
        .catch(() =>
          caches
            .match(request, { cacheName: PAGE_CACHE })
            .then((cached) => cached || caches.match("/offline.html").then((res) => res || offlineFallback()))
        )
    );
    return;
  }

  // 4) à¸­à¸·à¹ˆà¸™à¹† (à¹„à¸Ÿà¸¥à¹Œ static à¸—à¸±à¹ˆà¸§à¹„à¸›) â€” network-first + cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        cachePut(SHELL_CACHE, request, response.clone());
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

/* ---------- Web Push (PWA push notifications) ---------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) { /* ignore */ }
  const title = data.title || "CMMS-TPT";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
