# Analytics Performance — CMMS-TOPPAN (Phase 23)

เอกสารนี้อธิบายกลยุทธ์ประสิทธิภาพของ engine `src/helpers/analytics.php` และผลวัดจริงของ
`/api/v1/intelligence.php`

---

## 1. กลยุทธ์หลัก (Query strategy)

1. **Aggregate ที่ฐานข้อมูล ไม่ดึงดิบมา PHP**
   ทุก section ใช้ `GROUP BY` / `SUM` / `COUNT` ใน SQL แล้วคืนผลสรุป ไม่โหลดทุกแถวมา loop
2. **Batch aggregation ต่อ asset_id (แก้ N+1)**
   `ana_asset_health` รวมสัญญาณของเครื่องทั้งหมดด้วย `GROUP BY asset_id` ครั้งเดียวต่อแหล่ง
   (repair 90/180 วัน, mtbf_mttr, pm_am, inspection_schedules, active WOs) แล้ว map ด้วย
   `asset_id` — ไม่ยิง query ต่อเครื่อง (55 เครื่อง = คงที่ ไม่ผูกกับจำนวนเครื่อง)
3. **Reuse engine กลาง**
   `kpi_filters` / `kpi_scope` / `kpi_parse_range` / `kpi_active_statuses` ใช้ร่วมกันทุก section
   ลดโค้ดซ้ำและลดความเสี่ยง query ไม่สอดคล้อง
4. **ทุก query มี `LIMIT`**
   - repeat failures: assets 200, timeline 2,000, detail 300
   - priority queue: 200, overdue PM: 200
   - pareto: ทั้งหมดของช่วง (โดยธรรมชาติ ≤ จำนวนเครื่องที่มีข้อมูล)
   - filtering ทั้งหมดทำก่อน `LIMIT` เสมอ
5. **`ana_paginate()`** — helper กลางสำหรับ section ที่มี `limit`/`offset` (สูงสุด 200 แถว/หน้า)
6. **เตรียมกราฟแนวโน้มให้ฝั่ง client เบา**
   `trend` เติมช่องว่างรายเดือนใน PHP และแนบ reliability เฉพาะ `bucket=month` (พ่วงจาก
   `ana_reliability` ครั้งเดียว ไม่ query ซ้ำ)
7. **overview รวมหลาย section แต่ query ยังถูกแบ่งเป็นชุดที่ reuse ได้** — `ana_overview` เรียก
   `kpi_core_metrics`, `ana_reliability`, `kpi_asset_health`, `ana_planned_unplanned`,
   `ana_data_quality`, `kpi_failure`, `ana_trend`, `ana_pm_compliance`, `ana_spare_analytics`

---

## 2. ประสิทธิภาพฝั่ง client (Next.js)

- **ไม่ยิง API ต่อทุกคีย์** — มีปุ่ม "ใช้ตัวกรอง" และ one-shot effect (`fetchAllRef`)
  ป้องกันการ refetch จาก re-render/keystroke
- **`qs()` ข้ามค่า `""` และ `all`** — ลด query string ที่ไม่จำเป็น
- **ตัวเลือก filter โหลดครั้งเดียว** จาก `dashboard.php?action=options` (แผนก/เครื่อง/หมวด/ช่าง)
  แล้วเก็บใน `useRef` ไม่ re-fetch เมื่อสลับแท็บ
- **JSON envelope เดียว** ทุก section (`status/section/data/meta`) — parse ง่าย, cache ฝั่ง client ตามแท็บ
- **Cache-Control: `no-store`** สำหรับ HTML/API (กัน shared cache ใน LINE in-app browser แสดงข้อมูลเก่า)

---

## 3. Index ที่รองรับ (ตรวจจากฐานข้อมูลจริง)

