# Phase 4 — KPI Validation Report (Dashboard / Wallboard / Supervisor)

> วันที่วัด: **2026-11-23 14:06:42 (+07:00)** · DB: `cmms_tpt` · HEAD ขณะวัด: `9d3399ca`
> วิธี: คำนวณ KPI ใหม่จากข้อมูลดิบ (`repair`, `pm_am`, `mtbf_mttr`, `asset_registry`, `v_inspection_dashboard_kpis`)
> ตามสูตรใน `docs/KPI_INVENTORY.md` แล้วเทียบกับค่าที่ฟังก์ชันกลาง `src/helpers/kpi.php` คืน
> (ฟังก์ชันนี้เป็นแหล่งเดียวของตัวเลขทั้ง 3 หน้าจอ) — **ไม่แก้สูตรใด ๆ ตามคำสั่ง**
> ข้อมูลดิบเต็ม: `docs/PHASE_4_KPI_RAW.json`

---

## 0. ขอบเขตและวิธีการ

| หน้าจอ | แหล่งตัวเลข | ฟิลด์ที่ตรวจ |
|---|---|---|
| Wallboard `/dashboard/wallboard` | `dashboard.php?action=overview/trend/downtime/pm` + `/api/v1/mtbf_mttr.php` | Total Work Orders, Completed, Completion rate, In Progress, Overdue, MTTR, MTBF, Downtime, SLA at risk, Critical open, SLA by priority, donut สถานะ, Asset Health, MTBF/MTTR trend |
| Supervisor `/supervisor` | `supervisor.php?action=kpis` + `dashboard.php?action=trend` | 6 การ์ดสถานะ (Total Open/New Requests/In Progress/Waiting for Parts/Overdue/Completed), 5 การ์ดประสิทธิภาพ (MTTR/MTBF/เวลาตอบสนอง/SLA/PM), top overdue, trend |
| Dashboard | `/dashboard/my` (overview core), `/dashboard/pm-compliance` (overview pm), `/dashboard` (portal — ไม่มีตัวเลข KPI) | counts ที่หน้า my ใช้, PM metrics ทั้งชุด |

- ทุกค่าที่หน้ารับมาจาก API แล้วแสดงตรง ๆ (อ่านโค้ดยืนยัน: `wallboard/page.tsx` ใช้ `core.total_wo_created`, `core.wo_completed_in_range`, `core.mttr_hours`, `core.downtime_minutes`, `ov.alerts.*`; `supervisor/page.tsx` ใช้ `c.*`, `data.mttr_hours`, `data.sla_compliance_pct`, `data.pm_compliance_pct`)
- Role ที่ใช้วัดค่า "ทั้งโรงงาน": role 2 (Manager, ไม่มี scope) — เทียบเท่า session ของหัวหน้างาน
- ตรวจ scope (V2) แยกด้วย role 3 (Technician) และ role 4 (Operator)

### ชุดข้อมูล ณ เวลาที่วัด (สำคัญ)

| ตาราง | จำนวน | หมายเหตุ |
|---|---|---|
| `repair` | 105 | `open` 74, `in_progress` 22, `completed` 6, `pending` 2, `assigned` 1 · `source_type='breakdown'` **ทั้ง 105 แถว** |
| `pm_am` | 3 | ทั้ง 3 แถวชื่อขึ้นต้น `E2E-SEED` (seed จาก e2e) |
| `mtbf_mttr` | 18 | asset 91/92/93 เดือน 06–11/2026 · `created_at` = 2026-11-23 10:06:42 ทั้งหมด (seed) |
| `maintenance_requests` | 0 | — |
| `asset_registry` | 82 | `status='active'` ทั้ง 82 · `criticality='A'` = 0 |

