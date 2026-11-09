# PHASE 29 CURRENT STATE — INSPECT FIRST เอกสาร

> อัปเดตล่าสุด: 2026-09-22
> วัตถุประสงค์: บันทึก CONDITION ก่อนพัฒนา (as-is) ของระบบ CMMS-TPT ที่เกี่ยวข้องกับ
> **Calibration & Measurement Management (Phase 29)** เพื่อให้ทุกการตัดสินใจ
> REUSE/EXTEND ยึดจากข้อเท็จจริงที่ตรวจสอบแล้ว ไม่ใช่การคาดเดา

## 1. Tech Stack (ตรวจแล้ว)

| ส่วน | สิ่งที่ใช้ |
|---|---|
| Backend | PHP 8.3.26 PDO/MySQL, REST JSON API at `public/api/v1/*.php` |
| Frontend | Next.js App Router `frontend/app/**`, Tailwind, Astryx Design System (`--cmms-*`) |
| DB | MySQL `cmms_tpt` (localhost, password จาก `.env` / env, ดูข้อกำหนด AGENTS.md — ไม่ใส่ในเอกสาร) |
| Auth | `src/auth.php` (`requireLogin`, session cookie, timeout) |
| CSRF | `src/csrf.php` — `enforceCsrf()` ทุก POST/PUT/DELETE |
| RBAC | `src/helpers/permissions.php` — module/action matrix + `requirePerm($pdo,module,action)` |
| Notification | `NotificationCenterService.php` (notification_templates) + `src/helpers/notification.php` (`sendLineTemplatePush`) |
| PWA offline | `src/helpers/idempotency.php` (`clientActionKeyFromRequest/Begin/Finish`) + `frontend/lib/offline*` |
| QR | `src/helpers/scan.php` + `public/api/v1/scan.php` + `asset_registry.qr_token` (Phase 24) |
| Upload | `public/api/v1/upload.php` — folder allowlist มี `calibration` แล้ว |
| Report center | `src/helpers/reports.php` (rpt_* builders) + `public/api/v1/reports.php` |
| Cost | `src/helpers/cost.php` (Phase 26) + `v_maintenance_cost` |
| RCA | `src/helpers/failure.php` (Phase 27) — failure_events / rca / rca_actions |

## 2. การเรียก API (มาตรฐานที่ต้องทำตาม — ของเดิมมีช่องโหว่)

```
public/api/v1/<module>.php:
  require db.php + auth.php, header json, session_start(), require csrf.php
  enforceCsrf() สำหรับ POST/PUT/DELETE
  GET → requireLogin($pdo) + requirePerm($pdo,module,'view')
  POST/PUT/DELETE → requirePerm($pdo,module,'edit'|'create'|...) + audit_log()
  Error: { error, code } ผ่าน api_fail() / api_safe_catch()
```

⚠️ **ของเดิมมีช่องโหว่** (`public/api/v1/calibration.php`, `calibration_tracking.php`):
- header comment บอกต้องมี CSRF แต่ **ไม่ได้ require `src/csrf.php` / ไม่เรียก `enforceCsrf()`**
- **ไม่ได้เรียก `requirePerm()`** — มีแค่ `requireLogin()`
→ Phase 29 ต้องแก้ให้ผ่าน (ในไฟล์เดิม) พร้อมไม่ทำให้หน้าเดิมพัง

## 3. ตาราง Calibration ที่มีอยู่แล้ว (สำรวจจาก DB จริง 2026-09-22)

### 3.1 `calibration` (ตาราง run/schedule หลัก — schema.sql:174-193 + ALTER)
- `id`, `asset_id` (FK→asset_registry), `performed_by`, `calibration_type ENUM('full','abbreviated')`
- `calibration_date` (NOT NULL), `next_calibration_date`, `standard_used`
- `result ENUM('pass','fail','conditional')`, `status ENUM('scheduled','in_progress','completed','overdue','cancelled')`
- `measurement_values JSON` (ใน whitelist แต่ API ใหม่ไม่เคยเขียน), `certificate_number`, `certificate_file`
- `total_cost`, `po_number`, `supplier_id` (FK→suppliers), `po_file`, `po_cc`, `po_email_sent_at`, `provider_confirm_date`, `notes`
- index: `idx_calibration_next_date`, `idx_calibration_status`
- ⚠️ หน้า create ส่ง `status:"pending"` แต่ **ENUM ไม่มี 'pending'** (bug เดิม)

