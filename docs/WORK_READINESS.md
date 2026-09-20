# Work Readiness (ความพร้อมทำงาน) — Phase 25

> ฟังก์ชัน: `pln_readiness()` ใน `src/helpers/planning.php`
> แสดงผล: Planning Center (คอลัมน์สถานะ), calendar, `?action=readiness` (รายละเอียด), คอนเทนท์ใน UI

## 1. ความพร้อม 4 ด้าน

เช็คทุกใบงาน (workorder) และให้ผลเป็น `READY / PARTIAL / BLOCKED` + เหตุผลทุกข้อ:

| # | key | เช็คอะไร | ok เมื่อ |
|---|---|---|---|
| 1 | `schedule` | มีรอบเวลาวางแผน | `planned_start_at` **และ** `planned_end_at` ไม่ว่าง |
| 2 | `assignee` | มีผู้รับผิดชอบ | `assigned_to`/lead > 0 |
| 3 | `skill` | ทักษะช่างตรงใบงาน | `required_skill` ว่าง = ok; หรือทีมมี skill_name ตรง (ไม่ sensitive case) |
| 4 | `parts` | อะไหล่ไม่ค้างเบิก | ไม่มี `spare_issue_requests` withdrawal ที่สถานะ funding/รอส่งมอบ |

```
state = okCount === total      ? READY
      : okCount >= total - 1   ? PARTIAL   (ขาดอย่างมาก 1 ด้าน)
      :                          BLOCKED   (ขาด ≥ 2 ด้าน)
```

## 2. วัสดุ (อะไหล่) — Sage เป็นแหล่งข้อมูลจริง

- อ่านจากตาราง `spare_issue_requests` โดย `work_order_id = ใบงาน` และ `request_type='withdrawal'`
- `pending` → **block** (ยังขอ/รออนุมัติ)
- `approved` + `sage_shipment_status='completed'` → ผ่าน (ส่งมอบแล้ว)
- `approved` แต่ยังไม่ shipped → **block** (รอส่งมอบ)
- รายละเอียดแสดง "คำขอ#.. (สถานะ ..)" ต่อรายการ เพื่อให้ผู้วางแผนติดตาม
- ระบบ **ไม่จอง/ตัดสต็อกเองตอนวางแผน** — เป็นการตรวจเท่านั้น

## 3. ทักษะช่าง — ตรวจแบบ Gap ไม่ block ฮาร์ด

- `required_skill` เป็น string คอมม่า-separated ได้ (`ram,วาล์ว`)
- เทียบกับ `technician_skills` ของสมาชิกทีม (assigned_to + work_assignees)
- table ไม่บล็อก (BLOCKED ไม่ปิดงาน) — แค่แสดง gap แดงใน readiness เพื่อให้ผู้วางแผนหาช่าง/กะทดแทน
- ไม่มีข้อมูลทักษะ → ขาดได้ (ถ้าใบงานระบุ skill)

## 4. งานคำขอซ่อมใหม่ (maintenance_request)

`pln_prepare()` กรณี `kind='request'`: ยังไม่เป็นใบงานจึง **ไม่เช็ค readiness** (ไม่มีทีม/รอบ/สต็อก) — group=`new_request`, sla_risk=`safe`, skill_match=qualified

## 5. สรุปใน Planning Center

- `readiness.ready / readiness.total` (count เฉพาะ READY)
- ใช้กับ `?action=center` เพื่อแสดง "พร้อม X / ทั้งหมด Y" — ช่วยดูภาพรวมว่าแผนพร้อมหรือยัง
- filter `?action=queue&group=...` ใช้ enrich ที่ `pln_prepare()` เหมือนกัน

## 6. ข้อจำกัด

- ตรวจเฉพาะ existence/สถานะ ไม่เช็คระดับ skill (ระดับ 1-5 ของ technician_skills แสดงผลแต่ไม่บังคับ)
- เวลาภายในกะใช้ clock ปกติ (ไม่ cross machine hour)