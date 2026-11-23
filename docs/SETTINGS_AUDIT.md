# การตรวจสอบหน้าตั้งค่า (Settings Audit)

> ไฟล์ที่ตรวจ: `frontend/app/(dashboard)/settings/page.tsx` + ทุกหน้าย่อยใต้ `settings/` + หน้าที่ทำหน้าที่ตั้งค่าแต่อยู่นอก `settings/`
> วิธีตรวจสอบ: อ่านโค้ดหน้า + API ที่เรียก + ตรวจสอบตาราง `settings`, `settings_audit_log`, `menu_permissions`, `roles` ใน MySQL จริง (ไม่ได้แก้โค้ด/ข้อมูล)
> วันที่ตรวจ: 2026-11-22

---

## 1. ตารางหน้าตั้งค่าทั้งหมด

| path | ทำอะไร | ใครเข้าได้ (UI + API จริง) | ตั้งค่า "ของตัวเอง" หรือ "ของทั้งระบบ" | ข้อมูลอ่าน/เขียน (API / ตาราง) |
|---|---|---|---|---|
| `/settings` | ศูนย์รวมการตั้งค่า: topic cards 9 หมวด (ข้อมูลบริษัท, งานซ่อม, ตัวเลือกแจ้งซ่อม, PM, อะไหล่, การแจ้งเตือน, สอบเทียบ, ERP, ระบบ) + search ข้ามกลุ่ม + ประวัติการแก้ไข + ปุ่มบันทึกทั้งหมด | UI: ทุกคนที่ login; แก้ไขต้อง `settings:manage` (admin). API GET `settings.php` ต้อง login; PUT/POST ต้อง `settings:manage` | ทั้งระบบ | อ่าน/เขียน: `settings.php` → `settings`, `settings_audit_log` |
| `/settings/design` | ปรับแต่งหน้าตา: ธีมสี, ฟอนต์, มุมโค้ง, แถบเมนู, การ์ด, แอนิเมชัน, Andon | UI: ทุกคน login; แก้ไขต้อง `settings:manage`. API `settings.php` PUT ต้อง `settings:manage` | ทั้งระบบ | `settings.php` → `settings` (group branding/general/Andon) |
| `/settings/health` | ตรวจสุขภาพระบบ: Sage 300, Storage, system_errors | เฉพาะ admin (`requireLogin($pdo, true)`) | ทั้งระบบ (อ่านอย่างเดียว) | `system_health.php` → DB/ไฟล์ log |
| `/settings/master/[entity]` | จัดการข้อมูลหลัก (entities ทั่วไป) — redirect ไป `/settings/repair-options?tab=` | แก้ไขต้อง `settings:manage` (API) | ทั้งระบบ | `master_data.php` → ตารางตาม entity |
| `/settings/menus` | กำหนดเมนูที่แต่ละ role เห็นได้ (bottom nav preview) | แก้ไขต้อง admin (`requireLogin($pdo, true)`) | ทั้งระบบ | `menu_permissions.php` → `menu_permissions`, `roles` |
| `/settings/notification-prefs` | Quiet Hours + แมทริกซ์การรับแจ้งเตือนราย user | login (แก้ค่าของตัวเอง?) | ของตัวเอง (per-user) — ไม่แน่ใจว่าเก็บที่ไหน | `notifications.php` → ไม่แน่ใจ (ตาราง?) |
| `/settings/notification-rules` | กฎการแจ้งเตือน (module/event/channel) + ผู้รับ | ผู้ดูแล/หัวหน้างาน (`canSupervisor()`) | ทั้งระบบ | `notifications.php`, `users.php` → ไม่แน่ใจ (ตาราง?) |
| `/settings/notifications` | รูปแบบการแจ้งเตือน LINE (เทมเพลต) + Web Push + test | แก้ไขต้อง `settings:manage` (admin) สำหรับ template; ดูได้ login | ทั้งระบบ | `email_notify.php`, `line_notify.php` → `settings` (line_tpl_*) |
| `/settings/permission-diff` | ตรวจ drift สิทธิ์เมนู vs API | เฉพาะ admin (`requireLogin($pdo, true)`) | ทั้งระบบ (อ่านอย่างเดียว) | `permission_diff.php` → `menu_permissions`, `roles` |
| `/settings/push` | Web Push: ลงทะเบียนอุปกรณ์, ทดสอบ push | login (ของตัวเอง) | ของตัวเอง | `notifications.php?action=push_status/test_push_self` → ตาราง push subscription (ไม่แน่ใจ) |
| `/settings/pwa` | ไอคอน PWA + วิธีติดตั้ง | เฉพาะ admin (`requireLogin($pdo, true)`) | ทั้งระบบ | `pwa_settings.php` → ไม่แน่ใจ (ตาราง?) |
| `/settings/repair-options` | ตัวเลือก dropdown ฟอร์มแจ้งซ่อม + แผนก/ที่ตั้ง (master data) | แก้ไขต้อง `settings:manage` (admin) | ทั้งระบบ | `repair_options.php`, `master_data.php` → ตาราง master/repair_options |
| `/settings/services` | บริการและสถานะการรันระบบ (Apache/Next.js/watchdog, LINE webhook) | เฉพาะ admin (`requireLogin($pdo, true)`) | ทั้งระบบ (อ่านอย่างเดียว) | `system_services.php`, `line_webhook.php` → DB/log |
| `/roles` (+ create/edit) | จัดการบทบาท (roles) | ไม่แน่ใจ (ไม่ได้ inspect API roles.php ในรอบนี้) | ทั้งระบบ | `roles.php`? → `roles` (ไม่แน่ใจ) |
| `/users` (+ create/edit/leaderboard) | จัดการผู้ใช้ | ไม่แน่ใจ | ทั้งระบบ (admin) / ของตัวเอง (profile) | `users.php` → `users` |
| `/audit-log` | ประวัติการกระทำ (audit log) | ไม่แน่ใจ | ทั้งระบบ (อ่าน) | `audit_log.php`? → `audit_logs`/`audit_trail` |
| `/notifications` (history) | ประวัติการแจ้งเตือน | login (ของตัวเอง?) | ของตัวเอง/ทั้งระบบ ไม่แน่ใจ | `notifications.php` → `notifications` |
| `/notifications/history` | ประวัติการแจ้งเตือน (หน้าย่อย) | login | ไม่แน่ใจ | `notifications.php` → `notifications` |
| `/register` | ลงทะเบียนผู้ใช้ใหม่ | public (ไม่ต้อง login) | ของตัวเอง | `users.php` (POST) → `users` |
| `/editor`, `/editor/builder` | ออกแบบหน้า/ฟอร์ม (Page/Form builder) | ไม่แน่ใจ | ทั้งระบบ | ไม่แน่ใจ |
| `/pages`, `/pages/[slug]` | จัดการหน้า CMS/เนื้อหา | ไม่แน่ใจ | ทั้งระบบ | ไม่แน่ใจ |
| `/profile` | โปรไฟล์ผู้ใช้ (ของตัวเอง) | login | ของตัวเอง | `users.php` → `users` |
| `/onboarding` | Onboarding Wizard (เตรียมข้อมูลหลักก่อน Go Live) | login (admin?) | ทั้งระบบ | ไม่แน่ใจ |
| `/install` | แนะนำการติดตั้ง PWA + QR | login | ทั้งระบบ/ของตัวเอง ไม่แน่ใจ | ไม่แน่ใจ |

