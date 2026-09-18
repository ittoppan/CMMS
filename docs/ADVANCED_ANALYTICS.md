# Advanced Analytics — คู่มือศูนย์วิเคราะห์อัจฉริยะ (Phase 23)

หน้า **ศูนย์วิเคราะห์อัจฉริยะ (Intelligence Center)** — เมนู *วิเคราะห์ & รายงาน → ศูนย์วิเคราะห์อัจฉริยะ*
เส้นทาง `/analytics/intelligence`

> ทุกตัวเลขคำนวณจากข้อมูลจริงในฐานข้อมูล CMMS ไม่มีการพยากรณ์/จำลอง — KPI ที่ข้อมูลไม่พอ
> จะแสดง **INSUFFICIENT DATA** พร้อมเหตุผล ไม่แสดง 0 หลอกตา

---

## 1. การใช้งาน

### 1.1 แถบตัวกรอง (Filter bar)
เลือกได้: **ช่วงเวลา / ความเร่งด่วน / ประเภทงาน / ช่วงกราฟแนวโน้ม** และตัวเลือกที่โหลดจากฐานข้อมูล:
**แผนก / เครื่อง / หมวดเครื่อง / ช่าง** พร้อมช่อง **ค้นหา (รหัส/ชื่อเครื่อง)** และปุ่ม **ใช้ตัวกรอง**

- ตัวกรอง "ทั้งหมด" ใช้ค่า `all` (ไม่ส่งไป backend)
- ค่าเริ่มต้น: `range = this_year`, `bucket = month`
- การเปลี่ยนจากการพิมพ์/เลือกจะ **ไม่ยิง API ถี่** — ต้องกด "ใช้ตัวกรอง" (หรือ Enter)
- ค่าที่เลือกจะถูกส่งไปทุก section และคงอยู่เมื่อสลับแท็บ

### 1.2 ป้ายคุณภาพข้อมูล (Data Quality banner)
ถ้าฟิลด์สำคัญ (downtime, เวลาซ่อม, เวลาตอบสนอง, ต้นทุน, failure code, RCA, planned start)
ถูกกรอก < 50% จะขึ้นแถบเตือนสีเหลืองด้านบน และปรับตามตัวกรอง

---

## 2. แท็บและสิ่งที่แสดง

| # | แท็บ | Section API | สาระสำคัญ |
|---|---|---|---|
| 1 | **ภาพรวมผู้บริหาร** | `overview` | การ์ด Reliability (MTBF/MTTR/Availability), งานเสร็จ/ฉุกเฉิน, สถานะ fleet, PM, อะไหล่ + กราฟแนวโน้มรายเดือน (งานเสร็จ · ฉุกเฉิน · MTBF) + อะไหล่ต่ำกว่าขั้นต่ำ |
| 2 | **Reliability** | `reliability` | ตารางรายเดือน + method note ของ MTBF/MTTR/Availability จาก operating hours จริง |
| 3 | **สถานะเครื่อง** | `asset_health` | คะแนนรายเครื่อง พร้อมเหตุผลหักคะแนน (explainable) แบ่งชั้น CRITICAL/ATTENTION/WATCH/HEALTHY/INSUFFICIENT_DATA + ปุ่มเจาะไปใบงานของเครื่อง |
| 4 | **เสียซ้ำ** | `repeat_failures` | เครื่องที่ใบงาน > 1 ใบ, ระยะห่างเฉลี่ย/ต่ำสุดระหว่างการเสีย + ปุ่ม **ใบงาน** เปิดรายการจริง (drill-down) |
| 5 | **Downtime** | `downtime_pareto` | Pareto downtime ตามเครื่อง (pct + cumulative) จาก `mtbf_mttr` |
| 6 | **PM** | `pm` | PM compliance (on-time), รายการ PM เสร็จ, งาน PM ค้างกำหนด |
| 7 | **ภาระงานช่าง** | `technicians` | ภาระงานต่อช่าง + สัญญาณงานทับซ้อน (overlap) — ไม่จัดอันดับฝีมือ |
| 8 | **สต็อก & อะไหล่** | `spare` | มูลค่าสต็อก (Sage), ของต่ำกว่าขั้นต่ำ/หมด + สถานะประวัติการใช้จาก CMMS |
| 9 | **ต้นทุน** | `cost` | labor/parts/outsource/วัสดุ + coverage (เฉพาะผู้มีสิทธิ์) |
| 10 | **คิวงาน & ความเร่งด่วน** | `priority` | คิวงานตาม priority + aging (0–7/7–14/14–30/30+ วัน) + overdue |

**Section ที่ไม่ใช่แท็บแต่ใช้ประกอบ:**
- `trend` — ป้อนกราฟในแท็บภาพรวม
- `data_quality` — ป้อนแถบเตือนคุณภาพข้อมูล

---

## 3. RBAC (บังคับฝั่ง server)

| เงื่อนไข | ผล |
|---|---|
| ไม่ได้ login | `401` ทุก section |
| role 3 (Technician) | ถูก scope เห็นเฉพาะงาน/PM ของตัวเอง (`kpi_scope`) |
| role 4 (Operator) | เห็นเฉพาะงานที่ตัวเองแจ้ง |
| role 1,2,6 | เห็นต้นทุนได้ (`meta.can_cost = true`) |
| role อื่นขอ `section=cost` | `403` + `{"error":"คุณไม่มีสิทธิ์ดูข้อมูลต้นทุน"}` |
| method ไม่ใช่ GET | `405` |

