# Production Readiness — Scheduler, Recipients, Push, Backup

คู่มือเตรียมความพร้อมก่อนใช้งานจริง (ops) สำหรับ CMMS-TOPPAN  
ใช้คู่กับ `docs/ADMIN_RUNBOOK.md`, `docs/DATABASE_RECOVERY.md`, `docs/DEPLOYMENT.md`, `docs/INCIDENT_RESPONSE.md`

> หมายเหตุ: งานในเอกสารนี้ทำบน **เซิร์ฟเวอร์/เครื่องที่รันระบบจริง** (IIS + PHP + MySQL + Next.js) ไม่สามารถทำให้เสร็จจากโค้ดเพียงอย่างเดียวได้ ต้องมีสิทธิ์ผู้ดูแลเครื่อง/ผู้ดูแลระบบ และข้อมูลจริง (ผู้รับแจ้งเตือน, อุปกรณ์, กุญแจ)

---

## 0) สิ่งที่ต้องพร้อมก่อนเริ่ม

- โค้ด deploy เป็นรุ่นล่าสุดและ build ผ่าน (pre-push hook/build ตามกระบวนการเดิม)
- PHP CLI ใช้งานได้ และชี้ฐานข้อมูลถูกต้อง (อ่าน `.env` เดียวกับเว็บ) — ทดสอบ: `php -v` และรันสคริปต์ด้วย `--dry`/`--force` ตามที่รองรับ
- `.env` และค่าลับ (DB, Sage DSN, LINE, Telegram, VAPID/push ถ้ามี) เก็บนอก repo และสำรองแยก (ดูหัวข้อ Backup)
- ระบบเข้าถึงผ่าน **HTTPS** หากต้องใช้ Web Push/PWA บนอุปกรณ์จริง (โดยเฉพาะ iOS)
- มีบัญชีผู้ใช้จริง แยกสิทธิ์ตาม role (ห้ามใช้บัญชี Admin ร่วมกัน) และผูกข้อมูลติดต่อผู้รับแจ้งเตือน

ทดสอบสุขภาพระบบก่อน/หลังตั้งค่า:
```powershell
# ปรับ host/port ให้ตรงเครื่องจริง
curl.exe -sS http://localhost:8081/api/health.php
curl.exe -sS http://localhost:3001/
```

---

## 1) ตั้งเวลา (Windows Task Scheduler) — สคริปต์แจ้งเตือน/รายงาน

สคริปต์อยู่ใน `scripts/` และออกแบบให้รันจาก CLI (`php ...`). ให้ตั้ง **Start in / Working directory** เป็น root ของโปรเจกต์ (เช่น `C:\inetpub\wwwroot\cmms-tpt`) เพื่อให้ `require` path และ `.env` ทำงานถูกต้อง

| สคริปต์ | หน้าที่ (สรุป) | ตัวเลือก | ความถี่ที่แนะนำ (ปรับตามนโยบาย) |
|---|---|---|---|
| `scripts/alert_check.php` | แจ้ง PM ใกล้/เกินกำหนด + สต็อกต่ำ (มี dedup 24 ชม.) | `--force` ข้าม dedup (ทดสอบ) | วันละ 1 ครั้ง (เช่น 07:30) |
| `scripts/notification_engine.php` | Engine รวม: PM, low stock, SLA, escalation, calibration, inspection, retry การส่งค้าง + rule/dedup/delay | `--force`, `--module=pm,low_stock,sla,escalation,calibration,inspection,retry` | ทุก 5–15 นาที (หรือวันละหลายรอบตาม SLA ที่ต้องการ) |
| `scripts/daily_summary.php` | สรุปเช้ารายวัน (ส่งเมื่อ `settings.daily_summary_enabled = 1`, dedup รายวัน) | `--force` ส่งซ้ำ | วันละ 1 ครั้ง (เช่น 08:00) |
| `scripts/report_scheduler.php` | ส่งรายงานตามกำหนดใน `settings.scheduled_reports` (daily/weekly/monthly + เวลา) มี dedup ต่อ period | `--force`, `--id=N`, `--dry` | ทุก 5 นาที (สคริปต์ตัดสินเองว่ารายการใดถึงเวลา) |

> `alert_check.php` และ `notification_engine.php` มีความซ้อนทับบางส่วน (PM/สต็อก) — เลือกใช้อย่างใดอย่างหนึ่งเป็นหลัก หรือรันร่วมกันโดยยอมรับ dedup/ปริมาณข้อความที่เหมาะสมกับ org (แนะนำ: เปิด `notification_engine` เป็นตัวหลัก + ปรับ rule/ช่องทาง แล้วค่อยตัดสินใจเรื่อง `alert_check`/`daily_summary` ไม่ให้ผู้รับถูกสแปม)

