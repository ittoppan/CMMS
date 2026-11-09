# KPI Definitions — CMMS-TOPPAN (Phase 23)

เอกสารนี้เป็น **นิยามอย่างเป็นทางการ** ของ KPI ทุกตัวที่ใช้ในระบบ โดยเฉพาะที่เพิ่ม/ใช้ในหน้า
**ศูนย์วิเคราะห์อัจฉริยะ (Intelligence Center)** `/analytics/intelligence`

> หลักการ: สูตรทั้งหมดต้องมาจาก `src/helpers/kpi.php` (แกนกลาง Phase 15) หรือ
> `src/helpers/analytics.php` (Phase 23) เท่านั้น — ห้ามคำนวณซ้ำในหน้าจอ/ฝั่ง client
> และ **ตัวเลขทุกตัวมาจากข้อมูลจริง ไม่มี mock / prediction / ค่าแต่ง**

---

## 1. ข้อตกลงร่วม (Conventions)

### 1.1 ช่วงเวลา (range)
`kpi_parse_range()` แปลง `range` เป็น `[start, end]` (รวมวันสุดท้าย `23:59:59`)

| range | ความหมาย |
|---|---|
| `today` / `yesterday` | วันนี้ / เมื่อวาน |
| `this_week` / `last_week` | จันทร์–ปัจจุบัน / จันทร์–อาทิตย์ของสัปดาห์ก่อน |
| `this_month` / `last_month` | ต้นเดือน–ปัจจุบัน / ทั้งเดือนก่อน |
| `this_quarter` / `last_quarter` | ต้นไตรมาส–ปัจจุบัน / ทั้งไตรมาสก่อน |
| `this_year` / `last_year` | 1 ม.ค.–ปัจจุบัน / ทั้งปีก่อน |
| `custom` | ใช้ `range_start` + `range_end` (Y-m-d) |
| (ว่าง/อื่น ๆ) | `null` = ทุกช่วงเวลา |

ค่าเริ่มต้นของหน้า Intelligence คือ `this_year`

### 1.2 ตัวกรอง (filters)
`kpi_filters()` ทำงานบน alias `r` (ตาราง `repair`): `department_id`, `location_id`, `asset_id`,
`asset_category` (EXISTS บน `asset_registry`), `technician_id` (assigned_to หรือผู้ร่วมงานใน
`work_assignees`), `source_type`, `priority`, `status`

> หมายเหตุ: ตัวกรอง `search` (ค้นหาเครื่อง) และ `asset_category` ของ **asset health**
> ใช้ `ana_asset_filters()` ซึ่งกรองบน `asset_registry` โดยตรง ไม่ได้ผ่าน `kpi_filters`

### 1.3 ขอบเขตตามบทบาท (scope)
`kpi_scope()` — บังคับ server-side:

| role_id | บทบาท | ขอบเขต |
|---|---|---|
| 3 | Technician | เห็นเฉพาะงานที่ `assigned_to` ตัวเอง หรือเป็นผู้ร่วมงาน (`work_assignees`) |
| 4 | Operator | เห็นเฉพาะงานที่ตัวเองแจ้ง (`created_by`) |
| อื่น ๆ (1,2,5,6,7) | Admin/Manager/Viewer/Foreman | เห็นทั้งหมด |

**สิทธิ์ต้นทุน** `kpi_can_see_cost()` = role `1,2,6` เท่านั้น (section `cost` ตอบ `403` กับ role อื่น)

### 1.4 กลุ่มสถานะ
- **active** (`kpi_active_statuses`): `open, acknowledged, draft, pending_approval, approved,
  assigned, accepted, in_progress, paused, waiting_parts, pending_parts, waiting_external,
  waiting_approval, completed, pending_verification, resolved`
- **done** (`kpi_done_statuses`): `closed, cancelled, rejected, verified, done, skipped`

### 1.5 งานค้างเกินกำหนด (overdue)
`kpi_is_overdue()` = จริงเมื่อสถานะยังไม่จบ และอย่างใดอย่างหนึ่ง:
1. `sla_due_at` หรือ `estimated_completion_date` < เวลาปัจจุบัน, หรือ
2. ยังอยู่สถานะตั้งต้น (`open/acknowledged/assigned/accepted/approved/pending_approval`)
   และเปิดมาเกิน **7 วัน**

