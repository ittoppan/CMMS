# PHASE 30 CURRENT STATE — INSPECT FIRST เอกสาร

> อัปเดตล่าสุด: 2026-09-24
> วัตถุประสงค์: บันทึก CONDITION ก่อนพัฒนา (as-is) ของระบบ CMMS-TPT ที่เกี่ยวข้องกับ
> **Permit-to-Work (PTW) & Maintenance Safety Management (Phase 30)** เพื่อให้ทุกการตัดสินใจ
> REUSE/EXTEND ยึดจากข้อเท็จจริงที่ตรวจสอบแล้ว ไม่ใช่การคาดเดา
> ตรวจจาก: source code (src/ + public/api/v1/ + frontend/) + migration SQL + DB backup
> (`backups/cmms-tpt_db_20260924_023002.sql.gz`)

## 1. Tech Stack (ตรวจแล้ว)

| ส่วน | สิ่งที่ใช้ |
|---|---|
| Backend | PHP 8.3.x PDO/MySQL, REST JSON API at `public/api/v1/*.php` |
| Frontend | Next.js App Router `frontend/app/**`, Tailwind, Astryx Design System (`--cmms-*`) |
| DB | MySQL `cmms_tpt` (password จาก `.env` / env — ไม่ใส่ในเอกสาร) |
| Auth | `src/auth.php` (`requireLogin`, session cookie) |
| CSRF | `src/csrf.php` — `enforceCsrf()` ทุก POST/PUT/DELETE |
| RBAC | `src/helpers/permissions.php` — module/action matrix + `requirePerm($pdo,module,action)` |
| Notification | `src/services/NotificationCenterService.php::notify()` (line 223) + `scripts/notification_engine.php` |
| PWA offline | `src/helpers/idempotency.php` (`clientActionKeyFromRequest/Begin/Finish`) + `frontend/lib/offline*` |
| QR | `src/helpers/scan.php` + `public/api/v1/scan.php` + `asset_registry.qr_token` (Phase 24) |
| Upload | `public/api/v1/upload.php` — folder allowlist (ต้องเพิ่ม `work_permit`) |
| RCA | `src/helpers/failure.php` (Phase 27) — failure_events / rca / rca_actions |
| Calibration | `src/helpers/calibration.php` (Phase 29) — `cal_instrument_status_value()` GREEN/AMBER/RED |
| Asset Reliability | `src/helpers/asset_reliability.php` (Phase 28) — `ar_lifecycle_change()` |

## 2. มี `work_permits` อยู่แล้ว (ตรวจแล้ว) — ฐานของ Phase 30

### 2.1 DDL จริง (จาก DB backup — ไม่มีใน migration ใดๆ ใน repo)
```
id            int NOT NULL AUTO_INCREMENT PK
permit_no     varchar(50)     -- 'WP-YYYYMM-NNN'
repair_id     int NULL        -- FK→repair (ไม่ประกาศ FK)
permit_type   enum('hot_work','confined_space','high_work','electrical','chemical') DEFAULT 'hot_work'
location      varchar(255) NULL
requested_by  int NULL        -- FK→users (ไม่ประกาศ FK)
safety_officer_id int NULL    -- FK→users — column มี แต่ไม่เคยถูกเขียน
loto_electrical tinyint(1) DEFAULT '0'  -- ตัดระบบไฟฟ้า
loto_pneumatic  tinyint(1) DEFAULT '0'  -- ปิดวาล์วลม
loto_hydraulic  tinyint(1) DEFAULT '0'  -- ปล่อยแรงดันไฮดรอลิก
loto_chemical   tinyint(1) DEFAULT '0'  -- ปิดวาล์วสารเคมี
safety_signature longtext
status        varchar(50) DEFAULT 'draft'   -- data จริง: 'approved' / 'active'
valid_from    datetime NULL
valid_until   datetime NULL   -- สร้างเป็น NOW()+8 HOUR เสมอ
created_at    datetime DEFAULT CURRENT_TIMESTAMP
```
- **ไม่มี `updated_at`**, **ไม่มี index บน `valid_until`**, **ไม่มี FK**, **ไม่มี migration/apply script** ที่สร้างตารางนี้ใน repo
  (สร้างใน live DB ด้วยมือ — เอกสารอ้างอิง `docs/DATABASE_SCHEMA.md:13`)

