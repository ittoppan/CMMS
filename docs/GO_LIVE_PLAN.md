# GO-LIVE PLAN — CMMS-TOPPAN v1.0.0

เวอร์ชัน 1.0 · 2026-09-17 · สถานะ: **RELEASE CANDIDATE → ผ่าน Go-Live เมื่อปิด TLS/HTTPS BLOCKER**

เอกสารนี้ = แผนปฏิบัติการ + รายการ blocker ที่เหลือ. อ่านคู่กับ `docs/FINAL_QA_REPORT.md`, `docs/PRODUCTION_CHECKLIST.md`, `docs/DEPLOYMENT.md`, `docs/INCIDENT_RESPONSE.md`.

## 1. ขอบเขต / สภาพทีésจริง (truth before plan)

| พื้นที่ | สภาพที่ตรวจ (2026-09-17) | Evidence |
|---|---|---|
| สภาพแวดล้อมเดียว | dev/build/prod อยู่เครื่องเดียว (`localhost:8081` PHP/IIS + `:3001` Next) | เป็นการตั้งค่าปัจจุบัน — ต้องยอมรับเป็นข้อจำกัด ไม่มี staging แยก |
| HTTPS | **ไม่มี** — bind = `http *:8081`, Next = `http :3001` | `Get-WebBinding` |
| DB | MySQL 8.0 (`MySQL80`), 110 ตาราง, timezone session `+07:00`, Thai utf8mb4 | backup restore test (110 ตาราง, HEX ตรง) |
| Sage 300 | DSN `TFPT1C` ต่อได้จริง (PDO_ODBC), item lookup/invalid/encoding ผ่าน | probe จริง 151ms, API 193ms |
| Backup | ทุกคืน 02:30 DB dump + uploads tar.gz, retention 30 วัน, restore เทสต์ผ่าน | `CMMS-Backup` task + script |
| Monitoring | `/api/health.php` + `/health` (Next) 200; watchdog ทุก 1 นาที; PHP error log เพิ่งเปิด | ตรวจจริง |
| จำนวนผู้ใช้ | 2 (admin `E01117`, `E00111` ยังไม่มี role) | query |

## 2. ผู้ที่ต้องรับผิดชอบ (RACI ระดับสูง)

สมมติ: ผู้ดูแลระบบโรงงานเป็นคนตัดสินใจเปิด (site admin). Phase นี้ = เตรียม + ตรวจจนพร้อม + ส่งมอบแผน เราไม่เปิดการใช้งานจริงให้ผู้ใช้ทั้งหมดเอง.

## 3. ข้อกีดขวาง (BLOCKER) — ต้องปิดก่อน Go-Live เต็มรูปแบบ

