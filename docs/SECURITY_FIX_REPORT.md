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