### 2.2 ของเดิม = demo เก่า อย่า reuse ตรงๆ (ตรวจแล้ว)
- `public/api/v1/index.php:23-68` POST `work-permits` — สร้างแล้ว **`status='approved'` ทันที**,
  `permit_no = WP-{YEAR}-{mt_rand}` (ไม่ unique), error shape เก่า `{status,code,message}`,
  **ไม่มี CSRF/requirePerm/audit/notification**, ใช้ PDO โดยตรง
- `public/pages/safety/work_permit.php:22-28` — create → `status='approved'`, `repair_id` default 1, location default 'แผนกผลิตหลัก'
- Frontend `frontend/app/(dashboard)/safety/work_permit/page.tsx` — KPI 3 ใบ + table + dialog create
  (type map: `electrical_loto`/`high_altitude` ↔ permitType เป็นการแมปฝั่ง UI เท่านั้น)

### 2.3 สาย Approval ที่พร้อม reuse (สำคัญ)
- `src/services/ApprovalService.php:11` `createApprovalRequest($requestType,$targetId,$docNo,$title,$requesterName,...)`
- `processApproval($token,$action,$reason)` → `updateTargetEntityStatus()` (line 123):
  **`$type==='loto' || $type==='work_permit'` → UPDATE `work_permits SET status='approved'|'rejected'` (line 128-130)**
- `public/api/v1/approval.php:64` valid types: `repair|requisition|loto|pm|spare_issue`
- `public/approve.php` = หน้า 1-click approve/reject (LINE Flex + HTML email)
- ⚠️ ApprovalService ยังใช้ `NotificationService::sendLineMessage()` (legacy) — Phase 30 หน้าใหม่ใช้ `NotificationCenterService::notify()` แทน

## 3. Module ที่มีอยู่และต้อง REUSE (ห้ามสร้างซ้ำ)

### 3.1 Work (WO)
| สิ่ง | ที่อยู่ | หมายเหตุ |
|---|---|---|
| WO master | table `repair` (schema.sql:115) | filename ไม่มี `work_orders` table |
| WO number | `generateWorkOrderNo()` `src/helpers/work_order.php:10` | `EN-{YYMM}-{NNN}` |
| Assignee | `work_assignees` + `src/helpers/assignees.php` (`setWorkAssignees`) | `status`/`accepted_at` เป็น live-only (ไม่มีใน migration ฐาน) |
| PM | `pm_am` + `pm_am_plans` + `pm_plans.php` | generate → WO; planned parts → spare_issue_requests |
| Breakdown auto-WO | `inspection_fail_actions` (migration_20260805:106-118) | ENUM('create_work_order','notify') |
| Contractor | `repair.outsource_by` (free text) / `pm_am.is_outsource` | **ไม่มี contractor master table**, ไม่มี link→suppliers |
| Technician | `users.role_id`, `technician_skills`, `work_assignees` | 7 roles |
| Action/task | `rca_actions` (migration_20260921:250, status VARCHAR(20), is_mandatory, verification) | **ไม่มี standalone `safety_actions`** |

### 3.2 Asset (Phase 24/28/29 surface)
| สิ่ง | ที่อยู่ |
|---|---|
| Asset master | `asset_registry` (schema.sql:68) + `qr_token` (Phase 24), `criticality A-D` + `lifecycle_status` + `parent_asset_id` (Phase 28) |
| Location | `locations` (migration_20260723:25) — parent_id self-FK, type building/floor/zone/area/sub_location; **ไม่มี CRUD API** |
| Criticality engine | `ar_criticality_assessment()` `src/helpers/asset_reliability.php`; `asset_criticality.php` |
| Lifecycle transition | `ar_lifecycle_transitions()` (:130) + `ar_lifecycle_change()` (:154) + `asset_lifecycle.php` POST change → audit |
| ⚠️ Gap | **ไม่มีอะไร auto เปลี่ยน asset สถานะจาก WO/repair** — `UPDATE asset_registry SET status` ไม่มีใน `src/` → Phase 30 เป็น integration point (Per permit → `under_review`/`isolated` ต้องผ่าน `ar_lifecycle_change` ด้วย transaction + audit) |
| QR/scan | `scan.php` (`scan_parse()` รับ `CMMS-A/W/P/S-*`), `scan_events`, `qr_print_log` |

