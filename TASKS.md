# CMMS Project Tasks

This document outlines the current status of features and modules within the CMMS project, based on a deep scan of the codebase.

## [x] Completed Features & Modules

- [x] **PHP REST API - Core Infrastructure:**
  - Database connection and utility (`src/config/db.php`)
  - User authentication and session management (`src/auth.php`)
  - Robust error handling and JSON output for API responses
  - `isFeatureEnabled` function for modular feature toggling (`src/includes/layout.php`)
- [x] **PHP REST API - Asset Management:**
  - Comprehensive CRUD operations for asset registration (`public/api/v1/asset_registry.php`)
  - Automatic foreign key cleanup for related tables on asset deletion
- [x] **PHP REST API - Repair Management:**
  - Full CRUD operations for managing repair requests (`public/api/v1/repair.php`)
  - Automatic generation of work order numbers (`generateWorkOrderNo()`)
  - Anonymous POST request support for public repair forms (LINE LIFF integration)
  - Integration with `src/helpers/notification.php` for LINE notifications on new repair requests
- [x] **PHP REST API - Inspection & Preventive Maintenance (PM):**
  - Complete "Checklist Engine API" (`public/api/v1/inspections.php`)
  - Template Management (CRUD for inspection templates)
  - Item Management (CRUD for checklist items)
  - Schedule Management (creating, listing, retrieving, deleting inspection schedules)
  - Result Submission (submitting inspection results, marking schedules as 'pass' or 'fail')
  - Automated Repair Creation (generating new repair work orders on inspection failure)
  - Automated Schedule Generation (creating next inspection schedule based on frequency)
  - Failure Notifications (`notifyInspectionFail` for LINE Push and Email)
- [x] **PHP REST API - Job Queue:**
  - Functionality to process 'pending' jobs from a queue and mark them as 'completed' (`src/services/JobQueueService.php`)
- [x] **PHP REST API - Dispatch & Approval:**
  - Filters requests by status (`src/services/DispatchService.php`)
  - Manages approval processes (`src/services/ApprovalService.php`)
- [x] **PHP REST API - Audit Trail:**
  - Logging actions and modules for auditing purposes (`src/services/AuditTrailService.php`)
- [x] **Astryx Design System Implementation:**
  - Extensive integration of `@astryxdesign/core` for consistent UI components and styling
  - `tailwind.config.js` shows mappings of Astryx semantic tokens to Tailwind utility classes
  - `frontend/app/globals.css` demonstrates numerous Astryx component overrides
  - Dedicated Astryx stylesheets (`css/astryx.css`, `css/astryx-reset.css`, `css/astryx-theme-neutral.css`)
  - `src/includes/header.php` mentions "Topbar Header (Astryx TopNav)"
  - Presence of Astryx-themed charting and data visualization components (`astryx-main/packages/vega`)
- [x] **PWA App Shell Architecture:**
  - `DESIGN.md` explicitly states the implementation of an App Shell
  - `manifest.json` for PWA configuration
  - `docs/PWA-GUIDE.md` for PWA documentation
- [x] **Automation Rules:**
  - `AGENTS.md` documents Telegram Notifications (task start/finish) and Auto-Git Push
- [x] **AI Copilot Advanced Capabilities:**
  - Expand `src/services/AICopilotService.php` with more sophisticated AI/ML models for true predictive maintenance, advanced diagnostics, or natural language processing. The current logic is simplistic and could be enhanced.
- [x] **Full Utilization of New Database Fields:**
  - Integrate and fully utilize `completed_at`, `completed_by`, and `reschedule_reason` fields (added in `database/apply_alter.php`) across the frontend, reporting, and other API endpoints. This includes developing UI for rescheduling and reports using these new fields.
- [x] **Configurable Mobile Bottom Nav (per Role):**
  - Database table `bottom_nav_config` (role_id, menu_key, sort_order) with FK cascade + migration file
  - Central catalog `src/bottom_nav_catalog.php` (13 menu keys: label/href/pattern/icon + default presets for 5 roles)
  - Resolver `src/bottom_nav.php` (`resolveBottomNavKeys()`: reads table → filters unknown keys → falls back to defaults; DB error → defaults)
  - API `menu_permissions.php`: GET matrix returns `bottom_nav` + `bottom_nav_keys`; GET by role/user returns filtered bottom nav; POST upserts grants + bottom nav in one transaction (optional key = leave unchanged)
  - PWA: `useMenuPermission.ts` exposes `bottomNavKeys`; `layout.tsx` renders API keys first, always filtered by `canShow`; PHP `footer.php` uses the same catalog/resolver (shared config between PWA and PHP)
  - Settings UI (`/settings/menus`): per-role editor (add/remove/reorder) + live phone preview pane; warns when exceeding 5 buttons
