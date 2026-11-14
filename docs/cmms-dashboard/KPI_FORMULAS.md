# CMMS-TPT — KPI Formula Registry

> ถอดจากโค้ดจริง `src/helpers/kpi.php` (ไม่ใช่สูตรสมมติ)
> หลักการ: **UI ต้องไม่คำนวณ KPI ใหม่เอง** — ใช้ค่าที่ API คืนมา และแสดง NOT AVAILABLE เมื่อตัวส่วนเป็น 0/ไม่มีข้อมูล

## 1. ชุดสถานะ (ใช้ร่วมทุกสูตร)

```
active/open : open, acknowledged, draft, pending_approval, approved, assigned, accepted,
              in_progress, paused, waiting_parts, pending_parts, waiting_external,
              waiting_approval, completed, pending_verification, resolved
done/closed : closed, cancelled, rejected, verified, done, skipped
```

## 2. Overdue (ใบงานค้างเกินกำหนด)

```
overdue(row) =
  ถ้า status ∈ done → false
  ถ้ามี sla_due_at และ < now → true
  ถ้ามี estimated_completion_date และ < now → true
  ถ้า status ∈ {open, acknowledged, assigned, accepted, approved, pending_approval}
     และ now - created_at > 7 วัน → true
  มิฉะนั้น false
```

- `overdue_days` = จำนวนวันจาก due date ที่ผ่านมา หรือจาก `created_at` (กรณีกฎ 7 วัน)
- **ผลจริง:** 71 ใบ (เพราะใบงาน 99 ใบไม่มี `estimated_completion_date`/`sla_due_at` เลย → มาจากกฎ 7 วันทั้งหมด)

## 3. Completion Rate

```
completion_rate = completed_in_range / created_in_range * 100
completed_in_range = COUNT(repair.completed_at อยู่ในช่วง AND status ปิดจริง)
```

- ตัวส่วน 0 → `null` (แสดง N/A)
- **ผลจริง:** 0 / 10 = **0%** (เป็น 0 จริง ไม่ใช่ N/A เพราะมีใบงานเปิดในช่วงแต่ยังไม่มีใบปิด)

## 4. MTTR

> ตั้งแต่ 2026-11-14 `repair_time_minutes` ถูกคำนวณและบันทึกอัตโนมัติเมื่อปิดงาน
> โดย `src/helpers/repair_time.php` (`repair_time_stamp()`) = `(completed_at − actual_start_at/acknowledged_at) − เวลาที่หยุดงาน (work_pause_logs)`
> เรียกจากทั้ง `repair.php` (ช่างปิดงาน) และ `supervisor.php` (หัวหน้างานปิดงาน) — สูตรเดียว
> ไม่ทับค่าที่มีอยู่แล้ว (> 0) และไม่ใช้ `planned_start_at` (แผนไม่ใช่เวลาทำงานจริง)

```
mttr_minutes = AVG(
    repair.repair_time_minutes            -- ถ้า > 0 ใช้ค่านี้
    หรือ TIMESTAMPDIFF(MINUTE,
         COALESCE(actual_start_at, acknowledged_at),
         completed_at)                    -- fallback
)
เงื่อนไข: completed_at IS NOT NULL และมีค่าเวลาที่ใช้ได้
```
- แปลงเป็นชั่วโมง (÷60) ก่อนส่งออก
- **ผลจริง: NOT AVAILABLE** — ไม่มีใบงานที่ `completed_at` และไม่มี `repair_time_minutes`

## 5. PM Compliance

```
pm.completion_rate = pm_am.completed / pm_am ที่ถึงกำหนดทั้งหมด * 100
pm.on_time_pct     = completed ที่ completed_at <= due_date / completed * 100
core.pm_compliance_pct = v_inspection_dashboard_kpis.compliance_pct
```
- **ข้อควรระวัง:** view คืน `0.00` แม้ไม่มีกำหนดการเลย (0/0) → UI ต้องแสดง N/A เมื่อ `pm.due_total = 0`
  ไม่ใช่ 0% (0% หมายถึง "ทำไม่สำเร็จ" ซึ่งไม่จริง)
- **ผลจริง: NOT AVAILABLE** (pm_am 0 แถว)

## 6. SLA Compliance

```
sla_done  = COUNT(completed_at <= COALESCE(sla_due_at, estimated_completion_date, planned_end_at))
sla_total = COUNT(ใบที่ปิดและมี due อย่างน้อย 1 ฟิลด์)
sla_pct   = sla_done / sla_total * 100   (sla_total = 0 → null)
```
- **ผลจริง: NOT AVAILABLE**