### ตัวอย่างสร้าง Task ด้วย `schtasks` (PowerShell — รันในฐานะผู้ดูแล)

ปรับค่า `PHP`, `APP`, เวลา และผู้ใช้ที่รัน task (`/RU`) ให้ตรงเครื่องจริง (ผู้ใช้ต้องอ่านโปรเจกต์และ `.env` ได้)

```powershell
$PHP = "C:\PHP\php.exe"                 # ปรับ path PHP CLI
$APP = "C:\inetpub\wwwroot\cmms-tpt"    # ปรับ path โปรเจกต์

# 1) alert_check — ทุกวัน 07:30
schtasks /Create /TN "CMMS-AlertCheck" /F `
  /SC DAILY /ST 07:30 `
  /TR "cmd /c cd /d $APP && \"$PHP\" scripts\alert_check.php >> logs\task_alert_check.log 2>&1" `
  /RU "SYSTEM"

# 2) notification_engine — ทุก 10 นาที (ทั้งวัน)
schtasks /Create /TN "CMMS-NotificationEngine" /F `
  /SC MINUTE /MO 10 `
  /TR "cmd /c cd /d $APP && \"$PHP\" scripts\notification_engine.php >> logs\task_notification_engine.log 2>&1" `
  /RU "SYSTEM"

# 3) daily_summary — ทุกวัน 08:00 (ต้องเปิด daily_summary_enabled = 1 ใน settings)
schtasks /Create /TN "CMMS-DailySummary" /F `
  /SC DAILY /ST 08:00 `
  /TR "cmd /c cd /d $APP && \"$PHP\" scripts\daily_summary.php >> logs\task_daily_summary.log 2>&1" `
  /RU "SYSTEM"

# 4) report_scheduler — ทุก 5 นาที (ตัวสคริปต์เช็ก due เอง; กำหนดรายงานสร้างผ่าน UI/API)
schtasks /Create /TN "CMMS-ReportScheduler" /F `
  /SC MINUTE /MO 5 `
  /TR "cmd /c cd /d $APP && \"$PHP\" scripts\report_scheduler.php >> logs\task_report_scheduler.log 2>&1" `
  /RU "SYSTEM"
```

ตรวจสอบ/รันทดสอบ:
```powershell
schtasks /Query /TN "CMMS-NotificationEngine" /V /FO LIST
schtasks /Run /TN "CMMS-AlertCheck"

# ทดสอบจาก CLI (ข้าม dedup เฉพาะตอนตรวจสอบ)
php scripts/alert_check.php --force
php scripts/notification_engine.php --module=pm,sla --force
php scripts/daily_summary.php --force
php scripts/report_scheduler.php --dry
```

### Checklist หลังตั้ง Scheduler
- [ ] Task แต่ละตัวมี **Start in = root โปรเจกต์** และรันด้วยผู้ใช้ที่อ่าน `.env`/เขียน log ได้
- [ ] โฟลเดอร์ `logs/` มีอยู่และเขียนได้; ตรวจ log ที่ redirect (`logs/task_*.log`) ว่าไม่มี fatal error
- [ ] เวลาเครื่อง/Timezone ตรงกับที่คาด (PHP `date.timezone`, MySQL time, Windows time)
- [ ] ทดสอบ `--force`/`--dry` แล้วผลลัพธ์ตรง (จำนวนรายการ, ผู้รับ, ช่องทาง) ก่อนเปิดใช้งานจริง
- [ ] กำหนดความถี่ไม่ถี่เกินจนสร้างการแจ้งเตือนซ้ำ/สแปมผู้รับ (โดยเฉพาะเมื่อเปิดหลายสคริปต์พร้อมกัน)

---

## 2) ผูกผู้รับแจ้งเตือนและช่องทาง