### 3.2 `calibration_history` (append-only รอบที่ทำเสร็จ — migration_20260723:227-254)
- FK→asset_registry (CASCADE), users (performed_by/created_by SET NULL)
- `type`, `result`, `certificate_number`, `certificate_file`, `correction_value`, `uncertainty_value`, `conformance_decision`, `cost`, `notes`, `created_by`
- เขียนเมื่อ action `complete` ของ `calibration_tracking.php`

### 3.3 `calibration_points` (measurement points รายรอบ — child ของ `calibration_history`)
- FK `fk_cp_calibration` → **`calibration_history(id)`** (ไม่ใช่ `calibration.id`)
- `point_label`, `nominal_value`, `measured_value`, `correction`, `uncertainty`, `mpe_value`,
  `conformance ENUM('pass','fail','conditional')`
- ⚠️ ปัจจุบัน **ไม่มี flow ใหม่เขียน** มัน — มีแค่ legacy PHP `public/pages/calibration/points.php`
- ข้อจำกัด FK → ไม่ชี้ที่ run ที่กำลังทำได้ → Phase 29 ต้องแยกตาราง measurement ของ run

### 3.4 ตารางที่ docs อ้างแต่ **ไม่มีจริง**
- `calibration_tracking` — มีใน `docs/DATABASE_SCHEMA.md:30` / `CMMS_DOMAIN.md:44` แต่ **ไม่มี CREATE TABLE**
  (tracking API คำนวณ stage จาก `calibration` แทน)

### 3.5 ไม่มีตาราง/เทเบิลต่อไปนี้ (ต้องสร้างใหม่ additive)
- ไม่มี `instrument*` / `measuring_tool*` master table
- ไม่มี `calibration_plans`, `calibration_standards`, `calibration_procedures`,
  `calibration_certificates` (versioned), `calibration_measurements`, `calibration_oot_events`
- ไม่มี `machines` table (asset master จริง = **`asset_registry`**)

### 3.6 measurement ที่มีอยู่ (reuse ได้ — คนละ scope)
- `inspection_measurements` — ผูก schedule/item ของ inspection (Phase 13)
- `asset_measurements` — ค่าวัดสภาพ asset (Phase 28, `asset_reliability.php:837-874`)
- `calibration_points` — child ของ calibration_history

## 4. Asset Master / Instrument (reuse — ห้ามสร้างซ้ำ)

- **Asset master จริง = `asset_registry`** (schema.sql:68-86 + ขยาย Phase 28)
  - มี `manufacturer`, `model`, `serial_number` (UNIQUE), `category`, `location`, `department`,
    `department_id`, `location_id`, `responsible_user_id`, `qr_token`, `barcode`, `qr_code_path`,
    `criticality ENUM('A','B','C','D')` (Phase 28), `lifecycle_status`, `parent_asset_id` (Phase 28)
  - seed instruments: `seed.sql:42-43` — `INS-001` (CMM), `INS-002` (scale), `category='Instrument'`
- **Hierarchy**: reuse `asset_registry.parent_asset_id` + `asset_relationships` (Phase 28) —
  Factory→Dept→Area→Machine→Instrument ทำด้วย asset tree เดิม
- **Criticality**: reuse Phase 28 (`asset_registry.criticality` A-D + `asset_criticality`) — ห้ามสร้าง engine ซ้ำ
- API: `asset_registry.php` (GET/POST/PUT/DELETE), `asset_relationships.php`

## 5. ระบบเดิมที่มีอยู่แล้ว (reuse ทั้งหมด — ห้าม duplicate)

### 5.1 Calibration เดิม (ต้อง EXTEND ไม่ใช่ทับ)
- API: `calibration.php` (CRUD), `calibration_tracking.php` (workflow stage: ready/po/emailed/sent_out/done/overdue + actions save_po/send_email/confirm_date/complete)
- Frontend: `/calibration` (list+KPI), `/calibration/create`, `/calibration/edit`,
  `/calibration/calendar` (month grid), `/calibration/po` (PO pipeline), `/calibration/tracking`
