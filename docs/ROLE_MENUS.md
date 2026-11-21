# ROLE_MENUS.md — สถานะเมนูตามบทบาท (Role-based Menus)

> สร้างจากข้อมูลจริง: DB `cmms_tpt` (ตาราง `roles`, `menu_permissions`), `src/menu_catalog.php`, `src/bottom_nav_catalog.php`, `frontend/lib/useMenuPermission.ts`, `frontend/lib/route-perms.ts`

> เอกสารนี้เป็นข้อเสนอ (draft) — ยังไม่ได้ลงมือแก้โค้ด/DB


## 0. วิธีอ่าน / แหล่งข้อมูล / พฤติกรรม default

- `menu_permissions`: แถว `role_id × menu_key × is_granted` (1=เห็น, 0=ซ่อน).
- API `public/api/v1/menu_permissions.php`: ถ้า role ไม่มีแถวสำหรับ menu_key ใด → default = **เห็น (1)**; ถ้ามีแถว → ใช้ค่า `is_granted`.
- Frontend `useMenuPermission().canShow(key)`: `permission[key] !== 0` → key ที่ไม่อยู่ใน permission ก็ถือว่าเห็น.
- Frontend `route-perms.ts`: route guard แบบ fail-open — path ที่ไม่รู้จักหรือ permission ยังโหลดไม่เสร็จ → ผ่าน; กั้นเฉพาะเมื่อ perm ที่ต้องใช้ **ทุกตัวเป็น 0 ชัดเจน**.
- Backend RBAC: `src/helpers/permissions.php` มี `PERMISSION_MATRIX` ต่อ role + `user_permissions` override; endpoint ที่เรียก `requirePerm()` บังคับได้จริง แต่ coverage ไม่เท่ากันทุก endpoint (ดูหัวข้อ 1.3).
- หลัง login: `/api/auth/login.php` ไม่ redirect ตาม role; frontend `/login` ส่งไป `/` → Next.js redirect `/` → `/home` (หน้า launcher ที่กรองเมนูด้วย canShow) สำหรับทุก role เหมือนกัน.

## 1. สถานะปัจจุบัน

### 1.1 ตาราง role | จำนวนเมนูที่เห็นตอนนี้ | เมนูหลักที่เห็น (สรุป)

| role_id | Role | จำนวนเมนูที่เห็น | เมนูหลักที่เห็น (สรุป) |
|---:|---|---:|---|
| 9 | User | 5 | แจ้งซ่อม/ติดตาม/ประวัติ/แจ้งเตือน (5) — User |
| 3 | Operate | 48 | dashboard, repair, my_tasks, request, tracking, field, PM/checksheet, QR, issue_center, knowledge, notifications, reports ฯลฯ (48) |
| 7 | Foreman | 72 | supervisor group, repair assign/workload/kanban, PM calendar, planning, workforce, spare_parts, approval, notifications ฯลฯ (72) |
| 6 | Asst.Manager | 174 | เกือบทั้งหมดยกเว้น users/roles/settings/audit (174) |
| 2 | Manager | 180 | เกือบทั้งหมดยกเว้น users/roles/settings/audit (180) |
| 5 | Viewer | 90 | dashboard, analytics, asset, reliability, PM, inspection, spare_parts, reports, workforce ฯลฯ (90) |
| 8 | Officer | 48 | dashboard, repair tracking, PM, spare_parts, calibration, inspection, knowledge, reports, notifications (48) |
| 10 | Officer-Read | 48 | เหมือน Officer (48) — อ่านอย่างเดียว (matrix แยก) |
| 1 | Admin | 182 | ทุกเมนู (182) |

หมายเหตุ: มีข้อมูล `menu_permissions` สำหรับ `role_id=4` (12 แถว) แต่ตาราง `roles` ไม่มี role id 4 (orphan data) — ไม่รวมในเอกสารนี้; `PERMISSION_MATRIX` ตีความ role 4 = Operator.

### 1.2 ปุ่มล่างมือถือ (bottom_nav_config) ปัจจุบัน

อ่านจากตาราง `bottom_nav_config` (ถ้าไม่มีแถวจะใช้ preset ใน `src/bottom_nav_catalog.php`).

