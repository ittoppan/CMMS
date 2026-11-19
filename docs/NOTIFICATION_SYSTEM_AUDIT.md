# PHASE 00: SYSTEM AUDIT — CMMS SMART PUSH / UNIFIED NOTIFICATION PLATFORM

**วันที่ audit:** 2026-11-19
**Workspace:** `C:\inetpub\wwwroot\cmms-tpt`
**ผู้ตรวจสอบ:** Buffy (agent)

---

## 1. Current Architecture

| ชั้น | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Frontend (canonical) | Next.js 16.2.10 (App Router) + React 19 + TypeScript, port 3001 | `frontend/app` — ทุกโมดูลพอร์ตแล้ว |
| Frontend (legacy) | PHP pages ใน `public/pages/*` เป็น stub 302 ไป Next.js ผ่าน `src/includes/gone_next.php` | ไม่เพิ่มฟีเจอร์ใหม่ที่นี่ |
| Backend | PHP 8.3.36 REST API (PDO), JSON output | `/api/v1/*.php` ยังทำงานทั้งหมด — ห้าม retire |
| Database | MySQL/MariaDB (pdo_mysql) — DB `cmms_tpt`, 256 ตาราง | schema อยู่ใน `database/` + migrations |
| Auth | PHP session + CSRF (`src/csrf.php`) + Role-Based (role_id) | `line_register.php` รองรับ LIFF token |
| Design | Astryx Design System + Tailwind 4 | Corporate Enterprise |

**Business logic ใหม่ต้องอยู่ใน `src/helpers/*` เท่านั้น** (AGENTS.md) — ห้ามก๊อปซ้ำข้ามไฟล์

---

## 2. Existing PWA Status

| รายการ | สถานะ | หลักฐาน |
|---|---|---|
| Web App Manifest | ✅ Implemented | `frontend/public/manifest.webmanifest` (screenshots 2 รูป, icons 192/512) |
| Service Worker | ✅ Implemented | `frontend/public/sw.js` (v96-20261119-1142) |
| Push API / Notification API | ✅ Implemented | `frontend/lib/push.ts`, `/settings/push` page |
| Installable PWA | ✅ Fixed | capture `beforeinstallprompt` ย้ายไป root layout ผ่าน `lib/install-detect.ts` + แบนเนอร์ dismissible |
| Application Icons | ✅ | `/icons/icon-192.png`, `icon-512.png` |
| Application Shortcuts | ⚠️ ไม่พบใน manifest | ต้องเพิ่มถ้าต้องการ (optional) |
| Background Push Event | ✅ | SW `push` handler + `showNotification` + tag/renotify |
| SW Update Management | ✅ | update toast แทน silent reload, idle auto-reload 2 นาที |
| Browser Compatibility Detection | ✅ | `pushSupport()` ใน `/settings/push` (ios-needs-install / unsupported) |

**ข้อจำกัดที่พบ (diagnosed 2026-11-19):** Chrome site notification permission = `denied` บนโปรไฟล์เดสก์ท็อปนี้ → หน้า `/settings/push` อยู่ใน phase "denied" แม้เซิร์ฟเวอร์ส่งสำเร็จ (sent=1) ก็ไม่ขึ้น (ดู `docs`/รายงานก่อนหน้า)

---

## 3. Existing Service Worker Status

- **ไฟล์:** `frontend/public/sw.js`
- **เวอร์ชันล่าสุด:** `v96-20261119-1142` (cache keys `cmms-tpt-*-v96-20261119-1142`)
- **Capabilities:**
  - Install: precache per-URL (Promise.allSettled) + skipWaiting
  - Activate: ล้าง cache เวอร์ชันเก่า + clients.claim
  - Fetch: API network-first + cache fallback; static stale-while-revalidate; navigation network-only (offline route cache fallback); offline.html fallback
  - Message: `SKIP_WAITING`
  - Push: parse JSON/text, `showNotification` (icon/badge/tag/renotify/requireInteraction=false, data.url), try/catch + logging `[SW]`
  - notificationclick: focus/navigate/openWindow
- **Offline routes:** `/repair/request`, `/repair/my_tasks`, `/repair/view`, `/pm_am/checksheet`, `/sync-center`
- **ข้อสังเกต:** ไม่มี background sync / periodic sync; ไม่มี push subscription refresh logic ใน SW (จัดการฝั่ง client)

---

## 4. Backend Compatibility

