# Phase 10 (ต่อ) — PWA manual audit (manifest + Service Worker)

> วันที่: 2026-11-23 · ทำเพราะ Lighthouse 12 ไม่มีหมวด PWA (L11-2) → ตรวจด้วยมือ
> วิธี: ตรวจไฟล์จริง + โค้ด registration + รายการ precache + ความสอดคล้องกับ manifest

## 1. Web App Manifest — ผ่าน (valid JSON, ครบทุกฟิลด์ที่จำเป็น)

| ฟิลด์ | ค่า | สถานะ |
|---|---|---|
| `name` / `short_name` | CMMS-TOPPAN — ระบบบริหารงานซ่อมบำรุง / CMMS-TOPPAN | ✔ |
| `start_url` / `scope` | `/` / `/` | ✔ |
| `display` | `standalone` | ✔ |
| `orientation` | `portrait` | ✔ |
| `lang` / `dir` | `th` / `ltr` | ✔ |
| `theme_color` / `background_color` | `#0068B5` / `#0068B5` | ✔ |
| `categories` | business, productivity | ✔ |
| `icons` | 192 any, 512 any, 512 maskable | ✔ ไฟล์มีจริง (`public/icons/icon-192.png`, `icon-512.png`) |
| `screenshots` | desktop 1280×720 wide + mobile 390×844 narrow | ✔ ไฟล์มีจริง (`public/screenshots/desktop.png`, `mobile.png`) |
| `shortcuts` | 4 รายการ (แดชบอร์ด, แจ้งซ่อม, เช็คชีท PM, ปฏิทิน PM) | ✔ ชี้ URL จริง |
| `id` | `/` | ✔ |

## 2. Service Worker — ผ่านเชิงโครงสร้าง (SW v132)

`public/sw.js` (SW_VERSION = `v132-20261120-1622`):
- **precache** 16 ไฟล์ (offline.html, manifest, icons 2 ตัว, ฟอนต์ Sarabun 12 ชุด) — per-URL ไม่ล้มทั้งชุด
- **Navigation (HTML):** network-only → `offline.html` → synthesized offline page (กันเห็นหน้าเก่าหลัง deploy)
- **API (GET /api/v1/*):** network-first + cache fallback
- **Static assets (/_next/static, /icons):** stale-while-revalidate
- **activate handler:** ล้าง cache เก่าทั้งหมดเมื่อ version เปลี่ยน
- **SKIP_WAITING** + `controllerchange` → reload อัตโนมัติผ่าน `PwaRegister.tsx`
- ทุก `respondWith` คืน `Response` เสมอ

## 3. Registration — ผ่าน

- `app/layout.tsx:12` → `manifest: "/manifest.webmanifest"` (Next metadata API)
- `components/PwaRegister.tsx:107-125` → ลงทะเบียน SW เมื่อ `"serviceWorker" in navigator`, จัดการ `controllerchange` (reload) และ `PUSH_SUBSCRIPTION_CHANGED` (re-subscribe)
- Install banner: แสดงหลัง 2.5 s เมื่อ `!standalone && isSecureContext && !dismissed`
- Push: subscribe/rotate handling อยู่ใน SW + PwaRegister

## 4. ยังไม่ได้ตรวจ (ต้องอุปกรณ์จริง / HTTPS)

- **Offline จริง:** ยังไม่ได้ตัดเน็ตแล้วเปิดหน้า (ต้องทดสอบบนอุปกรณ์ + ปิด Wi-Fi)
- **Install prompt (A2HS):** ยังไม่ได้กด install บน Chrome Android/Desktop
- **Push notification:** ยังไม่ได้ส่งจริง (ต้อง HTTPS + VAPID keys)
- **HTTPS:** บน localhost ไม่จำเป็น แต่ production ต้องมี TLS (Phase 11 blocker)
- **SW update flow:** ยังไม่ได้ bump version แล้วดู reload อัตโนมัติ
- **Lighthouse PWA category:** ถูกถอดใน Lighthouse 12 → วัดด้วยมือเท่านี้

## 5. ข้อสังเกต (ไม่ใช่ finding)

- `orientation: "portrait"` → บน tablet/desktop standalone อาจถูกล็อกแนวตั้ง (minor)
- `screenshots` ชี้ `/screenshots/desktop.png` ที่มีอยู่จริง (ตรวจสอบแล้ว)
- manifest `dir: "ltr"` ขณะที่ UI ภาษาไทย (RTL ไม่จำเป็น; ไทยเป็น LTR)

## 6. สรุป

PWA ผ่านเชิงโครงสร้าง (manifest valid, SW registered, precache/offline fallback ครบ, push handling ครบ) — **ยังไม่ได้ทดสอบ runtime จริง** (offline/install/push) ต้องอุปกรณ์จริง + HTTPS ซึ่งอยู่ใน Phase 11 blocker
EOF
echo "written"; wc -l docs/PHASE_10_PWA_REPORT.md