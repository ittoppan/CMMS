# PM Reminders — Dedupe Design (`pm_am.last_notified_at`)

สถานะ: **ปิดวงจรครบแล้ว (2026-11-19)** — migrate schema จริง (`cmms_tpt`), เพิ่ม reset ใน `pm_am.php`, ตั้ง Scheduled Task `CMMS-PMReminders` รายวัน 07:30, ทดสอบ dedupe + 2 process ผ่าน 17/17 บน scratch DB
อ้างอิงโค้ดจริง: `src/helpers/pm_reminders.php`, `scripts/pm_reminders.php`, `public/api/v1/pm_reminders.php`, `public/api/v1/pm_am.php`
Migration: `database/migration_20261118_pm_reminders_dedupe_proposal.sql` (รันบน `cmms_tpt` แล้ว 2026-11-19 — additive ทั้งหมด)

---

## 1) พฤติกรรมเดิม (As-Is ก่อนแก้)

- `pm_reminders_run()` สแกน `pm_am` ที่ `status NOT IN ('completed','cancelled','skipped')` + `assigned_to > 0` + (overdue | pending & due ≤ วันนี้ | in_progress & due < วันนี้), จัดกลุ่ม**ตามผู้รับผิดชอบ** แล้วส่ง 1 ข้อความต่อคนต่อการรัน 1 ครั้ง
- **ไม่มี dedupe ใด ๆ** → รันซ้ำ/กด `POST action=run` มือ/watchdog/redeploy ยิงซ้ำทันที, ตรวจย้อนหลังไม่ได้ว่าใครได้รับการเตือน

## 2) ทางเลือกที่พิจารณา

| ทางเลือก | ข้อดี | ข้อเสีย | สรุป |
|---|---|---|---|
| **A. คอลัมน์บนรอบ PM** (`pm_am.last_notified_at`) | ตรงกับขอบเขตที่ต้องการ (รอบ/วัน), ไม่เพิ่มตาราง, ตรวจย้อนหลังได้รายรอบ | dedupe ระดับรอบ ไม่แยกรายช่องทาง (LINE vs Email) | **เลือกใช้** |
| B. ตาราง log (`pm_notification_log`: cycle_id, user_id, channel, sent_at) | ละเอียดถึงช่องทาง, audit ครบ, ต่อยอด digest ได้ | เขียนเพิ่มทุกครั้ง, ต้องมี retention, งานมากกว่า | เฟส 2 (ดู §9) |
| C. dedupe ระดับผู้ใช้/วัน | ง่ายที่สุด | รอบใหม่ที่โผล่ระหว่างวันจะไม่ถูกเตือน | ไม่ใช้ |
| D. ไม่ dedupe + พึ่งความถี่ cron | ไม่ต้องแก้ schema | ยังสแปมเมื่อมีการรันซ้ำ | ไม่ใช้ |

## 3) ดีไซน์ที่เลือก — per-cycle + cooldown window

### 3.1 คอลัมน์ใหม่บน `pm_am` (additive ทั้งหมด)

| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| `last_notified_at` | `DATETIME NULL` | เวลาที่ส่งแจ้งเตือนรอบนี้สำเร็จครั้งล่าสุด — `NULL` = ยังไม่เคยแจ้ง |
| `notify_count` | `SMALLINT UNSIGNED NOT NULL DEFAULT 0` | จำนวนครั้งที่เตือนรอบนี้แล้ว (audit + กันลูปในอนาคต) |

> **ไม่มี `last_notified_kind`**: ข้อความถูกสร้างจากรอบที่ claim สำเร็จในรอบรันนั้นอยู่แล้ว (ดู §4) จึงไม่ต้องเก็บ "ประเภทการเตือนครั้งล่าสุด" — ถ้าต้องการวิเคราะห์ย้อนหลังให้ใช้เฟส 2 (`pm_notification_log`)

### 3.2 กติกา dedupe