- Components: `frontend/components/calibration/{StageBadge,FileAttachment}.tsx`
- Legacy PHP: `public/pages/calibration/*.php` (index/create/edit/delete/history/points/po/calendar/mark_complete)
- Setting: `settings.calibration_config` → `calibration_alert_days=30`, `auto_assign_calibration=0`
- Permission matrix `calibration`: view/create/edit/delete (role 1/2/6/7; role5=view; role3/4=none)

### 5.2 Engine ที่ reuse ได้
- **WO**: `repair` table + `src/helpers/work_order.php` `generateWorkOrderNo()` —
  สร้าง WO จาก calibration due (source_type/repair fields เดิม)
- **PM**: `pm_am` + `pm_am_plans` + `pm_am.php` — สร้าง PM schedule จาก calibration plan (reuse)
- **Checklist/Inspection**: `checklist_templates`, `checklist_template_items`, `inspection_templates/items/schedules/results` (Phase 13) —
  calibration procedure เรียก checklist engine เดิม (ห้ามสร้างใหม่)
- **RCA/Investigation**: `failure_events`, `rca`, `rca_why`, `rca_evidence`, `rca_actions` (Phase 27) +
  `src/helpers/failure.php` — calibration fail → OOT → RCA (reuse ไม่สร้าง engine ใหม่)
- **Cost**: `src/helpers/cost.php` + `v_maintenance_cost` (Phase 26) — calibration cost by instrument/department
- **Report center**: `src/helpers/reports.php` `rpt_build_*` + `reports.php?resource=`
- **Notification**: `notification_templates` module `calibration` event `due` มีแล้ว
  (`NotificationCenterService.php:174`); `sendLineTemplatePush($lineUserId,tplKey,vars,url,photos)`
  (`notification.php:590`); engine `scripts/notification_engine.php:331-360` scan due
- **Audit**: `audit_log($pdo,action,resourceType,resourceId,description,old,new,severity)`
  (`src/helpers/audit.php:32`)
- **Idempotency (offline sync)**: `clientActionKeyFromRequest/Begin/Finish`
  (`src/helpers/idempotency.php`) — กัน duplicate calibration transaction
- **Upload**: `upload.php` folder allowlist มี `calibration` (MIME map มี pdf/image/doc/xlsx, cap 6MB, CSRF แล้ว)
- **QR/Scan**: `scan.php` + `asset_registry.qr_token` (Phase 24) — scan → asset → calibration profile
- **Status/Design system**: `Badge` variants = neutral/primary/success/warning/danger/info;
  `Button` = primary/secondary/outline/ghost/danger; Radix `Select`; `Dialog` simple API;
  `SimpleDataTable` (columns/data/idKey/pageSize/caption/emptyTitle/emptyDescription/onRowClick);
  `useApiQuery(key,url,opts)`, `apiJson<T>` (`frontend/lib/api.ts`)

### 5.3 หน้า dashboard/report ที่มี calibration อยู่แล้ว
- `analytics_advanced.php` section 8 CALIBRATION (overdue count, due 30/60 วัน, ค่าใช้จ่าย/ปี, recent, top overdue)
- `dynamicPages.ts` widget `calibration-board`; `GrapesBuilder.tsx` block calibration board
- asset view timeline มี kind `calibration` (`asset_registry/view/page.tsx`)

## 6. ข้อจำกัด/กฎ (จาก spec + AGENTS.md) — บังคับใช้เสมอ

1. **ห้าม duplicate** — ถ้า table/API/helper มีอยู่แล้ว → REUSE หรือ EXTEND
2. **ห้ามข้อมูลปลอม/เดา** — calibration result / compliance / drift ต้องมาจากข้อมูลจริง;
   ถ้าข้อมูลไม่พอ → `INSUFFICIENT_DATA` / `N/A` (ห้ามแสดง 100%)
3. **ห้ามระบบเลือก Action แทนผู้รับผิดชอบ** (fail action) และ **ห้าม auto เปลี่ยน Calibration Interval** (ต้องมี Approval)
4. **ห้าม auto-RCA conclusion** / ห้ามสรุปว่าสินค้าเสียเอง (Impact Assessment = ผู้รับผิดชอบกรอก)
5. **ห้ามใช้ Reference Instrument ที่หมด calibration** โดยไม่มี warning/block ตาม policy
6. **Historical data immutable** — ห้ามแก้ผลที่ Approved แล้วตรงๆ / ห้ามลบ calibration history;
   เปลี่ยน Certificate ต้องมี Version / เปลี่ยน Interval ต้องมี audit
