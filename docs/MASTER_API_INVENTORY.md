# MASTER API INVENTORY — CMMS-TPT

> Phase 0 · 2026-11-23 · ที่มา: `ls public/api/v1/*.php` (113 ไฟล์) + `docs/API_PERMISSION_MATRIX.md` (97 แถว) + `docs/API_CONTRACT.md`
> **ห้ามเปลี่ยน contract** — ตารางนี้เป็น inventory ไม่ใช่ข้อเสนอแก้

## 1. ภาพรวม

| หัวข้อ | ค่า |
|---|---|
| Endpoint ทั้งหมด | 113 (`public/api/v1`) + `public/api/auth/login.php` |
| ประกาศสิทธิ์แล้ว | 97 (`API_ENDPOINT_PERMISSIONS`) |
| **บังคับใช้จริง** | **5** — `users.php`, `roles.php`, `import_excel.php`, `sage_sync.php`, `sage_shipments.php` |
| ยังไม่มีในเมทริกซ์ | **16** (ดู §4) |
| กลไก | `requireLogin()` → `api_enforce_endpoint_permission()` → `requirePerm()`; CSRF ทุก mutation |
| สิทธิ์ fallback | `user_permissions` (รายคน) > `PERMISSION_MATRIX` (ตาม role); Admin(1) bypass |
| Response | JSON (`JSON_UNESCAPED_UNICODE`), error = `{error: "..."}`, HTTP 4xx |

## 2. Endpoint ตามโมดูล (ชื่อไฟล์จริง)

- **Repair / Work order (7):** `repair`, `supervisor`, `planning`, `workload`, `repair_attachment`, `repair_form_attachment`, `repair_video`
- **Asset (16):** `asset_registry`, `asset_hub`, `asset_components`, `asset_criticality`, `asset_data_quality`, `asset_lifecycle`, `asset_measurements`, `asset_meters`, `asset_overhauls`, `asset_relationships`, `asset_reliability`, `asset_reports`, `asset_stats`, `machine_bom`, `scan`, `global_search`
- **Reliability / MTBF (8):** `reliability`, `mtbf_mttr`, `production_hours`, `failure`, `intelligence`, `predictive_maintenance`, `predictive_ai`, `facility_layout`
- **PM / Inspection (9):** `pm_am`, `pm_plans`, `pm_reminders`, `pm_ical`, `checklist_templates`, `inspections`, `inspection_dashboard`, `inspection_execute`, `inspection_history`
- **Spare parts / Inventory (10):** `spare_parts`, `spare_issue`, `spare_issue_request`, `spare_optimization`, `spare_reorder`, `spare_usage`, `stock_take`, `spare_image`, `equipment_borrowing`, `suppliers`
- **Sage 300 (3):** `sage_items`, `sage_shipments`, `sage_sync`
- **Calibration (3):** `calibration`, `calibration_management`, `calibration_tracking`
- **Reports / Analytics (9):** `reports`, `report_schedule`, `analytics_advanced`, `analytics_monthly`, `kpi_dashboard`, `dashboard`, `cost`, `data_quality`, `production_impact`
- **Operational dashboards ใหม่ (6):** `shift_handover`, `lubrication`, `utility_energy`, `facility`, `predictive_ai` *(นับในกลุ่มบน)*, `asset_hub`
- **Documents / Knowledge (6):** `document`, `manuals`, `engineering_change`, `knowledge`, `custom_pages`, `page_editor`
- **Safety / Approval (2):** `work_permit`, `approval`
- **Contractor / Workforce (3):** `contractor`, `workforce`, `user_lookup`
- **System / Settings (15):** `settings`, `master_data`, `menu_permissions`, `my_permissions`, `permission_diff`, `roles`, `users`, `departments`, `system_health`, `system_services`, `pwa_settings`, `push_subscribe`, `line_notify`, `line_register`, `line_webhook`
- **Notification (2):** `notifications`, `notifications_log`
- **Misc / Utility (10):** `csrf`, `upload`, `profile`, `feedback`, `forms`, `form_templates`, `import_excel`, `ngrok`, `email_notify`, `my_repairs`, `repair_options`, `iot`, `iot_ingest`, `index`

