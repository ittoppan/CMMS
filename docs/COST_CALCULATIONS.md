# Cost Calculations — Work-order ถึง Dashboard (Phase 26)

> ทุก "ยอด" ที่เห็นบนหน้าจอ มาจาก `src/helpers/cost.php` ไม่มีที่สอง
> เอกสารนี้อธิบายวิธีย่อระดับ (roll-up) จากใบสั่งซ่อมเป็นภาพวิเคราะห์

## 1) ระดับใบสั่งซ่อม — `cost_wo_breakdown($pdo, $id)`

แสดง 4 คอมโพเนนต์ + flag `available`:

| ฟิลด์ | ค่า |
|---|---|
| `parts.lines[]` | รายการอะไหล่จริง (item, qty, unit_price, cost, `cost_missing`) |
| `parts.total` / `parts.available` | ผลรวม + ถ้ารายการใดไม่มีราคา → `available=false` |
| `labor.value` / `labor.base` | `recorded` (ค่าที่กรอก) หรือ `time` (เวลา×อัตรา) |
| `labor.available` | พิจารณาจาก `cost_labor_enabled` / แหล่งข้อมูล |
| `external.value` / `external.available` | ตั้ง `outsource_by` ไว้แต่ไม่มีค่าใช้จ่าย → ไม่ครบ |
| `other.value` / `other.available` | เป็น `null` / `false` เสมอ |
| `total` | `parts + labor + external` (เฉพาะที่ available) |
| `unavailable_components[]` | รายชื่อที่ทำให้ "ไม่ครบถ้วน" |

## 2) ระดับรวม / กลุ่ม — roll-up

- `cost_summary` — SUM แต่ละคอมโพเนนต์ + `total`, `wo_count`, `wo_completed`,
  `wo_with_cost`, `avg_per_wo`, `material_qty`, `downtime_minutes`, `availability` (กลุ่ม)
- `cost_trend` — GROUP BY `YEAR/MONTH(created_at)` (+ `label`) ครอบ 6 เดือนล่าสุดมีข้อมูล
  (ข้อมูลจริง — เดือนที่ไม่มีใบ ไม่ถูกเติมเทียม)
- `cost_by_type` — preventive / corrective / improvement / other
- `cost_by_department(limit)` — สูงสุด 10 อันดับ (ปรับได้)
- `cost_by_asset(limit)` / `cost_high_assets` — สูงสุด/เกณฑ์ขั้นต่ำ (`high_cost_threshold`)
- `cost_parts_list(limit)` / `cost_repeat_parts(limit)` — อะไหล่สูงสุด / ใช้ซ้ำ ≥ 2 ใบ
- `cost_pm` — แยก preventive (แผนงาน+inspection) vs corrective + `preventive_ratio`
- `cost_breakdown` — เฉพาะงานเสีย + แยกตามเครื่อง + `downtime_minutes`
- `cost_emergency` — priority critical + high
- `cost_forecast(year)` — `ytd_total`, `monthly_avg`, `full_year_projection`,
  `months_remaining`, `projection_remaining` (อิงค่าเฉลี่ยรายเดือนจริงเท่านั้น)

## 3) ระดับความครบถ้วน — `cost_data_quality`

`warnings[]` ต่อคอมโพเนนต์ (parts/labor/external/other) พร้อม `title/detail/ok` +
`overall_ok` — ใช้แสดง banner เตือนบนหน้า `/cost` ("ข้อมูลยังไม่ครบ จึงแสดง Not Available")

## 4) Filter ร่วม (ทุก roll-up)

`range/range_start/range_end/department_id/asset_id/asset_category/source_type/priority/status/maintenance_type`
→ ผูกเป็น `WHERE` ผ่าน `cost_filters()` + `cost_where()` (คอลัมน์ `created_at`)

> หมายเหตุ: คอลัมน์ `maintenance_type` เป็น view-only (ไม่มีใน `repair`) — ส่วน query ที่
> join ตารางจริงจะแปลงเป็น `EXISTS (SELECT 1 FROM v_maintenance_cost vm WHERE vm.repair_id = r.id AND vm.maintenance_type = ?)`
> ผ่าน `cost_parts_filter()`