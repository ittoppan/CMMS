# SECURITY_FIX_REPORT

## รายการที่ต้องตัดสินใจ / ความลับ
- ไม่พบ .env ตอบ 200 ในการ probe (Phase 1) → ไม่ต้อง rotate secrets
- ต้องตัดสินใจ (Phase 3): endpoint ที่ยังไม่ enforced และอาจกระทบ role ปกติ:
  - repair.php, spare_parts.php, spare_issue_request.php, stock_take.php, inspections.php, checklist_templates.php, form_templates.php, forms.php, equipment_borrowing (enforced แล้ว), suppliers (enforced แล้ว), planning.php, supervisor.php, asset_registry.php (enforced แล้ว), pm_am.php (enforced แล้ว), approval.php, custom_pages/page_editor/pwa_settings/ngrok (ทำใน Phase 3 แล้ว), mtbf_mttr/production_hours (ทำแล้ว), sage_shipments, permission_diff, system_services (enforced แล้ว)
  - ยังไม่ enforce: repair, spare_parts, spare_issue_request, stock_take, inspections, checklist_templates, form_templates, forms, planning, supervisor, approval, sage_shipments, permission_diff, users (enforced), roles (enforced), menu_permissions (enforced), sage_sync (enforced), import_excel (write เปลี่ยนเป็น settings:manage)
- Phase 5: เพิ่ม profile row สำหรับ role 8 (Officer) แล้ว; onboarding ใช้ master_data.php/roles.php/users.php ที่ enforce แล้ว (settings:manage / roles:manage / users:manage) → เข้าได้เฉพาะ Admin/Manager/Asst.Manager

## Phase 1: ไฟล์ที่ไม่ควรเปิดจากเว็บ
- พบ/แก้: web.config hardened (hiddenSegments + fileExtensions 403/404) — commit b80ffb2f
- Probe ทุก URL ที่ควรบล็อก → 404; หน้าหลัก /login, /repair, /api/v1/health → 200
- ไม่ลบไฟล์ใดๆ

## Phase 2: สิทธิ์เขียน API Dashboard ใหม่
- เพิ่ม permission modules shift_handover, utility_energy, lubrication (write) ใน src/helpers/permissions.php
- shift_handover.php, utility_energy.php, lubrication.php: GET ใช้ view, POST/PUT/DELETE ใช้ write
- Frontend ใช้ useCan ซ่อนฟอร์ม; สร้างบัญชี e2e_operate (role 3)
- Playwright phase2-write-perms.spec.ts: 3/3 passed

## Phase 3: endpoint ที่ grep ไม่พบ requirePerm
- เปิด enforcement ใน api_permissions.php สำหรับ custom_pages, page_editor, pwa_settings, ngrok, mtbf_mttr, production_hours
- เปลี่ยน import_excel write จาก report:export เป็น settings:manage (กัน Officer-Read import)
- Playwright phase3-lowrole.spec.ts: 3/3 passed (User/Viewer/Officer-Read → 401/403)

## Phase 4: อัปโหลดและ endpoint สาธารณะ
- Uploads folder ถูก harden แล้ว (web.config handlers accessPolicy Read, deny .php/.phtml/.svg, nosniff+CSP)
- Upload endpoints (repair_attachment, repair_form_attachment, repair_video, profile, inspection_execute, pwa_settings) ใช้ finfo + size + random name อยู่แล้ว
- forms.php: เพิ่ม finfo MIME validation (defense in depth)
- iot_ingest ใช้ hash_equals; line_webhook ใช้ hash_equals (HMAC); system_health/index ไม่มี user input ใน SQL

## Phase 5: เก็บตก
- เพิ่ม profile row สำหรับ role 8 (Officer) (idempotent, สำรองตารางก่อน)
- predictive-ai/page.tsx: "—" → "ไม่มีข้อมูล"
- onboarding ใช้ endpoint ที่ enforce แล้ว
- แก้ตัวเลข docs/DASHBOARD_BUILD.md: registry 26 → 31 รายการ

## ผลเทส
- tsc --noEmit: passed
- Playwright phase2-write-perms.spec.ts: 3/3 passed
- Playwright phase3-lowrole.spec.ts: 3/3 passed

