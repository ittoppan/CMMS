# KPI Inventory — Dashboard Modules (CMMS-TPT)

เอกสารนี้เป็น **รายการสินค้า (inventory) ของ KPI ทุกตัวที่ใช้ใน Dashboard modules**
ตาม master spec §6 — ทุก KPI ต้องมี **สูตร (formula)**, **แหล่งข้อมูล (source table/fields)**,
**กลยุทธ์การรีเฟรช (refresh strategy)** และ **กฎการตรวจสอบ (validation rules)** ครบถ้วน

> หลักการ: ตัวเลขทั้งหมดมาจากข้อมูลจริง (ไม่มี mock/prediction) — สูตรคำนวณอยู่ฝั่ง server
> (`src/helpers/kpi.php`, `src/helpers/analytics.php`) เท่านั้น; หน้าจอแสดงผล/กรองเท่านั้น
> นิยามเชิงลึกของ KPI การวิเคราะห์ดูที่ `docs/KPI_DEFINITIONS.md` (Phase 23)
> รายการ dashboard modules ดูที่ `docs/DASHBOARD_BUILD.md` + `frontend/lib/dashboard-registry.ts`

---

## 0. ข้อตกลงร่วม (Conventions)

### 0.1 ช่วงเวลา (range)
`kpi_parse_range()` → `[start, end]` (รวมวันสุดท้าย 23:59:59). ค่าที่รองรับ: `today, yesterday, this_week, last_week, this_month, last_month, this_quarter, last_quarter, this_year, last_year, custom (range_start+range_end), (ว่าง = ทุกช่วงเวลา)`.

### 0.2 ตัวกรอง (filters)
`kpi_filters()` ทำงานบน alias `r` (ตาราง `repair`): `department_id, location_id, asset_id, asset_category (EXISTS asset_registry), technician_id (assigned_to / work_assignees), source_type, priority, status`. ตัวกรอง `search` / `asset_category` ของ asset health ใช้ `ana_asset_filters()` บน `asset_registry` โดยตรง.

### 0.3 ขอบเขตตามบทบาท (scope)
`kpi_scope()` — server-side: role 3 (Technician) เห็นเฉพาะงานที่ assigned ให้ตัวเอง; role 4 (Operator) เห็นเฉพาะงานที่ตัวเองแจ้ง; อื่น ๆ เห็นทั้งหมด. สิทธิ์ต้นทุน `kpi_can_see_cost()` = role 1,2,6 เท่านั้น (section `cost` ตอบ 403 กับ role อื่น).

### 0.4 กลุ่มสถานะ
- **active** (`kpi_active_statuses`): `open, acknowledged, draft, pending, pending_approval, approved, assigned, accepted, in_progress, paused, waiting_parts, pending_parts, waiting_external, waiting_approval, completed, pending_verification, resolved`
  > 2026-11-23: เพิ่ม `pending` (K5) — เดิมสถานะนี้ไม่อยู่ทั้ง active และ done ทำให้ 2 ใบไม่ถูกนับใน backlog/alerts/แผง SLA
- **critical ที่ยังเปิด** (`kpi_critical_statuses`): = `kpi_active_statuses()` ชุดเดียว ใช้ร่วมกับ `counts.critical_active` และ `alerts.critical_open` (K1)
- **done** (`kpi_done_statuses`): `closed, cancelled, rejected, verified, done, skipped`

### 0.5 งานค้างเกินกำหนด (overdue)
`kpi_is_overdue()` = จริงเมื่อสถานะยังไม่จบ และ (sla_due_at/estimated_completion_date/planned_end_at < now) หรือ (ยังอยู่สถานะตั้งต้น และเปิดมาเกิน 7 วัน).
> 2026-11-23: `planned_end_at` ถูกใช้จริงแล้ว (K9) — `kpi_core_metrics()` และ `kpi_overdue_rows()` ดึงคอลัมน์นี้มาคิดด้วย
> **"Overdue" (KPI) ≠ "เกิน SLA" (แผง SLA ตามระดับความสำคัญ):** KPI ใช้เกณฑ์ข้างบน (เลยกำหนด **หรือ** ค้างเกิน 7 วัน) ส่วนแผง SLA นับเฉพาะใบที่มีวันครบกำหนดและเลยกำหนดแล้ว — วันเดียวกันจึงได้ 74 กับ 1

