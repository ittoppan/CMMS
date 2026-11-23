# MASTER MODULE INVENTORY — CMMS-TPT

> Phase 0 · 2026-11-23 · นับจาก `page.tsx` จริง + API + ข้อมูลใน DB (อ้าง `docs/STATUS.md` §6 ณ วันเดียวกัน)
> สถานะ UI: `COMPLETE` = ผ่าน UI migration (PageHeader/DetailHeader) · `PARTIAL` = มีงานค้างระบุไว้ · `DEMO` = ต้องลบ

## 1. ตารางรวม (49 โฟลเดอร์ + 10 หน้านอก shell)

| # | Module | Pages | API หลัก | Role หลัก | UI | ข้อมูลจริง | Phase |
|---|---|---:|---|---|---|---|---|
| 1 | `dashboard` (portal, my, wallboard, backlog-aging, data-quality, facility, lubrication, pm-compliance, predictive-ai, production-impact, shift-handover, utility-energy, list) | 13 | `dashboard.php`, `data_quality.php`, `facility.php`, `lubrication.php`, `production_impact.php`, `shift_handover.php`, `utility_energy.php`, `predictive_ai.php` | ทุก role (กรองด้วย `useMenuPermission`) | PARTIAL (perf/TBT D2, KPI ต้องตรวจซ้ำ) | บางส่วน (4 ตารางใหม่มีตัวอย่าง 33 แถว, `lubrication_logs`=0) | 4 |
| 2 | `repair` (list, create, edit, view, assign, tracking, history, kanban, my_tasks, workload, print) | 11 | `repair.php`, `supervisor.php`, `repair_attachment.php` | ทุก role | COMPLETE | 126 WO (completed 0) | 5,6 |
| 3 | `supervisor` (desk, queue, review, plan, verify) | 5 | `supervisor.php` | 1,2,6,7 | IN PROGRESS (D3.2 ใน working tree) | ใช้ `repair` เดียวกัน | 6 |
| 4 | `pm_am` (plans, calendar, checksheet, batch_schedule, checklists, dashboard, create, edit, plans/[id], view) | 12 | `pm_am.php`, `pm_plans.php`, `pm_reminders.php`, `pm_ical.php` | 3,7,1,2,6 | COMPLETE | **`pm_am`=0 แถว → ตรวจ workflow จริงไม่ได้** | 7 |
| 5 | `asset_registry` (list, create, edit, view, bom_tree, criticality, oee, plant_map) | 8 | `asset_registry.php`, `machine_bom.php`, `asset_stats.php` | 1,2,6,7,3 | COMPLETE | 82 assets | 8 |
| 6 | `asset-reliability` (hub, critical, lifecycle, aging, replacement, overhaul, data-quality, reports, config, [id]) | 10 | `asset_reliability.php`, `asset_lifecycle.php` | วิศวกร/ผจก. | COMPLETE | อิง `mtbf_mttr` (downtime 0) | 8 |
| 7 | `reliability` (hub, assets, studies, trend, weibull, bad-actors, failure-modes, pm-effectiveness, growth, data-quality, config, assets/[id], studies/[id]) | 13 | `reliability.php`, `mtbf_mttr.php` | วิศวกร/ผจก. | COMPLETE | `mtbf_mttr` downtime 0 → คำนวณ MTBF/MTTR ไม่ได้ | 8 |
| 8 | `spare_parts` (list, overview, balances, returns, stock_take, issue_center, reservations, optimization, sage_po, sage_shipments, sage_sync, create, edit) | 13 | `spare_parts.php`, `spare_issue.php`, `spare_issue_request.php`, `spare_optimization.php`, `spare_reorder.php`, `stock_take.php`, `sage_*.php` | คลัง/Officer(8)/ผจก. | COMPLETE | 1870 items; list payload ~1MB (IMP-1) | 8 |
| 9 | `calibration` (instruments, plans, schedule, standards, procedures, certificates, oot, po, config, dashboard, data-quality, tracking, reports, mobile, create, edit, run/[id], instruments/[id]) | 20 | `calibration.php`, `calibration_management.php`, `calibration_tracking.php` | 1,2,6 | COMPLETE | ต้องตรวจข้อมูลจริงแยก | 8 |
| 10 | `inspections` (hub, templates, run, history) | 4 | `inspections.php`, `inspection_execute.php`, `inspection_history.php`, `inspection_dashboard.php`, `checklist_templates.php` | 3,7 | COMPLETE | — | 7 |
| 11 | `planning` (hub, calendar) | 2 | `planning.php`, `pm_ical.php` | 1,2,6,7 | COMPLETE | `pm_am`=0 | 7 |
| 12 | `field` (hub, plan, work/[id]) | 3 | `repair.php`, `supervisor.php` | 3 (technician) | COMPLETE | — | 10 |
| 13 | `workforce` (hub, technicians, technicians/[userId], skills, certifications, training, capacity, shifts, crews, conflicts, mine) | 11 | `workforce.php`, `workload.php` | 1,2,6,7 | COMPLETE | users 21 | 10 |
| 14 | `reports` (hub, report-center, work-orders, downtime, cost, sla, pm, spare-parts, technicians, requests, inspections, scheduled, export_excel, import_excel, monthly_pdf, mttr-mtbf, assets) | 17 | `reports.php`, `report_schedule.php`, `asset_reports.php`, `export_excel` (PHP page) | 1,2,6 | COMPLETE (ผ่าน `report-page`) | — | 9 |
| 15 | `analytics` (hub, kpi, advanced, intelligence, esg_carbon, tco) | 6 | `analytics_advanced.php`, `analytics_monthly.php`, `intelligence.php`, `kpi_dashboard.php` | ผจก./Admin | COMPLETE | — | 4,9 |
| 16 | `cost` + `budget` | 2 | `cost.php` | 1,2,6 (V3) | COMPLETE | — | 4 |
| 17 | `iot` (monitor, condition) | 2 | `iot.php`, `iot_ingest.php` | 1,2,6,7 | COMPLETE | — | 4 |
| 18 | `rca` (hub, events, new, [id], taxonomy) | 5 | `failure.php` | วิศวกร | COMPLETE | — | 9 |
| 19 | `mtbf_mttr` (list, create, edit, production_hours ×3) | 6 | `mtbf_mttr.php`, `production_hours.php` | 1,2,6 | COMPLETE | downtime 0 | 4 |
| 20 | `knowledge` (hub, articles, articles/[id], create, gaps, gaps/[id], reviews, search, taxonomy, usage) | 11 | `knowledge.php` | ทุก role อ่าน | COMPLETE | — | 9 |
| 21 | `documents` (hub, [id], create, engineering-changes redirects, forms/manuals/review/shutdown/edit redirects) | 9 | `document.php` | 1,2,6 | COMPLETE | — | 9 |
| 22 | `engineering-changes` (list, [id], create, requests/edit redirects) | 5 | `engineering_change.php` | 1,2,6 | COMPLETE | — | 9 |
| 23 | `forms` (hub, designer, run/[id]) | 3 | `forms.php`, `form_templates.php` | 1,2,6,7 | COMPLETE | — | 7 |
| 24 | `manuals` (list, create, edit) | 3 | `manuals.php` | ทุก role อ่าน | COMPLETE | — | 9 |
| 25 | `safety` (work_permit list, create, [id]) | 3 | `work_permit.php`, `approval.php` | 1,2,6,7 | COMPLETE | — | 6 |
| 26 | `shutdown` (list, [id]) | 2 | `shutdown.php` | ผจก. | COMPLETE | — | 7 |
| 27 | `approval` (center, list) | 2 | `approval.php` | 1,2,6,7 | COMPLETE | — | 6 |
| 28 | `contractors` (list, create, [id], work) | 5 | `contractor.php` | 1,2,6 | COMPLETE | — | 9 |
| 29 | `suppliers` (list, create, edit) | 3 | `suppliers.php` | คลัง | COMPLETE | — | 8 |
| 30 | `equipment_borrowing` (list, create, edit) | 3 | `equipment_borrowing.php` | ทุก role | COMPLETE | — | 8 |
| 31 | `users` / `roles` | 7 | `users.php`, `roles.php`, `permission_diff.php` | Admin | COMPLETE | 21 users | 3 |
| 32 | `settings` (hub, design, health, master/[entity], menus, notification-prefs, notification-rules, notifications, permission-diff, push, pwa, repair-options, services) | 13 | `settings.php`, `master_data.php`, `menu_permissions.php`, `system_health.php`, `system_services.php`, `pwa_settings.php`, `push_subscribe.php` | Admin | COMPLETE | — | 3 |
| 33 | `notifications` (list, history) | 2 | `notifications.php`, `notifications_log.php` | ทุก role | COMPLETE | — | 5 |
| 34 | `editor` / `pages` / `facility-layout` / `process-flows` | 5 | `page_editor.php`, `custom_pages.php`, `facility_layout.php` | Admin | COMPLETE | — | 9 |
| 35 | `onboarding` | 1 | — | ทุก role | NEW (ไม่มีในตาราง migration) | — | 3 |
| 36 | `alert-center`, `andon-board`, `feedback`, `home`, `profile`, `predictive-maintenance`, `spare-reorder`, `sync-center`, `audit-log` | 9 | `predictive_maintenance.php`, `spare_reorder.php`, `feedback.php`, `audit_logs.php`, `asset_hub.php` | ตาม role | COMPLETE | — | 4 |
| 37 | นอก shell: `login`, `register`, `install`, `change-password`, `scan`, `tv`, `qr-sheet`, `my-repairs`, `repair-request`, `repair` | 10 | `api/auth/login.php`, `scan.php`, `my_repairs.php` | public/ทุก role | COMPLETE | — | 5,10 |
| 38 | `ui-demo`, `ui-kit` | 2 | — | dev | **DEMO — ต้องลบ** | — | 2 |

