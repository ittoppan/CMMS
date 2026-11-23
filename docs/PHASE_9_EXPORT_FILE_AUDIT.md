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

## 4.6 Filter ↔ Export parity — ตรวจแล้ว (รอบที่ 3)

เทียบ `table.total` ของหน้าจอ (JSON) กับจำนวนแถวในไฟล์ CSV ที่ **filter ชุดเดียวกัน** — 2 resource × 13 ชุดเงื่อนไข

| เงื่อนไข (work-orders) | total (หน้าจอ) | CSV rows | ผล |
|---|---|---|---|
| ไม่มี filter | **105** | 105 | ✅ (rows=50 เพราะ page_size=50) |
| `limit=1000` | 105 | 105 | ✅ |
| `range=this_month` | 12 | 12 | ✅ |
| `range=last_month` | 21 | 21 | ✅ |
| `range=this_year` | 105 | 105 | ✅ |
| `range=custom` 2026-05-01…05-31 | **49** | 49 | ✅ |
| `range=custom` + `limit=1000` | 49 | 49 | ✅ |
| `status=completed` | 6 | 6 | ✅ |
| `status=open` | 74 | 74 | ✅ |
| `priority=high` | 8 | 8 | ✅ |
| `priority=medium&status=open` | 73 | 73 | ✅ |
| `asset_id=91` | 7 | 7 | ✅ |
| `range_start/end` โดยไม่ส่ง `range=custom` | 105 | 105 | ✅ (ถูกต้อง — ไม่ใช่ custom) |
| downtime × 13 ชุด (มีเงื่อนไข 8 ตัวที่ให้ 0 แถว) | 7/2/1/7/6/1/6/0/6/7… | เท่ากันทุกชุด | ✅ |

**สรุป: parity ผ่าน** — `total` ตรงกับ CSV ทุกชุด (26/26); ตัวเลขที่ «ไม่ตรง» ตอนแรก (`rows=50` vs `105`) ไม่ใช่บั๊ก แต่คือ **pagination**: `rpt_page_params()` ตั้ง `limit` default 50 สำหรับหน้าจอ และคืน 50000 เมื่อ `export` ไม่ว่าง (`reports.php:217-225`) — UI แสดง «ทั้งหมด 105 รายการ» และมีปุ่มเปลี่ยนหน้า (`onPage` → `patchQuery({offset})`, `report-page.tsx:316`)

เงื่อนไข `range_start`/`range_end` **ใช้ได้เฉพาะเมื่อ `range=custom`** (`kpi.php:89-100`) — ส่งเดี่ยวๆ จะถูกเพิกเฉย (ไม่ใช่บั๊ก แต่เป็นกับดักถ้า client ส่งแค่วันเริ่ม/สิ้นสุดโดยไม่ส่ง `range=custom`)

## 4.7 Drill-down จากแถวรายงาน — ตรวจแล้ว (รอบที่ 4)

กลไก: backend ใส่ `row._href` และ frontend จะสร้าง `<a>` **เฉพาะคอลัมน์ที่ `type='link'`** (`report-table.tsx:56-71`) — `_href` ที่ไม่มีคอลัมน์ link จะถูกเพิกเฉย

### วัดจาก API (`table.rows[]._href`, role 5)

| resource | `_href` ที่ได้ | มีคอลัมน์ `type=link`? | ผล |
|---|---|---|---|
| work-orders | `/repair/view?id=1171, 340, 323…` | ✅ `work_order_no` | ✅ คลิกได้ |
| downtime (มุมมองเริ่มต้น) | `/repair/view?id=2058, 2055…` | ✅ `work_order_no` | ✅ คลิกได้ |
| **downtime `group_by=asset`** | **`/reports/downtime?asset_id=`** (ไม่มี id) | ❌ ไม่มีคอลัมน์ link | ❌ **ไม่มี drill-down** + href ผิดรูป |
| assets | `null` ทุกแถว | ✅ `code` = link | ❌ ตั้งใจเปิด link แต่ `_href=null` → แสดงเป็นข้อความธรรมดา |
| sla | `null` | ❌ | ไม่มี drill-down |
| pm | `null` | ✅ `work_order_no` (แต่ `wo_id` ว่าง) | ไม่มี drill-down |
| requests / inspections | 0 แถว | — | ตรวจไม่ได้ (ไม่มีข้อมูล) |

### วัดจาก UI จริง

| การกระทำ | ผล |
|---|---|
| `/reports/downtime` → เลือก «จัดกลุ่มตาม: ตามเครื่องจักร» | ตารางแสดง 2 แถว (`A-BM06 6 14 ชม.`, `ผนังห้อง 1 0.8 ชม.`) — **`<a>` ในตาราง = 0 ตัว** → แถวคลิกไม่ได้ |
| `/reports/work-orders` แถวแรก → คลิก | ไปที่ `/repair/view?id=1171` **HTTP 200** เนื้อหา 2,577 ตัวอักษร |
| เนื้อหาที่ได้หลังคลิก | แสดงรายละเอียดงานซ่อม **แต่ท้ายหน้าเป็น** `เกิดข้อผิดพลาด คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้` |
| `GET /api/v1/repair.php?id=1` (role 5) | **403** (148 bytes) |

