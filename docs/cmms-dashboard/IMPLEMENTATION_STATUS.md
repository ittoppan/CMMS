# CMMS-TPT Dashboard — Implementation Status

> อัปเดต: 2026-11-14 · สถานะใช้ป้าย PASS / FAIL / BLOCKED / NOT TESTED ตามจริง

## สรุปผู้บริหาร

- Dashboard wallboard (แดชบอร์ดแรก) + แดชบอร์ดพนักงาน (รูปช่าง/รูปปัญหา) + TV rotation: **PASS**
- Analytics เชิงเปรียบเทียบ (Completion rate/MTTR/MTBF/PM/Cost/Downtime): **BLOCKED by data** — โค้ดพร้อม แต่ฐานข้อมูลยังไม่มีใบงานที่ปิด/PM/ต้นทุน
- การย้ายกราฟไป Apache ECharts: **BLOCKED (ยังไม่ติดตั้ง dependency)** — ระบบใช้ recharts อยู่และทำงานได้
- เอกสาร audit/mapping/KPI: **PASS**

## ตารางสถานะราย Phase

| Phase | รายการ | สถานะ | หลักฐาน / เหตุผล |
|---|---|---|---|
| 0 | Project audit | PASS | `SYSTEM_AUDIT.md` (ตรวจ schema + API + helpers จริง) |
| 1 | DB/API mapping | PASS | `DATA_SOURCE_MAPPING.md` |
| 2 | KPI formula registry | PASS | `KPI_FORMULAS.md` (ถอดจาก `src/helpers/kpi.php`) |
| 3 | Enterprise design system | PASS (มีอยู่) | `app/globals.css` + `components/ui/*` + `app/tower.css` (wallboard scope) |
| 4 | Apache ECharts foundation | BLOCKED | ยังไม่มี `echarts`/`echarts-for-react` ใน `package.json`; ต้องอนุมัติเพิ่ม dependency ก่อน |
| 5 | Global maintenance dashboard | PASS | `app/(dashboard)/dashboard/page.tsx` — KPI, trend 12 เดือน, WO status, PM, OEE N/A |
| 6 | Technician performance dashboard | PASS | `app/(dashboard)/repair/workload/page.tsx` — การ์ดช่าง + รูป + งานที่ทำ + รูปปัญหา |
| 7 | Technician detail | PASS (มีอยู่) | `app/(dashboard)/workforce/technicians/[userId]/page.tsx` |
| 8 | Machine analytics | PASS (บางส่วน) | `asset-reliability`, `mtbf_mttr`, `assets`; MTBF/MTTR แสดง N/A เพราะไม่มีใบปิด |
| 9 | PM analytics | BLOCKED | `pm_am`/`pm_am_plans` 0 แถว |
| 10 | Corrective maintenance | BLOCKED (บางส่วน) | `failure_code_id` ว่าง 99/99 → Pareto ว่าง |
| 11 | Cost analytics | PASS (แสดง 0 พร้อมป้ายยังไม่บันทึก) | `/cost`, `dashboard.php?action=cost` |
| 12 | Spare parts analytics | PASS (stock) / BLOCKED (consumption) | `spare_parts` 1,870 แถว แต่ `repair_spare_parts` 0 |
| 13 | Work order analytics | PASS | `app/(dashboard)/repair/page.tsx` (filter/sort/export/drill-down) |
| 14 | Maintenance timeline | NOT TESTED | มี timestamp แค่ `created_at/updated_at` ในข้อมูลจริง |
| 15 | Notification & alert dashboard | PASS (มีอยู่) | `app/(dashboard)/notifications`, `kpi_alerts()` |
| 16 | Reports & export | PASS (มีอยู่) | `app/(dashboard)/reports`, export PDF/Excel ในหน้า repair |
| 17 | Drill-down integration | PASS (เพิ่มในรอบนี้) | KPI 4 ใบใน dashboard กดแล้วไป `/repair?status=...` |
| 18 | Responsive optimization | PASS | wallboard ไม่ scroll ที่ 1920×1080 / 2560×1440 / 3840×2160 (ตรวจรอบก่อน) |
| 19 | Security audit | PASS (ตรวจโค้ด) | `SECURITY_REPORT.md` — ไม่ได้ pen-test |
| 20 | Testing | PARTIAL | `TEST_REPORT.md` — tsc/build/audit ผ่าน; UI ไม่ได้คลิกทดสอบด้วยตา |
| 21 | Production readiness | BLOCKED (deploy ยังไม่ทำในรอบนี้) | `PRODUCTION_READINESS.md` |
| 22 | SLA ตาม priority + บังคับเวลาคาดเสร็จตอนจ่ายงาน | PASS (ตรวจเฉพาะ syntax/type/build — UI ยังไม่คลิกทดสอบ) | `src/helpers/sla.php` (ใหม่), `repair.php`, `supervisor.php`, `/repair/assign`, `/settings` |

