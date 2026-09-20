# Scheduling Rules (กฎการวางแผนรอบเวลา) — Phase 25

> ควบคุมทั้งหมดใน `src/helpers/planning.php` + re-validate ที่ `public/api/v1/planning.php`
> หลักการ: backend เป็นผู้ตัดสินใจเสมอ (UI แสดงผลเท่านั้น) — ไม่ล็อกมติพลาดใส่ body

## 1. หลักการห้ามละเมิด

1. **ห้ามเปลี่ยน priority อัตโนมัติ** — engine (`pln_priority_explanation`) *แนะนำ* ผู้วางแผนเท่านั้น (ระดับ SUGGESTED เช่น CRITICAL/HIGH/NORMAL) และคนต้องกดเปลี่ยนเอง + ระบุเหตุผล → บันทึก audit
2. **ห้ามจองสต็อกเองตอนวางแผน** — สต็อก = Sage 300 ผ่าน `spare_issue_requests`; อะไหล่ไม่พร้อม = warning ใน readiness ไม่ใช่ block ฮาร์ด
3. **ห้ามละเลยสถานะ** — งานที่จบแล้ว (done/completed/pending_verification/resolved) จะ schedule/assign/reschedule/priority/emergency ไม่ได้เลย (คืน 409)
4. **ทุกการเปลี่ยนแปลงมี audit + เหตุผล** — `repair_schedule_log` + `repair_activity_log` (ดูผ่าน `?action=schedule_log`)
5. **idempotency** — ทุก PUT/POST ยอม `X-Idempotent-Key` (กัน re-sync ซ้ำของ client ออฟไลน์) — ตอบ `replay:true` สำหรับ request ซ้ำ

## 2. การเรียงลำดับกลุ่ม (กลุ่มไหนถูกวางแผนก่อน)

`pln_group()` เปรียบเทียบตามความเร่ง จัดกลุ่มแบบ cascade:

```
overdue > at_risk > scheduled > unscheduled > unplanned > new_request
```

- `overdue`: `kpi_is_overdue()` (ไม่ทำแล้วเกิน SLA) — กลุ่มแรกสุดต้องจัดการ
- `at_risk`: `sla_due_at < now + planning_sla_risk_hours` (default 24 ชม.)
- `scheduled`: มี `planned_start_at` + `planned_end_at` จริง
- `unscheduled`: สถานะปกติ (open/pending_assignment/acknowledged) ยังไม่มีรอบ
- `unplanned`: pending_approval / approved / draft
- `new_request`: คำขอซ่อมใหม่ (maintenance_requests.status='open') — ยังเป็นคำขอ ยังไม่มีใบงาน

ในหน้า queue เรียงตาม: `priority_explanation.level` (CRITICAL→LOW) แล้วจึงเรียง overdue ก่อน

## 3. กฎช่วงเวลา (validation)

| เงื่อนไข | ผล |
|---|---|
| `planned_start_at` / `planned_end_at` ว่าง | 400 — ต้องระบุช่วงเวลา |
| `end <= start` | 400 — สิ้นสุดต้องอยู่หลังเริ่ม |
| ช่วงชนกับงานอื่น (ดู SCHEDULING_CONFLICTS.md) | 409 + รายการ conflict — เว้น `force:true` |
| งานสถานะจบแล้ว | 409 |
| bulk เกิน 100 ใบ | 400 |

- `sla_due_at` เมื่อยังไม่มีจะถูก set = ช่วงเวลาใหม่ (schedule/assign) เพื่อให้ KPI SLA ไม่หลุด
- `planner_id` ถูกบันทึกทุกครั้ง (ระบุผู้วางแผน)

## 4. งานฉุกเฉิน (emergency)

`PUT ?action=emergency` (ต้องระบุ `reason`):

1. `work_order_type = 'emergency'` + `priority = 'critical'` (**override จริง** — เป็น exception ที่คนสั่ง + เหตุผล)
2. กำหนดรอบทันที: เริ่ม `now + 10 นาที` ระยะ = `estimated_duration_minutes` (ถ้าไม่มีใช้ 120 นาที)
3. `sla_due_at` = เริ่ม + 8 ชม. (ถ้ายังไม่มี)
4. สถานะ pre-work (draft/pending_approval/approved/open/acknowledged) → `assigned`
5. แจ้งเตือนศูนย์กลาง (NotificationCenter) ให้ role 1,2,6 + audit (action='emergency')
6. คืนรายชื่องานที่ถูกทับ (affected conflicts สูงสุด 20)

⚠️ งานฉุกเฉินจะไม่ลง trail ว่า "วางแผน" — แต่บันทึกเป็นเหตุการณ์ฉุกเฉิน เพื่อให้ audit ชัดเจน

## 5. การวางแผนแบบกลุ่ม (bulk)

`POST ?action=bulk` — `operation=schedule|assign`:

- **dry_run (preview)**: คืน conflict + readiness + duration_estimate ของทุกใบ **โดยไม่เขียน DB** — ใช้ UI แสดง "จะเกิดอะไร"
- **assign**: ที่ได้รับ `lead_id` คนเดียว + `team_ids` — ตรวจ double-assign (งานถูกมอบให้คนนี้และสถานะ assigned/accepted → ปฏิเสธ)
- แต่ละใบได้ผลแยก (success/error) — ใบใดชนหยุดใบนั้น ไม่พังทั้งก้อน
- คำขอซ่อมใหม่ (kind='request') จะ**ไม่**ถูกนำมา bulk ได้ — มีแค่ใบงานจริง (repair)

## 6. ขอบข่ายการวางแผน (scope)

- ทุก query ที่อ่านงานใช้ `kpi_scope()` ตาม role — ช่างเห็นเฉพาะงานตัวเอง
- planner (1,2,6,7) เห็นทั้งหมด
- เมนูตาม menu_permissions: planning/planning-calendar = 1,2,6,7 — field/plan = 1,2,3,6,7