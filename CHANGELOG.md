# Changelog — CMMS-TOPPAN

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/) · ตัวเลขเวอร์ชันตรงกับ `frontend/package.json` (ตอนนี้ `1.1.0`) และ tag ใน git (เช่น `v1.1.0`)

## [Unreleased]
- (ว่าง — ฟีเจอร์ถัดไปจะเริ่มหลัง Phase 23)

## [1.2.0] — 2026-09-20 — ADVANCED MAINTENANCE PLANNING & SCHEDULING (Phase 25)

Commit: สรุปการทำงาน Phase 25 ทั้งหมด -> main (includes database/migration_20260919_phase25_planning.sql + scripts/apply_phase25_planning.php idempotent 5 ขั้น รวม menu_permissions seed 21 แถว)

### Added (Feature)
- **Planning Center** /planning + **API** GET /api/v1/planning.php (center/queue/calendar/technicians/conflicts/readiness/duration_history/schedule_log/kpis/my_plan) + **PUT** (schedule/reschedule/priority/assign/emergency/skill) + **POST** bulk (schedule|assign, dry_run preview, <=100 ใบ)
- **Engine** src/helpers/planning.php: pln_config/group/priority_explanation/duration_estimate/skill_match/technician_workload/detect_conflicts/readiness/sla_risk/prepare/log_schedule — คลาดทุกอย่างฝั่ง backend (RBAC re-validate + CSRF + idempotency + audit + NotificationCenter)
- **คิววางแผนรวม NEW requests** (maintenance_requests.status='open') -> กลุ่ม 
ew_request แยกจากใบงาน; แสดง badge + ลิงก์รีวิวคำขอ; ไม่ถูก select-all/bulk
- **Skills matrix UI** (Dialog) + PUT ?action=skill upsert 	echnician_skills (ระดับ 1-5/cert/valid_until/area)
- **Workload/Capacity** ต่อช่าง, **Readiness** 4 ด้าน (schedule/assignee/skill/parts — Sage-based), **Conflicts** 3 ประเภท (technician/asset/pm + force confirm), **SLA risk** (safe/at_risk/breached), **Emergency** (critical + slot 10 นาที + แจ้งหัวหน้า)
- **เมนู** planning + planning/calendar (roles 1,2,6,7) / field/plan (1,2,3,6,7); Dashboard card (kpis); sidebar/i18n TH-EN
- **Docs**: PLANNING_CENTER, SCHEDULING_RULES, TECHNICIAN_CAPACITY, WORK_READINESS, SCHEDULING_CONFLICTS, PHASE_25_REPORT

### Changed
- public/api/v1/planning.php queue -> ผสาน requests (pln_queue_rows + pln_open_requests), pln_prepare สาขา kind='request'
- scripts/security_check.php: settings.php?defaults (หน้า login เปิด public theme โดยออกแบบ — protected read ต้อง 401) + เพิ่ม planning.php ใน auth/CSRF checks; ผล 34/34 PASS
- หน้า /planning/calendar/field-PLAN ผ่าน design-audit (0 FAIL, 3 WARN Badge andon เดิม Phase 23/24)

### Fixed
- ย้าย test probe เก่า (public/_probe6.php) ออก + ลบ .opencode/opencode.json ว่าง

### Deprecated / Known limits
- TLS/HTTPS ยัง pending (blocker เดิม Phase 21)
- Skill ระดับ 1-5 แสดงแต่ไม่บังคับ; capacity เป็นแบบวันรวม; ยังไม่มี auto-scheduling (AI) — ตัดสินใจโดยคน
## [1.1.0] — 2026-09-18 — ADVANCED INTELLIGENCE & ANALYTICS (Phase 23)

Commit: โปรดดู commit ของสาย `main` หลัง Phase 23 · DB migration: **ไม่มี** (อ่านตารางที่มีอยู่เดิมทั้งหมด)
ตัวชี้วัดจริง (ไม่ได้จำลอง): ข้อมูลปัจจุบันเป็น seed/setup/test — KPI ที่ข้อมูลไม่พอแสดง INSUFFICIENT DATA ไม่ใช่ 0

