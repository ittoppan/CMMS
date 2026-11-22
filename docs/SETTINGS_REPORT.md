# รายงานผลขั้น 1: ความปลอดภัยของ settings.php

## 1. แก้แล้ว
- API `public/api/v1/settings.php`:
  - ค่า secret (telegram_bot_token, ntfy_token, smtp_pass, vapid_private_key, line_channel_access_token, line_channel_secret + heuristic token/secret/_pass/password/private) ไม่ถูกส่งออกทาง API เลย ส่งแค่ `is_set` (true/false) และ `setting_value` = ""
  - เพิ่ม allowlist ของ endpoint สาธารณะ (unauth GET) สำหรับค่าที่ทุกคนต้องอ่าน: ชื่อบริษัท/โลโก้/ธีม/ข้อความหน้า login/เบอร์ซัพพอร์ต/ข้อความ UI/ภาษา/วันที่/andon colors
  - GET ทั้งหมด (full list, ?id, ?defaults) ต้อง `settings:view` ขึ้นไป; เขียนต้อง `settings:manage` (Admin เท่านั้น — เลือก ก)
  - audit_log ของ settings ใช้ `SETTING_MASKED` สำหรับ secret ทั้ง old/new (แก้ settings_audit_log และ audit_log ไม่รั่วค่า)
- `src/helpers/api.php` `apiMaskSettingsRows`: เพิ่ม `is_set` และไม่ส่งค่า secret
- `public/api/auth/login.php`: เพิ่ม lockout หลังผิดเกิน `max_login_attempts` (ค่าเริ่มต้น 5, ล็อก 15 นาที ต่อ username+IP, ข้อความ generic ไม่เปิดเผยว่าบัญชีมีอยู่หรือไม่) — ใช้กลไก iot_rate_limits เดิม (ไม่มี schema ใหม่)
  - รายงาน: ก่อนหน้านี้มี rate limit 10 ครั้ง/ชั่วโมงต่อ username ผ่าน iot_rate_check อยู่แล้ว แต่ `max_login_attempts` (default 5) ไม่ได้ถูกบังคับใช้ → เพิ่ม lockout ตามค่า setting แล้ว
- Frontend `settings/page.tsx`: ใช้ `isSensitiveKey()` heuristic + `row.is_set` แสดง "ตั้งค่าแล้ว"/"ยังไม่ได้ตั้งค่า"; ไม่แสดงค่า secret
- ThemeProvider และหน้า login ใช้ public endpoint (unauth) และไม่พัง

## 2. ยังไม่แก้และเหตุผล
- `settings_audit_log` ประวัติเดิม: ตรวจพบ 1 แถว ไม่มีแถวที่เข้าข่าย secret (0 แถวที่เป็น secret) → ไม่ต้อง mask ข้อมูลเก่า; รอคำสั่งก่อนแก้ (ตามกติกา)
- `audit_logs` (9745 แถว): module='settings' 0 แถว; encodeAuditValue ตัด secret keys ออกแล้ว
- ปุ่ม "เบิกอะไหล่" (issue_center) ยังไม่มี route → ยังซ่อน (ไม่เกี่ยวกับขั้นนี้)

## 3. ให้ตัดสินใจ
- (ไม่มีรายการค้างจากขั้น 1)

## 4. ผลเทสทั้งชุด
- tsc --noEmit: PASS (0 errors)
- scripts/design-audit.py --diff HEAD: PASS (0 FAIL, 0 WARN)
- Playwright ทั้งชุด (166 tests): 166 passed, 0 failed
- ลบข้อมูลทดสอบ: e2e_* active = 0
- Probe: User/Viewer/Officer-Read/Operate อ่าน settings ไม่ได้ (403); roles ที่มี settings:view (Admin/Manager/AsstManager/Foreman/Officer/Officer-Read) อ่านได้; secret value leaks = 0; is_set present = yes
- Public endpoint: 15 keys (branding/theme/support/i18n/date/andon) คืนค่าได้โดยไม่ล็อกอิน
- Lockout: ผิด 5 ครั้ง → ครั้งที่ 6 ได้ ACCOUNT_LOCKED (15 นาที)
- git status: เฉพาะไฟล์ที่ตั้งใจแก้