- **cooldown ไม่ใช่ "ครั้งเดียวตลอดชีวิต"**: งานเกินกำหนดต้องเตือนซ้ำทุกวันจนกว่าจะปิด จึงใช้หน้าต่างเวลา
- ค่าเริ่มต้น **20 ชั่วโมง** อ่านจาก settings key `pm_reminder_cooldown_hours` (`pm_reminders_cooldown_hours()`, clamp 1..168 ผ่าน `getSettingValue()`)
  - 20 ชม. < 24 ชม. → cron วันละครั้งเวลาเดิมผ่านทุกวันแน่นอน แม้เวลารันคลาดเคลื่อน ±2–4 ชม.
  - ต้องการเตือนถี่ขึ้น (เช่น 2 ครั้ง/วัน) → ตั้ง `10`
- **cutoff คำนวณฝั่ง PHP** (`pm_reminders_cutoff()` → `date('Y-m-d H:i:s', time() - $hours*3600)`) ไม่ใช้ `NOW()`/`INTERVAL` ใน SQL — เลี่ยง timezone ของ MySQL กับ PHP ไม่ตรงกัน และเทสต์กำหนดเวลาได้
- รอบที่ `assigned_to IS NULL` ยังคงถูกข้ามเหมือนเดิม (ไม่มีผู้รับ)
- `pm_reminders_summary()` (GET) **ไม่ใส่เงื่อนไข dedupe** — summary คือภาพรวมงานจริง ไม่ใช่สถานะการแจ้ง

### 3.3 Query: scan แบบ candidate + claim เป็นด่านเดียว

`pm_reminders_scan()` **ไม่**กรอง dedupe ใน SELECT:

```sql
WHERE status NOT IN ('completed','cancelled','skipped')
  AND assigned_to IS NOT NULL AND assigned_to > 0
  AND ( status='overdue'
     OR (status='pending'      AND due_date <= :t1)
     OR (status='in_progress'  AND due_date <  :t2) )
ORDER BY (last_notified_at IS NOT NULL) ASC, last_notified_at ASC, due_date ASC, id ASC
LIMIT :n
```

เหตุผลที่ย้ายเงื่อนไขไปที่ claim UPDATE:

1. **นับ `skipped_duplicate` ได้จริง** — ถ้ากรองที่ SELECT ผู้ใช้ที่ทุกรอบอยู่ใน cooldown จะหายไปจากผลลัพธ์ แยกไม่ออกระหว่าง "ไม่มีงาน" กับ "เพิ่งเตือนไป"
2. **กัน `limit` อดอาหารงานใหม่** — เรียงรอบที่ยังไม่เคยแจ้งก่อน รอบที่อยู่ใน cooldown ไปอยู่ท้าย
3. **ด่านเดียวที่ตัดสิน** — เงื่อนไข `(last_notified_at IS NULL OR last_notified_at < :cutoff)` อยู่ใน `UPDATE ... WHERE` ที่เป็น atomic การันตีว่ามีเพียง process เดียวที่ได้แถวนั้น

### 3.4 ก่อน migrate (fallback)

PHP ถูก serve จากโฟลเดอร์โปรเจกต์โดยตรง ดังนั้นโค้ดใหม่อาจ live ก่อน schema: `pm_reminders_dedupe_supported()` ตรวจ `information_schema` ต่อ process (cache) — ถ้าคอลัมน์ยังไม่มี จะรันแบบเดิม (ไม่มี dedupe) และคืน `"dedupe": false` ในผลลัพธ์/log เพื่อไม่ให้ endpoint เดิมล่ม
ต้องรัน migration เพื่อให้ dedupe ทำงานจริง

## 4) ลำดับ claim → build message → send → rollback