- **User (9)**: repair/request, repair/tracking, notifications
- **Operate (3)**: dashboard, repair/my_tasks, pm_am/checksheet, repair/request, asset_registry
- **Foreman (7)**: dashboard, repair/request, pm_am/calendar, asset_registry, settings
- **Asst.Manager (6)**: dashboard, repair/request, pm_am/calendar, asset_registry, settings
- **Manager (2)**: dashboard, pm_am/checksheet, pm_am/calendar, repair/my_tasks, asset_registry
- **Viewer (5)**: dashboard, analytics, notifications, reports/export_excel, reports/monthly_pdf
- **Officer (8)**: dashboard, repair/request, pm_am/calendar, asset_registry, settings
- **Officer-Read (10)**: dashboard, repair/request, pm_am/calendar, asset_registry, settings (fallback จาก Officer; ไม่มีแถวใน bottom_nav_config)
- **Admin (1)**: dashboard, repair/request, pm_am/calendar, asset_registry, settings

### 1.3 Permission guard ฝั่งเซิร์ฟเวอร์/API หรือ 'ซ่อนเมนู' อย่างเดียว?

- **ซ่อนเมนูเป็นหลัก (UX)**: sidebar/PWA filter ด้วย `canShow()` จาก `menu_permissions`.
- **Route guard ฝั่ง client**: `route-perms.ts` บล็อกหน้าเฉพาะเมื่อ perm ที่ต้องใช้ทุกตัวเป็น 0; fail-open เมื่อยังโหลด/ไม่รู้จัก path.
- **Backend API**: มี RBAC กลาง (`permissions.php`) + `user_permissions` override; endpoint ที่เรียก `requirePerm()` บังคับได้จริง แต่ **coverage ไม่เท่ากันทุก endpoint** — บางหน้า/API อาจพึ่ง `menu_permissions`/session role เพียงอย่างเดียว.
- **สรุปตรงๆ**: การซ่อนเมนู **ไม่ใช่** security boundary ด้วยตัวมันเอง; ต้องตรวจ endpoint ต่อหน้าก่อนถือว่าปลอดภัย. หน้าที่ไม่มี perm key (เช่น `/home`) ไม่ถูกกั้นโดย route guard.

## 2. ข้อเสนอเมนูเริ่มต้น (draft) — ตาราง menu_key × 9 role

สัญลักษณ์: `✓` = เห็น, `—` = ซ่อน. เรียงตามหมวดใน `menu_catalog.php`.

