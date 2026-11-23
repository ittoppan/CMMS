# PHASE 10 — TECHNICIAN & MOBILE EXPERIENCE — AUDIT & EVIDENCE

> วันที่ audit: 2026-11-23 (production build `:3001`, standalone `frontend/.next/standalone`)
> บัญชีทดสอบ: `e2e_bot` (`.e2e-auth.json`)
> Scope: หน้าเทคนิค/มือถือ + PWA installability + offline fallback
> สถานะ: **IN PROGRESS** (audit + targeted verification เสร็จ; push ทดสอบต้อง HTTPS — BLOCKED ต่อ Phase 11)

## 1. Scope & Pages Audited

| Route | บทบาท | หมายเหตุ |
|---|---|---|
| `/field` | โหมดภาคสนาม (technician home) | QR scan, งานมอบหมาย, PM เกินกำหนด, สแกนล่าสุด |
| `/repair/my_tasks` | งานของฉัน | offline snapshot, close-WO modal, signature |
| `/repair/request` | แจ้งซ่อมด่วน | offline queue, LIFF-friendly |
| `/sync-center` | ศูนย์ซิงก์ | connectivity, queue |
| `/scan` | สแกน QR/barcode | `@zxing` |
| `/pm_am/checksheet` | เช็คชีท PM | offline-capable route |
| `/install` | ติดตั้ง PWA | public, no login |
| PWA: manifest + SW + offline.html | installability | see §4 |

## 2. Responsive Audit (390 / 768 / 1440 px)

Method: Playwright (`tests/e2e/tmp-phase10.spec.ts`) against production build `:3001`,
authenticated session, measure `document.documentElement.scrollWidth` vs `clientWidth`,
count `h1`, collect console/page errors per viewport.

| Viewport | Pages tested | Horizontal overflow | h1 count | Console/page errors |
|---|---|---|---|---|
| 390 (mobile) | 6 | 0 / 6 | 1 each | 0 |
| 768 (tablet) | 6 | 0 / 6 | 1 each | 0 |
| 1440 (desktop) | 6 | 0 / 6 | 1 each | 0 |

Result: **PASS** — ไม่มี horizontal overflow ทั้ง 3 breakpoints, h1 เดียวต่อหน้า, ไม่มี console error.

## 3. Touch Target Audit (≥ 44 px)

Method: DOM measurement of `button, a, [role=button]` bounding boxes on `/field` at 390 px.

Result: **PASS** — ไม่มี element ที่ touch target < 44 px (empty list).
ปุ่มหลัก (สแกน QR 64 px, grid 2-col 56 px) ใหญ่พอสำหรับการใช้งานหน้างาน.

## 4. PWA Installability

### 4.1 Manifest (`/manifest.webmanifest`) — HTTP 200

Verified fields:
- `name`, `short_name`, `description` ✓
- `start_url: "/"`, `scope: "/"`, `display: "standalone"` ✓
- `orientation: "portrait"`, `lang: "th"` ✓
- `background_color`, `theme_color: #0068B5` ✓
- icons: 192×192 (`any`) + 512×512 (`any` + `maskable`) ✓
- shortcuts: dashboard / repair-request / checksheet / calendar ✓
- screenshots: desktop (wide) + mobile (narrow) ✓

Manifest passes installability criteria (name + icons 192 & 512 + start_url + display).

### 4.2 Service Worker

- Registration on production build: **registered** (Playwright `navigator.serviceWorker.getRegistration()` → "registered").
- `PwaRegister` registers only in production (dev excluded by design).
- SW version `v132-20261120-1622`; activate handler clears old caches.
- Offline routes declared: `/repair/request`, `/repair/my_tasks`, `/repair/view`, `/pm_am/checksheet`, `/sync-center` (network-first + PAGE_CACHE fallback).
- Push handlers present: `push`, `notificationclick`, `pushsubscriptionchange`.
- `offline.html` fallback exists and is precached.

### 4.3 Offline Capability (honest status)

- Offline read: หน้าใน OFFLINE_ROUTES เปิดจาก cache ได้ (network-first + fallback).
- Offline write: `my_tasks` / `repair/request` ใช้ `sendOrEnqueue` + `snapshotSave`/`snapshotLoad` + `syncEngine` (IndexedDB queue) — รองรับจริง.
- ไม่อ้างว่า offline sync ครอบคลุมทุก module — เฉพาะ routes ที่ประกาศไว้.

### 4.4 Push Notification

- Backend endpoint `/api/v1/push_subscribe.php` (VAPID) + permission flow at `/settings/push`.
- `pushSupport()` แยก iOS-needs-install case ถูกต้อง.
- **ทดสอบ push จริงยังไม่ได้** — ต้อง HTTPS (blocked by Phase 11 / TLS ยังไม่เปิด).

## 5. Known Issues / Not Covered

- Push end-to-end (subscribe + receive) — BLOCKED on HTTPS (Phase 11).
- QR scan camera permission on iOS Safari — ยังไม่ทดสอบบนอุปกรณ์จริง (ต้อง manual UAT).
- `/field/work/[id]` detail page mobile — ยังไม่ได้วัด (route อาจ redirect ตาม id); ไม่พบ overflow ใน routes ที่วัดได้.
- Tablet 768 px ของ `/pm_am/checksheet` form (input จำนวนมาก) — ยังไม่ได้ audit รายละเอียด UX (Phase 7 BLOCKED เนื่องจากข้อมูล PM เป็น seed).
- Lighthouse PWA score ยังไม่รัน (ต้อง HTTPS / production domain).

## 6. Acceptance Criteria (Phase 10)

- [x] Responsive 390/768/1440 ไม่มี horizontal overflow (6 pages × 3 viewports)
- [x] Touch target ≥ 44 px บน `/field`
- [x] PWA manifest valid (icons 192/512, display, start_url)
- [x] Service worker registers on production build
- [x] Offline fallback routes declared + offline.html precached
- [x] Offline write queue ใช้งานได้ (sendOrEnqueue / syncEngine)
- [ ] Push end-to-end — BLOCKED (HTTPS)
- [ ] Lighthouse PWA — BLOCKED (HTTPS)
- [ ] Manual device UAT (iOS/Android) — pending

## 7. Evidence

- Playwright log: `/tmp/p10b.log` (5 passed, 0 failed, 52.3 s)
- Manifest response: HTTP 200, valid JSON (name/short_name/start_url/display/icons)
- SW status: `registered`
- Touch targets: empty (all ≥ 44 px)
- Screenshots: (none captured this run; visual verification not performed per scope)

## 8. Files Changed

- None (audit only). No code change required — existing mobile/PWA implementation passes the measured criteria.
- Tracker updated: Phase 10 → IN PROGRESS (audit complete, push/Lighthouse blocked on HTTPS).

## 9. Next Steps

1. HTTPS/TLS เปิด (Phase 11 blocker) → รัน push E2E + Lighthouse PWA.
2. Manual device UAT (iOS Safari install, Android Chrome install, offline airplane-mode test).
3. Phase 7 PM data (unblock) → audit checksheet UX รายละเอียด.
4. Phase 9 remaining (P9-1 XLSX streaming cap 50k, P9-2 role 403 UI, P9-3 vacuous parity, P9-4a/b/c).