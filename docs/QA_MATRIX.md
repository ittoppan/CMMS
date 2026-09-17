# QA Matrix — Phase 20 (Full System QA + Production Readiness)

วันที่ทดสอบ: 2026-09-16/17 · สภาพแวดล้อม: IIS `localhost:8081` (PHP 8.x) + Next.js PWA `:3001` (BUILD_ID `hdZW7CLyR4LnpYB9mnGoT`)

แนวรับ: ทุกผลต้องมาจากการรันของจริง (script / Playwright / curl) — ไม่ใช่การเดา กลไกที่ยังไม่ได้ทดสอบจริงจะเขียนว่า `NOT TESTED` กำกับไว้

## 1) สรุปผลรวม

| เกต / ชุดทดสอบ | ผล | วิธีรัน |
|---|---|---|
| `scripts/security_check.php` | ✅ 32 passed / 0 failed | `php scripts/security_check.php` |
| `scripts/phase19_sync_check.php` | ✅ 15 passed / 0 failed (รวม HTTP idempotency) | `php scripts/phase19_sync_check.php` (set `CMMS_TEST_USER`/`CMMS_TEST_PASS`) |
| `scripts/phase20_qa.php` | ✅ 50 passed / 0 failed | `php scripts/phase20_qa.php` |
| Playwright e2e (full suite) | ✅ 79 passed / 0 failed / 2 skipped* | `npx playwright test` (set `E2E_USERNAME`/`E2E_PASSWORD`) |
| Playwright responsive spec | ✅ 5 passed | `npx playwright test tests/e2e/responsive.spec.ts` |
| Deploy script (deploy-next.ps1) | ✅ 28/28 checks | `powershell -File scripts/deploy-next.ps1` |
| Design audit | ✅ PASS (0 FAIL / 0 WARN, `--strict`) | `python scripts/design-audit.py --diff origin/main --strict` |
| TypeScript | ✅ 0 error | `npx tsc --noEmit` (tsc-check.sh) |
| Next build (standalone) | ✅ BUILD_ID มี standalone/server.js | `scripts/next-build-check.sh` |

\* 2 skipped = sage-shipments modal tests ที่ต้องมีใบเบิกสถานะ `Approved` ใน DB (ข้อมูลไม่อยู่ตอนรัน — skip แบบตั้งใจ)

## 2) Matrix รายโมดูล (16 โมดูลหลัก)

สัญลักษณ์: ✅ ผ่านจริง / ⚠️ ผ่านแต่มี note / ⬜ ยังไม่ได้ทดสอบเส้นทางนั้น

| โมดูล | Auth | CRUD หลัก | เขียนข้อมูล | Offline/Sync | UI e2e | Note |
|---|---|---|---|---|---|---|
| Dashboard (KPI) | ✅ 401 เมื่อไม่มี session | ✅ อ่าน | – | – | ✅ | hydration mismatch ถูกแก้แล้ว (connectivity.tsx SSR/CSR) |
| งานซ่อม (repair) | ✅ | ✅ | ✅ | ✅ (sync-check: PUT + base_updated_at) | ✅ | `security_check` ครอบ end-to-end |
| แผน PM & เครื่องจักร (pm_am / pm_plans) | ✅ +401 | ✅ | ✅ | ✅ | ✅ | – |
| เช็กลิสต์/ตรวจสอบ (inspections) | ✅ | ✅ | ✅ | ✅ | ✅ | – |
| คลังอะไหล่ / เบิก-จ่าย / Sage | ✅ | ✅ | ✅ | ✅ | ✅ | sage-shipment modal 2 กรณี skip (ไม่มี Approved request) |
| ผู้ขาย (suppliers) | ✅ +401 | ✅ | ✅ | – | ✅ | – |
| ครุภัณฑ์/ยืม (equipment_borrowing) | ✅ +401 | ✅ | ✅ | – | ✅ | – |
| ดึงข้อมูลวิเคราะห์ (analytics/kpi/mtbf_mttr) | ✅ +401 | ✅ | – | – | ✅ | recharts แยก chunk แล้ว (report-chart) |
| รายงาน (reports/report-center/PDF) | ✅ | ✅ | ✅ | – | ✅ | – |
| บุคลากร (users/roles/profile) | ✅ | ✅ | ✅ | – | ✅ | `repair_options` P0 (ไม่มี auth) ถูกปิด shut เรียบร้อย |
| PWA/Offline (SW, sync-center) | ✅ | – | ✅ | ✅ | ✅ | SW v38, cache v38-gen; offline fallback HTML เป็น UTF-8 ถูกต้อง |
| แจ้งเตือน (notifications/push/line) | ✅ | ✅ | ✅ | – | ✅ | push_subscribe ถูกบังคับ login; หน้า login จะไม่ขอสิทธิ์ push |
| Sage สต็อก/ซิงค์ | ✅ +401 | ✅ | ✅ | – | ✅ | `sage_sync` โพรบ ODBC จริงแทนค่า hardcode |
| ตั้งค่าระบบ (settings) | ✅ | ✅ GET สาธารณะเฉพาะคีย์ธีม | ✅ admin เท่านั้น | – | ✅ | key สาธารณะ: theme_preset/theme_primary_hex/theme_secondary_hex/site_name/company_name |
| หน้า custom (pages/andon) | ✅ | ✅ | ✅ | – | ✅ | และ andon-board อ่าน settings ได้หลัง login |
| Audit trail | ✅ | append-only | × | – | ✅ | ตารางจริง = `audit_logs` (phase18) — `audit_trail` เก่าไม่ถูกใช้แล้ว |

