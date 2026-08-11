/* ============================================================
   CMMS-TOPPAN Service Worker (PHP app) — PWA shell v3
   ------------------------------------------------------------
   - Navigation: network-first → cache → offline.html → synthesized offline page
   - API (GET /api/*): network-first + cache fallback
   - Static (/css, /js, /icons, /assets): cache-first
   - Install: per-URL precache (URL หนึ่งพัง ไม่ล้มทั้งชุด)
   - ทุก respondWith คืน Response เสมอ (กัน "Failed to convert value to 'Response'")
   ============================================================ */
const SHELL_CACHE = "cmms-tpt-php-shell-v3";
const ASSET_CACHE = "cmms-tpt-php-assets-v3";
const API_CACHE   = "cmms-tpt-php-api-v3";

const PRECACHE_URLS = [
  "/",
  "/login.php",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/css/app.css",
  "/css/daisy-compat.css"
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
    "<!DOCTYPE html><html lang='th'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>CMMS-TPT — Offline</title><style>body{font-family:system-ui,'Sarabun',sans-serif;background:#f1f1f1;color:#262626;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}.card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:40px 32px;max-width:360px;box-shadow:0 2px 4px rgba(0,0,0,.05)}.logo{width:64px;height:64px;border-radius:18px;background:#0D4785;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;margin-bottom:16px}h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#737373;line-height:1.6;margin:0}</style></head><body><div class='card'><div class='logo'>C</div><h1>ไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1><p>ระบบ CMMS-TOPPAN ต้องการเครือข่ายเพื่อโหลดข้อมูล<br>กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง</p></div></body></html>",
    {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/* ---------- Install: precache shell (per-URL) ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ---------- Activate: ล้าง cache เวอร์ชันเก่า ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE && key !== API_CACHE)
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
  if (url.origin !== self.location.origin) return; // CDN/LINE cross-origin

  // 1) API — network-first + cache fallback
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

  // 2) Static — cache-first
  if (/^\/(css|js|icons|assets|uploads)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              cachePut(ASSET_CACHE, request, response.clone());
              return response;
            })
            .catch(() => Response.error())
      )
    );
    return;
  }

  // 3) Navigation — network-first (session/login safe)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(SHELL_CACHE, request, response.clone());
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline.html"))
            .then((res) => res || offlineFallback())
        )
    );
    return;
  }

  // 4) Other same-origin — network-first + cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        cachePut(SHELL_CACHE, request, response.clone());
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
