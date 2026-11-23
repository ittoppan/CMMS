# Phase 4 — Audit: การแสดงผล INSUFFICIENT DATA บนหน้าจริง + แก้ชื่อตารางต้นทาง

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] INSUFFICIENT DATA ทุก KPI` ใน Phase 4
> สภาพแวดล้อม: production build `http://localhost:3001` · บัญชี `e2e_viewer` (role 5) · viewport 1440×900
> วิธี: Playwright 1 test เปิด 12 หน้า เก็บ HTTP status, h1, overflow, จำนวน `—`, marker ของ empty state, ข้อความจริงบนหน้า

## 1. ผลการวัด 12 หน้า

| # | path | h1 | 403 gate | overflowX | marker "ไม่มีข้อมูล" | สิ่งที่หน้าแสดงจริง |
|---|---|---|---|---|---|---|
| 1 | `/iot/condition` | 1 | ✅ (Viewer) | 0 | — | 403 gate |
| 2 | `/safety/work_permit` | 1 | ✅ | 0 | — | 403 gate |
| 3 | `/dashboard/lubrication` | 1 | — | 0 | ไม่มี (มี empty state) | `จุดหล่อลื่นทั้งหมด: 0 · ถึงกำหนด: 0` + `ยังไม่มีจุดหล่อลื่น — เพิ่มจากฟอร์มด้านบน` |
| 4 | `/dashboard/utility-energy` | 1 | — | 0 | ✅ | `ยังไม่มีข้อมูลมิเตอร์ — เริ่มบันทึกจากฟอร์มด้านบน` + ตาราง `ไม่มีข้อมูล` |
| 5 | `/contractors` | 1 | ✅ | 0 | — | 403 gate |
| 6 | `/spare_parts/sage_po` | 1 | ✅ | 0 | — | 403 gate |
| 7 | `/shutdown` | 1 | ✅ | 0 | — | 403 gate |
| 8 | `/dashboard/shift-handover` | 1 | — | 0 | ✅ | `ยังไม่มีบันทึกส่งกะ — เริ่มบันทึกจากฟอร์มด้านบน` |
| 9 | `/calibration/dashboard` | 1 | ✅ | 0 | — | 403 gate |
| 10 | `/dashboard/production-impact` | 1 | — | 0 | ไม่ต้อง (มีข้อมูล) | `ชั่วโมงเดินเครื่องรวม 10776.0` · `จำนวนบันทึก 540` · แนวโน้ม 14 วันมีค่า |
| 11 | `/dashboard/predictive-ai` | 1 | — | 0 | ✅ | `ข้อมูลยังไม่พอ (มี 6 จาก 30)` + `ต้องมีงานที่ปิดแล้วอย่างน้อย 30 รายการก่อนแสดงผลพยากรณ์` |
| 12 | `/reliability` | 1 | ✅ | 0 | — | 403 gate |

สรุปเชิงตัวเลข: **h1 = 1 ทุกหน้า · horizontal overflow = 0 ทุกหน้า** · 5 หน้าแสดงเนื้อหาได้ · 7 หน้าโดน 403 gate ของบทบาท Viewer

## 2. ข้อผิดพลาดที่พบในเอกสารเดิม (แก้แล้ว)

การนับแถวก่อนหน้านี้ใช้ชื่อตารางที่ไม่มีอยู่ในสคีมานี้ ทำให้สรุปผิดว่า "ตารางไม่มี" ทั้งที่ของจริงคือ **ตารางมีอยู่แต่ 0 แถว**:

| KPI_INVENTORY อ้าง | ของจริง | แถว |
|---|---|---|
| `shift_handover` (§1.5) | `shift_handovers` | 0 |
| `shutdown_plans` (§2.5) | `sd_shutdowns` + `sd_activity`/`sd_scopes`/… (รวม 9 ตาราง `sd_*`) | 0 ทั้งหมด |
| `calibration_records` (§3.4) | `calibration` + ตระกูล `calibration_*` อีก 9 ตาราง | 0 ทั้งหมด |
| `utility_meters` (§6.3) | ไม่มี — `public/api/v1/utility_energy.php` ใช้ `utility_readings` เดียว | 0 |
| `sage_po` (§4.5) | **ไม่มีตารางนี้ในสคีมา** และหน้า `/spare_parts/sage_po` อ่าน `spare_parts.php` | `spare_parts` = **1,870** |