- [x] **Security Hardening (2026-08-12):**
  - CSRF Protection ทั้งระบบ (`src/csrf.php`): token-based + Origin/Referer check — ครอบคลุมทุก API (POST/PUT/DELETE ผ่าน `requireLogin`), ทุกหน้า PHP ที่ POST (ผ่าน `layout.php`), และฟอร์มสำคัญ (login, approve, bind_line, request)
  - Login hardening: `session_regenerate_id()` หลัง login สำเร็จ + session cookie HttpOnly/SameSite=Lax
  - ลบ Telegram Bot Token ที่รั่วออกจาก `AGENTS.md` (ให้ revoke ที่ @BotFather + ลบประวัติ git)
  - ลบ IP/URL dev ที่ฝังตายตัว (`192.168.1.9`, ngrok URL, `C:\cloudflared` path) — อ่านจาก env/settings แทน (`APP_URL`, `ALLOWED_ORIGINS`, `NGROK_STATIC_URL`, `CLOUDFLARE_LOG_PATH`)
  - ป้องกันรายงานรั่ว: `export_excel.php` / `monthly_pdf.php` ต้อง login ก่อนเข้าถึง
- [x] **Bug Fixes & Data Integrity (2026-08-12):**
  - แก้ `$availabilityRate` undefined variable ใน dashboard (แสดงค่า Availability ได้จริง)
  - รวมเลขใบงานเป็น format เดียว: `EN-{YYMM}-{NNN}` (เดิม 2 ระบบ `EN-26-095` vs `EN-2608-001`)
  - ลบค่า fallback จำลองใน dashboard/รายงาน (12.5 ชม., ฿45,800, ฿150,000) — คำนวณจากข้อมูลจริง
  - `NotificationService::sendEmail()` คืนค่า `$sent` จริง (เดิมคืน true เสมอ)
  - `logNotification()` ย้ายไปตาราง `notification_logs` (ใหม่) ไม่ปน `sage_sync_log` + migration
  - แก้ `settings/security.php` ยิง seed ข้อมูลซ้ำทุกครั้งที่เปิดหน้า (seed เฉพาะตารางว่าง)
- [x] **Automated Backup Script (2026-08-12):**
  - `scripts/backup.sh`: dump MySQL (mysqldump + gzip) + tar uploads + ลบ backup เก่าอัตโนมัติ (BACKUP_RETENTION_DAYS)
- [x] **Auto-Restart & Watchdog (2026-08-12):**
  - `scripts/ensure-next.ps1`: ตรวจว่า Next.js server (:3001) ตอบ 200 หรือไม่ — ถ้าไม่รัน สตาร์ท standalone server + รอ ready (idempotent, ใช้ได้กับ Scheduled Task)
  - `scripts/watchdog.ps1` + Scheduled Task `CMMS-Watchdog` (รันทุก 1 นาที, SYSTEM): เช็ค :3001 → ลองซ้ำ → restart ผ่าน ensure-next → ยังไม่ขึ้นแจ้งเตือน LINE (ผ่าน `watchdog-notify.php`) + ตรวจ tunnel URL (tunnel-url.txt) restart tunnel ถ้าตาย
  - `scripts/tunnel-quick.ps1` + Scheduled Task `CMMS-TunnelQuick` (onstart): restart trycloudflare tunnel -> localhost:3001 หลังรีบูต + บันทึก URL ใหม่ลง logs/tunnel-url.txt
  - `scripts/setup-tunnel.ps1`: ตั้งค่า Cloudflare named tunnel ถาวร (login → create tunnel → config.yml → service) — ต้องมี domain ใน Cloudflare เอง
  - สคริปต์ทั้งหมด encode UTF-8 with BOM (PowerShell 5.1 อ่านภาษาไทยถูกต้อง)
- [x] **Report Export Improvements (2026-08-12):**
  - `export_excel.php`: รองรับ type=repair|spare_parts|assets + กรองช่วงวันที่ + คำนวณข้อมูลจริง
  - `monthly_pdf.php`: ป้องกันการเข้าถึงโดยไม่ login + ไม่มีค่า fake
