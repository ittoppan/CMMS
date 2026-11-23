# Phase 2 — Audit card-in-card / tile มาตรฐานเดียว

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] ตรวจ card-in-card/tile มาตรฐานเดียว`
> สภาพแวดล้อม: production build `http://localhost:3001` · role 5 (Viewer) · viewport 1440×900
> วิธี: วัดจาก DOM จริงด้วย Playwright (`getComputedStyle`/`matches`) ไม่ใช่เดาจาก source

## 1. เกณฑ์ที่ใช้

`frontend/components/ui/card.tsx` ประกาศชัดว่า **"Card — 1 layer เท่านั้น (ห้ามซ้อน card)"**
Card primitive สร้าง class signature นี้:

```
rounded-[var(--cmms-radius-lg)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] shadow-[var(--cmms-shadow-sm)]
```

- **card-in-card** = element ที่ตรง signature เต็ม (`cmms-radius-lg` + `cmms-bg-card`) และมีบรรพบุรุษที่ตรง signature เดียวกัน
- **surface นอกมาตรฐาน** = `div` ที่มี `rounded-xl` + `border` + `bg-card` แต่ไม่ใช้ Card primitive

## 2. ผลการวัด

### 2.1 card-in-card (สแกนละเอียด 7 หน้า)

| path | Card elements | ซ้อนกัน |
|---|---|---|
| `/dashboard` | 12 | **0** |
| `/analytics` | 11 | **0** |
| `/analytics/kpi` | 9 | **0** |
| `/notifications` | 10 | **0** |
| `/reports` | 4 | **0** |
| `/reports/report-center` | 15 | **0** |
| `/profile` | 5 | **0** |

**สรุป: ไม่พบ card-in-card เลย (0/7 หน้า)** — ตรงตามกติกา "1 layer เท่านั้น"

### 2.2 surface นอกมาตรฐาน (สแกน 20 หน้า)

| path | div นอกมาตรฐาน | ตัวอย่าง class |
|---|---|---|
| `/notifications` | 1 | `w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm` |
| `/reports/report-center` | 4 | `rounded-xl border border-border bg-card p-4` |
| หน้าอื่นในกลุ่ม reports (assets/downtime/inspections/mttr-mtbf/pm/requests/sla/spare-parts/work-orders) | 1 ต่อหน้า | เหมือน `/notifications` (wrapper ตารางเดียวกัน) |
| `/dashboard`, `/analytics`, `/analytics/kpi`, `/reports`, `/reports/export_excel`, `/reports/monthly_pdf`, `/reports/scheduled`, `/profile` | 0 | — |

ต้นกำเนิดมีแค่ **2 แบบ ไม่ใช่กระจายทั้งระบบ**:

| class ที่พบ | ไฟล์ต้นทาง | จำนวนไฟล์ |
|---|---|---|
| `overflow-x-auto rounded-xl border border-border bg-card shadow-sm` | `components/ui/table.tsx` | **1** (มีผลทุกหน้าที่มีตาราง) |
| `rounded-xl border border-border bg-card p-4` | `components/reports/report-page.tsx`, `app/(dashboard)/reports/report-center/page.tsx`, `app/(dashboard)/planning/page.tsx`, `app/(dashboard)/workforce/mine/page.tsx`, `app/(dashboard)/workforce/training/page.tsx` | **5** |

## 3. ข้อผิดพลาดที่ผมเกือบรายงานผิด (บันทึกไว้กันซ้ำ)

รอบแรกใช้ selector หลวม `[class*="cmms-bg-card"]` → รายงานว่า `/profile` มี card ซ้อน **7 ชั้น** และ `/notifications` 1
ตรวจ DOM/source ซ้ำแล้ว **เป็น false positive**: `/profile` มี Card 5 ใบเรียงเป็น sibling ใน `<Grid>` ไม่ได้ซ้อนกันเลย — element ที่โดนจับคือ **control/panel ข้างใน** ที่ใช้สีพื้นเดียวกับ card (เช่น Input, inner panel)
→ ต้องใช้ signature เต็ม (`cmms-radius-lg` + `cmms-bg-card`) ไม่ใช่แค่สีพื้น

## 4. เรื่องที่ตรวจแล้วไม่ใช่ปัญหา

- **`<h1>` 2 ตัวบนหน้า reports** (8 หน้า: assets, downtime, inspections, mttr-mtbf, pm, requests, sla, spare-parts, work-orders): ตัวที่สองอยู่ใน `div.print-only hidden` = **หัวกระดาษสำหรับพิมพ์** (`components/reports/report-page.tsx:170-175`) — `display:none` จึงไม่อยู่ใน accessibility tree และไม่ทำให้มีหัวหน้า 2 อันบนจอ → **ไม่ใช่การฝ่าฝืนกติกา PageHeader**
- **`/andon-board` มี raw `<h1>`**: เป็นหน้า special (จอ TV) ที่กติกาอนุญาตให้จัดการหัวหน้าเอง → ไม่นับ
- horizontal overflow = 0 ทุกหน้า

## 5. Findings

| ID | ระดับ | อาการ | ต้องอนุมัติ? |
|---|---|---|---|
| C2-1 | LOW | `components/ui/table.tsx` สร้าง surface ตารางเองด้วย `rounded-xl…` แทน `<Card>` → สี/radius/shadow ซ้ำซ้อนกับ primitive และจะเพี้ยนเมื่อแก้ token | ไม่ (UI ล้วน) |
| C2-2 | LOW | 5 ไฟล์ใช้ `rounded-xl border border-border bg-card p-4` ซ้ำ (report-page, report-center, planning, workforce/mine, workforce/training) | ไม่ (UI ล้วน) |

**ทำไมยังไม่แก้ในรอบนี้:** การเปลี่ยน 6 ไฟล์เป็นการเปลี่ยนหน้าตาจริง (radius/shadow เปลี่ยนจาก `rounded-xl` → `--cmms-radius-lg`) กระทบทุกหน้าที่มีตารางและหน้า planning/workforce ซึ่ง design audit ล่าสุดรายงาน 263 หน้า = 0 FAIL / 0 WARN อยู่แล้ว — ควรทำเป็นการเปลี่ยนรอบเดียวพร้อมตรวจภาพใหม่ ไม่ใช่แทรกในงาน audit

## 6. สิ่งที่ยังไม่ได้ตรวจ

- หน้า 243 หน้าที่เหลือ (สแกนละเอียดแค่ 7, สแกนหลวม 20 จาก 263)
- หน้าที่ role 5 ไม่มีสิทธิ์ (ส่วนใหญ่ของระบบ) — ต้องใช้บัญชี role 1/2/3
- tile/KPI tile (`KpiStrip`) ว่านับเป็น "card" ตามกติกาหรือไม่
- dark mode (ยังไม่มีในสไตล์ชีต ตาม `DESIGN_TOKENS.md`)

## 7. สรุปสถานะ checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] ตรวจ card-in-card/tile มาตรฐานเดียว` | **ตรวจแล้วบางส่วน** — card-in-card = 0/7 หน้า (ผ่าน), surface นอกมาตรฐาน 2 แบบใน 6 ไฟล์ (C2-1, C2-2) |