## 7. Asset Health

```
total_assets        = COUNT(asset_registry WHERE status <> 'disposed')
running             = COUNT(status = 'active')
down                = COUNT(DISTINCT repair.asset_id WHERE repair.status ∈ active_statuses)
under_maintenance   = COUNT(status = 'under_repair')
critical_assets     = COUNT(criticality = 'A' AND status <> 'disposed')
repeated_failure_assets (90 วัน) = assets ที่มี breakdown > 1 ครั้ง
high_downtime_assets  (90 วัน) = assets ที่ SUM(downtime_minutes) >= 1440
high_cost_assets      (90 วัน) = assets ที่ SUM(cost_labor+cost_parts+cost_outsource) >= 50000
```
- **หมายเหตุการตีความ:** `down` ในที่นี้หมายถึง "เครื่องที่มีใบงานค้างอยู่" ไม่ใช่สถานะเครื่องจักร
  (asset_registry มีเฉพาะ status `active`) — UI ต้องใช้คำว่า "มีงานค้าง" ไม่ใช่ "เครื่องเสีย"
- **ผลจริง:** total 82, running 82, down 82, under_maintenance 0, critical 0, repeated failure 4

## 8. Downtime / Cost

```
downtime_minutes = SUM(COALESCE(repair.downtime_minutes,0)) ตามช่วง created_at
cost_total       = SUM(cost_labor) + SUM(cost_parts) + SUM(cost_outsource)
material_cost    = SUM(repair_spare_parts.quantity_used * unit_price)
```
- 0 ที่ได้จาก "ไม่มีข้อมูล" ต้องมีป้าย "ยังไม่บันทึก" กำกับ ไม่ใช่ตีความว่าไม่มีค่าใช้จ่าย
- **ผลจริง:** downtime 0 นาที, cost_total 0, material 0

## 9. Technician Workload

```
ต่อช่าง 1 คน:
  assigned_cnt      = COUNT(status IN ('assigned','accepted'))
  in_progress_cnt   = COUNT(status IN ('in_progress','paused'))
  waiting_cnt       = COUNT(status IN ('waiting_parts','pending_parts','waiting_external','waiting_approval'))
  pending_verify    = COUNT(status IN ('completed','pending_verification'))
  total             = COUNT(*) group by assigned_to
```
- `/api/v1/workload.php` เพิ่ม: open_count, overdue_count, due_7d_count, done_7d_count, urgent_count
  (overdue ที่นี่อิง `estimated_completion_date` เท่านั้น — ต่างจาก `kpi_is_overdue` ที่มีกฎ 7 วัน)
- **ข้อจำกัด:** `repair.assigned_to` ว่างทั้งหมด และ `work_assignees` ชี้ id ที่ไม่มีอยู่ → ผลจริงมีเฉพาะกลุ่ม "ยังไม่มอบหมาย" (99 ใบ)

## 10. Null / Zero semantics ที่ต้องแสดงให้ต่างกัน

| ค่า | ความหมาย | ตัวอย่างในระบบ |
|---|---|---|
| `0` | มีข้อมูล และผลเป็นศูนย์จริง | Open WO = 0 ในบางช่วง, Completion 0% |
| `null` | คำนวณไม่ได้ (ตัวส่วน 0 / ไม่มีฟิลด์) → N/A | MTTR, MTBF, SLA |
| ไม่มีแถวเลย | ยังไม่มีข้อมูลให้คำนวณ → N/A + ระบุแหล่ง | PM, Inspection, Failure events |
| `0` จากฟิลด์ที่ยังไม่กรอก | "ยังไม่บันทึก" ไม่ใช่ "ไม่มีต้นทุน" | `cost_*`, `downtime_minutes` |

## 11. กติกาการใช้สูตรใน dashboard ใหม่

1. เรียก API (`dashboard.php`, `workload.php`, `repair.php`) — ห้าม query DB จากฝั่ง client
2. ถ้าค่าเป็น `null` หรือแหล่งข้อมูลว่าง → แสดง `N/A` + ชื่อแหล่งที่ขาด (เช่น "ไม่มีใบงานที่ปิดงาน")
3. ห้ามคำนวณอัตราส่วนใหม่จากตัวเลขที่ API ไม่ได้ให้มา (เช่นเอา open/created มาหารเองแล้วเรียกว่า completion rate)
4. ค่าที่ derive ได้จากข้อมูลจริง (เช่น "สัดส่วนงานค้างต่อทั้งหมด") ต้องเขียนกำกับว่าเป็นการคำนวณของ UI