### 1.6 หลัก "INSUFFICIENT DATA"
KPI ใดที่ตัวหาร/ข้อมูลต้นทางเป็น 0 จะคืน `null` (ไม่ใช่ `0`) เพื่อไม่ให้ตีความเป็นค่าจริง
หน้าจอแสดง `—` / "INSUFFICIENT DATA" และมีป้ายคุณภาพข้อมูลกำกับ

---

## 2. KPI หลักงานซ่อม (`kpi_core_metrics`)

| KPI | สูตร | หน่วย / หมายเหตุ |
|---|---|---|
| `total_wo_created` | `COUNT(repair.created_at ∈ range)` | ใบงานที่สร้างในช่วง (ตามตัวกรอง/scope) |
| `wo_completed_in_range` | `COUNT(completed_at ∈ range AND status ∈ closed/verified/done/completed/resolved)` | นับเฉพาะปิดจริง ไม่นับยกเลิก |
| `wo_completion_rate` | `completed / created × 100` | % (null ถ้า created = 0) |
| `breakdown_count` | `COUNT(source_type='breakdown' AND created_at ∈ range)` | ใบงานฉุกเฉิน |
| `breakdown_rate` | `breakdown / created × 100` | % |
| `mttr_hours` | `AVG(repair_time_minutes)/60` เฉพาะงานที่ปิด/มี `completed_at` และค่า > 0 | ชั่วโมง; ถ้าไม่มี range = 30 วันล่าสุด |
| `mtbf_hours` | ค่าเฉลี่ยช่วงห่าง (ชั่วโมง) ระหว่างรอบซ่อม breakdown ของเครื่องเดียวกัน (ตาม `completed_at`, 180 วัน) | **คนละนิยามกับ `ana_reliability`** — ดู §12 |
| `avg_response_minutes` | `AVG(response_time_minutes)>0` | นาที (null ถ้าไม่มีข้อมูล) |
| `sla_compliance_pct` | ปิดทันกำหนด / ปิดงานที่มีกำหนด × 100; due = `COALESCE(sla_due_at, estimated_completion_date, planned_end_at)` | % |
| `pm_compliance_pct` | จาก view `v_inspection_dashboard_kpis` | **แหล่ง inspection** — ต่างจาก `ana_pm_compliance` (ดู §12) |
| `downtime_minutes` | `SUM(repair.downtime_minutes)` | นาที |
| `critical_asset_downtime_minutes` | `SUM(downtime_minutes)` เฉพาะเครื่อง `criticality='A'` | นาที |
| `cost_labor` / `cost_parts_field` / `cost_outsource` | `SUM(cost_labor/parts/outsource)` | บาท |
| `cost_total` | labor + parts + outsource | บาท |
| `material_cost` | `SUM(repair_spare_parts.quantity_used × unit_price)` | บาท (snapshot วัสดุ) |
| `open_wo` | `COUNT(status ∉ cancelled/rejected/draft/done/skipped/closed/verified)` | ยอดค้างปัจจุบัน |
| `overdue_wo` | `COUNT(kpi_is_overdue)` ของงาน backlog | ยอดค้างเกินกำหนด |
| `counts.*` | ตัวนับแยกสถานะ (requests_open, pending_approval, unassigned, assigned, active, pending_verification, verified, critical_active, completed_today, waiting_parts, waiting_external, overdue) | ยอดปัจจุบัน (ไม่ผูก range) |

---

## 3. Reliability — MTBF / MTTR / Availability (`ana_reliability`)

**แหล่งข้อมูล:** ตาราง `mtbf_mttr` (ผลรวมรายเดือนต่อเครื่อง: operating hours, failures, downtime)
กรองปี/เดือนด้วย `ana_mtbf_range_sql()` โดยเทียบ `DATE(CONCAT(year,'-',LPAD(month,2,'0'),'-01'))`

| KPI | สูตร | หน่วย |
|---|---|---|
| `mtbf_hours` | `SUM(operating_hours) / SUM(total_failures)` | ชั่วโมง |
| `mttr_minutes` | `SUM(total_downtime_minutes) / SUM(total_failures)` | นาที |
| `availability_pct` | `100 × op_hours / (op_hours + downtime_minutes/60)` | % |
| `operating_hours` / `downtime_minutes` / `failures` | ผลรวมตรงจากตาราง | ชม. / นาที / ครั้ง |
| `assets_covered` | `COUNT(DISTINCT asset_id)` ใน `mtbf_mttr` | เครื่อง |
| `months` | รายเดือน `{ym, failures, op_hours, dt, mtbf, mttr, availability, assets_covered}` | — |
| `coverage_label` | "ข้อมูลถึง YYYY-MM" จากเดือนล่าสุด | — |

