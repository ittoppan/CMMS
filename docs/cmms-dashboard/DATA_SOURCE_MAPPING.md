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
- SLA definition ต่อ priority → มี `sla_due_at` รายใบ แต่ไม่มีตาราง SLA master