## Phase 6: ปิดช่อง endpoint ที่ยังไม่บังคับสิทธิ์

### (1) แก้แล้ว
- เปิด enforcement ใน api_permissions.php สำหรับ stock_take, spare_parts, spare_issue_request, checklist_templates, forms, repair (GET)
- stock_take.php: granular role check (สร้าง/นับ: Operate+; ปิดรอบ/ปรับยอด/ยกเลิก/ลบ: Foreman+/Manager+)
- spare_issue_request.php: canApprove ขยายเป็น Foreman+ (อนุมัติ/ปฏิเสธ)
- repair.php: permission check ก่อน validation (repair:create สำหรับผู้ login) + validation 400 แทน 500 (root cause: title missing → DB constraint) + User ownership scoping (GET list และ ?id=)
- permissions.php: Foreman spare_parts +edit/+plan; Officer ตัด edit/plan และ sage write; เพิ่ม User (role 9) matrix ขั้นต่ำ
- sage_shipments: Officer ไม่สามารถเขียนได้ (sage:write ถูกตัด)
- GET permissions ตามเมนู: User ไม่เห็น spare_parts/spare_issue_request/stock_take/checklist_templates/forms/approval; Viewer ไม่เห็น approval
- Playwright phase6-perm.spec.ts: 5/5 passed

### (2) ยังไม่แก้และเหตุผล
- approval.php ยังเป็น token-based (email/line link) — ไม่เปลี่ยนตามคำสั่งรอตัดสิน
- inspections.php, form_templates.php มี internal role check บางส่วน; GET ยังเปิดทุก role ที่มี inspection:view (ตามเมนู) — ไม่เปลี่ยนเพราะผลทดสอบยืนยันว่าถูกแล้ว
- repair.php GET สำหรับ Viewer ยังเปิด (repair:view) — Viewer มีเมนู repair (อ่านอย่างเดียว) ตาม ROLE_MENUS

### (3) ให้ตัดสินใจ (ยังไม่ได้แก้จริง)
- approval: ประเภทอนุมัติ repair/requisition/loto/pm/spare_issue; ปัจจุบัน create_request ต้อง request:approve (Manager+); Foreman เห็นเมนูแต่ POST 403
  - ข้อเสนอ: Foreman ควรอนุมัติ PM, LOTO, spare_issue (งานภาคสนาม); Manager+ อนุมัติ repair, requisition
  - ตาราง: ประเภทอนุมัติ | role ที่อนุมัติได้ปัจจุบัน | ข้อเสนอ
    - repair | Manager+ (1,2,6) | Manager+ (ไม่เปลี่ยน)
    - requisition | Manager+ (1,2,6) | Manager+ (ไม่เปลี่ยน)
    - loto | Manager+ (1,2,6) | Foreman+ (1,2,6,7)
    - pm | Manager+ (1,2,6) | Foreman+ (1,2,6,7)
    - spare_issue | Manager+ (1,2,6) | Foreman+ (1,2,6,7)
- User ควรเห็น repair ที่ assigned ให้ตัวเองด้วยหรือไม่ (ปัจจุบัน scope เฉพาะ created_by)
- inspections/form_templates internal check ควรย้ายมาใช้ api_permissions หรือไม่

### (4) ผลเทสทั้งชุด
- tsc --noEmit: passed
- python scripts/design-audit.py: PASS (0 fail, 0 warn)
- Playwright phase3-lowrole.spec.ts: 3/3 passed
- Playwright phase6-matrix.spec.ts: 1/1 passed
- Playwright phase6-perm.spec.ts: 5/5 passed
- ไม่พบการปรับยอดสต็อกจริง (stock_take POST สร้างรอบ draft เท่านั้น ไม่มี complete)

### (5) BUILD_ID / commit
- ก่อน deploy BUILD_ID: J8f7gMJ39gzwR4qyXzWhu
- หลัง deploy BUILD_ID: LHCwDCYDcExpY_to1elWj
- commit: c1312a1d (Phase 6D)
- ตรวจ 200: /login, /repair, /pm_am, /spare_parts, /dashboard → 200

---

## Phase 7 — บังคับสิทธิ์การอ่าน (Read enforcement) — 2026-11-22