> หมายเหตุ: หน้าที่ระบุ "ไม่แน่ใจ" ไม่ได้ inspect API/permission ในรอบนี้ (ต้องตรวจเพิ่มถ้าต้องการความแม่นยำ)


---

## 2. ตารางทุกการตั้งค่า (setting) ในตาราง `settings`

ทั้งหมด 404 แถว (ณ วันที่ตรวจ). ชนิด (text/number/boolean/secret/json) อนุมานจากชุดคีย์ใน `settings/page.tsx` (SENSITIVE/JSON/NUMBER/BOOLEAN sets) + ค่าจริง. หน้าที่แก้ได้อนุมานจาก `setting_group`. "ใช้ที่ไหนในโค้ด" มาจากการ grep จริง (`.php/.tsx/.ts/.js` ยกเว้น `.next`/`node_modules`). "มีค่าเริ่มต้น" มาจาก `src/config/settings_defaults.php`.

| key | group | ชนิด | หน้าไหนแก้ได้ | ใช้ที่ไหนในโค้ด (grep) | มีค่าเริ่มต้นหรือไม่ |
|---|---|---|---|---|---|
| `design_andon_down` | Andon | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `design_andon_ok` | Andon | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `design_andon_warn` | Andon | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `ar_criticality_auto_apply` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_review_days` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,frontend/app/(dashboard)/asset-reliability/page.tsx,public/api/v1/asset_criticality.php,scripts/archive/apply_phase28_asset_reliability.php | ไม่มี |
| `ar_criticality_threshold_a` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_threshold_b` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_threshold_c` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_cost` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_downtime` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_frequency` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_production` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_quality` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_redundancy` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_criticality_w_safety` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_health_window_months` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_min_failures_for_mtbf` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_overhaul_reminder_days` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_phase28_applied_ver` | asset_reliability | text | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | scripts/archive/apply_phase28_asset_reliability.php | ไม่มี |
| `ar_reliability_window_months` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_replacement_review_notes` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php,src/helpers/asset_reliability.php | ไม่มี |
| `ar_retirement_min_age_years` | asset_reliability | number | /settings (ไม่มี topic — แก้ผ่าน /asset-reliability/config?) | frontend/app/(dashboard)/asset-reliability/aging/page.tsx,frontend/app/(dashboard)/asset-reliability/config/page.tsx,scripts/archive/apply_phase28_asset_reliability.php,scripts/test_asset_reliability.php | ไม่มี |
| `company_tagline` | branding | text | /settings (topic บริษัท) + /settings/design | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `iso_header_title` | branding | text | /settings (topic บริษัท) + /settings/design | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `login_welcome_text` | branding | text | /settings (topic บริษัท) + /settings/design | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `theme_primary_hex` | branding | text | /settings (topic บริษัท) + /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/app/(dashboard)/settings/page.tsx,frontend/components/ThemeProvider.tsx,frontend/components/ThemeSettingsPanel.tsx | มี |
| `theme_secondary_hex` | branding | text | /settings (topic บริษัท) + /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/app/(dashboard)/settings/page.tsx,frontend/components/ThemeProvider.tsx,frontend/components/ThemeSettingsPanel.tsx | มี |
| `cal_alert_days` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,scripts/test_calibration.php,src/helpers/calibration.php | ไม่มี |
| `cal_allow_usage_basis` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `cal_block_oo_against_expired_std` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `cal_compliance_mode` | calibration | text | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,scripts/test_calibration.php,src/helpers/calibration.php | ไม่มี |
| `cal_data_completeness_required` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `cal_default_interval_months` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,public/api/v1/calibration_management.php,src/helpers/calibration.php | ไม่มี |
| `cal_interval_change_requires_approval` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `cal_phase29_applied_ver` | calibration | text | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | (ไม่พบการอ้างอิง — orphan) | ไม่มี |
| `cal_rca_on_fail` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,public/api/v1/calibration_management.php,src/helpers/calibration.php | ไม่มี |
| `cal_reference_expiry_warn_days` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `cal_require_certificate` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,public/api/v1/calibration_management.php,src/helpers/calibration.php | ไม่มี |
| `cal_require_review` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `cal_years_validity_default` | calibration | number | /settings? (group calibration ไม่อยู่ใน TOPICS — ไม่แน่ใจ) | frontend/app/(dashboard)/calibration/config/page.tsx,src/helpers/calibration.php | ไม่มี |
| `auto_assign_calibration` | calibration_config | boolean | /settings (topic สอบเทียบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `calibration_alert_days` | calibration_config | number | /settings (topic สอบเทียบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/notification_engine.php,src/config/settings_defaults.php,src/helpers/calibration.php | มี |
| `company_address` | company | text | /settings (topic บริษัท) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `company_name` | company | text | /settings (topic บริษัท) | frontend/app/(dashboard)/contractors/create/page.tsx,frontend/app/(dashboard)/contractors/page.tsx,frontend/app/(dashboard)/contractors/work/page.tsx,frontend/app/(dashboard)/contractors/[id]/page.tsx | มี |
| `company_tax_id` | company | number | /settings (topic บริษัท) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `support_email` | company | text | /settings (topic บริษัท) | frontend/app/(dashboard)/settings/page.tsx,frontend/components/SupportContactStrip.tsx,frontend/lib/liff-bind-copy.ts,frontend/lib/use-support-contact.ts | มี |
| `support_phone` | company | text | /settings (topic บริษัท) | frontend/app/(dashboard)/settings/page.tsx,frontend/components/SupportContactStrip.tsx,frontend/lib/liff-bind-copy.ts,frontend/lib/support-contact.ts | มี |
| `contractor_blacklist_label` | contractor | text | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_doc_types` | contractor | json | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_min_qualified_to_work` | contractor | text | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_performance_window_days` | contractor | number | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_phase31_applied_ver` | contractor | text | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php | ไม่มี |
| `contractor_qual_dimensions` | contractor | json | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_reminder_days` | contractor | json | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_repeat_failure_gap_days` | contractor | number | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_score_min_jobs` | contractor | number | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_service_categories` | contractor | json | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,scripts/test_contractor.php,src/helpers/contractor.php | ไม่มี |
| `contractor_sla_metrics` | contractor | json | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `contractor_status_labels` | contractor | json | ไม่แน่ใจ (ไม่มี topic ตรง) | scripts/archive/apply_phase31_contractor_management.php,src/helpers/contractor.php | ไม่มี |
| `budget_dept_filter_enabled` | cost | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase26_cost_budget.php,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `budget_exceed_pct` | cost | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase26_cost_budget.php,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `budget_warning_pct` | cost | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase26_cost_budget.php,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `cost_external_source` | cost | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase26_cost_budget.php,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `cost_labor_enabled` | cost | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase26_cost_budget.php,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `cost_labor_rate_source` | cost | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase26_cost_budget.php,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `log_retention_days` | data_retention | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,frontend/lib/knowledge.ts,scripts/archive/apply_phase38_knowledge.php,scripts/cleanup_logs.php | มี |
| `log_retention_enabled` | data_retention | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/cleanup_logs.php,src/config/settings_defaults.php | มี |
| `document_ack_assign_extra_users` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_ack_assign_roles` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_ack_blocks_ecr_close` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `document_ack_blocks_work` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php | ไม่มี |
| `document_ack_default_due_days` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_ack_methods` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,scripts/test_document_control.php,src/helpers/document_control.php | ไม่มี |
| `document_ack_overdue_reminder_days` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_allowed_file_types` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_approval_chain` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_approval_roles` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_confidentiality_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_default_confidentiality` | engineering_change | text | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_effective_date_rules` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_effective_requires_impacts_closed` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_effective_requires_training` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_legacy_manual_bridge` | engineering_change | text | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php | ไม่มี |
| `document_max_file_size_mb` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_qr_prefix` | engineering_change | text | ไม่แน่ใจ | public/api/v1/scan.php,scripts/archive/apply_phase32_engineering_change.php,scripts/test_scan.php,src/helpers/document_control.php | ไม่มี |
| `document_review_cycle_days` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_review_due_days` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_revision_status_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_status_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_training_default_validity_days` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_training_pass_score` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `document_types` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/document_control.php | ไม่มี |
| `ecr_approval_chain` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_approval_roles` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_blocks_completion_on_fail` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_change_types` | engineering_change | json | ไม่แน่ใจ | public/api/v1/engineering_change.php,scripts/archive/apply_phase32_engineering_change.php,scripts/test_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_critical_impact_guards` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_impact_action_status_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_impact_min_critical` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_impact_required_before_approval` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_impact_target_types` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_link_action_status_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_link_types` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,scripts/test_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_priority_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_rca_causation_note` | engineering_change | text | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_requires_document_revisions` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_sla_days` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_status_labels` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_transitions` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,scripts/test_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `ecr_verification_methods` | engineering_change | json | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,scripts/test_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `impact_areas` | engineering_change | json | ไม่แน่ใจ | frontend/app/(dashboard)/documents/[id]/page.tsx,frontend/app/(dashboard)/engineering-changes/[id]/page.tsx,frontend/lib/document.ts,frontend/lib/engineering_change.ts | ไม่มี |
| `phase32_applied_ver` | engineering_change | text | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php | ไม่มี |
| `phase32_master_data_automation` | engineering_change | number | ไม่แน่ใจ | scripts/archive/apply_phase32_engineering_change.php,src/helpers/engineering_change.php | ไม่มี |
| `sage_sync_config` | ERP_Integrations | json | /settings (topic ERP) | frontend/app/(dashboard)/settings/page.tsx,public/api/v1/sage_sync.php,scripts/sync_sage_spares.php,src/config/settings_defaults.php | มี |
| `sage300_allowed_categories` | ERP_Integrations | text | /settings (topic ERP) | frontend/app/(dashboard)/settings/page.tsx,public/api/v1/sage_sync.php,scripts/sync_sage_spares.php,src/config/settings_defaults.php | มี |
| `andon_refresh_sec` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/andon-board/page.tsx,frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `animations_enabled` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,frontend/components/ThemeProvider.tsx,src/config/settings_defaults.php | มี |
| `app_name` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php,src/includes/i18n.php | มี |
| `app_version` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `auto_sage_sync` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `border_radius_style` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `calendar_view_default` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `company_phone` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,frontend/components/SupportContactStrip.tsx,frontend/lib/liff-bind-copy.ts,frontend/lib/use-support-contact.ts | มี |
| `currency_symbol` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,frontend/lib/rca.ts,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `date_format` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `default_warehouse` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `enable_borrowing` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `enable_leaderboard` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `enable_machine_bom` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `enable_mtbf_analytics` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `escalation_alert` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/alert_check.php,scripts/notification_engine.php,src/config/settings_defaults.php | มี |
| `escalation_hours` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/alert_check.php,scripts/notification_engine.php,src/config/settings_defaults.php | มี |
| `iso_footer_note` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `iso_form_code_prefix` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `iso_watermark_enabled` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `lang_default` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,frontend/lib/i18n.ts,scripts/security_check.php,src/config/settings_defaults.php | มี |
| `line_channel_access_token` | general | secret | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,scripts/line_rich_menu.php | ไม่มี |
| `line_notify_enabled` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/notification-prefs/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php | มี |
| `line_system_alerts` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,scripts/watchdog-notify.php,src/config/settings_defaults.php | มี |
| `line_tpl_spare_request` | general | json | /settings (topic ระบบ) | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,public/api/v1/repair.php | ไม่มี |
| `line_tpl_work_assign` | general | json | /settings (topic ระบบ) | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,public/api/v1/repair.php | ไม่มี |
| `line_weekly_report` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,scripts/weekly_report.php,src/config/settings_defaults.php | มี |
| `login_card_position` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `login_notice_text` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `logo_position` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php,src/includes/header.php | มี |
| `max_login_attempts` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `notification_sound` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `org_chart_enabled` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `planner_break_hour` | general | number | /settings (topic ระบบ) | scripts/archive/apply_phase25_planning.php,src/config/settings_defaults.php,src/helpers/planning.php | มี |
| `planning_shift_hours` | general | number | /settings (topic ระบบ) | scripts/archive/apply_phase25_planning.php,scripts/archive/apply_phase34_workforce.php,scripts/test_workforce.php,src/config/settings_defaults.php | มี |
| `planning_shift_start` | general | text | /settings (topic ระบบ) | scripts/archive/apply_phase25_planning.php,scripts/archive/apply_phase34_workforce.php,scripts/test_workforce.php,src/config/settings_defaults.php | มี |
| `planning_sla_risk_hours` | general | number | /settings (topic ระบบ) | frontend/lib/dashboard.ts,frontend/lib/repair-status.ts,public/api/v1/repair.php,scripts/archive/apply_phase25_planning.php | มี |
| `planning_working_days` | general | text | /settings (topic ระบบ) | scripts/archive/apply_phase25_planning.php,scripts/test_workforce.php,src/config/settings_defaults.php,src/helpers/calendar.php | มี |
| `public_base_url` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/test_approval_service.php,scripts/test_notifications.php,scripts/test_security.php | ไม่มี |
| `push_alert_enabled` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/notification-prefs/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,frontend/components/PwaRegister.tsx | มี |
| `qr_code_enabled` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `require_root_cause` | general | boolean | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,public/api/v1/repair.php,public/api/v1/supervisor.php,src/config/settings_defaults.php | มี |
| `session_timeout_mins` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/test_auth.php,src/auth.php,src/config/settings_defaults.php | มี |
| `sidebar_style` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `standard_labor_rate` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php,src/config/settings_defaults.php | มี |
| `system_currency` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php,src/helpers/cost.php | มี |
| `system_mode` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `theme_font_family` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `theme_preset` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/design/page.tsx,frontend/app/(dashboard)/settings/page.tsx,frontend/components/ThemeProvider.tsx,frontend/components/ThemeSettingsPanel.tsx | มี |
| `timezone` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/onboarding/page.tsx,frontend/app/(dashboard)/settings/page.tsx,scripts/archive/apply_phase36_iot_condition.php,src/config/settings_defaults.php | มี |
| `topbar_style` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `vapid_private_key` | general | secret | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/test_security.php,scripts/test_services.php,src/config/settings_defaults.php | ไม่มี |
| `vapid_public_key` | general | text | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,scripts/test_services.php,src/config/settings_defaults.php,src/helpers/api.php | ไม่มี |
| `work_hours_per_day` | general | number | /settings (topic ระบบ) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php,src/helpers/planning.php | มี |
| `iot_alarm_auto_work_order` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,scripts/test_phase36_engine.php,src/helpers/iot.php | ไม่มี |
| `iot_alarm_escalate_after_min` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_alarm_notify_roles` | iot | text | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_alarm.php | ไม่มี |
| `iot_alarm_on_critical_notify` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_alarm.php | ไม่มี |
| `iot_alarm_require_note_on_resolve` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_alarm.php | ไม่มี |
| `iot_alarm_suppress_default_min` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_alarm.php | ไม่มี |
| `iot_condition_min_points` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_condition.php | ไม่มี |
| `iot_condition_snapshot_minutes` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_condition_stale_multiplier` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_device_offline_after_sec` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_alarm.php | ไม่มี |
| `iot_enabled` | iot | number | ไม่แน่ใจ | public/api/v1/iot_ingest.php,scripts/archive/apply_phase36_iot_condition.php,scripts/inspect_phase36_state.php,src/helpers/iot.php | ไม่มี |
| `iot_ingest_accept_future_sec` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_ingest.php | ไม่มี |
| `iot_ingest_log_days` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_ingest_max_batch_readings` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,scripts/test_phase36_engine.php,src/helpers/iot.php,src/helpers/iot_ingest.php | ไม่มี |
| `iot_ingest_max_clock_skew_sec` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_ingest.php | ไม่มี |
| `iot_ingest_max_payload_bytes` | iot | number | ไม่แน่ใจ | public/api/v1/iot_ingest.php,scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_ingest_rate_limit_per_min` | iot | number | ไม่แน่ใจ | public/api/v1/iot_ingest.php,scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_ingest_require_source_auth` | iot | number | ไม่แน่ใจ | public/api/v1/iot_ingest.php,scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_ingest_stale_fallback_sec` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_retention_enabled` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,scripts/test_phase36_engine.php,src/helpers/iot.php,src/helpers/iot_condition.php | ไม่มี |
| `iot_retention_raw_readings_days` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_rollup_buckets` | iot | text | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php | ไม่มี |
| `iot_rollup_enabled` | iot | number | ไม่แน่ใจ | scripts/archive/apply_phase36_iot_condition.php,src/helpers/iot.php,src/helpers/iot_condition.php | ไม่มี |
| `knowledge_auto_check_document_stale` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_auto_create_gap` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_enabled` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_export_row_limit` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_activity.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_gap_default_priority` | knowledge | text | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_gap_min_occurrences` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php,src/helpers/knowledge_search.php | ไม่มี |
| `knowledge_gap_window_days` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_helpfulness_enabled` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_max_results` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_min_query_len` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_page_default_size` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_privileged_roles` | knowledge | text | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_publish_requires_approved` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_publish_requires_category` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_publish_requires_relation` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_publish_requires_review_record` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_result_window_days` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_review_default_days` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_review_overdue_warn_days` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_search_include_documents` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_search_include_manuals` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php,src/helpers/knowledge_search.php | ไม่มี |
| `knowledge_search_log_enabled` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_search_log_retention_days` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `knowledge_usage_log_enabled` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php,src/helpers/knowledge_usage.php | ไม่มี |
| `knowledge_usage_retention_days` | knowledge | number | ไม่แน่ใจ | scripts/archive/apply_phase38_knowledge.php,src/helpers/knowledge_core.php | ไม่มี |
| `daily_summary_enabled` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,scripts/daily_summary.php,src/config/settings_defaults.php | มี |
| `email_notify_enabled` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notification-prefs/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx | มี |
| `line_callback_url` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php | ไม่มี |
| `line_channel_id` | notification | number | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php | ไม่มี |
| `line_channel_secret` | notification | secret | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,public/api/v1/line_webhook.php | ไม่มี |
| `line_group_enabled` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,public/api/v1/repair.php | มี |
| `line_liff_id` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,frontend/app/register/page.tsx,frontend/components/LiffBridge.tsx | ไม่มี |
| `line_liff_register_id` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/register/page.tsx,frontend/lib/use-support-contact.ts,public/api/v1/line_notify.php | ไม่มี |
| `line_maintenance_group_id` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/inspections.php,public/api/v1/line_notify.php | ไม่มี |
| `line_tpl_breakdown` | notification | json | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php | มี |
| `line_tpl_completed` | notification | json | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php | มี |
| `line_tpl_low_stock` | notification | json | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php | มี |
| `line_tpl_pm_overdue` | notification | json | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php | มี |
| `line_tpl_sage_approval` | notification | json | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/notifications/history/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php | มี |
| `line_webhook_url` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,scripts/update_line_webhook.php | ไม่มี |
| `low_stock_alert` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,scripts/alert_check.php | มี |
| `maintenance_alert_days` | notification | number | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,frontend/app/(dashboard)/settings/page.tsx,public/api/v1/line_notify.php,scripts/alert_check.php | มี |
| `ntfy_click_url` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `ntfy_enabled` | notification | number | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notification-prefs/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php | มี |
| `ntfy_priority` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `ntfy_publish_url` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `ntfy_server_url` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `ntfy_tags` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `ntfy_token` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `ntfy_topic` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/ntfy.php | มี |
| `smtp_enabled` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,scripts/test_notifications.php | มี |
| `smtp_encryption` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,src/config/settings_defaults.php | มี |
| `smtp_from_email` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,frontend/components/SupportContactStrip.tsx,frontend/lib/liff-bind-copy.ts | มี |
| `smtp_from_name` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,src/config/settings_defaults.php | มี |
| `smtp_host` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,src/config/settings_defaults.php | มี |
| `smtp_pass` | notification | secret | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,scripts/test_security.php | ไม่มี |
| `smtp_port` | notification | number | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,src/config/settings_defaults.php | มี |
| `smtp_user` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/page.tsx,frontend/components/EmailNotifySettings.tsx,public/api/v1/email_notify.php,src/config/settings_defaults.php | มี |
| `telegram_bot_token` | notification | text | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,scripts/security_check.php,src/config/settings_defaults.php | มี |
| `telegram_chat_id` | notification | number | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,src/config/settings_defaults.php,src/helpers/api.php | มี |
| `telegram_enabled` | notification | boolean | /settings (topic การแจ้งเตือน) + /settings/notifications, /settings/notification-prefs, /settings/notification-rules | frontend/app/(dashboard)/settings/notification-prefs/page.tsx,frontend/app/(dashboard)/settings/notifications/page.tsx,public/api/v1/line_notify.php,scripts/daily_digest.php | มี |
| `auto_assign_pm` | pm_config | boolean | /settings (topic PM) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `default_pm_frequency` | pm_config | text | /settings (topic PM) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `pm_deferral_enabled` | pm_config | boolean | /settings (topic PM) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php,src/helpers/notification.php | มี |
| `pm_lead_days` | pm_config | number | /settings (topic PM) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `pm_reminder_days` | pm_config | number | /settings (topic PM) | frontend/app/(dashboard)/settings/page.tsx,scripts/notification_engine.php,src/config/settings_defaults.php | มี |
| `rca_action_reminder_days` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_due_days` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_high_cost_threshold` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_high_downtime_minutes` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_repeat_threshold` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_repeat_window_days` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_trigger_critical_asset` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_trigger_emergency` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_trigger_high_cost` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_trigger_high_downtime` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_trigger_repeat` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `rca_trigger_safety` | rca | number | ไม่แน่ใจ | scripts/archive/apply_phase27_failure_rca.php,src/helpers/failure.php | ไม่มี |
| `reliability_alarm_auto_treated_as_failure` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_alarm_to_failure_window_days` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_allow_calendar_basis` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_kpi.php | ไม่มี |
| `reliability_availability_min_downtime_events` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_bad_actor_auto_enable` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_comparability_warn_bases` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_cost_missing_display` | reliability | text | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_dq_max_findings` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_dq.php | ไม่มี |
| `reliability_dq_store_findings` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_export_row_limit` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_failures_need_classification` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_growth_auto_claim` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_studies.php | ไม่มี |
| `reliability_max_range_days` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_min_failures_for_mtbf` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_kpi.php | ไม่มี |
| `reliability_min_sample_period_days` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_operating_basis_default` | reliability | text | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_page_default_size` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_repair_time_basis_default` | reliability | text | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_rolling_default_months` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_snapshot_persist_enabled` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_snapshots.php | ไม่มี |
| `reliability_snapshot_persist_threshold_ms` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_snapshot_ttl_hours` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_trend_max_buckets` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_weibull_cache_ttl_minutes` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_weibull_max_failures` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_weibull_min_failures` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_studies.php | ไม่มี |
| `reliability_weibull_risk_levels` | reliability | text | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_weibull_time_origin` | reliability | text | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php | ไม่มี |
| `reliability_weibull_use_censored` | reliability | number | ไม่แน่ใจ | scripts/archive/apply_phase37_reliability.php,src/helpers/reliability_core.php,src/helpers/reliability_studies.php | ไม่มี |
| `auto_assign_repair` | repair_config | boolean | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `default_repair_priority` | repair_config | text | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `require_approval_repair` | repair_config | boolean | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `sla_auto_apply` | repair_config | boolean | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,public/api/v1/repair.php,src/config/settings_defaults.php,src/helpers/sla.php | มี |
| `sla_hours_critical` | repair_config | number | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php,src/helpers/sla.php | มี |
| `sla_hours_high` | repair_config | number | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `sla_hours_low` | repair_config | number | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `sla_hours_medium` | repair_config | number | /settings (topic งานซ่อม) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `urgent_repair_auto_priority` | repair_config | number | /settings (topic งานซ่อม) | (ไม่พบการอ้างอิง — orphan) | ไม่มี |
| `urgent_repair_escalation_hours` | repair_config | number | /settings (topic งานซ่อม) | (ไม่พบการอ้างอิง — orphan) | ไม่มี |
| `urgent_repair_notify_line` | repair_config | number | /settings (topic งานซ่อม) | (ไม่พบการอ้างอิง — orphan) | ไม่มี |
| `urgent_repair_notify_telegram` | repair_config | number | /settings (topic งานซ่อม) | (ไม่พบการอ้างอิง — orphan) | ไม่มี |
| `scheduled_reports` | Reports | json | ไม่แน่ใจ | public/api/v1/report_schedule.php,scripts/report_scheduler.php | ไม่มี |
| `allowed_origins` | Security | text | /settings (topic ระบบ) หรือ /settings/menus? | scripts/test_csrf.php,src/csrf.php | ไม่มี |
| `shutdown_allow_waive_blocking` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php,src/helpers/shutdown_readiness.php | ไม่มี |
| `shutdown_block_on_readiness` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `shutdown_material_availability_source` | shutdown | text | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `shutdown_max_baseline_versions` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `shutdown_progress_source` | shutdown | text | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php,src/helpers/shutdown_scope.php | ไม่มี |
| `shutdown_readiness_warn_hours` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `shutdown_report_labor_money` | shutdown | number | ไม่แน่ใจ | frontend/app/(dashboard)/shutdown/[id]/page.tsx,scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php,src/helpers/shutdown_turnaround.php | ไม่มี |
| `shutdown_require_reason_scope` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `shutdown_reservation_expiry_days` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `shutdown_scope_min_estimate_hours` | shutdown | number | ไม่แน่ใจ | scripts/apply_phase35_shutdown.php,scripts/archive/apply_phase35_shutdown.php | ไม่มี |
| `design_sidebar_indicator` | SideNav | text | /settings/menus หรือ /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `design_sidebar_text` | SideNav | text | /settings/menus หรือ /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `auto_req_low_stock` | spare_config | boolean | /settings (topic อะไหล่) | frontend/app/(dashboard)/settings/page.tsx,scripts/auto_requisition.php,src/config/settings_defaults.php | มี |
| `spare_approval_level` | spare_config | number | /settings (topic อะไหล่) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `spare_deduct_stock` | spare_config | boolean | /settings (topic อะไหล่) | frontend/app/(dashboard)/settings/page.tsx,scripts/test_core_helpers.php,src/config/settings_defaults.php,src/helpers/work_order.php | มี |
| `spare_require_approval` | spare_config | boolean | /settings (topic อะไหล่) | frontend/app/(dashboard)/settings/page.tsx,src/config/settings_defaults.php | มี |
| `phase33_ai_scoring` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php | ไม่มี |
| `phase33_applied_ver` | spare_optimization | text | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php | ไม่มี |
| `phase33_auto_criticality` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `phase33_auto_minmax_write` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `phase33_auto_procurement` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `phase33_reservation_deducts_stock` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_abc_a_pct` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_abc_b_pct` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_critical_exempt_from_obsolete` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_criticality_a_score` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_criticality_auto` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_criticality_b_score` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_criticality_c_score` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_criticality_factors` | spare_optimization | json | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_criticality_levels` | spare_optimization | json | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php | ไม่มี |
| `sp_criticality_methods` | spare_optimization | json | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php | ไม่มี |
| `sp_criticality_reason_required` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_dead_stock_days` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_dead_stock_min_value` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_default_lead_time_days` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_default_service_level` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_demand_min_days_span` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_demand_min_movements` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_demand_reliable` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_demand_window_days` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_excess_over_max_ratio` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_holding_rate` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_minmax_apply_requires_confirm` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_minmax_enforce` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_minmax_skip_critical` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_minmax_skip_locked` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_order_cost` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_reorder_qty_method` | spare_optimization | text | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_reservation_auto_expire` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_reservation_blocks_issue` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_reservation_default_days` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_reservation_overdraw` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_safety_stock_factor` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_slow_moving_days` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_stale_sync_blocks_minmax` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_stale_sync_hours` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,scripts/test_spare_optimization.php,src/helpers/shutdown_assets.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_substitute_require_approval` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_substitute_require_dates` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_warehouse_allow_cmms_created` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `sp_warehouse_quarantine_blocks_issue` | spare_optimization | number | ไม่แน่ใจ | scripts/archive/apply_phase33_spare_optimization.php,src/helpers/spare_optimization.php | ไม่มี |
| `risk_matrix_likelihood` | work_permit | json | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `risk_matrix_required_approval` | work_permit | json | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `risk_matrix_severity` | work_permit | json | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `risk_matrix_thresholds` | work_permit | json | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,scripts/test_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_auto_expire_enabled` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_cert_expired_block` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_expiry_policy` | work_permit | text | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_gas_block_red` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_gas_warn_amber` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_high_risk_approval` | work_permit | text | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_permit_no_prefix` | work_permit | text | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_phase30_applied_ver` | work_permit | text | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php | ไม่มี |
| `wp_require_approval` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_require_final_inspection` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_require_risk_review` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `wp_valid_hours_default` | work_permit | number | ไม่แน่ใจ | scripts/archive/apply_phase30_ptw_safety.php,src/helpers/safety.php | ไม่มี |
| `workforce_auto_assign` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,scripts/test_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_block_unqualified` | workforce | number | ไม่แน่ใจ | frontend/app/(dashboard)/workforce/conflicts/page.tsx,scripts/archive/apply_phase34_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_capacity_over_pct` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_capacity_warn_pct` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,scripts/test_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_expiry_warning_days` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,scripts/test_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_lead_in_trend_days` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_overtime_requires_reason` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_require_reason` | workforce | number | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,src/helpers/workforce.php | ไม่มี |
| `workforce_skill_levels` | workforce | json | ไม่แน่ใจ | scripts/archive/apply_phase34_workforce.php,scripts/test_workforce.php,src/helpers/workforce.php | ไม่มี |
| `design_body_bg` | การ์ด | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `design_card_radius` | การ์ด | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `design_card_shadow` | การ์ด | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |
| `design_font_family` | ตัวอักษร | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx | ไม่มี |
| `design_font_size` | ตัวอักษร | text | /settings/design | frontend/app/(dashboard)/settings/design/page.tsx,frontend/components/ThemeProvider.tsx | ไม่มี |

