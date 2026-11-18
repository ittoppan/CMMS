# PM Reminders — Dedupe Design (`pm_am.last_notified_at`)

สถานะ: **ออกแบบเท่านั้น (design only)** — ยังไม่รัน migration, ยังไม่แก้โค้ด, ยังไม่ตั้ง Scheduled Task
อ้างอิงโค้ดจริง: `src/helpers/pm_reminders.php`, `scripts/pm_reminders.php`, `public/api/v1/pm_reminders.php`, `public/api/v1/pm_am.php`
Migration ที่เกี่ยวข้อง (proposal ไม่รัน): `database/migration_20261118_pm_reminders_dedupe_proposal.sql`

---

## 1) พฤติกรรมปัจจุบัน (As-Is)

- `pm_reminders_run()` สแกน `pm_am` ที่ `status NOT IN ('completed','cancelled','skipped')` + `assigned_to > 0` + (overdue | pending & due ≤ วันนี้ | in_progress & due < วันนี้), จัดกลุ่ม**ตามผู้รับผิดชอบ** แล้วส่ง 1 ข้อความต่อคนต่อการรัน 1 ครั้ง
- **ไม่มี dedupe ใด ๆ** (ระบุไว้เองใน header ของ helper และใน `docs/pm-reminders-cron-setup.md` §7)
- ผลที่ตามมาเมื่อตั้ง Task รันวันละครั้ง:
  1. รันซ้ำ/กด `POST action=run` มือ/cron ยิงซ้ำหลัง deploy → ผู้รับได้ข้อความซ้ำทันที
  2. ไม่มีหลักฐานว่า "รอบนี้เคยเตือนเมื่อไร" → ตรวจสอบย้อนหลังไม่ได้ว่าใครได้รับการเตือน
  3. ถ้าอนาคตอยากได้สรุปสัปดาห์/เตือนเฉพาะรอบใหม่ จะแยกไม่ออกว่ารอบไหนแจ้งไปแล้ว

## 2) ทางเลือกที่พิจารณา

| ทางเลือก | ข้อดี | ข้อเสีย | สรุป |
|---|---|---|---|
| **A. คอลัมน์บนรอบ PM** (`pm_am.last_notified_at`) | ตรงกับขอบเขตที่ต้องการ (รอบ/วัน), ไม่เพิ่มตาราง, query เดิมแก้ 1 เงื่อนไข, ตรวจย้อนหลังได้รายรอบ | dedupe ระดับรอบ ไม่ได้แยกรายช่องทาง (LINE vs Email) | **เลือกใช้** |
| B. ตาราง log (`pm_notification_log`: cycle_id, user_id, channel, sent_at) | ละเอียดถึงช่องทาง, audit ครบ, ต่อยอด digest ได้ | เขียนเพิ่มทุกครั้ง, ต้องมี retention, งานมากกว่า | ทำต่อในเฟส 2 (ดู §9) |
| C. dedupe ระดับผู้ใช้/วัน | ง่ายที่สุด | รอบใหม่ที่โผล่ระหว่างวันจะไม่ถูกเตือน | ไม่ใช้ |
| D. ไม่ dedupe + พึ่งความถี่ cron | ไม่ต้องแก้ schema | ยังสแปมเมื่อมีการรันซ้ำ (redeploy, watchdog, กดมือ) | ไม่ใช้ |

## 3) ดีไซน์ที่เลือก — per-cycle + cooldown window

### 3.1 คอลัมน์ใหม่บน `pm_am` (additive ทั้งหมด)

| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| `last_notified_at` | `DATETIME NULL` | เวลาที่ส่งแจ้งเตือนรอบนี้สำเร็จครั้งล่าสุด — `NULL` = ยังไม่เคยแจ้ง |
| `last_notified_kind` | `ENUM('due_today','overdue') NULL` | ประเภทการเตือนครั้งล่าสุด (ตรวจย้อนหลัง/วิเคราะห์) |
| `notify_count` | `SMALLINT UNSIGNED NOT NULL DEFAULT 0` | จำนวนครั้งที่เตือนรอบนี้แล้ว (ใช้audit + กันลูปในอนาคต) |

### 3.2 กติกา dedupe

- **cooldown ไม่ใช่ "ครั้งเดียวตลอดชีวิต"**: งานเกินกำหนดต้องเตือนซ้ำทุกวันจนกว่าจะปิด จึงใช้หน้าต่างเวลา
- ค่าเริ่มต้น **20 ชั่วโมง** อ่านจาก settings key `pm_reminder_cooldown_hours` (ผ่าน `getSettingValue()` ใน `src/helpers/notification.php` ซึ่ง `pm_reminders.php` require อยู่แล้ว)
  - 20 ชม. < 24 ชม. → cron วันละครั้งเวลาเดิมผ่านทุกวันแน่นอน แม้เวลารันคลาดเคลื่อน ±2–4 ชม. หรือรอบก่อนรันช้า
  - ถ้าต้องการเตือนถี่ขึ้น (เช่น 2 ครั้ง/วัน) ตั้งเป็น `10`