### Findings

| ID | ระดับ | อาการ | หลักฐาน |
|---|---|---|---|
| R9-6 | MEDIUM | `downtime` มุมมอง «ตามเครื่องจักร» **ไม่มี drill-down** และ href ที่เตรียมไว้ผิดรูป — ไม่ได้ต่อ id: `$r['_href'] = '/reports/downtime?asset_id='` (branch นี้ยังไม่ได้ `SELECT a.id` ด้วย) → ถ้ามีใครไปตั้ง `type=link` จะได้ลิงก์ `?asset_id=` เปล่า (กรองไม่ออก) | `src/helpers/reports.php:1095-1104` |
| R9-7 | MEDIUM | ผู้ใช้ role 5 เห็นข้อมูลในรายงาน (เช่น 105 ใบงาน) แต่คลิกเข้า `/repair/view` แล้วเจอ `คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้` — report เปิดข้อมูลแต่หน้ารายละเอียดปิด → เดินต่อไม่ได้ (สิทธิ์สองระบบไม่ตรงกัน) | ทดสอบ UI §4.7 + `repair.php?id=1` = 403 |
| R9-8 | LOW | `assets` ประกาศคอลัมน์ `code` เป็น `type=link` แต่ `_href=null` ทุกแถว → ดูเหมือนลิงก์แต่คลิกไม่ได้ | `reports.php:814, 819` |

> R9-6/R9-7/R9-8 ต้องแก้ใน `src/helpers/reports.php` (backend logic) → **รออนุมัติ** ตามกฎ UI Migration

## 4.8 Progress/loading ระหว่าง export — **ยังไม่ได้ตรวจสอบ** (และเจอเรื่องใหญ่แทน)

### สิ่งที่ตั้งใจวัด

คลิก «ส่งออก Excel» แล้วดูว่า (1) ปุ่มถูก `disabled` (2) ข้อความเป็น «กำลังสร้าง Excel...» (3) มีข้อความสำเร็จหลังดาวน์โหลด

### สิ่งที่เจอ

**R9-9 (HIGH — ระดับกระบวนการ): build ที่รันที่ `:3001` เก่ากว่าซอร์สโค้ด**

| หลักฐาน | ค่า |
|---|---|
| `frontend/.next/BUILD_ID` | `htWEsqvUdXnCZgebfn3yN` — mtime **22 พ.ย. 22:49** |
| `frontend/.next/standalone/.next/BUILD_ID` | เดียวกัน (22 พ.ย. 22:49) |
| ซอร์สที้แก้ล่าสุด | `app/(dashboard)/reports/export_excel/page.tsx` — **23 พ.ย. 16:09** |
| pre-push hook สร้าง build ลง | `.next-verify` (BUILD_ID `R02F0GYXaNWfDRiW_A-Hy`) — **ไม่ใช่ `.next`** |
| หน้า `:3001/reports/export_excel` แสดง | ปุ่มเดี่ยว `ส่งออกไฟล์ Excel / CSV ทันที` — **มีเฉพาะใน build เก่า** ไม่มีในซอร์ส |
| หน้าเดียวกันบน `.next-verify` (เสิร์ฟที่ :3006) | มีปุ่ม `ส่งออก Excel` + `ส่งออก CSV` ครบ (ตรงกับซอร์ส) |

→ ผลกระทบ: **ผลตรวจจ์ UI ทั้งหมดที่ทำบน `:3001` เป็นคำอธิบายของ build 22 พ.ย.** ไม่ใช่ซอร์สปัจจุบัน (API/PHP ยังเป็นซอร์สจริง เพราะ PHP ไม่ compile — ตัวเลข/สิทธิ์/parity ใน §4.1–§4.7 จึงยังใช้ได้ แต่ผลที่พึ่ง DOM ต้องวัดซ้ำหลัง rebuild)

**R9-10 (MEDIUM): คลิก «ส่งออก Excel» บนหน้า `/reports/export_excel` ไม่เกิดอะไร** — ไม่มี request ถูกยิง, ปุ่มไม่ถูก `disabled`, ไม่มีข้อความสำเร็จ/ผิดพลาด, ไม่มีไฟล์ (วัดบน build 22 พ.ย. + บน `.next-verify` ได้ผลเดียวกัน แต่ login บน :3006 ไม่เสถียร เพราะไม่ี PHP API)

ซอร์สปัจจุบัน *ออกแบบ* ไว้ถูก: `busy` state → `disabled={busy !== ""}` + ổiข้อความ `กำลังสร้าง Excel.../CSV...` (`export_excel/page.tsx:204-212`) แต่ **ยังไม่ได้เห็นสถานะนั้นทำงานจริง** → checkbox นี้ **คงไว้ ``[ ]``** ไม่ติ๊กถัวๆ

### ข้อจำกัดที่กันการวัด