## 2. งานค้างรายโมดูล (อ้างจากรายงานเดิม)

| Module | งานค้าง | ที่มา |
|---|---|---|
| dashboard/wallboard | TBT 680ms (เป้า <300) — Recharts ต้องแยกไฟล์ lazy | `PHASE_D2_PERFORMANCE_REPORT.md` |
| dashboard/* | KPI ทุกตัวต้อง trace ได้ + last-updated + drill-down + INSUFFICIENT DATA | `KPI_INVENTORY.md`, master spec §4 |
| supervisor | D3.3–D3.8 (queue redesign, detail, responsive, axe, role E2E, perf) | `PHASE_D3_UX_AUDIT.md` §10 |
| repair/request | D1 ปิดแล้ว (4 คลิก) — เหลือ my-repairs/request history polish | `PHASE_D_EXECUTION_REPORT.md` |
| pm_am | ไม่มีข้อมูล (`pm_am`=0) → ต้องมีข้อมูลจริงก่อน validate | `STATUS.md` |
| spare_parts | server-side pagination/filter (IMP-1) | `FUTURE_BACKLOG.md` |
| reports | export ต้องใช้ filter เดียวกับหน้าจอ + permission + progress | master spec §9 |
| ทุกโมดูล | endpoint enforcement 108/113 | `API_PERMISSION_MATRIX.md` |
| ทุกโมดูล | responsive 768/1440 + axe ยังไม่ครบทุกหน้า | `DESIGN_REPORT.md` §8 |