> **ข้อจำกัดสำคัญ:** ใบงานที่ปิดแล้วทั้ง 6 ใบเป็น `E2E-WO-1..6` (seed) และข้อมูล MTBF/MTTR/PM ทั้งหมดเป็น seed
> ตัวเลขที่ "ตรงสูตร" ด้านล่างจึงพิสูจน์ความถูกต้องของสูตร/พาธข้อมูลได้ แต่ **ยังไม่ใช่หลักฐานจากข้อมูลผลิตจริง**

---

## 1. สรุปผล

| ผล | จำนวน KPI |
|---|---|
| ตรงกับสูตรใน inventory (ตัวเลขเท่ากัน) | 13 |
| **คลาดเคลื่อน (ตัวเลขต่าง)** | **3** (critical open, PM completion, MTBF panel) |
| คลาดเคลื่อนเชิงนิยาม/ป้ายชื่อ (ตัวเลขยังตรงสูตรที่เขียนไว้ แต่ผิดจาก inventory หรือป้ายบนจอ) | 4 |
| วัดไม่ได้ / INSUFFICIENT DATA (ถูกต้องตาม V1) | 3 |
| นอกขอบเขต (ไม่ได้วัดรอบนี้) | reliability/cost/spare/OEE ฯลฯ |

**สรุปเชิงตัดสิน:** KPI หลักของ Work Order (created/completed/rate/downtime/MTTR/MTBF-core/overdue/open/status counts) ตรงกับ SQL จริงทุกช่วงเวลาที่ทดสอบ
แต่พบ **3 จุดที่ตัวเลขบนจอไม่ตรงสูตร inventory** และ **4 จุดที่นิยาม/ป้ายชื่อทำให้อ่านผิด** — ยังไม่แก้ตามคำสั่ง

---

## 2. KPI ที่ตรงกับ SQL จริง

ทดสอบ 5 ช่วง: ไม่ระบุช่วง, today, this_month, last_month, this_year (ผู้ใช้ role 2, ไม่กรองแผนก)

| KPI | ไม่ระบุช่วง (impl = SQL) | this_month | last_month | this_year | today |
|---|---|---|---|---|---|
| Total Work Orders (created ในช่วง) | 105 = 105 | 12 = 12 | 21 = 21 | 105 = 105 | 0 = 0 |
| Completed (completed_at ในช่วง + สถานะปิด) | 6 = 6 | 1 = 1 | 1 = 1 | 6 = 6 | 0 = 0 |
| Completion rate | 5.7% = 5.7% | 8.3% = 8.3% | 4.8% = 4.8% | 5.7% = 5.7% | null = null |
| Breakdown count | 105 = 105 | 12 = 12 | 21 = 21 | 105 = 105 | 0 = 0 |
| Downtime (นาที, ตาม created_at) | 885 = 885 | 195 = 195 | 240 = 240 | 885 = 885 | 0 = 0 |
| MTTR (ชม.) | 2.5 = 2.5 | 2.5 = 2.5 | 4.0 = 4.0 | 2.33 = 2.33 | null = null |
| MTBF (ชม., 180 วัน จาก repair) | 734.4 = 734.4 | 734.4 | 734.4 | 734.4 | 734.4 |
| Overdue (counts.overdue) | 74 = 74 | 74 | 74 | 74 | 74 |
| `alerts.overdue_open` vs `counts.overdue` | 74 = 74 | 74 | 74 | 74 | 74 |
| Open WO | 105 = 105 | 105 | 105 | 105 | 105 |
| Unassigned | 74 = 74 | — | — | — | — |
| Pending verification | 6 = 6 | — | — | — | — |
| Waiting for parts | 0 = 0 | — | — | — | — |

**Scope ตามบทบาท (V2):**

| Role | SQL ที่ scope แล้ว | ค่าที่ API คืน |
|---|---|---|
| Technician (3, user 1) | 6 ใบงาน | `total_wo_created` = 6 ✅ |
| Operator (4, user 1) | 9 ใบงาน (`created_by`) | `total_wo_created` = 9 ✅ |

