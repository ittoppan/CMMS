# API Permission Matrix — CMMS-TPT

เมทริกซ์สิทธิ์ระดับ endpoint (module : action) สำหรับ API ทั้งหมดใน `public/api/v1/`

## กลไก

- ประกาศที่เดียว: `src/helpers/api_permissions.php` (`API_ENDPOINT_PERMISSIONS`)
- บังคับใช้จาก `requireLogin()` ใน `src/auth.php` → `api_enforce_endpoint_permission()` → `requirePerm()`
- การตัดสินสิทธิ์: `src/helpers/permissions.php` → `user_permissions` (override รายคน) > `PERMISSION_MATRIX` (ค่าเริ่มต้นตาม role) 
- Admin (`role_id=1`) ผ่านทุกสิทธิ์ตามดีไซน์เดิม; ไม่มี table/schema ใหม่

## สถานะการบังคับใช้

บังคับใช้แล้วในรอบนี้ (**5 endpoint**): `users.php`, `roles.php`, `import_excel.php`, `sage_sync.php`, `sage_shipments.php`

endpoint อื่นทั้งหมดถูกประกาศสิทธิ์ไว้แล้ว แต่ **ยังไม่บังคับ** จนกว่าจะยืนยันกับผู้ใช้จริงในบทบาทนั้น
(เหตุผล: หน้าเว็บของช่าง/พนักงานคลังเรียกบาง endpoint เพื่อเติม dropdown และเมนูใน `menu_permissions`
กว้างกว่า `PERMISSION_MATRIX` ในบางโมดูล เช่น sage / import — เปิดบังคับทันทีจะทำให้ผู้ใช้จริงเจอ 403)

## ตาราง

