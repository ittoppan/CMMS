# PROJECT_CONTEXT.md — CMMS-TPT

> สรุปบริบทโปรเจคสำหรับอ้างอิง/オンボーディ้ง (สร้างโดย agent, ไม่แก้โค้ดใด ๆ)

## 1. Tech Stack และเวอร์ชัน

| ชั้น | เทคโนโลยี | เวอร์ชัน/หมายเหตุ |
|---|---|---|
| Backend API | PHP (PDO, JSON) | PHP 8.3.36 (CLI) |
| Database | MySQL (utf8mb4) | DB name `cmms_tpt` (host 127.0.0.1:3306) |
| Frontend (canonical UI) | Next.js App Router | `next ^16.2.10`, React 19.2.4 |
| ภาษา FE | TypeScript | `^5` |
| Styling FE | Tailwind CSS | v4 (`@tailwindcss/postcss ^4`) |
| Styling legacy | Tailwind CSS | v3.4.17 (root, ใช้กับ PHP pages) |
| Design System | Astryx (`@astryxdesign/*`) | 0.1.9 |
| UI primitives | Radix UI | หลายแพ็กเกจ (dialog, select, tabs, switch ฯลฯ) |
| Form | React Hook Form + Zod | 7.85 / 4.4.3 |
| Data fetching | TanStack Query | 5.101.4 |
| Table | TanStack Table | 9.1.2 |
| Chart | Recharts | 3.10.0 |
| 3D | three.js | 0.187.0 |
| PDF/Export | jsPDF, html2canvas | 4.2.1 / 1.4.1 |
| QR/Scan | qrcode, @zxing/* | 1.5.4 / 0.21.3 |
| Realtime/Notify | Web Push, LINE Messaging, Telegram, ntfy, MS Teams (webhook) | ดู `src/helpers/notification.php`, `src/helpers/ntfy.php` |
| ERP | Sage 300 (ODBC) | `src/helpers/sage300.php` |
| Auth | LINE Login + LIFF, Session PHP | `src/auth.php`, `src/helpers/liff.php` |
| Web server | IIS (Windows) + Next.js standalone :3001 | `web.config`, `frontend/deploy.ps1` |
| Tunnel | zrok / ngrok / cloudflared | ตาม `.env` |
| Test | Playwright | `@playwright/test ^1.62.1` |

## 2. โครงสร้างโฟลเดอร์ (2–3 ระดับ)

```
cmms-tpt/
├─ frontend/                 # Next.js UI หลัก (canonical)
│  ├─ app/                   # App Router routes (252 pages)
│  │  ├─ (dashboard)/        # หน้าหลักหลัง login
│  │  ├─ login, register     # auth pages
│  │  ├─ api/                # Next route handlers (บางส่วน)
│  │  └─ repair, scan, tv    # หน้าเฉพาะทาง
│  ├─ components/            # React components (ui/, layout/, dashboard/)
│  ├─ lib/                   # hooks/utils/api clients
│  ├─ public/                # static assets, sw.js
│  └─ tests/                 # Playwright e2e
├─ public/                   # PHP web root (IIS)
│  ├─ api/v1/                # REST API PHP (canonical backend)
│  ├─ api/auth/              # auth endpoints
│  ├─ pages/                 # PHP pages (stub 302 ไป Next.js ผ่าน gone_next.php)
│  ├─ css/, js/, assets/     # static
│  └─ uploads/               # ไฟล์อัปโหลด
├─ src/
│  ├─ includes/              # layout.php, header.php, sidebar.php, footer.php
│  ├─ components/            # badge, page_header, pagination, search_form
│  ├─ helpers/               # business logic ทั้งหมด (repair, pm, spare, notification, ...)
│  ├─ services/              # services (Approval, Notification, RCA, ...)
│  ├─ config/                # db.php, settings_defaults.php
│  ├─ css/                   # input.css (Tailwind v3)
│  └─ menu_catalog.php       # รายการเมนูเดียว (source of truth)
├─ database/                 # SQL schema/migrations
├─ scripts/                  # cron/automation (alert_check, weekly_report, watchdog)
├─ docs/, backups/, logs/, uploads/
├─ AGENTS.md, DESIGN.md, PRODUCT.md, TASKS.md, CHANGELOG.md
└─ .env, .env.example, tailwind.config.js
```

## 3. เมนูทั้งหมด

### 3.1 ไฟล์ sidebar / navbar

- **PHP legacy sidebar:** `src/includes/sidebar.php` (ใช้กับหน้า PHP เดิม)
- **Next.js sidebar/nav:** `frontend/components/dashboard/sidebar-nav.tsx`
- **Menu catalog (source of truth):** `src/menu_catalog.php` (คีย์ = route Next.js)
- **สิทธิ์เมนู:** ตาราง `menu_permissions` (role_id × menu_key) + API `menu_permissions.php`
- **Bottom nav (mobile):** `src/bottom_nav.php`, `src/bottom_nav_catalog.php`

### 3.2 เมนูตามที่แสดงจริง (จาก `src/menu_catalog.php`, จัดกลุ่ม section)

<|channel|> Section | รายการหลัก (label → href) |
|---|---|
| งานซ่อมบำรุง | แดชบอร์ดภาพรวม `/dashboard`; ใบสั่งงานซ่อมทั้งหมด `/repair`; โหมดภาคสนาม `/field`; ภาระงานช่าง `/repair/workload`; ฟอร์มแจ้งซ่อมด่วน `/repair/request`; มอบหมายงาน `/repair/assign`; งานซ่อมของฉัน `/repair/my_tasks`; ติดตามงานซ่อม `/repair/tracking`; Kanban `/repair/kanban`; ประวัติงานซ่อม `/repair/history` |
| PM & เครื่องจักร | ตารางแผน PM `/pm_am`; ปฏิทิน PM/AM `/pm_am/calendar`; สร้างแผน PM `/pm_am/create`; สร้างแผนแบบกลุ่ม `/pm_am/batch_schedule`; ทำเช็คชีท PM `/pm_am/checksheet`; ทะเบียนเครื่องจักร `/asset_registry`; QR Sheet `/qr-sheet`; สแกน QR `/scan`; BOM Tree `/asset_registry/bom_tree`; ลำดับความสำคัญ `/asset_registry/criticality`; ยืม-คืนอุปกรณ์ `/equipment_borrowing`; สอบเทียบ (หลายหน้า `/calibration/*`); ตรวจเช็ครอบ `/inspections`, `/inspections/templates`, `/inspections/run` |
| ความน่าเชื่อถือ & วงจรชีวิต | `/asset-reliability` และหน้าย่อย critical/lifecycle/aging/replacement/overhaul/data-quality/reports/config |
| คลังอะไหล่ | คลังสต็อก `/spare_parts`; ภาพรวมสต็อก `/spare_parts/overview`; ผู้ผลิต & คะแนนผู้ขาย `/suppliers`; ยอดคงเหลือ `/spare_parts/balances`; สต็อกคืนซาก `/spare_parts/returns`; นับสต็อกจริง `/spare_parts/stock_take`; ศูนย์เบิก-จ่าย `/spare_parts/issue_center`; Sage shipments/PO/sync/optimization/reorder ฯลฯ |
| วิเคราะห์ & รายงาน | Data Warehouse `/analytics`; KPI `/analytics/kpi`; Andon TV `/andon-board`; รายงาน PDF `/reports/monthly_pdf`; ศูนย์รวมรายงาน `/reports`; นำเข้า/ส่งออก Excel; IoT Monitor/Condition; ใบอนุญาตทำงานเสี่ยง `/safety/work_permit` |
| ค่าใช้จ่าย & งบประมาณ | ศูนย์วิเคราะห์ต้นทุน `/cost`; จัดการงบประมาณ `/budget` |
| วิเคราะห์ความเสียหาย & Root Cause | `/rca`, `/rca/events`, `/rca/taxonomy` |
| วิศวกรรมความเสียหาย | `/reliability` และหน้าย่อย assets/failure-modes/trend/weibull/bad-actors/pm-effectiveness/growth/studies/data-quality/config; MTBF/MTTR `/mtbf_mttr` |
| ควบคุมงาน & วางแผน | คิวงานหัวหน้างาน `/supervisor`, `/supervisor/queue`, `/review`, `/plan`, `/verify`; Workforce (ข้อมูลช่าง, ทักษะ, ใบรับรอง, อบรม, ความจุ, กะ, ทีม, มอบหมาย); Process flows `/process-flows` |
| การวางแผนซ่อมบำรุง | ศูนย์วางแผน `/planning`; ตารางวางแผน `/planning/calendar`; แผนงานของฉัน `/field/plan`; ศูนย์หยุดเครื่อง `/shutdown` |
| การอนุมัติ & เอกสาร | ศูนย์อนุมัติ `/approval`; ศูนย์แบบฟอร์ม `/forms`; ออกแบบแบบฟอร์ม `/forms/designer`; คู่มือ `/manuals` |
| ระบบ & ตั้งค่า | ศูนย์แจ้งเตือน `/notifications`; ประวัติ LINE `/notifications/history`; ความคิดเห็น `/feedback`; บทบาท & สิทธิ์ `/roles`; สุขภาพระบบ `/settings/health`; รูปแบบการแจ้งเตือน `/settings/notifications`; ลงทะเบียน LINE `/register`; ผู้ใช้งาน `/users`; Audit log `/audit-log`; ตั้งค่าทั้งหมด `/settings`; โปรไฟล์ `/profile`; Visual Builder `/editor/builder`; หน้าเว็บที่สร้างเอง `/pages` |
| ผู้รับเหมา & งานภายนอก | `/contractors`, `/contractors/work` |
| ECR & เอกสารควบคุม | Engineering Change `/engineering-changes`; Document Control `/documents` |
| ศูนย์ความรู้ | `/knowledge`, search/articles/create/gaps/reviews/taxonomy/usage |
| ความปลอดภัย & งานเสี่ยง | ใบอนุญาตทำงานเสี่ยง `/safety/work_permit` |

### 3.3 เมนูที่แสดงตาม role

- Role ถูกเก็บใน `roles` + `users.role_id/role`
- สิทธิ์เมนูต่อ role เก็บใน `menu_permissions (role_id, menu_key, is_granted)`
- สิทธิ์ระดับ module/action เก็บใน `user_permissions (role_id/user_id, module, permission, is_granted)`
- UI กรองเมนูด้วย `useMenuPermission` / `route-perms`
- หน้า `roles`, `users`, `settings`, `audit-log` โดยทั่วไปสำหรับ Admin (และบางส่วน Manager/Asst.Manager ตาม permission table)

## 4. ตารางสรุปหน้า (Page) — ตามโมดูล

<|channel|> โมดูล/โฟลเดอร์ | จำนวน page.tsx | หน้าที่หลัก | Role ที่เข้าถึง (โดยทั่วไป) |
|---|---:|---|---|
| `(dashboard)/dashboard` | 1 | แดชบอร์ดภาพรวม | ทุก role ที่ล็อกอิน |
| `(dashboard)/repair` | 14 | ใบงานซ่อม, มอบหมาย, ติดตาม, Kanban, ประวัติ | ทุก role; แก้ไขตาม permission |
| `(dashboard)/field`, `supervisor`, `planning`, `workforce` | 18 | ภาคสนาม, คิวหัวหน้างาน, วางแผน, กำลังคน | ช่าง/หัวหน้า/ผู้จัดการ |
| `(dashboard)/pm_am`, `asset_registry`, `equipment_borrowing`, `calibration`, `inspections` | 30+ | PM, เครื่องจักร, สอบเทียบ, ตรวจเช็ค | ช่าง/ผู้จัดการ/Admin |
| `(dashboard)/asset-reliability`, `reliability` | 16 | ความน่าเชื่อถือ, MTBF/MTTR, Weibull | วิศวกร/ผู้จัดการ |
| `(dashboard)/spare_parts`, `suppliers` | 14 | สต็อก, เบิก-จ่าย, Sage, reorder | คลัง/ผู้จัดการ |
| `(dashboard)/analytics`, `reports`, `iot`, `andon-board` | 12 | BI, รายงาน, IoT, Andon | ทุก role อ่าน; ผู้จัดการ/Admin |
| `(dashboard)/cost`, `budget` | 2 | ต้นทุน, งบประมาณ | ผู้จัดการ/Admin |
| `(dashboard)/rca`, `reliability` (RCA) | 4 | วิเคราะห์ความเสียหาย | วิศวกร/ผู้จัดการ |
| `(dashboard)/safety`, `contractors`, `engineering-changes`, `documents` | 8 | ความปลอดภัย, ผู้รับเหมา, ECR, เอกสาร | ผู้จัดการ/Admin |
| `(dashboard)/notifications`, `settings`, `roles`, `users`, `audit-log`, `profile` | 12 | แจ้งเตือน, ตั้งค่า, RBAC, ผู้ใช้, audit | Admin (บางส่วน user) |
| `(dashboard)/knowledge`, `manuals`, `forms`, `pages`, `editor` | 12 | ความรู้, คู่มือ, ฟอร์ม, CMS | ทุก role อ่าน; Admin/Editor สร้าง |
| `(dashboard)/shutdown`, `process-flows` | 3 | Turnaround, ผังกระบวนการ | ผู้จัดการ |
| `(dashboard)/feedback`, `support` | 2 | ความคิดเห็น | ทุก role |
| top-level (`login`, `register`, `repair`, `scan`, `tv`, `qr-sheet`, `my-repairs`) | 7 | auth, ฟอร์มสาธารณะ, TV/QR | สาธารณะ/ผู้ใช้ |
| **รวม** | **252 page.tsx** | | |

> หมายเหตุ: หน้า PHP ใน `public/pages/*` เป็น stub 302 ไปหน้า Next.js ที่เทียบเท่า (ผ่าน `src/includes/gone_next.php`) — ไม่เพิ่มฟีเจอร์ใหม่ใน PHP pages

## 5. Role ผู้ใช้ทั้งหมด และหน้าที่

| Role ID | ชื่อ | คำอธิบาย |
|---:|---|---|
| 1 | Admin | ผู้ดูแลระบบ มีสิทธิ์ทั้งหมด |
| 2 | Manager | ผู้จัดการฝ่ายซ่อมบำรุง |
| 3 | Operate | ช่างซ่อมบำรุง |
| 5 | Viewer | ผู้ดูรายงาน |
| 6 | Asst.Manager | ผู้ช่วยผู้จัดการ |
| 7 | Foreman | หัวหน้างาน |
| 8 | Officer | (ไม่มีคำอธิบาย) |
| 9 | User | ผู้ใช้งานแจ้งซ่อมและติดตามแจ้งซ่อม |
| 10 | Officer-Read | Officer อ่านอย่างเดียว (ดูได้แต่ไม่แก้ไข) |

- **Admin:** จัดการผู้ใช้, role, เมนู, ตั้งค่าทั้งหมด, audit log
- **Manager/Asst.Manager:** อนุมัติ, วางแผน, ดูรายงาน/ต้นทุน, จัดการงาน
- **Foreman:** คิวงาน, มอบหมาย, ตรวจรับงาน
- **Operate:** รับงาน, ทำ PM/เช็คชีท, เบิกอะไหล่, ปิดงาน
- **Officer/Officer-Read:** ดูข้อมูล (Officer-Read แก้ไขไม่ได้)
- **Viewer:** ดูรายงาน/แดชบอร์ด
- **User:** แจ้งซ่อมและติดตามงานของตัวเอง

## 6. ตารางฐานข้อมูลหลัก และความสัมพันธ์

ตารางหลัก (ตัวอย่างคอลัมน์สำคัญ):

| ตาราง | คอลัมน์สำคัญ |
|---|---|
| `users` | id, username, email, password, full_name, role_id, role, department_id, line_user_id, is_active |
| `roles` | id, name, description |
| `user_permissions` | id, role_id, user_id, module, permission, is_granted |
| `menu_permissions` | id, role_id, menu_key, is_granted |
| `settings` | id, setting_key, setting_value, setting_group, description |
| `repair` | id, work_order_no, asset_id, assigned_to, created_by, priority, status, title, downtime_*, cost_*, completed_at, created_at |
| `pm_am` | id, asset_id, assigned_to, title, frequency_type, priority, due_date, status, checklist, completed_at |
| `asset_registry` | (ทะเบียนเครื่องจักร) id, code, name, ... |
| `spare_parts` | id, code, name, stock_qty, reserved_qty, min_stock, max_stock, unit_price, warehouse_id, abc_class |
| `notifications` | id, user_id, type, module, event, title, message, priority, ref_type, ref_id, url, read_at |
| `notification_events` | id, event_key, event_type, module, ref_type, ref_id, source_user_id, priority |
| `notification_templates` | id, module, event, title_template, message_template, priority, url_template, enabled |
| `email_notifications` | (เทมเพลตอีเมล) module, event, subject, body, enabled |
| `audit_logs` / `audit_trail` | บันทึกการตรวจสอบ |
| `departments`, `locations`, `work_zones` | โครงสร้างองค์กร/พื้นที่ |
| `suppliers`, `contractors` | ผู้ขาย/ผู้รับเหมา |

ความสัมพันธ์โดยสรุป:
- `users.role_id → roles.id`
- `repair.asset_id → asset_registry.id`, `repair.assigned_to/created_by → users.id`
- `pm_am.asset_id → asset_registry.id`, `pm_am.assigned_to → users.id`
- `spare_parts.warehouse_id → spare_warehouses.id`, `supplier_id → suppliers.id`
- `notifications.user_id → users.id`
- `menu_permissions.role_id → roles.id`
- `user_permissions.role_id/user_id → roles/users`

> ฐานข้อมูลมีทั้งหมด **257 ตาราง** (รวม views `v_*`) — รายการด้านบนเป็นตารางหลักที่ใช้บ่อย

## 7. Layout / Component ที่ใช้ซ้ำ

### PHP (legacy)
- Layout: `src/includes/layout.php`, `header.php`, `sidebar.php`, `footer.php`, `bottom_nav.php`
- Components: `src/components/badge.php`, `page_header.php`, `pagination.php`, `search_form.php`

### Next.js (canonical)
- Layout: `frontend/app/layout.tsx`, `frontend/app/(dashboard)/layout.tsx`
- UI primitives (shadcn-style): `frontend/components/ui/*` (button, input, table, dialog, tabs, select, switch, badge, card, form-field, empty-state, pagination, os-table ฯลฯ)
- Layout primitives: `frontend/components/layout/primitives.tsx`, `frontend/components/layout/index.ts`
- Shell: `PageShell.tsx`, `dashboard/sidebar-nav.tsx`, `dashboard/module-guide.tsx`
- Domain components: `RepairRequestForm.tsx`, `EmailNotifySettings.tsx`, `StatusStepper.tsx`, `NotificationBell.tsx`, `CommandPalette.tsx`

## 8. CSS class ที่ custom เอง

- **Astryx design tokens/classes:** `.astryx-badge`, `.astryx-banner`, `.astryx-button`, `.astryx-card`, `.astryx-heading`, `.astryx-section`, `.astryx-statusdot`, `.astryx-switch`, `.astryx-text`, `.astryx-progressbar`, `.astryx-layout-header/footer`, `.astryx-navicon`
- **Legacy action links:** `.action-link`, `.action-link-view`, `.action-link-edit`, `.action-link-delete`
- **Legacy badges:** `.badge`, `.badge-active`, `.badge-inactive`, `.badge-success`, `.badge-warning`, `.badge-error`, `.badge-info`, `.badge-secondary`, `.badge-outline`
- **Alerts:** `.alert`, `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-error`
- **CSS หลัก:** `src/css/input.css` (Tailwind v3 + Astryx import + dark/light overrides), output `public/css/app.css`
- **FE Tailwind:** `frontend` ใช้ Tailwind v4 ผ่าน PostCSS; config ใน `frontend` (ไม่มี tailwind.config แยก — ใช้ CSS-based config)

## 9. ปัญหา UX ที่เห็นจากโค้ด

1. **เมนูซ้ำซ้อน/href ซ้ำ:**
   - `knowledge/categories` และ `knowledge/tags` และ `knowledge/config` ชี้ไป `/knowledge/taxonomy` ทั้งหมด
   - `asset_reliability` และ `asset_reliability/dashboard` ชี้ไป `/asset-reliability` ทั้งคู่
   - `contractor` และ `contractor/overview` ชี้ไป `/contractors` ทั้งคู่
   - `engineering_change/overview` และ `document_control/overview` อาจสับสนกับหน้าหลัก
2. **หน้าที่ฟังก์ชันคล้ายกัน:** `/repair` vs `/repair/tracking` vs `/repair/history`; `/spare_parts` vs `/spare_parts/overview` vs `/spare_parts/balances`; `/settings` vs `/settings/notifications` vs `/settings/health`
3. **หน้าที่อาจไม่มีเมนูเชื่อมถึง (ไม่อยู่ใน menu_catalog หรืออยู่ลึก):** หลายหน้าภายใต้ `asset-reliability/*`, `calibration/*`, `reliability/*`, `workforce/*` อาจเข้าถึงได้เฉพาะผ่านลิงก์ภายในหน้า ไม่ใช่เมนูหลัก
4. **Legacy vs Canonical:** หน้า PHP ใน `public/pages/*` เป็น stub 302 ไป Next.js — ผู้ใช้เก่าอาจ bookmark URL PHP; ต้องแน่ใจว่า `NEXTJS_PORT` ถูกต้อง
5. **Role naming ไม่สม่ำเสมอ:** `users.role` (string) และ `users.role_id` (FK) ใช้ควบคู่กัน; บาง role มีชื่อซ้ำความหมาย (Officer vs Officer-Read)
6. **เมนู PHP sidebar (`src/includes/sidebar.php`) และ Next sidebar (`sidebar-nav.tsx`) เป็นคนละชุด** — ต้องดูแลให้ตรงกัน
7. **Mobile bottom nav (`bottom_nav_catalog.php`) อาจไม่ครอบคลุมทุกเมนู** เท่ากับ desktop sidebar
8. **หน้า settings หลายหน้า:** `/settings`, `/settings/health`, `/settings/notifications` แยกกัน แต่ผู้ใช้อาจคาดว่ารวมในหน้าเดียว

---
*สร้างจากโครงสร้าง repo ปัจจุบัน (ไม่แก้โค้ดใด ๆ)*