### 0.6 หลัก INSUFFICIENT DATA
ตัวหาร/ข้อมูลต้นทางเป็น 0 → คืน `null` (ไม่ใช่ 0) → หน้าจอแสดง `—` / "INSUFFICIENT DATA" + ป้ายคุณภาพข้อมูล.

### 0.7 กลยุทธ์การรีเฟรช (Refresh strategies)
| รหัส | ความหมาย |
|---|---|
| `RT-60` | Real-time poll ทุก 60s (wallboard TV mode) |
| `ON-DEMAND` | ผู้ใช้กดรีเฟรชเอง |
| `PAGE-LOAD` | โหลดใหม่เมื่อเปิดหน้า |
| `DAILY-BATCH` | cron รายวัน (สรุปรายวัน/สต็อก) |
| `MANUAL` | นำเข้า/ซิงก์ด้วยมือ (Sage 300) |

### 0.8 กฎการตรวจสอบ (Validation rules) ร่วม
- V1: ตัวหาร = 0 → null (ไม่ใช่ 0)
- V2: scope ตาม role (server-side, ห้าม client-side only)
- V3: cost KPI ต้องผ่าน `kpi_can_see_cost()` (role 1,2,6)
- V4: range รวมวันสุดท้าย 23:59:59
- V5: ไม่มี mock/prediction — ทุกตัวเลขต้อง trace ได้ถึง source table
- V6: จำนวนทศนิยม/หน่วยต้องตรงกับนิยาม (ชม./นาที/%/บาท)
- V7: KPI ที่ขึ้นกับ `mtbf_mttr` ใช้เดือน/ปีจาก `ana_mtbf_range_sql()`

---

## 1. กลุ่ม A — ภาพรวมและควบคุมงาน (Overview & Control)

### 1.1 Maintenance Overview (wallboard) — `/dashboard/wallboard`
**refresh:** RT-60 (TV) / ON-DEMAND (ปุ่มรีเฟรช) | **source API:** `/api/v1/dashboard.php` (overview/trend/downtime/wo/pm), `/api/v1/mtbf_mttr.php`, `/api/v1/asset_stats.php?resource=plant_map`, `/api/v1/spare_optimization.php?action=availability&needs_reorder=1`

| KPI | สูตร | Source table/fields | Validation |
|---|---|---|---|
| Total Work Orders | `COUNT(repair.created_at ∈ range)` (filtered+scoped) | `repair.created_at, repair.status` | V1,V2,V4 |
| Completed | `COUNT(completed_at ∈ range AND status ∈ closed/verified/done/completed/resolved)` | `repair.completed_at, repair.status` | V1,V4 |
| Completion rate | `completed / created × 100` | derived | V1 (null if created=0) |
| In Progress (active) | `COUNT(status ∈ active)` | `repair.status` | V2 |
| Overdue | `COUNT(kpi_is_overdue)` ของ backlog | `repair.sla_due_at/estimated_completion_date/planned_end_at, repair.status, repair.created_at` | V5 (overdue def) |
| MTTR | `AVG(repair_time_minutes)/60` (เฉพาะงานปิด/มี completed_at, >0) | `repair.repair_time_minutes, repair.completed_at` | V1 (30 วันล่าสุดถ้าไม่มี range) — **ไม่มี fallback** `TIMESTAMPDIFF(actual_start→completed)` แล้ว (K10) |
| MTBF | ค่าเฉลี่ยช่วงห่าง (ชม.) ระหว่างรอบซ่อม breakdown ของเครื่องเดียวกัน (180 วัน) | `repair.completed_at, repair.source_type` | ดู KPI_DEFINITIONS §12.1 (คนละนิยามกับ ana_reliability) |
| Downtime hours | `SUM(repair.downtime_minutes)/60` | `repair.downtime_minutes` | V1 (กรอกน้อย — ดู §12.3) |
| SLA at risk | งานที่ due < now + risk window | `repair.sla_due_at/estimated_completion_date` | — |
| Critical open | `COUNT(priority=critical AND status ∈ kpi_critical_statuses())` | `repair.priority, repair.status` | ฟังก์ชันเดียวกับ `counts.critical_active` (K1) |

> per-tile `Na` แสดงเมื่อข้อมูลไม่พร้อม; full-page LoadingState/ErrorState ใช้เมื่อ first load ไม่มี overview (Phase 4b).

