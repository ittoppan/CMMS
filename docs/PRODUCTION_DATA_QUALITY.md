# Production Data Quality — CMMS-TOPPAN

> Phase 22 (§6) · วัด "ข้อมูลจริง" ที่อยู่ในฐาน (ไม่ใช่สคริปต์หลอกตัวเลข) เพื่อหาความเสี่ยงที่ต้องแก้ก่อนใช้งานจริง

## 0. ข้อเท็จจริงที่ต้องพูดให้ชัด (ไม่มีทางเลี่ยง)

**ระบบยังไม่ถูกใช้งานจริงในสายการผลิต.** ข้อมูลทั้งหมด ณ 2026-09-17 คือ seed/setup/test ที่ใส่ระหว่างพัฒนา QA ตัวเลขด้านล่างจึงเป็น "คุณภาพของข้อมูลทดลอง" ส่วนใหญ่สะท้อนปัญหา**การป้อน/กฎ**ของระบบ ไม่ใช่การใช้งานจริง ตัวชี้วัดเชิงธุรกิจ (ชั่วโมงซ่อมต่อเครื่อง, MTBF…) ยังสรุปไม่ได้ จนกว่าจะมีข้อมูลจริงอย่างน้อย 1–2 เดือน

แนวทางของระบบ "เก็บบันทึกจริงเสมอ" ยังคงใช้ (ไม่มีการยกเลิก/ลบงานจริง แค่เพิ่มสถานะ) — ผู้ใช้สามารถแก้ข้อมูลผิดพลาดผ่านฟีเจอร์แทน

## 1. ข้อบกพร่องจริงที่พบ (จาก query ฐานข้อมูลจริง)

### 1.1 งานซ่อม (repair_work_orders: 102 แถว)
| เรื่อง | จำนวน | ผลกระทบ / สาเหตุ |
|---|---|---|
| `assigned_to` ว่าง ในงานที่เสร็จแล้ว | **78 / 102** | ทำ KPI "งานต่อช่าง/คน" ไม่ได้; มักเกิดจากงานย่อย/ทดสอบที่ปิดสถานะเร็วโดยไม่ assign |
| `created_by` NULL | **98 / 102** | seed ที่แทรกตรง DB; ผู้สร้างไม่มีประวัติ นับ stroke เป็นเจ้าของไม่ได้ |
| วันที่ผิด (บังเอิญ work_end < work_start หรือ อยู่ก่อน installed_date) | **9** | ขาด validation ฝั่ง DB; ต้องดักที่ฟอร์ม (งานซ่อม) ให้ทำงานจริงอยู่แล้ว — แต่ข้อมูลเก่ายังต้อง cleanup |
| สถานะค้าง > 30 วัน (open/assigned/in_progress/pending_approval) | **17** | ยังไม่ถูกปิดเลย; เก่าแก่สุด EN-26-020 (2026-05-13) |
| งาน completed โดยไม่มีช่าง + `updated_at` เก่า | ลบ/แก้ไม่ได้ตามนโยบาย "ไม่ลบ" | ต้องออก flow "ปิดงานค้าง" (ดู backlog I-03) |

> ข้อสังเกต: ในชุดข้อมูลไม่พบสถานะ `resolved/cancelled/rejected` เลย — ชุดสถานะที่ใช้จริงคือ `open, assigned, in_progress, pending_approval, completed, closed` (ของจริง 102 แถวตรงกับ enum นี้ทุกตัว)

### 1.2 ผู้ใช้ (users)
| เรื่อง | จำนวน | หมายเหตุ |
|---|---|---|
| assignee (ในงานซ่อม) ที่ไม่มีใน `users` แล้ว | **9** | บุคลากรเปลี่ยน (ลาออก/โอน/ทดสอบ) แต่งานยังอ้างถึง id เดิม — เก็บชื่อประวัติไว้ได้ แต่ KPI assignment ปัด 9 ราย |
| ชื่อเต็มซ้ำ/มีชื่อญาติ | 2 | ข้อมูล seed; คนจริงจะใส่ผ่าน LDAP/AD ในภายหลัง |
| ผู้ใช้ active | 2 (admin id1 + role null id61) | จริงๆ ยังไม่มีผู้ใช้เทคนิเชียนพร้อมใช้จริงคนเดียว |

### 1.3 ข้อมูลหลักที่เจนผิด
| ตาราง | จำนวนแถว | ข้อควรรู้ |
|---|---|---|
| machines | ~13,566 (อ้างอิง) | ตรวจซ้ำจากข้อมูล Sage/CSV แล้ว ยังซ้ำ (เช่น duplicate `asset_code`) รอ cleanup ก่อนแถวเหล่านี้ถูกใช้จริง |
| spare_parts | **1,870 รายการ (สวีท ~560KB)** | อ่านตรงจาก Sage300 (DSN test) — ตรวจถูกต้อง ไม่ใช่ fake; แต่ยังไม่มี mapping unit/type-repair ทั้งหมด |
| pm_am_plans / active | 3 plans | ครบตาม seed; ยังไม่มีการ generate จริง (ไม่มี overdue) |
| inspection_results | มี fail 8 รายการ | file-attachment หรือ timestamp บางรายการไม่สมบูรณ์ (schedule ยังไม่มี `inspection_at` ก่อนหน้า 1.x) |