| รายการ | สถานะ |
|---|---|
| PHP version | 8.3.36 (cli) |
| PDO MySQL | ✅ |
| cURL | ✅ (ใช้ส่ง LINE/Telegram/Teams/ntfy) |
| OpenSSL | ✅ (VAPID/RFC 8291/8188) |
| mbstring | ✅ |
| Composer dependencies | ไม่ใช้ minishlink/web-push — ใช้ `src/services/WebPushService.php` (RFC 8291/8188 เขียนเอง) |
| Web Push Library | ✅ `src/services/WebPushService.php` + VAPID keys ใน settings table |

**Backend ไม่เปลี่ยนเพื่อทำ Push** — ใช้ PHP REST ที่มีอยู่ + helper layer (`src/helpers/*`)

---

## 5. Database Impact Assessment

ตาราง notification ที่มีอยู่แล้ว (ไม่ต้องสร้างซ้ำ):

| ตาราง | สถานะ | หมายเหตุ |
|---|---|---|
| `push_subscriptions` | ✅ | user_id, endpoint, keys_p256dh, keys_auth, created_at, updated_at |
| `notifications` | ✅ | inbox กลาง |
| `notification_events` | ✅ | event_key, dedup |
| `notification_deliveries` | ✅ | per-channel delivery status + attempts + retry |
| `notification_preferences` | ✅ | per-user per-type per-channel enabled |
| `notification_rules` | ✅ | recipients_role (JSON), recipients_user (JSON), channels (JSON), delay_minutes, repeat, dedup_hours, enabled |
| `notification_templates` | ✅ | module, event, title/message/url template, priority, enabled |
| `notification_logs` | ✅ | channel, status, recipient, template, content, raw_response |
| `email_notifications` | ✅ | สำหรับ email queue/history |
| `line_registrations` | ✅ | LINE user mapping |

**ไม่มีตาราง `notification_queue` แยก** — ใช้ `notification_deliveries` (status pending/failed/sent) + `retryPending()` เป็น queue; สถานะที่ใช้จริง: `pending`, `sent`, `failed` (ไม่มี `processing`/`expired`/`cancelled`/`submitted` แยกชัดเจน → gap เล็กน้อย)

Migration scripts อยู่ใน `database/` + `scripts/apply_phase*.php` (idempotent, มี DRY_RUN)

---

## 6. Existing Notification Inventory (5 ช่องทาง)

### 6.1 PWA Push (Web Push / VAPID)
- **สถานะ:** Implemented (channels: `push`)
- **Code:** `src/services/WebPushService.php`, `public/api/v1/push_subscribe.php`, `public/api/v1/notifications.php` (test_push_self, push_status)
- **Frontend:** `/settings/push` (subscribe/unsubscribe/test), `frontend/lib/push.ts`
- **Recipient routing:** ผ่าน `push_subscriptions` filtered by user_id
- **สถานะ config:** VAPID keys ใน settings table (ต้องตรวจสอบว่าตั้งแล้ว)
- **ช่องโหว่:** permission denied บนเดสก์ท็อปนี้ (OS/browser level, ไม่ใช่โค้ด)

### 6.2 Email
- **สถานะ:** Implemented (channels: `email`)
- **Code:** `src/helpers/notification.php` (`sendEmailNotification`), `public/api/v1/email_notify.php`
- **Template:** `email_notifications` table + settings `email_notify_enabled`
- **Config:** SMTP settings (ต้องตรวจสอบ SMTP host/port/credentials)

### 6.3 LINE
- **สถานะ:** Implemented (channels: `line`)
- **Code:** `src/helpers/notification.php` (`sendLinePushMessage`, `sendLineTemplatePush`, `lineTemplateDefaults`, `getLineTemplate`)
- **Template system:** Flex message templates เก็บใน settings (`line_tpl_*`) + variable substitution
- **Config:** `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `line_maintenance_group_id`
- **ข้อสังเกต:** LINE Notify ไม่ใช้ (ยุติแล้ว) — ใช้ Messaging API ถูกต้อง

### 6.4 Telegram
- **สถานะ:** Implemented (channels: `telegram`) แต่ **Configuration Missing**
- **Code:** `sendTelegramMessage()`, `telegramAdminAlert()` ใน `src/helpers/notification.php`
- **Config:** `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (settings หรือ .env) — ยังไม่ได้ตั้ง (ตาม historical memory)
- **หมายเหตุ:** ใช้ได้เฉพาะเมื่อผู้ใช้เริ่มสนทนากับ bot หรืออยู่ในกลุ่ม

