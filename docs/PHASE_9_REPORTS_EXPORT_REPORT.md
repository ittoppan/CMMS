# Phase 9 — Reports, Analytics & Export (รายงานผลรอบแรก: filter ↔ export parity)

> วันที่: 2026-11-23 · ขอบเขต: Report Center (`/reports/*`), export CSV/XLSX, parity ระหว่างหน้าจอกับไฟล์
> สถานะ Phase: **IN PROGRESS** (parity แก้แล้ว + ผ่านการวัด; ยังเหลือ PDF/analytics + role-403 UI + streaming)

## 1. Before audit — สิ่งที่ตรวจจากโค้ดจริง

| # | ระดับ | สิ่งที่พบ | หลักฐาน |
|---|---|---|---|
| E1 | **HIGH** | หน้า `/reports/export_excel` ไม่ได้ใช้ตัวกรองที่ผู้ใช้เลือก — `year`/`month` ถูกเก็บใน state แต่ไม่ถูกส่งไปที่ไหนเลย และดึงข้อมูลดิบจาก `/api/v1/index.php?resource=…` (route นี้เรียกแค่ `requireLogin()` ไม่มี scope ตาม role, ไม่มี `report_audit_log`, แปลง CSV ที่เบราว์เซอร์) | `frontend/app/(dashboard)/reports/export_excel/page.tsx` (เดิม), `public/api/v1/index.php:24` |
| E2 | **HIGH** | Export ของ Report Center ถูกตัดที่ limit ของหน้าจอ (default 50) — หน้าจอ `total` 105 แต่ CSV ได้ 50 แถว, assets 82 → 50 | `rpt_page_params()` อ่าน `$_GET['limit']` (default 50, cap 300) แต่ `rpt_export_csv/xlsx` ส่ง `$opts` ที่ไม่มี limit → ใช้ค่า default |
| E3 | MEDIUM | รายการเดือนในหน้า export มีแค่ 3 ค่า (all, 1, 7, 12) และชื่อไฟล์/หัวคอลัมน์ไม่ตรงกับรายงานบนหน้าจอ | ไฟล์เดิม |
| E4 | — (ผ่านอยู่แล้ว) | รายงาน 12 หมวดใน Report Center ใช้ `reportUrl(resource, query, "csv"|"xlsx")` — query ชุดเดียวกับที่ใช้แสดงผล → parity ถูกต้องโดยโครงสร้าง | `frontend/components/reports/report-filters.tsx:64-65` |

## 2. สิ่งที่แก้

1. **`src/helpers/reports.php` — `rpt_page_params()`**: ถ้า `$opts['export']` ถูกตั้ง (เฉพาะคำขอ `export=csv|xlsx`) ให้คืน `limit = 50000, offset = 0` → ไฟล์มีข้อมูลครบทั้งชุดตาม filter
   *ผลต่อหน้าจอปกติ: ไม่เปลี่ยน* (เมื่อไม่มี flag ยังใช้ `min(300, $_GET['limit'] ?? 50)` เดิมทุกบรรทัด) — ยืนยันด้วย `screen_rows = 50` เท่าเดิมหลังแก้
2. **`src/helpers/reports.php` — `rpt_opts()`**: เพิ่ม key `export` จาก `$_GET` เพื่อให้ flag ไปถึง `rpt_page_params()` ได้ทั้งทาง API และการเรียกภายใน
3. **`frontend/app/(dashboard)/reports/export_excel/page.tsx`** (เขียนใหม่):
   - ใช้ `reportUrl(resource, {range:"custom", range_start, range_end}, "csv"|"xlsx")` → ไฟล์สร้างจากเซิร์ฟเวอร์ด้วยสูตร/ตัวกรอง/scope เดียวกับหน้าจอ + บันทึก `report_audit_log`
   - แปลง ปี/เดือน → `range_start`/`range_end` จริง (all = 01-01 ถึง 12-31, เดือน = วันแรกถึงวันสิ้นเดือน) และแสดงช่วงที่จะส่งออกบนหน้าจอ
   - เพิ่มตัวเลือกครบ 11 resource (work-orders, requests, pm, inspections, assets, spare-parts, downtime, sla, mttr-mtbf, technicians, cost) และเดือนครบ 12 เดือน
   - ปุ่มแยก CSV / Excel, จัดการ 403/JSON error จากเซิร์ฟเวอร์เป็นข้อความบนหน้า (ไม่ใช่เปิดหน้าข้อความ JSON), เก็บชื่อไฟล์จาก `Content-Disposition`

