# Phase 1 (ต่อ) — การวัดที่ 768 px และการตรวจรูปแบบตารางจริง

> วันที่: 2026-11-23 · phase ที่ปิดช่อง "การวัด 768/1440 ยังไม่มี" (tracker §2)
> วิธี: Playwright viewport 768×1024, role 5, วัด `scrollWidth - clientWidth`, นับตารางและดู computed style ของ `thead`/`td`

## 1. ผลที่ 768 px — **overflowX = 0 ทุกหน้า**

| route | overflowX | ตาราง | ตารางล้นกรอบในตัวเอง |
|---|---|---|---|
| `/dashboard` | 0 | 0 | 0 |
| `/dashboard/backlog-aging` | 0 | 1 | 0 |
| `/dashboard/data-quality` | 0 | 0 | 0 |
| `/dashboard/facility` | 0 | 0 | 0 |
| `/dashboard/lubrication` | 0 | 1 | 0 |
| `/dashboard/pm-compliance` | 0 | 0 | 0 |
| `/dashboard/predictive-ai` | 0 | 0 | 0 |
| `/dashboard/production-impact` | 0 | 0 | 0 |
| `/dashboard/shift-handover` | 0 | 0 | 0 |
| `/dashboard/utility-energy` | 0 | 1 | 0 |
| `/dashboard/wallboard` | 0 | 0 | 0 |
| `/onboarding` | 0 | 0 | 0 |

รวมกับที่วัดไว้แล้ว: **390 = 0 ทุกหน้า** (`PHASE_1_PER_PAGE_EVIDENCE.md` §2), **1440 = 0 ทุกหน้า** → ครบ 3 breakpoint สำหรับ 12 หน้า

## 2. ตารางที่ 768 — ยังเป็นตารางจริง ไม่ใช่ stacked card

วัด computed style ที่ 768 ของ 3 หน้าที่มีตาราง:

| route | `<table>` class | `thead` display | `td` display | กว้างตาราง / กรอบ |
|---|---|---|---|---|
| backlog-aging | `min-w-full text-sm` | `table-header-group` | `table-cell` | 726 / 728 |
| lubrication | `min-full text-sm` | `table-header-group` | `table-cell` | 726 / 728 |
| utility-energy | `min-w-full text-sm` | `table-header-group` | `table-cell` | 726 / 728 |

→ ที่ 768 ตาราง **พอดีกรอบ** (726 ≤ 728) ไม่ล้น ไม่ต้องเลื่อน → **ไม่มีปัญหา overflow** แต่ **ไม่มีการยุบเป็นการ์ด** (`data-label` ว่าง)

## 3. Finding P1-2 (LOW / เอกสารไม่ตรงโค้ด) — `.cmms-stack-table` ไม่มีอยู่จริงในโค้ด

`MASTER_UI_AUDIT.md` เขียนว่า Tables = "`.data-table.cmms-stack-table` + `data-label` → **37 ตาราง / 35 หน้า**" แต่ตรวจโค้ดจริง:

| สิ่งที่อ้าง | ของจริง (2026-11-23) |
|---|---|
| class `.cmms-stack-table` | **0 ครั้ง** ทั้ง `app/globals.css` และ `*.tsx` |
| class `.data-table` | **0 ครั้ง** ใน `globals.css` |
| `data-label` | **4 ครั้ง** (ใน 55 ไฟล์ที่มี `<table>`) |
| `<table>` ทั้งหมด | **89 จุด / 55 ไฟล์** |
| `overflow-x-auto` (วิธีจริงที่ใช้) | **86 ครั้ง** |
| class ยอดนิยม | `w-full text-sm` 35 · `w-full text-left text-sm` 8 · `w-full min-w-[720px] text-sm` 5 |

รูปแบบที่โค้ดใช้จริงคือ **`overflow-x-auto` + `min-w-[…px]`** (ตารางเลื่อนแนวนอนในกรอบ) ไม่ใช่ stack-to-card — ซึ่ง**ทำงานได้** (พิสูจน์แล้วว่า overflowX = 0 ที่ 390/768/1440) แต่เอกสาร audit อ้างกลไกที่ไม่เคยมีอยู่ในโค้ด → ตัวเลข "37 ตาราง / 35 หน้า PASS" **ยืนยันไม่ได้**

ผลที่ต้องทำ: แก้ `MASTER_UI_AUDIT.md` ให้ตรงโค้ด (ทำแล้วในรอบนี้) และถ้าต้องการ stacked card จริงต้องเป็นงานใหม่ (แตะ `globals.css` = ต้องอนุมัติ)

## 4. ยังไม่ได้ตรวจ

- 768 ของหน้าอื่นอีก ~240 หน้า (รอบนี้ 12 หน้า)
- พฤติกรรมตารางที่มีคอลัมน์มาก (≥8) ที่ 390 ว่าเลื่อนได้จริงด้วยนิ้ว (ต้องทดสอบบนอุปกรณ์)
- `md:` breakpoint อื่น (1024) ที่ sidebar กลับมาแสดง
