# Phase 9 — ตรวจไฟล์ส่งออกจริง (Excel / CSV / PDF)

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] ตรวจ Excel/PDF/CSV จริง` ใน Phase 9
> สภาพแวดล้อม: production build `http://localhost:3001` · role 5 (Viewer, มี `reports/export_excel=1`, `reports/monthly_pdf=1`)
> วิธี: ดาวน์โหลดไฟล์จริงผ่าน session แล้ว **เปิดไฟล์ตรวจไบต์/โครงสร้าง** (ไม่ใช่ดูแค่ HTTP 200)

## 1. CSV / XLSX — `/api/v1/reports.php?resource=…&export=csv|xlsx`

### 1.1 HTTP + header

| ไฟล์ | HTTP | Content-Type | Content-Disposition | bytes | magic |
|---|---|---|---|---|---|
| work-orders.csv | 200 | `text/csv; charset=utf-8` | `attachment; filename="work-orders_20261123_191945.csv"` | 10,876 | `EFBBBF` (BOM) |
| work-orders.xlsx | 200 | `…spreadsheetml.sheet` | `attachment; filename="work-orders_20261123_191946.xlsx"` | 8,215 | `504B0304` (ZIP) |
| spare-parts.csv | 200 | csv | — | 147 | BOM |
| spare-parts.xlsx | 200 | xlsx | — | 2,098 | ZIP |
| downtime.csv | 200 | csv | — | 1,273 | BOM |
| downtime.xlsx | 200 | xlsx | — | 2,588 | ZIP |
| assets.csv | 200 | csv | — | 9,317 | BOM |
| assets.xlsx | 200 | xlsx | — | 6,090 | ZIP |
| sla.csv | 200 | csv | — | 263 | BOM |
| sla.xlsx | 200 | xlsx | — | 2,225 | ZIP |
| **ไม่ล็อกอิน** work-orders.csv | **401** | json | — | 128 | — |

### 1.2 เปิดไฟล์ตรวจเนื้อหา (parity CSV ↔ XLSX ↔ DB)

| resource | CSV แถวข้อมูล | XLSX `<row>` | ต่างกัน = header | เทียบ DB |
|---|---|---|---|---|
| work-orders | **105** | 106 | ✅ 1 | `repair` = **105** ✅ |
| spare-parts | **0** | 1 | ✅ 1 | `spare_issue_request_items` = 2 แต่ `issued_qty=0` → **ถูกต้องที่ 0** |
| downtime | **7** | 8 | ✅ 1 | — |
| assets | **82** | 83 | ✅ 1 | `asset_registry` = **82** ✅ |
| sla | **2** | 3 | ✅ 1 | — |

- XLSX ทุกไฟล์เปิดได้ด้วย `ZipArchive`, มี 6 entries, อ่าน `xl/worksheets/sheet1.xml` ได้
- CSV มี BOM `EF BB BF` (เปิดใน Excel ภาษาไทยไม่เพี้ยน) และหัวตารางภาษาไทยถูกต้อง เช่น `เลขที่ใบสั่งงาน, เครื่องจักร, ปัญหา/หัวข้อ, ความสำคัญ, ช่าง`
- **parity ผ่านทั้ง 5 resource** — จำนวนแถวใน CSV = XLSX − 1 และตรงกับจำนวนจริงใน DB

### 1.3 Audit trail

`report_audit_log` เพิ่ม **10 แถวพอดี** (id 86–95) จากการดาวน์โหลด 10 ครั้ง บันทึก `user_name`, `report`, `export_type`, `row_count` ตรงกับไฟล์จริง เช่น

```
95 | E2E Viewer (test) | sla        | xlsx | rows=2
87 | E2E Viewer (test) | work-orders| xlsx | rows=105
```

## 2. PDF — `/reports/monthly_pdf` (สร้างฝั่งเบราว์เซอร์ด้วย jsPDF)