### Added
- **Intelligence Center** — หน้า `/analytics/intelligence` (10 แท็บ: ภาพรวมผู้บริหาร · Reliability · สถานะเครื่อง · เสียซ้ำ · Downtime · PM · ภาระงานช่าง · สต็อก & อะไหล่ · ต้นทุน · คิวงาน & ความเร่งด่วน) + แถบเตือนคุณภาพข้อมูล + กราฟแนวโน้มรายเดือน (งานเสร็จ · ฉุกเฉิน · MTBF) + เมนู/i18n TH-EN
- **`GET /api/v1/intelligence.php`** — 13 sections (`overview, reliability, trend, asset_health, repeat_failures, downtime_pareto, priority, pm, planned_unplanned, technicians, spare, cost, data_quality`) พร้อม `meta` (user/range/filters/can_cost/generated_at); RBAC server-side
- **`src/helpers/analytics.php`** — engine Phase 23 ที่ **reuse** KPI กลาง `src/helpers/kpi.php` (ไม่คำนวณสูตรซ้ำ) ครอบคลุม MTBF/MTTR จาก operating hours จริง, สถานะเครื่องแบบอธิบายได้, การเสียซ้ำ + drill-down, downtime Pareto, PM compliance, planned vs unplanned, ภาระงานช่าง, สต็อก Sage vs การใช้ CMMS, ต้นทุน + coverage, คุณภาพข้อมูล
- **e2e** `frontend/tests/e2e/intelligence.spec.ts` — 5 เคส (API 401, หน้า+แท็บ+KPI, reliability, drill-down, filter+search)
- **เอกสาร** `docs/KPI_DEFINITIONS.md`, `docs/ANALYTICS_DATA_MODEL.md`, `docs/ADVANCED_ANALYTICS.md`, `docs/ANALYTICS_PERFORMANCE.md`, `docs/PHASE_23_REPORT.md`

### Changed
- `public/api/v1/analytics_monthly.php` — ลบ section ที่แต่งข้อมูล (predictive health / energy waste) ที่ไม่มีข้อมูลรองรับ และแก้ join bug
- ตัวเลขผู้บริหารใช้ Reliability จากตาราง `mtbf_mttr` (operating hours จริง) และติดป้ายที่มา/INSUFFICIENT DATA ทุกจุด

### Fixed
- `ana_asset_health` คืน `summary: []` เมื่อไม่มีเครื่องตามตัวกรอง → ทำให้หน้าจอ crash (`Cannot convert undefined or null to object`); คืน shape ว่างที่ถูกต้อง + frontend guard

### Deprecated / Known limits (คงสภาพเหมือนเดิม; ไม่ใช่ regression)
- ยังไม่มี HTTPS/TLS (blocker B-1 Phase 21 — ต้องติดตั้ง cert + bind ภายนอก)
- ฟิลด์ต้นทุน / เวลาตอบสนอง / RCA / failure code ในใบงานยังกรอก 0% → KPI เหล่านี้แสดง INSUFFICIENT DATA
- Sage 300: ไม่มีการตัดสต็อกอัตโนมัติจาก CMMS — การเบิกต้องผ่านฝ่ายดูแล Sage ตามสัญญาเดิม
- MTBF/MTTR และ PM compliance มีสองนิยาม/แหล่ง (อธิบายใน `docs/KPI_DEFINITIONS.md` §12)

## [1.0.1] — 2026-09-17 — POST-GO-LIVE MONITORING (Phase 22)

Commit: โปรดดูที่ commit ของสาย `main` หลัง Phase 22 · DB migration: `migration_20260917_phase22_monitoring.sql` (ระบบ monitoring/feedback ใหม่ทั้งหมดเป็น additive)
ตัวชี้วัดจริง (ไม่ได้จำลอง): ระบบยังไม่ได้ใช้งานจริงในสายการผลิต — ข้อมูลปัจจุบันคือ seed/setup/test

### Added
- **system_health** — `GET /api/v1/system_health.php` (admin เท่านั้น): สแนปชอตสถานะจริง DB ping, Sage 300 probe จริง, พื้นที่ disk, ขนาด php-error.log, ข้อผิดพลาด 30 วัน, ผล client_action_log (success/conflict/capped), สถานะงานซ่อม/PM/MR/ตรวจรอบ/เบิกอะไหล่, การแจ้งเตือน 30 วัน (LINE quota ล้มเหลว), audit, คุณภาพข้อมูล (9 วันที่ผิด, 78 WO เสร็จไม่มีช่าง, 9 assignee ไร้เจ้าของ) — หน้า UI `/settings/health` + การ์ด ในเมนู "ระบบ & ตั้งค่า"
- **system_errors + centralized error capture** — `src/helpers/errors.php` (request_id, redact secret, record_error) เชื่อม `api_safe_catch()` ทุก endpoint + `public/api/health.php` (เมื่อ DB ล้ม เก็บได้เท่าที่ทำได้)
- **feedback** — `GET/POST/PUT /api/v1/feedback.php`: ผู้ใช้ทุกคนส่งได้ (CSRF+Origin บังคับ), admin ดูทั้งหมด/ปรับสถานะ, ผู้ใช้เห็นของตัวเอง — หน้า UI `/feedback`
- **menu_permissions**: `system_health` (role 1 เท่านั้น), `feedback` (ทุกบทบาท) — เพิ่ม sidebar/labels i18n
- **Index**: `sage_sync_log(status, created_at)` ใช้หน้า health/ประวัติ sync

### Changed
- `api_safe_catch()` ตอนนี้บันทึกลง `system_errors` (ด้วย) ก่อนตอบ 500 — ยังไม่เปิดเผย stack แก่ client

