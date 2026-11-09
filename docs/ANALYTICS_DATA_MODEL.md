# Analytics Data Model — CMMS-TOPPAN (Phase 23)

เอกสารนี้อธิบาย **โครงสร้างข้อมูลจริง** ที่ engine วิเคราะห์ (`src/helpers/analytics.php`)
และ API (`public/api/v1/intelligence.php`) ใช้ — ตาราง คอลัมน์ join grain และข้อจำกัด

---

## 1. ภาพรวมสถาปัตยกรรม

```
Next.js /analytics/intelligence
        │  (rewrites /api/*, /login.php)
        ▼
public/api/v1/intelligence.php   ← requireLogin + RBAC + envelope
        │
        ▼
src/helpers/analytics.php (ana_*)  ──reuse──▶  src/helpers/kpi.php (kpi_*)
        │                                              │
        └──────────────┬───────────────────────────────┘
                       ▼
                    MySQL (PDO, time_zone '+07:00')
```

- **ห้ามคำนวณ KPI ซ้ำฝั่ง client** — หน้าจอแสดงค่าที่ API ส่งมาเท่านั้น
- engine เดียวรองรับทั้ง dashboard เดิม (`dashboard.php`) และ intelligence (Phase 23)
  ผ่าน `kpi_filters` / `kpi_scope` / `kpi_parse_range` ชุดเดียวกัน

---

## 2. ตารางและคอลัมน์ที่ใช้

### 2.1 `repair` (alias `r`) — ใบงานซ่อม (แหล่งหลัก)
| คอลัมน์ | ใช้ทำอะไร |
|---|---|
| `id`, `work_order_no`, `title` | ระบุ/แสดงใบงาน |
| `status` | จัดกลุ่ม active/done, นับค้าง, overdue |
| `priority` | critical/high/medium/low (aging, workload) |
| `source_type` | `breakdown` / `pm` / `modify` / `build` (planned vs unplanned) |
| `asset_id` | ผูกเครื่อง (drill-down, health, pareto) |
| `assigned_to` | ภาระงานช่าง + scope role 3 |
| `created_by` | scope role 4 (Operator) |
| `department_id`, `location_id` | ตัวกรอง |
| `created_at` | ช่วงเวลา (range) ของ trend/analytics |
| `completed_at` | นับงานเสร็จ, MTTR ของ core, SLA |
| `sla_due_at`, `estimated_completion_date`, `planned_end_at` | กำหนดส่ง / overdue |
| `planned_start_at` | ตัวชี้วัดคุณภาพ (planned) |
| `downtime_minutes` | downtime, reliability ระดับใบงาน |
| `repair_time_minutes` | MTTR (core), เวลาซ่อมจริง |
| `response_time_minutes` | response time (ส่วนใหญ่ยังว่าง) |
| `cost_labor`, `cost_parts`, `cost_outsource` | ต้นทุน |
| `failure_code_id` | ผูก `failure_codes` (คุณภาพข้อมูล) |
| `rca_category` | RCA (คุณภาพข้อมูล) |

### 2.2 `mtbf_mttr` (alias `m`) — ผลผลิตรายเดือนต่อเครื่อง (**แหล่ง Reliability/Pareto หลัก**)
| คอลัมน์ | ความหมาย |
|---|---|
| `asset_id` | เครื่อง |
| `year`, `month` | งวด (ใช้สร้างวันที่ด้วย `DATE(CONCAT(year,'-',LPAD(month,2,'0'),'-01'))`) |
| `total_failures` | จำนวนครั้งที่เสียในเดือน |
| `operating_hours` | ชั่วโมงเดินเครื่องจริงในเดือน |
| `total_downtime_minutes` | นาทีที่หยุดรวม |

grain: 1 แถว = 1 เครื่อง × 1 เดือน

### 2.3 `asset_registry` (alias `a` / `aK`) — ทะเบียนเครื่อง
`id, code, name, category, criticality (A..), status, location, department, department_id, running_hours_month`

### 2.4 ตารางประกอบ
| ตาราง | คอลัมน์ที่ใช้ | ใช้ใน |
|---|---|---|
| `departments` | `id, name` | ชื่อแผนก (asset_health, priority, cost, downtime) |
| `users` | `id, full_name, role_id, role, username, employee_code` | ระบุช่าง/RBAC |
| `work_assignees` | `ref_id, ref_type='repair', user_id` | ผู้ร่วมงาน (filter/scope) |
| `pm_am` | `id, title, asset_id, due_date, completed_at, status, is_outsource, cost_outsource, frequency_type, plan_id, assigned_to` | PM compliance |
| `pm_am_plans` | `id, code, name` | ชื่อแผน PM |
| `inspection_schedules` | `asset_id, result, completed_at` | สัญญาณ inspection (asset health) |
| `failure_codes` | `id, code, name` | ชื่อสาเหตุเสีย |
| `maintenance_requests` | `status, requested_by` | counts.requests_open |
| `spare_parts` | `code, name, stock_qty, min_stock, unit_price, category, updated_at` | สต็อก (Sage) |
| `repair_spare_parts` | `repair_id, spare_part_id, quantity_used, unit_price` | material cost / usage |
| `pm_am_spare_parts` | (นับแถว) | usage |
| `spare_issue_items` | `qty_issued` | usage |