### B-1 ✅ [GO-LIVE BLOCKER] TLS/HTTPS ยังไม่มี
- ทำไม: PWA require secure context (`https://` หรือ localhost เท่านั้น) → ถ้าเปิดบนโทรศัพท์/แท็บเล็ตผ่าน `http://<IP>:3001` จะไม่มี service worker → offline/sync/push **ไม่ทำงาน**. และ login/credential เดินทาง plaintext บน LAN.
- ทางเลือกที่ยอมรับได้ **ก่อน**: pilot บน office/LAN เครื่องตั้งโต๊ะที่ใช้ localhost หรือ HTTPS tunnel เท่านั้น; ยังไม่เปิด PWA บนมือถือจริง.
- ทางแก้ fix ถาวร (ต้องทำโดย admin server):
  1. ติดตั้ง/ต่ออายุใบรับรอง (internal CA หรือ Let's Encrypt สำหรับ domain) → IIS bind `https :443` + URL Rewrite redirect http→https (web.config มี template อยู่แล้ว)
  2. Next :3001 ให้เข้าเฉพาะผ่าน reverse proxy (ARR/nginx) ภายใต้ HTTPS เดียวกัน; ปิด direct HTTP เอาไว้หลัง TLS
  3. หลังเปิด TLS: ตั้งค่า `session.cookie_secure` -> อัตโนมัติผ่าน `cmms_secure_session` (รอได้) แล้วยืนยัน cookie `Secure` flag
- ผลหลังแก้: `https://<domain>` → `/health` 200, SW ลงทะเบียนบนเครื่องจริง, หน้า login ไม่มี console error.

### B-2 ⚠️ [จำเป็นตอน provisioning] บัญชี/ผู้ใช้ยังไม่พร้อม
- มีผู้ใช้เท่านั้น 2: `E01117` (Admin, ใช้ร่วมกันในเทสต์) และ `E00111` (**role_id = NULL** — ยังกำหนดบทบาทไม่ได้).
- ต้อง: สร้าง/เตรียมบัญชีตาม pilot group (§9), ตั้งรหัสใหม่ไม่ใช้ค่าในเทสต์, ห้ามแจก Admin ซ้ำ; `E00111` ต้องระบุ role.
- ตรวจสอบ seed: `.sql` ใน database/ อย่าให้มี password จริง (ยังไม่ยืนยัน — กำหนดให้ admin ตรวจก่อนเปิด).

### B-3 ⚠️ [ต้องยืนยันก่อน] Sage DSN scope กับฝั่งจริง
- DSN `TFPT1C` ตอบกลับข้อมูลจริงบนเครื่องนี้ — ไม่มีหลักฐานว่าชี้ไป "database จริง/สำรอง" ของ Sage ฝั่งผลิต → ต้องหาคนที่ตั้ง DSN มาตอบยืนยัน 1 บรรทัดก่อนตัดสินใจเปิด (ถ้าเป็น staging DSN → เปลี่ยน env ก่อน open).

## 4. การจำแนกไอเท็มที่เหลือ (Blocker Review)

อ้างอิงจาก `docs/QA_MATRIX.md` §5-6 + การตรวจใน phase นี้:

| ID | ระดับ | คำอธิบาย | จำแนก |
|---|---|---|---|
| B-1 | P0* | ไม่มี HTTPS — PWA/offline/push fail บนอุปกรณ์จริง + credential plaintext | **GO-LIVE BLOCKER** |
| B-2 | P1 | user readiness (admin ใช้ร่วม, E00111 ไม่มี role) | **GO-LIVE BLOCKER (สำหรับเปิดให้ผู้ใช้จริง)** |
| B-3 | P1 | ยืนยัน DSN ตรงฝั่งผลิต | **GO-LIVE BLOCKER (ยืนยันก่อนเปิด Sage)** |
| I-1 | P2 | `spare_parts` list payload ~1MB → ต้องการ pagination/server-filter | POST-GO-LIVE FIX |
| I-2 | P2 | FastCGI `stderrMode=ReturnStdErrIn500` — error ของ PHP ที่ไม่ผ่าน helper = 500 (ตอนนี้ log ตกลงไฟล์แล้ว แต่ 500 ยังเกิดได้) | POST-GO-LIVE FIX |
| I-3 | P2 | `post_max_size=32M` < `upload_max_filesize=900M` — อัปโหลดใหญ่กว่า 32M จะ fail (ภาพปัจจุบันถูกบีบแล้ว ไม่กระทบป็นหลัก) | POST-GO-LIVE FIX |
| I-4 | P2 | พื้นที่ดิสก์ว่าง 9.6GB — เตือนเมื่อ <5GB; backup เติบโต ~7.4MB/วัน | POST-GO-LIVE FIX (watch) |
| I-5 | P3 | `roles` id 3 label "Operate" แต่ permission matrix ใช้เป็น Technician — เปลี่ยน label ต้องจับคู่ให้ตรง | FUTURE IMPROVEMENT |
| I-6 | P3 | `Sage300Service::logAudit` เขียน `audit_trail` (legacy) แทน `audit_logs` | FUTURE IMPROVEMENT |
| I-7 | P3 | `public/uploads` 66 ไฟล์ใน git + `Thumbs.db` — ย้ายออก/gitignore | FUTURE IMPROVEMENT |
| I-8 | P3 | `mysql` (XAMPP) service หยุดอยู่อีกตัวบนเครื่อง — ล้างออกเพื่อกันชนพอร์ต | FUTURE IMPROVEMENT |
| I-9 | P3 | disk/rotation: php-error.log ใหม่ ยังไม่มี auto-rotation (หมุนด้วย script/scheduled) | POST-GO-LIVE FIX |

P0* = เป็น environment gap (ไม่ใช่โค้ด) — แต่ถือ blocker ตามนิยาม "PWA ไม่ทำงานบนอุปกรณ์จริง".

## 5. ลำดับการ Go-Live

```
[P1] ผู้ดูแล: ยืนยัน/ติดตั้ง HTTPS (B-1) + ยืนยัน DSN (B-3)
[P2] ผู้ดูแล: เตรียมบัญชี pilot group (B-2) + ตรวจ seed ไม่มี secret
[P3] ปิด I-1..I-9 ที่เลือกทำเป็น post-go-live fix (บางตัวรอได้)
[P4] ดำเนินตาม docs/DEPLOYMENT.md (backup → build → deploy → migrate → smoke)
[P5] Pilot workflow (§9) บน office/LAN (localhost/PWA-บน-เครื่องที่มี HTTPS) — ตรวจ sheet
[P6] ประเมินผล pilot 30 วัน → POST_GO_LIVE_REVIEW → เปิดเต็มรูปแบบ
```

## 6. ชุดเทสต์ที่ต้องผ่านก่อนเปิด (summary)

ตรวจละเอียด: `docs/FINAL_QA_REPORT.md` + `docs/QA_MATRIX.md`. สรุปตัวเลขแสดงผล:
- security_check 32/0 · phase19_sync 15/0 · phase20_qa 50/0 · Playwright 79 pass/2 skip · design-audit strict PASS · tsc 0 · next build OK
- Restore test: 110 ตาราง + data + Thai UTF-8 ตรง (วันนี้ ผ่านบนเครื่องนี้)

## 7. Monitoring ก่อน/หลังเปิด

- หน้า/API: `GET /api/health.php` (200 `{status:ok,db:ok}`)
- เพิ่มเตือน: disk <5GB, `php-error.log` เติบโตผิดปกติ, `sage_sync_log` error, `client_action_log` replays ผิดปกติ
- `logs/watchdog.log` + `logs/backup.log` ตรวจหลังเปิดใช้งานจริง

## 8. หลังเปิด (ตาม docs/INCIDENT_RESPONSE.md)

- ตัวเลือก rollback: deploy ก่อนหน้า (BUILD_ID เก่า) + restore จาก backup (ล่าสุดทุกคืน)
- เอกสารที่ใช้หลังเปิด: `DEPLOYMENT.md`, `INCIDENT_RESPONSE.md`, `ADMIN_RUNBOOK.md`, `FUTURE_BACKLOG.md`

## 9. Pilot Group (ข้อเสนอ — ให้ผู้ดูแลยืนยันตัวจริง)

| บทบาท | ตัวอย่างบุคคล | งานที่ให้ลอง |
|---|---|---|
| Operator (1) | พนักงานเครื่องจักร | สร้าง Maintenance Request + ภาพถ่ายต้นเหตุ |
| Technician (1) | ช่างซ่อม | รับ WO, ตรวจเช็กลิสต์, รูป, อะไหล่, ปิดงาน, offline test |
| Supervisor/Foreman (1) | หัวหน้าช่าง | ตรวจ/อนุมัติ request, verify WO |
| Planner (1) | วางแผน PM | จัด Plan/ชั่วโมง, สร้าง WO จาก PM |
| Engineer (1) | วิศวกร | วิเคราะห์รายงาน/KPI, MTBF/MTTR |
| Manager (1) | ผู้จัดการฝ่าย | Dashboard + รายงานขาออก (PDF), อ่าน audit |
| Admin (1) | ผู้ดูแลระบบ | จัดการ users/roles/settings, ตรวจ audit log, backup |

## 10. คำเตือนชัดเจน

- **ห้าม** ตัดสินใจ GO เพียงเพราะ build ผ่าน — ใช้ผลของ pilot + ตรวจ checkbox ใน `docs/FINAL_QA_REPORT.md` §41 (FINAL QUALITY GATE) = `docs/GO_LIVE_REPORT.md`
- ยัง **ไม่มีการทำ pen-test ทางการ** — สิ่งที่ผ่านคือ automated security_check + review ด้วยหลักปฏิบัติ; อย่าอ้างว่า "pen-tested"
- ยัง **ไม่มีการ load test** บนฝั่งวัดปริมาณ — baseline ตัวเลขบนเครื่องนี้ใน `docs/PERFORMANCE_BASELINE.md` เท่านั้น