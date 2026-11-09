# DATABASE RECOVERY — CMMS-TOPPAN

สถานะ 2026-09-17: **แผนนี้ถูกทดสอบจริง (restore test ผ่าน)** บนเครื่อง production นี้

## 1. Backup ที่มี (อัตโนมัติ)

- กลไก: Scheduled Task `CMMS-Backup` ทุกคืน 02:30 → `backup-task.ps1` → `scripts/backup.sh`
- ไฟล์สร้าง:
  - `backups/cmms-tpt_db_YYYYMMDD_HHMMSS.sql.gz` — mysqldump (MySQL 8.0) `--single-transaction --routines --triggers --default-character-set=utf8mb4`
  - `backups/cmms-tpt_uploads_YYYYMMDD_HHMMSS.tar.gz` — tar.gz ของ `public/uploads`
- ตำแหน่ง: `C:\inetpub\wwwroot\cmms-tpt\backups\` (อยู่ใน `.gitignore` — ไม่ออกจาก repo)
- Retention: 30 วัน (ตัวแปร `BACKUP_RETENTION_DAYS`; ค่าเริ่มต้นในสคริปต์ = 30) — ตัวเก่ากว่ามีการลบอัตโนมัติ
- ขนาดจริงตอนนี้: DB dump ~0.2MB gz / uploads ~7.2MB ต่อวัน (ล่าสุด `cmms-tpt_db_20260917_023002.sql.gz` = 168.6KB)
- Log: `logs/backup.log` + `backups/backup_warnings.log`

### วิธีการ backup ด้วยมือ (ถ้าต้องการก่อน migration)
```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-task.ps1   # เรียกกลไกเดิม
# หรือเฉพาะ DB (ผ่าน Git Bash):
bash scripts/backup.sh --db-only
```

## 2. Restore Procedure (ทดสอบแล้ว)

ข้อสำคัญ: dump ไม่มี `CREATE DATABASE`/`USE` → ต้องมีฐานปลายทางก่อน แล้ว import เข้าไป

```powershell
# 1) หาไฟล์ล่าสุด
Get-ChildItem C:\inetpub\wwwroot\cmms-tpt\backups -Filter 'cmms-tpt_db_*.sql.gz' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

# 2) สร้างฐาน (วางแผนชื่อ — ถ้าเป็น disaster ให้ใช้ชื่อ .bak แล้วชี้ .env DB_NAME ใหม่)
#    mysql -h127.0.0.1 -P3306 -uroot -p'****' -e "CREATE DATABASE cmms_tpt_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3) import (Windows ไม่มี zcat — ใช้ .NET หรือ Git Bash)
#    ด้วย Git Bash:
#      gzip -dc backups/cmms-tpt_db_20260917_023002.sql.gz | \
#        mysql -h127.0.0.1 -P3306 -uroot cmms_tpt_restore
#    ด้วย PowerShell/(.NET GZipStream → SOURCE): ดูตัวอย่าง scripts ด้านล่างใน docus
```

Restore test จริง (2026-09-17): decompress → `SOURCE` → ตรวจ = **110 ตาราง**, users 2, repairs 102, Thai location `name_len=11 hex=E0B8ADE0B8B2` ตรงกับ base → ผ่าน แล้วสร้าง `cmms_restoretest` ขึ้น/ลบ (ไม่แตะข้อมูลจริง).

## 3. สิ่งที่ backup ไม่ครอบ (ต้องเตรียมแยก)

| รายการ | ที่อยู่ | หมายเหตุ |
|---|---|---|
| `.env` (DB creds / Sage DSN / LINE / Telegram) | repo root `.env` | **ไม่รวมใน backup** — ถูกลบด้วยมือ ต้องเก็บแยก/doc ของ admin |
| ใบรับรอง/HTTPS config | IIS (`applicationHost.config`) | ออกแบบให้คนดูแลเครื่อง |
| Scheduled tasks (CMMS-Backup/NextJS/Watchdog) | Task Scheduler | export ได้ แต่ออกแบบให้คนดูแลเครื่อง |
| `logs/` | `logs/*.log` | ประวัติการทำงาน (ไม่ใช่ข้อมูลธุรกิจ; หมุนเอง) |

## 4. Retention / ขนาด

- Auto: 30 วัน → ตรวจได้ใน `backups/backup_warnings.log` / `logs/backup.log`
- ประเมินการเติบโต: ~7.4MB/วัน → ~220MB/รอบ 30 วัน (ไม่รวม DB ที่ยังเล็ก)
- พื้นที่ดิสก์ว่างตอนนี้ **9.6GB** — กำหนด threshold แจ้งเตือนที่ 5GB (ดู `GO_LIVE_PLAN.md` I-4)

## 5. Restore ขั้นตอนเต็มสำหรับ disaster (database down / corruption)

1. หยุดผู้ใช้เข้าถึงได้บ้าง? (ถ้าหนักสุด: `iisreset` หรือปิด app pool `cmms-tpt` ชั่วคราว)
2. รัน restore ตามข้อ 2 ไปยังฐานใหม่ `cmms_tpt` (หรือชี้ `.env` DB_NAME ใหม่)
3. ตรวจ `/api/health.php` → 200 `db:ok`
4. login + นับจำนวน repair/users เทียบกับหลักฐาน (เช่น backup_gz ก่อนหน้า) ให้เห็นว่าข้อมูลกลับมา
5. เปิด app pool ใหม่ + ทดสอบ smoke (login/dashboard/1 ใบ WO)
6. บันทึก incident ใน `logs/backup.log` / แจ้งผู้ดูแล

## 6. Best practice เพิ่มเติม (out of scope — ฝั่งดูแลระบบ)

- ลอง "restore test" รายเดือน (หรือทุก 3 เดือน) ตามที่ทำครั้งแรกวันนี้
- copy backup ใจสำคัญออกนอกเครื่อง (เช่น share อื่น) อย่างน้อยสัปดาห์ละครั้ง — ไฟล์ backup อยู่ในเครื่องเดียวกับ DB → fire/flood ทั้งคู่หาย
- ทดสอบ restore uploads.tar.gz บนเครื่องอื่น 1 ครั้ง (ยังไม่ได้ทำ)