```
1. pm_reminders_scan()  → $rows (รอบที่เข้าเกณฑ์ทั้งหมด; เก็บ last_notified_at เดิมไว้)
2. pm_reminders_group() → จัดกลุ่มตาม assigned_to
3. ต่อผู้ใช้หนึ่งคน ($marker = date('Y-m-d H:i:s')):
   a. UPDATE pm_am
        SET last_notified_at = :marker,
            notify_count     = notify_count + 1
      WHERE assigned_to = :uid
        AND id IN (:ids)
        AND (last_notified_at IS NULL OR last_notified_at < :cutoff)
      → rowCount() = 0 → คนอื่น claim ไปแล้ว/ทุกรอบอยู่ใน cooldown
                         → skipped_duplicate++, ไม่ส่ง
   b. SELECT id,title,due_date,status,...
        WHERE assigned_to = :uid AND last_notified_at = :marker AND id IN (:ids)
      → $claimed = แถวที่ "เราคลมจริง" ในรอบนี้
   c. $built = pm_reminders_message($claimed, $today)
      → สร้างข้อความจาก $claimed เท่านั้น (ไม่ใช้ $rows ทั้งชุด)
      → null (ไม่มีอะไรต้องบอก) → release + skipped_duplicate++
   d. sendNotificationToUser($uid, $built['message'], ...)
   e. throw → pm_reminders_release(): คืน last_notified_at เดิม + notify_count - 1
        โดยมีเงื่อนไข `AND last_notified_at = :marker` (กันทับค่าที่คนอื่นเพิ่งตั้ง)
        → notify_errors++ เพื่อให้รอบถัดไปลองใหม่
```

หลักการ 2 ข้อ:

- **เขียนก่อนส่ง (claim) แล้ว rollback เมื่อส่งไม่สำเร็จ** — ถ้าเขียนหลังส่ง เคส "ส่งสำเร็จแต่ process ตายก่อนเขียน" จะทำให้ส่งซ้ำไม่จำกัด
- **ข้อความต้องมาจากรอบที่ claim สำเร็จเท่านั้น** — ถ้าสร้างข้อความจาก `$rows` ก่อน claim ข้อความจะพูดถึงงานที่ process อื่น (หรือรอบก่อนหน้าที่ยังอยู่ใน cooldown) ส่งไปแล้ว → ผู้รับเห็นงานซ้ำ/ตัวเลขไม่ตรงกับสิ่งที่ระบบบันทึกว่าแจ้งแล้ว

## 5) จุดที่ต้อง Reset `last_notified_at` (implement แล้วใน `public/api/v1/pm_am.php` PUT)

กติกาอยู่ที่ `pm_reminders_should_reset($oldRow, $data)` ใน `src/helpers/pm_reminders.php` — รีเซ็ตเฉพาะเมื่อค่าเปลี่ยนจริง (เทียบกับค่าเดิมใน DB ก่อน UPDATE) และ **`status` รีเซ็ตเฉพาะการเปิดงานใหม่จากสถานะปิด** เท่านั้น
ถ้าคอลัมน์ยังไม่มี (`pm_reminders_dedupe_supported()` = false) จะข้ามไปเงียบ ๆ endpoint จึงไม่ล่มบน schema เก่า

| เหตุการณ์ | ทำอะไร | จุดแก้ |
|---|---|---|
| เลื่อนกำหนด (`due_date` เปลี่ยน / อนุมัติ `reschedule_to`) | `SET last_notified_at = NULL, notify_count = 0` | `public/api/v1/pm_am.php` PUT/PATCH (มี `due_date` ใน `$allowed`) — หลัง `UPDATE pm_am ... WHERE id = ?` สำเร็จ |
| กลับมาเปิดงาน (`status` → `pending`/`in_progress`/`overdue` จาก completed/skipped/cancelled) | เหมือนกัน | จุดเดียวกัน — `pm_reminders_should_reset()` |
| เปลี่ยนผู้รับผิดชอบ (`assigned_to`) | เหมือนกัน | จุดเดียวกัน — ผู้รับใหม่ต้องได้เตือนของตัวเอง |
| **กดรับงาน** (`pending → in_progress`), auto-flip `pending ↔ overdue` / `in_progress → overdue` | **ไม่รีเซ็ต** | เป็นรอบเดิมที่แจ้งไปแล้ว — ถ้ารีเซ็ตช่างจะได้แจ้งเตือนซ้ำในวันเดียวกัน |
| รอบใหม่ถูกสร้างจากแผน (`generate` cycle) | ไม่ต้องทำอะไร (ค่าเริ่มต้น `NULL`) | — |