### 2.1 อีเมล (SMTP + ผู้รับ)
- ตั้งค่า SMTP ในระบบ (ตาราง `settings` / หน้าตั้งค่าที่เกี่ยวข้อง) — เก็บ credential ในที่ที่นโยบายกำหนด ห้าม commit ลง repo
- ทดสอบส่งอีเมลจากฟังก์ชันทดสอบ/สคริปต์ที่มีให้ และยืนยันปลายทางได้รับจริง (รวมโฟลเดอร์ spam/quarantine)
- **ผูกผู้รับจริง:** ตรวจว่าผู้ใช้/บทบาทที่ควรได้รับแจ้งเตือนมีอีเมลถูกต้องในข้อมูลผู้ใช้ (`users`/โปรไฟล์) และถูกเลือกเป็นผู้รับตามกฎที่ระบบใช้ (เช่น ผู้รับผิดชอบงาน, supervisor, กลุ่มรายงานตามกำหนด) — อย่าพึ่งพาอีเมลทดสอบเพียงอย่างเดียว
- รายงานตามกำหนด (`report_scheduler.php`) ใช้ config ใน `settings.scheduled_reports` (สร้าง/แก้ผ่าน `/api/v1/report_schedule.php` หรือ UI ที่เชื่อม) — ตรวจช่องทาง/ผู้รับในแต่ละรายการ

### 2.2 LINE / Telegram
- เก็บ token/credential ใน `.env` หรือ settings ตามที่ระบบกำหนด **ห้าม commit**
- LINE: โควต้า/ข้อจำกัดแผนอาจทำให้ส่งไม่ถึง (เช่น 429) — ติดตาม `notification_logs`/log ที่เกี่ยวข้อง และพิจารณาลดปริมาณหรืออัปเกรดแผน
- Telegram: ตั้ง `${TELEGRAM_BOT_TOKEN}` / `${TELEGRAM_CHAT_ID}` เฉพาะที่ใช้งานจริง และทดสอบส่งข้อความหนึ่งครั้งก่อนเปิด automation

### 2.3 Web Push / PWA (อุปกรณ์ผู้ใช้)
- ผู้ใช้ต้อง **สมัครรับ (subscribe)** เองจากหน้าตั้งค่าแจ้งเตือนบนอุปกรณ์: `/settings/push` (และตรวจแท็บ Push ใน `/settings/notifications` ตามที่ UI มี) — การตั้งค่าฝั่งเซิร์ฟเวอร์อย่างเดียวไม่พอ
- ต้องเข้าผ่าน **HTTPS (secure context)**; localhost ใช้ทดสอบได้ตามข้อจำกัดเบราว์เซอร์ แต่การใช้งานจริงบนมือถือควรเป็นโดเมน HTTPS
- **iOS/iPadOS:** Web Push ใช้ได้เมื่อผู้ใช้ “เพิ่มไปยังหน้าจอโฮม” (ติดตั้ง PWA) และอนุญาตการแจ้งเตือน ตามเวอร์ชัน OS/เบราว์เซอร์ที่รองรับ — ต้องทดสอบบนอุปกรณ์จริง
- ตรวจว่า service worker/manifest และสิทธิ์แจ้งเตือนของเบราว์เซอร์ได้รับอนุญาต; ถ้าส่งไม่ถึงให้ดู retry/cสถานะในระบบ notification (เช่น `notification_deliveries` ที่ engine ประมวลผล) และ log ฝั่ง client/server

### 2.4 รายการตรวจสอบผู้รับ
- [ ] ผู้ใช้ที่เกี่ยวข้อง (ช่าง, หัวหน้างาน, ผู้จัดการ, คลัง) มีอีเมล/LINE ID/สิทธิ์รับ push ถูกต้อง
- [ ] เปิด/ปิด toggle ที่เกี่ยวข้อง (เช่น `daily_summary_enabled`, low stock, PM alert days, กฎแจ้งเตือน) ตรงนโยบาย
- [ ] ทดสอบ end-to-end อย่างน้อย 1 เคสต่อช่องทาง: trigger → สร้างเหตุการณ์ → ผู้รับได้รับจริง → dedup ไม่กลืนเคสถัดไปที่ควรส่ง

---

## 3) Backup และการกู้คืน

อ่านรายละเอียดและขั้นตอน restore ที่ทดสอบแล้วใน `docs/DATABASE_RECOVERY.md` และแนวทาง deploy ใน `docs/DEPLOYMENT.md`

สคริปต์/กลไกที่มีใน repo:
- `scripts/backup-task.ps1`, `scripts/backup.sh` — สำรอง DB (+ uploads ตามสคริปต์) ไปที่ `backups/` (มี retention/rotation ตามที่สคริปต์กำหนด)
- ตัวอย่าง Task Scheduler: `CMMS-Backup` (ดู `docs/DATABASE_RECOVERY.md`, `docs/ADMIN_RUNBOOK.md`)