## 3. สถานะการบังคับใช้สิทธิ์ (จากเมทริกซ์)

| สถานะ | จำนวน | ตัวอย่าง |
|---|---:|---|
| ✅ บังคับใช้ | 5 | users, roles, import_excel, sage_sync, sage_shipments |
| ประกาศแล้วแต่ยังไม่บังคับ | 92 | repair, spare_parts, supervisor, approval, planning, inspections, … |
| ไม่มีในเมทริกซ์ | 16 | ดู §4 |

**เหตุผลที่ยังไม่บังคับ (ตามเอกสารเดิม):** หน้าเว็บของช่าง/คลังเรียก endpoint เพื่อเติม dropdown และ `menu_permissions` กว้างกว่า `PERMISSION_MATRIX` บางโมดูล — เปิดทันทีจะเกิด 403 กับผู้ใช้จริง ⇒ ต้อง UAT กับ role จริงก่อนเปิดทีละกลุ่ม (`API_PERMISSION_ENFORCED`)

## 4. Endpoint ที่ยังไม่มีในเมทริกซ์ (16)

`asset_hub`, `asset_meters`, `data_quality`, `facility`, `facility_layout`, `global_search`, `lubrication`, `my_permissions`, `my_repairs`, `permission_diff`, `predictive_ai`, `predictive_maintenance`, `production_impact`, `shift_handover`, `spare_reorder`, `utility_energy`

→ **งาน Phase 11 (Security):** เติมแถวใน `API_ENDPOINT_PERMISSIONS` + เอกสาร (ไม่เปลี่ยน contract) และตรวจ guard ที่มีอยู่จริงในไฟล์ (`requireLogin`/`requireRole`/`requirePerm`)

## 5. Guard ที่มีอยู่แล้วในโค้ด (ไม่ต้องรอเมทริกซ์)

- ทุก endpoint: `requireLogin()` (ยกเว้น `csrf.php`, `iot_ingest.php`, `line_webhook.php`, `spare_image.php`, `user_lookup.php` ที่เอกสารระบุว่า "ไม่มี guard"; `feedback.php` มี `requireLogin($pdo, false)` จริง — แก้ตาม `PHASE_11_GUARD_VERIFICATION.md`)
- Mutation: CSRF (`src/csrf.php`) — ต้องคงไว้ 100%
- Role-based เฉพาะทาง: `requireRole(...)` ใน `cost`, `dashboard`, `inspections`, `planning`, `spare_issue_request`, `spare_usage`, `supervisor`, `notifications`
- Read-only UI: `my_permissions.php?module=` + `ui_permissions.php` + `useCan()` (fail-closed)

## 6. ความเสี่ยง / งานถัดไป (ไม่แก้ตอนนี้)

| # | เรื่อง | Severity | หมายเหตุ |
|---|---|---|---|
| A1 | 108 endpoint ไม่ enforced ระดับ endpoint | High | มี guard เดิมบางส่วน; ต้อง UAT role จริงก่อนเปิด |
| A2 | 6 endpoint "ไม่มี guard" ตามเอกสาร | High | ต้องตรวจซ้ำใน Phase 11 (ห้ามเดา) |
| A3 | `index.php` เป็น endpoint แปลก (ไม่ใช่ API จริง) | Low | ตรวจว่าไม่ถูกเรียกจาก UI |
| A4 | `spare_parts.php` list ส่ง ~1MB | Medium | ต้อง pagination ฝั่ง server (IMP-1) — เปลี่ยน contract query param ไม่ใช่ response shape |
| A5 | `approval.php` ใช้ token-based (email/LINE link) | Medium | คงไว้ตามคำสั่งเดิม; ห้ามเปลี่ยน auth |
