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

## งานถัดไป (ลำดับที่แนะนำ)

1. **Data enablement (สำคัญสุด):** มอบหมายช่างให้ใบงาน (`repair.assigned_to` หรือ `work_assignees` ที่ชี้ id จริง), บันทึก `completed_at`/`repair_time_minutes`, อัปรูปก่อนซ่อม → ปลดล็อก MTTR/Completion/Technician dashboard ทันทีโดยไม่ต้องแก้สูตร
2. สร้าง PM plan + งาน PM อย่างน้อย 1 รอบ → ปลดล็อก PM Compliance/Calendar
3. ตัดสินใจเรื่อง ECharts: ถ้าอนุมัติ ให้ทำ `components/charts/*` แล้วค่อยย้ายทีละหน้า (recharts ยังใช้ได้ระหว่างนี้)
4. เพิ่ม drill-down จาก KPI อื่น (PM/อะไหล่) และจากกราฟ → หน้ารายการ
5. Deploy production หลัง build ผ่าน (ต้องขออนุมัติ)