| menu_key | User | Operate | Foreman | Asst.Manager | Manager | Viewer | Officer | Officer-Read | Admin |
|---|---|---|---|---|---|---|---|---|---|
| **งานซ่อมบำรุง** |  |  |  |  |  |  |  |  |  |
| `dashboard` | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `repair` | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `field` | — | ✓ | — | ✓ | ✓ | — | — | — | ✓ |
| `repair/workload` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `repair/request` | ✓ | — | — | ✓ | ✓ | — | — | — | ✓ |
| `repair/assign` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `repair/my_tasks` | — | ✓ | — | ✓ | ✓ | — | — | — | ✓ |
| `repair/tracking` | ✓ | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `repair/kanban` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `repair/history` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **PM & เครื่องจักร** |  |  |  |  |  |  |  |  |  |
| `pm_am` | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `pm_am/calendar` | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `pm_am/create` | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `pm_am/batch_schedule` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `pm_am/checksheet` | — | ✓ | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_registry` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `qr-sheet` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `scan` | — | ✓ | — | — | — | — | — | — | ✓ |
| `asset_registry/bom_tree` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_registry/criticality` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `equipment_borrowing` | — | ✓ | — | ✓ | ✓ | — | — | — | ✓ |
| `calibration` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/instruments` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/plans` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/schedule` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/dashboard` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `calibration/standards` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/procedures` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/certificates` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/oot` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/reports` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/data-quality` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/mobile` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/config` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `calibration/calendar` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `calibration/po` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `calibration/tracking` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `inspections` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `inspections/templates` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `inspections/run` | — | ✓ | — | ✓ | ✓ | — | — | — | ✓ |
| **ความน่าเชื่อถือ & วงจรชีวิต** |  |  |  |  |  |  |  |  |  |
| `asset_reliability` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/dashboard` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `asset_reliability/critical` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/lifecycle` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/aging` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/replacement` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/overhaul` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/data-quality` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/reports` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `asset_reliability/config` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **คลังอะไหล่** |  |  |  |  |  |  |  |  |  |
| `spare_parts` | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `spare_parts/overview` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `suppliers` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `spare_parts/balances` | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `spare_parts/returns` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `spare_parts/stock_take` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `spare_parts/issue_center` | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `spare_parts/sage_shipments` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `spare_parts/sage_po` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `spare_parts/optimization` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `spare_parts/sage_sync` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **วิเคราะห์ & รายงาน** |  |  |  |  |  |  |  |  |  |
| `analytics` | — | — | — | ✓ | ✓ | ✓ | — | — | ✓ |
| `analytics/kpi` | — | — | — | — | — | ✓ | — | — | ✓ |
| `andon-board` | — | — | — | ✓ | ✓ | ✓ | — | — | ✓ |
| `reports/monthly_pdf` | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reports` | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reports/import_excel` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reports/export_excel` | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `iot/monitor` | — | — | — | — | ✓ | — | — | — | ✓ |
| `iot/condition` | — | — | — | — | ✓ | — | — | — | ✓ |
| **ความปลอดภัย & งานที่เสี่ยง** |  |  |  |  |  |  |  |  |  |
| `safety/work_permit` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **ค่าใช้จ่าย & งบประมาณ** |  |  |  |  |  |  |  |  |  |
| `cost` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `budget` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **วิเคราะห์ความเสียหาย & Root Cause** |  |  |  |  |  |  |  |  |  |
| `rca` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `rca/events` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `rca/taxonomy` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **วิศวกรรมความเสียหาย** |  |  |  |  |  |  |  |  |  |
| `reliability` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/assets` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/failure-modes` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/trend` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/weibull` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/bad-actors` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/pm-effectiveness` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/growth` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/studies` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/data-quality` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `reliability/config` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `mtbf_mttr` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **ควบคุมงาน & วางแผน** |  |  |  |  |  |  |  |  |  |
| `supervisor` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `supervisor/queue` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `supervisor/review` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `supervisor/plan` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `supervisor/verify` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `workforce` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `workforce/technicians` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `workforce/skills` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `workforce/certifications` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `workforce/training` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `workforce/capacity` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `workforce/shifts` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `workforce/crews` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `workforce/conflicts` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `workforce/mine` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `process_flows` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **การวางแผนซ่อมบำรุง** |  |  |  |  |  |  |  |  |  |
| `planning` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `planning/calendar` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `field/plan` | — | ✓ | — | ✓ | ✓ | — | — | — | ✓ |
| `shutdown` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **การอนุมัติ & เอกสาร** |  |  |  |  |  |  |  |  |  |
| `approval` | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `forms` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `forms/designer` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `manuals` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| **ระบบ & ตั้งค่า** |  |  |  |  |  |  |  |  |  |
| `notifications` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `notifications/history` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `feedback` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `roles` | — | — | — | — | — | — | — | — | ✓ |
| `system_health` | — | — | — | — | — | — | — | — | ✓ |
| `settings/notifications` | — | — | — | — | — | — | — | — | ✓ |
| `register` | — | — | — | — | — | — | ✓ | ✓ | ✓ |
| `users` | — | — | — | — | — | — | — | — | ✓ |
| `audit_log` | — | — | — | — | — | — | — | — | ✓ |
| `settings` | — | — | — | — | — | — | — | — | ✓ |
| `profile` | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ |
| `editor/builder` | — | — | — | — | — | — | — | — | ✓ |
| `pages` | — | — | — | — | — | — | — | — | ✓ |
| **ผู้รับเหมา & งานภายนอก** |  |  |  |  |  |  |  |  |  |
| `contractor/overview` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `contractor` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `contractor/work` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| **ECR & เอกสารควบคุม** |  |  |  |  |  |  |  |  |  |
| `engineering_change/overview` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `document_control/overview` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| **ศูนย์ความรู้** |  |  |  |  |  |  |  |  |  |
| `knowledge` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/search` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/articles` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/articles/create` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/gaps` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/reviews` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/categories` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `knowledge/tags` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `knowledge/usage` | — | — | — | ✓ | ✓ | — | — | — | ✓ |
| `knowledge/config` | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ |

