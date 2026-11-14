# CMMS-TPT — Data Source Mapping

> ทุกแถวตรวจจาก schema จริง (`SHOW COLUMNS`) และ helper จริง (`src/helpers/kpi.php`)
> สถานะข้อมูลอ้างอิงการนับเมื่อ 2026-11-14

## สถานะที่ใช้ร่วมกันทั้งระบบ (single source of truth)

```php
// src/helpers/kpi.php
kpi_active_statuses() = open, acknowledged, draft, pending_approval, approved, assigned, accepted,
                        in_progress, paused, waiting_parts, pending_parts, waiting_external,
                        waiting_approval, completed, pending_verification, resolved
kpi_done_statuses()   = closed, cancelled, rejected, verified, done, skipped
```

## ตาราง mapping

| KPI / ข้อมูล | ตาราง + คอลัมน์จริง | API | สูตร/เงื่อนไข (ตามที่โค้ดทำ) | สิทธิ์ | ข้อจำกัดข้อมูล |
|---|---|---|---|---|---|
| Total Work Orders (ในช่วง) | `repair.created_at` | `dashboard.php?action=overview` (`core.total_wo_created`) | `COUNT(*)` + ช่วงวันที่ + ตัวกรอง + scope | login | ปัจจุบันมี 99 ใบ, เดือนนี้ 10 ใบ |
| Open Work Orders | `repair.status` | `overview` (`core.open_wo`) | `status NOT IN ('cancelled','rejected','draft','done','skipped','closed','verified')` | login | 99 ใบ |
| In Progress | `repair.status` | `overview` (`counts.active`) | `status IN ('in_progress','paused','waiting_parts','waiting_external','waiting_approval')` | login | 26 ใบ |
| Completed (ในช่วง) | `repair.completed_at`, `status` | `overview` (`core.wo_completed_in_range`) | ปิดงานจริง + ช่วง `completed_at` | login | **0 — ยังไม่มีใบที่ปิด** |
| Pending / Unassigned | `repair.status`, `assigned_to` | `overview` (`counts.unassigned`, `counts.pending_approval`) | `open/acknowledged AND assigned_to IS NULL` | login | 99 ใบไม่มีผู้รับ |
| Overdue | `repair.sla_due_at`, `estimated_completion_date`, `created_at`, `status` | `overview` (`core.overdue_wo`) | ดู KPI_FORMULAS §2 | login | 71 ใบ (มาจากกฎเปิดเกิน 7 วัน เพราะไม่มี due date) |
| Completion Rate | ตามข้างบน | `overview` (`core.wo_completion_rate`) | `completed_in_range / total_created * 100` | login | 0% (ตัวตั้ง 0) |
| Preventive / Corrective | `repair.source_type`, `repair.work_order_type`, `pm_am_id`, `pm_plan_id` | `overview` (`breakdown_count`), `action=failure` | `source_type='breakdown'` หรือ work_order_type ∈ breakdown/corrective/emergency/urgent | login | 10 ใบเป็น breakdown |
| Work Order Trend | `repair.created_at` / `completed_at` | `action=trend` | รายวัน/รายเดือนตาม `range` (≤ 62 วัน/ครั้ง) | login | ใช้ 12 calls ต่อปี (ข้อจำกัด API) |
| Work Order Status Distribution | `repair.status` | `overview` (`counts.*`) | นับตามกลุ่มสถานะ | login | OK |
| Priority Distribution | `repair.priority` | `action=failure` / `action=wo` | `enum(low,medium,high,critical)` | login | OK |
| Department Performance | `repair.department_id` → `departments.name` | `overview` + `action=wo` | group by department | login (scope) | `department_id` มีค่า 99/99 |
| Machine / Asset Health | `asset_registry.status`, `criticality`, `repair.asset_id` | `action=assets` | ดู KPI_FORMULAS §7 | login | 82 assets active, 82 มีใบงานค้าง |
| Downtime | `repair.downtime_minutes`, `downtime_start/end` | `action=downtime` | `SUM(downtime_minutes)` | login | 0 นาที ทุกแถว |
| MTTR | `repair.repair_time_minutes` (ประทับอัตโนมัติโดย `src/helpers/repair_time.php` ตอนปิดงาน) หรือ `actual_start_at/acknowledged_at` → `completed_at` | `overview` (`core.mttr_hours`) | เฉลี่ย(TIMESTAMPDIFF MINUTE)/60 | login | **NOT AVAILABLE** จนกว่าจะมีใบงานที่ปิด (ตอนนี้ 0 ใบ); ใบที่ปิดใหม่จะมีค่านี้ทันที |
| MTBF | `repair.completed_at`, `source_type='breakdown'`, `asset_id` | `overview` (`core.mtbf_hours`) | ระยะห่างระหว่างรอบซ่อมของเครื่องเดียวกัน 180 วัน | login | **NOT AVAILABLE** |
| SLA Compliance | `repair.completed_at`, `sla_due_at`, `estimated_completion_date`, `planned_end_at` | `overview` (`core.sla_compliance_pct`) | ปิดทันกำหนด / ใบที่ปิดและมี due | login | **NOT AVAILABLE** |
| PM Compliance | `pm_am.due_date`, `completed_at`, `status`; view `v_inspection_dashboard_kpis` | `overview` (`core.pm_compliance_pct`, `pm.*`) | ดู KPI_FORMULAS §5 | login | **NOT AVAILABLE** (0 แถว) |
| Upcoming PM | `pm_am.due_date` | `action=pm&group=due_today/overdue` | `due_date` เทียบ CURDATE() | login | ไม่มีข้อมูล |
| Technician Workload | `repair.assigned_to`, `users.id/full_name`, `work_assignees` | `action=tech`, `/api/v1/workload.php` | group by ช่าง ตามสถานะงาน | role 1,2,6,7 | ยังไม่มีงานผูกช่าง (assigned_to NULL 99/99) |
| Technician avatar | `users.avatar` (base64/data URI), `users.avatar_path`; ผ่าน `repair.assigned_avatar*` | `/api/v1/repair.php` | ใช้ `avatar` ก่อน → `avatar_path` → ตัวย่อชื่อ | login | 10/11 ผู้ใช้มีรูป |
| Problem photo | `repair.before_image_path` (คั่นหลายรูปด้วย `|`), `repair.after_image_path` | `/api/v1/repair.php` | แสดงรูปแรก, กดเปิดเต็ม | login | ว่าง 99/99 |
| Attachments | `repair_attachments(file_path, category)` | `/api/v1/repair_attachment.php?work_order_id=` | category `failure_image` = ก่อนซ่อม | ช่างผู้รับ/หัวหน้า | 0 แถว |
| Spare Parts stock | `spare_parts` | `/api/v1/spare_optimization.php?action=availability` | stock/min_stock/ROP ตาม helper | login | 1,870 รายการ |
| Spare consumption | `repair_spare_parts(quantity_used, unit_price)` | `v_maintenance_cost` | `SUM(qty*price)` | login | 0 แถว |
| Maintenance Cost | `repair.cost_labor/cost_parts/cost_outsource`, `repair_spare_parts` | `action=cost` | ผลรวม 3 ฟิลด์ (+ material) | `kpi_can_see_cost()` | 0 ทุกแถว |
| Failure Pareto | `repair.failure_code_id` → `failure_codes` | `action=failure` | group by failure code | login | ไม่มีใบงานที่ผูก failure code |
| Maintenance Timeline | `repair.created_at, acknowledged_at, actual_start_at, completed_at, closed_at, status_changed_at` | `action=wo` (รายใบ) | แสดงเฉพาะ timestamp ที่มีค่า | login | มีแค่ `created_at`/`updated_at` |
| Notifications / Alerts | `alerts` จาก overview (`sla_at_risk`, `critical_open`, ...) | `overview`, `/api/v1/notifications.php` | ตาม helper `kpi_alerts()` | login | ใช้งานได้กับข้อมูลที่มี |
| Department list | `departments(id,name)` | `/api/v1/departments.php`, `action=options` | – | login | 22 แผนก |
| Asset list | `asset_registry(id,code,name,status,criticality)` | `action=options` | ยกเว้น `status='disposed'` | login | 82 รายการ |

