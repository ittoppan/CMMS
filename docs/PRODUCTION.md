# CMMS-TOPPAN Production Guide

เอกสารปฏิบัติสำหรับรัน/ดูแลระบบจริง (อ้างอิงจาก build 2026-09-17, BUILD_ID `hdZW7CLyR4LnpYB9mnGoT`)

## สถาปัตยกรรม (2 ชั้น)

```
Browser (PWA)
   │  https://<domain>/  (Next.js standalone :3001)
   │     ├ PWA + SSR + offline (service worker v38)
   │     └ API → /api/* (Next rewrite → apiUrl)  และ IIS :8081 direct (บางเส้นทาง)
   ▼
Next.js :3001  (node server.js จาก .next/standalone)   ← frontend/ build output standalone
   ▼
PHP 8.x / IIS :8081  (site: cmms-tpt, app pool: cmms-tpt)   ← public/ = web root (REST JSON, PDO)
   ▼
MySQL (InnoDB, utf8mb4)   ← time_zone = '+07:00'
```

- **Backend**: `public/` เป็น document root บน IIS. PHP ใช้ `PDO`, output JSON, `PHP_SESSION` (cookie `PHPSESSID`), CSRF ผ่าน `src/csrf.php` บังคับทุก POST/PUT/DELETE.
- **Frontend**: `frontend/` Next.js (Turbopack, `output:'standalone'`). `.next/standalone` ถูก deploy ไปรันเป็น `node server.js` พอร์ต 3001.
- **การ "เปลือก" ของ PWA** (`frontend/public/sw.js`) ทำ cache `cmms-tpt-shell/api/assets/pages-v38-...` — เปลี่ยนเวอร์ชันทุกครั้งที่แก้ UI (อย่าใช้ cache เดิมกับของใหม่).

## สิ่งแวดล้อม ( Environment )

ใช้ `.env` ที่รากโปรเจกต์หรือ environment variables ของเครื่องเท่านั้น — **ห้าม commit secrets** (ดู AGENTS.md). ตัวแปรหลัก:

| ตัวแปร | ใช้ที่ | รายละเอียด |
|---|---|---|
| `DB_*` (host/name/user/pass) | `src/config/db.php` | MySQL (ชี้ value ตาม env หรือค่าเริ่มต้นที่ locked ใน repo) |
| `APP_URL` | `src/config/db.php`, settings | base URL ของเว็บ (เป็น central config — อย่า hardcode IP) |
| `ALLOWED_ORIGINS` | CORS | เครื่องที่อนุญาตเรียก API ข้าม origin (ดู Settings > CORS) |
| `apiUrl` / `PUBLIC_API_BASE` | `next.config.ts` | base ของ API จากมุมมอง Next runtime (`/api`-proxy หรือ absolute) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | automation | แจ้งเตือน start/finish — เก็บจาก env เท่านั้น |
| `CMMS_QA_USER` / `CMMS_QA_PASS` | `scripts/phase20_qa.php` | user สำหรับ test CSRF (ต้องมีสิทธิ์เขียนได้) |
| `CMMS_TEST_USER` / `CMMS_TEST_PASS` | `scripts/phase19_sync_check.php` | user สำหรับ test HTTP idempotency |
| `E2E_USERNAME` / `E2E_PASSWORD` | `frontend/tests/e2e/creds.ts` | user สำหรับ Playwright (set ก่อน `npx playwright test`) |
| `SAGE_*`/DSN | `src/.../Sage300Service` | DSN/ค่าต่อ Sage 300 จำลองหรือจริง |

⚠️ ประวัติ: bot token เคยรั่วใน git history → revoke แล้วครบถ้วน. ห้ามนำค่าจริงใส่ในโค้ด/README/doc นี้.

## Deploy (Production)

```powershell
# 1) build frontend + ยิงไป :3001 + ตรวจ 28 จุด
powershell -ExecutionPolicy Bypass -File scripts/deploy-next.ps1

# 2) restart IIS เพื่อให้ PHP (php.ini) อ่านค่าล่าสุดเมื่อเปลี่ยน
Restart-WebAppPool -Name "cmms-tpt"
```

`deploy-next.ps1` จะ: build → เก็บ BUILD_ID → คัด `.next/standalone` → start/restart `node server.js` → ตรวจ 28 จุด (หน้า login 200, manifest, sw.js มี version, health 200 เป็นต้น). ถ้าตรวจไม่ครบจะแจ้งล้มเหลว — **ห้ามมองข้ามการตรวจนั้น** (กรณีเดิมเคยเจอได้ฝั่งนี้).

ก่อน push ชุดนี้ถูก medicine ด้วย hook `scripts/git-hooks/pre-push`: `design-audit --diff --strict` + `tsc --noEmit` + `next build` (dist แยก เพื่อไม่ชนกับ server ที่รันอยู่) — ติดตั้ง hook: `git config core.hooksPath scripts/git-hooks`.

## Monitoring / Health

| จุด | ผลที่คาด |
|---|---|
| `GET https://<domain>/health` (ผ่าน Next) | `{"status":"ok","timestamp":"...Z","db":"ok"}` (timestamp เป็น UTC โดยตั้งใจ) |
| `GET http://localhost:8081/api/health.php` (direct) | HTTP 200, JSON เดียวกัน |
| หน้า `/health` บน Next | แสดงผล + ตาราง DB/global |

ถ้า `node server.js` ไม่มี กระบวนการ `nextjs.pid` (ใน `%TEMP%\opencode\nextjs.pid`) ชี้ process เก่า → รัน deploy ใหม่. ต้องเหลือ `node server.js` แค่ process เดียว (ดูเหตุการณ์ stale-server: ตัวเก่าค้างถือพอร์ต 3001 จน manifest 404 — kill ตัวค้างก่อน deploy ใหม่).

## ข้อจำกัดที่ยอมรับ (documented)

1. **recharts**: dashboard + analytics ยังโหลด recharts แบบตรง (bundle ใหญ่ขึ้นเล็กน้อย) — หน้า report ใช้ `next/dynamic` แล้ว. จัดการได้ในรอบต่อไปถ้าต้องการ.
2. **CSP ใช้ได้เต็มรูปแบบเฉพาะผ่าน :3001** (Next ฝัง CSP header). ถ้าเปิด `localhost:8081` ตรง (public/ เปล่า) จะไม่มี CSP header นั้น — ควรเข้าใช้งานผ่าน Next หน้าเดียว.
3. **Google Fonts พึ่ง CDN** (`fonts.googleapis.com`/`gstatic`) — ต้องเปิด network ถึง Google สำหรับ font; UI ยัง fallback เป็น `Sarabun`/sans-serif เมื่อตัดเน็ต.
4. **Sage 300**: เชื่อมกับ DSN/เครือข่ายที่กำหนดใน `Sage300Service`; ต้องยืนยันกับ DSN จริงตอน go-live (ดู QA_MATRIX §6).
5. **`public/uploads`** มีไฟล์ภาพ + `Thumbs.db` ติดใน git — ยังไม่ cleanup (ค้างไว้ในรอบบำรุง).