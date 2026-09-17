# ADMIN RUNBOOK — CMMS-TOPPAN

สำหรับผู้ดูแลระบบ (role 1). หน้าที่ประจำวัน/รายเดือน + คำสั่งหลัก. ใช้คู่กับ `INCIDENT_RESPONSE.md` (เหตุการณ์) และ `DEPLOYMENT.md` (ปล่อยรุ่น).

## 1. งานประจำวัน (ถ้าเปิดใช้งานจริง)
- ดู `logs/backup.log` + `logs/watchdog.log` ว่าวันก่อน 02:30 backup สำเร็จ, watchdog รีสตาร์ตอะไรบ้าง
- ดู `logs/php-error.log` (ใหม่เริ่ม 17/09) เติบโต หรือมี warning ใหม่
- `GET https://<host>/api/health.php` → 200 `{status:"ok",db:"ok"}`
- สายตา: ดิสก์ว่าง (ดู <5GB)

## 2. งานประจำสัปดาห์/รายเดือน
- ลอง restore test 1 ครั้ง/เดือน (ดู `docs/DATABASE_RECOVERY.md` §6) — เคยทำครั้งแรก 17/09/2026 (ผ่าน)
- copy backup ออกนอกเครื่องอย่างน้อยสัปดาห์ละครั้ง (ไฟล์ + DB อยู่เครื่องเดียว)
- ตรวจ user list: ผู้ใช้ที่ไม่ได้ใช้ 90 วัน → จัดการ; ตรวจ `audit_logs` (แอป) มีเหตุการณ์แปลกไหม
- ตรวจการ unique ของ master data (duplicate) ตามเกณฑ์ QA (0 ตัวในตอนนี้)
- review `FUTURE_BACKLOG.md` + จัด priority items กับทีม

## 3. ผู้ใช้ / Role
- Role ตาม `src/helpers/permissions.php`: 1 Admin, 2 Manager, 3 Technician (=label "Operate" ในตาราง), 4 Operator, 5 Viewer, 6 ASST Manager, 7 Foreman — **การให้สิทธิ์ดูผ่าน UI "Users"** เทียบกับ role matrix ก่อนกด
- ข้อควรระวัง: ปัจจุบันมี **2 users เท่านั้น** (`E01117` Admin — ใช้ร่วมกันในเทสต์, `E00111` ยังไม่มี role) — ต้องสร้างบัญชีจริง + ตั้งรหัสส่วนตัว **ก่อน** เปิดให้ผู้ใช้จริง (`GO_LIVE_PLAN.md` B-2)
- ห้ามให้ใคร login ใช้บัญชี Admin ร่วมกันในการทำงานจริง

## 4. Settings (ตาราง `settings`, 113 rows)
- ผ่าน UI Settings (theme, timeout, ชั่วโมงทำงาน, ค่าธีม ฯลฯ) — พนักงานอดอย่าไปแก้ตรง DB
- รายการสำคัญ: `site_name`, `default_timezone`, ชั่วโมงทำงาน, notification channels
- `sage300_*` **ไม่ใช่ keys ใน settings** — Sage ตั้งผ่าน `.env` (env เท่านั้น)

## 5. Backup / Restore (quick)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-task.ps1          # ทำทันที
Get-ChildItem C:\inetpub\wwwroot\cmms-tpt\backups -Filter '*.sql.gz' | Sort-Object LastWriteTime -Descending | Select-Object -First 3
# restore: ดู docs/DATABASE_RECOVERY.md (ทดสอบแล้ว)
```

## 6. Next.js / Node service
- Fix/restart: Scheduled Task `CMMS-NextJS` หรือ script `scripts/nextjs-service.ps1 start`
- Rebuild ใหม่: `powershell -ExecutionPolicy Bypass -File scripts/deploy-next.ps1`
- ตรวจว่า port 3001 respond: `curl http://localhost:3001/health`

## 7. PHP / IIS ním
- php.ini: `C:\PHP\php.ini` (สำเนาเดิม = `C:\PHP\php.ini.bak21` ตั้ง 17/09) — เปลี่ยนแล้วต้อง **Restart-WebAppPool cmms-tpt** ก่อนมีผล
- FastCGI: activityTimeout 60 / requestTimeout 180 (ตั้ง 17/09) — ปรับได้ใน applicationHost.config
- เปิด/ปิดเว็บ: IIS Manager → Sites → `cmms-tpt` (bind http:8081 + https:443 หลังติดตั้ง cert)

## 8. การแจ้งเตือนขาเข้า (LINE/Telegram)
- LINE Notify/Webhook + Telegram bot token อยู่ใน `.env` (ห้าม commit) — ถ้าแจ้งไม่เด้ง ดู `logs/` ที่เกี่ยวกับ notify + `notifications`/`alert` ก่อน
- ตรวจ `settings` «notification enabled» + channel config ใน UI

## 9. รายละเอียดอื่นๆ ที่พบบ่อย
- `images/uploads` อัปโหลด ~8.7MB/71 ไฟล์ — จัดการไฟล์เก่าตาม policy (ดู retention)
- ถ้า XAMPP `mysqld` บังพอร์ต 3306: `net stop mysql` ไม่เกี่ยวกับเราจริง (MySQL80 เท่านั้น) — ล้าง XAMPP ออกเป็น FUTURE (I-8)