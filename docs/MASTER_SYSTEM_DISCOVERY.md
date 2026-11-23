# MASTER SYSTEM DISCOVERY — CMMS-TPT

> Phase 0 · ตรวจสถานะระบบจริง ณ 2026-11-23 · **ไม่แก้โค้ด** · ที่มา: อ่าน source, `git`, `package.json`, `docs/PROJECT_CONTEXT.md`, รายงาน Phase C/D
> เอกสารนี้แทนการทำ baseline ซ้ำ — ตัวเลขที่วัดแล้วอ้างอิง `docs/MASTER_BASELINE.md`

## 1. Runtime จริง (ตรวจจาก repo)

| ชั้น | เทคโนโลยี | หลักฐาน |
|---|---|---|
| UI หลัก (canonical) | Next.js `^16.2.10` (App Router) + React 19 + TypeScript 5 | `frontend/package.json` |
| Styling FE | Tailwind CSS v4 (PostCSS, ไม่มี config ไฟล์) | `frontend/package.json`, `globals.css` |
| Styling legacy | Tailwind v3.4.17 (root, PHP pages) | `package.json`, `src/css/input.css` |
| Backend API | PHP 8.3 + PDO, JSON (`public/api/v1/*.php`) | 113 ไฟล์ |
| DB | MySQL `cmms_tpt` utf8mb4, 257 ตาราง (253 ใน `database/ci_schema_structure.sql`) | `docs/PROJECT_CONTEXT.md` §6 |
| Design System | CSS vars `--cmms-*` + primitives ภายใน (ไม่มี `@astryxdesign/core` ใน `frontend/package.json`) | §5 ของเอกสารนี้ |
| Charts | Recharts `^3.10.0` | `frontend/package.json` |
| Icons | lucide-react `^1.33.0` | `frontend/package.json` |
| Data fetching | TanStack Query `^5.101.4` (ใช้บางหน้า), fetch ตรงบางหน้า | `frontend/package.json` |
| Auth | PHP session (`src/auth.php`) + LINE Login/LIFF + CSRF (`src/csrf.php`) | โค้ด |
| Web server | IIS (PHP) + Next.js standalone port 3001 | `web.config`, `frontend/deploy.ps1`, `scripts/ensure-next.ps1` |
| Tunnel | zrok / ngrok / cloudflared (ตาม `.env`) | `src/helpers/*`, scripts |
| Test | Playwright `^1.62.1` + `@axe-core/playwright ^4.14.0` | 31 spec files |

## 2. ขนาดระบบ (นับจากไฟล์จริง 2026-11-23)

| ตัวชี้วัด | ค่า | คำสั่งที่ใช้ |
|---|---:|---|
| Route ทั้งหมด (`page.tsx`) | **265** | `find frontend/app -name page.tsx` |
| Route ใต้ `(dashboard)` | 255 | ตาม module ด้านล่าง |
| Route นอก shell | 10 (`login`, `register`, `install`, `change-password`, `scan`, `tv`, `qr-sheet`, `my-repairs`, `repair-request`, `repair`) | |
| API endpoint PHP | **113** (`public/api/v1`) + 1 (`api/auth/login.php`) | `ls public/api/v1/*.php` |
| React components | **104** `.tsx` (`frontend/components`) | |
| lib utilities/hooks | 49 ไฟล์ (`frontend/lib`) | |
| PHP helpers / services | 90 helpers + 12 services | `src/helpers`, `src/services` |
| ตาราง DB | 257 (รวม view `v_*`) | `docs/PROJECT_CONTEXT.md` |
| E2E specs | 31 ไฟล์ (213 tests เดิม + baseline/axe เพิ่ม) | `frontend/tests/e2e` |
| Demo pages ที่ต้องลบ | 2 (`/ui-demo`, `/ui-kit`) | `(dashboard)/ui-demo`, `ui-kit` |

