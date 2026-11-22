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