7. **Business logic อยู่ Backend (PHP)** — frontend ไม่คำนวณ error/tolerance/pass-fail/next_due/compliance
8. ทุก transaction สำคัญ → `audit_log()`; RBAC ฝั่ง backend (`requirePerm`)
9. Offline: `Approved` / `Final Result` / `Certificate` ต้อง Server Confirm —
   ห้ามแสดง calibration สำเร็จจนกว่า server ยืนยัน; ทุก transaction มี client_action_id (idempotency)
10. ห้าม commit secrets; ใช้ env/settings; migration additive + idempotent
11. Environment conditions: ห้ามสร้าง sensor ปลอม — manual = `Manual Measurement`;
    IoT ใช้ข้อมูล integration ที่มีเท่านั้น
12. Design system เดิม; สี GREEN/AMBER/RED มาตรฐาน (ไม่ hardcode hex ใหม่)

## 7. Gap Analysis (สิ่งที่ Phase 29 ต้องเพิ่ม ไม่ซ้ำของเดิม)

| # | ต้องเพิ่ม | เหตุผล / reuse อะไร |
|---|---|---|
| 1 | Instrument extension (measurement specs, status, condition) | asset_registry เป็น master → สร้าง extension table 1:1 (ไม่ duplicate) |
| 2 | `calibration_plans` + next_due calculation | ของเดิมไม่มี plan master; คำนวณ next_due = last + interval (backend) |
| 3 | Schedule views (Today/Week/Month/Next30/Overdue + filters) | `/calibration/calendar` มีแค่ month grid → สร้างหน้า schedule ใหม่ |
| 4 | Workflow state machine (Scheduled→Started→Measurement→Result→Review→Approved→Next) | status enum เดิมแค่ 5 ค่า → EXTEND enum (additive) |
| 5 | Multi measurement points ของ run + error/tolerance/result | `calibration_points` FK→history ใช้กับ run ไม่ได้ → ตาราง `calibration_measurements` ใหม่ (child ของ run) |
| 6 | Calibration standards (reference/master) + traceability + expiry check | ยังไม่มี → `calibration_standards` ใหม่ |
| 7 | Procedures (versioned) + checklist link | ยังไม่มี → `calibration_procedures` ใหม่ + link checklist engine เดิม |
| 8 | Certificates version control (upload/replace/archive/hash) | ของเดิมแค่ `certificate_file` path → `calibration_certificates` ใหม่ + reuse upload.php |
| 9 | OOT events + Impact Assessment + link RCA/WO/Measurement | ยังไม่มี → `calibration_oot_events` ใหม่ + reuse failure.php/repair |
| 10 | Status engine GREEN/AMBER/RED + instrument status | คำนวณ backend จาก next_due + alert_days |
| 11 | Dashboard KPI + compliance % (denominator=0→N/A) | engine คำนวณจาก calibration/history จริง |
| 12 | Measurement history / drift (observed only, no predictive) | จาก calibration_measurements/history จริง |
| 13 | Data quality checks | `ana_data_quality` pattern → calibration-specific checks |
| 14 | Report builders (10 types) + filter + export | add `rpt_build_calibration_*` ใน reports.php |
| 15 | Notification events ใหม่ (due/failed/oot/standard expired/review pending) | เพิ่ม notification_templates module `calibration` events |
| 16 | Mobile/PWA calibration flow + offline draft + idempotency | reuse scan/offline-store/idempotency |
| 17 | Menu/RBAC keys + settings | เพิ่ม menu_permissions + settings defaults |

## 8. การตรวจสอบหลังเขียน (Acceptance)

- รัน `php scripts/apply_phase29_calibration_management.php` (idempotent — รันซ้ำไม่ error)
- `php -l` ทุกไฟล์ PHP ใหม่/แก้ไข
- แก้ CSRF + requirePerm ใน `calibration.php`/`calibration_tracking.php` แล้ว smoke ผ่าน
- เรียก API ผ่าน HTTP (fabricated admin session ใน `C:/opencode_sess`) ครบทุก endpoint
- `npm run typecheck` + `npm run build` ที่ `frontend/`
- กรอก `docs/PHASE_29_TEST_PLAN.md` ตาม §45
