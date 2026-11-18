# คู่มือตั้ง cron / Task Scheduler สำหรับแจ้งเตือน PM (pm_reminders)

คู่มือนี้อธิบายวิธีเรียกงานแจ้งเตือนรอบ PM ที่ **เกินกำหนด/ถึงกำหนดวันนี้** แบบ best-effort โดยใช้สคริปต์ CLI ที่ใช้ตรรกะเดียวกับ API

## 1) ส่วนประกอบที่เกี่ยวข้อง
- **สคริปต์ (แนะนำสำหรับ cron):** `scripts/pm_reminders.php`
  - ใช้ helper ร่วม: `src/helpers/pm_reminders.php`
  - อ่าน DB ตามการตั้งค่าแอป (`src/config/db.php`/env ของระบบ) และส่งผ่าน `sendNotificationToUser`/ช่องทางที่ตั้งค่าไว้
  - **ไม่ mutate สถานะ PM** — dedupe ต่อรอบด้วย `pm_am.last_notified_at` + cooldown (settings `pm_reminder_cooldown_hours`, default 20 ชม.) ดู `docs/pm-reminders-dedupe-design.md`
- **API (ทางเลือกเมื่อเรียกผ่านเว็บ/ผู้ใช้ที่ล็อกอิน):** `POST /api/v1/pm_reminders.php` `{"action":"run"}` (**ต้อง login + CSRF**), `GET` เพื่อดูสรุป
  - พฤติกรรมการสแกน/ส่งเหมือนกัน (helper เดียวกัน)

## 2) ข้อกำหนดก่อนใช้งาน
- รันบนเครื่อง/เซิร์ฟเวอร์ที่เข้าถึงฐานข้อมูลของระบบได้ และมี PHP CLI
- ตั้งค่า env/การเชื่อมต่อ DB ให้เหมือนกับแอป (ตามวิธี deploy ของสภาพแวดล้อมนี้)
- ตั้งค่าและทดสอบช่องทางแจ้งเตือนจริง (LINE/Email/Telegram ฯลฯ) ใน settings/env ที่ระบบใช้ — **ห้ามแก้ไข/commit secrets ใน repo**
- ผู้รับแจ้งเตือน: สคริปต์แจ้งเฉพาะรอบที่ `assigned_to` มีค่า (ผู้รับผิดชอบรายบุคคล)

## 3) การรันด้วยมือ (ทดสอบ/ตรวจสอบ)
จาก root ของโปรเจกต์ (เช่น `C:\inetpub\wwwroot\cmms-tpt` หรือ path ที่ deploy ใช้งานจริง):

```bash
# ดูสรุปและรายการที่จะถูกแจ้ง โดยไม่ส่งจริง (แนะนำทดสอบก่อน)
php scripts/pm_reminders.php --dry-run

# ส่งแจ้งเตือนจริง (best-effort)
php scripts/pm_reminders.php

# จำกัดจำนวนรอบที่สแกน (ค่าเริ่มต้น 500, สูงสุดภายใน helper 2000)
php scripts/pm_reminders.php --limit=300
```

**Exit code:** `0` สำเร็จ (หรือส่งโดยไม่มี error ระดับ notify), `2` มี `notify_errors` บางส่วน, `1` ผิดพลาดรันสคริปต์  
**ผลลัพธ์:** พิมพ์ JSON สรุป (`summary`, `scanned_cycles`, `users_targeted`, `users_notified`, `skipped_duplicate`, `notified_cycles`, `cooldown_hours`, `notify_errors`) และเขียน 1 บรรทัดต่อการรันลง `logs/pm_reminders.log`

> หมายเหตุ: `--dry-run` ไม่เรียกส่งข้อความจริงและ**ไม่เขียน DB** — แสดง `users_would_notify`/`claimable_cycles`/`skipped_duplicate` ตามกติกา cooldown เดียวกับตอนรันจริง

