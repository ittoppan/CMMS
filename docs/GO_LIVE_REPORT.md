# GO-LIVE REPORT — CMMS-TOPPAN v1.0.0

วันที่: 2026-09-17 · สภาพเครื่อง: PROD/dev/build รวมกันเครื่องเดียว (IIS :8081 + Next :3001)
ความเห็นโดยรวม: **GO WITH CONDITIONS — ยังไม่ GO-LIVE เต็มรูปแบบเพราะ TLS/HTTPS ยังไม่มี (P0)**. pilot บน office/LAN/localhost เริ่มได้ทันที.

> ตัวเลขใน report = วัด/ทดสอบจริงวันนี้ ยกเว้นที่มี note ชัดเจน. ไม่มีผลลัพธ์ที่ประดิษฐ์ขึ้น.

## 1. สถานะ Release / สภาพแวดล้อม
- Release: **v1.0.0** (tag `v1.0.0`) · commit source `bf0a0f0` · BUILD_ID `hdZW7CLyR4LnpYB9mnGoT`
- API host: `http://localhost:8081` (IIS/PHP 8.3.26/FastCGI 60/180) · WebApp: `http://localhost:3001` (Next/Node 22, production build)
- DB: MySQL 8.0 `cmms_tpt` (110 tables, utf8mb4, timezone +07:00)
- Sage 300: DSN `TFPT1C` (ODBC) — ต่อจริง, ไม่มี fallback stock ปลอม

## 2. STATUS (เกต)
- Automated QA: security_check 32/0 · phase19_sync 15/0 · phase20_qa 50/0 · Playwright **79 pass / 0 fail / 2 skip** · responsive 5/5 · design-audit strict PASS · tsc 0 · next build OK
- Backup+Restore test: **ผ่าน** (110 tables, 2 users, WO พบ, Thai HEX ตรง)
- Sage check: **ผ่าน** (probe 151ms, API 193ms, invalid → null, unauth 401)
- Data validation: **ผ่าน** (0 dups) — ยกเว้น `E00111` ยังไม่มี role
- **สถานะโดยรวม: GO ด้วยเงื่อนไข (ดู §3 BLOCKERS)**

## 3. BLOCKERS
| Level | รายการ | สถานะ |
|---|---|---|
| **P0** | ไม่มี HTTPS (IIS :8081 / Next :3001) → PWA/offline/push fail บนอุปกรณ์จริง + credential plaintext | **OPEN — ต้องปิดก่อนเปิดจริง** |
| **P1** | ผู้ใช้จริงยังไม่สร้าง (admin ใช้ร่วม 1 บัญชี; `E00111` role=NULL) | **OPEN — ต้อง provisioning + ตั้งรหัสใหม่** |
| **P1** | ยืนยัน DSN `TFPT1C` = ฝั่งโปรดักชันของ Sage | **OPEN — ผู้ตั้ง DSN ต้อง confirm** |
| P2 | spare_parts list 1MB payload; FastCGI stderr→500; post_max<upload_max; disk 9.6GB | POST-GO-LIVE FIX |
| P3 | roles id3 label "Operate" vs matrix "Technician"; sage logAudit→audit_trail; uploads 66 ไฟล์ใน git; XAMPP mysqld ค้าง; php-error.log ยังไม่หมุน | FUTURE |

## 4. TESTS COMPLETED (real, 2026-09-17)
- API probe ผ่านทุก endpoint (รายละเอียด `docs/PERFORMANCE_BASELINE.md`)
- Sage: search สำเร็จจริง + invalid graceful + Thai text ตรง
- Restore: gz → create scratch → 110/110 tables → drop
- Migration review: สุดท้าย `migration_20260916_phase19_pwa_offline.sql`; ทุกอัน additive ไม่ DROP/TRUNCATE/DELETE
- php.ini hardening ผ่าน + verify (`expose_php=Off`, `session.use_strict_mode=1`, `cookie_httponly=1`, `error_log`→`logs/php-error.log` — ไฟล์ log มีการเขียนจริง 335B)
- FastCGI timeouts 30/90 → **60/180** + app pool restart → /health 200

## 5. SAGE STATUS
- **LIVE** และถูกใช้เป็น source of truth ของสต็อกหน้าอะไหล่ (label "Stock from Sage 300") — ตรวจได้ว่าไม่มีข้อมูล stock เพิ่มเอง
- unlock condition: ต้อง confirm ว่าชี้ไป DB/prod จริง (§3) — ถ้าเป็น staging ต้องแก้ env ก่อนเปิด

## 6. PWA STATUS
- โค้ดพร้อม (sw v38, offline cache, sync engine, ลงทะเบียน) แต่ **ต้องมี HTTPS** — ยังไม่ได้ติดตั้งจริงบนอุปกรณ์ (GO_LIVE_PLAN B-1)
- ทดสอบได้ใน pilot เฉพาะบนเครื่องมี HTTPS / localhost เท่านั้น