ผลต่อข้อสรุป: `/spare_parts/sage_po` **ไม่ใช่ INSUFFICIENT DATA** — มีข้อมูล 1,870 แถว
แต่ KPI "PO count/value" และ "Pending PO" ที่ §4.5 อธิบายไว้ **ยังไม่ถูก implement** (ไม่มีแหล่งข้อมูล)
→ แก้ `docs/KPI_INVENTORY.md` §1.5, §2.5, §3.4, §4.5, §6.3 แล้ว พร้อมหมายเหตุกำกับวันที่

## 3. การปฏิบัติตามกฎ V1 (ตัวหาร/ต้นทาง = 0 → null → `—`)

| หน้า | ผล | เหตุผล |
|---|---|---|
| `/dashboard/lubrication` | ✅ ผ่าน | แสดง `0` ได้ เพราะเป็น **count** (มีจุดหล่อลื่น 0 จุดจริง) ไม่ใช่ ratio; V1 ใช้กับตัวหาร |
| `/dashboard/utility-energy` | ✅ ผ่าน | แสดง `ยังไม่มีข้อมูลมิเตอร์` + `ไม่มีข้อมูล` ไม่ใช่ `0` |
| `/dashboard/shift-handover` | ✅ ผ่าน | แสดง `ยังไม่มีบันทึกส่งกะ` |
| `/dashboard/predictive-ai` | ✅ ผ่าน | ใช้เกณฑ์ขั้นต่ำ 30 รายการ และบอกจำนวนจริง `6 จาก 30` |
| `/dashboard/production-impact` | ✅ ผ่าน | มีข้อมูลจริง 540 บันทึก — ไม่ต้องใช้ empty state |
| 7 หน้าที่เหลือ | ⚠️ **ตรวจไม่ได้** | ติด 403 gate ของ role Viewer |

## 4. Findings

| ID | ระดับ | อาการ | ต้องอนุมัติ? |
|---|---|---|---|
| D4-1 | LOW | ทุกหน้า (รวมหน้าเนื้อหา) มี console error 1 รายการจากการเรียก API ที่ถูกปฏิเสธ (เช่น `settings.php`) — **ยังไม่ได้ระบุ URL ในรอบนี้** | ใช่ ถ้าจะแก้ |
| D4-2 | MEDIUM | 7/12 โมดูลตรวจด้วย role Viewer ไม่ได้ → การ audit INSUFFICIENT DATA ยังไม่ครอบคลุม; ต้องใช้บัญชี role 1/2/6/7 ที่มีสิทธิ์ | ไม่ (แค่ต้องมีบัญชี) |
| D4-3 | — | เอกสาร `KPI_INVENTORY.md` อ้างตารางที่ไม่มีจริง 5 จุด → **แก้แล้ว** | ไม่ |

## 5. สิ่งที่ยังไม่ได้ตรวจ

- 7 หน้าที่ติด 403: ไม่เห็นตัวเลข/empty state จริงของ Inspection, Safety, Contractors, Sage PO, Shutdown, Calibration, Reliability
- ค่า `—` ของ KPI ที่เป็น ratio (เช่น compliance %, availability %) เมื่อตัวหารเป็น 0 — ต้องเปิดหน้าที่มีสิทธิ์จึงจะเห็น
- OEE ในหน้า production-impact (ส่วน Availability × Performance × Quality) — ข้อความที่เก็บได้ 420 ตัวอักษรแรกไม่ถึงส่วนนั้น
- API ของแต่ละโมดูลว่าคืน `null` จริงหรือคืน `0` (ตรวจได้แค่ UI ที่ render)

## 6. สรุปสถานะ Phase 4 checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] INSUFFICIENT DATA ทุก KPI` | **ตรวจแล้วบางส่วน** — 5/12 หน้าแสดง empty state ถูกต้อง, 7/12 ติดสิทธิ์; แก้ชื่อตารางต้นทาง 5 จุด |
