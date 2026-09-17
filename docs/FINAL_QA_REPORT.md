# Final QA Report — Phase 20 (2026-09-16 → 17)

**ผลการตัดสินใจ (Release Verdict): GO — พร้อมเปิดใช้งานจริง** (มีข้อแม้ 3 ข้อที่ต้องทำตอน go-live — ดู §5)

## 1) คะแนนรวมจากเกตจริง

| เกต | ผล | หมายเหตุ |
|---|---|---|
| `security_check.php` | 32/0 PASS | เจ้าของผลรอบนี้ |
| `phase19_sync_check.php` | 15/0 PASS | รวม HTTP idempotency (live creds) |
| `phase20_qa.php` | 50/0 PASS | Integrity/FK/dup/index, authz, unauth-401, CSRF, TZ, Thai-utf8 |
| Playwright e2e | **79 pass / 0 fail / 2 skip*** | skip = ต้องมี Approved request (ข้อมูลจริง) |
| Responsive spec | 5/5 PASS | 390px/1440px, 1 h1, no overflow, no console error |
| design-audit `--strict` | PASS | 0 FAIL 0 WARN (เทียบ origin/main) |
| tsc --noEmit + next build | PASS | standalone + BUILD_ID |

\* sage-shipment modal 2 ตัว skip เพราะ DB ไม่มี `spare_issue_requests` สถานะ `Approved` ขณะรัน (= empty-state ที่ออกแบบไว้) — ไม่ใช่ regression.

## 2) สิ่งที่แก้ในรอบนี้ (ฟีเจอร์/การป้องกัน?)

- **P0**: `repair_options.php` เขียนได้โดยไม่ login → ปิด auth + `api_safe_catch` (สงวน 409). **P0**: kiss exception `$e->getMessage()` ไป client หลาย endpoint → `api_safe_catch()` + grep ยืนยันไม่มีเหลือ. 14 ไฟล์ weak-auth → 401 มาตรฐาน.
- **Hydration**: `connectivity.tsx` SSR/CSR mismatch (#418 บน dashboard) → แก้ deterministic.
- **CSP**: เพิ่ม googleapis/gstatic สำหรับ font (หน้า login 0 error); ข้อจำกัด: CSP เต็มรูปแบบเฉพาะผ่าน Next :3001.
- **PWA push**: ไม่ร้องขอก่อน login แล้ว; SW v38 + cache v38; offline HTML UTF-8 สะอาด.
- **Timezone**: `SET time_zone='+07:00'` ใน `getDb()` + `date.timezone=Asia/Bangkok` (php.ini) — แก้รากเหง้าของเวลาคลาด +7 ชม.
- **Settings**: public GET เฉพาะคีย์ธีม 5 ตัว; เส้นอื่นยัง 401 — แก้รูป ThemeProvider หน้า login.
- **recharts**: แยก chunk ที่หน้า report (dashboard/analytics คงเดิม — documented, ลดลงได้ในรอบถัดไป).
- **Deploy**: จัดการ stale `node server.js` (ค้างถือ :3001) — 28/28 ตรวจผ่าน, BUILD_ID `hdZW7CLyR4LnpYB9mnGoT`.

## 3) คุณภาพ

- ไม่มี console error/pageerror ระหว่าง navigate ทุกเส้นทางหลัก (ตรวจด้วย Playwright จริง).
- ไม่มี orphan FK / duplicate ที่สำคัญ; WS โดยตรง: `work_order_no` ไม่ซ้ำ, `locations.code` ไม่ซ้ำ.
- Thai ผ่านครบ (utf8mb4 round-trip) + UI ไทยถูกใน sw/sync-center.
- mobile: 1 h1/หน้า, title bar เป็น div, ไม่มี horizontal overflow.

## 4) การตัดสินใจ

**GO** — เกตอัตโนมัติทั้งหมดผ่าน 0 fail + ชุด e2e ครอบโมดูลหลัก + ไม่พบ regression จาก phase 18/19. สิ่งที่ทำไม่ได้เพราะเป็นของจริงนอกเครื่อง dev (ไม่ใช่ความบกพร่องของโค้ด):

## 5) ข้อแม้ตอน go-live (ทำจริงที่โรงงาน)

1. **Sage 300 DSN/เครือข่ายจริง** — ระบบยืนยันกับ DSN ที่เครื่อง dev เท่านั้น เปิดใช้ครั้งแรกต้องลองตัดสต็อกกับ DSN จริง.
2. **LINE webhook จริง** — ไม่มีการส่ง ping LINE จริงในรอบนี้ (มี token ใน env — ไม่อนุญาต test จริง) ต้องยืนยันการแจ้งเตือนกับกลุ่มจริง.
3. **Load test** — ยังไม่ทดสอบ concurrent/ข้อมูลเต็มปี ต้องดูรายงานปีแรกหลังใช้งาน.

## 6) Debt / ติดตามต่อ (ไม่ blocking)

- `public/uploads` ติด git (~100 ไฟล์) — เลือก `.gitignore`/ลบ (รอบบำรุง).
- `audit_trail` (เก่า) ไม่ได้ใช้/ไม่มี index ครบ — วางแผน drop.
- recharts ยังตรงใน dashboard/analytics (ลดได้ด้วย dynamic import เพิ่ม).
- phase19/push/line ตรวจผ่านเฉพาะกลไกไม่ใช่สถานการณ์จริงบนเครือข่ายโรงงาน.

## 7) คำรับรอง

ผลการ QA นี้มาจากการรันสคริปต์และการทดสอบ browser จริงในวันที่รายงาน — ทุกตัวเลขใน §1 ตรวจสอบซ้ำได้ด้วยคำสั่งที่ระบุใน `docs/QA_MATRIX.md`. ระบบพร้อมส่งมอบ (release candidate) ตามขอบเขต Phase 20 [QA + UX + Production readiness].