# Phase 1 — Per-page evidence สำหรับ "13 route ใหม่" + การจำแนกหัวหน้าครบ 252 หน้า

> วันที่: 2026-11-23 · เป้าหมาย: ปิดช่องว่างที่ `MASTER_SYSTEM_DISCOVERY.md` / `MASTER_UI_AUDIT.md` (U1, C4) ระบุว่า "13 route ใหม่ไม่มี per-page evidence"
> วิธี: นับไฟล์จริง + เปิดหน้าจริงด้วย role 5 (Viewer) บน `:3001` + วัด overflow ที่ 1440 และ 390

## 1. สถานะ 13 route ที่เคยขาดหลักฐาน

`docs/MASTER_SYSTEM_DISCOVERY.md:39` ระบุ 13 route = `dashboard/*` 10 หน้า + `onboarding` + `ui-demo` + `ui-kit`

- **`ui-demo`, `ui-kit` ถูกลบแล้ว** — commit `d6f19ef7` ("drop demo routes") → เหลือ 11 route ที่ต้องมีหลักฐาน
- 11 route ที่เหลือ: วัดครบแล้วด้านล่าง

## 2. หลักฐานรายหน้า (เปิดจริง, role 5, 1440 px)

| route | HTTP | h1 | เนื้อหาจริงที่เห็น | overflowX |
|---|---|---|---|---|
| `/dashboard/backlog-aging` | 200 | "Backlog & Aging งานค้างสะสม" | งานค้างทั้งหมด **106**, ค้าง 0–3 วัน **4**, 4–7 วัน **0**, 8–14 วัน **5** | 0 |
| `/dashboard/data-quality` | 200 | "Data Quality & System Adoption" | งานปิดแล้ว **6**, มี root cause **6/6 (100%)** | 0 |
| `/dashboard/facility` | 200 | "Facility Management" | สินทรัพย์ **82**, ประกันหมดอายุ **0**, หมวดหมู่ **1** | 0 |
| `/dashboard/lubrication` | 200 | "Lubrication Management" | ฟอร์มจุดหล่อลื่น, ตารางว่าง + empty state "ยังไม่มีจุดหล่อลื่น" | 0 |
| `/dashboard/pm-compliance` | 200 | "PM Compliance & Planned vs Unplanned" | แผน PM **3**, ทำเสร็จ **1**, ทำทันกำหนด **0**, อัตราความสำเร็จ **33.3%**, "ทำทัน % = ไม่มีข้อมูล" | 0 |
| `/dashboard/predictive-ai` | 200 | "Predictive & AI Maintenance Intelligence" | gate: "ข้อมูลยังไม่พอ (มี **6 จาก 30**)" | 0 |
| `/dashboard/production-impact` | 200 | "Production Impact & OEE" | ชั่วโมงเดินเครื่อง **10,776.0**, บันทึก **540** | 0 |
| `/dashboard/shift-handover` | 200 | "Shift Handover สรุปส่งกะ" | ฟอร์มบันทึก + ประวัติว่าง | 0 |
| `/dashboard/utility-energy` | 200 | "Utility & Energy" | ฟอร์มจดมิเตอร์ + ตารางว่าง | 0 |
| `/dashboard/wallboard` | 200 | "CMMS-TPT" | control tower (TOPPLAN MAINTENANCE CONTROL TOWER), ตัวกรองโรงงาน/แผนก | 0 |
| `/onboarding` | 200 | "Onboarding Wizard — เตรียมข้อมูลหลักก่อน Go Live" | wizard master data | 0 |

**มือถือ 390 px:** overflowX = **0 ทุกหน้า** (ทั้ง 11)
**console error:** **1 ทุกหน้า** = `403 /api/v1/settings.php` → ตรงกับ L11-1 ใน `PHASE_11_LIGHTHOUSE_REPORT.md` (ยืนยันซ้ำแบบรายหน้า)

### ข้อสังเกตจากข้อมูลจริง

