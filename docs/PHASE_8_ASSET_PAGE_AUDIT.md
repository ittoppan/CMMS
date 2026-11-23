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

## 5. สิ่งที่ยังไม่ได้ตรวจ

- **visual/UX ของ 28 หน้า** (ไม่มีบัญชีที่มีสิทธิ์) — ต้องขอบัญชีหรือ seed สิทธิ์
- responsive/touch ของ 28 หน้า (ผูกกับข้อบน)
- `calibration/run/[id]` ด้วย id จริง (ไม่มีข้อมูล calibration ใน DB — ตาราง `calibration_*` = 0 แถว)
