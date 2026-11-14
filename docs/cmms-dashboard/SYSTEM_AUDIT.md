# CMMS-TPT — System Audit (Phase 0)

> ตรวจเมื่อ: 2026-11-14 · แหล่งอ้างอิง: โค้ดในรีโป + ฐานข้อมูลจริงของเครื่องนี้ (`src/config/db.php`)
> เอกสารนี้บันทึก "สิ่งที่มีจริง" เท่านั้น — ไม่มีการเดาชื่อตาราง/คอลัมน์

## 1. Stack ที่ใช้งานจริง

| ชั้น | เทคโนโลยี | หลักฐาน |
|---|---|---|
| UI | Next.js `^16.2.10` (App Router, `frontend/app`) | `frontend/package.json` |
| ไอคอน | `lucide-react` + `@heroicons/react` | `frontend/package.json`, หน้าจอส่วนใหญ่ |
| กราฟ | `recharts` (ที่ใช้จริงใน dashboard) — **ยังไม่มี `echarts`** | `frontend/package.json`, `app/(dashboard)/dashboard/page.tsx` |
| ตาราง | `@tanstack/react-table` (v9) ผ่าน `components/ui/table` | `components/ui/table.tsx` |
| API | PHP REST (`public/api/v1/*.php`) + `src/helpers/*` | โฟลเดอร์ `public/api/v1` |
| DB | MySQL/MariaDB ผ่าน PDO (`getDb()`) | `src/config/db.php` |
| Auth | PHP session (`requireLogin`, `currentUser`, role helpers) | `src/auth.php`, `src/helpers/roles.php` |
| CSRF | `enforceCsrf()` สำหรับ mutation | `src/csrf.php` |
| Design audit | `python scripts/design-audit.py --strict` (สแกน 242 หน้า) | สคริปต์ในรีโป |

## 2. หน้า Dashboard/Analytics ที่มีอยู่แล้ว (ไม่สร้างซ้ำ)

`frontend/app/(dashboard)/` มี route ที่เกี่ยวข้องโดยตรง:

`dashboard` (wallboard ใหม่), `andon-board`, `analytics`, `cost`, `budget`, `mtbf_mttr`,
`asset-reliability`, `reliability`, `assets`, `asset_registry`, `pm_am`, `repair`,
`repair/workload`, `repair/my_tasks`, `repair/view`, `supervisor/*`, `workforce/*`,
`users/leaderboard`, `reports`, `inspections`, `spare_parts`, `notifications`.

ข้อสรุป: โครง "Enterprise Dashboard" ส่วนใหญ่มีอยู่แล้วในระบบ — งานที่เหลือคือปรับให้ใช้ข้อมูลจริง
และรวมศูนย์ประสบการณ์ ไม่ใช่สร้างระบบใหม่

## 3. API ที่เป็นแหล่งข้อมูล dashboard (มีอยู่แล้ว)

| Endpoint | action/พารามิเตอร์ | ใช้ทำอะไร |
|---|---|---|
| `GET /api/v1/dashboard.php?action=overview` | `range`, `department_id`, `priority`, `status`, ... | KPI หลัก + alerts + PM + assets + options |
| `...&action=trend` | `range` (จำกัด ≤ 62 วัน) | อนุกรมเวลา work order |
| `...&action=downtime` | `range` | downtime รายช่วง |
| `...&action=wo` | `group=all|open|overdue|completed`, `limit`, `offset` | รายการใบงาน |
| `...&action=pm` | `group` | รายการ PM |
| `...&action=cost` | ต้องมีสิทธิ์ดูต้นทุน | ต้นทุน |
| `...&action=failure` | `range` | failure/ Breakdown |
| `...&action=tech` | role 1,2,6,7 | ภาระงานช่าง |
| `...&action=assets` | – | สุขภาพเครื่องจักร |
| `...&action=options` | – | ตัวเลือกตัวกรอง |
| `GET /api/v1/workload.php` | – | ภาระงานรายช่าง (open/overdue/active/7 วัน) |
| `GET /api/v1/repair.php` | `status=open_active`, `limit` | รายการใบงาน + `assigned_name/assigned_avatar*` + `before_image_path` |
| `GET /api/v1/mtbf_mttr.php` | – | ชุดข้อมูล MTBF/MTTR จากตารางที่เกี่ยวข้อง |
| `GET /api/v1/spare_optimization.php?action=availability` | `needs_reorder` | อะไหล่คงคลัง/Reorder |

## 4. สถานะข้อมูลจริงในฐานข้อมูล (นับ ณ วันที่ตรวจ)