### 1.4 การแจ้งเตือน 30 วัน
| ช่อง | ส่งสำเร็จ | ล้มเหลว | สาเหตุ |
|---|---|---|---|
| LINE | 23 | **58** | **LINE quota เต็ม (ข้อความ quota error)** — ใช้บัญชี free ต้องรอรอบถัดไป |
| Telegram | 209 | 0 | ทำงานปกติ (แต่ token = env; ดูการจัดการใน AGENTS.md) |

### 1.5 การประสานกับ Sage (sage_sync_log ล่าสุด)
- success 4, conflict 1 (รายการซ้ำจาก client retry) — กลไก idempotent ทำงาน
- last_sync = 2026-09-07 21:50:39 → **ยังไม่มี sync ใหม่ตั้งแต่นั้น** (ยังไม่มีคนเปิดใช้ daily job; ต้องตั้ง cron แล้ว)

## 2. สาเหตุที่ชัดเจน (root cause pattern)

1. seed ข้อมูล = ใส่ตรง DB ผ่าน PHP/Python ≠ ผ่านฟอร์ม → ไม่มี `created_by`/validation
2. ยังไม่มี **การยืนยันตัวตนจริง** (ยังใช้ account ทดสอบ / role null) ทำให้ "ใครเป็นใคร" ไม่แน่นอน
3. ยังไม่มี SQL constraint กันวันมั่ว/assignee ว่าง (ต้องการ migration ที่รอบคอบ — อย่าพังข้อมูลเดิม)
4. ไม่มี flow "cleanup งานค้าง" ระดับ supervisor
5. LINE quota ฟรี = จุดอ่อนด้านการแจ้งเตือนคนจริง

## 3. แนวทางแก้ (จัดลำดับตามความคุ้มค่า — ดู IMPROVEMENT_BACKLOG.md)

| ลำดับ | การแก้ | วิธี | อย่า |
|---|---|---|---|
| A | บังคับ create/assign ผ่านฟอร์ม | form validation + ตั้ง `created_by` ฝั่ง API เมื่อสร้างงาน | ปล่อยให้ API รับ `created_by` มากำหนดเอง |
| B | validate วันที่/สถานะใน API layer | กัน input มั่วก่อนเข้า DB (ไม่พังข้อมูลเก่า) | migration `CHECK` ที่อาจ baseline ผิด |
| C | Supervisor cleanup flow ("ปิดงานค้าง") | role 2 ดูงาน stale + บันทึกเหตุผลปิด (ตามนโยบายไม่ลบ) | ปุ่ม delete |
| D | จัดการช่าง/assignee | ตั้งค่า assignee ผ่าน user mgmt + migration เก็บ display name snapshot | merge users แบบเดาใจ |
| E | LINE => ใช้ account ทางการ/ขยาย quota หรือ fallback Email/Telegram สำคัญ | ติดต่อ admin LINE; เพิ่ม route lazy | ฝืนส่งจน quota เด้ง |
| F | Hedge "ข้อมูลยังไม่จริง" | หน้า Production Data Quality ใน dashboard + แบนเนอร์ "ยังไม่ใช่ข้อมูลจริง" | เล่นตัวเลข |

## 4. Retention / สุขอนามัยฐาน

- `system_errors`: ไม่ตั้ง retention อัตโนมัติ (ต้องการ data สำหรับ debug) — แต่ถ้าโตเร็ว เก็บแค่ trace ของ 90 วันล่าสุด (ตารางมี `occurred_at` อยู่แล้ว)
- `client_action_log`, `sage_sync_log`, `audit_logs`: append-only; ตรวจขนาดทุกครั้งตอนเก็บ KPI
- `logs/php-error.log` ถูก truncate แล้วหลังแก้ `display_errors=Off` + fastcgi log ลงไฟล์จริง — ตรวจกับ health page เป็นประจำ
- ยังไม่ได้ตั้ง **MySQL event** สำหรับลบ/archive เก่า → อยู่ใน backlog

## 5. สิ่งที่ทำรายงานนี้แล้วแน่จริง (verify)

- schema 110 ตาราง + ตารางใหม่ `system_errors`, `feedback` (migration Phase 22 applied)
- ตัวเลขทุกข้อข้างต้นรันจาก DB จริงในวันนี้ — ไม่ใช่การประมาณ
- ชุดสถานะ `repair_work_orders.status` ที่ใช้คำนวณ active 20+3 = ตามที่ระบุ (ตรงกัน dashboard + evidence Phase 21)