- `mtbf_hours` เป็น null ถ้า failures = 0 หรือ op_hours = 0 ; `mttr_minutes` เป็น null ถ้า failures = 0
- ถ้าทั้ง failures = 0 และไม่มี op/downtime → `insufficient = true` (แสดง INSUFFICIENT DATA)
- `source = 'mtbf_mttr'` ระบุที่มาชัดเจนทุกครั้ง

---

## 4. สถานะเครื่องรายตัว — Explainable Asset Health (`ana_asset_health`)

**แหล่งข้อมูล:** `asset_registry` + สัญญาณจาก `repair`, `mtbf_mttr`, `pm_am`, `inspection_schedules`

**การให้คะแนน** เริ่มที่ `score = 100` แล้วหักตามสัญญาณจริง (อธิบายได้เป็นรายข้อใน `reasons`):

| เงื่อนไข | หัก |
|---|---|
| breakdown 3 ครั้ง / 90 วัน | −25 |
| breakdown 2 ครั้ง / 90 วัน | −12 |
| breakdown 1 ครั้ง / 90 วัน | −6 |
| breakdown รวม 180 วัน (เมื่อ 90 วัน = 0): ≥5 / ≥3 / ≥2 | −18 / −10 / −5 |
| downtime 180 วัน (ใช้ค่าสูงสุดระหว่าง repair กับ mtbf_mttr): ≥1440 / ≥720 / ≥120 นาที | −25 / −18 / −8 |
| ใบงานค้างเกินกำหนด (ต่อใบ) | −15 (สูงสุด −30) |
| เสียซ้ำใน 90 วัน (≥2 ครั้ง) | −10 |
| PM ค้างกำหนด | −10 |
| Inspection ไม่ผ่าน 180 วัน | −12 |

**ชั้นสถานะ (health class):**

| score | health |
|---|---|
| ≥ 80 | `HEALTHY` |
| 60–79 | `WATCH` |
| 40–59 | `ATTENTION` |
| < 40 | `CRITICAL` |
| ไม่มีข้อมูลเลย (ไม่มีงานซ่อม/PM/inspection) | `INSUFFICIENT_DATA` (score = null) |

`summary.by_health` เรียง CRITICAL → ATTENTION → WATCH → HEALTHY → INSUFFICIENT_DATA
พร้อม `method_note` ระบุชัดว่าเป็น **การประเมินจากอดีต ไม่ใช่การพยากรณ์**

---

## 5. การเสียซ้ำ (`ana_repeat_failures`)

| KPI | สูตร |
|---|---|
| `assets[]` | จัดกลุ่ม `repair` ตามเครื่องในช่วงที่เลือก โดย `HAVING COUNT(*) > 1` (สูงสุด 200) |
| `cnt` | จำนวนใบงานทั้งหมดของเครื่องนั้นในช่วง |
| `breakdown_cnt` | จำนวนที่เป็น `source_type='breakdown'` |
| `dt_min` | `SUM(downtime_minutes)` |
| `avg_gap_hours` | ค่าเฉลี่ยช่องว่างระหว่างใบงาน (ชม.) = `avg(t[i]−t[i−1])/3600` |
| `min_gap_hours` | ช่องว่างที่สั้นที่สุด (ชม.) |
| `total_repeat_assets` | จำนวนเครื่องที่เข้าเงื่อนไข |
| `detail[]` | เมื่อระบุ `asset_id` — รายการใบงานจริง (สูงสุด 300) สำหรับ drill-down |

> **ข้อสังเกต:** ยอด `repeat_total` ในภาพรวม (`kpi_failure.total_breakdown`) นับเฉพาะ breakdown
> และอาจต่างจาก `ana_repeat_failures` ที่นับทุก `source_type` ในกลุ่ม (ดู §12.4)

---

## 6. Downtime Pareto (`ana_downtime_pareto`)

**แหล่งข้อมูล:** `mtbf_mttr` (รายเดือนต่อเครื่อง — แหล่ง downtime หลักที่บันทึกจริง)