### 2.1 ส่วนต่างจากสถานะปัจจุบัน (จะเพิ่ม / จะซ่อน)

**User (9)**
- จะเพิ่ม (5): knowledge, knowledge/articles, knowledge/search, manuals, profile
- จะซ่อน (2): repair, repair/history

**Operate (3)**
- จะเพิ่ม (3): equipment_borrowing, profile, scan
- จะซ่อน (37): asset_registry, asset_reliability/dashboard, calibration/calendar, contractor/overview, dashboard, feedback, forms, knowledge/config, knowledge/tags, pm_am, pm_am/calendar, qr-sheet, register, repair, repair/history, repair/request, repair/tracking, reports/assets, reports/downtime, reports/inspections, reports/mttr-mtbf, reports/pm, reports/report-center, reports/requests, reports/scheduled, reports/sla, reports/spare-parts, reports/work-orders, safety/actions, safety/loto, safety/permits, safety/stop_work, safety/work_permit, shutdown/execution, shutdown/readiness, workforce/reports, workforce/workload

**Foreman (7)**
- จะเพิ่ม (8): profile, spare_parts, spare_parts/balances, spare_parts/overview, workforce, workforce/capacity, workforce/skills, workforce/technicians
- จะซ่อน (55): asset_registry, asset_reliability/dashboard, calibration/calendar, contractor/overview, dashboard, equipment_borrowing, feedback, field, field/plan, forms, inspections, inspections/run, inspections/templates, knowledge, knowledge/articles, knowledge/config, knowledge/search, knowledge/tags, manuals, pm_am/batch_schedule, pm_am/checksheet, qr-sheet, register, reliability/actions, repair/history, repair/my_tasks, repair/request, repair/tracking, reports, reports/assets, reports/downtime, reports/inspections, reports/mttr-mtbf, reports/pm, reports/report-center, reports/requests, reports/scheduled, reports/sla, reports/spare-parts, reports/technicians, reports/work-orders, safety/actions, safety/loto, safety/permits, safety/stop_work, safety/work_permit, shutdown/execution, shutdown/planning, shutdown/readiness, shutdown/startup, spare_parts/criticality, spare_parts/warehouses, workforce/mine, workforce/reports, workforce/workload

**Asst.Manager (6)**
- จะเพิ่ม (0): —
- จะซ่อน (8): audit_log, editor/builder, pages, register, roles, settings, settings/notifications, users

**Manager (2)**
- จะเพิ่ม (0): —
- จะซ่อน (7): audit_log, editor/builder, pages, register, roles, settings, settings/notifications

**Viewer (5)**
- จะเพิ่ม (2): analytics/kpi, reports/export_excel
- จะซ่อน (84): asset_registry, asset_reliability, asset_reliability/aging, asset_reliability/config, asset_reliability/critical, asset_reliability/dashboard, asset_reliability/data-quality, asset_reliability/lifecycle, asset_reliability/overhaul, asset_reliability/replacement, asset_reliability/reports, calibration, contractor, contractor/overview, contractor/work, cost, document_control/overview, editor/builder, engineering_change/overview, feedback, field, forms, forms/designer, inspections, inspections/run, knowledge, knowledge/articles, knowledge/articles/create, knowledge/categories, knowledge/config, knowledge/gaps, knowledge/reviews, knowledge/search, knowledge/tags, knowledge/usage, manuals, mtbf_mttr, notifications, notifications/history, pages, pm_am, process_flows, rca, rca/events, rca/taxonomy, reliability, reliability/assets, reliability/bad-actors, reliability/config, reliability/data-quality, reliability/failure-modes, reliability/growth, reliability/pm-effectiveness, reliability/studies, reliability/trend, reliability/weibull, repair, reports/assets, reports/downtime, reports/inspections, reports/mttr-mtbf, reports/pm, reports/requests, reports/scheduled, reports/sla, reports/spare-parts, reports/work-orders, safety/reports, shutdown, spare_parts/criticality, spare_parts/overview, spare_parts/warehouses, suppliers, workforce, workforce/capacity, workforce/certifications, workforce/conflicts, workforce/crews, workforce/mine, workforce/shifts, workforce/skills, workforce/technicians, workforce/training, workforce/workload