- **cutoff คำนวณฝั่ง PHP** (`date('Y-m-d H:i:s', time() - $hours*3600)`) ไม่ใช้ `NOW()`/`INTERVAL` ใน SQL — เลี่ยงปัญหs timezone ของ MySQL กับ PHP ไม่ตรงกัน และทำให้เทสต์กำหนดเวลาได้
- รอบที่ `assigned_to IS NULL` ยังคงถูกข้ามเหมือนเดิม (ไม่มีผู้รับ)

### 3.3 Query ที่เปลี่ยน (เฉพาะเงื่อนไข dedupe)

เดิม:
```sql
WHERE status NOT IN ('completed','cancelled','skipped')
  AND assigned_to IS NOT NULL AND assigned_to > 0
  AND ( status='overdue'
     OR (status='pending'      AND due_date <= :t1)
     OR (status='in_progress'  AND due_date <  :t2) )
```
เพิ่ม:
```sql
  AND (last_notified_at IS NULL OR last_notified_at < :cutoff)
```
`pm_reminders_summary()` (GET) **ไม่ต้องใส่เงื่อนไข dedupe** — summary คือภาพรวมงานจริง ไม่ใช่สถานะการแจ้ง

## 4) ลำดับ claim → send → rollback (กันรันซ้อน)

cron กับ `POST action=run` (หรือ 2 คำขอพร้อมกัน) ต้องไม่ส่งซ้ำ ใช้การ **claim แบบ atomic** ก่อนส่ง:

```
1. SELECT ... (มีเงื่อนไข dedupe) → $rows  (เก็บ last_notified_at เดิมของแต่ละแถวไว้)
2. จัดกลุ่มตาม assigned_to
3. ต่อผู้ใช้หนึ่งคน:
   a. $nowClaim = date('Y-m-d H:i:s')
   b. UPDATE pm_am
        SET last_notified_at = :nowClaim,
            last_notified_kind = :kind,       -- overdue ถ้ามี overdue ในชุด, ไม่งั้น due_today
            notify_count = notify_count + 1
      WHERE id IN (:ids)
        AND (last_notified_at IS NULL OR last_notified_at < :cutoff)
      → $claimed = rowCount()
   c. ถ้า $claimed = 0 → คนอื่น claim ไปแล้ว: นับเป็น skipped_duplicate, ไม่ส่ง
   d. ส่ง sendNotificationToUser(...) ตามปกติ
   e. ถ้าส่ง throw → rollback เฉพาะแถวที่เราตั้ง:
        UPDATE pm_am SET last_notified_at = <ค่าเดิมจากข้อ 1>, notify_count = notify_count - 1
        WHERE id = :id AND last_notified_at = :nowClaim
      (เงื่อนไข `last_notified_at = :nowClaim` กันการทับค่าที่คนอื่นเพิ่งตั้ง)
      → นับ notify_errors เพื่อให้รอบถัดไปลองใหม่
```

หลักการ: **เขียนก่อนส่ง (claim) แล้ว rollback เมื่อส่งไม่สำเร็จ** — ถ้าเขียนหลังส่ง เคส "ส่งสำเร็จแต่ process ตายก่อนเขียน" จะทำให้ส่งซ้ำไม่จำกัด

## 5) จุดที่ต้อง Reset `last_notified_at` (ไม่งั้นจะเตือนช้าเกินควร)

| เหตุการณ์ | ทำอะไร | จุดแก้ |
|---|---|---|
| เลื่อนกำหนด (`due_date` เปลี่ยน / อนุมัติ `reschedule_to`) | `SET last_notified_at = NULL` | `public/api/v1/pm_am.php` PUT/PATCH (มี `due_date` ใน `$allowed`) — หลัง `UPDATE pm_am ... WHERE id = ?` สำเร็จ |
| กลับมาเปิดงาน (`status` เปลี่ยนเป็น `pending`/`in_progress` จาก completed/skipped/cancelled) | `SET last_notified_at = NULL` | จุดเดียวกัน (ตรวจ `$data['status']` ในเพย์โหลด) |
| เปลี่ยนผู้รับผิดชอบ (`assigned_to`) | `SET last_notified_at = NULL` | จุดเดียวกัน — ผู้รับใหม่ต้องได้เตือนของตัวเอง |
| รอบใหม่ถูกสร้างจากแผน (`generate` cycle) | ไม่ต้องทำอะไร (ค่าเริ่มต้น `NULL`) | — |

## 6) ผลลัพธ์ที่ API/สคริปต์ควรคืนเพิ่ม

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
- `skipped_duplicate` = จำนวนผู้ใช้ที่ถูกข้ามเพราะทุกรอบของเขาอยู่ใน cooldown
- `notified_cycles` = จำนวนรอบที่ถูก claim จริงในรอบรันนี้
- `--dry-run` ต้องคำนวณค่าเหล่านี้โดย**ไม่เขียนอะไรลง DB** (SELECT เดียวกัน + นับ) เพื่อเทียบก่อน/หลังเปิดใช้
- log 1 บรรทัดต่อการรัน: `pm_reminders run=YYYY-MM-DD scanned=… notified_users=… claimed_cycles=… skipped_users=… errors=…`

