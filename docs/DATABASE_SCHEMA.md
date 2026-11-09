# CMMS-TPT Database Schema — สรุป

ฐาน: MySQL (InnoDB, utf8mb4) — **110 ตาราง** (นับจริง 2026-09-17 ผ่าน `SHOW TABLES`). `getDb()` บังคับ `SET time_zone='+07:00'` ให้ `NOW()`/`CURRENT_TIMESTAMP` ตรงกับ `date()` ของ PHP (เซ็ต `Asia/Bangkok` ใน php.ini) — จุดสำคัญที่เคยทำให้ข้อมูลคลาด +7 ชม.

> หมายเหตุ: `pm_am_plans` ไม่ใช่ `pm_plans`; `equipment_borrowing` ใช้ `borrower_id` ไม่ใช่ `user_id`; audit จริงอยู่ที่ `audit_logs` (append-only) ส่วน `audit_trail` เป็นตารางเก่า. ตรวจแล้วไม่ orphan FK ใน flow หลัก (phase20_qa §A).

## กลุ่มหลัก

**ผู้ใช้ / ระบบ**
- `users`, `roles`, `user_permissions`, `menu_permissions`, `login_audit_log`, `departments`, `organizational_chart`, `work_zones`, `work_assignees`, `approval_requests`, `rejection_reasons`

**งานซ่อม**
- `repair` (งานซ่อม — `work_order_no` unique), `repair_attachments` (รูป/ไฟล์, offline sync ใช้ `base_updated_at`), `repair_spare_parts` (อะไหล่ที่ใช้), `repair_activity_log`, `repair_options` (dropdown — รอบนี้ปิดช่องโหว่ auth), `repair_codes`, `repair_types`, `repair_ratings`, `repair_tags` + `repair_tag_pivot`, `maintenance_requests`, `maintenance_request_activity`, `work_pause_logs`, `work_permits`, `rca_records`, `failure_codes`, `budget_plan`

**PM / เช็กลิสต์ / ตรวจสอบ**
- `pm_am_plans` (หัวแผน — ใช้ชื่อนี้ในโค้ด), `pm_am` (งาน PM ตามรอบ), `pm_am_plan_assets` (เครื่องในแผน), `pm_am_plan_checklists`, `pm_am_checklist_results`, `pm_am_spare_parts`, `pm_planned_parts`, `pm_am_attachments`
- `inspection_templates`, `inspection_template_items`, `inspection_schedules`, `inspection_results`, `inspection_measurements`, `inspection_photos`, `inspection_item_types`, `inspection_fail_actions`
- `checklist_templates`, `checklist_template_items`

**สินทรัพย์**
- `asset_registry`, `asset_qr_codes`, `asset_responsible_persons`, `machine_bom` (BOM: ระบุส่วนประกอบเครื่องจักร), `locations`, `plants_sites`

**อะไหล่ / จัดซื้อ / Sage**
- `spare_parts` (+ units, groups, kits, approvals, transactions), `spare_issue_requests` + `spare_issue_request_items` (ใบเบิก — `Approved` ถึงตัดสต็อกได้), `spare_issue_items`, `spare_issue_sage_shipments` (รายการที่ส่งออกไป Sage 300), `sage_sync_log`, `suppliers`, `requisitions` + `requisition_items`, `stock_take` + `stock_take_items`

**ครุภัณฑ์ / ยืม**
- `equipment_borrowing` (ยืม-คืน; `borrower_id`, `processed_by`), `borrowing_items`, `borrowing_reasons`

**อุปกรณ์วัด / Calibration**
- `calibration`, `calibration_history`, `calibration_points`, `po_calibration`, `calibration_tracking`

**KPI / Analytics**
- `monthly_kpi_snapshot`, `mtbf_mttr`, `production_hours`, `v_asset_inspection_history` (view), `v_inspection_dashboard_kpis` (view), `v_maintenance_cost` (view — ต้นทุนซ่อม Phase 26)

**Notification / PWA**
- `notifications`, `notification_events`, `notification_deliveries`, `notification_logs`, `notification_preferences`, `notification_rules`, `notification_templates`, `push_subscriptions`, `email_notifications`, `line_registrations`

