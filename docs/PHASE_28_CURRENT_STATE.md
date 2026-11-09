# PHASE 28 CURRENT STATE — INSPECT FIRST เอกสาร

> อัปเดตล่าสุด: 2026-09-22
> วัตถุประสงค์: บันทึก CONDITION ก่อนพัฒนา (as-is) ของระบบ CMMS-TPT ที่เกี่ยวข้องกับ
> **Asset Reliability & Lifecycle Management (Phase 28)** เพื่อให้ทุกการตัดสินใจ REUSE/EXTEND
> ยึดจากข้อเท็จจริงที่ตรวจสอบแล้ว ไม่ใช่การคาดเดา

## 1. Tech Stack (ตรวจแล้ว)

| ส่วน | สิ่งที่ใช้ |
|---|---|
| Backend | PHP 8.3.26 PDO/MySQL, REST JSON API at `public/api/v1/*.php` |
| Frontend | Next.js App Router `frontend/app/**`, Tailwind, Astryx Design System (`--cmms-*`) |
| DB | MySQL `cmms_tpt` (localhost / root / Mjm@dmin2015) |
| Auth | `src/auth.php` (`requireLogin`, session cookie, timeout), CSRF ที่ `src/csrf.php` (`enforceCsrf`) |
| RBAC | `src/helpers/permissions.php` (`requirePerm($pdo,'asset','view')`) — matrix role-based + `menu_permissions` (role_id/menu_key/is_granted) |
| Mobile | PWA offline, Scan (Phase 24) → `mobile`/`scan` pages, LINE notify, QR |
| ERP | Sage 300 ผ่าน ODBC (`SAGE300_ODBC_DSN=TFPT1C`) → `spare_parts` / `machines` sync |

## 2. การเรียก API (มาตรฐานที่ต้องเลียนแบบ)

```
public/api/v1/<module>.php:
  require db.php + auth.php, header json, session_start(), require csrf.php
  enforceCsrf() สำหรับ POST/PUT/DELETE ผ่านการ check (token หรือ Origin/Referer เดียวกัน)
  GET ผ่าน requireLogin($pdo)
  Error format: { error, code } ผ่าน api_fail() / api_safe_catch() / requirePerm() → 403
```

ตัวอย่าง `asset_registry.php` API: ใช้ switch GET/POST/PUT/DELETE, allowlist columns,
ไม่ใช้ frontend เป็น source of truth (business logic อยู่ PHP)

## 3. ตาราง/ฟีเจอร์ที่มีอยู่แล้ว (สำรวจจาก DB จริง 2026-09-22)

### 3.1 Asset
- `asset_registry` — มีอยู่แล้ว แต่ phase 28 ต้อง **EXTEND**:
  - `criticality ENUM('A','B','C') DEFAULT 'B'` ← ยังไม่มี 'D'
  - `status ENUM('active','inactive','disposed','under_repair')`
  - cols: code, qr_token, name, description, category, location, department, manufacturer, model, serial_number, purchase_date, warranty_expiry, responsible_user_id, department_id, location_id, floor_x/y, running_hours_month, work_zone_id, barcode, qr_code_path, image_path, instruction_manual, in_place_edit
  - **ยังไม่มี**: lifecycle_status, installation_date, commission_date, parent_asset_id, purchase cost, expected_life_months
- `machine_bom`, `iot_devices`, `scan_events` (Phase 24), `qr_print_log`, `asset_qr_codes`

### 3.2 Maintenance / Work Order (reuse ไม่สร้างทับ)
- `repair` (work order): source_type `enum('breakdown','pm','modify','build')`, status flow, `downtime_start/end/minutes`, cost_parts, cost_outsource, cost_labor, `actual_start_at`, `completed_at` → แหล่งข้อมูลจริงของ MTBF/MTTR/Downtime/Cost
- `repair_spare_parts` — อะไหล่ที่ใช้จริงต่อ WO
- `pm_am`, `pm_am_plans`, `maintenance_requests` — งาน PM