### 6.5 Microsoft Teams
- **สถานะ:** Implemented (channels: `teams`)
- **Code:** `sendTeamsOnce()`, `teamsAdminAlert()` ใน `src/services/NotificationCenterService.php` (line 399+) และ `src/helpers/notification.php` (line 840+)
- **Config:** `TEAMS_WEBHOOK_URL` (settings หรือ env) — ต้องตรวจสอบว่าตั้งแล้ว
- **Frontend:** settings/notifications page มี tab Teams + test button (`teams_test`)
- **ข้อสังเกต:** ใช้ Incoming Webhook (Adaptive Card) — ต้องตรวจสอบว่า org ยังรองรับ

### 6.6 ntfy (bonus channel)
- **สถานะ:** Implemented (channels: `ntfy`)
- **Code:** `src/helpers/ntfy.php`, settings `ntfy_*`
- **Frontend:** settings/notifications รองรับ

### 6.7 Unified Engine / Queue / Rules
- **Engine:** `scripts/notification_engine.php` (CLI) — ตรวจ PM, low stock, SLA, escalation, calibration, inspection, retry
- **Service:** `src/services/NotificationCenterService.php` — `notify()`, `retryPending()`, recipient routing, per-channel dispatch, delivery logging
- **Rules:** `notification_rules` + `engApplyRule()` (roles/users/channels/delay/repeat/dedup)
- **Templates:** `notification_templates` (module:event) — ใช้กับทุกโมดูล
- **Preferences:** `notification_preferences` (per-user per-type per-channel)
- **Cron/Task Scheduler:** `CMMS-DailyDigest` (06:00), `CMMS-AlertCheck` (06:30) สร้างแล้ว

---

## 7. Required Dependencies

| ไลบรารี | สถานะ | หมายเหตุ |
|---|---|---|
| PHP cURL | ✅ installed | ใช้ส่งทุกช่องทาง |
| PHP OpenSSL | ✅ installed | VAPID |
| PHP PDO MySQL | ✅ installed | DB |
| minishlink/web-push | ❌ ไม่ใช้ | ใช้ WebPushService เขียนเอง (RFC 8291/8188) |
| Composer | ไม่จำเป็น | ไม่มี dependency ภายนอกสำหรับ push |
| Node (frontend) | ✅ Next.js 16 | PWA/SW |

**ไม่ต้องติดตั้ง dependency เพิ่ม** — ระบบใช้ built-in PHP + cURL

---

## 8. Implementation Plan / Gaps

### 8.1 สิ่งที่ทำได้แล้ว (Implemented)
- PWA foundation + SW + Push subscription + VAPID
- Unified notification engine (7 channels ใน code)
- Notification templates + rules + preferences + deliveries + events + logs
- Recipient routing (roles/users/departments)
- Admin settings page (channels config + test send)
- User preferences page
- Analytics/dashboard data (notification counts)
- Queue + retry (retryPending)
- Cron/Task Scheduler

### 8.2 Gaps / Partial
| # | Gap | ระดับ | ข้อเสนอ |
|---|---|---|---|
| G1 | Telegram config ยังไม่ตั้ง (token/chat_id) | Config Missing | ตั้งค่าใน .env/settings |
| G2 | Teams webhook อาจยังไม่ตั้ง | Config Missing | ตั้งค่า TEAMS_WEBHOOK_URL |
| G3 | Email SMTP config ต้องตรวจสอบ | Config Missing | ตรวจสอบ settings email_* |
| G4 | Delivery status ไม่มี `processing`/`expired`/`cancelled`/`submitted` แยกชัดเจน (ใช้ pending/sent/failed) | Partial | เพิ่ม enum ถ้าต้องการตาม spec |
| G5 | ไม่มี `notification_queue` ตารางแยก (ใช้ deliveries เป็น queue) | Partial | ยอมรับได้ — deliveries ทำหน้าที่ queue |
| G6 | Notification bell/dropdown ใน header | ต้องตรวจสอบว่ามีหรือไม่ | ค้นหา frontend components |
| G7 | Deep link จาก notification ไปยัง entity | ✅ มี url_template | ตรวจสอบทุก template |
| G8 | iOS Home Screen PWA push | ต้องทดสอบจริง | ไม่มีอุปกรณ์ iOS ในสภาพแวดล้อมนี้ |
| G9 | Channel health dashboard / analytics UI | Partial | ตรวจสอบ frontend pages |
| G10 | Idempotency key / duplicate prevention | ✅ มี event_key + dedup_hours | — |
| G11 | Exponential backoff | ⚠️ retryPending ใช้ maxAttempts คงที่ | ปรับเป็น exponential ถ้าต้องการ |
| G12 | Quiet Hours | ❌ ไม่พบ | เพิ่มใน preferences ถ้าต้องการ |
| G13 | Application Shortcuts ใน manifest | ❌ ไม่มี | optional |
| G14 | Background sync / periodic sync | ❌ ไม่มี | optional |

