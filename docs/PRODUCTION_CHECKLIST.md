# Production Checklist — CMMS-TOPPAN

ใช้ก่อน/ระหว่าง/หลัง go-live. ตรวจทีละข้อแล้วติ๊ก. ทุกข้อที่เกี่ยวกับการเปิดระบบจริงต้องมีหลักฐาน (build ID / log / screenshot) — อย่าเดาว่าผ่าน.

## A. ก่อน go-live (Pre-flight)

- [ ] `git status` สะอาด (ไม่มี diff ค้างโดยตั้งใจ / ไม่มีไฟล์ temp)
- [ ] Hook ติดตั้ง: `git config core.hooksPath` = `scripts/git-hooks`
- [ ] Gate ผ่าน: `python scripts/design-audit.py --diff origin/main --strict` → PASS
- [ ] Gate ผ่าน: tsc-check.sh → ไม่มี type error
- [ ] Gate ผ่าน: next-build-check.sh → BUILD_ID + standalone/server.js
- [ ] `php scripts/security_check.php` → 32/0 PASS
- [ ] `php scripts/phase19_sync_check.php` (set `CMMS_TEST_USER`/`CMMS_TEST_PASS`) → 15/0 PASS
- [ ] `php scripts/phase20_qa.php` (set `CMMS_QA_USER`/`CMMS_QA_PASS`) → 50/0 PASS
- [ ] Playwright: `npx playwright test` (set `E2E_USERNAME`/`E2E_PASSWORD`) → 79 pass / 0 fail (2 skip ที่รู้สาเหตุ)
- [ ] `/health` → 200 `{"status":"ok","db":"ok"}`
- [ ] นับ `node server.js` ได้ process เดียวเท่านั้น (ถ้ามีหลาย → kill ค้าง → deploy ใหม่)
- [ ] RESTART IIS: `Restart-WebAppPool -Name "cmms-tpt"` (ให้ php.ini ใช้ทันที)
- [ ] เส้นทางสาธารณะ: `/login` ที่ :3001 เปิดผ่าน, ไม่มี error console, หน้า login ไม่ขอสิทธิ์ push
- [ ] เส้นทางสาธารณะ: `/health` ผ่าน Next + direct 8081

## B. ระหว่างเข้าใช้ (Smoke)

- [ ] Login ได้ด้วยบัญชีจริง (redirect + dashboard ขึ้น ไม่มี #418 hydration)
- [ ] Menu หลักครบ: Dashboard / งานซ่อม / PM / เช็กลิสต์ / อะไหล่ / รายงาน / ผู้ขาย / ครุภัณฑ์
- [ ] สร้างงานซ่อมจริง 1 ใบ (และลบ/ทำเครื่องหมายทำเสร็จเพื่อไม่ทิ้งขยะ)
- [ ] เปิด 1 รายงาน PDF/กราฟ — ไม่ error
- [ ] Online→Offline→Online: sync-center แสดงสถานะ, คิวซิงก์ทำงาน
- [ ] มุมมอง mobile 390px: ไม่มี horizontal scroll, title bar ไม่ใช่ heading, มี 1 h1
- [ ] อัปเดตหน้าเพจเองครั้งนึงที่ `admin` เพื่อ flush cache ตามปกติ (ถ้าเคยกำหนด theme)

## C. สภาพปกติ (เมื่อมีเวลา < 1 ชม.)

- [ ] `GET /health` ผ่าน (JS fetch จากหน้าใดก็ได้)
- [ ] ตรวจไม่ได้มี error ใหม่ใน browser console ของหน้าแลนดิ้งหลัก
- [ ] `audit_logs` เพิ่มรายการเมื่อเขียนข้อมูล (ตารางจริง = `audit_logs`)
- [ ] DB: ยังไม่พบ orphan/dup ใหม่ (runs `phase20_qa.php` สั้นๆ)

## D. Post-go-live ผูกกับทีมผู้ดูแล

- [ ] Vault/env: ค่าใน `.env` / environment ของเครื่องครบ (DB, APP_URL, ALLOWED_ORIGINS, TELEGRAM_*, SAGE DSN)
- [ ] เอกสารคู่มือ: `docs/USER_GUIDE.md` + `docs/PWA-GUIDE.md` สอดคล้องกับหน้าจอจริง
- [ ] นัดหมายทวน `QA_MATRIX.md §6` (Sage DSN จริง / LINE webhook จริง / load test)
- [ ] ตั้งนโยบายสำรอง DB (ถ้ายังไม่มี) + ทดสอบ restore 1 ครั้ง
- [ ] ตัดสินใจ `public/uploads` (เพิ่ม .gitignore หรือลบออกจาก repo)
- [ ] ปิด `display_errors`/`debug=1` สำรับ production ถ้ายังไม่ได้ปิด

## E. ถ้าเปิดแล้วมีปัญหา

1. ดู `/health` — ถ้า db ไม่อยู่ → ตรวจ MySQL/`SET time_zone`.
2. ดู `node server.js` process — ถ้าไม่อยู่ → `deploy-next.ps1` ใหม่.
3. ดู console ของ browser (F12) — อย่า ignore; ถ้า CSP/font error → ดู `next.config.ts` CSP.
4. ถ้า deploy สำเร็จแต่ manifest 404 → มี server เก่าค้างถือ :3001 → kill → deploy ใหม่.
5. เปิดโหมดใช้งานมือถือ/desktop — ถ้า hydration mirrror (`#418`) กลับมา → ดู SSR/CSR mismatch ใน component ที่ใช้ `window`/`navigator`.