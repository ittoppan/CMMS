# Phase 5 — Audit: การแจ้งเตือนตาม workflow งานซ่อม (ของเดิม)

> วันที่: 2026-11-23 · เป้าหมาย: ปิด checkbox `[ ] notification ตาม workflow (ตรวจของเดิม)` ใน Phase 5
> ขอบเขต: **ตรวจของเดิมเท่านั้น ไม่แก้โค้ด** — ทุกข้อสรุปมาจากการอ่านโค้ด + query DB จริง
> DB: `cmms_tpt` (production) · Code: `public/api/v1/repair.php`, `src/helpers/notification.php`

## 1. ค่าตั้งที่เกี่ยวข้อง (อ่านจากตาราง `settings`)

| key | ค่า |
|---|---|
| `line_notify_enabled` | `1` |
| `email_notify_enabled` | `1` |
| `telegram_enabled` | `1` |
| `line_tpl_*_enabled` (ทุกเทมเพลต) | **ไม่มีแถวใน DB** → ใช้ค่า default จาก `lineTemplateDefaults()` = `1` |

เทมเพลตที่ระบบรองรับ (7 ตัว ใน `src/helpers/notification.php:479`):
`line_tpl_breakdown`, `line_tpl_completed`, `line_tpl_low_stock`, `line_tpl_pm_overdue`,
`line_tpl_sage_approval`, `line_tpl_work_assign`, `line_tpl_spare_request`

## 2. จุดที่ยิงแจ้งเตือนจริงในโค้ด (ขอบเขตที่วัดได้)

`public/api/v1/repair.php` มีบล็อกแจ้งเตือนเพียง 3 ก้อน (วัดขอบเขตด้วยการจับคู่ปีกกา):

| บรรทัด | handler | เหตุการณ์ | ช่องทาง |
|---|---|---|---|
| 483–540 | `POST` (สร้างใบงาน) | ใบแจ้งซ่อมใหม่ | LINE `line_tpl_breakdown` + Telegram/Teams/Email ผ่าน `notify_event_extra_channels` + `emailNotifyAdmins` |
| 889–1061 | `PUT` | งานถูกมอบหมาย (+ ขอเบิกอะไหล่) | LINE `line_tpl_work_assign`, `line_tpl_spare_request` + Email รายคน + Telegram |
| 1065–1150 | `PUT` | ปิดงาน (`newStatus === 'completed'`) | LINE `line_tpl_completed` ถึงผู้แจ้งเท่านั้น + Email ผู้แจ้ง + Telegram |

หลังบรรทัด 1150 คือ `DELETE` — **ไม่มีบล็อกแจ้งเตือนอื่นในไฟล์นี้**

## 3. ตารางความครอบคลุม: สถานะ → แจ้งเตือน

| การเปลี่ยนสถานะ | มีแจ้งเตือน? | หลักฐาน |
|---|---|---|
| สร้างใบงาน (`POST`) | ✅ | `repair.php:483` |
| `assigned` (มอบหมาย/เพิ่มทีม) | ✅ (เฉพาะคนที่ **ถูกเพิ่มใหม่**) | `repair.php:958` `if (!empty($res['added']))` |
| ขอเบิกอะไหล่ (`spare_request`) | ✅ | `repair.php:1042` / `1047` |
| `completed` (ปิดงาน) | ✅ | `repair.php:1065` |
| `pending_verification` | ❌ | ไม่มีบล็อก |
| `verified` (ผู้แจ้งตรวจรับ) | ❌ | ไม่มีบล็อก |
| `closed` (ปิดงานจริง) | ❌ | ไม่มีบล็อก |
| `rejected` (ช่างปฏิเสธงาน) | ❌ | ไม่มีบล็อก |
| `cancelled` (ยกเลิก) | ❌ | ไม่มีบล็อก |
| `reopened` (เปิดใหม่) | ❌ | ไม่มีบล็อก |
| `waiting_parts` / `on_hold` / `paused` | ❌ | ไม่มีบล็อก |

> หมายเหตุ: `repair` ไม่มีตาราง/ฟังก์ชัน transition matrix — `PUT` รับ `status` อะไรก็ได้
> (`$newStatus = strtolower($data['status'] ?? $oldStatus)` ที่ `repair.php:756`)
> ดังนั้นสถานะในตารางข้างบนจึงถูกส่งเข้ามาได้จริง แต่ไม่มีใครแจ้งเตือน

## 4. หลักฐานจากการส่งจริง (`notification_logs`, 510 แถว)

| เหตุการณ์ | ข้อความที่ค้น | จำนวน | ล่าสุด |
|---|---|---|---|
| งานถูกมอบหมาย (`work_assign`) | `งานถูกมอบหมาย` | **7** | 2026-11-23 07:20:16 |
| อะไหล่ต่ำกว่าจุดสั่งซื้อ (`low_stock`) | `ต่ำกว่าจุดสั่งซื้อ` | **9** | 2026-11-23 06:30:07 |
| PM ใกล้กำหนด (`pm_soon`) | `ใกล้กำหนด` | **1** | 2026-11-05 00:00:34 |
| ใบแจ้งซ่อมใหม่ (`breakdown`) | `ใบแจ้งซ่อมใหม่` | **0** | — |
| ซ่อมเสร็จ (`completed`) | `ซ่อมเสร็จ` | **0** | — |
| ขอเบิกอะไหล่ (`spare_request`) | `ขอเบิกอะไหล่` | **0** | — |
| PM เกินกำหนด (`pm_overdue`) | `PM เกินกำหนด` | **0** | — |
| ขออนุมัติเบิก Sage (`sage_approval`) | `ขออนุมัติเบิก` | **0** | — |