| # | endpoint | read (GET) | write (POST/PUT/DELETE) | บังคับใช้ | guard ที่มีในโค้ดอยู่แล้ว |
|---|---|---|---|---|---|
| 1 | `analytics_advanced.php` | `report:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 2 | `analytics_monthly.php` | `report:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 3 | `approval.php` | `request:view` | `request:approve` | — | CSRF, requireLogin |
| 4 | `asset_components.php` | `asset:view` | `asset:edit` | — | requirePerm, CSRF, requireLogin |
| 5 | `asset_criticality.php` | `asset:view` | `asset:edit` | — | requirePerm, CSRF, requireLogin |
| 6 | `asset_data_quality.php` | `asset:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requirePerm, CSRF, requireLogin |
| 7 | `asset_lifecycle.php` | `asset:view` | `asset:edit` | — | requirePerm, CSRF, requireLogin |
| 8 | `asset_measurements.php` | `asset:view` | `asset:edit` | — | requirePerm, CSRF, requireLogin |
| 9 | `asset_overhauls.php` | `asset:view` | `asset:edit` | — | requirePerm, CSRF, requireLogin |
| 10 | `asset_registry.php` | `asset:view` | `asset:edit` | — | CSRF, requireLogin |
| 11 | `asset_relationships.php` | `asset:view` | `asset:edit` | — | requirePerm, CSRF, requireLogin |
| 12 | `asset_reliability.php` | `reliability:read` | `reliability:write` | — | requirePerm, CSRF, requireLogin |
| 13 | `asset_reports.php` | `report:view` | `report:export` | — | requirePerm, CSRF, requireLogin |
| 14 | `asset_stats.php` | `dashboard:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 15 | `audit_logs.php` | `audit_log:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requirePerm, CSRF, requireLogin |
| 16 | `calibration.php` | `calibration:view` | `calibration:edit` | — | requirePerm, CSRF, requireLogin |
| 17 | `calibration_management.php` | `calibration:view` | `calibration:edit` | — | requirePerm, CSRF, requireLogin |
| 18 | `calibration_tracking.php` | `calibration:view` | `calibration:edit` | — | requirePerm, CSRF, requireLogin |
| 19 | `checklist_templates.php` | `inspection:view` | `inspection:create` | — | requireLogin |
| 20 | `contractor.php` | `contractor:view` | `contractor:execute` | — | requirePerm, CSRF, requireLogin |
| 21 | `cost.php` | `report:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireRole, CSRF, requireLogin |
| 22 | `csrf.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | ไม่มี guard |
| 23 | `custom_pages.php` | `settings:view` | `settings:manage` | — | admin-only, CSRF, requireLogin |
| 24 | `dashboard.php` | `dashboard:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireRole, requireLogin |
| 25 | `departments.php` | `settings:view` | `settings:manage` | — | requireLogin |
| 26 | `document.php` | `document:view` | `document:create` | — | requirePerm, CSRF, requireLogin |
| 27 | `email_notify.php` | `settings:view` | `settings:manage` | — | requirePerm, CSRF, requireLogin |
| 28 | `engineering_change.php` | `engineering_change:view` | `engineering_change:create` | — | requirePerm, CSRF, requireLogin |
| 29 | `equipment_borrowing.php` | `spare_parts:view` | `spare_parts:issue` | — | requireLogin |
| 30 | `failure.php` | `failure:view` | `failure:edit` | — | requirePerm, CSRF, requireLogin |
| 31 | `feedback.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 32 | `form_templates.php` | `inspection:view` | `inspection:create` | — | CSRF, requireLogin |
| 33 | `forms.php` | `inspection:view` | `inspection:execute` | — | CSRF, requireLogin |
| 34 | `import_excel.php` | `report:export` | `report:export` | ✅ | CSRF, requireLogin |
| 35 | `index.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF, requireLogin |
| 36 | `inspection_dashboard.php` | `inspection:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF, requireLogin |
| 37 | `inspection_execute.php` | `inspection:view` | `inspection:execute` | — | CSRF, requireLogin |
| 38 | `inspection_history.php` | `inspection:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF, requireLogin |
| 39 | `inspections.php` | `inspection:view` | `inspection:create` | — | requireRole, CSRF, requireLogin |
| 40 | `intelligence.php` | `report:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 41 | `iot.php` | `iot:view` | `iot:write` | — | CSRF, requireLogin |
| 42 | `iot_ingest.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | ไม่มี guard |
| 43 | `knowledge.php` | `knowledge:read` | `knowledge:create` | — | requirePerm, CSRF, requireLogin |
| 44 | `kpi_dashboard.php` | `dashboard:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 45 | `line_notify.php` | `settings:view` | `settings:manage` | — | requirePerm, CSRF, requireLogin |
| 46 | `line_register.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF |
| 47 | `line_webhook.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | ไม่มี guard |
| 48 | `machine_bom.php` | `asset:view` | `asset:edit` | — | CSRF, requireLogin |
| 49 | `manuals.php` | `document:view` | `document:create` | — | requireLogin |
| 50 | `master_data.php` | `settings:view` | `settings:manage` | — | requirePerm, CSRF, requireLogin |
| 51 | `menu_permissions.php` | `settings:view` | `settings:manage` | — | admin-only, CSRF, requireLogin |
| 52 | `mtbf_mttr.php` | `reliability:read` | `reliability:write` | — | requireLogin |
| 53 | `ngrok.php` | `settings:manage` | `settings:manage` | — | admin-only, requireLogin |
| 54 | `notifications.php` | `notification:view` | `notification:view` | — | requirePerm, requireRole, CSRF, requireLogin |
| 55 | `notifications_log.php` | `notification:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 56 | `page_editor.php` | `settings:view` | `settings:manage` | — | admin-only, CSRF, requireLogin |
| 57 | `planning.php` | `repair:view` | `repair:schedule` | — | requireRole, CSRF, requireLogin |
| 58 | `pm_am.php` | `pm_am:view` | `pm_am:edit` | — | requireLogin |
| 59 | `pm_ical.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 60 | `pm_plans.php` | `pm_am:view` | `pm_am:edit` | — | requireLogin |
| 61 | `pm_reminders.php` | `pm_am:view` | `pm_am:execute` | — | CSRF, requireLogin |
| 62 | `production_hours.php` | `reliability:read` | `reliability:write` | — | CSRF, requireLogin |
| 63 | `profile.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF, requireLogin |
| 64 | `push_subscribe.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 65 | `pwa_settings.php` | `settings:view` | `settings:manage` | — | admin-only, CSRF, requireLogin |
| 66 | `reliability.php` | `reliability:read` | `reliability:write` | — | requirePerm, CSRF, requireLogin |
| 67 | `repair.php` | `repair:view` | `repair:edit` | — | CSRF, requireLogin |
| 68 | `repair_attachment.php` | `repair:view` | `repair:edit` | — | CSRF, requireLogin |
| 69 | `repair_form_attachment.php` | `repair:view` | `repair:edit` | — | CSRF |
| 70 | `repair_options.php` | `settings:view` | `settings:manage` | — | CSRF, requireLogin |
| 71 | `repair_video.php` | `repair:view` | `repair:edit` | — | CSRF |
| 72 | `report_schedule.php` | `report:view` | `report:export` | — | CSRF, requireLogin |
| 73 | `reports.php` | `report:view` | `report:export` | — | requireLogin |
| 74 | `roles.php` | `roles:view` | `roles:manage` | ✅ | admin-only, CSRF, requireLogin |
| 75 | `sage_items.php` | `sage:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
| 76 | `sage_shipments.php` | `sage:view` | `sage:write` | ✅ | CSRF, requireLogin |
| 77 | `sage_sync.php` | `sage:view` | `sage:write` | ✅ | CSRF, requireLogin |
| 78 | `scan.php` | `asset:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requirePerm, requireLogin |
| 79 | `settings.php` | `settings:view` | `settings:manage` | — | requirePerm, CSRF, requireLogin |
| 80 | `shutdown.php` | `shutdown:view` | `shutdown:plan` | — | requirePerm, CSRF, requireLogin |
| 81 | `spare_image.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | ไม่มี guard |
| 82 | `spare_issue.php` | `spare_parts:view` | `spare_parts:issue` | — | requireLogin |
| 83 | `spare_issue_request.php` | `spare_parts:view` | `spare_parts:request` | — | requireRole, CSRF, requireLogin |
| 84 | `spare_optimization.php` | `spare_parts:view` | `spare_parts:plan` | — | requirePerm, CSRF, requireLogin |
| 85 | `spare_parts.php` | `spare_parts:view` | `spare_parts:edit` | — | CSRF, requireLogin |
| 86 | `spare_usage.php` | `spare_parts:view` | `spare_parts:request` | — | requireRole, requireLogin |
| 87 | `stock_take.php` | `spare_parts:view` | `spare_parts:plan` | — | CSRF, requireLogin |
| 88 | `supervisor.php` | `repair:view` | `repair:verify` | — | requireRole, CSRF, requireLogin |
| 89 | `suppliers.php` | `supplier:view` | `supplier:edit` | — | requireLogin |
| 90 | `system_health.php` | `settings:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF, requireLogin |
| 91 | `system_services.php` | `settings:manage` | `settings:manage` | — | admin-only, CSRF, requireLogin |
| 92 | `upload.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | CSRF, requireLogin |
| 93 | `user_lookup.php` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | ไม่มี guard |
| 94 | `users.php` | `users:view` *เฉพาะเมื่อมี ?id=* | `users:manage` | ✅ | CSRF, requireLogin |
| 95 | `work_permit.php` | `safety:view` | `safety:create` | — | requirePerm, CSRF, requireLogin |
| 96 | `workforce.php` | `workforce:view` | `workforce:manage` | — | requirePerm, CSRF, requireLogin |
| 97 | `workload.php` | `repair:view` | — (เปิดให้ผู้ใช้ที่ล็อกอิน) | — | requireLogin |
- `2` = Manager
- `3` = Operate
- `5` = Viewer
- `6` = Asst.Manager
- `7` = Foreman
- `8` = Officer
- `9` = User

