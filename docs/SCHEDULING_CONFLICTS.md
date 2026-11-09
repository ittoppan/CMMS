# Scheduling Conflicts (ความขัดแย้งของแผน) — Phase 25

> ฟังก์ชัน: `pln_detect_conflicts()` ใน `src/helpers/planning.php`
> เรียกใช้: schedule/reschedule/assign/bulk + `?action=conflicts` + `?action=center` (วันนี้, สูงสุด 40)

## 1. ประเภทความขัดแย้ง (3 ประเภท)

ตรวจหางานอื่นที่ยังไม่จบ (active statuses) ที่ทับช่วง `[start, end)` โดยตัดใบงานตัวเองออก (`excludeRepairId`):

| type | เช็ค | severity | เหตุผล |
|---|---|---|---|
| `technician` | งานของช่าง/ทีมคนใดคนหนึ่งทับช่วงเวลา | `high` | ช่างคนเดียวทำสองงานพร้อมกันไม่ได้ |
| `asset` | ใบงานอื่น (ไม่ใช่ PM) จองเครื่องเดียวกัน | `medium` | เครื่องถูกใช้สองงานในเวลาเดียวกัน |
| `pm` | รอบ PM (source_type='pm') บนเครื่องเดียวกันที่ยังไม่ปิด | `low` | PM ควรมีช่วงของมัน — การซ่อมทับกันลดความพร้อม |

- จำกัดผลแต่ละประเภท (technician 15 / asset 10 / pm 10 ต่อคน/เครื่อง) แล้วเรียงตาม `overlap_from`
- โครงสร้างผลลัพธ์: `{type, user_id, user_name, wo:{id,work_order_no,title}, overlap_from, overlap_to, severity}`

## 2. เงื่อนไขการทับซ้อน

ใบอื่นถือว่าชน เมื่อ (หน้า calendar ใช้หลักเดียวกัน):

```
r.planned_start_at < end  AND  COALESCE(r.planned_end_at, r.planned_start_at) > start
```

- ใบที่ยังไม่มี `planned_end_at` ใช้ timestamp เริ่มแทน (single-point booking)
- นับเฉพาะสถานะ active (open..in_progress ฯลฯ) — งาน done/closed ไม่นับ
- ตัวกรองช่างตรวจทั้ง `assigned_to` และ `work_assignees`

## 3. การจัดการ (flow ของ action)

1. ผู้วางแผนเลือกช่วงเวลา/ทีม → backend เรียก `pln_detect_conflicts()`
2. **ไม่มี conflict** → ผ่าน (schedule/assign) + audit + notify
3. **มี conflict + ไม่มี `force`** → ตอบ **409** พร้อม `conflicts[]` — UI แสดงรายการและให้กด "ยืนยันการบังคับ" (force) อีกครั้งตามเจตนา
4. **มี conflict + `force:true`** → ผ่านโดยบันทึกลง audit เหตุผลเดียวกัน (`force` ถูกส่งเฉพาะตอน user ยืนยันจริง — ระบบไม่ auto-force)

⚠️ `force` เป็นเพียงการยืนยันของคนบนหน้า UI อีกครั้ง — ระบบยังบันทึกว่าเกิดการทับซ้อนใน `conflicts` ที่ตอบกลับและใน `repair_schedule_log`

## 4. งานฉุกเฉิน (emergency)

- สร้างรอบใหม่ (now+10 นาที) แล้วเช็ค `affected` = รายการที่ถูกทับซ้อน
- คืน `affected[]` สูงสุด 20 ให้ผู้วางแผนรีวิวว่าต้องย้ายงานใดบ้าง
- ไม่ block — ฉุกเฉินเดินหน้าเสมอ (เฉพาะ planner ที่มีสิทธิ์)

## 5. bulk (กลุ่ม) conflict

- `dry_run=true` → คืน `preview.conflicts_total` + conflict/readiness ต่อใบ ก่อนเขียน DB
- จริง → ใบที่ชนถูกปฏิเสธเป็นรายใบ (409-level ของใบนั้น) ส่วนใบอื่นดำเนินต่อ — ไม่ยกเลิกทั้งก้อน

## 6. การดูย้อนหลัง

- `?action=conflicts&from=&to=` → รายการทั้งหมด (สูงสุด 100)
- `?action=schedule_log&id=` → audit การเปลี่ยนแปลงรอบ/ผู้รับผิดชอบ/priority ทุกครั้ง (รวมตอน force)
- `?action=center` → conflict "วันนี้" (เฉพาะ technician conflict, สูงสุด 40)

## 7. ข้อจำกัด

- การนับ overlap เป็นแบบช่วงเวลา ไม่ใช่ slot-based (ไม่แยกกะ/เครื่องจักรที่ใช้พร้อมกันได้ เช่น ระยะพัก)
- PM ตรวจเฉพาะใบ PM ที่ `planned_start_at` ถูกตั้งแล้วจริง (PM ยังไม่ถูกวางแผนจะไม่ชน)