**ช่วงเวลา (V4):** `this_month` = 2026-11-01 00:00:00 → 2026-11-23 23:59:59 (รวมวันสุดท้าย) ✅
**หน่วย (V6):** Downtime 885 นาที → 14.75 ชม. → แสดง 14.8 ชม. ✅ · MTTR/MTBF เป็นชั่วโมง ✅

---

## 3. KPI ที่คลาดเคลื่อน (ต้องอนุมัติก่อนแก้ — ห้ามแก้สูตรเอง)

### K1 — HIGH: "Critical open" ให้ 2 ค่าต่างกันใน payload เดียว

| ที่มา | ค่า |
|---|---|
| `core.counts.critical_active` (ใช้โดย dashboard) | **0** |
| `alerts.critical_open` (wallboard "วิกฤตเปิดอยู่") | **1** |
| สูตร inventory §1.1: `priority='critical' AND status ∈ active` | **1** |

หลักฐานข้อมูล: `E2E-WO-4` (id 2057) priority `critical`, status `completed`
- `kpi_core_metrics()` ใช้ลิสต์สถานะที่ **ตัด `completed`, `pending_verification`, `resolved` ออก** (`src/helpers/kpi.php:321`)
- `kpi_alerts()` ใช้ลิสต์ที่ **รวม 3 สถานะนั้น** (`kpi.php:547`) และ `kpi_active_statuses()` (§0.4) ก็รวมอยู่แล้ว
- ผล: หน้าจอเดียว (wallboard) แสดง "วิกฤตเปิดอยู่ 1" แต่ API ฟิลด์ `critical_active` = 0

### K2 — HIGH: PM completion ใช้ตัวหารทั้งตาราง ไม่ผูกช่วงเวลา → แสดง 0% แทน INSUFFICIENT DATA

`kpi_pm_metrics()` (`kpi.php:665-710`) กำหนด `due_total` = `COUNT(*) FROM pm_am` ทั้งตาราง (ไม่กรองช่วง)

| ช่วง | completed | due_total (impl) | completion_rate (impl) | สูตร inventory (done ในช่วง / due ในช่วง) |
|---|---|---|---|---|
| ไม่ระบุช่วง | 1 | 3 | 33.3% | 33.3% (1/3) ✅ |
| today | 0 | **3** | **0%** | **null** (0/0 → INSUFFICIENT DATA) ❌ |
| this_month | 0 | **3** | **0%** | **null** ❌ |
| last_month | 0 | **3** | **0%** | **null** ❌ |
| this_year | 0 | **3** | **0%** | **null** ❌ |

ผลต่อจอ: `/dashboard/pm-compliance` แสดง "อัตราความสำเร็จ 0%" (`pm-compliance/page.tsx:43`) ซึ่งอ่านว่า "ทำไม่ได้เลย" ทั้งที่ไม่มีแผนถึงกำหนดในช่วงนั้น

**K2b — ตัวเลข PM ขัดกันเอง:** `completed` = 1 แต่ `on_time` 0 + `late` 0 = 0
เพราะ `pm_am` id 752 มี `status='completed'` แต่ `completed_at IS NULL` → นับเป็น "ทำเสร็จ" แต่ไม่ถูกนับทัน/เลยกำหนด (`on_time_pct` = 0%)

**K2c — V1 violation ที่แหล่งข้อมูล:** `v_inspection_dashboard_kpis` คืน `total_schedules = 0` แต่ `compliance_pct = 0`
→ `core.pm_compliance_pct = 0` → การ์ด supervisor "% ทำ PM" แสดง **0%** แทน `—` (ตัวหาร 0 ต้องเป็น null)

### K3 — HIGH: MTBF บน wallboard ใช้ "ค่าเฉลี่ยของค่าเฉลี่ย" ไม่ใช่ SUM/SUM

`monthlyMtbfMttr()` (`frontend/lib/dashboard-tower.ts:136-163`) เฉลี่ย `mtbf_hours` ของทุกแถวรายเครื่องในเดือน
ขณะที่ inventory §3.2 กำหนด `MTBF = SUM(operating_hours) / SUM(total_failures)`