| ตาราง | จำนวนแถว | หมายเหตุ |
|---|---:|---|
| `repair` | 99 | `open` 73 · `in_progress` 26 · **ไม่มีใบที่ปิดงาน** |
| `asset_registry` | 82 | `status='active'` ทั้งหมด 82 |
| `departments` | 22 | มี id 1–23 (ไม่มี 22) |
| `users` | 11 | 9 คนมี `avatar` (base64), 1 คนมี `avatar_path`, `is_active` ใช้กรอง |
| `work_assignees` | 5 | `ref_id` = 1,2,3 — **ไม่มี repair id เหล่านี้** (repair id เริ่มที่ 6) |
| `repair_attachments` | 0 | ไม่มีไฟล์แนบ/รูปหลักฐาน |
| `repair_spare_parts` | 0 | ยังไม่มีการเบิกอะไหล่ผูกใบงาน |
| `spare_parts` | 1,870 | มีข้อมูลอะไหล่จริง |
| `pm_am` | 0 | ยังไม่มีงาน PM |
| `pm_am_plans` | 0 | ยังไม่มีแผน PM |
| `inspection_schedules` | 0 | inspection ยังว่าง |
| `failure_codes` | 6 | FC-MEC/ELE/HYD/PNU/SFW/OTR |
| `failure_events` | 0 | ยังไม่มี event ความเสียหาย |
| `v_maintenance_cost` | 99 | view จาก `repair` + `repair_spare_parts` |
| `budget_plan` | 12 | มีแผนงบ |
| `audit_logs` | 665 | มีร่องรอยการใช้งาน |

## 5. ช่องว่างข้อมูลที่กระทบ KPI (สำคัญ)

| ฟิลด์ | สภาพจริง | ผลต่อ KPI |
|---|---|---|
| `repair.completed_at` | NULL 99/99 | Completion Rate จริง=0, ไม่มี trend การปิดงาน |
| `repair.repair_time_minutes` | NULL 99/99 | MTTR = NOT AVAILABLE |
| `repair.actual_start_at` / `acknowledged_at` | NULL 99/99 | ไม่มีเวลาซ่อมจริงให้ fallback |
| `repair.downtime_minutes` | 0 ทุกแถว | Downtime = 0 (จริงตามข้อมูล) ไม่ใช่ N/A |
| `repair.cost_*` | 0 ทุกแถว (มีค่าคอลัมน์แต่เป็น 0) | ต้นทุน = 0 — ต้องแสดงว่า "ยังไม่บันทึก" ไม่ใช่ "ไม่มีค่าใช้จ่าย" |
| `repair.assigned_to` | NULL 99/99 | ช่างไม่มีงานผูกกับใบงานจริง |
| `repair.before_image_path` | ว่าง 99/99 | หน้ารูปช่าง/รูปปัญหา จะขึ้น "ไม่มีรูป" จนกว่าจะมีการอัปโหลด |
| `repair.failure_code_id` | NULL 99/99 | Failure Pareto ว่าง |
| `pm_am`, `pm_am_plans`, `inspection_schedules` | 0 แถว | PM Compliance = NOT AVAILABLE (ค่าจาก view เป็น 0.00 จาก 0 กำหนดการ) |
| `work_assignees` | ชี้ไป repair id ที่ไม่มีอยู่ | ภาระงานรายช่างจะเห็นเฉพาะกลุ่ม "ยังไม่มอบหมาย" |

## 6. สิทธิ์และการเข้าถึง (ตรวจจากโค้ด)

- ทุก endpoint เรียก `requireLogin($pdo)` ก่อนทำงาน; mutation มี `enforceCsrf()`
- `kpi_scope()` จำกัดขอบเขตข้อมูลตาม role (ช่าง/หัวหน้า/ผู้จัดการ) ที่ระดับ SQL
- `kpi_can_see_cost()` + `requireRole()` กันข้อมูลต้นทุน
- `dashboard.php?action=tech` เปิดเฉพาะ role 1,2,6,7
- `repair_attachment.php` ตรวจว่าเป็นช่างผู้รับงาน/หัวหน้าเท่านั้นก่อนให้เห็น/อัปโหลดรูป

## 7. ข้อสรุปของ Phase 0

1. ไม่ต้องสร้าง backend/DB ใหม่ — ทุก KPI ที่เป็นไปได้มี helper อยู่แล้วใน `src/helpers/kpi.php`
2. ระบบยังไม่มี "ข้อมูลประวัติ" พอสำหรับ analytics เชิงเปรียบเทียบ (ปิดงาน/PM/ต้นทุน/ดาวน์ไทม์)
   → โมดูลเหล่านี้ต้องแสดง NOT AVAILABLE พร้อมระบุแหล่งที่ขาด ห้ามคำนวณปลอม
3. ปัญหาที่ควรแก้เชิงข้อมูล (ไม่ใช่โค้ด): มอบหมายช่างให้ใบงาน, บันทึก `completed_at`/`repair_time_minutes`,
   อัปรูปปัญหา, สร้าง PM plan — เมื่อมีข้อมูลเหล่านี้ dashboard ทุกโมดูลจะทำงานได้ทันทีโดยไม่ต้องแก้สูตร