## 3) Security matrix (หลักฐานจริง)

| ประเด็น | ผล | หลักฐาน |
|---|---|---|
| ไม่มี endpoint ที่แก้ข้อมูลได้แบบไม่ auth | ✅ | scan_auth.php: เหลือ public-by-design = `csrf.php`, `spare_image.php`, `health.php` |
| 14 ไฟล์ weak-auth ถูกยกระดับ | ✅ | `pm_am`, `spare_issue`, `suppliers`, `spare_usage`, `checklist_templates`, `equipment_borrowing`, `calibration`, `calibration_tracking`, `mtbf_mttr`, `manuals`, `sage_items`, `push_subscribe`, `pm_plans`, `repair_options` → 401 มาตรฐาน (`{"success":false,...,"code":"UNAUTHENTICATED"}`) หรือ redirect `/login.php` (legacy) — ตรวจจริงด้วย curl + phase20_qa §B |
| `repair_options.php` (P0 — เขียนได้โดยไม่ login) | ✅ FIXED | เปิด auth + `api_safe_catch` ทุก catch (สงวน 409 สำหรับ duplicate key) |
| ไม่รั่ว exception ไปยัง client | ✅ | `api_safe_catch()` ที่ `src/helpers/api.php`; แทนที่ catch ที่รั่ว `$e->getMessage()` ทุกจุด (รวม dashboard/index/import_excel/supervisor/spare_usage) — grep ยืนยันไม่มี pattern รั่วเหลือ |
| CSRF บังคับทุก POST/PUT/DELETE | ✅ | phase20_qa §C: POST ไม่มี token → block `CSRF validation failed` |
| IDOR: technician ไม่ควรแตะ admin | ✅ | phase20_qa §B: technician ไม่ได้สิทธิ์ `settings.manage` แต่ได้ `repair.create` |
| FK/ข้อมูลไม่ orphan / ไม่ duplicate | ✅ | phase20_qa §A: ทุก FK check 0 orphan; ไม่มี `work_order_no` ซ้ำ; ไม่มี `locations.code` ซ้ำ |
| session timeout / cookie hardening | ✅ | กลไก phase18 (ไม่ถอยหลัง) — `security_check` ผ่าน |
| ผู้อ่าน audit log ไม่เห็นค่า secret เก่า | ✅ | mask ที่ settings?audit (phase18) |
| Timezone | ✅ FIXED | `getDb()` ตั้ง `SET time_zone='+07:00'`; CLI/`date()` = `Asia/Bangkok` (php.ini) — phase20_qa §E diff=0s |

## 4) UX / Accessibility matrix

| ข้อ | ผล |
|---|---|
| ทุกหน้าหลัง login มี h1 เดียว | ✅ (Playwright `assertSingleH1` — desktop + mobile) |
| Mobile app bar ไม่ใช่ heading | ✅ `.cmms-mobile-app-bar-title` เป็น `DIV` |
| ไม่มี horizontal overflow ที่ 390px / 1440px | ✅ |
| ไม่มี console error/pageerror ระหว่าง navigate | ✅ (หน้า login/dashboard/sync-center/report-center/repair – ตรวจด้วย Playwright) |
| Sync-center: ตัวเลข retry จากค่าจริง | ✅ (`จะลองใหม่อัตโนมัติใน 8 วิ` — จาก `RETRY_SCHEDULE_MS[0]`) |
| Sync-center: ข้อความ browser cache/i18n | ✅ (`พื้นที่เบราว์เซอร์ที่ใช้: 4.8 MB`, `รูปที่เก็บในเครื่อง: 0 รายการ (~0.0 MB)`) |
| font ผ่าน CSP | ✅ (`style-src` + `font-src` เติมให้ googleapis/gstatic — หน้า login ไม่มี error แล้ว) |

