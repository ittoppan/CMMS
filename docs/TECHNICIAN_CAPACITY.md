# Technician Capacity / Workload (ภาระงานช่าง) — Phase 25

> ฟังก์ชัน: `pln_technician_workload()` ใน `src/helpers/planning.php`
> ใช้ใน: Planning Center (workload วันนี้), `/planning/calendar` (workload ของช่วง view), `?action=technicians`

## 1. ใครถูกนับเป็น "ช่าง"

`SELECT ... FROM users WHERE is_active=1 AND role_id IN (1,2,3,6,7)`

- รวม Admin/Manager/ASST Manager/Foreman ด้วย — เพราะในสถานจริงหัวหน้างานก็ลงมือซ่อมได้
- **ไม่นับ** Operator (4) และ Viewer (5)
- ตัวกรอง `userIds[]` สนับสนุน (ใช้นับเฉพาะกลุ่มที่เลือกใน assign dialog)

## 2. Capacity ต่อวัน (ตอนอยู่ที่ได้จาก settings)

```
workDays = จำนวนวันในหน้าต่าง [from, to) ที่อยู่ใน planning_working_days (default จ-ศ)
capacityMinPerTech = max(1, planning_shift_hours) * 60 * workDays
```

- `planning_shift_hours` fallback ไป `work_hours_per_day` (default 8)
- หน้าต่าง n วัน → n เท่าของชั่วโมงต่อวัน (ไม่นับเสาร์-อาทิตย์ถ้าไม่ตั้งไว้)

## 3. ชั่วโมงที่ถูกจอง (assigned_minutes)

รวมช่วงเวลาทับซ้อนจริงของใบงานที่ "ยังไม่จบ" (active statuses) และผู้ใช้เป็น:

- `repair.assigned_to` (หัวหน้าชุด) **หรือ**
- อยู่ใน `work_assignees` (สมาชิกทีม) ของใบงาน

```
SUM( TIMESTAMPDIFF(MINUTE,
        GREATEST(r.planned_start_at, from),
        LEAST(COALESCE(r.planned_end_at, r.planned_start_at), to)) )
```

- เฉพาะใบที่ `planned_start_at < to` และ `planned_end_at > from` (ทับหน้าต่าง)
- ใช้ MINUTE จริง ไม่ใช่แค่นับใบ ป้องกันนับงาน 8 ชม. เบิ้ล

## 4. Output ต่อคน

| field | ความหมาย |
|---|---|
| `assigned_minutes` | นาทีที่ถูกวางแผนไว้แล้วในหน้าต่าง |
| `total_minutes` | capacity=ชั่วโมงกะ×วันทำงาน |
| `utilization` | `round(assigned / capacity * 100)` (เปอร์เซ็นต์) |
| `active_jobs` | จำนวนใบงานที่ทับหน้าต่าง |

## 5. วิธีใช้กับ UI

- Planning Center / Calendar: แถบ workload ด้านบนแสดง % ต่อคน → จุดที่ >100% (แดง) = over-capacity ต้องกระจายงาน
- assign dialog: เรียก `?action=technicians&from=&to=` เพื่อดู workload ของแต่ละคนก่อนเลือก
- `?action=calendar` ส่ง workload ด้วย (เฉพาะ planner) เพื่อขีดเส้น capacity บน timeline

## 6. ข้อจำกัดที่ตั้งใจ

- ไม่มีการ์ด "shift" จริงต่อคน (ยังเป็นชั่วโมงวันเดียวแบบรวม) — capacity คำนวณเป็นวัน ไม่ใช่ slot
- งานที่เริ่มทำ (assigned/accepted/in_progress/...) นับรวมใน assigned_minutes เพื่อให้เห็นภาพจริง (ห้ามวางซ้ำ)
- จำนวนวันทำงานอิง calendar ของระบบ (ไม่นับวันหยุดเฉพาะ machine) — ปรับได้ที่ `planning_working_days`