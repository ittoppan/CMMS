# Phase 4 (ต่อ) — KPI Parity: ตัวเลขบนจอ vs SQL จริง

> วันที่: 2026-11-23 · ต่อจาก `PHASE_4_KPI_VALIDATION_REPORT.md` (K1–K10)
> รอบนี้ตรวจคนละมุม: **เปิดหน้าจริง อ่านตัวเลขที่ผู้ใช้เห็น แล้วเทียบกับ SQL บน DB เดียวกัน**
> ⚠️ หน้าจอเสิร์ฟจาก build 22 พ.ย. (`:3001`, R9-9) — ตัวเลขมาจาก DB จึงเทียบได้ แต่ **label บางตัวต่างจากซอร์สปัจจุบัน** (ดู §5)

## 1. ผลตรวจ parity (8 จุดที่วัด)

| หน้า | KPI บนจอ | ค่า | SQL เดียวกัน | ตรง? |
|---|---|---|---|---|
| `/dashboard/facility` | สินทรัพย์ทั้งหมด | 82 | `SELECT COUNT(*) FROM asset_registry` = **82** | ✔ |
| `/dashboard/facility` | ประกันหมดอายุ | 0 | ไม่มีแถวที่ `warranty_end < CURDATE()` | ✔ |
| `/dashboard/facility` | หมวดหมู่ | 1 | 1 หมวดที่มีสินค้า | ✔ |
| `/dashboard/data-quality` | งานที่ปิดแล้ว | 6 | `status IN ('completed','verified','closed','done','resolved')` = **6** | ✔ |
| `/dashboard/data-quality` | มี root cause / solution / ชั่วโมงจริง | 100% (6/6) ทั้งสาม | `SUM(root_cause<>'')`=6, `SUM(solution<>'')`=6 | ✔ |
| `/dashboard/data-quality` | ผู้ใช้ที่ยังไม่มีงานมอบหมาย | **20** | `users u LEFT JOIN repair r ON r.assigned_to=u.id WHERE r.id IS NULL AND u.is_active=1` = **20** | ✔ |
| `/dashboard/production-impact` | ชั่วโมงเดินเครื่องรวม / จำนวนบันทึก | 10,776.0 / 540 | `SUM(hours)`=10776.0, `COUNT(*)`=540 | ✔ |
| `/dashboard/backlog-aging` | งานค้างทั้งหมด | 106 | `status NOT IN ('cancelled','rejected','draft','done','skipped','closed','verified')` = **106** | ✔ |
| `/dashboard/pm-compliance` | แผน PM / ทำเสร็จ / สำเร็จ | 3 / 1 / 33.3% | `pm_am`=3, `status='completed'`=1 → 33.3% | ✔ (แต่เป็น seed) |

**สรุป: 8/8 KPI ที่วัด ตรงกับ SQL** — ไม่พบตัวเลขที่คำนวณผิดในชุดนี้

## 2. K4-1 (MEDIUM) — ใบงาน `completed` ถูกนับเป็น "งานค้าง" และ "ปิดแล้ว" พร้อมกัน

| หน้า | นิยามที่ใช้ | ผล |
|---|---|---|
| `backlog-aging` (ผ่าน `kpi_wo_list`, group=open) | `status NOT IN ('cancelled','rejected','draft','done','skipped','closed','verified')` → **`completed` ยังอยู่** | 106 ใบ |
| `data-quality` (`data_quality.php:22`) | `status IN ('completed','verified','closed','done','resolved')` → **`completed` = ปิดแล้ว** | 6 ใบ |

ผลต่อผู้ใช้: ใบงาน **6 ใบ** เดียวกัน ปรากฏทั้งใน "งานค้างสะสม 106" และ "งานที่ปิดแล้ว 6" — ไม่ใช่ bug ของโค้ดแต่ละหน้า แต่เป็น **นิยามที่ขัดกัน** ต้องให้เจ้าของระบบตัดสิน (การเปลี่ยนสูตร = ต้องอนุมัติ)
ข้อสังเกต: ตาราง `repair` ปัจจุบันมีแต่ `completed` ไม่มี `closed`/`verified` เลย → ช่องว่างนี้จะเด่นขึ้นเมื่อเริ่มมีใบที่ปิดจริง

## 3. K4-2 (MEDIUM) — KPI "เกินกำหนด/Overdue" เป็นศูนย์เชิงโครงสร้าง เพราะข้อมูลไม่มีวันครบกำหนด

| ตัวชี้วัด | ค่า |
|---|---|
| ใบงานค้าง (106) ที่มี `sla_due_at` | **1** |
| ที่มี `estimated_completion_date` | **1** |
| ที่มี `planned_end_at` | **0** |

`kpi_wo_list` คืน `due_at = COALESCE(sla_due_at, estimated_completion_date, planned_end_at)` → 105/106 ใบ `due_at = null`
ผลบนจอ: คอลัมน์ "กำหนดเสร็จ" = `—` ทุกแถว, KPI "เกินกำหนด" = 0 → **ถูกตามข้อมูล แต่ทำให้ SLA/Overdue ตรวจสอบไม่ได้** (ข้อมูล ไม่ใช่โค้ด)

## 4. สิ่งที่ยืนยันซ้ำ (ไม่ใช่ finding ใหม่)

- `pm-compliance` 33.3% มาจาก `E2E-SEED` 3 ใบ (seed วันนี้ 10:06) → ยังเป็น BLOCKED ตามเดิม (`PHASE_7_PM_UI_AUDIT.md` §2)
- `lubrication` / `shift-handover` / `utility-energy` = 0 แถว → empty state ถูกต้อง

## 5. คำเตือนเรื่อง build เก่า (R9-9)

บนจอพบ label ที่ **ไม่ตรงกับซอร์สปัจจุบัน** เช่น
- จอ: "ค้าง 0-3 วัน / 4-7 วัน / 8-14 วัน / >14 วัน"
- ซอร์ส `backlog-aging/page.tsx:68-76,110-115`: bucket `d0_7 / d8_14 / d15_30 / d30p` → label "อายุ 0-7 / 8-14 / 15-30 / >30"

→ **ห้ามสรุปเรื่อง label/UX จากรอบนี้** ตัวเลขเทียบได้ แต่ข้อความต้อง rebuild แล้ววัดใหม่ (ค้างรออนุมัติ restart `:3001`)

## 6. ยังไม่ได้ตรวจ

- KPI ของหน้าอื่น: `reports/*` (11 หน้า), `wallboard`, `dashboard/[module]` ที่เหลือ (`sla-control`, `overview` ฯลฯ)
- ค่า `mtbf_mttr` (18 แถว seed) และกราฟ trend (ตรวจเฉพาะตัวเลข KPI ไม่ได้ตรวจเส้นกราฟ)
- parity หลัง rebuild (จะยืนยัน label + ค่าพร้อมกัน)