## 3. After audit — parity ที่วัดได้ (ข้อมูลจริง 2026-11-23, role admin)

| resource | rows บนหน้าจอ | total | rows ในไฟล์ export | ผล |
|---|---|---|---|---|
| work-orders | 50 | **105** | **105** | MATCH (เดิม 50 → DIFF) |
| assets | 50 | **82** | **82** | MATCH (เดิม 50 → DIFF) |
| pm | 3 | 3 | 3 | MATCH |
| downtime | 7 | 7 | 7 | MATCH |
| sla | 2 | 2 | 2 | MATCH |
| mttr-mtbf | 3 | 3 | 3 | MATCH |
| requests / inspections / spare-parts | 0 | 0 | 0 | MATCH (ข้อมูลจริงเป็น 0) |

- Filter parity: `range_start=2026-11-01&range_end=2026-11-30` → หน้าจอ total 12 / export 12 (MATCH)
- CSV จริง: UTF-8 BOM + หัวคอลัมน์ไทยตรงกับตารางบนหน้าจอ + 105 แถวข้อมูล

## 4. Tests

| การทดสอบ | ผล |
|---|---|
| `php -l src/helpers/reports.php` | ผ่าน (No syntax errors) |
| `npx tsc --noEmit` | exit 0 |
| `NEXT_DIST_DIR=.next-verify npm run build` | exit 0 |
| Playwright E2E (production build :3003): เลือก พ.ย. 2026 → ดาวน์โหลด CSV | ผ่าน — `work-orders_20261123_161226.csv` 1,668 bytes, request มี `range_start=2026-11-01&range_end=2026-11-30&export=csv` |
| Playwright E2E: ดาวน์โหลด Excel | ผ่าน — `work-orders_20261123_161226.xlsx` 3,225 bytes |
| CLI parity (9 resource) | MATCH ทุกตัว (ตาราง §3) |

## 5. Known issues / ยังไม่ปิด

| # | ระดับ | เรื่อง | หมายเหตุ |
|---|---|---|---|
| P9-1 | MEDIUM | XLSX สร้างทั้งชุดในหน่วยความจำ (`xlsx_download`) — ยังไม่ stream; cap export 50,000 แถว | ต้องเปลี่ยนเป็น streaming writer ถ้าข้อมูลโตมาก |
| P9-2 | MEDIUM | ยังไม่ทดสอบ UI ของ role ที่ถูกปฏิเสธ (cost/technicians → 403) ด้วยบัญชีจริง | ต้องมีบัญชี role 3/5 ทดสอบ |
| P9-3 | LOW | requests/inspections/spare-parts ตารางว่างในข้อมูลจริง → parity ของ 3 resource นี้ยัง "ผ่านแบบว่าง" | ต้องรอข้อมูลจริงหรือ seed แยก (ห้ามใช้ Production) |
| P9-4 | — | ยังไม่ตรวจ PDF ประจำเดือน (`/reports/monthly_pdf`) และ `/analytics/advanced` ในรอบนี้ | งานถัดไปของ Phase 9 |

## 6. สิ่งที่ต้องอนุมัติ

การแก้ `rpt_page_params()` เป็นการแตะ backend helper (ไม่ใช่ UI) — ทำเพราะ Phase 9 กำหนดว่า "ข้อมูล Export ต้องตรงกับข้อมูลที่แสดง"
และจำกัดผลเฉพาะคำขอ `export=csv|xlsx` (หน้าจอปกติพิสูจน์แล้วว่าได้ 50 แถวเท่าเดิม)
**ขออนุมัติยืนยันการแก้จุดนี้** — ถ้าไม่ต้องการให้แตะ backend จะ revert เฉพาะ 2 บรรทัดใน `rpt_page_params()`/`rpt_opts()` และรายงานเป็นข้อเสนอแทน