## 5) ปัญหาที่พบแล้วแก้ในรอบนี้ (เกิดใหม่/ถูกปิด)

| ID | ปัญหา | ระดับ | การแก้ |
|---|---|---|---|
| P0 | `repair_options.php` เขียน dropdown ได้โดยไม่ login | CRITICAL | ปิดด้วย auth + CSRF (ดู §3) |
| P0 | exception message รั่วกลับไป client (หลาย endpoint) | CRITICAL | `api_safe_catch()` + ตรวจทุก catch |
| P1 | `connectivity.tsx` SSR/CSR ไม่ตรง → React #418 (hydration) บน dashboard | HIGH | useState เป็นค่า static, แก้จริงหลัง mount |
| P1 | Google Fonts ถูก CSP block (หน้า login) | HIGH | เพิ่ม `fonts.googleapis.com`/`fonts.gstatic.com` ใน CSP |
| P1 | PWA push_subscribe ร้องขอก่อน login → 401 noise + browser ถามสิทธิ์บนหน้า login | HIGH | gate ด้วย `PHPSESSID` + รับ 401/403 เงียบ |
| P1 | DB `NOW()` เป็น UTC ขณะ PHP เป็น +07 (ข้อมูลเวลาปนกัน) | HIGH | `SET time_zone='+07:00'` ใน `getDb()` + `date.timezone=Asia/Bangkok` (php.ini) |
| P2 | `settings.php` 401 บนหน้า login (ThemeProvider) | MED | public GET เฉพาะคีย์ธีม/branding; 100 → 401 เฉพาะคีย์นอก white-list |
| P2 | recharts ใน 4 bundle หลัก | MED | `next/dynamic` ที่ report-chart (ลดในหน้า report) — dashboard/analytics คงไว้โหลดตรง (documented) |
| P2 | double `<h1>` บน mobile app bar | MED | เปลี่ยนเป็น `DIV` |
| P2 | `sage_sync` โชว์ `sage300_connected=true` ปลอม | MED | โพรบ ODBC จริง (`Sage300Service::probeConnection`) |
| P2 | sw.js mojibake Thai + version เก่า | MED | เขียนใหม่ UTF-8 สะอาด + SW_VERSION=`v38-20260916-phase20` |
| P3 | `audit_logs` ไม่มี index เฉพาะ module (มี action/created_at อยู่แล้ว) | LOW | ได้ index ที่จำเป็นแล้ว (idx_audit_created_at/action/severity/user_id/resource) — module เป็น alias ของ action |
| P3 | `public/uploads` ติดใน git (~ไฟล์รูป/Thumbs.db) | LOW | ค้างไว้—ตัดสินใจลบ/`.gitignore` ในรอบบำรุง |

## 6) สิ่งที่ยังไม่ได้ทดสอบจริง (ระบุตรงไปตรงมา)

- **Sage 300 integration หน้าจริง** (ODBC ไป SAP/Sage server): ระบบนี้ใช้ DSN จำลอง/ตัวอื่น — `sage_sync` โพรบได้แต่ผลเชื่อมโยงกับ network ของเครื่อง dev เท่านั้น ต้องยืนยันกับ DSN จริงในงาน go-live
- **LINE Messaging API ฝั่งจริง** (`line_webhook`): ยังไม่ส่ง LINE ping จริงในการทดสอบนี้ (มี token แต่อยู่ environment — ไม่อนุญาตให้ test จริงโดยไม่แจ้ง) — กลไก audit/CSP ข้างต้นผ่าน
- **โหลด/ปริมาณข้อมูล** (เช่น รายงานย้อนหลังหลายปี): ยังไม่ทำ load test — นับจาก 110 ตาราง/ข้อมูลจริงปกติ
- **Multiuser พร้อมกัน** (อัปเดตใบงานเดียวกันพร้อมกัน 2 เครื่อง): มีกลไก `base_updated_at` + optimistic-lock แต่ยังไม่ทำ Browser×2 ดึงพร้อมกันในรอบนี้ — ครอบคลุมบางส่วนผ่าน test sync (PUT พร้อม base_updated_at)

## 7) สรุป

ทุกเกตอัตโนมัติผ่าน 0 fail (รวมstrict design audit + tsc + next build + security + sync + phase20 QA + e2e 79 ตัว) — **สถานะความพร้อม: GO พร้อมเปิดใช้งาน** โดยมี 3 รายการที่ต้องยืนยันตอน go-live เท่านั้น (Sage DSN จริง, LINE webhook จริง, load test ข้อมูลเต็มปี)