## 7) Edge cases ที่ออกแบบรองรับ

| กรณี | พฤติกรรม |
|---|---|
| รันซ้ำภายใน 20 ชม. (redeploy/watchdog/กดมือ) | ข้ามทั้งหมด → `users_notified = 0`, exit 0 (ไม่ถือว่า error) |
| `pm_am.status='overdue'` ถูก auto-flip ทุกครั้งที่ GET `/pm_am` (`pm_am.php:42-43`) | ไม่กระทบ dedupe เพราะยึด `last_notified_at` ไม่ใช่ status |
| `due_date IS NULL` | ไม่เข้าเงื่อนไขเดิมอยู่แล้ว → ไม่ถูกเตือน (เหมือนเดิม) |
| ผู้ใช้ไม่มีช่องทางแจ้งเตือนที่ตั้งค่าไว้ | `sendNotificationToUser()` best-effort อาจไม่ throw → นับ `users_notified` ทั้งที่ผู้ใช้ไม่ได้รับจริง (**ข้อจำกัดเดิมของระบบ** ไม่ใช่ของ dedupe) — เฟส 2 ควรอ่านผลรายช่องทาง |
| งานถูกปิดระหว่างที่ส่ง (race) | ไม่เป็นไร: สถานะจริงใน DB ถูกต้อง, แค่มีข้อความเตือนเกิน 1 ฉบับ |
| 2 process รันพร้อมกัน | `UPDATE ... WHERE (last_notified_at IS NULL OR < :cutoff)` เป็นตัวตัดสิน — มีเพียงตัวเดียวที่ `rowCount() > 0` |
| timezone | ใช้เวลา PHP (`date()`) ทั้งหมด รวมถึง cutoff; หลีกเลี่ยง `NOW()` ในเงื่อนไข dedupe |
| ตาราง `pm_am` ใหญ่ | index `idx_pm_am_reminder_scan (due_date, assigned_to, last_notified_at)` ช่วยกรณีสแกนรายวัน (ตารางปัจจุบันยังเล็ก — index นี้เพื่ออนาคต) |

## 8) Rollback / ความปลอดภัย

- ทุกอย่าง additive: ไม่มี DROP/แก้ชนิดคอลัมน์เดิม/ไม่แตะข้อมูลธุรกิจ
- Rollback = `ALTER TABLE pm_am DROP COLUMN last_notified_at, DROP COLUMN last_notified_kind, DROP COLUMN notify_count, DROP KEY idx_pm_am_reminder_scan;`
- ถ้าโค้ดเวอร์ชันใหม่ถูกรันบน schema เก่า: query จะ error `Unknown column` → ต้อง **deploy schema ก่อนโค้ด** (ลำดับ: migration → code)
- Backfill: **ไม่ต้องมี** — `NULL` มีความหมายว่า "ยังไม่เคยแจ้ง" ซึ่งถูกต้องสำหรับรอบที่มีอยู่แล้ว (รันครั้งแรกหลังเปิดใช้จะเตือนทุกคน 1 ครั้ง)

## 9) นอกขอบเขต (เฟส 2)

- dedupe รายช่องทาง (LINE / Email / Telegram / Push แยกกัน) ด้วย `pm_notification_log`
- สรุปสัปดาห์ (weekly digest) แทนการเตือนรายวันสำหรับผู้จัดการ
- quiet hours / รวมกับ `notification_rules`
- ให้ผู้ใช้เลือกความถี่เตือนของตัวเอง (`/notifications/prefs`)

## 10) ลำดับงานถัดไป (หลังอนุมัติดีไซน์นี้)

1. ตรวจสภาพจริงแบบ read-only: `SHOW COLUMNS FROM pm_am;` (ยืนยันว่ายังไม่มีคอลัมน์เหล่านี้)
2. รัน proposal migration (`database/migration_20261118_pm_reminders_dedupe_proposal.sql`) บน staging → ตรวจ `SHOW CREATE TABLE pm_am`
3. แก้ `src/helpers/pm_reminders.php`: query + claim/rollback + คืนค่า fields ใหม่ (§4, §6)
4. แก้ `scripts/pm_reminders.php` (`--dry-run` นับ skipped) และ `public/api/v1/pm_reminders.php` (`force=1` สำหรับ admin ถ้าต้องการข้าม dedupe)
5. เพิ่ม reset ใน `public/api/v1/pm_am.php` (§5)
6. ทดสอบ: `php scripts/pm_reminders.php --dry-run` → 2 ครั้งติดกันต้องได้ `skipped_duplicate` เพิ่มขึ้นครั้งที่สอง; ทดสอบ 2 process พร้อมกัน
7. **จึงตั้ง Scheduled Task** `CMMS-PMReminders` (รายวัน 07:30, `-ExecutionPolicy Bypass`, `Start in` = project root) + log ไป `logs/pm_reminders.log`