ผลที่ได้: งานที่เพิ่งเลื่อนกำหนด/เปลี่ยนผู้รับผิดชอบจะถูกเตือนได้ทันทีในรอบถัดไป ไม่ต้องรอพ้น cooldown

## 6) ผลลัพธ์ที่ helper/สคริปต์/API คืน

```json
{
  "scanned_cycles": 120,
  "users_targeted": 8,
  "users_notified": 6,
  "skipped_duplicate": 2,
  "notified_cycles": 95,
  "cooldown_hours": 20,
  "notify_errors": 0
}
```
- `skipped_duplicate` = จำนวนผู้ใช้ที่ถูกข้ามเพราะทุกรอบของเขาอยู่ใน cooldown (หรือถูก claim ไปแล้ว)
- `notified_cycles` = จำนวนรอบที่ถูก claim จริงในรอบรันนี้
- `--dry-run` ใช้ `pm_reminders_plan()` — SELECT ชุดเดียวกัน + กติกา cooldown เดียวกัน แต่**ไม่เขียน DB**: คืน `users_would_notify`, `claimable_cycles`, `skipped_duplicate`, `cutoff`
- log 1 บรรทัดต่อการรัน (สคริปต์เขียนเอง): `logs/pm_reminders.log`
  `YYYY-MM-DD HH:MM:SS pm_reminders run=YYYY-MM-DD scanned=… notified_users=… claimed_cycles=… skipped_users=… errors=… cooldown_h=…`

## 7) Edge cases ที่ออกแบบรองรับ

| กรณี | พฤติกรรม |
|---|---|
| รันซ้ำภายใน 20 ชม. (redeploy/watchdog/กดมือ) | claim ได้ 0 → `skipped_duplicate` เพิ่ม, `users_notified = 0`, exit 0 (ไม่ถือว่า error) |
| `pm_am.status='overdue'` ถูก auto-flip ทุกครั้งที่ GET `/pm_am` (`pm_am.php`) | ไม่กระทบ dedupe เพราะยึด `last_notified_at` ไม่ใช่ status |
| `due_date IS NULL` | ไม่เข้าเงื่อนไขเดิมอยู่แล้ว → ไม่ถูกเตือน (เหมือนเดิม) |
| ผู้ใช้ไม่มีช่องทางแจ้งเตือนที่ตั้งค่าไว้ | `sendNotificationToUser()` best-effort อาจไม่ throw → นับ `users_notified` ทั้งที่ผู้ใช้ไม่ได้รับจริง (**ข้อจำกัดเดิมของระบบ**) — เฟส 2 ควรอ่านผลรายช่องทาง |
| งานถูกปิดระหว่างที่ส่ง (race) | ไม่เป็นไร: สถานะจริงใน DB ถูกต้อง, แค่มีข้อความเตือนเกิน 1 ฉบับ |
| 2 process รันพร้อมกัน | `UPDATE ... WHERE (last_notified_at IS NULL OR < :cutoff)` + `SELECT ... WHERE last_notified_at = :marker` — มีเพียงตัวเดียวที่ได้แถว |
| 2 process เริ่มในวินาทีเดียวกัน | `$marker` ระดับวินาทีอาจชนกัน; ยังปลอดภัยเพราะ claim UPDATE ตัวที่สองได้ 0 แถว (cutoff ผ่านไปแล้ว) และ `SELECT ... WHERE last_notified_at = :marker` ของตัวที่สองจะไม่เห็นแถวของตัวแรก (มันถูก claim ไปแล้ว) |
| ส่งไม่สำเร็จกลางชุด | release คืน `last_notified_at` เดิม/`notify_count - 1` เฉพาะแถวที่ marker ตรง → รอบถัดไปลองใหม่ |
| โค้ดใหม่รันบน schema เก่า | fallback：รันแบบไม่มี dedupe + `"dedupe": false` (§3.4) — ไม่ล่ม แต่ต้อง migrate เพื่อให้ dedupe ทำงานจริง |
| timezone | ใช้เวลา PHP (`date()`) ทั้งหมด รวมถึง cutoff และ marker |
| ตาราง `pm_am` ใหญ่ | index `idx_pm_am_reminder_scan (due_date, assigned_to, last_notified_at)` ช่วยกรณีสแกนรายวัน |