### 1.2 Work Order Control — `/supervisor`
**refresh:** PAGE-LOAD / ON-DEMAND | **source:** `repair` (kpi_filters + scope)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| คิวงานตามสถานะ | `COUNT(*) GROUP BY status` | `repair.status` | V2 |
| งานค้างเกินกำหนด | `kpi_is_overdue` count | `repair.*` (ตาม §0.5) | — |
| งานที่ยังไม่มอบหมาย | `COUNT(assigned_to IS NULL AND status active)` | `repair.assigned_to` | — |
| งานรอตรวจรับ | `COUNT(status=pending_verification)` | `repair.status` | — |
| งานเสร็จแล้วรอตรวจรับ (การ์ด "Completed") | `COUNT(status ∈ completed/pending_verification/resolved)` = `counts.pending_verification` | `repair.status` | การ์ดเดิมใช้ `counts.verified` (closed+verified) = 0 ทั้งที่มีงานเสร็จ 6 ใบ (K6) |

### 1.3 Backlog & Aging — `/dashboard/backlog-aging`
**refresh:** PAGE-LOAD | **source:** `repair` active + `kpi_is_overdue`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Total active | `COUNT(active)` | `repair.status` | V2 |
| Total overdue | `COUNT(kpi_is_overdue)` | `repair.*` | — |
| Overdue % | `overdue / active × 100` | derived | V1 |
| Aging buckets (0-7/7-14/14-30/30+) | `COUNT(age_days ∈ bucket)` | `repair.created_at` | — |
| By priority active/overdue/avg_age/max_age | group by `priority` | `repair.priority, repair.created_at` | — |
| Queue list (≤200) | active rows + `age_days, overdue, needs_at` | `repair.*` | — |

### 1.4 SLA & Escalation Control — `/reports/sla`
**refresh:** PAGE-LOAD | **source:** `repair` (sla_due_at/estimated_completion_date/planned_end_at)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| SLA compliance % | `ปิดทันกำหนด / ปิดงานที่มีกำหนด × 100` (due = COALESCE(sla_due_at, estimated_completion_date, planned_end_at)) | `repair.sla_due_at, estimated_completion_date, planned_end_at, completed_at` | V1 |
| SLA at risk count | งาน active ที่ due < now + risk window | `repair.sla_due_at` | — |
| Escalation count | งานที่ trigger escalation | `repair.*` | — |

### 1.5 Shift Handover — `/dashboard/shift-handover`
**refresh:** PAGE-LOAD / ON-DEMAND | **source:** `shift_handovers` + `repair` active
> 2026-11-23: แก้ชื่อตารางจาก `shift_handover` → **`shift_handovers`** (พหูพจน์) ตามสคีมาจริง (`public/api/v1/shift_handover.php` ใช้ชื่อนี้) — ตารางมีอยู่แต่ **0 แถว**

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| งานค้างส่งต่อ | `COUNT(repair active AND assigned_to ∈ shift)` | `repair.*` | V2 |
| เหตุการณ์กะ | นับจาก `shift_handovers.events` | `shift_handovers.*` | — |
| เครื่องที่ต้องจับตา | รายการจาก `shift_handovers.watch_assets` | `shift_handovers.*` | — |

---

## 2. กลุ่ม B — ปฏิบัติการซ่อมบำรุง (Maintenance Operations)

### 2.1 PM Compliance & Planned vs Unplanned — `/dashboard/pm-compliance`
**refresh:** PAGE-LOAD | **source:** `pm_am` (+ plans, asset_registry) + `repair.source_type`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| PM ถึงกำหนด (due_total) | `COUNT(status ∈ pending/in_progress/completed/overdue AND due_date ∈ range)` | `pm_am.status, pm_am.due_date` | V1,V4 — ตัวหาร 0 → `completion_rate = null` (เดิมนับทั้งตาราง: K2) |
| PM done (in range) | `COUNT(pm_am completed_at ∈ range AND status ∈ completed/closed)` | `pm_am.completed_at, pm_am.status` | V4 |
| PM on-time | `COUNT(DATE(completed_at) ≤ due_date)` | `pm_am.completed_at, pm_am.due_date` | นับเฉพาะใบที่มี `completed_at`; ใบปิดที่ไม่ลงวันที่ปิดงาน → `unrecorded` (ไม่นับเป็น late) |
| PM compliance % (on-time) | `on_time / (on_time + late) × 100` | derived | V1 — null เมื่อยังไม่มีใบที่ตัดสินได้ |
| PM overdue active | `COUNT(status pending/in_progress/overdue AND due_date < CURDATE())` | `pm_am.status, pm_am.due_date` | — |
| Planned % (pm) | `COUNT(source_type='pm') / total × 100` | `repair.source_type` | — |
| Unplanned % (breakdown) | `COUNT(source_type='breakdown') / total × 100` | `repair.source_type` | — |
| Other % | `total − pm − breakdown` | derived | — |

