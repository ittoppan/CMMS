# ภาพรวมการวางแผนซ่อมบำรุงทั้งระบบ (Maintenance Planning Overview)

> เอกสารนี้ตอบคำถาม "Planning ซ้ำกับ PM หรือไม่" และสรุปว่าการวางแผนซ่อมบำรุงใน CMMS-TPT กระจายอยู่ที่หน้า/เอพีไอใด
> อัปเดตล่าสุด: 2026-11-14 — ครอบคลุม Planning Center, ปฏิทินวางแผน, แผน PM/AM, Supervisor, Workforce, Repair (assign/workload), Shutdown, Calibration

## 1. สรุปสั้น

- **Planning ไม่ซ้ำกับ PM/AM** — PM คือ *ต้นทางความต้องการ* (ทำอะไร ตามรอบไหน) ส่วน Planning คือ *การจัดสรรทรัพยากร* (เมื่อไร ใคร ที่ไหน)
- แต่ **ภายในกลุ่ม "วางแผน/จัดคน" เองซ้ำกัน 4 ทาง** และมี **เอนจินวางแผน 2 ชุด** ที่คำนวณเรื่องเดียวกันคนละที่ (ดู §4) — นี่คือจุดที่ควรยุบรวมเป็นลำดับถัดไป ไม่ใช่การยุบ Planning เข้ากับ PM
- การเชื่อมที่ถูกต้องมีอยู่แล้วจุดเดียว: `pm_plans.php` action `generate_wo` สร้างแถวใน `repair` ด้วย `source_type='pm'`, `pm_am_id`, `pm_plan_id` → งานป้องกันจึงไหลเข้า Planning ได้ (แต่เดิมไม่มีกำหนดส่ง ดู §5 ข้อ 1)

## 2. วงจรการวางแผน 8 ขั้น → หน้า / เอพีไอ / ตาราง

| # | ขั้น | หน้า (Next.js) | เอพีไอ | ตารางหลัก |
|---|------|----------------|--------|-----------|
| 1 | รับแจ้งซ่อม / คำขอ | `/request`, `/supervisor/queue` | `maintenance_requests.php`, `supervisor.php?action=requests` | `maintenance_requests` |
| 2 | อนุมัติคำขอเป็นใบงาน | `/approval`, `/supervisor/review` | `approval.php`, `supervisor.php` (`approve_request`/`reject_request`) | `repair`, `approval_log` |
| 3 | ตั้งโปรแกรมป้องกัน (PM/AM) | `/pm_am`, `/pm_am/plans`, `/pm_am/calendar`, `/pm_am/batch_schedule` | `pm_am.php`, `pm_plans.php`, `pm_ical.php` (ฟีดปฏิทิน) | `pm_am`, `pm_plans`, `pm_am_spare_parts` |
| 4 | แปลงรอบ PM → ใบงาน | `/pm_am/plans` (ปุ่มเปิดงาน) | `pm_plans.php?action=generate_wo` | `repair` (`source_type='pm'`) |
| 5 | จัดคิว / วางรอบเวลา / มอบหมาย | `/planning` (ศูนย์วางแผน), `/planning/calendar` | `planning.php` (`action=center|calendar|queue`), PUT `schedule`/`reschedule`/`assign`/`priority`/`emergency` | `repair.planned_start_at/planned_end_at`, `repair_assignees`, `repair_schedule_log` |
| 6 | จัดคนเชิงกำลังคน (capacity/ทักษะ/ใบรับรอง) | `/workforce/*` (capacity, conflicts, candidates, skills, certifications, shifts, crews, training, technicians) | `workforce.php` (`action=capacity|workload|candidates|gap|readiness|conflicts|...`) | `user_skills`, `user_certifications`, `workforce_shifts`, `crews` |
| 7 | ลงมือทำ / ปิดงาน | `/field/plan` (แผนของฉัน), `/field/work/[id]`, `/repair/kanban` | `planning.php?action=my_plan`, `repair.php` | `repair`, `repair_activity_log`, `pm_am_checksheet` |
| 8 | งานวางแผนเฉพาะทาง | `/shutdown`, `/calibration/schedule`, `/contractors/work` | `shutdown.php`, `calibration_management.php`, `contractors.php` | `shutdown_*`, `calibration_*`, `contractor_work` |

