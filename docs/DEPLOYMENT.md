# DEPLOYMENT — CMMS-TOPPAN

เอกสารฉบับย่อแบบ runbook 12 ขั้นตอน สำหรับคนดูแลเครื่อง `cmms-tpt` (Windows/IIS + Node). ใช้ก่อนเปิดจริงและทุกครั้งที่ปล่อยเวอร์ชันใหม่.
ตรวจตั้งสภาพแวดล้อมปัจจุบัน: **ทุกอย่างอยู่บนเครื่องเดียว (prod + build)** — ลำดับนี้ผูกกับสภาพจริง.

## ข้อกำหนดล่วงหน้า
- App pool `cmms-tpt` (Integrated, v4.0) ชี้ไปที่ `C:\inetpub\wwwroot\cmms-tpt\public`
- Node 22 + port 3001 ถูกซ่อมโดย Scheduled Task `CMMS-NextJS` (เปิดตอน boot)
- `.env` อยู่ repo root (DB creds, `SAGE300_ODBC_DSN/USER/PASS`, LINE, Telegram) — **ห้าม commit**
- เปิด TLS/HTTPS ก่อนปฏิบัติ (ถ้ายังไม่มี: `docs/GO_LIVE_PLAN.md` §3 B-1)

## ขั้นตอน (11+1)

### 1. Backup ล่วงหน้า (ทุกครั้งก่อน migration/deploy)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-task.ps1
# ตรวจ backup_gz ล่าสุดมี (DB + uploads) และ n ผ่าน/T ผ่าน
```

### 2. ตรวจ HEAD / tag
```powershell
git -C C:\inetpub\wwwroot\cmms-tpt fetch origin
git -C C:\inetpub\wwwroot\cmms-tpt status        # ต้องสะอาด (กันไฟล์ .env เผลอ)
git -C C:\inetpub\wwwroot\cmms-tpt pull origin main
git -C C:\inetpub\wwwroot\cmms-tpt tag --points-at HEAD   # ควรเป็น vX.Y.Z
```

### 3. ตรวจการ migration ใหม่
```powershell
# ถ้ามีไฟล์ database/migrate_*.sql ใหม่: นำไปใช้กับ cmms_tpt ตามลำดับ  → ทุกรายการต้องเป็น additive (ดู docs/GO_LIVE_PLAN.md §10 / DATABASE_RECOVERY.md)
# จากนั้นรันรีเช็คสภาพ:
php scripts/phase20_qa.php --quick        # หรือ script ตรวจ schema ที่เกี่ยวข้อง
```

### 4. Build Next (production)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-next.ps1
# มี 28 checks . เอา BUILD_ID ออกมาบันทึกไว้ (เช่น hdZW7CLyR4LnpYB9mnGoT)
```

### 5. Deploy assets ฝั่ง PHP
- ถ้าไฟล์ใน `public/` หรือ `src/` เปลี่ยน: IIS ใช้ FS โดยตรง → สำเนาเสร็จแล้ว (git pull)
- รีสตาร์ท app pool เพื่อเอา opcache/Session config ใหม่: `Restart-WebAppPool -Name 'cmms-tpt'`

### 6. ตรวจ FastCGI/PHP config (ถ้าเครื่องใหม่)
```powershell
# C:\PHP\php.ini: display_errors=Off, log_errors=On, error_log=...\logs\php-error.log, session.use_strict_mode=1, session.cookie_httponly=1, expose_php=Off
# ใน applicationHost.config: activityTimeout=60, requestTimeout=180
```

### 7. Smoke test อัตโนมัติ
```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:8081/api/health.php   # 200
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/login              # 200
# ใส่ login + เปิด 1 WO ใน Playwright/CDP ตาม docs/QA_MATRIX.md
```

### 8. ตรวจ Scheduler (ต้องเปิดอยู่)
- `CMMS-Backup` (02:30), `CMMS-NextJS` (boot), `CMMS-Watchdog` (ทุก 1 นาที) → `gpresult/Task Scheduler` ดู Last Result 0
- `CMMS-TunnelQuick` ↔ ควร Disabled (ไม่ใช้ ngrok)

### 9. ตรวจ log & disk
```powershell
Get-ChildItem C:\inetpub\wwwroot\cmms-tpt\logs | Sort-Object Length -Descending   # หา .log โตผิดปกติ
Get-PSDrive C | Select-Object Used,Free                                          # ดู < 5GB → เตือน
```

### 10. Update CHANGELOG + tag ใหม่ (เมื่อปล่อย stable)
- เพิ่ม section ใน `CHANGELOG.md` → commit → `git tag vX.Y.Z` → push tags (ตาม workflowใน AGENTS.md — รวม Telegram แจ้ง)

### 11. ประกาศเปิด/ปิดช่วงผู้ใช้
- ถ้าเป็นช่วงบำรุง: แจ้งผู้ใช้ก่อน (ผ่าน LINE/กลุ่ม admin) — ขั้นนี้ทำให้ฝั่งผู้ดูแลระบบ

### 12. หลังเปิด 30 นาที
- ดู `logs/php-error.log`, `/api/health.php`, `logs/watchdog.log` — ถ้าปกติ → ปิดเร็ว เมื่อเปิดด่วน/ต้องส่งมอบเพิ่ม → ดู `docs/INCIDENT_RESPONSE.md`
- นัดหมายโฟลเวอร์อัพตาย 30 วัน → `docs/POST_GO_LIVE_REVIEW.md`

## Rollback (ทางเลือกหลัก = forward fix)
1. แก้โค้ดแล้ว deploy ใหม่ (วิธีที่ชอบ — ไม่ทำให้ข้อมูลหาย)
2. ถ้า data-corruption: restore จาก `backups/cmms-tpt_db_YYYYMMDD_HHMMSS.sql.gz` ตาม `docs/DATABASE_RECOVERY.md` §5
3. เอกสาร verify: `docs/INCIDENT_RESPONSE.md`