> หมายเหตุ: `kpi_core_metrics.pm_compliance_pct` มาจาก view inspection (`v_inspection_dashboard_kpis`) — คนละแหล่งกับ `ana_pm_compliance` (ดู KPI_DEFINITIONS §12.2).

### 2.2 Breakdown & Downtime — `/reports/downtime`
**refresh:** PAGE-LOAD | **source:** `mtbf_mttr` (Pareto) + `repair`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Downtime Pareto rows | `SUM(total_downtime_minutes)` ต่อเครื่อง (>0) | `mtbf_mttr.total_downtime_minutes, mtbf_mttr.asset_id` | V7 |
| % ต่อเครื่อง | `downtime / total_downtime × 100` | derived | V1 |
| Cumulative % | ผลสะสมของ % (เรียงจากมากไปน้อย) | derived | — |
| Total downtime | ผลรวม downtime ทั้งหมดในช่วง | `mtbf_mttr.*` | V7 |
| Repeat failures (assets) | `GROUP BY asset HAVING COUNT(*)>1` (≤200) | `repair.*` | — |

### 2.3 Maintenance Calendar / Planning — `/planning/calendar`, `/planning`
**refresh:** PAGE-LOAD | **source:** `pm_am`, `repair`, `inspection_schedules`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| งานตามวัน | `COUNT(*) GROUP BY scheduled_date` | `pm_am.due_date / repair.planned_start_at` | — |
| งานค้างกำหนด | `COUNT(due_date < CURDATE() AND status active)` | `pm_am.*` | — |

### 2.4 Inspection & Condition Monitoring — `/iot/condition`
**refresh:** PAGE-LOAD | **source:** `inspection_schedules`, `inspection_results`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| รอบตรวจที่เสร็จ | `COUNT(status=completed)` | `inspection_results.status` | — |
| รอบตรวจที่ไม่ผ่าน | `COUNT(result=fail)` | `inspection_results.result` | — |
| ความถี่ตามเครื่อง | group by `asset_id` | `inspection_schedules.asset_id` | — |

### 2.5 Shutdown & Turnaround — `/shutdown`
**refresh:** PAGE-LOAD | **source:** `sd_shutdowns`, `sd_activity`, `repair`
> 2026-11-23: ไม่มีตาราง `shutdown_plans` ในสคีมานี้ — ของจริงคือตระกูล `sd_*` (`sd_shutdowns`, `sd_activity`, `sd_scopes`, `sd_planned_parts`, …) ทั้ง 9 ตาราง **0 แถว**; `public/api/v1/shutdown.php` อ่าน `sd_activity` + master data (`asset_registry`, `departments`, `users`, `spare_parts`, `work_permits`)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| ชั่วโมงหยุดเครื่อง | `SUM(downtime_minutes)/60` (ในช่วง shutdown) | `repair.downtime_minutes` | — |
| งานที่เสร็จ/ค้างใน shutdown | `COUNT(*) GROUP BY status` | `repair.status` | — |

---

## 3. กลุ่ม C — ความน่าเชื่อถือและวิศวกรรม (Reliability & Engineering)

### 3.1 Equipment Health — `/asset-reliability`
**refresh:** PAGE-LOAD | **source:** `asset_registry` + `repair`, `mtbf_mttr`, `pm_am`, `inspection_schedules` (`ana_asset_health`)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Health score | เริ่ม 100 แล้วหักตามสัญญาณ (breakdown/downtime/overdue/PM/inspection) | `asset_registry` + signals | ดู KPI_DEFINITIONS §4 (score thresholds) |
| Health class | HEALTHY(≥80)/WATCH(60-79)/ATTENTION(40-59)/CRITICAL(<40)/INSUFFICIENT_DATA | derived | V1 (null เมื่อไม่มีข้อมูลเลย) |
| Summary by health | count group by health class | derived | — |
| Assets covered | `COUNT(DISTINCT asset_id)` | `mtbf_mttr` / `repair` | — |