หน้าจอซ่อนแท็บ "ต้นทุน" โดยอิง `meta.can_cost` แต่การป้องกันจริงอยู่ที่ backend

---

## 4. API Reference

```
GET /api/v1/intelligence.php?section=<name>&range=<preset>&<filters>
```

### 4.1 พารามิเตอร์
| ชื่อ | ค่า |
|---|---|
| `section` | `overview` \| `reliability` \| `trend` \| `asset_health` \| `repeat_failures` \| `downtime_pareto` \| `priority` \| `pm` \| `planned_unplanned` \| `technicians` \| `spare` \| `cost` \| `data_quality` (ค่าเริ่มต้น `overview`) |
| `range` | `today`\|`yesterday`\|`this_week`\|`last_week`\|`this_month`\|`last_month`\|`this_quarter`\|`last_quarter`\|`this_year`\|`last_year`\|`custom` (ค่าเริ่มต้น `this_year`) |
| `range_start`, `range_end` | ใช้เมื่อ `range=custom` |
| `department_id`, `location_id`, `asset_id`, `asset_category`, `technician_id`, `source_type`, `priority`, `status` | ตัวกรอง |
| `bucket` | `day`\|`week`\|`month`\|`quarter` (สำหรับ `trend`, ค่าเริ่มต้น `month`) |
| `search` | ค้นหา `asset_registry.code`/`name` (ใช้กับ `asset_health`) |
| `limit`, `offset` | pagination (มี helper `ana_paginate`, limit สูงสุด 200) |

### 4.2 Envelope การตอบกลับ
```json
{
  "status": "success",
  "section": "overview",
  "data": { ... },
  "meta": {
    "user": { "id": 1, "full_name": "...", "role_id": 1, "role_name": "admin" },
    "range": { "preset": "this_year", "range_start": "", "range_end": "" },
    "filters": { "department_id": "", "asset_id": "", "bucket": "month", "search": "", "...": "" },
    "can_cost": true,
    "generated_at": "2026-09-18 07:39:39"
  }
}
```

### 4.3 ตัวอย่าง cURL
```bash
# ภาพรวมปีนี้
curl -s -b cookies.txt "http://localhost:8081/api/v1/intelligence.php?section=overview&range=this_year"

# เจาะใบงานของเครื่อง (drill-down)
curl -s -b cookies.txt "http://localhost:8081/api/v1/intelligence.php?section=repeat_failures&asset_id=12&range=this_year"

# ค้นหาเครื่อง + หมวด
curl -s -b cookies.txt "http://localhost:8081/api/v1/intelligence.php?section=asset_health&search=PMP&asset_category=Machine"
```

### 4.4 ข้อผิดพลาด
| โค้ด | ความหมาย |
|---|---|
| `400` | `section` ไม่รู้จัก |
| `401` | ยังไม่ login / session หมดอายุ |
| `403` | ไม่มีสิทธิ์ดูต้นทุน |
| `405` | ใช้ method อื่นนอกจาก GET |
| `500` | ข้อผิดพลาดภายใน (ผ่าน `api_safe_catch`, ไม่เปิดเผย stack) |

---

## 5. วิธีอ่านผล (Interpretation guide)

- **Reliability** ใช้ได้ดีเมื่อมีข้อมูล `mtbf_mttr` ต่อเนื่อง — coverage label บอก "ข้อมูลถึงเดือนอะไร"
- **สถานะเครื่อง**: อ่าน `reasons[]` ประกอบเสมอ — เครื่อง `INSUFFICIENT_DATA` หมายถึง "ยังไม่มีประวัติ" ไม่ได้หมายถึง "ดี"
- **เสียซ้ำ**: `min_gap_hours` ต่ำ + `cnt` สูง = สัญญาณควรตั้ง PM/แก้ที่ต้นเหตุ
- **Downtime Pareto**: ให้ความสำคัญเครื่องในกลุ่ม 80% สะสม
- **PM compliance**: ถ้า `done` น้อยมาก เปอร์เซ็นต์ยังไม่น่าเชื่อถือ
- **ต้นทุน/วัสดุ**: ถ้า `coverage.insufficient = true` ให้ถือเป็น "ยังไม่มีข้อมูล" ไม่ใช่ "ไม่มีค่าใช้จ่าย"
- **คุณภาพข้อมูล**: ใช้เป็นด่านตรวจก่อนนำ KPI ไปรายงานผู้บริหาร

---

## 6. ไม่ใช่ขอบเขต (Non-goals)

- **ไม่มีการพยากรณ์** (prediction/ML) — ทุกค่าเป็นการบรรยายอดีตจากข้อมูลจริง
- **ไม่ประมาณค่าที่ขาด** — แสดง INSUFFICIENT DATA แทน
- **ไม่ตัดสต็อกอัตโนมัติ** — สต็อกเป็นของ Sage 300; CMMS อ่าน snapshot เท่านั้น
- **ไม่จัดอันดับฝีมือช่าง** — วัดภาระงานเท่านั้น