### 3.3 Safety ที่มีอยู่จริง
| สิ่ง | ที่อยู่ | สถานะ |
|---|---|---|
| Checklist/Inspection engine | `inspection_templates/items/schedules/results` + `inspection_execute.php` (offline autosave draft_json) + `checklist_templates` (category มี `'safety'` อยู่แล้ว) | **REUSE สำหรับ pre-work/post-work checklist** |
| LOTO | แค่ 4 bool columns บน work_permits | ❌ ไม่มี lock/tag registry → สร้างตาราง `permit_loto_points` |
| Incident / Near Miss / Stop Work / Observation | — | ❌ ไม่มีเลย → greenfield (ผูก workflow เอง) |
| Risk Assessment / Risk Matrix | — | ❌ ไม่มี; reuse ของจริงแค่: criticality dimension `safety` (asset_reliability.php:243 scores 0-4, weight setting `ar_criticality_w_safety`) |
| PPE / Training / Certification | — | ❌ ไม่มี-module → greenfield (+ reuse `rca_action_links` allowedType `training_record` เป็น link อย่างเดียว) |
| `repair.safety_related` | migration_20260723:719 tinyint default 0 | ✅ driver ของ RCA trigger + filter + print flag — ใช้เป็นตัวบอก "งานเกี่ยวข้อง safety" |
| `planning.safety_requirement` / `instructions` | migration_20260911:31-32 | ✅ ใช้เป็น input ของ risk/control ได้ |

### 3.4 ระบบ (System)
| สิ่ง | ที่อยู่ | หมายเหตุ |
|---|---|---|
| RBAC | `PERMISSION_MATRIX` `src/helpers/permissions.php:36`; modules: repair,request,asset,pm_am,inspection,spare_parts,supplier,calibration,report,dashboard,users,roles,audit_log,settings,notification,sage,failure | **ไม่มี module `safety`** → ต้องเพิ่ม + alias (`permModuleAliases()` line 178 เช่น `'work_order'→'repair'`); legacy `roles.php` มี `safety.view/create/approve/iot/predictive` อยู่ (lines 80-89) |
| Menu permission | `menu_permissions` + `menu_catalog.php:75` `safety/work_permit` (label 'ใบอนุญาต LOTO', under section 'วิเคราะห์ & รายงาน') | reuse; i18n `menu.loto` + tPage `/safety/work_permit` (i18n.ts:692) มีแล้ว |
| Feature flag | `feature_work_permits` `public/pages/settings/module_switches.php:28` | reuse |
| CSRF | `enforceCsrf()` — ทุก non-GET | standard |
| API convention | `api_fail()`/`api_forbidden()`/`api_safe_catch()` (`src/helpers/api.php`) — `{success,error,code}`; idempotency header `X-Client-Action-Id` | standard — ห้ามเลียนแบบ index.php เดิม |
| Audit | `audit_log($pdo,action,resourceType,resourceId,desc,old,new,severity)` (`src/helpers/audit.php:32`) + `audit_logs.php` | standard |
| Notification | `NotificationCenterService::notify($pdo,$spec)` (module,event,type,priority,ref_type,ref_id,title,message,url,users[],roles[],channels[],dedup_hours,event_key) | Phase 30 เพิ่ม module `work_permit`/`safety` + events |
| Upload | `upload.php` folder allowlist = `spares,assets,avatars,repair,pm_am,calibration,rca` (6MB) | **ต้องเพิ่ม `work_permit`** |
| Offline | `SyncEngine` IndexedDB `cmms-sync/queue` + `depsSatisfied()` + 4xx=FINAL | Safety-critical action ต้อง server-confirm |
| UI | `SimpleDataTable`, `Badge` (neutral/primary/success/warning/danger/info), `AndonLamp` (ok/warn/down/idle), `PageShell`/`usePageHero`, Radix Select/Dialog, `ImageUploadField` | **ไม่มี Stepper/Timeline/Approval-chain reusable** → ต้องสร้าง StatusStepper |
| Settings | `src/config/settings_defaults.php` (194 line, หมวด company/repair/pm/spare/notification/phase 26-29) | เพิ่มหมวด `work_permit` + `risk_matrix` + `loto` |
| Config to frontend | `usePageHero(key)` + `public/api/v1/settings.php` | standard |