สถานะการส่ง: `SENT` 505 · `FAILED` 5 (ทั้ง 5 เป็น watchdog/วิดีโอ/PM-ใกล้กำหนด เมื่อ 2026-10-28 … 11-17 — **ไม่ใช่งานซ่อม**)
คอลัมน์ `template`: `NULL` 451 แถว · `''` 59 แถว · ไม่มีแถวใดบันทึกชื่อ `line_tpl_*` เลย

### ⚠️ ข้อควรระวังในการตีความ (สำคัญ)

**ตัวเลข 0 ของ `breakdown` / `completed` ไม่ใช่หลักฐานว่าโค้ดพัง** เพราะ:

1. ใบงานที่ปิดแล้วมี 6 ใบ และ**ทั้งหมดเป็น `E2E-WO-1..6`** ที่ seed ลง DB ตรง ๆ
   (`created_at` = 14 มิ.ย.–14 พ.ย. 2026, `completed_at` = วันถัดไป) — ไม่เคยผ่าน `PUT` ของ API
   → บล็อกแจ้งเตือนที่ `repair.php:1065` **ไม่เคยถูกเรียกเลย**
2. ผู้ใช้ที่ผูก LINE มีเพียง **1 คน จาก 22 คน** (`line_user_id` ไม่ว่าง = 1)
   → LINE push ไปหาผู้อื่นไม่ได้ตามนโยบาย "ยังไม่ผูกบัญชี"
3. บล็อกปิดงานครอบด้วย `try/catch` + `error_log` (`repair.php:1149` `[repair.php] completed notify failed:`)
   → ถ้าส่งล้ม จะไม่เกิดแถวใน `notification_logs` และไม่พัง request

**สรุปที่ถูกต้อง:** เส้นทาง `breakdown` / `completed` = **ยังไม่เคยถูกทดสอบกับข้อมูลจริง** (NOT VERIFIED) ไม่ใช่ FAIL

## 5. Findings

| ID | ระดับ | อาการ | หลักฐาน | ต้องอนุมัติ? |
|---|---|---|---|---|
| N5-1 | MEDIUM | 6 สถานะปลายทาง (`verified`, `closed`, `rejected`, `cancelled`, `reopened`, `waiting_parts`) ไม่มีการแจ้งเตือนเลย — ผู้แจ้งไม่รู้ผลตรวจรับ/การปฏิเสธ/การยกเลิก | §2, §3 | ใช่ (เพิ่มฟีเจอร์ ไม่ใช่แค่แก้ UI) |
| N5-2 | LOW | แจ้งเตือน "งานถูกมอบหมาย" ยิงเฉพาะสมาชิกที่**ถูกเพิ่มใหม่** (`$res['added']`) — เปลี่ยนหัวหน้าชุดเป็นคนที่อยู่ในทีมแล้ว = ไม่มีใครได้รับแจ้ง | `repair.php:958` | ใช่ (แตะ logic) |
| N5-3 | LOW | ทุกแถวใน `notification_logs` มี `template` เป็น `NULL`/`''` แม้จะส่งผ่านเทมเพลต — ตรวจย้อนหลังแยกรายเหตุการณ์ไม่ได้ | §4 (`template` NULL 451, `''` 59) | ใช่ (แตะ `logLineSend` signature) |

## 6. สิ่งที่ยังไม่ได้ตรวจ

- การส่งจริงถึงปลายทาง: ไม่ได้ยิง LINE/Email/Telegram ออกจากระบบ (จะเป็นการส่งข้อความจริงถึงคนจริง)
  → ยืนยันได้แค่ "มีโค้ดเรียก + มี log ของ `work_assign`/`low_stock` ที่เคยส่งสำเร็จ"
- เทมเพลต `line_tpl_completed` / `line_tpl_breakdown` เรนเดอร์ Flex ถูกต้องหรือไม่ (ต้องมี LINE token จริง)
- `/settings/notifications` เปิด/ปิดช่องทางรายเหตุการณ์แล้วมีผลจริงหรือไม่ (`notify_channel_enabled`)
- Email ถึงผู้แจ้งตอนปิดงาน (ต้องมี SMTP ที่ส่งออกได้จริง)

## 7. สรุปสถานะ Phase 5 checkbox

| checkbox | สถานะ |
|---|---|
| `[ ] notification ตาม workflow (ตรวจของเดิม)` | **ตรวจแล้ว** — ครอบ 4 เหตุการณ์, ขาด 6 สถานะ (N5-1), 2 เส้นทางยังไม่เคยถูกทดสอบกับข้อมูลจริง |