## 3. Planning กับ PM/AM ต่างกันอย่างไร (ไม่ซ้ำ)

| ประเด็น | PM/AM (`/pm_am/*`) | Planning (`/planning*`) |
|---------|--------------------|--------------------------|
| คำถามที่ตอบ | "ต้องทำอะไร ที่เครื่องไหน ตามรอบใด" | "จะทำเมื่อไร ใครทำ ทัน SLA ไหม" |
| หน่วยข้อมูล | แผน PM (`pm_plans`) + รอบ (`pm_am`) | ใบงานเปิด (`repair`) + คำขอ (`maintenance_requests`) |
| ฟังก์ชันเด่น | รอบตามวัน/มิเตอร์, เช็กลิสต์, อะไหล่แผน, เลื่อนรอบ, ฟีด iCal | คิว 6 กลุ่ม, ความขัดแย้ง, ความพร้อม, skill match, SLA risk, จองรอบกลุ่ม |
| ข้อมูลที่เขียน | `pm_am`, `pm_am_spare_parts`, `pm_am_checksheet` | `repair.planned_*`, `repair_assignees`, `repair_schedule_log` |
| จุดเชื่อม | `generate_wo` สร้างใบงาน | รับใบงานนั้นเข้าคิว (กลุ่ม `unscheduled` → `scheduled`) |

## 4. จุดซ้ำจริง (ต้องตัดสินใจก่อนขยายฟีเจอร์)

| เรื่อง | ที่มีอยู่แล้วที่ 1 | ที่มีอยู่แล้วที่ 2 | ความเสี่ยง / แนวทาง |
|--------|-------------------|-------------------|---------------------|
| เอนจินวางแผน | `src/helpers/planning.php` (Phase 25): workload, conflicts, readiness, skill match, SLA risk | `src/helpers/workforce.php` (Phase 34, ~2.3k บรรทัด): capacity, availability, candidates, qualification, readiness, assign | สองชุดคำนวณคล้ายกันแต่สูตร/สิทธิ์ต่าง — Planning ไม่เรียก workforce เลย (ใช้แค่ `pln_get_skills`). **แนวทาง: ให้ Planning เป็น UI เดียว แล้วเรียก `wf_*` เป็นแหล่งความจริงเรื่องกำลังคน** |
| วางรอบเวลา/มอบหมาย (เขียนข้อมูล) | `planning.php` PUT `schedule`/`reschedule`/`assign` (มี conflict check + idempotency + `repair_schedule_log`) | `supervisor.php` PUT `save_plan`/`assign`/`bulk_assign`/`reschedule` (หน้า `/supervisor/plan`) | เขียนฟิลด์เดียวกัน 2 ทางValidation ไม่เท่ากัน → ตารางชนกันได้. **แนวทาง: ให้ `/supervisor/plan` เรียก planning API หรือปิดปุ่มวางแผน เหลือไว้แค่กำกับงาน** |
| ดูภาระงานช่าง | `/planning` (workload strip จาก `pln_technician_workload`) | `/repair/workload` (`workload.php`) และ `/workforce/capacity` (`wf_capacity`) | ตัวเลข 3 ที่ไม่ตรงกัน. **แนวทาง: เลือกหนึ่งเป็น canonical (แนะนำ `workforce`) แล้วให้ Planning/repair อ่านตัวเดียวกัน** |
| ปฏิทิน | `/planning/calendar` (ใบงานที่วางรอบแล้ว) | `/pm_am/calendar` (รอบ PM), `/supervisor/plan` (ตารางกะ), `/calibration/schedule` | มุมมองซ้ำแต่คนละแหล่ง. **ปรับแล้วบางส่วน: planning calendar แสดงรอบ PM ที่ครบกำหนดซ้อนจาง ๆ** |
| คิวงาน | `/planning` (คิว 6 กลุ่ม) | `/supervisor/queue` (คิวตามสถานะ) | ใกล้กันมาก. **แนวทาง: คง `/planning` สำหรับวางแผน, `/supervisor/queue` สำหรับติดตาม/อนุมัติ** |
| จัดช่างให้งาน | `/planning` (dialog assign + skill matrix) | `/repair/assign` (`repair.php` + `users.php`), `/workforce/candidates` (`wf_candidates`) | 3 ที่. **แนวทาง: `/repair/assign` = ทางลัดของหัวหน้างาน, อัปเดตให้เห็น readiness/เหตุผลจัดอันดับ** |