### แก้แล้ว (backend)
- `src/helpers/permissions.php`: เพิ่มโมดูล `analytics`, `intelligence`, `notification_log`, `workload`, `machine_bom`, `reports` ใน PERMISSION_MATRIX ตามเมนู role (Mgr/Asst/Viewer/Foreman/Officer ตาม docs/ROLE_MENUS.md)
- `src/helpers/api_permissions.php`:
  - `kpi_dashboard.php`, `analytics_advanced.php`, `analytics_monthly.php` → read `analytics:view`
  - `intelligence.php`, `predictive_maintenance.php` → read `intelligence:view`
  - `reports.php` → read `reports:view`
  - `workload.php` → read `workload:view`
  - `notifications_log.php` → read `notification_log:view`
  - `feedback.php` → read `feedback:view`
  - `machine_bom.php` → read `machine_bom:view`
  - `repair_options.php` → read `repair:view` (เพื่อให้ User/Operate อ่าน dropdown แจ้งซ่อมได้)
  - เพิ่ม `predictive_maintenance.php`, `notifications_log.php`, `feedback.php` ลงใน API_PERMISSION_ENFORCED
- `src/services/ApprovalService.php`: token ใช้ random_bytes(32) (64 hex) + expires_at 7 วัน + hash_equals + ห้ามอนุมัติคำขอของตัวเอง (requester_id)
- `public/api/v1/approval.php`: requireRole(canApprove()) ก่อน processApproval
- `public/api/v1/spare_issue_request.php`: ห้ามอนุมัติ/ปฏิเสธคำขอของตัวเอง
- DB: เพิ่มคอลัมน์ `expires_at`, `requester_id` ใน approval_requests

### ยังไม่แก้ / ข้อจำกัด
- Frontend 403 handling แบบสุภาพ: ยังไม่ได้ปรับทุกหน้า (backend คืน 403 มาตรฐานแล้ว); หน้าที่ role ไม่มีสิทธิ์จะได้ error จาก API — แนะนำให้ frontend ตรวจ status 403 แล้วแสดงข้อความ
- `global_search.php`, `departments.php`, `pm_ical.php` ยังเปิด (scoped/dropdown/token-based) ตามข้อยกเว้นใน Step 2
- intelligence drill-down test (`tests/e2e/intelligence.spec.ts:80`) ล้มเหลวทั้งก่อนและหลังการเปลี่ยน (pre-existing, ไม่เกี่ยวกับ security)
- visual.spec.ts worker crash (OOM) เป็นปัญหาสภาพแวดล้อม ไม่เกี่ยวกับการเปลี่ยน

### ผลเทส
- tsc --noEmit: PASS
- python scripts/design-audit.py: PASS (0 fail 0 warn)
- php scripts/test_approval_service.php: PASS (31/31)
- Playwright: 125 passed, 3 failed (intelligence drill-down pre-existing, visual x2 OOM) — 38 did not run (timeout)

---

## Phase 7 — สรุปผล (ต่อท้าย)

### (1) แก้แล้ว
- LOTO: canApproveType() ใน src/helpers/roles.php; approval.php และ spare_issue_request.php ใช้เงื่อนไขเดียวกัน (loto/repair/requisition/work_permit = Manager+; spare_issue/pm = Foreman+)
- permissions.php ปรับ module ตาม docs/ROLE_MENUS.md (Viewer/User/Operate/Foreman/Manager/Asst/Officer/Officer-Read)
- requirePerm/api_permissions wording → "คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้"
- frontend/lib/api.ts: 401 → redirect /login กลาง; 403 → ApiError
- global_search.php: กรอง work_orders/assets/knowledge ตามสิทธิ์ role (canPerm)
- e2e_* password: ย้ายไป env (E2E_PASSWORD), random 32 ตัว, globalSetup เปิด is_active, teardown ปิด
- tsc PASS, design-audit PASS, deploy PASS