### 3.2 Reliability Engineering — `/reliability`
**refresh:** PAGE-LOAD | **source:** `mtbf_mttr` (`ana_reliability`) + `repair`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| MTBF (hours) | `SUM(operating_hours) / SUM(total_failures)` | `mtbf_mttr.operating_hours, total_failures` | V1 (null if failures=0/op_hours=0) |
| MTTR (minutes) | `SUM(total_downtime_minutes) / SUM(total_failures)` | `mtbf_mttr.total_downtime_minutes, total_failures` | V1 |
| Availability % | `100 × op_hours / (op_hours + downtime_minutes/60)` | `mtbf_mttr.*` | V1 |
| Operating hours / downtime / failures | ผลรวมตรงจากตาราง | `mtbf_mttr.*` | V7 |
| Months series | รายเดือน {ym, failures, op_hours, dt, mtbf, mttr, availability, assets_covered} | `mtbf_mttr.*` | V7 |
| Coverage label | "ข้อมูลถึง YYYY-MM" จากเดือนล่าสุด | `mtbf_mttr.year/month` | — |
| Insufficient flag | true เมื่อ failures=0 และไม่มี op/downtime | derived | — |

> คนละนิยามกับ `kpi_core_metrics` MTBF/MTTR (ดู KPI_DEFINITIONS §12.1).

### 3.3 Top 10 / Bad Actors — `/reliability/bad-actors`
**refresh:** PAGE-LOAD | **source:** `mtbf_mttr` + `repair`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Top N by downtime | เรียง `SUM(total_downtime_minutes)` DESC (≤10) | `mtbf_mttr.*` | V7 |
| Top N by failures | เรียง `SUM(total_failures)` DESC | `mtbf_mttr.*` | V7 |
| Repeat count | จำนวน breakdown ต่อเครื่อง | `repair.source_type='breakdown'` | — |

### 3.4 Calibration Management — `/calibration/dashboard`
**refresh:** PAGE-LOAD | **source:** `calibration`, `calibration_instruments`, `asset_registry`
> 2026-11-23: ไม่มีตาราง `calibration_records` — ของจริงคือ `calibration` (`public/api/v1/calibration.php:23`) พร้อมตระกูล `calibration_*` อีก 9 ตาราง ทั้งหมด **0 แถว**

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| สอบเทียบที่ครบกำหนด | `COUNT(status=completed AND completed_at ∈ range)` | `calibration.*` | V4 |
| สอบเทียบที่ค้างกำหนด | `COUNT(due_date < CURDATE() AND status≠completed)` | `calibration.due_date` | — |
| Compliance % | `completed / total × 100` | derived | V1 |

### 3.5 Root Cause Analysis — `/rca`
**refresh:** PAGE-LOAD | **source:** `repair` (failure_code_id, rca_category)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| RCA coverage % | `COUNT(rca_category IS NOT NULL) / total × 100` | `repair.rca_category` | V1 |
| Top failure codes | `GROUP BY failure_code_id ORDER BY count DESC` | `repair.failure_code_id` | — |
| Pareto by cause | cumulative % ของ count ต่อสาเหตุ | derived | — |

### 3.6 Asset Lifecycle & Warranty — `/asset-reliability/lifecycle`
**refresh:** PAGE-LOAD | **source:** `asset_registry` (purchase_date, warranty_end, useful_life)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Assets under warranty | `COUNT(warranty_end ≥ CURDATE())` | `asset_registry.warranty_end` | — |
| Warranty expiring (≤90d) | `COUNT(warranty_end BETWEEN CURDATE() AND +90d)` | `asset_registry.warranty_end` | — |
| Avg asset age | `AVG(YEAR(NOW())-YEAR(purchase_date))` | `asset_registry.purchase_date` | — |
| Lifecycle stage distribution | group by computed stage | `asset_registry.*` | — |

---

## 4. กลุ่ม D — ทรัพยากรและต้นทุน (Resources & Cost)

### 4.1 Spare Parts & Inventory — `/spare_parts/overview`
**refresh:** DAILY-BATCH / MANUAL (Sage 300 sync) | **source:** `spare_parts` (Sage 300)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Items (รหัสอะไหล่) | `COUNT(*)` | `spare_parts` | — |
| Stock qty | `SUM(stock_qty)` | `spare_parts.stock_qty` | — |
| Stock value | `SUM(stock_qty × unit_price)` | `spare_parts.stock_qty, unit_price` | V3 |
| Low stock | `stock_qty > 0 AND stock_qty ≤ min_stock` count | `spare_parts.stock_qty, min_stock` | — |
| Out of stock | `stock_qty ≤ 0 AND min_stock > 0` count | `spare_parts.*` | — |
| High value items | `stock_qty × unit_price ≥ 50,000` count | `spare_parts.*` | — |
| Last synced | `MAX(updated_at)` | `spare_parts.updated_at` | — |
| Usage count/qty | rows `repair_spare_parts`/`pm_am_spare_parts`, `SUM(qty_issued)` | `repair_spare_parts, pm_am_spare_parts` | — |

