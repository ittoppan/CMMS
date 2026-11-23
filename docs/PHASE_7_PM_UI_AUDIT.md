# Phase 7 — PM (Maintenance & PM) UI/โครงสร้าง — ส่วนที่ตรวจได้โดยไม่ต้องมีข้อมูล PM

> วันที่: 2026-11-23 · Phase 7 ถูก BLOCKED เพราะไม่มีข้อมูล PM จริง แต่ «audit UI/โครงสร้าง» ทำได้
> วิธี: นับ route จากซอร์ส + ตรวจหัวหน้าหน้าด้วยซอร์ส + เปิดทุกหน้าในของจริงด้วย role 5 + นับแถวในตาราง PM ทุกตาราง

## 1. โครงสร้าง 12 route

| route | PageHeader/DetailHeader | `cmms-page-hero` / `ui/page-header` | เปิดจริง (role 5) |
|---|---|---|---|
| `/pm_am` | ✔ | 0 | 403 |
| `/pm_am/view` | ✔ | 0 | 403 |
| `/pm_am/create` | ✔ | 0 | 403 |
| `/pm_am/edit` | ✔ | 0 | 403 |
| `/pm_am/checklists` | ✔ | 0 | 403 |
| `/pm_am/checksheet` | ✔ | 0 | 403 |
| `/pm_am/dashboard` | ✔ | 0 | 403 |
| `/pm_am/plans` | ✔ | 0 | 403 |
| `/pm_am/plans/create` | ✔ | 0 | 403 |
| `/pm_am/plans/[id]` (ทดสอบ `/plans/1`) | ✔ | 0 | 403 |
| `/pm_am/batch_schedule` | ✔ | 0 | 403 |
| `/pm_am/calendar` | ✔ | 0 | 403 |

**สรุป: 12/12 ใช้ PageHeader/DetailHeader, 0 ไฟล์ใช้ของเก่า** — ผ่านกฎ UI Migration เต็มจำนวน

การเปิดจริง: **12/12 หน้า** ตอบ HTTP 200 + `h1 = "403 — ไม่มีสิทธิ์เข้าใช้หน้านี้"` (เนื้อหา 368–434 ตัวอักษร) เพราะ `menu_permissions` ของ role 5 ที่ `pm_am*` = **0 ทุก key** → **ตรวจ visual/UX ในของจริงไม่ได้**

## 2. สภาพข้อมูล PM จริง (2026-11-23)

| ตาราง | จำนวนแถว |
|---|---|
| `pm_am` | **3** (ทั้งหมด `E2E-SEED`, `created_at 2026-11-23 10:06:41`, asset 91/92/93, สถานะ pending / in_progress / completed) |
| `pm_am_plans` | **0** |
| `pm_am_plan_assets` | **0** |
| `pm_am_plan_checklists` | **0** |
| `pm_am_checklist_results` | **0** |
| `pm_am_attachments` | **0** |
| `pm_planned_parts` | **0** |

→ งาน PM ทั้งโมดูล (แผน → ผูกเครื่อง → checklist → ผลตรวจ → อะไหล่ที่ต้องใช้) **ไม่มีข้อมูลจริงเลย** 3 ใบที่มีเป็นข้อมูลที่ e2e สร้างขึ้นวันนี้

## 3. สิ่งที่ตรวจไม่ได้เพราะเหตุนี้ (ยืนยันเป็น BLOCKED)

- PM compliance / % ตรงกำหนด (สูตรต้องอนุมัติด้วย — P9-4b)
- ปฏิทิน PM / batch schedule ที่มีแผนจริง
- checksheet: การกรอกผล, การให้คะแนน, การเซ็นรับ
- ความเชื่อมโยง PM plan → spare parts (`pm_planned_parts` = 0)
- SLA/แจ้งเตือนงาน PM (อ้าง N5-1..3)

## 4. ต้องขอจากเจ้าของระบบ (ทางเลือก)

- (ก) ข้อมูล PM จริงชุดทดสอบใน DB แยก environment, หรือ
- (ข) อนุมัติสร้างข้อมูลทดสอบ (plan + 3-5 assets + checklist + ผลตรวจ 2 รอบ) ใน non-production
- (ค) บัญชี role ที่มีสิทธิ์ `pm_am` (role 1/2/3/6/7) เพื่อตรวจ UI แม้ข้อมูลว่าง

## 5. สถานะ checkbox

- `[x]` audit UI/โครงสร้างหน้า PM → **เสร็จเท่าที่ทำได้** (12/12 header PASS, runtime 403 by design)
- งาน Phase 7 ที่เหลือยัง **BLOCKED** ตามเดิม