| ตาราง | Index ที่เกี่ยวข้อง |
|---|---|
| `repair` | PK `id`; `idx_repair_created_at`, `idx_rpt_repair_created_at`, `idx_rpt_repair_completed_at`, `idx_rpt_repair_status`, `idx_repair_status`, `idx_repair_status_assignee (status, assigned_to)`, `fk_repair_asset_id`, `fk_repair_assigned_to`, `fk_repair_created_by`, `idx_repair_sla (sla_due_at)`, `fk_r_department`, `fk_r_failure_code` |
| `mtbf_mttr` | PK `id`; `uk_mtbf_asset_period (asset_id, year, month)` |
| `asset_registry` | PK `id`; `uk_asset_code`; `fk_ar_department`, `fk_ar_location` |
| `pm_am` | PK `id`; `idx_rpt_pm_am_due_date`, `idx_rpt_pm_am_completed_at`, `fk_pm_am_asset_id`, `fk_pm_am_assigned_to`, `fk_pm_plan_id` |
| `inspection_schedules` | PK `id`; `fk_is_asset`, `idx_is_status_due (status, due_date)`, `idx_rpt_inspection_schedules_completed_at` |
| `spare_parts` | PK `id`; `uk_spare_parts_code` |
| `repair_spare_parts` | PK `id`; `fk_rsp_repair_id`, `idx_rsp_repair (repair_id)`, `fk_rsp_spare_part_id` |

**ข้อสังเกต:** `mtbf_mttr` ถูกกรองด้วย `DATE(CONCAT(year,'-',LPAD(month,2,'0'),'-01'))` ซึ่ง
**ไม่สามารถใช้ index ได้ (non-sargable)** — แต่ตารางมีขนาดเล็กมาก (11 แถว/ปี) จึงไม่มีผลในทางปฏิบัติ
ถ้าข้อมูลโตขึ้นมาก (> หลักแสนแถว) แนะนำเปลี่ยนไปกรองบน `(year, month)` แบบ tuple หรือเพิ่มคอลัมน์
period ที่มี index

---

## 4. ผลวัดจริง (baseline 2026-09-18)

Environment: IIS + PHP + MySQL (localhost), admin session, `range=this_year`, เรียกผ่าน PHP ตรง (localhost:8081)

| Section | เวลา (วินาที) |
|---|---|
| overview | 0.0442 |
| reliability | 0.0262 |
| asset_health | 0.0231 |
| repeat_failures | 0.0201 |
| data_quality | 0.0192 |
| priority | 0.0191 |
| downtime_pareto | 0.0188 |
| technicians | 0.0188 |
| trend | 0.0188 |
| pm | 0.0184 |
| planned_unplanned | 0.0177 |
| spare | 0.0133 |
| cost | 0.0109 |

- **เฉลี่ย ~20.7 ms/section, สูงสุด ~44 ms (overview)**
- e2e intelligence spec ทั้ง 5 เคสผ่านใน ~18 วินาที (รวม login/navigation/render)
- Full e2e suite: 84 passed / 2 skipped / 0 failed (~3.8 นาที)

> ตัวเลขนี้มาจากชุดข้อมูลปัจจุบัน (repair 102, mtbf_mttr 11, asset 55) — ใช้เป็น baseline
> เปรียบเทียบเมื่อข้อมูลโตขึ้น

---

## 5. ข้อควรระวังเมื่อข้อมูลเติบโต

1. `ana_repeat_failures` ใช้ timeline limit 2,000 แถวสำหรับคำนวณ gap — ถ้าใบงานต่อช่วงมาก
   ควรเปลี่ยนไปคำนวณ gap ด้วย window function (`LAG`) ที่ฐานข้อมูล
2. `ana_asset_health` เป็น O(จำนวนเครื่อง) แบบคงที่ต่อ query (batch) — ปลอดภัยเมื่อเครื่องพันตัว
   แต่ควรเพิ่ม index `repair(asset_id, source_type, created_at)` หาก query 90/180 วันช้าลง
3. `ana_overview` เรียกหลาย section รวมกัน (หนักกว่า section เดี่ยว ~2 เท่า) — เหมาะเป็น
   landing call ครั้งเดียว ไม่ควรเรียกถี่จาก polling
4. ทุก section ต้อง login — ไม่มีทาง bypass cache ข้ามผู้ใช้ (ไม่มี shared cache)
5. หลีกเลี่ยงการเพิ่ม index ซ้ำกับที่มีอยู่ (ตรวจ `information_schema.STATISTICS` ก่อน)