- **`pm-compliance` คำนวณ KPI จากข้อมูล `E2E-SEED`**: แผน 3 ใบ (seed วันนี้ 10:06) → "อัตราความสำเร็จ 33.3%" คือ 1/3 ของ seed ไม่ใช่ผลผลิตจริง → KPI บนแดชบอร์ดปนเปื้อนด้วย seed (เกี่ยวข้องกับ P9-4b ที่ต้องรออนุมัติสูตร)
- `data-quality` นับ "งานปิดแล้ว 6" แต่ตาราง `repair` มี 105 แถว → นิยาม "ปิดแล้ว" แคบกว่าที่คาด (ไม่ใช่ bug แต่ต้องยืนยันนิยาม)

## 3. การจำแนกหัวหน้าครบ **252 หน้า** (`app/(dashboard)/**/page.tsx`)

| ประเภท | จำนวน | สถานะตามกฎ |
|---|---|---|
| ใช้ `PageHeader`/`DetailHeader` โดยตรง | **217** | ✔ ผ่าน |
| `reports/*` ผ่าน `components/reports/report-page.tsx` → `DetailHeader` | **11** | ✔ ผ่าน (ทางอ้อม) |
| `approval/center` ส่งต่อไป `approval/page.tsx` (มี header) | **1** | ✔ ผ่าน |
| redirect-only stub (ไม่มี UI) | **10** | N/A — `contractors/permits`, `documents/{edit,forms,manuals,review,shutdown,engineering-changes}`, `engineering-changes/{edit,requests}`, `knowledge/articles/edit` |
| board เต็มจอที่สร้าง `<h1>` เอง | **2** | by design — `andon-board`, `dashboard/wallboard` |
| **`PageShell` สร้างหัวหน้าเอง (markup ขนานกับ PageHeader)** | **10** | ✘ ฝ่าฝืนตัวอักษรของกฎ (ดู §4) |
| **`calibration/mobile` สร้างหัวหน้าเอง** | **1** | ✘ = A8-1 (รู้อยู่แล้ว) |
| **รวม** | **252** | ผ่าน 229 · N/A 10 · by design 2 · **ฝ่าฝืน 11** |

## 4. Finding ใหม่ P1-1 (MEDIUM) — `PageShell` เป็น header ระบบที่สอง

`components/PageShell.tsx:82-93` เรนเดอร์ `<h1 className="max-w-3xl text-[1.75rem] font-bold leading-[1.2] tracking-[-0.01em] …">` เอง แทนที่จะเรียก `PageHeader`
- หน้าที่ยืนยันจากการเปิดจริงว่ามี `<h1>` **1 ตัวพอดี** และสไตลล์ตรงกับ PageHeader (เห็นด้วยตา + class เดียวกัน) → **ยังไม่มีอาการเสียที่ผู้ใช้เห็นในรอบนี้**
- แต่ความเสี่ยงจริง: แก้ `PageHeader` ครั้งหน้า → 10 หน้านี้ไม่เปลี่ยนตาม (drift) และกฎ "หัวหน้าต้องมาจาก PageHeader/DetailHeader เท่านั้น" ถูกฝ่าฝืนเชิงโครงสร้าง
- หน้าที่กระทบ (รายชื่อเต็มจาก `grep -rl`): `/dashboard` (หน้าหลัก) + `dashboard/{backlog-aging, data-quality, facility, lubrication, pm-compliance, predictive-ai, production-impact, shift-handover, utility-energy}` = **10 หน้า**
- ทางเลือกที่ต้องอนุมัติ: (ก) ให้ `PageShell` เรียก `PageHeader` ข้างในแทน markup ของตัวเอง (แตะ `components/` = ต้องอนุมัติ) หรือ (ข) ยอมรับเป็นข้อยกเว้นและบันทึกใน DESIGN_SYSTEM

## 5. ยังไม่ได้ตรวจ

- 768 px (แท็บเล็ต) — รอบนี้วัด 1440 และ 390
- หน้ารายละเอียด/ฟอร์มของ 11 route (ตรวจเฉพาะหน้า index)
- axe ของ 11 route (axe รอบก่อนครอบ 8 หน้า)
- `wallboard`/`andon-board` ในโหมด fullscreen/TV จริง