### Deprecated / Known limits (คงสภาพเหมือนเดิม; ไม่ใช่ regression)
- ยังไม่มี HTTPS/TLS (blocker B-1 Phase 21 — ต้องติดตั้ง cert + bind ภายนอก)
- Sage 300: ไม่มีการตัดสต็อกอัตโนมัติจาก CMMS — การเบิกต้องผ่านฝ่ายดูแล Sage (PENDING_ISSUE / wait ฝ่ายจัดการ) ตามสัญญาเดิม

<br/>

## [1.0.0] — 2026-09-17 — RELEASE CANDIDATE (Go-Live)

Commit: `bf0a0f0` (Phase 20) · ตัวเลข build `hdZW7CLyR4LnpYB9mnGoT`
DB migration เวอร์ชัน: schema อยู่ในสถานะ 110 ตาราง — การ migration ตัวสุดท้ายที่ใช้ = `migration_20260916_phase19_pwa_offline.sql` (ไม่มี migration ใหม่ใน Phase 21/20)

### สรุปความพร้อม (เอกสาร/เกต)
- QA: `docs/QA_MATRIX.md`, `docs/FINAL_QA_REPORT.md` (ความเห็น GO) — เกตทุกตัวผ่าน 0 fail
- ครอบคลุม phase: API, PDF, รายงาน (Phase 17), Security/audit (Phase 18), PWA offline/sync (Phase 19), เตรียมพร้อม production (Phase 20)
- Segment: **RELEASE CANDIDATE** — ยังมี GO-LIVE BLOCKER ด้าน TLS/HTTPS สำหรับอุปกรณ์จริง (ดู `docs/GO_LIVE_PLAN.md` §3)

### เด่นๆ จำแนกตาม phase
- **Phase 20 (QA/Hardening):** ปิดช่องโหว่ `repair_options.php` (เขียนได้แบบไม่ login), `api_safe_catch()` ทุก catch, ยกระดับ 14 endpoint weak-auth → 401 มาตรฐาน, `/health`, `settings` public-GET เฉพาะคีย์ธีม, แก้ hydration #418/CSP font/PWA push, แก้ timezone root cause (`SET time_zone='+07:00'` + `date.timezone=Asia/Bangkok`), `report-chart` dynamic import, sw.js v38, `scripts/phase20_qa.php` 50/50
- **Phase 19 (PWA):** SyncEngine idempotent (IndexedDB queue/cache/attachments) + offline photos + `/sync-center` UI + `base_updated_at` optimistic-lock (409) + `client_action_log` replay + repair attachment list + phase19_sync_check 15/15
- **Phase 18 (Security):** RBAC `requirePerm` central matrix, audit_logs append-only + `/audit-log`, mask ค่าลับ, hardened auth/session, CORS wildcard ลบ, security headers, security_check 32/32
- **Phase 17 (Reports):** report API 12 กลุ่ม + CSV/XLSX + schedule 5 นาที + 13 หน้า report
- **Phase 16 (Notifications):** notification center + alert engine
- **Phase 15 (Dashboard):** KPI drill-down
- **Phase 14 (Supervisor):** หน้าฝ่ายซ่อม/อนุมัติ
- **Phase 13 (Inspection):** checklist/ตรวจสอบเครื่องจักร
- **Phase 12 (Sage):** Sage 300 item/stock lookup (source of truth), ใบเบิก→ตัดสต็อก
- **Phase 11 (PM):** PM/AM plan + generate
- ก่อน phase 11: งานซ่อม, ครุภัณฑ์, อะไหล่, ผู้ขาย, calibration, เส้นทาง LINE/Email notify

### ข้อจำกัดที่รู้ (ณ รุ่นนี้)
- ปุ่ม HTTPS ไม่มีใน IIS/Next (เดี๋ยวต้องติดตั้ง cert + bind ก่อนใช้งานอุปกรณ์จริง) — GO-LIVE BLOCKER
- recharts โหลดตรงบน dashboard/analytics (ยกเว้นหน้า report)
- Sage 300: ตัดสต็อกจริงทำที่ฝั่งคลัง (out-of-band) แล้วบันทึก doc# ผ่าน sage_shipments — CMMS บันทึกเฉพาะ snapshot ROI
- `public/uploads` 66 ไฟล์ติด git (ควรลบ/ignore รอบถัดไป)
- ตาราง `audit_trail` (เก่า) ยังไม่ถูก drop; `roles` id 3 label "Operate" ≠ matrix "Technician" (label เท่านั้น)

### Backward compatibility
- ทุก migration เป็น additive (ไม่มี DROP/TRUNCATE/DELETE) — ย้อนกลับอย่างปลอดภัยด้วย forward-fix + restore (ดู `docs/DATABASE_RECOVERY.md`)