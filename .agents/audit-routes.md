# Audit Routes Inventory
> ใช้สำหรับ checklist-design audit ทุกหน้า

## Base URLs
- **PWA (Next.js)**: http://localhost:3001
- **PHP Legacy**:  http://localhost:8081

## วิธี audit แต่ละหน้า
1. ใช้ Playwright MCP `browser_navigate` ไปที่ URL
2. ใช้ `browser_screenshot` จับภาพหน้าจอ
3. ใช้ checklist-design skill: อ่าน audit.md, references/index.md แล้วเลือก checklist ที่ตรงกับหน้า
4. บันทึกผล: present / partially present / missing / not needed + เหตุผล
5. ทำซ้ำทีละหน้าตามรายการด้านล่าง

## Login
หน้า dashboard + ทุกหน้าหลักต้อง login ก่อน:
- หน้า login: http://localhost:3001/login (PWA)
- หน้า login: http://localhost:8081/login.php (PHP)
- **กรุณาใส่ user/password ตอนสั่ง audit** เช่น: "audit ทุกหน้า โดย login admin/admin123"

---

## PWA Routes (http://localhost:3001) — กลุ่มหลัก

### Auth / Public
```
/login
/register
/change-password
/qr-sheet
/scan
/repair/request
```

### Dashboard / Home
```
/dashboard
/profile
```

### Repair (งานซ่อม)
```
/repair
/repair/create
/repair/kanban
/repair/my_tasks
/repair/history
/repair/workload
/repair/assign
/repair/dispatch
/repair/tracking
/repair/view
/repair/edit
```

### PM / AM (ป้องกัน/แก้ไข)
```
/pm_am
/pm_am/create
/pm_am/calendar
/pm_am/batch_schedule
/pm_am/checksheet
/pm_am/edit
/pm_am/view
```

### Asset Registry (ครุภัณฑ์)
```
/asset_registry
/asset_registry/create
/asset_registry/bom_tree
/asset_registry/criticality
/asset_registry/edit
```

### Spare Parts (อะไหล่)
```
/spare_parts
/spare_parts/balances
/spare_parts/create
/spare_parts/edit
/spare_parts/issue_center
/spare_parts/optimization
/spare_parts/returns
/spare_parts/sage_po
/spare_parts/sage_shipments
/spare_parts/sage_sync
/spare_parts/stock_take
```
> หมายเหตุ: `/spare_parts/reorder`, `/spare_parts/reservations` มีเฉพาะใน PHP legacy (ดูด้านล่าง), **ไม่มีหน้า PWA**

### Calibration (สอบเทียบ)
```
/calibration
/calibration/create
/calibration/calendar
/calibration/po
/calibration/tracking
/calibration/edit
```

### Inspections
```
/inspections
/inspections/run
/inspections/templates
```

### Safety / Work Permit
```
/safety/work_permit
```

### Equipment Borrowing
```
/equipment_borrowing
/equipment_borrowing/create
/equipment_borrowing/edit
```

### MTBF / MTTR
```
/mtbf_mttr
/mtbf_mttr/create
/mtbf_mttr/edit
```

### Manuals
```
/manuals
/manuals/create
/manuals/edit
```
> หมายเหตุ: `/manuals/knowledge_base`, `/manuals/sop_chatbot` มีเฉพาะใน PHP legacy — ไม่มีหน้า PWA

### Forms / Designer
```
/forms
/forms/designer
```

### Notifications
```
/notifications
/notifications/history
```

### Approval
```
/approval
/approval/center
```

### Reports / Analytics
```
/reports
/reports/export_excel
/reports/monthly_pdf
/analytics/kpi
```

### IOT
```
/iot/monitor
```

### Users
```
/users
/users/create
/users/edit
```
> หมายเหตุ: `/users/skills`, `/users/leaderboard` มีเฉพาะใน PHP legacy — ไม่มีหน้า PWA

### Roles
```
/roles
/roles/create
/roles/edit
```

### Settings
```
/settings
/settings/design
/settings/menus
/settings/notifications
/settings/pwa
/settings/repair-options
/settings/services
```

### Admin / Dashboard extras
```
/andon-board
/assets
/assets/create
/editor/builder
/pages
/pages/[slug]
/suppliers
/suppliers/create
/suppliers/edit
```

---

## PHP Legacy Routes (http://localhost:8081) — กลุ่มหลัก
> ทุกหน้าอยู่ในรูป /pages/{module}/{page}.php (NOT /{module}/{page}.php — IIS root ชี้ที่ public/)