## 5. BUILD_ID และ commit hash
- BUILD_ID: TmG1DPnVeuQzeN09b0p5F
- commit hash: f768d08650e7e096edd3642c26ed74289f9e4484 (ยังไม่ commit การแก้ใหม่)

---

## ขั้น 1 (ต่อ) — 2026-11-22

### 1. แก้แล้ว
- `public/api/v1/settings.php`: GET รายการเต็ม / `?id=` / `?defaults` ต้อง `settings:manage` (Admin); role อื่นได้เฉพาะระดับ B (กรอง admin-only keys ฝั่งเซิร์ฟเวอร์)
- `src/helpers/api_permissions.php`: `master_data.php`/`departments.php` read = null (ไม่ต้อง settings:view)
- `src/helpers/permissions.php`: ถอด `settings:view` ออกจาก role 2,6,7,8 และ Officer-Read; คง `settings` ใน role 1 เพื่อให้ my_permissions คืน action list
- `public/api/auth/login.php`: IP จาก trusted proxy เท่านั้น (loopback), timing normalization สำหรับบัญชีที่ไม่มีจริง, ล็อกอินสำเร็จล้างตัวนับ
- `scripts/unlock_login.php`: CLI ปลดล็อกตัวนับ (username หรือ --all-e2e)
- `frontend/app/(dashboard)/settings/page.tsx`: guard 403 สำหรับ non-admin + ไม่ fetch เมื่อไม่มีสิทธิ์
- `frontend/tests/e2e/settings-security.spec.ts`: 13 เทสใหม่ (scope, 403, secret values, unauth public)

### 2. ยังไม่แก้และเหตุผล
- หมุน secret: ไม่ได้แก้ค่าใดๆ ตามกติกา (รอผู้ใช้ตัดสินใจ) — key ที่เคยถูกส่งออกแบบ plain ให้ role ที่ล็อกอินทุก role ก่อนแก้: ทุก key ใน SENSITIVE (line_channel_*, smtp_pass, telegram_bot_token, vapid_*, ntfy_token) เพราะ GET รายการเต็มไม่มี gate
- LOTO = Foreman ขึ้นไป, User เห็นเฉพาะที่ตัวเองแจ้ง, 403 ดักที่ตัวกลาง: คงเดิม

### 3. ให้ตัดสินใจ
- (ไม่มีรายการค้างจากขั้นนี้ — secret rotation รอคำสั่งผู้ใช้)

### 4. ผลเทสทั้งชุด
- tsc --noEmit: PASS (0 errors)
- scripts/design-audit.py --diff HEAD: PASS (0 FAIL, 0 WARN)
- Playwright ทั้งชุด: 186 passed, 0 failed
- e2e_* active = 0 (teardown ลบแล้ว)
- git status: clean

### 5. BUILD_ID และ commit hash
- BUILD_ID: MR9mCmyk0xiqG3WCV7UAf
- commit hash (step 1): 4868b01b
- commit hash (deploy log): 9afd145e

## รอบที่ 2 (ขั้น 1–6) — 2026-11-22