## ฟิลด์ที่ "ไม่มีอยู่ในระบบ" (ห้ามแต่ง)

- ชั่วโมงเดินเครื่อง (operating hours) รายเครื่อง → ไม่มีคอลัมน์/ตารางที่บันทึกจริง → Machine Availability คำนวณไม่ได้
- แผนผลิต/เวลาตามแผน (scheduled time) → ไม่มี → Availability/OEE = NOT AVAILABLE
- ต้นทุนค่าแรงต่อชั่วโมง → ไม่มี rate table → คำนวณต้นทุนย้อนหลังไม่ได้ (มีแต่ค่าที่บันทึกในใบงาน)
- Root cause category ต่อ failure → มี `repair.rca_category` แต่ยังไม่มีข้อมูลกรอก
- ~~SLA definition ต่อ priority~~ → **มีแล้วตั้งแต่ 2026-11-14** (ไม่ใช้ตาราง master แต่ใช้ `settings` + `src/helpers/sla.php`) ดูหัวข้อถัดไป

## SLA / กำหนดส่ง (2026-11-14)

| ข้อมูล | แหล่งจริง | ใช้ที่ไหน | หมายเหตุ |
|---|---|---|---|
| ชั่วโมง SLA ต่อ priority | `settings.sla_hours_critical\|high\|medium\|low` (กลุ่ม `repair_config`) | `sla_hours_map()` ใน `src/helpers/sla.php` | ค่าเริ่มต้น 4/24/72/168 ชม. ถ้าไม่มีแถวใน settings |
| เปิด/ปิดการประทับอัตโนมัติ | `settings.sla_auto_apply` | `sla_auto_apply_enabled()` | ค่าเริ่มต้น 1 = เปิด |
| กำหนดส่งรายใบ | `repair.sla_due_at` | `kpi_is_overdue()`, planning, analytics | ประทับเมื่อจ่ายงาน (ถ้าว่าง) |
| เวลาที่สัญญากับผู้แจ้ง | `repair.estimated_completion_date` | KPI overdue, `/repair/my_tasks`, Gantt | ประทับคู่กับ `sla_due_at` |
| หน้าจอกรอก | `/repair/assign` (บังคับกรอก, prefill จาก SLA ของ priority) | ส่ง `estimated_completion_date` + `sla_due_at` | server บังคับซ้ำ: ถ้าปิด auto และไม่ส่งมา → 422 `SLA_DUE_REQUIRED` |