## ไฟล์ที่แก้/เพิ่มในรอบนี้

| ไฟล์ | ประเภท | รายละเอียด |
|---|---|---|
| `frontend/app/(dashboard)/dashboard/page.tsx` | แก้ | KPI card รองรับ `href` (overlay link) + ชิป TV rotation + ปุ่ม pause/play |
| `frontend/app/(dashboard)/repair/workload/page.tsx` | แก้ | แดชบอร์ดรายช่าง: รูปช่าง, งานที่ทำ, รูปปัญหา, ตัวชี้วัด, TV chip |
| `frontend/app/tower.css` | แก้ | `.tower-kpi-link`, `.tower-kpi-hit`, `.tower-dot[data-tone="amber"]` |
| `frontend/lib/use-tv-rotate.ts` | เพิ่ม | hook สลับหน้าอัตโนมัติ (interval/pages/tv=0, pause จำใน sessionStorage) |
| `docs/cmms-dashboard/*.md` | เพิ่ม | ชุดเอกสาร 11 ไฟล์ |

## Screenshots ที่มีในรีโป

| ไฟล์ | หน้า | ที่มา |
|---|---|---|
| `screenshots/dashboard-tower-1920x1080.png` | `/dashboard` (wallboard) | จับจาก dev เมื่อ 2026-11-13 หลัง build ที่มี TV rotation |
| `screenshots/production-dashboard-1920x1080.png` | `/dashboard` บน production (port 3001) | จับเมื่อ 2026-11-13 |
| `screenshots/reference-dashboard.jpg` | ภาพอ้างอิงที่ผู้ใช้ให้มา | ใช้เทียบ layout |

> รอบนี้ (2026-11-14) ไม่ได้จับภาพใหม่ — การเปลี่ยน KPI drill-down ไม่กระทบหน้าตา (เฉพาะ overlay link)
> และยังไม่มี screenshot ของ `/repair/workload` ที่มีรูปจริง เพราะข้อมูล `before_image_path` ว่างทั้งหมด

## Data enablement — 2026-11-14 (ปลดล็อก KPI ด้วยข้อมูลจริง)