## ข้อควรรู้ / งานถัดไป

1. **Officer (role 8)** เดิมไม่มีใน `PERMISSION_MATRIX` → `canPerm()` คืน false ทุกอย่าง; รอบนี้เพิ่มเฉพาะที่เมนูอนุญาต (`users/settings/audit_log/document/report/dashboard`)
2. `users.php` — ระบุ `?id=` = ข้อมูลรายบุคคล (email/phone) จึงบังคับ `users:view`; โหมด list ยังเปิดเพราะหน้า `repair/assign`, `spare_parts/issue_center`, `pm_am/batch_schedule`, `equipment_borrowing` ใช้เติม dropdown
3. endpoint ที่ยังไม่บังคับ: เปิดได้ทีละกลุ่มหลัง UAT กับบทบาท Foreman/Operate/Officer — แก้แค่ `API_PERMISSION_ENFORCED`
4. **`sage_items.php` ยังไม่บังคับ**: `SagePartAddModal` ถูกใช้จากหน้า `repair/view` (ช่าง) และ `pm_am/plans/create` — ถ้าจะบังคับต้องเพิ่ม `sage:view` ให้ role 3/7 ก่อน
5. `import_excel.php` ใช้ `report:export` ทั้งอ่านและเขียน เพราะเมนู `reports/import_excel` ถูกจำกัดเหลือ 1,2,6 แล้ว

## การปรับ `menu_permissions` ให้ตรงกับ matrix (รอบล่าสุด)

สคริปต์: `php scripts/align_menu_permissions.php` (dry-run) / `--apply` / `--restore=backups/<ไฟล์>.json`

