# PHASE 25 — Advanced Maintenance Planning & Scheduling

> วันที่: 2026-09-20 · ขอบเขต: Planning Center + Scheduling + Capacity/Skills + Readiness + Conflicts + SLA + Emergency

## สรุป

ระบบวางแผนซ่อมบำรุงขั้นสูง: ศูนย์วางแผน (Planning Center), คิววางแผนพร้อมคำขอซ่อมใหม่ (NEW requests),
ตารางงาน (Calendar/Timeline), ภาระงานช่าง (Workload/Capacity), ทักษะช่าง (Skills matrix), ความพร้อมทำงาน
(Readiness), ความขัดแย้งของแผน (Conflict detection), SLA risk, งานฉุกเฉิน (Emergency) และการวางแผนแบบกลุ่ม
(Bulk) — ครอบคลุมภาพรวม "วางแผนงานให้พร้อมก่อนเริ่มงาน" โดย engine คำนวณทุกอย่างฝั่ง backend
(ตรวจสอบสิทธิ์ซ้ำ + audit + แจ้งเตือน + idempotency)

## สิ่งที่ทำ

### 1. Backend — Engine `src/helpers/planning.php`
- `pln_config()` — เกณฑ์ของหลักจาก settings (shift/time/working days/SLA risk/break) ไม่ hard-code
- `pln_group()` — จัดกลุ่มคิว: `overdue > at_risk > scheduled > unscheduled > unplanned > new_request`
  - เพิ่มโหมด `kind='request'` สำหรับคำขอซ่อมใหม่ (maintenance_request) → กลุ่ม `new_request` แยกจากใบงาน
- `pln_priority_explanation()` — แนะนำระดับความเร่ง (CRITICAL/HIGH/NORMAL/LOW) จาก criticality/work_order_type/priority/SLA/safety — **ไม่เขียนกลับ DB**
- `pln_duration_estimate()` — ค่าเฉลี่ยระยะเวลาจากประวัติ (failure_code → เครื่อง → ทักษะ → หมวด)
- `pln_skill_match()` + `pln_get_skills()` — เทียบทักษะช่าง (technician_skills) กับ required_skill
- `pln_technician_workload()` — capacity ตามวันทำงาน×ชั่วโมงกะ, assigned_minutes จากช่วงเวลาที่ทับจริง
- `pln_detect_conflicts()` — technician/asset/pm ทับซ้อน (3 ประเภท + severity)
- `pln_readiness()` — ความพร้อม 4 ด้าน: schedule/assignee/skill/parts (Sage-based)
- `pln_sla_risk()` — safe/at_risk/breached
- `pln_prepare()` — ประกอบแถวเดียวครบทุกอย่าง (No N+1 เกินจำเป็น) + สาขา special สำหรับ request
- `pln_log_schedule()` — audit ทุกการเปลี่ยนแปลง (repair_schedule_log + repair_activity_log)

### 2. Backend — API `public/api/v1/planning.php`
- GET: `center`, `queue` (ผสานคำขอซ่อมใหม่), `calendar` (day/week/month + scope), `technicians`, `conflicts`, `readiness`, `duration_history`, `schedule_log`, `kpis`, `my_plan`
- PUT: `schedule`, `reschedule` (บังคับเหตุผล + notify), `priority` (บังคับเหตุผล + audit), `assign` (ตรวจ double-assign/conflict + notify), `emergency` (critical + slot 10 นาที + แจ้งหัวหน้า), `skill` (upsert ทักษะช่าง)
- POST: `bulk` (schedule|assign — มากสุด 100 ใบ, `dry_run` preview ไม่เขียน DB, failed ต่อใบไม่พังทั้งก้อน)
- ทุก mutate: `requireRole(canPlanWork())` + `enforceCsrf()` + idempotency (`X-Idempotent-Key`) + audit + NotificationCenter

### 3. Migration + Seed Script
- `database/migration_20260919_phase25_planning.sql` — schema เพิ่มเติม (ตาราง/คอลัมน์ necessary สำหรับ Phase 25)
  - `technician_skills` (skill matrix), `repair_schedule_log` (audit การเลื่อน/มอบหมาย), settings `planning_*`