## 7. OFFLINE/SYNC STATUS
- SyncEngine idempotent + queue/cache/attachment + 409 optimistic-lock ได้รับการตรวจผ่าน Playwright (หน้า /sync-center เสถียร) + phase19_sync 15/15
- **ยังไม่ทดสอบ offline บนอุปกรณ์จริง** (โทรศัพท์/แท็บเล็ต) — เป็นงาน pilot (ไม่ได้เทียบเท่าการอ้างว่าผ่าน)
- ตรวจดู /sync-center บน desktop ผ่าน

## 8. BACKUP STATUS
- ทำงานทุกคืน 02:30 (LastResult 0) + retention 30 วัน + **restore test ผ่านวันนี้** — เอกสาร `docs/DATABASE_RECOVERY.md`
- จุดอ่อนที่รู้: backup ทั้งหมดอยู่เครื่องเดียวกับ DB; ยังไม่ทดสอบ restore ของ uploads.tar.gz ออกต่างเครื่อง

## 9. SECURITY STATUS
- ผ่าน automated: security_check 32/0; endpoints weak 401; RBAC จริง (requirePerm matrix); CSRF ทุก mutation; session hardening; CSP/security headers
- ทดสอบ manual review: .env มี 18 keys ไม่รั่วใน repo (git clean; `.env` ไม่ได้ track)
- ข้อจำกัดชัด: **ยังไม่มี pen-test ทางการ**; ยังไม่มี HTTPS (cookie ไม่ Secure จริง); ห้ามอ้าง "pen-tested"

## 10. PERFORMANCE BASELINE (จริง; full = `docs/PERFORMANCE_BASELINE.md`)
- API: login avg **104ms** · dashboard 28ms · repair list 51ms/347KB · detail 24ms · asset 15ms · pm_am 31ms · inspection 37ms · report center 65ms · spare_parts 79ms/1.06MB · sage_items 193ms· health 16ms
- WebApp load (loopback): dashboard 1185ms · repair 225ms · report-center 117ms · sync-center 96ms · spare_parts 115ms

## 11. FILES CREATED/UPDATED (นี้ phase)
- `docs/GO_LIVE_PLAN.md` · `docs/DATABASE_RECOVERY.md` · `docs/PERFORMANCE_BASELINE.md` · `docs/DEPLOYMENT.md` · `docs/ADMIN_RUNBOOK.md` · `docs/INCIDENT_RESPONSE.md` · `docs/POST_GO_LIVE_REVIEW.md` · `docs/FUTURE_BACKLOG.md` · `docs/TECHNICIAN_QUICK_GUIDE.md` · `docs/OPERATOR_QUICK_GUIDE.md` · `docs/USER_GUIDE.md` (append บทบาท) · `CHANGELOG.md`
- Config (ไม่ commit): `C:\PHP\php.ini` (+bak21), FastCGI 60/180 ใน applicationHost.config

## 12. KNOWN LIMITATIONS (ยังเปิดอยู่ ณ release)
1. HTTPS/CERT ยังไม่มี → PWA+offline+push บนอุปกรณ์จริงรอ TLS (P0)
2. ผู้ใช้จริง + provisioning ยังไม่ทำ; `E00111` ไม่มี role
3. ยืนยัน Sage DSN ฝั่ง prod ยังค้าง (B-3)
4. spare_parts list ใหญ่ (~1MB); ยังไม่มี load test
5. ไม่มี staging แยก (single-host); restore uploads ต่างเครื่องยังไม่เคยลอง
6. `TELEGRAM_BOT_TOKEN` เดิมถูก revoke (ตาม USER_GUIDE §13.3) — แจ้งเตือน admin ทาง Telegram ยังต้องใส่ token ใหม่
7. uploads 66 ไฟล์ติด git / XAMPP mysqld ยังอยู่ — housekeeping ออกใน backlog

## 13. NEXT ACTIONS (เจ้าของ: ผู้ดูแลระบบ + ผู้ตั้ง DSN)
1. **[Admin]** ติดตั้ง cert + bind HTTPS → redirect HTTP→HTTPS; ตั้ง session cookie Secure เมื่อ TLS active
2. **[Admin]** สร้างบัญชี pilot (Operator/Technician/Supervisor/Planner/Engineer/Manager/Admin) + ตั้งรหัสเฉพาะ + กำหนด role `E00111`
3. **[ผู้ตั้ง DSN]** ยืนยัน DSN `TFPT1C` ฝั่ง prod (1 บรรทัด)
4. **[Admin]** ใส่ TELEGRAM_BOT_TOKEN ใหม่ใน `.env` (ห้าม commit)
5. **[Admin]** เริ่ม pilot 30 วัน (แผนใน GO_LIVE_PLAN §9) → เติมผลลง POST_GO_LIVE_REVIEW
6. **[Admin]** นัด restore test รายเดือน + copy backup ออกเครื่อง

---
_End of report. สรุป: โค้ด/QA/backup/การตั้งค่า ของฝั่งที่ทำได้บนเครื่องนี้ = ครบและยืนยันผลจริง. ส่วนที่เปิดค้าง = TLS, provisioning ผู้ใช้, ยืนยัน DSN — นี่คือเงื่อนไขที่ต้องปิดก่อน turn-on สำหรับผู้ใช้จริง._