| menu_key | เดิม | ใหม่ |
|---|---|---|
| `roles` | 1,2,3,5,6,7,8 | **1,2,6** |
| `reports/import_excel` | 1,2,3,5,6,7,8 | **1,2,6** |
| `spare_parts/sage_sync` | 1,2,3,5,6,7,8 | **1,2,6,8** (8 = Office ดึงสต็อกจาก Sage) |
| `spare_parts/sage_shipments` | 1,2,3,5,6,7,8 | **1,2,6,7,8** (8 = Office ตัดสต็อกได้, 7 = Foreman ดูอย่างเดียว) |
| `spare_parts/sage_po` | 1,2,6,7,8 | **1,2,6,7,8** (Office + Foreman ดูแลใบสั่งซื้อ/รับของ) |

- เขียน 17 แถว (`is_granted = 0` = ซ่อนเมนู; ไม่ลบแถว) — สำรองค่าเดิมเป็น JSON ทุกครั้งก่อนเขียน
- **กระบวนการจริง:** เบิกอะไหล่ใน CMMS → **Office (role 8)** ไปตัดสต็อกใน Shipments ของ Sage 300 (คนละระบบ)
  - role 8 Officer = `sage:view` + `sage:write` (ตัดสต็อกได้)
  - role 7 Foreman = `sage:view` อ่านอย่างเดียว (ติดตามว่าตัดแล้วหรือยัง)
  - UI ซ่อนปุ่ม "ตัด/ตัดบางส่วน/ตัดครบ" และแสดง "อ่านอย่างเดียว" เมื่อ API ตอบ header `X-CMMS-Can-Write: 0`
  - role 1/2/6 คง write ไว้เพื่อแก้ข้อมูลแทน Office ได้
- **ย้อนกลับ**: `php scripts/align_menu_permissions.php --restore=backups/menu_permissions_YYYYmmdd_HHMMSS.json`
- `menu_permissions` ยังกว้างกว่า matrix ในโมดูลอื่นที่ยังไม่บังคับ (`reports/*`, `cost`, `workforce/reports`) — ปรับเพิ่มได้ด้วยการเพิ่มคู่ menu_key → role ในสคริปต์

## Read-only UI — ซ่อน/ปิดปุ่มเมื่อ “ดูได้แต่แก้ไม่ได้”

กลไกกลาง (ใช้ซ้ำได้ทุกหน้า ไม่ต้องแก้ endpoint ทีละตัว):

| ชิ้นส่วน | หน้าที่ |
|---|---|
| `src/helpers/ui_permissions.php` | `perm_module_actions()` / `ui_perm_for($pdo,$module)` / `ui_perm_header($pdo,$module)` — คำนวณสิทธิ์ราย action จาก `PERMISSION_MATRIX` |
| `GET /api/v1/my_permissions.php?module=<module>` | คืน `{module, actions:{view,create,edit,...}}` ของผู้ใช้ปัจจุบัน (ไม่มี PII, ต้องล็อกอิน) |
| `frontend/lib/useCan.ts` | hook `const can = useCan("spare_parts")` → `can("edit")`; cache ต่อ module, ค่าเริ่มต้น false (fail-closed) |

### หน้าจอที่ใช้แล้ว
| หน้า | ปุ่มที่ซ่อนเมื่อไม่มีสิทธิ์ | สิทธิ์ที่ใช้ |
|---|---|---|
| `spare_parts` | เพิ่มรายการ / แก้ไข / ลบ / อัปโหลดรูปหลายรายการ / ดึงสต็อกจาก Sage | `spare_parts:edit`, `sage:write` |
| `contractors` | สร้างผู้รับเหมาใหม่ (hero + empty state) | `contractor:create` |
| `spare_parts/sage_shipments` | ตัด / ตัดบางส่วน / ตัดครบ | `sage:write` (ผ่าน header `X-CMMS-Can-Write`) |

### ผลต่อแต่ละบทบาท (spare_parts / contractor)
| role | spare_parts | contractor |
|---|---|---|
| 1 Admin | ทุกอย่าง (bypass) | ทุกอย่าง |
| 2 Manager / 6 Asst.Manager | view/plan/request/issue/return/approve/**edit** | view/create/edit/approve/execute |
| 7 Foreman | view/request/issue/return → **อ่านอย่างเดียว** | view/execute → ไม่มีปุ่มสร้าง |
| 3 Operate | view/request → อ่านอย่างเดียว | ไม่มีสิทธิ์ |
| 5 Viewer | view → อ่านอย่างเดียว | view → อ่านอย่างเดียว |
| 8 Officer (Office) | view/request/issue/return/**edit** (ดูแลสต็อก) | ไม่มีสิทธิ์ |

> เพิ่มหน้าใหม่: เพิ่ม action ที่ต้องการใน `PERMISSION_MATRIX` ของ module นั้น → เรียก `useCan("<module>")` ในหน้า → ครอบปุ่มด้วยเงื่อนไข