**Officer (8)**
- จะเพิ่ม (0): —
- จะซ่อน (0): —

**Officer-Read (10)**
- จะเพิ่ม (0): —
- จะซ่อน (0): —

**Admin (1)**
- จะเพิ่ม (3): analytics/kpi, profile, scan
- จะซ่อน (0): —

หมายเหตุการปรับตามข้อมูลจริง:
- User: คง `repair/request`, `repair/tracking`, `notifications`; เพิ่ม `profile`, `manuals`, `knowledge*`; ซ่อน `repair`, `repair/history` (เพื่อให้เป็นผู้แจ้งซ่อม).
- Operate: คง subset ช่าง; ซ่อน dashboard/asset/calibration/contractor/PM create/report ฯลฯ ที่ไม่อยู่ในรายการ; เพิ่ม `field/plan`, `scan`, `inspections/run`, `spare_parts/issue_center`, `equipment_borrowing`, `knowledge*`, `manuals`, `notifications`, `profile`.
- Foreman: คง supervisor/repair/workforce/spare_parts/approval; ไม่รวม knowledge/manuals (ไม่ได้ระบุ — ถ้าต้องการให้เพิ่ม).
- Asst.Manager/Manager: คงทุกอย่างยกเว้นกลุ่ม settings (`users, roles, settings, settings/notifications, audit_log, system_health, register, editor/builder, pages`).
- Viewer: คงเฉพาะ dashboard/analytics/KPI/andon/reports; ซ่อน asset/reliability/PM/inspection/spare_parts/workforce ฯลฯ.
- Officer/Officer-Read: คงตามสิทธิ์ที่มีอยู่จริง (ไม่เดา) — ถ้าไม่แน่ใจให้ Admin ตัดสินใจ.
- Admin: คงทุกเมนู.

## 3. เมนูมือถือ (bottom nav) ต่อ role (ข้อเสนอ)

| Role | ปุ่มล่าง (4-5) |
|---|---|
| User | repair/request, repair/tracking, notifications, profile |
| Operate | repair/my_tasks, scan, pm_am/checksheet, notifications, profile |
| Foreman | repair/assign, repair/kanban, pm_am/calendar, approval, notifications |
| Asst.Manager | dashboard, pm_am/checksheet, pm_am/calendar, repair/my_tasks, asset_registry |
| Manager | dashboard, pm_am/checksheet, pm_am/calendar, repair/my_tasks, asset_registry |
| Viewer | dashboard, analytics, notifications, reports/export_excel, reports/monthly_pdf |
| Officer | dashboard, repair/request, pm_am/calendar, asset_registry, settings |
| Officer-Read | dashboard, repair/request, pm_am/calendar, asset_registry, settings |
| Admin | dashboard, repair/request, pm_am/calendar, asset_registry, settings |

## 4. แผนการลงมือทำ (ยังไม่ทำ)

### 4.1 วิธีบันทึกค่า (idempotent)

1. สำรองตารางเดิม: `CREATE TABLE menu_permissions_backup_YYYYMMDD AS SELECT * FROM menu_permissions;` และ `bottom_nav_config` เช่นกัน.
2. เขียน SQL/seed แบบ upsert (`INSERT ... ON DUPLICATE KEY UPDATE is_granted=VALUES(is_granted)`) — **ไม่ลบแถวเก่า**, เฉพาะ role ที่ต้องการ.
3. ใช้ script กลาง (เช่น `scripts/align_menu_permissions.php`) แบบ dry-run ก่อน แล้ว `--apply`.
4. สำหรับ role ที่ curated (User, Operate, Foreman, Viewer) ให้ตั้งค่าเฉพาะ keys ในรายการ; keys ที่ไม่ได้ระบุให้คง default (1) หรือตามที่ Admin ตัดสิน.