---

## 3. หน้า `/settings` ปัจจุบัน

### 3.1 โครงสร้างเนื้อหา (บนลงล่าง)
1. `PageHeader` (eyebrow/title/desc) + badge จำนวน keys + จำนวนยังไม่บันทึก + ปุ่ม "ประวัติการแก้ไข"
2. `ModuleGuide` (ตั้งค่าระบบ) — steps/source/note/related
3. Alert error / saveMessage
4. Header section: ช่องค้นหา (search ข้ามกลุ่ม) + ปุ่มล้าง
5. Subpages grid (`SUB_PAGES`, 11 การ์ด) — ลิงก์ไปหน้าย่อย
6. Recent keys card (8 รายการที่แก้ล่าสุด) — ปุ่ม pill
7. Topic grid (เมื่อ `activeTopic === null`): หัว "เลือกหมวดการตั้งค่า" + ปุ่ม "บันทึกทั้งหมด (N)" (ถ้า canManage และมี dirty) + Grid การ์ด 9 topic (แต่ละการ์ด: icon, label, hint, จำนวนรายการ, ตัวอย่าง 3 คีย์, หน้าเฉพาะ, ลูกศร)
8. Detail view (เมื่อเลือก topic): Grid 2 คอลัมน์ — Sidebar (ปุ่มกลับ, ชื่อ topic, หน้าเฉพาะ, กลุ่มย่อย) + Form panel (ชื่อ topic/hint, ThemeSettingsPanel ถ้า company/branding, รายการ setting แต่ละตัว, ปุ่ม รีเซ็ตการแก้ไข/เปรียบเทียบ/บันทึก)
9. Dialog "เปรียบเทียบก่อนบันทึก" (diffRows)
10. Dialog "ประวัติการแก้ไข" (auditRows, 100 รายการ)