## 5. สิ่งที่ปรับในรอบนี้ (ไม่แตะ schema / ไม่แก้ข้อมูล)

1. **งาน PM ที่เปิดเป็นใบงานมีกำหนดส่งตามรอบแล้ว** — `public/api/v1/pm_plans.php` (`generate_wo`) เขียน `sla_due_at` / `estimated_completion_date` = ปลายวันของ `pm_am.due_date` และติด `work_order_type='preventive'`
   - ผล: ใบงานจาก PM ไม่ถูกมองว่า "ไม่มีกำหนดส่ง" และไม่ถูก SLA คิดแบบ "ตอนจ่ายงาน + ชั่วโมง priority" (ซึ่งจะทำให้รอบที่ครบกำหนดอีกเดือนขึ้นสถานะเสี่ยงทันที)
   - `planned_start_at` / `planned_end_at` ยังว่างโดยตั้งใจ — ให้ศูนย์วางแผนเป็นผู้จัดรอบเวลา
2. **ศูนย์วางแผนเห็นความต้องการ PM ล่วงหน้า** — `planning.php?action=center` คืน `pm_due` = `{overdue, next7, next30}` (นับเฉพาะรอบที่ยังไม่จบและยังไม่มีใบงานค้าง) และหน้า `/planning` แสดงการ์ด "เส้นทางวางแผนซ่อมบำรุง" พร้อมตัวเลข + เตือนเมื่อมีรอบ PM เกินกำหนด
3. **ปฏิทินวางแผนเห็นรอบ PM ซ้อนกับงานซ่อม** — `planning.php?action=calendar` คืน `pm_due[]` ในช่วงวันที่ขอ; หน้า `/planning/calendar` แสดงการ์ดเส้นประ "PM · รหัสเครื่อง" (สูงสุด 2 ต่อวัน + ตัวนับ) และรายการเต็มในมุมมองรายวัน + คำอธิบายสัญลักษณ์ (อ่านอย่างเดียว ไม่สร้าง/เลื่อนรอบ)
4. **ทางเข้าครบวงจรในที่เดียว** — การ์ดใน `/planning` ลิงก์ไป `/planning/calendar`, `/pm_am/plans`, `/workforce/capacity`, `/workforce/conflicts`

## 6. ช่องว่างที่ยังเหลือ (ลำดับที่แนะนำ)

1. ให้ `/supervisor/plan` เลิกเขียน `planned_*` เอง แล้วเรียก `planning.php` (ตัดความเสี่ยงตารางชนกัน 2 ทาง)
2. ยุบสูตรกำลังคน: ให้ `pln_technician_workload`/`pln_detect_conflicts` เรียก `wf_availability`/`wf_capacity` (แหล่งเดียว: กะ + ลา + ใบรับรอง)
3. เตือนเกินกำลังคนตอนจองรอบกลุ่ม (`bulk`) — ปัจจุบัน `pln_detect_conflicts` ตรวจแค่ชนเวลา ไม่เทียบชั่วโมงว่าง
4. เปิดใช้ของที่มีใน API แต่ UI ไม่เรียก: `readiness` (`getReadiness`) และ `schedule_log` (`getScheduleLog`) — ใช้ตอบ "ทำไมรอบนี้ถูกเลื่อน"
5. เพิ่มตัวกรองคิว `technician_id` / `asset_id` / `priority` ใน UI (API `plnGetQueue` รองรับแล้ว)
6. นับภาระงาน PM ใน workload strip (ตอนนี้เห็นเป็นจำนวนรอบแยก ไม่ถูกบวกเข้าชั่วโมงช่าง)

## 7. ข้อจำกัดของการตรวจรอบนี้

- ยังไม่ได้ตรวจ UI ด้วยตาหลังล็อกอิน (ไม่มี credential ที่ใช้ได้ใน environment นี้) — ตรวจได้ถึงระดับ typecheck/build/deploy และ `php -l`
- ไม่ได้รัน migration หรือแก้ข้อมูลใด ๆ; ตัวเลข KPI/`pm_due` คำนวณสดจากตารางจริงทุกครั้งที่เรียก