### 1. แก้แล้ว
- **DEPLOY_LOG**: เขียนใหม่เป็นตาราง BUILD_ID ↔ commit เดียวต่อแถว พร้อมหลักฐาน; อธิบายว่า hash ต่างกันเพราะ **amend + reset** (ไม่ใช่ rebase/squash) — TmG1 ที่เคยคู่กับ 4868b01b เป็นการบันทึกผิด (commit นั้นเกิดหลัง deploy)
- **allowlist settings**: `src/helpers/api.php` กำหนดระดับ ก = 20 key (public), ข = 317 key (login ทุก role), นอกนั้น = Admin อัตโนมัติ; `apiSettingsAdminOnlyKey()` ใช้ allowlist นี้ (เดิมเป็น heuristic) — key ใหม่ในอนาคตจึงเป็น Admin โดยปริยาย
- **secret write**: `settings.php`, `line_notify.php`, `email_notify.php` ไม่เขียนทับ secret เมื่อได้รับค่าว่างหรือค่า mask (เดิมกันเฉพาะ mask); ไม่มี DELETE ใน settings (405) จึงลบค่าไม่ได้จากการบันทึกปกติ; audit เก็บ old/new เป็น mask เท่านั้น
- **login lockout**: วัดจริงแล้วทุกเส้นทาง (localhost และ IIS :8081) PHP เห็น REMOTE_ADDR เป็น `::1`/`127.0.0.1` และไม่มี X-Forwarded-For/Forwarded → ระบุ IP ผู้ใช้ไม่ได้. ปรับเป็นหน่วงเวลาทวีคูณต่อ username (1,2,4,… สูงสุด 60 วิ) และ **ตัดเพดาน 10 ครั้ง/ชั่วโมงต่อ username เมื่อ IP ไม่ยืนยัน** (เดิมเป็นช่อง DoS ที่ล็อกบัญชีทั้งชั่วโมง) — ล็อกเต็ม 15 นาทียังใช้เฉพาะเมื่อ IP จริงระบุได้; บัญชีที่ไม่มีจริงนับและตอบเหมือนบัญชีจริง; สำเร็จล้างตัวนับ
- **interceptor**: เพิ่ม `settings`/`settings.php` ในรายการ endpoint สาธารณะของ `ApiFetchInterceptor`
- **เทสใหม่ 28**: allowlist/feature-read (8), secret write ก–ง (ฝังในชุดเดียวกัน), lockout (5), LOTO matrix 11 ตัว, interceptor (4) + fixture `frontend/tests/e2e/fixtures/security-probe.php` (สร้าง/ลบ key `e2e_probe_*` เอง)

### 2. ยังไม่แก้และเหตุผล
- **zrok**: ตรวจไม่ได้ — process zrok2 รันอยู่แต่ service ล่ม (log: DNS ไม่พบ host และ TLS certificate ไม่ถูกต้องสำหรับ netfoundry.io) จึงวัด REMOTE_ADDR ผ่าน zrok ไม่ได้; บันทึกผลวัดเฉพาะ localhost/IIS
- **secret rotation**: ไม่ได้หมุนค่าใด ๆ ตามกติกา (ทดสอบด้วย key `e2e_probe_*` เท่านั้น)
- **ไฟล์ `docs/phase7_read_raw.json`, `docs/security_matrix_raw.json`**: เป็น artifact ที่สคริปต์เทสเขียนทับทุกครั้ง ผลต่างกันทั้งสองทิศทาง (200↔403) ตามลำดับการรัน — คืนค่าเป็น HEAD เพื่อไม่ให้ commit ปนกับงานนี้
- **LOTO/สิทธิ์อื่น**: `canApproveType()` ตรงสเปกอยู่แล้ว (loto/spare_issue/pm = Foreman+; repair/requisition/work_permit = Manager+) — ไม่แก้โค้ด เพิ่มเทสยืนยัน

### 3. ให้ตัดสินใจ
- ไม่มีรายการค้างที่ต้องตัดสินใจในรอบนี้; รอคำสั่งเรื่องการหมุน secret จริงผ่านหน้า /settings และ /settings/notifications

### 4. ผลเทสทั้งชุด (รอบเดียว)
- `tsc --noEmit`: PASS (0 errors)
- `python scripts/design-audit.py`: PASS (0 FAIL, 0 WARN, 265 หน้า)
- Playwright ทั้งชุด: **213 passed, 0 failed, 0 not run** (ก่อนงานรอบนี้ suite มี 185 — รายงานรอบก่อนบันทึก 186 ซึ่ง reproduces ไม่ได้; เทสใหม่ 28 ตัว)
- ข้อมูลทดสอบ: `e2e_probe_*` settings = 0, E2E-LOTO = 0, audit probe = 0, `e2e_*` active = 0
- git status: สะอาดก่อน deploy; deploy 30/30 checks

### 5. BUILD_ID และ commit hash จริงของรุ่นที่ deploy
- BUILD_ID: **htWEsqvUdXnCZgebfn3yN**
- commit: **c9dbb3fd** (feat(settings): explicit allowlist, secret write guards, proxy-safe login delay), tree สะอาดตอน build
- ตรวจหลัง deploy: /login /repair /repair/request /pm_am /spare_parts /dashboard /settings /asset_registry /asset_registry/view?id=91 = 200 ทุกตัว; JS chunk `/_next/static/chunks/3w6hr1d8ttui-.js` = 200 application/javascript