### 3.2 จำนวน section/ฟิลด์ และชนิด input
- 9 topic (TOPICS): company, repair, repair_options, pm, spare, notification, calibration, erp, system. แต่ละ topic มี 1-2 setting_group
- ชนิด input ที่รองรับ: text (default), textarea (TEXTAREA_KEYS), number (NUMBER_KEYS), boolean (switch), select (SELECT_OPTIONS), color (color picker + hex), email, secret (password, masked), json (read-only), readonly (badge)
- การ์ด topic แสดงตัวอย่าง 3 คีย์แรก + "+N เพิ่มเติม"

### 3.3 ปุ่มบันทึก
- บันทึกทีละส่วน (per topic): ปุ่ม "บันทึก (N รายการ)" ที่ form panel (handleSave) — บันทึกเฉพาะ changedRows ของ topic ที่แสดง
- บันทึกทั้งหมด: ปุ่ม "บันทึกทั้งหมด (N รายการ)" ที่ topic grid header (handleSave) — บันทึกทุก changedRows ทั้งหมด
- ธีม: ปุ่มแยกใน ThemeSettingsPanel (`handleSaveTheme`) — บันทึก theme_preset/primary/secondary
- ปุ่ม "รีเซ็ตการแก้ไข" (reset form กลับค่า DB), "เปรียบเทียบก่อนบันทึก" (diff dialog), "รีเซ็ตเริ่มต้น" (per key, ใช้ defaults)
- ไม่มีการบันทึกอัตโนมัติ (auto-save) — ต้องกดบันทึกเอง