### Checklist
- [ ] Task สำรองข้อมูลรันสำเร็จตามรอบ และตรวจ `logs/backup.log` / ผลลัพธ์ใน `backups/` เป็นประจำ
- [ ] **สำรองนอกเครื่อง:** คัดลอก backup (DB + uploads) ออกนอกเครื่อง/ที่เก็บอื่นอย่างน้อยสัปดาห์ละครั้ง (ไฟล์ backup อยู่เครื่องเดียวกับ DB มีความเสี่ยงหายพร้อมกัน)
- [ ] `.env` และค่า config ภายนอก (IIS/cert, Task Scheduler export, LINE/Telegram/VAPID) สำรองแยก — ไม่อยู่ใน backup ชุดมาตรฐาน
- [ ] **ซ้อมกู้คืน (restore test)** อย่างน้อยครั้งแรกและตามรอบ (รายเดือน/รายไตรมาส): กู้คืนลงฐานทดสอบ/ชื่อชั่วคราว → ตรวจจำนวนตาราง/เรกคอร์ดสำคัญ/ภาษาไทย → เปิดเว็บทดสอบ smoke → บันทึกผล (ห้ามทับฐาน production ตอนซ้อม)
- [ ] พื้นที่ดิสก์เพียงพอ (backup + log โตต่อเนื่อง) และมีการแจ้งเตือน/ตรวจ threshold

---

## 4) ตรวจสอบก่อนเปิดใช้งานจริง (แนะนำทำกับข้อมูล/staging ใกล้จริง)

รายการเหล่านี้เคยถูกระบุว่ายังไม่ได้ทดสอบ E2E กับข้อมูล production — ควรตรวจให้ผ่านก่อน go-live:

- [ ] **RCA closure gate / failure events:** ปิดงานซ่อมที่ผูก RCA ได้เฉพาะเมื่อเงื่อนไขครบ และ filter `repair_id` ถูกต้อง (ดู `src/helpers/failure.php`, `public/api/v1/repair.php`, `supervisor.php`)
- [ ] **PM ตามมิเตอร์ (CBM):** generate รอบเมื่อค่ามิเตอร์ถึงเป้า, ไม่สร้างรอบซ้ำเมื่อมีรอบค้าง, ปิดงานบันทึก `meter_reading`/baseline ถูกต้อง, หน่วย (`meter_unit`/`parameter`) จับคู่กับ `asset_measurements` ตรงตามที่ตั้งในแผน
- [ ] **CBM UI:** การ์ดรายเครื่อง (`/asset_registry/view`) และการ์ดรวมทั้งโรงงาน (`/pm_am/plans`) แสดงสถานะถูกต้อง, ปุ่ม “สร้างรอบ PM” สร้างรอบได้จริง (CSRF ผ่าน), ลิงก์เปิดรอบ/แผนถูกต้อง
- [ ] **Dashboard drill-down:** การ์ด PM ลิงก์ไป `/dashboard/list?action=pm&group=...` ถูกกลุ่ม (on_time/late/overdue/completed ฯลฯ) และตัวเลขสอดคล้องกับรายการ
- [ ] **สิทธิ์การเข้าถึง:** ทดสอบ role หลัก (Admin/Manager/Technician/ฯลฯ) ว่าเห็นเมนู, สร้าง/แก้/ปิดงาน และดูข้อมูลต้นทุน/รายงานตามสิทธิ์
- [ ] **PWA/Push:** subscribe บน HTTPS, ได้รับแจ้งเตือนจริงบนอุปกรณ์เป้าหมาย (รวมกรณี iOS ที่ติดตั้งเป็น PWA)

บันทึกผลการทดสอบ (วันที่, ผู้ทดสอบ, ชุดข้อมูล, ผ่าน/ไม่ผ่าน, ประเด็นค้าง) ไว้เป็นหลักฐาน rollout

---

## 5) อ้างอิงไฟล์ที่เกี่ยวข้อง

- สคริปต์: `scripts/alert_check.php`, `scripts/notification_engine.php`, `scripts/daily_summary.php`, `scripts/report_scheduler.php`, `scripts/backup-task.ps1`, `scripts/backup.sh`
- เอกสาร: `docs/ADMIN_RUNBOOK.md`, `docs/DATABASE_RECOVERY.md`, `docs/DEPLOYMENT.md`, `docs/INCIDENT_RESPONSE.md`
- UI/ตั้งค่า: `/settings/notifications`, `/settings/push`, `/settings/pwa`, หน้าจัดการผู้ใช้/สิทธิ์ และหน้ารายงานตามกำหนด (ถ้ามีในเมนูระบบ)
- API/logic แจ้งเตือน: `src/services/NotificationService.php`, `src/services/NotificationCenterService.php`, `src/helpers/notification.php`, `public/api/v1/report_schedule.php`
