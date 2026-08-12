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

## [ ] Pending/Incomplete Features & Modules


## Documentation Files Indicating Project Status

- [x] `AGENTS.md`: Documents automation rules and tech stack.
- [x] `DESIGN.md`: Outlines UI/UX standards, Astryx usage, and PWA architecture.
- [x] `docs/PWA-GUIDE.md`: Likely details of the PWA implementation.