- Endpoint ที่ใช้ตั้งค่าหน้าจอ: `GET /api/v1/repair.php?reference=codes` คืน `sla.hours` + `sla.auto_apply` เพิ่มจาก `failure_codes`/`repair_codes` เดิม
- หน้าการตั้งค่าจะแสดงช่อง SLA หลังรัน `database/migration_20261114_sla_priority.sql` (INSERT IGNORE, ไม่ทับค่าที่มีอยู่)

### SLA alerts (ช่องทางเดิม ไม่ได้สร้างระบบใหม่)

| งาน | ไฟล์ | อ่านข้อมูลจาก | เกณฑ์ |
|---|---|---|---|
| SLA at-risk / breached (Notification Center + push) | `scripts/notification_engine.php` | `COALESCE(repair.sla_due_at, repair.estimated_completion_date)` | due < now = breached, due ≤ now + `planning_sla_risk_hours` = at-risk |
| SLA เกินกำหนดเข่า LINE (legacy check) | `scripts/alert_check.php` | `COALESCE(sla_due_at, estimated_completion_date, planned_end_at)` | due < now (กันแจ้งซ้ำ 24 ชม. ด้วย needle `SLA-OVERDUE-WO<id>`) |

- ทั้งสองที่ถูกแก้ให้อ่าน `estimated_completion_date` ด้วย — ใบงานที่ได้กำหนดส่งจาก SLA ตอนจ่ายงานจะไม่ถูกข้ามการแจ้งเตือน
- ผู้รับของ at-risk/breached: ผู้รับผิดชอบหลัก (`assigned_to`) + หัวหน้าชุด (role 1,2,6) ผ่าน `notification_rules` (ถ้าไม่มี rule ใช้ dedupe 24 ชม. / ส่ง 1 ครั้งต่อ event ต่อใบงาน)
- รอบรันอัตโนมัติ: Windows Task Scheduler `CMMS-Notify` — `C:\PHP\php.exe C:\inetpub\wwwroot\cmms-tpt\scripts\notification_engine.php` ทุก 1 ชั่วโมง (ถอนด้วย `schtasks /delete /tn CMMS-Notify /f`)
- task รันจาก **โค้ดในโฟลเดอร์ deploy** จึงต้อง deploy backend รุ่นล่าสุดก่อน ฟิลด์ `estimated_completion_date` จึงจะถูกใช้เป็นกำหนดส่งสำรองในรอบอัตโนมัติ