### 4.2 Maintenance Cost — `/cost`
**refresh:** PAGE-LOAD | **source:** `repair` (cost_labor/parts/outsource) + `repair_spare_parts` | **cost visibility:** V3

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Cost labor/parts/outsource | `SUM(cost_labor/parts/outsource)` | `repair.cost_labor, cost_parts, cost_outsource` | V3 |
| Cost total | `labor + parts + outsource` | derived | V3 |
| Material cost | `SUM(repair_spare_parts.quantity_used × unit_price)` | `repair_spare_parts.*` | V3 |
| Coverage (with_cost_gt_0) | จำนวนใบงานที่มีต้นทุน > 0 อย่างน้อย 1 ชุด | `repair.*` | ถ้า =0 → insufficient=true |
| Cost per WO | `cost_total / completed_wo` | derived | V1,V3 |

### 4.3 Employee & Technician — `/workforce`
**refresh:** PAGE-LOAD | **source:** `repair` join `users` (`ana_technician_analytics`)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Total (assigned) | ใบงานทั้งหมดที่มอบหมาย (ในช่วง) | `repair.assigned_to` | V4 |
| open_cnt | สถานะตั้งต้น count | `repair.status` | — |
| active_cnt | กำลังดำเนินการ count | `repair.status` | — |
| active_high_cnt | active ที่ priority critical/high | `repair.priority, status` | — |
| done_cnt | ปิดงานแล้ว count | `repair.status` | — |
| critical_cnt | งาน priority critical | `repair.priority` | — |
| avg_repair_min | `AVG(repair_time_minutes)>0` | `repair.repair_time_minutes` | V1 |
| downtime_minutes | `SUM(downtime_minutes)` | `repair.downtime_minutes` | — |
| overdue_sla_cnt | งานตั้งต้นที่ `sla_due_at < NOW()` | `repair.sla_due_at, status` | — |
| overlap_active_high | true เมื่อ active_cnt≥2 AND active_high_cnt≥2 (overload) | derived | — |
| overlap_techs | จำนวนช่างที่เข้าเงื่อนไข overload | derived | — |

> เป็นการวัดภาระงาน ไม่ใช่การจัดอันดับฝีมือ.

### 4.4 Contractor & Vendor — `/contractors`
**refresh:** PAGE-LOAD | **source:** `contractors`, `repair` (outsource)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| งานภายนอก | `COUNT(source_type/outsource)` | `repair.*` | — |
| ต้นทุนภายนอก | `SUM(cost_outsource)` | `repair.cost_outsource` | V3 |
| ผู้รับเหมา active | `COUNT(status=active)` | `contractors.status` | — |

### 4.5 Procurement & Purchasing — `/spare_parts/sage_po`
**refresh:** MANUAL/DAILY-BATCH | **source:** `spare_parts` (+ `spare_issue_sage_shipments` สำหรับการรับเข้า)
> 2026-11-23: **ไม่มีตาราง `sage_po` ในสคีมานี้** และหน้า `/spare_parts/sage_po` ไม่ได้อ่าน PO — อ่าน/บันทึกรับเข้าผ่าน `/api/v1/spare_parts.php` (`spare_parts` = 1,870 แถว). KPI "PO count/value" และ "Pending PO" ในหัวข้อนี้ **ยังไม่มีแหล่งข้อมูลจริง** จึงยังไม่ถูก implement

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| PO count/value | ❌ ยังไม่มีแหล่งข้อมูล (ไม่มีตาราง `sage_po`) | — | ไม่ implement |
| Pending PO | ❌ ยังไม่มีแหล่งข้อมูล | — | ไม่ implement |
| รายการอะไหล่รอรับเข้า (ของจริงที่หน้านี้แสดง) | rows จาก `spare_parts.php` | `spare_parts.*` | — |

---

## 5. กลุ่ม E — ความปลอดภัย เอกสาร ระบบ (Safety, Docs & System)

