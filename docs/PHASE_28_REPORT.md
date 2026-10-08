# PHASE 28 — Asset Reliability & Lifecycle Management

> วันที่: 2026-09-22 · ขอบเขต: Reliability Profile รายเครื่อง (`/asset-reliability/[id]`)
> + Dashboard/วิกฤต/วงจรชีวิต/อายุเครื่อง/เปลี่ยนชิ้นส่วน/ยกเครื่อง/คุณภาพข้อมูล/รายงาน/ตั้งค่า
> (`/asset-reliability/*`)

## สรุป

ระบบจัดการความน่าเชื่อถือและวงจรชีวิตเครื่องจักรแบบ end-to-end ใช้ข้อมูลจริงจาก
`repair`, `failure_events`, `v_maintenance_cost` ผ่าน engine กลาง `src/helpers/asset_reliability.php`
และ `src/helpers/analytics.php` (single source — UI ไม่คำนวณตัวเลขเอง) ไม่มีการเดา/ปั้น
ตัวเลข MTBF/MTTR/Remaining-life — ถ้าข้อมูลไม่พอให้ `INSUFFICIENT_DATA` ทุกการเปลี่ยน
ข้อมูลสำคัญ (lifecycle, criticality review, overhaul, component replacement) ผ่าน CSRF +
audit + NotificationCenter LINE

## สิ่งที่ทำ

### 1. Data Layer (migration idempotent `scripts/apply_phase28_asset_reliability.php`)
- `asset_registry`: เพิ่ม `criticality` ค่า `'D'`, `lifecycle_status`,
  `installation_date`, `commission_date`, `purchase_cost`, `expected_life_months`,
  `criticality_level`, `criticality_review_due`
- ตารางใหม่: `asset_lifecycle_history` (append-only), `component_replacements`,
  `asset_overhaul_schedules`, `asset_relationships` (parent/child),
  `asset_criticality_reviews`, `asset_measurements`
- วิว `v_maintenance_cost` มีอยู่แล้ว — reuse เป็นแหล่ง cost/downtime
- settings `ar_*` 15 ตัว (น้ำหนัก/เกณฑ์) ลง settings table + defaults ใน `settings_defaults.php`
- `notification_templates` module `asset_reliability` 5 แบบ (lifecycle_change,
  criticality_review_due, overhaul_due, retirement_review, component_replaced)
- `menu_permissions` key `asset_reliability/*` 10 รายการ + RBAC

### 2. Engine `src/helpers/asset_reliability.php` — single source
- `ar_config()` / `ar_save_config()` — น้ำหนัก criticality (production/quality/cost/safety),
  เกณฑ์ age (warning/retire), เกณฑ์ lifecycle overdue
- `ar_asset_list()` / `ar_asset()` — ทะเบียน + criticality + lifecycle + data-quality score
- `ar_profile()` — profile เต็มรายเครื่อง (reliability/health/failure/cost/lifecycle/
  components/overhauls/measurements/data_quality/decision_support)
- `ar_criticality()` — คะแนนจาก factors แต่ล็อก `'A'` ต่อ criticality review ที่เป็นทางการ
  (ไม่เดา — ต้องมีบันทึก human decision ใน review)
- `ar_critical_assets()` / `ar_aging()` / `ar_dashboard_summary()`
- `ar_data_quality_asset()` / `ar_data_quality_fleet()` — score + checks ที่อธิบายได้
- `ar_reliability_asset()` — MTBF/MTTR/availability จาก `repair` จริงโดยใช้
  `ana_reliability_calc` (metafunction เดียวกันกับ analytics) → `INSUFFICIENT_DATA` เมื่อไม่พอ
- `ar_lifecycle_*` — transition + history + due detection (จาก expected_life_months/
  install/commission; ไม่เดา remaining life)
- `ar_component_*` / `ar_overhaul_*` — CRUD + due check + recommend (ไม่ auto ปลดเครื่อง)
- audit_log ทุกรายการ + `sendLineTemplatePush`

### 3. API 9 ไฟล์ `public/api/v1/`
`asset_criticality.php`, `asset_lifecycle.php`, `asset_relationships.php`,
`asset_components.php` (component_replacements), `asset_overhauls.php`,
`asset_measurements.php`, `asset_data_quality.php`, `asset_reports.php` (7 report
types: critical_assets/aging/lifecycle_distribution/replacement_summary/
overhaul_summary/data_quality_summary/reliability_ranking) +
`asset_reliability.php` (dashboard/critical/aging/config/profile)
- `replacement_summary` เติม `asset_code`/`asset_name` จาก `asset_registry` (join)
- ผ่าน `requireLogin` + `requirePerm($pdo,'asset',...)`; POST/PUT/DELETE ผ่าน CSRF

### 4. Frontend `frontend/app/(dashboard)/asset-reliability/`
- `/asset-reliability` — dashboard (KPI + โดย criticality/lifecycle + อายุนาน)
- `/asset-reliability/[id]` — Reliability Profile รายเครื่อง (tabs ทั้งหมด + เปลี่ยนวงจรชีวิต)
- `/asset-reliability/critical` — เครื่องวิกฤต A–D + filter + search
- `/asset-reliability/lifecycle` — ภาพรวมวงจรชีวิต + รายการ + กรองสถานะ
- `/asset-reliability/aging` — เครื่องเก่า/อายุ (warning/retire) + เกณฑ์จาก config
- `/asset-reliability/replacement` — แผนเปลี่ยนชิ้นส่วน + search
- `/asset-reliability/overhaul` — แผนยกเครื่อง + สร้างแผนผ่าน Dialog (POST)
- `/asset-reliability/data-quality` — คะแนน fleet + ตรวจรายเครื่อง
- `/asset-reliability/reports` — hub 7 report types + ตารางไดนามิก
- `/asset-reliability/config` — ตั้งค่าน้ำหนัก/เกณฑ์ (GET/POST)
- Nav 9 รายการเพิ่มใน `sidebar-nav.tsx` + `MENU_HREFS` + `PAGE_HERO`/PAGE_TITLES
  (i18n) + RBAC ผ่าน `menu_permissions`
- Scan page: เพิ่มลิงก์ "ดู Reliability Profile"

## ตรวจสอบหลังเขียน

- `php scripts/apply_phase28_asset_reliability.php` idempotent — ผ่าน
- `php -l` ทุกไฟล์ใหม่ — ผ่าน
- ตั้งค่า session ผู้ดูแลระบบ (เซสชันแอบอ้างใน `C:/opencode_sess`) แล้วยิง HTTP ผ่าน
  `http://127.0.0.1:8878/api/v1/...` — ทั้ง 17 probe ผ่าน (16 x 200 + bogus report 400)
- `npm run typecheck` — ผ่าน (0 errors)
- กรณีทดสอบ: ดู `docs/PHASE_28_TEST_PLAN.md`