| KPI | สูตร |
|---|---|
| `rows[].downtime_minutes` | `SUM(total_downtime_minutes)` ต่อเครื่อง (เฉพาะ `> 0`) |
| `rows[].failures` | `SUM(total_failures)` |
| `rows[].pct` | `downtime / total_downtime × 100` |
| `rows[].cumulative_pct` | ผลสะสมของ `pct` (เรียงจากมากไปน้อย) |
| `total_downtime_minutes` | ผลรวม downtime ทั้งหมดในช่วง |

---

## 7. คิวงาน & อายุงานค้าง — Priority / Aging (`ana_priority_analysis`)

พิจารณาเฉพาะงาน **active** ในช่วงที่เลือก (`kpi_active_statuses`)

| KPI | สูตร |
|---|---|
| `summary.total_active` | จำนวนงาน active ทั้งหมด |
| `summary.total_overdue` | จำนวนที่ `kpi_is_overdue` |
| `summary.overdue_pct` | overdue / active × 100 |
| `by_priority[p].active` | จำนวนงานตาม priority (`critical/high/medium/low`) |
| `by_priority[p].overdue` | จำนวนที่เกินกำหนดตาม priority |
| `by_priority[p].avg_age_days` | `AVG(TIMESTAMPDIFF(DAY, created_at, NOW()))` |
| `by_priority[p].max_age_days` | อายุสูงสุด (วัน) |
| `aging.0_7 / 7_14 / 14_30 / 30_plus` | จำนวนงานแบ่งตามอายุ (วัน) |
| `queue[]` | รายการงาน (สูงสุด 200) พร้อม `age_days`, `overdue`, `needs_at` |

---

## 8. PM Compliance (`ana_pm_compliance`)

**แหล่งข้อมูล:** `pm_am` (join `pm_am_plans`, `asset_registry`)

| KPI | สูตร |
|---|---|
| `summary.done` | PM ที่ `completed_at ∈ range` และ `status ∈ (completed, closed)` |
| `summary.on_time` | งานที่ `DATE(completed_at) ≤ due_date` |
| `summary.late` | done − on_time |
| `summary.compliance_pct` | `on_time / done × 100` (null ถ้า done = 0) |
| `summary.overdue_active` | งาน `pending/in_progress/overdue` ที่ `due_date < CURDATE()` |
| `list[]` | รายละเอียด PM ที่เสร็จ (on_time, is_outsource, cost_outsource, plan) |
| `overdue_active[]` | งาน PM ค้างกำหนด (สูงสุด 200) |

scope: role 3 (Technician) เห็นเฉพาะ PM ที่ `assigned_to` ตัวเอง

---

## 9. งานวางแผน vs งานฉุกเฉิน (`ana_planned_unplanned`)

**แหล่งข้อมูล:** `repair.source_type`

| KPI | สูตร |
|---|---|
| `planned_pm` | `COUNT(source_type='pm')` |
| `unplanned_breakdown` | `COUNT(source_type='breakdown')` |
| `other` | total − pm − breakdown (เช่น `modify`, `build`) |
| `planned_pct` | planned / total × 100 |
| `unplanned_pct` | unplanned / total × 100 |

---

## 10. ภาระงานช่าง (`ana_technician_analytics`)

**แหล่งข้อมูล:** `repair` join `users` (group by ช่าง)

| KPI | ความหมาย |
|---|---|
| `total` | ใบงานทั้งหมดที่มอบหมายให้ช่าง (ในช่วง) |
| `open_cnt` | สถานะตั้งต้น (`open/acknowledged/assigned/accepted`) |
| `active_cnt` | กำลังดำเนินการ (`in_progress/paused/waiting_*`) |
| `active_high_cnt` | active ที่ priority `critical/high` |
| `done_cnt` | ปิดงานแล้ว |
| `critical_cnt` | งาน priority critical |
| `avg_repair_min` | `AVG(repair_time_minutes)>0` |
| `downtime_minutes` | `SUM(downtime_minutes)` |
| `overdue_sla_cnt` | งานตั้งต้นที่ `sla_due_at < NOW()` |
| `overlap_active_high` | true เมื่อ `active_cnt ≥ 2` และ `active_high_cnt ≥ 2` (สัญญาณ overload) |
| `totals.overlap_techs` | จำนวนช่างที่เข้าเงื่อนไข overload |

> เป็นการวัด **ภาระงาน** ไม่ใช่การจัดอันดับฝีมือ

---

## 11. สต็อก/อะไหล่ · ต้นทุน · คุณภาพข้อมูล

