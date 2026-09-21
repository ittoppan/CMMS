# Maintenance Cost Model (Phase 26)

> ที่มา: `src/helpers/cost.php` — เอกสารนี้อธิบาย **สิ่งที่ระบบใช้จริง** หน้าจอ/API ทุกแห่ง
> ต้องอ่านค่านี้จาก engine กลางเท่านั้น (ห้ามคำนวณสูตรเองที่ UI/report)

## หลักการ

ต้นทุนซ่อมบำรุง = **Parts** + **Labor** + **External** + **Other**

- คำนวณจาก **วิวเดียว** `v_maintenance_cost` (ต่อใบสั่งซ่อม 1 แถว) ตามช่วงเวลาที่สร้างใบสั่งซ่อม
  (`created_at`) ไม่ใช่เวลาปิดงาน
- **Transparency-first**: ถ้าคอมโพเนนต์ไหนยังไม่มีข้อมูลให้คำนวณได้ → แสดง
  **Not Available** แบบชัดเจน (พร้อมเหตุผล) แทนการเดายอด
- ราคาสรุปเป็นสกุลเงินของระบบ (`currency_symbol` / `system_currency` จาก settings)

## คอมโพเนนต์ทั้ง 4

| คอมโพเนนต์ | แหล่งจริง | กฎ |
|---|---|---|
| **Parts (อะไหล่)** | `repair_spare_parts` snapshot ราคาในใบสั่งซ่อม | `Σ quantity_used × unit_price` (ราคา snapshot ขณะเบิก — คงที่แม้ราคา Sage เปลี่ยนทีหลัง) |
| **Manual parts (ใบเก่า)** | `cost_parts` | เฉพาะใบที่ `parts_lines = 0` และมี `cost_parts_snapshot > 0` (ใบ import/ใบเก่าก่อน Phase) — นำบวกเข้า Parts |
| **Labor (ค่าแรง)** | `cost_labor_recorded` หรือเวลา | ถ้ากรอกค่าแรงตรง (`cost_labor_recorded > 0`) ใช้ค่านั้น มิฉะนั้น `repair_time_minutes / 60 × labor_rate` |
| **External (จ้างภายนอก)** | `wo_response.cost_outsource_recorded` | ยอดค่าจ้างภายนอกจริง ถ้าระบุ `outsource_by` แต่ไม่มีค่าจ้าง → Not Available |
| **Other (อื่น ๆ)** | — | ยังไม่มีช่องบันทึก → **Not Available เสมอ** (documented gap) |

## Availability (transparency flags)

- `labor.available=false` เมื่อ `cost_labor_enabled=0` หรือไม่มี both แหล่ง
- `parts.available=false` เมื่อมีใบที่เบิกอะไหล่แต่**รายการใดรายการหนึ่งไม่มีราคา** (`unit_price=0`)
- `external.available=false` เมื่อมี `outsource_by` แต่ไม่มีค่าใช้จ่าย
- `other.available=false` เสมอ (`other_cost_not_recorded`)
- `total.available=false` เมื่อคอมโพเนนต์ใด unavailable — ส่วนหัว "รวม" ขึ้นอยู่กับ flag

## การรวมยอด

SQL fragment จริงจาก `cost_comp_sql()` (alias `r` = `v_maintenance_cost`):

```sql
parts    = (r.parts_cost + IF(r.parts_lines = 0 AND r.cost_parts_snapshot > 0, r.cost_parts_snapshot, 0))
labor    = IF(labor_enabled AND rate>0,
              IF(r.cost_labor_recorded > 0, r.cost_labor_recorded,
                 IF(r.repair_time_minutes > 0, r.repair_time_minutes/60.0*rate, 0)), 0)
external = COALESCE(r.cost_outsource_recorded, 0)
total    = parts + labor + external
```

Lab rate มาจาก settings `standard_labor_rate` (default 250 บาท/ชม.) ควบคุมเปิด/ปิดได้ด้วย
`cost_labor_enabled`.

## ดูเพิ่ม
- `docs/COST_SOURCES.md` — การแมปแหล่งข้อมูล → คอลัมน์
- `docs/COST_CALCULATIONS.md` — วิธีแปลงเป็นงานวิเคราะห์ (trend/by-type/by-dept/by-asset/…)
- `docs/BUDGET_MODEL.md` — เกณฑ์งบ/alert