### 2.5 View
- `v_inspection_dashboard_kpis.compliance_pct` → `kpi_core_metrics.pm_compliance_pct` (แหล่ง inspection)

---

## 3. Join / Grain ต่อตัวชี้วัด

| Section | ตารางหลัก | Join | Grain ผลลัพธ์ |
|---|---|---|---|
| Reliability | `mtbf_mttr` | — | รวมทุกเครื่อง / รายเดือน |
| Trend | `repair` | — | bucket (day/week/month/quarter) + reliability รายเดือน |
| Asset health | `asset_registry` | departments; สัญญาณจาก repair/mtbf_mttr/pm_am/inspection_schedules (batch GROUP BY asset_id) | 1 แถว / เครื่อง |
| Repeat failures | `repair` | asset_registry, failure_codes (detail) | 1 แถว / เครื่อง (cnt > 1) |
| Downtime Pareto | `mtbf_mttr` | asset_registry | 1 แถว / เครื่อง (dt > 0) |
| Priority/aging | `repair` | asset_registry, departments | 1 แถว / ใบงาน (active) |
| PM compliance | `pm_am` | pm_am_plans, asset_registry | 1 แถว / งาน PM |
| Planned/Unplanned | `repair` | — | 1 แถว / `source_type` |
| Technicians | `repair` | users | 1 แถว / ช่าง |
| Spare | `spare_parts` | repair_spare_parts/pm_am_spare_parts/spare_issue_items (นับ) | aggregate |
| Cost | `repair` | repair_spare_parts, spare_parts, asset_registry, departments | aggregate + breakdown |
| Data quality | `repair` | mtbf_mttr (coverage) | aggregate + รายฟิลด์ |

---

## 4. Data lineage ต่อ KPI (สรุป)

| KPI | ต้นทาง |
|---|---|
| MTBF/MTTR/Availability (Intelligence) | `mtbf_mttr` |
| MTBF/MTTR (core dashboard) | `repair` |
| Breakdown / Completion / SLA | `repair` |
| Downtime Pareto | `mtbf_mttr` |
| Asset Health score | `repair` + `mtbf_mttr` + `pm_am` + `inspection_schedules` |
| PM compliance (Intelligence) | `pm_am` |
| PM compliance (core) | view `v_inspection_dashboard_kpis` |
| Stock value | `spare_parts` (Sage snapshot) |
| Material cost | `repair_spare_parts` |
| Technician load | `repair` |
| Data quality | `repair` + `mtbf_mttr` |

---

## 5. สถานะข้อมูลจริง (snapshot 2026-09-18 — ใช้ตั้งสมมติฐานตอนอ่านค่า)

| ตาราง/กลุ่ม | จำนวน/สภาพ |
|---|---|
| `repair` | 102 ใบ ทั้งหมด `source_type='breakdown'`; `downtime_minutes>0` แค่ 1 ใบ (รวม 14,400 นาที); มี `repair_time_minutes` 22 ใบ |
| response_time / cost / failure_code / rca | 0 (ยังไม่กรอก) |
| `mtbf_mttr` | 11 แถวครอบปี 2026, 2 เครื่อง, failures 35, operating 6,840 ชม., downtime 4,950 นาที |
| `asset_registry` | 55 เครื่อง (A=8), down=23 (มีใบงานค้าง) |
| `pm_am` | 7 รายการ (เสร็จ 3, on-time 1) |
| `spare_parts` | 1,870 รหัส, มูลค่า ~10.48 ล้านบาท, ต่ำกว่าขั้นต่ำ 678 |
| `repair_spare_parts` / `pm_am_spare_parts` / `spare_issue_items` | **0 แถว** → การใช้อะไหล่/ต้นทุนวัสดุ = INSUFFICIENT DATA |
| `failure_codes` | มีรหัสแต่ยังไม่ถูกผูกกับใบงาน |

> ตัวเลขเหล่านี้อาจเปลี่ยนเมื่อมีการบันทึกจริง — เอกสารนี้ระบุเพื่อตีความ "INSUFFICIENT DATA" ให้ถูกต้อง

---

## 6. ข้อจำกัด (Limitations)

1. **Response time / SLA / ต้นทุน / RCA / failure code** ยังไม่ถูกกรอกในระบบจริง → KPI เหล่านี้
   เป็น null/0 และถูกติดป้าย INSUFFICIENT DATA
2. **Downtime** มีสองแหล่ง (`repair` vs `mtbf_mttr`) — Pareto/Reliability ใช้ `mtbf_mttr`
3. **MTBF/MTTR** มีสองนิยาม (ดู `docs/KPI_DEFINITIONS.md` §12)
4. **Asset health** ใช้หน้าต่าง 90/180 วัน — เครื่องที่ไม่มีประวัติเลยจะได้ `INSUFFICIENT_DATA`
5. **Sage** เป็น source of truth ของสต็อก — CMMS แสดง snapshot (`last_synced`)
6. ไม่มีการพยากรณ์ (no prediction/ML) ทุกค่าคำนวณจากอดีตที่บันทึกจริง