| ตัวชี้วัด | ค่า |
|---|---|
| ปุ่มทำงาน | ✅ ดาวน์โหลดสำเร็จ (จับ download event) |
| ชื่อไฟล์ | `RPT-2026-07-CMMS-Maintenance-Summary.pdf` (มีปี-เดือน) |
| ขนาด | **6,915,332 bytes (6.9 MB)** |
| magic | `%PDF-1.3` |
| จำนวนหน้า | **1** |
| รูปใน PDF | 1 image |

วิธีสร้าง: `html2canvas(reportRef, {scale:2})` → PNG → `jsPDF.addImage()` แบบแบ่งหน้า (`monthly_pdf/page.tsx:144-172`)
→ **PDF ใช้ได้จริง** ไม่ใช่ปุ่มหลอก แต่เป็นภาพrasters ไม่ใช่ข้อความ (ค้นหา/คัดลอกข้อความใน PDF ไม่ได้)

## 3. Findings

| ID | ระดับ | อาการ | หลักฐาน | ต้องอนุมัติ? |
|---|---|---|---|---|
| R9-1 | **MEDIUM** | หน้า `/reports/monthly_pdf` เปิดมาที่ **กรกฎาคม 2026 ตลอด** เพราะ `useState(7)` / `useState(2026)` ฝังตายตัว → ผู้ใช้เห็นและส่งออกเดือนผิดโดยไม่รู้ตัว (วันนี้ 2026-11-23 แต่ได้ไฟล์ `RPT-2026-07-…`) | `monthly_pdf/page.tsx:66-67`, ชื่อไฟล์ที่ดาวน์โหลด | **ใช่** (เป็น state) |
| R9-2 | LOW | ไฟล์ CSV/XLSX ตั้งชื่อด้วย `resource_วันเวลาexport` **ไม่มีช่วงวันที่/เงื่อนไขของรายงาน** → แยกไฟล์ย้อนหลังยาก (PDF มีปี-เดือน ดีกว่าอยู่แล้ว) | `reports.php:1491,1527` | ใช่ (แก้ export) |
| R9-3 | LOW | PDF 6.9 MB สำหรับ 1 หน้า เพราะฝัง PNG ที่ `scale:2` ทั้งก้อน; ถ้ารายงานยาวหลายหน้าจะฝังภาพเดิมซ้ำทุกหน้า → ไฟล์บวมคูณจำนวนหน้า | §2 + `monthly_pdf/page.tsx:154-168` | ใช่ |
| R9-4 | LOW | `reports.php:68-70` เรียก `audit_log('REPORT_EXPORT', …)` หลัง export — **ไม่เคยทำงาน** เพราะทั้ง `rpt_export_csv` และ `rpt_export_xlsx` `exit` ก่อน (audit ยังถูกบันทึกผ่าน `rpt_log_audit` จึงไม่เสียข้อมูล) | `src/helpers/reports.php:1473-1529` | ไม่เร่ง |
| R9-5 | **MEDIUM** | สิทธิ์ export ตัดสินด้วย role id ที่ฝังในโค้ด (`rpt_permitted`) ไม่ได้อ่าน `menu_permissions` → เปลี่ยนสิทธิ์ในหน้า `/roles` ไม่มีผลกับ API; และ 10 จาก 12 resource ไม่มีกฎเลย | §4.5 ตารางยิงจริง + `reports.php:151` | ใช่ (แตะ authorization) |

## 4. ตรวจแล้วไม่ใช่ปัญหา (กันรายงานผิด)

- **spare-parts export ได้ 0 แถวทั้งที่ตารางมีข้อมูล**: รายงานนี้คือ "การใช้อะไหล่" (`จำนวนใช้`, `จำนวนใบงาน`) ซึ่งนับจากรายการที่ **จ่ายจริง** — `spare_issue_request_items` มี 2 แถวแต่ `issued_qty = 0.00` ทั้งคู่ จึงถูกต้องที่เป็น 0 (ไม่ใช่บั๊ก)
- **`assets` 82 แถว = จำนวนเครื่องจริง** จึงไม่ใช่การตัดข้อมูลทิ้ง
- **401 เมื่อไม่ล็อกอิน** = มี auth gate ก่อนสร้างไฟล์

## 4.5 Permission ก่อน export — ตรวจแล้ว (รอบที่ 2)