| เดือน | SUM(op)/SUM(fail) ตามสูตร | ค่าที่กราฟแสดง | ต่าง |
|---|---|---|---|
| 2026-06 | 1,802.0 | 598.0 | −1,204.0 (−66.8%) |
| 2026-07 | 1,855.0 | 622.0 | −1,233.0 (−66.5%) |
| 2026-08 | 1,835.0 | 608.0 | −1,227.0 (−66.9%) |
| 2026-09 | 1,799.0 | 590.0 | −1,209.0 (−67.2%) |
| 2026-10 | 1,864.0 | 621.0 | −1,243.0 (−66.7%) |
| 2026-11 | 691.0 | 459.0 | −232.0 (−33.6%) |
| รวมตาราง | 1,505.3 | (จุดล่าสุด 459.0) | — |

สาเหตุ: แถวที่ `total_failures = 0` (operating hours มี แต่ mtbf = null) ถูกตัดออกจากตัวเฉลี่ย แต่สูตร SUM/SUM ต้องนับชั่วโมงเดินเครื่องเหล่านั้นด้วย
MTTR ของกราฟ **ตรง** ทุกเดือน (2.0 / 3.0 / 1.5 / 1.0 / 4.0 / 1.6 ชม.) เพราะทุกแถวมี failures = 1

**K3b — MTBF สองนิยามบนจอเดียว:** การ์ด KPI แสดง `MTBF 734.4 ชม.` (จาก `repair`, 180 วัน) แต่กราฟ MTBF/MTTR แสดง `459 ชม.` (จาก `mtbf_mttr`) ในช่วงเวลาเดียวกัน
**K3c:** กราฟนี้ไม่ตอบสนองตัวกรองช่วงเวลา/แผนก (เลือก 8 เดือนล่าสุดของตารางเสมอ)

### K4 — MEDIUM: ตัวกรองแผนกไม่ถูกใช้กับ MTTR / MTBF / SLA → ตัวเลขผสมขอบเขต

ทดสอบกรองแผนก 10 (แผนกที่มีใบงานมากสุด):

| KPI | ไม่กรอง | กรองแผนก 10 (impl) | ความจริงของแผนก 10 |
|---|---|---|---|
| Total created | 105 | **14** ✅ | 14 |
| Downtime | 885 นาที | **0** ✅ | 0 |
| MTTR | 2.5 ชม. | **2.5** ❌ | null (ไม่มีใบงานปิดของแผนกนี้ในช่วง 30 วัน) |
| MTBF | 734.4 ชม. | **734.4** ❌ | null |
| SLA compliance | null | null ✅ | null |

สาเหตุ: `kpi_core_metrics()` ใส่ `$flt` ให้ total/downtime แต่ MTTR/MTBF/SLA ใช้เฉพาะ `$scope` (`kpi.php:352-430`)
ผลคือผู้ใช้ที่กรองแผนกเห็น "14 ใบงาน, downtime 0" แต่ MTTR/MTBF ยังเป็นของทั้งโรงงาน

### K5 — MEDIUM: สถานะ `pending` ไม่อยู่ในกลุ่มใดเลย → หายจาก donut และ SLA panel

- `repair` มี 2 แถวสถานะ `pending`: `EN-2611-001` (2026-11-19), `EN-2611-002` (2026-11-20)
- `pending` ไม่อยู่ใน `kpi_active_statuses()` และไม่อยู่ใน `kpi_done_statuses()`
- donut "Work Orders by Status" = unassigned 74 + assigned 1 + pending_approval 0 + active 22 + waiting 0 + pending_verification 6 = **103** แต่ badge "ค้าง" = `open_wo` = **105**
- SLA by priority รวม = **103** (1 critical + 6 high + 96 medium + 0 low) ไม่เท่ากับ 105
- 2 ใบนี้ไม่ถูกนับใน overdue (อายุ 4 วัน ยังไม่เข้าเกณฑ์ 7 วัน) — จะหายต่อไปจนกว่าจะเปลี่ยนสถานะ

