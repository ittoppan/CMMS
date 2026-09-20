# Planning Center (ศูนย์วางแผน) — Phase 25

> สรุป : ระบบวางแผนซ่อมบำรุงขั้นสูง — คิววางแผน, ตารางเวลา, ความพร้อมงาน, ทักษะช่าง, ความขัดแย้งของแผน, SLA
> Engine อยู่ฝั่ง backend ทั้งหมด: `src/helpers/planning.php` + `public/api/v1/planning.php`
> หน้า UI: `/planning` (Planning Center), `/planning/calendar` (Timeline), `/field/plan` (My Plan)

## 1. สิทธิ์การใช้งาน (RBAC)

| role | canPlanWork (วางแผน/มอบหมาย/เร่ง) | เห็นข้อมูล |
|---|---|---|
| 1 Admin | ✅ | ทั้งหมด (kpi_scope ไม่จำกัด) |
| 2 Manager | ✅ | ทั้งหมด |
| 6 ASST Manager | ✅ | ทั้งหมด |
| 7 Foreman | ✅ | ทั้งหมด |
| 3 Operate (ช่าง) | ❌ | เฉพาะงานตัวเอง (scope ที่ server บังคับ) |
| 4 Operator | ❌ | KPI ใน dashboard เท่านั้น |
| 5 Viewer | ❌ | KPI ใน dashboard เท่านั้น |

- เงื่อนไข: `canPlanWork()` = role 1,2,6,7 (`src/helpers/roles.php`) — backend re-validate ทุก action
- ทุก action ที่เปลี่ยนข้อมูล (PUT/POST) ผ่าน `enforceCsrf()` และ `requireLogin()`
- เมนู: `planning` / `planning/calendar` ให้ role 1,2,6,7 (ซ่อน 3,4,5); `field/plan` ให้ 1,2,3,6,7

## 2. API — `GET /api/v1/planning.php`

| action | ใคร | คำอธิบาย |
|---|---|---|
| `center` | planner | สรุป: จำนวนตามกลุ่ม + SLA + readiness โดยรวม + conflict วันนี้ (สูงสุด 40) + workload วันนี้ + กำหนดงานวันนี้ |
| `queue` | planner | รายการคิวทั้งหมด (repair + คำขอซ่อมใหม่) — filters: `group, search, priority, technician_id, asset_id, limit(≤300), offset` |
| `calendar` | ใครก็ได้ (scope) | ตารางงานช่วง `view=day/week/month` — ช่าง role 3 เห็นเฉพาะงานตัวเอง |
| `technicians` | planner | รายชื่อช่าง (role 1,2,3,6,7) + ทักษะ + workload ในช่วง `from/to` |
| `conflicts` | planner | ความขัดแย้งของแผนทั้งหมดในหน้าต่าง (สูงสุด 100) |
| `readiness` | planner | รายละเอียดความพร้อม 4 ด้านของใบงาน (`id`) |
| `duration_history` | planner | ประวัติระยะเวลางานใกล้เคียงของใบงาน (`id`) |
| `schedule_log` | ใครก็ได้ (login) | audit การเลื่อน/มอบหมาย/ปรับ priority ของใบงาน (`id`) |
| `kpis` | ใครก็ได้ (scope) | KPI วางแผนสำหรับ dashboard: groups + sla + total_open |
| `my_plan` | ใครก็ได้ (login) | งานทั้งหมดของ user ในวันนี้/สัปดาห์/ยังไม่มีรอบ (ใช้หน้า `/field/plan`) |

`kpis` เป็น endpoint หลักที่ dashboard (`/planning` และหน้าแรก) ใช้ดึงตัวเลข — scope ตาม role เช่นเดียวกับ module อื่นในระบบ

## 3. API — PUT / POST (mutate)

ทุกตัว `requireRole(canPlanWork())` + CSRF + idempotency (X-Idempotent-Key) + audit + แจ้งเตือน

| action | method | body | ผล |
|---|---|---|---|
| `schedule` | PUT | `id, planned_start_at, planned_end_at, reason?, force?` | กำหนดรอบเวลา (409 ถ้าชน && !force) |
| `reschedule` | PUT | `id, planned_start_at, planned_end_at, reason*(บังคับ), force?` | เลื่อนกำหนด + notify ผู้รับผิดชอบ |
| `assign` | PUT | `id, lead_id, team_ids[], planned_start_at?, planned_end_at?, note?, force?` | มอบหมายชุด + แจ้งผู้ถูกมอบหมาย |
| `priority` | PUT | `id, priority(review), reason?` | ปรับ priority — ต้องคนสั่ง + เหตุผล (บันทึก audit) |
| `emergency` | PUT | `id, reason*(บังคับ)` | งานฉุกเฉิน: priority=critical + สล็อตภายใน 10 นาที + แจ้งหัวหน้า (roles 1,2,6) |
| `skill` | PUT | `user_id, skill_name*, skill_level(1-5), certification?, valid_until?, area?, notes?` | เพิ่ม/แก้ทักษะช่าง (upsert ปกครอง master data) |
| `bulk` | POST | `operation(schedule\|assign), ids[], planned_start_at?, planned_end_at?, lead_id?, team_ids[], note?, force?, dry_run?` | วางแผนทีละหลายใบ — `dry_run=true` คืน preview (conflict/readiness) โดยไม่เขียน DB |

## 4. กลุ่มคิววางแผน (queue groups)

Engine คืน `group` ต่อแถว — ลำดับความเร่ง (`pln_group()`):

```
overdue  (เกิน SLA)  >  at_risk  (SLA จะหมดใน planning_sla_risk_hours)  >
scheduled  (มีรอบแล้ว)  >  unscheduled  (ยังไม่มีรอบ + ยังไม่ได้กำหนด)  >
unplanned  (pending_approval/approved/draft)  >  new_request  (คำขอซ่อมใหม่)
```

- ใบงานจบแล้ว (done statuses) → `done` (ไม่เข้า queue)
- คำขอซ่อมใหม่ (`maintenance_requests.status='open'`) → กลุ่ม `new_request` โดยเฉพาะ — ยังไม่มีใบงาน ดังนั้น **ไม่ถูกดึงเข้ากลุ่มอื่น/ไม่ถูก bulk assign** โดยปริยาย (อยู่ไกลจาก selection ในการ bulk)
- งานที่เริ่มทำไปแล้ว (assigned/accepted/...) → ยังโผล่ในคิวแต่ต้องไม่ถูกวางแผนซ้ำซ้อน ตรวจสอบจากสถานะใน action

## 5. แหล่งข้อมูล Settings (adjustable — ไม่ hard-code ในโค้ด)

| key | default | ความหมาย |
|---|---|---|
| `planning_shift_start` | `08:00` | เวลาเริ่มกะ สำหรับ UI |
| `planning_shift_hours` | fallback `work_hours_per_day` (8) | ชั่วโมงทำงาน/วัน → ใช้คำนวณ capacity |
| `planning_working_days` | `1,2,3,4,5` | วันทำงาน (1=จันทร์..7=อาทิตย์) → นับวันในหน้าต่าง |
| `planning_sla_risk_hours` | `24` | จำนวนชั่วโมงก่อนหมด SLA ที่ถือว่า "เสี่ยง" |
| `planner_break_hour` | `12.5` | เวลาพัก (อ้างอิง UI) |

⚠️ ระบบไม่สร้างข้อมูลเทียม: วันที่ทำงาน/ชั่วโมง capacity อ่านจาก settings เหล่านี้ (มีค่าเริ่มต้นครบ ปรับได้ผ่านหน้าการตั้งค่า)