| Task | รายการ | สถานะ | ไฟล์ |
|---|---|---|---|
| DE-1 | บันทึกเวลาซ่อมจริงอัตโนมัติเมื่อปิดงาน (`repair_time_minutes`) = (completed − actual_start/acknowledged) − เวลาหยุดงาน | PASS | `src/helpers/repair_time.php` (ใหม่), `public/api/v1/repair.php`, `public/api/v1/supervisor.php` |
| DE-2 | รวมสูตรเวลาซ่อมให้เหลือที่เดียว (supervisor เดิมคิดรวม `planned_start_at` และไม่หักเวลาหยุด → แก้ให้ตรงกัน) | PASS | `public/api/v1/supervisor.php` |
| DE-3 | ขั้นตอนมอบหมายงาน: เพิ่มตัวเลือก "มอบหมายอย่างเดียว" (สถานะ `assigned`, ยังไม่ประทับเวลาเริ่มซ่อม) และ "เริ่มงานทันที" | PASS | `frontend/app/(dashboard)/repair/assign/page.tsx` |
| DE-4 | ให้หน้ามอบหมายเห็นงานที่ "มอบหมายแล้ว/ช่างรับงานแล้ว" (เดิมกรองเฉพาะ open/in_progress → งานหายจากลิสต์หลังจ่ายงาน) | PASS | `frontend/app/(dashboard)/repair/assign/page.tsx` |
| DE-5 | SLA ตาม priority: `sla_hours_<priority>` ใน settings + ประทับ `sla_due_at`/`estimated_completion_date` เมื่อจ่ายงาน (เฉพาะช่องว่าง) | PASS | `src/helpers/sla.php` (ใหม่), `src/config/settings_defaults.php`, `public/api/v1/repair.php`, `public/api/v1/supervisor.php` |
| DE-6 | บังคับกรอกเวลาคาดเสร็จในหน้าจ่ายงาน (prefill จาก SLA ของ priority) + server บังคับซ้ำด้วย 422 `SLA_DUE_REQUIRED` เมื่อปิด auto-apply | PASS | `frontend/app/(dashboard)/repair/assign/page.tsx`, `public/api/v1/repair.php` |
| DE-7 | เปิดช่องแก้ค่า SLA ในหน้า `/settings` (กลุ่ม `repair_config`) + migration `INSERT IGNORE` | PASS (โค้ดพร้อม; ต้องรัน migration บนเครื่องนั้นก่อนช่องจะโผล่) | `frontend/app/(dashboard)/settings/page.tsx`, `database/migration_20261114_sla_priority.sql` |

### ผลต่อ KPI

- MTTR/ต้นทุนค่าแรง/ภาระงาน จะมี `repair_time_minutes` จริงตั้งแต่ใบงานแรกที่ปิดหลัง deploy
- ใบงาน 99 ใบที่ค้างอยู่ **ยังไม่มี** เวลาซ่อม (ยังไม่เคยปิดงาน) — ต้องปิดงานจริงก่อน ตัวเลขจะขึ้น
- ใบงานที่จ่ายงานหลัง deploy จะได้ `sla_due_at`/`estimated_completion_date` จริงทันที → KPI Overdue ไม่พึ่งกฎ 7 วันอีกต่อไป (ใบงานเก่าที่ไม่ถูกจ่ายยังใช้กฎเดิม และไม่ถูก backfill)
- MTTR บนแดชบอร์ดยัง fallback `actual_start_at → completed_at` ได้อยู่ (สอดคล้องกัน)
- `assigned` เป็นสถานะใน Phase 14 ที่ backend อนุญาตเฉพาะ canSupervisor (role 1,2,6,7) — UI ตรวจบทบาทก่อนแสดงตัวเลือก จึงไม่ทำให้บทบาท 8 ใช้งานไม่ได้

### Tests (รันจริง)

| รายการ | ผล |
|---|---|
| `php -l` ทั้ง 3 ไฟล์ PHP | PASS |
| Self-test helper ใน transaction + rollback (สร้างใบงานจำลอง 120 นาที, pause 20 นาที) | PASS — preview/stamp/stored = 100, เรียกซ้ำไม่เขียนทับ, rollback แล้วไม่มีแถวทดสอบเหลือ (0) |
| `npx tsc --noEmit` | PASS |
| UI: กดมอบหมาย/ปิดงานผ่านเบราว์เซอร์ | NOT TESTED |

## งานถัดไป (ลำดับที่แนะนำ)

1. **Data enablement (สำคัญสุด):** มอบหมายช่างให้ใบงาน (`repair.assigned_to` หรือ `work_assignees` ที่ชี้ id จริง), บันทึก `completed_at`/`repair_time_minutes`, อัปรูปก่อนซ่อม → ปลดล็อก MTTR/Completion/Technician dashboard ทันทีโดยไม่ต้องแก้สูตร
2. สร้าง PM plan + งาน PM อย่างน้อย 1 รอบ → ปลดล็อก PM Compliance/Calendar
3. ตัดสินใจเรื่อง ECharts: ถ้าอนุมัติ ให้ทำ `components/charts/*` แล้วค่อยย้ายทีละหน้า (recharts ยังใช้ได้ระหว่างนี้)
4. เพิ่ม drill-down จาก KPI อื่น (PM/อะไหล่) และจากกราฟ → หน้ารายการ
5. Deploy production หลัง build ผ่าน (ต้องขออนุมัติ)