## 4) ตัวอย่างตั้ง Cron (Linux)
แก้ crontab ของผู้ใช้ที่มีสิทธิ์รัน PHP และอ่าน env/config ของแอป:

```bash
# ทุกวัน 07:30 น. (เวลาตามเซิร์ฟเวอร์) — ปรับ path ให้ตรงสภาพแวดล้อม
30 7 * * * cd /path/to/cmms-tpt && /usr/bin/php scripts/pm_reminders.php >> /var/log/cmms-pm-reminders.log 2>&1
```

แนวทาง:
- รัน **วันละครั้ง** หรือความถี่ที่เหมาะสม — dedupe ต่อรอบกันการส่งซ้ำภายใน cooldown (20 ชม. ค่าเริ่มต้น) อยู่แล้ว
- ให้ `cd` ไปที่ root โปรเจกต์เพื่อให้ path/include และการโหลด config ทำงานถูกต้อง
- บันทึก log (stdout/stderr) เพื่อตรวจสอบ `notify_errors` และปัญหา env/DB
- หากเซิร์ฟเวอร์ใช้ timezone ต่างจากที่ต้องการ ให้ตั้งเวลา/`TZ` ให้สอดคล้องกับวันทำงานจริง

## 5) ตัวอย่างตั้ง Task Scheduler (Windows)
1. สร้าง Task ที่รันด้วยบัญชีที่มีสิทธิ์เข้าถึง DB และอ่าน env/config ของแอป
2. **Action:** Start a program
   - Program/script: `php` (หรือ path เต็มของ `php.exe`)
   - Arguments: `scripts/pm_reminders.php`
   - Start in: โฟลเดอร์ root ของโปรเจกต์ที่ deploy จริง (เช่น `C:\inetpub\wwwroot\cmms-tpt`)
3. **Trigger:** รายวันตามเวลาที่ต้องการ (เช่น 07:30)
4. (แนะนำ) เปิด log/History และเก็บ output ไปยังไฟล์ log เพื่อตรวจสอบผล

## 6) การตรวจสอบหลังตั้งค่า
- รัน `--dry-run` แล้วเทียบ `summary/scanned_cycles` กับข้อมูลรอบ PM จริง (เกินกำหนด/ถึงกำหนดวันนี้, มี `assigned_to`)
- รันส่งจริงครั้งแรกในช่วงทดสอบที่ยอมรับได้ และยืนยันผู้รับได้รับข้อความในช่องทางที่ตั้งค่า (LINE/Email/Telegram)
- หาก `users_notified` เป็น 0 ทั้งที่มีงาน: ตรวจ `last_notified_at` ของรอบนั้น (อาจอยู่ใน cooldown = `skipped_duplicate` > 0), `assigned_to`, สถานะ/วันครบกำหนด, และการตั้งค่าช่องทาง/สิทธิ์ส่งของระบบ
- ติดตาม log แอปสำหรับ `pm_reminders notify error` (error รายผู้ใช้จะถูก log และนับใน `notify_errors`)

## 7) ข้อควรระวัง
- การส่งจริงขึ้นกับ env/settings และความพร้อมของช่องทาง — สคริปต์เป็น best-effort
- การบันทึกว่า “รอบนี้แจ้งเมื่อไร” อยู่ใน `pm_am.last_notified_at`/`notify_count` — ถ้าต้องการเตือนถี่ขึ้นให้ลด `pm_reminder_cooldown_hours` (เช่น 10) ไม่ใช่เพิ่มความถี่ cron โดยไม่ดู cooldown
- ต้องรัน migration `database/migration_20261118_pm_reminders_dedupe_proposal.sql` (schema ก่อนโค้ด) ไม่งั้นสคริปต์จะ error เรื่องคอลัมน์หาย
- ห้ามใส่ token/secret ลงในคำสั่ง cron ที่ถูก commit หรือแชร์โดยไม่ปลอดภัย; ใช้ env/secret store ของระบบปฏิบัติการหรือกลไก deploy ที่มีอยู่