### 4.2 วิธีตั้งหน้าแรกต่อ role หลัง login

- ปัจจุบัน: ทุก role → `/home` (launcher).
- ข้อเสนอ: เพิ่ม mapping role→landing ใน frontend `/login` (หรือ middleware) เช่น User→`/repair/request`, Operate→`/dashboard/my` (หรือ `/repair/my_tasks`), Foreman→`/supervisor`, Manager/Asst→`/dashboard`, Viewer→`/dashboard`.
- ต้องระวัง: `/dashboard/my` ไม่ใช่ menu_key; ถ้าซ่อน `/dashboard` แล้ว route guard อาจบล็อก — ต้อง either keep `/dashboard` visible หรือ adjust route-perms.

### 4.3 วิธีให้ Admin ปรับต่อได้จาก /settings/menus

- หน้า `/settings/menus` (admin only) ใช้ API GET/POST `menu_permissions.php` อยู่แล้ว; ค่าที่ seed ไปจะแสดงเป็นค่าเริ่มต้น และ Admin กดบันทึกทับได้.
- bottom nav ปรับผ่าน `bottom_nav` ใน POST เดียวกัน.

### 4.4 ความเสี่ยงและสิ่งที่ต้องทดสอบ

- ความเสี่ยง: ซ่อนเมนูมากเกินไปทำให้ผู้ใช้เข้าหน้าที่เคยใช้ไม่ได้; route guard fail-open แต่ถ้า perm=0 ชัดเจนจะ 403.
- ต้องทดสอบ: login แต่ละ role → landing; sidebar/bottom nav; เปิดหน้าที่อนุญาต; หน้าที่ไม่อนุญาตต้อง 403 ไม่ crash; API endpoint ที่หน้านั้นเรียกต้องไม่ 403/500; settings/menus admin ปรับได้; backup/restore.
- ไม่แน่ใจ: Officer/Officer-Read หน้าที่/งานจริง — ใช้สิทธิ์ปัจจุบันเป็นฐาน; Admin ตัดสินใจก่อน seed.

---

## 5. การ Restore จาก Backup

### 5.1 ตารางสำรอง
- `menu_permissions_backup_20261121` — สำรอง `menu_permissions` ก่อน apply (1,486 แถว)
- `bottom_nav_config_backup_20261121` — สำรอง `bottom_nav_config` ก่อน apply (38 แถว)

### 5.2 วิธี restore ทั้งหมด (revert ไปสถานะก่อน apply)

```sql
-- menu_permissions: ล้างข้อมูล curated roles แล้ว restore จาก backup
TRUNCATE TABLE menu_permissions;
INSERT INTO menu_permissions SELECT * FROM menu_permissions_backup_20261121;

-- bottom_nav_config
TRUNCATE TABLE bottom_nav_config;
INSERT INTO bottom_nav_config SELECT * FROM bottom_nav_config_backup_20261121;
```

หรือถ้าต้องการ restore เฉพาะ role ที่ apply (9,3,7,6,2,5) ให้ลบแถวของ role นั้นแล้ว insert จาก backup:

```sql
DELETE FROM menu_permissions WHERE role_id IN (2,3,5,6,7,9);
INSERT INTO menu_permissions
  SELECT * FROM menu_permissions_backup_20261121
  WHERE role_id IN (2,3,5,6,7,9);

DELETE FROM bottom_nav_config WHERE role_id IN (3,6,7,8,9,10);
INSERT INTO bottom_nav_config
  SELECT * FROM bottom_nav_config_backup_20261121
  WHERE role_id IN (3,6,7,8,9,10);
```

### 5.3 วิธี restore ผ่าน Git (โค้ด)
ถ้าต้องการย้อนทั้งโค้ด + DB:
```bash
git checkout 06441136
# แล้วรัน scripts/deploy-next.ps1
```
หมายเหตุ: การ checkout โค้ดอย่างเดียวไม่ย้อน DB — ต้องรัน SQL restore ด้วย

### 5.4 การตรวจสอบหลัง restore
รัน `php scripts/verify_menu_permissions.php` — ควร FAIL (เพราะ restore ไปสถานะเดิม) แล้ว deploy ใหม่ถ้าต้องการ
