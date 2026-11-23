# Phase 8 — Audit ทุกหน้า Asset (asset_registry + calibration)

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] audit ทุกหน้า asset (20 หน้า calibration + 8 asset_registry)`
> วิธี: (1) นับ route จริงจากซอร์ส (2) เปิดทุกหน้าในของจริงด้วย role 5 (Viewer) บันทึก HTTP/title/เนื้อหา (3) ตรวจหัวหน้าหน้าด้วยซอร์ส

## 1. จำนวนหน้าจริง

| กลุ่ม | จำนวน route (`page.tsx`) | หมายเหตุ |
|---|---|---|
| `asset_registry/*` | **8** | list, view, create, edit, criticality, oee, bom_tree, plant_map |
| `calibration/*` | **20** | รวม `run/[id]` (dynamic) — tracker เดิมเขียน 20 ถูกต้อง |
| รวม | **28** | |

> หมายเหตุกันรายงานผิด: `/calibration/run` (ไม่มี id) ตอบ **404** เป็นเรื่องถูกต้อง เพราะซอร์สเป็น `calibration/run/[id]/page.tsx` (dynamic route, ไม่มี index)

## 2. เปิดทุกหน้าจริงด้วย role 5 (Viewer) — `:3001`

| ผลลัพธ์ | จำนวน | หน้า |
|---|---|---|
| **403 gate** (HTTP 200 + `h1 = "403 — ไม่มีสิทธิ์เข้าใช้หน้านี้"`, เนื้อหา 372–439 ตัวอักษร) | **25** | asset_registry 8 หน้า + calibration 17 หน้า (list, instruments, certificates, config, create, dashboard, data-quality, edit, mobile, oot, plans, po, procedures, reports, schedule, standards, tracking, calendar) |
| 404 (ถูกต้อง — dynamic route) | 1 | `/calibration/run` |
| เรนเดอร์เนื้อหาจริง | **0** | — |

ทุกหน้า: `h1` ตัวเดียว, `.cmms-page-hero` = 0, ไม่มี redirect, URL คงเดิม

**สรุปข้อจำกัด:** role 5 (บัญชีเดียวที่ทดสอบได้) ไม่มีสิทธิ์ `asset_registry` / `calibration` เลย → **ไม่สามารถตรวจ visual/UX ของ 28 หน้านี้ในของจริงได้** ต้องใช้บัญชี role 1/2/3/6/7 หรือ seed สิทธิ์ชั่วคราว (ต้องอนุมัติ — เป็นการแก้ข้อมูล permission)

## 3. ตรวจด้วยซอร์ส (ทำได้แม้ไม่มีสิทธิ์)

| เกณฑ์ (UI Migration Rules) | ผล |
|---|---|
| หัวหน้าจาก `PageHeader` / `DetailHeader` | **27 / 28** หน้า |
| ใช้ `cmms-page-hero` หรือ `ui/page-header` (ห้าม) | **0 ไฟล์** |
| ฝ่าฝืน: หัวหน้าสร้างเอง | **1 ไฟล์** → ดู A8-1 |

### A8-1 (MEDIUM) — `calibration/mobile` สร้างหัวหน้าเอง ไม่ผ่าน PageHeader

```tsx
// app/(dashboard)/calibration/mobile/page.tsx:107-108
<p className="cmms-eyebrow">{hero.eyebrow}</p>
<h1 className="text-xl font-bold">สอบเทียบเครื่องมือจากหน้างาน</h1>
```

- เป็นหน้าเดียวใน 28 หน้าที่ไม่มี `PageHeader`/`DetailHeader`
- ฝ่าฝืนกฎ «หัวหน้าทุกหน้าต้องมาจาก PageHeader/DetailHeader เท่านั้น»
- แก้ได้เฉพาะ «หัวหน้า + ระยะห่าง» ตามกฎหน้าพิเศษ แต่ **ยังตรวจผลไม่ได้** เพราะหน้าโดน 403 สำหรับ role 5 และ build `:3001` เก่ากว่าซอร์ส (ดู R9-9) → **รออนุมัติ/รอ build ใหม่**

## 4. Findings

| ID | ระดับ | อาการ | หลักฐาน |
|---|---|---|---|
| A8-1 | MEDIUM | `calibration/mobile` ใช้ `<p class="cmms-eyebrow">` + `<h1>` เองแทน `PageHeader` | `app/(dashboard)/calibration/mobile/page.tsx:107-108` |
| A8-2 | LOW | หน้า 403 gate ตอบ **HTTP 200** (ไม่ใช่ 403) → monitoring/cache แยก «ไม่มีสิทธิ์» กับ «มีหน้าแต่ข้อมูลว่าง» ไม่ออก | วัด 25 หน้า: `http=200` + ข้อความ 403 |

## 5. Traceability asset → Work Order

### 5.1 มีจริงในโค็ด (ฝั่ง UI)

หน้า asset detail สร้าง timeline ที่มีงานซ่อมของ tool นั้น และลิงก์ไปหน้าใบงาน:
```tsx
// app/(dashboard)/asset_registry/view/page.tsx:596
fetch(`/api/v1/repair.php?asset_code=${encodeURIComponent(code)}`)
// :364-373
kind: "repair", title: r.work_order_no, href: `/repair/view?id=${r.id}`
```

### 5.2 มีจริงใน backend

`public/api/v1/repair.php:122` JOIN `asset_registry a ON r.asset_id = a.id` และ `:132-135` กรอง `a.code = ?` เมื่อมี `asset_code` → ตัวกรองตรงกับสิ่งที่หน้าเว็บส่งมา (ใช้ code ไม่ใช่ id)

### 5.3 ข้อมูลจริงที่มีอยู่

| asset | code | จำนวนใบงาน |
|---|---|---|
| 91 | `A-BM06` | **7** |
| 106 | `IMPORTED-UNKNOWN` | 5 |
| 113 | `A-PT-01` | 3 |

(สูงสุดในระบบ = 7 ใบ/เครื่อง จาก `repair` 105 ใบ)

### 5.4 วัด API จริงแล้ว — **BLOCKED by design**

| การเรียก | ผล |
|---|---|
| `GET /api/v1/repair.php?asset_code=A-BM06` (role 5) | **403** (`success,error,code`) |
| `GET …?asset_code=A-BM06&limit=200` (role 5) | 403 |
| `GET …?asset_code=NOSUCH-XYZ` (role 5) | 403 |
| `GET /api/v1/repair.php?limit=5` (baseline, role 5) | 403 (ไม่ใช่เพราะ asset_code) |
| `GET /api/v1/repair.php?id=1` (role 5) | 403 |
| anonymous (cookie ว่าง) | **401** ✔ ไม่มี bypass |
| `GET /asset_registry/view?id=91` (role 5) | 403 gate |

สาเหตุ: `menu_permissions` ของ role 5 (Viewer) → `repair` = **0** (`api_permissions.php:34` ต้อง `repair.view`) ขณะที่ Admin/Manager/Asst.Manager/Foreman = 1, Operate/User = 0 → **การบล็อกถูกต้องตามดีไซน์สิทธิ์ ไม่ใช่บั๊ก**

→ **Traceability ตรวจได้เพียงระดับโค็ด/สัญญา API เท่านั้น** ยังไม่เคยเห็น timeline ทำงานจริงบนข้อมูล 7 ใบของ `A-BM06`

### A8-3 (LOW) — asset timeline ดึงใบงานแบบไม่จำกัดจำนวน

`view/page.tsx:596` เรียกโดยไม่ส่ง `limit`/`page` → `repair.php:179-181` ตัดสิน `$limit = 0` แล้วคืน **ทุกแถว** ของเครื่องนั้น ปัจจุบันมากสุด 7 ใบจึงไม่กระทบ แต่เครื่องที่มีใบงานหลักพันจะโหลดหนัก (ทั้ง payload และ DB)

## 6. Spare parts pagination

**สรุป: ทำแล้ว และถูกต้อง — ไม่ต้องอนุมัติเปลี่ยน contract**

| หลักฐาน | ค่า |
|---|---|
| หน้า `spare_parts/page.tsx:100` | `PAGE_SIZE = 15` |
| เรียก API (`:784-785`) | `?limit=15&page=N` + q/sage_category/stock_status/sort |
| ฝั่ง server รับ | `limit` (สูงสุด 200), `page`/`offset`, คืน `total`, `limit`, `offset`, `page` (`spare_parts.php:114-124`) |
| `total` นับจาก WHERE เดียวกัน | `COUNT(*) ` + `$listSql` (รวม filter `stock_status`) → ตรงกับจำนวนที่กรองแล้ว |
| จำนวนจริง | `spare_parts` = **1,870** แถว → 125 หน้า |
| PDO pitfall ที่เกือบรายงานผิด | `LIMIT ?` ส้งด้วย `execute([15,0])` — ทดสอบจริงบน MySQL 8 (emulate=0): **OK 15 แถว** (ไม่มี error) |
| สิทธิ์ role 5 | `spare_parts` = 0 (เฉพาะ `spare_parts/criticality` = 1) → **403 by design** จึงวัด UI ไม่ได้ |

## 7. สิ่งที่ยังไม่ได้ตรวจ

- **visual/UX ของ 28 หน้า** (ไม่มีบัญชีที่มีสิทธิ์) — ต้องขอบัญชีหรือ seed สิทธิ์
- responsive/touch ของ 28 หน้า (ผูกกับข้อบน)
- `calibration/run/[id]` ด้วย id จริง (ไม่มีข้อมูล calibration ใน DB — ตาราง `calibration_*` = 0 แถว)
- **timeline asset→WO บนข้อมูลจริง** (7 ใบของ `A-BM06`) — ถูกบล็อกเพราะ role 5 ไม่มีสิทธิ์ `repair` (403 by design)
- **spare parts pagination บน UI จริง** (เปลี่ยนหน้า/กรอง/เรียง) — ติดสิทธิ์ `spare_parts` = 0 เช่นกัน
- ตรวจทั้งสองข้อข้างต้นต้องใช้บัญชี role 1/2/3/6/7 — **รออนุมัติ/ขอ credential**