### 3.4 การเตือนก่อนออกโดยไม่บันทึก
- **ไม่มี** `beforeunload` หรือ guard navigation ที่ตรวจพบในโค้ด. มีเพียง badge "ยังไม่บันทึก" และปุ่ม disabled เมื่อไม่มีการเปลี่ยนแปลง. ผู้ใช้อาจออกจากหน้าโดยไม่บันทึกได้โดยไม่มีการเตือน.

### 3.5 การ validate
- มี validate บางส่วน: NUMBER_KEYS ต้องเป็นตัวเลข (`/^\d+(\.\d+)?$/`), COLOR_KEYS ต้องเป็น `#RRGGBB`, theme hex ต้อง 6 หลัก
- ไม่มี validate สำหรับ email format, port range, URL, JSON structure, ค่าที่ขึ้นกับกัน (เช่น sla hours)
- ไม่มี client-side required field enforcement สำหรับ key ที่จำเป็น

### 3.6 ประวัติการเปลี่ยนแปลง (audit)
- มี: ปุ่ม "ประวัติการแก้ไข" → dialog แสดง 100 รายการล่าสุดจาก `settings_audit_log` (ใคร/user_name, key, old→new, เวลา) พร้อม mask ค่าลับ
- API: `settings.php?audit=100` (เฉพาะ admin `settings:manage`)
- ทุก PUT ที่เปลี่ยนค่าจะ insert `settings_audit_log` + `audit_log()`
- ไม่มี diff view ย้อนหลัง (ดูได้เฉพาะ list)