### K6 — MEDIUM: ป้าย "Completed" ของ supervisor นับเฉพาะ verified/closed

- การ์ด `/supervisor` "Completed" = `c.verified` = `verified + closed` = **0** (`supervisor/page.tsx:152`)
- แต่มีใบงาน `completed` ในระบบ **6 ใบ** (ทั้งหมด E2E-WO)
- ป้ายสื่อว่า "ปิดงานแล้ว 0" ทั้งที่งานเสร็จแล้ว 6 ใบ (รอตรวจรับ)
- `/dashboard/my` การ์ด "Jobs Completed / Month" = `counts.verified` = **0** และไม่ได้ผูกเดือน (เป็นยอดสะสม) (`dashboard/my/page.tsx:200`)

### K7 — MEDIUM: Overdue 74 แต่แผง SLA บอก "เลยกำหนด" รวม 1

- `Overdue` tile = `counts.overdue` = **74** (มาจากกฎเปิดเกิน 7 วัน 73 ใบ + due date 1 ใบ)
- แผง SLA by priority = ผลรวม `overdue` = **1** (เฉพาะใบที่มีกำหนดส่ง: id 71, due 2026-11-17)
- ทั้งสองถูกตามนิยามของตัวเอง แต่ไม่มีคำอธิบายบนจอ → ผู้ใช้อ่านว่าเลขขัดกัน

### K8 — LOW: Trend ใช้หน้าต่างเวลาคนละแบบกับ KPI ที่อยู่ข้างกัน

| ช่วงที่เลือก | KPI Total (all-time/ช่วง) | ผลรวม trend | หมายเหตุ |
|---|---|---|---|
| ไม่ระบุ | 105 | 17 | trend = 30 วันล่าสุดโดยปริยาย |
| this_month | 12 | 12 ✅ | |
| last_month | 21 | 21 ✅ | |
| this_year | 105 | 33 | trend ถูก cap 62 วัน |

supervisor เรียก `dashboard.php?action=trend` โดยไม่ส่ง range → กราฟ 30 วัน วางข้างการ์ดที่ไม่ได้ผูกช่วง

### K9–K11 — LOW: ความต่างระหว่างสูตรที่ implement กับ inventory (ยังไม่มีผลเป็นตัวเลขวันนี้)

| รหัส | เรื่อง | ผลกระทบวันนี้ |
|---|---|---|
| K9 | `kpi_is_overdue()` ไม่ตรวจ `planned_end_at` (inventory §0.5 ระบุรวม) — `kpi.php:244,261` | 0 ใบ (ไม่มีใบที่ใช้ planned_end_at อย่างเดียว) |
| K10 | MTTR มี fallback `TIMESTAMPDIFF(actual_start, completed)` นอกสูตร inventory (ที่ระบุ AVG(repair_time_minutes)) | 0 ใบ (6/6 ใบที่ปิดมี repair_time_minutes) |
| K11 | PM on-time เทียบ `completed_at <= due_date` (datetime กับวันที่ 00:00) ขณะที่ inventory ใช้ `DATE(completed_at) <= due_date` | วัดไม่ได้ (completed_at เป็น NULL) |

---

## 4. KPI ที่วัดไม่ได้ / INSUFFICIENT DATA (ถูกต้องตาม V1)

| KPI | ค่า | เหตุผล |
|---|---|---|
| SLA compliance % | `null` → แสดง `—` | มีใบงานcompleted ที่มีกำหนดส่ง 0 ใบ (`sla_due_total = 0`) — มีเพียง 1 ใบในระบบที่มี due date และยังไม่ปิด |
| เวลาตอบสนองเฉลี่ย | `null` | `response_time_minutes` ไม่มีค่า > 0 |
| OEE / Availability / Performance / Quality | `N/A` | ไม่มีข้อมูล QC/OEE จริง — หน้าไม่คำนวณเอง (ถูกต้อง) |
| Critical asset downtime | 0 นาที | ไม่มี asset `criticality='A'` (0 ตัว) |
| Planned % / Unplanned % | 0% / 100% | `source_type='breakdown'` ทั้ง 105 แถว ไม่มีงาน PM ใน `repair` |
| New Requests | 0 | `maintenance_requests` ว่าง |