### 3.3 Failure / RCA (Phase 27) — reuse
- `failure_events` (id, event_code, asset_id, repair_id, failure_date, failure_type/mode/cause, severity, production_impact, downtime_minutes, description, repeat_suspected, rca_required, rca_id, ...)
- `rca`, `rca_why`, `rca_evidence` (append-only), `rca_measurements`, `rca_actions`, `rca_effectiveness_review`, `rca_action_links`
- Taxonomy: `failure_types`, `failure_modes`, `failure_causes`, `root_cause_categories`
- helper: `src/helpers/failure.php` — `failure_event_list`, `failure_rca_list`, config `failure_config()`, repeat-window ตรวจจับ "repeat_suspected" (ไม่เดาสาเหตุ)

### 3.4 Analytics / KPI (Phase 23) — reuse
- `src/helpers/kpi.php`: `kpi_parse_range`, `kpi_filters` (department/location/asset scope ตาม role), `kpi_scope`, `kpi_can_see_cost`, `kpi_active_statuses`, `kpi_done_statuses`, `kpi_core_metrics`, `kpi_downtime`, `kpi_cost`, `kpi_failure`, `kpi_asset_health`
- `src/helpers/analytics.php`: `ana_opts`, `ana_reliability_calc` (MTBF/MTTR จาก repair จริง), `ana_asset_health` (อธิบายได้ — คำนวณจากข้อมูลจริง), `ana_repeat_failures`, `ana_downtime_pareto`, `ana_pm_compliance`, `ana_cost_analytics`, `ana_data_quality`, `ana_overview`
- `mtbf_mttr` table = ค่าที่บันทึก manual (ไม่ใช่ค่าคำนวณ) — อย่าสับสน

### 3.5 Cost / Parts (Phase 26) — reuse
- `src/helpers/cost.php`: `cost_config`, `cost_summary`, `cost_trend`, `cost_by_asset`, `cost_wo_parts`, `cost_wo_breakdown`, `v_maintenance_cost` (VIEW — repair_id, asset_id, costs, downtime, parts)
- `spare_part_*`, `spare_issue_requests`, `supplier_*`

### 3.6 ผู้ใช้ / Org / Setting
- `users`, `roles`, `user_permissions`, `menu_permissions`, `audit_logs`/`audit_log`
- `settings` table (setting_key/setting_value/setting_group) + `src/config/settings_defaults.php` — pattern สำหรับเพิ่ม config Phase 28 (เช่น criticality weights, thresholds)
- `src/helpers/notification.php`: `sendNotificationToUser`, `getSettingValue`, `lineTemplateDefaults`, `sendLinePushMessage`
- `src/services/NotificationCenterService.php` — template module/event/push (ตัวอย่าง `rca/*`)
- `src/menu_catalog.php`, `src/bottom_nav_catalog.php` — การเพิ่มเมนูให้เข้า sidebar/bottom-nav
- `src/includes/sidebar.php` — sidebar ของ PHP; frontend ใช้ `frontend/components/dashboard/sidebar-nav.tsx`

## 4. Frontend Existing ที่จะ reuse / เชื่อม

- `frontend/lib/api.ts` — `apiFetch` (CSRF auto), `apiJson`, `useApiQuery` (react-query) ← ใช้ทุกหน้าใหม่
- `frontend/lib/i18n.ts` — `t()`, `usePageHero`, `statusText`, labels menu.*
- `frontend/components/ui/*` — Card, Select, Input, Alert, Dialog, Badge, Button, EmptyState, Skeleton, Tabs, DataTable(SAD)
- `frontend/components/PageShell`, `frontend/components/layout` (Grid)
- `frontend/app/(dashboard)/asset_registry/page.tsx` — CRUD ทะเบียน (route `/asset_registry`)
- `frontend/app/(dashboard)/asset_registry/view/page.tsx` — view asset (อยู่ที่ `/asset_registry/view?id=`?)
- `frontend/app/(dashboard)/asset_registry/criticality/page.tsx` — มีหน้ากำหนด criticality (A/B/C) แล้ว
- `frontend/app/(dashboard)/rca/...`, `frontend/app/(dashboard)/cost/...`, `frontend/app/(dashboard)/analytics/...` — หน้าปัจจุบัน
- `frontend/app/scan/page.tsx` (Phase 24 QR scan) — ต้องเพิ่มลิงก์ "ดู Reliability Profile" หลัง scan