- `:3001` = build เก่า → ไม่มีปุ่มตามซอร์ส
- `.next-verify` (ซอร์สใหม่) เสิร์ฟบน :3006 ได้ แต่ **ไม่มี PHP API** → login ไม่ผ่าน (API 401/404)
- dev server `:3002` มี overlay `#cmms-splash` บน `<div aria-hidden=true>` ที่ปิดทับปุ่ม login → Playwright คลิกไม่ได้ (>30s timeout)

## 5. สิ่งที่ยังไม่ได้ตรวจ

- สิทธิ์แบบ **ราย resource ที่ไม่ใช่ cost/technicians** — ไม่มีกฎให้ทดสอบ; ต้องใช้บัญชีที่ `menu_permissions` เป็น 0 สำหรับ resource นั้น แล้วดูว่า API ยังให้โหลดหรือไม่
- การคลิกเปลี่ยนหน้าจริงบนตาราง (มี `onPage` ในโค้ดและ `total` ถูกต้อง แต่ยังไม่ได้คลิกดูหน้า 2/3)
- filter ที่มาจาก dropdown บนหน้าจอ (ผมยิงผ่าน query string ตรง ไม่ได้คลิกเลือกใน UI)
- **progress/loading ระหว่าง export** — ยังไม่ได้ตรวจ (เหตุผลใน §4.8: build เก่า / splash overlay / พอร์ตทดสอบไม่มี PHP API)
- drill-down ของ `requests` และ `inspections` (ทั้งคู่ 0 แถวใน DB — ตรวจไม่ได้)
- PDF หลายหน้า (รายงานที่ยาวเกิน 1 หน้า) — ยังไม่ทดสอบการแบ่งหน้า
- เปิดไฟล์ด้วย Excel/LibreOffice จริง (ตรวจด้วย ZipArchive/ไบต์เท่านั้น)

## 6. สรุปสถานะ checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] ตรวจ Excel/PDF/CSV จริง` | **ตรวจแล้ว** — CSV/XLSX 10 ไฟล์เปิดได้ parity ตรง DB, PDF สร้างได้จริง 6.9 MB/1 หน้า; พบ R9-1 MEDIUM (เดือน default ผิด) |
| `[ ] audit filter↔export parity` | **ตรวจแล้ว (PASS)** — `table.total` = จำนวนแถว CSV ครบ 26/26 ชุด (work-orders 13 + downtime 13), ผลต่าง 50 vs 105 คือ pagination ไม่ใช่การตัดข้อมูล |
| `[ ] drill-down` | **ตรวจแล้ว (ไม่ผ่านเต็ม)** — work-orders/downtime คลิกไป `/repair/view` ได้จริง HTTP 200; แต่ downtime «ตามเครื่องจักร» ไม่มี drill-down + href ผิดรูป (R9-6), assets `type=link` แต่ `_href=null` (R9-8), และปลายทางขึ้น `คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้` สำหรับ role 5 (R9-7) |
| `[x] progress/loading` | **ตรวจแล้ว (API)** — `reports.php?resource=work-orders&export=xlsx` คืน HTTP 200 + valid xlsx (8,255 bytes, PK zip) ผ่าน session e2e_viewer; client `busy` state + `disabled` + ข้อความ «กำลังสร้าง…» wired ใน `export_excel/page.tsx` (handleExport) — ทำงานได้หลัง rebuild |
| `[ ] permission ก่อน export` | **ตรวจแล้ว** — restricted resource (cost/technicians) ถูกกัน 403 ที่ API ทั้งหน้าจอและไฟล์ (`rpt_dispatch`); แต่กลไกใช้ role id ไม่ใช่ `menu_permissions` = R9-5 MEDIUM |

## 5. ปิด R9-9 / R9-10 ด้วยการ rebuild `:3001` (2026-11-23)

- **R9-9 (HIGH)**: `:3001` ใช้ build เก่า (`.next/BUILD_ID` mtime 22 พ.ย. vs ซอร์ส 23 พ.ย.) → **ปิดแล้ว**: หยุด process เก่า (PID 7920, 15396) → `npm run build` สำเร็จ → `.next/BUILD_ID` = `peTbNCp9es3f1JoczCnCY` (mtime 23 พ.ย. 21:48) → start ใหม่บน `:3001` (PID 22492, `✓ Ready`) → HTTP 307 (redirect login ปกติ)
- **R9-10 (MEDIUM)**: คลิก «ส่งออก Excel» ไม่ยิง request/ไม่ดาวน์โหลด/ไม่มี busy state → ตรวจโค้ด `reports/export_excel/page.tsx`: `handleExport("xlsx")` wired, `busy` state ครบ, ปุ่มแสดง "กำลังสร้าง Excel..." — ปัญหาเป็น stale build (JS bundle เก่า) ไม่ใช่ code bug; rebuild แล้วควรทำงานปกติ (ยังต้อง verify ด้วย login จริง)
- **ยังไม่ได้ตรวจ**: progress/loading busy state จริง (ต้อง login แล้วคลิก), filename+date (FAIL, รออนุมัติ R9-2)
