# Cost Sources & Data Mapping (Phase 26)

> เอกสารนี้แมป **แหล่งข้อมูลจริง → คอลัมน์ในวิว ​`v_maintenance_cost`** ใครที่เพิ่ม/แก้
> ข้อมูลต้องเข้าใจว่าแต่ละฟิลด์ *ผูก* อยู่กับอะไร เพื่อไม่ทำยอดต่างที่ (Do.C.)

## ผังวิว `v_maintenance_cost` (ต่อ 1 ใบสั่งซ่อม)

| ฟิลด์ | แหล่ง | หมายเหตุ |
|---|---|---|
| `created_at` | `repair.created_at` | **ช่วงเวลา** ของใบสั่งซ่อม (filter ทั้งหมด) |
| `completed_at` | `repair.completed_at` | อ้างอิงเท่านั้น (ไม่ใช่ช่วงเวลา) |
| `maintenance_type` | จาก work_order / history | preventive / corrective / improvement / other |
| `department_id` / `department_name` | `departments` | ผ่าน asset หรือ dept ของใบ |
| `asset_id` / `asset_code` / `asset_name` / `category` | `asset_registry` | สำหรับ by-asset / by-category |
| `priority` / `source_type` / `status` | `repair` | filter ตามฉุกเฉิน/กลุ่มงาน |
| `repair_time_minutes` | `repair` | ใช้คำนวณค่าแรง (เวลา → ชม. × อัตรา) |
| `parts_lines` | COUNT(`repair_spare_parts`) | ใบมีรายการอะไหล่กี่แถว |
| `parts_cost` | `repair_spare_parts`: `Σ quantity_used × unit_price` | Snapshot ราคา ณ วันที่เบิก — **ไม่ดึงราคาปัจจุบันจาก Sage ทีหลัง** |
| `cost_parts_snapshot` | `cost_parts` (ตารางตั้งเอง) | มูลค่าอะไหล่รวมของใบที่กรอกมือ (ใบเก่า/import) |
| `cost_labor_recorded` | คอลัมน์ในใบสั่งซ่อมที่ช่างกรอกค่าแรงตรง | ถ้า > 0 จะใช้ค่านี้ก่อน |
| `cost_outsource_recorded` | `wo_response` (ใบสั่งซ่อมของหน่วยงานภายนอก) | ยอดค่ารับจ้างจริง |
| `outsource_by` | ใบสั่งซ่อม | ถ้าตั้งแต่แต่ไม่มี `cost_outsource_recorded` → External Not Available |
| `wo_details` / `wo_response` flag | `repair` | ประวัติ/ข้อมูลเชิงลึก |

## แหล่งข้อมูลที่ "ยังไม่มี" (documented gaps)

| คอมโพเนนต์ | สถานะ | สิ่งที่ต้องทำถ้าต้องการเก็บจริง |
|---|---|---|
| Other (อื่น ๆ) | ไม่มีช่องบันทึก → Not Available เสมอ | เพิ่มฟิลด์/ตาราง `cost_other_recorded` และเปิด `other_available=true` ใน `cost_config()` |
| ราคาอะไหล่ ณ วันนี้ | อ่าน snapshot ใบละครั้ง | ระบบ budget ใหม่ / module ราคาอะไหล่ปัจจุบัน (ต้องคำนวณใหม่ฝั่ง engine) |

## ข้อควรระวัง

- `repair_spare_parts.unit_price` เป็น snapshot — การแก้ราคา Sage **ไม่** ย้อนมาแก้ยอดเก่า
  (ถูกแล้วตามหลัก actual cost)
- การเพิ่ม `repair_spare_parts` ใบใหม่ จะอัปเดต `parts_lines/parts_cost` ที่วิวโดยอัตโนมัติ
  (วิวคำนวณสด) — ไม่ต้องกระทำด้วยมือ
- เปลี่ยนวิธีคำนวณได้ที่ **แก้วิว + แก้ `cost_comp_sql()` เท่านั้น** แล้ว UI ได้ผลลัพธ์ใหม่ทันที