### 3.7 ปุ่มทดสอบ (test)
- `/settings/notifications`: มีปุ่ม "ส่งข้อความทดสอบ" (LINE/email) — ไม่แน่ใจว่ามีในหน้านี้ (ต้อง inspect เพิ่ม)
- `/settings/push`: มีปุ่ม "ทดสอบ push" (`action=test_push_self`)
- `/settings/services`: ตรวจสถานะบริการ (read-only, ไม่ใช่ปุ่มทดสอบส่ง)
- หน้า `/settings` หลัก: **ไม่มี** ปุ่มทดสอบส่งข้อความ


---

## 4. ปัญหา UX ที่เห็นจากโค้ด

### 4.1 ModuleGuide
- มี `ModuleGuide` ใน 7 หน้า: `/settings`, `/settings/design`, `/settings/health`, `/settings/menus`, `/settings/pwa`, `/settings/repair-options`, `/settings/services`
- ไม่มีใน: `/settings/master/[entity]`, `/settings/notification-prefs`, `/settings/notification-rules`, `/settings/notifications`, `/settings/permission-diff`, `/settings/push`

### 4.2 สีที่ hardcode
- พบ hex สี hardcode ใน settings/*.tsx จำนวน 13 ค่า distinct (เช่น #0068B5, #fee2e2, #f8fafc, #1d4ed8, #dc2626, #4F46E5 ฯลฯ) — ควรใช้ CSS variables (`var(--cmms-*)`) แทนเพื่อรองรับ theme
- บางค่าใช้ inline style แทน Tailwind token

### 4.3 ตารางที่ล้นมือถือ
- `/settings/menus` มี preview มือถือ + ตาราง permission (horizontal scroll ไม่แน่ใจ)
- `/settings/permission-diff` แสดง drift ต่อ role (Card ต่อ role) — อาจล้นบนจอเล็ก
- `/settings/repair-options` มีตาราง master data + dialog เพิ่ม/แก้ไข — อาจล้น
- `/settings/notifications` มี tabs (overview/line/email) + matrix — อาจล้นบน 390px
- หน้า `/settings` หลัก: Grid `minWidth: 260` สำหรับ topic cards → บน 390px จะเป็น 1 คอลัมน์ (โอเค); subpages grid `minWidth: 180` → 1-2 คอลัมน์

### 4.4 ปุ่มเล็กกว่า 40px
- พบ 1 จุด: `/settings/notification-prefs` ปุ่ม matrix ใช้ `minHeight: 36` (ต่ำกว่า 40px)
- ปุ่ม pill "หน้าเฉพาะ" ใน topic card ใช้ `px-2 py-0.5` (เล็ก)
- ปุ่ม "รีเซ็ตเริ่มต้น" ใช้ padding `4px 8px` (เล็ก)

### 4.5 ข้อความที่ซ้ำ
- คำว่า "ตั้งค่า" ปรากฏซ้ำในหลายหน้า (title/breadcrumb/ModuleGuide)
- ป้าย "ยังไม่บันทึก" / "รายการ" ซ้ำใน topic card และ form panel
- คำอธิบาย hint บาง key ซ้ำกับ description ใน DB

### 4.6 ลำดับที่ผู้ใช้ต้องกดเพื่อทำงานหลัก 5 อย่าง
1. **เปลี่ยนช่องทางแจ้งเตือน**: `/settings` → topic "การแจ้งเตือน" → group notification → แก้ key → บันทึก. หรือ `/settings/notifications` (subpage) สำหรับ template LINE
2. **เพิ่มแผนก/ที่ตั้ง**: `/settings` → subpage "ตัวเลือกฟอร์มแจ้งซ่อม" (`/settings/repair-options`) หรือ `/settings/master/departments` `/settings/master/locations` → เพิ่ม → บันทึก
3. **แก้ตัวเลือกแจ้งซ่อม**: `/settings/repair-options` → เลือก tab ประเภท → เพิ่ม/แก้ไข/ลบ → บันทึก
4. **ตรวจสถานะการเชื่อมต่อ Sage/LINE**: `/settings/services` (admin) → ดูสถานะ + LINE webhook URL. หรือ `/settings/health` สำหรับ Sage 300/Storage
5. **เปลี่ยนสิทธิ์เมนูของ role**: `/settings` → subpage "สิทธิ์เมนูตามบทบาท" (`/settings/menus`, admin) → เลือก role → toggle เมนู → บันทึก. ตรวจ drift ด้วย `/settings/permission-diff`


---

## 5. สรุป: ข้อเสนอการจัดกลุ่มใหม่ (7 หมวด)

ข้อเสนอ: แยก "การตั้งค่าของฉัน" (per-user: notification-prefs, push, profile) กับ "การตั้งค่าระบบ" (admin/system-wide). หมวดระบบ 7 กลุ่ม: ข้อมูลหลัก / ผู้ใช้และสิทธิ์ / การแจ้งเตือน / ขั้นตอนการทำงาน / หน้าตาและแอป / การเชื่อมต่อ / ระบบและความปลอดภัย. จับคู่ทุกหน้าและทุก setting_group ที่มีจริง (ไม่ตัดทิ้ง).

### 5.1 หน้า (pages) -> หมวด

| หมวด | หน้าที่จับคู่ |
|---|---|
| การตั้งค่าของฉัน (per-user) | /profile, /settings/notification-prefs, /settings/push, /notifications, /notifications/history |
| ข้อมูลหลัก | /settings/master/[entity], /settings/master/departments, /settings/master/locations, /settings/repair-options (ส่วน master data), /onboarding |
| ผู้ใช้และสิทธิ์ | /roles, /roles/create, /roles/edit, /users, /users/create, /users/edit, /users/leaderboard, /settings/menus, /settings/permission-diff |
| การแจ้งเตือน | /settings/notifications, /settings/notification-prefs, /settings/notification-rules, /settings/push |
| ขั้นตอนการทำงาน | /settings (topics: repair, repair_options, pm, spare, calibration) + /settings/repair-options |
| หน้าตาและแอป | /settings/design, /settings/pwa, /install, /editor, /editor/builder, /pages, /pages/[slug] |
| การเชื่อมต่อ | /settings/services, /settings/health (Sage/ERP part), /settings (topic erp) |
| ระบบและความปลอดภัย | /settings (topic system), /settings/health, /audit-log, /register, /settings (topic company?) |

### 5.2 setting_group -> หมวด

| setting_group | หมวดที่เสนอ | จำนวน key |
|---|---|---|| Andon | หน้าตาและแอป | 3 |
| asset_reliability | ขั้นตอนการทำงาน | 19 |
| branding | หน้าตาและแอป | 5 |
| calibration | ขั้นตอนการทำงาน | 13 |
| calibration_config | ขั้นตอนการทำงาน | 2 |
| company | ข้อมูลหลัก | 5 |
| contractor | ขั้นตอนการทำงาน | 12 |
| cost | ขั้นตอนการทำงาน | 6 |
| data_retention | ระบบและความปลอดภัย | 2 |
| engineering_change | ขั้นตอนการทำงาน | 46 |
| ERP_Integrations | การเชื่อมต่อ | 2 |
| general | ระบบและความปลอดภัย | 54 |
| iot | ขั้นตอนการทำงาน | 23 |
| knowledge | ข้อมูลหลัก | 25 |
| notification | การแจ้งเตือน | 36 |
| pm_config | ขั้นตอนการทำงาน | 5 |
| rca | ขั้นตอนการทำงาน | 12 |
| reliability | ขั้นตอนการทำงาน | 29 |
| repair_config | ขั้นตอนการทำงาน | 12 |
| Reports | ไม่แน่ใจ | 1 |
| Security | ระบบและความปลอดภัย | 1 |
| shutdown | ขั้นตอนการทำงาน | 10 |
| SideNav | หน้าตาและแอป | 2 |
| spare_config | ขั้นตอนการทำงาน | 4 |
| spare_optimization | ขั้นตอนการทำงาน | 45 |
| work_permit | ขั้นตอนการทำงาน | 16 |
| workforce | ขั้นตอนการทำงาน | 9 |
| การ์ด | หน้าตาและแอป | 3 |
| ตัวอักษร | หน้าตาและแอป | 2 |

### 5.3 Key ที่ไม่พบการอ้างอิงในโค้ด (orphan)

- `cal_phase29_applied_ver`
- `urgent_repair_auto_priority`
- `urgent_repair_escalation_hours`
- `urgent_repair_notify_line`
- `urgent_repair_notify_telegram`

### 5.4 การตั้งค่าที่ซ้ำกัน / หลายที่แก้ได้

- `theme_primary_hex` / `theme_secondary_hex`: แก้ได้ทั้งใน `/settings` (topic บริษัท/branding) และ `/settings/design` (ThemeSettingsPanel) → ซ้ำ
- `company_name` / `company_phone`: แก้ได้ใน `/settings` และแสดงในหน้า login/แจ้งซ่อม → ไม่แน่ใจว่ามีหน้าอื่นแก้
- `repair_options` (group) และ master data แผนก/ที่ตั้ง: แก้ได้ทั้ง `/settings/repair-options` และ `/settings/master/departments` `/settings/master/locations` → ซ้ำ (redirect ไป repair-options)
- `line_tpl_*`: แก้ได้ใน `/settings` (JSON read-only) และ `/settings/notifications` (template editor) → สองทาง
- `menu_permissions`: แก้ได้ใน `/settings/menus` และ `/settings/permission-diff` (อ่านอย่างเดียว) → ไม่ซ้ำ (อ่าน vs เขียน)

### 5.5 หมายเหตุ

- การจัดหมวดเป็นข้อเสนอ (proposal) เท่านั้น — ยังไม่ได้แก้โค้ด
- ค่าที่ "ไม่แน่ใจ" ระบุไว้ชัดเจนตามคำขอ
- หน้าที่ระบุ "ไม่แน่ใจ" ในส่วนที่ 1 ไม่ได้ inspect API/permission ในรอบนี้
