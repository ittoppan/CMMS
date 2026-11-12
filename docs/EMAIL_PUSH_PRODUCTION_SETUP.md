# Email + PWA Push Production Setup (CMMS-TPT)

คู่มือนี้สรุปขั้นตอนการตั้งค่าแจ้งเตือนหลัก 2 ช่องทาง: **Email (SMTP)** และ **Web Push ผ่าน PWA (Browser)**

## 1) ข้อกำหนดเบื้องต้น
- ระบบเข้าถึงผ่าน **HTTPS** (แนะนำสำหรับ Production) เพื่อให้ Web Push/Service Worker ทำงานได้เต็มรูปแบบ (localhost ใช้ทดสอบได้)
- ผู้ใช้มีอีเมลที่ถูกต้องในระบบ และอนุญาตการแจ้งเตือนบนเบราว์เซอร์/อุปกรณ์ที่ใช้งาน
- มีสิทธิ์ Admin ในการตั้งค่า SMTP, Push, และ Scheduler

## 2) ตั้งค่า Email (SMTP)
ไปที่หน้าตั้งค่าระบบ (`/settings`) และกำหนดค่า:

| Key | ค่าแนะนำ/คำอธิบาย |
|---|---|
| `email_notify_enabled` | `1` เปิดการแจ้งเตือนทางอีเมล |
| `smtp_enabled` | `1` ใช้ SMTP |
| `smtp_host` | โฮสต์ SMTP (เช่น `smtp.office365.com`, `smtp.gmail.com`) |
| `smtp_port` | `587` (STARTTLS) หรือ `465` (SSL) |
| `smtp_encryption` | `tls` หรือ `ssl` |
| `smtp_user` | บัญชี/อีเมลผู้ส่ง |
| `smtp_pass` | รหัสผ่านหรือ App Password (เก็บเป็นความลับ) |
| `smtp_from_email` | อีเมลผู้ส่งที่แสดง |
| `smtp_from_name` | ชื่อผู้ส่ง (เช่น `CMMS-TPT`) |

**ตรวจสอบ:**
- ผู้รับมี `users.email` ถูกต้องและบัญชี active
- ทดสอบส่งและตรวจ inbox/spam รวมถึง `notification_logs`

## 3) ตั้งค่า Web Push (PWA)
- ตั้ง `push_alert_enabled` = `1`
- VAPID keys (`vapid_public_key`, `vapid_private_key`) จะถูกสร้าง/จัดการอัตโนมัติเมื่อใช้งาน Push subscribe (`WebPushService`)
- ผู้ใช้แต่ละคนต้องเข้า `/settings/push` บนอุปกรณ์ที่ใช้ แล้วกด **เปิดการแจ้งเตือน** และอนุญาตในเบราว์เซอร์
- **iOS:** ต้องติดตั้ง PWA (Add to Home Screen) และเปิดผ่านไอคอนแอปก่อนจึงรับ Push ได้
- ทดสอบด้วยปุ่ม "ส่งข้อความทดสอบถึงฉัน" ใน `/settings/push`

**ไฟล์ที่เกี่ยวข้อง:** `frontend/public/sw.js`, `frontend/public/manifest.webmanifest`, `public/api/v1/push_subscribe.php`, `src/services/WebPushService.php`

## 4) ตั้ง Scheduler (แจ้งเตือนอัตโนมัติ)
ตั้ง Windows Task Scheduler/cron ให้รันสคริปต์ตามรอบเวลา:

- `php scripts/alert_check.php` — PM ใกล้กำหนด/เกินกำหนด, สต็อกต่ำ, งานด่วนค้าง (escalation), SLA overdue (`sla_overdue_alert`)
- `php scripts/notification_engine.php` — ประมวลผลกฎแจ้งเตือนตามระบบ
- `php scripts/daily_summary.php` — สรุปรายวัน (ถ้าเปิดใช้)
- `php scripts/report_scheduler.php` — รายงานตามกำหนด (ถ้าเปิดใช้)

**การตั้งค่าที่เกี่ยวข้อง:** `escalation_alert`, `escalation_hours`, `sla_overdue_alert`, `push_alert_enabled`, `email_notify_enabled`, `maintenance_alert_days`, `low_stock_alert`

## 5) ความเสถียรและการตรวจสอบ
- รัน Next.js/API แบบมี auto-restart (Windows Service หรือ Scheduled Task เรียก `scripts/ensure-next.ps1`)
- ตรวจสุขภาพหลัง deploy:  
  `BASE_URL=https://<host> SESSION_COOKIE='<PHPSESSID=...>' bash scripts/smoke-check.sh`
- ตรวจ `notification_logs` และ application logs เมื่อส่งไม่สำเร็จ
- ตั้ง backup DB/ไฟล์อัปโหลด และทดสอบการกู้คืนเป็นระยะ

## 6) Checklist สั้นๆ
- [ ] HTTPS ใช้งานได้, PWA ติดตั้ง/เปิดได้
- [ ] SMTP ตั้งค่าถูกต้องและส่งอีเมลทดสอบผ่าน
- [ ] Push เปิดใช้งาน, VAPID พร้อม, ผู้ใช้ subscribe และรับทดสอบได้
- [ ] Scheduler รัน `alert_check.php`/`notification_engine.php` ตามรอบ
- [ ] Smoke check ผ่าน, ไม่มี error สำคัญใน logs
- [ ] Backup/restore และสิทธิ์ผู้ใช้ตรวจสอบแล้ว