## 8) Rollback / ความปลอดภัย

- ทุกอย่าง additive: ไม่มี DROP/แก้ชนิดคอลัมน์เดิม/ไม่แตะข้อมูลธุรกิจ
- Rollback schema = `ALTER TABLE pm_am DROP COLUMN last_notified_at, DROP COLUMN notify_count, DROP KEY idx_pm_am_reminder_scan;`
- ถ้าโค้ดเวอร์ชันใหม่ถูกรันบน schema เก่า: query error `Unknown column` → **deploy schema ก่อนโค้ด**
- Backfill: **ไม่ต้องมี** — `NULL` = "ยังไม่เคยแจ้ง" ซึ่งถูกต้องสำหรับรอบที่มีอยู่แล้ว (รันครั้งแรกหลังเปิดใช้จะเตือนทุกคน 1 ครั้ง)

## 9) นอกขอบเขต (เฟส 2)

- dedupe รายช่องทาง (LINE / Email / Telegram / Push แยกกัน) ด้วย `pm_notification_log`
- เก็บ `last_notified_kind` แบบละเอียดใน log (ถ้าต้องการวิเคราะห์) — ไม่เก็บใน `pm_am` แล้ว
- สรุปสัปดาห์ (weekly digest) สำหรับผู้จัดการ, quiet hours, รวมกับ `notification_rules`
- ให้ผู้ใช้เลือกความถี่เตือนของตัวเอง (`/notifications/prefs`)

## 10) ลำดับงานถัดไป

1. ✅ ออกแบบ + implement helper (`pm_reminders_scan/group/claim/message/release/plan`) + สคริปต์ `--dry-run` ที่ไม่เขียน DB
2. ✅ ตัด `last_notified_kind` ออกจากดีไซน์/migration
3. ✅ ตรวจสภาพจริง + รัน migration บน `cmms_tpt` (2026-11-19): `last_notified_at datetime NULL`, `notify_count smallint unsigned NOT NULL DEFAULT 0`, index `idx_pm_am_reminder_scan (due_date, assigned_to, last_notified_at)`; `--dry-run` รายงาน `dedupe: true`
4. ✅ เพิ่ม reset `last_notified_at = NULL, notify_count = 0` ใน `public/api/v1/pm_am.php` PUT (§5)
5. ✅ ชุดทดสอบถาวรสำหรับกติกา reset: `php scripts/test_pm_reminders_reset.php` (33 checks — ครอบคลุม accept/auto-flip/closed→closed/ reopen/due_date/assigned_to) ไว้กัน regression
6. ✅ ทดสอบผ่าน HTTP จริง (`http://127.0.0.1:8081`, login + `X-CSRF-Token`, temp admin + รอบ PM สมมติ แล้วลบทิ้ง): `pending→in_progress` ไม่ล้างค่า, reopen จาก completed/skipped/cancelled ล้างค่า, due_date เปลี่ยนล้างค่า, ไม่มี token ได้ 403 (17/17)
7. ✅ ทดสอบบน scratch DB (`cmms_tpt_pmtest`, คัดลอกโครงสร้าง+ข้อมูลสมมติ, ลบทิ้งหลังจบ): migration รันจากไฟล์จริง, plan ไม่เขียน DB, claim ซ้ำใน cooldown ได้ 0, release คืนสิทธิ์, reset เปิดสิทธิ์ทันที, 2 process พร้อมกันได้รอบละครั้ง (17/17 checks)
8. ✅ ตั้ง Scheduled Task `CMMS-PMReminders` (รายวัน 07:30, `C:\PHP\php.exe scripts\pm_reminders.php`, principal `SYSTEM` → รันได้แม้ไม่มีคนล็อกอิน) — รันทดสอบได้ `LastTaskResult=0` และเขียน log `logs/pm_reminders.log` (`dedupe=1`)
