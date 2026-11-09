# INCIDENT RESPONSE — CMMS-TOPPAN

ขั้นตอนเมื่อมีเหตุ. ก่อนอื่นเสมอ: **มอง log ก่อน — อย่าพึ่งรีสตาร์ตแบบสุ่ม**.
ลำดับ log: `logs/php-error.log` → `logs/watchdog.log` → `logs/backup.log` → IIS log `C:\inetpub\logs\LogFiles\*`.

ขั้นตอนร่วมทุกเหตุการณ์:
1. กำหนด severity / หยุดใช้หรือไม่ (ถ้ากระทบข้อมูล)
2. ตัวอย่าง: `curl http://localhost:8081/api/health.php` เอา status, `curl http://localhost:3001/health`
3. ถ้ายังไม่เข้าใจ → restore point ล่าสุด `backups/*.sql.gz` + DELETE/rollback แบบ forward-fix
4. บันทึกใน runbook/issue + แจ้งผู้ใช้ผ่าน LINE group admin (ถ้าสมัคร)
5. ติดตาม 30 นาทีแรก

## 1. App ลง (เว็บเปิดไม่ได้ — HTTP 500/timeout)
- ดู 500 → PHP stderr กลายจาก `ReturnStdErrIn500` → อ่าน `logs/php-error.log`/watchdog
- ดู app pool: `Get-WebAppPoolState -Name cmms-tpt`; ถ้า Stopped → `Start-WebAppPool` / restart
- IIS log ล่าสุด error code? 502/504 → FastCGI dropped (ดู activityTimeout 60 / requestTimeout 180) หรือ PHP crash
- ถ้า PHP ฮาร์ด (fastcgi) → `iisreset /restart` แล้วตรวจ back
- ถ้า Node ฝั่ง: task `CMMS-NextJS` หรือ `scripts/nextjs-service.ps1 start`; `curl localhost:3001/health`
- Baseline เวลา (ดู PERFORMANCE_BASELINE) — ถ้าแค่ช้า, ดูโค้ด query/load ก่อน

## 2. DB ลง / ข้อมูลเสีย (corruption)
- health → `db:ok`? ถ้าไม่: ตรวจ `Get-Service MySQL80` / `netstat 3306`
- สำรองปัจจุบัน: `scripts/backup-task.ps1` → เอา dump ล่าสุดเพื่อวิเคราะห์ (ไม่ทับข้อมูลปัจจุบัน)
- Restore ตาม `docs/DATABASE_RECOVERY.md` §5 (ขั้นตอนทดสอบแล้ว)
- ถ้าข้อมูลเสีย ต้อง restrictive: หยุด app pool ชั่วคราว → restore → smoke → เปิดใช้
- หลัง restore: แจ้งผู้ใช้ที่ทำ transaction ระหว่าง window ว่า data อาจหาย (ตามระยะ backup ล่าสุด 02:30)

## 3. Sage 300 ไม่พร้อมใช้งาน (DSN fall)
- symptom: `sage_items` หน้าอะไหล่ error/timeout, stock แสดงไม่มา
- ตรวจ: env DSN/company ถูกไหม, ODBC ต้อง ping ได้, sage server up
- CMMS มี graceful path: ถ้า Sage ไม่ตอบ → หน้าอะไหล่ควรทำงานต่อโดย stock ไม่อัปเดต/แสดง placeholder **ห้าม** แสดงตัวเลข stock มั่วขึ้นมาเอง (design: source of truth = Sage)
- fallback: ใช้งาน offline (ใบเบิกเก็บ queue) แล้ว syncing เมื่อ Sage กลับ

## 4. Mass sync failure (queue/IndexedDB ไม่ flush ตามกำหนด)
- ดู `/sync-center` บน device / `client_action_log` replays ค้างใน DB
- ตรวจ `base_updated_at` optimistic-lock (409) — ใครแก้ชนกัน? → policy: version ที่ใหม่กว่า win, log diplim
- ถ้า replay วน: ดู error ใน `client_action_log` status; ล้าง queue ของ device นั้น แล้วให้ sync ใหม่ (safe — idempotent)
- Monitor: ถ้า replay > X นาที → alert

## 5. Security incident (เช่น credential/bot token รั่ว)
- ดู `docs/SECURITY.md`; revoke ทันทีที่สงสัย: bot token → @BotFather `/revoke`; password ที่ใน `.env`/repo → เปลี่ยนใน env + ห้าม commit ซ้ำ
- ถ้าพบ token/secret ใน git history → `git filter-repo`/BFG + revoke token (มีคำเตือนใน AGENTS.md — เคยเกิดเหตุ)
- เปลี่ยน password ผู้ใช้ที่เกี่ยวข้อง + ตรวจ `audit_logs` (การเข้าถึงแปลก)
- ดู evidence: access log IIS ฝั่ง IP ที่เข้าผิดปกติ

## 6. Storage full (disk เต็ม)
- threshold: ว่าง <5GB → alert (ตอนนี้ 9.6GB)
- ขั้น: ตรวจ/ลบ `logs/*.log` โตมาก (rotate), ลบ `public/uploads` ไฟล์เก่า (ตาม policy), ลบ backup เก่าเกิน retention, ตรวจ `backups/*.tar.gz` สะสม
- เพิ่ม/ย้าย disk → ทำโดย admin server (ไร้ staging จริง — ต้องทดสอบ restore เป็นหลัก)

## 7. Notification ไม่มา (LINE/Email/Telegram)
- ตรวจ `settings` notification enabled + channel tokens ใน `.env`
- LINE token/secret มีใน `.env`; ถ้า LINE webhook fail → ดู callback log (`logs/tunnel-ngrok.log`? — ngrok ปิดแล้ว; ถ้าใช้ tunnel ต้องเปิดใหม่ หรือเข้าได้จาก domain จริง)
- Telegram: `curl -s https://api.telegram.org/bot$TOKEN/getMe` (โทเคนจาก env เท่านั้น)

## Severity matrix (แนะนำ)
- SEV1: service down/data corrupt → restore+ไม่ถึง 2h หรือยอมปิดใช้ช่วง
- SEV2: feature ทิ้ง (sage/report/notification) → ทำงานได้ทางอื่น
- SEV3: จุดบกพร่องเล็ก → backlog ปกติ
- หลัง SEV1/SEV2 ทุกครั้ง → ดู ROOT CAUSE + นัด POST_GO_LIVE_REVIEW (เอกสาร `POST_GO_LIVE_REVIEW.md`)