### 11.1 Spare (`ana_spare_analytics`) — แหล่งสต็อกคือ Sage 300 (`spare_parts`)
| KPI | สูตร |
|---|---|
| `items` | จำนวนรหัสอะไหล่ทั้งหมด |
| `stock_qty` | `SUM(stock_qty)` |
| `stock_value` | `SUM(stock_qty × unit_price)` |
| `low_stock` | `stock_qty > 0 AND stock_qty ≤ min_stock` |
| `out_of_stock` | `stock_qty ≤ 0 AND min_stock > 0` |
| `high_value_items` | `stock_qty × unit_price ≥ 50,000` |
| `last_synced` | `MAX(updated_at)` (เวลาซิงก์ล่าสุดจาก Sage) |
| `usage.*` | จำนวนแถว `repair_spare_parts`/`pm_am_spare_parts` และ `SUM(qty_issued)` |

### 11.2 Cost (`ana_cost_analytics` = `kpi_cost` + coverage)
`labor + parts + outsource = total` ; `material_cost` จาก `repair_spare_parts`
`coverage.with_cost_gt_0` = จำนวนใบงานที่มีต้นทุน > 0 อย่างน้อย 1 ชุด
ถ้า `= 0` → `insufficient = true` (แสดง INSUFFICIENT DATA ไม่ใช่ 0 บาท)

### 11.3 Data quality (`ana_data_quality`)
นับ **อัตราการกรอกข้อมูล** (filled/total, %) ของฟิลด์สำคัญในใบงาน:
`downtime_minutes`, `repair_time_minutes`, `response_time_minutes`, ต้นทุน, `failure_code_id`,
`rca_category`, `planned_start_at` — ฟิลด์ใดกรอก < **50%** จะถูกยกเป็น warning

---

## 12. นิยามที่ซ้ำ/ต่างกัน (ข้อควรระวัง — ต้องอธิบายเมื่อรายงาน)

### 12.1 MTBF / MTTR มี 2 นิยาม (ทั้งคู่ถูกต้องตามบริบท)
| ที่มา | MTBF | MTTR | ฐาน |
|---|---|---|---|
| `kpi_core_metrics` (Phase 15) | ค่าเฉลี่ย **ช่วงห่างระหว่างรอบซ่อม** breakdown (180 วัน) | `AVG(repair_time_minutes)/60` | ใบงาน (`repair`) |
| `ana_reliability` (Phase 23) | **operating_hours ÷ failures** | **downtime ÷ failures** | ตาราง `mtbf_mttr` |

หน้า Intelligence ใช้ `ana_reliability` เป็นตัวเลขผู้บริหาร (ระบุ label "จาก operating hours จริง")
และแสดง `core` คู่กันโดยติดป้ายที่มา — ตัวอย่างจริงปี 2026: `core.mtbf=203.98 ชม.` / `core.mttr=163.94 ชม.`
เทียบกับ `reliability.mtbf=195.4 ชม.` / `reliability.mttr=141.4 นาที`

### 12.2 PM compliance มี 2 แหล่ง
`kpi_core_metrics.pm_compliance_pct` มาจาก view **inspection** (`v_inspection_dashboard_kpis`)
ส่วน `ana_pm_compliance.compliance_pct` วัด **PM on-time จากตาราง `pm_am`** โดยตรง → ค่าอาจต่างกัน
(ตัวอย่างจริงปี 2026: 77.8% vs 33.3%)

### 12.3 Downtime มี 2 แหล่ง
`repair.downtime_minutes` (กรอกน้อยมาก — 1/102 ใบ) เทียบกับ `mtbf_mttr.total_downtime_minutes`
(บันทึกรายเดือนจริงกว่า) Pareto และ Reliability จึงใช้ `mtbf_mttr` เป็นหลัก และระบุที่มาเสมอ

### 12.4 จำนวนเครื่องที่เสียซ้ำ
`overview.repeat_assets` (จาก `kpi_failure`, เฉพาะ breakdown) อาจไม่เท่ากับ
`ana_repeat_failures.total_repeat_assets` (นับทุก source_type) — ใช้ค่าตามบริบทและระบุคำนิยาม

### 12.5 Response time / SLA / ต้นทุน
ฟิลด์ `response_time_minutes`, ต้นทุน และ `failure_code_id` ยังกรอกน้อย/เป็น 0
ตีความได้เฉพาะเมื่อ coverage เพียงพอ มิฉะนั้นจะติดป้าย INSUFFICIENT DATA