- [x] **Global UX/UI Polish (2026-08-12):**
  - Quick Search (Ctrl/Cmd+K) ใช้งานได้จริง: กรองเมนู sidebar แบบสด + คีย์บอร์ด (↑↓/↵/ESC) + ไฮไลต์ผลแรก — ดัชนีสร้างจาก sidebar จริง
  - Dark/Light Mode toggle ใน topbar (desktop + mobile app bar) + เคารพค่า system preference + script ป้องกัน FOUC ใน `<head>`
  - Sidebar กลุ่มเมนูยุบ-ขยายได้ (accordion) จำสถานะใน localStorage + ครั้งแรกยุบอัตโนมัติยกเว้นกลุ่มที่เปิดอยู่
  - Toast ใหม่: slide-in + icon + title + progress bar + ปิดเองได้ (แทน `animate-bounce` เดิม)
  - `public/css/ui-polish.css` (ใหม่): focus-visible ring, selection, page fade-in, card hover, empty state, dark-mode fix สำหรับ utility เก่า (slate/white), print styles, reduced-motion, mobile tap target
  - เติม utility ที่ใช้แต่หายจาก build: `shadow-xs`, `rounded-container`, `no-scrollbar`, `backdrop-blur-xs`
  - Login page: ปุ่มแสดง/ซ่อนรหัสผ่าน
- [x] **PWA Frontend UX/UI Polish (2026-08-12):**
  - Global boundaries ใน `(dashboard)`: `loading.tsx` (skeleton ทุก navigation), `error.tsx` (error boundary + retry + Error ID), `not-found.tsx`
  - ระบบ Toast กลาง `components/ToastProvider.tsx` + `useToast()` — migrate 12 หน้าที่ copy-paste toast ซ้ำซ้อน (repair/assign, repair/tracking, inspections ×3, pm_am/checksheet, pm_am/batch_schedule, asset_registry/bom_tree, asset_registry/criticality, spare_parts/issue_center, spare_parts/sage_po, safety/work_permit) — ลบ state + setTimeout + div ฝัง style ออกทั้งหมด
  - Command Palette (Ctrl/Cmd+K) `components/CommandPalette.tsx` — ค้นหาเมนูแบบสด จัดลำดับตามสิทธิ์ (ใช้ SideNav + bottom nav) + คีย์บอร์ด ↑↓/↵/ESC
  - `globals.css`: toast styles, skeleton shimmer, focus-visible ring, selection, route transition, print, reduced-motion, palette styles
  - ทดสอบจริงบน production build (`next build` + `next start`): toast 3 แบบ + auto-dismiss, palette เปิด/กรอง/คีย์บอร์ด/ปิด ผ่านทั้งหมด
- [x] **UI Redesign Plan Steps 0–2, 7, 10, 12-partial (2026-08-23):**
  - Step 0: `.form-section` family (ui-polish.css §11) + Playwright e2e smoke harness
  - Step 1 (PWA): PageShell `eyebrow` prop + sweep 52 pages — design-audit `--strict` PASS 0 WARN; pre-push hook unblocked
  - Step 7: `.status-*` / `.priority-*` semantic badge palette (ui-polish.css §12, light-dark aware) + `src/components/badge.php` helper + migrate ~30 PHP pages off raw Tailwind colors
  - Step 2: ทุก listing table → `.data-table.cmms-stack-table` + `data-label` ครบทุก td (37 tables / 35 pages) — อ่านได้บน 360px
  - Step 10: `.cmms-skeleton` / `.cmms-spinner` / `.cmms-empty-state(-cell)` + migrate 30 empty cells
  - Step 12 partial: viewport เปิด pinch-zoom (WCAG 1.4.4) + input ≥16px กัน iOS auto-zoom
  - Visual regression harness: screenshots 28 PWA routes × 2 viewports (authed shots env-gated)
  - Dark-mode hex debt: assessed — hex ที่เหลือใน frontend เป็นของ legit (PDF/print docs, LINE template defaults, theme engine, GrapesJS canvas)

## [ ] Pending/Incomplete Features & Modules


## Documentation Files Indicating Project Status

- [x] `AGENTS.md`: Documents automation rules and tech stack.
- [x] `DESIGN.md`: Outlines UI/UX standards, Astryx usage, and PWA architecture.
- [x] `docs/PWA-GUIDE.md`: Likely details of the PWA implementation.