แหล่งข้อมูล:** `src/helpers/reports.php:151` `rpt_permitted()` ถูกเรียกที่ต้นทางเดียว `rpt_dispatch()` (บรรทัด 1516) ซึ่ง **ทั้งหน้าจอ (`resource=…`) และการดาวน์โหลด (`export=csv|xlsx`) ผ่านเข้าที่เดียวกัน** → ตัวกรองทำงานก่อนสร้างไฟล์

ยิงจริงด้วย role 5:

| คำขอ | HTTP | ผล |
|---|---|---|
| `resource=cost&export=csv` | **403** | `ไม่มีสิทธิ์ดูรายงานนี้ (Report Permission)` |
| `resource=cost&export=xlsx` | **403** | เดียวกัน |
| `resource=technicians&export=csv` | **403** | เดียวกัน |
| `resource=technicians&export=xlsx` | **403** | เดียวกัน |
| `resource=cost` (หน้าจอ) | **403** | เดียวกัน |
| `resource=pm&export=csv` | 200 | ไฟล์ 676 bytes |

**สรุป: มี permission gate ก่อน export จริง** — restricted resource ถูกกันที่ API ทั้งหน้าจอและไฟล์ (ไม่ใช่แค่ซ่อนปุ่มบน UI)

**แต่กลไกไม่ตรงกับระบบเมนู (finding R9-5):**

```php
function rpt_permitted(string $resource, int $roleId): bool {
    switch ($resource) {
        case 'cost':        return kpi_can_see_cost($roleId);            // 1,2,6
        case 'technicians': return in_array($roleId, [1, 2, 6, 7], true);
        default:            return true;                                  // 10 จาก 12 resource = ผ่านทุก role
    }
}
```

- ตัดสินด้วย **role id ที่ฝังในโค้ด** ไม่ได้อ่าน `menu_permissions`
- → ถ้าฝ่าย IT ไปเปลี่ยนสิทธิ์ `reports/cost` ในหน้า `/roles` ผลกับ API **ไม่เปลี่ยน**
- → resource 10 ตัวที่เหลือ (`work-orders`, `assets`, `spare-parts`, `downtime`, `pm`, `inspections`, `requests`, `sla`, `mttr-mtbf`, `center`) **ไม่มีกฎเลย** เปิดให้ทุก role ที่ล็อกอิน (สอดคล้องกับ E11-1)

## 5. สิ่งที่ยังไม่ได้ตรวจ

- สิทธิ์แบบ **ราย resource ที่ไม่ใช่ cost/technicians** — ไม่มีกฎให้ทดสอบ; ต้องใช้บัญชีที่ `menu_permissions` เป็น 0 สำหรับ resource นั้น แล้วดูว่า API ยังให้โหลดหรือไม่
- ช่วงวันที่/ตัวกรอง: ดาวน์โหลดด้วยค่า default เท่านั้น ยังไม่ได้ทดสอบว่า filter บนหน้าจอส่งต่อไปยังไฟล์ตรงกัน (parity ตัวเลขกับหน้าจอมีรายงานเดิม `442bc2ed`)
- drill-down และ progress/loading ระหว่าง export
- PDF หลายหน้า (รายงานที่ยาวเกิน 1 หน้า) — ยังไม่ทดสอบการแบ่งหน้า
- เปิดไฟล์ด้วย Excel/LibreOffice จริง (ตรวจด้วย ZipArchive/ไบต์เท่านั้น)

## 6. สรุปสถานะ checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] ตรวจ Excel/PDF/CSV จริง` | **ตรวจแล้ว** — CSV/XLSX 10 ไฟล์เปิดได้ parity ตรง DB, PDF สร้างได้จริง 6.9 MB/1 หน้า; พบ R9-1 MEDIUM (เดือน default ผิด) |
| `[ ] permission ก่อน export` | **ตรวจแล้ว** — restricted resource (cost/technicians) ถูกกัน 403 ที่ API ทั้งหน้าจอและไฟล์ (`rpt_dispatch`); แต่กลไกใช้ role id ไม่ใช่ `menu_permissions` = R9-5 MEDIUM |