- `scripts/apply_phase25_planning.php` — idempotent 5 ขั้น:
  1) ตาราง technician_skills + repair_schedule_log
  2) คอลัมน์ repair (planner_id, work_order_type, planned_*, estimated_*, required_skill, safety_requirement, downtime_minutes)
  3) settings เกณฑ์ capacity/conflict/SLA
  4) ไฟล์งานแสดงผล
  5) **menu_permissions seed** (planning + planning/calendar = 1,2,6,7; field/plan = 1,2,3,6,7)
- ผลรัน: แทรก 21 แถว menu_permissions, รายการเดิมไม่ถูกแตะ

### 4. Frontend
- `/planning` (Planning Center) — กลุ่มคิว, KPI SLA/readiness, workload strip ต่อช่าง + ปุ่มเพิ่มทักษะ (Wrench), ตาราง queue พร้อม filter/search, การ์ด action: schedule/reschedule/assign/priority/emergency, bulk selection (เฉพาะใบงานจริง — ลดคำขอซ่อมใหม่), Readiness & Conflicting เดือน detail
  - **แถวคำขอซ่อมใหม่**: badge กลุ่ม `new_request`, แสดง "ผู้แจ้ง", ปุ่มลิงก์ไป `/supervisor/review?id=` (รีวิวคำขอ), ไม่ถูก select-all/bulk
  - **Skills Dialog**: รายการทักษะช่าง (ระดับ/cert/valid_until/area) + ฟอร์มเพิ่ม/แก้ (เรียก `PUT ?action=skill`)
- `/planning/calendar` — ตารางวัน/สัปดาห์/เดือน + workload บนแกนเวลา
- `/field/plan` — My Plan (ของช่าง: วันนี้/สัปดาห์/ไม่มีรอบ)
- Dashboard `/dashboard` — การ์ด Planning (ดึง `kpis`)
- `frontend/lib/planning.ts` — client + types (เพิ่ม `kind/request_id/requested_name/description`)

### 5. Integration
- menu_catalog + menu_permissions (ขั้นที่ 5), sidebar-nav, layout, i18n TH/EN, settings_defaults
- NotificationCenterService (งานวางแผน/มอบ/เลื่อน/ฉุกเฉิน)

## API Contract (โดยย่อ)

```
GET  /api/v1/planning.php?action=center|queue|calendar|technicians|conflicts|readiness|duration_history|schedule_log|kpis|my_plan
PUT  /api/v1/planning.php?action=schedule|reschedule|priority|assign|emergency|skill
POST /api/v1/planning.php?action=bulk   (operation=schedule|assign, dry_run?)
```
- RBAC: planner (1,2,6,7) ทุก action; calendar/kpis/my_plan/schedule_log เปิดให้ login (scope ตาม role)
- mutate ทั้งหมด: CSRF + idempotency + audit + 409 เมื่อ conflict (ยกเว้น force:true)

## วิธีตรวจสอบ / ทดสอบ

1. `php scripts/apply_phase25_planning.php` (idempotent — rerun ได้)
2. `php scripts/security_check.php` → 34/34 PASS (รวม endpoint planning.php ใหม่: auth 401 + CSRF 403)
3. `php scripts/design-audit.py` → 0 FAIL, 3 WARN (Badge andon — จาก Phase 23/24 เดิม)
4. `npm run typecheck && npm run build` → clean; deploy ผ่าน `deploy.ps1` (SW v39)
5. e2e: `frontend/tests/e2e/planning.spec.ts` + สูทเต็ม 84+ ผ่าน (server :3001)
6. ภาพ TLS/HTTPS (blocker เดิมจาก Phase 21) ยังไม่เปลี่ยน

## ข้อจำกัด (known limits)

- Skill ระดับ 1-5 ถูกแสดงแต่ไม่บังคับในการจัดชุด (เทียบเป็น gap เท่านั้น)
- Capacity เป็นแบบวันรวม (ไม่ใช่ slot กะ/คน) — อิง planning_working_days/planning_shift_hours
- ไม่มี auto-scheduling (AI) ยัง — ตัดสินใจโดยคน + engine ช่วยตรวจ/ชี้จุด
- หมายเหตุเดิม: TLS/HTTPS ยัง pending

## เอกสารอ้างอิง

- `docs/PLANNING_CENTER.md` · `docs/SCHEDULING_RULES.md` · `docs/TECHNICIAN_CAPACITY.md`
- `docs/WORK_READINESS.md` · `docs/SCHEDULING_CONFLICTS.md`
- `docs/PHASE_24_REPORT.md` (โครงสร้างอ้างอิง) · `docs/PHASE_23_REPORT.md`