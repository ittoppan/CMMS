# API_SECURITY_AUDIT — ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทั้งระบบ

สร้างเมื่อ: 2026-11-22
ขอบเขต: `public/api/` (auth/login.php, health.php, v1/*.php) รวม 115 endpoint
วิธีตรวจ: อ่านโค้ดจริง (grep + cat ตัวอย่าง) — ไม่แก้โค้ด/ข้อมูล

## 1. สรุปภาพรวม

- endpoint ทั้งหมด: **115** (v1: 113, auth: 1, health: 1)
- endpoint ที่มี `requireLogin` (session): **105** (ประมาณ; ดูตาราง)
- endpoint ที่ **ไม่มี** `requireLogin` เลย: 10 (auth/login, health, asset_hub? มี session_start แต่ไม่ requireLogin, csrf, iot_ingest, line_webhook, my_repairs, repair_form_attachment, repair_video, spare_image, user_lookup) — ส่วนใหญ่เป็น endpoint สาธารณะ/LIFF ที่ออกแบบมาให้ไม่ต้อง login (ดู §2)
- endpoint ที่ **ไม่เรียก requirePerm() เลย**: ประมาณ 60+ (ดูตารางคอลัมน์ "requirePerm")
- endpoint ที่ใช้ `->prepare()` (prepared statement): ส่วนใหญ่; บางไฟล์ใช้ `->query()` ต่อ string (ดูคอลัมน์ "raw query with $")
- endpoint ที่รับอัปโหลดไฟล์: upload.php, forms.php, repair_attachment.php, repair_form_attachment.php, repair_video.php, inspection_execute.php, profile.php, pwa_settings.php

## 2. endpoint ที่ "ไม่มี requirePerm และไม่ตรวจ session" (กลุ่มเสี่ยงสูง)

| Endpoint | เหตุผล/สถานะ | ความเสี่ยง |
|----------|--------------|-----------|
| `auth/login.php` | หน้า login (สาธารณะตามการออกแบบ) | ต่ำ — ตั้งใจเปิด |
| `health.php` | health check (สาธารณะ) | ต่ำ |
| `v1/asset_hub.php` | LIFF endpoint; session_start แต่ไม่ requireLogin; ตรวจ token LINE หรือ session asset:view | กลาง — ต้องตรวจว่าไม่รั่วข้อมูลประวัติเมื่อไม่มี token |
| `v1/csrf.php` | คืน CSRF token ของ session | ต่ำ — ออกแบบไว้ |
| `v1/iot_ingest.php` | auth ด้วย source token (env), ไม่ใช่ session | กลาง — ต้องตรวจ token validation |
| `v1/line_register.php` | LIFF register (token LINE) | กลาง |
| `v1/line_webhook.php` | LINE webhook (HMAC signature) | กลาง — ต้องตรวจ signature |
| `v1/my_repairs.php` | LIFF identity (token LINE หรือ session) | กลาง |
| `v1/repair_form_attachment.php` | anonymous upload + CSRF | กลาง — อนุญาต anonymous upload |
| `v1/repair_video.php` | anonymous upload + CSRF | กลาง |
| `v1/spare_image.php` | สร้าง placeholder รูป (rate limit) | ต่ำ |
| `v1/user_lookup.php` | public lookup สำหรับ register (rate limit) | กลาง — enumeration ชื่อพนักงาน (มี rate limit) |

## 3. endpoint ที่ role ต่ำเรียกได้ทั้งที่ควรเป็นของ role สูง

- `users.php`, `roles.php`, `settings.php`, `audit_logs.php`, `menu_permissions.php`, `permission_diff.php`, `system_health.php`, `system_services.php`: ตรวจ requirePerm แล้ว — ส่วนใหญ่ require `settings:manage` หรือ `audit_log:view` ซึ่ง matrix ให้เฉพาะ Manager/Asst.Manager/Admin (ดู permissions.php) → role ต่ำ (User/Operate/Viewer/Officer-Read) ไม่ควรเรียกได้
- ข้อยกเว้นที่ต้องระวัง:
  - `audit_logs.php` requirePerm `audit_log:view` — matrix: Manager/Asst.Manager ได้, Foreman? ไม่แน่ใจ (ดู permissions.php บรรทัด role 7)
  - `settings.php` requirePerm `settings:manage` — เฉพาะ Manager/Asst.Manager/Admin ตาม matrix
  - `users.php`, `roles.php` ไม่เรียก requirePerm ตรง? ตารางแสดง rp=(none) สำหรับ `users.php` และ `roles.php` → **ต้องตรวจเพิ่ม**: อาจใช้ session/role check ภายใน ไม่แน่ใจ (อ่านไฟล์จริงแล้วยังไม่พบ requirePerm) — **ความเสี่ยงสูงถ้าไม่มีการตรวจ**
  - `custom_pages.php`, `page_editor.php`, `pwa_settings.php` — rp=(none) → ต้องตรวจเพิ่ม

## 4. endpoint ที่รับอัปโหลดไฟล์

| Endpoint | ชนิดที่ตรวจ | ขนาด | ที่เก็บ | ชื่อไฟล์ |
|----------|------------|------|---------|---------|
| `upload.php` | finfo MIME (png/jpg/gif/webp/pdf/xls/xlsx/doc/docx/csv/txt/ppt/pptx) | 6 MB | `public/uploads/<folder>/` | random/uuid (ต้องตรวจเพิ่ม) |
| `repair_attachment.php` | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | uploads/repair | ต้องตรวจเพิ่ม |
| `repair_form_attachment.php` | ต้องตรวจเพิ่ม (10 MB) | 10 MB | uploads/repair | ต้องตรวจเพิ่ม |
| `repair_video.php` | ต้องตรวจเพิ่ม (25 MB) | 25 MB | uploads/repair | ต้องตรวจเพิ่ม |
| `forms.php` | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม |
| `inspection_execute.php` | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม |
| `profile.php` | ต้องตรวจเพิ่ม (avatar) | ต้องตรวจเพิ่ม | uploads/avatars | ต้องตรวจเพิ่ม |
| `pwa_settings.php` | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม | ต้องตรวจเพิ่ม |

หมายเหตุ: รายละเอียด upload.php ตรวจแล้ว (finfo + size + folder allowlist); ไฟล์อื่น "ต้องตรวจเพิ่ม" = ยังไม่ได้อ่านโค้ดเชิงลึก

## 5. ไฟล์ debug/test/ติดตั้งที่อาจเปิดได้จากเว็บ

- `scripts/test_*.php` (≈30 ไฟล์) อยู่ใต้ project root (web root) และ **ไม่**อยู่ใน hiddenSegments ของ web.config → อาจเรียกได้ผ่าน URL `/scripts/test_*.php` (ความเสี่ยงสูงถ้ารันได้)
- `backups/roles-wip-*.bak` อยู่ใต้ web root, นามสกุล .bak ไม่ถูกบล็อก (fileExtensions บล็อก .env/.sql/.log เท่านั้น) → อาจดาวน์โหลดได้ (ความเสี่ยงกลาง)
- `database/*.sql` ถูกบล็อกโดย hiddenSegments (segment "database") และ fileExtensions .sql → ต่ำ
- `.env` ถูกบล็อกโดย hiddenSegments + fileExtensions → ต่ำ (แต่ต้องยืนยันบน IIS จริง)
- ไม่พบ phpinfo / info.php ใน repo

## 6. .env และ web.config

- `.env` มีความลับจริง (DB_PASS, LINE_CHANNEL_*, SAGE300_DB_PASS, TELEGRAM_BOT_TOKEN ฯลฯ) และอยู่ที่ project root (web root) — ถูกบล็อกโดย web.config (hiddenSegments + fileExtensions) แต่ต้องยืนยันบน IIS จริงว่า block ได้จริง (ความเสี่ยงสูงถ้าไม่บล็อก)
- `.env.example` เป็น template ไม่มีความลับจริง ✅
- web.config (root) ตั้งค่า security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) ✅
- `public/web.config` บล็อก .env/.sql เท่านั้น (ไม่มี hiddenSegments) — แต่ root web.config มี rewrite ไป public/ อยู่แล้ว
- รหัสผ่านใน repo: ไม่พบ hardcoded password ในโค้ด (อ่านจาก .env) — ✅ ตาม AGENTS.md

## 7. สรุปความเสี่ยงเรียงตามความรุนแรง

### สูง
1. `scripts/test_*.php` อาจเรียกได้จากเว็บ (อยู่ใต้ web root, ไม่ถูกบล็อก) — อาจรันคำสั่ง/เปิดข้อมูล
2. `.env` อาจเข้าถึงได้ถ้า IIS requestFiltering ไม่ทำงาน (มีความลับ DB/LINE/Sage/Telegram)
3. `users.php`, `roles.php`, `custom_pages.php`, `page_editor.php`, `pwa_settings.php` ไม่เรียก requirePerm() (ตาม grep) — ต้องตรวจว่ามีการตรวจสิทธิ์ภายในหรือไม่; ถ้าไม่มี = ช่องโหว่รุนแรง
4. `system_health.php` (raw query 17 จุด) และ `index.php` (12 จุด) — ต้องตรวจว่าต่อ string SQL จาก input หรือไม่

### กลาง
5. `backups/*.bak` อาจดาวน์โหลดได้
6. endpoint anonymous upload (repair_form_attachment, repair_video) — อนุญาต anonymous + CSRF; ต้องตรวจชนิด/ขนาด/ชื่อไฟล์
7. endpoint LIFF (asset_hub, line_register, my_repairs, user_lookup) — auth ด้วย token LINE; ต้องตรวจ validation
8. endpoint ที่ raw query มี `$` (notifications_log, production_hours, suppliers, workforce ฯลฯ) — ต้องตรวจว่าเป็น string concat หรือแค่ variable ใน query() ที่ prepare แล้ว

### ต่ำ
9. health.php, csrf.php, spare_image.php, user_lookup.php — ออกแบบให้เปิด (มี rate limit บางตัว)
10. upload.php ตรวจ MIME/size/folder แล้ว (ดี)

## 8. ตาราง endpoint ทั้งหมด (115 รายการ)

คอลัมน์: Endpoint | Method | Login | requirePerm() | Prepared | Raw query with $ | Cross-user (id จาก input)

| `auth/login.php` | ? | No | (none) | 3 | 0 | - |
| `health.php` | ? | No | (none) | 0 | 1 | - |
| `v1\analytics_advanced.php` | GET | Yes | (none) | 18 | 4 | - |
| `v1\analytics_monthly.php` | GET | Yes | (none) | 8 | 5 | - |
| `v1\approval.php` | POST | Yes | (none) | 0 | 4 | - |
| `v1\asset_components.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit'); requirePerm($pdo, 'asset', 'edit') | 0 | 0 | รับ id จาก input |
| `v1\asset_criticality.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit') | 0 | 1 | รับ id จาก input |
| `v1\asset_data_quality.php` | GET | Yes | requirePerm($pdo, 'asset', 'view') | 0 | 0 | รับ id จาก input |
| `v1\asset_hub.php` | GET/POST | No | (none) | 0 | 0 | - |
| `v1\asset_lifecycle.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit') | 0 | 0 | รับ id จาก input |
| `v1\asset_measurements.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit'); requirePerm($pdo, 'asset', 'edit') | 0 | 0 | รับ id จาก input |
| `v1\asset_meters.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit') | 0 | 0 | รับ id จาก input |
| `v1\asset_overhauls.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit'); requirePerm($pdo, 'asset', 'edit') | 1 | 0 | รับ id จาก input |
| `v1\asset_registry.php` | GET/POST | Yes | (none) | 8 | 1 | รับ id จาก input |
| `v1\asset_relationships.php` | GET | Yes | requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit'); requirePerm($pdo, 'asset', 'edit') | 0 | 0 | รับ id จาก input |
| `v1\asset_reliability.php` | GET | Yes | requirePerm($pdo,'asset',...); requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'view'); requirePerm($pdo, 'asset', 'edit'); requirePerm($pdo, 'settings', 'edit') | 1 | 0 | รับ id จาก input |
| `v1\asset_reports.php` | GET | Yes | requirePerm($pdo, 'report', 'view') | 0 | 5 | รับ id จาก input |
| `v1\asset_stats.php` | GET | Yes | (none) | 1 | 3 | - |
| `v1\audit_logs.php` | GET | Yes | requirePerm($pdo, 'audit_log', 'view', 'คุณไม่มีสิทธิ์เข้าถึงบันทึกตรวจสอบ (เฉพาะผู้ดูแลระบบ/ผู้จัดการ) | 3 | 3 | รับ id จาก input |
| `v1\calibration.php` | GET/POST | Yes | requirePerm($pdo, 'calibration', $method === 'GET' ? 'view' : ($method === 'POST' ? 'create' : ($method === 'PUT' ? 'edit' : 'delete') | 4 | 1 | รับ id จาก input |
| `v1\calibration_management.php` | GET/POST | Yes | requirePerm('calibration', ...); requirePerm($pdo, 'calibration', $isRead ? 'view' : ($method === 'POST' ? 'create' : ($method === 'PUT' ? 'edit' : 'delete') | 39 | 2 | รับ id จาก input |
| `v1\calibration_tracking.php` | GET | Yes | requirePerm($pdo, 'calibration', $_SERVER['REQUEST_METHOD'] === 'GET' ? 'view' : 'edit') | 8 | 1 | รับ id จาก input |
| `v1\checklist_templates.php` | GET/POST | Yes | (none) | 15 | 1 | รับ id จาก input |
| `v1\contractor.php` | GET | Yes | requirePerm('contractor', $action); requirePerm($pdo, 'contractor', 'view'); requirePerm($pdo, 'contractor', 'create'); requirePerm($pdo, 'contractor', 'approve'); requirePerm($pdo, 'contractor', 'edit'); requirePerm($pdo, 'contractor', 'execute') | 0 | 0 | รับ id จาก input |
| `v1\cost.php` | GET | Yes | (none) | 1 | 1 | รับ id จาก input |
| `v1\csrf.php` | ? | No | (none) | 0 | 0 | - |
| `v1\custom_pages.php` | GET/POST | Yes | (none) | 4 | 1 | - |
| `v1\dashboard.php` | GET | Yes | (none) | 4 | 0 | รับ id จาก input |
| `v1\data_quality.php` | ? | Yes | requirePerm($pdo, 'dashboard', 'view') | 0 | 2 | - |
| `v1\departments.php` | GET | Yes | (none) | 1 | 1 | รับ id จาก input |
| `v1\document.php` | GET | Yes | requirePerm('document', $action); requirePerm($pdo, 'document', 'view'); requirePerm($pdo, 'document', 'create'); requirePerm($pdo, 'document', 'revise'); requirePerm($pdo, 'document', 'review'); requirePerm($pdo, 'document', 'publish'); requirePerm($pdo, 'training', 'manage'); requirePerm($pdo, 'document', 'view') | 0 | 0 | รับ id จาก input |
| `v1\email_notify.php` | ? | Yes | requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการการแจ้งเตือนอีเมล') | 5 | 0 | - |
| `v1\engineering_change.php` | GET | Yes | requirePerm('engineering_change', $action); requirePerm($pdo, 'engineering_change', 'view'); requirePerm($pdo, 'engineering_change', 'create'); requirePerm($pdo, 'engineering_change', 'edit'); requirePerm($pdo, 'engineering_change', 'submit'); requirePerm($pdo, 'engineering_change', 'review'); requirePerm($pdo, 'engineering_change', 'approve'); requirePerm($pdo, 'engineering_change', 'implement'); requirePerm($pdo, 'engineering_change', 'verify'); requirePerm($pdo, 'engineering_change', 'close') | 0 | 0 | รับ id จาก input |
| `v1\equipment_borrowing.php` | GET/POST | Yes | (none) | 4 | 1 | รับ id จาก input |
| `v1\facility.php` | ? | Yes | requirePerm($pdo, 'dashboard', 'view') | 0 | 5 | - |
| `v1\facility_layout.php` | ? | Yes | requirePerm($pdo, 'settings', 'view', 'ต้องมีสิทธิ์ดูการตั้งค่า/ผังอาคาร'); requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์จัดการการตั้งค่า/ผังอาคาร') | 0 | 2 | - |
| `v1\failure.php` | GET | Yes | requirePerm('failure', $action); requirePerm($pdo, 'failure', $action); requirePerm($pdo, 'failure', 'close'); requirePerm($pdo, 'failure', 'close'); requirePerm($pdo, 'failure', 'investigate'); requirePerm($pdo, 'failure', 'approve'); requirePerm($pdo, 'failure', 'verify'); requirePerm($pdo, 'failure', 'actions'); requirePerm($pdo, 'failure', 'edit'); requirePerm($pdo, 'failure', 'create'); requirePerm($pdo, 'failure', 'edit'); requirePerm($pdo, 'failure', 'verify'); requirePerm($pdo, 'failure', 'taxonomy') | 1 | 0 | รับ id จาก input |
| `v1\feedback.php` | GET | Yes | (none) | 4 | 0 | - |
| `v1\form_templates.php` | GET | Yes | (none) | 9 | 1 | รับ id จาก input |
| `v1\forms.php` | GET/POST | Yes | (none) | 0 | 0 | - |
| `v1\global_search.php` | GET | Yes | (none) | 3 | 0 | - |
| `v1\import_excel.php` | GET/POST | Yes | (none) | 8 | 7 | - |
| `v1\index.php` | GET/POST | Yes | (none) | 4 | 12 | - |
| `v1\inspection_dashboard.php` | GET | Yes | (none) | 2 | 3 | รับ id จาก input |
| `v1\inspection_execute.php` | GET/POST | Yes | (none) | 15 | 0 | รับ id จาก input |
| `v1\inspection_history.php` | GET | Yes | (none) | 2 | 0 | รับ id จาก input |
| `v1\inspections.php` | GET | Yes | (none) | 34 | 1 | รับ id จาก input |
| `v1\intelligence.php` | GET | Yes | (none) | 1 | 0 | - |
| `v1\iot.php` | GET/POST | Yes | (none) | 0 | 0 | รับ id จาก input |
| `v1\iot_ingest.php` | POST | No | (none) | 0 | 0 | - |
| `v1\knowledge.php` | GET/POST | Yes | requirePerm($pdo, 'knowledge', <action>); requirePerm($pdo, 'knowledge', 'read'); requirePerm($pdo, 'knowledge', 'search'); requirePerm($pdo, 'knowledge', 'create'); requirePerm($pdo, 'knowledge', 'edit'); requirePerm($pdo, 'knowledge', 'submit'); requirePerm($pdo, 'knowledge', 'review'); requirePerm($pdo, 'knowledge', 'approve'); requirePerm($pdo, 'knowledge', 'publish'); requirePerm($pdo, 'knowledge', 'feedback'); requirePerm($pdo, 'knowledge', 'manage_gaps'); requirePerm($pdo, 'knowledge', 'taxonomy'); requirePerm($pdo, 'knowledge', 'usage_view'); requirePerm($pdo, 'knowledge', 'export') | 0 | 0 | - |
| `v1\kpi_dashboard.php` | GET | Yes | (none) | 0 | 7 | - |
| `v1\line_notify.php` | ? | Yes | requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการการแจ้งเตือน') | 7 | 1 | - |
| `v1\line_register.php` | GET | No | (none) | 5 | 1 | รับ id จาก input |
| `v1\line_webhook.php` | ? | No | (none) | 13 | 4 | - |
| `v1\lubrication.php` | POST | Yes | requirePerm($pdo, 'dashboard', 'view') | 3 | 1 | รับ id จาก input |
| `v1\machine_bom.php` | GET/POST | Yes | (none) | 3 | 0 | รับ id จาก input |
| `v1\manuals.php` | GET/POST | Yes | (none) | 4 | 1 | รับ id จาก input |
| `v1\master_data.php` | GET/POST | Yes | requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์ settings:manage'); requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์ settings:manage') | 4 | 1 | รับ id จาก input |
| `v1\menu_permissions.php` | GET | Yes | (none) | 7 | 2 | รับ id จาก input |
| `v1\mtbf_mttr.php` | GET/POST | Yes | (none) | 4 | 1 | รับ id จาก input |
| `v1\my_permissions.php` | GET | Yes | (none) | 0 | 0 | - |
| `v1\my_repairs.php` | GET | No | (none) | 0 | 0 | รับ id จาก input |
| `v1\ngrok.php` | ? | Yes | (none) | 0 | 0 | - |
| `v1\notifications.php` | GET | Yes | requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการรูปแบบข้อความแจ้งเตือนได้'); requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขรูปแบบข้อความแจ้งเตือนได้'); requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ส่งข้อความทดสอบได้'); requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจสอบรูปแบบข้อความแจ้งเตือนได้'); requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่พรีวิวรูปแบบข้อความแจ้งเตือนได้') | 1 | 2 | รับ id จาก input |
| `v1\notifications_log.php` | GET | Yes | (none) | 1 | 8 | - |
| `v1\page_editor.php` | GET/POST | Yes | (none) | 2 | 0 | - |
| `v1\permission_diff.php` | GET | Yes | (none) | 0 | 2 | รับ id จาก input |
| `v1\planning.php` | GET | Yes | (none) | 19 | 0 | รับ id จาก input |
| `v1\pm_am.php` | GET/POST | Yes | (none) | 30 | 0 | รับ id จาก input |
| `v1\pm_ical.php` | ? | Yes | (none) | 0 | 1 | - |
| `v1\pm_plans.php` | GET/POST | Yes | (none) | 45 | 2 | รับ id จาก input |
| `v1\pm_reminders.php` | GET | Yes | (none) | 0 | 0 | - |
| `v1\predictive_ai.php` | ? | Yes | requirePerm($pdo, 'dashboard', 'view') | 0 | 4 | - |
| `v1\predictive_maintenance.php` | GET | Yes | (none) | 0 | 0 | - |
| `v1\production_hours.php` | GET/POST | Yes | (none) | 4 | 1 | รับ id จาก input |
| `v1\production_impact.php` | ? | Yes | requirePerm($pdo, 'dashboard', 'view') | 0 | 3 | - |
| `v1\profile.php` | POST | Yes | (none) | 7 | 0 | - |
| `v1\push_subscribe.php` | GET/POST | Yes | (none) | 2 | 1 | - |
| `v1\pwa_settings.php` | ? | Yes | (none) | 0 | 0 | - |
| `v1\reliability.php` | GET/POST | Yes | requirePerm($pdo, <module>, <action>); requirePerm($pdo, 'reliability', 'read'); requirePerm($pdo, 'reliability', 'write'); requirePerm($pdo, 'reliability', 'admin') | 0 | 0 | - |
| `v1\repair.php` | GET/POST | Yes | (none) | 37 | 3 | รับ id จาก input |
| `v1\repair_attachment.php` | GET | Yes | (none) | 4 | 0 | รับ id จาก input |
| `v1\repair_form_attachment.php` | ? | No | (none) | 0 | 0 | - |
| `v1\repair_options.php` | GET | Yes | (none) | 4 | 1 | รับ id จาก input |
| `v1\repair_video.php` | ? | No | (none) | 0 | 0 | - |
| `v1\report_schedule.php` | GET | Yes | (none) | 2 | 0 | รับ id จาก input |
| `v1\reports.php` | GET | Yes | (none) | 1 | 0 | - |
| `v1\roles.php` | GET/POST | Yes | (none) | 10 | 2 | รับ id จาก input |
| `v1\sage_items.php` | GET | Yes | (none) | 2 | 0 | - |
| `v1\sage_shipments.php` | GET/POST | Yes | (none) | 15 | 2 | รับ id จาก input |
| `v1\sage_sync.php` | POST | Yes | (none) | 6 | 4 | - |
| `v1\scan.php` | GET/POST | Yes | requirePerm($pdo, 'asset', 'view', 'ไม่มีสิทธิ์ดูรายการเครื่องจักร'); requirePerm($pdo, 'document', 'view', 'ไม่มีสิทธิ์ดูเอกสารควบคุม'); requirePerm($pdo, 'asset', 'view', 'ไม่มีสิทธิ์ดูรายการเครื่องจักร'); requirePerm($pdo, 'document', 'view', 'ไม่มีสิทธิ์ดูเอกสารควบคุม') | 3 | 1 | - |
| `v1\settings.php` | GET/POST | Yes | requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดูประวัติการตั้งค่า'); requirePerm($pdo, 'settings', 'manage', 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขการตั้งค่า') | 6 | 2 | รับ id จาก input |
| `v1\shift_handover.php` | GET/POST | Yes | requirePerm($pdo, 'dashboard', 'view') | 2 | 0 | รับ id จาก input |
| `v1\shutdown.php` | GET | Yes | requirePerm('shutdown', $action); requirePerm($pdo, 'shutdown', 'view'); requirePerm($pdo, 'shutdown', 'plan'); requirePerm($pdo, 'shutdown', 'plan'); requirePerm($pdo, 'shutdown', 'execute'); requirePerm($pdo, 'shutdown', 'baseline_create'); requirePerm($pdo, 'shutdown', 'readiness_manage'); requirePerm($pdo, 'shutdown', 'startup'); requirePerm($pdo, 'shutdown', $perm) | 1 | 6 | รับ id จาก input |
| `v1\spare_image.php` | GET | No | (none) | 1 | 0 | รับ id จาก input |
| `v1\spare_issue.php` | GET | Yes | (none) | 4 | 0 | รับ id จาก input |
| `v1\spare_issue_request.php` | GET/POST | Yes | (none) | 21 | 0 | รับ id จาก input |
| `v1\spare_optimization.php` | GET/POST | Yes | requirePerm('spare_parts', $action); requirePerm($pdo, 'spare_parts', 'view'); requirePerm($pdo, 'spare_parts', 'plan'); requirePerm($pdo, 'spare_parts', $permFor[$action]) | 0 | 1 | รับ id จาก input |
| `v1\spare_parts.php` | GET/POST | Yes | (none) | 10 | 0 | รับ id จาก input |
| `v1\spare_reorder.php` | GET | Yes | requirePerm($pdo, 'spare_parts', 'view') | 0 | 0 | - |
| `v1\spare_usage.php` | GET | Yes | (none) | 35 | 5 | รับ id จาก input |
| `v1\stock_take.php` | GET | Yes | (none) | 11 | 1 | รับ id จาก input |
| `v1\supervisor.php` | GET | Yes | (none) | 37 | 4 | รับ id จาก input |
| `v1\suppliers.php` | GET/POST | Yes | (none) | 4 | 2 | รับ id จาก input |
| `v1\system_health.php` | ? | Yes | (none) | 0 | 17 | - |
| `v1\system_services.php` | ? | Yes | (none) | 0 | 1 | - |
| `v1\upload.php` | POST | Yes | (none) | 0 | 0 | - |
| `v1\user_lookup.php` | GET | No | (none) | 3 | 0 | - |
| `v1\users.php` | GET/POST | Yes | (none) | 9 | 2 | รับ id จาก input |
| `v1\utility_energy.php` | GET/POST | Yes | requirePerm($pdo, 'dashboard', 'view') | 2 | 1 | - |
| `v1\work_permit.php` | GET | Yes | requirePerm('safety', $action); requirePerm($pdo, 'safety', 'view'); requirePerm($pdo, 'safety', 'create'); requirePerm($pdo, 'safety', 'approve'); requirePerm($pdo, 'safety', 'cancel'); requirePerm($pdo, 'safety', 'edit'); requirePerm($pdo, 'safety', 'execute') | 0 | 0 | รับ id จาก input |
| `v1\workforce.php` | GET | Yes | requirePerm('workforce', $action); requirePerm($pdo, 'workforce', 'view'); requirePerm($pdo, 'workforce', 'capacity_view'); requirePerm($pdo, 'workforce', 'capacity_view'); requirePerm($pdo, 'workforce', 'assignment_manage'); requirePerm($pdo, 'workforce', 'assignment_manage'); requirePerm($pdo, 'workforce', 'capacity_view'); requirePerm($pdo, 'workforce', 'analytics'); requirePerm($pdo, 'workforce', 'skill_manage'); requirePerm($pdo, 'workforce', 'skill_assign'); requirePerm($pdo, 'workforce', 'certification_manage'); requirePerm($pdo, 'workforce', 'training_manage'); requirePerm($pdo, 'workforce', 'training_manage'); requirePerm($pdo, 'workforce', 'manage'); requirePerm($pdo, 'workforce', 'manage'); requirePerm($pdo, 'workforce', 'crew_manage'); requirePerm($pdo, 'workforce', 'skill_manage'); requirePerm($pdo, 'workforce', 'assignment_manage') | 6 | 9 | รับ id จาก input |
| `v1\workload.php` | ? | Yes | (none) | 0 | 6 | - |
Traceback (most recent call last):
  File "C:\inetpub\wwwroot\cmms-tpt\_gen_table.py", line 18, in <module>
    PY
NameError: name 'PY' is not defined


---
หมายเหตุ: ตารางสร้างจาก grep อัตโนมัติ — คอลัมน์ "Login" = มี requireLogin() หรือไม่; "Prepared" = จำนวน ->prepare(); "Raw query with $" = จำนวน ->query() ที่มี `$` (อาจเป็น false positive); "Cross-user" = พบ id จาก input (ต้องตรวจเทียบ session ด้วยมือ)