### 5.1 Safety & Compliance — `/safety/work_permit`
**refresh:** PAGE-LOAD | **source:** `work_permits`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Permit count by status | `COUNT(*) GROUP BY status` | `work_permits.status` | — |
| Expiring permits | `COUNT(expiry_date ≤ +30d)` | `work_permits.expiry_date` | — |

### 5.2 Data Quality & System Adoption — `/dashboard/data-quality`
**refresh:** PAGE-LOAD | **source:** `repair` (coverage) + `users` (adoption)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Field fill rate | `filled/total × 100` per field (downtime_minutes, repair_time_minutes, response_time_minutes, cost, failure_code_id, rca_category, planned_start_at) | `repair.*` | field < 50% → warning |
| Inactive users | ผู้ใช้ที่ยังไม่ใช้ระบบ (ไม่มี activity ในช่วง) | `users`, `repair.created_by/assigned_to` | — |
| Overall completeness | average fill rate | derived | — |

### 5.3 Integration & System Health — `/settings/health`
**refresh:** PAGE-LOAD | **source:** system (DB, API, cron)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Health status | ok/warn/error per component | system checks | — |
| Last cron run | timestamp | `cron_log` | — |

---

## 6. กลุ่ม F — วางแผนระยะหน้า (Future Planning)

### 6.1 Production Impact & OEE — `/dashboard/production-impact`
**refresh:** PAGE-LOAD | **source:** `production_hours`, `repair`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Production hours | `SUM(production_hours)` | `production_hours.*` | — |
| Downtime impact | `SUM(downtime_minutes)` ที่กระทบการผลิต | `repair.downtime_minutes` | — |
| OEE (ถ้ามีข้อมูล) | Availability × Performance × Quality | derived | INSUFFICIENT DATA ถ้าไม่มีข้อมูลครบ |

### 6.2 Lubrication Management — `/dashboard/lubrication`
**refresh:** PAGE-LOAD | **source:** `lubrication_points`, `lubrication_logs`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| จุดหล่อลื่นทั้งหมด | `COUNT(*)` | `lubrication_points` | — |
| รอบที่เสร็จ/ค้าง | `COUNT(*) GROUP BY status` | `lubrication_logs.status` | — |
| Overdue points | `COUNT(next_due < CURDATE())` | `lubrication_points.next_due` | — |

### 6.3 Utility & Energy — `/dashboard/utility-energy`
**refresh:** PAGE-LOAD / DAILY-BATCH | **source:** `utility_readings`
> 2026-11-23: ไม่มีตาราง `utility_meters` — `public/api/v1/utility_energy.php` ใช้ `utility_readings` เดียว (0 แถว). ถ้าต้องผูกมิเตอร์กับเครื่องจักรให้ใช้ `asset_meters` / `asset_meter_readings` (0 แถวเช่นกัน)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| การใช้ไฟ/น้ำ/ลม/ก๊าซ | `SUM(consumption)` by type | `utility_readings.*` | — |
| แนวโน้ม | time series รายวัน/รายเดือน | `utility_readings.reading_date` | — |
| Cost (ถ้ามี rate) | `SUM(consumption × rate)` | derived | V3 |

### 6.4 Facility Management — `/dashboard/facility`
**refresh:** PAGE-LOAD | **source:** `asset_registry` (building/area), `repair`

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| Assets by area | `COUNT(*) GROUP BY area/building` | `asset_registry.area` | — |
| Work orders by facility | `COUNT(*) GROUP BY location` | `repair.location_id` | — |

### 6.5 Predictive & AI Maintenance — `/dashboard/predictive-ai`
**refresh:** PAGE-LOAD | **source:** `asset_registry` + `repair`/`mtbf_mttr` (threshold 30 วันข้อมูลขั้นต่ำ)

| KPI | สูตร | Source | Validation |
|---|---|---|---|
| แสดงผลเมื่อข้อมูลถึงเกณฑ์ขั้นต่ำเท่านั้น | min 30 วันข้อมูล | `repair/mtbf_mttr` | INSUFFICIENT DATA ถ้าไม่ถึงเกณฑ์ |
| Risk score | ตามโมเดล (อธิบายได้) | derived | ห้าม prediction ที่ไม่มีหลักฐาน |

---

## 7. Cross-cutting KPIs (ใช้ร่วมหลายモジュール)