**ข้อค้นพบ:** `docs/UI_MIGRATION.md` ระบุ 252 หน้า แต่ของจริง 265 → ตารางยังไม่ครอบ **13 route**: `dashboard/{backlog-aging,data-quality,facility,lubrication,pm-compliance,predictive-ai,production-impact,shift-handover,utility-energy,wallboard}`, `onboarding`, `ui-demo`, `ui-kit`

## 3. Module map (หน้า/โมดูล)

ดูรายละเอียดที่ `docs/MASTER_MODULE_INVENTORY.md` — สรุปจำนวนหน้า:

calibration 20 · reports 17 · dashboard 13 · reliability 13 · settings 13 · spare_parts 13 · pm_am 12 · knowledge 11 · repair 11 · workforce 11 · asset-reliability 10 · documents 9 · asset_registry 8 · analytics 6 · mtbf_mttr 6 · contractors 5 · engineering-changes 5 · rca 5 · supervisor 5 · inspections 4 · users 4 · field 3 · forms 3 · manuals 3 · roles 3 · safety 3 · suppliers 3 · equipment_borrowing 3 · approval 2 · assets 2 · editor 2 · iot 2 · notifications 2 · pages 2 · planning 2 · shutdown 2 · อื่น ๆ 1 หน้า/โมดูล (alert-center, andon-board, audit-log, budget, cost, facility-layout, feedback, home, onboarding, predictive-maintenance, process-flows, profile, spare-reorder, sync-center)

## 4. API surface

- 113 endpoint แบ่งตามโมดูล (asset 16, repair 7, spare 10, reliability 8, calibration 3, knowledge 1, workforce 1, reports 4, settings/system 15, อื่น ๆ)
- กลไกสิทธิ์: `src/helpers/api_permissions.php` (`API_ENDPOINT_PERMISSIONS`) → บังคับใช้ผ่าน `requireLogin()` → `api_enforce_endpoint_permission()`
- **บังคับใช้จริงเพียง 5 endpoint**: `users.php`, `roles.php`, `import_excel.php`, `sage_sync.php`, `sage_shipments.php`
- **16 endpoint ยังไม่มีในเมทริกซ์**: `asset_hub`, `asset_meters`, `data_quality`, `facility`, `facility_layout`, `global_search`, `lubrication`, `my_permissions`, `my_repairs`, `permission_diff`, `predictive_ai`, `predictive_maintenance`, `production_impact`, `shift_handover`, `spare_reorder`, `utility_energy`

## 5. Design System ที่มีอยู่จริง

| สิ่งที่มี | ที่อยู่ |
|---|---|
| Design spec v3 (tokens/typography/layout pattern) | `docs/DESIGN_SYSTEM.md` (360 บรรทัด) |
| Layout primitives | `frontend/components/layout/` — `PageHeader`, `DetailHeader`, `KpiStrip`, `ListToolbar`, `InfoGrid`, `FormPage/Section/Actions`, `HubGrid/HubCard`, `Breadcrumb`, `EmployeeAvatar` |
| UI primitives | `frontend/components/ui/` — button, input, select, checkbox, dialog, tabs, table, badge, card, alert, empty-state, pagination, os-table, form-field, switch, skeleton |
| Component inventory contract | `docs/CMMS_COMPONENT_MAP.md`, `docs/DESIGN_SYSTEM.md` §9 |
| Charts | `frontend/components/charts/`, `ChartTip`/`Legend` (extracted — commit `7a6d1f4d`) |
| Domain components | `StatusChip`, `PriorityChip`, `AndonBadge`, `AndonLamp`, `WorkActions`, `ToastProvider`, `CommandPalette`, `NotificationBell` |

**ยังไม่มี:** `docs/COMPONENT_LIBRARY.md`, `docs/DESIGN_TOKENS.md` (Phase 2 deliverable)

## 6. Auth / Authorization