## 4. การเรียก API (มาตรฐานที่ Phase 30 ต้องทำตาม)

```
public/api/v1/work_permit.php:
  require db.php + auth.php, header json, session_start(), require csrf.php
  enforceCsrf() สำหรับ POST/PUT/DELETE
  GET → requireLogin($pdo) + requirePerm($pdo,module,$action)
  POST/PUT/DELETE → requirePerm + audit_log() + (offline) clientActionKeyFromRequest
  Error: { success:false, error, code } ผ่าน api_fail()/api_safe_catch()
  Safety-critical: validate ฝั่ง backend เสมอ (ดู §7)
```

## 5. Gap Analysis — สิ่งที่ Phase 30 ต้องสร้าง (ไม่ซ้ำของเดิม)

| # | ต้องเพิ่ม | เหตุผล / reuse อะไร |
|---|---|---|
| 1 | **Migration+DDL จริงของ `work_permits`** | ตารางมีแค่ live DB → ต้อง idempotent `CREATE TABLE IF NOT EXISTS` + ALTER (additive) + index valid_until + FK |
| 2 | **Workflow state machine** Draft→Requested→Risk Review→Approved→Active→Suspended→Completed→Closed/Cancelled | ของเดิม auto-approve ไม่มี workflow `approval_requests` type `work_permit` พร้อมแล้ว |
| 3 | `permit_types` (configurable) + requirement engine | Hot/Electrical/WAI/Confined Space/Excavation/Chemical/Lifting/Line Break + custom (Admin config, ไม่ hard-code กม.) |
| 4 | Risk assessment + configurable risk matrix (L×S, scale/level/required approval) | greenfield; reuse criticality dimension `safety` pattern; ห้ามระบบเดา score |
| 5 | Control measures (5 ระดับ) ต่อ hazard | greenfield; owner/verification/status |
| 6 | Approval chain (Requester→Supervisor→Safety→Area Owner) configurable + backend re-check | reuse ApprovalService + requirePerm; ห้าม frontend-only approval |
| 7 | Pre-work / Post-work checklist | **REUSE inspection checklist engine** (`safety` category) |
| 8 | LOTO: isolation points + energy types + zero energy verification + lock/tag | table ใหม่ บน `permit_loto_points`; lock removal flow |
| 9 | Gas test (O2/LEL/H2S/CO/other) + **block expired instrument** | คำนวณ expiry จาก `cal_instrument_status_value()` (calibration RED) — warning/block ตาม policy (settings) |
| 10 | PPE requirement + worker confirmation | greenfield (configurable per permit type) |
| 11 | Worker authorization (skill + certification expiry → NOT AUTHORIZED) | reuse `technician_skills`; certification master ใหม่ |
| 12 | Contractor safety (company/worker/cert) + `Contractor` แฟลกบน permit | ไม่มี contractor master → ตาราง `contractors` + permit.work_source ENUM('internal','contractor') |
| 13 | Suspension/Resume + re-verification + expiration policy + Emergency Stop Work | state machine + `stop_work_reports` + notification |
| 14 | Permit Close checklist + final inspection + accounts | reuse checklist + asset status restoration |
| 15 | Asset status ↔ permit (isolated/under permit) transaction + audit | ผ่าน `ar_lifecycle_change()` + audit; ห้ามเปลี่ยน asset โดยไม่มี transaction |
| 16 | Mobile safety workflow + QR scan (asset/permit/loto/instrument) | reuse scan.php + offline syncEngine; safety-critical ต้อง server confirm |
| 17 | Notification events (requested/approved/rejected/expiring/expired/suspended/stop_work/high_risk) | เพิ่ม notification_templates module `work_permit` |
| 18 | Safety dashboard KPI + analytics + drill-down | reuse kpi/analytics builders; KPI จากข้อมูลจริง (÷0→N/A) |
| 19 | Safety actions (จาก risk/stopwork/inspection) | **REUSE `rca_actions` pattern** — ทำตาราง `safety_actions` (ไม่ซ้ำ engine) |
| 20 | Incident / Near Miss / Unsafe condition → Investigation→RCA | greenfield ฝั่งบันทึก แต่ **RCA ใช้ Phase 27 engine** (`failure.php`/`rca`) |
| 21 | Calibration integration (gas test instrument) | `cal_instrument_status_value()` + settings policy |
| 22 | RBAC module `safety` + alias `work_permit→safety` + menu grouping | เพิ่มใน PERMISSION_MATRIX + menu_catalog |
| 23 | Settings defaults group `work_permit`/`risk_matrix`/`loto` | `settings_defaults.php` + settings API |
| 24 | Reports (10+ types) + filters | add `rpt_build_safety_*` ใน reports.php |
| 25 | Data quality checks (permit no WO, missing risk/approval/control, expired active, missing close, cert expired...) | reuse `ana_data_quality` pattern |
| 26 | Stepper/StatusTimeline component | ไม่มี reusable → สร้าง `frontend/components/StatusStepper.tsx` |