### (2) ยังไม่แก้และเหตุผล
- pm_ical.php: คืน PM plan ของทั้งโรงงานให้ผู้ใช้ที่ login ได้ทุกคน (ไม่มี token binding/role filter) — รายงานอย่างเดียวตามคำสั่ง
- global_search: ไม่กรองราคาอะไหล่ (ยังไม่มี spare_price ใน search) — ไม่เกี่ยวข้อง
- หน้าที่ใช้ fetch ตรง (ไม่ผ่านตัวกลาง) ยังไม่ย้าย — ลิสต์ไว้ใน matrix; ย้ายทั้งหมดเสี่ยงเปลี่ยน logic
- approval_requests: 0 แถวใน DB ปัจจุบัน → ไม่มี backfill
- token ใน approval_requests เก็บแบบ plain (ถ้ามีแถว)

### (3) ให้ตัดสินใจ
- ไม่มีรายการค้างที่ต้องตัดสินใจเพิ่ม (LOTO=Manager+ ไว้ก่อน, 403 ที่ตัวกลาง — ทำแล้ว)

### (4) ผลเทสทั้งชุด
- tsc: PASS
- design-audit: PASS (0 fail / 0 warn)
- Playwright: visual 54/54 pass (workers=1, NODE_OPTIONS=--max-old-space-size=4096); ชุดอื่นรันผ่าน (phase6-perm 6/6, phase7-read 1/1, phase3-lowrole 3/3, role-menus 9/9); รวมทั้งชุดผ่านเมื่อรันแยก (flaky timing ไม่ใช่ bug)
- Deploy: 30/30 checks passed

### (5) BUILD_ID / commit
- BUILD_ID: 3jZQfqLNjbfrupTwPPg-Y
- commit: 7cf207f55db20a703e67e519bac5c516ed159936
- URLs: /login /repair /repair/request /pm_am /spare_parts /dashboard → 200; JS chunk → 200

---

## Phase 8 — สรุปผล

### (1) แก้แล้ว
- intelligence drill-down: ปุ่ม "ดูใบงาน" แสดงเฉพาะแถวที่มี asset_id (แก้ null-asset row ที่ทำให้ drill ไม่ทำงาน) — `frontend/app/(dashboard)/analytics/intelligence/page.tsx`
- pm_ical.php: role-based scope (Foreman+ เห็นทั้งหมด; Operate/Officer/User/Viewer/Officer-Read เห็นเฉพาะที่ assigned ให้ตัวเอง)
- ApprovalService: เก็บ approval_token เป็น sha256 hash; processApproval ใช้ hash_equals; migration idempotent + backup table
- approval.php: lookup ด้วย hash
- frontend/lib/api.ts: 401 redirect กลาง, 403 ApiError
- e2e password: env-only, random, teardown ปิด is_active (ยืนยัน: 0 active หลังรัน)
- package.json: test:e2e:ci script

### (2) ยังไม่แก้และเหตุผล
- pm_ical token-based external access: ยังใช้ session cookie (เรียกจากหน้าเว็บ) — การเพิ่ม random token จะกระทบ flow ที่ใช้อยู่; รายงานแทนการเปลี่ยน
- หน้าที่ใช้ fetch ตรง (ไม่ผ่านตัวกลาง): ไม่ย้ายทั้งหมด (เสี่ยงเปลี่ยน logic) — ลิสต์ใน matrix
- git history ยังมีรหัสผ่านเดิม "Test@Cmms2026" ใน commit: c1312a1d, d1cfde5f, 52fe228f, 02601f74, 6e0a7192 (ไฟล์ phase2/3/6/role-menus) — ถือว่ารั่ว; รหัสผ่านถูกเปลี่ยนแล้ว (ปัจจุบันไม่ตรงกับรุ่นใน history)

### (3) ให้ตัดสินใจ
- ไม่มีรายการค้างเพิ่ม (LOTO=Manager+, 403 ที่ตัวกลาง — ทำแล้ว)

### (4) ผลเทสทั้งชุดรอบเดียว
- tsc: PASS
- design-audit: PASS
- Playwright: 166 passed, 0 failed, 0 not run (workers=1, NODE_OPTIONS=--max-old-space-size=4096, 6.2m)
- test_approval_service.php: 31/31 PASS
- Deploy: 30/30 checks passed

### (5) BUILD_ID / commit
- BUILD_ID: zas0iAWtk1_cexWsd8WXJ
- commit: (ดู git log ล่าสุด)
- URLs: /login /repair /repair/request /pm_am /spare_parts /dashboard → 200; JS chunk → 200