## 5. ข้อจำกัด/กฎที่ใช้กับ Phase 28 (จาก spec + AGENTS.md)

1. **ห้าม duplicate** — ถ้า table/API/helper มีอยู่แล้ว ให้ REUSE หรือ EXTEND (เช่น criticality ENUM, reliability ana_*, failure_events, v_maintenance_cost)
2. **Sage 300 เป็น source of truth** ของราคาอะไหล่/สินค้า — ไม่สร้าง stock ใหม่
3. **ห้ามข้อมูลปลอม/เดา** mtbf/mttr/reliability/remaining-life — ถ้าข้อมูลไม่พอให้แสดง `INSUFFICIENT_DATA`
4. **ห้าม auto "ควรเปลี่ยนเครื่อง"** และห้าม auto-RCA conclusion — decision support ให้ข้อมูลประกอบการตัดสินใจ
5. ทุก transaction สำคัญ → audit (`audit_log()`)
6. RBAC เดิม (hardcode เฉพาะ backend) — UI ใช้ `useMenuPermission` ตรวจแสดง
7. Backward compatible — migration additive เท่านั้น (idempotent, ตรวจ information_schema)
8. Secrets อยู่ใน `.env` เท่านั้น
9. MTBF/MTTR ระดับ asset → คำนวณจาก `repair` จริง (source_type/breakdown + downtime) โดยใช้ metafunction เดียวกันกับ `ana_reliability_calc`

## 6. Gap Analysis (สิ่งที่ Phase 28 ต้องเพิ่ม ไม่ซ้ำของเดิม)

| # | ต้องเพิ่ม | เหตุผลที่ยังไม่มี |
|---|---|---|
| 1 | `asset_registry.lifecycle_status` + history append-only | spec ต้องการ Lifecycle Mgmt |
| 2 | `asset_registry.criticality` เพิ่ม `'D'` | spec เปลี่ยนเป็น A–D (extend enum, ไม่สร้างตารางใหม่ถ้าทำได้) |
| 3 | Criticality assessment (คะแนนจาก factors + review) | ระบบเดี๋ยวนี้แค่เลือก A/B/C เก็บใน enum เดียว |
| 4 | Asset parent/child relationship | เก็บ BOM แล้ว แต่ไม่มีความสัมพันธ์ parent → asset หลัก |
| 5 | Overhaul + Component Replacement tables | ยังไม่มี |
| 6 | Reliability ระดับ asset (score/trend profile พร้อม "อธิบายได้") | มี ana_* รวมระดับ fleet; ยังไม่มีหน้า "single asset reliability profile" |
| 7 | Lifecycle cost / LCC + decision support (data only) | ยังไม่มี |
| 8 | Data quality score ระดับ asset | `ana_data_quality` ทั้งระบบมี แต่อาจทำ per-asset |
| 9 | Aging dashboard, Remaining life (จากข้อมูลจริง: install_date + lifecycle + usage) | ยังไม่มี |
| 10 | Notifications: criticality review, lifecycle due, overhaul due | ยังไม่มี template |
| 11 | Menu เพิ่ม `asset_reliability/*` + RBAC | ยังไม่มี |
| 12 | Reports (asset profile/pdf/xlsx, critical assets, aging, replacement, etc.) | มี `reports.php` engine (rpt_*) ให้ reuse/เพิ่ม resource |

## 7. การตรวจสอบหลังเขียน (Acceptance)

- รัน `php scripts/apply_phase28_asset_reliability.php` (idempotent) + `php -l` ทุกไฟล์ใหม่
- เรียก API ผ่าน HTTP (session) หรือ smoke-test script ยืนยัน JSON shape
- `npm run typecheck` / `npm run lint` (ถ้ามี) ที่ `frontend/`
- เติมรหัสกรณีทดสอบลง `docs/PHASE_28_TEST_PLAN.md`