## 6. ข้อจำกัด/กฎ (จาก spec + AGENTS.md + ระบบจริง) — บังคับใช้เสมอ

1. **ห้าม duplicate** — ถ้ามี engine เดิม → REUSE/EXTEND (listless ด้านบน)
2. **ห้าม Safety Approval ปลอม** — ห้ามถือว่า approved จนกว่า **backend** ยืนยัน (ApprovalService/transition → DB)
3. **ห้าม Frontend เป็น source of truth** — business logic อยู่ PHP; frontend แค่แสดง/ส่ง
4. **ห้ามข้าม approval ด้วย URL/API** — backend ตรวจ chain ที่ required ตาม policy ทุก transition
5. **ทุก Safety Critical Action ต้องมี audit** — create/edit/submit/approve/reject/activate/suspend/resume/stop_work/loto/verify/gas/close/risk change/control change
6. **ห้าม hard-code กฎหมาย/ข้อกำหนดเฉพาะ** — ใส่ config (permit_types/requirements/risk_matrix/loto policy) ผ่าน settings/table
7. **ระบบเป็นเครื่องมือควบคุม workflow ไม่ใช่ผู้ตัดสินความปลอดภัยแทนผู้มีอำนาจ** — ไม่ auto-approve, ไม่ auto-close
8. **ห้ามระบบสร้าง Risk Score จากข้อมูลที่ไม่มี** — ต้องกรอก likelihood/severity ก่อน; ห้ามเดา/derive ปลอม
9. **ห้ามถือว่า Zero Energy/Gas Test ผ่านโดยอัตโนมัติ** — ต้องมี verification result + instrument + user + time
10. **ห้ามใช้ expired calibration instrument** โดยไม่มี warning/block ตาม policy (settings `wp_*`)
11. **ห้าม Resume อัตโนมัติหลัง Stop Work** — ต้อง safety review → corrective action → re-assessment → resume/cancel
12. **ห้ามถือว่า worker ออกจาก confined space เพียงเพราะ permit close** — บันทึก entry/exit
13. **Asset status เปลี่ยนต้องมี transaction + audit** ผ่าน `ar_lifecycle_change()`
14. **ห้ามแก้/ลบ audit หรือ safety history**; historical immutable
15. **Offline**: view/checklist/photo/draft ได้ แต่ approve/activate/loto auth/resume/close ต้อง server confirm
16. **ห้าม commit secrets**; migration additive + idempotent; ใช้ env/settings
17. Design system เดิม + AndonLamp สำหรับสถานะ safety; ห้าม hardcode hex ใหม่
18. ไม่ hard-code permission ใน UI — ใช้ `useMenuPermission`/backend requirePerm

## 7. Final Validation (เกณฑ์จบ Phase 30 — ตรวจก่อน commit)

- ไม่มี: duplicate WO/checklist/risk engine/notification, fake approval/LOTO/gas/calibration status, frontend-only safety logic, missing audit, broken RBAC, historical data corruption, automatic safety decision ที่ไม่มี policy รองรับ
- workflow จริงผ่าน: WO → Permit → Risk → Control → Approval → LOTO/Isolation → Verification → Work → Inspection → Close
- unsafe condition path: Active → Stop Work → Investigation → Action → Re-assess → Resume/Cancel
- รัน `php scripts/apply_phase30_ptw_safety.php` (idempotent, รันซ้ำไม่ error); `php -l` ทุกไฟล์; smoke API ทั้ง endpoint; `npm run typecheck` + `npm run build`; design-audit `--strict` PASS