**Custom / Andon / forms**
- `custom_pages`, `page_layouts`, `bottom_nav_config`, `form_templates`, `form_submissions`, `andon` อยู่กลุ่มนี้ ผ่าน `custom_pages`/`page_layouts`

**Config / Audit**
- `settings`, `settings_audit_log`, `audit_logs` (ใช้งานจริง), `audit_trail` (เก่า), `report_audit_log`, `client_action_log`, `import_history`, `iot_devices`, `iot_sensor_data`, `auto_assignment_rules`, `holidays`, `digital_signatures`, `manuals`

## ตัวอย่าง FK ที่ตรวจผ่าน (no orphan)

`repair.asset_id / assigned_to / created_by`, `repair_spare_parts.repair_id/spare_part_id`, `pm_am.asset_id/assigned_to/plan_id`, `pm_am_plan_assets.asset_id`, `spare_issue_requests.work_order_id`, `spare_issue_request_items.request_id`, `equipment_borrowing.asset_id/borrower_id`, `inspection_schedules.asset_id`, `audit_logs.user_id`, `machine_bom.asset_id` — **0 orphan** ณ วันที่รัน.

Index ที่สำคัญเพิ่มเติม (มีอยู่แล้ว): `idx_repair_asset_id/assigned_to/status`, `idx_audit_created_at/action/severity/user_id/resource`, `idx_logs_*` ครอบ log ตารางใหญ่. ตรวจ `duplicate` เช่น `work_order_no`/`locations.code` = 0 (ไม่ซ้ำ).

## ข้อควรรู้เมื่อแก้ schema

1. เหล็กเส้น `audit_trail` (เก่า) ไม่ได้ใช้งานในโค้ดใหม่ — ยังไม่ลบ (ความเสี่ยงต่ำแต่ต้องวางแผน) อย่าเขียนโค้ดใหม่ไปใช้.
2. ตารางที่ตั้งชื่อสลับกับความนิยม (`pm_am_plans`) — ตรวจด้วยโค้ด ไม่ใช่เดา.
3. ทุก default timestamp ของ DB ต้องเป็น `CURRENT_TIMESTAMP` ใน session timezone +07 (ตอนนี้เป็นไปตาม session — ทำผ่าน `SET time_zone` ที่ `getDb()` แทนการเปลี่ยน global).

## Phase 26 (Cost & Budget) — ผลต่างจากรอบก่อน

- `budget_plan` เพิ่มคอลัมน์: `status` (draft/submitted/active/closed/cancelled), `currency`, `notes`, `created_by`, `approved_by`, `approved_at`, `updated_at` — 12 แถวเดิม backfill `status='active'` (อ่านจาก `allocated_budget` ที่ `public/index.php` / `monthly_pdf.php` ยังทำงานเหมือนเดิม)
  - `budget_plan.id` เป็น **signed int** → FK/คอลัมน์อ้างอิงเป็น `INT` (ไม่ใช่ UNSIGNED)
- `budget_adjustment` (ใหม่): `budget_id` FK → `budget_plan.id`, `adjustment_amount` (บวก/ลบ), `reason` (บังคับ), `created_by`, `created_at`
- `v_maintenance_cost` (view ใหม่): ต่อใบสั่งซ่อม 1 แถว — คอลัมน์สำคัญ: `repair_id`, `created_at`, `maintenance_type`, `department_id/name`, `asset_id/code/name/category`, `priority/source_type/status`, `repair_time_minutes`, `parts_lines`, `parts_cost`, `cost_parts_snapshot`, `cost_labor_recorded`, `cost_outsource_recorded`, `outsource_by`
- settings ใหม่: `cost_labor_enabled`, `cost_labor_rate_source`, `cost_external_source`, `budget_warning_pct`, `budget_exceed_pct`, `budget_dept_filter_enabled`
- notif templates: `budget:alert`, `budget:over`, `budget:approved` (ใน `notification_templates`)
- menu_permissions: เพิ่ม `cost`, `budget` (ทุก role ตาม policy)
- **ไม่ลบ/ไม่แก้คอลัมน์เดิม** — migration additive เท่านั้น (ดู `database/migration_20260920_phase26_cost_budget.sql`)