### 8.3 ลำดับงานที่แนะนำ (Phase ถัดไป)
- **PHASE 01:** ตรวจสอบ/เติม manifest shortcuts + SW push subscription refresh
- **PHASE 02:** ตั้งค่า config ที่ขาด (Telegram, Teams, Email SMTP, VAPID verify)
- **PHASE 03:** ปรับ delivery status enum ให้ตรง spec (submitted/pending/processing/failed/expired/cancelled) — additive migration
- **PHASE 04:** เพิ่ม Quiet Hours + per-channel notification preferences UI เต็มรูป
- **PHASE 05:** Channel health dashboard + analytics (Filter ตามวันที่/department/type)
- **PHASE 06:** Recipient management UI (multi-group multi-channel)
- **PHASE 07:** Message template engine preview + variable validation
- **PHASE 08:** CMMS event integration audit (work order/PM/SLA/inventory triggers ครบทุก event)
- **PHASE 09:** Security audit (CSRF, rate limit, ownership validation, audit log)
- **PHASE 10:** End-to-end testing (ทุก channel จริง)
- **PHASE 11:** Production deployment (HTTPS, domain, backup, monitoring)

---

## 9. Security Assessment

| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| CSRF protection | ✅ | `src/csrf.php` — ทุก POST/PUT/DELETE |
| VAPID private key protection | ✅ | เก็บใน settings table, ไม่ส่ง frontend |
| API tokens ใน frontend | ❌ ไม่มี | อ่านจาก .env/settings เท่านั้น |
| Hardcoded secrets | ⚠️ ต้อง scan | ตรวจสอบว่าไม่มี token ใน source (เคยมี bot token รั่วใน git history — revoke แล้ว) |
| Role-based access | ✅ | role_id + menu_permissions |
| Department-based access | ✅ | มีในหลายโมดูล |
| Subscription ownership validation | ✅ | push_subscribe.php ใช้ session user_id |
| Rate limiting | ⚠️ ต้องตรวจสอบ | ค้นหา rate limit ใน API |
| Audit logging | ✅ | `src/helpers/audit.php`, audit_logs table |
| Sensitive data ใน notification | ⚠️ ต้อง review | ตรวจสอบว่าข้อความไม่เปิดเผยข้อมูลลับบน lock screen |
| Input validation | ✅ | หลาย endpoint มี validation |

---

## 10. Deployment Requirements

| รายการ | สถานะ/ข้อกำหนด |
|---|---|
| HTTPS (production) | ✅ จำเป็นสำหรับ Push API — ใช้ Cloudflare Tunnel / zrok ตอนนี้ |
| Domain | cmms-tpt.shares.zrok.io (dev) — production ต้อง domain จริง |
| PWA manifest + SW | ✅ serve ได้ (HTTP 200, MIME ถูก) |
| Cron / Task Scheduler | ✅ CMMS-DailyDigest (06:00), CMMS-AlertCheck (06:30) |
| Database backup | มี scripts/backup.sh |
| Monitoring | ❌ ยังไม่มี (Sentry frontend มี, backend ไม่มี) |
| Environment variables | `.env` (DB_*, TELEGRAM_*, LINE_*, TEAMS_*, NTFY_*, APP_URL) |
| Frontend deploy | `frontend/deploy.ps1` (build + copy + restart :3001) |

---

## 11. สรุปและคำแนะนำ

ระบบ CMMS ปัจจุบัน **มี notification platform ที่ mature มากแล้ว** — 7 channels ใน code (app, line, email, telegram, teams, ntfy, push), unified engine, rules, templates, preferences, deliveries, retry, cron. งานที่เหลือส่วนใหญ่เป็น **config (Telegram/Teams/Email), UX completion (bell dropdown, health dashboard, quiet hours), และ testing จริง** ไม่ใช่การสร้างใหม่.

**ขั้นตอนถัดไปที่แนะนำ:** ให้ผู้ใช้เลือก Phase ที่ต้องการดำเนินการ (ดู §8.3) หรือระบุ gap ที่ต้องการปิดก่อน — ผมจะไม่เริ่ม implement ทั้งหมดในครั้งเดียวเพราะ scope ใหญ่มาก (11 phases) และต้องทดสอบจริงแต่ละช่องทาง

---

*รายงานนี้สร้างจาก source code จริง (ไม่ใช่ mockup) — ตรวจสอบผ่าน code_search, DB query, และไฟล์จริง*