---

## 5. Asset Health บน wallboard (เชิงความหมาย)

| ตัวเลข | ค่า |
|---|---|
| total_assets | 82 |
| running (status='active') | 82 → donut "พร้อมใช้" 82, Overall Health **100%** |
| down (เครื่องที่มีใบงานค้างตาม `kpi_active_statuses`) | **81** (ไม่ถูกแสดงบน donut) |
| under_maintenance / inactive | 0 / 0 |
| critical_assets (criticality A) | 0 |

donut ใช้ `asset_registry.status` ไม่ใช่ health score → แสดง 100% healthy ทั้งที่ 81/82 เครื่องมีใบงานค้าง
ไม่ใช่สูตรผิด (ไม่มีสูตร health ใน inventory §3.1 ที่นี่) แต่ป้าย "Asset Health / Overall Health" ทำให้เข้าใจผิด

---

## 6. ข้อจำกัดของการตรวจรอบนี้

- ตรวจที่ **ค่าที่ API/ฟังก์ชันกลางคืน** + อ่านโค้ดยืนยันว่าหน้าระบุฟิลด์นั้นตรง ๆ — **ยังไม่ได้เปิดเบราว์เซอร์**ยืนยันการแสดงผล/การปัดเศษบนจอรอบนี้
- ตัวเลขทั้งหมดอิง snapshot 2026-11-23 14:06; ข้อมูล seed (E2E) ถูกนับรวม — ข้อสรุปเรื่อง "ความถูกต้องของสูตร" ใช้ได้ แต่ข้อสรุปเรื่อง "คุณภาพข้อมูล producción" ยังไม่ได้
- ไม่ได้วัด KPI ของโมดูลอื่น (reliability, cost, spare, calibration, workforce, OEE) — คนละ endpoint
- ไม่ได้ทดสอบ role 3/4 ในเบราว์เซอร์ (ทดสอบเฉพาะยอดรวมที่ scope แล้ว)
- ไม่ได้วัด Lighthouse/axe ในรอบนี้

---

## 7. Acceptance

| รายการ | ผล |
|---|---|
| validate KPI ทีละตัวบน 3 surface ตาม inventory | **PASS** (ครบทุกฟิลด์ที่ 3 หน้าแสดง) |
| ตัวเลข WO หลักตรง SQL จริง | **PASS** (13/13 ฟิลด์, 5 ช่วงเวลา, 2 role scope) |
| ไม่แก้สูตร KPI | **PASS** (ไม่มีการแก้โค้ดสูตร) |
| KPI ตรงตาม inventory ทุกตัว | **FAIL** — K1, K2, K3 (ตัวเลขต่าง) + K4–K7 (นิยาม/ป้าย) รออนุมัติแก้ |
| Phase 4 COMPLETE | **ยังไม่** — เหลือ drill-down, last-updated, INSUFFICIENT DATA ครบทุกการ์ด, TBT < 300ms |

## 8. คำสั่งทำซ้ำ

```bash
# ต้องมี .env ที่ root (DB creds) — สคริปต์อ่านผ่าน src/config/db.php
php frontend/tmp-kpi-validate.php > frontend/tmp-kpi-validate.json
php frontend/tmp-kpi-summary.php
php frontend/tmp-kpi-calc2.php
php frontend/tmp-kpi-peek.php
```

> สคริปต์เป็นไฟล์ชั่วคราว (ไม่ commit) — ผลดิบเก็บไว้ที่ `docs/PHASE_4_KPI_RAW.json`