| KPI | นิยาม | แหล่ง | หมายเหตุ |
|---|---|---|---|
| `total_wo_created` | COUNT ใบงานที่สร้างในช่วง | `repair.created_at` | ดู KPI_DEFINITIONS §2 |
| `wo_completed_in_range` | COUNT ปิดจริงในช่วง | `repair.completed_at/status` | — |
| `wo_completion_rate` | completed/created ×100 | derived | V1 |
| `breakdown_count` / `breakdown_rate` | source_type='breakdown' | `repair.source_type` | — |
| `open_wo` | ยอดค้างปัจจุบัน | `repair.status` | ไม่ผูก range |
| `overdue_wo` | ยอดค้างเกินกำหนด | `repair.*` | — |
| `counts.*` | ตัวนับแยกสถานะ (requests_open, pending_approval, unassigned, assigned, active, pending_verification, verified, critical_active, completed_today, waiting_parts, waiting_external, overdue) | `repair.status` | ยอดปัจจุบัน |
| `downtime_minutes` | SUM downtime | `repair.downtime_minutes` | กรอกน้อย — ดู §12.3 KPI_DEFINITIONS |
| `critical_asset_downtime_minutes` | SUM downtime เฉพาะ criticality='A' | `repair` + `asset_registry.criticality` | — |
| `avg_response_minutes` | AVG(response_time_minutes)>0 | `repair.response_time_minutes` | V1 |
| `sla_compliance_pct` | ปิดทันกำหนด/ปิดที่มีกำหนด ×100 | `repair.sla_due_at/...` | — |
| `pm_compliance_pct` | จาก view inspection | `v_inspection_dashboard_kpis` | คนละแหล่งกับ ana_pm_compliance |
| `cost_labor/parts/outsource/total` | SUM cost | `repair.cost_*` | V3 |
| `material_cost` | SUM(qty×unit_price) | `repair_spare_parts` | V3 |

---

## 8. Refresh Strategy Summary (สรุปตามโมดูล)

| โมดูล | Strategy | เหตุผล |
|---|---|---|
| Maintenance Overview (wallboard) | RT-60 + ON-DEMAND | จอใหญ่/TV ต้องสด |
| Work Order Control | PAGE-LOAD + ON-DEMAND | queue เปลี่ยนบ่อย |
| Backlog & Aging | PAGE-LOAD | คำนวณหนัก |
| SLA & Escalation | PAGE-LOAD | — |
| Shift Handover | PAGE-LOAD + ON-DEMAND | ส่งกะ |
| PM Compliance | PAGE-LOAD | — |
| Breakdown & Downtime | PAGE-LOAD | — |
| Equipment Health / Reliability | PAGE-LOAD | — |
| Spare Parts & Inventory | DAILY-BATCH + MANUAL | Sage 300 sync |
| Maintenance Cost | PAGE-LOAD | V3 |
| Data Quality | PAGE-LOAD | — |
| Utility & Energy | PAGE-LOAD + DAILY-BATCH | meter readings |
| Predictive & AI | PAGE-LOAD | min 30 วัน |

---

## 9. Validation Rules Summary (สรุป)

| รหัส | กฎ |
|---|---|
| V1 | ตัวหาร = 0 → null (INSUFFICIENT DATA) |
| V2 | scope ตาม role (server-side) |
| V3 | cost KPI เฉพาะ role 1,2,6 |
| V4 | range รวมวันสุดท้าย 23:59:59 |
| V5 | ไม่มี mock/prediction — trace ได้ถึง source table |
| V6 | หน่วย/ทศนิยมตรงนิยาม |
| V7 | KPI ที่ขึ้นกับ mtbf_mttr ใช้ ana_mtbf_range_sql() |

---

## 10. Cross-references

- `docs/KPI_DEFINITIONS.md` — นิยามเชิงลึก KPI การวิเคราะห์ (Phase 23) รวม §12 ข้อควรระวัง (MTBF/MTTR 2 นิยาม, PM compliance 2 แหล่ง, Downtime 2 แหล่ง)
- `docs/DASHBOARD_BUILD.md` — รายการ dashboard modules + สถานะ
- `docs/ANALYTICS_DATA_MODEL.md` — โครงสร้างข้อมูล analytics
- `frontend/lib/dashboard-registry.ts` — registry 36 รายการ
- `src/helpers/kpi.php`, `src/helpers/analytics.php` — แกนกลางสูตร (ห้ามคำนวณซ้ำใน client)

> เอกสารนี้เป็น inventory สำหรับ dashboard modules — เมื่อเพิ่ม/เปลี่ยน KPI ให้อัปเดตทั้งที่นี่และ `docs/KPI_DEFINITIONS.md` พร้อมกัน.