### Auth
```
/login.php
/logout.php
```

### Repair
```
/repair/index.php
/repair/create.php
/repair/view.php
/repair/edit.php
/repair/kanban.php
/repair/my_tasks.php
/repair/history.php
/repair/assign.php
/repair/dispatch.php
/repair/tracking.php
/repair/request.php
/repair/shift_handover.php
/repair/sla_control.php
/repair/copilot.php
```

### PM
```
/pm_am/index.php
/pm_am/create.php
/pm_am/view.php
/pm_am/edit.php
/pm_am/calendar.php
/pm_am/batch_schedule.php
/pm_am/checksheet.php
```

### Asset Registry
```
/asset_registry/index.php
/asset_registry/create.php
/asset_registry/edit.php
/asset_registry/history.php
/asset_registry/bom.php
/asset_registry/criticality.php
/asset_registry/asset_analytics.php
/asset_registry/cost_dashboard.php
/asset_registry/oee_dashboard.php
/asset_registry/plant_map.php
/asset_registry/qr_batch.php
/asset_registry/qr_sticker.php
```

### Spare Parts
```
/spare_parts/index.php
/spare_parts/create.php
/spare_parts/edit.php
/spare_parts/issue_center.php
/spare_parts/sage_sync.php
/spare_parts/sage_po.php
/spare_parts/optimization.php
/spare_parts/reorder.php
/spare_parts/reservations.php
/spare_parts/scan.php
```

### Calibration
```
/calibration/index.php
/calibration/create.php
/calibration/edit.php
/calibration/calendar.php
/calibration/history.php
/calibration/po.php
/calibration/points.php
```

### Settings (ตัวอย่างหลัก)
```
/settings/index.php
/settings/general.php
/settings/departments.php
/settings/locations.php
/settings/work_zones.php
/settings/repair_types.php
/settings/repair_codes.php
/settings/failure_codes.php
/settings/notification_center.php
/settings/email_notifications.php
/settings/line_config.php
/settings/health.php
/settings/backup.php
/settings/audit_trail.php
/settings/auto_assignment_rules.php
```

### Reports
```
/reports/export.php
/reports/export_excel.php
/reports/monthly_pdf.php
```

### Analytics
```
/analytics/rca.php
/analytics/oee.php
/analytics/predictive.php
/analytics/cost_breakdown.php
/analytics/tco.php
/analytics/esg_carbon.php
/analytics/bi_warehouse.php
```

### Users / Roles
```
/users/index.php
/users/create.php
/users/edit.php
/users/skills.php
/users/leaderboard.php
/roles/index.php
/roles/create.php
/roles/edit.php
```

### Suppliers
```
/suppliers
/suppliers/create
/suppliers/edit
```
> หมายเหตุ: `/suppliers/supplier_rating` มีเฉพาะใน PHP legacy — ไม่มีหน้า PWA

### Safety
```
/safety/work_permit.php
```

### IoT / Manuals
```
/iot/monitor.php
/manuals/index.php
/manuals/create.php
/manuals/edit.php
/manuals/knowledge_base.php
/manuals/sop_chatbot.php
```

---

## Dynamic Routes (ต้องใช้ ID จริงจาก DB)
หน้าเหล่านี้ต้องต่อ `?id=XXX`:
- PWA: `/repair/view`, `/repair/edit`, `/pm_am/view`, `/pm_am/edit`, `/calibration/edit`, `/spare_parts/edit`, `/users/edit`, `/roles/edit`, `/suppliers/edit`, `/asset_registry/edit`, `/manuals/edit`, `/mtbf_mttr/edit`, `/equipment_borrowing/edit`, `/forms/run/[id]`, `/pages/[slug]`, `/inspection/templates` (click through)
- PHP: ทุกหน้า `view.php`, `edit.php` ต่อ `?id=XXX`

**วิธีหา ID:** login เป็น admin แล้วกดเข้าหน้า index ของ module → คลิกเลือก record ใดก็ได้

---

## ลำดับการ audit ที่แนะนำ
1. Login flow (/login → redirect → dashboard)
2. Dashboard
3. Repair module (index → create → view → kanban → my_tasks)
4. PM module
5. Spare Parts
6. Asset Registry
7. Calibration
8. Settings (notification_center, general, modules)
9. Users / Roles
10. Reports / Analytics
11. PHP legacy: ทำเหมือนกันใน 8081