- Session-based (PHP) + CSRF ทุก mutation (`src/csrf.php`, Origin/Referer check)
- Permission 2 ชั้น: `menu_permissions` (เมนู, role × menu_key) + `user_permissions`/`PERMISSION_MATRIX` (module × action)
- Role จริงใน DB: 1 Admin, 2 Manager, 3 Operate, 4 Operator, 5 Viewer, 6 Asst.Manager, 7 Foreman, 8 Officer, 9 User, 10 Officer-Read
- Role helper ฝั่ง server: `src/helpers/roles.php` (`canSupervisor`, `canReviewRequest`, `canPlanWork`, `canVerifyWork`, `isTechnician`, `canApproveType`)
- Frontend gating: `useCan`, `useMenuPermission`, `route-perms.ts`, `can` flags จาก API
- รายละเอียดเต็ม: `docs/MASTER_ROLE_PERMISSION_MATRIX.md`

## 7. Notification integrations (ของเดิม — ห้ามแก้จนกระทบ)

PWA Web Push (`WebPushService`, `push_subscribe.php`, `frontend/lib/push.ts`) · Email (`NotificationService::sendEmail`) · LINE (`src/helpers/notification.php`, `line_webhook.php`, LIFF) · Telegram · MS Teams webhook · ntfy (`src/helpers/ntfy.php`) · `notification_logs` table + `notifications`/`notification_events`/`notification_templates`

## 8. PWA / Offline

`manifest.json` · `frontend/public/sw.js` · `PwaRegister.tsx` · `frontend/lib/offline/`, `offline-store.ts`, `offlineQueue.ts` · `ConnectivityStatus.tsx` · หน้า `/repair/view` มี offline snapshot
⚠️ ยังไม่มีหลักฐานว่า offline **เขียน/ซิงก์กลับ** ได้จริง (queue มีโค้ด แต่ยังไม่ผ่าน E2E) — ห้ามอ้างว่าทำได้จนทดสอบ

## 9. ข้อจำกัด / ความเสี่ยงก่อนเริ่มพัฒนา

| # | ความเสี่ยง | ผลกระทบ | หลักฐาน |
|---|---|---|---|
| R1 | Production รัน BUILD_ID เก่า (`htWEsqvUdXnCZgebfn3yN`) ห่างจาก HEAD 18 commit | งาน design/Phase C/D ยังไม่ขึ้นจริง | `frontend/.next/BUILD_ID`, `docs/STATUS.md` |
| R2 | 18 commit ยังไม่ push; working tree มีงานค้าง (D3.2 + Phase C/D) | เสี่ยงงานหาย/รวม branch ยาก | `git log origin/main..HEAD` |
| R3 | API 108/113 endpoint ไม่ถูกบังคับสิทธิ์เชิง endpoint | ช่องโหว่สิทธิ์ระดับ API (มี guard เดิมบางส่วน) | `docs/API_PERMISSION_MATRIX.md` |
| R4 | ข้อมูลจริงยังไม่พอ: `pm_am`=0, `repair` completed=0, `mtbf_mttr` downtime 0 | dashboard/PM หลายตัวแสดง INSUFFICIENT DATA | `docs/STATUS.md` §6 |
| R5 | ไม่มี Staging environment | ห้าม deploy ตามกติกา | ยังไม่มีโฟลเดอร์/env staging |
| R6 | TLS/HTTPS ยังไม่เปิด (I-01) | Web Push ทดสอบไม่ได้, ความปลอดภัยต่ำ | `docs/IMPROVEMENT_BACKLOG.md` |
| R7 | 9 บัญชี `e2e_*` มี `is_active=0` | E2E ที่ต้อง login จริงจะ skip/fail | `docs/STATUS.md` §5 |
| R8 | ไฟล์ชั่วคราวค้าง (`frontend/tmp-*.cjs` 3, `tests/e2e/tmp-*.spec.ts` 3) | สัญญาณ repo ไม่สะอาด | `git status` |

## 10. สิ่งที่ **ไม่** ทำในเฟสนี้

- ไม่วัด Lighthouse/axe ใหม่ (ใช้ค่าที่มีใน `MASTER_BASELINE.md`)
- ไม่แก้ DB schema, API contract, logic, auth
- ไม่ deploy / ไม่ push
