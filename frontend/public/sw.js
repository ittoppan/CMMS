/* CMMS-TPT Service Worker — PWA full-app shell v8
 * กลยุทธ์:
 *  - Navigation (HTML): network-only → offline.html → synthesized offline page
 *    (ไม่คืนหน้า HTML เก่าจาก cache เด็ดขาด — กันเห็นหน้าเก่าหลัง deploy)
 *  - API (GET /api/v1/*): network-first + cache fallback
 *  - Static assets (/_next/static, /icons): stale-while-revalidate
 *    (มี cache → เสิร์ฟทันที + อัปเดตจาก network ในพื้นหลัง / ไม่มี → โหลด network)
 *  - Install: precache แบบ per-URL (URL หนึ่งพัง ไม่ล้มทั้งชุด)
 *  ทุก respondWith คืน Response เสมอ — ป้องกัน "Failed to convert value to 'Response'"
 *
 * ⚠️ เมื่อ deploy UI ใหม่ ให้ bump SW_VERSION (v8 → v9 ...) หนึ่งบรรทัดเดียว:
 *    SW ใหม่ activate → ล้าง cache เก่าทั้งหมด (activate handler) → พนักงานเห็นของใหม่ทันที
 *    โดยไม่ต้องล้าง cache เอง (PwaRegister reload หน้าอัตโนมัติผ่าน SKIP_WAITING)
 */
const SW_VERSION = "v8";
const SHELL_CACHE = `cmms-tpt-shell-${SW_VERSION}`;
const ASSET_CACHE = `cmms-tpt-assets-${SW_VERSION}`;
const API_CACHE = `cmms-tpt-api-${SW_VERSION}`;

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
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
    "<!DOCTYPE html><html lang='th'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>CMMS-TPT — Offline</title><style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f1f1f1;color:#262626;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}.card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:40px 32px;max-width:360px;box-shadow:0 2px 4px rgba(0,0,0,.05)}.logo{width:64px;height:64px;border-radius:18px;background:#0D4785;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;margin-bottom:16px}h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#737373;line-height:1.6;margin:0}</style></head><body><div class='card'><div class='logo'>C</div><h1>ไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1><p>ระบบ CMMS-TOPPAN ต้องการเครือข่ายเพื่อโหลดข้อมูล<br>กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง</p></div></body></html>",
    {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/* ---------- Install: precache shell (per-URL — ไม่ล้มทั้งชุด) ---------- */
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

/* ---------- Message: SKIP_WAITING จากหน้าเว็บ (PwaRegister) ---------- */
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
  if (url.origin !== self.location.origin) return; // cross-origin (CDN, LINE) ปล่อยผ่าน

  // 1) API — network-first + cache fallback (คืน Response.error() แทน undefined)
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

  // 2) Static assets — stale-while-revalidate (โหลดเร็ว + อัปเดต cache ในพื้นหลัง)
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // มี cache → เสิร์ฟทันที + ดึง version ใหม่จาก network อัปเดต cache (พื้นหลัง)
          fetch(request)
            .then((response) => {
              if (response && response.ok) cachePut(ASSET_CACHE, request, response.clone());
            })
            .catch(() => {});
          return cached;
        }
        // ไม่มี cache → โหลดจาก network ตามปกติ + เก็บ cache
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

  // 3) Navigation / pages — network-only (ไม่คืน HTML เก่าจาก cache — กันเห็นหน้าเก่าหลัง deploy)
  //    offline → แสดงหน้า offline (ไม่ใช่หน้าเก่า)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((res) => res || offlineFallback())
      )
    );
    return;
  }

  // 4) อื่นๆ (ไฟล์ static ทั่วไป) — network-first + cache fallback
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
